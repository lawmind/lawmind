import { fireEvent, render, screen } from '@testing-library/react-native';

import type { PremiumPreview } from '../../api/contract';
import { PremiumPreviewCard } from './PremiumPreviewCard';

const preview = (over: Partial<PremiumPreview> = {}): PremiumPreview => ({
  matterId: 'mat_1',
  costClass: 'cheap',
  authorityCount: 6,
  eventCount: 4,
  adverseAuthorities: 1,
  nextHearingDate: '2026-09-03',
  unresolvedFilings: 2,
  stanceNotComputed: true,
  notComputed: [
    'issues — requires generation',
    'whether each authority helps or hurts — no stance is stored; requires generation',
  ],
  asOf: '2026-08-25T00:00:00.000Z',
  ...over,
});

describe('PremiumPreviewCard', () => {
  it('shows only real unsplit counts and states that stance was not computed', async () => {
    await render(<PremiumPreviewCard onOpenPlans={() => {}} preview={preview()} />);

    expect(screen.getByText('6 authorities saved')).toBeTruthy();
    expect(screen.getByText(/4 matter events · 2 unresolved filings/)).toBeTruthy();
    expect(screen.getByText(/has not classified which authorities help or hurt/)).toBeTruthy();
    expect(screen.queryByText(/supporting authorities/i)).toBeNull();
    expect(screen.queryByText(/contrary authorities/i)).toBeNull();
  });

  it('keeps adverse treatment visible outside the Pro action', async () => {
    await render(<PremiumPreviewCard onOpenPlans={() => {}} preview={preview()} />);

    expect(screen.getByText('LAW MOVED')).toBeTruthy();
    expect(screen.getByText(/1 saved authority has adverse treatment/)).toBeTruthy();
  });

  it('does not fabricate a clean-currentness statement when no adverse row is counted', async () => {
    await render(
      <PremiumPreviewCard onOpenPlans={() => {}} preview={preview({ adverseAuthorities: 0 })} />,
    );

    expect(screen.queryByText('LAW MOVED')).toBeNull();
    expect(screen.queryByText(/good law/i)).toBeNull();
  });

  it('opens the existing plan surface from the synthesis CTA', async () => {
    const onOpenPlans = jest.fn();
    await render(<PremiumPreviewCard onOpenPlans={onOpenPlans} preview={preview()} />);

    await fireEvent.press(screen.getByText('View Pro plans'));
    expect(onOpenPlans).toHaveBeenCalledTimes(1);
  });
});
