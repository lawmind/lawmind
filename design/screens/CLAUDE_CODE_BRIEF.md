# Claude Code brief — build Lawmind from these designs

Paste this file as your first message to Claude Code, with the whole zip attached
or unpacked in the repo. Work through the phases in order; do not skip ahead to
polish.

---

## Context to give Claude Code first

> I am building **Lawmind**, a mobile app for practising advocates in India.
> The design is finished and attached. **`IMPLEMENTATION.md` is the authority.**
> Where the spec and a design file disagree, the spec wins — it is ahead of the
> files in two known places (the four gilt placements, and body minimum 16px).
> The three `.dc.html` files are the live designs: open them in a browser to see
> behaviour and read their inline styles for spacing, type and layout.
> `renders/` holds golden PNGs — **30–43 are current**; 00–29 are superseded v1/v2
> where layout is often still valid but colour and serif are not.
>
> Rules that cannot be broken: a citation always shows its verification state; an
> overruled judgment always shows its caution state (three states, not one); every
> AI-generated draft carries the "AI-assisted draft — verify before filing" mark
> until removed through two confirmations plus a typed REMOVE, and that removal is
> audited; search shows skeleton cards, never a bare spinner; the app is
> local-first and fully readable offline; when the AI is unavailable we say so
> plainly and never serve a stale answer as fresh.

## Stack (change only with reason)

- **App:** React Native + Expo, TypeScript, expo-router.
- **State/data:** TanStack Query over a local-first SQLite store (expo-sqlite or
  op-sqlite + Drizzle). An outbox table with idempotency keys handles offline writes.
- **Motion:** react-native-reanimated 3. **Three springs only** — default
  (.38/.72), snappy (.25/.80), gentle (.50/.78). The two CSS cubic-beziers in the
  `.dc.html` files are web approximations of these; do not port them.
- **Haptics:** expo-haptics, wrapped in one `haptics.ts` exporting exactly five
  **semantic** names — `tap` · `commit` · `ritual` · `shift` · `reject`. Named by
  *what happened*, never by impact weight: the module owns the platform mapping so
  it can be retuned per device without touching a screen. **No screen calls
  expo-haptics directly and no screen names an impact style.** Haptic and visual
  fire in the same frame. Mapping in IMPLEMENTATION.md §Motion.
- **Type:** Inter, Source Serif 4, JetBrains Mono, Noto Sans/Serif Devanagari via
  expo-font. **Lora is not used** — it was replaced after evaluation (see
  IMPLEMENTATION.md §Typography).
- **i18n:** i18next, `en` + `hi`. Devanagari line-height **≥ 1.65 minimum, 1.72 in
  body** — enforced in the `Text` wrapper, not per screen.
- **Admin web:** Next.js (App Router) + Tailwind, same tokens, desktop-only layout.

## Logo and animation — use the real files

`assets/lawmind-gavel.json` is the logo. Render it with lottie-react-native:
animated on splash (once, ≤900ms), and **static at frame 34** for the app icon,
tab bar and letterhead — never redraw it as an SVG by hand. `assets/lawmind-ai.json`
is the thinking state: 32px inline while a search runs, 120px centred while a draft
generates. Retint both with the duotone helper in `lottie-mark.js` (port it) so
they read seal-red, gilt or ink. Never ship the untinted AI animation in the app.

Palette is **paper, ink, one accent — oxblood `#5E1A2B` — and gilt as ornament.**
Tokens: paper `#FBFAF7` (with ~2% stipple
tooth) · desk `#F2EFE8` · card `#FFFFFF` · ink `#141B2D` · ink-muted `#5A6478` ·
ink-faint `#8A8578` · rule `#DAD6CB` · hairline `#E8E4DA`. States: verified
`#1F6F4A`, caution `#B4690E` (text `#8A5109`), danger `#9E2A33`.

**Restraint is the premium signal.** Oxblood appears **at most twice per screen** —
once for the primary action, once for earned emphasis. Three is a defect.

**Radius: 2px, 3px maximum.** Exceptions: sheets 12px (top corners only) and
genuinely circular elements (avatars, dots, switch track). There are no 6/8/10/16px
radii in this product.

**No shadow on any resting surface** — not cards, not buttons, not headers.
Structure comes from 1px rules and spacing. Shadow appears in exactly three places,
only while an element genuinely floats: sticky bar `0 -8px 24px rgba(20,27,45,.06)`,
modal sheet `0 -18px 44px rgba(20,27,45,.16)`, and a long-pressed card (radius
springs 4→18, transient). The only blur is a sticky bar.

**Type:** Source Serif 4 for all legal content, Inter for chrome, JetBrains Mono
for citations, Noto Serif/Sans Devanagari for Hindi. Measure ≤72 chars. **Body
minimum 16px**, serif leading 1.6–1.7, Devanagari 1.72.

**The badge is the product.** Registry stamp: 1.5px border, 2px radius, mono label.
Five states differentiated by **shape** (solid / dashed / filled), because shape is
what survives sunlight and colour deficiency. `unverified` is neutral ink with a
dashed edge and the word `NOT CONFIRMED` — **never red, never a warning triangle,
never "failed"**. Full spec in IMPLEMENTATION.md §Badge; do not improvise it.

**Motion is not optional.** Three springs only: default (.38/.72), snappy
(.25/.80), gentle (.50/.78). List entry staggers at index × 55ms capped at 7.
Every tappable scales to .965 with −3% brightness and a `tap` haptic.
Loading **shimmers, never spins** — there is no spinner in this product, custom or
system. The single exception is the AI mark animation (`assets/lawmind-ai.json`),
32px inline while searching and 120px centred while drafting; it is a brand mark
that moves, not a progress indicator. Confirmations run the ritual: `ritual` haptic,
circle settles, checkmark draws with overshoot, then a gilt shimmer fades over
600ms (ornament, carries no information — permitted under the gilt rule).
`matchedGeometryEffect` is mandatory for list → detail and for the briefing seal.
Full choreography, haptic map and parallax rules in IMPLEMENTATION.md §Motion.

## The gilt rule — read this before writing any colour

Gilt `#C9A227` appears in **exactly three places**: the **briefing seal ring**, the
**verified tick ring**, and **identity marks** (logo, letterhead, splash, admin
sidebar). It is **ornament marking authority the app has already established.**

Gilt **never carries information**, never appears as text or as a rule that must be
read, and never sits on anything tappable. Any other use is a defect.

The distinction matters and is not negotiable: what was killed was gold as
*load-bearing* text and rules, which fails in direct sunlight on a mid-range
Android. Ornament that carries no meaning does not have that problem — if it washes
out, nothing is lost.

| Permitted | Forbidden |
|---|---|
| The ring around the briefing seal glyph | Any gilt text a user must read |
| The 2px ring around the verified tick disc | A gilt rule that divides content |
| Logo, letterhead, splash, admin sidebar mark | A gilt button or any gilt on a tappable surface |
| | **CNR or next-hearing date in gilt** — load-bearing, render in ink |
| | Gilt on paper at body size |
| | Gilt as a state, a status, or a badge colour |
| | A gilt spinner, progress fill, or shimmer tint |
| | A rotating or animated gilt border |

**The test:** remove all the gilt and check whether anything became unknowable. If
yes, it was load-bearing and must be ink.

Never a second accent beyond oxblood, and never a gilt fill on a control.

## Phase 0 — foundations (do this before any screen)

1. `theme/tokens.ts` — colours, radii, spacing, shadow, durations, easings, exactly
   as in the spec. No hex literals anywhere else in the codebase.
2. `components/Text.tsx` — variants: `ui`, `uiStrong`, `legal` (Source Serif 4), `record`
   (mono), `eyebrow`. Each variant sets font, size, line-height and picks the
   Devanagari face when locale is `hi`. **Minimum 16px enforced here** — many users are over fifty and reading in bad light. The wrapper must throw in development if a caller passes below 16.
3. `haptics.ts` and `motion.ts` (durations, easings, `useReducedMotion`).
4. Primitives: `Button`, `Card`, `Badge`, `Chip`, `Input`, `Sheet`, `Toast`,
   `SkeletonCard`, `SectionRule`, `EmptyState`. Every pressable: scale to **.965**
   with −3% brightness on the **snappy** spring, and fire `haptics.tap()` on
   press-in.
5. Tab navigator with the 4 tabs: active = `oxblood` 2px top rule + `ink` filled
   icon + `ink` label; inactive `ink-faint`. 30px bottom inset.

Ship Phase 0 with a Storybook-ish screen that renders every primitive in both
languages. Compare it against `renders/30-system-refined@2x.png` (the current system — palette,
type scale, rule weights, buttons, inputs, card anatomy) and
`renders/00-logo-real-mark.png` before continuing. `renders/02-design-system.png`
is the superseded v1 sheet.

## Phase 1 — read-only skeleton with fixtures

Build Today, Matters list, Matter detail, Judgment detail from local fixtures
(lift the content from `LawMind Prototype.dc.html`'s logic — the case law in there
is real). No network. Verify against:

- `renders/31-today@2x.png` — Today, current system
- `renders/09-matter-detail.png` — matter detail (v1 palette; layout is current,
  colour and serif are not — take those from `renders/30-system-refined@2x.png`)
- `renders/19-overruled-three-states.png` — all three overruled states

## Phase 2 — the briefing

This is the product. Build `BriefingTakeover` exactly as in
`renders/34-briefing@2x.png`: paper ground, oxblood masthead rule, four numbered
blocks, checklist
that writes optimistically and queues offline. Implement the arrival animation and
the seal stamp (420ms observed settle, **snappy** spring, `commit` haptic, once per
briefing — its gilt ring is gilt placement 1). The push
notification opens straight into it. Cache every briefing for 30 days; it must
open with the network off.

## Phase 3 — search

Query box → skeleton (**1.8s** shimmer loop, siblings offset 200ms) → results with
staggered entry (55ms, cap index 7) → judgment detail (push **30px**, outgoing
scales .95 and fades, `commit` haptic). Implement all four states:
results, loading, no results with a reason, AI unavailable. The badge is the **registry stamp** family, settled — see
`renders/32-badge-family@3x.png` for all five states at 3x and
`renders/33-search-mixed-list@2x.png` for the mixed list that proves them.
`renders/12-verification-badges.png` and `renders/12-verification-badge-d.png` are
**superseded v1 exploration** — do not build from them.

## Phase 4 — drafting

Type picker → per-type input form → streamed output. The document renders in Source Serif 4
on a sunken ground (`#F2EFE8`) with the hatched AI-mark margin; citations stream in with their
verification state; the removal flow is two checkboxes plus a typed `REMOVE`,
logged. Hindi output uses Noto Serif Devanagari at 1.72 with citations left in
English. See `renders/35-draft-output@2x.png` (English) and `renders/36-hindi-parity@2x.png`
(Hindi, third frame).

## Phase 5 — onboarding, account, offline

Magic-link sign-in, identity + enrolment (never blocking — "verification pending"
is a state to be proud of), language, optional first matter. Whole flow under two
minutes. Then the offline strip, the sync outbox indicator, profile, subscription
tiers (Starter ₹799 · Professional ₹1,999 · Expert ₹3,499 · Firm = contact us, no
buy button). See `renders/18-splash-signin.png`, `renders/10-onboarding.png` and
`renders/37-honest-states@2x.png` (offline · AI down · privacy · empty).

## Phase 6 — admin desk

Next.js, **17 sections** per `LawMind Admin.dc.html` (see IMPLEMENTATION.md §8a —
four were added: cause list sync, disputed citations, draft templates, data &
deletion). Everything that looks like a
control must be one: kill switches, maintenance mode, feature-flag percentages,
model routing, budget caps, approve/reject, notify-affected. Every privileged
action writes to an append-only audit ledger with actor and before/after. See `renders/13-admin-overview.png` through `renders/17-admin-citation-monitor.png`,
plus `renders/39-admin-causelist.png`, `renders/40-admin-disputes.png`,
`renders/41-admin-templates.png` and `renders/42-admin-privacy.png`.

**The admin desk consumes the same `tokens.ts` as the app.** There are no
admin-only hex values, no second palette and no second type scale. Its dark sidebar
is `ink` `#141B2D` with `parchment` text at stated opacities; its content area is
`paper` with `card` panels, `rule` borders and `oxblood` for primary actions —
exactly the app's tokens, arranged for a 1440px desk.

Two consequences a build agent must honour:

1. **The verification badge renders identically in admin and app.** Same component,
   same five states, same geometry (§Badge). An admin reviewing a disputed citation
   must see precisely what the advocate saw — a different rendering would make the
   disputed-citations queue useless.
2. **Density differs, values do not.** Admin uses 10px radii on panels and a tighter
   vertical rhythm because it is a data tool at desk distance. Where it does, that is
   a documented density variant of the same token, never a new value. If you find
   yourself typing a hex that is not in `tokens.ts`, stop.

The admin's *current rendered state* is a v2 palette that predates the refined
system. Build from `tokens.ts` and the renders' **layout**, not their colour.

## Acceptance checks (run before calling anything done)

- [ ] Every citation on screen has a verification state. Grep for citation
      rendering without a badge — it should return nothing.
- [ ] All three overruled states render correctly in search, briefing, draft and
      detail; `set_aside` disables "add to matter" and `doubted` shows no banner.
- [ ] A draft cannot be exported without the AI mark unless removal was completed
      and logged.
- [ ] Aeroplane mode: Today, matters, briefings and drafts all open and remain
      editable; queued writes flush on reconnect.
- [ ] Search with the AI disabled shows the honest state, not a cached answer.
- [ ] Hindi: no clipped matras at any size; nothing below 16px.
- [ ] Reduce Motion on: no transforms anywhere, opacity only.
- [ ] Every tap target ≥ 44×44; every primary action reachable one-handed.
- [ ] Cold start to Today under 2s on a mid-range Android with cached data.

## Do not

- Do not introduce a second accent colour beyond oxblood.
- Do not use gilt for anything outside the four placements, and never on a
  tappable surface or as text.
- Do not add dark mode in v1.
- Do not replace Source Serif 4 in legal text with a sans, or revert it to Lora.
- Do not add a hamburger menu, a bottom sheet for navigation, or a carousel.
- Do not soften the AI-assisted mark to make documents look cleaner.
- Do not use spinners where a skeleton can hold the shape.
