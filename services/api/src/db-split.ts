/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO DATABASE ROLES, AND A GUARD THAT REFUSES TO PRETEND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate C requires that a corpus rollback cannot roll back an advocate's matters.
 * `cascade-guard.ts` proves that is FALSE on one shared database and refuses;
 * `db-roles.ts` says which table belongs to which role. This file resolves the
 * two roles to two connection URLs, and decides when sharing one is allowed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IDENTITY IS COMPARED AND NOT THE URL STRING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `postgres://u:p@db.internal:5432/lawmind` and
 * `postgres://u:p@DB.INTERNAL/lawmind?sslmode=require` are the same database and
 * two different strings. A guard comparing strings passes both, announces a
 * split that does not exist, and the first corpus rollback takes the matters
 * with it — the exact failure the guard was added to prevent, wearing a green
 * check.
 *
 * So the comparison is on the TARGET: lower-cased host, the port with
 * PostgreSQL's own 5432 default applied, and the database name. Those three are
 * what decide which files on which machine a `TRUNCATE` reaches.
 *
 * **What this cannot see, stated rather than glossed.** Two different hostnames
 * can resolve to one server, and one server can be reached through a proxy under
 * another name. Answering that needs a query to each database, not string work,
 * and {@link sameDatabaseIdentity} is deliberately the cheap syntactic half.
 * `verifyDistinctDatabases` in `ops/db-identity.ts` is the other half and asks
 * the servers themselves.
 */

/** Which database a piece of work belongs to. See `ops/db-roles.ts`. */
export type DbRole = 'corpus' | 'user';

export type DatabaseTarget = {
  host: string;
  port: number;
  database: string;
};

/**
 * The three fields that decide which files a statement reaches.
 *
 * Returns `null` for a URL that does not parse. A caller must treat that as
 * "cannot prove they differ" and refuse, never as "they differ".
 */
export function databaseTarget(url: string): DatabaseTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database === '') return null;
  return {
    host: parsed.hostname.toLowerCase(),
    // PostgreSQL's own default, applied here so an explicit `:5432` and an
    // omitted port are not read as two different servers.
    port: parsed.port === '' ? 5432 : Number(parsed.port),
    database,
  };
}

/**
 * Do these two URLs name the same database?
 *
 * `true` is also the answer when either URL cannot be parsed: the question is
 * "have these been PROVEN distinct", and an unparseable URL proves nothing. Fail
 * closed — the caller's next move is to refuse to start.
 */
export function sameDatabaseIdentity(a: string, b: string): boolean {
  const ta = databaseTarget(a);
  const tb = databaseTarget(b);
  if (ta === null || tb === null) return true;
  return ta.host === tb.host && ta.port === tb.port && ta.database === tb.database;
}

export type SplitMode =
  /**
   * One database serves both roles. The ONLY supported configuration for local
   * development, and it is explicit rather than implied: a developer who has not
   * heard of the split gets it, and a deployment that has cannot reach it by
   * forgetting a variable.
   */
  | 'single'
  /** Two physically separate databases, one per role. */
  | 'split';

export type ResolvedDatabases = {
  mode: SplitMode;
  corpusUrl: string;
  userUrl: string;
};

/**
 * Resolve the two roles from the environment.
 *
 * ── THE DEFAULTS, AND WHY THEY ARE THESE ────────────────────────────────────
 *
 * `CORPUS_DATABASE_URL` and `USER_DATABASE_URL` each fall back to
 * `DATABASE_URL`, so **every existing deployment and every developer keeps
 * working with no new variable**. The split is opt-in by configuration, which is
 * how a change this size arrives without a flag day.
 *
 * ── WHEN SHARING IS REFUSED ─────────────────────────────────────────────────
 *
 * `DB_SPLIT_MODE=split` is an ASSERTION about the deployment, and this function
 * checks it rather than trusting it. If the two roles resolve to one database
 * the process refuses to start, because every downstream guarantee — the
 * rollback isolation, the cascade guard's silence, the release tooling's
 * role check — is false in that configuration while claiming to be true.
 *
 * Refusing at startup rather than at the first restore is the point: a
 * misconfiguration discovered by a `TRUNCATE` has already destroyed the thing
 * the check exists to protect.
 */
export function resolveDatabases(source: {
  DATABASE_URL?: string | undefined;
  CORPUS_DATABASE_URL?: string | undefined;
  USER_DATABASE_URL?: string | undefined;
  DB_SPLIT_MODE?: string | undefined;
}): ResolvedDatabases {
  const base = source.DATABASE_URL;
  const corpusUrl = source.CORPUS_DATABASE_URL ?? base;
  const userUrl = source.USER_DATABASE_URL ?? base;

  if (!corpusUrl || !userUrl) {
    throw new Error(
      'No database is configured. Set DATABASE_URL, or set both CORPUS_DATABASE_URL and ' +
        'USER_DATABASE_URL.',
    );
  }

  const declared = source.DB_SPLIT_MODE;
  if (declared !== undefined && declared !== 'single' && declared !== 'split') {
    throw new Error(`DB_SPLIT_MODE must be "single" or "split"; got "${declared}".`);
  }

  /**
   * Undeclared is INFERRED, never assumed to be `single`. If an operator has set
   * two different URLs they meant it, and a mode that silently read `single`
   * would skip every guard while running genuinely split.
   */
  const mode: SplitMode =
    declared ?? (sameDatabaseIdentity(corpusUrl, userUrl) ? 'single' : 'split');

  if (mode === 'split' && sameDatabaseIdentity(corpusUrl, userUrl)) {
    const t = databaseTarget(corpusUrl);
    throw new Error(
      'DB_SPLIT_MODE=split, but CORPUS_DATABASE_URL and USER_DATABASE_URL resolve to the SAME ' +
        `database (${t ? `${t.host}:${t.port}/${t.database}` : 'unparseable URL'}). ` +
        'Refusing to start: a corpus release or rollback against that database would TRUNCATE ' +
        'user and matter tables, and every guard downstream would report the split as healthy. ' +
        'Point the two variables at two databases, or set DB_SPLIT_MODE=single.',
    );
  }

  return { mode, corpusUrl, userUrl };
}
