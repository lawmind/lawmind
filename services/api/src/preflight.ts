/**
 * Startup preflight — the citation-safety firewall must never boot degraded.
 *
 * REB §1: a citation-safety-critical module, index, table or dependency going
 * missing must hard-fail the boot, not serve degraded. Everything else in this
 * codebase is deliberately fail-OPEN on purpose (the embedder warms in the
 * background and search falls back to lexical-only if it never loads —
 * `index.ts`'s own comment explains why that specific gap is safe to survive).
 * Citation correctness is the one thing that must NOT survive silently broken:
 * an advocate cannot tell a `cite:` search that quietly stopped matching from
 * one that correctly found nothing.
 *
 * The checks here are schema- and expression-level, not data-dependent — they
 * must pass against an empty corpus, so they run every boot, not just once
 * against a seeded fixture.
 */
import type { Sql } from 'postgres';

import { citationLookupKey } from './search/query-shape.ts';
import { parse } from './search/qlang/parse.ts';

export type PreflightFailure = { readonly check: string; readonly detail: string };

const REQUIRED_TABLES = ['judgments', 'citation_checks'] as const;

/**
 * Real stored columns only. `verificationState`/`verifiedBySource` in the
 * `GET /judgments/:id` response (`judgments/route.ts`) are NOT columns — a
 * corpus judgment is `verified`/`corpus` by construction, hardcoded as a
 * literal there. Those two live on `citation_checks` instead, which is why
 * that table is checked separately below. Confirmed against the live
 * production schema before shipping this — the first draft guessed wrong and
 * would have hard-failed every boot.
 */
const REQUIRED_JUDGMENTS_COLUMNS = [
  'id',
  'case_title',
  'full_text',
  'neutral_citation',
  'reporter_citations',
  'overruled_status',
] as const;

/**
 * Deliberately messy — parentheses, periods, mixed case — so the check
 * exercises the normalisation, not just an already-clean string.
 */
const CITATION_KEY_PROBE = '(2019) 4 S.C.C. 221';

export async function runPreflight(sql: Sql): Promise<PreflightFailure[]> {
  const failures: PreflightFailure[] = [];

  /**
   * The qlang module itself: a canonical `cite:` query must parse to a single
   * citation term. A parser regression that throws, or silently returns the
   * wrong node shape, would make `isBareCitationTerm` (the ambiguity gate,
   * `search/structured.ts`) misclassify every citation query on boot.
   */
  try {
    const ast = parse('cite:"(1994) 3 SCC 1"');
    if (ast.kind !== 'term' || ast.field !== 'cite') {
      failures.push({
        check: 'module:qlang-parse',
        detail: `parse() of a canonical cite: query returned an unexpected node kind "${ast.kind}"`,
      });
    }
  } catch (error) {
    failures.push({
      check: 'module:qlang-parse',
      detail: `parse() threw on a canonical cite: query: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const tableRows = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY(${REQUIRED_TABLES})`;
  const foundTables = new Set(tableRows.map((r) => r.table_name));
  for (const table of REQUIRED_TABLES) {
    if (!foundTables.has(table)) {
      failures.push({ check: `table:${table}`, detail: `required table "${table}" is missing` });
    }
  }

  // The rest depend on `judgments` existing — skip rather than cascade noise.
  if (!foundTables.has('judgments')) return failures;

  const columnRows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'judgments'`;
  const foundColumns = new Set(columnRows.map((r) => r.column_name));
  for (const column of REQUIRED_JUDGMENTS_COLUMNS) {
    if (!foundColumns.has(column)) {
      failures.push({
        check: `column:judgments.${column}`,
        detail: `required column "${column}" is missing from judgments`,
      });
    }
  }

  const [indexRow] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'judgments'
       AND indexname = 'judgments_neutral_citation_key'`;
  if (!indexRow || indexRow.n === 0) {
    failures.push({
      check: 'index:judgments_neutral_citation_key',
      detail:
        'the citation-lookup index is missing (packages/db/drizzle/0026_structured_search.sql) — ' +
        'cite: queries would run a full table scan, and on this corpus size that changes correctness ' +
        'under load, not just latency',
    });
  }

  /**
   * The load-bearing check: `citationLookupKey()` (JS, used to build the
   * lookup value) and the SQL expression the index above is built on
   * (`0026_structured_search.sql`) implement the same normalisation rule
   * twice, in two languages, by design — `query-shape.ts`'s own comment
   * calls a second implementation "exactly the drift CLAUDE.md forbids".
   * If they ever disagree, a `cite:` query silently stops matching rows it
   * should match. Nothing else in this file would catch that — the table,
   * columns and index can all be present while the two expressions drift.
   */
  const jsKey = citationLookupKey(CITATION_KEY_PROBE);
  const [sqlKeyRow] = await sql<{ key: string }[]>`
    SELECT upper(regexp_replace(${CITATION_KEY_PROBE}, '[^A-Za-z0-9]', '', 'g')) AS key`;
  if (sqlKeyRow?.key !== jsKey) {
    failures.push({
      check: 'citation-key-parity',
      detail:
        `citationLookupKey() and the SQL normalisation expression disagree on "${CITATION_KEY_PROBE}": ` +
        `JS produced "${jsKey}", SQL produced "${sqlKeyRow?.key}" — a cite: query would silently miss ` +
        'rows it should match',
    });
  }

  return failures;
}

/** Throws with every failure listed, never just the first — ops needs the whole picture at once. */
export async function assertPreflight(sql: Sql): Promise<void> {
  const failures = await runPreflight(sql);
  if (failures.length === 0) return;
  const message = failures.map((f) => `  - ${f.check}: ${f.detail}`).join('\n');
  throw new Error(
    `Startup preflight failed — refusing to boot with a citation-safety-critical gap:\n${message}`,
  );
}
