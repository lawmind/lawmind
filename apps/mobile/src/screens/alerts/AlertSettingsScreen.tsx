import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Switch } from '../../components/Switch';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { AlertSettings } from '../../api/contract';
import { color, space } from '../../theme/tokens';

/**
 * ALERT SETTINGS — PD-5, PD-6. Inventory row 80,
 * `renders/60-citator-alerts@2x.png` panel 3.
 *
 * FOUR TRIGGERS, THREE TOGGLES. Trigger 2 (an authority cited in a filed
 * draft is set aside) has no key on `AlertSettings` at all — `.strict()`
 * server-side rejects `filedCitationMoved` with a `400`. Shown here as a
 * fixed row with the real reason, never a switch that would silently do
 * nothing if flipped.
 *
 * `ownMatterJudgment`/`unknownListing` genuinely save and are honoured —
 * they simply have no producer yet (trigger 3 awaits OCR, trigger 4 awaits
 * the cause-list-to-matter matcher). Until 9 Aug 2026 this screen drew both
 * as ordinary switches: an advocate could turn one on, watch it save, and be
 * told nothing, ever — they would find out by missing a hearing.
 *
 * `settings.unavailable` (`docs/API_CONTRACTS.md` §Citator alerts) names
 * every key with no producer. A row named there renders as NOT YET WORKING,
 * never as an ordinary toggle — no switch, because a switch in the "off"
 * position implies flipping it would turn the alert on, and that is exactly
 * the false promise this key exists to remove. The list is read from the
 * server on every load, never hard-coded: when trigger 3 or 4 ships, the key
 * drops out and the row reverts to an ordinary switch on its own.
 */
export function AlertSettingsScreen({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void api.alertSettings().then((r) => {
      if (r.ok) setSettings(r.data.settings);
      else setLoadError(r.error.message);
    });
  }, []);

  async function toggle(key: keyof AlertSettings, next: boolean) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [key]: next });
    const r = await api.updateAlertSettings({ [key]: next });
    if (r.ok) setSettings(r.data.settings);
    else {
      setSettings(previous);
      setNote(r.error.message);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Settings
          </Text>
        </Pressable>

        <Text variant="eyebrow">Alerts</Text>
        <Text variant="uiStrong" scale="title">
          What we will tell you about
        </Text>
        <Text variant="ui" style={styles.muted}>
          Four things. Everything arrives in the evening briefing unless it affects a hearing the
          next day.
        </Text>

        {loadError ? (
          <Text variant="ui" style={styles.error}>
            {loadError}
          </Text>
        ) : null}

        {settings ? (
          <View style={styles.list}>
            <Row
              body="Any judgment attached to one of your matters"
              onValueChange={(v) => void toggle('savedAuthorityMoved', v)}
              title="An authority I saved is set aside"
              value={settings.savedAuthorityMoved}
            />
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="uiStrong">An authority I filed is set aside</Text>
                <Text variant="ui" style={styles.muted}>
                  Cited in a draft you exported.{' '}
                  <Text variant="uiStrong" style={styles.cannotDisable}>
                    Cannot be turned off.
                  </Text>
                </Text>
              </View>
              <Switch disabled value onValueChange={undefined} />
            </View>
            <Row
              body="Order or judgment uploaded to a case of yours"
              onValueChange={(v) => void toggle('ownMatterJudgment', v)}
              title="A judgment lands in my matter"
              unavailable={settings.unavailable.includes('ownMatterJudgment')}
              value={settings.ownMatterJudgment}
            />
            <Row
              body="A date appears that you did not enter"
              onValueChange={(v) => void toggle('unknownListing', v)}
              title="A matter is listed unexpectedly"
              unavailable={settings.unavailable.includes('unknownListing')}
              value={settings.unknownListing}
            />
          </View>
        ) : (
          <Text variant="ui" style={styles.muted}>
            Loading…
          </Text>
        )}

        {note ? (
          <Text variant="ui" style={styles.error}>
            {note}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Text variant="eyebrow">What we will not do</Text>
          <Text variant="ui" style={styles.muted}>
            No alerts on subjects you search, no digest of new judgments, no engagement
            notifications. If it does not touch your matters, it waits until you look.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({
  title,
  body,
  value,
  onValueChange,
  unavailable,
}: {
  title: string;
  body: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** True where the server has no producer for this trigger yet — `AlertSettings.unavailable`. */
  unavailable?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="uiStrong">{title}</Text>
        <Text variant="ui" style={styles.muted}>
          {body}
        </Text>
        {unavailable ? (
          <Text variant="ui" style={styles.notBuilt}>
            Not built yet — this will not alert you even if you turn it on.
          </Text>
        ) : null}
      </View>
      {/*
        NO SWITCH FOR AN UNAVAILABLE TRIGGER. A switch reading "off" implies
        turning it on would work; nothing here does, so a switch is a promise
        this row cannot keep. `styles.notBuiltTag` is a static label, never a
        control — see the header comment above.
      */}
      {unavailable ? (
        <Text variant="eyebrow" style={styles.notBuiltTag}>
          Soon
        </Text>
      ) : (
        <Switch onValueChange={onValueChange} value={value} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.xs, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },

  list: { gap: 0, marginTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  rowText: { flex: 1, gap: 4 },
  cannotDisable: { color: color.oxblood },
  notBuilt: { color: color.inkFaint, fontStyle: 'italic' },
  notBuiltTag: { color: color.inkFaint },

  footer: { gap: space.xs, marginTop: space.md },
  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
});
