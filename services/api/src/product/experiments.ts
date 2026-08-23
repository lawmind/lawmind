/**
 * Assignment and exposure — the two rows that make a UI change an experiment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHANGING A SCREEN AND WATCHING THE NUMBERS IS NOT AN EXPERIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is a coincidence with a narrative attached. Two facts turn it into
 * evidence: WHO was assigned to WHAT, and WHEN they actually SAW it.
 *
 * The second is the one people leave out, and leaving it out breaks the
 * denominator rather than merely losing precision. A user assigned to the
 * "hearing pack preview" variant who never opened a matter is not evidence about
 * the preview; counting them dilutes the variant they were assigned to and makes
 * every result regress toward no-difference. Exposure is what makes the
 * comparison a comparison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ASSIGNMENT IS DETERMINISTIC AND STICKY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The variant is a hash of `(experimentId, userId)`, so the same user gets the
 * same answer from any server, in any process, with no coordination — and the
 * row is written on first ask so that a later change to the variant WEIGHTS
 * cannot silently move users between arms mid-experiment. A user who has been
 * assigned stays assigned; that is what makes retention measurable at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OUTCOMES ARE NOT STORED HERE, DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Conversion is an `entitlements` row. Refund is a `credit_ledger` reversal.
 * Cost is `premium_jobs.cost_usd`. Retention is activity. Copying any of them
 * into an experiment table creates a second number that can disagree with the
 * first, and the one that disagrees is always the one in the deck.
 *
 * **And a variant that lifts purchases is not automatically the winner.** The
 * readout below reports refunds, revocations and cost beside conversion for
 * exactly that reason: a paywall that converts better and gets cancelled more is
 * a worse paywall, and a readout that shows only the first number cannot say so.
 */
import { createHash } from 'node:crypto';

import type { Sql } from 'postgres';

export type Variant = string;

/**
 * Pick a variant deterministically.
 *
 * The hash is of the experiment id AND the user id, never the user id alone:
 * hashing the user alone would put the same people in the "A" arm of every
 * experiment forever, and a run of experiments would then all be measuring the
 * same subpopulation.
 */
export function variantFor(experimentId: string, userId: string, variants: readonly Variant[]): Variant {
  if (variants.length === 0) throw new Error('an experiment needs at least one variant');
  const digest = createHash('sha256').update(`${experimentId}:${userId}`).digest();
  return variants[digest.readUInt32BE(0) % variants.length]!;
}

/**
 * Assign, stickily. Returns the EXISTING assignment where one is present, even
 * if the variant list has changed since — see the header.
 */
export async function assign(
  sql: Sql,
  experimentId: string,
  userId: string,
  variants: readonly Variant[],
): Promise<{ variant: Variant; newlyAssigned: boolean }> {
  const chosen = variantFor(experimentId, userId, variants);
  const [row] = await sql<{ variant: string; inserted: boolean }[]>`
    INSERT INTO experiment_assignments (user_id, experiment_id, variant)
    VALUES (${userId}, ${experimentId}, ${chosen})
    ON CONFLICT (user_id, experiment_id) DO UPDATE SET variant = experiment_assignments.variant
    RETURNING variant, (xmax = 0) AS inserted`;
  return { variant: row!.variant, newlyAssigned: row!.inserted };
}

/**
 * Record that the user actually SAW the variant on a named surface.
 *
 * Appended, not upserted: a repeat exposure is real information about how often
 * the surface is reached, and collapsing it would make "seen once" and "seen
 * daily for a month" the same row.
 */
export async function recordExposure(
  sql: Sql,
  experimentId: string,
  userId: string,
  variant: Variant,
  surface: string,
): Promise<void> {
  await sql`
    INSERT INTO experiment_exposures (user_id, experiment_id, variant, surface)
    VALUES (${userId}, ${experimentId}, ${variant}, ${surface})`;
}

export type VariantReadout = {
  readonly variant: Variant;
  readonly assigned: number;
  /** Users who actually saw it. The denominator for everything below. */
  readonly exposed: number;
  readonly converted: number;
  readonly revoked: number;
  readonly refunded: number;
  readonly modelSpendUsd: number;
  /**
   * Null until `exposed` is large enough for the number to mean anything.
   * A rate over eleven users is a story, not a result, so it is withheld rather
   * than printed with a caveat somebody will crop out of the screenshot.
   */
  readonly conversionRate: number | null;
};

/** Below this many exposed users, no rate is reported. */
export const MIN_EXPOSED_FOR_RATE = 100;

/**
 * The readout — conversion NEXT TO the things that can make a converting variant
 * the worse one.
 *
 * Every outcome is read from the table that owns it, joined on the user, never
 * copied. Refunds and revocations are counted separately because they are
 * different signals: a refund is the customer changing their mind, a revocation
 * is usually a chargeback or a fraud action.
 */
export async function readout(sql: Sql, experimentId: string): Promise<VariantReadout[]> {
  const rows = await sql<
    {
      variant: string;
      assigned: string;
      exposed: string;
      converted: string;
      revoked: string;
      refunded: string;
      spend: string;
    }[]
  >`
    WITH a AS (
      SELECT user_id, variant FROM experiment_assignments WHERE experiment_id = ${experimentId}
    ),
    e AS (
      SELECT DISTINCT user_id FROM experiment_exposures WHERE experiment_id = ${experimentId}
    )
    SELECT a.variant,
           count(*)::text AS assigned,
           count(*) FILTER (WHERE e.user_id IS NOT NULL)::text AS exposed,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM entitlements en
              WHERE en.user_id = a.user_id AND en.source IN ('purchase', 'subscription')
           ))::text AS converted,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM entitlements en
              WHERE en.user_id = a.user_id AND en.state = 'revoked'
           ))::text AS revoked,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM credit_ledger cl
              WHERE cl.user_id = a.user_id AND cl.reason = 'refund_reversal'
           ))::text AS refunded,
           COALESCE(SUM((SELECT COALESCE(SUM(pj.cost_usd), 0) FROM premium_jobs pj
                          WHERE pj.user_id = a.user_id)), 0)::text AS spend
      FROM a LEFT JOIN e ON e.user_id = a.user_id
     GROUP BY a.variant
     ORDER BY a.variant`;

  return rows.map((r) => {
    const exposed = Number(r.exposed);
    const converted = Number(r.converted);
    return {
      variant: r.variant,
      assigned: Number(r.assigned),
      exposed,
      converted,
      revoked: Number(r.revoked),
      refunded: Number(r.refunded),
      modelSpendUsd: Number(r.spend),
      conversionRate: exposed < MIN_EXPOSED_FOR_RATE ? null : converted / exposed,
    };
  });
}
