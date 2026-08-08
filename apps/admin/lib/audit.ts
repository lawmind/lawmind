import { apiRequest } from './api';

/**
 * `71 · Staff & audit` — `GET /admin/audit` only. Shapes verified against
 * `services/api/src/admin/audit.ts`, 8 Aug 2026 (BUILT, deployed).
 *
 * THE CANVAS (`design/screens/LawMind Admin.dc.html`) ALSO DRAWS A "STAFF AND
 * ROLES" TABLE — invite staff, edit a role, "12 named people. None of that
 * exists server-side: `ADMIN_SURFACE.md` §15 states plainly "there is no
 * `role` column on `users`... by design," and there is no staff-listing or
 * invite endpoint. That half of the canvas is not built here — rendering it
 * would mean inventing a feature. Only the audit ledger, which is real.
 */

export type AuditEntry = {
  id: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
};

export type AuditResponse = { entries: AuditEntry[]; nextCursor: string | null };

export function fetchAudit(params: {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}) {
  return apiRequest<AuditResponse>('/admin/audit', { query: params });
}
