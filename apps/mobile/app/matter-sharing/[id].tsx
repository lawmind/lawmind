import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { MatterSharingScreen } from '../../src/screens/matter/MatterSharingScreen';

/** "Who can see this matter" — PD-3, inventory row 75. Owner-side only. */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Sharing' }} />
      <MatterSharingScreen matterId={id} onBack={() => router.back()} />
    </>
  );
}
