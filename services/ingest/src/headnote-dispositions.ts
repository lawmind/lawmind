/**
 * Supreme Court headnote "Case Law" lists — grouped dispositions, and the
 * SCR↔SCC concordance printed beside them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS EXISTS TO MEASURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `MADA v. SAIL` (2024 INSC 554) prints:
 *
 *     … State of Orissa v. Mahanadi Coalfields Ltd. [1995] 3 SCR 639 : (1995)
 *     Supp 2 SCC 686; P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92
 *     : (1996) 5 SCC 670 – overruled.
 *
 * **`– overruled.` closes a SEMICOLON-SEPARATED GROUP, not the citation next to
 * it.** Every case in that list is overruled. The citation extractor attached
 * `overruled` to the last citation before the marker and missed the rest — and
 * because `CLAUDE.md` §6 puts the stale-overruled threshold at ZERO, a missed
 * one is the product showing an advocate that dead law is alive.
 *
 * Nothing detects it either: evidence-span verification proves a claim is
 * grounded, never that a claim was never made.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SECOND THING IN THE SAME TEXT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Those entries print BOTH citation forms, paired by a colon:
 *
 *     [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670
 *
 * `overruled-resolve-cli` names the blocker for all 34 unresolved overruled
 * edges as *"the SCC/AIR → S.C.R. identity gap"*. That mapping is sitting inside
 * our own corpus as a string pair, in 656 judgments — no model, no external
 * source, no adjudication.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Parsing only. It writes nothing, calls nothing, and recalls no case name from
 * memory — every value it returns is a substring of text passed to it. Whether
 * any of this reaches `overruled_status` is a human's call on a 45-judgment
 * population, per `docs/ai/OVERRULED_GROUP_MARKERS.md`.
 */

/**
 * The en dash is U+2013, not a hyphen. The reports use it consistently.
 *
 * **The trailing period is OPTIONAL, and requiring it was a real bug.**
 * `Puttaswamy` (2018 INSC 880) prints `– relied on 1.1.3 A constitutional
 * trust…` with no period at all. Requiring one meant that marker was never
 * seen, so the group boundary never closed and the NEXT marker's group reached
 * back across two paragraphs of prose and two earlier lists. The report then
 * claimed Shayara Bano, Kihoto Hollohan and Tulsiram Patel were overruled by
 * it. They are not — the real group is two cases long.
 */
const MARKER = /–\s*([a-z][a-z ]{2,28})\.?(?=\s+[A-Z0-9“"]|\s*$)/g;

/**
 * A case name longer than this is prose that happens to end in a citation.
 * Measured against real entries: the longest genuine name observed is well
 * under 100 characters.
 */
const MAX_NAME_CHARS = 110;

/**
 * Dispositions that change whether an authority is still good law. Anything
 * outside this set is parsed and reported but must never be treated as a
 * treatment signal — `referred to` and `explained` are not `overruled`, and
 * collapsing them is how a citation graph starts lying.
 */
export const ADVERSE_DISPOSITIONS = new Set(['overruled', 'overruled in part', 'set aside', 'reversed']);

/**
 * Page furniture that PDF extraction injects INTO the middle of a citation:
 *
 *     [2016] 10 SCR 1 : (2017) 1574 [2024] 7 S.C.R.Digital Supreme Court
 *     Reports 12 SCC 1
 *
 * The `1574` is a page number and the bracketed run is a running header. Left
 * in place, the SCC volume reads as 1574 instead of 12. Stripped BEFORE any
 * citation is matched, never after.
 */
const INTERPOLATED_HEADER =
  /\d*\s*\[\d{4}\]\s*\d+\s*S\.C\.R\.\s*(?:Digital\s+Supreme\s+Court\s+Reports)?\s*/gi;

const SCR = /\[(\d{4})\]\s*(Supp\.?\s*)?(\d+)\s*SCR\s*(\d+)/i;
const SCC = /\((\d{4})\)\s*(Supp\.?\s*)?(\d+)\s*SCC\s*(\d+)/i;

export interface HeadnoteEntry {
  /** Case name as printed, never normalised and never recalled. */
  name: string;
  /** `[1996] Supp. 4 SCR 92` → `(1996) Supp 4 SCR 92`, or undefined. */
  scr?: string;
  /** `(1996) 5 SCC 670`, or undefined. */
  scc?: string;
  disposition: string;
  /** True when this entry sits at the end of its group, i.e. the ONLY one the
   *  current extractor would have caught. Lets the report quantify the miss. */
  lastInGroup: boolean;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function citationOf(re: RegExp, text: string): string | undefined {
  const m = re.exec(text);
  if (!m) return undefined;
  const [, year, supp, vol, page] = m;
  const reporter = re === SCR ? 'SCR' : 'SCC';
  return `(${year}) ${supp ? 'Supp ' : ''}${vol} ${reporter} ${page}`;
}

/**
 * A group entry is `<name> <citations>`. The name is whatever precedes the
 * first citation — taking it any other way would mean inventing a boundary the
 * text does not draw.
 */
function parseEntry(raw: string, disposition: string, lastInGroup: boolean): HeadnoteEntry | null {
  const text = clean(raw.replace(INTERPOLATED_HEADER, ' '));
  if (text.length < 6) return null;

  const scr = citationOf(SCR, text);
  const scc = citationOf(SCC, text);
  if (!scr && !scc) return null; // prose, not a case entry

  const firstCite = Math.min(
    ...[text.search(/\[\d{4}\]/), text.search(/\(\d{4}\)/)].filter((i) => i >= 0),
  );
  const name = clean(text.slice(0, Number.isFinite(firstCite) ? firstCite : text.length))
    // Trailing connective punctuation left behind by the split.
    .replace(/[;,:.\s]+$/, '');
  if (name.length < 4) return null;
  // Prose ending in a citation, not a Case Law entry. This is half of what
  // stops a group from reaching back across a paragraph.
  if (name.length > MAX_NAME_CHARS) return null;

  return { name, scr, scc, disposition, lastInGroup };
}

/**
 * Every case in every disposition group in one judgment's text.
 *
 * Group boundaries are the markers themselves: a group runs from the end of the
 * previous marker to the start of the next. That is exactly how the reports
 * lay them out, and it is why the last-citation-only reading is wrong.
 */
export function parseHeadnoteDispositions(fullText: string): HeadnoteEntry[] {
  const out: HeadnoteEntry[] = [];
  MARKER.lastIndex = 0;
  let groupStart = 0;
  let m: RegExpExecArray | null;

  while ((m = MARKER.exec(fullText)) !== null) {
    const disposition = clean(m[1]).toLowerCase();
    const group = fullText.slice(groupStart, m.index);
    groupStart = m.index + m[0].length;

    /**
     * WALK BACKWARD FROM THE MARKER AND STOP AT THE FIRST NON-CASE ENTRY.
     *
     * The first version took the whole span between markers. That is only
     * correct while every marker is found, and one unterminated marker
     * (`– relied on` with no period, in Puttaswamy) made a single group reach
     * back across two paragraphs of prose and two earlier lists — reporting
     * Kihoto Hollohan and Tulsiram Patel as overruled.
     *
     * Walking backward removes the dependency entirely: prose does not parse
     * as a case entry, so the group ends where the list ends, whether or not
     * the preceding marker was recognised. A boundary derived from the text
     * beats a boundary derived from another regex having worked.
     */
    const parts = group.split(';');
    const collected: HeadnoteEntry[] = [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const entry = parseEntry(parts[i]!, disposition, i === parts.length - 1);
      if (!entry) break;
      collected.unshift(entry);
    }

    if (collected.length > 0) out.push(...collected);
  }
  return out;
}

/**
 * The concordance pairs — and **this half is sound while the disposition half
 * is not**, which is the single most important thing to know about this module.
 *
 * A pair is read from ONE entry's own text: `<name> [YYYY] N SCR P : (YYYY) N
 * SCC P`. It does not depend on where the group starts or which marker closed
 * it. Group boundary detection is still wrong in cases this parser has not
 * solved — Joseph Shine reports `E P Royappa` and `Navtej Singh Johar` as
 * overruled when they were relied on — but that error assigns the wrong
 * DISPOSITION to an entry; it does not corrupt the entry's own SCR↔SCC pairing.
 *
 * So: trust `concordancePairs`. Do NOT trust `disposition` without reading the
 * source text, which is why the CLI writes nothing.
 */
export function concordancePairs(entries: HeadnoteEntry[]): { name: string; scr: string; scc: string }[] {
  return entries
    .filter((e): e is HeadnoteEntry & { scr: string; scc: string } => Boolean(e.scr && e.scc))
    .map(({ name, scr, scc }) => ({ name, scr, scc }));
}
