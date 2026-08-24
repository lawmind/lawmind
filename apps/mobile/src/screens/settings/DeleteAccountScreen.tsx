import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
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
 */
export function DeleteAccountScreen({ onBack }: { onBack: () => void }) {
  const profile = useSession((s) => s.profile);
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

  const expectedEmail = (profile?.email ?? '').trim().toLowerCase();
  const confirmed = expectedEmail.length > 0 && confirmText.trim().toLowerCase() === expectedEmail;

  async function requestErasure() {
    if (!confirmed) return;
    setWorking(true);
    setNote(null);
    const r = await api.createDataRequest('erasure');
    setWorking(false);
    if (r.ok) {
      haptics.reject();
      setConfirmText('');
      load();
    } else {
      setNote(r.error.message);
    }
  }

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Settings
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
              placeholder={profile?.email ?? 'you@example.com'}
              value={confirmText}
            />

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
