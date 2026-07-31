# LAWMIND — SCREEN INVENTORY

Build order matches sprint order. CX1 scaffolds navigation for all in S0.

> **Reconciled against the designs on 31 July 2026.** Authority is
> `design/screens/` — the three `.dc.html` canvases and `design/screens/renders/`. This list keeps
> its original numbering so existing cross-references stay valid; each entry now
> carries its design status and where to find it.
>
> `✅` drawn · `⚠️` partly drawn · `❌ NOT YET DESIGNED`
>
> Canvas ids (`1b`, `3e`, …) are the option badges in
> `design/screens/LawMind Screens.dc.html`. The designs were drawn against a
> 28-item version of this list (kept at `design/screens/uploads/SCREENS.md`);
> items 12, 21–23, 30 and 33 below were added afterwards and have no drawings.

## Auth and onboarding — S5
1. ✅ Splash / sign-in — email magic link · `1w` `2b` · `design/screens/renders/03-splash-signin.png`,
   `design/screens/renders/18-splash-signin.png`
2. ✅ Magic link sent · `1w`
3. ✅ Onboarding: identity — name, phone, bar enrolment (skippable) · `1x` ·
   `design/screens/renders/10-onboarding.png`
4. ✅ Onboarding: language — English or Hindi · `1x`
5. ✅ Onboarding: first matter — optional, seeds the empty state · `1x`

## Core — tab bar, 4 tabs
6. ✅ **Today** — hearings next 7 days, tonight's briefing, quick search ·
   three directions drawn: week-grouped `1b`, briefing-ready `1c`, editorial `1d`;
   empty + first-run `1e`; motion pass `5c` ·
   `design/screens/renders/04-today-briefing-ready.png`, `design/screens/renders/25-paper-today.png`
   **Direction not yet chosen — see Open questions.**
7. ✅ **Search** — query, filters, results · `1i` · `design/screens/renders/27-paper-search.png`
8. ✅ **Matters** — active matters list · `1t`
9. ✅ **Drafts** — type picker and recent drafts · `1o`

## Search — S2
10. ✅ Search results — 5 judgment cards, verification state visible · `1j`;
    skeleton · no results · Hindi results `1l`; motion pass `5e` ·
    `design/screens/renders/06-search-results.png`
11. ✅ Judgment detail — holding, operative paragraph, full text, overruled banner ·
    standard `1m`, overruled `1n`, all three overruled states `3e` ·
    `design/screens/renders/07-judgment-overruled.png`, `design/screens/renders/19-overruled-three-states.png`
12. ❌ **NOT YET DESIGNED** — Unverified citation detail: what we found, why we
    could not confirm, option to confirm via eCourts.
    `design/screens/IMPLEMENTATION.md` §5 maps this to canvas id `1aa`, **which does not exist in
    the canvas.** Badge treatments only are drawn (`1k`).

## Matters — S3
13. ✅ Matter detail — hearing timeline, documents, notes, next date · `1u` ·
    `design/screens/renders/09-matter-detail.png`
14. ✅ Add matter — CNR lookup and manual paths · `1v`
15. ✅ Add event — hearing outcome, order text, notes · `1v` (sheet)

## Briefing — S3, the wedge
16. ✅ Briefing view — last order, pending applications, relevant case law, checklist ·
    full-screen takeover `1g` (settled), memo alternative `1h` (dropped),
    motion pass `5d` · `design/screens/renders/05-briefing-takeover.png`,
    `design/screens/renders/26-paper-briefing.png`
17. ✅ Briefing push notification → opens 16 · `1f` (lock screen)

## Drafting — S4
18. ✅ Document type picker — 10 types, grouped criminal/civil · `1o`
19. ✅ Draft input form — structured per type, language toggle · `1p`
20. ✅ Draft output — text, inline citations with state, edit, watermark, export ·
    `1q`; AI-mark alternatives + deliberate removal sheet `1r`; Hindi output `1s`;
    confirm ritual `5f` · `design/screens/renders/08-draft-output.png`,
    `design/screens/renders/28-paper-draft-ritual.png`

## OCR intake — S4
21. ❌ **NOT YET DESIGNED** — Capture / upload: camera, file picker
22. ❌ **NOT YET DESIGNED** — OCR processing: progress, honest about async
23. ❌ **NOT YET DESIGNED** — Field confirmation: extracted fields,
    low-confidence flagged, advocate corrects before save. Nothing writes until
    confirmed

> No OCR surface is drawn anywhere in `design/screens/`. Consistent with **OD-7**
> (OCR engine undecided, blocks scanned intake).

## Account — S5
24. ✅ Profile — details, enrolment status, language · `1y` (pending-enrolment state)
25. ❌ **NOT YET DESIGNED** — Subscription: tiers, current plan, upgrade.
    `design/screens/IMPLEMENTATION.md` §5 maps the paywall/tiers screen to `1aa`, **which does not
    exist.** Prices are specified in prose only (`design/screens/CLAUDE_CODE_BRIEF.md` Phase 5:
    Starter ₹799 · Professional ₹1,999 · Expert ₹3,499 · Firm = contact us).
    The *admin* subscriptions section is drawn — see 35 below.
26. ✅ Settings — notifications, data, privacy disclosure, sign out · `1y` ·
    `design/screens/renders/20-settings-switches.png`

## System states — every screen
27. ✅ Empty states — no matters, no results, no drafts. Each says what to do next ·
    `1e` (no hearings, first run), `1l` (no results), `1z`
28. ✅ Offline — cached matters and briefings readable. Real requirement, not edge ·
    `1z` · `design/screens/renders/11-states-offline-ai-down.png`
29. ✅ AI unavailable — plain, honest, never a stale cached answer · `1z` ·
    `design/screens/renders/11-states-offline-ai-down.png`
30. ❌ **NOT YET DESIGNED** — Privacy disclosure: what leaves the device, what is
    pseudonymised, what we cannot guarantee

## Admin — web, S6
The admin desk is drawn as a 1440px desktop app with an ink sidebar and
**13 sections**, all interactive in `design/screens/LawMind Admin.dc.html`.
Items 31–34 were the original proposal; 35–44 are drawn but were never listed.

31. ✅ Admin dashboard — LLM spend by day/feature/model/data-class · `1ab` ·
    `design/screens/renders/16-admin-llm-spend-routing.png`
    ⚠️ Drawn as **LLM spend & routing**, with live model routing per *feature*.
    **No data-class dimension is drawn** — see Open questions.
32. ✅ Citation monitor — verification states over time, failure and silent-drop rates ·
    `1ac` · `design/screens/renders/17-admin-citation-monitor.png`
33. ❌ **NOT YET DESIGNED** — OCR review queue: low-confidence jobs.
    No such section exists in the admin canvas.
34. ✅ User management — enrolment verification queue · `1ad` ·
    `design/screens/renders/14-admin-enrolment-queue.png` (drawn as **Enrolment queue**)

### Drawn but never listed — admin sections 35–44
35. ✅ Overview — KPIs, 14-day product health, "needs a human today", live activity ·
    `design/screens/renders/13-admin-overview.png`
36. ✅ Advocates — filterable table: enrolment state, plan, matters, searches, last seen
37. ✅ Briefings — nightly run table, failure retry, per-block composition toggles
38. ✅ Corpus & ingestion — sources with sync lag and health, coverage by court,
    full reindex trigger
39. ✅ Subscriptions — plans and prices, coupons with kill toggles, payments ·
    `design/screens/renders/21-admin-subscriptions.png`,
    `design/screens/renders/21-admin-subscriptions-coupons.png`
40. ✅ Support inbox — tickets with advocate context attached, quick remedies
41. ✅ Push campaigns — audience picker, composer, lock-screen preview, history
42. ✅ Platform controls — maintenance mode, 5 kill switches, feature flags with
    percentage rollout · `design/screens/renders/15-admin-platform-controls.png`
43. ✅ Staff & audit — roles/permissions and an append-only audit ledger
44. ✅ Analytics — cohort retention grid, feature usage, activation metric
    (two briefings opened in week one)

Every privileged admin action writes to the audit ledger with actor, time and
before/after.

---

## Drawn but not product screens — system references
Not screens; they are the specification surfaces the build checks itself against.

- Design system / tokens · `1a`, `5a` · `design/screens/renders/02-design-system.png` (retired
  oxblood), `design/screens/renders/23-paper-system.png` (current)
- Logo, app icons, gilt palette · `2a`, `3a` · `design/screens/renders/00-logo-system.png`,
  `design/screens/renders/00-logo-real-mark.png`
- AI thinking animation states · `3b` · `design/screens/renders/01-ai-animation-states.png`
- Motion and haptics spec · `2c`, `5b` · `design/screens/renders/01-motion-haptics-spec.png`,
  `design/screens/renders/24-motion-system.png`
- The gold rule — the four placements · `3c` · `design/screens/renders/02-gold-rule.png`
- Verification badge variants A–D, D settled · `1k` ·
  `design/screens/renders/12-verification-badges.png`, `design/screens/renders/12-verification-badge-d.png`
- Palette explorations: oxblood `4a`, ink+gilt `4b` (settled), bench green `4c`,
  aubergine `4d` · `design/screens/renders/22-palette-oxblood.png`
- The eight settled decisions · `3d` · `design/screens/renders/03-decisions-settled.png`
- Tappable prototype of the four core flows ·
  `design/screens/LawMind Prototype.dc.html`

## Open questions raised by the designs
1. **Today has three drawn directions** (`1b` week-grouped, `1c` briefing-ready,
   `1d` editorial) and no recorded choice. Which ships?
2. **Items 12 and 25 point at canvas id `1aa`, which does not exist.** Were the
   unverified-citation detail and the paywall/tiers screen drawn and dropped, or
   never drawn?
3. **Admin LLM routing is per feature, not per data-class**, while
   `docs/API_CONTRACTS.md` returns `byDataClass` and **OD-6** turns on routing
   sensitive-class data to a specific provider. See `docs/OPEN_DECISIONS.md`.
4. **Hindi drafting is fully drawn** (`1s`), which presumes **OD-5** (Hindi launch
   scope) resolved in favour of shipping search *and* drafting in S4.
