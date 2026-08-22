/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE PREDICATE FOR "MAY THIS DOCUMENT'S BODY TEXT BE USED AS EVIDENCE"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The guarantee the product needs is structural, not scheduled:
 *
 *   METADATA lookup   — citation, case title, case number — a damaged judgment
 *                       stays DISCOVERABLE. Those fields do not come from the
 *                       body, so body damage is no evidence against them.
 *   BODY-TEXT research — semantic retrieval, lexical retrieval over the body,
 *                       paragraph/span evidence, and anything handed to a model
 *                       — a KNOWN-UNSAFE body is REFUSED.
 *
 * `docs/SCHEMA_TRUTH.md` and NEW2's `judgment_quality_contract` (migration
 * `0072`) already state exactly that split. This module is the query-time half
 * of it, so that every body-text path in the API refuses the same rows on the
 * same evidence at the same instant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT `judgment_chunks.text_quality`, WHICH IS WHAT RETRIEVAL USED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `dense()` down-ranked by `text_quality` and never excluded. NEW2 measured that
 * column against proven damage (bus 1005):
 *
 *     chunks whose judgment is PROVEN damaged        24
 *       text_quality >= 0.85 -> multiplier 1.0        22    ← no penalty at all
 *       0.50 - 0.85                                    2
 *
 * 149 of 168 damaged rows score at or ABOVE the 0.85 floor, median 1.000. The
 * score is inverted on the population it was supposed to catch, so a multiplier
 * built on it is not a weak guarantee — it is no guarantee. `text_quality` stays
 * where it is as a ranking nudge; it is not, and never was, a safety gate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS READ FROM `judgments` LIVE AND NOT FROM A STAGED TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1's quarantine walk moves refused rows out of the vector stage, and it
 * works. But it is a BATCH over a corpus that gains verdicts continuously —
 * NEW2's `text-damage-v2.0` pass convicted 7,814 documents that no screen had
 * ever fired on, and every one of them was eligible for retrieval in the window
 * between conviction and the next walk. A guarantee that holds because a job
 * keeps up is not a guarantee.
 *
 * `j.script_quality` is the column the verdict is written INTO. Reading it in
 * the request means a document convicted one second ago is refused by the next
 * query, with no job in between. That is the DONE criterion for P0: **safe even
 * before the quarantine runs.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RECOVERED TEXT IS NOT A WAY BACK IN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A recovery lives in `judgment_text_recovery` with its own provenance and its
 * own `digit_trust`, and the contract view deliberately does NOT let it flip
 * `body_text_safe`. Nothing in this API reads recovered text yet; when something
 * does, it asks for it by name and honours `digit_trust` — 6 of 20 probe pages
 * rendered a year as `2O17`, so no numeric field (date, citation year, section
 * number) may be taken from recovered text without a second witness.
 * {@link RECOVERED_DIGITS_NOT_PRIMARY} records that rule next to the predicate
 * it qualifies rather than in a document nobody opens.
 */
import type { Sql } from 'postgres';

/**
 * The two values that mean "no screen and no detector has convicted this body".
 *
 * NOT a claim that the text is faithful — nothing in this corpus has ever looked
 * for evidence of faithfulness, which is why the contract view has no CLEAN
 * state and calls this population `TEXT_UNKNOWN`. Absence of a conviction is
 * exactly what it says and no more.
 */
export const BODY_TEXT_UNCONVICTED = ['clean', 'mixed_script_ok'] as const;

/**
 * Recovered text may not supply a digit that anything downstream treats as
 * exact. Stated as a constant so a future consumer trips over it.
 */
export const RECOVERED_DIGITS_NOT_PRIMARY =
  'digit_trust=UNVERIFIED means no date, citation year or section number may be taken from recovered text without a second witness';

/** The in-process twin of the SQL predicate, for rows already fetched. */
export function isBodyTextSafe(scriptQuality: string | null | undefined): boolean {
  if (scriptQuality === null || scriptQuality === undefined) return true;
  return (BODY_TEXT_UNCONVICTED as readonly string[]).includes(scriptQuality);
}

/**
 * `AND <body_text_safe>` for a query that has `judgments` joined under `alias`.
 *
 * Byte-for-byte the same shape as `judgment_quality_contract.body_text_safe`;
 * `body-text-safety.test.ts` asserts that against `pg_get_viewdef` on the
 * DEPLOYED view, so a change to the contract fails a test here instead of
 * silently widening what retrieval will read.
 */
export function andBodyTextSafe(sql: Sql, alias = 'j') {
  const col = sql.unsafe(`${alias}.script_quality`);
  return sql`AND (${col} IS NULL OR ${col} = ANY(${[...BODY_TEXT_UNCONVICTED]}))`;
}

/** The same predicate without the leading AND, for use as a whole WHERE. */
export function bodyTextSafeWhere(sql: Sql, alias = 'j') {
  const col = sql.unsafe(`${alias}.script_quality`);
  return sql`(${col} IS NULL OR ${col} = ANY(${[...BODY_TEXT_UNCONVICTED]}))`;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT AN ADVOCATE IS ALLOWED TO BE TOLD — NEW2 bus 1022
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `body_text_safe` is a PIPELINE ELIGIBILITY FLAG and NEW2 asked, in terms, that
 * it never be rendered to an advocate as a quality statement. The reason is a
 * number:
 *
 *     judgments                                        18,698,968
 *     convicted damaged (script_quality NOT NULL)       1,741,056    9.31%
 *     script_quality IS NULL                           16,957,912   90.68%
 *     script_quality = 'clean' or 'mixed_script_ok'             0    0.00%
 *
 * **No writer in this repository has ever emitted `clean`.** So `body_text_safe
 * = true` means "nothing has convicted this", and for nine documents in ten that
 * rests on no evidence at all. A wire field called `bodyTextSafe: true` would
 * hand a client a positive claim the column cannot support, and this repo has
 * been bitten by that exact shape twice — `is_bail_order` NULL dropping 86% of
 * Tier A, and `hc_document_class` NULL meaning both refused-by-a-rule and
 * never-looked-at.
 *
 * So the WIRE carries the contract's own vocabulary — `TEXT_DAMAGED` /
 * `TEXT_UNKNOWN`, with the evidence GRADE beside it — and the boolean stays
 * where it belongs, inside retrieval, deciding what to read.
 */
export type BodyTextState = 'TEXT_DAMAGED' | 'TEXT_UNKNOWN';
export type BodyTextGrade = 'PROOF' | 'SCREEN' | 'NONE';

/** Mirrors `judgment_quality_contract.text_state`. There is no CLEAN state. */
export function bodyTextState(scriptQuality: string | null | undefined): BodyTextState {
  return isBodyTextSafe(scriptQuality) ? 'TEXT_UNKNOWN' : 'TEXT_DAMAGED';
}

/**
 * Mirrors `judgment_quality_contract.text_grade` — how well the damage is
 * PROVEN, which is a different axis from whether it is damaged.
 *
 * `PROOF` is a byte-stream examination (`text-damage-v2.0`); `SCREEN` is a
 * density or a marker, enough to refuse a GPU batch and not enough to tell a
 * person their document is corrupt. NEW2's rule: the two must never be pooled
 * into one damage rate.
 */
const PROOF_METHODS = ['text-damage-v2.0'];

export function bodyTextGrade(
  scriptQuality: string | null | undefined,
  method: string | null | undefined,
): BodyTextGrade {
  if (isBodyTextSafe(scriptQuality)) return 'NONE';
  return method !== null && method !== undefined && PROOF_METHODS.includes(method)
    ? 'PROOF'
    : 'SCREEN';
}
