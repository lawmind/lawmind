import { Stack, useRouter } from 'expo-router';

import { OnboardingScreen } from '../src/screens/auth/OnboardingScreen';
import { usePendingDestination } from '../src/state/pendingDestination';

/**
 * Onboarding — the gap between an identity and an advocate, then PD-8 consent.
 *
 * `gestureEnabled: false`: the profile is NOT NULL on `users` and the consent is
 * the legal basis for an unmarked export. Swiping out of either leaves an
 * account the product cannot use, and the advocate would not know why.
 *
 * A HELD LINK OUTLIVES ONBOARDING. An advocate whose first ever contact with
 * this app is a shared judgment arrives with no account at all: they sign in,
 * fill in a name and a phone number, accept the terms — and the judgment they
 * were sent is still what they came for. `auth/verify.tsx` deliberately does
 * not consume the destination for `identity_only`, so it is still here.
 */
export default function Route() {
  const router = useRouter();
  const consume = usePendingDestination((s) => s.consume);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <OnboardingScreen onDone={() => router.replace((consume() ?? '/today') as never)} />
    </>
  );
}
