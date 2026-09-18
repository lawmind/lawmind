/**
 * Amendment history, out of the footnotes we have been storing and never reading.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STAGE 8 ASKS WHERE THE POINT-IN-TIME DATA WOULD COME FROM. WE ALREADY HAVE IT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/DATA_MOAT_PROGRAM.md` Stage 8 wants Act → provision → version →
 * amendment → commencement → repeal → substitution → notification → effective
 * date, and the standing instruction was to check whether indiacode publishes
 * amendment dates before assuming a new source is needed.
 *
 * It does, and we ingested it on the first pass. `statute_sections.footnote`
 * holds the bare act's own printed amendment notes, verbatim, for **9,064 of
 * 34,928 sections**. Nothing has ever parsed them. Measured against production
 * 11 Aug 2026:
 *
 *   substituted            5,432        contains "ibid"            3,103
 *   inserted / added       4,353          …and names no Act itself  1,651
 *   omitted                1,520        commencement notifications   517
 *   repealed                 154        cross-references, not events 107
 *   renumbered               152
 *
 * This module is pure: no database, no network. It turns one footnote into
 * events, and every rule below was written against footnotes read by hand
 * first — the discipline that caught a zero-width-boundary bug in `parties.ts`
 * and a blind spot in `citations.ts`, both of which had passing tests written
 * from the same assumption as the code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUR THINGS THE REAL DATA DOES THAT AN IMAGINED PARSER WOULD MISS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **1 · `ibid` is a back-reference and 1,651 sections depend on it.**
 *
 *     1. Subs. by Act 45 of 1965, s. 8, for clause (a) (w.e.f. 1-4-1966).
 *     2. Subs. by s. 8, ibid., for "enter any coal mine" (w.e.f. 1-4-1966).
 *
 * Entry 2 names no Act. `ibid` means *the same Act as the entry before it*, and
 * a parser that reads entries independently drops it or, far worse, attributes
 * it to whatever Act it finds next. Resolution walks BACKWARDS within the same
 * footnote only, and an `ibid` with nothing before it stays **unresolved** —
 * recorded as such, never guessed.
 *
 * **2 · Dates contain spaces.** `(w.e.f. 31- 10- 2019)` and `(w.e.f. 31-10- 2019)`
 * are real, from the Limitation Act and the Aadhaar Act. A tight
 * `[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}` matches 7,276 sections; tolerating internal
 * whitespace matches 7,330. **54 sections would have been silently missed** —
 * the "0 results is a finding" trap this program has hit repeatedly.
 *
 * **3 · Not every amendment has a date.** `Ins. by Act 11 of 1994, s. 12.`
 * carries no `w.e.f.` at all. That is the source being silent, not the parser
 * failing, and the effective date is **null** rather than the enactment date of
 * the amending Act — those are different facts and conflating them would date a
 * legal event with a guess. `docs/ai/CITATION_GRAPH_STAGE7.md` made the same
 * distinction for `statusRecordedAt`.
 *
 * **4 · Some footnotes are not amendments at all.**
 *
 *     See now the Land Acquisition Act, 1894 (1 of 1894).
 *     But see s. 36, infra, as to abatement of obstruction of easement.
 *
 * 107 of these. They are editorial cross-references. They produce no event, and
 * the footnote is recorded as **unparsed** so the number is visible rather than
 * absorbed into a silent zero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It does not reconstruct the historical text of a provision.** Knowing that
 * clause (a) was substituted on 1-4-1966 is not knowing what clause (a) said
 * before. indiacode publishes only the current text; the prior wording is
 * sometimes quoted in the footnote (`for "enter any coal mine or its office"`)
 * and usually is not. Storing a partial reconstruction as if it were the
 * provision as it stood would be the statutory equivalent of a fabricated
 * citation. The quoted fragment is kept verbatim in `substituted_text` and is
 * never assembled into a version of the section.
 *
 * **It does not classify state amendments.** `Delhi Act 12 of 2011` and
 * `W.B. Act 18 of 1990` appear, and a Central Act amended in one state does not
 * read the same in another. The prefix is captured verbatim in
 * `amending_act_raw` and is NOT resolved into a jurisdiction — that needs its
 * own hand-read sample, and guessing which prefixes are states would put
 * confident wrong rows in front of advocates.
 */

/** What happened to the provision. Every value was observed in the corpus. */
export type AmendmentEventType =
  | 'inserted'
  | 'substituted'
  | 'omitted'
  | 'renumbered'
  | 'repealed'
  /** A commencement notification — `vide notification No. S.O. 3118`. */
  | 'commenced';

export type AmendmentEvent = {
  /** The footnote's own printed number, so an event can be traced to its note. */
  ordinal: number;
  eventType: AmendmentEventType;
  /** `Act 45 of 1965`, `Delhi Act 12 of 2011` — verbatim, never normalised. */
  amendingActRaw: string | null;
  amendingActNumber: number | null;
  amendingActYear: number | null;
  /** The amending Act's own section, e.g. `8` from `s. 8`. */
  amendingSection: string | null;
  /** ISO `YYYY-MM-DD`, or null where the source states none. NEVER inferred. */
  effectiveDate: string | null;
  /** The prior wording, where the note quotes it. Never assembled into a version. */
  substitutedText: string | null;
  /** True when the Act came from a preceding entry via `ibid`. */
  ibidResolved: boolean;
  /** An `ibid` with no preceding entry to resolve against. Recorded, not dropped. */
  ibidUnresolved: boolean;
  /** The entry exactly as printed. The row is auditable without re-fetching. */
  verbatim: string;
};

export type FootnoteParse = {
  events: AmendmentEvent[];
  /**
   * Entries that carried no recognisable event. Kept so "how much did we fail
   * to read" is a query rather than a silence — the same reason
   * `fetchSections` reports `missing` instead of writing fewer rows.
   */
  unparsed: string[];
};

/**
 * Split a footnote into its printed entries.
 *
 * The marker is `N.` or `N` followed by whitespace. Digits are everywhere else
 * in these notes — `Act 99 of 1976`, `s. 12`, `(w.e.f. 1-8-1976)`, `sec. 3 (ii)`
 * — so position alone is not enough. Three constraints make it deterministic:
 *
 *  - the number must sit at the start of the note or directly after a `.` or `)`
 *    that closed the previous entry;
 *  - it must NOT follow a legal abbreviation that takes a number. **This is the
 *    one that matters**, and the first version of this function got it wrong:
 *    `s. 12` and a marker `2. ` are the *same shape* — digits preceded by
 *    ". " — so `1. Ins. by Act 99 of 1976, s. 12 (w.e.f. 1-8-1976).` split into
 *    two entries, the second beginning mid-sentence at `12`. Found by running
 *    the parser against real footnotes rather than by reasoning about it;
 *  - the numbers must form an INCREASING run. A footnote numbered 1, 2, 3 is
 *    real; a number that would come *before* the previous marker is text inside
 *    an entry, not a new one.
 *
 * The increasing-run rule is what makes this safe on the note that starts at
 * `3.` (observed — footnote numbering does not always begin at 1).
 */
/**
 * Abbreviations that are followed by a number in Indian legal drafting, so a
 * digit after one of them is an argument and never an entry marker. Read off
 * the corpus: `s. 12`, `sec. 3 (ii)`, `Sch. 2`, `cl. (a)`, `No. 15`, `Part II`.
 */
const NUMBER_TAKING_ABBREVIATION =
  /\b(?:s|ss|sec|secs|Sch|sch|cl|art|Art|No|no|r|para|Part|part|sub-s)\.$/;

export function splitFootnoteEntries(footnote: string): { ordinal: number; text: string }[] {
  const text = footnote.replace(/\s+/g, ' ').trim();
  if (text === '') return [];

  const marker = /(?:^|(?<=[.)]) )(\d{1,2})\.?\s+/g;
  const candidates: { ordinal: number; at: number; end: number }[] = [];
  for (const m of text.matchAll(marker)) {
    // `s. 12` is not entry 12. Checked against the text BEFORE the match rather
    // than with a lookbehind, so the abbreviation list stays readable.
    //
    // No `\s` at the end of that pattern: the marker regex's second branch
    // CONSUMES the separating space, so the preceding slice ends at `s.` and
    // not at `s. `. Requiring the space made this check match nothing at all —
    // a guard that silently never fires, which is worse than no guard. Verified
    // by printing the real candidate offsets, not by reading the regex again.
    if (NUMBER_TAKING_ABBREVIATION.test(text.slice(0, m.index))) continue;
    candidates.push({ ordinal: Number(m[1]), at: m.index, end: m.index + m[0].length });
  }

  const kept: typeof candidates = [];
  for (const c of candidates) {
    const last = kept[kept.length - 1];
    if (!last || c.ordinal > last.ordinal) kept.push(c);
  }

  // No numbering at all: the whole note is one entry. Common on short notes.
  if (kept.length === 0) return [{ ordinal: 1, text }];

  return kept.map((c, i) => ({
    ordinal: c.ordinal,
    text: text.slice(c.end, kept[i + 1]?.at ?? text.length).trim(),
  }));
}

/**
 * `(w.e.f. 1-8-1976)`, `(w.e.f. 01-07-2026)`, `(w.e.f. 31- 10- 2019)`.
 *
 * Whitespace is tolerated **inside** the date because the source prints it that
 * way — 54 sections hang on this. Day-first, which is how every observed note
 * writes it; a `13-1-2012` is 13 January and reading it month-first would be a
 * silently wrong legal date rather than an error.
 *
 * Returns null when the note states no date. Null is a real answer.
 */
export function effectiveDateFrom(entry: string): string | null {
  const m = /w\.e\.f\.\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})/i.exec(entry);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  // A malformed printed date is not a date. Better absent than wrong: this
  // value answers "was this in force when I filed".
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1830 || year > 2100) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Rejects 31-02-2019 and friends, which `Date` would silently roll forward.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== day) return null;
  return iso;
}

/**
 * `Act 45 of 1965`, `Delhi Act 12 of 2011`, `W.B. Act 18 of 1990`.
 *
 * The optional prefix is captured but NOT interpreted — see the module note on
 * why a state jurisdiction is not guessed from it.
 */
export function amendingActFrom(entry: string): {
  raw: string | null;
  number: number | null;
  year: number | null;
} {
  const m = /((?:[A-Z][A-Za-z.]*\.?\s+){0,3}Act)\s+(\d{1,3})\s+of\s+(\d{4})/.exec(entry);
  if (!m) return { raw: null, number: null, year: null };
  return { raw: m[0].replace(/\s+/g, ' ').trim(), number: Number(m[2]), year: Number(m[3]) };
}

/** `s. 8`, `s.13`, `s. 42` — the amending Act's own section. */
export function amendingSectionFrom(entry: string): string | null {
  const m = /\bs\.\s*(\d+[A-Z]*)/i.exec(entry);
  return m ? m[1]! : null;
}

/**
 * The prior wording, where the note quotes it: `for "enter any coal mine"`.
 *
 * Both quote styles occur — the corpus uses ASCII `"` and curly `“ ”` in the
 * same table. Kept verbatim and never assembled into a reconstructed version of
 * the section; see the module note.
 */
export function substitutedTextFrom(entry: string): string | null {
  const m = /\bfor\s+[“"]([^”"]+)[”"]/.exec(entry);
  return m ? m[1]!.trim() : null;
}

/**
 * Which event, if any. Order matters: `renumbered` is checked before the others
 * because the sentence that renumbers also inserts.
 *
 * Returns null for a note that is a cross-reference rather than an event.
 */
export function eventTypeFrom(entry: string): AmendmentEventType | null {
  const t = entry.toLowerCase();

  // `re-numbered` and `relettered` are as real as `renumbered`. Found by
  // running this parser over all 9,064 footnotes and READING what it failed
  // on — not one of these forms was in the 60-row hand sample.
  if (/\bre-?numbered\b|\bre-?lettered\b/.test(t)) return 'renumbered';
  if (/\brep\.\s*by\b/.test(t)) return 'repealed';

  // Every form below is printed in the corpus, and the punctuation is not
  // reliable: `Subs. by`, `Subs by`, `Subs. bys. 17` (no space at all), and
  // `Subs. ibid.` with no `by` whatsoever. Requiring `subs\.\s*by\b` silently
  // dropped all four of the last three.
  if (/\bomitted\s*,?\s*(by|ibid)\b/.test(t)) return 'omitted';
  if (/\bsubs\.?\s*,?\s*(by|ibid)/.test(t) || /\bsubstituted\s+by\b/.test(t)) return 'substituted';
  if (/(^|[^a-z])(ins\.?|inserted|added)\s*,?\s*(by|ibid)/.test(t)) return 'inserted';

  // A commencement note names a notification rather than an amending Act.
  if (/\bvide\s+notif/.test(t)) return 'commenced';
  return null;
}

/**
 * One footnote → its events.
 *
 * `ibid` resolution walks backwards through the entries of THIS footnote only.
 * An `ibid` with nothing before it to resolve against is emitted with
 * `ibidUnresolved: true` and a null Act — visible, and never attributed to an
 * Act named further down the note, which would be a confident wrong answer.
 */
export function parseFootnote(footnote: string): FootnoteParse {
  const events: AmendmentEvent[] = [];
  const unparsed: string[] = [];
  let lastAct: { raw: string; number: number; year: number } | null = null;

  for (const entry of splitFootnoteEntries(footnote)) {
    const eventType = eventTypeFrom(entry.text);
    if (eventType === null) {
      unparsed.push(entry.text);
      continue;
    }

    const own = amendingActFrom(entry.text);
    const saysIbid = /\bibid\b/i.test(entry.text);

    let raw = own.raw;
    let number = own.number;
    let year = own.year;
    let ibidResolved = false;
    let ibidUnresolved = false;

    if (own.raw !== null) {
      lastAct = { raw: own.raw, number: own.number!, year: own.year! };
    } else if (saysIbid && lastAct) {
      raw = lastAct.raw;
      number = lastAct.number;
      year = lastAct.year;
      ibidResolved = true;
    } else if (saysIbid) {
      ibidUnresolved = true;
    }

    events.push({
      ordinal: entry.ordinal,
      eventType,
      amendingActRaw: raw,
      amendingActNumber: number,
      amendingActYear: year,
      amendingSection: amendingSectionFrom(entry.text),
      effectiveDate: effectiveDateFrom(entry.text),
      substitutedText: substitutedTextFrom(entry.text),
      ibidResolved,
      ibidUnresolved,
      verbatim: entry.text,
    });
  }

  return { events, unparsed };
}
