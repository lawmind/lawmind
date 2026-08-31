/**
 * NEW2 — R18 §4. THE `-DB` TOKEN BOUNDARY, CLASSIFIED.
 *
 * R17 §7 left this open: the page prints `2025:DHC:8491-DB`, the corpus holds
 * `2025:DHC:8491`, and the two are different citation keys. This derives the
 * §4 class table from the exhaustive walk's occurrence counters and runs the
 * positive and negative controls against BOTH regexes, so the fix is shown not
 * to move anything it was not aimed at.
 *
 * Pure derivation over committed artifacts plus in-process regex controls. No
 * database, no network.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CKPT = join(ROOT, 'docs/ai/new2-r18/reparse-checkpoint.json');
const OUT = join(ROOT, 'docs/ai/new2-r18/db-suffix-defect.json');
const NL = String.fromCharCode(10);

/** The rule as it stood at 8ff7083d. */
const OLD = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;
/** The proposed rule: the boundary belongs to the NUMBER, the suffix follows it. */
const NEW = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g;
const all = (re: RegExp, s: string): string[] => [...s.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0]);

/**
 * Controls. Every POSITIVE string was sampled out of the corpus; the NEGATIVE
 * strings are the shapes a greedy suffix could plausibly eat and must not.
 */
const CONTROLS: { kind: 'positive' | 'negative'; text: string; note: string }[] = [
  { kind: 'positive', text: '2023:DHC:2073-DB before the bench', note: 'a clean -DB, the form 210,754 rows already hold' },
  { kind: 'positive', text: '2023:DHC:2073-FB before the bench', note: 'a clean -FB, 37 rows' },
  { kind: 'positive', text: 'IN THE HIGH COURT' + NL + '2023:DHC:2720' + NL + 'JUDGMENT', note: 'no suffix at all' },
  { kind: 'positive', text: 'Neutral Citation 2023:KHC-D:1', note: 'a hyphenated COURT token, which is not a suffix' },
  { kind: 'positive', text: '2023:AHC:111864-DBNeutral Citation No. - 2023:AHC:111864-DB Reserved on 16.', note: 'the defect, sampled: judgment cfd18fe3-c878-4640-b070-dcf66fcb181a' },
  { kind: 'positive', text: '2025:DHC:8491-DBThis is a digitally signed order', note: 'the defect as R17 §7 recorded it' },
  { kind: 'negative', text: '2023:DHC:2073-Crl.A. 55 of 2023', note: 'a hyphen belonging to the NEXT token' },
  { kind: 'negative', text: '2023:DHC:2073-SB before the bench', note: 'a bench abbreviation that is not one of the two real suffixes' },
  { kind: 'negative', text: 'x2023:DHC:2720', note: 'no leading word boundary — must not match at all' },
  { kind: 'negative', text: '2023:DHC:11186499', note: 'a number too long for the series — must not match at all' },
];

const ckpt = JSON.parse(readFileSync(CKPT, 'utf8'));
const occ = ckpt.dbOccurrences as Record<string, number>;
const rowLevel = ckpt.dbSuffix as Record<string, number>;
const tails = ckpt.dbGlueTails as Record<string, number>;

const controls = CONTROLS.map((c) => {
  const o = all(OLD, c.text);
  const n = all(NEW, c.text);
  return { ...c, oldRule: o, proposedRule: n, unchanged: JSON.stringify(o) === JSON.stringify(n) };
});
const negativesMoved = controls.filter((c) => c.kind === 'negative' && !c.unchanged);

/**
 * WHAT the suffix was glued to. This is the whole safety question: a greedy
 * suffix is only safe if nothing it now eats could be a longer real token. Every
 * distinct continuation is classified, not sampled.
 */
const tailShapes = {
  NEXT_CITATION_CONCATENATED: 0,
  PAGE_OR_PARA_NUMBER_CONCATENATED: 0,
  WORD_CONCATENATED: 0,
  CONTROL_CHAR_OR_MOJIBAKE: 0,
  OTHER: 0,
  COULD_BE_A_LONGER_SUFFIX: 0,
};
const tailExamples: Record<string, string[]> = {};
for (const [tail, n] of Object.entries(tails)) {
  let kind: keyof typeof tailShapes;
  if (/^[0-9]{4}:[A-Z]/.test(tail)) kind = 'NEXT_CITATION_CONCATENATED';
  else if (/^[0-9]{1,3}(?:$|[^0-9])/.test(tail)) kind = 'PAGE_OR_PARA_NUMBER_CONCATENATED';
  else if (/[\u0000-\u001f\ufffd]/.test(tail)) kind = 'CONTROL_CHAR_OR_MOJIBAKE';
  else if (/^[A-Za-z]/.test(tail)) kind = 'WORD_CONCATENATED';
  else kind = 'OTHER';
  tailShapes[kind] += n;
  // The one shape that could be a longer real suffix: two or more capitals with
  // no lower-case letter following, e.g. a hypothetical `-DBC`.
  if (/^[A-Z]{2,}(?![a-z])/.test(tail)) tailShapes.COULD_BE_A_LONGER_SUFFIX += n;
  (tailExamples[kind] ??= []).length < 8 && tailExamples[kind]!.push(tail);
}

const glued = occ['occurrence_suffix_GLUED'] ?? 0;
const corroborated = occ['glued_CORROBORATED_elsewhere_in_document'] ?? 0;
const uncorroborated = occ['glued_only_occurrence'] ?? 0;
const damageShare = tailShapes.CONTROL_CHAR_OR_MOJIBAKE;

const artifact = {
  artifact: 'NEW2_R18_DB_SUFFIX_DEFECT',
  lane: 'NEW2',
  takenAt: new Date().toISOString(),
  scope: {
    basis: 'EXHAUSTIVE',
    definition:
      'every neutral-citation occurrence in every AWS High Court document carrying a stored neutral_citation; occurrences, not rows',
    rowsWalked: ckpt.rowsEvaluated,
    occurrencesInspected: Object.values(occ).reduce((a, b) => a + b, 0) - corroborated - uncorroborated,
  },
  DB_SUFFIX_DEFECT_REPRODUCED: 'YES',
  reproduction: {
    inputSampledFrom: 'judgment cfd18fe3-c878-4640-b070-dcf66fcb181a, Allahabad High Court',
    text: '2023:AHC:111864-DBNeutral Citation No. - 2023:AHC:111864-DB Reserved on 16.',
    oldRule: all(OLD, '2023:AHC:111864-DBNeutral Citation No. - 2023:AHC:111864-DB Reserved on 16.'),
    proposedRule: all(NEW, '2023:AHC:111864-DBNeutral Citation No. - 2023:AHC:111864-DB Reserved on 16.'),
    mechanism:
      "the optional group ends in a word boundary. On `...8491-DBThis` the B|T pair is not a boundary, the -DB alternative fails, the group matches EMPTY, and the boundary after the digits succeeds against the hyphen. The regex never fails — it returns a DIFFERENT citation key, and the same document can then yield two distinct keys for one citation.",
  },
  classes: {
    VALID_SUFFIX_FORM: occ['occurrence_suffix_with_boundary'] ?? 0,
    NO_SUFFIX_PRINTED: occ['occurrence_no_suffix'] ?? 0,
    MISSING_BOUNDARY: glued,
    of_which_TEXT_CONCATENATION_DAMAGE: damageShare,
    of_which_CORROBORATED_BY_A_CLEAN_PRINT_IN_THE_SAME_DOCUMENT: corroborated,
    of_which_AMBIGUOUS_single_uncorroborated_occurrence: uncorroborated,
    EXTRACTION_BUG:
      'all ' + glued + ' — the missing boundary is the SOURCE condition; the extraction bug is the regex answering a different key instead of failing, and it is ours',
  },
  existingRowsAffected: {
    STORED_WITH_SUFFIX: rowLevel['stored_with_suffix'] ?? 0,
    STORED_PLAIN_AND_THE_SUFFIXED_FORM_IS_GLUED_IN_THE_TEXT: rowLevel['plain_stored_suffix_in_text_GLUED'] ?? 0,
    STORED_PLAIN_AND_THE_SUFFIXED_FORM_HAS_A_BOUNDARY_IN_THE_TEXT: rowLevel['plain_stored_suffix_in_text_WITH_boundary'] ?? 0,
    STORED_PLAIN_AND_NO_SUFFIX_ANYWHERE: rowLevel['plain_stored_no_suffix_in_text'] ?? 0,
    note: 'existing rows are CANDIDATES only. Nothing here rewrites one.',
  },
  glueTailShapes: tailShapes,
  glueTailExamples: tailExamples,
  glueTails: tails,
  controls,
  controlVerdict: {
    negativeControlsMoved: negativesMoved.length,
    negativeControlsMovedDetail: negativesMoved,
    positiveControlsFixed: controls.filter((c) => c.kind === 'positive' && !c.unchanged).length,
    safeToShipForFutureExtraction: negativesMoved.length === 0 && tailShapes.COULD_BE_A_LONGER_SUFFIX === 0,
  },
  DB_SUFFIX_FUTURE_FIX:
    'services/ingest/src/harvest/hc-load.ts NEUTRAL_G: move the word boundary onto the NUMBER and let the suffix follow it — /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/ . Future extraction only.',
  notDoneHere: {
    'services/ingest/src/citations.ts': 'carries the same regex for CITED references. Changing it changes the citation EDGE key space while CITATION_BULK_APPLY = HOLD, so it is named and measured here and left alone — the same occurrence count bounds its exposure.',
    existingRows: 'candidate-only, in NEW2-R18-EXISTING; no judgments row is rewritten.',
  },
};
const body = JSON.stringify(artifact, null, 1) + NL;
writeFileSync(OUT, body);
console.log('[db] classes', JSON.stringify(artifact.classes, null, 1));
console.log('[db] existing rows', JSON.stringify(artifact.existingRowsAffected, null, 1));
console.log('[db] control verdict', JSON.stringify(artifact.controlVerdict.safeToShipForFutureExtraction));
console.log('[db] negatives moved', negativesMoved.length, 'COULD_BE_A_LONGER_SUFFIX', tailShapes.COULD_BE_A_LONGER_SUFFIX);
console.log('[db] sha256', createHash('sha256').update(body).digest('hex'));
console.log('[db] wrote', OUT);
