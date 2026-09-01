import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Check, WifiOff } from 'lucide-react-native';

import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { usePractice } from '../../state/practice';
import { haptics } from '../../theme/haptics';
import {
  formatDayMonth,
  formatDayMonthWeekday,
  predictedAdjournmentDates,
  todayCivil,
  toIso,
  type PredictedDate,
} from '../../theme/hearingDate';
import { color, radius, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADJOURNMENT CAPTURE — inventory rows 99–100, canvas `12f`,
 * `renders/69-adjournment@2x.png`.
 *
 * THE HIGHEST-FREQUENCY WRITE IN THE PRODUCT, and the only one that happens
 * inside a courtroom. Every constraint on this screen is physical, and every one
 * of them is in `IMPLEMENTATION.md` §9d:
 *
 *   01  64px targets in the LOWER HALF. One hand; the other is holding a file.
 *       Nothing important sits above the fold's midpoint.
 *   02  OFFLINE FIRST, NOT OFFLINE TOLERANT. The write lands locally before
 *       anything else happens. Signal state is SHOWN, never asked about.
 *   03  DATES ARE PREDICTED, NOT TYPED. A typed date is four taps and a
 *       keyboard; a predicted one is a single tap.
 *   04  NO CONFIRMATION DIALOG. A wrong date is corrected by tapping the matter.
 *       An extra tap in a courtroom costs more than an occasional correction.
 *   05  Reachable in one tap from the cause list row, the matter, and the
 *       briefing.
 *
 * Target: UNDER FOUR SECONDS from lock screen to saved, on a Redmi-class device
 * with no signal. If it takes longer advocates keep writing it on the file and
 * the loop is lost. `docs/FAILURE_MODES.md` records this as a thing to MEASURE
 * at S3, not a gate — nobody can evaluate it without the device.
 *
 * The common case is ONE TAP PLUS SAVE: the offered date is already selected.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `IMPLEMENTATION.md` §9d — "four 64px targets in the lower half". */
const TARGET = 64;

/**
 * The purposes a next date is usually given for. Optional; defaults to the same
 * one.
 *
 * UNTIL R16 THESE WERE DECORATIVE. The row rendered, the tap registered, the
 * selection was held right here in component state — and `save()` sent only the
 * date. `state/practice.ts#recordAdjournment` now writes the selection to the
 * matter timeline as the court record it is.
 */
const PURPOSES = ['Same purpose', 'Arguments', 'Evidence', 'Orders'] as const;

export function AdjournmentScreen({
  matterId,
  onDone,
  onCancel,
  onNextMatter,
}: {
  matterId: string;
  onDone: () => void;
  onCancel: () => void;
  /** Offered straight after saving — an advocate in a corridor records two or three in a row. */
  onNextMatter?: () => void;
}) {
  const matters = usePractice((s) => s.matters);
  const recordAdjournment = usePractice((s) => s.recordAdjournment);
  const hydrate = usePractice((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const matter = useMemo(() => matters.find((m) => m.matterId === matterId), [matters, matterId]);

  const today = useMemo(() => todayCivil(), []);
  const offers = useMemo(() => predictedAdjournmentDates(today), [today]);

  /**
   * THE SECOND OFFER IS PRESELECTED, not the first.
   *
   * Two weeks is the ordinary district-court adjournment; "tomorrow" is the
   * exception. Preselecting the common case is what turns this into one tap
   * plus save, and `renders/69-adjournment@2x.png` shows exactly that — the
   * two-week row carries the oxblood outline before anything is touched.
   */
  const [selected, setSelected] = useState<string>(offers[1]?.iso ?? offers[0]?.iso ?? '');
  const [purpose, setPurpose] = useState<string>(PURPOSES[0]);
  const [saved, setSaved] = useState<string | null>(null);
  /**
   * THE PURPOSE HAS THREE STATES AND THE SCREEN SAYS WHICH.
   *
   * `null` — still in flight. `true` — the timeline write landed. `false` — it
   * did not, and the purpose is NOT recorded anywhere. The date is unaffected in
   * all three: it is a column on the matter and it is written locally first, so
   * it is saved whatever the network did. Collapsing these into one "saved"
   * would put us back where this screen started — telling an advocate we hold
   * something we do not.
   */
  const [purposeRecorded, setPurposeRecorded] = useState<boolean | null>(null);

  const save = useCallback(() => {
    if (!selected) return;
    haptics.commit();
    /**
     * NOT AWAITED, AND NO CONFIRMATION DIALOG. The store writes the DATE to the
     * device synchronously and syncs after; making the advocate wait on a round
     * trip in a building with no signal is the failure this screen exists to
     * avoid. The purpose resolves underneath the stamp and only then does its
     * line appear — the confirmation is not held back for it.
     */
    setPurposeRecorded(null);
    void recordAdjournment(matterId, selected, purpose).then((r) =>
      setPurposeRecorded(r.purposeRecorded),
    );
    setSaved(selected);
  }, [matterId, selected, purpose, recordAdjournment]);

  if (saved) {
    const savedDate = offers.find((o) => o.iso === saved);
    return (
      <Screen>
        <View style={styles.confirm}>
          {/*
            THE INK STAMP — the advocate's own act, not ours. It is not the gilt
            seal: gilt is reserved for the briefing, and borrowing it here would
            make a routine write feel ceremonial and cheapen the one moment that
            is.
          */}
          <View style={styles.stamp}>
            <Check color={color.ink} size={28} strokeWidth={2} />
          </View>

          <Text variant="uiStrong" style={styles.confirmTitle}>
            Listed{' '}
            {savedDate ? formatDayMonth({ ...today, ...isoParts(saved) }) : formatSavedIso(saved)}
          </Text>
          <Text variant="ui" style={styles.confirmBody}>
            The next hearing date is saved on this matter.
          </Text>

          {/*
            A SEPARATE SENTENCE FOR A SEPARATE GUARANTEE. The date above is
            local-first and true offline. The purpose is a timeline write and is
            not — so it gets its own line, and when the write did not land the
            line says so rather than being silently absent, which would read as
            "recorded" to anybody who did not count the lines.
          */}
          {purposeRecorded === true ? (
            <Text variant="ui" style={styles.confirmBody}>
              Recorded on the matter: {purpose.toLowerCase()}.
            </Text>
          ) : purposeRecorded === false ? (
            <Text variant="ui" style={styles.confirmBody}>
              The purpose was not recorded — that part needs a connection. The date is saved
              either way.
            </Text>
          ) : null}

          <View style={styles.savedRow}>
            <Text variant="ui" style={styles.savedRowTitle}>
              {matter?.caseTitle ?? 'This matter'}
            </Text>
            <Text variant="eyebrow">Saved</Text>
          </View>

          {onNextMatter ? (
            <Pressable style={styles.nextMatter} onPress={onNextMatter}>
              <Text variant="uiStrong">Next matter</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.done} onPress={onDone}>
            <Text variant="ui" style={styles.muted}>
              Done for now
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable onPress={onCancel} style={styles.cancel}>
          <Text variant="ui">Cancel</Text>
        </Pressable>
        {/*
          SIGNAL STATE IS SHOWN, NEVER ASKED ABOUT. There is no "you are offline,
          try again later" — the write does not care, and telling the advocate it
          might have failed would make them check, which costs the seconds this
          screen is built to save.
        */}
        <View style={styles.signal}>
          <WifiOff color={color.inkMuted} size={13} strokeWidth={1.5} />
          <Text variant="eyebrow" style={styles.muted}>
            Saves on this phone
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow">{matter?.court ?? 'Matter'}</Text>
        <Text variant="uiStrong" scale="title">
          {matter?.caseTitle ?? 'This matter'}
        </Text>
        <Text variant="ui" style={styles.muted}>
          Next date given in court
        </Text>
        <View style={styles.rule} />

        {offers.map((offer) => (
          <DateOption
            key={offer.iso}
            offer={offer}
            selected={selected === offer.iso}
            onPress={() => {
              haptics.tap();
              setSelected(offer.iso);
            }}
          />
        ))}

        <Text variant="eyebrow" style={styles.forLabel}>
          For — optional
        </Text>
        <View style={styles.purposes}>
          {PURPOSES.map((p) => (
            <Pressable
              key={p}
              onPress={() => setPurpose(p)}
              style={[styles.purpose, purpose === p ? styles.purposeOn : null]}
            >
              <Text variant="ui" style={purpose === p ? styles.purposeOnLabel : undefined}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* The primary action sits in the bottom third — one-handed, holding a file. */}
      <View style={styles.footer}>
        <Pressable style={styles.save} onPress={save}>
          <Text variant="uiStrong" style={styles.saveLabel}>
            Save · {formatDayMonth(isoCivil(selected))}
          </Text>
        </Pressable>
        <Text variant="ui" style={styles.footerNote}>
          The date saves on this phone now and syncs when you have signal. The purpose is
          written to the matter when there is one.
        </Text>
      </View>
    </Screen>
  );
}

function DateOption({
  offer,
  selected,
  onPress,
}: {
  offer: PredictedDate;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.option, selected ? styles.optionSelected : null]}
    >
      <View>
        <Text variant="uiStrong">{offer.label}</Text>
        <Text variant="ui" style={styles.muted}>
          {offer.detail}
        </Text>
      </View>
    </Pressable>
  );
}

/* --------------------------------------------------------------- date helpers */

/** Splits an ISO date without going anywhere near `Date`. See `theme/hearingDate.ts`. */
function isoParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-');
  return { year: Number(y), month: Number(m), day: Number(d) };
}

const isoCivil = (iso: string) => isoParts(iso);

function formatSavedIso(iso: string): string {
  return formatDayMonthWeekday(isoCivil(iso));
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
  },
  cancel: { minHeight: 44, justifyContent: 'center' },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  body: { padding: space.sm, gap: space.xs, paddingBottom: space.sm },
  rule: { height: 1, backgroundColor: color.oxblood, marginVertical: space.xs },

  option: {
    minHeight: TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
  },
  optionSelected: { borderColor: color.oxblood, borderWidth: 2 },

  forLabel: { paddingTop: space.sm },
  purposes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  purpose: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    backgroundColor: color.card,
  },
  purposeOn: { backgroundColor: color.ink, borderColor: color.ink },
  purposeOnLabel: { color: color.card },

  footer: { padding: space.sm, gap: space.xs },
  save: {
    minHeight: TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.oxblood,
    borderRadius: radius.base,
  },
  saveLabel: { color: color.card },
  footerNote: { color: color.inkMuted, textAlign: 'center' },

  confirm: { flex: 1, padding: space.md, gap: space.sm, justifyContent: 'center' },
  stamp: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.paperDesk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: { textAlign: 'center' },
  confirmBody: { color: color.inkMuted, textAlign: 'center' },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.card,
    padding: space.sm,
    minHeight: TARGET,
  },
  savedRowTitle: { flex: 1 },
  nextMatter: {
    minHeight: TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.ink,
    backgroundColor: color.card,
  },
  done: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  muted: { color: color.inkMuted },
});

/** Kept so a platform-specific tweak has an obvious home rather than being inlined later. */
void Platform;
