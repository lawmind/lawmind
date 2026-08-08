import { useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { api } from '../api/client';

/**
 * READING PROGRESS AND HIGHLIGHTS — PD-9, items 3 and 6.
 *
 * OFFLINE IS A REQUIREMENT, NOT AN EDGE CASE. Court buildings have terrible
 * connectivity, and the moment an advocate most wants to reopen a judgment at
 * the paragraph they stopped at is the moment they are standing in one. This
 * writes to the device first and does not wait on, or care about, the network.
 *
 * Progress is kept PER JUDGMENT, not as one global position — an advocate works
 * several matters at once and returning to the wrong paragraph in the right
 * judgment is as bad as losing the place entirely.
 *
 * Why a storage dependency at all: there is no platform KV on React Native, and
 * `expo-secure-store` is the wrong tool — it is an encrypted keychain for
 * secrets, capped at a few KB per value. A reading position is neither secret
 * nor small once highlights are in it. `@react-native-async-storage/async-storage`
 * is the Expo-supported default and adds no vendor and no bill.
 */

export type Highlight = {
  judgmentId: string;
  paragraphIndex: number;
  paragraphNumber: number;
  /** The exact run the advocate marked, so it can be re-found if the text reflows. */
  text: string;
  savedAt: string;
  /** Set when the passage was saved into a matter, per PD-9 item 3. */
  matterId?: string;
  /** Set once `POST /judgments/:id/annotations` confirms the write. Absent means not yet synced. */
  annotationId?: string;
};

type ReadingState = {
  /** judgmentId → the last paragraph NUMBER read. Not an index. */
  progress: Record<string, { paragraphNumber: number; at: string }>;
  highlights: Highlight[];
  /** Body size in px. The advocate sets it once; every judgment honours it. */
  textSize: number;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setProgress: (judgmentId: string, paragraphNumber: number) => void;
  /**
   * Writes locally FIRST, unconditionally — a court corridor has no signal
   * and the highlight must land instantly regardless. The server write
   * follows, fire-and-forget from the caller's point of view but awaited
   * here so a `matterId` attach can be told apart from a bare save.
   *
   * Returns the server's refusal message on `AUTHORITY_SET_ASIDE` — the one
   * case where the highlight itself still lands (locally and server-side,
   * without the matter) but the matter attachment does not. The caller
   * decides how to surface that; the store's job stops at reporting it
   * honestly rather than silently dropping the matter link.
   */
  addHighlight: (highlight: Highlight) => Promise<{ ok: true } | { ok: false; message: string }>;
  setTextSize: (px: number) => void;
};

const KEY = 'lawmind.reading.v1';

/** 17px is the `holding` row of the scale and the reading default. */
export const TEXT_SIZE_MIN = 16;
export const TEXT_SIZE_MAX = 24;
export const TEXT_SIZE_DEFAULT = 17;

type Persisted = Pick<ReadingState, 'progress' | 'highlights' | 'textSize'>;

/**
 * Writes are fire-and-forget and DELIBERATELY NOT AWAITED at the call site: a
 * paragraph scrolling past must never wait on a disk write. A dropped write
 * costs one paragraph of position; a blocked scroll costs the reading view.
 */
function persist(s: Persisted) {
  void AsyncStorage.setItem(
    KEY,
    JSON.stringify({ progress: s.progress, highlights: s.highlights, textSize: s.textSize })
  );
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  progress: {},
  highlights: [],
  textSize: TEXT_SIZE_DEFAULT,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        set({
          progress: parsed.progress ?? {},
          highlights: parsed.highlights ?? [],
          textSize: parsed.textSize ?? TEXT_SIZE_DEFAULT,
        });
      }
    } catch {
      // A corrupt or absent store is not an error worth showing anyone. The
      // advocate loses their place, which is recoverable; a crash on open is not.
    }
    set({ hydrated: true });
  },

  setProgress: (judgmentId, paragraphNumber) => {
    // Scrolling fires this on every viewable change. Writing an identical
    // position would publish a new store snapshot per frame, which is a render
    // loop, not a saved place.
    if (get().progress[judgmentId]?.paragraphNumber === paragraphNumber) return;
    const next = {
      ...get().progress,
      [judgmentId]: { paragraphNumber, at: new Date().toISOString() },
    };
    set({ progress: next });
    persist({ ...get(), progress: next });
  },

  addHighlight: async (highlight) => {
    const next = [...get().highlights, highlight];
    set({ highlights: next });
    persist({ ...get(), highlights: next });

    const res = await api.createAnnotation(highlight.judgmentId, {
      paragraphNumber: highlight.paragraphNumber,
      paragraphIndex: highlight.paragraphIndex,
      quote: highlight.text,
      matterId: highlight.matterId,
    });

    if (res.ok) {
      const withId = get().highlights.map((h) =>
        h === highlight ? { ...h, annotationId: res.data.annotation.annotationId } : h
      );
      set({ highlights: withId });
      persist({ ...get(), highlights: withId });
      return { ok: true };
    }

    /**
     * `AUTHORITY_SET_ASIDE` is the one refusal that changes what stays saved
     * locally: the passage itself is fine, the matter link is not. Every
     * other failure (offline, timeout, 401) leaves the local highlight and
     * its `matterId` exactly as the advocate set them — there is nothing
     * dishonest about a highlight that has not synced yet, and stripping the
     * matter on a network blip would silently undo a real choice.
     */
    if (res.error.code === 'AUTHORITY_SET_ASIDE' && highlight.matterId) {
      const stripped = get().highlights.map((h) =>
        h === highlight ? { ...h, matterId: undefined } : h
      );
      set({ highlights: stripped });
      persist({ ...get(), highlights: stripped });
    }

    return { ok: false, message: res.error.message };
  },

  setTextSize: (px) => {
    const clamped = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(px)));
    set({ textSize: clamped });
    persist({ ...get(), textSize: clamped });
  },
}));

/**
 * WORDS PER SCREEN, NOT A POINT VALUE.
 *
 * "17px" means nothing to an advocate at 11pm; "about 620 words a screen" is
 * the number they actually care about, because it tells them how often they
 * will have to move their thumb. Derived from the measure at that size rather
 * than stored. `renders/62-judgment-reading@2x.png` panel 2.
 */
export function wordsPerScreen(textSizePx: number, screenHeightPx = 700): number {
  const lineHeight = textSizePx * 1.68;
  const linesPerScreen = Math.floor(screenHeightPx / lineHeight);
  /** ~9 words a line at a 60–68 character measure. */
  return Math.round((linesPerScreen * 9) / 10) * 10;
}

/**
 * SELECT THE ARRAY, FILTER OUTSIDE THE SELECTOR.
 *
 * `useStore(s => s.highlights.filter(...))` returns a NEW array identity on
 * every read. Zustand compares with `Object.is`, so every store update — including
 * one this component caused — looks like a change, re-renders, and produces
 * another new array. That is an infinite update loop, and it is not obvious
 * from reading the call site, which is why the filtering lives here.
 */
export const useHighlightsFor = (judgmentId: string): Highlight[] => {
  const highlights = useReadingStore((s) => s.highlights);
  return useMemo(
    () => highlights.filter((h) => h.judgmentId === judgmentId),
    [highlights, judgmentId]
  );
};
