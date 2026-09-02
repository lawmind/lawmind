/**
 * Types for `lcc-cross-role-sql.mjs`.
 *
 * See `lcc-db-role-audit.d.mts` for why these scripts are `.mjs` and these
 * declarations are hand-written.
 */

/** A single statement naming tables from both database roles. */
export type CrossRoleStatement = {
  /** Repository-relative, forward slashes. */
  module: string;
  /** 1-indexed line where the statement's template span begins. */
  line: number;
  corpus: string[];
  user: string[];
  /** The statement, whitespace-collapsed and truncated for a message. */
  sql: string;
};

export function crossRoleStatements(options?: { includeTests?: boolean }): CrossRoleStatement[];
