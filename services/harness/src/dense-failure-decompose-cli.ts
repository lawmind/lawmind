/**
 * `pnpm --filter @lawmind/harness dense:decompose` — WHY document-vector dense
 * retrieval only reaches ~13–15% success@5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NUMBER THIS EXPLAINS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `reach:docvec` measured, against `new1_probe_half_250k` (256,998 staged
 * document vectors, HNSW, `ef_search=200`, frozen gold `ba9357cba2fbf297`):
 *
 *   fact_passage  n=355 in-index   s@1  9.58   s@5 15.21   s@20 20.56   MRR 0.1217
 *   nl_doctrine   n=195 in-index   s@1  9.23   s@5 13.33   s@20 16.41   MRR 0.1106
 *
 * 95%+ of gold IS in the index, so "we have not embedded it yet" explains
 * almost none of the loss. What it does not say is WHICH mechanism loses the
 * other 85%, and the prompt is explicit that the answer must not be "try
 * another model".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE MEASUREMENT THAT SPLITS THE TWO CANDIDATE WORLDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * For every gold whose vector EXISTS, this computes the target's **exact
 * cosine rank** — a sequential scan over the whole probe table, no HNSW
 * involved — and compares it with the ANN rank already measured.
 *
 *   exact rank GOOD (≤ topK) but ANN missed   ⇒ INDEX problem (ANN_MISS)
 *   exact rank BAD                            ⇒ REPRESENTATION / QUERY mismatch
 *
 * Those are opposite repairs. An index problem is fixed with `ef_search`,
 * `m`/`ef_construction`, or iterative scan; a representation problem is fixed
 * by changing what text becomes a vector, and no amount of index tuning moves
 * it. Guessing between them is how a lane spends a week on the wrong one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE SECOND DISCRIMINATOR: IS IT THE DOCUMENT OR THE QUERY?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A bad exact rank still has two readings, and they are also opposite repairs:
 *
 *   REPRESENTATION_MISS      the stored vector does not represent the document's
 *                            legal content (HEAD:4800 cut the holding off)
 *   QUERY_VECTOR_MISMATCH    the vector is fine; a typed doctrinal question and
 *                            a judgment's opening pages simply do not land near
 *                            each other in this embedding space
 *
 * `selfRank` separates them. The gold document's OWN stored head text is
 * embedded and used as the query: if the document cannot retrieve ITSELF at
 * rank 1 the stored vector is broken (a damaged-text or pooling fault); if it
 * retrieves itself easily but the advocate's question cannot reach it, the
 * document-side vector is intact and the gap is between the two SHAPES of text
 * — which is the asymmetry an advocate-query-shaped representation, not a new
 * model, is supposed to close.
 *
 * `goldDistance` and `topDistance` are recorded next to the ranks so the gap is
 * a number rather than an adjective: a gold 0.02 behind the winner and a gold
 * 0.4 behind are the same "miss" and completely different problems.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS NOT MEASURED HERE, DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No sparse arm, no RRF, no `/search`. This is the dense arm alone, which is
 * what the 13–15% figure is about. Fusion effects are a separate question and
 * mixing them in would make neither answerable.
 *
 * Read-only. Two connections. Checkpointed per query — a full scan per gold is
 * expensive and a killed run must cost one row, not the run.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import { toVectorLiteral } from '@lawmind/embed';
// GPU sidecar, not the in-process CPU embedder. See harness-embedder.ts: the CPU
// default is right for production and was silently starving the Tier-A walk here.
import { getHarnessEmbedder } from './harness-embedder.ts';
import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const PROBE = process.env['PROBE_TABLE'] ?? 'new1_probe_half_250k';
const EF_SEARCH = Number(process.env['HNSW_EF_SEARCH'] ?? 200);
const TOP_K = Number(process.env['TOP_K'] ?? 20);
/** How much head text is fed back as a self-query. The staged recipe is HEAD:4800. */
const SELF_HEAD_CHARS = Number(process.env['SELF_HEAD_CHARS'] ?? 4800);
/** Self-retrieval costs a second full scan per row, so it is sampled rather than run on all 571. */
const SELF_SAMPLE = Number(process.env['SELF_SAMPLE'] ?? 60);

const OUT = new URL('../../../docs/ai/new1-tier-a/dense-failure-decomposition.json', import.meta.url);
const CKPT = new URL('../../../docs/ai/new1-tier-a/dense-failure-decomposition.checkpoint.jsonl', import.meta.url);

type Row = {
  queryId: string;
  launchClass: string;
  goldId: string;
  queryChars: number;
  inIndex: boolean;
  /** Why it is not in the index, when it is not. */
  absenceReason: string | null;
  annRank: number | null;
  exactRank: number | null;
  goldDistance: number | null;
  topDistance: number | null;
  /** Only for the sampled rows. */
  selfRank: number | null;
  family: string;
  ms: number;
};

/** Earliest cause wins. */
function classify(r: Row): string {
  if (!r.inIndex) return r.absenceReason ?? 'NOT_IN_PROBE_INDEX';
  if (r.annRank !== null && r.annRank <= 5) return 'OK_TOP5';
  if (r.annRank !== null && r.annRank <= TOP_K) return 'OK_TOP20_NOT_TOP5';
  if (r.exactRank === null) return 'OTHER';
  if (r.exactRank <= TOP_K) return 'ANN_MISS';
  if (r.selfRank !== null && r.selfRank > 1) return 'REPRESENTATION_MISS';
  if (r.exactRank <= 200) return 'TARGET_RANKED_TOO_LOW_NEAR';
  return 'QUERY_VECTOR_MISMATCH_OR_REPRESENTATION';
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');

  const gold = buildLaunchGold();
  const rows0 = gold.rows.filter((r) => r.launchClass === 'nl_doctrine' || r.launchClass === 'fact_passage');
  process.stdout.write(`dense failure decomposition  probe=${PROBE}  n=${rows0.length}  ef=${EF_SEARCH}\n`);

  const sql = postgres(url, {
    max: 2,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 180_000 },
  });

  const done = new Set<string>();
  const results: Row[] = [];
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const r = JSON.parse(line) as Row;
        done.add(r.queryId);
        results.push(r);
      } catch {
        /* truncated final line from a killed run */
      }
    }
    process.stdout.write(`  resuming: ${done.size} already measured\n`);
  }

  // Which gold authorities are in the probe, and for those that are not, WHY.
  const ids = [...new Set(rows0.map((r) => r.goldAuthorityId))];
  const present = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const r = await sql.unsafe(`SELECT judgment_id FROM ${PROBE} WHERE judgment_id = ANY($1::uuid[])`, [
      ids.slice(i, i + 500),
    ]);
    for (const x of r) present.add(x['judgment_id'] as string);
  }
  const absent = ids.filter((id) => !present.has(id));
  const absenceReason = new Map<string, string>();
  if (absent.length > 0) {
    const reasons = await sql<{ id: string; held: boolean; text_safety: string | null; tier: string | null }[]>`
      SELECT j.id,
             TRUE AS held,
             e.text_safety,
             e.semantic_tier AS tier
        FROM judgments j
        LEFT JOIN judgment_embedding_eligibility e ON e.id = j.id
       WHERE j.id = ANY(${absent}::uuid[])`;
    const seen = new Set<string>();
    for (const r of reasons) {
      seen.add(r.id);
      absenceReason.set(
        r.id,
        r.text_safety === 'UNSAFE_VERIFIED'
          ? 'TEXT_UNSAFE'
          : r.tier === null || r.tier === 'NOT_ELIGIBLE'
            ? 'INELIGIBLE'
            : 'NOT_STAGED',
      );
    }
    for (const id of absent) if (!seen.has(id)) absenceReason.set(id, 'TARGET_NOT_HELD');
  }
  process.stdout.write(`  in probe ${present.size}/${ids.length}; absent ${absent.length}\n`);

  const embedder = (await getHarnessEmbedder()).embedder;
  // Deterministic self-retrieval sample: the first SELF_SAMPLE in gold order that miss.
  let selfBudget = SELF_SAMPLE;

  try {
    for (const [i, g] of rows0.entries()) {
      if (done.has(g.queryId)) continue;
      const t0 = Date.now();
      const inIndex = present.has(g.goldAuthorityId);
      const r: Row = {
        queryId: g.queryId,
        launchClass: g.launchClass,
        goldId: g.goldAuthorityId,
        queryChars: g.query.length,
        inIndex,
        absenceReason: inIndex ? null : (absenceReason.get(g.goldAuthorityId) ?? 'NOT_IN_PROBE_INDEX'),
        annRank: null,
        exactRank: null,
        goldDistance: null,
        topDistance: null,
        selfRank: null,
        family: 'PENDING',
        ms: 0,
      };

      if (inIndex) {
        const [e] = await embedder.embed([g.query]);
        const vec = e === undefined ? null : toVectorLiteral(e.vector);
        if (vec !== null) {
          // ANN, at production's settings.
          const hits = await sql.begin(async (tx) => {
            await tx.unsafe(`SET LOCAL hnsw.ef_search = ${EF_SEARCH}`);
            return tx.unsafe(`SELECT judgment_id FROM ${PROBE} ORDER BY embedding <=> $1::halfvec LIMIT ${TOP_K}`, [
              vec,
            ]);
          });
          const at = hits.findIndex((h) => h['judgment_id'] === g.goldAuthorityId);
          r.annRank = at === -1 ? null : at + 1;

          // EXACT rank — one sequential scan, no index, distance computed once per row.
          const [gd] = await sql.unsafe(
            `SELECT (embedding <=> $1::halfvec) AS d FROM ${PROBE} WHERE judgment_id = $2::uuid`,
            [vec, g.goldAuthorityId],
          );
          if (gd !== undefined) {
            r.goldDistance = Number(gd['d']);
            const [agg] = await sql.unsafe(
              `SELECT count(*) FILTER (WHERE d < $2::float8) AS better, min(d) AS best
                 FROM (SELECT (embedding <=> $1::halfvec)::float8 AS d FROM ${PROBE}) s`,
              [vec, r.goldDistance],
            );
            if (agg !== undefined) {
              r.exactRank = Number(agg['better']) + 1;
              r.topDistance = Number(agg['best']);
            }
          }

          // Self-retrieval, on a bounded sample of the misses only.
          if (selfBudget > 0 && (r.annRank === null || r.annRank > 5)) {
            const [txt] = await sql<{ head: string | null }[]>`
              SELECT left(full_text, ${SELF_HEAD_CHARS}) AS head FROM judgments WHERE id = ${g.goldAuthorityId}`;
            const head = txt?.head ?? null;
            if (head !== null && head.length > 0) {
              const [se] = await embedder.embed([head]);
              if (se !== undefined) {
                const sv = toVectorLiteral(se.vector);
                const [sd] = await sql.unsafe(
                  `SELECT (embedding <=> $1::halfvec) AS d FROM ${PROBE} WHERE judgment_id = $2::uuid`,
                  [sv, g.goldAuthorityId],
                );
                if (sd !== undefined) {
                  const [sagg] = await sql.unsafe(
                    `SELECT count(*) FILTER (WHERE d < $2::float8) AS better
                       FROM (SELECT (embedding <=> $1::halfvec)::float8 AS d FROM ${PROBE}) s`,
                    [sv, Number(sd['d'])],
                  );
                  if (sagg !== undefined) r.selfRank = Number(sagg['better']) + 1;
                  selfBudget -= 1;
                }
              }
            }
          }
        }
      }

      r.ms = Date.now() - t0;
      r.family = classify(r);
      appendFileSync(CKPT, `${JSON.stringify(r)}\n`);
      results.push(r);
      process.stdout.write(
        `${String(i + 1).padStart(3)}/${rows0.length} ${r.family.padEnd(38)} ann=${String(r.annRank ?? '-').padStart(4)} exact=${String(r.exactRank ?? '-').padStart(7)} self=${String(r.selfRank ?? '-').padStart(6)} d=${r.goldDistance?.toFixed(4) ?? '-'} top=${r.topDistance?.toFixed(4) ?? '-'} ${r.ms}ms\n`,
      );
    }
  } finally {
    const byFamily: Record<string, number> = {};
    for (const r of results) byFamily[r.family] = (byFamily[r.family] ?? 0) + 1;
    const exactBuckets: Record<string, number> = {};
    for (const r of results) {
      if (r.exactRank === null) continue;
      const k =
        r.exactRank === 1
          ? '1'
          : r.exactRank <= 5
            ? '2-5'
            : r.exactRank <= 20
              ? '6-20'
              : r.exactRank <= 200
                ? '21-200'
                : r.exactRank <= 2000
                  ? '201-2k'
                  : r.exactRank <= 20000
                    ? '2k-20k'
                    : '>20k';
      exactBuckets[k] = (exactBuckets[k] ?? 0) + 1;
    }
    const selfRows = results.filter((r) => r.selfRank !== null);
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          kind: 'new1_dense_failure_decomposition',
          measuredAt: new Date().toISOString(),
          frozenHash: gold.frozenHash,
          probe: PROBE,
          probeRows: 256998,
          efSearch: EF_SEARCH,
          topK: TOP_K,
          conditions: 'LOCAL_CONTENDED — the Tier-A GPU walk was staging throughout',
          measured: results.length,
          byFamily,
          exactRankBuckets: exactBuckets,
          selfRetrieval: {
            sampled: selfRows.length,
            rankOne: selfRows.filter((r) => r.selfRank === 1).length,
            worseThanFive: selfRows.filter((r) => (r.selfRank ?? 0) > 5).length,
          },
          rows: results,
        },
        null,
        2,
      )}\n`,
    );
    process.stdout.write(`\nWROTE ${OUT.pathname}\n${JSON.stringify(byFamily, null, 2)}\n`);
    await sql.end({ timeout: 10 });
  }
}

await main();
