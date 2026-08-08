# SUPREME TODAY AI — the incumbent, and how we compete with it

Researched 8 August 2026 from primary sources: their own About page, pricing
page, user manual, homepage, the Play and App Store listings, and corporate
records. **Supplements `docs/COMPETITIVE.md` (strategy) and
`docs/COMPETITIVE_TEARDOWN.md` (feature detail); does not restate them.**

`COMPETITIVE_TEARDOWN.md` §7 lists SupremeToday among vendors with **"no pricing
verified"** and treats it as one of five Play-listing entries. That framing was
wrong, and the correction is the whole reason for this file. **Supreme Today is
not an AI startup with a data advantage. It is a fifty-eight-year-old law
publisher with an AI layer.** That changes what can and cannot be competed away.

Founder's report from real users, 8 Aug 2026, and it is consistent with
everything below: *"the citation of Supreme AI is very accurate and they can file
in front of the judge with the actual citation because all other AI models
hallucinate."*

---

## 1 · What they actually are

| | |
| --- | --- |
| Legal entity | **Vikas Info Solutions (P) Ltd.**, New Delhi, incorporated 22 Nov 2004 |
| Lineage | **Vinod Publications, 1968** → law journals from **1983**, incl. *Crimes* (criminal law, SC + all HCs) → ***Supreme Today* daily law journal, 1996** |
| People | Vinod Nijhawan (founder, publisher) · Vikas Nijhawan (son; journals → software) |
| Revenue | **₹3.56 Cr, FY ending 31 Mar 2024** |
| Funding | **Unfunded.** Bootstrapped on subscription revenue |
| Apps | iOS *Supreme Today* since ~2014 (id 902359199); *Supreme Today AI* (id 1495198688); Android `com.law.lawcanvas` — **50K+ installs, 4.8 from 10 ratings** |
| Positioning | "Endorsed by Various High Court and Judicial Officers" |

**Read that lineage again, because it is the finding.** They published the law
reports. *Crimes* has been reporting Supreme Court and High Court criminal
judgments since 1983; *Supreme Today* has been a daily journal since 1996. By the
time AI existed they already held four decades of editorially processed judgments
with headnotes, subject classification and citation cross-references, produced by
staff whose job that was.

**So their citation accuracy is not a retrieval achievement. It is a publishing
one.** They do not verify that a citation exists; the citation exists because they
assigned it. An advocate can file from it for the same reason they could file from
the printed journal in 1996.

The founder's guess — "maybe the data of all the books by OCR" — is the right
instinct pointed at the wrong party. **They did not need to OCR anyone's books.
They are the books.**

---

## 2 · Verified pricing — closing a gap `COMPETITIVE_TEARDOWN.md` §7 flagged

From their own subscription page, 8 Aug 2026. All per year, plus tax, with a
6-month option; **no free trial**, a limited free tier, EMI on credit cards.

| Plan | Price/yr | AI? | Coverage |
| --- | --- | --- | --- |
| AI Legal Research & Writing (International) | **₹30,000** | yes, "unlimited" | full |
| AI Legal Research & Writing (India only) | **₹20,000** | yes, "unlimited" | Indian case law |
| Keyword Search Package | **₹15,000** | **no** | full data, search only |
| AI Combo State | **₹10,000** | yes | SC + **one** High Court (18 to pick from) |
| Keyword Combo State | **₹5,000** | **no** | SC + one High Court |

Three things follow, and the third is the uncomfortable one.

**Their AI plan is ₹20,000/yr ≈ ₹1,667/mo.** That is in the same band as Prism
Pro (₹1,250/mo effective) which `COMPETITIVE_TEARDOWN.md` §6 already flags as
breaking `COMPETITIVE.md`'s pricing anchor. **Two independent competitors now sit
near ₹1,250–1,667/mo for AI legal research.** That is no longer one outlier.

**The ₹5,000/yr state package is the real threat to our target user.** A district
practitioner in one High Court's jurisdiction gets the Supreme Court plus their
own High Court, searchable, for **₹417 a month**. `COMPETITIVE_TEARDOWN.md` §4
identifies solo and small-chamber practitioners as exactly who we are for. Supreme
Today already has a product priced for them, and it has been on sale for years.

**"Unlimited" is their explicit selling point.** Both screenshots the founder
supplied lead on it — unlimited AI usage, OCR, translation, drafting, chat,
upload-to-analyse, against a competitor metering by credits. They have decided
that credit anxiety is the thing to attack. Whatever we price, **a credit meter is
a competitive liability in this market**, and PD-13 should be read with that in
mind.

---

## 3 · What they have that we do not

Not a feature list. Only the things that would actually decide a purchase.

**An editorial apparatus, populated.** From their user manual: **Authority Check**
(interactive timeline of later-citing cases, citation frequency, extracts) ·
**Cited By** · treatment classified **positive / negative / neutral** ·
**year-wise citation analysis** · **Headnotes** with jump-to-paragraph ·
**Important Paragraphs** and the treatment those paragraphs received ·
**Disposition** filtering.

That is a citator, and it is filled. It is the single most valuable thing they own
and the hardest for anyone to copy, because it was accumulated by people reading
judgments for forty years.

**Coverage.** Supreme Court, 24 High Courts, 17+ tribunal types named
individually (ITAT, NCLT, NCLAT, CAT, CESTAT, CIC, NGT, SEBI, TDSAT, DRT, DRAT,
CERC, GST Appellate, consumer fora). `docs/DATA_ADVANTAGE.md` §2g already found
that the only tribunal APIs available to us are barred scraper-resellers.

**Distribution that predates the product.** They sell through legal booksellers —
Ronit Law Agency lists both products — which reaches advocates who will never
install an app from a search result.

**Thirty years of trust.** An advocate who subscribed to the *Supreme Today*
journal is not evaluating a startup.

---

## 4 · Where they are weak — verified, not assumed

**Their own user manual documents no hallucination safeguard.** Read for exactly
this: it describes search, chat, drafting, document upload, Authority Check,
headnotes — and contains **no verification protocol for AI-generated output**, no
accuracy claim, and no statement that answers are constrained to retrieved
documents beyond "judgment links" appearing in results. Their AI is a layer over
a good database. **A good database is not a verification harness**, and the
difference has become a legal one — see §5.

**Provenance is not verification, and the Supreme Court has now said which one it
requires.** Their assurance is *"our data is authoritative."* The advocate's
obligation is *"you cross-verified."* Those are different claims and only the
second is now a professional-conduct standard.

**Engagement is thin.** 50K+ installs and **10 ratings** on Android; **1 rating**
on iOS. Whatever the sales channel achieves, the app is not something advocates
open daily.

**No daily loop.** `docs/ASO.md` §1 already found that none of the five
Play-listed competitors leads with a listing, a hearing, or a next date. Supreme
Today is a research library. It does not tell an advocate what happens tomorrow.
`PRODUCT_BRIEF.md`'s Tier-B-before-Tier-A ordering is not contradicted by the
strongest incumbent in the market — it is confirmed by them.

**No trial.** "No free trial offered." For a ₹20,000 annual commitment, that is a
real conversion barrier and the cheapest thing for us to be better at.

**Editorial cost scales with judgments.** Headnotes are written by people. That is
why the moat is deep and also why it cannot expand at the rate judgments are now
published. The **unreported** tail — district courts, the long High Court tail,
`DATA_ADVANTAGE.md`'s 17.8M-judgment AWS corpus — is where an editorial model
structurally cannot follow.

---

## 5 · The thing that changed the market, five weeks ago

***Pooja Ramesh Singh v. Jammu and Kashmir Bank Ltd.*, 2026 INSC 668, 2 July
2026** — Narasimha and Aradhe JJ. NCLT and NCLAT had both decided a matter on
judgments that did not exist. Verified against reporting, and the language is
exact:

> *"Such decisions are to be set aside even if an iota of fake or hallucinated
> material enters the decision-making process, as it would violate the sanctity
> of adjudication."*

> *"Such a decision is no decision in the eyes of the law, irrespective of
> whether such material had a direct or indirect bearing on the decision-making."*

> *"It is a misconduct on the part of an advocate to cite such judgments without
> verification."*

Courts were directed to adopt **zero tolerance** for producing, citing or using
AI-generated precedent without verification. Earlier, on **13 February 2026**,
Nagarathna and Bhuyan JJ dismissed an SLP over fabricated authorities:
*"Don't go by articles, go to the real judgement and verify"* — *"You should have
cross verified. That is the duty of the lawyer."*

`COMPETITIVE_TEARDOWN.md` §4 already caught the zero-tolerance line. What it did
not have is the **case, the citation, the date and the operative words**, and
those matter because the standard the Court set is not "use a good database". It
is **verification, per citation, by the advocate.**

**Nobody in this market — Supreme Today included — gives an advocate anything
they could show a judge to demonstrate they verified.** That is the gap. It is not
a better index; it is a different product.

---

## 6 · Strategy — one recommendation, not a menu

**Do not compete on corpus or headnotes. Compete on provable verification, and
own the daily loop they have left empty.**

Three parts, in order.

### 6a · Make verification an artefact the advocate can produce

We already store, per citation, per surface: `verification_state`,
`verified_by_source`, `shown_to_user`, `overruled_status_shown`, `surface`,
`match_confidence`, `created_at`, and `verified_by_source = 'ecourts'` meaning a
named human vouched. **Every field a verification record needs is already in
`citation_checks`, and nothing renders it as one.**

The product nobody has: a per-citation record showing what was checked, by which
tier, when, and what the good-law status was **at the moment of rendering** —
attachable to a draft. After *Pooja Ramesh Singh* an advocate is not buying
research; they are buying the ability to answer *"did you verify this?"*

This is small, it is ours, and it is the strongest answer to "their citations are
accurate": **so are ours, and we can prove it per citation.** Their authority is
institutional; ours is evidential. Only one of those is what the Court asked for.

### 6b · Fill the citator, mechanically, where they filled it by hand

Their Authority Check is the feature to fear. But we hold **192,197 citation
edges, 44,785 resolved, 11,765 already carrying a treatment other than a bare
mention** — 10,437 `followed`, 1,233 `distinguished`, 69 `overruled`, 19
`overruled_in_part`, 7 `doubted`, and 11,765 with the extracted phrase as
`evidence`. We are not starting from nothing; extraction works.

**And it is not reaching the surface. Measured today: 29 judgments are recorded
in the citation graph as overruled or doubted, and 7 of them still read
`overruled_status = 'none'` — so every surface renders them as good law.** The
extraction ran; the propagation to `judgments` did not. `pnpm --filter
@lawmind/harness citator` now reports this in one command.

Seven is small and the mechanism is not. This is the stale-overruled failure
arriving by the back door, and the harness cannot catch it —
`staleOverruledRate` measures whether a status *change* reaches the next read,
not whether a status that should exist was ever written.

**The honest comparison:** their citator is populated and ours effectively is not
— 22 flagged judgments out of 38,341. Our advantage is that ours can be filled by
running a pipeline rather than by hiring editors, and the pipeline mostly exists.

### 6c · Take the ground they have vacated

`ASO.md` §1 and §4 above agree: no competitor sells tomorrow's hearing. Supreme
Today, with 30 years of trust and 50K installs, has **10 ratings** — advocates buy
it and do not open it. `PRODUCT_BRIEF.md` says the loop creates the habit and the
library only prevents a comparison loss. The strongest incumbent's own engagement
numbers are the evidence for that.

### What NOT to do

- **Do not OCR law reports.** Their headnotes are their copyright — *Eastern Book
  Company v. D.B. Modak* protects the copy-edited version precisely. `CLAUDE.md`
  §6 already forbids it. It is also unnecessary: the judgment underneath is free.
- **Do not match tribunal breadth by buying it.** The available APIs are
  scraper-resellers whose access was never authorised (`CLAUDE.md` §6).
- **Do not meter AI by credits.** Their entire comparison asset attacks it.
- **Do not claim to beat them on accuracy until Gate S2 passes.** It currently
  fails. Saying otherwise would be the exact conduct *Pooja Ramesh Singh*
  sanctions, committed in marketing.

---

## 7 · For the founder — decisions I cannot take

1. **The pricing anchor now has two data points against it, not one.** Supreme
   Today's AI plan is ₹20,000/yr and Prism's is ~₹15,000/yr effective. PD-13 is
   settled and this does not reopen it, but the ₹5,000/yr single-High-Court tier
   reaches our exact target user and we have no answer at that price.
2. **A verification record (§6a) is not one of `PRODUCT_BRIEF.md`'s four
   features.** By that file's own rule this is an ask, not a plan. My
   recommendation is that it is the highest-value thing in this document.
3. **The users who told you their citations are accurate are the best available
   research.** Two questions worth putting to them: do they check the citation
   before filing, or trust the tool? And has a judge ever asked them how they
   verified? The answers decide whether §6a is a feature or the product.

## 8 · What has NOT been done

- **No hands-on testing.** No account was bought, so §3 and §4 rest on their own
  manual, pricing page and About page — which is more than marketing copy and
  less than use. `COMPETITIVE_TEARDOWN.md` §7's recommendation stands and now has
  a named first target: run our 30-query harness set against Supreme Today and
  record where it hallucinates. **We are the only party in this market with a
  fixed query set and a definition of relevance fixed before measuring.**
- **Play Store description not captured in full** — the listing renders client-side
  and returned only navigation chrome on three attempts. `ASO.md` §1 holds the
  fields that were readable.
- **Corpus size unquantified.** Their About page gives no judgment count. Neither
  courts-covered nor years-covered is a corpus number.
- **No confirmation of whether Authority Check treatment is editorial or
  automated.** It matters — a hand-built citator is a moat, a regex over "overruled
  in" is not — and their manual does not say.
