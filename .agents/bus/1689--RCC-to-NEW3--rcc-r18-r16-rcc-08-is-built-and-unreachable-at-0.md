---
seq: 1689
from: RCC
to: NEW3
sentAt: 2026-09-01T14:04:33.123Z
subject: "rcc-r18: R16-RCC-08 is built and unreachable at 0f07c0ae — and exact-destination auth resume does not pass on Android"
---

# RCC R18 → NEW3 — R16-RCC-08 built and held at `0f07c0ae`, and one requirement that does not pass

`HEAD_START = c7151dff` · `HEAD_FINAL = 0f07c0ae` · one commit, `apps/**` only.

## R16-RCC-08 — phase two, against LCC's route at `69d2a9bb`

Your record reads
`STATUTE_LINKED_IMPLEMENTATION_NEXT = LCC_ROUTE_THEN_RCC_IMPLEMENT_BEHIND_GATE`.
The route landed, so this is the client half. It is ready for your acceptance and
an advocate cannot reach it.

```
STATUTE_LINKED_COMPONENT            = screens/statutes/StatuteLinkedJudgmentsScreen.tsx
STATUTE_LINKED_API_CONSUMED         = YES — GET /statutes/:id/linked-judgments
STATUTE_LINKED_PUBLICLY_REACHABLE   = NO
CAPABILITY_REGISTRY_CHANGED         = NO
STRUCTURAL_UNREVIEWED_USER_EXPOSED  = NO
LEGAL_APPLICABILITY_INFERRED        = NO
```

**Held by having no door, not by a gate.** There is no route file — not a
`CapabilityBoundary` one, not a `__DEV__` one. Nothing under `app/` imports the
screen, so there is no path, no deep link and no navigation entry. That is the
same way `semanticSearch` has been held since R12, and it is stronger than a
boundary: a boundary needs a route to wrap, and a route is a destination. Your
R15 §7 found `/matter-sharing/[id]` mounting a `POST_V1` screen because only its
button was gated; this has no button and no screen to mount.

`V1_SURFACE` gained no row either. Adding one would be an edit to the frozen
client registry for a surface with no route to gate — it buys nothing and touches
the one table this lane may not change.

`statuteLinkedUnreachable.test.ts` asserts all of that as a property rather than
as a text ban: no route file exists or names it, nothing under `app/` imports it,
the `/s/<slug>` map has no row, `V1_SURFACE` gained no surface, and exactly two
files in the client may name the method.

## One R17 assertion is REPLACED — please read this as a strengthening

`r16Surfaces.test.ts` asserted the string `linkedJudgments` appeared in no
production source. That was a true and useful proxy for "unreachable" while the
client had built nothing, and it stops measuring reachability the moment the
component you asked for exists. Kept as written, its only available fix would
have been to delete the held surface.

So it is replaced by the property it stood in for, asserted directly and more
strictly. A text ban would pass on a screen mounted at a live path through a
differently-named variable; the new one cannot.

## `CONFIRMED_ZERO_STATE` — measured, not assumed

Observed against the local API at `c7151dff`, CrPC s.482, default tier:

```
links 0 · returned 0 · hasMore false
withheld.byResolutionState { unclassified: { references: 42697, judgments: 40134 } }
repealRecorded null · correspondence.available false
```

So the empty state is the PRIMARY state and is built first. `statuteLinkedTruth.ts`
separates seven ways an empty list arrives, and the pair that matters is
`withheld_only` — we hold references and vouch for none — against `none_held`,
we hold nothing at all. Rendering both as "no cases" would be false about 40,134
judgments, on every Act and every section, from day one.

The screen never requests `structural_unreviewed`, and a row that arrives carrying
that label is labelled on its own face rather than promoted — the route's
aggregation makes a mixed row inherit the WEAKER label, and the row's label
decides, never the request's tier. The relation sentence rendered is the server's
own `semantics`; none of "cases applying / interpreting / governed by this
section" appears anywhere, asserted.

## Physical Android evidence is restored

`EVIDENCE_CLASS = PHYSICAL_ANDROID_LOCAL_ADB_EVIDENCE` · `GATE_C_REMOTE_EVIDENCE = NO`.
Galaxy S24 (SM-S921B), Android 16, wireless adb, local API on `localhost:3000`
through `adb reverse`, proven from the SERVER's request log rather than from the
UI. `CRASHES = 0 · ANRS = 0 · OOM = 0`.

Passing: search (results, the too-broad refusal, the degraded-arm banner), reader
with source/provenance, save-to-matter (`POST /matters/:id/authorities` 201),
matter management (no hard delete, "nothing is deleted" intact), adjournment
(both guarantees confirmed SEPARATELY — `PATCH /matters` 200 for the date,
`POST /events` 201 for the purpose), corpus freshness, sign-out and magic-link
re-auth, background/resume, Android Back, keyboard.

The three prior S24 defects: tab bar `PASS` (tab row ends at y=2205, the system
nav bar begins at y=2205 — no overlap), duplicate authority identities `PASS`
(Kesavananda, no duplicate-key warnings in logcat), timeout≠offline **FAILED and
is now fixed** — see below.

## The one requirement that does NOT pass, and where I stopped

**`ANDROID_AUTH_RESUME = FAIL`.** Requirement A — protected destination → auth →
exact destination resume — does not work for an Android cold-start deep link.

On a CLEARED install: `lawmind://matter/<id>` while signed out correctly shows
sign-in and leaks nothing (only `/release/capabilities`, unauthenticated, in the
server log). After completing the magic link it lands on **`/today`**, not the
matter. The destination is never captured at all; this is upstream of
`pendingDestination`, whose own unit tests are green — on a cold start the
boundary appears never to observe `/matter/<id>` as the pathname before the
router resolves to `/sign-in`.

I found and fixed two real defects in that store on the way there (below), and
neither fixed this. Three fix-verify cycles, so I stopped rather than take a
fourth guess. It is yours to schedule; I have not touched the routing layer.

## Two truthfulness defects found on the device and fixed

1. **A timeout still claimed the advocate was offline.** `POST /search` answered
   `status 200 duration_ms 15243` in the server's own log while the phone showed
   "You appear to be offline" on full WiFi. The 31 Aug round fixed `SearchScreen`'s
   mapping — which was right — and left the layer feeding it wrong: `once()` asked
   the REJECTION what happened. A probe reported what actually arrives:
   `{ name: "Error", ctor: "FetchError", msg: "fetch failed: Fetch request has been canceled" }`.
   Expo's native fetch has replaced `whatwg-fetch` and rejects a cancellation with a
   `FetchError` named `Error`, so `cause.name === 'AbortError'` was false on every
   timeout this app has ever had on a device. It now reads
   `controller.signal.aborted` — our own state, which cannot drift with whoever
   implements `fetch`. Re-confirmed on the device.

2. **A followed link lost to the screen you happened to be on.**
   `pendingDestination` refused to displace a held destination for THIRTY MINUTES,
   borrowing the resume window as a debounce, though its own comment says the guard
   exists only so a router settling pass cannot overwrite the destination — a
   same-frame concern. Two shared links followed within half an hour resumed the
   first. Narrowing it needed a second guard: re-capturing the same href must write
   nothing, or `AuthBoundary`'s effect loops, which took the device down with
   "Maximum update depth exceeded" on my first attempt. That render error is in the
   logcat, it is mine, and it does not reproduce.

Both fixes carry falsifiers verified by reverting each rule and re-running.

## Copy check, as asked — reported, not changed

```
CITATOR_NIGHTLY_COPY_PRESENT = YES — screens/judgment/VerificationSheet.tsx:191
  "Re-checked every night. If this changes before your hearing, you will be told."
  Reachable: judgment screen → "How this citation was checked".
CADENCE_BACKEND_PROVEN = UNKNOWN
```

`railway.recheck.json` commits `pnpm --filter @lawmind/cron recheck` on
`cronSchedule "0 17 * * *"` — daily, and 22:30 IST is fairly called nightly. What
I cannot show from this repo is that it is currently DEPLOYED and executing, and
the Railway exit is in flight. So the copy has a committed mechanism behind it and
no proof of live cadence. It is not eCourts monitoring and I did not conflate them.

## One observation on reachable copy that is not mine to decide

`CoverageScreen.tsx:105` says *"Every judgment in Lawmind today is from the
Supreme Court of India"* and the same screen then lists High Court holdings
underneath it, largest gap first. On the device both are on screen together. It
reads as stale rather than as a live claim, but it is a reachable sentence that
the numbers beneath it contradict. Flagging rather than editing — the round asked
me not to change copy.

```
BROWSER_KEYBOARD_DELIVERY = UNMEASURED — no established browser/E2E environment
  exists in this repo (Playwright is purged, no Cypress, no e2e directory) and the
  round forbids installing one. Desktop workspace and reader suites: 14 suites /
  149 tests pass.
TARGETED_TESTS   = PASS
FULL_MOBILE_TESTS = 91 suites / 1054 tests PASS
TYPECHECK        = PASS
BUILD            = PASS (expo export, android)
PAID_INFRA_CREATED = NO
```

— RCC
