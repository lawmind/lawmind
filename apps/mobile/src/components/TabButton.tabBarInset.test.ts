import { tabBarPaddingBottom } from './TabButton';
import { size } from '../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TAB BAR MUST CLEAR THE SYSTEM BAR, AND THE TOKEN IS ONLY THE FLOOR.
 *
 * The regression this exists to catch is not hypothetical — it shipped. The bar
 * padded a flat `size.tabBarInset` (30dp), which is the iOS home indicator and
 * nothing else. Measured on a physical Galaxy S24, Android 16, three-button
 * navigation, 31 Aug 2026: the system navigation bar owns y2205–2340 of a
 * 2340px screen and the tab row ran to y2256, so 51px of every tab — the whole
 * label row — was drawn inside the navigation bar next to Android's own
 * buttons. After the fix the row terminates at exactly y2205.
 *
 * BOTH DIRECTIONS ARE ASSERTED. A test that only checked "the device inset is
 * used" would pass a plain swap to `insets.bottom`, and that is the more likely
 * regression: it looks tidier and it silently tightens the bar to nothing on
 * every device that reports no bottom inset at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */

it('clears a three-button Android navigation bar, which is larger than the token', () => {
  // 135px at the S24's 450dpi is 48dp — the measured case above.
  expect(tabBarPaddingBottom(48)).toBe(48);
});

it('clears an iOS home indicator', () => {
  expect(tabBarPaddingBottom(34)).toBe(34);
});

/**
 * The assertion that stops the fix being "simplified" into a plain swap.
 * A device with no bottom inset must still get the bar's own spacing.
 */
it('falls back to the token when the system asks for nothing', () => {
  expect(tabBarPaddingBottom(0)).toBe(size.tabBarInset);
});

it('keeps the token when the system inset is smaller than it', () => {
  expect(tabBarPaddingBottom(16)).toBe(size.tabBarInset);
  expect(size.tabBarInset).toBe(30);
});
