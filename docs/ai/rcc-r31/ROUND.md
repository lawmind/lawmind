# RCC R31 — Gate C over mobile data on the physical S24

**Verdict: HOLD.** Everything RCC could build, install and prove without touching
the phone's screen is done and recorded below. The product flow itself was not
run, for one reason that is not a code problem: **the Galaxy S24 is locked behind
a secure credential and only the founder can clear it.**

Nothing here is marked PASS. A Gate row is an observation, and this one was not
observed.

## Start state

| | |
| --- | --- |
| `HEAD_START` | `8def684c74cc1e8c02b7dd6890dc5ecd77a4ad2f` |
| `origin/main` | `8def684c74cc1e8c02b7dd6890dc5ecd77a4ad2f` (identical; `git fetch origin` brought nothing) |
| working tree | dirty repo-wide (3,142 paths, other lanes' artifacts). **`apps/**` porcelain count 0** |
| lane | RCC, bound this session (`.agents/bus/.lane-bddb8cde…`) |
| round dir | `docs/ai/rcc-r31/` — `rcc-r30` was the last used, so this is the next free one and nothing was overwritten |

## The two SHAs, and why they are the same release

| | |
| --- | --- |
| `CLIENT_SHA` | `8def684c74cc1e8c02b7dd6890dc5ecd77a4ad2f` |
| `REMOTE_API_SHA` | `27b55fa45c902c9ce83a2f4214698c181cd3054e` — read live from `GET /version`, not assumed from the bus |

They differ by exactly one commit, `8def684c`, and that commit touches only
`docs/`. `git diff --name-only 27b55fa4..8def684c -- apps/ services/ packages/`
returns **nothing**. So the binary RCC built and the server LCC deployed are the
same release in every code path; the gap is documentation only.

The remote answered on all three liveness routes:

| route | answer |
| --- | --- |
| `/version` | `gitSha 27b55fa4…`, `contract 1` |
| `/health` | `status ok`, `database.reachable true`, `latencyMs 2` |
| `/ready` | `status ready`, `splitMode split`, `rolesDistinct true`, `servingEnv staging`, corpus and user both reachable |

One discrepancy, recorded and **not** acted on because it is LCC's: `/version`
reports `environment: "production"` while `/ready` reports
`servingEnv: "staging"`. Two fields, two sources, disagreeing about the same
deployment. It changed nothing in this round.

## NETWORK_PROOF — done, and it holds

Captured before anything else, and again after the install:
[`device/network-proof-before.txt`](device/network-proof-before.txt).

| claim | evidence |
| --- | --- |
| Wi-Fi is **off** | `settings get global wifi_on` → `0`. Stronger: `ip -o addr show` lists `lo`, `dummy0`, `rmnet0`, `rmnet1` and **no `wlan0` at all** — the interface is gone, not merely unused |
| mobile data is **on** and is the default route | `settings get global mobile_data` → `1`; `Active default network: 103`, which is `MOBILE[LTE]` on `rmnet0`, `10.105.141.11/24`, default route `0.0.0.0/0 -> 10.105.141.1` |
| no ADB networking route exists | `adb reverse --list` **empty**, `adb forward --list` **empty**. Not "none used for API traffic" — none at all |
| no tunnel | `ip -o link show` matches no `tun`/`tap`/`ppp`; every `NetworkAgentInfo` is CELLULAR and carries `NOT_VPN`; `always_on_vpn_app` is `null` |
| no DNS interception | `private_dns_mode` is `null` |
| carrier is real | the lock-screen status bar reads **Vi India, 5G**, with no Wi-Fi glyph ([`device/01-launch.png`](device/01-launch.png)) |

ADB itself is USB (`adb devices -l` shows the hardware serial `RZCX90X1BNF`, not
an `ip:port`), so it carries installation and inspection and cannot carry API
traffic. That is the arrangement the gate asks for.

**This row is proven and survives the HOLD.** `REMOTE_MOBILE_DATA = PROVEN` as a
device condition. What is unproven is that the *product* ran over it.

## The client binary — built, verified, installed

Provenance: [`build-provenance.json`](build-provenance.json). Build log:
[`android-release-build.txt`](android-release-build.txt).

The build installed on 31 Aug was a **Metro debug build** — it needs a bundler and
two `adb reverse` routes to run at all, which is precisely the dependency this
gate forbids. So RCC built a **standalone staging release**:

```
EXPO_PUBLIC_API_URL=https://alpha-api.lawmind.co
EXPO_PUBLIC_APP_ENV=staging
gradlew :app:assembleRelease --no-daemon      # BUILD SUCCESSFUL in 7m 41s, exit 0
```

Two things were checked rather than assumed:

- **The origin is really baked in.** `assets/index.android.bundle` was unzipped
  out of the APK and searched: `https://alpha-api.lawmind.co` is present in the
  Hermes string table. `localhost:3000` is also present exactly once — it is the
  `development` literal inside `resolveBaseUrl`, and `APP_ENVIRONMENT` is
  `staging` in this binary, so that branch is unreachable.
- **The installed package is a release on a clean slate.** Before:
  `flags=[ DEBUGGABLE … ]`, last updated 31 Aug. After an uninstall and install:
  `flags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP KILL_AFTER_RESTORE ]` —
  `DEBUGGABLE` gone — with `firstInstallTime == lastUpdateTime == 2026-09-18
  01:08:42`. No Metro, no prior app state, so a cached-corpus false positive is
  not available to this run.

The app launches and stays alive: `am start -n co.lawmind.app/.MainActivity`
started it, `pidof co.lawmind.app` → `28311`, and `logcat -b crash` held nothing.
It is running **behind the keyguard**, which is as far as it can get.

## BLOCKER — the phone is locked, and that is a credential

```
dumpsys window   → mCurrentFocus=Window{… u0 Bouncer}, isKeyguardShowing=true
wm dismiss-keyguard → no effect; the bouncer stays
locksettings get-disabled → false        (a secure lock IS set)
dumpsys trust    → deviceLocked=1, trustState=UNTRUSTED, strongAuthRequired=0x2
```

`strongAuthRequired` is non-zero, so even a biometric would not clear it — the
PIN itself is required. Entering it is not something RCC may do, and the
screenshot of the bouncer is blank because Android marks it secure.

This is the one category the standing orders keep as a real blocker: **a
credential, held by a person.** It is not a console action, not a missing design
and not an absent token, so there was no version of it RCC could work around.
Everything downstream of it — Search, Reader, Save, Matter, relaunch persistence
— is untouched and unclaimed.

**To resume, the founder unlocks the S24 and leaves it unlocked.** Nothing else
is needed: the binary is installed, the network is already in the right state,
and a watcher is polling `isKeyguardShowing` so the run continues the moment it
clears.

## A defect found on the way, and handed to LCC

Full record: [`magic-link-origin-question.json`](magic-link-origin-question.json).

While working out how the phone would complete sign-in, RCC found that **the
emailed sign-in link from this deployment appears to land nowhere.**

- better-auth's HTTP handler is **not mounted** on the API at the deployed sha —
  `git show 27b55fa4:services/api/src/app.ts` has no `/api/auth` mount, only the
  four `POST /auth/*` routes the client calls directly.
- Every plausible landing path 404s on the live host, with **no redirect**:
  `/api/auth/magic-link/verify`, `/auth/magic-link/verify`, `/magic-link/verify`,
  `/api/auth/ok`, `/api/auth/session`.
- The Android client claims **no https host**. `MainActivity`'s only `VIEW`
  intent-filter is `android:scheme="lawmind"`; the https entry in the manifest is
  inside `<queries>`, which is a visibility declaration, not a filter.

So the URL better-auth mints from `AUTH_BASE_URL` cannot reach
`apps/mobile/app/auth/verify.tsx`, whichever of the two plausible values it
holds: an https origin 404s, and a `lawmind://` origin would open the app on
`/magic-link/verify`, which is not a route.

This is **EVIDENCED, NOT CONFIRMED.** The missing observation is the runtime
value of `AUTH_BASE_URL` on the API host, and one real sign-in email settles it.
Both live on LCC's side of the line, so RCC neither read them nor proposed a fix.
`services/**` and deployment config were not touched.

It does not block RCC's own gate row: the app sends `POST /auth/magic-link`
itself, and the token can be replayed as `lawmind://auth/verify?token=…`, which
makes the app call `POST /auth/verify` over the same cellular link. That tests
the client honestly and leaves the defect where it belongs.

## CORRECTIONS

- **An earlier assumption in this round was wrong and was dropped.** RCC first
  planned to reuse the installed app. It is a Metro debug build, so every run
  would have depended on `adb reverse tcp:8081` — the exact dependency the gate
  forbids. The release build replaced that plan before anything was measured.

## NOT_DONE

Every product row. None of them was attempted, so none is reported either way:
`REMOTE_AUTH`, `REMOTE_SEARCH`, `REMOTE_READER`, `REMOTE_SAVE`, `REMOTE_MATTER`,
`RELAUNCH_PERSISTENCE`, and the elapsed-time and HTTP-error observations that go
with them. `CRASHES / ANRs / OOM`: none seen, but the app only ever sat behind a
keyguard, so that is not evidence of stability under use.

## Not RCC's, and not touched

`services/**`, migrations, DigitalOcean configuration, DNS, remote databases,
SSH, deployments, HNSW and semantic search, citation and statute work, latency
thresholds and server timeouts. No DigitalOcean resource was created, changed or
destroyed.

## HTTP_ERRORS, CRASHES, ANRs, OOM

No client request was made, so there is nothing to report from the product. For
completeness, the probes RCC ran **from the workstation, not the phone**:

| probe | result |
| --- | --- |
| `GET /version`, `/health`, `/ready`, `/release/capabilities` | 200 |
| `POST /search {"query":"2022 INSC 690","language":"en"}` | 200 in 0.355 s, 1 result, `SATENDER KUMAR ANTIL v. CBI`, `verificationState verified`, `verifiedBySource corpus`, `overruledStatus none`, `canAddToMatter true`, `retrievalOutcome.state answered` |
| `POST /search` with no `language` | 400 `INVALID_REQUEST` — correct validation, recorded so it is not mistaken for an outage |
| the five magic-link landing paths | 404, no redirect (see above) |

`logcat -b crash` was empty and the app process stayed alive behind the keyguard.
That is **not** a stability result: the app was never used.

## The phone was left ready, deliberately

Wi-Fi is still **off** and mobile data still **on**. That is not a fault and it
is not an oversight — it is the state the test needs, left in place so the run can
continue the moment the phone is unlocked. Turning Wi-Fi back on before the run
would void the row. The founder can of course restore it; the round would then
re-prove the network state from scratch rather than trust it.

## COMMITS and evidence paths

| | |
| --- | --- |
| `HEAD_START` | `8def684c74cc1e8c02b7dd6890dc5ecd77a4ad2f` |
| commits | `b9afb186` (this evidence set and the founder-queue entry), `f9cf0d99` (bus handoffs and the held queue item), and the commit carrying this closing section — `git log -1 -- docs/ai/rcc-r31/ROUND.md` names it |
| `HEAD_FINAL` | that third commit |

- [`ROUND.md`](ROUND.md) — this record
- [`build-provenance.json`](build-provenance.json) — SHAs, build env, baked-origin proof, install proof
- [`magic-link-origin-question.json`](magic-link-origin-question.json) — the LCC handoff, with what is verified and what is not
- [`android-release-build.txt`](android-release-build.txt) — the full Gradle log, `BUILD SUCCESSFUL`, exit 0
- [`device/network-proof-before.txt`](device/network-proof-before.txt) — the network state, captured before anything else
- [`device/01-launch.png`](device/01-launch.png) — the lock screen, showing Vi India / 5G and no Wi-Fi glyph
- [`device/02-unlock-attempt.png`](device/02-unlock-attempt.png) — blank, because Android marks the bouncer secure
- bus `1795` (FIFTH), `1796` (NEW3), `1797` (LCC)
- [`../../FOUNDER_QUEUE.md`](../../FOUNDER_QUEUE.md) — FQ-RCC-S24-UNLOCK

**`RCC_GATE_C_MOBILE = HOLD — the S24 is locked behind a secure credential; the
product flow was not run and nothing is claimed for it.`**
