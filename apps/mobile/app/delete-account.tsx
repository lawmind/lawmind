import { Stack, useRouter } from 'expo-router';

import { DeleteAccountScreen } from '../src/screens/settings/DeleteAccountScreen';

/** Delete account — DPDP Act erasure request. `POST /me/data-requests`. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Delete account' }} />
      <DeleteAccountScreen onBack={() => router.back()} />
    </>
  );
}
