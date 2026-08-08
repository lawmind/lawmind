import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { MatterScreen } from '../../src/screens/matter/MatterScreen';

/** A matter by id — the workspace, and the retention moat. Inventory rows 25–27. */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Matter' }} />
      <MatterScreen
        matterId={id}
        onBack={() => router.back()}
        onOpenBriefing={(briefingId) =>
          router.push({ pathname: '/briefing/[id]', params: { id: briefingId } })
        }
        onRecordAdjournment={() =>
          router.push({ pathname: '/adjournment/[id]', params: { id } })
        }
        onSendClientUpdate={() =>
          router.push({ pathname: '/client-update/[id]', params: { id } })
        }
        onShare={() =>
          // `as never`: new route, matches the pattern used elsewhere for a
          // route the generated typed-route union has not been regenerated
          // to include yet (see MattersScreen.tsx's `/sign-in` push).
          router.push({ pathname: '/matter-sharing/[id]', params: { id } } as never)
        }
      />
    </>
  );
}
