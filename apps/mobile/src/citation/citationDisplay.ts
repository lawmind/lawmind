import type { VerificationState } from '../api/contract';

/**
 * LAWMIND — what goes in a citation slot, and whether it can be relied on.
 * THE ONLY PLACE THIS IS DECIDED, on every surface, without exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT THE CITATION-STATE MODEL AND MUST NEVER BECOME IT.
 *
 * The three independent fields — `verificationState`, `verifiedBySource`,
 * `overruledStatus` — answer "does this authority exist", "who confirmed it",
 * "is it still good law". `citationRender()` owns those, draws the unconfirmed
 * and LAW MOVED marks, and is untouched by this file.
 *
 * This answers a narrower question those three cannot: **what string belongs in
 * the citation slot, and may this authority be cited in a filing.** A judgment
 * can be verified, good law, and carry no citation at all — not a contradiction,
 * because one asks whether the judgment is real and the other asks whether a
 * reporter ever assigned it a number.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY IT EXISTS. On 11 Aug 2026, 40,980 High Court judgments landed with no
 * neutral citation and no reporter citation — 100% of them — and production
 * began serving them unauthenticated, interleaved with Supreme Court rows that
 * do carry citations. Every surface interpolated `neutralCitation` raw, so:
 *
 *   · the search card drew an EMPTY citation slot, which reads as the product
 *     failing to show something it holds;
 *   · the copy action put `"<case name>, null"` on the clipboard — four
 *     characters from a court filing;
 *   · `verifyEcourts(null)` was reachable from the unverified-citation screen.
 *
 * VERIFIED IS STILL SILENT. `kind: 'verified'` carries no note and no mark, and
 * no surface may add one — `docs/CITATION_HARNESS.md` and DESIGN_SYSTEM rule 1
 * are unchanged by this file. Only the three exceptions say anything.
 *
 * NOTHING IS EVER INVENTED. `DOMAIN_TRUTH.md`: never construct a citation by
 * pattern, render only what is stored. This may SELECT a string the row already
 * carries. It may never assemble one from court and year, and it deliberately
 * does NOT fall through to the case title the way the server's audit record
 * does — a case name sitting in a citation slot reads as a citation, which is
 * fabrication by a longer route.
 */

/**
 * The four situations a citation slot can be in. Named by the founder's client
 * contract §4; every surface renders from these rather than re-deriving them.
 */
export type CitationDisplayKind =
  /** A citation is present and nothing contradicts it. Renders silently. */
  | 'verified'
  /** The row carries no citation of any kind. Real judgment, not a citable one. */
  | 'unavailable'
  /** A citation is present but no tier confirmed it — `unverified` or `failed`. */
  | 'unverified'
  /** What was claimed and what we hold disagree. The advocate is shown both. */
  | 'conflicting';

export type CitationDisplay = {
  kind: CitationDisplayKind;
  /**
   * What to render where a citation goes. NEVER empty, never `"null"`, never
   * `"undefined"`, never a placeholder, never assembled — always either a string
   * the row carried or the fixed statement that it carried none.
   */
  text: string;
  /**
   * WHETHER A CITATION EXISTS TO WRITE IN A PETITION. Nothing more.
   *
   * `docs/CITATION_HARNESS.md` §"The fourth concern", binding 11 Aug 2026:
   *
   *     citable = false  iff  neutralCitation === null
   *                           AND reporterCitations.length === 0
   *
   * NARROWED 11 Aug 2026, and the narrowing matters. This field briefly also
   * went false for `unverified` and `conflicting`, which folded two questions
   * into one — the exact mistake the harness names: *"Verification asks 'does
   * this authority exist'; citability asks a different question a court asks
   * separately: 'what do I write to refer to it.'"* An unverified citation is
   * still a citation. Those states carry their own `note` and their own mark;
   * they do not make a judgment uncitable.
   *
   * IT DOES NOT DISABLE ANYTHING. The founder decided warn-not-block directly
   * on 11 Aug: add-to-matter and draft suggestions stay ENABLED for an
   * uncitable judgment, because a `set_aside` judgment is bad law while an
   * uncitable one may be perfectly good law we cannot yet pin-cite. Only
   * `set_aside` disables an action, and that gate lives in `renderState.ts`.
   */
  citable: boolean;
  /**
   * The sentence shown at the moment the advocate tries to USE it — never as
   * card decoration, and never on `verified`, which stays silent.
   */
  note?: string;
  /**
   * `conflicting` only: what was claimed, when it disagrees with `text`. Both
   * are shown, because deciding which is right is the advocate's call and
   * silently preferring one would hide that a conflict existed at all.
   */
  claimed?: string;
  /**
   * THE CITATION STRING WE ACTUALLY HOLD, or absent when we hold none.
   *
   * Distinct from `text`, which is always renderable and falls back to
   * `NO_CITATION`. Anything that LOOKS UP a citation rather than displaying it
   * — the eCourts route, a verification call — takes this, so a surface can
   * never accidentally send the words "No citation on record" to an API, and
   * can never send `null` either.
   */
  stored?: string;
};

/**
 * THE UNMISSABLE MARK, worded by `docs/CITATION_HARNESS.md` §"The fourth
 * concern" and quoted from it verbatim rather than paraphrased.
 */
export const NO_CITATION_MARK = 'No citation on file — cannot be referenced in a filing';

/**
 * The short form for the citation slot itself, where the full mark will not
 * fit. It is the harness sentence's own first clause, split at the harness's
 * own dash — not a rewording of it.
 */
export const NO_CITATION = 'No citation on file';

export const NOTES = {
  /**
   * Stated as a fact about the RECORD, never as a failure of ours and never as
   * doubt about the judgment — the judgment is real and readable, and implying
   * otherwise would be its own kind of untruth.
   */
  /**
   * Stated as a fact about the RECORD, never as doubt about the judgment.
   * The harness is explicit that such a judgment stays searchable, stays in
   * the corpus and keeps its primary-source evidence: *"absence of citation ≠
   * absence of legal evidence."*
   */
  unavailable:
    'No citation on file, so this cannot be referenced in a filing. The judgment itself is unaffected — the text is here to read.',
  /** Matches the harness voice: licence protection, not an audit. */
  unverified: 'We could not confirm this citation, so do not file it without checking it.',
  conflicting:
    'The citation we were given and the one we hold do not match. Check which is right before filing.',
} as const;

/** Case and whitespace are not a conflict. A different citation is. */
const normalise = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const firstNonEmpty = (values: readonly (string | null | undefined)[]): string | undefined =>
  values.find((v) => v?.trim())?.trim();

export function citationDisplay(row: {
  /**
   * `undefined` is accepted alongside `null` because the contract uses both:
   * a search row sends an explicit `null`, while a nested shape (an excluded
   * counter-authority) marks the field optional. Both mean the same thing here
   * — we hold no neutral citation — and forcing every call site to coerce would
   * be one more place to get it wrong.
   */
  neutralCitation?: string | null;
  reporterCitations?: string[] | null;
  /**
   * OPTIONAL, AND ITS ABSENCE MEANS SOMETHING SPECIFIC: this surface renders
   * verification through `citationRender()` and is not asking about it here.
   * Omitting it can never upgrade anything — `unavailable` and `conflicting`
   * are decided without it, and only the `unverified` branch consults it.
   */
  verificationState?: VerificationState;
  /**
   * What was CLAIMED, where a surface actually holds it — a draft citation, a
   * verification record. NEVER inferred: with no claimed value there is nothing
   * to disagree with, so `conflicting` cannot arise, and a surface that does not
   * have one simply does not pass it.
   */
  citationClaimed?: string | null;
}): CitationDisplay {
  const stored = firstNonEmpty([row.neutralCitation, ...(row.reporterCitations ?? [])]);
  const claimed = firstNonEmpty([row.citationClaimed]);

  /**
   * A CONFLICT OUTRANKS EVERYTHING ELSE, including a missing stored citation:
   * "we were told X and hold nothing" is a conflict the advocate must see, not
   * an ordinary absence.
   */
  if (claimed && (!stored || normalise(claimed) !== normalise(stored))) {
    return {
      kind: 'conflicting',
      text: stored ?? NO_CITATION,
      note: NOTES.conflicting,
      claimed,
      // A conflicting citation is still a citation: citability asks only
      // whether one exists. The conflict is carried by `kind` and `note`.
      citable: Boolean(stored),
      ...(stored ? { stored } : {}),
    };
  }

  if (!stored) {
    return { kind: 'unavailable', text: NO_CITATION, citable: false, note: NOTES.unavailable };
  }

  if (row.verificationState === 'unverified' || row.verificationState === 'failed') {
    // `failed` renders exactly as `unverified` — the advocate cannot act on the
    // difference, and an outage must not read as a gap in the corpus.
    // Citable: it HAS a citation. Unconfirmed is a different concern with its
    // own mark, and conflating them is what the harness forbids.
    return { kind: 'unverified', text: stored, citable: true, note: NOTES.unverified, stored };
  }

  return { kind: 'verified', text: stored, citable: true, stored };
}

/**
 * WHAT LANDS ON THE CLIPBOARD. Lives here, not on a screen, because it is
 * citation formatting and constraint 3 of the client contract puts every
 * citation decision in one helper.
 *
 * THE BUG THIS REPLACES. `JudgmentScreen` built it inline as
 * `` `${caseTitle}, ${neutralCitation}` `` — a template literal, which
 * TypeScript fills with `null` without complaint. Against a citationless row
 * that produced
 *
 *     "Mock Petitioner v. State of Bihar, null"
 *
 * one paste from a court filing. No compile error and no test caught it,
 * because a template literal accepts anything and the field was typed `string`
 * while the server had always sent `string | null`.
 *
 * THE REMEDY IS SUBTRACTION, NOT SUBSTITUTION. With no citation the advocate
 * gets the case name alone — everything we actually hold, and nothing invented
 * around it. No "n.d.", no "[no citation]", no bracketed apology: a placeholder
 * pasted into a filing is a different way of putting words in the record.
 */
export function citationCopyText(caseTitle: string, citation: CitationDisplay): string {
  const title = caseTitle.trim();
  return citation.stored ? `${title}, ${citation.stored}` : title;
}
