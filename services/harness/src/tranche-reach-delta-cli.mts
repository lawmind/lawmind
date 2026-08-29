/**
 * NEW1 §5 — what LCC's tranche wiring made REACHABLE, per query family.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A REACH MEASUREMENT AND NOT AN A/B
 * ─────────────────────────────────────────────────────────────────────────────
 * The honest A/B would run the same gold with the tranche arm on and off. The
 * arm is unconditional inside `dense()` in `services/api/src/search/retrieve.ts`,
 * which is LCC's file, and adding a toggle to it is not this lane's edit to make.
 * So rather than approximate an A/B, this measures the thing that needs no
 * toggle and no assumption: for every gold authority, WHICH INDEX CAN REACH IT.
 *
 * A document absent from both indexes cannot be returned by the dense arm at any
 * ranking quality whatever, and a document present in exactly one of them is
 * reachable precisely because of that index. That makes the ceiling exact and
 * the newly-reachable set exact, which is more than a rank delta on a moving
 * corpus can honestly claim.
 *
 * NOT a release claim. `search.semantic.broad` is EXPERIMENTAL_INTERNAL and no
 * user request reaches the dense arm; `tranche-reach.test.ts` asserts both halves
 * of that. Nothing here changes it.
 *
 * Reach is a CEILING, never a result. A reachable authority can still rank 400th.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

import { loadNew3Gold } from './new3-gold-adapter.ts';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)![1]!
  .trim();
const sql = postgres(url, { max: 1, connection: { statement_timeout: 0 } });

const loaded = loadNew3Gold('docs/ai/new3-semantic-expansion-gold.json');
console.log(`gold rows ${loaded.rows.length}, dropped ${loaded.dropped.length}`);

const ids = [...new Set(loaded.rows.map((r) => r.goldAuthorityId))];
console.log(`distinct gold authorities ${ids.length}`);

/**
 * The two indexes the dense arm reads TODAY, plus the two populations that
 * decide what it could read NEXT: the coarse vectors already staged, and the
 * snapshot they are being walked from. A reach report that stops at today's
 * indexes answers "is this benchmark movable now" and not "is it movable at
 * all", and those turn out to be different answers.
 */
const reach = await sql<
  { id: string; in_chunks: boolean; in_tranche: boolean; in_coarse: boolean; in_snapshot: boolean }[]
>`
  SELECT j.id,
         EXISTS (SELECT 1 FROM judgment_chunks c
                  WHERE c.judgment_id = j.id AND c.embedding IS NOT NULL) AS in_chunks,
         EXISTS (SELECT 1 FROM new1_tranche_passages p
                  WHERE p.judgment_id = j.id) AS in_tranche,
         EXISTS (SELECT 1 FROM new1_doc_vector_stage s
                  WHERE s.judgment_id = j.id AND s.snapshot_hash = '5b5d02384b46c96c') AS in_coarse,
         EXISTS (SELECT 1 FROM embedding_content_representative r
                  WHERE r.representative_judgment_id = j.id
                    AND r.definition_hash = '5b5d02384b46c96c') AS in_snapshot
    FROM judgments j
   WHERE j.id = ANY(${ids}::uuid[])
`;
const byId = new Map(reach.map((r) => [r.id, r]));

const [{ chunk_docs, tranche_docs, union_docs }] = await sql<
  { chunk_docs: string; tranche_docs: string; union_docs: string }[]
>`
  WITH c AS (SELECT DISTINCT judgment_id FROM judgment_chunks WHERE embedding IS NOT NULL),
       t AS (SELECT DISTINCT judgment_id FROM new1_tranche_passages)
  SELECT (SELECT count(*) FROM c) AS chunk_docs,
         (SELECT count(*) FROM t) AS tranche_docs,
         (SELECT count(*) FROM (SELECT judgment_id FROM c UNION SELECT judgment_id FROM t) u) AS union_docs
`;

type Cell = {
  queries: number;
  distinctAuthorities: number;
  baselineReachable: number;
  trancheReachable: number;
  unionReachable: number;
  newlyReachable: number;
  unreachableInBoth: number;
  notInCorpus: number;
  baselinePct: number;
  unionPct: number;
  coarseStagedToday: number;
  inCoarseSnapshot: number;
  reachableWhenCoarseWalkCompletes: number;
  reachableWhenCoarseWalkCompletesPct: number;
};
const families = new Map<string, Set<string>>();
const counts = new Map<string, number>();
for (const r of loaded.rows) {
  counts.set(r.queryType, (counts.get(r.queryType) ?? 0) + 1);
  if (!families.has(r.queryType)) families.set(r.queryType, new Set());
  families.get(r.queryType)!.add(r.goldAuthorityId);
}

const byFamily: Record<string, Cell> = {};
for (const [family, set] of families) {
  const list = [...set];
  let base = 0, tr = 0, uni = 0, neither = 0, missing = 0, coarse = 0, snap = 0, futureUni = 0;
  for (const id of list) {
    const row = byId.get(id);
    if (!row) { missing += 1; continue; }
    if (row.in_chunks) base += 1;
    if (row.in_tranche) tr += 1;
    if (row.in_coarse) coarse += 1;
    if (row.in_snapshot) snap += 1;
    if (row.in_chunks || row.in_tranche) uni += 1;
    else neither += 1;
    if (row.in_chunks || row.in_tranche || row.in_snapshot) futureUni += 1;
  }
  byFamily[family] = {
    queries: counts.get(family)!,
    distinctAuthorities: list.length,
    baselineReachable: base,
    trancheReachable: tr,
    unionReachable: uni,
    newlyReachable: uni - base,
    unreachableInBoth: neither,
    notInCorpus: missing,
    baselinePct: Number(((100 * base) / list.length).toFixed(2)),
    unionPct: Number(((100 * uni) / list.length).toFixed(2)),
    coarseStagedToday: coarse,
    inCoarseSnapshot: snap,
    reachableWhenCoarseWalkCompletes: futureUni,
    reachableWhenCoarseWalkCompletesPct: Number(((100 * futureUni) / list.length).toFixed(2)),
  };
}

const report = {
  kind: 'new1_tranche_reach_delta',
  measuredAt: new Date().toISOString(),
  gate: 'search.semantic.broad = EXPERIMENTAL_INTERNAL — no user request reaches the dense arm; this is a harness measurement only',
  whatThisIs: 'a REACH CEILING per query family, not a ranking result',
  corpusReach: {
    judgmentChunksDocuments: Number(chunk_docs),
    trancheDocuments: Number(tranche_docs),
    unionDocuments: Number(union_docs),
    multiple: Number((Number(union_docs) / Number(chunk_docs)).toFixed(3)),
  },
  goldRows: loaded.rows.length,
  goldDropped: loaded.dropped.length,
  distinctGoldAuthorities: ids.length,
  byFamily,
};
console.log(JSON.stringify(report, null, 2));
// Repo-relative, resolved here: the harness runs both from its own package
// directory and from the repo root, and a bare relative path is wrong for one.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
writeFileSync(ROOT + 'docs/ai/new1-r10/tranche-reach-delta.json', JSON.stringify(report, null, 2) + '\n');
await sql.end();
