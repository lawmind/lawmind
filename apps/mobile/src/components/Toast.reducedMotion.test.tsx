import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { Toast } from './Toast';

/**
 * A TOAST THAT NEVER BECOMES VISIBLE UNDER REDUCE MOTION.
 *
 * Found on the S24, 16 Sep 2026 (RCC R27B), with the system reduced-motion
 * setting on: the reader's refusal ("quote: Too big…") was in the
 * accessibility tree and nowhere on the screen. Pinning `opacity: 1` made the
 * same toast appear at the same moment, so the fade was the cause — with
 * `ReduceMotion.System` the timing is skipped and the toast stayed at opacity 0.
 *
 * The component's own rule is "keep the fade, drop the rise". A fade is not
 * motion, so it runs whatever the system setting says.
 */
it('fades in and out regardless of the reduced-motion setting', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  jest.useFakeTimers();

  await render(<Toast message="We could not save that" />);
  jest.runOnlyPendingTimers();

  expect(withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ reduceMotion: Reanimated.ReduceMotion.Never }),
  );
  expect(withTiming).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ reduceMotion: Reanimated.ReduceMotion.Never }),
  );

  jest.useRealTimers();
});
