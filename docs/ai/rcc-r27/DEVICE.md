# RCC R27 — the seven missing physical rows, executed on a Galaxy S24

`HEAD_START = 3a30b3fc` · `HEAD_FINAL` recorded at the foot of this file.

This round existed to do one thing: take the seven rows R26 left as NOT
EXERCISED and actually drive them on the phone. All seven were attempted. Six of
them fail, one passes, and the reason is mostly not the client.

## Environment, frozen before the first tap

| | |
| --- | --- |
| device | `SM-S921B` (Galaxy S24), Android **16**, serial `RZCX90X1BNF`, **USB** |
| app | `co.lawmind.app` versionName `0.1.0`, versionCode 1, targetSdk 36 — a **Metro dev build**, so the JS under test is this working tree at `3a30b3fc` |
| bundler | Metro on 8081, `adb reverse tcp:8081` |
| API | local `services/api` on 3000, `adb reverse tcp:3000`; `/health` reported `sha = 3a30b3fc1ac085e7f12f4212e3dd750c5aed33c8` |
| database | `lawmind` @ `127.0.0.1:5432`, `DB_SPLIT_MODE` **inferred `single`** — only `DATABASE_URL` is set locally, so corpus and user roles resolve to one database. This is NOT a strict-split run and is not claimed as one. |
| account | `RCC Smoke Advocate`, `users.id cd419982-9f08-4ae1-b134-94f2a0ab7c92`, `rcc-smoke-20260830@example.in` |
| matter | `cedfe466-cdc1-4be3-b69e-03103593d986` — "RCC Sprint 2 Smoke v Local API" |
| judgment | `0c13f977-1152-4d03-a8a1-9e489f98bf2e` — 2022 INSC 690, *Satender Kumar Antil* |

No code was edited between freezing this and the last first-pass measurement.

## The matrix

| row | verdict | the evidence, and who owns it |
| --- | --- | --- |
| `EVENT_DOUBLE_TAP` | **FAIL** | BEFORE 0 → AFTER 0 on `matter_events` (queried on `event_type`, the real column). Two rapid taps on Save produced **exactly one** `POST /matters/:id/events` — **the client's R16 guard held, which is what this row was built to test** — and the server answered `500`. No row. Cause: LCC. |
| `AUTH_DEEP_LINK_PHYSICAL` | **PASS** | Signed out, fired `lawmind:///matter/cedfe466-…`, landed on Sign in. Magic link → `lawmind://auth/verify?token=…` → returned to **the matter screen for that exact matter**, not home. |
| `MATTER_CREATE_PHYSICAL` | **FAIL** | Form filled on the device (Criminal, Accused, parties, client). `POST /matters` → `500`. `matters` for this user stayed at 1. The client behaved correctly: it surfaced the server's message, kept the draft and kept the idempotency key. Cause: LCC. |
| `ADJOURNMENT_PHYSICAL` | **FAIL** | Half landed. `PATCH /matters/:id` → `200` and `matters.next_hearing_date` is now `2026-09-30`, rendered as "NEXT HEARING · 30 September". The durable event did not: `POST /matters/:id/events` → `500`, `matter_events` still 0. Cause: LCC. |
| `ANNOTATION_PHYSICAL` | **FAIL** | `judgment_annotations` 0 → 0. One `POST /judgments/:id/annotations` → `400`, and no request at all from any later attempt. Two distinct client defects behind it, both RCC's — see below. |
| `VERIFY_CONFIRM_PHYSICAL` | **NOT EXERCISED** | No reachable surface on this build. The vouch screen renders only when `existence.kind === 'unconfirmed'`; that comes from `citationRender()`, which has exactly **one** product call site (`JudgmentScreen.tsx:328`), and `GET /judgments/:id` hardcodes `verificationState: 'verified'` / `verifiedBySource: 'corpus'`. Search, matter authorities and RELIED ON all open corpus judgments. Checked those three; did not check alert or briefing surfaces. |
| `IDENTITY_ONLY_DELETE_PHYSICAL` | **FAIL** | Reached Delete Account from onboarding **without onboarding**, via "Delete my account instead". `POST /me/data-requests` → `500`, `data_requests` still 0. `PROFILE_CREATED_FOR_IDENTITY_ONLY = NO` — verified by join, 0 rows. Button copy is request semantics ("Request account deletion"), not a false synchronous delete. Cause: LCC. |

`LOCAL_V1_PHYSICAL_ACCEPTANCE = FAIL` — one of seven passes.

## The one server defect that took four rows

`POST /matters`, `POST /matters/:id/events` and `POST /me/data-requests` all
returned `500` with the **same** error:

```
TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument must be of type string
or an instance of Buffer or ArrayBuffer. Received an instance of Object
    at Buffer.byteLength (node:buffer:804:11)
    at reset.str (postgres@3.4.9/src/bytes.js:22:27)
    at Bind (postgres@3.4.9/src/connection.js:954:16)
    at prepared (postgres@3.4.9/src/connection.js:209:7)
    at ParameterDescription (postgres@3.4.9/src/connection.js:633:58)
```

Four `level:50` records, with these creating call sites:

- `services/api/src/matters/route.ts:243` — the `INSERT INTO matters` (once)
- `services/api/src/idempotency.ts:345` — the `UPDATE api_idempotency_records`
  that records the outcome (three times)

Both are queries that bind a `sql.json(...)` parameter inside the
`withIdempotency` transaction. **Every route wrapped in `withIdempotency` is
affected**; there are six, and four of them are rows in this matrix:
`/me/data-requests`, `/judgments/:id/annotations`, `/verify/confirm`,
`/matters`, `/matters/:id/events`, `/me/training-consent`.

### What was ruled out, so LCC does not repeat it

Each of these was run against the same `postgres@3.4.9` (one install, no second
copy) and **all succeeded**, so none of them is the cause:

- `sql.json(obj)` with and without a `::jsonb` cast, on a pool handle
- `tx.json(obj)` inside `sql.begin`, which is the shape at `idempotency.ts:345`
- the full `INSERT INTO matters` with the client's exact payload, rolled back —
  wrote a row with `jsonb_typeof(parties) = 'object'`
- the `UPDATE api_idempotency_records … response_body = tx.json(body)` against a
  claim row, rolled back — stored `jsonb_typeof = 'object'`
- the pool's own `connection: { statement_timeout, idle_in_transaction_session_timeout }`
  options, passed as numbers exactly as `pools.ts` passes them

So the trigger is something about the composition inside `withIdempotency`, not
any single statement. **That is the missing discriminator and it is LCC's to
find.** RCC stopped here rather than editing `services/api/**`.

Two things that are true and worth knowing:

- **Nothing was stranded.** `api_idempotency_records` holds 6 rows and all six
  are `fixture-…` keys from 2 September with `outcome = 'success'`. Today's
  failed attempts left nothing behind, so the claim and the mutation roll back
  together as designed.
- **Those same fixtures show `/matters` and `/me/data-requests` answering `201`
  on 2 September.** Whatever this is, it is a regression or it is specific to
  this environment — it is not how the route has always behaved.

## The second server defect: the reader's own fetch times out

`GET /judgments/0c13f977-…` returned `503` on **4 of 4** attempts, each at
almost exactly the 10-second statement timeout:

```
11:17:09  503  10041ms
11:29:56  503  10019ms
11:30:29  503  10019ms
11:30:39  503  10012ms
11:30:49  503  10010ms
```

`pg_stat_activity` showed **1 active connection** on `lawmind` at the time, so
this is not contention from another lane — the query itself does not finish. The
API logged `statement timeout — the request exceeded its budget`.

The reading view still rendered, from what the client already held. An advocate
opening this judgment cold would get the failure state.

## What the device found that is ours

### 1 · The add-event sheet swallows its own failure

The worst of the four, because it is the shape this codebase says it treats most
seriously: the advocate acts, the write fails, and **the screen says nothing**.

`Sheet` is a `<Modal transparent>` — React Native renders it in its own native
window. `addEventError` is set by the sheet's `onSubmit` but rendered in
`MatterScreen`'s `ScrollView`, *underneath* that window and after the timeline.
So on the `500` above:

- the sheet stayed open with the draft intact (correct — do not lose their text)
- no message appeared anywhere in the sheet
- the message "something went wrong" was really there — on the matter screen,
  below the timeline, reachable only by **dismissing the sheet** (which discards
  the draft) **and scrolling three times**. Found at bounds `[45,2112][1035,2159]`.

Nothing in 1,274 unit tests could see this: the error state is set correctly and
a test that renders `MatterScreen` finds the text. It takes a real window
manager to notice that the text is behind a modal.

### 2 · A highlight over 4,000 characters is refused, and the refusal is silent

`annotationBody` caps `quote` at `z.string().min(1).max(4000)`. The client sends
the whole paragraph as the quote (`quote: held.text`). Running the server's own
`segmentParagraphs()` over this judgment's `full_text`:

- 76 paragraphs served, 75 numbered — matches the reader's "of 76"
- **17 exceed 4,000 characters**: the headnote, and ¶¶ 2, 11, 16, 20, 25, 32, 33,
  34, 36, 41, 44, 48, 54, 64, 66, 68
- ¶ 11 is 5,926 chars — that is the one that produced the `400`
- ¶ 24 is 444 chars, well inside the cap

So highlighting fails on roughly **a fifth of the paragraphs** of a leading bail
authority. The contract is frozen this sprint and the cap is the contract, so
the client is the side that has to handle it.

### 3 · After the first failed highlight, the button stops sending anything

Across the whole session there was **exactly one** `POST …/annotations`, at
11:18:52. Every later highlight attempt — the control bar, and the per-paragraph
anchor on ¶ 24, which is inside the cap — produced **no request at all**.

`addHighlight` pushes the highlight into `highlights` and persists it *before*
awaiting the request. The optimistic local copy then suppresses the retry, so a
paragraph that would be accepted is never sent. `saveHighlight` does call
`setToastMessage(result.message)` on failure, but no toast was observed in the
accessibility tree at 0s, 1s or 2s after the tap.

### 4 · An identity-only sign-in crashed the app once

Delivering the magic-link verify deep link to an **already running** instance,
for an account with an auth identity and no profile row, produced a redbox:

```
Render Error
Maximum update depth exceeded. This can happen when a component repeatedly
calls setState inside componentWillUpdate or componentDidUpdate.
```

Confirmed in Metro's log as `ERROR [Error: Maximum update depth exceeded...]`.
No component stack was emitted.

Scope honestly: the **same** deep-link mechanism worked for the smoke advocate,
who has a profile, and a cold launch of the identity-only session rendered
onboarding correctly. So the reproduction is narrow — verify-into-a-running-
instance while the profile gate flips — and it is one observation, not four.
It is the failure mode `[[authboundary-starves-the-router]]` describes.

### 5 · The adjournment blames the network for a 500

After `POST events` returned `500`, the client said:

> The purpose was not recorded — that part needs a connection. The date is saved
> either way.

The actionable half is right and the date really was saved. But the connection
was fine and the server returned a 500, so the sentence diagnoses the wrong
thing. Recorded, not changed — a copy sweep was out of scope for this round.

## Procedure — the four traps this round hit, so the next one does not

R26 listed "stale tap bounds" and "phone locking mid-matrix". Both were avoided.
Four new ones cost real time:

1. **`uiautomator` reports a button's bounds while the keyboard covers it.**
   The IME is a separate window, so the dump shows `Request account deletion` at
   `[45,1934][1035,2125]` and a tap at its centre lands on the **keyboard**. It
   typed a `v` into the confirm field — three times — and the submit silently
   did nothing because the confirmation no longer matched the email. Dismiss the
   IME, re-dump, then tap. This is a *different* trap from stale bounds: the
   bounds were fresh and still wrong.
2. **`keyevent 111` (ESC) opens the dev menu** and reloaded the app to Today.
   **`keyevent 4` (BACK) with the IME already closed backgrounds the app.** BACK
   *with the IME shown* is the safe dismissal, so check `mInputShown` first.
3. **Injected text can reload a dev build.** Typing `R27 double tap probe` into
   the event sheet reloaded the JS context; `case listed and put off to next
   date` into the same field did not. The working strings all avoided a repeated
   `r`/`R`. Not proven, but every measurement in this round used an `r`-free
   string and none of them reloaded.
4. **`python` here is native Windows and cannot read an MSYS `/c/...` path**, and
   its stdout is cp1252 — an emoji or `👥` in a UI dump crashes the helper. Pass
   Windows paths and set `PYTHONIOENCODING=utf-8`.

The helpers used are in this session's scratchpad, not committed: `tap.sh` dumps
the hierarchy immediately before every tap and never reuses a coordinate,
`type.sh` refuses to type unless `mInputShown=true`, and `dump.sh` prints
class/clickable/bounds/text.

## Incidental, unfixed, recorded only

- The reading view's paragraph counter read **"1 of 76" while the gutter showed
  "Paragraph 11"** and then "Paragraph 24". The counter tracks `current` from
  `onViewableItemsChanged`; the gutter is per-row. One of them is wrong.
- Paragraph 0 of this judgment is the reporter's headnote at 20,273 characters —
  about thirty screens. Reaching ¶ 1 took 30 flings. `Find in judgment` works
  (395 matches for "bail") but does not move the reader off ¶ 1.
- `bail pending trial` was refused as **"This search was too broad to run"** —
  the corpus-wide `df` gate, `[[corpus-wide-df-gate-ignores-filters]]`.
  `2022 INSC 690` returned the right single judgment.
- `GET /matters/:id/premium-preview` returns `404` on every matter load (5×).
- Verified citations render with **no badge** on both the search result and the
  judgment screen, which is the rule. The reader disclosed "From a law
  reporter's edition — the text may include editorial matter".
- The R26 fixes are present on the device: "Good afternoon" at 12:18, and the
  truthful "Nothing scheduled" state on Today.

## Non-claims

- `DB_SPLIT_MODE` was **`single`**, inferred from one `DATABASE_URL`. This is not
  strict-split evidence.
- This is a LOCAL run over `adb reverse`. It is **not** Gate C mobile-data
  evidence.
- `VERIFY_CONFIRM_PHYSICAL` is `NOT EXERCISED`, not `FAIL`. Three surfaces were
  checked for a reachable unconfirmed citation; alert and briefing surfaces were
  not.
- No production build was made and no paid infrastructure was created.
- `DB_MIGRATION = NO`. Nothing under `services/**`, `packages/db/**` or
  `migrations/**` was modified. The two reproductions that wrote rows were run
  inside transactions and rolled back, and both confirmed zero rows afterwards.
- The crash in §4 is **one** observation with a narrow reproduction, not a
  characterised defect.

## The one thing fixed, and how it was proved

Only §1 was fixed. The other four client findings are recorded and left alone:
§2 and §3 need a decision about how a quote is clipped, §4 is a single
observation that wants its own reproduction, and §5 is copy.

`AddEventSheet`'s `onSubmit` now resolves to
`{ ok: true } | { ok: false; message: string }` instead of a bare boolean, and
the sheet renders the message in the `error` slot it already had. `MatterScreen`
returns the reason instead of holding it in `addEventError` — that state and the
`<Text>` that rendered it below the timeline are gone, because that render is the
defect.

Proved twice, in the order that matters:

- **On the phone.** Same matter, same sheet, same `500` from `POST
  /matters/:id/events`. The sheet now shows **"something went wrong"** at bounds
  `[45,1966][1035,2013]`, immediately above Save, with the draft "case listed and
  put off" still in the box. Screenshot `s14-fix-verified.png`.
- **In a test.** `doubleTap.test.tsx` gains "a refused save shows the reason in
  the sheet", which asserts the message is reachable from the sheet's own render.
  14/14 in that file, including the four pre-existing R16 double-tap assertions
  it sits beside.

The message itself — lowercase "something went wrong" — is the **server's** 500
text rendered verbatim. It is not R17 copy and it is not RCC's to write; it is
noted for LCC with the handoff.

`EVENT_DOUBLE_TAP` stays **FAIL**. The fix makes the failure legible; it does not
make the event save. Only LCC's `withIdempotency` defect can move that row.

## Round state

- `HEAD_START = 3a30b3fc`
- `CODE_COMMIT = b4987ef1` — the sheet fix, its test, and this file
- `HEAD_FINAL` = the commit that adds this section (a commit cannot name itself)
- LCC handoff: bus `1776`
- Left behind on purpose: the disposable identity-only account
  `s24delete1@example.invalid` (auth identity, no profile row, no data request —
  its deletion request was refused by the 500). It is a ready fixture for
  re-running `IDENTITY_ONLY_DELETE_PHYSICAL` once LCC's fix lands.
- `matters.next_hearing_date` on `cedfe466` is now `2026-09-30`, written by the
  adjournment row through the real `PATCH`.
