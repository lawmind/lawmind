import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { api, registerAuthBridge } from '../api/client';
import type { MeResponse, Profile } from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SESSION — tokens, the two-phase identity, and one rule about replay.
 *
 * WHY SECURE-STORE AND NOT ASYNC-STORAGE. `state/reading.ts` argues the opposite
 * way for a reading position, and both are right: a reading position is neither
 * secret nor small, and a refresh token is both. `expo-secure-store` is the OS
 * keychain — Keychain on iOS, EncryptedSharedPreferences on Android — capped at
 * a couple of KB per value, which a token pair and a profile are comfortably
 * under. A refresh token in plain AsyncStorage is a 30-day login sitting in a
 * world-readable file on a rooted phone.
 *
 * IDENTITY IS NOT PROFILE. `POST /auth/verify` proves an email address is
 * reachable; it does not make somebody an advocate. `GET /me` answers
 * `profileComplete: false` until `PATCH /me` supplies a name and a phone number,
 * and THAT IS A REAL STATE, not an error — somebody abandoned onboarding. The
 * store models it as its own field rather than faking an empty profile, because
 * a blank name rendered where the advocate's name belongs is worse than a screen
 * that asks for it.
 *
 * A REPLAYED REFRESH TOKEN REVOKES EVERY SESSION. That is the server's rule
 * (`SCHEMA_TRUTH.md#refresh_tokens`), and the client's half of it is: never
 * retry a rejected refresh. Retrying turns one revocation into a loop, and the
 * only correct response is to send the advocate to sign in.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TOKENS_KEY = 'lawmind.session.tokens.v1';
const PROFILE_KEY = 'lawmind.session.profile.v1';
/**
 * THE EMAIL ON THE AUTH IDENTITY, WHICH EXISTS BEFORE A PROFILE DOES.
 *
 * `GET /me` has always sent `user.email` at the top level, beside
 * `profileComplete`, and this store threw it away on the `identity_only` branch
 * because nothing needed it. Something does now: `/delete-account` asks the
 * advocate to type their own email to confirm, and for an advocate with no
 * `users` row the profile that used to supply it is `null`. Without this the
 * screen opens, the confirm box can never match, and the button is disabled
 * forever — a deletion path that is reachable and impossible, which is the same
 * failure as one that 403s, wearing better clothes.
 *
 * IT IS DATA WE ALREADY HOLD (`auth_user.email`, `SCHEMA_TRUTH.md`), never
 * something the advocate is asked for again. That is the whole point: erasure
 * must not cost more personal data than the account already contains.
 *
 * Stored beside the profile for the reason the profile is stored — the app opens
 * in court buildings and a launch that blocks on `GET /me` shows a spinner where
 * a spinner is useless.
 */
const IDENTITY_EMAIL_KEY = 'lawmind.session.identityEmail.v1';

type Tokens = { accessToken: string; refreshToken: string };

export type SessionStatus =
  /** Nothing read from the keychain yet. Draw nothing that depends on identity. */
  | 'unknown'
  /** No tokens. The advocate signs in. */
  | 'signed_out'
  /** Tokens held, but `GET /me` says there is no profile. Onboarding is unfinished. */
  | 'identity_only'
  /** Tokens and a profile. */
  | 'signed_in';

type SessionState = {
  status: SessionStatus;
  tokens: Tokens | null;
  profile: Profile | null;
  /**
   * The verified email on the auth identity. Present for `identity_only` as
   * well as `signed_in`, which is the only reason it is a separate field: for a
   * signed-in advocate `profile.email` says the same thing.
   */
  identityEmail: string | null;
  /**
   * Set when the session ended because the SERVER rejected it rather than
   * because the advocate asked. The sign-in screen says so — an advocate who was
   * signed out mid-hearing deserves to know it was not their doing.
   */
  endedByServer: boolean;

  hydrate: () => Promise<void>;
  requestLink: (email: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  verify: (token: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  loadProfile: () => Promise<void>;
  completeProfile: (input: {
    fullName: string;
    phone: string;
    barEnrolmentNumber?: string | null;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  registerPushToken: (token: string | null) => Promise<void>;
  signOut: () => Promise<void>;
};

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // A keychain that will not open is indistinguishable from an empty one for
    // our purposes: the advocate signs in again. Crashing on launch is not an
    // option in a court corridor.
    return null;
  }
}

async function writeJson(key: string, value: unknown | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // The session survives in memory for this run. Losing it at next launch
    // costs one sign-in; taking the app down costs the hearing.
  }
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'unknown',
  tokens: null,
  profile: null,
  identityEmail: null,
  endedByServer: false,

  hydrate: async () => {
    const tokens = await readJson<Tokens>(TOKENS_KEY);
    const profile = await readJson<Profile>(PROFILE_KEY);
    const identityEmail = await readJson<string>(IDENTITY_EMAIL_KEY);

    if (!tokens) {
      set({ status: 'signed_out', tokens: null, profile: null, identityEmail: null });
      return;
    }

    /**
     * THE CACHED PROFILE IS SHOWN BEFORE THE NETWORK IS ASKED.
     *
     * Court buildings have terrible connectivity and the app opens there. A
     * launch that blocks on `GET /me` shows a spinner in the one place a spinner
     * is useless. The cached profile is the advocate's own name and phone
     * number, which do not change between launches; `loadProfile` corrects it
     * when there is a signal.
     */
    set({
      tokens,
      profile,
      identityEmail: profile?.email ?? identityEmail,
      status: profile ? 'signed_in' : 'identity_only',
    });

    void get().loadProfile();
  },

  requestLink: async (email) => {
    const res = await api.requestMagicLink(email.trim().toLowerCase());
    return res.ok ? { ok: true } : { ok: false, message: res.error.message };
  },

  verify: async (token) => {
    const res = await api.verifyMagicLink(token);
    if (!res.ok) return { ok: false, message: res.error.message };

    const tokens = { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken };
    await writeJson(TOKENS_KEY, tokens);
    /**
     * `status` STAYS UNSET UNTIL `loadProfile` RESOLVES.
     *
     * This used to set `status: 'identity_only'` here, synchronously, before
     * `GET /me` had been asked. `app/auth/verify.tsx`'s routing effect reacts
     * to `status` on every render, so it fired on THIS interim value and sent
     * every returning advocate — profile and all — back to onboarding, losing
     * the race against the network call that would have said `signed_in`.
     * Found live on device 8 Aug 2026: a fully onboarded account, signed in
     * fresh, landed on the onboarding form again. `loadProfile` is the only
     * source of truth for status now; it always resolves to the real answer.
     */
    set({ tokens, endedByServer: false });

    await get().loadProfile();
    return { ok: true };
  },

  loadProfile: async () => {
    if (!get().tokens) return;

    const res = await api.me();
    if (!res.ok) {
      /**
       * OFFLINE IS NOT SIGNED OUT. A failed `GET /me` on a corridor connection
       * must not clear the keychain — the advocate would be signed out by a
       * thick wall. The session-lost path is driven by the server rejecting a
       * REFRESH, which `onSessionLost` below handles, and by nothing else.
       */
      return;
    }

    /**
     * `res.data.user`, NOT `res.data` — `GET /me` wraps under `user`.
     *
     * This was `const me: MeResponse = res.data; if (!me.profileComplete)`,
     * reading a key that only ever existed one level down. `me.profileComplete`
     * was `undefined` on every real response, `!undefined` is `true`, and every
     * sign-in — including a fully onboarded account — took the "incomplete"
     * branch and wrote `null` over a real cached profile. Found live on device
     * 8 Aug 2026: `GET /me` curled directly returned `profileComplete: true`;
     * the app still routed to `/onboarding` on every single sign-in, forever,
     * not intermittently — a 100% reproducible bug, not the race it first
     * looked like.
     */
    const { user } = res.data;
    // Recorded in BOTH branches. The identity's email is the one fact about this
    // account that survives having no profile, and `/delete-account` is the
    // surface that needs it precisely when the profile is null.
    await writeJson(IDENTITY_EMAIL_KEY, user.email);
    if (!user.profileComplete) {
      await writeJson(PROFILE_KEY, null);
      set({ profile: null, identityEmail: user.email, status: 'identity_only' });
      return;
    }

    await writeJson(PROFILE_KEY, user.profile);
    set({ profile: user.profile, identityEmail: user.email ?? user.profile.email, status: 'signed_in' });
  },

  completeProfile: async (input) => {
    const res = await api.updateProfile({
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      // PD-2 — captured, never a gate. Omitted when blank rather than sent empty:
      // an empty string is a value, and "not given" is not one.
      ...(input.barEnrolmentNumber ? { barEnrolmentNumber: input.barEnrolmentNumber.trim() } : {}),
    });
    if (!res.ok) return { ok: false, message: res.error.message };

    // `PATCH /me` also wraps under `user` — `res.data.user`, not `res.data.profile`.
    await writeJson(PROFILE_KEY, res.data.user);
    set({ profile: res.data.user, identityEmail: res.data.user.email, status: 'signed_in' });
    return { ok: true };
  },

  /**
   * `null` MEANS "STOP SENDING TO THIS DEVICE" and is passed through as null.
   * Omitting the key would mean "no change", which is a different instruction —
   * and the difference is a phone that keeps buzzing after a sign-out.
   */
  registerPushToken: async (token) => {
    if (!get().tokens) return;
    const res = await api.updateProfile({ expoPushToken: token });
    if (res.ok) {
      await writeJson(PROFILE_KEY, res.data.user);
      set({ profile: res.data.user });
    }
  },

  signOut: async () => {
    // Told, not asked: the local session is cleared whether or not the server
    // is reachable. An advocate handing their phone to a clerk cannot be made to
    // wait for a network round trip to be signed out.
    void api.signOut();
    await writeJson(TOKENS_KEY, null);
    await writeJson(PROFILE_KEY, null);
    await writeJson(IDENTITY_EMAIL_KEY, null);
    set({
      status: 'signed_out',
      tokens: null,
      profile: null,
      identityEmail: null,
      endedByServer: false,
    });
  },
}));

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BRIDGE, INSTALLED ONCE AT MODULE LOAD.
 *
 * `api` calls back into here for the access token and for a refresh. Registering
 * at import time rather than inside a component means the very first request the
 * app makes is already authenticated — a screen that fetches in its own mount
 * effect would otherwise race the provider that installed the bridge.
 * ─────────────────────────────────────────────────────────────────────────────
 */
let refreshInFlight: Promise<boolean> | null = null;

registerAuthBridge({
  accessToken: () => useSession.getState().tokens?.accessToken ?? null,

  refresh: async () => {
    // Several screens fetch at once on launch, and all of them will see the same
    // expired access token. Without this they would each present the same
    // refresh token — which the server reads as a REPLAY and answers by revoking
    // every session the advocate has.
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const current = useSession.getState().tokens;
      if (!current) return false;

      const res = await api.refreshSession(current.refreshToken);
      if (!res.ok) {
        // Distinguish "the network is bad" from "this token is spent". Only the
        // second ends the session; the first must leave the advocate signed in,
        // because a court basement is not a security event.
        if (res.error.code === 'REFRESH_INVALID' || res.error.code === 'AUTH_REQUIRED') {
          useSession.setState({
            status: 'signed_out',
            tokens: null,
            profile: null,
            identityEmail: null,
            endedByServer: true,
          });
          void writeJson(TOKENS_KEY, null);
          void writeJson(PROFILE_KEY, null);
          void writeJson(IDENTITY_EMAIL_KEY, null);
        }
        return false;
      }

      const tokens = { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken };
      await writeJson(TOKENS_KEY, tokens);
      useSession.setState({ tokens });
      return true;
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  },

  onSessionLost: () => {
    useSession.setState({
      status: 'signed_out',
      tokens: null,
      profile: null,
      identityEmail: null,
      endedByServer: true,
    });
  },
});
