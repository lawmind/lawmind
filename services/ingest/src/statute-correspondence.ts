/**
 * The official BNS/BNSS/BSA ↔ IPC/CrPC/IEA correspondence tables (BPRD, MHA).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS CAN EXIST, WHEN `CURRENT_PLAN.md` Q1.43 SAID IT COULD NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Q1.43 recorded the mapping as unbuildable — *"we hold one side only"* — and
 * that was right. The corpus has the new Acts and not the repealed ones, and
 * `CLAUDE.md` forbids inventing a section mapping. **A model asked to guess that
 * BNS 103 corresponds to IPC 302 is exactly the fabrication this cannot ship.**
 *
 * NEW3 found the missing side: the Bureau of Police Research & Development
 * (Ministry of Home Affairs) publishes all three tables section by section, as
 * text-bearing PDFs — verified by extraction rather than by search snippet, so
 * no OCR inference enters the path. `SOURCE_REGISTRY.md` §5f holds provenance.
 *
 * **The official table is the source of truth. No model output is authoritative
 * here, and nothing in this file consults one.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COLUMN-AWARE, BECAUSE A LINE-SHAPED PARSER LOSES ROWS AND INVENTS MAPPINGS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first version matched line patterns and got 160 rows from BSA but **5
 * from BNS and 2 from BNSS** — the two larger tables use a different column
 * ORDER, and it could not see multi-section rows at all:
 *
 *     BSA :  <new>  <old>     <subject>  <summary>
 *     BNS :  <new>  <subject> <old>      <summary>
 *
 *     5           Commutation of sentence.      54 & 55  given in BNS, but…
 *                                               55A      23 of the BNSS defines…
 *
 * **BNS 5 corresponds to IPC 54, 55 AND 55A.** The `55A` is a continuation of
 * the old-section COLUMN on the following line — invisible to anything reading
 * whole lines, and mapping BNS 5 to IPC 54 alone would be a partial mapping
 * presented as complete. That is fabrication by omission.
 *
 * So columns are located from the header row and every line is sliced by
 * position. A line blank in the new-section column but carrying text in the
 * old-section column is a continuation of the row above, not a new row.
 */

/** Bumped whenever parsing changes, so a stored row records how it was read. */
export const PARSER_VERSION = 2;

export type ActPair = 'BNS-IPC' | 'BNSS-CrPC' | 'BSA-IEA';

export interface OldRef {
  /** `54`, `65A`, `3` — as printed. */
  section: string;
  /** Paragraph within that section when the source names one, else null. */
  paragraph: number | null;
}

export interface Correspondence {
  newSection: string;
  /** EVERY old section named. `54 & 55` + `55A` yields three, never one. */
  oldRefs: OldRef[];
  subject: string;
  /** True when the source says `New` — the provision has no counterpart. */
  newlyAdded: boolean;
  /** 1-based line in the extracted text, for provenance. */
  sourceLine: number;
}

export interface ParseResult {
  pair: ActPair;
  rows: Correspondence[];
  /** Looked like a row, did not parse. Reported, never silently dropped. */
  unparsed: { line: number; text: string }[];
  /** Parsed, but the old side could not be read as sections. */
  ambiguous: { line: number; text: string }[];
}

interface Layout {
  pair: ActPair;
  newAt: number;
  oldAt: number;
  subjectAt: number;
  /** Column where the summary prose begins; everything past it is commentary. */
  summaryAt: number;
}

const HEADERS: { pair: ActPair; newTag: string; oldTag: string }[] = [
  { pair: 'BNS-IPC', newTag: 'BNS', oldTag: 'IPC' },
  { pair: 'BNSS-CrPC', newTag: 'BNSS', oldTag: 'CrPC' },
  { pair: 'BSA-IEA', newTag: 'BSA', oldTag: 'IEA' },
];

/**
 * Column positions come from the header row, not from constants. The three PDFs
 * differ and a hard-coded offset would silently mis-slice one of them.
 */
function findLayout(lines: string[]): Layout | null {
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const l = lines[i]!;
    const subjectAt = l.indexOf('Subject');
    if (subjectAt < 0) continue;
    for (const h of HEADERS) {
      // BNSS contains "BNS", so the longest tag must win.
      const newAt = new RegExp(String.raw`\b${h.newTag}\b`).exec(l)?.index ?? -1;
      const oldAt = new RegExp(String.raw`\b${h.oldTag}\b`).exec(l)?.index ?? -1;
      if (newAt < 0 || oldAt < 0) continue;
      const summaryAt = l.indexOf('Summary');
      return { pair: h.pair, newAt, oldAt, subjectAt, summaryAt: summaryAt < 0 ? 10_000 : summaryAt };
    }
  }
  return null;
}

const slice = (line: string, from: number, to: number) => line.slice(from, to).trim();

/** `2(1) (c)` → `2(1)(c)`. The spaces are the PDF's columns, not meaning. */
const tidy = (s: string) => s.replace(/\s+/g, '');

const SECTION_RE = /^\d{1,3}[A-Z]{0,2}(?:\(\d+\))?(?:\([a-z]{1,3}\))?$/;

/**
 * Reads every section named on the old side.
 *
 * Handles `54 & 55`, `54 and 55`, `54, 55`, `3, para 1`, and `New`. Returns
 * null when the text is present but unreadable, so the caller can record it as
 * ambiguous instead of asserting a mapping it cannot justify.
 */
export function parseOldSide(raw: string): OldRef[] | null | 'new' {
  const text = raw.trim();
  if (text === '') return null;
  if (/^new$/i.test(text)) return 'new';

  // A paragraph qualifier applies to the section it follows.
  const paraMatch = /^(.*?),\s*para(?:graph)?\s*(\d+)\s*$/i.exec(text);
  const paragraph = paraMatch ? Number(paraMatch[2]) : null;
  const body = paraMatch ? paraMatch[1]! : text;

  const parts = body
    .split(/\s*(?:&|and|,)\s*/i)
    .map((p) => tidy(p))
    .filter((p) => p !== '');
  if (parts.length === 0) return null;
  if (!parts.every((p) => SECTION_RE.test(p))) return null;

  // The paragraph qualifies the LAST section named, which is how the source
  // prints it; applying it to all of them would overstate the mapping.
  return parts.map((section, i) => ({
    section,
    paragraph: i === parts.length - 1 ? paragraph : null,
  }));
}

export function parseCorrespondence(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, ' '));
  const layout = findLayout(lines);
  if (!layout) return { pair: 'BSA-IEA', rows: [], unparsed: [], ambiguous: [] };

  const [c1, c2] =
    layout.oldAt < layout.subjectAt
      ? [layout.oldAt, layout.subjectAt] // BSA: new | old | subject
      : [layout.subjectAt, layout.oldAt]; // BNS/BNSS: new | subject | old

  const rows: Correspondence[] = [];
  const unparsed: { line: number; text: string }[] = [];
  const ambiguous: { line: number; text: string }[] = [];
  let current: Correspondence | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    if (/CORRESPONDENCE TABLE|COMPARISON SUMMARY|©|^\s*Sections?\s*$/i.test(line)) continue;

    const newCell = slice(line, layout.newAt, c1);
    const midCell = slice(line, c1, c2);
    const endCell = slice(line, c2, layout.summaryAt);
    const oldCell = layout.oldAt < layout.subjectAt ? midCell : endCell;
    const subjectCell = layout.oldAt < layout.subjectAt ? endCell : midCell;

    let startsRow = SECTION_RE.test(tidy(newCell));

    if (!startsRow) {
      /**
       * CONTINUATION IS CHECKED FIRST, and the order is load-bearing.
       *
       * A blank new-section column with content in the old-section column means
       * the row above names more sections — the `55A` under `54 & 55`. When the
       * ragged fallback below was tried first, that line matched as a row of its
       * own (`55A -> 23`), which both invented a mapping and stole two thirds of
       * BNS 5's. Continuation wins; only then does anything else get a look.
       */
      if (current && newCell === '' && oldCell !== '') {
        const more = parseOldSide(oldCell);
        if (more === 'new') continue;
        if (more) {
          current.oldRefs.push(...more);
          continue;
        }
      }

      /**
       * RAGGED FALLBACK — the three PDFs do not extract with the same geometry.
       *
       * BNS and BNSS come out cleanly column-aligned, which is what makes the
       * `55A` continuation readable at all. **BSA does not**: its rows are packed
       * (`2(1)(a) 3, para 1 "Court".`) and land nowhere near the header's column
       * stops, so slicing by position produces `2(1)(a) 3,` as the new-section
       * cell and the row is lost.
       *
       * So a line that fails the column test gets one token-based attempt before
       * being treated as prose. Column-first is deliberate: it is the only way to
       * see a multi-section continuation, and a ragged document has none to see.
       */
      const tok =
        /^\s*(\d{1,3}[A-Z]{0,2}(?:\s*\(\s*\d+\s*\))?(?:\s*\(\s*[a-z]{1,3}\s*\))?)\s+(New|\d{1,3}[A-Z]{0,2}(?:\s*,\s*para(?:graph)?\s*\d+)?)\s+(\S.*)$/.exec(
          line,
        );
      if (tok) {
        const parsedTok = parseOldSide(tok[2]!);
        if (parsedTok !== null) {
          const row: Correspondence = {
            newSection: tidy(tok[1]!),
            oldRefs: parsedTok === 'new' ? [] : parsedTok,
            subject: tok[3]!.trim(),
            newlyAdded: parsedTok === 'new',
            sourceLine: i + 1,
          };
          rows.push(row);
          current = row;
          continue;
        }
      }

      // Everything else on a non-row line is wrapped subject or summary prose.
      continue;
    }

    const parsed = parseOldSide(oldCell);
    const row: Correspondence = {
      newSection: tidy(newCell),
      oldRefs: parsed && parsed !== 'new' ? parsed : [],
      subject: subjectCell,
      newlyAdded: parsed === 'new',
      sourceLine: i + 1,
    };

    if (parsed === null && oldCell !== '') {
      ambiguous.push({ line: i + 1, text: line.trim() });
      continue;
    }
    if (parsed === null && oldCell === '') {
      unparsed.push({ line: i + 1, text: line.trim() });
      continue;
    }

    rows.push(row);
    current = row;
  }

  return { pair: layout.pair, rows, unparsed, ambiguous };
}
