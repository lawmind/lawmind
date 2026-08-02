/**
 * Values live in Railway, never in the repo. `DEPLOYMENT.md` lists the names.
 */
export function databaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}
