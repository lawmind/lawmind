import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { Switch } from '../../components/Switch';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { Briefing, Matter, MatterEvent } from '../../api/contract';
import { describeCacheAge, readCache, writeCache } from '../../state/offlineCache';
import { AddEventSheet } from './AddEventSheet';
import { usePractice } from '../../state/practice';
import {
  describeHearingDate,
  formatGutter,
  formatLong,
  parseCivilDate,
  todayCivil,
} from '../../theme/hearingDate';
import { color, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MATTER DETAIL — the retention moat. Inventory rows 25–27.
 *
 * Six months of an advocate's accumulated work is what stops them leaving, so
 * the ordering here follows what they came for: the next date first, then the
 * timeline, then everything else.
 *
 * TWO RULES THIS SCREEN CARRIES, both product decisions rather than layout:
 *
 * PD-4 — NOTES ARE PRIVATE BY DEFAULT, SHAREABLE PER NOTE. The default lives in
 * the database column, not here; this screen only ever sends an EXPLICIT
 * visibility, and never assumes one. A note about fees or a client's
 * circumstances must not travel with a file by accident.
 *
 * PD-3 — SHARING IS PER MATTER, BY INVITATION, and it is a list of names rather
 * than an org chart. There is no chamber-wide switch and there must not be one:
 * two advocates in one chamber can be on opposing sides of related matters.
 *
 * `order_text` is the COURT'S record and is always visible to a share. `notes`
 * obey `noteVisibility`. The two are drawn differently for that reason — one is
 * what happened, the other is what the advocate thought about it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type MatterBundle = {
  matter: Matter;
  events: MatterEvent[];
  documents: { id: string; documentType: string; createdAt: string }[];
  briefings: Briefing[];
};

const matterCacheKey = (id: string) => `matter.${id}`;

export function MatterScreen({
  matterId,
  onBack,
  onOpenBriefing,
  onRecordAdjournment,
  onSendClientUpdate,
  onShare,
}: {
  matterId: string;
  onBack: () => void;
  onOpenBriefing: (briefingId: string) => void;
  onRecordAdjournment: () => void;
  onSendClientUpdate: () => void;
  /** PD-3 — "Who can see this matter". Owner-side only, see MatterSharingScreen's own note. */
  onShare: () => void;
}) {
  const [bundle, setBundle] = useState<MatterBundle | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addEventError, setAddEventError] = useState<string | null>(null);
  const storeMatters = usePractice((s) => s.matters);

  useEffect(() => {
    let alive = true;
    setBundle(null);
    setCachedAt(null);
    setMissing(false);

    void readCache<MatterBundle>(matterCacheKey(matterId)).then((entry) => {
      if (!alive || !entry) return;
      setBundle((current) => {
        if (current) return current;
        setCachedAt(entry.cachedAt);
        return entry.value;
      });
    });

    void api.matter(matterId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setBundle(r.data);
        setCachedAt(null);
        void writeCache(matterCacheKey(matterId), r.data);
        return;
      }
      setBundle((current) => {
        if (!current) setMissing(true);
        return current;
      });
    });

    return () => {
      alive = false;
    };
  }, [matterId]);

  const today = useMemo(() => todayCivil(), []);

  /**
   * THE STORE'S DATE WINS OVER THE FETCHED ONE.
   *
   * An adjournment recorded thirty seconds ago in a courtroom is in the store
   * and has not necessarily reached the server. Rendering the fetched date over
   * it would show the advocate the old date immediately after they corrected it,
   * which is the exact moment they stop trusting the screen.
   */
  const liveDate =
    storeMatters.find((m) => m.matterId === matterId)?.nextHearingDate ??
    bundle?.matter.nextHearingDate ??
    null;

  if (missing) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="uiStrong">We could not open this matter</Text>
          <Text variant="ui" style={styles.muted}>
            Nothing has been lost. Something went wrong on our side fetching it.
          </Text>
          <Button label="Back" onPress={onBack} variant="secondary" />
        </View>
      </Screen>
    );
  }

  if (!bundle) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="ui" style={styles.muted}>
            Opening the matter…
          </Text>
        </View>
      </Screen>
    );
  }

  const { matter, events, briefings } = bundle;
  const nextDate = parseCivilDate(liveDate ?? '');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Matters
          </Text>
        </Pressable>

        <Text variant="eyebrow">{matter.court}</Text>
        <Text variant="uiStrong" scale="title">
          {matter.caseTitle}
        </Text>
        <Text variant="ui" style={styles.muted}>
          {matter.parties.description} · for the {matter.ourSide}
        </Text>

        {/* THE NEXT DATE IS PINNED — it is what the screen was opened for. */}
        <Card style={styles.nextCard}>
          <Text variant="eyebrow">Next hearing</Text>
          {nextDate ? (
            <>
              <Text variant="uiStrong" scale="title">
                {describeHearingDate(liveDate!, today)}
              </Text>
              <Text variant="record">{formatLong(nextDate)}</Text>
            </>
          ) : (
            <>
              <Text variant="uiStrong">No next date recorded</Text>
              {/*
                PD-12 — MANUAL ENTRY IS FIRST-CLASS, NEVER A FALLBACK. Next dates
                are given orally in open court and written on the file, so an
                advocate typing one is doing the ordinary thing. This copy must
                not read as a failure of ours or a lapse of theirs.
              */}
              <Text variant="ui" style={styles.muted}>
                Record it when the court gives it.
              </Text>
            </>
          )}
          <Button label="Record the next date" onPress={onRecordAdjournment} />
        </Card>

        <View style={styles.actions}>
          <Button label="Add event" onPress={() => setAddEventOpen(true)} />
          <Button label="Send update to client" variant="secondary" onPress={onSendClientUpdate} />
          <Button label="Who can see this matter" variant="secondary" onPress={onShare} />
        </View>

        {briefings.length > 0 ? (
          <View style={styles.section}>
            <SectionRule label="Briefings" />
            {briefings.map((b) => (
              <Pressable key={b.id} onPress={() => onOpenBriefing(b.id)} style={styles.row}>
                <Text variant="record" style={styles.gutter}>
                  {formatGutter(parseCivilDate(b.hearingDate) ?? today)}
                </Text>
                <View style={styles.rowBody}>
                  <Text variant="uiStrong">{b.subject}</Text>
                  <Text variant="ui" style={styles.muted}>
                    {describeHearingDate(b.hearingDate, today)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionRule label="Timeline" />
          {events.length === 0 ? (
            <Text variant="ui" style={styles.muted}>
              Nothing recorded yet. The timeline holds what the court did.
            </Text>
          ) : (
            events.map((event) => (
              <TimelineEvent key={event.eventId} event={event} matterId={matterId} />
            ))
          )}
        </View>

        {/*
          A NOTE IS A PROPERTY OF AN EVENT, NOT A SEPARATE THING SERVER-SIDE —
          `matter_events.notes`, on any event type. This section is every
          event carrying one, not only the dedicated "Note" type the add-event
          form offers — a hearing can carry a private thought about it too,
          and it belongs here as much as a standalone note does.
        */}
        {events.some((e) => e.notes) ? (
          <View style={styles.section}>
            <SectionRule label="Notes" />
            {events
              .filter((e) => e.notes)
              .map((event) => (
                <View key={event.eventId} style={styles.noteOnly}>
                  <Text variant="record" style={styles.gutter}>
                    {formatGutter(parseCivilDate(event.eventDate) ?? today)}
                  </Text>
                  <Text variant="ui" style={styles.rowBody}>
                    {event.notes}
                  </Text>
                </View>
              ))}
          </View>
        ) : null}

        {addEventError ? (
          <Text variant="ui" style={styles.error}>
            {addEventError}
          </Text>
        ) : null}

        {cachedAt ? (
          <Text variant="ui" style={styles.freshness}>
            Showing what is saved on this phone · {describeCacheAge(cachedAt)}
          </Text>
        ) : null}
      </ScrollView>

      <AddEventSheet
        onDismiss={() => setAddEventOpen(false)}
        onSubmit={async (draft) => {
          const r = await api.addMatterEvent(matterId, draft);
          if (r.ok) {
            setAddEventOpen(false);
            setAddEventError(null);
            setBundle((current) =>
              current ? { ...current, events: [r.data.event, ...current.events] } : current
            );
          } else {
            setAddEventError(r.error.message);
          }
        }}
        visible={addEventOpen}
      />
    </Screen>
  );
}

/**
 * ONE EVENT, TWO KINDS OF TEXT.
 *
 * `orderText` is the court's own record: always shown, always travels with a
 * share. `notes` are the advocate's, and their visibility is a per-note switch
 * whose default lives in the database column. The visual separation is the
 * point — a screen where the two look the same is a screen where one gets
 * shared believing it was the other.
 */
function TimelineEvent({ event, matterId }: { event: MatterEvent; matterId: string }) {
  const [visibility, setVisibility] = useState(event.noteVisibility);
  const [saving, setSaving] = useState(false);
  const date = parseCivilDate(event.eventDate);

  return (
    <View style={styles.event}>
      <Text variant="record" style={styles.gutter}>
        {date ? formatGutter(date) : event.eventDate}
      </Text>
      <View style={styles.rowBody}>
        <Text variant="eyebrow">{event.eventType}</Text>

        {event.orderText ? <Text variant="legal">{event.orderText}</Text> : null}

        {event.notes ? (
          <View style={styles.note}>
            <Text variant="ui">{event.notes}</Text>
            <View style={styles.noteVisibility}>
              <Text variant="ui" style={styles.muted}>
                {visibility === 'shared' ? 'Shared on this matter' : 'Private to you'}
              </Text>
              <Switch
                value={visibility === 'shared'}
                disabled={saving}
                onValueChange={(next) => {
                  const value = next ? 'shared' : 'private';
                  setVisibility(value);
                  setSaving(true);
                  /**
                   * OPTIMISTIC, AND IT REVERTS RATHER THAN LYING.
                   *
                   * The switch moves at once because the advocate's own note is
                   * theirs to reclassify. But a failed write must not leave them
                   * believing a private note is now shared, or the reverse — so
                   * a failure puts the switch back where it was. There is no
                   * "saved" toast: the position of the switch IS the state.
                   */
                  void api
                    .setNoteVisibility(matterId, event.eventId, value)
                    .then((r) => {
                      setSaving(false);
                      if (!r.ok) setVisibility(event.noteVisibility);
                    });
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },

  nextCard: { gap: space.xs, marginTop: space.xs },
  actions: { gap: space.xs },
  section: { gap: space.xs, marginTop: space.sm },

  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  event: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  gutter: { width: 62, paddingTop: 3 },
  rowBody: { flex: 1, gap: 4 },

  /** The advocate's own text sits in a tinted well so it never reads as the court's. */
  note: { backgroundColor: color.paperDesk, padding: space.xs, gap: space.xs },
  noteVisibility: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  muted: { color: color.inkMuted },
  freshness: { color: color.inkMuted, paddingTop: space.sm },
  noteOnly: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  error: { color: color.oxblood },
});
