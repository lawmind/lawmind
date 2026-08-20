#!/usr/bin/env node
/**
 * NEW2 — REQUESTS PER USEFUL NEW FACT, FOR THE eCOURTS GRANT.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------
 *
 * The registrar's grant is a FIXED budget: 1,000 requests a day, 100 an hour, a
 * 2,000 ms minimum interval, to January 2029. Every request spent re-reading a
 * page that has not changed is a request not spent finding a listing that moved.
 *
 * The instinct is to divide that budget by court and leave it there. That is the
 * thing this tool exists to prevent. Allocation has to follow measured yield, and
 * yield is not `successful responses` — it is **new facts per request**. A court
 * whose cause list we fetch every hour and which publishes once a day returns
 * twenty-three duplicates for one fact; a court that revises listings through the
 * afternoon returns something new nearly every time. Those want opposite budgets
 * and no fixed distribution can express it.
 *
 * ---------------------------------------------------------------------------
 * IT RUNS TODAY, AGAINST ZERO TRAFFIC, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 *
 * `ecourts_harvest` is off — the ledger holds 52 rows, all `refused` /
 * `kill_switch_off`, and no request has ever been made. So every rate below is
 * currently null or zero, reported honestly rather than hidden.
 *
 * Building it now is the point: the first live traffic is a bounded canary, and a
 * canary whose efficiency cannot be read is a canary that teaches nothing. The
 * measurement has to exist BEFORE the traffic, or the first thousand requests are
 * spent learning what the tool would have told us.
 *
 * A rate over zero requests is `null`, never `0`. Those mean different things and
 * a dashboard that renders "0% duplicate" for "we have not asked anything" is the
 * same failure as an unverified citation shown as confirmed.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATES ARE COUNTED, NOT SUPPRESSED
 * ---------------------------------------------------------------------------
 *
 * `ecourts_observation` has no unique constraint on `payload_sha256` on purpose:
 * the court saying the same thing again on a later date is a DIFFERENT FACT from
 * us not having asked. So a duplicate is a row, and the duplicate RATE is the
 * signal this tool reads. Collapsing them at write time would have destroyed the
 * only evidence that a polling interval is too tight.
 *
 *   node --env-file=.env scripts/migration/new2-ecourts-efficiency.mjs \
 *     [--days 14] [--out docs/ops/migration/new2-ecourts-efficiency.json]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sslFor } from './new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const DAYS = Number(arg('days', '14'));
const OUT = arg('out', join(ROOT, 'docs', 'ops', 'migration', 'new2-ecourts-efficiency.json'));

/** The grant's own ceilings, from `services/api/src/court/authorisation.ts`. */
const GRANT = { maxRequestsPerHour: 100, maxRequestsPerDay: 1000, minIntervalMs: 2000 };

/** `null` rather than 0 when there is no denominator. They are different facts. */
const rate = (num, den) => (den > 0 ? Number((num / den).toFixed(4)) : null);

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL not set — run with node --env-file=.env');
  process.exit(2);
}
const sql = postgres(url, {
  ssl: sslFor(url),
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
  prepare: false,
});

try {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

  const [ledger] = await sql`
    SELECT count(*)::int                                                        AS requests_total,
           count(*) FILTER (WHERE outcome <> 'refused')::int                    AS requests_made,
           count(*) FILTER (WHERE outcome = 'refused')::int                     AS refusals,
           count(*) FILTER (WHERE outcome = 'ok')::int                          AS ok,
           count(*) FILTER (WHERE outcome NOT IN ('ok','refused'))::int         AS failures,
           min(requested_at)                                                    AS first_at,
           max(requested_at)                                                    AS last_at
      FROM ecourts_fetch_ledger
     WHERE requested_at >= ${since}::timestamptz`;

  const refusalReasons = await sql`
    SELECT coalesce(refusal_reason, '(none)') AS reason, count(*)::int AS n
      FROM ecourts_fetch_ledger
     WHERE requested_at >= ${since}::timestamptz AND outcome = 'refused'
     GROUP BY 1 ORDER BY 2 DESC`;

  const [obs] = await sql`
    SELECT count(*)::int                                                AS observations,
           count(DISTINCT payload_sha256)::int                          AS distinct_payloads,
           count(*) FILTER (WHERE extraction_state = 'parsed')::int      AS parsed,
           count(*) FILTER (WHERE extraction_state = 'partial')::int     AS partial,
           count(*) FILTER (WHERE extraction_state = 'unreadable')::int  AS unreadable
      FROM ecourts_observation
     WHERE observed_at >= ${since}::timestamptz`;

  const [trans] = await sql`
    SELECT count(*)::int AS transitions,
           count(*) FILTER (WHERE notified_at IS NULL)::int AS unnotified
      FROM ecourts_transition
     WHERE derived_at >= ${since}::timestamptz`;

  const byCourt = await sql`
    SELECT l.court,
           count(*)::int                                             AS requests,
           count(*) FILTER (WHERE l.outcome <> 'refused')::int        AS made,
           count(o.id)::int                                          AS observations,
           count(DISTINCT o.payload_sha256)::int                     AS distinct_payloads
      FROM ecourts_fetch_ledger l
      LEFT JOIN ecourts_observation o ON o.fetch_ledger_id = l.id
     WHERE l.requested_at >= ${since}::timestamptz
     GROUP BY l.court
     ORDER BY count(*) DESC`;

  /* The busiest hour ever recorded, against the ceiling. The registrar's
   * question is not "what was the average" — an average inside a limit says
   * nothing about whether the limit was ever breached. */
  const [peak] = await sql`
    SELECT coalesce(max(n), 0)::int AS peak_hour
      FROM (SELECT count(*)::int AS n
              FROM ecourts_fetch_ledger
             WHERE outcome <> 'refused'
             GROUP BY date_trunc('hour', requested_at)) h`;

  const [peakDay] = await sql`
    SELECT coalesce(max(n), 0)::int AS peak_day
      FROM (SELECT count(*)::int AS n
              FROM ecourts_fetch_ledger
             WHERE outcome <> 'refused'
             GROUP BY date_trunc('day', requested_at)) d`;

  const made = ledger.requests_made;
  const out = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    windowDays: DAYS,
    since,
    grant: GRANT,
    requests: {
      total: ledger.requests_total,
      made,
      refused: ledger.refusals,
      ok: ledger.ok,
      failed: ledger.failures,
      firstAt: ledger.first_at,
      lastAt: ledger.last_at,
      /* Refusals do not consume quota, so they are excluded from every
       * headroom figure. A burst of refusals must never lock out the requests
       * the grant actually allows. */
      peakHourAgainstCeiling: { peak: peak.peak_hour, ceiling: GRANT.maxRequestsPerHour },
      peakDayAgainstCeiling: { peak: peakDay.peak_day, ceiling: GRANT.maxRequestsPerDay },
      refusalReasons: Object.fromEntries(refusalReasons.map((r) => [r.reason, r.n])),
    },
    observations: {
      total: obs.observations,
      distinctPayloads: obs.distinct_payloads,
      duplicates: obs.observations - obs.distinct_payloads,
      duplicateRate: rate(obs.observations - obs.distinct_payloads, obs.observations),
      parsed: obs.parsed,
      partial: obs.partial,
      unreadable: obs.unreadable,
    },
    stateChanges: {
      transitions: trans.transitions,
      unnotified: trans.unnotified,
    },
    efficiency: {
      /* THE number. Everything else on this page exists to explain it. */
      requestsPerNewFact:
        obs.distinct_payloads > 0 ? Number((made / obs.distinct_payloads).toFixed(2)) : null,
      requestsPerStateChange:
        trans.transitions > 0 ? Number((made / trans.transitions).toFixed(2)) : null,
      observationsPerRequest: rate(obs.observations, made),
      failureRate: rate(ledger.failures, made),
    },
    byCourt: byCourt.map((c) => ({
      court: c.court,
      requests: c.requests,
      made: c.made,
      observations: c.observations,
      distinctPayloads: c.distinct_payloads,
      duplicateRate: rate(c.observations - c.distinct_payloads, c.observations),
      requestsPerNewFact:
        c.distinct_payloads > 0 ? Number((c.made / c.distinct_payloads).toFixed(2)) : null,
    })),
    caveats: [
      'A rate over a zero denominator is null, never 0. "We made no requests" and "we made requests and none was wasted" are different facts and a dashboard that renders them the same is lying by omission.',
      'Refusals are rows in the ledger but do not consume quota, so they are excluded from every headroom figure and included in the totals. The ledger records refusals precisely so that the locks can be shown to have held.',
      'requestsPerNewFact counts a DISTINCT payload as the fact. Two fetches returning identical bytes are one fact and two requests, which is exactly the waste this measures.',
      'A duplicate observation is still written. There is no unique constraint on payload_sha256 because the court repeating itself on a later date is a different fact from our not having asked, and collapsing them would destroy the signal this tool reads.',
      'A state change is an ecourts_transition row, derived by LCC. This tool counts them; it never derives one, and in particular it never treats a cause-list appearance as a hearing having occurred.',
    ],
  };

  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  const fmt = (v) => (v === null ? 'n/a — no denominator' : String(v));
  console.log(
    [
      `window                     last ${DAYS} days`,
      `requests logged            ${out.requests.total}`,
      `  made (quota-consuming)   ${out.requests.made}`,
      `  refused (no quota)       ${out.requests.refused}`,
      ...Object.entries(out.requests.refusalReasons).map(([k, v]) => `      ${k.padEnd(22)} ${v}`),
      `peak hour / ceiling        ${peak.peak_hour} / ${GRANT.maxRequestsPerHour}`,
      `peak day  / ceiling        ${peakDay.peak_day} / ${GRANT.maxRequestsPerDay}`,
      '',
      `observations               ${out.observations.total}`,
      `  distinct payloads        ${out.observations.distinctPayloads}`,
      `  duplicate rate           ${fmt(out.observations.duplicateRate)}`,
      `  unreadable               ${out.observations.unreadable}`,
      `state changes              ${out.stateChanges.transitions}`,
      '',
      `REQUESTS PER NEW FACT      ${fmt(out.efficiency.requestsPerNewFact)}`,
      `requests per state change  ${fmt(out.efficiency.requestsPerStateChange)}`,
      '',
      `written ${OUT}`,
    ].join('\n'),
  );
} finally {
  await sql.end({ timeout: 5 });
}
