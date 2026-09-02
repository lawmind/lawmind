import { Stack, useRouter } from 'expo-router';

import { DeleteAccountScreen } from '../src/screens/settings/DeleteAccountScreen';
import { useSession } from '../src/state/session';

/**
 * Delete account — DPDP Act erasure request. `POST /me/data-requests`.
 *
 * REACHED FROM TWO PLACES, and the back link says which. A signed-in advocate
 * arrives from Settings; an `identity_only` advocate arrives from onboarding,
 * which is the only screen they can see. `AuthBoundary` admits both
 * (`IDENTITY_ONLY_ROUTES`) since LCC R26 made the endpoint principal-aware.
 */
export default function Route() {
  const router = useRouter();
  const status = useSession((s) => s.status);

  return (
    <>
      <Stack.Screen options={{ title: 'Delete account' }} />
      <DeleteAccountScreen
        backLabel={status === 'identity_only' ? 'Back' : 'Settings'}
        onBack={() => router.back()}
      />
    </>
  );
}
