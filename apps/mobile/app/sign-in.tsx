import { Stack, useRouter } from 'expo-router';

import { SignInScreen } from '../src/screens/auth/SignInScreen';

/** Sign-in — inventory rows 2–3, canvas `10d`. Magic link; no password anywhere. */
export default function Route() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SignInScreen onBack={router.canGoBack() ? () => router.back() : undefined} />
    </>
  );
}
