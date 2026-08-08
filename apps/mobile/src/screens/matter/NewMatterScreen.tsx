import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
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

  async function submit() {
    if (!caseTitle.trim()) return setError('Give the matter a title.');
    if (!court.trim()) return setError('Which court is this in?');
    if (!clientName.trim()) return setError("Who is the client?");
    if (nextHearingDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextHearingDate)) {
      return setError('Next hearing date must be YYYY-MM-DD.');
    }

    setError(null);
    setSaving(true);
    const res = await api.createMatter({
      caseTitle: caseTitle.trim(),
      cnrNumber: cnrNumber.trim() || null,
      court: court.trim(),
      caseType,
      parties: { description: parties.trim() },
      clientName: clientName.trim(),
      ourSide,
      nextHearingDate: nextHearingDate || null,
    });
    setSaving(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    void refresh();
    onCreated(res.data.matter.matterId);
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

        <Button label={saving ? 'Saving…' : 'Add matter'} onPress={submit} disabled={saving} />
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
});
