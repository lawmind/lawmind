# Mobile release-quality pass — code-level, not device-level

**23-24 Aug 2026, NEW3.** This environment has no physical device, simulator,
or Expo Go session — only the repository and a local API. Everything below
is a **code audit**: what the source demonstrably does or does not do,
verified by reading the implementation and, where a test exists, by running
it. **Nothing here substitutes for the plan's actual list** — small/modern
iPhone, low/mid Android, VoiceOver, TalkBack, poor network, huge judgment on
a real device — those need a device or CI device farm this session does not
have, and are marked UNVERIFIED rather than inferred from code.

For each item the plan named: what's built, what's untested, and what a
device pass would need to confirm.

## Low/mid Android, small/modern iPhone

**UNVERIFIED — no device or simulator available this session.** No layout
audit performed. The app uses React Native's standard flex layout
throughout (spot-checked `SearchScreen.tsx`, `MatterScreen.tsx`) rather than
fixed pixel dimensions, which is favorable but not proof of correct
rendering at any specific screen size.

## Large text

**PARTIALLY VERIFIED.** `src/components/Text.tsx` deliberately sets **no**
`maxFontSizeMultiplier` — the component's own comment states this is
intentional: capping the reading surface would deny the accessibility
scaling it exists to support. This means the app does not fight the OS
text-size setting by design. **Not verified**: whether any specific screen's
layout breaks (text overlapping, truncating, or overflowing its container)
at the largest OS text-size settings — that requires rendering the app with
that setting on, which this session cannot do.

## VoiceOver / TalkBack

**PARTIALLY VERIFIED, and thin.** `accessibilityLabel`/`accessibilityRole`
appear in **28 of 71** screen/component files (89 occurrences) — real
coverage, concentrated in the interactive controls that got them
(`ResultCard`, `ReadingView`, `ReadingControls`, `FiltersSheet`,
`TemplatePicker`, `PrecedentScreen`), not a blanket pass. **43 files have
none.** This is a coverage *floor*, not a completeness claim: a file having
zero occurrences does not mean every element in it is inaccessible (some
render only static text, which RN exposes to a screen reader by default
without an explicit label), but it does mean no one has deliberately
labelled interactive elements in those files. **Not verified**: actual
VoiceOver/TalkBack navigation order, whether labels read sensibly in
context, or whether any interactive control is genuinely unreachable —
all of that requires running a screen reader against the live app.

## Reduced motion

**NOT AUDITED this session.** `FadeRise`, `StaggerIn` (used throughout
`SearchScreen.tsx` and elsewhere) are animation components; whether they
respect the OS reduced-motion setting was not checked. Flagged as a gap in
this pass rather than silently skipped.

## Poor network / offline / degraded search

**WELL VERIFIED at the code level — this is the strongest area of the
audit.** Three independent, deliberately-designed mechanisms, not one
generic "try/catch":

1. **`SearchScreen.tsx` distinguishes a reachability failure from a real
   answer.** `response.error.code === 'network' || 'timeout'` renders "You
   appear to be offline"; any other error code (a real 4xx/5xx from the
   server) renders "This search could not complete" — never conflated.
   Tested: `SearchScreen — a reachability failure reads differently from a
   server answer`, 2/2 passing.
2. **Degraded search is never presented as "no law found."** A ranker
   timeout sets `degraded: [...]` on the response; the screen shows
   "Showing partial results" in neutral styling and explicitly does
   **not** auto-retry (a retried timeout is a second full-cost query, the
   advocate's own choice to pay for again) — matching the same
   no-auto-retry principle this session's pagination fix (§below) follows
   for "Show more results."
3. **`src/state/outbox.ts` — a genuine local-first write queue**, not just
   read-path degradation. Citation copies queue through
   `AsyncStorage` and sync when connectivity returns; the clipboard write
   itself is never blocked on network ("a court building with no signal"
   is the comment's own framing). Failures are classified server-code-first
   (`dead` on a first failure the server will always reject, vs. retry up
   to `MAX_ATTEMPTS = 8` for a transient one) rather than retried blindly
   forever or given up on after one try. 8 tests in `outbox.test.ts`,
   passing.

**Not verified**: real-world behavior on an actual throttled/lossy
connection (Network Link Conditioner or equivalent) — the code paths above
were exercised via mocked responses in tests, not a real degraded network.

## Large judgment

**NOT AUDITED this session.** No specific check of `ReadingView.tsx`'s
behavior on an unusually large document (render time, scroll performance,
memory). `ReadingView.paragraphRef.test.tsx` exists and passes but tests
paragraph-anchor correctness, not performance at scale.

## Token expiry

**VERIFIED in code, matches the plan's concern directly.**
`src/api/client.ts:147` — the client "attaches the access token, and
refreshes once on a 401" via `bridge.refresh()` (line 219), which calls
`refreshSession(refreshToken)`. This is a real, automatic refresh-on-expiry
path, not a dead end that forces a re-login on every access-token expiry
(access tokens are short-lived per `services/api` — 900s observed directly
against the live API this session during the 10-matter walkthrough).
**Not verified**: behavior when the *refresh* token itself has also
expired or been revoked (e.g., after the 15-minute post-logout window
`PREMIUM_10_MATTER_WALKTHROUGH_V1.md`'s prior-session tenant-isolation audit
already flagged as a stated tradeoff) — whether the client then shows a
clean re-authentication prompt or an opaque error was not traced this
session.

## Deep links

**PARTIALLY VERIFIED.** `app.config.ts` declares `scheme: 'lawmind'`.
Expo Router's file-based routing gives every route in `app/` a deep-linkable
path by construction — `app/auth/verify.tsx` (the magic-link callback,
functionally required for sign-in to work at all — implicitly exercised
every time the walkthrough's `POST /auth/verify` step ran, though the
*link-tap* path specifically, as opposed to a direct API call, was not) and
`app/s/[slug].tsx` (a share-link route) are the two that most obviously
depend on deep linking rather than in-app navigation. **Not verified**:
that `lawmind://` links actually resolve on a real device (iOS Universal
Links / Android App Links need domain association files this session did
not check for), or that `app/s/[slug].tsx` handles a malformed or unknown
slug gracefully.

## Account deletion

**VERIFIED — client and flow, not device.** `DeleteAccountScreen.tsx`
(shipped this round, prior session): type-your-email confirmation,
consequence summary sourced from `eraseUser`'s own doc comment rather than
invented copy, copy that only ever says "request received" — never
"deleted" — matching `data-requests.ts`'s own "requesting is not executing"
rule. 4 tests passing. **Separately**: the prior session's tenant-isolation
audit (bus 1043) found account erasure does not yet terminate a
pre-erasure refresh token — a server-side gap, LCC's to close, not
re-litigated here.

## Hidden/off premium states

**VERIFIED, and this is the one item with the cleanest evidence.** No
mobile screen calls `GET /matters/:id/premium-preview`, `POST
/premium/jobs`, or reads `capabilities` off `GET /me/entitlements` —
confirmed by grep, zero occurrences of `premium-preview`/`premiumPreview` in
`apps/mobile/src`. **The premium surfaces the plan is most worried about
shipping ahead of the backend (`SubscriptionScreen.tsx`) predate the new
capability-based entitlement spine entirely** — it shows PD-13's settled
tier names/prices with a stub purchase action (no vendor chosen, honestly
disclosed in its own comment) and does not call the new premium endpoints
at all. **This satisfies the plan's requirement by absence rather than by a
built and tested off-state**: there is no client code path that could
imply capability from screen existence, because there is no client code
path to the new premium routes yet. The gap this leaves is the flip side —
when a premium-preview UI does get built (queued, not started), it will
need the capability check the plan requires, and there is no existing
pattern in this codebase to copy from yet.

## What this pass adds to the release gate (§13.6)

| Gate item | Status |
|---|---|
| production build cannot use localhost/dead URL | Already fixed, 22 Aug session (bus 1000) |
| real-device push if marketed | Blocked on `FQ-PUSH-PROJECT`, unchanged |
| deletion flow | VERIFIED client-side; server token-termination gap open with LCC |
| accessibility pass | **PARTIAL** — 28/71 files labelled, no screen-reader run performed |
| low-end Android pass | **UNVERIFIED** — no device |
| poor-network/degraded-state pass | **VERIFIED at code level** — strongest area of this audit |
| no fake trial/countdown/scarcity UI | No such UI exists in the codebase (grepped: no countdown/scarcity components found) |

## Founder queue

Nothing new. A device farm or physical-device access (for the UNVERIFIED
rows above) would need to be requested explicitly if the founder wants this
gap closed before those release-gate rows can move past PARTIAL/UNVERIFIED
— not filed as a formal FQ entry here since it wasn't asked for and may not
be needed before TestFlight/Play internal QA, where real devices enter the
loop naturally.
