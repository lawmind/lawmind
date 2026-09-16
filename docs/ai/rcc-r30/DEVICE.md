# RCC R30 — Manage matter opened cold by deep link

**Verdict: fixed and proven on the S24.** A Manage matter link opened on a cold
start no longer says the matter is absent just because the Practice store has
not loaded.

## Environment

| | |
| --- | --- |
| HEAD at start | `039cc59e` (`origin/main`) |
| device | `SM-S921B`, Android 16, serial `RZCX90X1BNF`, USB; `adb reverse` 8081 and 3000 |
| API | local `services/api`, `/health` 200 |
| account | `RCC Smoke Advocate` (`cd419982-…`). The server holds the matter `cedfe466-cdc1-4be3-b69e-03103593d986` "RCC Sprint 2 Smoke v Local API" (R29 [`probe-baseline.txt`](../rcc-r29/probe-baseline.txt), [`probe-after-save.txt`](../rcc-r29/device/probe-after-save.txt)) |

## Root cause and fix

**Root cause.** `ManageMatterScreen` looked the id up in `usePractice().matters`.
Any miss rendered "This matter is not on this device", including the miss
caused by a store that had never been read. Only the tab screens call
`hydrate()`, so a deep link arrives with `matters: []` and freshness `unknown`.

**Fix: the R29 rule, moved to the store module and shared.**

- `state/practice.ts` now exports:
  - `caseloadView()`, returning `list | empty | resolving | unavailable`: absence only after a live read;
  - `ensureLive()`, which calls `hydrate()` if the store was never read, or `refresh()` if the data is not live.
- `MatterPicker` uses both (`pickerView` is now an alias).
- `ManageMatterScreen` applies the same rule to the one target:
  - it calls `caseloadView({ matters: found ? [matter] : [] … })`;
  - it calls `ensureLive()` only when the target is missing, so a cached target renders at once with no fetch;
  - its states are: loading; *unavailable* (with Try again); truthful absence; the form.
- The absence copy now reads "This matter is not in your matters. It may have
  been removed, or the link may be wrong." The old "Open it from Matters first"
  was wrong advice once a live read had happened.

## Physical

| row | result | evidence |
| --- | --- | --- |
| before fix: `force-stop` → `lawmind://matter/manage?id=cedfe466…` | **"This matter is not on this device. Open it from Matters first."** | [`01`](device/01-before-fix-cold-manage.png) |
| after fix, same cold link | **Loads**: CASE TITLE field shows "RCC Sprint 2 Smoke v Local API" | [`02`](device/02-after-fix-cold-manage-loaded.png) |
| management actions | **Render**: Save changes, STATUS, Mark disposed, Mark archived. Nothing was tapped | [`03`](device/03-after-fix-management-actions.png) (a personal notification banner is redacted) |
| true absence: cold → `?id=00000000-0000-4000-8000-000000000000` | **"This matter is not in your matters…"** after the live read. No server data was created | [`04`](device/04-after-fix-true-absence.png) |
| crashes / ANR / OOM | **0 / 0 / 0** (`logcat -b crash` empty); app alive | |

The loading state was not visible in a dump taken about 0.8 s after launch
(the local API is fast); Jest covers it.

## Automated

`ManageMatterScreen.deepLink.test.tsx` has six tests:

- unknown → loading → target, with its actions;
- a cached target renders at once with no fetch;
- a live list without the target → truthful absence;
- a failed read → unavailable, never absent, and Try again recovers;
- unrelated cached matters → a refresh happens before any verdict;
- unrelated cached matters plus a failed refresh → unavailable.

Four existing screen tests mock `state/practice` with a live snapshot. They now
keep the module's real exports, with `ensureLive` as a no-op.

- **Full mobile Jest:** 120 suites, 1,348 tests passed ([`jest-full.txt`](jest-full.txt)). The first full run failed on exactly those four mocks; after fixing them I reran the full suite.
- **Typecheck:** `tsc` passed (exit 0).
- **Android export:** `expo export --platform android` passed (exit 0) ([`android-export.txt`](android-export.txt)).
- **Guards:** hex, sunlight and design rules all pass (no new violations).
