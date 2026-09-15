#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GATE-S1 RUNNER FOR A DEPLOYMENT THAT IS NOT THIS MACHINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `pnpm --filter @lawmind/api measure:round -- --gate-s1` already runs the
 * frozen suite and is the right tool for a LOCAL number. It builds the Hono app
 * IN PROCESS, so pointed at a remote database it measures a local API over a WAN
 * link — every statement pays a round trip that production never pays, and the
 * deployed process is never exercised at all. That is not the gate.
 *
 * V7.2's Gate S1 is a **whole-request p95 of 3,000 ms in STAGING**, and a whole
 * request includes TLS, the hop, the deployed process, its pools and its
 * database. So this drives the SAME six frozen classes, in the SAME deterministic
 * order, over HTTP against a deployed API, and measures the thing the gate names.
 *
 * ── WHAT THE CLIENT CAN SEE, AND WHAT IT CANNOT ─────────────────────────────
 *
 * From the response alone: HTTP outcome, whole-request wall time, `degraded[]`,
 * `retrievalOutcome`, `emptyBecause`, result count, and the request id the server
 * echoed in `x-request-id`.
 *
 * NOT from the response: `pool_wait_ms` and the per-arm phase breakdown. Those
 * are deliberately diagnostics and never reach the wire (`search/timings.ts`) —
 * so this runner does not invent them, and does not derive them from the total.
 * It CORRELATES them, by request id, out of the deployed process's own
 * `search_phase_timing` log lines, which every host exposes and which need no
 * new product endpoint:
 *
 *     railway logs --service api --json > phase.log      (or the host's equivalent)
 *     node scripts/lcc-staging-gate-s1.mjs --api https://... --phase-log phase.log
 *
 * Run without `--phase-log` the runner still grades the gate — the gate is a
 * whole-request number — and every server-side field reads `null`, meaning NOT
 * MEASURED. Never zero. `timings.ts` records why that distinction is the whole
 * point of the instrumentation.
 *
 * ── THE QUERY SET IS DRAWN FROM THE CORPUS BEING MEASURED ───────────────────
 *
 * A hard-coded CNR stops existing the day a corpus generation is rebuilt, and a
 * class that resolves to nothing looks exactly like a class that is fast. With
 * `--corpus-url` the identifiers come from the staging corpus, the same way
 * `round-measure-cli.ts` draws them. With `--queries` they come from a pinned
 * file, which is what a runner with no database credential uses — and the file
 * records which generation it was pinned from, so a stale set is visible.
 *
 * ── WHAT THIS MAY NOT DO ────────────────────────────────────────────────────
 *
 * No timeout inflation, no random GIN sampling, and nothing that improves the
 * number by returning less law. The gate is whole-request p95 <= 3000 ms over
 * this suite and the runner reports it, pass or fail.
 *
 * Usage:
 *   node scripts/lcc-staging-gate-s1.mjs \
 *     --api https://staging-api.lawmind.co \
 *     [--corpus-url postgres://...  |  --queries docs/ai/lcc-r29/gate-s1-queries.json] \
 *     [--phase-log phase.log] [--token <bearer>] [--repeat 3] \
 *     [--out docs/ai/lcc-r29] [--label STAGING]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};

const API = (flag('api') ?? process.env['LAWMIND_STAGING_API_URL'] ?? '').replace(/\/+$/, '');
const CORPUS_URL = flag('corpus-url') ?? process.env['LAWMIND_STAGING_CORPUS_URL'];
const QUERIES_FILE = flag('queries');
const PHASE_LOG = flag('phase-log');
const TOKEN = flag('token') ?? process.env['LAWMIND_STAGING_TOKEN'];
const REPEAT = Number(flag('repeat') ?? 3);
const OUT = resolve(flag('out') ?? './docs/ai/lcc-r29');
const LABEL = flag('label') ?? 'STAGING';
const EMIT_QUERIES = args.includes('--emit-queries');

/** The gate. Fixed, and not a tuning knob. */
const WHOLE_REQUEST_P95_MS = 3000;

/**
 * The per-request ceiling. Equal to the client timeout the product actually
 * ships, so a request this runner abandons is one an advocate would have
 * abandoned. Deliberately NOT raised to make a slow deployment pass.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The six frozen classes. The shape is fixed here; the identifiers inside the
 * first four are corpus-dependent and come from `--corpus-url` or `--queries`.
 */
const FIXED_CLASSES = [
  {
    name: 'normal research query',
    corpusDependent: false,
    queries: [
      'anticipatory bail in a dowry harassment case',
      'dying declaration corroboration requirement',
      'specific performance of agreement to sell',
    ],
  },
  /* A refusal is a CLASS, not a failure: a 200 carrying `emptyBecause` is the
   * honest answer, and this gate cares whether it was CHEAP. */
  { name: 'broad / refused query', corpusDependent: false, queries: ['bail'] },
];

async function drawFromCorpus(url) {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 2, onnotice: () => {} });
  try {
    const [citation] = await sql`
      SELECT neutral_citation FROM judgments
       WHERE neutral_citation IS NOT NULL
       GROUP BY 1 HAVING count(*) = 1 LIMIT 1`;
    const cnrs = await sql`SELECT cnr FROM judgments WHERE cnr IS NOT NULL LIMIT 3`;
    const caseNumbers = await sql`
      SELECT case_number FROM judgments
       WHERE case_number IS NOT NULL AND length(case_number) BETWEEN 6 AND 40 LIMIT 3`;
    const [scope] = await sql`
      SELECT court FROM judgments
       WHERE judgment_date >= '2026-06-01' AND judgment_date <= '2026-06-30'
       GROUP BY court HAVING count(*) BETWEEN 200 AND 20000
       ORDER BY count(*) DESC LIMIT 1`;
    return [
      { name: 'exact citation', queries: citation ? [`cite:"${citation.neutral_citation}"`] : [] },
      { name: 'CNR', queries: cnrs.map((r) => r.cnr) },
      { name: 'case number', queries: caseNumbers.map((r) => r.case_number) },
      { name: 'filtered lexical', queries: scope ? [`court:"${scope.court}" AND bail`] : [] },
      ...FIXED_CLASSES.map(({ name, queries }) => ({ name, queries })),
    ];
  } finally {
    await sql.end();
  }
}

function loadQueries(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.classes)) {
    throw new Error(`${file} has no "classes" array — see --emit-queries`);
  }
  return parsed.classes;
}

/**
 * Server-side phase lines, keyed by request id.
 *
 * Accepts either raw JSON-per-line (pino's own output, and what
 * `railway logs --json` gives) or lines with a host prefix before the JSON —
 * the brace is found rather than the line assumed to start with one, because
 * every host wraps logs slightly differently and a runner that only parses one
 * of them silently reports "not measured" for a whole run.
 */
export function loadPhaseLines(file) {
  const byRequest = new Map();
  let parsed = 0;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const brace = raw.indexOf('{');
    if (brace === -1) continue;
    let line;
    try {
      line = JSON.parse(raw.slice(brace));
    } catch {
      continue;
    }
    /* Railway and several hosts wrap the application's own JSON in an envelope
     * under `message`; unwrap one level before giving up on the line. */
    if (line.event !== 'search_phase_timing' && typeof line.message === 'string') {
      try {
        line = JSON.parse(line.message);
      } catch {
        continue;
      }
    }
    if (line.event !== 'search_phase_timing' || typeof line.request_id !== 'string') continue;
    byRequest.set(line.request_id, line);
    parsed += 1;
  }
  return { byRequest, parsed };
}

const num = (v) => (typeof v === 'number' ? v : null);

async function sample(askedClass, query, phaseLines) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();
  let status = 0;
  let requestId = null;
  let body = null;
  let transportError = null;
  try {
    const res = await fetch(`${API}/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      /* `language` is REQUIRED by `searchRequest` and has no default; omitting
       * it is a 400 from the shared validator, and a runner that sends a
       * malformed request measures the validator rather than the product.
       * `limit` matches what the client sends. */
      body: JSON.stringify({ query, language: 'en', limit: 5 }),
      signal: controller.signal,
    });
    status = res.status;
    requestId = res.headers.get('x-request-id');
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } catch (error) {
    transportError = String(
      error?.name === 'AbortError' ? `aborted at ${REQUEST_TIMEOUT_MS}ms` : error,
    );
  } finally {
    clearTimeout(timer);
  }
  /* WHOLE-REQUEST wall time, measured by the caller. This is the gate's number:
   * it includes TLS, the hop and the deployed process, none of which an
   * in-process harness pays and all of which an advocate does. */
  const wholeRequestMs = Math.round(performance.now() - started);

  const data = body?.data ?? null;
  const line = requestId ? (phaseLines?.byRequest.get(requestId) ?? null) : null;

  return {
    askedClass,
    query,
    httpStatus: status,
    transportError,
    requestId,
    wholeRequestMs,
    /** From the RESPONSE. */
    queryClass: data?.parsed?.kind ?? data?.queryClass ?? null,
    resultCount: Array.isArray(data?.results) ? data.results.length : null,
    degraded: Array.isArray(data?.degraded) ? data.degraded : null,
    retrievalOutcome: data?.retrievalOutcome ?? null,
    emptyBecause: data?.emptyBecause ?? null,
    /**
     * From the SERVER, correlated by request id. `null` means NOT MEASURED —
     * never zero, and never derived from the total. `timings.ts` is the rule.
     */
    server: line
      ? {
          queryClass: line.query_class ?? null,
          admitted: typeof line.admitted === 'boolean' ? line.admitted : null,
          poolWaitMs: num(line.pool_wait_ms),
          poolWaitMeasured: line.pool_wait_measured === true,
          admissionWaitMs: num(line.admission_wait_ms),
          structuredMs: num(line.structured_ms),
          pinsMs: num(line.pins_ms),
          armsMs: num(line.arms_ms),
          sparseMs: num(line.sparse_ms),
          denseMs: num(line.dense_ms),
          hydrateMs: num(line.hydrate_ms),
          fallbackMs: num(line.fallback_ms),
          serializationMs: num(line.serialization_ms),
          unattributedMs: num(line.unattributed_ms),
          totalMs: num(line.total_ms),
        }
      : null,
  };
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function main() {
  /* Inside `main`, not at module scope: this file is imported by its own test,
   * and a top-level `process.exit(2)` made that import kill the test runner. */
  if (API === '') {
    console.error(
      [
        'usage: --api https://staging-api.lawmind.co   (or LAWMIND_STAGING_API_URL)',
        'This runner measures a DEPLOYED api. For a local number use',
        '  pnpm --filter @lawmind/api measure:round -- --gate-s1',
      ].join('\n'),
    );
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  let classes;
  let querySource;
  if (CORPUS_URL) {
    classes = await drawFromCorpus(CORPUS_URL);
    querySource = 'drawn from the corpus under measurement';
  } else if (QUERIES_FILE) {
    classes = loadQueries(QUERIES_FILE);
    querySource = `pinned: ${QUERIES_FILE}`;
  } else {
    classes = FIXED_CLASSES.map(({ name, queries }) => ({ name, queries }));
    querySource =
      'corpus-independent classes only — the four identifier classes need --corpus-url or --queries';
  }

  if (EMIT_QUERIES) {
    const file = join(OUT, 'gate-s1-queries.json');
    writeFileSync(
      file,
      `${JSON.stringify(
        { kind: 'lawmind-gate-s1-queries', pinnedAt: new Date().toISOString(), classes },
        null,
        2,
      )}\n`,
    );
    console.log(`wrote ${file}`);
    return;
  }

  const phaseLines = PHASE_LOG ? loadPhaseLines(PHASE_LOG) : null;

  /* Release identity FIRST, so the evidence names the build it graded. A number
   * that cannot say which deploy produced it cannot certify a deploy. */
  let version = null;
  /* Assigned by both arms below, so no initialiser: `/ready` is the one call
   * whose FAILURE is itself evidence, and a `null` that survived would be
   * indistinguishable from a probe that never ran. */
  let readiness;
  try {
    version = await (await fetch(`${API}/version`)).json();
  } catch (error) {
    console.error(`could not read ${API}/version: ${error}`);
  }
  try {
    const res = await fetch(`${API}/ready`);
    readiness = { httpStatus: res.status, body: await res.json() };
  } catch (error) {
    readiness = { httpStatus: 0, body: String(error) };
  }

  const samples = [];
  /* Deterministic order, and the FIRST request is kept rather than discarded:
   * the cold case is the one RCC measured at 15,334 ms on a real device, and a
   * harness that throws it away can never see it. */
  for (const cls of classes) {
    for (let round = 0; round < REPEAT; round++) {
      for (const q of cls.queries ?? []) {
        samples.push(await sample(cls.name, q, phaseLines));
      }
    }
  }

  const answered = samples.filter((s) => s.httpStatus === 200);
  const wall = answered.map((s) => s.wholeRequestMs);
  const p95 = percentile(wall, 95);
  const gate =
    samples.length === 0
      ? 'NO_SAMPLES'
      : answered.length !== samples.length
        ? 'FAIL'
        : p95 !== null && p95 <= WHOLE_REQUEST_P95_MS
          ? 'PASS'
          : 'FAIL';

  const byClass = {};
  for (const cls of classes) {
    const mine = samples.filter((s) => s.askedClass === cls.name);
    const ms = mine.filter((s) => s.httpStatus === 200).map((s) => s.wholeRequestMs);
    byClass[cls.name] = {
      n: mine.length,
      nonHttp200: mine.filter((s) => s.httpStatus !== 200).length,
      p50: percentile(ms, 50),
      p95: percentile(ms, 95),
      max: ms.length > 0 ? Math.max(...ms) : null,
      degradedSamples: mine.filter((s) => (s.degraded?.length ?? 0) > 0).length,
    };
  }

  const report = {
    kind: 'lawmind-staging-gate-s1',
    label: LABEL,
    collectedAt: new Date().toISOString(),
    api: API,
    repeat: REPEAT,
    querySource,
    target: { wholeRequestP95Ms: WHOLE_REQUEST_P95_MS, appliesTo: 'staging' },
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    release: version,
    readiness,
    serverPhaseLines: phaseLines
      ? {
          file: PHASE_LOG,
          parsed: phaseLines.parsed,
          correlated: samples.filter((s) => s.server).length,
        }
      : null,
    counts: { samples: samples.length, http200: answered.length },
    wholeRequest: {
      p50: percentile(wall, 50),
      p95,
      p99: percentile(wall, 99),
      max: wall.length > 0 ? Math.max(...wall) : null,
    },
    byClass,
    samples,
    gate,
  };

  const file = join(OUT, 'staging-gate-s1.json');
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nGATE-S1 ${LABEL} — ${API}`);
  console.log(`  queries: ${querySource}`);
  console.log(`  samples: ${samples.length}  http200: ${answered.length}`);
  console.log(
    `  whole-request p50=${report.wholeRequest.p50}ms p95=${p95}ms max=${report.wholeRequest.max}ms ` +
      `(target p95 <= ${WHOLE_REQUEST_P95_MS}ms)`,
  );
  if (!phaseLines) {
    console.log('  server phases: NOT MEASURED (no --phase-log). Never reported as zero.');
  }
  console.log(`  wrote ${file}`);
  console.log(`\nGATE_S1_${gate}`);
  if (gate !== 'PASS') process.exitCode = 1;
}

/* Importable: a test exercises `loadPhaseLines` against the shapes real hosts
 * emit, which is the one part of this runner that silently degrades to "not
 * measured" for a whole run when it is wrong. */
if (process.argv[1] && process.argv[1].endsWith('lcc-staging-gate-s1.mjs')) {
  await main();
}
