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

**Renamed 2 Aug 2026 to match the live site** — `design/screens/IMPLEMENTATION.md`
§9g. Starter / Professional are retired: the names are advocate language, not SaaS
language.

| Tier | Price | Unit | Purchase |
|---|---|---|---|
| **Practice** | ₹799 | One advocate, starting out | store IAP |
| **Chamber** | ₹1,999 | One advocate, full practice | store IAP |
| **Expert** | ₹3,499 | One advocate, heavy volume | store IAP |
| **Firm** | **Talk to us** — no price, no button | 5–10 advocates, shared matters | invoiced off-app |
| **Enterprise** | Off-app, not shown in-app at all | Roadmap | invoiced off-app |

The first three are **one advocate at three volumes.** Firm is the first tier where
the *unit* changes, which is why it is also the first with no price.

**The Chamber naming collision, resolved: Chamber stays the SOLO tier; the
multi-seat tier is Firm.** Two reasons. The site is live with Chamber at ₹1,999,
and renaming a published tier costs more than naming an unbuilt one. And the
distinction is real in Indian practice — a solo advocate has *their* chamber;
*firm* is what several advocates practising together call themselves. This does not
contradict PD-3: sharing is still **per matter**, and a chamber of two to five
people is still a list of names rather than an org chart.

**Firm and Enterprise may never show an in-app purchase control.** This is an App
Store rejection under **guideline 3.1.1**, not merely a pricing preference —
and **a link to a web checkout page is the same violation.** "Talk to us" opens a
**mail composer**. Do not add a price, a button, or a URL to either row. Multi-seat
organisational licensing sits outside the IAP requirement, which is what makes
off-app invoicing permissible at all.

Indicative figures for those two, held internally and not displayed: Firm 10-seat
≈ Rs.15,000 · Enterprise Rs.75,000+.

Enrol in Apple Small Business Program day one (15% not 30%).
The paywall **never blocks on a hearing day** — on a day with a listed hearing the
search limit becomes advisory rather than hard, and the limit is still displayed.
**OD-3 resolved 2 Aug 2026: launch on standard store billing** (Play 15%, Apple
15% via the Small Business Program — enrol day one). India alternative billing at
11% is deferred to **OD-10**, revisited at 1,000 paying users. Firm and Enterprise
stay invoiced off-app through Razorpay at ~2%, which is where the margin is.

### The rationale — we are a switch, not a new spend

A solo advocate **already allocates ₹30,000–50,000 a year** to research —
₹2,500–4,200 a month. **Expert at ₹3,499 sits inside that budget, not on top of
it.** SCC Online at roughly ₹5,000/month is the number to anchor against.

That changes the sales question from *"is this worth ₹3,499?"* to *"is this better
than what you already pay ₹5,000 for?"* — a comparison we win on the daily loop
and lose on headnotes, which is exactly why we never lead with corpus size.

Pricing is **not** set by cost-plus or by undercutting the free chatbots. It is
set by the budget line we are displacing. `docs/COMPETITIVE.md`.

### Launch — free for 90 days, capped at 5,000

> **Only the 50% founding rate is publishable today.** "Three months free" stays
> off the paywall until briefing cost per user is computed from real beta usage —
> it is an unbounded commitment against an unknown number of users, where the 50%
> rate and the 5,000 cap are both bounded. `docs/COMPETITIVE.md` carries the
> condition; PD-14 carries the decision.

All tiers free for the first 90 days after launch, for anyone signing up in that
window. **Firm and Enterprise excluded** — those are invoiced sales.

Structured as a moat, not a discount:

- **Granted per user, not per period.** The free cohort keeps a permanent
  **"founding advocate" rate at 50%** afterwards, so the cohort converts instead of
  churning.
- **The free window fills the matter workspace.** Ninety days of accumulated
  matters, briefings and drafts is switching cost no competitor can undo. **This is
  a data-moat play, not a marketing spend.**
- **Capped at the first 5,000 advocates** — urgency, and a hard bound on LLM cost.

⚠️ **Cost exposure is modelled but not computed** — `docs/COMPETITIVE.md` carries
the formula with its inputs marked `UNKNOWN`. Briefings dominate the cost, not
searches, and briefings-per-user is unmeasured. **Do not commit to 90 days until
that line is computed from real beta usage.**
