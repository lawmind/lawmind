import type { OverruledStatus, VerificationState } from '@lawmind/contract';

/**
 * The Citation monitor's data, mocked from `GET /admin/citations`.
 *
 * `docs/API_CONTRACTS.md` §Admin:
 *   GET /admin/citations ?from&to
 *     → { total, byVerificationState, byOverruledStatus,
 *         failureRate, silentDropRate, falseVerifiedRate }
 *
 * `docs/ADMIN_SURFACE.md` §5 adds the failing queries with cause and the
 * privileged action — notify affected advocates, `citation.notify_affected`.
 *
 * THE THRESHOLDS ARE NOT PREFERENCES.
 *   silent drop    0.0%   a citation the advocate never saw is worse than one
 *                         marked unconfirmed: they cannot correct what they
 *                         were not shown
 *   false verified 0.0%   a citation we called safe that was not
 *   failure rate   2.5%   an alert threshold, not a zero — some references
 *                         genuinely cannot be confirmed, and saying so is the
 *                         product working rather than failing
 */

export type CitationMetrics = {
  total: number;
  byVerificationState: Record<VerificationState, number>;
  byOverruledStatus: Record<OverruledStatus, number>;
  /** Share of citations no tier could confirm. Alerts above 2.5%. */
  failureRate: number;
  /** Referenced, then never shown. THRESHOLD ZERO. */
  silentDropRate: number;
  /** Shown as safe to file, and was not. THRESHOLD ZERO. */
  falseVerifiedRate: number;
  /**
   * Rendered without the LAW MOVED mark while the live status had already
   * moved. THRESHOLD ZERO. `docs/CITATION_HARNESS.md` §Metric.
   */
  staleOverruledRate: number;
};

export type FailingQuery = {
  searchId: string;
  query: string;
  citationClaimed: string;
  cause: string;
  at: string;
  /** How many advocates already exported a draft citing it. Drives the notify action. */
  exportedCount: number;
};

export const THRESHOLDS = {
  failureRate: 0.025,
  silentDropRate: 0,
  falseVerifiedRate: 0,
  staleOverruledRate: 0,
} as const;

/** Fixture. Real numbers come from `citation_checks` once LCC's endpoint lands. */
export const MOCK_METRICS: CitationMetrics = {
  total: 1284,
  byVerificationState: { verified: 1231, unverified: 41, failed: 12 },
  byOverruledStatus: { none: 1247, set_aside: 9, partly_set_aside: 21, doubted: 7 },
  failureRate: 0.0413,
  silentDropRate: 0,
  falseVerifiedRate: 0,
  staleOverruledRate: 0,
};

export const MOCK_FAILING: FailingQuery[] = [
  {
    searchId: 'srch_mock_1',
    query: 'bail where the accused cooperated throughout',
    citationClaimed: 'MOCK 2024 EXAMPLE 9',
    cause: 'No tier confirmed this reference. Two secondary sources describe it; the portal has no record.',
    at: '2026-08-04T09:12:00.000Z',
    exportedCount: 2,
  },
  {
    searchId: 'srch_mock_2',
    query: 'quashing where the complaint named eleven relatives',
    citationClaimed: 'MOCK 2024 EXAMPLE 9424',
    cause: 'Citation number does not resolve. May be a reporting error in the source.',
    at: '2026-08-04T08:40:00.000Z',
    exportedCount: 0,
  },
  {
    searchId: 'srch_mock_3',
    query: 'interim protection pending disposal',
    citationClaimed: 'MOCK 2023 EXAMPLE 404',
    cause: 'The check could not be completed — a tier was unreachable.',
    at: '2026-08-04T07:55:00.000Z',
    exportedCount: 1,
  },
];

export const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

/** A threshold of zero is breached by anything above zero, not by "a bit more". */
export const breaches = (value: number, threshold: number): boolean => value > threshold;
