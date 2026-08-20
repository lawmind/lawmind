/**
 * The two keyset pages `script-quality-cli.ts` walks, extracted so they can be
 * tested against a real Postgres rather than only exercised in production.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The failure these queries exist to prevent is silent and exits with status 0:
 * `judgments.id` is a random uuid, so a pass that resumes from an id watermark
 * cannot see rows ingested after it started — 740,993 of 740,993 rows created
 * after the 19 August pass began sort BELOW its final watermark. The pass then
 * screens nothing, for ever, and reports success.
 *
 * A defect whose symptom is "no error" cannot be caught by running the tool and
 * looking at the output. It has to be asserted, on a table whose ids are
 * deliberately in the wrong order, against the same SQL the CLI runs. That is
 * only possible if the SQL is reachable from a test, hence this file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `table` IS AN IDENTIFIER, NOT A VALUE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The test drives these against a temporary table, so the relation name has to
 * be substitutable. It is interpolated through postgres.js's `sql()` identifier
 * helper, which quotes it — a value placeholder cannot be used for a relation
 * name, and string concatenation here would be an injection site. Callers in
 * this repo pass a constant; the default is the production table so a caller
 * that forgets cannot silently read something else.
 */
import type { Sql } from 'postgres';

/** One row as the screen needs it. `created_at` is selected only under `pageSince`. */
export type ScreenRow = {
  id: string;
  court: string | null;
  source_url: string | null;
  full_text: string | null;
  created_at?: string | Date | null;
};

export type PageArgs = {
  sql: Sql;
  /** Court partition codes as they appear in `source_url` (`/court=22_18/`). Empty means all. */
  courts: readonly string[];
  limit: number;
  table?: string;
};

/**
 * The whole-corpus pass: keyset on the primary key.
 *
 * Correct for a pass that intends to walk the table ONCE and stop, which is what
 * the full pass is. It is not correct for anything incremental, and `pageSince`
 * below is the reason why.
 */
export function pageAll(args: PageArgs & { cursor: string }): Promise<ScreenRow[]> {
  const { sql, cursor, courts, limit, table = 'judgments' } = args;
  return sql<ScreenRow[]>`
    SELECT id, court, source_url, full_text
      FROM ${sql(table)}
     WHERE id > ${cursor}::uuid
       ${courts.length ? sql`AND source_url LIKE ANY(${courts.map((c) => `%/court=${c}/%`)}::text[])` : sql``}
     ORDER BY id
     LIMIT ${limit}`;
}

/**
 * The incremental pass: composite keyset on `(created_at, id)`.
 *
 * `ROW(a, b) > ROW(c, d)` is the one form that is both TOTAL and drivable off
 * `judgments_created_at_idx`. Writing the comparison out by hand as
 * `created_at > $1 OR (created_at = $1 AND id > $2)` is the usual attempt and it
 * is a trap in both directions: get the parenthesisation wrong one way and rows
 * sharing a timestamp with the cursor are skipped, get it wrong the other and
 * they are re-read for ever. Row comparison has neither failure mode, and the
 * duplicate-timestamp case is the one this corpus produces constantly — a bulk
 * ingest batch commits with a single `now()`.
 *
 * `since` is a floor on `created_at`; the cursor is where this pass got to
 * inside that floor. They are different things and both are needed: the floor
 * bounds the work, the cursor makes it restartable.
 */
export function pageSince(
  args: PageArgs & { since: string; cursorAt: string; cursor: string },
): Promise<ScreenRow[]> {
  const { sql, since, cursorAt, cursor, courts, limit, table = 'judgments' } = args;
  return sql<ScreenRow[]>`
    SELECT id, court, source_url, full_text, created_at
      FROM ${sql(table)}
     WHERE created_at >= ${since}::timestamptz
       AND (created_at, id) > (${cursorAt}::timestamptz, ${cursor}::uuid)
       ${courts.length ? sql`AND source_url LIKE ANY(${courts.map((c) => `%/court=${c}/%`)}::text[])` : sql``}
     ORDER BY created_at, id
     LIMIT ${limit}`;
}
