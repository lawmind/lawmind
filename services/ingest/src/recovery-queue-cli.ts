/**
 * NEW2 — FILL THE RECOVERY QUEUE FROM VALUE, NOT FROM DAMAGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SELECTION IS THE WHOLE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ~1.6M documents are proven not-text. OCR recovers them at 3.7 s a page, which
 * is ~69 CPU-days for ONE page each and far more for whole documents. The
 * directive is explicit: *do NOT OCR 18.7M documents.*
 *
 * So damage is the PRECONDITION and never the reason. A document earns CPU by
 * being something retrieval actually reaches:
 *
 *   CITED_AUTHORITY   a judgment cites it. It is law somebody relied on.
 *   BENCHMARK_GOLD    a launch benchmark or gold set names it as the right
 *                     answer to a query — so its damage is a measured recall
 *                     loss rather than a hypothetical one.
 *   MATTER_LINKED     an advocate saved it to a matter.
 *   SEARCH_MISS       a real query should have returned it and did not.
 *   USER_REQUEST      a person asked for this document.
 *
 * The first three are batch queries and this file runs them. The last two are
 * events, not populations — they arrive one at a time from the product and
 * enqueue through `enqueueForRecovery()` rather than through a pass. They are in
 * the vocabulary because building the queue without them would mean rebuilding
 * it when the product starts producing them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS DAMAGED HERE, AND WHY IT IS THE STORED COLUMN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `script_quality NOT IN ('clean','mixed_script_ok')`, read live from
 * `judgments`, because that is what the eligibility contract refuses and what
 * NEW1's quarantine reads. A queue built from the JSONL export would silently
 * disagree with the contract the moment either moved.
 *
 * `script_quality_method` travels with the row into `damage_detector`, so a
 * queue entry made on a screen-grade verdict is distinguishable from one made on
 * proof-grade evidence, by a WHERE rather than by memory.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/recovery-queue-cli.ts                     # dry run, prints the tranche
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/recovery-queue-cli.ts --confirm
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { openDb } from './db-host.ts';
import { withTransientRetry } from './db-transient.ts';

export type RecoveryReason =
  | 'CITED_AUTHORITY'
  | 'BENCHMARK_GOLD'
  | 'MATTER_LINKED'
  | 'SEARCH_MISS'
  | 'USER_REQUEST';

/**
 * Lower runs first.
 *
 * A saved authority outranks a cited one because a person is waiting on it, and
 * a benchmark authority outranks both because its damage is the only kind we can
 * currently MEASURE as a recall loss — fixing it moves a number that is on the
 * launch gate.
 */
export const PRIORITY_OF: Readonly<Record<RecoveryReason, number>> = {
  USER_REQUEST: 10,
  MATTER_LINKED: 20,
  BENCHMARK_GOLD: 30,
  SEARCH_MISS: 40,
  CITED_AUTHORITY: 50,
};

/**
 * Gold and benchmark artefacts that name a judgment as a right answer.
 *
 * **Resolved against THIS MODULE, never against the working directory.**
 * These were relative paths, so `pnpm exec tsx src/recovery-queue-cli.ts` read
 * the gold from `services/ingest` and read NOTHING from the repository root —
 * where the same command printed `ADVOCATE100.json=ABSENT` and queued zero gold
 * authorities. The queue reported it honestly and still did no work, which is
 * the quiet half of that failure: a run that says ABSENT on one line and
 * `BENCHMARK_GOLD queued 0` on the next looks like a corpus with no damaged
 * gold in it.
 */
export const GOLD_FILES = [
  'new3-semantic-expansion-gold.json',
  'new3-semantic-expansion-gold-v2.json',
  'new3-uncited-authority-gold.json',
  'new3-uncited-authority-gold-v2.json',
  'new3-statute-transition-gold.json',
  /* ADVOCATE-100, bound 22 Aug 2026. Its targets sit under `judgment_id`, which
   * `GOLD_ANSWER_KEYS` already names, so this file needs no reader of its own —
   * which is the property the shape-tolerant walk above was built for. */
  'new2/ADVOCATE100.json',
].map((rel) => fileURLToPath(new URL(`../../../docs/ai/${rel}`, import.meta.url)));

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};

const CONFIRM = process.argv.includes('--confirm');
const JSON_OUT = argOf('json', '../../docs/ops/new2/recovery-queue.json')!;

/**
 * Pull every judgment id a gold file names as a right answer.
 *
 * Deliberately shape-tolerant: five files written by three lanes over three
 * weeks do not share a schema, and a populator that hard-codes one of them
 * silently contributes zero when the next one lands. Every key below names the
 * RIGHT ANSWER to a query, at any depth, in either casing convention.
 *
 * `citingJudgmentId` is deliberately NOT in the list. In
 * `new3-semantic-expansion-gold-v2.json` it names the judgment that DID the
 * citing — the query's origin, not its answer — and queueing it would spend CPU
 * on documents no benchmark is asking for.
 */
const GOLD_ANSWER_KEYS: ReadonlySet<string> = new Set([
  'goldJudgmentId',
  'judgmentId',
  'authorityId',
  'authority_id',
  'judgment_id',
  'case_id',
]);
function goldIds(): { ids: Set<string>; perFile: Record<string, number> } {
  const ids = new Set<string>();
  const perFile: Record<string, number> = {};
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const file of GOLD_FILES) {
    if (!existsSync(file)) {
      perFile[file] = -1; // absent, and said so rather than counted as zero
      continue;
    }
    const before = ids.size;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (GOLD_ANSWER_KEYS.has(k) && typeof v === 'string' && UUID.test(v)) {
            ids.add(v.toLowerCase());
          } else {
            walk(v);
          }
        }
      }
    };
    walk(JSON.parse(readFileSync(file, 'utf8')));
    perFile[file] = ids.size - before;
  }
  return { ids, perFile };
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL unset');
  process.exit(2);
}
const sql = await openDb(url, 2, 10 * 60_000);

/**
 * Insert, or raise the priority of an entry that already exists.
 *
 * A document reached by four reasons must be OCR'd once, not four times, and the
 * reason kept must be the most valuable one — hence `LEAST`. `reason` follows the
 * priority so the pair never disagrees, and a document already RECOVERED is left
 * alone: re-queueing it would spend the CPU again for nothing.
 */
async function enqueue(
  rows: { id: string; method: string | null; value: string | null }[],
  reason: RecoveryReason,
): Promise<number> {
  if (!CONFIRM || rows.length === 0) return 0;
  return withTransientRetry('enqueue', async () => {
    const written = await sql`
      INSERT INTO judgment_recovery_queue
        (judgment_id, reason, priority, damage_detector, damage_reasons)
      SELECT unnest(${rows.map((r) => r.id)}::uuid[]),
             ${reason},
             ${PRIORITY_OF[reason]},
             unnest(${rows.map((r) => r.method ?? 'unknown')}::text[]),
             ARRAY[]::text[]
      ON CONFLICT (judgment_id) DO UPDATE
         SET priority = LEAST(judgment_recovery_queue.priority, EXCLUDED.priority),
             reason = CASE WHEN EXCLUDED.priority < judgment_recovery_queue.priority
                           THEN EXCLUDED.reason ELSE judgment_recovery_queue.reason END
       WHERE judgment_recovery_queue.state = 'QUEUED'
      RETURNING 1`;
    return written.length;
  });
}

const DAMAGED = sql`j.script_quality IS NOT NULL
  AND j.script_quality NOT IN ('clean', 'mixed_script_ok')`;

type Tranche = { reason: RecoveryReason; found: number; written: number; note?: string };
const tranches: Tranche[] = [];

/* ── CITED_AUTHORITY ─────────────────────────────────────────────────────── */
{
  const rows = await sql<{ id: string; method: string | null; value: string | null }[]>`
    SELECT j.id, j.script_quality_method AS method, j.script_quality AS value
      FROM cited_authority ca
      JOIN judgments j ON j.id = ca.judgment_id
     WHERE ${DAMAGED}`;
  tranches.push({
    reason: 'CITED_AUTHORITY',
    found: rows.length,
    written: await enqueue(rows, 'CITED_AUTHORITY'),
  });
}

/* ── BENCHMARK_GOLD ──────────────────────────────────────────────────────── */
{
  const { ids, perFile } = goldIds();
  const list = [...ids];
  const rows = list.length
    ? await sql<{ id: string; method: string | null; value: string | null }[]>`
        SELECT j.id, j.script_quality_method AS method, j.script_quality AS value
          FROM judgments j
         WHERE j.id = ANY(${list}::uuid[])
           AND ${DAMAGED}`
    : [];
  tranches.push({
    reason: 'BENCHMARK_GOLD',
    found: rows.length,
    written: await enqueue(rows, 'BENCHMARK_GOLD'),
    note:
      `${list.length} distinct gold authorities read · ` +
      Object.entries(perFile)
        .map(([f, n]) => `${f.split('/').pop()}=${n === -1 ? 'ABSENT' : n}`)
        .join(' '),
  });
}

/* ── MATTER_LINKED ───────────────────────────────────────────────────────── */
{
  const rows = await sql<{ id: string; method: string | null; value: string | null }[]>`
    SELECT DISTINCT j.id, j.script_quality_method AS method, j.script_quality AS value
      FROM matter_authorities ma
      JOIN judgments j ON j.id = ma.judgment_id
     WHERE ma.removed_at IS NULL
       AND ${DAMAGED}`;
  const total = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM matter_authorities WHERE removed_at IS NULL`;
  tranches.push({
    reason: 'MATTER_LINKED',
    found: rows.length,
    written: await enqueue(rows, 'MATTER_LINKED'),
    /* Zero here is a fact about the product, not about the query. Saying which
     * of the two it is stops the next reader re-investigating a working join. */
    note: `${total[0]!.n} live matter authorities exist in total`,
  });
}

console.log(`${CONFIRM ? 'QUEUED' : 'DRY RUN'} — high-value recovery tranche\n`);
for (const t of tranches) {
  console.log(
    `  ${t.reason.padEnd(16)} damaged ${String(t.found).padStart(6)} · ` +
      `queued ${String(t.written).padStart(6)}${t.note ? `\n      ${t.note}` : ''}`,
  );
}

/* SEARCH_MISS and USER_REQUEST are events. Printed so their absence is a stated
 * fact rather than an omission a reader has to notice. */
console.log(
  '\n  SEARCH_MISS      event-driven — no producer yet (searches.id is never ' +
    'written from the production path; reality audit §"searchId permanently null")\n' +
    '  USER_REQUEST     event-driven — enqueued by the product, one at a time',
);

const state = await sql<{ state: string; reason: string; n: number }[]>`
  SELECT state, reason, count(*)::int AS n
    FROM judgment_recovery_queue GROUP BY 1, 2 ORDER BY 1, 2`;
console.log('\nqueue now:');
for (const s of state) console.log(`  ${s.state.padEnd(14)} ${s.reason.padEnd(16)} ${s.n}`);
if (state.length === 0) console.log('  (empty)');

mkdirSync(dirname(JSON_OUT), { recursive: true });
writeFileSync(
  JSON_OUT,
  JSON.stringify(
    { kind: 'new2_recovery_queue', confirmed: CONFIRM, at: new Date().toISOString(), tranches, state },
    null,
    1,
  ),
);

await sql.end({ timeout: 5 });
