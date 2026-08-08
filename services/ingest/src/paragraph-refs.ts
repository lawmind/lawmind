/**
 * Which paragraphs did a later court actually set aside?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS BLOCKS SEVEN REAL JUDGMENTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SCHEMA_TRUTH.md` requires `overruled_paras` for `partly_set_aside`, and
 * `applyOverruledChange` throws without it — deliberately: *"partly set aside,
 * we will not say which part"* renders a banner an advocate cannot act on.
 *
 * The citation graph holds 19 `overruled_in_part` edges, and **7 of the
 * judgments they point at still read `overruled_status = 'none'`** because
 * nothing extracts paragraph numbers. They are real and well known —
 * *Kharak Singh* partly overruled by *Puttaswamy*, *Danamma* by *Vineeta
 * Sharma*, *Garware Wall Ropes* by *In Re: Interplay*. Every surface currently
 * shows all seven as good law.
 *
 * **This is also the narrow competitive fight worth picking.**
 * `docs/TECHNICAL_MOAT.md` §3: `partly_set_aside` is the state a three-way
 * positive/negative/neutral citator structurally cannot express. *Kharak Singh*
 * is not bad law; part of it is. An advocate told either "fine" or "overruled"
 * has been misled in both directions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It never guesses.** A wrong paragraph number is worse than none: it tells an
 * advocate that a specific passage is dead when it is not, and they will rely on
 * that. So every rule here is conservative, and returning nothing is the normal,
 * correct outcome for most edges.
 *
 * It reads only the **citing** judgment's own words near the citation. It does
 * not infer, does not consult a model, and does not fall back to "probably the
 * whole thing".
 */

/** How far either side of the citation to read. A sentence or two, not a page. */
const WINDOW = 600;

export type ParagraphFinding = {
  paragraphs: number[];
  /** The exact phrase the court used. Stored so a human can check the machine. */
  evidence: string;
};

/**
 * Reference forms an Indian judgment actually uses.
 *
 * Ordered most specific first, and each is anchored on an explicit paragraph
 * word. **A bare number is never a paragraph reference** — "1973" and "45" occur
 * constantly in legal prose, and a rule that matched them would produce
 * confident nonsense at scale.
 */
const PATTERNS: { name: string; re: RegExp }[] = [
  {
    // "paragraphs 12 to 15", "paras 45-48", "paragraph 9 – 11"
    name: 'range',
    re: /\b(?:para|paras|paragraph|paragraphs)\.?\s*(\d{1,4})\s*(?:to|through|[-–—])\s*(\d{1,4})\b/gi,
  },
  {
    // "paragraphs 12, 14 and 19" — the list form, comma or "and" separated
    name: 'list',
    re: /\b(?:para|paras|paragraph|paragraphs)\.?\s*((?:\d{1,4})(?:\s*(?:,|and)\s*\d{1,4}){1,20})\b/gi,
  },
  {
    // "paragraph 22", "para. 7"
    name: 'single',
    re: /\b(?:para|paras|paragraph|paragraphs)\.?\s*(\d{1,4})\b/gi,
  },
];

/**
 * A range wider than this is not a citation to specific paragraphs — it is
 * somebody overruling a judgment and describing it loosely. Storing it would
 * put fifty numbers in a banner and mean nothing.
 */
const MAX_RANGE = 30;

/**
 * Pull paragraph numbers out of the passage where one judgment overrules
 * another.
 *
 * Returns `null` when nothing can be read with confidence, and **null is the
 * expected answer most of the time.** The caller must treat it as "leave this
 * judgment alone", never as "overrule all of it".
 */
export function extractParagraphRefs(
  citingFullText: string,
  charOffset: number,
): ParagraphFinding | null {
  const start = Math.max(0, charOffset - WINDOW);
  const window = citingFullText.slice(start, charOffset + WINDOW);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE FALSE POSITIVE THAT NEARLY REACHED THE CORPUS, 8 Aug 2026
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The first version of this file found paragraphs for all seven blocked
   * judgments. Every one was wrong, and it took reading the actual passages to
   * see it:
   *
   *   [Para 129][235-H; 236-E-F] Prakash v. Phulavati … – overruled.
   *   Danamma @ Suman Surpur … – partly overruled.
   *
   * `[Para 129]` is the **Supreme Court Reports headnote's own pinpoint**,
   * marking where in the CITING judgment that headnote point sits. It is
   * followed by page markers, and then by a *Case Law Cited* list in which the
   * overruling appears as a bare entry — *"Danamma … – partly overruled"* — with
   * **no paragraph attribution at all**.
   *
   * So the number belonged to *Vineeta Sharma*, and we were about to record it
   * as the overruled paragraphs of *Danamma*. That is precisely the failure this
   * module's header calls worse than finding nothing: telling an advocate a
   * specific live passage is dead.
   *
   * `char_offset` points at a citation, and in a law report the densest
   * concentration of citations is the citation list — the same sampling bias
   * `services/harness/src/build-queries.ts` learned about for a different
   * reason. Two refusals follow, and both are worth the false negatives.
   */

  // 1 · A citation-list or headnote region attributes nothing to anybody.
  if (/case\s+law\s+cited|list\s+of\s+citations|cases?\s+referred|headnote/i.test(window)) {
    return null;
  }

  // 2 · `[Para 129]` in square brackets is a reporter's pinpoint into the
  //     judgment being reported — never a reference to the overruled judgment's
  //     paragraphs. The prose form ("in paragraph 22 of that judgment") is what
  //     we are looking for, and it is not bracketed.
  const bracketed = /\[\s*paras?\.?\s*\d/i.test(window);
  if (bracketed) return null;

  const found = new Set<number>();
  const evidence: string[] = [];

  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of window.matchAll(re)) {
      if (name === 'range') {
        const from = Number(m[1]);
        const to = Number(m[2]);
        /**
         * A reversed or absurd range is a misparse, and **the whole extraction
         * fails.** Not `continue` — that was the first version, and a test
         * caught it doing something much worse than nothing: "paragraphs 1 to
         * 400" fell through to the single-number rule and returned
         * **paragraph 1**.
         *
         * Reading "the court overruled 400 paragraphs" as "the court overruled
         * paragraph 1" is the confident-nonsense failure this module exists to
         * prevent. A range we could not read is positive evidence that the text
         * contains something we do not understand — which is a reason to stop,
         * never a licence to try a looser rule.
         */
        if (!(to > from) || to - from > MAX_RANGE) return null;
        for (let n = from; n <= to; n++) found.add(n);
        evidence.push(m[0].trim());
      } else if (name === 'list') {
        const numbers = [...m[1]!.matchAll(/\d{1,4}/g)].map((d) => Number(d[0]));
        for (const n of numbers) found.add(n);
        evidence.push(m[0].trim());
      } else {
        found.add(Number(m[1]));
        evidence.push(m[0].trim());
      }
    }
    // Stop at the most specific form that matched. A range and a single-number
    // rule will both fire on "paragraphs 12 to 15"; taking both would add 12 and
    // 15 twice and, worse, would let a looser rule widen a precise finding.
    if (found.size > 0) break;
  }

  if (found.size === 0) return null;

  /**
   * Paragraph 0 does not exist, and a four-digit "paragraph" is almost always a
   * year that landed next to the word. Dropping them is cheap; a banner saying
   * "paragraph 1973 was set aside" is not recoverable.
   */
  const paragraphs = [...found].filter((n) => n > 0 && n < 1000).sort((a, b) => a - b);
  if (paragraphs.length === 0) return null;

  return { paragraphs, evidence: evidence.join(' · ').slice(0, 500) };
}

/**
 * Would this finding be safe to write?
 *
 * Separate from extraction on purpose. Extraction says *what the text contains*;
 * this says *whether we are willing to put it in front of an advocate*, and the
 * two should be reviewable independently.
 */
export function isTrustworthy(finding: ParagraphFinding | null): finding is ParagraphFinding {
  if (finding === null) return false;
  // A "partial" overruling naming dozens of paragraphs is either a misparse or a
  // judgment being described loosely. Either way it is not actionable.
  if (finding.paragraphs.length > MAX_RANGE) return false;
  return true;
}
