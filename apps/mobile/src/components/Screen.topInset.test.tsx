import { Text as RNText, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen } from './Screen';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO CLEARS THE STATUS BAR.
 *
 * Four routes run under `headerShown: false` — the four tabs, the judgment
 * route and the precedent route — and are therefore responsible for their own
 * top clearance. Every other screen sits in the Stack, whose header already
 * consumes the inset; padding those again is a visible double gap, not a
 * harmless extra.
 *
 * So this asserts BOTH directions. A test that only checked "the inset is
 * applied" would pass a change that applied it everywhere, which is the more
 * likely regression: someone makes `topInset` the default because one tab
 * looked wrong.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * A notched device. The jest mock defaults every inset to zero, against which
 * a padded screen and an unpadded one are indistinguishable — so the provider
 * supplies real metrics and the assertions have something to bite on.
 */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const contentStyle = () => {
  const node = screen.getByTestId('screen-content');
  return Object.assign(
    {},
    ...(([] as unknown[]).concat(node.props.style).filter(Boolean) as object[])
  ) as { paddingTop?: number; paddingHorizontal?: number };
};

it('clears the status bar when the screen draws its own top', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Screen topInset>
        <View>
          <RNText>body</RNText>
        </View>
      </Screen>
    </SafeAreaProvider>
  );

  expect(contentStyle().paddingTop).toBe(47);
});

/**
 * The Stack header has already consumed the inset for these. This is the
 * assertion that stops `topInset` quietly becoming the default.
 */
it('adds nothing when the screen sits under a Stack header', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Screen>
        <View>
          <RNText>body</RNText>
        </View>
      </Screen>
    </SafeAreaProvider>
  );

  expect(contentStyle().paddingTop).toBeUndefined();
});

it('leaves a caller style intact rather than overwriting it', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Screen topInset style={{ paddingHorizontal: 12 }}>
        <View>
          <RNText>body</RNText>
        </View>
      </Screen>
    </SafeAreaProvider>
  );

  const flat = contentStyle();
  expect(flat.paddingTop).toBe(47);
  expect(flat.paddingHorizontal).toBe(12);
});
