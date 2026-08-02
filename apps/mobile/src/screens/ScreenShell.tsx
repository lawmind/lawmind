import { ScrollView, StyleSheet, View } from 'react-native';
import { Link, Stack } from 'expo-router';

import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { SectionRule } from '../components/SectionRule';
import { Text } from '../components/Text';
import { color, space } from '../theme/tokens';
import { APP_SCREENS, screenByNumber } from './manifest';

/**
 * Sprint 0 ships SHELLS. Each one names the screen, its canvas id and its
 * golden render, so the next sprint opens the right drawing rather than
 * guessing from the title.
 *
 * A screen marked NOT YET DESIGNED gets a stub that SAYS SO. It does not get an
 * improvised layout: improvising one is how a design decision gets made by
 * whoever happened to be building that afternoon, and undesigned screens in
 * this product are undesigned because a product question is still open.
 */
export function ScreenShell({ n }: { n: number }) {
  const screen = screenByNumber(n);

  if (!screen) {
    // Unreachable from a generated route; kept because a hand-written route
    // with a wrong number should fail loudly rather than render an empty page.
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="ui">No screen #{String(n)} in the inventory.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: screen.title }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow">{screen.group}</Text>
        <Text variant="uiStrong" scale="title">
          {screen.title}
        </Text>

        {screen.designed ? null : (
          <Card style={styles.undesigned}>
            <Text variant="eyebrow" style={styles.undesignedEyebrow}>
              Not yet designed
            </Text>
            <Text variant="ui" style={styles.undesignedBody}>
              {screen.notes}
            </Text>
            <Text variant="ui" style={styles.undesignedBody}>
              This is a stub. Drawing it is a Claude Design task, not a build task — the screen is
              undesigned because a product question is still open.
            </Text>
          </Card>
        )}

        <SectionRule label="Reference" />
        <Card style={styles.reference}>
          <Row label="Inventory row" value={`#${screen.n}`} />
          <Row label="Canvas" value={screen.canvas ?? 'none'} />
          <Row label="Render" value={screen.render ?? 'none'} />
        </Card>

        {screen.notes && screen.designed ? (
          <Text variant="ui" style={styles.notes}>
            {screen.notes}
          </Text>
        ) : null}

        <Text variant="ui" style={styles.stub}>
          Shell only — no business logic in Sprint 0.
        </Text>

        <Link href="/directory" style={styles.directory}>
          <Text variant="ui" style={styles.directoryLabel}>
            All {APP_SCREENS.length} app screens
          </Text>
        </Link>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="eyebrow" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="record" opticalNudge style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  /**
   * Neutral ink with a dashed edge — NOT amber.
   *
   * `IMPLEMENTATION.md` §9c reserves caution `#B4690E` for exactly one meaning:
   * THE LAW HAS MOVED. It no longer appears on drafts, on OCR, or on anything
   * about our own confidence. An undesigned screen is a fact about us, so it
   * gets the dashed neutral treatment — open, nothing impressed here.
   */
  undesigned: { borderColor: color.rule, borderStyle: 'dashed', gap: space.xs },
  undesignedEyebrow: { color: color.inkMuted },
  undesignedBody: { color: color.inkMuted },
  reference: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowLabel: { width: 110 },
  rowValue: { flex: 1 },
  notes: { color: color.inkMuted },
  stub: { color: color.inkFaint },
  directory: { marginTop: space.sm },
  directoryLabel: { color: color.oxblood },
});
