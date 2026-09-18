/**
 * NEW2 — WHAT DID THE COURT ACTUALLY DO? READ THE ORDER, NOT THE REGISTRY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO FIX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc-classify.ts` reaches `decided` through `isMerits(disposal_nature)`.
 * Measured 21 Aug 2026 against 90 documents labelled from their own text
 * (`docs/ops/new2/DOCUMENT_ROLE_GOLD_V2.md`):
 *
 *   false-substantive in `decided`         9 / 30   30.0%   [13.6, 46.4]
 *   false-substantive in `decided_brief`   9 / 15   60.0%   [35.2, 84.8]
 *
 * The nine are transfer petitions, withdrawals dismissed expressly WITHOUT
 * hearing the merits, a dismissal for non-compliance with office objections, a
 * matter adjourned "for further orders", and directions to an authority merely
 * to CONSIDER a representation.
 *
 * None is a hard case. They are procedural orders wearing a merits disposal
 * string, because **`disposal_nature` is the REGISTRY's bookkeeping about a
 * FILE** — it records `ALLOWED` or `DISMISSED` for a petition that was
 * withdrawn, transferred, or struck off for a registry default.
 *
 * `docs/ops/new2/DOCUMENT_QUALITY_VOCABULARY.md` already forbids this:
 *
 *     no arrow runs from DISPOSITION to CITABILITY.
 *
 * `isMerits(disposal) -> decided` IS that arrow. This module is the replacement
 * evidence: the court's own operative sentence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT ONLY EVER DEMOTES, AND THAT IS THE WHOLE SAFETY ARGUMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `procedurallyDisposed()` answers ONE question — *did this order end without
 * the court deciding the matter?* — and the only thing a caller may do with a
 * `true` is move a document OUT of an authority class. It can never promote.
 *
 * That asymmetry is deliberate and it matches the measured asymmetry of the
 * errors: false-substantive runs five to one against false-procedural, and a
 * non-decision admitted as precedent is the expensive direction. A rule that can
 * only demote can only ever cost recall, never correctness.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PHRASE MUST BE IN THE OPERATIVE REGION, NOT ANYWHERE IN THE DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `"the earlier writ petition was dismissed as withdrawn"` is a RECITAL OF
 * HISTORY inside a judgment that decides something. Matching it anywhere would
 * convict reasoned judgments of being withdrawals, which is the false-procedural
 * direction and is how a demote-only rule could still do damage.
 *
 * So the search is confined to the tail — where an Indian order states its
 * direction — and the tail has a footer stripped off it first, because in Madras
 * and Telangana the last 1,800 characters are the addressee block and the
 * certified-copy note. Three of the seven `UNCERTAIN` rows in the gold are
 * uncertain for exactly that reason, so it is measured, not feared.
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUS: **NOT WIRED INTO `classifyHcDocument`, AND IT MUST NOT BE YET.**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It looked finished. Against the 90-row gold it scored **100% precision, 72.2%
 * recall, and demoted zero substantive documents.** Then it was run on documents
 * nobody had read, and both numbers fell apart:
 *
 * ```
 *                              on the gold        out of sample
 * precision                       100%            13 of 19  ~68%
 * recall (implied)               72.2%            29% (decided) / 46% (brief)
 * demote rate on `decided`          —             8.7%  [6.8, 10.5]
 * demote rate on `decided_brief`    —            27.6%  [24.6, 30.5]
 * ```
 *
 * **The gold score was a FIT, not a measurement.** The phrase list was written
 * after reading those documents, so it recognised their exact wording; the
 * out-of-sample recall of 29-46% is what it can actually find, and the
 * out-of-sample precision of ~68% is what it actually costs.
 *
 * A demote-only rule at 68% precision removes a real authority roughly one time
 * in three. **That is not a fix for a 30% false-substantive rate; it is the same
 * error running the other way.** So the module ships measured, tested and
 * unwired, and the bar it has to clear before anything calls it is stated here
 * rather than left to whoever picks it up: **precision above 95% on a read
 * sample of documents that were not used to write the patterns.**
 *
 * The failures are not spread evenly, which is what makes this fixable rather
 * than abandoned. `DIRECTION_TO_CONSIDER` was wrong 3 times in 6 — it fires on
 * a 49-page judgment that happens to direct a trial court to expedite, and on a
 * writ dismissed on the merits for laches. `INFRUCTUOUS` and
 * `WANT_OF_PROSECUTION` each mis-fired once, both on orders that REMANDED after
 * deciding. The shape of every miss is the same:
 *
 *     the operative region contains a procedural direction AND a decision,
 *     and this rule reads the presence of the first as the absence of the second.
 *
 * The next version has to find the FINAL operative sentence rather than any
 * procedural phrase inside the window — which is a different algorithm, not a
 * longer phrase list, and is why no more patterns were added here.
 */

/** Bumped when a phrase or the window changes. */
export const OPERATIVE_ACT_VERSION = 'operative-act-v1.0';

/**
 * How much of the document's end counts as the operative region.
 *
 * Measured over the 90-row gold: every procedural operative sentence sits in the
 * last 1,200 characters of real text once the footer is removed. 2,500 is
 * generous enough to absorb a long signature block and a page-number line
 * without reaching back into the recital of facts.
 */
export const OPERATIVE_WINDOW = 2500;

/**
 * Footer furniture that sits AFTER the operative sentence and must not push it
 * out of the window. All observed in the gold: Madras prints an addressee list
 * and a `Speaking order/Non-speaking order` note, Telangana prints copy
 * certificates, Allahabad and Punjab & Haryana print digital-signature blocks.
 */
const FOOTER_MARKERS = [
  /\bTo\s*[\r\n]+\s*1\./,
  /Speaking\s*order\s*\/\s*Non-?speaking\s*order/i,
  /Whether\s+speaking\s*\/?\s*reasoned/i,
  /Issue\s+urgent\s+certified\s+copy/i,
  /Digitally\s+signed\s+by/i,
  /I\s+attest\s+to\s+the\s+(accuracy|authenticity)/i,
  /One\s+C\.?C\.?\s+to\b/i,
  /\+\s*1\s*cc\s+to\b/i,
];

/**
 * The last `OPERATIVE_WINDOW` characters of real order text, footer removed.
 *
 * **Cut at the LAST footer marker, and only when it really is trailing.** The
 * first version cut at the EARLIEST marker anywhere in the tail, and measured
 * against the gold that was actively harmful: Karnataka `RFA/2684/2025` and
 * `CRP/140/2025` came back ending in the middle of their cause titles, because a
 * marker matched up in the party block and everything after it — including the
 * operative sentence — was thrown away. Two real procedural orders went
 * undetected for that reason alone.
 *
 * Two conditions make "trailing" checkable rather than assumed, and BOTH are
 * needed — the second was added after the first alone still failed:
 *
 *   - **absolute:** a Madras service list with five addressees and a
 *     certified-copy note runs to about 800 characters, so a claimed footer
 *     carrying more than 1,200 is not one;
 *   - **proportional:** Karnataka `CRP/140/2025` is a 1,668-character order whose
 *     cause title contains a `To ... 1.` block. That block sits 1,168 characters
 *     from the end — inside the absolute limit — so the absolute rule alone
 *     removed 70% of the document and took the operative sentence with it. A
 *     footer is a small tail of its document; one that would eat more than 40% is
 *     not a footer.
 */
const MAX_FOOTER = 1200;
const MAX_FOOTER_SHARE = 0.4;

export function operativeRegion(text: string): string {
  const tail = text.slice(-OPERATIVE_WINDOW * 2);
  let cut = tail.length;
  for (const m of FOOTER_MARKERS) {
    /* Last occurrence, not first. */
    const g = new RegExp(m.source, m.flags.includes('g') ? m.flags : m.flags + 'g');
    let hit: RegExpExecArray | null;
    let last = -1;
    while ((hit = g.exec(tail)) !== null) {
      last = hit.index;
      if (g.lastIndex === hit.index) g.lastIndex++;
    }
    if (last < 0) continue;
    const footerLen = tail.length - last;
    if (footerLen <= MAX_FOOTER && footerLen <= tail.length * MAX_FOOTER_SHARE && last < cut)
      cut = last;
  }
  const body = tail.slice(0, cut);
  return (body.length >= 200 ? body : tail).slice(-OPERATIVE_WINDOW);
}

export type ProceduralReason =
  | 'WITHDRAWN'
  | 'NOT_PRESSED'
  | 'WANT_OF_PROSECUTION'
  | 'INFRUCTUOUS'
  | 'ABATED'
  | 'REGISTRY_DEFAULT'
  | 'ADJOURNED'
  | 'TRANSFERRED'
  | 'DIRECTION_TO_CONSIDER'
  | 'NO_OPINION_EXPRESSED'
  | 'DECIDED_BY_REFERENCE';

/**
 * Every pattern is whitespace-flexible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `DELAY_CONDONED` WAS HERE AND WAS REMOVED BY MEASUREMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It looked right on the gold: one row there is a standalone `CRMPM` application
 * to condone delay, and condoning delay is not deciding a case. On the corpus it
 * was the worst pattern in the file — **both** of the two demotions it produced
 * in a read sample of 22 were wrong, because delay condonation is usually an
 * INCIDENTAL application disposed of inside a matter that the same order then
 * decides:
 *
 *     "revision filed by applicant is allowed. Applicant is permitted to compound
 *      the offence. Applicant is acquitted from the said offences."
 *
 * A demote-only rule that removes an acquittal from the authority set is doing
 * the exact damage the demote-only design was supposed to make impossible. The
 * pattern is gone rather than tightened: the signal it was reaching for is the
 * document's CASE TYPE, not a phrase in its text.
 *
 * `\s+` and not a literal space, because the bail phrase in `hc-classify.ts`
 * silently failed on line-wrapped text for as long as it existed — a PDF puts a
 * newline wherever the page ended, and 33 of 34 wrapped matches were real. Any
 * phrase rule written in this repo from now on starts whitespace-flexible.
 */
const PATTERNS: readonly (readonly [ProceduralReason, RegExp])[] = [
  ['WITHDRAWN', /\b(dismissed|disposed(\s+of)?)\s+as\s+withdrawn\b/i],
  ['WITHDRAWN', /\bpermitted\s+to\s+withdraw\s+the\s+(petition|appeal|application)\b/i],
  ['NOT_PRESSED', /\b(dismissed|disposed(\s+of)?)\s+as\s+not\s+pressed\b/i],
  ['NOT_PRESSED', /\bnot\s+pressed\s+into\s+service\b/i],
  ['WANT_OF_PROSECUTION', /\bfor\s+(want|non[-\s]?)\s*of\s+prosecution\b/i],
  ['WANT_OF_PROSECUTION', /\bdismissed\s+for\s+default\b/i],
  ['WANT_OF_PROSECUTION', /\bpleads?\s+no\s+instructions\b/i],
  ['INFRUCTUOUS', /\b(has\s+)?(become|rendered)\s+infructuous\b/i],
  ['INFRUCTUOUS', /\bdismissed\s+as\s+infructuous\b/i],
  ['ABATED', /\bdismissed\s+as\s+abated\b/i],
  ['ABATED', /\bstands?\s+abated\b/i],
  ['REGISTRY_DEFAULT', /\bnon[-\s]?compliance\s+of\s+office\s+objections?\b/i],
  ['ADJOURNED', /\bstand\s+over\s+to\b/i],
  ['ADJOURNED', /\badjourned\s+to\b/i],
  ['ADJOURNED', /\blist\s+(this\s+|the\s+)?(matter|petitions?|case)\s+on\b/i],
  ['ADJOURNED', /\bfor\s+further\s+orders\b/i],
  ['TRANSFERRED', /\bpetition\s+for\s+transfer\s+is\s+allowed\b/i],
  ['TRANSFERRED', /\bdirected\s+to\s+transfer\s+the\b/i],
  [
    'DIRECTION_TO_CONSIDER',
    /\bdirect(?:ing|ion|ed|s)?\s+(?:the\s+)?[A-Za-z .,'()-]{0,60}?\bto\s+(consider|decide)\s+the\b/i,
  ],
  ['DIRECTION_TO_CONSIDER', /\bto\s+decide\s+the\s+(representation|application)\b/i],
  ['NO_OPINION_EXPRESSED', /\bhas\s+not\s+expressed\s+any\s+opinion\b/i],
  ['NO_OPINION_EXPRESSED', /\bdoes\s+not\s+pronounce\s+on\s+the\s+finality\b/i],
  ['NO_OPINION_EXPRESSED', /\bwithout\s+having\s+heard\s+on\s+merits\b/i],
  ['DECIDED_BY_REFERENCE', /\bdecided\s+in\s+terms\s+of\s+the\s+order\s+dated\b/i],
  ['DECIDED_BY_REFERENCE', /\bfor\s+orders\s+see\s+detailed\s+reasons\b/i],
];

export type OperativeVerdict = {
  readonly procedural: boolean;
  readonly reasons: readonly ProceduralReason[];
  readonly method: string;
  /** Characters of operative region actually examined. */
  readonly window: number;
};

/**
 * Did the court end this matter without deciding it?
 *
 * Pure, and it reads ONLY the operative region. A caller may use `true` to move
 * a document out of an authority class and may never use `false` for anything —
 * `false` means "no procedural phrase was found in the last 2,500 characters",
 * which is not evidence that the court decided anything.
 */
export function procedurallyDisposed(fullText: string | null): OperativeVerdict {
  const region = operativeRegion(fullText ?? '');
  const reasons: ProceduralReason[] = [];
  for (const [reason, pattern] of PATTERNS) {
    if (!reasons.includes(reason) && pattern.test(region)) reasons.push(reason);
  }
  return {
    procedural: reasons.length > 0,
    reasons,
    method: `operative_act_${OPERATIVE_ACT_VERSION}`,
    window: region.length,
  };
}
