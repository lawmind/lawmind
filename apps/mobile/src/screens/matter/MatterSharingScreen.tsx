import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import { color, space } from '../../theme/tokens';

/**
 * "WHO CAN SEE THIS MATTER" — PD-3, PD-4. Inventory row 75,
 * `renders/59-chamber-sharing@2x.png`. Owner-side only: `getMatter`/
 * `listMatters` in `services/api/src/matters/route.ts` filter strictly on
 * `user_id = owner`, so an invited advocate has no endpoint that will ever
 * show them this matter yet — flagged to LCC in `RCC_TO_LCC_HANDOFF.md`
 * and `docs/FOUNDER_QUEUE.md`, 8 Aug 2026. This screen is real and complete
 * for the half of the feature that works today.
 *
 * PER MATTER, BY INVITATION. THERE IS NO CHAMBER-WIDE SWITCH, on purpose —
 * see the module note in `services/api/src/matters/shares.ts`.
 *
 * The render draws a per-share permission line ("Can read and add events")
 * that has no backing field — a share is binary, not leveled. Shown here is
 * only what `GET /matters/:id/shares` actually returns: identifier, when it
 * was granted, whether it resolved to an account yet, and revocation.
 */

type Share = {
  shareId: string;
  invitedIdentifier: string;
  invitedUserId: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

export function MatterSharingScreen({
  matterId,
  onBack,
}: {
  matterId: string;
  onBack: () => void;
}) {
  const [caseTitle, setCaseTitle] = useState('This matter');
  const [shares, setShares] = useState<Share[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [inviting, setInviting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function load() {
    void api.matterShares(matterId).then((r) => {
      if (r.ok) setShares(r.data.shares);
      else setLoadError(r.error.message);
    });
  }

  useEffect(load, [matterId]);
  useEffect(() => {
    void api.matter(matterId).then((r) => {
      if (r.ok) setCaseTitle(r.data.matter.caseTitle);
    });
  }, [matterId]);

  const live = (shares ?? []).filter((s) => s.revokedAt === null);
  const revoked = (shares ?? []).filter((s) => s.revokedAt !== null);

  async function invite() {
    const id = identifier.trim();
    if (!id) return;
    setInviting(true);
    const r = await api.inviteToMatter(matterId, id);
    setInviting(false);
    if (r.ok) {
      setIdentifier('');
      setNote(r.data.created ? `Invited.` : `Already shared with ${id}.`);
      load();
    } else {
      setNote(r.error.message);
    }
  }

  async function revoke(shareId: string) {
    const r = await api.revokeMatterShare(matterId, shareId);
    if (r.ok) load();
    else setNote(r.error.message);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Matter
          </Text>
        </Pressable>

        <Text variant="eyebrow">Who can see this matter</Text>
        <Text variant="uiStrong" scale="title">
          {caseTitle}
        </Text>

        {loadError ? (
          <Text variant="ui" style={styles.muted}>
            {loadError}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text variant="eyebrow">Has access</Text>
          <Card style={styles.row}>
            <Text variant="uiStrong">You</Text>
            <Text variant="ui" style={styles.muted}>
              Owner · added this matter
            </Text>
          </Card>
          {live.map((s) => (
            <Card key={s.shareId} style={styles.row}>
              <Text variant="uiStrong">{s.invitedIdentifier}</Text>
              <Text variant="ui" style={styles.muted}>
                {s.invitedUserId === null ? 'Not signed up yet · ' : ''}
                since {new Date(s.grantedAt).toLocaleDateString('en-IN')}
              </Text>
              <Pressable onPress={() => void revoke(s.shareId)} style={styles.revoke}>
                <Text variant="ui" style={styles.revokeLabel}>
                  Remove
                </Text>
              </Pressable>
            </Card>
          ))}
        </View>

        <View style={styles.inviteRow}>
          <Input
            label="Invite someone from chambers"
            onChangeText={setIdentifier}
            placeholder="Enrolment number or phone"
            value={identifier}
          />
          <Button disabled={inviting || !identifier.trim()} label="Invite" onPress={() => void invite()} />
        </View>
        {note ? (
          <Text variant="ui" style={styles.muted}>
            {note}
          </Text>
        ) : null}

        <Card style={styles.explainer}>
          <Text variant="eyebrow">What they see</Text>
          <Text variant="ui" style={styles.explainerLine}>
            Every hearing date, order and document — the court record.
          </Text>
          <Text variant="ui" style={styles.explainerLine}>
            Every briefing for this matter, written to be read by whoever appears.
          </Text>
          <Text variant="ui" style={[styles.explainerLine, styles.muted]}>
            Not your notes, unless you share a note individually.
          </Text>
        </Card>
        <Text variant="ui" style={styles.footnote}>
          Access is per matter. There is no chamber-wide switch — you invite a person to a case,
          the way you hand over a file.
        </Text>

        {revoked.length > 0 ? (
          <View style={styles.section}>
            <Text variant="eyebrow">Previously had access</Text>
            {revoked.map((s) => (
              <Text key={s.shareId} variant="ui" style={styles.muted}>
                {s.invitedIdentifier} — revoked {new Date(s.revokedAt!).toLocaleDateString('en-IN')}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },

  section: { gap: space.xs, marginTop: space.sm },
  row: { gap: 4, padding: space.sm },
  revoke: { alignSelf: 'flex-start', marginTop: 4 },
  revokeLabel: { color: color.oxblood },

  inviteRow: { gap: space.xs, marginTop: space.sm },

  explainer: { gap: space.xs, padding: space.sm, marginTop: space.sm },
  explainerLine: {},
  footnote: { color: color.inkFaint, marginTop: space.xs },

  muted: { color: color.inkMuted },
});
