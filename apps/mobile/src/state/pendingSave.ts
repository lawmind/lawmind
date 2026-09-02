import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { newAttemptKey, runAttempt } from '../api/attempt';
import { api } from '../api/client';
import { saveAuthorityOutcome } from '../citation/saveAuthorityOutcome';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SAVE THAT WAS WAITING FOR A MATTER TO EXIST.
 *
 * NEW3 R16 §8: `AFTER_CREATE_FROM_MATTER_PICKER = A.
 * CREATE_THEN_AUTO_SAVE_PENDING_AUTHORITY`. Founder design fpass 24.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
 *
 * An advocate reading their first authority tapped save, was asked "into which
 * matter?", had no matters, followed "Create a matter", filled the form — and
 * the authority they were saving was GONE. `MatterPicker` pushed `/matter/new`
 * and dropped the intent on the floor; nothing carried it across, and the
 * advocate landed in a new empty matter with no sign that the save they had
 * started never happened. It did not fail loudly; it simply never happened.
 *
 * ── THERE IS STILL NO "SAVE WITHOUT A MATTER" ───────────────────────────────
 *
 * This is a HELD INTENT, not a saved authority, and the distinction is the
 * whole design. Saved authorities are matter-scoped at the server —
 * `matter_authorities` hangs off a matter and the three citation fields are
 * joined per matter on every read. A global saved list would be a store nothing
 * writes and nothing reads. NEW3 R16 `R16-RCC-X01` holds it out, and nothing
 * here creates one: the intent lives on this device, for minutes, and is
 * destroyed the moment it is either performed or abandoned.
 *
 * ── IT NEVER CLAIMS A SAVE THAT DID NOT HAPPEN ──────────────────────────────
 *
 * The intent is cleared ONLY after the server confirms, or after the advocate
 * cancels. A created matter plus a failed save is a PARTIAL result and is shown
 * as one, with a retry — never as success. Same rule the adjournment purpose is
 * under: the date is a column and may be optimistic, the second write is not
 * ours to assume.
 *
 * ── DUPLICATES: TWO DIFFERENT GUARANTEES, AND THEY ARE NOT THE SAME ─────────
 *
 * An AUTHORITY save is idempotent AT THE SERVER — `POST
 * /matters/:id/authorities` answers 200 when the judgment is already saved and
 * 201 when it is new, precisely so a double tap in a court corridor cannot
 * duplicate. Retry there is free.
 *
 * An ANNOTATION save had no such identity: `services/api/src/judgments/
 * annotations.ts` runs a bare `INSERT INTO judgment_annotations` with no `ON
 * CONFLICT`, so two requests made two rows. The protection was client-side only
 * — {@link running} is a single-flight latch and the intent is consumed only on
 * success — and this comment named the residual case it could not cover: a
 * request the server completed whose response never arrived.
 *
 * THAT CASE IS NOW CLOSED. LCC built R16's `Idempotency-Key` at `e325ed9f` and
 * this store carries one on the persisted record ({@link PendingSave.attemptKey}),
 * so the lost-response retry replays the original result instead of inserting
 * again. The latch and the key answer different questions and BOTH stay: the
 * latch stops two requests leaving this device, the key stops the second one
 * mattering if it does.
 *
 * ── IT SURVIVES A BACKGROUND, AND IT EXPIRES ────────────────────────────────
 *
 * Held in AsyncStorage for the reason `pendingDestination` is: creating a matter
 * is a form an advocate can be interrupted in the middle of, and on Android a
 * return can be a cold start. It expires for a reason too — an intent captured
 * yesterday is not an intent, and silently attaching last week's authority to a
 * matter made today would be worse than losing it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const STORAGE_KEY = 'lawmind.pendingSave.v1';

/**
 * Thirty minutes. Long enough to fill a form, be interrupted by a matter being
 * called, and come back; short enough that it is still the same piece of work.
 * The window `pendingDestination` uses, for the same reason.
 */
export const PENDING_WINDOW_MS = 30 * 60 * 1000;

/**
 * The authority or passage an advocate was saving when they had no matter.
 *
 * WRITTEN AS A UNION OF COMPLETE VARIANTS rather than a shared head intersected
 * with a tail, and that is not a style choice. `Omit<T, K>` over a union
 * COLLAPSES it — the result keeps only the properties every member shares, so
 * `Omit<PendingSave, 'capturedAt'>` silently lost `paragraphIndex` and every
 * other variant-specific field. Repeating `caseTitle` and `judgmentId` in
 * both arms costs two lines and keeps the narrowing that makes this type worth
 * having.
 */
export type PendingSaveIntent =
  | {
      kind: 'authority';
      /** Shown in the confirmation, so it names what was saved rather than "it". */
      caseTitle: string;
      judgmentId: string;
      /**
       * The verification record as it was SHOWN — absent when the judgment was
       * opened cold, and passed through rather than looked up, exactly as the
       * direct save path does.
       */
      citationCheckId?: string;
    }
  | {
      kind: 'annotation';
      caseTitle: string;
      judgmentId: string;
      /** ZERO-BASED POSITION. A rendering handle, never citable. */
      paragraphIndex: number;
      /** THE NUMBER THE JUDGMENT PRINTS. Null on an unnumbered judgment, never faked. */
      paragraphNumber: number | null;
      quote: string;
    };

/**
 * An intent, plus when it was held. Intersection over a union distributes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * R16. `attemptKey` IS PERSISTED HERE FOR THE SAME REASON THE INTENT IS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This record already survives a background and a cold start — creating a matter
 * is a form an advocate can be interrupted in the middle of, and on Android a
 * return can be a cold start. So the RETRY can outlive the process, and an
 * in-memory key would be a new key on the new launch, which executes a second
 * insert of a row that may already have committed. The key therefore belongs on
 * the record.
 *
 * IT IS MINTED AT CAPTURE, NOT AT RUN. Capture is the moment the advocate
 * intended one save; `runFor` may be reached several times for that one
 * intention (a cold start, a failed first attempt, the explicit retry on
 * `NewMatterScreen`) and every one of them is the same logical mutation. A new
 * capture is a new intention — the advocate chose a different passage — and gets
 * a new key, which is exactly what `capture`'s latest-wins rule already means.
 *
 * IT ADDS NO SENSITIVE BODY TO STORAGE. The quote and the case title are already
 * here; this is 26 characters of opaque identifier beside them.
 */
export type PendingSave = PendingSaveIntent & { capturedAt: number; attemptKey: string };

/** What happened when the held intent was run against a freshly created matter. */
export type PendingSaveResult =
  | { kind: 'saved'; caseTitle: string }
  /** The matter exists; the save does not. Shown as exactly that, with a retry. */
  | { kind: 'failed'; caseTitle: string; message: string }
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE MATTER EXISTS, THE SAVE DOES NOT, AND RETRYING CANNOT HELP — R17 §1.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * A third outcome rather than a flag on `failed`, because the only action
   * `failed` offers is the one action this state must NOT offer. The corpus
   * generation this request pinned does not carry the target; pressing "try
   * again" mints a second intentional mutation against a reason that has not
   * changed, and it will keep not changing until a different generation is
   * active. A retry button that is guaranteed to fail is a worse answer than no
   * retry button.
   *
   * It is not a claim about the judgment. `saveAuthorityOutcome.ts` holds the
   * one sentence this state is allowed to say, and the reason the sentence is
   * ours rather than the server's.
   */
  | { kind: 'corpus_unavailable'; caseTitle: string; message: string };

type PendingSaveState = {
  held: PendingSave | null;
  hydrated: boolean;
  /** Single-flight latch. See the duplicates note above — it is load-bearing. */
  running: boolean;

  hydrate: () => Promise<void>;
  capture: (intent: PendingSaveIntent) => void;
  /** Abandoned deliberately — the advocate backed out of creating a matter. */
  clear: () => void;
  /**
   * Performs the held intent against `matterId`, exactly once.
   *
   * Returns `null` when there is nothing held, when it has expired, or when a
   * run is already in flight. A null is not a failure and must never be
   * rendered as one.
   */
  runFor: (matterId: string, now?: number) => Promise<PendingSaveResult | null>;
};

async function persist(held: PendingSave | null): Promise<void> {
  try {
    if (held === null) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(held));
  } catch {
    // Losing a held intent costs one re-tap. Taking the app down for it costs
    // the hearing. The same trade `pendingDestination` makes.
  }
}

function isPending(value: unknown): value is PendingSave {
  if (value === null || typeof value !== 'object') return false;
  const v = value as PendingSave;
  /*
    `attemptKey` IS NOT REQUIRED BY THIS GUARD, deliberately. A record written by
    a build from before R16 is a real held intent and must still be performed;
    refusing to rehydrate it would lose an advocate's save to an app update. It
    is filled in below instead, and such a record simply has no cold-restart
    idempotency — which is the state it was written in, honestly carried forward.
  */
  return (
    (v.kind === 'authority' || v.kind === 'annotation') &&
    typeof v.judgmentId === 'string' &&
    typeof v.capturedAt === 'number'
  );
}

export const usePendingSave = create<PendingSaveState>((set, get) => ({
  held: null,
  hydrated: false,
  running: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!isPending(parsed)) {
        set({ held: null, hydrated: true });
        return;
      }
      // A pre-R16 record has no key. It gets one now rather than being dropped —
      // see `isPending`. From this launch on, its retries are duplicate-safe.
      const held: PendingSave = parsed.attemptKey
        ? parsed
        : { ...parsed, attemptKey: newAttemptKey() };
      set({ held, hydrated: true });
      void persist(held);
    } catch {
      set({ held: null, hydrated: true });
    }
  },

  capture: (intent) => {
    /**
     * THE LATEST CAPTURE WINS, unlike `pendingDestination`, and the difference
     * is deliberate. There, a second capture is the router settling and would
     * overwrite the real destination. Here, a second capture is the advocate
     * deciding to save a different passage instead — the newer intent is the
     * one they mean, and holding the older one would save something they walked
     * away from.
     */
    const held = { ...intent, capturedAt: Date.now(), attemptKey: newAttemptKey() } as PendingSave;
    set({ held });
    void persist(held);
  },

  clear: () => {
    set({ held: null });
    void persist(null);
  },

  runFor: async (matterId, now = Date.now()) => {
    const held = get().held;
    if (held === null) return null;

    // An intent older than the window is abandoned rather than performed — see
    // the expiry note above: attaching last week's authority is worse than none.
    if (now - held.capturedAt > PENDING_WINDOW_MS) {
      get().clear();
      return null;
    }

    /*
      THE LATCH. A double tap, a re-entered screen and a retry all arrive here,
      and the annotation path has no server-side idempotency to fall back on.
    */
    if (get().running) return null;
    set({ running: true });

    try {
      /*
        THE AUTHORITY BRANCH ANSWERS IN THREE STATES, NOT TWO — R17 §1 write, so
        it is narrowed here rather than folded into the shared `res.ok` below.

        `already_saved_unavailable` is the one that would be got wrong by
        accident: the server answers `200 { unavailableAuthority }` when this
        exact row is ALREADY saved and its target is not in the pinned corpus
        generation. Nothing mutated and nothing is owed — the advocate's save
        happened. Treating it as a failure would hold an intent that is already
        satisfied and offer a retry for work that is done, and treating it as an
        ordinary save would let the caller claim a hydrated authority the server
        just declined to describe.
      */
      if (held.kind === 'authority') {
        const outcome = saveAuthorityOutcome(
          await api.addAuthorityToMatter({
            matterId,
            judgmentId: held.judgmentId,
            ...(held.citationCheckId ? { citationCheckId: held.citationCheckId } : {}),
          }),
        );

        if (outcome.kind === 'corpus_unavailable') {
          /*
            HELD, like any other failure — the advocate may still want it, and a
            later corpus generation makes it savable with no action from them.
            What changes is only that the screen must not offer a retry.
          */
          return { kind: 'corpus_unavailable', caseTitle: held.caseTitle, message: outcome.message };
        }
        if (outcome.kind === 'refused') {
          return { kind: 'failed', caseTitle: held.caseTitle, message: outcome.message };
        }

        // `saved` and `already_saved_unavailable` are both the row existing.
        set({ held: null });
        void persist(null);
        return { kind: 'saved', caseTitle: held.caseTitle };
      }

      /*
        THE PERSISTED KEY, REUSED. This is the retry the annotation path has
        never had cover for: the note above said "the residual case this CANNOT
        cover is a request the server completed whose response never arrived —
        closing that needs a server-side key, which is LCC's and is not invented
        here." LCC built it (R16, e325ed9f) and this is that case closed. The
        latch above still stops the double tap; the key stops the lost response.
      */
      const res = await runAttempt(held.attemptKey, (key) =>
          api.createAnnotation(
            held.judgmentId,
            {
              paragraphNumber: held.paragraphNumber,
              paragraphIndex: held.paragraphIndex,
              quote: held.quote,
              matterId,
            },
            key,
          ),
        );

      if (!res.ok) {
        /*
          HELD, NOT DISCARDED. The matter exists and the save does not; the
          advocate is shown that and offered a retry. Dropping the intent here
          would turn a visible partial into a silent loss — the exact defect
          this store was written to end.

          The server's message travels verbatim. This is the ANNOTATION path and
          it has no corpus-availability state to classify: the target is the
          advocate's own quote from a judgment they are already reading.
        */
        return { kind: 'failed', caseTitle: held.caseTitle, message: res.error.message };
      }

      // Consumed ONLY now — after the server said yes.
      set({ held: null });
      void persist(null);
      return { kind: 'saved', caseTitle: held.caseTitle };
    } finally {
      set({ running: false });
    }
  },
}));
