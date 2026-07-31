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
**Not yet audited — OD-8.** Same publisher, same method. Assume the same defects
until audited to the standard above. Do not train on either before that audit
exists.

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
