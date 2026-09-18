/**
 * NEW1 — ELIGIBILITY SAMPLING FRAME. The instrument NEW2's uncited-authority
 * study needs, and nothing more.
 *
 *   pnpm --filter @lawmind/harness frame:eligibility
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR, AND WHAT IT DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 measured the thing that matters (bus 1073, 80 documents, every one read
 * as primary text): **3.75% [1.28, 10.45] of what the 2,000-character gate
 * refuses is a substantive authority.** They then priced the follow-up honestly:
 * estimating a rule's precision to +/-10 points around 80% needs about **62
 * rule-positives**, which at a 3.75% base rate means adjudicating roughly
 * **1,650 documents** by hand.
 *
 * 1,650 hand-read documents is the cost of a SIMPLE RANDOM sample. This file
 * exists to make that number smaller without making the estimate dishonest, by
 * doing the one thing sampling theory offers for free: **stratify, allocate
 * unequally, and reweight by true stratum size.**
 *
 * THIS IS NOT A CLASSIFIER AND MUST NOT BECOME ONE.
 *
 * The strata include cheap deterministic text markers. Those markers are
 * **stratification variables**, not predictions. The distinction is the whole
 * point:
 *
 *   - A CLASSIFIER says "this document is an authority" and is judged on
 *     precision. Building one now is exactly what NEW2 refused, correctly, on 3
 *     positives in 80.
 *   - A STRATIFIER says "documents like this are worth reading FIRST". If the
 *     marker has signal, the same number of adjudications buys more positives.
 *     If it has NONE, the reweighted estimate is still unbiased — it just costs
 *     what simple random sampling would have cost. **There is no way for a bad
 *     stratifier to produce a wrong answer here**, only a slow one.
 *
 * That asymmetry is why markers are allowed in this file and a phrase-list
 * classifier is not. This repository has already measured what happens when a
 * phrase list is scored on the documents it was written from: 100% in-sample,
 * 29% out.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MARKERS ARE NEGATIVE-CLASS MARKERS, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 published what the refused population actually contains: withdrawal (11
 * of 80), fact-bound bail (11), default/non-prosecution (6), condonation (5),
 * compliance and contempt closure (6), adjournment (4), restoration (3),
 * infructuous or abated (4), record correction (2), registry cover pages (2),
 * consider-the-representation directions (5).
 *
 * So the markers here detect the **procedural mass**, which is 96% of the
 * population and is the easy, high-agreement part. Documents carrying NO
 * negative marker land in a residual stratum that gets the heavy allocation.
 * Detecting what a document is NOT is a far weaker claim than detecting what it
 * is, and it is the claim the evidence supports.
 *
 * These phrases were taken from NEW2's PUBLISHED CATEGORY NAMES, not from
 * reading their 80 documents, and they have never been scored against a label.
 * Their measured performance in this file is exactly nothing, and the artefact
 * says so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED, BECAUSE THE BOX IS SHARED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The census is a `TABLESAMPLE SYSTEM` pass, never a full scan of 18.7M rows,
 * and every statement carries a timeout. A frame that takes the database down
 * has cost more than it measured.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/eligibility-sampling-frame.json');

/** Percent for the census TABLESAMPLE. 0.4% of 18.7M is ~75k rows — enough for cell counts. */
const SAMPLE_PCT = Number(process.env['FRAME_SAMPLE_PCT'] ?? 0.4);
/** Fixed, so two runs of this file draw the same frame and are comparable. */
const SEED = Number(process.env['FRAME_SEED'] ?? 11);
/** How many documents NEW2 is willing to adjudicate. Drives the allocation, nothing else. */
const BUDGET = Number(process.env['FRAME_BUDGET'] ?? 600);
/** Ids drawn per stratum for the actual worklist. */
const DRAW_PER_STRATUM = Number(process.env['FRAME_DRAW'] ?? 400);

/**
 * The population NEW2's question is about, stated once and used everywhere:
 * passes identity and text, has NO inbound citation, and is refused by the
 * LENGTH gate alone.
 *
 * `text_length BETWEEN 400 AND 1999` — the lower bound is NEW2's, and it is
 * there because a registry cover page is not a document anyone can adjudicate.
 */
const POPULATION_SQL = `
  e.axis_a_identity
  AND e.axis_b_text
  AND NOT e.is_cited_authority
  AND e.text_length >= 400
  AND e.text_length < 2000
`;

/**
 * TABLESAMPLE CANNOT BE APPLIED TO A VIEW — only to a table or a materialised
 * view. So the sample is taken on `judgments`, which is the thing with pages,
 * and the eligibility view is JOINED to the sampled rows by id. The sampling
 * unit is therefore a judgments page, which is what it would have been anyway.
 */
const FROM_SAMPLED = (pct: number, seed: number): string => `
  judgments j TABLESAMPLE SYSTEM (${pct}) REPEATABLE (${seed})
  JOIN judgment_embedding_eligibility e ON e.id = j.id
`;

type Cell = {
  lengthBand: string;
  courtTier: string;
  yearCohort: string;
  documentClass: string;
  marker: string;
  n: number;
};

const LENGTH_BANDS = `
  CASE
    WHEN e.text_length < 800 THEN '400-799'
    WHEN e.text_length < 1200 THEN '800-1199'
    WHEN e.text_length < 1500 THEN '1200-1499'
    ELSE '1500-1999'
  END`;

/**
 * Court tier, not court name. 26 courts x 4 length bands x 4 cohorts is a
 * contingency table with mostly empty cells, and an empty cell cannot be
 * allocated to. Supreme Court is separated because its refused short orders are
 * a different animal from a High Court's.
 */
const COURT_TIER = `
  CASE
    WHEN e.court ILIKE '%Supreme Court%' THEN 'SUPREME_COURT'
    WHEN e.court IS NULL THEN 'UNKNOWN_COURT'
    ELSE 'HIGH_COURT'
  END`;

/**
 * The RECENT-LAW cohort is separated because it is the one the brief names.
 * BNS/BNSS/BSA took effect July 2024, so a 2025+ order is reasoning about a
 * statute book no frontier model knows, and its value as an authority is
 * different in kind rather than in degree.
 */
const YEAR_COHORT = `
  CASE
    WHEN e.judgment_date IS NULL THEN 'UNKNOWN_YEAR'
    WHEN e.judgment_date >= DATE '2025-01-01' THEN 'RECENT_2025_PLUS'
    WHEN e.judgment_date >= DATE '2021-01-01' THEN '2021_2024'
    WHEN e.judgment_date >= DATE '2015-01-01' THEN '2015_2020'
    ELSE 'PRE_2015'
  END`;

/** NULL is its own value. "Never classified" and "classified as ordinary" want opposite work. */
const DOC_CLASS = `COALESCE(e.hc_document_class, 'UNCLASSIFIED')`;

/**
 * NEGATIVE markers, drawn from NEW2's published category names.
 *
 * Order matters only for reporting: a document matching several lands in the
 * first that matches, so every document occupies exactly one stratum and the
 * strata partition the population — which is the property the reweighting needs.
 */
const MARKER = `
  CASE
    WHEN j.full_text ~* '(withdraw|not press(ed)?|permission to withdraw)' THEN 'M_WITHDRAWAL'
    WHEN j.full_text ~* '(bail|bail application|anticipatory bail)' THEN 'M_BAIL'
    WHEN j.full_text ~* '(dismissed for (default|non-prosecution)|non-prosecution)' THEN 'M_DEFAULT'
    WHEN j.full_text ~* '(condon(e|ation) of delay|delay is condoned)' THEN 'M_CONDONATION'
    WHEN j.full_text ~* '(contempt|compliance (has been|is) (reported|effected))' THEN 'M_COMPLIANCE'
    WHEN j.full_text ~* '(adjourn|list (this matter|it) (on|after))' THEN 'M_ADJOURNMENT'
    WHEN j.full_text ~* '(restor(e|ation) (of|the) (the )?(appeal|petition|application))' THEN 'M_RESTORATION'
    WHEN j.full_text ~* '(infructuous|abate(d|s)?)' THEN 'M_INFRUCTUOUS'
    WHEN j.full_text ~* '(consider the representation|decide the representation)' THEN 'M_REPRESENTATION'
    WHEN j.full_text ~* '(correction (in|of) the (record|order)|typographical error)' THEN 'M_RECORD_CORRECTION'
    ELSE 'RESIDUAL_NO_NEGATIVE_MARKER'
  END`;

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, {
    ssl: sslFor(url),
    max: 1,
    onnotice: () => {},
    connection: { statement_timeout: 240_000 },
  });

  console.log('ELIGIBILITY_SAMPLING_FRAME');
  console.log(
    `  census: TABLESAMPLE SYSTEM (${SAMPLE_PCT}) REPEATABLE (${SEED}) over judgment_embedding_eligibility`,
  );

  const viewHash = await sql<{ h: string }[]>`
    SELECT substr(encode(sha256(pg_get_viewdef('judgment_embedding_eligibility'::regclass, true)::bytea), 'hex'), 1, 16) AS h
  `;
  console.log(`  deployed eligibility view sha256 prefix: ${viewHash[0]?.h}`);

  // ── total corpus rows in the sample, so cells can be scaled back up ────────
  const totals = await sql<{ sampled: string; population: string }[]>`
    SELECT count(*)::text AS sampled,
           count(*) FILTER (WHERE ${sql.unsafe(POPULATION_SQL)})::text AS population
    FROM ${sql.unsafe(FROM_SAMPLED(SAMPLE_PCT, SEED))}
  `;
  const sampled = Number(totals[0]?.sampled ?? 0);
  const inPopulation = Number(totals[0]?.population ?? 0);
  const scale = 100 / SAMPLE_PCT;
  console.log(
    `  sampled rows: ${sampled}; in the length-gated uncited population: ${inPopulation}`,
  );

  // ── the contingency table ─────────────────────────────────────────────────
  const cells = await sql<Cell[]>`
    SELECT ${sql.unsafe(LENGTH_BANDS)} AS "lengthBand",
           ${sql.unsafe(COURT_TIER)}   AS "courtTier",
           ${sql.unsafe(YEAR_COHORT)}  AS "yearCohort",
           ${sql.unsafe(DOC_CLASS)}    AS "documentClass",
           ${sql.unsafe(MARKER)}       AS marker,
           count(*)::int               AS n
    FROM ${sql.unsafe(FROM_SAMPLED(SAMPLE_PCT, SEED))}
    WHERE ${sql.unsafe(POPULATION_SQL)}
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY n DESC
  `;

  // ── marginal views, which are what a human actually reads ─────────────────
  const marginal = (keyOf: (c: Cell) => string): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const c of cells) m[keyOf(c)] = (m[keyOf(c)] ?? 0) + c.n;
    return m;
  };
  const byMarker = marginal((c) => c.marker);
  const byLength = marginal((c) => c.lengthBand);
  const byCourt = marginal((c) => c.courtTier);
  const byYear = marginal((c) => c.yearCohort);
  const byClass = marginal((c) => c.documentClass);

  /**
   * ALLOCATION. Two strata only, because two is what the evidence supports.
   *
   * A four-way marker-by-length allocation would look more scientific and would
   * be allocating on a signal nobody has scored. The one split with a stated
   * rationale is MARKER-FREE vs MARKER-CARRYING, so that is the only split the
   * allocation uses. Everything else in the table is reported for NEW2 to
   * post-stratify on AFTER they have labels, which is the honest order.
   */
  const residual = byMarker['RESIDUAL_NO_NEGATIVE_MARKER'] ?? 0;
  const markerCarrying = inPopulation - residual;
  const residualShare = inPopulation === 0 ? 0 : residual / inPopulation;

  /**
   * 70/30 to the residual stratum. Not optimal allocation — optimal allocation
   * needs the per-stratum variance, which needs labels, which is what this is
   * for. 70/30 keeps enough of the marker-carrying stratum that its rate is
   * estimable rather than assumed to be zero, which is the failure mode that
   * would quietly bias the whole estimate.
   */
  const allocResidual = Math.round(BUDGET * 0.7);
  const allocMarker = BUDGET - allocResidual;

  const draws: Record<string, string[]> = {};
  for (const [stratum, predicate, want] of [
    ['RESIDUAL_NO_NEGATIVE_MARKER', `= 'RESIDUAL_NO_NEGATIVE_MARKER'`, allocResidual],
    ['MARKER_CARRYING', `<> 'RESIDUAL_NO_NEGATIVE_MARKER'`, allocMarker],
  ] as const) {
    const rows = await sql<{ id: string }[]>`
      SELECT j.id::text FROM ${sql.unsafe(FROM_SAMPLED(SAMPLE_PCT, SEED + 1))}
      WHERE ${sql.unsafe(POPULATION_SQL)} AND ${sql.unsafe(MARKER)} ${sql.unsafe(predicate)}
      ORDER BY md5(j.id::text)
      LIMIT ${Math.min(DRAW_PER_STRATUM, Math.max(want, 1))}
    `;
    draws[stratum] = rows.map((r) => r.id);
    console.log(`  drew ${rows.length} ids for ${stratum} (allocation ${want})`);
  }

  await sql.end({ timeout: 5 });

  const artefact = {
    kind: 'new1_eligibility_sampling_frame',
    generatedAt: new Date().toISOString(),
    forWhom: 'NEW2 — UNCITED_SUBSTANTIVE_AUTHORITY_STUDY_V2 (§8 NEW2-4)',
    deployedEligibilityViewSha256Prefix: viewHash[0]?.h ?? null,
    populationDefinition:
      'judgment_embedding_eligibility WHERE axis_a_identity AND axis_b_text AND NOT is_cited_authority AND 400 <= text_length < 2000 — i.e. refused by the LENGTH gate alone, exactly the population NEW2 measured at 3.75% [1.28, 10.45].',
    census: {
      tablesamplePct: SAMPLE_PCT,
      repeatableSeed: SEED,
      sampledRows: sampled,
      inPopulation,
      scaleFactor: scale,
      estimatedPopulationSize: Math.round(inPopulation * scale),
      estimateIsAnExtrapolation:
        'inPopulation x scaleFactor. TABLESAMPLE SYSTEM samples PAGES, not rows, so this is a page-clustered estimate and its true error is wider than a binomial interval would suggest. Three independent draws of the headline in this lane gave 40.09 / 38.77 / 38.61 percent; expect that order of variation here too.',
    },
    marginals: { byMarker, byLength, byCourt, byYear, byClass },
    cells,
    stratification: {
      strata: ['RESIDUAL_NO_NEGATIVE_MARKER', 'MARKER_CARRYING'],
      residualCount: residual,
      markerCarryingCount: markerCarrying,
      residualShareOfPopulation: residualShare,
      allocation: {
        budget: BUDGET,
        RESIDUAL_NO_NEGATIVE_MARKER: allocResidual,
        MARKER_CARRYING: allocMarker,
      },
      estimator:
        'Stratified mean: rate = sum_h (N_h / N) * p_h, where N_h is the stratum size from the census and p_h the adjudicated positive rate in stratum h. Variance = sum_h (N_h/N)^2 * p_h(1-p_h)/n_h. Do NOT pool the two strata unweighted — the allocation is deliberately unequal and pooling would report the oversampled stratum as if it were the corpus.',
    },
    draws,
    whatThisDoesNotClaim: [
      'The markers have NEVER been scored against a label. Their sensitivity and specificity in this file are UNMEASURED, and no number here depends on them being good.',
      'They are stratification variables, not a classifier. A useless stratifier costs efficiency, never correctness — that asymmetry is the reason they are permitted at all.',
      'The marker phrases were taken from NEW2 published CATEGORY NAMES, not from reading their 80 adjudicated documents, so they are not in-sample to that study. They are also not out-of-sample validated. They are unvalidated.',
      'This frame cannot tell anyone whether the 2,000-character gate should move. It can only make the adjudication that would answer that cheaper.',
      'A regex over full_text is a lexical test on English. It will systematically under-mark Devanagari and legacy-font documents, which is a coverage bias in the STRATIFIER, and therefore an efficiency loss concentrated in exactly those documents rather than a bias in the estimate.',
    ],
    costModel: {
      new2SimpleRandomRequirement: 1650,
      new2Rationale:
        'about 62 rule-positives are needed to estimate precision to +/-10 points around 80%; at a 3.75% base rate that is ~1,650 simple-random adjudications (NEW2, bus 1073).',
      whatStratificationBuys:
        'UNKNOWN until the first labels come back. If the residual stratum has a materially higher positive rate than the marker-carrying one, the same positives arrive for fewer reads; if it does not, the cost is unchanged and the estimate is still unbiased. The FIRST deliverable from these draws should therefore be the two per-stratum rates, not a threshold recommendation.',
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artefact, null, 1));

  console.log('\n── population marginals (sampled counts, not corpus counts) ──');
  for (const [label, m] of [
    ['marker', byMarker],
    ['length', byLength],
    ['court', byCourt],
    ['year', byYear],
    ['class', byClass],
  ] as const) {
    console.log(`  ${label}:`);
    for (const [k, v] of Object.entries(m).sort((a, b) => b[1] - a[1])) {
      console.log(
        `    ${k.padEnd(32)} ${String(v).padStart(7)}  ${((100 * v) / Math.max(1, inPopulation)).toFixed(1)}%`,
      );
    }
  }
  console.log(`\n  artefact: ${OUT}`);
  return 0;
}

process.exitCode = await main();
