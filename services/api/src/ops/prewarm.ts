/**
 * ─────────────────────────────────────────────────────────────────────────────
 * N-4 — A COLD CORPUS MUST NOT DEPEND ON SOMEBODY REMEMBERING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate C found it and named it plainly: "Corpus prewarm is a manual step; an
 * unattended restart serves cold until traffic warms it."
 *
 * The manual step is real and it works — `scripts/lcc-r32b-prewarm.sh`, run by
 * hand on the corpus host after every activation and every cluster restart, about
 * 60 s. It is also a step a Windows Update reboot at 02:33 does not perform, and
 * the numbers for serving cold are not marginal: the first remote Gate-S1 run
 * failed on cold reads alone at p95 4,774 ms, and the same query measured
 * **6.5 s cold against 0.6 s warm**.
 *
 * ── WHY NOT JUST CALL THE EXISTING SCRIPT ───────────────────────────────────
 *
 * It runs `pg_prewarm()` as `sudo -u postgres`. Three problems for an automated
 * path, and the third is decisive:
 *
 *   1. `pg_prewarm` is superuser-restricted by default. The API connects as
 *      `lawmind_corpus`, a deliberately non-superuser role, and granting a
 *      non-superuser the ability to pull arbitrary relations into shared buffers
 *      is a privilege change made to save a minute.
 *   2. It needs an extension present and a shell on the database host, which ties
 *      the mechanism to one provider's topology at the moment the provider is
 *      undecided.
 *   3. **It warms what we tell it to, not what queries need.** The script names
 *      three relations because a human read a plan once. Real queries decide for
 *      themselves.
 *
 * So this warms the corpus the way traffic does — by running representative reads
 * through the ordinary query path — except deliberately, immediately, and
 * observably, instead of by luck at an advocate's expense. It needs no privilege
 * the API does not already have, no extension, and no shell.
 *
 * ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────
 *
 * It does not claim to make cold queries fast. The Gate-C limitation stands and is
 * a sizing fact, not something a warm pass repairs: the stored tsvectors live in a
 * ~98 GB TOAST table that cannot be held in 31 GiB of RAM, and **1 of 8 never-seen
 * queries measured 3.5 s** even warm. `docs/ai/ship-s4-r0/BETA_HOSTING_DECISION_PACKAGE.md`
 * §6 prices the memory that would change that.
 *
 * What it does claim, and all it claims: after this completes, the corpus is in
 * the state the PASSING Gate-S1 run was measured in — and until it completes, the
 * deployment says so rather than serving an advocate the 6.5 s version.
 *
 * ── ORDER MATTERS, AND IT IS THE SCRIPT'S ORDER ─────────────────────────────
 *
 * The full-text path is exercised LAST so it is the most recently cached and the
 * last thing the kernel evicts. That ordering is not invented here: it is the
 * reasoning `scripts/lcc-r32b-prewarm.sh` already records, carried over rather
 * than re-derived.
 */
import type { Sql } from 'postgres';

import { logger } from '../logger.ts';

export type PrewarmState = 'cold' | 'warming' | 'warm' | 'failed';

export type PrewarmStatus = {
  readonly state: PrewarmState;
  /** Wall time of the pass that reached `warm`, or of the one that failed. */
  readonly durationMs: number | null;
  readonly completedAt: string | null;
  /** Why it failed, or which step is running. Never a secret, never a query plan. */
  readonly detail: string | null;
};

/**
 * How long a single warm step may take before the pass gives up on it.
 *
 * Generous, because this runs once at boot against a cold 250 GB corpus and the
 * whole point is to absorb slowness here rather than in front of an advocate.
 * Bounded, because a prewarm that never finishes is a deployment that never
 * becomes ready — which would turn a latency defect into an outage.
 */
export const PREWARM_STEP_TIMEOUT_MS = Number(process.env['PREWARM_STEP_TIMEOUT_MS'] ?? 120_000);

export type Prewarm = {
  status: () => PrewarmStatus;
  /**
   * Runs the pass. Safe to call more than once: a call while `warming` is a no-op
   * that returns the in-flight promise, so a restart storm cannot start six
   * concurrent passes against one cold database.
   */
  run: () => Promise<PrewarmStatus>;
};

export function createPrewarm(sql: Sql): Prewarm {
  let status: PrewarmStatus = { state: 'cold', durationMs: null, completedAt: null, detail: null };
  let inFlight: Promise<PrewarmStatus> | null = null;

  /**
   * Each step is a real read on the serving path, and each is named so a failure
   * says which one. Nothing here writes, and nothing is corpus-content specific:
   * the literals are structural, so an empty or partially restored corpus warms
   * what it has rather than erroring on a missing row.
   */
  const steps: { name: string; run: () => Promise<unknown> }[] = [
    {
      // Planner statistics and the small reference tables, cheapest first.
      name: 'reference',
      run: () => sql`SELECT count(*) FROM lexeme_document_frequency`,
    },
    {
      // The judgments heap and its btree access path, by the keys real requests use.
      name: 'judgments-btree',
      run: () => sql`
        SELECT id FROM judgments
         ORDER BY judgment_date DESC NULLS LAST
         LIMIT 500`,
    },
    {
      // Paragraph fetch, which is what the Reader does after a hit.
      name: 'paragraphs',
      run: () => sql`
        SELECT p.id
          FROM judgment_paragraphs p
          JOIN judgments j ON j.id = p.judgment_id
         LIMIT 500`,
    },
    {
      /**
       * LAST, deliberately. `judgments_full_text_idx` is 17.71 GB of GIN and the
       * `sparse` phase it serves was 3,190 ms of a 3,298 ms worst case at Gate C —
       * so it is both the biggest win and the thing that must be most recently
       * cached when the first advocate arrives.
       *
       * `plainto_tsquery` with ordinary words rather than a rare term: a rare
       * lexeme touches few posting lists and would warm almost nothing while
       * looking like it had worked.
       */
      name: 'full-text',
      run: () => sql`
        SELECT j.id
          FROM judgments j
         WHERE j.full_text_tsv @@ plainto_tsquery('english', 'bail application court order')
         LIMIT 200`,
    },
  ];

  async function pass(): Promise<PrewarmStatus> {
    const started = Date.now();
    status = { state: 'warming', durationMs: null, completedAt: null, detail: 'starting' };
    logger.info({ event: 'prewarm_started', steps: steps.length }, 'corpus prewarm started');

    for (const step of steps) {
      status = { ...status, detail: step.name };
      const stepStarted = Date.now();
      try {
        await withTimeout(step.run(), PREWARM_STEP_TIMEOUT_MS);
      } catch (error) {
        const detail = `${step.name}: ${error instanceof Error ? error.message : String(error)}`;
        status = {
          state: 'failed',
          durationMs: Date.now() - started,
          completedAt: new Date().toISOString(),
          detail,
        };
        /**
         * ERROR, not warn. A failed prewarm means this deployment will serve its
         * first advocate cold, and the whole point of N-4 is that nobody should
         * have to notice that by being told a search was slow.
         */
        logger.error(
          { event: 'prewarm_failed', step: step.name, err: error },
          'corpus prewarm failed',
        );
        return status;
      }
      logger.info(
        { event: 'prewarm_step', step: step.name, duration_ms: Date.now() - stepStarted },
        'corpus prewarm step finished',
      );
    }

    const durationMs = Date.now() - started;
    status = { state: 'warm', durationMs, completedAt: new Date().toISOString(), detail: null };
    logger.info({ event: 'prewarm_complete', duration_ms: durationMs }, 'corpus prewarm complete');
    return status;
  }

  return {
    status: () => status,
    run: () => {
      // A second caller joins the pass in flight rather than starting another.
      if (inFlight) return inFlight;
      inFlight = pass().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

/**
 * A step that hangs must fail the step, not the deployment.
 *
 * `postgres.js` has bitten this repository before with promises that never
 * settle — a query whose connection was recycled underneath it resolves never,
 * and a supervisor watching for an exit sees a perfectly healthy process doing
 * nothing. A prewarm in that state would hold readiness false forever, so the
 * timeout is what keeps a latency mechanism from becoming an outage.
 */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    /**
     * The timer is always cleared, including on the happy path — otherwise every
     * successful step would hold the event loop open for the remainder of its
     * 120 s budget, and a process that will not exit is its own kind of outage.
     *
     * The LOSING query is abandoned rather than cancelled, and that is acceptable
     * here and only here: every step is a read, so an abandoned one has nothing
     * to roll back, and the pool reclaims its connection on its own lifetime. The
     * step name is not needed — `pass()` prefixes it onto the error it records,
     * so the failure still says which step timed out.
     */
    if (timer) clearTimeout(timer);
  }
}
