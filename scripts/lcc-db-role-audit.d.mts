/**
 * Types for `lcc-db-role-audit.mjs`.
 *
 * The audit is plain `.mjs` for the same reason `resource-gate.mjs` is: it is a
 * command an operator runs, and a build step in front of "which role does this
 * module need" is a step that gets skipped. This file gives the one TypeScript
 * caller — `services/api/src/db-role-wiring.test.ts`, which turns the audit into
 * a CI guard — real types without compiling the script.
 *
 * Hand-written, so it can drift. What stops it is that the guard imports
 * `auditModules` and reads every field below, so a shape change breaks the
 * typecheck rather than passing silently.
 */

/** One module that talks to the database, and the roles its SQL requires. */
export type ModuleRoles = {
  /** Repository-relative, forward slashes. */
  module: string;
  /** `['corpus']`, `['user']`, or both — in that order. */
  roles: ('corpus' | 'user')[];
  /** Corpus-owned tables this module names. */
  corpus: string[];
  /** User-owned tables this module names. */
  user: string[];
  /**
   * Names that appeared where a table would and are in neither list: CTEs,
   * aliases and system catalogues. Not an error — the guard asserts this is
   * empty after a documented allowlist, which is how a genuinely unclassified
   * table becomes a test failure instead of a silent default.
   */
  unknown: string[];
};

export function auditModules(): ModuleRoles[];
