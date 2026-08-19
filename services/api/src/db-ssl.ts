/**
 * One answer to "does this connection need TLS", for this service's CLIs.
 *
 * **The bug this replaces, measured 18 Aug 2026.** After the cutover the corpus
 * lives at `postgresql://…@127.0.0.1:5432/lawmind` and the server has
 * `ssl = off`. Two wrong tests were in the tree — `ssl: 'require'` hard-coded,
 * and `ssl: url.includes('localhost') ? false : 'require'`, which matches no
 * substring in that URL. Both demand TLS from a server that does not speak it
 * and die with `ECONNRESET` inside the driver, before any query runs.
 *
 * Deliberately a COPY of `services/harness/src/db-url.ts` (NEW1, 17 Aug), on
 * that file's own reasoning: two independent lists that agree is the intended
 * shape; one shared list that some later change loosens is not. Credit there.
 *
 * The substring test was wrong twice over — too narrow (`127.0.0.1`, `::1` and
 * `0.0.0.0` are equally local) and too loose (a substring matches anywhere in
 * the URL, so a remote host named `localhost.db.example.com`, or merely a
 * PASSWORD containing the word, would silently disable TLS on a public link).
 */

/** Hosts that are this machine. Held separately from the other copies, on purpose. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/**
 * `false` for a local server, `'require'` for anything else.
 *
 * Fails CLOSED: an unparseable URL is treated as remote and gets TLS. Being
 * wrong that way costs a connection error; being wrong the other way is an
 * unencrypted connection to a production host.
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
