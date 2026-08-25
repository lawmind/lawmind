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
import { statfs } from 'node:fs/promises';

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
  /**
   * Free disk, as a FRACTION of the filesystem holding this service.
   *
   * Added because it was the one resource nothing here watched, and it is the
   * one whose exhaustion is not graceful: PostgreSQL stops accepting writes,
   * the ingest fleet dies mid-batch, and the first symptom is a 500 rather
   * than a slowdown. `direction: 'below'` — this alerts when the number is
   * SMALL, which is why `add` takes a direction at all.
   */
  diskFreeFraction: { watch: 0.15, page: 0.07 },
  /**
   * Hours since the newest briefing was generated.
   *
   * The sweep runs at 23:00 IST, so anything under 24 is normal and 30 gives
   * it a margin for a slow night. `page` at 50 is two consecutive misses —
   * one missed sweep costs a briefing, two is a broken cron.
   *
   * **This is the wedge.** A briefing that does not arrive is the product not
   * happening, and it fails SILENTLY: nobody complains about an email they did
   * not know to expect.
   */
  briefingSweepAgeHours: { watch: 30, page: 50 },
  /**
   * Briefings generated but never delivered, as a fraction.
   *
   * Generation and delivery are different jobs and they fail separately. A
   * sweep that assembles a hundred briefings and delivers none looks perfectly
   * healthy to every rule above it.
   */
  briefingUndeliveredRate: { watch: 0.2, page: 0.6 },
  /**
   * Critical background jobs that are alive and not working, or that the
   * registry declares RUNNING over a process that is not there.
   *
   * Read from `ops_job_current`, published by `scripts/job-health.mjs`. ONE is
   * a page: these are counted jobs, not a rate, and the two on this list that
   * matter most (the GPU document walk, the citation walk) fail exactly once
   * and then stay failed silently for days.
   */
  stalledCriticalJobs: { watch: 1, page: 1 },
  /**
   * How stale the control plane's own feed is.
   *
   * Without this rule, killing `job-health` makes every job read healthy
   * forever — the failure mode where absence of evidence is served as evidence
   * of absence. The publisher is expected on a schedule; two missed ticks is a
   * watch and a long silence is a page, because a pager that cannot see the
   * workers is itself an outage.
   */
  jobObservationAgeHours: { watch: 2, page: 12 },
} as const;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ABSOLUTE RULES — WHAT A RATE CANNOT SEE AT LAUNCH TRAFFIC
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every search rule above is a RATE, and every rate is gated behind
 * `MIN_SAMPLE` because three requests with one failure is 33% and is noise.
 * That gate is right, and it has a hole the size of the first week of launch:
 * with nineteen searches in fifteen minutes, ALL NINETEEN can 5xx and no rule
 * fires, because the denominator never arrived.
 *
 * So the rates keep their sample gate and these two absolute conditions sit
 * underneath it, where the numbers are small enough to read directly:
 *
 *   ANY_SERVER_ERROR   a 5xx is a defect at n=1. metrics.ts has always said so
 *                      in a comment above `serverErrorRate`; this is that
 *                      sentence made executable.
 *   TOTAL_SEARCH_FAILURE  every search in the window failed. At n=2 that is a
 *                      100% rate the sample gate refuses to look at, and it is
 *                      the exact shape of a route that is simply down.
 *
 * Neither is a threshold, so neither goes in ALERT_RULES: they are
 * contradictions, judged the way `briefingSweepZeroWrite` is.
 */
export const LOW_TRAFFIC_ABSOLUTE = {
  /** Below this many requests the rate rules stay silent and these take over. */
  appliesBelowSample: 20,
} as const;

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export type MetricsSnapshot = {
  payload: Record<string, unknown>;
  alerts: Alert[];
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COLLECTION IS SEPARATE FROM THE ROUTE, SO THE POLLER CANNOT DISAGREE WITH IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `GET /admin/metrics` used to be the only caller and the evaluation lived
 * inside the handler. Then `ops/alert-poller.ts` needed the same verdicts, and
 * there were exactly two options: give the poller its own copy of the
 * thresholds, or lift the evaluation out.
 *
 * A second copy is how the endpoint and the pager end up saying different
 * things about the same minute — the identical failure `precedential-effect.ts`
 * was written to end, one level down the stack. So there is one collector, the
 * route renders it, and the poller acts on it.
 *
 * Throws on failure. The ROUTE turns that into a 503; the poller has to treat a
 * collector that cannot run as its own alert, because "no alerts" and "could
 * not look" are the same silence.
 */
export async function collectMetrics(
  sql: Sql,
  deps: MetricsDeps = {},
): Promise<MetricsSnapshot> {
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

  {
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
        failed: string;
        p50: string | null;
        p95: string | null;
        max: string | null;
      }[]
    >`
      SELECT count(*)::text AS n,
             count(*) FILTER (WHERE degraded <> '{}')::text AS degraded,
             count(*) FILTER (WHERE zero_result)::text AS zero,
             count(*) FILTER (WHERE NOT admitted)::text AS refused,
             count(*) FILTER (WHERE http_status >= 500)::text AS failed,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms)::text AS p50,
             percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)::text AS p95,
             max(latency_ms)::text AS max
        FROM search_events
       WHERE occurred_at > now() - interval '15 minutes'`;

    const searchN = Number(search?.n ?? 0);
    const degradedRate = rate(Number(search?.degraded ?? 0), searchN);
    const zeroRate = rate(Number(search?.zero ?? 0), searchN);
    const refusedRate = rate(Number(search?.refused ?? 0), searchN);
    /**
     * Separated from `zeroResultRate` because they were indistinguishable and
     * that cost us an hour. A 5xx is US being broken; a zero result is the
     * corpus having nothing. Migration `0076` carries the incident.
     */
    const failedRate = rate(Number(search?.failed ?? 0), searchN);

    // Only alert on rates once there is enough traffic for a rate to mean
    // something. Three searches, one of them degraded, is 33% and is noise.
    const MIN_SAMPLE = LOW_TRAFFIC_ABSOLUTE.appliesBelowSample;
    const failedCount = Number(search?.failed ?? 0);
    if (searchN >= MIN_SAMPLE) {
      add('degradedRate', degradedRate, `${(degradedRate * 100).toFixed(1)}% of searches degraded`);
      add('zeroResultRate', zeroRate, `${(zeroRate * 100).toFixed(1)}% of searches returned nothing`);
      add('serverErrorRate', failedRate, `${(failedRate * 100).toFixed(1)}% of searches returned 5xx`);
      add(
        'admissionRefusalRate',
        refusedRate,
        `${(refusedRate * 100).toFixed(1)}% of searches refused at the admission gate`,
      );
    } else if (failedCount > 0) {
      /* The launch-week hole. See LOW_TRAFFIC_ABSOLUTE: below the sample gate
       * the rates say nothing at all, so the raw count has to speak. */
      alerts.push({
        severity: searchN > 0 && failedCount === searchN ? 'page' : 'watch',
        rule: failedCount === searchN ? 'searchTotalFailureLowTraffic' : 'searchErrorLowTraffic',
        detail:
          `${failedCount} of ${searchN} searches in 15m returned 5xx — below the ` +
          `${MIN_SAMPLE}-request sample gate, so no rate rule can see this`,
      });
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

    /**
     * Free disk. `statfs` rather than a shelled-out `df`/`wmic`: it is in the
     * standard library, it works on both platforms this repo runs on, and a
     * metrics endpoint that spawns a process during an incident is a metrics
     * endpoint that stops working during an incident.
     *
     * Reported as a FRACTION as well as bytes, because the threshold has to
     * hold on a 500 GB workstation and on a small serving box without being
     * re-tuned per host.
     */
    let disk: { totalBytes: number; freeBytes: number; freeFraction: number } | null = null;
    try {
      const fsStat = await statfs(process.cwd());
      const totalBytes = Number(fsStat.blocks) * Number(fsStat.bsize);
      const freeBytes = Number(fsStat.bavail) * Number(fsStat.bsize);
      if (totalBytes > 0) {
        const freeFraction = freeBytes / totalBytes;
        disk = { totalBytes, freeBytes, freeFraction };
        add(
          'diskFreeFraction',
          freeFraction,
          `${(freeFraction * 100).toFixed(1)}% free (${Math.round(freeBytes / 1024 ** 3)} GiB)`,
          'below',
        );
      }
    } catch {
      /* An unreadable filesystem is not an alert about disk space. It is
       * reported as `disk: null`, which is honestly different from "plenty". */
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     * BRIEFING SWEEP HEALTH — THE WEDGE, AND IT FAILS SILENTLY
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Four questions, because they fail separately and each one alone looks
     * healthy:
     *
     *   1. did the job RUN?            — newest `generated_at`
     *   2. was there work to do?       — matters with a hearing date ahead
     *   3. did it WRITE anything?      — briefings for those dates
     *   4. did DELIVERY happen?        — `delivered_at`
     *
     * (2) is what makes (3) meaningful. "Zero briefings written" is correct on
     * a night when no matter has a hearing, and is an outage on a night when
     * fifty do — and without the denominator those two are the same number.
     */
    const [briefing] = await sql<
      {
        newest_hours: string | null;
        due_matters: string;
        generated_for_due: string;
        recent: string;
        undelivered: string;
      }[]
    >`
      SELECT
        EXTRACT(EPOCH FROM (now() - max(b.generated_at))) / 3600 AS newest_hours,
        (SELECT count(*) FROM matters m
          WHERE m.status = 'active'
            AND m.next_hearing_date IS NOT NULL
            AND m.next_hearing_date BETWEEN current_date AND current_date + 1)::text
          AS due_matters,
        (SELECT count(*) FROM briefings b2
          WHERE b2.hearing_date BETWEEN current_date AND current_date + 1)::text
          AS generated_for_due,
        count(*) FILTER (WHERE b.generated_at > now() - interval '48 hours')::text AS recent,
        count(*) FILTER (WHERE b.generated_at > now() - interval '48 hours'
                           AND b.delivered_at IS NULL)::text AS undelivered
      FROM briefings b`;

    const dueMatters = Number(briefing?.due_matters ?? 0);
    const generatedForDue = Number(briefing?.generated_for_due ?? 0);
    const recentBriefings = Number(briefing?.recent ?? 0);
    const undelivered = Number(briefing?.undelivered ?? 0);
    const briefingAgeHours = briefing?.newest_hours === null ? null : Number(briefing?.newest_hours);

    /**
     * Only alerted on once a briefing has EVER been generated. On a database
     * where the feature has never run, `max(generated_at)` is null and an
     * infinite age would page about a job that was never scheduled.
     */
    if (briefingAgeHours !== null) {
      add(
        'briefingSweepAgeHours',
        briefingAgeHours,
        `newest briefing was generated ${Math.round(briefingAgeHours)}h ago`,
      );
      if (recentBriefings > 0) {
        const undeliveredRate = rate(undelivered, recentBriefings);
        add(
          'briefingUndeliveredRate',
          undeliveredRate,
          `${undelivered} of ${recentBriefings} briefings in 48h were never delivered`,
        );
      }
    }

    /**
     * Expected work versus zero write, stated as its own alert rather than as a
     * threshold — it is not a rate, it is a contradiction. Matters are listed
     * for tomorrow and nothing was assembled for them.
     */
    if (dueMatters > 0 && generatedForDue === 0) {
      alerts.push({
        severity: 'page',
        rule: 'briefingSweepZeroWrite',
        detail: `${dueMatters} matter(s) are listed for today or tomorrow and NO briefing exists for those dates`,
      });
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     * BACKGROUND JOB HEALTH — FROM THE CONTROL PLANE, NOT FROM A PID
     * ─────────────────────────────────────────────────────────────────────────
     *
     * `ops_job_current` is the latest reading per job published by
     * `scripts/job-health.mjs`. Its `state` is derived from whether the job's
     * own checkpoint CHANGED between two readings — never from the process
     * being alive, never from GPU utilisation, never from Task Scheduler having
     * fired. All three of those have been true here while nothing moved.
     *
     * TWO conditions, and the second is the one that is easy to forget:
     *
     *   1. a critical job is RUNNING_STALLED or FAILED  → something is broken;
     *   2. the feed itself has gone quiet               → we cannot SEE whether
     *      anything is broken, which must not read as "nothing is broken".
     *
     * The table may be absent on a database where the migration has not run
     * (a fresh restore, a rehearsal target). That is reported as null and is
     * not an alert: a missing table is a deployment fact, not an incident, and
     * paging on it would make every restore drill wake somebody.
     */
    let jobs: {
      observedAgeHours: number | null;
      critical: number;
      stalled: { job_id: string; owner_lane: string; state: string; why: string | null }[];
    } | null = null;
    try {
      const rows = await sql<
        {
          job_id: string;
          owner_lane: string;
          state: string;
          why: string | null;
          age_hours: string | null;
        }[]
      >`
        SELECT job_id, owner_lane, state, why,
               (EXTRACT(EPOCH FROM (now() - observed_at)) / 3600)::text AS age_hours
          FROM ops_job_current
         WHERE critical`;

      const stalled = rows.filter((r) => r.state === 'RUNNING_STALLED' || r.state === 'FAILED');
      /* The NEWEST reading, because a single job that stopped being published
       * is a stale row, while the whole feed stopping is the outage this
       * measures. min() of the ages is the freshest tick anything got. */
      const ages = rows
        .map((r) => (r.age_hours === null ? null : Number(r.age_hours)))
        .filter((n): n is number => n !== null);
      const observedAgeHours = ages.length === 0 ? null : Math.min(...ages);

      jobs = {
        observedAgeHours,
        critical: rows.length,
        stalled: stalled.map((r) => ({
          job_id: r.job_id,
          owner_lane: r.owner_lane,
          state: r.state,
          why: r.why,
        })),
      };

      if (stalled.length > 0) {
        add(
          'stalledCriticalJobs',
          stalled.length,
          stalled
            .map((r) => `${r.job_id} (${r.owner_lane}) ${r.state}${r.why ? ': ' + r.why : ''}`)
            .join(' | '),
        );
      }
      if (observedAgeHours !== null) {
        add(
          'jobObservationAgeHours',
          observedAgeHours,
          `the job control plane last published ${observedAgeHours.toFixed(1)}h ago — ` +
            `while it is quiet, every worker reads healthy whether or not it is`,
        );
      }
    } catch {
      /* No ops_job_current on this database. Reported as null below, which is
       * honestly different from "no stalled jobs". */
    }

    const admission = deps.admission?.stats();

    const payload = {
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
      storage: { databaseBytes: Number(db?.db_bytes ?? 0), disk },
      briefingSweep: {
        newestGeneratedAgeHours:
          briefingAgeHours === null ? null : Number(briefingAgeHours.toFixed(1)),
        mattersListedNext48h: dueMatters,
        briefingsForThoseDates: generatedForDue,
        generatedLast48h: recentBriefings,
        undeliveredLast48h: undelivered,
      },
      search15m: {
        requests: searchN,
        p50Ms: Number(search?.p50 ?? 0),
        p95Ms: Number(search?.p95 ?? 0),
        maxMs: Number(search?.max ?? 0),
        degraded: Number(search?.degraded ?? 0),
        zeroResult: Number(search?.zero ?? 0),
        refused: Number(search?.refused ?? 0),
        failed5xx: Number(search?.failed ?? 0),
        serverErrorRate: Number(failedRate.toFixed(3)),
        degradedRate: Number(degradedRate.toFixed(3)),
        zeroResultRate: Number(zeroRate.toFixed(3)),
        /** Below this the rates above are reported but NOT alerted on. */
        minSampleForAlerting: MIN_SAMPLE,
      },
      corpus: { newestRowAgeHours: Number(ageHours.toFixed(1)) },
      /**
       * null means the control plane has never published to THIS database —
       * not that every job is fine. The distinction is the entire point of the
       * `jobObservationAgeHours` rule above it.
       */
      backgroundJobs: jobs,
      /**
       * The whole point. Empty means every rule above is inside its threshold
       * right now — not that nothing is wrong, only that nothing we know how to
       * check is.
       */
      alerts,
      alertRules: ALERT_RULES,
    };
    return { payload, alerts };
  }
}

/**
 * The route. Renders the collector, and turns a collector that cannot run into
 * a 503 rather than a 500 — a metrics endpoint that fails during an incident is
 * worse than useless.
 */
export async function getMetrics(
  c: Context,
  sql: Sql,
  deps: MetricsDeps = {},
): Promise<Response> {
  try {
    const { payload } = await collectMetrics(sql, deps);
    return ok(c, payload);
  } catch (error) {
    return fail(
      c,
      'METRICS_UNAVAILABLE',
      `metrics could not be collected: ${error instanceof Error ? error.message : String(error)}`,
      503,
    );
  }
}
