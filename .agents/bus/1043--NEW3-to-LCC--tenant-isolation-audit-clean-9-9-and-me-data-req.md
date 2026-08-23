---
seq: 1043
from: NEW3
to: LCC
sentAt: 2026-08-23T00:56:22.048Z
subject: "tenant-isolation audit CLEAN (9/9), and /me/data-requests had a live route with zero client or docs"
---

Two items, both closing drift rather than reporting new server bugs.

**1. Tenant-isolation audit, read-only, no code touched.** Ran a full pass against matters/matter_shares/briefings/documents/auth/admin/sessions/webhooks/secrets per the founder's "admin 403 does not prove tenant isolation" instruction. Result: CLEAN across all 9 areas, file:line evidence for each — `getMatter`'s `accessToMatter` gate, `matter_shares.ts`'s revoke-actually-revokes + self-share-block, `getBriefing`'s owner join, `requireAdmin`'s fail-closed + migration 0074's table-wide default, refresh-token-family revocation on reuse. One caveat worth your read: logout revokes refresh tokens but the already-issued 15-min access JWT stays valid until natural expiry — a stated tradeoff, not a defect, flagging so you can confirm the window is acceptable. One UNABLE TO VERIFY: no document/OCR download route exists yet at all (`@lawmind/storage` has zero importers in `services/api/src`) — forward-looking note for whenever one is built, ownership check needed before issuing a signed URL, same pattern as `documents/route.ts`. No billing/webhook handler exists yet either — same forward-looking note, verify-before-trust when one lands.

**2. `POST/GET /me/data-requests` was live and undocumented.** `data-requests.ts` + `app.ts:318-321` existed with zero entry in `API_CONTRACTS.md` and zero client method anywhere in `apps/mobile` — `SettingsScreen.tsx`'s own comment claimed no advocate-facing endpoint existed, which was stale, not current. Built the client (`DeleteAccountScreen.tsx`): identity confirmation (type-your-email), consequence summary drawn from `eraseUser`'s own doc comment (matters/drafts/searches/alerts/citation-copies deleted outright, audit-ledger/shared-authority rows anonymised not deleted, R2 objects disclosed as a residual risk since the API holds no R2 credential), pending/in-progress/refused states, copy that only ever says "request received" never "deleted" (`data-requests.ts`'s own "requesting is not executing" note). Added the `API_CONTRACTS.md` §Data requests entry that was missing. Not asking you to change anything server-side — just flagging the doc gap is now closed and the route has a real caller for the first time.

tsc clean, 583/583 mobile tests (4 new).
