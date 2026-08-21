# Cost Incidents

Any unplanned spend above $5 requires an append-only entry here. Required
fields: provider, cause, maximum exposure, actual charge, why the guard failed,
and corrective action. Unknown facts remain explicit; later evidence is added
as a dated correction rather than rewriting the original entry.

## INC-001 - Railway Spend (Historical)

- Recorded: 2026-08-16
- Incident date: UNKNOWN; this is a retrospective record
- Provider: Railway
- Cause: UNVERIFIED. Repository records establish Railway-hosted PostgreSQL and
  later migration work, but do not establish which Railway billing line items
  caused this incident. Do not infer a cause from database size or egress notes.
- Maximum exposure: UNKNOWN. No contemporaneous provider hard cap is documented.
- Actual charge: approximately $70, founder-reported in the CX1 final
  cost-hardening directive; invoice reconciliation is not present in the repo.
- Why guard failed: UNVERIFIED. The repository has no contemporaneous evidence
  showing which controls existed, which path created the charge, or whether a
  control was bypassed.
- Corrective action: require repository-wide pre-authorization and append-only
  reconciliation; cryptographically verify founder exceptions; recover stale
  locks without displacing live owners; retain R2's existing pre-network meter;
  distinguish provider caps from alerts; and require this incident record for
  every future unplanned charge above $5.

Supporting repository facts, not incident-cause attribution:

- `docs/ops/migration/MIGRATION_RUNBOOK.md` records a 103.9 GB Railway database,
  a 74.4 GB dump payload, and failures of long-lived proxy connections.
- `docs/FOUNDER_QUEUE.md` records that PostgreSQL wire egress for the dump was
  uncompressed and describes it as bounded, one-time migration egress.
