#!/usr/bin/env node
/**
 * Assert that every table `docs/SCHEMA_TRUTH.md` describes actually exists in a
 * migration.
 *
 *   node scripts/check-schema-truth.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — three tables, three separate discoveries, all the same bug
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SCHEMA_TRUTH.md` calls itself *"the only authority on data shapes"*, and the
 * codebase treats it that way: endpoints are written from it, `schema.ts` is
 * transcribed from it, and other docs cite it as settled. **Nothing checked
 * that the tables it describes had ever been created.**
 *
 * On 8 Aug 2026 three were found not to exist, one at a time, each by a test
 * hitting real Postgres:
 *
 *   - `citation_disputes` — documented, referenced throughout `ADMIN_SURFACE.md`,
 *     and `citation_fanouts.trigger` had carried the enum value `dispute_upheld`
 *     since migration 0016. The design anticipated the table for weeks. It was
 *     never created.
 *   - `ocr_jobs` — same.
 *   - `data_requests` — same, found a commit later.
 *
 * All three typechecked cleanly and would have thrown `relation does not exist`
 * on the first real request. TypeScript cannot catch this: a SQL string is a
 * string. Only running a query against a real database catches it, and only if
 * a test happens to run that query.
 *
 * A sweep afterwards found two more (`draft_templates`, `pii_entities`), which
 * are deliberately still uncreated because nothing writes to them yet — see
 * ALLOWED_ABSENT below. **The point is that the sweep should not have been a
 * one-off act of diligence.** It is mechanical, so it is a gate.
 */
import { readdirSync, readFileSync } from 'node:fs';

const TRUTH = 'docs/SCHEMA_TRUTH.md';
const MIGRATIONS = 'packages/db/drizzle';

/**
 * Tables documented but deliberately NOT created yet, each with the reason.
 *
 * `packages/db/src/schema.ts` states the rule this encodes: *"a deferred table
 * created 'while you're in there' is exactly what that decision forbids."* A
 * table arrives with the work that uses it, not before — creating one early
 * means guessing at columns nobody has needed yet.
 */
const ALLOWED_ABSENT = new Map([
  [
    'draft_templates',
    'no template content exists to manage; arrives with admin/templates + POST /documents',
  ],
  [
    'pii_entities',
    'the pseudonymisation pipeline is unbuilt; arrives with it, gated on the DPA (OD-6)',
  ],
]);

const truth = readFileSync(TRUTH, 'utf8');

/**
 * Every `## table_name` heading. Struck-through headings are cut tables —
 * `## ~~overruled_rechecks~~ — cut 1 Aug 2026, no table` — and must not be
 * required to exist; that is the doc doing its job, not a gap.
 */
const documented = new Set();
for (const line of truth.split('\n')) {
  const m = /^## ([a-z_]+)\s*$/.exec(line);
  if (m?.[1]) documented.add(m[1]);
  // The auth_* tables share one heading.
  const combined = /^## (auth_user\b.*)$/.exec(line);
  if (combined?.[1]) {
    for (const name of combined[1].match(/auth_\w+/g) ?? []) documented.add(name);
  }
}

const created = new Set();
for (const file of readdirSync(MIGRATIONS)) {
  if (!file.endsWith('.sql')) continue;
  const sql = readFileSync(`${MIGRATIONS}/${file}`, 'utf8');
  for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?/gi)) {
    if (m[1]) created.add(m[1]);
  }
}

const missing = [...documented].filter((t) => !created.has(t) && !ALLOWED_ABSENT.has(t)).sort();
/** Documented, absent, and expected to be — but assert they are still absent. */
const unexpectedlyPresent = [...ALLOWED_ABSENT.keys()].filter((t) => created.has(t));

if (missing.length > 0) {
  console.error(`${TRUTH} describes tables that no migration creates:\n`);
  for (const t of missing) console.error(`  ${t}`);
  console.error(
    '\nThis has happened three times — citation_disputes, ocr_jobs and data_requests\n' +
      'were each documented, built against, and missing, and each was found only when a\n' +
      'test hit real Postgres. TypeScript cannot catch it: a SQL string is a string.\n\n' +
      'Either add the migration, or — if the table is deliberately deferred until the\n' +
      'work that uses it — add it to ALLOWED_ABSENT in this script with the reason.',
  );
  process.exit(1);
}

if (unexpectedlyPresent.length > 0) {
  // Not a failure — the opposite of the bug. But the note is now stale and a
  // stale allow-list is how the next gap hides.
  console.error(
    `these are in ALLOWED_ABSENT but now exist: ${unexpectedlyPresent.join(', ')}.\n` +
      'Remove them from the list so it keeps meaning what it says.',
  );
  process.exit(1);
}

console.log(
  `schema truth ok · ${documented.size} tables documented, ` +
    `${documented.size - ALLOWED_ABSENT.size} created, ` +
    `${ALLOWED_ABSENT.size} deferred with a stated reason`,
);
