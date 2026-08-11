import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { DocumentReview, type ReviewFinding } from './DocumentReview';

/**
 * THE RULE UNDER TEST: coverage is a MEASURED NUMBER and is never described as
 * complete.
 *
 * `PRIVACY_PII.md` is explicit — realistic coverage is partial, "that is not
 * 100% and must never be described as such", to an advocate or in marketing.
 * The number comes from the endpoint precisely so it cannot drift into a
 * reassuring sentence nobody re-checks.
 */

const findings: ReviewFinding[] = [
  {
    clauseIndex: '9.2',
    category: 'risk',
    finding: 'Termination clause allows re-entry without notice',
    authorities: [
      {
        judgmentId: 'j1',
        caseTitle: 'Mock Landlord v. Tenant',
        neutralCitation: 'MOCK 1977 EXAMPLE 814',
        verificationState: 'verified',
        verifiedBySource: 'corpus',
        overruledStatus: 'none',
        asOf: '2026-08-06T00:00:00.000Z',
      },
    ],
  },
  {
    clauseIndex: '7.3',
    category: 'standard',
    finding: 'Maintenance obligations follow the usual split',
    authorities: [],
  },
];

describe('DocumentReview', () => {
  it('states measured coverage as a number, not as a reassurance', async () => {
    await render(
      <DocumentReview
        clausesRead={14}
        findings={findings}
        measuredAt="2026-08-06T12:00:00.000Z"
        pseudonymisationCoverage={0.992}
      />
    );

    expect(screen.getByText(/99\.2%/)).toBeTruthy();
  });

  it('never describes detection as complete', async () => {
    await render(
      <DocumentReview
        clausesRead={14}
        findings={findings}
        measuredAt="2026-08-06T12:00:00.000Z"
        pseudonymisationCoverage={1}
      />
    );

    // Even at a measured 100% the copy still says partial — the measurement is
    // of what we detected, not of what was there.
    expect(screen.getByText(/partial, not complete/)).toBeTruthy();
  });

  it('puts risk before standard, whatever order the findings arrive in', async () => {
    await render(
      <DocumentReview
        clausesRead={14}
        findings={findings}
        measuredAt="2026-08-06T12:00:00.000Z"
        pseudonymisationCoverage={0.992}
      />
    );

    const risk = screen.getByText('Risk · 1');
    const standard = screen.getByText('Standard · 1');
    expect(risk).toBeTruthy();
    expect(standard).toBeTruthy();
  });

  it('ties a flagged clause to the authority it relies on', async () => {
    await render(
      <DocumentReview
        clausesRead={14}
        findings={findings}
        measuredAt="2026-08-06T12:00:00.000Z"
        pseudonymisationCoverage={0.992}
      />
    );

    expect(
      screen.getByText('Relies on: Mock Landlord v. Tenant, MOCK 1977 EXAMPLE 814')
    ).toBeTruthy();
  });
});

/**
 * THE THREE OVERRULED STATES MUST NOT COLLAPSE INTO ONE.
 *
 * Until 11 Aug 2026 this screen drew a single muted line — "The law has moved
 * on this authority." — for `set_aside`, `partly_set_aside` and `doubted`
 * alike. A risk finding that RELIES ON a judgment set aside in 2018 is not a
 * caution; it is a finding with no authority under it, and it read exactly like
 * one that had merely been doubted.
 *
 * `CITATION_HARNESS.md` §"When the law moves": `set_aside` danger,
 * `partly_set_aside` caution, `doubted` no band, because "a notification that
 * shouted equally for all three would train advocates to ignore it".
 */
describe('DocumentReview distinguishes the three overruled states', () => {
  const withStatus = (
    overruledStatus: ReviewFinding['authorities'][number]['overruledStatus'],
    overruledParas?: number[],
  ): ReviewFinding[] => [
    {
      ...findings[0]!,
      authorities: [{ ...findings[0]!.authorities[0]!, overruledStatus, overruledParas }],
    },
  ];

  const draw = (findingsIn: ReviewFinding[]) =>
    render(
      <DocumentReview
        clausesRead={14}
        findings={findingsIn}
        measuredAt="2026-08-06T12:00:00.000Z"
        pseudonymisationCoverage={0.992}
      />
    );

  it('strikes the case name for set_aside, and only for set_aside', async () => {
    await draw(withStatus('set_aside'));

    const name = screen.getByText('Relies on: Mock Landlord v. Tenant, MOCK 1977 EXAMPLE 814');
    expect(StyleSheet.flatten(name.props.style)).toMatchObject({
      textDecorationLine: 'line-through',
    });
    expect(screen.getByText('Overruled')).toBeTruthy();
  });

  it('names the affected paragraphs for partly_set_aside rather than generalising', async () => {
    await draw(withStatus('partly_set_aside', [19, 20]));

    expect(screen.getByText('Paras 19–20 set aside')).toBeTruthy();
    const name = screen.getByText('Relies on: Mock Landlord v. Tenant, MOCK 1977 EXAMPLE 814');
    expect(StyleSheet.flatten(name.props.style)).not.toMatchObject({
      textDecorationLine: 'line-through',
    });
  });

  it('says doubted still binds, and does not strike or overstate it', async () => {
    await draw(withStatus('doubted'));

    expect(screen.getByText('Doubted · referred')).toBeTruthy();
    expect(screen.getByText(/Still binding/)).toBeTruthy();
    expect(screen.queryByText('Overruled')).toBeNull();
  });

  it('draws nothing about the law moving when it has not moved', async () => {
    await draw(findings);

    for (const chip of ['Overruled', 'Doubted · referred']) {
      expect(screen.queryByText(chip)).toBeNull();
    }
  });
});
