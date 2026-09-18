/**
 * `pnpm --filter @lawmind/harness exec tsx --env-file=../../.env src/new3-hard-negatives-cli.ts`
 *
 * P4 of the mission brief: query-relative hard negatives, "use saved
 * candidate outputs where possible; avoid giant DB scans." NEW1's
 * `docs/ai/new1-rerank/pools.json` already holds exactly this: 283 queries,
 * each with a depth-200 dense-retrieval pool (judgment_id, chunk_index,
 * cosine dist), built 19 Aug (bus reranker work). This script mines it
 * rather than re-running retrieval, per the brief.
 *
 * A hard negative here is: for a given query, a judgment the dense retriever
 * ranked NEAR the gold (small cosine distance) that is NOT the gold. That is
 * the actual confusion a production reranker will see -- not a synthetic
 * distractor, not "candidate = globally negative" (explicitly forbidden by
 * the brief): every negative is tied to the one query it was retrieved for.
 *
 * CATEGORISATION IS EVIDENCE-BOUNDED, NOT FORCED. The brief lists five
 * negative flavours (same/similar case name, same issue wrong proposition,
 * quoted-not-supporting, later adverse authority, factually similar) as
 * examples of what makes a negative hard -- it does not follow that every
 * mined negative can be honestly sorted into one of those five without
 * inventing a claim the data does not support (KNOW/INFER/GUESS, CLAUDE.md
 * prime directive 3). This script computes what IS mechanically knowable per
 * negative -- same court, date relative to gold (candidate for "later
 * adverse"), case-title token overlap with the gold's own title (candidate
 * for "similar case name") -- and reports those as INFER-tagged signals, not
 * as a forced single label. "same issue wrong proposition" and "quoted
 * precedent not supporting" need semantic judgement this script does not
 * make; they are left OUT rather than guessed.
 *
 * DB cost: one batched ANY(uuid[]) metadata fetch over the gold ids + top-K
 * negative ids per query (target <=1,700 ids total). Not a scan.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { sslFor } from './db-url.ts';

const NEGATIVES_PER_QUERY = 5;

type PoolEntry = { judgment_id: string; chunk_index: number; dist: number };
type PoolsDoc = {
  builtAt: string;
  efSearch: number;
  depth: number;
  queries: Array<{ id: string; group: string; gold: string[]; split: string; text: string }>;
  pools: Record<string, PoolEntry[]>;
};

function titleTokenOverlap(a: string, b: string): number {
  const stop = new Set([
    'the',
    'and',
    'of',
    'v',
    'vs',
    'in',
    're',
    'state',
    'union',
    'india',
    'ors',
    'anr',
    'others',
  ]);
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stop.has(t)),
    );
  const ta = tok(a);
  const tb = tok(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }
  const poolsPath = new URL('../../../docs/ai/new1-rerank/pools.json', import.meta.url);
  const pools: PoolsDoc = JSON.parse(readFileSync(poolsPath, 'utf8'));
  console.log(
    `pools.json: ${pools.queries.length} queries, built ${pools.builtAt}, depth ${pools.depth}`,
  );

  type Picked = { queryId: string; judgmentId: string; dist: number; rank: number };
  const picks: Picked[] = [];
  for (const q of pools.queries) {
    const pool = pools.pools[q.id] ?? [];
    const goldSet = new Set(q.gold);
    const byJudgment = new Map<string, number>(); // min dist per judgment
    for (const p of pool) {
      const cur = byJudgment.get(p.judgment_id);
      if (cur === undefined || p.dist < cur) byJudgment.set(p.judgment_id, p.dist);
    }
    const ranked = [...byJudgment.entries()]
      .filter(([jid]) => !goldSet.has(jid))
      .sort((a, b) => a[1] - b[1]);
    ranked.slice(0, NEGATIVES_PER_QUERY).forEach(([jid, dist], i) => {
      picks.push({ queryId: q.id, judgmentId: jid, dist, rank: i + 1 });
    });
  }
  console.log(
    `mined ${picks.length} query-relative candidate negatives across ${pools.queries.length} queries`,
  );

  const sql = postgres(url, { ssl: sslFor(url), max: 3 });
  try {
    const goldIds = [...new Set(pools.queries.flatMap((q) => q.gold))];
    const negIds = [...new Set(picks.map((p) => p.judgmentId))];
    const allIds = [...new Set([...goldIds, ...negIds])];
    console.log(
      `fetching metadata for ${allIds.length} ids (${goldIds.length} gold + ${negIds.length} distinct negatives)`,
    );

    const rows = await sql<
      { id: string; case_title: string; court: string; judgment_date: string | null }[]
    >`
      SELECT id::text, case_title, court, judgment_date::text
      FROM judgments
      WHERE id = ANY(${allIds}::uuid[])
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));
    console.log(`resolved ${rows.length} of ${allIds.length}`);

    const goldByQuery = new Map(pools.queries.map((q) => [q.id, q.gold[0]]));
    const queryText = new Map(pools.queries.map((q) => [q.id, q.text]));
    const queryGroup = new Map(pools.queries.map((q) => [q.id, q.group]));
    const querySplit = new Map(pools.queries.map((q) => [q.id, q.split]));

    const negRows: Array<Record<string, unknown>> = [];
    let skippedNoMeta = 0;
    for (const p of picks) {
      const goldId = goldByQuery.get(p.queryId);
      const goldMeta = goldId ? byId.get(goldId) : undefined;
      const negMeta = byId.get(p.judgmentId);
      if (!negMeta) {
        skippedNoMeta++;
        continue;
      }
      const signals: Record<string, unknown> = {
        sameCourtAsGold: goldMeta ? negMeta.court === goldMeta.court : null,
        titleTokenOverlapWithGold: goldMeta
          ? Number(titleTokenOverlap(negMeta.case_title, goldMeta.case_title).toFixed(3))
          : null,
        laterThanGold:
          goldMeta?.judgment_date && negMeta.judgment_date
            ? negMeta.judgment_date > goldMeta.judgment_date
            : null,
      };
      // Candidate labels are INFER, not asserted fact -- a downstream consumer decides whether to trust them.
      const inferredLabels: string[] = [];
      if (
        signals['titleTokenOverlapWithGold'] !== null &&
        (signals['titleTokenOverlapWithGold'] as number) >= 0.5
      )
        inferredLabels.push('INFER:similar_case_name');
      if (signals['laterThanGold'] === true) inferredLabels.push('INFER:later_authority_candidate');
      if (signals['sameCourtAsGold'] === true) inferredLabels.push('INFER:same_court_near_miss');
      if (inferredLabels.length === 0) inferredLabels.push('INFER:dense_near_miss_unclassified');

      negRows.push({
        negative_id: `${p.queryId}-neg${p.rank}`,
        queryId: p.queryId,
        queryText: queryText.get(p.queryId),
        queryGroup: queryGroup.get(p.queryId),
        querySplit: querySplit.get(p.queryId),
        goldAuthorityId: goldId,
        goldCaseTitle: goldMeta?.case_title ?? null,
        negativeAuthorityId: p.judgmentId,
        negativeCaseTitle: negMeta.case_title,
        negativeCourt: negMeta.court,
        negativeDate: negMeta.judgment_date,
        denseRank: p.rank,
        cosineDist: Number(p.dist.toFixed(4)),
        signals,
        inferredLabels,
        provenance: {
          method: 'dense_retrieval_near_miss',
          source:
            'docs/ai/new1-rerank/pools.json (NEW1, builtAt ' +
            pools.builtAt +
            ', efSearch ' +
            pools.efSearch +
            ', depth ' +
            pools.depth +
            ')',
          queryRelative: true,
          note: 'NEVER a global negative -- valid only against queryId above',
        },
      });
    }

    const byGroup: Record<string, number> = {};
    for (const r of negRows)
      byGroup[(r as { queryGroup: string }).queryGroup] =
        (byGroup[(r as { queryGroup: string }).queryGroup] ?? 0) + 1;

    const doc = {
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: 'NEW3',
      purpose:
        'P4 of the mission brief: query-relative hard negatives mined from NEW1 saved dense-retrieval pools, not a fresh DB scan.',
      minedFrom: `docs/ai/new1-rerank/pools.json (${pools.queries.length} queries, depth ${pools.depth}, built ${pools.builtAt})`,
      method: `top ${NEGATIVES_PER_QUERY} non-gold judgments per query by ascending cosine distance (chunk-deduped to judgment level, min dist kept). Every negative is query-relative and carries its queryId -- never usable as a global negative.`,
      categorisationPolicy:
        'Signals (sameCourtAsGold, titleTokenOverlapWithGold, laterThanGold) are computed mechanically and reported as INFER-tagged candidate labels, not asserted facts. "same issue wrong proposition" and "quoted precedent not supporting" from the brief require semantic judgement this script does not make and are deliberately NOT fabricated.',
      totalNegatives: negRows.length,
      totalQueries: pools.queries.length,
      skippedNoMetadata: skippedNoMeta,
      byGroup,
      negatives: negRows,
    };

    const outPath = new URL('../../../docs/ai/new3-hard-negatives.json', import.meta.url);
    writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);

    console.log(`\nwrote ${negRows.length} query-relative hard negatives`);
    console.log('by group:', byGroup);
    console.log(`skipped (no metadata): ${skippedNoMeta}`);
    console.log(`wrote docs/ai/new3-hard-negatives.json`);
  } finally {
    await sql.end();
  }
}

await main();
