import { render, screen } from '@testing-library/react-native';

import { TemplatePicker, type DraftTemplate } from './TemplatePicker';

/**
 * TWO GATES UNDER TEST.
 *
 *   1. ONLY `live` TEMPLATES ARE OFFERED. Nothing ships below a gate score of
 *      90 without a founder override, and a picker that listed drafts would
 *      route an advocate into a template that had not passed court-format
 *      compliance or no-invented-citations.
 *
 *   2. THE हिं BADGE IS THE OD-5 GATE, NOT A LANGUAGE LABEL. Hindi drafting
 *      releases only when two law graduates approve the register on 20 sampled
 *      drafts. Promising Hindi we have not reviewed is how a bad draft gets
 *      filed — "a bad search result is discarded in a second, a bad draft gets
 *      filed".
 */

const t = (over: Partial<DraftTemplate>): DraftTemplate => ({
  documentType: 'bail',
  label: 'Bail application',
  category: 'Criminal',
  status: 'live',
  hindiApproved: true,
  ...over,
});

describe('TemplatePicker', () => {
  it('offers a live template', async () => {
    await render(<TemplatePicker onPick={() => {}} recentlyUsed={[]} templates={[t({})]} />);
    expect(screen.getByText('Bail application')).toBeTruthy();
  });

  it('never offers a template still in draft', async () => {
    await render(
      <TemplatePicker
        onPick={() => {}}
        recentlyUsed={[]}
        templates={[t({ documentType: 'x', label: 'Unreviewed draft', status: 'draft' })]}
      />
    );
    expect(screen.queryByText('Unreviewed draft')).toBeNull();
  });

  it('never offers a retired template', async () => {
    await render(
      <TemplatePicker
        onPick={() => {}}
        recentlyUsed={[]}
        templates={[t({ documentType: 'y', label: 'Old format', status: 'retired' })]}
      />
    );
    expect(screen.queryByText('Old format')).toBeNull();
  });

  it('shows the Hindi badge only where the OD-5 review has passed', async () => {
    await render(
      <TemplatePicker
        onPick={() => {}}
        recentlyUsed={[]}
        templates={[t({ documentType: 'a', label: 'Reviewed', hindiApproved: true })]}
      />
    );
    expect(screen.getByText('हिं')).toBeTruthy();
  });

  it('withholds the Hindi badge where it has not', async () => {
    await render(
      <TemplatePicker
        onPick={() => {}}
        recentlyUsed={[]}
        templates={[t({ documentType: 'b', label: 'Not reviewed', hindiApproved: false })]}
      />
    );
    expect(screen.queryByText('हिं')).toBeNull();
    expect(screen.getByText('EN')).toBeTruthy();
  });

  it('counts only live templates, and states Hindi availability honestly', async () => {
    await render(
      <TemplatePicker
        onPick={() => {}}
        recentlyUsed={[]}
        templates={[
          t({ documentType: 'a', hindiApproved: true }),
          t({ documentType: 'b', label: 'Second', hindiApproved: false }),
          t({ documentType: 'c', label: 'Draft one', status: 'draft', hindiApproved: true }),
        ]}
      />
    );

    expect(screen.getByText('2 templates · 1 available in Hindi')).toBeTruthy();
  });
});
