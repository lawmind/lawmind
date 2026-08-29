/**
 * A `platform_config` - and, where a suite needs it, an `ecourts_fetch_ledger` -
 * that the tests own, in a schema production cannot see.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Five suites need a kill switch in a particular state to test anything at all:
 * the eCourts guard needs it OFF to prove nothing reaches a host, the quota
 * reservation race needs it ON and COMMITTED so eight independent connections
 * can see each other's rows, and the admin surface needs to toggle `signups`
 * through the real endpoint. Every one of them borrowed the production row and
 * promised to give it back.
 *
 * The promise is not keepable. `after()` does not run when a process is killed,
 * a `finally` does not run when the machine is powered off, and a suite that
 * times out mid-body leaves whatever it last wrote. That is not hypothetical
 * here: an interrupted run left `ecourts_harvest` ENABLED on this database on
 * 29 Aug 2026, and `signups` carries an audit row whose reason is literally
 * "test cleanup". A switch that authorises contacting a court's systems under a
 * registrar's written grant must not be reachable by a test at all.
 *
 * So the tests stop borrowing. This creates a throwaway schema containing one
 * table — `platform_config`, same columns and same CHECK constraints — and
 * hands back clients whose `search_path` resolves the unqualified name there.
 * Every consumer of the switch (`guard.killSwitchEnabled`, `admin/platform.ts`,
 * the kill-switch CLI) writes `platform_config` unqualified, so all of them
 * follow the search path without knowing this exists.
 *
 * The production row is then not "restored correctly" — it is **unreachable**.
 * That distinction is the whole point: correctness under normal completion was
 * never the failing case.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT SURVIVES A KILL, AND HOW IT IS SWEPT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A killed run leaves the schema behind. That is harmless — nothing reads it —
 * and it is swept on the next run by `dropStaleSchemas`, which drops any
 * `lawmind_test_cfg_%` schema older than an hour. Deleting only OLD ones matters
 * because suites run concurrently often enough that a blanket sweep would delete
 * a live sibling's fixture out from under it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BASELINE IS DECLARED, NOT COPIED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The six rows are seeded from `DEFAULT_KILL_SWITCHES` below rather than
 * `SELECT`ed out of `public.platform_config`. Copying would make a suite's
 * starting state depend on whatever an operator last did to the live database —
 * and since the founder enabled `ecourts_harvest` on 29 Aug 2026, copying would
 * flip the guard suite's premise from OFF to ON without a line of the test
 * changing. A fixture whose meaning moves with production is not a fixture.
 */
import postgres, { type Options, type Sql } from 'postgres';

/** Every schema this module creates. The sweep matches on it. */
export const TEST_CONFIG_SCHEMA_PREFIX = 'lawmind_test_cfg_';

/**
 * Tables a suite may ask to isolate ALONGSIDE `platform_config`.
 *
 * `ecourts_fetch_ledger` is here for one suite and one reason. The quota-race
 * test needs reservations that genuinely COUNT - `test://` rows are excluded
 * from the interval, hourly and daily arithmetic by design, so pointing the race
 * at one makes all eight callers succeed and the test measures nothing. The rows
 * therefore have to be real quota rows, and real quota rows written into the
 * production ledger are two problems at once: an abandoned run spends slots
 * from the registrar's 1,000/day, and the ledger that answers "did we stay
 * inside the grant" fills up with traffic that never left this machine.
 *
 * Copied with `LIKE`, so the fixture's copy carries the columns, defaults and
 * CHECKs and carries NO foreign keys. That is why a suite writing
 * `official_source_artifact` or `ecourts_observation` (both of which reference
 * the ledger) must NOT isolate the ledger: their rows would point at a public
 * ledger id that no longer exists. Those suites run inside a rolled-back
 * transaction instead, which is the stronger guarantee where it is available.
 */
export const ISOLATABLE_TABLES = ['ecourts_fetch_ledger'] as const;
export type IsolatableTable = (typeof ISOLATABLE_TABLES)[number];

/**
 * The state migration 0013 creates: all six switches OFF, each carrying the
 * reason the CHECK constraint requires. This is the *default*, which is a
 * different fact from *what production currently is*, and the tests want the
 * default.
 */
export const DEFAULT_KILL_SWITCHES: readonly string[] = [
  'search',
  'drafting',
  'briefings',
  'ocr_intake',
  'signups',
  'ecourts_harvest',
];

const SEED_REASON = 'isolated test fixture — created OFF, the migration default';

export type IsolatedSchema = {
  /** The schema name. Useful in an assertion message; nothing should qualify with it. */
  schema: string;
  /**
   * A client bound to the fixture. `platform_config` resolves into the throwaway
   * schema; every other table still resolves to `public`, because the fixture
   * isolates configuration, not the corpus.
   */
  connect(options?: Options<Record<string, never>>): Sql;
  /** Drop the schema and close the client this fixture opened. */
  drop(): Promise<void>;
};

function schemaName(): string {
  return `${TEST_CONFIG_SCHEMA_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Drop fixtures abandoned by a killed run.
 *
 * Staleness is read from the schema NAME, which carries the creating run's
 * `Date.now()` in base 36. A catalogue timestamp would have been the obvious
 * source and is the wrong one — `pg_class` statistics columns are null until
 * autoanalyze happens to touch the table, so a fixture created a second ago and
 * one abandoned last week are indistinguishable by them. Older than an hour
 * only: a blanket sweep would drop a concurrently running sibling's schema out
 * from under it.
 */
async function dropStaleSchemas(admin: Sql): Promise<void> {
  const rows = await admin<{ nspname: string }[]>`
    SELECT nspname FROM pg_namespace WHERE nspname LIKE ${`${TEST_CONFIG_SCHEMA_PREFIX}%`}
  `;
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const row of rows) {
    const stamp = Number.parseInt(
      row.nspname.slice(TEST_CONFIG_SCHEMA_PREFIX.length).split('_')[0] ?? '',
      36,
    );
    // An unparseable name is left alone. It was not created by this module in a
    // shape we recognise, and dropping a schema on a guess is worse than
    // leaving an empty one behind.
    if (!Number.isFinite(stamp) || stamp >= cutoff) continue;
    // Identifier interpolation: the name came out of pg_namespace and matches
    // the prefix, so there is nothing to inject. `sql.unsafe` is the only way
    // postgres.js will accept an identifier at all.
    await admin.unsafe(`DROP SCHEMA IF EXISTS "${row.nspname}" CASCADE`);
  }
}

/**
 * Create an isolated `platform_config` (plus any `extraTables`) and return the
 * handles to use it.
 *
 * Call at module scope in a suite, `await` it, and build every client through
 * `connect()`. Call `drop()` once, in a file-level `after()` - a per-suite drop
 * closes the fixture out from under the next suite in the same file.
 */
export async function createIsolatedSchema(
  databaseUrl: string,
  extraTables: readonly IsolatableTable[] = [],
): Promise<IsolatedSchema> {
  const schema = schemaName();
  const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const opened: Sql[] = [];
  /** `drop()` is idempotent: a suite may call it, and so may a file-level hook. */
  let dropped = false;

  try {
    await dropStaleSchemas(admin);
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    // Same columns, same CHECKs, same primary key. The FK to `users` is
    // deliberately NOT copied — `LIKE` never copies one — which is correct
    // here: a fixture must not require a real actor row to exist.
    await admin.unsafe(
      `CREATE TABLE "${schema}".platform_config (LIKE public.platform_config INCLUDING ALL)`,
    );
    await admin.unsafe(
      `INSERT INTO "${schema}".platform_config (key, kind, enabled, reason, updated_at)
       SELECT k, 'kill_switch'::platform_config_kind, false, $1, now()
         FROM unnest($2::text[]) AS k`,
      [SEED_REASON, DEFAULT_KILL_SWITCHES as string[]],
    );
    for (const table of extraTables) {
      // Whitelisted by `ISOLATABLE_TABLES`, so the identifier is ours and not a
      // caller's string. Empty on purpose: an isolated ledger starts with no
      // history, which is the state a quota test wants to reason from.
      if (!(ISOLATABLE_TABLES as readonly string[]).includes(table)) {
        throw new Error(`${table} is not an isolatable table`);
      }
      await admin.unsafe(
        `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
      );
    }
  } catch (error) {
    await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await admin.end({ timeout: 5 });
    throw error;
  }

  return {
    schema,
    connect(options = {}) {
      const client = postgres(databaseUrl, {
        onnotice: () => {},
        ...options,
        // Set on the CONNECTION, not by a statement, so it applies to every
        // pooled backend this client opens — including ones created later,
        // which a one-off `SET search_path` would miss.
        connection: { ...(options.connection ?? {}), search_path: `${schema},public` },
      });
      opened.push(client);
      return client;
    },
    async drop() {
      if (dropped) return;
      dropped = true;
      await Promise.all(opened.map((client) => client.end({ timeout: 5 }).catch(() => {})));
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
      await admin.end({ timeout: 5 });
    },
  };
}
