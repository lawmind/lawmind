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
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW LONG "THE FIRST CAPTURE WINS" LASTS — and why it is not the resume window.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `capture` refuses to displace a destination it already holds, and the reason
 * given in its own comment is narrow and correct: the guard renders a redirect,
 * the router then settles through at least one more route, and a capture from
 * that settling pass would overwrite the judgment the advocate asked for. That
 * is a SAME-FRAME event.
 *
 * Until 1 September 2026 the refusal was bounded by {@link RESUME_WINDOW_MS} —
 * thirty minutes — so the guard also ate real navigations. OBSERVED on a
 * physical Galaxy S24 that day: signed in on Settings → Sign out (Settings is
 * captured, correctly, as where they were) → follow a shared link to
 * `/matter/<id>` → sign in → **lands on Settings**. The matter link the
 * advocate actually followed was refused because a destination two minutes old
 * was still "inside the window".
 *
 * It does not need a sign-out either: two shared links followed within half an
 * hour resume the FIRST one, which is the same defect with no session change at
 * all.
 *
 * So the settling guard gets its own width, sized to the thing it guards
 * against. A router settling pass is frames; a person following a second link
 * is seconds at the very least. Anything arriving after this is a NEW
 * navigation and wins — which is what the store exists to honour.
 */
export const SETTLE_WINDOW_MS = 1_500;

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HREF AN EXTERNAL LINK ASKED FOR — read from the LINK, not from the router.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * OBSERVED on a physical Galaxy S24, 1 September 2026, and it is the whole of
 * the cold-start half of the auth-resume P0:
 *
 *   cold start on `lawmind://matter/<id>` while signed out
 *   → `Linking.getInitialURL()` returns the link, correctly
 *   → `usePathname()` reports `/` for the entire launch
 *   → the gate captures `/`, which is not capturable, and redirects
 *   → nothing was ever held, and there is nothing to resume
 *
 * The reason is structural rather than a race. `components/AuthBoundary.tsx`
 * refuses to MOUNT a protected screen — it returns `null` or a redirect in
 * place of the `<Stack>` — so during the unresolved window there is no
 * navigator at all, expo-router's initial linking state is never applied, and
 * the pathname the gate observes is the default one. Proven by differential:
 * with the gate forced to render its children the same launch reported
 * `pathname: "/matter/<id>"` 24ms in; with the gate active it never did.
 *
 * SO THE DESTINATION IS TAKEN FROM THE LINK ITSELF. It is the more direct
 * source in any case — an external link is the advocate's most explicit
 * possible statement of where they were going, and inferring it from a router
 * state that may never settle is a reading of a reading.
 *
 * THE HOST IS A PATH SEGMENT HERE. `lawmind://matter/<id>` parses as
 * `hostname: "matter"`, `path: "<id>"`, because a custom scheme has no
 * authority — while `lawmind:///matter/<id>` parses as `hostname: null`,
 * `path: "matter/<id>"`. Both name the same screen and both are produced in the
 * wild, so they are rejoined rather than one being blessed.
 *
 * Returns null for a bare launch (`lawmind://`), which is not a destination.
 * Everything else is still filtered by {@link isCapturableDestination} — this
 * function answers "what did the link say", never "may we resume it".
 */
export function deepLinkHref(parsed: {
  hostname?: string | null;
  path?: string | null;
  queryParams?: Record<string, unknown> | null;
}): string | null {
  const segments = [parsed.hostname, parsed.path]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join('/')
    .split('/')
    .filter((seg) => seg.length > 0);
  if (segments.length === 0) return null;

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(parsed.queryParams ?? {})) {
    if (value === undefined || value === null) continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single !== 'string' && typeof single !== 'number') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(single))}`);
  }

  const href = `/${segments.join('/')}`;
  return pairs.length > 0 ? `${href}?${pairs.join('&')}` : href;
}

export type HeldDestination = { href: string; capturedAt: number };

type PendingDestinationState = {
  /** Null until something was held, or after it was consumed or expired. */
  held: HeldDestination | null;
  hydrated: boolean;
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE MUTATION GENERATION — what makes hydration MONOTONIC rather than last-
   * write-wins.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Incremented by every EXPLICIT in-memory write — `capture`, `consume`,
   * `clear` — and by nothing else. `hydrate` reads it before the storage read
   * begins and applies the result only if it has not moved since. The invariant
   * it buys:
   *
   *   async hydration may populate this store only if no in-memory mutation
   *   happened after that hydration began.
   *
   * WHY A COUNTER AND NOT `if (held === null)`. A null guard answers exactly one
   * of the two orderings that lose a link. `app/_layout.tsx` dispatches
   * `hydrate()` on mount and does not await it, so on a cold start from an
   * external link the AsyncStorage read and the capture of the link the advocate
   * actually followed are two writers racing for one field. A null guard stops
   * an empty read from erasing a live capture — and lets a WEEK-OLD persisted
   * destination overwrite it, which is the same defect with a worse ending,
   * because resuming somewhere the advocate has genuinely been reads like the
   * feature working rather than like a bug.
   *
   * It also covers the shapes nobody would think to special-case: a `consume`
   * that lands mid-read must not be undone by the read completing, or a
   * destination fires a second time on the next sign-in.
   *
   * OBSERVED on a physical Galaxy S24, 1 September 2026: cold start on
   * `lawmind://matter/<id>` while signed out, sign in, verify — land on Today.
   */
  generation: number;

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
  /**
   * THE ADVOCATE IS LOOKING AT IT NOW, SO THERE IS NOTHING TO RESUME TO.
   *
   * `app/_layout.tsx` holds every external link the moment it arrives, because
   * at that moment the session status is `unknown` and there is no way to know
   * whether the advocate is about to be bounced. Most of the time they are not:
   * an advocate who is already signed in simply lands on the screen the link
   * named. The hold has then done its job by not being needed, and leaving it
   * in place would arm it — a session that ended half an hour later would
   * resume to a judgment the advocate had already read and closed.
   *
   * So arrival retires it. Only an EXACT match clears, so a hold for
   * `/matter/m1` survives the advocate reaching `/today` on the way.
   */
  arrivedAt: (href: string) => void;
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
  generation: 0,

  hydrate: async () => {
    /**
     * HYDRATION POPULATES THE UNTOUCHED LAUNCH STATE, ONCE, AND NOTHING ELSE.
     *
     * `generation === 0` is the whole condition, and it is deliberately checked
     * when the read LANDS rather than when it starts — that covers both
     * orderings with one test. A capture that happened before this read began
     * and a capture that happened halfway through it are the same fact: memory
     * already knows something disk does not, so disk loses.
     *
     * The `hydrated` short-circuit is the second read. A remounted layout
     * calling `hydrate()` again after a destination was captured and hydration
     * had populated nothing (`generation` still 0) would otherwise re-read an
     * empty disk over a live link — OBSERVED as a failing case in
     * `deepLinkOrdering.test.ts` before this line existed.
     *
     * See {@link PendingDestinationState.generation}.
     */
    if (get().hydrated) return;

    const applyIfUntouched = (held: HeldDestination | null) => {
      if (get().generation !== 0) {
        // Something explicit was written. Only the hydration FLAG is news; the
        // value on disk was stale before it arrived.
        set({ hydrated: true });
        return;
      }
      set({ held, hydrated: true });
    };

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      const held =
        parsed && typeof parsed === 'object' && typeof (parsed as HeldDestination).href === 'string'
          ? (parsed as HeldDestination)
          : null;
      applyIfUntouched(held);
    } catch {
      /**
       * A FAILED READ IS STILL A FINISHED READ. `app/auth/verify.tsx` waits for
       * `hydrated` before deciding where to send the advocate, so a throwing
       * keychain must resolve the flag rather than leave that decision pending
       * forever — and it must not erase a live capture on the way out.
       */
      applyIfUntouched(null);
    }
  },

  capture: (href) => {
    if (!isCapturableDestination(href)) return;
    /**
     * THE FIRST CAPTURE WINS WITHIN A SINGLE BOUNCE — and a bounce is frames,
     * not half an hour. See {@link SETTLE_WINDOW_MS}.
     *
     * The guard renders a redirect, the router then settles on `/sign-in`, and
     * a second capture from that settling pass would overwrite the judgment the
     * advocate actually asked for. `isCapturableDestination` already refuses
     * `/sign-in` itself, and this keeps any other intermediate route from
     * displacing a live one.
     *
     * Anything later is a real navigation the advocate performed, and it wins.
     * Refusing it was how a link they followed lost to the screen they happened
     * to be on when their session ended.
     */
    const current = get().held;
    if (current) {
      /**
       * ───────────────────────────────────────────────────────────────────────
       * THE SAME DESTINATION AGAIN IS NOT A NEW NAVIGATION. THIS MUST COME
       * FIRST, AND IT IS NOT AN OPTIMISATION.
       * ───────────────────────────────────────────────────────────────────────
       *
       * `AuthBoundary` calls `capture(href)` from an effect for as long as the
       * gate is held, and anything that re-renders it calls again with the SAME
       * href. Under the old thirty-minute refusal those repeats were swallowed
       * by accident — the guard never let a second capture through at all — so
       * nothing depended on this being stated.
       *
       * Narrowing the guard to a settle window exposed it immediately: every
       * repeat past 1.5s wrote the store, every write re-rendered the
       * subscribers that read `held`, and the device answered with
       * **"Maximum update depth exceeded"** on the very first run. Observed on
       * the Galaxy S24, 1 September 2026, before this line existed.
       *
       * It is also correct on its own terms and not merely a loop guard:
       * re-capturing an unchanged destination would restart its expiry, so a
       * sign-in screen left open would keep a stale link alive forever — the
       * exact thing {@link RESUME_WINDOW_MS} exists to prevent.
       */
      if (current.href === href) return;
      if (Date.now() - current.capturedAt < SETTLE_WINDOW_MS) return;
    }
    const held = { href, capturedAt: Date.now() };
    set({ held, generation: get().generation + 1 });
    void persist(held);
  },

  consume: (now = Date.now()) => {
    const held = get().held;
    set({ held: null, generation: get().generation + 1 });
    void persist(null);
    if (!held) return null;
    if (now - held.capturedAt > RESUME_WINDOW_MS) return null;
    if (!isCapturableDestination(held.href)) return null;
    return held.href;
  },

  arrivedAt: (href) => {
    const held = get().held;
    if (!held || held.href !== href) return;
    set({ held: null, generation: get().generation + 1 });
    void persist(null);
  },

  clear: () => {
    set({ held: null, generation: get().generation + 1 });
    void persist(null);
  },
}));
