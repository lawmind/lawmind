import * as SecureStore from 'expo-secure-store';

import { useSession } from './session';
import { api } from '../api/client';
import type { Profile } from '../api/contract';

type AuthBridge = {
  accessToken: () => string | null;
  refresh: () => Promise<boolean>;
  onSessionLost: () => void;
};

let mockAuthBridge: AuthBridge;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../api/client', () => ({
  api: {
    requestMagicLink: jest.fn(),
    verifyMagicLink: jest.fn(),
    me: jest.fn(),
    updateProfile: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
  },
  registerAuthBridge: (bridge: AuthBridge) => {
    mockAuthBridge = bridge;
  },
}));

const profile: Profile = {
  userId: 'usr_1',
  fullName: 'Adv. Mock User',
  preferredLanguage: 'en',
  barEnrolmentNumber: null,
  enrolmentStatus: 'unverified',
  subscriptionTier: 'none',
  termsAcceptedAt: '2026-08-01T00:00:00.000Z',
  termsVersion: 'v1',
  email: 'advocate@example.in',
  phone: '9800000000',
  pushRegistered: false,
};

const requestMagicLink = api.requestMagicLink as jest.MockedFunction<typeof api.requestMagicLink>;
const verifyMagicLink = api.verifyMagicLink as jest.MockedFunction<typeof api.verifyMagicLink>;
const me = api.me as jest.MockedFunction<typeof api.me>;
const refreshSession = api.refreshSession as jest.MockedFunction<typeof api.refreshSession>;
const signOut = api.signOut as jest.MockedFunction<typeof api.signOut>;
const setItem = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const deleteItem = SecureStore.deleteItemAsync as jest.MockedFunction<
  typeof SecureStore.deleteItemAsync
>;

beforeEach(() => {
  useSession.setState({
    status: 'signed_out',
    tokens: null,
    profile: null,
    endedByServer: false,
  });
  jest.clearAllMocks();
});

it('normalises the email and preserves a 429 message as a failed initiation state', async () => {
  requestMagicLink.mockResolvedValue({
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'Wait a moment before requesting another link.' },
  });

  const result = await useSession.getState().requestLink('  Advocate@Example.IN ');

  expect(requestMagicLink).toHaveBeenCalledWith('advocate@example.in');
  expect(result).toEqual({ ok: false, message: 'Wait a moment before requesting another link.' });
});

it('persists the token pair and routes status from the server profile after verification', async () => {
  verifyMagicLink.mockResolvedValue({
    ok: true,
    data: {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: {
        authId: 'auth_1',
        email: profile.email,
        profileComplete: true,
        profile,
      },
    },
  });
  me.mockResolvedValue({
    ok: true,
    data: {
      user: { authId: 'auth_1', email: profile.email, profileComplete: true, profile },
    },
  });

  expect(await useSession.getState().verify('one-use-token')).toEqual({ ok: true });
  expect(setItem).toHaveBeenCalledWith(
    'lawmind.session.tokens.v1',
    JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
  );
  expect(useSession.getState()).toMatchObject({ status: 'signed_in', profile });
});

it('keeps the session on a refresh network failure', async () => {
  useSession.setState({
    status: 'signed_in',
    tokens: { accessToken: 'expired', refreshToken: 'refresh-1' },
    profile,
  });
  refreshSession.mockResolvedValue({
    ok: false,
    error: { code: 'network', message: 'The API could not be reached.' },
  });

  expect(await mockAuthBridge.refresh()).toBe(false);
  expect(useSession.getState()).toMatchObject({ status: 'signed_in', profile });
  expect(deleteItem).not.toHaveBeenCalled();
});

it('ends and clears the session when the server rejects a spent refresh token', async () => {
  useSession.setState({
    status: 'signed_in',
    tokens: { accessToken: 'expired', refreshToken: 'spent' },
    profile,
  });
  refreshSession.mockResolvedValue({
    ok: false,
    error: { code: 'REFRESH_INVALID', message: 'That session has ended.' },
  });

  expect(await mockAuthBridge.refresh()).toBe(false);
  expect(useSession.getState()).toMatchObject({
    status: 'signed_out',
    tokens: null,
    profile: null,
    endedByServer: true,
  });
  expect(deleteItem).toHaveBeenCalledWith('lawmind.session.tokens.v1');
  expect(deleteItem).toHaveBeenCalledWith('lawmind.session.profile.v1');
});

it('clears local credentials on logout without waiting for the API response', async () => {
  useSession.setState({
    status: 'signed_in',
    tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    profile,
  });
  signOut.mockResolvedValue({ ok: false, error: { code: 'network', message: 'Offline.' } });

  await useSession.getState().signOut();

  expect(useSession.getState()).toMatchObject({
    status: 'signed_out',
    tokens: null,
    profile: null,
  });
  expect(deleteItem).toHaveBeenCalledWith('lawmind.session.tokens.v1');
  expect(deleteItem).toHaveBeenCalledWith('lawmind.session.profile.v1');
});
