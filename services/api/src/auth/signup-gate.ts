/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO MAY BECOME AN ACCOUNT — the `signups` kill switch, finally connected
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `platform_config.signups` has been one of the six kill-switch keys since the
 * table existed. `SCHEMA_TRUTH.md` lists it, a CHECK constraint enforces it,
 * `POST /admin/platform/kill-switches/signups` toggles it with a mandatory
 * `reason`, and `audit_log` records every flip.
 *
 * **And nothing read it.** Measured 19 Sep 2026: the only runtime readers of
 * `platform_config` were `court/guard.ts` (`ecourts_harvest`) and
 * `premium/gate.ts` (the premium flags). An operator who closed signups during an
 * incident got a 200, an audit row, and no change in behaviour whatsoever.
 *
 * A switch that controls nothing is worse than no switch, because it is believed.
 *
 * ── WHAT THE PRIVATE BETA ACTUALLY NEEDS ────────────────────────────────────
 *
 * Today an account is obtained by anyone, from any address:
 * `POST /auth/magic-link {email}` → a link → `POST /auth/verify` → tokens →
 * `PATCH /me` creates the profile. There is no allowlist and nothing else stands
 * in the way. On a public HTTPS API serving ~100 invited lawyers that is **open
 * public signup**, and roadmap A2's private-beta model is not that.
 *
 * The exposure is not other people's data — tenant isolation holds and every
 * write carries `WHERE user_id = $me`. It is **capacity and spend**: the S4-R0
 * package puts a 30-concurrent-user beta at 92% of admitted search capacity, so
 * uninvited accounts consume the exact resource the cohort needs.
 *
 * ── THE SMALLEST SECURE MODEL, AND WHY NOT AN ALLOWLIST ─────────────────────
 *
 * An invited-address allowlist would need a table, a migration, a `SCHEMA_TRUTH`
 * change and an admin surface to manage ~100 addresses. That is a new subsystem,
 * and "do not invent a broad new auth system" rules it out when a mechanism
 * already exists, is already audited, and is already in the fixed key set.
 *
 * So: the existing switch, connected. Closed means **no new identity**. It does
 * not mean "nobody may sign in".
 *
 * ── THREE PROPERTIES THIS MUST HAVE, AND ONE IT MUST NOT ────────────────────
 *
 * 1. **It never evicts the people already inside.** Closing signups after Wave 2
 *    must not lock out the hundred lawyers who joined during Wave 0 and 1. A
 *    known address always gets its link; only an unknown one is refused.
 *
 * 2. **It is not an existence oracle.** `handleMagicLink` already answers
 *    identically for a known and an unknown address, deliberately. A refusal that
 *    said "not invited" would let anyone enumerate the cohort one address at a
 *    time — and the cohort is a list of named practising advocates, which is
 *    exactly the sort of list that must not leak. So a refused signup returns the
 *    same `{ sent: true }` as a successful one, and simply sends no mail.
 *
 * 3. **A missing row reads CLOSED, and only in a serving deployment.** The two
 *    halves are separate decisions:
 *
 *    - **Missing = CLOSED, when serving.** `SCHEMA_TRUTH` sets this per switch by
 *      naming the danger: for `ecourts_harvest` the danger is permission, so a
 *      missing row reads off. Here the danger is an unmonitored public signup
 *      surface on a beta API, so a missing row reads off too. Verified 19 Sep
 *      2026: no migration seeds this row, so a fresh USER database has none —
 *      which is precisely why the default must be the safe one, and is also why
 *      S4-R1 **cannot** inherit the local row's `reason: "test cleanup"`.
 *
 *    - **Not consulted in development.** A workstation has no public to protect,
 *      and closing local signup would break local work for no safety gain. The
 *      serving environment is read from `ops/serving-contract.ts` — the same
 *      single source `/version` and `/ready` now share, so this cannot drift from
 *      what the deployment says it is.
 *
 * What it must NOT be: a reason for the beta to run with signups permanently
 * open. Opening the window is a deliberate, audited act with a `reason`, and
 * closing it after Wave 2 is another. Both are one admin call.
 *
 * ── AND IT DOES NOT TOUCH `disableSignUp` ───────────────────────────────────
 *
 * better-auth's magicLink plugin has exactly this option and it is left at
 * `false` on purpose. It is a **static** plugin option read once when
 * `createAuth` runs, so driving the switch through it would mean a kill switch
 * that needs a restart — which is not a kill switch. The plugin's own comment is
 * about PD-1 (signup is not gated on a Bar Council roll) and that reasoning is
 * untouched: this gate is about who is invited, never about enrolment.
 */
import type { Sql } from 'postgres';

import { isServingEnv, resolveServingEnv } from '../ops/serving-contract.ts';

export type SignupDecision =
  /** A link may be sent. Either signups are open, or this identity already exists. */
  | { allow: true; reason: 'open' | 'existing-identity' | 'not-serving' }
  /** Refuse silently: send no mail, and answer exactly as if one had been sent. */
  | { allow: false; reason: 'closed-to-new-identities' };

/**
 * Are signups open on this server right now?
 *
 * Read per request rather than cached at boot, for `premium/gate.ts`'s reason:
 * the whole point of a switch is that flipping it takes effect now, during
 * whatever is going wrong.
 *
 * An unreadable `platform_config` reads CLOSED. "I do not know whether signups
 * are open" is not permission to create accounts.
 */
export async function signupsOpen(sql: Sql): Promise<boolean> {
  try {
    const [row] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM platform_config WHERE key = 'signups' AND kind = 'kill_switch'`;
    return row?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Whether this address may be sent a sign-in link.
 *
 * `env` is injected so a test can exercise both a serving and a non-serving
 * deployment in one process; production passes `process.env`.
 */
export async function decideSignup(
  sql: Sql,
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SignupDecision> {
  if (!isServingEnv(resolveServingEnv(env))) return { allow: true, reason: 'not-serving' };
  if (await signupsOpen(sql)) return { allow: true, reason: 'open' };

  /**
   * Signups are closed, so the only remaining question is whether this is an
   * EXISTING identity — and an existing one is always let through, because
   * closing the door must not evict the people already inside.
   *
   * `auth_user`, not `users`: the identity exists from the moment an email is
   * verified, while the profile row appears only at `PATCH /me`. Checking the
   * profile would lock out every `identity_only` advocate who has not finished
   * onboarding — including the ones who joined in Wave 0 and whose first act on
   * a new device is to sign in again.
   *
   * Case-insensitive, because an address that differs only in case is the same
   * mailbox and a case-sensitive matcher here fails CLOSED — locking out a
   * legitimate advocate who typed their address with a capital letter.
   */
  try {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM auth_user WHERE lower(email) = lower(${email})
      ) AS exists`;
    if (row?.exists === true) return { allow: true, reason: 'existing-identity' };
  } catch {
    /**
     * Unreadable. Refuse, and let the caller's uniform response hide it — the
     * same posture as `signupsOpen` above. A read failure must not become a way
     * to create an account while signups are closed.
     */
    return { allow: false, reason: 'closed-to-new-identities' };
  }

  return { allow: false, reason: 'closed-to-new-identities' };
}
