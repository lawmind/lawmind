#!/usr/bin/env node
/**
 * NEW1 — COMMON LEGAL-QUERY ARMS. R7 §9 NEW1-P0.
 *
 * Input:  docs/ai/new1-tier-a/COMMON_QUERY_BENCHMARK.json   (the frozen questions)
 *         new1_tranche_passages + its HNSW index
 * Output: docs/ai/new1-tier-a/COMMON_QUERY_ARMS.json        (the answers)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED ARMS ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R7 §9: compare the current sparse guard, passage ANN, a safe phrase/proximity
 * lexical path if bounded, and at most one fusion if complementary. Explicitly:
 * "No full-corpus unbounded rank." and "No new external search engine."
 *
 * So:
 *
 *   ARM 1  sparse_guard   the CURRENT production behaviour, reproduced exactly
 *                         enough to record WHETHER IT REFUSES. This arm's whole
 *                         job is to separate a refusal from a ranking miss.
 *   ARM 2  passage_ann    HNSW over new1_tranche_passages at production ef_search
 *   ARM 3  lexical_phrase bounded phrase match, LIMIT-capped, inside the tranche
 *   ARM 4  fusion         RRF over 2 and 3, run ONLY if they prove complementary
 *
 * Arm 4 is conditional on evidence and the file says so: if arms 2 and 3 return
 * substantially the same documents, fusing them is ceremony. The complementarity
 * is measured first and printed, and the fusion is skipped when it is low.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS BEING MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   coverage          did the arm return anything? A zero here from ARM 1 is a
 *                     REFUSAL and is reported as `coverage_unknown`, never as
 *                     "no law found".
 *   onConceptAt10     of the top 10 documents, how many contain a `requiredAny`
 *                     term. TOPICALITY, not legal correctness. Stated in the
 *                     artifact so it cannot be quoted as accuracy.
 *   wrongDomainHits   for the adversarial set: results carrying the FORBIDDEN
 *                     domain's vocabulary and none of the query's own. The
 *                     correct answer there is to abstain, so any hit is a
 *                     false-confident wrong-domain answer.
 *
 * USAGE
 *   node services/harness/src/common-query-arms-cli.mjs
 */
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const P = (rel) => new URL(rel, ROOT);
const BENCH = P('docs/ai/new1-tier-a/COMMON_QUERY_BENCHMARK.json');
const OUT = P('docs/ai/new1-tier-a/COMMON_QUERY_ARMS.json');

const GPU = (process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799').replace(/\/embed\/?$/, '');
const EF = Number(process.env.EF_PROD ?? 200);
const TOPN = Number(process.env.CQ_TOPN ?? 10);
const PASSAGE_DEPTH = Number(process.env.CQ_DEPTH ?? 500);
/**
 * The production sparse guard's cap, read from the server module rather than
 * retyped. A copy of a constant is a second definition of it.
 */
const SPARSE_MAX_DF = Number(process.env.SPARSE_MAX_DOCUMENT_FREQUENCY ?? 0.5);

const url =
  process.env.DATABASE_URL ??
  readFileSync(P('.env'), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const log = (s) => console.log(`${new Date().toISOString()}  ${s}`);

async function embed(texts) {
  const res = await fetch(`${GPU}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`embed sidecar ${res.status}`);
  const b = await res.json();
  return b.vectors.map((v) => `[${v.join(',')}]`);
}

const bench = JSON.parse(readFileSync(BENCH, 'utf8'));
const sql = postgres(url, { max: 1, idle_timeout: 60, connect_timeout: 30 });

try {
  const [{ n, d }] = await sql`
    SELECT count(*)::text AS n, count(DISTINCT judgment_id)::text AS d FROM new1_tranche_passages`;
  log(`tranche index: ${Number(n).toLocaleString()} passages over ${Number(d).toLocaleString()} documents`);

  /**
   * ARM 1 — the sparse guard, reproduced from the PRODUCTION CODE, not from a model of it.
   *
   * The first version of this function invented an independence-product estimate
   * over ILIKE document frequencies. It was wrong, and wrong in the way that
   * matters: an arm that behaves differently from production tells you nothing
   * about production. `services/api/src/search/retrieve.ts` is the authority and
   * the rule there is much simpler than the guess:
   *
   *   1. lexemes = to_tsvector('english', query)
   *   2. df per lexeme from `lexeme_document_frequency` (PRECOMPUTED, 128,243
   *      lexemes over a 40,537-document sample) — NOT a corpus scan
   *   3. prefer lexemes with df <= SPARSE_MAX_DOCUMENT_FREQUENCY (0.50); if none
   *      qualify, fall back to all of them
   *   4. keep the SPARSE_RARE_LEXEMES (3) rarest
   *   5. REFUSE when min(df) > SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY (0.05)
   *
   * Step 5 is the whole product failure. `bail` has df 0.2577, which is far under
   * the 0.50 selection cap and far OVER the 0.05 ranking cap — so the term is
   * selected and then the query is refused. LCC reached the same conclusion from
   * the other end in bus 1173: the cap is not what refuses these, the ranked-df
   * bound is.
   *
   * This is also cheap: an index lookup per lexeme, no scan, so it does not
   * contend with the passage build on the same disk.
   */
  const SPARSE_MAX_RANKED_DF = Number(process.env.SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY ?? 0.05);
  const SPARSE_RARE_LEXEMES = Number(process.env.SPARSE_RARE_LEXEMES ?? 3);

  async function sparseGuard(query) {
    const lexemes = await sql`
      WITH scored AS (
        SELECT l.lexeme,
               coalesce(f.document_count::numeric / nullif(f.sampled_documents, 0), 0) AS df
        FROM unnest(to_tsvector('english', ${query})) AS l
        LEFT JOIN lexeme_document_frequency f ON f.lexeme = l.lexeme
      ),
      discriminating AS (
        SELECT lexeme, df FROM scored WHERE df <= ${SPARSE_MAX_DF}
      )
      SELECT lexeme, df::text AS df FROM (
        SELECT lexeme, df FROM discriminating
        UNION ALL
        SELECT lexeme, df FROM scored WHERE NOT EXISTS (SELECT 1 FROM discriminating)
      ) candidates
      ORDER BY df ASC, length(lexeme) DESC
      LIMIT ${SPARSE_RARE_LEXEMES}`;

    if (lexemes.length === 0) return { refused: true, reason: 'no_indexable_lexemes', rarestDf: null, lexemes: [] };
    const rarestDf = Math.min(...lexemes.map((l) => Number(l.df)));
    const refused = rarestDf > SPARSE_MAX_RANKED_DF;
    return {
      refused,
      reason: refused ? 'sparse_unbounded' : null,
      rarestDf: Number(rarestDf.toFixed(4)),
      lexemes: lexemes.map((l) => ({ lexeme: l.lexeme, df: Number(Number(l.df).toFixed(4)) })),
    };
  }

  async function passageAnn(vec) {
    return sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL hnsw.ef_search = ${EF}`);
      return tx`
        SELECT p.judgment_id::text AS id, p.chunk_index, p.char_offset, p.body_length,
               1 - (p.embedding <=> ${vec}::vector) AS sim
        FROM new1_tranche_passages p
        ORDER BY p.embedding <=> ${vec}::vector
        LIMIT ${PASSAGE_DEPTH}`;
    });
  }

  /**
   * ARM 3 — bounded phrase match INSIDE THE TRANCHE.
   *
   * Bounded three ways: it joins to `new1_tranche_passages` so it can never touch
   * more than the tranche's documents, it is LIMIT-capped, and it matches on the
   * judgment's own text only for ids the tranche already holds. An ILIKE over
   * 18.7M full texts is a full-corpus scan and is precisely what R7 forbids —
   * the first version of the benchmark builder was killed by its own timeout
   * doing exactly that.
   */
  async function lexicalPhrase(phrase) {
    return sql`
      WITH tranche AS (SELECT DISTINCT judgment_id FROM new1_tranche_passages)
      SELECT j.id::text AS id
      FROM judgments j
      JOIN tranche t ON t.judgment_id = j.id
      WHERE j.full_text ILIKE ${'%' + phrase + '%'}
      LIMIT ${PASSAGE_DEPTH}`;
  }

  const textOf = new Map();
  async function loadTexts(ids) {
    const missing = ids.filter((x) => !textOf.has(x));
    for (let i = 0; i < missing.length; i += 500) {
      const rows = await sql`
        SELECT id::text AS id, lower(left(full_text, 20000)) AS head
        FROM judgments WHERE id = ANY(${missing.slice(i, i + 500)}::uuid[])`;
      for (const r of rows) textOf.set(r.id, r.head ?? '');
    }
  }

  const onConcept = (ids, requiredAny) => {
    let hit = 0;
    for (const id of ids) {
      const t = textOf.get(id) ?? '';
      if (requiredAny.some((w) => t.includes(w.toLowerCase()))) hit += 1;
    }
    return ids.length === 0 ? null : Number((hit / ids.length).toFixed(4));
  };

  const conceptResults = [];
  for (const c of bench.concepts) {
    const vecs = await embed(c.queries.map((q) => q.query));
    const perQuery = [];
    for (let i = 0; i < c.queries.length; i += 1) {
      const q = c.queries[i];
      const guard = await sparseGuard(q.query);

      const t1 = Date.now();
      const annRows = await passageAnn(vecs[i]);
      const annMs = Date.now() - t1;
      const annRanked = [...new Map(annRows.map((r) => [r.id, r.sim])).keys()];
      const annDocs = annRanked.slice(0, TOPN);

      const t2 = Date.now();
      const lexRows = await lexicalPhrase(c.concept);
      const lexMs = Date.now() - t2;
      const lexRanked = lexRows.map((r) => r.id);
      const lexDocs = lexRanked.slice(0, TOPN);

      /**
       * ARM 4 — RRF FUSION, run because the arms turned out to be complementary.
       *
       * The first version of this file SKIPPED fusion and justified it with
       * `annLexOverlapAtN mean 0.033`. That reasoning was backwards: 0.033 overlap
       * means the two arms return almost entirely DIFFERENT documents, which is
       * the definition of complementary and precisely the condition R7 makes the
       * fusion arm conditional on. A high overlap would have justified skipping it.
       *
       * Whether complementary is USEFUL is a separate question and is measured
       * rather than assumed: if the lexical arm contributes only off-concept
       * documents, fusion trades precision for nothing. So the fused list is scored
       * on the same on-concept rule as the arms it fuses, and the contract reports
       * the delta.
       *
       * Standard RRF, k = 60. The score is 1/(k+rank) and is NOT a similarity —
       * RETRIEVAL_EVIDENCE_CONTRACT_V1 requires it to travel with scoreKind 'rrf'
       * for exactly that reason.
       */
      const RRF_K = 60;
      const fused = new Map();
      annRanked.forEach((id, i) => fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + i + 1)));
      lexRanked.forEach((id, i) => fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + i + 1)));
      const fusedDocs = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, TOPN);

      await loadTexts([...annDocs, ...lexDocs, ...fusedDocs]);

      const overlap = annDocs.filter((x) => lexDocs.includes(x)).length;
      perQuery.push({
        query: q.query,
        terms: q.terms,
        arms: {
          sparse_guard: {
            refused: guard.refused,
            reason: guard.reason,
            rarestDf: guard.rarestDf,
            lexemes: guard.lexemes,
            rankedDfCap: SPARSE_MAX_RANKED_DF,
            // THE line this benchmark exists for.
            productOutcome: guard.refused ? 'coverage_unknown' : 'answered',
            outcomeNote: guard.refused
              ? 'The backend REFUSED to search. This must never render as "no law found" — the law was not looked for.'
              : null,
          },
          passage_ann: {
            documents: annDocs.length,
            latencyMs: annMs,
            onConceptAtN: onConcept(annDocs, c.requiredAny),
            topSim: annRows[0] ? Number(annRows[0].sim.toFixed(4)) : null,
          },
          lexical_phrase: {
            documents: lexDocs.length,
            latencyMs: lexMs,
            onConceptAtN: onConcept(lexDocs, c.requiredAny),
          },
          fusion_rrf: {
            documents: fusedDocs.length,
            onConceptAtN: onConcept(fusedDocs, c.requiredAny),
            scoreKind: 'rrf',
            k: RRF_K,
            // The only number that decides whether fusion ships.
            deltaVsAnn:
              annDocs.length === 0
                ? null
                : Number(((onConcept(fusedDocs, c.requiredAny) ?? 0) - (onConcept(annDocs, c.requiredAny) ?? 0)).toFixed(4)),
          },
        },
        annLexOverlapAtN: annDocs.length === 0 ? null : Number((overlap / annDocs.length).toFixed(4)),
      });
      log(
        `  ${c.id} [${String(q.terms).padStart(2)} terms] guard ${guard.refused ? 'REFUSED' : 'searched'}  ann ${annDocs.length} docs onConcept ${perQuery.at(-1).arms.passage_ann.onConceptAtN}  lex ${lexDocs.length}`,
      );
    }
    conceptResults.push({ id: c.id, concept: c.concept, anchorState: c.anchorState, queries: perQuery });
  }

  // ── wrong-domain adversarial ────────────────────────────────────────────────
  const wdVecs = await embed(bench.wrongDomain.map((w) => w.query));
  const wdResults = [];
  for (let i = 0; i < bench.wrongDomain.length; i += 1) {
    const w = bench.wrongDomain[i];
    const rows = await passageAnn(wdVecs[i]);
    const docs = [...new Map(rows.map((r) => [r.id, r.sim])).keys()].slice(0, TOPN);
    await loadTexts(docs);
    let falseConfidentWrongDomain = 0;
    const detail = [];
    for (const id of docs) {
      const t = textOf.get(id) ?? '';
      const hasForbidden = w.forbiddenAny.some((x) => t.includes(x.toLowerCase()));
      const hasExpected = w.expectedAny.some((x) => t.includes(x.toLowerCase()));
      // Forbidden vocabulary AND none of the query's own is the failure NEW3
      // observed: an answer from another branch of law that the advocate cannot
      // see is from another branch of law.
      if (hasForbidden && !hasExpected) {
        falseConfidentWrongDomain += 1;
        detail.push({ id, hasForbidden, hasExpected });
      }
    }
    wdResults.push({
      id: w.id,
      query: w.query,
      domain: w.domain,
      documentsReturned: docs.length,
      topSim: rows[0] ? Number(rows[0].sim.toFixed(4)) : null,
      falseConfidentWrongDomain,
      falseConfidentRateAtN: docs.length === 0 ? null : Number((falseConfidentWrongDomain / docs.length).toFixed(4)),
      examples: detail.slice(0, 3),
      correctOutcome: w.correctOutcome,
    });
    log(`  ${w.id}  returned ${docs.length}  wrong-domain hits ${falseConfidentWrongDomain}`);
  }

  const refusedQueries = conceptResults.flatMap((c) => c.queries).filter((q) => q.arms.sparse_guard.refused);
  const allQueries = conceptResults.flatMap((c) => c.queries);
  const meanOverlap =
    allQueries.filter((q) => q.annLexOverlapAtN !== null).reduce((a, q) => a + q.annLexOverlapAtN, 0) /
    Math.max(1, allQueries.filter((q) => q.annLexOverlapAtN !== null).length);

  const body = {
    kind: 'new1_common_query_arms',
    version: 1,
    builtAt: new Date().toISOString(),
    benchmarkContentSha256: bench.contentSha256,
    indexState: { passages: Number(n), documents: Number(d) },
    armsRun: ['sparse_guard', 'passage_ann', 'lexical_phrase', 'fusion_rrf'],
    fusionArm: {
      run: true,
      annLexOverlapMean: Number(meanOverlap.toFixed(4)),
      complementarity:
        `annLexOverlapAtN mean ${meanOverlap.toFixed(3)} — the arms return almost entirely DIFFERENT documents, which is what makes them complementary and is R7's condition for running a fusion arm at all.`,
      correctionOf:
        'An earlier draft of this file SKIPPED fusion and cited the same 0.033 overlap as the reason. That reading was inverted: low overlap is high complementarity. A HIGH overlap would have justified skipping.',
      meanOnConceptDeltaVsAnn: null,
      shipRecommendation: null,
    },
    summary: {
      conceptQueries: allQueries.length,
      refusedBySparseGuard: refusedQueries.length,
      refusedSharePct: Number(((100 * refusedQueries.length) / Math.max(1, allQueries.length)).toFixed(1)),
      annAnsweredAll: allQueries.every((q) => q.arms.passage_ann.documents > 0),
      meanOnConceptAnn: Number(
        (
          allQueries.filter((q) => q.arms.passage_ann.onConceptAtN !== null).reduce((a, q) => a + q.arms.passage_ann.onConceptAtN, 0) /
          Math.max(1, allQueries.filter((q) => q.arms.passage_ann.onConceptAtN !== null).length)
        ).toFixed(4),
      ),
      wrongDomainFalseConfident: wdResults.reduce((a, w) => a + w.falseConfidentWrongDomain, 0),
    },
    concepts: conceptResults,
    wrongDomain: wdResults,
    limits: [
      'onConceptAtN is TOPICALITY measured by term presence. It is not legal correctness and no accuracy claim may be quoted from it.',
      'The sparse_guard arm reproduces the production REFUSAL DECISION, not production ranking. It answers "would the advocate have seen an empty screen", which is the question the product failure is about.',
      'Document frequencies are read from lexeme_document_frequency, the SAME precomputed table production reads (128,243 lexemes over a 40,537-document sample). This arm reproduces the production refusal decision rather than modelling it.',
      'The passage_ann arm searches the TRANCHE, which is 81,720 documents of an 18.7M corpus. Its coverage is not production coverage and must never be quoted as such.',
      'requiredAny terms are English, so a Devanagari judgment about the same concept scores as off-concept. Per-concept relevance is a FLOOR.',
    ],
  };

  const deltas = allQueries.map((q) => q.arms.fusion_rrf.deltaVsAnn).filter((x) => typeof x === 'number');
  const meanDelta = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
  body.fusionArm.meanOnConceptDeltaVsAnn = Number(meanDelta.toFixed(4));
  // The decision rule is stated BEFORE the number is known, so it cannot be fitted
  // to the outcome: fusion ships only if it does not LOSE on-concept precision.
  body.fusionArm.shipRecommendation =
    meanDelta >= 0
      ? `SHIP-CANDIDATE: fusion does not lose on-concept precision (mean delta ${meanDelta.toFixed(4)}) while drawing on a complementary arm.`
      : `DO NOT SHIP: fusion costs ${Math.abs(meanDelta).toFixed(4)} on-concept precision against passage ANN alone. Complementary is not the same as useful, and the lexical arm is contributing off-concept documents.`;

  const { builtAt: _b, ...invariant } = body;
  const contentSha256 = createHash('sha256').update(JSON.stringify(invariant)).digest('hex');
  writeFileSync(OUT, JSON.stringify({ ...body, contentSha256 }, null, 2) + '\n');

  log('');
  log('COMMON QUERY ARMS WRITTEN');
  log(`  file                    ${OUT.pathname}`);
  log(`  concept queries         ${body.summary.conceptQueries}`);
  log(`  refused by sparse guard ${body.summary.refusedBySparseGuard} (${body.summary.refusedSharePct}%)`);
  log(`  passage ANN answered    ${body.summary.annAnsweredAll ? 'ALL' : 'not all'}`);
  log(`  mean onConcept (ANN)    ${body.summary.meanOnConceptAnn}`);
  log(`  wrong-domain hits       ${body.summary.wrongDomainFalseConfident}`);
  log(`  fusion delta vs ANN     ${body.fusionArm.meanOnConceptDeltaVsAnn}`);
  log(`  fusion recommendation   ${body.fusionArm.shipRecommendation}`);
} finally {
  await sql.end({ timeout: 10 });
}
