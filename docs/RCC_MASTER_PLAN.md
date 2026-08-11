# RCC MASTER PLAN — the nine audit gaps, researched and sequenced

Written 8 Aug 2026 after a full DONE-criteria audit (`RCC_TO_LCC_HANDOFF.md`
has the audit itself) and a document-plus-web research pass on every item
before writing code. **This file is the anti-drift device** — mirrors
`docs/LCC_MASTER_PLAN.md`'s purpose exactly. A fresh agent reads this and
knows what's done, what's next, what's blocked, and *why*, without re-deriving
any of it.

**Rules for working this list**, same as LCC's:
- Never mark an item done from inference. A test run, a device observation,
  a real endpoint probe — not "the code looks right."
- Read the live server source when the contract doc and the implementation
  might disagree — this session already found three real drifts that way
  (paragraph field names earlier, `enrolmentStatus`'s enum, `quote` missing
  from the annotation payload). Trust `services/api/src/**/*.ts` over
  `docs/API_CONTRACTS.md`'s prose summary when they conflict.
- An item blocked on the founder or on LCC goes to `docs/FOUNDER_QUEUE.md`
  **and this list keeps moving** to the next unblocked item.
- Update the checkbox AND the progress marker at the bottom in the same
  commit as the work — a plan that drifts from reality is worse than none.

---

## Removed from scope — found during research, not mine to build

- **Saved searches.** `docs/API_CONTRACTS.md` §Saved searches says outright:
  *"The endpoint existing is not approval to build the surface... do not
  build the client surface until that is confirmed."* Ties to `PD-5`/
  `FEATURE_PARITY.md` §3. Queued in `FOUNDER_QUEUE.md` 8 Aug — never
  actually escalated before this pass despite being flagged 5 Aug.
- **Draft template library / court rules reader** (SCREENS.md rows 120, 122).
  `draft_templates` is AI-generation prompts only (one `prompt` field); no
  static-forms table and no `court_rules` table exist anywhere in
  `docs/SCHEMA_TRUTH.md`. Content/schema-blocked, same class as the fee
  calculator. Queued in `FOUNDER_QUEUE.md` 8 Aug.
- **In-app purchase integration itself** (not the display screens around it —
  see Workstream F). New vendor (RevenueCat) plus Apple/Google store account
  setup, neither decidable by RCC alone. Queued in `FOUNDER_QUEUE.md` 8 Aug,
  with the library research already done so the founder is deciding a name,
  not researching from zero.
- **Matter sharing, sharee side only.** `getMatter`/`listMatters` in
  `services/api/src/matters/route.ts` filter strictly on `user_id = owner` —
  no path exists for an invited advocate to ever see a shared matter. The
  owner-side UI (Workstream B) is unaffected and proceeds. Queued in
  `FOUNDER_QUEUE.md` 8 Aug as an LCC endpoint request.

---

## Two bugs fixed before they became load-bearing (done, 8 Aug 2026)

- [x] `apps/mobile/src/api/contract.ts` `User.enrolmentStatus` was typed
      `'pending' | 'verified'`. Real DB enum (`SCHEMA_TRUTH.md#users`,
      confirmed against `services/api/src/auth/account.ts` and the assertion
      in `auth.test.ts` line 97) is `'unverified' | 'verified' | 'rejected'`.
      Fixed. `apps/mobile/src/api/mock.ts`'s fixture also had to change (it
      hard-coded the wrong value — proof the bug was real, not theoretical).
- [x] `subscriptionTier` was missing from the `User` type entirely, even
      though both `/me` (`account.ts`) and the verify flow (`auth/routes.ts`)
      already return it. Added, typed against the real 6-value enum
      (`none|practice|chamber|expert|firm|enterprise`).

---

## Workstream A — Judgment annotations (highlight & save)

PD-9 item 3, explicit SPRINT_1 requirement. Server BUILT
(`services/api/src/judgments/annotations.ts`), auth-gated (S5 auth exists,
so this is genuinely completable end to end unlike the admin-role-gated
work).

**Key correction from checking the render against generic best-practice
research:** this is NOT Kindle-style character-range highlighting.
`renders/62-judgment-reading@2x.png` shows the action bar (`Save to matter` /
`Copy ¶11` / `Link`) attaching to a whole tapped paragraph. Paragraph-level,
not a text-selection problem — the existing reading view's paragraph
`Pressable`s (already built for the anchor feature) are the entry point.
No new library, no WebView rearchitecture.

Real wire shape (`annotations.ts` line 26-33, not the abbreviated line in
`API_CONTRACTS.md`): `{ paragraphNumber: number | null, paragraphIndex: number,
quote: string (1-4000 chars), note?: string, matterId?: string }`. `set_aside`
on `matterId` attach returns `409 AUTHORITY_SET_ASIDE` with the judgment name
and the overruling case, and the save-without-a-matter path stays open — the
refusal is about using it as an authority, not about reading it.

**DONE, 8 Aug 2026 (commits `4dc93a7`, `cbb6719`).** All checkboxes below
closed. One correction to this plan's own earlier text: `ReadingView.tsx`
and `state/reading.ts` already had a full LOCAL highlight UI before this
pass (long-press, action row, `ReadingSheet`'s highlight count) — the real
gap was narrower than first assumed: no matter picker, no server sync at
all, and Copy/Link were inert. See the commit message for the corrected
account.

- [x] `Annotation`/`AnnotationDraft` types added to `contract.ts`.
- [x] `api/annotations.ts`'s `toWireAnnotation` rewritten for `quote`.
- [x] `listAnnotations`/`createAnnotation`/`deleteAnnotation` added to `client.ts`.
- [x] `state/reading.ts`'s `addHighlight` now syncs to the server, local
      write unchanged (instant, offline-safe). `AUTHORITY_SET_ASIDE`
      strips the local `matterId`, keeps the highlight.
- [x] `MatterPicker.tsx` (new) — Sheet over `usePractice`'s matters.
      "Save to matter" opens it; long-press still saves without a matter.
- [x] Copy/Link wired to `expo-clipboard` (already a dependency).
- [x] `ReadingSheet.tsx`'s highlight count was already real, not static —
      confirmed, no change needed.
- [x] `state/reading.test.ts` (new), 6 tests on the sync/refusal properties.
- [x] `tsc`, `jest` (198/198), `check-hex.mjs` clean. Endpoints probed live,
      both return the documented `401`.

**Left unverified — the one honest gap**: the full sign-in → highlight →
server-confirmed flow was not run on a device/emulator this pass. S5 auth
is real (unlike the admin-role-gated work), so this is expected to work
end to end; it just has not been observed yet. Next device pass should
include it.

## Workstream B — Matter sharing, owner side

SPRINT_3 item 3. Server BUILT (`services/api/src/matters/shares.ts`),
`client.ts` methods already exist and were verified against the live route
source this session (`matterShares`, `inviteToMatter`, `revokeMatterShare`
signatures match `shareBody`/`shape()` exactly).

Render: `renders/59-chamber-sharing@2x.png` — "Who can see this matter" list
(owner, plus each invitee with what they can do and since when), an invite
row by enrolment number or phone, a "what they see" explainer (court record +
briefings, yes; private notes, no unless shared individually), explicit
no-chamber-wide-switch copy.

**DONE, 8 Aug 2026 (commit `4cd5c60`).** Found and fixed a real bug first:
`client.ts`'s share types said `id`, the wire field is `shareId` — a revoke
button built against the old type would have called the endpoint with
`undefined`. Fixed, then built `MatterSharingScreen.tsx` + entry point +
route. Owner-side complete; sharee-side stays on `FOUNDER_QUEUE.md`.

## Workstream C — Matter note / event creation

`POST /matters/:id/events` BUILT (`services/api/src/matters/route.ts`
`createEventBody`), `addMatterEvent` exists in `client.ts`, unused anywhere.
Real shape: `{ eventDate, eventType: 'hearing'|'order'|'filing'|'note',
orderText?, notes?, noteVisibility?: 'private'|'shared' }` (defaults private
in the column, not in application code).

Render: `renders/09-matter-detail.png` — sticky footer "Add event" button
(primary) plus a secondary edit-icon button, and **a `Notes` tab distinct
from `Timeline`/`Documents`/`Briefings`** — four tabs, not three. `notes` is a
property of an event, not a separate entity server-side, so the Notes tab is
a client-side filter on `eventType === 'note'`.

**DONE, 8 Aug 2026 (commit `a907e86`).** Built as a section, not a tab —
`MatterScreen.tsx` is a flat scroll, not a tabbed screen (the render's
4-tab structure doesn't match the shipped architecture, and rebuilding the
whole screen as tabs to match one render was a bigger change than this gap
warranted). One correction from the plan's own earlier text: the Notes
section filters on `events.notes` being set, not on `eventType === 'note'`
— `notes` is a field on any event type, and a hearing can carry a private
thought about it too. `AddEventSheet.tsx` (new) adapts its field
(`orderText` vs `notes`) to the selected type.

## Workstream D — Citator alerts in the evening briefing

PD-6. `GET /alerts`, `POST /alerts/:id/read`, `GET|PATCH /me/alert-settings`
BUILT and probed live by LCC tonight — shape confirmed in
`LCC_TO_RCC_HANDOFF.md`. `client.ts` has no `alerts` method at all yet.

```
GET /alerts?since=<ISO> → { alerts: [ { id, kind, severity, judgmentId,
  matterId, fromStatus, toStatus, judgmentTitle, overruledParas,
  currentOverruledStatus, createdAt, readAt } ], unreadCount }
kind: 'saved_authority_moved' | 'filed_citation_moved'
severity: 'immediate' | 'batched'
PATCH /me/alert-settings: { savedAuthorityMoved?, ownMatterJudgment?,
  unknownListing? } — .strict(), sending filedCitationMoved is a 400
  (trigger 2 cannot be disabled, on purpose)
```

Render: `renders/60-citator-alerts@2x.png` — panel 1 shows the "since
yesterday" block growing under the Today briefing card (batched, not a
separate surface); panel 2 shows the ONE immediate-push exception (danger
tint, never gilt); panel 3 is the settings screen, four triggers, trigger 2
shown disabled with real copy ("Cannot be turned off").

**`ownMatterJudgment`/`unknownListing` currently have no producer** — toggling
them saves correctly and simply never has anything to show yet (trigger 3
awaits OCR, trigger 4 awaits the cause-list-to-matter matcher). Build the
toggle honestly; do not imply either does something today.

**DONE, 8 Aug 2026 (commit `18b98fd`).** Found a fourth contract-drift bug
first: `contract.ts` already had an `Alert` type, but it was aspirational
(wrong field names, invented `body`, wrong `kind` values) — rewrote against
LCC's actual live-probed shape. `state/alerts.ts` fetches once on `Today`
mount, never polled. "Since yesterday" card renders only the two `kind`s
that really exist — the render's other example rows (status report
uploaded, unexpected listing) have no data source and were not built.
`AlertSettingsScreen.tsx` built; no entry point yet, lands with F.

## Workstream E — Enrolment-pending band

SPRINT_5 item 3. Two DISTINCT surfaces in the renders, both real, build both:

- **Global band**, `renders/58-signin-otp@2x.png` right panel — a band ABOVE
  the header (not a card in the flow), amber, "Enrolment D/X is being
  verified... Everything works meanwhile," disappears the instant status
  flips to `verified`. Shown on `Today` in the example; confirm on read
  whether it belongs at the tab-root layout level or `Today`-only before
  wiring — the render only shows one screen, don't assume scope beyond it.
- **Profile card**, part of Workstream F below — same fact, dark-header card
  treatment, different surface, not a duplicate to dedupe away.

Depends on the `enrolmentStatus` fix already done — check for
`'unverified'`, never `'pending'`.

**DONE, 8 Aug 2026 (commit `939cec0`).** `EnrolmentBand.tsx` built, mounted
on `Today` only — the render doesn't show it anywhere else, so scope
wasn't assumed beyond that evidence. The Profile-screen dark card is a
different, real treatment, built in Workstream F.

## Workstream F — Profile, Settings, Subscription screens

SPRINT_5 items 4-5, and the reason SPRINT_5's own DONE line ("consent visible
in settings afterwards") currently can't be true — none of these three
screens exist (`find screens -maxdepth 1` confirmed zero `settings`,
`profile`, `subscription` directories).

**Render/schema conflict resolved during research — PD-13 wins:**
`renders/51-subscription@2x.png` uses tier names `Starter`/`Professional`,
retired by `PRODUCT_DECISIONS.md` PD-13 ("Settled 2 Aug 2026... the site
names win, the docs move"). Real names/prices: **Practice ₹799/mo · Chamber
₹1,999/mo · Expert ₹3,499/mo · Firm "Talk to us" · Enterprise not shown
in-app at all.** The render's "no buy button, managed on web" caption also
conflicts with PD-13 + `OD-10` (settled: "launch on standard store billing"),
which require real native IAP for the first three tiers — App Store
guideline 3.1.1. See "Removed from scope" — the purchase mechanism itself is
founder-blocked; the comparison/display screen is not.

Render for Profile/Settings: `renders/20-settings-switches.png` (two panels
in one file) — Profile: name/enrolment header (dark), enrolment-pending card,
Practice section (courts/practice areas/language — all real `/me` fields),
Plan section (`subscriptionTier` + "Change" link). **The render's "Usage this
month: 148 of 300 searches" has no backing endpoint anywhere — omit it,
don't invent a counter.** Settings: Notifications (must wire to the REAL
`/me/alert-settings` from Workstream D, not fabricate separate toggles),
Data/offline section, Sign out (`api.signOut` already exists and works).

**DONE, 8 Aug 2026 (commit `e4dc3ed`).** Two more render/schema mismatches
found and correctly not built — see the commit message for the full
account: Profile's "Practice" section (courts/areas) and "usage this
month" have no backing field anywhere; Settings' seven controls (four
notification toggles, three data/offline actions) match nothing real, and
"Export my data" would need an advocate-facing `POST /data-requests` that
does not exist (only the admin-side processing endpoints do). Both
screens built small and honest instead of large and illustrative.
Subscription uses PD-13's real names, purchase stubbed. Today's avatar
entry point added, routes to Profile → Settings → Alerts, closing the loop
Workstream D left open. IAP library was NOT installed — still waiting on
the `FOUNDER_QUEUE.md` decision.

---

## Verification — done, 8 Aug 2026

- [x] `tsc --noEmit`, `jest` (23/23 suites, 198/198 tests), `check-hex.mjs`
      clean across the whole diff, run again as one consolidated pass after
      Workstream F rather than trusted from the per-workstream runs alone.
      `check-sunlight.mjs`'s 2 failures reconfirmed as the pre-existing
      `inkFaint` issue — unchanged by this session's work.
- [x] Every new/changed endpoint call probed live against production
      (`curl`), each returning the exact documented `401`/refusal — see
      each workstream's own commit message for the specific probes.
- [x] Committed in logical groups, one per workstream (`4dc93a7` PREP,
      `cbb6719` A, `4cd5c60` B, `a907e86` C, `18b98fd` D, `939cec0` E,
      `e4dc3ed` F), plus doc-sync commits after each.
- [x] `RCC_TO_LCC_HANDOFF.md` updated with the matter-sharing sharee-access
      gap, addressed to LCC specifically (an endpoint request, not a
      founder decision) — separate from its `FOUNDER_QUEUE.md` entry.
- [x] **Done, 9 Aug 2026 — the one honest gap is closed.** A real Samsung
      device was booted (USB, then wireless ADB after the cable dropped) and
      all five flows were observed for real, past the `401` boundary:
      sign-in, annotation-save-to-matter, matter-invite, add-event, and
      alert-settings-toggle. Maestro (mobile.dev, installed fresh this
      session) proved far more reliable than raw `adb shell input tap` for
      anything timing-sensitive; `uiautomator dump` was used throughout to
      get exact element bounds rather than guessing screen-percentage taps.

      **Five real bugs found and fixed by this device pass — code that
      "looked right" and was not:**
      - **The onboarding-loop bug, the most serious of the five.**
        `GET /me` and `PATCH /me` both wrap their payload under a `user` key
        server-side; `contract.ts`'s `MeResponse` type and `session.ts`'s
        read site assumed a flat shape. Every sign-in of a previously
        onboarded account read `user.profileComplete` one level too shallow
        (always `undefined`), permanently overwrote the cached profile with
        `null`, and dropped the advocate back into onboarding — 100%
        reproducible, not intermittent, on every single returning sign-in.
        Fixed in `contract.ts` (`MeResponse`, `Session`) and `session.ts`
        (`loadProfile`, `completeProfile`, `registerPushToken`).
      - **`Matter`/`MatterEvent`/`User` id-field naming**, systemic across
        ~10 files: the client's own types said `id`, the server returns
        `matterId`/`eventId`/`userId`. Every list, picker, and timeline that
        compared or keyed on `.id` was silently broken. Fixed in
        `contract.ts`, `client.ts`, `mock.ts`, `practice.ts`, and every
        screen that touches a matter or event.
      - **No matter-creation UI existed at all** — `MattersScreen`'s empty
        state and `TodayScreen`'s "Add a matter" prompt both routed nowhere
        real. Built `NewMatterScreen.tsx` + `app/matter/new.tsx` + wired
        both entry points.
      - **`Sheet.tsx`'s keyboard-avoidance bug**, found live: Android's
        `Modal` does not participate in `windowSoftInputMode` resize, so the
        Add-Event sheet's Save button was permanently hidden under the
        keyboard with no non-destructive way to reach it (the hardware back
        button dismissed the keyboard AND the whole sheet at once). Fixed
        by wrapping the sheet content in `KeyboardAvoidingView`.
      - **`ReadingView.tsx`'s `FlatList` had no `extraData`** — the bug that
        made annotation-save look completely dead. `selected` and
        `highlighted` are component state, not part of `judgment.paragraphs`,
        so `VirtualizedList`'s cell memoization skipped re-rendering a row
        when only that outside state changed: tapping a paragraph correctly
        called `setSelected`, confirmed via temporary instrumentation
        (`console.log` in `onLink` and in `Paragraph`'s render), but the
        action row never appeared on screen because the row was never asked
        to redraw. Fixed with `extraData={[selected, highlighted]}`. Once
        fixed, the "Save to matter" flow was run end to end on a real
        judgment paragraph (Saravanan v. State, ¶6): action row appeared,
        matter picker opened over the real `usePractice` matters, saving to
        "State v. Ramesh Kumar" produced the `cautionWash`-highlighted,
        underlined paragraph style — confirmed still present after a full
        app force-stop and relaunch, i.e. a real round trip through
        `api.createAnnotation`, not just in-memory Zustand state.

      **Also worth recording for whoever debugs this area next:** several
      corpus judgments (e.g. "Frank Vitus v. Narcotics Control Bureau",
      2024 INSC 479) render as a single unnumbered paragraph end to end —
      preamble, headnotes, and body text all joined by literal `\n` inside
      one `paragraphNumber: null` row, so Save-to-matter is correctly
      unavailable on them by design (`onSaveToMatter`/`onPickMatter` are
      `undefined` when `paragraphNumber === null`). This looks identical to
      a broken UI from the outside; it is a corpus-parsing characteristic,
      not a client bug. Worth flagging to whoever owns the ingestion
      pipeline — these look like reporter-headnote-formatted judgments
      (`Digital Supreme Court Reports` pagination visible in the text),
      which per `CLAUDE.md` §6 should not be in the corpus in that form.

---

## Progress marker — update this line every session

### 11 Aug 2026 — the TASK 1–10 research ladder

**Done: 1 (result-card actions), 2 (contract drift sweep), 3 (search workflow),
4 (judgment reader audit), 5 (desktop research workspace), 6 (matter
authorities audit), 7 (briefing sweep), 8 (drafting — investigated, blocked on
Q1.9 exactly as flagged, one severe server bug found).** Commits `b8b9558`,
`e5763f8`, `434831b`, `0113bf7`, `0fb34ea`, `d6b8455`, `67bfde1`.

**Task 2 is finished and it was run mechanically, not by eye.** A script walks
every `ok(c, {…})` the API returns, collects the object-literal keys and diffs
them against `apps/mobile/src/api/contract.ts`. 172 response keys across the
non-admin routes; 21 absent from the client, of which four were real:

| finding | shape of the defect |
| --- | --- |
| `POST /verify/ecourts` `prefilledQuery` fetched and discarded, `instructions` + `captchaRequired` undeclared | the Tier 3 path handed the advocate an empty eCourts search box |
| `POST /court/lookup` declared THREE different ways (contract, client, mock), with `manualEntry.expected` typed `string` against a boolean | one endpoint, no two descriptions alike |
| `Treatment.paragraph` | **invented field** — no column, no route sends it, and `TreatmentCard` rendered it |
| `AuthoritiesResponse.counts.overruledHere` optional against an unconditional field | two fixtures described a payload production never produces |

The rest are correctly absent: admin-only routes (a different client), saved
searches (gated on the founder, OD-12), `/documents/types` (uncalled), and
`/build-info`.

**Task 6 found one defect and it is a citation-harness one, not a type one.**
`GET /matters/:id/authorities` selects seven columns and none of them is
`overruled_status` — so the Authorities list in a matter renders a case name and
a citation and nothing about whether the law still stands. That is the worst
surface in the product to have the gap: a matter file is where an authority sits
for MONTHS, and verified being silent means bare rows read as *"these are fine"*
rather than *"we did not look"*. Three fields requested from LCC (bus 0048), read
live at request time and never stored on the join row. Shipped meanwhile: the
surface states its own limit in neutral ink on a dashed edge, never amber. Matter,
MatterEvent, the shares shape and the bundle all matched exactly.

**Task 5 (desktop research workspace) — BUILT.** `FQ-D9` was answered on 11 Aug
2026 (option 1) and is recorded as **PD-15**; `CLAUDE.md` §1 and
`PRODUCT_BRIEF.md` are amended so "web is admin only" no longer contradicts it.

`src/screens/research/ResearchWorkspace.tsx`, mounted by the existing search tab.
Below `size.researchTwoPane` (900) it renders `<SearchScreen />` and nothing else
— the phone is byte-for-byte unchanged, and two tests fail the moment that stops
being true. Above it: results left, reader right, and **the list survives opening
a judgment**, which is the single thing a phone cannot do and the entire reason
the layout exists. The pane holds a STACK, so a citation inside a judgment opens
on top of it and steps back out without touching the results.

`SearchScreen`, `JudgmentScreen` and `PrecedentScreen` are mounted unchanged. The
only new seam is `SearchScreen`'s optional `onOpenJudgment`; without it the screen
pushes a route exactly as before. **No backend change** — same `POST /search`,
same `GET /judgments/:id`, no endpoint, parameter or field added, as PD-15
requires. Verified by observation: `expo export --platform web` builds and emits
a bundle.

**Bus 0046 — CLOSED, and bus 0050/0053 landed alongside it.** LCC shipped
`c2da1b9`/`1cefe6c`: `POST /search` accepts `filters.courts` as category codes
(`sc`/`hc`/`district`/`tribunal`), expanded to court names server-side
(`search/court-category.ts`) — the mapping RCC refused to guess client-side.
`bench`/`subjects` stay refused: bench strength has no judge-count column
anywhere in the corpus, subjects has no column at all. `unpopulatedCourtCategories`
on the response (`['district','tribunal']` today) now drives the zero-result
message so a category the corpus holds nothing in reads as that, not as "your
query matched nothing".

**Also in the same reply (bus 0053):** `GET /documents` fixed (bus 0050,
`m.title` → `m.case_title` — it had 500'd unconditionally since the Drafts tab
shipped). And a P1 LCC found chasing the bench-strength question: `bench` held
an AWS ingest partition slug (`patnahcucisdb94`-shaped) on every High Court row
— 51.3% of the corpus — because the harvester's "bench" and the column's
"bench" named two different things. Fixed server-side (migration `0040`,
`source_bench_code`); `JudgmentDetail.bench` widened to `string | null`
client-side and `JudgmentScreen` renders the coram line only when present.

Client wiring: `FiltersSheet`'s court chips are a live multi-select now
(`toggleCourt`), `serverFilters` sends `courts`, `hasActiveFilters` includes
it. Commit `a682b09`. `tsc` 0, 548/548 (+2 new tests: court-chip wiring,
unpopulated-category messaging), guards clean. **All confirmed against the
deployed service (`e359283`), not just locally** — bus 0054/0057: real Patna
judgment via `GET /judgments/:id` shows `bench: null` in production, `POST
/search filters.courts` narrows for real, and the Drafts tab was smoke-tested
end to end (magic-link sign-in → real access token → `GET /documents` → 200,
draft listed, `matterTitle` populated) against production, then cleaned up.

**Bus 0047 — CLOSED**, no client change needed (already fixed pushed 11 Aug):
`prefilledQuery`/`instructions`/`captchaRequired` render on the eCourts
screen; `court/lookup`, `Treatment.paragraph` and `overruledHere` were the
three RCC-side fixes. `Treatment.paragraph` stays unbuilt — LCC confirmed it
needs char-offset→paragraph segmentation server-side first, not approximated.

**Open, sent to LCC (bus 0058):** the 401 an advocate sees immediately after
signing in, before onboarding creates their `users` row, reads "sign in to
continue" — which is true but reads as a broken login. `profileIdFor`
(`auth/middleware.ts`) already distinguishes "no `authId`" from "`authId` set,
no profile row" and collapses both before any route sees it. Recommended: a
second error code for the onboarding-incomplete case, centralized behind one
helper rather than touched at each call site, so the client can route it at
onboarding instead of an auth error. Not building client-side until the shape
exists.

**Informational, no client action (bus 0056):** Stage 8 landed — 18,590
statute amendment events with effective dates, parsed from
`statute_sections.footnote` (was stored, never read — same defect class as
`cnr`/`disposal_nature`/`petitioner`, one step worse). `docs/ai/
STATUTE_TEMPORAL_STAGE8.md`. Explicitly NOT a version-history reconstruction
— "these are the changes recorded", never "this is how it read on X". Keep
that framing if a screen is ever built against `statute_amendments`.

**Bus 0058 — CLOSED, `PROFILE_INCOMPLETE` shipped and verified live
(`c72175d`).** `AUTH_REQUIRED`/401 stays for a genuinely absent session;
`PROFILE_INCOMPLETE`/403 for a valid token with no `users` row yet, upgraded
once at the envelope (`resolveAuthFailure`, `services/api/src/envelope.ts`)
rather than at 48 call sites. Audited client-side, priority-reset item 2–4,
11 Aug: **no regression** — `client.ts`'s refresh-and-retry is scoped to the
literal `AUTH_REQUIRED` code, never fires on 403, so the re-login loop LCC
described cannot happen here. `GET /me` (`handleMe`) is architecturally
separate — it refuses on absent `authId` only, never goes through
`profileIdFor`, so the `identity_only` session-status detection the app
already relies on is untouched.

**Found doing that audit, unrelated to the envelope change itself, same
shape one layer up:** `TodayScreen` and `MattersScreen` both treated
`identity_only` (signed in, onboarding abandoned before a `users` row
existed) the same as `signed_out` — "Sign in to see your day/matters", button
→ `/sign-in`, requesting a fresh magic link for an advocate who already had a
valid session. `verify.tsx` already routes `identity_only` → `/onboarding`
the instant it is set; these two screens had no path there on relaunch. Fixed
both, 4 new tests. Commit `1cbefd9`.

**Bus 0059–0062 — read, no client action.** 0059: bench-strength correction
— it IS derivable from `judgment_judges` but the source records only the
presiding judge on most rows (Kesavananda Bharati's 13-judge bench reads as
1), so a partial coram is worse than none and the disabled chip stays
disabled, for a sharper reason. 0061: Stage 10 bake-off first numbers, a
corpus-size confound caught before publishing (sparse reaches 79,322
judgments, dense reaches 38,341 — no fair comparison yet), controlled re-run
in progress, nothing changes in `/search` without numbers sent first. 0062:
**the court filter is the ONLY way an advocate reaches High Court law today**
— unfiltered production search returns zero High Court results (0 of 40,980
are embedded, so none can win the two-contribution RRF fusion), but
`filters.courts:['hc']` returns real Patna High Court judgments immediately.
LCC's fix is embedding the HC corpus, not RCC's to touch.

Independently verified client-side (priority-reset item 5): the court-chip
→ `filters.courts` wiring is tested (`SearchScreen.test.tsx`), and the
citationless-render path every HC judgment hits (no neutral or reporter
citation, 100% of the 40,980) is tested and green
(`ResultCard.citationless.test.tsx`). Nothing client-side hides or
mis-renders an HC result once retrieved — the gap LCC found is entirely in
which results get retrieved, confirmed not RCC's to fix.

**Bus 0048 and 0049 — CLOSED.** LCC shipped `dd9871b`: `GET/POST
/matters/:id/authorities` now sends `overruledStatus` (+byJudgmentId/
byTitle/paras/note), `verificationState`/`verifiedBySource` (constants,
`judgment_id` is a NOT NULL FK so the row resolves to itself), and
`reporterCitations` on both matter authorities and briefing authorities.
`MatterAuthority` widened to match, `MatterScreen`'s saved-authorities list
now goes through `citationRender()` exactly like `BriefingAuthorityRow` —
LAW MOVED chip, struck title, "what still stands" first, who displaced it
named. The temporary "this list does not yet show..." line and the tests
that asserted it are gone, replaced with tests against the real fields.
Commit `958b8ae`. `tsc` 0, 546/546, guards clean.

**TASK 7 (briefing sweep, mechanical method) — DONE.** `GET /briefings/:id`,
`GET /matters/:id/briefings`, `GET /matters/:id` (bundle) and
`POST /briefings/:id/opened` diffed key-for-key against `contract.ts`,
`mock.ts` and every render site. The 11 Aug rewrite (bus 0038/0041) held: one
real drift found, one narrow client type fixed.

Fixed (client): `markBriefingOpened` was typed `{ ok: true }` against a route
that also returns `openedAt` (`coalesce(b.opened_at, now())`). Nothing reads
it yet — widened to match anyway, same standard as every other endpoint in
`contract.ts`.

Found, not client's to fix — **bus 0049**: `briefings/route.ts`
`liveAuthorities()` and `matters/authorities.ts` `AUTHORITY_COLUMNS` both
select `neutral_citation` and never `reporter_citations`, unlike every other
citation-bearing route (`search/retrieve.ts`, `judgments/route.ts`,
`search/qlang/compile.ts`). `citationDisplay()`'s citability rule is
`neutralCitation === null AND reporterCitations.length === 0`
(`CITATION_HARNESS.md` "the fourth concern") — so a judgment cited only by a
reporter citation (most pre-~2013 Supreme Court judgments) draws
"No citation on file — cannot be referenced in a filing" on a briefing
authority row or a matter's saved authorities, wrong, because the field was
never in the row. Two-line fix in each file, offered to ride along with bus
0048 since it already touches `matters/authorities.ts`.

Verified: `tsc` 0 · 50 suites / 546 tests · guards
`design-rules:0 contract-status:0 design-renders:0 schema-truth:0
amber-reservation:0 alert-coverage:1` (pre-existing, LCC's).

**TASK 8 (drafting) — investigated, nothing to build client-side, one severe
server bug found and reported.** Checked the standing instruction first (bus
0007, `CURRENT_PLAN.md` Q1.9): `POST /documents` still does not exist, the
pseudonymiser/Presidio/DPA chain is still unbuilt, so RCC is still correctly
not adding to draft creation or editing. `DraftDocument`/`DraftListItem`
(against `readDocument`/`listDocuments`) were already verified 11 Aug 2026 and
still match exactly. `PATCH /documents/:id` and
`POST /documents/:id/citations` have zero client callers — deliberate,
`DraftDetailScreen.tsx`'s own header says why: editing is a UX decision
nobody has specified, not a gap.

**Found instead, sent as bus 0050, marked urgent — `GET /documents` 500s on
every call, in production, right now.** `documents/route.ts` `listDocuments`
selects `m.title AS matter_title` from a LEFT JOIN on `matters`; the column is
`case_title` (`packages/db/src/schema.ts:542`), never `title`, anywhere in the
schema. Postgres rejects the query at plan time regardless of whether any row
matched the join, so every call to the Drafts tab's list endpoint fails.
`DraftsListScreen` is mounted at `app/(tabs)/drafts.tsx` (shipped as R4,
`b8b9558`) and fails soft — `loadError` renders, no crash — so the tab has
been silently empty for everyone since it shipped. No test exercises
`listDocuments`; `documents/route.test.ts` covers only `PATCH`/citations.
One-line fix, not RCC's file to touch.

---

**Last updated 9 Aug 2026. All six workstreams done, and the one
device-verification gap from 8 Aug is now closed.** PREP `4dc93a7`; A
`cbb6719`; B `4cd5c60`; C `a907e86`; D `18b98fd`; E `939cec0`; F `e4dc3ed`.
Nine real bugs found and fixed across the two sessions before/while building
on top of them — the four contract-drift bugs from 8 Aug (`enrolmentStatus`
enum, missing `subscriptionTier`, missing `quote` on annotations, the
aspirational `Alert` type), plus the five found only by booting a real
device on 9 Aug (the onboarding-loop `MeResponse`/`session.ts` bug, the
`Matter`/`MatterEvent`/`User` id-field-naming family, the missing
matter-creation UI, `Sheet.tsx`'s keyboard-avoidance bug, and
`ReadingView.tsx`'s missing `extraData`). Three items intentionally not
built, all in `docs/FOUNDER_QUEUE.md`: saved searches (needs founder
confirmation), draft template library / court rules reader (no data source
exists), and the IAP purchase mechanism itself (needs a vendor decision —
display screens around it are built). One LCC-side gap flagged in
`RCC_TO_LCC_HANDOFF.md`: matter sharing only works for the owner,
`getMatter`/`listMatters` need a sharee path.

**Next session's first action:** run `tsc --noEmit` and the full `jest`
suite — this pass edited types and state files across the two id-naming
and onboarding fixes and neither has been re-run since. The device-side
work above was observed live, not verified against the type-checker.
