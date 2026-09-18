/**
 * Which statutory sections a judgment actually discusses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * *"Cases on section 138 NI Act"* is the archetypal advocate query and we could
 * not answer it at all. 845 acts and 34,928 sections are ingested; the link from
 * a judgment to the provisions it turns on was never built.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THAT DECIDES EVERYTHING: NO ACT, NO RECORD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A bare *"section 5"* is not a statutory reference. In this corpus it is as
 * likely to be a clause of a contract, a rule of a scheme, or the judgment's own
 * numbering. Recording it under a guessed default act would put confident wrong
 * rows into the index — **worse than an empty index, because an empty one is
 * visibly empty** and a wrong one is not.
 *
 * So an act must be named beside the section, and the forms below were read off
 * the corpus rather than imagined:
 *
 *     u/s.138 of the NI Act
 *     s.138 of the Negotiable Instruments Act, 1881
 *     s. 138 of N. I. Act r/w s.357(3) CrPC
 *     Section 317 of the Code of Criminal Procedure, 1973
 *     Section 3(1)(b) of the Punjab Municipal Act, 1911
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT ATTEMPTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The reports also print the act as a HEADER above a run of sections —
 * `NEGOTIABLE INSTRUMENTS ACT, 1881: A B s. 138 …` — and a bare `u/s 482`
 * hundreds of characters later still belongs to it. Carrying a header down the
 * page would roughly double the yield and would attach an act to sections by
 * proximity rather than by statement. **That is a guess wearing the shape of a
 * fact**, and it is left out until it can be measured against a checked sample.
 */

/**
 * Abbreviations Indian judgments use constantly, mapped to the act as it should
 * be recorded. Matching is on the abbreviation as written, spacing and stops
 * being unreliable in a scanned corpus (`N. I. Act`, `NI Act`, `N.I. Act`).
 *
 * **BNS, BNSS and BSA are here and must stay.** They replaced the IPC, CrPC and
 * Evidence Act on 1 July 2024, no frontier model knows them, and a judgment
 * decided after that date cites them by these names.
 */
const ABBREVIATIONS: readonly { re: RegExp; act: string }[] = [
  { re: /\bN\.?\s?I\.?\s+Act\b/i, act: 'Negotiable Instruments Act, 1881' },
  { re: /\bCr\.?\s?P\.?\s?C\.?\b/i, act: 'Code of Criminal Procedure, 1973' },
  { re: /\bC\.?\s?P\.?\s?C\.?\b/i, act: 'Code of Civil Procedure, 1908' },
  { re: /\bI\.?\s?P\.?\s?C\.?\b/i, act: 'Indian Penal Code, 1860' },
  { re: /\bBNSS\b/i, act: 'Bharatiya Nagarik Suraksha Sanhita, 2023' },
  { re: /\bBNS\b/i, act: 'Bharatiya Nyaya Sanhita, 2023' },
  { re: /\bBSA\b/i, act: 'Bharatiya Sakshya Adhiniyam, 2023' },
  { re: /\bNDPS\s+Act\b/i, act: 'Narcotic Drugs and Psychotropic Substances Act, 1985' },
  { re: /\bEvidence\s+Act\b/i, act: 'Indian Evidence Act, 1872' },
  { re: /\bMV\s+Act\b/i, act: 'Motor Vehicles Act, 1988' },
  { re: /\bArbitration\s+Act\b/i, act: 'Arbitration and Conciliation Act, 1996' },
  { re: /\bCompanies\s+Act\b/i, act: 'Companies Act' },
  { re: /\bConstitution\b/i, act: 'Constitution of India' },
];

/**
 * A named act in full: `Negotiable Instruments Act, 1881`, `Code of Criminal
 * Procedure, 1973`, `Punjab Municipal Act, 1911`.
 *
 * The year is optional because judgments often omit it, but the word `Act`,
 * `Code`, `Sanhita` or `Adhiniyam` is not — that word is the whole reason this
 * is a statute reference and not a sentence.
 */
const FULL_ACT = new RegExp(
  [
    '\\b(',
    // `Code of Criminal Procedure, 1973` — the words come AFTER "Code", so a
    // pattern ending at the keyword captures only "Code". Read off a real
    // failure, not anticipated.
    "(?:Code\\s+of\\s+(?:[A-Z][\\w'-]*\\s*){1,4}(?:,\\s*\\d{4})?",
    // `Negotiable Instruments Act, 1881` · `Indian Penal Code` — here the words
    // come BEFORE the keyword. `Code` belongs in BOTH branches: it leads in
    // "Code of Criminal Procedure" and trails in "Indian Penal Code", and
    // dropping it from this one silently lost every IPC reference written out
    // in full.
    "|(?:[A-Z][\\w'-]*\\.?\\s+){1,6}(?:Act|Code|Sanhita|Adhiniyam)(?:\\s*,?\\s*\\d{4})?",
    '|Constitution(?:\\s+of\\s+India)?)',
    ')',
  ].join(''),
);

/**
 * `section 138` · `s.138` · `u/s 482` · `Sec. 302A` · `s. 3(1)(b)`.
 *
 * The sub-clause in `3(1)(b)` is deliberately NOT captured: an advocate
 * searching `section 3` expects judgments on section 3, and splitting the index
 * by sub-clause would make the common search miss most of them.
 */
const SECTION = /\b(?:u\/s|under\s+section|section|sections|sec|ss|s)\.?\s*(\d{1,3}[A-Z]{0,3})\b/gi;

/** How far after a section number an act may be named and still govern it. */
const ACT_WINDOW = 70;

/**
 * One act, one key — because the corpus names the same statute several ways.
 *
 * **Measured on the first full scan, before anything was written:** `Indian
 * Penal Code, 1860` 10,677 times and `Indian Penal Code` 3,300; `Code of
 * Criminal Procedure, 1973` 9,895, `Code of Criminal Procedure` 3,062 and
 * `Criminal Procedure Code` 1,426. A search for one of those would silently miss
 * the others — an advocate asking for cases on CrPC s.482 would see a third of
 * them and have no way to know.
 *
 * **The verbatim name is still stored.** How a court named an act is itself
 * searchable and is evidence for improving this map; the key is for matching,
 * exactly as `judge_key` is beside `judge_name`.
 *
 * The rules are: drop a leading `The`, drop a trailing year, then apply the
 * handful of reorderings Indian practice actually uses (`Criminal Procedure
 * Code` and `Code of Criminal Procedure` are the same statute).
 */
const ACT_SYNONYMS: readonly { re: RegExp; key: string }[] = [
  { re: /^(?:INDIAN\s+)?PENAL\s+CODE$|^IPC$/, key: 'INDIAN PENAL CODE' },
  {
    re: /^(?:CODE\s+OF\s+)?CRIMINAL\s+PROCEDURE(?:\s+CODE)?$|^CRPC$/,
    key: 'CODE OF CRIMINAL PROCEDURE',
  },
  { re: /^(?:CODE\s+OF\s+)?CIVIL\s+PROCEDURE(?:\s+CODE)?$|^CPC$/, key: 'CODE OF CIVIL PROCEDURE' },
  { re: /^(?:INDIAN\s+)?EVIDENCE\s+ACT$/, key: 'INDIAN EVIDENCE ACT' },
  { re: /^(?:NEGOTIABLE\s+INSTRUMENTS?\s+ACT|NI\s+ACT)$/, key: 'NEGOTIABLE INSTRUMENTS ACT' },
  { re: /^CONSTITUTION(?:\s+OF\s+INDIA)?$/, key: 'CONSTITUTION OF INDIA' },
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE 2023 CODES — added 22 Aug 2026, and NOT a new mapping
   * ───────────────────────────────────────────────────────────────────────────
   *
   * {@link ABBREVIATIONS} above already states that `BNS`, `BNSS` and `BSA` are
   * these three statutes, and its comment says they "must stay". This table
   * never got the matching entries, so the two halves of one module disagreed:
   * extraction expanded `BNS` to `Bharatiya Nyaya Sanhita, 2023` and stored
   * `act_key = 'BHARATIYA NYAYA SANHITA'`, while `canonicalAct('BNS')` — what a
   * SEARCH passes — returned the literal string `BNS`.
   *
   * **Measured on the live corpus before the fix:** the canonical keys hold
   * 121,502 BNSS references, 20,440 BNS and 444 BSA. An advocate searching
   * `act:BNS` matched none of the 20,440, and nothing errored — the query
   * simply found the corpus empty on the code that replaced the IPC.
   *
   * No legal knowledge is invented here. The abbreviation-to-title pairs are
   * the ones already in this file; these lines only make the matching key agree
   * with the key extraction writes.
   *
   * `BHARTIYA` is a transliteration variant of the same word in the same title,
   * printed by the courts themselves — 2,857 references. Folding it is a
   * SPELLING merge, which is what this table is for, and not the statute merge
   * the note above forbids.
   */
  /**
   * **Matched on the ENDING BIGRAM, not on the full title, and the shape was
   * chosen by measurement rather than by taste.** The courts transliterate
   * these titles 498 different ways in this corpus — `BHARTIYA NAGRIK`,
   * `BHARATIYA NAGARIKA`, `BHARATIYER`, and hundreds more one-off OCR
   * manglings. Anchoring on the full title recovers the head and abandons the
   * tail; anchoring on the two words that IDENTIFY the statute recovers both.
   *
   * Checked against every distinct `act_key` in the corpus before being
   * written: the three rules claim 21,167 / 129,073 / 496 references,
   * **overlap on exactly zero keys**, and refuse `MADHYA PRADESH RAJYA
   * SURAKSHA ADHINIYAM`, `CHHATTISGARH PANCHAYAT RAJ ADHINIYAM` and
   * `NAGAR TATHA GRAM NIVESH ADHINIYAM` — different statutes that share a
   * word with these and must never merge into them. That refusal is the
   * property being tested; the recovery is the by-product.
   *
   * `SURAKSHA ADHINIYAM` therefore does NOT reach BNSS: the discriminating
   * word is `SANHITA`, and several state security Acts end in `ADHINIYAM`.
   */
  {
    re: /(?:^|\s)NYAYA?A?\s+SANHITA(?:\s+ACT)?$|^BNS$/,
    key: 'BHARATIYA NYAYA SANHITA',
  },
  {
    re: /(?:^|\s)SURAK\w*\s+SANHITA(?:\s+ACT)?$|^BNSS$/,
    key: 'BHARATIYA NAGARIK SURAKSHA SANHITA',
  },
  {
    re: /(?:^|\s)SAK\w*\s+ADHINIYAM(?:\s+ACT)?$|^BSA$/,
    key: 'BHARATIYA SAKSHYA ADHINIYAM',
  },
];

/**
 * The matching key for an act name.
 *
 * Deliberately conservative: anything not in {@link ACT_SYNONYMS} keeps its
 * cleaned name rather than being folded into something that looks similar.
 * **Merging two different statutes would be far worse than failing to merge two
 * spellings of one** — the first returns the wrong law, the second returns less
 * of the right law.
 */
export function canonicalAct(actNamed: string): string {
  const cleaned = actNamed
    .toUpperCase()
    .replace(/^THE\s+/, '')
    .replace(/\s*,?\s*\d{4}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const s of ACT_SYNONYMS) if (s.re.test(cleaned)) return s.key;
  return cleaned;
}

export type SectionRef = {
  /** As written, upper-cased: `138`, `302A`. */
  readonly section: string;
  /** The act as this judgment named it — kept verbatim, not canonicalised away. */
  readonly actNamed: string;
  readonly offset: number;
};

/**
 * Pull every section reference that names its act.
 *
 * Returns one entry per sighting; the caller folds them into counts. **A
 * judgment yielding nothing is normal** — many decide facts rather than
 * provisions.
 */
export function extractSectionRefs(text: string): SectionRef[] {
  const out: SectionRef[] = [];
  SECTION.lastIndex = 0;

  for (const m of text.matchAll(SECTION)) {
    const section = (m[1] ?? '').toUpperCase();
    if (!section) continue;
    const end = (m.index ?? 0) + m[0].length;
    const after = text.slice(end, end + ACT_WINDOW).replace(/\s+/g, ' ');

    /**
     * **The act must come first in the window.** `s.138 of the NI Act r/w
     * s.357(3) CrPC` names two acts; the one governing 138 is the nearer, and
     * taking the later one would file a Negotiable Instruments case under the
     * criminal procedure code.
     */
    let best: { act: string; at: number } | null = null;

    for (const a of ABBREVIATIONS) {
      const hit = a.re.exec(after);
      if (hit && (best === null || hit.index < best.at)) best = { act: a.act, at: hit.index };
    }
    const full = FULL_ACT.exec(after);
    if (full?.[1] && (best === null || full.index < best.at)) {
      best = { act: full[1].replace(/\s+/g, ' ').trim(), at: full.index };
    }

    if (!best) continue;

    /**
     * Only if the act is introduced — `of the`, `of`, `under`, `r/w`, or simply
     * adjacent. Without this, `section 5 … the Court held the Act applied` pairs
     * a section with an act named in a different clause.
     *
     * **Sub-clauses are allowed to sit in the gap**, because they routinely do:
     * `Section 3(1)(b) of the Punjab Municipal Act` and `s.357(3) CrPC` are both
     * real, and both were refused before this allowance — the first losing a
     * whole judgment's provisions, the second silently filing a criminal
     * procedure section under the Negotiable Instruments Act because only the
     * nearer section matched.
     */
    const between = after.slice(0, best.at);
    if (
      !/^[\s,]*(?:\([\dA-Za-z]{1,4}\)\s*)*(?:of\s+(?:the\s+)?|under\s+(?:the\s+)?|r\/w\s*|,\s*)?$/i.test(
        between,
      )
    ) {
      continue;
    }

    out.push({ section, actNamed: best.act, offset: m.index ?? 0 });
  }

  return out;
}

/** Fold sightings into one row per (act, section), with a count and first offset. */
export function foldSectionRefs(
  refs: readonly SectionRef[],
): { actNamed: string; section: string; occurrences: number; firstOffset: number }[] {
  const map = new Map<
    string,
    { actNamed: string; section: string; occurrences: number; firstOffset: number }
  >();
  for (const r of refs) {
    const key = `${r.actNamed.toUpperCase()}|${r.section}`;
    const prev = map.get(key);
    if (prev) prev.occurrences++;
    else
      map.set(key, {
        actNamed: r.actNamed,
        section: r.section,
        occurrences: 1,
        firstOffset: r.offset,
      });
  }
  return [...map.values()];
}
