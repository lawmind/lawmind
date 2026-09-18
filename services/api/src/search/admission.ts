/**
 * How many expensive searches may run at once, and what happens to the rest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A BOUNDED WAIT AND AN HONEST REFUSAL, NEVER AN EMPTY RESULT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two things a busy server must never do, both of which the unbounded pool
 * queue did:
 *
 *   - wait forever. A caller that has already gone is still holding a slot.
 *   - answer `results: []`. `docs/CITATION_HARNESS.md` holds silent drop at a
 *     zero threshold, and "no law found" produced by our own congestion is the
 *     purest possible silent drop: the advocate cannot tell it from a corpus
 *     that genuinely has nothing.
 *
 * So: wait up to {@link ADMISSION_WAIT_MS} for a slot, then refuse with 503 and
 * a `Retry-After`. A refusal the client can render as "the server is busy, try
 * again" is a truthful state. An empty page is a lie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEMAPHORE AND NOT A RATE LIMIT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A rate limit counts requests per unit time and cannot see how long any of
 * them takes. The resource being protected here is a CONNECTION HELD, and a
 * single concept query holds one for up to 15 s. Ten per minute is fine when
 * each takes 200 ms and fatal when each takes 15 s; a semaphore measures the
 * thing that actually runs out. Per-user rate limiting is a separate concern
 * and lives in `rate-limit.ts`.
 */
import { RESEARCH_CONCURRENCY } from '../pools.ts';

/** How long a request will wait for a slot before being refused. */
export const ADMISSION_WAIT_MS = Number(process.env['SEARCH_ADMISSION_WAIT_MS'] ?? 2_000);

export type Admission = {
  /** Null when no slot came free in time. Otherwise call `release` exactly once. */
  acquire: () => Promise<{ release: () => void } | null>;
  /** For the admin surface and tests. */
  stats: () => { inFlight: number; waiting: number; limit: number; refused: number };
};

export function createAdmission(
  limit = RESEARCH_CONCURRENCY,
  waitMs = ADMISSION_WAIT_MS,
): Admission {
  let inFlight = 0;
  let refused = 0;
  const waiters: ((granted: boolean) => void)[] = [];

  function releaseOne(): void {
    const next = waiters.shift();
    if (next) {
      // Hand the slot straight to the next waiter rather than decrementing and
      // letting it race a newly arrived request. FIFO, so a queued caller
      // cannot be starved by a steady arrival rate.
      next(true);
      return;
    }
    inFlight--;
  }

  return {
    acquire: async () => {
      if (inFlight < limit) {
        inFlight++;
        return { release: releaseOne };
      }
      const granted = await new Promise<boolean>((resolve) => {
        const waiter = (ok: boolean) => {
          clearTimeout(timer);
          resolve(ok);
        };
        const timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i !== -1) waiters.splice(i, 1);
          resolve(false);
        }, waitMs);
        waiters.push(waiter);
      });
      if (!granted) {
        refused++;
        return null;
      }
      return { release: releaseOne };
    },
    stats: () => ({ inFlight, waiting: waiters.length, limit, refused }),
  };
}
