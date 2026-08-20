/**
 * NEW2 — THE FOUR QUALITY AXES, AS ONE FUNCTION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE AND NOT A COLUMN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC and NEW1 need semantic-quality state to be QUERYABLE. The obvious way to
 * do that is to write it onto every row, and it is the wrong way: the corpus is
 * 18,698,968 rows, the screens below will change as more courts are labelled,
 * and a stored verdict from a superseded screen is indistinguishable from a
 * current one unless every row also carries a version — at which point the
 * column is a cache with an invalidation problem rather than a fact.
 *
 * So the state is DERIVED, and this module is the single definition of it.
 * `quality-export-cli.ts` streams it as JSONL for whatever population a caller
 * asks for, and `semantic-core-audit-cli.ts` measures with the same predicates,
 * so the audit's percentages and the export's rows cannot disagree.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR AXES, AND THE ARROW THAT DELIBERATELY DOES NOT EXIST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ops/new2/DOCUMENT_QUALITY_VOCABULARY.md` is the prose. The rule that
 * matters here: **no arrow runs from DISPOSITION to CITABILITY.** `DISMISSED`,
 * `DISPOSED` and `CLOSED` are registry bookkeeping about a FILE. A dismissal
 * after a full hearing is precedent and a dismissal for non-prosecution is not,
 * and both write the same string. Anything in this file that inferred substance
 * from a disposal word would reintroduce the defect the vocabulary exists to
 * name.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY VERDICT CARRIES ITS METHOD AND ITS VERSION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A consumer has to be able to tell "screened and found clean" from "nothing has
 * looked", and to tell a verdict made under a 40-marker list from one made under
 * a later list. Both are in `method`. `UNKNOWN` is a value, never a null.
 */
import { MINED_MARKERS, SUSPECT_MARKER_RATE, textSignature } from './legacy-font.ts';

/**
 * Bumped by hand when a SCREEN changes meaning, not when this file is
 * reformatted. A consumer comparing two exports needs to know whether a moved
 * rate is the corpus moving or the definition moving.
 */
export const QUALITY_STATE_VERSION = 'v1';

/* ── Axis 4: TEXT QUALITY ───────────────────────────────────────────────── */

export type TextQualityState =
  | 'KNOWN_GOOD'
  | 'KNOWN_DEFECT'
  | 'LEGACY_FONT_SUSPECT'
  | 'NO_EXTRACTABLE_TEXT'
  | 'OCR_CANDIDATE'
  | 'UNKNOWN';

/**
 * English function words per thousand characters.
 *
 * The complement of the mined-marker screen, and the two catch different things.
 * `MINED_MARKERS` was derived from Kruti-Dev-family Hindi, so it recognises the
 * ASCII that ONE broken encoding produces. Measured 20 Aug 2026 on 25,000
 * uniform draws: it fired on 2 of 13,284 admitted documents, while 1,117 of them
 * carry text like `74< =7/ 12- <.50 7==-4;-<` — substitution garbage from
 * subset-embedded fonts with no `/ToUnicode` map, which is a different broken
 * encoding and produces different ASCII.
 *
 * This measures the complementary thing: how much English is in text that claims
 * to be English. The list is function words and courtroom furniture only, with
 * no legal reasoning terms, so a short procedural order scores as highly as a
 * long judgment — the screen must not accidentally become a substance detector.
 */
export const ENGLISH_FUNCTION_WORDS =
  /\b(the|of|and|to|in|is|that|for|this|be|by|with|as|it|has|have|not|shall|been|on|are|was|court|petitioner|respondent|order|application|learned|counsel|section|dated|filed|hon)\b/gi;

/**
 * Twelve per thousand.
 *
 * Not a round number chosen in advance. The distribution over 13,284 admitted
 * documents is bimodal with a clear valley — 8.3% below 12, 3.4% between 12 and
 * 40, 88.3% above 40 — and documents were read on both sides of it before the
 * constant was written down. Below the floor the sampled documents are
 * unreadable and their only real text is the digital-signature appliance's
 * footer; between 12 and 40 they are readable English with OCR spacing damage,
 * which is DEGRADED and not UNSAFE, so the floor is not raised to catch them.
 *
 * Corroborated by PDF-native evidence rather than by eye alone: of documents
 * below the floor, 76.9% of the font-readable PDFs declare fonts and not one
 * `/ToUnicode` map, against 10.3% of controls drawn from the same courts.
 */
export const ENGLISH_RATE_FLOOR = 12;

export function englishRate(text: string): number {
  if (text.length === 0) return 0;
  return (1000 * (text.match(ENGLISH_FUNCTION_WORDS) ?? []).length) / text.length;
}

export type TextVerdict = {
  state: TextQualityState;
  method: string;
  englishRate: number;
  markerRate: number;
};

/**
 * Screen the text we hold.
 *
 * `KNOWN_GOOD` is never returned from the ABSENCE of a signal, which is the
 * whole discipline of this axis. It is returned only when a stored verdict says
 * so — i.e. when something with a second extraction or a PDF font dictionary in
 * hand has already ruled. A pure-ASCII English judgment and a Hindi judgment
 * whose Devanagari the extractor deleted are the same bytes to every check
 * available at scan time, and `KNOWN_GOOD` over that population would be exactly
 * the lie the column exists to prevent.
 */
export function textVerdict(input: {
  text: string | null;
  storedScriptQuality: string | null;
  storedScriptMethod: string | null;
}): TextVerdict {
  const text = input.text ?? '';
  const sig = textSignature(text, MINED_MARKERS);
  const en = englishRate(text);

  /* A stored verdict outranks a scan: it was made with evidence a scan does not
   * have — a second extraction, or the PDF's own font dictionary. */
  if (input.storedScriptQuality === 'legacy_font_ascii') {
    return {
      state: 'LEGACY_FONT_SUSPECT',
      method: input.storedScriptMethod ?? 'stored',
      englishRate: en,
      markerRate: sig.markerRate,
    };
  }
  if (
    input.storedScriptQuality === 'devanagari_deleted' ||
    input.storedScriptQuality === 'damaged_other'
  ) {
    return {
      state: 'KNOWN_DEFECT',
      method: input.storedScriptMethod ?? 'stored',
      englishRate: en,
      markerRate: sig.markerRate,
    };
  }
  if (input.storedScriptQuality === 'clean' || input.storedScriptQuality === 'mixed_script_ok') {
    return {
      state: 'KNOWN_GOOD',
      method: input.storedScriptMethod ?? 'stored',
      englishRate: en,
      markerRate: sig.markerRate,
    };
  }

  if (text.length === 0) {
    return {
      state: 'NO_EXTRACTABLE_TEXT',
      method: `empty_text_${QUALITY_STATE_VERSION}`,
      englishRate: 0,
      markerRate: 0,
    };
  }
  if (sig.zeroDevanagari && sig.markerRate >= SUSPECT_MARKER_RATE) {
    return {
      state: 'LEGACY_FONT_SUSPECT',
      method: 'text_marker_screen_v1',
      englishRate: en,
      markerRate: sig.markerRate,
    };
  }
  /* No Devanagari AND almost no English. Not a document in either language, so
   * whatever it is, it is not what the court published. */
  if (sig.zeroDevanagari && en < ENGLISH_RATE_FLOOR) {
    return {
      state: 'OCR_CANDIDATE',
      method: `english_density_screen_${QUALITY_STATE_VERSION}`,
      englishRate: en,
      markerRate: sig.markerRate,
    };
  }
  /* Everything else is UNKNOWN, and that is the honest answer rather than a
   * disappointing one. Nothing here has positive evidence that the extraction is
   * faithful; it only has the absence of two specific defects. */
  return {
    state: 'UNKNOWN',
    method: `no_positive_evidence_${QUALITY_STATE_VERSION}`,
    englishRate: en,
    markerRate: sig.markerRate,
  };
}

/* ── Axis 1: DOCUMENT ROLE ──────────────────────────────────────────────── */

export type DocumentRole =
  | 'judgment'
  | 'final_order'
  | 'interim_order'
  | 'bail_order'
  | 'procedural'
  | 'registry_note'
  | 'unknown';

/**
 * Imported in spirit from `hc-classify.ts`, where it fires only inside the
 * merits branch and caught 58% of what that branch would otherwise have called
 * `decided`.
 *
 * It matters separately here because the eligibility view breaks bail orders out
 * on `hc_document_class = 'bail_order'` — a LABEL. A bail order nothing has ever
 * classified is not broken out at all. Measured 20 Aug 2026: 2,400 of 13,284
 * admitted documents, 18.07%, carry a bail phrase, and **every one of them has
 * no class label**.
 */
/**
 * WHITESPACE-TOLERANT, and that is not a tidy-up — it is a measured recall fix.
 *
 * `hc-classify.ts` spells these with literal single spaces. Extracted PDF text
 * wraps lines wherever the PDF did, so a bail order reading `be released on
bail`
 * does not match, and the classifier calls it something else. Found 20 Aug 2026
 * while adjudicating an audit sample: document `26573ee8` says
 * `namely Mukesh, Neeraj, Anil and Sonu be released on
bail.` and the literal
 * pattern scores it false.
 *
 * Every token gap is `\s+` for that reason. The word boundaries at each end stay,
 * so `bail` inside `bailiff` still cannot match.
 */
export const BAIL_PHRASE =
  /(anticipatory\s+bail|regular\s+bail|bail\s+application|enlarged\s+on\s+bail|released\s+on\s+bail|prayer\s+for\s+bail|granted\s+bail|bail\s+bond)/i;

/**
 * The pattern `hc-classify.ts` actually runs today, kept verbatim so the two can
 * be measured side by side. Delete it only when the classifier's own pattern has
 * been fixed and the corpus re-stale-classified — until then, a consumer needs to
 * be able to reproduce the production label as well as the corrected one.
 */
export const BAIL_PHRASE_AS_DEPLOYED =
  /(anticipatory bail|regular bail|bail application|enlarged on bail|released on bail|prayer for bail)/i;

export type RoleVerdict = { role: DocumentRole; method: string };

/**
 * The stored class first, then the text screen, then `unknown`.
 *
 * The order is deliberate and it is not "best evidence first" — it is "evidence
 * that was written down first". A stored class is auditable: `hc_class_method`
 * says which rule fired and it can be re-run. The bail screen below is a
 * fallback that exists only because 90% of the corpus has no stored class at
 * all, and it is recorded as its own method so a consumer can tell the two
 * apart and weigh them differently.
 */
export function roleVerdict(input: {
  hcDocumentClass: string | null;
  hcClassMethod: string | null;
  text: string | null;
}): RoleVerdict {
  const stored = input.hcDocumentClass;
  if (stored) {
    const map: Record<string, DocumentRole> = {
      decided: 'judgment',
      decided_brief: 'final_order',
      bail_order: 'bail_order',
      procedural_disposal: 'procedural',
      reference_stub: 'registry_note',
    };
    return { role: map[stored] ?? 'unknown', method: input.hcClassMethod ?? 'stored_class' };
  }
  if (input.text && BAIL_PHRASE.test(input.text)) {
    return { role: 'bail_order', method: `text_bail_phrase_${QUALITY_STATE_VERSION}` };
  }
  /* `hc_class_method` separates "a rule looked and refused" from "nothing ever
   * looked", and they want opposite work. Both are `unknown` as a ROLE; only the
   * method distinguishes them, which is why it is never dropped. */
  return { role: 'unknown', method: input.hcClassMethod ?? 'never_classified' };
}

/* ── Axis 3: CITABILITY ─────────────────────────────────────────────────── */

export type Citability =
  'citable_substantive' | 'citable_with_care' | 'not_citable' | 'unsafe' | 'unknown';

export type IdentityState = 'sound' | 'weak' | 'duplicate_member' | 'unknown';

/**
 * Derived from the other three, at read time, and never stored.
 *
 * `unsafe` outranks role: a reasoned judgment whose text we cannot read is not
 * a citable authority, because what we hold is not what the court wrote.
 *
 * `overruled_status` is NOT an input. It is read live at render on every
 * surface, and folding it in here would create exactly the cached good-law
 * status the citation harness forbids. A document can be `citable_substantive`
 * on this axis and carry LAW MOVED at the same time; they are different
 * questions with different sources.
 */
export function citability(input: {
  role: DocumentRole;
  text: TextQualityState;
  identity: IdentityState;
}): Citability {
  if (
    input.text === 'NO_EXTRACTABLE_TEXT' ||
    input.text === 'OCR_CANDIDATE' ||
    input.text === 'LEGACY_FONT_SUSPECT' ||
    input.text === 'KNOWN_DEFECT'
  ) {
    return 'unsafe';
  }
  if (input.identity === 'weak') return 'unsafe';
  switch (input.role) {
    case 'judgment':
      return input.text === 'KNOWN_GOOD' ? 'citable_substantive' : 'unknown';
    case 'final_order':
    case 'interim_order':
    case 'bail_order':
      return 'citable_with_care';
    case 'procedural':
    case 'registry_note':
      return 'not_citable';
    default:
      return 'unknown';
  }
}

/**
 * Identity, from the columns the eligibility view's axis A already reads, plus
 * duplicate-group membership.
 *
 * `duplicate_member` is not a defect and must never be treated as one. A common
 * order really is one text across thousands of petitions, and every petition
 * keeps its own row, caption and case number. What the state records is the
 * OBLIGATION: a retrieval hit on the representative has to fan back out to its
 * members before display, or the advocate finds their case under someone else's
 * name.
 */
export function identityState(input: {
  contentHash: string | null;
  caseNumber: string | null;
  judgmentDate: string | null;
  court: string | null;
  caseTitle: string | null;
  memberCount: number | null;
}): IdentityState {
  const sound =
    input.contentHash !== null &&
    input.caseNumber !== null &&
    input.judgmentDate !== null &&
    input.court !== null &&
    (input.caseTitle ?? '').length > 3;
  if (!sound) return 'weak';
  if ((input.memberCount ?? 1) > 1) return 'duplicate_member';
  return 'sound';
}
