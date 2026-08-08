import { apiRequest } from './api';

/**
 * `61 · Disputed citations` — "outranks everything else in the admin"
 * (`sprints/SPRINT_6.md`). Shapes verified against the live route source,
 * `services/api/src/admin/disputes.ts`, 8 Aug 2026 (BUILT, deployed).
 *
 * Uphold is a fan-out write, not a status change — it calls the same
 * `applyOverruledChange` the nightly re-check calls. `reverificationJobId` is
 * a real id, not a queue token: the fan-out runs inside the request, so there
 * is nothing to poll.
 *
 * THE LIST ENDPOINT HAS NO SEVERITY FIELD, NO REPORT-COUNT AGGREGATION, NO
 * SLA/MEDIAN-TIME METRIC, AND NO ADVOCATE NAME — only `reported_by_user_id`.
 * `design/screens/renders/40-admin-disputes.png` shows all four; none of them
 * exist server-side. Render what the endpoint actually returns.
 */

export type DisputeStatus = 'open' | 'upheld' | 'rejected';
export type OverruledStatus = 'none' | 'set_aside' | 'partly_set_aside' | 'doubted';

export type Dispute = {
  id: string;
  reportedBy: string;
  citationCheckId: string | null;
  judgmentId: string | null;
  claim: string;
  status: DisputeStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  correction: Record<string, unknown> | null;
  fanoutId: string | null;
  createdAt: string;
};

export type DisputesResponse = {
  disputes: Dispute[];
  /** Upheld-where-verified ÷ total verified shown. `null` when nothing verified has been shown yet. Target zero. */
  falseVerifiedRate: number | null;
};

/** Raw `citation_checks` row, `SELECT *` — snake_case, only the fields this page reads. */
export type CitationCheckRow = {
  id: string;
  citation_claimed: string;
  judgment_id_matched: string | null;
  verification_state: 'verified' | 'unverified' | 'failed';
  verified_by_source: 'corpus' | 'indiankanoon' | 'aws_s3' | 'public_x2' | 'ecourts' | 'none';
  shown_to_user: boolean;
  /** The overruled status the server actually sent for THIS render — what the advocate saw, not necessarily what's current now. */
  overruled_status_shown: string | null;
  surface: 'search' | 'judgment_detail' | 'briefing' | 'draft' | 'matter' | null;
  created_at: string;
} | null;

/** Raw `judgments` row, `SELECT *` — snake_case. `full_text` deliberately not typed here: never render it, it's the raw OCR document. */
export type JudgmentRow = {
  id: string;
  case_title: string;
  neutral_citation: string | null;
  case_number: string | null;
  court: string;
  judgment_date: string;
  overruled_status: OverruledStatus;
  overruled_status_changed_at: string | null;
  overruled_paras: number[] | null;
  overruled_note: string | null;
} | null;

export type DisputeDetail = {
  dispute: Dispute;
  citationCheck: CitationCheckRow;
  judgment: JudgmentRow;
  impact: { savedCount: number; filedCount: number; copiedCount: number };
};

export type UpholdResponse = {
  corrected: true;
  reverificationJobId: string;
  affectedSaved: number;
  affectedFiled: number;
  notified: number;
};

export function fetchDisputes(status?: DisputeStatus) {
  return apiRequest<DisputesResponse>('/admin/disputes', { query: { status } });
}

export function fetchDispute(id: string) {
  return apiRequest<DisputeDetail>(`/admin/disputes/${id}`);
}

export function uphold(
  id: string,
  body: {
    correction: {
      toStatus: OverruledStatus;
      overruledParas?: number[];
      overruledByJudgmentId?: string;
      overruledNote?: string;
    };
    reason: string;
  },
) {
  return apiRequest<UpholdResponse>(`/admin/disputes/${id}/uphold`, { method: 'POST', body });
}

export function reject(id: string, reason: string) {
  return apiRequest<{ dispute: Dispute }>(`/admin/disputes/${id}/reject`, {
    method: 'POST',
    body: { reason },
  });
}
