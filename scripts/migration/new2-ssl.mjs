/** `services/ingest/src/db-ssl.ts` in .mjs, for the scripts/ tools that cannot import TS. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
export function sslFor(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? false : 'require';
  } catch {
    return 'require';
  }
}
