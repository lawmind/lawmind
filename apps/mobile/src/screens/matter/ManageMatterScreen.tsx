import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SegmentedRow } from '../../components/SegmentedRow';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import type { Matter, MatterStatus } from '../../api/contract';
import { caseloadView, ensureLive, matterStatus, usePractice } from '../../state/practice';
import { color, radius, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MANAGE A MATTER — founder design D-2, NEW3 R16 `R16-RCC-02`, fpass 17.
 *
 * Until now a matter was created at `/matter/new` and was thereafter IMMUTABLE
 * except for its next hearing date: `updateMatter` was called from exactly one
 * place, with exactly one field. So "I typed the case title wrong" had no
 * answer at all, and "this matter is disposed and I do not want it on my list
 * every morning" had no answer either.
 *
 * ── ONLY THE FIELDS THE SERVER ACTUALLY ACCEPTS ─────────────────────────────
 *
 * `patchMatterBody` and its UPDATE statement take `caseTitle`, `cnrNumber`,
 * `court`, `clientName`, `ourSide`, `nextHearingDate` and `status`. **The
 * founder design lists `caseType` and `parties` as editable and the server
 * takes neither** — no zod key, no column in the UPDATE. They are treated as
 * identity here and are not offered, because an edit control that silently
 * discards its input is worse than no control: the advocate believes they
 * corrected it.
 *
 * ── ARCHIVE MUST NOT LOOK LIKE DELETE ───────────────────────────────────────
 *
 * D-2 states it as a truth requirement and it drives the whole lower half of
 * this screen. A matter carries saved authorities, a timeline, briefings and
 * possibly a share; none of it is touched. The confirmation says what SURVIVES
 * rather than warning about what is lost, because nothing is lost — and the
 * action is reversible from here, which the sheet says.
 *
 * ── THERE IS NO HARD DELETE, AND NO "ON HOLD" ───────────────────────────────
 *
 * The design shows both. `matter_status` is a Postgres enum of exactly
 * `{active, disposed, archived}`; there is no fourth value and no delete route
 * for a matter. NEW3 R16 `R16-RCC-X02` holds them out. Account-level erasure is
 * a different thing entirely and lives on `DeleteAccountScreen`.
 *
 * ── AND NO CNR RE-SYNC ──────────────────────────────────────────────────────
 *
 * The design's "Re-sync · last synced 14 Jul 2026 · changing the CNR replaces
 * the imported history" describes a mechanism that does not exist: there is no
 * re-sync endpoint and no imported history to replace. The CNR is editable as
 * what it actually is — an optional record-keeping field.
 *
 * ── A SHAREE IS NOT OFFERED THIS SCREEN ─────────────────────────────────────
 *
 * `access` is served per matter precisely so an absence and a permission
 * boundary are distinguishable. The server enforces it anyway — every write
 * carries `WHERE user_id = $me`, so a sharee's PATCH answers 404 — but a sharee
 * must not be shown controls that can only fail.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SIDES = [
  { value: 'petitioner', label: 'Petitioner' },
  { value: 'respondent', label: 'Respondent' },
  { value: 'accused', label: 'Accused' },
  { value: 'complainant', label: 'Complainant' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * WHAT THE TWO WORDS MEAN, DECIDED HERE BECAUSE NOTHING ELSE DECIDES IT.
 *
 * D-2 names this as a REQUIRED_INFORMATION gap in its own brief: the two values
 * sit "in the enum with no definition anywhere". The distinction taken is the
 * one an Indian practice actually draws, and it is stated to the advocate
 * rather than left to be inferred from the word:
 *
 *   DISPOSED — the court is finished with it. A fact about the case.
 *   ARCHIVED — you are finished with it. A fact about your desk.
 *
 * Both leave the morning. Neither destroys anything. A matter can be archived
 * without being disposed (a client who stopped responding) and disposed without
 * being archived (an order you are still reading), which is why they are two
 * states rather than one flag.
 */
export const STATUS_MEANING: Readonly<Record<MatterStatus, string>> = {
  active: 'On your list. It appears on Today, on the cause list and in Matters.',
  disposed: 'The court has finished with it. It leaves your morning; nothing is deleted.',
  archived: 'You have finished with it. It leaves your morning; nothing is deleted.',
};

const STATUS_LABEL: Readonly<Record<MatterStatus, string>> = {
  active: 'Active',
  disposed: 'Disposed',
  archived: 'Archived',
};

/**
 * THE CONFIRMATION READS AS AN ACT, NOT AS A REPEAT OF THE ROW.
 *
 * The row says what state it moves the matter to ("Mark archived"); the sheet's
 * button says what the advocate is about to DO ("Archive this matter"). Two
 * controls a tap apart carrying identical text is how somebody confirms
 * something they did not mean to open, and it is also why an earlier version of
 * this screen's test could not tell the two apart.
 */
const CONFIRM_LABEL: Readonly<Record<MatterStatus, string>> = {
  active: 'Put it back on your list',
  disposed: 'Dispose of this matter',
  archived: 'Archive this matter',
};

export function ManageMatterScreen({
  matterId,
  onBack,
  onDone,
}: {
  matterId: string;
  onBack: () => void;
  /** Called after a successful save so the caller can leave the screen. */
  onDone: () => void;
}) {
  const matters = usePractice((s) => s.matters);
  const freshness = usePractice((s) => s.freshness);
  const loading = usePractice((s) => s.loading);
  const refreshError = usePractice((s) => s.refreshError);
  const editMatter = usePractice((s) => s.editMatter);
  const matter = useMemo(
    () => matters.find((m) => m.matterId === matterId) ?? null,
    [matters, matterId],
  );

  /**
   * NOT FOUND IS ONLY SAID AFTER A LIVE READ — RCC R30. A deep link lands here
   * with nothing hydrated, so a miss first asks the store to load; the same
   * rule as the matter picker, applied to one matter instead of the list.
   */
  const found = matter !== null;
  useEffect(() => {
    if (!found) ensureLive();
  }, [found, matterId]);
  const view = caseloadView({ matters: found ? [matter] : [], freshness, loading, refreshError });

  if (view === 'resolving') {
    return (
      <Screen topInset>
        <View style={styles.body} testID="manage-matter-resolving">
          <BackLink onPress={onBack} />
          <Text variant="ui" style={styles.muted}>
            Loading this matter…
          </Text>
        </View>
      </Screen>
    );
  }

  if (view === 'unavailable') {
    return (
      <Screen topInset>
        <View style={styles.body} testID="manage-matter-unavailable">
          <BackLink onPress={onBack} />
          <Text variant="ui" style={styles.muted}>
            This matter could not be loaded. Check your connection and try again.
          </Text>
          <Button label="Try again" onPress={() => void usePractice.getState().refresh()} />
        </View>
      </Screen>
    );
  }

  if (matter === null) {
    return (
      <Screen topInset>
        <View style={styles.body} testID="manage-matter-absent">
          <BackLink onPress={onBack} />
          <Text variant="ui" style={styles.muted}>
            This matter is not in your matters. It may have been removed, or the link may be wrong.
          </Text>
        </View>
      </Screen>
    );
  }

  /**
   * `access` is absent on the bare rows POST and PATCH return, where the caller
   * is the owner by construction. Absent therefore reads as owner; only an
   * explicit `'shared'` closes the screen, so a missing field can never lock an
   * advocate out of their own matter.
   */
  if (matter.access === 'shared') {
    return (
      <Screen topInset>
        <View style={styles.body}>
          <BackLink onPress={onBack} />
          <Text variant="ui" style={styles.muted}>
            This matter was shared with you, so the advocate who owns it is the one who can change
            it. You can read everything in it.
          </Text>
        </View>
      </Screen>
    );
  }

  return <ManageForm matter={matter} onBack={onBack} onDone={onDone} save={editMatter} />;
}

function ManageForm({
  matter,
  onBack,
  onDone,
  save,
}: {
  matter: Matter;
  onBack: () => void;
  onDone: () => void;
  save: ReturnType<typeof usePractice.getState>['editMatter'];
}) {
  const [caseTitle, setCaseTitle] = useState(matter.caseTitle);
  const [court, setCourt] = useState(matter.court);
  const [clientName, setClientName] = useState(matter.clientName);
  const [ourSide, setOurSide] = useState<Matter['ourSide']>(matter.ourSide);
  const [cnrNumber, setCnrNumber] = useState(matter.cnrNumber ?? '');
  const [nextHearingDate, setNextHearingDate] = useState(matter.nextHearingDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSheet, setStatusSheet] = useState<MatterStatus | null>(null);

  const status = matterStatus(matter);

  async function submit() {
    if (saving) return;
    if (!caseTitle.trim()) return setError('Give the matter a title.');
    if (!court.trim()) return setError('Which court is this in?');
    if (!clientName.trim()) return setError('Who is the client?');
    if (nextHearingDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextHearingDate)) {
      return setError('Next hearing date must be YYYY-MM-DD.');
    }

    setError(null);
    setSaving(true);
    /*
      `null` CLEARS the CNR and the date; `undefined` would leave them alone.
      An emptied field on this screen is an instruction rather than an omission
      — an advocate who deletes a wrong CNR means it to go.
    */
    const result = await save(matter.matterId, {
      caseTitle: caseTitle.trim(),
      court: court.trim(),
      clientName: clientName.trim(),
      ourSide,
      cnrNumber: cnrNumber.trim() || null,
      nextHearingDate: nextHearingDate.trim() || null,
    });
    setSaving(false);

    // The server's own words. It is the half that says WHAT was rejected.
    if (!result.ok) return setError(result.message);
    onDone();
  }

  async function changeStatus(next: MatterStatus) {
    if (saving) return;
    setStatusSheet(null);
    setError(null);
    setSaving(true);
    const result = await save(matter.matterId, { status: next });
    setSaving(false);
    if (!result.ok) return setError(result.message);
    onDone();
  }

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <BackLink onPress={onBack} />

        <Text variant="eyebrow">{matter.court}</Text>
        <Text variant="uiStrong" scale="title">
          Manage this matter
        </Text>

        <SectionRule label="Details" />

        <Input label="Case title" onChangeText={setCaseTitle} value={caseTitle} />
        <Input label="Court" onChangeText={setCourt} value={court} />
        <Input label="Client name" onChangeText={setClientName} value={clientName} />

        <Text variant="ui" style={styles.fieldLabel}>
          Our side
        </Text>
        <SegmentedRow onChange={setOurSide} options={SIDES} value={ourSide} />

        {/*
          NO RE-SYNC AFFORDANCE. There is no CNR re-sync endpoint and no
          imported history for a changed CNR to replace — the design's copy
          describes a mechanism that does not exist. This is the optional
          record-keeping field the server has always had.
        */}
        <Input
          label="CNR number — optional"
          onChangeText={setCnrNumber}
          placeholder="DLCT01-000000-0000"
          value={cnrNumber}
        />
        <Input
          label="Next hearing date — optional"
          onChangeText={setNextHearingDate}
          placeholder="YYYY-MM-DD"
          value={nextHearingDate}
        />

        {/*
          THE TWO FIELDS THAT ARE NOT HERE, NAMED SO THE NEXT READER DOES NOT
          ADD THEM SPECULATIVELY. `caseType` and `parties` cannot be patched:
          `patchMatterBody` has no such keys and the UPDATE writes no such
          columns. Inputs for them would produce a form that saves successfully
          and changes nothing.
        */}
        <Text variant="ui" style={styles.caveat}>
          Case type and parties are set when a matter is created and cannot be changed here.
        </Text>

        {error ? (
          <Text variant="ui" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button disabled={saving} label={saving ? 'Saving…' : 'Save changes'} onPress={submit} />

        <SectionRule label="Status" />

        <Text variant="ui" style={styles.muted}>
          {STATUS_MEANING[status]}
        </Text>

        {/*
          THE TRANSITIONS AVAILABLE FROM HERE, AND ONLY THOSE. Rendered from the
          enum minus the current value, so there is no arrangement of this
          screen in which a matter can be set to the state it is already in — a
          no-op write that returns 200 and looks as though it did something.
        */}
        <View style={styles.statusActions}>
          {(['active', 'disposed', 'archived'] as const)
            .filter((s) => s !== status)
            .map((s) => (
              <Pressable
                accessibilityRole="button"
                key={s}
                onPress={() => setStatusSheet(s)}
                style={styles.statusAction}
              >
                <Text variant="uiStrong">
                  {s === 'active'
                    ? 'Put back on your list'
                    : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
                </Text>
                <Text variant="ui" style={styles.muted}>
                  {STATUS_MEANING[s]}
                </Text>
              </Pressable>
            ))}
        </View>
      </ScrollView>

      {/*
        ONE CONFIRMATION, AND IT SAYS WHAT SURVIVES.

        D-2: "ARCHIVE MUST NOT LOOK LIKE DELETE. A matter carries saved
        authorities, events, briefings and possibly a share. Nothing on this
        path may read as destruction." So the sheet does not warn — it
        describes, and it names the way back. This is deliberately the opposite
        shape from the delete-account confirmation.
      */}
      <Sheet onDismiss={() => setStatusSheet(null)} visible={statusSheet !== null}>
        {statusSheet ? (
          <View style={styles.sheet}>
            <Text variant="eyebrow">{STATUS_LABEL[statusSheet]}</Text>
            <Text variant="uiStrong">{matter.caseTitle}</Text>
            <Text variant="ui" style={styles.muted}>
              {STATUS_MEANING[statusSheet]}
            </Text>
            {statusSheet === 'active' ? null : (
              <Text variant="ui" style={styles.muted}>
                Its timeline, its saved authorities and anyone it is shared with all stay exactly
                as they are, and you can put it back on your list from here at any time.
              </Text>
            )}
            <Button
              disabled={saving}
              label={CONFIRM_LABEL[statusSheet]}
              onPress={() => void changeStatus(statusSheet)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setStatusSheet(null)}
              style={styles.cancel}
            >
              <Text variant="ui">Cancel</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.back}>
      <Text variant="ui" style={styles.link}>
        ‹ Matter
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },
  fieldLabel: { color: color.inkMuted },
  muted: { color: color.inkMuted },
  caveat: { color: color.inkFaint },
  error: { color: color.oxblood },
  statusActions: { gap: space.xs },
  /**
   * A RULED ROW, NOT A RED BUTTON. Nothing on this path is destructive, so
   * nothing on it is dressed as destruction — oxblood on this screen is spent
   * only on the back link.
   */
  statusAction: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: 4,
    minHeight: 52,
    justifyContent: 'center',
  },
  sheet: { padding: space.sm, gap: space.sm },
  cancel: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});
