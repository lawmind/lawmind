import { apiRequest } from './api';

/**
 * `56 · Enrolment queue`, `57 · Advocates` — both read `GET /admin/users`,
 * shapes verified against `services/api/src/admin/users.ts`, 8 Aug 2026
 * (BUILT, deployed).
 *
 * PD-2 — enrolment is a credential, not a gate. `patchEnrolment`'s own
 * comment: "there is no code path... that reads `enrolment_status` to permit
 * or deny a request." Rejecting an advocate here never removes their access.
 *
 * `renders/16-admin-enrolment-queue.png` (PD-11 layout reference) draws
 * "corroborating signals" — CNR lookups resolved, matters added, a duplicate
 * check, a verifier note — and an "Ask for a document" action. **None of that
 * exists server-side.** `ADMIN_SURFACE.md` §2 names the document-request
 * action and the decision-log read as missing on purpose: a document request
 * has no table yet. The user row itself carries only identity and status
 * fields — no corroborating-signal computation. Not rendered here.
 */

export type EnrolmentStatus = 'unverified' | 'verified' | 'rejected';

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  barEnrolmentNumber: string | null;
  enrolmentStatus: EnrolmentStatus;
  subscriptionTier: string;
  createdAt: string;
};

export function fetchUsers(status?: EnrolmentStatus) {
  return apiRequest<{ users: AdminUser[] }>('/admin/users', { query: { status } });
}

export function patchEnrolment(id: string, status: EnrolmentStatus) {
  return apiRequest<{ user: AdminUser }>(`/admin/users/${id}/enrolment`, {
    method: 'PATCH',
    body: { status },
  });
}
