# THE SUPREME TODAY LICENCE — ₹50,000/month, and how to know if it is worth it

Written 8 August 2026, on the founder's report: **bulk data licence granted**,
**2–3 accounts required for routing**, **₹50,000/month**, and **they have agreed
to distillation.**

The founder's own instinct — *"if we cannot properly distil, this ₹50,000 will
not be worth it"* — is the right frame, and it has a precise answer. Two things
called "distillation" are in play. **One is forbidden by our own rules and would
damage the product. The other is exactly what we need and is already
precedented in `docs/DATASETS.md`.**

---

## 1 · The decision in one line

**Do not sign twelve months. Ask for a one-month paid pilot and measure it on the
harness.** We are the only party in this market able to answer whether the data
is worth ₹6 lakh a year, because we have a fixed query set and a definition of
relevance settled before measuring. Use it.

---

## 2 · Distillation — the fork that decides everything

### 2a · Distilling their PROSE is forbidden, and would poison the product

`CLAUDE.md` §6 and `docs/DATASETS.md`: **"Primary sources only. Judgments,
statutes, official records. Never another model's commentary about them."**

Querying their AI thousands of times and training on the **answers** is training
on another model's commentary about law. That is the forbidden thing, and the
rule is not bureaucratic — `DATASETS.md` recorded what happened when someone did
it: a bail application drafted for a company in a civil employment matter, a
fabricated dissent in a unanimous judgment, *Indra Sawhney* stated backwards. Its
conclusion, in its own words:

> *"Training a citation-accuracy product on fabricated dissents and impossible
> bail applications would bake our core failure mode into the weights."*

**And we now know their AI's specific exposure.** Their own user manual documents
**no hallucination safeguard and no accuracy claim**
(`COMPETITOR_SUPREME_TODAY.md` §4). LegalCiteBench measured **20 of 21 models
above a 94% Misleading Answer Rate** and closed-book citation retrieval at
**under 7/100** (`TECHNICAL_MOAT.md` §1). Distilling an ungated legal AI is
distilling its errors along with its knowledge, and the errors are the part we
sell against.

**Their permission does not change this.** They are entitled to allow it; we are
not obliged to want it. This one is a quality decision before it is a legal one.

### 2b · Distilling their POINTERS is allowed, valuable, and already precedented

`DATASETS.md` §"Task taxonomy" made this exact distinction once already:

> *"The **instructions** are good signal even though the outputs are not… **Never
> use the paired outputs as ground truth.**"*

Apply it here. Ask their system ten thousand legal questions and keep **which
judgments it cites** — not a word of its prose. A citation is a **pointer to a
primary source**, and their AI's selection of it is editorial judgement expressed
as a reference. We then:

1. **Resolve every cited judgment against our own corpus.** Anything that does
   not resolve is discarded — so their hallucinations cannot enter, by
   construction. Our verification harness is the filter.
2. Keep `(question → judgment IDs)` pairs as **relevance signal**.
3. Never store, render, or train on their sentences.

**This is precisely the asset we are missing.** The Gate S2 harness runs on
**25 queries** and it is failing at **success@5 = 24.0%** against a 0.70 floor.
Ten thousand question→authority pairs, verified against our own corpus, is
training and evaluation data for the one metric that is blocking everything else
— and `TRAINING_STRATEGY.md` §S2 already says the harness becomes the gold data.

**That is the version of distillation to buy.** It is also the version most
likely to survive their lawyers, because we are not reproducing their expression.

---

## 3 · What we are actually paying for — and what is already free

**Do not pay for raw judgments.** 17.8M are free from AWS Open Data (CC-BY-4.0),
and **e-SCR gives ~34,000 Supreme Court judgments free WITH OFFICIAL
HEADNOTES**, digitised SCR 1950–2017 by the Court's own Editorial Section.

**That last point is a negotiating lever and should be used.** A large part of
what a licence would buy for the Supreme Court already exists in an official,
free form. **The incremental value is High Courts and tribunals**, where no free
headnote or treatment set exists.

Ranked by what is genuinely worth ₹50,000/month:

| | Worth paying for? |
| --- | --- |
| **High Court + tribunal headnotes and Authority Check treatment** | **Yes — this is the whole deal.** Forty years of editorial work, no free substitute |
| **Tribunal coverage** (NCLT, NCLAT, ITAT, CESTAT, SAT, DRT) | **Yes** — the only alternatives are barred scraper-resellers |
| **Question → citation pairs via permitted querying** | **Yes** — see §2b; possibly the highest-value item of all right now |
| Supreme Court headnotes | **Weak** — e-SCR has official ones, free |
| Raw judgment text | **No** — free, at 17.8M scale |

---

## 4 · The economics, plainly

**₹50,000/month = ₹6,00,000/year.**

- At our own Expert tier (₹3,499/month, PD-13), the licence is covered by
  **about 15 paying advocates.** In a market of ~2.01 million enrolled advocates,
  that is not a demanding bar.
- Against their own pricing it is **30 seats' worth** (₹20,000/yr each). Worth
  asking them to justify the multiple, particularly since a bulk feed costs them
  less to serve than 30 interactive users.
- **The opportunity cost is the real question.** ₹6L/year also buys a self-hosted
  OCR GPU with change left over, or the LLM key that currently blocks three Gate
  S2 metrics, or an advocate reviewer, or a first salesperson. **Each of those has
  a clearer path to a number than the licence does today.**

### The clause that changes the price by an order of magnitude

**Ask what happens to ingested data when we stop paying.**

A bulk archive is a **one-time acquisition priced as a subscription**. If we keep
what we have ingested, the ongoing fee buys only *new* judgments — and twelve
months at ₹6L to acquire forty years of editorial work is cheap. If we must
delete it on termination, we are renting, they hold the switch, **and they can
read our dependence off the invoice** at every renewal.

Same property `ecourts_bulk` was built for: a permission that ends must revert
behaviour automatically. Negotiate it **now**, with a **price cap or fixed
renewal formula**, not at renewal.

---

## 5 · The routing accounts — and the thing to still avoid

They require **2–3 accounts for routing**. Two consequences.

**Use them for the §2b harvest and for benchmarking, not for live user traffic.**
Routing our users' live queries still shows them user count, growth, practice
areas and individual research patterns that disclose case strategy before filing.
A bulk feed plus offline querying gives us the data without giving them the
users. **If the contract obliges live routing, that is a materially worse product
and should be priced as one.**

**Two or three accounts is also a rate limit.** Ten thousand questions through
three seats is a scheduling problem, and it caps how fast the §2b asset can be
built. Ask what per-account query ceiling applies before assuming the harvest is
feasible.

---

## 6 · The go/no-go, and it is measurable

**We can answer this properly and nobody else in this market can.** The A/B rig
exists, the harness exists, and `queriesToSettle` will say how many queries are
needed to call it.

**Proposal:** one month paid — ₹50,000, a bounded and recoverable amount — with
this test:

1. Ingest what the licence gives for **High Courts and tribunals**.
2. Harvest §2b pointers through the permitted accounts.
3. **Run `pnpm --filter @lawmind/harness ab` on the 283-query set, both arms, and
   report the paired difference with a McNemar exact p.**

**Go if:** success@5 moves and the interval excludes zero, or the citator gains
treatment data we cannot get free — *both measured, not asserted.*

**No-go if:** the gain is inside noise. `DATA_ADVANTAGE.md` §1d's standing rule
applies to a ₹6L/year data licence exactly as it applies to a free reranker:
**if it does not move the number on our own corpus, it does not ship.** We
declined a free Apache-2.0 cross-encoder on that rule this morning at
+6.0 points and p = 0.210. A paid dependency on a competitor gets the same test,
not a softer one.

---

## 7 · What I am NOT claiming

- **I have not seen the licence terms.** Everything above is what to negotiate
  for, not a reading of what is on offer.
- **§2b's legality under their contract is unverified.** They agreed to
  "distillation" in conversation; whether their written terms permit retaining
  question→citation pairs is a question for the document, and it is the single
  most important clause to check.
- **The pilot assumes they will sell one month.** If they will only sell twelve,
  the decision has to be made on less evidence, and my recommendation would be
  to spend the first ₹50,000 on the LLM key and an advocate reviewer instead —
  both of which unblock Gate S2, which gates everything.
- **No number here is measured.** The 15-advocate break-even uses PD-13's list
  price and assumes no discount, no churn and no tax.
