/**
 * The server-side switch for every premium surface. **Default OFF.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLIENT EXISTENCE MUST NEVER IMPLY BACKEND CAPABILITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A build ships with a paywall screen in it. The screen exists in every copy of
 * the app on every phone, forever, and cannot be taken back — app review takes
 * days and a user who never updates keeps it for months. So whether the paywall
 * WORKS has to be a server fact, and it has to be one that can be turned off
 * from here in seconds without shipping anything.
 *
 * Every new premium experiment — a paywall, a free sample, a Hearing Pack
 * credit, a contextual preview, a monitoring promise — goes behind one of these.
 * They are `platform_config` rows of kind `flag`, so they are already
 * admin-settable, already audited on every change, and already visible on the
 * admin platform surface. That is the ponytail ladder answer: the switch this
 * needs already exists, and adding a second flag system would mean two places to
 * look when something is on that should not be.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN ABSENT ROW IS OFF
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Same reasoning as `users.role` defaulting to `advocate` and `DPA_COUNTERSIGNED`
 * defaulting to false. The failure mode of default-on is that a half-built
 * commercial surface goes live because nobody remembered to create a row; the
 * failure mode of default-off is that somebody has to turn it on deliberately.
 * Only one of those can charge a customer by accident.
 *
 * A DATABASE ERROR IS ALSO OFF. If `platform_config` cannot be read, the honest
 * answer is "I do not know whether this is enabled", and the safe reading of
 * that for a paid surface is no.
 */
import type { Sql } from 'postgres';

/**
 * Every premium surface that must be independently disableable.
 *
 * Named here rather than passed as free strings so that a typo is a compile
 * error rather than a surface that is permanently off and nobody notices —
 * a flag misspelled at the call site reads exactly like a flag turned off.
 */
export const PREMIUM_FLAGS = {
  /** The entitlement wire and any paywall built on it. */
  premium_entitlements: 'premium_entitlements',
  /** Contextual previews computed from stored counts. */
  premium_preview: 'premium_preview',
  /** Creating generation jobs at all. The cost switch. */
  premium_generation_jobs: 'premium_generation_jobs',
  /** One-off credit purchase and redemption. */
  premium_credits: 'premium_credits',
} as const;

export type PremiumFlag = (typeof PREMIUM_FLAGS)[keyof typeof PREMIUM_FLAGS];

/**
 * Is this premium surface enabled on the server right now?
 *
 * Read per request rather than cached at boot: the whole point of the switch is
 * that flipping it takes effect now, during whatever is going wrong.
 */
export async function premiumEnabled(sql: Sql, flag: PremiumFlag): Promise<boolean> {
  try {
    const [row] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM platform_config WHERE key = ${flag} AND kind = 'flag'`;
    return row?.enabled === true;
  } catch {
    // Unreadable config is not permission. See the header.
    return false;
  }
}

/** The wire shape for a disabled surface: a refusal that says which switch. */
export function disabledReason(flag: PremiumFlag): string {
  return (
    `${flag} is not enabled on this server. Premium surfaces default to off and are ` +
    'turned on deliberately; a client carrying the screen does not mean the backend ' +
    'will serve it.'
  );
}
