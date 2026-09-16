# RCC R29 — three S24 defects, fixed and closed on the device

**Verdict: all three defects closed on the S24.** Each row says which kind of
evidence it rests on: **PHYSICAL** (done on the phone), **DB/API** (read from the
database), **AUTOMATED** (Jest only). No row substitutes one kind for another.

## Environment

| | |
| --- | --- |
| HEAD at start | `65371e51` (`origin/main`) |
| device | `SM-S921B`, Android 16, serial `RZCX90X1BNF`, **USB**, keyguard off, `svc power stayon usb` |
| display | 1080×2340, density 450. Navigation bar (3-button) `frame=[0,2205][1080,2340]`, 135 px |
| app | `co.lawmind.app` dev build, Metro 8081 serving this working tree, `adb reverse` 8081 and 3000 |
| API | local `services/api` on 3000 (`/health` 200) |
| account | `RCC Smoke Advocate` (`users.id cd419982-…`). **The server holds 2 matters**: `RCC Sprint 2 Smoke v Local API`, `S27B Smoke v Local API` ([`probe-baseline.txt`](probe-baseline.txt), [`matters-probe.ts`](matters-probe.ts), read-only) |
| system animations | Started with Samsung **Remove animations** ON (`remove_animations=1`, `transition_animation_scale=0`). The founder turned it OFF during the run; every drag result below was taken with animations ON |

Before-fix states were captured by temporarily putting HEAD's copy of the file
back in the working tree (Metro serves it), then restoring the fixed copy. No
stash, reset or checkout was used.

Every tap came from a `uiautomator` dump or screenshot taken just before it,
with one exception, which is recorded under Corrections.

## 1. Matter picker — an unloaded store is not an empty caseload

**Root cause.** `MatterPicker` treated `matters.length === 0` as "no matters".
Practice `hydrate()` is called only by Today, Matters, Cause list, Adjournment
and Client update. A cold deep link straight to a judgment never loads Practice,
so the picker saw `[]` with `freshness: unknown`.

**Fix.** `pickerView()` derives `list | empty | resolving | unavailable` from
Practice's existing `matters`, `freshness`, `loading` and `refreshError`.
"No matters yet" and "Create a matter" appear only when a **live** read
returned none. When the sheet opens, it calls the store's own `hydrate()` if
Practice was never read, or `refresh()` if the data is not live. There is no new
store and no API client in the picker.

| row | class | result | evidence |
| --- | --- | --- | --- |
| `COLD_DEEP_LINK_SERVER_MATTERS` | DB/API | **2** | probe |
| before fix | PHYSICAL | **FALSE EMPTY** | `force-stop` → `lawmind://judgment/0c13f977…` → Add to a matter: "No matters yet…" plus **Create a matter** ([`01`](device/01-before-fix-picker-false-empty.png)) |
| `COLD_DEEP_LINK_FALSE_EMPTY` | PHYSICAL | **NO** | Same cold path after the fix: both server matters listed, with no empty copy and no Create action ([`03`](device/03-after-fix-picker-two-matters.png)). At 300 ms the list was already there ([`02`](device/02-after-fix-picker-t0.png)); the local API answers faster than the loading state can be captured |
| `UNRESOLVED_EMPTY_CREATE_ACTION` | AUTOMATED | **NO** | `MatterPicker.loadState.test.tsx`: unknown + [] and cached + [] show a loading state, never Create |
| `LIVE_ZERO_CREATE_ACTION` | AUTOMATED | **PASS** | live [] → "No matters yet" + Create; pressing Create captures the pending intent |
| `REFRESH_FAILURE_FALSE_EMPTY` | AUTOMATED | **NO** | Failure with nothing cached → "could not be loaded" + Try again, with no Create. A cached non-empty list survives a failed refresh |
| `PENDING_SAVE_REGRESSION` | AUTOMATED | **NONE** | `MatterPicker.pendingSave.test.tsx` unchanged except that it now seeds a *live* empty store |

## 2. Shared Sheet — bottom safe area

**Fix.** `Sheet` bottom padding is `max(space.lg, insets.bottom + space.sm)`,
using `useSafeAreaInsets()`. There is no hard-coded pixel value, and a device
with no inset keeps the old `space.lg`.

| sheet | before (HEAD) | after | class |
| --- | --- | --- | --- |
| MatterPicker | lowest control (Create) bottom **2206**, nav bar top 2205: touching | lowest row bottom **2160** | PHYSICAL |
| Add Event | Save bottom **≈2183**, INFERRED (at HEAD the `ADD EVENT` label measured 90 px lower; Save itself was not dumped) | Save bottom **2093** ([`04`](device/04-add-event-sheet.png)) | PHYSICAL (after) |
| ExcerptSheet | — | Save to matter bottom **2159** ([`08`](device/08-excerpt-open-after-fix.png)) | PHYSICAL |
| Manage matter → "Archive" confirm (destructive) | — | Cancel bottom **2114** ([`06`](device/06-status-sheet-archive.png)); Cancel pressed, matter still active | PHYSICAL |

Other checks:

- **Keyboard.** With the Add Event input focused (IME `[0,1259]`), Save sat at 865–1012, fully visible ([`05`](device/05-add-event-keyboard.png)).
- **Back button.** Back closes the keyboard and the sheet together. That is existing behaviour, documented in `Sheet.tsx`, and unchanged.
- **Backdrop.** A tap on the backdrop dismisses the sheet.

### Found during this check: drag-to-dismiss never worked inside the Modal

With animations ON, the sheet did not follow a held drag, and a fast fling
left it open, **both on HEAD's `Sheet.tsx` and on the safe-area version**.

A `Modal` is its own Android window, outside the root `GestureHandlerRootView`
in `app/_layout.tsx`, so the pan never received touches. **Fix:** `Sheet` wraps
the Modal's content in its own `GestureHandlerRootView`. Physical results after
the fix:

- the sheet tracks the finger (moved about 96 px mid-drag);
- a short slow drag snaps back;
- a fast fling dismisses.

Jest now loads gesture-handler's documented `jestSetup.js` (its module mock
provides `install`, which the root view calls).

`REDUCE_MOTION`: with Remove animations ON, the pan is disabled by design and
the sheet cross-fades. That was observed before the founder switched the
setting off.

## 3. ExcerptSheet — open position and revert typography

**Mechanism** (RN 0.86 `ReactEditText.maybeSetText`; inferred from source):

- **Open position.** The JS value lands as `replace(0, len, text)` over an
  empty Editable, which moves the caret to the end, so the field opened on its
  last lines.
- **Revert typography.** The same path removes every `ReactSpan`, including
  the line-height span, before re-applying the text. That is why reverted text
  rendered with tighter lines.

**Fix.**

- **Open position:** `setSelection(0, 0)` once the text is laid out
  (`onContentSizeChange`). This places a caret, not a selection, so the counter
  stays at 0. The first attempt, in `onLayout`, did **not** work on the phone
  ([`07`](device/07-excerpt-open.png)): the text landed afterwards.
- **Revert:** any native change **remounts** the input (a `key` bump), so a
  fresh view renders the canonical source with its full typography.

| row | class | result | evidence |
| --- | --- | --- | --- |
| `EXCERPT_INITIAL_POSITION` | PHYSICAL | **TOP/START** | Opens at "Cooperated throughout in the investigation…" ([`08`](device/08-excerpt-open-after-fix.png)); before the fix it opened at "…16.08.2021.”" ([`07`](device/07-excerpt-open.png)) |
| `EXCERPT_INITIAL_COUNT` | PHYSICAL | **0 / 4000**, both buttons disabled, `mInputShown=false` | 08 |
| `EXCERPT_NATIVE_SELECTION` | PHYSICAL | **PASS** | Long-press → "whenever", 8/4000, Cut/Copy/Paste menu ([`09`](device/09-native-selection.png)). Handle drag → "whenever called.⏎(No need to" = **28/4000** ([`10`](device/10-handle-drag.png)). No keyboard |
| Cut | PHYSICAL | **REVERTED** | Field text read from the UI dump: **5,458 chars, sha256 `5ebdcfa117d6…d8d2`** (canonical ¶2, same as R28B). 0/4000, buttons disabled ([`11`](device/11-after-cut-reverted.png)) |
| Paste + immediate Save tap | PHYSICAL + DB/API | **REVERTED, NOTHING SENT** | Same canonical sha; 0/4000. Annotation rows 4 → 4, idempotency 4 → 4 ([`12`](device/12-after-paste-reverted.png), [`probe-before-save.txt`](device/probe-before-save.txt)) |
| `EXCERPT_POST_REVERT_TYPOGRAPHY` | PHYSICAL | **PASS** | Text-line start rows inside the field, before any edit, after Cut and after Paste: `39, 97, 105, 154, 212, 271, 328, 389, 444, 503, 511, 561` — **identical**. The only pixel difference (3,310 px) is the spell-check underline, which the remount clears |
| `EXCERPT_R28_INVARIANT` | PHYSICAL + DB/API | **PASS** | "Ordinary summo", 14/4000 → Save passage. **One** new row `41b01e60-ccda-49c6-8679-374a7b568447`: pi 2, pn 2, len 14, occurs once at **[297, 311)** in ¶2, `equalsWholeP2 false`, no ellipsis, no tamper-marker hits. Rows 4 → 5, idempotency 4 → 5 ([`probe-after-save.txt`](device/probe-after-save.txt), [`13`](device/13-selection-before-save.png), [`14`](device/14-after-save.png)) |
| crashes / ANR / OOM | PHYSICAL | **0 / 0 / 0** | `logcat -b crash` empty. No `FATAL EXCEPTION`, `ANR in` or `OutOfMemory` lines. App alive (pid 14463) |

## Regression

- **Full mobile Jest:** 119 suites, 1,342 tests passed ([`jest-full.txt`](jest-full.txt)). An earlier full run failed because four suites mocked Practice as a bare `{ matters }`, and the new root view needed gesture-handler's Jest setup. Both were fixed, then the suite was rerun.
- **Typecheck:** `tsc --noEmit` passed (exit 0).
- **Android export:** `expo export --platform android` passed (exit 0; 6.6 MB `.hbc`) ([`android-export.txt`](android-export.txt)).
- **Guards:** hex, sunlight and design rules all pass (no new violations).

## Corrections

- **An unverified tap on the launcher.** The sheet had already closed, so a
  back press left the app, and the next tap, sent without a fresh dump, landed
  on the launcher and opened Google Search. Nothing was typed. Backed out
  immediately and reopened the app by deep link. Every later tap was preceded
  by a dump.
- **A wrong first diagnosis of the drag failure.** I first blamed Reduce Motion
  alone. Once the founder turned animations back on, the drag still failed on
  HEAD, and the missing gesture root was the real cause.

## Not done / seen and left alone

- `ManageMatterScreen` reached by deep link says "This matter is not on this
  device" until Matters has loaded. Same kind of problem as defect 1, different
  screen; out of R29 scope.
- Android spell-check underlines appear in the excerpt field. Cosmetic; out of
  scope.
- The picker's loading state was not caught on camera (local API too fast);
  it rests on Jest.
