# Claude Code brief — build Lawmind from these designs

Paste this file as your first message to Claude Code, with the whole zip attached
or unpacked in the repo. Work through the phases in order; do not skip ahead to
polish.

---

## Context to give Claude Code first

> I am building **Lawmind**, a mobile app for practising advocates in India.
> The design is finished and attached. `IMPLEMENTATION.md` is the spec — tokens,
> motion, haptics, components, data model, API surface. `renders/` holds golden
> PNGs. The three `.dc.html` files are the live designs: open them in a browser
> to see behaviour, and read their inline styles for exact values — they are the
> source of truth for spacing, type and colour.
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
- **Motion:** react-native-reanimated 3. Two shared easings only (see spec).
- **Haptics:** expo-haptics, wrapped in one `haptics.ts` with the five named
  patterns from the spec. Every call goes through that module.
- **Type:** Inter, Lora, JetBrains Mono, Noto Sans/Serif Devanagari via expo-font.
- **i18n:** i18next, `en` + `hi`. Devanagari line-height ≥ 1.65 enforced in the
  `Text` wrapper, not per screen.
- **Admin web:** Next.js (App Router) + Tailwind, same tokens, desktop-only layout.

## Logo and animation — use the real files

`assets/lawmind-gavel.json` is the logo. Render it with lottie-react-native:
animated on splash (once, ≤900ms), and **static at frame 34** for the app icon,
tab bar and letterhead — never redraw it as an SVG by hand. `assets/lawmind-ai.json`
is the thinking state: 32px inline while a search runs, 120px centred while a draft
generates. Retint both with the duotone helper in `lottie-mark.js` (port it) so
they read seal-red, gilt or ink. Never ship the untinted AI animation in the app.

Palette is **paper, ink and gilt — no accent colour** (IMPLEMENTATION.md §Colour):
paper `#FBFAF7` ground · cards `#FFFFFF` opaque · ink `#141B2D` for text **and
every primary action** · ink-muted `#5A6478` · rules `#E3E0D8` 1px, ink when
focused · gilt `#C9A227` for authority only (verified ring, briefing seal,
section rules) · gilt-wash `#FDF3DC`. Button rule depends on the surface: **on paper, solid ink `#141B2D` with a
`#FBFAF7` label; on an ink surface (the briefing card), solid gilt `#E8C86A`
with a `#141B2D` label.** Never a gilt button on paper, never an ink button on
ink. States are exactly three: verified `#1F6F4A`, caution `#B4690E` (text
darkens to `#8A5109` on paper), danger `#9E2A33` — always as a tinted paper card
with a 1px border, never a dark card. Oxblood #5E1A2B and brick #8B2E2E are
retired — they must not appear anywhere.

**Glass is floating chrome only** — nav bars, modals, toasts, sheets: ultraThin
material + `#FBFAF7` at 78% + blur 24 / saturate 1.4 + a gradient 1px stroke from
`rgba(201,162,39,.4)` top-leading to clear, radius 16. Content cards stay opaque.

**Motion is not optional.** Three springs only: default (.38/.72), snappy
(.25/.80), gentle (.50/.78). List entry staggers at index × 55ms capped at 7.
Every tappable scales to .965 with −3% brightness and a `.light` haptic.
Loading shimmers, never spins. Confirmations run the ritual: `.heavy` haptic,
circle settles, checkmark draws with overshoot, gilt shimmer fades over 600ms.
`matchedGeometryEffect` is mandatory for list → detail and for the briefing seal.
Full choreography, haptic map and parallax rules in IMPLEMENTATION.md §Motion.

Gold rule: gilt marks authority the app has established, never an action. Four
placements only — briefing seal, verified tick ring, record line on ink headers,
identity. No gold buttons, ever.

## Phase 0 — foundations (do this before any screen)

1. `theme/tokens.ts` — colours, radii, spacing, shadow, durations, easings, exactly
   as in the spec. No hex literals anywhere else in the codebase.
2. `components/Text.tsx` — variants: `ui`, `uiStrong`, `legal` (Lora), `record`
   (mono), `eyebrow`. Each variant sets font, size, line-height and picks the
   Devanagari face when locale is `hi`. **Minimum 15px enforced here.**
3. `haptics.ts` and `motion.ts` (durations, easings, `useReducedMotion`).
4. Primitives: `Button`, `Card`, `Badge`, `Chip`, `Input`, `Sheet`, `Toast`,
   `SkeletonCard`, `SectionRule`, `EmptyState`. Every pressable: scale to .972 over
   130ms and fire `haptics.light` on press-in.
5. Tab navigator with the 4 tabs, active `seal`, filled icon, 30px bottom inset.

Ship Phase 0 with a Storybook-ish screen that renders every primitive in both
languages. Compare it against `renders/02-design-system.png` and
`renders/00-logo-system.png` before continuing.

## Phase 1 — read-only skeleton with fixtures

Build Today, Matters list, Matter detail, Judgment detail from local fixtures
(lift the content from `LawMind Prototype.dc.html`'s logic — the case law in there
is real). No network. Verify against:

- `renders/04-today-briefing-ready.png`
- `renders/09-matter-detail.png`
- `renders/07-judgment-overruled.png`

## Phase 2 — the briefing

This is the product. Build `BriefingTakeover` exactly as in
`renders/05-briefing-takeover.png`: ink header, four numbered blocks, checklist
that writes optimistically and queues offline. Implement the arrival animation and
the seal stamp (420ms, seal spring, success haptic, once per briefing). The push
notification opens straight into it. Cache every briefing for 30 days; it must
open with the network off.

## Phase 3 — search

Query box → skeleton (1.25s shimmer loop, 55ms stagger) → results with staggered
entry → judgment detail (push 26px, medium haptic). Implement all four states:
results, loading, no results with a reason, AI unavailable. Verification badge
variant **D** unless the founder has chosen otherwise. See
`renders/06-search-results.png` and `renders/12-verification-badges.png`.

## Phase 4 — drafting

Type picker → per-type input form → streamed output. The document renders in Lora
on a sunken ground with the hatched AI-mark margin; citations stream in with their
verification state; the removal flow is two checkboxes plus a typed `REMOVE`,
logged. Hindi output uses Noto Serif Devanagari at 1.72 with citations left in
English. See `renders/08-draft-output.png`.

## Phase 5 — onboarding, account, offline

Magic-link sign-in, identity + enrolment (never blocking — "verification pending"
is a state to be proud of), language, optional first matter. Whole flow under two
minutes. Then the offline strip, the sync outbox indicator, profile, subscription
tiers (Starter ₹799 · Professional ₹1,999 · Expert ₹3,499 · Firm = contact us, no
buy button). See `renders/03-splash-signin.png`, `renders/10-onboarding.png`,
`renders/11-states-offline-ai-down.png`.

## Phase 6 — admin desk

Next.js, 13 sections per `LawMind Admin.dc.html`. Everything that looks like a
control must be one: kill switches, maintenance mode, feature-flag percentages,
model routing, budget caps, approve/reject, notify-affected. Every privileged
action writes to an append-only audit ledger with actor and before/after. See
`renders/13-admin-overview.png` through `renders/17-admin-citation-monitor.png`.

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
- [ ] Hindi: no clipped matras at any size; nothing below 15px.
- [ ] Reduce Motion on: no transforms anywhere, opacity only.
- [ ] Every tap target ≥ 44×44; every primary action reachable one-handed.
- [ ] Cold start to Today under 2s on a mid-range Android with cached data.

## Do not

- Do not introduce a second accent colour, and never make gilt a button.
- Do not add dark mode in v1.
- Do not replace the serif in legal text with a sans.
- Do not add a hamburger menu, a bottom sheet for navigation, or a carousel.
- Do not soften the AI-assisted mark to make documents look cleaner.
- Do not use spinners where a skeleton can hold the shape.
