import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { CapabilityBoundary } from '../../src/components/CapabilityBoundary';
import { MatterSharingScreen } from '../../src/screens/matter/MatterSharingScreen';

/**
 * "Who can see this matter" — PD-3, inventory row 75. Owner-side only.
 *
 * GATED AT THE ROUTE, NOT ONLY AT THE BUTTON. `matterSharing` is `POST_V1` in
 * `V1_SURFACE`, and `MatterScreen.tsx` already renders its entry only when
 * `sharingEnabled` — but the button was the whole of the gate. A stale deep
 * link, a saved link or a shared URL reached this route directly and its API
 * effects ran. `CapabilityBoundary`'s own docstring is the spec: "keeps a held
 * route absent even when a stale deep link still names it."
 */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <CapabilityBoundary surface="matterSharing">
      <Stack.Screen options={{ title: 'Sharing' }} />
      <MatterSharingScreen matterId={id} onBack={() => router.back()} />
    </CapabilityBoundary>
  );
}
