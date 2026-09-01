import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthBoundary } from '../src/components/AuthBoundary';
import { CommandPalette } from '../src/components/CommandPalette';
import { useAppFonts } from '../src/theme/fonts';
import { useCommandPalette } from '../src/state/commandPalette';
import { useOutbox } from '../src/state/outbox';
import { usePendingDestination } from '../src/state/pendingDestination';
import { useReadingStore } from '../src/state/reading';
import { useCapabilities } from '../src/state/capabilities';
import { useSession } from '../src/state/session';
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
  const hydrateSession = useSession((s) => s.hydrate);
  const hydratePendingDestination = usePendingDestination((s) => s.hydrate);
  const fetchCapabilities = useCapabilities((s) => s.fetch);

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

  /**
   * THE SESSION COMES OFF THE KEYCHAIN BEFORE ANY SCREEN ASKS FOR IT.
   *
   * Every authenticated request reads the access token through the bridge in
   * `state/session.ts`, which is registered at module load — so the token has to
   * be in the store by the time the first screen mounts, or the first fetch of
   * the session goes out unauthenticated, 401s, and triggers a refresh that was
   * never needed. The cached profile is shown before the network is consulted:
   * the app opens in court buildings, and a launch that blocks on `GET /me` puts
   * a spinner exactly where one is useless.
   */
  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  /**
   * THE HELD LINK COMES OFF THE DEVICE BESIDE THE SESSION.
   *
   * The magic-link round trip leaves the app, and on Android returning through
   * the deep link can be a COLD START — so the destination an advocate was
   * bounced away from has to survive a process death, not just a re-render.
   * Hydrated here rather than in `AuthBoundary` because the boundary is
   * rendered by the router and `auth/verify.tsx` reads the same store the
   * moment it lands; a hydrate owned by a component that may not be mounted yet
   * is a race with the screen that consumes it.
   */
  useEffect(() => {
    void hydratePendingDestination();
  }, [hydratePendingDestination]);
  /**
   * WHAT THE SERVER STILL SERVES — `GET /release/capabilities`, read once at
   * launch. RCC_V1_API_CONTRACT_R12 §1.6 asks the client to read the registry
   * rather than hardcode the list, so a capability the server withdraws
   * disappears from the app without a release.
   *
   * PUBLIC AND UNAUTHENTICATED, so it runs before and independently of the
   * session. A FAILURE IS NOT AN OUTAGE: `state/capabilities.ts` fails closed
   * for held surfaces and stays OPEN for the v1 core, because search, the
   * reader, saved authorities and matters must work in a court building with
   * no signal. Nothing here blocks the first paint.
   */
  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities]);

  /**
   * CMD/CTRL+K — THE COMMAND PALETTE, WEB ONLY. `9_GLOBAL_COMMAND_CENTER.md`:
   * "Primary shortcut: Cmd/Ctrl + K." Native has no hardware keyboard to bind
   * this to as a rule, so the phone's entry point is the Today-screen trigger
   * instead — `Platform.OS === 'web'` here is the correct gate, not a
   * temporary one.
   *
   * LOCAL WEB ONLY. Master Roadmap v7.1 restores the desktop workstation to v1
   * scope, while NEW3 R14 keeps every public advocate-web capability
   * `DISABLED_NOT_READY`. This listener never fires on the phone because
   * `Platform.OS` is never `'web'` there; the Today-screen mobile trigger is
   * unaffected.
   */
  const toggleCommandPalette = useCommandPalette((s) => s.toggle);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCommandPalette]);

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
      {/*
        DARK GLYPHS. THE APP IS PAPER, EDGE TO EDGE, AND THE CLOCK WAS WHITE ON IT.
        `edgeToEdgeEnabled` puts the app's own ground under the status bar, so the
        system's default light content sat on `#FBFAF7` — observed unreadable on
        a device 8 Aug 2026, on every screen, at every brightness. It never showed
        up anywhere else: a screenshot in a test harness has no status bar, and
        the simulator's is drawn by the OS rather than by us.

        `style` here means the CONTENT colour, not the bar's — "dark" is dark
        glyphs on our light ground. It is set once at the root because every
        surface in this product is paper; a screen that ever needs otherwise sets
        its own and says why.
      */}
      <StatusBar style="dark" />
      <QueryClientProvider client={queryClient}>
        {/*
          THE AUTH BOUNDARY WRAPS EVERY ROUTE, AND IT IS INSIDE THE QUERY
          PROVIDER ON PURPOSE. A screen refused by the gate is never mounted, so
          it never issues the query that would 401 — but the provider still has
          to exist above it, because the screens that ARE rendered are its
          children.
        */}
        <AuthBoundary>
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
        </AuthBoundary>
        {/* Mounted once, globally — a focused layer over whatever screen is live. */}
        <CommandPalette />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
