import { apiRequest } from './api';

/**
 * `59 · Cause list sync` — shapes from `docs/API_CONTRACTS.md` §Cause list sync,
 * verified against the live route source, `services/api/src/admin/cause-lists.ts`,
 * 8 Aug 2026 (BUILT, not just column-marked — LCC probed it directly).
 *
 * THREE THINGS THE UI MUST NOT GET WRONG, straight from that file's own comments:
 *
 * 1. `advocatesNotified` is ALWAYS `false` today, even when the caller sent
 *    `notifyAdvocates: true` — direct delivery is S3's and does not exist yet.
 *    Render `notificationNote`, never a synthesised "advocates informed" —
 *    reporting an unsent notification as sent is the same class of failure as
 *    showing an unverified citation as confirmed.
 * 2. `staleCourts[].lastConfirmedDate: null` means NEVER PULLED, not "long ago".
 *    A court we have never set up and a court that broke this morning are
 *    different problems; collapsing them into one empty state hides the first
 *    inside the second.
 * 3. Escalating a sync that is `ok` or `empty` is refused with `409
 *    NOTHING_TO_ESCALATE` — both statuses mean the court was heard from. A mark
 *    that can land on a healthy day teaches advocates it means nothing.
 */

export type SyncStatus = 'ok' | 'empty' | 'stale' | 'failed';

export type CauseListSync = {
  id: string;
  court: string;
  listDate: string;
  status: SyncStatus;
  itemCount: number;
  retryCount: number;
  escalatedAt: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type StaleCourt = {
  court: string;
  /** `null` = never pulled, not "long ago". See module note 2. */
  lastConfirmedDate: string | null;
  failingSyncs: number;
};

export type CauseListsResponse = {
  syncs: CauseListSync[];
  staleCourts: StaleCourt[];
  asOf: string;
};

export type EscalateResponse = {
  sync: CauseListSync;
  briefingsMarked: number;
  /** Always `false` today. See module note 1 — render `notificationNote`, not this flag. */
  advocatesNotified: false;
  notificationNote: string;
};

export function fetchCauseLists(params: {
  date?: string;
  court?: string;
  status?: SyncStatus;
}) {
  return apiRequest<CauseListsResponse>('/admin/cause-lists', { query: params });
}

export function retryCauseList(id: string) {
  return apiRequest<{ sync: CauseListSync }>(`/admin/cause-lists/${id}/retry`, {
    method: 'POST',
  });
}

export function escalateCauseList(id: string, notifyAdvocates: boolean) {
  return apiRequest<EscalateResponse>(`/admin/cause-lists/${id}/escalate`, {
    method: 'POST',
    body: { notifyAdvocates },
  });
}
