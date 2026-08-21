/**
 * LCC — SEMANTIC ROLE VERIFICATION. The gap migration 0064 named and left open.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS ACTUALLY MISSING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 30,007 enrichment rows are `SPAN_VERIFIED` and **zero** are
 * `SEMANTIC_ROLE_VERIFIED`. Span verification answers one question well — does
 * this quotation occur in this document? — and does not answer the question the
 * product depends on. 0064 states the danger plainly and it is worth restating:
 *
 *     the most dangerous failure in this factory is a real quotation filed
 *     under the wrong role — a party's contention stored as the court's
 *     holding reads perfectly, verifies perfectly, and is wrong in the one way
 *     an advocate cannot detect by looking at it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC STRUCTURE FIRST. THE MODEL DOES NOT GRADE ITSELF.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here asks a model anything. The evidence is the document's own
 * structure: WHERE the span sits relative to the judgment's voice changes.
 *
 * An Indian judgment announces its voice in fixed idiom. "It is contended", "the
 * learned counsel would submit", "per contra" open a recital of somebody else's
 * position. "We are of the considered opinion", "in the result", "for the
 * foregoing reasons" open the court's own. The nearest such marker BEFORE a span
 * tells you whose words follow, and it is a fact about the file rather than an
 * opinion about the sentence.
 *
 * That is why this can verify a model's output without being the model's
 * accomplice: it never reads the claim's text for meaning, only its POSITION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE THINGS IT REFUSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **A substring match inside glyph noise is not evidence.** NEW2 found 25 of 773
 * supposedly verified spans matched inside non-language garbage. A twelve-
 * character span will match somewhere in 3,000 characters of `74< =7/ 12-`
 * eventually. So the window around every located span is screened for language
 * before its position is trusted, using the same `quality-state.ts` floor the
 * eligibility contract uses — one definition, not a second copy.
 *
 * **Absence of a span over damaged text is not fabrication.** NEW2 measured
 * 59.2% of prior `span_not_found` as corpus damage rather than model invention.
 * The two are reported as different states and always will be.
 *
 * **No positive evidence means UNPROVEN, never ACCEPT.** The default outcome of
 * this module is `ROLE_UNPROVEN`, which is a refusal to promote and not a
 * finding against the claim. A verifier whose unknown case resolves to accept is
 * a rubber stamp with extra steps.
 */
import { MINED_MARKERS, textSignature } from './legacy-font.ts';
import { ENGLISH_RATE_FLOOR, englishRate } from './quality-state.ts';

/**
 * Bumped when a MARKER LIST or a RULE changes meaning. Written into
 * `trust_advanced_by` on every promotion, so a row promoted under one version of
 * the rules can be found and re-judged when they change.
 */
export const SEMANTIC_ROLE_VERSION = 'v2';

/**
 * v1 → v2, 21 Aug 2026. **`relief` was adjudicated as an outcome and it is a
 * prayer.**
 *
 * Found by following a cost number rather than by reading code. Tokens per
 * `CANONICAL_ACCEPT` came out at 4,704 across all tasks and **390,070 for the
 * `relief` task** — 132x the next worst. That is not a bad prompt. Reading the
 * spans, every one sat in the first quarter of its document, and
 * `enrich-atomic.ts` says why in as many words:
 *
 *     relief: 'RELIEF that was SOUGHT, and by whom'
 *             'What was asked for, not what was granted — what the court
 *              ordered is a court_action.'
 *
 * v1 put `relief` in the operative branch beside `relief_granted` and
 * `court_action`. Consequences, all three of them real:
 *
 *   * 207 of 280 claims returned `ROLE_UNPROVEN` for having no operative
 *     evidence, when a prayer is not supposed to have any;
 *   * 40 returned `ROLE_MISMATCH` as "relief recited inside a submission",
 *     which is exactly where a prayer belongs;
 *   * **3 returned `CANONICAL_ACCEPT`** — three prayers certified as operative
 *     directions. That is the dangerous direction and it is why this is a
 *     version bump and a re-run rather than an edit.
 *
 * `relief` now sits in the party-submission branch, the mirror of
 * `argument_petitioner`. No other task emits `kind: 'relief'`, so no promotion
 * made under v1 for any other task is affected by this change.
 */

/**
 * The telemetry vocabulary. Six outcomes, and the distinctions between them are
 * the point — the old single `span_not_found` counter merged three of these and
 * made 59.2% of its own total unreadable.
 */
export type RoleOutcome =
  /** The whole document is not usable language. Nothing can be concluded. */
  | 'SOURCE_TEXT_DAMAGED'
  /** Span absent from a document that IS readable. Genuine fabrication. */
  | 'MODEL_UNSUPPORTED'
  /** Span absent, and the document's readability was not established. */
  | 'SPAN_NOT_FOUND'
  /** Span located, but inside a region that is not language. Not evidence. */
  | 'GLYPH_NOISE_MATCH'
  /** Span located in readable text, and the structure contradicts the role. */
  | 'ROLE_MISMATCH'
  /** Span located in readable text, and the structure decides nothing. */
  | 'ROLE_UNPROVEN'
  /** Span located in readable text, and the structure supports the role. */
  | 'CANONICAL_ACCEPT';

/** The roles this module can adjudicate. Anything else returns UNPROVEN. */
export type SemanticRole =
  | 'holding'
  | 'reasoning'
  | 'reasoning_proposition'
  | 'proposition'
  /** RELIEF SOUGHT — a prayer. Adjudicated as a party submission, not an outcome. */
  | 'relief'
  | 'relief_granted'
  | 'court_action'
  | 'issue'
  | 'argument_petitioner'
  | 'argument_respondent'
  | 'procedural_event';

export type RoleVerdict = {
  outcome: RoleOutcome;
  /** Which rule decided, in one token, for grouping in telemetry. */
  rule: string;
  /** Character offset of the located span, or null. */
  offset: number | null;
  /** 0..1 position in the document. Holdings sit late; recitals sit early. */
  relativePosition: number | null;
  /** English density of the 600-character window around the span. */
  windowEnglishRate: number | null;
  /** The nearest voice marker before the span, verbatim, or null. */
  precedingMarker: string | null;
  precedingMarkerKind: MarkerKind | null;
};

export type MarkerKind = 'submission' | 'court' | 'operative' | 'quotation' | 'dissent';

/**
 * The voice markers, as Indian judgments actually write them.
 *
 * WHITESPACE-TOLERANT throughout, and that is a measured recall fix rather than
 * tidiness: extracted PDF text wraps wherever the PDF wrapped, so `it is\ncontended`
 * does not match a literal single space. `quality-state.ts` found the same thing
 * with its bail phrases and fixed it the same way.
 *
 * Deliberately NO legal-substance terms. The list must not become a detector for
 * "this sentence sounds important" — it detects only whose turn it is to speak.
 */
const MARKERS: readonly { kind: MarkerKind; re: RegExp }[] = [
  /* Somebody else's position is being recited. */
  {
    kind: 'submission',
    re: /\b(it\s+is\s+contended|it\s+is\s+submitted|it\s+is\s+argued|it\s+was\s+contended|it\s+was\s+submitted|learned\s+counsel\s+(?:for|appearing)|learned\s+senior\s+counsel|would\s+submit|has\s+submitted|it\s+is\s+the\s+case\s+of|according\s+to\s+the\s+(?:petitioner|respondent|appellant|applicant|complainant|prosecution)|the\s+(?:petitioner|respondent|appellant|applicant)\s+(?:contends|submits|argues)|per\s+contra|on\s+behalf\s+of\s+the\s+(?:petitioner|respondent|appellant|applicant))\b/gi,
  },
  /* The court is speaking in its own voice. */
  {
    kind: 'court',
    re: /\b(we\s+are\s+of\s+the\s+(?:considered\s+)?(?:view|opinion)|i\s+am\s+of\s+the\s+(?:considered\s+)?(?:view|opinion)|in\s+our\s+(?:considered\s+)?(?:view|opinion)|in\s+my\s+(?:considered\s+)?(?:view|opinion)|this\s+court\s+is\s+of\s+the\s+(?:considered\s+)?(?:view|opinion)|we\s+(?:hold|find|are\s+unable\s+to\s+accept|are\s+satisfied|see\s+no\s+(?:reason|merit))|i\s+(?:hold|find|am\s+unable\s+to\s+accept|am\s+satisfied|see\s+no\s+(?:reason|merit))|it\s+is\s+held|having\s+(?:heard|considered|regard\s+to)|on\s+a\s+careful\s+(?:consideration|perusal)|upon\s+(?:hearing|consideration)|this\s+court\s+(?:finds|holds)|the\s+court\s+is\s+of\s+the\s+(?:view|opinion))\b/gi,
  },
  /* The operative part: what the court DID, as distinct from why. */
  {
    kind: 'operative',
    re: /\b(in\s+the\s+result|for\s+the\s+(?:foregoing\s+)?reasons\s+(?:stated|recorded|aforesaid|above)|for\s+the\s+reasons\s+aforementioned|accordingly[,\s]|in\s+view\s+of\s+the\s+(?:above|foregoing)|the\s+(?:petition|appeal|application|revision|writ\s+petition)\s+(?:is|stands)\s+(?:allowed|dismissed|disposed|rejected)|we\s+pass\s+the\s+following|the\s+following\s+order|hence[,\s]\s*this)\b/gi,
  },
  /* A block quoted from somewhere else opens here. Whatever follows is that
   * court's words, not this one's — 0064's rule for reasoning_proposition. */
  {
    kind: 'quotation',
    re: /\b(held\s+as\s+(?:follows|under)|observed\s+as\s+(?:follows|under)|reads\s+as\s+(?:follows|under)|it\s+is\s+(?:apposite|useful|profitable)\s+to\s+(?:refer|quote|extract)|in\s+the\s+following\s+(?:words|terms)|extracted\s+(?:below|hereunder)|which\s+reads\s+thus)\b/gi,
  },
  /* A separate opinion begins. A dissent is not the court's holding. */
  {
    kind: 'dissent',
    re: /\b(i\s+respectfully\s+dissent|i\s+am\s+unable\s+to\s+agree|dissenting\s+(?:opinion|judgment)|i\s+regret\s+my\s+inability\s+to\s+agree)\b/gi,
  },
];

/** Whitespace-flattened comparison, exactly as `enrich.ts` does it. */
const flatten = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Locate the span and return the offset IN THE FLATTENED TEXT.
 *
 * Both sides are flattened, so the offset is an index into the flattened
 * document. Every downstream measurement — markers, window, relative position —
 * is taken on that same flattened string, so the coordinate system is consistent
 * and no mapping back to raw offsets is needed or attempted. A mapping that was
 * needed and got by with an approximation is exactly the kind of quiet error
 * this module exists to avoid.
 */
function locate(flatText: string, span: string): number {
  const needle = flatten(span);
  if (needle.length === 0) return -1;
  const direct = flatText.indexOf(needle);
  if (direct !== -1) return direct;
  /* Case folding only, on `enrich.ts`'s reasoning: the corpus prints coram in
   * capitals and the prompt asks for title case. NOT fuzzy — a span the document
   * does not contain still cannot be found in any casing. */
  return flatText.toLowerCase().indexOf(needle.toLowerCase());
}

/**
 * A marker's reach, in flattened characters. About one long paragraph.
 *
 * NOT a tuning knob — it is the whole difference between evidence and
 * coincidence, and it was set by MEASUREMENT after the unbounded version failed.
 *
 * The first cut of this module used "the nearest marker before the span, at any
 * distance". It refused 127 of 180 `holding` claims as party submissions. Five
 * were read: **all five were genuine court determinations** — "Viewing from any
 * angle, it is not a fit case to grant bail", "this Court is not acceded to the
 * prayer of the petitioner for anticipatory bail" — sitting several thousand
 * characters after the last "it is contended", with no court-voice idiom in
 * between, because the judge simply did not use one.
 *
 * A submission marker four thousand characters earlier is not evidence about
 * this sentence. So a marker now decides only what is near it, and everything
 * beyond its reach is `ROLE_UNPROVEN` — the honest answer, and the one that
 * costs nothing, because unproven merely declines to promote.
 */
export const MARKER_REACH = 600;

/** Every marker before `offset`, one per kind, each the nearest of its kind. */
function markersBefore(
  flatText: string,
  offset: number,
): Partial<Record<MarkerKind, { text: string; at: number }>> {
  const out: Partial<Record<MarkerKind, { text: string; at: number }>> = {};
  const before = flatText.slice(0, offset);
  for (const { kind, re } of MARKERS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    while ((m = re.exec(before)) !== null) last = m;
    if (last) out[kind] = { text: last[0], at: last.index };
  }
  return out;
}

/** The nearest marker strictly before `offset`, at any distance. */
function precedingMarker(
  flatText: string,
  offset: number,
): { kind: MarkerKind; text: string; at: number } | null {
  const found = markersBefore(flatText, offset);
  let best: { kind: MarkerKind; text: string; at: number } | null = null;
  for (const [kind, hit] of Object.entries(found) as [MarkerKind, { text: string; at: number }][]) {
    if (best === null || hit.at > best.at) best = { kind, text: hit.text, at: hit.at };
  }
  return best;
}

/**
 * The nearest voice marker WITHIN REACH of the span, or null.
 *
 * `quotation` and `dissent` are excluded because they are decided ahead of this
 * call and are not proximity questions: a dissent runs to the end of the
 * judgment, and a quotation is bounded by its own rule.
 */
function nearest(
  found: Partial<Record<MarkerKind, { text: string; at: number }>>,
  offset: number,
): { kind: MarkerKind; at: number } | null {
  let best: { kind: MarkerKind; at: number } | null = null;
  for (const kind of ['submission', 'court', 'operative'] as const) {
    const hit = found[kind];
    if (!hit) continue;
    if (offset - hit.at > MARKER_REACH) continue;
    if (best === null || hit.at > best.at) best = { kind, at: hit.at };
  }
  return best;
}

/**
 * Is the span inside a block quoted from another judgment?
 *
 * Two independent signals, and BOTH must be absent for a reasoning claim to be
 * accepted as this court's own:
 *
 *   * an odd number of double-quote characters opens before the span, so the
 *     span sits inside an unclosed quotation;
 *   * a `quotation` marker is the nearest preceding voice change AND the span
 *     starts within 2,000 flattened characters of it, which is about the length
 *     of a long extracted passage.
 *
 * Neither alone is reliable — extraction loses quote marks, and a quotation
 * marker can be followed by a short extract and then pages of the court's own
 * reasoning — so the distance bound is what keeps the second from swallowing the
 * rest of the judgment.
 */
function insideQuotation(
  flatText: string,
  offset: number,
  marker: { kind: MarkerKind; at: number } | null,
): boolean {
  const before = flatText.slice(0, offset);
  const quotes = (before.match(/["“”]/g) ?? []).length;
  if (quotes % 2 === 1) return true;
  return marker?.kind === 'quotation' && offset - marker.at < 2000;
}

/** 600 characters around the span — enough to judge language, short enough to be local. */
function windowAround(flatText: string, offset: number, spanLength: number): string {
  const from = Math.max(0, offset - 300);
  const to = Math.min(flatText.length, offset + spanLength + 300);
  return flatText.slice(from, to);
}

const OUT = (
  outcome: RoleOutcome,
  rule: string,
  rest: Partial<RoleVerdict> = {},
): RoleVerdict => ({
  outcome,
  rule,
  offset: null,
  relativePosition: null,
  windowEnglishRate: null,
  precedingMarker: null,
  precedingMarkerKind: null,
  ...rest,
});

/**
 * Adjudicate one claim.
 *
 * `documentTextSafety` is the eligibility contract's own verdict for the
 * document, passed in rather than recomputed — the caller has already read it
 * from `judgment_embedding_eligibility.text_safety` and two screens of the same
 * document that disagree would be worse than either alone.
 */
export function verifyRole(input: {
  role: string;
  span: string;
  fullText: string;
  documentTextSafety: 'UNKNOWN' | 'SCREENED_OK' | 'UNSAFE_VERIFIED' | 'SCREENED_OTHER';
  /** For `procedural_event` only: the judgment's own date, ISO. */
  judgmentDate?: string | null;
}): RoleVerdict {
  if (input.documentTextSafety === 'UNSAFE_VERIFIED') {
    /* Decided before anything is located. A span "found" in glyph codes and a
     * span genuinely absent are both meaningless here, and calling either one a
     * fabrication was 59.2% of the old counter. */
    return OUT('SOURCE_TEXT_DAMAGED', 'document_text_unsafe');
  }

  const flat = flatten(input.fullText);
  if (flat.length === 0) return OUT('SOURCE_TEXT_DAMAGED', 'empty_document');

  const offset = locate(flat, input.span);
  if (offset === -1) {
    /* Readability decides which of the two absence states this is. */
    const readable = englishRate(flat) >= ENGLISH_RATE_FLOOR;
    return readable
      ? OUT('MODEL_UNSUPPORTED', 'span_absent_from_readable_document')
      : OUT('SPAN_NOT_FOUND', 'span_absent_readability_unestablished');
  }

  const spanLength = flatten(input.span).length;
  const window = windowAround(flat, offset, spanLength);
  const windowRate = englishRate(window);
  const sig = textSignature(window, MINED_MARKERS);
  const relativePosition = flat.length === 0 ? null : offset / flat.length;

  /**
   * The 25-of-773 case. A twelve-character needle will eventually match inside
   * three thousand characters of substitution garbage, and the match proves
   * nothing about the document. Devanagari in the window exempts it — the
   * English floor is an English screen and says nothing about Hindi.
   */
  if (sig.zeroDevanagari && windowRate < ENGLISH_RATE_FLOOR) {
    return OUT('GLYPH_NOISE_MATCH', 'span_window_is_not_language', {
      offset,
      relativePosition,
      windowEnglishRate: windowRate,
    });
  }

  const marker = precedingMarker(flat, offset);
  const found = markersBefore(flat, offset);
  const base = {
    offset,
    relativePosition,
    windowEnglishRate: windowRate,
    precedingMarker: marker?.text ?? null,
    precedingMarkerKind: marker?.kind ?? null,
  };

  const inQuote = insideQuotation(flat, offset, marker);

  switch (input.role as SemanticRole) {
    /**
     * THE COURT'S OWN DETERMINATION. 0064's rule, implemented: after the last
     * submission boundary, inside the court's own reasoning.
     */
    case 'holding':
    case 'reasoning':
    case 'reasoning_proposition':
    case 'proposition': {
      if (marker?.kind === 'dissent') {
        return { ...OUT('ROLE_MISMATCH', 'span_is_in_a_separate_opinion'), ...base };
      }
      if (inQuote) {
        /* Quoted precedent is that court's reasoning, not this one's. 0064. */
        return { ...OUT('ROLE_MISMATCH', 'span_is_inside_quoted_material'), ...base };
      }
      const near = nearest(found, offset);
      if (near === null) {
        return { ...OUT('ROLE_UNPROVEN', 'no_voice_marker_within_reach'), ...base };
      }
      if (near.kind === 'court' || near.kind === 'operative') {
        return { ...OUT('CANONICAL_ACCEPT', `court_voice_${near.kind}`), ...base };
      }
      if (near.kind === 'submission') {
        return { ...OUT('ROLE_MISMATCH', 'span_sits_inside_a_recital_of_submissions'), ...base };
      }
      return { ...OUT('ROLE_UNPROVEN', 'voice_marker_is_indecisive'), ...base };
    }

    /**
     * WHAT THE COURT DID. Position is real evidence here in a way it is not for
     * a holding: an operative direction lives in the operative part.
     */
    case 'relief_granted':
    case 'court_action': {
      if (inQuote) {
        return { ...OUT('ROLE_MISMATCH', 'span_is_inside_quoted_material'), ...base };
      }
      const nearRelief = nearest(found, offset);
      if (nearRelief?.kind === 'operative' || nearRelief?.kind === 'court') {
        return { ...OUT('CANONICAL_ACCEPT', `operative_part_${nearRelief.kind}`), ...base };
      }
      if (nearRelief?.kind === 'submission') {
        /* A prayer is not a grant. "The petitioner prays that..." recites what
         * was ASKED for, and reads almost identically to what was ordered. */
        return { ...OUT('ROLE_MISMATCH', 'relief_recited_inside_a_submission'), ...base };
      }
      /* Last tenth of the document, with a disposal verb in the span itself.
       * Both, never either: the verb alone appears in the prayer, and the
       * position alone catches costs orders and adjournment notes. */
      const disposal =
        /\b(allowed|dismissed|disposed\s+of|quashed|set\s+aside|remanded|acquitted|convicted|granted|rejected|stands\s+closed)\b/i;
      if (relativePosition !== null && relativePosition > 0.9 && disposal.test(input.span)) {
        return { ...OUT('CANONICAL_ACCEPT', 'operative_position_and_disposal_verb'), ...base };
      }
      return { ...OUT('ROLE_UNPROVEN', 'no_operative_evidence'), ...base };
    }

    /**
     * THE QUESTION THE COURT SET ITSELF. 0064 asks for interrogative form or an
     * explicit framing. The "answered later in the same document" half of that
     * rule is NOT implemented and this is not silently skipped: answering it
     * needs an answer-locator that does not exist, and a half-rule presented as
     * the whole rule would be the exact overclaim this ladder exists to stop.
     * Framing alone yields ACCEPT; nothing weaker does.
     */
    case 'issue': {
      const framed =
        /\b(whether|the\s+question\s+(?:that\s+arises|for\s+consideration|is)|the\s+point\s+for\s+(?:consideration|determination)|the\s+issue\s+(?:that\s+arises|is)|falls?\s+for\s+consideration)\b/i;
      if (framed.test(input.span) || input.span.trim().endsWith('?')) {
        return { ...OUT('CANONICAL_ACCEPT', 'interrogative_or_framed_as_a_question'), ...base };
      }
      return { ...OUT('ROLE_UNPROVEN', 'not_framed_as_a_question'), ...base };
    }

    /**
     * A PARTY'S POSITION. The mirror of the holding test, and it must be the
     * mirror: a span that satisfies BOTH is evidence of nothing.
     */
    case 'argument_petitioner':
    case 'argument_respondent':
    /**
     * `relief` is RELIEF SOUGHT — a prayer, which is a party's position and not
     * the court's. It belongs here and not with `relief_granted`, and putting it
     * in the wrong branch certified three prayers as operative directions in v1.
     */
    case 'relief': {
      const nearArg = nearest(found, offset);
      if (nearArg === null) {
        return { ...OUT('ROLE_UNPROVEN', 'no_voice_marker_within_reach'), ...base };
      }
      if (nearArg.kind === 'submission') {
        return { ...OUT('CANONICAL_ACCEPT', 'inside_a_recital_of_submissions'), ...base };
      }
      if (nearArg.kind === 'court' || nearArg.kind === 'operative') {
        return { ...OUT('ROLE_MISMATCH', 'nearest_voice_is_the_court'), ...base };
      }
      return { ...OUT('ROLE_UNPROVEN', 'voice_marker_is_indecisive'), ...base };
    }

    /**
     * A DATE THAT HAPPENED. 0064: the date must parse and fall within the case's
     * plausible lifetime, not merely appear in the text.
     */
    case 'procedural_event': {
      const date = extractDate(input.span);
      if (date === null) {
        return { ...OUT('ROLE_UNPROVEN', 'no_parsable_date_in_span'), ...base };
      }
      if (!input.judgmentDate) {
        return { ...OUT('ROLE_UNPROVEN', 'no_judgment_date_to_bound_against'), ...base };
      }
      const decided = new Date(input.judgmentDate);
      /* Sixty years is generous on purpose. A land dispute really does cite a
       * 1961 mutation entry, and a bound tight enough to look clever would
       * reject true events in exactly the cases that need them most. */
      const floor = new Date(decided);
      floor.setFullYear(floor.getFullYear() - 60);
      /* One day of slack forward: a judgment pronounced on the date it records. */
      const ceiling = new Date(decided.getTime() + 24 * 3600 * 1000);
      if (date >= floor && date <= ceiling) {
        return { ...OUT('CANONICAL_ACCEPT', 'date_parses_and_is_within_case_lifetime'), ...base };
      }
      return { ...OUT('ROLE_MISMATCH', 'date_outside_the_case_lifetime'), ...base };
    }

    default:
      return { ...OUT('ROLE_UNPROVEN', `role_not_adjudicable:${input.role}`), ...base };
  }
}

/**
 * The date formats Indian judgments actually print, and nothing else.
 *
 * `Date.parse` is deliberately not used on a free string: it accepts far too
 * much, and a "date" it invents from a case number would pass the lifetime
 * bound and count as evidence.
 */
export function extractDate(span: string): Date | null {
  const dmy = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/.exec(span);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(dmy[2]) - 1 ? null : d;
  }
  const MONTHS =
    'january|february|march|april|may|june|july|august|september|october|november|december';
  const named = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?(${MONTHS})[,\\s]+(\\d{4})\\b`, 'i').exec(span);
  if (named) {
    const month = MONTHS.split('|').indexOf(named[2]!.toLowerCase());
    const d = new Date(Date.UTC(Number(named[3]), month, Number(named[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
