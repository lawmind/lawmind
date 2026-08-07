import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { AdjournmentScreen } from '../../src/screens/adjournment/AdjournmentScreen';

/**
 * Adjournment capture — inventory rows 99–100, canvas `12f`.
 *
 * `headerShown: false` because the screen draws its own top row: "Cancel" and
 * the signal state. A stack header would push the four 64px targets down out of
 * the lower half, which is the one thing this screen's layout is for.
 */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AdjournmentScreen
        matterId={id}
        onCancel={() => router.back()}
        onDone={() => router.back()}
      />
    </>
  );
}
