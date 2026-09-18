/**
 * `pnpm --filter @lawmind/harness held:whymissed` — the 16 cases that should
 * have been impossible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SURPRISE THIS EXISTS TO EXPLAIN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `held:decompose` measured, exactly, where every `HELD_NOT_RETRIEVED` gold
 * judgment sits in the dense arm. 124 of 140 are genuinely far away
 * (`SEMANTIC_RANKED_LOW`) — the model does not think they are near the query,
 * and no constant fixes that.
 *
 * **16 are not.** Their nearest chunk is the 17th, 22nd, 29th… nearest chunk in
 * a 620,300-chunk corpus, at judgment rank 15, 18, 25 — comfortably inside BOTH
 * cut points `dense()` applies (200 chunks, 50 judgments). Exact arithmetic says
 * the dense arm had them in hand. The pipeline returned neither.
 *
 * A retrieval system losing a document it ranked 15th is not a ranking problem.
 * It is a defect, a measurement artifact, or an index that is lying — and which
 * of those it is changes what anyone should do next, so it gets measured rather
 * than reasoned about.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE CANDIDATE CAUSES, AND HOW EACH IS TOLD APART
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1 · **HNSW APPROXIMATION.** `dense()` runs `ef_search = 200` and asks for
 *     `annDepth = 200` — `retrieve.ts`'s own comment flags that this has "no
 *     margin at all", with `iterative_scan = relaxed_order` as the safety net.
 *     Measured recall@50 at this setting was 96.9%, i.e. ~3% loss, so this can
 *     explain a few of 140 but not obviously 16.
 *     **Told apart by**: running the dense arm alone and asking whether gold
 *     comes back. Exact says it should; if the ANN does not return it, the
 *     index is the loss.
 *
 * 2 · **RRF FUSION DISPLACEMENT.** The fused list is at most 100 distinct
 *     judgments (50 dense + 50 sparse) and the classifier cut at 50. A gold at
 *     dense rank 15 scores `1/(60+15)`, which sparse ranks 1–24 beat. Arithmetic
 *     says it should still land inside 50 — but arithmetic said the same about
 *     the 16, so it is checked rather than trusted.
 *     **Told apart by**: comparing gold's rank in `dense` mode against `hybrid`.
 *
 * 3 · **THE `content_hash` DUPLICATE COLLAPSE — and this one would be a
 *     BENCHMARK-VALIDITY finding, not a retrieval defect.** `hybridSearch` keeps
 *     one row per DOCUMENT: `if (seenHash.has(r.content_hash)) continue`. Its
 *     comment argues, correctly, that this is a collapse and not a silent drop
 *     — the kept row is byte-identical by sha256, so nothing an advocate could
 *     act on is lost.
 *
 *     **But the benchmark does not compare documents. It compares IDs.**
 *     `failure-classifier-cli.ts` asks `goldJudgmentIds.includes(retrieved[i]
 *     .judgmentId)`. If a duplicate ROW of the gold judgment outranks it, the
 *     duplicate's different id is what survives the collapse, the gold id never
 *     appears, and the query is recorded as `AUTHORITY_HELD_BUT_NOT_RETRIEVED`
 *     — when in truth the advocate was shown the correct document. NEW2's
 *     ingest is known to carry duplicates (925 redundant HC copies, and the
 *     corpus has grown 45x since that count).
 *     **Told apart by**: asking whether any OTHER judgment shares gold's
 *     `content_hash`, and whether that twin is in the returned list.
 *
 * Same gold, same queries, no new labels. `LANE_PROTOCOL.md` §4: a refusal is a
 * result, and so is "our own instrument was miscounting".
 */
import { readFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { openDb } from '@lawmind/ingest/db-host';

import { hybridSearch } from '@lawmind/api/search/retrieve';

type Row = {
  queryId: string;
  goldJudgmentIds: string[];
  mechanism: string;
  chunkRank: number | null;
  judgmentRank: number | null;
};
type HarnessQuery = {
  id: string;
  group: string;
  query: string;
  goldJudgmentIds: string[];
  provenance?: { citingJudgmentId?: string };
};

const DECOMPOSE = new URL('../../../held-not-retrieved-checkpoint.jsonl', import.meta.url);

function loadFixture(name: string): { queries?: HarnessQuery[] } {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as never;
}

async function main(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const rows = readFileSync(DECOMPOSE, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Row)
    .filter((r) => r.mechanism === 'DENSE_OK_BUT_MISSED');

  const queries = new Map(
    [
      ...(loadFixture('queries.eval.json').queries ?? []),
      ...(loadFixture('queries.hand.json').queries ?? []),
      ...(loadFixture('queries.derived.json').queries ?? []),
    ].map((q) => [q.id, q]),
  );

  console.log('WHY WERE THESE MISSED? — exact dense ranked them inside both cut points');
  console.log('='.repeat(78));
  console.log(`${rows.length} cases\n`);

  const sql = await openDb(url, 3);
  try {
    const embedder = await getEmbedder();
    const tally = { ann: 0, fusion: 0, duplicate: 0, reproducedMiss: 0, notReproduced: 0 };

    for (const r of rows) {
      const q = queries.get(r.queryId);
      if (!q) {
        console.log(`  ${r.queryId} — not in fixtures, skipped`);
        continue;
      }

      const [emb] = await embedder.embed([q.query]);
      const v = emb ? toVectorLiteral(emb.vector) : null;
      const excluded = new Set(
        q.provenance?.citingJudgmentId ? [q.provenance.citingJudgmentId] : [],
      );

      const rank = async (
        mode: 'hybrid' | 'dense',
      ): Promise<{ rank: number | null; ids: string[] }> => {
        const raw = await hybridSearch(sql, q.query, v, {}, 50 + excluded.size, mode);
        const ids = raw
          .filter((x) => !excluded.has(x.judgmentId))
          .slice(0, 50)
          .map((x) => x.judgmentId);
        const i = ids.findIndex((id) => r.goldJudgmentIds.includes(id));
        return { rank: i === -1 ? null : i + 1, ids };
      };

      const hybrid = await rank('hybrid');
      const denseOnly = await rank('dense');

      /**
       * Does gold have a byte-identical twin, and did the twin take its slot?
       * `content_hash` is sha256 of `full_text`; NULL means not yet computed and
       * is never treated as a duplicate (`retrieve.ts`: "absent is not equal").
       */
      const twins = await sql<{ id: string; twin: string }[]>`
        SELECT g.id, d.id AS twin
        FROM judgments g
        JOIN judgments d ON d.content_hash = g.content_hash AND d.id <> g.id
        WHERE g.id = ANY(${r.goldJudgmentIds}) AND g.content_hash IS NOT NULL`;
      const twinIds = new Set(twins.map((t) => t.twin));
      const twinInResults = hybrid.ids.some((id) => twinIds.has(id));

      let verdict: string;
      if (hybrid.rank !== null) {
        // The original classification does not reproduce. The corpus moved
        // under the benchmark between the two runs — worth knowing, not hidden.
        verdict = `NOT REPRODUCED — gold now at hybrid rank ${hybrid.rank}`;
        tally.notReproduced++;
      } else if (twinInResults) {
        verdict = `DUPLICATE COLLAPSE — a byte-identical twin took the slot (${[...twinIds].slice(0, 2).join(',')})`;
        tally.duplicate++;
        tally.reproducedMiss++;
      } else if (denseOnly.rank === null) {
        verdict = 'ANN LOSS — exact says in-pool, but the dense arm itself does not return it';
        tally.ann++;
        tally.reproducedMiss++;
      } else {
        verdict = `FUSION DISPLACEMENT — dense alone finds it at ${denseOnly.rank}, hybrid loses it`;
        tally.fusion++;
        tally.reproducedMiss++;
      }

      console.log(
        `  ${r.queryId.padEnd(20)} exact(chunk=${r.chunkRank},jud=${r.judgmentRank}) ` +
          `hybrid=${hybrid.rank ?? 'MISS'} dense=${denseOnly.rank ?? 'MISS'} ` +
          `twins=${twinIds.size}\n      ${verdict}`,
      );
    }

    console.log('\n' + '='.repeat(78));
    console.log('ATTRIBUTION');
    console.log(
      `  duplicate collapse (BENCHMARK ARTIFACT, not a retrieval defect) ${tally.duplicate}`,
    );
    console.log(`  ANN approximation loss                                          ${tally.ann}`);
    console.log(
      `  RRF fusion displacement                                         ${tally.fusion}`,
    );
    console.log(
      `  did not reproduce (corpus moved since the classification)       ${tally.notReproduced}`,
    );
  } finally {
    await sql.end();
  }
}

await main();
