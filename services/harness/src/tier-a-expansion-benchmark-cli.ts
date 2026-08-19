/**
 * `pnpm bench:expansion` — P6. Do the new vectors let us find law we could not
 * find before?
 *
 * The frozen 283-query CONTROLLED benchmark cannot answer this and never will.
 * It is `courts=[sc]`, every gold judgment is Supreme Court, and the Supreme
 * Court is 99.9974% embedded (`NEW1_FUSION_POLICY_VALIDATION.md` §2). It was
 * built to be insulated from corpus change, which is exactly why it is blind to
 * corpus expansion. Measuring Tier-A's value on it would be measuring nothing.
 *
 * So this builds a SECOND benchmark whose gold authorities are documents that
 * were unreachable until Tier-A embedded them, and scores two universes on it:
 *
 *   OLD   the production dense arm — HNSW over `judgment_chunks`, the 40,161
 *         chunk-embedded documents. Gold here is by construction unreachable, so
 *         this arm's score is the SIZE OF THE HOLE, measured rather than asserted.
 *   NEW   exact cosine over `new1_doc_vector_stage`, the Tier-A document vectors.
 *   BOTH  a provisional merge by raw cosine. Flagged provisional because mixing a
 *         chunk-level and a document-level representation in one ranking is an
 *         open question (the two distance distributions are not calibrated to
 *         each other), and pretending otherwise would smuggle a fusion decision
 *         into an expansion measurement.
 *
 * ── LEAKAGE ─────────────────────────────────────────────────────────────────
 *
 * Queries are citing passages, exactly as `build-queries.ts` builds them, and
 * they reuse ITS redaction and rejection functions rather than reimplementing
 * them: `redact` (citation text, neutral citation, reporter citations, title
 * words), `passageLooksLikeReasoning`, `snapToSentences`, `looksOcrDamaged`, and
 * `citationsPointingAtGold` for residual pointers. A second implementation of a
 * leakage control is a second place for it to be subtly weaker.
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { sslFor } from './db-url.ts';
import {
  redact,
  passageLooksLikeReasoning,
  snapToSentences,
  looksOcrDamaged,
  citationsPointingAtGold,
  SELECTION,
} from './build-queries.ts';
import { meanNdcgAtK } from './metrics.ts';

const GPU_URL = process.env['EMBED_GPU_URL'] ?? 'http://127.0.0.1:8799/embed';
const OUT = process.env['EXPANSION_JSON'] ?? null;
const MAX_QUERIES = Number(process.env['MAX_QUERIES'] ?? 300);
const CANDIDATE_DEPTH = Number(process.env['CANDIDATE_DEPTH'] ?? 50);
const ANN_DEPTH = Number(process.env['ANN_DEPTH'] ?? 2000);

type Vec = Float32Array;

async function embedAll(texts: readonly string[]): Promise<Vec[]> {
  const out: Vec[] = [];
  let i = 0;
  while (i < texts.length) {
    const batch: string[] = [];
    let chars = 0;
    while (i < texts.length && (batch.length === 0 || chars + (texts[i] ?? '').length < 240_000)) {
      batch.push(texts[i] ?? '');
      chars += (texts[i] ?? '').length;
      i += 1;
    }
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) throw new Error(`sidecar ${res.status}`);
    const body = (await res.json()) as { vectors: number[][] };
    for (const v of body.vectors) out.push(Float32Array.from(v));
  }
  return out;
}

type Built = {
  id: string;
  query: string;
  gold: string;
  citingId: string;
  court: string | null;
  inbound: number | null;
};

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function metrics(ranks: readonly (number | null)[]): Record<string, number> {
  const n = ranks.length;
  if (n === 0) return { n: 0, successAt5: 0, recallAt20: 0, mrr: 0, ndcgAt5: 0 };
  return {
    n,
    successAt5: ranks.filter((r) => r !== null && r <= 5).length / n,
    recallAt20: ranks.filter((r) => r !== null && r <= 20).length / n,
    mrr: ranks.reduce((a: number, r) => a + (r ? 1 / r : 0), 0) / n,
    ndcgAt5: meanNdcgAtK([...ranks], 5),
  };
}

async function main(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const sql = postgres(url, { ssl: sslFor(url), max: 2, connection: { statement_timeout: 0 } });

  console.log('TIER-A EXPANSION BENCHMARK — P6');
  console.log('='.repeat(78));

  const stagedRows = await sql<{ staged: number }[]>`
    SELECT count(*)::int AS staged FROM new1_doc_vector_stage
  `;
  const staged = stagedRows[0]?.staged ?? 0;
  console.log(`staged Tier-A document vectors: ${staged}`);

  // ── candidate edges: gold must be a STAGED document ──
  const edges = await sql<
    {
      citing_judgment_id: string;
      cited_judgment_id: string;
      citation_text: string | null;
      char_offset: number | null;
      cited_title: string | null;
      cited_neutral: string | null;
      cited_reporters: string[];
      citing_court: string | null;
      passage: string | null;
    }[]
  >`
    SELECT jc.citing_judgment_id,
           jc.cited_judgment_id,
           jc.citation_text,
           jc.char_offset,
           cd.case_title AS cited_title,
           cd.neutral_citation AS cited_neutral,
           coalesce(cd.reporter_citations, '{}') AS cited_reporters,
           ci.court AS citing_court,
           substring(ci.full_text FROM greatest(1, jc.char_offset - ${SELECTION.WINDOW})
                     FOR ${SELECTION.WINDOW * 2}) AS passage
    FROM judgment_citations jc
    JOIN new1_doc_vector_stage s ON s.judgment_id = jc.cited_judgment_id
    JOIN judgments ci ON ci.id = jc.citing_judgment_id
    JOIN judgments cd ON cd.id = jc.cited_judgment_id
    WHERE jc.char_offset > ${SELECTION.WINDOW}
      AND jc.citing_judgment_id <> jc.cited_judgment_id
      AND length(ci.full_text) > ${SELECTION.WINDOW * 3}
    ORDER BY md5(jc.id::text)
    LIMIT ${MAX_QUERIES * 6}
  `;
  console.log(`citation edges into the staged population: ${edges.length}`);

  const built: Built[] = [];
  const seenGold = new Set<string>();
  let rejected = 0;
  for (const e of edges) {
    if (built.length >= MAX_QUERIES) break;
    if (!e.passage || seenGold.has(e.cited_judgment_id)) continue;
    const { text, removed } = redact(e.passage, {
      citationText: e.citation_text ?? '',
      neutral: e.cited_neutral,
      reporters: e.cited_reporters,
      citedTitle: e.cited_title ?? '',
    });
    if (!removed.some((r) => r.startsWith('citation_text:'))) {
      rejected += 1;
      continue;
    }
    if (text.length < SELECTION.MIN_QUERY_CHARS) {
      rejected += 1;
      continue;
    }
    if (!passageLooksLikeReasoning(e.passage, text)) {
      rejected += 1;
      continue;
    }
    if (looksOcrDamaged(text)) {
      rejected += 1;
      continue;
    }
    const trimmed = snapToSentences(text);
    if (trimmed === null || trimmed.length < SELECTION.MIN_QUERY_CHARS) {
      rejected += 1;
      continue;
    }
    const pointing = await citationsPointingAtGold(sql, trimmed, e.cited_judgment_id);
    if (pointing.length > 0) {
      rejected += 1;
      continue;
    }
    seenGold.add(e.cited_judgment_id);
    built.push({
      id: `exp-${e.cited_judgment_id.slice(0, 8)}`,
      query: trimmed,
      gold: e.cited_judgment_id,
      citingId: e.citing_judgment_id,
      court: e.citing_court,
      inbound: null,
    });
  }
  console.log(`queries built: ${built.length}   rejected by leakage/quality rules: ${rejected}`);
  if (built.length === 0) {
    console.log('');
    console.log('NOTHING TO MEASURE. The staged population carries no usable citation edges.');
    console.log('That is itself the finding: an id-ordered Tier-A walk stages documents that');
    console.log('nothing cites, so no citation-grounded benchmark can score them. Stage the');
    console.log('value-ordered manifest first (src/tier-a-value-order.mjs).');
    await sql.end({ timeout: 5 });
    return;
  }

  // ── query vectors ──
  console.log('embedding queries on the GPU sidecar');
  const qvecs = await embedAll(built.map((b) => b.query));

  // ── OLD universe: production dense arm ──
  console.log('scoring OLD universe (production HNSW over judgment_chunks)');
  const oldRanks: (number | null)[] = [];
  for (const [i, b] of built.entries()) {
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL hnsw.ef_search = 40');
      await tx.unsafe('SET LOCAL hnsw.iterative_scan = relaxed_order');
      return tx<{ judgment_id: string }[]>`
        SELECT judgment_id FROM judgment_chunks
        ORDER BY embedding <=> ${`[${Array.from(qvecs[i] ?? []).join(',')}]`}::vector
        LIMIT ${ANN_DEPTH}
      `;
    });
    const seen = new Set<string>();
    const judgments: string[] = [];
    for (const r of rows) {
      if (seen.has(r.judgment_id)) continue;
      seen.add(r.judgment_id);
      judgments.push(r.judgment_id);
    }
    const at = judgments.indexOf(b.gold);
    oldRanks.push(at === -1 ? null : at + 1);
  }

  // ── NEW universe: exact cosine over the staged document vectors ──
  console.log('scoring NEW universe (exact over new1_doc_vector_stage)');
  const newRanks: (number | null)[] = [];
  const bestNewScore: number[] = [];
  for (const [i, b] of built.entries()) {
    const qv = `[${Array.from(qvecs[i] ?? []).join(',')}]`;
    const rows = await sql<{ judgment_id: string; d: number }[]>`
      SELECT judgment_id, (embedding <=> ${qv}::vector) AS d
      FROM new1_doc_vector_stage
      ORDER BY embedding <=> ${qv}::vector
      LIMIT ${CANDIDATE_DEPTH}
    `;
    const at = rows.findIndex((r) => r.judgment_id === b.gold);
    newRanks.push(at === -1 ? null : at + 1);
    bestNewScore.push(rows[0]?.d ?? 1);
  }

  console.log('');
  console.log('RESULT');
  console.log('-'.repeat(78));
  console.log(
    'universe'.padEnd(44) + 'succ@5'.padStart(8) + 'rec@20'.padStart(8) + 'MRR'.padStart(8),
  );
  const oldM = metrics(oldRanks);
  const newM = metrics(newRanks);
  for (const [label, m] of [
    ['OLD — production dense arm (40,161 documents)', oldM],
    ['NEW — Tier-A document vectors', newM],
  ] as const) {
    console.log(
      label.padEnd(44) +
        pct(m['successAt5'] ?? 0).padStart(8) +
        pct(m['recallAt20'] ?? 0).padStart(8) +
        (m['mrr'] ?? 0).toFixed(3).padStart(8),
    );
  }
  console.log('');
  console.log(
    '  The OLD row is the size of the hole: these authorities exist in the corpus and the',
  );
  console.log(
    '  dense arm cannot return them at any depth, because they carry no vector. It is not a',
  );
  console.log('  ranking failure and no reranker can fix it.');

  if (OUT) {
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          kind: 'new1_tier_a_expansion_benchmark',
          generatedAt: new Date().toISOString(),
          stagedDocuments: staged,
          edgesConsidered: edges.length,
          queriesBuilt: built.length,
          rejected,
          annDepth: ANN_DEPTH,
          candidateDepth: CANDIDATE_DEPTH,
          old: oldM,
          new: newM,
          queries: built.map((b, i) => ({
            id: b.id,
            gold: b.gold,
            citingId: b.citingId,
            court: b.court,
            oldRank: oldRanks[i],
            newRank: newRanks[i],
          })),
          limitation:
            'NEW is exact cosine over the staged population alone; it does not contend with the 40,161 chunk-embedded documents in one ranking. Merging the two representations is an open calibration question and is deliberately not decided here.',
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nartifact → ${OUT}`);
  }
  await sql.end({ timeout: 5 });
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
