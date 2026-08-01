# LAWMIND — PRD

## Problem
1.7M advocates in India. 45M pending cases. Preparing one hearing costs 2–4
hours: hunting judgments, re-reading the case file, drafting from Word templates.
Nothing they use was built for a phone, and almost nothing speaks Hindi properly.

## User
Practising advocate, criminal and civil litigation, district court and High Court.
Not technical. Works on a phone. Often works in Hindi. Pays for themselves.

## Features — priority order

### F1. Court decision search, verified citations
Plain-language or Hindi query. Five judgments with title, citation, court, date,
two-sentence holding, operative paragraph. Filters: court, date, case type.
Three-tier verification. Each citation carries three independent fields —
`verification_state` · `verified_by_source` · `overruled_status` — from which the
five badge states are derived. Overruled always flagged, in three states.
`docs/CITATION_HARNESS.md`.

### F2. 24-hour hearing briefing — the wedge
Night before a listed hearing: last order summary, pending applications, relevant
case law, preparation checklist. Delivered by push. Readable offline.
No Indian competitor has this.

### F3. Drafting, English and Hindi
Ten types: bail, anticipatory bail, plaint, written statement, legal notice,
notice reply, affidavit, vakalatnama, writ petition, RTI. Court-format templates
constrain structure; the model fills content.

### F4. Matter workspace
Per-case history: drafts, research, briefings, notes, hearing timeline. Six
months of accumulated work is the switching cost.

### F5. Scanned document intake
Photograph or upload a court order; OCR extracts court, case number, parties,
date, body. Advocate confirms before saving. Most district court orders are
scans — without this the product is unusable where most litigation happens.

---

# Scope — revised 1 Aug 2026

**The goal is scope leadership, not minimum viability.** Target: the most
data-rich, most useful legal application for Indian advocates.

**The benchmark is Law4u** — 1M+ judgments, 701+ Acts, 11,000+ drafts, 18
languages, a Legal AI beta, advocate finder, law dictionary. **We must match its
library and beat it on the daily loop.**

F1–F5 above remain the spine. Everything below is additive.

## Tier A — library parity
Table stakes. We cannot be smaller than Law4u on a feature-comparison page.

| Feature | Notes |
|---|---|
| Bare acts library | 700+ Central and State Acts, full text, searchable. BNS / BNSS / BSA first-class with IPC↔BNS mapping |
| Judgment corpus at scale | Target **1M+**. Beyond the 5-year SCI slice — all 25 High Courts and available District data |
| Draft template library | The 10 AI-generated types **plus** a static library of standard formats |
| Legal dictionary | Terms, Latin maxims, procedural vocabulary. Cheap, and expected |
| Court rules and practice directions | Supreme Court and per-High-Court |
| Limitation calculator | Cause-of-action date + relief → limitation period and deadline. **Missing a limitation period is malpractice — the highest-anxiety calculation an advocate makes** |
| Court fee calculator | Per state, per suit value |

## Tier B — the daily loop
This is the addiction. Why the app gets opened every morning.

| Feature | Why it drives daily opening |
|---|---|
| **Hearing briefing** | The existing wedge. Nightly. Unchanged |
| **Daily cause list** | Every matter listed today, across all courts, one screen. The first thing an advocate checks each morning |
| **Client update sharing** | One tap to share matter status as a clean summary over WhatsApp. **This is the viral loop** — every share carries our name to a client and to opposing counsel |
| **Adjournment capture** | Next date given orally in court, entered in three taps while still in the courtroom |
| **Limitation and deadline alerts** | Tied into the same evening briefing rhythm |
| **Fee and appearance log** | What was billed, what was appeared in. Advocates track this on paper today |

## Sequencing — Tier B ships before Tier A

**The loop creates the habit; the library only prevents a feature-comparison
loss.** An advocate does not open an app daily for a bare acts library. They open
it to find out where they have to be this morning, and what happened to the matter
they argued last week.

Building Tier A first would produce a product that wins a comparison table and
loses on retention — which is the more expensive failure, because retention is
what the matter workspace moat is made of.

## Geography — India only in v1

**Thailand is out.** It is a civil-law jurisdiction: precedent is not binding, the
Supreme Court is not bound by its own decisions, and pleadings are in Thai. Our
citation-verification moat is a **common-law** product and does not transfer.
Revisit after **₹1Cr ARR**.

The i18n architecture stays multi-language so adding a locale later is a
migration, not a rewrite — `docs/SCHEMA_TRUTH.md` names the three columns a new
locale touches.

## Out of scope for v1
Tamil and Bengali. Mock trial simulator. Team seats. Contract review.
Multi-agent case analysis (roadmap — `docs/ROADMAP_MULTI_AGENT.md`).

## Success — day 90
Rs.1L+ MRR. 10+ paying advocates. 15 of 20 beta users opening 3+ times in their
final beta week. **Zero citation failures reaching a user.**

## Pricing

Shown in the app, monthly:

| Tier | Price | Purchase |
|---|---|---|
| Starter | ₹799 | store IAP |
| Professional | ₹1,999 | store IAP |
| Expert | ₹3,499 | store IAP |
| Firm | **contact us** — no buy button | invoiced off-app |
| Enterprise | **contact us** — no buy button | invoiced off-app |

Solo tiers go through store IAP. **Firm and Enterprise show no price and no buy
button in the app** — they are contact-us, invoiced off-app via Razorpay and
activated by redemption code. Multi-seat organisational licensing sits outside the
IAP requirement, which is what makes off-app invoicing permissible.

Indicative figures for those two, held internally and not displayed: Firm 10-seat
≈ Rs.15,000 · Enterprise Rs.75,000+.

Enrol in Apple Small Business Program day one (15% not 30%).
The paywall **never blocks on a hearing day** — on a day with a listed hearing the
search limit becomes advisory rather than hard, and the limit is still displayed.
Billing terms for Android remain subject to **OD-3**.
