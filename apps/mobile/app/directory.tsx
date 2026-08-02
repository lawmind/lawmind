import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Link, Stack, type Href } from 'expo-router';

import { Screen } from '../src/components/Screen';
import { SectionRule } from '../src/components/SectionRule';
import { Text } from '../src/components/Text';
import { color, space } from '../src/theme/tokens';
import { APP_SCREENS, screenGroups } from '../src/screens/manifest';

/**
 * The screen inventory, walkable.
 *
 * Not one of the inventory rows — this is build scaffolding. It exists so "every route
 * reachable, no dead route" is something you can verify by tapping rather than
 * by reading a list of filenames, and so the gate check has a single page to
 * walk.
 *
 * App screens only. The 18 admin sections are routes of the admin desk, a
 * separate web app, and the 3 launch assets are App Store material with no route
 * at all — all three are in the same inventory, only one is on this phone.
 */
export default function Directory() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Screens' }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow">design/screens/SCREENS.md</Text>
        <Text variant="uiStrong" scale="title">
          {`${APP_SCREENS.length} app screens`}
        </Text>

        {screenGroups('app').map((group) => (
          <Fragment key={group}>
            <SectionRule label={group} />
            {/* Every route file is generated from this manifest, so all of
                them exist; typed routes cannot see that the string came from
                the same source, hence the cast. */}
            {APP_SCREENS.filter((s) => s.group === group).map((s) => (
              <Link asChild href={s.route as Href} key={s.slug}>
                <View style={styles.row}>
                  <Text variant="record" style={styles.number}>
                    {String(s.n).padStart(2, '0')}
                  </Text>
                  <Text variant="ui" style={styles.title}>
                    {s.title}
                  </Text>
                  {s.designed ? null : (
                    <Text variant="eyebrow" style={styles.undesigned}>
                      Not designed
                    </Text>
                  )}
                </View>
              </Link>
            ))}
          </Fragment>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.xs, paddingBottom: space.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  number: { width: 28 },
  title: { flex: 1 },
  // Neutral ink, not amber. §9c reserves caution for "the law has moved".
  undesigned: { color: color.inkMuted },
});
