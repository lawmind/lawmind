import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedRow } from './SegmentedRow';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * N-8 — THE ACCESSIBILITY TREE MUST AGREE WITH THE PIXELS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate C found the *Case type* and *Our side* chips visually selected while the
 * accessibility tree reported otherwise. A screen-reader user therefore could not
 * tell what the matter was about to be created as.
 *
 * Every assertion below is on the a11y tree rather than on style, because style
 * was never wrong — a test that checked the highlight would have passed
 * throughout the defect. `getByRole('button', { selected })` queries the state
 * TalkBack and VoiceOver actually read, which is the thing that was missing.
 */
const OPTIONS = [
  { value: 'criminal', label: 'Criminal' },
  { value: 'civil', label: 'Civil' },
] as const;

describe('SegmentedRow · selection is announced, not only drawn', () => {
  it('reports the chosen segment as selected and the others as not', async () => {
    await render(<SegmentedRow options={OPTIONS} value="civil" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Civil', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criminal', selected: false })).toBeTruthy();
  });

  it('moves the selected state when the choice changes, and does not leave two selected', async () => {
    /**
     * A stateful host rather than `rerender`, because that is how both screens
     * actually use this: `useState` holds the value and the press feeds it back.
     * Driving it through a real state update tests the contract the screens rely
     * on instead of the test harness's re-render API.
     */
    function Host() {
      const [value, setValue] = useState<'criminal' | 'civil'>('civil');
      return <SegmentedRow options={OPTIONS} value={value} onChange={setValue} />;
    }
    await render(<Host />);

    expect(screen.getByRole('button', { name: 'Civil', selected: true })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Criminal' }));
    });

    expect(screen.getByRole('button', { name: 'Criminal', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Civil', selected: false })).toBeTruthy();
    /**
     * Exactly one. A stale `selected` left on the previous segment would read to
     * a screen reader as two simultaneous answers to a single-choice question —
     * worse than none, because it sounds authoritative.
     */
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
  });

  it('every segment is reachable by its visible label, so the announcement names the choice', async () => {
    await render(<SegmentedRow options={OPTIONS} value="civil" onChange={() => {}} />);
    for (const o of OPTIONS) {
      expect(screen.getByRole('button', { name: o.label })).toBeTruthy();
    }
  });

  it('carries a 44dp minimum target, which is the other half of a usable control', async () => {
    await render(<SegmentedRow options={OPTIONS} value="civil" onChange={() => {}} />);
    /**
     * Asserted on the style the component owns. The house `Pressable` enforces a
     * 44x44 floor of its own as well; this proves the component did not lose its
     * own `minHeight` while being moved out of the two screens.
     */
    const flattened = screen.getByRole('button', { name: 'Civil' }).props.style;
    const styles: unknown[] = Array.isArray(flattened) ? flattened.flat(Infinity) : [flattened];
    const heights = styles
      .filter((s): s is { minHeight?: number } => typeof s === 'object' && s !== null)
      .map((s) => s.minHeight)
      .filter((h): h is number => typeof h === 'number');
    expect(Math.max(...heights, 0)).toBeGreaterThanOrEqual(44);
  });
});
