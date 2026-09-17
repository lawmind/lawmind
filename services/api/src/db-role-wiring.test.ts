/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATIC HALF OF THE GUARD — §12
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `db-role-guard.test.ts` proves the runtime check works. The split matrix
 * proves the routes it drives. Neither can see the module nobody drove: a file
 * added next month with one `FROM matters` in it, reached by a route nobody
 * added to the matrix, passes both and fails on the production cutover.
 *
 * So this reads the SOURCE. `lcc-db-role-audit.mjs` derives the roles each
 * module needs from the SQL it actually contains, and this asserts three things
 * about that derivation:
 *
 *   1. Every table named in any module is classified in `ops/db-roles.ts`. An
 *      unclassified table defaults to `user`, which is the SAFE default and not
 *      a decision — the decision is cheaper here than during a restore.
 *   2. No single statement names tables from both roles. PostgreSQL has no
 *      cross-database join; such a statement is not slow after the split, it is
 *      impossible. §H requires this at zero.
 *   3. The modules that need BOTH roles are exactly the ones this file lists.
 *      That last one is a ratchet rather than a rule: a module joining the list
 *      is fine and a module joining it SILENTLY is not, because a handler that
 *      needs two handles and is passed one is the defect this round existed to
 *      remove.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auditModules } from '../../../scripts/lcc-db-role-audit.mjs';
import { crossRoleStatements } from '../../../scripts/lcc-cross-role-sql.mjs';

/**
 * Names that appear where a table name would and are not tables: statement-local
 * CTEs and aliases, plus PostgreSQL's own catalogues. Listed rather than
 * pattern-matched so that adding one is a decision somebody made.
 */
const NOT_TABLES = new Set([
  // system catalogues and views
  'pg_attribute', 'pg_class', 'pg_database', 'pg_enum', 'pg_extension', 'pg_indexes',
  'pg_locks', 'pg_namespace', 'pg_stat_activity', 'pg_stat_database', 'pg_stat_user_tables',
  'pg_statistic', 'pg_stats',
  'pg_trigger', 'pg_type', 'information_schema', 'current_date', 'unnest', 'lateral',
  'drizzle', 'autovacuum',
  // CTEs and aliases the syntactic pass cannot tell from a table
  'a', 'an', 'as', 'candidates', 'chunk_candidates', 'discriminating', 'e', 'edges',
  'eligible', 'empty', 'hits', 'held', 'lex', 'linked', 'one', 'ordinary', 'page', 'q',
  'ranked', 'scored', 'set', 'skip', 'stays', 'support', 't', 'the', 'their',
  'to', 'tranche_candidates', 'w', 'was', 'application', 'ops_job_current',
]);

/**
 * The modules that legitimately need BOTH handles.
 *
 * Every one of them is a place where an advocate's own row has to be shown
 * beside a fact about published law, which is what `SOFT_CORPUS_REFERENCE`
 * means in practice. The list is asserted so that a fourteenth cannot appear
 * without somebody deciding how it gets its second handle.
 */
const CROSS_ROLE_MODULES = new Set([
  'services/api/src/admin/citations.ts',
  'services/api/src/admin/disputes.ts',
  'services/api/src/admin/metrics.ts',
  'services/api/src/alerts/route.ts',
  'services/api/src/briefings/route.ts',
  'services/api/src/citations/check.ts',
  'services/api/src/citations/copies.ts',
  'services/api/src/citations/fanout.ts',
  'services/api/src/citations/recheck.ts',
  'services/api/src/citations/verify.ts',
  'services/api/src/court/guard.ts',
  'services/api/src/court/sync.ts',
  'services/api/src/documents/route.ts',
  'services/api/src/judgments/annotations.ts',
  'services/api/src/judgments/route.ts',
  'services/api/src/matters/authorities.ts',
  'services/api/src/premium/preview.ts',
]);

describe('database role wiring, read from the source', () => {
  const rows = auditModules();

  it('reads a meaningful number of modules — a broken audit must not pass vacuously', () => {
    assert.ok(
      rows.length > 60,
      `the audit found only ${rows.length} modules that touch the database; it has stopped working`,
    );
  });

  it('every table any module names is classified in ops/db-roles.ts', () => {
    const unknown = new Map<string, string[]>();
    for (const r of rows) {
      for (const t of r.unknown) {
        if (NOT_TABLES.has(t)) continue;
        unknown.set(t, [...(unknown.get(t) ?? []), r.module]);
      }
    }
    assert.deepEqual(
      [...unknown.keys()].sort(),
      [],
      'these names are queried but classified in neither CORPUS_TABLES nor USER_TABLES. ' +
        'Add each to ops/db-roles.ts, or to NOT_TABLES here if it is a CTE or a catalogue: ' +
        [...unknown.entries()].map(([t, m]) => `${t} (${m.join(', ')})`).join('; '),
    );
  });

  it('no single statement names tables from both roles — CURRENT_V1_CROSS_ROLE_SQL_JOINS = 0', () => {
    const joins = crossRoleStatements();
    assert.deepEqual(
      joins.map((j) => `${j.module}:${j.line}`),
      [],
      'PostgreSQL has no cross-database join. Split these into two statements and ' +
        'merge in the application, as judgments/hydrate.ts does: ' +
        joins.map((j) => `${j.module}:${j.line} (${j.user} x ${j.corpus})`).join('; '),
    );
  });

  it('the modules needing BOTH roles are exactly the ones recorded here', () => {
    const both = rows.filter((r) => r.roles.length === 2).map((r) => r.module);
    const added = both.filter((m) => !CROSS_ROLE_MODULES.has(m));
    assert.deepEqual(
      added,
      [],
      'these modules now query both roles and nothing has decided how they get a second ' +
        'handle. Give each an explicit corpus handle (the repository pattern is a trailing ' +
        '`corpusSql: Sql = sql`), wire it in app.ts, and add it to CROSS_ROLE_MODULES: ' +
        added.join(', '),
    );
    const gone = [...CROSS_ROLE_MODULES].filter((m) => !both.includes(m));
    assert.deepEqual(gone, [], `these are listed as cross-role but no longer are: ${gone.join(', ')}`);
  });
});
