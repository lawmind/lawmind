import { Stack, useRouter } from 'expo-router';

import { CoverageScreen } from '../src/screens/settings/CoverageScreen';

/** What we hold — R3, corpus coverage per court. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Coverage' }} />
      <CoverageScreen onBack={() => router.back()} />
    </>
  );
}
