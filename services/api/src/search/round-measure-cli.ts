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

import postgres from 'postgres';

import { createApp } from '../app.ts';
import { createPools } from '../pools.ts';
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
 * The pool probe is ON for this harness and OFF in production — `timings.ts`
 * records why. Set before `createApp`, because `poolProbeEnabled()` is read per
 * request and the harness must not depend on the operator remembering.
 */
if (GATE_S1) process.env['SEARCH_POOL_PROBE'] = '1';

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

if (GATE_S1) {
  await runGateS1();
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
