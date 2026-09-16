import { useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { INVALID_IDEMPOTENCY_KEY, newAttemptKey, runAttempt } from '../api/attempt';
import { api } from '../api/client';
import { EXCERPT_TOO_LONG_COPY, isSendableQuote } from '../screens/judgment/excerpt';

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
  /**
   * NULL IS A REAL, COMMON ANSWER — and this type said `number` until
   * 11 Aug 2026, which made a whole class of judgment unsaveable.
   *
   * `annotationBody` in `services/api/src/judgments/annotations.ts` types it
   * `.nullable()` and says why: "Null on an unnumbered judgment." Pre-1990s
   * scans lost their numbering and a headnote never had one — the same
   * population that carries no citation. The server has always accepted the
   * write; the client refused to make it.
   *
   * `paragraphIndex` is what identifies the paragraph when there is no number,
   * which is why the server takes both and why nothing here may key on the
   * number alone.
   */
  paragraphNumber: number | null;
  /** The exact run the advocate marked, so it can be re-found if the text reflows. */
  text: string;
  savedAt: string;
  /** Set when the passage was saved into a matter, per PD-9 item 3. */
  matterId?: string;
  /** Set once `POST /judgments/:id/annotations` confirms the write. Absent means not yet synced. */
  annotationId?: string;
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * R16. THE ATTEMPT KEY, PERSISTED BECAUSE THE PAYLOAD ALREADY IS.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * A highlight with no `annotationId` is a pending write, held in AsyncStorage
   * and surviving a cold start — see `syncAnnotations`, population 1. That means
   * the retry can outlive the process, which is exactly the case an in-memory
   * key cannot cover: a new key on a new launch executes a second insert of a
   * row that may already have committed.
   *
   * So the key lives on the record. It is minted when the highlight is made,
   * written with it, and reused by every retry of THAT highlight. It is dropped
   * once `annotationId` arrives: the write is done, and a key kept past its
   * mutation is only a way to get a `409` later.
   *
   * NOTHING SENSITIVE IS ADDED HERE. The quote is already persisted; this is 26
   * characters of opaque identifier beside it, and no new body reaches storage.
   */
  attemptKey?: string;
};

type ReadingState = {
  /** judgmentId → the last paragraph NUMBER read. Not an index. */
  progress: Record<string, { paragraphNumber: number; at: string }>;
  highlights: Highlight[];
  /** Body size in px. The advocate sets it once; every judgment honours it. */
  textSize: number;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /**
   * PULL THIS JUDGMENT'S HIGHLIGHTS BACK FROM THE SERVER.
   *
   * `GET /judgments/:id/annotations` has existed as long as the write has, and
   * nothing called it until 11 Aug 2026 — so highlights were device-local in
   * practice. An advocate who reinstalled, changed phone, or cleared the app
   * saw an empty judgment while the server held every passage they had ever
   * marked. The write synced; the read did not exist.
   *
   * Deliberately per judgment rather than a global sync: the reader already
   * knows which judgment is open, and pulling an entire annotation history on
   * launch is a lot of work in a court basement to render one screen.
   */
  syncAnnotations: (judgmentId: string) => Promise<void>;
  /**
   * TAKE A HIGHLIGHT BACK OFF. `DELETE /annotations/:annotationId`.
   *
   * The route has existed as long as the write, with no caller and no local
   * remove either — so a highlight was permanent once made, and an advocate who
   * marked the wrong paragraph was stuck with it. The third write-only path on
   * this feature, after the save that never synced back and the list that was
   * never read.
   *
   * Removes locally FIRST, like every other write in this store: the advocate
   * asked, and a court corridor has no signal. An unsynced highlight (no
   * `annotationId`) never existed server-side and needs no call at all.
   */
  removeHighlight: (highlight: Highlight) => Promise<void>;
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

/** Refusals no retry can change. See the rollback in `addHighlight`. */
const DETERMINISTIC_REFUSALS = new Set(['INVALID_REQUEST', INVALID_IDEMPOTENCY_KEY]);

/**
 * The server's validator speaks zod (`quote: String must contain at most 4000
 * character(s)`). An advocate is told what happened and what to do instead.
 */
function refusalCopy(serverMessage: string): string {
  if (/^quote\b/.test(serverMessage)) {
    return `This passage was not saved. ${EXCERPT_TOO_LONG_COPY}`;
  }
  return 'This passage was not saved — Lawmind could not accept it. Nothing was highlighted.';
}

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
        const loaded = parsed.highlights ?? [];
        /*
          A PENDING WRITE THE SERVER CAN NEVER ACCEPT IS NOT PENDING. The store
          before RCC R28 kept refused whole-paragraph saves (> 4,000) — found on
          the S24 as six 5,458-character copies of 2022 INSC 690 ¶2, tinting a
          passage the server never stored. The rollback stops new ones; this
          clears the ones already on a device. A sendable pending write is an
          undisproved offline save and stays.
        */
        const highlights = loaded.filter((h) => h.annotationId || isSendableQuote(h.text));
        set({
          progress: parsed.progress ?? {},
          highlights,
          textSize: parsed.textSize ?? TEXT_SIZE_DEFAULT,
        });
        if (highlights.length !== loaded.length) persist({ ...get(), highlights });
      }
    } catch {
      // A corrupt or absent store is not an error worth showing anyone. The
      // advocate loses their place, which is recoverable; a crash on open is not.
    }
    set({ hydrated: true });
  },

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * MERGE, NEVER REPLACE. The local list is the advocate's, and some of it has
   * not reached the server yet.
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Three populations meet here and each needs a different answer:
   *
   *   1. A local highlight with NO `annotationId` is a pending write — saved
   *      in a court corridor with no signal. Replacing the list with the
   *      server's would delete it, which is the one outcome this store exists
   *      to prevent. It survives untouched.
   *   2. A local highlight that MATCHES a server row is the same passage seen
   *      twice. It adopts the server's id rather than appearing twice: a
   *      pending write that actually landed, and whose response we never saw,
   *      is otherwise indistinguishable from a second highlight of the same
   *      words.
   *   3. A server row with no local match is a highlight from another device
   *      or a reinstall. It joins the list — that is the whole point.
   *
   * MATCHED ON `paragraphIndex` + `quote`, not on the printed number: the
   * number is null on every paragraph of an unnumbered judgment, so matching
   * on it would fold all of them into one.
   *
   * A FAILED FETCH CHANGES NOTHING. Offline is the design case, and an empty
   * screen would be a worse answer than a stale one.
   */
  syncAnnotations: async (judgmentId) => {
    const res = await api.annotations(judgmentId);
    if (!res.ok) return;

    const local = get().highlights;
    const localForJudgment = local.filter((h) => h.judgmentId === judgmentId);
    const keyOf = (paragraphIndex: number, quote: string) => `${paragraphIndex} ${quote}`;
    const seen = new Set(localForJudgment.map((h) => keyOf(h.paragraphIndex, h.text)));

    const adopted = local.map((h) => {
      if (h.judgmentId !== judgmentId || h.annotationId) return h;
      const match = res.data.annotations.find(
        (a) => a.paragraphIndex === h.paragraphIndex && a.quote === h.text
      );
      /*
        POPULATION 2 — a pending write that actually landed and whose response we
        never saw. It adopts the server's id AND drops its attempt key: the
        mutation is done, so nothing should ever replay that key again.
      */
      return match ? { ...h, annotationId: match.annotationId, attemptKey: undefined } : h;
    });

    const incoming: Highlight[] = res.data.annotations
      .filter((a) => !seen.has(keyOf(a.paragraphIndex, a.quote)))
      .map((a) => ({
        judgmentId: a.judgmentId,
        paragraphIndex: a.paragraphIndex,
        paragraphNumber: a.paragraphNumber,
        text: a.quote,
        savedAt: a.createdAt,
        annotationId: a.annotationId,
        ...(a.matterId ? { matterId: a.matterId } : {}),
      }));

    if (incoming.length === 0 && adopted.every((h, i) => h === local[i])) return;

    const next = [...adopted, ...incoming];
    set({ highlights: next });
    persist({ ...get(), highlights: next });
  },

  /**
   * LOCAL FIRST, AND THE SERVER'S REFUSAL DOES NOT PUT IT BACK.
   *
   * The delete is soft and owner-scoped server-side, so the only failures
   * reachable here are a network one or a `404` for a row already gone. Neither
   * is a reason to resurrect a highlight the advocate has just removed: undoing
   * their action because a request timed out is a worse answer than a row that
   * stays deleted locally and is re-deleted on the next sync attempt.
   *
   * A highlight with no `annotationId` never reached the server. There is
   * nothing to delete and no call is made — asking would 404 on an id we do not
   * have.
   */
  removeHighlight: async (highlight) => {
    const next = get().highlights.filter((h) => h !== highlight);
    set({ highlights: next });
    persist({ ...get(), highlights: next });

    if (!highlight.annotationId) return;
    await api.deleteAnnotation(highlight.annotationId);
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
    /*
      THE BOUNDARY GUARD — NEW3 R24, `EXACT_USER_SELECTED_EXCERPT`. The reader
      only ever hands this a sendable quote; if an impossible one arrives, it is
      refused HERE, before a local tint and before a request. Never shortened:
      a truncated quote is a different passage.
    */
    if (!isSendableQuote(highlight.text)) {
      return { ok: false, message: EXCERPT_TOO_LONG_COPY };
    }
    /*
      THE KEY IS MINTED WITH THE HIGHLIGHT AND PERSISTED WITH IT. `??=` rather
      than always minting: a highlight arriving here a second time — a retry, or
      a rehydrated pending write — is the SAME intentional annotation and must
      present the SAME key. A fresh key on a retry is how one passage becomes two
      permanent rows.
    */
    const held: Highlight = { ...highlight, attemptKey: highlight.attemptKey ?? newAttemptKey() };
    const next = [...get().highlights, held];
    set({ highlights: next });
    persist({ ...get(), highlights: next });

    const res = await runAttempt(held.attemptKey!, (key) =>
      api.createAnnotation(
        held.judgmentId,
        {
          paragraphNumber: held.paragraphNumber,
          paragraphIndex: held.paragraphIndex,
          quote: held.text,
          matterId: held.matterId,
        },
        key,
      ),
    );

    if (res.ok) {
      /*
        THE KEY IS DROPPED AT THE SAME MOMENT `annotationId` ARRIVES. The write
        is durable; a key kept past its own mutation can only earn a `409` if
        anything ever replayed it.
      */
      const withId = get().highlights.map((h) =>
        h === held
          ? { ...h, annotationId: res.data.annotation.annotationId, attemptKey: undefined }
          : h
      );
      set({ highlights: withId });
      persist({ ...get(), highlights: withId });
      return { ok: true };
    }

    /**
     * A DETERMINISTIC REFUSAL DISPROVES THE HIGHLIGHT — rolled back, not held.
     *
     * Offline-first holds a pending write because nothing has said it failed.
     * `INVALID_REQUEST` says exactly that: this payload will be refused on every
     * retry. Keeping it would tint a passage the server never stored and keep a
     * key that can only repeat the refusal. `INVALID_IDEMPOTENCY_KEY` is the same
     * shape — the key itself was refused and nothing was created.
     *
     * Deliberately NOT every 4xx: `AUTHORITY_SET_ASIDE` has its own rule below,
     * and a `409` key-reuse mismatch may sit beside a row that did commit.
     */
    if (DETERMINISTIC_REFUSALS.has(res.error.code)) {
      const rolledBack = get().highlights.filter((h) => h !== held);
      set({ highlights: rolledBack });
      persist({ ...get(), highlights: rolledBack });
      return { ok: false, message: refusalCopy(res.error.message) };
    }

    /**
     * `AUTHORITY_SET_ASIDE` is the one refusal that changes what stays saved
     * locally: the passage itself is fine, the matter link is not. Every
     * other failure (offline, timeout, 401) leaves the local highlight and
     * its `matterId` exactly as the advocate set them — there is nothing
     * dishonest about a highlight that has not synced yet, and stripping the
     * matter on a network blip would silently undo a real choice.
     */
    if (res.error.code === 'AUTHORITY_SET_ASIDE' && held.matterId) {
      const stripped = get().highlights.map((h) =>
        h === held ? { ...h, matterId: undefined, attemptKey: h.attemptKey } : h
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
