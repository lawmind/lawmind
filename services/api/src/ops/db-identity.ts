/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ASKING THE SERVER WHO IT IS, BECAUSE A URL IS A CLAIM AND NOT AN ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `db-split.ts` compares host, port and database name. That is cheap, needs no
 * connection, and catches the mistakes people actually make. It cannot catch the
 * one that matters most in a managed environment: **two different hostnames
 * pointing at one server.** A proxy hostname, a CNAME, `localhost` beside
 * `127.0.0.1`, a private and a public endpoint for one Railway instance — every
 * one of those passes a syntactic check and shares a filesystem.
 *
 * A `TRUNCATE` does not care what a URL said. So before any destructive corpus
 * operation, and at startup in split mode, the two handles are asked directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE IDENTITY IS THE CLUSTER'S, NOT THE CONNECTION'S
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `system_identifier` from `pg_control_system()` is a 64-bit value generated at
 * `initdb` and stored in the control file. It identifies the CLUSTER — the data
 * directory — which is exactly the scope a shared filesystem has. Two databases
 * inside one cluster share it; two clusters do not, however similar their
 * configuration.
 *
 * Paired with `current_database()`, that answers the real question in one round
 * trip: *are these two handles writing to the same files?*
 *
 * Two databases in ONE cluster are still genuinely separate databases —
 * `TRUNCATE` in one cannot reach the other, and that is the property Gate C
 * needs — so a shared `system_identifier` with different database names is
 * reported and permitted. It is recorded because it is worth an operator
 * knowing: they share a disk, a WAL and a failure domain, which is a durability
 * question rather than an isolation one.
 */
import type { Sql } from 'postgres';

export type DatabaseIdentity = {
  /** Identifies the data directory. Same value = same files. */
  systemIdentifier: string;
  database: string;
  /** For the human reading the refusal, never for the comparison. */
  serverVersion: string;
};

export async function databaseIdentity(sql: Sql): Promise<DatabaseIdentity> {
  const [row] = await sql<
    { system_identifier: string; database: string; server_version: string }[]
  >`
    SELECT (pg_control_system()).system_identifier::text AS system_identifier,
           current_database()                            AS database,
           current_setting('server_version')             AS server_version`;
  return {
    systemIdentifier: row!.system_identifier,
    database: row!.database,
    serverVersion: row!.server_version,
  };
}

export type IdentityVerdict =
  /** Different databases. `TRUNCATE` in one cannot reach the other. */
  | {
      distinct: true;
      /** They are different databases inside ONE cluster: separate, but one disk. */
      sameCluster: boolean;
      corpus: DatabaseIdentity;
      user: DatabaseIdentity;
    }
  /** One database wearing two names. Every isolation guarantee below is false. */
  | { distinct: false; corpus: DatabaseIdentity; user: DatabaseIdentity };

/**
 * Are these two handles connected to two different databases?
 *
 * The comparison is `(system_identifier, database)`. Same pair = same database,
 * whatever the two URLs said.
 */
export async function verifyDistinctDatabases(
  corpusSql: Sql,
  userSql: Sql,
): Promise<IdentityVerdict> {
  const [corpus, user] = await Promise.all([
    databaseIdentity(corpusSql),
    databaseIdentity(userSql),
  ]);
  const sameCluster = corpus.systemIdentifier === user.systemIdentifier;
  if (sameCluster && corpus.database === user.database) {
    return { distinct: false, corpus, user };
  }
  return { distinct: true, sameCluster, corpus, user };
}

/** The message a refusal prints. Extracted so the test can assert on it. */
export function sameDatabaseRefusal(v: Extract<IdentityVerdict, { distinct: false }>): string {
  return (
    'CORPUS_DATABASE_URL and USER_DATABASE_URL are connected to the SAME database ' +
    `(cluster ${v.corpus.systemIdentifier}, database "${v.corpus.database}"), though they were ` +
    'configured as a split. The two URLs may differ only by hostname, proxy or port. ' +
    'Refusing: a corpus release or rollback here would TRUNCATE user and matter tables.'
  );
}
