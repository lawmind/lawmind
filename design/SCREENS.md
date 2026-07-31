# LAWMIND — SCREEN INVENTORY

Build order matches sprint order. CX1 scaffolds navigation for all in S0.

> **Reconciled 31 July 2026 against the refined bundle** (`LawMind mobile app
> design`). Authority is `design/screens/` — three `.dc.html` canvases (60 options)
> and `design/screens/renders/`. This list keeps its original numbering so existing cross-references
> stay valid; each entry carries its design status and where to find it.
>
> `✅` drawn · `⚠️` partly drawn · `❌ NOT YET DESIGNED`
>
> **Render authority: renders 30–43 are current.** 00–29 are superseded v1/v2 —
> layout often still valid, colour and serif are not. Where a screen was redrawn,
> the current canvas id is given first and the v1 id marked `(v1)`.
>
> The designs were drawn against a 28-item version of this list (kept at
> `design/screens/uploads/SCREENS.md`); items 12, 21–23, 25, 30 and 33 below were
> added afterwards.

## Auth and onboarding — S5
1. ✅ Splash / sign-in — email magic link · `2b`, `1w` (v1) ·
   `design/screens/renders/18-splash-signin.png` *(layout current)*
2. ✅ Magic link sent · `1w`
3. ✅ Onboarding: identity — name, phone, bar enrolment (skippable) · `1x` ·
   `design/screens/renders/10-onboarding.png` *(layout current)*
4. ✅ Onboarding: language — English or Hindi · `1x`
5. ✅ Onboarding: first matter — optional, seeds the empty state · `1x`

## Core — tab bar, 4 tabs
6. ✅ **Today** — hearings next 7 days, tonight's briefing, quick search ·
   `6a` **(current — the direction is now decided)**; `1b` `1c` `1d` are the v1
   directions, `1e` the empty + first-run states ·
   `design/screens/renders/31-today@2x.png`
7. ✅ **Search** — query, filters, language toggle · `1i`
8. ✅ **Matters** — active matters list · `1t`
9. ✅ **Drafts** — type picker and recent drafts · `1o`

## Search — S2
10. ✅ Search results — mixed list carrying all five badge states · `8a`,
    `1j` (v1); skeleton · no results · Hindi results `1l` ·
    `design/screens/renders/33-search-mixed-list@2x.png`
11. ✅ Judgment detail — holding, operative paragraph, full text, overruled banner ·
    `1m` `1n`; all three overruled states `3e` ·
    `design/screens/renders/19-overruled-three-states.png` *(layout current)*
12. ❌ **NOT YET DESIGNED** — Unverified citation detail: what we found, why we
    could not confirm, option to confirm via eCourts.
    `design/screens/IMPLEMENTATION.md` §5 maps this to canvas id `1aa`, **which
    does not exist** — the canvas has 60 options and none is `1aa`. Unchanged from
    the previous bundle. The `unverified` badge state and its disclosure sentence
    *are* fully specified (§Badge) and drawn in `7a`–`7d`.

## Matters — S3
13. ✅ Matter detail — hearing timeline, documents, notes, next date · `1u` ·
    `design/screens/renders/09-matter-detail.png` *(v1 — layout only)*
14. ✅ Add matter — CNR lookup and manual paths · `1v`
15. ✅ Add event — hearing outcome, order text, notes · `1v` (sheet)

## Briefing — S3, the wedge
16. ✅ Briefing view — last order, pending applications, relevant case law, checklist ·
    `8b` **(current — paper, not the dark takeover)**; `1g` (dark takeover) and
    `1h` (memo) are **retired** · `design/screens/renders/34-briefing@2x.png`
17. ✅ Briefing push notification → opens 16 · `1f` (lock screen)

## Drafting — S4
18. ✅ Document type picker — 10 types, grouped criminal/civil · `1o`
19. ✅ Draft input form — structured per type, language toggle · `1p`
20. ✅ Draft output — text, inline citation stamps, edit, AI mark, export ·
    `8c` **(current)**, Hindi `9a`; `1q` `1r` `1s` are v1 ·
    `design/screens/renders/35-draft-output@2x.png`,
    `design/screens/renders/36-hindi-parity@2x.png`
    The AI mark is a **header band**; the diagonal watermark and hatched margin are
    retired (§8b item 7).

## OCR intake — S4
21. ❌ **NOT YET DESIGNED** — Capture / upload: camera, file picker
22. ❌ **NOT YET DESIGNED** — OCR processing: progress, honest about async
23. ❌ **NOT YET DESIGNED** — Field confirmation: extracted fields,
    low-confidence flagged, advocate corrects before save. Nothing writes until
    confirmed

> No OCR surface exists anywhere in `design/screens/` — verified across all three
> canvases. Consistent with **OD-7** (OCR engine undecided, blocks scanned intake).

## Account — S5
24. ✅ Profile — details, enrolment status, language · `1y` (pending-enrolment state)
25. ❌ **NOT YET DESIGNED** — Subscription: tiers, current plan, upgrade.
    §5 maps the paywall/tiers screen to `1aa`, which does not exist. The *policy*
    is settled and drawn as a decision card in `3d` ("paywall never blocks on a
    hearing day"), and prices appear in prose only
    (`design/screens/CLAUDE_CODE_BRIEF.md`: Starter ₹799 · Professional ₹1,999 ·
    Expert ₹3,499 · Firm = contact us). No purchase screen is drawn.
26. ✅ Settings — notifications, data, privacy, sign out · `1y` ·
    `design/screens/renders/20-settings-switches.png` *(v1 — layout only)*

## System states — every screen
27. ✅ Empty states — no matters, no results, no drafts · `9b` **(current)**;
    `1e` `1l` `1z` (v1) · `design/screens/renders/37-honest-states@2x.png`
28. ✅ Offline — cached matters and briefings readable · `9b`, `1z` (v1) ·
    `design/screens/renders/37-honest-states@2x.png`
29. ✅ AI unavailable — plain, honest, never a stale cached answer · `9b`, `1z` (v1) ·
    `design/screens/renders/37-honest-states@2x.png`
30. ✅ **Now designed** — Privacy disclosure: "what leaves this phone", what is
    pseudonymised, what we cannot guarantee · `9b` ·
    `design/screens/renders/37-honest-states@2x.png`

## Admin — web, S6
Drawn as a 1440px desktop app with an ink sidebar and **17 sections**, all
interactive in `design/screens/LawMind Admin.dc.html`. Items 31–34 were the
original proposal; 35–48 are drawn but were never listed.

> **The admin still runs the v2 palette** (dark sidebar, oxblood accents) and does
> not yet match the refined system. Per §8a it consumes the same `tokens.ts` as the
> app — density may differ, values may not — but aligning it is "a separate pass,
> not started". **Build from its layout, not its colour.**

31. ✅ Admin dashboard — LLM spend by day/feature/model/data-class · `1ab` ·
    `design/screens/renders/14-admin-llm-spend.png`
    ⚠️ Drawn as **LLM spend & routing**, with live model routing per *feature*.
    **No data-class dimension is drawn** — see Open questions.
32. ✅ Citation monitor — verification states over time, failure and silent-drop rates ·
    `1ac` · `design/screens/renders/17-admin-citation-monitor.png`
33. ❌ **NOT YET DESIGNED** — OCR review queue: low-confidence jobs.
    No such section exists among the 17.
34. ✅ User management — enrolment verification queue · `1ad` ·
    `design/screens/renders/16-admin-enrolment-queue.png` (drawn as **Enrolment queue**)

### Drawn but never listed — admin sections 35–48
35. ✅ Overview — KPIs, 14-day product health, "needs a human today", live activity ·
    `design/screens/renders/13-admin-overview.png`
36. ✅ Advocates — filterable table: enrolment state, plan, matters, searches, last seen
37. ✅ Briefings — nightly run table, failure retry, per-block composition toggles
38. ✅ Corpus & ingestion — sources with sync lag and health, coverage by court, reindex
39. ✅ Subscriptions — plans and prices, coupons with kill toggles, payments ·
    `design/screens/renders/21-admin-subscriptions.png`
40. ✅ Support inbox — tickets with advocate context attached, quick remedies
41. ✅ Push campaigns — audience picker, composer, lock-screen preview, history
42. ✅ Platform controls — maintenance mode, 5 kill switches, feature flags with
    percentage rollout · `design/screens/renders/15-admin-platform-controls.png`
43. ✅ Staff & audit — roles/permissions and an append-only audit ledger
44. ✅ Analytics — cohort retention, feature usage, activation metric

**Added in this bundle — four sections, each closing a failure mode the app cannot
recover from on its own:**

45. ✅ **Cause list sync** — per-court pull time, item count, status. A parser that
    silently returns an empty list is worse than an outage, because briefings still
    go out with stale dates. Escalation: retry once → mark briefings "dates not
    confirmed today" → notify affected advocates. *We never present an unconfirmed
    listing as confirmed* · `design/screens/renders/39-admin-causelist.png`
46. ✅ **Disputed citations** — the trust feedback loop. Upholding a report writes a
    correction to the corpus, re-runs verification for everyone who saved that
    citation, and notifies anyone who filed it in a draft. Tracks a
    **false-verified rate**, target zero. Outranks everything else in the admin ·
    `design/screens/renders/40-admin-disputes.png`
47. ✅ **Draft templates** — 10 types, each prompt versioned and scored against a
    200-item golden set. Gates: court-format compliance, no invented citations, no
    overruled authority cited as good law, AI mark present, Hindi parity. Nothing
    ships below 90 without a founder override, written to the audit ledger ·
    `design/screens/renders/41-admin-templates.png`
48. ✅ **Data & deletion** — DPDP obligations with a visible clock per request
    (export, correction, erasure); states retention plainly; tracks
    **pseudonymisation coverage (99.2%)**, the number behind the app's privacy
    disclosure · `design/screens/renders/42-admin-privacy.png`

Every privileged admin action writes to the audit ledger with actor, time and
before/after.

---

## Drawn but not product screens — system references
- Refined design system · `6c` (current), `1a` (v1) ·
  `design/screens/renders/30-system-refined@2x.png`
- Serif comparison — three faces, chosen by eye · `6b`
- Verification badge — three approaches × five states, plus what ships · `7a` `7b`
  `7c` `7d`; `1k` is the retired v1 A–D set ·
  `design/screens/renders/32-badge-family@3x.png`,
  `design/screens/renders/43-badge-greyscale.png` (the colour-removed shape proof)
- Stress tests — direct sunlight and messy real Indian case data · `9c` ·
  `design/screens/renders/38-stress-sunlight@2x.png`
- Logo, app icons · `3a` (current), `2a` ·
  `design/screens/renders/00-logo-real-mark.png`
- AI thinking animation states · `3b`
- Motion and haptics spec · `5b` (current), `2c` (v1)
- The gilt rule — permitted placements · `3c`
- Palette explorations: oxblood `4a` (**settled**), ink+gilt `4b`, bench green `4c`,
  aubergine `4d`
- The obsidian/dark system · `5a` `5c` `5d` `5e` `5f` — **retired**, superseded by
  the paper system
- The settled decisions · `3d`
- Tappable prototype of the four core flows ·
  `design/screens/LawMind Prototype.dc.html`

## Open questions raised by the designs
1. **Items 12 and 25 point at canvas id `1aa`, which does not exist** — and did not
   exist in the previous bundle either. Were the unverified-citation detail and the
   paywall/tiers screen drawn and dropped, or never drawn?
2. **Admin LLM routing is per feature, not per data-class**, while
   `docs/API_CONTRACTS.md` returns `byDataClass` and **OD-6** turns on routing
   sensitive-class data to a specific provider.
3. **Hindi is drawn at full parity** (`9a`, `36-hindi-parity@2x`), which presumes
   **OD-5** (Hindi launch scope) resolved in favour of shipping search *and*
   drafting in S4.
4. **`docs/SCHEMA_TRUTH.md` cannot express the badge.** It has `is_overruled bool`,
   but the shipped badge has five states and overruled has three sub-states with
   different behaviour each.
5. **The four new admin sections have no API contract.** Cause list sync, disputed
   citations, draft templates and data & deletion all imply endpoints and tables
   that `docs/API_CONTRACTS.md` and `docs/SCHEMA_TRUTH.md` do not carry.
