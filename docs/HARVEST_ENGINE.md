# THE HARVEST ENGINE — what we ask for, how we ask, and what we keep

Written 8 August 2026, answering three founder questions:

1. **What will we ask them, and how?** Design a harvester that starts slow, ramps
   gradually, and stores everything so carefully arranged that we can stop the
   licence and never rely on them again.
2. **Should we seek the same kind of licence from Indian Kanoon?**
3. **Does the eCourts grant benefit us, and can we use it to train?**

---

## 1 · The rule that everything else follows from

> **Archive the raw response first. Parse it afterwards, from the archive, as
> many times as we like.**

This is the most important engineering decision in the whole arrangement, and it
is easy to get wrong in a way that cannot be undone.

**Every request costs money and rate budget, and the licence is perpetual on what
we ingest — not on what we understood at the time.** If we parse a page, keep the
three fields we wanted and discard the rest, then discover in November that we
also needed the "significant paragraphs" block, **we have to buy the licence
again to get it.** If we archived the page, we re-parse for free.

So: store the complete response — bytes, headers, status, URL, the timestamp, and
the account used — under a content hash, immutably. Parse into the schema as a
**separate, repeatable** step that reads only from the archive. **A parser bug is
then a re-run, not a repurchase.**

The corollary is a discipline: **during the licence window, prefer breadth over
polish.** Pull everything reachable and parse later. Elegance in the parser can
wait; the meter cannot.

---

## 2 · What we ask for, in order

From `SUPREME_TODAY_LICENCE.md` §8a — spend requests only where there is no free
substitute:

| Priority | Ask for | Why |
| --- | --- | --- |
| **0** | **The index itself** — every judgment ID/citation they hold, per court, per year | Cheapest possible requests, and it converts "everything they have" from a guess into a **countable number**. Nothing else can be planned until this exists |
| **1** | **Head-noted High Court judgments** — headnote, Authority Check treatment, cited-by, significant paragraphs, disposition | The moat. Forty years of editorial work with no free substitute |
| **2** | **Tribunals** — NCLT, NCLAT, ITAT, CESTAT, SAT, DRT | The only alternatives are barred scraper-resellers |
| **3** | Head-noted Supreme Court judgments | e-SCR has **official** headnotes free. Pull only if requests are cheap |
| **4** | Raw judgment text, any court | **Never.** 17.8M free from AWS Open Data |

**Priority 0 is not a formality.** Until we can count the target, every estimate
of "how many months" is a guess, and the whole decision is how many months to
pay. **Day one is the index.**

### The one thing to ask them for that costs them nothing

**A list.** Before writing a line of harvester, ask whether they will simply
export the list of head-noted judgments per court per year — even as a CSV. It is
metadata, not content; it costs them a query; and it turns our priority 0 from
thousands of requests into an email. Publishers say yes to this more often than
people expect, because it is not the asset.

---

## 3 · How we ask — the pacing engine, built and tested

`services/ingest/src/harvest/pace.ts`, with 15 tests passing.

**AIMD — additive increase, multiplicative decrease.** The control law behind TCP
congestion avoidance, chosen for exactly the reason it was invented: **it finds a
capacity nobody told you, and it is biased toward yielding.**

- **Starts at one request every 5 seconds.** Politeness is cheap on day one.
- **Speeds up only after 20 consecutive clean responses**, and only by 10%.
- **Retreats by 100% — doubling the interval — on any sign of strain**, where
  strain includes a *slow but successful* response. A service refuses only after
  it has struggled; a controller that waits for a 429 has already spent the
  goodwill it exists to protect.
- **Retreat costs more than four times what a speed-up gains.** That asymmetry is
  the safety property, and there is a test asserting it.
- **It never climbs back through a wall it has already hit.** The interval that
  caused strain is remembered, and the controller stops at 110% of it. Without
  this it sawtooths into the same limit forever — which looks adaptive and is
  really a slow-motion loop.

**And the budget outranks the pace, always.** Two independent limits:

- **Pace** — adaptive, discovered, about not hurting them.
- **Budget** — fixed, contractual, about not breaching the agreement.

`nextDelayMs` returns **null when the budget is spent, and null means stop, not
slow down.** A caller that conflates them either stalls forever or breaches the
cap. There is a test for that too.

**`projectCompletion` is the commercial output.** Given documents remaining and
the measured pace, it returns days and months — which converts directly into how
many ₹50,000 instalments to commit to. That is the number week one exists to
produce.

> **`maxRequestsPerDay` defaults to 1,000 and that is a placeholder, not an
> estimate.** It must be set from the contract. The same rule the eCourts grant
> follows: *an absent limit must never read as permission.*

---

## 4 · What we keep, and how it is arranged

Four layers, and only the first is irreplaceable:

**1 · The raw archive.** Immutable. Content-hashed. Never deleted, never
overwritten. This is the asset we are buying; everything else is derived and can
be rebuilt.

**2 · The fetch ledger.** Every request — URL, account, status, duration, bytes,
timestamp, outcome — including refusals and failures. Exactly the discipline
`ecourts_fetch_ledger` already applies, for the same reason: **"did we stay
inside the licence" should be answerable by `SELECT`, not by recollection.**
`court/ledger-rollback.test.ts` proves an unrecorded fetch cannot produce usable
data, and the same property must hold here.

**3 · The work queue.** Resumable and de-duplicated. A crash must not lose
progress, and **the same document must never be fetched twice** — a duplicate is
money spent on nothing.

**4 · The parsed schema.** Derived from layer 1 on demand.

**Licensed content needs its own `verified_by_source` value, decided before the
first row is written.** It is not `corpus` (we did not resolve it), not `ecourts`
(no human vouched), not `public_x2` (one source, not two agreeing). This is the
`ecourts_bulk` lesson: give a new kind of assertion an existing name and the
strongest guarantee in the product degrades silently, spelled correctly, with no
test failing. The boundary in `citations/source-strength.ts` is exhaustive over
the column, so **adding it is a compile error until it is handled.**

---

## 5 · Indian Kanoon — yes, and you may not need to negotiate at all

**They publish API pricing.** No licence conversation required to begin:

| | |
| --- | --- |
| Search query | **₹0.50** |
| Document | **₹0.20** |
| Document fragment | **₹0.05** |
| Free credit on signup | ₹500 |
| Non-commercial allowance | ₹10,000/month, subject to verification |
| Attribution | **"Powered by IKanoon" required** when rendering results to users |

**₹0.20 a document changes the arithmetic completely.** 100,000 documents is
**₹20,000 — once.** Against ₹50,000 *per month* with an unknown rate ceiling,
this is a different category of deal, and **it needs no negotiation, no contract
and no waiting.** The ₹500 free credit is enough to measure quality this week.

**But be clear about what it is and is not.**

- **It is not a substitute for Supreme Today.** Indian Kanoon does not write
  headnotes. Their value is **coverage and the citation network**, not editorial
  work. The thing that makes Supreme Today worth paying for is precisely the
  thing Indian Kanoon does not have.
- **It overlaps heavily with free sources.** Raw judgments are free from AWS Open
  Data at 17.8M scale. Pay Indian Kanoon for the **tail** — older, obscure, High
  Court and tribunal matter that AWS does not cover — not for volume.
- **The attribution is a product constraint, not a footnote.** "Powered by
  IKanoon" on rendered results conflicts with a product whose entire premise is
  rendering from **our own** database row. Worth deciding deliberately: use them
  as an **ingest and verification** source where no attribution is owed, rather
  than as a live render path.
- **They are now a competitor.** `COMPETITIVE_TEARDOWN.md` §2 already flags this:
  Indian Kanoon launched Prism, an eight-tool AI suite, while remaining our Tier 2
  verification supplier. **The dependency was already uncosted before we
  considered paying them more.**

**Recommendation: yes, open the conversation — but start by just using the public
API.** Spend the ₹500 credit, measure coverage against our gaps, and negotiate
only if the metered price becomes the binding cost. This is one of those blockers
that is not a blocker: there is nothing to ask permission for.

---

## 6 · The eCourts grant — what it is actually worth

Read from our own transcription (`services/api/src/court/authorisation.ts`),
not from memory. **The grant runs to January 2029 and carries three permissions
that are each individually valuable:**

| Field | Value | What it means |
| --- | --- | --- |
| `permittedCourts` | **ALL_COURTS** | Not a pilot. Everything |
| `independentDisplayPermitted` | **true** | We may show the data **as ours** — no eCourts branding, no attribution surface, no sending the user elsewhere |
| `trainingPermitted` | **true** | We may use it as **training input** |
| `captchaBypassPermitted` | **true** | Scoped to bulk cause-list harvesting, in `court/ecourts.ts` only |

### Why this is worth more than either paid licence

**1 · It is the only permission of its kind in the market.** Every competitor
either scrapes without authorisation, buys from someone who did, or is limited to
what they published themselves. `CLAUDE.md` §6 keeps eCourtsIndia and the other
resellers out precisely because *their access was never authorised*. **We asked
and were told yes.** That is not a data advantage, it is a *category* advantage.

**2 · `independentDisplayPermitted` is what makes Tier B possible at all.** The
daily loop — cause lists, tomorrow's hearing, the unknown listing — needs live
court data displayed as part of our product. Without independent display, every
one of those screens would be a link to somebody else's website, which is not a
product.

**3 · `trainingPermitted: true` answers your third question directly, and it is
the rarest of the three.** eCourts records are **primary sources** — cause lists,
case status, orders, party and listing data — so training on them is permitted by
the registrar *and* by our own rule. Compare: `CLAUDE.md` forbids training on
another model's commentary about law, which is why Supreme Today's *prose* is off
limits regardless of what they permit. **The eCourts grant gives us primary
material with express permission to learn from it. Nothing else we have does
both.**

### What to actually train on, and what it fixes

Two limits survive the permission and are not the registrar's to waive, both
already recorded in `authorisation.ts`: **primary sources only**, and the DPDP
position on personal data. Cause lists carry party names — that is personal data
about litigants who never agreed to anything, and `PRIVACY_PII.md` governs it.

Within that, the genuinely valuable training and evaluation signal:

- **Cause-list structure across 25 High Courts and 700+ district courts.** Every
  court formats differently. A model that reliably parses any Indian cause list
  is worth having and cannot be bought — and `causeListStatusEnum` already
  distinguishes `ok` from `empty` precisely because a parser that silently
  returns nothing is a failure.
- **Case-status vocabulary** — disposal types, stage names, adjournment reasons.
  The language of listings is not in any judgment corpus.
- **Listing-to-judgment linkage** — which listings ended in which judgment. This
  is a supervision signal nobody else can construct.
- **Hearing-date prediction from real adjournment history** — the daily loop's
  most valuable possible feature, buildable only from listing data over time.

**And the thing it does NOT fix.** `TECHNICAL_MOAT.md` §1: LegalCiteBench shows
**domain-pretrained SaulLM-54B still scores 3.77/100 on citation retrieval.** No
amount of eCourts training data will make a model's citations real — **only
grounding does that.** eCourts training improves *parsing, structure and the
daily loop*. It does not touch Gate S2.

### The obligation that comes with it

The grant is bounded and **it must be renewed by January 2029**, with payment
required after that. `renewalDueBy()` returns **2028-07-05** — six months' lead,
already in code. **The kill switch is still off**, and turning it on requires a
reason and is audited. Every request passes the limiter and writes the ledger.

**That discipline is the reason we have the grant and the reason we will keep
it.** It is also the template for the Supreme Today harvest: same ledger, same
budget-outranks-pace rule, same "answerable by `SELECT`" standard.

---

## 7 · What I am NOT claiming

- **The pace controller has never met their service.** It is tested against its
  own logic, not against a real rate limit. Its defaults are deliberately timid
  and `maxRequestsPerDay` must be set from the contract.
- **Indian Kanoon's published prices date from a 2015 blog post** in the sources
  found. Treat them as an order of magnitude and confirm current rates before
  budgeting.
- **I have not seen either contract.** The Supreme Today terms are what to
  negotiate for; Indian Kanoon's ToS should be read before the first paid call,
  particularly on caching and redistribution.
- **The eCourts permissions above are read from OUR transcription of the letter**,
  not from the letter. If the transcription is wrong, everything built on it is
  wrong — which is why `CONDITIONS_VERSION` fingerprints what we enforce.
- **No estimate of their head-noted count exists.** Priority 0 produces it. Every
  month-count in these documents is parametric until then.
