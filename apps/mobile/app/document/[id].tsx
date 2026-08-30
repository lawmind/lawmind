import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { DraftDetailScreen } from '../../src/screens/draft/DraftDetailScreen';
import { CapabilityBoundary } from '../../src/components/CapabilityBoundary';

/** A saved draft by id — R4, read only. */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <CapabilityBoundary surface="drafting">
      <Stack.Screen options={{ headerShown: false }} />
      <DraftDetailScreen
        documentId={id}
        onBack={() => router.back()}
        onOpenJudgment={(judgmentId, citationCheckId) =>
          router.push({
            pathname: '/judgment/[id]',
            params: { id: judgmentId, check: citationCheckId },
          })
        }
      />
    </CapabilityBoundary>
  );
}
