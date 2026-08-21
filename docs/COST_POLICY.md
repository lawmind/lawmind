# Cost Policy V2

Pre-revenue LawMind defaults to zero cloud compute and bounded object storage.
This policy is repository-wide and does not replace provider-specific runtime
enforcement.

## Enforcement Hierarchy

| Level | Control                                     | Meaning                                                                                      |
| ----- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1     | Provider-side hard cap, where available     | The provider refuses further billable use. Verify that the setting is a cap, not an alert.   |
| 2     | Provider-specific pre-network runtime guard | The application refuses an operation before the provider call.                               |
| 3     | `scripts/cost-guard.mjs`                    | Global authorization, cumulative policy, signed founder approval, and reconciliation ledger. |
| 4     | Billing alert                               | Informational detection only. An alert is not a cap.                                         |

VERIFIED 2026-08-16: Cloudflare documents its budget alerts as informational;
they do not pause or cap usage. LawMind's R2 control in
`packages/storage/src/spend.ts`, applied through `metered.ts`, therefore remains
important. It checks a configured operation-cost ceiling before each R2 network
operation. The `platform_config` halt is an incident stop, and
`r2_operation_ledger` is the provider-specific aggregate audit record. The
global script does not reproduce R2 operation pricing or counters.

VERIFIED 2026-08-16: Backblaze B2 documents daily data caps for storage,
downloads, and supported transaction classes. This is a future
provider-selection advantage only. It does not reopen V2 provider selection and
does not authorize an account or migration.

Provider references:

- https://developers.cloudflare.com/billing/manage/budget-alerts/
- https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts

## Cumulative Gates

DECISION: every paid action must pass `scripts/cost-guard.mjs`. A dry run is
advisory; `--record` must succeed before the provider action.

DECISION: UNKNOWN, UNBOUNDED, UNLIMITED, or non-finite cost is forbidden.

| Cost shape                    | Approval rule                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| One-time                      | Founder approval when a single action, task total, provider UTC day/month, or project UTC day/month exceeds $10 |
| Monthly                       | Founder approval when a single or active task/provider/project monthly commitment exceeds $5                    |
| Zero-cost unrestricted        | Allowed regardless of historical paid spend                                                                     |
| Zero-cost restricted category | Founder approval still required                                                                                 |
| Unknown/unbounded             | Forbidden                                                                                                       |

Historical authorization and measured-actual totals are reporting fields only.
An unbounded lifetime project total is never an approval reason. A signed
approval may additionally define a project budget period with an ID, start,
end, and cumulative maximum.

This catches six $1.99 charges, twenty $0.75 charges, several $4/month
services, and independent agents sharing the repository ledger without
blocking later ordinary $0 work.

Cloud compute, a new database or vector vendor, full-corpus embedding, provider
account creation, and automatic scale-up require signed founder approval even
at $0. Recurring and usage-based authorizations require a finite `--cap-usd`,
owner, purpose, task ID, provider, and shutdown condition.

## Signed Founder Approval

`--approve` does not exist. Approval-required spend references
`docs/cost-approvals/<approval-id>.json`, signed with Ed25519. The guard verifies
the signature with `docs/cost-approvals/founder-cost-approval-public-key.pem`,
then checks scope, expiry, amount, and use count.

The private key must remain outside the repository and outside all agent
environments. The guard never creates approvals or key material. Unsigned,
tampered, malformed, expired, exhausted, or mismatched artifacts fail closed.
See `docs/cost-approvals/README.md` for the exact founder procedure.

## Append-Only Ledger

`docs/cost-spend-ledger.jsonl` is the machine enforcement source. Its events are:

- `AUTHORIZATION`: estimated maximum/commitment before action;
- `ACTUAL`: measured provider charge referencing an authorization;
- `CLOSE`: reason and timestamp referencing a monthly or usage-based authorization.

No event is edited or deleted. A valid later `CLOSE` removes the referenced
commitment from active totals while preserving history. Unknown, duplicate, or
owner/task/provider-mismatched closures are refused.

The recoverable lock records PID, creation time, hostname, process identity,
and a random token. A live or unprovable owner is never displaced. A lock is
recovered only when the same-host PID is demonstrably dead, with an atomic
rename/recheck before replacement.

`docs/COST_LEDGER.md` is the human summary, not the enforcement source.

## Usage-Based Reconciliation

`--cap-usd` is an estimated commitment and metadata; it is not automatically a
provider hard limit. Keep three fields conceptually separate:

1. estimated authorization/commitment;
2. actual measured spend reconciled later;
3. verified provider hard limit and its evidence, if one exists.

Example lifecycle:

```powershell
node scripts/cost-guard.mjs --event authorization --amount-usd 5 --kind one-time --billing-model usage-based --cap-usd 5 --provider example --purpose "bounded task" --owner CX1 --task-id CX1-COST --shutdown "stop at authorization limit" --record
node scripts/cost-guard.mjs --event actual --authorization-id <entryId> --actual-usd 2.31 --provider example --owner CX1 --task-id CX1-COST --record
node scripts/cost-guard.mjs --event close --authorization-id <entryId> --provider example --owner CX1 --task-id CX1-COST --reason "task complete" --record
```

## Incident Rule

Any unplanned spend above $5 requires a short entry in
`docs/COST_INCIDENTS.md`: provider, cause, maximum exposure, actual charge, why
the guard failed, and corrective action. Unknown facts stay explicitly unknown.

## Limits

This repository gate cannot prove that every external provider action passes
through it. A repository-writable script, public key, and ledger also cannot
resist an actor allowed to rewrite all three. Protected review/branch controls
or a founder-controlled external runner are required for that stronger threat
model. Provider billing data must still be reconciled, and a provider hard cap
is authoritative only when verified at the provider.

The audited R2 operation meter currently accumulates its ceiling in process
memory; `r2_operation_ledger` is an aggregate audit record, not a transactional
cross-process reservation system. Multiple runtime processes therefore require
a provider hard cap or a future shared atomic budget for stronger aggregate
containment. This non-production pass deliberately does not alter that LCC
runtime design.
