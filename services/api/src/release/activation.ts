/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A RESTORED CORPUS GENERATION IS NOT READY TO SERVE BECAUSE ITS ROWS ARRIVED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ops/release-restore-cli.ts` proves DATA INTEGRITY: every row, every checksum,
 * no dangling foreign key, no invalid index. All of that can be true of a
 * database that answers legal search in fifteen seconds, because integrity says
 * nothing about the OPTIMIZER.
 *
 * A freshly loaded table has no statistics until something analyses it. The
 * planner then costs it as if it were empty and picks a plan built for no rows —
 * exactly the failure class the sparse arm's constant estimate produced, arriving
 * on day one of a new deployment instead of after months of drift. `pg_restore`
 * does not carry `pg_statistic` and neither does a `COPY`-based release; and
 * autovacuum's analyse is a background promise, not a precondition.
 *
 * So activation — the pointer switch that makes a generation the one advocates
 * search — gains two prerequisites beside the restore's own verdict:
 *
 *     RESTORE  ->  integrity verified  ->  STATISTICS  ->  SEARCH SMOKE  ->  ACTIVATE
 *
 * Both are recorded on the generation, and both can REFUSE. There is no second
 * orchestrator: `release-restore-cli.ts` stays the one place a release is landed
 * and verified, and this module is the decision it consults.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SMOKE, WHEN STATISTICS ARE ALREADY CHECKED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Because "ANALYZE ran" and "search works" are different claims, and only the
 * second is the one the advocate experiences. A generation can have perfect
 * statistics and still be unservable — a missing extension, a text collation the
 * ranker's index cannot use, a `lexeme_document_frequency` table that arrived
 * empty so every query is refused as unbounded. Each of those passes an integrity
 * check and a statistics check, and each is caught the first time something
 * actually searches.
 *
 * The smoke runs the REAL retrieval functions — `answerStructured` and
 * `hybridSearch` — against the restored generation. Not a re-implementation: a
 * second spelling of the search path would be a second thing to keep correct, and
 * the one it disagreed with would be the one that shipped.
 */
import type { Sql } from 'postgres';

import { hybridSearch, type DegradedArm } from '../search/retrieve.ts';
import { answerStructured } from '../search/structured.ts';

/**
 * The corpus tables the search planner costs a plan over.
 *
 * Deliberately NOT "every table in the release". A statistics gate that demands
 * fresh statistics on a table no query plans over is a gate that fails for
 * reasons nobody can act on, and a gate people learn to override is not a gate.
 * These six are the ones a search request's plans are built from.
 */
export const SEARCH_CRITICAL_TABLES: readonly string[] = [
  'judgments',
  'judgment_chunks',
  'judgment_citations',
  'lexeme_document_frequency',
  'statutes',
  'statute_sections',
];

export type TableStatistics = {
  table: string;
  /**
   * ── DOES THIS TABLE HOLD A ROW? ASKED OF THE ROWS ─────────────────────────
   *
   * `EXISTS (SELECT 1 FROM t)`, and null when the relation does not exist.
   *
   * It reads like the expensive answer and is the cheap one: no predicate, so
   * the scan stops at the first live tuple. Every cheaper proxy was tried here
   * and each is wrong in a way that makes the gate pass on its own blind spot:
   *
   * - **`pg_stat_user_tables.n_live_tup`** answered **620** for a `judgments`
   *   table of 129.5 GB on the development corpus. The statistics collector was
   *   reset by a server crash, so a table holding eighteen million rows would
   *   have been classified EMPTY and waved through.
   * - **`reltuples` / `relpages`** are written BY `VACUUM`/`ANALYZE`, so a
   *   freshly `COPY`-loaded table reads zero from either — precisely the state
   *   this gate exists to catch.
   * - **`pg_table_size`** counts the TOAST table, the free space map and the
   *   visibility map, so a table created seconds ago with no rows in it is
   *   already non-zero. The activation proof caught this one: five genuinely
   *   empty tables were reported as populated-and-unanalysed, and a correct
   *   generation refused to activate.
   *
   * The size is still recorded below, as provenance an operator can read. It is
   * not the test.
   */
  hasRows: boolean | null;
  /** `pg_table_size` in bytes. Provenance for an operator, never the test. */
  sizeBytes: number | null;
  /** `pg_class.reltuples` — the planner's own row estimate. Provenance only. */
  plannerRowEstimate: number | null;
  lastAnalyze: string | null;
  lastAutoanalyze: string | null;
  /** Rows in `pg_statistic` for this relation — the planner's actual input. */
  statisticRows: number;
};

export type StatisticsVerdict = {
  ready: boolean;
  /** Tables that hold rows and have no `pg_statistic` entry at all. */
  unanalyzed: string[];
  /** Tables the release should carry and the target does not have. */
  absent: string[];
  /** Empty tables, which are trivially planned and are NOT a failure. */
  empty: string[];
};

/**
 * Are the optimizer's inputs present for every table search plans over?
 *
 * ── WHY `pg_statistic` AND NOT ONLY `last_analyze` ──────────────────────────
 *
 * `last_analyze` is null on a table autovacuum analysed, and `last_autoanalyze`
 * is null on a table an operator analysed by hand. Reading either alone reports
 * a perfectly well-planned table as unready. Worse, both can be non-null on a
 * table whose statistics were later discarded.
 *
 * The planner does not read those columns. It reads `pg_statistic`. So that is
 * what this asks, and the two timestamps are carried alongside as PROVENANCE —
 * they say who analysed it and when, which is what an operator needs in order to
 * decide whether the statistics are stale, but they are not the readiness test.
 *
 * ── AN EMPTY TABLE IS READY ─────────────────────────────────────────────────
 *
 * PostgreSQL writes no `pg_statistic` row for a relation with no rows, and
 * nothing is wrong with that: a plan over zero rows built from zero statistics is
 * a correct plan. Demanding statistics there would make every bounded test
 * release refuse activation forever. It is reported, not failed.
 */
export function statisticsVerdict(stats: readonly TableStatistics[]): StatisticsVerdict {
  const absent = stats.filter((s) => s.hasRows === null).map((s) => s.table);
  const empty = stats.filter((s) => s.hasRows === false).map((s) => s.table);
  const unanalyzed = stats
    .filter((s) => s.hasRows === true && s.statisticRows === 0)
    .map((s) => s.table);
  return {
    ready: absent.length === 0 && unanalyzed.length === 0,
    unanalyzed,
    absent,
    empty,
  };
}

export async function readStatistics(
  sql: Sql,
  tables: readonly string[] = SEARCH_CRITICAL_TABLES,
): Promise<TableStatistics[]> {
  const rows = await sql<
    {
      table: string;
      size_bytes: string | null;
      planner_rows: string | null;
      last_analyze: string | null;
      last_autoanalyze: string | null;
      statistic_rows: string;
    }[]
  >`
    SELECT t.name AS table,
           -- to_regclass is NULL for a relation that does not exist, which is how
           -- "absent" stays distinguishable from "empty" in one query.
           pg_table_size(c.oid)::text AS size_bytes,
           c.reltuples::text AS planner_rows,
           s.last_analyze::text AS last_analyze,
           s.last_autoanalyze::text AS last_autoanalyze,
           (SELECT count(*) FROM pg_statistic st WHERE st.starelid = c.oid)::text AS statistic_rows
      FROM unnest(${tables as string[]}::text[]) AS t(name)
      LEFT JOIN pg_class c
             ON c.oid = to_regclass('public.' || quote_ident(t.name))
      LEFT JOIN pg_stat_user_tables s
             ON s.schemaname = 'public' AND s.relname = t.name`;

  /**
   * The row probe, one statement per table and NOT folded into the catalogue
   * query above. `EXISTS` over a relation named by a lateral join would have to
   * be built with `sql.unsafe` on an interpolated identifier; running it
   * separately keeps the identifier a bound value the catalogue already
   * validated, and a table that vanished between the two reads simply answers
   * `null` again.
   */
  const out: TableStatistics[] = [];
  for (const r of rows) {
    let hasRows: boolean | null = null;
    if (r.size_bytes !== null) {
      const [probe] = await sql<{ any_row: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM ${sql(r.table)}) AS any_row`;
      hasRows = probe?.any_row ?? null;
    }
    out.push({
      table: r.table,
      hasRows,
      sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
      plannerRowEstimate: r.planner_rows === null ? null : Number(r.planner_rows),
      lastAnalyze: r.last_analyze,
      lastAutoanalyze: r.last_autoanalyze,
      statisticRows: Number(r.statistic_rows),
    });
  }
  return out;
}

export type SmokeProbe = {
  /** The Gate-S1 class this probe stands for. */
  name: string;
  query: string;
  ms: number;
  /** Rows the retrieval path returned. Zero is not automatically a failure. */
  results: number;
  degraded: string[];
  /**
   * `answerStructured`'s verdict, or `hybrid` for the ranker path. A probe that
   * PARSED and refused is a working search; a probe that threw is not.
   */
  outcome: string;
  error: string | null;
};

export type SmokeVerdict = {
  ready: boolean;
  /** Probes that threw. Any is disqualifying. */
  failed: string[];
  /**
   * Probes where EVERY class returned nothing at all. A restored generation
   * that answers every Gate-S1 class with zero rows is not serving, whatever the
   * checksums say.
   */
  allEmpty: boolean;
  slowestMs: number;
};

/**
 * ── WHAT THE SMOKE REFUSES ON, AND WHAT IT DELIBERATELY DOES NOT ────────────
 *
 * It refuses on a THROWN probe and on a generation where nothing answered at all.
 * It does NOT refuse on latency, and that is deliberate: V7.2's Gate S1 is a
 * 3-second p95 over the fixed suite in STAGING, and turning a restore rehearsal
 * on a developer laptop into a latency gate would invent a threshold nobody
 * agreed. The slowest probe is REPORTED so an operator can see a generation that
 * came back slow; the decision it feeds is a human's.
 *
 * A refusal (`sparse_unbounded`) is a PASS. It is the search path working
 * correctly on a query it declines to rank, and treating it as a failure would
 * make the honest answer the one that blocks a release.
 */
export function smokeVerdict(probes: readonly SmokeProbe[]): SmokeVerdict {
  const failed = probes.filter((p) => p.error !== null).map((p) => p.name);
  return {
    ready: probes.length > 0 && failed.length === 0 && !probes.every((p) => p.results === 0),
    failed,
    allEmpty: probes.length > 0 && probes.every((p) => p.results === 0),
    slowestMs: probes.reduce((m, p) => Math.max(m, p.ms), 0),
  };
}

/**
 * The Gate-S1 classes, executed against ONE corpus generation.
 *
 * Identifiers are drawn from the generation being tested, never hard-coded: a
 * constant CNR stops existing the day the corpus is rebuilt, and a probe that
 * resolves to nothing looks exactly like a probe that is fast.
 */
export async function runSearchSmoke(sql: Sql): Promise<SmokeProbe[]> {
  const probes: SmokeProbe[] = [];

  const [citation] = await sql<{ neutral_citation: string }[]>`
    SELECT neutral_citation FROM judgments
     WHERE neutral_citation IS NOT NULL
     GROUP BY 1 HAVING count(*) = 1 LIMIT 1`;
  const [cnr] = await sql<{ cnr: string }[]>`
    SELECT cnr FROM judgments WHERE cnr IS NOT NULL LIMIT 1`;
  const [scope] = await sql<{ court: string }[]>`
    SELECT court FROM judgments GROUP BY court ORDER BY count(*) DESC LIMIT 1`;

  const structured: { name: string; query: string }[] = [];
  if (citation)
    structured.push({ name: 'exact citation', query: `cite:"${citation.neutral_citation}"` });
  if (cnr) structured.push({ name: 'CNR', query: cnr.cnr });
  if (scope)
    structured.push({ name: 'filtered lexical', query: `court:"${scope.court}" AND bail` });

  for (const s of structured) {
    const started = performance.now();
    try {
      const out = await answerStructured(sql, s.query, 5);
      probes.push({
        name: s.name,
        query: s.query,
        ms: Math.round(performance.now() - started),
        results: out.kind === 'matched' ? out.hits.length : 0,
        degraded:
          out.kind === 'unbounded'
            ? ['sparse_unbounded']
            : out.kind === 'timed_out'
              ? ['sparse_timeout']
              : [],
        outcome: out.kind,
        error: null,
      });
    } catch (err) {
      probes.push({
        name: s.name,
        query: s.query,
        ms: Math.round(performance.now() - started),
        results: 0,
        degraded: [],
        outcome: 'threw',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * The ranker itself, lexical-only.
   *
   * `queryVector: null` is not a handicap — it is what production does when the
   * embedder is cold, over budget or past its failure limit, and a restored
   * generation must serve that case. A smoke that required an embedder would
   * refuse to run at all on a machine that has none, which is every restore
   * rehearsal.
   */
  const research = 'anticipatory bail in a dowry harassment case';
  const startedHybrid = performance.now();
  try {
    const degraded: DegradedArm[] = [];
    const hits = await hybridSearch(sql, research, null, {}, 5, 'sparse', (a) => degraded.push(a));
    probes.push({
      name: 'normal research query',
      query: research,
      ms: Math.round(performance.now() - startedHybrid),
      results: hits.length,
      degraded,
      outcome: 'hybrid',
      error: null,
    });
  } catch (err) {
    probes.push({
      name: 'normal research query',
      query: research,
      ms: Math.round(performance.now() - startedHybrid),
      results: 0,
      degraded: [],
      outcome: 'threw',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return probes;
}

export type ActivationInput = {
  /** The restore's own verdict. Integrity is still a prerequisite, not a rival. */
  restoreVerified: boolean;
  statistics: StatisticsVerdict;
  smoke: SmokeVerdict;
};

export type ActivationDecision = {
  verdict: 'ACTIVATE' | 'REFUSE';
  activate: boolean;
  /** Every reason, not the first — an operator fixing one at a time is a bad day. */
  reasons: string[];
};

/**
 * The gate. All three must pass, and none of them substitutes for another.
 *
 * The ORDER of the reasons is the order an operator fixes them in: a generation
 * whose rows are wrong is not made servable by analysing it.
 */
export function activationDecision(input: ActivationInput): ActivationDecision {
  const reasons: string[] = [];
  if (!input.restoreVerified) {
    reasons.push('the restore did not verify — row counts or checksums do not match the manifest');
  }
  if (input.statistics.absent.length > 0) {
    reasons.push(
      `search-critical table(s) absent from this generation: ${input.statistics.absent.join(', ')}`,
    );
  }
  if (input.statistics.unanalyzed.length > 0) {
    reasons.push(
      `no optimizer statistics for populated table(s): ${input.statistics.unanalyzed.join(', ')} — ` +
        'the planner would cost them as empty',
    );
  }
  if (input.smoke.failed.length > 0) {
    reasons.push(`search smoke threw on: ${input.smoke.failed.join(', ')}`);
  } else if (input.smoke.allEmpty) {
    reasons.push('search smoke answered every Gate-S1 class with zero results');
  } else if (!input.smoke.ready) {
    reasons.push('search smoke did not run');
  }
  return {
    verdict: reasons.length === 0 ? 'ACTIVATE' : 'REFUSE',
    activate: reasons.length === 0,
    reasons,
  };
}
