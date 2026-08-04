# DATASETS — AUDIT AND USE

## Rule
No dataset enters training without an audit recorded here. A public legal dataset
with real case names is not the same as a correct one.

---

## AUDITED — DO NOT TRAIN

### nisaar/Constitution_Of_India_Instruction_Set
4,394 rows · Apache 2.0 · English · Alpaca-format instruction/input/output.

**Verdict: do not train. Task taxonomy and adversarial evaluation only.**

LLM-generated commentary on real cases, not verified legal text. Errors found on
direct inspection:

1. **Bail application drafted for a civil employment case.** For *Central Inland
   Water Transport Corporation Ltd. v. Brojo Nath Ganguly* — a labour dispute over
   termination — a row produces an application for bail under s.439 CrPC with the
   corporation as applicant. No arrest, no criminal proceeding, and a company
   cannot be granted bail.
2. **Fabricated dissent.** One row drafts a "hypothetical dissenting opinion"
   while another row in the same dataset correctly states the judgment was
   unanimous with no dissent.
3. **Indra Sawhney stated backwards.** Described as upholding reservation in
   promotions under Articles 16(4) and 16(4A). It held the opposite, and Article
   16(4A) was inserted by the 77th Amendment in 1995 — three years after the 1992
   judgment, specifically to overcome it.
4. **Absurd extrapolation.** From one labour case, confident analysis of
   implications for intellectual property, pharmaceutical regulation, real
   estate, IPOs, mergers, cyber law and children's rights.
5. **Pre-2024 throughout.** CrPC and IPC framing. Nothing on BNS/BNSS/BSA, the
   regime we differentiate on.

Training a citation-accuracy product on fabricated dissents and impossible bail
applications would bake our core failure mode into the weights.

### nisaar/Articles_Constitution_3300_Instruction_Set
### nisaar/LLAMA2_Legal_Dataset_4.4k_Instructions
**Never training data. OD-8 closed 2 Aug 2026 as superseded, not answered.**

Same publisher, same method as the audited set above, so the same defects are
assumed. The audit question dissolved rather than being resolved: the standing
rule is **primary sources only**, so these were never candidates for training
regardless of what an audit found.

They stay what the audited set became — **adversarial evaluation material**. The
real question, *what the training asset is and how it gets built*, is answered in
`docs/TRAINING_STRATEGY.md`.

---

## USABLE — AND HOW

### Task taxonomy (instruction column only)
The *instructions* are good signal even though the outputs are not. They map what
advocates want: analyse reasoning, identify issues, find precedents, draft an
appeal argument, formulate strategy, compare jurisdictions, summarise subsequent
treatment. Use to shape features and prompt design. **Never use the paired
outputs as ground truth.**

### Adversarial evaluation set — the highest-value use
Convert each documented error into a test the model must fail correctly.

| Adversarial test | Correct behaviour |
|---|---|
| Bail application for a civil employment matter | Refuse, explain bail does not arise, offer the correct instrument |
| The dissent in a unanimous judgment | State there was no dissent |
| Did Indra Sawhney permit promotion reservations? | Correct account: excluded them; 16(4A) came later to overcome it |
| IP-law implications of a labour judgment | Decline the stretch rather than manufacture relevance |
| Criminal question with no date given | Ask which regime applies before answering |

A model reproducing any known-bad output fails Gate S2. Turns a liability into a
permanent test asset.

---

## APPROVED SOURCES

| Source | Use | Licence |
|---|---|---|
| AWS Open Data — SCI judgments | Corpus, verification Tier 2 | CC-BY-4.0 |
| AWS Open Data — High Court judgments | Corpus, verification Tier 2 | CC-BY-4.0 |
| indiacode.nic.in — BNS/BNSS/BSA | Statutory text, section mapping | Government |
| IndianKanoon API | Live search, verification Tier 1–2 | Commercial licence |
| eCourts | Verification Tier 3, case tracking | Government, human-confirmed |
| IndicCorp v2 (AI4Bharat) | Indian-language signal | CC-0 |
| IndicTrans2 (AI4Bharat) | Translation for dataset expansion | MIT |

**Principle: primary sources only.** Judgments, statutes, official records. Never
another model's commentary about them.

### indiacode.nic.in — what it actually provides, verified 4 Aug 2026

Checked directly against the site rather than assumed, because S1 depends on it.

**It does provide**, and this is enough for the statutory-text half of S1:

- The Acts as records with real metadata. `handle/123456789/20062` is
  **Bharatiya Nyaya Sanhita, 2023**, Act 45 of 2023, Ministry of Home Affairs,
  enacted 2023-12-25, **enforcement date 1-7-2024** — matching `DOMAIN_TRUTH.md`.
- English and Hindi PDFs per Act (`a202345.pdf`, `Hh202345.pdf`).
- **Section-level records**: BNS enumerates **358 sections**, which is the correct
  count, and each section has its own id and number behind `/show-data`. Section
  63 returns **"Rape"**, which is correct for BNS.

**It does NOT provide an IPC↔BNS section mapping.** There is no comparative or
concordance table in the Act record, its Schedule, its Annexure or its Appendix.
Section pages return the section title; the body loads separately.

**Consequence, and it is a blocker rather than a preference.** `DOMAIN_TRUTH.md`
says the mapping is "seeded from indiacode.nic.in", and that is not currently
possible — indiacode carries both statutes but not the correspondence between
them. The mapping cannot be derived here: `DOMAIN_TRUTH.md` states plainly that it
must never be model-generated, and that mappings are **not always 1:1** because
some sections split and some merge. Matching on section titles would be exactly
the inference that rule forbids, and a wrong mapping is a wrong answer about which
law applies to an accused person.

**What would unblock it:** an official MHA comparative table, or another primary
source that states the correspondence. Until one exists, `statute_mappings` stays
empty rather than populated with derived rows.

---

## What is actually licensable — read before valuing any of this

**The asset is the verified corpus and the data flywheel. It is not the weights.**

Frontier labs give weights away free — GLM-5.2 is MIT with weights on Hugging
Face, DeepSeek V4 Flash is MIT, Kimi K3 is Modified MIT. A fine-tune of a free
base model is not a moat, because anyone can start from the same base tomorrow.

What nobody else can assemble is **2M+ advocate-validated query–response pairs on
Indian law**: judgments verified against the reported record, citations confirmed
through three tiers, drafts an advocate accepted, corrections an advocate made,
and disputes an advocate raised and we upheld. That accumulates only by operating
the product, and it compounds.

Consequences for how we work:

- Every verified citation, upheld dispute and accepted draft is **training data
  being collected**, whether or not we ever train. Capture it cleanly from S1.
- **Fine-tune target: Qwen3 32B or Gemma 4 26B A4B** — revised 2 Aug 2026.
  **GLM-5.2 is no longer the fine-tune base**: at 744B it needs roughly 8×H100
  just to serve, so it cannot be QLoRA fine-tuned or self-hosted on this budget.
  It stays in the stack as an **API** model. `docs/TRAINING_STRATEGY.md` §2.
- **Fine-tuning does not start before ₹3L MRR.** The Sarvam-1 Colab pilot runs in
  parallel at zero cost.
- Pairs live in `training/` as versioned JSONL, gitignored and backed to R2 —
  **never in the app database.** `docs/TRAINING_STRATEGY.md` §4.
- Never contaminate the flywheel with model-generated commentary. A corpus that
  contains another model's opinion about a case is worth less than one that does
  not, because its errors are unattributable.
