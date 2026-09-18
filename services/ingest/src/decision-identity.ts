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
 *   CNR_EXACT          Same CNR **and same judgment date**.
 *
 *                      The date half is not decoration and it was added after a
 *                      measurement, not before one. A CNR identifies a CASE, not
 *                      a DECISION: one case produces interim orders, an
 *                      injunction, a final judgment, each a separate row with a
 *                      separate date, all correctly sharing one CNR.
 *
 *                      Measured 21 Aug 2026: **336,209 CNRs are carried by more
 *                      than one row, involving 1,072,353 rows, and 272,095 of
 *                      those groups have differing content hashes.** On CNR
 *                      alone this module would have called all of them the same
 *                      decision. Overwhelmingly they are the same CASE at
 *                      different stages, which is the corpus being right.
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
  /* Not weaker than the others — a DIFFERENT relation. These two rows are one
   * case at two stages, which is a timeline edge and never a duplicate. */
  'SAME_CASE_DIFFERENT_DATE',
  /* Same case, dates exactly one day apart. Almost certainly ONE decision whose
   * date is wrong on one side — NEW2's measured off-by-one — but the module
   * refuses to decide that on its own. See `ADJACENT_DATE_IS_PROBABLY_A_DEFECT`. */
  'SAME_CASE_ADJACENT_DATE',
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

/**
 * The residual risk in `CNR_EXACT`, stated because it is real and small rather
 * than left for someone to find.
 *
 * A court can pass two separate orders in one case on one day — an interim
 * direction in the morning and a disposal in the afternoon — and both would
 * carry the same CNR and the same `judgment_date`. `CNR_EXACT` would call them
 * one decision and be wrong.
 *
 * It is kept promotable anyway, on two grounds. The pair is reported with
 * `hashesDiffer`, so a consumer can require agreement before acting. And the
 * failure is bounded and recoverable: a wrong link between two orders of the
 * SAME case shows an advocate a document from their own matter, which is not the
 * cross-matter contamination that would be unrecoverable.
 *
 * The corpus-wide count of (cnr, judgment_date) groups holding more than one row
 * is the number that would settle whether this stays promotable, and it is
 * running rather than assumed. Until it lands, nothing downstream should promote
 * automatically — this constant says which strengths COULD be promoted, not that
 * anything has been.
 */
export const CNR_EXACT_RESIDUAL_RISK =
  'One court can pass two orders in one case on one day; both carry the same CNR ' +
  'and the same judgment_date. Require hashesDiffer === false, or a human, before ' +
  'treating a CNR_EXACT pair as a single decision.';

/**
 * THE OTHER SIDE OF REQUIRING THE DATE, and NEW2 measured it (bus 0955).
 *
 * `judgment_date` is not clean. Against the PDF filename date — a witness the
 * publisher writes from a different field than the S3 partition — **4.45% of
 * stored dates disagree**, and when the document's own printed date was read as
 * the tiebreak it backed the filename **33 times out of 34**. The stored column
 * is the unreliable side.
 *
 * 2.8% of the corpus is a same-direction OFF-BY-ONE concentrated in a handful of
 * courts (Allahabad 22, Chhattisgarh 21, Andhra Pradesh 17, Gauhati 13 in a
 * 3,000-draw sample) — the shape a UTC midnight rendered in a negative offset
 * produces.
 *
 * So requiring the date costs RECALL in a specific, predictable way: two rows
 * that really are one decision, where one side carries the off-by-one, fall out
 * of `CNR_EXACT` and land one day apart. Calling that `SAME_CASE_DIFFERENT_DATE`
 * would file a duplicate as a timeline edge — the exact opposite error, and
 * silent.
 *
 * Hence a separate strength. It is NOT promotable: this module will not correct
 * a date, and NEW2 deliberately corrected none either, because replacing a
 * measured 4.45% error with an unmeasured one is a bad trade inside a citation
 * harness. It exists so the population is COUNTABLE and can be adjudicated with
 * the filename witness rather than disappearing into the wrong bucket.
 */
export const ADJACENT_DATE_IS_PROBABLY_A_DEFECT =
  'Same CNR, one day apart. NEW2 measured 2.8% of the corpus carrying a ' +
  'same-direction off-by-one in judgment_date, so this pair is more likely one ' +
  'decision with a bad date than two decisions. Adjudicate with the PDF filename ' +
  'date on both sides; never auto-merge and never auto-correct the date.';

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
  const s = raw
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

/**
 * Whole days between two ISO dates, or null when either is missing.
 *
 * Both are `date` columns with no time part and are compared as UTC midnights,
 * so no timezone can shift the answer — which matters here, because the defect
 * being detected IS a timezone shift.
 */
function dayGap(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return Math.abs(ms) / 86_400_000;
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

  /**
   * CNR **and** date. A CNR is the case; the date is what makes it a decision.
   * Dropping the date here would have swept in 336,209 groups of orders that are
   * correctly separate rows of one case.
   */
  if (
    a.cnr &&
    b.cnr &&
    a.cnr === b.cnr &&
    a.judgmentDate !== null &&
    a.judgmentDate === b.judgmentDate
  ) {
    return {
      ...common,
      strength: 'CNR_EXACT',
      evidence: { cnr: a.cnr, judgmentDate: a.judgmentDate },
    };
  }

  /**
   * Same CNR, different date. Two sub-cases, and merging them would hide the
   * more interesting one.
   */
  if (a.cnr && b.cnr && a.cnr === b.cnr) {
    const gap = dayGap(a.judgmentDate, b.judgmentDate);
    if (gap === 1) {
      return {
        ...common,
        strength: 'SAME_CASE_ADJACENT_DATE',
        evidence: {
          cnr: a.cnr,
          aDate: a.judgmentDate,
          bDate: b.judgmentDate,
          note: ADJACENT_DATE_IS_PROBABLY_A_DEFECT,
        },
      };
    }
    return {
      ...common,
      strength: 'SAME_CASE_DIFFERENT_DATE',
      evidence: { cnr: a.cnr, aDate: a.judgmentDate, bDate: b.judgmentDate },
    };
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
