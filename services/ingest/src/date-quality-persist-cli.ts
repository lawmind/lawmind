/**
 * NEW2 — PUBLISH THE DATE STATE. NEVER REWRITE THE DATE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS AND IS NOT BEING CLAIMED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgment_date` is contradicted by the primary document on **4.45%** of rows,
 * by two mechanisms: a same-direction off-by-one concentrated in four courts, and
 * `judgment_date` tracking a case's FILING year. When the document and the
 * publisher's filename disagreed, the document was right **33 times out of 34**.
 *
 * The directive is exact and this file obeys it literally: *do not heuristically
 * rewrite corpus dates.* Nothing here touches `judgments.judgment_date`. It
 * writes a STATE beside it, with the witnesses that produced the state, so a
 * chronological or currentness claim can decline to rest on a suspect date
 * instead of silently resting on one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT THE WHOLE CORPUS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The corpus rate is already measured, on uniform draws, and a full pass would
 * not improve it — a rate needs a sample and this needs to serve LOOKUPS. What a
 * consumer asks is *"is THIS document's date trustworthy"*, and the documents
 * consumers reach are a tiny, enumerable fraction: cited authorities, gold
 * answers, recovery-queue members and the staged vectors.
 *
 * `--all` exists and walks the corpus in id order with a checkpoint, for when the
 * box is quiet. It is not the default, because 18.7M × 6,000 characters on a box
 * running a GPU walk, two classifiers and a damage persist is how the classifier
 * died of a statement timeout twice this week.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/date-quality-persist-cli.ts --confirm
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/date-quality-persist-cli.ts --confirm --all
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb } from './db-host.ts';
import { withTransientRetry } from './db-transient.ts';
import { DATE_QUALITY_VERSION, dateQuality } from './date-quality.ts';

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};

const CONFIRM = process.argv.includes('--confirm');
const ALL = process.argv.includes('--all');
const RESTART = process.argv.includes('--restart');
const RECHECK = process.argv.includes('--recheck');
const BATCH = Number(argOf('batch', '2000'));
const LIMIT = Number(argOf('limit', '0'));
/** Same span as `date-quality-cli.ts`, so a verdict here and a verdict there are
 *  the same verdict. An Indian order prints its date in the cause title. */
const SPAN = Number(argOf('span', '6000'));
const JSON_OUT = argOf('json', '../../docs/ops/new2/date-quality-persist.json')!;

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CKPT = join(here, '..', '.checkpoints', `date-quality-persist-${ALL ? 'all' : 'value'}.json`);
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

type Checkpoint = {
  scope: string;
  version: string;
  cursor: string;
  read: number;
  written: number;
  byState: Record<string, number>;
  startedAt: string;
  updatedAt: string;
};

const fresh = (): Checkpoint => ({
  scope: ALL ? 'all' : 'value',
  version: DATE_QUALITY_VERSION,
  cursor: ZERO_UUID,
  read: 0,
  written: 0,
  byState: {},
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function loadCheckpoint(): Checkpoint {
  if (RESTART || !existsSync(CKPT)) return fresh();
  try {
    const c = JSON.parse(readFileSync(CKPT, 'utf8')) as Checkpoint;
    if (c.version !== DATE_QUALITY_VERSION) {
      console.error(
        `checkpoint was written by "${c.version}", this build is ` +
          `"${DATE_QUALITY_VERSION}" — pass --restart if that is intended`,
      );
      process.exit(2);
    }
    return c;
  } catch {
    return fresh();
  }
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL unset');
  process.exit(2);
}
const sql = await openDb(url, 2, 10 * 60_000);
const ckpt = loadCheckpoint();
const started = Date.now();

type Row = {
  id: string;
  jd: string | null;
  source_url: string | null;
  head: string | null;
};

/**
 * The value population: what a consumer can actually reach.
 *
 * A UNION of three id sources rather than a join chain, so a source contributing
 * nothing contributes nothing rather than emptying the result. `judgment_date IS
 * NOT NULL` is NOT filtered on purpose — a null stored date is `DATE_UNKNOWN`
 * and a consumer needs that written down as much as any other state.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESOLVED ONCE, NOT PER PAGE, AND THE FIRST VERSION WAS THE OTHER WAY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * That UNION sat inside the paging query at first, with a keyset `id > cursor`.
 * It is ~580,000 ids, dominated by `new1_doc_vector_stage`, and none of the
 * sources is ordered by `judgments.id` — so every 2,000-row page rebuilt and
 * sorted the whole set. **One page did not finish in eight minutes on a box also
 * running a GPU walk, two classifiers and a damage persist**, and it would have
 * done that ~290 times.
 *
 * Resolving the set once costs one query and ~21 MB of uuids, and turns each
 * page into a primary-key lookup on a 2,000-element array. The cost the
 * checkpoint pays for this is that the population is fixed at start: ids added to
 * `cited_authority` mid-run are picked up by the next run, not this one. For a
 * pass over a slowly-growing set that is the right trade, and it is stated rather
 * than discovered.
 */
async function resolveValueIds(): Promise<string[]> {
  const rows = await withTransientRetry(
    'resolve value population',
    async () =>
      sql<{ id: string }[]>`
      WITH wanted AS (
        SELECT judgment_id AS id FROM cited_authority
        UNION
        SELECT judgment_id FROM judgment_recovery_queue
        UNION
        SELECT judgment_id FROM new1_doc_vector_stage
      )
      SELECT w.id FROM wanted w
       ${RECHECK ? sql`` : sql`WHERE NOT EXISTS (SELECT 1 FROM judgment_date_quality q WHERE q.judgment_id = w.id)`}
       ORDER BY w.id`,
  );
  return rows.map((r) => r.id);
}

function pageByIds(ids: string[]) {
  return sql<Row[]>`
    SELECT j.id, to_char(j.judgment_date, 'YYYY-MM-DD') AS jd, j.source_url,
           left(j.full_text, ${SPAN}) AS head
      FROM judgments j
     WHERE j.id = ANY(${ids}::uuid[])
     ORDER BY j.id`;
}

function pageAll(cursor: string, limit: number) {
  return sql<Row[]>`
    SELECT j.id, to_char(j.judgment_date, 'YYYY-MM-DD') AS jd, j.source_url,
           left(j.full_text, ${SPAN}) AS head
      FROM judgments j
     WHERE j.id > ${cursor}::uuid
       ${RECHECK ? sql`` : sql`AND NOT EXISTS (SELECT 1 FROM judgment_date_quality q WHERE q.judgment_id = j.id)`}
     ORDER BY j.id
     LIMIT ${limit}`;
}

console.log(
  `${CONFIRM ? 'WRITING' : 'DRY RUN'} — date quality, scope ${ALL ? 'ALL' : 'VALUE'}, ` +
    `${DATE_QUALITY_VERSION}` +
    (ckpt.cursor !== ZERO_UUID ? `, resuming at ${ckpt.cursor}` : ''),
);

/* Resolved before the loop for the value scope; `--all` keysets the table
 * directly, where `judgments_pkey` already gives the ordering for free. */
const valueIds = ALL ? [] : await resolveValueIds();
if (!ALL) {
  console.log(`  value population resolved: ${valueIds.length.toLocaleString()} documents`);
}
/* Where in `valueIds` the checkpoint's cursor left off. A binary search would be
 * tidier; the list is one pass and this runs once. */
let at = ALL
  ? 0
  : valueIds.findIndex((id) => id > ckpt.cursor) === -1 && ckpt.cursor !== ZERO_UUID
    ? valueIds.length
    : Math.max(
        0,
        valueIds.findIndex((id) => id > ckpt.cursor),
      );

for (;;) {
  if (LIMIT > 0 && ckpt.read >= LIMIT) break;
  const size = LIMIT > 0 ? Math.min(BATCH, LIMIT - ckpt.read) : BATCH;
  let rows: Row[];
  if (ALL) {
    rows = await withTransientRetry('page', () => pageAll(ckpt.cursor, size));
  } else {
    const slice = valueIds.slice(at, at + size);
    if (slice.length === 0) break;
    at += slice.length;
    rows = await withTransientRetry('page', () => pageByIds(slice));
  }
  if (rows.length === 0) break;

  const verdicts = rows.map((r) => ({
    id: r.id,
    v: dateQuality({ judgmentDate: r.jd, sourceUrl: r.source_url, text: r.head }),
  }));
  for (const { v } of verdicts) {
    ckpt.byState[v.state] = (ckpt.byState[v.state] ?? 0) + 1;
  }
  ckpt.read += rows.length;
  ckpt.cursor = rows[rows.length - 1]!.id;

  if (CONFIRM) {
    await withTransientRetry('write', async () => {
      /* The witnesses arrive as an array of JSON TEXT and are cast per element in
       * the outer SELECT. `text[]::jsonb[]` is not a legal cast — Postgres
       * refuses it with 42846, which is exactly how the first version of this
       * died on its first batch. Casting the scalar after `unnest` is legal and
       * is the same one statement. */
      await sql`
        INSERT INTO judgment_date_quality
          (judgment_id, state, method, filename_delta_days, off_by_one_day, witnesses)
        SELECT u.id, u.state, u.method, u.delta, u.obo::boolean, u.witnesses::jsonb
          FROM (
        SELECT unnest(${verdicts.map((x) => x.id)}::uuid[]) AS id,
               unnest(${verdicts.map((x) => x.v.state)}::text[]) AS state,
               unnest(${verdicts.map((x) => x.v.method)}::text[]) AS method,
               unnest(${verdicts.map((x) => x.v.filenameDeltaDays)}::int[]) AS delta,
               /* As text, cast per element below. postgres.js does not
                * serialise a JS boolean[] to a Postgres bool[] — the server sees
                * a scalar and refuses with "cannot cast type boolean to
                * boolean[]". Same shape as the jsonb column above. */
               unnest(${verdicts.map((x) => String(x.v.offByOneDay))}::text[]) AS obo,
               unnest(${verdicts.map((x) => JSON.stringify(x.v.witnesses))}::text[]) AS witnesses
          ) u
        ON CONFLICT (judgment_id) DO UPDATE
           SET state = EXCLUDED.state,
               method = EXCLUDED.method,
               filename_delta_days = EXCLUDED.filename_delta_days,
               off_by_one_day = EXCLUDED.off_by_one_day,
               witnesses = EXCLUDED.witnesses,
               checked_at = now()`;
    });
    ckpt.written += verdicts.length;
  }

  mkdirSync(dirname(CKPT), { recursive: true });
  ckpt.updatedAt = new Date().toISOString();
  writeFileSync(CKPT, JSON.stringify(ckpt, null, 1));

  const rate = Math.round(ckpt.read / Math.max(1, (Date.now() - started) / 1000));
  console.log(
    `  ${ckpt.read.toLocaleString()} read · ${ckpt.written.toLocaleString()} written · ${rate}/s`,
  );
}

const total = Object.values(ckpt.byState).reduce((a, b) => a + b, 0) || 1;
console.log(
  `\n${CONFIRM ? 'WROTE' : 'WOULD WRITE'} — ${ckpt.read.toLocaleString()} documents, ` +
    `${Math.round((Date.now() - started) / 1000)}s`,
);
for (const [state, n] of Object.entries(ckpt.byState).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${state.padEnd(15)} ${String(n).padStart(9)}  ${((100 * n) / total).toFixed(2)}%`);
}

mkdirSync(dirname(JSON_OUT), { recursive: true });
writeFileSync(
  JSON_OUT,
  JSON.stringify(
    { kind: 'new2_date_quality_persist', confirmed: CONFIRM, span: SPAN, ...ckpt },
    null,
    1,
  ),
);

await sql.end({ timeout: 5 });
