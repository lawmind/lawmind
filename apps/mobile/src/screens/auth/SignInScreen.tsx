import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { useSession } from '../../state/session';
import { color, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SIGN IN — inventory rows 2–3, canvas `10d`, `renders/44-splash-signin@2x.png`.
 *
 * A magic link to an email address. No password anywhere in this product, which
 * is also why there is no password to leak, reuse or reset
 * (`SCHEMA_TRUTH.md#auth_account`).
 *
 * PD-2 — ENROLMENT NEVER GATES. The bar enrolment number is asked for AFTER the
 * advocate is in, on the profile screen, and a `rejected` enrolment still has
 * full access. It is captured for positioning — a tool for licensed
 * practitioners — and never for security, because no public Bar Council
 * verification API exists and gating on it would mean a manual queue on every
 * signup. Nothing on this screen asks for it.
 *
 * THE RESPONSE IS `{ sent: true }` WHATEVER THE ADDRESS, and the copy matches
 * that: "if that address is registered" would be a lie in the other direction,
 * and naming whether an account exists is an enumeration oracle. What is said is
 * simply what was done — a link was sent.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function SignInScreen({ onBack }: { onBack?: () => void }) {
  const requestLink = useSession((s) => s.requestLink);
  const endedByServer = useSession((s) => s.endedByServer);

  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [failure, setFailure] = useState<string | null>(null);

  const send = async () => {
    if (!email.includes('@')) {
      setFailure('That does not look like an email address.');
      setPhase('failed');
      return;
    }
    setPhase('sending');
    setFailure(null);
    const res = await requestLink(email);
    if (res.ok) setPhase('sent');
    else {
      setFailure(res.message);
      setPhase('failed');
    }
  };

  if (phase === 'sent') {
    return (
      <Screen topInset>
        <View style={styles.body}>
          <Text variant="eyebrow">Check your email</Text>
          <Text variant="uiStrong" scale="title">
            We sent a link to {email}
          </Text>
          <Text variant="ui" style={styles.muted}>
            Open it on this phone and you are in. The link works once and expires in fifteen
            minutes.
          </Text>
          <Pressable onPress={() => setPhase('idle')} style={styles.secondary}>
            <Text variant="ui" style={styles.link}>
              Use a different address
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen topInset>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text variant="eyebrow">Lawmind</Text>
          <Text variant="uiStrong" scale="title">
            Sign in
          </Text>

          {/*
            AN ADVOCATE SIGNED OUT BY THE SERVER DESERVES TO KNOW IT WAS NOT
            THEIR DOING. It happens when a refresh token is replayed, which
            revokes every session — rare, and alarming if it is unexplained in
            the middle of a hearing day.
          */}
          {endedByServer ? (
            <Text variant="ui" style={styles.muted}>
              You were signed out on every device. That happens when a sign-in link is used twice.
              Signing in again is enough.
            </Text>
          ) : null}

          <Input
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            label="Email"
            onChangeText={(next) => {
              setEmail(next);
              if (phase === 'failed') setPhase('idle');
            }}
            placeholder="you@chambers.in"
            value={email}
          />

          {failure ? (
            <Text variant="ui" style={styles.failure}>
              {failure}
            </Text>
          ) : null}

          <Button
            disabled={phase === 'sending'}
            label={phase === 'sending' ? 'Sending…' : 'Send me a link'}
            onPress={() => void send()}
          />

          <Text variant="ui" style={styles.muted}>
            No password. We send a link and you are in.
          </Text>

          {onBack ? (
            <Pressable onPress={onBack} style={styles.secondary}>
              <Text variant="ui" style={styles.link}>
                Not now
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  muted: { color: color.inkMuted },
  /** Our own uncertainty is neutral ink. Never amber — amber means the law moved. */
  failure: { color: color.inkMuted },
  link: { color: color.oxblood },
  secondary: { minHeight: 44, justifyContent: 'center' },
});
