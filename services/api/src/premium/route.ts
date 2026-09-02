/**
 * The premium surface, PROVISIONAL and additive.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS AND WHAT IT DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 has not sent `PREMIUM_GROWTH_SPEC_V1`, so no preview endpoint is invented
 * here to guess at it. What exists is the part that is the server's regardless of
 * what the product decides: what a user holds, what a matter already contains,
 * and the job machinery that stops a repeated tap from buying the same
 * generation twice.
 *
 * Every route is behind a server flag that defaults OFF (`gate.ts`), so mounting
 * them changes nothing for any existing client until somebody turns one on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNERSHIP IS RESOLVED THE SAME WAY EVERY OTHER MATTER ROUTE RESOLVES IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A premium route that invented its own ownership check would be a second place
 * for the two to disagree, and the tenant battery would then be testing the
 * wrong one. The matter is looked up with `user_id` in the WHERE clause and a
 * miss answers 404 — never 403, because "not found" and "not yours" must be
 * indistinguishable.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isCapability } from '../entitlements/capabilities.ts';
import { entitlementWire, requireCapability } from '../entitlements/entitlements.ts';
import { PREMIUM_FLAGS, disabledReason, premiumEnabled } from './gate.ts';
import { cancelJob, getJob, startJob } from './jobs.ts';
import { hearingPackPreview } from './preview.ts';
import { logger } from '../logger.ts';
import { recordStepInBackground } from '../product/activation.ts';

export const startJobBody = z
  .object({
    capability: z.string().min(1).max(64),
    /**
     * The client's own key for this tap. REQUIRED — without it there is nothing
     * to be idempotent on, and the first bad-signal double tap buys the work
     * twice. A client that has not thought about this has not been given a
     * default that hides it.
     */
    idempotencyKey: z.string().min(8).max(128),
    matterId: z.string().uuid().optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

/** `GET /me/entitlements` — the only source of premium truth a client may use. */
export async function getEntitlements(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign-in required', 401);
  if (!(await premiumEnabled(sql, PREMIUM_FLAGS.premium_entitlements))) {
    return fail(c, 'NOT_ENABLED', disabledReason(PREMIUM_FLAGS.premium_entitlements), 404);
  }
  return ok(c, await entitlementWire(sql, userId));
}

/**
 * `GET /matters/:id/premium-preview` — counts of what this matter ALREADY holds.
 *
 * No generation, no model call, no retrieval. See `preview.ts` for why that
 * boundary is the whole design rather than an optimisation.
 */
/**
 * `sql` is the USER role — the flag, the matter, the funnel step. `corpusSql`
 * is what `hearingPackPreview` counts authorities against, and it has taken a
 * corpus handle since it was written; nothing passed one until R28.
 */
export async function getPremiumPreview(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
  corpusSql: Sql = sql,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign-in required', 401);
  if (!(await premiumEnabled(sql, PREMIUM_FLAGS.premium_preview))) {
    return fail(c, 'NOT_ENABLED', disabledReason(PREMIUM_FLAGS.premium_preview), 404);
  }
  const [matter] = await sql<{ id: string }[]>`
    SELECT id FROM matters WHERE id = ${matterId} AND user_id = ${userId}`;
  if (!matter) return fail(c, 'NOT_FOUND', 'no matter with that id', 404);

  /**
   * Funnel step 7. Opening the preview is INTENT, not purchase, and the step is
   * named for what it is — `PREMIUM_STRATEGY` is explicit that a premium moment
   * is contextual, so an advocate reaching this screen is the signal, whatever
   * they do next.
   */
  recordStepInBackground(
    sql,
    userId,
    'premium_intent',
    (err) =>
      logger.error(
        { request_id: c.get('requestId'), err, step: 'premium_intent' },
        'activation step not recorded',
      ),
  );

  return ok(c, await hearingPackPreview(sql, matterId, corpusSql));
}

/** `POST /premium/jobs` — the only path that may spend model time on a user's behalf. */
export async function postPremiumJob(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof startJobBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign-in required', 401);
  if (!(await premiumEnabled(sql, PREMIUM_FLAGS.premium_generation_jobs))) {
    return fail(c, 'NOT_ENABLED', disabledReason(PREMIUM_FLAGS.premium_generation_jobs), 404);
  }
  if (!isCapability(body.capability)) {
    return fail(c, 'UNKNOWN_CAPABILITY', `no capability named ${body.capability}`, 400);
  }
  const capability = body.capability;

  // The entitlement is checked BEFORE the job row exists, so a refusal costs
  // nothing and leaves nothing to clean up.
  const held = await requireCapability(sql, userId, capability);
  if (!held.ok) {
    return fail(c, 'NOT_ENTITLED', held.reason, 402);
  }

  if (body.matterId) {
    const [matter] = await sql<{ id: string }[]>`
      SELECT id FROM matters WHERE id = ${body.matterId} AND user_id = ${userId}`;
    if (!matter) return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const started = await startJob(sql, {
    userId,
    capability,
    idempotencyKey: body.idempotencyKey,
    params: body.params,
    matterId: body.matterId ?? null,
  });

  if (!started.ok) {
    // A cap, not a fault. 429 so a client backs off rather than retrying at once.
    return fail(c, started.code, started.reason, 429);
  }

  /**
   * **201 only when a job was actually created.** A second tap answers 200 with
   * the SAME job, and the distinction is on the wire as `created` so a client can
   * tell "your pack is being made" from "your pack is already being made" without
   * showing two of anything.
   */
  return ok(c, { job: started.job, created: started.created }, started.created ? 201 : 200);
}

export async function getPremiumJob(
  c: Context,
  sql: Sql,
  jobId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign-in required', 401);
  const job = await getJob(sql, jobId, userId);
  if (!job) return fail(c, 'NOT_FOUND', 'no job with that id', 404);
  return ok(c, { job });
}

export async function cancelPremiumJob(
  c: Context,
  sql: Sql,
  jobId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign-in required', 401);
  const { cancelled } = await cancelJob(sql, jobId, userId);
  if (!cancelled) {
    // Either it is not theirs, or it has already finished. Both answer the same
    // way: a finished job must not be cancellable, or a client could retroactively
    // unspend a credit.
    return fail(c, 'NOT_FOUND', 'no cancellable job with that id', 404);
  }
  return ok(c, { cancelled: true });
}
