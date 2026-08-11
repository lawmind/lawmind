/**
 * `pnpm --filter @lawmind/ingest concordance:gold` — measures the
 * deterministic candidate generator and the DeepSeek adjudicator against a
 * GOLD SET drawn from the corpus's own already-resolved citation graph, per
 * Phase 6 of the founder's directive: *"Create a manually/externally verified
 * gold set... never measure only successful matches."*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS GOLD SET IS REAL GROUND TRUTH, NOT AN INVENTED FIXTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgment_citations` already holds 99,887 edges resolved by EXACT string
 * match — a Supreme Court judgment's own text citing another Supreme Court
 * judgment, joined against `reporter_citations`/`neutral_citation`/
 * `judgment_citation_aliases` with no fuzzy matching at all
 * (`services/ingest/src/citations.ts`'s own rule 1: "never invent an edge").
 * Every one of those edges is a (citing text, TRUE target judgment) pair with
 * full_text available for the citing side — exactly the shape the High Court
 * adjudication pipeline has to solve, except here the answer is already known
 * with certainty. Running the SAME candidate generator and the SAME model
 * prompt against these pairs, then checking whether the true judgment comes
 * back, measures the pipeline honestly rather than on cases hand-picked to
 * look good.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ADVERSARIAL HALF — Phase 7
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * For each positive pair, one DISTRACTOR — a real, different Supreme Court
 * judgment from the same year — is added to the candidate list. This tests
 * exactly the failure `docs/ai/AUTHORITY_COVERAGE.md` §3a found in the pure
 * Jaccard approach: two same-year candidates with overlapping tokens, where
 * picking the wrong one is a wrong citation shown to an advocate, not a
 * missing one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It does not write to `citation_concordance_resolutions` or to
 * `judgment_citation_aliases`. It is read-only against `judgments` and
 * `judgment_citations`, and its only write is the JSON report file.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import postgres from 'postgres';

import {
  type Candidate,
  adjudicationInputHash,
  buildAdjudicationPrompt,
  nameBeforeCitation,
  parseAdjudicationResponse,
  rankCandidates,
  resolveConfidenceTier,
  yearFromCitationText,
} from './concordance-adjudicate.ts';
import { callInferx } from './inferx.ts';

const SAMPLE_SIZE = Number(process.env['GOLD_SAMPLE_SIZE'] ?? '25');
/**
 * Gold decisions share `citation_concordance_resolutions` with production
 * adjudications but never its `source`. A gold-set answer about a citation must
 * not be readable as a production adjudication of the same citation -- the
 * promotion step keys on `source`, and one wrong row there is a wrong authority.
 */
const GOLD_SOURCE = 'gold_eval';
/** Changes the deterministic draw. Same seed = same cases = cache hits. */
const seed = process.env['GOLD_SEED'] ?? 'lawmind-gold-v1';
/** The model actually called. `inferx.ts` defaults to this; recorded, not guessed. */
const GOLD_MODEL = 'deepseek-v4-flash';
const outputHash = (t: string) => createHash('sha256').update(t).digest('hex');
const CONTEXT_WINDOW = 400;
const OUT_PATH = new URL('../../../docs/ai/CONCORDANCE_GOLD_RESULTS.json', import.meta.url);

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const apiKey = process.env['INFERX_API_KEY'];
if (!apiKey) {
  console.error('INFERX_API_KEY is not set — the gold set needs the model half to mean anything.');
  process.exit(2);
}

const sql = postgres(dbUrl, { ssl: dbUrl.includes('localhost') ? false : 'require', max: 2 });

console.log('CITATION CONCORDANCE — GOLD SET EVALUATION');
console.log('='.repeat(74));
console.log(`sample size ${SAMPLE_SIZE}, drawn from judgment_citations' own resolved edges`);

/* -------------------------------------------------- the candidate pool, once -- */
type Pool = { id: string; caseTitle: string; judgmentDate: string };
const pool = await sql<Pool[]>`
  SELECT id, case_title AS "caseTitle", judgment_date::text AS "judgmentDate"
  FROM judgments WHERE court = 'Supreme Court of India'`;
console.log(`candidate pool: ${pool.length.toLocaleString()} Supreme Court judgments`);

const poolByYear = new Map<number, Pool[]>();
for (const j of pool) {
  const y = Number(j.judgmentDate.slice(0, 4));
  const arr = poolByYear.get(y) ?? [];
  arr.push(j);
  poolByYear.set(y, arr);
}

/* --------------------------------------------------------- the gold examples -- */
type GoldRow = {
  citing_judgment_id: string;
  cited_judgment_id: string;
  citation_text: string;
  char_offset: number;
  citing_text: string;
  true_title: string;
  true_date: string;
};

const rows = await sql<GoldRow[]>`
  SELECT jc.citing_judgment_id, jc.cited_judgment_id, jc.citation_text, jc.char_offset,
         cj.full_text AS citing_text, tj.case_title AS true_title, tj.judgment_date::text AS true_date
  FROM judgment_citations jc
  JOIN judgments cj ON cj.id = jc.citing_judgment_id
  JOIN judgments tj ON tj.id = jc.cited_judgment_id
  WHERE jc.cited_judgment_id IS NOT NULL AND jc.citation_text <> '' AND jc.char_offset > 0
  -- DETERMINISTIC, not random(). Audited in 11 Aug 2026: this endpoint returns
  -- HTTP 429 under load and a run that dies at case 11 of 102 used to throw
  -- away every decision before it, because the next run drew a different
  -- sample and could not hit the cache. Hashing a stable key gives the same
  -- draw every time, so a crashed run RESUMES from cache instead of re-paying.
  -- GOLD_SEED changes the draw deliberately when a fresh sample is wanted.
  ORDER BY md5(jc.id::text || ${seed})
  LIMIT ${SAMPLE_SIZE * 4}`;

console.log(`fetched ${rows.length} candidate gold rows, filtering to usable ones ...`);

type Case = {
  kind: 'positive' | 'adversarial';
  citationText: string;
  citationKey: string;
  contextEvidence: string;
  citationYear: number;
  trueJudgmentId: string;
  candidates: Candidate[];
};

const cases: Case[] = [];
let skippedNoName = 0;
let skippedNoYear = 0;
let skippedNoCandidates = 0;
let skippedTruthNotInPool = 0;

for (const row of rows) {
  if (cases.length >= SAMPLE_SIZE * 2) break;

  const start = Math.max(0, row.char_offset - CONTEXT_WINDOW);
  const context = row.citing_text.slice(start, row.char_offset);
  const name = nameBeforeCitation(context);
  if (!name) {
    skippedNoName++;
    continue;
  }
  const year = yearFromCitationText(row.citation_text);
  if (year === null) {
    skippedNoYear++;
    continue;
  }
  const candidates = rankCandidates(name, year, pool);
  if (candidates.length === 0) {
    skippedNoCandidates++;
    continue;
  }
  if (!candidates.some((c) => c.judgmentId === row.cited_judgment_id)) {
    // The deterministic step itself never surfaced the truth — recorded as a
    // recall failure, not silently dropped from the denominator.
    skippedTruthNotInPool++;
  }

  const citationKey = row.citation_text.toUpperCase().replace(/[^A-Z0-9]/g, '');

  cases.push({
    kind: 'positive',
    citationText: row.citation_text,
    citationKey,
    contextEvidence: context,
    citationYear: year,
    trueJudgmentId: row.cited_judgment_id,
    candidates,
  });

  // Adversarial twin: same evidence, one real same-year distractor injected.
  const sameYear = (poolByYear.get(year) ?? []).filter(
    (j) => j.id !== row.cited_judgment_id && !candidates.some((c) => c.judgmentId === j.id),
  );
  if (sameYear.length > 0) {
    const distractor = sameYear[Math.floor(Math.random() * sameYear.length)]!;
    const poisoned: Candidate[] = [
      ...candidates,
      { judgmentId: distractor.id, caseTitle: distractor.caseTitle, judgmentDate: distractor.judgmentDate, jaccard: 0.01 },
    ].sort((a, b) => b.jaccard - a.jaccard);
    cases.push({
      kind: 'adversarial',
      citationText: row.citation_text,
      citationKey: `${citationKey}~ADV`,
      contextEvidence: context,
      citationYear: year,
      trueJudgmentId: row.cited_judgment_id,
      candidates: poisoned,
    });
  }
}

console.log(
  `usable cases: ${cases.length} (skipped: no-name ${skippedNoName}, no-year ${skippedNoYear}, ` +
    `no-candidates ${skippedNoCandidates}) · truth missing from deterministic candidates: ${skippedTruthNotInPool}`,
);

/* -------------------------------------------------------------- run the model -- */
type Outcome = {
  kind: 'positive' | 'adversarial';
  deterministicTop1Correct: boolean;
  modelDecision: string;
  modelCorrect: boolean | null; // null when the model refused (none/impossible) — not a wrong answer, a non-answer
  tier: string;
  callFailed: string | null;
};

const outcomes: Outcome[] = [];

for (const [i, c] of cases.entries()) {
  const deterministicTop1Correct = c.candidates[0]?.judgmentId === c.trueJudgmentId;

  const input = {
    citationText: c.citationText,
    citationKey: c.citationKey,
    contextEvidence: c.contextEvidence,
    candidates: c.candidates,
  };
  const prompt = buildAdjudicationPrompt(input);
  const hash = adjudicationInputHash(input);

  process.stdout.write(`[${i + 1}/${cases.length}] ${c.kind} · ${c.citationText.slice(0, 30)} ... `);

  /**
   * CACHE FIRST — audited in, 11 Aug 2026, after three runs re-paid for the
   * same cases.
   *
   * `adjudicationInputHash` was computed here and used only to print eight
   * characters at the end of the line. Nothing read it and nothing stored it,
   * so every re-run bought identical answers again — and under the HTTP 429
   * throttling this endpoint actually returns, a run that dies at case 11 threw
   * away all ten decisions before it. That is the exact opposite of the
   * standing rule for the token allocation: never process identical evidence
   * twice.
   *
   * Cached into `citation_concordance_resolutions` under its own `source`, so
   * a gold decision can never be mistaken for a production adjudication of the
   * same citation, and so gold spend is auditable in the same place.
   */
  const cached = await sql`
    SELECT decision, confidence, candidate_judgment_id, model_output_hash
    FROM citation_concordance_resolutions
    WHERE source = ${GOLD_SOURCE} AND citation_key = ${c.citationKey}
      AND model_input_hash = ${hash}
    LIMIT 1`;
  if (cached.length > 0) {
    const row = cached[0]!;
    const modelCorrectCached =
      row.decision === 'candidate_selected' ? row.candidate_judgment_id === c.trueJudgmentId : null;
    console.log(
      `${row.decision}${modelCorrectCached === true ? ' ✓' : modelCorrectCached === false ? ' ✗ WRONG' : ''}` +
        ` (${row.confidence}) [cached ${hash.slice(0, 8)}]`,
    );
    outcomes.push({
      kind: c.kind,
      deterministicTop1Correct,
      modelDecision: row.decision,
      modelCorrect: modelCorrectCached,
      tier: row.confidence as Outcome['tier'],
      callFailed: null,
    });
    continue;
  }

  const startedAt = Date.now();
  const result = await callInferx(prompt, { apiKey: apiKey! });
  if (!result.ok) {
    console.log(`CALL FAILED: ${result.reason}`);
    outcomes.push({
      kind: c.kind,
      deterministicTop1Correct,
      modelDecision: 'call_failed',
      modelCorrect: null,
      tier: 'unresolved',
      callFailed: result.reason,
    });
    continue;
  }

  const parsed = parseAdjudicationResponse(result.text, c.candidates);
  if (!parsed) {
    console.log(`UNPARSEABLE: ${result.text.slice(0, 80)}`);
    outcomes.push({
      kind: c.kind,
      deterministicTop1Correct,
      modelDecision: 'unparseable',
      modelCorrect: null,
      tier: 'unresolved',
      callFailed: null,
    });
    continue;
  }

  const tier = resolveConfidenceTier(parsed, c.candidates);
  const modelCorrect =
    parsed.decision === 'candidate_selected' ? parsed.candidateId === c.trueJudgmentId : null;

  console.log(
    `${parsed.decision}${modelCorrect === true ? ' ✓' : modelCorrect === false ? ' ✗ WRONG' : ''} (${tier})` +
      ` [hash ${hash.slice(0, 8)}]`,
  );

  /**
   * Persist the decision AND the ledger row.
   *
   * `CLAUDE.md` §5: *every* model call rows into `llm_calls`. The gold
   * evaluator was calling InferX and recording nothing, so evaluation spend was
   * invisible against the same allocation production draws on — you cannot
   * manage what you do not measure. Token counts come from the API's own usage
   * block, which `inferx.ts` already defaults to 0 when the endpoint omits it --
   * never estimated, because a guessed token count in a cost ledger is worse
   * than an absent one.
   */
  await sql`
    INSERT INTO citation_concordance_resolutions
      (source, citation_key, citation_text, citation_year, context_evidence, candidates,
       candidate_judgment_id, decision, confidence, model_used, model_input_hash,
       model_output_hash, needs_human_review, model_reasoning)
    VALUES (${GOLD_SOURCE}, ${c.citationKey}, ${c.citationText}, ${c.citationYear},
            ${c.contextEvidence}, ${JSON.stringify(c.candidates)}::jsonb,
            ${parsed.candidateId}, ${parsed.decision}, ${tier}, ${GOLD_MODEL},
            ${hash}, ${outputHash(result.text)}, ${parsed.needsHumanReview}, ${parsed.reason})
    ON CONFLICT (source, citation_key, model_input_hash) DO NOTHING`;

  await sql`
    INSERT INTO llm_calls (feature, model, input_tokens, output_tokens, cost_usd,
                           latency_ms, data_class, pseudonymised)
    VALUES ('concordance', ${GOLD_MODEL}, ${result.inputTokens}, ${result.outputTokens}, 0, ${Date.now() - startedAt}, 'public', false)`;

  outcomes.push({
    kind: c.kind,
    deterministicTop1Correct,
    modelDecision: parsed.decision,
    modelCorrect,
    tier,
    callFailed: null,
  });
}

/* ---------------------------------------------------------------- aggregate -- */
function precisionOf(rows: Outcome[]): { decided: number; correct: number; precision: number | null } {
  const decided = rows.filter((r) => r.modelCorrect !== null);
  const correct = decided.filter((r) => r.modelCorrect === true);
  return {
    decided: decided.length,
    correct: correct.length,
    precision: decided.length > 0 ? correct.length / decided.length : null,
  };
}

const positives = outcomes.filter((o) => o.kind === 'positive');
const adversarial = outcomes.filter((o) => o.kind === 'adversarial');
const deterministicOnly = precisionOf(positives.map((o) => ({ ...o, modelCorrect: o.deterministicTop1Correct })));

const byTier = new Map<string, Outcome[]>();
for (const o of outcomes) {
  const arr = byTier.get(o.tier) ?? [];
  arr.push(o);
  byTier.set(o.tier, arr);
}

console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(
  `deterministic top-1 alone (positive cases): ${deterministicOnly.correct}/${deterministicOnly.decided} = ` +
    `${deterministicOnly.precision !== null ? (deterministicOnly.precision * 100).toFixed(1) + '%' : 'n/a'}`,
);
const posP = precisionOf(positives);
console.log(
  `DeepSeek-adjudicated (positive cases, decided only): ${posP.correct}/${posP.decided} = ` +
    `${posP.precision !== null ? (posP.precision * 100).toFixed(1) + '%' : 'n/a'}`,
);
const advP = precisionOf(adversarial);
console.log(
  `DeepSeek-adjudicated (adversarial, one real distractor injected): ${advP.correct}/${advP.decided} = ` +
    `${advP.precision !== null ? (advP.precision * 100).toFixed(1) + '%' : 'n/a'}`,
);
console.log('');
console.log('precision by confidence tier (all cases, positive + adversarial):');
for (const [tier, rows] of [...byTier].sort()) {
  const p = precisionOf(rows);
  console.log(
    `  ${tier.padEnd(10)} n=${rows.length.toString().padStart(3)}  ` +
      `${p.decided > 0 ? `${p.correct}/${p.decided} = ${(p.precision! * 100).toFixed(1)}%` : '(no decided cases)'}`,
  );
}

await writeFile(
  OUT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sampleSize: SAMPLE_SIZE,
      poolSize: pool.length,
      skipped: { skippedNoName, skippedNoYear, skippedNoCandidates, skippedTruthNotInPool },
      casesRun: cases.length,
      deterministicTop1: deterministicOnly,
      modelPositive: posP,
      modelAdversarial: advP,
      byTier: Object.fromEntries([...byTier].map(([t, rows]) => [t, precisionOf(rows)])),
      outcomes,
    },
    null,
    2,
  ),
);
console.log('');
console.log('written: docs/ai/CONCORDANCE_GOLD_RESULTS.json');

await sql.end();
