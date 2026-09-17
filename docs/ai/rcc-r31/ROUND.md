# RCC R31 — Gate C against the DigitalOcean API on the physical S24

**Verdict: FAIL.** Not "not finished" — falsified. **The emailed sign-in link
from this deployment does not resolve.** It was tapped on the founder's phone and
opened the API's own `404`. Sign-in is the only credential this product has, so
every product row behind it is unreachable, and the advocate loop this gate exists
to prove does not complete.

Separately, and independently disqualifying: **this was not a mobile-data test.**
The SIM carries no working data service, so the run was done over Wi-Fi at the
founder's direction. `REMOTE_MOBILE_DATA` is NOT proven and is not claimed.

Two independent reasons this row could not be PASS today. Only one of them is a
defect.

## Start state

| | |
| --- | --- |
| `HEAD_START` | `8def684c74cc1e8c02b7dd6890dc5ecd77a4ad2f` = `origin/main` |
| working tree | dirty repo-wide (other lanes' artifacts); **`apps/**` porcelain count 0** at start |
| `CLIENT_SHA` | `8def684c…` — the binary under test was built from it with no local client edits |
| `REMOTE_API_SHA` | `27b55fa45c902c9ce83a2f4214698c181cd3054e`, read live from `GET /version` |
| round dir | `docs/ai/rcc-r31/` — next unused after `rcc-r30`; nothing overwritten |

`CLIENT_SHA` and `REMOTE_API_SHA` differ by exactly one commit, `8def684c`, which
touches only `docs/`. `git diff --name-only 27b55fa4..8def684c -- apps/ services/
packages/` returns nothing, so client and server are the same release in every
code path.

Remote liveness at the time of the run: `/version`, `/health`
(`database.reachable true`, `latencyMs 2`) and `/ready` (`splitMode split`,
`rolesDistinct true`, `servingEnv staging`) all answered.

Recorded, not acted on, because it is LCC's: `/version` reports
`environment: "production"` while `/ready` reports `servingEnv: "staging"`.

## THE FAILURE — the sign-in link goes to a 404

Full record: [`magic-link-origin-question.json`](magic-link-origin-question.json).

The app sent the link itself, over the public endpoint, and said so:
**"We sent a link to sof9tk@gmail.com."** The email arrived in under a minute,
from Lawmind, subject *Your Lawmind sign-in link*. All of that is correct.

The link inside it is:

```
https://alpha-api.lawmind.co/api/auth/magic-link/verify?token=<redacted>&callbackURL=%2F
```

Tapped on the phone, it opened a browser on the API's own error:

```json
{"ok":false,"error":{"code":"NOT_FOUND","message":"no route for GET /api/auth/magic-link/verify"}}
```

Evidence: [`device/05-emailed-link-404.png`](device/05-emailed-link-404.png). The
token is not in that image — the address bar truncates it and the body carries
only the path. RCC did not extract, transcribe or store the token, and committed
no image containing it.

**Why it happens.** better-auth mints the URL from `AUTH_BASE_URL`, and this API
does not mount better-auth's HTTP handler at all — at the deployed sha,
`services/api/src/app.ts` has only the four `POST /auth/*` routes the client calls
directly. Five plausible landing paths were probed and every one is `404` with no
redirect. The Android client also claims no https host: `MainActivity`'s only
`VIEW` intent-filter is `android:scheme="lawmind"`.

**This is LCC's.** `services/**`, `packages/auth/**` and deployment configuration
were not touched, and no fix is proposed here. It is release-blocking rather than
staging-only: the magic link is the sole credential in this product.

## What that blocks, and why nothing downstream could be substituted

`app/index.tsx` redirects a `signed_out` launch to `/sign-in`, and
`components/AuthBoundary.tsx` holds the line on every route. There is no
unauthenticated browsing surface, so **Search, Reader, Save and Matter are not
reachable without a session** — not even read-only, and not by deep link.

The two ways to get a session without the emailed link were both closed:

- **Replaying the token** as `lawmind://auth/verify?token=…` would work, and is
  what earlier rounds did. It requires handling the credential out of the email,
  which this session is restricted from doing, and the restriction is right.
- **A scripted staging principal** (`gatec-smoke-*@lawmind.test`) needs the
  deployment's `AUTH_SECRET`. That is LCC's secret on LCC's host.

So `REMOTE_SEARCH`, `REMOTE_READER`, `REMOTE_SAVE`, `REMOTE_MATTER` and
`RELAUNCH_PERSISTENCE` are **NOT RUN**. None is claimed either way. The one thing
known about the backend behind them, from a workstation probe rather than the
product: `POST /search {"query":"2022 INSC 690","language":"en"}` answers 200 in
0.355 s with `SATENDER KUMAR ANTIL v. CBI`, `verificationState verified`,
`verifiedBySource corpus`, `overruledStatus none`, `canAddToMatter true`. That
says the server is healthy. It says nothing about the client, which is what this
gate measures.

## NETWORK — what was proven, and what was not

**`REMOTE_MOBILE_DATA = NOT PROVEN.`** The founder stated mid-run that the SIM has
no mobile data and asked for Wi-Fi. That was independently confirmed before
switching, rather than taken on trust:

| observation | reading |
| --- | --- |
| cellular network `103` capabilities | `INTERNET` is **declared**, `VALIDATED` is **absent** — Android's own connectivity probe never succeeded on it |
| the IMS network `100` on the same SIM | carries `VALIDATED`, which proves the field is populated and meaningful on this device |
| `ping alpha-api.lawmind.co` from the device | `unknown host` — DNS did not resolve over cellular |
| the app's own request on that link | timed out after the client's 15 s budget |

A data bearer that attaches and blackholes is not a mobile-data test. It would
have produced a Gate row that said "mobile data" and meant "no network", which is
worse than no row.

**The Wi-Fi run was still a genuinely remote run**, and that part is proven:

| claim | evidence |
| --- | --- |
| no ADB networking route | `adb reverse --list` and `adb forward --list` both **empty** throughout |
| no localhost API | `EXPO_PUBLIC_API_URL=https://alpha-api.lawmind.co` is baked into the Hermes bundle of the APK itself |
| no tunnel | no `tun`/`tap`/`ppp`; the Wi-Fi agent is `NOT_VPN`; `always_on_vpn_app` null; `private_dns_mode` null |
| single transport | `mobile_data 0`, `wlan0` up and `VALIDATED`, default route `0.0.0.0/0 -> 192.168.1.1` |

Captured at three points:
[`network-proof-before.txt`](device/network-proof-before.txt) (cellular, before
anything), [`network-proof-at-run.txt`](device/network-proof-at-run.txt) (cellular,
after unlock), [`network-proof-wifi-run.txt`](device/network-proof-wifi-run.txt)
(the Wi-Fi run).

So the traffic left the phone and crossed the public internet to a public HTTPS
origin. What is missing is only that the carrier was not the bearer.

## The client binary

Provenance: [`build-provenance.json`](build-provenance.json).

The build on the phone was a **Metro debug build** — it needs a bundler and
`adb reverse tcp:8081` to run at all, which is exactly the local dependency this
gate forbids. A dev build and a remote-network claim are mutually exclusive, so
RCC built a standalone staging release, checked the origin was really baked in
(unzipped `assets/index.android.bundle` out of the APK and found the host in the
Hermes string table), and installed it fresh: `DEBUGGABLE` gone,
`firstInstallTime == lastUpdateTime`. No Metro, no prior app state, so a
cached-corpus false positive was not available to this run.

## A CLIENT DEFECT FOUND AND FIXED — the timeout said "search" everywhere

While the cellular link was still attached-but-dead, the advocate tapped
**`Send me a link`** on the **sign-in** screen and was told:

> **"The search took longer than we wait for. It may still be running."**

There is no search on that screen. `apps/mobile/src/api/client.ts` held that
sentence in the TRANSPORT — the layer every route shares — and `SignInScreen`
renders `error.message` verbatim because it has no timeout copy of its own. So
every timed-out request in the app, on any screen, reported a search.

It also mis-stated the stakes: *"it may still be running"* invites the advocate to
wait for a search to land, when what was in doubt was whether a sign-in email had
been sent — a thing you retry, not a thing you wait for.

**The fix** is one sentence, and it names no operation:

> "That took longer than we wait for. It may still have gone through."

The reasoning the old comment defended — that this is OUR deadline and the request
may well have been answered — is preserved; only the false specificity is gone. A
screen that wants to name the operation owns copy of its own, as `SearchScreen`
does (it renders its own "This search could not complete" from the code, not this
string).

**Regression coverage** in `client.timeoutNotOffline.test.ts`, asserted on
`api.statutes()` — deliberately a route that is *not* search, because the message
travels with the transport and must be true of every caller.

**The test was checked for being able to fail.** Reverting the production string
to the old copy makes it fail with
`Received string: "The search took longer than we wait for. It may still be running."`;
restoring the fix makes it pass. That check caught a real problem first time
round: written through a shell heredoc, the `\b` word boundaries had become
literal backspace bytes, so the regex matched nothing and the test passed against
the defect. Repaired, re-checked, and the file now holds `/\bsearch(es|ing)?\b/i`
with zero `0x08` bytes.

`npx jest` on the three affected suites: **40 passed**. `npx tsc --noEmit`: clean.

**Retested on the phone, which is what makes it a fix rather than a patch.** The
dead cellular link was restored deliberately to reproduce the original condition,
the rebuilt binary installed, and the same tap repeated:

| | |
| --- | --- |
| before | "The search took longer than we wait for. It may still be running." — [`device/04-signin-timeout-wrong-copy.png`](device/04-signin-timeout-wrong-copy.png) |
| after | "That took longer than we wait for. It may still have gone through." — [`device/06-signin-timeout-fixed.png`](device/06-signin-timeout-fixed.png) |

This was found BY the gate, not alongside it, and it is squarely `apps/**`. It is
not opportunistic polish: a message that is confidently wrong about which
operation failed is the kind of thing this product cannot ship.

## Gate rows

| row | result |
| --- | --- |
| `REMOTE_MOBILE_DATA` | **NOT PROVEN** — the SIM has no working data service |
| `REMOTE_API_ORIGIN` | `https://alpha-api.lawmind.co` — baked into the binary, no localhost, no ADB route |
| `REMOTE_API_SHA` | `27b55fa45c902c9ce83a2f4214698c181cd3054e` |
| `REMOTE_AUTH` | **FAIL** — `POST /auth/magic-link` succeeds and the email arrives, but the link in it resolves to a 404 |
| `REMOTE_SEARCH` | NOT RUN — gated behind a session |
| `REMOTE_READER` | NOT RUN — gated behind a session |
| `REMOTE_SAVE` | NOT RUN — gated behind a session |
| `REMOTE_MATTER` | NOT RUN — gated behind a session |
| `RELAUNCH_PERSISTENCE` | NOT RUN — gated behind a session |
| crashes / ANRs / OOM | none seen. `logcat -b crash` empty across the run, app alive throughout. Weak evidence: the app was only ever on sign-in |

## HTTP errors seen

| where | what |
| --- | --- |
| the emailed link, tapped on the phone | **404 `NOT_FOUND`**, `no route for GET /api/auth/magic-link/verify` — the failure |
| workstation probes of four other landing paths | 404, no redirect |
| `POST /search` with no `language` | 400 `INVALID_REQUEST` — correct validation, recorded so it is not mistaken for an outage |
| everything else probed | 200 |

## CORRECTIONS

Two, both mine, both recorded because they changed what I believed mid-round.

1. **I reported the sign-in email as undelivered, and it had been delivered.** I
   searched Gmail for "lawmind", got no matches, and started writing up a
   delivery failure. Gmail was signed in as `sof9tk@gmail.com` while I had sent
   the link to `bhagava3@gmail.com` — I searched the wrong mailbox. Re-sending to
   the account that was actually open produced the email in under a minute. **A
   negative result from a search is only as good as the scope you searched**, and
   I had not checked the scope. Had I not checked, this round would have blamed
   LCC for a Resend problem that does not exist and missed the real defect.
2. **The first plan was to reuse the installed app.** It was a Metro debug build,
   so every request would have depended on `adb reverse` — the dependency this
   gate forbids. Replaced with a standalone release before anything was measured.

A third near-miss, caught before it could mislead: the new regression test
initially passed against the defect, because a shell heredoc had turned its `\b`
escapes into backspace bytes. Checking that the test could fail is what found it.

## NOT DONE

The four product rows and relaunch persistence, for the reason above. Also not
done, and out of scope: any `services/**` change, any fix to the sign-in link,
and any attempt to obtain a session by handling the emailed credential.

## Not RCC's, and not touched

`services/**`, migrations, DigitalOcean configuration, DNS, remote databases,
SSH, deployments, HNSW and semantic search, citation and statute work, latency
thresholds and server timeouts. No DigitalOcean resource was created, changed or
destroyed. The phone was left with Wi-Fi on and mobile data off, as found.

## COMMITS and evidence paths

| | |
| --- | --- |
| `HEAD_START` | `8def684c74cc1e8c02b7dd6890dc5ecd77a4ad2f` |
| `b9afb186` | the first evidence set and the founder-queue unlock entry, written while the phone was locked |
| `f9cf0d99` | the first bus handoffs (1795/1796/1797) and the held queue item |
| `20e416bc` | closing section of the held record |
| `9fc20c0d` | **the result**: the `apps/**` timeout-copy fix with its regression test, the FAIL record, the confirmed link defect, the founder-queue entry, and the malformed-JSON repair |
| `970d754f` | the bus corrections (1798/1799/1800) |
| `HEAD_FINAL` | `970d754f74fb7b359dfc7e4d90d8560da4138917` |

`b9afb186`, `f9cf0d99` and `20e416bc` were written before the phone was unlocked
and say HOLD. They are left in place rather than rewritten — the corrections above
and bus 1798–1800 supersede them, and a record that quietly re-writes what it
believed an hour ago is worth less than one that shows the change.

- [`ROUND.md`](ROUND.md) — this record
- [`magic-link-origin-question.json`](magic-link-origin-question.json) — the failure, with the confirming observation and what RCC deliberately did not read
- [`build-provenance.json`](build-provenance.json) — both builds, baked-origin proof, install proof
- [`android-release-build.txt`](android-release-build.txt) · [`android-release-build-2.txt`](android-release-build-2.txt)
- [`device/03-app-current.png`](device/03-app-current.png) — the app on sign-in, over cellular
- [`device/04-signin-timeout-wrong-copy.png`](device/04-signin-timeout-wrong-copy.png) — the defect
- [`device/05-emailed-link-404.png`](device/05-emailed-link-404.png) — **the failure**; no token in the image
- [`device/06-signin-timeout-fixed.png`](device/06-signin-timeout-fixed.png) — the fix, retested on the phone
- [`device/network-proof-before.txt`](device/network-proof-before.txt) · [`network-proof-at-run.txt`](device/network-proof-at-run.txt) · [`network-proof-wifi-run.txt`](device/network-proof-wifi-run.txt)
- bus `1798` (LCC), `1799` (FIFTH), `1800` (NEW3) — and `1795`–`1797`, superseded
- [`../../FOUNDER_QUEUE.md`](../../FOUNDER_QUEUE.md) — FQ-RCC-SIGNIN-LINK-DEAD

**`RCC_GATE_C_MOBILE = FAIL — the emailed sign-in link resolves to the API's own
404, so the advocate cannot authenticate and every product row behind sign-in is
unreachable; REMOTE_MOBILE_DATA is independently not proven, the SIM having no
working data service.`**
