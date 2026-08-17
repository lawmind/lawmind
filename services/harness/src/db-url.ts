/**
 * One answer to "does this connection need TLS", for every harness CLI.
 *
 * **The bug this replaces, measured 17 Aug 2026.** Six CLIs each carried
 * `ssl: url.includes('localhost') ? false : 'require'`. After the migration the
 * corpus lives at `postgresql://…@127.0.0.1:5432/lawmind`, which contains no
 * such substring, so every one of them demanded TLS from a local server that
 * does not speak it and died with `ECONNRESET` inside `countCorpus` — before a
 * single query was graded. The whole lane's tooling was unrunnable against the
 * database it now targets.
 *
 * Two things were wrong with the substring test, not one:
 *
 * 1. **Too narrow.** `127.0.0.1`, `::1` and `0.0.0.0` are as local as
 *    `localhost`, and `post-migration.ts` already says so — its `LOCAL_HOSTS`
 *    allowlist is the gate's authority on what counts as this machine.
 * 2. **Too loose.** A substring matches anywhere in the URL, so a remote host
 *    named `localhost.db.example.com` — or merely a PASSWORD containing the
 *    word — silently disables TLS on a public connection. Parsing the host is
 *    strictly safer as well as strictly more correct.
 *
 * The constant is deliberately duplicated rather than imported from
 * `post-migration.ts`: that copy is a REFUSAL mechanism guarding the migration
 * gate against ever touching Railway, and it should keep failing closed on its
 * own terms even if this file is edited. Two independent lists that agree is the
 * intended shape; one shared list that some later change loosens is not.
 */

/** Hosts that are this machine. Same set as the gate's, held separately on purpose. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/**
 * `false` for a local server, `'require'` for anything else.
 *
 * Fails CLOSED: a URL that cannot be parsed is treated as remote and gets TLS.
 * The cost of being wrong in that direction is a connection error; the cost of
 * being wrong in the other is an unencrypted connection to a production host.
 */
export function sslFor(url: string): false | 'require' {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'require';
  }
  return LOCAL_HOSTS.has(host.toLowerCase()) ? false : 'require';
}
