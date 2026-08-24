# Premium commercial decision package — Model A vs B vs C

**23-24 Aug 2026, NEW3.** This is the required NEW3-5 deliverable: **a
comparison, not a decision.** `PRODUCT_DECISIONS.md` PD-13 already settled
tier *names and prices* (Practice/Chamber/Expert, ₹799/₹1,999/₹3,499) — that
is not reopened here. What is compared is the *revenue-model shape* around
those tiers, per the plan's exact framing:

- **Model A** — recurring subscription only.
- **Model B** — recurring subscription **+ a one-off Hearing Pack credit**.
- **Model C** — one-off only, as a control.

This document does not duplicate `PREMIUM_GROWTH_RESEARCH_2026.md`
(Tinder/Hinge/Bumble/Duolingo/RevenueCat/Apple/Google mechanics) or
`PREMIUM_GROWTH_SPEC_V1.md` (the "Likes You"-analog previews, hypotheses
A/B/C about *product structure* — free/Pro/à-la-carte lanes — a different
axis from the revenue-model question this document answers). It adds the one
thing those two didn't cover: **India-specific payer economics**, sourced
this session, and **this round's own feature-readiness finding**, which is a
hard input the prior research pass didn't have yet.

## 1. The new evidence this document adds

All fetched directly from the primary source this session, not carried over
from memory.

**D35 conversion is materially worse in India/SEA than the benchmarks
LawMind would naturally reach for.** RevenueCat's State of Subscription Apps
2026 (fetched directly, `revenuecat.com/state-of-subscription-apps`):
Day-35 download-to-paid conversion **median 1.4% in IN/SEA vs. 2.6% in North
America** — roughly half. *(The report itself is inconsistent about the
exact multiplier — one section frames this same comparison as "4× the
rate," which does not reconcile with 1.4% vs 2.6%; both numbers are quoted
directly and the discrepancy is the report's, not resolved here.)* **Any
projection that assumes a North American or "typical SaaS" conversion rate
for LawMind's Indian advocate base is not just optimistic, it is off by
roughly half at the point that matters most — the first 35 days.**

**Trial length has a large, monotonic effect independent of geography.**
Same report: trial-to-paid conversion is **25.5% for ≤4-day trials, 37.4%
for 5–9 days, 42.5% for 17–32 days** — longer trials convert better by
~1.7× at the median. `PREMIUM_GROWTH_SPEC_V1.md` §3 already flagged that
LawMind's ideal trial length is an unconfirmed extrapolation from adjacent
app categories; this adds the shape of the curve that extrapolation should
follow (longer, not shorter) once a real trial is run.

**Involuntary churn in India has a specific, structural cause: UPI Autopay
failure rates.** UPI Autopay (the default recurring-payment rail on Android
in India, distinct from card mandates) fails at **8–15%, versus 2–3% for
card mandates** (Razorpay, a payments processor — **VENDOR CLAIM**, not
independently corroborated against RBI/NPCI data this session, but
directionally consistent with UPI's known statelessness — each payment
authenticates independently rather than through a bank-managed mandate).
**This is a distinct problem from voluntary cancellation** and it disproportionately hits whichever LawMind tier is priced to attract advocates paying by UPI rather than card — plausibly the entry Practice tier at ₹799/mo. **Any subscription model (A or B) inherits this risk; Model C (one-off only) does not**, because a one-off purchase has no recurring mandate to fail.

**Google Play's fee structure for India is NOT changing on the same
timeline as the fee cuts LawMind's own research may have assumed apply
globally.** Confirmed directly against Google's own support page
(`support.google.com/googleplay/android-developer/answer/112622`): the
newly-announced lower tiers ("10% + 5% billing fee" for the first $1M) apply
to **EEA, UK and US starting 30 June 2026**. **India falls under "Rest of
World," unchanged until 30 September 2027**: **15% on the first $1M
annually, 30% above it**, with a 4-point reduction available only by
offering an alternative billing system (a separate integration LawMind has
not built). **The 15% figure the prior research/spec docs use for India is
correct and stays correct through the whole runway any near-term pricing
decision covers** — this is confirmation, not a correction, but it is worth
having confirmed against the live page rather than assumed, since the
adjacent US/EEA change is exactly the kind of headline that gets
over-generalised.

**RevenueCat's own cost is negligible at LawMind's likely scale, confirmed
directly against its pricing page**: free up to $2,500/month in tracked
revenue, then **1% of tracked revenue** (pre-platform-cut) above that. At
LawMind's PD-13 prices, $2,500 MTR is roughly 100–200 active Practice/Chamber
subscribers depending on mix — RevenueCat cost is not a factor in choosing
between A/B/C at anywhere near current or near-term scale, and becomes a
rounding error even well past it.

## 2. The one input that overrides the mechanics: feature readiness

**`docs/product/PREMIUM_10_MATTER_WALKTHROUGH_V1.md`, run this same round,
found a P0 in the briefing's authorities/checklist block** (reads the wrong
table, tells an advocate who saved an authority that none were saved) and
NEW1's own numbers (bus 1057-1067) put concept-level retrieval reachability
in the low tens of percent. **The Hearing Pack is, by name, a packaging of
the 24-hour briefing.** Model B and Model C both depend on the Hearing Pack
being a real, sellable unit of value *today or soon*; Model A does not.

This is not a new finding — the plan's own §1.3 already says not to
publicly market a "hearing pack that claims it automatically finds the
relevant law" — but it is now evidenced from three independent angles in
one round (this walkthrough, NEW1's reachability numbers, and the briefing
defect). **Update: LCC closed the briefing defect same-round (bus 1078),
including three sibling surfaces this walkthrough alone did not find.**
That removes one of the three angles as a live blocker. **What is left
holding Model B/C back is NEW1's retrieval numbers alone** — concept-class
reachability at or near zero — which this round's fix does not and cannot
touch, since it corrected which table a query reads, not what the corpus
can find. The conclusion is unchanged: **any model that puts revenue weight
on the Hearing Pack before NEW1's retrieval numbers materially improve is
pricing a product that does not yet do the thing its name promises** — the
paper trail is now one document shorter, not the conclusion.

## 3. Model comparison

| | **A — subscription only** | **B — subscription + Hearing Pack credit** | **C — one-off only (control)** |
|---|---|---|---|
| **Revenue durability** | Recurring, compounding — the standard SaaS shape. Involuntary churn (UPI Autopay, 8-15%) is the main leak, structural and platform-level, not fixable by product alone. | Recurring base + a second, non-recurring revenue line. Same involuntary-churn exposure as A on the subscription half. | No recurring revenue; every purchase is a fresh conversion event. Immune to involuntary churn by construction — nothing to auto-fail. |
| **What it sells today, honestly** | Automation/monitoring/workflow depth — the things §12.2 names as strong subscription candidates, none of which depend on the Hearing Pack being trustworthy. | The subscription half is honest; the Hearing Pack credit half is **not sellable yet** per §2 above — activating it now would be charging for a product whose flagship claim (a briefing you can trust) has a documented, reproduced defect. | Sells the Hearing Pack as the ENTIRE product. This is the model most exposed to §2's finding — a one-off-only model with no other revenue line has nothing to fall back on while the Hearing Pack isn't ready. |
| **App Store / Play compliance shape** | Standard subscription — Apple 3.1.2(a)/Google's "sustained value" rule are satisfied by definition (recurring access to a live, maintained corpus and continuously-updated treatment status). | Same subscription compliance as A, plus the credit must be sold as an explicit one-time product (Google) and never expire (Apple 3.1.1) — `PREMIUM_GROWTH_RESEARCH_2026.md` §"Consumable/credit semantics" already names this; the commerce spine (migrations 0077/0078, LCC bus 1051/1053) is built to satisfy both from day one. | One-off IAP only — simplest compliance shape, but a "pay once for AI legal research" framing risks reading as exactly the kind of thin-wrapper Apple's guidelines penalize, since there is no ongoing service being sold. |
| **India-specific economics** | D35 conversion at 1.4% (IN/SEA median) means subscription acquisition is expensive per paying user; UPI Autopay failure adds an 8-15% recurring leak on top of that low conversion. | Same subscription-side exposure as A; the Hearing Pack credit is UPI-friendly (one payment, no mandate) but currently has nothing trustworthy to sell. | Best-fit for UPI's actual reliability profile (one-shot payments succeed far more often than recurring mandates) — but the product it would sell one-shot is the one this round found not ready. |
| **Feature readiness (this round's finding)** | **Ready.** Every free-tier mechanic tested in the 10-matter walkthrough worked on real data; nothing A depends on requires the Hearing Pack. | **Blocked on the Hearing Pack half.** The subscription half alone is ready; the credit half is not, per §2. | **Blocked entirely.** C's whole premise is the one thing §2 says is not ready. |

## 4. Reading against the plan's own stated hypothesis

§NEW3-5 names a working hypothesis, not a decision: *"subscription first;
keep Hearing-Pack credit architecture available; do not activate the credit
until the Hearing Pack proves strong value."* **This round's evidence
supports that hypothesis rather than revising it** — if anything, more
strongly than when it was written, because the walkthrough turned "the
Hearing Pack isn't proven yet" from a general caution into a specific,
reproduced, named defect (finding #1) with a fix already handed to LCC. The
India-specific economics in §1 argue for the same conclusion from an
entirely different direction: Model A is the only one of the three whose
revenue durability does not depend on either (a) a product surface this
round found broken, or (b) a payment rail (UPI Autopay) with a measured
8-15% structural failure rate working reliably for a *second*, credit-based
revenue line stacked on top of the subscription one.

**This is not this document deciding the model.** It is this document
reporting that the two new pieces of evidence gathered this round — one
technical (the walkthrough), one economic (D35/UPI/fee data) — point the
same direction as the hypothesis already on record, and naming exactly what
would need to change to revisit it: LCC's fix to finding #1 landing and
verified, and NEW1's concept-retrieval numbers clearing whatever bar the
founder sets for "the Hearing Pack finds real law."

## 5. What this document does not do

- Does not set a price. PD-13's prices stand.
- Does not activate the credit ledger. It stays built and inert
  (`platform_config` flags default OFF, per LCC bus 1051/1053) — this
  document does not change that.
- Does not resolve `FQ-HOSTING`'s Hetzner-pricing/OD-2-region conflict
  (`docs/ops/STAGING_PACKAGE_PROPOSAL_2026.md`), which is unrelated to the
  revenue-model question here.
- Does not run a pricing or trial-length experiment. §1's trial-length
  curve (17-32 days > 5-9 > ≤4) is evidence to design an experiment with,
  not a substitute for running one against LawMind's own users.
- Does not independently verify the UPI Autopay failure-rate figure against
  a primary regulatory source (RBI/NPCI); it is sourced from a payments
  processor and marked as such, not upgraded to VERIFIED.

## Sources

- [State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps) — RevenueCat, fetched directly this session. D35 IN/SEA vs. NA conversion, trial-length conversion curve.
- [RevenueCat Pricing](https://www.revenuecat.com/pricing/) — fetched directly this session. Free-to-$2,500 MTR, 1% above.
- [Service fees — Play Console Help](https://support.google.com/googleplay/android-developer/answer/112622?hl=en) — Google, fetched directly this session. India's "Rest of World" 15%/30% tier, unchanged until 30 Sep 2027 vs. the US/UK/EEA 30 Jun 2026 change.
- [UPI Autopay vs Card e-Mandates: 2026 Decision Guide](https://razorpay.com/blog/upi-autopay-vs-card-e-mandates/) — Razorpay — **VENDOR CLAIM**, 8-15% UPI Autopay failure vs. 2-3% card mandates.
