# ASYMMETRIC PLAYS — using what exists, lawfully

Researched 8 August 2026. Written in answer to a founder question — *"how about we
buy a Supreme Today subscription and proxy our requests through it"* — and to the
instruction behind it: **find out-of-the-box ideas that ultimately benefit us.**

The instinct is right. Rebuilding forty years of someone else's work is the slow
way to lose. The specific proposal is the one thing in it we must not do, and
§0 says why in full so it never gets re-proposed. Everything after §0 is the
version of that instinct that works.

---

## 0 · Why proxying their subscription is the one idea to refuse

**It is not a grey area, and the cost is not the risk of being caught.**

**It breaks the rule we already wrote, for the reason we wrote it.**
`CLAUDE.md` §6: *"Never circumvent an access control you have NOT been authorised
to, and never buy data from someone who did."* That rule is why eCourtsIndia and
the other scraper-resellers are out. A per-seat subscription resold through our
product is the same act with a nicer invoice: their access control is *one paying
human*, and routing thousands of users through it circumvents it.

**It would cost us the only written permission in this market.** Our eCourts
grant runs to **January 2029** and is conditioned on us being an organisation
that stays inside permissions — which is why the rate limiter, the fetch ledger
and a kill switch that defaults off all exist. **We would be trading a bounded,
renewable, genuinely rare authorisation for data we cannot lawfully render
anyway.** No competitor has that grant. It is worth more than their corpus.

**The data would be unusable even if it arrived.** What makes their output
valuable is the editorial layer — headnotes, Authority Check, significant
paragraphs — and that layer is **their copyright** (*Eastern Book Company v. D.B.
Modak*). We render every citation **from our own database row**, by rule. There
is no surface in this product where their headnote could legally appear.

**And it inverts the thing we sell.** We are asking 2 million advocates to trust
us with the question *"did you verify this?"* after a judgment that called
unverified citation **misconduct**. A product built on quietly reselling a
competitor's seat cannot be that product. The first advocate who notices ends us,
and they would be right to.

> **The lawful version of the same idea is real and is §5: buy one seat, use it
> as a human, and benchmark them.** That is ordinary competitive research and it
> is already on the build queue.

---

## 1 · THE BIG ONE — be the last step before filing, for everybody's users

**The play:** a free citation check. An advocate pastes a draft, or uploads it,
and gets back every citation with three answers — **does it exist**, **is it
still good law**, and **does the paragraph say what it is cited for**. Plus a
record they can keep.

**Why this is the strongest idea in this document: it does not ask anyone to
switch.**

Every competitive move so far assumes we must displace SCC Online, Supreme Today
or Bharat.Law in an advocate's research. That is a hard, slow fight against
incumbency and habit. **This one sits downstream of all of them.** The advocate
researches wherever they already research — and then, before filing, checks here.
There is no switching cost because there is nothing to switch.

**Why it works now specifically.** *Pooja Ramesh Singh* (2026 INSC 668, 2 July
2026) made verification a professional obligation with a zero-tolerance standard,
and a global tracker has logged **1,590+ AI-hallucination incidents** in legal
proceedings by mid-2026. Every advocate in India now has a task they did not have
in June, and no tool that does it for them.

**Nobody in India offers it.** The closest is **CiteCheck AI** — US-focused,
freemium at five reports, and it verifies that citations are **real, existing
cases**. Existence only. **It does not tell you the case was set aside in 2017**,
which is the failure that loses the matter rather than the one that embarrasses
you. `docs/CITATION_HARNESS.md` treats those as two independent questions and
always has.

**What it costs us: almost nothing.** It is the pipeline that already exists —
`citations/check.ts`, `verify.ts`, the three tiers, `overruled_status` read live.
No new model spend, because there is no generation: this is verification, and
LegalCiteBench measured models at **67–96 on verification** against **under 7 on
generation** (`TECHNICAL_MOAT.md` §1). We are using the thing models are good at.

**What it earns, in order of value:**

1. **The verification record gets a reason to exist.** `FOUNDER_QUEUE` already
   holds it as a question. This answers it: the record IS the product here, and
   it is what an advocate needs when a judge asks.
2. **Competitors become our top of funnel.** An advocate who researches on
   Supreme Today and checks on Lawmind has already put us at the highest-trust
   point in their workflow — the last thing between them and a filing.
3. **Real query data we cannot otherwise get.** The citations advocates actually
   rely on, at the moment they rely on them. `TRAINING_STRATEGY.md` and the
   harness both want exactly this and currently have 25 synthetic queries.
4. **Every check is a Tier-2/Tier-3 opportunity** — see §2.
5. **It is the honest version of the marketing.** Not "our AI is better" — *"paste
   what your AI gave you and we will tell you what is wrong with it."*

**The hard constraints, stated now so the feature is not built wrong.** Uploaded
drafts are **sensitive-class**: pseudonymise before any model call, **one document
per call**, and OD-6's countersigned DPA is still owed before uploads ship. A
paste-the-citations-only mode needs none of that and should ship first.

---

## 2 · The verification tier that compounds with users

`CITATION_HARNESS.md` Tier 3: an advocate opens eCourts, confirms a citation, and
`verified_by_source = 'ecourts'` — **a named human vouched**, cached permanently.

**That is a data asset that grows with our user count, and their editorial team
does not.** Supreme Today's apparatus scales with headcount: more headnotes need
more editors. Ours scales with advocates: **every confirmation any advocate makes
is permanent and benefits every other advocate forever.** At 1,000 users we have
a thousand people's confirmations; they have the same editorial desk they had in
2019.

They cannot copy this without rebuilding around users doing verification, which
is not what a publisher is. **It is the one asset where our late start is an
advantage**, because we designed for it from the schema up — `ecourts_bulk`
exists precisely so a machine's confirmation never wears a human's badge.

---

## 3 · Speed, which an editorial house structurally cannot match

**A Supreme Court direction of May 2026 requires every High Court judgment to be
uploaded to the court's own website within 24 hours of pronouncement**, with bail
orders same-day or next-day. **The raw material now arrives on a judicial
timetable.**

Bharat.Law publishes a **24–48 hour indexing lag** as a feature
(`COMPETITIVE_TEARDOWN.md` §8). Supreme Today's cycle includes writing a headnote,
which is a person reading a judgment.

**A pipeline can be faster than a person, and this is the one place where having
no editorial department is an advantage.** "The judgment delivered this morning is
searchable before lunch" is a claim a publisher cannot match without abandoning
the thing that makes them good.

Two supports already in place: the **Neutral Citation System**, in force since
**6 July 2023**, means the court itself assigns the citation on upload — **a
judgment is citable without any reporter's involvement** — and our eCourts grant
covers the cause-list harvest that tells us what was listed.

**Honest limit:** `CORPUS_TIERING.md` §6 found 0 of 30 sampled High Court PDFs
carrying a neutral citation. That is a statement about *older* judgments. The
2023 system applies going forward, so **speed is a claim about new law, not the
archive** — and new law is what an advocate is arguing this week.

---

## 4 · Give the alert away, permanently, to everyone

PD-5 trigger 2 already alerts an advocate when an authority in a filed draft is
set aside. **Offer that free, forever, to anyone — including people who never
pay us.**

An advocate registers the authorities they have filed. If one moves, we tell
them. That is a permanent hook into the workflow of people who use somebody
else's research tool, it costs a row and a push, and it is the single most
useful thing anybody could do for an Indian litigator after July 2026.

It also feeds the citator: every registered authority is one we know somebody
depends on, which tells us where to spend re-check effort first.

---

## 5 · The lawful use of a competitor subscription

**Buy one seat. Use it as a human. Benchmark them.**

That is ordinary competitive research and there is nothing wrong with it. Run our
**30-query harness set** and the **five-case adversarial set** against Supreme
Today and Bharat.Law by hand, and record where they hallucinate, where they miss,
and what their citator says about *Kharak Singh*.

**Two conditions.** It must be **manual human use** — automated querying of their
service would breach their terms and is the proxying idea wearing a lab coat. And
the output is **evidence for our own decisions**, not marketing copy: naming a
competitor's failure rate publicly invites a fight we do not need when
`TECHNICAL_MOAT.md` §1 gives us the whole category's failure rate from a
peer-reviewed benchmark instead. **Cite the benchmark, never the competitor.**

`COMPETITIVE_TEARDOWN.md` §7 has listed hands-on testing as the highest-value
next research step since 5 August. This is the budget for it: one seat.

---

## 6 · What I am NOT claiming

- **No Indian equivalent of §1 was found.** Absence of evidence after one search
  pass — worth one more look before building, and worth knowing that CiteCheck AI
  demonstrates the model works somewhere.
- **§3's 24-hour rule is a direction to High Courts, not a guarantee of
  compliance.** Whether uploads actually land within 24 hours is measurable from
  our own ingest and has not been measured.
- **§1's cost claim assumes the paste-citations mode.** Full document upload
  brings OCR, pseudonymisation and the DPA with it, and is a different project.
- **§2 assumes advocates will do Tier-3 confirmations.** That is a behavioural
  assumption. It has never been tested and it is exactly the kind of thing the
  20-output advocate review (`FOUNDER_QUEUE`) should ask about.
- **Nothing here is a decision.** §1 in particular is outside
  `PRODUCT_BRIEF.md`'s four features, which makes it an ask by that file's own
  rule.
