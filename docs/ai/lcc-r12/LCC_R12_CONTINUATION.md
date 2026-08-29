# LCC R12 → R12b CONTINUATION PROMPT

Paste everything below the line into a fresh session. It is written to be
self-sufficient: it assumes the reader has seen none of R12.

---

You are LCC. Continue **R12b** — finish the eCourts half of R12 and close the
round. R12 landed §0–§9, §15, §16 and §17; **§10–§14 are open and all block on
one artifact.**

## 0. BIND AND ORIENT FIRST

```
echo LCC > .agents/bus/.lane-<YOUR_SESSION_ID>
pnpm lane:inbox
```

Read, in this order:

1. `CLAUDE.md` §6a — the eCourts authorization. **SETTLED. Do not reopen.**
2. `docs/ai/lcc-r12/LCC_R12_TODO.md` — the live checklist, `[x]` = verified.
3. `docs/ai/lcc-r12/ECOURTS_OFFLINE_REQUEST_DIFF.md` — **the single most
   important document for your work.** It contains the request blueprint and
   names exactly what is missing.
4. `docs/ai/lcc-r12/ecourts-coverage-ledger.json` — current operational truth.
5. `docs/CURRENT_PLAN.md`, `docs/FOUNDER_QUEUE.md`.

**HEAD when R12 ended: `6d635b3`.** R12's seven commits are
`d96147e 110bc7f 49e2dfc 7b570b7 f2a14b5 daffb51 6d635b3`. Verify they are
ancestors before mutating anything.

## 1. STATE OF THE WORLD — read this before deciding anything

### The CAPTCHA blocker was invented and is WITHDRAWN

R11 claimed the grant permitted a CAPTCHA bypass without specifying one, invented
`CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED`, and asked the registrar for a
mechanism. **No document ever required that.** `CLAUDE.md` §6a states three
mechanical conditions and no more: grant non-null and unexpired; code only in
`services/api/src/court/ecourts.ts`; every request ledgered and rate-limited.

- `FQ-ECOURTS-CAPTCHA` is **WITHDRAWN**. Do not re-raise it.
- `CAPTCHA_AUTHORIZATION` = governed exclusively by §6a. **AUTHORIZATION_REOPENED = no.**
- `CAPTCHA_IMPLEMENTATION` = an engineering problem, ours.
- `USER_MONITORING_PRODUCT` = `DISABLED_NOT_READY` regardless.

### The kill switch is ON, and R11's summary says otherwise

`platform_config.ecourts_harvest = true`, flipped 29 Aug 17:33 through the
audited path. **66 real requests were spent on 29 August.** R11's round document
says the switch was turned back OFF. It was not. Check the ledger, never the
prose.

### THE ONE THING BLOCKING §10–§14

**`/ecourtindia_v6/js/searchByCauselist.js` was never retained.**

The retained page (`services/api/src/court/__fixtures__/ecourts-cause-list-module-index-2026-08-29.html`,
75,405 bytes) is the licensed interface FORM. It contains only three inlined
functions — `callbackLang`, `fillLangState`, `funselectLang` — and **none of them
builds a cause-list request.** `fillDistrict`, `fillcomplex`, `fillCauseList`,
`submitCauseList` and the token rotation all live in that external script.

So R12's §8 instruction — *"execute those functions OFFLINE in a sandbox with a
recording transport"* — **is not executable against what this repository holds.**

**Your first move is to retain that script.** It is:
- inside the licensed interface, squarely within the enumerated `permittedDataTypes`;
- one GET of a static asset;
- one slot out of 1,000 daily;
- and it converts every `TRANSCRIBED` row in the diff table into `BYTES`.

Do it through `guardedRequest` so it is ledgered, rate-limited and attributed
like anything else. Count it as **diagnostic request #1 of the permitted three.**

### What is already reconciled, so you do not redo it

From the offline blueprint — every one of these already MATCHES the official
client and needs no further work:

| field | value |
| --- | --- |
| method / URL shape | POST to `?p=<module>/<action>` off `/ecourtindia_v6` |
| district / complex actions | `casestatus/fillDistrict`, `casestatus/fillcomplex` |
| content type | `application/x-www-form-urlencoded; charset=UTF-8` |
| `ajax_req=true` | appended to every body |
| `app_token` | in the body, rotated from every reply onto `session.appToken` |
| `X-Requested-With` | `XMLHttpRequest` |
| `delimeter` / `Kjweuru253` | `jkhfkjhkjert33` — **this pair fixed the `Invalid Request`**, not User-Agent |
| `Referer` | `${ECOURTS_BASE}/?p=cause_list/index` |
| cookies | `session.cookieHeader` on every request |
| CAPTCHA field | `cause_list_captcha_code` |

**Two deliberate differences, neither a defect:** `Origin` is not sent (browser
generated); `User-Agent` is `LawMind/1.0 (+authorised eCourts access; legal
research)` and deliberately not a browser string.

**The trap in the form:** `sess_dist_code`, `court_complex_code` and
`court_est_code` are selects with an **`id` and NO `name`**. A form serialiser
omits all three. The official client reads them by id and posts its own parameter
names — which is why `ecourts.ts` builds bodies explicitly.

### Attribution moved, and you must not move it back

`x-lawmind-attribution` carries the audited attribution on every request;
`User-Agent` identifies the client. The record binds attribution *presence*, not
its channel (§6a: *"not a phrase the grant requires us to quote verbatim"*).

**There are TWO fetch sites in `ecourts.ts`.** `guardedRequest` calls itself "The
ONE network path" and the load-bearing word is *below* — `fetchCauseList`
predates it and calls `fetch` directly. The first version of the R12 change
updated only one, leaving the other sending **no attribution at all**, and
nothing errored. Both are fixed. `attribution-transport.test.ts` asserts on the
bytes; the property is bound into the network-safety matrix as
`ATTRIBUTION_ON_EVERY_PERMITTED_REQUEST`.

**Never print the attribution value.** The test compares SHA-256 digests
precisely so a failing assertion cannot leak the grant string into CI output.

### The observation writer EXISTS

NEW3 listed "build observation writer" as a next requirement. It is wrong.
`services/api/src/court/ecourts-observation-writer.ts` exists and has five
passing tests (refuses a batch naming no retained artifact; no ledgered request;
no case identity; a payload hash not over received bytes; writes nothing for an
empty list). **Test it against a real parsed cause list — do not rebuild it.**

## 2. YOUR TASKS, IN ORDER

### §10 — bounded live canary, MAX THREE diagnostic requests

1. **Request #1: retain `searchByCauselist.js`.** Through `guardedRequest`.
2. Execute `fillDistrict` / `fillcomplex` / `fillCauseList` / `submitCauseList`
   **offline**, with the AJAX transport replaced by a recorder that opens no
   socket. Capture method, URL, query string, content type, field names and
   order, headers, cookies, `app_token` location, `ajax_req`, Origin/Referer/
   X-Requested-With, state/district/complex/establishment and civil/criminal
   encoding.
3. Byte-diff against `ecourts.ts`. Update the diff table; flip `TRANSCRIBED` rows
   to `BYTES`.
4. **Only then** spend requests #2 and #3 on the real cause-list call. One
   request-shape change per step unless the diff proved fields form one
   inseparable protocol unit. Stop early on unexpected server behaviour.

### §11 — CAPTCHA implementation

Use the already-measured PaddleOCR pipeline (`services/api/src/court/captcha-sample-cli.ts`).
Retain per solve: confidence if available, raw OCR, normalized answer,
accepted/rejected. **Do not train on live CAPTCHA responses.** A rejected CAPTCHA
consumes one bounded retry and is never a reason to raise the request rate.

The reply is JSON, not HTML: `{status, div_captcha, case_data}`. `status: 0` =
rejected, a fresh CAPTCHA re-rendered; `status: 1` = the listing in `case_data`.
**A rejected CAPTCHA and an empty cause list arrive as the same HTTP 200** — that
field is the only thing separating them.

### §12 — first real cause-list fixture

Capture ONE served cause list. **Raw evidence first**, then freeze the network
while the parser is developed. Preserve court/source key, state, district,
complex, establishment, court/judge identity, date, civil/criminal, item/serial,
case/CNR number, parties, advocates, purpose/stage, raw linkage, `observedAt`,
parser version, source warning.

Model the court's own warning — *"Cause list displayed may differ from the actual
cause list"* — onto every observation.

**UNKNOWN stays UNKNOWN.** Empty parser ≠ no listings. Fetch failed ≠ no change.
`LISTED` ≠ `HEARING_OCCURRED` (migration 0061's CHECK makes minting the latter
impossible — leave it that way).

Beware: the page ships an inline translation dictionary containing the string
`"Record not found"`. Matching it document-wide once made a CAPTCHA form parse as
a court that had published nothing. Both the empty marker and the row scan must
read from the results container only, with scripts stripped.

### §13 — observation writer

Test the existing writer with the real fixture. Require append-only, raw artifact
linkage, source key, `observedAt`, `OBSERVATION_STRATEGY`, normalized payload,
parser version, uncertainty metadata, and idempotency on reprocessing the same
raw artifact. No duplicate logical observation.

### §14 — canary → retention → daily pilot

`CANARY PASS` = authorized fetch + raw retained + parser success + ≥1 observation
written + zero unattributed requests.

Then the retention probe, **one source only**, dates T, T-1, T-7, T-30, T-90,
T-365. Classify **only interpretable successful responses** as `EPHEMERAL` /
`SHORT_RETENTION` / `HISTORICAL_RETRIEVABLE` / `SOURCE_DEPENDENT`. A failed
request, a CAPTCHA rejection or a parser refusal **proves nothing** about
historical absence.

If one source works, **do not explode into all-court harvesting.** Register ONE
daily pilot source through the existing scheduler (`services/api/src/court/pilot.ts`).

### §16 remainder — off-machine upload

The curated pack is **proven restorable** (`docs/ai/lcc-r12/moat-backup-restore-proof.txt`:
every row count matched, content checksum MATCH, 567 s restore). R2 credentials
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) are
present in `.env`. **The encrypted upload + readback was NOT performed.** Do it —
the pack is ~2.5 GB. `scripts/migration/backup-r2.mjs` exists; check it first.

### §18 — full verification

Not run at full breadth. Do:
- migration journal · live vs committed schema · a fresh-install proof
- API typecheck · ingest typecheck where touched
- court/eCourts suites · search battery · workspace/tenant · data-trust contract
- **`platform_config` fingerprint BEFORE and AFTER**, proving no test-created
  production mutation survived. Use `.scratch/lcc-r12/config-fingerprint.mjs`
  (`node .scratch/lcc-r12/config-fingerprint.mjs before|after`). It compares
  state, not a fixed expectation — asserting "harvest is off" would go red for
  the founder's decision to turn it on.
- Full API suite once from final HEAD, **bounded concurrency**, without stopping
  NEW1.

## 3. HARD CONSTRAINTS

**NEW1 and NEW2 workers must keep running.** At R12's end: `HEAVY_BOX` HELD by
NEW1, `HEALTHY_BY_PROGRESS`, `new1_doc_vector_stage` at **2,855,106** and rising
(2,755,876 at round start). Six live worker processes. **Do not stop a healthy
data worker to make testing easier.**

**A lane lease reading DEAD does not mean the lane's workers are dead.** NEW1's
lane lease reads DEAD while its workers run under Task Scheduler against the
`HEAVY_BOX` resource lease. Do not "clean" it.

**Commit through the bus.** `node scripts/resource-lease.mjs acquire GIT_COMMIT
--holder LCC --session <id> --task "..."`, then stage and commit **in one call**
— a shared worktree means another lane's commit can sweep your staged files.
Never pipe the acquire (`| tail` makes `&&` gate on tail, not on the lease).

**Migrations are forward-only.** R12 nearly edited an applied 0097 to add a
trigger; the journal guard caught the intent. The fix went forward into 0098.
Highest applied: **0099**. Next: 0100.

**Do NOT:** reopen Gate A · reopen eCourts authorization · invent CAPTCHA
conditions · bulk harvest · exceed grant limits · start semantic public search ·
run citation bulk apply · stop NEW1/NEW2 · launch Tranche V2 · modify RCC app
code · change RCC's frozen contract non-additively · deploy production · add AI
generation.

## 4. TEST COMMANDS THAT WORK ON THIS BOX

```
# .env has values with spaces; `. ./.env` silently drops them. Use --env-file.
npx tsx --env-file=.env --test services/api/src/court/*.test.ts
npx tsx --env-file=.env scripts/lcc-ecourts-network-safety.mts --out docs/ai/lcc-r12/ecourts-network-safety.json
cd services/api && npx tsc --noEmit -p tsconfig.json
node scripts/check-migration-journal.mjs
node scripts/check-schema-truth.mjs
```

`psql` is not on PATH; binaries live at `C:/lawmind/pgsql/pgsql/bin`. Use
`.scratch/lcc-r12/q.mjs "<sql>"` for ad-hoc queries.

The search battery harness is `.scratch/lcc-r12/ab-run.mts`
(`BATTERY_OUT=... BATTERY_LABEL=... npx tsx .scratch/lcc-r12/ab-run.mts`).

## 5. TWO METHOD LESSONS R12 PAID FOR

**An inlined `EXPLAIN` is not evidence.** A hand-written `EXPLAIN (ANALYZE)` with
`to_tsquery('english','bail')` as a literal showed 18.204 ms and justified an
admission bound. The real query builds its tsquery inside a CTE, so the planner
cannot see it — it BitmapAnd'd 4,518,732 postings against the date index to
answer a 54-document window: **10,799 ms**. The fix was a `MATERIALIZED` fence,
not the arithmetic. If you EXPLAIN anything, bind the parameters the way
production binds them.

**Frequency can measure the opposite of what it appears to.** A gate treating
corpus-common tokens as concept words was measured and rejected: `kumar` 0.44229
and `ram` 0.09759 against `anticipatori` 0.06902 and `injunct` 0.01685. Indian
personal names are frequent *because* they are party names. Predict what a signal
should look like before trusting it.

---

## APPENDIX — R12 verdicts, for the final round report

```
HEAD_BEFORE  = 831c6c28b6ec94f6368aaa30ff6b8127a4b734d6
HEAD_AFTER   = 6d635b3bc14b8774330667353595add45f6dbecc

LANE_INTEGRATION   = CLEAN (no lost branch; no stale lease)
LCC_R11_PRESENT    = yes (6b90f98 ancestor)
NEW1_R11_PRESENT   = yes (edac0de ancestor)
NEW3_R12_PRESENT   = yes (831c6c2 was HEAD)

CAPTCHA_FALSE_BLOCKER_RETRACTED = yes (FQ withdrawn; bus 1541-1545)
AUTHORIZATION_REOPENED          = no

FINAL_GATE_A_M0_RECEIPT   = docs/ai/lcc-r12/m0-gate-a-receipt.json
FINAL_M0_UPSTREAM_UNIQUE  = 18,951,606  (re-derived, not copied)
FINAL_M0_MANIFEST_SHA     = a72d98686d4d8a01006cb748a228126c4c781cd285c95745b95c25eeb5e5ac50
FINAL_M0_IDENTITY_DIGEST  = d746088bb736bf3f53da54c3a334fd45828749fac205628866d6ca58fd1f2afd
FINAL_M0_PARTITION_FOLD   = b9f414b52292794567d81961ec94096b6c5128ecaf6c4680c29f09c48a9a5653
OLDER_18947807_RECEIPT_RELABELED = yes (role PRE_GATE_SNAPSHOT, byte-identical)

VECTOR_STAGE_ROLE             = FACTORY_SCRATCH
SNAPSHOT_IDENTITY_FIX_REQUIRED = yes
SNAPSHOT_IDENTITY_ACTION       = writer-supplied; NEW1 owns it (bus 1546)

PARTY_SEARCH_AB1      = PASS  (party-only recall 3/6 -> 6/6, ranks 1-3)
FILTERED_ADMISSION_AB2 = PASS (court-month bail: refused -> 4.1 ms)
SEARCH_BATTERY        = docs/ai/lcc-r12/search-battery.json

DATA_TRUST_API        = PASS
SOURCE_EDITION        = published, NULL for 99.969% (5,830 of 18,758,460)
GRAPH_PARTIAL_COVERAGE = declaredPartial:true, 105,024 judgments = 0.56%
MONITORING_FIELDS     = six, frozen, null / never_attempted

FIRM_READY_SCHEMA  = PASS (migrations 0097-0099)
WORKSPACE_MIGRATION = 529 users -> 529 personal workspaces -> 529 members;
                      3 matters placed; 0 gaps; tenant cross-write = 23503

ECOURTS_OFFLINE_REQUEST_DIFF = RECONCILED for every field the retained bytes
                               reach; BLUEPRINT_PARTIAL (searchByCauselist.js
                               not retained)
ATTRIBUTION_TRANSPORT = SEPARATED (User-Agent | x-lawmind-attribution)
LIVE_DIAGNOSTIC_REQUESTS = 0 this round
TOTAL_REAL_REQUESTS_DAY  = 66 (all pre-R12, on 29 Aug)
RAW_ARTIFACTS            = 37 eCourts artifacts, 1,403,885 bytes

CAUSE_LIST_REAL_FIXTURE = none (0 served cause lists ever seen)
PARSER              = FIXTURE_BOUND, never run against a real result table
OBSERVATION_WRITER  = EXISTS AND PASSES (5 tests) — NEW3's note was wrong
REAL_OBSERVATIONS   = 0
CANARY              = NOT PASS

RETENTION_PROBE = UNMEASURED (HC and district)
DAILY_PILOT     = DISABLED
ECOURTS_SWITCH_FINAL = ON (enabled 29 Aug 17:33, audited, reason recorded)
USER_MONITORING_PRODUCT = DISABLED_NOT_READY

CURATED_BACKUP        = RESTORE PROVEN (every row count + content checksum)
                        official_source_artifact ADDED — 14,223 rows verified
OFF_MACHINE_VERIFIED  = no (R2 credentials present; upload not performed)

V1_EXPORT_SIZE  = 168,452,177,920 bytes (157 GiB) of a 314 GB factory DB
HOSTING_BAKEOFF = docs/ai/lcc-r12/HOSTING_BAKEOFF.md
HOSTING_SELECTED = none
HOSTING_BAKEOFF_BLOCKED_BY = no provisioned in-region instance; RTT/disk/PITR/
                             backup/support unmeasurable from this box.
                             ~$250-300 for one month, tearable down.

TESTS = query-shape 30/30 · sparse-bound 5/5 · court suite 86/86 ·
        network safety 15/15 properties, 64 tests · workspace isolation 5/5 ·
        data-trust 7/7 · vector export contract 3/3 · matters route 17/17 ·
        judgments route + treatment 20/20 · API typecheck clean
        NOT RUN: the full API suite at breadth (§18)

BLOCKERS = searchByCauselist.js unretained (blocks §10-§14);
           no in-region hosting instance (blocks Gate B selection);
           R2 upload not performed
NEXT_LCC = R12b: retain the script, execute it offline, then the bounded canary
```
