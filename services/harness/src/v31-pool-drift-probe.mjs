#!/usr/bin/env node
/**
 * NEW1 — DOES THE V3.1 POOL ACTUALLY DRIFT? (§7 NEW1-1 evidence)
 *
 * `v31-freeze-cli.ts` justifies freezing pool identity into an artifact by
 * asserting that a seeded re-draw drifts, because the fill source
 * `new1_doc_vector_stage` is written by the live HEAD walk. An assertion is not
 * evidence, and the two freezes taken minutes apart happened to land while the
 * walk was retrying an already-staged batch — so the table was static and they
 * agreed on all 25,000 ids. That proves DETERMINISM. It does not prove drift.
 *
 * This re-runs the identical draw against the table as it stands NOW and diffs
 * the result against the frozen pool. If rows have been inserted since the
 * freeze, some of them sort into the frozen prefix and displace ids that were in
 * it — and the count of displaced ids is the drift, measured rather than argued.
 *
 * Read the output the honest way: zero drift with zero new rows says nothing
 * either way. The claim is only supported if new rows produced changed ids.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const url =
  process.env.DATABASE_URL ??
  readFileSync(new URL('.env', ROOT), 'utf8')
    .match(/^DATABASE_URL=(.*)$/m)[1]
    .trim();

const manifest = JSON.parse(readFileSync(new URL('docs/ai/new1-tier-a/V31_MANIFEST.json', ROOT), 'utf8'));
const SEED = manifest.seeds.seed;
const goldIds = [...new Set(manifest.tasks.flatMap((t) => t.targets))].sort();
const frozenPool = manifest.pool.ids;
const frozenDistractors = frozenPool.slice(manifest.pool.goldCount);
const rowsAtFreeze = manifest.reachabilityAtFreeze.stageRowsAtFreeze;

const sql = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 30 });

try {
  const [{ n: rowsNow }] = await sql`SELECT count(*)::bigint AS n FROM new1_doc_vector_stage`;
  const grown = Number(rowsNow) - rowsAtFreeze;

  const redrawn = await sql`
    SELECT judgment_id::text AS judgment_id
    FROM (SELECT DISTINCT judgment_id FROM new1_doc_vector_stage) d
    WHERE NOT (judgment_id::text = ANY(${goldIds}))
    ORDER BY md5(judgment_id::text || ${SEED})
    LIMIT ${frozenDistractors.length}`;
  const now = redrawn.map((r) => r.judgment_id);

  const before = new Set(frozenDistractors);
  const after = new Set(now);
  const entered = now.filter((id) => !before.has(id));
  const displaced = frozenDistractors.filter((id) => !after.has(id));

  console.log('V3.1 POOL DRIFT PROBE');
  console.log(`  seed                 ${SEED}`);
  console.log(`  stage rows at freeze ${rowsAtFreeze.toLocaleString()}`);
  console.log(`  stage rows now       ${Number(rowsNow).toLocaleString()}   (${grown >= 0 ? '+' : ''}${grown.toLocaleString()})`);
  console.log(`  distractors compared ${frozenDistractors.length.toLocaleString()}`);
  console.log(`  entered the pool     ${entered.length}`);
  console.log(`  displaced from pool  ${displaced.length}`);
  if (grown === 0) {
    console.log('  VERDICT  table did not grow — this run tests DETERMINISM only, not drift.');
    console.log(`           determinism: ${entered.length === 0 ? 'HOLDS (identical draw)' : 'FAILED — same table, different draw'}`);
  } else if (displaced.length > 0) {
    console.log(`  VERDICT  DRIFT CONFIRMED — ${grown.toLocaleString()} new rows displaced ${displaced.length} pool members.`);
    console.log('           A seed does not fix this. Freezing identity to the artifact does.');
  } else {
    console.log(`  VERDICT  table grew by ${grown.toLocaleString()} and the pool did NOT change.`);
    console.log('           Drift is possible but was not observed at this growth.');
  }
} finally {
  await sql.end({ timeout: 10 });
}
