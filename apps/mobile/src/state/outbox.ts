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
 * Give up re-sending after this many attempts, but NEVER DROP THE ENTRY. It
 * stays queued and stays counted: a copy we failed to record is precisely the
 * thing we must not quietly forget, and the count is what makes it visible.
 */
const MAX_ATTEMPTS = 8;

export type PendingCopy = CitationCopy & {
  attempts: number;
  /** Set on the last failure, for diagnosis. Never shown to an advocate. */
  lastError?: string;
};

type OutboxState = {
  pending: PendingCopy[];
  hydrated: boolean;
  flushing: boolean;

  hydrate: () => Promise<void>;
  /** Queues the record and returns immediately. Never throws, never blocks. */
  enqueue: (copy: CitationCopy) => Promise<void>;
  flush: () => Promise<void>;
  /** Age in ms of the oldest unsent copy, or null when the queue is empty. */
  oldestPendingAge: (now?: number) => number | null;
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
      const failures = new Map<string, string>();

      for (const entry of queue) {
        if (entry.attempts >= MAX_ATTEMPTS) continue;

        const res = await api.recordCitationCopy({
          judgmentId: entry.judgmentId,
          matterId: entry.matterId,
          citationCheckId: entry.citationCheckId,
          surface: entry.surface,
          copiedAt: entry.copiedAt,
          clientKey: entry.clientKey,
        });

        if (res.ok) sent.add(entry.clientKey);
        else failures.set(entry.clientKey, res.error.message);
      }

      const next = get()
        .pending.filter((p) => !sent.has(p.clientKey))
        .map((p) =>
          failures.has(p.clientKey)
            ? { ...p, attempts: p.attempts + 1, lastError: failures.get(p.clientKey) }
            : p
        );

      set({ pending: next });
      await persist(next);
    } finally {
      set({ flushing: false });
    }
  },

  oldestPendingAge: (now = Date.now()) => {
    const times = get()
      .pending.map((p) => new Date(p.copiedAt).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return null;
    return now - Math.min(...times);
  },
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
