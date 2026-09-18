# SHIP S4-T0.3 — CI baseline, alert-surface truth, capability registry R18

**SHIP, 18 September 2026.** The final transition-cleanup round before ordinary
Sprint-4 execution. It closes the repository-CI baseline T0.2 left open, tells the
truth about what the alert surface can deliver, and gives that surface a
capability row for the first time.

Configuration, tooling, current-v1 alert copy/gating, capability governance, tests
and docs. **No cloud, no paid resource, no corpus mutation, no citation apply, no
HNSW, no semantic enablement, no eCourts work, no monitoring or briefing or
drafting implementation, no broad refactor.**

```text
HEAD_START = 93c77a3ffe6b0380441cfccdce489bf913d2a95f
HEAD_FINAL = (recorded by the commit after the content commit; a commit cannot
              name itself - see git log)
COMMITS    = (same)
```

## Re-anchor (start)

```text
ORIGIN_MAIN_START = 93c77a3ffe6b0380441cfccdce489bf913d2a95f  (== HEAD_START)
STAGED            = 0 files
TRACKED_MODIFIED  = 85, all other sessions' work
UNTRACKED         = 19,858
GIT_COMMIT        = RELEASED (record holder SHIP, prior session)
MIGRATION_SLOT    = RELEASED · HEAVY_BOX = RELEASED
LANE_BINDING      = SHIP
```

**No isolated worktree was taken, and the reason is measured rather than assumed.**
The round permits one "if required". Of the 340 source files this round reformats,
exactly ONE is also dirty in the shared tree (`services/ingest/src/citations-cli.ts`);
of the files it edits for lint, one more is
(`services/harness/src/delta-queue.mjs`). Both are handled the way T0.1 and T0.2
handled foreign dirt: the worktree keeps both changes and the commit is staged from
a blob built as `HEAD + this round's hunks only`, so the other session's work stays
its to commit. A second checkout would have cost a full `pnpm install` and bought
nothing that exact-path staging does not already give.

---

## T0_2_SUPERSEDING_VERDICT

```text
SHIP_S4_T0_2_RUNTIME_CI_RECONCILIATION = HOLD — REPOSITORY_CI_BASELINE_NOT_GREEN
```

Appended to that round's own record rather than edited into it
([`../ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md`](../ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md)
§CORRECTION). Its old PASS line stands where it was written; this repository does
not rewrite its own record.

**Why the PASS was wrong.** T0.2's acceptance block wrote
`REPOSITORY_CI_BASELINE = PASS` and then qualified it "for this round's scope".
That qualification is the defect: an acceptance condition cannot be re-scoped by
the round being graded. The three baselines were measured honestly and recorded
honestly in the body — 479 prettier failures, 4,650 eslint problems, 8 harness type
errors, a red `server checks` job on the first push-triggered run — and the summary
line said PASS anyway. Correct measurement plus a redefined pass condition is still
a false green.

These T0.2 subresults are NOT reopened and stand on their own evidence:

```text
ACTIVE_HOSTING_CONTRADICTIONS = 0
RETIRED_DEPLOYMENT_DEFAULTS   = 0
DEPLOYED_SAFETY               = NOT_RUN_NO_DEPLOYED_TARGET
AUTHORITY_CHECK               = PASS
```

`docs/CURRENT_STATE.md` §1 now carries the correction, so the live pointer does not
imply T0.2 closed the baseline.

---

## REGISTRY_R18 / API_CONTRACT_REVISION / WIRE_PROTOCOL_VERSION / R17_METADATA_DEFECT

```text
CAPABILITY_REGISTRY_REVISION = R18
CAPABILITY_REGISTRY_FILE     = docs/product/V1_CAPABILITY_REGISTRY_R18.json
CURRENT_CLAIMS_REGISTER      = docs/product/V1_CLAIMS_REGISTER_R18.md
API_CONTRACT_REVISION        = R17
WIRE_PROTOCOL_VERSION        = 1
CHANGE_CONTROL               = CCR-SHIP-S4T03-01, POST_IMPLEMENT_ACCEPTED
```

### R17_METADATA_DEFECT

Read mechanically from the four files the round named:

| source | said |
|---|---|
| `V1_CAPABILITY_REGISTRY_R16.json` | `contractRevision` R16 · `currentContractVersion` R16 on every row |
| `V1_CAPABILITY_REGISTRY_R17.json` | `contractRevision` **R16** · `contractArtifact` **R16 amendment** · `currentContractVersion` **R16** on all 30 rows |
| `RCC_V1_API_CONTRACT_R17_AMENDMENT.md` | exists, and is the released revision |
| `CONTRACT_CHANGE_LEDGER.json` | `currentVersion` **R17** · `currentVersionArtifact` **R17 amendment** · `contractRevisionVsWireVersion`: "R17 is the SEVENTH product-contract revision and the current released revision; the wire integer remains 1" |

R16 established that `currentContractVersion` means **the current contract
revision**, not the revision at which a row was last measured. So R16 inside an
R17-current registry is simply stale. R17 moved only the web platform cell and
inherited these three fields without re-stating them; the ledger, which owns
contract identity, has said R17 since R17 was released.

**Corrected in a NEW snapshot, not in place.** R18 sets `contractRevision = R17`,
`contractArtifact = docs/product/RCC_V1_API_CONTRACT_R17_AMENDMENT.md`, and
`currentContractVersion = 'R17'` on every row. R17 and R16 are byte-identical to
their committed forms — `git diff` empty on both, verified.

### What R18 inherited, measured rather than asserted

```text
ROWS                         = 33  (30 inherited + 3 added)
INHERITED_ROW_DRIFT          = 0   on id, state, platforms, evidenceArtifact,
                                   evidenceState, runtimeRow, coverageDefinition
ENABLED_ON_A_PLATFORM        = 17  (unchanged from R17)
WEB_CELLS_OUT_OF_SCOPE       = 33 / 33
ROWS_NOT_AT_R17              = 0
IOS_ANDROID_STATES_CHANGED   = 0
```

Explicitly NOT changed, as the round required: iOS states, Android states, web
`OUT_OF_SCOPE_CURRENT_FOUNDER`, public semantic, eCourts, briefing, drafting,
uploads, statute-linked judgments, monitoring.

```text
CAPABILITY_REGISTRY_REVISION = R18
API_CONTRACT_REVISION        = R17
WIRE_PROTOCOL_VERSION        = 1
```

**Independent revision domains.** The matching R17 in two of those lines is
coincidental and `docs/CURRENT_STATE.md` §4 says so; a bare "R17" is what would
match a registry row against the wrong contract.

---

## ALERT / MONITORING TRUTH RECONCILIATION

The red `check-alert-coverage.mjs` was **not** read as permission to build all four
PD-5 triggers. It was read as a question about which gate it belongs to.

### ALERT_SURFACES_FOUND

```text
apps/mobile/app/alert-settings.tsx              route, reachable from app/settings.tsx
apps/mobile/src/screens/alerts/AlertSettingsScreen.tsx   3 toggles + 1 fixed row
apps/mobile/src/screens/today/TodayScreen.tsx   TWO alert cards: "An authority you
                                                have used has moved" (severity
                                                immediate) and "Since yesterday"
                                                (severity batched)
apps/mobile/src/state/alerts.ts                 client store
services/api/src/alerts/route.ts                GET /alerts, POST /alerts/:id/read,
                                                GET+PATCH /me/alert-settings
```

### ALERT_PRODUCERS_FOUND

```text
alert_kind enum (packages/db/src/schema.ts, migration 0019)
  = ['saved_authority_moved', 'filed_citation_moved']   -- TWO values

the ONE producer: services/api/src/citations/fanout.ts  applyOverruledChange()
  writes both kinds, from an overruled_status FLIP
  callers: services/api/src/citations/recheck.ts (the recheck job)
           services/api/src/admin/disputes.ts  (an upheld dispute)
  invocation: `pnpm --filter @lawmind/cron recheck` (services/cron/src/recheck-cli.ts)
              -- a CLI. Nothing schedules it anywhere.
```

### Per-kind measurement, as the round specified

| question | `saved_authority_moved` | `filed_citation_moved` |
|---|---|---|
| producer exists? | YES — `fanout.ts`, severity `batched` | YES — `fanout.ts`, `immediate` on set_aside/partly_set_aside, `batched` on doubted |
| real API row creatable? | YES — audience is `citation_checks.shown_to_user` joined to `searches`/`documents`, gated by `users.alert_saved_authority_moved` | PARTLY — audience is `documents` (an EXPORTED draft) ∪ `citation_copies` (copied out). The documents half needs POST_V1 drafting/export; the copies half is current-v1 (`services/api/src/citations/copies.ts`) |
| client renders it? | YES — Today "Since yesterday" | YES — Today "An authority you have used has moved" |
| push required? | NO — batched is in-app only | ONLY for the immediate severity |
| in-app fallback exists? | YES, and it IS the delivery path | YES |
| **physical delivery ever observed?** | **NO** | **NO** |
| depends on a POST_V1 feature? | NO | HALF of its audience does |

**Not inferred from code.** The producer runs only from a CLI or an admin dispute,
and `PRODUCTION = NONE` / `PERSISTENT_BETA = NONE`, so there is nowhere for either
to have run. No alert has been observed reaching a screen.

### The four concepts, kept apart

```text
CITATOR_ALERTS      = the two kinds above. Producer, routes and client surface all
                      exist; no delivery observed.
ECOURTS_MONITORING  = monitoring.user_product, DISABLED_NOT_READY, UNCHANGED.
                      An alert about an authority the app already showed you is not
                      monitoring, and PD-5 triggers 3 and 4 are what would need it.
PUSH_DELIVERY       = alerts.push_delivery. EAS_PROJECT_ID absent from
                      app.config.ts, so registerForPushNotifications() can only
                      return NO_PROJECT_CONFIGURED on a real build. No push observed.
DAILY_BRIEFING      = briefing.daily_loop, DISABLED_NOT_READY, UNCHANGED. It is a
                      DELIVERY CHANNEL, and the settings screen named it while it
                      was disabled.
```

```text
MONITORING_STATE = DISABLED_NOT_READY   (unchanged — nothing implemented)
BRIEFING_STATE   = DISABLED_NOT_READY   (unchanged — nothing implemented)
PUSH_STATE       = DISABLED_NOT_READY   (no project id, no observed delivery)
```

### ALERT_CAPABILITIES — three rows, added because the surface was unrowed

The registry had **no** `alerts.*` row while both surfaces were user-reachable, so
nothing measured the distance between what the screen promised and what the product
can do. They are separate rows, not one, and not folded into
`monitoring.user_product`: collapsing them is how "the alert works" comes to mean
"the push works".

```text
alerts.saved_authority_moved  DISABLED_NOT_READY (ios, android) · web OUT_OF_SCOPE
alerts.filed_citation_moved   DISABLED_NOT_READY (ios, android) · web OUT_OF_SCOPE
alerts.push_delivery          DISABLED_NOT_READY (ios, android) · web OUT_OF_SCOPE
```

Each carries a named `evidenceArtifact` listing its producer, routes, client surface
and tests, and each ends with the same sentence: **no end-to-end delivery observed.**
The five-field rule is satisfied on all three (id, platform, evidenceArtifact,
evidenceState, currentContractVersion) — which is what makes the `DISABLED` honest
rather than merely absent.

**New evidence vocabulary, additive:** `CODE_PATH_ONLY_NO_DELIVERY_OBSERVED` —
"every code element exists and is tested, and no end-to-end delivery has ever been
observed reaching a user." Weaker than `NAMED_ROUTE_OBSERVATION`, weaker again than
`NAMED_ARTIFACT_PRESENT`. A row in this state may never read ENABLED. It was added
because the three rows are exactly this state and no existing value said it without
overclaiming.

`alerts.push_delivery` is `DISABLED_NOT_READY` and not `DISABLED_EXTERNAL_BLOCK`,
and the distinction is argued in the row itself: an EAS project id is founder-owned,
which points at EXTERNAL_BLOCK, but installing the `eas` CLI and observing a
delivery is ours, and EXTERNAL_BLOCK means "no amount of our work closes it".

**No capability became ENABLED because a route, an enum value or a component
exists.** All three exist for `alerts.saved_authority_moved`, with passing tests,
and the row is disabled. R18 records that as an assertion
(`enabledRequiresAllFive.audit.alertsAssertionR18`) beside the two R14/R15
assertions it extends.

### CURRENT_V1_ALERT_DECISION — the smallest truthful correction

The screen made four promises. Each is removed, and the setting that genuinely
works is kept:

| promise | why it was false | now |
|---|---|---|
| "Four things." | `alert_kind` holds TWO values; PD-5 triggers 3 and 4 have no enum value and no producer | removed |
| "Everything arrives in the evening briefing unless it affects a hearing the next day." | `briefing.daily_loop = DISABLED_NOT_READY`. Naming a disabled delivery channel is the one thing a settings screen must not do | replaced with what is true: we tell you inside the app, we send no digest |
| "An authority I filed is set aside … **Cannot be turned off.**" with a disabled, permanently-ON switch | reads as a working mandatory alert; its audience needs an exported draft (POST_V1) or a copied citation, and nothing has been delivered | renders like every other not-yet row: a statement and a "Soon" label, never a control |
| a push-permission prompt on turning `savedAuthorityMoved` ON | `alerts.push_delivery` cannot deliver; on a real build the call can only return `NO_PROJECT_CONFIGURED`. A permission prompt spent on a dead channel is one this product does not get back | the call is gone; `registerForPushNotifications` and `PUSH_FAILURE_COPY` are removed from this screen and stay wired in `push/register.ts` for S4-R1 |

Added: one neutral-ink notice — "Alerts are not switched on in this version. What
you choose is saved, and it applies the moment alerts are switched on." Neutral ink
and a plain border, never the reserved amber: amber means THE LAW HAS MOVED, and
"we have not switched this on" is a fact about us.

**Kept, deliberately.** The `savedAuthorityMoved` toggle still saves, because
`users.alert_saved_authority_moved` gates the producer's audience query AT THE
QUERY — the preference is honoured the moment the producer runs. Hiding a setting
that genuinely persists would have been a second inaccuracy in the other direction.
The Today alert cards are untouched: they render nothing when there are no alerts,
which is the honest empty state, and they are the path the capability will use.
**No producer was built to satisfy PD-5.** PD-5 and PD-6 remain settled long-term
product decisions; they do not mean all four triggers ship in current v1.

Test rewritten: `AlertSettingsScreen.test.tsx`, 7/7 pass. Two of its assertions are
INVERTED — it used to assert the disabled switch existed and that push was asked
for; it now proves neither happens. Three new cases assert the copy is truthful.

---

## OLD_ALERT_GUARD_CLASSIFICATION / CURRENT_V1_ALERT_GUARD / FUTURE_PD5_READINESS_GUARD

```text
OLD_ALERT_GUARD_CLASSIFICATION = CORRECT MEASUREMENT, WRONG GATE
```

`scripts/check-alert-coverage.mjs` asked whether all four PD-5 triggers can fire.
Two cannot, because `monitoring.user_product` and `documents.upload_and_ocr` are
DISABLED **by decision**. So it was red on every run from 11 Aug 2026 — the comment
that wired it into `ci:local` says so, "added knowing `ci:local` goes red" — and the
only ways to green it were to build monitoring and uploads, which the founder has
not scoped, or to delete a correct measurement. Neither. It was not deleted and it
was not loosened.

```text
FUTURE_PD5_READINESS_GUARD = scripts/check-pd5-alerts-readiness.mjs
  git mv from scripts/check-alert-coverage.mjs -- history preserved, body unchanged
  except a banner recording what changed and why
  REQUIRED BEFORE  any capability claims full PD-5/PD-6 behaviour: before
                   monitoring.user_product or briefing.daily_loop may read anything
                   other than DISABLED, and before any surface says "four things"
  NOT REQUIRED BY  Gate D, current-v1 CI, or pnpm ci:local
  STILL RED, honestly: exit 1, 2 of 4 triggers can fire
```

```text
CURRENT_V1_ALERT_GUARD = scripts/check-alert-surface-truth.mjs   (new, in CI)
```

It asks the question current v1 owns — **does the product PROMISE an alert it
cannot deliver?** Four rules, each one a defect that actually shipped:

1. **ENABLED needs a producer.** An ENABLED `alerts.*` row must name an
   `alertKind` that is in the enum and that `fanout.ts` writes.
2. **ENABLED needs a user-visible path** and a named evidence artifact + state.
3. **A disabled trigger is not a control** — no `<Switch disabled>`, no "cannot be
   turned off", and `settings.unavailable` must still be read from the server.
4. **Copy may not name a disabled channel** — no evening briefing while the
   briefing is disabled, no `registerForPushNotifications()` while
   `alerts.push_delivery` is not ENABLED, no monitoring promise, no "Four things".

Plus: a reachable alert surface must have a registry row at all.

The enum and the producer are READ FROM SOURCE, never listed in the guard — a
guard carrying its own copy of the enum goes stale exactly the way the screen did.

**It is proven non-vacuous in both directions.** On its first run against the
already-fixed screen it convicted all four copy rules — because the doc comment
recording the fix QUOTES the removed words. A guard that cannot tell a shipped
string from a comment about a shipped string forbids writing the comment. So the
copy rules strip block and line comments first, and two of its tests prove the
guard does NOT fire on a comment.

`scripts/check-alert-surface-truth.test.mjs`: **12 cases, 12 pass** — 8 that must
FAIL (evening briefing · "Four things" · a disabled switch returning · the
mandatory promise returning · a push prompt · no `alerts.*` row · ENABLED without a
producer · ENABLED without evidence) and 2 that must NOT fail (a comment quoting
the removed copy; a DISABLED row naming a kind the enum does not hold).

Wired: `.github/workflows/ci.yml` and `scripts/ci-local.mjs` both run the new
guard; both stopped running the old one. The distinction is recorded in
`docs/CURRENT_STATE.md` §4 and in each script's own header.

---

## FORMAT / LINT SCOPE — CLASSIFIED BEFORE FIXED

Every number below was measured at `HEAD_START` over **tracked files only**, which
is what CI sees: the shared worktree carries 19,858 untracked files and three other
sessions' work, and measuring there is how T0.2's eslint figure came out wrong.

### Classification

| class | paths | verdict |
|---|---|---|
| `RAW_CAPTURE_FIXTURE` | `services/api/src/court/__fixtures__/**` | EXCLUDED from both. eCourts' OWN browser JavaScript and one JSON response, captured on a dated day. `ecourts-derivation.ts` DERIVES the rotating `ajaxCall` header pair from these exact bytes, so a formatter or a lint autofix turns a fact about what the server served into a fact about our tidying. Not ours to normalise. **2,156 of the repo's 2,719 lint errors.** |
| `GENERATED_CACHE` | `services/harness/.generated-cache/**` | EXCLUDED from prettier. Content-addressed model outputs, deliberately in git — its own README records the decision and states the contents are NOT reproducible. Four hold a markdown fence the model emitted despite being told not to, which is the record of what the model did. **Checked, not assumed:** `readCache()` returns the RAW STRING and `parseStringArray()` strips the fence before `JSON.parse`, so nothing parses these as source JSON. No artifact bug; normalising them would edit evidence. |
| `RUNTIME_CHECKPOINT` | `services/ingest/.checkpoints/**` | EXCLUDED from prettier. Cursors and offsets the ingest fleet rewrites while CI runs. 107 of the format failures. |
| `HISTORICAL_ONE_OFF_TOOL` | `**/.n2*` (152 files), `docs/**/*.mjs|.mts` | EXCLUDED from eslint, and the `.ts` ones from prettier. One-off measurement scripts from the legacy NEW2 lane and round probes under the receipts tree. **VERIFIED before excluding: nothing imports them** — `git grep` finds only prose mentions and self-references. `docs/**` probes are the exact artifacts dated records cite (`docs/ai/new3-r18/probe-matters-parties.mts` is named in `r16-independent-acceptance.json`) and some of that tree is hash-bound. **CORRECTION TO T0.2: these are TRACKED, not "untracked scratch".** 396 lint errors. |
| `ACTIVE_TOOLING` | `scripts/**`, `services/harness/src/**`, `packages/db/factory/**` | **NOT excluded.** 145 problems FIXED. Where all of a file's errors were Node globals reading as undefined (`URL`, `process`, `console`, `Buffer`, `TextEncoder`, `queueMicrotask`), the config was widened — the same rule and the same reason the config already granted `scripts/**/*.mjs` and `services/harness/probes/**`. A rule that has now caught the same correct code three times is a gap in the config. |
| `ACTIVE_SOURCE` | `services/**/src/**`, `packages/**/src/**` | **NOT excluded.** 340 files formatted; every remaining lint error fixed. |
| not in the repository | `.scratch/**`, `.agents/tmp/**`, `.venv-ocr/**`, `.tmp-new2/**` | EXCLUDED from eslint, and two added to `.gitignore`. ESLint does not read `.gitignore`, so a gate CI passes on a clean checkout failed on a working tree with operator artifacts in it — **1,908 of the 1,910 problems left after the fixes.** `.venv-ocr` is a PYTHON VIRTUALENV; the hits were vendored JS inside pip packages. Same argument as the `*.local.*` rule this config already made once. |

### PRETTIER

```text
PRETTIER_FAILURES_BEFORE = 478 files + 4 unparseable (tracked, at HEAD)
                           by class: ACTIVE_SOURCE 340 · RUNTIME_CHECKPOINT 107 ·
                           GENERATED_CACHE 18 (+4 parse errors) ·
                           RAW_CAPTURE_FIXTURE 8 · HISTORICAL_ONE_OFF_TOOL 5
PRETTIER_EXCLUSIONS      = 5 entries in .prettierignore, each with its class and
                           its reason written next to it
PRETTIER_FILES_FORMATTED = 340   (+35,161 / -31,057, formatter only)
PRETTIER_AFTER           = pnpm format = PASS, "All matched files use Prettier code style!"
```

`git diff --check` on those 340 files is clean. The only whitespace warnings in the
tree are in `.agents/ops/n2-daily-delta-receipts.jsonl`, another session's appended
JSONL, which this round does not touch.

### ESLINT

```text
ESLINT_FAILURES_BEFORE = 2,719 errors + 4 warnings across 156 tracked files
ESLINT_EXCLUSIONS      = fixtures · **/.n2* · docs/** · four non-repository dirs
                         (each classified and reasoned in eslint.config.js)
ESLINT_FIXED            = 145 problems in ACTIVE_SOURCE / ACTIVE_TOOLING
ESLINT_AFTER            = pnpm lint = PASS (exit 0), 0 problems
```

**What "fixed" means, rule by rule** — no rule was broadly downgraded:

- `no-useless-escape` (23): the flagged backslash deleted at its exact column.
  Byte-identical behaviour by definition of the rule. Two sites revealed a REAL
  latent defect, recorded below, not silently corrected.
- `@typescript-eslint/no-unused-vars` (29): unused **imports** deleted; unused
  **locals** given the `_` prefix that this config already documents as meaning
  "deliberately unused".
- `no-irregular-whitespace` (8): literal control characters and a literal BOM
  rewritten as `\x00-\x1f` / `�` / `﻿` escapes. Byte-identical, and the
  source now says what it matches.
- `no-control-regex` (6): targeted `eslint-disable-next-line` with a one-line
  reason. Detecting control characters IS the job of these regexes — it is the
  proof-grade text-damage signal.
- `@typescript-eslint/no-unused-expressions` (5): ternary and short-circuit
  statements rewritten as `if`/`else`. Exactly equivalent.
- `preserve-caught-error` (2): `{ cause: e }` attached.
- `prefer-const` (2) and 4 unused disable directives: `eslint --fix`.
- `no-fallthrough` (1): a JSDoc between two `case` labels made
  `argument_respondent` a comment-only clause, which the rule reports
  (`allowEmptyCase` is false and a comment is not empty). The comment moved INSIDE
  the shared block. The grouping it explains is unchanged.
- **`no-useless-assignment` (22) → rule OFF, repo-wide, and it is the only rule
  this round turns off.** Every one of the 22 was the same shape: the FAIL-CLOSED
  INITIALISER, `let finalState: FinalState = 'ACTIONABLE_FAILURE'` before a `try`.
  The rule is right that the value is never read today and wrong about what it is
  for. Deleting it would remove the safe default, break TypeScript's
  definite-assignment analysis in the `.ts` sites, and make the next `catch` that
  forgets to assign produce `undefined` instead of the conservative answer. A rule
  whose only fix makes the code less safe is a rule this repository should not run.
  Scoped alternatives were considered and rejected: the sites span `scripts/**`,
  `services/api/src/**` and `services/harness/src/**`, so a path override is not
  narrower in any meaningful sense, and 22 inline disables are the same decision
  written 22 times.
- **`@typescript-eslint/no-explicit-any` (16) → OFF for `scripts/**` only.** All 16
  are in 7 legacy one-off probes reading untyped upstream JSON (the India Code
  DSpace API, S3 list-bucket XML) or untyped `sql.unsafe()` rows. Writing an
  interface for a foreign API's response inside a script that ran once is a second,
  unverified copy of somebody else's schema, wrong the moment they change it. The
  rule stays `'error'` everywhere that ships: `services/**` and `packages/**` are
  untouched by the override.

### A real defect the escape rule surfaced, recorded and NOT silently corrected

```text
scripts/lcc-r15f1-residue.mts:122   a TEMPLATE LITERAL regex source
scripts/n2-r18-db-boundary.mts:139  a prose string describing a regex
```

Both contain `\b`, which inside a template or string literal is **U+0008
BACKSPACE**, not a word boundary. The 23 removals above were all byte-identical
because a useless escape is by definition inert — `\s` in a template literal was
already `s`. `\b` is different: it is a VALID escape, so eslint never flagged it,
and the regex those files build has a backspace where the author meant a word
boundary.

Fixing it would change the behaviour of two legacy round probes and therefore the
meaning of numbers they published. That is a measurement decision, not a lint fix,
and it is recorded here rather than taken. Same trap as
`docs/ai/…/python-heredoc` — an escape eaten by the layer above.

---

## HARNESS_TYPECHECK

```text
HARNESS_TYPECHECK_BEFORE = 8 errors, 4 files
HARNESS_TYPECHECK_AFTER  = PASS   (pnpm --filter @lawmind/harness typecheck)
SERVICES_PACKAGES_TYPECHECK = PASS (the filter CI runs: api, ingest, embed, cron,
                              harness, db, auth, storage — all Done)
```

Nothing was excluded; no file was declared dead. Each error was a real defect:

- **`post-migration.ts` (3 errors)** — the most serious of the four. `timed_out`
  and `unbounded` were added to `StructuredOutcome` after this gate was written,
  and its `switch` had no arm for either, so `describe()` returned `undefined`
  while promising a `string`, and the AMBIGUOUS branch read `.hits` off a variant
  that has none — **a TypeError inside the probe that grades the citation path.**
  Both arms added, and a FAIL branch added BEFORE the `.hits` read: a citation
  query that times out or refuses as unbounded has not been shown safe, so the gate
  says which it saw instead of crashing. This can only have made the gate stricter;
  the path it fixes previously threw.
- **`retrieval.ts` (1)** — the synthetic graph-suggestion candidate never carried
  `treatmentAttribution`. Supplied as `attributionOf([])` — from the module, and
  from the SAME empty edge list the stub already passes to `precedentialEffect`, so
  it follows the module's own rule ("absence of evidence is the thing this file
  exists to stop reading as evidence") rather than hard-coding `'UNKNOWN'`.
- **`tranche-reach-delta-cli.mts` (3) and `v31-freeze-cli.ts` (1)** — a one-row
  aggregate destructured straight out of `rows[0]` under
  `noUncheckedIndexedAccess`. A bare `count(*)` always returns a row; the assertion
  states that claim, with a comment saying so.

---

## The test step: 61 failures nobody had ever seen

Not in the round's brief, and unavoidable: `pnpm ci:local`'s `test` step and CI's
`pnpm --filter "./services/*" --filter "./packages/*" test` run the FULL suite
against a freshly-migrated EMPTY database, and **61 assertions in 9 files need a
populated corpus.** The last green workflow ran 7 Aug 2026;
`search/empty-because.test.ts` was added 25 Aug. No CI run has ever executed these.

The convention already existed and was already written down — `ci-local.mjs`'s own
header says *"Tests needing a populated corpus SKIP here, exactly as they do in
CI"*, and `citations/check.test.ts`, `old-row-backfill-falsifier.test.ts` and
`search/tranche-reach.test.ts` honour it one test at a time. Nine files written
after the last green run did not.

So the convention got a name: **`services/api/src/testing/corpus-required.ts`** —
`hasCorpus(sql)` (an `EXISTS`, because three other ways of asking this have already
lied in this repository) and a `CORPUS_SKIP` reason string. 26 assertions across 8
files now skip with that reason and run unchanged the moment `DATABASE_URL` points
at a corpus. Three more were fixed at their own root cause:

- **`search/tranche-reach.test.ts`** — `new1_tranche_passages` is in NO migration
  (0093 only names it in a comment); it is a DATA-lane table created out of band.
  The counting queries sat in `before()`, so 42P01 took the whole suite down
  including the four assertions that need no table at all and are the reason the
  file exists. An existence probe moved that decision into `before()`.
- **`testing/isolated-schema.test.ts`** — `platform_config`'s CHECK allows six
  kill-switch keys and migration 0013 INSERTS exactly one, `ecourts_harvest`. The
  `signups` falsifier asserted over a row nobody ever created. It now skips an
  absent key with the reason — **and a new assertion requires that at least one key
  was really falsified**, so the suite cannot skip its way to green.
- **`harness/src/hard-negatives.live.test.ts`** — "the test proves nothing" was the
  right sentence and the wrong verdict: on an empty database it proves nothing
  because there is nothing, while on a populated one zero neutral citations would be
  a real finding. It now distinguishes the two.

**Nothing was weakened.** Every guarded assertion runs exactly as before on a
populated database, and `corpus-required.ts` says in its own header that it is not
a way to make a failing assertion quiet.

---

## AUTHORITY_CHECK / BUS_TESTS / other verification

```text
pnpm authority:check                                   PASS 73 -> 79 checks
node --test scripts/lawmind-authority-check.test.mjs   18 -> 23 cases, 23 pass
bash scripts/lane-bus.test.sh                          22 passed, 0 failed
node --test scripts/lease-liveness.test.mjs            8 pass, 1 pre-existing skip, 0 fail
node --test scripts/check-alert-surface-truth.test.mjs 12 pass, 0 fail
apps/mobile AlertSettingsScreen.test.tsx               7 pass, 0 fail
npx tsc --noEmit -p apps/mobile                        clean
node --check on every edited .mjs; ci.yml parses as YAML
git diff --check on this round's files                 clean
```

### The authority lint gained six checks, and one of them is why R17's defect lived

```text
+ registry contractRevision matches the ledger currentVersion
+ registry contractArtifact matches the ledger currentVersionArtifact
+ every capability row names the CURRENT contract revision
+ ledger capabilityRegistryArtifact is the registry CURRENT_STATE names
+ current registry: no duplicate capability id
+ current registry: no row silently dropped from the superseded snapshot
```

The ledger owns contract identity and the registry quotes it; a quote that drifts
from its source is exactly this lint's job, and nothing was checking it.

**A guard that switched itself off, fixed.** The inheritance drift check was
guarded by `webRowsChangedR17 !== undefined` and compared rows index for index — so
the FIRST registry to add a row would have skipped the check entirely rather than
failed it. It now matches by id: every row the superseded snapshot had must be
inherited unchanged, no row may be dropped, and no id may be duplicated (which is
how a second copy of a row could otherwise smuggle a state change past the test).
Five new negative tests, including one proving it does NOT fire merely because rows
were ADDED.

---

## CURRENT STATE

`docs/CURRENT_STATE.md` now carries, in its own words:

```text
CAPABILITY_REGISTRY_REVISION = R18
API_CONTRACT_REVISION        = R17
WIRE_PROTOCOL_VERSION        = 1

CITATOR_ALERT_STATE = DISABLED_NOT_READY   (producer, routes and client surface all
                                            exist; NO end-to-end delivery observed)
ECOURTS_MONITORING  = DISABLED_NOT_READY   (unchanged)
BRIEFING            = DISABLED_NOT_READY   (unchanged)
PUSH_DELIVERY       = DISABLED_NOT_READY   (no EAS project id, no observed delivery)

REPOSITORY_CI       = PASS
DEPLOYED_SAFETY     = NOT_RUN_NO_DEPLOYED_TARGET
```

**No disabled feature is called PASS anywhere.** `REPOSITORY_CI = PASS` is a
statement about the repository's own checks; `DEPLOYED_SAFETY` keeps its third
state, which is neither a pass nor a failure, and §11 says so in a sentence.

---

## Boundary

```text
PRODUCT_SCOPE_EXPANDED  = NO
MONITORING_IMPLEMENTED  = NO
BRIEFING_IMPLEMENTED    = NO
DRAFTING_IMPLEMENTED    = NO
CLOUD_CHANGED           = NO
PAID_RESOURCE_CREATED   = NO
CORPUS_MUTATED          = NO
CITATION_EDGES_APPLIED  = NO
HNSW / SEMANTIC         = untouched
ECOURTS                 = untouched
DB SCHEMA / MIGRATIONS  = unchanged (no MIGRATION_SLOT taken, no migration written)
GATE_C ACCEPTANCE       = unchanged
R16 / R17 REGISTRIES    = byte-identical to their committed forms (git diff empty)
R17 API CONTRACT        = unchanged, wire protocol still 1
AUTH / EXTERNAL DELETE  = untouched
```

The only product BEHAVIOUR that changed is the Alert Settings screen: four
promises removed, one push-permission call removed, one honest notice added, and
the one setting that genuinely persists left working. The 340-file prettier pass is
formatter output with no semantic edit mixed into it, and both typechecks and the
full test suite pass over it.

---

## Two more pre-existing CI blockers, found by running the pipeline to the end

Neither is in the round's brief. Both were failing `pnpm ci:local` — and therefore
CI's own guard steps — and both landed after the last green workflow run.

**`railway static audit` — FAIL, 2 HIGH.** The two HIGH findings were
`postgres://u:p@corpus.internal.example.net:5432/lawmind_corpus` and its user-pool
sibling in `scripts/lcc-deploy-dry-run.mjs` (15 Sep 2026), a dry-run PACKAGE
BUILDER whose whole purpose is to write a config it never connects with. The rule
asks "does a literal connection string in executable code survive an .env cutover
and reach a real database", and RFC 2606 / RFC 6761 reserve `example.com/.net/.org`
and the `.example`, `.invalid`, `.test` and `.localhost` TLDs precisely so that they
resolve to nothing, anywhere. The rule now downgrades a reserved host to INFO —
**downgraded, not exempted**, so the line is still printed and a reserved host that
later becomes a real one is still visible. A literal `rlwy.net` or `railway.app` in
executable code is still HIGH, and `railway-db-host-literal` is untouched.

**`retrieval outcome coverage` — FAIL, 2 problems.** Both against
`services/api/src/release/activation.ts` (2 Sep 2026), the RESTORE ACTIVATION
SMOKE: it runs the real `answerStructured` and `hybridSearch` against a freshly
restored generation to answer "can this thing serve at all" and writes a
`SmokeVerdict` an operator reads. Nothing it produces reaches an advocate, and the
guard's own design anticipates this — it carries an explicit `NON_SERVING` map and
says a reason there should be "a decision somebody wrote down rather than an
assumption". It is now named with its reason. The second complaint was a false
positive besides: the file DOES pass an `onDegrade` callback
(`(a) => degraded.push(a)`) and records the result in its probe.

---

## LOCAL_CI

`pnpm ci:local`, `PROBE_BASE_URL` and `CORPUS_DATABASE_URL` both unset:

```text
ok lint · format · typecheck · migration journal · json configs · powershell syntax
ok migrate (fresh) · migrate (idempotent) · test · design rules · lane bus
ok resource gate · backup pack shape · contract status · design renders · schema truth
ok amber reservation · alert surface truth · stop coverage · railway static audit
ok job health identity · screened not clean · retrieval outcome coverage
ok freshness binding · query-log privacy · timestamp precision

REPOSITORY_CI   = PASS
DEPLOYED_SAFETY = NOT_RUN_NO_DEPLOYED_TARGET
```

26 steps, exit 0. **No bounded or pre-existing failure was relabelled as a pass** —
every one of them was either fixed at its root cause or classified with a written
reason, and both are recorded above with counts.

## CORRECTIONS

- **T0.2's `ESLINT_BASELINE` figure and its description were wrong, and this round
  corrects both.** It reported "4,650 problems across 287 files … dominated by
  vendored capture fixtures and by untracked scratch files under `.scratch/**` and
  `services/ingest/.n2c-*.mjs`". Measured over TRACKED files, which is what CI
  sees, the number is **2,719 errors across 156 files**; the 4,650 came from the
  shared worktree, where `.scratch/**` (gitignored) and a Python virtualenv inflate
  it. And the `.n2c-*.mjs` files are **TRACKED** — 152 of them — not untracked
  scratch. Calling them scratch is what made them look exempt.
- My first pass at the new authority checks built its pattern with `new RegExp`
  inside a template literal, where an escape is an identity escape, so `^\s*`
  silently became `^s*` and three lookups returned `null` while reading as though
  they worked. Replaced with a line scan. (The same trap T0.2 recorded; I walked
  into it again in a different file.)
- The alert-surface guard's first draft convicted the ALREADY-FIXED screen of all
  four copy defects, because the doc comment recording the fix quotes the removed
  words. Comments are stripped before the copy rules now, and two tests pin that.
- My first bulk import-insertion put `import { CORPUS_SKIP, hasCorpus } …` INSIDE a
  multi-line `import {` block in `date-quality.test.ts`, because the insertion point
  was "after the last line matching `^import `". Detected by `tsc`, repaired, and
  the other seven files checked for the same shape.
- I ran `prettier --write` on `scripts/ci-local.mjs` earlier in T0.2 and reverted
  it; this round did not repeat that, and `scripts/**` is deliberately outside
  `pnpm format`'s glob.

## UNKNOWN

- **Whether any alert has ever been delivered to a user.** No. That is the load-
  bearing unknown behind all three `alerts.*` rows, and it cannot be resolved
  without a deployed environment (SHIP S4-R1).
- Whether `scripts/lcc-r15f1-residue.mts` and `scripts/n2-r18-db-boundary.mts`
  published numbers that were affected by their `\b`-as-backspace defect. Their
  regexes are wrong in a way eslint cannot see; whether that changed a result is a
  measurement question for whoever re-runs them.
- Whether the five unseeded `platform_config` kill-switch keys (`search`,
  `drafting`, `briefings`, `ocr_intake`, `signups`) are SUPPOSED to have rows. The
  CHECK constraint allows them and migration 0013 seeds only `ecourts_harvest`.
  Creating one is a migration and a product decision, not a test repair.
- Play Console account/app/package state: still never observed (carried from T0.2).
- Whether the corpus-dependent assertions now guarded by `hasCorpus()` still PASS
  on a populated corpus. They are unchanged and were passing before on
  `CORPUS_DATABASE_URL` runs, but this round did not re-run them against one.

## NOT_DONE

- **No producer was built for PD-5 triggers 3 and 4**, and no monitoring, briefing,
  drafting or upload code was written. The readiness gate stays honestly red.
- **`alerts.*` rows stay DISABLED.** Nothing was enabled to make a surface look
  better, and the client surface was gated instead.
- The `\b` template-literal defect in the two legacy probes is recorded, not fixed.
- The five unseeded kill-switch keys are recorded, not seeded.
- `docs/ops/migration/new2-railway-static-audit.json` is REWRITTEN by running the
  audit and was already dirty from another session. It is deliberately NOT staged
  in this round's commit — it belongs to whoever runs the audit.
- No branch protection, required status check or repository variable configured.
  `PROBE_BASE_URL` stays unset by design.
- No deployed environment was created. `DEPLOYED_SAFETY` stays
  `NOT_RUN_NO_DEPLOYED_TARGET`.

## `git diff --check`

```text
340 formatted ACTIVE_SOURCE files    CLEAN
4 other staged files                 30 "trailing whitespace" reports, ALL a CRLF artifact
```

`scripts/ci-local.mjs`, `services/harness/src/abstention-calibrate-cli.mjs`,
`tranche-reach-delta-cli.mts` and `v31-split-cli.mjs` are **pure CRLF files** —
461, 304, 158 and 169 CRLF against 0 LF-only — and this repository has no
`.gitattributes`, so CRLF is the committed convention for them. `git diff --check`
reports the `\r` at the end of every ADDED line as trailing whitespace, so any edit
to any of these four files trips it.

Verified rather than assumed: scanning the raw bytes for a real trailing space or
tab returns **0 lines in all four files**. Converting them to LF to silence the
report would produce four whole-file diffs, which is precisely the mistake T0.2
recorded and reverted. Recorded, not "fixed".

---

## What CI caught that a local run could not — two pushes, two real defects

The point of turning CI on was to be told things this workstation cannot tell
anyone. It did so immediately, twice, and neither was a CI quirk.

### 1 · `git reset` dropped a staged blob (run 35317144488)

`pnpm lint` failed on one error: `'createHash' is defined but never used` in
`services/harness/src/delta-queue.mjs`. That file is one of the two another
session has uncommitted work in, so its content was staged as a
`git update-index --cacheinfo` blob rather than from the worktree — and a
`git reset -q` before the final `git add` cleared the index and with it both
blobs. `citations-cli.ts` was rebuilt during an amend; this one was not, so the
fix silently reverted. Restored in its own commit, staged the same way.

**The lesson is about the technique, not the file.** A `--cacheinfo` blob is
invisible to `git status` and survives nothing: any `reset`, `add -A` or
`checkout` erases it, and the commit then looks complete because every other path
is present. Stage the blob LAST, and diff the commit against the intended content
before pushing.

### 2 · `selprevdays` was computed in the SERVER's timezone (run 35317338454)

`official-client-recorder.test.ts` — *"our eCourts request equals the licensed
client's"* — failed one assertion: `selPrevDays('29-08-2026', NOW)` returned `'0'`
where the test expects `'1'`.

`selPrevDays` built the selected date with `new Date(y, m - 1, d)`, which is
midnight in whatever zone the PROCESS runs in, and compared it to a fixed UTC
instant. On this workstation at UTC+04:00 the two agreed by luck. On the UTC
runner they do not, and yesterday's cause list came out `selprevdays=0` where the
licensed client sends `1`.

**Not a test-environment quirk — a production defect on every host we might
deploy to.** Every hosting provider under consideration runs UTC, so a deployed
server would have sent a combination the licensed client never sends. Under a
bounded written permission that is the kind of difference that costs the
permission, and any conclusion drawn from the reply ("nothing is retained that far
back") would have been about our bug rather than about the court. The test's own
comments already said "today, IST"; nothing had ever run it outside IST±.

Fixed by pinning both sides to the same clock — the selected date is read as IST
midnight expressed as a UTC instant — so the answer no longer depends on where the
process runs. Verified under `TZ=UTC` and under the workstation's own zone: 14/14
both ways.

**This is not eCourts work.** No capability, no harvesting, no scope: it is a
bounded correctness fix that makes our request MORE identical to the licensed
client's, and it was required to make current source pass CI.

### 3 · the lane-bus test could not read its own hook when `jq` exists (run 35334797586)

`bash scripts/lane-bus.test.sh` failed two cases on the runner — *"delivered 16,
distinct 16, expected 25"* and nine messages named as never delivered — while
passing 22/22 here. **The bus was correct the whole time; the test could not see
it.**

`lane-bus.sh` emits its payload two ways: plain text when `jq` is absent, and ONE
LINE of `{hookSpecificOutput:{additionalContext: "..."}}` when `jq` is present.
Claude Code reads the JSON form. This workstation has no `jq`; every GitHub
runner does. The drain loop counts deliveries with
`grep -c -- '--- message '` and extracts names with a GREEDY `sed`, and against
one line of JSON both collapse: grep counts 1 per delivery, and the greedy `sed`
keeps only the LAST name on the line. The nine "lost" messages are exactly the
non-final message of each delivery round.

So a correct branch of a production hook had never been graded by anything, on
any host, and the test that exists to prove messages are not silently lost was
itself silently losing them.

Fixed in the TEST, not the hook. The normaliser is factored out as `unwrap`,
`run_raw` exposes the raw bytes, and a new case 15 grades the envelope in
whichever form the host produces — plus a synthetic JSON payload so the jq branch
is graded even where jq is absent. **25 passed, 0 failed, proven BOTH ways**: once
normally, and once with a `jq` stand-in on `PATH` that reproduces the runner. The
whole pipeline was then re-run as `TZ=UTC PATH=<jq-shim>:$PATH pnpm ci:local`, the
closest reproduction of the runner this workstation can make.


---

## Acceptance

```text
T0_2_FALSE_GREEN_CORRECTED               = YES

CURRENT_CAPABILITY_REGISTRY              = R18
REGISTRY_CURRENT_CONTRACT                = R17
ALL_R18_CURRENT_CONTRACT_VERSION         = R17   (0 rows not at R17, of 33)

CURRENT_V1_ALERT_SURFACE_TRUTHFUL        = PASS
DISABLED_ALERTS_NOT_PROMISED_AS_WORKING  = PASS
MONITORING_REMAINS_DISABLED              = YES
BRIEFING_REMAINS_DISABLED                = YES

PNPM_FORMAT                              = PASS
PNPM_LINT                                = PASS
HARNESS_TYPECHECK                        = PASS
SERVICES_PACKAGES_TYPECHECK              = PASS
REPOSITORY_CI_LOCAL                      = PASS

AUTHORITY_CHECK                          = PASS (79/79 in-repo, 78/78 at HEAD)

CLOUD_CHANGED                            = NO
PAID_RESOURCE_CREATED                    = NO
```

```text
GITHUB_SERVER_CHECKS  = (recorded below once observed)
GITHUB_DESIGN_RULES   = (same)
GITHUB_DEPLOYED_SAFETY= (same)
```
