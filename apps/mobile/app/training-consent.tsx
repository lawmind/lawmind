import { Stack, useRouter } from 'expo-router';

import { TrainingConsentScreen } from '../src/screens/settings/TrainingConsentScreen';

/** Training data consent — DPDP Act 2023 s. 6. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Training data' }} />
      <TrainingConsentScreen onBack={() => router.back()} />
    </>
  );
}
