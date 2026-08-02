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

### Colour — paper, ink, one accent

Seven values plus three states, plus **gilt `#C9A227` as ornament only** — four
permitted placements, defined in §Gilt below. Gilt is not in the table because it
never carries information: never text, never a rule that must be read, never a
state, never on anything tappable.

What was struck was gold as *load-bearing* text and rules. That fails in direct
sunlight on a mid-range Android, and dark-plus-metallic reads luxury-consumer
rather than senior counsel. Ornament that carries no meaning does not have that
problem — if it washes out, no information is lost.

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FBFAF7` | Page ground, with tooth (below) |
| `paper-desk` | `#F2EFE8` | Ground behind a document sheet (draft view only) |
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

### Material — paper with tooth

`#FBFAF7` flat is what made earlier passes feel unfinished. The ground carries a
two-layer stipple at ~2% opacity:

```css
background-color: #FBFAF7;
background-image:
  radial-gradient(rgba(20,27,45,.022) .5px, transparent .5px),
  radial-gradient(rgba(20,27,45,.016) .5px, transparent .5px);
background-size: 3px 3px, 7px 7px;
background-position: 0 0, 2px 3px;
```

On native, use a tiled 1×-density noise PNG at the same effective opacity. The
test: a user must not be able to describe the texture, but a screenshot should
feel printed rather than rendered. It disappears entirely under sunlight washout,
which is correct — it is the first thing that should go.

### Depth — rules and edges, not shadows

**No shadows on cards.** Structure is carried by hairlines and by spacing, the way
it is on a printed page. Radii are **2px** (3px maximum) — soft corners were doing
most of the "startup toy" work; a bound reporter and a cause list have square
corners — the only exceptions are sheets (12px, top corners only) and genuinely
circular elements. The only permitted blur is a sticky bar over scrolling content
(`rgba(251,250,247,.94)` + `blur(16px)`). Shadow appears only on the three
floating cases tabulated in §Spacing — never on a resting card, button or header.

Rule weights:

| Weight | Colour | Use |
|---|---|---|
| 1px | `#E8E4DA` | Between list items |
| 1px | `#DAD6CB` | Card edges, section divisions |
| 1px | `#141B2D` | Under a section heading; closing a masthead |
| 2px | `#5E1A2B` | One per screen, on the thing that matters |

### Typography

**Source Serif 4** for all legal content — judgments, holdings, drafts, case names,
briefing prose. Chosen over Literata (wider per character, costs lines on a 402px
phone) and over Lora (calligraphic stress and soft terminals drop out at 17px on a
mid-range screen outdoors). Its optical-size axis lets one family carry a 32px case
name and a 17px holding without either looking wrong.

**Inter** for app chrome. **JetBrains Mono** for citations, CNR/FIR numbers and
eyebrows. **Noto Serif Devanagari** / **Noto Sans Devanagari** for Hindi.

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

**Measure never exceeds 72 characters**, target 60–68. **Body minimum is 16px, not
15** — a large share of users are over fifty and reading in bad light. Devanagari
sits one point smaller than Latin with more leading: matched by optical weight,
not nominal size, because conjuncts and matras need the vertical room. Hindi
eyebrows drop the letterspaced-uppercase treatment — Devanagari has no case
distinction and letterspacing breaks conjuncts.

### The verification badge — the registry stamp

The most important component in the product. It is what lets an advocate put a
citation into a document they file in court, so it is specified exactly.

#### Shared geometry — identical across all five states

| Property | Value |
|---|---|
| Shape | Rectangle, **radius 2px** |
| Border width | **1.5px** (never 1px — it must survive 2x on a low-DPI panel) |
| Padding | `3px 6px` at 1x standard; `4px 8px` at the 1x large variant |
| Layout | `inline-flex`, `align-items:center`, `gap:5px`, `flex:none` |
| Label face | **JetBrains Mono 600** |
| Label size | **10px** standard · 9.5px compact · 10.5px large |
| Letter-spacing | **0.06em** standard · 0.08em large |
| Icon box | **11px** standard · 11px compact · 13px large |
| Icon stroke | 3.2 (tick) · 2.4 (info) · 2.6 (strike-lines), `stroke-linecap:round` |
| Box height at 1x | **20px** standard · 19px compact · 24px large |
| Vertical align, inline | `vertical-align: 1px` when set inside serif body text |
| Qualifier divider | 1px vertical rule at 35% of the border colour, `padding-left:5px` |

The qualifier is a second mono span inside the same box, never a second badge.

#### Per-state specification

| Property | `verified_internal` | `verified_external` | `verified_human` | `unverified` | `overruled` |
|---|---|---|---|---|---|
| **Border treatment** | solid | solid | solid | **dashed** | solid |
| **Border weight** | 1.5px | 1.5px | 1.5px | 1.5px | 1.5px |
| **Border colour** | `verified` `#1F6F4A` | `verified` `#1F6F4A` | `verified` `#1F6F4A` | `ink-faint` `#8A8578` | `caution` `#B4690E` |
| **Fill** | none (transparent) | none | none | none | **`card` `#FFFFFF`** — the stamp stays white while the card behind it is washed `#FBF0DF` |
| **Radius** | 2px | 2px | 2px | 2px | 2px |
| **Label text** | `VERIFIED` | `VERIFIED` ⏐ `×2` | `VERIFIED` ⏐ `BY YOU` | `NOT CONFIRMED` | `LAW MOVED` |
| **Label face / size** | JetBrains Mono 600 / 10px | same | same | same | same |
| **Label colour** | `#1F6F4A` | `#1F6F4A` | `#1F6F4A` | **`ink-muted` `#5A6478`** (not `#8A8578` — the border is faint, the word is not) | `caution-text` `#8A5109` |
| **Icon** | tick `m20 6-11 11-5-5` | tick (same) | tick (same) | info circle: `circle r9` + `M12 8v5` + `M12 16.5h.01` | strike-lines: `M4 6h16M4 12h16M4 18h16` |
| **Icon colour** | `#1F6F4A` | `#1F6F4A` | `#1F6F4A` | `#8A8578` | `#8A5109` |
| **Box size at 1x** | 20 × 74px | 20 × 100px | 20 × 128px | 20 × 118px | 20 × 92px |
| **Min legible size** | 19 × 70px (9.5px label) | collapses to `verified_internal` | collapses to `verified_internal` | 19 × 112px — **never collapses**, the full phrase is the point | 19 × 88px — never collapses |
| **Card treatment** | none | none | none | dashed 1px `#DAD6CB` divider + disclosure sentence + "Check on eCourts" | **card wash `#FBF0DF`, border `rgba(180,105,14,.32)`**, footer rule `rgba(180,105,14,.3)` |
| **Blocks "add to matter"** | no | no | no | no | **only when `set_aside`** (see §9.3) |

Widths are measured, not nominal — they will shift ±4px with the shipped font
metrics. Never hard-code them; let the box size to its content with `flex:none`.

#### The family claim — verified, not asserted

**The three verified states are one family.** They share border treatment, border
weight, border colour, fill, radius, icon, icon colour, label face, label size and
the leading word `VERIFIED`. The *only* difference is the presence of a qualifier
span after a hairline divider. An advocate who does not care which flavour of
verified they are looking at never has to parse one.

**All five are distinguishable with colour removed.** Proof:
`renders/43-badge-greyscale.png` is the badge sheet rendered at `grayscale(1)`.
The discriminators that survive are all non-chromatic:

| State | Non-chromatic discriminator |
|---|---|
| `verified_internal` | solid edge, one word |
| `verified_external` | solid edge, divider + `×2` |
| `verified_human` | solid edge, divider + `BY YOU` |
| `unverified` | **dashed edge** — a shape difference, visible at any size |
| `overruled` | **filled block** against a washed card — the only value shift in the set |

One caveat found in the greyscale test and worth knowing: `overruled`'s white fill
against the card wash is a **subtle** value difference in greyscale. It is carried
by the strike-lines icon and by the card wash, not by the fill alone. Do not drop
either.

**Why this form.** It carries a *word*, so it needs no legend. It differentiates by
**shape** — solid edge, dashed edge, filled block — and shape is the only property
that survives sunlight washout, a dirty screen, and colour-vision deficiency. The
three verified states share one border, one colour and one icon, with the qualifier
set off by a hairline; an advocate who does not care about the distinction never
has to parse it.

**`unverified` is the state that matters most.** It must never use red, an alert
triangle, or the word "failed" — those say *the product is broken*. Dashed neutral
ink says *open, nothing was impressed here*. The card expands with one sentence in
the language of disclosure — "We found this reference but could not confirm it
against a reported record" — and one action, "Check on eCourts". This is a
competence signal, not an error.

**`overruled` gets the amber card wash** in addition to the stamp, borrowed from
the margin-endorsement approach. The stamp alone can be skimmed past; the wash
cannot. It is amber, never red — the case is real and confirmed, the law has simply
moved.

**Behaviour at small size.** The stamp never goes below 9.5px label / 11px icon.
Below ~340px of available card width, drop the qualifier (`×2`, `BY YOU`) and keep
`VERIFIED` — the family reading survives, the flavour is available on tap. Never
reduce to an icon alone; the word is the component.

**Contrast.** `#1F6F4A` on white is 5.31:1; `#8A5109` on `#FBF0DF` is 5.02:1;
`#5A6478` on white is 6.05:1 — all clear AA at these sizes. Stamp borders are
1.5px so they survive at 2x on a low-DPI panel.

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
brightness on the snappy spring, paired with a `tap` haptic on press-down.
No element may feel dead on tap.

**Haptic choreography** — haptic and visual fire as a single event, never
independently:

Haptics are named **semantically, by what happened** — never by platform impact
weight. A build agent must never choose an impact style itself; it calls the
semantic name and `haptics.ts` owns the mapping. This is the whole reason the module
exists: it keeps the mapping in one file so it can be retuned per device without
touching a screen.

| Semantic name | Fires when | Visual, same frame | iOS | Android |
|---|---|---|---|---|
| `tap` | Any pressable receives press-down | scale .965, −3% brightness | `.light` impact | `vibrate(10)` |
| `commit` | An action succeeds — draft generated, matter added, checklist item ticked | success animation | `.medium` impact | `vibrate(18)` |
| `ritual` | A high-stakes act completes — draft exported, notice sent, AI mark removed | completion ritual (below) | `.heavy` impact | `vibrate([0,12,40,22])` |
| `shift` | Selection changes without committing — tab change, filter, segmented control | icon dip, indicator slide | `UISelectionFeedbackGenerator` | `vibrate(8)` |
| `reject` | Validation fails or an action is refused | tint pulse on the offending element | double `.rigid`, 80ms apart | `vibrate([0,14,80,14])` |

There are exactly five. Do not add a sixth without changing this table.

**The completion ritual** (`ritual` haptic; Apple Pay's "done" is the benchmark): the circle
settles, the checkmark draws itself with a spring overshoot, then the whole
surface breathes out to resting. Use it for every high-stakes confirmation —
draft exported, notice sent, AI mark removed, matter filed.

**State-driven transitions** — the UI is a pure function of state:
- Status chips morph in place, crossfading text over 200ms. Never slide or pop.
- Progress states animate as a horizontal `oxblood` fill sweep on a `rule` track.
- Numbers count up/down over 0.6s ease-out. They never jump.
- Loading is a **shimmer**, never a spinner: a **1.8s** looping gradient sweep from
  `rgba(20,27,45,.03)` to `rgba(20,27,45,.07)`. Offset sibling skeletons by
  200ms so a list reads as one wave.

**Scroll depth and parallax** — paper ground static · card layer 1× · sticky bar
0.3× (drift before locking) · cards exiting the top compress toward `scale .97`
(Apple Wallet stack). There is no parallax glow layer — that was an obsidian-era
device and does not survive on paper.

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

**Ambient motion** — the app is alive when untouched, barely: live dots pulse
scale 1→1.3→1 and opacity 1→.5→1 on a 2s loop · empty-state illustrations float
y 0→−6→0 over 4s. That is the whole list. No autoplaying video, no particles,
nothing that competes with the task.

The rotating gilt hero border is **retired** — it was an obsidian-era device, it
put gilt on a moving decorative edge, and on paper it read as a novelty.

**Four states, always** — resting · pressed (scale .965, −3% brightness,
`tap` haptic) · **loading (shimmer, always — there is no spinner in this product,
custom or system)** · done (ritual, then resting).

The single exception is the AI mark animation (`assets/lawmind-ai.json`), used
while a search runs at 32px inline and while a draft generates at 120px centred.
It is a brand mark that happens to move, not a progress indicator, and it is the
only animated loading affordance permitted besides shimmer.

### Interruptibility — the difference between good and expensive

**Every animation is interruptible at every frame.** An animation the user cannot
interrupt is a modal they did not ask for, and it is the single clearest tell of a
cheaply built app. Non-negotiable:

- **Gesture takeover.** A gesture that begins mid-animation takes over from the
  element's **current position and current velocity** — never from its start or end
  state, and never after waiting for the animation to finish. Reanimated gives you
  this for free if you drive from shared values and never from a timed sequence.
- **Velocity-driven dismissal.** A sheet or a back-swipe resolves on **velocity**,
  not distance alone. Threshold: dismiss if velocity exceeds **500 px/s** in the
  dismiss direction, *or* if travel exceeds **40%** of the element's dimension.
  A fast flick with 15% travel dismisses; a slow drag to 35% springs back.
- **Continuous reversal.** Reverse mid-flight from the current value with no jump
  and no restart. A user who half-opens a sheet and changes their mind must see it
  fall back from where it is.
- **`matchedGeometryEffect` runs both directions and is interruptible in both.**
  If the user starts a back gesture while the forward transition is still settling,
  the shared element reverses from its interpolated position.
- **Never block input during a transition.** No `pointerEvents: none` blanket, no
  `isAnimating` guard that swallows taps. If a tap during a transition would be
  ambiguous, make it resolve to the most likely intent — usually "finish and act".

Test: start every transition in the app, and half-way through, do the opposite
thing. Nothing should jump, freeze, or ignore you.

### Performance floor — the target device is not your laptop

The design assumes a **~₹12,000 Android, Redmi Note class, 4GB RAM, mid-tier GPU,
in a courtroom corridor on 3G.** That is the device the product lives or dies on.

- **60fps floor, 120 where the panel allows.** A dropped frame during the briefing
  arrival or a result-list stagger is a defect, not a nitpick.
- **All animation runs in Reanimated worklets on the UI thread.** Nothing that
  animates may depend on a JS-thread round trip. No `setState` in an animation
  frame, no layout animation driven from React state.
- **Lists use FlashList with stable keys** — never `index` as key, never
  `ScrollView` for a citation list. A search result list is unbounded; a matter
  list is not, but both use the same component.
- **The 55ms stagger caps at index 7** for a reason: beyond that the perceived
  wait grows without adding legibility, and on a slow device the tail of a long
  stagger arrives after the user has already started scrolling. Items past index 7
  appear at the index-7 delay.
- **Lottie is pre-warmed at app start.** Both `lawmind-gavel.json` and
  `lawmind-ai.json` are parsed and cached during the splash, so the first search
  does not pay parse cost. Never mount a Lottie for the first time inside a
  transition.
- **Shimmer is a single animated gradient per skeleton**, driven by one shared
  value for the whole list with per-sibling phase offset — not N independent
  animations.
- **Profile on the target device, not the simulator.** The acceptance bar is: cold
  launch to Today under 2.5s, search submit to first skeleton under 100ms, briefing
  open under 400ms, all on the Redmi-class device over 3G.

### Type

- **UI:** Inter — 16 / 17 / 20 / 23 / 28 / 32. Weights 400/500/600. Sizes below 16
  are permitted only for mono metadata and eyebrows (11–13), which are reference
  labels, not body text.
- **Legal body** (holdings, orders, drafts, judgment text): **Source Serif 4**.
  Drawn for screen reading, narrow enough for a 68-character measure on a 402px
  phone, with an optical-size axis. **Lora is not used anywhere** — see §Typography.
- **Records** (citations, CNR, timestamps, IDs): **JetBrains Mono** at 11.5–13.
  Also used for the eyebrow labels (`600 10px, letter-spacing .18em, uppercase`).
- **Hindi:** Noto Sans Devanagari (UI) / Noto Serif Devanagari (body).
  **Line-height ≥ 1.6, use 1.65–1.72.** Latin spacing clips matras — this is a
  correctness bug, not a taste call.
- **Minimum body size 16px.** Never smaller, anywhere. Enforced in `Text.tsx`,
  which throws in development if a caller passes below 16.

### Spacing, shape, elevation

- 8px base scale: 8 · 16 · 24 · 32 · 48 · 64.
- **Radius: 2px, 3px maximum.** The only exceptions are sheets (12px, top corners
  only) and genuinely circular elements — avatars, status dots, the switch track.
  There are no 6/8/10/16px radii in this product; those were the v1 values.
- **No shadow on any resting surface.** Not on cards, not on buttons, not on ink
  surfaces. Depth comes from 1px rules and from spacing, as on a printed page.
  Shadow appears in exactly three places, and only while the element is genuinely
  floating above content:
  | Where | Value |
  |---|---|
  | Sticky bar over scrolling content | `0 -8px 24px rgba(20,27,45,.06)` |
  | Modal sheet | `0 -18px 44px rgba(20,27,45,.16)` |
  | Card lifted by long-press | radius springs 4→18, opacity .15→.35 (transient) |
- Touch targets ≥ 44×44. Primary actions in the bottom third of the screen.
- Tab bar (4 tabs), never a hamburger.

---

## 3. Motion system

Two curves. Nothing else.

The **three springs above are canonical.** The two CSS curves below exist only
because the `.dc.html` designs are CSS, which has no spring primitive — they are
approximations of the springs, for web only:

```
standard:    cubic-bezier(.2, .8, .3, 1)     // approximates default (.38/.72)
seal spring: cubic-bezier(.2, 1.2, .3, 1)    // approximates snappy (.25/.80),
                                             // with overshoot for ticks and stamps
```

In React Native, **use the springs, not these curves.** The mapping is:
`standard` → `default`, `seal spring` → `snappy`, and anything described as
"rises", "settles" or a layout change → `gentle`. The durations in the table below
are the *observed* settle times of those springs; do not implement them as timed
easings.

Durations: **130** press · **180** fade · **260** push · **380** sheet.
Nothing exceeds 420ms.

| Moment | What moves | Duration | Curve | Haptic |
|---|---|---|---|---|
| App launch | Gavel strikes once, block settles, wordmark tracks in | 900ms cap | snappy | — |
| Briefing arrives | Card scales from .94, **gilt ring** expands + fades once (placement 1 — ornament) | 420ms | snappy | `commit` |
| Open briefing | Takeover rises 40px, masthead settles, body fades | 380ms | gentle | `ritual` |
| Result → judgment | Push from right **30px**, outgoing screen scales to .95 and fades | 260ms | default | `commit` |
| Search running | Skeleton shimmer L→R, 200ms offset per sibling, shape never changes | **1.8s** loop | linear | — |
| Results land | Cards fade up **18px**, 55ms apart (cap index 7), verified stamp last | 380ms | default | `tap` (first card only) |
| Checklist tick | Box pops to 1.16 then settles, label greys + strikes | 300ms | snappy | `commit` (tick) / `tap` (untick) |
| Button press | Scale **.965** and −3% brightness — press is felt, not release | 130ms | snappy | `tap` |
| Tab change | Icon dips to .9 and fills, label weight steps up | 130ms | snappy | `shift` |
| Draft generating | **AI mark animation** (`lawmind-ai.json`, 120px centred); document assembles per streamed paragraph | stream | — | none — a stream is not an event |
| AI mark removed | Header band wipes up, footer stamp fades to audit line | 260ms | default | `reject` |
| Went offline | Amber strip slides from under status bar, pushes content 40px | 180ms | standard | warning (once) |

**`prefers-reduced-motion` / "Reduce Motion":** drop every transform, keep
opacity. The seal still stamps, without scale. Shimmer becomes a static tint.

### Haptics — `haptics.ts`

The five semantic names in §Motion are the entire public surface. Screens import
`haptics.tap()`, `haptics.commit()`, `haptics.ritual()`, `haptics.shift()`,
`haptics.reject()` and nothing else. **No screen may call expo-haptics directly**,
and no screen names an impact weight.

Rules: respect the system haptics setting · never use a haptic as the *only* signal
for a state change · never fire more than one per gesture · no haptics on scroll, on
incoming pushes, or during nightly briefing generation · `reject` is the only
double-pulse and it always accompanies a visible tint pulse.

### Gilt — the rule

**Gilt `#C9A227` appears in exactly three places.** It is ornament marking authority
the app has already established. It **never carries information** — never text a
user must read, never a rule that must be read, never a state, and never on anything
tappable. Any other use is a defect.

The test is single-sentence: **remove the gilt entirely and check whether anything
became unknowable.** If yes, it was load-bearing and must be ink. All three
placements below pass that test — each is a ring or a mark sitting beside
information that is already fully stated in ink.

| # | Placement | Exact use | Surface |
|---|---|---|---|
| 1 | **Briefing seal ring** | The ring around the seal glyph, stamped once on arrival | Ink card only |
| 2 | **Verified tick ring** | 2px ring around the `#1F6F4A` tick disc — **only where a disc badge is used** | Any |
| 3 | **Identity** | Logo, splash, letterhead, admin sidebar mark | Any |

Forbidden without exception: gilt text a user must read · a gilt rule dividing
content · a gilt button or gilt on any tappable surface · gilt on paper at body
size · gilt as a state, status or badge colour · a second accent beyond oxblood ·
the gavel recoloured to red.

**Placement 2 does not currently appear anywhere.** The shipped badge is the
registry stamp (§Badge), which is a rectangle with no disc — so there is no ring to
gild. Placement 2 is retained in this table only because a disc form may return in
a compact context (a dense matter list, a notification). If it does, the ring is
gilt; until then, gilt in the app appears at placement 1 and 3 only.

The **record line is not a gilt placement.** It was, and it was wrong: a CNR and a
next-hearing date are the two things an advocate scans a header for, which makes
them the definition of load-bearing. They render in ink or in `parchment` on an ink
header. Gilt did nothing there except make a critical value the first thing to wash
out in sunlight.

Budget: **at most 2 gilt marks per screen**, and most screens have none. Today has
one when a briefing is waiting (the seal ring). The briefing has one. A result list
has one per verified citation, which is the tick ring and is part of the badge, not
an additional mark. Matters, settings, search input, drafting forms and every admin
section have **zero**.

## 4. Component inventory

Build these once; every screen is composed of them.

- **Eyebrow** — mono 10–11px, `.18em`, uppercase, `oxblood` or `ink-faint`. In Hindi
  it drops the letterspaced-uppercase treatment (§Typography).
- **SectionRule** — eyebrow + 1px `rule` filling remaining width.
- **JudgmentCard** — citation (mono) + court/date, title in Source Serif 4 19/1.34,
  two-sentence holding, footer strip with verification badge + one action.
  Optional caution header band (`caution-soft`, `caution-text`).
- **VerificationBadge** — the **registry stamp**, five states. Full build spec in
  §Badge; do not improvise any part of it. It binds to the citation, not the card,
  so it survives being quoted inside a draft, a briefing, a result list and a
  copied citation. Card footers carry only the plain line "Verified against the
  reported record" plus the action — never a second badge. Earlier explorations
  (the seal, the margin endorsement, and v1 variants A–D) are recorded on the
  canvas as history only; do not build them.
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
- **MatterCard** — next-date pill, CNR (mono), title in Source Serif 4, court/client,
  chip row (briefing ready · N drafts · N events).
- **TimelineEvent** — 9px dot on a 1.5px rail; current event uses a 13px `oxblood`
  dot with a paper ring. Order text renders in Source Serif 4 italic inside a quote card.
- **DraftPage** — `desk` `#F2EFE8` ground, white page, **AI-mark header band**
  (`#FBF0DF`, 1px `caution` bottom border) carrying
  "AI-ASSISTED DRAFT — VERIFY BEFORE FILING" plus "Only you can remove this mark",
  Source Serif 4 16/1.75 body, inline citation stamps per §Badge. The diagonal
  watermark and the hatched side margin are **both retired** — see §8b item 7.
- **AIMarkBar** — sticky footer: "N of M citations verified" + Review mark.
- **SkeletonCard** — mirrors JudgmentCard's exact geometry including footer strip.
- **Switch** — one geometry, used on every screen and in the admin desk. Track
  `46×28` (radius 9999), inset `3px`, knob `22×22` white with
  `box-shadow: 0 1px 3px rgba(20,27,45,.28), 0 0 0 .5px rgba(20,27,45,.06)`.
  The knob is **absolutely positioned** at `top:50%; left:inset` and moved with
  `transform: translate3d(travel,-50%,0)` — never by switching `justify-content`,
  which cannot animate and drifts off centre. Track colour animates over 180ms,
  knob over 200ms, both on the standard curve. On = `oxblood` in the app,
  `verified` green in admin kill switches; off = `#D9D5CB` (or `danger` when off
  means a service is down). Optional `ON`/`OFF` mono label sits inside the track
  at 8.5px; a `LIVE`/`OFF` label may sit outside in a fixed `34px` right-aligned
  column.
- **SettingsRow** — `min-height:60px`, label block `flex:1; min-width:0`, and a
  **fixed-width control column** (`max(switchWidth, 62px)`, `justify-content:
  flex-end`). Every control — switch, value text, chevron — therefore terminates
  on one right-hand axis regardless of type, and rows with and without a subtitle
  keep the same optical centre. This is the fix for the misaligned toggles.
- **TabBar** — 4 tabs, active = `oxblood` 2px top rule + `ink` filled icon + `ink`
  label; inactive `ink-faint`. 30px bottom padding for the home indicator.
  (The old `seal` / `seal-soft` token names are retired — use `oxblood`.)
- **Toast** — ink bar, **2px radius**, bottom 104px, 2.4s, one line max. (It was a
  10px pill in v1; the radius rule in §Spacing governs.)
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
| — | Design system reference | `6c` (current), `1a` (v1) |
| — | Logo, app icons | `3a` (current), `2a` |
| — | Motion + haptics spec | `5b` (current), `2c` (v1) |
| 1–2 | Splash / sign-in · magic link sent | `2b` (current), `1w` |
| 3–5 | Identity + enrolment · language · first matter | `1x` |
| 6 | Today | `6a` (current); `1b` `1c` `1d` are v1 directions |
| 6 | Today — no hearings this week · first run | `1e` |
| 7 | Search input, filters, language toggle | `1i` |
| 10 | Search results — mixed list, all five badge states | `8a` (current), `1j` (v1) |
| 10 | Verification badge — three approaches × five states | `7a` `7b` `7c` `7d` (current); `1k` is the retired v1 A–D set |
| 10 | Skeleton · no results · Hindi results | `1l` |
| 11 | Judgment detail · partly set aside | `1m` `1n` |
| 11 | Overruled: set_aside · doubted · all three compared | `3e` |
| 15 | Hearing briefing | `8b` (current); `1g` `1h` are the retired dark takeover and memo variants |
| 16 | Briefing push notification (lock screen) | `1f` |
| 17 | Document type picker | `1o` |
| 18 | Draft input form | `1p` |
| 19 | Draft output · Hindi output | `8c` and `9a` (current); `1q` `1r` `1s` are v1 |
| 8 | Matters list | `1t` |
| 12 | Matter detail (timeline) | `1u` |
| 13–14 | Add matter (CNR + manual) · add event sheet | `1v` |
| 20–22 | Profile · settings | `1y` |
| 23 | Empty states | `9b` (current); `1e` `1l` `1z` (v1) |
| 24 | Offline | `9b` (current), `1z` (v1) |
| 25 | AI unavailable | `9b` (current), `1z` (v1) |
| — | Citation verification failed · paywall/tiers | `1aa` |
| 26–28 | Admin — 17 sections | `LawMind Admin.dc.html` |

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

`LawMind Admin.dc.html` — 1440px, ink sidebar with the gilt mark, **17 sections**
(see §8a for the four added),
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

## 8a. Admin desk — seventeen sections

**The admin consumes the same `tokens.ts` as the app.** No admin-only hex values,
no second palette, no second type scale. Its dark sidebar is `ink` `#141B2D` with
`parchment` `#FBFAF7` text at 100% for the active item and 55% for the rest; the
content area is `paper` with `card` panels, `rule` borders, `ink-faint` metadata
and `oxblood` for primary actions. The three state colours are the same three.

Two consequences that are not optional:

1. **The verification badge renders identically in admin and app** — same component,
   same five states, same geometry per §Badge. An admin triaging a disputed citation
   must see exactly what the advocate saw; a divergent rendering would make the
   disputed-citations queue worthless as evidence.
2. **Density may differ; values may not.** Admin panels use a tighter vertical
   rhythm and 10px panel radii because it is a data tool read at desk distance.
   That is a documented density variant of the same tokens — never a new value. A
   hex that is not in `tokens.ts` is a defect.

The admin's *currently rendered* colour is a v2 palette predating the refined
system. Build from `tokens.ts` and the renders' **layout**, not their colour.

Four were added beyond the original brief, each because it closes a failure mode
the app cannot recover from on its own.

| Section | Why it exists |
|---|---|
| **Cause list sync** | Every briefing is built from a scraped cause list. A parser that silently returns an empty list is worse than an outage, because briefings still go out — with stale dates. Per-court pull time, item count and status, with an escalation policy: retry once, then mark briefings "dates not confirmed today", then notify affected advocates directly. **We never present an unconfirmed listing as confirmed** — the same rule as citations. |
| **Disputed citations** | The trust feedback loop. An advocate reports that a badge was wrong; upholding writes a correction to the corpus, re-runs verification for everyone who saved that citation, and pushes a notice to anyone who put it in a filed draft. Tracks a **false-verified rate** whose target is zero. This queue outranks everything else in the admin. |
| **Draft templates** | Ten document types, each prompt versioned and scored against a 200-item golden set reviewed by a practising advocate. Catches quality regressions that no error rate would surface — a template can drift for weeks while returning 200s. Gates: court-format compliance, no invented citations, no overruled authority cited as good law, AI mark present, Hindi parity. **Nothing ships below 90 without a founder override, and the override is written to the audit ledger.** |
| **Data & deletion** | DPDP Act obligations with a visible clock per request — export, correction, erasure. Also states retention plainly and tracks **pseudonymisation coverage** (99.2%), the number behind the privacy disclosure the app shows the advocate. The remaining 0.8% is disclosed rather than hidden. |

Existing sections retained: Overview, Enrolment queue, Advocates, Briefings,
Citation monitor, Corpus & ingestion, LLM spend & routing, Subscriptions, Support
inbox, Push campaigns, Platform controls, Staff & audit, Analytics.

**Note on styling.** The admin desk still runs the earlier palette (dark sidebar,
oxblood accents). It is an indoor desk tool, so the sunlight argument that killed
dark in the app does not apply to it — but it does not yet match the refined
system in §Colour. Aligning it is a separate pass, not started.

## 8b. Decisions I made that you did not explicitly approve

Flagged for review before any of this becomes code. Each is a real choice with a
plausible alternative, not a detail.

| # | Decision | Where | Why | If you disagree |
|---|---|---|---|---|
| 1 | **Source Serif 4 over Literata** | everywhere | Narrower per character, so 68 chars fit a 402px phone at 17px; optical-size axis carries 32px and 17px in one family | Swap to Literata — one token change, but expect ~8% more lines per screen |
| 2 | **Radii cut from 10–12px to 2px** | everywhere | Soft corners were doing most of the "startup toy" work; reporters and cause lists have square corners | Raise to 4px; above 6px the register shifts back |
| 3 | **Shadows removed entirely** from cards | everywhere | Depth from rules and space, as on a printed page | One 0 1px 2px shadow on cards only; never on the sheet |
| 4 | **Paper tooth at ~2% stipple** | all grounds | Flat #FBFAF7 read unfinished | Remove — costs nothing structurally |
| 5 | **Badge label wording**: `NOT CONFIRMED` not `UNVERIFIED` | badge | "Unverified" reads as a verdict on the case; "not confirmed" reads as a statement about *us* | Both tested the same width |
| 6 | **`overruled` labelled `LAW MOVED`** | badge | "Overruled" is legally narrower than the states we actually cover (set aside, partly set aside, doubted) | `SUPERSEDED` is the alternative; "overruled" alone would be inaccurate |
| 7 | **Draft AI mark is a header band**, not a diagonal watermark | draft output | A watermark across serif body made the page look unusable; the band is prominent and leaves the document filable | Watermark returns only if you accept the legibility cost |
| 8 | **Draft view sits on `#F2EFE8`**, not paper | draft output | Makes the white sheet read as a document on a desk | Flatten to `#FBFAF7` |
| 9 | **Sunlight test is a design gate**, not a checkbox | all | Every component was checked at contrast 0.5 / brightness 1.3 | — |
| 10 | **Citations stay English inside Hindi drafts** | Hindi | Reporters are English-only; a transliterated citation is returned at the filing counter | Already settled in §9.6, restated here because it is visible in `9a` |
| 11 | **Hindi eyebrows drop letterspaced uppercase** | Hindi | Devanagari has no case distinction; letterspacing breaks conjuncts | — |
| 12 | **The dark briefing takeover is gone** | briefing | Your corridor-at-midday case beat my occasion-feel case | Say so and it returns as the single dark surface |

## 9. Decisions — settled, do not reopen

All eight were called on 30 July 2026. Reasoning recorded so sprint three does not
relitigate them. Governing principle: **a premium tool does fewer things, states
them plainly, and never hedges.** Where a call could go either way, the option
with less surface area won.

1. **Verification badge — the registry stamp, five states.** A rectangle with a
   1.5px border and a mono label, bound to the citation string rather than the
   card, so it survives being quoted inside a draft, a briefing and a copied
   citation. **There is no disc and therefore no gilt ring** — the v1 "variant D"
   green disc is retired. States differentiate by *shape* (solid / dashed /
   filled), the only property that survives sunlight and colour deficiency. Full
   build spec in §Badge; the seal, the margin endorsement and v1 variants A–D are
   history, not options.
2. **Briefing — paper masthead, not a dark takeover.** The v1 full-screen ink
   takeover (`1g`) is **retired**: an advocate reads a briefing in a courtyard at
   midday, and a dark screen is the worst surface for that (§8b item 12). The
   briefing is paper, opened by a 2px oxblood masthead rule with the gilt seal
   ring beside it, four numbered blocks, and the checklist last — canvas `8b`.
   The memo variant's dropped cap and "the one point to win" block are folded into
   block 01. Arrival is carried by the seal press (`10a`), not by a colour change.
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
8. **Notes vs court record — two weights.** Record renders in Source Serif 4 on a
   quote card; private notes render in Inter, indented, muted, prefixed "Your
   note". Under a firm plan the record is shared and notes are not, by default,
   with no setting.
9. **No sound. Ever.** The app opens in courtrooms, and a device that makes a
   noise there embarrasses its owner in front of a judge. Silence is a decision,
   not an omission: **haptics carry every piece of feedback** (§Motion), and the
   five semantic patterns exist precisely so nothing needs an audio cue. No
   success chime, no error tone, no keyboard click, no in-app notification sound.
   If a state cannot be communicated by a visual plus a haptic, redesign the
   state.
10. **Dark mode is v2, and that is deliberate.** Advocates work in daylight —
    corridors, courtyards, chambers with windows — and the whole paper system is
    tuned for sunlight legibility on a mid-range Android. Obsidian was built in
    full and reverted after review (§8b item 12); shipping a dark theme now means
    maintaining two palettes, two sets of state colours and two badge renderings
    before the first is proven in production. Revisit once the corpus, the badge
    and the briefing are settled. **Do not build a partial dark mode in the
    meantime** — a half-themed legal app is worse than none.

## 9c. The silence pass — 1 Aug 2026

The single biggest visual change since the dark direction was killed. Verification
inverts: **the expected state renders nothing, only the exception is drawn.**

### Why

A badge on every result is the app clearing its throat before every sentence. It
also inverts the signal — when the expected state is decorated, the exception has
to shout to be heard above it. On a five-result list that is five badges competing
with the two that matter. Silence gives the exception the whole room.

Verification did not become less important. It became **the floor**, and a product
that decorates its floor has nothing left to say when the floor gives way.

### What renders

| State | Renders | Treatment |
|---|---|---|
| `verified_internal` · `verified_external` · `verified_human` | **nothing** | Ordinary card. No badge, chip, tick, ring or colour. |
| `unverified` | **dashed ink card** | 1.5px dashed `#8A8578` border, headline row *"Do not file this without checking it"*, reason and the eCourts route inside the card. |
| `overruled` (3 sub-states) | **amber card** | Unchanged from §Badge — `#FBF0DF` wash, `rgba(180,105,14,.35)` border, headline naming the affected paragraphs. |

The registry stamp is **retired as a per-result chip**. Its geometry survives only
in the draft footer and in the on-tap sheet.

### The three places verification stays visible

1. **Draft footer** — one line, before export. Clean: *"All 4 citations safe to
   file"*. Exception: the footer grows a dashed ink card naming the risk, and
   export drops to secondary reading *"Export anyway"*. Never blocked.
2. **On tap** — a sheet opening with *"Safe to file"*, then the three sources
   checked and when each was checked, closing with the nightly re-check promise.
3. **Admin citation monitor** — unchanged.

### The copy reframe — this is licence protection, not an audit

The Supreme Court now treats an unverified citation as a matter of professional
conduct, and High Courts have made cost orders. The app is not checking on a
professional; **it is standing between them and a cost order.** Every line is
written from that position.

| Retired | Ships |
|---|---|
| We verified this citation | **Safe to file** |
| Verification failed | **We could not confirm this exists** |
| Not confirmed | **Do not file this without checking it** |
| 3 of 4 citations verified | **One citation could put you at risk** |

The unverified state reads as *we are telling you before the court does*. Never as
our failure, and never as an accusation.

### The AI-assisted mark is removed from the document

No watermark, no hatched margin, no header band, no inline stamps. **Nothing on the
exported file.** It is replaced by an explicit consent screen at onboarding
(canvas `12c`) — three numbered clauses in the legal serif, symmetrical: what we
do, what you do, what neither of us does. Read once by a professional, with the
acceptance recorded.

The trade, stated plainly: a mark on every page protected *us*. A consent screen
protects *them*, and the exposure moves to where it can act — a citation we could
not confirm now stops the export with a named risk, which a watermark never did.

### Everything else goes quiet

- **Privacy disclosure** moves to onboarding and Settings. It never appears during
  use. An app that repeats its privacy notice signals it does not trust its own
  answer.
- **OCR field confirmation** stays — that is data correctness, not a warning — but
  loses all cautionary language. *"Check the details"*, not *"Confirm what we
  read"*. The uncertain field is marked **worth a look** in neutral ink.
- **Amber is now reserved.** Caution `#B4690E` means exactly one thing: **the law
  has moved.** It no longer appears on drafts, OCR, or anything about our own
  confidence. When an advocate sees amber, it is about the law, not about us.

## 9d. The daily loop — six screens, 1 Aug 2026

The library is why an advocate downloads Lawmind. **These six are why they open it
tomorrow.** Each replaces something they already do daily on paper.

| Screen | Canvas | Replaces | Frequency |
|---|---|---|---|
| Daily cause list | `12e` | Checking the board | Daily |
| Adjournment capture | `12f` | Writing the date on the file | Daily |
| Client update share | `12g` | A typed WhatsApp message | Daily |
| Limitation calculator | `12h` | Counting on a calendar | Weekly |
| Bare acts reader | `12i` | A shelf and three websites | Weekly |
| Fee and appearance log | `12j` | The register | Weekly |

**Three of the six are used in a courtroom or corridor** — cause list, adjournment,
client update. All three work offline, none has a confirmation dialog, and every
target in them is at least 52px.

### Rules that govern the courtroom screens

- **Adjournment capture is the highest-frequency write in the product.** Target:
  **under four seconds** from lock screen to saved, on a Redmi-class device with no
  signal. Four 64px targets in the lower half. Dates are *predicted* from the
  court's real adjournment intervals, not typed. **No confirmation dialog** — a
  wrong date is corrected by tapping the matter; an extra tap in a courtroom costs
  more than an occasional correction. Reachable in one tap from the cause list row,
  the matter, and the briefing.
- **The cause list is grouped by court, not by time**, because that is how a morning
  is planned. **Item number is the largest element on the row** — it is what an
  advocate scans a board for and what decides whether they can leave for another
  court. A court that has not published gets a dashed row, never a hidden one.
- **The client card is the only Lawmind surface a non-user ever sees.** It is an
  **image, not a link** — it renders in the thread, survives forwarding, and can be
  shown across a desk. The advocate's name is prominent and ours is small: the
  client is served by their advocate, who happens to use good tools. Reversing that
  makes it an advertisement and advocates stop sending it. Rendered 1080×1350 at 3x,
  legible as a thumbnail before it is opened. No case number in the filename.
- **The limitation answer is an ink block — the only one in the app.** A date this
  consequential must not look like a list row. The provision is quoted verbatim
  directly beneath it, because an advocate will not trust a computed date without
  seeing the article. Assumptions (s. 18 acknowledgement, s. 19 part payment) are
  stated with a one-tap route to correct them. **Barred is danger red** and does not
  soften — but the screen immediately offers the three things done next.
- **Bare acts get the judgment reader's treatment exactly** — 26px number gutter,
  current section in ink, neighbours at 50%, Source Serif 4 at 17/1.72. The three
  new criminal codes sit above everything under an oxblood rule, and the **IPC↔BNS
  mapping is a first-class card on the index**, not buried in search: "what is 302
  now" is the most common lookup of this decade. The comparison view shades what is
  new and answers which code applies.
- **The fee log is a ledger, not an accounting product.** Three numbers, then a
  dated list. Appearances with no fee still appear — it is a record of work as much
  as of money. Nothing is ever sent: no invoices, no reminders, no tax. The entry
  sheet is offered right after an outcome is recorded, the only moment an advocate
  will reliably enter a fee.

## 9e. Launch assets — 1 Aug 2026

**Eight store screenshots, sequenced as a day, not as features.** Canvas `12k`.
An advocate scrolling the store asks one question: *what is this like on a
Tuesday?* Feature-by-feature listings convert worse than a day-in-the-life.

Order: briefing arriving the night before → cause list in the morning → a real
search → a draft → adjournment in the courtroom → client update → limitation →
the matter accumulating.

**One and two carry roughly 90% of the conversion decision**, so they are the only
two on the oxblood field. One is the wedge — nothing else on the store does it.
Two answers "would I open this tomorrow" before the advocate has to wonder.
**Search is third, not first**, because every legal app leads with search and none
of them get opened on a Tuesday.

Caption rules: benefit as an advocate would say it to another advocate · no feature
names · no "AI-powered" · no exclamation marks · second person, present tense,
under nine words · legal serif for the caption, Inter for the supporting line.

**Subtitle: "Prepared for every hearing"** — 26 characters. It is the daily loop,
not the library: *every* implies recurrence, *prepared* is the state an advocate
wants to be in. It says nothing about AI, search or documents, which is why it will
still be true in two years.

**The icon holds at listing size** (canvas `12l`). Against Law4u and LegalKart —
both saturated brand colours with a letterform, the pattern for consumer legal
services — oxblood with a gilt ring is the only tile that reads as an instrument
rather than a service, and the gilt ring is the only bright element in the row.

## 9f. Languages

**English and Hindi only.** Thailand is out of v1 — no Thai in any language list,
locale switcher, or copy. Confirmed absent from every file.

## 9b. Product decisions — answered by the founder, 1 Aug 2026

These closed the seven screens that were marked NOT YET DESIGNED. Each is now
drawn; the canvas id is given so the decision and the pixels stay attached.

### Context that governs all of them

- **A chamber is two to five people, not a firm.** The "Firm" tier is a senior
  with juniors, not a corporate practice. No org chart, no roles, no admin
  console — a list of names.
- **A junior may appear for a senior at short notice, sometimes the same
  morning.** A shared briefing must be readable by someone who has not read the
  file. This is a copywriting requirement, not a permissions one.
- **The physical file is still the source of truth.** We are the preparation
  layer. Never design as though we replace the brief.
- **Word is non-negotiable for filing.** `.docx` is the default export and must
  survive with styles intact. A mangled export is worse than no export.
- **Court connectivity is genuinely bad** — thick walls, basements, jammers.
  Offline is a hard requirement.
- **Next dates are given orally in open court** and written on the file, so
  **manual date entry is first-class**, never a fallback path.
- **Senior advocates are the buying decision and the most sceptical of AI.**
  The product must read as an instrument, not a toy. This is the origin of the
  paper-and-restraint direction and it is not negotiable for visual novelty.

### The decisions

| # | Decision | Canvas |
|---|---|---|
| 1 | **Sign-in is SMS OTP to any number they enter.** It need not match the Bar Council roll. Enrolment is verified separately, afterwards. Six tabular digits at 26px. | `11a` |
| 2 | **Full access while enrolment is pending.** A quiet caution-amber band above the header, nothing withheld. It is a band rather than a card so it never competes with the briefing, and it disappears the moment verification lands. | `11a` |
| 3 | **Sharing is per matter, by invitation.** The owner invites a named person by enrolment number or phone. There is no chamber-wide switch — you invite someone to a case, the way you hand over a file. | `11b` |
| 4 | **Notes are private by default, shareable per note.** Reversible. A note about fees or a client's circumstances must never travel with a file by accident. Instruction-to-junior notes are why per-note sharing exists. | `11b` |
| 5 | **A shared briefing names whose matter it is** and surfaces the shared instruction *above* the court record — the thing a stand-in most needs and least expects. It carries no private notes. | `11b` |
| 6 | **Four alert triggers only:** an authority saved to a matter is set aside · an authority cited in a filed draft is set aside · a judgment lands in one of their matters · a matter is listed on a date they did not enter. The filed-draft trigger **cannot be disabled**. | `11c` |
| 7 | **No subject-following alerts.** An alert that does not touch their own matters is engagement, not preparation. The refusal is written into the settings screen. | `11c` |
| 8 | **Alerts batch into the evening briefing.** The briefing card grows a "since yesterday" block; the app does not grow a notifications tab. The single exception is an authority set aside that is cited in tomorrow's hearing — that pushes immediately, danger-tinted, never gilt. | `11c` |
| 9 | **Editing is paragraph-level.** Tap a paragraph, edit its prose. Neighbours drop to 34% opacity. **Citations are locked** and carry a small lock glyph beside the stamp; removal happens through the authority list, not by keystroke. | `11d` |
| 10 | **Editing never clears the AI-assisted mark.** No amount of rewriting counts as reading. Only explicit removal clears it, and that is logged. | `11d` |
| 11 | **`.docx` is the default export**, PDF second, copy-text third. Styles intact, citations as plain text. | `11d` |
| 12 | **Judgment reading view carries six things:** paragraph anchors in a fixed 22px gutter, in-text search that jumps between paragraphs, highlight-and-save to a matter, jump-to-cited-paragraph, reading progress per judgment including offline, and adjustable text size expressed as **words per screen**. | `11e` |
| 13 | **Five search filters:** court and bench strength · date · subject · only verified · exclude set aside or doubted. **Judge and reporter were dropped** — a judge filter is a research tool, and reporter choice is a citation-format concern. | `11f` |
| 14 | **A filter never hides a result silently.** Excluded results are named with a one-tap escape, and applied filters sit as ink chips beneath the query. | `11f` |
| 15 | **The six uncaptured admin sections stay uncaptured.** Advocates, Corpus, Support, Push, Staff and Analytics are built and clickable in `LawMind Admin.dc.html`; the live file is the reference. No golden renders. | — |

## 9g. Pricing and tiers — 1 Aug 2026

### The ladder

| Tier | Price | Unit | In-app purchase |
|---|---|---|---|
| **Practice** | ₹799/mo | One advocate, starting out | Yes |
| **Chamber** | ₹1,999/mo | One advocate, full practice | Yes |
| **Expert** | ₹3,499/mo | One advocate, heavy volume | Yes |
| **Firm** | Talk to us | 5–10 advocates, shared matters | **Never** |
| **Enterprise** | Off-app | Roadmap | **Never** — not shown in-app at all |

The first three are **one advocate at three volumes**. Firm is the first tier where
the unit changes, which is why it is also the first one with no price. Names are
advocate language, not SaaS language — Starter / Professional are retired.

### The naming conflict, resolved

**Chamber stays the solo tier. The multi-seat tier is Firm.** Two reasons: the site
is live with Chamber ₹1,999, and renaming a published tier costs more than naming an
unbuilt one. And the distinction is real in Indian practice — a solo advocate has
*their* chamber; *firm* is what several advocates practising together call
themselves. The alternative (renaming solo to Practice and shifting down) fails
because Practice is already the entry tier and the better word for it.

### No in-app purchase on Firm or Enterprise

Both are invoiced off-app, so **neither may ever show an in-app purchase control.**
This is an App Store rejection under guideline 3.1.1, not only a pricing choice.
**"Talk to us" opens a mail composer** — a link to a web checkout page is the same
violation. Do not add a price, a button, or a URL to either row.

### The founding offer

**Founding advocates keep 50% off, permanently. First 5,000 only.** Exactly that
scope: both the discount and the cap are bounded, so they publish now.

- **No "three months free."** The briefing cost per user is not computed, and a free
  window is an unbounded commitment against an unknown number of users.
- **A counter, never a countdown clock** — "1,204 of 5,000". A clock reads as a
  growth tactic to a senior advocate; a counter is a fact.
- The card sits **above** the tiers, so the struck-through prices below it are
  already explained by the time they are read.
- **Layout leaves room for the free window.** The founding card is a stack, not a
  grid: a fourth line drops in under the progress rule without moving anything below
  it. When cost per user is known, *"and your first three months free"* appends to
  the existing sentence. Nothing re-lays out.

### Admin routing — already drawn

The data-class axis was built in canvas `10l` and is recorded in §8a. Confirmed:
public and sensitive columns each with their own provider, one line stating which
provider handles sensitive traffic, the four-step classification (scan → classify →
route → record, with ambiguity resolving to sensitive), and the blocked state — a
refused attempt to route sensitive traffic to a provider without written terms,
logged, with no founder override available. Render `renders/57-admin-routing@2x.png`.

## 10. Files

```
LawMind Screens.dc.html      All 28 screens + variants, annotated (review canvas)
lottie-mark.js               <lottie-mark> player: tint, duotone, static frame, reduced-motion
assets/lawmind-gavel.json    Your logo animation (used for the mark, animated and static)
assets/lawmind-ai.json       Your AI animation (thinking states)
assets/lawmind-mark.svg      Static mark exported from the same paths
LawMind Prototype.dc.html    Tappable flow: Today → briefing → search → judgment → draft
LawMind Admin.dc.html        Admin desk, 17 sections, interactive
ios-frame.jsx                Device bezel used by the canvas and prototype
renders/                     Golden PNGs. **30-43 are current** (2x/3x, refined
                             system, Source Serif 4). 00-29 are superseded v1/v2
                             — layout is often still valid, colour and serif are
                             not. See §Render index.
IMPLEMENTATION.md            This file
CLAUDE_CODE_BRIEF.md         Paste-ready build instructions for Claude Code
```

## 10a. Render index — which PNGs are authoritative

**Build from these. They are the refined system: paper ground, oxblood accent,
Source Serif 4, registry-stamp badge.**

| File | Contents |
|---|---|
| `30-system-refined@2x.png` | Palette, type scale, rule weights, buttons, inputs, card anatomy |
| `31-today@2x.png` | Today |
| `32-badge-family@3x.png` | Badge — five states, in card, sunlight |
| `33-search-mixed-list@2x.png` | Search results, all five badge states in one list |
| `34-briefing@2x.png` | Hearing briefing |
| `35-draft-output@2x.png` | Draft output |
| `36-hindi-parity@2x.png` | Hindi — Today, search, draft, side by side |
| `37-honest-states@2x.png` | Offline · AI down · privacy disclosure · empty |
| `38-stress-sunlight@2x.png` | Sunlight sim + messy real case data |
| `39-42-admin-*.png` | The four added admin sections |
| `43-badge-greyscale.png` | Badge family with colour removed — the shape proof |
| `00-logo-real-mark.png` | Logo, animated and static, at four sizes |
| `19-overruled-three-states.png` | All three overruled states (layout current) |
| `10-onboarding.png`, `18-splash-signin.png` | Onboarding and splash (layout current) |

**Superseded — layout often still valid, colour and serif are not.** `01-09`,
`11-17`, `20-29`. Two specifically: `12-verification-badges.png` and
`12-verification-badge-d.png` are the retired v1 badge exploration, and
`02-design-system.png` is the v1 system sheet. Do not build from any of them.

```
(end of file list)
CLAUDE_CODE_BRIEF.md         Paste-ready build instructions for Claude Code
uploads/                     Original brief: DESIGN_SYSTEM.md, SCREENS.md, prompts, logo
```

Open the `.dc.html` files in any browser. The prototype needs no build step.
