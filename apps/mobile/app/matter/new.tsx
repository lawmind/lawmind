import { Stack, useRouter } from 'expo-router';

import { NewMatterScreen } from '../../src/screens/matter/NewMatterScreen';

/** Add a matter — inventory rows 25/26, manual path only. See NewMatterScreen's own note. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Add a matter' }} />
      <NewMatterScreen
        onBack={() => router.back()}
        onCreated={(matterId) =>
          router.replace({ pathname: '/matter/[id]', params: { id: matterId } })
        }
      />
    </>
  );
}
