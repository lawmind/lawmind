/**
 * Citation extraction — the judgment-to-judgment edges the corpus never had.
 *
 * `judgments.overruled_status` is `none` on all 38,341 rows and
 * `overruled_by_judgment_id` is null on all of them, so nothing in the product
 * can currently show that the law has moved. `docs/CITATION_HARNESS.md` names
 * this exact state in its blind-spots section: a corpus that never learned an
 * overruling reads 0.0% stale while advocates see stale badges, because both
 * sides of the comparison agree. This module is what makes those edges exist.
 *
 * Two rules govern everything here, and both come from the harness:
 *
 * 1. **Never invent an edge.** A citation that does not resolve EXACTLY against a
 *    stored `neutral_citation` or `reporter_citations` entry stays unresolved. A
 *    fuzzy match would be a fabricated statement about what one court said of
 *    another, which is the failure this product exists to prevent.
 *
 * 2. **Never infer a relationship without evidence.** Whether a later bench
 *    *followed* or *overruled* an authority is a legal reading, not a string
 *    match. Where a signal phrase is present next to the citation we record the
 *    relationship AND the phrase that justified it, so any row can be audited
 *    back to its own text. Where no phrase is present the relationship is
 *    `cites` — mechanically true and claiming nothing more.
 */

/** A citation found in a judgment's text, before resolution. */
export type ExtractedCitation = {
  /** Exactly as it appeared, for provenance. */
  raw: string;
  /** Comparison form — see `normaliseCitation`. */
  normalised: string;
  /** Character offset into the source text; lets a row point back at its span. */
  offset: number;
};

export type Relationship =
  | 'cites'
  | 'followed'
  /**
   * Its own printed word, its own relationship — split from `followed`
   * 11 Aug 2026, Stage 7 (`docs/ai/CITATION_GRAPH_STAGE7.md`). Kept
   * consistent with `treatment.ts`'s `Relationship`, the second classifier
   * (`citator-cli.ts`) that reads the same column.
   */
  | 'approved'
  | 'distinguished'
  | 'doubted'
  | 'overruled'
  /**
   * "overruled to an extent", "overruled in part", "partly overruled".
   *
   * Kept separate from `overruled` because the consequence differs sharply:
   * `overruled` maps to `set_aside`, which is the ONE state that disables
   * add-to-matter, and refusing an advocate an authority that is still partly
   * good law is a real harm. `SCHEMA_TRUTH.md` requires `overruled_paras` for
   * `partly_set_aside`, and a bare "to an extent" does not say which paragraphs
   * fell — so this relationship is recorded and the status back-fill skips it
   * rather than asserting a precision we do not have.
   */
  | 'overruled_in_part';

export type TreatmentSignal = {
  relationship: Relationship;
  /** The phrase that justified it. Stored so the row is auditable. */
  evidence: string;
};

/**
 * Indian citation formats, most specific first.
 *
 * Deliberately narrow. Each pattern anchors on a reporter abbreviation that only
 * appears in a citation, so ordinary prose cannot match. Broadening these to
 * catch more citations would trade precision for recall in the one place this
 * product cannot afford it.
 */
const PATTERNS: readonly RegExp[] = [
  // Neutral: 2024 INSC 123 — the Supreme Court's own, and unambiguous.
  /\b(\d{4})\s+INSC\s+(\d{1,5})\b/g,
  /**
   * High Court neutral citations — `2023:DHC:2720`, `2023:KHC-D:1`,
   * `2023:DHC:2073-DB`.
   *
   * **Added 11 Aug 2026, BEFORE the High Court pass needs it rather than after.**
   * That pass streams AWS PDFs year by year and has so far processed **2016
   * only** (263,783 documents). Neutral citations begin in **2023**, so the
   * years where this matters are still ahead — and the pass records every
   * document it has read, including the ones that yield nothing, so a form it
   * cannot see would be recorded as "no citations here" and **never re-read**.
   * The blind spot would have been permanent and silent, which is precisely the
   * shape of the SCC bracket defect fixed earlier tonight.
   *
   * **Why this matters more than an ordinary recall gain.** `CURRENT_PLAN.md`
   * §Q2 names citability as the first of two questions blocking the High Court
   * ingest: *"Neither AWS metadata variant has a citation column. A High Court
   * judgment ingested from that bucket is searchable and not citable."* A
   * neutral citation is printed **in the judgment's own text**, so for 2023
   * onward it needs no metadata column at all. It does not answer the question
   * for older years, and it is not the founder's decision to make — but it
   * changes what that decision is about.
   *
   * **The format is from the courts, not from us:** Delhi HC (`YEAR:DHC:NUMBER`,
   * `-DB` for a division bench), Karnataka HC (`2023:KHC:1`, benches
   * `2023:KHC-D:1` and `2023:KHC-K:1`), and the corresponding Gujarat, MP and
   * Meghalaya circulars. **NOT yet observed in our own corpus** — the pass has
   * not reached 2023 — so this is verified against the issuing courts'
   * notices and not against our data. Recheck the first 2023 batch.
   *
   * ──────────────────────────────────────────────────────────────────────────
   * NEW2 R20. THE WORD BOUNDARY MOVED OFF THE SUFFIX AND ONTO THE NUMBER
   * ──────────────────────────────────────────────────────────────────────────
   *
   * It used to read `(?:-(?:DB|FB))?\b`. On `2025:DHC:8491-DBThis Court held`
   * the `B|T` pair is not a word boundary, so the `-DB` alternative FAILS; the
   * group is optional, so it matches EMPTY; and the `\b` then succeeds against
   * the hyphen after `8491`, because a digit followed by a hyphen IS a
   * boundary. The regex never errors — it silently returns a DIFFERENT,
   * valid-looking citation key, and where the page also prints the citation
   * cleanly the same document yields TWO keys for ONE authority.
   *
   * `-DB` (division bench) and `-FB` (full bench) are printed by the issuing
   * court as part of the citation — the two alternatives this rule already
   * enumerates. Prose fused onto the end of the token by a PDF text extractor
   * is not part of the token and cannot retroactively shorten it.
   *
   * This is the SECOND copy of the defect. NEW2 R18 fixed the first, in
   * `harvest/hc-load.ts`, and deliberately left this one: it feeds
   * `judgment_citations.normalised_citation`, i.e. the edge key space, while
   * `CITATION_BULK_APPLY = HOLD`. LCC R17 then showed this copy is the one
   * every API citation-input path runs — `classifyQuery`, the bare structured
   * lookup, `cite:` parsing and paragraph citation display all reach it
   * through `@lawmind/ingest/citations` — so the divergence was live on
   * `/search`, not only in ingest.
   *
   * Measured exhaustively over the frozen affected universe
   * `NEW2-R20-SHARED-BOUNDARY` (`docs/ai/new2-r20/`): every document holding
   * an unsuffixed neutral edge, which is a corpus-wide superset of what this
   * move can touch. Not one negative control changes — `-SB`, a case-type
   * tail, the hyphenated COURT token `KHC-D`, an over-long number, a spaced
   * suffix — and no observed glue tail could be a longer real suffix.
   *
   * FUTURE EXTRACTION ONLY. No stored citation, edge, alias or judgment is
   * rewritten by this change; the rows it would have read differently stay
   * quarantined in NEW2 R18/R19.
   */
  /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g,
  // (2019) 4 SCC 221 · (2019) 4 S.C.C. 221 · [2000] 5 SCC 573
  /[[(](\d{4})[\])]\s*(\d{1,3})\s*S\.?\s?C\.?\s?C\.?\s*(\d{1,5})\b/g,
  // 1996 (4) SCC 362 — year first, the reports' own house style
  /\b(\d{4})\s*\(\s*(\d{1,3})\s*\)\s*S\.?\s?C\.?\s?C\.?\s*(\d{1,5})\b/g,
  // AIR 1973 SC 1461
  /\bAIR\s+(\d{4})\s+SC\s+(\d{1,5})\b/g,
  // (1950) SCR 869 · [1950] SCR 869 · (1950) 1 SCR 869
  /[[(](\d{4})[\])]\s*(\d{1,3})?\s*S\.?\s?C\.?\s?R\.?\s*(\d{1,5})\b/g,
  // 1976 (1) SCR 906 — year first again, and the single largest recovery
  /\b(\d{4})\s*\(\s*(\d{1,3})\s*\)\s*S\.?\s?C\.?\s?R\.?\s*(\d{1,5})\b/g,
  // (2019) 5 SCALE 123
  /\((\d{4})\)\s*(\d{1,3})\s*SCALE\s*(\d{1,5})\b/g,
];

/**
 * Comparison form: uppercase, reporter punctuation removed, whitespace collapsed.
 *
 * `(2019) 4 S.C.C. 221`, `(2019) 4 SCC 221` and `(2019)4 SCC  221` are the same
 * citation typeset three ways. They must compare equal or the same authority
 * resolves inconsistently depending on which judgment quoted it.
 *
 * Digits and their order are never touched — `(2019) 4 SCC 221` and
 * `(2019) 4 SCC 212` are different cases.
 *
 * **The year-first rewrite is load-bearing, not cosmetic.** The reports print
 * the same citation as `1976 (1) SCR 906` and as `(1976) 1 SCR 906`, often in
 * one judgment. `judgment_citations_unique_edge` is keyed on
 * `normalised_citation`, so without folding one into the other the same
 * authority becomes TWO edges to the same judgment — a "cited by" list showing a
 * case twice and a treatment count that double-counts it. The rewrite moves only
 * the brackets; the year, volume and page keep their values and their order.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MISSING SPACE, FOUND BY NEW3 (bus 0499) AND MEASURED WIDER HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The header above promised `(2019)4 SCC  221` folds together, and it does. What
 * it did NOT handle is the space missing on the *reporter* side:
 * `(2017) 11SCR1036` and `(2017) 11 SCR 1036` are the same authority and
 * normalised to different keys, because whitespace was only ever COLLAPSED here,
 * never INSERTED. PDF extraction drops that space constantly.
 *
 * `resolve-cli`'s bulk sweep is immune — it strips every non-alphanumeric before
 * comparing — which is exactly why this survived: the nightly-style pass fixed
 * the symptom while the INLINE resolver in `citations-cli.ts` (`index.get(
 * c.normalised)`) kept missing them, so the defect only showed up as edges that
 * one path resolved and the other did not.
 *
 * **The token list is a CLOSED SET EXTRACTED FROM THE CORPUS, not a guess** —
 * `RING_PROGRAM.md`'s own rule, learned expensively on headnote dispositions.
 * Measured 15 Aug 2026 over unresolved `judgment_citations`:
 *
 *     SCC     1,749 digit-then-token · 1,588 token-then-digit
 *     SCR       450 digit-then-token ·   481 token-then-digit
 *     SCALE      19 digit-then-token ·    26 token-then-digit
 *     AIR · JT · CriLJ · SCC OnLine        ZERO, either side
 *
 * NEW3 reported the SCR half; **SCC is roughly 3.5x larger and was not in their
 * measurement.** Only these three are handled: a generic "insert a space before
 * any letter run" rule would rewrite neutral citations (`2023:DHC:2720`) and
 * anything else with a letter beside a digit, which is how a normaliser starts
 * merging authorities that are genuinely different.
 *
 * `SCC ONLINE` is unaffected: the rule inserts a space only between one of these
 * tokens and a DIGIT, and `ONLINE` is not a digit.
 *
 * ⚠ **DO NOT RE-RUN CITATION EXTRACTION OVER ALREADY-EXTRACTED JUDGMENTS UNTIL
 * THE STORED KEYS ARE BACKFILLED.** `judgment_citations_unique_edge` is keyed on
 * `normalised_citation`; rows written before this change hold the old unspaced
 * key. A re-extraction computes the new key, fails to find it in the `known` set
 * `citations-cli.ts` builds from stored rows, and inserts a SECOND edge for the
 * same authority — precisely the double-counting the year-first rewrite above
 * exists to prevent. The backfill must also handle two old keys collapsing onto
 * one new key, which is a unique-constraint conflict, not a no-op.
 * `docs/CURRENT_PLAN.md` Q1.60.
 */
const UNSPACED_REPORTERS = /(?<=[0-9])(SCC|SCR|SCALE)|(SCC|SCR|SCALE)(?=[0-9])/g;

export function normaliseCitation(raw: string): string {
  return (
    raw
      .toUpperCase()
      .replace(/[[\]]/g, (m) => (m === '[' ? '(' : ')'))
      .replace(/\./g, '')
      /* Insert BEFORE the collapse below, so a space added here and a space that
       * was already there end up identical rather than doubled. */
      .replace(UNSPACED_REPORTERS, (m) => ` ${m} `)
      .replace(/\s+/g, ' ')
      .replace(/\(\s*/g, '(')
      .replace(/\s*\)/g, ')')
      .replace(/\)(\S)/g, ') $1')
      .replace(/^(\d{4}) \((\d{1,3})\) /, '($1) $2 ')
      .trim()
  );
}

/** Every citation in a judgment's text, de-duplicated on first appearance. */
export function extractCitations(text: string): ExtractedCitation[] {
  const seen = new Map<string, ExtractedCitation>();
  for (const pattern of PATTERNS) {
    // Fresh lastIndex per call — these are module-level /g regexes and a shared
    // cursor would silently skip matches on the second judgment onward.
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[0].trim();
      const normalised = normaliseCitation(raw);
      if (!seen.has(normalised)) {
        seen.set(normalised, { raw, normalised, offset: match.index });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.offset - b.offset);
}

export type CitationGraphOccurrenceDisposition =
  'OUTGOING_CITATION_CANDIDATE' | 'COMMON_ORDER_PAGE_FURNITURE';

const HC_NEUTRAL_TOKEN = String.raw`\d{4}:[A-Z]{2,10}(?:-[A-Z]{1,3})?:\d{1,6}(?:-(?:DB|FB))?`;
const DIRECTLY_FOLLOWED_BY_COMMON_ORDER_STAMP = new RegExp(
  `^(?:${HC_NEUTRAL_TOKEN})+[ \\t]*\\r?\\nPage[ \\t]+\\d+\\b`,
);
const DIRECTLY_PRECEDED_BY_COMMON_ORDER_STAMP = new RegExp(`(?:${HC_NEUTRAL_TOKEN})$`);
const PAGE_LINE_AFTER = /^[ \t]*\r?\nPage[ \t]+\d+\b/;

/**
 * Decide whether one correctly parsed token is graph evidence.
 *
 * Exact citation search still calls `extractCitations` directly and is therefore
 * unchanged. This classifier is only for the judgment-to-judgment graph writer.
 * It rejects the exact Meghalaya common-order stamp shape reproduced in NEW2
 * R21: two or more neutral citations concatenated without a separator, followed
 * by the source page label. Court/date/title similarity is deliberately absent.
 */
export function classifyCitationGraphOccurrence(
  text: string,
  citation: ExtractedCitation,
): CitationGraphOccurrenceDisposition {
  const before = text.slice(Math.max(0, citation.offset - 80), citation.offset);
  const after = text.slice(
    citation.offset + citation.raw.length,
    citation.offset + citation.raw.length + 200,
  );
  const firstInStamp = DIRECTLY_FOLLOWED_BY_COMMON_ORDER_STAMP.test(after);
  const laterInStamp =
    DIRECTLY_PRECEDED_BY_COMMON_ORDER_STAMP.test(before) && PAGE_LINE_AFTER.test(after);
  return firstInStamp || laterInStamp
    ? 'COMMON_ORDER_PAGE_FURNITURE'
    : 'OUTGOING_CITATION_CANDIDATE';
}

/**
 * The court's OWN annotation of how it treated an authority.
 *
 * Reported Supreme Court judgments carry an explicit marker after a citation:
 *
 *   … 2005 INSC 498 : [2005] Supp. 4 SCR 223 : (2005) 8 SCC 383 – relied on.
 *   … [2023] 15 SCR 1081 : (2024) 6 SCC 1 – followed.
 *   … 1952 INSC 2 : [1952] 1 SCR 218 : (1952) 1 SCC 9 – referred to.
 *
 * That marker is primary source. It is what the reporter recorded the bench as
 * doing, and it is the only thing this module will treat as evidence.
 *
 * **This replaces a proximity heuristic that was measurably wrong.** Scanning 400
 * characters either side of a citation for phrases like "is set aside" produced
 * 33 overrulings in 300 judgments — against 143 explicit `overruled` markers in
 * the entire 38,341-judgment corpus, an over-fire of roughly 30x. The cause is
 * that *"the impugned order is hereby set aside"* is near-universal in Indian
 * judgments and routinely sits beside the citation block, so the phrase was read
 * as describing the cited authority when it described the order under appeal.
 * Spot-checking put a fabricated overruling on N.P. Ponnuswami (1952), which the
 * same passage marked "– referred to".
 *
 * A wrong edge here is a fabricated statement about what one court said of
 * another. `docs/CITATION_HARNESS.md` exists to prevent exactly that, so the bar
 * is an explicit annotation or nothing.
 */
const MARKERS: readonly { pattern: RegExp; relationship: Relationship }[] = [
  // Must precede the bare `overruled` test, or "overruled to an extent" is read
  // as a full overruling and the authority is wrongly disabled.
  {
    pattern: /overruled\s+(?:to an extent|in part)|partly\s+overruled/i,
    relationship: 'overruled_in_part',
  },
  { pattern: /overruled/i, relationship: 'overruled' },
  { pattern: /dissented\s+from/i, relationship: 'doubted' },
  { pattern: /doubted/i, relationship: 'doubted' },
  { pattern: /distinguished/i, relationship: 'distinguished' },
  { pattern: /relied\s+on/i, relationship: 'followed' },
  { pattern: /approved/i, relationship: 'approved' },
  { pattern: /followed/i, relationship: 'followed' },
  // "referred to" means the case was mentioned, NOT that it was treated. It is
  // the most common marker in the corpus by a wide margin and maps to `cites`.
  { pattern: /referred\s+to/i, relationship: 'cites' },
];

/** How far past a citation the marker may sit. */
const MARKER_WINDOW = 220;

/**
 * Matches the dash-and-marker that closes a Case Law Cited entry.
 *
 * **The dash may not follow a letter.** Measured 23 Aug 2026: 3 of the 61
 * `approved` edges in the corpus were the word *dis-approved*, whose internal
 * hyphen satisfied a bare `[-–—]` and stored the OPPOSITE of what the court
 * did. A closing annotation dash follows the citation, which ends in a digit or
 * a bracket — never in a letter — so the lookbehind costs nothing real and
 * removes the only polarity inversion found in the treatment population.
 */
const MARKER_RE =
  /(?<![A-Za-z])[-–—]\s*(overruled\s+(?:to an extent|in part)|partly\s+overruled|overruled|dissented\s+from|doubted|distinguished|relied\s+on|approved|followed|referred\s+to)\b/i;

/**
 * Reads the court's annotation following a citation.
 *
 * `end` is the offset just past the citation text. The marker is searched for
 * FORWARD only, because the annotation always trails its entry.
 *
 * Returns `cites` with no evidence when there is no annotation — the common and
 * correct case. Most citations in a judgment are references rather than
 * treatments, and labelling them otherwise overstates the record.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE ARE TWO TREATMENT WRITERS, AND A DIFF AGAINST ONE READS THE OTHER AS
 * CORRUPTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is one of them. The other is `readTreatment` in
 * `services/ingest/src/treatment.ts`, and their vocabularies are DIFFERENT ON
 * PURPOSE:
 *
 *   * this one — a dash plus ten markers, forward {@link MARKER_WINDOW} chars,
 *     run at EXTRACTION on every edge;
 *   * `readTreatment` — much wider (`relied upon`, `held overruled`, `held per
 *     incuriam`, `Not correct law`), with per-phrase negation, run by
 *     `citator-cli.ts` over RESOLVED edges only.
 *
 * `detectTreatment` cannot reproduce `readTreatment`'s vocabulary. NEW2 tried
 * (bus 1099): re-deriving all 16,001 treatment-bearing edges against this
 * function ALONE reported 1,680 rows "wrong", and applying that diff would have
 * **deleted 1,624 real treatment claims** — 56 of them adverse. Against BOTH
 * writers the real number is 19, and all 19 are one defect.
 *
 * So: never audit treatment against a single writer. If you are diffing, diff
 * against both, and a row only one of them explains is explained.
 * */
export function detectTreatment(text: string, end: number): TreatmentSignal {
  const ahead = text.slice(end, Math.min(text.length, end + MARKER_WINDOW));

  // A case name between this citation and the marker means the marker belongs to
  // a LATER entry in the list, not to this one. Parallel citations of the same
  // case carry no "v." between them, so this cleanly separates the two.
  const boundary = ahead.search(/\sv\.?s?\.?\s|\n\s*\n/i);
  const reachable = boundary === -1 ? ahead : ahead.slice(0, boundary);

  const found = MARKER_RE.exec(reachable);
  if (!found) return { relationship: 'cites', evidence: '' };

  const marker = found[1] ?? '';
  for (const m of MARKERS) {
    if (m.pattern.test(marker)) {
      // "referred to" is an annotation but not a treatment: record no evidence,
      // so `evidence` stays a field that only ever justifies a real relationship.
      if (m.relationship === 'cites') return { relationship: 'cites', evidence: '' };
      return { relationship: m.relationship, evidence: found[0].trim() };
    }
  }
  return { relationship: 'cites', evidence: '' };
}

/**
 * Every comparison form under which a judgment can be cited.
 *
 * A judgment carries one neutral citation and any number of reporter citations,
 * and a later court may use any of them. Indexing all of them is what lets
 * `AIR 1973 SC 1461` and `(1973) 4 SCC 225` resolve to the same row.
 */
export function citationKeys(judgment: {
  neutralCitation: string | null;
  reporterCitations: readonly string[];
}): string[] {
  const keys = new Set<string>();
  if (judgment.neutralCitation) keys.add(normaliseCitation(judgment.neutralCitation));
  for (const r of judgment.reporterCitations) {
    if (r.trim()) keys.add(normaliseCitation(r));
  }
  return [...keys];
}
