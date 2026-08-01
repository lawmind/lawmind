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

**Still open.** Hindi is now drawn at full parity — search *and* drafting — in
canvas `9a` and `design/screens/renders/36-hindi-parity@2x.png`, with the
citations-stay-English rule applied. **Designed ahead of the decision.** The
drawings do not settle OD-5; they mean the design cost of shipping both is already
paid, not that the quality bar for Hindi drafting has been cleared. If OD-5
resolves search-only, `9a` is held, not deleted.

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

### Design gap — CLOSED 1 August 2026. Commercial half still open.

The routing surface was redrawn **keyed by data class, not by feature** — canvas
`10l`, `design/screens/renders/57-admin-routing@2x.png`. The design states the
problem in its own words: *"a bail application from public case law is public; the
same application built from an uploaded FIR is sensitive — that is the distinction
feature-keyed routing could not express."*

**The mechanism is fully specified and closes the design half of OD-6:**

1. **Scan** — every outbound request is scanned for an attachment, a note
   reference, and named-entity patterns.
2. **Classify** — any hit means sensitive. **Ambiguity resolves to sensitive,
   never to public.**
3. **Route** — sensitive goes only to a provider with terms on file. **There is no
   fallback to a cheaper one.**
4. **Record** — class and provider are written to the audit ledger for every call,
   kept **seven years**.

The blocked state is drawn too: an operator attempting to route sensitive traffic
to a provider with no DPA is **refused automatically and logged**, with
*"no founder override available for this rule"*. That is the correct shape — this
is the one control that must not have an override.

**What is still yours to decide.** The render depicts sensitive traffic handled by
a named provider under a signed India DPA. That is **mock state in a design file,
not evidence of a signature.** OD-6 asks for a provider decision resting on
*written data-processing terms, not marketing copy* — so what remains is
commercial, not design:

- Which provider actually handles sensitive-class calls.
- A **countersigned** DPA on file, with zero-retention and no-training-on-inputs
  terms, and a reviewed sub-processor list.
- Confirmation that the chosen endpoint's region is defensible under **OD-2**.

Until that exists, the rule the design enforces has nothing to point at: "a
provider with terms on file" is an empty set. **No feature sends uploaded document
content to any model until it is filled.**

See `docs/ADMIN_SURFACE.md` §7 and `PRIVACY_PII.md`.

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

## OD-9 — ASO tool selection · BLOCKS S7
App store discovery is the primary acquisition channel and no keyword volume or
difficulty data exists. Candidates: **AppTweak**, **Sensor Tower**, **App Radar**.
All are paid subscriptions.

Without one, every cluster in `docs/ASO.md` §3 stays `UNKNOWN` and the title,
subtitle and keyword field cannot be ranked — only guessed. **Do not invent volume
figures to unblock this.**

Competitor teardown (`docs/ASO.md` §1) needs **no tool** and can start immediately;
it also informs the screenshot narrative, which is a design input well before S7.

Decide on: Indian store coverage depth first, price second. A tool with thin India
data is worse than none, because it produces confident wrong rankings.

---

## Resolved — kept for provenance
- Client: native Expo iOS + Android first, web admin only
- Infra: Railway only, one bill. Neon, Vercel, Qdrant, Clerk dropped
- Auth: better-auth self-hosted, Postmark magic link, MSG91 phone OTP phase 2
- Billing: IAP for solo tiers, Razorpay invoice + redemption code for firm and above
- Fine-tuning: deferred until Rs.3L MRR. Sarvam-1 Colab pilot runs in parallel at zero cost
- Citation verification: three-tier with explicit unverified state — never silent drop
- Datasets: primary sources only; nisaar sets become adversarial evaluation, not training
