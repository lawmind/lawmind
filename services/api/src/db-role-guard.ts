/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A HANDLE THAT KNOWS WHICH DATABASE IT IS, AND REFUSES THE OTHER ONE'S TABLES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Under a physical split, a wrong-role query fails on its own: the table is not
 * there. That is the strongest possible enforcement and it is also the one
 * nobody developing on this repository ever meets, because local development
 * runs `single` mode where both roles are one database and every wrong-role
 * query works perfectly.
 *
 * That asymmetry is exactly how thirteen current-v1 routes came to be wired to
 * the corpus handle without anyone noticing. This closes it: a role-tagged
 * handle checks the tables a statement names against `ops/db-roles.ts` and
 * throws before the statement is sent, on ONE database, in a test run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT THROWS. IT NEVER RETRIES AGAINST THE OTHER ROLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Round brief §2, and it is worth saying why rather than only that. A fallback
 * would make every wrong-role query WORK — in development, in staging, in the
 * test suite — and fail only in the one configuration nobody runs until the
 * production cutover. A guard that silently repairs the thing it is guarding
 * against is worse than no guard, because it also removes the symptom that
 * would have led someone to the cause.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CANNOT SEE, STATED RATHER THAN GLOSSED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The check is syntactic. It reads table names out of the statement text and
 * resolves them through the same map the release tooling uses. It does not
 * parse SQL, so a table named only inside a string literal is invisible to it,
 * and a CTE whose name collides with a real table is excluded by name rather
 * than by scope. Those are acceptable because this is the SECOND line: the
 * physical split is the first, and `lcc-r28-split-matrix.mjs` proves it against
 * two databases that genuinely lack each other's tables.
 */
import type { Sql } from 'postgres';

import { isClassified, roleOf, type DbRole } from './ops/db-roles.ts';

export class WrongRoleQueryError extends Error {
  constructor(
    readonly role: DbRole,
    readonly table: string,
    readonly statement: string,
  ) {
    super(
      `a ${roleOf(table).toUpperCase()} table ("${table}") was queried through the ` +
        `${role.toUpperCase()} database handle. ops/db-roles.ts owns this classification. ` +
        'Pass the other handle — there is deliberately no fallback, because a retry against ' +
        'the other database would hide this until the production cutover. Statement: ' +
        statement.replace(/\s+/g, ' ').trim().slice(0, 240),
    );
    this.name = 'WrongRoleQueryError';
  }
}

const TABLE_RE = /\b(?:from|join|into|update|delete\s+from)\s+(?:only\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
/** `WITH x AS (`, `, x AS (` — a name that is local to the statement. */
const CTE_RE = /(?:\bwith\s+|,\s*)([a-z_][a-z0-9_]*)\s+as\s*(?:materialized\s+|not\s+materialized\s+)?\(/gi;

/**
 * The first table in `statement` that belongs to the other role, or null.
 *
 * Exported for the sentinel test, which asserts the detector itself rather than
 * only its effect — a detector that returned null for everything would make
 * every assertion below pass.
 */
export function offendingTable(statement: string, role: DbRole): string | null {
  const local = new Set([...statement.matchAll(CTE_RE)].map((m) => m[1]!.toLowerCase()));
  for (const m of statement.matchAll(TABLE_RE)) {
    const table = m[1]!.toLowerCase();
    if (local.has(table)) continue;
    if (!isClassified(table)) continue;
    if (roleOf(table) !== role) return table;
  }
  return null;
}

/** Is this a tagged-template call rather than one of postgres.js's helpers? */
function isTemplateCall(args: unknown[]): args is [TemplateStringsArray, ...unknown[]] {
  const first = args[0] as { raw?: unknown } | undefined;
  return Array.isArray(first) && Array.isArray(first.raw);
}

/**
 * Wrap a connection so every statement it sends is checked against `role`.
 *
 * Transactions are wrapped too — `sql.begin(fn)` hands the callback another
 * handle, and an unwrapped one would make the guard silently stop at the first
 * `BEGIN`, which is where the writes are.
 */
export function roleGuarded(sql: Sql, role: DbRole): Sql {
  const wrap = (target: Sql): Sql =>
    new Proxy(target, {
      apply(fn, thisArg, args: unknown[]) {
        if (isTemplateCall(args)) {
          const statement = args[0].join(' ? ');
          const bad = offendingTable(statement, role);
          if (bad !== null) throw new WrongRoleQueryError(role, bad, statement);
        }
        return Reflect.apply(fn as never, thisArg, args);
      },
      get(target_, prop, receiver) {
        const value = Reflect.get(target_, prop, receiver) as unknown;
        if (typeof value !== 'function') return value;
        if (prop === 'begin' || prop === 'reserve') {
          return (...args: unknown[]) => {
            const patched = args.map((a) =>
              typeof a === 'function'
                ? (tx: Sql, ...rest: unknown[]) =>
                    (a as (tx: Sql, ...r: unknown[]) => unknown)(wrap(tx), ...rest)
                : a,
            );
            return (value as (...a: unknown[]) => unknown).apply(target_, patched);
          };
        }
        if (prop === 'unsafe') {
          return (statement: string, ...rest: unknown[]) => {
            const bad = typeof statement === 'string' ? offendingTable(statement, role) : null;
            if (bad !== null) throw new WrongRoleQueryError(role, bad, statement);
            return (value as (...a: unknown[]) => unknown).apply(target_, [statement, ...rest]);
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target_);
      },
    }) as Sql;
  return wrap(sql);
}
