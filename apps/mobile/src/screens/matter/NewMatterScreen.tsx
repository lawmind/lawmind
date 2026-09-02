import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { runAttempt } from '../../api/attempt';
import { api } from '../../api/client';
import { useAttempt } from '../../hooks/useAttempt';
import { usePendingSave, type PendingSaveResult } from '../../state/pendingSave';
import { usePractice } from '../../state/practice';
import { color, radius, space } from '../../theme/tokens';

/**
 * ADD A MATTER — inventory rows 25/26, canvas `1v` (CNR lookup + manual, v1
 * layout only, no current render). `POST /matters` shape:
 * `createMatterBody` in `services/api/src/matters/route.ts` — caseTitle,
 * cnrNumber?, court, caseType, parties, clientName, ourSide,
 * nextHearingDate?.
 *
 * CNR LOOKUP IS NOT BUILT HERE. `POST /court/lookup` always answers
 * `{ available: false }` until OD-1 (court vendor) resolves — `contract.ts`'s
 * own comment says so. A lookup screen wired to an endpoint that can never
 * succeed today is not a real path, so this is the manual form alone
 * (PD-12 — manual entry is first-class, never a fallback), with the CNR
 * field kept as the optional record-keeping field it already is on the
 * server.
 *
 * `parties` HAS NO KEY SPEC ANYWHERE — `matters.parties` is bare `jsonb`,
 * accepted as any object. `{ description }` is this screen's own choice of
 * shape (`api/contract.ts`'s `Matter.parties` note), not something the
 * server requires.
 *
 * ── IT FINISHES A SAVE THAT STARTED SOMEWHERE ELSE ──────────────────────────
 *
 * NEW3 R16 §8, `R16-RCC-04`: `CREATE_THEN_AUTO_SAVE_PENDING_AUTHORITY`.
 *
 * When an advocate reached this form from `MatterPicker`'s empty state, they
 * were part-way through saving an authority or a passage. That intent is held in
 * `state/pendingSave.ts` and is performed here, against the id `POST /matters`
 * just returned.
 *
 * TWO OUTCOMES AND THEY ARE RENDERED DIFFERENTLY, which is the whole point:
 *
 *   BOTH SUCCEEDED   → open the new matter. The authority is in it.
 *   MATTER ONLY      → STAY HERE and say so, with a retry. The matter exists and
 *                      the save does not, and that is a partial result, not a
 *                      success. Navigating away with a cheerful toast is how an
 *                      advocate ends up believing an authority is on a file it
 *                      is not on.
 *
 * A form reached directly from Matters holds no intent and behaves exactly as
 * it always has — create, then open.
 */

const CASE_TYPES = [
  { value: 'criminal', label: 'Criminal' },
  { value: 'civil', label: 'Civil' },
] as const;

const SIDES = [
  { value: 'petitioner', label: 'Petitioner' },
  { value: 'respondent', label: 'Respondent' },
  { value: 'accused', label: 'Accused' },
  { value: 'complainant', label: 'Complainant' },
  { value: 'other', label: 'Other' },
] as const;

type CaseType = (typeof CASE_TYPES)[number]['value'];
type Side = (typeof SIDES)[number]['value'];

export function NewMatterScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (matterId: string) => void;
}) {
  const [caseTitle, setCaseTitle] = useState('');
  const [court, setCourt] = useState('');
  const [caseType, setCaseType] = useState<CaseType>('civil');
  const [parties, setParties] = useState('');
  const [clientName, setClientName] = useState('');
  const [ourSide, setOurSide] = useState<Side>('petitioner');
  const [cnrNumber, setCnrNumber] = useState('');
  const [nextHearingDate, setNextHearingDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = usePractice((s) => s.refresh);
  const heldSave = usePendingSave((s) => s.held);
  const runHeldSave = usePendingSave((s) => s.runFor);
  const clearHeldSave = usePendingSave((s) => s.clear);
  /**
   * THE PARTIAL RESULT. Set only when the matter was created and the held save
   * was not — the id is kept so a retry has something to save INTO, and so the
   * advocate can still open the matter that does exist.
   */
  const [partial, setPartial] = useState<{ matterId: string; result: PendingSaveResult } | null>(
    null,
  );
  /** The matter create. One key per intentional matter, discarded once it exists. */
  const attempt = useAttempt();
  /**
   * The held-save RETRY is a separate logical mutation with a separate latch —
   * the annotation's own key lives on the persisted intent in `pendingSave.ts`,
   * so this guards only the double tap on the retry button.
   */
  const heldAttempt = useAttempt();

  async function submit() {
    /*
      THE LATCH IS TAKEN FIRST, before validation and before `setSaving`. A
      React state commit is asynchronous, so two taps in one frame both read the
      old `saving` and both create a matter; a ref write is true on the next
      statement. See `useAttempt`.
    */
    const attemptKey = attempt.begin();
    if (attemptKey === null) return;

    if (!caseTitle.trim()) {
      attempt.settle();
      return setError('Give the matter a title.');
    }
    if (!court.trim()) {
      attempt.settle();
      return setError('Which court is this in?');
    }
    if (!clientName.trim()) {
      attempt.settle();
      return setError("Who is the client?");
    }
    if (nextHearingDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextHearingDate)) {
      attempt.settle();
      return setError('Next hearing date must be YYYY-MM-DD.');
    }

    setError(null);
    setSaving(true);
    /*
      `parties` STAYS `{ description }`. LCC's `POST /matters` currently returns
      it as a JSON-ENCODED STRING (bus 1697): `matters/route.ts` writes
      `${JSON.stringify(body.parties)}::jsonb` and postgres.js encodes the JS
      string again, so the stored jsonb is a string SCALAR. NEW3 R18 classified
      that as a backend/storage defect and LCC owns the repair; a defensive
      `JSON.parse` here would make the UI look fixed today and break on the day
      the server is corrected. What this client SENDS has always been right and
      is unchanged.
    */
    const res = await runAttempt(attemptKey, (key) =>
      api.createMatter(
        {
          caseTitle: caseTitle.trim(),
          cnrNumber: cnrNumber.trim() || null,
          court: court.trim(),
          caseType,
          parties: { description: parties.trim() },
          clientName: clientName.trim(),
          ourSide,
          nextHearingDate: nextHearingDate || null,
        },
        key,
      ),
    );
    setSaving(false);

    if (!res.ok) {
      // The key is kept: pressing Save again is the same intentional matter, and
      // reusing it is what stops a lost response from creating a second one.
      attempt.settle();
      setError(res.error.message);
      return;
    }
    // The matter exists. A later tap is a NEW matter and gets a new key.
    attempt.complete();
    void refresh();

    const matterId = res.data.matter.matterId;

    /*
      THE HELD SAVE, AGAINST THE MATTER THAT NOW EXISTS. `runFor` returns null
      when nothing was held, which is the ordinary path from Matters — and a
      null is NOT a failure, so it falls through to the same navigation this
      screen has always done.
    */
    const held = await runHeldSave(matterId);
    if (held !== null && held.kind === 'failed') {
      setPartial({ matterId, result: held });
      return;
    }

    onCreated(matterId);
  }

  /**
   * RETRY THE SAVE, NOT THE MATTER. The matter is already created; creating a
   * second one would be the obvious wrong repair. The intent is still held —
   * `pendingSave` clears it only on success — so this simply runs it again.
   *
   * For an AUTHORITY this is free: the server answers 200 for a judgment already
   * saved. For an ANNOTATION it is now free too — R16's `Idempotency-Key` rides
   * on the persisted intent, so a replay returns the original row rather than
   * inserting a second. The store's single-flight latch and the synchronous
   * guard here still stop two requests leaving the device at all.
   */
  async function retryHeldSave() {
    // `saving` is state and therefore late; `heldAttempt` is the synchronous
    // guard. Both are kept — the first drives the button's appearance, the
    // second decides whether a second tap does anything.
    if (!partial || heldAttempt.inFlight()) return;
    if (heldAttempt.begin() === null) return;
    setSaving(true);
    const again = await runHeldSave(partial.matterId);
    setSaving(false);
    if (again === null || again.kind === 'saved') {
      heldAttempt.complete();
      return onCreated(partial.matterId);
    }
    heldAttempt.settle();
    setPartial({ matterId: partial.matterId, result: again });
  }

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Matters
          </Text>
        </Pressable>

        <Text variant="eyebrow">Your practice</Text>
        <Text variant="uiStrong" scale="title">
          Add a matter
        </Text>

        {/*
          SAYS WHAT IS WAITING ON THIS FORM. An advocate who arrived here from a
          save has a reason to finish it, and stating the reason is also what
          makes the outcome legible afterwards — a confirmation that names an
          authority nobody was told about reads as a non-sequitur.
        */}
        {heldSave && !partial ? (
          <Text variant="ui" style={styles.pending}>
            {heldSave.kind === 'authority'
              ? `${heldSave.caseTitle} will be saved to this matter once it exists.`
              : `Your marked passage from ${heldSave.caseTitle} will be saved to this matter once it exists.`}
          </Text>
        ) : null}

        <Input label="Case title" onChangeText={setCaseTitle} placeholder="State v. Ramesh Kumar" value={caseTitle} />
        <Input label="Court" onChangeText={setCourt} placeholder="Delhi High Court" value={court} />

        <Text variant="ui" style={styles.fieldLabel}>
          Case type
        </Text>
        <SegmentedRow options={CASE_TYPES} value={caseType} onChange={setCaseType} />

        <Input label="Parties" onChangeText={setParties} placeholder="Ramesh Kumar v. State of NCT of Delhi" value={parties} />
        <Input label="Client name" onChangeText={setClientName} placeholder="Who you act for" value={clientName} />

        <Text variant="ui" style={styles.fieldLabel}>
          Our side
        </Text>
        <SegmentedRow options={SIDES} value={ourSide} onChange={setOurSide} />

        <Input
          label="CNR number — optional"
          onChangeText={setCnrNumber}
          placeholder="DLCT01-000000-0000"
          value={cnrNumber}
        />
        {/*
          PD-12 — manual entry is first-class, never a fallback. Next dates
          are given orally in open court; typing one here is the ordinary
          path, not a workaround for a missing lookup.
        */}
        <Input
          label="Next hearing date — optional"
          onChangeText={setNextHearingDate}
          placeholder="YYYY-MM-DD"
          value={nextHearingDate}
        />

        {error ? (
          <Text variant="ui" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {partial ? (
          /*
            THE MATTER EXISTS AND THE SAVE DOES NOT. Stated in that order,
            because the first half is a fact the advocate must not be allowed to
            miss — otherwise they retry by creating a SECOND matter.

            The server's message is rendered verbatim beneath it: on
            `set_aside` it names the judgment that replaced this one, which is
            the actionable half of the refusal and is not ours to reword.
          */
          <View style={styles.partial}>
            <Text variant="uiStrong">The matter was created. {partial.result.caseTitle} was not saved to it.</Text>
            <Text variant="ui" style={styles.partialReason}>
              {partial.result.kind === 'saved' ? '' : partial.result.message}
            </Text>
            {/*
              NO RETRY FOR `corpus_unavailable` — R17 §1 write.

              Every other failure here is worth pressing again: a dropped
              connection, a 500, a refusal the advocate can act on. This one is
              not. The corpus generation this request pinned does not carry the
              target, and that does not change because somebody taps a button —
              it changes when a different generation is activated, which is not
              an action available on this screen or to this advocate. Offering
              the button anyway would be offering a guaranteed failure, twice,
              in the minutes before a hearing.

              The intent stays HELD either way, so a later generation makes it
              savable with nothing to redo. What is withdrawn is only the
              promise that trying now would help.
            */}
            {partial.result.kind === 'corpus_unavailable' ? null : (
              <Button
                disabled={saving}
                label={saving ? 'Saving…' : 'Try saving it again'}
                onPress={() => void retryHeldSave()}
              />
            )}
            <Button
              label="Open the matter without it"
              variant="secondary"
              onPress={() => {
                /*
                  ABANDONING THE SAVE IS AN EXPLICIT ACT, and it is the only
                  other way out of this state. The intent is cleared HERE rather
                  than on navigation, so backing out of this screen by any other
                  route leaves it held and retryable.
                */
                clearHeldSave();
                onCreated(partial.matterId);
              }}
            />
          </View>
        ) : (
          <Button label={saving ? 'Saving…' : 'Add matter'} onPress={submit} disabled={saving} />
        )}
      </ScrollView>
    </Screen>
  );
}

function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, value === o.value ? styles.segmentOn : null]}
        >
          <Text variant="ui" style={value === o.value ? styles.segmentOnLabel : undefined}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },
  fieldLabel: { color: color.inkMuted },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  segment: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
  },
  segmentOn: { backgroundColor: color.ink, borderColor: color.ink },
  segmentOnLabel: { color: color.card },
  error: { color: color.oxblood },
  pending: { color: color.inkMuted },
  /**
   * Neutral ink with a dashed edge — the house style for OUR uncertainty. This
   * is not the law having moved and carries no amber; it is a write of ours
   * that did not land.
   */
  partial: {
    gap: space.xs,
    padding: space.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.ink,
  },
  partialReason: { color: color.inkMuted },
});
