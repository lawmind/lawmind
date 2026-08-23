/**
 * The CHEAP half of a premium preview — counts of what is already held.
 *
 * Built against `docs/product/PREMIUM_GROWTH_SPEC_V1.md` §2 and §6 (NEW3,
 * 23 Aug 2026), which is the spec P8 said to wait for. Every field below is one
 * of that document's `cheap` cost-class elements, and one field it lists as
 * cheap is REFUSED here because the data does not exist — see the note on
 * `stanceNotComputed`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A PREVIEW MAY NOT COMPUTE THE THING IT IS PREVIEWING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A contextual premium preview shown to every free user on every matter screen
 * is, if it triggers real generation, an unbounded model bill paid for people
 * who by definition have not paid. The distinction is not a nuance; it is the
 * whole design, and it is SPEC_V1 §6's rule as well:
 *
 *   CHEAP PREVIEW SIGNAL      indexed counts over rows we already have
 *   FULL PREMIUM COMPUTATION  a `premium_jobs` row, on explicit user intent
 *
 * Everything in this module is the first kind. Four indexed reads and no model
 * call — no LLM, no embedding, no retrieval. `costClass: 'cheap'` is on the wire
 * so the rule is measurable in production rather than asserted in a document.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS FABRICATED, AND NOTHING HERE IS WITHHELD FOR SAFETY REASONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two rules that pull in opposite directions and are both absolute.
 *
 * **Never fabricate scarcity or value.** Every count below is `SELECT count(*)`
 * over rows the advocate's own matter already contains. There is no "4 issues
 * found" where nothing has looked for issues, no rounded-up figure, and no
 * number that would change if the advocate paid.
 *
 * **Never hide an adverse treatment behind the paywall.** `adverseAuthorities`
 * is returned to EVERYONE, paid or not, because an authority in this advocate's
 * own matter that has been set aside is a fact about their professional risk,
 * not a feature. SPEC_V1 §0 says the same thing from the product side;
 * `capabilities.ts` marks the capability `SAFETY_CRITICAL` and
 * `requireCapability` refuses to gate it. This module is where that is kept.
 */
import type { Sql } from 'postgres';

export type HearingPackPreview = {
  readonly matterId: string;
  /**
   * `cheap` always. On the wire so SPEC_V1 §6's table is a measurement rather
   * than a claim: an `expensive` preview reaching a free user is then a query,
   * not an argument.
   */
  readonly costClass: 'cheap';
  /** Authorities the advocate has saved to this matter. A stored count. */
  readonly authorityCount: number;
  /** Events already recorded — hearings, orders, filings, notes. A stored count. */
  readonly eventCount: number;
  /**
   * Saved authorities whose `overruled_status` is not `none`, read LIVE.
   *
   * Never cached, on this surface as on every other — `CITATION_HARNESS.md`.
   * A preview holding a stale good-law count is the same defect as a stale badge,
   * and it appears on a screen an advocate is skim-reading. **Free, always.**
   */
  readonly adverseAuthorities: number;
  /** The next hearing on the matter. Already shown free elsewhere in the product. */
  readonly nextHearingDate: string | null;
  /**
   * Filings with no order recorded after them — SPEC_V1 §2B's "procedural dates
   * need attention". Deterministic and date-based, the same rule
   * `briefings/assemble.ts` already uses, so the two surfaces cannot disagree.
   */
  readonly unresolvedFilings: number;
  /**
   * **A correction to SPEC_V1 §6, not an omission.**
   *
   * The spec's cost table lists "Authority counts (supporting/contrary)" as
   * `cheap — matter_authorities row count, already computed`. Checked against the
   * live schema: `matter_authorities` is
   * `(id, matter_id, judgment_id, added_by_user_id, citation_check_id, added_at,
   * removed_at, removed_by_user_id)`. **There is no stance column anywhere.**
   * Nothing in this database records whether a saved authority helps or hurts.
   *
   * Splitting that count is therefore not cheap; it is the synthesis the Pro
   * tier is for. Returning a fabricated split would be exactly the invented
   * scarcity §0 forbids, so the field is `true` and the client shows one total.
   */
  readonly stanceNotComputed: true;
  /**
   * What is NOT known without generating. Stated rather than implied by absence,
   * so a client cannot present a preview as a summary of the pack.
   */
  readonly notComputed: readonly string[];
  readonly asOf: string;
};

/**
 * Everything a hearing-pack preview may honestly say, in four indexed reads.
 *
 * Ownership is the caller's to enforce before calling — this takes a matter id
 * it trusts. That is deliberate rather than lax: every matter route already
 * resolves ownership through its own WHERE clause, and a second, different
 * ownership check here would be a second place for the two to disagree.
 */
export async function hearingPackPreview(
  sql: Sql,
  matterId: string,
): Promise<HearingPackPreview> {
  const [authorities] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM matter_authorities
     WHERE matter_id = ${matterId} AND removed_at IS NULL`;

  const [events] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM matter_events WHERE matter_id = ${matterId}`;

  const [adverse] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n
      FROM matter_authorities ma
      JOIN judgments j ON j.id = ma.judgment_id
     WHERE ma.matter_id = ${matterId} AND ma.removed_at IS NULL
       AND j.overruled_status <> 'none'`;

  const [matter] = await sql<{ next_hearing_date: string | null }[]>`
    SELECT next_hearing_date::text AS next_hearing_date
      FROM matters WHERE id = ${matterId}`;

  /**
   * A filing with no order recorded on or after its own date. Deliberately
   * date-based rather than status-based — the same rule `briefings/assemble.ts`
   * applies, so the briefing and the preview cannot report different numbers
   * for the same matter, which is the way two surfaces lose an advocate's trust.
   */
  const [unresolved] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM matter_events f
     WHERE f.matter_id = ${matterId} AND f.event_type = 'filing'
       AND NOT EXISTS (
         SELECT 1 FROM matter_events o
          WHERE o.matter_id = f.matter_id AND o.event_type = 'order'
            AND o.event_date >= f.event_date AND o.id <> f.id)`;

  return {
    matterId,
    costClass: 'cheap',
    authorityCount: Number(authorities!.n),
    eventCount: Number(events!.n),
    adverseAuthorities: Number(adverse!.n),
    nextHearingDate: matter?.next_hearing_date ?? null,
    unresolvedFilings: Number(unresolved!.n),
    stanceNotComputed: true,
    /**
     * The honest list. These are the parts of a hearing pack that require
     * generation, and naming them is what stops the counts above reading as a
     * summary of a pack that has not been made.
     */
    notComputed: [
      'issues — requires generation',
      'counter-positions — requires generation',
      'unresolved risks — requires generation',
      'whether each authority helps or hurts — no stance is stored; requires generation',
    ],
    asOf: new Date().toISOString(),
  };
}
