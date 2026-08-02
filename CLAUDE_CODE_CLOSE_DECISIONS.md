# CLAUDE CODE — CLOSE THE OPEN DECISIONS

Record every decision below in `docs/OPEN_DECISIONS.md` under **Resolved**, with the
reasoning. Update every downstream doc named. Then report.

---

## OD-4 — DATA SOURCES AND EMBEDDINGS · RESOLVED

### Where the data comes from — all free, no account

**AWS Open Data, Mumbai region (`ap-south-1`), CC-BY-4.0. AWS sponsors storage and
transfer. No AWS account or credentials required.**

```bash
# Supreme Court — 1950 to 2025, English + regional languages
aws s3 ls --no-sign-request s3://indian-supreme-court-judgments/

# High Courts — ~15.9 million judgment PDFs, all 25 HCs
aws s3 sync s3://indian-high-court-judgments/data/tar/ ./data/tar/ \
  --exclude "*" --include "*/court=27_1/*" --no-sign-request
```

Both ship raw metadata as JSON and structured metadata as Parquet. Tar files exist
for bulk download. Court and bench codes are in the dataset docs — replace `~` with
`_` in court codes when building paths.

Docs: `github.com/vanga/indian-high-court-judgments` (also has an Athena tutorial
if we want SQL over the metadata before downloading PDFs).

**Do not attempt all 15.9M in S1.** Ingest in this order:

1. **Supreme Court, complete** — 1950–2025. This is the citation backbone.
2. **BNS / BNSS / BSA** from indiacode.nic.in, plus the IPC↔BNS mapping.
3. **High Courts, last 10 years** — the practical working set.
4. **High Courts, historical** — background job after launch.

Record the count at each stage. Stage 1 + 2 is enough to pass Gate S1.

### Supporting sources

| Source | Use | Cost |
|---|---|---|
| e-SCR (Supreme Court portal) | Neutral citations, court-formatted PDFs. **Verification Tier 2** | Free |
| IndianKanoon API | Live search, verification Tier 2 | ₹10,000/month free tier for non-commercial; commercial licence after revenue |
| indiacode.nic.in | All Central and State Acts, BNS/BNSS/BSA | Free |
| IndicCorp v2 (AI4Bharat) | Indian-language signal, 20.9B tokens | Free, CC-0 |
| IndicTrans2 (AI4Bharat) | Translation for dataset expansion | Free, MIT |

### Embeddings — self-hosted BGE-M3

No new vendor, no recurring cost, strong Hindi and English.

One-time corpus embedding runs as a batch job on a **rented GPU** — Lambda Labs or
RunPod, not Railway. Query-time embedding runs on Railway CPU; a single query is
fast enough there.

Budget: **$40–120** for stage 1+2 depending on corpus size. A single A100 at roughly
$1.30/hour, 20–60 hours.

### Storage budget

| Item | Estimate |
|---|---|
| GPU for embedding (one-time) | $40–120 |
| Object storage for source PDFs (R2) | $15–40/month |
| Postgres + pgvector on Railway | Included in existing plan until ~5M vectors |
| **Total to a searchable corpus** | **under $200** |

Record all of this in `docs/OSS_STACK.md`.

---

## OD-8 — SUPERSEDED. TRAINING DATA STRATEGY REPLACES IT.

Delete OD-8. The nisaar datasets are stale and were never going to be training data
— primary sources only.

Create `docs/TRAINING_STRATEGY.md` recording the following.

### The asset is the dataset, not the weights

Frontier labs give weights away free under MIT. Nobody else can assemble
advocate-validated instruction pairs on Indian law. **The instruction dataset is the
licensable asset and it is portable to any base model.** Build it accordingly —
model-agnostic format, versioned, never coupled to one architecture.

### Hard constraint on base-model size

GLM-5.2 is 744B parameters and needs roughly 8×H100 **just to serve**. Kimi K3 is
2.8T. Neither can be QLoRA fine-tuned or self-hosted on this budget.

Therefore:

| Role | Model | Why |
|---|---|---|
| API inference — search, extraction | DeepSeek V4 Flash | Cheapest capable, MIT, 1M context |
| API inference — drafting, briefings | Claude Sonnet 4.6 | Quality where it is filed in court |
| API inference — premium reasoning | GLM-5.2 via API | MIT, ~168 tok/s, roughly 3× the throughput of DeepSeek V4 Pro or Kimi K3 |
| **Fine-tune target** | **Qwen3 32B or Gemma 4 26B A4B** | Actually trainable and servable. ~$12–20 per QLoRA run |

Record explicitly: **we do not fine-tune GLM-5.2 or Kimi K3. We consume them via
API and fine-tune something we can afford to serve.**

### Building the dataset alongside the app — no separate project

This runs as a background workstream from S1, not a phase after launch.

**S1 — harvest as we ingest.** The corpus pipeline already parses every judgment
into facts, issues, reasoning and holding. Emit instruction pairs from that same
pass at near-zero marginal cost. Target 50,000 English pairs by the end of S1.

**S2 — the harness becomes gold data.** Every adversarial case and every
advocate-reviewed output is a verified pair. Small volume, highest quality.

**S3 onward — the flywheel.** With consent, every accepted search result, every
draft the advocate keeps, every citation they add to a matter is a validated
signal. This is the compounding asset. Wire the consent and the logging in S3 even
though training is far later.

**S5 — Hindi pairs.** Use IndicTrans2 to translate English pairs, then have the two
law graduates review for legal register. Machine translation alone is not
acceptable — a draft that reads translated is worse than English.

**Month 4+, at ₹3L MRR — first real fine-tune.** Qwen3 32B, QLoRA via Unsloth,
50K pairs, roughly $14 on a rented H100. Gate it: the fine-tuned model must beat the
RAG-only baseline on our own benchmark or it does not ship.

Storage: keep pairs in `training/` as versioned JSONL, gitignored from the main repo,
backed to R2. Never in the app database.

---

## OD-5 — HINDI DRAFTING SHIPS · RESOLVED

Multilingual is a competitive requirement — Law4u ships 18 languages. Hindi
drafting ships.

**Gated, not ungated.** Built in S5, released only when the two Hindi law graduates
approve the register on 20 sampled drafts. English drafting is not blocked by that
gate.

Tamil and Bangla are post-launch. Thailand is out of v1 entirely — civil law, no
binding precedent, our verification moat does not transfer. Revisit after ₹1Cr ARR.

Remove Thai from every language list. Keep the i18n architecture multi-locale so
adding one later is not a rewrite.

---

## OD-6 — SENSITIVE DATA ROUTING · RESOLVED

**Route by data class. Pseudonymise before any sensitive-class call.**

| Class | Contents | Provider |
|---|---|---|
| **Public** | Judgments, statutes, bare acts — already published | DeepSeek V4 Flash. No privacy question; this text is public record |
| **Sensitive** | Uploaded documents, matter notes, party names, client detail | **Pseudonymise first**, then Claude (Anthropic has written data-processing terms) |
| **Never sent** | A full client file with no legal reason to leave the device | Stays local |

**State the limitation honestly, everywhere.** Automated PII detection handles
roughly 80%. That is not 100% and must never be described as such — not in product,
not in marketing, not to an advocate. The remaining exposure is disclosed plainly
and high-sensitivity matters get a manual review path.

**Never mix documents in one prompt.** Multiple case files in a single context
creates cross-contamination — the model conflates parties between matters. One
document per call. Record this in `docs/PRIVACY_PII.md` as a hard rule.

Use Presidio (Microsoft, MIT) as the detection base, but **evaluate it on real
Indian court documents before trusting it**. Indian names, transliteration variants
and Devanagari are materially harder than the English benchmarks suggest.

---

## OD-7 — PADDLEOCR, AND OCR SHIPS IN V1 · RESOLVED

PaddleOCR primary (Apache 2.0, strong Devanagari, good layout and table detection).
Tesseract as fallback (Apache 2.0, mature Indian language packs).

**OCR intake ships in v1.** The product is a complete ecosystem — an advocate should
never need another app for a law-related task.

Still run the bake-off in S4, but as tuning rather than selection: 50 real scanned
orders — good scans, bad photocopies, angled phone photographs, Hindi orders.
**Measure field-extraction accuracy, not character accuracy.** 98% characters with a
corrupted hearing date is a failure.

The advocate confirms every extracted field before anything saves. Non-negotiable.

---

## OD-1 — COURT DATA · TRIAL WITH A FALLBACK IN HAND

### The fallback that changes the negotiation

**`bharat-courts`** — MIT, on PyPI, Python 3.11+. Covers case status by CNR or party
across 25 High Courts and 700+ District Courts, court orders with PDF download,
**cause lists**, judgment search with pagination, and the Supreme Court recent-judgments
feed. Automatic CAPTCHA solving via ddddocr at ~75% accuracy with 5 retries
(≈0.1% total failure).

**Two things disqualify it as a drop-in vendor replacement, and both are in its own
docs:**

1. **`next_hearing_date` is not returned.** Along with `status`, `registration_date`
   and `judges`, it sits behind `o_civil_case_history.php`, which the SDK does not
   call yet. That field is the entire basis of the hearing briefing.
2. **Bus factor of one.** 6 stars, 2 forks, 37 commits, one maintainer.

It is also worth noting the CAPTCHA question. Our rule is that the *advocate* solves
the eCourts CAPTCHA in the verification flow. Automated solving for bulk public
judgment data is a different and greyer question — take a view from counsel before
relying on it in production.

### The trial — one afternoon

1. Get **20 real CNR numbers** from the advocate on retainer's live matters.
2. Install `bharat-courts`, run all 20 through it. Record: does it return the case,
   does it return the orders, does it return a cause list, how long does it take.
3. Trial **Vakeel360** and **eCourtsIndia** on the same 20. Both offer trials — ask
   for one rather than paying first.
4. Score on **freshness**: does a listing appear the same day the court publishes it?
   Not on price. If a briefing is late even once, the wedge feature is dead.
5. Cost expectation: Vakeel360 is fixed monthly with no per-call charge;
   eCourtsIndia is per-call with broader coverage. Budget ₹15,000–40,000/month for
   whichever wins.

### Build regardless

The court adapter interface ships with the **manual path fully working** — the
advocate types the next date themselves, which is what they do on paper today
anyway. `bharat-courts` becomes a second implementation behind the same interface.
The paid vendor becomes a third if it wins the trial. Nothing above the interface
changes.

---

## OD-2 — CLOSED

Founder has taken counsel's view. Record as resolved. Keep the Railway Singapore
region documented as a known position with a migration path before May 2027.

---

## OD-3 — STORE BILLING · RESOLVED

### What the terms actually say

| Route | Fee | Notes |
|---|---|---|
| Google Play, standard | **15%** on subscriptions | Has been 15% from day one since Jan 2022 |
| Google Play, India alternative billing | **11%** | CCI-ordered. Service fee reduced by 4% |
| Apple, Small Business Program | **15%** | Under $1M annual. **Enrol day one** |
| **Razorpay, off-app (Firm and Enterprise)** | **~2%** | No store cut. Invoiced, activated by redemption code |

India's domestic Play rates do not change until **30 September 2027** — the
service-fee/billing-fee split rolling out elsewhere in 2026 does not reach India
before then.

### The decision

**Launch on standard store billing. Do not build alternative billing yet.**

The 4% saving is real but the work is not small — a payment processor, Indian tax
handling, and a compliant choice screen, described as taking months rather than
weeks. At ₹1,999/month that 4% is ₹80 per user per month: roughly ₹3.8L/year at 400
users. Worth building at 1,000+ paying users, not at launch.

**Do immediately:** enrol in the Apple Small Business Program. It halves the
commission from 30% to 15% and is manual enrolment that people forget.

**Where the margin actually comes from:** Firm and Enterprise are invoiced off-app
through Razorpay at ~2%, not 15%. Those are your highest-value contracts and they
carry no store tax at all. That is worth more than the 4% alternative-billing
saving, and it is already the plan.

Add **OD-10: revisit alternative billing at 1,000 paying users.**

---

## OD-9 — DEFERRED, NOT BLOCKING

ASO tool selection waits until the app is ready. Move it out of blocking and note
it against S8. Budget $50–100 for one month of AppTweak or App Radar, pulled just
before launch and cancelled after.

---

## THEN

Update `docs/OPEN_DECISIONS.md`, `docs/OSS_STACK.md`, `docs/PRIVACY_PII.md`,
`docs/OCR_PIPELINE.md`, `TRD.md`, `PRD.md`, `BUILD_GUIDE.md` and the new
`docs/TRAINING_STRATEGY.md`.

Report what remains open. My expectation: **OD-1 (trial pending)** and **OD-10
(deferred)**. Nothing should block S1.

Then stop. S1 starts in a fresh session.
