/**
 * The one place that decides whether anything may contact eCourts.
 *
 * Every request goes through `decide` and every decision is written to
 * `ecourts_fetch_ledger` — **including the refusals.** A ledger that recorded only
 * the requests we made could show volume but could never show that the locks
 * held; refusals are the evidence that they did.
 *
 * The locks, in the order they are checked, cheapest and most absolute first:
 *
 *   1. **Terms on file.** `CLAUDE.md`: if the authorisation's terms are not in the
 *      repo, the switch stays off. This one outranks the switch — an operator who
 *      turns the switch on before the conditions are transcribed has not granted
 *      themselves permission, they have only turned a handle.
 *   2. **The grant has not expired.**
 *   3. **The kill switch**, `platform_config.ecourts_harvest`, default false.
 *      A missing row is read as OFF, never as absent-therefore-fine.
 *   4. **The court is one the grant names.**
 *   5. **The hour is one the grant permits**, in IST.
 *   6. **Frequency**, then **hourly volume**, then **daily volume** — counted
 *      from the ledger, not from memory, so a restart cannot hand us a fresh
 *      quota we were never granted.
 *
 * If the registrar ever asks whether we stayed inside the grant, the answer is a
 * query against `ecourts_fetch_ledger`, not a promise.
 */
import type { Sql } from 'postgres';

import { AUTHORISATION, type EcourtsAuthorisation, grantAttribution, istHour } from './authorisation.ts';

/** The kill-switch key. Fixed set — `docs/SCHEMA_TRUTH.md` §platform_config. */
export const ECOURTS_KILL_SWITCH_KEY = 'ecourts_harvest';

export type RefusalReason =
  | 'terms_not_on_file'
  | 'authorisation_expired'
  | 'attribution_not_on_file'
  | 'kill_switch_off'
  | 'court_not_permitted'
  | 'outside_permitted_hours'
  | 'min_interval'
  | 'rate_limit_hourly'
  | 'rate_limit_daily';

export type FetchDecision =
  | { allowed: true; authorisation: EcourtsAuthorisation }
  | { allowed: false; reason: RefusalReason; detail: string };

/**
 * Read the kill switch. **A missing row is OFF.**
 *
 * The absent case is the one worth being deliberate about: a switch nobody has
 * created is a switch nobody is watching, and reading its absence as permission
 * is how a gated feature ships ungated. Same shape as the rule that a
 * never-enumerated count is null rather than zero.
 */
export async function killSwitchEnabled(sql: Sql): Promise<boolean> {
  const [row] = await sql<{ enabled: boolean }[]>`
    SELECT enabled FROM platform_config
    WHERE key = ${ECOURTS_KILL_SWITCH_KEY} AND kind = 'kill_switch'
  `;
  return row?.enabled === true;
}

export async function decide(
  sql: Sql,
  court: string,
  at: Date = new Date(),
): Promise<FetchDecision> {
  const grant = AUTHORISATION;
  if (!grant) {
    return {
      allowed: false,
      reason: 'terms_not_on_file',
      detail:
        "the registrar's conditions are not transcribed into services/api/src/court/authorisation.ts; " +
        'CLAUDE.md requires that before any request is made, and this outranks the kill switch',
    };
  }

  // Instants, not dates. The grant expires at 12:00 on its final day, and a
  // date-only comparison would grant a free extra twelve hours of harvesting
  // under an expired permission — small, silent, and exactly the kind of
  // overreach that loses a grant.
  if (at.getTime() >= Date.parse(grant.expiresAt)) {
    return {
      allowed: false,
      reason: 'authorisation_expired',
      // Deliberately does NOT name the grant reference. The registrar required
      // that the letter's identifying details stay out of the application, and
      // `detail` is one `detail: decision.detail` away from a client payload.
      // The reference is recorded where it belongs — the fetch ledger.
      detail: `the grant expired at ${grant.expiresAt}`,
    };
  }

  /**
   * THE GRANT REQUIRES ATTRIBUTION ON EVERY REQUEST, AND WE CANNOT SEND ONE
   * WITHOUT IT.
   *
   * `authorisation.ts` made `attribution` optional and says "there is nowhere it
   * is rendered and nothing that breaks when it is absent." That is true of the
   * product surfaces and FALSE of the wire: `ecourts.ts` puts this exact string
   * in the `user-agent` of every request it makes, because the registrar should
   * be able to identify us in their own logs. With the value absent, the first
   * live request would go out unattributed — a silent breach of a condition of
   * the grant, made by a system that had just told itself it was allowed.
   *
   * So it is a refusal, in the same shape as `terms_not_on_file` and for the same
   * reason: a request whose compliance we could not demonstrate must not be
   * made. `packages/auth/src/mail.ts` is the standing pattern — refuse honestly
   * rather than run in a degraded mode that looks like the working one.
   *
   * Checked BEFORE the kill switch on purpose. Flipping the switch is a
   * deliberate human act, and it should not be the thing that surfaces a missing
   * credential: the operator turning harvesting on deserves to be told why it
   * will not run before they turn it on, not after.
   */
  if (!grantAttribution()) {
    return {
      allowed: false,
      reason: 'attribution_not_on_file',
      detail:
        'ECOURTS_GRANT_ATTRIBUTION is not set, and the grant requires its attribution string ' +
        'verbatim on every request; the adapter sends it as the user-agent. Refusing rather ' +
        'than making an unattributed request under an attributed permission.',
    };
  }

  if (!(await killSwitchEnabled(sql))) {
    return {
      allowed: false,
      reason: 'kill_switch_off',
      detail: `platform_config.${ECOURTS_KILL_SWITCH_KEY} is off (a missing row reads as off)`,
    };
  }

  // 'ALL_COURTS' is the grant saying "every court", which is a different fact
  // from an empty list — the latter reads as "none" and would refuse
  // everything. Checked explicitly so the two can never be confused.
  if (grant.permittedCourts !== 'ALL_COURTS' && !grant.permittedCourts.includes(court)) {
    return {
      allowed: false,
      reason: 'court_not_permitted',
      detail: `${court} is not among the courts this grant covers`,
    };
  }

  const hour = istHour(at);
  const { from, to } = grant.permittedHoursIst;
  if (hour < from || hour >= to) {
    return {
      allowed: false,
      reason: 'outside_permitted_hours',
      detail: `${hour}:00 IST is outside the permitted ${from}:00–${to}:00 IST`,
    };
  }

  // Counted from the ledger and only over rows that REACHED THE NETWORK. A
  // refusal must not consume the quota it just protected — otherwise a burst of
  // refusals would lock out the requests the grant actually allows.
  const [counts] = await sql<{ last_at: string | null; in_hour: number; in_day: number }[]>`
    SELECT
      max(requested_at)::text                                                       AS last_at,
      count(*) FILTER (WHERE requested_at > ${at.toISOString()}::timestamptz - interval '1 hour') AS in_hour,
      count(*) FILTER (WHERE requested_at > ${at.toISOString()}::timestamptz - interval '1 day')  AS in_day
    FROM ecourts_fetch_ledger
    WHERE outcome <> 'refused'
  `;

  const lastAt = counts?.last_at ? Date.parse(counts.last_at) : null;
  if (lastAt !== null) {
    const sinceMs = at.getTime() - lastAt;
    if (sinceMs < grant.minIntervalMs) {
      return {
        allowed: false,
        reason: 'min_interval',
        detail: `${sinceMs}ms since the last request, minimum ${grant.minIntervalMs}ms`,
      };
    }
  }

  const inHour = Number(counts?.in_hour ?? 0);
  if (inHour >= grant.maxRequestsPerHour) {
    return {
      allowed: false,
      reason: 'rate_limit_hourly',
      detail: `${inHour} requests in the last hour, limit ${grant.maxRequestsPerHour}`,
    };
  }

  const inDay = Number(counts?.in_day ?? 0);
  if (inDay >= grant.maxRequestsPerDay) {
    return {
      allowed: false,
      reason: 'rate_limit_daily',
      detail: `${inDay} requests in the last day, limit ${grant.maxRequestsPerDay}`,
    };
  }

  return { allowed: true, authorisation: grant };
}

export type LedgerEntry = {
  court: string | null;
  endpoint: string;
  outcome: 'ok' | 'refused' | 'error';
  httpStatus?: number | undefined;
  durationMs?: number | undefined;
  refusalReason?: string | undefined;
  causeListSyncId?: string | undefined;
};

/**
 * Write one row. Called on every decision — allowed or refused, succeeded or
 * errored — because a ledger with gaps proves nothing about the gaps.
 */
export async function record(sql: Sql, entry: LedgerEntry): Promise<void> {
  await sql`
    INSERT INTO ecourts_fetch_ledger
      (court, endpoint, outcome, http_status, duration_ms, authorisation_reference,
       refusal_reason, cause_list_sync_id)
    VALUES (
      ${entry.court}, ${entry.endpoint}, ${entry.outcome},
      ${entry.httpStatus ?? null}, ${entry.durationMs ?? null},
      -- The CONDITIONS fingerprint, not the letter's reference. It answers
      -- "which transcription was in force" more precisely — the reference
      -- names the letter and would not change if we re-transcribed its terms
      -- wrongly, whereas this hashes the limits we actually enforced. It also
      -- needs no confidential value, which is what lets the integration run
      -- while honouring the registrar's request that their identifiers stay
      -- out of the application. Falls back to the reference only if some
      -- future grant has no conditions to fingerprint.
      ${AUTHORISATION?.conditionsVersion ?? AUTHORISATION?.reference ?? null},
      ${entry.refusalReason ?? null},
      ${entry.causeListSyncId ?? null}
    )
  `;
}
