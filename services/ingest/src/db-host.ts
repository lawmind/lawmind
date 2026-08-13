/**
 * Resolving the database host ourselves, because the machine's resolver is the
 * thing that keeps failing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROOT CAUSE, MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Seven long passes have died with `getaddrinfo ENOTFOUND
 * hayabusa.proxy.rlwy.net`, surfacing as Node's *"Detected unsettled top-level
 * await"*. NEW2 root-caused it (bus 0159) and this machine's configuration
 * confirms it: **the only configured DNS server is `192.168.1.1`** — the
 * consumer router. Railway is fine; the router's resolver intermittently is not.
 *
 * **`connect_timeout` cannot help**, which cost two restarts to learn: that
 * timeout governs establishing a connection, and a lookup that stalls never
 * gets far enough to be timed. Every worker carried `connect_timeout: 120` and
 * died anyway.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT JUST `dns.setServers()`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Because it would not work here, and believing it did would be worse than
 * doing nothing. `dns.setServers()` governs `dns.resolve*()`; sockets use
 * `dns.lookup()`, which goes to the OS via `getaddrinfo` and ignores it
 * entirely. `postgres` calls `socket.connect(port, host)` with no `lookup`
 * option to override — checked in the driver's source rather than assumed.
 *
 * So the hostname is resolved HERE, through `dns.resolve4` pointed at public
 * resolvers, and the driver is handed an address instead of a name. The OS
 * resolver is taken out of the path rather than retried.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT CAN ONLY IMPROVE ON TODAY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every failure path returns the ORIGINAL url unchanged. If the public
 * resolvers are unreachable, if the host is already an IP, if anything throws —
 * the caller gets exactly what it would have used anyway, and the supervisor
 * still covers the remaining case. A resolver helper that can fail closed would
 * be a way to take the database down over a network hiccup.
 */
import dns from 'node:dns';

/**
 * Cloudflare and Google. Two independent operators, so one being unreachable is
 * not the same event as the other being unreachable — which is the entire point
 * of not depending on a single router.
 */
const PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4'];

/** A resolver that ignores the OS configuration, used only for our own lookups. */
const resolver = new dns.promises.Resolver();
resolver.setServers(PUBLIC_RESOLVERS);

const IS_IP = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * A short cache, not a long one. Railway can move a proxy address, and a stale
 * entry would send every worker to an address that stopped answering — the
 * failure this exists to prevent, arriving by a different road.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { address: string; at: number }>();

async function resolveWithRetry(hostname: string): Promise<string | null> {
  const hit = cache.get(hostname);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.address;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [address] = await resolver.resolve4(hostname);
      if (address) {
        cache.set(hostname, { address, at: Date.now() });
        return address;
      }
    } catch {
      // Fall through to the backoff; a failed lookup is the expected case here.
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  return null;
}

export type ResolvedDb = {
  /** The url to hand the driver — host replaced by an address when possible. */
  readonly url: string;
  /** The original hostname, for TLS SNI. Null when nothing was substituted. */
  readonly servername: string | null;
};

/**
 * Substitutes a resolved address for the hostname in a Postgres url.
 *
 * Returns the url untouched — and says so via a null `servername` — whenever
 * substitution is not possible or not needed.
 */
export async function resolveDbUrl(rawUrl: string): Promise<ResolvedDb> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: rawUrl, servername: null };
  }

  const hostname = parsed.hostname;
  // Already an address, a unix socket, or localhost: nothing to gain.
  if (hostname === '' || IS_IP.test(hostname) || hostname === 'localhost') {
    return { url: rawUrl, servername: null };
  }

  const address = await resolveWithRetry(hostname);
  if (address === null) return { url: rawUrl, servername: null };

  parsed.hostname = address;
  return { url: parsed.toString(), servername: hostname };
}

/**
 * The one way this lane opens a database connection.
 *
 * Bundles the three things every long pass in this repo has needed, each
 * learned from a worker that died without them: the resolver bypass above,
 * `connect_timeout` raised well above the 30s default because the proxy is
 * shared with twenty ingest workers, and `idle_timeout: 0` so a pass that
 * pauses on a slow batch does not have its connection reaped underneath it.
 */
export async function openDb(rawUrl: string, max = 2) {
  const postgres = (await import('postgres')).default;
  const { url, servername } = await resolveDbUrl(rawUrl);
  const local = url.includes('localhost') || url.includes('127.0.0.1');
  return postgres(url, {
    // SNI carries the ORIGINAL hostname, so TLS still identifies the right
    // server even though the socket dialled an address.
    ssl: local ? false : servername ? { rejectUnauthorized: false, servername } : ('require' as const),
    max,
    connect_timeout: 120,
    idle_timeout: 0,
  });
}
