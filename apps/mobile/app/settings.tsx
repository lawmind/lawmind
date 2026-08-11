import { Stack, useRouter } from 'expo-router';

import { SettingsScreen } from '../src/screens/settings/SettingsScreen';

/** Settings — inventory row 41. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <SettingsScreen
        onOpenAlerts={() => router.push('/alert-settings' as never)}
        onOpenCoverage={() => router.push('/coverage' as never)}
        onOpenTrainingConsent={() => router.push('/training-consent' as never)}
        onSignedOut={() => router.replace('/sign-in' as never)}
      />
    </>
  );
}
