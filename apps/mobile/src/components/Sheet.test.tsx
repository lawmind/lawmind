import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Sheet, sheetBottomPadding } from './Sheet';
import { Text } from './Text';
import { space } from '../theme/tokens';

/**
 * THE MOUNT CONTRACT, and only that.
 *
 * The sheet's real properties — 1:1 tracking, velocity handoff, momentum
 * projection, catchability mid-flight — are DEVICE checks. They cannot be
 * asserted here: the reanimated stub returns the target value immediately and
 * there is no gesture, no velocity and no frame clock in Node. Pretending
 * otherwise with a mocked spring would be a test that passes whatever the sheet
 * does, which is worse than no test.
 *
 * What this DOES protect is the thing that broke when the sheet stopped being a
 * bare `Modal`: it now unmounts itself on a callback rather than on the
 * `visible` prop, so "closed renders nothing" and "open renders its children"
 * became behaviour that code can get wrong. It also proves the component's
 * imports — gesture-handler included — resolve at all.
 */

it('renders its children when open', async () => {
  await render(
    <Sheet onDismiss={() => {}} visible>
      <Text variant="ui">Filters</Text>
    </Sheet>
  );

  expect(screen.getByText('Filters')).toBeTruthy();
});

it('renders nothing at all when it has never been opened', async () => {
  await render(
    <Sheet onDismiss={() => {}} visible={false}>
      <Text variant="ui">Filters</Text>
    </Sheet>
  );

  expect(screen.queryByText('Filters')).toBeNull();
});

/**
 * THE BOTTOM INSET IS CLEARED BY THE SHARED SHEET. RCC R29, defect 2.
 *
 * On the S24 the lowest control sat under the navigation bar: the padding was
 * `space.lg` whatever the device. It is now the inset plus `space.sm`, never
 * less than `space.lg` — so an inset-free device renders exactly as before.
 */
describe('bottom safe area', () => {
  const padded = (bottom: number) =>
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 412, height: 915 },
          insets: { top: 0, left: 0, right: 0, bottom },
        }}
      >
        <Sheet onDismiss={() => {}} visible>
          <Text variant="ui">Save</Text>
        </Sheet>
      </SafeAreaProvider>
    );

  const paddingBottom = () =>
    (StyleSheet.flatten(screen.getByTestId('sheet-surface').props.style) as { paddingBottom?: number })
      .paddingBottom;

  it('adds the device bottom inset', async () => {
    await padded(48);
    expect(paddingBottom()).toBe(48 + space.sm);
  });

  it('keeps the design floor where the inset is small or absent', async () => {
    await padded(0);
    expect(paddingBottom()).toBe(space.lg);
  });

  it('the rule itself', () => {
    expect(sheetBottomPadding(0)).toBe(space.lg);
    expect(sheetBottomPadding(16)).toBe(space.lg);
    expect(sheetBottomPadding(24)).toBe(24 + space.sm);
    expect(sheetBottomPadding(34)).toBeGreaterThanOrEqual(34);
  });
});
