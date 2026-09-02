/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AN `identity_only` ACCOUNT ASKS TO BE DELETED — REAL SCREEN, REAL BACKEND.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RCC R24 opened `/delete-account` to this population and fixed two things the
 * route alone did not: the confirmation box compared against `profile.email`,
 * which is `null` here, and nothing linked to the screen. Both were proved
 * against mocks. Neither proof could have caught a server that answers `403
 * PROFILE_INCOMPLETE` — which is exactly what this route did until LCC R26, and
 * exactly what bus 1722 reported.
 *
 * So this drives `DeleteAccountScreen` itself: the session is hydrated from a
 * real `GET /me` for an account that has an `auth_user` row and NO `users` row,
 * the advocate types the address that response carried, and the request lands in
 * `data_requests` with a NULL `user_id`.
 *
 * ── THE THREE THINGS A MOCK CANNOT SAY ──────────────────────────────────────
 *
 *   PROFILE_ROW_CREATED   asking to be deleted must not create the profile the
 *                         advocate declined to make. Counted in `users`.
 *   IDENTITY_ONLY_R16     the attempt key must reach the server and a replay
 *                         must return the SAME request rather than a second one.
 *   PROFILE_REGRESSION    the profile-backed flow must be untouched.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { dataRequestRows, profileRowCount, readHandshake, type E2eHandshake } from './handshake';

/* Required after `globalSetup` has set the base URL — see `r17-corpus.e2e.test.ts`. */
type ClientModule = typeof import('../src/api/client');
type SessionModule = typeof import('../src/state/session');
type ScreenModule = typeof import('../src/screens/settings/DeleteAccountScreen');

let handshake: E2eHandshake;
let client: ClientModule;
let useSession: SessionModule['useSession'];
let DeleteAccountScreen: ScreenModule['DeleteAccountScreen'];

/** Sign in as one of the seeded fixtures, the way the app does: tokens, then `GET /me`. */
async function signInAs(who: 'profileBacked' | 'identityOnly'): Promise<void> {
  const account = handshake[who];
  client.registerAuthBridge({
    accessToken: () => account.token,
    refresh: async () => true,
    onSessionLost: () => {},
  });
  useSession.setState({
    tokens: { accessToken: account.token, refreshToken: 'unused-in-this-suite' },
    profile: null,
    identityEmail: null,
    status: 'unknown',
  });
  await useSession.getState().loadProfile();
}

beforeAll(() => {
  handshake = readHandshake();
  client = require('../src/api/client') as ClientModule;
  useSession = (require('../src/state/session') as SessionModule).useSession;
  DeleteAccountScreen = (
    require('../src/screens/settings/DeleteAccountScreen') as ScreenModule
  ).DeleteAccountScreen;
});

describe('identity_only deletion, against the real backend', () => {
  beforeAll(async () => {
    await signInAs('identityOnly');
  });

  it('GET /me classifies the account as identity_only and still carries the email', () => {
    const state = useSession.getState();
    expect(state.status).toBe('identity_only');
    expect(state.profile).toBeNull();
    /* The whole reason the confirm box can work: the address is on the identity,
     * not on a profile this account does not have. */
    expect(state.identityEmail).toBe(handshake.identityOnly.email);
  });

  it('reaches the Delete Account screen and sends the request with no onboarding', async () => {
    /* `await`, deliberately. RNTL's `render` is async here, and a missing await
     * leaves `screen` unbound for every LATER test in the file rather than
     * failing on this line. */
    await render(<DeleteAccountScreen onBack={() => {}} />);

    await screen.findByText('Type your email to confirm');
    /* The cold-start refusal must NOT be showing — that copy fires only when
     * there is no address to confirm against, and it would mean the screen was
     * reachable but unusable. */
    expect(screen.queryByText(/could not read the email on your account/i)).toBeNull();

    const button = await screen.findByText('Request account deletion');

    /* The placeholder IS the expected address, and it comes from the identity
     * rather than from a profile — so finding the field by it is itself the
     * assertion that the screen read the right thing. */
    await fireEvent.changeText(
      screen.getByPlaceholderText(handshake.identityOnly.email),
      handshake.identityOnly.email,
    );

    await fireEvent.press(button);

    await waitFor(async () => {
      const { rows } = await dataRequestRows(handshake.controlUrl, handshake.identityOnly.authId);
      expect(rows.filter((r) => r.kind === 'erasure')).toHaveLength(1);
    });
  });

  it('created no profile row — deletion never demands the data it deletes', async () => {
    expect(await profileRowCount(handshake.controlUrl, handshake.identityOnly.authId)).toBe(0);
  });

  it('wrote the request against the auth principal, with a null profile id', async () => {
    const { rows } = await dataRequestRows(handshake.controlUrl, handshake.identityOnly.authId);
    const erasure = rows.find((r) => r.kind === 'erasure')!;
    expect(erasure.authId).toBe(handshake.identityOnly.authId);
    expect(erasure.userId).toBeNull();
  });

  it('acknowledges a REQUEST, and never claims the account is already gone', async () => {
    const res = await client.api.listDataRequests();
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    const erasure = res.data.requests.find((r) => r.kind === 'erasure')!;
    /* `received` — queued work with a due date, not a completed deletion. The
     * screen renders "Your request has been received", and the state backing it
     * is the server's, not an optimistic local one. */
    expect(erasure.status).toBe('received');
    expect(erasure.completedAt).toBeNull();
    expect(erasure.dueAt).toEqual(expect.any(String));
  });

  it('R16: a replay of the same attempt key returns the same request, not a second one', async () => {
    const key = `rcc-r25-identity-replay-${handshake.identityOnly.authId}`;
    const first = await client.api.createDataRequest('erasure', undefined, key);
    const second = await client.api.createDataRequest('erasure', undefined, key);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(second.data.request.id).toBe(first.data.request.id);

    const { rows } = await dataRequestRows(handshake.controlUrl, handshake.identityOnly.authId);
    expect(rows.filter((r) => r.kind === 'erasure')).toHaveLength(1);
  });
});

describe('failure states', () => {
  it('unauthenticated: the server asks for a sign-in and nothing is written', async () => {
    client.registerAuthBridge({
      accessToken: () => null,
      refresh: async () => false,
      onSessionLost: () => {},
    });
    const res = await client.api.createDataRequest('erasure');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error.code).toBe('AUTH_REQUIRED');
  });

  it('a backend failure is never reported as success', async () => {
    client.registerAuthBridge({
      accessToken: () => 'not-a-valid-token',
      refresh: async () => false,
      onSessionLost: () => {},
    });
    const res = await client.api.createDataRequest('erasure');
    expect(res.ok).toBe(false);
  });
});

describe('profile-backed deletion is unchanged', () => {
  beforeAll(async () => {
    await signInAs('profileBacked');
  });

  it('signs in as a full profile', () => {
    const state = useSession.getState();
    expect(state.status).toBe('signed_in');
    expect(state.profile).not.toBeNull();
    expect(state.profile!.email).toBe(handshake.profileBacked.email);
  });

  it('sends the same erasure request, against the same route, with a profile id', async () => {
    const res = await client.api.createDataRequest(
      'erasure',
      undefined,
      `rcc-r25-profile-${handshake.profileBacked.authId}`,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data.request.kind).toBe('erasure');
    expect(res.data.request.status).toBe('received');

    const { rows } = await dataRequestRows(handshake.controlUrl, handshake.profileBacked.authId);
    const erasure = rows.find((r) => r.kind === 'erasure')!;
    expect(erasure.authId).toBe(handshake.profileBacked.authId);
    /* The difference between the two populations, and the only one: this account
     * HAS a profile, so the request carries it. */
    expect(erasure.userId).not.toBeNull();
  });
});
