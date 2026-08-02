# TRAINING STRATEGY

Created 2 August 2026, **superseding OD-8**. That decision asked which stale
instruction sets to audit. This one answers the question underneath it: what the
training asset actually is, and how it gets built.

Binding on how data is captured from S1 onward, even though no training runs
before ₹3L MRR.

---

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

| Role | Model | Why |
|---|---|---|
| API inference — search, extraction | **DeepSeek V4 Flash** | Cheapest capable, MIT, 1M context |
| API inference — drafting, briefings | **Claude Sonnet 4.6** | Quality where it is filed in court |
| API inference — premium reasoning | **GLM-5.2 via API** | MIT, ~168 tok/s, roughly 3× the throughput of DeepSeek V4 Pro or Kimi K3 |
| **Fine-tune target** | **Qwen3 32B** or **Gemma 4 26B A4B** | Actually trainable and servable. **~$12–20 per QLoRA run** |

**Recorded explicitly: we do not fine-tune GLM-5.2 or Kimi K3. We consume them
via API and fine-tune something we can afford to serve.**

### This reverses a decision, with cause

`TRD.md` §Model selection recorded on 1 Aug 2026 that **GLM-5.2 replaces
Qwen3.6-35B-A3B as the fine-tune target**, on throughput grounds. That reasoning
was sound about *inference* and wrong about *training*: it compared tokens per
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

The corpus pipeline already parses every judgment into **facts, issues, reasoning
and holding**. Emit instruction pairs from that same pass. **Target: 50,000
English pairs by the end of S1.**

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
