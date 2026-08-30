import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CapabilityBoundary } from './CapabilityBoundary';
import { useSurfaceEnabled } from '../state/capabilities';

const mockRedirect = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: unknown) => mockRedirect(props),
}));

jest.mock('../state/capabilities', () => ({
  useSurfaceEnabled: jest.fn(),
}));

const enabled = useSurfaceEnabled as jest.MockedFunction<typeof useSurfaceEnabled>;

beforeEach(() => {
  enabled.mockReset();
  mockRedirect.mockClear();
});

it('does not mount a held capability and redirects to the enabled core', async () => {
  enabled.mockReturnValue(false);

  await render(
    <CapabilityBoundary surface="briefing">
      <Text>Held screen loaded</Text>
    </CapabilityBoundary>,
  );

  expect(screen.queryByText('Held screen loaded')).toBeNull();
  expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: '/today' }));
});

it('mounts the route only when both product and runtime gates permit it', async () => {
  enabled.mockReturnValue(true);

  await render(
    <CapabilityBoundary surface="briefing">
      <Text>Enabled screen loaded</Text>
    </CapabilityBoundary>,
  );

  expect(screen.getByText('Enabled screen loaded')).toBeTruthy();
  expect(mockRedirect).not.toHaveBeenCalled();
});
