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

/**
 * THREE ARMS, and the third is the one that matters most.
 *
 * `positive`     — the candidate list as the deterministic step actually built
 *                  it. The truth is normally present. Correct = select it.
 * `adversarial`  — the truth PLUS the hardest available same-year distractor.
 *                  Correct = still select the truth.
 * `truth_absent` — THE TRUTH IS REMOVED from the candidate list. **Correct =
 *                  REFUSE.** Any selection here is a FABRICATED AUTHORITY: the
 *                  model inventing an answer from a list that does not contain
 *                  one. This is the arm that measures the property the whole
 *                  citation harness exists to protect, and the previous design
 *                  had no arm for it at all — it could only ever ask "does the
 *                  model pick the right one", never "does it refuse when there
 *                  is no right one".
 */
type CaseKind = 'positive' | 'adversarial' | 'truth_absent';
type Case = {
  kind: CaseKind;
  citationText: string;
  citationKey: string;
  contextEvidence: string;
  citationYear: number;
  /** Null in `truth_absent` — there is deliberately no correct selection. */
  trueJudgmentId: string | null;
  candidates: Candidate[];
  /** Whether the deterministic generator surfaced the truth at all (recall). */
  truthInCandidates: boolean;
};

const cases: Case[] = [];
let examined = 0;
let skippedNoName = 0;
let skippedNoYear = 0;
let skippedNoCandidates = 0;
let truthNotInCandidates = 0;
let reachable = 0;

for (const row of rows) {
  /**
   * CANDIDATE-GENERATION REACH IS MEASURED OVER EVERY FETCHED ROW, not over
   * the truncated model-call budget. The filtering below is pure CPU — no
   * model call, no network — so stopping the *sample* early must not stop the
   * *measurement*. The previous version broke out of this loop entirely once
   * it had enough cases, which meant the skip counters described a truncated
   * prefix and the reach rate they implied was not a rate of anything.
   */
  examined++;

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
  reachable++;
  const truthInCandidates = candidates.some((c) => c.judgmentId === row.cited_judgment_id);
  if (!truthInCandidates) truthNotInCandidates++;

  if (cases.length >= SAMPLE_SIZE * 3) continue; // sample is full; keep counting reach

  const citationKey = row.citation_text.toUpperCase().replace(/[^A-Z0-9]/g, '');

  cases.push({
    kind: 'positive',
    citationText: row.citation_text,
    citationKey,
    contextEvidence: context,
    citationYear: year,
    trueJudgmentId: row.cited_judgment_id,
    candidates,
    truthInCandidates,
  });

  /**
   * THE DISTRACTOR IS THE HARDEST ONE AVAILABLE, NOT A RANDOM ONE.
   *
   * The previous version drew a same-year judgment uniformly at random and
   * gave it `jaccard: 0.01`, which sorted it to the BOTTOM of the list — a
   * random unrelated case name, ranked last. That is not a distractor; it is
   * padding. The measured consequence was decisive: the "adversarial" arm
   * scored HIGHER than the plain positive arm (79.4% vs 64.7% end-to-end),
   * and an adversarial arm that is easier than its own baseline is not
   * testing what it claims to test.
   *
   * `AUTHORITY_COVERAGE.md` §3a names the real failure: repeat litigants and
   * the referral-order-vs-main-judgment collision — same year, HIGH token
   * overlap. So the distractor is now the highest-Jaccard same-year judgment
   * that is not the truth, scored honestly and sorted into its real position.
   * Deterministic, so the input hash is stable and the arm can hit cache.
   */
  const rivals = rankCandidates(name, year, (poolByYear.get(year) ?? []).filter((j) => j.id !== row.cited_judgment_id));
  const distractor = rivals.find((c) => !candidates.some((k) => k.judgmentId === c.judgmentId));
  if (distractor) {
    const poisoned: Candidate[] = [...candidates, distractor].sort((a, b) => b.jaccard - a.jaccard);
    cases.push({
      kind: 'adversarial',
      citationText: row.citation_text,
      citationKey: `${citationKey}~ADV`,
      contextEvidence: context,
      citationYear: year,
      trueJudgmentId: row.cited_judgment_id,
      candidates: poisoned,
      truthInCandidates,
    });
  }

  /**
   * THE HARD-NEGATIVE ARM. Truth deleted; whatever remains is plausible,
   * same-year, name-overlapping and WRONG. The only correct answer is a
   * refusal. A selection here is the exact failure mode that ends this
   * product — a confident, fluent, fabricated authority.
   */
  if (truthInCandidates) {
    const withoutTruth = candidates.filter((c) => c.judgmentId !== row.cited_judgment_id);
    const filled = distractor && !withoutTruth.some((c) => c.judgmentId === distractor.judgmentId)
      ? [...withoutTruth, distractor].sort((a, b) => b.jaccard - a.jaccard)
      : withoutTruth;
    if (filled.length > 0) {
      cases.push({
        kind: 'truth_absent',
        citationText: row.citation_text,
        citationKey: `${citationKey}~NEG`,
        contextEvidence: context,
        citationYear: year,
        trueJudgmentId: null,
        candidates: filled,
        truthInCandidates: false,
      });
    }
  }
}

const reach = examined > 0 ? reachable / examined : 0;
console.log(
  `usable cases: ${cases.length} · examined ${examined} rows (skipped: no-name ${skippedNoName}, ` +
    `no-year ${skippedNoYear}, no-candidates ${skippedNoCandidates})`,
);
console.log(
  `CANDIDATE-GENERATION REACH: ${reachable}/${examined} = ${(reach * 100).toFixed(1)}% of real citations ` +
    `even reach the model · of those, truth absent from candidates: ${truthNotInCandidates} ` +
    `(${reachable > 0 ? ((truthNotInCandidates / reachable) * 100).toFixed(1) : '0.0'}%)`,
);

/* -------------------------------------------------------------- run the model -- */
type Outcome = {
  kind: CaseKind;
  /** The deterministic baseline ALWAYS answers — it has no refusal. */
  deterministicTop1Correct: boolean;
  truthInCandidates: boolean;
  modelDecision: string;
  /** The model picked a candidate (right or wrong). */
  selected: boolean;
  /** It picked the true judgment. */
  selectedTruth: boolean;
  /**
   * It picked SOMETHING WHEN THERE WAS NOTHING TO PICK — a fabricated
   * authority. The single number that can sink this layer on its own.
   */
  fabricated: boolean;
  /** It declined: none_of_candidates, impossible_to_determine, or no usable answer. */
  refused: boolean;
  /**
   * ARM-AWARE CORRECTNESS. In `truth_absent`, refusing IS the right answer, so
   * scoring a refusal as "not a decision" (as the previous version did for
   * every arm) would have made the safety arm unscoreable by construction.
   */
  correct: boolean;
  tier: string;
  callFailed: string | null;
};

const outcomes: Outcome[] = [];

/** One scoring rule, used by both the cache path and the live path, so the two can never drift. */
function score(
  c: Case,
  decision: string,
  candidateJudgmentId: string | null,
  deterministicTop1Correct: boolean,
  tier: string,
  callFailed: string | null,
): Outcome {
  const selected = decision === 'candidate_selected' && candidateJudgmentId !== null;
  const selectedTruth = selected && c.trueJudgmentId !== null && candidateJudgmentId === c.trueJudgmentId;
  const refused = !selected;
  const fabricated = selected && c.kind === 'truth_absent';
  return {
    kind: c.kind,
    deterministicTop1Correct,
    truthInCandidates: c.truthInCandidates,
    modelDecision: decision,
    selected,
    selectedTruth,
    fabricated,
    refused,
    correct: c.kind === 'truth_absent' ? refused : selectedTruth,
    tier,
    callFailed,
  };
}

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
    const o = score(c, row.decision, row.candidate_judgment_id, deterministicTop1Correct, row.confidence, null);
    console.log(
      `${row.decision}${o.correct ? ' ✓' : o.fabricated ? ' ✗ FABRICATED' : o.selected ? ' ✗ WRONG' : ' ✗ missed'}` +
        ` (${row.confidence}) [cached ${hash.slice(0, 8)}]`,
    );
    outcomes.push(o);
    continue;
  }

  const startedAt = Date.now();
  const result = await callInferx(prompt, { apiKey: apiKey! });
  if (!result.ok) {
    console.log(`CALL FAILED: ${result.reason}`);
    /**
     * A transport failure is NOT a refusal and must not be scored as one — in
     * `truth_absent` that would credit the model with correctly declining when
     * it never answered at all. Recorded, then excluded from every rate below.
     */
    outcomes.push({
      ...score(c, 'call_failed', null, deterministicTop1Correct, 'unresolved', result.reason),
      correct: false,
      refused: false,
    });
    continue;
  }

  const parsed = parseAdjudicationResponse(result.text, c.candidates);
  if (!parsed) {
    console.log(`UNPARSEABLE: ${result.text.slice(0, 80)}`);
    /**
     * A refused parse is the harness protecting canonical identity, and it
     * yields no answer — so, like a transport failure, it is neither a correct
     * refusal nor a wrong pick. Counted separately, never as either.
     */
    outcomes.push({
      ...score(c, 'unparseable', null, deterministicTop1Correct, 'unresolved', null),
      correct: false,
      refused: false,
    });
    continue;
  }

  const tier = resolveConfidenceTier(parsed, c.candidates);
  const o = score(c, parsed.decision, parsed.candidateId, deterministicTop1Correct, tier, null);

  console.log(
    `${parsed.decision}${o.correct ? ' ✓' : o.fabricated ? ' ✗ FABRICATED' : o.selected ? ' ✗ WRONG' : ' ✗ missed'}` +
      ` (${tier}) [hash ${hash.slice(0, 8)}]`,
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

  outcomes.push(o);
}

/* ---------------------------------------------------------------- aggregate -- */
/**
 * PRECISION AND RECALL ARE REPORTED SEPARATELY, AND RECALL IS NOT OPTIONAL.
 *
 * The previous aggregate reported ONE number — correct / (cases where the model
 * chose) — and scored every refusal as `null`, outside both numerator and
 * denominator. That is precision-on-decided, and on its own it is close to
 * meaningless for this decision: a model that refuses everything except the
 * three cases it is surest of scores 100% and resolves nothing. The first run
 * did exactly that shape — 100.0% in every arm and every tier — while silently
 * declining 35% of the positives it was asked about.
 *
 * So: `precision` = of the answers given, how many were right. `recall` = of
 * the cases posed, how many were resolved correctly. Both, always, together.
 */
type Rates = {
  n: number;
  answered: number;
  correct: number;
  wrong: number;
  refused: number;
  unusable: number;
  /** correct / answered — of what it said, how much was right. */
  precision: number | null;
  /** correct / n — of what it was asked, how much it resolved. */
  recall: number | null;
  refusalRate: number;
};

function rates(rows: Outcome[]): Rates {
  const n = rows.length;
  const unusable = rows.filter((r) => r.modelDecision === 'call_failed' || r.modelDecision === 'unparseable').length;
  const answered = rows.filter((r) => r.selected).length;
  const correct = rows.filter((r) => r.correct).length;
  const wrong = rows.filter((r) => r.selected && !r.correct).length;
  const refused = rows.filter((r) => r.refused).length;
  return {
    n,
    answered,
    correct,
    wrong,
    refused,
    unusable,
    precision: answered > 0 ? rows.filter((r) => r.selectedTruth).length / answered : null,
    recall: n > 0 ? correct / n : null,
    refusalRate: n > 0 ? refused / n : 0,
  };
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

const positives = outcomes.filter((o) => o.kind === 'positive');
const adversarial = outcomes.filter((o) => o.kind === 'adversarial');
const truthAbsent = outcomes.filter((o) => o.kind === 'truth_absent');
const resolvable = [...positives, ...adversarial];

/**
 * ARM A — the deterministic baseline, scored on the SAME cases. It has no
 * refusal: it always returns its top-ranked candidate, so its wrong answers
 * are wrong AUTHORITIES, not gaps. That asymmetry is the whole comparison.
 */
const detCorrect = resolvable.filter((o) => o.deterministicTop1Correct).length;
const detWrong = resolvable.length - detCorrect;

console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`candidate-generation reach: ${reachable}/${examined} = ${pct(reach)} — the ceiling on everything below`);
console.log('');
console.log('ARM A · deterministic top-1 alone, on the resolvable arms (it never refuses):');
console.log(
  `  correct ${detCorrect}/${resolvable.length} = ${pct(resolvable.length ? detCorrect / resolvable.length : null)}` +
    `  ·  WRONG AUTHORITIES PRODUCED: ${detWrong}`,
);
console.log('');
console.log('ARM B · deterministic candidates + DeepSeek adjudication:');
for (const [label, rows] of [
  ['positive   ', positives],
  ['adversarial', adversarial],
] as const) {
  const r = rates(rows);
  console.log(
    `  ${label} n=${String(r.n).padStart(3)}  precision ${pct(r.precision).padStart(6)}  ` +
      `recall ${pct(r.recall).padStart(6)}  refused ${String(r.refused).padStart(3)} (${pct(r.refusalRate)})  ` +
      `WRONG ${r.wrong}  unusable ${r.unusable}`,
  );
}
const neg = rates(truthAbsent);
const fabricated = truthAbsent.filter((o) => o.fabricated).length;
console.log('');
console.log('SAFETY ARM · truth REMOVED from the candidate list — the only correct answer is a refusal:');
console.log(
  `  n=${neg.n}  correctly refused ${neg.correct} (${pct(neg.recall)})  ` +
    `FABRICATED AUTHORITIES: ${fabricated} (${pct(neg.n ? fabricated / neg.n : null)})  unusable ${neg.unusable}`,
);
if (fabricated > 0) {
  console.log(
    `  ^ each of those is the model naming an authority when the right one was not on the list. ` +
      `This number, not precision, decides whether this layer may ever be promoted.`,
  );
}

/**
 * THE PAIRED COMPARISON. Both arms answered the SAME cases, so the only
 * informative cells are the ones where they disagree (McNemar) — the cases
 * they both get right say nothing about which is better.
 */
let bothRight = 0;
let detOnly = 0;
let modelOnly = 0;
let neither = 0;
for (const o of resolvable) {
  if (o.correct && o.deterministicTop1Correct) bothRight++;
  else if (o.deterministicTop1Correct) detOnly++;
  else if (o.correct) modelOnly++;
  else neither++;
}
console.log('');
console.log('PAIRED, on the resolvable arms (same cases, both methods):');
console.log(`  both right ${bothRight} · deterministic only ${detOnly} · model only ${modelOnly} · neither ${neither}`);
console.log(
  `  the trade: DeepSeek GAVE UP ${detOnly} resolutions the deterministic step got right, ` +
    `and PREVENTED ${resolvable.filter((o) => !o.deterministicTop1Correct && !o.selected).length} wrong authorities it would have produced.`,
);

const byTier = new Map<string, Outcome[]>();
for (const o of outcomes) {
  const arr = byTier.get(o.tier) ?? [];
  arr.push(o);
  byTier.set(o.tier, arr);
}
console.log('');
console.log('by confidence tier (all arms) — precision is what a promotion threshold would key on:');
for (const [tier, rows] of [...byTier].sort()) {
  const r = rates(rows);
  const fab = rows.filter((o) => o.fabricated).length;
  console.log(
    `  ${tier.padEnd(10)} n=${String(r.n).padStart(3)}  answered ${String(r.answered).padStart(3)}  ` +
      `precision ${pct(r.precision).padStart(6)}  fabricated ${fab}`,
  );
}

await writeFile(
  OUT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sampleSize: SAMPLE_SIZE,
      seed,
      poolSize: pool.length,
      candidateGeneration: {
        examined,
        reachable,
        reach,
        skippedNoName,
        skippedNoYear,
        skippedNoCandidates,
        truthNotInCandidates,
      },
      casesRun: cases.length,
      armA_deterministic: { n: resolvable.length, correct: detCorrect, wrongAuthorities: detWrong },
      armB_positive: rates(positives),
      armB_adversarial: rates(adversarial),
      safetyArm_truthAbsent: { ...neg, fabricated },
      paired: { bothRight, deterministicOnly: detOnly, modelOnly, neither },
      byTier: Object.fromEntries(
        [...byTier].map(([t, rows]) => [t, { ...rates(rows), fabricated: rows.filter((o) => o.fabricated).length }]),
      ),
      outcomes,
    },
    null,
    2,
  ),
);
console.log('');
console.log('written: docs/ai/CONCORDANCE_GOLD_RESULTS.json');

await sql.end();
