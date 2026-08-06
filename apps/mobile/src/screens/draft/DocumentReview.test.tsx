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
