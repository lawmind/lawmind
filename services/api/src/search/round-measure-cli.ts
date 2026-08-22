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
const labelIndex = args.indexOf('--label');
const LABEL = labelIndex === -1 ? 'LOCAL_CONTENDED' : (args[labelIndex + 1] ?? 'LOCAL_CONTENDED');

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
  },
});

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
