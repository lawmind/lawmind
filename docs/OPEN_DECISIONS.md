# OPEN DECISIONS

Unresolved. **Never silently resolve one.** If your work touches an OD, surface it
and stop.

**Closed 2 August 2026.** Eight of the nine originals are resolved below under
§Resolved, each with its reasoning. **OD-1 remains open, OD-10 is deferred, and
OD-11 was added 6 Aug 2026 — it had been live in three documents for four days
without being tracked here.**

**OD-12 was added 11 Aug 2026 for the same reason OD-11 was**, which is now twice:
a decision was live in `FEATURE_PARITY.md` and in two code comments, and was
never written here. **RCC found it by refusing an instruction from LCC** — LCC
read the contract's status table, saw four `BUILT` rows, and sent "build this"
without reading the thirteen lines below them that say do not. The refusal was
correct and the gap in this file was real.

---

## OD-14 — `set_aside` is doing the work of `overruled`, and it disables add-to-matter · **RESOLVED 21 Aug 2026, founder direction** · raised 20 Aug 2026

**Needs:** a call on whether `overruled_status` should distinguish an **overruled**
authority from a **set aside** one, and — the part that actually bites — whether
an overruled authority should still be addable to a matter.

**The measurement.** 73 of the 98 judgments currently marked non-current carry
`set_aside`, and **every one of them was derived from a `judgment_citations`
edge whose relationship is `overruled`.** Verified live 20 Aug; the full
reconciliation is `docs/TREATMENT_MANIFEST_RECONCILED.md` §3.

**Why the two words are not synonyms.**

- **Set aside** — an appellate court undid *this judgment in this case*. The
  decision between the parties is gone.
- **Overruled** — a later, usually larger bench held the *proposition* is no
  longer good law. **The original decision between the original parties stands**,
  and the judgment frequently remains citable for propositions the later court
  never reached.

Every one of the seven verified rows is an overruling by a Constitution Bench.
E.V. Chinnaiah was overruled by seven judges in *State of Punjab v. Davinder
Singh*; nothing in Chinnaiah's own case was set aside.

**Why this is not an engineering fix.** `CLAUDE.md` §6: *"`set_aside` disables
add-to-matter — the one case where Lawmind refuses to let an authority be used."*
So today an overruled-but-intact authority is refused on exactly the same footing
as a judgment that no longer exists. Whether that is right is a **product**
judgement about what an advocate is allowed to rely on, not a data question —
and the four values appear in `CLAUDE.md`, the session hook, `SCHEMA_TRUTH.md`
and RCC's rendering, so changing them is a cross-lane contract change.

**What is NOT at issue.** The evidence is sound and no row needs re-deriving.
The verified treatment edge already carries the full seven-value vocabulary
(`cites · followed · distinguished · overruled · approved · doubted ·
overruled_in_part`), and zero judgments are marked non-current on a
`distinguished` edge or on no edge at all. If this resolves toward a distinct
`overruled` state it is a **relabel of 73 rows whose supporting edges already say
`overruled`** — the data to do it correctly is in the graph today.

**Three ways it could go**, none of them chosen here:

1. Add `overruled` / `overruled_in_part` to `overruled_status` and relabel. Most
   truthful; costs a contract change and an RCC render change.
2. Keep four values, and move the add-to-matter refusal off `set_aside` alone so
   the block matches the act rather than the label.
3. Keep as-is and accept that `set_aside` means "adverse, strongest class". Costs
   nothing and leaves the product refusing authorities it need not refuse.

**Does not block:** anything currently queued. The reconciliation, the coverage
work and the legal-object factory all proceed unchanged. **Blocks:** any claim
that Lawmind distinguishes overruling from setting aside, which it does not yet.

---

### RESOLUTION · 21 August 2026 · founder direction

The founder resolved this directly, and not toward any of the three options as
written: *"Do NOT solve this as a UI flag. Audit the underlying representation.
Separate permanently: VERIFIED TREATMENT EDGE from DERIVED CURRENTNESS /
PRECEDENTIAL EFFECT from PRODUCT POLICY. Never coerce OVERRULED into SET_ASIDE
merely to reuse product behavior."*

**What shipped.** `services/api/src/judgments/precedential-effect.ts` — the three
layers as three types, with the table that was previously spread across a
column's value list, a route's `if`, and a client's switch:

| layer | lives in | changed? |
|---|---|---|
| verified treatment edge | `judgment_citations.relationship` | no — it was always right |
| derived precedential effect | `precedentialEffect()`, **derived, never stored** | new |
| product policy | `precedentialPolicy()` | the refusal moved here |

**Measured, live, on the day of the change** (`docs/ai/lcc-od14/treatment-fixture.json`):

```
  72  set_aside        + [overruled]                   -> overruled          / ALLOW
   1  set_aside        + [overruled, overruled_in_part]-> overruled          / ALLOW
  17  doubted          + [doubted]                     -> doubted            / allow
   8  partly_set_aside + [overruled_in_part]           -> overruled_in_part  / allow
  ──
  98  non-current judgments · 73 add-to-matter refusals removed
```

**The finding underneath the finding.** After the change, **zero** judgments in
the corpus derive a genuine `set_aside`. The one refusal in the product had
fired 73 times and not once for the case it was written for.

**What did NOT change, deliberately:**

- **No warning was weakened.** An overruling still renders `bannerStatus =
  'set_aside'`, the strongest class. A warning is never the price of a correct
  label.
- **The wire enum still has exactly four values.** `apps/mobile` switches on
  `OverruledStatus` exhaustively; a fifth value at a client that has never seen
  it renders an overruled judgment with **no mark at all**, which `CLAUDE.md`
  rates as severe as a hallucination. A test asserts no effect can produce a
  fifth value.
- **Nothing is stored.** No column, no backfill, no `ALTER` on an 18.7M-row
  table. `CITATION_HARNESS.md` already forbids caching good-law status, and this
  is the same fact one layer down.
- `propagate-treatment.ts` still owns the `none` → adverse transition, with the
  fan-out and the alerts. `precedentialEffect()` returns `none` for a good-law
  judgment even when an unapplied edge exists, precisely so it cannot become a
  second implementation of that write.

**Still owed, and it is RCC's:** the banner for an overruling still reads as a
setting aside, because the wire word is `set_aside`. The true word is available
additively as the derived `precedentialEffect`; the render change is RCC's and
is on the bus. Until they take it, Lawmind distinguishes the two acts in its
DATA and its BEHAVIOUR, and not yet in its COPY.

---

## OD-13 — Pre-1950 Privy Council / colonial HC reporters: usable at all under the raw-text-not-reporter rule? · OPEN · 14 Aug 2026

**Needs:** a call on whether pre-1950 historical law reports (Privy Council
appeals, Bengal Law Reports, Calcutta Law Journal and similar) can be ingested
under the existing "raw court text, never a law report's edition" rule
(CLAUDE.md §6, *Eastern Book Company v. D.B. Modak*), or whether the rule
forecloses this whole category. Neither NEW3 (found it) nor LCC (asked)
resolves this alone — it is a copyright-risk judgment call, not a technical one.

**Why it is a decision and not a task.** NEW3 (bus 0406) confirmed a real,
free, unpaywalled source: the Digital Library of India mirror on archive.org,
1,676 items tagged `subject:law`, 571 matching "law reports"/"Privy
Council"/"Indian Appeals" directly, one item fetched and verified (*Privy
Council Judgments on Appeals from India*, Vol 1, 1825–1862, full
PDF/EPUB/plain-text/OCR). This is Privy Council and colonial-era High Court
material with **no eCourts/AWS equivalent at all** — genuinely additive for
the 1825–1947 span, not a duplicate of anything held.

**The rule as written assumes an alternative exists.** For modern reporters
(SCC, AIR), the raw judgment text is also available from the court itself or
AWS Open Data, so "use raw text, skip the reporter's headnotes/editorial
numbering" is a straightforward substitution. **For most pre-1950 material,
the historical law report may be the only surviving record — there is no raw
court text to fall back to.** That does not automatically clear it: *E.B.C. v.
D.B. Modak*'s copyright concern is specifically the reporter's editorial
layer (headnotes, paragraph numbering, cross-references), not the judgment
text itself, and that layer is *more* entangled with the judgment text in
colonial-era reporting — Privy Council appeal reports of that period
routinely interleave the reporter's own summary of arguments with the actual
judgment, unlike a modern SCC headnote that sits cleanly above a clean
judgment body. Whether "extract only the judge's own words, discard the
reporter's layer" is even mechanically separable for this material — and
whether attempting it is a defensible reading of the rule or a rationalisation
of the only source that exists — is exactly the call neither research lane
should make unilaterally.

**Not yet filed to `FOUNDER_QUEUE.md`** (NEW3's call, and the right one): a
licence read is the wrong next step before this question has an answer, since
the answer might rule the source out regardless of licence terms.

**Cost if never resolved:** the entire pre-1950 span (1825–1947) — currently a
complete gap, no source of any kind — stays unaddressable, and DLI's other
571+ matching items go unevaluated pending the same answer.

---

## OD-12 — The saved-search feed, a proposed REFRAME of PD-5 · OPEN · 11 Aug 2026

**Needs:** the founder to confirm or reject **an in-app saved-search feed**, and
the answer recorded here.

**Why it is a decision and not a task.** PD-5 is settled and it explicitly
*excluded* subject-following alerts: *"That is discovery, not an alert. It
belongs in the app, never in a notification."* `FEATURE_PARITY.md` §3 proposes a
reframe that **keeps PD-5 intact rather than overturning it** — a saved-search
feed **inside the app, never a push** — on the reasoning that PD-5's objection
was to the *notification*, not to the capability. That is a plausible reading of
a settled decision, and a plausible reading is exactly what nobody may adopt
alone. `FEATURE_PARITY.md` §3 says **"Confirm before building."**

**State: server BUILT, client HELD.** All four endpoints exist and are marked
`BUILT` — `GET`/`POST`/`DELETE /saved-searches` and
`GET /saved-searches/:id/feed`. Both the contract (§Saved searches, and read to
the end of the section) and `services/api/src/search/saved.ts`'s own module
comment carry the same sentence: **"These endpoints existing is not approval to
build the surface."**

**If it is confirmed**, the constraints are already written and are not the
founder's to re-litigate: no push, no badge, no notification of any kind, and
`unseenCount` is for in-app ordering only — never a badge on the app icon or tab
bar. PD-6's warning stands: a wrong cadence trains advocates to disable
notifications permanently.

**Cost if never resolved:** four working endpoints no advocate can reach, and the
competitor feature they answer (Prism's 2/25/100 standing queries per tier) stays
unanswered. **It does not block anything else** — no other work depends on it.

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
