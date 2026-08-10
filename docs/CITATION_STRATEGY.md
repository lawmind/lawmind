# HOW LAWMIND WINS ON CITATIONS — measured 11 August 2026

The founder's question: *what are those millions of AWS documents for, and how do
we extend the data so we excel at giving advocates correct citations?*

**The short answer, and it reorders the work: the largest single win is not in
the AWS bucket at all. It is sitting unclaimed in the corpus we already hold.**

---

## 0 · THE FINDING THAT COMES FIRST — resolution doubles for free

`judgment_citations` holds **192,197 edges** and only **44,785 resolve (23.3%)**.
The standing explanation was that the other 77% point at High Court judgments we
do not hold. **Measured against production today, that explanation is wrong for
half of them.**

| | |
| --- | --- |
| unresolved edges | 147,412 |
| **unresolved edges whose normalised citation key matches something we ALREADY HOLD** | **49,616** |
| of those, resolving to **exactly one** judgment — safe | **49,605** |
| resolving to two or more — **must not resolve** | **11** |

| | now | after a safe re-run |
| --- | --- | --- |
| resolved edges | 44,785 | **94,390** |
| resolution rate | **23.3%** | **49.1%** |

**More than double, with no new data, no purchase, no GPU and no ingest.**

**A worked example, not an aggregate.** `[2010] 7 S.C.R. 79` sits unresolved in
`judgment_citations`, and *ADALAT PANDIT & ANR. versus STATE OF BIHAR* is in the
corpus carrying that citation.

**Why it happened, and it is two ordinary causes rather than one exotic one:**

1. **The edges were resolved before the concordance existed.** The 4,097 rows in
   `judgment_citation_aliases` were derived on 9–10 Aug; the edges were resolved
   before that. Every AIR and SCC citation the concordance can now name was
   unresolvable at the time it was tried. **16,848 edges contain `AIR` and every
   single one is unresolved.**
2. **Normalisation.** Real extracted strings carry PDF artefacts —
   `"(2014)14 SCC\n664"`, `"(1991) 1SCC598"`, `"[2016] 10 S.C.R.\n133"`,
   `"[2023] 12 S.C.R.806"`. Collapsing to an alphanumeric key resolves them; a
   stricter comparison does not.

**The 11 ambiguous ones are the whole safety story.** `A3d.4`'s rule — *exactly
one candidate, or nothing* — already covers them, and a re-run must apply it:
**a wrong alias is worse than a missing one.** Resolving 49,605 and refusing 11
is the correct outcome, not 49,616.

**Also found: 13,834 unresolved edges have an EMPTY `citation_text`.** They can
never resolve, by construction. That is an extraction defect, separate from the
above, and it is 9.4% of all unresolved edges.

---

## 1 · WHAT THE AWS DOCUMENTS ARE ACTUALLY FOR

`docs/HC_CORPUS_SURVEY.md`: **15,771,566 documents** in the last decade across 25
High Courts, free, CC-BY-4.0. `docs/DATASETS.md` argued against ingesting them
and **that argument still stands for ingesting them as a searchable corpus**:

- **no citation column in either metadata variant** — a judgment from that bucket
  is *searchable and not citable*;
- **the judgment share is 0.75%–18.64%** — most of it is procedural;
- **~3,956 GPU-hours** to embed a decade;
- **96.4 GB** of raw text.

**So do not ingest them as a corpus. Read them as EVIDENCE and throw the text
away.**

That inversion changes every cost. A citation-extraction pass needs **no
embedding, no vector storage, no OCR beyond the 0.2% that lack a text layer, and
no permanent text storage.** The measured cost is the one already published:
**186 ms per PDF → 4.2 days on eight workers** for the whole decade
(`HC_EXTRACTION_COST.md`). What it writes is edges and aliases — kilobytes per
judgment, not the 5,823 characters the text occupies.

### The three things that pass yields

**a · The concordance, at a scale nothing else reaches.** The technique is
already built and already works: courts print citations together —
`AIR 1980 SC 791 : [1980] 2 SCR 1067` — and we are keyed on S.C.R., so adjacency
resolves straight to a judgment id. **4,097 aliases came out of 38,341 Supreme
Court judgments.** Every High Court judgment citing a Supreme Court authority
prints the same pairings, and `A3d.3`'s corroboration rule means **more sightings
make each alias safer, not just more numerous.**

> **No number is projected here on purpose.** `CONTINUATION_PROMPT.md` §1 records
> a 274 GB estimate that was **7× too high** because a total was scaled by a row
> count without checking the unit matched. The yield per High Court document is
> **unmeasured**, and the honest first step is a **1,000-PDF sample** — the same
> instrument that answered extraction — not a multiplication.

**b · Treatment, which is the gap the citator actually has.** Today **81 of
38,341** judgments carry a non-`none` `overruled_status`, and `followed` /
`distinguished` sit at 11,723 / 1,517. That ceiling is structural: **a
Supreme-Court-only corpus can only show the Supreme Court overruling itself.**
High Court judgments discuss Supreme Court authorities constantly — *followed*,
*distinguished*, *relied on* — and `A3c` already has the extractor, the negation
handling and the precision rules. **It is starved of text, not of technique.**

**This is also the one thing Supreme Today sells that we cannot get free
elsewhere** — their Authority Check. Deriving it from the courts' own words is
**primary-source derivation, which `DATASETS.md` permits**, and it removes a
reason to pay ₹50,000/month.

**c · Existence evidence for citations we will never hold.** See §2 — it is the
biggest idea here and it needs a decision, not an implementation.

---

## 2 · THE PROPOSAL THAT NEEDS A DECISION — corroborated existence

**NOT DECIDED. NOT BUILT. Raised because `CITATION_HARNESS.md` is spec, and
`CLAUDE.md` forbids resolving an OPEN_DECISION alone.**

**The problem.** An advocate types `AIR 1995 Bom 123`. We do not hold Bombay High
Court and never will hold all of it. Tier 1 fails, Tier 2 needs two public
sources, Tier 3 needs a human at a CAPTCHA. So it renders **unverified** — which
is honest, and is also the state an advocate sees for a perfectly real citation.

**The observation.** If **200 High Court judgments in the AWS corpus print that
citation beside a consistent case name**, the citation demonstrably exists. That
is not an inference and not a model's opinion — it is **two hundred courts'
own words**, the same class of evidence `A3d.6` already blessed for the
concordance.

**What it would and would not say.** It would confirm **the citation is real and
names this case**. It would **not** confirm the judgment says what the advocate
claims it says, and it would **not** be Tier 1. Collapsing those is exactly how a
verification system starts over-claiming, so the wording would have to carry the
distinction the way `ecourts_bulk` carries *"a machine may not wear a human's
badge"*.

**What it would cost to decide.** A new `verified_by_source` value, a place in
`source-strength.ts`, a rule in `CITATION_HARNESS.md`, and a client label. **All
of that is spec, not code.** Recorded here; `docs/FOUNDER_QUEUE.md` is where the
decision belongs.

---

## 3 · THE ORDER, CHEAPEST AND MOST CERTAIN FIRST

Every step below is measured, and each is a prerequisite for the next.

| # | step | cost | measured effect |
| --- | --- | --- | --- |
| **1** | **Re-run the resolver** over existing edges, applying the exactly-one rule | **minutes** | **23.3% → 49.1% resolution** |
| **2** | Fix the **13,834 empty `citation_text`** edges | small | 9.4% of unresolved becomes resolvable-or-explained |
| **3** | Widen the extractor beyond its **five Supreme-Court-centric formats** | small | **zero today** — a prerequisite, not a win |
| **4** | **Sample 1,000 HC PDFs for citation yield** | hours | the number that decides step 5 |
| **5** | **Citation-only pass over the HC decade** — extract edges, discard text | 4.2 days / 8 workers | concordance + treatment at scale |
| **6** | Corroborated existence — **decision first** | spec | a new verification tier |

**Steps 1 and 2 need nothing from anyone.** Step 3 is the thing
`CURRENT_PLAN.md` correctly parked as *"zero present impact"* — that judgement
was right and **stops being right the moment step 5 runs**, which is exactly the
condition the plan attached to it.

**Step 5 does not require deciding the corpus question.** Extracting citations
and discarding text is not ingesting High Court judgments. The two decisions in
`§Q2` — citability and ~3,956 GPU-hours — **only bind if we ingest the documents
as searchable content**, and this route deliberately does not.

---

## 4 · WHY THIS IS THE MOAT, STATED PLAINLY

`docs/COMPETITIVE.md` and the founder both put Supreme Today first because they
pinpoint citations. **Pinpointing is two capabilities**: having the judgment, and
knowing the name an advocate actually types.

We will never win "having every judgment" — nor should we try, at 30M documents
of which most are procedural. **We can win "knowing the name", and the second is
what a zero-result failure actually is.** An advocate typing `AIR 1973 SC 1461`
and getting nothing reads it as *"no such case"* — the worst possible failure for
a product whose promise is that a citation is real. That is a **naming problem**,
not a retrieval problem, and naming is what §0, §1a and §2 all attack.

**The market has already priced the failure.** The public AI-hallucination
sanctions tracker records **1,598 court cases** involving fabricated citations by
June 2026, up from ~200 a year earlier — **~8 per day**, penalties to $110,204,
multi-year suspensions. **Verified citations are the product. Semantic ranking is
not.**
