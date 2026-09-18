# FIFTH — GATE C **DELTA** verdict (LCC R33 auth fix + RCC R32 mobile retry)

> **SUPERSEDED IN ONE ROW, 18 Sep 2026** — the founder re-scoped the bearer
> requirement: cellular is no longer mandatory, and the row became
> `REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW`. That row was re-adjudicated and passes on
> evidence. **The current verdict is `docs/ai/fifth/gate-c-final/VERDICT.md`
> (`GATE_C = PASS`).** Everything else in this document stands unchanged, and
> nothing here is rewritten: cellular was never observed and did not pass.

Independent read-only falsification re-audit. This is a **delta** against FIFTH's
prior Gate-C verdict (`docs/ai/fifth/gate-c-r32b/VERDICT.md`); settled backend rows
were not re-litigated without cause. Prose from LCC and RCC was **not** treated as
evidence — every row below rests on source I read, an artifact I opened, or a probe
FIFTH issued.

```
PRIOR_VERDICT   = GATE_C = HOLD — RCC physical mobile-data evidence not delivered
                  (P0 = none; backend matrix all PASS)
AUDIT_HEAD      = 312421f46f9bc8cbad6ee37212743680df54de98
origin/main     = 312421f46f9bc8cbad6ee37212743680df54de98   (identical)
REMOTE_SHA      = a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a   (live GET /version, re-probed by FIFTH)
remote API      = https://alpha-api.lawmind.co
audited at      = 2026-09-18
```

## FINAL VERDICT

**`GATE_C = HOLD — RCC cellular bearer evidence missing`**

The auth defect is **genuinely fixed** and survives falsification, including three
attacks LCC said their own coverage did not reach. Every one of RCC's seven product
rows is **PASS on artifact evidence**, not on summary prose. The hold is now for a
single reason, and it is **not a product defect and not a lane's fault**: the SIM in
the test device carries no mobile data, so the cellular bearer row cannot be
observed on this hardware.

Smallest owning-lane corrective action — **not RCC's to solve by effort**:
> A SIM with an active mobile-data plan, in the S24, for one run. Second device-day,
> second identical reading. This is a **founder/procurement item**, not a lane task:
> `docs/FOUNDER_QUEUE.md`.

Deadline pressure stands: hard resource destruction `2026-09-19T17:57:04Z`. FIFTH
does **not** authorize teardown.

---

## DELTA A — AUTH FIX · `AUTH_FIX_REVIEW = PASS`

### Exact root cause (established independently at the diff, not accepted)

better-auth's `magicLink` plugin hands `sendMagicLink` **its own** minted `url`,
which for a bare `baseURL` is `<AUTH_BASE_URL>/api/auth/magic-link/verify`. The
pre-fix `packages/auth/src/index.ts` destructured exactly that and passed it
straight to the mailer:

```js
sendMagicLink: async ({ email, url }) => {        // ← the defect, in one word: `url`
  await config.mailer.send({ to: email, url, … });
}
```

This API mounts **no better-auth HTTP handler** — by design — so every emailed link
resolved to our own 404. `AUTH_BASE_URL` was **correctly configured**; the variable
was right and the link was dead. The magic link is the only credential in this
product, so the alpha had no reachable sign-in at all.

Confirmed still true at the deployed SHA: `GET /api/auth/magic-link/verify?token=x`
→ **404** (FIFTH, live). That path was deliberately *not* repaired by mounting
better-auth there — its `magicLinkVerify` endpoint **consumes** the token into a
browser cookie session the Expo client cannot hold, which would have looked fixed
and still been unusable.

### The repair

`sendMagicLink({ email, token })` now mints `<AUTH_BASE_URL>/auth/magic-link/open?token=…`
via `magicLinkLandingUrl`, and `GET /auth/magic-link/open` answers **302** to the
constant `lawmind://auth/verify?token=…`. Path constant and mount point are both in
`@lawmind/auth`, so the email and the route cannot drift apart again.

### Canonical verification — `AUTH_ROUTE = PASS`

| question | answer | evidence |
|---|---|---|
| Is canonical Better Auth verification still mounted and used? | **YES** | `services/api/src/auth/routes.ts:147` — `deps.auth.api.magicLinkVerify({ query: { token }, headers, asResponse: false })`. `routes.ts` is **not in the diff** `27b55fa4..a09d7ee5`; the verification path is byte-identical to the runtime FIFTH already passed. |
| Did LCC create a parallel / custom / weaker verifier? | **NO** | `services/api/src/auth/magic-link-landing.ts` imports exactly three things: `magicLinkAppUrl`, Hono's `Context` type, `fail`. No sql handle, no crypto, no token comparison, no database reach. It cannot tell a live token from a forged one and does not try. |
| Is auth route exposure limited to the intended surface? | **PASS** | `app.ts` diff is **+28 / −0** — one `app.get('/auth/magic-link/open', …)`, nothing removed, no middleware unmounted. FIFTH swept seven better-auth-shaped paths live (`/api/auth`, `/api/auth/session`, `/api/auth/sign-in/magic-link`, `/api/auth/magic-link/sign-in`, `/api/auth/magic-link/verify`, `/auth/magic-link/verify`, `/auth/session`) — **all 404**. |

### Callback / redirect constraint — `CALLBACK = PASS (closed)`

FIFTH attacked this live rather than reading the test. Every row is a real response
header from `https://alpha-api.lawmind.co`:

| attack | `Location` returned | verdict |
|---|---|---|
| `?token=…&callbackURL=https://evil.example.com/&redirect=…&newUserCallbackURL=…` | `lawmind://auth/verify?token=fifth-probe-2` | hostile params **ignored** |
| `X-Forwarded-Host: evil.example.com` + `X-Forwarded-Proto: http` + `X-Original-URL: /evil` | `lawmind://auth/verify?token=hdr-probe` | **no header influence** — closes LCC's own thin spot #2 |
| token = `a%0d%0aX-Injected:%20yes` | `lawmind://auth/verify?token=a%0D%0AX-Injected%3A%20yes`, **no `X-Injected` header present** | CRLF injection **closed** |
| token = `a&evil=x#frag` | `…?token=a%26evil%3Dx%23frag` | `&`/`#` encoded; one param, no scheme break |
| token = `../../evil?x=1` | `…?token=..%2F..%2Fevil%3Fx%3D1` | path/intent traversal encoded |
| token = 600 chars | `400 LINK_INVALID` | 512-char bound **enforced in production** |
| `?token=first&token=second` | `…?token=first` | no parameter-pollution ambiguity |
| no token | `400 LINK_INVALID` | honest refusal, app not launched |

The destination is a **constant**, not derived from the request. This is not an open
redirect and not a credential-exfiltration endpoint.

### Token material — `AUTH_TOKEN_SAFETY = PASS`

- **Not logged.** The one access-log line (`app.ts:220-223`) records `c.req.path`,
  which **excludes the query string**; the landing handler adds no log line of its
  own. A credential arriving in a URL does not reach a log aggregator.
- **Not cacheable, not referrable, not in a document.** Live headers confirm
  `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and the 302 carries
  **no body** — so the token never lands in a page a browser can restore or script.
- **Not committed.** Repo-wide scan of the new evidence
  (`docs/ai/{rcc-r31,rcc-r32,lcc-r33}/`) for `token=<8+ chars>` returns only
  `REDACTED(32)` and the deliberately fake `probe-not-a-real-token`. No live
  credential is in tracked source. RCC states it never extracted, transcribed or
  stored the token; nothing in the artifacts contradicts that.

### Invalid / replayed token behaviour — `PASS (safe)`

- FIFTH, live: `POST /auth/verify {"token":"fifth-invalid-token-not-real"}` → **401
  `LINK_INVALID`**, and the identical replay → **401 `LINK_INVALID`**.
- Expired, already-used and never-issued are **one message on purpose** — the
  advocate's next action is the same in all three, and distinguishing them would
  tell an attacker which tokens existed. Read in `routes.ts`, confirmed live.
- The landing route **does not spend the token**: proved behaviourally by
  `magic-link-landing.test.ts:220` — two landings, then `POST /auth/verify` still
  **200**, then replay **401**. Corroborated end-to-end on the real deployment by
  `lcc-r33/remote-acceptance.json` (`verifyStatus 200`, `replayStatus 401`,
  `invalidStatus 401`) against a delivered Resend email.

## DELTA B — DEPLOYMENT IDENTITY · `PASS`

```
live GET /version gitSha  = a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a   (FIFTH, 2026-09-18)
RCC_REMOTE_API_SHA        = a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a   (rcc-r32/acceptance.json)
                          → MATCH. RCC tested the exact deployment carrying the auth fix.
```

`/health` and `/ready` independently report the **same** sha, so three separate
surfaces agree.

**Commits between the auth deploy and RCC's evidence — classified:**

| commit | files | classification |
|---|---|---|
| `758b6c67` | `docs/ai/lcc-r33/*`, `docs/CURRENT_PLAN.md`, `docs/FOUNDER_QUEUE.md`, `.agents/bus/*` | **non-runtime** |
| `fae456c8` | `docs/ai/lcc-r33/api-suite.txt` | **non-runtime** |
| `5b31736e` | `docs/ai/rcc-r32/*` | **non-runtime** |
| `312421f4` | `.agents/bus/*`, `docs/*` | **non-runtime** |

`git diff --name-only a09d7ee5..312421f4` touches **zero** files under `services/`,
`packages/` or `apps/`. The deployed binary is runtime-identical to `AUDIT_HEAD`.

**Client identity, verified rather than accepted:** `git diff --name-only
9fc20c0d..fae456c8 -- apps/` is **empty**, and so is `9fc20c0d..HEAD -- apps/`. The
APK installed at R31 **is** HEAD's client code; nothing needed rebuilding and
nothing was rebuilt. RCC's claim holds.

## DELTA C — CELLULAR PROOF · `CELLULAR_NETWORK_PROOF = FAIL (bearer unavailable)`

Read directly from `docs/ai/rcc-r32/device/network-proof.txt`, not from prose.

| required | observed | verdict |
|---|---|---|
| **Wi-Fi OFF** | `wifi_on 1` · `mobile_data 0` · `wlan0 192.168.1.21/24` up | **FAIL** — Wi-Fi was the bearer |
| **direct cellular data active** | mobile data **off**; no non-IMS cellular agent declares `INTERNET` | **FAIL** |
| **cellular `VALIDATED`** | the *only* `VALIDATED` cellular agent is `IMS&…&MMTEL` | **FAIL — IMS-only, excluded by charter** |
| no VPN / no local API | `always_on_vpn null`, `private_dns null`, `NOT_VPN` on both transports, no `tun`/`tap`/`ppp` in `ip -o addr` | PASS |
| no adb reverse/forward dependency | `adb reverse --list` empty · `adb forward --list` empty, throughout | PASS |
| public origin `https://alpha-api.lawmind.co` | `EXPO_PUBLIC_API_URL` baked into the APK's Hermes bundle — RCC unzipped `assets/index.android.bundle` and found the host (R31 `build-provenance.json`); binary unchanged at R32 | PASS |

The three cellular capability lines in full:

```
CELLULAR  IMS&NOT_METERED&TRUSTED&NOT_VPN&VALIDATED&NOT_ROAMING&…&MMTEL   ← IMS only
CELLULAR  TRUSTED&NOT_VPN&NOT_VCN_MANAGED&NOT_BANDWIDTH_CONSTRAINED        ← no INTERNET
CELLULAR  IMS&TRUSTED&NOT_VPN&NOT_BANDWIDTH_CONSTRAINED                    ← IMS only
WIFI      NOT_METERED&INTERNET&…&VALIDATED&…                               ← the actual bearer
```

**This is an external hardware/subscription fact, not a lane failure and not a
product defect.** Second day, second attempt, same reading. RCC stated `wifiOff:
false` and `cellularNetworkValidated: false` **plainly in the acceptance record**
rather than folding them into a pass — which is the correct behaviour and is noted
as such.

## DELTA D — REQUIRED PHYSICAL FLOW · every row PASS, **over Wi-Fi**

Graded on artifacts FIFTH opened — eight device screenshots and `acceptance.json` —
not on the summary. **These are not substituted for the cellular test**; the bearer
is stated on every row.

| row | verdict | evidence FIFTH inspected |
|---|---|---|
| `RCC_AUTH` | **PASS** | `01-auth-landed-onboarding.png` — the emailed `https` link, tapped on the device, reached the app's onboarding screen (correct: the identity had no profile). `02-signed-in-today.png` — "Good morning, **RCC GateC Advocate**", FRIDAY 18 SEP, "No matters yet", enrolment-pending banner. Right identity, clean starting state. The Custom Tab **does** hand the 302 to the app — the one step only a phone could answer. |
| `RCC_SEARCH` | **PASS** | `03-search-exact.png` — `2022 INSC 690` → **1 judgment**, *Satender Kumar Antil v CBI*, Supreme Court of India · 2022, **no badge** (verified is silent — correct). `04-search-lexical.png` — "bail conditions undertrial delay" → **5 judgments**; "*No citation on file — cannot be referenced in a filing*" rendered truthfully and the action **degraded** `Copy citation` → `Copy case name`. Citation harness behaving. |
| `RCC_READER` | **PASS** | `06-reader-paragraphs.png` — "**1 of 76**", real paragraph text, on a freshly **cleared** install against a remote API, so it cannot be a cache-only success. `05-reader-provenance.png` per record carries the reporter's-edition caveat and the unchecked-date line. **Independently corroborated by FIFTH's own live probe**: `GET /judgments/0c13f977…` returns **76 paragraphs** whose paragraph 1 text matches the screenshot character for character. |
| `RCC_SAVE` | **PASS** | `07-matter-with-authority.png` (04:50) — matter *RCC Gate C v Alpha API*, AUTHORITIES holds **exactly one** entry, *SATENDER KUMAR ANTIL…* `2022 INSC 690`. The picker carried the authority **through** matter creation rather than dropping it. A second save of the same authority produced **no duplicate** after a remote refetch. |
| `RCC_MATTER` | **PASS** | Same screenshot — correct remote state, truthful empty states ("No next date recorded", "Nothing recorded yet. The timeline holds what the court did."). Cross-checked: `02` shows "No matters yet" at 04:40, so this matter was created **during** the run. |
| `RCC_RELAUNCH` | **PASS** | `08-relaunch-persisted.png` (05:54) — after force-stop, **no re-auth**, same matter, **still exactly one** authority after remote refetch, no cold-store false absence. |
| `crashes / ANR / OOM / product 4xx-5xx` | **PASS** | 0 / 0 / 0 / none |
| **cellular bearer** | **FAIL — see Delta C** | `wifi_on 1`, `mobile_data 0` |

## BOUNDED BACKEND REGRESSION · `BACKEND_DELTA_PROBES = PASS`

Only the invariants the auth/routing change could plausibly disturb. Corpus restore,
the 92 M-row census, blue/green, Gate-S1 and backup-restore were **not** re-run — the
diff touches none of them (it is 9 files: 3 auth, 1 env, 1 app.ts mount, 1 ops CLI,
3 client/test).

| probe | result |
|---|---|
| `GET /health` | `200` · `status ok` · `sha a09d7ee5` · `database.reachable true`, `latencyMs 2` |
| `GET /ready` | `200` · `splitMode "split"` · `rolesDistinct true` · `corpusReachable true` · `userReachable true` · `servingEnv "staging"` |
| `GET /version` | `200` · `gitSha a09d7ee5` · `contract 1` |
| protected routes, unauthenticated | `/me` **401** · `/me/data-requests` **401** · `GET /matters` **401** · `/saved-searches` **401** · `/admin/monitor` **401 UNAUTHENTICATED** · `GET /me` with a junk bearer **401**. **`POST /matters` with a complete valid body → 401 `AUTH_REQUIRED`, no write.** |
| representative Search | `POST /search {"query":"2022 INSC 690","language":"en"}` → `200`, *Satender Kumar Antil*, `verificationState "verified"` · `verifiedBySource "corpus"` · `overruledStatus "none"` · `canAddToMatter true`. Three-field model intact, rendered from the row. |
| Reader | `GET /judgments/0c13f977…` → `200`, Supreme Court of India, **76 paragraphs** |
| semantic public search disabled | registry `RELEASE_CAPABILITIES_R8_3.5` **unchanged**: `supporting_authority` / `adverse_authority` / `counterarguments` / `abstention` = **DISABLED**; `broad` = `EXPERIMENTAL_INTERNAL` (prior audit verified `isUserReachable()` returns false); `long_input` = `LIMITED`, a guided-refusal family, not retrieval. **Nothing public is ENABLED.** |
| public Postgres ports | `178.128.209.91:5432/5433` and `157.245.156.133:5432/5433` — **all CLOSED/FILTERED** (re-probed, cheap) |

## PRIOR_BACKEND_ROWS_REUSED

Carried forward unchanged from `gate-c-r32b/VERDICT.md`, because the delta touches
none of them and each was falsified against at the time:

`SHA_CONSISTENCY` · `GATE_S1_CONTRACT_INTEGRITY` (threshold 3000 ms and timeout
15 s hardcoded R29, unmodified; p95 2,748) · `SPLIT_DB` · `LOCAL_DB_REFUSAL` ·
no generic `DATABASE_URL` fallback · `CORPUS_RESTORE` (`RESTORE_VERIFIED`,
dangling 0, `ACTIVATE`) · paragraph population **92,083,253** with orphans 0 ·
export checksums / one coherent snapshot · `BLUE_GREEN` (+ 87 USER tables
byte-identical) · `USER_RESTORE` (44 tables, 0 row mismatches) · activation events
write only to the USER DB · `R16` · `R17` · HNSW absent / not serving · citation
bulk apply HOLD · no committed credentials · remote core smoke 20/20.

`SPLIT_DB`, `SEMANTIC_SEARCH_DISABLED` and `PUBLIC_DB_EXPOSURE` were additionally
**re-probed live this round** (above) and still hold.

## FINDINGS

### `P0` — **NONE**

No falsified invariant. No backend defect assigned. No client defect assigned. The
auth defect that was P0-equivalent at R31 is **closed and independently verified
closed**.

### `NONBLOCKING`

Carried from the prior verdict, unchanged: **N-1** (SHA labelling precision in the
Gate-S1 report) · **N-2** (`deployedAt`/`imageDigest` null, `gitSha` self-reported,
no independent build provenance — re-confirmed live this round) · **N-3** (novel-query
cold latency outside what frozen Gate-S1 measures; 98 GB TOAST vs 31 GiB RAM) ·
**N-4** (prewarm is a manual step; an unattended restart serves cold).

New this round:

- **N-5 (LCC, labelling).** `/version` reports `environment: "production"` while
  `/ready` reports `servingEnv: "staging"` **on the same box, same sha**. Recorded by
  RCC at R31; FIFTH confirms it live at `a09d7ee5`. Harmless today, and exactly the
  kind of thing that misroutes an incident at 3 a.m. One of the two labels is lying.
- **N-6 (LCC, test hygiene).** The full API suite is **1288 pass / 1 fail / 4
  skipped** of 1293. The failure is a **latency assertion** in
  `src/search/sparse-bound.test.ts` (5,783 ms against a bound), which LCC attributes
  to running the new auth suite against the same local Postgres concurrently, and
  which they say re-runs at 582 ms on an idle box. **FIFTH did not re-run it** — a
  timing assertion measured on a contended box is not evidence either way, and the
  full suite is not a Gate-C requirement. It is in `search`, not `auth`, and nothing
  in the delta touches it. Recorded as `UNKNOWN`, not as a pass.
- **N-7 (LCC, pre-existing, low).** Body validation runs **before** auth on
  `POST /matters`: an unauthenticated caller walks the request schema one 400 at a
  time (`caseTitle` → `court` → `caseType` → `parties`) before finally receiving
  401. No data disclosed, no write performed. **Not introduced by this change** —
  the `app.ts` diff is `+28 / −0` — so it is recorded, not charged to R33.
- **N-8 (RCC, accessibility).** The *Case type* and *Our side* chips report
  `selected="false"` in the accessibility tree while visually selected. RCC found it,
  recorded it, and correctly did not chase it under a bounded brief. It matters to a
  screen-reader user.

### `CORRECTIONS`

Findings where a lane's **own** account of its work was inaccurate. None of these
changes a verdict; each is recorded because the next agent will read the prose.

1. **LCC understated their own coverage (thin spot #1).** LCC wrote: *"There is no
   test asserting the route reaches no database. The protection right now is a
   comment and a shape."* That is **literally true and substantively wrong**.
   `magic-link-landing.test.ts:220` — *"leaves the token unspent, then lets
   better-auth spend it exactly once"* — lands **twice**, then asserts
   `POST /auth/verify` is still **200** ("two landings must not have consumed the
   token"), then asserts replay is 401. The precise rot LCC feared — someone
   "improving" the landing route into a verifier that **spends** the token — fails
   that test on the first landing. The guard is behavioural, not a comment.
2. **LCC's thin spot #2 is now closed, by FIFTH rather than by LCC.** They flagged
   header influence on the destination and token fuzzing through
   `encodeURIComponent` as unproven. Both were attacked live (Delta C table): no
   header influences `Location`, and CRLF / `&` / `#` / `../` / over-length / duplicate
   params are all handled. Their tests still do not cover it; the deployment does.
3. **LCC's thin spot #3 widened.** They probed two authenticated routes. FIFTH probed
   **eight** paths plus a junk-bearer case plus a complete-valid-body write. All
   refuse correctly.
4. **RCC's cellular wording carried forward from a different device state.**
   `rcc-r32/acceptance.json` repeats R31's phrasing — *"CELLULAR agent declares
   INTERNET but not VALIDATED"* — but the R32 capture was taken with `mobile_data 0`,
   and in it **no non-IMS cellular agent declares `INTERNET` at all**. Not a
   contradiction (different device state), and it does not change the conclusion —
   the bearer is unavailable either way — but the sentence does not describe the
   capture it is attached to.
5. **RCC's own three corrections are accepted as corrections, not defects:** the
   `reader_open_ms=100122` instrumentation artifact (struck), the "Add matter"
   double-refusal that was **correct validation** on an empty CLIENT NAME, and the
   R31 Gmail account-scope error that nearly blamed a Resend problem that does not
   exist.

### `UNKNOWN`

- **Cellular bearer** — the blocking row. No mobile-data subscription on the test SIM.
- **Full remote API suite** — not required by Gate C (adjudicated in the prior
  verdict); the one local failure is N-6 and was not re-run by FIFTH.
- **Build provenance** — `imageDigest` and `deployedAt` remain `null`; `gitSha` is
  self-reported by the process. Acceptable for staging (N-2), not for production.
- **Auth-gated remote surfaces beyond the unauthenticated boundary** — FIFTH holds no
  staging credential and did not mint one. Authenticated behaviour rests on RCC's
  device evidence (inspected) and LCC's acceptance receipts (re-read field by field),
  not on a FIFTH-issued authenticated call.

## GATE DECISION

The charter is explicit and is not waivable by FIFTH: *IMS-only connectivity does not
count; Wi-Fi remote testing does not count.* The auth fix is sound and every product
row is PASS, so the only unsatisfied required row is the bearer.

**`GATE_C = HOLD — RCC cellular bearer evidence missing`**

## EVIDENCE REFERENCES

`docs/ai/fifth/gate-c-r32b/VERDICT.md` (prior) ·
`docs/ai/rcc-r31/{ROUND.md, magic-link-origin-question.json, build-provenance.json,
device/05-emailed-link-404.png}` ·
`docs/ai/lcc-r33/{ROUND.md, remote-acceptance.json, api-suite.txt}` ·
`docs/ai/rcc-r32/{ROUND.md, acceptance.json, device/01..08, device/network-proof.txt}` ·
`.agents/bus/{1799, 1801, 1802, 1803, 1805}` ·
`packages/auth/src/index.ts` · `services/api/src/auth/{magic-link-landing.ts,
magic-link-landing.test.ts, routes.ts}` · `services/api/src/{app.ts, env.ts}` ·
`services/api/src/release/capabilities.ts` ·
`git diff 27b55fa4..a09d7ee5` and `git diff a09d7ee5..312421f4`.

Live probes performed by FIFTH on **2026-09-18** against
`https://alpha-api.lawmind.co`: `GET /version`, `/health`, `/ready`,
`/release/capabilities`; `GET /auth/magic-link/open` × 8 attack variants;
`GET` × 7 better-auth-shaped paths; `GET /me`, `/me/data-requests`, `/matters`,
`/saved-searches`, `/admin/monitor`, `/drafts`, `/briefings`, `/search`;
`POST /matters` (complete valid body, unauthenticated); `POST /search`;
`GET /judgments/0c13f977…`; `POST /auth/verify` × 2 (invalid, then replayed);
TCP `5432`/`5433` against both public IPs.

FIFTH made **no mutation**: no patch to product code, no redeploy, no restart, no
firewall/DNS change, no database change, no benchmark parameter change, no
manufactured evidence, and no DigitalOcean resource created, changed or destroyed.
FIFTH does **not** authorize teardown.
