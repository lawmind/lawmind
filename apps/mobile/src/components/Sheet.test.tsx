import { render, screen } from '@testing-library/react-native';

import { Sheet } from './Sheet';
import { Text } from './Text';

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
