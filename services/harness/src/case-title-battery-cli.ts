/**
 * NEW1 — THE FINAL BROAD CASE-TITLE BATTERY, against stable HEAD.
 *
 *   pnpm --filter @lawmind/harness title:battery
 *
 * WHY A SEPARATE FILE AND NOT ANOTHER LAUNCH-BENCHMARK CLASS
 * -----------------------------------------------------------
 * `launch:bench` answers "did the product find the gold". That question is
 * necessary and, for case titles, provably insufficient: 32.3% of the gold
 * titles name **between 2 and 16 different judgments** (measured, and the twins
 * are different matters on different dates, not copies of one). On those rows a
 * rank-1 demand is not a quality bar — it is a coin toss dressed as a metric,
 * and the pooled 67.69% it produced averaged a lookup that is nearly perfect
 * with a question that has no single right answer.
 *
 * So this battery does three things `launch:bench` does not:
 *
 *   1. SPLITS the population into named families BEFORE scoring, so no number
 *      is ever an average across two different questions;
 *   2. scores DUPLICATED titles on **useful disambiguation** — did the page
 *      surface the ambiguous set — rather than on arbitrary rank 1;
 *   3. records candidate coverage separately from rank, because "we never had
 *      it" and "we had it and ordered it badly" are different lanes' problems.
 *
 * THE FAMILIES, AND WHY THEY ARE ORDERED
 * ---------------------------------------
 * Assignment is EARLIEST-WINS over an ordered list, and the order runs from
 * "the query never reached the title route at all" to "it reached it and the
 * corpus is ambiguous". A query that both contains ` AND ` and names a
 * duplicated title is a ROUTING failure first: the pin never happens, so what
 * the corpus holds is not yet the binding constraint.
 *
 *   SECTION_LOOKING   title contains a section-like token; `SECTION_RE` runs
 *                     before `CASE_NAME_RE`, so it routes to statute lookup
 *   AND_OTHERS        title contains a boolean-looking ` AND `; qlang parses it,
 *                     `answerStructured` answers, `/search` returns BEFORE
 *                     `hybridSearch` — the exact-title pin never runs
 *   MULTI_ORDER       twins exist AND share one case_number: the same matter,
 *                     several orders. A DIFFERENT product answer from twins that
 *                     are different matters, so it is not pooled with them.
 *   DUPLICATED_TITLE  twins exist with different case numbers: genuinely
 *                     different judgments under one title
 *   MISSPELLING       query does not normalise onto the stored title, and the
 *                     difference is not one of the known lexical variants
 *   NORMALIZED_VARIANT the query is the stored title modulo the registry's
 *                     furniture — `M/S`, `LTD.`, `AND ORS.`, punctuation
 *   V_VS_VERSUS       the query and the stored title differ ONLY in the
 *                     separator token
 *   UNIQUE_TITLE      one judgment holds this normalised title; nothing else
 *                     about the query is unusual
 *
 * Every row also carries EVERY flag that applied, so the report can cross-tab
 * without re-running. The primary family is for headline numbers; the flags are
 * for anyone who does not believe them.
 *
 * WHAT "AMBIGUITY CORRECTNESS" MEANS HERE, EXACTLY
 * -------------------------------------------------
 * For a duplicated title of size N with a page of size L, the correct behaviour
 * is that the page is FILLED with the ambiguous set: `min(N, L)` of the twins
 * are on the page, and the gold is one of them. Not "gold at rank 1" — an
 * advocate who typed a title shared by six judgments is owed all six, in a
 * stable order, and the choice among them is theirs. `AMBIGUITY_CORRECT` is
 * that condition; `AMBIGUITY_PARTIAL` is some but not all of the room used;
 * `AMBIGUITY_LOST` is gold absent from the page entirely.
 *
 * NOTHING RUNS UNBOUNDED
 * ----------------------
 * The same three bounds as `launch:bench` — statement timeout at the
 * connection, a per-query wall, and a resumable checkpoint after every row. A
 * timeout is recorded WITH its duration and counted as a product failure, not
 * dropped as a missing measurement. The Tier-A walk owns the GPU; this must not
 * become the thing that starves it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { toVectorLiteral } from '@lawmind/embed';

import { createApp } from '@lawmind/api/app';
import { buildLaunchGold, type LaunchGoldRow } from './launch-gold.ts';
import { getHarnessEmbedder } from './harness-embedder.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));

const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/case-title-battery.json');
const CKPT = OUT.replace(/\.json$/, '.checkpoint.jsonl');

/** Production's own page size. Anything past it is UNOBSERVABLE, not absent. */
const RESULT_LIMIT = 5;
const PER_QUERY_MS = Number(process.env['PER_QUERY_MS'] ?? 30_000);
const STATEMENT_MS = Number(process.env['STATEMENT_MS'] ?? 15_000);
const EMBED_TIMEOUT_MS = 2_000;

type Family =
  | 'SECTION_LOOKING'
  | 'AND_OTHERS'
  | 'MULTI_ORDER'
  | 'DUPLICATED_TITLE'
  | 'MISSPELLING'
  | 'NORMALIZED_VARIANT'
  | 'V_VS_VERSUS'
  | 'UNIQUE_TITLE';

type AmbiguityVerdict =
  'AMBIGUITY_CORRECT' | 'AMBIGUITY_PARTIAL' | 'AMBIGUITY_LOST' | 'NOT_AMBIGUOUS';

type Row = {
  queryId: string;
  query: string;
  queryChars: number;
  goldAuthorityId: string;
  goldTitle: string | null;
  /** How many judgments share this NORMALISED title. 1 = unique. */
  twinCount: number;
  /** Of those twins, how many distinct case numbers. 1 = one matter, many orders. */
  twinCaseNumbers: number;
  family: Family;
  flags: string[];
  httpStatus: number;
  returned: number;
  rank: number | null;
  goldInPage: boolean;
  twinsOnPage: number;
  ambiguity: AmbiguityVerdict;
  degraded: string[];
  timedOut: boolean;
  ms: number;
  frozenHash: string;
};

/**
 * The SAME normalisation `judgments_case_title_normalised_idx` was built with.
 * Written out rather than imported so a drift in either place is visible as a
 * difference here, not silently absorbed.
 */
const normaliseTitle = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Registry furniture an advocate never types. Used only to tell variants from misspellings. */
const stripFurniture = (s: string): string =>
  normaliseTitle(s)
    .replace(/\bm\/?s\.?\b/g, ' ')
    .replace(/\b(ltd|pvt|private|limited|co|company|corpn|corporation)\.?\b/g, ' ')
    .replace(/\band\s+(ors|others|anr|another)\.?\b/g, ' ')
    .replace(/[.,()'"&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** All three separators collapse to one token, so V/VS/VERSUS is detectable as its own family. */
const SEPARATOR_RE = /\b(versus|vs?\.?)\b/gi;
const collapseSeparator = (s: string): string => stripFurniture(s.replace(SEPARATOR_RE, ' v '));

/** `SECTION_RE` in retrieve.ts runs BEFORE `CASE_NAME_RE`. This mirrors what it catches. */
const SECTION_LOOKING_RE = /\b(section|sec\.?|s\.)\s*\d+/i;
/** qlang reads a bare ` AND ` as a boolean operator. ` AND ORS`/`AND OTHERS` included. */
const AND_RE = /\s+AND\s+/;

function classify(row: {
  query: string;
  goldTitle: string | null;
  twinCount: number;
  twinCaseNumbers: number;
}): { family: Family; flags: string[] } {
  const flags: string[] = [];
  const q = row.query;
  const title = row.goldTitle;

  if (SECTION_LOOKING_RE.test(q)) flags.push('SECTION_LOOKING');
  if (AND_RE.test(q)) flags.push('AND_OTHERS');
  if (row.twinCount > 1 && row.twinCaseNumbers === 1) flags.push('MULTI_ORDER');
  if (row.twinCount > 1 && row.twinCaseNumbers > 1) flags.push('DUPLICATED_TITLE');
  if (row.twinCount === 1) flags.push('UNIQUE_TITLE');

  if (title) {
    const exact = normaliseTitle(q) === normaliseTitle(title);
    const sameModuloSeparator = collapseSeparator(q) === collapseSeparator(title);
    const sameModuloFurniture = stripFurniture(q) === stripFurniture(title);
    if (!exact && sameModuloSeparator && !sameModuloFurniture) flags.push('V_VS_VERSUS');
    else if (!exact && sameModuloFurniture) flags.push('NORMALIZED_VARIANT');
    else if (!exact && !sameModuloSeparator) flags.push('MISSPELLING');
  }

  // EARLIEST-WINS. Routing bypasses first: on those rows the corpus's ambiguity
  // is not yet the binding constraint, because the pin never ran.
  const order: Family[] = [
    'SECTION_LOOKING',
    'AND_OTHERS',
    'MULTI_ORDER',
    'DUPLICATED_TITLE',
    'MISSPELLING',
    'NORMALIZED_VARIANT',
    'V_VS_VERSUS',
    'UNIQUE_TITLE',
  ];
  const family = order.find((f) => flags.includes(f)) ?? 'UNIQUE_TITLE';
  return { family, flags };
}

type Sql = ReturnType<typeof postgres>;

/**
 * Twin counts, in ONE query for the whole gold rather than one per row.
 *
 * `MATERIALIZED` for the same reason `exactCaseTitle` needs it: an ordering or a
 * limit on top of a parameterised equality lets the planner walk a date index
 * backwards and filter, which for a title held by one row in 18.7M never
 * terminates in time.
 */
async function loadTitleFacts(
  sql: Sql,
  ids: string[],
): Promise<
  Map<string, { title: string; twinCount: number; twinCaseNumbers: number; twinIds: string[] }>
> {
  const out = new Map<
    string,
    { title: string; twinCount: number; twinCaseNumbers: number; twinIds: string[] }
  >();
  if (ids.length === 0) return out;

  const golds = await sql<{ id: string; case_title: string }[]>`
    SELECT id, case_title FROM judgments WHERE id = ANY(${ids}::uuid[])
  `;

  for (const g of golds) {
    const twins = await sql<{ id: string; case_number: string | null }[]>`
      WITH hits AS MATERIALIZED (
        SELECT j.id, j.case_number
        FROM judgments j
        WHERE lower(btrim(regexp_replace(j.case_title, '\\s+', ' ', 'g'))) =
              lower(btrim(regexp_replace(${g.case_title}, '\\s+', ' ', 'g')))
        LIMIT 200
      )
      SELECT id, case_number FROM hits
    `;
    out.set(g.id, {
      title: g.case_title,
      twinCount: twins.length,
      twinCaseNumbers: new Set(twins.map((t) => t.case_number ?? t.id)).size,
      twinIds: twins.map((t) => t.id),
    });
  }
  return out;
}

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(2)}%`);
const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const gold = buildLaunchGold();
  const rows0 = gold.rows.filter((r) => r.launchClass === 'case_title');
  console.log(`CASE_TITLE_BATTERY  frozenHash=${gold.frozenHash}  rows=${rows0.length}`);
  console.log(
    `  bounds: per-query ${PER_QUERY_MS}ms · statement ${STATEMENT_MS}ms · page ${RESULT_LIMIT}`,
  );

  const sql = postgres(url, {
    max: 4,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: STATEMENT_MS },
  });

  const done = new Set<string>();
  const results: Row[] = [];
  if (existsSync(CKPT)) {
    for (const line of readFileSync(CKPT, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as Row;
        if (r.frozenHash !== gold.frozenHash) continue;
        done.add(r.queryId);
        results.push(r);
      } catch {
        // truncated last line from a killed run
      }
    }
    if (done.size > 0) console.log(`  resuming: ${done.size} already measured`);
  }
  mkdirSync(dirname(CKPT), { recursive: true });

  console.log('  loading title facts (twin counts) …');
  const facts = await loadTitleFacts(sql, [...new Set(rows0.map((r) => r.goldAuthorityId))]);
  console.log(`  title facts for ${facts.size} gold authorities`);

  const embedQuery = async (text: string): Promise<string | null> => {
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), EMBED_TIMEOUT_MS);
    });
    try {
      const embed = (async (): Promise<string | null> => {
        const embedder = (await getHarnessEmbedder()).embedder;
        const [embedded] = await embedder.embed([text]);
        return embedded ? toVectorLiteral(embedded.vector) : null;
      })();
      return await Promise.race([embed, budget]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const app = createApp({
    ping: async () => void (await sql`SELECT 1`),
    search: { sql, embedQuery },
  });
  const provenance = (await getHarnessEmbedder()).provenance;
  console.log(
    `  embedder: ${provenance.device}${provenance.endpoint ? ' ' + provenance.endpoint : ''}`,
  );
  await embedQuery('warm');

  const run = async (g: LaunchGoldRow): Promise<Row> => {
    const fact = facts.get(g.goldAuthorityId) ?? null;
    const twinCount = fact?.twinCount ?? 1;
    const twinCaseNumbers = fact?.twinCaseNumbers ?? 1;
    const twinSet = new Set(fact?.twinIds ?? []);
    const { family, flags } = classify({
      query: g.query,
      goldTitle: fact?.title ?? null,
      twinCount,
      twinCaseNumbers,
    });

    const t = Date.now();
    let httpStatus = 0;
    let returned = 0;
    let rank: number | null = null;
    let twinsOnPage = 0;
    let degraded: string[] = [];
    let timedOut = false;

    const request = (async (): Promise<void> => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: g.query, language: 'en' }),
      });
      httpStatus = res.status;
      if (res.status !== 200) return;
      const body = (await res.json()) as {
        data?: { results?: Record<string, unknown>[]; degraded?: string[] };
      };
      const hits = body.data?.results ?? [];
      degraded = body.data?.degraded ?? [];
      returned = hits.length;
      const at = hits.findIndex((h) => h['judgmentId'] === g.goldAuthorityId);
      rank = at === -1 ? null : at + 1;
      twinsOnPage = hits.filter((h) => twinSet.has(String(h['judgmentId'] ?? ''))).length;
    })();

    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, PER_QUERY_MS);
    });
    try {
      await Promise.race([request, budget]);
    } catch {
      httpStatus = httpStatus || 500;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const goldInPage = rank !== null;
    /**
     * `room` is what the page COULD hold of the ambiguous set. Demanding more
     * than `RESULT_LIMIT` twins on a 5-slot page would score a correct product
     * as broken; that is the instrument artefact this battery exists to avoid.
     */
    const room = Math.min(twinCount, RESULT_LIMIT);
    const ambiguity: AmbiguityVerdict =
      twinCount <= 1
        ? 'NOT_AMBIGUOUS'
        : !goldInPage
          ? 'AMBIGUITY_LOST'
          : twinsOnPage >= room
            ? 'AMBIGUITY_CORRECT'
            : 'AMBIGUITY_PARTIAL';

    return {
      queryId: g.queryId,
      query: g.query,
      queryChars: g.query.length,
      goldAuthorityId: g.goldAuthorityId,
      goldTitle: fact?.title ?? null,
      twinCount,
      twinCaseNumbers,
      family,
      flags,
      httpStatus,
      returned,
      rank,
      goldInPage,
      twinsOnPage,
      ambiguity,
      degraded,
      timedOut,
      ms: Date.now() - t,
      frozenHash: gold.frozenHash,
    };
  };

  let n = 0;
  for (const g of rows0) {
    n += 1;
    if (done.has(g.queryId)) continue;
    const row = await run(g);
    results.push(row);
    appendFileSync(CKPT, JSON.stringify(row) + '\n');
    if (n % 10 === 0 || row.timedOut) {
      console.log(
        `  [${n}/${rows0.length}] ${row.family.padEnd(18)} rank=${row.rank ?? '-'} twins=${row.twinCount} ${row.ms}ms${row.timedOut ? ' TIMEOUT' : ''}`,
      );
    }
  }

  // ── report ────────────────────────────────────────────────────────────────
  const families = [...new Set(results.map((r) => r.family))].sort();
  const summary: Record<string, unknown> = {};
  console.log('');
  console.log(
    'FAMILY               n   s@1      s@5      coverage  ambigOK  degraded  timeouts  p50    p95',
  );
  for (const f of families) {
    const sub = results.filter((r) => r.family === f);
    const s1 = sub.filter((r) => r.rank === 1).length;
    const s5 = sub.filter((r) => r.rank !== null && r.rank <= 5).length;
    const cov = sub.filter((r) => r.goldInPage).length;
    const amb = sub.filter((r) => r.ambiguity === 'AMBIGUITY_CORRECT').length;
    const ambN = sub.filter((r) => r.ambiguity !== 'NOT_AMBIGUOUS').length;
    const deg = sub.filter((r) => r.degraded.length > 0).length;
    const to = sub.filter((r) => r.timedOut).length;
    const ms = sub.map((r) => r.ms);
    summary[f] = {
      n: sub.length,
      s1,
      s1Pct: pct(s1, sub.length),
      s5,
      s5Pct: pct(s5, sub.length),
      candidateCoverage: cov,
      candidateCoveragePct: pct(cov, sub.length),
      ambiguityScorable: ambN,
      ambiguityCorrect: amb,
      ambiguityCorrectPct: pct(amb, ambN),
      ambiguityPartial: sub.filter((r) => r.ambiguity === 'AMBIGUITY_PARTIAL').length,
      ambiguityLost: sub.filter((r) => r.ambiguity === 'AMBIGUITY_LOST').length,
      degraded: deg,
      timeouts: to,
      p50: quantile(ms, 0.5),
      p95: quantile(ms, 0.95),
      max: Math.max(0, ...ms),
    };
    console.log(
      f.padEnd(20) +
        String(sub.length).padStart(3) +
        pct(s1, sub.length).padStart(9) +
        pct(s5, sub.length).padStart(9) +
        pct(cov, sub.length).padStart(10) +
        (ambN === 0 ? '      -' : pct(amb, ambN).padStart(9)) +
        String(deg).padStart(10) +
        String(to).padStart(10) +
        String(quantile(ms, 0.5)).padStart(7) +
        String(quantile(ms, 0.95)).padStart(7),
    );
  }

  const all = results;
  const pooled = {
    n: all.length,
    s1: all.filter((r) => r.rank === 1).length,
    s5: all.filter((r) => r.rank !== null && r.rank <= 5).length,
    candidateCoverage: all.filter((r) => r.goldInPage).length,
    degraded: all.filter((r) => r.degraded.length > 0).length,
    timeouts: all.filter((r) => r.timedOut).length,
    http400: all.filter((r) => r.httpStatus === 400).length,
    http500: all.filter((r) => r.httpStatus >= 500).length,
    p50: quantile(
      all.map((r) => r.ms),
      0.5,
    ),
    p95: quantile(
      all.map((r) => r.ms),
      0.95,
    ),
  };
  console.log('');
  console.log(
    `POOLED (reported, NEVER the gate): n=${pooled.n} s@1 ${pct(pooled.s1, pooled.n)} s@5 ${pct(pooled.s5, pooled.n)} ` +
      `coverage ${pct(pooled.candidateCoverage, pooled.n)} degraded ${pooled.degraded} timeouts ${pooled.timeouts}`,
  );
  console.log('  A pooled case-title number averages a lookup that is near-perfect with a');
  console.log('  question that has no single right answer. The family table is the result.');

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_case_title_battery',
        generatedAt: new Date().toISOString(),
        frozenHash: gold.frozenHash,
        embedder: provenance,
        bounds: { perQueryMs: PER_QUERY_MS, statementMs: STATEMENT_MS, resultLimit: RESULT_LIMIT },
        pooled,
        byFamily: summary,
        rows: results,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
  await sql.end({ timeout: 5 });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
