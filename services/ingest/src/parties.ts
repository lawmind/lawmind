/**
 * Structured party extraction — `docs/ai/LEGAL_STRUCTURE.md`, Stage 5 of the
 * DATA → RETRIEVAL EXECUTION PROGRAM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO METHODS, NOT ONE, AND THE DIFFERENCE IS REAL — measured, not assumed
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SciMetadataRow` (Supreme Court source metadata) already carries
 * `petitioner`/`respondent` as separate fields — sampled 795 rows from the
 * public 2018 metadata file, 0 blank on either side, and `title` is
 * `petitioner + " versus " + respondent` verbatim in every one. **This field
 * was never threaded into `JudgmentRecord`** (`sci.ts`'s `toJudgment` reads
 * only `row.title`) — the same class of gap as the `cnr` column found dropped
 * for the whole corpus, task 007. `source_metadata` extraction is preferred
 * wherever available: it is what the court itself filed, not a string this
 * codebase re-derived.
 *
 * High Court source metadata (`HcMetadataRow`, the plain variant — the only
 * variant actually held, `docs/ai/DATA_MOAT_PROGRAM.md` §6) carries no
 * petitioner/respondent field at all. For every High Court row, and any
 * Supreme Court row lacking source metadata, `title_parsed` — deterministic
 * separator splitting of `case_title` — is the only available method.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT title_parsed REFUSES TO DO, because 64 real corpus rows demanded it
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A corpus-wide check found 64 of 79,322 `case_title` values (0.08%) with no
 * recognisable separator, or a separator with an empty side:
 *
 *   "Vs"                                          — both sides absent
 *   "SATTO YADAV Vs"                               — respondent absent
 *   "Vs M/S.ZU-ZU WIRES LTD."                       — petitioner absent
 *   "IN RE: ALARMING RISE IN ... versus"            — genuine suo motu / reference
 *                                                      matter; the source itself
 *                                                      states no second party
 *
 * Every one of these is an honest absence in the SOURCE, not a parser defect
 * — confirmed by reading the rows, not inferred from the count. Returning a
 * fabricated respondent for "SATTO YADAV Vs" would be worse than returning
 * null: `docs/CANONICAL_IDENTITY.md`'s "never destroy provenance" rule
 * extends here — a party this module cannot read stays `null`, and the raw
 * `case_title` remains the record of what the source actually said.
 */

export type PartyExtractionMethod = 'source_metadata' | 'title_parsed' | 'unknown';

export type PartyExtraction = {
  petitioner: string | null;
  respondent: string | null;
  method: PartyExtractionMethod;
};

/**
 * Ordered most specific to least, matching this codebase's existing pattern
 * (`paragraph-refs.ts` PATTERNS) — stop at the first that matches so a title
 * containing more than one candidate separator is not double-split.
 *
 * Measured corpus-wide, `~*`/`~` via `[[:space:]]` character classes (a plain
 * `\s` inside a JS string is silently dropped before it reaches Postgres —
 * `docs/CURRENT_PLAN.md` Q1.0b hit this exact defect for `\d`; this module's
 * own survey re-derived it independently rather than trusting memory):
 * `versus` 38,324 rows (Supreme Court's own separator) · `Vs`/`Vs.` 40,933
 * (High Court) · bare `V.` 377 (a handful of older Supreme Court titles).
 */
/**
 * Zero-width boundaries, not `\s+` on both sides — a title with an empty
 * petitioner or respondent ("Vs", "SATTO YADAV Vs") has no whitespace to
 * require at the string's own start or end, and the first version of this
 * module returned `unknown` for exactly the rows its own docstring names as
 * the reason `title_parsed` exists. Caught by this file's own test suite,
 * not by inspection.
 */
const SEPARATORS: { method: 'versus' | 'vs' | 'v'; re: RegExp }[] = [
  { method: 'versus', re: /(?<=^|\s)versus(?=\s|$)/i },
  { method: 'vs', re: /(?<=^|\s)Vs\.?(?=\s|$)/ },
  { method: 'v', re: /(?<=^|\s)V\.(?=\s|$)/ },
];

/** Blank, or nothing but punctuation/whitespace — a lone "." is not a party name. */
function isMeaningless(value: string): boolean {
  return value.trim().length === 0 || !/[a-zA-Z0-9]/.test(value);
}

const clean = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return isMeaningless(trimmed) ? null : trimmed;
};

/**
 * The preferred method: source metadata the court itself filed, not a string
 * this codebase re-derives. Callers pass `null`/`undefined` when the source
 * row carries no such field (every held High Court row, today).
 */
export function partiesFromSourceMetadata(
  petitioner: string | null | undefined,
  respondent: string | null | undefined,
): PartyExtraction | null {
  const p = clean(petitioner);
  const r = clean(respondent);
  if (p === null && r === null) return null;
  return { petitioner: p, respondent: r, method: 'source_metadata' };
}

/**
 * Fallback: deterministic separator split of `case_title`. Returns a
 * `'title_parsed'` result whenever ANY separator matches, even if one side
 * comes back null — a genuine partial extraction is still `title_parsed`,
 * not `unknown`, because the method DID run and DID find a boundary. Returns
 * `'unknown'` only when no recognised separator is present at all.
 */
export function extractPartiesFromTitle(caseTitle: string): PartyExtraction {
  for (const { re } of SEPARATORS) {
    const match = re.exec(caseTitle);
    if (!match) continue;
    const petitioner = clean(caseTitle.slice(0, match.index));
    const respondent = clean(caseTitle.slice(match.index + match[0].length));
    return { petitioner, respondent, method: 'title_parsed' };
  }
  return { petitioner: null, respondent: null, method: 'unknown' };
}

/**
 * The single entry point a loader/backfill should call: source metadata
 * first, `case_title` parsing second, `unknown` last. Never guesses beyond
 * what one of the two deterministic methods above already refused to.
 */
export function extractParties(input: {
  caseTitle: string;
  sourcePetitioner?: string | null | undefined;
  sourceRespondent?: string | null | undefined;
}): PartyExtraction {
  const fromSource = partiesFromSourceMetadata(input.sourcePetitioner, input.sourceRespondent);
  if (fromSource !== null) return fromSource;
  return extractPartiesFromTitle(input.caseTitle);
}
