# OPEN DECISIONS

Unresolved. **Never silently resolve one.** If your work touches an OD, surface it
and stop.

## OD-1 — Court monitoring vendor · BLOCKS S3
Vakeel360 (fixed monthly, no per-call charge) vs eCourtsIndia (per-call, broader
coverage, faster re-scrape).
**Decide on data freshness, not price.** Trial both against 20 real CNR numbers
from the advocate on retainer's live matters. If a briefing is late or wrong even
once, the wedge feature is dead.
Build proceeds behind the adapter interface; manual path works meanwhile.

## OD-2 — DPDP data residency · BLOCKS public launch, not build
Railway has no India region. Singapore is nearest. DPDP compliance deadline
13 May 2027. Needs counsel's written view on whether Singapore residency is
defensible in the interim, plus a costed migration path.

## OD-3 — Google Play alternative billing, India
Post-CCI ruling, Play's India billing terms have shifted and may reduce the
Android cut below 15%. Confirm before finalising billing in S5. Apple Small
Business Program enrolment is not open — do it day one regardless.

## OD-4 — Embeddings provider · BLOCKS S1
Corpus embedding is one-time batch; query embedding is ongoing. Candidates:
self-hosted BGE-M3 (no vendor, needs a GPU hour), Jina (free tier, multilingual,
no card), Google text-embedding-005 (cheap, needs GCP account).
Constraint: minimal vendors, one bill.

## OD-5 — Hindi launch scope
Search-in-Hindi and draft-in-Hindi are different quality bars. Drafting carries
far more risk — a bad draft gets filed. Decide whether S4 ships both or
search-only first.

## OD-6 — LLM provider for sensitive-class data · BLOCKS any upload feature
Routing was originally split by task complexity, sending most volume to the
cheapest model. Correct for public judgment search. **Not correct once uploaded
case documents are involved** — those name accused persons, witnesses and minors
who are not our users and consented to nothing. Third-party personal data under
DPDP.

DeepSeek's API terms are unclear on retention and training use. Acceptable for
public judgments; not for a document naming a minor.

Needs: a decision on which provider handles sensitive-class calls, on written
data-processing terms — not marketing copy. See `docs/PRIVACY_PII.md`.
Until resolved: no feature sends uploaded document content to any model.

## OD-7 — OCR engine · BLOCKS scanned intake
PaddleOCR (better layout and table handling, heavier) vs Tesseract (lighter,
mature Indian language packs, weaker on complex layouts). Both Apache 2.0.

**Decide by bake-off.** Neither engine's published benchmarks were measured on
Indian court documents. Run both against 50 real scanned orders: good scans, bad
photocopies, angled phone photographs, Hindi-language orders. **Measure
field-extraction accuracy, not character accuracy.**
Recommendation pending measurement: PaddleOCR primary, Tesseract fallback.

## OD-8 — audit remaining nisaar datasets
`Articles_Constitution_3300_Instruction_Set` and
`LLAMA2_Legal_Dataset_4.4k_Instructions` are unaudited. The Constitution set from
the same publisher failed audit with verifiable legal errors — `docs/DATASETS.md`.
Assume the same until audited. Do not train on either first.

---

## Resolved — kept for provenance
- Client: native Expo iOS + Android first, web admin only
- Infra: Railway only, one bill. Neon, Vercel, Qdrant, Clerk dropped
- Auth: better-auth self-hosted, Postmark magic link, MSG91 phone OTP phase 2
- Billing: IAP for solo tiers, Razorpay invoice + redemption code for firm and above
- Fine-tuning: deferred until Rs.3L MRR. Sarvam-1 Colab pilot runs in parallel at zero cost
- Citation verification: three-tier with explicit unverified state — never silent drop
- Datasets: primary sources only; nisaar sets become adversarial evaluation, not training
