import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { BriefingScreen } from '../../src/screens/briefing/BriefingScreen';
import { CapabilityBoundary } from '../../src/components/CapabilityBoundary';

/**
 * The 24-hour hearing briefing — the wedge. Inventory row 8, canvas `8b`.
 *
 * Presented as a modal-style takeover rather than a push: it is read once,
 * standing up, and closed. `renders/45-briefing@2x.png` shows "Close" top left
 * rather than a back chevron for exactly that reason.
 */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <CapabilityBoundary surface="briefing">
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <BriefingScreen
        briefingId={id}
        onClose={() => router.back()}
        onOpenJudgment={(judgmentId, check) =>
          router.push({
            pathname: '/judgment/[id]',
            params: check ? { id: judgmentId, check } : { id: judgmentId },
          })
        }
      />
    </CapabilityBoundary>
  );
}
