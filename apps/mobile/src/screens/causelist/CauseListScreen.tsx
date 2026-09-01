import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Landmark } from 'lucide-react-native';

import { EmptyState } from '../../components/EmptyState';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { describeCacheAge } from '../../state/offlineCache';
import { listedToday, usePractice, type ListedMatter } from '../../state/practice';
import { formatGutter, todayCivil, weekdayName } from '../../theme/hearingDate';
import { color, size, space } from '../../theme/tokens';

/**
 * THE DAILY CAUSE LIST — inventory rows 97–99, canvas `12e`,
 * `renders/68-cause-list@2x.png`.
 *
 * Replaces checking the board. The first thing an advocate looks at each
 * morning, and one of the three screens used standing up in a corridor.
 *
 * GROUPED BY COURT, NOT BY TIME. `IMPLEMENTATION.md` §9d, and the reason is how
 * a morning is actually planned: an advocate works out which building to be in,
 * then what order things run inside it. A single time-ordered list mixes two
 * buildings and answers neither question.
 *
 * THE ITEM NUMBER IS THE LARGEST ELEMENT ON THE ROW. It is what is scanned for
 * on a physical board and it is the number that decides whether there is time to
 * leave for another court. Everything else on the row is smaller than it.
 *
 * A COURT THAT HAS NOT PUBLISHED GETS A DASHED ROW, NEVER A HIDDEN ONE. An
 * absent list is a fact the advocate has to plan around; hiding the matter would
 * tell them they have nothing there, which is a different and false statement.
 * This is the same rule as an unverified citation — say what is not known, never
 * drop it.
 *
 * NO CONFIRMATION DIALOG ANYWHERE ON THIS SCREEN. Every target is at least 52px.
 *
 * ── ON THE ENDPOINT ──────────────────────────────────────────────────────────
 * There is no advocate-facing cause-list aggregation in `docs/API_CONTRACTS.md`
 * — `GET /admin/cause-lists` is the operator's health view, not this. The screen
 * is therefore assembled from `GET /matters`, which carries `nextHearingDate`
 * and `court`, and the per-court item number and time are absent until an
 * endpoint supplies them. That absence RENDERS as "not yet published" rather
 * than being faked, which is the same shape the screen needs anyway for a court
 * that genuinely has not published. The derived endpoint shape is written up for
 * LCC in `docs/FOUNDER_QUEUE.md`; nothing above this screen changes when it
 * lands.
 */

export function CauseListScreen() {
  const router = useRouter();
  const matters = usePractice((s) => s.matters);
  const freshness = usePractice((s) => s.freshness);
  const hydrate = usePractice((s) => s.hydrate);
  const [open, setOpen] = useState<ListedMatter | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const today = useMemo(() => todayCivil(), []);
  const rows = useMemo(() => listedToday(matters, today), [matters, today]);

  /** Court is the grouping key and insertion order is preserved — soonest court first. */
  const byCourt = useMemo(() => {
    const groups = new Map<string, ListedMatter[]>();
    for (const row of rows) {
      const key = row.matter.court || 'Court not recorded';
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
    return [...groups.entries()];
  }, [rows]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text variant="eyebrow">
              {weekdayName(today).toUpperCase()}, {formatGutter(today)}
            </Text>
            <Text variant="uiStrong" scale="title">
              {rows.length} {rows.length === 1 ? 'matter listed' : 'matters listed'}
            </Text>
          </View>
          {freshness.kind === 'cached' ? (
            <Text variant="record" style={styles.updated}>
              {describeCacheAge(freshness.cachedAt)}
            </Text>
          ) : null}
        </View>

        {byCourt.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Nothing listed today"
            body="When a matter is listed, it appears here grouped by court — the way a morning is planned."
          />
        ) : null}

        {byCourt.map(([court, group], groupIndex) => (
          <View key={court} style={styles.group}>
            <Text variant="eyebrow" style={styles.courtLabel}>
              {court.toUpperCase()}
            </Text>
            {group.map((row, index) => (
              <CauseListRow
                key={row.matter.matterId}
                row={row}
                /** The first matter of the day carries the oxblood rule — one accent, earned. */
                first={groupIndex === 0 && index === 0}
                onPress={() => setOpen(row)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {/*
        TAPPING A ROW OPENS THE OUTCOME SHEET. The two things that happen to ~90%
        of listed matters are the two large buttons; everything else is a list
        beneath them. `renders/68-cause-list@2x.png` panel 2.
      */}
      <Sheet visible={open !== null} onDismiss={() => setOpen(null)}>
        {open ? (
          <View style={styles.sheet}>
            <Text variant="eyebrow">{open.matter.court}</Text>
            <Text variant="uiStrong">{open.matter.caseTitle}</Text>

            <View style={styles.outcomes}>
              <Pressable
                style={[styles.outcome, styles.outcomePrimary]}
                onPress={() => {
                  const id = open.matter.matterId;
                  setOpen(null);
                  router.push({ pathname: '/adjournment/[id]', params: { id } });
                }}
              >
                <Text variant="uiStrong" style={styles.outcomePrimaryLabel}>
                  Adjourned
                </Text>
                <Text variant="ui" style={styles.outcomePrimarySub}>
                  record next date
                </Text>
              </Pressable>

              {/*
                "HEARD — ORDER RESERVED" WAS REMOVED, 1 September 2026. NEW3 R16
                `R16-RCC-05`; founder design D-3, which names removal as an
                acceptable answer to its own brief.

                IT LOOKED LIKE AN OUTCOME AND RECORDED NOTHING. The button
                pushed `/matter/[id]` and was byte-for-byte the same
                destination as "Open the matter" below it — so an advocate
                standing in a corridor tapped what read as "record what
                happened", landed on the matter, and had recorded no outcome at
                all. That is the same class of harm as the adjournment purpose
                that was selectable and never sent, and it is why D-3's own
                truth state reads: IF IT IS NOT PERSISTED, IT MUST NOT BE
                OFFERED.

                NOTHING WAS INVENTED IN ITS PLACE, and that is the other half of
                the decision. There is no `outcome` concept and no "order
                reserved" state anywhere in the schema —
                `POST /matters/:id/events` takes
                `{hearing, order, filing, note}` and nothing else — so
                recording one would need a contract change, which NEW3 R16
                declines: D-3 is `NOT_REQUIRED_AFTER_R15`. An order-reserved
                matter also has no next date, and D-3 forbids fabricating one.

                The matter is still one tap away, under its own honest label.
                Restore an outcome button WITH a persistence path, never before.
              */}
            </View>

            {/*
              "OPEN THE BRIEFING" IS NOT HERE, AND ITS ABSENCE IS DELIBERATE.
              It pushed `/matter/[id]` with `briefing: '1'`, and `app/matter/[id].tsx`
              reads only `id` — `MatterScreen` has no `briefing` param anywhere, so
              the param was dropped and the link was byte-for-byte "Open the matter"
              below. It was dead a second time over: `briefing` is
              `DISABLED_NOT_READY` in `V1_SURFACE`, so the destination is held even
              once the param is honoured. Restore this WITH the param when the
              briefing surface opens; a link that quietly lands somewhere else is
              worse than no link.
            */}
            <SheetLink
              label="Open the matter"
              onPress={() => {
                const id = open.matter.matterId;
                setOpen(null);
                router.push({ pathname: '/matter/[id]', params: { id } });
              }}
            />
            <SheetLink
              label="Send status to client"
              onPress={() => {
                const id = open.matter.matterId;
                setOpen(null);
                router.push({ pathname: '/client-update/[id]', params: { id } });
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function CauseListRow({
  row,
  first,
  onPress,
}: {
  row: ListedMatter;
  first: boolean;
  onPress: () => void;
}) {
  /**
   * `itemNumber` and `listedAt` arrive with a cause-list endpoint that does not
   * exist yet. Until then the row says the court has not published rather than
   * inventing a position on a board — a wrong item number sends an advocate to
   * the wrong courtroom at the wrong hour.
   */
  const published = false;

  return (
    <Pressable onPress={onPress} style={[styles.row, first ? styles.rowFirst : null, published ? null : styles.rowUnpublished]}>
      <View style={styles.itemColumn}>
        <Text variant="uiStrong" scale="title" style={styles.itemNumber}>
          —
        </Text>
        <Text variant="eyebrow" style={styles.itemLabel}>
          Item
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text variant="uiStrong" style={styles.notPublished}>
          Not yet published
        </Text>
        <Text variant="uiStrong">{row.matter.caseTitle}</Text>
        <Text variant="ui" style={styles.muted}>
          {row.matter.cnrNumber ? `${row.matter.cnrNumber} · ` : ''}we will notify you
        </Text>
      </View>
    </Pressable>
  );
}

function SheetLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.sheetLink}>
      <Text variant="ui">{label}</Text>
      <Text variant="ui" style={styles.chevron}>
        ›
      </Text>
    </Pressable>
  );
}

/** Every target on this screen is at least 52px — it is used standing up. */
const TARGET = 52;

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.md, paddingBottom: space.xxl },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  headText: { flex: 1, gap: 2 },
  updated: { paddingTop: 4 },

  group: { gap: space.xs },
  courtLabel: { paddingTop: space.xs },

  row: {
    flexDirection: 'row',
    gap: space.sm,
    minHeight: TARGET + 20,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
  },
  /** ONE accent on the screen: the first matter of the day. */
  rowFirst: { borderLeftWidth: 3, borderLeftColor: color.oxblood },
  /** Dashed, not hidden. A court that has not published is a fact to plan around. */
  rowUnpublished: { borderStyle: 'dashed' },

  itemColumn: { width: 52, alignItems: 'center' },
  itemNumber: { color: color.ink },
  itemLabel: { color: color.inkMuted },
  rowBody: { flex: 1, gap: 2 },
  notPublished: { color: color.inkMuted },

  muted: { color: color.inkMuted },

  sheet: { gap: space.sm, paddingBottom: space.sm },
  outcomes: { flexDirection: 'row', gap: space.xs },
  outcome: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: space.xs,
  },
  outcomePrimary: { backgroundColor: color.oxblood, borderColor: color.oxblood },
  outcomePrimaryLabel: { color: color.card },
  outcomePrimarySub: { color: color.parchment },

  sheetLink: {
    minHeight: TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    paddingHorizontal: space.xs,
  },
  chevron: { color: color.inkMuted },
});
