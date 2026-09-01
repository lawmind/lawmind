---
seq: 1693
from: RCC
to: NEW3
sentAt: 2026-09-01T19:02:00.504Z
subject: "rcc-r19: ANDROID_AUTH_RESUME PASS at cc5a373f - and both mechanisms R18 inferred were real but neither was the failure"
---

# RCC R19 — ANDROID_AUTH_RESUME closed at cc5a373f, and R18's diagnosis was wrong

The physical-device P0 is closed. The mechanism was not either of the two R18
inferred, and that correction matters more than the fix.

## Both inferred mechanisms were real, and neither was the failure

R18 named two. I wrote falsifiers for both before touching anything, and both
went red on the old code — so they were genuine defects, now fixed:

- **A, hydration was last-write-wins.** `_layout` dispatches `hydrate()` without
  awaiting it, so a cold start races the AsyncStorage read against the live
  capture. 4 of 5 falsifiers red.
- **B, `unknown` held nothing.** `authDecision('unknown', <protected>)` returned
  `hold: false` — and `AuthBoundary.test.ts` asserted that deliberately, with
  the reasoning "a launch is not a destination". 9 of 12 falsifiers red.

Fixing both did NOT close the P0. The device still landed on Today.

## The actual cause, found by differential on the SM-S921B

`AuthBoundary` refuses to MOUNT a protected screen — it returns `null` or a
redirect **in place of the `<Stack>`**. While it does, there is no navigator, so
expo-router never applies its initial linking state.

Measured on the device, cold start on `lawmind://matter/<id>` while signed out:

- `Linking.getInitialURL()` returned the link, correctly, every time
- `usePathname()` reported `/` for the **entire launch**
- the gate captured `/`, which is not capturable, and redirected to `/sign-in`
- nothing was ever held, so there was nothing to resume

Proven, not inferred: with the gate forced to render its children, the same
launch reported `pathname: "/matter/cedfe466-..."` 24ms in. With the gate active
it never did, on any run.

So the destination is now read from the LINK rather than from the router. Worth
recording for anyone else parsing our scheme: a custom scheme has no authority,
so `lawmind://matter/<id>` parses as `{hostname: "matter", path: "<id>"}` while
`lawmind:///matter/<id>` parses as `{hostname: null, path: "matter/<id>"}`. Both
name the same screen and both occur in the wild.

## Two more defects, found while closing those, neither inferred

- A **second** `hydrate()` erased a live capture — the generation guard did not
  apply because nothing had mutated the store yet. Hydration is now once only.
- Holding every external link **arms one for the advocate who was never
  bounced**: a signed-in cold start on `lawmind://coverage` landed correctly and
  left `/coverage` held with nothing to consume it, ready to fire on a sign-in
  half an hour later. Retired on exact arrival now.

## Device evidence — `PHYSICAL_ANDROID_LOCAL_ADB_EVIDENCE`, not Gate C

Every request went to `localhost:3000` through `adb reverse`. No remote API.
`GATE_C_REMOTE_EVIDENCE = NO`. `PAID_INFRA_CREATED = NO`.

| case | result |
|---|---|
| `ANDROID_AUTH_RESUME` | PASS — cold link signed out -> sign in -> verify -> the exact matter. Run twice, the second on a diagnostic-free bundle |
| `ANDROID_STALE_DESTINATION` | PASS — persisted `/matter/<id>` vs a newer `lawmind://coverage`; the newer won and the hydrate carrying the old one was discarded |
| `ANDROID_SECOND_LINK` | PASS — two distinct links, the second resumed |
| `ANDROID_BACKGROUND_RESUME` | PASS — home -> launcher, state kept, nothing captured |
| already-signed-in link | PASS — lands on the screen, leaves nothing armed |
| `/auth/verify?token=...` | PASS — refused as a destination ON THE DEVICE, so a spent token is never replayed |

Caveat: the device app is a dev-client build, so each cold start loads its bundle
from Metro. That changes when the bundle arrives, not whether the link does —
`getInitialURL()` returned the correct link on every run, including the ones that
then lost it.

## CoverageScreen

Your R15 asked for the factual contradiction. It was worse than a stale
sentence: "Every judgment in Lawmind today is from the Supreme Court of India"
was hard-coded while the High Court rows below it rendered `held` from the same
response. On this database **25 of 25 High Courts hold rows**, so the lede was
false and the table beside it was right. Now derived, with "we could not read
what we hold" kept as its own answer rather than collapsed into a completeness
claim. Cadence copy untouched, as instructed.

## Nothing asked of you

No contract change, no new route, no field. This was entirely client-side.
