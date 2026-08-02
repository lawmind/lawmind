import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAppFonts } from '../src/theme/fonts';
import { color, family, type as typeScale } from '../src/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden; nothing to do.
});

/**
 * One QueryClient for the app. Offline is a hard requirement, not an edge case:
 * court buildings have terrible connectivity, so a failed fetch retries rather
 * than falling straight to an error, and cached data stays readable.
 *
 * What it must NEVER do is serve a stale cached ANSWER. When the AI is
 * unavailable the app says so plainly — that is a screen, not a cache policy.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000, gcTime: 24 * 60 * 60 * 1000 } },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Nothing renders until the faces are in. A Hindi string in a fallback face
  // is a screen of missing-glyph boxes, and that is a product failure here.
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.paper },
          headerShadowVisible: false,
          headerTintColor: color.ink,
          headerTitleStyle: { fontFamily: family.uiMedium, fontSize: typeScale.body.fontSize },
          contentStyle: { backgroundColor: color.paper },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
