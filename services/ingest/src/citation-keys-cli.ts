/**
 * `pnpm --filter @lawmind/ingest citation-keys` — build and maintain
 * `judgment_citation_keys`, the resolver's lookup index.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACES, AND WHY REPLACING IT WAS NOT OPTIONAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `resolve-cli.ts` built its lookup index inline on every run — `judgments ×
 * unnest(reporter_citations)` UNION neutral citations UNION aliases, a LATERAL
 * `regexp_matches` over every one of those strings, then `GROUP BY` the lot —
 * and the same CTE appears in four statements, so `--apply --external`
 * materialised it four times. Written against 38,341 judgments. The corpus is
 * now 7,296,068, and NEW1 measured the result as a 16.4-hour query blocking a
 * second copy of itself (bus 0523).
 *
 * **Rerunning it locally would not have helped.** Local disk is faster than the
 * Railway proxy was, and 190x is not a constant factor you outrun; the work
 * itself is wrong. The keys change only when judgments or aliases change, so
 * they belong in a table maintained incrementally.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WALK: `(created_at, id)` KEYSET, NEVER `OFFSET`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `OFFSET` on a mutable table is not slow, it is WRONG: rows land while the walk
 * runs, every later page shifts, and the skipped rows are skipped silently.
 *
 * The tuple is not decoration either, and this repo has already paid for
 * learning that (`paragraphs-cli.ts`). `created_at` defaults to `now()` and the
 * loaders commit in batches, so **the largest measured group of rows sharing one
 * `created_at` is 100** — exactly one batch. A plain `created_at > cursor` would
 * skip up to 100 rows at every page boundary; `>=` would loop on them forever.
 * `(created_at, id)` is unique and totally ordered, so it can do neither.
 *
 * `created_at` and not `id`: `judgments.id` is a uuid v4, so an id watermark
 * would silently skip newly-harvested rows landing below it — the exact class of
 * failure `CITATION_HARNESS` exists to prevent one table earlier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INCREMENTAL, AND WHAT "INCREMENTAL" IS ALLOWED TO MEAN HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A resumed run continues from the checkpoint; a later run picks up whatever has
 * been harvested since, because the cursor is a `created_at` and new rows are
 * always above it. That covers INSERTS, which is how this corpus grows.
 *
 * **It does not cover an UPDATE to an existing judgment's citations**, and
 * pretending otherwise would be the dangerous kind of wrong — a stale key that
 * still resolves is invisible. `--rebuild` drops and re-derives everything, and
 * `--judgment <uuid>` re-derives one. Say which you mean; nothing here guesses.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const REBUILD = process.argv.includes('--rebuild');
const ONE_JUDGMENT = (() => {
  const i = process.argv.indexOf('--judgment');
  return i === -1 ? null : (process.argv[i + 1] ?? null);
})();
const PAGE = Number(process.env['CITATION_KEYS_PAGE'] ?? 20_000);

/**
 * The fleet's stop switch, honoured here for the same reason as `enrich-cli.ts`:
 * this is a high-write background program, and a freeze that some workers
 * observe and others do not is not a freeze. Checked BEFORE the database is
 * reached, so a launcher started during a freeze opens no connection at all.
 */
const STOP_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.checkpoints', 'STOP');
function stopIfRequested(): void {
  if (!existsSync(STOP_FILE)) return;
  console.log(
    `PAUSED by ${STOP_FILE} at a page boundary — the checkpoint is written, so a ` +
      `relaunch resumes from here and re-derives nothing. Delete the file to resume.`,
  );
  process.exit(0);
}
stopIfRequested();

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 2,
  idle_timeout: 30,
});

type Checkpoint = { cursorAt: string; cursorId: string; scanned: number; updatedAt: string };
const CHECKPOINT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.checkpoints');
const CHECKPOINT_FILE = join(CHECKPOINT_DIR, 'citation-keys.json');
const EPOCH = { cursorAt: '1970-01-01T00:00:00.000Z', cursorId: '00000000-0000-0000-0000-000000000000' };

function readCheckpoint(): Checkpoint | null {
  if (REBUILD || ONE_JUDGMENT) return null;
  if (!existsSync(CHECKPOINT_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8')) as Partial<Checkpoint>;
    /* A malformed checkpoint must not be HALF believed. Walking from the epoch
     * costs time; resuming from a cursor that was only partly parsed skips rows
     * and reports success. */
    if (typeof raw.cursorAt !== 'string' || typeof raw.cursorId !== 'string') return null;
    return {
      cursorAt: raw.cursorAt,
      cursorId: raw.cursorId,
      scanned: typeof raw.scanned === 'number' ? raw.scanned : 0,
      updatedAt: raw.updatedAt ?? 'unknown',
    };
  } catch {
    return null;
  }
}

function writeCheckpoint(c: Omit<Checkpoint, 'updatedAt'>): void {
  try {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
    writeFileSync(CHECKPOINT_FILE, JSON.stringify({ ...c, updatedAt: new Date().toISOString() }, null, 2));
  } catch (err) {
    /* A checkpoint that cannot be written is a slow restart, not a wrong one. */
    console.log(`    checkpoint write failed (${err instanceof Error ? err.message : String(err)}) — continuing`);
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE PAGE OF JUDGMENTS → THEIR KEYS, DERIVED IN SQL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The derivation stays in the database because the rows never need to cross the
 * wire — the same reasoning that kept the old CTE server-side. What changed is
 * the SCOPE: this runs over one bounded page, not over the corpus.
 *
 * `[0-9]` and never `\d`. Measured in `resolve-cli.ts`: a backslash does not
 * survive the trip from a JS tagged template through the driver to PostgreSQL,
 * the LATERAL then matched nothing, and it failed SILENTLY as an empty match set
 * rather than as an error — so the year guard built on it would have looked like
 * a guard that simply never had to fire.
 */
const YEAR_RE = '(1[89][0-9][0-9]|20[0-9][0-9])';

async function derivePage(cursorAt: string, cursorId: string) {
  return sql<{ created_at: string; id: string; n: number }[]>`
    WITH page AS (
      SELECT id, created_at, neutral_citation, reporter_citations
      FROM judgments
      WHERE (created_at, id) > (${cursorAt}::timestamptz, ${cursorId}::uuid)
      ORDER BY created_at, id
      LIMIT ${PAGE}
    ),
    forms AS (
      SELECT p.id AS judgment_id, 'neutral'::text AS source, p.neutral_citation AS source_text
      FROM page p
      WHERE p.neutral_citation IS NOT NULL AND p.neutral_citation <> ''
      UNION ALL
      SELECT p.id, 'reporter'::text, rc
      FROM page p, unnest(p.reporter_citations) rc
      WHERE rc IS NOT NULL AND rc <> ''
    ),
    keyed AS (
      SELECT f.judgment_id,
             f.source,
             f.source_text,
             upper(regexp_replace(f.source_text, '[^A-Za-z0-9]', '', 'g')) AS citation_key,
             coalesce(
               (SELECT array_agg(DISTINCT m[1])
                FROM regexp_matches(f.source_text, ${YEAR_RE}, 'g') AS m),
               '{}'::text[]
             ) AS years
      FROM forms f
    ),
    ins AS (
      INSERT INTO judgment_citation_keys (citation_key, judgment_id, source, source_text, years)
      SELECT citation_key, judgment_id, source, source_text, years
      FROM keyed
      WHERE length(citation_key) BETWEEN 1 AND 512
        AND length(source_text) <= 512
      -- The builder is resumable and therefore re-visits rows on an overlapping
      -- restart. A duplicate would not corrupt anything; it would give a key two
      -- targets, and a two-target key is one the resolver REFUSES — a suppressed
      -- correct resolution, which is far harder to notice than a wrong one.
      ON CONFLICT (citation_key, judgment_id, source, source_text) DO NOTHING
      RETURNING 1
    )
    SELECT max(p.created_at)::text AS created_at,
           (SELECT id::text FROM page ORDER BY created_at DESC, id DESC LIMIT 1) AS id,
           (SELECT count(*)::int FROM page) AS n
    FROM page p`;
}

/** Rows the CHECK constraints would have refused. Counted, never silently dropped. */
async function countOversized(cursorAt: string, cursorId: string) {
  const [r] = await sql<{ n: number }[]>`
    WITH page AS (
      SELECT id, created_at, neutral_citation, reporter_citations
      FROM judgments
      WHERE (created_at, id) > (${cursorAt}::timestamptz, ${cursorId}::uuid)
      ORDER BY created_at, id
      LIMIT ${PAGE}
    ),
    forms AS (
      SELECT p.neutral_citation AS t FROM page p WHERE p.neutral_citation IS NOT NULL
      UNION ALL
      SELECT rc FROM page p, unnest(p.reporter_citations) rc WHERE rc IS NOT NULL
    )
    SELECT count(*)::int AS n FROM forms
    WHERE length(t) > 512
       OR length(upper(regexp_replace(t, '[^A-Za-z0-9]', '', 'g'))) NOT BETWEEN 1 AND 512`;
  return r?.n ?? 0;
}

/**
 * Aliases are walked separately and completely, not paged with the judgments.
 * `judgment_citation_aliases` is four thousand rows against seven million, and
 * the cost of re-deriving all of them is a rounding error next to the cost of a
 * second cursor that can fall out of step with the first.
 */
async function deriveAliases() {
  const r = await sql`
    INSERT INTO judgment_citation_keys (citation_key, judgment_id, source, source_text, years)
    SELECT a.alias_key,
           a.judgment_id,
           'alias',
           a.alias,
           coalesce(
             (SELECT array_agg(DISTINCT m[1])
              FROM regexp_matches(a.alias, ${YEAR_RE}, 'g') AS m),
             '{}'::text[]
           )
    FROM judgment_citation_aliases a
    WHERE length(a.alias_key) BETWEEN 1 AND 512 AND length(a.alias) <= 512
    ON CONFLICT (citation_key, judgment_id, source, source_text) DO NOTHING`;
  return r.count;
}

async function main() {
  console.log('CITATION KEY INDEX');
  console.log('='.repeat(74));

  if (ONE_JUDGMENT) {
    // The UPDATE path. Delete-then-derive, because an edited judgment's OLD keys
    // are exactly the rows that must not survive — a stale key that still
    // resolves is the failure nobody sees.
    await sql`DELETE FROM judgment_citation_keys WHERE judgment_id = ${ONE_JUDGMENT}::uuid AND source <> 'alias'`;
    const [row] = await sql<{ created_at: string; id: string }[]>`
      SELECT (created_at - interval '1 microsecond')::text AS created_at, id::text
      FROM judgments WHERE id = ${ONE_JUDGMENT}::uuid`;
    if (!row) {
      console.error(`no judgment ${ONE_JUDGMENT}`);
      process.exit(1);
    }
    // A one-row page: the cursor sits one microsecond before it, and PAGE is
    // irrelevant because the id tuple bounds it.
    const before = row.created_at;
    const r = await sql`
      INSERT INTO judgment_citation_keys (citation_key, judgment_id, source, source_text, years)
      SELECT upper(regexp_replace(t, '[^A-Za-z0-9]', '', 'g')), j.id, s, t,
             coalesce((SELECT array_agg(DISTINCT m[1]) FROM regexp_matches(t, ${YEAR_RE}, 'g') AS m), '{}'::text[])
      FROM judgments j,
           LATERAL (
             SELECT 'neutral'::text AS s, j.neutral_citation AS t
             WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
             UNION ALL
             SELECT 'reporter'::text, rc FROM unnest(j.reporter_citations) rc WHERE rc <> ''
           ) f(s, t)
      WHERE j.id = ${ONE_JUDGMENT}::uuid
        AND length(t) <= 512
        AND length(upper(regexp_replace(t, '[^A-Za-z0-9]', '', 'g'))) BETWEEN 1 AND 512
      ON CONFLICT (citation_key, judgment_id, source, source_text) DO NOTHING`;
    console.log(`judgment ${ONE_JUDGMENT} (created_at ${before}): ${r.count} key(s) re-derived`);
    return;
  }

  if (REBUILD) {
    // TRUNCATE, not DELETE: this table is derived and can hold tens of millions
    // of rows, and a DELETE would leave that much dead tuple behind for
    // autovacuum to chase during the rebuild that follows it.
    console.log('--rebuild: truncating judgment_citation_keys');
    await sql`TRUNCATE judgment_citation_keys`;
  }

  const resumed = readCheckpoint();
  let cursorAt = resumed?.cursorAt ?? EPOCH.cursorAt;
  let cursorId = resumed?.cursorId ?? EPOCH.cursorId;
  let scanned = resumed?.scanned ?? 0;
  console.log(
    resumed
      ? `resuming from ${CHECKPOINT_FILE}\n  cursor ${cursorAt} · ${scanned.toLocaleString()} judgments scanned in earlier runs (updated ${resumed.updatedAt})`
      : `no checkpoint — walking from the epoch, page ${PAGE.toLocaleString()}`,
  );

  const started = Date.now();
  let oversized = 0;
  for (;;) {
    stopIfRequested();
    oversized += await countOversized(cursorAt, cursorId);
    const [page] = await derivePage(cursorAt, cursorId);
    const n = page?.n ?? 0;
    if (n === 0) break;

    cursorAt = page!.created_at;
    cursorId = page!.id;
    scanned += n;
    writeCheckpoint({ cursorAt, cursorId, scanned });

    const rate = scanned / Math.max((Date.now() - started) / 1000, 1);
    console.log(
      `  ${scanned.toLocaleString().padStart(12)} judgments · cursor ${cursorAt} · ${rate.toFixed(0)}/s`,
    );
  }

  const aliases = await deriveAliases();
  console.log(`\naliases: ${aliases.toLocaleString()} key rows inserted`);
  if (oversized > 0) {
    console.log(
      `SKIPPED ${oversized.toLocaleString()} citation forms over 512 characters — extraction ` +
        `garbage, not citations. Counted rather than dropped silently.`,
    );
  }

  const [total] = await sql<{ rows: number; keys: number; judgments: number }[]>`
    SELECT count(*)::int AS rows,
           count(DISTINCT citation_key)::int AS keys,
           count(DISTINCT judgment_id)::int AS judgments
    FROM judgment_citation_keys`;
  console.log(
    `\njudgment_citation_keys: ${total?.rows?.toLocaleString()} rows · ` +
      `${total?.keys?.toLocaleString()} distinct keys · ${total?.judgments?.toLocaleString()} judgments`,
  );
}

try {
  await main();
} finally {
  await sql.end();
}
