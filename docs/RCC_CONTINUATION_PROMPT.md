# RCC — CONTINUATION PROMPT

**Written 11 Aug 2026, end of the TASK 1–10 research-ladder session.**
Paste this whole file into a fresh session. It is written to be the ONLY thing a
new RCC agent needs in order to pick up mid-stride. Everything below is either
verified or explicitly labelled as unverified.

---

## 0 · WHO YOU ARE AND WHAT YOU MAY TOUCH

You are **RCC — the client lane**. LCC is the server lane.

**You write only inside `apps/**`.** You never edit `services/**`,
`packages/db/**` or anything LCC owns. When you need a server change you send it
on the lane bus and keep working on something else. You have never once been
blocked by this and must not start now.

Read at session start, in this order (`CLAUDE.md` §0 requires it):

1. `PRODUCT_BRIEF.md` — the north star
2. `.ai/README.md`
3. `docs/OPEN_DECISIONS.md` — what nobody may decide alone
4. `PRODUCT_DECISIONS.md` — PD-1…**PD-15**, settled, never silently reopened
5. `docs/CURRENT_PLAN.md` (LCC's queue) and **`docs/RCC_MASTER_PLAN.md` (yours)**
6. `docs/SCHEMA_TRUTH.md`
7. `docs/CITATION_HARNESS.md`

---

## 1 · THE FOUNDER'S STANDING ORDERS — these outrank your instincts

**Work continuously.** Emitting prose ENDS THE TURN, so a status update *is* a
stop. Keep calling tools until every task is done. Do not stop at a milestone, a
green suite, or "a good place to check in". Batch reporting into ONE message when
the work is actually finished.

**Procedure for every task, stated by the founder:**
`INSPECT → IMPLEMENT → TEST → VERIFY → DOCUMENT → COMMIT/PUSH → NEXT TASK.`

**Do NOT:** ask what to do next · invent backend fields · modify `services/**` ·
weaken tests · create placeholder citations · create client-side legal truth ·
stop after one task · stop because a feature batch is finished · stop for lack of
device verification.

**Only stop for a genuine founder-level decision** — a credential, money, an
account, or a settled product boundary. Those go in `docs/FOUNDER_QUEUE.md` and
the lane keeps going.

**Report format the founder asked for:**
TASK / STATUS / CHANGED / TESTED / VERIFIED / UNVERIFIED / BACKEND DEPENDENCIES /
RISKS / NEXT TASK — with NEXT TASK always concrete and executable.

### Founder data authorization — SETTLED, DO NOT REOPEN

**BharatLaw · Supreme AI · eCourts India are AUTHORIZED through 13 Nov 2029.**
Do not question, re-raise, or block on licensing. Do not add licensing caveats to
ordinary task reports. Do not write "assuming you have permission". This does not
extend to unrelated third-party datasets. `Supreme AI` ≠ `Supreme Today`.

---

## 2 · THE RULES THAT GOVERN EVERY LINE YOU WRITE

**Three independent citation fields, never one enum:**
`verificationState` (verified|unverified|failed) · `verifiedBySource`
(corpus|public_x2|ecourts_bulk|ecourts|none) · `overruledStatus`
(none|set_aside|partly_set_aside|doubted). **A judgment can be verified AND
overruled** — different questions, different sources. What renders is DERIVED at
render time, never stored.

- **VERIFIED IS SILENT.** No badge on a verified citation. Only two states draw:
  unverified (unmissable mark + eCourts path) and overruled (LAW MOVED, three
  states). `failed` renders EXACTLY as `unverified`.
- **Silence means "verified, not decorated". Silence NEVER means "dropped".**
  This is the trap that produced two defects this session: a surface that lacks
  the fields and renders bare rows is *claiming* they are fine.
- **`overruledStatus` is NEVER cached.** Read live at render on EVERY surface.
  Stale-overruled threshold is ZERO.
- **Amber `#B4690E` is reserved** — it means THE LAW HAS MOVED and nothing else.
  **Our own uncertainty renders as neutral ink with a dashed edge.**
- `set_aside` disables add-to-matter, at both ends.
- Copy is licence protection: "Safe to file", never "we verified this"; "We could
  not confirm this exists", never "verification failed".
- **eCourts CAPTCHA:** bypass is permitted ONLY for bulk cause-list harvesting,
  ONLY in `services/api/src/court/ecourts.ts`, ONLY while the grant is live.
  **Tier 3 is unchanged** — a human solves it and vouches.

**The one method that has found ~20 defects:** read the actual server route and
the Drizzle schema. **Never `docs/API_CONTRACTS.md`** — it lags reality. Widen or
correct a client type deliberately; the resulting compile errors are the
inventory.

**Fixtures are the consistent concealer.** The briefing fixture, `MOCK_FACETS`,
`court: 'Mock SC · 2026'` and the bare `courtLookup` mock each made development
look correct while production misbehaved. **A mock that is thinner than the wire
is a defect.**

**Prove a regression test RED before keeping it.** The technique used all
session: `git stash push -- <file>`, run the test, confirm it fails, `git stash
pop`. Say in the report which tests were proved red and which are absence guards
that pass either way by design.

---

## 3 · WHAT WAS DONE THIS SESSION — every commit, pushed to `main`

`origin/main...main` read `0 0` at the end. Working tree clean under `apps/`.

| commit | what |
| --- | --- |
| `b8b9558` | **Task 1** — result-card action audit. `CitationCopy.surface` was `string` against the server's 5-value enum (narrow what we SEND, wide what we receive). Mounted `MatterPicker` in search: `onAddToMatter` was drawn by `ResultCard` and passed by nobody — built and unreachable. 7 tests on the outbox record itself. |
| `e5763f8` | **Task 3** — a search result showed a court name and no date. `judgmentDate` rendered nowhere; hidden because 9 fixtures across 8 files set `court: 'Mock SC · 2026'`. Year sliced from the ISO string, never `new Date()` (UTC midnight renders as the previous day west of Greenwich). |
| `434831b` | **Task 2 part 1** — the eCourts Tier 3 path fetched `prefilledQuery` and threw it away; `instructions` and `captchaRequired` undeclared; a failed lookup rendered nothing. Plus `Treatment.paragraph` (invented field, no column) and `counts.overruledHere` (optional against unconditional). |
| `0113bf7` | **Task 2 part 2** — `POST /court/lookup` was described three different ways (contract / client / mock), with `manualEntry.expected` typed `string` against a boolean. |
| `66657b0` | Docs — Task 2 finished mechanically; Task 5 raised as FQ-D9. |
| `88750ad` | **PD-15** — the founder answered FQ-D9: web is no longer admin only. `CLAUDE.md` §1 and `PRODUCT_BRIEF.md` amended. |
| `d6b8455` | **Task 6** — a matter's saved authorities carry no `overruled_status`. Surface now states its own limit; three fields requested from LCC. |
| `0fb34ea` | **Task 5** — the desktop research workspace. |

**Verified at the end:** `tsc` 0 · **50 suites / 546 tests** · guards
`design-rules:0 contract-status:0 design-renders:0 schema-truth:0
amber-reservation:0 alert-coverage:1`. **Run guards from the REPO ROOT** — from
`apps/mobile` they all return 1 and it means nothing. `alert-coverage` is LCC's
and pre-existing (2 of 4 PD-5 triggers have no `alert_kind`).

### The mechanical drift sweep — reuse this, it works

A script walks every `ok(c, {…})` in `services/api/src`, collects the
object-literal keys, and diffs them against `apps/mobile/src/api/contract.ts`.
**172 response keys across the non-admin routes, 21 absent from the client, four
of them real.** The rest are correctly absent: admin routes (a different client),
saved searches (OD-12, gated on the founder), `/documents/types` (uncalled),
`/build-info`. The scratch script was deleted; it is ~30 lines and takes five
minutes to rewrite.

### PD-15 — the desktop research workspace, BUILT

Founder answered **option 1** on FQ-D9: amend the brief. Recorded as **PD-15** in
`PRODUCT_DECISIONS.md`; the contradicting lines in `CLAUDE.md` §1 and
`PRODUCT_BRIEF.md` §Where it runs now point at it. Founder's conditions, all
carried into PD-15 and honoured:

- mobile stays first-class and is **not** redesigned around desktop
- **no separate app** — `apps/mobile` already targets web
- responsive within the existing architecture
- **reversible**
- **no backend change for the desktop workspace alone**
- must not block unrelated work

**What exists:** `apps/mobile/src/screens/research/ResearchWorkspace.tsx`,
mounted by `app/(tabs)/search.tsx` (the same tab, not a new route).

- Below `size.researchTwoPane` (**900**, a new token in `theme/tokens.ts`) it
  renders `<SearchScreen />` and nothing else. The phone is byte-for-byte
  unchanged. Two tests fail the moment that stops being true.
- Above it: results left (`size.researchListPane`, 420, fixed not fractional),
  1px rule, reader right.
- The right pane holds a **stack**. A citation inside a judgment opens on top;
  back steps out without touching the results. A **new search result replaces
  the stack** rather than growing it.
- `SearchScreen`, `JudgmentScreen`, `PrecedentScreen` are mounted **unchanged**.
  The only new seam is `SearchScreen`'s optional `onOpenJudgment` prop
  (`OpenJudgmentTarget`); without it the screen pushes a route as always.
- Depth is stated (`n authorities behind this one`), not breadcrumbed — a
  judgment opened from a citation link has no title until it loads.
- **Verified by observation:** `npx expo export --platform web` builds and emits
  a 4.6MB bundle.

---

## 4 · WHAT IS OUTSTANDING — start here

### 4a · Backend dependencies sent to LCC, awaiting reply

**Bus 0046** — `POST /search` `filters` to accept `courts` / `bench` /
`subjects`, **plus a decision on the category→court-name mapping**. Court, bench
and subject chips are drawn **disabled with an honest line** in `FiltersSheet`
until this lands. **Do not guess the mapping**: `filters.court` is an exact
`j.court = $1` match on a court NAME and the chips are categories; a wrong string
silently returns zero results, which is the worst failure mode for the filter an
advocate reaches for now that 40,980 High Court judgments are in the corpus.

**Bus 0048 — P0.** `GET /matters/:id/authorities` sends no good-law status.
`AUTHORITY_COLUMNS` selects seven columns and none is `overruled_status`; no
verification fields either. Requested: `verificationState`, `verifiedBySource`,
`overruledStatus`, **read live from `judgments` at request time, never stored on
`matter_authorities`** (a status copied at save time is the cached value the
harness forbids). The join to `judgments` already exists, so it looks like a
three-column change.

**When 0048 lands:** add the three fields to `MatterAuthority`, render the marks
through `citationRender()` in `MatterScreen`, and **delete the temporary line**
"This list does not yet show whether an authority is still good law. Open one to
check it." The fields were deliberately NOT declared in advance — a type that
promises a field the wire does not carry is exactly the `Treatment.paragraph`
defect removed this session.

### 4b · The remaining ladder

- **TASK 7 — briefing.** Rebuilt this session onto the real wire
  (`BriefingBlocks`, `dateConfidence`, `BriefingAuthorityRow`), but never swept
  with the mechanical method. Do that.
- **TASK 8 — drafting.** `DraftsListScreen` / drafting surfaces. NOTE: LCC found
  drafting has no creation path (`CURRENT_PLAN` Q1.9) and RCC was told to stop
  adding to drafts — check that instruction still stands before building.
- **TASK 9 — product UX.**
- **TASK 10 — performance.**
- **Task 5 follow-ups, all optional and none blocking:** matters and
  citation/treatment context are reachable in the pane but were not given
  desktop-specific treatment; the workspace has had **no device or browser
  verification**, only a successful build and jest.

### 4c · Architecture item, untouched by instruction

The shared working-tree → separate-worktree migration. The founder said: **do not
perform a risky live worktree migration while LCC is actively working in the
current tree.** LCC has been pushing to `main` continuously all session
(`c8b5a4a`, `a09e469`, `1d8e78c`, `46c6c16` interleaved with RCC's). Leave it.

---

## 5 · THINGS THAT WILL WASTE YOUR TIME IF NOBODY TELLS YOU

- **RNTL `render` and `fireEvent` are ASYNC in this repo.** `render(<X/>)`
  without `await` gives "`render` function has not been called" from `screen`,
  which looks like a mocking bug and is not.
- **Guards must run from the repo root.** From `apps/mobile` all six return 1.
- **`check-hex.mjs` is not at `scripts/check-hex.mjs`** — it is referenced in
  `tokens.ts` but running it from the root fails with MODULE_NOT_FOUND. Six real
  guards, listed in `scripts/ci-local.mjs`.
- **`git stash push -- <file>` needs a repo-root-relative path** and the shell's
  cwd must be the repo root, or it errors with a doubled prefix.
- **Bash tool cwd does not persist reliably** between calls — prefix with an
  absolute `cd`.
- **jest does not gate syntax on untested screens.** `tsc --noEmit` is the real
  gate. Run both.
- The mobile suite runs in ~10s. There is no reason to skip it.

---

## 6 · MEMORY / DEFECT CLASSES — keep documenting these

The founder asked for these to be recorded as they recur. Current count ~20
instances of the first.

1. **Server sends a field → client type / fixture / renderer silently drops or
   narrows it.** By far the most common. Hidden by fixtures being easier to write
   than the wire.
2. **Its inverse — too WIDE on what we SEND.** `CitationCopy.surface` as `string`
   turned a typo into a runtime 400 on a write the outbox never drops.
3. **Invented client fields.** `Treatment.paragraph` — no column, no route, no
   fixture, and a renderer reading it. More dangerous in review than (1) because
   the type reads as evidence the wire carries it.
4. **One endpoint described several ways.** `courtLookup`: contract, client and
   mock all different, one with the wrong primitive type.
5. **Built but unreachable.** `onAddToMatter` drawn by `ResultCard` and passed by
   nobody; `CounterArgumentsScreen`; the annotations read path.
6. **Fetched and discarded.** `prefilledQuery` — the client asked for it, typed
   it, and never used it.
7. **Silence read as a claim.** A surface without the citation fields renders
   bare rows, and in this product bare means "checked".
8. **Behaviour inferred from `API_CONTRACTS.md` instead of the route.**

---

## 7 · FIRST ACTIONS IN THE NEW SESSION

1. `git log --oneline -15` and check the lane bus (`.agents/bus/`) for anything
   above **0048** — LCC may have answered 0046 or 0048 while you were away.
2. Re-read `docs/RCC_MASTER_PLAN.md` §"11 Aug 2026 — the TASK 1–10 research
   ladder" (the progress marker at the top of that section is current).
3. If **bus 0048** is answered → do the `MatterAuthority` work in §4a first; it
   is a P0 on the citation harness.
   If **bus 0046** is answered → re-enable the court/bench/subject chips in
   `FiltersSheet` and delete the two "does not narrow a search yet" lines.
   If neither → **TASK 7, the briefing sweep.**
4. Then continue the ladder autonomously. Do not ask what comes next.
