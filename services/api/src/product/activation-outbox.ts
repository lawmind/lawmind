/**
 * ACTIVATION WRITES THAT SURVIVE MORE THAN THE REQUEST THAT MADE THEM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `recordStepInBackground` is `void promise.catch(onError)`. The request returns
 * immediately, which is right — a funnel write must never slow down or fail the
 * thing it is measuring. But nothing owned the promise afterwards, so R4 listed
 * it as a hidden risk: *"Activation writes can be lost on process exit."*
 *
 * On a deploy, a scale-in or a crash, every in-flight write is gone and NOTHING
 * COUNTS IT. That is the part that matters. A funnel with unmeasured loss cannot
 * carry a paywall experiment, because the difference between "this variant
 * converts worse" and "this variant's writes were dropped during a deploy" is
 * invisible in the numbers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, STATED HONESTLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A BOUNDED IN-PROCESS OUTBOX. Not a durable queue. It does three things the
 * bare `void` did not:
 *
 *   1. RETRIES a failed write, with backoff, instead of discarding it on the
 *      first transient error — which is what a connection blip during a
 *      deploy looks like.
 *   2. COUNTS every write it loses, by reason. Loss becomes a number rather
 *      than a silence.
 *   3. FLUSHES on shutdown, so the ordinary deploy — the common case — loses
 *      nothing at all.
 *
 * It does NOT survive `SIGKILL` or a power cut, and it must never be described
 * as if it does. The honest claim is a MEASURED loss bound, not durability. A
 * real durable outbox writes to the same transaction as the thing it is
 * measuring, and activation steps are recorded from read paths where there is no
 * transaction to join — that is a bigger change than the risk justifies today,
 * and this comment is here so the next person can weigh it rather than
 * rediscover it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY BOUNDED, AND WHY DROPPING IS A FEATURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * If the database is down, an unbounded queue grows until the process dies of
 * memory exhaustion — taking down the API to protect a funnel metric, which is
 * exactly the wrong trade. So the queue has a hard cap, and past it the OLDEST
 * entry is dropped and counted. A dropped activation event costs a data point.
 * An OOM costs every advocate mid-request.
 */
import type { Sql } from 'postgres';

import { recordStep, type ActivationStep } from './activation.ts';

/**
 * The cap. 2,000 events is minutes of launch traffic and a few MB at most —
 * each entry is a uuid, a short enum and a timestamp.
 */
export const OUTBOX_CAPACITY = 2_000;

/** Attempts per event before it is abandoned and counted as lost. */
export const MAX_ATTEMPTS = 4;

/** Backoff between drain passes, ms. Doubles on failure, resets on success. */
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 30_000;

type Entry = {
  userId: string;
  step: ActivationStep;
  attempts: number;
};

export type OutboxStats = {
  /** Waiting to be written. */
  queued: number;
  /** Written successfully since process start. */
  delivered: number;
  /** Lost because the queue was full. The database was probably fine. */
  droppedForCapacity: number;
  /** Lost because the write kept failing. The database was probably not fine. */
  droppedAfterRetries: number;
  /** Total loss, which is the number an experiment must be read against. */
  lost: number;
  /** Whether a drain is currently in flight. */
  draining: boolean;
  lastError: string | null;
};

export class ActivationOutbox {
  readonly #queue: Entry[] = [];
  #delivered = 0;
  #droppedForCapacity = 0;
  #droppedAfterRetries = 0;
  #draining = false;
  #backoff = BASE_BACKOFF_MS;
  #lastError: string | null = null;
  #timer: NodeJS.Timeout | undefined;
  #stopped = false;

  constructor(
    private readonly sql: Sql,
    private readonly capacity = OUTBOX_CAPACITY,
  ) {}

  /**
   * Enqueue and return. NEVER throws, never awaits the database, and never
   * blocks the request that triggered it — the whole point of the original
   * `void` call, kept.
   */
  enqueue(userId: string, step: ActivationStep): void {
    if (this.#stopped) return;
    if (this.#queue.length >= this.capacity) {
      /**
       * Drop the OLDEST, not the newest.
       *
       * If the database has been unreachable for a while, the head of the queue
       * is the stalest data and the tail is what is happening now. Keeping the
       * tail means the funnel is at worst missing an old window rather than
       * missing the present, which is the window anyone is actually looking at.
       */
      this.#queue.shift();
      this.#droppedForCapacity += 1;
    }
    this.#queue.push({ userId, step, attempts: 0 });
    this.#schedule(0);
  }

  #schedule(delayMs: number): void {
    if (this.#stopped || this.#timer || this.#draining) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.drain();
    }, delayMs);
    /* Must not hold the process open on its own. A pending funnel write is not
     * a reason for `node` to refuse to exit. */
    this.#timer.unref?.();
  }

  /**
   * Write everything currently queued, one at a time.
   *
   * Serial rather than batched, deliberately: `recordStep` is an
   * `ON CONFLICT DO NOTHING` insert of a single row, so a batch would save one
   * round trip per event and cost the ability to retry ONE failing event
   * without replaying its neighbours.
   */
  async drain(): Promise<void> {
    if (this.#draining || this.#stopped) return;
    this.#draining = true;
    try {
      while (this.#queue.length > 0) {
        const entry = this.#queue[0]!;
        try {
          await recordStep(this.sql, entry.userId, entry.step);
          this.#queue.shift();
          this.#delivered += 1;
          this.#backoff = BASE_BACKOFF_MS;
          this.#lastError = null;
        } catch (error) {
          entry.attempts += 1;
          this.#lastError = error instanceof Error ? error.message : String(error);
          if (entry.attempts >= MAX_ATTEMPTS) {
            this.#queue.shift();
            this.#droppedAfterRetries += 1;
            continue;
          }
          /* Stop the pass rather than spinning through a queue that will fail
           * the same way for the same reason. Back off and come back. */
          this.#backoff = Math.min(this.#backoff * 2, MAX_BACKOFF_MS);
          this.#schedule(this.#backoff);
          return;
        }
      }
    } finally {
      this.#draining = false;
    }
  }

  /**
   * Called on shutdown. Drains what is queued, once, with a deadline.
   *
   * The deadline matters: a shutdown that waits indefinitely for a database that
   * is already gone turns a clean deploy into a hung one. Anything still queued
   * when the deadline passes is counted as lost, which is the honest outcome and
   * the number an experiment should be read against.
   */
  async flush(deadlineMs = 5_000): Promise<OutboxStats> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    await Promise.race([
      this.drain(),
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, deadlineMs);
        t.unref?.();
      }),
    ]);
    this.#stopped = true;
    const remaining = this.#queue.length;
    if (remaining > 0) {
      this.#droppedAfterRetries += remaining;
      this.#queue.length = 0;
    }
    return this.stats();
  }

  stats(): OutboxStats {
    return {
      queued: this.#queue.length,
      delivered: this.#delivered,
      droppedForCapacity: this.#droppedForCapacity,
      droppedAfterRetries: this.#droppedAfterRetries,
      lost: this.#droppedForCapacity + this.#droppedAfterRetries,
      draining: this.#draining,
      lastError: this.#lastError,
    };
  }
}
