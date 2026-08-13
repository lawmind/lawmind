/**
 * The official BNS/BNSS/BSA ↔ IPC/CrPC/IEA correspondence tables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS CAN EXIST NOW, WHEN `CURRENT_PLAN.md` Q1.43 SAID IT COULD NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Q1.43 recorded that the mapping *"cannot be built — we hold one side only"*,
 * and that was correct: the corpus has the new Acts and not the repealed ones,
 * and `CLAUDE.md` forbids inventing a section mapping. **A model asked to guess
 * that BNS 103 corresponds to IPC 302 is exactly the fabrication this project
 * cannot ship.**
 *
 * NEW3 found the missing side: **BPRD (Bureau of Police Research &
 * Development, Ministry of Home Affairs) publishes all three tables**, section
 * by section, as text-bearing PDFs — verified by extraction, not by search
 * snippet, so no OCR inference enters the path. Official government work
 * product, authored by the Director of the Central Academy for Police Training.
 *
 * `SOURCE_REGISTRY.md` §5f carries the provenance. This file only parses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHAPES, MEASURED FROM THE REAL TABLE, NOT ASSUMED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *     1           1  Short title, application and commencement.
 *     2(1)(a) 3, para 1 "Court".
 *     2(1) (c) 3, para 8 "disproved".        <- internal space in the clause
 *     62 65A  Special provisions as to evidence
 *     170 New Repeal and savings.            <- NO counterpart; newly added
 *
 * Four things a naive parser gets wrong, each seen in the real file:
 *
 * 1. **`New` is not a section number.** It means the provision has no
 *    counterpart in the old Act. Mapping it to anything is a fabrication.
 * 2. **The old side can carry `, para N`** — BSA 2(1)(a) maps to IEA "3, para
 *    1", a *paragraph* of a section, because the new Act split it. Dropping the
 *    paragraph asserts a whole-section equivalence the source does not.
 * 3. **Clause numbers contain spaces** (`2(1) (c)`), because the PDF's column
 *    layout leaks into the text.
 * 4. **Summary prose follows on the same line and wraps onto later ones**, so a
 *    row cannot be read as "the whole line".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT REFUSES RATHER THAN GUESSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every line that does not match a known shape is returned in `unparsed` rather
 * than dropped or approximated. A correspondence table that silently omits rows
 * is worse than one that reports gaps: the gap is checkable, the omission is
 * invisible. `DOMAIN_TRUTH.md` is the authority on these Acts and a wrong row
 * here would end up there.
 */

/** `1`, `170`, `65A`, `2(1)(a)`, `2(1) (c)` — spaces inside clauses are real. */
const SECTION = String.raw`\d{1,3}[A-Z]?(?:\s*\(\s*\d+\s*\))?(?:\s*\(\s*[a-z]{1,3}\s*\))?`;

/**
 * The old-Act side. `New` is matched deliberately so it can be RECOGNISED and
 * then refused, rather than falling through to the unparsed bucket where a
 * later reader might mistake it for a parser gap.
 */
const OLD_SIDE = String.raw`(New|${SECTION}(?:\s*,\s*para\s*\d+)?)`;

const ROW = new RegExp(String.raw`^\s*(${SECTION})\s+${OLD_SIDE}\s+(\S.*)$`);

export interface Correspondence {
  /** Section in the NEW Act, normalised: `2(1)(a)`, `170`. */
  newSection: string;
  /** Section in the OLD Act, or null when the provision is newly added. */
  oldSection: string | null;
  /** Paragraph within the old section, when the source names one. */
  oldParagraph: number | null;
  /** The subject line as printed. Never rewritten. */
  subject: string;
  /** True when the source says `New` — no counterpart exists. */
  newlyAdded: boolean;
}

export interface ParseResult {
  rows: Correspondence[];
  /** Lines that looked like rows but did not parse. Reported, never dropped. */
  unparsed: string[];
}

/** Collapses the layout spaces the PDF leaks into clause numbers. */
const tidy = (s: string) => s.replace(/\s+/g, '').replace(/ /g, '');

/**
 * A row's subject must start like a subject, not like more prose. Summary text
 * wraps onto continuation lines that can begin with a number, and treating one
 * of those as a row would invent a mapping.
 */
const CONTINUATION = /^(?:the|and|of|in|is|are|was|were|words?|word|clause|section|paragraph|no change)\b/i;

export function parseCorrespondence(text: string): ParseResult {
  const rows: Correspondence[] = [];
  const unparsed: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/ /g, ' ').trimEnd();
    if (line.trim() === '') continue;
    // Header and footer furniture, not data.
    if (/CORRESPONDENCE TABLE|COMPARISON SUMMARY|©|Section\s*$/i.test(line)) continue;

    const m = ROW.exec(line);
    if (!m) {
      /**
       * ANY line starting with a digit is reported when it does not parse.
       *
       * The first version required a space or `(` immediately after the number,
       * so `99ZZ ~~~ garbled` — a malformed section if ever there was one —
       * fell through silently. That is precisely the invisible gap this whole
       * file exists to avoid: over-reporting is checkable, under-reporting is
       * not.
       */
      if (/^\s*\d/.test(line) && !CONTINUATION.test(line.trim())) unparsed.push(line.trim());
      continue;
    }

    const newSection = tidy(m[1]!);
    const oldRaw = m[2]!.trim();
    const subject = m[3]!.trim();
    /**
     * The subject is NOT prose-filtered, and that was a real bug.
     *
     * An earlier version rejected any subject starting with a connective, which
     * threw away the legitimate row `2(2) New Words and expressions.` because
     * "Words" is also how wrapped summary prose begins.
     *
     * The filter was never needed: a row must start with a section number AND
     * carry a second section-like token. Wrapped prose ("the word "man" is
     * replaced…") starts with neither, so `ROW` already rejects it. Guarding
     * twice cost real rows and bought nothing.
     */

    const newlyAdded = /^new$/i.test(oldRaw);
    let oldSection: string | null = null;
    let oldParagraph: number | null = null;
    if (!newlyAdded) {
      const para = /,\s*para\s*(\d+)/i.exec(oldRaw);
      oldParagraph = para ? Number(para[1]) : null;
      oldSection = tidy(oldRaw.replace(/,\s*para\s*\d+/i, ''));
    }

    // One row per new-section; the table lists each once and a duplicate means
    // a continuation line was misread.
    if (seen.has(newSection)) continue;
    seen.add(newSection);
    rows.push({ newSection, oldSection, oldParagraph, subject, newlyAdded });
  }
  return { rows, unparsed };
}
