/**
 * What a user holds, and the one function every gated call site asks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLIENT IS NEVER THE SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing in this module reads a claim from the request. A premium flag on the
 * wire is a fact about what an app believes, and an app can believe things
 * because it is stale, because it is jailbroken, or because a receipt was
 * replayed. `entitlementsFor` reads the database and nothing else, and the
 * capability set is recomputed per request rather than cached on a session —
 * the same rule `CITATION_HARNESS.md` applies to `overruled_status`, for the
 * same reason: a cancelled subscription and a moved authority are both facts
 * that change under a cached answer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPIRY IS COMPUTED, NOT SWEPT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `state = 'active'` with `expires_at` in the past is EXPIRED, and the read
 * says so without waiting for a job. A cron that flips states is a cron that can
 * be down, and the failure mode of a down expiry sweep is giving away the
 * product; the failure mode of computing it at read time is one extra
 * comparison. The sweep still exists to keep the column honest for reporting —
 * it just is not what the gate depends on.
 */
import type { Sql } from 'postgres';

import { isoColumn } from '../iso-time.ts';
import { CAPABILITIES, isCapability, isSafetyCritical, type Capability } from './capabilities.ts';
import { creditBalance } from './credits.ts';

export type EntitlementState = 'active' | 'expired' | 'revoked';
export type GrantSource =
  'purchase' | 'subscription' | 'credit_redemption' | 'founder_grant' | 'trial' | 'test';

export type HeldCapability = {
  readonly capability: Capability;
  /** How it is held right now. `credit` means there is a positive balance, not a grant. */
  readonly via: 'recurring' | 'credit';
  /** Null for a grant that does not expire on its own. Never "unknown". */
  readonly expiresAt: string | null;
  /** Remaining credits where `via` is `credit`; null otherwise. */
  readonly creditsRemaining: number | null;
};

type Row = {
  capability: string;
  state: EntitlementState;
  expires_at: string | null;
};

/**
 * Everything this user may do right now.
 *
 * Two reads, both indexed: the entitlement rows, and the credit balances. They
 * are separate questions and are deliberately not merged in SQL — a UNION that
 * returned "held" without saying HOW would make `creditsRemaining` unavailable
 * to the caller that needs to say "1 hearing pack left".
 */
export async function entitlementsFor(sql: Sql, userId: string): Promise<HeldCapability[]> {
  const rows = await sql<Row[]>`
    SELECT capability, state,
           -- NOT ::text. A Postgres timestamp rendered as text is "2026-08-23
           -- 04:12:09.11+00", which Hermes parses as Invalid Date — the guard in
           -- iso-time.test.ts exists because that shipped once, to a verification
           -- sheet. isoColumn() emits ISO-8601 with a Z.
           ${sql.unsafe(isoColumn('expires_at'))} AS expires_at
      FROM entitlements
     WHERE user_id = ${userId}
       AND state = 'active'
       -- Computed here rather than trusted from the column. See the header.
       AND (expires_at IS NULL OR expires_at > now())`;

  const held = new Map<Capability, HeldCapability>();
  for (const r of rows) {
    if (!isCapability(r.capability)) continue; // a name no code knows is not a grant
    held.set(r.capability, {
      capability: r.capability,
      via: 'recurring',
      expiresAt: r.expires_at,
      creditsRemaining: null,
    });
  }

  const balances = await sql<{ capability: string; balance: string }[]>`
    SELECT capability, COALESCE(SUM(delta), 0)::text AS balance
      FROM credit_ledger WHERE user_id = ${userId}
     GROUP BY capability HAVING COALESCE(SUM(delta), 0) > 0`;
  for (const b of balances) {
    if (!isCapability(b.capability)) continue;
    // A recurring grant OUTRANKS a credit balance: a subscriber must not have a
    // credit silently consumed for something their subscription already covers.
    if (held.has(b.capability)) continue;
    held.set(b.capability, {
      capability: b.capability,
      via: 'credit',
      expiresAt: null,
      creditsRemaining: Number(b.balance),
    });
  }
  return [...held.values()];
}

export type CapabilityDecision =
  | {
      readonly ok: true;
      readonly via: 'recurring' | 'credit' | 'never_gated';
      readonly creditsRemaining: number | null;
    }
  | { readonly ok: false; readonly reason: string; readonly capability: Capability };

/**
 * **The gate.** May this user do this thing right now?
 *
 * Refuses to gate a `SAFETY_CRITICAL` capability, in code. A call site that
 * gates adverse-treatment visibility is a bug that ships silently otherwise, and
 * the cost of it shipping is an advocate filing on a set-aside authority because
 * they had not paid.
 */
export async function requireCapability(
  sql: Sql,
  userId: string,
  capability: Capability,
): Promise<CapabilityDecision> {
  if (isSafetyCritical(capability)) {
    return { ok: true, via: 'never_gated', creditsRemaining: null };
  }
  const held = await entitlementsFor(sql, userId);
  const match = held.find((h) => h.capability === capability);
  if (!match) {
    return {
      ok: false,
      capability,
      reason: `no active entitlement or credit for ${capability}`,
    };
  }
  return { ok: true, via: match.via, creditsRemaining: match.creditsRemaining };
}

export type GrantInput = {
  readonly userId: string;
  readonly capability: Capability;
  readonly source: GrantSource;
  readonly provider?: string | null;
  /** The provider's own id for this grant. The idempotency key. */
  readonly providerRef?: string | null;
  readonly expiresAt?: Date | null;
};

export type GrantResult = { readonly id: string; readonly created: boolean };

/**
 * Grant, idempotently.
 *
 * The same `(provider, providerRef)` twice produces ONE row and reports
 * `created: false`. That is not an optimisation — every payment provider
 * redelivers, and a handler that grants on each delivery gives a customer three
 * subscriptions and an accountant a puzzle.
 *
 * A redelivery of a grant that was later REVOKED deliberately reactivates it:
 * the provider is the authority on whether the entitlement stands, and a
 * revocation followed by a fresh event is a renewal, not a replay. Replays are
 * caught upstream by `entitlement_events.provider_event_id`, which is the right
 * place for them — here we hold the current truth, not the history of messages.
 */
export async function grantEntitlement(sql: Sql, input: GrantInput): Promise<GrantResult> {
  const providerRef = input.providerRef ?? null;
  if (providerRef === null) {
    // No provider reference to be idempotent ON. Only a manual/test grant may
    // take this path, and it is stated rather than silently allowed.
    if (input.source !== 'founder_grant' && input.source !== 'test' && input.source !== 'trial') {
      throw new Error(
        `a ${input.source} grant must carry a providerRef — without one there is no ` +
          'idempotency key and a redelivered event creates a second entitlement',
      );
    }
  }

  const [row] = await sql<{ id: string; inserted: boolean }[]>`
    INSERT INTO entitlements
      (user_id, capability, state, source, provider, provider_ref, expires_at)
    VALUES (${input.userId}, ${input.capability}, 'active', ${input.source},
            ${input.provider ?? null}, ${providerRef}, ${input.expiresAt ?? null})
    ON CONFLICT (provider, provider_ref) WHERE provider_ref IS NOT NULL
    DO UPDATE SET
      state = 'active',
      revoked_at = NULL,
      revoked_reason = NULL,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    RETURNING id, (xmax = 0) AS inserted`;
  return { id: row!.id, created: row!.inserted };
}

/**
 * Revoke. A reason is required by the schema and by this signature — an
 * entitlement that vanished with no reason is indistinguishable from a bug, and
 * a refund, a chargeback and an expiry need different follow-ups.
 */
export async function revokeEntitlement(
  sql: Sql,
  where: { userId: string; capability: Capability; providerRef?: string | null },
  reason: string,
): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE entitlements SET state = 'revoked', revoked_at = now(),
           revoked_reason = ${reason}, updated_at = now()
     WHERE user_id = ${where.userId} AND capability = ${where.capability}
       AND state <> 'revoked'
       ${where.providerRef ? sql`AND provider_ref = ${where.providerRef}` : sql``}
    RETURNING id`;
  return rows.length;
}

/**
 * The reporting sweep the read path deliberately does not depend on.
 *
 * Flips `active` rows whose expiry has passed to `expired` so that a report
 * counting states is not silently wrong. The GATE already treats them as
 * expired; if this never runs, nobody gets anything they should not.
 */
export async function sweepExpired(sql: Sql): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE entitlements SET state = 'expired', updated_at = now()
     WHERE state = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id`;
  return rows.length;
}

/**
 * What the client is allowed to be told, shaped for the wire.
 *
 * `capabilities` is the whole answer — the client renders from this and never
 * from a plan name it remembers. `catalogue` carries the PROVISIONAL flag so a
 * client cannot mistake a server-side placeholder for an agreed product surface.
 */
export async function entitlementWire(sql: Sql, userId: string) {
  const held = await entitlementsFor(sql, userId);
  const credits = await creditBalance(sql, userId);
  return {
    capabilities: held,
    credits,
    catalogue: Object.values(CAPABILITIES).map((c) => ({
      name: c.name,
      kind: c.kind,
      status: c.status,
      grantModels: c.grantModels,
    })),
    asOf: new Date().toISOString(),
  };
}
