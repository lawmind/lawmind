import * as Notifications from 'expo-notifications';

import { registerForPushNotifications } from './register';

/**
 * THE RULE UNDER TEST: three named, distinct failure reasons — never one
 * generic "push failed" — because the fix for each is different (a phone
 * setting an advocate can change vs. `docs/FOUNDER_QUEUE.md` FQ-PUSH-PROJECT,
 * which only the founder can). `register.ts`'s own module note is the spec.
 */

const mockIsDevice = { value: true };
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice.value;
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

let mockProjectId: string | undefined = 'eas-project-123';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { eas: { projectId: mockProjectId } } };
    },
  },
}));

const getPermissionsAsync = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const requestPermissionsAsync = Notifications.requestPermissionsAsync as jest.MockedFunction<
  typeof Notifications.requestPermissionsAsync
>;
const getExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.MockedFunction<
  typeof Notifications.getExpoPushTokenAsync
>;

describe('registerForPushNotifications', () => {
  beforeEach(() => {
    mockIsDevice.value = true;
    mockProjectId = 'eas-project-123';
    getPermissionsAsync.mockReset();
    requestPermissionsAsync.mockReset();
    getExpoPushTokenAsync.mockReset();
  });

  it('refuses on a simulator without asking for permission at all', async () => {
    mockIsDevice.value = false;

    const result = await registerForPushNotifications();

    expect(result).toEqual({ ok: false, reason: 'NOT_A_DEVICE' });
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not re-request permission when already granted', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[x]' } as never);

    await registerForPushNotifications();

    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not yet granted, and refuses honestly on denial', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'undetermined' } as never);
    requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);

    const result = await registerForPushNotifications();

    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, reason: 'PERMISSION_DENIED' });
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('refuses with the real reason when no EAS project is configured — never crashes, never a generic error', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    mockProjectId = undefined;

    const result = await registerForPushNotifications();

    expect(result).toEqual({ ok: false, reason: 'NO_PROJECT_CONFIGURED' });
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('returns the token on the success path', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[real]' } as never);

    const result = await registerForPushNotifications();

    expect(result).toEqual({ ok: true, token: 'ExponentPushToken[real]' });
    expect(getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'eas-project-123' });
  });

  it('catches a thrown error from the native call rather than letting it propagate', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    getExpoPushTokenAsync.mockRejectedValue(new Error('native module unavailable'));

    const result = await registerForPushNotifications();

    expect(result).toEqual({ ok: false, reason: 'UNKNOWN' });
  });
});
