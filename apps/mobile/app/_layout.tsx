import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAppFonts } from '../src/theme/fonts';
import { useOutbox } from '../src/state/outbox';
import { useReadingStore } from '../src/state/reading';
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
  const hydrate = useReadingStore((s) => s.hydrate);
  const hydrateOutbox = useOutbox((s) => s.hydrate);
  const flushOutbox = useOutbox((s) => s.flush);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Reading position and highlights come off the device before anything is
  // drawn. Offline is a requirement, not an edge case: the moment an advocate
  // most wants their place back is standing in a court building with no signal.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /**
   * PENDING COPY RECORDS GO OUT ON LAUNCH.
   *
   * A "Copy citation" tap made in a court building with no signal is queued on
   * the device, and the next launch — usually somewhere with a connection — is
   * the first chance to deliver it. Until it lands, that advocate is invisible
   * to the overruled fan-out, so this is a correctness step and not telemetry.
   * `SCHEMA_TRUTH.md#citation_copies`.
   */
  useEffect(() => {
    void hydrateOutbox().then(() => flushOutbox());
  }, [hydrateOutbox, flushOutbox]);

  // Nothing renders until the faces are in. A Hindi string in a fallback face
  // is a screen of missing-glyph boxes, and that is a product failure here.
  if (!fontsLoaded && !fontError) return null;

  /**
   * `GestureHandlerRootView` WRAPS EVERYTHING, and must be the outermost view.
   *
   * Without it a `Gesture.Pan()` silently never fires — no warning, no error,
   * the sheet simply does not follow the finger. It is mounted here rather than
   * per screen because gesture-handler resolves the root by walking up, and a
   * second root nested inside the first breaks touch routing between them.
   */
  return (
    <GestureHandlerRootView style={styles.root}>
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
