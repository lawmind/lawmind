import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Pressable } from '../../components/Pressable';
import { SectionRule } from '../../components/SectionRule';
import { Sheet } from '../../components/Sheet';
import { SettingsRow } from '../../components/SettingsRow';
import { Switch } from '../../components/Switch';
import { Text } from '../../components/Text';
import type { SearchFilters } from '../../api/contract';
import { color, radius, space } from '../../theme/tokens';

/**
 * PD-10 — FIVE SECTIONS, AND NO JUDGE OR REPORTER FILTER.
 *
 * Both were cut deliberately: a judge filter is a research tool and reporter
 * choice is a citation-format concern, not a search one. Neither is how an
 * advocate looks for law. There is no key for either in `SearchFilters` and
 * adding one is a product decision, not a build one.
 *
 * The commit button COUNTS RESULTS BEFORE YOU COMMIT — "Show 5 judgments", not
 * "Apply". An advocate standing in a corridor should not have to close a sheet
 * to find out whether a filter left them with nothing.
 *
 * `renders/63-search-filters@2x.png`, canvas `11f`.
 */

const COURTS: { key: SearchFilters['courts'][number]; label: string }[] = [
  { key: 'sc', label: 'Supreme Court' },
  { key: 'hc', label: 'High Courts' },
  { key: 'district', label: 'District' },
  { key: 'tribunal', label: 'Tribunals' },
];

const BENCH: { key: SearchFilters['bench'][number]; label: string }[] = [
  { key: 'constitution', label: 'Constitution Bench' },
  { key: 'three_plus', label: '3 judges or more' },
];

const DATES: { key: SearchFilters['date']; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'last_10', label: 'Last 10 years' },
  { key: 'since_2020', label: 'Since 2020' },
];

const SUBJECTS = ['criminal', 'matrimonial', 'civil', 'service'];
const SUBJECT_LABEL: Record<string, string> = {
  criminal: 'Criminal',
  matrimonial: 'Matrimonial',
  civil: 'Civil',
  service: 'Service',
};

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
      <View style={[styles.chip, selected && styles.chipSelected]}>
        <Text variant="ui" style={selected ? styles.chipLabelSelected : styles.chipLabel}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function FiltersSheet({
  visible,
  filters,
  resultCount,
  hasSearched,
  onApply,
  onDismiss,
}: {
  visible: boolean;
  filters: SearchFilters;
  /** Counts against the CURRENT draft, so the button is honest before commit. */
  resultCount: (draft: SearchFilters) => number;
  /** No query has run yet, so there is nothing truthful to count. */
  hasSearched: boolean;
  onApply: (next: SearchFilters) => void;
  onDismiss: () => void;
}) {
  const [draft, setDraft] = useState<SearchFilters>(filters);

  const toggle = <K extends 'courts' | 'bench' | 'subjects'>(
    key: K,
    value: SearchFilters[K][number]
  ) =>
    setDraft((d) => {
      const list = d[key] as SearchFilters[K][number][];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...d, [key]: next } as SearchFilters;
    });

  const count = resultCount(draft);

  return (
    <Sheet onDismiss={onDismiss} visible={visible}>
      <View style={styles.head}>
        <Text variant="uiStrong" scale="title">
          Filters
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setDraft(filters)}>
          <Text variant="ui" style={styles.clear}>
            Clear all
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <SectionRule label="Court and bench" />
        <View style={styles.chips}>
          {COURTS.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              onPress={() => toggle('courts', c.key)}
              selected={draft.courts.includes(c.key)}
            />
          ))}
          {BENCH.map((b) => (
            <Chip
              key={b.key}
              label={b.label}
              onPress={() => toggle('bench', b.key)}
              selected={draft.bench.includes(b.key)}
            />
          ))}
        </View>

        <SectionRule label="Date" />
        <View style={styles.chips}>
          {DATES.map((d) => (
            <Chip
              key={d.key}
              label={d.label}
              onPress={() => setDraft((prev) => ({ ...prev, date: d.key }))}
              selected={draft.date === d.key}
            />
          ))}
        </View>

        <SectionRule label="Subject" />
        <View style={styles.chips}>
          {SUBJECTS.map((s) => (
            <Chip
              key={s}
              label={SUBJECT_LABEL[s] ?? s}
              onPress={() => toggle('subjects', s)}
              selected={draft.subjects.includes(s)}
            />
          ))}
        </View>

        <SectionRule label="Reliability" />
        <SettingsRow
          control={
            <Switch
              accessibilityLabel="Only verified authorities"
              onValueChange={(v) => setDraft((prev) => ({ ...prev, onlyVerified: v }))}
              value={draft.onlyVerified}
            />
          }
          label="Only verified authorities"
          subtitle="Hides anything we could not confirm"
        />
        <SettingsRow
          control={
            <Switch
              accessibilityLabel="Exclude set aside or doubted"
              onValueChange={(v) =>
                setDraft((prev) => ({ ...prev, excludeSetAsideOrDoubted: v }))
              }
              value={draft.excludeSetAsideOrDoubted}
            />
          }
          label="Exclude set aside or doubted"
          subtitle="Good law only"
        />

        {/*
          The count is the point of this button — but before a query has run
          there is nothing to count, and "Show 0 judgments" would be a false
          statement about a search nobody has made yet.
        */}
        <Button
          label={
            !hasSearched
              ? 'Apply these filters'
              : count === 1
                ? 'Show 1 judgment'
                : `Show ${count} judgments`
          }
          onPress={() => onApply(draft)}
          style={styles.commit}
        />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
  },
  clear: { color: color.oxblood },
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.card,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
  },
  /** Selected is INK, not oxblood. The accent is spent on the commit button. */
  chipSelected: { backgroundColor: color.ink, borderColor: color.ink },
  chipLabel: { color: color.ink },
  chipLabelSelected: { color: color.card },
  commit: { marginTop: space.xs },
});
