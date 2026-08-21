/**
 * NEW1 — how much of what I have ALREADY embedded is not language?
 *
 * NEW2 measured (bus 0910, corrected in 0915) that 8.9% of the admitted Tier-A
 * population is text that is not language in any script — no Devanagari and
 * under 12 English function words per thousand characters — concentrated in
 * Punjab and Haryana at 53.9% and Karnataka at 47.1%, under 3% everywhere else.
 * 76.9% of the suspects declare fonts with no `/ToUnicode` map against 10.3% of
 * controls, so no re-extraction fixes them: the mapping is absent from the file.
 * `text_quality` scores all of them at or above the 0.85 floor, so `axis_b_text`
 * admits every one.
 *
 * That is their measurement of the POPULATION. This is mine of the ARTEFACT: of
 * the vectors actually written into `new1_doc_vector_stage`, how many are over
 * text a person could not read?
 *
 * WHY THIS DOES NOT BECOME A FILTER
 * ---------------------------------
 * It is tempting to add an English-density screen to the embed stage and skip
 * them. That is exactly the mistake this lane made today with `bail_order`:
 * transcribing a judgement about eligibility into a private skip list, which then
 * drifted from the deployed contract and quietly discarded documents the contract
 * admitted. `text_quality` and `script_quality` are axis B, axis B belongs to the
 * eligibility view, and if the contract admits a document my job is to embed it
 * and to say what that costs — not to refuse it on my own authority.
 *
 * So this measures and reports. Whether axis B should carry an English-density
 * floor is a contract question for LCC.
 *
 * The density is computed over the SAME span that was embedded (`embedded_chars`
 * of the head), not over the whole document, because the vector is a fact about
 * that span and nothing else.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const url = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const PER_COURT = Number(process.env.PER_COURT ?? 400);
/** NEW2's threshold, reused rather than reinvented so the two figures compare. */
const FLOOR_PER_1000 = Number(process.env.FLOOR_PER_1000 ?? 12);
const OUT = new URL('../../../docs/ai/new1-tier-a/staged-readability.json', import.meta.url);

const sql = postgres(url, { ssl: false, max: 1, connection: { statement_timeout: 300_000 }, onnotice: () => {} });

/** Common English function words. Deliberately short and boring — the point is
 *  that ANY readable English prose contains these at a high rate, and mojibake
 *  contains them at essentially zero. */
const FUNCTION_WORDS = new Set([
  'the', 'of', 'and', 'to', 'in', 'is', 'that', 'this', 'for', 'was', 'be', 'by',
  'with', 'as', 'on', 'it', 'not', 'are', 'has', 'have', 'been', 'which', 'or',
  'an', 'a', 'at', 'from', 'shall', 'said', 'court', 'petitioner', 'respondent',
]);
const DEVANAGARI = /[ऀ-ॿ]/;

function densityPer1000(text) {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let hits = 0;
  for (const w of words) if (FUNCTION_WORDS.has(w)) hits += 1;
  return text.length === 0 ? 0 : (1000 * hits) / text.length;
}

const courts = await sql`
  SELECT court, count(*)::int AS staged FROM new1_doc_vector_stage
  GROUP BY 1 ORDER BY staged DESC
`;

const rows = [];
for (const c of courts) {
  const docs = await sql`
    SELECT s.judgment_id, s.embedded_chars, left(j.full_text, s.embedded_chars) AS head
    FROM (
      SELECT * FROM new1_doc_vector_stage WHERE court = ${c.court} ORDER BY random() LIMIT ${PER_COURT}
    ) s
    JOIN judgments j ON j.id = s.judgment_id
    WHERE j.full_text IS NOT NULL
  `;
  let notLanguage = 0;
  let devanagari = 0;
  for (const d of docs) {
    if (DEVANAGARI.test(d.head)) {
      devanagari += 1;
      continue; // a Devanagari document is not judged by an English screen
    }
    if (densityPer1000(d.head) < FLOOR_PER_1000) notLanguage += 1;
  }
  const judged = docs.length - devanagari;
  rows.push({
    court: c.court,
    stagedRows: c.staged,
    sampled: docs.length,
    devanagariPresent: devanagari,
    judged,
    notLanguage,
    ratePct: judged === 0 ? null : Number(((100 * notLanguage) / judged).toFixed(1)),
    projectedStaged: judged === 0 ? null : Math.round((c.staged * notLanguage) / judged),
  });
  console.log(
    `  ${c.court.padEnd(38)} staged ${String(c.staged).padStart(7)}  sampled ${String(docs.length).padStart(4)}  not-language ${String(rows.at(-1).ratePct).padStart(5)}%`,
  );
}

const totalStaged = rows.reduce((a, r) => a + r.stagedRows, 0);
const totalProjected = rows.reduce((a, r) => a + (r.projectedStaged ?? 0), 0);
const report = {
  kind: 'new1_staged_readability_census',
  measuredAt: new Date().toISOString(),
  floorPer1000: FLOOR_PER_1000,
  perCourtSample: PER_COURT,
  note:
    'Measures the span that was EMBEDDED, not the whole document. Reports only; ' +
    'axis B belongs to the eligibility view and this lane does not filter on its own authority.',
  stagedRows: totalStaged,
  projectedNotLanguage: totalProjected,
  projectedPct: Number(((100 * totalProjected) / Math.max(totalStaged, 1)).toFixed(2)),
  byCourt: rows.sort((a, b) => (b.ratePct ?? 0) - (a.ratePct ?? 0)),
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(
  `\nstaged ${totalStaged} · projected not-language ${totalProjected} (${report.projectedPct}%)\nwrote ${OUT.pathname}`,
);
await sql.end({ timeout: 10 });
