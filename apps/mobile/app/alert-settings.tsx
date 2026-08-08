import { Stack, useRouter } from 'expo-router';

import { AlertSettingsScreen } from '../src/screens/alerts/AlertSettingsScreen';

/** Alert settings — PD-5, PD-6. Inventory row 80. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Alerts' }} />
      <AlertSettingsScreen onBack={() => router.back()} />
    </>
  );
}
