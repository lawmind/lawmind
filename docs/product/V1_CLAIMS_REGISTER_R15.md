# V1 CLAIMS REGISTER — R15 CURRENTNESS-CADENCE AMENDMENT

**NEW3, 1 September 2026.** Supersedes only the currentness-cadence wording in
[`V1_CLAIMS_REGISTER_R14.md`](V1_CLAIMS_REGISTER_R14.md). Every other R14 claim,
platform rule, qualifier and prohibition remains unchanged.

## Decision

```text
STATIC_NIGHTLY_COPY       = REQUIRES_RUNTIME_EVIDENCE
RUNTIME_EVIDENCE_REQUIRED = YES
CURRENT_REACHABLE_COPY     = UNSUPPORTED_UNTIL_REMOVED
CAPABILITY_STATE_CHANGE    = NONE
```

The reachable line in
`apps/mobile/src/screens/judgment/VerificationSheet.tsx` is:

> Re-checked every night. If this changes before your hearing, you will be told.

Committed configuration proves only that `railway.recheck.json` contains
`cronSchedule: "0 17 * * *"` and starts the recheck command. It does not prove a
production executor is deployed, that it ran in the latest window, that it
completed successfully, or that this particular authority was checked. A
configuration is not a runtime observation.

## Exact RCC instruction

Remove the quoted sentence now and render **no replacement cadence promise**.
Do not derive “nightly”, “daily”, “last checked” or “next check” from the cron
configuration, the response `asOf`, a citation-existence tier's `checkedAt`, a
build timestamp or a planned deploy.

If a later released contract supplies runtime currentness evidence, the only
authorized dynamic forms are:

```text
Last checked {lastCheckedAt}.
Next check planned {nextPlannedCheckAt}.
```

Render the first only from a successful per-authority currentness check timestamp.
Render the second only when a released contract supplies it from the deployed
scheduler. Omit either sentence when its field is absent. Do not replace a missing
timestamp with “today”, “tonight”, “daily” or “every night”.

“If this changes before your hearing, you will be told” is also removed from this
generic verification sheet. Current fan-out has named audiences — saved, copied
or exported authorities — and viewing the sheet alone does not prove the user is
in one. Audience-specific alert copy remains governed by the citation harness.

## Runtime evidence bar

Authorizing cadence copy requires all of:

1. observation that the production executor is deployed and enabled;
2. durable successful-run evidence for the relevant scheduled windows, including
   failures and missed windows rather than only successes;
3. a per-authority `lastCheckedAt` derived from a completed currentness check; and
4. if future cadence is stated, contracted `nextPlannedCheckAt` derived from the
   deployed scheduler rather than repository configuration.

Evidence must remain current. A one-time successful run does not authorize an
indefinite static promise.

## Not monitoring

This amendment governs the citator's good-law recheck only. It does not authorize
eCourts monitoring, a listing cadence, polling frequency, SLA or price.
`monitoring.user_product` remains unavailable and R14 section C remains binding.

## Audit delta

```text
UNSUPPORTED_REACHABLE_CLAIMS = 1
  -> 0 when RCC removes the current static sentence
ENABLED_WITHOUT_EVIDENCE     = 0 (unchanged)
```
