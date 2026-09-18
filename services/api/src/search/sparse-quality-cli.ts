/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPARSE ADMISSION QUALITY GATE — WHAT R12 MEASURED, PLUS WHAT IT DID NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Roadmap v7.1 §5.7: *"Sparse search must be measured for usefulness, not only
 * speed. Candidate count and latency alone can certify a fast but bad search."*
 * And the sentence that decides what passes: **a 4 ms response that is legally
 * useless does not pass.**
 *
 * `docs/ai/lcc-r12/search-battery.json` measured state, results, p50, degraded
 * arms and rarest document frequency across 40 filter/query pairs. Every one of
 * those is a SPEED-or-mechanism number. It carries no p95, no population either
 * side of the filter, and — the one that matters — no evidence that an admitted
 * query returned the authority an advocate was looking for.
 *
 * This file adds exactly the missing columns, over the same ranker the route
 * calls, and refuses to invent the one thing it cannot know:
 *
 *   FILTER_SHAPE                 the request's own filter, named
 *   PRE_FILTER_POPULATION        judgments eligible before the filter
 *   POST_FILTER_POPULATION       judgments the filter leaves (or a capped floor)
 *   CANDIDATE_POPULATION         what the rankers actually produced
 *   ADMITTED_OR_REFUSED          the admission decision, from the ranker itself
 *   P50 / P95                    over repeated runs, with the box's load recorded
 *   KNOWN_TARGET_PRESENT_AT_10   for queries with an ADJUDICATED target
 *   KNOWN_TARGET_PRESENT_AT_50   the same, at reachable depth
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUALITY_UNLABELED IS A RESULT, NOT A GAP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `bail` has no single right answer. Marking it `QUALITY_UNLABELED` is the
 * honest reading; inventing a relevance judgement for it would produce a number
 * that looks like evidence and is not. So the battery has two halves that are
 * never mixed:
 *
 *   the OPERATIONAL half   the broad/filtered queries the daily loop issues.
 *                          Latency and admission are meaningful; quality is
 *                          UNLABELED and says so.
 *   the ADJUDICATED half   a slice of `docs/ai/new3-noncitation-gold.json`,
 *                          where NEW3 already fixed which authority answers the
 *                          query. present@10 and present@50 mean something here
 *                          and only here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MEASUREMENT IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `queryVector` is null throughout, because `semanticArmPermitted()` is false in
 * v1 and null is what production passes today. Measuring with an embedding would
 * measure a capability the product does not ship. Everything here is the LEXICAL
 * system.
 *
 * Latency is LOCAL_CONTENDED by default. The GPU walk, the ingest fleet and the
 * enrichment workers share this box; `pg_stat_activity` is sampled with every
 * timing so a slow row can be read against what else was running rather than
 * being blamed on the query.
 *
 *   pnpm --filter @lawmind/api exec tsx src/search/sparse-quality-cli.ts
 *   ... --repeats 5 --gold 40 --label LOCAL_QUIET
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { hybridSearch, type RetrievalSignals, type SearchFilters } from './retrieve.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const OUT = join(ROOT, 'docs', 'ai', 'lcc-r13', 'sparse-quality-battery.json');
const GOLD = join(ROOT, 'docs', 'ai', 'new3-noncitation-gold.json');

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const args = process.argv.slice(2);
const num = (flag: string, fallback: number) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const str = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
};

const REPEATS = num('--repeats', 5);
const GOLD_N = num('--gold', 40);
const LABEL = str('--label', 'LOCAL_CONTENDED');
const LIMIT = 50;

const sql = postgres(url, {
  max: 2,
  ssl: false,
  onnotice: () => {},
  connection: { statement_timeout: 0 },
});

/**
 * What else is on the box, sampled at the moment of measurement.
 *
 * A 1.4-second query has been timed at over twelve minutes on this machine
 * because a fleet was mid-scan. A latency with no load beside it is not a
 * latency, it is an anecdote.
 */
async function boxLoad(): Promise<{ activeBackends: number; longestActiveSeconds: number | null }> {
  const rows = await sql<{ n: number; longest: number | null }[]>`
    SELECT count(*)::int AS n,
           max(extract(epoch FROM (now() - query_start)))::float AS longest
      FROM pg_stat_activity
     WHERE state = 'active' AND pid <> pg_backend_pid()`;
  return { activeBackends: rows[0]?.n ?? 0, longestActiveSeconds: rows[0]?.longest ?? null };
}

function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Number((s[i] ?? 0).toFixed(1));
}

/** The corpus-wide eligible population — the denominator every filter narrows. */
async function preFilterPopulation(): Promise<number> {
  const [row] = await sql<{ n: string }[]>`SELECT count(*)::bigint AS n FROM judgments`;
  return Number(row?.n ?? 0);
}

/**
 * What the request's own filters leave. The ranker reports this only when it
 * actually ran the filtered probe, so it is computed here for every row —
 * otherwise an admitted query has no denominator at all and its candidate count
 * cannot be read.
 */
async function postFilterPopulation(f: SearchFilters): Promise<number> {
  const [row] = await sql<{ n: string }[]>`
    SELECT count(*)::bigint AS n FROM judgments j
     WHERE true
       ${f.court ? sql`AND j.court = ${f.court}` : sql``}
       ${f.dateFrom ? sql`AND j.judgment_date >= ${f.dateFrom}::date` : sql``}
       ${f.dateTo ? sql`AND j.judgment_date <= ${f.dateTo}::date` : sql``}
       ${f.caseType ? sql`AND j.case_type = ${f.caseType}` : sql``}`;
  return Number(row?.n ?? 0);
}

type Row = {
  id: string;
  query: string;
  filterShape: string;
  filters: SearchFilters;
  preFilterPopulation: number;
  postFilterPopulation: number;
  candidatePopulation: number;
  admittedOrRefused: 'admitted' | 'refused';
  filteredAdmission: string | null;
  filteredPopulationFromRanker: number | null;
  filteredPopulationCapped: boolean | null;
  sparseRarestDf: number | null;
  degraded: string[];
  /**
   * COLD and WARM are reported separately, because mixing them makes both
   * meaningless. Measured 30 Aug 2026: `condonation of delay limitation`
   * unfiltered ran 48,430 / 9,160 / 9,024 ms — the first run is 5x the settled
   * value on this box, every time, and `pg_stat_activity` showed ZERO other
   * active backends, so it is cache and not contention.
   *
   * A p95 computed over the mixed set is just the cold run wearing a percentile.
   */
  coldFirstRunMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  /** True when the warm sample is too small for p95 to mean more than `max`. */
  p95IsMaxOfSample: boolean;
  runsMs: number[];
  knownTargetPresentAt10: boolean | 'QUALITY_UNLABELED';
  knownTargetPresentAt50: boolean | 'QUALITY_UNLABELED';
  knownTargetRank: number | null;
  boxLoadAtStart: { activeBackends: number; longestActiveSeconds: number | null };
};

async function measure(
  id: string,
  query: string,
  filterShape: string,
  filters: SearchFilters,
  target: string | null,
  pre: number,
): Promise<Row> {
  const load = await boxLoad();
  const post = await postFilterPopulation(filters);

  const runs: number[] = [];
  let last: Awaited<ReturnType<typeof hybridSearch>> = [];
  let signals: RetrievalSignals = { exactTitleCandidates: 0 };
  const degraded = new Set<string>();

  for (let i = 0; i < REPEATS; i += 1) {
    const s: RetrievalSignals = { exactTitleCandidates: 0 };
    const t = performance.now();

    // runs would measure contention we introduced rather than the query.
    const results = await hybridSearch(
      sql,
      query,
      null,
      filters,
      LIMIT,
      'hybrid',
      (arm) => degraded.add(arm),
      0,
      s,
    );
    runs.push(Number((performance.now() - t).toFixed(1)));
    last = results;
    signals = s;
  }

  // The first run is the cold one and is kept, not discarded — but it is not
  // allowed to define the warm distribution.
  const warm = runs.slice(1);
  const rank = target ? last.findIndex((r) => r.judgmentId === target) : -1;
  const labelled = target !== null;

  return {
    id,
    query,
    filterShape,
    filters,
    preFilterPopulation: pre,
    postFilterPopulation: post,
    candidatePopulation: last.length,
    // The ranker's own decision. `refused` is the state where it declined to
    // scan; zero results after an admitted scan is a different fact and is not
    // collapsed into it.
    admittedOrRefused:
      degraded.has('sparse_unbounded') && last.length === 0 ? 'refused' : 'admitted',
    filteredAdmission: signals.filteredAdmission ?? null,
    filteredPopulationFromRanker: signals.filteredPopulation ?? null,
    filteredPopulationCapped: signals.filteredPopulationCapped ?? null,
    sparseRarestDf: signals.sparseRarestDf ?? null,
    degraded: [...degraded],
    coldFirstRunMs: runs[0] ?? 0,
    p50Ms: percentile(warm, 50),
    p95Ms: percentile(warm, 95),
    maxMs: Math.max(...(warm.length ? warm : runs)),
    p95IsMaxOfSample: warm.length < 20,
    runsMs: runs,
    knownTargetPresentAt10: labelled ? rank >= 0 && rank < 10 : 'QUALITY_UNLABELED',
    knownTargetPresentAt50: labelled ? rank >= 0 && rank < 50 : 'QUALITY_UNLABELED',
    knownTargetRank: rank >= 0 ? rank + 1 : null,
    boxLoadAtStart: load,
  };
}

/**
 * The filter shapes the daily loop actually issues, plus the two extremes.
 * Court names are read from the corpus rather than typed, so a renamed court
 * cannot silently turn a shape into "matches nothing" while still reporting a
 * latency.
 */
async function filterShapes(): Promise<{ name: string; filters: SearchFilters }[]> {
  const courts = await sql<{ court: string; n: string }[]>`
    SELECT court, count(*)::bigint AS n FROM judgments GROUP BY court ORDER BY count(*) DESC`;
  const sc = courts.find((c) => /supreme court/i.test(c.court));
  const large = courts.find((c) => !/supreme court/i.test(c.court));
  const small = [...courts]
    .reverse()
    .find((c) => Number(c.n) > 1000 && !/supreme court/i.test(c.court));

  const shapes: { name: string; filters: SearchFilters }[] = [{ name: 'unfiltered', filters: {} }];
  if (large) {
    shapes.push({ name: 'court:large_hc', filters: { court: large.court } });
    shapes.push({
      name: 'court+month',
      filters: { court: large.court, dateFrom: '2024-01-01', dateTo: '2024-01-31' },
    });
    shapes.push({
      name: 'court+year',
      filters: { court: large.court, dateFrom: '2024-01-01', dateTo: '2024-12-31' },
    });
    shapes.push({ name: 'court+caseType', filters: { court: large.court, caseType: 'criminal' } });
  }
  if (sc) shapes.push({ name: 'court:supreme_court', filters: { court: sc.court } });
  if (small) shapes.push({ name: 'court:small_hc', filters: { court: small.court } });
  return shapes;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const pre = await preFilterPopulation();
  const shapes = await filterShapes();

  // ── the operational half — no adjudicated target exists, and none is invented
  const OPERATIONAL = [
    'bail',
    'anticipatory bail',
    'quashing FIR',
    'interim injunction',
    'condonation of delay limitation',
  ];
  const operational: Row[] = [];
  for (const q of OPERATIONAL) {
    for (const shape of shapes) {
      const row = await measure(`op:${q}:${shape.name}`, q, shape.name, shape.filters, null, pre);
      operational.push(row);
      console.log(
        `${row.id.padEnd(48)} ${row.admittedOrRefused.padEnd(9)} post=${String(row.postFilterPopulation).padStart(9)} cand=${String(row.candidatePopulation).padStart(3)} p50=${String(row.p50Ms).padStart(8)} p95=${String(row.p95Ms).padStart(8)}`,
      );
    }
  }

  // ── the adjudicated half — the only place a quality number is meaningful ────
  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as {
    version?: string;
    cases: { query_id: string; query: string; authority_id: string; court: string }[];
  };
  // Deterministic slice: every run measures the same queries, so two rounds are
  // comparable. A random sample would move the number without moving the system.
  const slice = gold.cases.filter((c) => c.query && c.authority_id).slice(0, GOLD_N);

  const adjudicated: Row[] = [];
  for (const c of slice) {
    const held = await sql<
      { n: string }[]
    >`SELECT count(*)::bigint AS n FROM judgments WHERE id = ${c.authority_id}::uuid`;
    if (Number(held[0]?.n ?? 0) === 0) {
      // The target left the corpus. Recording the absence beats scoring a miss
      // against a query whose answer is genuinely not here any more.
      adjudicated.push({
        id: `gold:${c.query_id}`,
        query: c.query,
        filterShape: 'unfiltered',
        filters: {},
        preFilterPopulation: pre,
        postFilterPopulation: pre,
        candidatePopulation: 0,
        admittedOrRefused: 'refused',
        filteredAdmission: null,
        filteredPopulationFromRanker: null,
        filteredPopulationCapped: null,
        sparseRarestDf: null,
        degraded: ['gold_target_absent_from_corpus'],
        coldFirstRunMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        maxMs: 0,
        p95IsMaxOfSample: true,
        runsMs: [],
        knownTargetPresentAt10: 'QUALITY_UNLABELED',
        knownTargetPresentAt50: 'QUALITY_UNLABELED',
        knownTargetRank: null,
        boxLoadAtStart: { activeBackends: 0, longestActiveSeconds: null },
      });
      continue;
    }

    const row = await measure(`gold:${c.query_id}`, c.query, 'unfiltered', {}, c.authority_id, pre);
    adjudicated.push(row);
    console.log(
      `${row.id.padEnd(48)} ${row.admittedOrRefused.padEnd(9)} rank=${String(row.knownTargetRank ?? '-').padStart(3)} @10=${String(row.knownTargetPresentAt10).padStart(5)} p50=${String(row.p50Ms).padStart(8)}`,
    );
  }

  const scored = adjudicated.filter((r) => r.knownTargetPresentAt10 !== 'QUALITY_UNLABELED');
  const at10 = scored.filter((r) => r.knownTargetPresentAt10 === true).length;
  const at50 = scored.filter((r) => r.knownTargetPresentAt50 === true).length;

  const report = {
    kind: 'lcc_sparse_quality_battery',
    writtenAt: startedAt,
    finishedAt: new Date().toISOString(),
    label: LABEL,
    repeats: REPEATS,
    limit: LIMIT,
    method: {
      ranker: 'services/api/src/search/retrieve.ts hybridSearch — the function POST /search calls',
      queryVector:
        'null. semanticArmPermitted() is false in v1, so null is what production passes. This measures the LEXICAL system only.',
      goldSet: `docs/ai/new3-noncitation-gold.json${gold.version ? ` (${gold.version})` : ''}, first ${GOLD_N} cases with a query and an authority`,
      qualityUnlabeledRule:
        'A query with no previously adjudicated target is recorded QUALITY_UNLABELED. No relevance judgement is invented for it.',
      latencyCaveat:
        'pg_stat_activity is sampled at the start of every row. A latency without the concurrent load beside it is an anecdote on this box.',
      coldWarmRule:
        'The FIRST run of every row is reported separately as coldFirstRunMs and excluded from p50/p95. It is routinely 5x the settled value with zero other active backends, so it measures cache state rather than the query. p95IsMaxOfSample is true whenever the warm sample is under 20 runs, which is the honest reading of a percentile over a handful of points.',
    },
    corpus: { preFilterPopulation: pre },
    filterShapes: shapes.map((s) => s.name),
    summary: {
      operationalRows: operational.length,
      operationalRefused: operational.filter((r) => r.admittedOrRefused === 'refused').length,
      operationalAdmitted: operational.filter((r) => r.admittedOrRefused === 'admitted').length,
      operationalP95Worst: Math.max(...operational.map((r) => r.p95Ms)),
      operationalColdWorst: Math.max(...operational.map((r) => r.coldFirstRunMs)),
      adjudicatedScored: scored.length,
      adjudicatedTargetAbsent: adjudicated.length - scored.length,
      knownTargetPresentAt10: scored.length ? Number((at10 / scored.length).toFixed(4)) : null,
      knownTargetPresentAt50: scored.length ? Number((at50 / scored.length).toFixed(4)) : null,
      knownTargetPresentAt10Fraction: `${at10}/${scored.length}`,
      knownTargetPresentAt50Fraction: `${at50}/${scored.length}`,
    },
    operational,
    adjudicated,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `\npresent@10 ${report.summary.knownTargetPresentAt10Fraction}  ·  present@50 ${report.summary.knownTargetPresentAt50Fraction}`,
  );
  console.log(OUT);
  await sql.end({ timeout: 10 });
}

await main();
