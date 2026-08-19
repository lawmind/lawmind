/**
 * One answer to "does this connection need TLS", for every ingest CLI.
 *
 * **The bug this replaces, measured 18 Aug 2026 across LCC's lane.** After the
 * cutover the corpus lives at `postgresql://…@127.0.0.1:5432/lawmind`, and the
 * server has `ssl = off`. Two different wrong tests were in the tree:
 *
 * - `ssl: 'require'` hard-coded — 12 files, a straight Railway leftover.
 * - `ssl: url.includes('localhost') ? false : 'require'` — 27 files. The URL
 *   contains no such substring, so this is `'require'` against a server that
 *   does not speak TLS.
 *
 * Both die the same way, and it is not a friendly error: `ECONNRESET` from
 * inside the driver, before a single query runs. `dedup-materialize-cli.ts` was
 * found this way — it had been unrunnable since the cutover and nothing said so.
 *
 * **This is NEW1's `services/harness/src/db-url.ts`, copied rather than
 * imported, on that file's own reasoning:** it argues that two independent
 * lists which agree is the intended shape, and that one shared list some later
 * change loosens is not. `services/ingest` also does not depend on
 * `services/harness`, and adding that edge to share nine lines would be the
 * wrong trade. Credit there; the logic below is theirs.
 *
 * Two things were wrong with the substring test, not one:
 *
 * 1. **Too narrow.** `127.0.0.1`, `::1` and `0.0.0.0` are as local as
 *    `localhost`.
 * 2. **Too loose.** A substring matches anywhere in the URL, so a remote host
 *    named `localhost.db.example.com` — or merely a PASSWORD containing the
 *    word — would silently disable TLS on a public connection. Parsing the host
 *    is strictly safer as well as strictly more correct.
 */

/** Hosts that are this machine. Held separately from the gate's copy, on purpose. */
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
