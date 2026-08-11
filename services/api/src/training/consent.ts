/**
 * Training consent — grant, read, and **withdraw**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SHIPPED LATE, AND WHY IT COULD NOT SHIP ANY LATER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `TRAINING_STRATEGY.md` §3: *"Wire the consent and the logging in S3, even
 * though training is far later. **A signal not captured in S3 is not
 * recoverable in month twelve**, and asking for retrospective consent is a
 * conversation nobody wins."*
 *
 * S3 completed without it. Every day of real usage from launch onward without
 * this endpoint is work we can never lawfully learn from, because the only
 * remedy is to go back and ask — and an advocate asked in month twelve to
 * approve twelve months of past use says no, correctly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEPARATE FROM PD-8, AND THE SEPARATION IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `users.terms_accepted_at` already records the onboarding consent that replaced
 * the AI-assisted mark. **This is not that.** DPDP Act 2023 s. 6 requires
 * consent to be *free, specific, informed, unconditional and unambiguous*, for a
 * **specified purpose**. Accepting the terms is not agreeing that your own
 * drafting teaches our model, and treating one as the other is precisely the
 * kind of bundled consent s. 6 exists to forbid.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WITHDRAWAL IS A FIRST-CLASS OPERATION, NOT A SUPPORT TICKET
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DPDP s. 6(4)–(6): withdrawal must be **as easy as granting**, and on
 * withdrawal processing must cease. So `DELETE` sits beside `POST` on the same
 * path, costs the same one call, and needs nobody's approval.
 *
 * **Withdrawal sets both columns back to NULL** rather than writing a third
 * "withdrawn_at" column. Two columns that can disagree would leave "granted in
 * March, withdrawn in August, what about May?" to be re-answered by application
 * code forever. `training_consent_events` keeps the full history; the live row
 * has two states, and the rest of the system already handles both.
 *
 * That is only safe because of the matching rule in `extract.ts`: **no training
 * pair is ever materialised.** Pairs are generated on demand and filtered by
 * consent at generation time, so withdrawal is retroactive by construction and
 * there is no deletion job that could be forgotten.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

/**
 * The version of the training-consent notice the advocate agreed to.
 *
 * **Bumped whenever the notice's substance changes**, never for a typo fix. A
 * consent recorded against `v1` is not a consent to `v2`: DPDP s. 6 requires
 * consent to be informed, and "informed" means informed about what was actually
 * shown. {@link consentIsCurrent} is what turns that into a check.
 */
export const TRAINING_CONSENT_VERSION = 'training-v1';

export const grantBody = z
  .object({
    /**
     * Echoed back by the client so a stale app cannot record agreement to a
     * notice it never displayed. Mismatches are rejected rather than coerced.
     */
    version: z.string().min(1),
  })
  .strict();

type ConsentRow = {
  training_consent_at: string | null;
  training_consent_version: string | null;
};

/**
 * **Consent exists only when both columns are set.** Never inferred from
 * silence, and never from a timestamp alone — a timestamp without a version
 * cannot be shown back to the advocate as "here is what you agreed to".
 */
export function hasConsent(row: ConsentRow): boolean {
  return row.training_consent_at !== null && row.training_consent_version !== null;
}

/**
 * Consent to an OLD version is real consent, and it is **not** consent to the
 * current notice. Kept as a separate question from {@link hasConsent} so that a
 * caller must decide which one it means — collapsing them would let a notice
 * change silently re-authorise everyone, or silently revoke everyone.
 */
export function consentIsCurrent(
  row: ConsentRow,
  current: string = TRAINING_CONSENT_VERSION,
): boolean {
  return hasConsent(row) && row.training_consent_version === current;
}

const shape = (row: ConsentRow) => ({
  granted: hasConsent(row),
  /** Null when never granted — an absence, reported as an absence. */
  grantedAt: row.training_consent_at,
  version: row.training_consent_version,
  /** What the app should be showing. Lets a client detect a stale notice. */
  currentVersion: TRAINING_CONSENT_VERSION,
  /** False when consent was given against a superseded notice. */
  isCurrent: consentIsCurrent(row),
});

export async function getTrainingConsent(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'training consent belongs to an advocate', 401);
  }
  const [row] = await sql<ConsentRow[]>`
    SELECT ${sql.unsafe(isoColumn('training_consent_at'))} AS training_consent_at,
           training_consent_version
    FROM users WHERE id = ${userId}`;
  if (!row) return fail(c, 'NOT_FOUND', 'no such user', 404);

  return ok(c, shape(row));
}

export async function grantTrainingConsent(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof grantBody>,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'training consent belongs to an advocate', 401);
  }

  /**
   * **A client agreeing to a version we do not recognise is refused.** The
   * alternative — storing whatever string arrives — would let a stale build
   * record consent to a notice nobody can now produce, which is unauditable
   * exactly when it matters.
   */
  if (body.version !== TRAINING_CONSENT_VERSION) {
    return fail(
      c,
      'STALE_CONSENT_VERSION',
      `this notice is version ${TRAINING_CONSENT_VERSION}; the app offered ${body.version}. ` +
        'Show the current notice and ask again.',
      409,
    );
  }

  const [row] = await sql.begin(async (tx) => {
    const [updated] = await tx<ConsentRow[]>`
      UPDATE users
      SET training_consent_at = now(),
          training_consent_version = ${body.version}
      WHERE id = ${userId}
      RETURNING ${tx.unsafe(isoColumn('training_consent_at'))} AS training_consent_at,
                training_consent_version`;
    if (!updated) return [];

    await tx`
      INSERT INTO training_consent_events (user_id, action, version)
      VALUES (${userId}, 'granted', ${body.version})`;
    return [updated];
  });

  if (!row) return fail(c, 'NOT_FOUND', 'no such user', 404);
  return ok(c, shape(row));
}

/**
 * Withdrawal. **Idempotent** — withdrawing when nothing was granted succeeds and
 * reports the true state, because an advocate exercising a right should never
 * meet an error telling them it was unnecessary.
 *
 * An event row is written **only when something actually changed**, so the audit
 * trail does not fill with no-ops that look like repeated changes of mind.
 */
export async function withdrawTrainingConsent(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) {
    return fail(c, 'AUTH_REQUIRED', 'training consent belongs to an advocate', 401);
  }

  const result = await sql.begin(async (tx) => {
    const [before] = await tx<ConsentRow[]>`
      SELECT ${tx.unsafe(isoColumn('training_consent_at'))} AS training_consent_at,
             training_consent_version
      FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!before) return null;

    if (!hasConsent(before)) return before;

    await tx`
      UPDATE users
      SET training_consent_at = NULL, training_consent_version = NULL
      WHERE id = ${userId}`;
    await tx`
      INSERT INTO training_consent_events (user_id, action, version)
      VALUES (${userId}, 'withdrawn', NULL)`;

    return { training_consent_at: null, training_consent_version: null } satisfies ConsentRow;
  });

  if (result === null) return fail(c, 'NOT_FOUND', 'no such user', 404);
  return ok(c, shape(result));
}
