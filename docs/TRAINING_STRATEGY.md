# TRAINING STRATEGY

Created 2 August 2026, **superseding OD-8**. That decision asked which stale
instruction sets to audit. This one answers the question underneath it: what the
training asset actually is, and how it gets built.

Binding on how data is captured from S1 onward, even though no training runs
before ₹3L MRR.


---

## CORRECTION — 8 Aug 2026: what a fine-tune will and will not buy

**LegalCiteBench (arXiv 2605.10186) measured the thing this document assumes.**
**SaulLM-54B is pretrained on legal text and still scores 3.77 / 100 on
closed-book citation retrieval** — while topping the field on citation *error
detection* at **75.59**. Across 21 models, closed-book retrieval never exceeds
**6.80 / 100**, and **20 of 21 exceed a 94% Misleading Answer Rate** (a concrete
citation offered instead of abstaining). Scale does not rescue it either:
Llama-3.1-70B scores 3.82 against the 8B model's 1.47.

**So the expected benefit of a fine-tune has to move columns.** It can improve
how the model reads law, follows Indian drafting register, and judges whether a
supplied citation supports a proposition — the thing SaulLM is genuinely best at.
**It cannot make its citations real.** Only retrieval grounding does that, and
`docs/CITATION_HARNESS.md` steps 2–3 already require the model to reference only
judgment IDs handed to it.

Nothing in the plan below is withdrawn. The claim that changes is the *reason* to
do it: **a fine-tune is a quality-of-reasoning lever, never a citation-accuracy
lever.** Anyone who reads this document as "fine-tuning will reduce
hallucination" has read it wrong, and the benchmark is why.

`docs/TECHNICAL_MOAT.md` §1 has the full numbers.


## 1 · The asset is the dataset, not the weights

**Frontier labs give weights away free.** GLM-5.2 is MIT with weights on Hugging
Face. DeepSeek V4 Flash is MIT. Kimi K3 is Modified MIT. A fine-tune of a free
base model is not a moat, because anyone can start from the same base tomorrow
morning.

**Nobody else can assemble advocate-validated instruction pairs on Indian law.**
Judgments verified against the reported record, citations confirmed through three
tiers, drafts an advocate accepted, corrections an advocate made, disputes an
advocate raised and we upheld. That accumulates only by operating the product,
and it compounds.

**The instruction dataset is the licensable asset, and it is portable to any base
model.** Build it accordingly:

- **Model-agnostic format.** Never coupled to one architecture's chat template.
- **Versioned.** A pair's provenance and the date it was validated are part of
  the record, not metadata to be reconstructed later.
- **Never contaminated with model commentary.** A corpus containing another
  model's opinion about a case is worth less than one without it, because its
  errors become unattributable. Primary sources only — this is the same rule as
  `docs/DATASETS.md`, and it is what makes the set worth licensing.

---

## 2 · Hard constraint on base-model size

**GLM-5.2 is 744B parameters and needs roughly 8×H100 just to serve. Kimi K3 is
2.8T. Neither can be QLoRA fine-tuned or self-hosted on this budget.**

| Role                                | Model                                | Why                                                                      |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| API inference — search, extraction  | **DeepSeek V4 Flash**                | Cheapest capable, MIT, 1M context                                        |
| API inference — drafting, briefings | **Claude Sonnet 4.6**                | Quality where it is filed in court                                       |
| API inference — premium reasoning   | **GLM-5.2 via API**                  | MIT, ~168 tok/s, roughly 3× the throughput of DeepSeek V4 Pro or Kimi K3 |
| **Fine-tune target**                | **Qwen3 32B** or **Gemma 4 26B A4B** | Actually trainable and servable. **~$12–20 per QLoRA run**               |

**Recorded explicitly: we do not fine-tune GLM-5.2 or Kimi K3. We consume them
via API and fine-tune something we can afford to serve.**

### This reverses a decision, with cause

`TRD.md` §Model selection recorded on 1 Aug 2026 that **GLM-5.2 replaces
Qwen3.6-35B-A3B as the fine-tune target**, on throughput grounds. That reasoning
was sound about _inference_ and wrong about _training_: it compared tokens per
second and never priced the serving footprint. **A model we cannot afford to run
is not a fine-tune target at any throughput.**

GLM-5.2 keeps its place — as an API model for premium reasoning, where somebody
else owns the 8×H100.

Model names, parameter counts and throughput figures here are **the founder's
stated rationale, recorded as given. They are not independently benchmarked in
this repo** — measure before quoting any of them externally.

---

## 3 · Building the dataset alongside the app — not a separate project

This runs as a **background workstream from S1**, not a phase after launch. The
whole point is that the marginal cost is near zero if it is wired in as the
pipeline is built, and enormous if it is retrofitted.

### S1 — harvest as we ingest

**STATUS, verified 6 Aug 2026: not started. 0 of 50,000 pairs.**

> **Correction — this section described a pipeline that does not exist.** It read
> _"the corpus pipeline already parses every judgment into facts, issues,
> reasoning and holding."_ It does not. `services/ingest` fetches PDFs, extracts
> text, normalises whitespace and writes `judgments` rows with metadata. There is
> no structural parse of a judgment into its parts, no `training/` directory, and
> nothing emits instruction pairs. `.gitignore` did not cover `training/` either.
>
> This matters because the section's own argument is that the marginal cost is
> near zero **if wired in as the pipeline is built** and enormous if retrofitted.
> S1 is nearly complete and this was not wired in, so the cheap window is closing.

The structural parse has to be built before pairs can be emitted from it. Two
honest options, neither yet chosen:

1. **Build the parse in S1's remainder.** Indian reported judgments carry usable
   structure — headnote blocks, `Case Law Cited` lists, `[Paras N-M]` markers and
   an operative portion. A conservative parser over that structure produces pairs
   whose provenance is a span in a real judgment.
2. **Defer to S2 and harvest the harness instead.** Smaller volume, higher
   quality, and S2 produces advocate-reviewed pairs that are the ones impossible
   to buy anyway.

**Recommendation: option 2 for pairs, but capture the structure now.** The 50,000
figure was never load-bearing — §1 says the asset is _advocate-validated_ pairs,
and un-validated pairs extracted mechanically from judgments are the lowest-value
row in the whole strategy. What must not slip is the _capture_, which is cheap
now and expensive later.

### S2 — the harness becomes gold data

Every adversarial case and every advocate-reviewed output is a verified pair.
**Small volume, highest quality.** These are the pairs that would be impossible to
buy.

### S3 onward — the flywheel

**With consent**, every accepted search result, every draft the advocate keeps,
and every citation they add to a matter is a validated signal. **This is the
compounding asset.**

**Wire the consent and the logging in S3**, even though training is far later. A
signal not captured in S3 is not recoverable in month twelve, and asking for
retrospective consent is a conversation nobody wins.

Consent here is specific and separate from the PD-8 onboarding consent, which
covers AI assistance and the duty to verify. Using an advocate's accepted drafts
as training input is a different question and gets its own answer.

### S5 — Hindi pairs

Translate English pairs with **IndicTrans2**, then have the **two law graduates
review for legal register.** **Machine translation alone is not acceptable** — a
draft that reads translated is worse than English, which is the same reasoning
that gates Hindi drafting release in OD-5.

### Month 4+, at ₹3L MRR — the first real fine-tune

**Qwen3 32B, QLoRA via Unsloth, 50K pairs, roughly $14 on a rented H100.**

**Gated: the fine-tuned model must beat the RAG-only baseline on our own
benchmark, or it does not ship.** A fine-tune that merely matches retrieval is a
serving cost and a maintenance burden bought with nothing.

---

## 3a · The citation graph — a licensable asset in its own right

**Added 6 Aug 2026.** `judgment_citations` (`SCHEMA_TRUTH.md`) holds extracted
judgment-to-judgment edges: which authority cited which, where in the text, how
the later bench treated it, and **the court's own phrase that justifies the
treatment**.

This is not an instruction dataset and should not be filed as one. It is
**structured factual data about Indian case law**, and it is arguably more
licensable than pairs, for three reasons:

- **It is auditable.** Every edge carries `evidence` and `char_offset`, so any row
  can be traced to the sentence that produced it. A licensee can verify the
  dataset rather than trust it.
- **It is model-agnostic and does not age.** A citation network is a fact about
  what courts did. Instruction pairs are shaped by whatever a model needed at the
  time they were written.
- **Nobody has it cleanly for Indian law.** CaseMine sells a case tree as a
  product feature; no one sells the underlying graph as data.

**It carries the same discipline as everything else here.** Relationships come
only from the court's own annotation — never from a proximity heuristic. A first
implementation using a 400-character window produced **33 overrulings in 300
judgments against 143 in the whole corpus**, a ~30x over-fire, and put a
fabricated overruling on _N.P. Ponnuswami_ (1952), which the same passage marked
"referred to". That is precisely the contamination §1 forbids, and it arrived from
our own code rather than from a model.

**Standing rule out of that: no derived legal relationship enters the dataset
without a sample verified against source text.** Machine-derived facts about what
a court held are exactly as dangerous as a model's commentary, and are subject to
the same bar.

---

## 3b · Licensing constraints on the corpus — unresolved

**Recorded 6 Aug 2026 because selling API access to this data is a stated goal and
these constraints have never been written down.**

The corpus is **not ours outright**, and the terms differ by source:

| Source                           | Licence                                                                                   | What it permits                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Open Data — SCI, High Courts | **CC-BY-4.0**                                                                             | Commercial use and redistribution **with attribution**. Derived works allowed.                                                                                                            |
| indiacode.nic.in — BNS/BNSS/BSA  | Government                                                                                | Statutory text; unsettled whether attribution suffices for resale                                                                                                                         |
| IndianKanoon API                 | Commercial licence                                                                        | **Attribution mandatory** — the "powered by IKanoon" logo, prominent and unaltered. Their terms explicitly contemplate RAG and fine-tuning on that basis. See the correction below.       |
| e-SCR                            | Government                                                                                | Free, official                                                                                                                                                                            |
| **eCourts**                      | **Registrar's grant under a government scheme, 7 Aug 2026 — expires 12:00, January 2029** | **The broadest terms we hold, and the only ones with an end date.** Use of all available data · render it independently in our own UI · **train models on it** · CAPTCHA bypass. See §3c. |

### 3c · The eCourts grant — our broadest licence, and the only expiring one

Confirmed by the founder 8 Aug 2026: the registrar's grant, made under a
government scheme the founder enrolled in, permits **using and owning all
available eCourts data, displaying it independently inside Lawmind, and
training models on it**, until **12:00 on a day in January 2029**, after which
it is renewable for payment.

That is a stronger grant than anything else in the table above. It is also the
only one that **stops**, and that difference drives everything below.

**Transcribed as machine-enforced fields**, not remembered:
`independentDisplayPermitted` and `trainingPermitted` are fields on the grant in
`services/api/src/court/authorisation.ts`, evaluated only through accessors that
check grant-exists **and** not-expired **and** expressly-permitted. Both are
tested to flip to `false` at noon on the expiry day. These two are the most
likely of all the grant's permissions to be quietly assumed permanent, because
unlike harvesting **they leave no request in a ledger** — a UI simply keeps
rendering, and a training set simply keeps sitting on disk.

**The question this raises that nobody has answered, and it is not an
engineering one:**

> **What happens to a model trained on eCourts data after the grant expires?**

The training set is separable and can be quarantined. **Model weights are not.**
A fine-tune is a derived work of its training data, and if the licence to use
that data ends in January 2029, it is genuinely unclear whether a model trained
under it may keep being served afterwards. The same question applies to an
embedding fine-tune.

This is the identical shape as §3b's IndianKanoon caution — _permitted for our
own product is not clean title_ — with a clock attached. **Counsel, not an
engineering decision**, and it wants answering **before** the first fine-tune
rather than after, because the mitigation is cheap now and impossible later:

- **Tag every training pair with its source at extraction time.** A pair derived
  from eCourts data must be identifiable as such, so a 2029 decision can exclude
  it, retrain without it, or seek renewal on informed terms. Retrofitting
  provenance onto an un-tagged JSONL is not possible.
- Keep eCourts-derived pairs **separable** from the licensable dataset, exactly
  as IndianKanoon-derived material already must be.

**Recorded, not resolved.** The permission is real and broad and worth having;
the expiry is the part that needs a plan rather than optimism.

Three questions nobody has answered, all of which bear on an API business:

1. **Does CC-BY-4.0 attribution survive into an API response?** Selling query
   access to a derived index is not the same as redistributing the PDFs, and the
   attribution obligation has to land somewhere a licensee can see.
2. **Is the citation graph a derived work of the judgments, or an independent
   database?** Facts are not copyrightable, but the extraction is ours. This
   determines whether it can be licensed on our own terms.
3. **CORRECTED 7 Aug 2026.** This section previously read that IndianKanoon's
   terms "indicate the API is _not_ intended as raw extraction for building a
   competing database". **That was never checked against the terms page and is
   not in it.** The terms require attribution and explicitly contemplate RAG and
   fine-tuning on that basis. `docs/DATA_SOURCES.md` §2 quotes the text. The wrong
   reading had been steering us away from the largest source of Indian case law.

   **The caution that survives is narrower and still binding: permitted-with-
   attribution for our own product is not clean title to RESELL.** Keep anything
   derived from IndianKanoon separable from anything we intend to license — free
   to do now, impossible to retrofit. Nothing derived from IndianKanoon enters a
   licensable dataset without
   their agreement — which is sharper now that they ship Prism, a competing
   product (`COMPETITIVE_TEARDOWN.md` §2). Keep Tier 2 verification results
   separable from anything we intend to sell.

**These need counsel, not an engineering decision.** Same posture as OD-2: record
the gap plainly rather than let a default arrive by accident.

---

## 4 · Storage

**`training/` as versioned JSONL. Gitignored from the main repo, backed up to
R2. Never in the app database.**

Three reasons, all of them ones people get wrong:

- Training data in Postgres competes with request handling for the same
  connection pool and the same backups.
- Gitignored because JSONL diffs are useless and the repo becomes unclonable.
- Versioned because "which pairs trained this checkpoint" is the first question
  asked when a fine-tune regresses, and the only moment to answer it is before
  it happens.

**Pairs derived from sensitive-class data carry the same DPDP treatment as their
source.** A pseudonymised pair is still derived personal data — `PRIVACY_PII.md`
§Retention. Deletion of a matter deletes pairs derived from it.

---

## 5 · What this does not authorise

- **No training before ₹3L MRR.** Unchanged. The Sarvam-1 Colab pilot runs in
  parallel at zero cost.
- **No training on another model's commentary about law.** Standing rule.
- **No use of an advocate's data without the S3 consent** actually being in
  place, recorded, and revocable.
