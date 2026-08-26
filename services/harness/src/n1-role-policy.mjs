/**
 * NEW1 — R8.3 §8 role classifier + eligibility policy, shared by the
 * materialiser and the evidence-safe experiment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A COPY AND NOT AN IMPORT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2's `classify()` lives in `scripts/n2-role-census-widened.mts`, whose module
 * body opens a database connection on import. Importing it to reuse one pure
 * function would start a second connection and run a census.
 *
 * So it is copied — and a copy of somebody else's rule is a drift hazard, which
 * is the whole reason `deployed-hash-catches-contract-drift` is a lesson on this
 * programme. `assertClassifierParity()` re-reads NEW2's source at run time,
 * normalises it and compares the hash. If NEW2 changes a regex, my run FAILS
 * rather than silently reporting numbers that are no longer comparable with
 * theirs. That comparability is the entire value of using their classifier
 * instead of writing my own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE CLASSIFIER IS NOT PORTED TO SQL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §9 arm 3 needs the eligibility predicate inside the SQL that pgvector plans,
 * so the labels must reach the database somehow. The two ways are (a) port the
 * regex cascade to Postgres ARE, or (b) run the JS classifier and materialise the
 * label.
 *
 * (a) is a fidelity trap. JS `.` does not cross a newline and Postgres `.` does;
 * `\b` is `\y`; `t.length` counts UTF-16 units and `length()` counts characters.
 * Three silent divergences in a cascade whose whole job is to be identical to
 * NEW2's. (b) has none of them: the same function produces the label, and the
 * label is what SQL filters on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES NOT DECIDE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The eligibility SETS below are named parameters, not a frozen policy. §12 N1-5
 * says the experiment runs after NEW2/FIFTH freeze the role policy, and §8.2 says
 * no agent may infer one permission from another. Every arm therefore reports the
 * policy name it ran under, and the experiment reports more than one so the
 * freeze decision can see the sensitivity rather than one number chosen here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The hash of NEW2's classifier region as it stood when this copy was taken,
 * at bus 1336 / `docs/ai/new2-r83/ROLE_CENSUS_WIDENED_R8_3.md`.
 */
export const N2_CLASSIFIER_SHA256 =
  '76efa180c72424ad74735698a5a33c3360732631bd5d435d3c90f18bc83dad16';
export const N2_CLASSIFIER_SOURCE = 'scripts/n2-role-census-widened.mts';
/** Lines 71-90 inclusive: CONTROL_CHARS through the close of `classify`. */
export const N2_CLASSIFIER_LINES = [71, 90];

/** The classifier version this lane records on every materialised row. */
export const CLASSIFIER_VERSION = 'N2_REGEX_R8_3@1336';

export const ROLES = [
  'SPAN_UNVERIFIABLE',
  'DAMAGED_OR_OCR_SUSPECT',
  'REPORTER_EDITORIAL',
  'CASE_HEADER',
  'PARTY_SUBMISSION',
  'QUOTED_PRECEDENT',
  'PROCEDURAL_HISTORY',
  'HOLDING_OPERATIVE',
  'COURT_REASONING',
  'FACTS',
  'OTHER_UNKNOWN',
];

// ── NEW2's rules, copied verbatim ────────────────────────────────────────────
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f�]/;
const COLLAPSED_GLYPH = /([A-Za-z]\s){12,}/;

export function classify(text, spanOk) {
  if (!spanOk) return 'SPAN_UNVERIFIABLE';
  const t = text.trim();
  if (t.length === 0) return 'SPAN_UNVERIFIABLE';
  const ctrl = (t.match(new RegExp(CONTROL_CHARS, 'g')) ?? []).length;
  if (ctrl / t.length > 0.002 || COLLAPSED_GLYPH.test(t)) return 'DAMAGED_OR_OCR_SUSPECT';
  if (/\bheadnote\b|\bHELD\s*:|editorial note|\bsyllabus\b|running head/i.test(t)) return 'REPORTER_EDITORIAL';
  if (/^\s*(IN THE (HIGH COURT|SUPREME COURT)|BEFORE\b|CORAM\b)|versus\s|\bPetitioner\b.*\bRespondent\b/i.test(t.slice(0, 400))) return 'CASE_HEADER';
  if (/learned counsel (for|appearing)|it is (submitted|contended|argued) (by|on behalf)|\bMr\.\s+\w+,?\s+learned/i.test(t)) return 'PARTY_SUBMISSION';
  if (/^\s*["“]|\bthe (Supreme Court|Apex Court) (has )?(held|observed) (in|that)\b.*[:：]\s*["“]/i.test(t)) return 'QUOTED_PRECEDENT';
  if (/\blisted (on|for)\b|\bregistry\b|\bnotice (be )?issued\b|\badjourn/i.test(t)) return 'PROCEDURAL_HISTORY';
  if (/\b(appeal|petition|application) is (hereby )?(allowed|dismissed|disposed)\b|\bimpugned (order|judgment) is (set aside|quashed)\b/i.test(t)) return 'HOLDING_OPERATIVE';
  if (/\b(I|we) am (of the view|satisfied)\b|\bin my (considered )?(view|opinion)\b|\bwe are of the (considered )?opinion\b/i.test(t)) return 'COURT_REASONING';
  if (/\bprosecution case\b|\bFIR (was )?(registered|lodged)\b|\bbriefly stated,? the facts\b/i.test(t)) return 'FACTS';
  return 'OTHER_UNKNOWN';
}

/**
 * Span truth, defined identically to NEW2's census: a slice that does not come
 * back at exactly `body_length` characters is not the span it claims to be, and
 * is `SPAN_UNVERIFIABLE` rather than quietly classified on partial text.
 */
export function spanOkFor(slice, bodyLength) {
  return slice !== null && slice !== undefined && bodyLength > 0 && slice.length === bodyLength;
}

export function assertClassifierParity(root) {
  const src = readFileSync(`${root}/${N2_CLASSIFIER_SOURCE}`, 'utf8');
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const region = lines.slice(N2_CLASSIFIER_LINES[0] - 1, N2_CLASSIFIER_LINES[1]).join('\n');
  const norm = region
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('/**') && !l.startsWith('*'))
    .join('\n');
  const got = createHash('sha256').update(norm, 'utf8').digest('hex');
  if (got !== N2_CLASSIFIER_SHA256) {
    throw new Error(
      `classifier drift: ${N2_CLASSIFIER_SOURCE} lines ${N2_CLASSIFIER_LINES.join('-')} hash ${got}, ` +
        `pinned ${N2_CLASSIFIER_SHA256}. NEW2 changed the rules; re-take the copy and re-run the ` +
        `materialiser before scoring anything, because the labels are no longer comparable.`,
    );
  }
  return got;
}

// ── ELIGIBILITY POLICIES — §8.1 states, kept separate on purpose ─────────────
//
// §8.1 forbids collapsing RETRIEVAL_SIGNAL_ELIGIBLE, DISPLAY_SNIPPET_ELIGIBLE,
// GENERATION_EVIDENCE_ELIGIBLE and EXCLUDED_OR_UNKNOWN into one flag. These are
// GENERATION_EVIDENCE candidate sets only. Nothing here says a passage may be
// stored, indexed, displayed or trained on — those are four other questions and
// §8.2 forbids inferring any of them from this one.

/**
 * The reading §8.3 fails closed to: evidence must be the court's own words, and
 * an UNLABELLED passage is `EXCLUDED_OR_UNKNOWN`, not court-authored.
 * `QUOTED_PRECEDENT` is another court's words inside this one and carries an
 * attribution problem of its own, so it is out of the strict set.
 */
export const GENERATION_EVIDENCE_STRICT = [
  'COURT_REASONING',
  'HOLDING_OPERATIVE',
  'FACTS',
  'PROCEDURAL_HISTORY',
];

/**
 * The sensitivity arm. `OTHER_UNKNOWN` is ~60% of the pool, so the strict set
 * and this one bracket the answer. It is reported so the freeze can see how much
 * of any result rests on treating unlabelled text as court-authored — which it
 * is not; the class means the cascade recognised nothing.
 */
export const GENERATION_EVIDENCE_WITH_UNKNOWN = [...GENERATION_EVIDENCE_STRICT, 'OTHER_UNKNOWN'];

/**
 * Arm A's exclusion, expressed as what survives. This removes only what §8.3
 * names — high-confidence reporter/editorial — plus the two damage classes that
 * cannot be evidence for a different reason: the span is not provable.
 */
export const REPORTER_EXCLUDED_ONLY = ROLES.filter(
  (r) => !['REPORTER_EDITORIAL', 'SPAN_UNVERIFIABLE', 'DAMAGED_OR_OCR_SUSPECT'].includes(r),
);

export const POLICIES = {
  GENERATION_EVIDENCE_STRICT,
  GENERATION_EVIDENCE_WITH_UNKNOWN,
  REPORTER_EXCLUDED_ONLY,
};

/** Roles that may never be presented as the court's own reasoning — §8.3. */
export const NEVER_AS_COURT = [
  'REPORTER_EDITORIAL',
  'PARTY_SUBMISSION',
  'QUOTED_PRECEDENT',
  'SPAN_UNVERIFIABLE',
  'DAMAGED_OR_OCR_SUSPECT',
];

/** The two damage classes, reported separately from role composition. */
export const DAMAGE_ROLES = ['SPAN_UNVERIFIABLE', 'DAMAGED_OR_OCR_SUSPECT'];
