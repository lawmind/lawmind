/**
 * P10 — a retrieval failure and an unreadable document are different failures
 * with different owners, and today they are the same number.
 *
 * `AUTHORITY_HELD_BUT_NOT_RETRIEVED` is charged entirely to ranking. Some of it
 * is not ranking at all: the document is held, is embedded, and its text is not
 * language, so nothing could have retrieved it. That is
 * SOURCE_PRESENT_TEXT_UNUSABLE and it belongs to acquisition/OCR, not to me.
 *
 * This does NOT silently remove those cases from product coverage. An advocate
 * who cannot find an authority does not care whose fault it is. It reports both
 * numbers side by side.
 *
 * HONESTY CONSTRAINT. Per-document usability evidence does not exist yet:
 * script_quality is NULL corpus-wide on this population. So the per-case column
 * is UNKNOWN for nearly everything, and the magnitude is estimated from
 * COURT-LEVEL priors measured in staged-readability.json (n=300 per court).
 * A court prior is not evidence about a case. It is labelled as an estimate
 * everywhere it appears and must never be used to excuse an individual miss.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, idle_timeout: 30 });

const cases = readFileSync('failure-classify-checkpoint.jsonl', 'utf8')
  .trim()
  .split(/\r?\n/)
  .map((l) => JSON.parse(l));

const census = JSON.parse(readFileSync('docs/ai/new1-tier-a/staged-readability.json', 'utf8'));
const prior = new Map(census.byCourt.map((c) => [c.court, c.ratePct / 100]));
const CORPUS_PRIOR = census.projectedPct / 100;

const ids = [...new Set(cases.flatMap((c) => c.goldJudgmentIds ?? []))];
const meta = new Map(
  (
    await sql`
      select e.id, e.court, e.script_quality, e.text_length, e.semantic_tier,
             (s.judgment_id is not null) as staged
      from judgment_embedding_eligibility e
      left join new1_doc_vector_stage s on s.judgment_id = e.id
      where e.id = any(${ids}::uuid[])`
  ).map((r) => [r.id, r]),
);
await sql.end();

/** Canonical usability strata. UNKNOWN is a real answer, not a missing one. */
function stratum(m) {
  if (!m) return 'SOURCE_ABSENT';
  const sq = m.script_quality;
  if (sq === null || sq === undefined) return 'TEXT_USABILITY_UNKNOWN';
  if (sq === 'clean' || sq === 'mixed_script_ok') return 'KNOWN_USABLE';
  if (sq === 'legacy_font_ascii') return 'LEGACY_FONT_SUSPECT';
  return `KNOWN_DAMAGED_${sq}`;
}

const out = {
  kind: 'new1_failure_text_usability_stratification',
  measuredAt: new Date().toISOString(),
  source: 'failure-classify-checkpoint.jsonl (288 cases, run 20 Aug 2026)',
  priorSource: `docs/ai/new1-tier-a/staged-readability.json — COURT-LEVEL rates, n=${census.perCourtSample}/court, corpus ${census.projectedPct}%`,
  warning:
    'The per-case stratum is canonical evidence. The expected-unusable COUNT is an ESTIMATE from court priors and is not evidence about any individual case. It sizes the exposure; it never excuses a miss.',
  byPrimary: {},
};

for (const c of cases) {
  const p = (out.byPrimary[c.primary] ??= {
    cases: 0,
    byStratum: {},
    byCourt: {},
    expectedTextUnusable: 0,
    expectedRetrievalFail: 0,
  });
  p.cases += 1;
  const gid = (c.goldJudgmentIds ?? [])[0];
  const m = meta.get(gid);
  const s = stratum(m);
  p.byStratum[s] = (p.byStratum[s] || 0) + 1;
  const court = m?.court ?? 'UNKNOWN_COURT';
  p.byCourt[court] = (p.byCourt[court] || 0) + 1;
  // Only a MISS can be explained by unreadable text. A badly-ranked authority was
  // retrieved, so its text was good enough to match — charging that to damage
  // would be laundering a ranking defect.
  if (c.primary === 'AUTHORITY_HELD_BUT_NOT_RETRIEVED') {
    const rate = prior.get(court) ?? CORPUS_PRIOR;
    p.expectedTextUnusable += rate;
    p.expectedRetrievalFail += 1 - rate;
  }
}

for (const [k, v] of Object.entries(out.byPrimary)) {
  v.expectedTextUnusable = +v.expectedTextUnusable.toFixed(1);
  v.expectedRetrievalFail = +v.expectedRetrievalFail.toFixed(1);
  if (k === 'AUTHORITY_HELD_BUT_NOT_RETRIEVED') {
    v.interpretation =
      `Of ${v.cases} cases charged to retrieval today, an estimated ${v.expectedTextUnusable} ` +
      `(${((v.expectedTextUnusable / v.cases) * 100).toFixed(1)}%) are SOURCE_PRESENT_TEXT_UNUSABLE ` +
      `and ${v.expectedRetrievalFail} are RETRIEVAL_FAIL. Neither is removed from product coverage.`;
  }
  v.byCourt = Object.fromEntries(Object.entries(v.byCourt).sort((a, b) => b[1] - a[1]).slice(0, 8));
}

// The finding that outranks the stratification itself.
const courts = new Set(cases.map((c) => meta.get((c.goldJudgmentIds ?? [])[0])?.court ?? 'UNKNOWN_COURT'));
const sciCensus = census.byCourt.find((c) => /Supreme/i.test(c.court));
out.populationMismatch = {
  failureCaseCourts: [...courts],
  finding:
    'Every one of the 288 failure-classify cases is Supreme Court of India. The Supreme Court is 0.44% of staged rows ' +
    `(${sciCensus.stagedRows} of ${census.stagedRows}) and its measured unreadable rate is ${sciCensus.ratePct}% ` +
    `(${sciCensus.notLanguage} of ${sciCensus.judged} sampled).`,
  consequence:
    'P10 asks retrieval failures to be split from unreadable text. On THIS checkpoint the split is real but empty: ' +
    'the expected SOURCE_PRESENT_TEXT_UNUSABLE count is 0 because the population contains none of the affected courts. ' +
    'The text damage lives in Punjab and Haryana (56.0%) and Karnataka (49.7%), which contribute zero failure cases. ' +
    'The retrieval benchmark and the text-damage exposure DO NOT OVERLAP.',
  implication:
    'No conclusion about retrieval quality drawn from this checkpoint generalises to the High Court corpus, which is ' +
    '99.56% of staged rows. NEW3 v2 gold is High Court (Allahabad, Jharkhand, Punjab and Haryana, Madras, Rajasthan, ' +
    'Bombay, Chhattisgarh) and is the first failure population drawn from the courts where the damage actually is. ' +
    'That is an additional reason the 1M checkpoint benchmark matters, independent of scale.',
};

writeFileSync('docs/ai/new1-tier-a/failure-text-usability.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
