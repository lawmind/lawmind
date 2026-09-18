# FIFTH — GATE C **FINAL** verdict (bearer-row re-adjudication)

Narrowly scoped continuation. The backend, auth, corpus, Gate-S1, restore,
blue/green, R16 and R17 audits were **not** repeated — they were independently
falsified against in the two prior FIFTH verdicts and are reused below by
reference. This document re-adjudicates **one row**: the formerly blocking bearer
requirement.

```
PRIOR_VERDICT = GATE_C = HOLD — RCC cellular bearer evidence missing
                (docs/ai/fifth/gate-c-r33-delta/VERDICT.md, 2026-09-18)
AUDIT_HEAD    = 92324d1a8e1ff1a5e445dcc74295f3859a421150
REMOTE_SHA    = a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a
                (live GET /version, re-confirmed by FIFTH 2026-09-18 — the
                 deployment has NOT rolled since the run being adjudicated)
adjudicated at = 2026-09-18
```

## FINAL VERDICT

**`GATE_C = PASS`**

---

## 1. THE POLICY CHANGE, RECORDED AS A POLICY CHANGE

### `CURRENT_FOUNDER_INSTRUCTION`

The founder has explicitly changed the Gate-C acceptance requirement: **cellular /
mobile data is no longer a mandatory bearer.** The row's purpose is restated as
proving that *a physical client executes against the real public remote deployment
without the founder workstation, localhost, ADB networking, a development tunnel,
VPN, Metro networking, or cached/local-only product state.* Accepted bearers are
ordinary Internet-connected Wi-Fi **or** cellular. The bearer itself is not a
release invariant.

### `OLD_CELLULAR_REQUIREMENT`

The superseded rule required Wi-Fi OFF, cellular data active and the cellular
network `VALIDATED`; IMS-only connectivity did not count and Wi-Fi testing did not
count. FIFTH applied that rule as written and issued HOLD on it twice.

### `CELLULAR_BEARER_CLASSIFICATION`

**`CELLULAR_BEARER = N/A — SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION`**

Stated precisely, because the distinction will matter to whoever reads this next:

- This is a **product/release acceptance-policy change**, not a finding that Wi-Fi
  and carrier networks are technologically equivalent. They are not.
- **The historical evidence is not rewritten.** Cellular did **not** pass. It was
  never observed. On both device-days the only `VALIDATED` cellular agent on that
  SIM was IMS, and the SIM carries no mobile-data plan. Those readings stand in
  `docs/ai/rcc-r31/ROUND.md` and `docs/ai/rcc-r32/device/network-proof.txt` exactly
  as recorded, and this verdict does not touch them.
- What changed is **what Gate C requires**, not what was measured.
- Per the current instruction, hypothetical carrier-specific DNS / CGNAT / IPv6
  behaviour was **not** evaluated: no other current Gate-C criterion requires it.
  If a later gate does require it, this row does not answer that question and must
  not be cited as if it did.

### `NEW_REMOTE_PUBLIC_NETWORK_REQUIREMENT`

**`REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW = PASS`**

Graded below against all ten invariants. **Not** graded PASS because the rule
changed — every invariant was checked against RCC's existing artifacts, and two of
them were verified in the client *source* rather than accepted from the round
record. No new network test was introduced and RCC was not asked to repeat
anything.

---

## 2. THE TEN INVARIANTS, EACH VERIFIED

The run being adjudicated is **RCC R32** (against deployed `a09d7ee5`), with the
client binary's provenance supplied by **RCC R31** — the binary is unchanged between
them, verified: `git diff --name-only 9fc20c0d..HEAD -- apps/` is **empty**.

### 1. `PHYSICAL_DEVICE = PASS`

`adb devices -l` → `RZCX90X1BNF  device product:e1sxins model:SM_S921B device:e1s`.
A physical Galaxy S24 (SM-S921B, Android 16), not an emulator — an emulator reports
`emulator-NNNN` and an `e1s` device tree is silicon. Eight screenshots at 1080×2340
with a live status bar (clock advancing 04:39 → 05:54, battery 69% → 77% while
charging) corroborate a real handset over a real session.

### 2. `PUBLIC_HTTPS = PASS`

`https://alpha-api.lawmind.co` — a public origin, TLS-terminated by Caddy, reachable
by FIFTH from an unrelated network. `EXPO_PUBLIC_API_URL=https://alpha-api.lawmind.co`
is **baked into the APK's Hermes bundle**, verified by RCC unzipping
`assets/index.android.bundle` out of the APK and finding the host in the string
table (`build-provenance.json`). FIFTH independently confirms the same origin serves
the deployed SHA the run recorded.

### 3. `LOCALHOST_ABSENT = PASS` — *verified in source, stronger than the round record claimed*

RCC disclosed that the literal `localhost:3000` also appears once in the bundle, and
argued the branch is unreachable. FIFTH did not accept that; I read
`apps/mobile/src/api/client.ts:175-208`. The branch is unreachable **for two
independent reasons**, and the module is safer than RCC described:

```ts
export function resolveBaseUrl(configured, environment) {
  if (configured !== undefined && configured !== '') {
    …validate… return url;                                  // ← taken: the baked origin
  }
  if (environment === 'development') return 'http://localhost:3000';   // ← never reached
  throw new Error('EXPO_PUBLIC_API_URL is not set … Refusing to fall back to a guessed API URL');
}
```

1. `configured` is the baked `https://alpha-api.lawmind.co`, so the function
   **returns before line 195 is ever evaluated**.
2. Even if the origin were absent, `APP_ENVIRONMENT` is `staging` in this binary —
   not `development` — so the localhost line still would not run. The client
   **throws and refuses** rather than guessing an API URL.

A grep of the entire client source (`apps/mobile/src`, `apps/mobile/app`, tests
excluded) for `localhost`, `127.0.0.1`, `10.0.2.2` and `192.168.` returns **exactly
one hit**: that single unreachable line. There is no debug override, no LAN
fallback, and no runtime origin switch — `BASE_URL` is resolved once at module init
from a value Metro inlines at build time, so it is a compile-time constant in the
shipped bundle.

### 4. `ADB_REVERSE_ABSENT = PASS` · 5. `ADB_FORWARD_ABSENT = PASS`

`adb reverse --list` and `adb forward --list` both **empty**, captured throughout
both the R31 Wi-Fi run and the R32 run. The distinction that matters and is
satisfied: ADB was attached over USB as a **control/instrumentation channel** (to
take screenshots and dump connectivity state), which is not forbidden; ADB as an
**API transport** is what the invariant forbids, and both forwarding tables are
empty, so no socket on the phone was proxied to the workstation.

### 6. `VPN_TUNNEL_ABSENT = PASS`

| check | reading |
|---|---|
| `always_on_vpn_app` | `null` |
| `private_dns_mode` | `null` |
| interfaces (`ip -o addr show`) | `lo`, `dummy0`, `rmnet1`, `wlan0` — **no `tun`, `tap` or `ppp`** |
| Wi-Fi capabilities | `NOT_VPN` |
| `UnderlyingNetworks` on the default network | **`Null`** — decisive: a VPN network stacks over an underlying one and names it here |
| default route / DNS | `0.0.0.0/0 -> 192.168.1.1`, DNS `192.168.1.1`, `Domains: null` — an ordinary home router, no search domain, no split-tunnel |

The R31 capture carries the full `NetworkAgentInfo` dump (SSID `X_5G`, WPA2-PSK,
802.11ax, `IS_VALIDATED`, `CarrierMerged: false`); the R32 capture carries the
capability line, the interface list and the two settings. Ordinary
Internet-connected Wi-Fi, which the current instruction accepts.

*Recorded so a later reader does not trip on it:* `rmnet1` holds a global IPv6
address in both captures **even with `mobile_data 0`**. That is the IMS/VoLTE PDN,
which stays attached on this handset; it carries no `INTERNET` capability (confirmed
in the capability dump) and therefore cannot have been the bearer. Its presence is
not evidence of cellular data.

### 7. `STANDALONE_CLIENT = PASS`

This is the invariant that most deserved scrutiny, and RCC found the problem
themselves before the gate did:

> the build originally on the phone was a **Metro debug build** — it needs a bundler
> and `adb reverse tcp:8081` to run at all, *"which is exactly the local dependency
> this gate forbids. A dev build and a remote-network claim are mutually
> exclusive."*

RCC therefore built a standalone release (`gradlew :app:assembleRelease`,
`EXPO_PUBLIC_APP_ENV=staging`) and installed it fresh. Verified in
`build-provenance.json`:

- **`DEBUGGABLE` is gone.** Before: `flags=[ DEBUGGABLE HAS_CODE … ]`. After:
  `flags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP KILL_AFTER_RESTORE ]`.
- **`firstInstallTime == lastUpdateTime`** — a clean install, no prior app state, so
  a cached-corpus false positive was not available to the run.
- The origin was confirmed baked in by unzipping the APK, not assumed.
- `apps/**` porcelain count **0** at build time: the APK is built from committed
  client code.

One precision point, recorded rather than smoothed over: the `DEBUGGABLE`-absent
flag dump is attached to the **first** release build. The binary used for the R32
rows is the **second** build (carrying the R31 copy fix), produced by the same
`assembleRelease` task and installed over the first. That it is equally non-debuggable
is **INFERRED from the build type**, not separately dumped. It does not weaken the
row — Metro-dependence is a property of the `debug` build type, and `assembleRelease`
does not produce one — but the flag evidence for build 2 is inference, not
observation.

### 8. `AUTH = PASS`

Real remote authentication end to end, on the device: a real magic-link email
delivered from the deployment, tapped on the phone → Brave Custom Tab → **302** →
`lawmind://auth/verify?token=…` → `co.lawmind.app/.MainActivity`. Landed on
onboarding (correct — the identity had no profile), then
`02-signed-in-today.png` shows **"Good morning, RCC GateC Advocate"**, FRIDAY 18 SEP,
enrolment-pending banner, "No matters yet". Right identity, clean starting state.

This is the browser → deep-link handoff that only a physical device could answer,
and the server side of it was independently audited by FIFTH in the R33 delta
verdict (canonical better-auth verification, closed redirect, token never logged,
replay 401).

### 9. `SEARCH = PASS` · `READER = PASS` · `SAVE = PASS` · `MATTER = PASS`

| row | evidence FIFTH opened |
|---|---|
| `SEARCH` exact | `03-search-exact.png` — `2022 INSC 690` → **1 judgment**, *Satender Kumar Antil v CBI*, Supreme Court of India · 2022, **no badge** (verified is silent — correct per the citation harness) |
| `SEARCH` lexical | `04-search-lexical.png` — "bail conditions undertrial delay" → **5 judgments**; *"No citation on file — cannot be referenced in a filing"* rendered truthfully, and the action **degraded** `Copy citation` → `Copy case name` |
| `READER` | `06-reader-paragraphs.png` — **"1 of 76"**, real paragraph text, on a freshly **cleared** install. **Independently corroborated**: FIFTH's own live `GET /judgments/0c13f977…` returns **76 paragraphs** whose paragraph 1 matches the on-screen text character for character — so the phone was reading this deployment's corpus, not a local cache |
| `SAVE` | `07-matter-with-authority.png` — matter *RCC Gate C v Alpha API*, AUTHORITIES holds **exactly one** entry, `2022 INSC 690`; the picker carried the authority **through** matter creation; a second save produced **no duplicate** |
| `MATTER` | Same screenshot — correct remote state, truthful empty states. Cross-checked against `02` ("No matters yet" at 04:40), so the matter was created **during** this run |

### 10. `RELAUNCH_PERSISTENCE = PASS`

`08-relaunch-persisted.png` (05:54, 64 minutes after the save): after force-stop,
**no re-auth required**, same matter, **still exactly one** authority after a remote
refetch, no cold-store false absence. Durable remote state, not local-only state —
and on a cleared install there was no local state for it to have come from.

**Run health:** 0 crashes · 0 ANR · 0 OOM · no product 4xx/5xx.

---

## 3. `REMOTE_SHA` AND DEPLOYMENT IDENTITY

```
live GET /version gitSha  = a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a   (FIFTH, re-confirmed today)
RCC_REMOTE_API_SHA        = a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a
                          → MATCH, and the deployment has not rolled since the run.
```

Everything from the auth deploy to `AUDIT_HEAD` is non-runtime (docs, bus and
evidence only — zero files under `services/`, `packages/`, `apps/`), so the binary
serving traffic is runtime-identical to the audited head. The client binary is
likewise still HEAD's client code.

## 4. `PRIOR_BACKEND_ROWS_REUSED`

Reused unchanged, each independently falsified against in
`gate-c-r32b/VERDICT.md` and re-confirmed where cheap in `gate-c-r33-delta/VERDICT.md`:

`SHA_CONSISTENCY` · `GATE_S1_CONTRACT_INTEGRITY` (threshold 3,000 ms and timeout
15 s hardcoded at R29 and unmodified; p95 2,748) · `SPLIT_DB` · `LOCAL_DB_REFUSAL`
(founder-workstation cluster id refused at boot; an empty guard value is itself a
boot refusal) · no generic `DATABASE_URL` fallback · `PUBLIC_DB_EXPOSURE` none ·
`CORPUS_RESTORE` verified and activated · paragraph population **92,083,253**,
orphans 0 · export checksums and one coherent snapshot · `BLUE_GREEN` with 87 USER
tables byte-identical across switch and rollback · `USER_RESTORE` (44 tables, 0 row
mismatches) · activation events write only to the USER DB · `R16` · `R17` ·
`SEMANTIC_SEARCH_DISABLED` (registry `R8_3.5`, nothing public ENABLED) · HNSW absent
and not serving · citation bulk apply HOLD · no committed credentials · remote core
smoke 20/20 · **the R33 auth fix** (canonical better-auth verification the only
verifier, one route added, redirect closed under live attack, token never logged,
invalid and replayed tokens 401).

## 5. FINDINGS

### `P0` — **NONE**

No falsified invariant. No backend defect. No client defect. No remaining blocking
row.

### `NONBLOCKING`

All carried forward; none blocks Gate C, and none is newly introduced by this
re-adjudication.

- **N-1** Gate-S1 SHA-labelling precision (LCC, reporting).
- **N-2** `/version` returns `deployedAt: null` and `imageDigest: null`; `gitSha` is
  self-reported with no independent build provenance. Acceptable for staging;
  **not acceptable for production**, and Gate C passing does not make it so.
- **N-3** Novel-query cold latency (1 of 8 at 3.5 s) sits outside what the frozen
  Gate-S1 suite measures. A sizing fact — 98 GB of stored tsvectors against 31 GiB
  of RAM — not a code defect.
- **N-4** The corpus prewarm is a **manual** step; an unattended restart serves cold.
- **N-5** `/version` says `environment: "production"` while `/ready` says
  `servingEnv: "staging"` on the same box, same SHA. One of the two labels is lying,
  and that is what misroutes an incident at 3 a.m.
- **N-6** The full API suite is 1288 pass / 1 fail / 4 skipped of 1293; the failure
  is a **latency** assertion in `src/search/sparse-bound.test.ts` which LCC
  attributes to self-contention. FIFTH did **not** re-run it — a timing assertion on
  a contended box is not evidence either way — so it remains UNKNOWN, not passed.
  The full API suite is not a Gate-C requirement.
- **N-7** Body validation runs **before** auth on `POST /matters`: an
  unauthenticated caller can walk the request schema one 400 at a time before
  finally receiving 401. No data disclosed, no write performed. Pre-existing.
- **N-8** The *Case type* and *Our side* chips report `selected="false"` to the
  accessibility tree while visually selected. Matters to a screen-reader user.
- **N-9 (new, recording precision).** The non-debuggable flag dump covers release
  build 1; the binary that produced the R32 rows is release build 2. Same
  `assembleRelease` task, so the property is inferred rather than observed. A
  one-line `dumpsys package` capture at install time would close it permanently.

### `CORRECTIONS`

1. **RCC understated their own localhost evidence.** The round record argues the
   `localhost:3000` literal is unreachable because `APP_ENVIRONMENT` is `staging`.
   True, but it is unreachable for a **prior and independent** reason: the baked
   origin makes `resolveBaseUrl` return before that line is evaluated. And the
   fallback the client would take if the origin were ever missing is a **throw**,
   not a guess — so the binary cannot silently address a local API under any
   configuration.
2. **RCC's R32 acceptance record repeats R31 phrasing against a different device
   state.** `acceptance.json` says the cellular agent *"declares INTERNET but not
   VALIDATED"*, but the R32 capture was taken with `mobile_data 0`, where no non-IMS
   cellular agent declares `INTERNET` at all. Same conclusion, but the sentence does
   not describe the capture it is attached to. (Carried from the R33 delta verdict;
   now moot for the gate, still worth fixing in the record.)
3. **LCC understated their own test coverage** on the magic-link landing route —
   `magic-link-landing.test.ts:220` behaviourally guards the exact rot they said only
   "a comment and a shape" protected. (Carried from the R33 delta verdict.)
4. **This verdict does not claim cellular passed.** It never ran. The bearer row is
   `N/A` by current policy, not `PASS` by evidence. Anyone citing Gate C as proof
   that LawMind works on carrier data is citing it wrongly.

## 6. GATE DECISION

The re-scoped row is satisfied on evidence, not on the rule change: a physical
Galaxy S24, running a standalone non-debuggable release built from committed client
code, with the public origin compiled into its bundle and no reachable local-API
path in its source, over ordinary Internet-connected Wi-Fi with no VPN, no tunnel
and both ADB forwarding tables empty, on a cleared install, authenticated through a
real emailed magic link against the deployed public API, completed Search → Reader →
Save → Matter and still held that state after a force-stop and a remote refetch.

No other required Gate-C row is outstanding. `P0 = NONE`.

**`GATE_C = PASS`**

FIFTH does **not** authorize teardown; that decision belongs to whoever owns the
resource ledger, and a passing gate is not an instruction to destroy the evidence.

## EVIDENCE REFERENCES

`docs/ai/fifth/gate-c-r32b/VERDICT.md` · `docs/ai/fifth/gate-c-r33-delta/VERDICT.md` ·
`docs/ai/rcc-r31/{ROUND.md, build-provenance.json, device/network-proof-wifi-run.txt,
device/network-proof-before.txt, device/network-proof-at-run.txt}` ·
`docs/ai/rcc-r32/{ROUND.md, acceptance.json, device/01..08, device/network-proof.txt}` ·
`docs/ai/lcc-r33/{ROUND.md, remote-acceptance.json}` ·
`apps/mobile/src/api/client.ts:149-208` (read by FIFTH) ·
`.agents/bus/{1799, 1801, 1802, 1803, 1805, 1806, 1807}` ·
`git diff --name-only 9fc20c0d..HEAD -- apps/` (empty).

Live probe performed by FIFTH on 2026-09-18: `GET https://alpha-api.lawmind.co/version`
(deployment identity re-confirmation only). No new network test was introduced, RCC
was not asked to repeat any flow, and **no product or backend code was mutated**.
