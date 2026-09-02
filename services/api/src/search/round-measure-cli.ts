/**
 * P9 — the round's measurement, through the REAL Hono app.
 *
 * Three dimensions per class, as the binding addendum requires, because two of
 * them alone are misleading in opposite directions: *"A fast wrong result is not
 * a pass. A relevant result built from unsafe evidence is not a pass."*
 *
 *     QUALITY           did the right authority come back
 *     SAFETY/COVERAGE   was the evidence admissible, and what fraction of the
 *                       corpus could even answer
 *     LATENCY           p50 / p95 / max, with degraded and timeout counts
 *
 * Every number this prints is LOCAL_CONTENDED unless the operator says
 * otherwise on the command line — the ingest fleet, the GPU sidecar and the
 * enrichment workers share this box, and a latency measured beside them is an
 * upper bound, never a mobile-production figure.
 *
 *   pnpm --filter @lawmind/api measure:round -- --label LOCAL_QUIET
 */
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import { createPools, RESEARCH_CONCURRENCY, RESEARCH_POOL_MAX } from '../pools.ts';
import { createAdmission } from './admission.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
}
const LABEL = flag('--label') ?? 'LOCAL_CONTENDED';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `--gate-s1` — THE READINESS HARNESS, IN THIS FILE RATHER THAN A NEW ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate S1 needs a repeatable per-phase latency measurement over a FIXED set of
 * query classes. This CLI already drives the real Hono app, already draws its
 * cases from the live corpus rather than from a fixture, and already carries the
 * LOCAL_CONTENDED honesty note. A second CLI would have duplicated all of that
 * and then drifted from it, so this is a mode rather than a file.
 *
 * The P9 quality/safety measurement above is unchanged and still the default.
 *
 * WHAT THIS MODE MAY AND MAY NOT CONCLUDE. Every number it prints is LOCAL, on a
 * box shared with the ingest fleet and a GPU sidecar. V7.2's whole-request target
 * is a **3-second p95 in STAGING**; this run cannot certify that and does not
 * try. It is readiness evidence: it proves the instrumentation reports, it says
 * where local time goes per class, and it gives staging a shape to compare
 * against. A local p95 under 3 s is not a passed gate and a local p95 over it is
 * not a failed one.
 */
const GATE_S1 = args.includes('--gate-s1');
const REPEAT = Number(flag('--repeat') ?? 3);
const JSON_OUT = flag('--json');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `--concurrency 1,2,3,5` — THE CAPACITY ENVELOPE, NOT A SECOND GATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate S1's single-request p95 is a PASS. That number was bought substantially
 * by PostgreSQL parallel workers on the sparse arm, and PostgreSQL launches
 * fewer workers than it planned when the cluster's worker slots are already
 * taken. A second single-user benchmark cannot see that; only concurrent load
 * can, because concurrency is what takes the slots.
 *
 * So this mode runs the SAME frozen Gate-S1 query set, in the SAME deterministic
 * order, at several parallelism levels. Every level does identical work — same
 * queries, same rotation, same count — and the only variable is how many are in
 * flight. A difference between levels is therefore attributable to parallelism
 * and to nothing else.
 *
 * ── WHAT IT MAY AND MAY NOT CONCLUDE ────────────────────────────────────────
 *
 * **There is no new threshold here.** V7.2's formal Gate S1 remains the
 * 3-second p95 over the fixed suite in STAGING. "Concurrency-5 p95 must be 3
 * seconds" is NOT a release gate and this file does not invent one. The output
 * is capacity evidence, and it answers two questions:
 *
 *   1. does the selected plan have a catastrophic worker-starvation cliff?
 *   2. what must the remote alpha database be sized and configured to provide?
 *
 * A laptop that degrades at five fully parallel rankers is a sizing fact about
 * the laptop. It is not a reason to rewrite legal search.
 *
 * ── WHY NOT FIVE COPIES OF ONE QUERY ────────────────────────────────────────
 *
 * Because that measures the cheapest query five times and calls it load. The
 * rotation is over the whole class set — exact citation, CNR, case number,
 * filtered lexical, research, refusal — so each level runs the same MIX, which
 * is the only kind of concurrent measurement that transfers to a real deployment.
 */
const CONCURRENCY = (flag('--concurrency') ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const ENVELOPE = CONCURRENCY.length > 0;

/**
 * The pool probe is ON for this harness and OFF in production — `timings.ts`
 * records why. Set before `createApp`, because `poolProbeEnabled()` is read per
 * request and the harness must not depend on the operator remembering.
 */
if (GATE_S1 || ENVELOPE) process.env['SEARCH_POOL_PROBE'] = '1';

const pools = createPools(url, 15_000);
const sql = postgres(url, { max: 2 });

const app = createApp({
  ping: async () => {
    await sql`SELECT 1`;
  },
  /**
   * No embedder, and this is a stated limitation rather than a shortcut: the
   * dense arm does not run here, so the concept class below measures the
   * LEXICAL half only. NEW1's bus 1014 already established that concept
   * queries are dense-only in practice; this run cannot speak to that half and
   * says so instead of implying it did.
   */
  search: {
    sql: pools.core,
    researchSql: pools.research,
    admission: createAdmission(),
    embedQuery: async () => null,
    /**
     * The phase line, taken from the route itself rather than re-derived here.
     * `search/route.ts` hands the sink EXACTLY the object it logged, so this
     * harness and the log stream cannot disagree about a run.
     */
    onPhaseTiming: (line) => {
      phaseLines.push(line);
    },
  },
});

/** Filled by the sink above; drained per request by the Gate-S1 mode. */
const phaseLines: Record<string, unknown>[] = [];

/* ═══════════════════════════════════════════════════════════════════════════
 * GATE-S1 READINESS MODE
 * ═══════════════════════════════════════════════════════════════════════════ */

type GateSample = {
  queryClass: string;
  /** The class NAME this harness asked for, which is not the classifier's verdict. */
  askedClass: string;
  status: number;
  resultCount: number;
  outcomeState: string | null;
  degraded: string[];
  poolWaitMs: number | null;
  poolWaitMeasured: boolean;
  totalMs: number;
  unattributedMs: number;
  phases: Record<string, number>;
};

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

/**
 * p50/p95/p99 over a sample, and NOTHING where the sample cannot support it.
 *
 * A p99 over six observations is the maximum wearing a percentile's name. The
 * bound is stated rather than hidden: a percentile needs at least `1/(1-p)`
 * observations before it is anything but the largest value in the list, so p95
 * needs 20 and p99 needs 100. Below that this returns null and the report prints
 * an em-dash, because a number that cannot mean what it says is worse than an
 * absence a reader can see.
 */
function percentileOrNull(values: number[], p: number): number | null {
  const needed = Math.ceil(1 / (1 - p / 100));
  if (values.length < needed) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
}

function show(v: number | null): string {
  return v === null ? '—' : `${v}ms`;
}

/**
 * One request through the real route, with its phase line attached.
 *
 * The line is taken from the sink rather than timed out here on purpose: an
 * outer wall clock would measure this harness's own JSON parsing as part of the
 * request, and the whole point of the round is to stop attributing time to the
 * wrong phase.
 */
async function gateSample(askedClass: string, query: string): Promise<GateSample> {
  phaseLines.length = 0;
  let status = 0;
  let body: {
    data?: {
      results?: unknown[];
      degraded?: string[];
      retrievalOutcome?: { state?: string };
    };
  } = {};
  const wall = performance.now();
  try {
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, language: 'en' }),
    });
    status = res.status;
    body = (await res.json()) as typeof body;
  } catch {
    // A thrown request keeps `status` at 0, which the report reads as "no HTTP
    // answer at all" — a different fact from a 5xx and worth not collapsing.
  }
  const line = phaseLines[phaseLines.length - 1] ?? {};
  const phases: Record<string, number> = {};
  for (const [k, v] of Object.entries(line)) {
    if (k.endsWith('Ms') && typeof v === 'number') phases[k] = v;
  }
  return {
    askedClass,
    queryClass: typeof line['query_class'] === 'string' ? line['query_class'] : 'unknown',
    status,
    resultCount: body.data?.results?.length ?? 0,
    outcomeState: body.data?.retrievalOutcome?.state ?? null,
    degraded: body.data?.degraded ?? [],
    poolWaitMs: typeof line['pool_wait_ms'] === 'number' ? line['pool_wait_ms'] : null,
    poolWaitMeasured: line['pool_wait_measured'] === true,
    // `total_ms` from the route, falling back to this harness's own wall clock
    // only if the line never arrived — in which case the fallback is labelled by
    // `queryClass === 'unknown'` rather than passed off as the route's own.
    totalMs:
      typeof line['total_ms'] === 'number'
        ? line['total_ms']
        : Math.round(performance.now() - wall),
    unattributedMs: num(line['unattributed_ms']),
    phases,
  };
}

/**
 * The six fixed classes, drawn from the LIVE corpus wherever an identifier is
 * needed. A hard-coded CNR or case number silently stops existing the day the
 * corpus is rebuilt, and a class that resolves to nothing looks exactly like a
 * class that is fast.
 */
async function gateS1Queries(): Promise<{ name: string; queries: string[] }[]> {
  const [citation] = await sql<{ neutral_citation: string }[]>`
    SELECT neutral_citation FROM judgments
     WHERE neutral_citation IS NOT NULL
     GROUP BY 1 HAVING count(*) = 1 LIMIT 1`;
  const cnrs = await sql<{ cnr: string }[]>`
    SELECT cnr FROM judgments WHERE cnr IS NOT NULL LIMIT 3`;
  const caseNumbers = await sql<{ case_number: string }[]>`
    SELECT case_number FROM judgments
     WHERE case_number IS NOT NULL AND length(case_number) BETWEEN 6 AND 40 LIMIT 3`;
  /**
   * The filtered-lexical class needs a window that genuinely narrows, chosen the
   * same way `sparse-bound.test.ts` chooses one: from the corpus, not from a
   * constant. Without a bounded window this class measures the refusal class
   * twice and reports it as two results.
   */
  const [scope] = await sql<{ court: string; from: string; to: string }[]>`
    SELECT court, min(judgment_date)::text AS from, max(judgment_date)::text AS to
      FROM judgments
     WHERE judgment_date >= '2026-06-01' AND judgment_date <= '2026-06-30'
     GROUP BY court HAVING count(*) BETWEEN 200 AND 20000
     ORDER BY count(*) DESC LIMIT 1`;

  return [
    {
      name: 'exact citation',
      queries: citation ? [`cite:"${citation.neutral_citation}"`] : [],
    },
    { name: 'CNR', queries: cnrs.map((r) => r.cnr) },
    { name: 'case number', queries: caseNumbers.map((r) => r.case_number) },
    {
      name: 'filtered lexical',
      queries: scope ? [`court:"${scope.court}" AND bail`] : [],
    },
    {
      name: 'normal research query',
      queries: [
        'anticipatory bail in a dowry harassment case',
        'dying declaration corroboration requirement',
        'specific performance of agreement to sell',
      ],
    },
    /**
     * The refusal is a CLASS, not a failure. `bail` corpus-wide is 25.8% of the
     * corpus and the sparse arm declines to rank it — a 200 carrying
     * `emptyBecause`, which is the honest answer and the one whose COST this
     * gate cares about: a refusal that is not cheap has bought nothing.
     */
    { name: 'broad / refused query', queries: ['bail'] },
  ];
}

/** The phase columns worth a column each. Others still reach the JSON. */
const REPORT_PHASES = [
  'admissionWaitMs',
  'structuredMs',
  'pinsMs',
  'armsMs',
  'sparseMs',
  'denseMs',
  'hydrateMs',
  'fallbackMs',
  'bookkeepingMs',
  'unpopulatedMs',
  'serializationMs',
] as const;

/** Per-phase p50 across every sample, so the shape of a request is visible. */
function phaseTable(samples: GateSample[]): void {
  console.log('\nphase p50 / p95 across all classes (LOCAL, contended box)\n');
  console.log('phase'.padEnd(22) + 'p50'.padStart(9) + 'p95'.padStart(9) + 'max'.padStart(9));
  for (const phase of REPORT_PHASES) {
    const values = samples.map((s) => s.phases[phase] ?? 0);
    if (values.every((v) => v === 0)) continue;
    console.log(
      phase.padEnd(22) +
        show(percentileOrNull(values, 50)).padStart(9) +
        show(percentileOrNull(values, 95)).padStart(9) +
        `${Math.max(...values)}ms`.padStart(9),
    );
  }
  const unattributed = samples.map((s) => s.unattributedMs);
  console.log(
    'unattributed'.padEnd(22) +
      show(percentileOrNull(unattributed, 50)).padStart(9) +
      show(percentileOrNull(unattributed, 95)).padStart(9) +
      `${Math.max(...unattributed)}ms`.padStart(9),
  );
}

async function runGateS1(): Promise<void> {
  const classes = await gateS1Queries();
  const samples: GateSample[] = [];

  /**
   * The FIRST request of the run is kept and labelled rather than discarded as
   * a warm-up. It is the cold case — the one RCC measured at 15,334 ms on a
   * physical device — and a harness that throws it away can never see it.
   */
  for (const cls of classes) {
    for (let round = 0; round < REPEAT; round++) {
      for (const q of cls.queries) {
        samples.push(await gateSample(cls.name, q));
      }
    }
  }

  const header =
    'class'.padEnd(24) +
    'n'.padStart(4) +
    'zero'.padStart(6) +
    'degr'.padStart(6) +
    'poolWait'.padStart(10) +
    'p50'.padStart(9) +
    'p95'.padStart(9) +
    'p99'.padStart(9);
  console.log(`\nGATE-S1 LOCAL READINESS — ${LABEL} — ${new Date().toISOString()}`);
  console.log(`repeat=${REPEAT}  poolProbe=${samples.some((s) => s.poolWaitMeasured)}\n`);
  console.log(header);
  for (const cls of classes) {
    const mine = samples.filter((s) => s.askedClass === cls.name);
    if (mine.length === 0) {
      console.log(cls.name.padEnd(24) + 'no case available in this corpus'.padStart(40));
      continue;
    }
    const totals = mine.map((s) => s.totalMs);
    const waits = mine.map((s) => s.poolWaitMs).filter((v): v is number => v !== null);
    console.log(
      cls.name.padEnd(24) +
        String(mine.length).padStart(4) +
        String(mine.filter((s) => s.resultCount === 0).length).padStart(6) +
        String(mine.filter((s) => s.degraded.length > 0).length).padStart(6) +
        (waits.length ? `${Math.max(...waits)}ms` : '—').padStart(10) +
        show(
          percentileOrNull(totals, 50) ??
            totals.sort((a, b) => a - b)[Math.floor(totals.length / 2)] ??
            null,
        ).padStart(9) +
        show(percentileOrNull(totals, 95)).padStart(9) +
        show(percentileOrNull(totals, 99)).padStart(9),
    );
  }

  phaseTable(samples);

  const allTotals = samples.map((s) => s.totalMs);
  const p50 = percentileOrNull(allTotals, 50);
  const p95 = percentileOrNull(allTotals, 95);
  const p99 = percentileOrNull(allTotals, 99);
  console.log(
    `\nWHOLE-REQUEST, ALL CLASSES POOLED  n=${allTotals.length}  ` +
      `p50=${show(p50)}  p95=${show(p95)}  p99=${show(p99)}`,
  );
  console.log(
    '\nV7.2 target is a 3-SECOND p95 IN STAGING. This run is LOCAL, on a box\n' +
      'shared with the ingest fleet and a GPU sidecar, with NO EMBEDDER — the\n' +
      'dense arm does not run here, so the concept class measures the lexical\n' +
      'half only. It is readiness evidence and it certifies nothing about\n' +
      'staging in either direction.\n' +
      '\npoolWait is measured at sql.reserve() on the RESEARCH pool, immediately\n' +
      'before retrieval — a real acquisition boundary, but a SAMPLE at that\n' +
      'instant rather than the wait the two rankers themselves paid. On a cold\n' +
      'pool it includes connection establishment. search/timings.ts is the\n' +
      'authority on both limits.\n' +
      '\nunattributed is total minus the phases above it. It is NOT pool wait and\n' +
      'must never be reported as such: it also holds GC, event-loop scheduling\n' +
      'behind the other processes on this box, and any phase not yet wired in.',
  );

  if (JSON_OUT) {
    const payload = {
      label: LABEL,
      collectedAt: new Date().toISOString(),
      repeat: REPEAT,
      poolProbe: samples.some((s) => s.poolWaitMeasured),
      embedder: 'absent — dense arm did not run',
      environment: 'LOCAL, contended; not staging and not a Gate-C certification',
      target: { wholeRequestP95Ms: 3000, appliesTo: 'staging only' },
      samples,
      pooled: { n: allTotals.length, p50, p95, p99 },
    };
    writeFileSync(JSON_OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`\nmachine-readable: ${JSON_OUT}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CONCURRENCY ENVELOPE
 * ═══════════════════════════════════════════════════════════════════════════ */

type EnvelopeSample = {
  askedClass: string;
  order: number;
  status: number;
  /** Wall clock, and deliberately not the route's `total_ms` — see below. */
  wallMs: number;
  /** The route's own `total_ms`, correlated by request id. Null if uncorrelated. */
  routeMs: number | null;
  resultCount: number;
  degraded: string[];
  outcomeState: string | null;
  poolWaitMs: number | null;
  sparseMs: number | null;
  /** 503 SEARCH_BUSY — the admission gate refusing, not a slow answer. */
  refused: boolean;
};

/**
 * One PARALLEL-WORKER observation, taken from a connection that is doing no work
 * of its own.
 *
 * `pg_stat_activity` distinguishes a leader from the workers it launched, so
 * "how many workers is this statement actually running with" is DIRECTLY
 * observable rather than inferred from a plan. That matters here: an `EXPLAIN`
 * run beside the load would be a different statement with different bind values
 * and its own plan, which is not evidence about the one under test.
 *
 * `Workers Planned` is what level 1 shows: at concurrency 1 nothing competes for
 * a slot, so what was launched IS what was planned. Any later level whose
 * per-leader maximum falls below that has been starved, and it is a measurement
 * rather than a guess.
 */
type WorkerObservation = {
  /** Total `backend_type = 'parallel worker'` rows on this server, at one instant. */
  totalWorkers: number;
  /** The largest number of workers any single leader had at that instant. */
  maxPerLeader: number;
  /** Client backends running a statement, ours and anyone else's. */
  activeBackends: number;
};

async function sampleWorkers(observer: postgres.Sql): Promise<WorkerObservation> {
  const [row] = await observer<
    { total: string; max_per_leader: string; active: string }[]
  >`
    WITH w AS (
      SELECT leader_pid, count(*)::int AS n
        FROM pg_stat_activity
       WHERE backend_type = 'parallel worker' AND leader_pid IS NOT NULL
       GROUP BY leader_pid
    )
    SELECT coalesce(sum(n), 0)::text AS total,
           coalesce(max(n), 0)::text AS max_per_leader,
           (SELECT count(*) FROM pg_stat_activity
             WHERE backend_type = 'client backend' AND state = 'active')::text AS active
      FROM w`;
  return {
    totalWorkers: Number(row?.total ?? 0),
    maxPerLeader: Number(row?.max_per_leader ?? 0),
    activeBackends: Number(row?.active ?? 0),
  };
}

/**
 * One request, safe to run beside others.
 *
 * `gateSample` above reads `phaseLines[phaseLines.length - 1]` after emptying the
 * array, which is correct for a serial run and WRONG the instant two requests
 * overlap: the last line would belong to whichever request happened to finish
 * last. So this one leaves the array alone and correlates on `request_id`, which
 * the route already puts on every phase line and Hono already returns in
 * `X-Request-Id`. Where the correlation fails the field is null rather than
 * another request's number.
 */
async function envelopeSample(
  askedClass: string,
  query: string,
  order: number,
): Promise<EnvelopeSample> {
  const wall = performance.now();
  let status = 0;
  let requestId: string | null = null;
  let body: {
    data?: { results?: unknown[]; degraded?: string[]; retrievalOutcome?: { state?: string } };
  } = {};
  try {
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, language: 'en' }),
    });
    status = res.status;
    requestId = res.headers.get('x-request-id');
    body = (await res.json()) as typeof body;
  } catch {
    /* status stays 0 — "no HTTP answer at all", a different fact from a 5xx. */
  }
  const wallMs = Math.round(performance.now() - wall);
  const line = requestId
    ? phaseLines.find((l) => l['request_id'] === requestId)
    : undefined;
  return {
    askedClass,
    order,
    status,
    wallMs,
    routeMs: typeof line?.['total_ms'] === 'number' ? line['total_ms'] : null,
    resultCount: body.data?.results?.length ?? 0,
    degraded: body.data?.degraded ?? [],
    outcomeState: body.data?.retrievalOutcome?.state ?? null,
    poolWaitMs: typeof line?.['pool_wait_ms'] === 'number' ? line['pool_wait_ms'] : null,
    sparseMs: typeof line?.['sparseMs'] === 'number' ? line['sparseMs'] : null,
    /* The admission gate's honest refusal. It is NOT a latency observation and
     * must never be averaged in with one — a fast refusal would flatter the p95
     * of a server that answered nothing. */
    refused: status === 503,
  };
}

async function runLevel(
  concurrency: number,
  stream: { name: string; query: string }[],
  observer: postgres.Sql | null,
): Promise<{
  concurrency: number;
  n: number;
  samples: EnvelopeSample[];
  wallMs: number;
  workers: WorkerObservation[];
  tempFilesDelta: number;
  tempBytesDelta: number;
}> {
  const samples: EnvelopeSample[] = [];
  const workers: WorkerObservation[] = [];
  let cursor = 0;

  const tempBefore = observer ? await tempStats(observer) : { files: 0, bytes: 0 };
  /* 200 ms: fast enough to catch a gather that lives for a second, slow enough
   * that the observer's own backend is not itself a load. */
  const probe = observer
    ? setInterval(() => {
        void sampleWorkers(observer)
          .then((w) => workers.push(w))
          .catch(() => {});
      }, 200)
    : undefined;

  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const i = cursor++;
        const item = stream[i];
        if (!item) return;
        samples.push(await envelopeSample(item.name, item.query, i));
      }
    }),
  );
  const wallMs = Math.round(performance.now() - started);
  if (probe) clearInterval(probe);
  const tempAfter = observer ? await tempStats(observer) : { files: 0, bytes: 0 };

  return {
    concurrency,
    n: samples.length,
    samples,
    wallMs,
    workers,
    tempFilesDelta: tempAfter.files - tempBefore.files,
    tempBytesDelta: tempAfter.bytes - tempBefore.bytes,
  };
}

/** Sort spill for this database. A ranker that spills is a different plan. */
async function tempStats(observer: postgres.Sql): Promise<{ files: number; bytes: number }> {
  const [row] = await observer<{ f: string; b: string }[]>`
    SELECT temp_files::text AS f, temp_bytes::text AS b
      FROM pg_stat_database WHERE datname = current_database()`;
  return { files: Number(row?.f ?? 0), bytes: Number(row?.b ?? 0) };
}

async function runEnvelope(): Promise<void> {
  const classes = await gateS1Queries();
  /**
   * The stream, built ONCE and reused at every level.
   *
   * Rotation order is class-major and identical for all levels, so two levels
   * differ in interleaving and in nothing else. A per-level shuffle would make
   * every comparison a comparison of two different workloads.
   */
  const stream: { name: string; query: string }[] = [];
  for (let round = 0; round < REPEAT; round++) {
    for (const cls of classes) {
      for (const q of cls.queries) stream.push({ name: cls.name, query: q });
    }
  }

  const observer = await (async () => {
    try {
      const o = postgres(url!, { max: 1, onnotice: () => {} });
      await o`SELECT 1`;
      return o;
    } catch {
      return null;
    }
  })();

  const [cfg] = await sql<
    {
      mwp: string;
      mpw: string;
      mpwpg: string;
      plp: string;
      work_mem: string;
      st: string;
      ver: string;
    }[]
  >`
    SELECT current_setting('max_worker_processes') AS mwp,
           current_setting('max_parallel_workers') AS mpw,
           current_setting('max_parallel_workers_per_gather') AS mpwpg,
           current_setting('parallel_leader_participation') AS plp,
           current_setting('work_mem') AS work_mem,
           current_setting('statement_timeout') AS st,
           current_setting('server_version') AS ver`;

  console.log(`\nCONCURRENCY ENVELOPE — ${LABEL} — ${new Date().toISOString()}`);
  console.log(
    `server ${cfg?.ver}  max_worker_processes=${cfg?.mwp}  max_parallel_workers=${cfg?.mpw}\n` +
      `max_parallel_workers_per_gather=${cfg?.mpwpg}  parallel_leader_participation=${cfg?.plp}\n` +
      `work_mem=${cfg?.work_mem}  research pool max=${RESEARCH_POOL_MAX}  ` +
      `admission limit=${RESEARCH_CONCURRENCY}  cpus=${cpus().length}\n` +
      `stream=${stream.length} requests per level, identical order at every level\n`,
  );

  /**
   * ── ONE DISCARDED PASS, BECAUSE THE LEVELS ARE NOT INDEPENDENT ────────────
   *
   * The first measured run of this harness put its WORST p95 at concurrency 1
   * (2,550 ms) and its best at 2 (872 ms), which read as "concurrency makes
   * search faster". It does not. Level 1 ran first and paid every cold cost —
   * page cache, the planner's first parse, the pool's first connections — and
   * then handed a warm database to every level after it.
   *
   * Gate-S1's own mode deliberately KEEPS its cold case, because a cold request
   * is a real request an advocate makes. This mode is asking a different
   * question: what changes when the SAME work runs in parallel. That comparison
   * is only meaningful from a common state, so one full stream is run and thrown
   * away first, and the run is labelled as warm.
   *
   * `--no-warmup` exists to falsify this: it reproduces the confounded numbers.
   */
  if (!args.includes('--no-warmup')) {
    const started = performance.now();
    await runLevel(1, stream, null);
    console.log(
      `warm-up: ${stream.length} requests discarded in ${Math.round(performance.now() - started)}ms ` +
        '— every level below starts from the same warm state\n',
    );
  }

  const header =
    'conc'.padStart(5) +
    'n'.padStart(5) +
    'p50'.padStart(9) +
    'p95'.padStart(9) +
    'max'.padStart(9) +
    'req/s'.padStart(8) +
    'refus'.padStart(7) +
    'degr'.padStart(6) +
    'zero'.padStart(6) +
    'poolW'.padStart(8) +
    'wrk/ldr'.padStart(9);
  console.log(header);

  const levels: Record<string, unknown>[] = [];
  for (const c of CONCURRENCY) {
    const r = await runLevel(c, stream, observer);
    /**
     * ANSWERED requests only. A 503 from the admission gate is a refusal, not a
     * fast answer, and letting it into the latency sample would make a server
     * that answered less look faster.
     */
    const answered = r.samples.filter((s) => !s.refused && s.status === 200);
    const totals = answered.map((s) => s.wallMs);
    const waits = r.samples.map((s) => s.poolWaitMs).filter((v): v is number => v !== null);
    const maxPerLeader = r.workers.length ? Math.max(...r.workers.map((w) => w.maxPerLeader)) : 0;
    const maxWorkers = r.workers.length ? Math.max(...r.workers.map((w) => w.totalWorkers)) : 0;
    const p50 = percentileOrNull(totals, 50);
    const p95 = percentileOrNull(totals, 95);
    const max = totals.length ? Math.max(...totals) : null;
    const throughput = r.wallMs > 0 ? (r.samples.length / r.wallMs) * 1000 : 0;

    console.log(
      String(c).padStart(5) +
        String(r.samples.length).padStart(5) +
        show(p50).padStart(9) +
        show(p95).padStart(9) +
        show(max).padStart(9) +
        throughput.toFixed(2).padStart(8) +
        String(r.samples.filter((s) => s.refused).length).padStart(7) +
        String(r.samples.filter((s) => s.degraded.length > 0).length).padStart(6) +
        String(answered.filter((s) => s.resultCount === 0).length).padStart(6) +
        (waits.length ? `${Math.max(...waits)}ms` : '—').padStart(8) +
        String(maxPerLeader).padStart(9),
    );

    levels.push({
      concurrency: c,
      requests: r.samples.length,
      answered: answered.length,
      refusedSearchBusy: r.samples.filter((s) => s.refused).length,
      nonOk: r.samples.filter((s) => s.status !== 200 && s.status !== 503).length,
      degraded: r.samples.filter((s) => s.degraded.length > 0).length,
      timeouts: r.samples.filter((s) => s.degraded.some((d) => d.endsWith('timeout'))).length,
      zeroResult: answered.filter((s) => s.resultCount === 0).length,
      p50,
      p95,
      max,
      throughputPerSec: Number(throughput.toFixed(3)),
      wallMs: r.wallMs,
      poolWaitMaxMs: waits.length ? Math.max(...waits) : null,
      sparseMaxMs: (() => {
        const v = r.samples.map((s) => s.sparseMs).filter((x): x is number => x !== null);
        return v.length ? Math.max(...v) : null;
      })(),
      workersLaunchedMaxPerLeader: maxPerLeader,
      workersLaunchedMaxTotal: maxWorkers,
      workerSamples: r.workers.length,
      tempFilesDelta: r.tempFilesDelta,
      tempBytesDelta: r.tempBytesDelta,
      byClass: [...new Set(stream.map((s) => s.name))].map((name) => {
        const mine = answered.filter((s) => s.askedClass === name).map((s) => s.wallMs);
        return {
          name,
          n: mine.length,
          p50: percentileOrNull(mine, 50),
          max: mine.length ? Math.max(...mine) : null,
        };
      }),
      /* Kept per level so a reader can recompute any statistic above. */
      samples: r.samples,
    });
  }

  /**
   * `Workers Planned` is the level-1 observation, for the reason in
   * `sampleWorkers`: with nothing competing, launched == planned.
   */
  const level1 = levels.find((l) => l['concurrency'] === 1);
  const planned = (level1?.['workersLaunchedMaxPerLeader'] as number | undefined) ?? null;
  console.log(
    `\nWORKERS: planned (observed at concurrency 1, nothing competing) = ${planned ?? '—'} ` +
      `per gather; cluster cap max_parallel_workers=${cfg?.mpw}.\n` +
      'A later level whose wrk/ldr is BELOW that number was starved of slots. Equal ' +
      'numbers with a worse p95 is contention somewhere else and must not be called\n' +
      'starvation.',
  );
  console.log(
    '\nNO NEW THRESHOLD. V7.2 Gate S1 remains a 3-second p95 over the fixed suite in\n' +
      'STAGING. These numbers are LOCAL, on a contended box, with NO EMBEDDER, and\n' +
      'they are capacity evidence for sizing the remote alpha database — not a gate.\n' +
      'refus is the admission gate answering 503 SEARCH_BUSY, which is a truthful\n' +
      'state and is excluded from the latency sample rather than averaged into it.',
  );

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          kind: 'lawmind-search-concurrency-envelope',
          label: LABEL,
          collectedAt: new Date().toISOString(),
          environment: 'LOCAL, contended; not staging and not a Gate-C certification',
          embedder: 'absent — dense arm did not run',
          formalGate: {
            name: 'Gate S1',
            wholeRequestP95Ms: 3000,
            appliesTo: 'staging, single-request fixed suite',
            thisRunIsAGate: false,
          },
          server: {
            version: cfg?.ver,
            maxWorkerProcesses: Number(cfg?.mwp),
            maxParallelWorkers: Number(cfg?.mpw),
            maxParallelWorkersPerGather: Number(cfg?.mpwpg),
            parallelLeaderParticipation: cfg?.plp,
            workMem: cfg?.work_mem,
            statementTimeout: cfg?.st,
            logicalCpus: cpus().length,
          },
          api: { researchPoolMax: RESEARCH_POOL_MAX, admissionLimit: RESEARCH_CONCURRENCY },
          stream: stream.map((s) => s.name),
          workersPlannedAtConcurrency1: planned,
          levels,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    console.log(`\nmachine-readable: ${JSON_OUT}`);
  }

  if (observer) await observer.end();
}

if (GATE_S1 || ENVELOPE) {
  if (GATE_S1) await runGateS1();
  if (ENVELOPE) await runEnvelope();
  await sql.end();
  await pools.end();
  process.exit(0);
}

type Case = { query: string; expectJudgmentId?: string };
type ClassResult = {
  name: string;
  n: number;
  ok: number;
  hit: number;
  hitOf: number;
  zero: number;
  degraded: number;
  timeouts: number;
  unsafeEvidence: number;
  latencies: number[];
};

function pct(v: number[], p: number): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))] ?? 0;
}

async function runClass(name: string, cases: Case[]): Promise<ClassResult> {
  const r: ClassResult = {
    name,
    n: cases.length,
    ok: 0,
    hit: 0,
    hitOf: 0,
    zero: 0,
    degraded: 0,
    timeouts: 0,
    unsafeEvidence: 0,
    latencies: [],
  };
  for (const c of cases) {
    const started = performance.now();
    let body: {
      data?: {
        results?: {
          judgmentId: string;
          operativeParagraph: string;
          bodyText?: { state: string; evidenceWithheld: boolean };
        }[];
        degraded?: string[];
      };
    } = {};
    let status = 0;
    try {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: c.query, language: 'en' }),
      });
      status = res.status;
      body = (await res.json()) as typeof body;
    } catch {
      r.timeouts++;
    }
    r.latencies.push(Math.round(performance.now() - started));
    if (status === 200) r.ok++;
    const results = body.data?.results ?? [];
    if (results.length === 0) r.zero++;
    if ((body.data?.degraded ?? []).length > 0) r.degraded++;
    /**
     * SAFETY. A result whose passage was withheld is CORRECT behaviour, not a
     * failure — it is P0 working. What would be a failure is a non-empty
     * passage on a row whose body is convicted, which is the condition counted
     * here: evidence that should not exist.
     */
    for (const row of results) {
      if (row.bodyText?.evidenceWithheld && row.operativeParagraph.trim().length > 0) {
        r.unsafeEvidence++;
      }
    }
    if (c.expectJudgmentId) {
      r.hitOf++;
      if (results[0]?.judgmentId === c.expectJudgmentId) r.hit++;
    }
  }
  return r;
}

/**
 * Cases drawn from the LIVE corpus rather than hard-coded, so the gold cannot
 * silently stop existing. Small and bounded: this is a round-level smoke
 * measurement, not NEW1's 1,029-query launch benchmark, and it says so.
 */
const uniqueCitations = await sql<{ neutral_citation: string; id: string }[]>`
  SELECT neutral_citation, min(id::text) AS id FROM judgments
   WHERE neutral_citation IS NOT NULL
   GROUP BY 1 HAVING count(*) = 1 LIMIT 20`;

const sharedCitations = await sql<{ neutral_citation: string; n: string }[]>`
  SELECT neutral_citation, count(*)::text AS n FROM judgments
   WHERE neutral_citation IS NOT NULL
   GROUP BY 1 HAVING count(*) BETWEEN 2 AND 20 LIMIT 10`;

const uniqueTitles = await sql<{ case_title: string; id: string }[]>`
  SELECT case_title, min(id::text) AS id FROM judgments
   WHERE length(case_title) > 15
   GROUP BY 1 HAVING count(*) = 1 LIMIT 15`;

const sharedTitles = await sql<{ case_title: string; n: string }[]>`
  SELECT case_title, count(*)::text AS n FROM judgments
   WHERE length(case_title) > 15
   GROUP BY 1 HAVING count(*) BETWEEN 3 AND 16 LIMIT 10`;

const results: ClassResult[] = [];

results.push(
  await runClass(
    'citation · unique',
    uniqueCitations.map((r) => ({ query: `cite:"${r.neutral_citation}"`, expectJudgmentId: r.id })),
  ),
);
results.push(
  await runClass(
    'citation · ambiguous',
    sharedCitations.map((r) => ({ query: `cite:"${r.neutral_citation}"` })),
  ),
);
results.push(
  await runClass(
    'case-name · unique title',
    uniqueTitles.map((r) => ({ query: r.case_title, expectJudgmentId: r.id })),
  ),
);
results.push(
  await runClass(
    'case-name · shared title',
    sharedTitles.map((r) => ({ query: r.case_title })),
  ),
);
results.push(
  await runClass('statute / BNS', [
    { query: 'section 302 IPC' },
    { query: 'act:BNS' },
    { query: 'section 138 Negotiable Instruments Act' },
    { query: 'section 37 NDPS' },
    { query: 'BNSS 480' },
  ]),
);
results.push(
  await runClass('concept (LEXICAL ARM ONLY — no embedder in this run)', [
    { query: 'anticipatory bail twin conditions' },
    { query: 'dying declaration corroboration' },
    { query: 'parity with co-accused in bail' },
    { query: 'compassionate appointment policy' },
    { query: 'specific performance of agreement to sell' },
  ]),
);

console.log(`\nP9 ROUND MEASUREMENT — ${LABEL} — ${new Date().toISOString()}\n`);
console.log(
  'class'.padEnd(46) +
    'n'.padStart(4) +
    '200'.padStart(5) +
    'rank1'.padStart(9) +
    'zero'.padStart(6) +
    'degr'.padStart(6) +
    'unsafe'.padStart(8) +
    'p50'.padStart(9) +
    'p95'.padStart(9) +
    'max'.padStart(9),
);
for (const r of results) {
  const quality = r.hitOf > 0 ? `${((r.hit / r.hitOf) * 100).toFixed(1)}%` : '—';
  console.log(
    r.name.padEnd(46) +
      String(r.n).padStart(4) +
      String(r.ok).padStart(5) +
      quality.padStart(9) +
      String(r.zero).padStart(6) +
      String(r.degraded).padStart(6) +
      String(r.unsafeEvidence).padStart(8) +
      `${pct(r.latencies, 50)}ms`.padStart(9) +
      `${pct(r.latencies, 95)}ms`.padStart(9) +
      `${Math.max(...r.latencies)}ms`.padStart(9),
  );
}
console.log(
  '\nrank1 is reported ONLY where a unique gold exists. A blank is not a zero —' +
    '\nan ambiguous class has no single right answer by construction, and scoring' +
    '\none would be inventing the very identity claim the ambiguity path removes.' +
    '\nunsafe = results carrying a passage from a body the contract convicted.' +
    '\nExpected 0; anything else is a P0 regression.',
);

await sql.end();
await pools.end();
