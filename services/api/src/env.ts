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
};
