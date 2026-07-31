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
Three-tier verification, five citation states, overruled always flagged.
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

## Out of scope for v1
Tamil and Bengali. Mock trial simulator. Team seats. Contract review.
Multi-agent case analysis (roadmap — `docs/ROADMAP_MULTI_AGENT.md`).

## Success — day 90
Rs.1L+ MRR. 10+ paying advocates. 15 of 20 beta users opening 3+ times in their
final beta week. **Zero citation failures reaching a user.**

## Pricing
Starter Rs.799 · Professional Rs.1,999 · Expert Rs.3,499 · Firm 10-seat
Rs.15,000 · Enterprise Rs.75,000+.
Solo tiers through store IAP. Firm and Enterprise invoiced via Razorpay,
activated by redemption code — multi-seat organisational licensing sits outside
the IAP requirement. Enrol in Apple Small Business Program day one (15% not 30%).
