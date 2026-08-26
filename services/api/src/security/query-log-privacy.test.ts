/**
 * WHAT AN ADVOCATE TYPED IS A FACT ABOUT THEIR CLIENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `provider-policy.ts` states the principle in its own header and then acts on
 * it: "A QUERY is not in that category and is treated as private. What an
 * advocate types is a fact about their case — 'anticipatory bail twin conditions
 * for a co-accused in a 2024 NDPS matter' describes a client's position."
 *
 * Measured 26 Aug 2026, the storage layer already honours that:
 *
 *     searches        query_text, user_id      DELETED on erasure
 *     llm_calls       no prompt column at all  user_id nulled on erasure
 *     search_events   query_chars (an int), subject_hash (32-char digest)
 *                     — 10 distinct hashes across 2,397 rows
 *
 * THE DESIGN IS RIGHT AND NOTHING ENFORCES IT. Every one of those is a
 * convention held in the head of whoever wrote the insert. A column added to
 * `search_events` next month, or a `prompt` column on `llm_calls` added to debug
 * a bad completion, leaks client facts into a telemetry table that nobody
 * thinks of as private — and no existing test says a word.
 *
 * These are structural invariants, checked against the LIVE schema and the LIVE
 * rows rather than against the code that writes them. A test that reads the
 * insert statement proves the insert; a test that reads the table proves the
 * table, including rows some other writer put there.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO LISTS, AND WHY THEY ARE DIFFERENT SHAPES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `MAY_HOLD_QUERY_TEXT` is an ALLOWLIST: a table that stores what the advocate
 * typed must be named there AND must be erased. Adding a table is a deliberate
 * act that fails this suite until someone extends erasure too.
 *
 * `TELEMETRY_TABLES` is a DENYLIST by shape: these hold operational counters and
 * may hold no free text at all. Not "no text that looks sensitive" — no free
 * text, because a rule about what looks sensitive is a rule someone will argue
 * with at 2am while shipping a fix.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

after(async () => {
  await sql.end({ timeout: 5 });
});

/** Tables permitted to store what an advocate typed. Each MUST be erased. */
const MAY_HOLD_QUERY_TEXT = new Set(['searches', 'saved_searches']);

/** Operational tables. Counters, classes, hashes and ids — never free text. */
const TELEMETRY_TABLES = ['search_events', 'llm_calls'];

/**
 * Columns on a telemetry table that are text-typed and legitimately so.
 *
 * Each is bounded and non-linguistic: an enum-like class, a uuid, a hex sha, a
 * fixed-length digest. Anything text-typed and NOT here fails, which is the
 * point — the failure IS the review, and it happens before the column ships
 * rather than after a leak.
 */
const TELEMETRY_TEXT_ALLOWED = new Map([
  ['search_events', new Set(['query_class', 'request_id', 'build_sha', 'subject_hash'])],
  ['llm_calls', new Set(['feature', 'model', 'data_class'])],
]);

/** Column names that carry payload content, whatever the table calls itself. */
const CONTENT_NAME =
  /(prompt|completion|response|message|content|body|input_text|output_text|query_text|raw)/i;

describe('query-log privacy — what an advocate typed', () => {
  it('every table holding query text is declared AND erased', async () => {
    /**
     * Finds the tables by SHAPE, not by name: any query-text-ish column on a
     * table that also carries a `user_id`. A new `query_log` table is caught by
     * this without anyone remembering to come back here.
     */
    const found = await sql<{ table_name: string }[]>`
      SELECT DISTINCT c.table_name
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.data_type IN ('text', 'character varying')
         AND c.column_name ~ 'query_text|search_text|prompt_text'
         AND EXISTS (
           SELECT 1
             FROM information_schema.columns u
            WHERE u.table_schema = 'public'
              AND u.table_name = c.table_name
              AND u.column_name = 'user_id')
       ORDER BY c.table_name`;

    const undeclared = found.map((r) => r.table_name).filter((t) => !MAY_HOLD_QUERY_TEXT.has(t));

    assert.deepEqual(
      undeclared,
      [],
      `these tables store what an advocate typed and are not declared in ` +
        `MAY_HOLD_QUERY_TEXT: ${undeclared.join(', ')}. Declare them AND extend ` +
        `erasure.ts, or a deletion request leaves the client facts behind in a ` +
        `table nobody thinks of as private`,
    );

    // The other half. Declaring a table is not enough; erasure must reach it.
    const erasure = readFileSync(new URL('../auth/erasure.ts', import.meta.url), 'utf8');
    for (const table of MAY_HOLD_QUERY_TEXT) {
      assert.ok(
        erasure.includes(`'${table}'`),
        `${table} may hold query text but erasure.ts never names it`,
      );
    }
  });

  it('telemetry tables carry no payload-content column', async () => {
    for (const table of TELEMETRY_TABLES) {
      const cols = await sql<{ column_name: string }[]>`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ${table}`;
      const offending = cols.map((c) => c.column_name).filter((n) => CONTENT_NAME.test(n));
      assert.deepEqual(
        offending,
        [],
        `${table} has content-bearing column(s) ${offending.join(', ')}. Operational ` +
          `tables are read by cost dashboards and ops queries that nobody audits ` +
          `for confidentiality`,
      );
    }
  });

  it('telemetry text columns are bounded and non-linguistic', async () => {
    for (const table of TELEMETRY_TABLES) {
      const allowed = TELEMETRY_TEXT_ALLOWED.get(table) ?? new Set<string>();
      const cols = await sql<{ column_name: string }[]>`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ${table}
           AND data_type IN ('text', 'character varying', 'character')
         ORDER BY ordinal_position`;
      const undeclared = cols.map((c) => c.column_name).filter((n) => !allowed.has(n));
      assert.deepEqual(
        undeclared,
        [],
        `${table} gained text column(s) ${undeclared.join(', ')} that nobody has ` +
          `reviewed for confidentiality. If the column is a bounded class, id or ` +
          `digest, add it to TELEMETRY_TEXT_ALLOWED and say so in review`,
      );
    }
  });

  it('and the LIVE rows contain no sentence — not merely the schema', async () => {
    /**
     * The schema checks above are satisfied by a column that is allowed and then
     * written with the wrong thing. `subject_hash` is a 32-char digest by
     * intention; nothing at the database level stops a caller putting a query in
     * it. So the rows are read too.
     *
     * "A sentence" is approximated as two or more spaces — deliberately crude,
     * and calibrated against the real table: a legal query is many words, a
     * class, model or id is none or one.
     */
    for (const table of TELEMETRY_TABLES) {
      const allowed = TELEMETRY_TEXT_ALLOWED.get(table) ?? new Set<string>();

      /**
       * Only genuinely text-typed columns. `llm_calls.data_class` is a Postgres
       * ENUM, and `replace()` has no overload for one — the first version of
       * this test died on 42883 rather than reporting anything. An enum cannot
       * carry a sentence in any case: the type is the bound.
       */
      const textCols = await sql<{ column_name: string }[]>`
        SELECT column_name
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ${table}
           AND data_type IN ('text', 'character varying', 'character')
           AND column_name = ANY(${[...allowed]})
         ORDER BY ordinal_position`;

      assert.ok(
        textCols.length > 0,
        `${table} exposed no text column to scan — if every allowed column became ` +
          `an enum that is fine, but this assertion exists so the scan cannot ` +
          `silently become a no-op over zero columns`,
      );

      for (const { column_name: col } of textCols) {
        // Identifiers come from TELEMETRY_TEXT_ALLOWED intersected with the live
        // catalogue, never from input, so interpolating them is safe here.
        const [row] = await sql.unsafe<{ n: string; sample: string | null }[]>(
          `SELECT count(*)::text AS n, min("${col}") AS sample
             FROM "${table}"
            WHERE "${col}" IS NOT NULL
              AND length("${col}") - length(replace("${col}", ' ', '')) >= 2`,
        );
        assert.equal(
          Number(row?.n ?? 0),
          0,
          `${table}.${col} holds ${row?.n} value(s) with 2+ spaces — that is prose, ` +
            `not a class or an id. Example: ${JSON.stringify(row?.sample)}`,
        );
      }
    }
  });
});
