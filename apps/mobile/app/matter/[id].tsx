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
        onOpenCounterArguments={() =>
          // `as never` — same reason as `/matter-sharing` below: the typed-route
          // union is generated from the file tree at dev-server start and has
          // not seen this route yet.
          router.push({ pathname: '/counter-arguments', params: { matterId: id } } as never)
        }
        onOpenJudgment={(judgmentId) =>
          router.push({ pathname: '/judgment/[id]', params: { id: judgmentId } })
        }
        onRecordAdjournment={() => router.push({ pathname: '/adjournment/[id]', params: { id } })}
        onOpenPremiumPlans={() => router.push('/subscription' as never)}
        onSendClientUpdate={() => router.push({ pathname: '/client-update/[id]', params: { id } })}
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
