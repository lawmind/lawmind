import { render, screen } from '@testing-library/react-native';

import { CoverageScreen } from './CoverageScreen';
import { api } from '../../api/client';
import type { CorpusCoverage, CorpusFreshness, CorpusFreshnessObject } from '../../api/contract';

/**
 * THE RULE UNDER TEST — R3, `docs/RCC_CONTINUATION_PROMPT.md` §3: coverage is
 * OUR uncertainty and must never be dressed as a judgment count or as the law
 * having moved. Three checks pinned here because they are the three the
 * contract calls out as not cosmetic.
 */

jest.mock('../../api/client', () => ({
  api: { corpusCoverage: jest.fn(), corpusFreshness: jest.fn(), corpusFreshnessObject: jest.fn() },
}));

const corpusCoverage = api.corpusCoverage as jest.MockedFunction<typeof api.corpusCoverage>;
const corpusFreshness = api.corpusFreshness as jest.MockedFunction<typeof api.corpusFreshness>;
const corpusFreshnessObject = api.corpusFreshnessObject as jest.MockedFunction<
  typeof api.corpusFreshnessObject
>;

/**
 * The registry's own observed values — naive 1 day against legal-currency 29.
 * Both are true and only one is usable, which is the entire reason
 * `V1_CAPABILITY_REGISTRY_R15.json` states "quote both or neither" as a rule.
 */
function freshness(over: Partial<CorpusFreshness> = {}): CorpusFreshness {
  return {
    computedAt: '2026-09-01T00:00:00.000Z',
    naive: {
      newestJudgmentDate: '2026-08-28',
      lagDays: 1,
      reading: 'max(judgment_date).',
    },
    legalCurrency: {
      dataAsOf: '2026-07-31',
      lagDays: 29,
      honestFrontierMonth: '2026-07-01',
      baselineDocumentsPerMonth: 134_810,
    },
    caveats: [],
    ...over,
  };
}

function observation(over: Partial<CorpusFreshnessObject> = {}): CorpusFreshnessObject {
  return {
    publicationGeneration: 'r10',
    publishedAt: '2026-08-31T00:00:00.000Z',
    upstreamMeasuredAt: '2026-08-30T00:00:00.000Z',
    latestUpstreamDecisionDate: '2026-08-29',
    latestLocalDecisionDate: '2026-08-28',
    sourceLagDays: 1,
    upstreamLocalCompleteness: 0.9697,
    sourceUnavailableCount: 46_754,
    ...over,
  };
}

const NEVER_ANSWERED = { ok: false as const, error: { code: 'network', message: 'offline' } };

function coverage(over: Partial<CorpusCoverage> = {}): CorpusCoverage {
  return {
    supremeCourt: { courtName: 'Supreme Court of India', held: 38_341, sourceDocuments: null },
    highCourts: [
      {
        courtName: 'Allahabad High Court',
        courtCode: 'allahabad',
        sourceDocuments: 3_493_695,
        held: 0,
        firstYear: 2016,
        lastYear: 2026,
      },
      {
        courtName: 'Bombay High Court',
        courtCode: 'bombay',
        sourceDocuments: 1_200_000,
        held: 0,
        firstYear: 2016,
        lastYear: 2026,
      },
    ],
    judgmentShareUnknown: true,
    judgmentShareRange: [0.0075, 0.1864],
    enumeratedAt: '2026-08-10T00:00:00.000Z',
    ...over,
  };
}

describe('CoverageScreen', () => {
  beforeEach(() => {
    corpusCoverage.mockReset();
    corpusFreshness.mockReset();
    corpusFreshnessObject.mockReset();
    // The coverage assertions below are about coverage; freshness answers
    // truthfully in the background rather than throwing on an unmocked call.
    corpusFreshness.mockResolvedValue({ ok: true, data: freshness() });
    corpusFreshnessObject.mockResolvedValue({ ok: true, data: observation() });
  });

  it('never labels the High Court figure "judgments" — only "documents"', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/of 34,93,695 documents held/)).toBeTruthy();
    expect(screen.queryByText(/34,93,695 judgments/)).toBeNull();
  });

  it('shows the Supreme Court total as a real judgment count, complete', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/38,341 judgments held\. Complete/)).toBeTruthy();
  });

  it('states the judgment-share range once, up front, rather than per row', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(
      await screen.findByText(/somewhere between 0\.75% and 18\.64% of each number/)
    ).toBeTruthy();
  });

  it('sorts worst-gap-first, exactly as the server sent it — never re-sorted client-side', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    const names = (await screen.findAllByText(/High Court$/)).map((n) => n.props.children);
    expect(names).toEqual(['Allahabad High Court', 'Bombay High Court']);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FRESHNESS ON THE COVERAGE SURFACE — founder design D-5, NEW3 R16
 * `R16-RCC-03`.
 *
 * The states NEW3 names as acceptance: both lags, unknown, stale, source
 * unavailable, error — and the banned claims that must survive all of them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('CoverageScreen · freshness', () => {
  beforeEach(() => {
    corpusCoverage.mockReset();
    corpusFreshness.mockReset();
    corpusFreshnessObject.mockReset();
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    corpusFreshnessObject.mockResolvedValue({ ok: true, data: observation() });
  });

  it('quotes both lags, leading with the honest one', async () => {
    corpusFreshness.mockResolvedValue({ ok: true, data: freshness() });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/29 days behind today/)).toBeTruthy();
    expect(screen.getByText(/July 2026/)).toBeTruthy();
    expect(screen.getByText(/1 day ago/)).toBeTruthy();
  });

  /**
   * THE NAIVE NUMBER MAY NOT STAND ALONE — it is true, it looks better, and it
   * describes the newest ROW rather than the newest usable MONTH. D-5 calls a
   * lone "1 day behind" the single most misleading number in the product.
   */
  it('never states the naive lag without the honest one beside it', async () => {
    corpusFreshness.mockResolvedValue({ ok: true, data: freshness() });
    await render(<CoverageScreen onBack={() => {}} />);

    const naive = await screen.findByText(/1 day ago/);
    expect(String(naive.props.children)).toMatch(/not how current the corpus is/i);
  });

  /**
   * UNKNOWN. No month clears the baseline floor, so no currency can be stated —
   * and the naive number does NOT get promoted into the gap it leaves.
   */
  it('quotes neither lag when legal currency is unmeasurable', async () => {
    corpusFreshness.mockResolvedValue({
      ok: true,
      data: freshness({
        legalCurrency: {
          dataAsOf: null,
          lagDays: null,
          honestFrontierMonth: null,
          baselineDocumentsPerMonth: 134_810,
        },
      }),
    });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/No recent month is complete enough/i)).toBeTruthy();
    expect(screen.queryByText(/1 day behind today/)).toBeNull();
    expect(screen.queryByText(/days behind today/)).toBeNull();
  });

  /**
   * STALE IS A NUMBER, NOT A WORD. A large legal-currency lag renders as the
   * measured number — the screen never grades it into "stale"/"fresh", because
   * the thresholds behind such a grade are ours and are not validated against
   * any court's publication calendar.
   */
  it('renders a large lag as the measured number rather than a verdict', async () => {
    corpusFreshness.mockResolvedValue({
      ok: true,
      data: freshness({
        legalCurrency: {
          dataAsOf: '2026-06-30',
          lagDays: 63,
          honestFrontierMonth: '2026-06-01',
          baselineDocumentsPerMonth: 134_810,
        },
      }),
    });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/63 days behind today/)).toBeTruthy();
    expect(screen.queryByText(/\bstale\b|\bfresh\b|\bout of date\b/i)).toBeNull();
  });

  /** A failed freshness call says so. It never falls back to the coverage numbers. */
  it('says it could not check rather than implying currency', async () => {
    corpusFreshness.mockResolvedValue(NEVER_ANSWERED);
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/could not check how current this is/i)).toBeTruthy();
    expect(screen.queryByText(/up to date/i)).toBeNull();
  });

  /**
   * THE UPSTREAM COMPARISON IS SEPARATELY FALLIBLE. It failing must not take
   * the two lags with it — they come from a different route and are still true.
   */
  it('keeps both lags when only the source comparison is unavailable', async () => {
    corpusFreshness.mockResolvedValue({ ok: true, data: freshness() });
    corpusFreshnessObject.mockResolvedValue(NEVER_ANSWERED);
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/29 days behind today/)).toBeTruthy();
    expect(screen.getByText(/comparison against the source is unavailable/i)).toBeTruthy();
  });

  /**
   * The source's own refusals are counted separately and named as not ours to
   * close — folding them into completeness would make an unrecoverable gap look
   * like an ingest backlog.
   */
  it('states source-unavailable documents as a gap that is not ours', async () => {
    corpusFreshness.mockResolvedValue({ ok: true, data: freshness() });
    await render(<CoverageScreen onBack={() => {}} />);

    const line = await screen.findByText(/would not\s+serve/i);
    expect(JSON.stringify(line.props.children)).toMatch(/not ours to close/i);
  });

  /**
   * NO SLA, ANYWHERE, IN ANY STATE. D-5: a freshness observation is not a
   * promise about tomorrow and must not be shaped like one.
   */
  it('promises nothing about tomorrow in any state', async () => {
    for (const data of [
      freshness(),
      freshness({
        legalCurrency: {
          dataAsOf: null,
          lagDays: null,
          honestFrontierMonth: null,
          baselineDocumentsPerMonth: 0,
        },
      }),
    ]) {
      corpusFreshness.mockResolvedValue({ ok: true, data });
      const view = await render(<CoverageScreen onBack={() => {}} />);
      await screen.findByText(/How current this is/);
      const text = JSON.stringify(view.toJSON());
      expect(text).not.toMatch(/every day|daily|within d+ (hour|day)|we update|will be added/i);
      view.unmount();
    }
  });
});
