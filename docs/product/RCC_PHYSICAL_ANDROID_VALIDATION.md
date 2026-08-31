# RCC — physical Android device validation

**EVIDENCE CLASS: `PHYSICAL_ANDROID_LOCAL_ADB_EVIDENCE`.**

**This is NOT `GATE_C_REMOTE_DEVICE_EVIDENCE`, and must never be counted as it.**
Gate C requires a REMOTE API reached over mobile data. Every request below went to
`http://localhost:3000` on the workstation through `adb reverse tcp:3000 tcp:3000`.
The distinction is the whole point of the classification: this proves the client
works on real Android hardware, and proves nothing whatever about hosting.

`PAID_INFRA_CREATED = NO` · `BILLING_STARTED = NO` · no deployment, no backend or
contract change.

## Rig

| | |
|---|---|
| device | Samsung SM-S921B (Galaxy S24), serial RZCX90X1BNF |
| android | 16 (SDK 36), arm64-v8a |
| screen | 1080x2340, 450dpi effective |
| transport | wireless adb, `192.168.1.21:40485` (paired, no cable) |
| api | local Hono dev server, port 3000, local Postgres `127.0.0.1:5432` |
| bridge | `adb reverse tcp:3000 tcp:3000` |
| build | `expo run:android` debug, JDK 17, Gradle 9.3.1, `BUILD SUCCESSFUL 9m10s` |

Two rig facts worth keeping, because both cost time:

- **`JAVA_HOME` pointed at a JDK that is not on this machine** (a removed Adoptium
  install). Gradle's own toolchain cache had a working
  `~/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2`. Android Studio's bundled
  JBR is **JDK 25**, on which `:react-native-worklets:configureCMakeDebug` fails.
- **The installed app was three weeks stale** and `expo-device` / `expo-notifications`
  had been added since, so a JS-only reload would have crashed. Native deps moved
  ⇒ full rebuild.

## Core loop, exercised by touch on the device

| step | result | evidence |
|---|---|---|
| `ANDROID_LOGIN` | PASS | session restored from SecureStore across a cold reinstall; `/me` 401 → `/auth/refresh` 200 → `/me` 200 observed, so rotation works |
| `ANDROID_SEARCH` | PASS | `POST /search` 200; results rendered |
| `ANDROID_READER` | PASS | `GET /judgments/:id` 116ms, `/authorities` 54ms |
| `ANDROID_SAVE` | PASS | `POST /matters/:id/authorities` → **201** |
| `ANDROID_SAVED_AUTHORITIES` | PASS | AUTHORITIES section rendered with citation and remove action |
| `ANDROID_MATTERS` | PASS | list, detail, timeline, next-hearing, client update |
| `ANDROID_ACCOUNT` | PARTIAL | profile affordance reached; not exhaustively walked |

Test data written during the walk was removed through the product's own path.
`matter_authorities` is soft-delete, so **two rows remain with `removed_at` set**
(`2026-08-31T17:36:39Z`, `17:37:08Z`) rather than vanishing. Stated because an
append-only table cannot be tidied and pretending otherwise would be false.

## Citation harness on real hardware

Rendered from the database row, correctly, on device:

- `2014 INSC 809` — **OVERRULED** chip, **title struck through**, danger band.
- An Allahabad HC result — **"No citation on file — cannot be referenced in a
  filing"**, neutral ink, shown rather than dropped.
- A verified good-law authority — **no badge at all.** Verified is silent.
- Offline — **"Showing what is saved on this phone · read 6 minutes ago"**: the
  status last read, carrying its as-of, never presented as current.

### A6 (R14) — all three fields observed driving behaviour

- `citableForUntouchedPropositions` → "Still citable for propositions the later
  judgment did not reach.", on the saved-authority surface.
- `canAddToMatter` → permitted the save. **Positive proof, not absence:**
  `renderState.ts` computes `blocksSetAside = canAddToMatter === undefined ? true
  : !canAddToMatter`, so an omitted field blocks. It did not block.
- `precedentialEffect` → drove treatment copy rather than the banner.

Corpus counts reproduced independently before reading NEW3's prose: **73
`set_aside` + 17 `doubted` + 8 `partly_set_aside` = 98** non-`none` of 18,759,868.

## Long judgment — Kesavananda Bharati, 2,878,447 characters

`gfxinfo` across scripted scrolling:

```
Total frames rendered  203
Janky frames             1 (0.49%)
p50 6ms · p90 9ms · p95 9ms · p99 13ms
Missed Vsync 0 · Slow bitmap uploads 0 · Frame deadline missed 1
```

No crash, no ANR, no OOM. Reading view paginated `1 of 6`.

Caveats: the device has **reduced-motion enabled**, so some animation is disabled;
and `High input latency 135` is an artefact of `adb input swipe`, whose synthetic
events carry artificial timestamps — not a product reading.

## Honest failure states (§7)

| state | rendered |
|---|---|
| API unreachable | "You appear to be offline" — true; connection refused |
| slow but successful | **was** "You appear to be offline" — **fixed**, see below |
| query too broad | "This search was too broad to run" + "See what we hold" |
| one arm degraded | "Showing partial results — one search method could not complete in time." |
| no citation on file | shown, with "cannot be referenced in a filing" |
| offline cached data | shown with its as-of timestamp |

`DISCONNECT_STATE` graceful · `RECONNECT_STATE` recovered via "Try again",
`/search` 200 in 90ms · **`DATA_LOSS = NO`**.

## Defects found and fixed — commit `e52e61eb`

1. **Tab bar drawn under the system navigation bar.** Nav bar owns y2205–2340;
   the tab row ran to y2256. 51px of every tab — the entire label row — sat
   inside it. Cause: `size.tabBarInset` is 30dp, the iOS home indicator, applied
   flat. Now `Math.max(token, insets.bottom)`; row terminates at exactly y2205.
2. **A slow search told the advocate they were offline.** `/search` answered
   `200` in **15,334ms** against the client's **15,000ms** budget, on full WiFi.
   `timeout` no longer sets the offline state. Cold 15,334ms vs warm 771ms, so
   the budget is unchanged and the cold-start cost is reported to LCC, not
   patched over.
3. **An authority cited twice could vanish from RELIED ON.** Kesavananda: 47
   citation rows over 44 distinct authorities; React logged three duplicate-key
   errors, and its documented behaviour is that children "may be duplicated
   and/or omitted". Deduped on identity — which also fixes the headline count,
   where one twice-cited set-aside authority read as two.

Verified on device: reopening the judgment that produced all three errors now
produces **zero**.

## Checked, and NOT defects

- **No Drafts tab** — deliberate, R12 §3/§7, drafting is not in v1.
- **Add-to-matter enabled on an OVERRULED card** — OD-14 working. `canAddToMatter`
  was `true`; blocking on the banner alone "would silently re-block every
  authority OD-14 was written to unblock" (`renderState.ts`). Recorded because
  the next person on a device will misread it exactly as I first did.

## Not covered

Account/settings not walked exhaustively · orientation and font-scaling not
swept · Hindi/Devanagari rendering not exercised · **no remote API, no mobile
data, therefore nothing here bears on Gate C**.
