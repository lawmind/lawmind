# BHARAT.LAW'S OFFER — the whole site, read, and a recommendation

Researched 8 August 2026 from their sitemaps, `robots.txt`, `llms-full.txt`,
pricing page, product pages, `/nyai` and their legal terms. **87 pages
enumerated** across `sitemap-main` (52) and `sitemap-opinions` (35).

The founder has spoken to them and reports they will **allow scraping after a
subscription is bought**, and asks whether it is worth it.

---

## 1 · The recommendation, first

**REVISED 8 August 2026 after reading all 87 pages, including both binding
contracts.** The original recommendation was "buy one month at ₹1,499". Two
things found on the second pass changed it.

**Do three things, in this order:**

1. **Start on their free tier today. ₹0.** *"Ask a question free · No signup. No
   card."* Run *Kharak Singh* and *Danamma* — our seven unresolved judgments —
   through it. That answers the only question worth paying for (**is their
   treatment data curated or computed?**) for nothing. §8b.1
2. **Send one email asking for written consent to benchmark**, naming the scope.
   Their own contract says benchmarking is prohibited *"without our prior written
   consent"* — **a consent requirement, not a ban.** Their verbal yes is exactly
   what could satisfy it. §2b
3. **Then buy one month of Pro at ₹1,499 — monthly, never annual — only if the
   free tier will not show counter-authority depth.** §8

**And still extract nothing.** That part has not changed and is not close.

**But the purchase is the small question.** §8b is the important part of this
document: **they are running a free consumer-intake funnel in ten languages that
matches laypeople to advocates**, and **three "nobody" cells in our own
`FEATURE_PARITY.md` were wrong.** Read §8b before §2.

---

## 2 · Their written policy prohibits exactly what the verbal permission grants

From their **Acceptable Use Policy**, quoted:

> *"scrape, harvest, or otherwise extract data from the Services **beyond
> entitlements purchased**"*
>
> *"circumvent rate limits, access controls, audit logging, **watermarking**, or
> other technical protections"*
>
> *"develop or train **a competing model or a benchmark of our model**"*
>
> *"share Account credentials, sell Account access, or allow access by anyone
> other than the Authorised Users"*

**We are a competing product.** That third clause prohibits not only training on
their output but *benchmarking* it — the exact lawful use I recommended for
Supreme Today.

**And the contrast with Supreme Today is the whole point.** There, the founder
negotiated a **written licence with perpetual retention granted and their
knowledge of the intent**. Here we have a verbal yes standing against a published
policy that says the opposite, from a US-incorporated company whose Service Terms
push ownership, export and termination into a **Platform Agreement we have not
seen**.

**A verbal permission that contradicts a signed-up-to policy is not a permission
we can rely on** — and the mention of *watermarking* in their own AUP says they
have thought about exactly this.

### 2b · But the binding contract has a door in it, and it is worth using

**Both agreements are published, and I have now read both.** A self-serve account
— which is what you would buy — is governed by the **Evaluation Terms**, not the
Platform Agreement (that one is for organisations on an Order Form). The
Evaluation Terms say:

> *"use the Services to build a competing product or to **benchmark the Services
> without our prior written consent**"*

**That last clause is not an absolute prohibition. It is a consent requirement**,
and their verbal yes is exactly the thing that could satisfy it in writing. The
Platform Agreement uses the same wording — *"without Bharat.Law's prior written
consent"* — so it is deliberate drafting, not an accident.

**Which turns the recommendation from "do not" into "get one email".** Ask them
to confirm in writing what is permitted, naming it specifically: *comparative
evaluation of research output on a fixed query set, no bulk extraction, no
training.* If they say yes in writing, that is a lawful benchmark. If they will
not put it in writing, that is also an answer, and it costs nothing to find out.

**Two more things from the binding terms, both better than I assumed:**

- **Governing law is India**, arbitration at the **Delhi International
  Arbitration Centre**, New Delhi courts — despite the Delaware incorporation.
- **They do not take our content for training.** *"We do not use Customer Content
  to train publicly available foundation models or to improve models for the
  benefit of other customers, except where you have given specific, informed,
  opt-in consent."* **So running our own harness queries through their product
  does not feed them our query set** — which was a real risk worth checking.

---

## 3 · There is no moat to buy

This is the substantive point, and it is where Bharat.Law differs from Supreme
Today completely.

**Supreme Today was worth considering because they are a publisher since 1968**
with forty years of *human* editorial work — headnotes, Authority Check
treatment, significant paragraphs — that cannot be recreated at speed by anyone.

**Bharat.Law was founded in 2023.** There is no editorial desk. Their content is:

| What they hold | What it costs us today |
| --- | --- |
| Supreme Court + 25 High Courts + tribunals, 1950 onward | **Free.** AWS Open Data (17.8M, CC-BY-4.0) · e-SCR (~34,000 with official headnotes) · our own 38,341 |
| Court monitoring across **15,247 courts** | **We have a better right to it — see §4** |
| Treatment status (relied on / followed / distinguished / overruled) | **The one thing we lack — see §5** |
| 35 opinion articles, mostly NRI-facing | Marketing. Worth nothing to us |
| Marketing pages | **Already free — they invite crawlers, §6** |

**Buying a subscription to obtain public-domain judgments we already hold would
be paying for the one thing in this market that has never been scarce.**

---

## 4 · On court monitoring we are ahead of them, not behind

Their own product page: *"over 14,000 district and subordinate courts connected
via **eCourts**"*, orders *"typically detected within 30 minutes of upload"*.

**And they state no authorisation for it.** The page contains no mention of a
grant, a licence or a data partnership — I looked for one specifically.

**We hold a written eCourts grant running to January 2029**, transcribed into
`court/authorisation.ts`, with `permittedCourts: ALL_COURTS`,
`independentDisplayPermitted: true` and `trainingPermitted: true`, a rate limiter
that enforces its conditions and a ledger that records every request.

So on the single most valuable Tier B asset, **buying their monitoring would be
buying a weaker version of something we already have lawfully.** `CLAUDE.md` §6 is
also explicit that we never buy data from someone whose access was not
authorised — and here we cannot tell, because they do not say.

---

## 5 · Their treatment data is the only thing we want, and it is the thing we
must not take

Our citator is our real gap: **22 flagged judgments of 38,341**, and the seven
`overruled_in_part` cases still unresolved. Their per-citation treatment is
exactly that gap filled.

**But `/nyai` does not disclose how treatment is determined.** I read the page
looking for it: it gives *"0 Hallucinated citations"*, *"100% Citations
traceable"*, *"15k+ Courts"*, *"10k+ Pages per matter"* — and **no statement of
whether treatment is human-curated or computed.** For a company founded in 2023
with no editorial desk, it is almost certainly computed.

### And there is no model to take, either — NyaI is orchestration

Read raw rather than through a summariser, the `/nyai` page lists NyaI's own
properties and one of them is decisive: **"Model agnostic"**.

**NyaI™ is not a trained model.** It is a retrieval-and-reasoning layer over
third-party frontier models — which is the same architecture as ours, and which
their own page says plainly beside *"Verifiable design"* and *"Litigation-scale
context"*.

So the word "distillation" does not even apply here the way it did to Supreme
Today. **There are no weights to learn from and no editorial desk to buy.** There
is a corpus of public judgments, an orchestration layer, and a product — and only
the third is any good, which is exactly what §9 says.

**Two more things worth recording from that page.**

Their public accuracy claim is **"0 Hallucinated citations · Verifiable by
construction"** and **"No hallucinations, ever."** That is the strongest claim in
this market by a distance, and it is stated with **no methodology, no query set
and no number** — which makes it unfalsifiable rather than impressive. **Our
position is the opposite and better: a fixed 30-query set, relevance defined
before measuring, and a number we publish even though it currently fails.**
`TECHNICAL_MOAT.md` §1's rule holds — cite the benchmark, never the competitor —
but the contrast is worth knowing.

And their limitations section says NyaI *"signals uncertainty and escalates to
qualified counsel"*, while their research page says an unverifiable proposition
gets a **"not found"** response. Those are different things, and the second is
the silent drop we forbid at a zero threshold.

**Which makes their treatment data the wrong thing to take, twice over.** It is an algorithm's
output over the same public judgments we already hold — so it is derivable by us
rather than purchasable, and we already extract **11,765 treatment edges** with
the citing court's own phrase as evidence. And training on it would be *another
model's commentary about law*, which `CLAUDE.md` and `DATASETS.md` forbid for a
reason `DATASETS.md` documents in detail.

**The honest version of what we want from them is not their answer. It is the
paragraphs the courts themselves wrote**, and those are free.

---

## 6 · The public site needs no subscription at all

Their `robots.txt`, dated 2026-06-14, explicitly allows **GPTBot, ClaudeBot,
Claude-Web, OAI-SearchBot, PerplexityBot** and the rest:

> *"Policy: open to all good-faith crawlers, including AI answer engines… central
> to our AEO (Answer Engine Optimization) strategy."*

They also publish `llms.txt` and `llms-full.txt` — a machine-readable canonical
summary written for exactly this. **Everything public is already ours to read,
for free, with their blessing.** A subscription buys access to `app.bharat.law`
and nothing else.

---

## 7 · What the pricing actually tells us — the real intelligence

| Plan | Annual | Monthly | Seats | AI credits/mo |
| --- | --- | --- | --- | --- |
| Plus | **₹599/mo** | ₹899 | 1 | 5,000 |
| **Pro** | **₹1,099/mo** | ₹1,499 | 1 | 10,000 |
| Teams | ₹2,999/mo | ₹3,999 | 3 | shared |
| Enterprise | custom | — | custom | pooled |

**Three things follow.**

**They are credit-metered** — which is precisely what Supreme Today's comparison
material attacks with "unlimited". Two of the three serious players in this
market are now on opposite sides of that question, and `COMPETITOR_SUPREME_TODAY.md`
§2 already concluded a credit meter is a competitive liability here. **That
conclusion is strengthened, not weakened.**

**The credit meter also caps any extraction by design.** 10,000 credits a month
on Pro is not a bulk pipe, whatever anyone says verbally.

**And the pricing anchor moves a third time.** `COMPETITIVE.md` anchors on SCC
Online at ~₹5,000/mo. Prism is ~₹1,250. Supreme Today's AI plan is ₹1,667.
**Bharat.Law's solo tier is ₹1,099.** Four independent data points now sit
3–5× below the anchor PD-13's justification rests on.

---

## 8 · What IS worth doing

**Buy one month of Pro at ₹1,499 — monthly, not annual — and use it as a lawyer
would.** That is ordinary permitted use, it breaks no term, and it answers
questions no amount of reading their site can:

- How do they render a citation, and what does their counter-authority actually
  look like beside one?
- Is their treatment data any good? Run *Kharak Singh* and *Danamma* through it —
  **the seven judgments our own extractor could not resolve.** If their answer is
  right and specific, that tells us the data is curated and worth respecting; if
  it is vague, it is computed and we can compute it too.
- What does 10,000 credits actually buy in a working day?
- What does their court monitoring digest look like against ours?

**₹1,499 for that is cheap.** It is competitive research of the ordinary kind.

**And extract nothing** — not because we would be caught, but because their AUP
forbids benchmarking their model in writing, and because the thing we would take
is either free elsewhere or is a machine's opinion we are not allowed to train
on.

---

## 8b · THE TWO FINDINGS THAT MATTER MORE THAN THE PURCHASE

Read after the whole site rather than seven sampled pages. **Both outrank the
buy/do-not-buy question, and the second contradicts something we have written
down as settled.**

### 8b.1 · It is free. There is nothing to buy in order to evaluate it.

`/solutions/individuals`: **"Ask a question free · No signup. No card. About 5
minutes."** `/resources/nyai-technology-stack`: *"Bharat.Law runs on a freemium
model — free to start, no credit card required."*

**So §8's ₹1,499 is not needed for most of what §8 wanted to learn.** Run
*Kharak Singh* and *Danamma* — our seven unresolved judgments — through the free
tier and the curated-vs-computed question is answered for **₹0**. Pay only if the
free tier will not show counter-authority depth, and pay **monthly**.

### 8b.2 · They are building a two-sided marketplace, and it aims at the
### demand side we have not built

This is the real finding. `/solutions/individuals` is not a marketing page for
lawyers — it is **consumer intake**:

> *"Describe it in plain Hindi, Tamil, Telugu, or 7 other Indian languages.
> NyaI™ asks a few clarifying questions, explains the law, tells you what to do
> next, **and matches you with a qualified lawyer the moment you need one.**"*

Their Evaluation Terms confirm the other side of it: users may *"connect with
**External Advocates**"*. Twelve consumer entry points are already written —
cheque bounce, RERA possession, security deposit, SARFAESI, RWA, IT/GST notice,
consumer, UPI fraud, employment, family, domestic violence, FIR — **plus a whole
NRI section** (POA, FEMA repatriation, ancestral partition).

**That is a demand funnel that feeds advocates, and it is worth more than any
database.** An advocate joins the platform that brings them clients, and stays
for reasons that have nothing to do with citation quality. It is also **exactly
the "common man" market you asked me to research for `GTM_INDIA.md`** — they are
already executing it, in ten languages, for free, with the NRI segment monetised
first.

**This is a strategic threat, not a data question, and buying a subscription does
nothing about it.** `GTM_INDIA.md` needs to answer it directly.

### 8b.3 · The wedge claim in our own docs is now false as written

`/resources/nyai-technology-stack`, their words:

> *"NyaI integrates live matter tracking across **15,000+ Indian courts**… Daily
> digests, **cause-list matching**, CNR lookup, and **limitation risk alerts** run
> continuously. **No competitor currently combines live tracking of 15,000+ courts
> with AI-powered research in a single product.**"*

`CLAUDE.md` §1 and `PRODUCT_BRIEF.md` §2 both call the 24-hour hearing briefing
**"the wedge — no Indian competitor has it"**, and `FEATURE_PARITY.md` row 20
scored it **"nobody"**. **That is no longer true**, and the row is corrected in
this commit.

**What survives, and it is narrower and worth stating precisely.** Theirs is a
*digest and an alert* — court monitoring, pushed daily. Ours is a **briefing
assembled per listed hearing**, and `services/api/src/briefings/assemble.ts`
reads good-law status **live at assembly, never from its own cache**. Nothing on
their site claims treatment status is re-checked at the moment of delivery.

**So the differentiator moved down a level, the same way it did on workflow.** It
is no longer *having* the daily loop. It is that ours cannot hand an advocate a
briefing built on an authority that died last week. **That is a Gate S2 and
citator argument, which is where `CURRENT_PLAN.md` already points.**

**This needs your decision, not mine:** `CLAUDE.md` and `PRODUCT_BRIEF.md` are
yours, and I have not edited either. The claim in both should change.

---

## 9 · One more thing worth noticing

**A company that invites a direct competitor to take its data does not believe
the data is its moat.** They are almost certainly right: their moat is the
product, the Advocate-on-Record co-founder, and being first to say "verifiable"
out loud.

**Which is the same conclusion `TECHNICAL_MOAT.md` reached about us.** The corpus
is not where this is won. `CURRENT_PLAN.md`'s order stands: Gate S2 passes, the
citator gets populated, the verification record gets built — none of which a
subscription to anybody accelerates.

---

## 10 · What I am NOT claiming

- **~~I have not seen their Platform Agreement or Evaluation Terms~~ — CLEARED.**
  Both are published and both are now read; §2b is written from them. The
  correction matters: the AUP reads as an absolute ban, the binding terms read
  as *"without our prior written consent"*, and **that difference is the whole
  recommendation.**
- **The verbal permission may be real and may be honoured.** My objection was
  that it contradicts their published policy and is not written down — **§2b
  narrows that to a single email**, because their own contract names written
  consent as the cure.
- **I have not seen the Data Processing Addendum or the AI Policy**, both
  referenced by the terms and neither in the sitemap. Only relevant if we ever
  put client data in, which §8 does not propose.
- **"Almost certainly computed" is an inference**, not a fact. `/nyai` does not
  say, and one month's use would settle it — which is §8's point.
- **No account was bought and nothing was tested hands-on.** Everything here is
  from their own public pages.
