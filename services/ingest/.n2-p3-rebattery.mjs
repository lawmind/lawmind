/**
 * NEW2 P3 — re-grade question A from the evidence already collected.
 *
 * The first pass asked "does the collapsed span contain the citation text" and
 * counted 17.7% as unverified. Reading the failures showed the check was wrong,
 * not the data: `citation_text` values such as "2022 INSC\n690" carry a literal
 * newline, and collapsing the haystack while leaving the needle alone can never
 * match. SQL `position()` had already found those strings — off by exactly one,
 * which is 1-based versus 0-based, not a defect.
 *
 * So question A splits into three answers, which is what it always was:
 *   PRINTED_AT_RECORDED_OFFSET   the string is where the edge says it is
 *   PRINTED_ELSEWHERE_IN_DOC     the string is in the judgment, the offset is wrong
 *   NOT_PRINTED_IN_DOC           the judgment does not contain it at all
 */
import { readFileSync, writeFileSync } from 'node:fs';

const T = JSON.parse(readFileSync('docs/ai/new2/citation-truth-set.json', 'utf8'));
const B = JSON.parse(readFileSync('docs/ai/new2/citation-battery.json', 'utf8'));
const OFFSET_TOLERANCE = 200;

for (const r of T.records) {
  const found = Number(r.span_offset_found) || 0;
  const rec = Number(r.span_offset_recorded) || 0;
  if (found === 0) r.extraction_state = 'NOT_PRINTED_IN_DOC';
  else if (Math.abs(found - rec) <= OFFSET_TOLERANCE) r.extraction_state = 'PRINTED_AT_RECORDED_OFFSET';
  else r.extraction_state = 'PRINTED_ELSEWHERE_IN_DOC';
  r.span_verified = r.extraction_state !== 'NOT_PRINTED_IN_DOC';
  // An expected behaviour that was decided on the broken check has to move with it.
  if (r.expected_resolver_behaviour === 'REFUSE_SPAN_UNVERIFIED' && r.span_verified) {
    r.expected_resolver_behaviour = r.candidate_count === 0
      ? 'REFUSE_TARGET_NOT_HELD'
      : (r.candidate_count === 1 ? 'RESOLVE_UNIQUE_TITLE_UNCONFIRMED' : 'REFUSE_AMBIGUOUS');
    r.ambiguity_reason = 'offset recorded on the edge does not point at the string, but the judgment does print it';
  }
}

const R = T.records;
const pct = (a, b) => (b ? +((a / b) * 100).toFixed(2) : null);
const tally = {};
for (const r of R) tally[r.extraction_state] = (tally[r.extraction_state] ?? 0) + 1;

const byForm = {};
for (const r of R) {
  const f = (byForm[r.form_class] ??= { records: 0, at_offset: 0, elsewhere: 0, not_printed: 0, not_held: 0, ambiguous: 0, pinned: 0 });
  f.records += 1;
  if (r.extraction_state === 'PRINTED_AT_RECORDED_OFFSET') f.at_offset += 1;
  if (r.extraction_state === 'PRINTED_ELSEWHERE_IN_DOC') f.elsewhere += 1;
  if (r.extraction_state === 'NOT_PRINTED_IN_DOC') f.not_printed += 1;
  if (r.candidate_count === 0) f.not_held += 1;
  if (r.candidate_count > 1) f.ambiguous += 1;
  if (r.stored_cited_judgment_id) f.pinned += 1;
}
for (const f of Object.values(byForm)) {
  f.printed_in_doc_pct = pct(f.at_offset + f.elsewhere, f.records);
  f.offset_wrong_pct = pct(f.elsewhere, f.records);
  f.not_printed_pct = pct(f.not_printed, f.records);
  f.target_not_held_pct = pct(f.not_held, f.records);
  f.ambiguous_pct = pct(f.ambiguous, f.records);
}

const shouldRefuse = R.filter((r) => r.expected_resolver_behaviour === 'REFUSE_AMBIGUOUS');
const refuseButPinned = shouldRefuse.filter((r) => r.stored_cited_judgment_id);

B.A_extraction_precision = {
  question: 'did the citing judgment actually print this string, and at the offset the edge claims?',
  printed_at_recorded_offset: tally.PRINTED_AT_RECORDED_OFFSET ?? 0,
  printed_elsewhere_in_doc: tally.PRINTED_ELSEWHERE_IN_DOC ?? 0,
  not_printed_in_doc: tally.NOT_PRINTED_IN_DOC ?? 0,
  printed_in_doc_pct: pct((tally.PRINTED_AT_RECORDED_OFFSET ?? 0) + (tally.PRINTED_ELSEWHERE_IN_DOC ?? 0), R.length),
  offset_trustworthy_pct: pct(tally.PRINTED_AT_RECORDED_OFFSET ?? 0, R.length),
  note: 'offset tolerance ' + OFFSET_TOLERANCE + ' characters; the first pass of this measure was wrong and its correction is recorded in .n2-p3-rebattery.mjs',
};
/**
 * Ambiguity has two kinds and they are not equally dangerous. Several candidate
 * rows that are the SAME AUTHORITY held twice — Allahabad's duplicate-document
 * population — make the pin materially right whichever row it lands on. Several
 * candidates that are DIFFERENT AUTHORITIES make it a coin toss shown to an
 * advocate as a fact. Reporting one number for both would have called the first
 * kind unsafe: measured here, that is 20 of the 20 flagged records.
 */
const normTitle = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bvs?\b/g, 'v').trim();
function ambiguityKind(r) {
  const titles = new Set(r.candidates.map((c) => normTitle(c.case_title)));
  const dates = new Set(r.candidates.map((c) => c.date));
  if (titles.size === 1 && dates.size === 1) return 'SAME_AUTHORITY_HELD_MORE_THAN_ONCE';
  if (titles.size === 1) return 'SAME_PARTIES_DIFFERENT_DATES';
  return 'DIFFERENT_AUTHORITIES';
}
for (const r of R) if (r.candidate_count > 1) r.ambiguity_kind = ambiguityKind(r);

const differentAuthorities = shouldRefuse.filter((r) => r.ambiguity_kind === 'DIFFERENT_AUTHORITIES');
const diffPinned = differentAuthorities.filter((r) => r.stored_cited_judgment_id);
const sameAuthority = shouldRefuse.filter((r) => r.ambiguity_kind === 'SAME_AUTHORITY_HELD_MORE_THAN_ONCE');
const samePinned = sameAuthority.filter((r) => r.stored_cited_judgment_id);

B.C_ambiguity_safety = {
  question: 'where several targets are legitimate, did anything pick one — and did it matter?',
  records_with_more_than_one_candidate: R.filter((r) => r.candidate_count > 1).length,
  records_where_refusal_is_correct: shouldRefuse.length,
  of_those_already_pinned: refuseButPinned.length,
  split: {
    SAME_AUTHORITY_HELD_MORE_THAN_ONCE: {
      meaning: 'the candidates are duplicate rows of one judgment — a pin on either is materially right, and the ambiguity is our duplicate-document population, not a legal one',
      records: sameAuthority.length,
      pinned: samePinned.length,
    },
    SAME_PARTIES_DIFFERENT_DATES: {
      meaning: 'same parties, different decision dates — orders in one proceeding; a pin may be on the wrong order',
      records: shouldRefuse.filter((r) => r.ambiguity_kind === 'SAME_PARTIES_DIFFERENT_DATES').length,
      pinned: shouldRefuse.filter((r) => r.ambiguity_kind === 'SAME_PARTIES_DIFFERENT_DATES' && r.stored_cited_judgment_id).length,
    },
    DIFFERENT_AUTHORITIES: {
      meaning: 'genuinely different judgments share the citation — a pin here shows an advocate the wrong authority as a fact',
      records: differentAuthorities.length,
      pinned: diffPinned.length,
    },
  },
  materially_unsafe_pin_rate_pct: pct(diffPinned.length, differentAuthorities.length),
  examples: refuseButPinned.slice(0, 5).map((r) => ({
    citation_text: r.citation_text,
    candidates: r.candidate_count,
    ambiguity_kind: r.ambiguity_kind,
    pinned_to: r.stored_cited_judgment_id,
    reason: r.ambiguity_reason,
  })),
};
B.E_by_form_class = byForm;

writeFileSync('docs/ai/new2/citation-truth-set.json', JSON.stringify(T, null, 1));
writeFileSync('docs/ai/new2/citation-battery.json', JSON.stringify(B, null, 1));

console.log('A extraction:', JSON.stringify(B.A_extraction_precision, null, 1));
console.log('C ambiguity :', JSON.stringify({ ...B.C_ambiguity_safety, examples: undefined }, null, 1));
console.log('\nby form class');
for (const [k, v] of Object.entries(byForm)) {
  console.log('  ' + k.padEnd(28) + 'n=' + String(v.records).padStart(4)
    + '  printed=' + String(v.printed_in_doc_pct).padStart(6) + '%'
    + '  offset_wrong=' + String(v.offset_wrong_pct).padStart(6) + '%'
    + '  not_held=' + String(v.target_not_held_pct).padStart(6) + '%'
    + '  ambiguous=' + String(v.ambiguous_pct).padStart(6) + '%'
    + '  pinned=' + v.pinned);
}

// ---- P3.E stratification: court, decade, quality state, source era ---------
function cut(keyFn, label) {
  const out = {};
  for (const r of R) {
    const k = keyFn(r);
    if (k === null || k === undefined) continue;
    const c = (out[k] ??= { records: 0, printed_in_doc: 0, not_held: 0, ambiguous: 0, pinned: 0 });
    c.records += 1;
    if (r.span_verified) c.printed_in_doc += 1;
    if (r.candidate_count === 0) c.not_held += 1;
    if (r.candidate_count > 1) c.ambiguous += 1;
    if (r.stored_cited_judgment_id) c.pinned += 1;
  }
  for (const c of Object.values(out)) {
    c.printed_in_doc_pct = pct(c.printed_in_doc, c.records);
    c.target_not_held_pct = pct(c.not_held, c.records);
    c.resolved_pct = pct(c.pinned, c.records);
  }
  return { label, cells: out };
}
B.F_stratification = {
  by_citing_court: cut((r) => r.citing.court, 'the court whose judgment printed the citation'),
  by_citing_decade: cut((r) => (r.citing.date ? String(r.citing.date).slice(0, 3) + '0s' : null), 'decade of the citing judgment'),
  by_citing_text_quality: cut((r) => {
    const q = r.citing.text_quality;
    if (q === null || q === undefined) return 'text_quality_NULL';
    return Number(q) < 0.85 ? 'below_0.85' : 'at_or_above_0.85';
  }, 'text quality of the citing document'),
  by_citing_script_quality: cut((r) => r.citing.script_quality ?? 'script_quality_NULL_never_screened_or_clean', 'proven script damage state of the citing document'),
};
writeFileSync('docs/ai/new2/citation-battery.json', JSON.stringify(B, null, 1));
console.log('\nP3.E cuts written:', Object.keys(B.F_stratification).join(', '));
for (const [k, v] of Object.entries(B.F_stratification.by_citing_decade.cells)) console.log('  ' + k + '  n=' + v.records + '  printed=' + v.printed_in_doc_pct + '%  not_held=' + v.target_not_held_pct + '%  resolved=' + v.resolved_pct + '%');
