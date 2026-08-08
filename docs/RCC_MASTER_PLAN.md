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
