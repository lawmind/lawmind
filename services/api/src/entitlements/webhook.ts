/**
 * Billing webhooks — the ledger a provider event lands in BEFORE anything is granted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS ACTIVATED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No provider is configured, no secret is set, and no route is mounted. What
 * exists is the shape and the refusals, so that the day a provider IS chosen the
 * decisions below are already made and reviewed rather than made under launch
 * pressure. `verifySignature` refuses when no secret is configured — the same
 * pattern `packages/auth/src/mail.ts` uses: the whole path works, and the only
 * outstanding thing is a credential.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SEVEN THINGS A BILLING WEBHOOK MUST DO, AND WHERE EACH LIVES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   signature verification   `verifySignature` — constant-time, no exceptions
 *   idempotency              `entitlement_events.provider_event_id` UNIQUE
 *   event ordering           `provider_sent_at`, the PROVIDER'S clock
 *   replay protection        the same unique index, plus a freshness window
 *   unknown-user handling    stored as `deferred_unknown_user`, never dropped
 *   cross-platform mapping   `provider` + `provider_ref`, resolved to one user
 *   audit trail              every event stored, including rejected ones
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REJECTED EVENT IS STORED, NOT DISCARDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An event whose signature does not verify is written with
 * `signature_valid = false` and `outcome = 'rejected_signature'`, and is never
 * acted on. Discarding it would be tidier and would throw away the only evidence
 * that somebody is sending us forged billing traffic. What is NOT stored is the
 * body — only its sha256 — because a provider payload routinely carries an email
 * and a device identifier, and a webhook table is not where those should live.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { Sql } from 'postgres';

/** How stale a provider-timestamped event may be before it is treated as a replay. */
export const REPLAY_WINDOW_MS = 15 * 60_000;

export type WebhookOutcome =
  | 'applied'
  | 'duplicate'
  | 'deferred_unknown_user'
  | 'rejected_signature'
  | 'rejected_stale'
  | 'ignored_unknown_type'
  | 'failed';

export type SignatureResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Verify a provider signature.
 *
 * **Constant time.** A `===` on a signature leaks its bytes through timing, and
 * a billing webhook is exactly the endpoint someone will spend a week measuring.
 *
 * **An absent secret is a refusal, never a bypass.** The single most common way
 * this goes wrong is `if (!secret) return ok` — written for local development,
 * shipped, and then the endpoint accepts anything from anyone. There is no
 * development escape hatch in this function; a test supplies a test secret and
 * signs with it, exactly as the provider would.
 */
export function verifySignature(
  rawBody: string,
  providedSignature: string | null | undefined,
  secret: string | null | undefined,
  hasher: (body: string, secret: string) => string = defaultHasher,
): SignatureResult {
  if (!secret) {
    return {
      ok: false,
      reason:
        'no webhook secret is configured, so no signature can be verified. Refusing ' +
        'rather than accepting: an unverified billing event can grant entitlements.',
    };
  }
  if (!providedSignature) return { ok: false, reason: 'no signature header on the request' };

  const expected = Buffer.from(hasher(rawBody, secret));
  const actual = Buffer.from(providedSignature);
  // Length must be compared first — timingSafeEqual throws on a mismatch, and a
  // thrown exception is itself a timing signal.
  if (expected.length !== actual.length) return { ok: false, reason: 'signature length mismatch' };
  return timingSafeEqual(expected, actual)
    ? { ok: true }
    : { ok: false, reason: 'signature did not verify' };
}

/**
 * The default HMAC shape. **Provider-neutral and provisional**: every provider
 * signs differently, and the real one is supplied by the adapter that knows.
 * Hard-coding one vendor's scheme here would be inventing a contract term.
 */
function defaultHasher(body: string, secret: string): string {
  return createHash('sha256').update(`${secret}.${body}`).digest('hex');
}

export type IncomingEvent = {
  readonly provider: string;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly rawBody: string;
  readonly signature: string | null;
  /** The provider's own send time. Null where a provider does not send one. */
  readonly providerSentAt: Date | null;
  /** The provider's identifier for the customer, resolved to a user by the caller. */
  readonly userId: string | null;
  readonly capability: string | null;
};

export type RecordedEvent = {
  readonly id: string;
  readonly outcome: WebhookOutcome;
  readonly detail: string;
  /** Whether the caller should now apply this event. False for every rejection. */
  readonly actionable: boolean;
};

/**
 * Record an event and decide whether it may be acted on. Writes nothing to
 * `entitlements` — that is the caller's job, and keeping them separate is what
 * makes "did we act on a forged event" answerable by query.
 */
export async function recordEvent(
  sql: Sql,
  event: IncomingEvent,
  secret: string | null | undefined,
  now: () => number = Date.now,
): Promise<RecordedEvent> {
  const payloadHash = createHash('sha256').update(event.rawBody).digest('hex');
  const signature = verifySignature(event.rawBody, event.signature, secret);

  let outcome: WebhookOutcome = 'applied';
  let detail = '';

  if (!signature.ok) {
    outcome = 'rejected_signature';
    detail = signature.reason;
  } else if (
    event.providerSentAt !== null &&
    now() - event.providerSentAt.getTime() > REPLAY_WINDOW_MS
  ) {
    // Outside the freshness window. The unique index already stops an exact
    // replay; this catches a captured event replayed under a NEW id, which the
    // index cannot see.
    outcome = 'rejected_stale';
    detail = `provider timestamp is older than the ${REPLAY_WINDOW_MS / 60_000}-minute replay window`;
  } else if (event.userId === null) {
    // A purchase that arrives before the account finishes creating is a real
    // race. Stored and deferred, never dropped — a dropped one is a paying
    // customer with nothing.
    outcome = 'deferred_unknown_user';
    detail = 'no LawMind user resolved for this provider customer yet';
  }

  const rows = await sql<{ id: string }[]>`
    INSERT INTO entitlement_events
      (provider, provider_event_id, event_type, user_id, capability,
       provider_sent_at, payload_hash, signature_valid, outcome, outcome_detail,
       processed_at)
    VALUES (${event.provider}, ${event.providerEventId}, ${event.eventType},
            ${event.userId}, ${event.capability}, ${event.providerSentAt},
            ${payloadHash}, ${signature.ok}, ${outcome}, ${detail || null},
            ${outcome === 'applied' ? null : new Date()})
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING id`;

  if (rows.length === 0) {
    // Already seen. The provider is doing the right thing by redelivering, and
    // the right answer is a success with no second effect.
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM entitlement_events
       WHERE provider = ${event.provider} AND provider_event_id = ${event.providerEventId}`;
    return {
      id: existing?.id ?? '',
      outcome: 'duplicate',
      detail: 'this provider event has already been recorded; no second effect',
      actionable: false,
    };
  }

  return { id: rows[0]!.id, outcome, detail, actionable: outcome === 'applied' };
}

/** Mark an event applied once the caller has written the entitlement. */
export async function markApplied(sql: Sql, eventId: string, detail?: string): Promise<void> {
  await sql`UPDATE entitlement_events
               SET outcome = 'applied', processed_at = now(),
                   outcome_detail = COALESCE(${detail ?? null}, outcome_detail)
             WHERE id = ${eventId}`;
}

/**
 * Events waiting on a user who did not exist yet.
 *
 * Replayed after signup, in the provider's own order. Ordering by
 * `provider_sent_at` and not by `received_at` matters: a `cancelled` that
 * arrived before the `renewed` it follows must still be applied second.
 */
export async function deferredEvents(sql: Sql, limit = 100) {
  return sql<{ id: string; provider: string; event_type: string; capability: string | null }[]>`
    SELECT id, provider, event_type, capability
      FROM entitlement_events
     WHERE outcome = 'deferred_unknown_user'
     ORDER BY provider_sent_at ASC NULLS LAST, received_at ASC
     LIMIT ${limit}`;
}
