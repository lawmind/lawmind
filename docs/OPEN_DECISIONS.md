# OPEN DECISIONS

Unresolved. **Never silently resolve one.** If your work touches an OD, surface it
and stop.

**Closed 2 August 2026.** Eight of the nine originals are resolved below under
§Resolved, each with its reasoning. **OD-1 remains open, OD-10 is deferred, and
OD-11 was added 6 Aug 2026 — it had been live in three documents for four days
without being tracked here.**

---

## OD-1 — Court monitoring vendor · TRIAL PENDING · does not block S1

**Still open, and the only original still open.** It now has a fallback in hand,
which changes the negotiation rather than settling the question.

### The fallback

**`bharat-courts`** — MIT, on PyPI, Python 3.11+. Case status by CNR or party
across 25 High Courts and 700+ District Courts, court orders with PDF download,
**cause lists**, judgment search with pagination, and the Supreme Court
recent-judgments feed.

**Two things disqualify it as a drop-in vendor replacement, both from its own
docs:**

1. **`next_hearing_date` is not returned.** With `status`, `registration_date`
   and `judges`, it sits behind `o_civil_case_history.php`, which the SDK does not
   call. **That field is the entire basis of the hearing briefing** — the wedge
   feature is a function of knowing tomorrow's date. A library that returns
   everything except the one field the product is built on is a research tool, not
   a vendor.
2. **Bus factor of one.** 6 stars, 2 forks, 37 commits, one maintainer. Fine as a
   second implementation behind our own interface; not fine as the thing a paying
   advocate's morning depends on.

**The CAPTCHA question is unsettled and is not ours to settle.** `bharat-courts`
solves eCourts CAPTCHAs automatically via ddddocr (~75% per attempt, 5 retries).
Our standing rule is that **the advocate** solves the CAPTCHA in the verification
flow, and that rule is not in question. Automated solving for *bulk public
judgment data* is a different and greyer question. **Take counsel's view before
relying on it in production** — do not let it arrive by default because a library
happens to do it.

### The trial — one afternoon

1. **20 real CNR numbers** from the advocate on retainer's live matters.
2. Run all 20 through `bharat-courts`. Record: does it return the case, the
   orders, a cause list, and how long it takes.
3. Trial **Vakeel360** and **eCourtsIndia** on the same 20. Both offer trials —
   ask for one rather than paying first.
4. **Score on freshness, not price.** Does a listing appear the same day the court
   publishes it? If a briefing is late even once, the wedge feature is dead.
5. Cost expectation: Vakeel360 fixed monthly, no per-call charge; eCourtsIndia
   per-call, broader coverage. Budget **₹15,000–40,000/month** for the winner.

### Build regardless — this is why it no longer blocks

The court adapter ships with the **manual path fully working**: the advocate types
the next date, which is what they do on paper today. `bharat-courts` becomes a
second implementation behind the same interface; a paid vendor becomes a third if
it wins. **Nothing above the interface changes.** `TRD.md` §Court data.

---

## OD-11 — Tier B before Tier A, or the sprint plan as written · OPEN

**Added 6 August 2026, recorded rather than resolved.** RCC raised this twice
across two sessions; it was live in three documents and tracked in none.

**The conflict, in the documents' own words:**

- `CLAUDE.md` §1 and `PRODUCT_BRIEF.md`: *"Tier B ships before Tier A — the loop
  creates the habit, the library only prevents a feature-comparison loss."*
  Approved 2 Aug 2026.
- `PRODUCT_BRIEF.md` again, on the sprint plan: the two *"cannot both be
  followed"*, and **"resolving it is a sprint-planning decision, not a build
  decision."**
- `sprints/SPRINT_1.md` has both lanes building **Tier A**.

So the brief instructs Tier B first, names the contradiction itself, forbids
either lane from settling it by building — and the sprint everyone is executing
is Tier A.

**Why it belongs here.** This file's stated job is *"what nobody may decide
alone."* A decision that meets that description exactly, and is absent from the
file, is the one most likely to be settled by accident — by whichever lane ships
first.

**What has already been built while it stayed open**, which narrows it: the
corpus, hybrid retrieval, the citation graph, the reading view, and eleven
feature-parity screens are all Tier A. Six daily-loop screens are designed
(`7sc.zip`) and unbuilt. Tier A is now substantially ahead by execution, which is
precisely the "settled by building" outcome the brief warned against.

**Not for LCC or RCC to resolve.** Founder decision, and it lands in
`BUILD_GUIDE.md` and `sprints/`.

---

## OD-10 — Alternative billing, India · DEFERRED to 1,000 paying users

Opened 2 Aug 2026 when OD-3 closed. **Not blocking anything.**

Google Play's India alternative billing is **11%** against **15%** standard —
a real 4% saving. The work is not small: a payment processor, Indian tax handling,
and a compliant choice screen, measured in months rather than weeks.

At ₹1,999/month, 4% is **₹80 per user per month** — roughly **₹3.8L/year at 400
users**. Worth building at **1,000+ paying users**, not at launch.

**Revisit trigger: 1,000 paying users.** India's domestic Play rates do not move
until **30 September 2027**, so there is no external clock forcing this earlier.

---

# RESOLVED

Each carries its reasoning, because the reasoning is what keeps the next decision
consistent. Reopening one requires a stated cause.

---

## OD-4 — Data sources and embeddings · RESOLVED 2 Aug 2026

**Unblocks S1.**

### Where the corpus comes from — free, no account, no credentials

**AWS Open Data, Mumbai (`ap-south-1`), CC-BY-4.0.** AWS sponsors storage and
transfer. **No AWS account required** — `--no-sign-request`.

```bash
# Supreme Court — 1950 to 2025, English + regional languages
aws s3 ls --no-sign-request s3://indian-supreme-court-judgments/

# High Courts — ~15.9M judgment PDFs, all 25 HCs
aws s3 sync s3://indian-high-court-judgments/data/tar/ ./data/tar/ \
  --exclude "*" --include "*/court=27_1/*" --no-sign-request
```

Both ship raw metadata as JSON and structured metadata as Parquet, with tar files
for bulk download. Court and bench codes are in the dataset docs — **replace `~`
with `_`** when building paths.

Docs: `github.com/vanga/indian-high-court-judgments`, which also documents an
Athena tutorial for SQL over the metadata before downloading PDFs.

**Verified 2 Aug 2026, not taken on trust.** Both buckets return HTTP 200 to an
anonymous `list-type=2` request, and the key layout matches:
`data/pdf/year=1950/english/1950_1_1008_1018_EN.pdf` (SCI) and
`data/pdf/year=1950/court=19_16/bench=calcutta_original_side/…` (HC) — the latter
confirming the underscore form of the court code.

### Ingest order — do NOT attempt 15.9M in S1

1. **Supreme Court, complete** — 1950–2025. **The citation backbone.**
2. **BNS / BNSS / BSA** from indiacode.nic.in, plus the IPC↔BNS mapping.
3. **High Courts, last 10 years** — the practical working set.
4. **High Courts, historical** — background job after launch.

**Record the document count at each stage.** Stages 1 + 2 are enough to pass
Gate S1.

### Supporting sources

| Source | Use | Cost |
|---|---|---|
| e-SCR (Supreme Court portal) | Neutral citations, court-formatted PDFs. **Verification Tier 2** | Free |
| IndianKanoon API | Live search, verification Tier 2 | Stated as a ₹10,000/month non-commercial free tier, commercial licence after revenue. **Unverified — confirm current terms before S1 depends on it** |
| indiacode.nic.in | All Central and State Acts, BNS/BNSS/BSA | Free |
| IndicCorp v2 (AI4Bharat) | Indian-language signal, 20.9B tokens | Free, CC-0 |
| IndicTrans2 (AI4Bharat) | Translation for dataset expansion | Free, MIT |

### Embeddings — self-hosted BGE-M3

**No new vendor, no recurring cost, strong Hindi and English.** That combination
is why it beat the alternatives: Jina and Google text-embedding-005 were both
cheap, and both added a vendor and a bill to a stack whose stated constraint is
minimal vendors, one bill.

One-time corpus embedding runs as a batch job on a **rented GPU — Lambda Labs or
RunPod, not Railway.** Query-time embedding runs on Railway CPU; a single query is
fast enough there.

### Budget to a searchable corpus

| Item | Estimate |
|---|---|
| GPU for one-time embedding (≈A100 at ~$1.30/hr, 20–60 hrs) | **$40–120** |
| Object storage for source PDFs (Cloudflare R2) | **$15–40/month** |
| Postgres + pgvector on Railway | Included until ~5M vectors |
| **Total** | **under $200** |

Recorded in full in `docs/OSS_STACK.md`.

---

## OD-5 — Hindi drafting ships · RESOLVED 2 Aug 2026

**Multilingual is a competitive requirement** — Law4u ships 18 languages. Hindi
drafting ships; search-only would have conceded the comparison.

**Gated, not ungated.** Built in **S5**, released only when the **two Hindi law
graduates approve the register on 20 sampled drafts.** **English drafting is not
blocked by that gate** — the two ship independently.

The gate exists because the risk is asymmetric: a bad search result is discarded
in a second, **a bad draft gets filed.** Machine translation alone is not
acceptable — a draft that reads translated is worse than one in English.

**Tamil and Bangla are post-launch. Thailand is out of v1 entirely** — civil-law
jurisdiction, precedent is not binding, and our verification moat is a common-law
product that does not transfer. Revisit after ₹1Cr ARR. `PRD.md` §Geography.

**No Thai in any language list, locale switcher or copy.** Verified absent from
every file in the repo, 2 Aug 2026. **The i18n architecture stays multi-locale**
so adding one later is a migration, not a rewrite.

Design cost is already paid: Hindi is drawn at full parity in canvas `9a` and
`design/screens/renders/36-hindi-parity@2x.png`, with citations staying English.

---

## OD-6 — Sensitive-class routing · RESOLVED 2 Aug 2026

**Route by data class. Pseudonymise before any sensitive-class call.**

| Class | Contents | Provider |
|---|---|---|
| **Public** | Judgments, statutes, bare acts — already published | **DeepSeek V4 Flash.** No privacy question; this text is public record |
| **Sensitive** | Uploaded documents, matter notes, party names, client detail | **Pseudonymise first, then Claude** — Anthropic has written data-processing terms |
| **Never sent** | A full client file with no legal reason to leave the device | **Stays local** |

**Ambiguity resolves to sensitive, never to public.** There is no fallback from a
sensitive-class call to a cheaper provider. Class and provider are written to the
audit ledger for every call and kept seven years.
`docs/ADMIN_SURFACE.md` §7, canvas `10l`.

**Design half re-confirmed 2 Aug 2026** against the Turn 13 bundle
(`design/screens/IMPLEMENTATION.md` §9g, "Admin routing — already drawn"). It was
requested again in that turn and **already existed** — canvas `10l`,
`renders/57-admin-routing@2x.png`, carrying the public/sensitive columns, the
named sensitive provider, the four-step scan → classify → route → record with
ambiguity resolving to sensitive, and the blocked state with **no founder
override**. Nothing to build; nothing further to decide on the design side.

### Two hard rules that come out of this

**Never mix documents in one prompt.** Multiple case files in a single context
creates cross-contamination — the model conflates parties between matters. **One
document per call.** Recorded in `docs/PRIVACY_PII.md`.

**State the limitation honestly, everywhere.** Automated PII detection handles
roughly **80%**. That is not 100% and must never be described as such — not in
product, not in marketing, not to an advocate. The remaining exposure is disclosed
plainly and high-sensitivity matters get a manual review path.

**Presidio (Microsoft, MIT) is the detection base, not the answer.** Evaluate it
on real Indian court documents before trusting it — Indian names, transliteration
variants and Devanagari are materially harder than the English benchmarks suggest.

### The one thing still outstanding — a standing requirement, not an open decision

The provider is chosen. **A countersigned DPA with zero-retention and
no-training-on-inputs terms, plus a reviewed sub-processor list, still has to
exist as a document**, and its endpoint region has to be defensible under OD-2.

This is now a **procurement task, not a design or engineering decision** — which
is why OD-6 is closed rather than held open. But the rule the admin surface
enforces points at "a provider with terms on file", and **that set is only
non-empty once the DPA is signed.** Do not read this resolution as the signature.

---

## OD-7 — PaddleOCR, and OCR ships in v1 · RESOLVED 2 Aug 2026

**PaddleOCR primary** (Apache 2.0, strong Devanagari, good layout and table
detection). **Tesseract fallback** (Apache 2.0, mature Indian language packs).
Both Apache 2.0, so there was never a licensing dimension.

**OCR intake ships in v1.** The product is a complete ecosystem — an advocate
should never need another app for a law-related task. Deferring scanned intake
would have sent them to a second app on exactly the documents that matter most.

**The S4 bake-off still runs, but as tuning rather than selection.** 50 real
scanned orders: good scans, bad photocopies, angled phone photographs, Hindi
orders. **Measure field-extraction accuracy, not character accuracy** — 98%
characters with a corrupted hearing date is a failure, and a silently wrong
hearing date is a missed hearing.

**The advocate confirms every extracted field before anything saves.
Non-negotiable**, and presented as a normal review step rather than a warning.

---

## OD-8 — SUPERSEDED, not resolved · closed 2 Aug 2026

**Deleted. Replaced by `docs/TRAINING_STRATEGY.md`.**

OD-8 asked whether to audit `Articles_Constitution_3300_Instruction_Set` and
`LLAMA2_Legal_Dataset_4.4k_Instructions`. **The question dissolved rather than
being answered:** they were never going to be training data, because the standing
rule is primary sources only — judgments, statutes, official records, never
another model's commentary about them.

The sibling set from the same publisher failed audit with verifiable legal errors
(`docs/DATASETS.md`): a bail application drafted for a civil employment matter, a
fabricated dissent in a unanimous judgment, *Indra Sawhney* stated backwards. Both
remaining sets are assumed to carry the same defects and **stay adversarial
evaluation material, never training input.**

The real question — *what is the training asset and how is it built* — is now
answered properly in `docs/TRAINING_STRATEGY.md`.

---

## OD-9 — ASO tool · DEFERRED, no longer blocking · 2 Aug 2026

**Moved out of blocking.** Tool selection waits until the app is nearly ready:
buying keyword data months before a listing exists pays for a subscription to
watch numbers that describe a product nobody can install.

**Budget $50–100 for one month** of AppTweak or App Radar, pulled just before
launch and cancelled after.

**Recorded against S7**, which is where `BUILD_GUIDE.md` puts ASO assets, store
listings and submission. *(The closing memo said "S8"; there is no S8 — the plan
runs S0–S7. Recorded against S7. Raise it if a later sprint was actually
intended.)*

Competitor teardown (`docs/ASO.md` §1) **needs no tool and can start now** — it
also informs the screenshot narrative, which is a design input well before S7.

Standing rule, unchanged: **do not invent volume figures to unblock this.** A tool
with thin India data is worse than none, because it produces confident wrong
rankings.

---

## OD-2 — DPDP data residency · RESOLVED 2 Aug 2026

**Founder has taken counsel's view.** Railway has no India region; Singapore is
nearest and is recorded as a **known position with a migration path before the
DPDP compliance deadline of 13 May 2027.**

**Recorded gap, stated plainly:** the substance of counsel's view is not written
down here, and this file's convention is that every resolution carries its
reasoning. A residency position with no recorded written opinion is thin if it is
ever challenged — and the challenge would come at the worst possible moment.
**Get the written view on file** and attach it to this entry.

---

## OD-3 — Store billing · RESOLVED 2 Aug 2026

### What the terms actually say

| Route | Fee | Notes |
|---|---|---|
| Google Play, standard | **15%** on subscriptions | 15% from day one since Jan 2022 |
| Google Play, India alternative billing | **11%** | CCI-ordered; service fee reduced by 4% |
| Apple, Small Business Program | **15%** | Under $1M annual. **Enrol day one** |
| **Razorpay, off-app (Firm and Enterprise)** | **~2%** | No store cut. Invoiced, activated by redemption code |

India's domestic Play rates do not change until **30 September 2027** — the
service-fee/billing-fee split rolling out elsewhere in 2026 does not reach India
before then.

### The decision

**Launch on standard store billing. Do not build alternative billing yet.** The
4% is real; the work is months, not weeks. Deferred as **OD-10**.

**Do immediately: enrol in the Apple Small Business Program.** It halves
commission from 30% to 15%, it is manual, and it is the kind of thing that gets
forgotten until the first payout.

**Where the margin actually comes from:** Firm and Enterprise are invoiced off-app
through Razorpay at **~2%, not 15%**. Those are the highest-value contracts and
they carry no store tax at all — worth more than the 4% alternative-billing
saving, and already the plan.

---

## Resolved earlier — kept for provenance

- Client: native Expo iOS + Android first, web admin only
- Infra: Railway only, one bill. Neon, Vercel, Qdrant, Clerk dropped
- Auth: better-auth self-hosted, **Resend** magic link *(swapped from Postmark
  7 Aug 2026, founder's call — a channel swap, not a decision change)*, MSG91
  phone OTP phase 2. Chosen for self-serve signup with no sales call, 3,000
  emails a month free which covers all of beta, and an API that is a single HTTP
  POST — so it added no dependency. The provider sits behind an interface
  (`packages/auth/src/mail.ts`), which makes **MSG91 the consolidation option
  later**: it is already the approved vendor for phone OTP, and moving is now a
  config change rather than a rewrite. No client data crosses this path — a magic
  link carries an email address and a token, never a matter or a party name — so
  the DPDP residency question that constrains model routing does not arise here.
- Billing: IAP for solo tiers, Razorpay invoice + redemption code for firm and above
- Fine-tuning: deferred until ₹3L MRR. Sarvam-1 Colab pilot runs in parallel at zero cost
- Citation verification: three-tier with explicit unverified state — never silent drop
- Datasets: primary sources only; nisaar sets become adversarial evaluation, not training
