import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { usePendingDestination } from '../../src/state/pendingDestination';
import { useSession } from '../../src/state/session';
import { color, space } from '../../src/theme/tokens';

/**
 * WHERE THE MAGIC LINK LANDS — `lawmind://auth/verify?token=…`.
 *
 * The link is single-use, so this screen runs the exchange EXACTLY ONCE and
 * says what happened. A retry button would present the same spent token again,
 * and a spent token is indistinguishable from a replayed one — which the server
 * answers by revoking every session the advocate has. So a failure here offers
 * a NEW link, never the same one twice.
 *
 * On success it routes by what the server says exists, not by what we assume:
 * an identity with no profile goes to onboarding, a complete one goes to WHERE
 * THE ADVOCATE WAS TRYING TO GO.
 *
 * THE DESTINATION IS RESUMED HERE. This screen used to `router.replace('/today')`
 * unconditionally, so an advocate who followed a link to a judgment, was bounced
 * to sign in, and verified, landed on the morning screen — with the link already
 * spent. `state/pendingDestination.ts` holds it on the device across the mail
 * round trip and this consumes it exactly once. No held link, an expired one, or
 * one captured for a route we refuse to resume, all fall back to Today.
 */
export default function Route() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const verify = useSession((s) => s.verify);
  const status = useSession((s) => s.status);
  const consume = usePendingDestination((s) => s.consume);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setFailure('That link is missing its token. Ask for a new one.');
      return;
    }
    let alive = true;
    void verify(token).then((r) => {
      if (!alive) return;
      if (!r.ok) setFailure(r.message);
    });
    return () => {
      alive = false;
    };
  }, [token, verify]);

  useEffect(() => {
    /**
     * CONSUMED ONLY ON `signed_in`, NEVER ON `identity_only`.
     *
     * An advocate with no profile is going to onboarding whatever they clicked,
     * and consuming the destination here would spend it on a screen that cannot
     * use it — the link would be gone by the time onboarding finished. The held
     * link survives to `app/onboarding.tsx`, which resumes it after the profile
     * exists.
     */
    if (status === 'signed_in') router.replace((consume() ?? '/today') as never);
    else if (status === 'identity_only') router.replace('/onboarding');
  }, [status, router, consume]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen topInset>
        <View style={styles.body}>
          {failure ? (
            <>
              <Text variant="uiStrong" scale="title">
                That link did not work
              </Text>
              <Text variant="ui" style={styles.muted}>
                {failure}
              </Text>
              <Text variant="ui" style={styles.muted}>
                Sign-in links work once and expire after fifteen minutes.
              </Text>
              <Button label="Send me a new link" onPress={() => router.replace('/sign-in')} />
            </>
          ) : (
            <Text variant="ui" style={styles.muted}>
              Signing you in…
            </Text>
          )}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, flex: 1, justifyContent: 'center' },
  muted: { color: color.inkMuted },
});
