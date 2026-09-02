import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { runAttempt } from '../../api/attempt';
import { api } from '../../api/client';
import { useAttempt } from '../../hooks/useAttempt';
import type { TrainingConsent } from '../../api/contract';
import { haptics } from '../../theme/haptics';
import { color, space } from '../../theme/tokens';

/**
 * TRAINING DATA — DPDP Act 2023 s. 6. `docs/API_CONTRACTS.md` §Training consent.
 *
 * NOT PD-8. Accepting the onboarding terms is agreeing that Lawmind assists
 * and that its output must be verified. This answers a different, specific
 * question: may an advocate's own accepted search results, the drafts they
 * keep, and the citations they add to a matter be used to train a future
 * Lawmind model? s. 6 requires that question be asked separately, answered
 * freely — never a condition of using the app — and withdrawable exactly as
 * easily as it was given. So this lives in Settings, not onboarding, and
 * withdrawal is one tap with no confirmation dialog.
 *
 * `granted` and `isCurrent` are different facts. Consent given against a
 * superseded notice is real consent and not consent to today's notice — a
 * row where `granted && !isCurrent` renders the same "not yet agreed" state
 * as `!granted`, because that is the honest one: nothing on today's notice
 * has been agreed to yet.
 */
export function TrainingConsentScreen({ onBack }: { onBack: () => void }) {
  const [consent, setConsent] = useState<TrainingConsent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void api.trainingConsent().then((r) => {
      if (r.ok) setConsent(r.data);
      else setLoadError(r.error.message);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * ONE LATCH FOR BOTH BUTTONS, AND ONE KEY THAT ENDS AT EACH DECISION.
   *
   * DPDP s. 6 consent is an intentional act and grant/withdraw/grant is THREE
   * intentional acts, not one repeated — `POST /me/training-consent` updates the
   * user AND appends a consent audit event per call, and that audit trail is the
   * point. So each decision that LANDS calls `complete()` and the next one mints
   * a fresh key; only a decision that FAILED keeps its key, because retrying it
   * is the same act.
   *
   * `withdraw` is a DELETE and carries no key — it is idempotent server-side by
   * its own contract ("succeeds even where nothing was granted") and is not one
   * of R16's six. It shares the latch because it shares the `working` flag: a
   * tap on one button while the other is in flight must do nothing.
   */
  const attempt = useAttempt();

  async function grant() {
    const attemptKey = attempt.begin();
    if (attemptKey === null) return;
    if (!consent) {
      attempt.settle();
      return;
    }
    setWorking(true);
    setNote(null);
    const r = await runAttempt(attemptKey, (key) =>
      api.grantTrainingConsent(consent.currentVersion, key),
    );
    setWorking(false);
    if (r.ok) {
      attempt.complete();
      setConsent(r.data);
      haptics.commit();
    } else {
      // STALE_CONSENT_VERSION or a network failure both land here. Re-reading
      // rather than guessing keeps `currentVersion` honest either way. The key
      // is kept: a stale version is a corrected request, and R16 §5 guarantees
      // a validation refusal did not consume it.
      attempt.settle();
      setNote(r.error.message);
      load();
    }
  }

  async function withdraw() {
    if (attempt.begin() === null) return;
    setWorking(true);
    setNote(null);
    const r = await api.withdrawTrainingConsent();
    setWorking(false);
    if (r.ok) {
      // A withdrawal is a decision of its own. The next grant is a new act and
      // must not replay the key of the grant this just undid.
      attempt.complete();
      setConsent(r.data);
      haptics.shift();
    } else {
      attempt.settle();
      setNote(r.error.message);
    }
  }

  const agreedToCurrent = !!consent?.granted && consent.isCurrent;

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Settings
          </Text>
        </Pressable>

        <Text variant="eyebrow">Training data</Text>
        <Text variant="uiStrong" scale="title">
          Help train a future Lawmind
        </Text>
        <Text variant="ui" style={styles.muted}>
          A separate question from the terms you accepted to use the app. This is about whether
          your own use — search results you act on, drafts you keep, citations you add to a
          matter — can teach a future model. It changes nothing about what Lawmind does for you
          today, either way.
        </Text>

        {loadError ? (
          <Text variant="ui" style={styles.error}>
            {loadError}
          </Text>
        ) : null}

        {consent ? (
          <View style={styles.card}>
            {agreedToCurrent ? (
              <>
                <Text variant="uiStrong">You have agreed to this.</Text>
                <Text variant="ui" style={styles.muted}>
                  Recorded {formatWhen(consent.grantedAt)}, notice version {consent.version}.
                </Text>
                <Button
                  disabled={working}
                  label={working ? 'Withdrawing…' : 'Withdraw'}
                  onPress={() => void withdraw()}
                  variant="secondary"
                />
                <Text variant="ui" style={styles.muted}>
                  Withdrawing takes effect immediately and costs you nothing — there is no
                  confirmation step because there should not need to be one. It does not sign you
                  out, and it does not touch the terms of use you agreed to when you joined —
                  those are a separate agreement and this screen cannot change them.
                </Text>
              </>
            ) : (
              <>
                <Text variant="uiStrong">
                  {consent.granted ? 'The notice has changed since you last agreed.' : 'Not agreed yet.'}
                </Text>
                <Text variant="ui" style={styles.muted}>
                  {consent.granted
                    ? 'Your earlier agreement was to an older version. Nothing from your account is used for training until you agree to the current one.'
                    : 'Nothing from your account is used to train any model unless you agree here.'}
                </Text>
                <Button
                  disabled={working}
                  label={working ? 'Recording…' : 'Agree'}
                  onPress={() => void grant()}
                />
              </>
            )}
          </View>
        ) : loadError ? null : (
          <Text variant="ui" style={styles.muted}>
            Loading…
          </Text>
        )}

        {note ? (
          <Text variant="ui" style={styles.error}>
            {note}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** "Agreed 6 August 2026." Never a raw ISO string on screen. Null reads as absence, not as today. */
function formatWhen(at: string | null): string {
  if (!at) return 'just now';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.xs, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },

  card: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 2,
    padding: space.sm,
    gap: space.xs,
    marginTop: space.sm,
  },

  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
});
