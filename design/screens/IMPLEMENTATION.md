# Lawmind — implementation spec

Everything a developer (or Claude Code) needs to build these screens. Read this
alongside the files listed at the bottom. Design intent lives in the HTML; this
document states the rules that must survive translation to React Native / Flutter
/ native.

---

## 0. What Lawmind is

A mobile app for practising advocates in India. Four things, in priority order:

1. **Briefing** — the night before every listed hearing, the advocate receives a
   dossier: last order, pending applications, authorities on the live issues
   (each with verification state), preparation checklist. Skimmable in 90
   seconds, fully readable offline. This is the wedge.
2. **Search** — plain-language questions over Indian case law; every result
   carries a verification badge, overruled judgments carry a caution.
3. **Matters** — a hearing timeline that accumulates value: orders, notes,
   drafts, past briefings. The retention moat.
4. **Drafting** — 10 document types, structured input, serif output with inline
   citation state and a removable "AI-assisted draft" mark.

Context that drives every design decision: used in court corridors, in daylight,
on cheap Android phones, one-handed, often by advocates over 50, roughly half in
Hindi. It must read as a legal instrument, not a startup dashboard.

---

## 1. Non-negotiable product rules

1. A citation **always** renders with its verification state visible. Never a
   bare case name, anywhere — search, briefing, draft, matter.
2. An overruled judgment **always** shows its caution state, on every surface.
   Three states, not one: `set_aside` · `partly_set_aside` · `doubted`.
3. Every AI-generated draft shows **"AI-assisted draft — verify before filing"**
   until the advocate removes it through a deliberate act (two checkboxes + typed
   `REMOVE`). Removal is logged server-side with timestamp and user id.
4. Search never shows a bare spinner. Skeleton cards that hold the final shape.
5. Offline is a requirement, not an edge case. Cached matters, briefings and
   drafts stay readable and editable; writes queue and sync.
6. When the AI is unavailable, say so plainly. Never serve a stale cached answer
   as if it were fresh.
7. Nothing blocks on Bar Council enrolment. It is captured, queued for manual
   review, and shown as "verification pending" — access is never withheld.

---

## 2. Design tokens

### Colour — paper, ink and gilt

Paper is the ground. The app's core act is reading legal prose — judgments,
orders and drafts set in serif at 17px — and long-form serif on a dark ground is
measurably harder to read. A legal tool that tires the eye is not premium.

There is **no accent colour.** Ink carries every action; gilt carries authority.

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FBFAF7` | Page ground |
| `paper-raised` | `#FFFFFF` | Cards, opaque |
| `ink` | `#141B2D` | Primary text **and every primary action** |
| `ink-muted` | `#5A6478` | Secondary text |
| `rule` | `#E3E0D8` | All 1px borders resting; `ink` when focused |
| `gilt` | `#C9A227` | Authority only — verified ring, briefing seal, section rules |
| `gilt-wash` | `#FDF3DC` | Gilt-adjacent wash, hero shimmer at 8% |
| `verified` | `#1F6F4A` | Verified tick disc, ringed in gilt |
| `caution` | `#B4690E` | Partly set aside |
| `danger` | `#A32D2D` | Set aside, errors |

**The button rule depends on the surface underneath:**

| Surface | Primary action | Label |
|---|---|---|
| Paper (`#FBFAF7` / `#FFFFFF`) | solid `ink` `#141B2D` | `#FBFAF7` |
| Ink (the briefing card, any dark hero) | solid `gilt` `#E8C86A` | `#141B2D` |

An ink button on an ink card disappears, and a paper button on an ink card reads
as a cancel. Gilt is legible, warm, and on an ink surface it is unmistakably the
thing to press — this is the one place a gilt fill is correct, because gilt there
is still marking the app's most valuable object rather than a generic action.
Never put a gilt button on paper.

**Text actions are gilt on both surfaces** — "Add to matter", "See what replaced
it", "Read holding". They need to be findable in a dense card without competing
with the case name, and gilt does that at 13px where ink would disappear into the
body copy. So the full rule is: gilt marks authority *and* carries inline text
actions; solid fills follow the surface (ink on paper, gilt on ink).

### State colours

| State | Hex | Where |
|---|---|---|
| verified / success | `#1F6F4A` | Verified tick disc (ringed in gilt), success confirmations, "filed" and "sent" states |
| caution / warning | `#B4690E` | Partly set aside, AI-assisted draft mark, enrolment pending, overdue work. Text on paper darkens to `#8A5109` for contrast. |
| danger / error | `#9E2A33` | Set aside, validation errors, destructive confirmations |

These three are the **only** semantic colours. They appear on paper cards with a
tinted wash (`#EAF2ED`, `#FBF0DF`, `#F7E9EA`) and a 1px border at ~30% of the
state colour — never as a dark card, which fails to read against a paper app.

### Depth — glass floats above paper

Glass is strictly floating chrome: nav bars, modals, toasts, sheets. Recipe:
`.ultraThinMaterial` + paper tint (`#FBFAF7` at 78%) + blur 24 saturate 1.4, a
1px stroke from `rgba(201,162,39,.4)` top-leading to clear, radius 16pt.
**Content cards stay opaque** — a card behind a scrolling list must be legible at
every scroll position, which glass cannot guarantee.

### Motion — motion as material

Every animation answers three questions: where did this element come from, where
is it going, and what does it weigh? Nothing cuts.

**Spring configs** — the only three permitted:

| Name | Response | Damping | Use |
|---|---|---|---|
| default | 0.38 | 0.72 | Screen pushes, card entry, most transitions |
| snappy | 0.25 | 0.80 | Press states, tab indicator, toggles |
| gentle | 0.50 | 0.78 | Layout changes, sheets, anything large |

**Staggered list entry** — each item animates opacity 0→1 and y-offset 18→0,
delayed by `index × 55ms`, **capped at index 7** so long lists never feel slow.

**Press micro-interaction** — every tappable surface scales to `0.965` with −3%
brightness on the snappy spring, paired with a `.light` haptic on press-down.
No element may feel dead on tap.

**Haptic choreography** — haptic and visual fire as a single event, never
independently:

| Event | Haptic | Visual |
|---|---|---|
| Press-down | `.light` | scale 0.965, −3% brightness |
| Confirm / submit | `.medium` | success animation, same frame |
| Error | double `.rigid`, 80ms apart | red tint pulse on the element |
| Completion ritual | `.heavy` | radial gilt shimmer expanding outward, fading over 600ms |

**The completion ritual** (Apple Pay's "done" is the benchmark): the circle
settles, the checkmark draws itself with a spring overshoot, then the whole
surface breathes out to resting. Use it for every high-stakes confirmation —
draft exported, notice sent, AI mark removed, matter filed.

**State-driven transitions** — the UI is a pure function of state:
- Status chips morph in place, crossfading text over 200ms. Never slide or pop.
- Progress states animate as a horizontal gilt fill sweep on an obsidian track.
- Numbers count up/down over 0.6s ease-out. They never jump.
- Loading is a **shimmer**, never a spinner: a 1.8s looping gradient sweep from
  `rgba(201,162,39,.04)` to `rgba(201,162,39,.12)`. Offset sibling skeletons by
  200ms so a list reads as one wave.

**Scroll depth and parallax** — obsidian base static · card layer 1× · floating
nav 0.3× (sticky drift before locking) · gilt glow 0.7× · cards exiting the top
compress toward `scale .97` (Apple Wallet stack).

**Card physicality** — long-press lifts the card (shadow radius springs 4→18,
opacity .15→.35, scale 1.02) · swipe actions rubber-band with 12pt overshoot,
snapping at response .3 / damping .65 · card stacks offset 8pt Y and scale 0.96×,
fanning open with springs 40ms apart · drag applies `rotation3DEffect` up to ±6°.

**Navigation** — push: incoming from `x: +30, opacity: 0`; outgoing scales to
`0.95` and fades. Never a slide wipe. Modals rise on the gentle spring with the
background blurring in over 300ms, and de-blurring proportionally on interactive
dismiss. Tab switches crossfade content over 250ms while the indicator slides on
the snappy spring. `matchedGeometryEffect` is **mandatory** for list → detail,
icon → expanded state, and the briefing seal wherever it travels.

**Ambient motion** — the app is alive when untouched, barely: hero gilt border
rotates on an 8s loop · live dots pulse scale 1→1.3→1 and opacity 1→.5→1 on a 2s
loop · empty-state illustrations float y 0→−6→0 over 4s. No autoplaying video, no
particles, nothing that competes with the task.

**Four states, always** — resting · pressed (scale .965, −3% brightness,
`.light`) · loading (shimmer or custom gilt spinner, never system
`ProgressView`) · done (ritual, then resting).

### Type

- **UI:** Inter — 13 / 15 / 17 / 20 / 24 / 32. Weights 400/500/600.
- **Legal body** (holdings, orders, drafts, judgment text): **Lora**. Serif reads
  as authoritative and matches paper.
- **Records** (citations, CNR, timestamps, IDs): **JetBrains Mono** at 11.5–13.
  Also used for the eyebrow labels (`600 10px, letter-spacing .18em, uppercase`).
- **Hindi:** Noto Sans Devanagari (UI) / Noto Serif Devanagari (body).
  **Line-height ≥ 1.6, use 1.65–1.72.** Latin spacing clips matras — this is a
  correctness bug, not a taste call.
- **Minimum body size 15px.** Never smaller, anywhere.

### Spacing, shape, elevation

- 8px base scale: 8 · 16 · 24 · 32 · 48 · 64.
- Radius: cards 10, inputs/buttons 8, badges 6, sheets 16 (top corners only),
  status pills 9999.
- One shadow only: `0 1px 3px rgba(20,27,45,.08)` on raised cards.
  Ink surfaces may use `0 6px 22px rgba(20,27,45,.22)`. Depth comes from `rule`,
  not shadow stacks.
- Touch targets ≥ 44×44. Primary actions in the bottom third of the screen.
- Tab bar (4 tabs), never a hamburger.

---

## 3. Motion system

Two curves. Nothing else.

```
standard:    cubic-bezier(.2, .8, .3, 1)     // everything
seal spring: cubic-bezier(.2, 1.2, .3, 1)    // briefing arrival, ticks, tab dip
```

Durations: **130** press · **180** fade · **260** push · **380** sheet.
Nothing exceeds 420ms.

| Moment | What moves | Duration | Curve | Haptic |
|---|---|---|---|---|
| App launch | Gavel strikes once, block settles, wordmark tracks in | 900ms cap | seal spring | — |
| Briefing arrives | Card scales from .94, gilt ring expands + fades, gilt sweep once | 420ms | seal spring | success |
| Open briefing | Takeover rises 40px, ink header settles, body fades | 380ms | standard | heavy impact |
| Result → judgment | Push from right 26px, outgoing list dips 4% opacity | 260ms | standard | medium |
| Search running | Skeleton shimmer L→R, 55ms stagger, shape never changes | 1.25s loop | linear | — |
| Results land | Cards fade up 10px, 55ms apart, verified stamp last | 380ms | standard | light (first card) |
| Checklist tick | Box pops to 1.16 then settles, label greys + strikes | 300ms | seal spring | medium (tick) / light (untick) |
| Button press | Scale .972, shadow contracts — press is felt, not release | 130ms | standard | light |
| Tab change | Icon dips to .9 and fills, label weight steps up | 130ms | seal spring | selection |
| Draft generating | Ring spins 800ms; document assembles per streamed paragraph | stream | linear | light per paragraph |
| AI mark removed | Hatched margin wipes left, footer stamp fades to audit line | 260ms | standard | warning |
| Went offline | Amber strip slides from under status bar, pushes content 40px | 180ms | standard | warning (once) |

**`prefers-reduced-motion` / "Reduce Motion":** drop every transform, keep
opacity. The seal still stamps, without scale. Shimmer becomes a static tint.

### Haptics

| Name | Android pattern | iOS |
|---|---|---|
| light (8ms) | `vibrate(8)` | `UIImpactFeedbackGenerator(.light)` |
| medium (14ms) | `vibrate(14)` | `UIImpactFeedbackGenerator(.medium)` |
| success | `vibrate([0,10,40,18])` | `UINotificationFeedbackGenerator(.success)` |
| warning | `vibrate([0,30,60,30])` | `UINotificationFeedbackGenerator(.warning)` |
| selection | `vibrate(8)` | `UISelectionFeedbackGenerator` |

Rules: respect the system haptics setting; never use haptics as the only signal
for a state change; never fire more than one haptic per gesture; no haptics on
scroll, on incoming pushes, or during the nightly briefing generation.

---

## 3b. Identity and animation assets

The logo is **your Lottie file, used directly** — no redrawn approximation exists
anywhere in the designs.

| Asset | File | Use |
|---|---|---|
| Gavel mark, animated | `assets/lawmind-gavel.json` | Splash (once, ≤900ms), pull-to-refresh, "briefing being prepared" |
| Gavel mark, static | same file at `frame="34"` | App icon, tab bar, admin sidebar, PDF letterhead |
| Static SVG export | `assets/lawmind-mark.svg` | Anywhere a Lottie runtime is unavailable |
| AI mark, animated | `assets/lawmind-ai.json` | Search running (32px inline), draft generating (120px centred), admin corpus/routing work |
| Player | `lottie-mark.js` | `<lottie-mark src loop autoplay frame tint duotone speed>` |

Static placements render the **last frame of the animation file**, so the icon and
the animation can never drift apart. `tint` + `duotone` retints every fill,
stroke and gradient stop while preserving relative luminance — that is how the AI
animation becomes seal-red, gilt or ink without a second export. The player honours
`prefers-reduced-motion` by rendering a still frame.

### Gold — the rule

**Gilt marks authority the app has established. It is never something you tap.**
Seal red remains the only action colour. Four placements, roughly one per screen:

1. **The briefing seal** — gilt ring stamps once on arrival, gilt eyebrow, gilt
   hairline on the CTA inside the ink card.
2. **The verified tick** — green tick with a 2px gilt ring. The ring is what makes
   a verified citation read as *certified* rather than merely checked.
3. **The record line** — on ink headers only, the CNR and the next hearing date
   sit in gilt. Gold doing wayfinding, not ornament.
4. **The identity** — splash, sign-in, tab-bar mark, letterhead, admin sidebar.

Budget: Today 3 marks · briefing takeover 4 · results and drafts 1 per verified
citation · matters, settings and forms **zero**. Most screens have none, which is
what makes the briefing feel like an occasion.

Never: a gold button, gold body text, gold on paper at any size below 14px, or the
gavel recoloured to red.

## 4. Component inventory

Build these once; every screen is composed of them.

- **Eyebrow** — mono 10px, `.18em`, uppercase, `seal` or `ink-muted`.
- **SectionRule** — eyebrow + 1px `rule` filling remaining width.
- **JudgmentCard** — citation (mono) + court/date, title in Lora 19/1.32,
  two-sentence holding, footer strip with verification badge + one action.
  Optional caution header band (`caution-soft`, `caution-text`).
- **VerificationBadge** — **variant D, settled.** A 17px green disc with a white
  tick and a 2px gilt ring (`box-shadow: 0 0 0 2px rgba(232,200,106,.6)`), set
  inline immediately before the citation string in mono. Because it binds to the
  citation and not the card, it survives being quoted inside a draft, a briefing,
  a result list and a copied citation. Card footers carry only the plain line
  "Verified against the reported record" plus the action — never a second badge.
  Variants A–C are recorded in `1k` as exploration only; do not build them.
- **CautionBanner** — full-bleed band, white text, **replaces** the header (it does
  not sit above it). `danger` for `set_aside`, `caution` for `partly_set_aside`,
  and **absent** for `doubted`. Carries the replacing or referring judgment as an
  inline action.
- **BriefingCard** — ink surface, gilt seal + ring, three-chip summary, single
  primary CTA, "saved for offline" line.
- **BriefingTakeover** — ink header (case, citation, when/before/item) + paper
  body in four numbered blocks: 01 where the matter stands · 02 pending before
  the court · 03 authorities on the live issue · 04 before you go in (checklist).
- **HearingRow / DayGroup** — day column (44px) + one card per listing.
- **MatterCard** — next-date pill, CNR (mono), title in Lora, court/client,
  chip row (briefing ready · N drafts · N events).
- **TimelineEvent** — 9px dot on a 1.5px rail; current event uses a 13px `seal`
  dot with a paper ring. Order text renders in Lora italic inside a quote card.
- **DraftPage** — `paper-sunken` ground, white page, 26px hatched margin carrying
  the AI mark, Lora 15/1.75 body, inline citation chips (verified = green
  underline + tick; unverified = dotted grey + info dot).
- **AIMarkBar** — sticky footer: "N of M citations verified" + Review mark.
- **SkeletonCard** — mirrors JudgmentCard's exact geometry including footer strip.
- **Switch** — one geometry, used on every screen and in the admin desk. Track
  `46×28` (radius 9999), inset `3px`, knob `22×22` white with
  `box-shadow: 0 1px 3px rgba(20,27,45,.28), 0 0 0 .5px rgba(20,27,45,.06)`.
  The knob is **absolutely positioned** at `top:50%; left:inset` and moved with
  `transform: translate3d(travel,-50%,0)` — never by switching `justify-content`,
  which cannot animate and drifts off centre. Track colour animates over 180ms,
  knob over 200ms, both on the standard curve. On = `seal` in the app,
  `verified` green in admin kill switches; off = `#D9D5CB` (or `danger` when off
  means a service is down). Optional `ON`/`OFF` mono label sits inside the track
  at 8.5px; a `LIVE`/`OFF` label may sit outside in a fixed `34px` right-aligned
  column.
- **SettingsRow** — `min-height:60px`, label block `flex:1; min-width:0`, and a
  **fixed-width control column** (`max(switchWidth, 62px)`, `justify-content:
  flex-end`). Every control — switch, value text, chevron — therefore terminates
  on one right-hand axis regardless of type, and rows with and without a subtitle
  keep the same optical centre. This is the fix for the misaligned toggles.
- **TabBar** — 4 tabs, active = `seal` + filled icon (`seal-soft` fill), 30px
  bottom padding for the home indicator.
- **Toast** — ink pill, 10px radius, bottom 104px, 2.4s, one line max.
- **EmptyState** — icon circle, 19–20px title, one paragraph, then **actions that
  name the next thing to do**. Never "nothing here".

Icons: Lucide, 1.5px stroke (1.6–1.7 in tab bar). No filled icons except the
active tab.

---

## 5. Screen inventory → file map

All 28 screens from `SCREENS.md` are drawn. Option ids are the badges on the
canvas (`LawMind Screens.dc.html`).

| # | Screen | Where |
|---|---|---|
| — | Design system reference | `1a` |
| — | Logo, app icons, gilt palette | `2a` |
| — | Motion + haptics spec | `2c` |
| 1–2 | Splash / sign-in · magic link sent | `2b` (current), `1w` |
| 3–5 | Identity + enrolment · language · first matter | `1x` |
| 6 | Today — 3 directions (week-grouped, briefing-ready, editorial) | `1b` `1c` `1d` |
| 6 | Today — no hearings this week · first run | `1e` |
| 7 | Search input, filters, language toggle | `1i` |
| 10 | Search results (5 judgments, one overruled) | `1j` |
| 10 | Verification badge variants A–D | `1k` |
| 10 | Skeleton · no results · Hindi results | `1l` |
| 11 | Judgment detail · partly set aside | `1m` `1n` |
| 11 | Overruled: set_aside · doubted · all three compared | `3e` |
| 15 | Briefing takeover · memo alternative | `1g` `1h` |
| 16 | Briefing push notification (lock screen) | `1f` |
| 17 | Document type picker | `1o` |
| 18 | Draft input form | `1p` |
| 19 | Draft output · AI-mark alternatives · Hindi output | `1q` `1r` `1s` |
| 8 | Matters list | `1t` |
| 12 | Matter detail (timeline) | `1u` |
| 13–14 | Add matter (CNR + manual) · add event sheet | `1v` |
| 20–22 | Profile · settings | `1y` |
| 23 | Empty states | `1e`, `1l`, `1z` |
| 24 | Offline | `1z` |
| 25 | AI unavailable | `1z` |
| — | Citation verification failed · paywall/tiers | `1aa` |
| 26–28 | Admin (dashboard, citation monitor, user management) | `LawMind Admin.dc.html` |

Working prototype of the four core flows: `LawMind Prototype.dc.html`.

---

## 6. Data model (minimum viable)

```ts
Advocate      { id, name, phone, email, enrolmentNumber?, barCouncilState?,
                enrolmentStatus: 'none'|'pending'|'verified'|'rejected',
                language: 'en'|'hi', plan, createdAt }

Matter        { id, advocateId, title, cnr?, court, courtRoom?, judge?,
                clientName, category, stage, nextHearingAt?, nextPurpose?,
                source: 'cnr'|'manual', createdAt }

MatterEvent   { id, matterId, date, kind: 'listing'|'order'|'filing'|'note'|'document',
                outcome?: 'adjourned'|'allowed'|'dismissed'|'part_heard'|'not_taken_up',
                orderText?, note?, nextDate?, attachments[] }

Application   { id, matterId, title, filedOn, status: 'listed'|'awaiting'|'disposed' }

Judgment      { id, title, citations[], neutralCitation?, court, decidedOn, bench,
                holding, operativeParas[], fullText,
                verification: { state: 'verified'|'unverified'|'failed', checkedAt,
                                checks: {nameFound, volumePage, propositionFound} },
                overruled?: { state: 'set_aside'|'partly_set_aside'|'doubted',
                              paras[], byJudgmentId, note } }

Briefing      { id, matterId, hearingAt, generatedAt, readAt?,
                lastOrder, posture, pendingApplications[], authorities[],
                checklist: [{id, label, done, doneAt}], offlineCachedAt }

Draft         { id, matterId?, type, language, inputs{}, body,
                citations: [{judgmentId, verification}],
                aiMark: { present: boolean, removedAt?, removedBy? },
                exportedAt?, filedAt? }

Subscription  { advocateId, tier: 'starter'|'professional'|'expert'|'firm',
                renewsAt, usage: { searches, drafts } }
```

Client cache: matters, events, briefings, drafts are **local-first** (SQLite /
Room / Core Data). Writes go to an outbox queue with idempotency keys and sync on
connectivity. Search and generation are online-only and must fail loudly.

---

## 7. Backend surface the app expects

```
POST /auth/magic-link            { email }
POST /auth/verify                { token } -> session
GET  /me                         -> advocate + subscription + usage
PATCH /me                        { name, phone, enrolmentNumber, language }

GET  /matters                    ?status=active
POST /matters                    (manual) | POST /matters/cnr { cnr }
GET  /matters/:id                -> matter + events + applications + briefings
POST /matters/:id/events         { outcome, orderText, note, nextDate, purpose }

GET  /briefings/next             -> briefing for the next listed hearing
GET  /briefings/:id              -> full briefing (cacheable, ETag)
POST /briefings/:id/checklist     { itemId, done }   // idempotent, offline-queued
POST /briefings/:id/read

POST /search                     { q, lang, filters } -> results[] with verification
GET  /judgments/:id              -> judgment + overruled graph

POST /drafts                     { type, lang, matterId, inputs } -> streamed body
PATCH /drafts/:id                { body }
POST /drafts/:id/clear-ai-mark   { confirmations[], typed:"REMOVE" } // audited
POST /drafts/:id/export          { format: 'pdf'|'docx' }

GET  /subscription/plans
POST /subscription/checkout      { tier }
```

Every response carrying a citation must include its verification object. A
citation with no verification object is a bug — the client renders "not verified"
and reports it.

---

## 8. Admin desk (web, desktop)

`LawMind Admin.dc.html` — 1440px, ink sidebar with the gilt mark, 13 sections,
all interactive in the prototype:

1. **Overview** — KPIs, 14-day product health, "needs a human today", live activity.
2. **Enrolment queue** — list + detail with corroborating signals; approve /
   request document / reject; decision log. Rejection never removes access.
3. **Advocates** — filterable table: enrolment state, plan, matters, searches, last seen.
4. **Briefings** — nightly run table, failure retry, and per-block composition
   toggles (last order · pending · authorities · checklist) for incident containment.
5. **Citation monitor** — failure rate vs 2.5% threshold, failing queries with
   cause, and **notify affected advocates** for citations already exported.
6. **Corpus & ingestion** — sources with sync lag and health, coverage by court,
   full reindex trigger.
7. **LLM spend & routing** — cost by day/feature/model, live model routing per
   feature (applies in 60s, no deploy), budget caps and throttles.
8. **Subscriptions** — plans and prices, coupons with kill toggles, payments.
9. **Support inbox** — tickets with the advocate's context auto-attached, quick
   remedies (grant searches, escalate).
10. **Push campaigns** — audience picker, composer, lock-screen preview, history.
11. **Platform controls** — maintenance mode, 5 kill switches, feature flags with
    percentage rollout.
12. **Staff & audit** — roles/permissions and an append-only audit ledger.
13. **Analytics** — cohort retention grid, feature usage, and the activation
    metric that predicts retention (two briefings opened in week one).

Every privileged action writes to the audit ledger with actor, time and before/after.

---

## 9. Decisions — settled, do not reopen

All eight were called on 30 July 2026. Reasoning recorded so sprint three does not
relitigate them. Governing principle: **a premium tool does fewer things, states
them plainly, and never hedges.** Where a call could go either way, the option
with less surface area won.

1. **Verification badge — variant D.** The tick binds to the citation string, not
   the card, with a gilt ring. It survives being quoted inside a draft, a briefing
   and a copied citation. Variant C (loud header strip) is dropped entirely — a
   first-run-only treatment is maintained forever for a week of benefit.
2. **Briefing — the full-screen takeover (1g).** The only screen in the app that
   changes colour, which is why arriving at it feels like an event. The memo
   variant's dropped cap and "the one point to win" block are folded into block 01.
3. **Overruled — three states, from day one.** All three are drawn in `3e`.
   - `set_aside` — **danger red** band replaces the header, title struck through,
     holding drops to muted ink, a replacement judgment is mandatory, and the
     primary action is **disabled**: the only case where Lawmind refuses to let an
     authority be added to a matter.
   - `partly_set_aside` — **caution amber** band naming the affected paragraphs,
     those paragraphs struck through in the text, "what still stands" stated first.
     Adds to a matter with the caution note attached (`1n`).
   - `doubted` — **no band at all.** One muted line under the title plus an
     explanatory block below the holding. Still binding, primary action enabled.
   All three are legible from a result list without opening the judgment, and the
   same three treatments carry into briefing authority cards and draft citation
   chips. Binary is a correctness bug in Indian practice.
4. **Today with no hearings — no task model.** Derive the single most pressing
   obligation from the matter timeline (a filing due before a listed date, a reply
   not started) and surface it as one sentence with one action. No to-do entity;
   advocates already keep a diary.
5. **Briefing checklist — never becomes timeline events.** Ticks live on the
   briefing and sync offline. The matter timeline records what the *court* did;
   polluting it would make the one authoritative surface untrustworthy. The matter
   header shows "3 of 4 prepared" and nothing else.
6. **Hindi drafts — citations stay in English,** because that is how they must
   appear when filed. One explanatory line under the language toggle, shown once.
   No transliteration, no dual rendering.
7. **Paywall — never blocks on a hearing day.** On a day with a listed hearing the
   search limit becomes advisory rather than hard. The limit is still displayed.
   An advocate blocked mid-preparation churns and tells the bar.
8. **Notes vs court record — two weights.** Record renders in Lora on a quote card;
   private notes render in Inter, indented, muted, prefixed "Your note". Under a
   firm plan the record is shared and notes are not, by default, with no setting.

## 10. Files

```
LawMind Screens.dc.html      All 28 screens + variants, annotated (review canvas)
lottie-mark.js               <lottie-mark> player: tint, duotone, static frame, reduced-motion
assets/lawmind-gavel.json    Your logo animation (used for the mark, animated and static)
assets/lawmind-ai.json       Your AI animation (thinking states)
assets/lawmind-mark.svg      Static mark exported from the same paths
LawMind Prototype.dc.html    Tappable flow: Today → briefing → search → judgment → draft
LawMind Admin.dc.html        Admin desk, 13 sections, interactive
ios-frame.jsx                Device bezel used by the canvas and prototype
renders/                     Golden PNGs (2x) of every key screen
IMPLEMENTATION.md            This file
CLAUDE_CODE_BRIEF.md         Paste-ready build instructions for Claude Code
uploads/                     Original brief: DESIGN_SYSTEM.md, SCREENS.md, prompts, logo
```

Open the `.dc.html` files in any browser. The prototype needs no build step.
