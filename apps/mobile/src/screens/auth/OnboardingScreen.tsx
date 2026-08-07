import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { CurrentTerms } from '../../api/contract';
import { useSession } from '../../state/session';
import { haptics } from '../../theme/haptics';
import { color, radius, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONBOARDING — the gap between an identity and an advocate.
 *
 * `POST /auth/verify` proves an email address is reachable. It does NOT create a
 * profile: `GET /me` answers `profileComplete: false` until `PATCH /me` supplies
 * a name and a phone number. That is a real state — somebody who abandoned this
 * screen — and this is where it is closed.
 *
 * Two steps, in this order and no other:
 *
 *   1. WHO YOU ARE — name and phone. Both are NOT NULL on `users`.
 *   2. THE TERMS — PD-8. Actively accepted, recorded with a VERSION.
 *
 * PD-2 — THE ENROLMENT NUMBER IS OPTIONAL AND NEVER GATES. It sits on step one
 * with "optional" beside it, and skipping it costs nothing at all: a `rejected`
 * enrolment still has full access. It exists for positioning — a tool for
 * licensed practitioners — not for security. The server has a test that fails
 * the build if any module so much as COMPARES `enrolment_status`, and this
 * screen must not become the first one that does.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const completeProfile = useSession((s) => s.completeProfile);
  const profile = useSession((s) => s.profile);

  const [step, setStep] = useState<'identity' | 'terms'>(profile ? 'terms' : 'identity');
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [phone, setPhone] = useState('');
  const [enrolment, setEnrolment] = useState(profile?.barEnrolmentNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submitIdentity = async () => {
    if (fullName.trim().length < 2) {
      setFailure('We need a name to put on your drafts.');
      return;
    }
    if (phone.trim().length < 6) {
      setFailure('We need a phone number for your account.');
      return;
    }
    setSaving(true);
    setFailure(null);
    const res = await completeProfile({ fullName, phone, barEnrolmentNumber: enrolment || null });
    setSaving(false);
    if (!res.ok) {
      setFailure(res.message);
      return;
    }
    setStep('terms');
  };

  if (step === 'terms') {
    return <ConsentStep onAccepted={onDone} />;
  }

  return (
    <Screen topInset>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text variant="eyebrow">Your details</Text>
          <Text variant="uiStrong" scale="title">
            How should we address you?
          </Text>
          <Text variant="ui" style={styles.muted}>
            This is the name that appears on drafts you export.
          </Text>

          <Input
            autoCapitalize="words"
            label="Full name"
            onChangeText={setFullName}
            placeholder="Adv. Ananya Sharma"
            value={fullName}
          />
          <Input
            keyboardType="phone-pad"
            label="Phone"
            onChangeText={setPhone}
            placeholder="98xxxxxxxx"
            value={phone}
          />
          {/*
            PD-2 — CAPTURED, NEVER A GATE. The copy says so out loud rather than
            leaving an advocate to wonder whether leaving it blank costs them
            something. It does not.
          */}
          <Input
            autoCapitalize="characters"
            label="Bar enrolment number — optional"
            onChangeText={setEnrolment}
            placeholder="D/1234/2011"
            value={enrolment}
          />
          <Text variant="ui" style={styles.muted}>
            Optional, and it never affects what you can do here. We show it as verification pending
            until a bar council confirms it.
          </Text>

          {failure ? (
            <Text variant="ui" style={styles.failure}>
              {failure}
            </Text>
          ) : null}

          <Button
            disabled={saving}
            label={saving ? 'Saving…' : 'Continue'}
            onPress={() => void submitIdentity()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONSENT SCREEN — PD-8, canvas `12c`, `renders/66-consent-clean-draft@2x.png`.
 *
 * This screen is the legal basis for every exported document carrying NO MARK.
 * The earlier decision watermarked the output; PD-8 superseded it because an
 * advocate who has explicitly accepted these terms is a professional operating
 * under their own duty to the court, and a watermark on a court filing is both
 * patronising and a competitive disadvantage.
 *
 * THE TEXT COMES FROM THE SERVER, VERBATIM, AND THAT IS NOT A SHORTCUT.
 * `POST /me/accept-terms` records a VERSION. If this screen rendered its own
 * wording, the version stored against the advocate would name text they never
 * read — which is precisely the thing a recorded consent exists to prevent. The
 * render draws three numbered clauses whose words differ from
 * `GET /terms/current`; the render's TYPOGRAPHY is followed and its WORDING is
 * not, and that divergence is deliberate. Recorded rather than silently chosen.
 *
 * ACCEPTANCE IS ACTIVE. A checkbox that starts unticked and a button that stays
 * disabled until it is. Nothing infers consent from any other action — not from
 * signing in, not from generating a draft, not from scrolling to the bottom.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function ConsentStep({ onAccepted }: { onAccepted: () => void }) {
  const [terms, setTerms] = useState<CurrentTerms | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api.currentTerms().then((r) => {
      if (!alive) return;
      if (r.ok) setTerms(r.data);
      else setFailure(r.error.message);
    });
    return () => {
      alive = false;
    };
  }, []);

  const accept = async () => {
    if (!terms) return;
    setSaving(true);
    setFailure(null);
    const res = await api.acceptTerms(terms.version);
    setSaving(false);
    if (!res.ok) {
      setFailure(res.error.message);
      return;
    }
    haptics.commit();
    onAccepted();
  };

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow" style={styles.termsEyebrow}>
          Terms of use
        </Text>
        <View style={styles.oxbloodRule} />

        <Text variant="uiStrong">Lawmind drafts. You are the advocate.</Text>
        <Text variant="ui" style={styles.muted}>
          Read these once — they will not be shown again, and nothing you produce will carry a
          disclaimer.
        </Text>

        {terms ? (
          <View style={styles.clauses}>
            {terms.body
              .split(/\n{2,}/)
              .map((clause) => clause.replace(/\n/g, ' ').trim())
              .filter(Boolean)
              .map((clause, index) => (
                <View key={clause.slice(0, 40)} style={styles.clause}>
                  <Text variant="record" style={styles.clauseNumber}>
                    {index + 1}
                  </Text>
                  <Text variant="legal" style={styles.clauseText}>
                    {clause}
                  </Text>
                </View>
              ))}
          </View>
        ) : (
          <Text variant="ui" style={styles.muted}>
            {failure ?? 'Loading the terms…'}
          </Text>
        )}

        {/*
          ACTIVE ACCEPTANCE. The box starts unticked, the button is dead until it
          is ticked, and neither state is inferred from anything else.
        */}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          disabled={!terms}
          onPress={() => setAccepted((a) => !a)}
          style={styles.acceptRow}
        >
          <View style={[styles.checkBox, accepted ? styles.checkBoxOn : null]}>
            {accepted ? (
              <Text variant="uiStrong" style={styles.checkMark}>
                ✓
              </Text>
            ) : null}
          </View>
          <Text variant="ui" style={styles.acceptLabel}>
            I accept these terms and the privacy terms.
          </Text>
        </Pressable>

        {failure && terms ? (
          <Text variant="ui" style={styles.failure}>
            {failure}
          </Text>
        ) : null}

        <Button
          disabled={!accepted || !terms || saving}
          label={saving ? 'Recording…' : 'Agreed — continue'}
          onPress={() => void accept()}
        />

        {terms ? (
          <Text variant="record" style={styles.version}>
            Version {terms.version}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },

  termsEyebrow: { color: color.oxblood },
  oxbloodRule: { height: 2, backgroundColor: color.oxblood },

  clauses: { gap: space.sm, paddingTop: space.xs },
  clause: { flexDirection: 'row', gap: space.sm },
  clauseNumber: { color: color.oxblood, width: 18 },
  clauseText: { flex: 1 },

  acceptRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52 },
  checkBox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: color.ink,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: color.ink },
  checkMark: { color: color.card },
  acceptLabel: { flex: 1 },

  version: { color: color.inkMuted, textAlign: 'center' },
  muted: { color: color.inkMuted },
  failure: { color: color.inkMuted },
});
