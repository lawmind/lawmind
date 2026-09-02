import { useCallback, useRef } from 'react';

import { newAttemptKey } from '../api/attempt';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE SUBMIT, ONE ATTEMPT — AND THE LATCH IS SYNCHRONOUS BECAUSE A TAP IS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY `useState` IS NOT ENOUGH, AND `disabled` IS NOT A GUARD.
 *
 * `setSaving(true)` schedules a state update; React commits it on a later tick
 * and re-renders the button after that. Two taps landing in the same frame both
 * read the OLD `saving`, both pass the check, and both fire the request. The
 * `disabled` prop is downstream of the same commit, so it is equally late. On a
 * mid-range Android in a court corridor — where a slow frame is the ordinary
 * case, not the edge — the window is wide enough to hit by accident.
 *
 * A `useRef` write is synchronous. It is true on the very next statement, in the
 * same tick, before any `await`. That is the only thing that can make "two taps
 * are one logical mutation" a property rather than a hope.
 *
 * SO THE LATCH IS TAKEN AT THE TOP OF THE SUBMIT PATH, before validation, before
 * any state transition and before the first `await`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE KEY'S LIFETIME, WHICH IS NOT THE LATCH'S
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The latch is held for the duration of ONE in-flight request. The KEY outlives
 * it, and deliberately: R16 §6 says keep it across auth-refresh replay,
 * transport retry, lost-response recovery, navigation re-entry and the explicit
 * retry button, and discard it only on a definitive success or an explicit
 * cancellation.
 *
 *   begin()     takes the latch and returns the key, minting one on the first
 *               submit of this logical mutation. Returns `null` when a request
 *               is already in flight — that caller must do nothing at all.
 *   settle()    releases the latch and KEEPS the key. The failure path: the
 *               advocate may correct the form and press Save again, and R16 §5
 *               guarantees a validation failure did not consume the key.
 *   complete()  releases the latch and DISCARDS the key. The next submit is a
 *               new intentional mutation and gets a new key — even when every
 *               field is identical, because the server does not deduplicate by
 *               content and two deliberate writes are two rows by design.
 *
 * IT CLAIMS NO CROSS-PROCESS DURABILITY. This lives in a component ref. A cold
 * start loses it, and for these flows that is correct: none of them has a
 * cold-restart retry path, so there is nothing for a persisted key to be reused
 * BY. The two annotation flows that DO persist their pending payload carry their
 * key on the persisted record instead — see `state/reading.ts` and
 * `state/pendingSave.ts`. Nothing here pretends otherwise.
 */
export type Attempt = {
  /** The key for this attempt, or `null` when one is already in flight. */
  begin: () => string | null;
  /** Release the latch, keep the key. The retryable failure path. */
  settle: () => void;
  /** Release the latch and discard the key. Definitive success, or cancellation. */
  complete: () => void;
  /** True while a request is in flight. Read-only, and never the guard itself. */
  inFlight: () => boolean;
};

export function useAttempt(): Attempt {
  const key = useRef<string | null>(null);
  const running = useRef(false);

  const begin = useCallback(() => {
    // SYNCHRONOUS. Both halves of this happen before the caller's next
    // statement, which is the whole reason this is a ref and not state.
    if (running.current) return null;
    running.current = true;
    key.current ??= newAttemptKey();
    return key.current;
  }, []);

  const settle = useCallback(() => {
    running.current = false;
  }, []);

  const complete = useCallback(() => {
    running.current = false;
    key.current = null;
  }, []);

  const inFlight = useCallback(() => running.current, []);

  return { begin, settle, complete, inFlight };
}
