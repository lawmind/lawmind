import { render, screen } from '@testing-library/react-native';

import { BareActsScreen } from './BareActsScreen';
import { api } from '../../api/client';
import type { Statute, StatuteCoverage } from '../../api/contract';

/**
 * WHAT THE STATUTE LIBRARY DOES NOT HOLD, SAID OUT LOUD.
 *
 * `GET /statutes` has always sent `coverage`; the client never declared it, so
 * the acts index presented a list with no statement of what was missing from
 * it. `CoverageScreen` breaks exactly this silence for judgments and gives the
 * reason — an advocate who searches and finds nothing needs to know whether
 * there was nothing to find, or whether we simply do not hold it.
 *
 * THE THREE TRAPS BELOW ARE THE ROUTE'S OWN, quoted in its comments, and each
 * one gets a test because each one is a way of stating a number that would be
 * a claim we cannot support.
 */

jest.mock('../../api/client', () => ({ api: { statutes: jest.fn() } }));

const statutes = api.statutes as jest.MockedFunction<typeof api.statutes>;

const act: Statute = {
  statuteId: 'act_1',
  shortTitle: 'The Mock Sanhita, 2023',
  hindiTitle: null,
  actNumber: '45',
  actYear: 2023,
  enactmentDate: '2023-12-25',
  enforcementDate: '2024-07-01',
  ministry: null,
  sourceUrl: 'https://example.invalid/mock',
  sectionCount: 358,
};

const coverage = (over: Partial<StatuteCoverage> = {}): StatuteCoverage => ({
  held: 825,
  sourceTotal: 845,
  complete: false,
  failedCount: 20,
  failedIds: [],
  sectionlessCount: 4,
  enumeratedAt: '2026-08-08T00:00:00.000Z',
  ingestInProgress: true,
  ...over,
});

const draw = async (over: Partial<StatuteCoverage> = {}) => {
  statutes.mockResolvedValue({
    ok: true,
    data: { statutes: [act], coverage: coverage(over), asOf: '2026-08-11T00:00:00.000Z' },
  });
  await render(<BareActsScreen onOpenAct={() => {}} />);
};

beforeEach(() => statutes.mockReset());

describe('the coverage line', () => {
  it('states what we hold against what the source has', async () => {
    await draw();

    expect(await screen.findByText(/We hold 825 of 845 Acts\./)).toBeTruthy();
  });

  /** Two different gaps: not fetched, and fetched but unparsed. */
  it('keeps the two gaps as two numbers, because one would hide the other', async () => {
    await draw();

    expect(await screen.findByText(/20 could not be read from the source\./)).toBeTruthy();
    expect(
      screen.getByText(/4 more are listed but have no sections yet, so searching will not find them\./)
    ).toBeTruthy();
  });

  /**
   * `sourceTotal: null` means we have never enumerated the source. It is not
   * zero, and printing it as a denominator would invent a total.
   */
  it('never prints a denominator we do not have', async () => {
    await draw({ sourceTotal: null });

    expect(
      await screen.findByText(/We have not counted how many exist at the source/)
    ).toBeTruthy();
    expect(screen.queryByText(/of null/)).toBeNull();
  });

  it('says nothing at all once a pass has finished complete', async () => {
    await draw({ complete: true, held: 845, sourceTotal: 845, failedCount: 0, sectionlessCount: 0 });

    await screen.findByText('The Mock Sanhita, 2023');
    expect(screen.queryByText(/We hold 845 of 845 Acts/)).toBeNull();
  });

  /**
   * `complete` DECIDES, never the arithmetic. The route is explicit: an ingest
   * can reach the count with Acts that failed and were retried into place, and
   * can equal it transiently mid-run. Equal numbers with `complete: false` must
   * still report the gap rather than fall silent.
   */
  it('trusts `complete` over the arithmetic when the two disagree', async () => {
    await draw({ held: 845, sourceTotal: 845, complete: false, failedCount: 0, sectionlessCount: 0 });

    expect(await screen.findByText(/We hold 845 of 845 Acts\./)).toBeTruthy();
  });
});

describe('the currency caveat, which is a different fact', () => {
  it('is stated whether or not the library is complete', async () => {
    await draw({ complete: true });

    expect(
      await screen.findByText(/We do not yet track whether an individual section has since been/)
    ).toBeTruthy();
  });
});
