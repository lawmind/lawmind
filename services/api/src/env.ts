/**
 * Names are documented in `DEPLOYMENT.md`. Values live in Railway and never in the
 * repo.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const env = {
  port: Number(process.env['PORT'] ?? 3000),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  databaseUrl: () => required('DATABASE_URL'),

  /**
   * Signs access tokens and better-auth's own state.
   *
   * **Required, with no development default.** A fallback secret is a secret
   * everyone has: it would work locally, survive review, and ship as a signing
   * key published in the repository. Failing to start is the cheap outcome.
   */
  authSecret: () => required('AUTH_SECRET'),

  /** Where a magic link points. The client resolves it to a screen. */
  authBaseUrl: () => process.env['AUTH_BASE_URL'] ?? 'https://api-production-1c0b4.up.railway.app',

  /** Absent outside production, where `mailerFrom` then refuses to start. */
  resendApiKey: process.env['RESEND_API_KEY'],
  mailFrom: process.env['MAIL_FROM'] ?? 'Lawmind <onboarding@resend.dev>',
};
