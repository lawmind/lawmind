# LAWMIND — SCREEN INVENTORY AND COVERAGE

Every screen has **a canvas id and a render**, or is marked **NOT YET DESIGNED**.
There is no third state.

- **Canvas id** — the option id inside `LawMind Screens.dc.html`. Type it into the
  browser as `#8b` to jump to it.
- **Render** — a golden PNG in `renders/`. Renders numbered **30 and above are
  current**; 00–29 are superseded v1/v2, where layout is often still valid but
  colour and serif are not (see IMPLEMENTATION.md §10a).
- Where a screen shows both a current and a superseded version, the current one
  is listed first and is the one to build from.

Current system: paper ground · ink actions · oxblood `#5E1A2B` single accent ·
Source Serif 4 for legal content · registry-stamp badge · gilt at two ornamental
placements only.

---

## Auth and onboarding

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 1 | Splash | `10d` | `renders/44-splash-signin@2x.png` | Seal presses on an oxblood field; the icon opening up |
| 2 | Sign-in — enrolment number | `10d` | `renders/44-splash-signin@2x.png` | Second frame. Enrolment number, not email |
| 3 | Magic link sent | — | — | **NOT YET DESIGNED** — auth method changed to enrolment number; confirm the verification channel before drawing |
| 4 | Onboarding: identity | `2e` | `renders/10-onboarding.png` | v1 layout valid, colour and serif superseded |
| 5 | Onboarding: language | `2e` | `renders/10-onboarding.png` | Same |
| 6 | Onboarding: first matter | `10f` | `renders/48-first-run@2x.png` | Folded into first-run Matters |

## Core — four tabs

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 7 | Today — briefing ready | `6a` `10b` | `renders/31-today@2x.png` | The primary screen. `10b` shows it with the seal press live |
| 8 | Today — first run, no data | `10f` | `renders/48-first-run@2x.png` | Promise stated once, with the cost of acting on it |
| 9 | Today — no hearings this week | `1e` | `renders/11-states-offline-ai-down.png` | v1; derives one overdue obligation, no task model (§9.4) |
| 10 | Search — query input | `1i` | `renders/06-search-results.png` | v1 layout valid |
| 11 | Matters — list | `1t` | `renders/09-matter-detail.png` | v1 layout valid |
| 12 | Matters — first run | `10f` | `renders/48-first-run@2x.png` | Two routes, each with its real cost |
| 13 | Drafts — type picker | `1o` | — | v1 layout valid; ten types grouped criminal/civil |
| 14 | Drafts — first run | `10f` | `renders/48-first-run@2x.png` | Leads with the most-filed type |

## Search and authority

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 15 | Search results — mixed list | `8a` | `renders/33-search-mixed-list@2x.png` | All five badge states in one list |
| 16 | Search — loading | `5e` `1l` | `renders/27-paper-search.png` | Shimmer, never a spinner |
| 17 | Search — no results | `1l` | — | Explains *why*, offers the corrected query |
| 18 | Judgment detail | `1m` | `renders/07-judgment-overruled.png` | v1 layout valid |
| 19 | Judgment — `set_aside` | `3e` | `renders/19-overruled-three-states.png` | Danger band; add-to-matter **disabled** |
| 20 | Judgment — `partly_set_aside` | `1n` `3e` | `renders/19-overruled-three-states.png` | Caution band naming the paragraphs |
| 21 | Judgment — `doubted` | `3e` | `renders/19-overruled-three-states.png` | No band; still binding |
| 22 | **Unverified citation detail** | `10i` | `renders/49-unverified-citation@2x.png` | Four sources checked, each with a result and a timestamp; the eCourts path spelled out |
| 23 | Verification badge — five states | `7a` `7d` | `renders/32-badge-family@3x.png`, `renders/43-badge-greyscale.png` | Build spec in IMPLEMENTATION.md §Badge |

## Matters

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 24 | Matter detail — timeline | `1u` | `renders/09-matter-detail.png` | v1 layout valid |
| 25 | Add matter — CNR lookup | `1v` | — | v1 layout valid |
| 26 | Add matter — manual | `1v` | — | v1 layout valid |
| 27 | Add event | `1w` | — | v1 layout valid |
| 28 | **OCR — capture** | `10j` | `renders/50-ocr-flow@2x.png` | Edge detection confirms before the shutter; minors/witness warning before the photograph exists |
| 29 | **OCR — processing** | `10j` | `renders/50-ocr-flow@2x.png` | Field checklist resolves line by line; on-device stated twice |
| 30 | **OCR — field confirmation** | `10j` | `renders/50-ocr-flow@2x.png` | Per-field confidence; nothing saves until confirmed; photograph discarded after |

## Briefing — the wedge

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 31 | Briefing view | `8b` | `renders/45-briefing@2x.png` | Paper masthead, oxblood rule, gilt seal ring, four blocks |
| 32 | Briefing notification | `10b` | `renders/46-seal-moment@2x.png` | Seal presses inside the lock-screen notification |
| 33 | **The seal press** | `10a` | `renders/46-seal-moment@2x.png` | Frame-by-frame, 620ms, one `ritual` haptic at 0.42 |
| 34 | Briefing — offline | `9b` | `renders/37-honest-states@2x.png` | Saved card keeps its seal; staleness stated |

## Drafting

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 35 | Draft input form | `1p` | — | v1 layout valid; six fields, four matter-prefilled |
| 36 | Draft output | `8c` | `renders/47-draft-output@2x.png` | AI-mark header band; inline registry stamps |
| 37 | Draft output — Hindi | `9a` | `renders/36-hindi-parity@2x.png` | Devanagari body, citations stay English |
| 38 | AI-mark removal | `10b` | `renders/46-seal-moment@2x.png` | The quieter sibling: ink, no glint, second person |

## Account

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 39 | Profile | `1y` | — | v1 layout valid |
| 40 | **Subscription** | `10k` | `renders/51-subscription@2x.png` | Four tiers, no buy button, managed on the web |
| 41 | Settings | `1y` | `renders/20-settings-switches.png` | Switch spec in IMPLEMENTATION.md §Switch |
| 42 | Privacy disclosure | `9b` | `renders/37-honest-states@2x.png` | States plainly what it cannot promise |

## System states

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 43 | Offline | `9b` | `renders/37-honest-states@2x.png` | What is readable, what is not, and when it was saved |
| 44 | AI unavailable | `9b` | `renders/37-honest-states@2x.png` | Refuses to answer from cache; three real alternatives |
| 45 | Empty — no matters | `9b` `10f` | `renders/48-first-run@2x.png` | — |
| 46 | Sunlight stress test | `9c` | `renders/38-stress-sunlight@2x.png` | Design gate, not a checkbox |
| 47 | Messy-data stress test | `9c` | `renders/38-stress-sunlight@2x.png` | Six reporter citations, 96-char case title |

## Identity and system reference

| # | Screen | Canvas | Render | Notes |
|---|---|---|---|---|
| 48 | Design system sheet | `6c` | `renders/30-system-refined@2x.png` | Palette, type scale, rules, buttons, inputs, card anatomy |
| 49 | **App icon** | `10c` | `renders/52-app-icon@2x.png` | Four sizes, light and dark home screens |
| 50 | Logo — animated and static | `3a` | `renders/00-logo-real-mark.png` | The supplied gavel Lottie; static renders frame 34 of the same file |
| 51 | **Micro-typography** | `10e` | `renders/53-micro-typography@2x.png` | Before/after, same content |
| 52 | **Glass on chrome** | `10g` | `renders/54-glass-chrome@2x.png` | Tab bar, sheet, toast, reduced brightness |
| 53 | **Gilt — two placements** | `10h` | `renders/55-gilt-two-placements@2x.png` | Ornament, carries nothing |
| 54 | Motion and haptics | `5b` | `renders/24-motion-system.png` | Springs, stagger, haptic map |

## Admin — seventeen sections

All in `LawMind Admin.dc.html`, live and clickable.

| # | Section | Render | Notes |
|---|---|---|---|
| 55 | Overview | `renders/13-admin-overview.png` | — |
| 56 | Enrolment queue | `renders/16-admin-enrolment-queue.png` | — |
| 57 | Advocates | — | In the live file |
| 58 | Briefings | `renders/15-admin-platform-controls.png` | Composition blocks |
| 59 | Cause list sync | `renders/39-admin-causelist.png` | The failure mode that silently poisons briefings |
| 60 | Citation monitor | `renders/17-admin-citation-monitor.png` | — |
| 61 | Disputed citations | `renders/40-admin-disputes.png` | Outranks everything else in the admin |
| 62 | **OCR review queue** | `renders/56-admin-ocr-queue@2x.png` | Correction pairs only — we never see the photograph |
| 63 | Corpus & ingestion | — | In the live file |
| 64 | Draft templates | `renders/41-admin-templates.png` | Versioned prompts, golden-set scores |
| 65 | **LLM spend & routing** | `renders/57-admin-routing@2x.png` | Keyed by **data class**, with the blocked state |
| 66 | Subscriptions | `renders/21-admin-subscriptions.png` | — |
| 67 | Support inbox | — | In the live file |
| 68 | Push campaigns | — | In the live file |
| 69 | Platform controls | `renders/15-admin-platform-controls.png` | Kill switches |
| 70 | Data & deletion | `renders/42-admin-privacy.png` | DPDP clocks, retention, pseudonymisation coverage |
| 71 | Staff & audit | — | In the live file |
| 72 | Analytics | — | In the live file |

---

## The seven, now drawn

All seven were blocked on product decisions. Those were answered on 1 Aug 2026
and recorded in IMPLEMENTATION.md §9b.

| # | Screen | Canvas | Render | Decision |
|---|---|---|---|---|
| 73 | **Sign-in — OTP** | `11a` | `renders/58-signin-otp@2x.png` | SMS OTP to any number; enrolment verified separately |
| 74 | **Enrolment pending** | `11a` | `renders/58-signin-otp@2x.png` | Full access, quiet amber band |
| 75 | **Matter sharing** | `11b` | `renders/59-chamber-sharing@2x.png` | Per matter, by invitation, names not roles |
| 76 | **Notes — private and shared** | `11b` | `renders/59-chamber-sharing@2x.png` | Private by default, shareable per note |
| 77 | **Shared briefing — junior view** | `11b` | `renders/59-chamber-sharing@2x.png` | Names whose matter it is; instruction above the record |
| 78 | **Citator alerts — in the briefing** | `11c` | `renders/60-citator-alerts@2x.png` | Batched nightly, four triggers |
| 79 | **Citator alert — the one push** | `11c` | `renders/60-citator-alerts@2x.png` | Only when it affects tomorrow. Danger tint, never gilt |
| 80 | **Alert settings** | `11c` | `renders/60-citator-alerts@2x.png` | Filed-draft trigger cannot be disabled |
| 81 | **Draft — paragraph editing** | `11d` | `renders/61-draft-editing@2x.png` | Citations locked; neighbours at 34% |
| 82 | **Draft — export sheet** | `11d` | `renders/61-draft-editing@2x.png` | `.docx` default; the mark travels |
| 83 | **Judgment — reading view** | `11e` | `renders/62-judgment-reading@2x.png` | Anchors, highlight, save to matter |
| 84 | **Judgment — reading sheet** | `11e` | `renders/62-judgment-reading@2x.png` | Size as words-per-screen, structure, progress |
| 85 | **Judgment — in-text search** | `11e` | `renders/62-judgment-reading@2x.png` | Jumps between paragraphs, not scroll positions |
| 86 | **Search filters — expanded** | `11f` | `renders/63-search-filters@2x.png` | Five sections; judge and reporter dropped |
| 87 | **Filtered results** | `11f` | `renders/63-search-filters@2x.png` | Hidden results are named, never silent |

## Deliberately not built

| Item | Why |
|---|---|
| **Golden renders for six admin sections** | Advocates, Corpus, Support, Push, Staff and Analytics are built and clickable in `LawMind Admin.dc.html`. The live file is the reference (§9b item 15) |
| **Chamber-wide sharing switch** | Sharing is per matter by design. A chamber of two to five people does not need an org chart (§9b item 3) |
| **Subject-following alerts** | An alert that does not touch the advocate's own matters is engagement, not preparation (§9b item 7) |
| **Rich in-app text editing** | Paragraph-level only. Word is where documents are finished (§9b items 9, 11) |
| **Judge and reporter filters** | A judge filter is a research tool; reporter choice is a citation-format concern (§9b item 13) |
| **Dark mode** | v2, deliberately. Advocates work in daylight (§9.10) |
| **Sound** | Never. The app opens in courtrooms (§9.9) |
