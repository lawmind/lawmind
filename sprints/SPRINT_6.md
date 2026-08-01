# SPRINT 6 — ADMIN AND HARDENING

**Read first:** `docs/ADMIN_SURFACE.md` — all 17 sections, what each reads, what
privileged action it performs, and which still have no endpoint.

---

## LCC

**OWN:** `services/api/admin/**`, `services/cron/**`, monitoring

**TASK**

1. **The audit ledger first, before any privileged control.**
   `audit_log` is **append-only** — revoked grants plus a `BEFORE UPDATE OR
   DELETE` trigger, not a comment. `GET /admin/audit` is read-only, cursor
   paginated, filterable by actor, action, target and date.
   **There is no write endpoint and no delete endpoint by design**: rows are
   written server-side **inside the same transaction as the privileged action**,
   so an action cannot succeed while its audit row fails.
   **Nothing else in this sprint ships before this works.**
2. **All 17 sections.** 10 currently have no write endpoint
   (`docs/ADMIN_SURFACE.md`): Overview, Briefings, Corpus, Subscriptions, Support,
   Push, Analytics have none at all; Enrolment, Advocates and LLM routing are
   read-only or partial.
3. **Platform controls** — five **fixed** kill-switch keys (`search`, `drafting`,
   `briefings`, `ocr_intake`, `signups`). **`reason` is mandatory**, enforced by a
   check constraint. An unknown key is a `400`, **never an implicit create** — a
   typo must not produce a switch nobody is watching.
   *A switch thrown at 3am with no reason is unreconstructable by whoever decides
   at 4am whether to throw it back.*
4. **Disputed citations** — uphold calls the **shared** `applyOverruledChange`,
   the same operation the nightly re-check calls. **Do not build a second
   fan-out**: two implementations drift, and the one that drifts is the one that
   stops notifying. Idempotent on the hashed tuple, partial completion
   unacceptable.
5. **Model routing keyed by data class** (canvas `10l`,
   `design/screens/renders/57-admin-routing@2x.png`): scan → **any hit means sensitive, ambiguity
   resolves to sensitive** → route only to a provider with terms on file, **no
   cheaper fallback, no founder override** → class and provider written to the
   ledger for seven years.
   **The provider list stays empty until OD-6's commercial half closes.**
6. **Monitoring and alert thresholds.** `docs/FAILURE_MODES.md` is the source.
   ⚠️ **The S6 gate says "all alerts fire in a drill" but never enumerates them.**
   `docs/FAILURE_MODES.md` contains six page-worthy conditions — citation failure
   >0.5% · silent drop · sweep incomplete by 00:30 · LLM spend >$50/day ·
   stale-overruled · re-check incomplete by 22:50. **Confirm with the founder that
   these are the intended six before wiring them.** Do not assume.

**DONE**
- The append-only trigger **provably rejects** an UPDATE
- Every privileged action writes a ledger row **in the same transaction** — kill
  the ledger write in a test and assert the action rolls back
- Every alert fires in a drill
- A kill switch without a `reason` is rejected

**NEVER**
- Ship a privileged control before the ledger works
- Build a second fan-out
- Allow a founder override on sensitive-class routing

---

## RCC

**OWN:** `apps/admin/**`

**TASK**

1. **Admin UI aligned to current tokens.** The admin renders still show the **v2
   palette** — dark sidebar, oxblood accents — and `PD-11` records that this is
   deliberate: admin is internal, RCC builds from the live canvas, and capturing
   PNGs of the old palette is wasted work.
   **Build from the renders' layout, not their colour.** Same `tokens.ts` as the
   app. Density may differ; **values may not. A hex not in `tokens.ts` is a
   defect.**
2. **The verification mark renders identically to the app** — same component, same
   derivation, **verified silent**. An admin triaging a disputed citation must see
   **exactly what the advocate saw**, or the disputed-citations queue is worthless
   as evidence.
3. Six sections have **no golden render** (PD-11) — Advocates, Corpus, Support,
   Push, Staff, Analytics. **The live `LawMind Admin.dc.html` is the reference.**
4. Desktop-only, 1440px, ink sidebar.

**DONE**
- Admin consumes `tokens.ts` with zero admin-only hex
- The citation mark is byte-identical in behaviour to the app's
- All 17 sections navigable

**NEVER**
- A second palette or type scale
- A divergent citation rendering

---

## GATE S6
All alerts fire in a drill · **the audit ledger records every privileged action** ·
admin runs on current tokens.
