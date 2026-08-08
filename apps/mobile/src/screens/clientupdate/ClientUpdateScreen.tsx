import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Button } from '../../components/Button';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { usePractice } from '../../state/practice';
import { useSession } from '../../state/session';
import { haptics } from '../../theme/haptics';
import { color, radius, space } from '../../theme/tokens';
import { buildClientUpdate, clientUpdateAsText } from './clientCard';

/**
 * CLIENT UPDATE — inventory rows 101–102, canvas `12g`,
 * `renders/70-client-share@2x.png`.
 *
 * ONE TAP → a clean matter summary over WhatsApp. **This is the viral loop**, and
 * it is the only Lawmind surface a non-user ever sees, so the typography and the
 * name order are marketing surface rather than UI preference.
 *
 * THE ADVOCATE'S NAME IS PROMINENT AND OURS IS SMALL. The client is served by
 * their advocate, who happens to use good tools. Reverse that and the card is an
 * advertisement, advocates stop sending it, and the one organic channel closes.
 *
 * NO CITATIONS ON THIS SURFACE, ever — see `clientCard.ts` for the copy rules
 * and why they are rules.
 *
 * ── IMAGE VS TEXT ────────────────────────────────────────────────────────────
 * The design specifies an IMAGE (1080×1350 at 3x): it renders in the thread,
 * survives forwarding, and can be shown across a desk. Capturing a view as an
 * image needs a native module this build does not carry, so what ships now is
 * the card RENDERED IN-APP for the advocate to check, plus a plain-text send
 * that carries the same sentences. The preview is not decoration — it is how the
 * advocate sees what their client will read before it leaves.
 * `docs/FOUNDER_QUEUE.md` carries the one dependency this needs.
 */
export function ClientUpdateScreen({ matterId, onBack }: { matterId: string; onBack: () => void }) {
  const matters = usePractice((s) => s.matters);
  const hydrate = usePractice((s) => s.hydrate);
  const profile = useSession((s) => s.profile);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const matter = useMemo(() => matters.find((m) => m.matterId === matterId), [matters, matterId]);

  const update = useMemo(() => {
    if (!matter) return null;
    return buildClientUpdate({
      matter,
      advocateName: profile?.fullName ?? 'Your advocate',
      outcome: matter.nextHearingDate ? 'adjourned' : 'heard',
    });
  }, [matter, profile]);

  if (!matter || !update) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="uiStrong">We could not open this matter</Text>
          <Button label="Back" onPress={onBack} variant="secondary" />
        </View>
      </Screen>
    );
  }

  const text = clientUpdateAsText(update);

  const send = async () => {
    haptics.commit();
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const opened = await Linking.canOpenURL(url).catch(() => false);
    if (opened) {
      await Linking.openURL(url).catch(() => undefined);
      return;
    }
    /**
     * WhatsApp absent is not an error worth a dialog. The advocate still has the
     * words; the clipboard is the honest fallback and says so in one line.
     */
    await Clipboard.setStringAsync(text);
    setCopied(true);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow">Send to client</Text>
        <Text variant="ui" style={styles.muted}>
          This is exactly what your client will read.
        </Text>

        {/* ── THE CARD ─────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text variant="eyebrow" style={styles.cardEyebrow}>
              {update.eyebrow}
            </Text>
            {/* The advocate's name, largest thing on the card. */}
            <Text variant="uiStrong" scale="title" style={styles.advocate}>
              {update.advocateName}
            </Text>
            <Text variant="legal" style={styles.caseTitle}>
              {update.caseTitle}
            </Text>
          </View>

          <View style={styles.cardRule} />

          <View style={styles.cardBody}>
            <Text variant="legal">{update.whatHappened}</Text>

            <View style={styles.hairline} />

            <Text variant="eyebrow">{update.whatHappensNextLabel}</Text>
            {update.whatHappensNext.map((line) => (
              <Text key={line} variant="legal" style={styles.nextLine}>
                {line}
              </Text>
            ))}

            <View style={styles.hairline} />

            <View style={styles.signature}>
              <Text variant="ui" style={styles.muted}>
                Sent by <Text variant="uiStrong">{update.sentBy}</Text>
              </Text>
              <Text variant="record">{update.sentOn}</Text>
            </View>
          </View>

          {/* Ours. The smallest thing on the card, and it never grows. */}
          <View style={styles.cardFooter}>
            <Text variant="ui" style={styles.footerLabel}>
              {update.footer}
            </Text>
          </View>
        </View>

        <Button label="Send on WhatsApp" onPress={() => void send()} />
        <Pressable
          onPress={() => {
            void Clipboard.setStringAsync(text);
            setCopied(true);
          }}
          style={styles.copy}
        >
          <Text variant="ui" style={styles.link}>
            {copied ? 'Copied — paste it anywhere' : 'Copy the text instead'}
          </Text>
        </Pressable>

        <Text variant="ui" style={styles.note}>
          No case number and no citations leave with this. It is a status update, not a filing.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },

  /**
   * OPAQUE PAPER, NEVER GLASS. This is content, and it is shown across a desk in
   * daylight to somebody who is not a user.
   */
  card: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    overflow: 'hidden',
  },
  cardHead: { backgroundColor: color.paperDesk, padding: space.sm, gap: 4 },
  cardEyebrow: { color: color.inkMuted },
  advocate: { color: color.ink },
  caseTitle: { color: color.inkMuted },
  /** The one oxblood moment on the card. */
  cardRule: { height: 2, backgroundColor: color.oxblood },
  cardBody: { padding: space.sm, gap: space.xs },
  hairline: { height: 1, backgroundColor: color.hairline, marginVertical: space.xs },
  nextLine: { color: color.inkMuted },
  signature: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardFooter: { backgroundColor: color.paperDesk, paddingHorizontal: space.sm, paddingVertical: space.xs },
  footerLabel: { color: color.inkMuted, fontSize: 13 },

  copy: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { color: color.oxblood },
  muted: { color: color.inkMuted },
  note: { color: color.inkMuted },
});
