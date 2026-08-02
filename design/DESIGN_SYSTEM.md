# LAWMIND — DESIGN SYSTEM

Feed to Claude Design first. Every screen prompt assumes it.

> **Source of truth.** This file describes the designs in `design/screens/`,
> reconciled **2 August 2026** against the Turn 13 bundle (`lmfinal.zip`) — the
> silence corrections (renders 33 and 34 re-rendered), pricing and tiers (§9g) and
> the last three library screens. It carries Turn 12 (`bail.zip`) before it: the
> silence pass (§9c), the daily loop (§9d), the launch assets (§9e).
> The written rules live in `design/screens/IMPLEMENTATION.md`; the authoritative
> pixels are **renders 30–77**. Renders `00-29` are superseded v1/v2 — their
> layout is often still valid, their colour and serif are not.
> Per-screen inventory: `design/screens/SCREENS.md` (**119 rows**: 98 app, 18 admin
> sections, 3 launch assets).
> Product decisions **PD-1…PD-14**: `PRODUCT_DECISIONS.md`, settled.
>
> Where this file and `design/screens/IMPLEMENTATION.md` disagree, the newer
> **render** governs — that is how the gilt and glass rules below were settled.
> Remaining contradictions are listed at the bottom and are not resolved here.

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
| `verified` | `#1F6F4A` | **Renders nowhere in the app** — verified is silent. Retained for the admin citation monitor and the on-tap detail |
| `caution` | `#B4690E` | Stamp border; text darkens to `#8A5109` on paper; card wash `#FBF0DF` |
| `danger` | `#9E2A33` | Validation errors, destructive confirmation |

**The restraint rule.** Oxblood appears **at most twice per screen** — once for the
primary action, once where emphasis is genuinely earned. Three or more accent
moments is a defect, not a preference. Everything else is ink, ink-muted,
ink-faint and rule. Most emphasis should come from a rule or from space.

### Gilt — ornament, two placements
`gilt` `#C9A227` is deliberately **not in the token table**: it never carries
information — never text, never a rule that must be read, never a state, never on
anything tappable. The test is one sentence: **remove all the gilt from a screen
and ask whether anything became unknowable.** If yes, it was load-bearing and must
be ink.

**Settled at two placements** (`design/screens/renders/55-gilt-two-placements@2x.png`):

| # | Placement | Exact use |
|---|---|---|
| 1 | **The briefing seal ring** | Today card, briefing masthead, lock-screen notification, offline saved card. Four instances, one meaning |
| 2 | **Identity marks** | App icon, splash, letterhead on an exported PDF, admin sidebar mark. Nothing else |

The gilt ring is the app icon's only distinguishing feature at 60pt, and the only
thing separating the tile from a dark home screen.

**Forbidden, without exception:** gilt text a user must read, at any size · a gilt
rule that divides content · a gilt button, or gilt on anything tappable · **CNR or
next-hearing date in gilt** — load-bearing, renders in ink · gilt on paper at body
size · gilt as a state, status or badge colour · a gilt spinner, progress fill or
shimmer tint · a rotating or continuously animated gilt border · **the verified
tick ring — retired, the stamp has no disc** · a second accent beyond oxblood ·
the gavel recoloured to red.

**The record line is not a gilt placement.** It was, and it was wrong: a CNR and a
next-hearing date are the two things an advocate scans a header for, which makes
them load-bearing by definition. They render in ink, or `parchment` on an ink
header. Gilt there only made a critical value the first thing to wash out in
sunlight.

**Budget — one is the maximum on any screen.**

| Screen | Marks |
|---|---|
| Today, briefing waiting | 1 |
| Briefing masthead | 1 |
| Splash · sign-in | 1 |
| Search · matters · drafts · settings · forms | 0 |
| Every admin section | 0 |

Most screens have none. The gilt hairline on glass chrome is a **glass**
placement, not a gilt one, and does not count against this budget.

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

## Micro-typography — six rules, enforced in code
Individually invisible; together they are most of the distance between competent
and beautiful. Extracted from
`design/screens/renders/53-micro-typography@2x.png`, which shows the same content
at the same sizes, before and after.

| # | Rule | Implementation |
|---|---|---|
| 1 | **Hanging punctuation** | An opening quote sits outside the measure via `text-indent: -.4em`, so the text edge is true. Otherwise the first line is visibly pushed in |
| 2 | **Optical baseline alignment** | Mono citation nudged **+1px** against a serif title — mono x-height sits higher than serif caps, so a shared baseline reads as misaligned |
| 3 | **Tabular figures** | On every date, time and citation number. Proportional figures make a column of dates jitter as digits change |
| 4 | **Widow control** | `text-wrap: pretty` **plus** a hard `&nbsp;` binding the last two words. Neither alone is sufficient |
| 5 | **Correct dashes** | En dash in a citation range; hair-spaced em dash in prose. Never a hyphen for either |
| 6 | **Typographic quotes and apostrophes** | Curly throughout — `husband's`, not `husband's` |

Plus **non-breaking spaces after "section", "Procedure," and inside "Penal Code"**
— a section number must never orphan from its section.

### Devanagari and Latin on one line
Appears on every Hindi screen, because citations stay in English (PD-12, §9.6).
Nominal size matching is wrong: Source Serif's x-height is larger relative to
Devanagari's baseline, so a Latin run at the same size reads heavier and sits high.

**Optical weight match:** the Latin run drops to **15px**, rises **0.5px**, and
takes **+0.004em** tracking. Devanagari quotes use the curly form `'…'`, not the
straight one.

### Enforced in code, not per screen
All six live in the `Text` wrapper and **one `legalText()` formatter** — never in
screen code. The formatter is the only place that touches judgment strings: it
converts straight quotes and apostrophes, replaces hyphens between citation years
with en dashes, binds section numbers and the final two words with non-breaking
spaces, and applies hanging punctuation to any string starting with a quote.

**A screen that hand-types a curly quote is a defect.** Corpus text arrives
straight and must be transformed once, predictably.

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
a resting card, button or header.

## Glass — chrome floats, content stays legible
That boundary is the whole rule, and here it is stricter than Apple's: a draft goes
to court and a judgment is read in sunlight.

```
background: rgba(251,250,247,.94);   /* paper tint at 94% */
backdrop-filter: blur(16px);          /* sheets: blur(24px) */
box-shadow: inset 0 1px 0 rgba(201,162,39,.28);   /* bottom bar  */
box-shadow: inset 1px 1px 0 rgba(201,162,39,.28); /* sheet       */
```

The hairline is on the **leading edge only**, so it catches light on one edge like
a real bevel. It is a **glass** placement, not a gilt placement.

**The tint is 94%, not 70%.** At 30% screen brightness a heavier glass collapses
into the list beneath it and chrome stops reading as chrome.

| Glass goes here | Glass never touches content |
|---|---|
| Tab bar · nav bar and sticky headers · bottom sheets and modals · toasts · a search field that floats over results · any toolbar over scrolling content | Not behind judgment text · not behind a draft · not behind a citation, a badge, a holding or an order quote · not behind a matter card |

Content is **fully opaque on paper, always.** A draft is filed in court; a judgment
is read in sunlight. **Translucency behind either is a correctness failure, not a
taste one.**

Behaviour: a card passing beneath chrome is softened, never obscured. A sheet
blurs its background **proportionally to the drag** and de-blurs on interruptible
dismissal — the sheet is chrome, the judgment underneath is content and stays
opaque. **The toast is the one ink glass in the product**, because it must read
against paper cards.

| Weight | Colour | Use |
|---|---|---|
| 1px | `#E8E4DA` | Between list items |
| 1px | `#DAD6CB` | Card edges, section divisions |
| 1px | `#141B2D` | Under a section heading; closing a masthead |
| 2px | `#5E1A2B` | One per screen, on the thing that matters |

## The verification mark — verified is silent, the exception is loud

**Revised 2 Aug 2026 for the silence pass** (`design/screens/IMPLEMENTATION.md`
§9c). The five-badge system and the per-result registry stamp are both retired
from the UI. **The data model, the three tiers and every zero-threshold metric
are unchanged** — this is a rendering and copy decision only. See
`docs/CITATION_HARNESS.md` §Rendering.

**Verification is the expected state. Decorating it is noise, and decorating it on
every result is what made these screens read as defensive about the one thing the
product is supposed to be confident about.** On a five-result list this is zero
marks instead of five. Verification did not become less important — it became the
floor, and a product that decorates its floor has nothing left to say when the
floor gives way.

### What renders — two states, and only two

| Condition | Renders |
|---|---|
| `verification_state = verified` · **any** `verified_by_source` | **nothing at all.** No badge, chip, tick, ring or colour |
| `verification_state = unverified` **or** `failed` | **dashed ink card** — 1.5px dashed `#8A8578`, headline *"Do not file this without checking it"*, with the reason and the eCourts route inside the card |
| `overruled_status != none` | **amber card** — `#FBF0DF` wash, `rgba(180,105,14,.35)` border, headline naming the affected paragraphs |

**`failed` renders identically to `unverified`.** The advocate cannot act on the
difference, and a provider outage must never read as a gap in the corpus. The
distinction is real in the data and is preserved there; it is not a distinction
the UI has any way to make useful.

**A card, not a chip.** The unverified state was a 20px stamp; it is now a card
that owns its own space. With verified silent, a mark's *presence* is the entire
signal, so the exception gets the whole room rather than competing with four
decorations of the ordinary.

### Copy — this is licence protection, not an audit

The Supreme Court now treats an unverified citation as a matter of professional
conduct and High Courts have made cost orders. **The app is not checking on a
professional; it is standing between them and a cost order.** Every line is
written from that position.

| Retired | Ships |
|---|---|
| We verified this citation | **Safe to file** |
| Verification failed | **We could not confirm this exists** |
| Not confirmed | **Do not file this without checking it** |
| 3 of 4 citations verified | **One citation could put you at risk** |

The unverified state reads as *we are telling you before the court does*. Never as
our failure, and never as an accusation. It must never use red, an alert triangle,
or the word "failed" — those say *the product is broken*. Dashed neutral ink says
*open, nothing was impressed here*.

### Where verification stays visible — three places

All three are the user asking rather than the product telling:

1. **Draft footer**, in-app only. Clean: *"All 4 citations safe to file"*. With a
   risk: the footer grows a dashed ink card naming it, and export drops to
   secondary reading *"Export anyway"*. **Never blocked.**
2. **On tap** — a sheet opening with *"Safe to file"*, then the sources checked
   and when each was checked, closing with the nightly re-check promise.
3. **Admin citation monitor** — unchanged.

**`verified_by_source` appears only in 2 and 3.** It never qualifies a badge,
because there is no badge to qualify.

### Amber is reserved

**Caution `#B4690E` means exactly one thing: the law has moved.** It does not
appear on drafts, on OCR, on privacy notices, or on anything expressing our own
confidence. When an advocate sees amber it is about the law, not about us.

Anything expressing *our* uncertainty is **neutral ink with a dashed edge**. That
rule is what keeps the two states distinguishable at a glance, and it is a
correctness rule rather than a palette preference.

### What is unchanged

**Silence never means removal.** An unverified citation is always shown and always
marked. Silent-drop rate stays at 0.0%.

What renders is **derived at render time, never stored** — from
`verification_state` · `verified_by_source` · `overruled_status`. `LAW MOVED` is
independent of verification: a judgment can be verified *and* overruled, and it
appears either way.

The two rendered states are distinguishable **with colour removed** because they
differ by *shape* — **dashed edge** versus **filled amber block**. Shape is the
only property that survives sunlight washout, a dirty screen and colour-vision
deficiency.

Contrast: `#8A5109` on `#FBF0DF` 5.02:1 · `#5A6478` on white 6.05:1 — clear AA.
`#1F6F4A` on white 5.31:1 applies to the admin monitor only.

### Renders that diverge from the product — corrected 2 Aug 2026

**`renders/33-search-mixed-list@2x.png` is fixed.** It was re-rendered in place on
the silence rule and now carries **zero** verified-green pixels (measured: 4,767 →
0). Verified cards carry nothing; the eye goes to the dashed card. It is the
authoritative render for inventory row 15 and is safe for the marketing site.

**`renders/34-briefing@2x.png` is fixed** (715 → 8 residual antialiasing px).

**Still divergent, and these matter:**

| Render | Cited by | Problem |
|---|---|---|
| `45-briefing@2x.png` | **row 31, Briefing view** | Byte-identical to the *old* badge-bearing 34. **715 verified-green px.** The re-render landed on 34; row 31 was never repointed |
| `47-draft-output@2x.png` | **row 36, Draft output** | **927 verified-green px**, and its own note still reads "AI-mark header band; inline registry stamps" — both retired by §9c |
| `32-badge-family@3x.png`, `43-badge-greyscale.png` | row 23 | Five marks. History, correctly labelled as such |

The Turn 13 bundle states *"their earlier badge-bearing versions no longer exist
on disk."* **That is not true of the briefing**: `45-briefing@2x.png` is that exact
file under a different name, still on disk and still the authoritative pointer.
**Do not take a marketing screenshot of the briefing or the draft from the
authoritative render until 45 and 47 are re-rendered or rows 31 and 36 are
repointed at 34 and a corrected draft render.**

Also stale in the shipped `SCREENS.md`, flagged not edited: the header still lists
"registry-stamp badge" as part of the current system; row 15's note still says "All
five badge states in one list"; and line 230 asserts "Nothing is marked NOT YET
DESIGNED" while row 3 (Magic link sent) still is.

### Reconciliation — §9c state names vs the contract

**The contract is frozen and correct. The design doc moves.**

`design/screens/IMPLEMENTATION.md` §9c names the states
`verified_internal` / `verified_external` / `verified_human`. That reads as **one
enum** and **drops `failed` entirely**. The data model is three independent
fields and always has been:

- `verification_state` — `verified` | `unverified` | `failed`
- `verified_by_source` — `corpus` | `public_x2` | `ecourts` | `none`
- `overruled_status` — `none` | `set_aside` | `partly_set_aside` | `doubted`,
  on `judgments`

**After the silence pass the design does not need verified sub-states in list UI
at all**, which is why this never required renaming anything: verified renders
nothing, so the three sources have no surface to name. They key the on-tap detail
and the admin monitor off `verified_by_source`, exactly as before.

`docs/SCHEMA_TRUTH.md`, `docs/CITATION_HARNESS.md` and `docs/API_CONTRACTS.md`
are authority. **§9c is flagged for correction in the next design pass** — it was
not edited here, because it is a design deliverable.

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

**One icon library. Reicon was evaluated on 2 Aug 2026 and declined** — it was
proposed to supply legal icons Lucide lacks, and **Lucide already has them**:
gavel, stamp, landmark and scroll-text are all present in Lucide and all *absent*
from Reicon. It would have cost the gavel and the stamp to gain `courthouse` and
`judge`. Full evidence and the measured package facts: `docs/OSS_STACK.md`
§Iconography.

If a legal glyph is genuinely missing, take it as a **static SVG** into
`apps/mobile/assets/icons/` under its licence — never a second icon package. Two
icon libraries is two stroke systems, and stroke weight is the thing that makes a
set read as one set.

## Non-negotiable UI rules
1. **A verified citation renders no mark** — no badge, chip, tick, ring or
   colour. Verification is the expected state. Its detail is available on tap and
   summarised once in the draft footer, never asserted on every row.
2. An unverified citation is shown honestly — **always visible, always marked**,
   never hidden and never dressed as confirmed. Silence is reserved for verified;
   it can never stand for removal. **`failed` renders exactly as `unverified`** —
   the advocate cannot act on the difference, and an outage must not read as a
   corpus gap.
3. Overruled always shows its caution state, on every surface. **Three states,
   not one:** `set_aside` (danger band, primary action disabled) ·
   `partly_set_aside` (caution band, adds with a note) · `doubted` (no band, one
   muted line). Binary is a correctness bug in Indian practice.
3a. **Amber is reserved.** `#B4690E` means the law has moved, and nothing else —
   never on drafts, OCR, privacy, or anything about our own confidence. Our
   uncertainty is neutral ink with a dashed edge.
3b. **Copy is licence protection, not an audit.** "Safe to file", never "we
   verified this". "We could not confirm this exists", never "verification
   failed". Never an accusation, never our failure.
4. **No AI-assisted mark on the document.** Consent is taken once, explicitly, at
   onboarding — covering AI assistance, the duty to verify before filing, and the
   terms of legal use. The exported document carries **no watermark and no hatched
   margin**; a single line sits in the export metadata, and the citation summary
   stays in the draft footer while in-app. An advocate who has accepted the terms
   is a professional, and a watermark on a court filing is both patronising and a
   competitive disadvantage.
5. OCR-extracted fields show for confirmation before save — presented as a
   **normal review step, not a warning**. It is a data-correctness step, so drop
   the cautionary language entirely: *"Check the details"*, not *"Confirm what we
   read"*. An uncertain field is marked **worth a look**, in neutral ink.
5a. **The privacy disclosure never appears during use.** It lives at onboarding
   and in Settings. An app that repeats its privacy notice signals it does not
   trust its own answer.
6. Never a bare spinner on search — skeleton results keep the screen's shape.
7. Offline is a requirement, not an edge case.
8. When the AI is unavailable, say so plainly. Never serve a stale cached answer.
9. Nothing blocks on Bar Council enrolment — "verification pending" is a state,
   never a gate.
10. **The admin consumes the same `tokens.ts` as the app.** No admin-only hex, no
    second palette, no second type scale. Density may differ; values may not.

## Resolved by the final bundle — 1 August 2026
- ~~Does gilt still exist at all?~~ **Resolved to two placements.**
  `design/screens/renders/55-gilt-two-placements@2x.png` states it directly:
  "Render 30 showed gilt struck while §Gilt kept three placements. Resolved to
  two." The verified tick ring is **retired outright** — the stamp is a rectangle
  and there was never a ring to gild — and moves into the forbidden list. Budget
  drops to **one mark maximum on any screen**.
- ~~Gilt placement 2 is unreachable.~~ Resolved by the same render: retired, not
  reserved.
- ~~`1aa` does not exist.~~ Resolved — the two screens it stood for are drawn
  under new ids: **#12 unverified citation detail → `10i`** and **#25 subscription
  → `10k`**. `1aa` was never a real id.
- ~~Render numbering collides on 14- and 16-.~~ Re-applied after the final bundle
  reverted it: retired *14-admin-enrolment-queue.png* →
  `design/screens/renders/v1-14-admin-enrolment-queue.png`, retired
  *16-admin-llm-spend-routing.png* →
  `design/screens/renders/v1-16-admin-llm-spend-routing.png`. Current files
  unchanged. **The bundle ships the unprefixed names — re-apply after any future
  re-import.**

## Known contradictions — still open, do not silently pick
1. **`design/screens/IMPLEMENTATION.md` §Gilt is now stale.** It still says "exactly three
   places", retains the tick ring as possibly returning, and budgets "at most 2
   gilt marks per screen". Render 55 supersedes all three. This file follows the
   render.
2. **§9.1 is stale.** "Settled decisions" still says the badge is *variant D, a
   tick with a gilt ring* — but §Badge ships the **registry stamp** (a rectangle,
   no disc, no ring) and §4 says variants A–D are history, "do not build them".
3. **§9.2 is stale.** It still settles the briefing as *the full-screen dark
   takeover (`1g`)*, while §8b item 12 records "the dark briefing takeover is
   gone" and §5 maps the briefing to `8b`, calling `1g`/`1h` retired.
4. **§10a render index does not cover renders 44–63.** It still reads "30-43 are
   current" and lists nothing beyond 43, so twenty new authoritative renders —
   including every screen that closed a NOT YET DESIGNED item — are absent from
   the index that declares which PNGs to build from. `design/SCREENS.md` carries
   the mapping in the meantime.
5. **§9b numbers its decisions 1–15**, while `PRODUCT_DECISIONS.md` numbers the
   same ground **PD-1…PD-12**. Two schemes for one set. `PRODUCT_DECISIONS.md` is
   authority; the mapping is in `design/SCREENS.md`.
6. **§9b #8 says the immediate-push exception is "a set-aside authority cited in
   tomorrow's hearing" (one exception); PD-6 says two** — `set_aside` on a
   citation in an **exported** draft, and a newly discovered listing for
   **tomorrow**. PD-6 is authority and is what the contracts implement.
7. **The admin desk still runs the v2 palette** (dark sidebar, oxblood accents)
   and does not yet match §Colour. PD-11 confirms this is deliberate — admin is
   internal, RCC builds from the live canvas, and capturing PNGs of the old
   palette is wasted work. Admin renders are authoritative for **layout only**.
