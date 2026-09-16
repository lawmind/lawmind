# RCC R27B — the blocked physical rows, re-run on the fixed backend

`HEAD_START = 1e6510dc` (local `main`: RCC R27 `b4987ef1`, `7c4e4060` plus the
local copy of LCC R30). `origin/main` was `9974e336`: the same LCC R30 patch
under different hashes, without R27. The only tree difference between the two
was R27's four files, so R27 is integrated by merging `origin/main`, which keeps
its exact hashes. No rebase, reset or cherry-pick.

## Environment

| | |
| --- | --- |
| device | `SM-S921B` (Galaxy S24), Android 16, serial `RZCX90X1BNF`, **USB**, `svc power stayon usb` |
| app | `co.lawmind.app`, a Metro dev build: the JS under test is this working tree |
| API | local `services/api` on 3000 over `adb reverse`, `/health sha = 1e6510dc` (includes LCC R30's `RolePools.auth` fix and the reader fix) |
| database | local `lawmind`, single `DATABASE_URL`, so `DB_SPLIT_MODE` is **inferred `single`**. Not strict-split evidence. |
| account | `RCC Smoke Advocate`, `users.id cd419982-…`; identity-only fixture `s24delete1@example.invalid` (auth id `QjnEfIMg…`, no `users` row) |
| device setting | system **reduced motion on** (`transition_animation_scale=0.0`); this matters for §Toast |

Every coordinate tap came from a `uiautomator` dump taken immediately before it.
IME state was checked before typing and before tapping anything under it.

## The matrix

| row | verdict | evidence |
| --- | --- | --- |
| `EVENT_DOUBLE_TAP` | **PASS** | Two taps on Save sent in one `adb shell` call. **One** `POST /matters/cedfe466…/events` → `201`. `matter_events` **0 → 1** (`hearing`, "case listed and put off"). One `api_idempotency_records` row, `/matters/:id/events`, key `mu3wpy8h-…`, `success/201`. Row rendered on the timeline. |
| `ADJOURNMENT_PHYSICAL` | **PASS** | "Record the next date" → In 4 weeks, Arguments → Save. `PATCH /matters/cedfe466…` → `200`, `next_hearing_date` 2026-09-30 → **2026-10-14**. **One** `POST …/events` → `201`, `matter_events` 1 → **2** ("Adjourned to 14 October 2026 for arguments."). Re-counted 20 s later: still 2. UI: "Listed 14 October … Recorded on the matter: arguments." |
| `MATTER_CREATE_PHYSICAL` | **PASS** | Form filled on the phone (Criminal, Accused). **One** `POST /matters` → `201`. New row `6106bc06-…`, `user_id = cd419982-…` (the signed-in advocate), `parties = {"description":"Alpha Smoke v Beta Smoke"}` (`jsonb` object), `our_side = accused`. Matters for the user **1 → 2**. The matter screen renders "Alpha Smoke v Beta Smoke · for the accused". |
| `IDENTITY_ONLY_DELETE_PHYSICAL` | **PASS** | Signed in as `s24delete1` → onboarding → "Delete my account instead" → typed email → Request. **One** `POST /me/data-requests` → `201`. `data_requests` **0 → 1**: `auth_id = QjnEfIMg…`, `user_id = null`, `erasure/received`, due 16 Oct. R16 key `mu3xf899-…` recorded. `users` rows for that email: **0** (no profile created). UI: "Your request has been received. An operator will complete it by 16 October 2026." Still 1 after the later sign-ins. |
| `ANNOTATION_VALID_QUOTE_PHYSICAL` | **PASS** | 2022 INSC 690, ¶3 (327 chars by the server's own `segmentParagraphs`), long-press. **One** `POST …/annotations` → `200`. One `judgment_annotations` row (`paragraph_number 3`, quote length 327), one idempotency row. Force-stop, relaunch, reopen at `?read=1&para=3`: `GET …/annotations` → `200` and ¶3 renders highlighted. |
| `ANNOTATION_LONG_PARAGRAPH` | **PRODUCT_DECISION_REQUIRED** | ¶2 (5,458 chars) → `POST` → `400` "quote: Too big: expected string to have <=4000 characters". Not truncated, server limit untouched. The reader has no way to select an excerpt: long-press and the control bar both send the whole paragraph. |
| `ANNOTATION_AFTER_FAILURE_STATE` | **REQUESTS STILL SENT, refusal was INVISIBLE (fixed)** | After the ¶2 `400`: ¶4 (481 chars) → `POST` → `200`, row written (annotations 1 → 2). Retrying ¶2 → `POST` → `400` again (three times). R27's "later taps send nothing" **did not reproduce**. But the refusal toast was **in the accessibility tree and not on the screen** — see §Toast. |
| `VERIFY_CONFIRM_PHYSICAL` | **NOT REACHABLE — no fixture can open it without a bypass** | See §Verify-confirm. |
| `AUTH_DEEP_LINK_PHYSICAL` | **PASS** (after the fix below) | Signed out → `lawmind:///matter/6106bc06…` → held on Sign in → typed email, Send → verify link → **the matter screen for `6106bc06`** ("S27B Smoke v Local API"), not Today. |
| `AUTH_RESUME_CRASH` | **REPRODUCED, FIXED, 5/5 CLEAN AFTER** | See §Auth resume. |

`LOCAL_V1_PHYSICAL_ACCEPTANCE = PASS` for every row that can be reached. The one
exception is `VERIFY_CONFIRM`, which is unreachable by construction; that is
listed for LCC and NEW3, not claimed.

Durable counts at the end: `matter_events` (cedfe466) 2 · matters (smoke user) 2
· `judgment_annotations` (smoke user) 2 · `data_requests` 1 · `users` rows for
`s24delete1` 0.

## Auth resume: the "Maximum update depth exceeded" crash, bounded

### What triggers it

These attempts were all run on the same running app. An identity-only link
arriving from Sign in (1 attempt), from onboarding (1) or from Delete account (1)
did **not** crash. The crash needs one specific state: **the app is signed in as
a full advocate and an identity-only verify link arrives.** That state crashed
on **3 of 3** attempts before the fix:

```
Render Error
Maximum update depth exceeded. …
Component Stack: <Content /> ExpoRoot.js:145 …
```

Running the same transition the other way round (an identity-only session
receiving a full advocate's link) did not crash. It **stranded** the advocate:
signed in with a complete profile, but left on onboarding's "How should we
address you?" form. That happened on 3 of 3 attempts.

### Root cause

`app/auth/verify.tsx` decided where to go from `status`, and it did so **before
its own `verify(token)` had resolved**. When a link arrives in an app that is
already signed in as someone, `status` still describes that earlier session:

- if the earlier session was `signed_in`, the screen went to `/today`
  immediately. `GET /me` then flipped the status to `identity_only` while the
  app was on a protected route, `AuthBoundary` swapped the mounted root
  `<Stack>` for a `<Redirect>`, and the root navigator looped;
- if the earlier session was `identity_only`, the screen went to `/onboarding`
  immediately, and the full advocate's `signed_in` arrived after the navigation
  had already happened.

### Fix

`resumeAction(status, pendingHydrated, exchanged)` now returns `wait` until this
screen's own exchange has succeeded. `verify.tsx` sets `exchanged` when
`verify()` resolves `ok`. No other caller exists.

### Proof

The fix was proved by switching it off and on:

| build | identity link into a signed-in app | full link into an identity-only app |
| --- | --- | --- |
| fix **off** (`exchanged` forced `true`) | crash 3/3 | stranded on onboarding 3/3 |
| fix **on** | onboarding, **no crash, 5/5** | signed in, **5/5** (4 × Today, 1 × Settings, see below) |

All three `Maximum update depth` lines in Metro's log come from the fix-off runs.
There are 0 after the fix.

Tests: `src/state/verifyRoute.staleStatus.test.tsx` renders the real route over
a session that already holds a status. It failed with `/today` and
`/onboarding` before the fix, which are the two observed defects, and passes
after it. `resumeGate.test.ts` adds the pure rule.

`CRASH_REPRO_ATTEMPTS`: 7 before the fix, in four starting states (the crash
state reproduced 3/3). 10 after the fix (5 per direction). The local API was
restarted twice between phases, because `/auth/magic-link` is rate-limited in
memory (5 per email per 15 minutes).

## Toast: a refused highlight said nothing on screen

At +1.1 s after the ¶2 `400`, the dump contained
`quote: Too big: expected string to have <=4000 characters` at
`[90,1978][990,2025]`. The screenshot taken at the same instant showed plain
page colour there. The pixels at y 1985–2000 were `(251,250,247)`, above the
controls bar.

**Differential:** pinning the toast's `opacity: 1` made the same toast visible at
the same moment. So the cause is the fade, not the controls bar covering it.
With the system reduced-motion setting on, Reanimated's default
`ReduceMotion.System` skipped the timing and the toast stayed at opacity 0.

**Fix:** both fade timings in `components/Toast.tsx` now pass
`reduceMotion: ReduceMotion.Never`. That matches the component's own rule, "keep
the fade, drop the rise". Checked on the phone: the dark toast is visible at
+1.1 s and gone afterwards. `Toast.reducedMotion.test.tsx` failed before the
change and passes after it.

`Toast` has exactly one mount in the app (`ReadingView`), so this refusal was
the only message it existed to show. `FadeRise` uses the same `withTiming`
default. Its content renders on this phone, so the defect was not shown there,
and it was left alone.

## Verify-confirm: why no fixture can reach it

`api.verifyConfirm` has one caller, `UnverifiedCitationScreen`. The only way to
open that screen is `JudgmentScreen`'s `existence.kind === 'unconfirmed'` band,
and that band is derived from the judgment payload. `GET /judgments/:id`
hardcodes `verificationState: 'verified'` (`services/api/src/judgments/route.ts:422`),
and so do `as-at.ts` and `treatment.ts`. The two surfaces that carry a check
handle into a judgment (search, document review) open that same payload. So
whatever `citation_checks` row is seeded, the current API never makes the vouch
screen reachable. Reaching it would take exactly the production bypass this
round forbade. **No fixture was created**, so there is nothing to remove. The
confirm-side contract is `handleConfirm`, which inserts one
`citation_checks(verified, ecourts, judgment_detail)` row. It remains covered by
LCC's real-route matrix (R30, 6/6).

## Incidental, recorded, not changed

- **The refused long highlight stays tinted on the device.** `addHighlight`
  persists optimistically, so ¶2 renders highlighted with no server row. It
  belongs to the same product decision as the 4,000-character cap.
- **The toast text is the raw validator message** ("quote: Too big: …").
  Showing a server message verbatim is a copy decision under R17.
- **A destination held at sign-out is resumed by the next sign-in.** Signing out
  from Settings captures `/settings`, and the next full sign-in within 30
  minutes lands there (fix cycle 1). This behaviour predates this round and is
  not caused by the change above.
- `GET /matters/:id/premium-preview` → `404` on every matter load (unchanged
  from R27; LCC left it by design).
- The reader's `GET /judgments/0c13f977…` now returns `200` in 52–56 ms. It
  timed out 5/5 in R27, and LCC's R30 fix holds on the device.
- Adjournment's `matter_events.event_date` is the **new** date (14 Oct) and not
  the day of the order. Recorded as observed.

## Client gates

- jest (full mobile suite): **115 suites, 1287 tests, all pass**
- `tsc --noEmit` (mobile): **exit 0**
- `check:sunlight`: every shipped pair meets WCAG AA
- `check:hex`: no colour literal outside tokens
- `check:design`: no new violations (116 baseline)
- Android production export: **exit 0**, `entry-e648df6836e917f506b3991649e3ad9d.hbc`,
  6,626,684 bytes, no test module in the bundle. `app.config.js` refuses a
  production export with no `EXPO_PUBLIC_API_URL` (FQ-HOSTING), so this build-only
  check set `https://api.lawmind.invalid`. That binary is not for shipping.

## Non-claims

- LOCAL over `adb reverse`; **not** Gate C, not mobile data.
- `DB_SPLIT_MODE` inferred `single`.
- No file under `services/**`, `packages/db/**` or `migrations/**` was changed.
  Two read-only query helpers were created as untracked temp files under
  `services/api/` and were deleted before the commit.
- `VERIFY_CONFIRM_PHYSICAL` is **not reachable**. It is not a PASS.
- `AUTH_RESUME_CRASH` is characterised for the states listed above. Other
  status flips on a protected route (for example a profile removed server-side
  while the app is open) were not exercised.
