import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { runAttempt } from '../../api/attempt';
import { api } from '../../api/client';
import { useAttempt } from '../../hooks/useAttempt';
import type { DataRequest } from '../../api/contract';
import { useSession } from '../../state/session';
import { haptics } from '../../theme/haptics';
import { color, radius, space } from '../../theme/tokens';

/**
 * DELETE ACCOUNT — P9 of the NEW3 product/premium/release round.
 *
 * `POST /me/data-requests { kind: 'erasure' }` (`services/api/src/auth/
 * data-requests.ts`) already existed and had no client anywhere; the old
 * comment in `SettingsScreen.tsx` claiming no advocate-facing endpoint
 * existed was stale, checked against `services/api/src/app.ts:318-321`.
 *
 * REQUESTING IS NOT EXECUTING — the route's own module note, and the reason
 * every string on this screen says "request" rather than "deleted". Erasure
 * runs from the admin side (`erasure.ts`'s `eraseUser`) so a mis-tapped
 * button on a phone cannot destroy an account by itself. `dueAt` is echoed
 * back from the server, never computed on the client — `RESPONSE_DAYS` is
 * Lawmind's own service commitment, not a statutory number this screen may
 * invent (`data-requests.ts` module note, `docs/FOUNDER_QUEUE.md`).
 *
 * The consequence summary below is drawn from `eraseUser`'s own doc comment,
 * not guessed: matters/drafts/saved searches/alerts/citation copies are
 * deleted outright; the account identity is redacted; an anonymised row
 * survives only where `audit_log` (append-only) or another advocate's
 * `citation_disputes`/`matter_authorities` reference this user, because
 * deleting those would remove evidence other people rely on. Uploaded
 * documents in R2 are a separate credential the API does not hold — disclosed
 * as a residual risk, never claimed as handled.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT SERVES AN ADVOCATE WITH NO PROFILE — 2 September 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `identity_only` is a real account: a verified email, a name on `auth_user`, an
 * IP address and user-agent per session, magic-link artifacts keyed by the email
 * with nothing to cascade from, and a hashed token family. All of it is personal
 * data under DPDP whether or not anyone finished onboarding, and until LCC R26
 * (`ab4b4989`) there was no way to ask for it back.
 *
 * There is NO SECOND SCREEN for them and no different flow — NEW3 bus 1728 §6.
 * This one screen serves both, and the only thing that changes is where the
 * confirmation email is read from: `profile.email` for an advocate who has one,
 * the session's `identityEmail` for one who does not. The confirmation step
 * itself STAYS. It is data we already hold, so it costs the advocate nothing,
 * and it is the only thing standing between a mis-tap and an erasure request.
 *
 * NOTHING HERE CREATES A PROFILE. Not as a prerequisite, not silently, not to
 * make the copy above read better. `eraseUser` reaches the identity rows without
 * one, and manufacturing personal data as the price of erasing personal data is
 * the defect this closes rather than a step in it.
 */
export function DeleteAccountScreen({
  onBack,
  backLabel = 'Settings',
}: {
  onBack: () => void;
  /**
   * Where back actually goes. An `identity_only` advocate arrives from
   * onboarding, not from Settings, and a link that names a screen they have
   * never seen is a small lie on a screen that cannot afford one.
   */
  backLabel?: string;
}) {
  const profile = useSession((s) => s.profile);
  const identityEmail = useSession((s) => s.identityEmail);
  const [requests, setRequests] = useState<DataRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void api.listDataRequests().then((r) => {
      if (r.ok) setRequests(r.data.requests);
      else setLoadError(r.error.message);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openErasure = requests?.find(
    (r) => r.kind === 'erasure' && (r.status === 'received' || r.status === 'in_progress'),
  );
  const lastErasure = requests?.filter((r) => r.kind === 'erasure')[0] ?? null;

  /**
   * THE PROFILE FIRST, THE IDENTITY SECOND, AND NEVER A PLACEHOLDER.
   *
   * For a signed-in advocate the two say the same thing. For `identity_only`
   * the profile is `null` and the identity is the only email this account has.
   * If BOTH are absent — a cold launch with no cached email and no signal — the
   * screen says so and refuses rather than accepting any typed string: matching
   * against nothing would turn the confirmation into a formality.
   */
  const expectedEmail = (profile?.email ?? identityEmail ?? '').trim().toLowerCase();
  const confirmed = expectedEmail.length > 0 && confirmText.trim().toLowerCase() === expectedEmail;

  /**
   * ONE ERASURE REQUEST PER INTENTION.
   *
   * `POST /me/data-requests` looks up an open request of the same kind before
   * inserting, but that is a sequential read with no database uniqueness behind
   * it — R16 §2 records it as exactly that — so two concurrent taps CAN both
   * insert. The synchronous latch stops the double tap; the attempt key stops
   * the lost-response retry.
   */
  const attempt = useAttempt();

  async function requestErasure() {
    const attemptKey = attempt.begin();
    if (attemptKey === null) return;
    if (!confirmed) {
      attempt.settle();
      return;
    }
    setWorking(true);
    setNote(null);
    const r = await runAttempt(attemptKey, (key) => api.createDataRequest('erasure', undefined, key));
    setWorking(false);
    if (r.ok) {
      attempt.complete();
      haptics.reject();
      setConfirmText('');
      load();
    } else {
      attempt.settle();
      setNote(r.error.message);
    }
  }

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            {`‹ ${backLabel}`}
          </Text>
        </Pressable>

        <Text variant="eyebrow">Delete account</Text>
        <Text variant="uiStrong" scale="title">
          This closes your account permanently
        </Text>

        {loadError ? (
          <Text variant="ui" style={styles.error}>
            {loadError}
          </Text>
        ) : null}

        {openErasure ? (
          <View style={styles.card}>
            <Text variant="uiStrong">Your request has been received.</Text>
            <Text variant="ui" style={styles.muted}>
              {openErasure.status === 'in_progress'
                ? 'An operator is completing it now.'
                : `An operator will complete it by ${formatWhen(openErasure.dueAt)}.`}
            </Text>
            <Text variant="ui" style={styles.muted}>
              You can keep using Lawmind until then. Signing out does not cancel this request.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text variant="uiStrong">What this deletes</Text>
              <Text variant="ui" style={styles.muted}>
                Every matter, draft, saved search, alert and citation-copy record you created —
                permanently. Your name, phone number, email and bar enrolment number are removed
                from your account.
              </Text>
              <Text variant="uiStrong" style={styles.subhead}>
                What this cannot remove
              </Text>
              <Text variant="ui" style={styles.muted}>
                If you ever upheld a citation dispute or added an authority to a matter another
                advocate shares, that record stays — with your name replaced by an anonymous
                marker — because deleting it would remove evidence other advocates rely on.
                Documents you uploaded are also held in separate file storage; we cannot promise
                every copy, including a very recent backup, is gone immediately. This is a real
                limit, stated plainly rather than hidden.
              </Text>
            </View>

            {lastErasure && (lastErasure.status === 'completed' || lastErasure.status === 'refused') ? (
              <Text variant="ui" style={styles.muted}>
                {lastErasure.status === 'completed'
                  ? `Your last request completed ${formatWhen(lastErasure.completedAt)}.`
                  : `Your last request was not completed: ${lastErasure.refusalReason ?? 'no reason given'}.`}
              </Text>
            ) : null}

            <Text variant="uiStrong" style={styles.subhead}>
              Type your email to confirm
            </Text>
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setConfirmText}
              placeholder={profile?.email ?? identityEmail ?? 'you@example.com'}
              value={confirmText}
            />
            {/*
              We cannot ask somebody to confirm an address we do not have. This
              is the offline cold-start case, and saying so beats a button that
              is disabled for a reason nothing on screen explains.
            */}
            {expectedEmail.length === 0 ? (
              <Text variant="ui" style={styles.muted}>
                We could not read the email on your account. Reconnect and open this screen again —
                nothing has been sent.
              </Text>
            ) : null}

            <Button
              disabled={!confirmed || working}
              label={working ? 'Sending request…' : 'Request account deletion'}
              onPress={() => void requestErasure()}
              style={styles.deleteButton}
              variant="primary"
            />

            {note ? (
              <Text variant="ui" style={styles.error}>
                {note}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** "23 August 2026." Never a raw ISO string on screen. */
function formatWhen(at: string | null): string {
  if (!at) return 'soon';
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
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
    marginTop: space.sm,
  },
  subhead: { marginTop: space.xs },

  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
  deleteButton: { marginTop: space.sm },
});
