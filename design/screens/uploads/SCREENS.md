# LAWMIND — SCREEN INVENTORY

Build order matches sprint order. CX1 scaffolds navigation for all of these in
S0; screens fill in as their sprint lands.

## Auth and onboarding — S5
1. **Splash / sign-in** — email entry, magic link
2. **Magic link sent** — check-your-email state
3. **Onboarding 1: identity** — name, phone, bar enrolment number (skippable)
4. **Onboarding 2: language** — English or Hindi, changeable later
5. **Onboarding 3: first matter** — optional, seeds the empty state

## Core — tab bar, 4 tabs
6. **Today** (tab 1) — hearings in the next 7 days, tonight's briefing if ready,
   quick search entry
7. **Search** (tab 2) — query input, filters, results
8. **Matters** (tab 3) — list of active matters
9. **Drafts** (tab 4) — document type picker and recent drafts

## Search — S2
10. **Search results** — 5 judgment cards, verification state visible
11. **Judgment detail** — holding, operative paragraph, full text, overruled
    banner if applicable, add-to-matter action

## Matters — S3
12. **Matter detail** — hearing timeline, documents, notes, next date
13. **Add matter** — CNR lookup path and manual path
14. **Add event** — hearing outcome, order text, notes

## Briefing — S3, the wedge
15. **Briefing view** — last order, pending applications, relevant case law,
    preparation checklist
16. **Briefing notification** — push, opens straight to 15

## Drafting — S4
17. **Document type picker** — 10 types, grouped criminal/civil
18. **Draft input form** — structured fields per type, language toggle
19. **Draft output** — generated text, inline citations with verification state,
    edit, watermark, export

## Account — S5
20. **Profile** — details, enrolment status, language
21. **Subscription** — tiers, current plan, upgrade
22. **Settings** — notifications, data, sign out

## System states — every screen needs these
23. **Empty states** — no matters, no results, no drafts. Each states what to do
    next, never just "nothing here"
24. **Offline** — court buildings have poor signal. Cached matters and briefings
    must remain readable offline. This is a real requirement, not an edge case
25. **AI unavailable** — plain honest state, never a stale cached answer

## Admin — web, S6
26. **Admin dashboard** — LLM spend by day/feature/model
27. **Citation monitor** — verification failure rate over time, failing queries
28. **User management** — enrolment verification queue
