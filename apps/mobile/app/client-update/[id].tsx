import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ClientUpdateScreen } from '../../src/screens/clientupdate/ClientUpdateScreen';

/** Client update share — inventory rows 101–102, canvas `12g`. The viral loop. */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Send to client' }} />
      <ClientUpdateScreen matterId={id} onBack={() => router.back()} />
    </>
  );
}
