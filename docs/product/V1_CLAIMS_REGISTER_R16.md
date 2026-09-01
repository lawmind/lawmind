# V1 CLAIMS REGISTER — R16 CADENCE CLOSURE AND THE DESIGN-MANIFEST RULING

**NEW3, 2 September 2026.** Supersedes only the cadence audit delta in
[`V1_CLAIMS_REGISTER_R15.md`](V1_CLAIMS_REGISTER_R15.md) and adds one new ruling.
Every other R14/R15 claim, platform rule, qualifier and prohibition remains
unchanged. Measured at `HEAD = 13f558d1`.

## 1 · The cadence claim is closed — two sites, not one

```text
STATIC_CADENCE_CLAIM_CLOSED          = YES
UNSUPPORTED_REACHABLE_CADENCE_CLAIMS = 0    (was 1 named + 1 nobody had named)
LAST_CHECKED_AT_RENDERING            = NONE
```

| site | before | after |
|---|---|---|
| `screens/judgment/VerificationSheet.tsx` | "Re-checked every night. If this changes before your hearing, you will be told." | removed; no replacement cadence, no timestamp, no notification undertaking |
| `screens/manifest.ts` row 78 `citator-alerts-in-the-briefing` | `notes: 'Batched nightly, four triggers'` | `notes: 'Batched, four triggers'` |

Verified in this round by sweeping both files for `re-checked · rechecked ·
each night · every night · overnight · you will be told · notified`. The only
remaining hits are a comment recording the removal and a comment in the test that
used to match the removed string. Remaining `daily` occurrences are the **daily
loop** feature name and the `daily-cause-list` slug — a product name, not a
currentness cadence.

No substitute timestamp was rendered, and none was available: the contract still
serves no citator recheck timestamp on any type. `CitationCheck.checkedAt` is
when a citation's **existence** was checked and `asOf` is a response stamp; both
are forbidden substitutes under R15 and both were correctly refused. The R15
runtime evidence bar is unchanged and still unmet.

One replacement draft was refused by `screens/routeGates.test.ts` for making a
forward good-law claim while `treatment.good_law_claim` is `DISABLED_NOT_READY`.
That refusal was correct and the gate stays.

## 2 · New ruling — the design manifest is not a product surface

```text
SLUG_ROUTE_CLASSIFICATION = C_INTERNAL_SCREEN_MANIFEST_TOOL
SLUG_ROUTE_DECISION       = DEV_GUARD
CLAIMS_AUDIT_EXEMPTION    = PERMITTED ONLY ONCE THE ROUTE CANNOT REACH PRODUCTION
```

`apps/mobile/app/s/[slug].tsx` carries no `__DEV__` guard, so the design
inventory reaches a release binary. Measured at this HEAD: of 98 manifest rows,
17 redirect to a real screen and **81 mount `ScreenShell`**, of which **53 print
free `notes` prose** written to describe a mockup.

The second cadence claim above lived in one of those rows. It was invisible to
the audit built to catch it, because `r16Surfaces.test.ts` skips `manifest.ts` by
filename.

**The current strings being clean is not a reason to keep the route reachable.**
A hundred rows of internal prose behind an unguarded dynamic route is a standing
generator of unadjudicated claims: every future design row is a new
production-reachable sentence written by someone documenting a design, exempted
by name from the audits that govern production sentences. Auditing today's
contents proves today's contents.

The instruction is the guard, **not** the removal of the exemption. Subjecting a
design ledger to production claims discipline would either freeze it or turn it
into marketing copy; the manifest should be free to say "colour and serif
superseded". Guarding the route makes the exemption correct rather than
dangerous — an audit may legitimately skip a file that cannot reach production.

`/gallery` and `/directory` are the precedent and were fixed exactly this way.

There is no capability row for a screen inventory, no `V1_SURFACE` entry and no
acceptance evidence, so by NEW3's standing rule it is not current product.

## 3 · Audit delta

```text
UNSUPPORTED_REACHABLE_CLAIMS = 0   (R15's 1 is discharged)
ENABLED_WITHOUT_EVIDENCE     = 0   (unchanged)
PRODUCTION_REACHABLE_UNAUDITED_PROSE = 53 strings across 81 rows
  -> 0 when RCC guards app/s/[slug].tsx
CAPABILITY_STATE_CHANGE      = NONE by this register
```

`monitoring.user_product` remains unavailable, `MONITORING_LEAKS = 0`, and R14
section C remains binding. This register governs citator currentness copy and
design-inventory reachability only. It authorizes no eCourts monitoring, listing
cadence, polling frequency, SLA or price.
