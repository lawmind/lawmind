/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A SERVING DEPLOYMENT MUST PROVE BEFORE IT ANSWERS ONE REQUEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `env.ts` reads variables. `db-split.ts` resolves two roles and refuses a
 * DECLARED split that is really one database. Neither answers the question a
 * remote alpha actually turns on:
 *
 *   is this process configured to serve the public, and if so, is every
 *   assumption the rest of the system makes about that configuration TRUE?
 *
 * Three real gaps this closes, each of which passes every existing check:
 *
 *   1. **A production deployment that never set the two role URLs.** Both fall
 *      back to `DATABASE_URL` by design (that default is what let the split
 *      arrive without a flag day). `DB_SPLIT_MODE` is then INFERRED as
 *      `single`, `resolveDatabases` returns happily, `index.ts` skips
 *      `verifyDistinctDatabases` because the mode is not `split`, and the API
 *      serves production on one database — where `release-restore-cli.ts`'s
 *      `TRUNCATE ... CASCADE` empties `matter_authorities` with the corpus.
 *      The whole R28 architecture is opt-in by a variable nobody is forced to
 *      set. Here it becomes mandatory the moment the deployment says it is
 *      serving.
 *
 *   2. **The founder's workstation as the serving plane.** `DATABASE_URL` in
 *      this repository's own `.env` points at `127.0.0.1:5432/lawmind` — the
 *      box the ingest fleet, the enrichment workers and every experiment run
 *      against. A staging API that inherits it serves advocates from a laptop
 *      that is also being `TRUNCATE`d by a lane, and nothing today says no.
 *
 *   3. **A serving deployment with no release identity.** `/version` answers
 *      `unknown` when no SHA variable is set and no `.git` is present, which is
 *      exactly the state of a CLI deploy. Two deploys then cannot be told
 *      apart, which makes "roll back to the previous verified generation"
 *      unanswerable at the moment it is needed.
 *
 * ── FAIL CLOSED, AND SAY EVERYTHING AT ONCE ─────────────────────────────────
 *
 * Every violation is collected and reported together, like `preflight.ts`:
 * an operator fixing a misconfiguration one restart at a time is an operator
 * who will get three of the five right and ship.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * It is SYNTACTIC. It reads the environment, not the servers. The runtime half
 * already exists and is stronger where it applies: `ops/db-identity.ts` asks
 * both databases for `(system_identifier, current_database())`, which is what a
 * `TRUNCATE` actually scopes to, and {@link forbiddenSystemIdentifiers} feeds
 * that same mechanism the workstation's own cluster id so a tunnel, a proxy or
 * a port-forward cannot dress it up as a remote host. Neither half replaces the
 * other: the environment check runs before a socket is opened, and the identity
 * check sees through every spelling.
 */

/**
 * Which deployment this is, as the deployment itself declares it.
 *
 * `NODE_ENV` cannot carry this. It is read by build tooling, set to
 * `production` by every bundler and process manager for reasons that have
 * nothing to do with who the audience is, and a staging box legitimately runs
 * `NODE_ENV=production`. So the audience gets its own variable, and the two are
 * combined rather than one being inferred from the other.
 */
export type ServingEnv = 'development' | 'staging' | 'production';

/** Staging and production both serve somebody who is not the person deploying. */
export function isServingEnv(env: ServingEnv): boolean {
  return env === 'staging' || env === 'production';
}

export type ServingViolation = {
  readonly check: string;
  readonly detail: string;
};

export type ServingContract = {
  readonly servingEnv: ServingEnv;
  readonly serving: boolean;
  readonly violations: readonly ServingViolation[];
  /**
   * Cluster ids this deployment must never be pointed at, parsed from
   * `LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS`. Handed to the runtime identity
   * check in `ops/db-identity.ts`; empty when unconfigured, which is honest
   * rather than safe and is why the host rules below still exist.
   */
  readonly forbiddenSystemIdentifiers: readonly string[];
};

export type ServingSource = {
  readonly LAWMIND_SERVING_ENV?: string | undefined;
  readonly NODE_ENV?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
  readonly CORPUS_DATABASE_URL?: string | undefined;
  readonly USER_DATABASE_URL?: string | undefined;
  readonly DB_SPLIT_MODE?: string | undefined;
  readonly AUTH_SECRET?: string | undefined;
  readonly AUTH_BASE_URL?: string | undefined;
  readonly RESEND_API_KEY?: string | undefined;
  readonly MAIL_FROM?: string | undefined;
  readonly RAILWAY_GIT_COMMIT_SHA?: string | undefined;
  readonly GITHUB_SHA?: string | undefined;
  readonly GIT_SHA?: string | undefined;
  readonly LAWMIND_RELEASE_ID?: string | undefined;
  readonly LAWMIND_ALLOW_PRIVATE_DB_HOST?: string | undefined;
  readonly LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS?: string | undefined;
  readonly SENTRY_DSN?: string | undefined;
  readonly LOG_LEVEL?: string | undefined;
};

/**
 * Resolve the declared audience.
 *
 * Unset is `development`, never inferred from `NODE_ENV=production`. A
 * deployment that has not said who it serves has not been configured, and
 * guessing "production" would fail-close every developer's `pnpm start` while
 * guessing "development" for a real deployment is the failure this file exists
 * to prevent. The variable is REQUIRED of a serving deployment by §Environment
 * contract in `docs/ops/REMOTE_ALPHA_PACKAGE.md`; nothing can make an omission
 * safe, so it is made loud instead.
 */
export function resolveServingEnv(source: ServingSource): ServingEnv {
  const declared = source.LAWMIND_SERVING_ENV?.trim().toLowerCase();
  if (declared === 'production' || declared === 'staging' || declared === 'development') {
    return declared;
  }
  return 'development';
}

/** Loopback by any spelling. Never a serving database, in any topology. */
function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  return /^127\./.test(host);
}

/**
 * A literal address inside a private or carrier-grade range.
 *
 * Refused by DEFAULT rather than always, because a legitimate topology exists:
 * an API and its database on one provider's private network, addressed by IP.
 * `LAWMIND_ALLOW_PRIVATE_DB_HOST=1` is the operator stating that topology, and
 * stating it is the point — the default must not quietly accept a laptop.
 */
function isPrivateLiteral(host: string): boolean {
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  // RFC 6598, what a home router hands out behind CGNAT.
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
  return false;
}

/**
 * A hostname that only resolves on somebody's own machine or LAN.
 *
 * `*.internal` is deliberately NOT here: `postgres.railway.internal` is a
 * provider's private DNS and is exactly where a correctly configured Railway
 * deployment points. The suffixes below are mDNS and home-router domains, which
 * no hosting provider issues.
 */
function isWorkstationHost(host: string, ownHostname: string): boolean {
  if (/\.(local|lan|localdomain|home|homenet)$/.test(host)) return true;
  const own = ownHostname.trim().toLowerCase();
  if (own !== '' && (host === own || host === `${own}.local`)) return true;
  return false;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classify one database URL for a serving deployment.
 *
 * Returns `null` when the target is acceptable, or the reason it is not.
 * An UNPARSEABLE url is a violation, not a pass: the question is "has this been
 * proven to be a remote serving target", and an unreadable URL proves nothing.
 */
export function localServingRefusal(
  url: string,
  opts: { ownHostname: string; allowPrivate: boolean },
): string | null {
  const host = hostOf(url);
  if (host === null || host === '') {
    return 'the URL does not parse, so its target cannot be shown to be remote';
  }
  if (isLoopbackHost(host)) {
    return `"${host}" is loopback — this would serve the public from the database on the machine running the API, which on this project is the founder's workstation, the box the ingest fleet writes to`;
  }
  if (isWorkstationHost(host, opts.ownHostname)) {
    return `"${host}" names this machine or a LAN-only domain, which no hosting provider issues`;
  }
  if (isPrivateLiteral(host) && !opts.allowPrivate) {
    return `"${host}" is a private-range literal. If the API and its database really share a provider's private network, say so with LAWMIND_ALLOW_PRIVATE_DB_HOST=1; the default refuses because an unstated private address is far more often a laptop than a topology`;
  }
  return null;
}

function parseForbiddenIdentifiers(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * The whole contract, evaluated.
 *
 * `ownHostname` is injected rather than read from `node:os` so this stays pure
 * and so a test can state the machine it is pretending to be.
 */
export function evaluateServingContract(
  source: ServingSource,
  opts: { ownHostname: string },
): ServingContract {
  const servingEnv = resolveServingEnv(source);
  const serving = isServingEnv(servingEnv);
  const violations: ServingViolation[] = [];
  const forbiddenSystemIdentifiers = parseForbiddenIdentifiers(
    source.LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS,
  );

  if (!serving) {
    return { servingEnv, serving, violations, forbiddenSystemIdentifiers };
  }

  const allowPrivate = source.LAWMIND_ALLOW_PRIVATE_DB_HOST === '1';

  /* ── the two roles, explicitly, with no generic fallback ───────────────── */
  const corpusUrl = source.CORPUS_DATABASE_URL;
  const userUrl = source.USER_DATABASE_URL;

  if (!corpusUrl || !userUrl) {
    violations.push({
      check: 'env:role-urls',
      detail:
        'a serving deployment must set CORPUS_DATABASE_URL and USER_DATABASE_URL explicitly. ' +
        'Falling back to DATABASE_URL is the default that let the split ship without a flag ' +
        'day, and it is the wrong default here: both roles then resolve to one database, ' +
        'DB_SPLIT_MODE infers "single", the startup identity check is skipped, and a corpus ' +
        'restore TRUNCATEs an advocate’s matters along with the corpus.',
    });
  }

  if (source.DB_SPLIT_MODE !== 'split') {
    violations.push({
      check: 'env:db-split-mode',
      detail:
        `DB_SPLIT_MODE is "${source.DB_SPLIT_MODE ?? 'unset'}"; a serving deployment must ` +
        'declare "split". The declaration is what turns on the runtime identity verification ' +
        'in index.ts — an inferred mode verifies nothing.',
    });
  }

  for (const [name, url] of [
    ['CORPUS_DATABASE_URL', corpusUrl],
    ['USER_DATABASE_URL', userUrl],
  ] as const) {
    if (!url) continue;
    const refusal = localServingRefusal(url, { ownHostname: opts.ownHostname, allowPrivate });
    if (refusal) {
      violations.push({ check: `db-target:${name}`, detail: `${name}: ${refusal}` });
    }
  }

  /* ── secrets and identity ──────────────────────────────────────────────── */
  if (!source.AUTH_SECRET) {
    violations.push({
      check: 'env:AUTH_SECRET',
      detail:
        'AUTH_SECRET is unset. env.ts already refuses at first use; refusing at boot ' +
        'means the deployment never reports healthy with a signing key it does not have.',
    });
  }

  const authBaseUrl = source.AUTH_BASE_URL;
  if (!authBaseUrl) {
    violations.push({
      check: 'env:AUTH_BASE_URL',
      detail:
        'AUTH_BASE_URL is unset. A wrong or missing value is invisible until a sign-in link ' +
        'is already in an advocate’s inbox, pointing at a host that answers nothing.',
    });
  } else if (!authBaseUrl.startsWith('https://')) {
    violations.push({
      check: 'env:AUTH_BASE_URL',
      detail:
        `AUTH_BASE_URL is "${authBaseUrl}". A serving deployment mints sign-in links; over ` +
        'http they are a bearer credential travelling in clear text.',
    });
  }

  if (!source.RESEND_API_KEY) {
    violations.push({
      check: 'env:RESEND_API_KEY',
      detail:
        'RESEND_API_KEY is unset, so sign-in mail cannot be sent. packages/auth already ' +
        'refuses the console transport outside development; this names it at boot.',
    });
  }

  const releaseId =
    source.LAWMIND_RELEASE_ID ??
    source.RAILWAY_GIT_COMMIT_SHA ??
    source.GITHUB_SHA ??
    source.GIT_SHA;
  if (!releaseId) {
    violations.push({
      check: 'env:release-identity',
      detail:
        'no release identity is set (LAWMIND_RELEASE_ID, RAILWAY_GIT_COMMIT_SHA, GITHUB_SHA ' +
        'or GIT_SHA). /version would answer "unknown" on a CLI deploy, and two deploys that ' +
        'cannot be told apart make "roll back to the previous verified build" unanswerable at ' +
        'exactly the moment it is asked.',
    });
  }

  return { servingEnv, serving, violations, forbiddenSystemIdentifiers };
}

/** Every violation, one per line, for a fatal log and for an operator to read. */
export function servingContractRefusal(contract: ServingContract): string {
  const lines = contract.violations.map((v) => `  - ${v.check}: ${v.detail}`).join('\n');
  return (
    `Refusing to start: LAWMIND_SERVING_ENV=${contract.servingEnv} declares this deployment ` +
    `serves people other than whoever deployed it, and its configuration does not hold.\n${lines}`
  );
}
