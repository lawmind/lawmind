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
 * ───────────────────────────────────────────────────────────────────────────
 * CURRENT-V1 TRUTH, 18 Sep 2026 (SHIP S4-T0.3)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * This screen promised three things it cannot deliver in this version, and the
 * capability registry had no row for alerts at all — so nothing measured the
 * gap between the promise and the product.
 *
 *   "Four things"                  — `alert_kind` holds TWO values. Two of the
 *                                    four PD-5 triggers have no enum value and
 *                                    therefore no producer.
 *   "the evening briefing"         — `briefing.daily_loop = DISABLED_NOT_READY`.
 *                                    Naming a delivery channel that is disabled
 *                                    is the one thing a settings screen must
 *                                    never do.
 *   "Cannot be turned off"         — said of trigger 2, whose audience is
 *                                    advocates who EXPORTED a draft (drafting
 *                                    and export are not current v1) or COPIED a
 *                                    citation out. A mandatory-looking switch
 *                                    is a promise, and this one is not kept.
 *
 * And the whole surface sat above a producer that has never run: the only paths
 * that write an alert are `pnpm --filter @lawmind/cron recheck` and an upheld
 * admin dispute, and there is no deployed environment to run them in
 * (`PRODUCTION = NONE`, `PERSISTENT_BETA = NONE`). So NO alert has ever been
 * observed reaching a screen.
 *
 * What the screen does now: it keeps the one setting that genuinely persists
 * and genuinely gates the producer's audience query, says plainly that alerts
 * are not switched on in this version, and stops asking for push permission for
 * a delivery path that does not exist. Registry rows:
 * `alerts.saved_authority_moved`, `alerts.filed_citation_moved`,
 * `alerts.push_delivery` — all DISABLED_NOT_READY in R18.
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
      return;
    }

    /*
      NO PUSH PROMPT WHILE PUSH DELIVERY IS DISABLED — `alerts.push_delivery`
      is DISABLED_NOT_READY in R18: `EAS_PROJECT_ID` is absent from
      `app.config.ts`, so `registerForPushNotifications()` can only return
      `NO_PROJECT_CONFIGURED` on a real build, and no push has ever been
      observed delivered.

      The old code asked here on the grounds that "declining now has a concrete
      cost". That argument required the cost to be real. Asking an advocate for
      notification permission for a channel that cannot deliver spends the one
      permission prompt this product gets, on nothing — and an advocate who
      declines once is far harder to ask again than one who was never asked.

      The toggle itself is unchanged and still saves: `alert_saved_authority_moved`
      gates the producer's audience query, so the preference is honoured the
      moment the producer runs. `registerForPushNotifications` and
      `PUSH_FAILURE_COPY` stay wired for S4-R1, which restores this call once a
      project id exists and a delivery has been observed.
    */
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
          When an authority you have used is set aside, we tell you inside the app. We do not send
          a digest, and we do not tell you about anything that does not touch your matters.
        </Text>

        {/*
          NOT A WARNING, A FACT. The producer that writes an alert runs only from
          the recheck job or an upheld dispute, and neither runs anywhere yet, so
          an advocate who turns a switch on would otherwise wait for something
          that cannot arrive. `docs/CURRENT_STATE.md` carries the state; the
          registry rows are all DISABLED_NOT_READY.
        */}
        <View style={styles.notice}>
          <Text variant="uiStrong">Alerts are not switched on in this version</Text>
          <Text variant="ui" style={styles.muted}>
            Nothing here will reach you yet. What you choose is saved, and it applies the moment
            alerts are switched on.
          </Text>
        </View>

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
            {/*
              Trigger 2 has no key on `AlertSettings` — `.strict()` server-side
              rejects `filedCitationMoved` with a 400 — so it never had a switch
              that did anything. It used to render a DISABLED, ON switch beside
              the words "Cannot be turned off", which reads as "this one is
              always working". Its audience is advocates who exported a draft
              (not current v1) or copied a citation out, and no alert of this
              kind has been observed delivered. So it renders exactly like the
              other not-yet rows: a statement, never a control.
            */}
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="uiStrong">An authority I filed is set aside</Text>
                <Text variant="ui" style={styles.muted}>
                  Cited in a draft you exported, or copied out of the app.
                </Text>
                <Text variant="ui" style={styles.notBuilt}>
                  Not built yet — exporting a draft is not in this version.
                </Text>
              </View>
              <Text variant="eyebrow" style={styles.notBuiltTag}>
                Soon
              </Text>
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
  notice: {
    gap: 4,
    marginTop: space.sm,
    padding: space.sm,
    borderWidth: 1,
    borderColor: color.hairline,
    /* Neutral ink and a plain border. Our own uncertainty never wears the
       reserved amber — CLAUDE.md: amber means THE LAW HAS MOVED and nothing
       else, and "we have not switched this on" is a fact about us. */
  },
  notBuilt: { color: color.inkFaint, fontStyle: 'italic' },
  notBuiltTag: { color: color.inkFaint },

  footer: { gap: space.xs, marginTop: space.md },
  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
});
