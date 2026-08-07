import { TodayScreen } from '../../src/screens/today/TodayScreen';

/**
 * 7 · tab route. Today is the primary screen and the first of the daily loop.
 * `topInset` is handled inside the screen, which draws its own top.
 */
export default function Route() {
  return <TodayScreen />;
}
