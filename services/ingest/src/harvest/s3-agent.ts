/**
 * A tuned undici connection pool for the AWS Open Data S3 hosts this lane
 * fetches from constantly.
 *
 * Plain `fetch()` opens a fresh connection per request once the default
 * pool's keep-alive slots are exhausted, and every fresh connection pays a
 * DNS lookup — `dns.lookup()` runs on libuv's 4-thread pool with no caching,
 * so no more than 4 lookups can be in flight at once regardless of app-level
 * `--concurrency`. Measured tonight (`docs/CURRENT_PLAN.md` Q1.43): a
 * 3,477-row wall of near-instant 404 checks that should clear in under a
 * minute took ~40 minutes — a 40-100x gap explained by exactly this ceiling.
 *
 * A larger keep-alive pool means most requests to the SAME host reuse an
 * already-resolved connection instead of paying a fresh DNS lookup, which
 * sidesteps the threadpool cap rather than fighting it.
 *
 * This is a different problem from the one `text.ts`'s `fetchWithRetry`
 * documents (a flaky OS resolver at the network's edge, worked around with
 * retries because a custom DNS `lookup` needs undici and undici wasn't a
 * dependency). It is now, added specifically for this connection-pool fix —
 * founder-authorised, 14 Aug 2026.
 */
import { Agent, setGlobalDispatcher } from 'undici';

let installed = false;

/** Idempotent — safe to call from every entry point that fetches from S3. */
export function installTunedS3Agent(): void {
  if (installed) return;
  installed = true;
  setGlobalDispatcher(
    new Agent({
      connections: 64,
      pipelining: 1,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connect: { timeout: 15_000 },
    }),
  );
}
