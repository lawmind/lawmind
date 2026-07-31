# LAWMIND — DESIGN SYSTEM

Feed to Claude Design first. Every screen prompt assumes it.

> **Source of truth.** This file describes the designs in `design/screens/`,
> reconciled 31 July 2026 against the refined bundle (`LawMind mobile app design`).
> The written rules live in `design/screens/IMPLEMENTATION.md`; the authoritative
> pixels are **renders 30–43**. Renders `00-29` are superseded v1/v2
> — their layout is often still valid, their colour and serif are not.
> Contradictions remaining inside those sources are listed at the bottom under
> **Known contradictions**; they are not resolved here.

## Direction: paper and ink, not dashboard
Lawmind is used in court corridors by people carrying physical files. It should
read as a well-made legal instrument — authoritative, quiet, unfashionable in the
way a good court document is unfashionable. Not fintech, not crypto, not SaaS.

Reference feel: a clean printed judgment, a barrister's brief, a bound reporter.
Anti-reference: neon gradients, glassmorphism, dark-by-default, trading apps.

## Why this matters commercially
SupremeToday.AI looks like 1996 software and advocates tolerate it because the
data is good. If we look like a toy, senior advocates will not take us seriously
regardless of output quality. Credibility is a design requirement.

## Palette — paper, ink, one accent

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FBFAF7` | Page ground, with tooth (see Material) |
| `paper-desk` | `#F2EFE8` | Ground behind a document sheet — draft view only |
| `card` | `#FFFFFF` | Card and sheet fill |
| `ink` | `#141B2D` | Primary text, secondary buttons, 1px section rules |
| `ink-muted` | `#5A6478` | Body secondary, supporting copy |
| `ink-faint` | `#8A8578` | Citations, dates, metadata, eyebrows |
| `rule` | `#DAD6CB` | Card edges, section divisions |
| `hairline` | `#E8E4DA` | Between list items |
| `oxblood` | `#5E1A2B` | **The only accent.** Primary action + one earned emphasis |

States — these three only:

| State | Hex | Notes |
|---|---|---|
| `verified` | `#1F6F4A` | Badge stroke and tick |
| `caution` | `#B4690E` | Stamp border; text darkens to `#8A5109` on paper; card wash `#FBF0DF` |
| `danger` | `#9E2A33` | Validation errors, destructive confirmation |

**The restraint rule.** Oxblood appears **at most twice per screen** — once for the
primary action, once where emphasis is genuinely earned. Three or more accent
moments is a defect, not a preference. Everything else is ink, ink-muted,
ink-faint and rule. Most emphasis should come from a rule or from space.

### Gilt — ornament only
`gilt` `#C9A227` is deliberately **not in the token table**: it never carries
information — never text, never a rule that must be read, never a state, never on
anything tappable. The test is one sentence: **remove the gilt entirely and check
whether anything became unknowable.** If yes, it was load-bearing and must be ink.

Three permitted placements: **1.** the briefing seal ring (ink card only) ·
**2.** the verified tick ring, 2px around a `#1F6F4A` disc — *only where a disc
badge is used, which is currently nowhere, since the shipped badge is a rectangle*
· **3.** identity (logo, splash, letterhead, admin sidebar mark).

Forbidden without exception: gilt text a user must read · a gilt rule dividing
content · a gilt button or gilt on any tappable surface · gilt on paper at body
size · gilt as a state, status or badge colour · a second accent beyond oxblood ·
the gavel recoloured to red.

**The record line is not a gilt placement.** It was, and it was wrong: a CNR and a
next-hearing date are the two things an advocate scans a header for, which makes
them load-bearing by definition. They render in ink, or `parchment` on an ink
header.

Budget: at most 2 gilt marks per screen; most screens have none. Matters,
settings, search input, drafting forms and every admin section have **zero**.

Dark mode: v2. Advocates work in daylight.

## Material — paper with tooth
Flat `#FBFAF7` read unfinished. The ground carries a two-layer stipple at ~2%:

```css
background-color: #FBFAF7;
background-image:
  radial-gradient(rgba(20,27,45,.022) .5px, transparent .5px),
  radial-gradient(rgba(20,27,45,.016) .5px, transparent .5px);
background-size: 3px 3px, 7px 7px;
background-position: 0 0, 2px 3px;
```

On native, tile a 1×-density noise PNG at the same effective opacity. The test: a
user must not be able to describe the texture, but a screenshot should feel
printed rather than rendered. It disappears under sunlight washout — correct.

## Type
**Source Serif 4** carries all legal content — judgments, holdings, drafts, case
names, briefing prose. It replaces **Lora**, which loses its terminals at 17px on
a mid-range screen outdoors. **Inter** for app chrome, **JetBrains Mono** for
citations, CNR/FIR numbers and eyebrows, **Noto Serif/Sans Devanagari** for Hindi.

| Role | Size / leading | Face |
|---|---|---|
| Case name, detail | 32 / 1.24 | Source Serif 4 500 |
| Card title, briefing subject | 23 / 1.32 | Source Serif 4 500 |
| Long-form document body | 18 / 1.7 | Source Serif 4 400 |
| Holding, card body | 17 / 1.68 | Source Serif 4 400 |
| Screen title | 28 / 1.16, −0.022em | Inter 600 |
| UI body **minimum** | 16 / 1.6 | Inter 400 |
| Metadata, citation | 11–12 | JetBrains Mono 400 |
| Section eyebrow | 10–11, 0.18em, upper | JetBrains Mono 600 |
| Devanagari body | 16–17 / 1.72 | Noto Serif Devanagari 400 |
| Devanagari UI | 15–16 / 1.7 | Noto Sans Devanagari 400 |

**Measure never exceeds 72 characters**, target 60–68. **Body minimum is 16px,
not 15.** Devanagari sits one point smaller than Latin with more leading — matched
by optical weight, not nominal size. Hindi eyebrows drop the letterspaced-uppercase
treatment; Devanagari has no case distinction and letterspacing breaks conjuncts.

## Spacing and shape
8px base. **Radii are 2px (3px maximum)** — soft corners were doing most of the
"startup toy" work, and a bound reporter has square corners. The only exceptions
are sheets (12px, top corners only) and genuinely circular elements.

**Buttons: 2px radius, 52px tall.** Primary = solid `oxblood`, white label.
Secondary = `card` fill with a 1px `ink` border. Tertiary = `card` fill with a 1px
`rule` border. Disabled = flat `rule`-toned fill, `ink-faint` label. One accent per
card: the action. Citation, date and verification line are all `ink-faint` — they
are reference, not emphasis.

## Depth — rules and edges, not shadows
**No shadows on cards.** Structure is carried by hairlines and by spacing, the way
it is on a printed page. Shadow appears only on genuinely floating cases — never on
a resting card, button or header. The only permitted blur is a sticky bar over
scrolling content: `rgba(251,250,247,.94)` + `blur(16px)`.

| Weight | Colour | Use |
|---|---|---|
| 1px | `#E8E4DA` | Between list items |
| 1px | `#DAD6CB` | Card edges, section divisions |
| 1px | `#141B2D` | Under a section heading; closing a masthead |
| 2px | `#5E1A2B` | One per screen, on the thing that matters |

## The verification badge — the registry stamp
The most important component in the product: it is what lets an advocate put a
citation into a document they file in court. Full build spec, including per-state
geometry and SVG paths, is `design/screens/IMPLEMENTATION.md` §Badge — do not
improvise any part of it.

Shared geometry, identical across all five states: rectangle, **radius 2px**,
**1.5px** border (never 1px — it must survive 2x on a low-DPI panel), padding
`3px 6px`, JetBrains Mono 600 label at 10px / 0.06em, 11px icon box, 20px tall at 1x.

| State | Border | Label | Colour |
|---|---|---|---|
| `verified_internal` | solid | `VERIFIED` | `#1F6F4A` |
| `verified_external` | solid | `VERIFIED` ⏐ `×2` | `#1F6F4A` |
| `verified_human` | solid | `VERIFIED` ⏐ `BY YOU` | `#1F6F4A` |
| `unverified` | **dashed** | `NOT CONFIRMED` | border `#8A8578`, label `#5A6478` |
| `overruled` | solid, **white fill** | `LAW MOVED` | `#B4690E` / text `#8A5109` |

These five are **visual state names, not stored values.** They are derived at
render time from three database fields — `verification_state` ·
`verified_by_source` · `overruled_status`. `LAW MOVED` is independent of the other
four: a judgment can be verified *and* overruled. Derivation table:
`docs/CITATION_HARNESS.md`.

The three verified states are **one family** — same border, colour, icon and
leading word; the only difference is a qualifier span after a hairline divider.
All five are distinguishable **with colour removed** (proof:
`design/screens/renders/43-badge-greyscale.png`) because they differ by *shape*:
solid edge · dashed edge · filled block. Shape is the only property that survives
sunlight washout, a dirty screen and colour-vision deficiency.

`unverified` is the state that matters most. It must never use red, an alert
triangle, or the word "failed" — those say *the product is broken*. Dashed neutral
ink says *open, nothing was impressed here*. `overruled` gets the amber card wash
in addition to the stamp; amber, never red — the case is real, the law has moved.

Contrast: `#1F6F4A` on white 5.31:1 · `#8A5109` on `#FBF0DF` 5.02:1 · `#5A6478` on
white 6.05:1 — all clear AA.

## Motion
Motion is not optional; nothing cuts. Two curves:

```
standard:    cubic-bezier(.2, .8, .3, 1)
seal spring: cubic-bezier(.2, 1.2, .3, 1)
```

Durations: 130 press · 180 fade · 260 push · 380 sheet. Nothing exceeds 420ms.
Three spring configs only — default (.38/.72) · snappy (.25/.80) · gentle (.50/.78).

- List entry staggers `index × 55ms`, capped at index 7.
- Every tappable scales to `0.965` with −3% brightness plus a `.light` haptic.
- Loading is a **shimmer**, never a spinner.
- Haptics: light 8ms · medium 14ms · success · warning · selection. One haptic per
  gesture; never the only signal; none on scroll or incoming push.
- **Reduce Motion**: drop every transform, keep opacity.

**Interruptibility** and a **performance floor** are specified in
`design/screens/IMPLEMENTATION.md` §Interruptibility and §Performance floor — the
target device is a mid-range Android, not a laptop.

## Touch and ergonomics
Minimum target 44×44. Primary actions in the bottom third — one-handed while
holding a file. Tab bar (4 tabs), not a hamburger. High contrast: sunlight, cheap
Android. **The sunlight test is a design gate, not a checkbox** — every component
is checked at contrast 0.5 / brightness 1.3
(`design/screens/renders/38-stress-sunlight@2x.png`).

## Iconography
Lucide, 1.5px stroke (1.6–1.7 in the tab bar). No filled icons except the active tab.

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
   is logged. The mark is a **header band**, not a diagonal watermark.
5. OCR-extracted fields always show as pending confirmation before save.
6. Never a bare spinner on search — skeleton results keep the screen's shape.
7. Offline is a requirement, not an edge case.
8. When the AI is unavailable, say so plainly. Never serve a stale cached answer.
9. Nothing blocks on Bar Council enrolment — "verification pending" is a state,
   never a gate.
10. **The admin consumes the same `tokens.ts` as the app.** No admin-only hex, no
    second palette, no second type scale. Density may differ; values may not.

## Known contradictions — unresolved, do not silently pick
0. **Does gilt still exist at all?** The authoritative system render
   `design/screens/renders/30-system-refined@2x.png` carries a struck-through
   swatch labelled **"no gold — struck — do not reintroduce"**, with no gilt value
   in the palette. But `design/screens/IMPLEMENTATION.md` §Colour keeps
   "gilt `#C9A227` as ornament only" and §Gilt specifies three permitted
   placements. The spec's own reading is that what was struck is gold *as
   load-bearing text and rules*, not gold as ornament — but the render states it
   flatly. **This is the single highest-value thing to settle**, because placement
   1 (the briefing seal ring) and placement 3 (identity/logo) are both still drawn.
1. **§9.1 is stale.** "Settled decisions" still says the badge is *variant D, a
   tick with a gilt ring* — but §Badge ships the **registry stamp** (a rectangle,
   no disc, no ring) and §4 says variants A–D are history, "do not build them".
2. **§9.2 is stale.** It still settles the briefing as *the full-screen dark
   takeover (`1g`)*, while §8b item 12 records "the dark briefing takeover is
   gone" and §5 maps the briefing to `8b`, calling `1g`/`1h` retired.
3. **`1aa` still does not exist.** §5 maps "Citation verification failed ·
   paywall/tiers" to canvas id `1aa`; the canvas has 60 options and none is `1aa`.
   Unchanged from the previous bundle.
4. **Gilt placement 2 is currently unreachable** — self-acknowledged in §Gilt:
   the shipped badge is a rectangle, so there is no disc to ring. Gilt in the app
   is placements 1 and 3 only.
5. **The admin desk still runs the v2 palette** (dark sidebar, oxblood accents)
   and does not yet match §Colour. §8a states aligning it is "a separate pass, not
   started" — so the admin renders are authoritative for **layout only**.
6. ~~Render numbering collides across versions.~~ **Resolved 31 July 2026.** The
   numbers 14 and 16 each meant two different things across bundle versions. The
   two superseded files were given a `v1-` prefix rather than renaming the current
   ones, so every reference in `design/screens/IMPLEMENTATION.md` still resolves.
   Retired *14-admin-enrolment-queue.png* is now
   `design/screens/renders/v1-14-admin-enrolment-queue.png`; retired
   *16-admin-llm-spend-routing.png* is now
   `design/screens/renders/v1-16-admin-llm-spend-routing.png`.
   Current files are unchanged: `design/screens/renders/14-admin-llm-spend.png`
   and `design/screens/renders/16-admin-enrolment-queue.png`.
