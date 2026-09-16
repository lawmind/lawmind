# RCC R28B — B1 on the Galaxy S24: exact-excerpt annotation

**Verdict: `RCC_R28_B1 = PASS`**, after one physically exposed defect was fixed
in this round (§1). Every row below says which evidence class it rests on:
**PHYSICAL** (done on the phone), **DB/API** (read from the database or the wire),
**AUTOMATED** (Jest only). No row substitutes one class for another.

## Environment

| | |
| --- | --- |
| HEAD | `69cf2e23` (`origin/main`): contains RCC R28 `5df329a2`, LCC R31 `47ef42ae` and `69cf2e23` (`merge-base --is-ancestor`, all three) |
| device | `SM-S921B`, Android 16, serial `RZCX90X1BNF`, **USB**, `mStayOn=true`, keyguard off |
| app | `co.lawmind.app` dev build, Metro on 8081 serving this working tree |
| API | local `services/api` (tsx, pid 25024, started 13:55 +04). `/health sha = 1e6510dc`. `git diff 1e6510dc 69cf2e23 -- services/api packages` changes only `search/production-callers.test.ts`, so the running server is **runtime-equivalent to HEAD** |
| database | local `lawmind`, single `DATABASE_URL`, inferred `single`. Not strict-split evidence (LCC owns that) |
| account | `RCC Smoke Advocate`, `users.id cd419982-…` |
| wire log | Validation runs **before** `withIdempotency` (`app.ts` `POST /judgments/:id/annotations`), so a refused 400 leaves no DB trace. To see every request anyway, a local pass-through proxy (host 3001 → 3000) was put in front of the API for the run (`adb reverse tcp:3000 tcp:3001`). It logged method, path, status, and the quote's **length and sha256** only, never the text. Log: [`device/requests.jsonl`](device/requests.jsonl). Reverse restored to 3000 → 3000 and the proxy stopped afterwards |

Every tap came from a `uiautomator` dump or screenshot taken immediately before it.
Two personal notification banners appeared on the phone during the run and were
not touched; no screenshot showing one is committed.

## Source

`segmentParagraphs` (the server's own splitter) on 2022 INSC 690
(`judgments.id 0c13f977-1152-4d03-a8a1-9e489f98bf2e`):
**¶2 = `paragraphIndex 2`, 5,458 characters, sha256 `5ebdcfa117d6…d8d2`**.
This was recomputed during the run, not copied from R27B.

Baseline ([`device/probe-baseline.txt`](device/probe-baseline.txt)):
2 annotations on the judgment (¶3, ¶4), **0 on ¶2**, 2 matters, 2 idempotency
rows on the annotation route.

## 1. Defect found on the phone and fixed — the stale false tint

**PHYSICAL.** On first open, ¶2 was drawn with the `highlighted` style
([`01`](device/01-stale-false-tint-before-fix.png)), although the server held no
¶2 row. The device's AsyncStorage (`RKStorage`, `lawmind.reading.v1`) held
**six** pending ¶2 highlights, each 5,458 characters, with no `annotationId` and
each with its own attempt key (`mu3xjp0d…`, `mu3xl7kc…`, `mu3xlsvj…`,
`mu3xmz79…`, `mu3xp2oo…`, `mu3xrpql…`). These were R27B's refused saves, persisted
by the **pre-R28** store.

R28's rollback stops **new** false tints but never removed ones **already
persisted** on a device. That breaks B1's "no false local highlight after a
deterministic refusal" for every device that met the old bug. A side effect: a
highlighted row shows "Remove highlight" in place of "Save to matter".

**Fix** (`apps/mobile/src/state/reading.ts`, `hydrate`): when stored highlights
load, drop any pending highlight (no `annotationId`) whose quote fails
`isSendableQuote`, and persist the cleaned list. A sendable pending write is an
offline save nothing has disproved, and it stays. Two tests were added in
`reading.refusal.test.ts`; the first failed before the fix.

**PHYSICAL after the fix:** cold relaunch → device storage holds only the two
server-backed highlights (¶3, ¶4). ¶2 renders untinted. The launch sent no POST.

## 2. The rows

| row | class | result | evidence |
| --- | --- | --- | --- |
| `LONG_SELECTOR_PHYSICAL` | PHYSICAL | **PASS** | Long-press on ¶2 opens the sheet: "This paragraph is too long to save whole", `0 / 4000`, both buttons disabled ([`02`](device/02-selector-open-0-of-4000.png)). Long-pressing a word gives native Android handles and the Cut/Copy/Translate/Select all menu; dragging a handle updated the counter (7 → 116). No soft keyboard (`mInputShown=false`) |
| `NO_PRESELECTION` | PHYSICAL | **PASS** | `0 / 4000` on every open, including a reopen right after a save |
| `WHOLE_PARAGRAPH_POSTED` | PHYSICAL + wire | **NO** | Opening the sheet sent zero requests. Across the whole run there were exactly **2** POSTs, lengths 116 and 182 |
| `BARE_SAVE` | PHYSICAL + DB/API | **PASS** | Selected "caution … does not m", UI `116 / 4000` → Save passage. **One** POST: `quoteLen 116`, sha `b796c7a2…4d28`, `paragraphIndex 2`, `paragraphNumber 2`, `matterId null` → 200. **One** new row `9bcfc90f-15b7-45e8-9758-7eb3e9d7009f`: same judgment, pi 2, pn 2, len 116, same sha, occurs **once** in ¶2 at **[4862, 4978)**, `equalsWholeP2 false`, no ellipsis. The quote includes internal newlines, so nothing was trimmed. Row delta **+1**, idempotency rows 2 → 3 |
| `RELAUNCH` | PHYSICAL + DB/API | **PASS** | Force-stop, cold deep link to `?read=1&para=2`. ¶2 tinted. Device storage has exactly one ¶2 entry, carrying `annotationId 9bcfc90f…` and **no attempt key**. Requests: GETs only, `GET …/annotations` 200. Rows stayed at 3. **Duplicate delta 0** |
| `SAVE_TO_MATTER` | PHYSICAL + DB/API | **PASS** | Second excerpt "ipso facto cause … Criminal Appeal", UI `182 / 4000` → Save to matter (inside the sheet) → picked "RCC Sprint 2 Smoke v Local API". **One** POST: `quoteLen 182`, sha `629bbf95…2019`, `matterId cedfe466-cdc1-4be3-b69e-03103593d986` → 200. **One** new row `ba8384ff-8b52-4afd-bdf0-ee06d3fbf752`: matter `cedfe466…`, pi 2, pn 2, len 182, same sha, occurs **once** at **[5203, 5385)**, which does not overlap [4862, 4978). Not the first excerpt, not the whole paragraph. Row delta **+1**, idempotency 3 → 4 |
| `PHYSICAL_EDIT_ATTEMPT` | PHYSICAL + DB/API | **REACHABLE, REFUSED** | Native **Cut** on "caution" (Android showed "Copied."): the field reverted at once. Full field text read from the UI dump: 5,458 chars, sha `5ebdcfa1…` (canonical). Counter `0 / 4000`, both buttons disabled. Then native **Paste** over "merely", immediately followed by a Save tap: the field reverted again (canonical sha), Save stayed disabled, zero POST |
| `INJECTED_TEXT_STORED` | DB/API | **NO** | The final probe with the tamper markers `"caution that caution"`, `"a caution by"`, `"a  by"` found `markerHits: []` on every row. The two ¶2 rows are exact canonical substrings ([`device/probe-final.txt`](device/probe-final.txt)) |
| `PHYSICAL_OVER_LIMIT` | PHYSICAL + wire | **PASS** | Android's own **Select all** selected all 5,458 characters: `5458 / 4000` plus "Select up to 4,000 characters.", both buttons disabled ([`04`](device/04-select-all-5458-refused.png)). Tapping both sent **zero** POSTs and created no row. The device storage read after this step shows no new highlight |
| `AUTOMATED_4001_BOUNDARY` | AUTOMATED | **PASS** | `ReadingView.excerpt.test.tsx`, `excerpt.test.ts` (R28) |
| `FALSE_SERVER_SUCCESS_UI` | PHYSICAL (legacy residue) + AUTOMATED (live 400) | **NO** | The stale-tint residue was fixed and observed physically (§1). A **live** deterministic 400 was **not** exercised on the phone: the client never sends one now, and the server was not modified to force one. The `INVALID_REQUEST` / `INVALID_IDEMPOTENCY_KEY` rollback rests on the automated tests |
| `OFFLINE_PENDING` · `AUTHORITY_SET_ASIDE` | AUTOMATED | **PASS** | `reading.refusal.test.ts`; not exercised physically |
| crashes / ANR / OOM | PHYSICAL | **0 / 0 / 0** | `logcat -c` at the start of the run. At the end, `logcat -b crash` was empty and no `FATAL EXCEPTION`, `ANR in` or `OutOfMemory` lines appeared. The app was still alive (pid 18877) |

Final accounting: annotations on the judgment **2 → 4**, on ¶2 **0 → 2**,
idempotency rows **2 → 4**, matters unchanged at 2. Every change is accounted for
by the two saves above.

## Observations, not B1 defects (not fixed here)

1. **"No matters yet" when the advocate has matters.** On a cold deep link
   straight into a judgment, `MatterPicker` said "No matters yet…" and offered
   "Create a matter", although the account has two matters. The picker reads
   only matters already loaded in memory ("nothing fetched fresh"), and this
   route never loads them. After one visit to Matters it listed both. The
   statement is false, and following it would make a duplicate matter. This
   predates R28 and is a candidate for a later RCC round.
2. **The sheet ignores the bottom safe-area inset.** The bottom of the lower
   button ("Save to matter" in the selector, the second matter row in the picker)
   sits under the Android navigation bar. The button centres are still tappable
   (y 2150–2176 < 2205).
3. **The field opens scrolled to the end** of the paragraph, and its line height
   looks tighter after a reverted edit ([`03`](device/03-after-native-cut-reverted.png)).
   Both are cosmetic.

## Regression after the code change

Full mobile Jest **118 suites / 1,325 tests** · `tsc --noEmit` **0** ·
`expo export --platform android` **0** · hex **pass** · sunlight **pass (WCAG AA)**
· design rules **no new violations**.

## Reproduce

```
cd services/api && DATABASE_URL=… npx tsx ../../docs/ai/rcc-r28/b1-probe.ts ["marker" …]
```

Read-only. It re-splits the judgment, reports each ¶2 row's length, sha256, every
offset at which it occurs, and whether it equals the whole paragraph, plus
matters and annotation-route idempotency counts.
