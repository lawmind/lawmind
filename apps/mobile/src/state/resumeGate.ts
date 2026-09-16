import type { SessionStatus } from './session';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHEN `app/auth/verify.tsx` IS ALLOWED TO DECIDE WHERE THE ADVOCATE GOES.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pure, and exported for the same reason `authDecision` is: the rule can be
 * asserted without a router, a keychain or a rendered tree.
 *
 * THE THIRD ORDERING THAT LOSES A HELD LINK. The other two are answered inside
 * `state/pendingDestination.ts` by the mutation generation — a read that lands
 * after a live write no longer wins. This one is the mirror image and the
 * generation cannot fix it: a `consume()` that runs BEFORE the read lands is
 * not a stale write, it is a correct write made against a store that does not
 * yet know what it holds. It returns null, the advocate goes to Today, and the
 * consume increments the generation so the read that arrives a moment later is
 * correctly discarded. Everything behaves exactly as designed and the link is
 * gone.
 *
 * It is reachable on precisely the path this screen exists for: the process was
 * killed during the mail round trip, so the destination lives NOWHERE but on
 * disk. `app/_layout.tsx` dispatches `hydrate()` without awaiting it, and this
 * screen's own effects run before the layout's — children commit first — so the
 * verify exchange is already in flight before the read has even begun. A fast
 * `POST /auth/verify` against a slow keychain is all it takes.
 *
 * So: DO NOT DECIDE UNTIL THE STORE HAS ANSWERED. `hydrated` turns true on a
 * failed read as well as a successful one, so a throwing keychain costs the
 * advocate a navigation, never a screen that never resolves.
 */
export type ResumeAction =
  /** The destination is not knowable yet. Keep showing "Signing you in…". */
  | 'wait'
  /** Consume the held destination and go there, or to Today when there is none. */
  | 'resume'
  /**
   * Tokens but no profile. The held link is deliberately NOT consumed here — it
   * survives to `app/onboarding.tsx`, which resumes it once the profile exists.
   */
  | 'onboarding';

/**
 * `exchanged` — THIS LINK'S OWN ANSWER HAS ARRIVED. A link can land in an app
 * that is already signed in as someone, and until `verify()` resolves, `status`
 * describes THAT session, not this one. Found on the S24, 16 Sep 2026: a full
 * advocate receiving an identity-only link was sent to Today on the old status,
 * `GET /me` then flipped the gate on a protected route, and the app died with
 * "Maximum update depth exceeded"; the reverse left a full advocate on the
 * onboarding form.
 */
export function resumeAction(
  status: SessionStatus,
  pendingHydrated: boolean,
  exchanged: boolean,
): ResumeAction {
  if (!exchanged) return 'wait';
  if (status === 'unknown') return 'wait';
  if (status === 'identity_only') return 'onboarding';
  if (status !== 'signed_in') return 'wait';
  // Signed in, and the only remaining question is whether the store knows what
  // it holds. Until it does, there is nothing to consume and no honest answer.
  return pendingHydrated ? 'resume' : 'wait';
}
