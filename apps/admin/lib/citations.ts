import type { OverruledStatus, VerificationState } from '@lawmind/contract';

import { apiRequest } from './api';

/**
 * The Citation monitor's data — `GET /admin/citations`, wired 8 Aug 2026
 * against the live route, `services/api/src/admin/citations.ts` (BUILT,
 * deployed). Was a fixture pending this endpoint; it has landed.
 *
 * `docs/ADMIN_SURFACE.md` §5 adds the failing queries with cause and the
 * privileged action — notify affected advocates, `citation.notify_affected`.
 * **That per-query failing-list view has no backing endpoint.** The real
 * `GET /admin/citations` returns aggregates only (totals, breakdowns, three
 * rates) — no per-query detail, no `citationClaimed`, no `exportedCount`, and
 * therefore no "notify affected advocates" action to wire. The mock this file
 * used to export (`MOCK_FAILING`) modelled a view that does not exist yet;
 * removed rather than left pointing at nothing real.
 *
 * `staleOverruledRate` is also not returned by this endpoint — the query it
 * would need (a badge rendered stale vs `overruled_status_changed_at`) is not
 * implemented server-side yet. Not shown as a metric card rather than shown
 * as a fabricated zero.
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

export type CitationMonitor = {
  total: number;
  byVerificationState: Partial<Record<VerificationState, number>>;
  byOverruledStatus: Partial<Record<OverruledStatus, number>>;
  /** `null` when the range is empty — a fact, not a divide-by-zero papered over with 0%. */
  failureRate: number | null;
  silentDropRate: number | null;
  falseVerifiedRate: number | null;
};

export const THRESHOLDS = {
  failureRate: 0.025,
  silentDropRate: 0,
  falseVerifiedRate: 0,
} as const;

export function fetchCitationsMonitor(params: { from?: string; to?: string } = {}) {
  return apiRequest<CitationMonitor>('/admin/citations', { query: params });
}

export const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

/** A threshold of zero is breached by anything above zero, not by "a bit more". */
export const breaches = (value: number, threshold: number): boolean => value > threshold;
