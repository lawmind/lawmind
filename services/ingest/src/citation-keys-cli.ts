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
 * `(${x}::text)::timestamptz` AND NEVER `${x}::timestamptz` — READ THIS BEFORE
 * "SIMPLIFYING" IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **postgres.js truncates a timestamptz bind parameter to MILLISECONDS.** Given
 * `${'2026-08-17 16:46:59.812119+00'}::timestamptz` the driver infers the
 * parameter type from the cast, routes the string through a JavaScript `Date` —
 * which has millisecond resolution — and PostgreSQL receives
 * `2026-08-17 16:46:59.812`. Measured, on this database:
 *
 *     SELECT ${AT}::timestamptz::text          ->  2026-08-17 16:46:59.812+00
 *     SELECT (${AT}::text)::timestamptz::text  ->  2026-08-17 16:46:59.812119+00
 *
 * `judgments.created_at` carries full microseconds, so the truncated cursor sits
 * strictly BEFORE the rows it was supposed to have passed. Those rows then
 * satisfy `created_at > cursor` on the very next page — whatever their id,
 * because the tuple comparison never reaches the id once the timestamps differ.
 * **The page returns the same rows for ever and the walk does not terminate.**
 *
 * This is not theoretical. A `--recheck` over a range holding roughly 75,000
 * judgments reported **266,124,061 judgments re-walked** with its cursor frozen
 * at the range's last timestamp, and had to be killed. It is very probably also
 * what LCC saw on 24 Aug (bus 1110) and read as "following new inserts one row at
 * a time": a finite job that reaches the end of its input and never stops.
 *
 * **It cannot skip a row** — truncation moves the cursor backwards, so the
 * failure is re-reading and non-termination, never data loss, and
 * `ON CONFLICT DO NOTHING` absorbs the duplicates. That is the only reason this
 * cost time rather than correctness.
 *
 * Casting the parameter to `text` first makes the driver send it as text and
 * lets PostgreSQL do the parse, at full precision. Every timestamptz parameter
 * in this file is written that way, including the one in `publishFrontier` —
 * which otherwise publishes a cursor up to a millisecond behind the file.
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
 * `--recheck <fromISO> <toISO>` — re-walk a bounded `created_at` range WITHOUT
 * touching the checkpoint or the published frontier.
 *
 * This exists because the forward walk cannot repair its own past. A row that
 * became visible below the cursor is below the cursor forever; the 24 Aug
 * catch-up ran from 16:46Z and could not have reached the nine batches at
 * 16:41–16:44 no matter how far it walked. `--rebuild` would fix them and costs
 * a truncate plus 27.7M rows re-derived to recover 899.
 *
 * It moves neither cursor deliberately. A repair is not progress, and a repair
 * that advanced the frontier would report the index as fresher than the walk
 * has actually made it.
 */
const RECHECK = (() => {
  const i = process.argv.indexOf('--recheck');
  if (i === -1) return null;
  const from = process.argv[i + 1];
  const to = process.argv[i + 2];
  if (!from || !to) {
    console.error('--recheck needs two timestamps: --recheck <fromISO> <toISO>');
    process.exit(2);
  }
  return { from, to };
})();

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

/** Identifies THIS run in `citation_key_frontier.run_id`, so two overlapping
 * builders show up as two ids alternating rather than as one healthy walk. */
const RUN_ID = `citation-keys-${process.pid}-${new Date().toISOString()}`;
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
 * The same cursor, in the DATABASE.
 *
 * The file above is what THIS process needs in order to resume. This row is what
 * everything else needs in order to know whether the index can be trusted: the
 * resolver, `admin/metrics.ts`, and the alert poller all live in another process
 * and cannot read a file in the ingest service's working directory.
 *
 * It is the cursor and not a subtraction on purpose. A judgment citing nothing
 * never produces a key row, so "newest judgment that has a key" drifts with the
 * data rather than with the walk, and reads healthy while the walk is stopped.
 * NEW2's 309,130-citation gap was invisible for a week for exactly that reason.
 *
 * A failure here is logged and swallowed, like the file write: losing the ability
 * to REPORT progress must never stop the work that is making it. The freshness
 * reading then goes stale, which is the correct and visible outcome.
 */
async function publishFrontier(c: Omit<Checkpoint, 'updatedAt'>, runId: string): Promise<void> {
  try {
    await sql`
      INSERT INTO citation_key_frontier (id, cursor_at, cursor_id, scanned, updated_at, run_id)
      VALUES (true, (${c.cursorAt}::text)::timestamptz, ${c.cursorId}::uuid, ${c.scanned}, now(), ${runId})
      ON CONFLICT (id) DO UPDATE
        SET cursor_at = EXCLUDED.cursor_at,
            cursor_id = EXCLUDED.cursor_id,
            scanned   = EXCLUDED.scanned,
            updated_at = EXCLUDED.updated_at,
            run_id     = EXCLUDED.run_id`;
  } catch (err) {
    console.log(
      `    frontier publish failed (${err instanceof Error ? err.message : String(err)}) — continuing; ` +
        `the freshness reading will go STALE, which is the right visible outcome`,
    );
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SAFE FRONTIER — WHY THE WALK MUST NOT TOUCH THE LIVE EDGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.created_at` defaults to `now()`, and **`now()` is TRANSACTION START
 * TIME**, not commit time. A loader that begins at 16:43:23.94, inserts a
 * hundred rows and commits 250 ms later writes a hundred rows stamped
 * 16:43:23.94 that did not exist, for any reader, until 16:43:24.19.
 *
 * The keyset cursor is monotonic. So a row that becomes visible BELOW the cursor
 * is below the cursor forever — no later run of this walk can ever see it, and
 * nothing reports the loss, because a batch that produced no key rows is
 * indistinguishable from a batch that had no citations.
 *
 * THIS ALREADY HAPPENED. On 17 Aug 2026 the walk caught up to live ingest and
 * rode it with 150–250 ms of lag from 16:41:08 to 16:46:00 — the only window in
 * the corpus's whole history where the lag was under a minute. Nine loader
 * transactions were slower than one page interval. 899 judgments were never
 * walked and 293 of them carry a real neutral citation. Measured, not inferred:
 * `docs/ai/new2-r7/CITATION_BATCH_GAP_RCA.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BOUND IS EXACT, NOT A GUESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The tempting fix is `created_at < now() - interval '5 minutes'`, and it is a
 * guess: it is simultaneously too slow for the resolver and still wrong for any
 * loader transaction that runs six minutes.
 *
 * PostgreSQL can answer the question exactly. Every transaction that could still
 * insert a row below some timestamp is, by definition, already running — and its
 * `now()` is its `pg_stat_activity.xact_start`. So the oldest `xact_start` among
 * OTHER backends is a hard floor: no row can ever appear with a `created_at`
 * below it that is not already visible. A transaction that has not begun yet
 * will take its `now()` after this reading, so it is above the bound too.
 *
 * Our own backend is excluded — this walk's statement is itself in
 * `pg_stat_activity`, and including it would pin the bound to the present
 * instant and provide no safety at all.
 *
 * WHEN THE EXACT BOUND IS UNAVAILABLE, SAY SO AND BE CONSERVATIVE. A
 * non-superuser without `pg_read_all_stats` sees other backends' `xact_start` as
 * NULL, which is indistinguishable from "no transactions are running" and would
 * silently restore the unsafe behaviour. In that case the walk falls back to a
 * fixed interval and PRINTS which rule it is using, because a safety bound
 * nobody can tell the provenance of is not a safety bound.
 */
const FALLBACK_LAG_SECONDS = Number(process.env['CITATION_KEYS_FALLBACK_LAG_S'] ?? 300);

type Frontier = { bound: string; exact: boolean };

async function safeFrontier(): Promise<Frontier> {
  const [row] = await sql<{ bound: string; exact: boolean }[]>`
    WITH others AS (
      SELECT min(xact_start) AS oldest
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND datname = current_database()
        AND xact_start IS NOT NULL
    ),
    /* Can we actually SEE other backends' transaction times? If any other
     * backend exists at all and every one of them reports a NULL xact_start,
     * the reading is masked rather than empty, and the exact bound is a lie. */
    visible AS (
      SELECT count(*) FILTER (WHERE pid <> pg_backend_pid() AND datname = current_database()) AS peers,
             count(*) FILTER (WHERE pid <> pg_backend_pid() AND datname = current_database()
                                AND (xact_start IS NOT NULL OR state IS NOT NULL)) AS readable
      FROM pg_stat_activity
    )
    SELECT CASE
             WHEN v.peers > 0 AND v.readable = 0
               THEN (now() - make_interval(secs => ${FALLBACK_LAG_SECONDS}))::text
             ELSE coalesce(o.oldest, now())::text
           END AS bound,
           NOT (v.peers > 0 AND v.readable = 0) AS exact
    FROM others o, visible v`;
  return row ?? { bound: new Date(Date.now() - FALLBACK_LAG_SECONDS * 1000).toISOString(), exact: false };
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DISCHARGING A `JUDGMENT_DELETED` DIRTY MARK — THE ONE REASON A WALK CAN CLOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `citation_key_dirty` (migrations 0087 / 0088) records judgments whose key rows
 * the resolver must not trust. Its own discipline is that **a dirty row goes away
 * because something was done, not because time passed** — nothing in it expires.
 *
 * `JUDGMENT_DELETED` is written by an `AFTER DELETE` trigger, and it is the one
 * reason no walk can ever discharge: this is a keyset scan over `(created_at,
 * id)` and it cannot revisit a row that is gone. So those marks only go up.
 *
 * That is not cosmetic. Above `DIRTY_WINDOW_CAP` (50,000) the resolver fails
 * CLOSED for **every key in every batch** — correct behaviour for a dirty set it
 * cannot enumerate, and a total outage of the resolution path arriving from
 * nothing worse than ordinary deletions. Measured 27 Aug 2026: 16 marks from one
 * afternoon's cleanup, oldest 10:56Z, with nothing able to remove them.
 *
 * **The discharge condition is the one thing the schema already guarantees.**
 * Migration 0088's stated reason for the DELETE trigger is that *"removing a
 * judgment leaves its key rows behind until the builder walks again"*. On this
 * schema that is not true: `judgment_citation_keys_judgment_id_fkey` is
 * `ON DELETE CASCADE`, so the key rows go with the judgment in the same
 * statement. Verified on the live database — of the 16 marks, surviving key rows
 * = 0.
 *
 * So this deletes a mark only when BOTH are provably true: no key row survives
 * for that judgment id, and no judgment survives either. It is a positive check
 * rather than a blanket delete of the reason, because the day somebody drops that
 * CASCADE this must stop firing on its own rather than keep clearing marks that
 * have become real again.
 *
 * The comment/schema conflict in 0088 is REPORTED, not resolved here (bus 1405 /
 * 1406). Blocking a key whose judgment is gone is conservative under either
 * reading, so discharging only the provably-complete ones is safe under both.
 *
 * **NOT fixed here, and it is the larger half:** nothing in production clears a
 * dirty mark for ANY other reason either. `clearDirtyWork()` exists in
 * `services/api/src/citations/citation-key-dirty.ts`, documented as "called
 * INSIDE the transaction that rebuilds them", and its only callers are tests. The
 * intended design was never wired. That needs the rebuild path to name the
 * judgments it rebuilt and is a change to the citation pipeline, which
 * `CLAUDE.md` exempts from simplification — so it is reported with numbers rather
 * than half-wired by a round whose brief is plumbing.
 *
 * Written here rather than imported from `services/api`: `services/ingest` and
 * `services/api` are separate deployables and do not import each other's `src/`
 * (`services/ingest/src/inferx.ts` states the rule).
 */
async function dischargeCompletedDeletions(): Promise<number> {
  const rows = await sql<{ judgment_id: string }[]>`
    DELETE FROM citation_key_dirty d
     WHERE d.reason = 'JUDGMENT_DELETED'
       AND NOT EXISTS (
         SELECT 1 FROM judgment_citation_keys k WHERE k.judgment_id = d.judgment_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM judgments j WHERE j.id = d.judgment_id
       )
    RETURNING judgment_id`;
  return rows.length;
}

async function derivePage(cursorAt: string, cursorId: string, upperBound: string) {
  return sql<{ created_at: string; id: string; n: number }[]>`
    WITH page AS (
      SELECT id, created_at, neutral_citation, reporter_citations
      FROM judgments
      WHERE (created_at, id) > ((${cursorAt}::text)::timestamptz, ${cursorId}::uuid)
        AND created_at < (${upperBound}::text)::timestamptz
      ORDER BY created_at, id
      LIMIT ${PAGE}
    ),
    forms AS (
      SELECT p.id AS judgment_id, 'neutral'::text AS source, p.neutral_citation AS source_text
      FROM page p
      WHERE p.neutral_citation IS NOT NULL AND p.neutral_citation <> ''
        AND ${sql.unsafe(DESPATCH_STAMP_SQL.replace('SOURCE_TEXT', 'p.neutral_citation'))}
      UNION ALL
      SELECT p.id, 'reporter'::text, rc
      FROM page p, unnest(p.reporter_citations) rc
      WHERE rc IS NOT NULL AND rc <> ''
        AND ${sql.unsafe(DESPATCH_STAMP_SQL.replace('SOURCE_TEXT', 'rc'))}
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
async function countOversized(cursorAt: string, cursorId: string, upperBound: string) {
  const [r] = await sql<{ n: number }[]>`
    WITH page AS (
      SELECT id, created_at, neutral_citation, reporter_citations
      FROM judgments
      WHERE (created_at, id) > ((${cursorAt}::text)::timestamptz, ${cursorId}::uuid)
        AND created_at < (${upperBound}::text)::timestamptz
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

/**
 * A REGISTRY DESPATCH STAMP MUST NOT ENTER THE KEY INDEX.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REGRESSION THIS TOOL CAUSED, AND THE HALF THE RESOLVER'S GATE CANNOT COVER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.neutral_citation` on 431 Madras judgments holds a despatch stamp
 * rather than a citation — `2011:NOVEMBER:12`, 165 distinct values, 2009-08-11
 * to 2012-03-02. Before the 24 Aug catch-up they had no key row, so the resolver
 * answered `TARGET_NOT_HELD` and they were harmless. This tool indexes
 * `neutral_citation` WHOLESALE, so the catch-up turned all 431 into resolver
 * inputs and **75 of them began resolving to exactly one judgment each** — a
 * false pin, which `CITATION_HARNESS.md` forbids outright. NEW2 measured it
 * (bus 1112).
 *
 * **The stamp is not even the judgment's date.** `2011:APRIL:05` keys a judgment
 * decided 2011-03-24. They are despatch or upload timestamps.
 *
 * `resolver.ts` now refuses them too, and BOTH are wanted rather than either:
 * the gate stops one bad key reaching an advocate, and this stops the index
 * carrying it at all — `judgments.neutral_citation` is the second of three
 * identity arms and anything else reading this table inherits whatever is in it.
 *
 * Written as SQL rather than TypeScript because the insert is a single
 * server-side statement; a JS filter would mean pulling every row across the
 * wire to reject 431 of 1.37 million.
 */
const DESPATCH_STAMP_SQL = `upper(regexp_replace(SOURCE_TEXT, '[^A-Za-z0-9]', '', 'g')) !~ '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$'`;

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

  if (RECHECK) {
    /* The repair walk. Same derivation, bounded range, and the checkpoint and
     * the published frontier are both left exactly where the forward walk put
     * them — see the RECHECK comment above. */
    console.log(`--recheck ${RECHECK.from} .. ${RECHECK.to}  (checkpoint and frontier NOT moved)`);
    const before = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_citation_keys k
      JOIN judgments j ON j.id = k.judgment_id
      WHERE j.created_at >= (${RECHECK.from}::text)::timestamptz AND j.created_at < (${RECHECK.to}::text)::timestamptz`;
    let at = RECHECK.from;
    let id = EPOCH.cursorId;
    let seen = 0;
    for (;;) {
      stopIfRequested();
      const [page] = await derivePage(at, id, RECHECK.to);
      const n = page?.n ?? 0;
      if (n === 0) break;
      at = page!.created_at;
      id = page!.id;
      seen += n;
      console.log(`  ${seen.toLocaleString().padStart(10)} judgments re-walked · at ${at}`);
    }
    const after = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_citation_keys k
      JOIN judgments j ON j.id = k.judgment_id
      WHERE j.created_at >= (${RECHECK.from}::text)::timestamptz AND j.created_at < (${RECHECK.to}::text)::timestamptz`;
    console.log(
      `\nre-walked ${seen.toLocaleString()} judgments · key rows in range ` +
        `${before[0]?.n?.toLocaleString()} -> ${after[0]?.n?.toLocaleString()} ` +
        `(+${((after[0]?.n ?? 0) - (before[0]?.n ?? 0)).toLocaleString()})`,
    );
    return;
  }

  if (REBUILD) {
    // TRUNCATE, not DELETE: this table is derived and can hold tens of millions
    // of rows, and a DELETE would leave that much dead tuple behind for
    // autovacuum to chase during the rebuild that follows it.
    console.log('--rebuild: truncating judgment_citation_keys');
    await sql`TRUNCATE judgment_citation_keys`;
  }

  /**
   * Discharge the deletions BEFORE the walk, because the walk can never do it.
   *
   * A `JUDGMENT_DELETED` dirty mark waits for key rows that `ON DELETE CASCADE`
   * has already removed, and nothing else on any path clears one — they only go
   * up, and at `DIRTY_WINDOW_CAP` the resolver fails closed for every key. This
   * is the only job that runs often enough to be the right place for it, and it
   * costs one bounded DELETE per pass. See `citation-key-dirty.ts` for why the
   * condition is "no key row survives" and not a timeout.
   */
  const discharged = await dischargeCompletedDeletions();
  if (discharged > 0) {
    console.log(
      `discharged ${discharged.toLocaleString()} JUDGMENT_DELETED dirty mark(s) — ` +
        'their key rows were already removed by the foreign key',
    );
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
  let announcedBound = false;
  for (;;) {
    stopIfRequested();
    /* Recomputed every page, not once: the oldest in-flight transaction ends and
     * the bound advances with it, so a walk that started while a slow loader was
     * running catches up as soon as that loader commits. Computed once, the
     * bound would freeze at whatever happened to be running at launch. */
    const frontier = await safeFrontier();
    if (!announcedBound) {
      console.log(
        frontier.exact
          ? `safe frontier ${frontier.bound} — the oldest in-flight transaction in this database. ` +
              `Rows at or above it may still be uncommitted and are left for a later page.`
          : `safe frontier ${frontier.bound} — FALLBACK, ${FALLBACK_LAG_SECONDS}s behind now. ` +
              `Other backends' xact_start is not readable by this role, so the exact bound is ` +
              `unavailable; grant pg_read_all_stats to restore it.`,
      );
      announcedBound = true;
    }
    oversized += await countOversized(cursorAt, cursorId, frontier.bound);
    const [page] = await derivePage(cursorAt, cursorId, frontier.bound);
    const n = page?.n ?? 0;
    if (n === 0) break;

    cursorAt = page!.created_at;
    cursorId = page!.id;
    scanned += n;
    writeCheckpoint({ cursorAt, cursorId, scanned });
    await publishFrontier({ cursorAt, cursorId, scanned }, RUN_ID);

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
