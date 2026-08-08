import { Stack, useRouter } from 'expo-router';

import { SubscriptionScreen } from '../src/screens/subscription/SubscriptionScreen';

/** Subscription — SPRINT_5 item 4, PD-13. Inventory rows 40/115. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Plan' }} />
      <SubscriptionScreen onBack={() => router.back()} />
    </>
  );
}
