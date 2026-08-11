import { render, screen } from '@testing-library/react-native';

import { AuthoritiesPanel } from '../screens/judgment/AuthoritiesPanel';
import { BriefingAuthorityRow } from '../screens/briefing/BriefingAuthorityRow';
import { CounterArguments } from '../screens/draft/CounterArguments';
import { DocumentReview, type ReviewFinding } from '../screens/draft/DocumentReview';
import { TreatmentCard } from '../screens/precedent/TreatmentCard';
import { NO_CITATION, NO_CITATION_MARK } from './citationDisplay';
import type {
  BriefingAuthority,
  CounterArgument,
  CounterAuthority,
  PointInTimeAuthority,
  Treatment,
} from '../api/contract';

/**
 * EVERY SURFACE THAT DRAWS A CITATION, AGAINST A ROW THAT HAS NONE.
 *
 * `citationDisplay` being correct proves nothing about the screens. Each of
 * these interpolated `neutralCitation` raw until 11 Aug 2026, and each would
 * have rendered an empty slot — or, where the field sat inside a sentence, the
 * literal `"null"` mid-line — against the 40,980 citationless High Court
 * judgments now in the corpus.
 *
 * One test per surface, deliberately: the failure mode is a screen that stops
 * calling the helper, which no amount of testing the helper can catch.
 */

const CITATIONLESS = { neutralCitation: null } as const;

describe('TreatmentCard', () => {
  const treatment: Treatment = {
    judgmentId: 'jdg_t',
    caseTitle: 'Mock Later Bench v. Mock State',
    ...CITATIONLESS,
    court: 'Patna High Court',
    judgmentDate: '2021-03-02',
    relationship: 'followed',
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    overruledStatus: 'none',
    asOf: '2026-08-11T00:00:00.000Z',
  };

  it('says there is no citation instead of leaving the record line blank', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={treatment} />);

    expect(screen.getByText(new RegExp(NO_CITATION))).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });

  it('renders a real citation unchanged', async () => {
    await render(
      <TreatmentCard onOpen={() => {}} treatment={{ ...treatment, neutralCitation: 'MOCK 2021 EX 4' }} />
    );

    expect(screen.getByText(/MOCK 2021 EX 4/)).toBeTruthy();
  });
});

describe('AuthoritiesPanel', () => {
  const authority: PointInTimeAuthority = {
    judgmentId: 'jdg_a',
    caseTitle: 'Mock Relied On v. State',
    ...CITATIONLESS,
    judgmentDate: '2011-01-01',
    relationship: 'followed',
    standingWhenRelied: 'good_law_then',
    daysAlreadyMoved: null,
    overruledStatus: 'none',
    overruledByJudgmentId: null,
    overruledOn: null,
    overruledByCaseTitle: null,
    statusRecordedAt: '2026-08-11T00:00:00.000Z',
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    asOf: '2026-08-11T00:00:00.000Z',
  };

  it('states the absence rather than rendering an empty citation', async () => {
    await render(
      <AuthoritiesPanel
        data={{
          judgmentId: 'jdg_root',
          caseTitle: 'Mock Root v. State',
          deliveredOn: '2015-01-01',
          asOf: '2026-08-11T00:00:00.000Z',
          counts: { goodLawThen: 1, alreadyMoved: 0, overruledHere: 0, movedSince: 0, unknown: 0 },
          authorities: [authority],
          resolvedAuthorities: 1,
        }}
        error={null}
        onOpenJudgment={() => {}}
      />
    );

    expect(await screen.findByText(NO_CITATION)).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });
});

describe('CounterArguments', () => {
  const authority: CounterAuthority = {
    judgmentId: 'jdg_c',
    caseTitle: 'Mock Contrary v. State',
    ...CITATIONLESS,
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    overruledStatus: 'none',
    asOf: '2026-08-11T00:00:00.000Z',
  };

  const argument: CounterArgument = {
    argument: 'The other side will say the notice was bad.',
    rebuttal: 'It was served twice.',
    authorities: [authority],
  };

  it('never prints "null" inside the case-name-and-citation line', async () => {
    await render(<CounterArguments data={{ arguments: [argument], excluded: [] }} />);

    expect(screen.queryByText(/,\s*null/)).toBeNull();
    expect(screen.getByText(new RegExp(NO_CITATION))).toBeTruthy();
  });

  it('says what an excluded authority is, even with no citation to strike through', async () => {
    await render(
      <CounterArguments
        data={{
          arguments: [],
          excluded: [
            /* `null`, not absent — the server sends an explicit null for a
               judgment carrying no citation, and the fixture says what the
               wire says. */
            {
              judgmentId: 'jdg_x',
              caseTitle: 'Mock Set Aside v. State',
              neutralCitation: null,
              reason: 'set_aside',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('EXCLUDED')).toBeTruthy();
    expect(screen.getByText(NO_CITATION)).toBeTruthy();
  });
});

describe('DocumentReview', () => {
  const finding: ReviewFinding = {
    clauseIndex: '9.2',
    category: 'risk',
    finding: 'Termination clause allows re-entry without notice',
    authorities: [
      {
        judgmentId: 'jdg_d',
        caseTitle: 'Mock Landlord v. Tenant',
        ...CITATIONLESS,
        verificationState: 'verified',
        verifiedBySource: 'corpus',
        overruledStatus: 'none',
        asOf: '2026-08-11T00:00:00.000Z',
      },
    ],
  };

  it('never prints "Relies on: X, null"', async () => {
    await render(
      <DocumentReview
        clausesRead={4}
        findings={[finding]}
        measuredAt="2026-08-11T00:00:00.000Z"
        pseudonymisationCoverage={0.9}
      />
    );

    expect(screen.queryByText(/Relies on:.*null/)).toBeNull();
    expect(screen.getByText(`Relies on: Mock Landlord v. Tenant, ${NO_CITATION}`)).toBeTruthy();
  });
});

/**
 * THE WEDGE SURFACE, ADDED 11 AUG 2026 WITH THE ROW ITSELF.
 *
 * A briefing authority is read standing outside a courtroom, and 40,980 High
 * Court judgments carry no citation at all. An empty record line there reads as
 * the product failing to show something it holds, which is the one impression
 * this screen cannot afford.
 */
describe('BriefingAuthorityRow', () => {
  const authority = (over: Partial<Extract<BriefingAuthority, { available: true }>> = {}) =>
    ({
      judgmentId: 'jdg_b',
      available: true as const,
      caseTitle: 'Mock Bench v. Mock State',
      ...CITATIONLESS,
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      overruledStatus: 'none' as const,
      overruledByJudgmentId: null,
      overruledByTitle: null,
      overruledParas: null,
      overruledNote: null,
      addToMatterAllowed: true,
      ...over,
    }) satisfies BriefingAuthority;

  /**
   * TWO LINES, NOT ONE, AND BOTH ARE MEANT. The record slot says what it holds
   * (`NO_CITATION`); the uncitable mark says what that COSTS — it cannot be
   * referenced in a filing. They answer different questions, which is why the
   * harness treats citability as a fourth concern rather than a fifth
   * verification state.
   */
  it('says there is no citation instead of leaving the record line blank', async () => {
    await render(<BriefingAuthorityRow authority={authority()} onOpen={() => {}} />);

    expect(screen.getByText(NO_CITATION)).toBeTruthy();
    expect(screen.getByText(NO_CITATION_MARK)).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });

  it('renders a real citation unchanged', async () => {
    await render(
      <BriefingAuthorityRow
        authority={authority({ neutralCitation: 'MOCK 2019 EX 12' })}
        onOpen={() => {}}
      />
    );

    expect(screen.getByText(/MOCK 2019 EX 12/)).toBeTruthy();
  });

  /**
   * The unavailable arm has no citation FIELD at all, not merely a null one.
   * It must still render — `briefings/route.ts` refuses to drop it, and a
   * client that filtered it out would reintroduce the silent drop one layer up.
   */
  it('draws the unavailable arm rather than skipping it', async () => {
    await render(
      <BriefingAuthorityRow
        authority={{ judgmentId: 'jdg_gone', available: false, note: 'Mock note.' }}
        onOpen={() => {}}
      />
    );

    expect(screen.getByText('This authority could not be read just now')).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });
});
