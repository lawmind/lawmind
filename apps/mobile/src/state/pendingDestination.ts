import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE ADVOCATE WAS GOING WHEN WE ASKED THEM TO SIGN IN.
 *
 * A shared link to a judgment, a matter, or a paragraph is the commonest way
 * this product is opened by somebody who is not already signed in. Before this
 * store the destination was DISCARDED: `app/auth/verify.tsx` always replaced to
 * `/today`, so an advocate who followed a link, was bounced to sign in, and
 * verified, landed on the morning screen and had to find the judgment again
 * from a link they had already left.
 *
 * THE DESTINATION NEVER LEAVES THE DEVICE. It is a route string held in
 * AsyncStorage — not the keychain, because it is neither secret nor small
 * enough to be worth a keychain slot, and `state/reading.ts` argues the same
 * way about a reading position. Nothing here is sent to the server; the server
 * is never told what an unauthenticated visitor was trying to open.
 *
 * IT EXPIRES. A destination captured a week ago is not a destination any more —
 * resuming it would take an advocate who signed in on Monday morning to a
 * judgment they abandoned last Thursday. {@link RESUME_WINDOW_MS} bounds it at
 * thirty minutes, which covers "bounced to sign in, checked email, came back"
 * with room to spare and does not cover a different day.
 *
 * IT SURVIVES A BACKGROUND. The magic-link round trip leaves the app: the
 * advocate switches to their mail client and returns through a deep link, and
 * on Android that can be a cold start. An in-memory value would be gone by
 * then, which is exactly the case this is for.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const STORAGE_KEY = 'lawmind.pendingDestination.v1';

/** Thirty minutes. See the note above on why a destination expires at all. */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

/**
 * Routes that must NEVER be captured as a destination.
 *
 * Capturing `/sign-in` would resume to the sign-in screen after signing in, and
 * capturing `/auth/verify` would replay a spent single-use token — which the
 * server reads as a REPLAY and answers by revoking every session the advocate
 * has (`state/session.ts`). `/onboarding` is excluded because it is where
 * `identity_only` is sent anyway; resuming to it would be a loop.
 */
const NEVER_CAPTURED = ['/sign-in', '/auth/verify', '/onboarding'] as const;

export function isCapturableDestination(href: string): boolean {
  if (!href.startsWith('/')) return false;
  // `/today` is where an unresumed sign-in lands anyway, so capturing it adds
  // nothing and would make a plain cold start look like a held link.
  if (href === '/' || href === '/today') return false;
  return !NEVER_CAPTURED.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));
}

export type HeldDestination = { href: string; capturedAt: number };

type PendingDestinationState = {
  /** Null until something was held, or after it was consumed or expired. */
  held: HeldDestination | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Records where the advocate was going. Refuses the routes above. */
  capture: (href: string) => void;
  /**
   * Returns the held destination and clears it, or null when there is none,
   * when it has expired, or when it was never capturable. Consuming is
   * DESTRUCTIVE by design: a destination that survived being resumed would fire
   * again on the next sign-in.
   */
  consume: (now?: number) => string | null;
  clear: () => void;
};

async function persist(held: HeldDestination | null): Promise<void> {
  try {
    if (held === null) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(held));
  } catch {
    // Losing the held link costs the advocate one navigation. Taking the app
    // down on a storage failure costs the hearing.
  }
}

export const usePendingDestination = create<PendingDestinationState>((set, get) => ({
  held: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      const held =
        parsed && typeof parsed === 'object' && typeof (parsed as HeldDestination).href === 'string'
          ? (parsed as HeldDestination)
          : null;
      set({ held, hydrated: true });
    } catch {
      set({ held: null, hydrated: true });
    }
  },

  capture: (href) => {
    if (!isCapturableDestination(href)) return;
    /**
     * THE FIRST CAPTURE WINS WITHIN A SINGLE BOUNCE.
     *
     * The guard renders a redirect, the router then settles on `/sign-in`, and
     * a second capture from that settling pass would overwrite the judgment the
     * advocate actually asked for. `isCapturableDestination` already refuses
     * `/sign-in` itself, and this keeps any other intermediate route from
     * displacing a live one.
     */
    const current = get().held;
    if (current && Date.now() - current.capturedAt < RESUME_WINDOW_MS) return;
    const held = { href, capturedAt: Date.now() };
    set({ held });
    void persist(held);
  },

  consume: (now = Date.now()) => {
    const held = get().held;
    set({ held: null });
    void persist(null);
    if (!held) return null;
    if (now - held.capturedAt > RESUME_WINDOW_MS) return null;
    if (!isCapturableDestination(held.href)) return null;
    return held.href;
  },

  clear: () => {
    set({ held: null });
    void persist(null);
  },
}));
