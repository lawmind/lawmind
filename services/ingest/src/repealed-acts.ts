/**
 * The three repealed codes — IPC, CrPC and the Evidence Act — and the section
 * splitter that turns their India Code PDFs into rows.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AND WHY IT IS A PDF
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * C1 — the IPC↔BNS mapping — is the last open Gate S1 criterion, and it is
 * blocked on one thing: **we do not hold the repealed codes.** You cannot verify
 * that BNS s. 103 corresponds to IPC s. 302 without the text of s. 302.
 *
 * A previous pass concluded the repealed Acts were not on India Code at all.
 * They are: the enforced-acts browse genuinely does not list them, because India
 * Code describes itself as holding *"all **Enforced** Central and State Acts"* —
 * so the absence was correct rather than a parsing failure. The items exist
 * under their own handles, **verified against the site 8 Aug 2026**.
 *
 * **And they are PDFs, not the structured act pages.** The enforced Acts have an
 * HTML page with a link per section, which `parseActPage` reads. These have one
 * bitstream and nothing else — confirmed by fetching handle 11091, which yields
 * exactly one `/bitstream/.../the_indian_penal_code,_1860.pdf` and no
 * section links at all. So the sections have to be cut out of running text, and
 * that is what the rest of this file is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUS 8 Aug 2026 — CORRECT ON WELL-FORMED TEXT, INCOMPLETE ON THE REAL PDF
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Measured against the real IPC PDF: 36 sections of roughly 511, range 1–120,
 * 84 gaps.** The sections it does find are right — s. 1 is *"Title and extent of
 * operation of the Code"* and s. 2 is *"Punishment of offences committed within
 * India"*, which is what the Act says. So the heading rule is sound and the
 * output is trustworthy as far as it goes. It simply does not go far enough.
 *
 * **The cause is the PDF text layer, not the rule.** `unpdf` with
 * `mergePages: true` returns text in which section headings are frequently NOT
 * at a line start — s. 1's body visibly runs on into `2. Punishment of
 * offences…` in the same line. `SECTION_HEADING` is anchored with `^` under
 * `gm`, so every heading that lands mid-line is missed, and the preceding
 * section swallows it.
 *
 * **Relaxing the anchor is the obvious fix and is the wrong one.** The anchor is
 * what stops the rule firing on ordinary numbered prose — *"(2) Nothing in
 * section 5 shall apply"*, *"1. The accused was present"* — which a statute is
 * full of, and there is a test for exactly that. Removing it trades an
 * incomplete corpus for a wrong one, and a wrong one is what tells an advocate
 * the wrong offence.
 *
 * **So this needs a different approach, not another tweak**, and it is recorded
 * rather than attempted after four cycles on the same problem: extract per page
 * with layout information so headings can be recognised by POSITION rather than
 * by punctuation, or find a source for these three codes that is not a PDF.
 * `docs/CURRENT_PLAN.md` carries it.
 *
 * `DOMAIN_TRUTH.md`'s rule governs everything downstream: **never invent a
 * section number.** A splitter that guesses where a section starts produces a
 * corpus in which s. 302 contains half of s. 303, and the mapping built on it
 * would tell an advocate the wrong offence. So the heading rule is strict, and
 * text before the first confident heading is **discarded rather than attached to
 * anything**.
 */

/** Verified against India Code on 8 Aug 2026 by the title each handle returns. */
export const REPEALED_ACT_HANDLES = [
  {
    handle: '123456789/11091',
    /** India Code answers: `INDIAN PENAL CODE, 1860`. */
    expectTitle: 'INDIAN PENAL CODE',
    shortTitle: 'Indian Penal Code, 1860',
    oldAct: 'ipc' as const,
  },
  {
    handle: '123456789/4221',
    /** India Code answers: `Criminal-Procedure-Code-CrPC-1973`. */
    expectTitle: 'Criminal-Procedure-Code',
    shortTitle: 'Code of Criminal Procedure, 1973',
    oldAct: 'crpc' as const,
  },
  {
    handle: '123456789/4218',
    /** India Code answers: `INDIAN-EVIDENCE-ACT-1872`. */
    expectTitle: 'INDIAN-EVIDENCE-ACT',
    shortTitle: 'Indian Evidence Act, 1872',
    oldAct: 'evidence' as const,
  },
] as const;

/**
 * `123456789/16225` appears in search results for the CrPC and **is invalid** —
 * India Code answers "Invalid URL or Argument(s)". Recorded so nobody tries it
 * a second time.
 */
export const KNOWN_BAD_HANDLES = ['123456789/16225'] as const;

export type ParsedSection = {
  /** `302`, `376AB`, `498A` — exactly as printed, never normalised. */
  number: string;
  heading: string;
  text: string;
};

/**
 * A section heading in an Indian bare Act.
 *
 * `302. Punishment for murder.—Whoever commits murder shall…`
 *
 * Anchored to a line start and requiring the number, a full stop, and a heading
 * that begins with a capital. **Requiring the trailing full stop on the heading
 * is what keeps this from firing on ordinary numbered prose**, which is
 * everywhere in a statute: "(2) Nothing in section 5 shall apply…" and
 * "1. The accused was present" both look like headings to a looser rule.
 */
const SECTION_HEADING =
  /^[ \t]*(\d{1,3}[A-Z]{0,3})\.[ \t]+([A-Z][^\n]{2,150}?)\.[ \t]*(?:[—–-]{1,2}|\n)/gm;

/**
 * Amendment footnotes, which are the reason the first real parse produced
 * nonsense.
 *
 * An Indian bare Act prints amendment history as numbered footnotes at the foot
 * of each page — *"1. Subs. by Act 27 of 1870, s. 1, for the original section"*
 * — and a PDF text layer merges them into the running text. **They match the
 * section-heading rule exactly**: a number, a full stop, a capital, a phrase, a
 * full stop.
 *
 * The first run against the real IPC PDF returned 49 "sections" of which the
 * first three were footnotes, and section 1 was *"Subs. by Act 27 of 1870"*.
 * Shape alone cannot separate them. Two things can, and both are used:
 * this vocabulary, and the monotonic rule in `keepAscendingRun`.
 */
const FOOTNOTE_OPENERS =
  /^(?:subs|ins|omitted|rep|added|substituted|inserted|the words?|cls?|certain words|now|see|vide|w\.e\.f)\b\.?/i;

export function looksLikeFootnote(heading: string): boolean {
  return FOOTNOTE_OPENERS.test(heading.trim());
}

/** Repeated furniture that must not end up inside a section's text. */
const PAGE_FURNITURE = [
  /^\s*THE INDIAN PENAL CODE,?\s*1860\s*$/gim,
  /^\s*THE CODE OF CRIMINAL PROCEDURE,?\s*1973\s*$/gim,
  /^\s*THE INDIAN EVIDENCE ACT,?\s*1872\s*$/gim,
  /^\s*SECTIONS?\s*$/gim,
  /^\s*\d{1,4}\s*$/gm, // a bare page number on its own line
];

export function stripPageFurniture(text: string): string {
  let out = text;
  for (const re of PAGE_FURNITURE) out = out.replace(re, '');
  return out.replace(/\n{3,}/g, '\n\n');
}

/**
 * Cut an Act's running text into sections.
 *
 * **Everything before the first confident heading is discarded.** A statute PDF
 * opens with a title page, a long table of contents and a preamble, and none of
 * it belongs to a section. Attaching it to section 1 would put the table of
 * contents inside the first offence.
 *
 * The **table of contents is the failure mode that matters**, because it
 * contains every section number and heading in the Act, in order, and therefore
 * parses perfectly into hundreds of sections with no text. `dropTableOfContents`
 * below is what catches it.
 */
export function parseSections(rawText: string): ParsedSection[] {
  const text = stripPageFurniture(rawText);

  const matches = [...text.matchAll(SECTION_HEADING)];
  if (matches.length === 0) return [];

  const sections: ParsedSection[] = [];
  for (const [i, m] of matches.entries()) {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    sections.push({
      number: m[1]!,
      heading: m[2]!.replace(/\s+/g, ' ').trim(),
      text: text.slice(start, end).replace(/\s+/g, ' ').trim(),
    });
  }

  /**
   * **Order matters here and a test caught it.**
   *
   * The ascending run must be computed over things that are already plausible
   * sections — not over every regex hit. Running it first let two lines of
   * ordinary numbered prose ("1. The accused was present… 2. The witness
   * deposed…") form a longer ascending run than the single real section beside
   * them, and the real section was discarded.
   *
   * So: drop footnotes by vocabulary, drop the bodiless contents lines, and
   * only then ask which of the survivors ascend.
   */
  const plausible = dropTableOfContents(sections.filter((x) => !looksLikeFootnote(x.heading)));
  return keepAscendingRun(plausible);
}

/**
 * Keep only the longest run of sections whose numbers ASCEND.
 *
 * **This is the structural rule that shape-matching cannot replace.** A statute
 * numbers its sections once, in order, from beginning to end. Footnote markers
 * restart at 1 on every page; a marginal note or a schedule re-uses numbers.
 * So a heading whose number goes *backwards* is not a section — whatever it
 * looks like.
 *
 * Implemented as a longest strictly-increasing subsequence over document order,
 * which is O(n log n) and, more importantly, **picks the run the Act itself
 * follows** rather than trusting the first thing that matched. On the IPC's
 * ~511 sections the real sequence dominates by a wide margin, and the footnote
 * markers — which restart constantly — cannot form a long ascending run.
 *
 * A tie is broken toward the LATER heading, because the table of contents comes
 * first and the Act comes second; `dropTableOfContents` then prefers whichever
 * copy carries text.
 */
export function keepAscendingRun(sections: readonly ParsedSection[]): ParsedSection[] {
  if (sections.length === 0) return [];

  const value = (s: ParsedSection) => Number.parseInt(s.number, 10);
  const n = sections.length;
  // tails[k] = index into `sections` of the smallest possible tail of an
  // increasing run of length k+1.
  const tails: number[] = [];
  const previous = new Array<number>(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const v = value(sections[i]!);
    if (Number.isNaN(v)) continue;

    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (value(sections[tails[mid]!]!) < v) lo = mid + 1;
      else hi = mid;
    }
    previous[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  }

  if (tails.length === 0) return [];

  const run: ParsedSection[] = [];
  for (let i = tails[tails.length - 1]!; i !== -1; i = previous[i]!) run.push(sections[i]!);
  return run.reverse();
}

/**
 * Remove the contents-page copy of every section.
 *
 * A statute PDF lists each section twice: once in the table of contents with no
 * body, and once in the Act with its text. Both parse. Keeping both gives every
 * section number **two rows**, and whichever the mapping happens to read decides
 * whether s. 302 has any text at all.
 *
 * The rule: **where a number appears more than once, keep the copy with the most
 * text.** Not "the last one" — a schedule or an amending footnote can follow the
 * real section — and not "the longest heading", which is the same in both.
 */
export function dropTableOfContents(sections: readonly ParsedSection[]): ParsedSection[] {
  const best = new Map<string, ParsedSection>();
  for (const s of sections) {
    const existing = best.get(s.number);
    if (existing === undefined || s.text.length > existing.text.length) best.set(s.number, s);
  }

  /**
   * A section with almost no text is a contents line that had no duplicate —
   * common where the Act omits a repealed section. Dropped rather than stored
   * empty, because an empty section reads as "this section says nothing" to
   * anything downstream, and that is a different and false statement.
   */
  return [...best.values()].filter((s) => s.text.length >= 20);
}

/** Ordering the number the way a lawyer reads it: 302 before 302A before 303. */
export function compareSectionNumbers(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (na !== nb) return na - nb;
  return a.localeCompare(b);
}
