# COMPETITIVE TEARDOWN — feature-level

Researched 5 August 2026 from primary sources (vendor pricing pages, product
pages) and secondary reviews. **Supplements `docs/COMPETITIVE.md`, which holds the
strategic position and the founder's landscape review. This file holds the
feature-level detail and does not restate it.**

Prices and claims move. **Verify before quoting any of these externally**, and
re-check before a pricing or roadmap decision rests on them.

Where a claim is a vendor's own marketing rather than something observed, it is
marked **[vendor claim]**. Nothing here has been tested hands-on — that is the
obvious next step and is listed at the end.

---

## 0 · What changed, and why this file exists

**IndianKanoon launched Prism, an eight-tool AI suite.** `docs/COMPETITIVE.md`
lists IndianKanoon only as a data source and verification tier, and lists e-SCR
under "free government". That framing is now out of date, and the gap matters for
three separate reasons:

1. Prism competes directly with **Tier A features 1 and 3** (search with citations,
   drafting).
2. Prism is priced **well below** the anchor `COMPETITIVE.md` uses to justify our
   pricing.
3. IndianKanoon is simultaneously our **verification Tier 2 supplier** and now a
   **competitor**. That is a supply risk nobody has costed.

None of this is a decision. It is a finding, and points 2 and 3 need the founder.

---

## 1 · Prism (IndianKanoon) — the new entrant that matters most

**https://indiankanoon.org/prism** · corpus: **30M+ Indian judgments** [vendor claim]

### Pricing — verified from their pricing page, 5 Aug 2026

| Tier | Monthly | Yearly | Credits | Storage | Court copies/mo | Query alerts |
|---|---|---|---|---|---|---|
| Free | ₹0 | ₹0 | trial only | — | 25 | 2 |
| Premium | ₹500 | ₹5,000 | 20× free | 500 MB | 250 | 25 |
| Pro | ₹1,500 | ₹15,000 | 100× free | 2 GB | 1,000 | 100 |

All prices + 18% GST. **Every tier gets the complete AI toolset** — the tiers meter
usage, not features.

### The eight tools

| Tool | What it does |
|---|---|
| **Know Your Kanoon** | Research chatbot over the IndianKanoon database, returns citations |
| **DocHub** | Drafting from **80+ templates**, plus AI edit, review and side-by-side compare |
| **Upload and Chat** | Q&A against a document the user uploads, answers reference that document |
| **CasePredictAI** | Predicts case outcomes, offers "multiple strategic approaches" |
| **Counter Argument Generator** | Rebuttals, opposing viewpoints, procedural defences |
| **Legal Sandbox** | Moot court simulation, entrance-exam prep |
| **NoteIK** | Document annotation (Premium and Pro) |
| **Query alerts** | Standing alerts on a search |

### What Prism does genuinely well

- **Corpus.** 30M+ judgments against our 38,341. They win this outright, and
  `COMPETITIVE.md` already tells us not to fight there.
- **Breadth of workflow tools** — eight surfaces against our four planned features.
- **Drafting depth** — 80+ templates against our planned 10, plus document
  *review* and *comparison*, which we have not scoped at all.
- **Price.** Pro at ₹1,250/mo effective (annual) for the full toolset.
- **Distribution.** IndianKanoon is where Indian advocates already are. Prism is a
  tab on a site they visit daily. That is a customer-acquisition advantage we
  cannot buy.

### Where Prism is weak — and this is our opening

- **No verification layer that we can find.** Their product page carries no
  accuracy guarantee and no verification disclaimer. "Returns citations" is not
  "confirms the citation exists."
- **CasePredictAI is a liability surface, not a feature.** Outcome prediction is
  the least defensible thing to sell an advocate under a misconduct standard.
  **We should not copy it.** See §4.
- **No case tracking, no cause lists, no `next_hearing_date`, no briefing.** Query
  alerts watch a *search*; they do not watch *your matters*.
- **No matter workspace.** Nothing accumulates.
- **Their own positioning concedes the ground.** One review summarises the fit as
  *junior advocates doing preliminary research, law students, and practitioners
  "not yet managing live matters at scale."* That sentence is our wedge, written
  by someone else.

---

## 2 · The supplier-competitor conflict — flag for the founder

`docs/DATASETS.md` lists IndianKanoon as an approved source. `docs/CITATION_HARNESS.md`
makes it **Tier 2 of verification**. `DEPLOYMENT.md` already reserves
`INDIANKANOON_API_KEY`.

**We are planning to depend, for the verification step that defines the product, on
the API of a company that now sells a competing product.**

Their API pricing (verified 5 Aug 2026): ₹0.50/search, ₹0.20/document,
₹0.05/fragment; ₹500 free credit; ₹10,000/month free for verified non-commercial
use; **mandatory "Powered by IKanoon" attribution**. Their terms also indicate the
API is *not* intended as a raw-extraction tool for building a competing database.

This is the same class of risk OD-1 identified for `bharat-courts` ("bus factor of
one") but sharper, because the dependency is on a **competitor's commercial
goodwill**, not a maintainer's availability.

**Not resolvable by me.** Options that exist, none chosen:
- accept the dependency and the attribution, and treat Tier 2 as replaceable;
- make Tier 2 source-agnostic so e-SCR or the AWS datasets can substitute;
- reduce Tier 2 to the AWS Open Data cross-check we already have rights to.

The third is closest to what `CITATION_HARNESS.md` already describes — Tier 2 is
"IndianKanoon **and** cross-check against the AWS S3 open judgment datasets", with
`public_x2` written only when **both agree**. Worth confirming whether the harness
can degrade to AWS-only without losing the `public_x2` guarantee.

---

## 3 · The field, feature by feature

| Product | Corpus | Research | Drafting | Case tracking | Briefing | Verification | Price |
|---|---|---|---|---|---|---|---|
| **Prism** (IndianKanoon) | 30M+ | chatbot + citations | 80+ templates, review, compare | no | no | none stated | ₹500–1,500/mo |
| **SCC Online AI Pro** | curated + headnotes | conversational | some | no | no | **89% accuracy** [vendor claim] | ~₹5,000/mo |
| **Manupatra** | curated | AI assistant | yes | no | no | not stated | quote-only |
| **CaseMine (AMICUS)** | large | conversational, summaries, bundles | some | no | no | not stated | mid |
| **LegitQuest** | large | iSearch | **iDraf** — suggests precedent as you write | no | no | not stated | mid |
| **VIDUR AI** | curated | Q&A | some | no | no | knowledge sets human-reviewed, **not per answer** | mid |
| **Jhana** | — | research | yes | no | no | citation accuracy **automated check** | mid |
| **Law4u** | bare acts + judgments, 1M+ judgments [vendor claim, Play listing] | chatbot ("Law AI Bot", "Judgment AI") | 3,200+ drafts [vendor claim], PDF export | no | no | none stated | free + IAP |
| **Lawyyar** | not stated | "Law Hub" search + case-file upload/analyse ("Case Analyzer") | "Case Automation" — drafting, unscoped in listing | **yes** — "Case Nest": reminders, status updates | no | none stated | not verified [Play listing gives no price tier] |
| **LegalKart Lawyer** | none — not a research app | none | none | **yes**, but as a **lead/practice-management tool** (client leads, invoicing, WhatsApp), not a court-record tracker | no | n/a | free [lead-gen model, take-rate not stated] |
| **SupremeToday AI** | not stated | Boolean + "conceptual search", doc simplification, doc review/**compare** | not stated as a distinct feature | no | no | none stated — sells **endorsement** ("endorsed by various High Court and judicial officers"), not an accuracy number | not verified [Play listing gives no price tier] |
| **e-SCR** | SC complete | keyword | no | no | no | it *is* the source | free |
| **Provakil / Notify** | — | no | no | **yes** | no | n/a | low |
| **Harvey** | no Indian court data | strong | strong | no | no | not stated | $1,000+/seat |
| **Lawmind** (planned) | 38,341 SC + statutes | hybrid + dense | 10 templates | **yes** | **yes** | **three-tier, zero threshold** | ₹799–3,499/mo |

**Lawyyar, LegalKart Lawyer and SupremeToday AI added 8 Aug 2026**, sourced from
their own Play Store listings only (`docs/ASO.md` §1 has the full teardown,
ratings and install counts) — **no pricing page, no hands-on testing**, so
"not verified" above means exactly that and not "free." `docs/ASO.md` §1b adds
one more data point worth recording here: **SupremeToday AI's only iOS review is
1 star, reporting the app "doesn't work, can even create account."** One review
is not a trend, but it lands exactly where this section already placed them —
selling AI research depth on High Court endorsement rather than a stated
accuracy number, with nothing observed hands-on to confirm the depth claim
either. Worth a real account-creation test before any positioning leans on
"more reliable than SupremeToday," not just cited from one review. Two corrections to the
assumption implicit in `docs/COMPETITIVE.md`'s single "Consumer apps: Law4u,
Lawyyar, LegalKart" row: **LegalKart Lawyer is not a research or drafting
competitor at all** — its own listing describes a lead-generation and
practice-management tool for lawyers (accept client leads, invoice, WhatsApp
clients), closer to a lightweight Clio than to Law4u. It competes with Lawmind's
matter workspace at the edges, not with search or drafting. **Lawyyar is the
closer analogue to Prism** at consumer scale — research, drafting automation and
case tracking in one app — but with no stated verification and, per its Play
listing, only 500+ installs, far behind Law4u's 1M+.

### What each does best — the honest list

1. **Prism — price-to-breadth.** Full AI toolset at ₹1,250/mo effective.
2. **CaseMine — the case tree.** Graph view of how a judgment cites and is cited.
   For litigation strategy this is genuinely the best single feature in the market
   and **we have no equivalent.**
3. **LegitQuest — iDraf.** Suggests precedent *while drafting*, not as a separate
   search. Right interaction model.
4. **SCC Online — headnotes and authority.** Judges prefer SCC headnotes. Also the
   only one publishing an accuracy number at all.
5. **Law4u — accessibility.** 18 regional languages, text-to-speech, PDF export.
   **They are far ahead of us on reach**: we ship 2 languages.
6. **e-SCR — trust and price.** Official, free, neutral citations.
7. **Provakil / Notify — case tracking** that actually works today.
8. **Harvey — depth of reasoning**, on documents rather than Indian court data.

---

## 4 · Accuracy — the market's weakest point, and our best one

What competitors actually claim:

- **SCC Online AI Pro: 89%** research accuracy [vendor claim]
- **Jhana:** citation accuracy checked "by automated means"
- **VIDUR:** knowledge sets reviewed by human experts — **not per answer**
- **Prism, CaseMine, LegitQuest, Law4u:** no accuracy claim located
- **Free chatbots:** none

**Nobody in this market publishes a per-citation verification guarantee.** 89% is
the best number on offer, and 89% means roughly one in nine answers carries
something wrong into a filing.

Why that is now existential rather than embarrassing — verified against reporting,
5 Aug 2026:

- The **Supreme Court has called for "zero-tolerance"** on unverified AI-generated
  precedent and held that citing it is **"misconduct on the part of an advocate."**
- The Court held that a decision resting on hallucinated material **"is no decision
  in the eyes of the law"** and must be set aside **"even if only an iota of
  fabricated material entered the reasoning."**
- A Bengaluru tax tribunal **recalled a ~₹669-crore order** over four non-existent
  citations.
- The **Bombay High Court imposed ₹50,000 costs** in January 2026 for fake case law
  in written submissions.
- Reporting in July 2026 catalogued **ten separate hallucination cases** in Indian
  courts.

And the observation that should shape our positioning more than any other:

> Smaller practitioners, lacking access to expensive journals and portals, fall
> back on free public AI tools — which are the most hallucination-prone — so the
> risk concentrates in the lower courts.

**The advocates most exposed to this are exactly our target user**: solo and
small-chamber practitioners in district and High Courts who cannot justify
₹51,500/year. We are not selling them a research tool. We are selling them
indemnity against a misconduct finding.

`docs/CITATION_HARNESS.md` already specifies the mechanism — three tiers, an
explicit `unverified` state, zero silent-drop, render-from-database-row. **No
competitor has anything comparable.** The gap is that we have not yet *proved* it:
Gate S2 exists precisely to produce that evidence, and the numbers it produces are
the most valuable marketing asset in this document.

---

## 5 · Accessibility and experience — where we are behind

Honest assessment, because the founder asked for it:

| Dimension | Best in market | Lawmind |
|---|---|---|
| Languages | **Law4u: 18** | 2 (en, hi) |
| Text-to-speech | **Law4u** | none scoped |
| Offline | — | **hard requirement, ours to win** |
| Mobile-first | Law4u, Lawyyar | **ours, by design** |
| Sunlight legibility | not addressed by anyone | **contrast 0.5 / brightness 1.3 gate** |
| Large touch targets | not addressed | **≥52px in courtroom screens** |
| One-handed, 30-second use | **nobody** | adjournment capture, <4s target |
| Precedent visualisation | **CaseMine case tree** | none |

Two conclusions:

**We are behind on reach and ahead on conditions of use.** Nobody else has designed
for an advocate standing in a corridor, one hand free, bad signal, bright daylight,
over fifty. That is a real and defensible difference, and it is not visible in a
feature comparison table — which is exactly why `PRODUCT_BRIEF.md` says the daily
loop is the product and the library is table stakes.

**18 languages is a marketing number, not a legal-quality one.** OD-5 already
settled that Hindi drafting ships gated on law-graduate review, because *"a bad
search result is discarded in a second, a bad draft gets filed."* Law4u's 18
languages are machine translation over a consumer app. Matching the count would be
easy and wrong; the defensible claim is **fewer languages at genuine legal
register**. That should be said explicitly in marketing rather than conceding the
comparison.

---

## 6 · What this implies — for decision, not for me to take

1. **`COMPETITIVE.md`'s pricing anchor needs re-examination.** It anchors on SCC
   Online at ~₹5,000/mo to argue "Expert at ₹3,499 is inside an existing budget."
   Prism Pro delivers a full AI toolset at **₹1,250/mo effective**. The anchor for
   *AI research specifically* is now roughly 4× lower than the doc assumes.
   **PD-13 is settled and this does not reopen it** — but the *justification*
   recorded in `COMPETITIVE.md` no longer matches the market, and someone should
   decide whether that changes the tiers or just the sales argument.

2. **The supplier-competitor conflict in §2** needs a position before S2 depends on
   IndianKanoon.

3. **Two feature gaps worth considering**, neither currently scoped: a **precedent
   graph** (CaseMine's best feature) and **document review/compare** (Prism's
   DocHub). Both are Tier A adjacent. Neither is in `PRODUCT_BRIEF.md`'s four
   features, so per that file's own rule — *"if what you are about to build does
   not serve one of the four features, stop and ask"* — this is an ask, not a plan.

4. **Do not build outcome prediction.** Prism's CasePredictAI is the one feature we
   should deliberately decline. It cannot be verified, it cannot be sourced to a
   primary record, and it invites exactly the reliance the Supreme Court is
   sanctioning. Declining it publicly is better positioning than matching it.

5. **Gate S2's numbers are the marketing.** In a market whose best published claim
   is 89%, a measured zero-hallucination and zero-silent-drop rate is the strongest
   asset we will own. It should be published, with methodology.

---

## 7 · What has NOT been done

- **No hands-on testing.** Everything above is from vendor pages and reviews.
  The highest-value next step is running our own 30-query harness set
  (`CITATION_HARNESS.md`) against Prism, CaseMine and SCC Online and recording
  where they hallucinate. That converts this document from research into evidence,
  and it is the same fixed query set we gate ourselves on.
- **Prism's actual retrieval quality is unmeasured.** 30M judgments is a corpus
  claim, not a relevance claim.
- **No pricing verified for CaseMine, LegitQuest, VIDUR, Jhana, Manupatra, Lawyyar,
  LegalKart Lawyer, or SupremeToday AI** — the last three's Play listings state no
  price tier at all, which is itself worth re-checking hands-on before assuming
  free.
- **`docs/ASO.md` §1 competitor teardown is done, 8 Aug 2026**, Play Store side —
  titles, short descriptions, ratings, installs for all five ASO-named apps
  (Law4u, Notify Court Case Status, Lawyyar, LegalKart Lawyer, SupremeToday). iOS
  side and screenshot narratives remain open, noted there.
