import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * PUSH REGISTRATION — P10 of the NEW3 product/premium/release round.
 *
 * `registerPushToken` (`state/session.ts`) has existed since 8 Aug 2026 with
 * no caller anywhere in the app — it PATCHes `/me` with whatever token
 * string it is handed, but nothing ever fetched one, because
 * `expo-notifications` was not even a dependency until this session.
 *
 * TRIGGERED BY REAL INTENT, NOT APP LAUNCH. Asking for permission on first
 * open with no context is the exact mistake `docs/PRODUCT_BRIEF.md`'s daily
 * loop rules and PD-6 warn against — a wrong-timed ask trains an advocate to
 * deny it once and never be asked again on iOS. The caller is
 * `AlertSettingsScreen.tsx`, at the moment the advocate turns ON the one
 * alert trigger that is real and honoured today (`savedAuthorityMoved`) —
 * the first point where declining a phone permission has a concrete,
 * legible cost ("you will not hear about it") rather than an abstract one.
 *
 * FAILS HONESTLY, NEVER SILENTLY. Three distinct failure shapes, because
 * collapsing them into one generic error would tell an advocate to check
 * their phone settings when the real problem is that no EAS project exists
 * yet (`docs/FOUNDER_QUEUE.md` FQ-PUSH-PROJECT) — a problem only the founder
 * can fix, and unrelated to anything on their device:
 *
 * - `NOT_A_DEVICE` — simulators/emulators cannot receive a real push token.
 * - `PERMISSION_DENIED` — the advocate (or a prior build) declined it.
 * - `NO_PROJECT_CONFIGURED` — `app.config.ts` carries no
 *   `extra.eas.projectId`, so `getExpoPushTokenAsync` cannot address a
 *   project on Expo's push service at all. This is the current state of the
 *   repo — verified by reading `app.config.ts` and `eas.json`, neither of
 *   which names a project, and confirmed no `eas-cli` session exists
 *   (`eas whoami` fails — the binary is not even installed). **Delivery is
 *   therefore unverified end-to-end in this session**: the registration path
 *   below is real code, exercised by the tests in this same change with the
 *   native modules mocked, but no device or EAS project exists here to prove
 *   a token is ever issued or a notification ever arrives.
 */
export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'NOT_A_DEVICE' | 'PERMISSION_DENIED' | 'NO_PROJECT_CONFIGURED' | 'UNKNOWN' };

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) return { ok: false, reason: 'NOT_A_DEVICE' };

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return { ok: false, reason: 'PERMISSION_DENIED' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lawmind',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.['eas']?.['projectId'] as string | undefined;
  if (!projectId) return { ok: false, reason: 'NO_PROJECT_CONFIGURED' };

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: data };
  } catch {
    return { ok: false, reason: 'UNKNOWN' };
  }
}
