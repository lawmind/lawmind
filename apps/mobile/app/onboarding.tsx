import { Stack, useRouter } from 'expo-router';

import { OnboardingScreen } from '../src/screens/auth/OnboardingScreen';

/**
 * Onboarding — the gap between an identity and an advocate, then PD-8 consent.
 *
 * `gestureEnabled: false`: the profile is NOT NULL on `users` and the consent is
 * the legal basis for an unmarked export. Swiping out of either leaves an
 * account the product cannot use, and the advocate would not know why.
 */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <OnboardingScreen onDone={() => router.replace('/today')} />
    </>
  );
}
