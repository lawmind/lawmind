# LAWMIND — DESIGN SYSTEM

Feed to Claude Design first. Every screen prompt assumes it.

> **Source of truth.** This file describes the designs in `design/screens/`.
> Where prose and pixels disagree, the pixels win — specifically
> `design/screens/renders/23-paper-system.png` for the system,
> `design/screens/IMPLEMENTATION.md` for the written rules, and the inline styles
> in `design/screens/LawMind Screens.dc.html`.
> Unresolved contradictions inside those sources are listed at the bottom under
> **Known contradictions** — they are not resolved here.

## Direction: paper and ink, not dashboard
Lawmind is used in court corridors by people carrying physical files. It should
read as a well-made legal instrument — authoritative, quiet, unfashionable in the
way a good court document is unfashionable. Not fintech, not crypto, not SaaS.

Reference feel: a clean printed judgment, a barrister's brief.
Anti-reference: neon gradients, dark-by-default, trading apps.
Glass is permitted, but only as floating chrome — see **Depth**.

## Why this matters commercially
SupremeToday.AI looks like 1996 software and advocates tolerate it because the
data is good. If we look like a toy, senior advocates will not take us seriously
regardless of output quality. Credibility is a design requirement.

## Palette — paper, ink and gilt

**There is no accent colour.** Ink carries every action; gilt carries authority.
Long-form serif on a dark ground is measurably harder to read, and reading
judgments is the app's core act — so paper is the ground.

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FBFAF7` | Page ground — warm off-white |
| `paper-raised` | `#FFFFFF` | Cards, opaque |
| `ink` | `#141B2D` | Primary text **and every primary action** |
| `ink-muted` | `#5A6478` | Secondary text, metadata |
| `rule` | `#E3E0D8` | All 1px borders resting; `ink` when focused |
| `gilt` | `#C9A227` | Authority only — verified ring, briefing seal, section rules, inline text actions |
| `gilt-on-ink` | `#E8C86A` | Solid button fill on an ink surface only |
| `gilt-wash` | `#FDF3DC` | Gilt-adjacent wash, hero shimmer at 8% |
| `verified` | `#1F6F4A` | Verified tick disc, ringed in gilt |
| `caution` | `#B4690E` | Partly set aside, AI mark, enrolment pending. Text on paper darkens to `#8A5109` |
| `danger` | `#9E2A33` | Set aside, validation errors, destructive |

`seal` `#8B2E2E` (brick) and `#5E1A2B` (oxblood) are **retired**. They must not
appear in the app. The admin canvas has not yet been migrated off oxblood — see
**Known contradictions**.

State colours are the only semantic colours. They render as a tinted paper card
with a 1px border at ~30% of the state colour — never a dark card:
verified wash `#EAF2ED` · caution wash `#FBF0DF` · danger wash `#F7E9EA`.

### The button rule depends on the surface underneath

| Surface | Primary action | Label |
|---|---|---|
| Paper (`#FBFAF7` / `#FFFFFF`) | solid `ink` `#141B2D` | `#FBFAF7` |
| Ink (briefing card, any dark hero) | solid `gilt-on-ink` `#E8C86A` | `#141B2D` |

Never a gilt button on paper. Never an ink button on ink.
**Text actions are gilt on both surfaces** — "Add to matter", "See what replaced
it", "Read holding" — findable at 13px where ink would sink into body copy.

### Gold — the rule
Gilt marks authority the app has established; it is not a generic action colour.
Four placements: the briefing seal · the verified tick ring · the record line on
ink headers (CNR, next hearing date) · the identity. Budget: Today 3 marks ·
briefing takeover 4 · one per verified citation · matters, settings and forms
**zero**.
Never: a gold button on paper, gold body text, gold on paper below 14px.

Dark mode: v2. Advocates work in daylight.

## Type
- UI: **Inter**. 13 / 15 / 17 / 20 / 24 / 32. Weights 400/500/600.
- Judgment and draft body: **Lora** (serif). Legal text in serif reads as
  authoritative and matches what advocates see on paper.
- Records — citations, CNR, timestamps, IDs: **JetBrains Mono** 11.5–13. Also the
  eyebrow label: `600 10px, letter-spacing .18em, uppercase`.
- Hindi: **Noto Sans Devanagari** UI, **Noto Serif Devanagari** body. Devanagari
  needs ≥1.6 line-height — use 1.65–1.72. Latin spacing clips matras.
  Correctness, not taste.
- Minimum body 15px. Many users are over 50, reading in bad light.

## Spacing and shape
8px base: 8 · 16 · 24 · 32 · 48 · 64. Radius 10px cards, 8px inputs and buttons,
6px badges, 16px sheets (top corners) and glass chrome. No full pills except
status.

## Elevation
Almost none. One shadow on raised cards: `0 1px 3px rgba(20,27,45,0.08)`.
Ink surfaces may use `0 6px 22px rgba(20,27,45,.22)`.
Depth comes from the rule colour, not shadow stacks.

## Depth — glass floats above paper
Glass is strictly **floating chrome**: nav bars, modals, toasts, sheets.
Recipe: ultraThin material + paper tint `#FBFAF7` + blur 24 / saturate 1.4, a 1px
gradient stroke from `rgba(201,162,39,.4)` top-leading to clear, radius 16.
**Content cards stay opaque** — a card behind a scrolling list must be legible at
every scroll position, which glass cannot guarantee.

## Motion
Motion is not optional; nothing cuts. Every animation answers where an element
came from, where it is going, and what it weighs.

Two curves only:
```
standard:    cubic-bezier(.2, .8, .3, 1)
seal spring: cubic-bezier(.2, 1.2, .3, 1)
```
Durations: 130 press · 180 fade · 260 push · 380 sheet. Nothing exceeds 420ms.

Three spring configs only:

| Name | Response | Damping | Use |
|---|---|---|---|
| default | 0.38 | 0.72 | Screen pushes, card entry |
| snappy | 0.25 | 0.80 | Press states, tab indicator, toggles |
| gentle | 0.50 | 0.78 | Layout changes, sheets |

- List entry staggers `index × 55ms`, capped at index 7.
- Every tappable scales to `0.965` with −3% brightness plus a `.light` haptic.
- Loading is a **shimmer**, never a spinner — 1.8s gradient sweep,
  `rgba(201,162,39,.04)` → `rgba(201,162,39,.12)`, siblings offset 200ms.
- Confirmation ritual: `.heavy` haptic, circle settles, checkmark draws with
  overshoot, gilt shimmer fades over 600ms.
- `matchedGeometryEffect` is mandatory for list → detail and the briefing seal.
- Haptics: light 8ms · medium 14ms · success · warning · selection. One haptic
  per gesture; never the only signal; none on scroll or incoming push.
- **Reduce Motion**: drop every transform, keep opacity. The seal still stamps,
  without scale. Shimmer becomes a static tint.

Full choreography table: `design/screens/IMPLEMENTATION.md` §3.

## Touch and ergonomics
Minimum target 44×44. Primary actions in the bottom third — one-handed while
holding a file. Tab bar (4 tabs), not a hamburger. High contrast: sunlight, cheap
Android.

## Iconography
Lucide, 1.5px stroke (1.6–1.7 in the tab bar). No filled icons except the active
tab.

## Non-negotiable UI rules
1. A citation always renders with its verification state visible. Never a bare
   case name, anywhere — search, briefing, draft, matter.
2. An unverified citation is shown honestly, never hidden and never dressed as
   confirmed.
3. Overruled always shows its caution state, on every surface. **Three states,
   not one:** `set_aside` (danger band, primary action disabled) ·
   `partly_set_aside` (caution band, adds with a note) · `doubted` (no band, one
   muted line). Binary is a correctness bug in Indian practice.
4. Every AI draft shows "AI-assisted draft — verify before filing" until the
   advocate removes it through two confirmations plus a typed `REMOVE`. Removal
   is logged.
5. OCR-extracted fields always show as pending confirmation before save.
6. Never a bare spinner on search — skeleton results keep the screen's shape.
7. Offline is a requirement, not an edge case. Cached matters, briefings and
   drafts stay readable and editable; writes queue.
8. When the AI is unavailable, say so plainly. Never serve a stale cached answer
   as fresh.
9. Nothing blocks on Bar Council enrolment — "verification pending" is a state,
   never a gate.

## Known contradictions — unresolved, do not silently pick
1. **`danger` hex.** `design/screens/IMPLEMENTATION.md` §2 palette says `#A32D2D`; its own state
   table and `design/screens/CLAUDE_CODE_BRIEF.md` say `#9E2A33`. The canvases contain `#9E2A33`
   29 times and `#A32D2D` zero times, so `#9E2A33` is used above.
2. **Token names in `design/screens/renders/23-paper-system.png`** invert their meaning:
   `obsidian` = `#FBFAF7` (the page ground) and `parchment` = `#141B2D` (text).
   The names above follow `design/screens/IMPLEMENTATION.md` §2 (`paper` / `ink`) instead.
   That render also introduces `elevated` `#EFEDE7`, which §2 does not define.
3. **Glass opacity.** `design/screens/IMPLEMENTATION.md` §2 says paper tint at 78%; render 23
   says 60%.
4. **Content card fill.** §2 says opaque `#FFFFFF`; render 23 says a
   `#141B2D → #fff` linear gradient at max 15% shift.
5. **Card border.** §2 says `rule` `#E3E0D8`; render 23 says a gilt-tinted 1px
   border at .18 alpha resting, .45 active.
6. **Gilt as CTA.** Render 23 labels the gilt swatch "CTA · active · key icons",
   which contradicts the gold rule ("never something you tap") in
   `design/screens/IMPLEMENTATION.md` §3b. The gold rule is followed above.
7. **`design/screens/IMPLEMENTATION.md` §3b is stale**: it still states "Seal red remains the
   only action colour", contradicting §2 ("no accent colour"). The component
   inventory in §4 likewise still specifies a `seal` token for the eyebrow,
   timeline dot, switch-on state and active tab.
8. **Obsidian leftovers.** §2 Motion still describes "a gilt fill sweep on an
   obsidian track" and an "obsidian base" parallax layer, from the dark-ground
   exploration (canvas turn `5a`–`5f`) that the paper renders superseded.
9. **`design/screens/CLAUDE_CODE_BRIEF.md` points Phase 0 at `design/screens/renders/02-design-system.png`,
   which is the retired oxblood system** (`seal #5E1A2B`). The current system
   render is `design/screens/renders/23-paper-system.png`.
