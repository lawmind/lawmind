/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE A SEARCH'S TIME ACTUALLY WENT — AND WHERE WE REFUSE TO GUESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two physical Android runs (RCC bus 1652 and 1690) observed a COLD `POST
 * /search` at 15,334 ms and 15,243 ms while warm requests on the same device
 * answered in 90-771 ms. `app.ts` logged the total and `search_events` recorded
 * `latency_ms`; neither could say which part of the request the fifteen seconds
 * belonged to. Local direct-phase measurement did not reproduce it, so the
 * question is still open and the only way to close it is to make the NEXT
 * occurrence self-describing.
 *
 * This module is that: a phase clock whose output is ONE structured log line
 * per search. It is diagnostics, never product truth — nothing here reaches an
 * advocate, changes a response, or influences a ranking.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RESIDUAL IS CALLED `unattributed`, NOT `poolWait`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The tempting shortcut is `total - (phases we measured)` and a label saying
 * "connection queue". That number is real — it is genuinely time this request
 * spent somewhere we did not instrument — but it is ALSO GC, event-loop
 * scheduling behind 25 other Node processes on this box, and any phase added
 * later and not wired in. Calling it pool wait would be a measurement invented
 * to answer the question we were asked, which is the one failure mode this
 * round exists to avoid.
 *
 * So it is published under its own honest name. `poolWaitMs` is measured or it
 * is `null`; it is never derived.
 */
import type { Sql } from 'postgres';

/**
 * Whether to spend a real pool acquisition on measuring pool acquisition.
 *
 * OFF by default, and that is the conservative choice rather than the lazy one.
 * The probe below takes a connection out of the research pool and puts it
 * straight back; under contention that costs the very queueing it is trying to
 * measure, and a probe that perturbs its own subject is worse than no probe.
 * Staging turns it on for a diagnosis window; `measure:round` turns it on for
 * itself. `SEARCH_POOL_PROBE=1`.
 */
export function poolProbeEnabled(): boolean {
  return process.env['SEARCH_POOL_PROBE'] === '1';
}

/**
 * How long it takes to get a connection out of `sql`'s pool, right now.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS NUMBER IS, EXACTLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `postgres.js` (3.4.9) queues a query on the pool's internal `queries` list
 * the moment it is awaited and offers no hook for "this query has been handed a
 * connection" — `src/index.js` `handler()` / `go()` / `onopen()` are all
 * private, and the queues are not exposed on the `Sql` object. So the wait the
 * ARMS experience cannot be read directly.
 *
 * `reserve()` IS public, and it resolves at exactly the acquisition boundary:
 * immediately when a connection is idle (`open.shift()`), and otherwise only
 * once one is freed or a new one finishes connecting. Timing it therefore
 * measures the real thing at the real boundary — for a probe taken at that
 * instant, on that pool.
 *
 * TWO honest limits, which every consumer of this field must carry:
 *
 *   1. it is a SAMPLE taken immediately before retrieval, not the wait the
 *      sparse and dense arms themselves paid a moment later;
 *   2. on a COLD pool it includes TCP + TLS + startup + the `connection:`
 *      parameters being applied, because `reserve()` on an unconnected pool
 *      opens a connection. That is deliberate — a cold first search is the
 *      event being diagnosed — but it means a large value here is "acquire
 *      including connect", never "queued behind other searches".
 */
export async function measurePoolWaitMs(sql: Sql): Promise<number | null> {
  if (!poolProbeEnabled()) return null;
  const started = performance.now();
  try {
    const reserved = await sql.reserve();
    const waited = performance.now() - started;
    reserved.release();
    return Math.round(waited);
  } catch {
    // A probe must never cost a search. An unreachable database will fail the
    // request a few lines later, on its own terms, with its own error.
    return null;
  }
}

/** Phase name → total milliseconds spent in it during one request. */
export type Phases = Record<string, number>;

export type PhaseClock = {
  /** Time an awaited phase. Re-entering the same name ACCUMULATES. */
  phase: <T>(name: string, run: () => Promise<T>) => Promise<T>;
  /** Time a synchronous phase. */
  phaseSync: <T>(name: string, run: () => T) => T;
  /** Record a duration measured elsewhere (a nested arm, a concurrent branch). */
  add: (name: string, ms: number) => void;
  /** Milliseconds since the clock was created. */
  elapsedMs: () => number;
  /** Rounded phases, in the order they were first entered. */
  phases: () => Phases;
  /**
   * `elapsed - Σ(TOP-LEVEL phases)`, floored at zero, under a name that does not
   * claim to know what it is. See this file's header.
   */
  unattributedMs: () => number;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RESIDUAL MUST SUBTRACT THE TOP LEVEL ONLY, AND THIS WAS A REAL BUG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The phases NEST: `retrievalMs` contains `armsMs`, which contains `sparseMs`
 * and `denseMs`. Summing every recorded phase therefore counts the same
 * milliseconds three times — measured on this route, 79,244 ms of "phases"
 * against a 26,711 ms request. `unattributedMs` would then be floored at zero
 * on every request and would quietly report "everything is accounted for" on
 * exactly the slow requests it exists to explain.
 *
 * So the clock is told which phases are the request's DIRECT children and
 * subtracts only those. A depth counter was the obvious alternative and is
 * wrong here: the two rankers run concurrently under `Promise.all`, so
 * increment-on-enter / decrement-on-exit interleaves across awaits and would
 * mis-attribute nesting under load — the one condition that matters.
 */
export function createPhaseClock(topLevel: readonly string[] = []): PhaseClock {
  const started = performance.now();
  const topLevelSet = new Set(topLevel);
  const totals = new Map<string, number>();

  function add(name: string, ms: number): void {
    totals.set(name, (totals.get(name) ?? 0) + ms);
  }

  return {
    add,
    phase: async <T>(name: string, run: () => Promise<T>): Promise<T> => {
      const at = performance.now();
      try {
        return await run();
      } finally {
        // In `finally`, so a phase that THREW is still measured. A timing that
        // disappears on the error path hides exactly the slow failures worth
        // finding.
        add(name, performance.now() - at);
      }
    },
    phaseSync: <T>(name: string, run: () => T): T => {
      const at = performance.now();
      try {
        return run();
      } finally {
        add(name, performance.now() - at);
      }
    },
    elapsedMs: () => performance.now() - started,
    phases: () => {
      const out: Phases = {};
      for (const [name, ms] of totals) out[name] = Math.round(ms);
      return out;
    },
    unattributedMs: () => {
      let sum = 0;
      for (const [name, ms] of totals) if (topLevelSet.has(name)) sum += ms;
      return Math.max(0, Math.round(performance.now() - started - sum));
    },
  };
}

/**
 * The phase names `/search` publishes.
 *
 * Named constants rather than string literals at each call site for one reason
 * that has already cost this repository a round: a typo'd phase name does not
 * fail, it silently creates a SECOND phase that sums to nothing and quietly
 * enlarges `unattributed`.
 *
 * `arms` is the WALL time of `Promise.all([sparse, dense])` and is therefore
 * `max(sparse, dense)` plus scheduling, never their sum. `sparse` and `dense`
 * are each the individual arm. All three are published because the difference
 * between them is the evidence for whether the two arms really overlapped.
 */
export const SEARCH_PHASE = {
  /** Waiting for a slot at the admission semaphore, before any SQL. */
  admissionWait: 'admissionWaitMs',
  /** `expandCategories` — court category codes to the names the column holds. */
  courtExpand: 'courtExpandMs',
  /** `classifyQuery` on the route's side. Sync; expected sub-millisecond. */
  classification: 'classificationMs',
  /** `answerStructured` — runs on EVERY query, including prose ones. */
  structured: 'structuredMs',
  /** `deps.embedQuery` — the dense arm's input, and its own 2 s budget. */
  embed: 'embedMs',
  /** `hybridSearch` end to end. */
  retrieval: 'retrievalMs',
  /** Inside retrieval: the bounded exact-identity probe. */
  pins: 'pinsMs',
  /** Inside retrieval: `Promise.all` over both rankers — a MAX, not a sum. */
  arms: 'armsMs',
  /** Inside retrieval: the sparse ranker alone. */
  sparse: 'sparseMs',
  /** Inside retrieval: the dense ranker alone. */
  dense: 'denseMs',
  /** Inside retrieval: the content-hash collapse read. */
  dedup: 'dedupMs',
  /** Inside retrieval: the final judgment row read — every rendered field. */
  hydrate: 'hydrateMs',
  /** Inside retrieval: the live treatment-edge read. */
  edges: 'edgesMs',
  /** Inside retrieval: `fillParagraphFallback` — evidence for sparse-only hits. */
  fallback: 'fallbackMs',
  /** `derivedEffects` on the structured branches. */
  derivedEffects: 'derivedEffectsMs',
  /** `searches` + `citation_checks` writes, on the CORE pool. */
  bookkeeping: 'bookkeepingMs',
  /** `unpopulatedCategories` — one aggregate, per request, deliberately. */
  unpopulated: 'unpopulatedMs',
  /** Building the response object and serialising it. */
  serialization: 'serializationMs',
} as const;

/**
 * The request's DIRECT children — the ones whose sum, subtracted from the total,
 * leaves an honest residual. Everything else in `SEARCH_PHASE` happens INSIDE
 * one of these and would be counted twice.
 *
 * `derivedEffectsMs` is here rather than under retrieval because it belongs to
 * the STRUCTURED branches, which return before `hybridSearch` is ever reached.
 */
export const SEARCH_TOP_LEVEL_PHASES = [
  SEARCH_PHASE.admissionWait,
  SEARCH_PHASE.courtExpand,
  SEARCH_PHASE.structured,
  SEARCH_PHASE.embed,
  SEARCH_PHASE.retrieval,
  SEARCH_PHASE.derivedEffects,
  SEARCH_PHASE.bookkeeping,
  SEARCH_PHASE.unpopulated,
  SEARCH_PHASE.serialization,
] as const;

/** The sink `hybridSearch` fills in place. Absent for every existing caller. */
export type RetrievalTimings = Pick<PhaseClock, 'phase' | 'phaseSync' | 'add'>;
