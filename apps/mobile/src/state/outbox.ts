import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { api } from '../api/client';
import type { CitationCopy } from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COPY OUTBOX — LOCAL FIRST, AND HONEST ABOUT WHAT HAS NOT LEFT.
 *
 * `SCHEMA_TRUTH.md#citation_copies`: "Copy works offline, so the write queues
 * through the outbox with an idempotency key like every other local-first
 * write. A copy that never syncs is a citation we cannot warn about — COUNT
 * OUTBOX AGE HERE, DO NOT ASSUME DELIVERY."
 *
 * Why this matters more than a normal retry queue: `citation_copies` exists for
 * exactly one purpose, which is to reach an advocate when an authority they
 * took out of the app is later overruled. A copy sitting unsent in this queue
 * is not a delayed analytics event — it is an advocate the fan-out cannot see.
 * The oldest pending entry is therefore a number worth surfacing, not a
 * detail to swallow.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: block the clipboard. The advocate's copy
 * succeeds instantly and offline; the record follows. Making the paste wait on
 * a network write would trade the thing they asked for against the thing we
 * want, in a court building with no signal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const STORAGE_KEY = 'lawmind.outbox.citationCopies.v1';

/**
 * Give up RE-SENDING after this many attempts, but NEVER DROP THE ENTRY. It
 * stays queued and stays counted: a copy we failed to record is precisely the
 * thing we must not quietly forget, and the count is what makes it visible.
 *
 * "Give up re-sending" is not the same claim as "keep retrying forever" —
 * founder correction, 22 Aug 2026. A permanently-failing mutation (the
 * judgment was deleted, or a malformed payload the server will always reject)
 * gains nothing from eight identical attempts spread over days; it is marked
 * `dead` on its FIRST failure instead, below.
 */
const MAX_ATTEMPTS = 8;

/**
 * Not every failure means "try again later". `error.code` is the server's own
 * word for what went wrong (`services/api/src/validate.ts`,
 * `citations/copies.ts`) — the same classification `docs/CURRENT_PLAN.md`'s
 * founder correction asked this queue to make explicit:
 *
 *   RETRYABLE          — `network`/`timeout` (this device's connection), or a
 *                         code this client does not recognise yet. The safe
 *                         default is "might still succeed", not "give up".
 *   NON_RETRYABLE       — `INVALID_REQUEST` (malformed payload — retrying sends
 *                         the same bytes to the same rejection) or `NOT_FOUND`
 *                         (the judgment this copy names no longer exists —
 *                         no replay makes that row reappear).
 *   AUTH_RECOVERABLE    — `AUTH_REQUIRED` reaching HERE means `client.ts`'s own
 *                         refresh-once already failed (`request()`), so the
 *                         session is gone. Retrying the same request cannot
 *                         fix that; only a fresh sign-in can. Treated as
 *                         retryable-but-capped rather than immediately dead,
 *                         because the advocate signing back in is exactly the
 *                         event that makes the NEXT attempt succeed.
 *
 * `CONFLICT_REQUIRES_USER` has no member here: `copies.ts`'s own comment says
 * a replayed copy is folded into a success (`ON CONFLICT ... DO UPDATE`)
 * rather than answered with a 409, precisely so this queue never needs it.
 */
type FailureClass = 'RETRYABLE' | 'NON_RETRYABLE' | 'AUTH_RECOVERABLE';

function classify(code: string | undefined): FailureClass {
  if (code === 'INVALID_REQUEST' || code === 'NOT_FOUND') return 'NON_RETRYABLE';
  if (code === 'AUTH_REQUIRED') return 'AUTH_RECOVERABLE';
  return 'RETRYABLE';
}

export type PendingCopy = CitationCopy & {
  attempts: number;
  /** Set on the last failure, for diagnosis. Never shown to an advocate. */
  lastError?: string;
  /**
   * Present only once this entry will NEVER be retried again — either a
   * `NON_RETRYABLE` failure on its first attempt, or `RETRYABLE`/
   * `AUTH_RECOVERABLE` exhausting `MAX_ATTEMPTS`. Absent means still active.
   * `oldestPendingAge` excludes dead entries deliberately: their age growing
   * forever would say nothing actionable, unlike a genuinely pending one.
   */
  dead?: true;
};

type OutboxState = {
  pending: PendingCopy[];
  hydrated: boolean;
  flushing: boolean;

  hydrate: () => Promise<void>;
  /** Queues the record and returns immediately. Never throws, never blocks. */
  enqueue: (copy: CitationCopy) => Promise<void>;
  flush: () => Promise<void>;
  /**
   * Age in ms of the oldest ACTIVE unsent copy, or null when nothing is still
   * being retried. Deliberately excludes `dead` entries: their age growing
   * forever would say nothing actionable, unlike a genuinely pending one that
   * still might succeed on the next flush.
   */
  oldestPendingAge: (now?: number) => number | null;
  /** How many entries will never be retried again. See `PendingCopy.dead`. */
  deadCount: () => number;
};

async function persist(pending: PendingCopy[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // A failed persist must not take the app down. The entry survives in
    // memory for this session; the count still reflects it.
  }
}

export const useOutbox = create<OutboxState>((set, get) => ({
  pending: [],
  hydrated: false,
  flushing: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      set({ pending: Array.isArray(parsed) ? (parsed as PendingCopy[]) : [], hydrated: true });
    } catch {
      set({ pending: [], hydrated: true });
    }
  },

  enqueue: async (copy) => {
    /**
     * `clientKey` IS THE IDEMPOTENCY KEY AND IT IS DEDUPED HERE TOO.
     *
     * The server's unique constraint is the real guarantee, but a double tap
     * that queues two identical entries would also retry twice and count twice
     * locally — so the queue refuses the duplicate rather than relying on the
     * far end to absorb it.
     */
    const already = get().pending.some((p) => p.clientKey === copy.clientKey);
    if (already) return;

    const pending = [...get().pending, { ...copy, attempts: 0 }];
    set({ pending });
    await persist(pending);
    void get().flush();
  },

  flush: async () => {
    if (get().flushing) return;
    set({ flushing: true });

    try {
      // Snapshot: entries queued mid-flush are picked up by the next run
      // rather than mutating the list being walked.
      const queue = [...get().pending];
      const sent = new Set<string>();
      const failures = new Map<string, { message: string; class: FailureClass }>();

      for (const entry of queue) {
        // Already known to never succeed, or exhausted its retryable budget.
        if (entry.dead || entry.attempts >= MAX_ATTEMPTS) continue;

        const res = await api.recordCitationCopy({
          judgmentId: entry.judgmentId,
          matterId: entry.matterId,
          citationCheckId: entry.citationCheckId,
          surface: entry.surface,
          copiedAt: entry.copiedAt,
          clientKey: entry.clientKey,
        });

        if (res.ok) sent.add(entry.clientKey);
        else failures.set(entry.clientKey, { message: res.error.message, class: classify(res.error.code) });
      }

      const next = get()
        .pending.filter((p) => !sent.has(p.clientKey))
        .map((p) => {
          const failure = failures.get(p.clientKey);
          if (!failure) return p;
          const attempts = p.attempts + 1;
          /**
           * NON_RETRYABLE dies on its FIRST failure — no number of identical
           * attempts changes a payload the server will always reject, or
           * brings back a judgment that no longer exists. RETRYABLE and
           * AUTH_RECOVERABLE still get their full budget, because a network
           * blip clearing or the advocate signing back in are both real
           * reasons the very next attempt could succeed.
           */
          const dead: true | undefined =
            failure.class === 'NON_RETRYABLE' || attempts >= MAX_ATTEMPTS ? true : undefined;
          return { ...p, attempts, lastError: failure.message, dead };
        });

      set({ pending: next });
      await persist(next);
    } finally {
      set({ flushing: false });
    }
  },

  oldestPendingAge: (now = Date.now()) => {
    const times = get()
      .pending.filter((p) => !p.dead)
      .map((p) => new Date(p.copiedAt).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return null;
    return now - Math.min(...times);
  },

  deadCount: () => get().pending.filter((p) => p.dead).length,
}));

/**
 * A key that is stable for one tap and unique across taps.
 *
 * Deliberately NOT a hash of the copy's contents: an advocate who copies the
 * same citation twice, a week apart, has done two separate things and the
 * fan-out should know about both. It is the double tap within one action that
 * must collapse, and that is what a per-tap key gives.
 */
export function newClientKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
