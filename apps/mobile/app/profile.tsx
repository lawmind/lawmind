import { Stack, useRouter } from 'expo-router';

import { ProfileScreen } from '../src/screens/profile/ProfileScreen';

/** Profile — inventory row 39. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ProfileScreen
        onOpenSettings={() => router.push('/settings' as never)}
        onOpenSubscription={() => router.push('/subscription' as never)}
      />
    </>
  );
}
