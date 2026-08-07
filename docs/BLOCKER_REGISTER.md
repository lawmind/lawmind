# BLOCKER REGISTER — why S1 is still open, and what is waiting in S2–S7

Written 7 August 2026 by RCC, in answer to a direct question: *we have been
working for days and we are still on Sprint 1 — why?*

Every velocity claim below is traced to a commit date or a count I ran. Every
external solution is traced to a fetched source, and where the source is
secondary it says so. Nothing here is a decision. Two entries are founder
decisions and are marked as such.

---

# PART 1 — WHY WE ARE STILL ON S1

## 1.0 · First, the premise is worth correcting

**Seven calendar days.** First commit 31 July 2026 05:15, today is 7 August.
81 commits, one dead day (3 August).

| day | commits |
|---|---|
| 31 Jul | 5 |
| 1 Aug | 5 |
| 2 Aug | 9 |
| 3 Aug | 0 |
| 4 Aug | 16 |
| 5 Aug | 5 |
| 6 Aug | 29 |
| 7 Aug | 12 |

In those seven days: a monorepo on Railway with 13 tables, 38,341 Supreme Court
judgments ingested and embedded, hybrid retrieval with the dense stage at
**10.7 ms**, a citation graph with 22 authorities back-filled, ~19 API endpoints,
825 bare Acts, and an Expo app running on a real Galaxy S24 with the S1 latency
requirement measured and passed.

That is not a slow team. **The problem is not throughput.** It is that S1's exit
condition cannot be met as written, and nobody has changed it.

---

## 1.1 · The real reason: Gate S1 is unpassable as specified

`sprints/SPRINT_1.md` GATE S1 requires **1M+ documents indexed**, counted from
the database.

**We hold 38,341 judgments.** That is **3.8%** of the gate. Plus the bare Acts,
whose coverage endpoint has since gained the fields that make it answerable —
observed live, **7 Aug 2026 23:4x**:

```
GET /statutes → coverage {
  held: 825, sourceTotal: 845, complete: false, failedCount: 20,
  enumeratedAt: "2026-08-07T09:11:27.081Z", ingestInProgress: true
}
```

`sourceTotal` is **no longer null** — an earlier draft of this register quoted
`{ held: 548, sourceTotal: null }`, which was true when written and is not now.

**`ingestInProgress` is `true | false | NULL`, and null is not "no".** Null means
we have never enumerated the source and cannot tell you — weaker than either
boolean, and honest. Do not read it as "not running".

**One thing to raise rather than record quietly: `failedCount` is 20, not 0.**
825 held + 20 failed = 845, so the ingest is at its terminal state and
**`complete` will not become true** — it lands at 825/845, not 845/845. The 20
failures need naming individually the way the ten missing Supreme Court
judgments were, or "the bare acts library" ships with a 2.4% hole nobody wrote
down. This is LCC's to answer; it is recorded here because a coverage number
that stops short without explanation is exactly what this register exists for.

The Supreme Court is *finished*: 38,341 of 38,351 distinct judgments, the missing
ten individually checked and source-side (6 × HTTP 404, 3 × corrupt PDF, 1
unexplained). There is no more Supreme Court to ingest.

**So the only remaining source of volume is the High Court bucket — and it was
measured on 6 August and found impossible.** `docs/DATASETS.md`:

| span | documents | database | GPU-hours to embed |
|---|---|---|---|
| 1 year | 1.95M | **537 GB** | ~396 |
| 10 years, as OD-4 stage 3 specifies | 19.5M | **5,369 GB** | ~3,956 |

The Railway volume is 50 GB. **One year is over ten times the entire volume**,
and sixteen days of continuous GPU.

**And the volume is not even the disqualifying part. The citations are.**
Measured, not assumed:

- **0 of 9,604 metadata rows carry any citation.** There is no citation column.
- **0 of 30 PDFs across six High Courts** carry a neutral citation where the
  extractor can see it.
- Punjab & Haryana text averages **2,223 characters**. 42% of the sampled Sikkim
  file is literally "Record of Proceedings".

A judgment with no citation can be *found* but cannot be cited into a draft,
added to a matter as an authority, or appear as a node in the citation graph.
**Ingesting two million of them adds search noise and no authority.**

### What this actually means

S1 was written before anyone had measured the source. The measurement landed on
day six and it says the gate's headline number is off by two orders of magnitude
on infrastructure that exists, and that most of the documents that would satisfy
it are uncitable anyway.

**The gate is wrong, not the work.** Nobody may fix it from a lane — narrowing
OD-4 stage 3 is recorded in `docs/DATASETS.md` as *"a scope change so it is the
founder's call, not mine."* That decision has been sitting unmade since 6 August
and it is the single thing keeping S1 open.

> **BLOCKER F-1 — founder decision. Re-specify Gate S1.**
> Options in §2.1 below. Until it moves, S1 cannot close by any amount of
> engineering, and both lanes will keep building forward into S2/S3 scope because
> there is nothing else to do.

---

## 1.2 · The second reason: OD-11 is open and the sprint plan contradicts the brief

`docs/OPEN_DECISIONS.md` OD-11, opened 6 August, **still open**:

- `CLAUDE.md` §1 and `PRODUCT_BRIEF.md`: *"Tier B ships before Tier A."*
- `PRODUCT_BRIEF.md` again: the two *"cannot both be followed"*, and resolving it
  is *"a sprint-planning decision, not a build decision."*
- `sprints/SPRINT_1.md` has **both lanes building Tier A**.

The brief instructs Tier B first, names the contradiction itself, forbids either
lane from settling it by building — and the sprint everyone is executing is
Tier A.

**It is being settled by accident anyway.** Corpus, hybrid retrieval, citation
graph, reading view and eleven feature-parity screens are all Tier A. Six
daily-loop screens are designed (`7sc.zip`) and unbuilt. Tier A is now
substantially ahead by execution — precisely the outcome the brief warned about.

> **BLOCKER F-2 — founder decision.** Either S1 and S3 swap, or the brief's
> sequencing rule is withdrawn. Lands in `BUILD_GUIDE.md` and `sprints/`.

**Update, 7 Aug 2026 — still open, and deliberately so.** The founder confirms
the plan approved today makes the next sprint *matters → 24-hour briefing → draft
a bail application*. **That is Tier B**, so execution swings back to the brief's
sequencing on its own.

That resolves the *execution*, not the *decision*. `sprints/SPRINT_1.md` still
puts both lanes on Tier A and the brief's sequencing rule is still unwithdrawn,
so the documents continue to contradict each other while the work quietly
follows one of them. **A plan winning by being executed is the same failure mode
this entry was opened to name** — it does not become acceptable because the
outcome is now the one the brief wanted. F-2 closes when `sprints/` and
`BUILD_GUIDE.md` say the same thing as `PRODUCT_BRIEF.md`, not before.

---

## 1.3 · What LCC did with the time

**36 commits touching `services/**` or `packages/**`.** Two patterns account for
most of the days that did not move the S1 gate.

**(a) Building forward into S2 and S3 while S1's own DONE list sat at 3.8%.**
At least seven commits are downstream scope:

| commit | sprint it belongs to |
|---|---|
| `ff264e6` treatment analysis and precedent graph | S3-ish, uncontracted |
| `d0dda80` annotations endpoints | S1 RCC support, fair |
| `b5578f2` counter-arguments endpoint | not in any sprint |
| `3e39721` saved searches | S3 (PD-5) |
| `93df5b3` per-tier verification results | **S2** |
| `8c027dc` Tier 3 — the eCourts door | **S2** |
| `ab80bc0` admin citation monitor | **S6** |

This is not wasted — it unblocked my verification sheet, and S2 is genuinely
closer for it. But `CLAUDE.md` §7 says *"Never two sprints at once"*, and this is
two sprints at once. It is also the mechanism by which OD-11 gets settled by
building.

**(b) One full day lost to a deploy firefight.** 6 August carries 29 commits, of
which a cluster is the same embedder failing repeatedly: `43b8685` remove the
boot warm that crash-looped · `a457fb1` a model that will not load must not kill
the API · `a420957` create the model cache directory · `c2761d2` do not cache a
failed model load · `a99661a` bake the model into the image. Five commits, one
root cause, found last.

**(c) A CI outage nobody controlled.** `fe44331` records CI not acquiring a
runner since 15:45 UTC; `04d9906` worked around it by running the pipeline
locally; `4c5749c` cut CI to non-push triggers because 2,000 free minutes is the
budget. Real, external, correctly routed around.

**What LCC got right and it is the most valuable thing in the repo:** measuring
the High Court bucket *before* ingesting it, and measuring quantisation against
exact ground truth on 616,197 real vectors. The first saved a 5 TB mistake and
~3,956 GPU-hours. The second (`docs/CORPUS_TIERING.md`) establishes binary +
20× oversample + exact re-score at **99.8% candidate recall and 25.5× smaller**,
with the final ranking exact by construction. **The storage half of the corpus
problem is solved.** Only the founder's scope decision and the citation gap
remain.

---

## 1.4 · What RCC did with the time — my own lane, honestly

**13 commits touching `apps/mobile/**`.**

**My S1 DONE list has four items. Two are still unobserved.**

| DONE item | state |
|---|---|
| Search → results → judgment detail end to end | ✅ observed on device, on real data |
| Paragraph anchors tappable/linkable; in-text search jumps between paragraphs | ⚠️ built and unit-tested; **stepping never observed on device** |
| Reading progress survives restart **with the network off** | ❌ **never observed** |
| Renders at contrast 0.5 / brightness 1.3 (sunlight gate) | ❌ **never observed** |

**My lane does not close S1 by building. It closes by roughly forty minutes of
device observation that I have not completed.** That is the honest statement.

Three things consumed the time instead:

1. **I built S2 early.** `58df283` — *"Sprint 2 RCC lane — the inverted trust
   UI"* — landed 4 August, while S1 items 3 and 4 above were unverified. Same
   sprint-discipline break as LCC's, and I have less excuse because my S1 list is
   four items long.
2. **Toolchain.** The Android native build failed three times identically
   (`ninja: manifest still dirty`); the root cause turned out to be two stacked
   problems — pnpm's `nodeLinker: hoisted` being silently ignored in `.npmrc`
   under pnpm v11, and a generated `Android-autolinking.cmake` caching the old
   `.pnpm` paths. Necessary work, zero gate progress. Recorded in `401affc`.
3. **Device access.** adb dropped repeatedly; one failure was a VPN kill-switch
   blocking LAN (WSAEACCES 10013), which is not mine to change.

**And a caveat I owe on my own work:** twice I reported a feature missing after
grepping for a name I had invented rather than checking the directory. Both times
the feature existed. Written to memory as
`check-the-directory-before-claiming-a-gap`.

---

## 1.5 · The process cost, measured

- **18 of 81 commits (22%) contain no source code at all** — markdown, design
  bundles, config.
- **11,415 lines of markdown against 25,524 lines of source.** A 1 : 2.2 ratio.

Some of that is the best work here: the HC measurement, the quantisation
measurement, `CITATION_HARNESS.md`. Some of it is the same decision being
re-litigated across three documents until someone opened OD-11 to hold it.

**The specific failure mode to watch:** a decision live in three documents and
tracked in none. That is OD-11's own words about itself, and it cost two sessions
to notice.

---

## 1.6 · One operational finding, today

**`/health`'s SHA does not track what is deployed.** It reports `05095aa`
(6 August). But `GET /statutes` returns the `coverage` object that was added in
`97f5fc3`, a *later* commit — so the deployed code is newer than the SHA claims.

This is exactly the failure LCC flagged in their own working rules: *"I reported
a crashed deploy as live today because I trusted a SHA in /health instead of
probing a route."* **The SHA is not a deploy indicator. Probe a route.**

---

# PART 2 — THE BLOCKER REGISTER, S1 THROUGH S7

Confidence is marked: **KNOW** (verified here), **INFER** (reasoned from
evidence shown), **UNVERIFIED** (single secondary source, needs primary
confirmation before anyone acts on it).

---

## 2.1 · SPRINT 1 — CORPUS

### B1.1 — Gate S1's 1M+ document target cannot be met · **BLOCKING NOW**

**Evidence (KNOW):** 38,341 held. HC bucket is 1.95M/year at 537 GB and ~396
GPU-hours per year, against a 50 GB volume. SC corpus is complete; there is no
other volume source.

**Solutions, in the order I would take them:**

1. **Re-specify the gate to citable documents, not documents.** "38,341 citable
   Supreme Court judgments + 845 Central Acts + BNS/BNSS/BSA with verified
   mapping" is a *stronger* claim than "1M documents" and it is nearly met today.
   `docs/FEATURE_PARITY.md` §5 already argues feature parity does not require
   corpus parity. **Cost: one editing session. This is the recommendation.**
2. **If volume is wanted anyway: filtered HC ingest.** Reasoned judgments only,
   selected by length and structure, from the courts that publish neutral
   citations. Delhi, Kerala and Madras were the first HCs to adopt neutral
   citation and have run it since 2023. That is a few hundred thousand documents,
   not 19.5M, and a materially higher share of them are citable.
3. **Storage is already solved — do not re-solve it.** `docs/CORPUS_TIERING.md`:
   binary `bit(1024)` + 20× oversample + exact fp32 re-score gives **99.8%
   candidate recall, 25.5× smaller, final ranking exact by construction**. This
   matches published practice — Qdrant, MongoDB Atlas and OpenSearch all pair
   binary quantisation with oversampling and full-precision re-score. Our curve
   is better than Qdrant's published 3× / 0.939 because we oversample harder.

**Do not:** ingest stage 3 as written. Do not chase a document count to match a
competitor's marketing number — theirs likely counts procedural orders, which is
a different unit.

### B1.2 — High Court judgments carry no citations · **structural**

**Evidence (KNOW):** 0 of 9,604 metadata rows; 0 of 30 sampled PDFs across six
courts.

**Solutions:**

1. **IndianKanoon `Document Metainfo` at ₹0.02 per call** (primary source:
   `api.indiankanoon.org/pricing/`). This is the cheapest thing on their price
   list and it returns exactly what is missing — identity and citation metadata,
   not text. At ₹0.02, resolving citations for 500,000 HC judgments is **₹10,000**
   — which is also precisely the free non-commercial monthly allowance, subject to
   use-case verification by their administrator. **Commercial use is not that
   allowance; budget ₹0.02 × volume.**
2. **Restrict to 2023+ from neutral-citation High Courts.** The citation exists
   in those courts even where our extractor cannot see it in the PDF — which
   makes it a *parsing* problem for a defined subset rather than an absence.
3. **Accept and label.** Ingest uncitable HC judgments as **searchable but not
   citable**, with `verification_state` honest and add-to-matter refused. This is
   defensible under the harness and is arguably the correct product answer, but it
   is a founder call because it changes what the app promises.

### B1.3 — IPC ↔ BNS mapping has no single official machine-readable source

**Evidence (INFER):** indiacode.nic.in publishes the BNS bare text (Act 45 of
2023, enforcement 1-7-2024, matching `DOMAIN_TRUTH.md`) but the search turned up
**no official government comparative table in machine-readable form**. Every
mapping table found is a commercial or educational site, and several carry their
own disclaimer that the mapping is for reference and must be checked against the
notified bare Act.

**This is a hard accuracy blocker and `SPRINT_1.md` already anticipates it:**
*"never model-generated — a wrong section mapping is a wrong answer about which
law applies."*

**Solutions:**

1. **Derive the mapping from the bare texts themselves, not from a table.** BNS
   sections carry marginal notes and definitions that correspond to IPC offences.
   Match on offence definition, not on a third party's table.
2. **The 20-section hand spot-check in the S1 DONE list is not optional and is
   not sufficient.** IPC has 511 sections and BNS 358. Twenty is 4%. Either raise
   the sample or state the coverage claim honestly.
3. **Never accept a scraped mapping table as authority.** If one is used at all,
   it is a *hypothesis* to be confirmed against indiacode, and the provenance goes
   in the row.

### B1.4 — RCC's own two unobserved gate items

Offline reading progress and the sunlight gate. Mine, ~40 minutes on device.
No external blocker. Listed here so it is not lost.

---

## 2.2 · SPRINT 2 — VERIFICATION 🛑 THE HARD STOP

### B2.1 — Tier 2 requires IndianKanoon, and its terms are commercial

**Evidence (KNOW, primary source):** `api.indiankanoon.org/pricing/`, per request
in INR — Search **0.50** · Original Document **0.50** · Document **0.20** ·
Document Fragment **0.05** · **Document Metainfo 0.02**. Pre-paid; **when the
balance runs out the API returns nothing.** ₹500 free on signup; ₹10,000/month
free for non-commercial use subject to administrator verification. Price changes
notified one week in advance.

**Solutions:**

1. **Use `Document Metainfo` (₹0.02), not `Document` (₹0.20), for Tier 2.**
   Tier 2 asks *does this citation exist in an independent source* — that is a
   metadata question. 10× cheaper for the same answer.
2. **Cache permanently, as the sprint already mandates.** Verification is
   permanent; overruledness is not. A citation verified once never costs again.
3. **A drained pre-paid balance is a silent Tier 2 outage** — the API simply
   returns nothing, which is indistinguishable from `miss` unless we distinguish
   it. **This is a citation-harness bug waiting to happen: a billing failure would
   render as "an independent source had no record of this citation."** Tier 2 must
   emit `not_attempted` on a balance/auth error, never `miss`. The client already
   keeps those apart (`apps/mobile/src/citation/tiers.ts`); the server must too.
4. **Add balance to the S6 alert set.** `docs/FAILURE_MODES.md` has six
   page-worthy conditions; this is a seventh.
5. **Attribution:** at least one secondary source states downstream rendering
   requires a "Powered by IKanoon" attribution. **UNVERIFIED — not in the pricing
   page I fetched.** Read `api.indiankanoon.org/terms/` before shipping.

   **Three of our own documents disagree about this, 7 Aug 2026.**
   `docs/DATASETS.md` records "Commercial, **attribution mandatory**" and
   `docs/COMPETITIVE_TEARDOWN.md` records "**mandatory** 'Powered by IKanoon'
   attribution" — both as settled fact. This entry is the only one that labels it
   unverified, and it is the only one citing the primary source it was checked
   against. **The primary-source-labelled claim wins: treat attribution as
   unconfirmed until `terms/` is read.** It is a client-render obligation, so it
   is RCC's to draw — and it would put a competitor's brand on our verification
   surface, which is a founder question before it is a layout one.

### B2.2 — "Both must agree" needs a genuine second source

`SPRINT_2.md` Tier 2 requires **IndianKanoon *and* AWS S3 datasets** to agree.
For Supreme Court judgments that works — we hold the AWS corpus. **For anything
outside the SC corpus, the second source does not exist**, so Tier 2 can only
ever return `not_attempted`, never `verified/public_x2`.

**Solution:** state the coverage honestly per tier — which is already the
client's behaviour, and the reason `not_implemented` and `miss` are kept apart.
Do not let a structurally-unavailable tier render as a failed check.

### B2.3 — The eCourts CAPTCHA, and a trap worth naming

**The rule stands: never bypass it.** Government system, fragile, legally
reckless.

**The trap:** commercial APIs now sell eCourts data — `ecourtsindia.com`,
`vakeel360.com` and others advertise CNR lookup, cause lists and batch endpoints
across 700+ district courts. **These are not government.** `ecourtsindia.com`
appears to be operated by BILLION INSIGHTS & SERVICES LLP, Noida
(**INFER** — the site returned 403 to a direct fetch; this is from search result
text, confirm before relying on it). The official service is
`services.ecourts.gov.in`, maintained by NIC.

**Using a paid reseller to answer Tier 3 is bypassing the CAPTCHA through an
intermediary.** It moves the legal and reliability exposure rather than removing
it, and it silently converts "the advocate personally vouched for this" — the
thing that makes Tier 3 worth caching permanently — into "a vendor scraped it".
**Those are not the same fact and must not write the same row.** If a vendor is
ever used, it is a fourth tier with its own source label, never `ecourts`.

### B2.4 — The benchmark that says this sprint is the whole product

**Evidence (KNOW, well-corroborated):** Stanford RegLab, *Hallucination-Free?
Assessing the Reliability of Leading AI Legal Research Tools* — preprint May
2024, peer-reviewed in the *Journal of Empirical Legal Studies* 2025.
Pre-registered, 202 hand-scored queries. **Lexis+ AI hallucinated >17% of the
time; Westlaw AI-Assisted Research >34%.** Both had marketed RAG as eliminating
hallucination.

**Read that number against our gate: hallucination rate 0.0%, silent-drop 0.0%,
adversarial pass 100%.** We are proposing to beat the two largest legal research
vendors in the world by 17 to 34 percentage points, on their own claim, with a
harness of 30 queries.

**Solutions:**

1. **Raise the harness beyond 30 queries before trusting a 0.0%.** 0 failures in
   30 is consistent with a true rate near 10%. This is the single most likely way
   Gate S2 gets passed while being false.
2. **The four RegLab question categories are the right shape for our adversarial
   set** — general doctrinal, jurisdiction/time-specific, **false-premise**, and
   factual recall. Our nisaar-derived set already covers false-premise
   (*Indra Sawhney* backwards, a dissent in a unanimous judgment). The
   **time-specific** category is the one we are most exposed on and it is not in
   the five: BNS/BNSS/BSA replaced IPC/CrPC/Evidence Act in July 2024 and no
   frontier model knows them.
3. **The advocate sign-off in the gate is the only thing that catches the failure
   the harness cannot see** — a citation that resolves, is real, and is simply
   wrong for the question. Per `PID.md` they can block the gate. Do not let a
   green harness substitute for it.

---

## 2.3 · SPRINT 3 — THE DAILY LOOP (the wedge)

### B3.1 — Cause list data is the least reliable input in the product

**Evidence (INFER, multiple secondary sources agreeing):** the court estate is
fragmented across 25 High Courts and 800+ districts; **every portal has its own
HTML layout, CAPTCHA, session handling and publication schedule.** NIC's own
disclaimer states it is not responsible for data inaccuracy or delay in updating.

`SPRINT_3.md` already names the exact failure: *"a parser that silently returns
an empty list is worse than an outage, because briefings still go out with stale
dates."*

**Solutions:**

1. **The fixed escalation in the sprint is right — implement it literally:**
   retry once → mark affected briefings `dates_not_confirmed` → notify. Never
   present an unconfirmed listing as confirmed. Same rule as citations.
2. **Distinguish "court published an empty list" from "we failed to read it".**
   These are different facts and collapsing them is the same error class as
   `miss` vs `not_implemented` on the verification sheet. A court genuinely has
   no listings some days.
3. **Per-court freshness, surfaced.** `cause_list_syncs` should carry a
   last-successful-parse per court, and the briefing should state its as-of date
   — which the sprint's DONE list already requires.
4. **Manual entry stays first-class (PD-12), not a fallback.** Next dates are
   given orally in open court. This is the feature that makes the wedge survive
   every parser outage, and it is the reason OD-1 does not block S3.

### B3.2 — OD-1 open; the free alternative lacks the load-bearing field

`bharat-courts` (MIT) does **not** return `next_hearing_date` — the field the
entire briefing is built on. Recorded already. The adapter interface plus the
manual path is the correct answer and needs no vendor.

### B3.3 — Three S3 screens are marked NOT YET DESIGNED

Daily cause list (row 88), client update share (row 89), adjournment capture
(row 90). `SPRINT_3.md` says do not improvise them. **The client share is the
viral loop** — every share carries our name to a client and to opposing counsel,
so its typography and citation handling are marketing surface. **This is a design
dependency with a lead time, and S3 will stall on it if it is not started before
the sprint opens.**

---

## 2.4 · SPRINT 4 — DRAFTING AND TOOLS

### B4.1 — The limitation calculator is the highest-liability object in the app

Missing a limitation period is malpractice. The sprint already requires the
result to state its **basis** — which Act, which article, which starting date.

**Additional risks not yet written down:**

1. **Condonation and exclusion.** ss. 5, 12 and 14 of the Limitation Act change
   the answer, and whether time is excluded is a *fact* question the app cannot
   see. The output must be a computation with stated inputs, never a deadline.
2. **Special limitation periods override the Schedule** — Commercial Courts Act,
   Consumer Protection Act, Arbitration Act s.34 among others. A calculator that
   only knows the Schedule is confidently wrong in exactly the matters where the
   stakes are highest.
3. **Recommendation:** ship it stating the article, the starting event it assumed,
   and *"exclusions and condonation not computed"* — or do not ship it. A bare
   date the advocate cannot check is worse than no calculator, which the sprint
   already says.

### B4.2 — `.docx` fidelity and Devanagari

**Evidence (INFER):** the general failure mode is font substitution and broken
Indic shaping on export; the fix is embedding a Unicode Devanagari face (Noto
Sans/Serif Devanagari) rather than relying on the reader's fonts, and never
touching legacy encodings such as Kruti Dev. Complex-script shaping quality
varies by renderer.

**Solutions:**

1. **The gate must be Word itself, not a viewer** — the sprint already says this.
   Extend it: **the Hindi gate must be Word on Windows, opened by a human.**
   A `.docx` that renders in LibreOffice and breaks in Word has failed.
2. **Embed the font in the `.docx`**, do not reference it.
3. **Test the specific failure:** conjuncts and the i-matra, which reorders
   visually before the consonant it follows. If shaping is broken, that is where
   it shows first.

### B4.3 — Server-side citation locking is the real control

`PATCH /documents/:id` rejecting `422` on any citation divergence is correct and
is the thing that matters. **The client's lock glyph is presentation, not
enforcement.** Already written into the sprint; repeated here because it is the
hallucination failure arriving through a different door.

### B4.4 — The countersigned DPA gates uploads

OCR intake and any sensitive-class routing wait on procurement, not engineering.
The admin surface refuses to route without terms on file and **has no founder
override**. Not a sprint blocker; a launch blocker.

---

## 2.5 · SPRINT 5 — ACCOUNTS

### B5.1 — DPDP compliance clock, confirmed

**Evidence (KNOW, well-corroborated):** the Digital Personal Data Protection
Rules, 2025 were notified by MeitY on **13/14 November 2025**. Phased:

| phase | date | what |
|---|---|---|
| 1 | 13 Nov 2025 | Data Protection Board, penalties — **already in force** |
| 2 | **13 Nov 2026** | Consent Manager framework operational |
| 3 | **13 May 2027** | Full compliance — notice and consent, breach notification, rights handling |

**This confirms OD-2's recorded position** (Singapore with a migration path
before 13 May 2027) against a primary-adjacent source. Good.

**What is new and not in our docs: Phase 2 lands 13 November 2026 — about three
months from now.** Worth checking whether the Consent Manager framework touches
our consent flow before S5 is designed.

**Still owed:** counsel's *written* view on residency. OD-2 is resolved on the
founder's authority with nothing on file. A residency position with no written
opinion is thin exactly when it gets challenged.

### B5.2 — PD-2 must be proved, not commented

A rejected enrolment still has full access. The sprint requires a **test**, not
a comment. Listed because it is the single most likely rule to get quietly
inverted by a well-meaning "verified users only" change later.

---

## 2.6 · SPRINT 6 — ADMIN AND HARDENING

### B6.1 — The alert set is unenumerated in the gate

`SPRINT_6.md` flags this itself: the gate says *"all alerts fire in a drill"* and
never lists them. `docs/FAILURE_MODES.md` has six. **Confirm the six with the
founder before wiring** — and consider adding IndianKanoon balance (B2.1) as a
seventh, since a drained balance silently degrades Tier 2.

### B6.2 — The ledger before any privileged control

Append-only enforced by a `BEFORE UPDATE OR DELETE` trigger, written in the same
transaction as the action, proved by killing the ledger write in a test and
asserting the action rolls back. Nothing else in S6 ships first. Already correct
in the sprint.

---

## 2.7 · SPRINT 7 — LAUNCH

### B7.1 — Store review of an AI legal app

**Evidence (INFER, secondary sources):** the 2026 review climate has two themes
that hit us directly — **any sharing of personal data with third-party AI systems
must be explicitly disclosed with user permission before transmission**, and
**AI-generated content must be disclosed as such, especially in sensitive
categories.** Privacy (Apple 5.1.1) remains the single largest rejection cause.

**We are in good shape on the substance and should make sure the *listing* says
so:**

- Every generated document already carries *"AI-assisted draft — verify before
  filing"*.
- Routing is by data sensitivity with pseudonymisation before any model call.
- We never claim complete PII removal.

**Solutions:** write the third-party-AI disclosure into the privacy nutrition
labels and the consent screen (PD-8) explicitly, not by inference. Do not let the
store listing claim anything stronger than the product does — *"verified
citations"* is defensible; *"hallucination-free"* is the exact phrasing the
RegLab study demolished for two vendors far larger than us.

### B7.2 — Bar Council of India has no AI guidance yet, and that is the risk

**Evidence (UNVERIFIED — single secondary source, confirm before acting):** the
BCI Standards of Professional Conduct are reportedly silent on AI delegation; a
Supreme Court notice to the Attorney General and the BCI dated 27 February 2026
is described as the regulatory trigger, with an expert committee expected during
2026 and guidance in the 2027–28 cycle. For comparison, ABA Formal Opinion 512
holds that lawyers using AI must fully discharge competence, confidentiality and
supervision duties, and the Bar Council of England and Wales updated its AI
guidance in November 2025.

**Why it is a blocker rather than background:** rules written *after* launch will
land on whatever we shipped. The topics named — **mandatory verification of
AI-sourced authorities**, confidentiality of client data sent to AI tools,
disclosure to clients — are the three things this product is built around. We are
early enough to be the compliant reference implementation rather than the
cautionary example.

**Action:** confirm the 27 February 2026 notice against a primary source before
anyone cites it. Then keep the verification harness and the routing ledger
documented in a form that could be handed to a regulator.

### B7.3 — ASO tool deferred, correctly

Buy one month before launch. `docs/ASO.md` §3 stays `UNKNOWN` until then.
**Do not invent volume figures to unblock it.** The competitor teardown needs no
tool and can be done now — it is the one S7 item that is available today.

---

# PART 3 — THE SHORT VERSION

**Two founder decisions are the whole of why S1 is open:**

1. **F-1 — Gate S1's 1M+ target.** Unpassable as written on measured evidence.
   Recommendation: re-specify to citable documents; we are nearly there today.
2. **F-2 — OD-11, Tier B before Tier A.** Open since 6 August and being settled
   by accident in Tier A's favour every day it stays open.

**Everything else is either finished, cheap, or downstream.** The storage
problem is solved and measured. The corpus is complete for the Supreme Court.
The client passes its latency gate. Two of my four S1 DONE items need forty
minutes of device time, not a decision.

**The highest-value unwritten risk in this register is B2.4:** a 30-query harness
returning 0.0% is not evidence of 0.0%, and the two largest legal research
vendors in the world hallucinate at 17% and 34% while claiming they do not.
Gate S2 is the hard stop for a reason — and the most likely way it fails is by
passing.

---

## Sources

Primary, fetched:
- [Indian Kanoon API — Pricing](https://api.indiankanoon.org/pricing/)
- Production API probed directly: `GET /health`, `GET /statutes`

Secondary, search results (confidence marked inline):
- [Indian Kanoon API — Terms](https://api.indiankanoon.org/terms/) · [Documentation](https://api.indiankanoon.org/documentation/)
- [Stanford RegLab — Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools](https://reglab.stanford.edu/publications/hallucination-free-assessing-the-reliability-of-leading-ai-legal-research-tools/)
- [DPDP Rules, 2025 Notified — PIB](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
- [India's New Data Privacy Rules — Fisher Phillips](https://www.fisherphillips.com/en/insights/insights/indias-new-data-privacy-rules-are-here)
- [Supreme Court neutral citation notice, 27 April 2023](https://cdnbbsr.s3waas.gov.in/s3ec0490f1f4972d133619a60c30f3559e/documents/notices-circulars/27042023_135802.pdf)
- [Ending Citation Chaos: Neutral Citation in Indian Courts — Bar and Bench](https://www.barandbench.com/news/ending-citation-chaos-neutral-citation-simplifies-legal-referencing-in-indian-courts)
- [eCourt India Services (official, NIC)](https://services.ecourts.gov.in/)
- [eCourtsIndia (third-party)](https://ecourtsindia.com/api) — returned 403 to direct fetch
- [Scalar and binary quantization for pgvector — Jonathan Katz](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/)
- [When AI agents enter the courtroom — Bar and Bench](https://www.barandbench.com/columns/when-ai-agents-enter-the-courtroom-what-the-delhi-summit-means-for-indian-legal-practice)

Internal, read: `sprints/SPRINT_1.md`–`SPRINT_7.md` · `BUILD_GUIDE.md` ·
`docs/DATASETS.md` · `docs/CORPUS_TIERING.md` · `docs/OPEN_DECISIONS.md` ·
`PRODUCT_BRIEF.md` · git history, 81 commits.
