import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { CounterArgumentsScreen } from '../src/screens/draft/CounterArgumentsScreen';

/**
 * Counter-arguments — `FEATURE_PARITY.md` §2.9.
 *
 * `matterId` is optional: the endpoint accepts the position on its own, and
 * the screen is reachable from a matter today. Reached without one it still
 * works, which is why the param is read rather than required.
 */
export default function Route() {
  const router = useRouter();
  const { matterId } = useLocalSearchParams<{ matterId?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Counter-arguments' }} />
      <CounterArgumentsScreen matterId={matterId} onBack={() => router.back()} />
    </>
  );
}
