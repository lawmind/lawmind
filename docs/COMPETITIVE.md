# COMPETITIVE POSITION

> Market figures below are the founder's landscape review, recorded as given.
> **Prices and vendor claims move — verify before quoting any of them externally.**

## The market as it actually is

| Tier | Who | Price | What they sell |
|---|---|---|---|
| Institutional databases | SCC Online, Manupatra | SCC Online AI Pro ₹51,500/user/yr + 18% GST (~₹5,000/mo); Manupatra quote-only | Authority and comprehensiveness. **SCC headnotes are what judges prefer** |
| Free government | e-SCR (Supreme Court) | Free | Neutral citations, court-formatted PDFs. **Genuinely good now** |
| AI research | CaseMine (AMICUS), LegitQuest (iSearch/iDraf/iDigest), VIDUR AI, BharatLaw.AI, Jhana | Mid | Semantic search over Indian law |
| Consumer apps | Law4u, Lawyyar, LegalKart | Free + IAP | Library breadth, 18 languages, advocate finder |
| Case tracking | Notify Court Case Status, Provakil | Low | Cause lists, hearing reminders |
| Global | Harvey (AZB, Shardul Amarchand, S&A), Lexis+ AI | $1,000+/seat/mo | BigLaw only |
| Free chatbots | NyayGuru, KanoonGPT, Niyam.ai | Free | Q&A, **no verification** |

## The three facts that define strategy

### 1 · Raw judgments are commoditised
e-SCR is free, fast, and carries neutral citations. **Do not position on corpus
size — we lose to a government service that costs nothing.**

The corpus is **table stakes, not the product**. This is why `PRD.md` sequences
Tier B (the daily loop) before Tier A (the library): the library only prevents a
feature-comparison loss.

### 2 · Everyone sells a database. Nobody sells a workflow
The most telling line in the 2026 landscape review: firms run ₹15-lakh
subscriptions as glorified citation lookup **because nobody trained the juniors**.

> The tool isn't the bottleneck. The workflow is.

Our daily loop — cause list → briefing → draft → share — is the thing no incumbent
has. An incumbent can add a corpus; adding a workflow means changing what they
sell.

### 3 · Verification is now compliance, not a feature
India in 2026 has a **Supreme Court misconduct standard for unverified
citations**, and advocates are being cautioned about High Court cost orders.

**This reframes the whole trust UI. The mark is a shield, not a warning.**

Not *"we're checking on you."* — *"you're covered."*

| Old framing | New framing |
|---|---|
| "Citation verified" — we audited your work | Silence — verification is the baseline, not an achievement |
| "Unverified — proceed with caution" | "We could not confirm this. Here is the eCourts path." — we did the work and are handing you the next step |
| A watermark on the filed draft | Nothing on the document. Consent taken once, at onboarding |

This is the same conclusion the trust inversion reached from a design direction,
arrived at independently from a regulatory one — which is the strongest kind of
agreement. Every piece of verification copy is written from the shield framing.

## Our position, in one line

> **The only tool that turns tomorrow's listing into a prepared advocate — with
> citations that survive a misconduct challenge.**

Not the biggest database. Not the cheapest chatbot. **The daily working
instrument.**

## Where each competitor is beatable

| Competitor | Their weakness | Our move |
|---|---|---|
| **SCC Online / Manupatra** | ₹51,500/yr, desktop-first, no case tracking, no briefing | Mobile-first, ~1/15th the price, the daily loop they have no answer to |
| **e-SCR** | Search only. No matters, no drafting, no alerts | **Never compete on corpus. Integrate it as a source** |
| **Law4u** | Huge library, no verification, no workflow, ad-supported feel | Verification-as-compliance + the daily loop |
| **Notify Court Case Status** | Tracks listings, generates nothing | We turn a listing into a *prepared advocate* |
| **CaseMine / LegitQuest** | Research only, no matter workspace | Research is **one tab of four** |
| **Harvey** | ₹1L+/seat, BigLaw only, no Indian court data | We own the **1.7M advocates they will never serve** |
| **Free chatbots** | No verification — **actively dangerous under the new standard** | **Our sharpest wedge. Name it.** |

## Pricing — we sit inside an existing budget line

A solo advocate already allocates **₹30,000–50,000/year** for research
(₹2,500–4,200/month). **Expert at ₹3,499 is inside that budget, not on top of it.**

We are a **switch, not a new spend.** SCC Online at ~₹5,000/month is the anchor.

This changes the sales conversation from *"is this worth ₹3,499?"* to *"is this
better than what you already pay ₹5,000 for?"* — a comparison we win on the daily
loop and lose on headnotes, which is why we never lead with corpus.

## The launch play — free for 90 days

**Founder's decision.** All tiers free for the first 90 days after launch, for
anyone who signs up in that window.

> ### What may be published now, and what may not — 2 Aug 2026
>
> **The offer is decided. Only half of it is publishable.**
>
> **Ships on the paywall now:** *"Founding advocates keep 50% off, permanently.
> First 5,000 only."* Both the discount and the cap are **bounded**, so the
> maximum exposure is known before anyone signs up.
>
> **Does NOT ship yet: "three months free."** The **briefing cost per user is not
> computed**, and a free window is an **unbounded commitment against an unknown
> number of users**. Briefings are the most expensive thing we generate per
> advocate — a nightly generation per listed matter — and the formula below still
> has `UNKNOWN` in three of its inputs.
>
> **The condition for publishing it:** compute briefing cost per user from **real
> beta usage**, fill every `UNKNOWN` in the table below, and re-run the formula on
> the provider's live pricing. Not from an estimate, and not from the placeholder
> unit prices.
>
> **The design already leaves room.** The founding card is a stack, not a grid, so
> *"and your first three months free"* appends as a fourth line under the progress
> rule without moving anything below it — `design/screens/IMPLEMENTATION.md` §9g.
> **Nothing has to be re-laid out when the number lands.**
>
> Related presentation rule: **a counter, never a countdown clock** — "1,204 of
> 5,000". A clock reads as a growth tactic to a senior advocate; a counter is a
> fact. PD-14.

Structured to build a moat rather than buy downloads:

- **Free access is granted per user, not per period.** Early users keep a permanent
  **"founding advocate" rate at 50%** after the free window. This converts the free
  cohort instead of churning it.
- **The free window fills the matter workspace.** Ninety days of accumulated
  matters, briefings and drafts is switching cost no competitor can undo.
  **This is a data-moat play, not a marketing spend.**
- **Capped at the first 5,000 advocates.** Creates urgency and bounds LLM cost.
- **Firm and Enterprise excluded** — those are invoiced sales and should never be
  free.

### Cost exposure — the model, not the answer

**The unit prices below are placeholders.** Do not commit to the free period on
these numbers — fill them from the provider's live pricing and re-run.

**Formula**

```
cost = users × active_days × searches_per_active_day × tokens_per_search × price_per_token
     + users × drafts_per_month × 3 × tokens_per_draft × price_per_token
     + users × briefings_per_month × 3 × tokens_per_briefing × price_per_token
```

**Inputs to fill**

| Input | Value | Source |
|---|---|---|
| Users | 5,000 | Capped, decided |
| Period | 3 months | Decided |
| Searches / active day | `UNKNOWN` | Model from beta; do not guess |
| Active days / month | `UNKNOWN` | Target is 3+ opens in week one; retention beyond that is unmeasured |
| Drafts / user / month | `UNKNOWN` | Model from beta |
| Briefings / user / month | ≈ listed hearings/month | The only input with a real-world anchor |
| Search token cost | `UNKNOWN — verify` | DeepSeek V4 Flash live pricing |
| Draft / briefing token cost | `UNKNOWN — verify` | Sonnet 4.6 live pricing |

**What the model will show, structurally, before any number is filled:**

1. **Briefings dominate, not searches.** A briefing is generated per listed
   hearing per user per night, runs on the premium model, and is long-form. Search
   is short and on the cheap model. **Model briefings first.**
2. **The cap is the control.** 5,000 × 90 days is the entire exposure; there is no
   tail risk beyond it because signup closes.
3. **Every call already rows into `llm_calls`** with model, tokens, cost and
   `data_class` (`docs/SCHEMA_TRUTH.md`). The free period is measurable from day
   one, and the **$50/day alert** in `docs/FAILURE_MODES.md` is the circuit
   breaker.
4. **Sensitive-class traffic is 0 during the free period** if OD-6 is still open,
   because no upload feature ships. That removes the most expensive routing tier
   from the model — and means the estimate *rises* when OD-6 closes.

**Recommendation:** do not commit to 90 days until the briefing-cost line is
computed from real beta usage. The cap bounds the downside, but briefings-per-user
is the input that swings the total by an order of magnitude, and it is currently
unknown.
