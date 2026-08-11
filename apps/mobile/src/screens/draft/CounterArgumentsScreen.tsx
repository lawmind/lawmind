import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { CounterArguments } from './CounterArguments';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { CounterArgumentsResponse } from '../../api/contract';
import { useLanguage } from '../../state/language';
import { color, space } from '../../theme/tokens';

/**
 * COUNTER-ARGUMENTS — `design/screens/07-counter-arguments.dc.html`,
 * `FEATURE_PARITY.md` §2.9.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `POST /arguments/counter` has been live and deployed for weeks. `client.ts`
 * has had `counterArguments()` for as long. `CounterArguments.tsx` was built,
 * tested and reviewed. NOTHING MOUNTED ANY OF IT — a reachability audit on
 * 11 Aug 2026 found the component imported by its own test and by nothing
 * else, so the whole feature existed end to end and no advocate could open it.
 *
 * That is its own defect class, and it is the one that hides best: `tsc` is
 * green, the tests pass, the endpoint answers, and the feature is absent.
 *
 * ── THE POSITION IS TYPED, NOT INFERRED ─────────────────────────────────────
 *
 * The endpoint takes a proposition in the advocate's own words and retrieves
 * against it. Nothing in the product holds such a sentence today, and deriving
 * one from a matter's case title would be us writing the advocate's position
 * for them and then answering it — a fabricated premise dressed as their own.
 * So it is a field, and it starts empty.
 *
 * `matterId` is passed through when the screen was opened from a matter. It is
 * an existing, optional parameter on the endpoint, not a new one.
 *
 * ── WHAT THIS SCREEN MUST NOT DO ────────────────────────────────────────────
 *
 * It renders what the server returned and nothing else. Every citation goes
 * through `CounterArguments`, which routes each one through `citationDisplay`
 * and `citationRender`. This file holds no citation logic of its own, which is
 * the point of there being one place that decides.
 */
export function CounterArgumentsScreen({
  matterId,
  onBack,
}: {
  /** Present only when opened from a matter. Passed straight through. */
  matterId?: string;
  onBack: () => void;
}) {
  const language = useLanguage();
  const [position, setPosition] = useState('');
  const [data, setData] = useState<CounterArgumentsResponse | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const run = async () => {
    const stated = position.trim();
    if (!stated || phase === 'running') return;

    setPhase('running');
    setLoadError(null);

    const response = await api.counterArguments(stated, language, matterId);

    if (response.ok) {
      setData(response.data);
      setPhase('done');
    } else {
      setData(null);
      setLoadError(response.error.message);
      setPhase('idle');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Back
          </Text>
        </Pressable>

        <Text variant="eyebrow">Counter-arguments</Text>
        <Text variant="uiStrong" scale="title">
          What will be said against you
        </Text>

        {/*
          SAID BEFORE THE ADVOCATE TYPES, NOT AFTER THE RESULT.
          Today the endpoint returns authorities and no prose. Someone who
          expects the opposing case and reads it for the first time UNDER a
          list of authorities has already read the list as the argument.
        */}
        <Text variant="ui" style={styles.muted}>
          State your position in your own words. Lawmind finds the authorities on that point from
          the corpus. It does not draft the opposing case.
        </Text>

        <Input
          label="YOUR POSITION"
          multiline
          numberOfLines={4}
          onChangeText={setPosition}
          onSubmitEditing={() => void run()}
          placeholder="Bail ought to be granted — the accused was never arrested during investigation."
          returnKeyType="search"
          style={styles.field}
          value={position}
        />

        <Button
          disabled={!position.trim() || phase === 'running'}
          label={phase === 'running' ? 'Searching…' : 'Find the authorities'}
          onPress={() => void run()}
        />

        {loadError ? (
          <Text variant="ui" style={styles.error}>
            {loadError}
          </Text>
        ) : null}

        {/*
          THE POSITION IS ECHOED BY THE PANEL, FROM THE SERVER'S OWN `position`,
          and this screen deliberately does not draw a second copy.
          `contract.ts` says why the field exists: "echoed back so the panel can
          render what was asked, not what was typed". A local copy of the
          sentence would be a second source of truth for the one thing the
          authorities below are an answer to, and the two can drift — the
          server's cannot.
        */}
        {data && phase === 'done' ? <CounterArguments data={data} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.sm, paddingBottom: space.xl },
  back: { alignSelf: 'flex-start' },
  link: { color: color.oxblood },
  muted: { color: color.inkMuted },
  field: { minHeight: 96, textAlignVertical: 'top' },
  error: { color: color.inkMuted },
});
