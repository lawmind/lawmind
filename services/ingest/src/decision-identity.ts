/**
 * LCC — DECISION IDENTITY CANDIDATES. Conservative, and never a merge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE CASE THAT PROVED content_hash IS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 and LCC found *Chipade*: **one real Bombay decision held twice**, in two
 * source partitions, with different OCR. Two rows, two different `content_hash`
 * values, and every dedup in this repo keys on that hash — so the corpus holds
 * the same decision twice and believes it holds two.
 *
 * **One case is not grounds for fuzzy corpus collapse**, and this module is
 * built on that sentence. A similarity threshold applied to 18.7M documents
 * would merge a hundred thousand pairs on the strength of one anecdote, and the
 * cost of a wrong merge is an advocate finding their case filed under someone
 * else's name.
 *
 * So: **candidates, never merges.** This module produces links with a stated
 * strength and stated evidence. Nothing here writes to `judgments`, nothing
 * deletes, nothing rewrites a `content_hash`. Promotion of a candidate to a
 * canonical identity is a separate, deliberate act with its own review.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR STRENGTHS, AND ONLY THE TOP TWO ARE PROMOTABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   CNR_EXACT          Both rows carry the same CNR. The CNR is the eCourts
 *                      case identity: court establishment, filing number, year,
 *                      and a check. Two rows with one CNR are one case, and this
 *                      is the only strength that needs no corroboration.
 *
 *   CITATION_EXACT     Both rows carry the same neutral citation. A neutral
 *                      citation is assigned by the court to a DECISION, and
 *                      `judgments_neutral_citation_key` is already unique — so
 *                      this fires only across sources that populated it
 *                      differently, which is exactly the Chipade shape.
 *
 *   REGISTRY_STRONG    Same court, same judgment date, and the same NORMALISED
 *                      case number. Promotable only with a second signal,
 *                      because case-number formats collide across benches.
 *
 *   CAPTION_WEAK       Same court, same date, same normalised caption, and
 *                      DIFFERENT case numbers. **Never promotable.** This is the
 *                      common-order shape: one text, one day, one bench, and
 *                      hundreds of genuinely separate petitions. Collapsing it
 *                      would destroy the distinction that lets an advocate find
 *                      their own matter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NORMALISATION IS NARROW ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Punctuation, whitespace, case, and the handful of registry abbreviations that
 * are pure formatting. **No stemming, no token overlap, no edit distance.** Every
 * one of those turns a comparison that cannot produce a false positive into one
 * that can, and this module's entire value is that its top two strengths cannot.
 */

/** Strengths, strongest first. The order is load-bearing — see `PROMOTABLE`. */
export const STRENGTHS = [
  'CNR_EXACT',
  'CITATION_EXACT',
  'REGISTRY_STRONG',
  'CAPTION_WEAK',
] as const;
export type Strength = (typeof STRENGTHS)[number];

/**
 * The two a downstream process may act on without a human.
 *
 * `REGISTRY_STRONG` is deliberately excluded despite looking convincing: the
 * same court can issue `WP/1234/2021` from two different benches in the same
 * year, and a shared judgment date does not separate them.
 */
export const PROMOTABLE: readonly Strength[] = ['CNR_EXACT', 'CITATION_EXACT'];

export type IdentityRow = {
  id: string;
  court: string | null;
  caseNumber: string | null;
  judgmentDate: string | null;
  caseTitle: string | null;
  cnr: string | null;
  neutralCitation: string | null;
  contentHash: string | null;
  sourceUrl: string | null;
};

export type Candidate = {
  strength: Strength;
  aId: string;
  bId: string;
  /** The exact values that matched, so a reviewer needs no re-derivation. */
  evidence: Record<string, string | null>;
  /** True when the two rows' `content_hash` DIFFER — the Chipade shape. */
  hashesDiffer: boolean;
  /** True when the two rows came from different source partitions. */
  sourcesDiffer: boolean;
};

const strip = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();

/**
 * A case number, reduced to the characters that carry identity.
 *
 * `W.P.(C) No. 1234 of 2021`, `WP(C)/1234/2021` and `W P C 1234 2021` are the
 * same number printed by three registries. Everything that is punctuation or
 * spacing goes; nothing that is a letter or a digit does.
 *
 * The abbreviation table is FORMATTING ONLY. `CRLA` and `CRIMINALAPPEAL` are the
 * same words; `CRLA` and `CRLMA` are different case types and must never be
 * folded together, which is why nothing here truncates or prefix-matches.
 */
export function normaliseCaseNumber(raw: string | null): string | null {
  if (!raw) return null;
  let s = strip(raw);
  if (s.length === 0) return null;
  const expand: [RegExp, string][] = [
    [/^CRIMINALAPPEAL/, 'CRLA'],
    [/^CRIMINALREVISION/, 'CRLREV'],
    [/^CRIMINALMISCELLANEOUS/, 'CRLMISC'],
    [/^CIVILAPPEAL/, 'CA'],
    [/^WRITPETITION/, 'WP'],
    [/^SPECIALLEAVEPETITION/, 'SLP'],
    [/^FIRSTAPPEAL/, 'FA'],
    [/^SECONDAPPEAL/, 'SA'],
  ];
  for (const [re, to] of expand) s = s.replace(re, to);
  /* `OF` between the serial and the year is registry prose, not identity. */
  s = s.replace(/(\d)OF(\d{4})$/, '$1$2');
  /* So is `No.` before the serial. Caught by the test rather than foreseen:
   * `W.P.(C) No. 1234 of 2021` stripped to `WPCNO12342021` while
   * `WP(C)/1234/2021` stripped to `WPC12342021`, and the same number printed by
   * two registries did not compare equal. Anchored to a letter or a bracket on
   * the left and a digit on the right, so it can only ever remove a serial-number
   * label and never the tail of a case type. */
  s = s.replace(/(^|[A-Z)])NOS?(?=\d)/g, '$1');
  return s;
}

/**
 * A caption, reduced for comparison only.
 *
 * `VS`, `VERSUS` and `V` are the same word. Honorifics and the party-status
 * suffixes registries append (`AND ORS`, `AND ANR`, `ETC`) are dropped, because
 * one registry prints them and another does not for the same decision.
 *
 * This is the WEAKEST signal in the module and it is never promotable on its
 * own. Two different petitions against the same respondent on the same day
 * produce identical normalised captions constantly.
 */
export function normaliseCaption(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw
    .toUpperCase()
    .replace(/\b(VERSUS|VS\.?|V\.?)\b/g, ' V ')
    .replace(/\b(AND\s+)?(ORS|ANR|OTHERS|ANOTHER|ETC)\.?\b/g, ' ')
    .replace(/\b(SHRI|SMT|M\/S|MR|MRS|DR|THR|THROUGH)\.?\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 6) return null;
  return s;
}

/** The source partition a row came from, e.g. `court=3_22`. Null when unknown. */
export function sourcePartition(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  return /\/court=([^/]+)\//.exec(sourceUrl)?.[1] ?? null;
}

/**
 * Compare two rows and return the STRONGEST candidate link, or null.
 *
 * Strongest only. A pair that matches on CNR also matches on case number, and
 * emitting both would double-count every real duplicate in any tally.
 */
export function candidate(a: IdentityRow, b: IdentityRow): Candidate | null {
  if (a.id === b.id) return null;

  const common = {
    aId: a.id,
    bId: b.id,
    hashesDiffer:
      a.contentHash !== null && b.contentHash !== null && a.contentHash !== b.contentHash,
    sourcesDiffer: sourcePartition(a.sourceUrl) !== sourcePartition(b.sourceUrl),
  };

  if (a.cnr && b.cnr && a.cnr === b.cnr) {
    return { ...common, strength: 'CNR_EXACT', evidence: { cnr: a.cnr } };
  }

  if (a.neutralCitation && b.neutralCitation && a.neutralCitation === b.neutralCitation) {
    return {
      ...common,
      strength: 'CITATION_EXACT',
      evidence: { neutralCitation: a.neutralCitation },
    };
  }

  /* Everything below needs the same court and the same date. A decision is
   * delivered by one court on one day; two rows disagreeing on either are two
   * decisions, whatever else they share. */
  const sameCourtDate =
    a.court !== null &&
    a.court === b.court &&
    a.judgmentDate !== null &&
    a.judgmentDate === b.judgmentDate;
  if (!sameCourtDate) return null;

  const an = normaliseCaseNumber(a.caseNumber);
  const bn = normaliseCaseNumber(b.caseNumber);
  if (an !== null && an === bn) {
    return {
      ...common,
      strength: 'REGISTRY_STRONG',
      evidence: { court: a.court, judgmentDate: a.judgmentDate, caseNumber: an },
    };
  }

  const ac = normaliseCaption(a.caseTitle);
  const bc = normaliseCaption(b.caseTitle);
  if (ac !== null && ac === bc) {
    /* Different case numbers, same caption, same day: almost always a common
     * order across separate petitions, which is NOT one decision. Emitted so it
     * can be counted and excluded, never so it can be merged. */
    return {
      ...common,
      strength: 'CAPTION_WEAK',
      evidence: { court: a.court, judgmentDate: a.judgmentDate, caption: ac },
    };
  }

  return null;
}

/** Whether a candidate may be acted on without a person looking at it. */
export function isPromotable(c: Candidate): boolean {
  return PROMOTABLE.includes(c.strength);
}
