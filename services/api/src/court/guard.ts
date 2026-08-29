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
import type { Sql, TransactionSql } from 'postgres';

import { AUTHORISATION, type EcourtsAuthorisation, grantAttribution, istHour } from './authorisation.ts';

/**
 * Every function here takes either the pool or an open transaction, because
 * quota admission is only safe INSIDE one. Widening the parameter is what lets
 * `decide` be reused under the reservation lock instead of being reimplemented
 * beside it — two copies of the limiter is two limiters, and the second one
 * always drifts.
 */
export type Db = Sql | TransactionSql;

/**
 * Run `fn` in its own atomic unit, whether or not one is already open.
 *
 * A pool gives a transaction; inside a transaction the only nested atomic unit
 * Postgres offers is a savepoint. Callers that must be all-or-nothing —
 * reservation, and a whole page of listings — should not have to know which
 * they were handed, and a test that wraps the world in a rolled-back
 * transaction should not silently lose that guarantee.
 */
export async function atomically<T>(
  sql: Db,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const run = 'begin' in sql ? sql.begin.bind(sql) : sql.savepoint.bind(sql);
  return (await run((tx: TransactionSql) => fn(tx))) as unknown as T;
}

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
export async function killSwitchEnabled(sql: Db): Promise<boolean> {
  const [row] = await sql<{ enabled: boolean }[]>`
    SELECT enabled FROM platform_config
    WHERE key = ${ECOURTS_KILL_SWITCH_KEY} AND kind = 'kill_switch'
  `;
  return row?.enabled === true;
}

export async function decide(
  sql: Db,
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
      -- iso-time-exempt: consumed by Date.parse three lines below for the min-interval arithmetic and never returned; nothing in the decision this function makes reaches a client as a timestamp.
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

/**
 * Master Roadmap v5 §3.4. Quota is the binding constraint on the premium
 * business, and "how many matters can we monitor" is only answerable if each
 * request records which strategy spent it. A cause list covering forty listed
 * matters and a single case-status poll cost the same one request and buy
 * wildly different amounts of product.
 */
export type ObservationStrategy =
  | 'CAUSE_LIST_BATCH'
  | 'CASE_STATUS'
  | 'ORDER_CHECK'
  | 'USER_REFRESH';

export type LedgerEntry = {
  court: string | null;
  endpoint: string;
  outcome: 'ok' | 'refused' | 'error';
  httpStatus?: number | undefined;
  durationMs?: number | undefined;
  refusalReason?: string | undefined;
  causeListSyncId?: string | undefined;
  observationStrategy?: ObservationStrategy | undefined;
  /** The instant the decision was made. Defaults to the row's own `now()`. */
  requestedAt?: Date | undefined;
};

/**
 * Write one row. Called on every decision — allowed or refused, succeeded or
 * errored — because a ledger with gaps proves nothing about the gaps.
 */
export async function record(sql: Db, entry: LedgerEntry): Promise<void> {
  await insertLedgerRow(sql, entry);
}

/** The single INSERT. `record` and `reserve` must never write different rows. */
async function insertLedgerRow(sql: Db, entry: LedgerEntry): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO ecourts_fetch_ledger
      (requested_at, court, endpoint, outcome, http_status, duration_ms,
       authorisation_reference, refusal_reason, cause_list_sync_id, observation_strategy)
    VALUES (
      -- The instant the DECISION was made, so the min-interval arithmetic the
      -- next caller does is against the same clock the limiter just used.
      coalesce(${entry.requestedAt?.toISOString() ?? null}::timestamptz, now()),
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
      ${entry.causeListSyncId ?? null},
      ${entry.observationStrategy ?? null}
    )
    RETURNING id
  `;
  return row!.id;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ATOMIC QUOTA RESERVATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `decide` reads the ledger and returns a verdict. That verdict is true at the
 * instant it is computed and stops being true the moment anyone else asks,
 * because nothing between the read and the request records that a slot was
 * taken. With one caller and no scheduler this never mattered. The adaptive
 * observation planner in Master Roadmap v5 §3.4 introduces several, and then it
 * is the classic read-then-act race: two workers each read "99 requests this
 * hour, limit 100", each conclude they may proceed, and the grant is breached
 * by a system whose ledger will faithfully record both requests as permitted.
 *
 * So admission and reservation happen together, under a transaction-scoped
 * Postgres advisory lock, and the reservation is a COMMITTED LEDGER ROW before
 * the network is touched:
 *
 *   BEGIN
 *     pg_advisory_xact_lock(ECOURTS_QUOTA_LOCK_KEY)   -- global, one at a time
 *     decide()                                        -- the same limiter, no copy
 *     INSERT the row that spends the slot
 *   COMMIT                                            -- lock released here
 *   ... only now may the caller make the request ...
 *
 * The row is inserted as `error`, not as a fourth outcome, and it is the honest
 * state: an attempt whose result we do not yet know is not a success. A process
 * that dies mid-flight therefore leaves a row that still counts against the
 * quota, which is the direction a bounded permission must fail in. `settle`
 * corrects it to `ok` when the response actually arrives.
 *
 * Refusals are inserted too, still without consuming quota — `decide` counts
 * only rows whose outcome is not `refused`, so a burst of refusals cannot lock
 * out the requests the grant does allow.
 */

/**
 * One global lock for the whole grant. Not per court: the limits are 2,000 ms
 * apart, 100/hour and 1,000/day ACROSS everything we do under this permission,
 * so a per-court lock would let 26 courts each spend the same budget.
 *
 * The value is the date the registrar granted permission. Nothing else in this
 * codebase takes an advisory lock, and a constant that names the grant is
 * easier to recognise in `pg_locks` than a hash would be.
 */
export const ECOURTS_QUOTA_LOCK_KEY = 20_260_807;

export type Reservation =
  | { allowed: true; ledgerId: string; authorisation: EcourtsAuthorisation }
  | { allowed: false; ledgerId: string; reason: RefusalReason; detail: string };

export type ReservationRequest = {
  court: string;
  endpoint: string;
  strategy: ObservationStrategy;
  causeListSyncId?: string | undefined;
};

/**
 * Ask for one request's worth of quota, and have the answer be durable.
 *
 * Returns a ledger row id either way — a refusal is evidence and gets an id
 * exactly as an allowance does. The caller may contact eCourts if and only if
 * `allowed` is true, and must call `settle` with what happened.
 */
export async function reserve(
  sql: Db,
  request: ReservationRequest,
  at: Date = new Date(),
): Promise<Reservation> {
  const result = await atomically(sql, async (tx) => {
    // Transaction-scoped: released by COMMIT or ROLLBACK, including a crash.
    // There is no unlock to forget and no lock to leak.
    await tx`SELECT pg_advisory_xact_lock(${ECOURTS_QUOTA_LOCK_KEY})`;

    const decision = await decide(tx, request.court, at);
    if (!decision.allowed) {
      const ledgerId = await insertLedgerRow(tx, {
        court: request.court,
        endpoint: request.endpoint,
        outcome: 'refused',
        refusalReason: decision.reason,
        observationStrategy: request.strategy,
        causeListSyncId: request.causeListSyncId,
        requestedAt: at,
      });
      return { allowed: false, ledgerId, reason: decision.reason, detail: decision.detail };
    }

    const ledgerId = await insertLedgerRow(tx, {
      court: request.court,
      endpoint: request.endpoint,
      // Not yet a success, and deliberately so — see the header. The row is
      // committed before the request is made, so a crash cannot hand the next
      // caller a slot that was already spent.
      outcome: 'error',
      observationStrategy: request.strategy,
      causeListSyncId: request.causeListSyncId,
      requestedAt: at,
    });
    return { allowed: true, ledgerId, authorisation: decision.authorisation };
  });
  return result as unknown as Reservation;
}

export type Settlement = {
  outcome: 'ok' | 'error';
  httpStatus?: number | undefined;
  durationMs?: number | undefined;
  causeListSyncId?: string | undefined;
};

/**
 * Record what became of a reserved request.
 *
 * Never inserts. A second row would spend a second slot for one request, and
 * the ledger's whole job is that the count of rows is the count of requests.
 * The row already exists; this fills in the outcome the network supplied.
 */
export async function settle(
  sql: Db,
  ledgerId: string,
  settlement: Settlement,
): Promise<void> {
  await sql`
    UPDATE ecourts_fetch_ledger
       SET outcome           = ${settlement.outcome},
           http_status       = ${settlement.httpStatus ?? null},
           duration_ms       = ${settlement.durationMs ?? null},
           cause_list_sync_id = coalesce(${settlement.causeListSyncId ?? null}, cause_list_sync_id)
     WHERE id = ${ledgerId}
       AND outcome <> 'refused'
  `;
}
