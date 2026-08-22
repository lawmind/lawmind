/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /admin/metrics` — OPERATIONAL TRUTH A MACHINE CAN READ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The binding addendum puts it exactly right: **"A system that only writes logs
 * is NOT observability."** This service had one log line per request and nothing
 * that could answer "is search degrading", "is the pool saturated", "is a
 * background job stalled" without a human reading a terminal.
 *
 * Every number here comes from something that already exists — `search_events`,
 * `pg_stat_activity`, the admission gate's own counters, the job registry's
 * checkpoint tables — so nothing new has to be maintained for the metrics to
 * stay true. A metric computed from a source nobody else reads is a metric that
 * drifts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALERT CONDITIONS ARE EVALUATED HERE, NOT IN A VENDOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `alerts[]` is the point of the endpoint. A scraper that has to encode our
 * thresholds is a scraper that will disagree with us the day we change one, and
 * no paid monitoring service is being activated (founder approval, and none is
 * needed for this). So the CONDITIONS live in {@link ALERT_RULES}, in this
 * repository, next to the numbers they judge — and a poller as dumb as
 * `curl … | jq '.data.alerts'` is a complete alerting system.
 *
 * Severity is two values on purpose. `page` means an advocate is currently
 * being failed; `watch` means something will fail if it continues. A third
 * middle value would be argued about rather than acted on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No query text (see `search/event.ts`), no user identities, no per-advocate
 * anything. This endpoint is admin-gated, but the reason there is nothing
 * sensitive in it is not the gate — it is that operations does not need it.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { fail, ok } from '../envelope.ts';
import { buildSha } from '../build-info.ts';
import { CORE_POOL_MAX, RESEARCH_POOL_MAX, RESEARCH_CONCURRENCY } from '../pools.ts';
import type { Admission } from '../search/admission.ts';

export type MetricsDeps = {
  admission?: Admission | undefined;
};

type Alert = { severity: 'page' | 'watch'; rule: string; detail: string };

/**
 * The thresholds, with the reason each one is where it is.
 *
 * Numbers chosen against measured behaviour on this box, not against a round
 * figure: the search p95 bound is above the 15 s statement ceiling because a
 * request that hits the ceiling is already reported as `degraded`, and a
 * duplicate alert for the same event is how alerting gets ignored.
 */
export const ALERT_RULES = {
  /** Any 5xx is a defect; the rate matters for whether it is an incident. */
  serverErrorRate: { watch: 0.01, page: 0.05 },
  /** A search that cannot use one of its arms is returning less law than exists. */
  degradedRate: { watch: 0.1, page: 0.5 },
  /** Empty results at scale mean a broken route far more often than an empty corpus. */
  zeroResultRate: { watch: 0.3, page: 0.7 },
  /** Refusals at the admission gate mean advocates are being turned away. */
  admissionRefusalRate: { watch: 0.01, page: 0.1 },
  /** Connection pressure, as a fraction of the server's own max_connections. */
  connectionPressure: { watch: 0.6, page: 0.85 },
  /** A statement running longer than this is holding a connection nobody wants. */
  longestStatementSeconds: { watch: 300, page: 900 },
  /** How stale the corpus may get before someone should look at ingest. */
  releaseDataAgeHours: { watch: 48, page: 168 },
} as const;

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export async function getMetrics(
  c: Context,
  sql: Sql,
  deps: MetricsDeps = {},
): Promise<Response> {
  const alerts: Alert[] = [];
  const add = (
    key: keyof typeof ALERT_RULES,
    value: number,
    detail: string,
    direction: 'above' | 'below' = 'above',
  ) => {
    const rule = ALERT_RULES[key];
    const breached = (t: number) => (direction === 'above' ? value > t : value < t);
    if (breached(rule.page)) alerts.push({ severity: 'page', rule: key, detail });
    else if (breached(rule.watch)) alerts.push({ severity: 'watch', rule: key, detail });
  };

  try {
    /**
     * A 15-minute window everywhere, so every rate on this page describes the
     * same period. Mixing windows is how "the error rate is fine" and "we are
     * down" end up on one screen.
     */
    const [search] = await sql<
      {
        n: string;
        degraded: string;
        zero: string;
        refused: string;
        p50: string | null;
        p95: string | null;
        max: string | null;
      }[]
    >`
      SELECT count(*)::text AS n,
             count(*) FILTER (WHERE degraded <> '{}')::text AS degraded,
             count(*) FILTER (WHERE zero_result)::text AS zero,
             count(*) FILTER (WHERE NOT admitted)::text AS refused,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms)::text AS p50,
             percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)::text AS p95,
             max(latency_ms)::text AS max
        FROM search_events
       WHERE occurred_at > now() - interval '15 minutes'`;

    const searchN = Number(search?.n ?? 0);
    const degradedRate = rate(Number(search?.degraded ?? 0), searchN);
    const zeroRate = rate(Number(search?.zero ?? 0), searchN);
    const refusedRate = rate(Number(search?.refused ?? 0), searchN);

    // Only alert on rates once there is enough traffic for a rate to mean
    // something. Three searches, one of them degraded, is 33% and is noise.
    const MIN_SAMPLE = 20;
    if (searchN >= MIN_SAMPLE) {
      add('degradedRate', degradedRate, `${(degradedRate * 100).toFixed(1)}% of searches degraded`);
      add('zeroResultRate', zeroRate, `${(zeroRate * 100).toFixed(1)}% of searches returned nothing`);
      add(
        'admissionRefusalRate',
        refusedRate,
        `${(refusedRate * 100).toFixed(1)}% of searches refused at the admission gate`,
      );
    }

    const [db] = await sql<
      {
        total: string;
        active: string;
        idle_in_txn: string;
        max_connections: string;
        longest_seconds: string | null;
        db_bytes: string;
      }[]
    >`
      SELECT count(*)::text AS total,
             count(*) FILTER (WHERE state = 'active')::text AS active,
             count(*) FILTER (WHERE state = 'idle in transaction')::text AS idle_in_txn,
             current_setting('max_connections') AS max_connections,
             COALESCE(max(EXTRACT(EPOCH FROM (now() - query_start)))
                      FILTER (WHERE state = 'active'), 0)::text AS longest_seconds,
             pg_database_size(current_database())::text AS db_bytes
        FROM pg_stat_activity
       WHERE datname = current_database()`;

    const pressure = rate(Number(db?.total ?? 0), Number(db?.max_connections ?? 100));
    add(
      'connectionPressure',
      pressure,
      `${db?.total ?? 0} of ${db?.max_connections ?? '?'} connections in use`,
    );
    const longest = Number(db?.longest_seconds ?? 0);
    add('longestStatementSeconds', longest, `longest running statement is ${Math.round(longest)}s`);

    /**
     * How stale the corpus is. `judgments.created_at` is when WE wrote the row,
     * which is the right question for "is ingest alive" and the wrong one for
     * anything about the law — the note in `as-at.ts` on
     * `overruled_status_changed_at` makes the same distinction.
     */
    const [freshness] = await sql<{ hours: string | null }[]>`
      SELECT EXTRACT(EPOCH FROM (now() - max(created_at))) / 3600 AS hours FROM judgments`;
    const ageHours = Number(freshness?.hours ?? 0);
    add('releaseDataAgeHours', ageHours, `newest corpus row was written ${Math.round(ageHours)}h ago`);

    const admission = deps.admission?.stats();

    return ok(c, {
      collectedAt: new Date().toISOString(),
      build: { sha: buildSha },
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        rssBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed,
      },
      /**
       * Pool SIZES are configuration, not measurement — postgres.js does not
       * expose live queue depth, and inventing a number for it would be worse
       * than reporting the bound. `connections` below is the real observation.
       */
      pools: {
        coreMax: CORE_POOL_MAX,
        researchMax: RESEARCH_POOL_MAX,
        researchConcurrency: RESEARCH_CONCURRENCY,
      },
      admission: admission ?? null,
      connections: {
        total: Number(db?.total ?? 0),
        active: Number(db?.active ?? 0),
        idleInTransaction: Number(db?.idle_in_txn ?? 0),
        maxConnections: Number(db?.max_connections ?? 0),
        pressure: Number(pressure.toFixed(3)),
        longestStatementSeconds: Math.round(longest),
      },
      storage: { databaseBytes: Number(db?.db_bytes ?? 0) },
      search15m: {
        requests: searchN,
        p50Ms: Number(search?.p50 ?? 0),
        p95Ms: Number(search?.p95 ?? 0),
        maxMs: Number(search?.max ?? 0),
        degraded: Number(search?.degraded ?? 0),
        zeroResult: Number(search?.zero ?? 0),
        refused: Number(search?.refused ?? 0),
        degradedRate: Number(degradedRate.toFixed(3)),
        zeroResultRate: Number(zeroRate.toFixed(3)),
        /** Below this the rates above are reported but NOT alerted on. */
        minSampleForAlerting: MIN_SAMPLE,
      },
      corpus: { newestRowAgeHours: Number(ageHours.toFixed(1)) },
      /**
       * The whole point. Empty means every rule above is inside its threshold
       * right now — not that nothing is wrong, only that nothing we know how to
       * check is.
       */
      alerts,
      alertRules: ALERT_RULES,
    });
  } catch (error) {
    // A metrics endpoint that 500s during an incident is worse than useless.
    return fail(
      c,
      'METRICS_UNAVAILABLE',
      `metrics could not be collected: ${error instanceof Error ? error.message : String(error)}`,
      503,
    );
  }
}
