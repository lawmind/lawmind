# LAWMIND — DESIGN SYSTEM

Feed this to Claude Design first. Every screen prompt assumes it.

## Direction: paper and ink, not dashboard

Lawmind is used in court corridors by people carrying physical files. The visual
language should read as a well-made legal instrument — authoritative, quiet,
unfashionable in the way a good court document is unfashionable. Not a fintech
dashboard, not a crypto product, not a Silicon Valley SaaS.

Reference feel: a clean printed judgment, a Moleskine, a barrister's brief.
Anti-reference: neon gradients, glassmorphism, dark-mode-by-default, anything
that looks like a trading app.

## Why this matters commercially
Our competitor SupremeToday.AI looks like 1996 software. Advocates tolerate it
because the data is good. If we look like a toy, senior advocates will not take
us seriously regardless of output quality. Credibility is a design requirement.

## Palette

| Token | Hex | Use |
|---|---|---|
| `ink` | `#141B2D` | Primary text, headers |
| `ink-muted` | `#5A6478` | Secondary text, metadata |
| `paper` | `#FBFAF7` | App background — warm off-white, not pure white |
| `paper-raised` | `#FFFFFF` | Cards, sheets |
| `rule` | `#E3E0D8` | Dividers, borders |
| `seal` | `#8B2E2E` | Single accent — deep court-seal red. Primary actions, active states |
| `seal-soft` | `#F5E9E9` | Accent background wash |
| `verified` | `#1F6F4A` | Verified citation badge, success |
| `caution` | `#B4690E` | Overruled badge, warnings, unverified enrolment |
| `danger` | `#A32D2D` | Errors, destructive |

Dark mode: v2. Advocates work in daylight. Do not spend S0 on it.

## Type

- UI: **Inter**. Sizes 13 / 15 / 17 / 20 / 24 / 32.
- Judgment and draft body: **Lora** (serif). Legal text in serif reads as
  authoritative and is what advocates are used to on paper.
- Hindi: **Noto Sans Devanagari** for UI, **Noto Serif Devanagari** for body.
  Devanagari needs ~1.6 line-height minimum — Latin spacing looks cramped and
  clips matras. This is a correctness issue, not taste.
- Minimum body size 15px. Many users are over 50 and reading in bad light.

## Spacing and shape
8px base scale. Corner radius 10px on cards, 8px on inputs, 6px on badges.
Never fully rounded pills except on status badges.

## Elevation
Almost none. One soft shadow on raised sheets only.
`0 1px 3px rgba(20,27,45,0.08)`. Depth is communicated by the rule colour, not
by shadow stacks.

## Motion
Restrained. 150–200ms ease-out. No bounce, no spring, no confetti.
The only place motion earns its keep is the briefing arriving.

## Touch and ergonomics
- Minimum target 44×44.
- Primary actions in the bottom third — one-handed use while holding a file.
- Tab bar, not a hamburger. Advocates are not exploring, they are doing one of
  four things.
- High contrast throughout: this is read in sunlight on a cheap Android screen.

## Iconography
Lucide, 1.5px stroke. No filled icons except active tab state.

## Non-negotiable UI rules
1. A citation always renders with its verification state visible. Never a bare
   case name.
2. An overruled judgment always shows the caution badge, in every surface.
3. Every AI-generated draft shows the "AI-assisted draft — verify before filing"
   mark until the advocate explicitly removes it.
4. Never a loading spinner alone on a search — show skeleton results so the
   screen keeps its shape.
