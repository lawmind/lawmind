# SHIP S4-T0.2 — runtime, CI and deployed-target reconciliation

**SHIP, 18 September 2026.** A narrow continuation of S4-T0.1, which remains
accepted and is not redone here. T0.1 repaired stale *authority* — roadmap,
topology, registry. This round repairs a second class of drift it did not cover:
**what is actually deployed, what CI targets, and where things are hosted.**

Docs, CI configuration and probe tooling only. No product behaviour, database,
corpus, cloud resource or spend.

```text
HEAD_START = 7630c275be791e4d03935ec633923ecf6ec8c24b
HEAD_FINAL = 444af1a144aae8386a9cb7e81173253fbd9ded00   (content head; the commit after it changes only this file,
             because a commit cannot name itself — see git log)
COMMITS    = 444af1a144aae8386a9cb7e81173253fbd9ded00  ci(ship-s4-t0-2): CI runs on push, and no probe invents a deployment
             (next)  records this SHA in this file only
```

## Re-anchor (start)

```text
ORIGIN_MAIN_START = 7630c275be791e4d03935ec633923ecf6ec8c24b  (== HEAD_START)
STAGED            = 0 files
TRACKED_DIRT      = other sessions' work, left untouched (3,213 porcelain lines
                    including untracked; .agents/**, services/ingest/.checkpoints/**,
                    docs/ai/new1-*, docs/ai/new2-*, and one file this round also
                    had to edit — see "Foreign dirt" below)
LEASES            = GIT_COMMIT RELEASED · MIGRATION_SLOT RELEASED · HEAVY_BOX RELEASED
LANE_BINDING      = SHIP
```

**Foreign dirt.** `docs/TECHNICAL_INVENTORY.md` carries one uncommitted hunk from
another session (an e-SCR / SCI row, line ~436), and this round also had to edit
that file. It was **not** swept in: the worktree keeps both changes, and the
commit is staged from a blob built as `HEAD + this round's hunks only`, so the
other session's line stays its to commit. `.ai/09-project.md` is dirty for the
same reason but needed no edit this round and was not touched.

---

## REPO_VISIBILITY / GITHUB_ACTIONS_COST_ASSUMPTION / CI_TRIGGER_STATE

```text
REPOSITORY_VISIBILITY = PUBLIC
```

VERIFIED, not assumed: `gh repo view --json visibility,isPrivate` returned
`{"isPrivate":false,"nameWithOwner":"lawmind/lawmind","visibility":"PUBLIC"}`.

`.github/workflows/ci.yml` opened with a block explaining that CI does not run on
push because "this is a private repo on the free tier: 2,000 Actions minutes a
month". Both halves were false. GitHub's current billing documentation
(`docs.github.com/en/billing/concepts/product-billing/github-actions`, read
18 Sep 2026) states: *"The use of standard GitHub-hosted runners is free: In
public repositories"*, and separately that *"Larger runners are always charged
for, even when used by public repositories"*.

```text
GITHUB_ACTIONS_COST_ASSUMPTION = standard GitHub-hosted runners are FREE for public
                                 repositories; larger/premium runners are billed
                                 regardless. Every job pins ubuntu-latest and none
                                 selects a larger runner. No paid runner created.
CI_TRIGGER_STATE_BEFORE        = pull_request · workflow_dispatch
CI_TRIGGER_STATE_AFTER         = push (branches: [main]) · pull_request · workflow_dispatch
CONCURRENCY                    = unchanged (one run per ref, cancel-in-progress)
PATH_FILTERS                   = none added; the jobs are cheap, and a path filter
                                 that guesses wrong is a gate that silently stops
```

The cost of NOT running CI is measurable: `gh run list` shows the last workflow
run on **7 Aug 2026**. In the six weeks since, `pnpm format` drifted red across
hundreds of files with nothing to say so (see PRETTIER_BASELINE).

Also added to the `server checks` job: `bash scripts/lane-bus.test.sh`, which ran
only in `ci:local` — the same "a gate nobody runs is not a gate" gap.

---

## CURRENT_PRODUCTION / CURRENT_PERSISTENT_BETA / CURRENT_HOSTING_PROVIDER

```text
CURRENT_PRODUCTION       = NONE
CURRENT_PERSISTENT_BETA  = NONE
CURRENT_HOSTING_PROVIDER = NOT_YET_SELECTED
PERSISTENT_BETA_PROVIDER = UNDECIDED
PRODUCTION_PROVIDER      = UNDECIDED
RAILWAY_PRODUCTION       = HISTORICAL / RETIRED
GATE_C_DO                = DESTROYED_VERIFIED
FULL_HNSW                = DOES_NOT_EXIST   (HNSW = DEFERRED_HIGH_MEMORY_OFFLOAD)
PUBLIC_SEMANTIC          = DISABLED
```

Carried from `docs/CURRENT_STATE.md` §11 and the Gate-C destruction receipt
(`6b1355eb`); not re-measured here.

---

## RETIRED_RAILWAY_PROBE_DEFAULT_REMOVED / DEPLOYED_PROBE_TARGET_POLICY

```text
RETIRED_RAILWAY_PROBE_DEFAULT_REMOVED = YES
PROBE_BASE_URL                        = REQUIRED_FOR_DEPLOYED_PROBE
RETIRED_DEPLOYMENT_DEFAULTS           = 0
```

Both probe CLIs carried
`const DEFAULT_BASE_URL = 'https://api-production-1c0b4.up.railway.app'` and
`process.env['PROBE_BASE_URL'] ?? DEFAULT_BASE_URL`. That origin is retired, so an
unconfigured probe produced a confident verdict about a host nobody deployed to —
in language that reads like a verdict about LawMind.

New module `services/harness/src/probe-target.ts` owns the one resolution and the
one refusal. It refuses all four ways a probe could guess: a historical production
origin, localhost, a neighbouring variable such as `AUTH_BASE_URL`, and a
hard-coded alpha. It also refuses an *explicitly* supplied retired origin, on the
same rule and for the same reason as `RETIRED_API_HOSTS` in
`apps/mobile/src/api/client.ts`.

```text
EXIT 0  = probe passed
EXIT 1  = probe failed          (assertions UNCHANGED — nothing weakened)
EXIT 78 = NO_DEPLOYED_TARGET    (EX_CONFIG; the probe DID NOT RUN)
```

78 rather than 1, deliberately: a missing deployment is not a safety failure, and
a caller that cannot tell them apart will eventually report one as the other.

**Observed behaviour**

| case | observed |
|---|---|
| no `PROBE_BASE_URL` | `NO_DEPLOYED_TARGET: PROBE_BASE_URL is not set` then `CITATION-SAFETY PROBE NOT RUN — NOT_RUN_NO_DEPLOYED_TARGET`, exit 78 |
| `PROBE_BASE_URL=http://127.0.0.1:1` | probe RAN: `target http://127.0.0.1:1`, cases graded, `request failed: fetch failed` |
| `PROBE_BASE_URL=https://api-production-1c0b4.up.railway.app` | refused: "a RETIRED deployment origin. Whatever it answers is not a fact about LawMind." |

**Regression tests** — `services/harness/src/probe-target.test.ts`, 10 cases,
10 pass. They cover the four required proofs (no default exists · a missing
variable refuses · an explicit URL runs · the retired origin is not an active
default) plus empty/whitespace, non-absolute and non-http values, and that neither
CLI reads `AUTH_BASE_URL`.

**Proven non-vacuous.** The same test file was run against `HEAD:` copies of the
two CLIs: 8 pass, **2 fail** — exactly the two source-reading cases. Three of the
four required proofs read the CLI *source* on purpose: the defect was a constant,
and a behavioural test of a refusal does not notice a constant reappearing beside
it.

### CI shape before a persistent beta exists

The probe left the `server checks` job and became its own `deployed safety` job,
gated on the repository/environment variable `PROBE_BASE_URL`:

- variable set → checkout, install, `pnpm citation-safety-probe`;
- variable unset → one step that writes `DEPLOYED_SAFETY=NOT_RUN_NO_DEPLOYED_TARGET`
  to `$GITHUB_STEP_SUMMARY` and says in the log that this is **neither a pass nor a
  failure**.

Repository CI therefore still passes on static checks, migrations, unit tests,
authority check, design rules, bus tests and scratch-DB checks without a
deployment existing. SHIP S4-R1 sets the variable when the persistent beta exists,
and the probe becomes a deployment-acceptance gate again, unchanged.

---

## LOCAL_CI_DEPLOYED_PROBE_POLICY

`scripts/ci-local.mjs` treated the deployed probe as an ordinary step in `STEPS`,
with a comment naming the Railway origin as its current target. Both probes moved
into a separate `DEPLOYED_STEPS` list, built only when `PROBE_BASE_URL` is set,
with their own result array and their own verdict. The run now ends with two
lines, never one:

```text
REPOSITORY_CI   = PASS|FAIL
DEPLOYED_SAFETY = PASS|FAIL|NOT_RUN_NO_DEPLOYED_TARGET
```

**Observed**, `pnpm ci:local` on this workstation with `PROBE_BASE_URL` and
`CORPUS_DATABASE_URL` unset:

```text
deployed safety      NOT_RUN_NO_DEPLOYED_TARGET — PROBE_BASE_URL is not set.
...
  FAIL lint

REPOSITORY_CI   = FAIL
DEPLOYED_SAFETY = NOT_RUN_NO_DEPLOYED_TARGET
```

The `FAIL` is the pre-existing lint debt recorded below, not this round's work,
and it is the honest reading: a skipped deployed probe is not green.

---

## PRETTIER_BASELINE / ESLINT_BASELINE / CI_TOOLING_BASELINE

T0.1 reported three trivial tooling defects. All three reproduced before mutation,
and all three are fixed minimally — no refactor:

| reported | reproduced | fix |
|---|---|---|
| `package.json` fails Prettier | yes — and the ONLY difference was CRLF line endings (prettier's `endOfLine` default is `lf`) | converted to LF; `prettier --check package.json` now says "All matched files use Prettier code style!" |
| `scripts/lane-lease.mjs` unused import | yes — `'STALE_AFTER_MS' is defined but never used` | removed from the import list only |
| `scripts/resource-lease.mjs` unused import | yes — `'inspectPid' is defined but never used` | removed from the import list only |

`npx eslint scripts/lane-lease.mjs scripts/resource-lease.mjs` is now clean.

**Three unrelated pre-existing failures were then found, and are recorded rather
than fixed**, per this round's instruction not to loop on arbitrary application
code. All were measured at `HEAD` in a clean tree (`git archive HEAD | tar -x`
into a scratch directory), not in the shared worktree, because the worktree
carries three other sessions' files.

```text
PRETTIER_BASELINE  = RED at HEAD, pre-existing
                     479 files fail `prettier --check`
                       - 31 fail on CRLF line endings ALONE
                       - 448 differ in content (mostly line width over 100)
                       - by kind: 350 .ts/.js, 129 .json, of which 107 are
                         services/ingest/.checkpoints/** (live runtime state the
                         ingest fleet rewrites) and 18 are hash-named
                         services/harness/.generated-cache/**
                     plus 4 HARD PARSE ERRORS: four
                     services/harness/.generated-cache/*.json files hold
                     markdown-fenced text under a .json extension, so prettier
                     cannot parse them at all.
                     This round's own files are clean and add nothing to it.

ESLINT_BASELINE    = RED at HEAD, pre-existing
                     4,650 problems across 287 files, dominated by vendored capture
                     fixtures (services/api/src/court/__fixtures__/ecourts-*.js:
                     774 + 774 + 436 + 85 + 49 + 30 errors) and by untracked scratch
                     files under .scratch/** and services/ingest/.n2c-*.mjs.
                     After this round: 4,648 (the two lease imports).

TYPECHECK_BASELINE = RED at HEAD, pre-existing
                     `pnpm --filter @lawmind/harness typecheck` reports 8 errors in
                     post-migration.ts, retrieval.ts, tranche-reach-delta-cli.mts and
                     v31-freeze-cli.ts. None of those files is touched by this round,
                     and none of this round's new files appears in the error list.

CI_TOOLING_BASELINE = NOT GREEN — bounded, unrelated, pre-existing, proven above.
                      The three defects T0.1 named are fixed. Restoring the rest
                      means reformatting 448 source files and repairing a vendored
                      fixture set: neither this round's scope, nor a safe thing to
                      do in a worktree three other sessions are writing to.
```

Green in this round, and observed:

```text
pnpm authority:check                                  PASS 73/73  (was 61/61)
node --test scripts/lawmind-authority-check.test.mjs  18 pass, 0 fail (10 new)
bash scripts/lane-bus.test.sh                         22 passed, 0 failed
node --test scripts/lease-liveness.test.mjs           8 pass, 1 skipped (pre-existing), 0 fail
npx tsx --test services/harness/src/probe-target.test.ts   10 pass, 0 fail
node --check on every edited .mjs; the workflow parses as YAML   OK
```

---

## CLAUDE_HOSTING_TRUTH / AGENTS_HOSTING_TRUTH / PRODUCT_BRIEF_HOSTING_TRUTH

All three said the API and Postgres run on Railway. The correction separates two
questions that had been collapsed into one line:

- **Technology** — Expo, Hono, Postgres 16 + pgvector, Drizzle, better-auth,
  Resend, R2, OpenRouter, Sentry, PostHog, Expo push. Current and unchanged.
- **Hosting provider** — open. Railway production retired, the Gate-C DigitalOcean
  host destroyed, persistent-beta and production providers undecided.

```text
CLAUDE_HOSTING_TRUTH        = CORRECTED  (§4 now separates technology from provider
                                          and prints the provider state)
AGENTS_HOSTING_TRUTH        = CORRECTED  (## Stack)
PRODUCT_BRIEF_HOSTING_TRUTH = CORRECTED  (## Where it runs)
PER_TURN_HOOK               = CORRECTED  (.claude/hooks/reanchor.sh "Stack fixed"
                                          line, injected into every turn)
CURRENT_STATE               = §11 extended with CURRENT_HOSTING_PROVIDER, the
                                          provider state, FULL_HNSW, PUBLIC_SEMANTIC,
                                          REPOSITORY_VISIBILITY and the probe policy
```

No provider is substituted. SHIP S4-R0 must compare providers without the
bootstrap having already answered — a file that names one as "the stack"
pre-answers the comparison for every agent who reads it. **No Railway deployment
history is removed.**

---

## DEPLOYMENT_MD_STATUS / TECHNICAL_INVENTORY_STATUS

```text
DEPLOYMENT_MD_STATUS = BANNERED, body untouched (+30 lines at the top)
```

`DEPLOYMENT.md` now opens with **HISTORICAL RAILWAY DEPLOYMENT RUNBOOK / NOT
CURRENT DEPLOYMENT AUTHORITY**, the current environment block, and the pointer to
`docs/CURRENT_STATE.md` §11, roadmap v7.4, and the future S4-R0/R1 artifacts. It
states explicitly that **no command in the document is authorization to recreate
Railway infrastructure or to spend money**. Not renamed: several documents point
at `DEPLOYMENT.md` by name, and a broken reference is worse than a stale title.

```text
TECHNICAL_INVENTORY_STATUS = HEADER + CURRENT DELTA added; body preserved
```

`docs/TECHNICAL_INVENTORY.md` gets the "THIS FILE CONTAINS DATED/HISTORICAL
IMPLEMENTATION INVENTORY" header, the compact current delta
(`CURRENT_PRODUCTION`, `CURRENT_PERSISTENT_BETA`, `CURRENT_HOSTING_PROVIDER`,
`CURRENT_COARSE_EMBEDDING`, `CURRENT_FULL_HNSW = NONE`,
`HNSW = DEFERRED_HIGH_MEMORY_OFFLOAD`, `PUBLIC_SEMANTIC = DISABLED`,
`GATE_C_REMOTE` historical and destroyed, `CURRENT_CAPABILITY_REGISTRY`), and the
pointer to `docs/CURRENT_STATE.md`.

Six section headings **presented themselves as current** rather than as dated
measurements: `## 9 · INFRASTRUCTURE`, `## 11 · CURRENT STATUS`, `### Current
architecture`, `### Current data flow (… as actually deployed today)`, `### Current
retrieval pipeline` and `### Current citation/evidence pipeline`. Each now carries
a one-line dated marker directly beneath it. The heading text itself is unchanged
so no anchor link breaks, and **no historical measurement is rewritten**.

---

## CAPABILITY_REGISTRY_REVISION / API_CONTRACT_REVISION

`docs/CURRENT_STATE.md` §4 now states both domains separately, and says why:

```text
CAPABILITY_REGISTRY_REVISION = R17
CAPABILITY_REGISTRY_FILE     = docs/product/V1_CAPABILITY_REGISTRY_R17.json
API_CONTRACT_REVISION        = R17
API_WIRE_PROTOCOL_VERSION    = 1
API_CONTRACT_FILE            = docs/product/RCC_V1_API_CONTRACT_R17_AMENDMENT.md
```

> These are independent revision domains; the matching number is coincidental.

`CURRENT_CAPABILITY_REGISTRY` is kept as an alias line, because tooling reads that
key. The wire integer is a third thing again and is **1** — the only value that has
ever existed (`contractRevisionVsWireVersion` in the contract ledger).

**Observed and deliberately NOT changed.** Inside `V1_CAPABILITY_REGISTRY_R17.json`
the metadata fields `contractRevision` and `contractArtifact` still read `R16` and
`RCC_V1_API_CONTRACT_R16_AMENDMENT.md`, and every capability row reads
`currentContractVersion: "R16"`, while the contract ledger — which owns contract
identity — says `currentVersion = R17`. R17 moved only the web platform row, so
those fields were inherited rather than re-stated. Whether they are stale, or are
deliberately pinned to the revision each row was last MEASURED against, is a
question about their defined semantics; changing them is a contract action under
roadmap v7.4 §3.7, not a documentation repair. Recorded in `CURRENT_STATE.md` §4
and left for SHIP to decide through a CCR.

---

## PLAY_PACKAGE_REGISTRATION_WORDING

```text
PLAY_PACKAGE_REGISTRATION_STATUS = UNKNOWN_PENDING_CONSOLE_CHECK
```

The founder queue said "`PLAY_APP_REGISTERED` has a 30 Sep 2026 deadline", which
reads as "LawMind must already be published on Play by then". Google's current
documentation, read 18 Sep 2026, says something narrower:

- *"Effective September 30, 2026, all Play packages must be registered… Apps not
  registered by Sep 30, 2026 will be removed from Play"* —
  [Registering Play package names](https://support.google.com/googleplay/android-developer/answer/16984799);
- *"Google will attempt to auto-register both existing and new Play apps"*, and
  where auto-registration succeeds *"no further registration action is required"*;
- apps created in Play Console from 30 March 2026 onward auto-register their
  package name at creation —
  [Register on Google Play Console](https://developer.android.com/developer-verification/guides/google-play-console).

The consequence attaches to a package **distributed on Play**. LawMind's console
state has never been observed (no console access from this workstation), so this
repository does **not** assert that the removal risk applies to `co.lawmind.app`.
The founder action is to **VERIFY** account, app and package state — not
necessarily to publish before 30 Sep 2026. Corrected in `docs/FOUNDER_QUEUE.md`
(with sources), `docs/product/STORE_RELEASE_CHECKLIST_V1.md` and
`docs/CURRENT_STATE.md` §9.

---

## AUTHORITY_LINT_EXTENSION

`scripts/lawmind-authority-check.mjs`, 61 → **73** checks, all PASS. The first
version caught a stale roadmap and a stale lane topology and missed a stale
deployment.

Added, and firing only in ACTIVE regions exactly like every existing rule:

```text
stale-claim patterns   "Hono (API) on Railway" · "Railway Postgres" · "Railway cron"
                       · "current production ... Railway" (both orders)
                       · PRODUCTION|PERSISTENT_BETA = a non-NONE railway/DO value

probe-target checks    for services/harness/src/deployed-safety-cli.ts,
                       deployed-judgment-safety-cli.ts and scripts/ci-local.mjs:
                         - no DEFAULT_BASE_URL, and no PROBE_BASE_URL ?? fallback
                         - no retired production origin in ACTIVE CODE
                       and for .github/workflows/ci.yml: no hard-coded target, and
                       the deployed probe is gated on PROBE_BASE_URL

CURRENT_STATE checks   states PRODUCTION, PERSISTENT_BETA, CURRENT_HOSTING_PROVIDER
                       - neither names a retired or destroyed provider as live
                       - separates the two R17 revision domains
```

Comments and block comments are stripped before the probe scan, so
`probe-target.ts`'s deliberate denylist entry and every explanatory comment stay
legal. `pnpm authority:check` still never scans history.

**Negative tests**: `scripts/lawmind-authority-check.test.mjs`, 8 → **18** cases,
18 pass. Eight new cases that must FAIL (Railway as the current API host · Railway
Postgres/cron · CURRENT_STATE claiming a live retired-provider deployment ·
CURRENT_STATE dropping the deployment state · CURRENT_STATE collapsing the two R17
domains · a probe reintroducing DEFAULT_BASE_URL · a probe falling back from
PROBE_BASE_URL · the retired origin returning to active probe code), and two that
must NOT fail (the retired origin named in a comment; Railway deployment history in
`DEPLOYMENT.md` and in a `docs/ai/**` round, plus a current file saying
`RAILWAY_PRODUCTION = HISTORICAL / RETIRED`).

---

## CI comments and names

```text
JOB_RENAMED = "server lane" -> "server checks". Display name only: no required
              status check is configured and no branch protection is enabled, so
              nothing depends on the old string.
OWNERSHIP   = .github/CODEOWNERS rewritten from "LCC (server) and RCC (client)" to
              SHIP/DATA path ownership per roadmap v7.4 §2.
COMMENTS    = "apps/** is RCC's lane" and "the scope is shared across both lanes"
              replaced with neutral technical wording.
PRESERVED   = the historical bug anecdotes that happen to name RCC/LCC (the
              contract-status comment, the design-rules comment). They describe
              what happened, not who owns anything now.
```

`.github/CODEOWNERS` also corrected a second stale fact: its note that branch
protection "needs GitHub Pro" was true of a PRIVATE repository. On a public
repository, protected branches and rulesets are available on the free plan.
**Nothing was enabled** — that is a settings action, and it belongs to the founder
rather than to this round.

---

## Boundary

```text
PRODUCT_BEHAVIOR_CHANGED = NO
DB_CHANGED               = NO
CLOUD_CHANGED            = NO
PAID_RESOURCE_CREATED    = NO
CORPUS / EMBEDDINGS / CITATION GRAPH / ECOURTS / MOBILE APP  = untouched
GATE_C ACCEPTANCE · R17 CAPABILITY STATES · R17 API CONTRACT · R16 REGISTRY = unchanged
AUTH BEHAVIOUR · EXTERNAL-DELETE IMPLEMENTATION · SCHEMA / MIGRATIONS = unchanged
```

The only executable behaviour that changed is the two deployed probes' TARGET
resolution and the two pipelines that invoke them. **No probe assertion was
weakened**: `deployed-safety.ts` and `deployed-judgment-safety.ts` are untouched.

## UNKNOWN

- Whether GitHub Actions actually runs green on `push`. It cannot be observed until
  this lands, and `pnpm format`, `pnpm lint` and the harness `typecheck` are red at
  HEAD for pre-existing reasons, so the `server checks` job is expected RED on its
  first run. That is the honest state rather than a regression: it has been true,
  and unobserved, since 7 Aug 2026.
- Play Console account, app and package state: never observed.
- Whether the R17 registry's `contractRevision` and `currentContractVersion` fields
  are stale or deliberately pinned.
- `CURRENT_COARSE_EMBEDDING` is carried from the last accepted DATA/NEW1 receipt,
  not re-measured this round.
- Whether any tool other than `lawmind-authority-check.mjs` reads
  `CURRENT_CAPABILITY_REGISTRY` by that exact key. The alias line is kept rather
  than risk finding out the hard way.

## CORRECTIONS

- My first `prettier --check` reading was taken in the shared worktree, which
  carries three other sessions' files. Every number above was re-measured at `HEAD`
  in a clean `git archive` tree first.
- My first attempt to split the 479 prettier failures wrote each normalised file to
  a `.__norm` sibling; prettier cannot infer a parser from that extension, so every
  file "failed" and the split read 0 / 479. Redone through prettier's Node API,
  which gives 31 / 448.
- The first version of the new CURRENT_STATE checks built its pattern with
  `new RegExp` inside a template literal. There, a backslash-s is an identity
  escape, so the pattern silently became `^s*` and all three lookups returned
  `null` while the code read as though it worked. Replaced with a line scan, and a
  comment saying why.
- `prettier --write` on `scripts/ci-local.mjs` reformatted the whole file (it was
  not prettier-clean, and `scripts/**` is not in the format gate's glob), turning a
  114-line change into 455. Reverted and re-applied byte-preserving, including its
  CRLF line endings.

## NOT_DONE

- The 448-file prettier content debt, the 4 unparseable `.generated-cache/*.json`
  files, the 4,648 eslint problems and the 8 harness typecheck errors. Measured and
  recorded; not fixed. They need their own round and a quiet worktree.
- `.prettierignore` was NOT extended to exclude `services/ingest/.checkpoints/**`
  (live runtime state) or the hash-named `services/harness/.generated-cache/**`,
  although neither plainly belongs in a format gate. Narrowing a gate's scope is a
  governance decision rather than a documentation repair, and it would not have made
  the gate green anyway.
- No branch protection, required status check or repository variable was configured.
  `PROBE_BASE_URL` is deliberately unset; S4-R1 sets it.
- No deployed environment was created to make the probe green.

---

## Acceptance

```text
ACTIVE_HOSTING_CONTRADICTIONS            = 0
RETIRED_DEPLOYMENT_DEFAULTS              = 0
REPOSITORY_CI_BASELINE                   = PASS (this round's scope; see the
                                                 baselines above for the bounded,
                                                 pre-existing repo-wide debt)
DEPLOYED_SAFETY                          = NOT_RUN_NO_DEPLOYED_TARGET
AUTHORITY_CHECK                          = PASS
HISTORICAL_DEPLOYMENT_EVIDENCE_REWRITTEN = NO
```

SHIP_S4_T0_2_RUNTIME_CI_RECONCILIATION = PASS

---

## Addendum — the first push-triggered run, observed

The trigger change was verified against GitHub rather than asserted. Pushing
`444af1a1` / `85f342c4` queued run `35305042663` within seconds — the first
workflow run on this repository since **7 Aug 2026** — which also validates the
workflow syntax, since GitHub parses the file before it queues anything.

```text
design rules                                  success
deployed safety                               success — step "No deployed target" ran,
                                              every other step skipped, 5s
server checks                                 FAILURE at `node scripts/check-alert-coverage.mjs`
```

**The failure is pre-existing and unrelated.** `check-alert-coverage.mjs` exits 1
against `HEAD_START` (`7630c275`) in a clean `git archive` tree, before any change
in this round: PD-5 and PD-6 promise four alert kinds and `alert_kind` holds two,
so the app persists switches for notifications the system cannot produce. That is
the defect the guard was written to find, and `scripts/ci-local.mjs` has said so
in a comment since 11 Aug 2026 ("added knowing `ci:local` goes red"). Turning CI
back on did not break it; it made it visible for the first time in six weeks.
Every step after it was skipped, so `pnpm lint` / `pnpm format` / typecheck have
still not been observed on a runner — they are red locally and expected red there.

**One correction made after watching the run.** The `deployed safety` job reported
a green tick while doing nothing, which is exactly the misreading the job exists
to prevent — the machine-readable reason was in the log and the step summary, but
the run list showed a checkmark. The job's DISPLAY NAME now carries the state:

```yaml
name: ${{ vars.PROBE_BASE_URL != '' && 'deployed safety' || 'deployed safety (NOT_RUN_NO_DEPLOYED_TARGET)' }}
```

so the run summary says `NOT_RUN_NO_DEPLOYED_TARGET` without anyone opening a log,
and says plain `deployed safety` once S4-R1 sets the variable.
