import { render, screen } from '@testing-library/react-native';

import { CounterArguments } from '../screens/draft/CounterArguments';
import { TreatmentCard } from '../screens/precedent/TreatmentCard';
import type {
  CounterArgumentsResponse,
  CounterAuthority,
  Treatment,
  TreatmentAttribution,
} from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHO SAID THE LAW MOVED, ON EVERY SURFACE THAT DRAWS IT — NEW3 R16
 * `R16-RCC-01`.
 *
 * `treatmentAttribution.test.ts` proves the helper. This proves the SCREENS,
 * and the two are not the same property: the failure mode this file exists for
 * is a card that stops calling the helper, which no amount of testing the
 * helper can catch. Same reasoning as `citationSurfaces.test.tsx`, which found
 * exactly that class of defect on five surfaces at once.
 *
 * THE FOUR ROUTE FAMILIES THAT EMIT THE FIELD are judgment detail, treatments,
 * counter-authorities and document citations. Two of them are unit-testable
 * against a bare component (below); the judgment detail and draft surfaces
 * fetch through `api/client` and are covered by the shared helper plus their
 * own screens' existing suites.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_TREATMENT: Treatment = {
  judgmentId: 'jdg_later',
  caseTitle: 'Mock Later Bench v. Mock State',
  neutralCitation: 'MOCK 2021 EX 4',
  court: 'Supreme Court of India',
  judgmentDate: '2021-03-02',
  relationship: 'overruled',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-09-01T00:00:00.000Z',
};

const treatmentWith = (attribution?: TreatmentAttribution): Treatment => ({
  ...BASE_TREATMENT,
  ...(attribution === undefined ? {} : { treatmentAttribution: attribution }),
});

describe('TreatmentCard · attribution', () => {
  it('words COURT as the later court speaking', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={treatmentWith('COURT')} />);
    expect(screen.getByText(/later court said so in its own reasoning/i)).toBeTruthy();
  });

  /**
   * 95.62% OF THESE ROWS. Before this layer a reporter's editorial headnote and
   * the later court's own reasoning rendered identically on this card.
   */
  it('attributes REPORTER to the reporter and never to the court', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={treatmentWith('REPORTER')} />);
    expect(screen.getByText(/law reporter.s editorial note/i)).toBeTruthy();
    expect(screen.queryByText(/later court said so/i)).toBeNull();
  });

  it('states a DEFECTIVE record as damaged, claiming nothing from it', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={treatmentWith('DEFECTIVE')} />);
    expect(screen.getByText(/record behind this is damaged/i)).toBeTruthy();
  });

  it('states UNKNOWN as unknown rather than as either of the other two', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={treatmentWith('UNKNOWN')} />);
    expect(screen.getByText(/have not recorded whether this came from/i)).toBeTruthy();
    expect(screen.queryByText(/law reporter.s editorial note/i)).toBeNull();
  });

  /** A route that never sent the field gets no line — absence is not UNKNOWN. */
  it('renders no attribution line at all when the field is missing', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={treatmentWith()} />);
    expect(screen.queryByText(/have not recorded whether this came from/i)).toBeNull();
    expect(screen.queryByText(/later court said so/i)).toBeNull();
  });

  /**
   * THE GATE. `attributionOf()` returns `UNKNOWN` for an empty adverse-edge
   * list, so a `followed` row arrives carrying it. Printing the unknown line
   * there would raise a doubt about an authority nobody has doubted.
   */
  it('says nothing on a relationship that moved no law, even carrying UNKNOWN', async () => {
    await render(
      <TreatmentCard
        onOpen={() => {}}
        treatment={{ ...treatmentWith('UNKNOWN'), relationship: 'followed' }}
      />,
    );
    expect(screen.queryByText(/have not recorded whether this came from/i)).toBeNull();
  });
});

const counterAuthority = (attribution?: TreatmentAttribution): CounterAuthority => ({
  judgmentId: 'jdg_counter',
  caseTitle: 'Mock Adverse Bench v. Mock State',
  neutralCitation: 'MOCK 2019 EX 9',
  court: 'Supreme Court of India',
  judgmentDate: '2019-01-01',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'doubted',
  asOf: '2026-09-01T00:00:00.000Z',
  ...(attribution === undefined ? {} : { treatmentAttribution: attribution }),
});

const counterResponse = (authority: CounterAuthority): CounterArgumentsResponse => ({
  position: 'Mock position',
  asOf: '2026-09-01T00:00:00.000Z',
  authorities: [authority],
  excluded: [],
  unverifiedReferences: [],
});

describe('CounterArguments · attribution', () => {
  /**
   * LOAD-BEARING HERE IN PARTICULAR. This is the screen an advocate reads while
   * preparing to argue AGAINST these authorities, and walking into court with
   * "a reporter records that this was doubted" is a different act from walking
   * in with "the Supreme Court said so".
   */
  it('names the reporter on an adverse authority', async () => {
    await render(<CounterArguments data={counterResponse(counterAuthority('REPORTER'))} />);
    expect(screen.getByText(/law reporter.s editorial note/i)).toBeTruthy();
  });

  it('renders nothing when the field is absent', async () => {
    await render(<CounterArguments data={counterResponse(counterAuthority())} />);
    expect(screen.queryByText(/law reporter.s editorial note/i)).toBeNull();
    expect(screen.queryByText(/have not recorded whether/i)).toBeNull();
  });
});
