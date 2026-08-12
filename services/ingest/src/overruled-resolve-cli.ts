/**
 * `pnpm --filter @lawmind/ingest overruled:resolve` — the 34 citation edges
 * where getting identity wrong is the failure this product exists to prevent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE 34 AND NOT THE OTHER 5,000
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 found them (bus 0111) and the ranking is right: 5,182 citation edges
 * carry a non-`cites` relationship and an unresolved target, but only **34** are
 * `overruled`, `overruled_in_part` or `doubted`. Those are categorically
 * different from a missing search result.
 *
 * `CLAUDE.md` §6: overruled judgments must display their status on every
 * surface, and the stale-overruled rate has a threshold of ZERO — *"overruled
 * law rendered WITHOUT the LAW MOVED mark is as severe as a hallucination."*
 * An unresolved `overruled` edge is exactly that: this corpus knows some
 * judgment was overruled and cannot say which one, so the overruled judgment
 * renders as live good law.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MEASURED FIRST, AND THE EASY ANSWER WAS ALREADY RULED OUT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All 34 are Supreme Court citing Supreme Court, in SCC/AIR/SCR form. The
 * obvious hope — that they are held under a differently-punctuated form of the
 * same citation — was tested and is false: **0 of 34 keys match a held
 * judgment even under punctuation-insensitive comparison**. Normalisation is
 * already consistent (`[2000] 1 S.C.R. 725` → `(2000) 1 SCR 725` on both
 * sides). So this is the SCC/AIR → S.C.R. identity gap, not a formatting bug.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES, AND WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It reads the case name printed beside each citation IN OUR OWN CORPUS TEXT and
 * ranks Supreme Court judgments against it, using `internal-concordance.ts`'s
 * measured discipline — the asymmetric reporting-lag year window, the
 * near-tie refusal, the thin-evidence refusal.
 *
 * **It writes nothing.** It reports candidates for a human to read. At 34 rows
 * that is entirely tractable, and at these stakes it is the only defensible
 * mode: `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` measured what happens when
 * something is trusted to answer where the corpus is ambiguous, and a wrong
 * `overruled` link is worse than an unresolved one by exactly the margin that
 * evaluation describes.
 *
 * No model is called. No name is recalled from memory. Every candidate is a row
 * in `judgments` and every query name is a substring of a judgment we hold.
 */
import postgres from 'postgres';

import { nameBeforeCitation, yearFromCitationText } from './concordance-adjudicate.ts';
import { classifyMatch, rankCandidatesReportingLag } from './internal-concordance.ts';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('localhost') ? false : 'require',
  max: 2,
  connect_timeout: 120,
});

/** How much text before the citation to read the case name from. */
const CONTEXT = 400;

console.log('OVERRULED / DOUBTED EDGES WITH AN UNRESOLVED TARGET');
console.log('='.repeat(78));
console.log('report only — nothing is written, at any confidence');

const edges = await sql<
  {
    id: string;
    citationText: string;
    normalised: string;
    relationship: string;
    charOffset: number;
    citingTitle: string;
    citingText: string;
  }[]
>`
  SELECT jc.id, jc.citation_text AS "citationText", jc.normalised_citation AS "normalised",
         jc.relationship, jc.char_offset AS "charOffset",
         cj.case_title AS "citingTitle", cj.full_text AS "citingText"
  FROM judgment_citations jc
  JOIN judgments cj ON cj.id = jc.citing_judgment_id
  WHERE jc.cited_judgment_id IS NULL
    AND jc.relationship IN ('overruled', 'overruled_in_part', 'doubted')
  ORDER BY jc.relationship, jc.citation_text`;

console.log(`${edges.length} edges\n`);

const pool = await sql<{ id: string; caseTitle: string; judgmentDate: string }[]>`
  SELECT id, case_title AS "caseTitle", judgment_date::text AS "judgmentDate"
  FROM judgments WHERE court = 'Supreme Court of India'`;
console.log(`candidate pool: ${pool.length.toLocaleString()} Supreme Court judgments\n`);

let safe = 0;
let ambiguous = 0;
let thin = 0;
let noName = 0;
let noYear = 0;
let noCandidate = 0;

for (const e of edges) {
  const label = `${e.relationship.padEnd(18)} ${e.citationText.replace(/\s+/g, ' ').slice(0, 22).padEnd(22)}`;

  const year = yearFromCitationText(e.citationText);
  if (year === null) {
    noYear++;
    console.log(`${label} NO YEAR — cannot bound the search`);
    continue;
  }
  const context = e.citingText.slice(Math.max(0, e.charOffset - CONTEXT), e.charOffset);
  const name = nameBeforeCitation(context);
  if (name === null) {
    noName++;
    console.log(`${label} NO NAME printed beside it — nothing to match on`);
    continue;
  }

  const ranked = rankCandidatesReportingLag(name, year, pool);
  const verdict = classifyMatch(ranked);
  if (verdict.kind === 'no_candidate') {
    noCandidate++;
    console.log(`${label} no candidate — "${name.slice(0, 44)}"`);
    continue;
  }
  if (verdict.kind === 'ambiguous') {
    ambiguous++;
    console.log(
      `${label} AMBIGUOUS — "${name.slice(0, 34)}"\n` +
        `      ${verdict.top.jaccard.toFixed(2)} ${verdict.top.caseTitle.slice(0, 58)}\n` +
        `      ${verdict.runnerUp.jaccard.toFixed(2)} ${verdict.runnerUp.caseTitle.slice(0, 58)}  <-- too close to call`,
    );
    continue;
  }
  if (verdict.kind === 'thin') {
    thin++;
    console.log(
      `${label} THIN — "${name.slice(0, 34)}" → ${verdict.top.jaccard.toFixed(2)} ` +
        `${verdict.top.caseTitle.slice(0, 46)} (${verdict.top.distinguishingTokens} tokens)`,
    );
    continue;
  }
  safe++;
  console.log(
    `${label} CANDIDATE — "${name.slice(0, 34)}"\n` +
      `      ${verdict.top.jaccard.toFixed(2)} ${verdict.top.caseTitle.slice(0, 58)} (${verdict.top.judgmentDate.slice(0, 4)})`,
  );
}

console.log('');
console.log('RESULTS');
console.log('='.repeat(78));
console.log(`edges                    ${edges.length}`);
console.log(`  candidate found        ${safe}   <-- read these by hand before anything is written`);
console.log(`  ambiguous (refused)    ${ambiguous}`);
console.log(`  thin evidence (refused)${thin}`);
console.log(`  no name beside cite    ${noName}`);
console.log(`  no year parseable      ${noYear}`);
console.log(`  no candidate at all    ${noCandidate}`);
console.log('');
console.log('A refusal here is the correct outcome, not a failure: an unresolved');
console.log('overruled edge is visible, and a WRONG one silently marks live law dead');
console.log('or dead law live. Nothing was written by this run.');

await sql.end();
