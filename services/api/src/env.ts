/**
 * Names are documented in `DEPLOYMENT.md`. Values live in Railway and never in the
 * repo.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const nodeEnv = process.env['NODE_ENV'] ?? 'development';
const port = Number(process.env['PORT'] ?? 3000);

/**
 * The origin a magic link points at — better-auth builds the sign-in URL from it,
 * so whatever this resolves to is what lands in an advocate's inbox.
 *
 * **A wrong value here is invisible until it is in someone's email.** Nothing at
 * startup dereferences it, no test exercises the network, and the link looks
 * perfectly well-formed while pointing at a host that answers nothing. Until
 * 30 August 2026 this defaulted to `api-production-1c0b4.up.railway.app`, a
 * retired deployment: an unconfigured production API would have minted links to a
 * dead origin and reported every send as a success. That is the same failure
 * `mailerFrom` refuses — a path that reports success without the product working
 * — and it is fixed the same way, by refusing to start.
 *
 * So: **production must set it explicitly, and there is no fallback.** A default
 * that is right for one deployment is wrong for every other one, and a retired
 * host is wrong for all of them.
 *
 * Outside production it defaults to this process's own origin, which is what a
 * local API is actually reachable at and needs no configuration to be correct.
 * Kept as a default rather than made required because a developer who must set an
 * environment variable to receive a console-printed link will set it once, wrongly,
 * and never look again.
 */
export function resolveAuthBaseUrl(config: {
  authBaseUrl: string | undefined;
  nodeEnv: string;
  port: number;
}): string {
  if (config.authBaseUrl) return config.authBaseUrl;
  if (config.nodeEnv !== 'production') return `http://localhost:${config.port}`;
  throw new Error(
    'AUTH_BASE_URL is not set and NODE_ENV is production. Refusing to start rather than ' +
      'mint sign-in links against a guessed origin: every link would be delivered, look ' +
      'correct, and go nowhere. Set AUTH_BASE_URL to this deployment\u2019s own public origin.',
  );
}

export const env = {
  port,
  nodeEnv,
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  databaseUrl: () => required('DATABASE_URL'),

  /**
   * The hard ceiling on any single statement this API sends to Postgres.
   *
   * **This is a bound, not a tuning knob.** Before it existed a `/search` could
   * run without limit: `section 302 IPC` was measured still executing at 60s
   * (LOCAL_CONTENDED, 18,698,968-row corpus) because `ORDER BY ts_rank(...)`
   * must read the `full_text_tsv` of every row a GIN match set contains, and
   * nothing capped that set. Ten such requests exhaust `max: 10` and the API
   * stops answering — every route, not just search. That is the failure mode
   * "one search must not monopolize PostgreSQL" names.
   *
   * Set on the CONNECTION rather than around individual queries, because a
   * bound a caller has to remember is a bound that a new caller will not have.
   * Every statement on this pool is covered, including ones written later.
   *
   * 15s, and the number is deliberately far above the 3s request budget rather
   * than equal to it: this is the backstop that protects the database, and the
   * arms that should be faster are bounded by their own query design. A
   * backstop set at the budget would convert ordinary slow-but-working queries
   * into errors and hide the design problem instead of exposing it.
   */
  pgStatementTimeoutMs: () => Number(process.env['PG_STATEMENT_TIMEOUT_MS'] ?? 15_000),

  /**
   * Signs access tokens and better-auth's own state.
   *
   * **Required, with no development default.** A fallback secret is a secret
   * everyone has: it would work locally, survive review, and ship as a signing
   * key published in the repository. Failing to start is the cheap outcome.
   */
  authSecret: () => required('AUTH_SECRET'),

  /** Where a magic link points. The client resolves it to a screen. */
  authBaseUrl: () =>
    resolveAuthBaseUrl({ authBaseUrl: process.env['AUTH_BASE_URL'], nodeEnv, port }),

  /** Absent outside production, where `mailerFrom` then refuses to start. */
  resendApiKey: process.env['RESEND_API_KEY'],
  mailFrom: process.env['MAIL_FROM'] ?? 'Lawmind <onboarding@resend.dev>',
};
