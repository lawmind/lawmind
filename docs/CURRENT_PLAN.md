# CURRENT PLAN — the single ordered queue

**Read this file at session start, after the mandatory set in `CLAUDE.md` §0.**
It exists because a plan held only in a todo tool does not survive compaction, a
new session, or a fresh agent. **This file does.**

Last updated **9 August 2026**, annotated through **21 August 2026**. **Read
§A first — it supersedes §2's ordering.** Owner: **LCC (server lane)**. RCC's
plan is `docs/RCC_MASTER_PLAN.md` and is not duplicated here.

**11 Aug 2026 — the two P0s that outranked this whole queue are closed.**
Task 001 (citation-shaped queries falling through to semantic search) and
task 002 (the uncitable-judgment state) are both resolved — server side
complete for both, client-side implementation for 002 briefed to RCC. Current,
live state lives in `docs/ai/RETRIEVAL_PROGRAM.md`, not here; this file's Q1.0
and Q1.4 entries below are kept as the historical record with corrections
layered on top, per this file's own convention, rather than rewritten.

### 26 August 2026 (R8.1) — NEW2: THE FRESHNESS GATE PASSED WITH ZERO EVIDENCE, THE CORPUS IS 56 DAYS BEHIND NOT 8, AND ~72,000 DEVANAGARI JUDGMENTS ARE LABELLED ENGLISH

R8.1 §7. Artifacts under `docs/ai/new2-r8/`. Commits `437dc65`, `5a98d5c`,
`342c314`, `b9d3b3b`, `111860f`, `91d5e74`, `9ce5e6b`.

**The resolver freshness gate returned CURRENT with `resolver_risk_replay`
EMPTY.** Run against the live gate function, not read and inferred: 0 rows,
state CURRENT, `because: []`, `mayAssertUnique` TRUE. `readKeyFreshness` READS
the risk table, reports it null, and never puts it in `because` — it bounds
index lag in rows and hours and never asks whether adjudicated risk evidence
exists. **An empty risk table and a clean one are the same reading.** The table
is now populated by a replay that runs the REAL `resolveBatch` over 406
adjudicated records — 0 false unique, 0 materially unsafe, the only two
mismatches in the safe direction. The caveat travels in the row's own `notes`:
the truth set DROVE the fix it is testing, so it is `IN_SAMPLE` and is not a
corpus-wide rate. Non-vacuity proven — `--selftest` fires the detector twice and
correctly keeps it silent once. Gate half is LCC's §8.3 and remains open.

**Only 4,688 of 21,652 ambiguous citation pins are unsafe.** The population is
21,652 exact (9.36% of 231,351 resolved), replacing R7's ~24,500 sample
estimate. Classified on `DECISION_IDENTITY_CONTRACT_V1`: 14,525
`EXACT_DOCUMENT_DUPLICATE` and 2,439 `SAME_DECISION_DIFFERENT_SOURCE` are KEPT
because the advocate lands on the right authority; 3,646 `DIFFERENT_COURTS`,
649 `DIFFERENT_DATES` and 393 `UNKNOWN` are cleared. Clearing is not dropping —
only `cited_judgment_id` goes and the citation renders as ambiguous, which is
what it is. Rollback manifest written in DRY RUN. **Not executed; waits on
`HEAVY_BOX`.**

**The corpus is 56 days behind, not 8.** `max(judgment_date)` reads 2026-08-18.
August holds **480** judgments against July's 93,340 and a baseline of 117,332 —
0.4%, `EFFECTIVELY_ABSENT`. A month with one row in it has a newest date.
Currency is now a completeness ratio against a trailing baseline that skips the
months under test. Confounder stated: courts take a summer vacation mid-May to
early July, which is why July rises above June; it does not rescue August.
**Every currency claim must use 56.** eCourts is the only adapter that can ever
close it and has zero observations.

**~72,000 Devanagari judgments are labelled `en`.** `judgments.language` has
exactly one value across 18,698,984 rows. Randomised `TABLESAMPLE`: 0.387%
substantially Devanagari, 95% CI [0.280, 0.535], averaging 31.3% of the
document, concentrated in Allahabad, Rajasthan, Chhattisgarh, Patna, MP,
Jharkhand and Uttarakhand — the Hindi belt. And `native_text` is a BOOLEAN, true
on 99.087%, so the corpus asserts both "this is its native language" and "that
language is English". **"The corpus is English" is FALSE; every Hindi claim is
HOLD.**

**The IPC and the Evidence Act are obtainable today; CrPC 1973 is not.** R7's
`PARTIAL` IPC verdict was measured against a *Chandigarh state adaptation*; the
central official PDF is 1,104,850 bytes. IEA's central principal Act is a third
distinct artifact at 639,810 bytes. That unblocks **111,457 of 391,484** blocked
statute references with no permission and no founder decision. CrPC 1973 is
`CONFIRMED_ABSENT` by three paths — two catalogue records titled exactly "The
Code of Criminal Procedure, 1973" both carry **zero bitstreams**, while every
CrPC from 1861, 1872, 1882 and 1898 is downloadable. **India Code's `.pdf.txt`
derivative is hard-truncated at exactly 100,000 characters and opens with the
table of contents**, so a heading count reports 511/511 sections on a file
holding 92 — 18.0% of the IPC, with ss. 302, 420, 498A and 511 all absent. The
acquisition target is the PDF, never the text layer.

**Release-critical OCR is 14 documents, about twelve minutes.** `HIGHLY_CITED`
and `CURRENTNESS_BLOCKER` both came back ZERO and were re-tested by an
independent query: 7,018 highly-cited, 0 damaged. The mechanism is that **6,970
of 7,018 (99.3%) are Supreme Court and SC damage is 0.00% of 38,342**, against
Allahabad 0.35% and Rajasthan 4.87%. Damage and the citation graph live in
different halves of the corpus. Bounded by screen sensitivity —
`SCREENED_NO_DAMAGE_FOUND` is not clean and our screen missed 32 of 43 glyph
dumps. And the SC corpus is clean *because* it is the SCR reporter edition, so
its readability and its licensing exposure have the same cause.

**24.40% of tranche passages must never be shown as the court's own reasoning.**
Measured on the REAL tranche (416,600 passages), not R7's substitute frame,
which understated every unsafe class — `PARTY_SUBMISSION` 11.26% → 19.38%,
`REPORTER_EDITORIAL` 0.11% → 1.57%. SC 16.54%, HC 25.88%. `SPAN_UNVERIFIABLE`
2.65% independently corroborates NEW1's 2.95% from a different code path.
**§7.7 is PARTIAL** — it asks for top-k and this is the pool.

**Gold V2 cannot be the final hidden set.** All three of FIFTH's findings
reproduced exactly, and both defects reach the SEALED holdout: **21 of its 86
rows (24.4%) cannot enter `POST /search` at all**, and 2 of its exact_identity
keys are ambiguous. Zero of 480 rows are a human asking for supporting or
adverse law. Gold V3 is `HUMAN_ADVOCATE_INPUT_REQUIRED` and is in
`FOUNDER_QUEUE.md`.

**Four errors of my own, each caught and each the same shape.** Matching raw
citations against a normalised `citation_key` (0 of 60, read as "the family is
absent"); a hand-rolled despatch predicate 98 rows short; slicing passages
against `text_chars` instead of `body_length` (25.22% vs a true 2.65%); and
repairing three bidirectional arrows in the R8.1 lock into one-way arrows, which
changed an obligation. **Nothing errored in any of them** — the query succeeded
and answered a different question. Three were caught by disagreeing with a
number someone else had measured.

Bus 1250–1254 (START_STATE) · 1267 (FIFTH) · 1268, 1270, 1274, 1276, 1287 (LCC)
· 1269, 1282, 1286 (NEW1).

**POST-RELEASE, after NEW1 freed `HEAVY_BOX`.** Three jobs executed and proven,
one handed back.

- **§7.2 — 320,729 statute references linked in 50.7s.** `judgment_statute_refs`
  went from **0** linked to **320,729 of 862,594 (37.18%)**. Deterministic join,
  1,065 Act-key pairs, no model, no migration. This was **G1**, the top of the
  data-gap queue.
- **§7.3 — 4,688 unsafe pins cleared, ZERO remaining**, proven by re-asking the
  classification question in the same run rather than trusting the UPDATE.
  16,964 kept because their peers are the same decision.
- **§7.7 top-k — my recorded prediction was REFUTED.** I predicted
  `PARTY_SUBMISSION` would rise above its 19.75% pool rate; it **fell to 8.50%**.
  What rose is **`REPORTER_EDITORIAL`, 1.68% → 10.00%, a six-fold enrichment**.
  A headnote IS a confident legal proposition, which is what a legal query
  matches. **The aggregate hides it**: overall unsafe fell 24.85% → 20.00% while
  the composition got more dangerous. `COURT_REASONING` is **2.50%** of retrieved
  passages.
- **§7.1 fixtures — manifest `PROVEN`, execution handed to LCC per §8.8.** Not
  executed deliberately: the one open sub-decision is 5 `citation_checks` audit
  rows on LCC's surface. All 6 `overruled_by_judgment_id` pointers verified
  fixture→fixture.

**§7.5 — the shared-neutral defect is not ours.** 155,387 citations shared by
361,044 judgments; 53.4% are legitimate common orders. Of the worst
distinct-text groups, **8 of 8 across 8 High Courts print the shared citation on
the face of the PDF** — the Registry assigned it. **A neutral citation is not a
unique identifier in India**; it identifies a disposal event. Now in
`DOMAIN_TRUTH.md`. Cross-court collision is 5 groups / 12 judgments.

**§7.14 — the bench is in the text of 83.9% of High Court judgments and stored
for 0.000%.** Naive patterns recover 13.5%; the gap is extraction work, not
acquisition. The first run's three 0.0% courts were my patterns missing, not the
bench being absent — Bombay 89.3% contain CORAM, Kerala 99.8%.

**§7.16 — we hold reporter citations for 3 High Court documents in 18.7M**, and
100% of Supreme Court ones. Reporter form is ~78% of real citations and 2.38%
resolve. The valuable alias signal is HC, not SC.

Bus 1288–1289, 1301–1303.

### 26 August 2026 (R8.3) — NEW1: THE ROLE IS NOT IN THE DATABASE, WHICH IS WHY §9's FILTERED ANN HAD NEVER BEEN RUNNABLE; AND EVERY SEMANTIC CAPABILITY ROW IS OFF

R8.3 §12 N1-4 and N1-7 closed. N1-5 **gated**, deliberately, on two handoffs that
are not NEW1's to open. Commits `7034ac9`, `8bcc493`. Artifacts under
`docs/ai/new1-r83/`.

**The blocker nobody had costed.** §9 requires the eligibility predicate inside
the SQL pgvector plans. NEW2's role is a regex classifier run in script memory
against top-k that has *already been fetched* — it can census what retrieval
returned, it cannot filter what retrieval considers. The labels are now
materialised first (`n1_lab_passage_role`), at 6–20 minutes of real IO, which is
why that job waits for the box rather than running under LCC's API-suite timings.

**pgvector's post-filter trap is reproduced on this box, not cited.** Through the
parameterised path: `iterative_scan=off` returned **21 rows for a LIMIT 200** and
raised no error; `strict_order` returned 200 in 1,877 ms; `relaxed_order` returned
200 in 24 ms. Iterative scan engages through a nested-loop JOIN, so the labels
live in a side table and `new1_tranche_passages` stays byte-identical with its
recorded content hash intact.

**NEW2's `LIMIT` correction reproduces from outside NEW2** — an independent
no-`LIMIT` draw reads `REPORTER_EDITORIAL` **4.34%** against their corrected
4.44%, `COURT_REASONING` 1.17% against 1.20%. NEW1's `5.95x` enrichment claim and
its "judicial:reporter degrades 2.70x" line are **retired in writing**. What
replaces them is worse and is about form rather than authorship: `COURT_REASONING`
is the only substantive class retrieval **depletes** (0.87x).

**`supporting_authority` is a RANKING failure at human depth, not proven
representation absence.** Target in index for all six; `exact` 4/6 at depth 500,
`ann_ef200` 2/6, both zero at every depth a person reads. **No representation
rebuild.** A reranker is the shape that fits and is a future hypothesis, forbidden
this round. `n=6`.

**`SEMANTIC_CAPABILITY_RELEASE_SCOPE_R8_3.md` is published ahead of the
experiment** because LCC's §6 registry is being built now. Every row is
`DISABLED`, `EXPERIMENTAL_INTERNAL` or `LIMITED`; none is gated on evidence the
pending experiment produces, so it can narrow a row but cannot promote one.
Abstention is a **signal failure** — `topSim` spans 0.63–0.81 and the chosen
threshold is 0.20, below the whole distribution — not an untuned threshold, and
the grid was deliberately not widened a third time. **Exact and structured search
depend on none of it**, which is what makes a limited freeze possible.

Bus 1347–1353.

### 26 August 2026 (R8.1) — NEW1: PASSAGE BEATS HEAD WITH NON-OVERLAPPING INTERVALS, THREE FAMILIES SCORE ZERO, AND A FULL-CORPUS PASSAGE BUILD MISSES THIS BOX BY 2x

R8.1 §6, closed. Commits `6afdde0`, `f6f51b6`, `5541d0c`, `1c7dace`, `e3af175`,
`752d031`, `4067f15`. Artifacts under `docs/ai/new1-tier-a/`.

**The bounded 100k tranche is COMPLETE: 418,116 passages over 81,720 documents**
(5.116 chunks/doc), confirmed by row count rather than by the process being gone.
It survived two deaths — an uncaught `AbortSignal` timeout at 16:44Z and a machine
reboot at 23:05Z — and lost zero rows to either, because it commits per batch.

**Passage retrieval wins and the intervals do not overlap.** `cond_s@5` 0.3831
[0.3265, 0.4444] against HEAD 0.2409 [0.1845, 0.2978] — 59% relative, 3x faster —
and the comparison is unfair to passages: HEAD was scored against its own smaller
index and faced a quarter of the distractors. `RETRIEVAL_CANDIDATE_R8_1` is frozen.

**Three families score zero and one of them is the finding.**
`supporting_authority` is 0/6 at rank 5, 20 **and** 100, with the target in the
index for all six — the retriever never surfaces a document it holds, in a hundred
results. HEAD scores zero too, so it is a shared representation failure, not a
passage regression. `adverse_authority` and `statute` are zero at rank 5. The
runbook hoped the partial index's 0.25/0.33 would hold and called that the
sprint's headline; **it was an artifact of the forced-first build order Fifth
identified in bus 1255**, and it did not survive full scale. All three n are tiny
(6, 4, 3) — the evidence is the direction across independent attempts, not the rate.

**Abstention is frozen as a SIGNAL FAILURE, not a threshold.** Every query scores
`topSim` between 0.63 and 0.81 and the chosen `answer` threshold is 0.20 — below
the entire observed distribution, so it separates nothing. Second grid-edge hit, at
6x the index size, which makes it a property of the signal rather than the sample.
The grid was **not** widened, per the runbook's own instruction. The one permitted
composite risk candidate is deliberately unspent: calibrating confidence over a
retriever that returns nothing for three families would fit a decision rule to a
distribution already known to be wrong.

**A full-corpus passage build does not fit this box.** 627 GB against 284 GB free
and a database already at 300 GB; `halfvec` reaches ~535 GB and still misses.
`HEAD_VS_PASSAGE_DECISION_V2` recommends retiring the either/or framing: HEAD as
the corpus-wide coarse layer (~123 GB, feasible today, and the only arm that can
reach 8.85M documents), passages on a bounded high-value subset (~150 GB buys
~2.1M documents, about 24% of Tier A). **The HEAD walk is RESUME-AS-COARSE-ONLY
and step 1 is the census rebuild** — resuming without it replays finished batches
and writes nothing, which is what happened for 65 minutes on 25 Aug.

**Blocking caveat carried by all of the above:** reporter contamination on this
exact tranche is `NOT_MEASURED`. NEW2's 0.10% came from a frame where the Supreme
Court was 0.49% of rows; the SC corpus is 92.77% SCR reporter edition and carries
43.9% of all resolved citations. If a material share of the passages winning these
comparisons are headnotes rather than court reasoning, the quality result is
measuring the wrong thing. R8.1 §7.7, NEW2's to run.

Also closed off the critical path: `LONG_INPUT_POLICY_R8_1` (the 500-char cap
protects the sparse arm, not the model — production already refuses correctly and
never truncates), `NEW1_PROCESS_RESOURCE_REPORT_R8_1`, and
`SEGMENTATION_V2_EXPERIMENT_DESIGN` (design only; `chunk.ts` stays frozen).

Bus 1245–1249, 1259–1263, 1271–1273, 1279–1281, 1283–1285.


### 26 August 2026 (R8.1) — LCC QUEUE AGAINST THE TEN-ITEM KICKOFF ORDER

Live status of the R8.1 LCC kickoff order. DONE means observed, not inferred.

| # | Item | State | Evidence |
|---|---|---|---|
| 3 | GIT_COMMIT + MIGRATION_SLOT | **DONE** | `8d6d23b`; 8 parallel acquires, 1 winner |
| 10 | screened != clean guard in CI | **DONE** | `dcf2dba`; 1,123 files, non-vacuous |
| 4 | Risk-replay fail-closed gate | **DONE** | `1ff5372`; 5 closures, 13/13 |
| 1 | Security/privacy P0 | **PARTIAL** | `ddd6398`; IDOR/auth/erasure/egress measured; secrets, audit integrity, billing, fail-closed flags NOT measured |
| 6 | Cross-route uncertainty contract | **PARTIAL** | `d82baab`; /search + counter + saved feed. Briefing, preview, generation NOT wired |
| 2 | Process registry / startup truth | **PARTIAL** | `0497f32`; sweep readable, registry NOT true; alert poller Interactive principal = live outage |
| 5 | Timestamp precision audit | **DONE** | `73ec577`; 10 sites, audit pagination skipped 2 of 2, scan fails on the 11th |
| 9 | Synthetic fixture purity | **DONE** | `1fc1fb1` seam; executed 26 Aug 04:25Z on founder instruction. 16 judgments, 5 checks, 6 pointers nulled. 0 remaining. `fixture-leak.test.ts` 2/2 |
| 8 | DATE_UNCHECKED / currentness propagation | **NOT STARTED** | — |
| 7 | Retrieval evidence wire (§8.6) | **NOT STARTED** | — |

HEAVY_BOX was RELEASED by NEW1 at 02:13Z (bus 1290), so these are now
unblocked and are the next queue: fresh-install replay, targeted ANALYZE,
mixed-load isolation, release manifest, restore/rollback/host-loss, Railway
decision packet, and the alert-poller principal fix.

### 25 August 2026 (R7) — NEW1: THE ELIGIBILITY VIEW FILTERS NOTHING, A 320-CHARACTER WINDOW COSTS 500,000 DOCUMENTS THEIR PINPOINT CITATION, AND 29% OF COMMON LEGAL QUERIES ARE REFUSED

R7 §9. Commits `0cd7a65`, `a3d975b`, `9aa7eab`, `ba67b6e`. Artifacts under
`docs/ai/new1-tier-a/`.

**The HEAD walk was paused, and it was producing nothing.** Alive, GPU resident,
keeper healthy, checkpoint advancing — and `new1_doc_vector_stage` sat at 2,026,872
rows for 65 minutes. `stage-runner.sh` re-reads its worklist file faithfully every
run, but the CENSUS that WRITES that file was last run five days earlier, so it was
replaying ~119 finished batches. **Re-reading a file nobody regenerates is not
freshness.** The pause file now makes re-running the census a required step 1 of any
resume. `NEW1_GPU_PROCESS_TRUTH_R7.md`.

**`judgment_embedding_eligibility` has no WHERE clause.** The tranche selector's
first run reported 240,181 of 240,181 candidates surviving revalidation, so it was
fed inputs that must be refused: fabricated uuids were refused, quarantined ids were
NOT, random judgments were NOT, and `count(*)` over the view equals `count(*)` over
`judgments` — 18,698,984. It is a LABELLING view; joining to it proves existence, not
eligibility. The operative predicate lives in `doc-vector-embed.mjs` and is now
reproduced in the selector. Survival drops to 93.86% and is court-shaped: **Karnataka
2010s 14.6%, Supreme Court 100%.** Anything reading "eligible" as "present in the
eligibility view" is counting the whole corpus.

**Tranche selection succeeded on attempt #4, after three failures.** `row_number()
OVER (PARTITION BY ...)` cannot stream — it materialises and sorts the whole joined
relation before emitting a row, which is why attempt #3 produced no partial output in
40 minutes. #4 commits to the 888 local frame files by hash, draws with a seeded
per-cell bounded heap, and asks the DB only "is this id still eligible" — an Index
Only Scan at **0.203 ms/id**. 8.85M rows to a frozen **81,510-document** manifest in
~3 minutes, two runs byte-identical. Architecture approved by FIFTH (bus 1176), ACKed
(1185). **32 of 75 strata cells underfilled and NOT redistributed:** pre-1990 filled
598 of 5,000, and the Supreme Court filled every cell while High Courts did not — a
High Court acquisition gap, not an age gap.

**~500,000 documents can never supply a pinpoint citation, and the cause is one
line.** 97.05% of tranche passages carry a verified span, which is the wrong number:
the loss is document-shaped, and 1,357 documents have none at all. Every one has 1.00
passages and no paragraph structure, min length 2,401 against `maxChars` 2400, max
2,714 against `maxChars + minChars` 2720. A document just over the limit splits
mid-paragraph, the short tail merges back with a canonical `

` that was never in
the source, and the slice-and-compare correctly refuses to certify the span.
**In band: 45.99% lose every span. Outside: 0.00%.** ~6.14% of the corpus is in the
band. The one-line fix is written down and deliberately NOT applied — `chunk.ts` is
the segmentation identity of `judgment_chunks` and of the running build.
`RETRIEVAL_EVIDENCE_CONTRACT_V1.md` §8.

**14 of 48 of the most common Indian legal queries are refused before ranking.** All
four bail queries, three of four anticipatory bail, three of four quashing-FIR, two of
four limitation, two of four writ maintainability. **Length is not the mechanism —
minimum term document frequency is**, and a twelve-word anticipatory-bail sentence is
refused too. That corrects LCC's 1173 inference. Passage ANN answers all 14
on-concept. `COMMON_QUERY_SEARCH_CONTRACT_V1.md`.

**Two of my own errors, corrected in place.** The fusion guard was inverted — it
skipped the arm citing 0.033 overlap as "not complementary", when 0.033 overlap IS
high complementarity; run properly it gives +0.019, so SHIP-CANDIDATE not SHIP. And
the first four-arm HEAD comparison scored HEAD against the PASSAGE index's document
set, charging it for targets it never held; scored against its own index the gap is
2.8x on s@5, not 7x. The target-cluster bootstrap then said even that is **not yet
claimable** — the 95% intervals overlap at this sample size.

**Still running:** the 100k passage build (~33% at the time of writing, resumable,
reported by durable row delta). Gated on it: full family metrics, held-out abstention,
`PASSAGE_100K_VALIDATION_V1`, `HEAD_VS_PASSAGE_DECISION_V2`.

Bus 1181–1184 (START_STATE) · 1185 (FIFTH ACK) · 1222 (sparse guard) · 1224–1227
(span ceiling) · 1228 (contention).

### 25 August 2026 — NEW3: THE 10-MATTER TEST IS PERMANENT NOW, ITS CONTROL MATTER FAILED, AND THERE IS NO WEBSITE

Sprint plan V2 §10. Full board: `docs/product/NEW3_ROUND_TODO.md`. All seven §10
items delivered; NEW3-7 deferred because RCC has landed nothing to review.
**Zero writes under `apps/**`** — CLIENT_APPS is RCC's and was not contended for.

**1. The 10-matter walkthrough is a regression test rather than a report.**
`docs/product/TEN_MATTER_PRODUCT_REGRESSION_SPEC_V1.md`,
`pnpm --filter @lawmind/harness product:ten`. The 23 Aug run found a P0 and threw
its evidence away — scratch driver, scratch JSON, random accounts. This one pins
every matter to a real corpus judgment id, **re-asserts the property the scenario
is named for before scoring**, retains raw artifacts, and runs on one command.
Nine of the ten are selected for a FAILURE MODE rather than an area of law.

**10/10 matters, zero fixture drift.** Dense arm disabled (NEW1 owns dense; GPU
at 100%), premium flags left OFF, box LOCAL_CONTENDED.

**2. The control failed, and `retrieve.ts` is not at fault.** `"anticipatory
bail"` returns `results: []`, HTTP 200, 4 ms, `degraded: ["sparse_unbounded"]`.
`sparseAny` refuses to rank when its rarest lexeme exceeds df 0.05 because
`ts_rank` over ~935,000 documents is over ten minutes — correct, and measured
before the threshold was chosen. Measured against `lexeme_document_frequency`:

```
REFUSES  rarest df 0.06902   anticipatory bail
REFUSES  rarest df 0.25774   bail application
REFUSES  rarest df 0.11922   quashing of FIR
ranks    rarest df 0.00089   cheque bounce section 138
```

`bail` alone is in **25.77%** of the sampled corpus. For that class dense is the
only remaining arm and NEW1 measured its reach at **40,161 of 18.7M (0.21%)**.
When dense is unavailable at all — a state `index.ts` logs as "search is
lexical-only" and keeps serving — the advocate gets an empty 200 that renders as
"no law found". Filed as `FQ-SEARCH-COVERAGE-COMMERCIAL`: it bears on the
subscription model, not only on retrieval.

**3. `GET /judgments/:id` returned 500 after 40,024 ms** on one Allahabad
judgment. Uncharacterised at n=1; sent to LCC.

**4. Provenance reaches no surface.** `treatmentProvenanceOnWire: false` on all
ten. **M02 (Synthetics & Chemicals, `set_aside` on a reporter headnote) and M03
(S. N. Dutt, `set_aside` on the court's own words — one of only five such edges
corpus-wide) render identically to an advocate.** Confirms migration 0082's own
comment, now from the product surface rather than the schema.

**5. `/arguments/counter` has no abstention field.** Keys are exactly `position,
asOf, authorities, excluded, unverifiedReferences`. It returns 12 nearest or 0.
The 0 case is real — two genuinely unmatched positions returned zero authorities.
The dangerous shape is the middle: **M06 reproduced the 23 Aug wrong-domain miss
exactly** — the same IPC §394 robbery conviction for a commercial breach position,
deterministically, two days later.

**6. Two artifacts now bind public copy.**
`docs/product/WEBSITE_CLAIM_EVIDENCE_MATRIX.md` — 22 rows, four statuses, a
verifying owner and exact allowed wording per row, 8 rows `BLOCKED`.
`docs/product/WEBSITE_PRODUCT_SPEC_V1.md` — and its §0 is the finding: **`apps/`
holds `mobile` and `admin` and nothing else. There is no website.** `lawmind.co`
is verified and serves nothing. Both stores reject a submission without a privacy
policy URL, so this is a store gate. `FQ-SITE`.

Positioning verified from primary source: *Pooja Ramesh Singh v. Jammu & Kashmir
Bank*, **2026 INSC 668**, 2 July 2026, read from the judgment's own text in our
corpus. The spec requires quoting **para 17** and forbids the SCR headnote — the
same rule the matrix applies to LAW MOVED, applied to our own marketing.

**7. Generation cost does not exist.** All-time `llm_calls`: **40,124 calls,
$0.1232**, entirely DeepSeek V4 Flash, **zero calls ever to Sonnet or Haiku**, no
Hearing Pack ever generated. `PREMIUM_COMMERCIAL_DECISION_PACKAGE_V3.md` prints
no COGS figure and specifies what would produce one.

**8. Three absolute store blockers, none a code problem** — no website; no
reviewer can complete magic-link sign-in and no test-account bypass exists
anywhere (grepped, zero hits); `FQ-HOSTING` blocks any production build.

**Closed:** LCC's 1111 verified — all seven activation steps have real call
sites. My V1 grep missed them because the export was renamed.
`ACTIVATION_FUNNEL_V2.md`. New, smaller gap: `funnel()`/`worstDropOff()` have
zero non-test consumers.

**Corrected against my own first draft:** the modality defect does **not** block
add-to-matter. OD-14 derives the effect from the edge; M02/M03/M04 all saved at
201. The harm is narrower and still real — a 1975 Supreme Court authority carries
a LAW MOVED mark whose whole evidence is a subjunctive in a dissent.

**Not claimed:** no device testing, briefing quality UNMEASURED (`N/A`, not pass),
monitoring `ALERT_PATH_ONLY`, drafting not exercised, `advocate_would_prefer`
blank on all ten because it needs a real advocate.

Bus 1141 (LCC) · 1142 (NEW1) · 1143 (NEW2) · 1147 (RCC).

### 25 August 2026 — NEW1: THE KEEPER'S SIDECAR SWEEP MATCHED ZERO PROCESSES AND LOGGED SUCCESS, AND V3 COULD NOT BE REPLAYED

Convergence sprint V2 §7. Board: `docs/ai/new1-convergence/TODO.md`. Every number
below was OBSERVED — run, read or counted.

**The GPU factory IS progressing, and it was proved the only way that counts.**
`new1_doc_vector_stage` went 1,996,134 → 1,997,735 over a real 330.6s interval,
and the DB delta (+1,601) equals the walk log's own `inserted` delta **exactly**.
GPU utilisation was 93–99% throughout and is *not* what established this;
`services/harness/src/new1-progress-probe.mjs` now reports GPU as context only.

**The keeper's restart has never once worked against the failure it exists for.**
`killExistingSidecars` filtered on `embed..gpu..server\.py` — each `..` is two
regex wildcards, and the real command line has ONE character between `embed` and
`gpu`. Measured live: the old pattern matched **0 of 2** running sidecars, the
fixed one matched 2. So the sweep killed nothing, PowerShell exited 0, and the
keeper logged "killed any existing sidecar before spawning" over a sweep that
killed nobody. RESTART #2 then spawned a sidecar that could not bind port 8799
and did 18 CPU-seconds of nothing in four hours. The one restart that "worked" is
the one where there was nothing to replace. Fixed in `067d5c8`; the sweep now
counts survivors and logs SWEEP INCOMPLETE, because "I killed it" and "I could
not kill it" were producing the same log line.

**Same bug, second face:** that `spawnSync` had no timeout, so RESTART #3 wedged
the keeper for **535 seconds** inside a hung PowerShell. Keeper restarted onto the
fixed code (pid 28060).

**A worker belonging to no lane is IO-saturating the box.** An orphaned `cmd /K`
loop runs `citations-cli --concurrency 12` with no scheduled task, no registry
record and a dead parent; a second runs `paragraphs`. Measured cost to the
embedding walk: **8,412 → 494 tok/s, a 17× penalty, with the GPU at 0–2%** — not
GPU-starved, starved behind that job. Reported to LCC (bus 1127, corrected 1131).

**V3 could not be replayed, and a seed is not the fix.** Two unseeded sites:
`representation-lab-v3-cli.ts:359` (`Math.random()` in the bootstrap) and `:623`
(`TABLESAMPLE SYSTEM (3)` with no `REPEATABLE`). `REPEATABLE` does not help
because the fill source is written by the live walk and `TABLESAMPLE SYSTEM`
samples *physical pages* — it would convert visible drift into silent drift.
**V3.1 freezes identity to an artifact instead**: 295 query hashes, 213 targets,
211 clusters, 25,000 pool ids, segmentation version, model digests, strata.
Two independent freezes agreed byte-for-byte on all of it.

**`case_type` cannot carry the criminal/civil stratum: it is NULL for 75.6% of
the corpus** (`hc_document_class` 74.3%). The case-number registry prefix covers
98.7% and is the only signal that can. Also: the corpus is **96.5% post-2010**, so
a proportional 100k sample would hold ~48 pre-1990 documents and the tranche's era
mix is deliberately skewed, with both proportions recorded.

**Not done, and why:** the 100k tranche is DESIGNED and its selector BUILT
(`tranche-select-cli.mjs`, gold-blind, one eligibility definition, underfill
reported never rebalanced) but **not built into vectors** — that needs a GPU quiet
window the box has not had. Abstention is **pre-registered** before any score
exists (`ABSTENTION_PREREGISTRATION.md`) but not fitted, for the same reason.
**No HEAD-vs-passage recommendation is offered yet**, because the plan makes it
conditional on tranche evidence and that evidence does not exist.

Commits: `067d5c8` `79a2efa` `7a9600c` `95823a5` `661ce1b` `bd6cf6c` `06a6402`.

### 23 August 2026 — NEW2: THE RESOLVER'S FALSE UNIQUES ARE A STALE INDEX, 95.62% OF LAW MOVED IS A HEADNOTE, AND THE ELIGIBILITY GATE'S MARGIN SEPARATES NOTHING

Round contract §8. Full board: `docs/ai/new2/NEW2_NEXT_ROUND_TODO.md`. All five
§15 deliverables written. Every number OBSERVED — run, read or counted — never
inferred. **LOCAL_CONTENDED throughout**: 2–13 concurrent PostgreSQL queries, and
the resource gate read `DEFER DB_SCAN` for most of the session, so the work was
kept to bounded indexed reads.

**1. The resolver was graded against independent truth for the first time.**
`RESOLVER_FALSE_UNIQUE_AUDIT_V1.md`. LCC declined to print a false-unique rate
without an adjudicated sample; this lane owns the sample.

```
false unique, any severity   10/64 = 15.63%  [8.71, 26.43]
MATERIALLY unsafe             0/64 =  0.00%  [0.00,  5.66]
non-citations wrongly resolved   0 of 40      phantom pins 0
```

**The cause is not the rules — it is the index they read.** Of the 68 adjudicated
candidates in the 34 misgraded records, 58 are reachable only through
`judgments.neutral_citation` and 10 through `judgment_citation_keys`; the resolver
counts candidates in the key table alone. Corpus-wide, **33,013 of 155,388
shared-neutral groups collapse to a false UNIQUE, 99.5% of them Allahabad**,
because that index is **309,130 neutral citations behind its own `(created_at,
id)` cursor since 17 August**. Tested rather than assumed: 309,130 against a
309,414 shortfall is 99.91% of the gap.

**Re-running the existing builder repairs 33,001 of the 33,013 and leaves 0 of the
different-document class** — stated as a falsifiable prediction with its number.
**No backfill approved**, and the rate must be re-measured after the rebuild
because the population changes in both directions.

Already in the graph: 22,469 of 231,412 pins land in a shared group, but **0 of
the 137 adverse treatments do**. LAW MOVED is clear of this contamination.
`citation_concordance_resolutions` is 156 `gold_eval` rows, all unvalidated, and
no production writer reads it.

**2. 131 of the 137 edges behind LAW MOVED are a law reporter's headnote.**
`TREATMENT_PROVENANCE_DECISION_INPUT_V1.md`. All 16,001 treated edges classified —
not a sample — and all 137 badge-driving edges **hand-read**, because a phrase list
scores well on the documents it was written from. The screen said 93 reporter / 42
unknown; the read says **131 reporter (95.62%) / 5 court (3.65%) / 1 defect**. Its
UNKNOWN class was under-detected reporter apparatus.

**98 judgments render LAW MOVED** (a further 6 are Test Court synthetic fixtures
sitting in the production corpus). **If reporter evidence may not promote to
canonical, 5 survive.** Five surfaces promote on a bare `relationship IN (...)` and
`judgment_citations` has no provenance column, so none of them could filter even if
it wanted to — the gate is one line in `propagate-treatment.ts`, and the column is
what is missing. `OFFICIAL_REGISTRY_STATUS` has no source: `ecourts_observation`
holds 0 rows.

A new defect class, found by reading: **MODALITY**. A 1985 dissent saying an
authority *"is sought to be overruled by the judgment proposed to be delivered by
my learned Brother"* is stored as `overruled` and is the sole driver of a
`set_aside`. Polarity is the wrong verb; modality is the right verb in the wrong
mood, and `MARKER_RE` guards neither.

**3. The body-text screen already looked at 18,698,968 documents, so no rescan is
needed — but the checkpoint's own watermark is unusable.**
`BODY_TEXT_EVIDENCE_STATE_V1.md`. Judgments created before the run started number
**18,698,968 exactly**, with a zero-width during-run band. But the walk pages by
random uuid, so all 16 rows created since sort BELOW the final cursor and an id
watermark would certify 100% of them as screened having never been looked at. The
watermark must be `created_at`, and the run table therefore does not carry the
cursor as a column at all. `body_text_evidence` then reads
`SCREENED_NO_DAMAGE_FOUND` 16,906,647 and `NEVER_SCREENED` 16, with damage refusal
unchanged at 1,792,321 either side. Table and view remain LCC's.

**4. Documents just ABOVE the eligibility gate are as substantive as those just
below it.** `UNCITED_SUBSTANTIVE_AUTHORITY_STUDY_V2.md`. 140 documents read as
primary text, drawn from NEW1's stratified frame plus a control the study had
never had.

```
RESIDUAL_NO_NEGATIVE_MARKER (refused)   4/60 = 6.67%  [2.62, 15.93]
MARKER_CARRYING             (refused)   0/40 = 0.00%  [0.00,  8.76]
CONTROL_ABOVE_GATE_2000_3000 (ADMITTED) 3/40 = 7.50%  [2.58, 19.86]
weighted refused population                    2.87%  [0.15,  5.58]
```

**The control is the finding.** Both populations are about 93% procedural, so the
gate's usual justification is wrong; the real discriminator is the negative-marker
stratum, which scored **zero in forty**. This is not an argument for lowering the
threshold. **Still no classifier** — 7 positives in 180 refused documents across V1
and V2 against the ~62 rule-positives precision needs, so the founder's question
stays **UNKNOWN**.

**5. Nineteen treatment rows were made by a hyphen inside a word, and a
single-writer diff would have deleted 1,624 real ones.** All 16,001 re-derived. The
first attempt diffed against `detectTreatment` alone and reported 1,680 rows wrong;
there are **two** treatment writers with different vocabularies — `detectTreatment`
(`citations.ts`, narrow) and `readTreatment` (`treatment.ts`, wide, run by
`citator-cli.ts` over resolved edges). Against both, the disagreement is 19 and **0
rows are contradicted**. The 19 are `dis-approved`, **`contra-distinguished`**,
`"un- doubted"`, `"deci- sions"`. Withdrawn to `cites`; badge impact measured first
and re-asserted in the UPDATE's WHERE clause; **0 badges moved**; `overruled` 117
and `overruled_in_part` 23 unchanged.

**6. India Code is not down any more, it has moved.** Root answers 200, the Central
Acts listing answers **404 rather than 504** — so our own URL builder is stale
rather than the service being unavailable. Two requests, twenty seconds apart.
`FQ-INDIACODE-AVAILABILITY` updated; the re-derivation is bounded engineering on
NEW2's board, not a founder decision.

**The only corpus mutation this session is those 19 rows.** No backfill, no
treatment rewrite, no resolver apply, no eCourts traffic, no threshold change.

### 23 August 2026 — LCC: THE DATE STATES REACHED THE CHRONOLOGY, TENANT ISOLATION IS PROVED RATHER THAN ASSUMED, AND THE TEST-COURT CENSUS ANSWERED 6 AFTER ANSWERING 0

Full board with per-item evidence: `docs/ai/lcc/LCC_ROUND_TODO.md` §ROUND 2.
Everything below was OBSERVED — run, measured or asserted — never inferred from
reading code. Every latency is **LOCAL_CONTENDED**: three agent sessions, the
ingest fleet and a GPU walk were live throughout, and the resource gate read
`DEFER DB_SCAN` for most of the round.

**1. NEW2's date states had one consumer and now have six.** A fifth-agent
forensic pass found ZERO; `as-at.ts` had since become the first, with its rule
written in a comment where no second route could reuse it. It is now
`judgments/date-quality.ts`, and `dateQuality` reaches `GET /judgments/:id`,
`/treatment`, `/graph`, `GET /citations/:id`, and the treatment PROPAGATION
ordering.

**The distinction that survives to the wire is the one that matters.**
`DATE_UNKNOWN` is a measurement with a null result; `null` is no measurement.
They are a string and a JSON null, never collapsed into three values — folding
them is the `is_bail_order` NULL failure this repository has already paid for.
**Only `DATE_SUSPECT` refuses anything**; refusing on silence would refuse a
quarter of the corpus on the strength of nobody having checked.

Observed on a real treatment page: row states
`["DATE_VERIFIED","DATE_SUSPECT","DATE_VERIFIED","DATE_VERIFIED",null]` →
`chronologyReliable: false`. Nothing is dropped or reordered — a treatment list
that quietly omits a doubting bench is a far worse defect than one shown in the
wrong position. The problem is derived certainty, not discoverability, and
`judgment_date` is never rewritten.

**In `propagate-treatment.ts` a contradicted date is DEMOTED, not excluded.**
`DISTINCT ON` decides which citing judgment is shown to the advocate as the
provenance of an overruling — "set aside by X on <date>" — and "the latest court
to say it" is a chronology claim. A candidate whose citing date is contradicted
now ranks below an equally strong one whose date is not. Where every candidate is
suspect the strongest still applies, and the state travels with it.

**2. Tenant isolation is now proved, and admin authorisation never proved it.**
`security/tenant-isolation.test.ts`: USER_A, USER_B and ADMIN, real tokens, foreign
rows by direct id. **33 cross-tenant attempts, 0 FAIL, 0 403-instead-of-404**,
13/13 green. Matters, events, event visibility, authorities, shares, briefings,
documents, document citations, saved searches, annotations.

Three design points that are the whole value of it:

- **Writes are checked at the ROW, not at the status.** A handler can answer 404
  and still have run its UPDATE, and a status-only test passes that.
- **400 is INCONCLUSIVE, never a pass.** A probe rejected by the body validator
  never reached the ownership check. Three probes were doing exactly that and
  were silently "passing"; the classifier now fails on it.
- **The admin battery has a positive control.** Without one, a middleware that
  refuses EVERYONE passes every negative assertion and takes the admin panel down
  silently.

**3. A deployment variable was making a confidentiality decision.** `route.ts`
decided which MODEL by sensitivity and was correct. **Nothing decided which
COMPANY'S SERVER** — `call.ts` chose between inferx.net, OpenRouter and Anthropic
by whichever API key happened to be set. Now one contract,
`canSendToProvider(payloadClass, provider)`, asked after the key resolves and
before any byte is sent. Six payload classes; `PUBLIC_QUERY` is treated as
private in substance because what an advocate types describes a client's
position. **Retention and training-use read `UNVERIFIED` for all three
providers**, which is the module working: a confidently wrong "30 days, no
training" is worse than a blank because it is the sentence somebody quotes to a
client. Proved by ZERO outbound requests with a counting fetch, 10/10.

**4. The resolver is a component, not a backfill, and there is no `--apply`
flag** — a flag that is only unsafe today is a flag somebody passes tomorrow.
Bounded dry run over 8,000 unresolved edges, nothing written:

```
refused 73.2%  and EVERY refusal was an EMPTY row, not a placeholder string
formed  2,142  hit 43.28% · unique 40.85% · ambiguous 2.43% · not-held 56.72%
ambiguity size p50 2 · p90 38 · max 845
34 ms per 1k references · 0 model calls · LOCAL_CONTENDED
```

That independently corroborates NEW2's "a large part of the 22M table is
placeholders", arrived at from the other direction by someone who did not know
the number — and verified by reading raw rows rather than trusting my own gate.
The **max 845** is NEW2's 1019/1020 exactly: a neutral citation identifies a
disposal event, not a judgment.

**A resolved citation is not a legal treatment**, and it is enforced rather than
documented: every result carries `relationship: 'UNKNOWN'` as a VALUE and
`verifiedTreatmentEligible: false`. If resolver coverage rises tomorrow,
currentness coverage has not moved by one document. **False-unique% is
deliberately not reported** — it needs an independently adjudicated sample, and
printing a plausible number for it is exactly what would let a backfill through.

**5. The commerce spine exists and is inert.** Migrations `0077` and `0078`
applied. Capability-based, provider-neutral, **no plan name, no price, no `PRO`
boolean**. A recurring grant and a credit balance answer the same question at the
same call site, so both revenue models fit without a migration.

The invariants are unique indexes rather than careful code, because two taps on a
phone with bad signal are two requests in flight and every check-then-write loses:
**two simultaneous redemptions of one credit spend exactly one**; two simultaneous
taps create **one** job; a redelivered purchase grants **once**. Asserted with
`Promise.all` against the real database, because a sequential test proves nothing
about a race.

`adverse_treatment_visibility` is typed SAFETY_CRITICAL and `requireCapability`
**refuses to gate it, in code**. Selling an advocate their own professional risk
back to them is not a paywall decision that is available to us.

**Every premium route is behind a `platform_config` flag that defaults OFF.**
With no flag row at all, all four answer 404. A client carrying a paywall screen
must never imply the backend will serve it, and a screen in a shipped build
cannot be taken back.

**6. `0078` exists because writing the test found a defect in `0077`.** The
direction CHECK listed `refund_reversal` in two branches of one OR, so the one
reason whose direction matters most had no direction at all — a refund recorded
as `+1` would have handed a refunded customer a free hearing pack. Fixed
forward-only and asserted against the live constraint.

**7. The Test Court census answered 0 on 22 August and 6 today, and both are
true.** The six are leaked FIXTURES — `source_url LIKE 'test://%'`,
`case_title LIKE 'SYNTHETIC — %'`, all written in one ten-minute window this
morning by a concurrent session, on the same morning a suite died with a Postgres
`could not read blocks … Invalid argument`. **A killed process does not run its
`after` hook.**

That resolves the contradiction the round asked about: **the count is not a
property of the corpus, it is a property of whether a suite was mid-run when
somebody looked.** Nothing has been deleted. A guard now reports them — with the
six enumerated by id so they cannot fail a build nobody is allowed to make green,
and **a seventh still can**.

**8. Three regressions of my own, caught by this repository's own guards.**
Three `_at` columns cast to Postgres text, which Hermes renders as Invalid Date;
then the SAME guard catching the pattern inside the explanatory comment I wrote
about it, because the guard greps source text and a comment is source text. And
`admin/data-requests.test.ts` was seeding an ordinary advocate against an admin
route — 4 failures predating this round, from `0074`'s deny-by-default, where the
TEST was the stale half rather than the middleware.

**What is NOT done, and is not claimed:**

- **The full API suite has not completed and is NOT claimed green.** Run 1 died
  with a Postgres I/O error under three-session contention; run 2 is still
  executing, at 75 pass / 0 fail, with individual tests taking up to 19 minutes on
  a box this loaded. Every targeted suite passes: 13 tenant · 28 commerce ·
  10 premium routes · 13 resolver · 10 provider policy · 6 date quality · 2
  fixture guard · 12 as-at/citation-check · 5 data requests.
- **P10, the release proof** (Linux → indexes → search-equivalence → rollback) is
  not advanced. Another session was live in `services/api/src/p10-probe.ts` — six
  seconds old when found — and two agents editing one proof is worse than a slow
  one.
- **NEW1's uncited-authority bias** (bus 1050): the eligibility view refuses
  **40.09% of the corpus solely for want of an inbound citation**, and the rescue
  fires for 11 documents in 40,000. The view is LCC's file and the class evidence
  is NEW2's. **Not changed alone.** `FQ-ELIGIBILITY-UNCITED`.
- **Nothing about the 24-hour briefing being safe to market.** That is NEW3's
  10-matter walkthrough plus the fifth agent, not this lane.

**Founder items filed this round:** `FQ-PROVIDER-TERMS`, `FQ-PREMIUM-MODEL`,
`FQ-BILLING-PROVIDER`, `FQ-LOGOUT-TOKEN-WINDOW`, `FQ-STAGING-CORPUS-SIZE`,
`FQ-ELIGIBILITY-UNCITED`. None closed on an agent's recommendation.

### 23 August 2026 — NEW2: THE RESOLVER TRUTH SET CORRECTS ITSELF, 72.08% OF THE CITATION TABLE IS NOT A CITATION, AND FOUR EDGES SAID THE OPPOSITE OF WHAT THE COURT DID

**Owner: NEW2 (ingestion / data truth). Two commits: `ae8a8c7`, `57f29e3`.**
728 ingest tests, 0 failures, `tsc --noEmit` clean.

1. **DONE — the 22M citation table has named states and a predicate.**
   Exact by index-only scan: 22,322,047 rows = **16,090,200 sentinels (72.08%)**
   + 6,000,435 extracted references (26.88%) + 231,412 resolved (1.04%). The
   sentinel is a per-judgment *"walked, found nothing"* marker written by
   `citations-cli.ts:399-411`, one per judgment by unique index (probed 400,000
   rows → 400,000 distinct judgments). **Deleting it would re-scan the corpus.**
   LCC's resolver reached 73.2% from the API side without knowing the number.
   `CITATION_TABLE_SEMANTICS_2026-08-23.md`.

2. **DONE — resolver truth set v2.0.0, 283 records, and it corrects my own v1.**
   All three of v1's "materially unsafe pins" are seeded in by edge id; with a
   `content_hash` witness v1 lacked, **none is unsafe** — two byte-identical, one
   sharing case title *and* number. **v1's 5.88% unsafe-pin rate is an
   overstatement; the dangerous class is ONE record**, `2026:JHHC:16965`, two
   different Jharkhand bail matters a month apart, currently unpinned.
   Primary-source check with poppler: the citing document prints the reference
   **26 of 26**; the target prints its own citation 13 of 26 — **13 of 16 for
   court-assigned citations and 0 of 10 for reporter forms**, because a reporter
   assigns its citation after publication. A reporter-form pin can never be
   strengthened by the paper.

3. **DONE — display-grouping contract (P2/P14).** Five classes; only the two
   resting on document evidence collapse. 700 groups / 1,533 rows: byte-identical
   51.01%, connected matter 36.46%, distinct 10.44%, several orders 2.09%.
   **Auto-collapse removes 29.03% of shared rows and hides zero authorities.**
   Representative is a total order ending in `content_hash` then `id` — one
   picked off row order paginates a judgment onto two pages.
   `services/ingest/src/display-group.ts`, 14 tests.

4. **DONE — four `approved` edges recorded the opposite of what the court did.**
   `MARKER_RE` opened with `[-–—]`, and the hyphen inside *dis-approved*
   satisfied it. 4 of the 61 `approved` rows in the corpus. Fixed at the writer
   with a lookbehind; two tests, one built from the four real corpus strings.
   **Rows not corrected in the database** — `approved` never reaches
   `propagate-treatment.ts`, so no LAW MOVED badge was driven by them.
   An earlier pass of mine said 8 inversions including one `overruled`; **that was
   my own screen**, using a window wider than the writer's reachable window.

5. **DONE — the treatment finding under it, and a founder question.**
   **0 of 400 treatment annotations sit in court reasoning; 56% sit in a law
   reporter's headnote apparatus** — the copy-edited part `CLAUDE.md` §6 says we
   may not rely on. `FQ-TREATMENT-HEADNOTE-PROVENANCE`. Nothing withdrawn.
   `RESOLUTION_IS_NOT_TREATMENT_2026-08-23.md` carries the contract and
   `TREATMENT_ENRICHMENT_CONTRACT_V1`; the number that would prove a breach is
   `treated_and_pinned / resolved = 4.647%`, which must not move on a backfill.

6. **DONE — uncited substantive authority (P6): the answer is UNKNOWN, with a
   number.** 80 documents from NEW1's length-gated population read as primary
   text, 40 train / 40 held out. Substantive base rate **3.75% [1.28, 10.45]**.
   With 3 positives in 80 no rule's precision is estimable; ±10pp around 80%
   needs ~62 rule-positives ≈ 1,650 documents adjudicated. **The classifier was
   not built.** The one court-issued signal found — the `Whether reportable?`
   stamp — was refuted: 630 of 30,000 documents carry it, **629 are Punjab &
   Haryana**, and **86.35% say Yes**.

7. **DONE — ingest egress is gated (founder correction 2).** `llm-egress.ts`:
   ingest may send `PUBLIC_LEGAL_TEXT` and nothing else, to anybody. A private
   payload makes **zero** outbound requests, asserted with a counting fetch.
   Narrower than LCC's provider policy on purpose — `services/ingest` cannot
   import `services/api` without a cycle, and a copied policy table drifts.

8. **DONE — the OCR queue was reading gold from a directory that does not
   exist.** `goldIds()` resolved relative paths against the working directory, so
   the same command read 707 gold authorities from `services/ingest` and **zero**
   from the repository root, printing `ADVOCATE100.json=ABSENT` beside
   `BENCHMARK_GOLD queued 0`. Now module-relative. After the fix **there is no
   backlog**: all 72 damaged cited authorities and 4 damaged benchmark gold are
   already recovered.

9. **DONE — a storage read that killed a scan is now survivable.**
   `could not read blocks 1441792..1441807 … Invalid argument` (XX000). Not
   corruption: the same ctid range returned 114 rows seconds later and all 22
   segment files are a full 1 GiB. Matched on the **wording, never the SQLSTATE**
   — XX000 is `internal_error` and retrying it wholesale hides server bugs.

10. **PARTIAL — body-text evidence state (P3).** `text_state = TEXT_UNKNOWN` means
    **never screened** for 16,906,663 rows (90.42%), and **no writer has ever
    emitted `clean`** — that branch of the CASE is unreachable. The screening did
    happen (18,698,968 in the checkpoint); the proof is in a JSON file nothing can
    join against. DDL for `quality_screen_runs`, the view expression, and the
    reason it must default to `NEVER_SCREENED` are handed to LCC. **Not applied
    alone** — `body-text-safety.test.ts` pins the view on purpose.

11. **BLOCKED — old criminal codes (P4/P13) and therefore the correspondence
    recompute (P5).** `indiacode.nic.in` returns **504 after 248s** on every
    request, twice, hours apart — including the **known-good BNS handle** that
    loaded 531 sections from the same code path. The site is down; the handles
    are not the problem. The whole path is built and tested behind `--repealed`.
    `FQ-INDIACODE-AVAILABILITY`. Denominators restated honestly in the
    `BNS_BNSS_BSA_INVENTORY` addendum: **0 of 226 correspondence rows have a
    primary witness on their old side**, and 18.51% must not be quoted as
    correspondence coverage.

12. **DEFERRED — hc-classify (P9).** **43.78%** (8,186,750 of 18,698,984), up
    from 26.0% on 22 Aug. **Not running** — process table checked, not just the
    checkpoint. The gate read `DEFER` on 14 active queries with a 2,894-second
    statement, so it stays stopped rather than competing with NEW1's walk.

13. **NOT DONE, deliberately.** No corpus mutation. No placeholder deleted. No
    fuzzy dedup. No corpus-wide OCR. No eCourts request. No treatment withdrawn.
    ADVOCATE-100 leakage **not** self-graded — the fifth agent's audit has not
    returned and `leakage_failures: 0` is labelled as the author's own number.

### 22 Aug 2026 (morning) — NEW2: THE QUALITY CONTRACT IS QUERYABLE, `PROOF` IS REACHABLE, AND MY OWN DATE READER WAS CONVICTING THE SUPREME COURT

**Session queue. Items 1-6 landed; 7-9 are the honest remainder.**

1. **DONE — proof-grade damage is in the database.** 1,626,762 verdicts lived in a
   1 GB JSONL nobody could join against. `text-damage-persist-cli.ts` writes
   `script_quality = 'damaged_other'`, `script_quality_method = 'text-damage-v2.0'`.
   **`text_safety_grade = 'PROOF'` was unreachable by design in `0070` and is
   reachable now** — 141,044 rows at last count, pass still walking.
   **The finding is the 4.7%:** of the first 158,000 proof verdicts replayed
   against the live column, **7,814 had `script_quality IS NULL`** — proven glyph
   dumps no screen had ever convicted, still eligible for the GPU. Two `*_STORED`
   reasons are refused as circular (56,641 rows): they are the detector reading
   back the column it would write.
2. **DONE — the recovery queue exists and is worked by value, not by damage.**
   `0071`: `judgment_recovery_queue` + `judgment_text_recovery`. 63 documents
   queued (62 cited authorities, 3 benchmark gold, 2 overlapping). Recovered text
   sits **beside** `full_text`, never over it. `digit_trust` defaults to
   `UNVERIFIED`; `ocr-digit-trust.ts` adjudicates against `case_number` and
   `judgment_date`, which arrive as source metadata and cannot agree by
   construction. **A match that needed the `O`→`0` repair DOWNGRADES**, because a
   document that needed it has demonstrated the defect. 4.1 s/page LOCAL_CONTENDED.
3. **DONE — one contract, five questions.** `0072`: `judgment_quality_contract`.
   text · recovery · date · role/citability · provenance, one row per judgment.
   `docs/ops/new2/QUALITY_CONTRACT.md`. **No CLEAN text state and there never will
   be** — nothing in this corpus looks for evidence an extraction was faithful.
   **`citability` never says citable**: `decided` maps to `CITABILITY_UNKNOWN`
   because it is 30% procedural [13.6, 46.4]. Only refusals are asserted.
4. **DONE — `operative_act_withdrawn` finished.** 155,680 re-assessed:
   `decided` 81,459 · **`procedural_disposal` 60,996 (39.2%)** · `decided_brief`
   13,225. The other eight operative-act reasons stay unwired at 50-86%.
5. **DONE — date states are published for the 699,398 documents consumers reach.**
   Nothing rewrites `judgment_date`. `judgment_date_quality`, and an absent row
   means NEVER LOOKED while `DATE_UNKNOWN` means looked and found no witness.
6. **DONE, and it is a defect I shipped and then caught — `date-quality.ts` was
   convicting the Supreme Court of a defect it does not have.** The reader parsed
   numeric dates only. **The Supreme Court prints `MARCH 8, 2007` in the cause
   title and never prints the date numerically**, so `printed.size > 0` and
   `printed.has(jd)` was false — the exact branch that returns `DATE_SUSPECT`.
   **43.0% of cited SC authorities read `DATE_SUSPECT`; on a 60-row sample 51 of
   them print the stored date as a month-name date. ~85% false.**
   That inverted this module's own governing rule, which was right: *a document
   that prints no date at all is silent, not contradicting*. A date printed in a
   format the reader cannot parse is silence to that reader; the reader was
   convicting on its own blind spot. `date-quality-v1.1` reads month-name dates,
   six tests, and the whole population is being re-checked. On a 20,000-row prefix
   the correction was **69.47/23.96/6.57 → 85.94/9.45/4.61**; the completed run
   over 713,136 documents lands at **86.90 VERIFIED / 8.41 UNKNOWN / 4.68
   SUSPECT**, and cited Supreme Court authorities at **11.5% SUSPECT against
   43.0%**. `DATE_DISAGREE_RATE = 0.0445` is unaffected — it measures the
   FILENAME witness, which the defect never touched.
7. **NOT DONE — the damage export's last 5.4%.** Deliberately not resumed: the
   resource gate read `DEFER CPU_HEAVY, commit free 2.7%` with the GPU sidecar,
   two classifiers, LCC's screen and two of my passes already on the box. A
   document in that 5.4% that is a glyph dump reads `TEXT_UNKNOWN` today.
8. **NOT DONE, founder-blocked — eCourts.** FQ-ECOURTS-ACTOR, unchanged: there is
   no real founder account to name in `audit_log.actor_user_id`, and one will not
   be fabricated. Nothing else blocks the canary.
9. **NOT DONE — `retrieve.ts` does not refuse damaged text and it is LCC's file.**
   The query-time defence down-ranks by `judgment_chunks.text_quality`, which is
   inverted on this population: **22 of the 24 chunks whose judgment is proven
   damaged sit at or above 0.85 and take no penalty at all.** Exposure is 24
   chunks and is small only because NEW1's quarantine ran, not because anything
   structural refuses. Measured, sent to LCC (bus 1004) and NEW1 (bus 1005), not
   edited.

**Verified through the real production path, not inferred:** a proven-damaged
document is still discoverable by case number. `answerStructured()` imported and
run read-only against three PROOF-grade damaged documents — **3 of 3 returned**.
`body_text_safe` and `metadata_discoverable` are separate booleans for exactly
this reason: a glyph-dump body must not make a judgment vanish from citation and
party-name search.

### 22 Aug 2026 — LCC: THE SEARCH API WAS UNBOUNDED, `act:BNS` MATCHED NOTHING, AND THE OD-14 SPLIT WAS WIRED INTO ONE CALLER

Every number below was measured through the REAL API (`POST /search`,
`GET /judgments/:id`) against the 18,698,968-row local corpus. All work LOCAL
per the founder's local-first rule; every latency is **LOCAL_CONTENDED** — the
ingest fleet, the GPU embed server, the classifier and an autovacuum on
`judgments` were live throughout — and none of it predicts mobile production
latency.

**1. One search could run forever and take the API down with it.** The postgres
pool set no `statement_timeout`. `section 302 IPC` was still executing at 60s;
ten such requests exhaust `max: 10` and every route stops answering, not just
search. Now bounded on the connection (`PG_STATEMENT_TIMEOUT_MS`, default 15s)
plus `idle_in_transaction_session_timeout`. A ranker that spends its budget
returns empty and says so on the wire as `degraded: ["sparse_timeout"]` rather
than silently returning less — a recall loss leaves no trace unless the server
leaves one. The two arms now run CONCURRENTLY, so a request's ceiling is the
MAX of the arm budgets and not their sum.

**Caveat, measured:** cancellation is not instant. A 20s `statement_timeout` on
the pathological GIN scan was observed returning at 39s, because the check
happens at interrupt points inside a bitmap build. The bound is real but soft.

**2. Exact routes were paying for semantic search, and now decide whether it
runs.** The exact/section lookup used to run AFTER both rankers, then pin its
answer on top. It now runs FIRST and, when it hits, the sparse arm is skipped —
justified by measurement, not taste: the sparse AND pass was cancelled at budget
for BOTH `1995 INSC 227` and `section 302 IPC`, so it was contributing nothing
while costing the whole request.

```
                        before                 after
1995 INSC 227           14,406 ms              206-630 ms
section 302 IPC         >60,000 ms unbounded     4,701 ms
section 103 BNS         36,078 ms                6,261 ms
case name (p50/p95)     17,113 / 28,201 ms       990-4,507 ms, 0 degraded
```

**3. `act:BNS` matched none of the 20,440 BNS references, and nothing errored.**
`canonicalAct('BNS')` returned the string `BNS` while extraction had written
`act_key = 'BHARATIYA NYAYA SANHITA'`. Two halves of `sections.ts` disagreed:
`ABBREVIATIONS` had the three 2023 codes and `ACT_SYNONYMS` never got them. **No
mapping was invented** — the abbreviation-to-title pairs were already in the
file. A test now asserts the invariant BETWEEN the two tables, so a fourth
abbreviation added to one and forgotten in the other fails in CI.

Matching is on the ENDING BIGRAM, chosen by checking every distinct `act_key` in
the corpus: the three rules claim 21,167 / 129,073 / 496 references, **overlap on
exactly zero keys**, and refuse `MADHYA PRADESH RAJYA SURAKSHA ADHINIYAM`,
`CHHATTISGARH PANCHAYAT RAJ ADHINIYAM` and `NAGAR TATHA GRAM NIVESH ADHINIYAM`.
5,723 stored keys were re-derived (BNSS 121,502→129,295, BNS 20,440→21,175,
BSA 444→496). **BSA was never zero** — an earlier claim of mine that was an
artefact of my own output truncation, corrected on the record.

**4. Section queries are an index lookup, not a full-text search.**
`judgment_statute_refs` is 862,594 rows with a btree on
`(act_key, section_number)`. `judgments` is joined ONLY when a filter needs it —
with the join unconditional, NI s.138 cost 8,050 ms against 943 ms without.
**Coverage is 2.28%** (426,473 of 18,698,968 judgments carry any statute
reference, because a reference is recorded only where the court named the act),
so the pins take at most half the page and the ranked pipeline keeps the rest.

**5. Case-name search had no index route at all.** `exactCaseTitle` needs a
byte-exact normalised title, which almost never fires. The trigram index
`judgments_case_title_trgm` existed and was unused. Now: narrow by the RAREST
word (measured from `lexeme_document_frequency`, not the longest — length as a
proxy for rarity is a mistake this repo already measured and rejected, and
repeating it cost 3 of 7 lookups), then rank by `word_similarity`, all under a
2.5s budget of its own. A `LIMIT` on the candidate pool was tried and REMOVED:
it let the cap choose candidates in physical order and lost the right judgment.
When the word is not rare enough the probe exceeds its budget and the query
falls through unchanged.

**6. OD-14's three-layer split was wired into exactly one caller.**
`precedential-effect.ts` reached add-to-matter and nothing else, so the READING
VIEW and SEARCH rendered the coerced label OD-14 was about: `P. KANNADASAN`
(1996 INSC 800) returned `set_aside` for what its own verified edge calls
`overruled`. Now derived on `GET /judgments/:id`, on hybrid search results and
on the structured (`cite:`) path — one batched, indexed edge read per page,
never one per result. **The banner is unchanged in every case**; `precedentialEffect`,
`canAddToMatter` and `overruledStatusStored` are additive.

**7. The whole unapplied-treatment backlog is 2 judgments, and both are correctly
refused.** `BHARATI VIDYAPEETH` (2004 INSC 140) and `SOCIETY FOR UN-AIDED
P. SCHOOL OF RAJASTHAN` carry verified `overruled_in_part` edges while stored
`none`. `propagate-treatment.ts` skips both DELIBERATELY: `partly_set_aside`
needs the affected paragraphs, none could be read near the citation, and naming
the wrong paragraph tells an advocate a live passage is dead. `precedentialEffect`
was NOT changed to flip them — `ADMIN_SURFACE.md` §15 requires one writer. A new
`unappliedTreatment()` REPORTS the fact instead, writing nothing and changing no
banner. **What an advocate should see in that state is a founder question**, in
`FOUNDER_QUEUE.md`.

**8. `cite:1995 INSC 227` returned 0 results, HTTP 200, for a judgment we hold.**
A field value is one token, so it searched reporter `1995` plus loose words
`INSC` and `227`. `cite:` now absorbs following bare words, but ONLY when
`extractCitations` agrees the result is a citation — this file gets no second
opinion about citation formats. `cite:1995 murder` absorbs nothing.

**9. `overruled_status` had no index.** Counting non-`none` rows was cancelled at
45,708 ms; with migration `0073`'s partial index it returns in **247 ms**. That
query is what the nightly overruled re-check (`ADMIN_SURFACE.md` §15a, 22:30
IST, before briefings are generated) has to run every night, and a metric whose
query cannot finish is a metric nobody reads. Exactly **98** judgments qualify —
73 `set_aside`, 17 `doubted`, 8 `partly_set_aside`, no others; an earlier count
of "101 plus 3 others" was mine, came from a join against `judgment_citations`
that counted three `none` rows, and is corrected in the file.

**A plain build blocked four fleet writers within 130 seconds** and was
cancelled — my error, caught by watching `pg_stat_activity` rather than by the
build failing. The live index was rebuilt `CONCURRENTLY` (1,289 s, non-blocking)
and the migration file records the whole episode, so the next person to index
this table does not repeat it.

**Still open, honestly:** case-name lookup falls through on non-rare party names
(`PRAKASH` needed 14,955 ms); the dense arm is now the latency floor on
concept queries and is NEW1's lane; and 3 synthetic `Test Court` rows I created
by stopping a test mid-run are still in `judgments` — the DELETE was refused by
the sandbox classifier and is listed for the founder rather than left silent.

### 22 Aug 2026 — NEW1: SEMANTIC SEARCH IS SUPREME COURT ONLY, AND A BARE CITATION WAS 3,000x SLOWER THAN THE SAME CITATION WITH `cite:`

Owner NEW1. Everything below is measured; the two things that are not yet
measured say so.

**1. THE LAUNCH FINDING — production cannot see the corpus it has embedded.**
The dense arm searches `judgment_chunks`. Exact counts, 22 Aug:

```
judgment_chunks, distinct judgments        40,161
  Supreme Court                            38,341
  High Court and other                      1,820
new1_doc_vector_stage                     675,711   production CANNOT see it
```

Against `LAUNCH_BENCHMARK_V1`'s 1,029 gold authorities — High-Court heavy —
**5 have a chunk.** Per class: citation 0/229, case_title 0/229, fact_passage
2/372, nl_doctrine 3/199. The same authorities are in NEW1's Tier-A stage at
86.5–98.5%. `citation` and `case_title` are unaffected because the exact route
needs no vector; `nl_doctrine` and `fact_passage` have no fallback and are the
two classes the premium research workflow is sold on. **This is a coverage gap,
not a ranking gap, and no ranker change can touch it.** Independently confirmed
by the reality audit ("Dense covers SC ONLY") and by NEW3 hands-on (concept
search 75.8 s, loose hits).

**2. A bare citation was not reaching the exact path.** `looksStructured()` needs
a field name, an operator or a quote, so `2023:AHC:170543` was prose to it and
fell through to `hybridSearch`, which pinned the right answer at rank 1 after
paying for it:

```
exactCitation, neutral_citation branch       0.322 ms   read=2
exactCitation, reporter_citations branch    17.316 ms   read=291
AND-first sparse arm, the SAME citation  12,158.442 ms   read=150,912
cite:"2023:AHC:170543" end to end            4 - 352 ms
```

**The safety half outranks the speed half:** `2025:AHC:32900` resolves to two
judgments, and the hybrid path returned an ordinary ranked list with nothing
saying the citation is not unique, because `exactCitation` correctly declines to
pin when it finds two. It now returns `ambiguous`, which `CITATION_HARNESS.md`
§A3d.4 requires. Fixed in `structured.ts` as a canonicalising rewrite to
`cite:"..."` so both spellings produce the identical AST; 63/63 tests. Commit
`880f206`.

**3. The sparse arm is disk-bound on an uncacheable index.** ~160,000 blocks
(~1.25 GB) read on EVERY sparse query regardless of shape, because
`judgments_full_text_idx` is **16 GB** against **2 GB** of `shared_buffers`.
A 134-char title measured 54.6 s, a 61-char concept query 53.0 s. LOCAL_CONTENDED,
and also a sizing input for the eventual serving layer. **No index or schema
change proposed unilaterally** — three candidates were sent to LCC (bus 1006)
with none started.

**4. `LAUNCH_BENCHMARK_V1` is frozen.** 1,029 rows, `frozenHash
ba9357cba2fbf297`, consolidated from NEW3's four verified gold files by
`services/harness/src/launch-gold.ts`. citation 229 · case_title 229 ·
fact_passage 372 · nl_doctrine 199. **229 verbatim-passage rows excluded on
CONSTRUCTION** — they are the target's own words, which `gold-contract.ts`
already names an upper bound, and 97.8% of them also exceed the product's own
500-char input cap. Four more excluded for the cap alone, named rather than
dropped. The hash covers only the ordered query tuples, so a corpus change keeps
the benchmark and a gold change loudly replaces it.

**5. The P2 failure cascade, and a defect NEW2 caught before it shipped.** Every
failure gets one reason, first rule wins, ordered from "nobody could have found
this" to "we had everything and got it wrong" so the reason names the lane that
owns the fix. My first cut fired `TEXT_UNSAFE` for damaged authorities whatever
the query was; NEW2's bus 1005 pointed out that `body_text_safe` and
`metadata_discoverable` are separate booleans. It would have sent NEW2 to OCR
documents whose identity fields were never damaged. Fixed, commit `314b22c`.

**6. P0 restored.** LCC's migration `0070` moved the eligibility view hash and
the walk's guard stopped it — correctly. Thirty keeper relaunches had failed
identically for four hours. Reconciled against `pg_get_viewdef` rather than
against the bus message announcing it: 0070 adds one column the walk does not
read, and `REFUSED_CLASSES` stands unchanged. Pin `2e7b53afe35fa81c`, commit
`1789014`.

**Handed to the product lane:** `docs/ai/new1-tier-a/SEARCH_CONTRACT_FOR_PRODUCT.md`
(bus 1010/1011) — a behavioural annex, not a second contract. Its sharpest point
is that **an empty result and a degraded result are different and today look
identical**: concept search exceeds the mobile client's own 15 s timeout, and
"Lawmind has no law on this" is false.

**RUNNING, not finished:** whether the document vectors would actually ANSWER
the queries production cannot — measured against `new1_probe_half_250k`, the one
staged table with an HNSW index. Every number it produces will be an upper bound
(257k distractors against 8.85M, value-ordered membership, dense arm alone), and
it is decisive in one direction only. **STILL DEFERRED BY THE GATE:** the full
1,029-row benchmark run and the quarantine sweep of the 2,530 staged vectors
NEW2's new verdicts have convicted.

### 21 Aug 2026 (night) — NEW2: THE CORPUS IS 8.65% UNREADABLE, `decided` IS 30% PROCEDURAL, AND OCR RECOVERS WHAT NO RE-EXTRACTION CAN

Five findings, each measured, each with the artefact that proves it. Owner NEW2;
nothing here changes another lane's contract, and two of the five are defects in
NEW2's own work.

**1. `TEXT_UNSAFE_VERIFIED` — 8.65% of the corpus is provably not text.**
`services/ingest/src/text-damage.ts`, and a corpus-wide export walking now at
`docs/ops/migration/new2-text-damage.jsonl`. On 2,000 uniform draws: 173 VERIFIED,
45 SUSPECT, 1,782 UNKNOWN. Punjab & Haryana 57.2%, Karnataka 56.4%. **149 of the
168 scored damaged rows sit at or above the 0.85 `text_quality` floor**, median
1.000 — the metric is inverted on this population, not weak. There is no CLEAN
state and there never will be: nothing in the module looks for evidence that an
extraction was faithful.

**2. OCR recovers it and a second extractor does not.** 40 PDFs, page 1, CPU only.
MuPDF on the same bytes reproduces the glyph dump (median control density 0.7014);
OCR recovers 20 of 20 at 3.7 s a page, verified against metadata the text never
touched (20/20 case numbers, 18/18 dates). **6 of 20 render the year with a letter
O for zero and all six are Karnataka** — so recovered text is safe for prose and
unsafe for digits. `docs/ops/new2/TEXT_RECOVERY_POLICY.md`.
**`TEXT_UNRECOVERABLE` must not be applied to this population.**

**3. `judgment_date` is contradicted by the primary document on 4.45% of rows.**
Two mechanisms: a same-direction off-by-one concentrated in four courts, and
`judgment_date` tracking a case's FILING year. The document backs the filename
date 33 times out of 34. **The corpus rate stands; the attribution of NEW3's 22
impossible gold edges to it does NOT** -- NEW3 ran `dateQuality()` against both
endpoints of all 22 (bus 0979) and it explains ONE. Ten of the rest are
`DATE_VERIFIED` on both ends, which is positive evidence against the date being
their mechanism. Two numbers of the same magnitude were not a mechanism, and the
corrected reasoning is recorded in `date-quality.ts` rather than deleted.
**Nothing is corrected** — `date-quality.ts` assigns a state and publishes
evidence. The partition-year check agrees 3,000/3,000 and therefore proves
nothing.

**4. `decided` is 30% procedural [13.6, 46.4], and `decided_brief` is 60%.**
90 rows of a 270-row stratified frame, labelled from primary documents:
`docs/ops/new2/DOCUMENT_ROLE_GOLD_V2.md`. The mechanism is
`isMerits(disposal_nature) -> decided`, which is exactly the arrow from
DISPOSITION to CITABILITY that NEW2's own `DOCUMENT_QUALITY_VOCABULARY.md`
forbids. ~171,000 documents inside NEW1's Tier A manifest are transfers,
withdrawals and registry defaults. **Not fixed** — a fix reads the text for the
operative act and needs its own precision measured. That is the next NEW2 task.

**5. `VERIFIED_CORE_V1` is 27.5% non-substantive [13.7, 41.3].** Independent audit
of 40 of the 125, LCC's labels unopened until the verdicts were on disk:
`docs/ops/new2/VERIFIED_CORE_V1_INDEPENDENT_AUDIT.md`. Not a refutation of the
role verifier — a finding about what the NAME promises. Nine of the eleven are
shapes `hc_document_class` already names.

**Fixed on the way through:** the bail phrase did not survive a PDF line break
(11,024 documents reclassified, measured before and after); and the classifier
died twice on `statement_timeout` because every restart re-scanned 4.1M
already-classified rows — now a persisted cursor plus a transient-error retry on
both the read and the write, with an end-of-run sweep from zero that shouts if the
watermark was ever unsafe.

**6. `isMerits -> decided` is now partly fixed, and only partly on purpose.**
`operative-act.ts` reads the court's operative sentence instead of the registry's
disposal string. Pooled, it measured **~68% precision out of sample** against
100% on the gold it was written from -- so the pooled rule is committed UNWIRED
with its bar in the module. Measured PER REASON, exactly one cleared 95%:

```
WITHDRAWN                        68 of 68 judgeable      precision >= 95.6%
ADJOURNED / WANT_OF_PROSECUTION              ~86%
INFRUCTUOUS ~83% · NO_OPINION_EXPRESSED ~80% · TRANSFERRED 60%
DIRECTION_TO_CONSIDER / NOT_PRESSED / REGISTRY_DEFAULT    50%
```

`operative_act_withdrawn` is live and **147,127 rows are being re-assessed**;
expect ~74,000 to become `procedural_disposal`. `axis_c_role` refuses that class
and NEW1's walk re-reads `hc_document_class` per batch, so neither lane needs a
change. **It does NOT close the 30% gap** -- withdrawals are one of nine kinds.

**Still owed by NEW2, in order:** the remaining eight kinds, which need the FINAL
operative sentence rather than a longer phrase list; the remaining 180 rows of
the gold frame; the damage export's last 5.4%; and eCourts, blocked on
FQ-ECOURTS-ACTOR and on nothing else.

**STOPPED after three attempts, recorded rather than hidden:** LCC's 0976 question
-- of same-CNR pairs one day apart, do the filename dates agree -- beat three
query designs (a global GROUP BY that starved the classifier, id-range slices that
found zero pairs because uuid v4 scatters CNR siblings, and a CNR-index walk that
did not finish its budget). It becomes seconds of work the moment LCC's identity
module writes the pair list, because the expensive half is finding the pairs.

### 21 Aug 2026 (evening) — LCC: OD-14 CLOSED, THE CONTRACT GOT ITS MISSING WRITER, AND VERIFIED_SEMANTIC_CORE STOPPED BEING ZERO

Six pieces landed. Every number below was measured, and the ones that are still
unmeasured say so.

**OD-14 is resolved on the founder's direction, and the finding underneath it is
worse than the finding.** 73 judgments read `set_aside` for what their own
verified edge calls `overruled`; not one row disagrees with its edge, so the
evidence was never wrong — `overruled_status` had four values and no way to say
"overruled". `precedential-effect.ts` splits the three layers permanently
(verified edge → derived effect → product policy), the add-to-matter refusal
moved onto the effect, and **73 refusals disappeared**. After the change **zero**
judgments in the corpus derive a genuine `set_aside`: the one refusal in the
product had fired 73 times and never once for the case it was written for. No
warning weakened, no fifth wire value, nothing stored. Still owed and RCC's: the
banner for an overruling still reads as a setting aside.

**The eligibility contract had the rule and was missing the writer.**
`axis_b_text` has been an allow-list since 0056, so a stored damage verdict has
always been refused — but 99.7% of the corpus had no verdict at all, and NEW2's
screen counts the larger damage mode in a variable called
`zeroDevanagariBelowThreshold` without writing it. `text-safety-screen-cli.ts`
writes it, importing NEW2's `quality-state.ts` rather than copying the floor.
Staged pass: **701,805 rows, 62,215 damage verdicts, 8.86%** — Punjab and Haryana
56.52%, Karnataka 48.57%, a third method within a point of NEW1 and NEW2.
Corpus-wide pass still running. **UNKNOWN stays admitted**: a text screen can
prove damage and can never prove health.

**`VERIFIED_SEMANTIC_CORE` was 0 and is 1,344 rows / 125 documents.**
`semantic-role.ts` adjudicates a span's ROLE from the document's own voice
changes with no model involved. Its first cut refused 127 of 180 holdings as
party submissions; five were read and all five were genuine court
determinations, so markers gained a 600-character reach and `ROLE_MISMATCH`
nearly halved while `ROLE_UNPROVEN` doubled — the correct direction. 24 accepts
read, 22 correct; 6 core documents read, 6 correct. One adjudicator, who wrote
the verifier, and NEW2's held-out method is asked for rather than assumed.

**`CITED_AUTHORITY_REACHABLE`.** Every gold authority the contract still refused
was audited one by one: **12 of 16 refused by the 2,000-character floor alone,
and a judge had cited every one.** The floor did not move — a short order nobody
cited is exactly as unreachable as it was. Being cited is now admissible
evidence and outranks both the length heuristic and our own
`hc_document_class`, which was measured at 15.6% precision for `decided_brief`.
**7,935 documents, 0.04% of the corpus**, measured before the migration was
written.

**eCourts derivation exists before the first observation does.**
`ecourts-derivation.ts` has no `HEARING_OCCURRED` and a test asserts no input can
produce one — cases are listed and passed over. A changed next date is two facts
and both are kept. An `order_ref` is a candidate, never a document. Pure, so all
11 tests ran with zero live observations, which is what there are.

**Decision identity, as candidates.** `decision-identity.ts` after Chipade.
`CNR_EXACT` and `CITATION_EXACT` are promotable because neither can produce a
false positive; `REGISTRY_STRONG` and `CAPTION_WEAK` are not, and `CAPTION_WEAK`
is the common-order shape that must never be collapsed. No stemming, no token
overlap, no edit distance, no merge.

**Migrations:** `0067` text_safety · `0068` cited_authority matview · `0069`
CITED_AUTHORITY_REACHABLE. Deployed view hash moved
`5efa4c8d…` → `b64e1aa4…` → and again with 0069. `0067` failed once for a real
reason worth keeping: **`CREATE OR REPLACE VIEW` matches columns by POSITION**,
so a new column must be appended or it renames every column after it.

**Two things found while working, neither of them mine:**

- `eligibility-null-safety.test.ts` has been RED since `0066` reintroduced the
  bare `hc_document_class = 'bail_order'` inside the `semantic_tier` CASE. Fixed
  in `0069`.
- The deployed view hash **cannot see** a population change: the view text was
  unchanged while 62,215 documents became ineligible. NEW1's manifest identity is
  hash-based and was told so directly.

**FQ-ECOURTS-ACTOR no longer asks for a uuid.** `users` has no role column at
all, all 55 rows are `subscription_tier = 'none'` / `enrolment_status =
'unverified'`, and 54 of them appear in `audit_log` in six-action 30-second
bursts — test fixtures. There is no founder account to find. `--actor-email`
resolves an address to exactly one `users.id` and refuses on zero or on more than
one, so the audit row still names a real person and the founder does not need a
database session.

**NEW1's durable-keeper item was never elevation-blocked.**
`IsInRole(Administrator)` is False and `schtasks /Create` for the current user
returns SUCCESS. A probe task's process traces `PING.EXE → cmd.exe →
svchost.exe`, so the chain does not pass through an agent shell.
`scripts/durable-job.ps1`, handed to NEW1 rather than run for them.


### 21 Aug 2026 — NEW1: A 670,000-DOCUMENT HOLE, A 13.2% RECALL CEILING, AND RERANKING IS STILL NOT THE ANSWER

**Added by NEW1 (retrieval lane).** Every figure below was read from the live
database or from an artefact this session wrote; none is inferred from a command
exiting 0. Detail: `docs/ai/NEW1_TIER_A_PURITY_AND_COVERAGE.md`,
`docs/ai/NEW1_EXPANSION_BENCHMARK_250K.md`,
`docs/ai/new1-halfvec/VERDICT_250K.md`,
`docs/ai/new1-rerank/LEAKAGE_SAFE_BASELINE.md`.

**The Tier-A walk had reached batch 88 and 67 batches inside that range held
zero vectors.** `stage-embed.log` carried 100 `STAGE START` lines, 29
`STAGE DONE` and 69 `FAILED`; 23 of 888 batch files actually held anything. The
missing 10..76 are the batches a dead GPU sidecar consumed in sixty seconds on
20 Aug, each printing START and END while embedding nothing. The exit-status
cause was fixed that day; the HOLE was not, because the walk was a RANGE and a
range never goes back. 220,259 staged rows read healthy throughout.
`stage-coverage-census.mjs` now asks per batch file how many of the ids it names
are accounted for, and `stage-runner.sh` walks that worklist instead of a range.

**Both the walk and its keeper died with the session and nothing said so.** Both
were started with `nohup` from inside a session shell; both were gone two hours
later and the GPU sat at 0% for three hours and twenty minutes. Git Bash `nohup`
does not detach from the Windows job object. Long runs are now started with
PowerShell `Start-Process`, and `sidecar-keeper.mjs` watches the walk on SILENCE
as well as the sidecar on health — twenty minutes without a log line means hung
or dead, and both want the same treatment.

**21 Aug, after LCC acted (migration `0066`): bail orders GO IN, and my own
walk then spent an afternoon still discarding them.** The skip list in
`doc-vector-embed.mjs` was a copy of a predicate that had moved, and nothing
looked wrong at runtime — the ineligible rate held steady at 15-16% and I
reported that steadiness to NEW2 as good news. The deployed view hash caught it
(`e76879ab6bbcd452` → `5efa4c8decef699e`); the stage now asserts that hash on
every batch and throws on a mismatch. 29,349 quarantined bail-order vectors were
restored at no GPU cost, which is exactly what quarantining rather than deleting
was for. The remaining ceiling on the same gold is **8.4%**, almost all of it the
2,000-character floor, which LCC has recorded as an accepted loss.

**13.2% of the authorities judges actually cite are refused by the eligibility
contract.** All 250 of NEW3's citation-verified gold authorities are ones a real
High Court judge really cited; 33 of them fail
`judgment_embedding_eligibility` — 18 for being under 2,000 characters, 12 for
being `bail_order`, 2 `procedural_disposal`, 1 on text quality. **That is a
ceiling, not a backlog**: embedding the whole 8,846,550-row manifest at perfect
quality leaves those 33 unreachable. `eligibility.ts` says bail orders are "a
retrieval measurement nobody has made yet" — this is that measurement, and it
replicated at 11.5% on NEW3's independently built uncited-authority set. The
decision belongs to LCC; what changed is that it now has a number.

**`decided_brief` was never in Tier A.** All 205,731 of its rows sit in bands
`brief` and `stub`, and Tier A takes only `standard`/`full`/`substantial` —
confirmed independently by 0 occurrences in a 409,647-row sample of the manifest
files. NEW2's "60.9% over 864,685 rows" figure is `decided` at **75.0% over
570,452**, and axis C is already the negative selector NEW2 asked for.

**The manifest goes stale over its own consumption window.** It froze eligibility
on 19 Aug and is consumed over eleven days. 1.9% of it corpus-wide, and 16% of
batch 10, now carries a class the contract refuses — because the manifest and
NEW2's classifier walk the same primary-key order and the classifier is ~1-2%
into the id space. `doc-vector-embed.mjs` re-reads `hc_document_class` in the
query it already runs for text and skips the four refused classes before the GPU
sees them. 34,370 already-embedded refused rows were **moved, not deleted**, to
`new1_doc_vector_stage_refused` — which the 13.2% finding then vindicated.

**Halfvec: `HALFVEC_QUALITY_PASS_AT_TEST_SCALE`, n=256,998, and deliberately not
production-ready.** The previous verdict was taken at `ef_search=40`; production
runs 200 and that is what both arms run here. Paired sign test over 684 shared
queries finds **no difference on any query type** (p = 0.267 / 0.688 / 0.804,
with 94-97% of queries returning the gold at exactly the same rank). Index 669 MB
against 2006 MB — 3.0x, the same ratio measured at 620,300 chunks — and latency
p50 14 ms against 41 ms. The stage table stays `vector(1024)` for the walk: fp32
casts down to halfvec and halfvec cannot cast back up.

**Reranking, rebuilt so it cannot lie, is worth three queries out of seventy.**
Every feature is checked against a new leakage contract per row and a prohibited
one THROWS, so `inbound_citation_graph` — the feature behind the +21.5-point
illusion — cannot return quietly. Best leakage-safe held gain is +4.3 points of
success@5 on 70 queries against a train delta of 7.6. Two things are not small:
**`sparseOnly` beats `denseOnly`** on the pool dense itself selected (s@5 27.1%
against 22.9%, r@20 34.3% against 27.1%) while losing on MRR, which is
complementarity and argues for fusion rather than a reranker; and **depth buys
presence, not position, for the third independent time** — pool 50 to 200 lifts
gold presence 31.4% to 38.6% and leaves success@5 at 22.86% throughout.

**Currentness safety: PASS.** No NEW1 table holds a cached treatment or
currentness column — checked against `information_schema`, so a column added next
month by someone who never read the rule still fails it. Every NEW1 vector table
carries `judgment_id` so status is read live at the point of use.

**Statute transition: 11/11 on NEW3's gold**, including both memory traps. IPC 420
and CrPC 154 return `held: false` with UNMAPPED wording rather than a remembered
mapping.

**Two corrections this lane owes.** First: production ALREADY has the exact
routes. `retrieve.ts` pins an exact citation lookup and an exact case-title
lookup ahead of the ranked list in every mode; the 0.9% success@5 for citation
queries is a true statement about a vector index and a false one about the
product. Timed live: a citation query is 0.7 s, a case name 3.8 s, a concept
question 3.5 s. Second: the "a clean issue statement beats a citing passage"
inference from `NEW1_CROSSLINGUAL.md` does NOT reproduce — all three query-shape
arms tie at 40% success@5.

**One finding handed on rather than solved.** The production sparse arm did not
finish a 900-character passage query in **32 minutes**, on a loaded box. Short
queries are fine. It is a query SHAPE the rarest-term rule in migration 0055 was
never measured against, and it needs its own bounded experiment with EXPLAIN.


### 21 Aug 2026 — LCC: SIX MIGRATIONS, AND FIVE NUMBERS OTHER LANES WERE USING WERE WRONG

**Added by LCC (server lane).** Every state below was read back from the live
database, never inferred from a command exiting 0.

**P11 · ECOURTS_OBSERVATION_PIPELINE_READY** — migration `0061`, commit
`abaf0e6`. NEW2 had been holding live eCourts traffic since bus 0839 because no
observation schema existed. `ecourts_observation` has **no foreign key to
`judgments`, not even a nullable one** — registry bookkeeping must not enter the
authority population, and a nullable link is an invitation to backfill it.
Append-only by trigger; there is **no `hearing_occurred` observation kind and
there must never be one**, because eCourts publishes listings and never
attendance. Four guards proved by execution in one rolled-back transaction:
UPDATE refused, DELETE refused, `hearing_occurred` refused, ungranted data type
refused, table left at 0.

**P1 · COVERAGE_TRUTH_V2** — migration `0062`, commit `c7e55a5`. Of 257 cells
carrying a shortfall, **179 are entirely `permanentAbsent` + `retryable`** —
Bombay 2006 is short 6,276 with 6,275 permanently absent, and 2007 is short 6,706
with exactly 6,706. They rendered `PARTIAL`, "we are missing law", about
documents the court never published. And **Allahabad's 50.03% / 50.29% is a
2.00x row-to-document ratio, not a coverage figure** — 88.6% of all unexplained
shortfall is that one court. The genuinely unattributed gap is **153,204 rows
over 115 cells, not 1,579,075 over 257**: a 10.3x overstatement. `source_state`
was NOT renamed (NEW1's contract reads it); `shortfall_reason` is a second
orthogonal axis.

**P0 · TREATMENT_MANIFEST_RECONCILED** — commit `d49fea0`. Population is **27
unlinked, not 33**. Treatment and currentness are already separate and the
collapse the directive warned about is measured and ABSENT — zero judgments are
non-current on a `distinguished` edge alone. The real defect is vocabulary:
**73 of 98 carry `set_aside` for an act that is `overruled`**, which disables
add-to-matter. Raised as **OD-14** and deliberately not resolved.

**P2/P4 · migrations `0063` and `0064`**, commit `093e164`. `semantic_tier` reads
back over the whole corpus: BROAD_SEARCHABLE 9,934,916 · NOT_ELIGIBLE 8,696,250 ·
UNRESOLVED_EXPERIMENTAL 67,802 · **VERIFIED_SEMANTIC_CORE 0** — two lanes reached
that zero independently. The trust ladder MODEL_PROPOSED -> SPAN_VERIFIED ->
SEMANTIC_ROLE_VERIFIED -> CANONICAL_TRUSTED is live; 30,007 rows sit at span, and
**nothing has ever reached role verification.**

**P5 · the ladder is HALTED at 1k** — `docs/ai/MODEL_CLASSIFICATION_1K_AUDIT.md`.
Not on accuracy: **the model agrees with itself only 81.0%** [76.2, 85.0] on the
same document, and the flips are symmetric across the `decided`/`procedural`
boundary that decides Tier A. Accuracy against NEW2's held-out key — written
before any model ran — is **87.9%** [72.7, 95.2] on 33 scorable documents, with a
15% false-substantive rate in the costly direction.

**P8 · migration `0065`**, commit `8e3e1d2`. All 226 statute mappings are BPR&D
comparison tables: **`OFFICIAL_CORRESPONDENCE`, none `ENACTED_STATUTE`**. Coverage
is **bns 4/358**, bnss 24/531, bsa 101/170, so absence is the normal case and now
reads UNMAPPED rather than anything resembling "no counterpart exists".

**Migration `0066`**, commit `c6a3150` — **bail orders become reachable.** NEW1
measured that 13.2% of the authorities judges actually cite are refused before the
GPU sees them, bail being 4.8%. "Not precedent" is a claim about weight, not
retrievability. Priced at 489,444 rows, +5.5% of the manifest. The 2,000-char
floor deliberately does NOT move despite refusing a larger 7.2%.

**Corrections I made in the open:** `decided_brief` costs ZERO rows, not "about
one percent" — NEW2 caught it and the error was mine. My 16.9% "fabrication" is
materially a **corpus-damage** figure; 59.2% of it is documents whose text is not
language.

**Still open:** OD-14. FQ-ECOURTS-ACTOR, which now blocks FIVE premium surfaces
rather than one. `assessTransition` is correct, tested 19/19 and reachable from
nothing in production. P14 wall-clock timings deferred — the box carried three
other lanes all session.

### 20 Aug 2026 — LCC: P. KANNADASAN IS NO LONGER GOOD LAW, `statute_mappings` HAS ROWS, AND COVERAGE HAS TWO AXES

**Added by LCC (server lane).** Six things landed; each one is a founder-roadmap
item and each is verified by reading the result back, not by trusting a run.

**P0 · TREATMENT_HELD_UNALIASED_CLOSED** — commit `0da8e62`.
`services/ingest/src/treatment-link.ts` links an adverse citation edge to a
judgment we already hold using ONLY the equivalence the Supreme Court printed in
the citing judgment's own Case Law list (`[1996] Supp. 4 SCR 92 : (1996) 5 SCC
670`). 8 of 35 edges linked; `overruled --confirm` then moved six authorities to
`set_aside`, including **P. Kannadasan**, which had been rendering as live good
law since 13 Aug against a zero threshold. Two of NEW3's §1d UNIDENTIFIED rows
identified themselves from their own citing judgments. Four guards, each refusing
alone. Three false refusals were found by RUNNING it and are now fixtures: a PDF
line wrap read the printed name as `Nadu`; the bench line before a Case Law list
dropped *Synthetics and Chemicals* to Jaccard 0.18 (hence containment, not
Jaccard); a flat two-token floor refused *V. Revathi* at Jaccard 1.00.
**Still refused, correctly:** M.K. Kunhimohammed — its citing judgment prints no
pairing, so there is no printed evidence to act on.

**P1 · TIER_A_MANIFEST_COMPLETE** — 886 batches, **8,846,550** representatives
covering **9,691,284** case identities, recounted from the 886 `.meta.json` files
rather than read off the summary. The 7,731 short of the representative table are
the eligibility re-check firing at manifest time, evenly spread (batch 0: a
10,000-row page emitted 9,991). Its watchdog had restarted the finished job **576
times** on a 10-second timer — NEW1 fixed `stall-watchdog.mjs` the same hour.

**P4 · The nine atomic legal objects got their prompt builders** — commit
`25731e9`. Migration 0054 added `issue`, `relief`, `procedural_event`,
`date_event`, `fact_proposition`, `party_action`, `court_action`,
`reasoning_proposition`, `statute_role` to the database CHECK on 14 Aug and
nothing could produce one. The claim VALUE is the QUOTE, never the paraphrase;
location is COMPUTED from the verified span, never asserted. Smoke runs:
`court_action` 70.0% of claims verified, `statute_role` 100.0%.

**P6 · Tokens per accepted verified object** — commit `2d08d1f`,
`pnpm --filter @lawmind/ingest enrich:telemetry`.

| task | docs | tokens | verified | tok/obj | claim% |
| --- | --- | --- | --- | --- | --- |
| metadata | 17,699 | 18.1M | 38,691 | 469 | 99.8 |
| case_structure | 1,270 | 4.5M | 9,458 | 479 | 79.2 |
| holding | 1,537 | 5.2M | 7,033 | 742 | 78.6 |
| topics | 1,357 | 4.4M | 6,832 | 642 | 80.3 |
| treatment | 8,000 | 7.5M | 5,818 | 1,288 | 84.8 |
| arguments | 1,472 | 4.7M | 4,643 | 1,016 | 79.1 |
| authorities | 1,516 | 4.8M | 2,299 | 2,088 | 81.4 |

**75,234 verified objects for 49.7M tokens = 660 tokens per verified object.**
`authorities` costs 4.4x `case_structure` per object at the same verification
rate — it asks for a judgement most judgments support only a few times, so it is
the task to scale last. **`citation_extraction` has 42 documents and ZERO
verified claims**; recorded, not investigated. Also found: `rejection_reasons`
holds two encodings (23,395 arrays, 9,119 double-encoded strings from a 12-13 Aug
pass); reading only the arrays silently drops 226 real rejection reasons.

**P8 · `statute_mappings` holds 226 rows, and the gate threw away 45%** —
migration `0060` plus `statute-mappings-load-cli.ts`, both swept into NEW1's
commit `5fb6caf` (see below). BSA 117 · BNSS 95 · BNS 14, every row carrying its
printed evidence line, its source URL and an `effective_date` READ from
`statutes.enforcement_date` rather than typed.

The gate exists because spot-checking the parse before writing turned up
`BNSS 24 -> CrPC 201` from a line reading `24 New proviso is added to subsection
(1).` — **`201` is not on that line.** The parser reads by column position and a
wrapped summary drops a neighbour's number into the old-section column. Every
mapping now has to survive the test a legal-object claim survives: the old
section must appear as a standalone token in its own printed line or the two
after it. It rejected **191 of 420** — 174 of them BNSS, 0 of them BSA, which is
the same ranking the coverage figures already gave. Coverage stays 6.4% / 42.4% /
70.6% and every run prints it: **the absence of a mapping means the parser has
not read it, never that no counterpart exists.**

**P9 · CRIMINAL_CODE_TRANSITION_READY** — `transition.ts` (commit `7098842`,
verified live this session). No offence date ⇒ `indeterminate`, and the answer is
to ask for the date rather than pick IPC or BNS. NEW1's `adv-5` passes. The
commencement date is read from `statutes`; disagreeing rows produce a REFUSAL.

**P11 · COVERAGE_CONTRACT_READY** — commit `a1d131b`, migration `0059`,
966 court-year cells: COVERED 631 · PARTIAL 257 · UNKNOWN 77 · SOURCE_HAS_ZERO 1;
EMBEDDED 558 · LEXICAL_ONLY 408. **Zero KNOWN_GAP, and that is a correction:**
NEW1 counted Bombay 2005-2011 as absent entirely on 18 Aug; against NEW2's 19 Aug
frontier those years hold 87.5%-99.8% of source. The fleet filled it between the
two measurements, which is the argument for a table with a `measured_at` rather
than a number in a document. **No PARTIAL threshold is encoded** — `held_share`
is stored so `PRODUCT_DECISIONS.md` can draw that line later.

**Two operational notes.**

`scripts/legal-object-factory.sh` is superseded by `legal-object-factory.mjs`:
the bash loop died with `dofork: child -1 ... 0xC000026B, errno 11` — git-bash's
fork emulation runs out under a loop that forks node+timeout+grep every batch.
The Node version spawns Win32 processes directly and carries the nine atomic
tasks behind the five composites.

**P3 · Eligibility is per task, and `issue` was costing 10,486 tokens per
object** — commits `11a7e3d` and `cf4bef4`. Tier A had become a single universal
predicate, wrong in two directions at once. `procedural_event`, `date_event`,
`party_action` and `court_action` now reach bail orders — verified live: six
documents drawn returned 2 `bail_order`, 2 unclassified, 2 `decided`. `issue`,
`relief` and `reasoning_proposition` now need 5,000 characters, a floor measured
across 1,732 documents (share yielding a verified issue: 29.0% ≤2,500 · 44.3%
≤5,000 · 63.8% ≤7,500 · 79.7% ≤15,000). Per-document yield doubled.

**A 16,000-character head-only excerpt for `issue` was tried and REVERTED**:
28k head+tail bought 6 verified objects for 52,538 tokens, 16k head-only bought 2
for 37,428. The span positions that justified it were measured on extractions
made WITH the full window — they say where a found issue sits, not where the
model must look to find one.

**P7 · Legal-object manifest v2** — commit `45c9f6c`. 7,414 verified claims, up
from 1,265 in nine hours: holding 2,286 / issue 1,330 / proposition 3,798. The
`issue` population NEW1's representation-layers experiment could not test now
exists.

**`pnpm lint` is green, 161 errors to 0** — commits `138784b`, `3ebb7e4`. 159
were NEW1's `services/harness/src/*.mjs` reading Node globals as undefined; that
population joins the eslint block `scripts/**` and `services/harness/probes/**`
already sit in. Three genuinely dead variables in other lanes' files were taken
under NEW2's 18 Aug handoff convention. **`format` is still RED — 301 files,
including files untouched since 9 Aug, so it has been failing about eleven days.
Only this session's own files were formatted; a repo-wide `prettier --write`
mid-sprint would rewrite every lane's in-flight work and is somebody's deliberate
quiet-moment commit, not a side effect of this one.**

**Commit `5fb6caf` (NEW1's) contains six LCC files.** They were staged when NEW1
committed in the shared working tree — migration 0060, its journal entry,
`statute-mappings-load-cli.ts`, `legal-object-factory.mjs`, the `.sh` and
`services/ingest/package.json`. Nothing is lost and history is not being
rewritten; the P8 reasoning that would have been in that commit message is the
section above, which is why it is here in full.

### 20 Aug 2026 — NEW2: THE HISTORICAL BULK FRONTIER IS CLOSED, AND `decided_brief` IS 15.6% PRECISE

**Added by NEW2 (ingestion lane).** Artifacts `docs/ops/migration/new2-frontier.txt`,
`new2-source-exclusions.json`, `new2-class-precision-sample.json`,
`new2-model-classification-manifest.json`. Bus 0844–0847, 0850–0852, 0857–0860.

**`HISTORICAL_BULK_FRONTIER_CLOSED`.** `REMAINING ACTIONABLE` went **702,176 → 0**.
888 of 889 court-year cells read `WALKED`; the 889th is a partition the ingester
deliberately refuses. No worker is running and the logon launcher
(`Startup\Lawmind-ingest.cmd`) is renamed to `.disabled-frontier-closed` so a
reboot cannot silently restart 46 workers that would walk to exhaustion and write
nothing. **judgments 18,698,968**, exact `count(*)`.

**289,502 of that backlog — the entire Bombay remainder — was `bench=testcase`.**
A published test fixture `hc-load.ts` refuses by rule, documented in
`HC_INGEST_PLAN.md` and covered by a test. `HC_METADATA_SURVEY.perCourtPerYear`
sums parquet footers per court-year with **no bench breakdown**, so the
denominator counted rows no worker will ever fetch and the remainder could not
shrink. Listing the objects live gives 56 files and 289,502 rows — the residual
to the row. Fixed at the denominator: `new2-source-exclusions.json` imports
`isTestFixture` from the ingester rather than re-implementing it, and
`new2-frontier.mjs` / `new2-coverage-report.mjs` now subtract it and report
`SOURCE_EXCLUDED` separately.

**The last 878 rows were invisible to the scheduler.** 43 cells with no cursor at
all, below `--min-remaining 1000`, in four courts the launcher's static `hist`
list omits. **Run the plan once at `--min-remaining 1` before believing any "0
remaining".** 16,632 documents written this session, confirmed by counting the
heap before and after rather than by trusting worker logs.

**Per-class precision, adjudicated against the documents:**

| class | precision | 95% CI | corpus rows |
| --- | --- | --- | --- |
| `bail_order` | 100.0% | [92.9, 100.0] | 515,125 |
| `reference_stub` | 100.0% | [92.9, 100.0] | 113,973 |
| `procedural_disposal` | 98.0% | [89.5, 99.6] | 372,784 |
| `decided` | 75.0% | [60.6, 85.4] | 658,954 |
| **`decided_brief`** | **15.6%** | [7.7, 28.8] | 205,731 |

**`decided` + `decided_brief` — the Tier-A selector — is 60.9%.** The 87.0% broad
figure averaged a 100% class with a 15.6% one and must not be quoted again.
`decided_brief`'s rule is `disposal_nature_merits_short`: the same merits-looking
disposal string as `decided`, minus the length that gave the text room to
disagree with it. Below ~1,500 characters the registry's bookkeeping string is
carrying the whole decision. **Whether `decided_brief` stays in Tier A is a
decision for LCC and NEW1, not for this lane alone** — dropping it costs 24% of
the row count and moves the selector from 60.9% to 75.0%.

**`script_quality` incremental pass was structurally impossible before today.**
`judgments.id` is a random uuid, and **740,993 of 740,993** rows created after
the 19 Aug full pass began sort BELOW its final id watermark. Resuming would have
screened nothing for ever while exiting cleanly. `--since` keysets on
`(created_at, id)` in a separate checkpoint file. 777,186 new documents screened,
**58,615 `legacy_font_ascii` verdicts total** — and 11 of 100 sampled Tier-A rows
are unreadable mojibake, so treat 58,615 as a floor with a wide margin above it.

**`MODEL_CLASSIFICATION_MANIFEST_READY`** — 190,102 uncertain rows enumerated
over a **1,044,987**-row residue against a FROZEN screen. The 760,305 constant
every earlier projection used is stale by 37%. Payload is gitignored (283 MB);
the summary is committed. CLOSED-family rows are 40–59% uncertain against 15–25%
for DISPOSED, so a bounded first paid pass is CLOSED + CLOSED NO COSTS + RELAXED
= 22,865 rows.

**Blocked, and not on a credential:** the live-eCourts pivot needs an observation
schema from LCC (bus 0839). Nothing has been harvested; a live harvest whose rows
have nowhere correct to land is the one mistake that cannot be cleaned up later.

### 20 Aug 2026 — NEW1: THREE JOBS SAID "COMPLETE" WHILE DOING 1.1%, AND RERANKING DOES NOT WORK

**Added by NEW1 (retrieval lane).** Artefacts under `docs/ai/new1-rerank/` and
`docs/ai/new1-halfvec/ef-search-sweep.json`.

**The Tier-A scale run had stopped at 110,469 vectors — 1.1% — and printed
`RUNNER COMPLETE`.** `stage-runner.sh` defaulted `MAX_BATCH` to 9 against an
886-batch manifest. Restarting it exposed a second defect: the GPU sidecar had
died, so every batch failed instantly with `fetch failed` and the walk advanced
anyway, eating 67 batches in about sixty seconds and printing START and END for
each. A third, in a script all five lanes share: `scripts/stall-watchdog.mjs`
restarted its child on exit code 0, re-running the COMPLETED manifest builder 549
times in 5.7 hours. All three fixed; all three verified against the failure they
were meant to catch. **Batches 10-76 still owe a pass** —
`START_BATCH=10 MAX_BATCH=76`, a re-run rather than a repair, since the stage is
idempotent per document.

The pattern is worth carrying: every one of these made a stopped job look like a
finished one. Process tables showed them alive, row counts rose until they
didn't, and the logs said success throughout.

**ef_search=40 is the PROBES' setting, not production's.** `retrieve.ts:374`
defaults `HNSW_EF_SEARCH` to 200 and sets `iterative_scan = relaxed_order`, with
no override anywhere in the repo. The 6–9% loss reproduces exactly at 40 (6.0% at
recall@10, 9.6% at @50, 1.67pt success@5) — measured against an exact scan with
index access disabled — so the earlier finding was right about the number and
wrong about who was paying it. **200 is the lowest arm that fixes the tail** and
production is already there; 80 and 120 lift the mean while leaving the worst
query at 10% recall. Remaining for HALFVEC: compare fp32 against halfvec **at
ef_search=200** rather than at the 40 both were measured at. Not issuing
HALFVEC_PRODUCTION_READY before that runs.

**Reranking does not work here, by three independent routes.** Candidate depth
200→2,000 bought +15.7pt of gold PRESENCE and 0.00pt of success@5. Eight trusted
features appeared to buy +21.5pt until the ablation showed **278 of 278 gold
authorities are inbound-cited** — the gold is citation-derived, so `inbound` was
recognising eligibility to BE gold; stripped of document priors the gain is
+0.69pt. The cross-encoder (`bge-reranker-v2-m3`, already in the repo) makes
success@5 **worse by 2.78pt** at 12.2s/query, and fp32 loses harder than q8, so
quantisation was not the confound.

**Consequence for gold construction (NEW3):** this evaluation set cannot measure
retrieval of uncited authority at all, and roughly 99.8% of the corpus is uncited
— exactly the population Tier-A expansion exists to reach. The expanded HC
benchmark must deliberately include gold nobody has cited.

**HEAD:4800 is validated, by the arm expected to beat it.** 1200/2400/4800/9600
over one fixed pool of 5,000 documents with real ANN hard distractors: 9,600
COSTS 3.2pt of recall@20 at double the price. 2,400 offers 1.87x throughput for
0.35pt of success@5 but costs 7.42pt of recall@20 and is declined. With 99.2% of
the run's wall time inside the encoder and 0.9% in the database, **there is no
cheap throughput lever** — the 11.4 days stands on tokens.

### 20 Aug 2026 — NEW1: HALFVEC IS THE ANSWER, AND PRODUCTION HNSW LOSES 6–9% OF TRUE NEIGHBOURS

**Added by NEW1 (retrieval lane).** `docs/ai/NEW1_HALFVEC_TASK_FIDELITY.md` and
`docs/ai/NEW1_CANDIDATE_DEPTH.md`.

**`HALFVEC_TASK_FIDELITY_WARN`**, 283 queries, three arms, criteria fixed before
the numbers (`docs/ai/new1-halfvec/verdict-criteria.md`).

| arm | succ@5 | rec@20 | MRR |
| --- | --- | --- | --- |
| EXACT_FP32 (ground truth) | 22.26% | 40.99% | 0.1239 |
| HNSW_FP32 (production today) | 20.49% | 39.22% | 0.1177 |
| **HNSW_HALFVEC** | **20.85%** | **39.93%** | **0.1231** |

halfvec beats the incumbent on all five metrics, index 1,613 MB against 4,839 MB
(**3.0x smaller**), p50 23% faster. The WARN is one clause of one ANN criterion
failing by 0.13 pt, plus an absolute clause that **fails for the incumbent too** —
recorded as an amendment rather than deleted, because a threshold moved after
seeing data is not a threshold. **Recommendation: halfvec for the Tier-A
population; do NOT rebuild the frozen chunk index for it.**

**The bigger finding is not about halfvec.** At pgvector's default `ef_search = 40`
the production graph returns **0.907–0.940** of the true nearest neighbours and
only **half** of them on the worst 5% of queries. That costs ~1.8 points of
success@5 against exact search and had never been measured.

**Candidate depth (P3): 200 → 2,000 buys +15.7 points of gold PRESENCE and 0.00
points of success@5, recall@20 or MRR** — at +1,074 ms p50. Depth is funding a
reranking opportunity nothing currently takes, which makes it the first honest
argument for a cross-encoder and an argument against raising `CANDIDATE_DEPTH`
before one exists.

**Cleanup:** the two disposable probe tables (6.7 GB) were dropped after the
verdict; `new1_inbound_counts` and `new1_doc_vector_stage` are kept because they
are inputs to live work. Rebuild instructions in `docs/ai/new1-halfvec/RESUME.md`.

### 19 Aug 2026 — NEW1: THE EMBEDDINGS DO USEFUL WORK — 0.8% TO 35.8% ON AUTHORITIES THAT WERE UNREACHABLE

**Added by NEW1 (retrieval lane).** Detail
`docs/ai/NEW1_TIER_A_EXPANSION_BENCHMARK.md`, artifact
`docs/ai/new1-tier-a/expansion-benchmark.json`.

The frozen 283-query benchmark is `courts=[sc]` and cannot measure corpus
expansion — it was built to be insulated from corpus change. So a second
benchmark: 120 query→authority pairs from real citation edges, gold = documents
that only became reachable when Tier-A embedded them, citing side across 11 High
Courts, queries built through `build-queries.ts`'s own redaction functions
(113 of 233 candidates rejected by them).

| universe | n | success@5 | recall@20 | MRR |
| --- | --- | --- | --- | --- |
| OLD — production dense arm, 40,161 documents | 120 | **0.8%** | 0.8% | 0.004 |
| NEW — Tier-A document vectors, 19,987 documents | 120 | **35.8%** | 45.8% | 0.318 |

**117 of the 120 gold authorities carry no chunk at all.** Not a ranking failure —
no reranker, fusion weight or candidate depth can return a document that has no
vector. Verified by a presence check over all 120 plus a 20-query positive control
through the production ANN path; the control agreed on every sampled query.

**Not a like-for-like ranking comparison** — 19,987 documents against 620,300
chunks, and a smaller pool is an easier ranking problem. The like-for-like claim is
the reachability one. A fair ranking comparison needs the MERGED universe and was
deliberately not built: chunk-level and document-level distances are not
calibrated, and merging them silently would smuggle a fusion decision into an
expansion measurement. That calibration is the next question, and LCC's
`document_vector_staging` (0057) is where it belongs.

**Also landed (P5, `docs/ai/NEW1_REPRESENTATION_LAYERS.md`): five vectors per
document BEAT the 32.82-vector full-chunk ceiling** — 24.0% vs 23.0% success@5,
44.9% vs 41.7% recall@20, at 15.2% of the vectors — while a seeded-random
selection of the SAME size scores 18.7%. The selection does the work, not the
count. The two positional proxies (TAIL for holding, ISSUE for the question
presented) both scored BELOW head-only; the layer that pays is geometric
(the chunks nearest the document's own centroid), which needs no extraction stage.

### 19 Aug 2026 — NEW1: THE GPU IS EMBEDDING, AND THE QUEUE IT SHOULD DRAIN IS 10,669 DOCUMENTS LONG

**Added by NEW1 (retrieval lane).** Detail `docs/ai/NEW1_TIER_A_STAGING.md`,
artifacts `docs/ai/new1-tier-a/`.

**Real Tier-A vectors exist.** Stage 1: 9,987 documents, one vector each,
`HEAD:4800` (the measured recipe, not a new one), **8,861 tokens/s sustained**,
18.8 min, **0 non-unit-norm vectors and 0 dimension errors**. Written to
`new1_doc_vector_stage` as `vector(1024)` — NOT `halfvec`, because the C3/C4
fidelity verdict was still running and fp32 casts down later while halfvec cannot
cast back up. Nothing in `packages/db` was touched.

**The finding is the ORDER, not the throughput.** Of the first 4,600 documents
staged in `representative_judgment_id` order, **8 carry any inbound citation**.
An id-ordered walk spends a hundred-GPU-hour budget on documents nothing cites and
produces a population no citation-grounded benchmark can score.

**And re-ordering hit a ceiling nobody had measured.** One pass over
`judgment_citations` (18.6M rows, 25.3 s):

| | |
| --- | --- |
| judgments cited by anything we hold | **35,694** |
| judgments held | 17,945,147 |
| share | **0.199%** |
| of those, inbound = 1 | 23,914 (67%) |
| maximum inbound | 219 |
| **value-ordered queue after eligibility + excluding what is already reachable** | **10,669** |

I asked the corpus for 50,000 documents worth embedding first and it could supply
10,669. **The binding constraint on Tier-A prioritisation is citation-graph
coverage, not GPU time.** Whether the other 99.8% is unresolved citations or
genuinely uncited routine orders is a citation-pipeline question (LCC) or a
source-coverage one (NEW3) — the two readings call for opposite responses and a
retrieval instrument cannot separate them. Bus 0775–0778.

**Also measured, and it is a live production risk rather than a lab number:** one
ordinary hybrid query's sparse arm ran **1,994 seconds** before it was cancelled,
and `packages/db/src/index.ts` creates the API's client with **no
`statement_timeout`** — so nothing would have stopped it. Bus 0771 to LCC.

### 19 Aug 2026 — NEW1: THE FUSION FIX DOES NOT SHIP, AND EMBEDDING COVERAGE IS COURT-SHAPED

**Added by NEW1 (retrieval lane).** Full detail
`docs/ai/NEW1_FUSION_POLICY_VALIDATION.md`, artifacts under
`docs/ai/new1-fusion-policy/`. This SUPERSEDES the recommendation in
`docs/ai/NEW1_FUSION_WEIGHT_SWEEP.md` §RECOMMENDATION; everything that document
measured still stands.

**`QUERY_ROUTED_HYBRID` is withdrawn.** The defect it addressed replicates out of
sample — equal-weight RRF costs criminal queries 6.1 points of success@5, and a
parameter-free criminal→dense-only routing is worth **+1.78 pts held-out, 95% CI
[0.00, 3.52], P(Δ>0) = 0.969** across 2,000 stratified split-halves and 10,000
bootstrap resamples. The FIX fails three checks the sweep did not run:

1. **The constant is unsupported.** Across 2,000 training halves the fitted θ
   lands on 0 in 49%, 0.05 in 23% and **0.85 in 21%** — and the fitted policy
   scores 0.72 pts BELOW the parameter-free one on held-out data.
2. **The coverage gate never fired.** All 4,868 candidates in the benchmark are
   embedded, so gated and ungated are identical to three decimals. Analysed, the
   gate is also backwards: it strips sparse weight from documents dense CAN rank
   and leaves it on documents dense CANNOT see, which promotes unembedded
   documents in a mixed-court result set.
3. **The router cannot see what it routes on.** The benchmark's `criminal` label
   is `case_type` of the CITING judgment; production derives nothing from query
   text and exposes `filters.caseType` only as an optional user filter. A
   transparent 39-marker lexicon reaches 100% precision at 20.5% recall, and the
   routed policy on those labels is worth **−0.37 to +0.00 pts**.

**Action: hold equal-weight RRF. Nothing in `retrieve.ts` changes.** When a
signal exists it routes on `filters.caseType` (exact, user-asserted) AND on the
candidate universe's coverage — never per document. `COVERAGE_FLOOR` is a
product-risk choice and is NOT settled by this lane.

**The number every sizing estimate should now use.** Full `GROUP BY` over
`judgments`, 39.5 s, 19 Aug:

| | held | embedded | coverage |
| --- | --- | --- | --- |
| Supreme Court of India | 38,342 | 38,341 | **99.9974%** |
| Gauhati / Patna / Kerala / MP / Manipur / Meghalaya / Sikkim | 3.5M | 1,820 | ≤ 0.46% |
| every other court (18 of 26) | 14.4M | **0** | 0.0000% |
| **total** | **17,945,147** | **40,161** | **0.2238%** |

Coverage is **court-shaped and effectively binary**, not a uniform 0.42%. The
denominator also moved: 17,945,147, not the 14,973,372 in bus 0723 — NEW2 has
ingested ~3M under it, so **0.42% and the 15.45x sizing figures are stale twice
over**.

### 19 Aug 2026 — NEW2: THE FRONTIER IS A CURSOR, NOT A SUBTRACTION; AND 14,402 DOCUMENTS WERE CONDEMNED BY ONE BAD HOUR

**Added by NEW2 (ingestion lane). Nothing in LCC's ordering below is changed.**
Machine-readable output in `docs/ops/migration/new2-*.json`.

**1. The actionable frontier is 1,081,044 source ROWS, and the fleet plan's
number-one item was zero work.** `scripts/migration/new2-frontier.mjs` measures
the ingest CURSOR (`.checkpoints/<scope>.json` row offsets — the number a worker
resumes from) instead of `source - held`. Both sides then count the same parquet
rows, so the source-side duplication inflates both and cancels in the difference.
`new2-yearscope-plan.mjs` had ranked `hc-boot-mid-9_13` FIRST at **977,031
actionable**; Allahabad's own checkpoint reads **2,055,580 of 2,055,580 rows
read**, every year exhausted. The 977,031 was duplication (bus 0721: one object,
443,845 rows, 225,366 distinct documents). Launched before the fix,
`hc-boot-mid-27_1` confirmed it independently — `DOCUMENTS SEEN 0 · 526,499
already_held`. The plan now consults the cursor; candidates fell 23 → 20.
`lastRunExhausted` could not catch these because it needs a `RESULTS` block and
that log has none. **A cursor does not need a clean exit.**

**2. `script_quality` is populated — one verdict, over a complete 17,945,147-row
pass.** Migration 0056 landed (LCC bus 0754). `services/ingest/src/script-quality-cli.ts`
wrote **56,767 `legacy_font_ascii`** and deliberately wrote none of the other
four values. `clean` would be asserted from the ABSENCE of a signal, and a
pure-ASCII English judgment is byte-identical to a Hindi judgment whose
Devanagari Poppler deleted — writing `clean` there puts mode-2 damage into
`axis_b_text` as positively assessed, which is worse than NULL. Licence for a
text-only verdict: the pilot was expanded 197 → **997 font-readable documents**
across nine courts, **0 false positives in 939 PDF-labelled clean documents**,
recall 76.2%. Rajasthan is 3.89% and 69% of the total, but **sixteen courts carry
some** and Patna produced a positive nobody suspected. The rows are MIXED —
caption readable, reasoning not — so they are findable by title and unusable.

**3. The 755k residue is a ~147,000-row model job, and a text screen is
trustworthy in only one direction.** `services/ingest/src/disposal-residue-cli.ts`
trains on the corpus's own independent label (class assigned from the disposal
string, never from text), splits train/test, and measures on the held-out half:
a `procedural` call is **97.6%** correct at a 50/50 prior and fires on 1.1% of
truly decided documents; a `decided` call is **87.0%**. So procedural-looking
rows can be dropped cheaply and the rest cannot be admitted cheaply — the right
shape for high-precision eligibility. Residue mix (n=6,000): 75.1%
substantive-looking (an UPPER bound, the screen leans decided), 5.6% procedural,
**19.4% genuinely uncertain**. `CLOSED` is 58% uncertain and is where a model is
worth paying for. Nothing was written to `judgments`.

**3b. A statistic I nearly published, and it was not the statistic I named it.**
The first version computed, inside the truly-decided set alone, `decided calls /
all calls` and called it `precisionWhenCalled`. It printed **98.5%**. Precision is
P(truly X | called X) and is undefined without the other class contributing false
positives; pooled, the screen calls `decided` on 12.9% of truly PROCEDURAL
documents, so the real figure is 87.0%. 98.5% would have licensed writing
`decided` onto ~570,000 rows with one in seven being court admin entering the
authority class.

**4. The 14,402 "outage" was a SOFT 404, they were correctly condemned, and I
un-condemned them. Correction in full, because the correction is the finding.**
The claim was: `ingest-ledger.ts` promotes at `MAX_ATTEMPTS = 3` with no notion of
time, 99.5% of the 14,402 permanent `pdf_failed` rows were condemned inside the
single hour 2026-08-18 18:00, 97% Bombay, and a HEAD probe returned **200 for
14,402 of 14,402** — so the permanence was wrong. All 14,402 were cleared.

**It was not wrong.** Fetched in FULL those objects are `HTTP 200 ·
Content-Type: application/pdf · 124 bytes` containing
`<html>…Welcome User Search Page not Found here…</html>` — the upstream stores its
own error page under the PDF key. A real one begins `%PDF-`; a known-good Bombay
judgment sampled beside them was 34,899 bytes. **360 of 360 sampled across two
draws were the error page; 0 were PDFs.** The clustering was real but meant the
worker had reached a contiguous run of dead keys, not that the source had a bad
hour.

**HEAD was the wrong instrument and the tool's own caveat block said so** — "a
HEAD 200 says the object exists, not that it parses". The caveat was right and the
code did not act on it. Cost: the fleet re-fetched 14,402 error pages and
re-condemned them within the hour (Bombay permanent `pdf_failed` 14,004 ->
38,876); `hc-boot-mid-27_1` and `hc-boot-hist-27_1` spent a pass on it at
`24,627 seen / 0 mapped` and `13,908 seen / 0 mapped`. **`judgments` was never
touched, so no corpus data was lost or corrupted.**

**The real defect, which is worth having found:** a soft 404 was recorded as
`pdf_failed`, which is RETRYABLE — so the fleet re-fetched every one three times
per pass forever, and they sat in a retry queue instead of the provider-recovery
population. `text.ts:fetchPdfText` now checks the magic bytes before parsing and
throws in the exact `GET <url> → 404` shape `hc-load-cli` already parses, so it
maps to `pdf_absent`, permanent on sight. Two tests assert that shape specifically,
because a different message falls through to `pdf_failed` again. 7/7 in
`text-fetch.test.ts`, 58/58 across the ingest suites, typecheck clean.

**`MIN_CONDEMN_SPAN = '6 hours'` is REVERTED.** It was justified by an outage that
did not happen; without that evidence it only delays correct condemnation of dead
keys and buys another round of fetches for each. The reasoning stays in
`ingest-ledger.ts` as a comment so nobody re-derives it, and names what evidence
would justify adding it back: an OBSERVED outage, not one inferred from clustering.

**Consequence for NEW3's missing-PDF pilot: the population GROWS.**
`pdf_absent AND permanent` was 177,670; ~39,000 more join it from this
reclassification, nearly all Bombay. They are exactly the pilot's target — metadata
exists, the document does not exist at this source, only a provider can supply it.

**5. Fleet restarted at width 6, not 24, and deliberately NOT widened to 8.**
Gate under load: `CPU 46.6% · RAM free 23.8% · commit free 20.0% · GPU 100%`.
The GPU being saturated is the desired state — NEW1's tokenizer is fed and ingest
is not competing for it. Commit-free at 20.0% is the binding constraint, not CPU,
and the box has died six times on memory pressure. Corpus **17,945,147 →
18,478,938 (+533,791)**.

**6. The semantic imbalance got worse this session, in the only way that counts.**
Embedded documents: **40,161, unchanged**. As a share of corpus that is 0.22%,
down from 0.2238% purely because the denominator grew. With 1,081,044 source rows
left, **the acquisition programme is close to finished and the semantic programme
has barely started** — the case for reclaiming CPU from ingest strengthens daily.

**7. The box rebooted mid-session and the LOGON LAUNCHER started 42 workers.**
`start-ingest-fleet.ps1` fires at logon by design, and its static `foreach` blocks
do not consult the plan — the plan contributed 0 workers because its candidates
are all tier 3-5 and `-PlanTiers` defaults to `0,1,2`. Result: 42 supervisors,
123 fleet processes, **RAM free 18.4%** — the memory-pressure condition behind six
`0xC000013A` Postgres deaths. Cut to 6 with `new2-scope-stop.mjs` (which refused
three partial stop-sets before it would act, correctly). RAM free 18.4% -> 45.6%,
commit free 25.3% -> 53.4%. Kept: `hist-27_1`, `mid-27_1`, `27_1`, `3_22`,
`21_11`, `36_29` — the six with real remaining work. **Most of the other 36 were
cursor-exhausted and would have re-read parquet footers to write nothing.**

**8. The frontier artefact lied to me before the guard existed, and the guard is
the lesson.** Its first full run emitted thirteen cells reading `WALKED` with held
under 50% of source — including `18_6 2016 source 12,997 held 0 0.0% WALKED`,
which reads as a serious acquisition defect. Live check: that cell holds **12,997
of 12,997**. The held snapshot had been taken while `hc-boot-mid-18_6` was
mid-run. **A stale held column does not fail loudly — it produces a plausible
coverage gap in the file another lane builds its coverage contract on.** The tool
now stats every checkpoint and flags `heldIsStale` in the report header and in the
artefact whenever a cursor was written after the snapshot.

**9. Of the thirteen, three survived a refresh, and they are one court.** Madhya
Pradesh 2024 / 2025 / 2026 hold 12,277 / 184 / 93 against 28,167 / 23,528 / 3,571
source rows — and `permanentAbsent` accounts for essentially all of the
difference (15,869 / 23,344 / 3,477). **MP 2024-2026 is ~99% `pdf_absent` at the
bucket**: metadata rows exist, PDFs 404. Not an ingest gap at any width; the
second-largest provider-recovery population after Bombay.

**10. `new2-frontier.json` now emits ALL 889 court-year cells**, which is the
precomputed table NEW1's coverage-state contract (bus 0724) said does not exist.
`heldShare` is emitted and **no PARTIAL threshold is applied** — where "materially
less" begins is a product judgement and belongs in `PRODUCT_DECISIONS.md`, not in
one lane's script.

**Frontier, end of session:** source 20,529,203 · walked 19,733,117 · **remaining
728,493** · acquired 18,579,847 · permanent absent 177,670. **Bombay is 289,502 of
the 728,493 — 40% of all outstanding ingest is one court.**

**11. The soft-404 reclassification, measured over the whole population.** The
corrected probe (GET + `%PDF-` magic + a 1,024-byte floor) over all 39,024
permanent `pdf_failed`: **39,003 soft 404s (99.9%), 21 real PDFs, 0 hard 404s, 0
unknown.** Bombay alone was 38,867 of them. `pdf_absent AND permanent` went
177,692 -> **216,695**; permanent `pdf_failed` is now **0**. Not all stubs are the
124-byte page — sizes run to 19,795 bytes — so the size floor alone would not have
caught them and the magic-byte check is what does.

**11b. That apply reported `cleared 0 / reclassified 0` while moving 39,003 rows.**
`res.count` came back unset on those UPDATEs; the write had happened and the tool
said nothing had. Verified by counting `pdf_absent` before and after. Now
`RETURNING 1` and `res.length`, which cannot be unset. **A write that
under-reports itself is worse than one that fails, because it invites the operator
to run it again.**

**12. The fleet plan gated on the cursor but still RANKED on source-minus-held,
and that half-change showed.** `hc-boot-hist-22_18` was correctly kept as a
candidate — its cursor is 263,296 of 267,627, so 4,331 rows really do remain — and
then listed FIRST at **101,121 actionable**, the held-based subtraction,
over-reporting by 23x. The launcher takes its order from that ranking.
`remainingActionable` now carries the cursor figure wherever a cursor exists, with
`remainingBySubtraction` kept beside it so the disagreement stays visible.

**12b. Fixing the ranking surfaced real work the held-percentage gate was
hiding.** `MAX_HELD_PCT` is now consulted only where there is NO cursor, because a
scope can read 100% held and still hold rows no worker has ever walked —
duplication makes held ≈ source while the cursor lags. Newly visible: `mid-10_8`
**67,617 unwalked at 100.0% held**, `hist-10_8` 74,246 at 100.0%, `hist-36_29`
54,107 at 99.5%, `hist-32_4` 38,593 at 99.7%, `7_26-y2024` 42,262 at 99.6%.
Candidates went 8 -> 16. **Every one of those would have been declared FINISHED by
a percentage.**

**13. Frontier and fleet at hand-off.** source 20,529,203 · walked 19,759,434 ·
**remaining 702,176** · acquired 18,609,913 (+38,342 Supreme Court =
**18,648,255**) · permanent absent 216,695 · retryable 18,288. Six workers running:
`21_11`, `3_22`, `36_29`, `7_26-y2024`, `mid-10_8`, `hist-10_8`. Gate at launch:
CPU 31.2% · RAM free 33.3% · commit free 31.1% · GPU 100% (NEW1 fed).

**Still founder-blocked, already queued, not re-raised:** `INDIANKANOON_API_TOKEN`
is unset, so the bounded missing-PDF pilot (161,792 `pdf_absent AND permanent`)
has not run. `INDIANKANOON_API_CREDENTIAL_REQUIRED`. Licensing is settled
(FQ-INDIANKANOON, NEW3 bus 0717) and is not reopened.

### 18 Aug 2026 — NEW2: 620,300 EMBEDDED IS 40,161 DOCUMENTS, AND THE CLASSIFIER GAP IS A RE-RUN NOT A RULE

**Added by NEW2 (ingestion lane). Nothing in LCC's ordering below is changed.**
Machine-readable output in `docs/ops/migration/new2-*.json`.

**1. The semantic population is 0.26% of the corpus, and the number everyone has
been quoting is chunks, not documents.** `judgment_chunks` holds 620,300 rows
over **40,161 DISTINCT judgments** — `scripts/migration/new2-semantic-backlog.mjs`.
NEW1's independently measured 15.45 vectors per document predicts 40,149 from the
same 620,300, so two derivations agree. Against 15,666,877 documents written,
**15,626,716 cannot be reached by the dense arm at all.** This is why NEW1's dense
`recall@20` was 40.6% before and after a 30.7% larger corpus with zero discordant
pairs: the embedded set never moved. The funnel is now printed with each stage as
a percentage of the stage above it, because "620,300" read as a total and hid it.

**2. `hc_document_class` coverage is not a rule-quality problem. 14.0% of it is a
re-run.** Replaying today's `classifyHcDocument` over the raw disposal strings the
column recorded (`services/ingest/src/disposal-coverage-cli.ts`, all 332 distinct
strings, 883,796 rows):

| | rows | share | what it is |
| --- | ---: | ---: | --- |
| STALE | 123,840 | 14.0% | today's rules DO classify these |
| RESIDUE | 755,620 | 85.5% | the `DISPOSED*`/`CLOSED` family refused on purpose |
| CANDIDATE | 4,336 | 0.5% | refused, and not by a documented decision |

`DISMISSED AS WITHDRAWN` (20,674), `DISMISSED AS INFRUCTUOUS` (16,878),
`38-RULE ABSOLUTE/ALLOWED @ FH` (8,586) and the `DISMISED` misspelling (4,209) are
all STALE — every one named in `hc-classify.ts` MEASURED_VOCABULARY as a string the
14 Aug extension was written to catch. They are still unclassified because
`--resume` selects `hc_class_method IS NULL`, so a row judged by an OLDER rule set
is skipped forever. **A new rule can win at most 4,336 rows; a re-run wins 123,840.**
`--restale` added (additive selector, running). The 755,620 is a MODEL problem, not
a rule problem, and the module already argues at length why guessing `DISPOSED OFF`
into `decided` would move 32.5% of a sample into the authority class wrongly.

**3. The stall watchdog could not see the fleet's commonest hang, because that hang
gets LOUDER.** `supervise.mjs` treated any stdout byte as liveness. unpdf's pdfjs
calls `Math.sumPrecise` — absent on Node v24.14.1 — while repairing a malformed
font, swallows it as a warning, and prints it **on a loop forever having stopped
advancing** (`hc-metadata.ts` documents the dead run). Measured: 7,363 of the last
7,395 lines of `hc-boot-hist-3_22.log`; `hc-boot-36_29` last wrote at 2,295
documents and kept growing its log. The watchdog now watches PROGRESS LINES, and
falls back to raw output for workers that have never emitted one — LCC's paragraph
and citation workers print a different shape and must not start being SIGKILLed.
Verified in all three directions before it went near the fleet.

**4. `new2-fleet-view.mjs` — one row per scope, derived from the process table.**
Aggregates have now hidden a dead scope three times. This never sums across scopes;
the fleet verdict is the WORST row. It found the `36_29` hang on its first run.

**4b. And then it cried wolf, which was worse.** At `--window 60` it reported three
of eight scopes as `log-only`; the same eight at `--window 300` were all `ok`,
having advanced 1,400–4,161 documents each. Cause: workers commit in batches of
200 and a scope at the slowest healthy rate (0.7 docs/s) emits nothing for ~285s
while working perfectly, which is indistinguishable from the hang. The default
window is now 300s and **a window shorter than one batch returns `inconclusive`,
never a bad verdict** — a watchdog that cries wolf gets ignored, and the next thing
ignored is the real hang.

**5. Width 8 is measured at ~1.9x the throughput of width 24.** Checkpoint deltas:
**137 docs/s at width 8**, 72 docs/s at 24, 229 docs/s at 11. Cut to 8 per the
resource policy, keeping the eight deepest blackouts. Scopes below 10% acquired are
protected from the cut — a court-year at zero is indistinguishable at query time
from a court-year that never existed.

**6. Madras had no historical scope at all — and it is now closed.**
`start-ingest-fleet.ps1` listed `33_10` only in the 2016-2022 band, so nothing had
ever been configured for its pre-2016 years: **186,786 source records, 1 document
acquired**, every year 1995-2018 reading zero. Added to the historical list and
launched. It finished cleanly the same session — `RESULTS: DOCUMENTS SEEN 96,669,
WRITTEN 95,479` — and the database now holds **185,589 Madras documents for
1950-2015, up from 1: 99.4% of source.** The largest single acquisition hole in
the corpus, closed in one pass, and it existed only because a court code was
missing from one `foreach` list. **Madras 1998 needs no retirement from the
scheduler** — `hc-load-cli` builds work from `listMetadataKeys()` and then filters
by year, so a year with no source partition is never enumerated. Madras 2016-2022
is separately complete (88,377 / 88,387 for 2016, and so on through 2022).

**7. LEGACY_FONT_SUSPECT is built, and the suspected court was the wrong one.**
`services/ingest/src/legacy-font.ts` reads `/BaseFont` out of the PDF bytes — not
via pdfjs, which is the component that hangs on broken fonts. Pilot over 197
font-readable documents: **5 legacy-font confirmed, all RAJASTHAN** (`KrutiDev010`,
`DevLys-010`); Chhattisgarh contributed zero. Markers were MINED from the PDF
labels, never typed from memory. Text-only screen: **recall 3/5, false positives
0/192**. The documents are MIXED — English caption extracts perfectly, Hindi body is
Kruti Dev underneath — so they are findable by caption with unreadable reasoning,
which is worse than absent.

**8. Four orphaned classify UPDATEs held locks on `judgments` for an hour, and the
supervisor built the convoy.** SIGKILL kills a client, not its statement:
`pg_stat_activity` showed 57m/42m/27m/12m, three blocked on the first. `openDb` now
takes an optional `statementTimeoutMs` (paired with
`idle_in_transaction_session_timeout`); the classify CLI opts in at 10 minutes.
Off by default — this helper is shared with passes whose statements are
legitimately long.

**9. The missing-PDF population is not a long tail — it is Bombay.**
`hc_ingest_ledger` holds 189,741 unfetchable records (`pdf_absent` 160,191,
`pdf_failed` 28,986, `no_text` 1,554, `pdf_timeout` 60). **27_1 is 65.7%, 23_23
15.8%, 9_13 10.3% — three courts are 92%.** So the provider-recovery question is
mostly "is Bombay worth recovering", and a proportional sample would have spent
two thirds of its budget re-answering one court. `src/missing-pdf-pilot-cli.ts`
draws a court×year stratified sample with a per-court cap, attaches a case
identity from the partition metadata (a ledger row has NO `judgments` row to join
to — the PDF was absent, so nothing was written), and **does not call Indian
Kanoon**: `INDIANKANOON_API_TOKEN` is not set in this environment, and
`harvest/indiankanoon.ts` already refuses honestly and already carries the
paise-denominated budget accounting. The sample is the half that needs no
credential. Provider text remains non-canonical whatever the recovery rate: a hit
is a pointer to an official copy, not a substitute for one.

**9b. Two of my own defects, found and corrected before the numbers were used.**
The first draw took each court's EARLIEST years (`ORDER BY year LIMIT n` is not a
stratification) and reported 85.7% of records identifiable; spread across years it
read 44.4%. Then that 44.4% turned out to be wrong too — it showed identity
resolution collapsing from 100% in 2005-2013 to 4% in 2024, which reads exactly
like "recent metadata is missing" and is not. **A partition publishes up to two
metadata files and they are not copies:** `year=2024/court=23_23/bench=mphc_db_gwl`
has `metadata.parquet` at 2,135 rows with `pdf_link` like
`court/cnrorders/…/MPHC030012372024_1_2024-01-22.pdf`, and
`metadata-mobile.parquet` at **15,874 rows** with `orders_2024_206300000742024_1.pdf`.
Different counts AND a different filename convention, so a basename join finds
nothing for rows in the other variant. The unresolved records were mobile-variant
rows, present all along. Now reads both and matches the union, plain winning a
collision. **This structure has now produced two wrong numbers in this repo in
opposite directions** — it also caused `HC_METADATA_SURVEY` to count rows rather
than documents (bus 0692).

**Corrected result: identity resolution is 546 / 546 — 100%, in every year from
2005 to 2026.** Neither 85.7% nor 44.4% was a fact about the corpus; both were
facts about my tool. **Identity is not a barrier to provider recovery at all**,
which is the opposite of what the intermediate numbers implied and is the answer
NEW3's Step 0 was asking for. Scope also narrowed to NEW3's `pdf_absent AND
permanent` definition — `pdf_failed` is not proof of absence, and including it
would have inflated the population and any projected spend by ~19%.

**10. MADRAS WAS NOT A ONE-OFF — SIX MORE COURTS HAD NO HISTORICAL SCOPE, AND
THAT IS 503,357 DOCUMENTS.** Having found `33_10` missing from the hist
`foreach`, the whole list was checked against measured holdings rather than
assumed correct. Pre-2016, source from `new2-coverage.json`, held from the
database:

| court | source | held | % |
| --- | ---: | ---: | ---: |
| 24_17 | 131,897 | 497 | 0.4% |
| 23_23 | 104,831 | **0** | 0.0% |
| 18_6 | 90,250 | 3 | 0.0% |
| 7_26 | 76,711 | 2 | 0.0% |
| 20_7 | 66,622 | 8 | 0.0% |
| 21_11 | 34,026 | 39 | 0.1% |

**None was a slow scope. No scope existed for any of them.** All six added to
`start-ingest-fleet.ps1`.

**FIVE OF THE SEVEN ARE ALREADY CLOSED, same session, each in ONE pass:**

| court | written | source | % |
| --- | ---: | ---: | ---: |
| 33_10 Madras | 95,479 | 186,786 | 99.4% (185,589 held) |
| 23_23 | 104,783 | 104,831 | 99.95% |
| 18_6 | 90,213 | 90,250 | 99.96% |
| 7_26 | 76,399 | 76,711 | 99.6% |
| 21_11 | 33,966 | 34,026 | 99.8% |

**ALL SEVEN ARE NOW CLOSED — 19 Aug.** `20_7` hung silently and its supervisor's
stall watchdog killed and restarted it unaided; it then ran to completion.

| court | written | source | % |
| --- | ---: | ---: | ---: |
| 24_17 | 131,282 | 131,400 | 99.91% |
| 20_7 | 15,227 | 15,230 | 99.98% |

**547,349 documents into seven courts that held about 550 between them.**

None of this needed a new capability, a credential, or more width. It needed the
court codes to be in the list. The fleet was then reprioritised rather than widened:
the four most-complete scopes (`8_9` 70.7%, `3_22` 68.5%, `10_8` 66.6%, `29_3`
65.8%) were stopped and the four largest zero-held courts started in their place,
holding width at 8. **A court at 0.0% outranks a court at 70%** — retrieval cannot
distinguish "we hold none" from "there are none", so an unheld court-year is
served to an advocate as an absence of law.

It is also faster: the four new scopes immediately ran at 17.3 / 16.0 / 9.4 / 5.1
docs/s against 2.6–6.0 for the incumbents, because an empty court pays no
`already_held` skip. Fleet ALL-OK at width 8, ~102 docs/s.

**11. `--restale` completed and the diagnosis verified to 99.7%.** Predicted
123,840 convertible rows; observed **−123,491 unclassified, +124,486 classified**
(the small excess is the three new rules). `hc_document_class` 1,010,938 →
1,135,424. The run's own self-check printed `14,058,456 with no method (must be
0)` — the same lie `--frame` was fixed for on 18 Aug, inherited by `--restale` and
`--resume`. Every selector that narrows the walk now says so; the assertion
belongs to the full walk alone, or the tool reports its own success as a disaster.

**Still open in this lane:** the 4,336 CANDIDATE rules (measured, not yet written);
`script_quality` needs LCC (schema); per-class precision for
`hc_document_class` needs adjudication, sample of 250 drawn with full rule
provenance at `docs/ops/migration/new2-class-precision-sample.json` and explicitly
NOT adjudicated. Note for whoever does: **44 of 50 sampled `bail_order` rows come
from `text_bail_phrase`**, the one rule in the module that reads prose rather than
restating a source field.

**17 Aug 2026 — THE MIGRATION'S CUTOVER GATE PASSES.** `compare.mjs` reports
**0 FAIL** across 53 tables on **exact** row counts, schema, structure,
constraints and generated columns; `smoke.mjs --source local` matches the Railway
baseline **13/13**, including the one check that fails on both; the R2 backup is
**byte-verified** (629 files read back, 0 differences); `judgments` reads
**7,296,068**. Full detail in `docs/ops/migration/MIGRATION_RUNBOOK.md`
§STATUS 17 Aug 06:50.

**~~The freeze STAYS ON and `LOCAL_DATABASE_CUTOVER_APPROVED` has NOT been
sent.~~ SUPERSEDED 17 Aug 12:20 — THE CUTOVER IS DONE.** NEW1's independent gate
returned **PASS** (bus 0641: 57 unique checks, 52 PASS, **0 FAIL**, 5 INFO, all
eight classes). `DATABASE_URL` now points at `127.0.0.1`, `RAILWAY_DATABASE_URL`
is retained as the rollback path, `new2-railway-static-audit --cutover` passes
with every writer entry point LOOPBACK, and `LOCAL_DATABASE_CUTOVER_APPROVED`
went to NEW2 (bus 0646). `LOCAL_READY_FOR_POST_MIGRATION_GATE` had gone out as
bus 0593.

**Item 3 below is CLOSED: `pg-service-verify` is 7/7.** The postmaster was
restarted onto a direct detached `postgres.exe` spawn, so it has no `cmd.exe`
parent and therefore no console for a control event to be delivered on —
`no console parent  PASS  parent pid 17072 is gone`, where an hour earlier it read
`FAIL  postmaster 27764 has LIVE cmd.exe parent 6848`. **FQ-PGSERVICE itself stays
open**: a scheduled task fires at LOGON, not at boot, so an unattended reboot
still comes up with no database until someone signs in. That needs the one
elevated `pg_ctl register` command.

### 19 Aug 2026 — GATE S2's HARD STOP CLEARED: `cite:` WAS 0.00%, AND THE ARM NOBODY SUSPECTED WAS THE CAUSE

**`structuredExactness` measured 0.00% — all 120 of 120 real citations timing
out at 8 s through `runStructured`'s `cite:` branch, on the live `/search`
route inside Gate S1's 3-second budget.** NEW1 found it (bus 0730/0731), one
query observed running 31 minutes before being cancelled by hand. `CLAUDE.md`
calls Gate S2 a hard stop; this was it.

**Now `PASS 100.00%`, 120/120**, from NEW1's own unmodified tool
(`pnpm -C services/harness run gate:structured`, 53,262 ms). `fieldPrecision`
was and remains 100%.

**The obvious fix changed nothing, and that is the finding worth keeping.** The
suspect was the correlated `unnest(reporter_citations)` arm — the one
`exactCitation`'s 17 Aug header already names. Replacing only that arm, with the
same GIN-indexable `lawmind_citation_keys(...) @> ARRAY[key]` form, left the plan
identical: still a backward scan of `judgments_judgment_date_idx`, cost
50,116,705 → 51,353,396. Hypothesis refuted, which is the only reason the real
cause surfaced.

Planning each arm ALONE found it:

| arm | plan alone | cost |
|---|---|---:|
| A neutral citation | Index Scan, `judgments_neutral_citation_key` | 1.57 |
| B reporter keys | Bitmap Heap Scan, `..._reporter_citation_keys_gin` | 182 |
| C alias `EXISTS` | Nested Loop, indexed both sides | 5.28 |
| **A OR B** | **BitmapOr of both** | **188** |

**A correlated subquery cannot be a member of a `BitmapOr`.** There were TWO of
them — the `unnest` arm and the alias `EXISTS` — and either one alone forces
every row of `judgments` to be evaluated, so fixing one leaves the other doing
identical damage. The alias arm is the instructive one: it plans beautifully in
isolation, so nothing about inspecting it suggests a problem. It is only fatal
in company.

Fix keeps ONE `OR` and still composes under `AND`/`OR`/`NOT` — NEW1 was right
that `exactCitation`'s `UNION` cannot be used here, and it turned out not to be
needed:

    OR lawmind_citation_keys(j.reporter_citations) @> ARRAY[$1::text]
    OR j.id = ANY (ARRAY(SELECT a.judgment_id FROM judgment_citation_aliases a
                          WHERE a.alias_key = $1))

`ARRAY(...)` is a scalar array expression: one `InitPlan` plus a
`Bitmap Index Scan on judgments_pkey`, which a `BitmapOr` accepts. Result:
**BitmapOr of all three arms, cost 1,342, 3 ms** with the `ORDER BY
judgment_date DESC LIMIT 2` untouched. The `ORDER BY` never needed changing —
with an unindexable arm the planner estimates 8–12M matching rows and the
date-walk looks cheap; the predicate matches ONE row. Making the estimate honest
removes the gamble without a hint, a CTE, or a rewritten sort.

**Equivalence observed, not assumed** — changing what a citation matches would
be worse than the timeout. Differential test against the replaced forms: arm 2
over 20,000 rows carrying `reporter_citations`, **0 disagreements**; arm 3 over
all 4,394 alias keys, **0 disagreements**. `lawmind_citation_keys`' body read out
of `pg_get_functiondef` is byte-identical to the arm it replaces, and
`judgment_citation_aliases` is 4,394 rows over 4,394 distinct keys — at most one
judgment per key, so the constructed array is one element.

`services/api/src/judgments/citations.ts` shares the fragment for paragraph-level
`citesJudgmentId` and is fixed by the same edit. qlang parse/explain +
judgments/citations: **45/45**.

**Migration 0056 still has NOT landed** — ~190 attempts across two runs. The
classifier convoy drained overnight but ingest INSERTs resumed; the table never
went quiet for the migration's own 3 s `lock_timeout`. Nothing half-applied
(columns absent, constraint absent, view absent, `blocked=0`).

**A correction to yesterday's entry:** the four hour-long `UPDATE judgments SET
hc_document_class` statements that blocked it were **LCC's own orphaned
`hc-classify-boot` workers**, not NEW2's live classifier (NEW2, bus 0733).
Stall-killed twice, restarted five times — and *killing a client does not kill
its statement*, so `supervise.mjs`'s restart loop added writers rather than
replacing them. I attributed them from the statement text without checking
whether a client was still attached. Corrected to NEW2 in bus 0749.

### 18 Aug 2026 — THE 620k CHUNK PLATEAU IS A FOUNDER DECISION, STILL IN THE BUS

**The most important finding of this pass is that there was no bug to find.**
`judgment_chunks` has held ~620,300 while `judgments` reached 14,973,372, and
the cause is bus 0132–0135, 13 Aug 2026, broadcast to every lane:

> FUND CHUNK-TEXT COVERAGE NOW. START EMBEDDINGS ONLY once we hold all available
> data from all courts, ALL cases and citations are in, and the data is
> STRUCTURED and ready. … **nobody should treat missing vectors as a defect — it
> is a deliberate ordering.**

Everything downstream obeyed it: `judgment_paragraphs` holds **41,973,136** rows,
built *instead of* vectors (migration 0049), and `judgment_chunks` was frozen on
purpose. The 18 Aug directive re-sequences that decision;
`docs/ai/EMBEDDING_ELIGIBILITY_CONTRACT.md` §0 records the reversal rather than
overwriting it, so the next agent to meet a static number does not spend a
session hunting a defect that does not exist.

The pipeline was checked, not assumed. `services/embed/src/cli.ts` is resumable
and idempotent. It has two real defects — an unbounded anti-join plus sort for
candidate selection (observed running on the box at 169s), and no eligibility
notion at all — and neither is why the number is static.

**LANDED THIS PASS**

| | |
|---|---|
| `expandCategories` full scan | **FIXED.** `SELECT DISTINCT court` planned as a parallel index-only scan of 15,191,513 entries and ran on **every** search, not only filtered ones — `unpopulatedCategories` is on every response. Loose index scan, taken from NEW1's `arms-cli.ts`. **79.9 ms cold / 1 ms warm**, route shape 422 ms cold / 1 ms warm p50, suite 11,272 ms → 354 ms. Equivalence proved against `pg_stats` (n_distinct 26, MCV 26) rather than by paying for the scan. Bus 0715. |
| `scripts/resource-gate.mjs` | **BUILT**, 14 tests. Five classes with **independent** verdicts — the CX1 ladder cannot express "GPU_EMBED ALLOW while DB_SCAN DEFER", which is the whole ask. Measured live: GPU_EMBED ALLOW (GPU 8%, VRAM 7,382 MiB free) while DB_SCAN and VECTOR_BUILD DEFER. Shallow by default because full collection measured **3.1 s / 15.2 s / 31.9 s** on three consecutive tries. |
| Embedding eligibility contract v1 | **WRITTEN**, `docs/ai/EMBEDDING_ELIGIBILITY_CONTRACT.md`. Four independent axes; **UNKNOWN is never BAD**. Tier A ≈ **8.49M** documents (≥2,000 chars), Tier A core ≈ **3.80M** (≥4,000), from a 0.2% sample. |
| PostgreSQL log growth | **FIXED and verified.** 108,698,908 bytes for 18 Aug; `DETAIL: Parameters` was **96,289,111 B / 88.6%** at 70.9 KB per block, because `log_parameter_max_length` was `-1`. Capped at 512, live, no restart. Verified by probe: a 120,017-char parameter now logs as a **596-byte** truncated line. Slow-query identity, duration, fingerprint and lock waits all deliberately untouched. |

**BLOCKED, and it is a lock, not a decision.** Migration **0056**
(`script_quality` + the eligibility view) has failed **110+ attempts** over an
hour. It needs ACCESS EXCLUSIVE on `judgments`; NEW2 runs three overlapping
~45-minute classifier UPDATEs, staggered, so there is never an instant with no
lock holder. A ~5-second gap is enough and has been asked for (bus 0722). The
fleet has **not** been stopped for three columns.

**The retry loop was STOPPED after 150+ failed attempts over ~90 minutes**, not
left running. Two reasons: it was past any sensible attempt bound, and each
lock-timeout ERROR logs the whole ~11 KB migration file as `STATEMENT` — ~1.3 MB
of log volume on the day the log was being cut. The migration is re-runnable and
is now an explicit ask on NEW2 rather than a background process nobody is
watching. Confirmed on stop: no stray backend, nothing half-applied.

**Also landed:** `scripts/pg-hide-consoles.ps1` was retired in a document this
morning and remained fully executable, including a `while ($true)` watch loop —
`check-stop-coverage.mjs` went RED for exactly that reason and was right to. It
now refuses on the STOP sentinel and refuses again when `LawMindPostgres` exists,
and is kept as documentation per `FOUNDER_QUEUE.md` rather than deleted. Guard
back to PASS, verified by executing it.

**Two gate failures remain and neither is from this pass:** `lint` (9 errors in
`scripts/migration/new2-fleet-view.mjs`, `regenerate-generated-columns.mjs`,
`services/api/src/search/hyde.test.ts`, `rerank-passages.test.ts`,
`services/harness/src/adversarial.ts` — all other lanes'; my files lint clean)
and `alert coverage`, red since 11 Aug on the PD-5/PD-6 gap.

**READ THIS BEFORE RUNNING ANY DDL ON `judgments`.** The first attempt was run
the ordinary way. It could not get the lock, so it waited — and **a waiting
ACCESS EXCLUSIVE request blocks every lock request queued behind it.** Twelve
ingest INSERTs and a paragraph write stalled behind a statement that had
acquired nothing and changed nothing; the fleet stopped for two minutes because
a migration was being patient. Nothing applied, cancelled clean. The fix is
`SET LOCAL lock_timeout` inside the migration and
`scripts/apply-migration-online.mjs`, which **refuses** any migration file
lacking one.

### 18 Aug 2026 — 39 TOOLS COULD NOT OPEN THE DATABASE, AND 80% OF "AMBIGUOUS" CITATIONS ARE ONE DECISION

**Post-cutover the corpus is at `127.0.0.1` with `ssl = off`, and 39 tools still
demanded TLS.** Two wrong tests: `ssl: 'require'` hard-coded (12 files) and
`ssl: url.includes('localhost') ? false : 'require'` (27 files) — the URL says
`127.0.0.1`, so the substring never matches. All 39 died with `ECONNRESET` inside
the driver, before their first query. NEW1 had already fixed this in their lane
17 Aug (`services/harness/src/db-url.ts`); it had never been applied elsewhere.
**36 fixed** across `services/ingest`, `services/api`, `services/embed` via a
per-service copy of their `sslFor()`; typecheck clean in all three. Two remain and
are NEW1's (`scripts/measure-recall.mjs`, `baseline-extra.local.mjs`) — bus 0680.

`dedup-materialize-cli.ts` was one of the 39, which is why
`document_duplicate_groups` holds 563 groups against 104,930 affected judgments.
**A tool that fails before its first query looks exactly like a job nobody ran.**

**The 45,153 ambiguous neutral keys are measured and split**
(`docs/ai/AMBIGUOUS_CITATION_POPULATION.md`): **36,310 keys / 104,930 judgments
(80.4%) are ONE decision** — every member byte-identical by `content_hash`. That
is the common-order shape `CANONICAL_IDENTITY.md` §1 already names.
`resolve-cli.ts` guard #1 refuses all of them, which is CORRECT under
`CITATION_HARNESS.md` §A3d.4 — **nothing points at the wrong petition** — but it
is pure recall loss.

The circulating "~8,843 true conflicts" is exactly B+C, and **most of B is not a
conflict**: sampled members are OCR variants of one title (`COMMISSIONER OF
IINCOME TAX`, `ONCOME TAX`, `COMMISSONER`). 34.4% of B collapses to one normalised
title; 55.5% holds texts within 10% by length. **Irreducible conflicts are ~2,000
keys, not ~8,800.**

Design settled without a new table: an ambiguous key whose members all sit in ONE
exact-duplicate group resolves to that decision; anything else keeps refusing.
**Resolver change deliberately NOT implemented this pass** — it is harness-adjacent
and needs its own INTENT line and its own recall measurement.

### 18 Aug 2026 — FQ-PGSERVICE IS CLOSED; POSTGRES RUNS AS A SERVICE AND THE CONSOLE CLASS IS GONE

**The founder granted elevation in session, so the item below did not stay
queued.** `pg_ctl register -N LawMindPostgres -S auto`, then a controlled cutover:
`pg_ctl stop -m fast` (clean, 18s, no crash recovery) and `Start-Service` (3s).

| | before | after |
| --- | --- | --- |
| postgres consoles | 37, one per child | **1**, the postmaster's |
| reachable by a user | 37 | **0** — all session 0 |
| postgres taskbar windows | 33 | **0** |
| starts after | logon only | **boot** |

Every postgres process is now in **SessionId 0**, which has no interactive
desktop: the windows are not hidden, they **cannot be created**. `pg-service-verify`
reports **9/10**, the one FAIL being the pre-fix 04:22 crash still inside its 24h
**The fleet survived the restart with no worker lost** - all 8 process chains
intact, on the transient-SQLSTATE retry (`services/ingest/src/db-transient.ts`).
**7 of 8 scopes were writing again within seconds. `3_22` was not**, and the
aggregate would have hidden it: it reconnected on the same `57P03` retry but
restarted its pass on a different year partition and took ~18 minutes to write
its first rows, now running 0.9 docs/s against 35.2 before the restart. Whether
it resumed from its checkpoint or re-walked is NEW2's to confirm.

**Three follow-ons, because a fix the next agent can undo is not finished:**
`pg-local.mjs start`/`spawn-detached` now REFUSE when the service exists (their job
is to spawn a DETACHED postmaster, which re-creates the per-child consoles);
`isRunning()` no longer trusts `pg_ctl status` — **measured minutes after cutover it
said "no server running", exit 3, while the DB was accepting connections**, because
an unelevated `pg_ctl` cannot open a LocalSystem process in session 0, and `start()`
branches on it; and the `LawMindPostgres` scheduled task is **disabled** (boot beats
logon). `scripts/pg-hide-consoles.ps1` is **retired** — it was the unelevated interim.

**READ THIS IF YOU TOUCH THE CLUSTER:** `pg_ctl status` and `pg_ctl stop` now need
elevation to see or signal the postmaster. Use `sc start/stop LawMindPostgres`, or
`node scripts/migration/pg-local.mjs status`, which asks the service first.

### 18 Aug 2026 — THE TASKBAR STORM WAS THE DATABASE, AND `0xC000013A` IS NOT OOM

**Item 3 above says `pg-service-verify` is 7/7 and the console problem is closed.
It is not, and the reason it looked closed is worth keeping.** That check asks
about the POSTMASTER's parent. `DETACHED_PROCESS` fixed the postmaster and
**moved the console down a level** rather than removing it: a process with no
console that spawns a console-subsystem child does not pass a console down —
**Windows allocates a new one for the child.** So every backend, autovacuum
worker, io_worker, wal_writer and bgworker holds its own signalable console, and
on Windows 11 each is also a taskbar window titled with the server binary path.

**33 of the 43 visible windows on this desktop were PostgreSQL child processes.**
The founder's screenshot was not the ingest fleet — `start-ingest-fleet.ps1`
launches hidden with redirected stdio and contributes zero windows at any width.

That makes the storm and the restarts ONE bug: closing such a window delivers a
console event, the backend exits `0xC000013A` (`STATUS_CONTROL_C_EXIT`), and the
postmaster restarts the whole cluster and takes the fleet with it. Every recorded
kill hit a **child**, never the postmaster — 17 Aug 00:39, 17 Aug 06:45, 18 Aug
04:22 — which is what this mechanism predicts and what memory exhaustion does
not. **NEW2's OOM hypothesis is refuted as the cause** (bus 0677); the width
correlation was real but indirect, via connection count.

Landed: `scripts/pg-hide-consoles.ps1` (hides the windows, signals nothing,
`-Restore` undoes it; 43 → 10 windows, fleet uninterrupted), the false comment in
`pg-local.mjs` corrected, two new checks in `pg-service-verify.mjs` (`child
consoles`, `console windows hidden`), and `docs/ops/PROCESS_TOPOLOGY.md`.
**FQ-PGSERVICE is now the fix for both problems** — the unelevated S4U/session-0
route was tried and refused.

### 18 Aug 2026 — NEW1: THE POST-0055 BASELINE, AND `adversarialPassRate` MEASURED FOR THE FIRST TIME

**Added by NEW1 (retrieval lane). Nothing in LCC's ordering below is changed.**
Full detail `docs/ai/NEW1_POST_0055_BASELINE.md`, machine-readable
`docs/ai/new1-post-0055/`.

1. **0055 is QUALITY-NEUTRAL. Recommendation: do not revert.** `recall@20`
   17.0% -> 18.0%, and paired on the frozen 283 that is +11/-8, McNemar exact
   **p = 0.6476**. Nineteen queries changed state in each direction: 0055 changed
   *which* queries succeed, not *how many*. It should be kept for the latency it
   buys, and never recorded as a quality win — which LCC already said.
2. **The dense arm is unchanged by a 30.7% larger corpus** — `recall@20` 40.6%
   both times, **zero discordant pairs across 283 queries**. Because
   `judgment_chunks` has not moved: **620,300 embedded, `count(*)`, on both
   14 and 18 August**, while `judgments` grew 2.24M. 8.9M documents cannot be
   retrieved semantically at all. That number, not storage, is the scale decision.
3. **The sparse arm's cost is a SEQUENTIAL SCAN, not a GIN probe.** At `LIMIT 40`
   the planner abandons `judgments_full_text_idx` and reads all 9.3M rows; at a
   5% union budget it goes back to the index on 5 of 5 sampled queries, at 30/30
   filter recall. Sent to LCC as bus 0679/0686. `retrieve.ts` untouched from this
   lane.
4. **`expandCategories` is a full index scan on the `POST /search` path** —
   `SELECT DISTINCT court FROM judgments` ran **>8m56s and was cancelled**; a
   loose index scan returns the same 26 courts in **716 ms cold / 1 ms warm**.
   LCC's module; only `arms-cli.ts` was changed here.
5. **§110 of this file is half wrong, and so was §8a of the previous baseline.**
   `OPENROUTER_API_KEY` **is** set (73 chars) and **live** — `GET /api/v1/key`
   returns 200. `ANTHROPIC_API_KEY` is **not** set. Both errors came from reading
   `process.env` without `--env-file=.env`.
6. **`adversarialPassRate` produced a number for the first time: 0.0%**
   (worst-of-5, threshold 1). It was never key-blocked — `generate()` routed to
   InferX whenever `INFERX_API_KEY` existed and had no fallback, despite its own
   comment promising one; InferX answered 1 call and failed 24 with
   `429 all replicas at capacity`. Fixed, and OpenRouter is now primary whenever
   InferX cannot serve (founder direction, 18 Aug).
   **Two of the five failures are genuine** — adv-5 (the refusal never mentions
   the offence date or 2024; the model reasons purely in IPC and does not hold
   the BNS/BNSS/BSA cutover) and adv-1 (right refusal, wrong law). **Three are
   grader defects**: `mustNotProduce` is a bare substring test that fires inside
   correct refusals, including on a negation. `adversarial.json` was deliberately
   **not** changed — weakening a Gate S2 pass condition on the strength of my own
   failing run is not mine to do alone. Proposal in bus 0705.
7. **CX1's embedding scenarios are priced at 1 vector per document; the index has
   15.45.** TIER_A is **13.5M vectors, 70 GiB halfvec / 173 GiB fp32**, not 1.7M
   and 9 GiB. Broadcast as bus 0697-0700.

8. **FUSION IS SETTLED, and my own hypothesis was wrong.** All three arms closed:
   dense 21.9 / 40.6 / 0.154, **hybrid 18.7 / 37.8 / 0.133**, sparse 10.6 / 18.0 /
   0.069. Hybrid still loses to dense on every metric after 0055. The "RRF rewards
   arbitrary agreement" reading does **not** survive — displacers were
   sparse-agreed 49.4% against a 46.2% base rate, no signal. With all 20 ranks per
   arm: **gold was found by DENSE ONLY in 22 of 22 damaged queries (100%)** and
   47.1% of displacers are documents *sparse alone* returned at sparse rank 1-2.
   It is arithmetic — `k=60` makes sparse rank 1 (0.01639) outrank dense rank 3
   (0.01587), so an arm at `recall@20` 18.0% is interleaved 1:1 with one at 40.6%.
   **Rules out HNSW parameters, `annDepth`, agreement weighting and candidate
   truncation. Names arm weighting, or removing sparse from fusion** — the latter
   is LCC's and the founder's call, not this lane's. Bus 0713.

Still open in this lane: the sparse-weight sweep the fusion verdict predicts
(offline, against the existing checkpoint), one unopposed latency pass,
`structuredExactness` / `fieldPrecision`, and halfvec C3/C4. Not started:
cross-lingual (P7) and provider teacher evaluation (P8).

### 18 Aug 2026 — THE SPARSE ARM ASKED THE WRONG QUESTION, AND CITATION KEYS EXIST FOR THE FIRST TIME

**1. `sparseAny()` selected query terms by LENGTH and the proxy was false.**
NEW1 measured it (bus 0664): `court` is five characters and appears in **90.7%**
of documents; the terms that discriminate are also five characters and were being
discarded. Of 40 length-selected terms, 3 appeared in ≥50% of the corpus and 21 in
<5%. The resulting OR'd tsquery matched **94.1%** of the corpus, and
`ORDER BY ts_rank(...)` over that set cost **781,289 ms** against **4.47 ms** for
the same filter unranked — `ts_rank` must read the `tsvector` of every matching
row, so the ranking is the expense, not the probe.

Fixed by measuring the corpus instead of guessing at it: migration `0055`
`lexeme_document_frequency`, built by
`services/ingest/src/lexeme-frequency-cli.ts`. **128,243 lexemes over 40,537
sampled documents, 24 above 50%.** My build reproduces NEW1's number independently
(90.7% against their 90.6%).

**This is a LATENCY change with NO demonstrated quality effect, and it must not be
recorded as one.** Narrowing a candidate set can cost recall, and recall is the
already-failing axis. **NEW1 owns the benchmark**; `recall@20` is the gate and
`SPARSE_MAX_DOCUMENT_FREQUENCY` is the single revert point. An empty frequency
table degrades to exactly the old behaviour, so CI is unaffected.

**2. `judgment_citation_keys` is populated — 1,104,005 keys, 99.80% of the
key-eligible population, 0 duplicate row groups, 0 yearless.** Full detail in
`docs/ai/CITATION_KEY_BACKFILL.md`.

The finding: **45,153 distinct keys are ambiguous and every one is
`source='neutral'`** — zero reporter or alias ambiguity, which needed explaining
because a neutral citation is unique by construction. Splitting by distinct
judgment TEXT per key explains it:

- **36,310 (80.4%) are one text recorded once per connected petition** — a common
  order. `2025:CGHC:57112` is 845 writ petitions, 845 case numbers, 845 source
  URLs, **one** `content_hash`, one date. Ordinary High Court practice, not bad
  data — **but the harness cannot serve it**: `exactCitation` sees 845 candidates,
  "not exactly one", and pins nothing for a correctly-cited order. The fix is
  judgment identity (`content_hash` already proves it, `document_duplicates` from
  `0036` is the machinery), **not** relaxing the resolver. Not implemented.
- **8,843 (19.6%) are genuinely different texts sharing one citation.** A real
  conflict; the refusal is correct and must survive any duplicate-collapsing work.

**3. `hc_ingest_ledger` (`0047`) had never been written by anything.** Applied,
indexed, documented, zero rows — cost 15,869 `pdf_missing` 404s per restart on one
scope against ~21 recoverable documents. NEW2 wired it (bus 0667). A migration
applied and never wired is indistinguishable from one that works, and the journal
guard cannot see it: it catches "the migration never reached the database", not
"the database never reached the code".

**4. PostgreSQL crashed and self-recovered** (~4 min, ready 02:40:47). **No data
lost** — `judgment_citation_keys` is byte-identical either side. **No crash line
in the log**, which points at a hard kill rather than a Postgres fault; RAM was at
**5.7% free with 71 node processes** shortly before. OOM is the hypothesis that
fits and is *not* asserted as fact.

### 17 Aug 2026 — THE MIGRATION JOURNAL WAS DRIFTED BY NINE, NOT SEVEN, AND `ci:local` COULD NOT SEE IT

Reconciled, and the drift was worse than reported in the founder's addendum.
Every number here is read from the database or from `git`, not inferred:

| what | state found | state now |
| --- | --- | --- |
| migrations in `meta/_journal.json` | 45 (ended at `0046`) | **54** |
| migration files with no journal entry | **9** — `0030`, `0033`, `0047`–`0053` | 0 |
| migration files untracked by git | **7** — a fresh clone never received them | 0 |
| rows in `drizzle.__drizzle_migrations` | **0** | 52 |
| `0033` applied anywhere | **never** | applied, 1984ms |

Three facts that matter more than the counts:

1. **`ci:local` was green throughout, and green *because* of the gap.** Drizzle's
   migrator reads the journal and nothing else, so an unjournalled `.sql` file is
   not a pending migration — it is a file the migrator has never heard of. The
   two `migrate` steps built a scratch database correctly from the 45 entries they
   could see, agreed with themselves, and passed.
2. **The empty ledger was a live hazard.** `migrate` against Gold would have
   replayed all 54 from `0000` and aborted partway on `0036`'s bare `CREATE TYPE`
   (no `IF NOT EXISTS` exists for it in PostgreSQL), having taken locks on a 65 GB
   table on the way.
3. **`0030` and `0033` sit mid-sequence, so they could not simply be appended.**
   Drizzle applies journal ARRAY order and skips on a single `created_at`
   high-water mark; an appended `0030` would run after `0046` on a fresh database
   and never at all on an existing one. Both were inserted in numeric position
   with a `when` between their neighbours.

The earlier note at §6 of the 12 Aug entry — *"the `0033` slot is long taken;
applying this file under its current number would collide"* — **was wrong**. No
other file and no journal entry used `0033`; the numbers are unique and
contiguous. It has been journalled in its own slot and applied. Both columns are
nullable and nothing writes them yet, so this is storage arriving ahead of the
feature, not the feature.

**Two guards so this is mechanical from now on:**

- `scripts/check-migration-journal.mjs` — files ↔ journal ↔ git, plus ordering,
  contiguity and `when` monotonicity. Wired into `ci:local` **ahead of** the
  `migrate` steps, because those two cannot see this class of defect. Verified in
  both directions: it reports all nine against the pre-fix journal and passes
  against the current one.
- `scripts/migration/journal-replay-check.mjs` — replays the whole journal into a
  throwaway database and diffs it against Gold **in both directions**, using the
  same `manifest`/`compare` pair the cutover was decided with. The reverse
  direction is the one that matters and it is clean: **Gold holds nothing that no
  migration produces**, so a rebuild from this repo loses nothing.

Remaining difference between a fresh database and Gold is exactly `0052`'s three
objects, which is correct until it lands — see below.

Three things are open, and none of them is data:

1. ~~**`cite:` search does a full sequential scan**~~ **CLOSED 17 Aug 12:55 —
   `0052` applied and measured.** `exactCitation` **15.31 s → 0.1 ms**,
   `exactCaseTitle` **47.85 s → 0.0 ms**, rows IDENTICAL to the shapes they
   replace on every probe. Both indexes built `CONCURRENTLY` out of band (GIN
   59.8s/11 MB, btree 521.0s/425 MB) so the resuming fleet was never write-blocked,
   after which `0052` ran as a no-op through its own `IF NOT EXISTS`.
   `docs/ops/migration/HOTPATH_MEASUREMENTS.md`.

   **The finding worth more than the numbers: the first AFTER run showed no
   improvement at all, and that was missing statistics, not a failed index.** A
   new expression index carries no `pg_statistic` rows until the table is
   analysed again; with no selectivity estimate the planner assumed matches were
   common and that `LIMIT 2` would terminate a seq scan early (cost 163.86 against
   the index's 214.23). `ANALYZE judgments`, 7.5 s, took the same query to 7.49.
   **Any expression index on a populated table must be followed by `ANALYZE`
   before it is measured or judged** — neither `CREATE INDEX` nor `CREATE INDEX
   CONCURRENTLY` does it. This is exactly the trap NEW1 predicted in bus 0592.

   Two defects were fixed on the way, both of which would have made this a hard
   `500` on every `cite:` query rather than a slow one: `retrieve.ts` and
   `hotpath-measure.mjs` each carried an un-parenthesised `LIMIT … UNION … LIMIT`,
   a **parse** error (`42601`) that no migration clears. NEW1 found the first
   (bus 0638); the second was in the tool that measures this very migration.
   Guarded by `services/api/src/search/exact-lookup-parse.test.ts`.
2. **tsvector tokenisation differs on 119/28,425 sampled rows** — `full_text`
   byte-identical (md5). ~~cause is *malformed* visual-order Devanagari~~
   **THE STATED MECHANISM IS PROBABLY WRONG, and the problem is much larger than
   this line implies.** NEW2 characterised the text itself (bus 0632,
   `docs/DEVANAGARI_EXTRACTION_DEFECTS.md`): **~40,000 rows carry Devanagari at
   all (0.54–0.58%), and 65.1% of those are defective.** The 119/28,425 measured
   *tsvector divergence between two servers*, which appears only where two
   `unicode` builds disagree — a strict subset of the damage.

   It is **three** defects, not one, and they do not have one remedy:

   - **orphaned matra**, 47.1% — the vowel sign is *detached and floated between
     two spaces* (`प्र` + SPACE + `ा` + SPACE), not reordered. Visual-order
     streams put the matra *before* its consonant with no space, so visual order
     is likely not the mechanism. **Repairable by normalisation.**
   - **control character where the consonant should be**, 26.8% — `U+0015`
     replacing the base consonant, vowel sign left behind. **NOT repairable by any
     normalisation or tokeniser change: the information is destroyed, not
     displaced.** Re-extraction or OCR, or nothing.
   - **Latin-1 bleed**, 13.7% — an 8-bit legacy font (Kruti Dev family) passed
     through unmapped.

   Extremely uneven by court: **Rajasthan 95.3% across 2013–2026** (that
   registry's PDF production, not one bad year), Allahabad 35.1% but the largest
   population, **Patna 0.0%** as the control. `text_extraction_method` is `unpdf`
   on all 395 sampled, so **the extractor is a constant and the defect cannot be
   attributed to it from this data** — and Poppler has never been tried on the
   population that most needs it. That is the next experiment and it needs
   document fetches, not a database.
3. ~~**The local server keeps dying to Windows console signals**~~ **CLOSED
   17 Aug 12:20 — `pg-service-verify` is 7/7.** The postmaster was restarted onto
   a direct detached `postgres.exe` spawn, so it has no `cmd.exe` parent and no
   console for a control event to reach: `no console parent  PASS  parent pid
   17072 is gone`, against `FAIL  postmaster 27764 has LIVE cmd.exe parent 6848`
   an hour earlier. **FQ-PGSERVICE stays open** — the auto-start task exists and
   is Ready, but fires at LOGON rather than at boot, so an unattended reboot still
   comes up with no database until someone signs in. That needs the one elevated
   `pg_ctl register` command.

**16 Aug 2026 — THE RAILWAY→LOCAL MIGRATION OUTRANKS EVERY ITEM BELOW, AND IT
IS BOUNDED BY MONEY, NOT BY THROUGHPUT.** The chunked dump is running and
resumable; `judgments` (256/256) and `judgment_paragraphs` (256/256) are
complete, `judgment_chunks` and the 50 small tables are what remain. The live
state, the exact continuation commands and the cutover gate are in
`docs/ops/migration/MIGRATION_RUNBOOK.md` §7b — **not here**, because that file
is the one a fresh agent is pointed at.

The one fact that changes decisions: **workspace usage is $71.69 against a $75
hard limit**, and Railway's hard limit takes *all* workloads offline. Finishing
the dump and taking the Railway-side exact row counts both fit inside the
remaining $3.31; keeping Railway alive as the rollback path through the local
restore does not. That is filed as **FQ-CAP** in `docs/FOUNDER_QUEUE.md` with
the arithmetic. **No lane may resume enrichment, citations, paragraphs, the
resolver or any DeepSeek call until the migration verifies** — the freeze is
what makes the per-chunk snapshots mutually consistent, and a single write
invalidates the dump.

> **The ordering rule, and it is not negotiable.** `docs/GTM_INDIA.md` §9: Gate S2
> passes **before** the ground campaign. A field campaign against 2 million
> advocates is a one-shot instrument — an advocate who finds a citation they
> cannot rely on and says so in the bar room has cost us that bar room
> permanently. **The ground game amplifies whatever is actually there.**

**12 Aug 2026 — a separate, unbound acquisition/discovery session (not LCC,
not RCC) ran the founder's NEW3 data-moat brief and left four new files:
`docs/SOURCE_REGISTRY.md`, `docs/MISSING_AUTHORITY_QUEUE.md`, `docs/
CORPUS_ACQUISITION_QUEUE.md`, `docs/ACQUISITION_SESSION_LOG.md`.** Nothing in
this queue changes as a result — no ingest was run, nothing was purchased —
but the missing-authority finding is worth reading before the next citation
or ingestion pass: the corpus's 32,383 unresolved external citations are
99.6% SCC/AIR references to Supreme Court judgments almost certainly already
held under a different citation form (the already-open SCC/AIR↔S.C.R.
concordance item, re-measured bigger), not a document-acquisition gap. Full
account and a founder-queue note: `docs/FOUNDER_QUEUE.md` "NOTE FROM THE
ACQUISITION/DISCOVERY LANE".

---

# Q · THE VERIFIED QUEUE — every open item, checked against the running system

**Rebuilt 10 August 2026. Read this before §0 and before §A.** It exists because
the previous drift began with a plan written from memory: a target nobody had
checked was achievable, and claims that had quietly stopped being true.

**Every line below was verified the day it was written** — table counts by query
against production, module existence by `ls`, behaviour by running the tests.
Nothing here is recalled. Where a claim could not be verified it says so.

## Q0 · SEVEN CLAIMS IN THIS REPO THAT WERE FALSE OR STALE

Found by checking, not by reading. **This is the reason to distrust an unticked
box and go look.**

| claim, as written | what is actually true |
| --- | --- |
| §0: *"Gate S2 FAILING, success@5 17.3% against a 0.70 floor"* | **The floor was removed on 9 Aug.** `successAt5` is an ungraded diagnostic; the gates are `structuredExactness` and `fieldPrecision` at 1.0. **The most dangerous sentence in this file, now corrected** |
| §2: *"GATE S2 — everything else is downstream of this"* | Downstream of an **ungraded diagnostic**. The recall levers, HyDE measurement and reranker-settling under it are chasing a number that gates nothing |
| A2.4–A2.8 unticked | **All landed.** `qlang/compile.ts`, `qlang/explain.ts`, `structured.ts` exist; `route.ts` echoes `parsed` at lines 97 and 126; `structuredExactness`/`fieldPrecision` are in `metrics.ts` |
| A3c.1–5 and A3d.1–6 unticked | **All landed.** Verified in production: **4,097** rows in `judgment_citation_aliases` (SCC 3,877 · AIR 220), **81** flagged judgments, **13,389** treatment-carrying edges |
| `CONTINUATION_PROMPT.md` §6.6: *"Facets — contract slot documented, not built"* | **There is no contract slot.** Zero occurrences of "facet" in `docs/API_CONTRACTS.md` and zero in `services/**`. Not documented AND not built |
| §2: *"Three metrics stay NOT MEASURED until an LLM key exists — founder-queued"* | **`OPENROUTER_API_KEY` is set** (73 chars) and **verified live 18 Aug** — `GET /api/v1/key` returns 200, not free tier, no expiry. **CORRECTION 18 Aug (NEW1): `ANTHROPIC_API_KEY` is NOT set** — it appears only in a comment on line 11 of `.env`. The three metrics were never key-blocked; `adversarialPassRate` produced its first number on 18 Aug (0.0%, threshold 1) once `generate()`'s missing InferX→OpenRouter fallback was wired. `FOUNDER_QUEUE.md` §1 and §5 (the $65 GPU) are both stale — §5 was struck on 9 Aug when re-embedding was measured at 36.6 ms/chunk on local CPU |
| A3b.1 unticked | **Landed.** `refusingStore` and `objectStoreFromEnv` exist in `packages/storage/src/r2.ts`, and production with no credentials refuses to start |
| **This table's own wording: *"landed and applied to production"*** | **CORRECTED 11 Aug — it conflated three different things.** The **database** is production and was queried directly, so the row counts above are real. The **code** is not: `origin/main` is **43 commits behind** and the deployed API serves none of it. **Repo + DB ≠ deployed.** §Q1.0 |

## Q1 · THE QUEUE, in the order I would take it

Each item carries the two artefacts `CLAUDE.md` demands, so nobody has to invent
them later. **An item with no nameable VERIFY does not go in this list.**

### Q1.0 · THE DEPLOY GAP — 43 commits unpushed · RESOLVED 11 Aug 2026, task 001

**CLOSED. Kept below as the historical record — the reasoning is what keeps
the next incident consistent, and this one taught a real lesson.** The push
this section held back on was made this session (`origin/main` had reached
`0 0` with local before task 001 even began — that gap closed itself over the
course of the day). What actually kept P0 live past that point was a second,
separate defect: `.gitignore` and `.railwayignore` both silently excluded
`services/api/src/training/*.ts`, real source `app.ts` imports, from every
commit and every deploy upload since 9 Aug — so the deploy failed identically
whether pushed or not. Diagnosed from `railway logs`, fixed in two commits,
redeployed, verified against `/search` directly. Full account:
`docs/ai/tasks/001-p0-citation-query-safety.md` §RESULT,
`docs/ai/RETRIEVAL_PROGRAM.md` §BENCHMARK RESULTS step 6.

**Found by RCC on 11 Aug and independently verified by LCC the same day. RCC was
right on every point.**

`DONE:` `origin/main` carries this work and the deployed API serves it.
`VERIFY:` `git rev-list --left-right --count origin/main...main` reads `0 0`;
`POST /search {"query":"cite:\"(1994) 3 SCC 1\"","language":"en"}` returns
**S.R. BOMMAI** with a `parsed` field.

**Verified state, measured against the live API, not inferred:**

| check | result |
| --- | --- |
| `git rev-list --left-right --count origin/main...main` | **`0 43`** — origin is at `7bbde78`, 9 Aug 12:24 |
| `POST /search` `cite:"(1994) 3 SCC 1"` in production | returns **KAUSHAL KISHOR**, not S.R. Bommai |
| same response | **no `parsed`, no `total`** — structured search is not deployed |
| `GET /me/training-consent` | **404** |
| `GET /me/alert-settings` | **401** — route exists, auth rejects |

**The 404-vs-401 split is the proof**, not the 404 alone: both were called
unauthenticated, so a 401 means the route is deployed and a 404 means it is not.

**THE PART THAT IS A PRODUCT-SAFETY ISSUE, not merely a stale deploy.** In
production today an advocate typing `cite:"(1994) 3 SCC 1"` gets **a different
case returned as an ordinary result**, with nothing saying the query was not
understood. **This is precisely the failure A2.7 was written to prevent** —
*"structure decides, semantics fills, NEVER blended; zero structured matches
returns zero"* — and A2.7 is written, tested and **not deployed**. Nothing is
fabricated: every row is a real judgment with real citations from the corpus.
But *"these are the cheque cases"* is what a wrong-but-plausible result reads
as, and that is the whole reason the rule exists.

**Deploy safety was checked before recommending anything, and it is the safe
direction:** all three unpushed migrations (`0026`, `0027`, `0028`) are **already
applied to production**, along with the `ecourts_bulk` enum value and the
training-consent columns. **The database is AHEAD of the code, never behind**, so
a deploy finds the schema it expects. `@lawmind/storage` is a dependency of
nothing, so its refuse-to-start-without-credentials guard **cannot** break the
API boot.

**Why LCC has not pushed.** A push is outward-facing and shared, and it deploys
to the product an advocate uses. That is the founder's call, not an agent's.
**Everything needed to make it is above.** The deploy *mechanism* is
unverified — no Railway service is linked in this workspace and no doc records
whether a push auto-deploys.

**LCC's own correction, owed plainly.** This lane has been writing *"landed and
applied to production"*. For **migration `0028` that is exact** — the schema was
queried directly. For the **code** it was not: A2, A3c and A3d were verified
against the **repository and the database**, and the database is production, but
**the API serving requests is 43 commits old**. Repo + DB ≠ deployed, and §Q0's
own table repeats the conflation it was written to catch.

### Q1.0b · RE-RUN THE CITATION RESOLVER — ✅ APPLIED 11 Aug 2026 · 23.3% → 40.4%

**Found 11 Aug 2026 while answering the founder's question about the AWS corpus.
`docs/CITATION_STRATEGY.md` §0.** It is the largest available win in the product's
core promise and it needs **no new data, no purchase, no GPU and no ingest.**

`DONE:` `judgment_citations` resolution rises from 23.3% toward 49.1%, applying
the exactly-one-candidate rule.
`VERIFY:` `SELECT count(*) FROM judgment_citations WHERE cited_judgment_id IS NOT
NULL` moves from **44,785** toward **94,390**; the **11 ambiguous** keys resolve
to nothing.

**APPLIED. 32,815 edges resolved. 44,785 → 77,600, i.e. 23.3% → 40.4%.**

**A CORRECTION TO THIS LANE'S OWN FIRST NUMBER, recorded because the method
matters more than the result.** The first measurement said **49,605 resolvable
and 49.1%**. It was wrong, and **the database caught it**: the first `--apply`
died on `judgment_citations_no_self_citation`.

**16,790 of those 49,605 were SELF-CITATIONS** — an Indian judgment prints its
own citation in its header and headnote, the extractor sees it, and the key
matches the judgment's own row. The constraint refused every one. **No number
from that first pass should be quoted.**

| | |
| --- | --- |
| unresolved edges before | 147,412 |
| key matches something we already hold | 49,616 |
| **REFUSED: self-citation** | **16,790** |
| REFUSED: two or more targets | 11 |
| **RESOLVED** | **32,815** |
| resolution before → after | **23.3% → 40.4%** |

**Three guards, each of which refuses rather than guesses:** exactly one target
(`A3d.4`), the **year guard** (`A3d.2`), and **never overwrite** an existing
resolution. A fourth — self-citation — was added *because the database found it*,
which is the constraint doing the job constraints exist for.

**A second defect found and fixed in the same file:** the year pattern used
`\d`, which **does not survive a JS tagged template through the driver into
Postgres** — it matched nothing at all, silently, as an empty match set rather
than an error. `[1950] 1 S.C.R. 806` yielded no year. Replaced with `[0-9]`,
which contains no backslash and cannot be re-escaped, and verified directly:
38,431 corpus years extracted. **A guard built on a silently-empty regex looks
exactly like a guard that never needed to fire.**

**Two ordinary causes, not one exotic one.** The edges were resolved **before the
concordance existed** — all 4,097 aliases landed 9–10 Aug, and **16,848 edges
contain `AIR` and every one is unresolved**. And PDF-artefact normalisation:
`"(2014)14 SCC\n664"`, `"(1991) 1SCC598"`, `"[2023] 12 S.C.R.806"` collapse to a
key that matches; a stricter comparison does not.

**Worked example rather than an aggregate:** `[2010] 7 S.C.R. 79` is unresolved,
and *ADALAT PANDIT & ANR. versus STATE OF BIHAR* is in the corpus carrying it.

**The 11 are the safety story.** `A3d.4` already governs: **exactly one
candidate, or nothing** — a wrong alias is worse than a missing one. Resolving
49,605 and refusing 11 is the correct outcome, not 49,616.

**Also found: 13,834 unresolved edges carry an EMPTY `citation_text`** — 9.4% of
all unresolved, which can never resolve by construction. A separate extraction
defect, queued behind this.

> **CORRECTED 11 Aug 2026 — that sentence was wrong twice, and chasing it found
> something much larger. See Q1.0c.**
>
> They are **not a defect**. They are **sentinels**: `citations-cli.ts` writes one
> row with an empty `citation_text` to mark a judgment that cites nothing, so the
> resumable pass does not re-scan it on every run. The code says so at the line
> that writes them. Verified against production rather than read: **13,834 rows
> over 13,834 distinct judgments**, every one with `normalised_citation = ''`,
> `char_offset = 0`, unresolved — and **zero judgments carrying a sentinel beside
> a real edge**.
>
> **And they were never in "all unresolved" to begin with.** Counting them there
> understated citation resolution: **40.4% of all rows, 43.5% of real citation
> edges (77,600 / 178,363).** Both are arithmetically true; only the second
> answers *"of the citations we extracted, how many point at a judgment we
> hold"*. `resolve-cli` now prints the denominator every time it prints the
> percentage, so the figure cannot be lifted without the thing it is a
> percentage of.

### Q1.0c · THE EXTRACTOR WAS BLIND TO TWO CITATION FORMATS — 11 Aug 2026

**Found by pulling on the 13,834 sentinels above.** The question that opened it
was not *"is this a defect"* but *"is it plausible that 36.1% of Supreme Court
judgments cite nothing at all"*. It was not.

`DONE:` the extractor finds the citation forms the corpus actually contains.
`VERIFY:` `citations.test.ts` covers each form with a string taken verbatim from
a corpus judgment; `--rescan` reports the new edges before writing any.

**The defect was one asymmetry, in `services/ingest/src/citations.ts`.** The SCR
pattern accepted either bracket — `[[(](\d{4})[\])]` — and the SCC pattern
accepted **only round parentheses**. So `[2000] 5 SCC 573` matched nothing.
Neither pattern accepted the reports' own house style, **year first**:
`1976 (1) SCR 906`, `1996 (4) SCC 362`.

**The decade table is what made it undeniable**, and it also refuted the first
theory. These are not simply old OCR'd pages:

| decade | judgments citing NOTHING | share |
| --- | --- | --- |
| 1950 | 645 | 64.2% |
| 1960 | 1,886 | 59.5% |
| 1970 | 1,557 | 53.2% |
| 1980 | 1,300 | 48.1% |
| **1990** | **4,368** | **67.3%** |
| 2000 | 3,886 | 42.8% |
| 2010 | 192 | **2.4%** |
| 2020 | 0 | **0.0%** |

**The 1990s are worse than the 1950s and 2020 is perfect.** Age does not produce
that shape; a text source that changed does. Modern judgments print
`(2019) 4 SCC 221` and were never affected.

**Two false trails, both killed by reading the data instead of the aggregate.**

1. **92.7% of the zero-citation judgments contain a reporter abbreviation** —
   which looked like a 92.7% recall hole and was nothing of the kind. 12,725 of
   them contain `S.C.R.` because the **printed page header** reads
   `S.C.R. SUPREME COURT REPORTS 807`. A running header is not a citation. There
   is now a test asserting the extractor does not read one as such.
2. **Widening to the pre-independence reporters would not have paid.** The
   samples are full of `I.L.R. 25 Mad. 658`, `50 I.A. 227`, `5 A.C. 214` — Privy
   Council, colonial High Court and House of Lords. **We hold none of them and
   never will**, so those edges would resolve to nothing while inflating the
   denominator. Measured before building, per §1.

**The opportunity was measured before the fix was written**, on judgments that
already carried edges: **+23.9% more citations found (1,301 on 800 judgments),
48.5% of them resolving** to a judgment we hold. On the zero-citation population
the recovery is smaller and the resolve rate lower — 689 citations from 1,200
judgments, 16.4% resolving — because a judgment that cites nothing our corpus
holds stays unresolved no matter how well it is read.

**APPLIED 11 Aug 2026. The write matched the dry run exactly — 37,875 new edges,
2,594 sentinels cleared, to the row.** That equality is the point of §1's rule:
the dry run went through the same write path with the same guards, so there was
nothing left for the constraints to catch.

| | before | after |
| --- | --- | --- |
| rows in `judgment_citations` | 192,197 | **227,478** |
| sentinels | 13,834 | **11,240** |
| real citation edges | 178,363 | **216,238** |
| **resolved** | **77,600** | **97,876** |
| resolution, over citation edges | 43.5% | **45.3%** |

**+20,276 resolved edges, a 26.1% increase.** 13,880 resolved at extraction
against the in-memory index; the resolver then took another 6,396 using the alias
concordance, refusing 16,790 self-citations and 11 ambiguous keys — the same
guards, refusing the same way.

**The percentage is the least interesting number here and would have been the
easiest to oversell.** It moved 43.5% → 45.3% while the resolved count rose 26%,
because widening the extractor grows the denominator too. A pass that found only
resolvable citations would have looked better and been worse.

**Where the recovery landed, which is where the defect predicted:**

| decade | citing nothing, before | after |
| --- | --- | --- |
| 1990 | 67.3% | **54.4%** |
| 2000 | 42.8% | **25.3%** |
| 1980 | 48.1% | 44.6% |
| 1950 | 64.2% | 64.1% |

**The 1950s barely moved, and that is correct.** Their citations are `I.L.R. 25
Mad. 658`, `50 I.A. 227`, `5 A.C. 214` — Privy Council and colonial High Court,
which we do not hold. Widening to reach them would have manufactured
unresolvable edges.

**Precision was read, not counted.** Twelve resolved edges sampled at random from
the 37,875 inserted, each printed with 180 characters of surrounding text: **12
of 12 correct** — the citation appears verbatim in a Case Law Cited block and the
target judgment's case title matches the name printed beside it, including the
OCR-mangled `[1972) 4 SCC 600`. Twelve is a spot check and a lower bound, not a
precision rate.

**A pinned test caught the change, and it had been waiting for it.**
`services/harness/src/build-queries.test.ts` carried a test literally named
*"SQUARE-BRACKET CITATIONS ARE INVISIBLE TO THE EXTRACTOR — a known gap"*,
pinned on 9 Aug as a failing expectation with the instruction *"the gap closed —
update this test and the note it carries."* **Somebody found this blind spot two
days earlier, recorded it precisely, and it stayed open.** The test is now an
assertion of correct behaviour.

**And half that note was wrong.** It recorded that `[2019] 4 SCC 221` *and*
`(2019) 4 S.C.C. 221` both extracted to nothing. Re-run against the pre-11-Aug
pattern set: the square bracket found **0**, the dotted form found **1**. The
dotted form always worked. **A note that overstates a defect sends the next
reader looking in the wrong place**, which is the same class of harm as
understating one.

**`ANALYZE judgment_citations` run after the write**, per the standing rule in
`SCHEMA_TRUTH.md` §Access paths — 35,281 net new rows change the planner's
selectivity estimates for every citation path.

**One assumption was checked rather than assumed**, because it was load-bearing:
the year-first rewrite added to `normaliseCitation` could have changed stored
`normalised_citation` values, and `ON CONFLICT DO NOTHING` would then have
double-inserted every citation in the corpus. `SELECT count(*) … WHERE
normalised_citation ~ '^[0-9]{4} \([0-9]{1,3}\) '` returns **0 of 192,197**.

**`--rescan` exists because `--reset` was the wrong tool.** Re-running the
ordinary pass reaches nothing (every judgment already has rows, so the resume
query skips it) and `--reset` would delete all 192,197 edges along with the
77,600 resolutions three passes of the resolver produced. `--rescan` re-reads
every judgment and inserts only what is new, and it is **dry by default**.

### Q1.1 · Publish coverage per court and per year — A3.6 · ✅ LANDED 11 Aug 2026

**Migration `0029` applied to production and verified. `GET /corpus/coverage`
built, 7 tests green against the real database.** `dcda5b9`.

**889 court-year rows across 25 courts, 20,529,202 documents**, loaded from the
survey and matching its totals exactly. **Re-running writes 889 again, not
1,778** — idempotency observed, not assumed. The gap is now queryable: **0 of
3,493,695 at Allahabad**, 0 of 1,528,665 at Bombay, 0 of 1,510,131 at Madras.

**A new table, not `corpus_coverage`.** That one is keyed `source PRIMARY KEY`
and answers *"has this source been fully enumerated"*; it cannot express
*"Allahabad, 2024"* without encoding two dimensions into one text key, which
would make counting by court and by year both unanswerable. A different **grain**,
not a replacement.

**The word this feature refuses to say is "judgments".** The column is
`source_documents`; the response carries `judgmentShareUnknown: true` and the
measured range `[0.0075, 0.1864]`. **A test asserts no field is ever named
`sourceJudgments`** — the negative control, because an endpoint checked only for
HTTP 200 would pass over a response claiming we hold every judgment in India.

`held` is **derived live**, never stored — a cached coverage count drifts the
moment an ingest writes a row, and a figure stale in the *reassuring* direction
is worse than none. `supremeCourt.sourceDocuments` is **null, not 0**: unknown is
a state, and 0 would say the source is empty.

**RCC needs the surface** — contract in `API_CONTRACTS.md` §Corpus coverage,
briefed in `RCC_CONTINUATION_PROMPT.md` §R3.

### Q1.1-OLD · the original entry, kept for provenance

`DONE:` `corpus_coverage` holds a row per court per year for the AWS High Court
buckets, and the judgments surface returns a `coverage` object beside results.
`VERIFY:` `SELECT source, source_total FROM corpus_coverage` returns 25 courts;
a search response carries `coverage`; contract updated in `API_CONTRACTS.md`.

**Verified state:** `corpus_coverage` exists (migration `0012`, used by
`statutes/route.ts`) and holds **exactly one row** — `indiacode_central_acts`,
845 acts. Its columns are `source · source_total · enumerated_at · complete ·
failed_ids · updated_at`, so it is keyed **per source, not per court per year**;
this item either adds rows per court or needs a shape change, and that is the
first decision inside it.

**Why first.** `SELECT court, count(*) FROM judgments` returns **one row —
Supreme Court of India, 38,341.** We hold **0 of 15,771,566** High Court
judgments and the product says nothing. `CLAUDE.md`: *silence about a gap does
the same damage as a fabricated citation.* The per-court numbers now exist
(`docs/HC_METADATA_SURVEY.json`), it costs nothing, and it needs no decision
from the founder. `/statutes` already returns
`coverage: { held, sourceTotal, complete, failedCount, enumeratedAt }` — an
established additive shape to copy rather than invent.

### Q1.2 · Fix two red tests that are red for different reasons

`DONE:` both green, or documented as a data finding.
`VERIFY:` `npx tsx --test src/*.test.ts` in each package.

- **✅ FIXED 11 Aug — `services/harness/src/generate.test.ts`.** It passed
  `apiKey: undefined` expecting the env to be empty, but that means *"fall back
  to the environment"* — the correct production behaviour — so with a real key
  configured it sailed past the refusal into the stubbed fetch and died on
  `SyntaxError: Unexpected end of JSON input`. **It passed only on a machine with
  no key.**

  **INTENT: the code was right and the test's way of simulating "no key" was
  wrong**, so the test now removes the variable and restores it. **Verified
  passing BOTH with a real key in the environment and under `env -u`** — one run
  each, because a fix asserted in only one environment is the same defect wearing
  a different hat. `services/harness` is now **101/101**.
- **`services/api/src/statutes/route.test.ts` — a DATA condition, not a code
  defect.** 22 of 845 acts have zero sections. See §4; **do not loosen the
  assertion to go green.**

  **✅ CLOSED 11 Aug 2026 — and NOT by loosening it.** The instruction above was
  followed: the 22 were audited **at the source** before the test was touched,
  then re-run through the full `acts` ingest. **22 Acts retried, 0 sections
  gained.**
  - **18 carry no section index on the indiacode Act page at all** (`sectionId=`
    × 0) — the colonial Bengal/Bombay/Madras revenue Acts, plus the Wealth-tax
    Act 1957 and the Gift-tax Act 1958.
  - **4 carry an index but `SectionPageContent` answers `{}` for every section**
    — Presidency-Towns Insolvency 1909 (130), Provincial Insolvency 1920 (87),
    Broach and Kaira 1877 (41), National Anti-Doping 2022 (34). This one is
    worth knowing: those are live insolvency provisions, and the index exists,
    so the gap could close on indiacode's side without any change here.

  `fetchSections` is behaving correctly on all 22 — it reports them `missing`
  and writes nothing, because a statute with an invisible hole is worse than one
  that visibly failed. The assertion now states the data condition instead of
  contradicting it: such an Act is still **LISTED** with `sectionCount: 0`
  (dropping it would be a silent drop — an advocate searching for the Wealth-tax
  Act would conclude we do not hold it), and **22 is a ceiling**, so the ingest
  breaking on Acts that DO have text still fails loudly.

- **✅ ALSO CLOSED 11 Aug 2026 — two api tests that were pinned snapshots,
  not defects.** `corpus/coverage.test.ts` asserted Allahabad `held === 0` and
  Supreme Court `held === 38_341`. High Court ingest landed 6 Allahabad rows and
  one more SC row, and both pins fired — correctly; the Allahabad one carried a
  comment saying it should be updated deliberately when an ingest landed.
  Replaced with the **invariants** rather than the next snapshot (coverage share
  < 0.1%; an SC floor), because HC ingest is a running job and a hand-edited
  number on a running job becomes an assertion people update reflexively.

  **`services/api` is now 400/400 across 54 suites**, up from 385/388.

### Q1.3 · Finish the R2 tiering path — A3b.3, A3b.4, A3.4, A3.5

`DONE:` a judgment's text round-trips to R2 as brotli through the metered store,
`storage_key` is written, and a vector blob supports a ranged read.
`VERIFY:` round-trip test against real R2; `SELECT count(*) FROM judgments WHERE
storage_key IS NOT NULL` is non-zero; a ranged GET returns 206.

**Verified state:** `getRange` exists and treats a 200 as an error. **Brotli
exists only inside `packages/storage/src/roundtrip.ts`, a live smoke-test
script** — there is no reusable codec module. **No `bit(` column exists anywhere**,
so A3.4's Tier-2 `bit(1024)` vector is not started. R2 credentials **are set**
(endpoint, bucket, access key), so this is testable today.

**Deliberately after Q1.1.** This is infrastructure for an ingest nobody has
decided to run, and storage was never the blocker — measured twice at under
$8/month.

### Q1.4 · Ingest High Courts — A3.2 · SUPERSEDED BY EVENTS, see below

**This section is historical.** The ingest this item planned already ran:
40,980 High Court rows landed in `judgments` (S1, 11 Aug), then were paused by
LCC — not by this decision, but because the corpus had no citation state for
what it was ingesting. That gap is task 002, now resolved (severity: warn,
`CITATION_HARNESS.md` §The fourth concern). **Resuming the ingest itself is
still separately blocked** — the autonomous-execution charter's §10 sets a
higher bar (provenance, content hash, dedup status, extraction confidence per
document) the current loader does not track. Current state:
`docs/ai/RETRIEVAL_PROGRAM.md` §BLOCKED.

<details><summary>Original planning entry, kept for provenance</summary>

### Q1.4 (original) · Ingest High Courts — A3.2 · BLOCKED ON A FOUNDER DECISION, see Q2

`DONE:` reasoned High Court judgments from the last 10 years in `judgments`,
resumable and content-hashed.
`VERIFY:` `SELECT court, count(*) FROM judgments GROUP BY court` returns more
than one row; `corpus_coverage` moves.

**Everything measurable about it is now measured** (`HC_CORPUS_SURVEY.md`,
`HC_EXTRACTION_COST.md`): 15,771,566 documents, extraction 4.2 days on eight
workers, OCR burden 0.2%, judgment share 0.75%–18.64%, PDF availability broken by
whole bench-years. **What remains is not measurable — it is the two questions in
Q2.**

</details>

### Q1.4b · TWO P0s AND A P1 FROM THE CLIENT LANE — ✅ ALL LANDED 11 Aug 2026

Not planned work; all three arrived from RCC or fell out of answering RCC, and
all three were in front of advocates.

- **`GET /documents` 500'd unconditionally** (RCC bus 0050, `c2da1b9`).
  `listDocuments` selected `m.title`; `matters` has only `case_title`, and
  Postgres rejects an unknown column at **plan time** — so the route failed on
  every call for every user regardless of data. The Drafts tab shipped as R4 and
  has listed nothing for anybody since; the client fails soft, so nothing looked
  broken. **The typo is not the lesson: no test called `listDocuments` at all.**
  Two now do.
- **A matter's saved authorities carried no good-law status** (RCC bus 0048,
  `dd9871b`). The one surface where an authority sits for months, and verified
  is silent in our UI — so a bare row read as "this is fine". Now joins
  `overruled_*` live on every read, never stored. Note for anyone reading bus
  0048: `judgments` has no `verification_state`/`verified_by_source` columns
  (they live on `citation_checks`/`verification_cache`), so those two are
  `verified`/`corpus` **by construction**, as on every other corpus-row surface.
- **`judgments.bench` held an S3 partition key on 51.3% of the corpus**
  (`51bd5f8`, migration `0040`). Found while answering RCC's bench-filter
  question. `harvest/hc-load.ts` wrote `bench: partitions.bench` — the AWS
  bucket's `bench=patnahcucisdb94` path segment, which names the court
  *establishment* — into the column the judgment screen renders as the **coram**.
  40,980 rows, every High Court judgment held, zero with a `judgment_judges`
  row. Opening any Patna judgment showed a database slug where the judges belong.
  Moved to `source_bench_code`; `bench` is NULL there now, which is the honest
  value — that metadata variant publishes no judge field.

  **The ingest test asserted `r.bench === 'patnahcucisdb94'` and passed for
  exactly as long as the bug lived.** A test that encodes the same mistake as
  the code is not a check.

  **Client consequence, sent as bus 0053:** `JudgmentDetail.bench` is typed
  `string` and now answers null on every High Court judgment.

### Q1.5 · Facets on `POST /search` — A2.6 remainder

**PARTIALLY LANDED 11 Aug 2026 — the court filter, not facet counts** (`1cefe6c`,
RCC bus 0046). `POST /search` accepts `filters.courts` as category codes
(`sc`/`hc`/`district`/`tribunal`) and expands them server-side; the response
carries `unpopulatedCourtCategories`. Facet **counts** are still not built —
that remains this item.

Two filters bus 0046 asked for were **refused with measurements, not deferred**:
`bench` strength needs a judge-count column that does not exist (see Q1.4b), and
**`subjects` has no subject/topic/category/tag column anywhere in the schema** —
an unbuilt feature, not a filter that does nothing.

### Q1.5-OLD · the original entry, kept for provenance

`DONE:` a search response carries facet counts; the contract documents the shape.
`VERIFY:` a `judge:` query returns counts by court and year that match a direct
`GROUP BY`.

**Verified state: NOT documented and NOT built** — zero "facet" hits in
`API_CONTRACTS.md` and in `services/**`. The handover doc's *"contract slot
documented"* is wrong. Contract work is part of this item, not a precondition.

### Q1.6 · `EXPLAIN ANALYZE` every new access path — ✅ LANDED 11 Aug 2026

**All five paths planned against the real corpus. `SCHEMA_TRUTH.md` §Access
paths.**

**THE FINDING: STATISTICS WERE A WEEK AND THREE MIGRATIONS STALE.**
`judgments.last_analyze` was **NULL** and `last_autoanalyze` was **4 Aug** —
before `0026`, `0027` and `0028` all landed. The planner had **no statistics at
all for `storage_key`** and was choosing plans from week-old data.

One `ANALYZE` per table changed the **plans**, not just the timings:

| path | before | after | |
| --- | --- | --- | --- |
| `storage_key IS NOT NULL` | **23.504 ms · Seq Scan** | **0.019 ms · Index Scan** | **1,237×** |
| `section:` + `act:` | 1.606 ms | **0.040 ms** | 40× |
| `cite:` alias lookup | 0.976 ms | **0.038 ms** | 26× |
| `judge:` name filter | 15.343 ms | **2.127 ms** | 7× |
| `/corpus/coverage` | 0.534 ms | **0.339 ms** | 1.6× |

**The partial index was never the problem** — `judgments_storage_key_idx`
existed and was correct. **An index nobody has analysed is an index the planner
will not use.** New standing rule recorded in `SCHEMA_TRUTH.md`: **run `ANALYZE`
on every table a migration touches, as part of applying it.** Autoanalyze fires
on write volume, and a migration that adds a column or an index changes the plan
space without changing a row.

**Why nobody would have seen it:** the Railway proxy costs **~770 ms per
request** and every number above is under 24 ms. The whole range is invisible
from the client — the same proxy-vs-server separation §2 insisted on before
quoting a reranker latency.

**Left as-is deliberately:** the `judge:` filter still sequentially scans.
`judgment_judges_name_trgm` exists, but `ILIKE '%name%'` over 44,360 rows costs
less as a full scan, and at **2.127 ms** the planner is right. **Re-plan when
High Court judges land** — forcing the index now would be optimising against a
measurement that says not to.

**Also fixed while the file was open:** `corpus_coverage` (migration `0012`) had
**never been documented in `SCHEMA_TRUTH.md`**, breaking that file's own opening
rule. Documented now, along with `judgment_coverage`.

### Q1.7 · The verification record — §3 moat

`DONE:` an advocate can see why a citation is trusted.
`VERIFY:` an endpoint returns the record for a judgment; a client can render it.

**Verified state: `citation_checks` holds 1,951 rows** and is referenced only
under `services/api/src/admin/**`. **Nothing advocate-facing renders it**, which
is exactly what this file already claims — confirmed rather than assumed.

### Q1.8 · Delete the Railway TCP proxy

`DONE:` proxy removed. `VERIFY:` the host stops resolving.

**Currently LIVE** — `hayabusa.proxy.rlwy.net:24909`, used on 10 Aug to apply
migration `0028`. Owed under `CLAUDE.md`, but **Q1.1, Q1.2, Q1.3 and Q1.6 all
need it**, so it is last on purpose.

### Q1.9 · DRAFTING HAS NO CREATION PATH — core feature #3 · found 11 Aug 2026

**Found while answering RCC's question "can I test `GET /documents/:id` against a
real row".** They could not, and neither can anyone: **`SELECT count(*) FROM
documents` returns 0**, and it will stay 0.

`DONE:` an advocate can produce a draft.
`VERIFY:` `POST /documents` returns a `documentId`; `SELECT count(*) FROM
documents` is non-zero; the citations on it are rows in `citation_checks`.

**There is no `POST /documents` in the API.** The routes that exist are
`GET /documents/types`, `GET /documents`, `GET /documents/:id`,
`PATCH /documents/:id`, `POST /documents/:id/citations` and
`DELETE /documents/:id/citations/:checkId`. Confirmed from the other direction
too: `generated_content` is written in **three files and all three are tests**.
Nothing in production code creates a draft, and `PATCH` exists to edit a document
that cannot be brought into existence.

**The contract is not the blocker.** `API_CONTRACTS.md` line 892 already specs
the shape and marks it `SPECCED`:

```
POST /documents { documentType, matterId?, language, inputParams }
               → { documentId, content, citations, unverifiedReferences }
```

**THE CHAIN, in the order it actually binds — and the top of it is not the DPA.**

1. `POST /documents` must call a model. Drafting is **sensitive-class** (party
   names, facts, the matter), so `CLAUDE.md` §5 requires pseudonymisation first.
2. **`callModel` refuses every sensitive call today**, deliberately and with the
   reason written into the code: *"This call requires pseudonymisation and no
   pseudonymiser exists yet. Refusing rather than sending raw sensitive text and
   recording `pseudonymised = true`, which would put a false claim in the audit
   ledger."* That refusal is correct and must not be routed around.
3. **So the gate is the pseudonymiser, and it is code, not a credential.**
   `PRIVACY_PII.md` §Pseudonymisation specs it: Presidio as the detection base,
   stable per-document tokens, an encrypted `pii_entities` map that is never
   transmitted, re-identification client-side.
4. **And the pseudonymiser's own first step is a MEASUREMENT we cannot take
   yet.** The spec is explicit: *"Evaluate Presidio on real Indian court
   documents before trusting it — a published F1 measured on English news text is
   not evidence about a Hindi bail order naming four transliterated surnames."*
   We hold no such documents. The judgments corpus is public-class and carries no
   client PII, so it cannot serve as the evaluation set.
5. **The countersigned DPA (OD-6) is a SEPARATE gate**, owed by the founder, and
   it binds *after* 2–4, not before. Fixing the DPA alone changes nothing here.

**What is buildable today without touching any of that:** the half of
`POST /documents` that needs no model — validating `inputParams` against
`documents/types.ts` `requiredFields` and refusing when a field is missing. That
module already states why it matters: *"a bail application drafted without the
section charged is not a weaker draft — it is a wrong one, and the advocate
cannot see what is missing because fluent prose fills the gap."* Shipping the
refusal without the generation would be an endpoint whose only production
behaviour is an error, so it is recorded here rather than built on its own.

**RCC has been told to stop adding to drafts.** `DraftsListScreen` and
`DraftDetailScreen` are built, tested and correct; they are waiting on this, not
on themselves. Bus message 0007.

### Q1.10 · TWO SETTLED ALERTS CANNOT FIRE — `scripts/check-alert-coverage.mjs` is RED

**Not found by reading. Found by running the repo's own guard scripts, which
nobody had run.** `check-alert-coverage.mjs` fails, and it is right to.

`DONE:` every alert PD-5 and PD-6 promise can actually be produced.
`VERIFY:` `node scripts/check-alert-coverage.mjs` exits 0.

`alert_kind` holds **exactly two values** — `saved_authority_moved` and
`filed_citation_moved` (`packages/db/src/schema.ts:226`). PD-5 and PD-6 require
two more and neither exists:

| promised | needs `alert_kind` | state |
| --- | --- | --- |
| a judgment lands in the advocate's own matter | `own_matter_judgment` | **does not exist** |
| a matter is listed on a date they did not know about | `unknown_listing` | **does not exist** |

**The switches are already in the product.** `users.alert_own_matter_judgment`
and `users.alert_unknown_listing` are real columns and `PATCH /me/alerts`
persists them, so **the app offers a toggle for a notification the system cannot
send.** PD-6's immediate exception — *"a newly discovered listing for
TOMORROW"* — is the one alert that exists to stop a missed hearing, and it
cannot fire at all.

**This is not a deferred feature; it is a settled decision the product silently
does not implement**, and the advocate finds out by missing a hearing. The
guard's own wording, and it is the right framing.

**Why it is queued rather than started:** the enum values are a migration, but
the producers are not. `own_matter_judgment` needs new judgments matched against
matters; `unknown_listing` needs cause-list data, which is the eCourts harvest.
Adding the enum values alone would make the guard green while changing nothing —
**exactly the kind of fix §Q0 exists to catch**.

### Q1.11 · Two more repo guards, one of which is RCC's

Run all four before believing a green session — none of them is in the test
suites, and three of four were failing:

| guard | state |
| --- | --- |
| `check-design-rules.mjs` | ✅ |
| `check-contract-status.mjs` | ✅ **FIXED 11 Aug** — the status cell must be exactly `BUILT` or `SPECCED`, and two rows read `BUILT — added 11 Aug 2026`. The annotation made the parser skip the row entirely, so both endpoints reported as *absent from the status table* rather than as badly formatted |
| `check-alert-coverage.mjs` | ❌ Q1.10 |
| `check-amber-reservation.mjs` | ❌ **RCC's lane** — `EnrolmentBand.tsx` and `ProfileScreen.tsx` draw `state.caution` / `cautionWash` / `cautionText`. Amber means THE LAW HAS MOVED and nothing else; an enrolment band is about *our* confidence, which renders as neutral ink with a dashed edge. Told to RCC on the bus |

**The two red ones ran NOWHERE.** `check-contract-status` and
`check-design-rules` are both in `scripts/ci-local.mjs` and in
`.github/workflows/ci.yml`; **`check-alert-coverage` and
`check-amber-reservation` were in neither, nor in any test suite.** The two
guards that ran nowhere are exactly the two that were red — which is the whole
argument, and it cost nothing to find because both were already written.

**Both are now wired**, to `ci-local.mjs` and to the matching CI job (alerts to
the server lane, amber to the client-lane job that needs no install).
**`pnpm ci:local` is therefore RED until Q1.10 and the amber fix land**, and that
is deliberate: a green gate that has stopped looking at two of the things it was
written to look at is worse than a red one that has not.

**A false alarm, recorded because the next agent will have it too.** GitHub
Actions has not run since **7 August** despite `origin/main` being current at
`6a437fa` (11 Aug, `0 0` against local). **That is not a broken CI.** `ci.yml`
says so in its own header: `on: [pull_request, workflow_dispatch]` only, because
the repo is on the free tier's 2,000 Actions minutes and the founder's decision
is not to buy more. `pnpm ci:local` is the replacement and is meant to run before
every push. **What it does mean is that `ci:local` was not being run** — the
contract-status guard is in it and was red.

### Q1.12 · RESEARCH, 11 Aug — five things that change the queue

Full write-up with sources: **`docs/RESEARCH_2026-08-11.md`**. The five that
change what we do next:

1. **The GPU should not embed the corpus.** On legal passage retrieval **BM25 and
   dense embeddings differ by 0.3 pp** (37.1% vs 36.8%), and dense retrieval's
   effectiveness on legal case retrieval is published as *"limited"*. ~3,956
   GPU-hours would buy the smaller half of a hybrid whose lexical half exists.
   **Its real job is the pseudonymiser** — NER inference, the one blocker on core
   feature #3, and nothing else can do it.
2. **Citability is solved for 2023 onward, in the text.** High Courts print
   neutral citations (`2023:DHC:2720`, `2023:KHC-D:1`) inside the judgment, so no
   metadata column is needed. **This narrows §Q2's first question; it does not
   resolve it** — the older years are still the founder's scope decision.
   **The extractor had no pattern for the form and now does** — added before the
   HC pass reaches 2023, because it records every document it reads and never
   re-reads them, so the gap would have been permanent and silent.
3. **Lexis+ AI hallucinates at 17% and Westlaw at 33%** (Stanford RegLab, *J.
   Empirical Legal Studies*); multi-layer validation reaches **<1%**. The harness
   is the product, and the target is reachable.
4. **Our harness checks existence, not characterisation.** The same study counts
   *real citations with mischaracterised holdings* and *right quote, wrong
   procedural posture* as errors. **We do not look for either.** A genuine gap in
   our own design, not previously on any list.
5. ~~eSCR (`digiscr.sci.gov.in`) is an official citation→judgment lookup, strictly
   better than our 4,097 hand-built aliases~~ — **RETRACTED 11 Aug 2026, LCC.**
   That URL was never fetched and does not resolve — carried across three docs
   without anyone running the one command that would have killed it, exactly
   `FQ-V1`'s point. The real site, `https://scr.sci.gov.in/scrsearch/`, is
   CAPTCHA-gated (built on the eCourts platform but outside our eCourts grant's
   scope — a different portal) and its search form has no SCC/AIR field at
   all, only S.C.R. and neutral citation, which we already hold at
   100%/99.7%. It cannot close the SCC/AIR↔S.C.R. gap even if the CAPTCHA
   were solved. Full account: `docs/RESEARCH_2026-08-11.md` §3a.
   `judgments.ecourts.gov.in` is a free full-text SC+HC search — untouched by
   this correction. **`eCourtsIndia.com` stays refused** (`CLAUDE.md` §6) and
   **ILDC is non-commercial**, so neither is usable.

### Q1.13 · The Bharat.Law account was provisioned and unread — FIXED 11 Aug

`BHARATLAW_EMAIL` and `BHARATLAW_PASSWORD` were set in the environment and
**nothing in the repository read either name.** `accountsFromEnv` read only
`BHARATLAW_ACCOUNTS`, the `label:username:password` pool form, and refused
identically whether credentials were absent or merely named differently — so a
real account sat dormant and looked exactly like an unprovisioned one.

Single-pair fallback added, `BHARATLAW_ACCOUNTS` still authoritative so a real
pool is never silently reduced to one. **Observed: `pool.configured = true`,
`pool.authorised = true`.** `AUTHORISATION` was already filled in (granted 9 Aug,
expires 2027-08-09, `benchmarkPermitted: true`, **`extractionPermitted: false`**).

**No gate was weakened.** Reading a credential is not permission to use it: the
consent email in **FQ-BL1** is still owed before anything automated, and
**FQ-BL3's first step costs ₹0 and needs no account at all** — run *Kharak Singh*
and *Danamma* through their free tier and see whether their counter-authority is
specific or vague. That single answer decides whether their treatment data is
curated and worth respecting, or computed and reproducible by us.

### Q1.14 · V2/REB reconciliation — deploy integrity, then fail-closed citation safety · 11 Aug

`docs/ai/V2_RECONCILIATION.md` audited the pasted Master Plan v2 against the
repo; the founder then sent a REB directive refining the same priority ladder.
Executed in order, each verified against production, not just local tests:

1. **Citation ambiguity** — `cite:"2020 INSC 189"` matched three real Supreme
   Court judgments and was silently returned as an ordinary result list.
   `StructuredOutcome` gained an `ambiguous` kind; verified live.
2. **`GIT_SHA` staleness** — every CLI (`railway up`) deploy since 8 Aug had
   been reporting a hand-set variable from 8 Aug on `/health`, not the actual
   deployed commit. `scripts/deploy-api.mjs` now sets `GIT_SHA`/`DEPLOYED_AT`
   atomically as part of the deploy action itself; `GET /version` added.
   Verified: `/version` in production now returns the exact HEAD sha.
3. **Fail-closed startup preflight** — `services/api/src/preflight.ts`.
   Every other degradation path in this API is deliberately fail-*open* (the
   embedder falls back to lexical-only); citation correctness is the one
   thing that must not survive silently broken. Boots refuse if the qlang
   parser, required tables/columns/index, or the JS/SQL citation-key
   normalisation pair have drifted. Verified against live production schema
   before shipping — the first draft guessed two column names wrong and
   would have hard-failed every future boot; caught before it shipped.
4. **Judgment-detail live probes** — `services/harness/src/deployed-judgment-
   safety.ts`, extending the existing `/search` probe pattern to
   `GET /judgments/:id`: citationless judgments never fabricate a citation,
   overruled judgments never report a stale status. Both PASS against
   production today.

5. **`citesJudgmentId` — REB §14 / V2 §39.3, RCC bus 0028/0032, LANDED same
   day.** `GET /judgments/:id`'s `paragraphs[]` now carries it. Resolved
   through the same three-source citation match `cite:` search uses
   (`citationMatchFragment`, extracted from `compile.ts` so there is one
   definition, not a second copy that could drift) — absent, never guessed,
   on zero matches, more than one match, or a self-citation. Verified against
   real production data: S.R. BOMMAI resolves 5 of 31 paragraphs. RCC notified
   on the bus (0033), confirmed live (0034).
6. **`treatment.counts.overruledInPart` — found and fixed same day, RCC bus
   0035.** `judgment_citations.relationship` stores six values; `counts` only
   exposed five, and `overruled_in_part` ranked with an ordinary `cites` in
   the returned page instead of near `overruled`/`doubted`. 23 real rows in
   production were silently uncounted even though `total` already summed
   them. Both fixed and verified live; RCC notified (0036).

Continuing per the founder's RESUME AUTONOMOUS EXECUTION directive into P1
(corpus identity/inventory/provenance/dedup):

7. **`judgments.content_hash`/`text_quality` backfill — task 003's own
   recorded remaining gap, closed.** `services/ingest/src/backfill-
   provenance.ts` built and run with `--confirm` against all 79,321 rows.
   Result: 78,384 distinct hashes, 937 exact-duplicate groups, 1,500 rows
   (1.9%), 98.4% High Court. **Verified by reading two sampled groups, not
   inferred from counts:** both are consolidated/batch judgments (one
   judgment deciding many tagged-along matters, e.g. `{Total 327 Matters}`)
   replicated once per case number — a real corpus-quality finding, and
   explicitly NOT confirmation of `HC_CORPUS_SURVEY.md` §5's mobile/plain
   CNR-variant hypothesis (both sampled groups have `cnr IS NULL`). §5
   remains open. Full account: `docs/ai/tasks/003-corpus-inventory.md`.
8. **`judgments.cnr` — found dropped for the entire corpus, both loaders,
   backfilled to 100% same day.** Present in both source metadata schemas,
   read by neither mapper into `JudgmentRecord` — silently discarded since
   ingest began. Migration `0034` added the column and fixed both mappers.
   `services/ingest/src/backfill-cnr.ts` then re-read the same public AWS
   metadata files (no re-fetch, no live court site) and backfilled **all
   79,321 existing rows — 100% coverage**, matching by the same url-
   construction functions the real loaders use. As a direct consequence,
   finally answered `HC_CORPUS_SURVEY.md` §5 (open since before this
   session): no mobile/plain-variant cross-duplication in the HC corpus —
   the 22 rows sharing a `cnr` are year-partition drift, a known, smaller,
   unrelated defect. `docs/ai/tasks/007-cnr-backfill-investigation.md`.

9. **`counter.ts` — `overruledByJudgmentId`/`overruledNote` missing from
   `authorities[]`, RCC bus 0037.** Present on `excluded[]`, absent from
   `authorities[]` though `retrieve.ts` selects both on every row — a
   `partly_set_aside` authority rendered no "what still stands" line. Fixed,
   tested, deployed. Also corrected a long-stale `API_CONTRACTS.md` claim
   that this endpoint returns a nested `arguments: [{ authorities }]` shape;
   it has always been flat, confirmed against `counter.test.ts`.

10. **`docs/ai/AWS_CORPUS_INVENTORY.md` — the source-vs-ingested scale
    question, per the founder's DATA SCALE CONTINUATION directive, 11 Aug.**
    Measured fresh, not assumed "~20M", **then self-corrected the same
    day**: the first pass reported SC at 88.1% coverage (43,532 raw footer
    rows vs. 38,341 held) — executing the very next measurement task found
    the SC bucket lists 5,181 documents under more than one year-partition,
    so the true distinct SC source size is **38,351**, and only **11
    judgments** were genuinely uningested (named in the doc), not
    thousands. **Ingested them same day**: 1 succeeded (landed with
    `native_text: true`, proving the classifier below on a real write), 9
    failed permanently (HTTP 404 or a corrupt PDF at source — not an
    ingest defect). **SC now stands at 38,342 of 38,351 — 99.98%, the
    practical ceiling.** HC stands at 20,529,203 rows / 0.1996% coverage,
    stated as an upper bound — HC's own distinct-document status was
    reasoned as unlikely to have the same defect (its URL construction
    keys off the partition, not a row field) but not independently
    measured. Fixed the `source_document_type` mystery from item 4 above
    for good: every held row, for all 25 courts including the 4 that
    publish a mobile-variant file, came from the plain variant, which
    structurally never carries the field — not backfillable, because
    plain and mobile share zero CNRs and describe different documents.
    Found and **wired the same day**: `services/ingest/src/text.ts`'s
    `isNativeText` (the deterministic native-vs-scanned classifier the
    founder asked for, already proven against real PDFs, just never
    persisted per judgment) — `judgments.native_text`, migration `0035`,
    applied to production; not backfillable for the 79,321 existing rows,
    unlike `content_hash`/`cnr`, since it needs the source PDF re-fetched
    for its page count. `DATA_MOAT_PROGRAM.md` §0 terminology corrected to
    keep source corpus size, ingested corpus size, unique canonical
    documents and unique cases from ever being conflated again.

11. **`docs/ai/HC_CORPUS_CHARACTERIZATION.md` — the HC bucket characterized
    before any full cross-partition dedup sweep, per the founder's HC CORPUS
    CHARACTERIZATION directive, 11 Aug.** Row distribution by court/year:
    full census, `docs/HC_METADATA_SURVEY.json` — Allahabad alone is 17% of
    the last-10-year corpus; 94% of all HC rows are 2010 or later. Ingested-
    row identity/quality broken out by court class for the first time
    (`corpus-report-cli.ts` extended): `content_hash`/`cnr` both 100% for HC,
    matching SC; `native_text` 0.0% for HC (expected — not backfillable
    without re-fetching PDFs); `text_quality` averages 0.968 HC vs 0.987 SC,
    a real ~30x gap in sub-0.90 rate, not previously measured this
    granularly. **Source-side duplication — SAMPLED, not fully measured**:
    new `hc-cnr-sample-cli.ts`, 26 files / ~504,000 rows. Plain variant 99.9%
    within-file distinct-CNR (negligible); mobile variant 72.3% average,
    34.7%-99.8% range — real one-CNR-many-orders structure, not a defect.
    Cross-file collision stays `UNKNOWN`, deliberately not chased at full-
    sweep cost given the sampled rate is low. **New finding, confirmed at
    scale**: the plain variant's `disposal_nature` column (all 25 courts,
    unlike mobile-only `order_type`) is 99.7-100.0% populated across 12
    files / 6 courts / years 2017 & 2019 (~1.14M rows), against 1.4% in a
    mostly-pending 2026 file — a real disposed-vs-pending signal.
    **Self-corrected same session**: the first draft proposed validating it
    by cross-tabulating against the mobile variant's `order_type`, which is
    not executable — plain and mobile share zero CNRs, no join key exists.
    Corrected recommendation: combine `disposal_nature` with the case-type
    token already visible in `title`/`description` into an actual
    judgment-vs-order proxy, next task, not built this session.
12. **`docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md` — designed, not executed,
    same directive.** Mapped the founder's six requested comparison arms
    (lexical/BM25, PG text search, dense, hybrid, RRF, reranking) against
    the real code. Corrected a stale `RETRIEVAL_PROGRAM.md` claim: fusion IS
    RRF (`rrf()`, `RRF_K=60`), not "UNKNOWN" as previously recorded.
    Reranking already exists and is already measured. BM25 does not exist
    (Railway has no extension; scoped as a hand-rolled scorer over the
    existing GIN index, not a new dependency). Neither lexical nor dense can
    be scored in isolation today — `hybridSearch` always fuses; an isolated-
    arm mode is the one real prerequisite. **The 283-query golden set
    (`queries.eval.json`) is 100% Supreme-Court-cited**, so the full six-arm
    bake-off needs zero new embeddings, directly satisfying the directive's
    instruction not to start a massive embedding job first. Also found: three
    harness entry points read three different query-fixture slices (25 for
    CI, 100 of 283 by default for `ab-cli.ts`, 283 available) — a bake-off
    must explicitly use the full 283, not silently inherit the smaller
    defaults built for CI speed.

13. **`docs/ai/CANONICAL_IDENTITY.md` — Stage 2 of the DATA → RETRIEVAL
    EXECUTION PROGRAM, LANDED same day.** Founder-directed continuation past
    HC characterization (item 11) and the retrieval-benchmark design (item
    12). DOCUMENT / CASE / VERSION / SOURCE_ARTIFACT defined as distinct
    concepts, citation explicitly excluded as the identity key (sparse, and
    itself resolved against identity — circular). Closes the gap
    `DATA_MOAT_PROGRAM.md` §5 named (*"the actual canonical cross-source key
    [cnr] is present in schema but not yet the resolution key any code
    uses"*) and task 003's deferred question about the 937 content_hash
    duplicate groups. `services/ingest/src/identity.ts` — pure
    classification functions, no writes, no merges. Two real corpus shapes
    encoded as test fixtures: the Gujarat/Patna batch judgments (one
    DOCUMENT, many CASEs — collapsing to one row per hash would delete 326
    real case identities) and the Supreme Court year-boundary duplication
    from `AWS_CORPUS_INVENTORY.md` §3 (one CASE, many SOURCE_ARTIFACTs — the
    5,181-row overcount). 11 new tests plus a negative control against false
    same-case matches on court+date coincidence; `services/ingest` **315/315**,
    `tsc --noEmit` clean. **Identity layer only — Stage 3 (deduplication)
    is next and is where a classification becomes a stored, provenance-
    preserving relationship.**

14. **`docs/ai/DEDUPLICATION.md` — Stage 3 of the DATA → RETRIEVAL EXECUTION
    PROGRAM, LANDED same day.** Migration `0036` applied to production and
    `ANALYZE`d: `document_duplicate_groups`/`document_duplicate_members`, a
    group table rather than pairwise edges (the largest group is 124 members
    — `C(124,2)` = 7,626 pairwise rows to say what one group row says).
    `dedup-materialize-cli.ts` materialised the 563 exact-duplicate
    `content_hash` groups / 1,500 rows found in task 003, cross-checked
    against `DATA_MOAT_PROGRAM.md` §6's independent dashboard count and its
    own post-write query. **No `judgments` row touched — no merge, no
    delete.** Before spending the cost of a MinHash/LSH pipeline, two cheap,
    exact SQL probes tested whether near-duplicates are a real problem:
    same-CNR-different-`content_hash` (3 groups, all read directly — genuinely
    different orders on one ongoing case, e.g. a 2024 disposal and a 2026
    "stands allowed" order under the same CNR) and same-(court, case_number,
    judgment_date)-different-`content_hash` (23 groups — sampled rows are all
    genuinely different Supreme Court judgments, distinct CNRs, distinct
    source PDFs, sharing one printed lead-appeal number under India's
    connected-matters practice). **Zero near-duplicates found by either
    probe** — a real result, not an absence of looking, and it independently
    confirms `CANONICAL_IDENTITY.md`'s design choice to rank CNR above
    `case_number` with a concrete example rather than only a theoretical
    ordering. MinHash/LSH cost is quantified (§3 of the doc) and deferred
    with a named trigger, not built without calibration data.

15. **`docs/ai/CORPUS_QUALITY.md` — Stage 4 of the DATA → RETRIEVAL EXECUTION
    PROGRAM, LANDED same day.** A/B/C/D quality buckets, full census against
    production (79,322 rows): **A 48.3% · B 51.2% · C 0.5% · D 0.0%.** The
    court-class split is the real finding: Supreme Court 99.9% bucket A,
    **High Court 0.0% bucket A** — verified directly that 0 of 40,980 High
    Court rows carry even a sentinel citation row, i.e. citation extraction
    has never run against the ingested High Court corpus (consistent with
    the paused ingest, Q1.4 above). High Court `text_quality` itself is fine
    (99.1% ≥ 0.90) — a pipeline-coverage gap, not a text-damage one. Found
    and fixed a real reporting defect in the same pass: `quality-buckets.ts`
    was logging a satisfied condition (`"cnr present"`) as if it degraded
    the bucket; the bucket math was always correct, only the reasons
    breakdown was wrong, now pinned by two tests. Also: a bounded, SAMPLED
    (n=500, not corpus-wide) paragraph-number-detection measurement —
    average `numberedShare` 0.747, 10.4% of sampled rows carry no printed
    paragraph number.

16. **`docs/ai/LEGAL_STRUCTURE.md` — Stage 5 of the DATA → RETRIEVAL EXECUTION
    PROGRAM, LANDED same day.** Two more source fields found silently dropped
    before this program's own identity/dedup work would have caught them
    downstream: `SciMetadataRow.petitioner`/`respondent` (migration `0037`)
    and `disposal_nature` on both source schemas (migration `0038`) — never
    threaded from source metadata into `JudgmentRecord`, the same class as
    the `cnr` gap task 007 closed. Both wired for future ingests
    (`sci.ts`/`hc-load.ts`/`load.ts`) and backfilled against the existing
    79,322 rows: parties **100% method coverage** (38,324 `source_metadata` ·
    40,998 `title_parsed`, 16 tests including a zero-width-boundary regex fix
    found by running the parser against every real `case_title` in the
    corpus, not assumed correct from the design); disposition **78,160 of
    79,322 (98.5%)**, verbatim, never classified into disposed/pending or
    judgment/order (`HC_CORPUS_CHARACTERIZATION.md` §11's deferral stands).
    **Advocates surveyed, not built** — no source field on either schema, and
    a 300-row `full_text` sample found the appearance-block signal (96.3% of
    rows) too noisy (OCR-mangled names, no clean boundary) to extract
    reliably without real pattern-building first, matching the discipline
    every other extractor in this repo already went through. Everything else
    Stage 5 asks for — judges, bench, court, dates, case identifiers,
    statutes, citations — was already built and re-verified live rather than
    trusted from an earlier summary.

17. **`docs/ai/CITATION_PIPELINE_STAGE6.md` — Stage 6, LANDED same day,
    verified-already-built plus one real gap closed.** Re-queried every
    citation-pipeline number fresh against production rather than trusted
    from earlier sessions: 227,478 edges, 97,876 resolved, 4,097 aliases —
    zero drift from what was already recorded. DETECT (SCC/AIR/neutral
    SC+HC/SCR/SCALE patterns), NORMALIZE, and the never-blend-structure-
    with-semantics rule (§A2.7) were already landed. **The one gap**: CNR —
    the canonical identity key, 100% populated since task 007 — had no
    search entry point. `cnr:` added to `search/qlang` as an exact-match
    field (never substring/wildcard), verified against a real production row,
    2 new tests, qlang suite 40/40, `docs/API_CONTRACTS.md` updated
    additively.

18. **`docs/ai/CITATION_GRAPH_STAGE7.md` — Stage 7, LANDED same day.** CITES/
    TREATMENT separation with evidence already existed. Survey found
    `approved` safely splittable from `followed` (real, distinct, anchored
    printed word) but `affirmed`/`reversed` are NOT — they overwhelmingly
    describe the citing judgment's OWN procedural history in ordinary prose,
    not a cited precedent's treatment; deferred with the exact disambiguation
    test named, not guessed at. Split `approved` in both citation
    classifiers, migration `0039`, and fixed `services/api/src/judgments/
    treatment.ts`'s `counts` object in the SAME commit — it would otherwise
    have silently dropped the new value, the identical bug class RCC bus
    0035 already caught once. 21 existing rows reclassified from their own
    evidence text. `services/ingest` 343/343.

**Inspected and deliberately NOT started: PII pseudonymisation.** `docs/
PRIVACY_PII.md` names Presidio (MIT) as "the detection base, not the
answer" and is explicit that it must be **evaluated on real Indian court
documents before trusting it** — an English-benchmark F1 says nothing about
a Hindi bail order naming four transliterated surnames. `llm/call.ts`
correctly REFUSES every sensitive-class call today rather than fake the
`pseudonymised` audit flag, and `pii_entities` does not exist in the schema
yet — this is a from-zero build (schema, a detection service — Presidio is
Python, this API is not, so it needs its own service or the existing OCR
Python runtime — plus the evaluation the doc demands before any of it can
be trusted) and its actual USE is separately gated by the DPA in Q2 below,
founder-owned. Building it blind, without the evaluation, would risk
exactly the "claimed complete when partial" failure `CLAUDE.md` names.
Recorded as its own future task rather than rushed.

Deferred, recorded, not forgotten: `generated_holding` (DeepSeek, migration
0033 exists, unwired), statute point-in-time/concordance-quality (RCC bus
0032, P3, needs a source before an API). Branch protection, worktree
separation, and a hidden adversarial benchmark are `docs/FOUNDER_QUEUE.md`
items — none block P0/P1.

**Correction to the line above, 11 Aug 2026: statute point-in-time did NOT need
a source.** See Q1.15. `generated_holding` is still unwired — and migration
`0033` is **not applied and not journalled**: the columns do not exist in
production, `meta/_journal.json` jumps 0032 → 0034, there is no
`services/api/src/holdings/` module and no code references either column. It is
an untracked draft, left as one deliberately.

### Q1.15 · Stage 8, statute point-in-time — ✅ LANDED 11 Aug 2026

`DONE:` amendment/commencement events queryable per provision with effective
dates. `VERIFY:` a provision whose history is externally checkable returns it.

**It was already in the database.** Stage 8's standing instruction was to check
whether indiacode publishes amendment dates before assuming a new source was
needed. It does, and the first `acts` run ingested it:
`statute_sections.footnote` holds each Act's own printed amendment notes,
verbatim, for **9,064 of 34,928 sections**, and nothing had ever parsed them.
Same class as the `cnr`/`disposal_nature`/`petitioner` gaps, one step worse —
not dropped at ingest, but stored and never looked at.

Migration `0041`, applied to production. **18,590 events**, 15,388 with a real
effective date, 1,208 distinct dates spanning 1870–2026. Verified on NI Act
s.138: inserted by Act 66 of 1988 w.e.f. 1-4-1989, substituted by Act 55 of
2002 w.e.f. 6-2-2003, with the "within fifteen days" entry naming no Act of its
own and resolving correctly through `ibid`.

`docs/ai/STATUTE_TEMPORAL_STAGE8.md` holds the measurements, the four things
the real data does that an imagined parser misses, and the named next steps.
**It is not a version history of the text** and must not be presented as one —
indiacode publishes only the current wording.

**`statute_mappings` is untouched and still 0 rows by design.** Nothing in a
footnote establishes IPC→BNS equivalence, and same section number is not same
legal substance. That remains a sourcing problem, and it is still open.

### Q1.17 · THE CONCORDANCE DECISION — measured, and it is the founder's · 11 Aug 2026

**`docs/ai/AUTHORITY_COVERAGE.md`.** The apparent High Court corpus gap is
**mostly an identity problem, not an acquisition problem**, and that changes what
should be bought.

**The ledger, and no state collapses into another:**

| state | HC citation targets |
| --- | --- |
| HELD | 514 |
| MAPPED INTERNALLY (measured, **not yet written**) | ~155 |
| AMBIGUOUS | ~222 |
| KNOWN BUT UNMAPPED | ~897 |
| GENUINELY MISSING | **unknown, and it stays unknown** |

**Why the last row is blank on purpose.** 4,485 of 4,489 unresolved edges point
at Supreme Court reporters. All 38,342 of our Supreme Court judgments carry
S.C.R. citations and **zero carry SCC or AIR**. A High Court citing
`(2006) 4 SCC 1` is very likely citing something already in our corpus under
`[2006] X S.C.R. Y` — we simply cannot join them.

**The internal-concordance study answered the "should we buy something" question
before anyone asked for money.** Party name + year, extracted from the citing
text, matches 28.0% of targets — but **adversarial validation destroys most of
it**: 51.8% rest on ≤3 distinguishing tokens, and 17 same-reporter collisions
are demonstrable errors (the *Arjun Panditrao* referral order and main judgment
matched to the same row; *"Hindustan Times v State of U.P."* matched to two
different judgments). **Safe yield: 12.1%.**

**NEXT ACTION IS A FOUNDER DECISION**, and it is licensing rather than
engineering: an external SCC/AIR↔SCR concordance would unlock up to 1,122 HC
targets and a large share of 57,947 corpus-wide. No source has been researched,
priced, contacted or ingested — that is the step *after* the decision.

**Implementable without it:** ~~the safe ~155 mappings. Cheap, reversible,
multi-signal. Not yet written.~~ **WRITTEN 12 Aug 2026.**
`internal-concordance-cli.ts` (no model, no InferX call) made §3a's
discipline mechanical, hand-checked 14 samples against real judgment rows at
the riskiest end of the range, wrote **294 aliases** (verified: 4,100 → 4,394),
then `resolve --apply --external` converted them into resolved edges:
`judgment_citations` 44.8% → 45.8% (+2,081), `external_citations` 29.5% →
36.8% (+3,787). Full account: `docs/ai/AUTHORITY_COVERAGE.md` §3c. **The
founder decision below is unchanged and still open** — this only implements
the part that never needed it.

**Blocked by the unresolved portion:** citator completeness, "cases citing this
authority", authority ranking by citation count, any claim about High Court
precedential coverage. **Not blocked:** search, verification and the citation
harness, which key on judgments we hold.

### Q1.16 · Stages 9–20 — PLANNED, and 10 is running · 11 Aug 2026

**The plan is `docs/ai/STAGES_9_20_PLAN.md`**, with each stage's DONE/VERIFY,
its real dependencies, and a blocking graph. Read it before picking one up.

Three things from it that change this queue:

- **Stage 10 (retrieval bake-off) runs BEFORE Stage 9 (eval-set expansion)**,
  and the reason is recorded rather than assumed: 283 of 283 gold judgments are
  Supreme Court, which already has 100% dense embedding coverage, so the
  bake-off needs no new embedding job — and expanding an eval set before knowing
  which arm it must discriminate is building a ruler before knowing what is
  measured. The isolated-arm `mode` parameter that made it possible is in
  `fe1b21e`; the 283-query run is going.
- **Stage 15 (rhetorical roles) is a SURVEY, and the answer is do not build.**
  `docs/ai/RHETORICAL_ROLES_STAGE15_SURVEY.md`. OpenNyAI's `InRhetoricalRoles`
  is Apache-2.0 and Indian-law-specific. **Using the weights is clean; training
  on the CC BY-SA BUILD dataset is a share-alike question nobody may answer
  alone.** It has no obiter label, and neither does anything else maintained —
  recorded as an open gap, not folded into `Ratio`.
- **Stage 16 (currentness) is blocked, and the reason changed on measurement.**
  Not "no judge-count column" — the count exists and is a lower bound that reads
  **1 for Kesavananda Bharati's 13-judge bench**. A partial coram is more
  dangerous than an absent one because it looks like an answer. See
  `SCHEMA_TRUTH.md` §judgments.

### Q1.15 · THE CONCORDANCE VERDICT, THE DEPLOY, AND A ROUTING DRIFT — 12 Aug 2026

Four things closed. **The first is a negative result and it is the most
valuable of them.**

**1 · The DeepSeek concordance layer is MEASURED and DOES NOT SHIP.**
`docs/ai/CITATION_CONCORDANCE_EVALUATION.md`. 116 cases, three arms, 184,375
tokens (0.018% of the 1B grant), fully cached and re-runnable at no further
cost.

**The first evaluation reported 100.0% precision in every arm and every tier,
and it was one accepted paragraph away from being written down as a ship
signal.** It was measuring precision-on-decided and scoring every refusal as
`null` — outside numerator and denominator both. Three defects, all fixed:
refusals excluded from the arithmetic; an "adversarial" arm that injected a
random distractor at `jaccard: 0.01` so it sorted *last* (**proof it was not
adversarial: it scored HIGHER than the baseline it perturbs, 79.4% vs 64.7%**);
and **no truth-absent arm at all**, so the set could ask *"does it pick the
right one"* and never *"does it refuse when there is no right one"*.

With the safety arm built, the verdict inverts:

| | |
| --- | --- |
| candidate-generation reach | **22.0%** (44/200) — the ceiling on everything |
| deterministic top-1 alone | 70/79 correct · **9 wrong authorities** (it never refuses) |
| DeepSeek, truth present | precision **100%**, recall **63.6%** |
| **DeepSeek, truth ABSENT** | **4 of 37 FABRICATED an authority — 10.8%** |
| **fabrications tagged `high`** | **2 of 4** |
| paired trade | gave up **18** correct resolutions, prevented **8** wrong ones · McNemar **p ≈ 0.00008** |

**It resolves less than the baseline AND it invents authorities when the answer
is absent** — which is the condition that defines the real target population.
The promotion boundary held: `judgment_citation_aliases` **unchanged at 4,100**,
**0 rows promoted**, both verified by query after the run. What would reverse the
verdict is written down *in advance* in §7 of the evaluation, so it cannot be
invented afterwards.

**2 · THE DEPLOY GAP IS CLOSED — production was 43 commits stale and is now
current.** `Q1.0` recorded this as the founder's call; it was made and executed.
Production serves **`0280a3e`**, verified by probing `/version`, not inferred.
Three things confirmed live against the real API:

- **`cite:"(1994) 3 SCC 1"` returns S.R. BOMMAI.** The old deploy returned
  *KAUSHAL KISHOR* — a real judgment, presented as an ordinary result, for a
  query it had not understood. That was the product-safety issue `Q1.0` named,
  and it is gone.
- **Duplicate collapse works, verified decisively rather than by absence.** A
  judgment with **124 rows sharing one `content_hash`** returns **exactly 1**
  result. (`9697fdb`, live at last.)
- Migrations `0042`/`0043`/`0044` were confirmed applied *before* deploying —
  the database is ahead of the code, which is the safe direction.

**A correction owed on my own check:** I first reported migration `0042` as
absent from production. It was not — I had queried a column named
`document_class` that I invented; the migration creates **`hc_document_class`**.
The data caught it. 40,980 rows are classified and populated.

**3 · `llm_feature` and the API's routing table had silently stopped agreeing.**
`DEEPSEEK_DATA_MOAT.md` §3 claimed migration `0044` added `concordance` to the
enum *and* that `route.ts` routed it to DeepSeek. **Only the first half was
true**, while the comment above `Feature` went on claiming *"Matches
`llm_feature` in the schema"*. Nothing broke — the concordance pass writes
`llm_calls` from `services/ingest` and never calls `routeCall` — **and that is
exactly why it survived.** `Feature` is now derived from one `ALL_FEATURES`
array, a test asserts it against the database enum in both directions, and the
DPA-refusal test iterates that array instead of a hand-written list it had
silently outgrown. `2eb141e`.

**4 · The deterministic safe half was adopted, not rebuilt.**
`internal-concordance.ts` (+ CLI + 20 tests) arrived from a concurrent session
in this lane; audited and taken unchanged. It is §3a's surviving 12.1% made
mechanical — notably `detectCrossTargetCollisions`, which withholds *every*
judgment claimed by more than one citation key because the deterministic signal
cannot separate the 18 genuine SCC/AIR pairs from the 17 referral-order
collisions (a 51/49 split). **Not run**: no `--apply`, zero rows written.

**Test state, measured not assumed:** `services/api` **449/449** and
`services/ingest` **405/416** — the 11 are all `harvest/store.test.ts`, which
needs a local Postgres this machine does not run. Guards: schema-truth,
contract-status, design-rules and amber all green; `check-alert-coverage` stays
red on **Q1.10**, which is unrelated and still needs its producers.

**5 · THE 22.0% CEILING WAS THREE PARSER BUGS, AND IT IS NOW 76.5%.** The
evaluation named candidate generation as the bottleneck; chasing it found that
the "ceiling" was not architectural at all. Each was found by classifying real
failures, not by re-reading the code, and each is `e467037`/`b2ee6d9`:

| | before | after |
| --- | --- | --- |
| gold, year parsed | 34.8% | **99.8%** |
| **gold, REACH** | **22.0%** | **76.5%** |
| target population, year parsed | 98.4% | **100.0%** |
| truth is deterministic top-1 | 88.6% | **88.0%** |

- **`yearFromCitationText` had no S.C.R. pattern at all** — the form all 38,342
  Supreme Court judgments carry. 65.2% of real citations parsed to no year and
  were dropped silently before candidate generation. **These are the same blind
  spots `Q1.0c` fixed in `citations.ts`'s extractor** — square brackets,
  year-first house style, OCR-mismatched brackets — reproduced one for one in a
  second, independently written copy of the same idea.
- **The parallel-citation blind spot, 91% of the rest.** Reports print
  `A v. B [1999] 1 SCR 235 : (1999) 2 SCC 718`; the extractor records both, so
  the second citation's window ends with the *first citation* rather than the
  case name, and the name pattern is anchored at the end of the string.
- **Capital `Vs.` never matched** — no case-insensitive flag on the verb, and
  `Vs.` is the commonest form in Indian judgments.

**The check that matters is that precision did not move**: 3.5× the input at
**88.0%** deterministic top-1 against 88.6% before, truth among candidates
95.2%. A loosened filter would have shown up as a fall there.

**And the "22.0% ceiling" was never the target population's number.** The gold
set is SC→SC (S.C.R.-formatted); the pipeline targets HC→SC (SCC/AIR), where
year parsing was already 98.4%. Reporting a gold-set funnel loss as the
pipeline's ceiling was the evaluation's own error, corrected in place.

**A hazard found while running the suites, recorded because it nearly bit.**
`services/ingest/src/harvest/store.test.ts` connects to whatever `DATABASE_URL`
names and `INSERT`s and `DELETE`s in `harvest_fetches`/`harvest_queue` — so
`pnpm test` with `.env` sourced runs it **against production**. It scopes itself
to a `test_<uuid>` source and cleans up, and **both tables were verified empty
afterwards**, so nothing was polluted. But the safety here is the test's own
good manners, not a guard, and the next test written in that directory inherits
no such protection. Worth a `DATABASE_URL`-host check before it matters.

**6 · AN ORPHAN MIGRATION, found sitting untracked in the working tree.**
`packages/db/drizzle/0033_generated_holding.sql` adds
`judgments.generated_holding` / `generated_holding_at` — the two-sentence
holding `PRODUCT_BRIEF.md` promises for feature #1, which `search/route.ts`
still hardcodes as `holding: ''`. **It is not committed, not in
`meta/_journal.json`, and neither column exists in production** — all three
checked, not assumed.

**Do not simply apply it.** The journal is at `0044`, so the `0033` slot is
long taken; applying this file under its current number would collide with the
applied sequence. It needs renumbering and its own task — generating a holding
is a summarisation pass over 38,342 judgments, a separate piece of work from
the concordance program, and it is queued rather than smuggled in here.

**Highest-value next action.** Reach is no longer the constraint. The open
question the evaluation leaves is the deterministic path: `internal-concordance.ts`
implements §3a's adversarially-filtered discipline and **has never been run with
`--apply`**. That is the one route to canonical aliases this evidence supports,
and it needs its own measured dry-run before any write.

### Q1.18 · HC INGEST WAS DEAD 19 HOURS, TWO HANG VECTORS FIXED, AND THE DEEPSEEK ENRICHMENT PILOT PROVED OUT · 12 Aug 2026

**Found on session start, not reported anywhere.** `hc-load.log` (S8's `--from-year
2016 --batch 200 --concurrency 14 --apply` run) advanced steadily to
`[38,800] mapped=38,796` at 05:53 on 11 Aug, then printed
`Warning: TypeError: Math.sumPrecise is not a function` on a loop for the rest
of the file and never advanced again — dead roughly 19 hours by the time this
was caught, no PID alive, nothing restarted it.

**Two independent hang vectors, not one, both in the fetch→parse step every HC
CLI shares.** `mapConcurrent`'s worker pool never returns a stuck worker, so
`Promise.all` never resolves and one bad document hangs the whole batch
forever — not a crash, so nothing alerts on it.

1. `unpdf`'s bundled pdfjs, repairing a malformed embedded font
   (`Required "glyf" table is not found -- trying to recover`), calls
   `Math.sumPrecise`, which does not exist on this Node runtime (`v24.14.1`,
   a stage-3 proposal). The failure is swallowed by pdfjs's own `warn()`
   rather than thrown, so it never reaches our `catch`.
2. **A second, different hang after the first was patched and restarted**:
   CPU time flat across a direct 5-second sample while "stuck" mid-batch —
   not spinning, genuinely blocked — on the uncovered `fetch()`/
   `arrayBuffer()` call itself. A stalled socket with no error and no bytes
   hangs identically to (1) and was not covered by the first fix.

**Fix: `withTimeout` (`hc-metadata.ts`) bounds the WHOLE per-document
operation — fetch through parse — as one race against a 90s clock, paired
with an `AbortController` so a timed-out fetch actually closes its socket
rather than leaking it across a multi-day run. Applied in both
`hc-load-cli.ts` and `hc-citations-cli.ts`. 38 tests green (12 new, covering
the timeout racing a hang vs. a fast rejection vs. a fast success).**

`DONE:` the ingest cannot hang on one bad document.
`VERIFY:` restarted `hc-load-cli.ts --from-year 2016 --batch 200
--concurrency 14 --apply`; watched it advance `[1] mapped=0` →
`[4,004] mapped=4,002` over 25 minutes with climbing throughput
(0.7 → 2.1 docs/s), confirmed by re-reading the log, not inferred.
**Still running, unattended, at time of writing.**

**Also found and left alone, matching bus 0064's number exactly**: 551
duplicate `content_hash` groups in HC judgments, 925 extra rows. Search-time
collapse (`9697fdb`) already hides these from users; storage still holds
them. Not fixed — dedup means deciding which row survives and repointing any
FK, a bigger operation than 925 rows currently justifies. Queued, not urgent.

**Separately: the uncommitted DeepSeek enrichment pilot
(`services/ingest/src/{inferx,enrich,enrich-cli}.ts`,
`document_enrichments`) was sitting in the working tree, tested but never
applied or run at scale.** Migration `0045` applied and verified against
production (`to_regclass` confirms the table, columns match). Every task
returns a verbatim evidence span and `verifyClaims` string-matches it
against the source before anything is believed — same discipline
`CITATION_CONCORDANCE_EVALUATION.md` drew for authority identity, applied
here to judges/citations/treatment. Nothing it writes is read by the
product; promotion is a separate, unbuilt step.

**Metadata task run to 150 documents (63 cache hits, 87 new live calls,
3 InferX grants rotating under real 429 pressure — confirmed live, key 1
and key 2 both exhausted and rotated past mid-run with zero failed
documents): 301/306 claims verified against source text = 98.4%, 0 calls
failed, 0 unparseable.** This is real evidence DeepSeek V4 Flash reliably
recovers the coram HC documents are missing (0 of 40,980 `judgment_judges`
rows before this), when constrained to verbatim spans rather than trusted
on its own claim.

**Caught mid-session and back off from, not a false start**: a *second*,
independently-started `enrich-cli.ts --task treatment --limit 40` was
already running (PID tree launched 02:07:59, before this session touched
`enrich-cli`) when this session went to pilot `citation_extraction` next —
almost duplicated InferX-pool load across two concurrent processes.
Killed the just-launched duplicate immediately, left the pre-existing run
untouched. **Whoever is running that: `document_enrichments` already shows
7 verified / 1 rejected for `treatment` from it as of this entry — no
coordination needed, just noting it so a third session doesn't pile on.**
`citation_extraction` and further `treatment` scaling queued behind letting
that run finish, on the "concurrency is one, on purpose" rule
`enrich-cli.ts` itself documents (the free pool measurably worsens under
concurrent callers, `DEEPSEEK_DATA_MOAT.md` §1).

### Q1.19 · SCALED TO 4 PARALLEL HC WORKERS, CAUGHT A FILE-COLLISION CASUALTY · 12 Aug 2026

**Scaled the restarted ingest (Q1.18) from one process to four**, on measured
headroom (6% CPU, 16.7 GB free RAM, 20 logical cores) rather than assumption:
the general `--from-year 2016` sweep, plus three dedicated `--court` workers
on the largest under-covered courts by `HC_METADATA_SURVEY.json`'s
`perCourt` breakdown — Allahabad (`9_13`, 22% of the decade, **6 rows held
before this**), Bombay (`27_1`), Madras (`33_10`, **1 row held before this**).
Resumability by `source_url` uniqueness makes any eventual overlap with the
general sweep wasteful, never unsafe.

**Found mid-session: another concurrent session is actively editing the same
harvest files this lane fixed in Q1.18** — `hc-metadata.ts`/`hc-load-cli.ts`
briefly showed the pre-fix content on one `Grep` (no `withTimeout`) then the
fixed content again on the next read, self-resolving. Re-verified stable with
`tsc --noEmit` + the full harvest test suite (38/38 green) before trusting it
again. **One real casualty**: the Bombay worker, launched inside that window,
picked up the unfixed file and sat in the `Math.sumPrecise` warning flood from
its very first batch — zero progress, confirmed by an empty log before the
flood. Killed and relaunched against the now-stable file; recovered.

**Also restarted the citation-extraction rescan after an unexplained crash**
(`Warning: Detected unsettled top-level await`, exit 13, at
37,200/121,346 judgments) — **not a data-loss event**: batched writes had
already persisted all 11,335 new edges before the crash, verified against
production (`judgment_citations` 273,383 → 284,718, exact match to the log's
last printed count). Resumed with the same `--rescan --apply` command, which
skips everything already scanned.

**State at time of writing, four workers plus the rescan all still running:**

| | |
| --- | --- |
| HC documents ingested | **94,989**, up from 40,980 at session start |
| top courts by rows held | Patna 58,834 · Gauhati 14,536 · Calcutta 8,069 · Bombay 3,004 · Allahabad 2,040 · Madras 1,197 |
| HC documents classified (`case_type` set) | 54,288 / 91,910 (86%, matching the S6 sample rate) |
| HC duplicate `content_hash` groups / extra rows | 1,728 / 3,389 — **grown from 551/925** at the same rate as ingestion, not a new defect |
| `judgment_citations`, all courts | 284,981 rows, 102,248 resolved |
| citation rescan | mid-run, ~36,000/128,851 judgments scanned this pass |

**Deferred, not forgotten**: a durable per-document ledger
(`hc_ingest_ledger`, migration `0047`, applied) so a restart can skip a
*permanently*-failed document the same way it already skips a *succeeded*
one, instead of re-downloading every past failure on every restart. Table
exists; wiring it into `hc-load-cli.ts` is deferred while another session is
actively editing that exact file, to avoid compounding the collision above.

**Not done, and said plainly**: no `--limit`-free run has finished a single
court, no permanent-failure count exists yet (ledger deferred), and
`resolve --apply` has not been re-run against the rescan's new edges.
15,771,567 documents is the source inventory (`HC_METADATA_SURVEY.json`); 25
courts, 0.75%–18.64% judgment share, per `HC_INGEST_PLAN.md` — **94,989
ingested is 0.6% of the decade**, progress, not completion.

### Q1.20 · A REAL BUG SURFACED BY RUNNING 4 WORKERS AT ONCE: DUPLICATE `source_url` WITHIN ONE UPSERT BATCH · 12 Aug 2026

**All four HC workers crashed within one check-in cycle — two causes, not one,
both diagnosed from the actual stack trace rather than guessed.**

**Transient (Allahabad, Madras): `getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net`.**
Checked before assuming it was permanent — the Railway TCP proxy's own note in
`.env` warns it gets deleted after use. `nslookup`/`ping` immediately after
showed it resolving and answering fine: a momentary local DNS hiccup, not a
dead proxy. Relaunched as-is.

**Real (main sweep): `PostgresError: ON CONFLICT DO UPDATE command cannot
affect row a second time`.** `load.ts`'s `upsertBatch` puts up to 100 records
in one `INSERT … ON CONFLICT (source_url) DO UPDATE`, and Postgres refuses
outright — not retryable — if the same conflict key appears twice in one
statement. **The AWS metadata bucket itself carries duplicate rows within a
single parquet file** (same `pdf_link`), which `existingSourceUrls` cannot
catch: it only knows what a *previous* batch already wrote, not what the
*current* one is about to. **Only surfaced by running four workers at once**
— a single worker's batches are small enough, and the corpus sparse enough,
that the odds of hitting a duplicate-within-window are lower; higher
concurrency reached it first.

**Fixed in `hc-load-cli.ts`**: dedupe `candidates` by URL before the
`existingSourceUrls` check, first occurrence wins — the same "one sighting"
rule this codebase already applies to citations. Tallied as
`duplicate_in_batch`, counted rather than silently dropped. 38 tests still
green; `tsc --noEmit` clean. All four workers relaunched with the fix.

**Bombay finished its assigned scope clean while this was being diagnosed**
— 3,496 documents, standard end-of-run summary, zero crash. Its capacity was
redirected to a fifth court, Punjab and Haryana (`3_22`, 1.26M documents,
undercovered), rather than left idle.

**Also observed, not a defect**: several Bombay 2026 records extract as
visibly garbled text (`"( ) , (3) 3 ( ) Q , , 993…"`). Matches the
already-documented font-substitution warnings (`Cannot substitute the font
because of its name`) on PDFs with damaged embedded fonts — the same font-
repair path `Math.sumPrecise` sits in. `text_quality` (`load.ts`) already
scores this; not something this ingest CLI can fix without OCR, which is out
of scope per `HC_INGEST_PLAN.md` §2.

### Q1.21 · THE CITATION RESCAN CRASHES ON A TIMER, NOT A DOCUMENT — WORKED AROUND WITH `--limit`, NOT ROOT-CAUSED · 12 Aug 2026

**Three crashes, same signature, each closer to the start.** `citations-cli.ts
--rescan --apply`, unbounded, died three times on
`Warning: Detected unsettled top-level await … await main();`, exit code 13
— at 37,200/121,346, then 60,600/128,851, then 30,400/138,602 judgments. **Not
a document-shaped bug**: the crash point does not track a fixed offset, a
fixed judgment, or a fixed count, and it moved EARLIER as this lane went from
one HC ingest worker to five. That points at resource pressure from running
several heavy Node processes at once, not a bad row.

**Per `CLAUDE.md`'s own rule, three of the same failure is the line — stop
guessing and change strategy, not attempt a fourth blind resume.** Confirmed
first that resuming loses nothing (`judgment_citations` count matched the
log's last printed total exactly, twice), so the crash itself was never the
risk — burning a fourth attempt on the same unbounded shape would have been.

**Not root-caused. Worked around**: `--rescan` already accepts `--limit`
(`arg('--limit', 0)`, read at `citations-cli.ts` line 238). Chained eight
sequential `--limit 20000 --apply` runs instead of one unbounded one — each
short enough to very likely finish inside whatever the crash's real time or
resource threshold is, and the crash itself is harmless to interrupt given
the batched-write safety already confirmed. **This is a workaround, stated as
one**: the actual cause (a Windows/Node resource ceiling under concurrent
`hc-load-cli.ts` + `citations-cli.ts` load, guessed but not measured) is still
open. Revisit if `--limit`-bounded runs start crashing too.

### Q1.22 · STAGE 13, EXACT-SPAN EVIDENCE — SHIPPED, AND A REAL OFFSET BUG FOUND AND FIXED ALONG THE WAY · 12 Aug 2026

**`judgment_chunks.char_offset`/`char_length` now drive `operativeParagraph`
directly, exactly.** `services/api/src/judgments/paragraphs.ts` gained
`resolveExactSpan` (bounds-checked slice, never approximated, null on any
invalid input) and `locateParagraphByOffset` (walks the same paragraph blocks
`segmentParagraphs` builds and picks the one whose real span in `full_text`
contains the offset — no substring probing). `retrieve.ts`'s `dense()` now
carries `char_offset`/`char_length` per matched chunk; `hybridSearch()` tries
the exact path FIRST and falls back to the pre-existing fuzzy `locateParagraph`
only when no verified offset is available. New field
`operativeParagraphVerified: boolean`, additive, documented in
`API_CONTRACTS.md`, threaded through `search/route.ts` and
`arguments/counter.ts`.

**A real, pre-existing bug was found verifying this against production data,
not invented from reading the code.** `chunk.ts`'s old offset computation
reconstructed each chunk's body by rejoining split paragraphs with a canonical
`\n\n` and then searched for it with `text.indexOf(body, searchFrom)`. When
the source's real separator was not exactly two newlines — three+ blank
lines, or a "blank" line carrying trailing spaces, both real in this
OCR'd/scanned corpus — that search failed, and the code silently fell back to
`offset: 0` instead of reporting the position as unknown. **A false "verified"
position, not a missing one**: a chunk from paragraph 40 would read as if it
began at the judgment's first character.

Measured on real data: **0.54% of chunks (2,217 of 412,203)** carried this —
found via `char_offset = 0 AND chunk_index > 0`, which is unambiguous (offset
0 is only ever correct for `chunk_index = 0`). It was NOT caught by the
backfill CLI's own byte-equality verification, because the bug is
deterministic: recomputing produces the identical wrong offset, so
`storedText === chunk.text` still passes.

**Root-caused and fixed, not patched at the symptom.** Rewrote the paragraph
splitter to track each unit's real position while walking the text once
(`Positioned` type, `pushTrimmed`), so a merged chunk's offset is simply
"where its first unit started" — carried forward through merging, never
re-derived by searching. There is no `indexOf`-based position lookup left in
`chunk.ts` at all; the failure mode is structurally gone, not detected-and-
avoided. Also fixed: offsets are now correctly adjusted for `fullText`'s own
leading whitespace (`fullText.trim()` vs `fullText`) — checked live against
production (0/138,602 judgments actually have leading whitespace today, so
this was latent, not separately measured as a live defect, but the old code
would have silently mis-offset every chunk of any judgment that did). 16
tests in `chunk.test.ts` (3 new, reproducing the exact failure mode plus the
leading-whitespace case), `services/api` and `services/embed` suites green,
`tsc --noEmit` clean both packages.

**Cleanup, verified**: the 2,217 bad rows were NULLed (`char_offset = NULL,
char_length = NULL`, never guessed at a correction) rather than left wrong,
so they read as honestly unavailable and get correctly re-derived by the next
backfill pass. Re-verified 200 fresh random samples post-fix: 200/200 correct,
0 rows matching the bug's signature anywhere in the table.

**Two long-running background jobs, both relaunched with the fix, both
running at time of writing:**
- `backfill:offsets --apply --limit 100000` — recovers `char_offset` for the
  616,197 chunks embedded before migration `0046`. Resumable by construction
  (`WHERE char_offset IS NULL`); a killed/restarted run loses nothing.
- `EMBED_DEVICE=dml pnpm --filter @lawmind/embed run embed --limit 90000` —
  closes a SEPARATE, larger gap found while investigating: **87,141 of
  125,522 judgments (69%) have never been chunked or embedded at all**, so
  they carry zero dense-retrieval presence (lexical-only). This runs on the
  local RTX 4060 Ti via `embedDevice() === 'dml'`
  (`services/embed/src/embed.ts`), whose fp32 GPU/CPU vector agreement was
  re-verified live this session (cosine 0.999999996–1.000000002 on 3 texts
  incl. Devanagari) before trusting it, on top of the 9 Aug measurement
  already on record.

**This GPU run is a deliberate call to REVISIT `Q1.12`'s "the GPU should not
embed the corpus" finding, made on the founder's explicit direction this
session** (not a silent reopening): that finding priced a RENTED GPU
(~3,956 GPU-hours, ~$65) against a measured 0.3pp retrieval difference. On
already-owned, otherwise-idle local hardware the cost side of that tradeoff is
gone; bringing 69% of the corpus into dense retrieval at all has value beyond
the 0.3pp figure regardless. `Q1.12`'s finding is not struck — it is still the
right call for a RENTED GPU — this is a different question the founder
answered directly.

**UPDATE, same day: a SECOND offset bug, found by the tool this stage built to
find exactly this.** `verify:exact-span --n 1000` against production (not a
unit test — real rows) found 2/1000 failing the bounds check, both
`char_offset + char_length` landing exactly ONE character past
`full_text.length`. Different root cause from the first bug, same family: the
merge step joins two paragraph units with a synthesised `"\n\n"`, correct only
when the source's real gap between them WAS exactly two newlines. Units from
`splitParagraphs` genuinely were (that's what qualified them as separate
paragraphs); a short TAIL piece from `splitLongParagraph`'s own internal
cut — merged into the previous chunk via the same synthetic separator when it
falls under `minChars` — is often adjacent to its neighbour with a real gap of
0–1 characters, not two. `bodyLength` silently inherited the 1–2 character
difference.

**Fixed at the source, not downstream.** `chunkJudgment` now verifies its own
output before returning it — `fullText.slice(offset, offset+bodyLength) ===
body.text`, a slice and a string comparison, free relative to the chunking
work already done — and reports `offset: -1` (never a guess) when that check
fails. `cli.ts`/`backfill-offsets-cli.ts` write NULL for both columns whenever
`offset` is `-1`. New deterministic regression test reproduces the exact
failure (a 226-character paragraph cut at a single space, the 35-character
tail triggering the merge). Both jobs were stopped a second time on finding
this (same reasoning as the first bug: they were actively writing with the
unfixed code), a SQL-only table-wide bounds check found and NULLed **1,153**
more affected rows (no `full_text` fetch needed — `char_offset + char_length >
length(full_text)` is computable server-side), and a fresh 3,000-row sampled
re-verification came back **3,000/3,000 clean** before either job restarted.
17/17 `chunk.test.ts`, 31/31 embed suite, `tsc --noEmit` clean throughout.

**UPDATE, same day: the GPU job's scope conflicted with a settled decision,
found before it compounded, queued rather than resolved alone.**
`FOUNDER_QUEUE.md` FQ-CORPUS (11 Aug 2026) decided High Court documents are
ingested WITHOUT embeddings for now — pgvector is documented to degrade past
5–10M vectors, and the High Court scale-up targets ~41M. The 87,141-judgment
backlog this stage found and started closing turned out to be **almost
entirely High Court** (checked after the fact: only 1 Supreme Court judgment
remains un-embedded corpus-wide), so the GPU run had already embedded 1,680
judgments — including Madhya Pradesh and Kerala, courts the concurrent
HC-ingest lane's own plan (below, Q1.22 THE 10× PLAN) names as being actively
scaled up right now — before this was caught. **Stopped again, not reasoned
past**: this session's direct GPU authorisation and FQ-CORPUS's reasoned
"no" are a genuine conflict, not something to pick a side of alone. Added
`--court "<name>"` to `cli.ts` so a future run can be scoped precisely.
Queued to the founder in full: `FOUNDER_QUEUE.md`'s newest entry.

**Where this leaves Stage 13 itself: DONE and verified.** The exact-span
mechanism, the two bugs, and their fixes are all real, tested, and hold
regardless of how the embedding-scope question resolves — they govern HOW a
chunk's position is trusted, not WHICH judgments get chunked. The offset
backfill (bounded to chunks that already exist, not at risk of the FQ-CORPUS
conflict) continues running. The GPU embed job stays stopped pending the
founder's call.

**CLOSED, verified by observation, not inferred from the log.** The backfill
finished: `pnpm --filter @lawmind/embed run backfill:offsets` processed all
11,351 remaining judgments. Independently re-queried production directly
(not trusted from the run's own printed summary):

| | |
| --- | --- |
| `judgment_chunks` total | 620,300 |
| carrying a verified `char_offset` | **616,854 (99.44%)** |
| honestly NULL (self-check failed or chunk-count changed since embed) | 3,446 (0.56%) |
| bug #1 signature (`char_offset=0, chunk_index>0`) table-wide | **0** |
| bug #2 signature (offset+length overshoot) table-wide | **0** |

`DONE:` a retrieval result carries the paragraph and the exact span it rests
on (Stage 13's own criterion, `docs/ai/STAGES_9_20_PLAN.md` §13).
`VERIFY:` a returned span appears verbatim in the judgment's own text —
confirmed at 5,000+ real production checks across this session (a flat
3,000-sample plus a 2,230-check stratified sweep spanning offset=0, final-
chunk, duplicate-group, OCR-damaged, long/short, and early/late-era rows),
zero `OFFSET_INVALID`, zero `TEXT_MISMATCH`. `verify:exact-span --stratified`
(`services/api/src/judgments/verify-exact-span-cli.ts`) stays in the repo as
a repeatable check, not a one-off.

### Q1.22 · THE 10× PLAN — founder asked for a strategy before scaling, here it is · 12 Aug 2026

**Target: ~1,034,860 HC documents, 10× the 103,486 held at the time of the
ask.** Still only 6.6% of the 15,771,567-document decade inventory — headroom
is not the constraint.

**Where the room is, ranked by `HC_METADATA_SURVEY.json`'s `perCourt`, courts
currently near-zero:** Rajasthan (848,617 docs, 4 held) · Orissa (761,067, 39)
· Karnataka (730,432, **0**) · Madhya Pradesh (588,593, **0**) · Kerala
(570,700, 60) · Telangana (526,825, 21) · Chhattisgarh (401,696, 4) ·
Jharkhand (393,079, 8) · Andhra Pradesh (355,497, **0**) · Delhi (306,893, 2)
· Gujarat (290,144, 497). **5.8M+ documents sit behind these eleven alone** —
10× is reachable from a handful of them without touching the smaller courts.

**Checked before scaling, not assumed:**
- CPU 6% average load, 15.7 GB RAM free of 31.7 GB, 20 logical cores — the
  existing 5 concurrent Node jobs use a small fraction of either.
- Railway Postgres: **100 max_connections, 15 in use.** Six more
  `hc-load-cli.ts` workers at `postgres(url, {max:3})` each add ≤18 —
  comfortably inside budget with room left for the API and other sessions.

**Plan: six more dedicated `--court` workers**, same command shape as the
four already running (`--from-year 2016 --batch 200 --concurrency 16
--apply`), on Rajasthan (`8_9`), Orissa (`21_11`), Karnataka (`29_3`),
Madhya Pradesh (`23_23`), Kerala (`32_4`), Telangana (`36_29`) — ten
`hc-load-cli.ts` processes total plus the bounded citation-rescan loop.

**What "careful, no mistakes" means here, concretely**, given Q1.20 already
found one real bug at higher concurrency:
1. Verify each new worker prints a real progress line (not just a header)
   before moving to the next, rather than firing all six blind.
2. Re-run the harvest test suite before launching, since another session has
   touched these files before (Q1.19) — cheap insurance against relaunching
   a stale or half-edited version.
3. Watch for the SAME failure shapes already catalogued (`ON CONFLICT`
   duplicate-in-batch — fixed in shared code, so every new worker inherits
   the fix automatically; transient DNS; the citation-rescan's unexplained
   crash under load) rather than treating a new crash as novel before
   checking it isn't one of these three first.
4. **Not doing**: embeddings (FQ-CORPUS still says no), OCR (out of scope),
   touching `citation_extraction`/`treatment` enrichment or the concordance
   pass (other sessions' lanes, per this turn's own standing instruction).

### Q1.23 · A COMMENT CLAIMED A GUARD THAT WAS NEVER WIRED IN — Punjab found it · 12 Aug 2026

**Punjab crashed on `SQLSTATE 22021`, invalid UTF-8 byte sequence** — the
exact failure `text.ts` documents as *"what silently ended the 2023 run"*,
and `hc-load-cli.ts`'s own header comment claims is already handled:
*"already carrying `stripUnstorable` for the invalid-UTF-8 failure … that
once silently stopped an ingest after 2022."* **The claim was false.**
`hc-load.ts` set `fullText: text` straight from unpdf's raw output; nothing
in the HC path ever called `stripUnstorable`. It survived 103,486 documents
across ten courts because none of them happened to carry the NUL bytes or
unpaired surrogates that trigger it — Punjab's did.

**Fixed**: `stripUnstorable(extracted.text)` before the text goes anywhere,
in both `hc-load-cli.ts` (writes `judgments.full_text`) and
`hc-citations-cli.ts` (writes `external_citations.citation_text`, same raw
source, same risk, currently dormant per S8 but fixed for when it next
runs). 38 tests still green, `tsc --noEmit` clean. Punjab relaunched,
confirmed advancing past where it died (CPU climbing, not the flat-CPU hang
signature from Q1.18).

**The lesson, stated because it will recur**: a comment asserting a guard
exists is not evidence the guard exists — this is the third time this
session a documented claim about this exact codepath (`Math.sumPrecise`
absent, DNS proxy presumed dead, now `stripUnstorable` presumed wired)
turned out to need checking against the actual code or environment before
trusting it.

### Q1.24 · SCALED TO 10 · founder's 10× ask, 12 Aug 2026

Ten `hc-load-cli.ts` workers running: the general sweep plus dedicated
`--court` workers on Allahabad, Bombay (finished, redirected), Madras,
Punjab and Haryana, Rajasthan, Orissa, Karnataka, Madhya Pradesh, Kerala,
Telangana — the eleven largest courts by `HC_METADATA_SURVEY.json`, covering
**11.2M of the 15.77M-document decade inventory** between them. Plus the
citation rescan, bounded to `--limit 20000` chunks since Q1.21. Full plan
and the headroom check (100 max DB connections, 15→22 in use; 6% CPU; 15.7 GB
RAM free) before scaling: this file's own entry written at the time, kept
above rather than restated.

### Q1.25 · CLASSIFY / DEDUPLICATE / INDEX — checked against what already exists, not assumed absent · 12 Aug 2026

**Asked to add classify → deduplicate → index-eligible stages. Checked each
against the running system before building anything new — two of three were
already done, and the third would have meant deciding a question this repo's
own schema doc explicitly declined to decide.**

**Classify: already automatic, and the gap is by design.** `case_type` is set
at load time (`caseTypeFrom`, `hc-load.ts`). Sampled the unclassified 14%'s
case-number prefixes rather than guessing: dominated by bare `WP`/`WPC`/`WPA`
(writ petitions — `caseTypeFrom`'s own comment: *"may be either"*, and the
same file states mislabelling is worse than leaving null) and abbreviations
(`MJC`, `CMP`, `A`) with no verified meaning in THIS corpus. A few looked
guessable (`IACIVIL`, `WRIC`, `BAILAPPLN`) but every existing entry in the
dictionary carries a citation like *"observed, Patna 2024"* — verified
against a real sampled record, not inferred from the string. Adding entries
without that same verification is the exact risk the function's own comment
warns against. Not done; flagged rather than guessed.

**Deduplicate: already solved, at a layer already decided — checked, not
assumed.** `SCHEMA_TRUTH.md` on `content_hash`: *"which one is canonical is
still an ingest-design decision, not something this column answers."*
Building a fixed, storage-level canonical-row marker would have been this
session deciding that question unilaterally. **It didn't need deciding
again** — `search/retrieve.ts` already collapses duplicates at retrieval,
keeping *"the highest-ranked member of its own group"* per query (rank-
dependent, which is why a fixed marker would be a DIFFERENT, narrower rule,
not a durable version of the same one). The only thing that mechanism needs
is `content_hash` populated on every row, since a NULL hash is never
collapsed. **Verified, not assumed: 0 of 124,599 HC judgments are missing
`content_hash`** — `upsertJudgments` computes it on every write, so this has
held automatically since migration `0031`, before this session started.

**Index-eligible documents: automatic, verified from the schema, not
inferred.** `full_text_tsv` is `GENERATED ALWAYS AS (to_tsvector(...)) STORED`
with a GIN index (migration `0004`) — every row is lexically searchable the
instant `upsertJudgments` writes it. There is no separate "index eligibility"
gate to build under the text-only, no-embeddings decision this ingest
operates under (`FQ-CORPUS`); one would only exist if embeddings did.

**Embeddings: declined, stated plainly, not silently skipped.** `FQ-CORPUS`
(`FOUNDER_QUEUE.md`, decided 11 Aug 2026): *"ingest High Court documents as
searchable text behind the coverage screen, no embeddings for now."* Nothing
in this session overrides that, so nothing here embeds anything.

### Q1.26 · CLASSIFICATION FIXED, VERIFIED AGAINST REAL TEXT, BACKFILLED · 12 Aug 2026

**Classification fell 86% → 45.9% the moment the 10× scale-up (Q1.24) added
six more courts — a real signal, chased rather than shrugged off.** Sampled
the new courts' unclassified prefixes: dominated by genuinely ambiguous ones
already correctly left null (`WP`, `WA` — the code's own stated design), but
`CRLMB`/`CRLMP`/`CRLW`/`CRLRP` (Rajasthan, Karnataka) stood out as a pattern
the exact-match dictionary had never seen.

**Verified against real text before writing any code** — the same bar the
existing dictionary entries carry (*"observed, Patna 2024"*): pulled eleven
real records across both courts, every one prints *"Criminal Miscellaneous
Bail Application"* or *"Criminal Writ Petition"* in its own header, party
described as *"Accused-Petitioner."*

**Fixed as a substring rule (`prefix.includes('CRL')`), not another
exact-match entry** — whack-a-moling every court's own `CRL`-compound is the
same fix repeated forever. Safe from the one named trap in this function
(`CRP`, Civil Revision Petition, begins `CR` but not `CRL`) because it is
three letters, not two; test added asserting `CRP` still resolves `civil`.
39 tests green, `tsc` clean.

**Backfilled onto rows already ingested**, not left for new writes only:
`backfill-case-type-cli.ts`, dry-run by default, pure and additive (never
overwrites an existing classification, reuses `caseTypeFrom` rather than
reimplementing it). Dry run matched the applied run's count exactly.
**7,722 rows reclassified.** Classification now **50.4%** — up from 45.9%,
genuinely short of the old 86% because the new courts' remaining gap is
mostly `WP`/`WA`-shaped ambiguity this codebase has already decided not to
guess at, not an unfixed bug.

### Q1.23 · 10× EVIDENCE/RETRIEVAL DIRECTIVE — first wave, three tools shipped · 12 Aug 2026

Founder directive: increase this lane's evidence/retrieval throughput and
validation depth roughly 10×, without HC embeddings, without duplicating
another lane's work, without weakening verification. First wave:

**`verify:exact-span --stratified`** (`services/api/src/judgments/`) —
expanded from a flat random sample into 14 targeted strata (offset=0, not-
yet-backfilled, short/long judgment, early/late era, SC/HC, OCR-damaged/
clean, likely-merged, final-chunk, duplicate-group document, random
baseline), each classified (`OFFSET_INVALID`/`TEXT_MISMATCH`/
`MISSING_OFFSET`/`OTHER`) and persisted to a replayable JSON regression
corpus rather than a log line. Three runs this session (per-stratum 200,
then 500, plus the earlier flat 3,000-sample before stratification existed)
total **10,961 real production exact-span checks — 0 `OFFSET_INVALID`, 0
`TEXT_MISMATCH`**, meeting the directive's 10,000+ target. Every "failure"
across all runs classified `MISSING_OFFSET` (the deliberate not-yet-
backfilled stratum, honestly NULL rows — 3,446 corpus-wide after the
backfill finished, per Q1.22 above), never a wrong value.

**`chunk:qa`** (`services/ingest/src/chunk-qa-cli.ts`) — deterministic
statistical QA over the CHUNKER itself (re-runs `chunkJudgment` fresh
against sampled real `full_text`, not the stored rows). No LLM anywhere —
every measurement is string arithmetic. Two runs, n=500 then n=3000:
merge/overshoot rate 0.87%→1.09% (consistent with the production estimate,
not growing), 0% malformed chunks both runs, overlap correctness
99.99–100%, and a genuinely new, stable finding — **citation preservation
99.02–99.15%: 18–43 citations per sample split across a chunk boundary**
(unreadable/unmatchable at that boundary). Not fixed this session — the fix
would touch `chunk.ts`'s boundary logic, a bigger change than this pass
scoped, and the rate is small and stable across both sample sizes. Queued as
a real, quantified follow-on rather than acted on blind.

*Minor, understood, not a defect*: the n=3000 run found 1/15,104 overlap
checks "failing" — traced to the QA tool's own check comparing against the
wrong reference string for a chunk whose OWN body is shorter than
`overlapChars` (240 chars), not a `chunk.ts` bug. `chunk.test.ts`'s existing
overlap tests use the same comparison pattern and never exercised a
sub-240-character body, which is why it wasn't caught earlier. Noted rather
than chased further — it does not touch exact-span correctness.

**`retrieval:regression`** (`services/api/src/search/`) — a repeatable
regression command per the directive's continuous-regression requirement,
honest about not having graded relevance judgments: compares real
`hybridSearch` output run-over-run (empty-result changes, top-result
identity changes, 3×+ latency regressions) rather than inventing a gold
score. `bench.ts`'s query list extracted to shared `bench-queries.ts` and
grown 10→20, labelled by shape (concept/section/citation/case-name/
procedural) for future per-category reporting. First baseline: **20/20
queries returned results**, corpus at capture time 189,386 judgments
(up from 125,522 at session start — the concurrent HC-ingest lane's 10×
scale-up is measurably working).

**Explicitly not attempted this session, stated rather than faked**: the
1,000+-query graded gold benchmark (directive §4) needs verified relevance
judgments this session had no way to produce honestly in the time available
— `docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md` already scopes that as its own
effort. Query-expansion evaluation, reranking experiments, and the
adversarial authority set (directive §6, §8) are queued behind it for the
same reason: each needs either real gold or a real audited source, and
inventing either is exactly what this program's standing rule forbids.

### Q1.24 · STALE-OVERRULED RATE MEASURED END-TO-END FOR THE FIRST TIME: ZERO · 12 Aug 2026

`docs/CITATION_HARNESS.md`'s hard rule — *"Stale-overruled rate threshold 0
— overruled law rendered WITHOUT the LAW MOVED mark is as severe as a
hallucination"* — had never been measured through the actual retrieval path.
Built `overruled:audit` (`services/api/src/search/`): no invented adversarial
data, every case tested IS overruled/set_aside/doubted per
`judgments.overruled_status` as already recorded, a real audited
relationship. For each, runs its own case title through `hybridSearch` and
checks the returned `overruledStatus` equals the live db row.

**Result: 0/57 stale.** Every overruled/set_aside/doubted judgment this
lane's own retrieval surfaced came back carrying the SAME status the
database holds right now — the rule the harness exists to enforce holds at
100% on every case checked.

**Corpus-wide, only 81 judgments carry a non-`none` overruled_status** (57
set_aside, 8 partly_set_aside, 16 doubted) — small enough that this session
checked the entire population, not a sample of it.

**A second, different finding, out of this tool's stated scope but real:**
24/81 (29.6%) were NOT found in the top 10 for their OWN exact case title.
Not a staleness defect — a recall gap. An overruled case is exactly what an
advocate searches FOR adversarially (checking whether something they were
about to cite is still good law), so failing to surface it even by its own
title is worth a look, separately from this session's scope. Flagged, not
chased — the cause (older/rare-vocabulary titles losing to more common terms
in the lexical ranker, a corpus that grew from 125,522 to 189,386 mid-session
diluting exact-title matches, or something else) is not yet diagnosed.

### Q1.25 · A REAL LEXICAL-RANKING GAP, TRACED TO ROOT CAUSE, NOT FIXED · 12 Aug 2026

Following up the recall gap Q1.24 flagged (24/81 overruled cases not found in
top 10 for their own case title): built a targeted diagnostic
(`services/api/src/search/_scratch_trace_one_miss.ts`, scratch — not
committed, the finding below is) and traced ONE case rigorously rather than
pattern-matching across log lines.

**`S. N. DUTT versus UNION OF INDIA`** (a real 1961 Supreme Court judgment,
confirmed present in the corpus by direct row lookup) does not appear in the
sparse ranker's top 50 when searched by its OWN exact title. Traced why:

1. `plainto_tsquery('english', 'S. N. DUTT versus UNION OF INDIA')` produces
   `'n' & 'dutt' & 'versus' & 'union' & 'india'` — 45 judgments contain all
   five lexemes.
2. `full_text_tsv` is `GENERATED ALWAYS AS to_tsvector('english', full_text)`
   (`docs/SCHEMA_TRUTH.md` §judgments) — **one tsvector, no weight class**.
   `case_title` is a separate column, never indexed with elevated weight.
3. `dutt` — the one genuinely discriminating token, the party's own surname —
   appears exactly once in the target judgment (the heading). `union`,
   `india`, `versus` are common party-reference boilerplate that a long
   judgment repeats dozens of times discussing the government as a litigant.
4. `ts_rank` scores by term frequency. A document that says "Union of India"
   forty times outranks the one document where "Dutt" is the actual party,
   because raw frequency cannot tell a heading token from an incidental one.

**This is real and structural, not a corpus-growth artefact** — the
mechanism would reproduce at any corpus size; a bigger corpus only supplies
more candidate documents to outrank the target with.

**Not fixed this session, deliberately.** `full_text_tsv` is a stored
generated column read by every production search query; changing its
definition is a schema migration touching the corpus-wide index used live,
right now — a different risk class from the chunk.ts fixes above, and this
session already carries two of those. The safer shape, not yet built:
an ADDITIVE ranking signal — `judgments.case_title` similarity, applied as
a rank boost or pin (the same architectural pattern `exactCitation()`
already uses for citation-shaped queries in `retrieve.ts`) — rather than
touching the tsvector generation `full_text_tsv` itself. **Directive's own
words apply exactly**: *"Do not change ranking weights merely to improve
one benchmark. Every change must be measured against a fixed regression
set"* — `retrieval:regression`'s baseline (this session) is the tool to
measure it with, before and after, when this is picked up.

**INDEPENDENTLY VERIFIED, same day.** Traced three more real cases with
direct DB queries (not pattern-matched from a log) rather than resting the
finding on one anecdote:

- **`KANHAIYALAL versus UNION OF INDIA AND ORS.`** — same mechanism as
  DUTT exactly: 20 AND-candidates, target not in the top 50 by `ts_rank`.
  **Confirms the dilution mechanism is not a one-off.**
- **`V REVATHI versus UNION OF INDIA & ORS.`** — a DIFFERENT, DISTINCT
  failure. The AND-path found only 1 candidate total corpus-wide, and it
  was not the target — the target isn't a candidate AT ALL, not merely
  outranked. Confirmed by direct read that `full_text` genuinely contains
  "REVATHI" (`"y V. REVATHI A\nv.\nUNION OF INDIA & ORS."`, byte-verified).
  **Hypothesis tested and REJECTED**: the raw text uses the abbreviated
  "v." rather than the spelled-out "versus" `case_title` normalises to, so
  I suspected the literal word "versus" was simply absent from this
  document's tsvector — re-ran the AND query with "versus" removed
  entirely and the target STILL did not appear. So that is not the (or not
  the whole) mechanism either. **Root cause for this second failure shape
  is NOT diagnosed** — stated honestly rather than papered over with the
  first plausible-sounding theory. Something about how "V." or "REVATHI"
  itself tokenizes in this specific document remains unexplained.
- **`SARDARI LAL versus UNION OF INDIA & ORS`** — same shape as REVATHI
  (1 AND-candidate corpus-wide, not the target), not separately dug into.

**Q1.25 is independently verified: the symptom (exact case-title search
missing a present document) is real and reproduces across at least four
distinct cases, via at least TWO distinct mechanisms** — one fully
diagnosed (frequency dilution, confirmed twice), one confirmed to exist but
NOT yet diagnosed (a tokenization/candidate-exclusion failure that a
"versus"-normalisation theory does not explain). **Closing this as
"verified, not solved"**: the case-title-similarity boost proposed above
would fix the dilution mechanism (its target is found and merely
outranked, so a rank boost helps); it would NOT fix the second mechanism
(the target isn't a candidate at all, so no re-ranking of existing
candidates can surface it) — that needs its own root-cause pass before any
fix is attempted, separate from and after the dilution fix.

### Q1.27 · CORRUPTION-REPAIR FALLBACK WIRED INTO THE ACTIVE INGEST · 12 Aug 2026

**A concurrent session independently investigated and fixed the same garbled-
text defect this lane found evidence for (Bombay, letter-dropping fonts,
`"nion of ndia"` for `"Union of India"`)** — landed as `fetchPdfText` +
`classifyCorruption` in `text.ts`/`text-corruption.ts` before this lane's own
fix was written. **Not duplicated.** Their classifier is measured against a
4,000-row sample and token-shape based, materially more rigorous than the
uppercase-ratio heuristic this lane had been about to build from a 27-sample
comparison.

**What WAS a real, non-duplicative gap: it was never wired into the running
ingest.** `text.ts`'s own comment claimed `harvest/hc-load-cli.ts` was "the
real ingest path" using `fetchPdfText` — it was not; the CLI still called
`unpdf`'s `extractText`/`getDocumentProxy` directly, the same
comment-claims-a-guard-that-was-never-wired pattern as `stripUnstorable`
(Q1.23) and the extraction timeout (Q1.18), a fourth instance this session.
**Fixed**: `hc-load-cli.ts` now calls `fetchPdfText`, which subsumes the
manual `unpdf` calls and `stripUnstorable` (already applied internally via
`normaliseWhitespace`) and adds the `pdftotext` repair pass no running
worker had.

**One safety gap found and fixed in the already-landed code before trusting
it under 10-way concurrent load**: `pdftotextFallback`'s `execFileSync` had
no `timeout`. Synchronous calls block the whole event loop, so a hang there
cannot be raced by `withTimeout` the way the async `unpdf` path can — the
exact class of hang `withTimeout` exists to prevent, reproduced
synchronously. Added `timeout: 30_000`.

**Verified**: `execFileSync('pdftotext', ...)` confirmed callable from a
plain Node process (not just interactively) before trusting it in a detached
worker — a real trap another concurrent session independently hit and fixed
in the same file (`PDFTOTEXT_PATH` / explicit Git-for-Windows path
resolution, since poppler is on Git Bash's PATH but not a detached
PowerShell-launched process's). 48 tests green (`hc-load.test.ts` +
`hc-metadata.test.ts` + `text-corruption.test.ts`), `tsc --noEmit` clean.
All 10 workers relaunched with the fix; every document ingested from this
point carries the repair pass.

**Not backfilled**: documents already written before this landed (including
whatever fraction of the ~260K HC documents ingested so far hit this defect)
still carry `unpdf`'s possibly-garbled text. A backfill re-extracting
`text_quality`-blind-but-`classifyCorruption`-positive rows is real,
identifiable follow-up work, not done here — scope discipline over the
already-large change in this entry.

### Q1.26 · GATE S2 RE-MEASURED AGAINST A 7.7× LARGER CORPUS · 12 Aug 2026

Gate S2's own harness (`services/harness`, 283 citation-edge-derived + 5
audited cross-lingual gold queries — real gold, `queries.eval.json`/
`queries.hand.json`, not invented this session) had not been run since
8 Aug 2026 (`baseline.json`), against a corpus of 38,341 judgments. Re-ran
it now against 297,291 (7.7×, all growth High Court per the concurrent
lane's scale-up, still correctly unembedded per FQ-CORPUS).

| metric | 8 Aug baseline | 12 Aug re-run | delta |
| --- | --- | --- | --- |
| success@5 | 24.0% | **24.0%** | unchanged |
| recall@20 | 44.0% | **44.0%** | unchanged |
| mean precision@5 | 4.8% | **4.8%** | unchanged |
| MRR | 0.2395 | **0.2203** | -8% relative |
| DRM (duplicate rate metric) | 95.2% | **95.2%** | unchanged |
| overruled leakage | not in baseline | **0 / 46** | clean |
| stale-overruled rate | 0.0% | **0.0%** | unchanged, confirms Q1.24 |
| structured exactness | not in baseline | **100.0%** | clean |

**Read honestly, not smoothed over.** `success@5` is EXACTLY the same
decimal at 7.7× the corpus size — the 283 gold queries' correct answers are
overwhelmingly Supreme Court judgments the growth didn't touch or compete
with in a way that moved this specific metric. MRR's ~8% relative dip is
small but real, and has a concrete, already-diagnosed mechanism: Q1.25 (this
file, above) traced exactly why — more sparse-ranking candidates from
corpus growth means more documents can out-rank a correct answer on raw
term frequency, without necessarily pushing it outside the wider top-20
window `recall@20` checks. One explanation for two numbers, not two
separate mysteries.

**Gate S2 still FAILS** — `success@5` at 24.0% against a 70.0% threshold,
same as 8 Aug. This session's work (Stage 13, the offset backfill, both
chunk.ts fixes) did not move this number, which is coherent with what
those fixes actually targeted: exact-span EVIDENCE accuracy for a chunk
already retrieved, not which chunk gets retrieved in the first place. The
lexical-ranking gap (Q1.25) is the mechanism most directly implicated by
this measurement and remains the highest-value next fix, not yet attempted
this session for the reasons stated there.

**`hallucinationRate`, `silentDropRate`, `adversarialPassRate`: NOT
MEASURED, not 0%.** The generation stage's 25/25 calls failed on
`http 429 service failure: tenant tn-ewuc4` — an OpenRouter capacity/rate
issue, external to this codebase and this corpus, not a code or data
defect. The harness's own refusal to report a rate from a failed run
(*"Calls failed, so neither rate is reported. A partial run is not a
run."*) is the correct behaviour and is why this is reported as
"not measured" rather than papered over as a pass. Re-running the
generation stage alone, later, when OpenRouter capacity recovers, would
complete this — not attempted again this session.

Raw output: `gate-s2-rerun.json` (not committed — a point-in-time
measurement, not a fixture; `baseline.json` is the one meant to be durable
and was intentionally left untouched by this run so the 8 Aug number stays
comparable).

### Q1.28 · `text_extraction_method` LANDED; A 20-MINUTE FALSE ALARM CHASED TO GROUND · 12 Aug 2026

**Added `judgments.text_extraction_method`** (migration `0048`, applied) —
`fetchPdfText` now reports `'unpdf'` or `'pdftotext_fallback'`, threaded
through `hc-load.ts`/`sci.ts`/`load.ts`/`cli.ts`. Without it Q1.27's fix had
no visibility of its own: no way to ask how often the repair pass actually
fires. `load.test.ts` green against real Postgres (rolled back), 80 tests
across the harvest/text suites. All 10 workers relaunched a third time.

**Then chased what looked like a severe regression from that exact
change for ~20 minutes — it was not one.** Workers showed `seen` climbing
into the thousands with `mapped=written=0`. Ruled out in order: (1) a bounded
CLI dry-run isolated it to 100% `pdf_missing` on one file; (2) direct `fetch()`
against those exact URLs confirmed real 404s from S3, not a parsing defect;
(3) an isolated `fetchPdfText` call against Allahabad candidates succeeded
5/5 in under 2.5s each, clearing the extraction path itself; (4) a plain
`SELECT count(*)` against `judgments` measured **11.8 seconds** — against
`docs/LANE_PROTOCOL.md`'s own freshly-written warning that the shared
Railway proxy is slow under load with five lanes now on it. **Verdict:
ordinary data noise (some source partitions' `pdf_link` values are
genuinely broken) plus shared-proxy congestion, not a code defect** — the
boring explanation, not the exotic one, per the debugging protocol's own
ordering. No revert made. Announced on the bus (`0077`–`0080`) so no other
lane re-chases the same false trail.

### Q1.29 · JOINED THE 5-LANE RING AS NEW2; CITATIONS HANDED BACK TO LCC; SCALED TO 14 · 12 Aug 2026

**`docs/LANE_PROTOCOL.md` formalised the bus into five lanes today.** Bound
this session as NEW2 (ingestion). Under the new ownership table citations are
explicitly LCC's ("classification, metadata, citations, treatment, evidence
spans"), not NEW2's — the citation-rescan loop this session ran earlier
(Q1.21, Q1.28) predates the ring and was straddling a boundary that didn't
exist yet. It finished its last queued iteration on its own; **not
restarted**, handed back to LCC on the bus (`0093`).

**Scaled from 10 to 14 HC ingest workers** — added Chhattisgarh (`22_18`),
Jharkhand (`20_7`), Andhra Pradesh (`28_2`), Delhi (`7_26`), the next tier by
`HC_METADATA_SURVEY.json` size after the eleven already running. Deliberately
smaller than the earlier 4→10 jump: NEW1 flagged on the bus (`0087`) it is
about to run DB-heavy retrieval measurement jobs and is being careful not to
compound proxy load, so this lane matched that by adding four, not another
ten, and checked the connection budget (23/100) and easing proxy latency
(11.8s → 4.2s on a plain count) before doing even that.

**HC total at last measurement: 309,113**, up from 103,486 at the start of
the founder's 10× ask (target 1,034,860).

### Q1.30 · 18 WORKERS — CROSS-LANE GAP FINDING ACTIONED · 13 Aug 2026

**NEW3's `COVERAGE_GAP_MATRIX.md` (bus `0101`) found two courts under-
scheduled, not blocked**: Himachal Pradesh 8/188,548 held (0.004%) and J&K
2/112,046 (0.002%), both far below Tripura/Manipur/Meghalaya/Sikkim despite
being larger sources — same authorized AWS bucket as every other court.
Also flagged Uttarakhand (holding stops 1987) and Gujarat (stops 1995) as a
**recency** gap distinct from raw coverage percentage — the ~25–30 most
recent years are entirely unheld for both, which matters more to a
practising advocate than the percentage suggests.

**Root cause, not just the fix**: the general (`--from-year 2016`,
no `--court` filter) sweep processes all 550 metadata files newest-first,
but the growing set of dedicated per-court workers absorbs concurrency
ahead of it in practice, so courts without a DEDICATED worker simply hadn't
been reached yet. This explains both findings as one cause, not two.

**Added 4 more dedicated workers** — HP (`2_5`), J&K (`1_12`), Uttarakhand
(`5_15`), Gujarat (`24_17`) — all `--from-year 2016`, so this reaches the
recency gap directly. **18 HC ingest workers running.** Also applied LCC's
`connect_timeout: 120` fix (bus `0091`, the shared-proxy `CONNECT_TIMEOUT`
LCC's own workers died on) to `hc-load-cli.ts`, on new launches only —
did not force a disruptive restart of the 14 already healthy and writing.
Confirmed on the bus (`0102`).

### Q1.29 · THE FIRST NEW1→NEW3 MISSING-AUTHORITY FEEDBACK LOOP RUN — real numbers, no acquisition gap · 13 Aug 2026

`failure:classify` finished against the full real gold set (288 queries;
285 classified, 3 recoverable network timeouts flagged for a retry pass).
No invented gold — every query's answer is a citation edge drawn from this
corpus's own text.

| class | count | share |
| --- | --- | --- |
| SUCCESS (gold in top 5) | 48 | 16.8% |
| AUTHORITY_RETRIEVED_BUT_BADLY_RANKED | 97 | 34.0% |
| AUTHORITY_HELD_BUT_NOT_RETRIEVED (not in top 50) | 140 | 49.1% |
| NO_AUTHORITY_FOUND | **0** | 0.0% |

**The headline finding, stated plainly: every single failure this run
found is OURS, not a data gap.** 83.1% of queries fail to surface their
gold judgment in the top 5, and **100% of that failure is retrieval or
ranking — zero is a missing document.** `NO_AUTHORITY_FOUND` cannot fire
against this query set by construction (gold is drawn from the corpus's
own citation edges, so it is definitionally held) — stated as this run's
honest boundary, not evidence of a clean corpus. But `AUTHORITY_HELD_BUT_
NOT_RETRIEVED` (140, not found even at depth 50) vs `AUTHORITY_RETRIEVED_
BUT_BADLY_RANKED` (97, found but past rank 5) is real, measured evidence:
the larger failure mode is the corpus not surfacing the document AT ALL
within 50 candidates, not merely ranking it poorly — which matters for
where to spend effort next (recall first, ranking second).

**Secondary finding, on the 145 queries that DID find their gold judgment
(SUCCESS + BADLY_RANKED): 137 (94.5%) carry `EVIDENCE_WRONG`** — an empty
`operativeParagraph` or a null `operativeParagraphNumber` on the matched
result. `CITATION_UNRESOLVED` did not fire on any found authority (both
`neutralCitation` and `reporterCitations` are never simultaneously empty
on a match).

**ROOT-CAUSED same day, by LCC (bus 0124) — not an evidence bug, chunk
coverage.** `judgments` is now 592,027 rows; only 40,161 (6.8%) carry any
`judgment_chunks` row at all, so 551,866 (93.2%) can have no
`operativeParagraph` by construction — there is genuinely no passage
behind a lexical-only match on those. Matches the 94.5% almost exactly.
This is the same 37.6%-on-9-Aug number `retrieve.ts`'s own comment already
documented as expected behaviour, now much larger because NEW2's ingest
took the corpus from ~79k to 592k and essentially all of the growth is
un-chunked High Court text — the same FQ-CORPUS boundary as everywhere
else this session, not a new gap. **Worth carrying forward**: LCC
separated CHUNKING (text only — `chunk_text`/`char_offset`/`char_length`,
cheap) from EMBEDDING (the vector, the restricted/expensive part) —
display evidence only needs the former. Not something this lane acts on
(corpus writes are outside the NEW1 charter), noted for whoever owns that
scope decision next.

**NEW3_ACQUISITION_QUEUE.json: 0 new entries.** Per `docs/LANE_PROTOCOL.md`
§3 ("a gap you cannot close → the lane that can"), nothing from this run is
sent to NEW3 — there is nothing genuinely missing to send. Sent downstream
on the bus instead: the finding itself, so NEW3/LCC do not read silence
as "NEW1 has nothing to report" and so ranking failures are not mistaken
for acquisition gaps by anyone reading `AUTHORITY_HELD_BUT_NOT_RETRIEVED`
out of context.

### Q1.30 · Q1.25'S FIX, SCOPED — a pin that already has a home, not a new mechanism · 13 Aug 2026

Re-verified Q1.25 first, not assumed stale: `S. N. DUTT versus UNION OF
INDIA` still fails to appear in the sparse AND-path's top 50, now against
**492,020 judgments** (up from 297,291 at the original diagnosis) — capped
at 50/50 candidates, meaning dilution is measurably worse as the corpus
grows, not better. The mechanism holds.

**The fix has a home already, found by reading rather than designing from
scratch.** `services/api/src/search/query-shape.ts` already classifies
`X v Y` / `X vs Y` / `X versus Y` queries as `shape: 'case_name'`
(`CASE_NAME_RE`) — **every one of Q1.25's traced failures matches this
shape exactly.** But `warrantsExactLookup` only returns true for
`shape === 'citation'`; `case_name` queries fall through to the ordinary
hybrid pipeline on the strength of a comment in the same file: *"a case by
name, where the lexical ranker is already strong."* Q1.25 is the direct,
measured disproof of that claim, sitting three lines from the assumption.

**Scoped implementation, not yet written:**

1. `exactCaseTitle(sql, queryText, filters)` in `retrieve.ts`, mirroring
   `exactCitation()` exactly: case-insensitive, whitespace-normalised
   comparison against `judgments.case_title`. Pins ONLY when it resolves to
   **exactly one** row — same asymmetry `exactCitation()` already commits
   to (*"a missed [match] costs nothing; a wrongly-claimed one pins the
   wrong judgment at rank 1"*).
2. In `hybridSearch()`, extend the existing pin branch to also fire when
   `shape.shape === 'case_name'`, not only `'citation'`.
3. **Deliberately NOT fuzzy.** An exact (normalised) match only — this
   fixes precisely the measured failure (an advocate's query IS the
   printed case title, verbatim, which is what all four traced cases and
   this eval set's `case_name`-shaped queries actually are) without
   introducing similarity scoring, which would reopen exactly the
   "changing ranking weights without a controlled experiment" risk this
   whole exercise exists to avoid.
4. **Does not touch `full_text_tsv`.** No schema migration, no change to
   how sparse or dense rank anything that isn't pinned — additive only,
   same risk class as the citation pin already in production.

**Why this cannot trade concept quality for title quality**: the new pin
only ever fires when `classifyQuery` already returns `case_name` — a
`concept` query never enters this branch, so there is no shared weight or
threshold for a title fix to distort.

**Measurement plan, fixed BEFORE implementation, per this lane's own
standing rule against tuning without one:**

- **Primary (BEFORE)**: the controlled Stage-10 arms comparison already
  running (`ARMS_PASS=controlled`, `courts=['sc']`, full 283-query gold
  set) — success@5, recall@20, MRR, nDCG@5/@20, for `hybrid` specifically
  (production's arm), holding the haystack constant so the number reflects
  the ranker, not corpus size. Isolates exactly what a case-name pin can
  and cannot move.
- **AFTER**: same command, same corpus state (re-run immediately after
  the fix lands, not delayed — corpus is growing hourly and a stale
  comparison would confound growth with the fix, exactly Q1.25's own
  lesson).
- **Query-type split**: the 283-query gold set's `group` field only
  distinguishes criminal/civil, not shape — a real gap for a claim like
  "this helped case-name queries specifically." `retrieval:regression`'s
  `bench-queries.ts` (20 queries, already labelled `concept` / `section` /
  `citation` / `case-name` / `procedural`) is the existing tool with the
  right shape for that finer cut; run before and after alongside the
  283-query gold set, not instead of it.
- **Pass/fail for shipping the fix**: recall@20 and MRR on `case_name`-
  shaped queries improve without a measured regression on `concept`-shaped
  queries in the same run. A win on one at a measured cost to the other is
  reported, not shipped silently.

**BEFORE baseline, landed** — controlled (`courts=['sc']`), `ARMS_LIMIT=100`
(the full 283 would run ~5h under current five-lane DB-proxy load; 100
matches `ab-cli.ts`'s own established default for exactly this reason):

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| sparse | 7.0% | 13.0% | 0.053 | 0.053 | 0.070 |
| dense | 17.0% | 34.0% | 0.118 | 0.116 | 0.168 |
| hybrid (production) | 12.0% | 30.0% | 0.093 | 0.087 | 0.137 |

Paired (McNemar, success@5, discordant queries only):

| pair | gained/lost | p | queries to settle |
| --- | --- | --- | --- |
| dense vs sparse | +12 / −2 | **0.0129** | ~91 |
| hybrid vs sparse | +5 / −0 | 0.0625 | ~77 |
| hybrid vs dense | +3 / −8 | 0.2266 | ~324 |

**This partially settles LCC's bus 0061 question, and the honest answer is
narrower than either "yes" or "no."** The corpus-size confound LCC
suspected (sparse reaching a haystack the dense arm cannot) is controlled
for here — both arms see the identical Supreme-Court-only set. **Hybrid
still underperforms dense on every point estimate** (12.0% vs 17.0%
success@5; 30.0% vs 34.0% recall@20; 0.093 vs 0.118 MRR) even with the
confound removed, which the confound theory alone does not explain. But
`hybrid vs dense` is the one comparison that does **not** reach
significance at this sample size (p=0.2266, ~324 queries needed) — so the
correct statement is *"directionally worse, not yet proven,"* not *"proven
worse."* Sparse is unambiguously the weakest arm (dense beats it at
p=0.0129). Neither RRF fusion nor the corpus-size confound is ruled out by
this run alone; both remain live explanations. **Not acted on** — this
lane does not tune RRF or fusion weights from one controlled-but-
underpowered run, per its own standing rule.

**AFTER measurement, attempt 1 — crashed mid-run, real data recovered
anyway.** `arms-controlled-after.log`: sparse and dense both completed
before the process died on `hybrid 20/100` with an uncaught `ENOTFOUND`.

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| sparse | 7.0% | 13.0% | 0.053 | 0.053 | 0.070 |
| dense | 17.0% | 34.0% | 0.118 | 0.116 | 0.168 |

**Byte-identical to BEFORE, both arms, all five metrics.** Not a build
error — checked directly: `exactCaseTitle`'s SQL fires and correctly
finds nothing to pin for the vast majority of this query set, because
**the case-name pin was never going to move this benchmark.**
`build-queries.ts`'s whole redaction step exists to strip a cited case's
distinctive title words out of the query text so the task measures
retrieval rather than string lookup (its own header, "LEAKAGE"). A
benchmark built to remove case names from its queries cannot, by
construction, exercise a fix for typing a case name. Q1.25 was correctly
verified a different way — direct live smoke tests against real
case-name queries (`S. N. DUTT versus UNION OF INDIA` and the other
three traced failures) — and that verification stands; this benchmark
was never going to corroborate or refute it, and expecting it to would
have been the wrong check.

**A second, real finding surfaced while explaining the first.**
`query-shape.ts`'s `CASE_NAME_RE` (`/\S+\s+(?:v|vs|versus)\.?\s+\S+/i`)
misclassifies 161 of the 283 gold queries as `case_name` shape — checked
directly, not assumed: these are reasoning passages that happen to
contain a bare `v` or `versus` token, e.g. one example began *"(2) For
the purposes of this section, a fact is said to be proved only when the
Special Court believes it to exist beyon…"*, which is not a case-name
lookup by any reading. Every one of those 161 now fires an extra
`exactCaseTitle` query per search that Q1.25 did not need to add.

**Resolved: 0 of 161 actually false-pin.** First check attempt (161
sequential round trips, one per query) hung for 12 minutes under current
load with zero CPU progress — not a bug in the check, just the wrong
shape for this load: killed and rewritten as **one batched query**
(`unnest` + a single join, the same "batch, don't loop" lesson Q1.32's
`fillParagraphFallback` already applied), which answered in seconds:
`161 checked, 0 actually pinned (exactly 1 row)`. Confirmed by
construction, not luck — these are reasoning passages, essentially never
an exact normalised match against any `case_title`. So the 161 cost is
real (a wasted round trip per search) but bounded and not a correctness
risk; worth a tighter `CASE_NAME_RE` at some point, not urgent.

**AFTER measurement, attempt 2 — also crashed, same ENOTFOUND, before
logging its first checkpoint.** `arms-cli.ts` hardened
(`scoreQueryResilient`, retries the same transient-network codes NEW2
root-caused on their own workers — bus `0159`, a local DNS hiccup
resolving the Railway proxy hostname, not shared-proxy load; unlike
their fix this retries per-query rather than the whole run, since this
loop has no checkpoint and paired McNemar needs every arm on the
identical query set) and relaunched, but the underlying pace — one
query in flight against a proxy every other lane is also hitting right
now — was still the binding constraint.

**Attempt 3 — running, now with bounded concurrency (`CONCURRENCY = 6`,
`scoreAllConcurrently`).** Measured directly: the sequential pass was
spending nearly all its wall time waiting on the network round trip,
not on CPU, so overlapping 6 in flight (not unbounded — the proxy is
already strained ring-wide) should cut wall time roughly in proportion
without piling on. Order is preserved per-index specifically because a
shuffled row would silently corrupt every McNemar gained/lost count.
Launched as a tracked background task with a live Monitor watching for
both progress lines and the exact crash signatures attempts 1 and 2
hit, so a repeat surfaces immediately rather than 40 minutes later.
Typecheck clean, harness suite 123/123 both times. `judgment_citations`
checked directly while waiting: **775,874 rows**, up from 444,621 at
LCC's last report — still climbing, so TARGET 1's `failure:classify`
re-run stays held for their explicit signal, per their own stated
reason (a moving gold-findability baseline), not restarted early.
Adopted `openDb()` (LCC, bus 0169) partway through, root-fixing the
DNS hang the previous two attempts died to rather than only retrying
around it — see the harness commit log; not repeated here.

**Attempt 3 — COMPLETE.** All three arms finished, no crash (one
`ECONNRESET` on each of sparse and hybrid, both caught and retried
automatically by `scoreQueryResilient`, exactly the resilience layer
existing for this). Total wall time sparse+dense+hybrid: 1,400s (~23
min) — the same three arms that had not even logged sparse's first
20/100 checkpoint after 10 minutes in attempt 2.

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| sparse | 7.0% | 13.0% | 0.053 | 0.053 | 0.070 |
| dense | 17.0% | 34.0% | 0.118 | 0.116 | 0.168 |
| hybrid (production) | 12.0% | 30.0% | 0.093 | 0.087 | 0.137 |

Paired (McNemar, success@5, discordant queries only):

| pair | gained/lost | p | queries to settle |
| --- | --- | --- | --- |
| dense vs sparse | +12 / −2 | 0.0129 | ~91 |
| hybrid vs sparse | +5 / −0 | 0.0625 | ~77 |
| hybrid vs dense | +3 / −8 | 0.2266 | ~324 |

**BEFORE and AFTER are identical to three decimal places on every
metric, every arm, every McNemar pair.** Not a null result about
whether the run worked — it is the expected result, now with hybrid
confirming what sparse and dense already showed in attempts 1 and 2:
Q1.25's case-name pin cannot move this benchmark, because
`build-queries.ts`'s own redaction step strips distinctive case-title
words out of every gold query specifically to prevent leakage. A
benchmark built to remove case names from its queries was never going
to exercise a fix for typing one. **Q1.25 stands on its own live
verification** (the four traced real-world failures, `S. N. DUTT
versus UNION OF INDIA` and three others, now pinning correctly) — that
remains the correct evidence for it, and this closes the loop by
confirming the benchmark neither corroborates nor contradicts it, as
predicted before the run rather than rationalised after.

**What this run actually cost 90 minutes of engineering time to
establish, honestly stated**: not "did Q1.25 work" (already known) but
"is this specific 283-query harness capable of detecting a case-name
fix at all" (no, structurally, now confirmed rather than assumed) —
plus, as a side effect, hardening `arms-cli.ts` against the exact DNS
failure class that has cost every lane hours this session, and
resolving the 161-query `CASE_NAME_RE` false-positive question (0
actual false pins). Both outputs outlast this one comparison.

**Q1.30 is now CLOSED.** Reported to LCC on the bus.

### Q1.31 · 20 WORKERS — Calcutta and Gauhati dedicated · 13 Aug 2026

Added `19_16` (Calcutta, 406,413-document inventory) and `18_6` (Gauhati,
232,057) as dedicated workers — the two largest courts still riding the
general sweep alone. **20 HC ingest workers running.** The four remaining
undedicated courts (Tripura, Manipur, Meghalaya, Sikkim) are all under
34,000 documents each and already had proportionally strong coverage from
earlier general-sweep passes — left to the sweep rather than dedicated,
diminishing returns at that size. LCC independently confirmed corpus total
at **466,633** (bus `0105`) — up from 103,486 at the start of the founder's
10× ask.

**Recurrence, 13 Aug**: Madras and Orissa both hit the same "unsettled
top-level await" shutdown quirk as Q1.21/the earlier citation-rescan crashes
— at `await sql.end()`, after real progress (5,708 and 9,187 written this
run respectively), not mid-batch. No data lost either time. Relaunched both;
not root-caused further — a recurring but low-severity Node/postgres
shutdown interaction under this environment's sustained load, worth a
restart, not worth blocking on.

### Q1.17 · FOUNDER DECISION — DATA BEFORE EMBEDDINGS · 13 Aug 2026 · SETTLED

> **Fund chunk-text coverage now. Start embeddings only once we hold all
> available data from all courts, ALL cases and citations are in, and the data
> is structured and ready. Data is the priority; embeddings come after.**

**This is sequencing, not a preference, and it reframes every lane.** Nobody
starts an embedding run. Missing vectors are not a defect — they are a
deliberate ordering. **NEW2 (ingestion) and NEW3 (discovery) are now the
critical path**: embeddings wait on their completeness, not the reverse.

**Executed same day.** `judgment_paragraphs`, migration `0049`, applied.
Paragraph-level evidence for the whole corpus with no vectors — closing the gap
NEW1 measured (94.5% of retrieved queries returning an empty
`operativeParagraph`, because only **40,161 of 600,073 judgments had any
passage stored**).

**It deliberately does NOT write to `judgment_chunks`.** That is the vector
table, and `retrieve.ts`'s dense query is `ORDER BY c.embedding <=> $1 LIMIT n`
over it with **no `WHERE embedding IS NOT NULL`** — read in the source, not
assumed. ~550,000 embedding-less rows would grow it ~15× and invite the planner
to abandon the HNSW index. **Paying for evidence display with production search
latency is not a trade worth making quietly.** When embeddings are funded,
chunks derive *from* these paragraphs rather than being re-split.

**Measured on 600 real judgments:** 4,289 paragraphs, **86.0% carrying a
court-printed number**, **0 refused for lost text**, 7.1 paragraphs/judgment.

**Why paragraphs rather than fixed windows — checked against outside sources,
not assumed:**

- The Supreme Court's **July 2023 direction requires** *"all paragraphs should
  be numbered sequentially commencing with the initial paragraph"*. Judgments
  carry their own citable units; *"para 14"* is what goes in a filing, and a
  pinpoint we invented is not one an advocate can use. The 86.0% measured above
  is that mandate holding in practice.
- **Structure-preserving segmentation outperforms sequential chunking on legal
  text** (NLLP 2025), because a provision's meaning is bound to its numbering
  and heading. Semantic chunking adds 15–25% accuracy at 3–5× compute — exactly
  the trade this decision defers.
- **Document-Level Retrieval Mismatch worsens as a corpus scales**
  (arXiv 2510.06999) — the retriever picks chunks from *wrong* documents sharing
  superficial similarity. NEW1's 49.1% held-but-not-retrieved was measured while
  the corpus went 79k → 600k, so some degradation is scale, not regression.
- The Bombay extraction failure is a **documented class**: subset fonts with
  incomplete ToUnicode CMaps defeat pdf.js where poppler succeeds.

### Q1.16 · THE RING, AND FOUR DEFECTS THAT ONLY APPEAR AT SCALE — 13 Aug 2026

**The bus now carries five lanes** (`docs/LANE_PROTOCOL.md`): NEW3 discovery →
NEW2 ingestion → LCC enrichment → NEW1 retrieval → back to NEW3. RCC sits
outside the ring. LCC orchestrates.

**Corpus grew from 79,322 to 600,073 judgments in one session.** Every defect
below is one that did not exist at the smaller size.

**1 · THE CITATION PASS WAS READING THE WRONG END OF THE CORPUS.** It produced
`edges=0` across **8,100 consecutive documents** — the Q1.0c shape. The
extractor was checked directly against the same population and was FINE (5 of 8
documents containing "SCC" yielded citations, including `2020\n(11) SCC 648` and
`(2003)4\nSCC 675`). The defect was `ORDER BY judgment_date DESC`: NEW2's ingest
is loading 2026 documents, and those are overwhelmingly bail orders — **57,876
bail orders and 20,641 procedural disposals against 39,914 reasoned decisions**.

| | documents | edges |
| --- | --- | --- |
| newest-first | 8,100 | **0** |
| substantive-first | 12,900 | **12,794** |

**2 · `EVIDENCE_WRONG` IS CHUNK COVERAGE, NOT AN EVIDENCE BUG.** NEW1 measured
94.5% of successfully-retrieved queries carrying an empty `operativeParagraph`.
Root cause: **40,161 of 600,073 judgments have chunks (6.7%)**. `retrieve.ts`
already documents that an empty paragraph is legitimate for a lexical-only
match; it was 37.6% on 9 Aug and is 93.2% now purely because the corpus grew and
the growth is unchunked. **Chunking and embedding are separable costs** — a
passage to display needs the text, only the reranker needs the vector. HC
embedding remains out of scope.

**3 · THE 34 EDGES WHERE A WRONG ANSWER MARKS DEAD LAW LIVE.** NEW3 found them
and ranked them correctly. `overruled-resolve-cli.ts`: 13 candidates (several at
Jaccard 1.00), 1 ambiguous, 6 thin, 13 no candidate. **It writes nothing, by
design and permanently** — a wrong `overruled` link is worse than an unresolved
one, and 34 rows is a tractable human read.

**4 · TWO WORKERS DIED OF THE SAME PAIR OF CAUSES.** `OFFSET` pagination against
a table NEW2 is writing to (re-reads some rows, silently skips others), and a
proxy connection with no `connect_timeout` that hangs instead of erroring
("Detected unsettled top-level await" at 115,500 of 377,526). Both hardened.
**Any long-running job in this repo needs keyset pagination and a connect
timeout** — this cost an hour twice.

**Also:** OpenRouter added as the paid fallback when InferX saturates, with a
circuit breaker after 3 consecutive capacity failures (18 → 70 documents in
three minutes). Cost is the figure OpenRouter reports, never an estimated rate.
`document_enrichments` writes were outside the retry wrapper and are now inside.

**Statute references cover 25,466 of 592,027 documents (4.3%)** — backlog pass
running.

### Q1.32 · ALL 25 COURTS NOW HAVE A DEDICATED WORKER — the founder's "data before embeddings" decision · 13 Aug 2026

**Founder decision, relayed via LCC (bus `0134`), settled and binding on the
whole ring**: fund chunk-text coverage now; start embeddings only once all
courts, all cases and citations are in and structured. **"NEW2: your lane is
now the critical path — embeddings wait on your completeness."**

Added the last four courts still riding the general sweep alone — Tripura
(`16_20`), Manipur (`14_25`), Meghalaya (`17_21`), Sikkim (`11_24`), the
smallest by inventory (11.7K–33.8K documents each) and already had
proportionally strong coverage, but "all courts" per the founder's own
wording means all 25, not the large ones only. **24 workers running: the
general sweep plus one dedicated `--court` worker per High Court in the
AWS bucket.** Coverage is now complete at the court level; depth within
each court is the remaining work.

Committed on the bus (`0136`) to messaging LCC when any court crosses ~50%
of its own source-document count, so citation/statute passes can target it
while fresh.

### Q1.32 · `judgment_paragraphs` — a real fix for EVIDENCE_WRONG, scoped not yet wired · 13 Aug 2026

**Founder decision, 13 Aug 2026, via LCC (bus 0133): fund chunk-TEXT
coverage now; embeddings wait until every court's data is held, all
citations are in, and the corpus is structured.** This is the direct
answer to Q1.29's `EVIDENCE_WRONG` finding and LCC's root-cause (bus
0124) — chunking (text, cheap) and embedding (vectors, deferred) are
separable, and LCC built the cheap half: `judgment_paragraphs` (migration
0049, applied, running), paragraph-level evidence — `paragraph_text`,
`paragraph_number` (nullable, court-printed), `char_offset`/`char_length`
(byte-exact against `full_text`) — **deliberately a separate table from
`judgment_chunks`**, so the vector index stays exactly as small and fast
as it is today. Confirmed by reading the migration, not assumed.

**Verified live, real data, not the design doc alone**: 9,914 of 626,192
judgments carry paragraphs already (early in the backfill, growing), and
a real judgment with paragraphs but zero `judgment_chunks` rows — exactly
`EVIDENCE_WRONG`'s shape — returns real, usable paragraph text on query.

**Not wired into `retrieve.ts` yet, scoped rather than rushed:**

1. A new fallback, `paragraphFallback(sql, judgmentId, query)`, used ONLY
   when a matched judgment has no `bestChunk` entry (sparse-only match, no
   dense chunk — precisely the population `EVIDENCE_WRONG` measured).
2. **Query-aware selection, not "just the first paragraph"** — same
   philosophy `passagesForRerank` already commits to for its own fallback
   (*"the chunk of that judgment nearest the QUERY, not chunk zero"*):
   rank a judgment's paragraphs by `ts_rank` against the query text, take
   the top one. A judgment's cause title (paragraph 0) is exactly the
   content-free candidate that mechanism was built to avoid handing to a
   reader as if it were the reasoning.
3. **Must be batched, not per-row.** `hybridSearch`'s result-building loop
   currently makes no per-candidate DB call; adding one naively inside it
   would cost real latency against Gate S1's 3-second budget for exactly
   the sparse-only matches this is meant to help. The batching pattern
   already exists to copy: `passagesForRerank`'s `DISTINCT ON` query,
   `retrieve.ts`.
4. **Measurement, before shipping, same standing rule as Q1.25**: re-run
   `failure:classify`'s secondary-flag count before/after — `EVIDENCE_WRONG`
   should drop specifically among `AUTHORITY_HELD_BUT_NOT_RETRIEVED`-turned-
   found and `AUTHORITY_RETRIEVED_BUT_BADLY_RANKED` cases whose judgment now
   has a `judgment_paragraphs` row; it should not move at all for judgments
   that still have neither table populated (a real negative control).

**IMPLEMENTED AND VERIFIED LIVE, 13 Aug 2026.** `fillParagraphFallback(sql,
results, query)` in `retrieve.ts`, wired into `hybridSearch()` right before
`return results` — runs unconditionally across sparse/dense/hybrid modes
since it only fills display evidence, never touches ranking/order:

1. Scans the already-built result set for entries with an empty
   `operativeParagraph` (the sparse-only-match population `EVIDENCE_WRONG`
   measured) and collects their judgment IDs.
2. **One batched query**, not per-row: `SELECT DISTINCT ON (judgment_id) ...
   FROM judgment_paragraphs WHERE judgment_id = ANY($ids) ORDER BY
   judgment_id, ts_rank(...) DESC` — the same `DISTINCT ON` pattern
   `passagesForRerank` already uses, query-aware per item 2 above, not "just
   the first paragraph."
3. Populates `operativeParagraph`, `operativeParagraphNumber`,
   `operativeParagraphVerified: true`, and `exactSpan` (`charOffset`/
   `charLength` straight from the row, byte-exact against `full_text` per
   the migration's own guarantee) on the matched result in place.

**Verified**: `pnpm --filter @lawmind/api run typecheck` clean.
`pnpm --filter @lawmind/api run test` — 262/456 pass, 23 fail, identical to
this session's established baseline (pre-existing DB-connectivity failures,
confirmed unrelated by diffing against stashed `main` earlier in the
session). **Live smoke test against production**, not the design doc alone:
picked a real judgment (`078d8dea-5a2d-428e-9632-000c598bdb07`, "LATE
ASSISTANT COMMISSIONER M K BHATNAGAR ... Vs PRINCIPAL CHIEF CONTROLLER
ACCOUNT MINISTRY OF HOME AFFAIRS & ORS.") with `judgment_paragraphs` rows
and zero `judgment_chunks` rows, queried `hybridSearch` with a phrase from
one of its paragraphs — the judgment came back with `operativeParagraph`
populated, `operativeParagraphNumber: 20`, `operativeParagraphVerified:
true`, `exactSpan` present. Confirms the exact `EVIDENCE_WRONG` shape now
gets real evidence instead of an empty operative paragraph.

**Not yet done**: the item-4 measurement (re-run `failure:classify`
before/after, checking `EVIDENCE_WRONG` drops specifically among judgments
that now carry a `judgment_paragraphs` row and holds flat for the negative
control) — deliberately deferred per LCC's own standing ask to hold the
re-run until their citation backlog (444,621 rows and climbing at last
check) completes, so "the gold answer is findable" doesn't shift mid-measurement.

**Also relevant to Q1.29's own re-run** (LCC's research, bus 0133,
arxiv.org/pdf/2510.06999): Document-Level Retrieval Mismatch is a named,
studied failure that *worsens as the corpus scales* — Q1.29's 49.1%
`AUTHORITY_HELD_BUT_NOT_RETRIEVED` was measured while the corpus grew
~79k→600k mid-session. Some of that number may be corpus-scale rather
than a static property of the ranker; worth controlling for (or at least
stating) when `failure:classify` is re-run, per LCC's own standing ask —
hold the re-run until their citation backlog (444,621 rows and climbing)
completes, since that changes what "the gold answer is findable" means
too.

### Q1.33 · THE GATE IS PARITY, NOT COMPLETION — `docs/RING_PROGRAM.md`, connect_timeout rolled to every worker · 13 Aug 2026

**LCC's `RING_PROGRAM.md` (bus `0140`) reframes the target precisely**: the
AWS source is `~17.8M judgments · 25 courts · 45 benches`, **updated
daily**. The gate is not "ingest everything once" — it is *reach parity
with the source, then stay current*. Also settled: "all courts" means the
25 High Courts + Supreme Court, explicitly **not** the ~33M NJDG
district-court universe (unauthorized, a different question entirely). This
lane has not touched district courts and will not on its own reading of
"all courts."

**`connect_timeout: 120` rolled to every worker, not just new launches.**
Two hangs this session (Madras, Orissa — flat CPU, confirmed not just slow)
match the exact failure LCC named — "a proxy connection with no timeout
that hangs instead of erroring" — and it is now a binding rule across the
whole ring (`RING_PROGRAM.md` §4). Rather than wait for the remaining 7
pre-fix workers to hang too, restarted them proactively: Allahabad, Punjab,
Rajasthan, Karnataka, Madhya Pradesh, Kerala, Telangana, plus the general
sweep. **All 25 workers now run identical, current code.**

**Sikkim finished its `--from-year 2016` scope naturally** (11 metadata
files, smallest court) and was relaunched with no year floor to capture its
full history — 27 files in scope instead of 11. The other small courts
will hit the same natural completion soon; each gets the same treatment
rather than being left capped at the last decade, since "all available
data" per the founder's own wording is not scoped to one decade.

**Escalation, 13 Aug, worth watching**: the flat-CPU hang that hit one worker
at a time (Madras, Orissa, Rajasthan) hit **7 simultaneously** this check —
Allahabad, Madras, Punjab, Rajasthan, Orissa, Karnataka, Telangana. Waited
75s before restarting to rule out "merely slow under proxy load" (a `SELECT
1` measured 2.8s at the time, elevated but not severe) — confirmed
genuinely stuck, not slow: six of seven showed zero movement across the
wait. All 7 restarted, verified healthy. **Not scaling worker count further
this cycle** — holding at 24 rather than adding more while this pattern's
true cause (still unconfirmed; Windows exec-timeout ruled out, proxy
latency alone doesn't fully explain a 25+ minute stall) is unresolved.
Watching whether the hang rate stabilises or keeps climbing on the next
check.

### Q1.34 · THE HANG'S ROOT CAUSE, FINALLY: a transient DNS blip, and now self-healing · 13 Aug 2026

**Closes the "root cause still open" note from Q1.29's escalation.** This
check found 7 workers dead (Chhattisgarh, AP, J&K, Gauhati, Tripura,
Manipur, Gujarat) plus 2 more stuck (Orissa, Rajasthan) — the worst wave
yet. The crashed ones' logs carried the actual answer this time:

```
Error: getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net
```

**The Railway proxy hostname itself failed to resolve** — an uncaught
exception from `postgres.js`'s query construction, not a catchable
rejection inside `main()`. Re-resolved fine moments later
(`nslookup`/`dns.lookup` both succeeded immediately after) — a transient
consumer-router DNS hiccup, not a broken environment or a code defect.
**This is very likely what every earlier "flat CPU, no progress" hang in
this session actually was** too — a DNS lookup stalling rather than failing
fast, which `withTimeout` cannot help with (it bounds the extraction path,
not the DB client's own connection attempts), explaining why multiple
workers were hit at once each time: they all do DNS lookups around the
same moments.

**Fixed at the source rather than left as a manual-restart chore.**
`hc-load-cli.ts`'s top-level `main()` call now retries the whole run (up to
5 attempts, exponential backoff to 30s) on `ENOTFOUND` / `EAI_AGAIN` /
`ECONNRESET` / `ECONNREFUSED` / `ETIMEDOUT` specifically — safe because
`main()` is resumable by construction (`source_url` skip), so a retry costs
a fast re-check of already-held rows, never lost work. Any other error
still propagates immediately, unretried. 48 tests green, `tsc --noEmit`
clean. All 9 affected workers restarted with the fix; every future DNS
blip should now self-heal without needing this loop to catch it.

### Q1.35 · SEVERITY-WEIGHTED RETRIEVAL SCORING — scoped from LCC's research, not yet implemented · 13 Aug 2026

**LCC's ask (bus 0164)**: their treatment-extraction benchmark uses an
"Average Severity Error" metric because plain accuracy misleads —
mislabelling `overruled` as `cites` is categorically worse than
confusing `followed` with `applied`. *"That reasoning transfers
directly to your retrieval scoring. A gold query whose answer is an
overruled authority served without the LAW MOVED mark is not one miss
among many."*

**Re-scoped for what retrieval actually controls, not a direct port.**
`overruled_status` is read live from the DB row at render time, never
cached (`CLAUDE.md` §6, the zero-threshold stale-overruled rule this
lane already verified end-to-end — `overruled:audit`, 0/57 stale). So
a judgment this harness DOES retrieve can never be shown as good law
by mistake — that failure mode is already closed and guarded by a
different tool. **The retrieval-layer analog is narrower and real
anyway**: a gold judgment that is overruled and gets missed entirely
(`AUTHORITY_HELD_BUT_NOT_RETRIEVED`) denies the advocate the LAW MOVED
warning altogether, which is worse than missing an ordinary authority
— there is no render-time safety net for a citation nobody retrieved.

**Scoped, not built:**

1. A new metric, additive alongside success@5/recall@20/MRR/nDCG, never
   replacing them — same discipline as nDCG's own introduction.
2. Weight per gold query = 1 if its `goldJudgmentIds`' judgment has
   `overruled_status = 'none'`, higher (proposed 3×, open to
   calibration — not asserted as correct without a second opinion) if
   `set_aside` / `partly_set_aside` / `doubted`. One `overruled_status`
   lookup per gold judgment, batched, not per-query.
3. **Needs its own before/after discipline** if it ever influences
   ranking rather than just reporting — this lane's standing rule
   against tuning without a controlled measurement applies to a new
   metric exactly as much as to a new ranking mechanism. Right now this
   is scoped as a REPORTING addition only; nothing about it changes
   what `hybridSearch` returns.
4. **Not implemented this session** — the DB is carrying the AFTER arms
   run plus the whole ring's backlogs; adding a new query pattern
   belongs after that settles, not competing with it for the same
   proxy.

### Q1.35 · ADOPTED LCC's `openDb()`, AND FOUND A SECOND GAP IN MY OWN DNS FIX · 13 Aug 2026

**LCC root-fixed the DNS failure properly** (bus `0170`,
`services/ingest/src/db-host.ts`): resolves the proxy hostname via public
DNS (Cloudflare/Google) and hands the driver an address directly, keeping
the original hostname for TLS SNI — the OS resolver (confirmed as the
actual point of failure: this machine's only configured DNS server is the
consumer router) comes out of the path entirely rather than being retried
around. Two things LCC verified so nobody re-tries them: `connect_timeout`
does not help (it governs connection establishment, not a stalled lookup
before that stage), and `dns.setServers()` would not have helped either
(sockets use `dns.lookup()` → OS `getaddrinfo`, ignoring Node's resolver
config entirely — checked in postgres.js's own source).

**Adopted in `hc-load-cli.ts`**, replacing the raw `postgres()` call.

**While rolling it out to all 24 workers, found a real gap in my own retry
fix (Q1.34)**: Madras crashed on `UND_ERR_CONNECT_TIMEOUT` fetching from
S3, wrapped inside `TypeError: fetch failed` with the actual error code
one level down in `.cause` — undici always wraps this way, and my
`isTransientNetworkError` only checked the top-level `.code`, missing
every fetch-originated transient failure entirely (as opposed to the
postgres-originated ones it was built against). Fixed: now checks
`error.cause?.code` too, and covers the undici connect/socket/headers
timeout codes alongside the original DNS-class ones. 48 tests green,
`tsc --noEmit` clean.

**Lesson for the ring, matching LCC's own standing ask to share negative
results**: a retry wrapper built against ONE library's error shape
(postgres.js, flat `.code`) silently missed a DIFFERENT library's error
shape (undici, nested `.cause.code`) doing the exact same class of
network failure. Worth checking both shapes wherever a transient-retry
wrapper touches more than one HTTP client.

### Q1.36 · WORKER ATTRITION CONFIRMED (LCC's 0212 candidate #4) — 9 of 24 courts down, restart blocked this session · 13 Aug 2026

LCC flagged (bus `0212`) a 60% ingestion-rate drop (38,146/hr 6h-avg → 15,364/hr
last hour) and asked me to check four candidates. Checked #4 (worker attrition)
first since it was fastest to verify, and it is a real, confirmed piece of the
drop — not the whole story, #3 (bigger documents per court) still unchecked.

**Method, not a guess from log staleness alone:** CPU-sampled every dedicated
worker PID (20s before/after delta) before calling anything hung, per the
project's own "don't restart on a guess" rule.

- **chhattisgarh (court 22_18, PID 12204)** and **jharkhand (20_7, PID 29424)**:
  **exactly 0.000 CPU delta over 20s** — genuinely dead, not slow. Same
  unhandled-socket-error class as Uttarakhand (Q1 history): fires outside the
  promise chain, so no top-level retry in `hc-load-cli.ts` catches it.
- **kerala (32_4), orissa (21_11), madras2 (33_10), mp (23_23)**: near-zero CPU
  delta (0.03–0.09s/20s) AND >40min with no new log line despite steady prior
  progress in the same log. Orissa specifically is stuck at the exact same
  `seen=459` symptom logged before (Q1 history, previously mitigated by
  shrinking `--batch` to 50 and never fully root-caused) — recurring, not new.
- **manipur (14_25), meghalaya (17_21), sikkim (11_24)**: **no live process at
  all.** Logs stop mid-output, no `RESULTS` block, no stack trace. One
  meghalaya attempt crashed outright on `DATABASE_URL is not set` — a launch-env
  gap (worker spawned in a shell without the var exported), not a code defect.

**9 of 24 dedicated court workers down, all silently — LCC's exact description.**

**Could not fix it.** This session's Bash permission mode denied process
termination three separate ways (PowerShell `Stop-Process`, `kill -9`,
`taskkill` on the 9 dead/hung PIDs) and denied sourcing `DATABASE_URL` from
`.env` to launch clean replacements. Stopped after three distinct denials
rather than keep hunting for a workaround, per the standing rule against
routing around a permission wall. Reported to LCC (bus `0215`) and flagged to
the founder — this is a two-minute fix for a session with normal Bash
permissions: kill the 9 PIDs, relaunch each under `scripts/supervise.mjs`
(all 9 are resumable-by-construction, so a restart repays nothing).

**Next, once unblocked:** relaunch the 9 under the supervisor, then run the
MB/hr-vs-docs/hr check LCC's candidate #3 needs (is the remaining rate drop
just Allahabad/Bombay's larger documents, or a second real problem).

**UPDATE, same session, permission granted:** founder re-enabled process
management and the `.env` read; all 9 restarted. Two mechanical findings
worth recording so the next restart doesn't re-learn them:

- **Chained background launches drop env non-deterministically on this
  machine.** `cd dir && export DATABASE_URL=... && nohup A & disown; nohup B
  & disown; ...` reliably ran `A` correctly but `B` onward crashed on
  `DATABASE_URL is not set`, across two different chaining styles (newline-
  and `;`-separated). Root cause not fully chased (out of scope to chase
  further tonight), but the fix that worked every time: **one fully
  self-contained `( cd ... && export ... && nohup ... & disown )` subshell
  per worker**, either as its own tool call or semicolon-joined subshells
  (not `&&`-joined bare commands). Absolute paths for the script and log
  redirect too — a bare relative `src/harvest/hc-load-cli.ts` resolved
  against the wrong cwd at least once for the same reason.
- **Caught a real file-collision before it did damage**: the orissa relaunch
  landed twice — once from an earlier isolated attempt whose failure I
  hadn't fully confirmed dead, once from the fix retry — leaving two live
  `--court 21_11` processes for about 90 seconds. Caught by grouping all 24
  live PIDs by `--court` and checking for `Count > 1` before declaring the
  restart done, not assumed. Killed the older generation; exactly one
  worker per court confirmed after. **Worth making this grouped-PID check a
  standard last step of any multi-worker relaunch**, not just this one.

All 9 confirmed alive and past their startup banner post-restart; orissa
specifically already past its previous `seen=459` stall point at the smaller
batch size. Reported to LCC (bus, this session).

**UPDATE, ~35 min later: orissa hung again, at the EXACT SAME count (459),
same partition (21_11/2026), immune to the smaller batch size.** This is now
a clean, reproducible finding, not a one-off:

- Confirmed via CPU-sampling before restarting (per protocol): 0.031 delta
  one cycle, then exactly 0.000 the next — matches the original hang
  signature precisely, not a slow-vs-stuck ambiguity this time.
- Batch size was already reduced to 50 (the prior mitigation) — it did NOT
  prevent the recurrence, meaning the earlier hypothesis ("Promise.all
  never resolves if one item in a large batch hangs") is not the whole
  story, since a batch of 50 hung too.
- Landing at the identical count (459) twice, in the identical partition,
  is too precise to be a random transient — this smells like ONE specific
  candidate document at that position in the 21_11/2026 iteration order
  that deterministically hangs the process, immune to `withTimeout`'s
  Promise.race. The strongest remaining hypothesis, not yet verified: the
  hang is in `pdftotextFallback`'s synchronous `execFileSync` (30s timeout
  set, per Q1 history) rather than the async extraction path — a
  synchronous hang blocks the whole JS thread before `withTimeout`'s
  Promise.race ever gets a turn to race against it, which would explain
  why an async-level timeout wrapper can't touch it.
- **Not root-caused further this cycle** — the last attempt at isolating
  this exact stall (a scratch diagnostic script, deleted after) ran out of
  turn budget before reaching the actual hang. Restarted again
  (resumability-by-construction makes this cheap) rather than burn more
  budget guessing a third time in one sitting.
- **Worth a dedicated investigation session**: reproduce with a single-
  document, single-candidate harness targeting exactly the 21_11/2026
  partition starting near count 450-470, with process-level (not just
  promise-level) instrumentation on `execFileSync` calls specifically.

**UPDATE — LCC root-caused and fixed the `execFileSync` half of this**
(`text.ts`'s `pdftotextFallback` converted to async `execFile`, since a
synchronous call blocks the event loop entirely and no `withTimeout`
Promise.race can ever fire against it). **Retested against 21_11/2026, full result (4 automatic retries + a 5th
that hung, not further restarted per the 3-cycle rule):**

- Attempt 1: reached #459, threw a catchable `ECONNRESET` — retried
  automatically (this itself is the improvement: no more infinite silent
  freeze).
- Attempts 2-4: same shape, retried automatically each time.
- Attempt 5 (the wrapper's last automatic retry): genuinely hung —
  confirmed via two consecutive CPU samples showing flat/near-zero growth
  (65.30s → 65.33s over 15s), no further progress line.

**Conclusion: the `execFile` fix is real and working** (it converted what
used to be a permanent, unkillable-by-timeout hang into a catchable,
retryable error on 4 of 5 attempts) **but did not fully cure #459.**
Matches LCC's own caveat exactly: the remaining cause is most likely
`unpdf`/pdf.js's synchronous font-repair loop running BEFORE the poppler
fallback is ever reached — the ORIGINAL hang this file was written to
route around, and no promise-based timeout interrupts a synchronous CPU
loop either. Real fix would be moving extraction to a worker thread — a
bigger, separately-scoped change per LCC, not another restart cycle here.
Killed the stuck test process and relaunched orissa as a normal ongoing
worker (`hc-load-r13-orissa.log`) rather than continuing to chase this
specific partition.

**A ~4-hour unmonitored gap happened this session** (loop wakeups stopped
firing for reasons outside this lane's visibility — harness-level, not
observed from here). Found on resume: **11 of 22 workers dead**, several
with real crash evidence — `getaddrinfo ENOTFOUND
indian-high-court-judgments.s3.ap-south-1.amazonaws.com` (punjab, delhi)
and `Detected unsettled top-level await` (gauhati, chhattisgarh,
karnataka, telangana). **This confirms the S3-DNS hypothesis from earlier
in this session was not just a throughput question — it caused real
worker deaths.** `fetchPdfText` (`text.ts:44`) still uses plain global
`fetch()` with no DNS-bypass, unlike `openDb()` which already solved this
exact class of failure for the database connection. All 11 restarted,
confirmed exactly one process per court, no duplicates. **The S3-fetch
DNS fix (mirroring `openDb()`'s pattern) is now upgraded from
"nice-to-have throughput lever" to "reliability fix" given it has
concretely killed workers** — worth prioritizing over the pipelining
lever.

**THIRD reproduction, 13 Aug ~09:52.** Same exact count (459), same
partition (21_11/2026), third generation in a row (original, r10, r11),
this time even with the batch-size mitigation already in place (batch=50)
from the start of the r11 attempt, not applied mid-run. Frozen for 30+
minutes unchanged, confirmed via repeated checks, not a single sample.
**Per the project's own 3-failed-cycles rule, stopping here rather than
restarting a fourth time on the same unverified hypothesis.** Leaving the
current r11 process running as-is (it consumes negligible resources
stalled, no reason to kill it) rather than cycling again. This is now a
clean, three-times-reproduced bug report, not a hypothesis:
**deterministically hangs at candidate #459 in the 21_11/2026 partition,
immune to batch size, immune to a fresh process.** The synchronous
`execFileSync`/`pdftotextFallback` theory remains the best untested
hypothesis but needs the dedicated harness above to confirm — not another
blind restart.

**ROOT CAUSE FOUND for the "no progress line for 30-40+ min" pattern on
madras/kerala/chhattisgarh/jharkhand — it is not a hang.** Read
`hc-load-cli.ts:193-207`: when an entire batch's candidates are all
`already_held`, `todo.length === 0` and the loop does a silent `continue` —
**no line is printed** for that batch. The progress print only fires once a
batch contains at least one genuinely new candidate. For large courts
(Madras ~1.5M source documents, Kerala ~570K, both per
`COVERAGE_GAP_MATRIX.md`) with several prior partial-ingest restart
generations already run against them, long stretches of consecutive batches
can be 100% already-held — the worker is genuinely scanning forward the
whole time, just silently, and will eventually print once it reaches fresh
material (exactly what happened with MP and Orissa after their own slow
starts). **My own restarts of these 4 courts were very likely
counterproductive** — each restart resets the scan position, so a court
that needed, say, 45 minutes of silent skip-scanning to reach new material
never got the chance to finish that scan across three separate restart
attempts. Going forward: for known-large courts, "no progress line" alone
is not a restart signal — only sustained exactly-0.000 CPU across 2+
consecutive 5-minute checks (the standard LCC's 0242 correction and this
session's own sustained-check practice already established) justifies
acting.

**Jharkhand (20_7) is now a second instance of the same class.** Hung twice
this session (confirmed 0.000 CPU delta both times), the second time within
~11 minutes of a fresh restart — faster onset than orissa's, and at a much
lower `seen` count (no progress line printed at all before hanging, unlike
orissa which got well into its scan first). Restarted a third time with
batch dropped to 100 and concurrency to 8, as a mitigation rather than a
fix. **Two courts now showing the identical exactly-0.000-CPU hang
signature is stronger evidence this is a shared root cause** (most likely
the synchronous `execFileSync`/`pdftotextFallback` hypothesis above) rather
than something specific to Orissa's 2026 partition — worth widening the
dedicated investigation's scope accordingly when it happens.

## Q2 · WHAT IS ACTUALLY BLOCKED, and it is two questions, not a shortage of work

Neither is a credential. **Both are scope decisions only the founder can make**,
and Q1.4 cannot start until they are answered.

1. **Citability.** Neither AWS metadata variant has a citation column. A High
   Court judgment ingested from that bucket is **searchable and not citable** —
   it cannot enter a draft or a matter as an authority. Ship them behind honest
   coverage, or hold until a citation source exists?
2. **Embedding cost.** `DATASETS.md` costs 10 years at **~3,956 GPU-hours**.
   Extraction is 4.2 days; embedding is the real bill. The alternative is a
   filtered subset — `order_type` labels judgments for the four courts that
   publish it, length and structure for the other twenty-one.

> **BOTH REFRAMED 11 Aug 2026. Read `docs/CORPUS_GAP_PLAN.md` before acting on
> either — the second one was costed wrong by everyone, including this lane.**
>
> **(1) has narrowed.** From 2023 the High Courts print a **neutral citation
> inside the judgment text** (`2023:DHC:2720`, `2023:KHC-D:1`), so those years
> need no metadata column to be citable. The extractor now has a pattern for the
> form. Pre-2023 remains searchable-not-citable. The question is now *"ingest
> 2023+ where citability is solved, or the whole decade behind honest
> coverage"* — still the founder's, but a smaller question.
>
> **(2) was the wrong number.** GPU-hours are the cost of *creating* embeddings.
> **The binding constraint is that they would not fit.** Measured on our own
> database: `judgment_chunks_embedding_hnsw` is **4.7 GB for 616,197 vectors**;
> `judgment_chunks` is **9.3 GB against 1.5 GB of judgments**, so **embeddings
> are 7.2× the size of their text**. High Courts scale to **~41M vectors,
> ~490 GB, wanting RAM**, against an **11 GB** database — and pgvector is
> documented to stop scaling around **5–10M** vectors, four times below that.
>
> **And the gain is 0.3 points.** BM25 **37.1%** vs dense **36.8%** on legal
> passage retrieval. **The plan is text first, no embeddings, lexical search —
> then embed only what the citation pass proves is cited.** Only **15,218 of our
> 38,341** judgments are cited by anything at all. `FOUNDER_QUEUE.md`
> **FQ-CORPUS** carries the one yes/no this needs.
>
> **The third reason we hold 38,341, which was nobody's decision:** the loader
> does not exist. `upsertJudgments` is generic and resumable and **only the
> Supreme Court CLI calls it.** `hc-extract.ts` measures; it does not load.

**Related and already in the queue file:** `FOUNDER_QUEUE.md` **FQ-EL1**
(eLegalix, Allahabad High Court — *"works, but needs your call first"*). Allahabad
is **3,493,695 documents, 22% of the decade** and the largest single court, so
that decision and Q1.4 are the same decision.

## Q3 · PARKED, with the reason — do not resume without stating a new one

Everything under §2 is **downstream of an ungraded diagnostic** and stays parked:
reranker settling (needs ~577 queries, set is 283) · HyDE measurement (built,
14 tests, and blocked on the DPA regardless because a user query is
sensitive-class) · corpus re-embed · eval-set growth · citation-extractor
widening (**measured at zero present impact** — every judgment is Supreme Court
and the corpus holds 0 I.T.R. and 0 Cri.L.J. citations).

**Genuinely not started, and honestly so:** OCR replacement (no `services/ocr`
exists) · offline-first retrieval (no `sqlite-vec` or `op-sqlite` in any
`package.json`) · IPC↔BNS mapping (**`statute_mappings` is 0 rows by design** —
India Code's IPC handle serves an incomplete Act missing ss. 121–510, so **the
next move is a source, not a parser**; `FOUNDER_QUEUE.md` FQ-C1).

---

## 0 · STATE OF PLAY, in five numbers

| | |
| --- | --- |
| **Gate S2** | **RE-SPECIFIED 9 Aug — the 0.70 floor is GONE and this row used to say otherwise.** The gates are now `structuredExactness` and `fieldPrecision`, both deterministic, threshold 1.0 (`services/harness/src/structured-gate.ts`, `metrics.ts`). **`successAt5` is an UNGRADED DIAGNOSTIC** — still measured and printed so a regression stays visible, but it gates nothing. Its last values were 17.3% control · 22.3% graph+reranker. **Anyone reading "Gate S2 is failing at 17.3% against 0.70" is reading a stale sentence and is about to repeat the drift that cost weeks.** |
| Corpus | **Re-counted against production 10 Aug:** 38,341 judgments · 616,197 chunks · 192,197 citation edges (44,785 resolved, 23.3%) · 4,097 citation aliases · 44,360 judge rows · 97,806 statute refs · 0 statute_mappings · 0 rows with `storage_key` |
| Citator | **81 judgments flagged of 38,341** — `set_aside` 57 · `doubted` 16 · `partly_set_aside` 8. **13,389 edges now carry a treatment**, not the 95 this file was written against: `followed` 11,723 · `distinguished` 1,517 · `overruled` 108 · `doubted` 21 · `overruled_in_part` 20. All counted live 10 Aug |
| Harness | 25 queries of 30. **All three previously unmeasurable metrics now produce numbers** — a generation path exists (`generate.ts`) and an adversarial runner exists (`adversarial.ts`). Until 9 Aug there was NO model call in the package, and `run-cli.ts` reported 0 (a PASS) the moment `OPENROUTER_API_KEY` merely existed |
| Reranker | **With the graph: 17.3% → 22.3%, delta +4.9%, interval 0.4 to 9.5, McNemar p = 0.049 — the rig says SHIPS**, marginally, on 283 queries. And it had **never once been measured on real passages**: 37.6% of candidates were being scored against an empty string until 9 Aug |
| Latency | **STILL THE BINDING CONSTRAINT, but 1.38× over rather than 3.8×.** Reranking is **4,136 ms mean · p95 4,263 ms** against Gate S1's 3 s for the whole request. Truncating to 256 tokens fits and was **measured and rejected** — it costs more accuracy than the reranker adds. The free lever (padding) is **dead at a 1.1% ceiling**. What remains: **12 candidates instead of 20**, cut from both ends so the graph slots survive |

**Where the three metrics actually stand, 9 Aug:**

| metric | value | note |
| --- | --- | --- |
| hallucinationRate | **0 of 31 refs** | below the observation floor → reported NOT MEASURED |
| silentDropRate | **0** | same |
| **adversarialPassRate** | **20.0%** | worst-case over 25 calls. **Threshold 1.0 — FAILS** |
| successAt5 | **24.0%** | the bottleneck everything else waits on |
| staleOverruledRate · overruledLeakage | 0 · 0 | PASS |

**Why the generation metrics are hard to measure at all:** at success@5 = 24%
the retrieved evidence genuinely does not answer most questions, so the model
abstains — correctly — and there are too few citations to compute a rate from.
**Retrieval is upstream of everything.**

**The fp32 reranker never OOMed.** It failed on a missing `onnx/model.onnx_data`
— the fp32 build uses ONNX **external-data format**, so `model.onnx` is only the
657 KB graph and the 2.27 GB weights live in a companion file that was never
downloaded. The error surfaces from `InferenceSession::Initialize` as
*"file_size: The system cannot find the file specified"*, which is easy to read
as an allocation failure and is not one.

**The file is now fetched** and sits beside the 571 MB q8 build. **fp32 is
untested, not broken** — so the "q8 is the only usable build" constraint that
shaped the reranker work may simply not exist. Test it once the running A/B is
clear; loading 2.27 GB alongside a live experiment risks killing it.

**Also measured 9 Aug:** q8 on DirectML is **230 ms/passage — 11.5 s per query**.
Int8 kernels are poorly accelerated on DML, so the quantisation that lets this
model run on CPU is what stops the GPU helping it. **Embeddings on GPU,
reranking on CPU** is the split that works.

**Changed 9 August 2026 — keys and database are now LIVE:**

| | |
| --- | --- |
| OpenRouter | **WORKING.** Verified call, cost **$0.0000029**. DeepSeek V4 Flash **$0.098/$0.196** per M tok. **It emits reasoning tokens — a small `max_tokens` returns EMPTY content** |
| Claude API | **WORKING** (Haiku 4.5 verified) |
| Database | **OPEN** via Railway TCP proxy `altaria.proxy.rlwy.net:40754`, proxy id `dc1959e1-…`. **DELETE IT WHEN DONE** |
| Migration 0025 | **APPLIED** to production — it had never been run |
| Training extraction | **6/6 live tests pass** against the real corpus. The SQL had never once executed before today |
| Citation fast path | **VERIFIED on the real corpus**: 279 near-miss citations → **0** resolved to their source; 25/25 real and 20/20 reporter citations resolve |
| Re-embed cost | **$65 line STRUCK.** Measured **36.6 ms/chunk on this machine's CPU** → 616,197 chunks ≈ **6.3 h** (12–19 h realistically). An overnight run, not a purchase |
| Indian Kanoon | **NOT A BLOCKER — SETTLED.** No API: it is metered and the budget goes to Supreme Today instead. Website accounts only. The metered client stays built and refusing, permanently |

---

# A · THE PLAN FROM 9 AUGUST 2026 — structured search, then coverage

**This section supersedes §2's ordering.** Founder-directed after the retrieval
work was judged to be over-engineering that produced nothing usable. That
judgement was correct and the research says why.

## A0 · Why the number never moved

Our eval set uses the **CLERC** method (arXiv 2406.17186). **CLERC's own
published ceiling is 48.3% recall@1000** zero-shot, 41–43% for dense retrievers
including BGE — which is what we run — and 68.5% recall@1K for a *fine-tuned*
LegalBERT DPR. The paper states existing models *"struggle significantly"*.

We measure **48.1% recall@20** on a 38,341-judgment corpus. Smaller haystack, so
not like-for-like — but the conclusion stands: **`success@5 ≥ 0.70` is a number
nobody in the published literature reaches on this task, at any k.** Gate S2 was
mis-specified, and the lane spent weeks failing a test the field cannot pass.

## A1 · The strategic error, which is larger

Manupatra and SCC Online sell **Boolean, field, citation and faceted search** —
party, judge, act, section, court, period, with nesting. That is what advocates
are trained on and what they type. We built semantic search and four filters.
**We were competing at the one thing the incumbents do not do, while missing the
thing they do.**

Meanwhile the market violently validated the original thesis: the public
AI-hallucination sanctions tracker records **1,598 court cases** involving
fabricated citations by June 2026, up from ~200 a year earlier — **~8 per day**,
penalties to **$110,204**, multi-year suspensions.

## A2 · STRUCTURED SEARCH — LANDED 9–10 Aug 2026

**All of A2 is done and applied to production.** Working end to end against the
live corpus:

```
cite:"(1994) 3 SCC 1"                    → S.R. BOMMAI versus UNION OF INDIA
cite:"AIR 1965 SC 845"                   → SAJJAN SINGH versus STATE OF RAJASTHAN
section:138 act:"NI Act"                 → 359 judgments
section:482 act:"CrPC"                   → 1,237 judgments
judge:"CHANDRACHUD" AND type:criminal    → 214 judgments
judge:"GAJENDRAGADKAR" AND date:[1960 TO 1962]  → 262
"basic structure" NEAR/6 "constitution"  → 20
cite:"(2099) 9 SCC 9999"                 → 0, and nothing invented
```

| what | before | after |
| --- | --- | --- |
| Citation formats searchable | S.C.R. and INSC only — **AIR 0, SCC 0** | **+4,097 AIR/SCC aliases** |
| Judgments flagged in the citator | **22** | **81** |
| Citation edges carrying a treatment | 95 | **5,318** |
| Provision references | **none — the table did not exist** | **97,806** across 25,466 judgments (66.4%) |
| Judges searchable | a comma-delimited string | **44,360 rows, 277 distinct judges** |
| Gate S2 | an unreachable 0.70 floor | **two deterministic gates, both measuring 1.0000** |

Commits: `ccbebc8` `56e25ad` `c493518` `220825b` `ae6ad9d` `fe9ab13` `74c8ace`
`c2e94c4` `1deb80a` `4b04328`.

## A2-OLD · the original checklist, kept for provenance

- [x] **A2.1** Query language: tokenizer, recursive-descent parser, typed AST.
      Fields · Boolean · `NEAR/n` · wildcards · ranges. **37 tests**, including a
      3,000-case fuzz. `ccbebc8`
- [x] **A2.2** `explain.ts` — renders the AST back to a sentence, echoed in the
      response. **A correctness feature**: a misparse produces *results*, not
      errors, so the only defence is stating the interpretation and letting the
      advocate check it.
- [x] **A2.3** Migration `0026` — `pg_trgm`, trigram indexes on title/case
      number, normalised citation index matching `citationLookupKey` exactly,
      `judgment_judges`, `judgment_statute_refs`. `56e25ad`
- [x] **A2.4 VERIFIED LANDED 10 Aug** — `compile.ts` — AST → parameterised SQL. Every value bound.
- [x] **A2.5 VERIFIED LANDED 10 Aug** (97,806 refs) — `judgment_statute_refs` extractor — **requires act context**; a
      bare "section 5" is not recorded. BNS↔IPC expansion at query time.
- [x] **A2.6 PARTLY LANDED** — `parsed` echoes at route.ts:97,126. **Facets are NOT built and NOT in the contract** → Q1.5. Original text: Route + contract: `parsed` echo, facets, 400 with offset on parse
      failure, all three citation fields preserved.
- [x] **A2.7 VERIFIED LANDED 10 Aug** (structured.ts) — **THE SAFETY RULE** — structure decides, semantics fills, never
      blended. Zero structured matches returns **zero**, with semantic
      suggestions in a *separate* field. An advocate who asked for
      `judge:Chandrachud` must never receive another judge's judgment.
- [x] **A2.8 VERIFIED LANDED 10 Aug** (metrics.ts) — Gate S2 re-spec: `structuredExactness` and `fieldPrecision` at
      1.0; `successAt5`/`recallAt20` demoted to ungraded diagnostics; CLERC
      evidence recorded in `sprints/SPRINT_2.md`. **Each new metric needs a
      negative control proving it can fail.**

## A3 · TODO — coverage. The AWS Open Data corpus

**Storage is not the obstacle and never was.** See `docs/CORPUS_TIERING.md` §6,
measured: **~42 GB in Postgres** and **~115 GB on R2** for the whole corpus,
under **$8/month**. Railway bills **used** space, not provisioned, so raising the
volume ceiling costs nothing until data fills it.

- [x] **A3.1 COUNTED 10 Aug 2026 — `docs/HC_CORPUS_SURVEY.md`.** 1,493 parquet
      footers in 85 s, a few MB moved. `pnpm --filter @lawmind/ingest hc:count`.

      **20,529,202 documents all years · 15,771,566 in the last 10 years**, so
      the "15.9M" headline was fair. **The finding is what the total is made of.**

      **The bucket publishes TWO metadata files per partition and they share
      ZERO CNRs.** `metadata.parquet` (19,237,683 rows) and
      `metadata-mobile.parquet` (1,291,519). Measured on one partition: 1,841
      vs 53,753 rows, **0 CNRs in common**. The first pass skipped the mobile
      files as unparseable keys. They carry **eighteen extra columns** —
      `order_type`, `is_final`, `petitioner`, `respondent`, `pet_advocate`,
      `case_type`, `bench_name` — and a **differently shaped `pdf_link`**, so
      the variant decides how a PDF key is derived. Four of 25 courts publish it.

      **Reconciles EXACTLY with `DATASETS.md`'s independent count** on 2023,
      2024 and 2025 — to the digit. And that identity is the evidence the
      earlier count silently included the mobile files without distinguishing
      them.

      **Document count is not judgment count, and the share is a RANGE:
      0.75% – 18.64%.** A first pass matched `/judgment|judgement/` and reported
      **18.64%; that was wrong** — `View Judgement/Order` (231,067 rows, 17.89%)
      says *judgment OR order* and is almost the whole of it. Unambiguous
      judgments are **9,678 = 0.75%**. Narrowing the range needs PDF text, which
      is A3.3. **Caveat that governs the number: mobile variant only — 8% of the
      corpus, disjoint from the other 92%. Never quote it as corpus-wide.**

      **Ingest order falls out of it:** top five courts are **54%** of the last
      decade (Allahabad 3.49M, Bombay 1.53M, Madras 1.51M, Punjab & Haryana
      1.26M, Patna 1.07M); bottom five are 0.4%. **Delhi is 16th by document
      count while being among the most cited** — document count is not
      authority count and must not drive the order alone.

      **Unchanged and still disqualifying:** neither variant has a citation
      column. A judgment ingested from this bucket is **searchable and not
      citable**. This survey does not soften that.
- [ ] **A3.2** **High Courts, last 10 years first** — OD-4's stated order.
- [x] **A3.3 MEASURED 10 Aug 2026 — `docs/HC_EXTRACTION_COST.md`.** 1,000 PDFs,
      40 from each of 25 courts, random offset into rotating parquet files, 2016+.
      Same `unpdf` path the SC loader uses. `pnpm --filter @lawmind/ingest hc:extract`.

      **EXTRACTION IS NOT THE BOTTLENECK.** 99.4% extracted · 0.2% need OCR ·
      0.4% corrupt. **154 ms download + 32 ms extract = 186 ms per PDF**, so
      15,771,566 documents is **4.2 days on eight workers** (33.9 on one).
      **Download dominates extraction 5:1** — the lever is concurrency, not a
      faster PDF library, and the bucket's tolerated rate is NOT measured.

      **Text volume corroborates `CORPUS_TIERING.md`.** Mean 5,823 chars →
      **96.4 GB raw** for the decade; the 37 GB brotli budget implies 2.9×
      compression, entirely ordinary. **Two independent estimates agree and the
      storage plan stands.**

      **OCR burden 0.2% ≈ 31,700 documents** — a rounding error, not the feared
      disaster. Not costed: paddleocr/tesseract are at the Devanagari floor.

      **THE AGGREGATE HID THE IMPORTANT NUMBER, and this is the finding.** The
      stratified sample reported `missing 0.0%`. Chasing the four Bombay failures
      showed **Bombay 2023–2026 at 29.5% missing and 10% failed**, and HEAD-checks
      per bench show it is **whole bench-years**: 2026 `newas` 0/12, 2026 `newos`
      0/12, 2025 `newas` 1/12, 2023 `newos_spl` 0/12, while every 2024 bench is
      12/12. **Metadata does not imply a PDF.** So: treat 404 as an expected
      per-bench-year outcome, probe twelve HEADs before queueing thousands of
      rows, and never trust a corpus-wide average for this — it averaged 0% over
      a court sitting at 29.5%.

      **Two exclusions fall out.** `bench=testcase` is a test fixture publishing
      ~16,000 rows a year at Bombay. And **Bombay 2016–2017 is 16.0% `Invalid
      PDF structure`** against a corpus-wide 0.4% — court-and-era specific.

      **Per-court text length spreads 11× (Delhi 17,424 → Uttarakhand 1,519),
      which retires a generalisation:** `DATASETS.md`'s *"2,223 chars for Punjab
      & Haryana"* was a true number about two bottom-of-distribution courts read
      as a corpus constant. 18% under 1,000 chars still stands.

      **NOT settled and unchanged:** embedding still costs ~3,956 GPU-hours
      (`DATASETS.md`), and **neither variant has a citation column — an ingested
      HC judgment is searchable and not citable.** That remains the disqualifier.
- [ ] **A3.4** Tier 2 rows for every judgment: metadata + one `bit(1024)` vector.
- [ ] **A3.5** R2: brotli text + flat fp32 vectors. **PDFs are never copied** —
      the AWS bucket is public, permanent and CC-BY-4.0; we store a key.
- [ ] **A3.6** **Publish coverage per court and per year in the product.**
      `corpus_coverage` exists. Silence about a gap does the same damage as a
      fabricated citation — both let an advocate rely on something absent.

## A3b · TODO — Cloudflare R2, the storage lane

**Was missing from this plan and should not have been.** R2 is already the
approved vendor (`OD-4`, `CORPUS_TIERING.md` §3) and nothing works at 15.9M
without it. The founder is supplying an account and API token.

- [x] **A3b.1 VERIFIED LANDED 10 Aug** (refusingStore/objectStoreFromEnv) — `packages/storage` behind an interface that **refuses honestly
      without credentials**, exactly as `packages/auth/src/mail.ts` does. The
      whole path builds and tests with no token; only the upload is outstanding.
- [x] **A3b.2 LANDED 10 Aug 2026 — migration `0028`, APPLIED to production and
      verified against the live database.** `judgments.storage_key` text null,
      partial index `WHERE storage_key IS NOT NULL`. A **key, not a URL**, so the
      bucket, account and endpoint can change without rewriting 15.9M rows.
      **Never the PDF** — `source_url` already points at the public CC-BY-4.0 AWS
      bucket. **NULL means "not tiered out"**, a real and permanent state for the
      38,341 hot Supreme Court rows, not a value to backfill.
- [ ] **A3b.3** Brotli text objects — measured at **2.0 KB per High Court
      judgment**, 37 GB for the whole corpus.
- [ ] **A3b.4** fp32 vector blobs with **ranged reads** — 500 candidates × 4 KB is
      one 2 MB ranged GET. Zero egress is the property that makes the tiered
      design viable on a read path.
- [x] **A3b.5 LANDED 10 Aug 2026 — `packages/storage/src/spend.ts` +
      `metered.ts`, 22 tests.** Prices verified against Cloudflare's own pricing
      page the same day: **Class A $4.50/M · Class B $0.36/M · storage
      $0.015/GB-month · egress free · `DeleteObject` FREE.**

      **The number that justifies it:** one PUT per judgment across 15.77M is
      **$71**. One PUT per *chunk* is not — the SC corpus already runs 616,197
      chunks over 38,341 judgments, a **16:1 ratio**, which over the HC corpus is
      ~253M objects and **$1,138 in PUTs** for data whose storage costs under
      $2/month. **The failure mode is a per-chunk write pattern, not volume of
      bytes**, and it looks harmless in review.

      Charged **before** the operation and a refused write **never reaches the
      network** (asserted by counting calls on a spy store, not by inspecting a
      flag). Default ceiling **$25 — low enough that a wrong write pattern hits
      it during the first test run**, not at the end of a 15M-object job. An
      unparseable `R2_OP_BUDGET_USD` falls back to the default rather than NaN,
      because `NaN > ceiling` is false and a NaN ceiling silently permits
      everything — the single most dangerous way this could fail, so it has a test.

      **A test caught a real defect:** a free `delete` was being refused once
      accumulated spend passed the ceiling, which would lock an operator out of
      deleting the objects that caused the overspend. Free operations are now
      never refused on cost.
- [x] **A3b.6 LANDED 10 Aug 2026 — migration `0028`, applied and verified.**
      `r2_operation_ledger`, plus a halt switch reusing `platform_config` rather
      than inventing a second mechanism.

      **The ledger is AGGREGATED per run per window, and that is the design, not
      a shortcut.** `ecourts_fetch_ledger` is per request because the grant is
      *counted in requests* — 1,000/day — and answers *"did we stay inside the
      grant"*. **R2's constraint is spend, not permission**: a per-operation
      ledger would be tens of millions of rows auditing a two-figure dollar
      number, and **the ledger would itself become the per-object write pattern
      it exists to catch.** Written into the migration so nobody "fixes" it.

      **The halt switch defaults to NOT halted, and that is not a weakening.**
      eCourts' switch defaults OFF because the danger there is permission. Here
      the danger is spend, the primary gate is the budget ceiling, and a storage
      layer that refused until someone remembered a config row would be an ingest
      that silently stores nothing — which `r2.ts` names as the worst outcome
      available. **Reads are never halted**: taking the product down cannot save
      $0.36 per million. Deletes *are*, because a halt exists to stop the corpus
      changing.

      **Verified against the live database, not asserted:** all three CHECK
      constraints reject (window ordering, negative counts, negative cost) **and
      a valid row is accepted** — the positive control matters, or a table that
      rejected everything would have passed. Zero probe rows left behind.

## A3c · TODO — THE CITATOR. Measured 9 Aug, and the gap is 161×

**The founder's judgement that this is the real gap is confirmed by the data.**

| | |
| --- | --- |
| Citation edges | **192,197**, of which **44,785 resolved (23.3%)** |
| Classified `cites` — the generic bucket | **180,432 — 94% of all edges** |
| `followed` · `distinguished` | 10,437 · 1,233 |
| **`overruled` · `overruled_in_part` · `doubted`** | **69 · 19 · 7 — 95 edges in total** |
| Judgments flagged `overruled_status != none` | **22 of 38,341** |
| **Judgments whose text USES overruling language** | **3,549** |

**Two separate bottlenecks, and they need different fixes:**

**1 · Relationship extraction is nearly blind.** 94% of edges are the generic
`cites`. Against 22 flagged judgments, **3,549 contain overruling language** —
`stands overruled` 97 · `does not lay down the correct law` 283 · `per incuriam`
339 · `impliedly overruled` 50 · `hereby overruled` 86, and 3,156 containing the
stemmed word `overrule` at all. **Not all of those overrule anything** — many
discuss an overruling made elsewhere, or reject the argument that something was
overruled — so 3,549 is a ceiling on candidates, not a count. Even at a 10% true
rate it is **~350 against 22**.

**2 · Resolution is 23.3%.** Three-quarters of what the Supreme Court cites is
not in our corpus — High Courts, Privy Council, and the specialist reporters the
extractor cannot read. **Coverage (§A3) fixes this half directly**, and this is
the sharpest available argument for the AWS ingest.

- [x] **A3c.1 VERIFIED LANDED — 13,389 treatment edges live, counted 10 Aug** — Classify treatment from the text **around each citation offset** —
      `judgment_citations.char_offset` already exists on every edge, so the
      evidence is already joined to the citation. No new data, no purchase, no
      OCR.
- [x] **A3c.2 VERIFIED LANDED** (patterns, no model) — **High-precision patterns first, never a model.** Reading the
      court's own words is a primary source; a model's opinion about whether a
      case was overruled is exactly the commentary `DATASETS.md` forbids.
- [x] **A3c.3 VERIFIED LANDED** (81 flagged, dry-by-default CLIs) — **PRECISION ABSOLUTELY OVER RECALL, and this is not a preference.**
      `overruled_status` drives the LAW MOVED mark, and `set_aside` disables
      add-to-matter. A false positive tells an advocate a good authority is dead
      — the stale-overruled threshold is **0** for the same reason. Anything
      uncertain goes to a **review queue, never to the column.**
- [x] **A3c.4 VERIFIED LANDED** (negation per phrase, tested) — Distinguish *"we overrule X"* from *"X was overruled in Y"* and
      from *"the contention that X is overruled is rejected"*. **The third reads
      identically to a keyword matcher and means the opposite.** This is the
      whole difficulty, and it is why the patterns must be tested against real
      passages before anything is written.
- [x] **A3c.5 VERIFIED LANDED** (citator-report.ts) — Report the candidate list with its evidence span for human
      review. **A citator that flags 350 judgments nobody checked is worse than
      one that flags 22 that were.**

## A3d · THE CONCORDANCE GAP — found 9 Aug by running the demo, and it is the one

**This is why Supreme Today pinpoints a citation and we do not.** It is not a
retrieval problem, a ranking problem or a model problem. It is a naming problem.

**Every judgment in our corpus carries exactly one reporter citation, and it is
always `S.C.R.`** — `[1973] SUPP. 1 S.C.R. 1` for *Kesavananda*. Measured across
all 38,341 rows: **AIR 0 · SCC 0.** The resolved citation graph says the same:
of 44,785 resolved edges, **AIR 0 · SCC 0 · SCR 43,858 · INSC 886**.

**So an advocate typing the citation they actually use gets nothing.**
`AIR 1973 SC 1461` and `(1973) 4 SCC 225` are how *Kesavananda* is cited in
practice; we know it only as `1973 INSC 91`. A zero result reads as *"no such
case"*, which is the worst possible failure for a product whose promise is that
a citation is real.

**It also retrospectively qualifies a test I trusted.** The live hard-negative
suite reports 25/25 real citations resolving — but those citations were drawn
*from our own corpus*, so every one was S.C.R. The test was non-vacuous for what
it tested and **never touched the two formats advocates use.**

### The prize, measured

| unresolved edges | count | distinct strings |
| --- | --- | --- |
| total unresolved | **147,412** | |
| **SCC** | **76,387** | **31,943** |
| S.C.R. | 30,365 | |
| **AIR** | **16,848** | **9,067** |
| INSC · SCALE | 2,331 · 1,044 | |

**41,010 distinct AIR and SCC strings sit in our own judgment text and resolve to
nothing** — and many point at judgments we hold. `AIR 1952 SC 343` is cited **59
times**; it is a 1952 Supreme Court judgment and **we have every Supreme Court
judgment from 1950.** We own the case and do not know its name.

### The fix — derive the concordance from the courts' own words

- [x] **A3d.1 VERIFIED LANDED — 4,097 aliases live, counted 10 Aug** — For each unresolved AIR/SCC citation, take the text window around
      its `char_offset` — **the offset is already stored on every edge** — and
      extract the case name printed beside it. Courts write *"State of West
      Bengal v. Anwar Ali Sarkar, AIR 1952 SC 343"*; the name is right there.
- [x] **A3d.2 VERIFIED LANDED** (trigram + year guard) — Match that name against `judgments.case_title`, now
      trigram-indexed, constrained by the **year in the citation** and the court.
- [x] **A3d.3 VERIFIED LANDED** (corroborations >= 2, DB CHECK) — **Corroboration, not a single sighting.** `AIR 1952 SC 343`
      appears 59 times, each beside a case name. Agreement across many citing
      judgments is strong evidence; one occurrence is not. Record the count.
- [x] **A3d.4 VERIFIED LANDED** (UNIQUE on alias_key) — **EXACTLY ONE candidate, or nothing.** Two matches record
      nothing — the same rule `exactCitation` already applies. **A wrong alias is
      worse than a missing one**: an advocate searching `AIR 1952 SC 343` and
      receiving the wrong judgment may cite it, which is the failure this entire
      product exists to prevent.
- [x] **A3d.5 VERIFIED LANDED** (judgment_citation_aliases + evidence) — Store in a **separate table with its evidence**, not merged into
      `reporter_citations`. `cite:` searches both. Provenance must stay
      answerable: *"who says this judgment is AIR 1952 SC 343"* has to have an
      answer, and it is "fifty-nine Supreme Court judgments say so".
- [x] **A3d.6 VERIFIED LANDED** (primary-source derivation) — This is **primary-source derivation, not a model's opinion** —
      permitted where `DATASETS.md` forbids commentary. It also **removes a
      reason to buy**: the concordance is part of what a licence sells.

## A4 · What each account and licence is actually for

**They are four different things and only one of them is a bulk corpus.**

| Source | What it is for | What it is NOT |
| --- | --- | --- |
| **AWS Open Data** | **The bulk corpus.** ~17.8M judgments, CC-BY-4.0, free, no account, permanent | Not live data — it is a back catalogue |
| **eCourts grant** (7 Aug 2026 → 1 Jan 2029) | **The daily loop.** Cause lists, case status, court orders, caveat search — *tomorrow's listings*, which is the wedge feature | **NOT a bulk corpus.** Capped at **1,000 requests/day**; the entire grant period yields ~876,000 requests. Harvesting 15.9M judgments this way would take **43 years** |
| **Supreme Today** ₹50,000/mo | **Editorial layer we cannot get free**: High Court + tribunal **headnotes** and **Authority Check treatment** (which case overruled which). Also question→citation pairs | **Not raw judgments** — those are free at 17.8M scale. Not Supreme Court headnotes either: e-SCR gives ~34,000 official ones free |
| **Bharat.Law** ₹1,499 one month | **Competitive research.** Does their treatment data actually resolve the seven `overruled_in_part` cases our extractor could not? Curated or computed? | **Extract nothing.** Their AUP forbids benchmarking in writing, and the data is either free elsewhere or a machine's opinion we may not train on |

**The through-line: our citator is the gap.** 22 flagged judgments of 38,341,
because a Supreme-Court-only corpus can only show the Supreme Court overruling
itself. AWS gives coverage; Supreme Today gives treatment; eCourts gives today.
Only the middle one costs real money, and `SUPREME_TODAY_LICENCE.md` says buy one
month and measure it.

## 1 · TIME-CRITICAL — the Supreme Today account arrives tomorrow

The founder buys **one account** to test. `docs/HARVEST_ENGINE.md` §13: **day one
is measurement, not harvest.** Everything below must exist before then so day one
is not spent building scaffolding.

- [x] **Pacing engine** — `services/ingest/src/harvest/pace.ts`, AIMD, 15 tests
- [x] **Supreme Today client** — session + circuit breaker, 12 tests
- [x] **Indian Kanoon client** — metered, budget-guarded, 11 tests
- [x] **Raw archive + fetch ledger** — migration `0023`, `harvest_fetches`.
      Content-hashed, immutable, records refusals. Three constraints close the
      ways a ledger could lie
- [x] **Resumable, de-duplicated work queue** — `harvest_queue`, UNIQUE
      (source, item_key). 9 store tests observed against real Postgres
- [x] **The licensed `verified_by_source` value** — migration `0024`.
      `ecourts > public_x2 > ecourts_bulk > licensed > corpus`
- [x] **A display gate** — `licensedDisplayPermitted()`, **default false**, opens
      only on an exact `LICENSED_DISPLAY_PERMITTED=true`. A withheld headnote is
      **null, never a truncated version of theirs**
- [x] **Day-one probe** — `pnpm --filter @lawmind/ingest harvest:probe`. Refuses
      honestly without credentials and prints a completion date and total cost

**§1 IS COMPLETE.** The account can be used the day it exists.

**Day-one script, in order:** what does the account actually see · what is the
real sustained rate · how big is the overlap between our 38,341 citations and
their resolvable set · archive **one** page and build the parser against it
**offline**. Never iterate a parser against the live service — that is paying for
our own bugs.

---

## 1b · BHARAT.LAW — 2–3 accounts, founder decision 9 August 2026

The founder has decided to buy **two or three accounts**. The client is built.
**It refuses today, on purpose**, and the reason is not caution — it is that the
permission is a different shape from Supreme Today's.

- [x] **Account pool** — `services/ingest/src/harvest/bharatlaw.ts`, **30 tests**
- [x] **The consent gate** — `AUTHORISATION` is **null**, exactly like
      `court/authorisation.ts`. Every automated call refuses while it is null.
      **`CLAUDE.md` §6's rule applied to a second vendor: if the authorisation's
      terms are not in the repo, the switch stays off.**
- [x] **Benchmark and extraction are separate permissions**, never one flag.
      `extractionPermitted` is expected to stay **false permanently** —
      `BHARAT_LAW_OFFER.md` §5
- [x] **A 401/403 on ONE account halts the WHOLE POOL.** Tested by counting
      network calls, not by inspecting a flag. **This is the rule that keeps
      2–3 accounts from being ban-evasion** — answering a refusal with the next
      credential is circumventing an access control, which their AUP names
- [x] **Two ceilings, not one.** Each account carries its own credit
      entitlement (Pro = **10,000/month**, their published meter) *and* the pool
      carries a lower global daily ceiling, so **adding an account does not
      silently multiply our traffic**
- [x] **Consent overrides more accounts than it covers** → the pool refuses
      rather than quietly using the covered subset

**WHY IT IS OFF.** Supreme Today gave a **written licence**. Bharat.Law gave a
**verbal yes** — and their Evaluation Terms permit benchmarking only *"without
our prior written consent"*, which is a **consent requirement, not a ban**. One
email converts it. `FOUNDER_QUEUE.md` **FQ-BL1** holds the exact wording to send.

**ORDER OF OPERATIONS, and the first step costs nothing:**

1. **Free tier first, ₹0, no signup.** Run *Kharak Singh* and *Danamma* through
   it. **That settles curated-vs-computed before any money moves.**
2. **Send FQ-BL1.** If they will not put it in writing, that is also an answer.
3. **Then buy — monthly, never annual.** Transcribe the email into
   `AUTHORISATION` and the pool opens by itself.

**Nothing here is on the Gate S2 critical path.** §2 still outranks it.

---

## 2 · GATE S2 — everything else is downstream of this

- [ ] **Recall levers** — **REGROUPED 9 Aug 2026, because "blocked on $65" was
      wrong for half of them.** `docs/RETRIEVAL_ARCHITECTURE.md` §0.

      **Blocked on nothing but a live Postgres** (same thing the reranker run
      needs — not money, not a key):
      **citation-graph expansion**, which is *already built*
      (`services/api/src/search/graph-expand.ts`, IDF-damped, harness-wired
      behind `HARNESS_GRAPH`) and has simply **never been measured**. Measure it
      **with the reranker and without** — that file's own note says graph and
      reranker are one combination, since expansion enters at rank 16 and cannot
      move success@5 alone.

      **Blocked on the LLM key only** — these are *query-side*, so they need
      **no re-chunking, no re-embedding, no reindexing**:
      HyDE · multi-query / RAG-Fusion · query decomposition.

      **~~Blocked on ~62 GPU-hours ≈ $65~~ — STRUCK 9 Aug 2026, MEASURED.**
      `Xenova/bge-m3` fp32 on this workstation's CPU runs at **36.6 ms/chunk**,
      so all 616,197 chunks is **≈ 6.3 hours** (12–19 h realistically) — **an
      overnight run on hardware we already own.** The $65 assumed a rented GPU
      because Railway has none and nobody re-checked once a 4060 Ti existed.
      `docs/RETRIEVAL_ARCHITECTURE.md` §6c. So: late chunking ·
      summary-augmented chunking (**DRM is 95.2%**) are **blocked on nothing but
      a night** — but still run the free query-side and graph levers first.

      **AND THE FREE LEVER IS NOT DONE: HyDE is built and unmeasured**, so this
      section's own sequencing rule says measure it before spending the night.

      **The schema question, recorded before the six hours rather than after.**
      Late chunking and SAC change the CHUNKS, not the model — so they are new
      rows, not a new column, and `judgment_chunks` has
      `UNIQUE (judgment_id, chunk_index)`. Two chunkings cannot coexist in it
      without putting a strategy into that key, and doing so would also put both
      strategies inside **one HNSW index**, so every ANN search would have to
      over-fetch and filter — the exact cost `dense()` already pays for PD-10
      filters.

      **Recommendation: a separate table with its own HNSW index.** It leaves the
      live index untouched, needs no filter on the hot path, and is deletable in
      one statement if the new chunking loses. If it wins, it becomes the table.
      **The reversible choice, for an experiment that may well be rejected** —
      256-token truncation was.
- [x] **GRAPH EXPANSION MEASURED at n=283, 9 Aug 2026 — the first time ever.**

      | | before | after |
      | --- | --- | --- |
      | success@5 | 19.1% | **19.1%** |
      | **recall@20** | 40.6% | **48.8%** |
      | MRR | 0.140 | 0.144 |

      **0 gained · 0 lost · 283 unchanged. McNemar: no discordant pairs at all.**
      By the A/B rig's own rule: **DOES NOT SHIP** on success@5.

      **But this is a success, not a null result, and `graph-expand.ts`
      predicted it in writing months ago:** *"Entering at rank 16 cannot move
      success@5 on its own. **Graph and reranker are one combination, not two
      features**."*

      **recall@20 moved +8.2 points.** The graph IS finding authorities that
      text similarity never retrieved — which is exactly the 56% that
      `BLOCKER_REGISTER` says no reranker can reach. They arrive below rank 5,
      so success@5 cannot move. **Recall is the thing the graph was supposed to
      fix, and it fixed it.**

      **The combination is now the experiment**, not either half.

- [x] **`ab both` MEASURED at n=283, 9 Aug 2026 — the combination DOES move the
      number, and then latency overrode the whole question.**

      | | before | after |
      | --- | --- | --- |
      | success@5 | 19.1% | **23.7%** |
      | recall@20 | 40.6% | **48.8%** |
      | MRR | 0.140 | 0.162 |

      **29 gained · 16 lost · 238 unchanged. McNemar p = 0.072 — NOT SETTLED**,
      95% interval −0.0% to 9.2%. **~577 queries would settle it; this run was
      283.** So: promising, trending the right way, **not proven.**

      **The graph+reranker hypothesis held.** Graph alone moved success@5 by
      **zero** with 0 discordant pairs. Together they moved it **+4.6** with 45
      discordant pairs. The graph supplies authorities text similarity never
      found; the cross-encoder is what lifts them into the top five. Neither
      half does it alone, exactly as `graph-expand.ts` predicted.

      **BUT THE RUN BREACHED THE LATENCY BUDGET AND THE HARNESS SAID SO:**
      rerank **mean 11,424 ms · p95 55,074 ms**, against Gate S1's **3 s for the
      entire search request**. *"Accuracy is moot until this fits."*

- [ ] **~~AND THE LATENCY IS FIXED — 55×~~ — WRONG. RETRACTED SAME DAY.**

      **The 209 ms benchmark used ~50-character synthetic strings. Real
      judgment passages are 2,169–2,641 characters (median 2,519) — roughly
      **50× longer** — and cross-encoder attention cost grows with the SQUARE of
      sequence length.

      **Measured on real passages from the corpus:**

      | reranker | 20 REAL candidates | 20 synthetic |
      | --- | --- | --- |
      | q8 on CPU | **11,424 ms** (A/B mean) | — |
      | **fp32 on DirectML** | **30,539 ms** · 1,527 ms each | **126 ms** |

      **fp32 on GPU is nearly 3× WORSE than q8 on CPU for the real workload**,
      and it sits at **7.9 GB of 8.1 GB** — which is why the fp32 A/B crashed at
      query ~210 with exit 13. The card cannot hold attention tensors for twenty
      2,500-character passages.

      **The latency breach is UNSOLVED.** Gate S1 allows 3 s for the whole
      request; the best measured reranker is 11.4 s.

      **That hypothesis was WRONG and is closed.** `rerank.ts` already sets
      `truncation: true, max_length: 512`, and already documents the quadratic
      cost. Nothing was untruncated.

      **But it led to the real lever. Measured on a realistic 2,530-character
      passage, q8/CPU, 20 candidates:**

      | `max_length` | 20 candidates | verdict |
      | --- | --- | --- |
      | **512** (current) | **3,613 ms** · 181 ms each | over the 3 s budget |
      | **256** | **1,647 ms** · 82 ms each | **inside** |
      | **128** | **786 ms** · 39 ms each | comfortably inside |

      **Sequence length dominates everything else.** It also explains the whole
      fp32 confusion: the 126 ms synthetic benchmark tokenised to ~15 tokens
      while real passages pad to the full 512, and cost is quadratic.

      **`RERANK_MAX_LENGTH` is now configurable, default UNCHANGED at 512**,
      because **the accuracy cost of truncating is unmeasured**. A cross-encoder
      that sees half a paragraph may rank it worse, and reranking exists to be
      accurate. **The decisive experiment is `ab both` at 256 against the 512
      baseline of success@5 = 23.7%** — it needs the corpus proxy reopened.

      **One discrepancy I cannot yet explain and will not paper over:** this
      bench measured **3,613 ms** at 512 tokens, while the `ab both` run
      reported a **mean of 11,424 ms**. Candidate causes are per-call overhead,
      varied real passage lengths, and CPU contention with the embedder. **Until
      that is reconciled, treat 3,613 ms as a floor rather than the number.**

      **What stands from the earlier entry:** the fp32 weights really were
      missing (`model.onnx_data`, 2.27 GB) and fp32 really does load now. Only
      the speed claim was wrong.

- [ ] **~~The 55× fix~~ — see above.** Retained for the record:

      | reranker | 20 candidates | verdict |
      | --- | --- | --- |
      | q8 on CPU | **11,424 ms** | 4× over the whole request budget |
      | q8 on DirectML | ~4,600 ms | int8 is poorly accelerated on DML |
      | **fp32 on DirectML** | **209 ms** (10.4 ms each) | **fits, with room** |

      **"q8 is the only usable build" was never true** — the fp32 weights were
      simply never downloaded (`model.onnx_data`, 2.27 GB, external-data format).
      fp32 is also **unquantised**, so its accuracy should be at least q8's.

      **The caveat that decides whether this ships: Railway has no GPU.** This
      makes the reranker viable *if* it is served on a GPU endpoint, and lets us
      measure true unquantised accuracy locally today. Re-running `ab both` at
      fp32/DML now.

- [x] **TRUNCATION TO 256 TOKENS: MEASURED AND REJECTED — 9 Aug 2026.**

      **It fits the budget and makes retrieval measurably worse.**

      | | 512 tokens | 256 tokens |
      | --- | --- | --- |
      | success@5 | **23.7%** | **13.8%** |
      | recall@20 | 48.8% | 48.8% |
      | MRR | 0.162 | 0.118 |
      | rerank latency | 11,424 ms (pre-clip) | **2,104 ms · p95 2,255 ms** |

      **paired delta −5.3%, 95% interval −10.0% to −0.6% — it does NOT span
      zero. McNemar p = 0.040.** 16 gained, 31 lost across 47 discordant pairs.

      **This is a real degradation, not noise**, and it is worse than doing
      nothing: 13.8% is below the 19.1% control. **Half a paragraph is not
      enough context for a cross-encoder to rank Indian judgments**, and the
      cheap latency win costs more accuracy than the reranker was adding.

      **So the trade-off is settled and the answer is no.** The rig's own
      verdict: *"DOES NOT SHIP: it makes retrieval measurably worse."*

      `RERANK_MAX_LENGTH` stays at **512**. It exists now as a measured knob
      with a known cost, not an untried idea.

- [x] **512 tokens WITH the clip — MEASURED 9 Aug 2026.** **mean 4,136 ms ·
      p95 4,263 ms**, against 11,424 / 55,074 before. success@5 reproduced
      **exactly** at 23.7%, so the clip is score-neutral end to end and not only
      in the unit test.

      **It also closes the discrepancy §2 refused to paper over.** The bench said
      4,205 ms and the live run says 4,136 — **within 1.7%**. The old 3× gap was
      tokenising text the model then discarded; nothing else.

      **1.38× over budget, not 3.8×.** The p95 collapsed by **12.9×**, and the
      distribution is now tight (mean 4,136 vs p95 4,263) — that tightness is
      itself evidence the clip removed the variance source.

- [x] **The free latency lever is DEAD, measured not assumed.** `padding: true`
      pads every pair to the longest in the batch, and padding is masked — so
      length-bucketed batching would be **score-identical**, exactly like the
      clip. Sampled 400 real operative paragraphs: **93.5% already hit the 512
      cap**, min 351. There is almost no variance to exploit and the ceiling on
      bucketing is **1.1%**. Five minutes of measurement instead of a day of
      building.

      **So the remaining 1,136 ms has no free fix.** Retrieval is p95 488 ms
      (`CORPUS_TIERING.md` §4), leaving 2,512 ms for reranking → **12 candidates,
      down from 20.** And that cut **must keep the 5 graph slots**: graph
      suggestions enter at ranks 16–20, so a naive "rerank the top 12" would
      never see them and the entire +4.6 combination would evaporate.

- [x] **THE PIN DEFECT — 9 Aug 2026. It contaminated both arms of every A/B this
      project has run.** `services/api/src/search/query-shape.ts`, fixed in
      `c1bb164`.

      `classifyQuery` returned `shape: 'citation'` whenever **any**
      citation-shaped substring appeared *anywhere* in the text. Every eval query
      is a 200–900-character passage of judicial reasoning, and redaction removes
      only the *cited* judgment's own citations — up to three others are allowed
      to survive. So:

      | | |
      | --- | --- |
      | classified as `citation` | **140 of 283** |
      | resolved to exactly one judgment → **pinned at rank 1** | **46** |
      | **the pinned judgment was the WRONG case** | **37 = 13.1% of the set** |

      **Pinning inserts a judgment at rank 1 and shifts everything below it down
      one place**, so a gold answer sitting at rank 5 was pushed out of the top
      five by a case the passage merely mentioned in passing.

      **`warrantsExactLookup` had already written down the rule it was
      violating:** *"a missed citation is a slower correct answer, while a
      wrongly-claimed citation would pin the wrong judgment at rank 1."* The
      classifier was simply not strict enough to honour it. **A citation must be
      what the query is ABOUT, not merely present in it** — tested as the length
      of what remains once the citation is removed.

      **Verified on the real corpus rather than asserted:** wrong pins **37 → 0**,
      while the live hard-negative suite still returns **25/25 real and 20/20
      reporter citations resolving** and **279 near-misses resolving to nothing**.

      **EVERY NUMBER ABOVE WAS MEASURED THROUGH THIS AND IS VOID** — 19.1%
      control, 23.7% graph+reranker, 13.8% at 256 tokens.

      **RE-MEASURED at n=283, and the verdict changed.**

      | | through the wrong pins | **corrected** |
      | --- | --- | --- |
      | success@5, control | 19.1% | **17.3%** |
      | success@5, graph+reranker | 23.7% | **22.3%** |
      | recall@20 | 40.6% → 48.8% | 38.9% → **48.1%** |
      | MRR | 0.140 → 0.162 | 0.119 → **0.153** |
      | paired delta | +4.6%, interval **−0.0 to 9.2** | +4.9%, interval **0.4 to 9.5** |
      | McNemar | p = 0.072 — *not settled* | **p = 0.049 — SHIPS** |

      **THE BASELINE FELL, AND THAT IS THE FIX WORKING RATHER THAN FAILING.**
      Of the 46 pins, **9 were the gold judgment** — which can only mean the
      passage still contained a citation resolving to its own answer, i.e.
      **redaction had missed it**. The pin was converting that residual leakage
      into a *guaranteed rank-1 hit*. Removing the pin removes the guarantee, and
      about nine free hits with it. **So 19.1% was inflated by leakage on ~3.2%
      of queries, and 17.3% is the honest number.**

      Note what removing the pin does **not** do: the missed citation is still in
      the query text, so BM25 can still match on it. **The leakage is reduced,
      not eliminated** — see the redaction item below.

      **And the combination now crosses the line: p = 0.049.** Stated plainly
      rather than celebrated — that is *marginally* under 0.05 on the same 283
      queries with one confound removed, not a replication. **Growing the set is
      what would settle it.**

      **The latency line from this run is contaminated and should be ignored:**
      mean 4,320 ms · p95 5,169 ms, measured while typechecks and test suites
      ran on the same CPU. The clean figure is the **4,136 ms · p95 4,263 ms**
      from the uncontended run above.

- [ ] **THE CITATION EXTRACTOR COVERS FIVE FORMS, ALL SUPREME-COURT-CENTRIC** —
      found 9 Aug 2026 while building the leak check. **Not fixed: the blast
      radius reaches ingest, the citation graph and every caller of
      `classifyQuery`, and it must not be changed mid-experiment.**

      `@lawmind/ingest`'s `extractCitations` holds patterns for `INSC`, `SCC`
      (either spelling, round brackets only), `AIR … SC`, `SCR` (**either**
      bracket) and `SCALE`. **A specialist or High Court reporter is invisible to
      it** — read directly off the corpus: `[1953] 24 I.T.R. 70`, `[1946] 14
      I.T.R. 673`.

      There is also a smaller inconsistency: `citationLookupKey`'s own docstring
      promises `[2019] 4 SCC 221` collapses to the same key as the round-bracket
      form, and `build-queries.ts` carries a square-bracket citation *shape* —
      but the extractor never produces one for SCC, so the normalisation handles
      a form nothing can find. Pinned as a failing expectation in
      `build-queries.test.ts` rather than silently fixed.

      **A CORRECTION TO MY OWN FIRST NUMBER, recorded because the method matters
      more than the result.** The first measurement counted every square-bracket
      span the extractor did not return and would have reported **1,561 missed
      against 1,788 extracted — a 47% miss rate.** That was wrong twice: the SCR
      pattern already takes either bracket, so most were never missed; and the
      residual count is dominated by **`[2003] SUPP. 4`, a running page header
      repeated dozens of times per judgment**, which is not a citation at all.
      **No percentage should be quoted from this until the header artefact is
      excluded.** What stands is the qualitative finding: **specialist reporters
      are not extracted, at all.**

      **MEASURED, AND IT COSTS NOTHING TODAY.** An I.T.R. authority is only a
      lost graph edge if that judgment is in our corpus — so the number to check
      is *resolvable* misses, not raw ones. Checked against all 38,341 rows:

      | | |
      | --- | --- |
      | judgments in the corpus | 38,341 |
      | **court = Supreme Court** | **38,341 — 100%** |
      | carrying an I.T.R. reporter citation | **0** |
      | carrying a Cri.L.J. reporter citation | **0** |

      **A missed specialist-reporter citation cannot resolve to anything we
      hold.** It would be an unresolved edge whether we extracted it or not, so
      the gap has **zero present impact** and fixing it now would move no number.

      **It becomes real the moment High Court data lands** — which is precisely
      what the Supreme Today licence would buy and what eCourts harvesting would
      add. **So this is a prerequisite of that ingest, not a defect of this one**,
      and it belongs in the same piece of work rather than ahead of it.

- [ ] **REDACTION MISSES CITATIONS THAT RESOLVE TO THE GOLD JUDGMENT** — found
      9 Aug 2026 by the pin audit, not yet fixed.

      `build-queries.ts` strips `citation_text`, the gold judgment's
      `neutral_citation`, its `reporter_citations` and its distinctive title
      words. **That is not the same as stripping every citation that resolves to
      the gold judgment** — a format the corpus row does not carry survives, and
      the query then contains its own answer.

      The fix is mechanical: after redaction, resolve every remaining citation
      through `citationLookupKey` and **reject any query still pointing at its
      own gold**. Rejecting rather than redacting, because a one-sentence hole is
      cheaper than a query nobody would type.

      **It will DROP queries, so the superset guard will refuse it** — correctly,
      and that is the guard doing its job rather than an obstacle. Doing it means
      re-baselining deliberately with `--rebuild`, and every number above is
      re-measured against the new set. **A decision to take between runs, never
      in the middle of one.**

- [x] **THE RERANKER WAS SCORING 37.6% OF CANDIDATES AGAINST AN EMPTY STRING —
      9 Aug 2026. This is larger than the pin defect.** `c6b7114`.

      `operativeParagraph` is filled from the **dense** arm's `bestChunk` map, so
      a judgment BM25 found that the dense top-50 did not has no chunk and the
      field is `''`. `retrieval.ts` handed that same field to the cross-encoder.

      **Measured over 500 candidates from 25 real queries: 188 of them — 37.6% —
      were empty.** A cross-encoder scoring a query against `""` returns a low
      score necessarily and every time, so **the reranker was systematically
      deleting two candidates in five from the top five** — and doing it to
      exactly the lexical matches that carry section numbers and citations.

      **This plausibly explains the reranker's whole disappointing record**:
      +6.0 at p = 0.210 alone, and **16 queries LOST** when it was applied.

      **`API_CONTRACTS.md` is not wrong** — it says an empty `operativeParagraph`
      is legitimate because *"a result matched by the lexical ranker alone has no
      dense chunk behind it and therefore no paragraph **to show**"*. That is a
      correct decision about **display**. It was never a decision about
      **ranking**, and the two uses of one field had quietly diverged.

      Graph suggestions had a quieter version: `chunk_index 0`, which in an
      Indian judgment is the cause title, the coram and counsel's names. **The
      cross-encoder is the only thing that can lift a rank-16 graph suggestion
      into the top five, and it was being asked to judge them on their
      letterhead.**

      Fixed by `passagesForRerank()` — the chunk nearest the query vector, one
      batched `DISTINCT ON`. **Verified: empty passages 37.6% → 0.0%, all 188
      filled.** `operativeParagraph` untouched; conflating display and ranking
      again is how this returns.

      **AND THE LATENCY NUMBERS WERE FLATTERED BY IT TOO.** An empty string
      tokenises to almost nothing, so **37.6% of the reranker's candidates were
      nearly free**. Filling them means the cross-encoder now does work it was
      silently skipping. The re-run's observed rate bears this out immediately:
      **27 s/query against 15 s/query before.**

      **Prediction, written before the run reports so it can be checked rather
      than rationalised:** if cost is linear in non-empty candidates, the mean
      goes from 4,136 ms to roughly **4,136 / (1 − 0.376) ≈ 6,600 ms**, plus one
      `passagesForRerank` round trip per query. That would put reranking at
      **~2.2× over the whole-request budget rather than 1.38×**, and it makes the
      12-candidate cut necessary rather than optional. **Part of the observed
      slowdown is the round trip over the Railway proxy, which production does
      not pay — that share must be separated before the number is quoted.**

- [x] **A VALIDITY CAVEAT ON THE WHOLE GATE, measured 9 Aug 2026.** The eval set
      exercises a **different retrieval path from the one advocates will use**.

      `plainto_tsquery` ANDs every lexeme. Over the first 30 eval queries — each
      a 200–900 character citing passage — the AND pass returned a **median of 1
      candidate out of 38,341**, never more than 2, and fell below the relax
      floor on **30 of 30**. The OR fallback therefore fires **100% of the
      time**.

      **Real advocate queries are short**, so production will mostly run the AND
      path. **We are tuning a configuration our users will not hit.** This is
      inherent to the CLERC method — a citing passage is long by construction —
      and it is the price of ground truth with provenance.

      **And the other fixture does not cover the gap.** `queries.hand.json` is
      **five queries, all Hindi, 225–268 characters** — genuine research
      questions rather than extracted passages, which is better, but still long
      enough to take the same OR path. So:

      > **No query anywhere in this harness is short, and none is a short
      > English one. The query shape most advocates will actually type has zero
      > coverage.**

      That is not an argument against the derived set, which is the only thing
      giving us ground truth with provenance. It is a gap that needs its own
      fixture — short English queries, with provenance, held separately and
      **never averaged into the same number**, because a metric mixing two query
      populations reports on neither.

      **The query half is now built** — `services/harness/src/issue-statements.ts`,
      15 tests. Indian judgments state their question formulaically, and that
      sentence is short, question-shaped and the court's own. **Measured on 300
      real judgments: 18.0% yield one, 88 statements, median 134 characters.**

      **The GOLD half is an open problem and is deliberately unsolved.** CLERC
      works because the citation sits *at* the passage, so the link is the
      judge's own. An issue statement carries no such link — the authorities
      answering it are cited pages later, interleaved with those for every other
      issue the judgment decides. The tempting rule, *"gold = every judgment this
      one relied on"*, is available today and **weaker than it looks**: a
      judgment deciding four issues would score a query about issue one correct
      for retrieving an authority that answers issue three, inflating success@5
      by an unknown amount in an unknown direction. **That is worse than not
      measuring**, so the fixture is not built on it.

      The immediate consequence was a free latency win: the AND pass is skipped
      above 200 characters, since its match set is a strict subset of the OR
      pass's and the code already keeps whichever returned more. **Latency only —
      it cannot change a result.** `7dacc7a`.

- [ ] **HyDE — built, wired as an A/B lever, not yet measured.**
      `services/api/src/search/hyde.ts`, 14 tests.

      It generates prose about law, which `CLAUDE.md` otherwise forbids, and is
      acceptable only because of **where that prose is allowed to go**: it reaches
      the embedder and nothing else, **citation-shaped spans and bare case names
      are stripped before embedding** — the model has no retrieval, so every
      citation it writes is invented, and an invented citation is *noise pointing
      somewhere specific*, which is worse than noise — and **only the dense arm
      uses it**, so BM25 keeps the advocate's literal words.

      **Generation costs 2,519–4,916 ms against a 3,000 ms whole-request
      budget**, so it fires only on `concept` queries, where the register gap it
      exists to close actually is. **`dataClass` is required with no default**:
      a user-typed query is ambiguous, ambiguity resolves to sensitive, and
      sensitive is refused under OD-6 — so **HyDE over real user queries does not
      ship until the DPA lands**, whatever it measures.

- [ ] **Settle the reranker properly** — p = 0.072 needs ~577 queries. The
      query set is 283; the eval set would have to grow before this is decided.
- [~] **C1 · IPC↔BNS mapping** — unblocks the five BNS queries and closes the last
      S1 criterion. Handles verified: **IPC `123456789/11091` · Evidence `4218` ·
      CrPC `4221`**.

      **Splitter built and STOPPED at an honest limit.** Measured on the real IPC
      PDF: **36 sections of roughly 511**, range 1–120, 84 gaps. What it finds is
      correct — s. 1 and s. 2 are the real ones — but the PDF text layer puts
      most headings mid-line, and the heading rule is line-anchored. **The anchor
      is what stops it firing on ordinary numbered prose, so relaxing it trades
      an incomplete corpus for a wrong one.**

      **RE-DIAGNOSED 9 Aug 2026, and the earlier diagnosis was wrong twice.**

      **The layout hypothesis is dead.** Read the PDF's own text items: every
      item sits at **x = 72.0**, one font, one size. There is no indentation, so
      position carries no signal and "headings by POSITION" cannot work. The
      line anchor was never the problem either.

      **Both real misses were vocabulary, and both are now fixed:**
      a defining section's heading opens with a **quotation mark**
      (`19. "Judge".--`) which `[A-Z]` rejected — that is most of the
      definitions chapter — and an amended section carries its **footnote marker
      before the number** (`4*[18. "India".--`) so the line does not start with
      the digit. **36 → 70 sections**, both prefixes narrow, and the
      ordinary-numbered-prose guard still passes.

      **And the denominator was wrong.** "36 of ~511" measured against a number
      that is not in the file. India Code handle `123456789/11091` serves an
      **INCOMPLETE IPC**: 58 pages running ss. 1–120B, then ss. 168–171H, then
      s. 511. **Sections 121–510 are simply absent** — page 57 is s. 120B and
      page 58 is s. 511. Every page has a text layer, so this is not an
      extraction failure; the source itself is partial. **86 distinct sections
      carry a body marker, and we now parse 70 of them.**

      **So the next move is a SOURCE, not a parser.** No regex can recover
      sections that are not in the file, and s. 302 — the one everybody checks —
      is one of them.
- [x] **STALE — CORRECTED 10 Aug.** `OPENROUTER_API_KEY` is SET (73 chars) and `ANTHROPIC_API_KEY` is SET. The three metrics are **no longer key-blocked**; they are blocked on nothing but a run, and they sit under an ungraded diagnostic (Q3). `FOUNDER_QUEUE.md` §1 and §5 are stale with it — §5 (the $65 GPU) was struck 9 Aug when re-embedding measured 36.6 ms/chunk on local CPU

---

## 3 · THE MOAT, ranked by how long a funded competitor needs to copy it

`docs/TECHNICAL_MOAT.md` §5.

- [~] **Paragraph extraction for `overruled_in_part`** — extractor built, 20
      tests, wired into the propagation. **It does NOT unblock the seven, and the
      reason is a finding rather than a gap.**

      It first found paragraphs for all seven and every one was wrong.
      `[Para 129]` is the SCR headnote's own pinpoint into the **citing**
      judgment; the overruling itself appears in a *Case Law Cited* list with
      **no paragraph attribution at all**. We were one `--apply` from recording
      *Vineeta Sharma*'s paragraph 129 as the dead paragraphs of *Danamma*.

      Two refusals now catch that, and the corpus correctly returns **7 skipped**.
      **The paragraphs are not in that region of the text.** They are either in
      the body of the citing judgment where the overruling is actually reasoned —
      which needs a different locator, not a wider window — or nowhere.

      **Their Authority Check may supply them directly, which makes this a reason
      to buy the licence rather than a reason to keep parsing.**
- [ ] **The verification record** — 12+ months for anyone to copy, because it
      cannot be retrofitted onto logs that were never kept. Every field is already
      in `citation_checks` and **nothing renders it**
- [ ] **OCR** — replace `paddleocr | tesseract`, both at the benchmark floor
      (EasyOCR 93.6 → **58.3** on real Devanagari scans). **Qwen3-VL-8B,
      Apache-2.0, 75.2, one 24 GB GPU.** Self-hosted means *the file never leaves*
- [ ] **Offline-first retrieval** — `sqlite-vec` + `op-sqlite`. Own matters, saved
      authorities, opened judgments only. **Overruled status must render "last
      checked 08:14", never silently as good law**, or offline does not ship
- [ ] **Ingest speed** — measure whether High Court uploads actually land inside
      the May 2026 24-hour direction. Unproven until measured from our own ingest

---

## 4 · STANDING CORRECTIONS OWED

- [x] `docs/COMPETITIVE.md`'s **"nobody sells a workflow"** — corrected 8 Aug.
      Most of the paragraph survives: the *incumbents* still sell databases; what
      changed is that a new entrant arrived with the workflow already in it
- [x] `docs/OCR_PIPELINE.md` — correction recorded. Its premise is wrong and
      nobody should build on it until the stack moves
- [ ] **E1.2 alert drill is NOT done and must not be ticked.** `check-alert-
      coverage.mjs` is red at **2 of 4 PD-5 triggers** and deliberately unwired
      from `ci:local` until the violations are fixed. The two missing:
      `own_matter_judgment`, `unknown_listing` (confirmed by name 11 Aug,
      running the guard directly — `filed_citation_moved` is NOT one of the
      two; it is already declared and already written by `fanout.ts:315`,
      RCC bus 0042/0044). **`own_matter_judgment` is now concretely
      buildable and was not before today**: `matters.cnrNumber` and
      `judgments.cnr` are both real columns, and `judgments.cnr` reached
      100% backfill coverage earlier the same session (task 007) — the join
      key this trigger needs (a newly-ingested judgment's `cnr` matching an
      existing matter's `cnrNumber`) now exists on both sides. Not built —
      out of this session's scope (HC corpus characterization + retrieval
      benchmark directive) — but the blocker that made it unbuildable is
      gone, so this is next-pickup, not still-blocked. `unknown_listing`
      remains genuinely blocked on OD-1 (court monitoring vendor, still
      TRIAL PENDING) — it needs cause-list data LawMind does not yet have.
- [x] **`alerts/route.test.ts` was red and is now green — 10 Aug 2026.** Commit
      `20a929d` added `settings.unavailable` to the response and did not update
      its own test, so the lane carried a red test for a deliberate change.

      **INTENT: code returns `settings` including
      `unavailable: ["ownMatterJudgment","unknownListing"]`; the failing test
      expected exactly three boolean keys; `docs/API_CONTRACTS.md` §1084
      specifies the key is ALWAYS present with that value.** Spec outranks
      tests, so the test was stale, not the code. It now **asserts** the field
      rather than tolerating it, so it guards the contract instead of surviving
      it.
- [ ] **`statutes/route.test.ts` is RED, and it is a DATA condition, not a code
      defect — found 10 Aug 2026, deliberately NOT "fixed".** The test asserts
      every act has sections. Measured against the live corpus: **22 of 845 acts
      have zero sections** — *The Bengal Indigo Contracts Act, 1836*, *The
      Bombay Rent-free Estates Act, 1851*, *The Deo Estate Act* and 19 more,
      all obscure colonial-era acts.

      **Two candidate fixes and they are not equivalent**, which is why this is
      recorded rather than decided alone: either the ingest should backfill
      those acts' section text (if indiacode publishes any), or the test should
      accept that some acts legitimately have none. **Loosening the assertion
      without checking indiacode would be weakening a test to make a suite
      green**, which is the failure mode the judge pass exists to catch.
      Nothing here was touched.

---

## 5 · WAITING ON THE FOUNDER — see `docs/FOUNDER_QUEUE.md`

Nothing below blocks the lane. Each has a built path that refuses honestly.

**Credentials and money:** Supreme Today account · Indian Kanoon
`INDIANKANOON_API_TOKEN` (₹500 credit) · `OPENROUTER_API_KEY` · a GPU for
self-hosted OCR · one Supreme Today seat for lawful manual benchmarking.

**Ask Supreme Today before the harvest starts:** the **per-account request
ceiling** (daily, monthly, burst) — it moves total cost by **30×** and
`SUPREMETODAY_MAX_REQUESTS_PER_DAY` is a *placeholder* until the contract sets
it · **may we DISPLAY their headnotes or only hold them**, and what attribution.

**Counsel, one instruction, three questions:** SCR official headnotes on e-SCR
(free, ~34,000 judgments — s. 52(1)(q)(iv) vs *EBC v. Modak*, and an official
headnote is a **government work**) · the lay-facing explainer · OD-2's written
residency view.

**Decisions:** the free citation check (the strongest idea found — asks nobody to
switch) · the ₹5,000/yr price point that reaches our exact user · which
distribution channel first · an advocate to review 20 outputs.

---

## 6 · HOW TO PICK THE NEXT TASK

1. **Anything in §1**, while the account is imminent.
2. **Then §2.** Gate S2 gates the ground campaign, the marketing claim, *and* the
   evaluation of the Supreme Today licence itself.
3. **Then §3**, in the order written — it is already ranked by defensibility.
4. **§4 whenever a related file is open.**
5. **Never §5.** Queue it and keep going.

**And the standing rule that decides ships:** `DATA_ADVANTAGE.md` §1d — *if it
does not move the number on our own corpus, it does not ship.* Applied on 8 Aug to
reject a **free** Apache-2.0 reranker at +6.0 points and p = 0.210. A paid
dependency gets the same test, not a softer one.

### Q1.37 · THE BUS NEVER DELIVERED TO NEW1/NEW2/NEW3 — a deleted digit · 13 Aug 2026

**The founder was relaying bus messages between agents by hand.** Not because
the agents were ignoring them: `lane-bus.sh` resolved a lane by reading
`.agents/bus/.lane-<session_id>` through **`tr -cd 'A-Za-z'`, which deletes
digits**. `NEW1` read back as `NEW`, matched no lane, and the session was told
it was UNBOUND while its binding file sat there being correct.

`LCC` and `RCC` contain no digits. **The bus worked flawlessly for two lanes and
silently died for every lane added after.** 66 messages undelivered.

**Fixing it immediately exposed a worse bug.** The delivery path appended all
pending messages, clipped to 8,000 chars, then advanced the cursor to the
highest sequence **read** rather than **shown**. First live delivery: 22 pending,
4 displayed, cursor set past all 22 — eighteen messages destroyed under a
`[TRUNCATED]` note that read like the whole story. It had never fired because
bug one meant no lane with a backlog ever reached it. **Two dormant bugs, each
needed to hide the other.**

**And the first fix for that was also wrong** — it skipped an over-budget
message and kept scanning, a smaller later one fitted, the cursor jumped the
gap, 9 of 22 vanished. A cursor is a single high-water mark, so delivery must be
contiguous. Caught only because the test **drained the backlog to empty and
counted**; every single-delivery check looked correct.

**Shipped:**
- `lane-common.sh` — one implementation of lane resolution, budgeting and cursor
  rules, because both bugs lived in code a second hook would have copied.
- `lane-wake.sh`, a **Stop hook** — mail now wakes a lane mid-work instead of
  waiting for a human to type. Cannot spin: delivery consumes, so the same
  message never wakes a lane twice.
- `pnpm lane:status` — answers "is anyone receiving me", which `lane:inbox`
  never could. It is what found this.
- `scripts/lane-bus.test.sh`, 14 cases, wired into `ci:local`.

**The limit, recorded in `LANE_PROTOCOL.md` §2b:** a Stop hook cannot start an
**idle** session, only stop a running one from finishing. The ring stays alive
only while it keeps itself alive — which is why lanes must send downstream on
finishing a *unit* of work, not batch findings to the end of a session.

### Q1.38 · 20.5M DOCUMENTS: ~1 MONTH OF TIME, ~5.3 TB OF POSTGRES · 13 Aug 2026

`docs/ai/CORPUS_SCALE_PROJECTION.md`. The founder's "773k rows/hour" is
**paragraph extraction, not acquisition** — applying it to ingestion overstates
progress ~7x.

| | |
| --- | --- |
| ingestion | 15,364/hr (1h) · 38,146/hr (6h) · 28,343/hr (24h) |
| paragraph extraction | ~773k rows/hr ≈ **106k judgments/hr** |
| **time to 20.5M** | **21–53 days, ~a month at the 24h average** |
| at 20.5M, data-first | **~405 GB** |
| at 20.5M, with embeddings | **~5.3 TB** (~316M vectors) |

Embeddings multiply storage thirteenfold: 1024-dim vectors are 4 KB each and the
HNSW index measures **3.6x the heap it indexes**. Two levers cut it to ~1.1 TB —
`halfvec` (pgvector 0.8.5 installed, verified against `pg_type`) and not
embedding the ~66% of documents that are bail orders and procedural disposals.
**Neither applied**: both are retrieval decisions on NEW1's measurement, because
an authority we choose not to index is invisible to the verification that
catches fabrication. `FQ-STORAGE` and `FQ-20M` raised.

### Q1.39 · THE OVERRULED EXTRACTOR MISSES EVERY CASE BUT THE LAST IN A GROUP · 13 Aug 2026

`docs/ai/OVERRULED_GROUP_MARKERS.md`. Found chasing **one** citation NEW3 left
inconclusive — `(1996) 5 SCC 670`, refused as THIN on a 3-token name match.

Reading the source instead of arguing with the score: **MADA v. SAIL**
(`2024 INSC 554`) prints `P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR
92 : (1996) 5 SCC 670 – overruled.` **The identity is not an inference** — MADA's
own text pairs the name with the citation. We hold it (`1996 INSC 800`) and it
carries `overruled_status = 'none'`.

**`– overruled.` closes a semicolon-separated GROUP, not the citation beside
it.** The extractor scoped it to one citation. Measured: **55 adverse
dispositions across 45 judgments, 33 caught today, 22 missed** — dominated by
the entire mineral-royalty line (India Cement, Orissa Cement, Mahalaxmi Fabric,
Saurashtra Cement, Mahanadi Coalfields, P. Kannadasan), every one rendering as
good law against a **zero** stale-overruled threshold.

**Three versions, and report-only was load-bearing twice.** v1 claimed *Shayara
Bano*, *Kihoto Hollohan* and *Tulsiram Patel* were overruled; v2 claimed
*E P Royappa*, *Navtej Singh Johar* and *Anuj Garg*. Had either written to
`overruled_status`, landmark constitutional authority would now be marked dead
law by the tool built to prevent exactly that.

**v3 works because the vocabulary was measured, not guessed.** The disposition
set is closed — `referred to` 288, `relied on` 162, `overruled` 62, `followed`
42, `distinguished` 19, `held inapplicable` 12, `affirmed` 10, `approved` 8,
`clarified` 6, `explained` 3, `disapproved` 2, plus three singletons. Everything
else a loose pattern matched was prose. **The web does not document this**; the
corpus did. 18 tests. **Writes nothing.**

**Second finding, possibly larger:** these lists print both citation forms paired
(`[1996] Supp. 4 SCR 92 : (1996) 5 SCC 670`) across **656 judgments** — the
SCC/AIR→SCR identity gap that blocks all 34 unresolved edges, sitting in text we
already hold. NEW3 has made it **P0** in the acquisition queue, ahead of every
external option. `judgment_citation_aliases` already exists as its home; no new
table needed.

### Q1.40 · THE HEADNOTE CONCORDANCE — built, and three defects found on the way · 13 Aug 2026

`services/ingest/src/headnote-dispositions.ts` + `concordance-headnote-cli.ts`.
**Nothing written to the database yet.** 21 tests.

Harvests the SCR↔SCC concordance the Supreme Court prints in its own headnote
Case Law lists — the mapping that `overruled-resolve-cli` names as the blocker
for all 34 unresolved `overruled` edges, sitting in text we already hold.

**Dry run, Supreme Court scope:** 1,793 judgments print a paired `SCR : SCC`
citation · 5,787 paired sightings · **3,927 distinct aliases survived
reconciliation** · 43 dropped because sightings disagreed about the target.

#### Three defects, each found by a different route

**1 · Distance is not adjacency — found by NEW3's cross-check.** They verified
the premise independently (char_offset proximity vs my name resolution, 13 of 34
confirmed both ways) and measured that **6 of 21 proximity hits were false
positives**, one being a page header `354 [2023] 6 S.C.R. 354` read as a
citation. My parser searched each entry for an SCR and an SCC *independently*, so
two forms merely co-occurring were paired as though the reporter had equated
them. Now an entry is `paired` only when both come from a single `X : Y`
construction. **Precision where it writes, recall where it is read** — the loose
fields still feed the disposition report a human reads.

**2 · The migration-0026 expression index does not exist.** The first dry run
died mid-query with no error. `concordance-cli.ts` resolves SCR keys in SQL and
its comment claims that index; `pg_indexes` shows only
`judgments_reporter_citations_gin`, a plain GIN over the **raw** array, which
cannot serve a query applying `upper(regexp_replace(…))` to every element. It
degraded to ~150M regexp calls. **Same shape as Q1.23** — a comment claiming a
guard that was never wired in. Fixed by resolving in memory: only **38,342**
judgments carry `reporter_citations` at all, which is exactly the Supreme Court
count and independently corroborates the scoping. **The deployed adjacency pass
carries the same latent cost.**

**3 · `| tail -30` hid a running job.** A backgrounded dry run appeared to
produce nothing for ten minutes. `tail` buffers until its input closes, so the
log was empty while the job ran normally. My own error, and the reason the
second attempt writes to a file directly.

#### Still open

- The dry run has not yet reported how many aliases resolve to a held judgment,
  nor how much of the 34-edge gap it closes. **No `--apply` until it does.**
- **A discrepancy I cannot yet explain:** an earlier all-courts measurement found
  **657** judgments with pairs; the Supreme-Court-only run finds **1,793**. A
  narrower filter cannot return more. The earlier run is the suspect one (it
  fetched every court's `full_text` and may have returned partially), but that is
  a hypothesis, not a diagnosis. A `COUNT(*)`-only query settles it and is queued
  behind the harvest rather than run concurrently against a proxy 24 ingest
  workers are already using.
- `--all-courts` sweep, off-peak, to test the SC-only scoping assumption. NEW3
  corroborated it (SCR is the Supreme Court's own reporter, e-SCR confirmed
  SC-only) but explicitly flagged it as corroboration, not independent
  verification.

### Q1.41 · `failure:classify` RE-RUN CLOSED — 288/288, zero timeouts, and two root-caused fixes that outlast this one run · 13 Aug 2026

**All 288 gold queries classified. No stragglers left, no timeouts accepted as
final.** Five attempts, each a genuine fix rather than a blind retry:

| attempt | concurrency | timeout | result |
| --- | --- | --- | --- |
| 1 (sequential) | 1 | 120s | killed at 18/288 — too slow to finish |
| 2 | 6 | 120s | 88 succeeded, 184 timed out (rising failure over the run) |
| 3 | 3 | 120s | 161/183 succeeded — halving concurrency alone recovered most of it |
| 4 | 3 | 120s | 7/22 succeeded, 15 remained |
| 5 | 3 | **240s** | **15/15 succeeded, zero timeouts** |

**BY PRIMARY CLASS, 288/288 (final):**

| class | count | share | Q1.29 baseline (294,809 edges) | delta |
| --- | --- | --- | --- | --- |
| SUCCESS | 50 | 17.4% | 16.8% | +0.6pp |
| AUTHORITY_RETRIEVED_BUT_BADLY_RANKED | 98 | 34.0% | 34.0% | 0.0pp |
| AUTHORITY_HELD_BUT_NOT_RETRIEVED | 140 | 48.6% | 49.1% | −0.5pp |
| NO_AUTHORITY_FOUND | 0 | 0% | 0% | unchanged |

**Corpus context, recorded per LCC's standing ask**: this run's directed target
was the 1.1M-edge graph (`judgment_citations` at 1,101,262 when TARGET 1 was
set, bus 0193); by the time the last query classified, live query showed
**1,209,451 judgments, 1,336,748 edges** — the corpus moved ~10% during the
run itself, consistent with LCC's own warning (bus 0264/0277/0280) that the
graph is now growing faster than any single measurement window.

**The citation graph grew 3.7x (294,809 → 1,336,748 edges) and the failure
distribution moved essentially nothing (≤0.6pp, noise-level on n=288).** This
is itself the finding, not a null result: growing the citation graph does not
help THIS benchmark, because `build-queries.ts`'s `INNER JOIN judgments cd ON
cd.id = jc.cited_judgment_id` guarantees every gold judgment ID was already a
resolved, held judgment at build time — a bigger graph cannot make an
already-resolved answer "more resolved." The failures are structurally
retrieval/ranking, not citation-graph coverage, for this specific query
population. (Full reasoning already sent to LCC, bus 0287, in response to
their 8.4%-resolution-rate concern — same conclusion, reached before this run
finished.)

**NO_AUTHORITY_FOUND confirmed genuinely zero**: `NEW3_ACQUISITION_QUEUE.json`
— 0 new entries, 0 total. Correct by construction (every gold judgment is
drawn from the corpus's own citation edges, so `NO_AUTHORITY_FOUND` cannot
fire for this query set) and confirmed empirically across all 288.

**Failure-type routing, as directed:**

| type | count | destination |
| --- | --- | --- |
| retrieval failure (`AUTHORITY_HELD_BUT_NOT_RETRIEVED`) | 140 | stays with NEW1 |
| ranking failure (`AUTHORITY_RETRIEVED_BUT_BADLY_RANKED`) | 98 | stays with NEW1 |
| citation/concordance failure | **0** | none to route — see above, structurally impossible for this gold set |
| missing-data failure (`NO_AUTHORITY_FOUND`) | 0 | none to route to NEW3 |

**Secondary flag**: `EVIDENCE_WRONG` 130 of 148 found-authority queries
(87.8%). Still high, consistent with `judgment_paragraphs` coverage not yet
at 100% (LCC's last figure ~79.8%, climbing) — some found judgments still
lack a paragraph row for Q1.32's `fillParagraphFallback` to use. Not a
regression; expected given known partial coverage.

**Two root-caused fixes, not just retries, now permanent in the tool:**

1. **`openDb()` adopted** (services/ingest/src/db-host.ts, LCC bus 0169) —
   same DNS root-fix as `arms-cli.ts`.
2. **`CONCURRENCY` and `QUERY_TIMEOUT_MS` made tunable** via
   `CLASSIFY_CONCURRENCY` / `CLASSIFY_TIMEOUT_MS`. The second was root-caused,
   not guessed: pulled the single most persistent straggler
   (`civil-e5de6bbd`, failed in attempts 2, 3 *and* 4) out of the batch loop
   and ran `hybridSearch` against it directly with no timeout — completed
   cleanly in **65,978ms**. Not stuck; genuinely slower than 120s under the
   ring's current 5x-throughput push. Raising the ceiling to 240s for the
   final straggler-only pass converted 15/15 timeouts into 15/15 real
   classifications, `civil-e5de6bbd` included.

**Q1.25 (case-title pin) status**: already shipped, live-verified, and
measured closed in Q1.30 earlier this session — no further action from this
run. The `failure:classify` re-run and Q1.25 are separate threads; both are
now closed.

**Reported to LCC on the bus.** All harness changes committed and pushed
(`fa54441`, `497e4b0`, plus the earlier `65b7d7c` openDb adoption).

### Q1.43 · A REAL FAILURE TAXONOMY OVER THE 238 NON-SUCCESS CASES — bottom-up, one strong finding, two structural limits named honestly · 13 Aug 2026

**`failure:taxonomy` built** (`services/harness/src/failure-taxonomy-cli.ts`),
reading Q1.41's checkpoint — no new retrieval load, pure analysis. Per
`RING_PROGRAM.md` 2a/2c: cross-tabulated first, did not invent clusters
before looking. Full output in the tool's own run; findings below.

**THE HEADLINE, and it survived checking as a rate, not a raw count:**

| benchmark group | success rate (of all queries in that group, not just failures) |
| --- | --- |
| civil | 44/200 = **22.0%** |
| criminal | 5/83 = **6.0%** |
| hindi | 1/5 = 20.0% (n too small to read) |

**Criminal queries succeed at roughly a quarter the rate of civil ones — a
3.7x gap, and real** (checked as a rate over the full 288, not inferred from
failure counts alone, which would conflate a real gap with civil simply
having more queries). Two partial explanations found, neither closing the
case:

- Criminal failures carry a citation-shaped span more often than civil ones
  (46/78 = 59% vs 77/156 = 49%), and across the whole failure set, queries
  carrying a citation span skew toward `AUTHORITY_HELD_BUT_NOT_RETRIEVED`
  over `AUTHORITY_RETRIEVED_BUT_BADLY_RANKED` (83/123 = 67% vs 57/115 =
  50%). Consistent with, not proof of, criminal queries being harder to
  match because the embedded citation format doesn't align well with
  sparse/dense scoring against a *different* judgment's text.
- Not a query-shape artifact: the shape distribution (case_name/section/
  concept) is proportionally similar across both groups (see cross-tab
  below), so shape alone doesn't explain the gap.

**Flagged, not solved — this is exactly the kind of finding NEXT STEP 5's
experiment discipline exists for**, not something to patch from the
taxonomy pass itself.

**Two structural limits, named rather than worked around:**

1. **This benchmark cannot say anything about court or `hc_document_class`
   — 238/238 gold judgments are Supreme Court, 238/238 show
   `hc_document_class = NULL`.** Not a measurement gap; a construction fact.
   `build-queries.ts`'s `embedded` CTE requires `judgment_chunks.embedding
   IS NOT NULL`, and 0 High Court judgments are embedded (founder's
   data-before-embeddings sequencing, still binding). **Any HC/SC or
   substantive/procedural segmentation requires either HC embeddings
   (forbidden) or a non-embedding-gated gold-construction method** — this
   is the real content of NEXT STEP 2, not a nice-to-have, and it is
   currently blocked by the same gate that blocks embeddings themselves.
2. **The `case_name` query-shape count is not a trustworthy taxonomy axis
   here and is reported with that caveat rather than as a clean category.**
   132/238 failures classify as `case_name` shape, but this session already
   measured (Q1.25/Q1.30 work) that `CASE_NAME_RE` fires on 161/283 of this
   benchmark's queries as a **false positive** — the redacted reasoning
   passages this benchmark is built from routinely contain a stray "v" or
   "versus" token from an *unrelated* citation the passage discusses, not
   because the query IS a case-name lookup. Confirmed then: 0/161 of those
   false positives actually mis-pin. The 132 figure is presented as "spans
   matching the shape's regex," not "case-name-shaped failures."

**Secondary, real, smaller findings:**

- **BADLY_RANKED skews toward near-misses**: 64/98 (65%) rank 6–20, only
  14/98 (14%) rank 36–50. The correct authority is usually close to the
  cut, not buried — suggests a reranking-quality lever is more likely to
  pay off than a different retrieval mechanism entirely, feeding directly
  into NEXT STEP 5's candidate list.
- **Query length has no readable signal** — 202/238 failures fall in the
  700–900 char bucket, but that's `build-queries.ts`'s own WINDOW=700
  construction concentrating most surviving passages there; the shorter
  buckets have n=2–4, too few to compare against.
- **Neutral citation and reporter citation presence show zero variance**
  (100% yes on both, across all 238) — unsurprising and not a finding: every
  gold judgment is a well-documented Supreme Court authority by
  construction, so of course both citation fields are populated.

**Not yet done, carried to the next entry**: NEXT STEP 2 (benchmark
expansion, gated on the embeddings question above), NEXT STEP 3 (EVIDENCE_WRONG
retrieval-vs-paragraph split), NEXT STEP 5 (retrieval experiments, informed
by the near-miss rank finding above).

### Q1.43 · ZERO WRITES FOR 46+ MINUTES POST-RESTART — CONFIRMED, ROOT CAUSE INFERRED NOT PROVEN · 14 Aug 2026

**CONFIRMED via direct SQL, not inferred from logs**: `SELECT max(created_at)
FROM judgments` returned the exact pre-outage timestamp (16:43:13 Aug 13)
unchanged across two checks 10+ minutes apart, against `now()` reading
00:51+ Aug 14 — **zero judgments written since the post-reboot restart**,
despite all 21 workers alive, consuming real CPU, and "seen" counters
climbing (MP: 3,400+ in ~40 min).

**Root cause of `mapped=0`, not `written=0` in isolation**: read
`toJudgmentRecord` in `hc-load.ts:240-254` — a candidate is rejected before
ever reaching a write attempt if it has no `pdf_link`, no `title`, no
`decision_date`, an unparseable date, or empty extracted text.
`mapped=0` across THOUSANDS of "seen" candidates for MULTIPLE different
courts (MP, Karnataka, Orissa, Rajasthan all observed) simultaneously, all
on the SAME partition (`.../2026`), points to something structural about
that partition's data shape rather than per-document corruption —
real PDF fetch+parse IS happening (getHexString warnings visible, meaning
unpdf is actively processing bytes), so this is not simple 404s.

**Leading hypothesis, INFERRED not directly observed**: 2026 is the
current, still-forming year. `no_decision_date` is a strong candidate —
courts publish interim/procedural filings continuously through a case's
life, and a still-open 2026 case may genuinely lack a populated
`decision_date` in the source metadata until disposal, unlike a complete
historical year. Not confirmed by reading an actual 2026 metadata row
directly — three attempts at a live diagnostic (isolated single-document
dry-runs, a metadata-only row-count survey) all timed out, most likely
from S3 contention against 21 simultaneously-restarted workers all hitting
the newest-year-first partition at once (an artefact of the mass restart
tonight, not a normal steady-state pattern). Stopped after the third
inconclusive attempt per the project's own 3-cycle discipline rather than
keep guessing.

**Why this matters, and why it isn't (yet) an emergency**: the "newest
year first" sort order (`hc-load-cli.ts:190-203`, deliberate, cited
reasoning: recent law matters more, an interruption should leave the most
useful half) means EVERY worker restart pays this same 2026-scan tax
before reaching the well-populated 2016-2025 range — normally spread out
because workers restart at different times, but the mass reboot recovery
tonight synchronised all 21 onto the identical partition simultaneously.
**Not intervening further this cycle**: 2026 partitions are necessarily
smaller than a full year (~7.5 months in), so this should exhaust on its
own; killing and restarting again would just re-synchronise the same
contention. Watching for writes to resume as workers clear 2026 naturally.
**If writes are still zero next cycle, that upgrades this from "likely
self-resolving" to a real blocking bug** worth a proper root-cause pass
rather than more waiting.

**CORRECTION, same session, ~15 min later — the `no_decision_date` guess
above was wrong. Replaced by direct verification, not another guess:**

Read raw 2026 metadata rows directly (MP, `metadata-mobile.parquet`) — every
sampled row has a valid `title`, `decision_date`, and `pdf_link`, ruling out
every `SkipReason` except `no_text`/`pdf_missing`. Fetched 5 of the actual
PDFs those rows point to: **all 5 returned HTTP 404.** This is
`pdf_missing`, a well-understood, benign outcome class already documented
elsewhere in this file — mobile-variant metadata for the current,
still-forming year is published ahead of the PDFs actually being uploaded
to the bulk bucket. Not a code bug.

**The SCALE mismatch is the real finding.** MP's entire 2026
mobile-variant partition is exactly **3,477 rows** (measured via
`rowCount`, a cheap parquet-footer read) — matching its observed "seen"
count almost exactly, meaning the worker has nearly finished it. A 404 in
isolation returns in 38-282ms measured directly. At even a conservative
20 effective concurrent checks, 3,477 quick 404s should clear in well
under a minute. **Observed: ~40 minutes.** A 40-100x gap between expected
and actual, for a workload that is almost pure network round-trips with
no PDF parsing involved.

**This points directly back to the libuv-threadpool DNS bottleneck
researched earlier tonight** (bus 0269): `dns.lookup()` (which plain
`fetch()` uses) runs on a 4-thread pool with no caching, so no more than
4 NEW connections can resolve DNS at once regardless of app concurrency.
A wall of many quick sequential 404 checks against fresh URLs is exactly
the shape that would be dominated by this ceiling — each request needs
its own connection since a 404 response doesn't warrant keep-alive
reuse the way a large successful fetch might. **Reframes the
undici-Agent-tuning research already sent to LCC (0328) from "a
throughput nice-to-have" to the likely explanation for the fleet
producing zero writes for 46+ minutes against a workload that should be
nearly instant.**

**SECOND CORRECTION/EXTENSION, same session — the `pdf_missing` lag is NOT
confined to the current still-forming year (2026). It extends into a fully-
elapsed past year too, at least for this court.** Directly relevant to
NEW3's independently-found "2023-24 donut hole" (bus 0332).

DB check on `High Court of Madhya Pradesh` (court=23_23; earlier bus
messages tonight mislabelled this "Madras" from the `hc-load-r4-mp.log`
filename — MP is Madhya Pradesh, corrected here before it propagated
further) by `judgment_date` year: 2023 has 102,892 rows (near-complete),
2024 has 12,277, **2025 has only 184**, 2026 has 93. The live worker's log
showed `mapped=0` continuously through the ENTIRE 2025 partition (candidate
counts 3,677 → 26,821, ~23,000 candidates) before crossing into 2024.

Verified directly, not inferred: sampled 15 rows from row-offset 5,000 in
the `mphc_db_gwl` 2025 mobile-variant partition (23,344 rows total) — none
already held in the DB (checked by CNR), and **15/15 live PDF HEAD
requests returned 404.** Same `pdf_missing` class as 2026, not a code bug,
not `already_held` — genuinely missing source PDFs, sampled mid-file so
not an edge-of-file artefact.

**Implication**: for at least this court, the registrar's PDF-file
publication lags its metadata publication by more than one year — 2025
is a complete calendar year with almost no PDFs actually uploaded yet.
If this generalises to the other large courts NEW3 flagged, the
"2023-24 donut hole" may be substantially a **source-side publication
lag**, not a scheduling or ingestion gap — no amount of ingest scheduling
fixes a PDF that AWS Open Data doesn't have yet. Scope caveat: measured
on ONE court (MP), ONE bench-partition, N=15 sample — not yet checked
against any of the 14 courts NEW3 actually named. Reported to NEW3 (bus
0337) and folded into the DNS/undici priority note to LCC as it also
explains why fleet throughput on these partitions is fetch-bound (near-
constant 404 lookups) rather than write-bound.

A founder directive ("NEW2 — DATA PARITY + INGESTION RELIABILITY EXECUTION")
restated the project's standing rule — checkpoint by keyset, never OFFSET —
against `hc-load-cli.ts`'s own lever-3 checkpoint (Q1.36), which resumes via a
raw file-position offset. Flagged the conflict rather than silently keeping
either side: the checkpoint's source is a single immutable parquet object
published once by AWS Open Data (`hc-metadata.ts`'s own header), not a
mutable database table, so row N always names the identical record on every
read — the correctness risk the keyset rule exists to prevent (a concurrent
insert/delete shifting what "row N" means between two reads) does not apply
here.

**Founder confirmed the distinction and set the explicit exception, now
recorded in `hc-load-cli.ts` and here:**

- **Database tables: keyset pagination only, never OFFSET.** Unchanged,
  binding everywhere else.
- **Immutable parquet/snapshot files: deterministic file-position
  checkpointing is permitted**, but ONLY when (a) the checkpoint identifies
  the exact file/object (already true — keyed on `file.key`, the literal S3
  path), (b) the file's size at checkpoint-write time is verified to match
  its current size before the offset is trusted, (c) the offset is confirmed
  within the file's current bounds, and (d) any mismatch on (b) or (c)
  refuses the resume and falls back to offset 0 for that one file rather
  than risking a skipped or duplicated record.

**Implemented, not just documented.** `Checkpoint` is now
`Record<string, {offset, size}>`, not a bare offset. A new
`verifiedResumeOffset()` performs all three checks before any stored offset
is trusted. Verified live: (1) fresh run against sikkim writes `{offset,
size}` correctly; (2) a second run resumes from the stored offset (0
documents re-scanned in the already-completed partition); (3) a
size-corrupted checkpoint entry is refused — the run fell back to a full
re-scan rather than trusting the tampered offset, matching the
timing signature of a from-scratch run rather than a resumed one. tsc
clean, 39 existing tests still green. Cleaned up all test checkpoint files
and scratch scripts afterward.

### Q1.43b · FOUR COURTS HAD NO WORKER RUNNING SINCE THE REBOOT — FOUND AND FIXED · 14 Aug 2026

**Not a crash, an omission.** Cross-checked the live process list against
`docs/HC_METADATA_SURVEY.json`'s 25-court manifest (ground truth, not
memory or a guessed court-code list) rather than assuming the fleet
matched scope. 20 courts + the general sweep were alive; Manipur
correctly absent (verified earlier this session — 20,894/20,895
candidates already held, a legitimately finished run, not a gap). But
**Bombay (27_1), Patna (10_8), Sikkim (11_24), and Meghalaya (17_21) had
no `hc-load-r4-*` log file at all** — never included in tonight's post-
reboot restart wave. Confirmed via the exact launched command line of a
running worker (`--court <CODE> --from-year 2016 --batch 200
--concurrency 32 --apply`), replicated for all four, verified each came
up clean (no crash-loop, real metadata-file counts: Bombay 119 files,
the other three 11 each) and the fleet now shows all 24 applicable
courts + sweep at the expected process count, no duplicates.

**Why this matters beyond raw coverage**: Bombay and Patna are both
named in NEW3's independently-found "2023-24 donut hole" (bus 0332). A
court with zero workers running makes zero progress on every year, not
just the recent ones — for those two specifically this may be a simpler,
complete explanation than either the restart/DNS hypothesis (Q1.43a) or
the source-side PDF-publication-lag finding (below), separate from
whatever's true for the other 12 courts NEW3 named. Flagged to NEW3 (bus
0342) to re-check once these two have had a few hours running. Reported
to LCC as a `--downstream` tranche (bus 0341).

### Q1.44 · NEXT STEP 2 BLOCKED (named, not silently skipped); NEXT STEP 3 — EVIDENCE_WRONG is NOT the coverage gap it looked like · 13 Aug 2026

**NEXT STEP 2 (benchmark expansion by court/`hc_document_class`): blocked,
same wall Q1.43 already named.** `build-queries.ts`'s `embedded` CTE requires
`judgment_chunks.embedding IS NOT NULL`; 0 High Court judgments are embedded
by founder decision, so no HC-derived gold query can exist today without
either starting HC embeddings (explicitly forbidden) or a fundamentally
different, non-embedding-gated gold-construction method that does not yet
exist. Not invented around. Recorded as blocked rather than silently
dropped from the queue.

**NEXT STEP 3 — measured, and it overturns the working assumption.** Earlier
framing (Q1.29, carried into this directive) was *"EVIDENCE_WRONG is
strongly related to incomplete paragraph coverage."* Checked directly
against the 130 EVIDENCE_WRONG gold judgments rather than re-asserted:

| | count | |
| --- | --- | --- |
| no `judgment_paragraphs` row at all | **0** | not a raw coverage gap |
| has paragraphs, but none carry a `paragraph_number` | 10 | text without a citable anchor |
| has paragraphs WITH a numbered paragraph | **120** | should be fillable today |
| also has a `judgment_chunks` row | **130 / 130** | every one — see below |

**Zero of the 130 lack paragraph data entirely.** The "coverage gap" framing
does not hold for this specific population, checked now.

**What `operativeParagraph` actually depends on, read directly from
`retrieve.ts` rather than assumed**: it is populated from
`denseResult.bestChunk`, which is built only from the dense ANN candidate
set (`judgment_chunks ORDER BY embedding <=> $vector LIMIT annDepth`, top
~200) — **not** from "does this judgment have a chunk at all." A judgment
can hold a `judgment_chunks` row and still show empty `operativeParagraph`
if that specific chunk didn't rank inside the query's own top-200 nearest
neighbours. All 130 EVIDENCE_WRONG judgments carry a chunk row, so this is
the live mechanism, not a hypothesis.

**One live spot-check, not a batch (the shared proxy is under heavy 5x-push
load right now; a single query took 66-120s+)**: re-ran `hybridSearch` for
`criminal-c1d880a2`, one of the 130. Result: `operativeParagraph` **now
comes back FILLED** (Q1.32's `fillParagraphFallback` firing correctly), but
`operativeParagraphNumber` is **still null** — the specific paragraph
`ts_rank` selected as the best match doesn't itself carry a court-printed
number, even though the judgment has other numbered paragraphs. **A real,
legitimate partial-evidence state** (text without a citable pinpoint), not a
bug and not the same thing as "no paragraph at all."

**The likely explanation for most of the 130, stated as inference not
fact**: `failure:classify`'s five attempts spanned several hours of
wall-clock time while `judgment_paragraphs` was climbing at ~773k
rows/hour (LCC, bus 0193/0247). A judgment scored as EVIDENCE_WRONG early
in that window may simply have gained its paragraph rows before the run
finished — the same "measuring growth, not the change" confound this
session has hit repeatedly. Re-classifying the 130 would settle this, and
is queued rather than run now (adds DB load; the answer is already
directionally clear from the one live check plus the paragraph-coverage
numbers above).

**Sent to LCC** (paragraph-coverage/citable-anchor finding, their
territory per the explicit "do not solve this by changing retrieval"
instruction) and to the ring.

### Q1.45 · NEXT STEP 5, ONE CANDIDATE SCOPED — residual-citation-span stripping in sparse ranking · 13 Aug 2026 · NOT IMPLEMENTED

**Deterministic/lexical, per the directive's own ordering** (evaluate these
before any model-architecture change). Scoped from Q1.43's own strongest
secondary finding, not invented fresh: queries carrying a citation-shaped
span skew toward `AUTHORITY_HELD_BUT_NOT_RETRIEVED` over `BADLY_RANKED`
(83/123 = 67% vs 57/115 = 50%).

**The naive read of that finding is wrong, and re-reading `build-queries.ts`
caught it before any code was written.** The benchmark's own redaction step
removes the GOLD judgment's `citation_text`, `neutral_citation` and
`reporter_citations` from every query. So a citation-shaped span still
present in a query is **never** the answer — it is always a *different,
incidental* citation the reasoning passage happens to mention while
discussing the real authority. This is `Q1.35`'s "sample of what a filter
excludes" mistake, one level down: the correlation is real, but the cause
cannot be "the ranker fails to boost the right citation," because the right
one was deliberately stripped.

**Revised hypothesis, falsifiable and cheap to test**: a residual citation
span is **noise, not signal**, for this query population. `full_text_tsv`
is `to_tsvector('english', full_text)` — one unweighted vector already
named as the term-frequency problem behind Q1.25's whole existence, and a
citation's digits/reporter abbreviations (`2019`, `4`, `SCC`, `221`) tokenize
as ordinary lexemes, diluting `ts_rank`'s weight away from the legally
meaningful vocabulary the true match actually shares with the query,
without ever pointing toward the gold judgment (which carries no matching
citation left to find). This reframes it as NEXT STEP 5's **query
normalization** candidate, not a new "citation-field weighting" mechanism —
there is no citation field to weight toward here.

**Scoped, not built:**

1. A pure query-side transform: strip spans matching the same
   `CITATION_SHAPES` patterns `build-queries.ts` already uses for its own
   residual-citation check, before constructing the sparse `tsquery`. Never
   touches `full_text_tsv`, `judgment_chunks`, or the dense arm — additive
   and reversible, same risk class as Q1.25.
2. **Measurement plan, fixed before implementation**, per this lane's own
   standing rule:
   - Baseline: `AUTHORITY_HELD_BUT_NOT_RETRIEVED` / `AUTHORITY_RETRIEVED_
     BUT_BADLY_RANKED` rates on exactly the 123 citation-span-carrying
     queries from Q1.43's checkpoint (already have the query IDs).
   - Candidate: same 123 queries, sparse arm only (isolate the mechanism
     before touching hybrid), citation spans stripped pre-query.
   - **Regression check, mandatory**: the 115 NO-citation-span queries run
     unchanged through both passes as the negative control — a real
     improvement moves the 123 and leaves the 115 flat; a query-shape
     artifact would move both or neither.
   - Reject if the 115-query control group regresses at all, per the
     directive's explicit instruction not to trade one query type for
     another.
3. **Not run this session** — the corpus is mid-recovery from the 7.3-hour
   machine outage (LCC, bus 0318) and every added query competes with
   ingest/enrichment catch-up for the same proxy. Queued as the next
   concrete action once the ring's DB load settles.

**RUN, MEASURED, NOT SHIPPED — closed 13 Aug 2026.** Built
`citation-strip.ts` (17 tests, 8 adversarial — Section/Article/BNS-number/
bare-year/versus-with-no-citation/paragraph/page/judge-count references all
survive unstripped, every genuine citation form strips cleanly including a
repeated occurrence) and `experiment-citation-strip-cli.ts` (baseline vs
candidate, both `mode: 'sparse'` so the haystack is identical by
construction, negative control derived from the same run rather than a
separate pass). Full 288, checkpointed across a benign "unsettled
top-level await" restart (real pattern this session, not a new one — 72
then 216 completed cleanly across two invocations, zero real crashes).

| | ALL 288 | CHANGED (n=141) | CONTROL (n=147) |
| --- | --- | --- | --- |
| success@5 base | 9.7% | 7.8% | 11.6% |
| success@5 candidate | 10.4% | 9.2% | 11.6% |
| recall@20, both | 16.7% | 15.6% | 17.7% |
| discordant (+/-) | +2/-0 | +2/-0 | +0/-0 |

**Negative control held exactly** — 0 of 147 unchanged queries moved on any
metric. The experiment mechanism is sound; this is not a confound or a
measurement bug.

**The effect itself does not clear the bar. `mcnemarExactP(2, 0) = 0.500`**
— computed with this lane's own existing machinery (`stats.ts`), not
eyeballed. Two discordant pairs, both favouring the candidate, is the exact
shape of two coin flips landing the same way; `queriesToSettle(2, 0, 141)`
= **271** — nearly double the entire changed population, and `= 554` against
the full 288. This benchmark cannot settle this question at its current
size, and cannot grow past 288 SC-only queries without the same HC-
embeddings gate that already blocks NEXT STEP 2.

**A second, independent reason not to ship even if the count had been
larger**: `recall@20` is flat — 16.7%→16.7% overall, 15.6%→15.6% on the
changed subset. Stripping never pulled a NEW judgment into the top-20; at
most it could ever re-order within a set already retrieved. **The
mechanism, even at its most generous, can only touch `BADLY_RANKED`
(34.0%) — it was never going to move `HELD_NOT_RETRIEVED` (48.6%), the
larger of the two failure populations**, which is itself a finding worth
keeping: a citation-noise hypothesis explains at most the smaller half of
the problem, by construction, not by this measurement's limits.

**Decision, per the directive's own step 7: NOT IMPLEMENTED in
`retrieve.ts`.** `citation-strip.ts` stays in the harness as a tested,
reusable utility should a larger benchmark ever make the question
answerable — nothing is deleted, nothing ships. This is the standing rule
against tuning ranking without a settled measurement applying to itself:
an underpowered positive result is not a result to act on, however
tempting the arrow's direction. Both harness tools and this measurement
reported to the ring; `HELD_NOT_RETRIEVED` remains the next cause to
identify a mechanism for, not this one.

### Q1.43 · STATUTE MAPPING: measured, and it CANNOT be populated from what we hold · 13 Aug 2026

Founder asked for the BNS/BNSS/BSA ↔ IPC/CrPC/Evidence mapping to be measured
before anything is built. **Measured. Nothing can be built yet, and the reason is
specific.**

**We hold all three NEW Acts, in full:**

    The Bharatiya Nagarik Suraksha Sanhita, 2023   531 sections
    The Bharatiya Nyaya Sanhita, 2023              358 sections
    The Bharatiya Sakshya Adhiniyam, 2023          170 sections

**We hold none of the three OLD ones:**

    Indian Penal Code, 1860          0 matches
    Code of Criminal Procedure, 1973 0 matches   (only the 2022 Identification Act)
    Indian Evidence Act, 1872        0 matches

**This is not a general gap in old statutes** — the corpus holds the Societies
Registration Act 1860, the Indian Contract Act 1872 and others of the same
vintage. The three repealed criminal codes are *specifically* absent, which is
consistent with indiacode.nic.in dropping repealed Acts.

**A mapping needs both sides. We have one.** `statute_mappings` (0 rows:
`old_act, old_section, new_act, new_section, relationship, note`) cannot be
deterministically populated from anything currently held.

#### What forbids the shortcut, in our own files

`DOMAIN_TRUTH.md` is explicit and predates this measurement:

> *"The mapping lives in `statute_mappings`, seeded from indiacode.nic.in. Never
> hardcode a mapping in application code. **Never let a model generate one.**"*
> *"Mappings are not always 1:1. Some sections split, some merge. Where the
> mapping is not clean, say so rather than picking one."*

So DeepSeek is **explicitly excluded** here, unlike classification. This is the
one enrichment task in this lane where a model is forbidden by name rather than
by judgement — and the split/merge point means even a correct-looking 1:1 table
would be wrong.

#### The ask, and it is NEW3's

**Either** the three repealed Acts' section lists, **or** India Code's own
published correspondence table. Both are acquisition, not enrichment. Until one
arrives, `statute_mappings` stays empty — an empty table is honest, and a
generated one would be the highest-consequence fabrication this product could
ship, because `DOMAIN_TRUTH.md` calls this *"our largest factual edge and our
largest hallucination risk."*

### Q1.46 · HYBRID-VS-DENSE, FULL SCALE — launched, not yet closed · 14 Aug 2026

**Next largest failure cluster, picked per the standing directive**: `HELD_NOT_
RETRIEVED` is 48.6% of the 288-query benchmark (vs `BADLY_RANKED` 34.0%), and
Q1.45 (citation-span stripping) is closed NOT SHIPPED — its own mechanism could
only ever touch `BADLY_RANKED`, never this larger population, by construction
(recall@20 was flat). So this session's next action is not a new mechanism
invented fresh, but the flagged-and-unresolved thread that already speaks to
`HELD_NOT_RETRIEVED` directly: Q1.30's `arms-cli.ts` CONTROLLED sub-sample
(n=100) found production `hybrid` recall@20 **below** `dense`-only (30.0% vs
34.0%) — directionally suspicious since hybrid can only ever be as good as the
better of its two inputs unless the fusion itself is discarding candidates —
but underpowered (McNemar p=0.2266, ~324 queries to settle) and explicitly
recorded "**Not acted on** — this lane does not tune RRF or fusion weights from
one controlled-but-underpowered run."

**Launched**: `arms-cli.ts`, `ARMS_PASS=controlled` (courts=sc, holds the
haystack constant — the confound Q1.30 already controlled for), full 283
queries, all three arms (sparse/dense/hybrid), so `hybrid vs dense` gets full
McNemar power available from this benchmark (283 is short of the ~324 estimate
but close, and a real direction should sharpen well before then). PID 29264,
started 05:53 local, detached via `Start-Process` on `node` directly (LCC's
0274 pattern — a job backgrounded from the agent's own shell dies with the
turn), logging to `services/harness/arms-controlled-full.log`/`.err`. Smoke-
tested first at `ARMS_LIMIT=6` (62s for the sparse arm alone at the current
1,488,010-judgment corpus — corpus has roughly tripled since Q1.30's original
100-query run, so multi-hour wall time is expected, not a regression). Bus
0351–0354 notified all lanes before launch, so nobody else starts a competing
heavy pass against the same shared DB proxy meanwhile. Monitor armed on the
log/PID for completion.

**Live bug found and fixed on the way**: `scripts/lane-send.mjs` line 96 used
`/[^A-Za-z]/g` on the file-binding fallback — the exact digit-stripping
regression Q1.37 (13 Aug) fixed in `lane-common.sh`, still present in this
separate Node port, unnoticed because `lane-status.mjs` (line 59) already has
the correct `/[^A-Za-z0-9]/g` and nobody had compared the two. `NEW1`'s own
binding file read back as `NEW`, matching no lane, so this session's first
send attempt failed with "no lane" despite the binding file being correct on
disk — bitten by the identical class of bug Q1.37 named, in code that bug's
own fix did not reach because it lives in a different implementation of the
same rule. Fixed to match `lane-status.mjs`. Only bites lanes with a digit in
their name (NEW1/NEW2/NEW3) binding via the file rather than an inline
`export LAWMIND_LANE=` in the same shell call, which is presumably why prior
NEW1 sessions never hit it. **DONE 14 Aug 2026 (LCC)**: added case 10 to `lane-bus.test.sh` (now 15) —
asserts `lane-send.mjs`'s own strip-regex (a separate implementation from
`lane-common.sh`, not a caller of it, which is why Q1.37's fix never reached
it) stays byte-identical to `lane-status.mjs`'s. Couldn't black-box test
`lane-send.mjs` via subprocess like the other 9 cases: it hardcodes its own
`.agents/bus` path with no `CLAUDE_PROJECT_DIR`-style override, so a
subprocess test would either write into the real bus or need a behavior
change out of scope for adding a test. A regex-agreement guard targets the
actual failure mode instead — two independent implementations of the same
rule silently diverging — and would have caught this exact bug being
introduced. Verified the guard is real, not vacuous: reverted the regex,
confirmed the new case goes red (`14 passed, 1 failed`), restored, confirmed
green (`15 passed, 0 failed`). Both files left uncommitted per this lane's
standing rule (commit only when asked).

**Not yet closed** — full run still in flight. Next entry reports the result:
either dense-only genuinely outrecalls hybrid at the scale this benchmark can
support (an actionable RRF/fusion-weight finding, still not this lane's to
tune per its own standing rule — reports to LCC), or the effect fails to
survive more data (closes the thread, matches Q1.45's discipline of not
shipping an underpowered positive).

**Run 1 died, root cause found, gap closed, relaunched · 14 Aug 2026.** PID
29264 hit the exact "unsettled top-level await" shutdown quirk Q1.31 and
Q1.45 both named — but unlike those, `arms-cli.ts` had no checkpoint,
confirmed in its own source before this session ever wrote it (`"this loop
has no checkpoint and paired McNemar needs every arm on the identical query
set"`). Died at dense 260/283 (sparse had already completed: success@5
10.2%, recall@20 17.0%). No completion summary, no paired McNemar table —
**3417s of sparse plus 1903s of dense lost outright**, unlike every other
long-running tool in this harness (`experiment-citation-strip-cli.ts`,
`failure-classifier-cli.ts`), which already checkpoint for this exact
failure mode.

**Closed the gap rather than blind-retry**: added a per-row JSONL checkpoint
to `arms-cli.ts` (`arms-checkpoint.jsonl`, keyed `pass:mode:index`, same
append-and-resume idiom as `experiment-citation-strip-cli.ts`) so a second
occurrence of this known-benign crash resumes instead of re-running ~90
minutes blind. Typecheck clean, harness suite 140/140 both before and after.
Relaunched — PID 9028, `arms-controlled-full-run2.log` — starting sparse and
dense from zero again since run 1 left nothing to resume from (the
checkpoint protects future crashes, not this one retroactively). Bus
0396-0399 notified.

**Run 2 died the identical way — checkpoint verified working in practice, not
just in theory · 14 Aug 2026.** Same "unsettled top-level await" quirk, PID
9028, this time at dense 240/283 (sparse had again fully completed,
byte-identical numbers to run 1: success@5 10.2%, recall@20 17.0% — a useful
determinism check as a side effect). Checked `arms-checkpoint.jsonl` before
relaunching rather than assuming the fix worked: 524 rows on disk
(`CONTROLLED:sparse` 283, `CONTROLLED:dense` 241), matching the log exactly.
Relaunched — PID 13272, `arms-controlled-full-run3.log` — startup line reads
`524 rows already checkpointed`, confirming resume in practice. This is the
second occurrence of the same crash on this one experiment; per this lane's
own 3-failed-cycles rule the 15-min tracking cron is now instructed NOT to
auto-relaunch a third time on its own — a third occurrence gets reported and
held for a decision rather than blindly retried again, even though the
checkpoint makes each individual retry cheap.

**Q1.46 CLOSED — full result, and the question stays open · 14 Aug 2026.**
Run 3 (PID 13272) completed clean: empty stderr, full summary printed, no
third crash.

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| sparse | 10.2% | 17.0% | 0.070 | 0.073 | 0.093 |
| dense | 21.6% | 40.6% | 0.151 | 0.152 | 0.207 |
| hybrid | 18.4% | 38.9% | 0.121 | 0.121 | 0.180 |

Paired (McNemar, success@5, CONTROLLED, full 283):

| pair | gained/lost | p | queries to settle |
| --- | --- | --- | --- |
| dense vs sparse | +42 / −10 | 0.0000 | ~99 |
| hybrid vs sparse | +24 / −1 | 0.0000 | ~71 |
| hybrid vs dense | +17 / −26 | 0.2221 | ~1164 |

**Dense and hybrid both decisively beat sparse — not news, but now proven at
full power rather than assumed.** The actual question this experiment
existed to answer — does production `hybrid` genuinely underrecall
`dense`-only, the thread Q1.30 flagged and left "not acted on" — **remains
unsettled, and the effect got weaker with more data, not stronger.** Q1.30's
n=100 controlled sub-sample: hybrid vs dense discordant pairs were 8:3
favoring dense (2.67:1). This run's n=283: 26:17 favoring dense (1.53:1).
Same direction, smaller ratio, `queriesToSettle` grew from ~324 to ~1164 —
nearly 4x this benchmark's current size. **A larger, more careful measurement
made the suspicion look less true, not more** — the opposite of what
"underpowered positive that needed more data" usually looks like, and worth
recording precisely for that reason: this is not a case of "still not proven,
give it more queries" so much as "the point estimate itself moved toward
parity as n grew."

**Decision, per this lane's own standing rule stated at launch: NOT acted
on.** RRF/fusion-weight tuning stays out of scope for this lane regardless
of the result; the finding reports to LCC as a measurement, not a change
request. `HELD_NOT_RETRIEVED` (48.6%) — the reason this experiment was
picked in the first place — is **not explained by a hybrid-vs-dense fusion
defect**: recall@20 gap between hybrid (38.9%) and dense (40.6%) is 1.7
points, nowhere near large enough to be "half the retrieval failures are a
fusion bug." The 48.6% has to have a different, larger cause than this
thread — this closes it as a lead, not as a fix.

**Side effects that outlast this result**: `arms-cli.ts` now checkpoints
(`arms-checkpoint.jsonl`, kept on disk as a reusable artifact per this
harness's existing convention, not deleted), verified working through two
real crash-and-resume cycles, not just in theory. `scripts/lane-send.mjs`'s
digit-stripping regression is fixed and now covered by
`lane-bus.test.sh`. Both fixes apply to every future long-running harness
tool and every future NEW1/NEW2/NEW3 session, independent of this
experiment's own null-ish result.

Bus report follows this entry.

### Q1.47 · NEW2 · THE FLEET WAS FINE; THE **SCHEDULING** HAD MADE 4.76M DOCUMENTS UNREACHABLE · 14 Aug 2026

**Continuation session. Nothing was reset, no checkpoint discarded, no worker
relaunched blindly.** State recovered from disk and the database, per the
directive: 19 harvest workers + 4 paragraph shards + 1 general sweep adopted
alive, matched to their courts by command line, checkpoint mtime and DB row
growth together — never process existence alone.

**Corpus measured directly, not carried over from the previous chat:**
`judgments 4,762,373 · judgment_paragraphs 22,670,426 · judgment_chunks 620,300`
at 17:31Z, with **172,095 judgments written in the preceding hour** (~5x the
34,000/hour recorded in `LANE_PROTOCOL.md` §6). Coverage against the founder's
20,567,554 denominator: **23.15%**, up from 11.55% the previous day.

#### The finding: every worker was `--from-year 2016`, and nothing else existed

Per-court, per-era measurement (`judgment_date < 2016-01-01`):

| | |
| --- | --- |
| pre-2016 held, ALL 25 High Courts | **11,876** |
| pre-2016 available in the source | ~4,757,636 (`allYears` − `last10Years`) |
| coverage of the historical corpus | **0.25%** |

**23 of 25 High Courts held FEWER THAN 1,000 pre-2016 documents each**; Andhra,
Madhya Pradesh and Karnataka held exactly **zero**. This was not a crash, a
source gap or an attrition problem — it is the scheduling choice itself, which
was bounded on one side only, and it would never have surfaced from the
headline coverage number because that number rises the whole time.

**A correction owed to `COVERAGE_GAP_MATRIX.md` §3**, which read
`min(judgment_date)` as coverage depth and concluded "most courts' holdings DO
span back to the 1950s-1980s". They do not. **Madras' earliest holding is 1953
and it holds exactly ONE pre-2016 document**; Calcutta reaches 1950 on 74 rows.
`min()` proves a year is *reachable*, never that it is *held* — one row makes a
court look like it spans seventy years. Corrected in that file.

**Fixed by adding `--to-year`** (`hc-load-cli.ts`), the historical complement of
the running fleet's window. Additive: no `--to-year` leaves every existing
invocation byte-identical, and the checkpoint suffix `-to<TO_YEAR>` is appended
rather than folded in, because 22 workers were live against `<COURT>.json` and
`saveCheckpoint` rewrites the whole file. Six historical workers launched
(Bombay 893k, Patna 638k, P&H 600k, Telangana 517k, Himachal 99k, Uttarakhand
98k pre-2016 source documents). **~38,000 pre-2016 documents written in the
first 20 minutes** — a ~5x increase in the High Courts' entire historical
holding.

#### Every "missing" worker was a COMPLETED one — verified before restarting

The directive's warning held exactly. Seven courts had no worker and all seven
had finished their 2016+ window: J&K 99.99%, Himachal 99.99%, Uttarakhand
99.998%, Sikkim 100%, Meghalaya 100%, Tripura 99.996%, Manipur 89.7%
(previously verified as candidate-exhausted). **Uttarakhand's headline 58.6%
was entirely its pre-2016 gap** — restarting its from-2016 worker would have
achieved nothing. Only two genuinely needed relaunching: Kerala (44.8% of its
window, worker exited early) and Gujarat (checkpoint frozen 2h52m AND zero
writes in an hour — both signals sustained, the `LANE_PROTOCOL.md` kill
criterion). Survivors counted after: exactly one worker per court+scope, no
duplicates.

#### A dry run was poisoning the checkpoint — found by doing it

Verifying `--to-year` with a `--limit 5` DRY run on Sikkim left
`11_24-to2015.json` on disk recording four files as partly done. **Nothing had
been written**, so a later `--apply` would have skipped those records
permanently. The reason this is worse than it looks is the checkpoint's own
stated justification: it is "purely a speed optimisation" *because* `source_url`
uniqueness is the real safety net — a premise that only holds when the skipped
batches were actually inserted. `saveCheckpoint` now returns early unless
`--apply`; the poisoned file was deleted.

### Q1.48 · NEW2 · DETERMINISTIC FIRST: 773,096 ROWS CLASSIFIED FOR FREE, THEN THE MODEL MEASURED AND **REFUSED PROMOTION** · 14 Aug 2026

Founder direction: deterministic ingestion stays primary; DeepSeek only for what
deterministic processing cannot classify confidently; every model output
source-span verified.

#### The vocabulary was never measured, and most of the "hard" subset was not hard

`SELECT upper(trim(disposal_nature)), count(*) … GROUP BY 1` — **487 distinct
values across 4,398,309 rows**, exactly the `LANE_PROTOCOL.md` §3b discipline
(*extract the real vocabulary before matching a convention*). Reading it showed
the 593,786 `unclassified_disposal` rows were mostly not ambiguous, merely
unlisted:

    DISMISSED AS WITHDRAWN   71,226     DISMISSED AS INFRUCTUOUS  65,392
    27-WITHDRAWN @ ADM.STAGE 40,254     TRANSFER TO OTHER COURT   18,775
    DISMISED (sic)            8,621     DISPOSED IN LOK ADALAT     8,735

**`DISMISED` — one S — is 8,621 rows** that `/^DISMISSED$/` could never match: a
five-figure row count lost to a registry typo. The Gujarat/Bombay stage codes
(`26-DISMISSED @ ADM.STAGE`) defeated every anchored pattern over a leading
`26-`; stripped rather than enumerated, since a list of registry numbers goes
stale the first time a court adds one.

**Result, measured old-vs-new over all 487 values: 43.4% → 61.0% of rows
carrying a disposal, +773,096 rows, zero model calls.** Validated by reading the
output per class, not by counts alone. All 13 pre-existing tests stay green,
including the one asserting `DISPOSED` remains unclassified.

Transfers and Lok Adalat settlements fold into `procedural_disposal` rather than
new classes — they are disposals in which the court decided no merits, and new
enum values would break the `hc_document_class` segmentation LCC and NEW1 read.

#### What the model was then allowed to see, and what it did

`hc-adjudicate.ts` + `hc-adjudicate-cli.ts`, 18 tests. The gate is a **refusal
test, not a selection test**: a row qualifies only because `classifyHcDocument`
recorded that it declined to claim it. **The 3.6M rows with `hc_class_method IS
NULL` are explicitly excluded** — those never had the classifier run, which is a
backfill, not a hard case, and sending them to a model would pay tokens for what
a regex answers exactly. Scope stated up front per `RING_PROGRAM.md` §2b: the
residue is ~1.72M rows (`DISPOSED OFF` 687,076 · `DISPOSED OF` 497,294 ·
`DISPOSED` 227,304 · `CLOSED` 54,241 · `ORDERED` 34,422) and **this pass will
never cover it** — it is a bounded, prioritised sample on a capacity-limited
free tier.

**Measured on 40 real documents, representative (uuid v4 ordering is random with
respect to court and year):**

| verdict | n | share |
| --- | --- | --- |
| span verified | 31 | 77.5% |
| **quoted words the document does NOT contain** | **7** | **17.5%** |
| checker's own false negative | 1 | 2.5% |
| cannot_determine | 1 | 2.5% |

**Six of the seven fabrications carried the model's own `high` confidence.**
That is worse than the 10.8% `docs/ai/CITATION_CONCORDANCE_EVALUATION.md`
measured, and it lands on the same verdict: **not promotable to canonical.** The
span check caught every one of them, which is the mechanism working, not a
reason to trust the output.

**The 8 refusals were triaged against the real documents rather than assumed to
be fabrication** — 7 genuine, 1 this checker's own fault (the model quoted
`AllPetitionsaredisposedofintheseterms.` — the words are in the document, the
spaces are not, PDF extraction having lost them). Over-refusal is not the safe
direction: it discards correct answers while looking like diligence. A
whitespace-stripped second comparison now passes it, and re-checking confirmed
all 7 genuine fabrications still fail that looser form too.

**Standing conclusion: usable as a candidate generator with mandatory span
verification, never as an autonomous classifier.** A verified span proves the
model READ the document — never that it reasoned correctly. The CLI writes
JSONL and no canonical row; the candidate table is not requested until a larger
sample confirms the rate.

#### NEXT, in order

1. **`hc:classify` full re-walk is bandwidth-bound, ~400 rows/min** against the
   shared proxy while 32 workers run — 3.6M rows would take ~150 hours. The fix
   is to push `length()`, the pointer pattern and the bail pattern into SQL and
   return booleans instead of `full_text` (~50x less transfer). **Not started:
   it duplicates each regex in Postgres, and two copies of a matching rule
   drifting apart is a documented failure in this repo.** Needs the pure module
   to take precomputed signals so there is still one rule set.
2. Extend historical workers to the remaining 11 courts as RAM allows (5.9 GB
   free at 32 workers).
3. Larger adjudication sample (n≥200) before deciding whether the candidate
   table is worth asking LCC for.

---

## NEW3 · 14 Aug 2026 — the ECT is in hand, tribunals publish their own orders, and 14,374 SCR edges are ours already

Four results, in descending order of value per unit of cost. Full detail:
`docs/SOURCE_REGISTRY.md` §5a-FETCHED and §2b,
`docs/MISSING_AUTHORITY_QUEUE.md` §1d/§1e/§1f.

### 1 · The Equivalent Citation Table — fetched, parsed, measured, validated

The concordance this ring has pointed at since 12 Aug. **235,807 citation
pairs** parsed from four official Supreme Court Judges Library volumes.

    live unresolved population        231,546 distinct / 598,766 edges
    resolvable to a judgment WE HOLD   21,340 distinct / 204,684 edges  (34.2%)

AIR 63.1%, SCC 52.4%, SCALE 49.3% of each reporter's unresolved edges.
Validated at **99.42%** against `judgment_citation_aliases` (3,807
comparable, 22 disagreements, all transcription slips in the table).

**Two sessions had failed to fetch it because `main.sci.gov.in` is NXDOMAIN,
not bot-defended.** `www.sci.gov.in` answers 200 to a plain `curl`. The
content survives only in the Internet Archive — the Court still publishes the
ECT on its live Judges Library page, and its own links have been dead since
the site migration. Covers 1950 **to 12.03.2018 only**, not "to present" as
this repo's docs said.

**Licence NOT cleared** (Government work) → `FOUNDER_QUEUE.md`. Loader is
LCC's. Nothing committed to the tree.

### 2 · 14,374 unresolved SCR citations exactly match judgments we hold

**Cheaper than the ECT — no external source, no licence, no decision.** Of
26,270 distinct unresolved SCR citations, **18,581 (71%) point at judgments
already held**: 14,374 by exact `normaliseCitation()` string equality, 4,207
by volume-agnostic match. Verified with concrete pairs.

**All 500 sampled matched-but-unresolved edges are from the 6 Aug batch**,
while the resolver has written resolved edges continuously through today.
Not a backlog. Either the resolver never revisits old rows or its match rule
differs from exact equality — **LCC's to determine**; sent on the bus.

### 3 · Tribunals publish their own orders — a category we hold ZERO of

The ring assumed the only route was the paid Supreme Today account. **Supreme
Today is an aggregator; the tribunals are the publishers.** 14 domains
probed, **two verified end-to-end by downloading a real judgment PDF**:

- **NCLAT** — order PDF, 56,049 bytes (three-step CSRF handshake).
- **TDSAT** — reasoned judgment, 304,798 bytes (date-range search).

Free, no account, no CAPTCHA, no access control bypassed. **NCLT, CESTAT,
ITAT and NGT are CAPTCHA-gated and stay closed** — the eCourts bypass grant
is eCourts-specific and does not extend to tribunal sites.

**NOT authorized** (neither host is §6a-named) → `FOUNDER_QUEUE.md`. Fetching
is NEW2's once cleared. Volume and historical depth **UNKNOWN**.

### 4 · The JT extractor gap is real and NOT worth fixing — a correction

`citations.ts` has no JT pattern and `judgment_citations` holds zero JT rows.
I flagged it to LCC and NEW1 as a probable bug. **Measured: 1 occurrence in
1,632 sampled judgments (0.06%).** Corrected on the bus. I had reasoned from
the ECT's 89,372 JT atoms — evidence about the reporting literature, not
about what our courts cite.

### DeepSeek support, per the founder's 14 Aug instruction

`.agents/new3/ds-research.ts` — analytical assistant only, never source
truth. Closed task list (no free-text task, so it cannot be asked whether a
source exists), JSON-shaped output stamped `UNVERIFIED_MODEL_OUTPUT`,
SHA-256 cache, and every call logged to `.agents/new3/ds-calls.jsonl`.
Refuses loudly with no key rather than falling back to recall.
`.agents/new3/README.md`.

**Honest assessment of its value so far:** one `gaps` run returned **no
category our registry did not already track** — a useful completeness check,
not new information. **Every finding of substance above came from inspecting
the source**, per the founder's instruction not to spend tokens on what
deterministic inspection can settle.

### NEXT, in order

1. **Measure the tribunal archives' depth and volume** once the licence
   question clears — the endpoints are proven, the extent is not.
2. **Characterise the 6,056 no-match SCR citations** — the only SCR bucket
   that could be a genuine acquisition gap, and only after normalisation and
   volume mismatch are ruled out. Year distribution skews recent (2023: 488,
   2022: 485), which is not the shape of a historical hole.
3. **The 2018–2026 concordance gap the ECT cannot cover.** The table stops at
   12.03.2018; the internal 656-judgment paired-citation source (§5a-pre) and
   the newer S.C.R. volumes are the candidate routes.
4. **CIC, CAT, CCI, NCDRC** — reachable, no order link found on the homepage
   or not chased to a PDF. Unfinished, not negative.

---

### Q1.47 · THE STRUCTURED LEGAL OBJECT, and three defects found on the way · 14–15 Aug 2026 (LCC)

`DONE:` DeepSeek enrichment produces span-verified facts, issues, holdings,
reasoning, arguments, authorities and topics into `document_enrichments`, and
the citation-extraction worker survives the agent session.
`VERIFY:` a real run against real corpus documents reporting a measured
span-verification rate; `judgment_citations` row count growing with no agent
attached; `check-schema-truth.mjs` green.

**The session's actual highest-value finding was not the DeepSeek work.** It was
that **no LCC enrichment worker was running at all**, while the corpus had grown
7.8x and NEW3 had flagged the gap as compounding rather than static (bus 0460).
Three separate defects were keeping it that way, and each had been invisible for
a different reason.

#### 1 · `citations-cli` could not run at 4.7M judgments — measured, then fixed

Two scaling faults, both written when the corpus was 38k:

- `buildIndex` did one unbounded `SELECT` over the whole table into a JS array.
  The **Map** is small (876,630 forms); the **array** is what grows. Same shape
  that killed the classify pass at 322k of 833k (`2414b09`). Now filtered
  (`WHERE neutral_citation IS NOT NULL OR array_length(reporter_citations,1) > 0`
  — **911,185 of 4,768,101 rows can contribute a key**, so 81% of the transfer
  was rows producing nothing) and streamed through a cursor. `citationKeys` was
  read to confirm the filter cannot change the index's contents, rather than
  assumed.
- The batch loop was serial. Added `--concurrency`, **default 1 so nothing
  changes for anyone who does not ask**. Batches cover disjoint ids and each
  writes its own transaction with `ON CONFLICT DO NOTHING`.

**Measured, same machine, same shared proxy: 2.9 judgments/s serial →
16.6 at concurrency 8 → 45–49 sustained at concurrency 12 in the live worker.**

#### 2 · `enrich-worker.cmd` had never worked, and could not have

The founder-approved persistence wrapper contained `set REPO=%~dp0..` **after**
`shift`. In cmd, `shift` renumbers `%0` too, so `%~dp0` stops being the script
and resolves against the current directory instead. The worker started in the
repo's PARENT and died instantly with `node.exe: .env: not found`, restarting on
that same error every 30 seconds.

**It had never been launched before**, so a bug on line one of its job had never
had the chance to surface — and `scripts/lawmind-enrichment-startup.cmd` claims
in its own header that a copy *"lives in the current user's Startup folder"*.
Checked both Startup folders on 14 Aug: **it does not, and never did.** A
documented persistence claim that was simply not true. That is why nothing was
running.

Fixed (`%~dp0` captured before the shift), plus a second latent fault of the
same family in the launcher: `%~dp0enrich-worker.cmd` resolves to the Start Menu
directory from the only location the file is ever actually run.

**Now verified by observation, not by hope:** `Lawmind-citations.cmd` installed
in the user Startup folder, launched via `Start-Process` → `cmd` → wrapper, and
**still logging progress across many subsequent agent tool calls** — the
property every previous attempt failed.

#### 3 · `judgments_created_at_idx` validated itself, 4 hours later

NEW2 refused to repoint pagination while it read `indisvalid = false` (0471) —
correctly. `pg_stat_progress_create_index` showed `waiting for old snapshots`
with `blocks_done 523484/523486`: the build finished in minutes and spent **4h
00m** waiting on the ingest fleet's long INSERT transactions, one virtual xid at
a time. It is now `indisvalid = true` and the progress view is empty. **0474's
"WAIT, not pause" was right** — nothing needed disrupting, it needed longer than
either lane expected. Told NEW2 (0487).

#### The DeepSeek work itself

**Audited before building, and most of the directive was already satisfied** —
key rotation, OpenRouter fallback with a circuit breaker, `llm_calls`, the
`input_hash` cache with its load-bearing `status = 'ok'` filter, and
`verifyClaims`. None of it was rebuilt. Full account:
**`docs/ai/LEGAL_OBJECT_PROGRAM.md`.**

Five new tasks (`case_structure`, `holding`, `arguments`, `authorities`,
`topics`), migration `0051`, applied and verified in production. **Every field
is a QUOTE, not a summary**, so the claim value *is* its evidence span and takes
the full-strength check a citation gets — no new `LABEL_KINDS` entry, which the
existing code explicitly warns against. 28/28 tests, including one asserting a
fabricated-but-plausible holding is rejected and one asserting none of the five
kinds has been quietly added to `LABEL_KINDS`.

**Two schema gaps closed on the way:** `document_enrichments` has existed in
production since 11 Aug with 28,728 rows and was in **neither** `schema.ts` nor
`SCHEMA_TRUTH.md`. Both now carry it. Nothing was broken by the omission — every
writer uses raw SQL — but this is the sentinel incident's exact shape:
*undocumented ≠ absent*.

**A measurement that reversed the queue design.** Every other pass sorts
`created_at DESC` to follow the ingest. **Of the newest 200,000 judgments,
199,444 — 99.7% — have `hc_document_class` NULL.** At the head there is nothing
to prioritise with: "substantive first" ranks 184 of 200,000. A newest-first
legal-object pass would have spent its whole budget on unclassified documents
that are mostly bail orders — `RING_PROGRAM.md` §2b drift, reached by following
a sensible rule off a cliff. The queue now targets the **classified substantive
population (194,610 `decided` + 39,046 `decided_brief` = 233,656)**, which grows
as `hc-classify-cli` catches up.

**And an invented value caught before it shipped:** a first draft ordered on
`text_extraction_method = 'repaired'`. The real value is `'pdftotext_fallback'`
(migration `0048`), and production holds **0** of them — so that priority tier
selects nothing today. Kept, with the correct value and the measurement written
down, rather than a priority that silently ranks nothing.

#### Deterministic work that cost no tokens and was worth more than any of it

`resolve-cli` dry run: **122,217 unresolved edges point at judgments we already
hold** — far beyond the 14,374 SCR subset NEW3 characterised in 0486. Applying
takes citation resolution from **14.5% → 30.2%** of non-sentinel edges. Run with
`--apply`; the tool's three guards (exactly one target · the year guard · never
overwrites) are why this is safe to run unattended.

#### Datasets

`services/ingest/src/dataset-export-cli.ts` — five provenance-rich JSONL sets,
**verified claims only**, split by DOCUMENT hash so a case's facts and its
holding cannot land on opposite sides. Smoke-tested: `case_intelligence` 221 ·
`treatment` 3,000 · `citation` 3,000 · `statute` 3,000 · **`retrieval` 0, and
reported as empty rather than quietly absent** — the `topics` task has not run
yet.

#### What is NOT done, plainly

- **The ladder stopped at stage 1.** 100 documents on one task, not the full
  100 → 1,000 → 10,000 → 100,000 climb, and not the other four tasks. Scaling
  past this needs the measured rate below to hold on a bigger sample.
- **Throughput is grant-limited, not code-limited.** One InferX grant, ~16
  s/document, ~225 documents/hour against 233,656 × 5 tasks. `FQ-IX2`.
  Concurrency is deliberately NOT the answer: `DEEPSEEK_DATA_MOAT.md` §1
  measured that parallel callers worsen the free pool's 429 rate.
- **Nothing is promoted.** `0045`'s boundary is untouched — no route joins
  `document_enrichments`, and promotion into a canonical table remains a
  separate, measured step this session did not build.

#### STAGE 1 RESULT — measured, and the ladder is HELD here deliberately

100 documents, `case_structure`, real corpus, one InferX grant:

    documents            100
    claims verified      993
    claims rejected      277
    span-verification   78.2%

**This is NOT auto-scaled to 1,000, and the reason is the number itself.**
78.2% means **roughly one claim in five was a passage the model produced that
is not in the judgment** — and that is with the strictest check this pipeline
has, on a task where the model was asked only to quote. The mechanism worked:
all 277 were rejected and none became data. But "the safety net caught 277
things" is a reason to look at the net's contents before widening the throw,
not a reason to multiply by ten.

`verificationState` distribution over the run was overwhelmingly `partial`
rather than `verified`, which is consistent with the model getting most spans
right and reliably inventing a few per document rather than failing wholesale.

**Next session's first action on this thread:** read a sample of the 277
rejections out of `rejection_reasons` and decide whether they are (a) genuine
fabrication, (b) whitespace/OCR artefacts the flattening does not cover, or
(c) the model quoting across an elision boundary. Those have three different
fixes and only one of them is "prompt harder". Scaling before that is buying
277 rejections per 100 documents at full price.

#### WHAT IS RUNNING AS THIS SESSION ENDS

- **`citations-cli`** via `scripts/enrich-worker.cmd` → Startup-folder launcher,
  `--limit 20000 --batch 25 --concurrency 12`, observed at **29–62
  judgments/s**. Log: `%TEMP%\lawmind-citations.log`.
- **`resolve-cli --apply`**, writing the 122,217 resolvable edges. **Not
  finished when this session ended** — verify with
  `select count(*) filter (where cited_judgment_id is not null) from
  judgment_citations`; it read 113,716 before the run and should approach
  235,933.
- **Nothing else.** The four `paragraphs-cli` shards and the ~20 `hc-load-cli`
  workers belong to other lanes and were not touched.

**Reboot persistence is INSTALLED BUT UNPROVEN:** `Lawmind-citations.cmd` is in
the user Startup folder, which fires at LOGON, not at boot — a rebooted machine
sitting at the lock screen runs nothing. It has not been through a reboot yet,
so do not record it as proven until it has.

### Q1.49 · NEW2 · HANDOFF — one change is UNVERIFIED BY EXECUTION, read this before starting a worker · 15 Aug 2026

**Session ended by the founder to start fresh sessions. Everything below is the
state a new NEW2 agent inherits.**

#### ⚠ THE ONE THING THAT IS NOT FINISHED

`services/ingest/src/paragraphs-cli.ts` pagination was repointed from a uuid
watermark to a `(created_at, id)` tuple keyset. **It typechecks and its exact
query shape was EXPLAIN-verified against production, but the CLI ITSELF HAS NOT
BEEN RUN SINCE THE EDIT.** Treat it as unproven until someone runs
`--resume --shard 0/4 --limit 300` and sees it page.

- **The 4 paragraph shards running right now still execute the OLD code** — tsx
  loaded it before the edit — so nothing in flight is affected either way.
- **`scripts/lawmind-ingest-startup.cmd` WILL launch the new code at next
  logon.** That is the risk: an untested query would start under a supervisor
  that restarts it. Run the smoke test above before trusting a reboot.

**Why the change was made** (LCC bus 0487 cleared the blocker):
`judgments.id` is uuid **v4**, so a cursor advanced to `c000…` never sees a
judgment harvested afterwards whose id sorts below it. At ~170,000 rows/hour a
long-running shard was permanently skipping a large share of what landed while
it walked. `--resume` masks this across restarts (it re-walks from zero and the
`NOT EXISTS` filter catches the misses) but not within a single long run.

**Why a tuple and not a plain `>`**, measured not assumed: `created_at` defaults
to `now()` = TRANSACTION time, so a whole `upsertJudgments` batch shares one
timestamp. **Largest measured group sharing a single `created_at` is exactly
100**, the batch size. A plain `>` skips up to 100 rows per page boundary; `>=`
loops forever.

**Planner confirmed** for the exact shape, per LCC's request that I verify
rather than take their word: `Parallel Index Scan using
judgments_created_at_idx` · `Index Cond: created_at >= …` · `Incremental Sort,
Presorted Key: created_at`. `judgments_created_at_idx` is `indisvalid = true`.

#### THE SHARPEST REMAINING COVERAGE HOLE

NEW3 (bus 0488) verified this lane's pre-2016 figures independently and
re-queried after the `--to-year` fix landed: **pre-2016 High Court holdings went
11,876 → 279,957 (24x)**, concentrated exactly where the six historical workers
were pointed (P&H 50,237 · Uttarakhand 48,246 · Patna 45,734 · Bombay 44,372 ·
Himachal 41,692 · Telangana 38,784).

**Allahabad is the sharpest hole left: 6 pre-2016 documents against 599,393
held and 3,493,992 source documents.** The largest court in the dataset is
essentially all post-2016. True zeroes: Karnataka 0, Andhra Pradesh 0, MP 0.
Zeroes in all but name: Madras 1, Delhi 2, J&K 2, Gauhati 3, Chhattisgarh 4,
Rajasthan 4, Manipur 5, Jharkhand 8.

**Next scheduling action, if RAM allows** (6.9 GB free at 32 workers): historical
`--from-year 1950 --to-year 2015` workers for `9_13` (Allahabad), `29_3`
(Karnataka), `28_2` (Andhra), `23_23` (MP), `33_10` (Madras), `7_26` (Delhi).
Note Allahabad's pre-2016 SOURCE is only 296 documents (`allYears` 3,493,992 −
`last10Years` 3,493,696) — so its historical hole may be genuinely tiny and the
6 documents may already be near-complete. **Measure its per-year source
partitions before assuming there is anything to fetch.**

#### FLEET AT HANDOFF

32 workers, one per court+scope, no duplicates, verified by grouping live PIDs:
18 from-2016 courts · 2 year-scoped (33_10-y2023, 8_9-y2023) · 6 historical
1950-2015 · 1 general sweep · 4 paragraph shards · 1 classify backfill.

Seven courts deliberately have NO from-2016 worker because they FINISHED that
window (≥99.99%): J&K, Himachal, Uttarakhand, Sikkim, Meghalaya, Tripura,
Manipur. **A missing worker there means completed, not forgotten.**

#### STILL OPEN, IN PRIORITY ORDER

1. Smoke-test the paragraphs pagination change above. **Do this first.**
2. `hc:classify` full re-walk is bandwidth-bound (~400 rows/min against the
   shared proxy; 4.09M never-classified rows ≈ 150h). Fix is to push
   `length()`/pointer/bail predicates into SQL and return booleans instead of
   `full_text`. **Deliberately not started** — it would put each regex in two
   places, and two copies of a matching rule drifting apart is a documented
   failure here. Needs the pure module to accept precomputed signals first.
3. A second classify pass over `hc_class_method LIKE 'unclassified_disposal:%'`
   (756,648 rows): the vocabulary extension can now claim ~773k of them, but
   `--resume` only walks `hc_class_method IS NULL`, so those need a full walk.
   Also ~9,980 `ALLOWED TO BE WITHDRAWN` rows are currently mis-held as merits
   and become procedural under the new rules.
4. Larger adjudication sample (n≥200) before asking LCC for a candidate table.
   Current measured fabrication rate 17.5% on n=40 — promotion refused.
5. Tribunals (NEW3 bus 0482): NCLAT + TDSAT verified open, free, no CAPTCHA.
   **NOT cleared — neither host is §6a-named, it is in FOUNDER_QUEUE.md. Do not
   start.** The fetch mechanism is documented in that message if it clears.

### Q1.47 · HELD_NOT_RETRIEVED DECOMPOSED — the cheap fix is dead, the benchmark is clean, and 88.6% is the embedding model · 14 Aug 2026

**Full account: `docs/ai/HELD_NOT_RETRIEVED_DECOMPOSITION.md`.** Picked per the
standing directive — `HELD_NOT_RETRIEVED` is 48.6% of the 288-query benchmark,
the largest failure population, and Q1.46 closed the only lead pointing at it
(hybrid-vs-dense recall gap 1.7pp, far too small to explain half the failures).
Nobody had ever measured WHERE in the pipeline the gold judgment falls out.

**Corpus snapshot at measurement (a moving corpus invalidates naive
before/after):** judgments ~3,622,046 · judgment_chunks ~599,379 (**620,300
embedded, exact**) · judgment_citations ~1,275,661 · judgment_paragraphs
~21,883,048 · 2026-08-14T18:01:14Z. NEW3 (bus 0483) correctly flagged that the
citations figure is a `reltuples` ESTIMATE — their exact `count(*)` was
1,336,773 at 17:30. Accepted: **estimates are fine for orientation, an exact
`count(*)` belongs in any benchmark denominator.**

**New tool `held:decompose`** (`services/harness/src/held-not-retrieved-cli.ts`),
140/140 measured, checkpointed, no new gold invented. It measures gold's exact
position against the TWO cut points `dense()` actually applies — `annDepth=200`
**chunks** and `CANDIDATE_DEPTH=50` **judgments** — which are two independent
failure modes wearing one name.

| mechanism | n | % |
| --- | --- | --- |
| `SEMANTIC_RANKED_LOW` | **124** | **88.6%** |
| `DENSE_OK_BUT_MISSED` | 16 | 11.4% |
| `CANDIDATE_TRUNCATED_BY_ANN_DEPTH` | **0** | **0.0%** |
| `GOLD_NOT_EMBEDDED` | 0 | 0.0% |

**THE CHEAP FIX IS DEAD AND IT WAS THE FAVOURITE.** Zero of 140 are cases where
the ranker scored gold inside the top 50 and the 200-chunk fetch discarded it.
Raising `annDepth` — one integer, the most tempting intervention available —
**would have fixed nothing.** Recorded prominently because the next person will
have the same idea.

**Depth vs exposure, the actionable table.** Both constants must move together
(a rank-51–100 gold sits at chunk rank ~110 median but up to 570):

| `CANDIDATE_DEPTH` | misses reachable | `annDepth` | gold chunk in pool |
| --- | --- | --- | --- |
| 50 *(today)* | 16/140 · 11.4% | 200 *(today)* | 40/140 · 28.6% |
| 100 | 36/140 · 25.7% | 500 | 68/140 · 48.6% |
| 200 | 60/140 · 42.9% | 1,000 | 82/140 · 58.6% |
| 500 | 81/140 · 57.9% | 2,000 | 92/140 · 65.7% |

**Deepening converts an INVISIBLE failure into a RANKABLE one — it is a
precondition for reranking to pay, not a fix.** A gold moved from "absent" to
"candidate rank 137" is still not in an advocate's top 5. Pairs with Q1.43's
finding that `BADLY_RANKED` skews to near-misses (65% at rank 6–20). **Not this
lane's to ship** — `RING_PROGRAM.md` §NEW1.3 forbids tuning fusion from a
measurement; reported to LCC as a costed option.

**THE BENCHMARK IS CLEAN ON THE ARTIFACT I MOST SUSPECTED.** `hybridSearch`
collapses duplicates on `content_hash` while the classifier compares IDs — so a
hit on a byte-identical twin would score as a MISS on the gold, a false failure.
Measured: **0 of 138 gold judgments have a twin, 0 have a NULL hash.** Refuted,
not assumed away.

**STILL OPEN — the 16 that should have been impossible.** Gold at chunk rank 17,
22, 29 (of 620,300) and judgment rank 15, 18, 25 — inside both cut points — and
the pipeline returned neither. Duplicate collapse is excluded, so it is HNSW
approximation loss or RRF displacement. `held:whymissed` was built and launched
and **did not complete**: one `hybridSearch` call exceeded 25 minutes under live
load (vs ~20s/query in Q1.46 the same day), CPU delta 0, I/O-blocked — NEW2 then
reported the machine rebooted 22:27Z after a two-hour network fault. **The
cheaper decisive measurement is designed and unrun**: exact says all 16 sit at
chunkRank ≤ 164, so one ANN query per case (~19s, ~5 min total) settles
ANN-vs-fusion without touching the full pipeline. **Next session's first task.**
`dense-ok-missed-cli.ts` needs a checkpoint before re-running — same gap Q1.46
already fixed on `arms-cli.ts`.

**GRAPH EXPANSION AND RERANKING ARE NOT ON THE PRODUCTION PATH.** Verified by
grep, not assumed: `search/graph-expand.ts` has exactly one importer,
`services/harness/src/retrieval.ts`; `route.ts:202` calls `hybridSearch` and
nothing else. **The 1.3M-edge citation graph contributes zero candidates to
production retrieval.** Anyone reasoning about production recall as though it
helped is reasoning about the harness.

**A pgvector TRAP THAT COST ME A 7x-WRONG NUMBER, reusable by every lane.**
`dense()` sets `hnsw.ef_search=200` and `iterative_scan=relaxed_order` inside its
transaction. A probe omitting them runs the DEFAULT `ef_search=40`, and pgvector
then **silently returns fewer rows than the LIMIT** — no error. Same vector, same
query: 14 distinct judgments without the SET LOCALs, **93 with them**. Caught only
because a follow-up `LIMIT 1 OFFSET 400` came back empty. The tool's own
`annYield` query had the identical bug and was fixed before the run.

**NEGATIVE RESULT, so nobody re-runs it:** the UNCAPPED exact rank query
(`count(*) WHERE embedding <=> $v < $d`) ran **>9 minutes without returning** for
ONE vector, vs ~19s for the ANN top-200 on the same connection. Uncapped exact
KNN over `judgment_chunks` is not viable on this database. The capped form
(`LIMIT 20001`) decides both cut points exactly and lets Postgres abort early.

### Q1.48 · DEEPSEEK SUPPORT LAYER — GENERATED, never GOLD · 14 Aug 2026

Founder direction, mid-session: DeepSeek is **not** the gold-label authority; use
it to enlarge the evaluation/search test space, not to manufacture truth; mark
every generated query GENERATED; cache and record all calls; continue the
retrieval program independently of model availability.

Built: `services/harness/src/generated-queries.ts` + `generate-queries-cli.ts`
(`generate:queries`), 7 guard tests green.

**The one rule, enforced structurally rather than by convention: a model may
rewrite a QUESTION, never decide the ANSWER.** A generated variant **inherits**
its `goldJudgmentIds` from the already-validated source query (which got them
from a verified citation edge). The model never sees a judgment id, is never
asked which authority is correct, and its output reaches only the `text` field.
That is what makes these independently checkable rather than circular.

- `provenance: 'GENERATED'` is a single-member literal; the gold fixtures have no
  such field, so the shapes are structurally incompatible in both directions.
- A test sweeps `src/fixtures/` asserting no `GENERATED` marker ever appears
  there — the half TypeScript cannot check.
- A test asserts no prompt asks a truth question. **It fired on two of my own
  prompts** ("Do NOT change which case it is") — reworded rather than weakening
  the guard.
- Strict JSON parser: a malformed reply yields ZERO items. A lenient parser that
  "recovers" a list from prose is one that invents content.
- Cache is content-addressed on `sha256(promptVersion + model + kind + input)` —
  the prompt version is IN the key, so a changed prompt cannot be served an old
  answer.
- `corpusValidated` starts `null` (UNKNOWN) and only the two kinds making a
  corpus claim (citation phrasing, case-name variation) can ever move off it;
  `--validate` rejects any variant that resolves to a DIFFERENT judgment.

**Proven end-to-end, not just typechecked:** 6 real calls, 24 items generated,
**verified in `llm_calls`** (`feature=search`, `data_class=public`,
`pseudonymised=false`). Re-run made 0 model calls. Needs
`INFERX_MODEL=deepseek-v4-flash-0731` — the bare alias 401s, per LANE_PROTOCOL §5.

**One additive change outside this lane, flagged not hidden:** `services/api/package.json`
now exports `./llm/call` and `./llm/route`, so the harness stays on the ledgered
`callModel` path instead of growing a second HTTP client — which is exactly how a
call escapes the `llm_calls` ledger. **I broke module resolution doing it**: a
`"//llm"` comment key INSIDE `exports` is an invalid subpath and invalidated the
whole map, breaking every `@lawmind/api/search/*` import in the harness. Caught by
typecheck, fixed by moving the comment to a top-level key, and the reason is now
written in the file so the next person does not repeat it.

### Q1.50 · THE 16 SETTLED — ANN-ONLY PROBE, ZERO HNSW LOSS, ZERO CANDIDATE-GENERATION LOSS, RRF FUSION BY ELIMINATION · 15 Aug 2026

**Picked up exactly where Q1.47 (`HELD_NOT_RETRIEVED_DECOMPOSITION.md`) left off**:
16 of 140 `HELD_NOT_RETRIEVED` gold judgments sat inside BOTH of `dense()`'s cut
points (`chunkRank <= 200`, `judgmentRank <= 50`, exact sequential-scan ranks) and
the pipeline still lost them. `held:whymissed` was built to explain them by
re-running the full `hybridSearch` twice per case and **did not complete** — one
call exceeded 25 minutes under live load, and the tool had no checkpoint, so the
partial run was a total loss.

**Before running anything: checked the database was not under severe load** —
`pg_stat_activity`: 2 active queries, 0 lock-waiters, 2.7s round trip. Fine for a
16-query pass.

**Built `held:annprobe`** (`services/harness/src/ann-probe-cli.ts`, new script,
checkpointed to `ann-probe-checkpoint.jsonl`) — the cheaper measurement
`HELD_NOT_RETRIEVED_DECOMPOSITION.md` §4b already named as next session's first
task: **one raw ANN query per case**, production's exact `dense()` SQL
(`SET LOCAL hnsw.ef_search=200`, `iterative_scan=relaxed_order`, same
`ORDER BY … LIMIT 200`), no sparse arm, no filter join, no RRF, no
`hybridSearch` call at all. 16 queries, sequential (not concurrent — one caller
against the shared proxy, `LANE_PROTOCOL.md` §5), ~4.5 minutes total, 2.7–13.3s
each.

**Result — 16/16, first run, no retries needed:**

| verdict | n | meaning |
| --- | --- | --- |
| `ANN_MISS_HNSW_LOSS` | **0** | the index itself does not return gold |
| `ANN_HIT_JUDGMENT_COLLAPSED_OUT` | **0** | ANN finds gold but judgment-collapse on ANN order alone already exceeds 50 |
| `ANN_HIT_JUDGMENT_IN_POOL` | **16** | ANN finds gold inside both cut points, on the index's own approximate order |

For all 16, the ANN-approximate chunk rank landed within 1–14 positions of the
exact sequential-scan rank (e.g. `criminal-3f99b5c8`: exact chunk=86, ANN
chunk=83; `hindi-a259ece9`: exact chunk=22, ANN chunk=36 — the largest drift
measured, still comfortably inside 200), and every ANN-derived judgment rank
landed at or under 50 (range 14–50, median ~30).

**Two of the four candidates the founder's directive named are now closed by
direct measurement, not inference:**

- **HNSW recall — RULED OUT.** The index does not lie at this setting for any
  of the 16. `ef_search=200` finding gold reliably (0/16 misses) is consistent
  with the ~96.9% recall@50 already measured in `retrieve.ts`'s own comment —
  16 genuinely-close cases losing zero to approximation is not a surprising
  draw from that rate.
- **Candidate generation (ANN-depth truncation) — RULED OUT**, a second
  confirmation of Q1.47's `CANDIDATE_TRUNCATED_BY_ANN_DEPTH = 0/140`, now at
  the chunk-order level the earlier exact-scan measurement could not see
  directly.

**The remaining two, decided by elimination plus one code read (`retrieve.ts`
line 669–673), not a full pipeline re-run:** `§4a` of the decomposition doc
already measured duplicate collapse dead (0/16 gold judgments have a
byte-identical `content_hash` twin). `failure-classifier-cli.ts` checks the
**final, fused, `--depth 50`** output (`services/harness/src/failure-
classifier-cli.ts:124`) — the same 50 as `dense()`'s own cut point. With ANN
alone placing gold inside the top 50 on its own order, and duplicate collapse
excluded, the only place left for a judgment to fall out of the *final*
top-50 is `hybridSearch`'s RRF combination step (`rrf()` unions the dense and
sparse candidate ID sets, scores `1/(RRF_K + rank)` per list, sums where a
judgment appears in both, sorts, and slices to `limit`) or the exact-pin
step immediately after it. **Read, not re-measured this session**: a gold
judgment appearing in the dense list ALONE, at a mid-pack rank (14–50, median
30), contributes exactly one term, `1/(60+rank)` ≈ 0.011–0.015. Any candidate
present in BOTH lists, or present near the top of the sparse-only list,
scores as high or higher from a single list and can occupy one of the 50
final slots gold needed. **INFER, not KNOW**: this reasoning was not closed
by an independent measurement this session (that would mean running the
sparse arm too, which is cheap but was not done — flagged as the one gap
below, not silently treated as proven).

**Reported to LCC and NEW3 on the bus** (this is the answer both the standing
directive and `HELD_NOT_RETRIEVED_DECOMPOSITION.md` §4b asked for). **Not this
lane's to ship** — `RING_PROGRAM.md` §NEW1.3 forbids tuning RRF or fusion
weights from a measurement; this is reported as a measurement with a named
mechanism, not a change request.

**What is still open, named rather than silently closed:**

- The RRF-displacement mechanism above is INFERRED from the code, not
  independently confirmed by running the cheap sparse-only arm
  (`hybridSearch(sql, query, null, {}, limit, 'sparse')`, no ANN, ts_rank
  only) for these 16 and simulating the actual fused score comparison. That
  is the next cheap step if anyone wants KNOW instead of INFER on this
  specific point — still well short of the full-pipeline `held:whymissed`
  call that stalled.
- `docs/ai/HELD_NOT_RETRIEVED_DECOMPOSITION.md` §4b updated with this result;
  §4c added.

### Q1.51 · NEW3 · SCR no-match bucket closed, the 2018+ concordance question closed, tribunal discovery advanced, and "Allahabad is the sharpest hole" corrected · 15 Aug 2026

Continuation session. Five results, most-consequential first.

**1 · The SCR no-match bucket (§1e/1f's "6,056, could conceivably be
acquisition") is closed.** Re-measured live: 6,886 distinct / 10,359 edges
against 38,342 held SC judgments. **62% of the no-match edges are dated
2018+** — exactly the Equivalent Citation Table's blind spot (it stops
12.03.2018). The pre-2018 remainder sits inside the ECT's own coverage
window, so it isn't a separate gap either — both routes lead to "wait for
the ECT licence," already open in `FOUNDER_QUEUE.md`, not a new item. SC
holdings are 99.98% complete, so a 2018+ no-match SCR citation almost
certainly means the judgment is already held under its neutral citation and
the print S.C.R. series hasn't assigned it a volume/page yet — a metadata
lag, not a missing document. **Net: nothing in this bucket is a genuine
acquisition target.** Full detail: `MISSING_AUTHORITY_QUEUE.md` §1g. Sent to
LCC and NEW1 (bus 0499/0500).

**2 · A real, LCC-actionable normalisation defect, found while parsing #1.**
`normaliseCitation()` (`services/ingest/src/citations.ts`) never inserts a
space around a bare "SCR" token, so `(2017) 11SCR1036` and
`(2017) 11 SCR 1036` normalise to different keys for the same authority.
Measured: **1,648 distinct unresolved citations** carry this exact defect
(excludes the legitimate volume-less form, which already resolves fine via
volume-agnostic matching). Not this lane's file to touch — flagged on the
bus with the count.

**3 · The 2018–2026 concordance-gap research question is closed, no new
source exists.** Both candidate routes named in the prior handoff were
already checked in earlier sessions: e-SCR's search form has no SCC/AIR
field (closed for the concordance problem, any year); the internal
656-judgment paired-citation source is real but already LCC's queued build
item, not a NEW3 discovery gap. No official post-2018 concordance
publication found, this session or any prior one. `MISSING_AUTHORITY_QUEUE.md`
§1h.

**4 · Tribunal discovery advanced on the four still-open sites.** CIC is
**CAPTCHA-gated, closed** — the earlier "no CAPTCHA token" read was the
`cic.gov.in` gateway page; the actual search portal it links to
(`dsscic.nic.in`) has a real CAPTCHA, fetched and confirmed directly. NCDRC's
own site carries **no judgment repository at all** — case-status tools only,
routing to `confonet.nic.in` (SMS/IVRS) and `e-jagriti.gov.in` (filing), a
different portal not explored further. CCI (`cci.gov.in/antitrust/orders`) is
a **real, no-CAPTCHA, filterable order browser** — the most promising find of
the four — but its results table is JS/AJAX-rendered and a plain fetch
returns it empty; needs `agent-browser` to go further. **Chrome was not
installed in this environment; `agent-browser install` failed 3/3 download
attempts with a timeout decoding the response body** — the same
DNS/network flakiness this repo already documents for long-running workers,
now hit by a one-off download too. Stopped per the three-strikes rule rather
than retrying a fourth time; CCI and CAT stay unresolved for this session,
open for whoever next has a stabler connection or a pre-cached Chrome.
`SOURCE_REGISTRY.md` §2b table updated.
**Still NOT authorized for acquisition regardless of what CCI/CAT turn out to
be** — neither host is §6a-named.

**5 · Correction: "Allahabad is the sharpest remaining coverage hole" (my own
0488, and this file's own Q1.49 handoff) was measuring the wrong thing.**
Re-queried live: corpus 5,706,753 (+258k since NEW2's 14 Aug 23:00 reboot
report), pre-2016 total 499,405. **Allahabad's pre-2016 holding is still
exactly 6** — unchanged despite 258k new judgments landing corpus-wide.
That's not a stalled worker; `COVERAGE_GAP_MATRIX.md` §1's own table already
had the proof: Allahabad's `allYears` source minus `last10Years` source is
**296 documents, total** — cross-checked directly against
`HC_METADATA_SURVEY.json`, not the derived table. 6/296 is already ~2%, and
the ceiling is ~290 more documents. **The real priority list, same
arithmetic, for every court still at zero/near-zero pre-2016: Chhattisgarh
(4 held / 267,627 available), Rajasthan (4 / 246,930), Karnataka (0 /
225,177), Madras (1 / 186,786), Madhya Pradesh (0 / 104,831)** — all over
900x Allahabad's real remaining population. `COVERAGE_GAP_MATRIX.md`
§3z-correction2. Sent to NEW2 (bus 0504) — this is evidence for NEW2's own
scheduling call, not a scheduling instruction from this lane.

**NEXT, in order:** (1) retry `agent-browser install` when the network is
stable, then finish CCI/CAT; (2) watch for a founder answer on the three
still-open licence questions (ECT, gazette, tribunals — none answered as of
this session); (3) re-run this bucket's characterisation again once LCC's
citation-resolver `--apply` pass (bus 0493) and any ECT-licence decision
land, since both numbers in #1 will move.

### Q1.49 · THE FLEET WAS DEAD 12.75 HOURS, THE BOOT LAUNCHER FAILED ITS FIRST TEST, AND 2016–2022 IS THE BIGGEST HOLE IN THE CORPUS · NEW2, 15 Aug 2026

**Three findings, in the order they mattered.**

#### 1 · Dead fleet — and the launcher written to survive this did not fire

Found at session start: **zero workers, zero rows written in the preceding two
hours** — verified against production, not against the process table. Every
worker log cuts off mid-batch between 04:23 and 04:26 with no error and no
`RESULTS` block.

The System event log explains the death, and it is not a crash: **the machine
shut down at 04:26 and did not come back until 17:11** — 12.75 hours powered
off. Nothing was wrong with the workers.

**What IS a defect is that `scripts/lawmind-ingest-startup.cmd` did not fire.**
It was installed in the Startup folder, byte-identical to the repo copy, and the
17:11 boot was its first real test. Not one `hc-boot-*.log` was created.

**Root cause, verified empirically before changing anything:** the file derived
its repo as `set REPO=%~dp0..`, which resolves against *the running copy's own
directory*. The copy that actually runs lives in the Startup folder, so it
resolved to `…\Start Menu\Programs`, which holds no `scripts\supervise.mjs`.
`cd /d` **succeeds** (it is a real directory), `node` then exits instantly with
module-not-found, and because `supervise.mjs` never started, **nothing writes a
log.** A launcher that fails this way is indistinguishable from one that was
never triggered — which is why it cost the whole outage to notice.

**The sibling launcher already had this right and said so.**
`scripts/lawmind-citations-startup.cmd` carries a section headed *"WHY AN
ABSOLUTE PATH AND NOT `%~dp0`"* making this exact point, and uses
`set REPO=C:\Users\Xerxus\Documents\Lawmind`. It was written the same day.

> **The lesson is not "use an absolute path". It is that a sibling script's
> header had already paid for this and nobody read it.**

Fixed, and **verified by execution rather than by reading**: a probe mirroring
the launcher's own lines, run from the Startup folder as Explorer would, prints
`RESOLVED-OK cwd=C:\Users\Xerxus\Documents\Lawmind`. The deployed copy
hash-matches the repo copy.

**Two more instances of the same family, NOT fixed here because they are LCC's
files** (sent on the bus instead): `scripts/lawmind-enrichment-startup.cmd`
invokes `"%~dp0enrich-worker.cmd"` and carries the identical defect, **and it is
not installed in the Startup folder at all** — so paragraph/enrichment work has
no boot persistence whatever. (`scripts/enrich-worker.cmd`'s own `%~dp0..` is
fine: it is always invoked from the repo, never copied.)

#### 2 · The paragraphs keyset repoint has a cold-start defect — shards left DOWN

The smoke test this file asked for, run: **it printed its banner and produced no
first page in 7 minutes.** The tuple and the index are fine. The defect is the
interaction of an ascending cursor seeded at the epoch with `--resume`'s
`NOT EXISTS` filter.

| measured, bounded queries only | |
| --- | --- |
| oldest 10,000 judgments by `created_at` lacking paragraphs | **0** |
| oldest 100,000 lacking paragraphs | **1** |
| judgments · already have paragraphs | 5,713,537 · 4,409,248 |
| scan cost | ~99s per 100,000 rows walked |

**The undone 1.3M rows are all at the NEW end; the cursor starts at the OLD
end.** A cold start walks ~4.4M done rows — **~72 minutes — before its first
page, re-paid on every restart**, and `supervise.mjs` restarts up to 40 times.
The old uuid-v4 watermark hid this because it scanned in effectively random
order, where undone rows are uniformly distributed. Its own defect was real; the
replacement swapped a correctness bug for a cold-start cost that only appears
once the done-prefix is large. It was small when measured, and is 4.4M rows now.

The fix is to **persist the cursor** — `LANE_PROTOCOL.md` §4 already requires it
and every harvest worker has a checkpoint for precisely this. `paragraphs-cli`
is paragraph evidence, LCC's lane per `RING_PROGRAM.md` §3, so the measurement
went to them (bus 505) and the edit did not go in here. **The 4 shards are
commented out of the boot launcher with the reason written in place**, not
silently dropped.

#### 3 · 2016–2022 is a 7.69M-document hole and it is named nowhere

`COVERAGE_GAP_MATRIX.md` §5 item 3 asked for the real court×year matrix. Built:
survey `perCourtPerYear` joined against a live `GROUP BY court, year`. **Totals
reconcile to 20,529,203 exactly** — the check that no court was silently dropped.

| band | source | held | coverage | gap |
| --- | --- | --- | --- | --- |
| 1950–2015 | 4,757,636 | 467,742 | 9.83% | 4,289,894 |
| **2016–2022** | **9,069,540** | **1,379,310** | **15.21%** | **7,690,230** |
| 2023 | 2,078,757 | 1,378,862 | 66.33% | 699,895 |
| 2024 | 1,747,681 | 613,138 | 35.08% | 1,134,543 |
| 2025 | 2,034,647 | 1,107,240 | 54.42% | 927,407 |
| 2026 | 840,942 | 721,011 | 85.74% | 119,931 |
| **TOTAL** | **20,529,203** | **5,667,303** | **27.61%** | **14,861,900** |

**Nearly double the pre-2016 backlog the whole `--to-year` remediation was built
for**, and ranked below it everywhere: `RING_PROGRAM.md`, `COVERAGE_GAP_MATRIX.md`
and the mission's own P0/P1 list all put pre-2016 and the 2023–2024 donut holes
first. **Ten courts hold ZERO in the band** — Allahabad 2,055,580 · Madras
820,458 · P&H 729,606 · Patna 639,070 · Bombay 623,223 · Rajasthan 570,702 ·
Orissa 441,673 · Karnataka 423,516 · Chhattisgarh 215,270 · Calcutta 146,805.

**Cause, checked against the running workers rather than reasoned about:** the
from-2016 fleet descends newest-first and is still inside 2025 (`hc-r9-27_1.log`
showed `27_1/2025` at its last write). Unlike the pre-2016 hole this is **not**
unreachable — it needs scheduling, not a code change. Six band workers launched
(`--from-year 2016 --to-year 2022`, 5.44M documents targeted) and added to the
boot launcher. Checkpoint keys are scope-suffixed (`9_13-to2022.json`), verified
against `hc-load-cli.ts`'s own `CHECKPOINT_PATH` derivation first — a shared key
would have two workers erasing each other's progress on every write.

**And a correction to how 2023 has been read, including by this lane.** 2023's
66% is an artifact of dedicated `--year 2023` workers (their checkpoints exist),
not of the fleet descending into it. 2024 has no such worker. `COVERAGE_GAP_MATRIX.md`
§4b read that shape as a "donut hole" needing explanation — **there is no donut;
there is a dedicated worker on one side of it.**

> **A per-court percentage cannot answer a per-year question.** Allahabad at
> 17.6% of `allYears` reads as a uniformly partial ingest. It is ~100% of 2026,
> 36% of 2025, **0% of 2024**, 59% of 2023 and **0% of the seven years before**.
> Each needs a different action; the single percentage recommends none.

#### FLEET AT HANDOFF

**34 workers, no duplicates** — every live PID grouped by scope, `count == 1`
asserted. 18 from-2016 · 2 year-scoped 2023 · 6 historical 1950–2015 · **6 new
2016–2022 band** · 1 general sweep · 1 classify backfill. **4 paragraph shards
deliberately DOWN** (§2). RAM 7.4 GB free of 32.5 GB, comparable to the previous
fleet's 6.9 GB at 32 workers.

Verified by ROW GROWTH, not process count: `0 → 8,606 → 15,411` rows per 5
minutes; 40,562 in the last 60.

**A standing correction to the mission brief:** it states the machine has
**~9.3 GB free**. Measured by two independent methods (`Win32_LogicalDisk` and
`Get-PSDrive`): **C: has 664.51 GB free**, D: 29.03 GB. The repo and all ingest
output are on C:. The local-disk pressure that framed the low-cost-storage
section does not currently exist — object-storage work should be justified on
Railway/Postgres cost, not on this machine running out of room.

#### STILL OPEN

1. **Re-enable the paragraph shards** once LCC checkpoints the cursor (bus 505).
2. **2024 has no dedicated worker** on any large court (Allahabad 0, Bombay 0,
   P&H 0, Telangana 0 held). Next scheduling action once the band workers show
   sustained throughput; RAM is the constraint, not availability.
3. Items 2–5 of the Q1.46 handoff list are untouched by this session.

---

### Q1.52 · THE 278 REJECTIONS TRIAGED, AND ONLY 28.4% WERE THE MODEL · LCC, 15 Aug 2026

`DONE:` every rejected claim from the first 100-document `case_structure` pass
classified by cause with an owner against each, so the response to a 78.4%
verification rate is a fix rather than a prompt edit.
`VERIFY:` bucket counts sum to 278; the predicted verifier gain reproduced by
`enrich-cli --reverify` at zero token cost.

**Built:** `services/ingest/src/enrich-triage.ts` + `-cli.ts` +
`enrich-triage.test.ts` (14 tests). No model calls, no writes. Full account:
**`docs/ai/ENRICHMENT_REJECTION_TRIAGE.md`**.

| owner | claims | share |
| --- | ---: | ---: |
| **ingest** — page furniture spliced into sentences, OCR spacing, one-character substitutions | **150** | **54.0%** |
| model — fabrication 30, paraphrase 31, splicing 17, ellipsis 1 | 79 | 28.4% |
| verifier — case 45, min-length 3, punctuation 1 | 49 | 17.6% |

**A prompt edit could have touched 28.4% of this.** Outright fabrication is 30
claims — **2.3% of all 1,289** — and every one was caught and dropped by the span
check. The pipeline worked; the rejection rate was mostly measuring us.

**Category 4 (elision/boundary) is ZERO**, and the excerpt was reproduced from
`input_hash` for 101/101 rows so the test was real. The 20k+8k window is not
manufacturing false spans. It still cannot be shown not to lose recall — a claim
never made leaves no trace.

**The verifier defect, fixed.**
`INTENT: verifyClaims located the evidence span with a CASE-SENSITIVE substring
test while case-folding the value check one line below it; 45 rejected claims
expect the span to be found; enrich.ts's own comment says case is not identity
and that folding "still cannot find a name the document does not contain".`
Applied, with three adversarial tests (a fabrication refused in three casings, a
foreign span refused in two). `--reverify` over stored output: **1,011 → 1,056
claims, 78.4% → 81.9%**, exactly the 45 predicted.

**The ingest defect, NOT fixed here and deliberately so.** `full_text` carries
page rules, running headers, NC stamps and e-signature panels **inside
sentences**. Court-specific: **Karnataka 92.1%** of substantive judgments carry
an inline page rule and 47.4% an inline signature panel; **MP 68.6%**; Kerala
2.4%; most others clean. Everything reading `full_text` reads the furniture —
paragraph segmentation, chunking, citation spans, any passage shown as evidence.
Sent to NEW2 as the owner (bus 0512) with the measured vocabulary
(`FURNITURE_PATTERNS`), and to NEW1 (bus 0513). Stripping it inside the
enrichment worker would hide a corpus defect behind one consumer's workaround.

**Not concluded:** whether the 6.1% model-owned claim rate is acceptable for
promotion. Nothing is promoted; the `0045` boundary is untouched.

### Q1.53 · THE CITATION RESOLVER HAD NOT BEEN RE-RUN — 131,125 EDGES, 14.0% → 30.0% · LCC, 15 Aug 2026

`DONE:` the bulk resolution sweep re-run over a corpus that has grown 7.8x since
it last ran. `VERIFY:` `count(*) WHERE cited_judgment_id IS NOT NULL` moves from
114,425 toward 245,550.

**Found by answering NEW3's bus 0486** — they measured 14,374 unresolved SCR
citations exactly matching judgments we hold, all from the 6 Aug batch, and asked
which of two causes it was. **Neither, quite.** `resolve-cli.ts` has no date
filter; its selection is the whole table and `CORPUS_KEYS` unions
`reporter_citations`, `neutral_citation` and aliases across every judgment. It
had simply **not been run**. What runs continuously is `citations-cli`, which
resolves inline at extraction time against an index built when that pass
started — so new edges resolve on the way in and old edges are only revisited by
the bulk sweep, which nothing was re-running.

| | |
| --- | ---: |
| before | 114,425 / 819,290 (14.0%) |
| RESOLVABLE | **131,125** |
| REFUSED: self-citation | 183,665 |
| REFUSED: two or more targets | 27,009 |
| no key in our corpus | 363,066 |
| after apply | **245,550 / 819,290 (30.0%)** |

NEW3's 14,374 are a subset. No new logic, no new data, no licence, no founder
decision. The three guards are unchanged: exactly-one-candidate, the year guard,
never-overwrite, plus the self-citation filter the database itself found.

**A CORRECTION TO HOW THIS LANE HAS BEEN REPORTING CITATION GAINS, owed after
verifying NEW1's bus 0478 against my own code.** LCC has been quoting resolution
improvements as though they were retrieval wins. **They are not, yet.**
`search/graph-expand.ts` is imported by exactly one file —
`services/harness/src/retrieval.ts` — and `services/api/src/search/route.ts`
imports `hybridSearch` at line 17 and calls it and nothing else at line 202.
Zero occurrences in `apps/`. **The 1.28M-edge citation graph contributes no
candidates to production retrieval.** Checked independently rather than taken on
NEW1's report. The edges are still worth resolving — treatment, authority checks
and the citator all read them — but no recall benefit should be claimed for them
until something in the funnel consults the graph.

**THE STANDING DEFECT THIS EXPOSES, open:** the bulk sweep is a manual pass with
no schedule while the corpus grows ~170,000 rows/hour, so resolution decays
continuously between runs and **nothing measures the decay**. Same shape as
NEW3's 0460 point about `external_citations` compounding rather than being
static. Needs either a scheduled sweep or an incremental resolver that revisits
`cited_judgment_id IS NULL` rows as the corpus grows.

### Q1.54 · STORAGE FORENSICS — 22 GB of the 96 GB is a duplicate we already hold · LCC, 15 Aug 2026

`DONE:` the first storage architecture audit, measured against the live database.
`VERIFY:` `docs/STORAGE_AUDIT.md`, every figure from `pg_total_relation_size` /
`pg_stat_user_indexes` and a `TABLESAMPLE` verification of the duplication claim.

**96 GB total.** `judgments` 59 GB (35 GB TOAST + 18 GB indexes) ·
`judgment_paragraphs` 27 GB · `judgment_chunks` 9.6 GB · everything else < 1%.

**`judgment_paragraphs.paragraph_text` is derivable and therefore redundant.**
The table already carries `char_offset` and `char_length` beside it. Verified on
a 5,620-paragraph `TABLESAMPLE BERNOULLI` draw: **99.98% equal
`substr(full_text, char_offset+1, char_length)` exactly, 100% are substrings of
their judgment.** Dropping it reclaims **~22 GB, 23% of the database, with no
information loss.** `judgment_chunks.chunk_text` has the same shape and a further
~3.3 GB, unmeasured.

**Not done, and not LCC's alone to do:** every paragraph read becomes a detoast
of the parent judgment — the exact cost that made a `length(full_text)` predicate
return nothing in ten minutes. NEW1 and NEW2 pay that half. Handing over the
measurement, not the decision.

**`judgment_paragraphs_number_idx` — 1,216 MB, THREE lifetime scans**, against
siblings at 119M and 48M. In-lane and reversible, but an index drop locks a table
taking ~170,000 inserts an hour, so it waits for a quiet window and
`DROP INDEX CONCURRENTLY`.

**Nothing here should move to object storage.** `full_text` carries the 14 GB
full-text index and is what `verifyClaims` reads; the HNSW index is the retrieval
path. The saving available is redundancy elimination, which costs CPU per read;
tiering costs a network round trip per read forever. R2's right first use is raw
source artefacts, which are not in Postgres at all today.

### Q1.55 · PARAGRAPH CURSOR PERSISTED + THE ENRICHMENT LAUNCHER FIXED AND ACTUALLY INSTALLED · LCC, 15 Aug 2026

`DONE:` NEW2's bus 0505 and 0510 both closed. `VERIFY:` two live runs of
`paragraphs-cli` (cold writes a checkpoint, warm resumes past it) and the
launcher executed from the real Startup folder with a worker log to show for it.

**0505 — the cold start.** The `(created_at, id)` repoint was correct and
incomplete: the cursor did not survive the process, so every restart re-walked
~4.4M finished rows (~72 min/shard, and `supervise.mjs` restarts up to 40 times).
`paragraphs-cli.ts` now checkpoints per shard to
`services/ingest/.checkpoints/paragraphs-<i>_<n>.json`, **written only under
`--apply`** (NEW2's own 0484 hc-load-cli defect, avoided because they wrote it up)
and **only after the page is inserted** (safe: `ON CONFLICT DO NOTHING`). A
malformed checkpoint is discarded rather than half-believed.
**The trade, named:** a persisted cursor never goes back, so a row passed over
below it is not revisited; `--restart-cursor` is the deliberate full sweep.
Smoke-tested on `--shard 0/97` so it could not collide with NEW2's four shards.
**Their shards are clear to start.**

**0510 — `%~dp0` in the launcher.** `scripts/lawmind-enrichment-startup.cmd` used
`%~dp0`, which from a Startup-folder copy resolves to the Startup folder. NEW2
lost 12.75 hours to the identical defect. Fixed to an absolute `REPO`;
`enrich-worker.cmd`'s own `%~dp0..` is correct and untouched.

**And a second defect only the first execution could show.** The file was
LF-only with a non-ASCII em-dash, so `cmd` mangled `REM` lines and printed
`'M' is not recognized` — twice. Rewritten CRLF + ASCII. **It had never been run
once**, which is also why NEW2 found it was never installed. A launcher nobody
has executed is not a launcher, it is a plan.

**Installed and verified:** Startup now holds `Lawmind-citations.cmd`,
`Lawmind-ingest.cmd` and `Lawmind-paragraphs.cmd`; `%TEMP%\lawmind-paragraphs.log`
carries a live banner and a `paragraphs-cli` node process is running.

### Q1.56 · A LAUNCH-METHOD LESSON THIS SESSION RE-LEARNED THE HARD WAY · LCC, 15 Aug 2026

`Start-Process`-launched workers **survive across tool calls but not across the
agent process exiting.** Four detached jobs (the four-task legal-object pass, the
`metadata` reverify, and the `resolve --apply`) were alive for an hour and were
all gone at the next session boundary. `scripts/enrich-worker.cmd`'s own header
already said this — *"every one died the moment the agent tool call returned …
this is the harness attaching children to a job object with kill-on-close"* — and
it was not read before launching.

**Nothing was lost**, because every one of those passes writes per document:
`holding` 99 rows and `arguments` 100 rows completed and are in the database,
`authorities` stopped at 66/100 with all 66 persisted, `topics` never started.
**But the throughput was.** The only launch path proven to outlive a session on
this machine is the Startup-folder / `enrich-worker.cmd` route, and that is what
the remaining legal-object passes should use.

### Q1.57 · STORAGE: THE RECLAIM IS 1.4 GB, NOT 23 GB — three of four candidates died on inspection · LCC, 15 Aug 2026

`DONE:` every storage candidate in `docs/STORAGE_AUDIT.md` checked against its
actual consumers before anything was dropped, per the founder's directive.
`VERIFY:` the audit's §2b/§3/§5, each conclusion resting on a named artefact —
a repo instrument, a consumer grep, or an index definition.

| candidate | first verdict | after checking |
| --- | --- | --- |
| `judgment_chunks.chunk_text` ~3.3 GB | derivable | **NO** — offsets describe the non-overlapping tail; `verify-exact-span-cli` 400/400 |
| `judgment_paragraphs.paragraph_text` ~22 GB | "a deletion target" | **NO** — `ts_rank`ed at query time on the retrieval hot path |
| `judgment_paragraphs_number_idx` 1.2 GB | drop, 3 scans | **NO** — a pinpoint index built ahead of its consumer |
| `judgment_paragraphs_judgment_idx` 1.4 GB | not noticed | **YES** — strictly redundant against `judgment_paragraphs_unique` |

**`paragraph_text` is required, and by more than display.**
`services/api/src/search/retrieve.ts:818` `fillParagraphFallback` runs
unconditionally in every retrieval mode and orders by
`ts_rank(to_tsvector('english', paragraph_text), …)` — the column is **ranked
on**, computed per row, inside Gate S1's 3-second budget. Deriving it means a
TOAST decompression of a whole judgment per candidate row. The 22 GB becomes
available only behind a retrieval redesign (a materialised `tsvector`, or moving
the ranking into the chunk table), which is NEW1's call, not a storage task.
`apps/` has zero references, so no client contract is involved. Sent as bus 0521.

**The `number_idx` recommendation is WITHDRAWN**, on the instruction to prove it
unnecessary rather than infer it from a scan count. Its definition —
`btree(judgment_id, paragraph_number) WHERE paragraph_number IS NOT NULL` — is a
pinpoint lookup, "paragraph 14 of judgment X". Three scans because no route does
that lookup **yet**; pinpoint citation is Phase 1 exact-evidence work still
ahead.

> **A low scan count separates used from unused. It cannot separate useless from
> built-ahead-of-its-consumer.** Only the definition and the roadmap can.

**What replaced it is provable rather than inferred.**
`judgment_paragraphs_judgment_idx` is `btree(judgment_id, paragraph_index)` and
`judgment_paragraphs_unique` is `UNIQUE btree(judgment_id, paragraph_index)` —
identical column list, so the plain one is strictly redundant. 1,440 MB on 26.6M
rows. Its 119M scans move to the unique index at identical cost; `ON CONFLICT
(judgment_id, paragraph_index)` binds to the unique one. **Not dropped yet** —
wants a quiet window, `DROP INDEX CONCURRENTLY`, and a planner re-check against
`fillParagraphFallback`'s `judgment_id = ANY(...)` shape.

### Q1.58 · THE RESOLVER BLOCKER, PREPARED FOR FOUNDER EXECUTION · LCC, 15 Aug 2026

**Production resolution is 13.63%** (114,748 of 841,768 real edges, measured
19:10 UTC). **The 30.0% figure is a DRY-RUN PROJECTION and is not quoted as
achieved anywhere.** Q1.53's numbers are corrected accordingly.

Orphaned backend **pid 62315** — 16h+ on the resolver's `UPDATE`, started 33
minutes after the 14 Aug reboot by a session that no longer exists — still holds
the row locks, and `pg_blocking_pids` still names it as the only blocker of the
ready run (pid 65284, waiting 58+ minutes).

**Not worked around, and the resolver's logic was not modified to avoid it** —
both were explicitly forbidden and both would have been the wrong fix anyway.
`docs/ops/UNBLOCK_CITATION_RESOLVER.sql` carries the exact founder-executed
sequence: confirm the pid is still the same backend (pids are reused), confirm it
is still blocking, `pg_cancel_backend` first and `pg_terminate_backend` only if
that fails, then LCC re-runs dry → apply, and **step 4 is the only count that
converts the projection into an achievement.**

### Q1.59 · NEW1 · `held:rrfsim` BUILT, HIT THE SAME PID 62315 BLOCKER INDEPENDENTLY, HELD PENDING THE FOUNDER · 15 Aug 2026

Built `held:rrfsim` (`services/harness/src/rrf-sim-cli.ts`, `held:rrfsim`
script) per the founder's explicit next-step: promote the 16
`DENSE_OK_BUT_MISSED` cases' RRF-displacement attribution from INFER to KNOW
via the cheapest decisive measurement — one isolated ANN call (reused from
`held:annprobe`) + one isolated sparse-only `hybridSearch(..., 'sparse')`
call per case, then `retrieve.ts`'s own `rrf()` formula reimplemented exactly
(constants asserted against source, same pattern as `held-not-retrieved-
cli.ts`) to decide gold's real fused rank. No full-pipeline `hybridSearch`
call, no repeat of the 25-minute stall.

**Checked `pg_stat_activity` first** (2→18 active between two checks minutes
apart) and ran anyway at low footprint (sequential, pool size 2) since 16
cheap queries isn't the "large experiment" the load warning targets. **First
query still hung 10+ minutes, 0/16 checkpointed.** Stopped the task (not a
blind retry) and diagnosed rather than guessed: `pg_stat_activity` showed
**pid 62315 active 59,078s (16.4h)** and a second copy **pid 65284 at 4,383s,
`wait=Lock`, blocked BY 62315** (`pg_blocking_pids` confirmed). My own sparse
query (pid 65638) sat 650s+ on plain IO wait — not locked, just starved by a
saturated shared proxy.

**This is Q1.58's pid, not a new incident** — confirmed against LCC's entry
above after broadcasting independently (bus 0523, before I'd read Q1.58).
Traced the source myself: `services/ingest/src/resolve-cli.ts` lines 96-102,
`CORPUS_KEYS` — an unindexed `unnest`+`regexp_replace` scan over the whole
`judgments` table, the identical shape `LANE_PROTOCOL.md` already documents
as found-and-fixed in the sibling file `concordance-cli.ts` on 13 Aug. The
comment here ("38,341 judgments never cross the wire") was true at 12 Aug
scale and is not at today's. **Not this lane's to fix** (ingest/citations
code, not retrieval) and the founder-execution requirement is already
correctly scoped in Q1.58/`FOUNDER_QUEUE.md` — `pg_cancel_backend` was
refused by the tool sandbox's own classifier when LCC tried it, which is the
guard working as intended, not a gap to route around.

**Held, not abandoned.** `rrf-sim-checkpoint.jsonl` was never created — 0
rows lost, confirming the checkpoint-before-run discipline cost nothing on a
real stall, same property `held:decompose` and `held:annprobe` already
proved. Resumes the moment pid 62315 clears; no code change needed to retry.

### Q1.50 · A TIMEOUT WAS BEING LAUNDERED INTO A PERMANENT "COMPLETE" ON THE LARGEST GAP IN THE CORPUS · NEW2, 15 Aug 2026

**The headline: `hc-load-cli` could not read Allahabad's large metadata parquet
files at all, reported success, and `supervise.mjs` then refused to ever run
that scope again.** Fixed, measured, verified in production.

#### How it was found

The machine rebooted again at 18:54. The fleet came back — the `%~dp0` fix from
Q1.49 worked, `hc-boot-*.log` files appeared three minutes after boot — and then
37 of 38 workers were alive but **`hc-boot-mid-9_13` was gone**. That is
Allahabad 2016–2022: 2,055,580 source documents, 0 held, the single largest
court-band gap we have.

It had not crashed. It had `worker finished cleanly after 0 restart(s)`.

    RESULTS
    DOCUMENTS SEEN    4,632
    MAPPED            3,787
    WRITTEN           3,787
         842  pdf_missing
           6  metadata_batch_unreadable

**4,632 documents seen against a 2,055,580 scope, and it called that done.**

#### Root cause, measured from the parquet footers rather than reasoned about

    metadata/parquet/year=2021/court=9_13/bench=cisdb_16012018/metadata.parquet
      row groups   1
      rows         351,704
      compressed   140.7 MB
      uncompressed 604.7 MB

**A row group is the smallest unit a parquet reader can decode.** Asking for
rows 200–400 of a 351,704-row group decodes the whole group and discards
351,504 rows. At `--batch 200` that is **1,759 full re-reads of a 140.7 MB
file — roughly 247 GB to ingest one file.** Every batch after the first blew the
300s metadata timeout.

Then three behaviours combined into a silent write-off:

1. on timeout the loader did `break` — abandoning **the whole file**, not the window;
2. having run out of files it printed its `RESULTS` sentinel;
3. `supervise.mjs`'s `finished()` matches `/^RESULTS/m` and never restarts a clean finish.

**A timeout became a permanent COMPLETE.** The checkpoint records it plainly: a
140,702,960-byte file abandoned at row offset **200**.

#### The second finding, which is the cheaper half of the fix

Per-column sizes from the same footer:

| column | compressed | uncompressed |
| --- | --- | --- |
| **`raw_html`** | **89.5 MB** | **441.5 MB** |
| `description` | 32.3 MB | 104.4 MB |
| everything the loader uses | **18.2 MB** | ~58 MB |

**`raw_html` is 73% of the file and nothing reads it** — the loader fetches the
PDF and extracts text itself. The needed set was extracted from
`toJudgmentRecord`'s own field accesses, not guessed: `pdf_link`, `title`,
`cnr`, `court`, `decision_date`, `disposal_nature`, `order_type`.

#### What changed

- **`hc-metadata.ts`** — new `rowGroupRanges(key)` (footer only, the method
  `hc:count` already proved on 1,493 files); `sampleRows` takes an optional
  `columns` projection.
- **`hc-load-cli.ts`** — reads **one row group at a time, projected**, then
  slices it in memory into `BATCH`-sized DB chunks. Row-offset checkpoint
  semantics are unchanged, so **every existing checkpoint stays valid**.
- **`break` became `continue`** on an unreadable window. One bad group no longer
  writes off its siblings — which is what turned a timeout into a COMPLETE.
- A footer read that fails falls back to one synthetic group, i.e. the OLD
  behaviour. A footer we cannot read is a reason to try the slow path, not to
  skip the file.

**Cost per file: 140.7 MB x 1,759 -> 18.2 MB x 1.**

#### Verified, not asserted

- typecheck exit 0 · **39/39 harvest tests pass**
- dry run against the exact previously-unreadable file: **completed in 70s**,
  mapped real 2021 Allahabad records, **`metadata_batch_unreadable` = 0** where
  it was 6
- `hc-boot-mid-9_13` relaunched on the new code and running with **0 unreadable**
- fleet writing **136,333 rows/hour across 16 courts** (`pnpm hc:fleet`)

**CAVEAT, stated plainly: 37 of 38 workers are still executing the OLD code**,
loaded into tsx before the edit. They inherit the fix on their next restart or
at the next boot. A request to stop them in bulk was denied by the tool
sandbox, and I did not work around it — the one worker that actually needed the
fix today was launched on it, and the rest are not currently blocked because
they have not yet descended into the large files.

#### A THIRD defect, found while fixing the second

**A stale `RESULTS` block makes a scope permanently unstartable.**
`supervise.mjs` checks `finished()` BEFORE the first launch and the log persists
across runs, so `hc-boot-mid-9_13` exited instantly on every relaunch, writing
nothing.

Rotating the log at fleet-launch time is the fix, and it is correct rather than
a workaround: **the AWS bucket updates DAILY, so a court that exhausted its
window yesterday has new documents today.** The supervisor's rule is about not
looping within a run; a new boot is a new run. One generation is kept as
`<scope>.prev.log`.

#### AND THE BOOT LAUNCHER HAD A SECOND DEFECT BEHIND THE FIRST

Q1.49 fixed `%~dp0`. That let the launcher actually start workers for the first
time — which immediately exposed the next one. At the 18:54 boot all 38 started
and **all 38 died 95 seconds later, simultaneously**:

    exit 3221225786 == 0xC000013A == STATUS_CONTROL_C_EXIT
    every log ending: ^CTerminate batch job (Y/N)?

`start "" /b` runs children **in the launcher's own console**. All 38 shared the
cmd.exe console the Startup folder created; when it went away Windows delivered
CTRL_CLOSE_EVENT to every process attached to it.

Fixed by moving the fleet into **`scripts/start-ingest-fleet.ps1`**, which uses
`Start-Process` — each worker gets its own hidden console the launcher's console
cannot reach. Same mechanism `LANE_PROTOCOL.md` §3b already documents.

> **A launcher that has never successfully launched anything has not been
> tested.** Both defects were latent for a day behind the fact that the first
> one stopped execution before the second could show.

#### AND A FOURTH, IN THE .cmd ITSELF — cmd parses REM lines

The rewritten `.cmd` emitted ~30 `is not recognized as an internal or external
command` errors and launched nothing. **cmd.exe processes redirection and escape
characters even on `REM` lines**, so `REM ... <repo>\hc-boot-<scope>.log` and
`REM ... ^CTerminate` desynchronised the parser and fragments of later lines ran
as commands.

`lawmind-citations-startup.cmd` has 46 non-ASCII characters and works fine, so
encoding was NOT the cause — the differentiator is angle brackets and carets.
The `.cmd` is now ~19 lines of plain ASCII and all prose lives in the `.ps1`.

**And the `.ps1` had its own encoding trap worth recording for every lane:**
written as UTF-8 **without BOM**, PowerShell 5.1 reads it as cp1252, so an
em-dash `E2 80 94` became `â€”` — and that last byte is `”` (U+201D), **which
PowerShell accepts as a string delimiter.** It closed a string early and the
enclosing `{` block never closed. Diagnosed with
`[Parser]::ParseFile`, fixed by writing a BOM.

> **Any `.ps1` in this repo that contains a non-ASCII character MUST be saved
> UTF-8 with BOM.** Without one, PowerShell 5.1 can turn a dash into a quote.

#### STILL OPEN

1. **LCC bus 0512 — page furniture spliced INTO sentences in `full_text`.**
   Karnataka 92.1%, MP 68.6%. This is my lane and it is the next task: it
   corrupts paragraph segmentation, chunking, citation spans and any passage
   shown to an advocate. LCC has extracted the vocabulary
   (`FURNITURE_PATTERNS` in `enrich-triage.ts`) and is not blocked on it.
   NOT started this session and not verified independently yet.
2. Roll the parquet fix onto the other 37 workers (next restart or boot).
3. 2024 still has no dedicated worker on any large court.

### Q1.59 · ALL FIVE DEEPSEEK TASKS MEASURED — FOUR CLEARED TO 1,000, ONE HELD · LCC, 15 Aug 2026

`DONE:` every one of the five legal-object tasks run at 100 documents and
triaged against the SAME (post-fix) verifier, so the safety gate rests on
measurement rather than on the one task that happened to be measured first.
`VERIFY:` `docs/ai/ENRICHMENT_REJECTION_TRIAGE.md` §7; per-task JSON in
`.agents/triage-*.json`.

| task | claims | rate | ingest | model | **fabrication** |
| --- | ---: | ---: | ---: | ---: | ---: |
| `topics` | 840 | 83.9% | 65.2% | 28.9% | **0.48%** |
| `authorities` | 580 | 83.3% | 67.0% | 33.0% | **0.00%** |
| `case_structure` | 1,289 | 81.9% | 64.4% | 33.9% | **2.33%** |
| `holding` | 789 | 81.5% | 75.3% | 23.3% | **0.13%** |
| `arguments` | 621 | 78.4% | 75.4% | 23.9% | **0.00%** |

**THE HEADLINE RATE WOULD HAVE MISLED US.** Verification is flat at 78–84% across
all five; **fabrication varies by a factor of eighteen**, and 30 of the 35
fabrications in the whole programme are in `case_structure` alone. Ranking tasks
by verification rate puts `case_structure` mid-pack and hides it completely.

**The cause is the task shape, not the model.** `case_structure` asks for a
NARRATIVE — what happened, in what order. The other four ask the model to locate
something the court already stated: its holding, the relief granted, the
authority relied on, a contention attributed to a side. Its worst kind, `fact`,
is 8.9% model-owned and is the most narrative field in the programme.

**GATE — cleared to 1,000:** `holding`, `arguments`, `authorities`, `topics`.
**HELD at 100:** `case_structure`, pending a narrower `fact` prompt aimed at the
court's own recital, then re-measure at 100. Holding it is a TOKEN decision, not
a safety one.

**What the gate does NOT claim:** all 35 fabrications were caught and dropped by
the span check. None entered any table as fact; no route reads
`document_enrichments`; `0045`'s boundary is untouched. This gate governs token
efficiency and dataset quality, not product safety — the span check governs that,
and it held on every one.

**Named limit:** 100 documents/task from the classified substantive population,
Karnataka- and Kerala-heavy. The pre-2016 tranche NEW2 started on 14 Aug — older
scans, worse OCR, no neutral citations — is in **none** of these numbers, and the
ingest-owned share is exactly what it should be expected to move.

### Q1.60 · THE MISSING SPACE IN `normaliseCitation` — fixed, and SCC is 3.5x the half NEW3 measured · LCC, 15 Aug 2026

`INTENT: normaliseCitation COLLAPSES whitespace but never INSERTS it, so
"(2017) 11SCR1036" and "(2017) 11 SCR 1036" key differently; NEW3's measurement
(bus 0499) expects them to be one authority; citations.ts's own header says the
normaliser exists so the same authority folds to one normalised_citation, and
citations.test.ts asserts it for the year-first form. X, Y and Z agree — the code
fails at the thing the spec says it is for.`

`VERIFY:` `citations.test.ts` — three new cases, 35/35 in the file, 472/474 across
`services/ingest` (2 pre-existing skips), `tsc` clean.

**Verified before fixing, not taken on report.** NEW3 named the SCR case.
Measured over unresolved `judgment_citations`, the vocabulary is a **closed set of
three**, and NEW3 had the smaller half:

| token | digit-then-token | token-then-digit |
| --- | ---: | ---: |
| **SCC** | **1,749** | **1,588** |
| SCR | 450 | 481 |
| SCALE | 19 | 26 |
| AIR · JT · CriLJ · SCC OnLine | 0 | 0 |

**Why it survived this long:** `resolve-cli`'s bulk sweep strips every
non-alphanumeric before comparing, so it was immune. The **inline** resolver in
`citations-cli.ts` (`index.get(c.normalised)`) was not. The defect only ever
showed as edges one path resolved and the other did not — which is exactly the
shape NEW3 reported.

**Deliberately narrow.** A generic "insert a space before any letter run" rule
would rewrite `2023:DHC:2720` and every other neutral citation; tests assert both
those and `SCC OnLine` are untouched, and that the inserted space never merges two
different authorities.

> ⚠ **REQUIRED FOLLOW-UP, AND NOTHING SHOULD RE-EXTRACT UNTIL IT EXISTS.**
> `judgment_citations_unique_edge` is keyed on `normalised_citation`. Rows written
> before this change hold the old unspaced key. A re-extraction computes the new
> key, misses it in the `known` set `citations-cli.ts` builds from stored rows,
> and writes a SECOND edge for the same authority — the double-counting the
> year-first rewrite exists to prevent, arriving by a new road. The backfill must
> also handle **two old keys collapsing onto one new key**, which is a unique
> violation rather than a no-op. Not written this session; the code fix is inert
> until extraction next runs over already-extracted judgments.

---

## NEW2 · 15 Aug 2026 — the fleet can now be paused and resumed on purpose, and page furniture is 25 courts rather than a few

Written while preparing NEW2's side of the Railway → local PostgreSQL cutover.
Everything below was observed, not inferred; where a number disagrees with an
earlier one in this repo the disagreement is stated rather than quietly
overwritten.

### NEW2.1 · GRACEFUL PAUSE AND VERIFIED RESUME — LANDED, REHEARSED TWICE

`DONE: the write fleet stops on request at a batch boundary and resumes without
losing position | VERIFY: scripts/fleet-stop.ps1 prints "0 regressed · 0
unreadable"; scripts/fleet-resume.ps1 prints "RESUMED — verified by row growth"`

Windows has no SIGTERM, so every stop this fleet had ever taken was a
`TerminateProcess` landing wherever the worker happened to be. Survivable while
the database was staying put; the wrong thing to rely on while the database is
being REPLACED. The pause is now cooperative:

| file | part |
|---|---|
| `services/ingest/.checkpoints/STOP` | the sentinel; only `fleet-stop.ps1` writes it |
| `hc-load-cli.ts` `stopIfRequested` | harvester exits 0 at a BATCH boundary |
| `hc-classify-cli.ts` `stopIfRequested` | classifier exits 0 at a PAGE boundary |
| `scripts/supervise.mjs` | does not restart while STOP exists |
| `scripts/fleet-stop.ps1` | snapshot → STOP → wait → re-read every checkpoint, prove no offset regressed |
| `scripts/fleet-resume.ps1` | remove STOP → relaunch → **verify by row growth** |

Rehearsed on the live 38-worker fleet: **152 processes → 4 in about 30 seconds**,
all voluntary, `0 offsets regressed · 0 checkpoints unreadable`. Resume verified
at +3,286 rows in 60s.

**The four that would not stop were the classifier**, because only the harvester
had the hook. Found by rehearsing rather than reading — `fleet-stop.ps1` waits
and counts instead of assuming, which is the only reason it was visible. Fixed,
and the rule generalises: *a pause that leaves a writer running is not a pause.*

**The switch reaches LCC's lane.** `supervise.mjs` runs their paragraph and
citation workers too, so STOP stops those as well. Deliberate — a cutover has to
quiesce every writer — and sent to LCC on the bus (0549) rather than slipped in.
`fleet-stop.ps1`'s default wait/kill set is NEW2-only; `-IncludeAllLanes` is
opt-in and LCC's to authorise.

### NEW2.2 · CHECKPOINT WRITES WERE NOT ATOMIC — FIXED

`saveCheckpoint` used `writeFile`, which TRUNCATES before writing, and
`loadCheckpoint` swallowed every error into `{}`. A kill inside that window — the
migration pause, or either of the two unclean reboots this machine took on 15 Aug
— left an unparseable file, and that court silently resumed **from offset 0**.

Now write-then-rename (atomic on NTFS), and a file that will not parse is
preserved to `.corrupt-<ts>` and shouted about instead of being overwritten by
the next save. **No corruption was found on disk when this was fixed: the defect
was latent, and it is recorded as latent.**

The header's own claim that a lost checkpoint "costs at most a little
re-scanning" is *correct* — `source_url` is unique, so a re-scan is safe — and
wrong about the price at 34 concurrent workers with offsets in the tens of
thousands.

### NEW2.3 · THE LAUNCHER COULD NEVER RUN WHILE A FLEET WAS UP — FIXED

`lawmind-ingest-startup.cmd` ended with `>> "%TEMP%\lawmind-ingest-boot.log"`. A
cmd redirect creates an **inheritable** handle; powershell and then all 38 workers
inherit it and hold it for weeks. So while a fleet was up the log was exclusively
locked *by the fleet itself*, and the launcher died at the redirect with
`The process cannot access the file…`, exit 1, **having launched nothing**.

Consequences, all live the whole time:

- the per-scope duplicate guard had never once been exercised;
- a scope whose supervisor had exited could not be recovered without killing all
  of `node.exe` first — **five were sitting dead in exactly that state**;
- it does NOT bite at boot, which is why two reboots' evidence never showed it.

The `.ps1` now owns its log via `Add-Content` (opens, appends, closes — nothing
to inherit) and the `.cmd` has no redirect. First run after the fix:
`started 5 · skipped 33 (already running)`, exit 0 — the guard's first working day.

### NEW2.4 · PERSISTENCE — THE 18:55 REBOOT WAS A FAILURE, NOT A PASS

The Startup launcher DID execute after the 18:55 unclean reboot and started
**nothing**: `start-ingest-fleet.ps1` did not parse (`Missing closing '}'`,
line 50). The fleet came back 21 minutes later because a human fixed the script
and ran it. `%TEMP%\lawmind-ingest-boot.log` holds both runs — the parse error
first, `started 38` second.

**A parse check is not sufficient, and that was measured today.** A later edit of
mine passed `[Parser]::ParseFile` cleanly and still failed on execution, because
prose left outside a comment block parses as a command invocation. The acceptance
test remains what `RING_PROGRAM.md` says it is: a real reboot, followed by rows
landing. **Still owed. Do not mark persistence green on this section alone.**

### NEW2.5 · PAGE FURNITURE — VERIFIED, WIDER THAN REPORTED. BUILT, NOT APPLIED

`DONE: a source-aware cleaner that provably removes no legal text | VERIFY: tsx
src/harvest/furniture-report-cli.ts prints "FOREIGN … : 0"; 17 tests in
page-furniture.test.ts`

Two corrections to bus 0512, both of which make it *more* fixable:

1. **It is whole-line, not spliced mid-sentence.** `full_text` retains newlines.
   Measured across 4,000 documents and 25 courts: **25,134 own-line occurrences
   against 5 genuinely mid-line — 99.98%.** LCC saw it as mid-sentence because
   enrich-triage flattens whitespace before comparing. This is what makes a safe
   cleaner possible: it never edits inside a line of prose, so the flowed-text
   regexes (which eat `paragraphs 12 - 15 -`, and real citations) are not needed.
2. **Kerala is 97.2%, not 2.4%, and this is not "a few courts".** Meghalaya 100 ·
   Orissa 100 · Karnataka 98.5 · Jharkhand 98.4 · Chhattisgarh 97.5 · **Kerala
   97.2** · Madras 96.9 · Gujarat 96.8 · MP 94.5 · Manipur 94.1 … Rajasthan 1.5.
   Corpus-wide, **2.76% of all non-empty lines**.

`services/ingest/src/harvest/page-furniture.ts` is line-anchored, pure, and writes
nothing. Measured on 1,500 documents: 0.71% of characters removed, **40 citations
lost of which FOREIGN = 0** — every one the document's own neutral citation, so no
edge existed to lose.

Two false-positive families were found by PRINTING what would be deleted and
reading it, not by reasoning: a signature rule with a free-text tail ate prose
that merely starts `signed by…`; and **a case-number line is furniture only when
it repeats** — `C.S. No.13 of 1958` once is a reference to another matter, on
every page it is a running header. Both are pinned by tests.

> ⚠ **ORDERING CONSTRAINT — the one way this destroys something irreplaceable.**
> `neutralCitationFrom` derives `judgments.neutral_citation` by scanning the first
> 3,000 characters of `full_text`, and by its own comment that is "the whole
> reason 2023+ documents are citable at all". **The cleaner must never run before
> ingest maps the record.** On already-ingested rows the column is persisted and
> nothing is lost; ahead of `toJudgmentRecord` a citable judgment silently becomes
> uncitable with nothing to recover it from. Two tests pin this. A first draft of
> the module asserted the opposite — that the column came from harvest metadata —
> and checking it is the only reason this warning exists.

**NOT APPLIED, deliberately.** Rewriting 6.9M stored `full_text` values in place
destroys the source artifact irreversibly. Proposed to LCC (0549): cleaned text in
a new column so raw survives, backfilled worst-court-first, then enrichment rerun
on that set. Migration and column shape are LCC's.

### NEW2.6 · RAILWAY — THE AUDIT IS CLEAN, THE DATABASE IS DEGRADING

Cutover audit: **no `DATABASE_PUBLIC_URL` anywhere in the repo**, no Railway
hostname on any code path or command line — the string appears only in comments
recounting past DNS failures. **`.env` is the single point of change.** No running
worker carries a connection string on its command line.

Both of the situational claims first written here were wrong within the hour, and
both are corrected in place rather than deleted, because the *reason* they were
wrong is the lesson:

- ~~There is no local PostgreSQL on this machine.~~ **WRONG BY 20:40Z.** LCC
  stood one up at 23:08 local — `C:/lawmind/pgsql`, `C:/lawmind/pgdata`, 53
  tables restored. True when measured, stale within two hours: another lane was
  working the same problem and the bus said so.
- ~~Railway is degrading.~~ **WITHDRAWN.** The evidence was real — `count(*)`
  taking **48 s** with the fleet down and 8 connections, throughput down ~6x —
  but the inference was not. **LCC's `pg_dump` was saturating a proxy they had
  already measured at 4–6 MB/s**, and that was not considered because the dump's
  existence was sitting unread on the bus. Do not quote the degradation figure;
  re-measure after cutover.

### NEW2.6a · THE FREEZE WAS BROKEN, BY THIS LANE

`LCC executed a write freeze at 19:24Z (bus 0547). At ~19:40Z NEW2 found the
fleet at zero processes, diagnosed a Railway-degradation death, and restarted all
38 workers. 0547 was already waiting on the bus, unread.`

**301,422 `judgments` rows were written after LCC's baseline** (308,732 after the
freeze timestamp; the difference is in-flight work from LCC's own kill). Window
19:40Z → 20:32:54Z, closed by writing `.checkpoints/STOP` and verified with
`fleet-stop.ps1 -IncludeAllLanes`: `PAUSED CLEANLY · 0 regressed · 0 unreadable`,
and LCC's own `activity.mjs` gate showing no ingest backend left.

**The row-count check is probably unaffected, and that is not the danger.**
`dumpSnapshotLsn 195/21C52000` sits between LCC's two baseline LSN samples, so
`pg_dump`'s repeatable-read snapshot predates the restart and excludes every row
written. The damage points the other way:

Three recoveries were offered to LCC (0556): a fresh baseline and dump; a targeted
export of `created_at > '2026-08-15T19:33Z'`; or rolling the affected checkpoints
back to re-harvest from AWS.

**RESOLVED by LCC in bus 0558 — DO NOT REWIND ANY CHECKPOINT.** My skip analysis
was correct about the *original* `pg_dump` and wrong about the world, in my
favour, for a reason I had no way to see:

| | |
|---|---|
| my last write | 20:32:54.788Z |
| fleet-stop completed | ~20:34Z |
| **replacement chunked dump opened** | **20:39:05.954Z** |
| first `judgments` chunk | 20:44:51.556Z |

LCC's first dump **died at 42 minutes** (`PQgetCopyData() failed`, the proxy
dropping a long-lived connection; `pg_dump` has no resume). Its replacement,
`scripts/migration/dump-chunked.mjs`, reads the source live in 626 ledger-tracked
chunks — **every chunk taken after my last write**, so it captures all 301,422
rows. LCC re-counted the frozen source at **7,296,068** against a baseline of
6,994,646: delta 301,422, my figure to the row.

Rewinding would therefore re-fetch 301,422 documents that are already coming
across, and `source_url` uniqueness would absorb them as duplicates — days of
proxy time for nothing.

> ⚠ **THE REWIND IS NOT CANCELLED, IT IS CONDITIONAL.** LCC named the test rather
> than asking to be believed: after cutover the local count must read
> **7,296,068**. If it reads **6,994,646**, the old baseline came across, those
> documents are absent, the checkpoints *do* point past data the local database
> lacks, and the rewind is back on. `scripts/migration/verify-local-canary.mjs`
> check 1 is that test, and it names both numbers explicitly so the failure is
> unambiguous.

**LCC also owned their half:** the freeze was executed by `taskkill` and
announced afterwards, so a fleet at zero was indistinguishable from the Railway
deaths that evening. The STOP-file mechanism is now what holds the freeze.

**The process rule this earns:** *a fleet at zero has two explanations, and one
of them is on the bus.* Read the bus before restarting anything.

### NEW2.7 · NEXT, in order

1. **Wait for LCC's cutover window.** Confirmed by LCC in bus 0542: the dump is
   `pg_dump --format=directory`, takes hours, and a second message names the
   freeze. *"Not yet — keep working."* Source is PostgreSQL 18.4 / 103.9 GB,
   target 18.6 local. Railway is not deleted until the local copy AND the R2
   backup are both independently verified, so rollback stays available.
2. On the window: `fleet-stop.ps1 -IncludeAllLanes` (LCC's authorisation for the
   flag is the freeze message itself — the switch stops their workers too),
   confirm `0 regressed · 0 unreadable`, hand over.

   **The DB-side gate is LCC's, not mine, and `fleet-stop.ps1` now runs it:**
   `node scripts/migration/activity.mjs --require-quiet`. Everything else the
   script checks is about processes and files, and none of it can see a backend
   still holding an open transaction — which is the thing that actually breaks a
   migration, because a table taking inserts during the final sync is the one
   that fails its row-count check.

   It deliberately does **not** set the script's exit code. Run live, it reports
   NOT QUIET because of LCC's own orphaned backend **pid 62315, stuck 20.9 h**
   with 131,125 citation edges behind it — nothing to do with the ingest fleet.
   Failing NEW2's pause on another lane's stuck transaction would be a false
   alarm on every run.

   **`judgments` was 6,994,646 and climbing**, so the final row-count check needs
   a count taken *inside* the freeze, not against the Stage A manifest.
3. After the repoint: **canary first** — one recent, one 2016–2022, one historical
   — verify reads, writes, checkpoint advance, duplicate suppression,
   classification, latency and **no Railway traffic**, then scale by measured
   docs/hour rather than to a worker count. 38 is not sacred.
4. Then page-furniture application, with LCC, under the ordering constraint above.
5. Coverage remains the mission: 2016–2022, pre-2016, 2023–2024.

**Do not start embeddings.**

---

# M · RAILWAY → LOCAL POSTGRES MIGRATION — IN FLIGHT, 15–16 August 2026

**Founder cost directive: LawMind is pre-revenue and Railway's burn is not
acceptable. Stop routine Railway billing while preserving the entire data
moat.** Owner: LCC. Full record: `docs/ops/migration/MIGRATION_RUNBOOK.md`.
Founder actions: `docs/ops/migration/RAILWAY_SHUTDOWN.md`.

**This supersedes nothing in the Phase-1 queue.** It exists to make Phase 1
affordable. No embeddings, no Phase 2, no schema changes.

## M0 · STATE AS OF 20:08Z 15 Aug

| stage | state |
| --- | --- |
| A · inventory | ✅ `manifest-railway-stage-a.json` — PG 18.4, 103.9 GB, 53 tables, 167 indexes |
| B · local target | ✅ PG **18.6** on NVMe, `pg_trgm 1.6` + `vector 0.8.5` matched exactly, loopback only |
| C · method chosen | ✅ pg_dump directory + zstd:3. Logical replication measured and REJECTED — `wal_level=replica`, and it would not have been faster |
| D · write freeze | ✅ **19:24Z** — 37 supervisors, 193 processes. Quiescence proven by **zero row delta over 60s**, not by process list |
| E · dump | 🔄 **running**, ~3.95 MB/s logical, projected 5–8 h |
| F · verify | ⏳ tooling built and rehearsed |
| G · cutover | ⏳ one env var — every service reads `DATABASE_URL` |
| H · rollback proof | ⏳ Railway stays up, untouched |
| I · shutdown pack | ✅ written, deliberately unusable until F passes |

**Freeze baseline — the numbers the copy must match**
(`docs/ops/migration/freeze-baseline.json`):
`judgments` **6,994,646** · `judgment_paragraphs` **27,967,835** ·
`judgment_citations` **1,734,857**.

## M1 · WHAT THIS COST, STATED PLAINLY

**Ingestion is stopped for the duration.** Real documents not acquired. The
directive settled the trade in advance: *"prevent data loss and stop Railway
billing permanently, not maximize documents during a few migration hours."*
Fleet config is preserved in `fleet-inventory.json` — the only copy, since it
previously existed nowhere but in running processes.

## M2 · FINDINGS THAT OUTLIVE THE MIGRATION

Each cost something to learn and applies beyond this task.

1. **`0xC000013A` — a Windows server started from an agent shell is killed by
   console signals.** Not a crash; `STATUS_CONTROL_C_EXIT`. `spawn(detached)` is
   NOT sufficient. Anything long-running on this machine must be started by
   Task Scheduler. This would have destroyed a multi-hour restore and the
   wreckage would have looked like corruption.
2. **Windows commit limit, not RAM, bounds `shared_buffers`.** 8 GB refused with
   `error code 1450` at 41.9/48.9 GB committed. The manual independently
   recommends low `shared_buffers` on Windows. Two roads, same answer.
3. **`LIMIT 1` after an aggregate samples nothing.** It scans the whole join
   first. The same class of mistake as `LEGAL_OBJECT_PROGRAM.md` §3.
4. **THE 15.5 GB FULL-TEXT GIN INDEX IS NOT BEING USED ON RAILWAY — NEW1 should
   read this.** `judgments_full_text_idx` is valid, ready, live and has 16,109
   lifetime scans, but the planner now costs a GIN scan (2,140,301) above a
   parallel seq scan of 6.4M rows (1,060,274) — **even for a term it estimates
   at one matching row**. Railway runs `random_page_cost = 4`, the spinning-disk
   default; the local cluster is set to **1.1** for NVMe. **Prediction to check
   after restore: local chooses the index where Railway does not.** Not a claim
   until measured.
5. **Run a new test against the KNOWN-GOOD database first.** The smoke test
   reported the GIN index unused, and the first two times it was the test that
   was wrong — first the wrong predicate (the index is on a stored
   `full_text_tsv` column, not `to_tsvector(full_text)`), then a bad invariant.
   A test that has only ever run against the database it is judging cannot tell
   "target broken" from "test wrong".
6. **The three citation-state fields are NOT on `judgment_citations`.**
   `verification_state`/`verified_by_source` live on `verification_cache` and
   `citation_checks`; `overruled_status` is on `judgments`. `judgment_citations`
   is the citation GRAPH. Assumed once, corrected against the manifest.

## M3 · CORRECTIONS TO §M0–M2, from actually running it

**§M0's stage table and §M2's findings were written mid-flight and three of them
are now wrong. Corrected here rather than edited above, per this file's
convention.**

### M3.1 · The monolithic dump FAILED. The design changed.

`pg_dump --format=directory` died at 42 minutes, 2.15 GB of ~25 GB:
`PQgetCopyData() failed — server closed the connection unexpectedly`. Railway's
postmaster uptime was **316.8 hours across the failure**, so the server never
restarted; the proxy dropped a long-lived connection. **pg_dump has no resume.**

Replaced by `scripts/migration/dump-chunked.mjs` — 626 chunks over UUID key
ranges, ledger-tracked, retried with backoff, restartable. A dropped connection
costs one chunk. Restore is `pre-data` → chunks → `post-data`, the same order
`pg_restore` uses internally, so FKs are still built after the rows land.

**Concurrency 3 measured at 4.09 MB/s against 1.38 single-stream** — a 3x gain.
The earlier 4-stream probe predicted only 1.6x because it was taken while 20
ingest workers competed for the same proxy.

### M3.2 · THE BASELINE IN §M0 IS SUPERSEDED — 7,296,068, not 6,994,646

The first freeze was executed by `taskkill` and **announced afterwards**. NEW2
found their fleet at zero, correctly diagnosed it as one of the Railway deaths
they had genuinely been seeing, and restarted 38 workers. **301,422 judgments
landed before the window closed.** They self-reported with exact numbers; the
count reproduces to the row.

**The chunked dump began after the last write, so those rows ARE captured** — the
local copy must read **7,296,068**. `docs/ops/migration/freeze-baseline.json`.

> **A freeze announced after it is executed is not a freeze — it is an outage
> that looks exactly like the failure everyone already expects.** NEW2's STOP
> file (`services/ingest/.checkpoints/STOP`, checked by `supervise.mjs`) is the
> correct instrument and now holds the freeze.

### M3.3 · "Railway is degrading" was withdrawn — it was our dump

A 48-second `count(*)` and a 6x throughput drop circulated on the bus as vendor
degradation. **The cause was our own pg_dump saturating the shared proxy**; the
same count took 12 seconds once it died. Retracted by NEW2 before it became a
planning fact. **A number about a vendor that is really a number about us is the
easiest wrong fact to propagate.**

### M3.4 · psql on Windows corrupts binary COPY read from stdin

`ERROR: COPY file signature not recognized` on a file whose header was a textbook
`PGCOPY\n\377\r\n\0`. **psql translates CRLF on stdin**, and the signature
contains one. Fix: `COPY ... FROM PROGRAM`, server-side, no client stream.
The dump direction was checked separately and is binary-safe.

**The dangerous shape**: the header failed loudly, but the same translation in
the middle of 74 GB would have been found weeks later, if at all.

### M3.5 · Still true from §M2, and now handed to NEW1 (bus 0559)

The 15.5 GB `judgments_full_text_idx` is valid, ready, live, has 16,109 lifetime
scans — and the planner refuses it, taking a parallel seq scan of 7.3M rows
instead, **even for a term it estimates at one row**. `random_page_cost` is 4.0
on Railway and 1.1 locally. **Prediction to check after cutover, not a claim.**

### NEW1.M · THE POST-MIGRATION GATE IS BUILT AND WAITING — 16 Aug 2026

**`pnpm --filter @lawmind/harness gate:postmigration`.** Written during the
restore window so the gate costs minutes on arrival of
`LOCAL_READY_FOR_POST_MIGRATION_GATE` rather than being designed then. Full
account: `docs/ai/PRE_MIGRATION_RETRIEVAL_BASELINE.md` §7.

| | |
|---|---|
| classes covered | **A–H**, the post-migration directive's own eight |
| new gold invented | **none** — §4/§5 of the baseline, `deployed-safety.ts`'s three standing probes, `freeze-baseline.json` |
| unit tests, no DB | **43, every FAIL branch exercised on purpose** |
| Railway | **refused before a connection is opened.** Allowlist of local hosts, not a denylist of Railway names; `DATABASE_PUBLIC_URL` refused by variable NAME. Observed: exit 2, `REFUSED — no connection was opened` |
| graded as an equality | `judgments` = **7,296,068**. Fewer = rows lost. **MORE = something wrote to local**, which breaks the comparison the gate rests on |
| recorded, never graded | latency, `random_page_cost`, whether the planner CHOOSES `judgments_full_text_idx` locally — §M3.5's prediction gets its measured answer here |

**Class H answers §M3's generated-column defect behaviourally, without touching
a canonical row.** `CREATE TEMP TABLE (LIKE judgments INCLUDING GENERATED) ON
COMMIT DROP` → INSERT → UPDATE → ROLLBACK. If the real column had lost its
generation expression, the clone's column would be ordinary and the INSERT would
leave it NULL — so the clone tests the SOURCE's semantics, not its own. Both
stored generated columns are covered (`judgments`, `statute_sections`).

Two additive one-line changes outside this lane: `services/api/package.json`
gained `./search/structured` and `./judgments/paragraphs` exports, so the gate
calls `answerStructured` and reuses `resolveExactSpan` instead of
re-implementing either. No API behaviour changed.

### NEW1.M2 · `exactCaseTitle` IS UNINDEXABLE AND 57% OF SEARCHES FIRE IT — 17 Aug 2026

**Found by static reading during the restore hold; MEASUREMENT IS OWED, and it
is the first thing to run once the gate passes.** Labelled INFER where it is
inferred — the database this needs `EXPLAIN` against does not exist yet.

`exactCaseTitle` (`services/api/src/search/retrieve.ts`) matches on

```sql
lower(btrim(regexp_replace(j.case_title, '\s+', ' ', 'g'))) = lower(btrim(regexp_replace($1, ...)))
```

**KNOW — the one index on that column cannot serve that predicate.**
`judgments_case_title_trgm` is `gin (case_title gin_trgm_ops)` (migration
`0026`, 780 MB per `STORAGE_AUDIT.md`). It indexes the **bare column**; the
predicate's left side is a *function* of the column, and Postgres only matches
an index whose own indexed expression appears. No expression index on the
normalised form exists in `packages/db/drizzle` or `schema.ts`. **INFER: a
sequential scan of 7,296,068 rows, on the `/search` hot path, against Gate S1's
3-second budget.**

**What makes it matter rather than merely exist — already in this file, at
Q1.25, never connected to the index question.** `CASE_NAME_RE` misclassifies
**161 of 283** gold queries as `case_name` shape, so **~57% of searches fire
this query**, most of them on reasoning passages that merely contain a bare
`versus` token. The same section records that a 161-round-trip check of this
predicate **hung for 12 minutes with zero CPU progress** and had to be rewritten
as one batched query — that is empirical support for the cost, from this repo,
already written down.

**Not fixed, and not fixed unilaterally.** `retrieve.ts` is `services/api`.
Candidate remedies in preference order, all cheap, none chosen: an expression
index matching the predicate byte-for-byte; normalising the title into a stored
column at write time and indexing that; or tightening `CASE_NAME_RE` so the 57%
stops being fired at all — which costs no index and is the only one that also
fixes the 161 misclassifications. **Order of work: measure with `EXPLAIN
(ANALYZE)` locally first.** Q1.25's pin is live-verified and stays; this is
about what it costs, not whether it is right.

**Three traps on the local cluster, from NEW2 bus 0580/0586, all handled — see
`PRE_MIGRATION_RETRIEVAL_BASELINE.md` §7.**

1. **`judgments` may not be the table holding the corpus.** LCC's rebuild loads
   into `judgments__stage`, so pre-completion the gate would have graded a short
   or empty table and announced lost data. Now a PRE-FLIGHT **refusal** (exit 2,
   never a FAIL) keyed on the stage table EXISTING — not on `judgments` being
   empty, which a mid-refill crash disproved within the hour by leaving it
   *partially* filled. A row count then separates an unfinished load (refuse)
   from a completed one whose artefact was not dropped (note, proceed), so the
   guard does not depend on anyone else's cleanup step.
2. **The crash discarded the statistics collector** — `reltuples`/`n_live_tup`
   read -1/0 corpus-wide, including a 22 GB table. The gate was already
   `count(*)`-only; `held-not-retrieved-cli.ts` was not, and now prints
   `not analyzed` rather than `~-1`.
3. **`LawMindPostgres` records `LastTaskResult: 1` for a SUCCESSFUL start** —
   `pg_ctl -w -t 120` times out on a 150.86 s crash recovery. LCC's to fix
   (NEW2 bus 0585); noted so a `1` is not read here as a dead cluster.

**One defect of the same family found and fixed inside the gate itself.**
Class G asked `count(*) WHERE case_title = $1` **once per candidate, 25 times**.
Now one grouped `= ANY(...)`. Bounded either way, and it does not depend on
resolving whether `gin_trgm_ops` serves bare equality on this Postgres version —
which is deliberately not assumed anywhere. 43 unit tests still pass; harness
typechecks clean.

### NEW2.8 · RAILWAY EXIT HOLD — the state to resume from, 16 Aug 2026

**The fleet is frozen and must stay frozen until LCC sends
`LOCAL_DATABASE_CUTOVER_APPROVED`.** Verified, not assumed:

| | |
|---|---|
| ingest workers alive | **0** |
| `.checkpoints/STOP` | **present** — do not delete it |
| checkpoints | **49 files, 0 unparseable**, 0 stray `.tmp`, 0 `.corrupt-*` |
| Railway connections held by ingest | **none** (the live ones are LCC's `psql` dump) |

**The rule that earned itself:** *a fleet at zero has two explanations, and one of
them is on the bus.* Never restart on a "workers are zero" observation. Read the
bus first. This is what broke the last freeze.

#### The read-only inventory

`scripts/migration/new2-checkpoint-inventory.mjs` → `docs/ops/migration/new2-checkpoint-inventory.json`.
**Opens no database connection by construction** — during the exit hold the source
must not be touched, and an inventory needing a query would be unrunnable exactly
when it is needed.

| band | scopes | source files | max offset |
|---|---:|---:|---:|
| recent (2016+, unbounded) | 26 | 281 | 172,800 |
| pre-2016 | 10 | 86 | 110,668 |
| 2016–2022 | 6 | 36 | 176,600 |
| y2023 | 6 | 22 | 443,845 |
| y2024 | 1 | 1 | 4,334 |
| **total** | **49** | **426** | |

Each scope's inferred year window is cross-checked against the actual command
line LCC captured in `fleet-inventory.json` — the only surviving record, since
those arguments lived nowhere but the process table. **0 mismatches.** 14 scopes
have no captured command line, which is expected: their supervisors had already
exited before LCC's 19:25Z snapshot.

#### The canary, prepared and NOT launched

`scripts/start-local-canary.ps1` — three workers, one per band, chosen from the
inventory as scopes with a real stored offset so each exercises **resume**:

| scope | band | court |
|---|---|---|
| `hc-boot-10_8` | recent | 10_8 |
| `hc-boot-mid-27_1` | 2016–2022 | 27_1 |
| `hc-boot-hist-27_1` | pre-2016 | 27_1 |

They reuse the fleet's own scope names and checkpoints deliberately — a canary on
fresh checkpoint names would start at offset 0 and test the wrong thing.
Concurrency 8, below the fleet's 16/32, because a saturated NVMe hides the
latency signal the scale-up decision needs.

**`DATABASE_URL` is injected per-child from `LOCAL_DATABASE_URL`, never by editing
`.env`.** Flipping `.env` repoints every lane at once and would overwrite the
rollback LCC deliberately parked there.

Four refusals, all verified by execution rather than by reading:

1. refuses while `.checkpoints/STOP` exists (**tested — exit 1**);
2. refuses unless `LOCAL_DATABASE_URL` is a loopback address;
3. refuses if that URL mentions a Railway host;
4. refuses if `DATABASE_PUBLIC_URL` is set (**tested — exit 1**).

`-WhatIf` lists the three and launches nothing (**tested — exit 0**, target
resolved to `127.0.0.1:5432`).

#### The verification that gates scaling

`scripts/migration/verify-local-canary.mjs` — seven checks, loopback-only and
refusing any remote target, because a verification that could be pointed at
Railway would pass while proving the opposite of what it claims.

1. **restore completeness** — `7,296,068` expected; `6,994,646` means the rewind
   is back on (see NEW2.6a)
2. local inserts (two samples) · 3. checkpoint advance · 4. `source_url` unique
   index present · 5. text extraction · 6. classification
7. **no Railway traffic — attributed by owning process.** A first version failed
   on any live Railway connection and reported six, every one LCC's `psql` dump
   doing exactly its job. A check that is red for the whole window it polices
   gets ignored. It now fails only on a connection owned by a node process
   running harvest or classify code.

Run pre-cutover it fails 4 of 7 with precise reasons — which is the correct
answer today, and the reason it is trusted to be meaningful tomorrow.

#### Order after `LOCAL_DATABASE_CUTOVER_APPROVED`

1. Read the bus. Confirm the approval is real and current.
2. Delete `.checkpoints/STOP` — the one deliberate act that ends the freeze.
3. `start-local-canary.ps1`, then `verify-local-canary.mjs`. **Check 1 decides
   whether the checkpoint rewind is needed.**
4. Only on a clean pass, scale — **by measured docs/hour, not to 38.** Measure
   CPU, RAM, NVMe IO, Postgres waits, network, docs/sec, and pick the worker
   count that maximises verified documents/hour without thrashing the
   workstation. LANE_PROTOCOL.md §3b still applies: group live pids by argument
   and assert `count == 1`.
5. Coverage priority unchanged: 2016–2022, remaining pre-2016, 2023–2024, recent.
6. Page furniture only after cutover, re-validated independently, and only then
   tell LCC to re-enrich.

**No embeddings. No competitor ingestion until cutover completes.**

## M4 · POST-MIGRATION TASK 1 — resolve-cli.ts CORPUS_KEYS must be fixed BEFORE the resolver is re-run

**Root cause supplied by NEW1 (bus 0523), verified by LCC against the file.**
Recorded here rather than fixed now: the founder's Railway-exit directive
authorises only migration-critical work, and this is not it. But §14 makes the
citation resolver the **first** post-Railway task, so it must not be re-run
before this is understood.

`services/ingest/src/resolve-cli.ts`, `CORPUS_KEYS` (lines 95–105):

```sql
SELECT upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) AS k, j.id, rc AS src
FROM judgments j, unnest(j.reporter_citations) rc
WHERE rc <> ''
UNION ALL ... FROM judgments j WHERE j.neutral_citation IS NOT NULL ...
```

**This is pid 62315** — the backend stuck since 14 Aug 23:00Z, now 24h+, which
blocks pid 65284 and has been the standing FOUNDER_QUEUE item.

**The comment above it is the whole story, and it is worse than NEW1 estimated:**

> *"Built in SQL so 38,341 judgments never cross the wire"*

38,341 was the corpus when that was written on 12 Aug. It is now **7,296,068** —
**190x**, not the ~100x estimated. The reasoning was correct and the constant
silently expired underneath it.

**The fix is NOT an index.** This is a deliberate whole-corpus scan that builds
the complete citation-key map in one shot — `unnest` over an array column plus a
`regexp_replace` per element, per row. No index makes a full materialisation
cheap. The candidates are:

1. a **materialised key table** maintained incrementally as judgments land, so
   the resolver reads an index instead of rebuilding the map, or
2. **keyset-paginated batches** with the resolver applied per batch, which is the
   pattern `RING_PROGRAM.md` §4 already requires of every long job here.

**Same anti-pattern family as `concordance-cli.ts`**, fixed 13 Aug and documented
in `LANE_PROTOCOL.md`; this sibling file was never touched.

> **The reusable lesson: a comment stating a row count is a load-bearing
> assumption with no expiry date on it.** "38,341 judgments never cross the wire"
> was true, documented, and became false without anything failing loudly — until
> a backend hung for 24 hours.

**Do not run this against Railway.** It runs locally after cutover, where there
is no proxy and no shared budget — but fix the shape first, or it will be slow
locally too, just less visibly.

### NEW2.9 · THE STOP SWITCH HAD HOLES — the claim was not an enumeration

`DONE: every path that can start a database writer provably crosses a STOP check
| VERIFY: node scripts/check-stop-coverage.mjs — exit 0`

**Found by LCC (bus 0560), and the defect was the claim rather than the code.**
In bus 0550 this lane told every other that the pause was fleet-wide, citing
`supervise.mjs`. True of everything `supervise.mjs` runs — and
`scripts/enrich-worker.cmd` has its own `:loop` and never went through it, so
`paragraphs` and `citations` were opted out of the freeze without anyone deciding
they should be. Three launchers sit in the Startup folder, so **a reboot during
the write freeze would have started two writers against the database being
migrated** — against a freeze already broken once and then verified fixed. The
passed verification is what would have made it invisible.

LCC fixed `enrich-worker.cmd` (STOP checked before first start *and* per loop,
both directions tested by execution). Verified here independently: lines 108 and
114, 124 CRLF pairs, 0 bare LF, 0 non-ASCII bytes.

**`scripts/check-stop-coverage.mjs` is the enumeration, wired into
`ci-local.mjs`** so the claim is a test rather than a memory. It checks the
Startup copies *separately* from the repo files — a repo fix that was never
installed is exactly what bit `lawmind-ingest.cmd` once already.

Two holes remain, and they are LCC's to close:

| launcher | writer | why |
|---|---|---|
| `scripts/legal-object-stage1.cmd` | `enrich-cli.ts` | `call npx tsx … enrich-cli.ts` directly |
| `scripts/legal-object-stage2.cmd` | `enrich-cli.ts` | same |

Neither is in Startup and no scheduled task references them (checked, not
assumed), so the reboot path really is closed; the exposure is a manual run
during a freeze. **`ci-local` is RED until they are patched** — deliberate, and
sent to LCC in 0564 before they could hit it.

> **The guard's own first version was wrong in both directions and looked fine.**
> It reported `supervise.mjs` UNPROTECTED (it builds the path with `join()`, so
> the literal `checkpoints\STOP` never appears) and `legal-object-stage1`
> COVERED (a `REM` line mentions `enrich-worker.cmd`). This repo's style is
> documentation-heavy, so prose mentions outnumber real calls — it now strips
> comments per file type before matching. An unmeasured detector was about to
> assert the opposite of the truth on the one question it existed to answer.

**Worker-level beats launcher-level** and that is the transferable rule:
`stopIfRequested` inside `hc-load-cli.ts` / `hc-classify-cli.ts` holds however
the process was started; a launcher check only holds for processes that launcher
started.

### NEW2.10 · THE 301,422 ARE SETTLED AT KNOW LEVEL

LCC closed it physically rather than by argument (bus 0562,
`docs/ops/migration/EVIDENCE-301422.md`): they pulled row
`3886b6c4-ed81-475b-9a06-52c445c605ca` (created 19:39:42Z, inside the window)
back out of dump chunk `judgments#056`, and that chunk carries **1,178** rows
from the window — ×256 chunks ≈ **301,568** against the measured **301,422**,
agreement across the whole key space rather than at one point.

> **The transferable lesson, in LCC's words: an LSN belongs to a specific dump.**
> This lane's reasoning was sound about `dumpSnapshotLsn 195/21C52000` and simply
> carried it onto the *replacement* dump after the original died at 42 minutes.
> Nothing about the analysis was wrong except which object it described — which
> is invisible precisely when the number is real and the logic is correct.

Rewind stays off. `verify-local-canary.mjs` check 1 still names both numbers, and
still runs — LCC offered to report a figure that refutes them, and that offer is
only worth something if someone looks.

### NEW2.11 · THE 301,422 CLOSED AGAIN, THIS TIME FROM THE COUNTERS

16 Aug 2026, 02:47Z. Read off the **local** instance while LCC's own verification
count was still running (5 parallel workers, IO-bound). `pg_stat_user_tables` for
`judgments`:

| counter | value |
|---|---|
| `n_tup_ins` | **7,296,068** |
| `n_tup_upd` | 0 |
| `n_tup_del` | 0 |
| `n_dead_tup` | 0 |
| `last_analyze` / `last_autoanalyze` | null |
| `stats_reset` (pg_stat_database) | null |

**The nulls are the load-bearing half.** `stats_reset` null means `n_tup_ins` is
the complete insert history of this table on this instance, not a count since
some reset that would have to be reasoned about. Both analyze timestamps null
means `n_live_tup` was never set by a *sampled* ANALYZE — it is the
counter-derived value, which is why it reads 7,296,068 exactly rather than
approximately. An estimate that has never been estimated is the counter wearing a
different name.

`7,296,068 − 6,994,646 = 301,422`, to the row. This is independent of both the
LSN reasoning and the chunk-056 read, so the question is now closed three
separate ways.

> **It is still not the count.** `n_tup_ins` is a stats-collector counter;
> `count(*)` reads the heap. They agree here and are expected to agree there —
> and "expected" is the word that already cost this migration one broken freeze.
> Check 1 runs **after** cutover approval, never before it.

### NEW2.12 · THE VERIFICATION WAS ABOUT TO CONSUME WHAT IT VERIFIED

`verify-local-canary.mjs` ran **`count(*)` over `judgments` four times** — once
for check 1, twice for the insert rate, twice more with a predicate for the
classification rate. At 7.3M rows in a 50 GB table that is roughly **200 GB of
heap read**, during the exact minutes the NVMe headroom is being read to decide
whether 3 workers becomes 8.

| check | was | is |
|---|---|---|
| 1 restore completeness | `count(*)` | `count(*)` — **kept**, it is the gate and an estimate cannot settle it |
| 2 local inserts | 2 × `count(*)` | `n_tup_ins` delta — *literally* the quantity being asked for |
| 6 classification | 2 × `count(*)` w/ predicate | `n_tup_upd` delta, **relabelled as update activity, not classification** |

Check 6 was paying two full table scans to print "no change, as expected" — the
canary launches three harvest workers and **no classifier**, so it is context,
never a gate.

**A wait-guard now refuses to start a second full scan** while another
`count(%judgments%)` backend is active; it waits rather than failing, because the
right answer to "someone else is counting" is "let them finish". It found LCC's
scan on its first run — the only positive control worth having. NEW1's 0523
(16.4h of a query blocking a second copy of itself) is the same shape: two 7.3M
parallel scans do not go twice as fast, they halve each other.

### NEW2.13 · PHASE A COMPLETE — THREE TOOLS, NONE OF WHICH CAN TOUCH RAILWAY

**`scripts/migration/new2-railway-static-audit.mjs`** — the STATIC half of the
question the runtime check answers. The runtime one asks *"is anything connected
to Railway right now"*, which passes trivially at 0 workers, i.e. exactly when it
proves the least. This asks *"does any remaining path in the tree lead back to
Railway after cutover"*. **611 files, 0 HIGH findings.**

The finding worth keeping is the shape of the answer: every writer reads
`process.env.DATABASE_URL`, every launcher passes `--env-file=.env`, nothing is
hardcoded, and nothing falls back to `RAILWAY_DATABASE_URL`. **`DATABASE_URL` is
the single fleet-wide switch** — and the audit's real job is to keep proving
there is no second one, because the second path always gets added innocently.

> **The first version of that claim was "the cutover is one line in `.env`", and
> it was true and incomplete at the same time.** It was concluded from `.env`
> holding exactly one live `DATABASE_URL` — but `.env` cannot show a variable
> supplied from outside it. The audit now **discovers** connection sources from
> the code, and finds three:
>
> | variable | where | covered by the `.env` switch? |
> |---|---|---|
> | `DATABASE_URL` | `.env`, every writer | **yes** |
> | `CORPUS_DATABASE_URL` | harness, exported by hand | no |
> | `ADMIN_DATABASE_URL` | `ci-local.mjs` | no |
>
> **`ADMIN_DATABASE_URL` is the sharp one.** `ci-local.mjs` *creates and drops* a
> database (`SCRATCH = 'lawmind_ci'`) on whatever server it names. Pointed at
> Railway after cutover, a routine `pnpm ci:local` is a live `CREATE DATABASE` /
> `DROP DATABASE` against the system we just left. Both are now printed on every
> run **including on PASS** — a caveat that only appears on failure is a caveat
> nobody reads. Corrected to LCC in bus 0571.
>
> *(Consequently `pnpm ci:local` was **not** run to verify the new step; the step
> was run standalone. Neither lane should run the full script until
> `ADMIN_DATABASE_URL` is repointed.)*

Wired into `ci-local.mjs` in **code-audit mode deliberately**: `DATABASE_URL`
pointing at Railway is *correct* until cutover, and a step that is red for the
whole window it polices is a step everyone learns to skip. `--cutover`
additionally requires `DATABASE_URL` to be loopback and is run by hand after
approval.

> Its own first run was wrong twice, both times in the family this lane keeps
> hitting: it **dropped** comment lines instead of blanking them, so every
> reported line number after a comment block was off (`start-local-canary.ps1:34`
> for a match that is on line 82) — a citation to the wrong line is worse than no
> citation, because the reader looks, sees innocent code, and stops trusting the
> tool. And it flagged **its own** `DATABASE_PUBLIC_URL` regex: a detector
> necessarily contains every pattern it detects. Self-exclusion is now printed,
> never silent.

> **It then false-positived LCC's brand-new
> `services/harness/src/post-migration.test.ts`** (611 files on one run, 616 on
> the next), flagging `hayabusa.proxy.rlwy.net` as a live path in a test whose
> whole purpose is asserting that host is **refused**. Fixed by asking whether
> the file constructs a client at all (`postgres(`, `new Client`, `.connect(`,
> `psql`); no client means the hostname is a string nothing can connect with, so
> it records at INFO and is **named as a fixture** rather than dropped. Third
> instance of one lesson this session: *a thing that checks for X necessarily
> contains X.*
>
> **Negative control run immediately after, because loosening a guard is exactly
> when to prove it still bites**: a file importing `postgres` and connecting to
> the real Railway URL, dropped into `services/ingest/src/` → **exit 1, two HIGH
> findings, correctly attributed**; removed → exit 0. Scratch file deleted.

**`scripts/migration/new2-fleet-metrics.mjs`** — the measurement the scale-up is
decided from, appended to a JSONL ledger. The objective is **documents written
per hour**; worker count sits beside it as context, never as evidence. Reads
`LOCAL_DATABASE_URL` only and refuses anything but loopback. With no local
database it still reports host counters and *documents read per second straight
from the checkpoint offsets*, and marks the database section `unavailable` rather
than reporting zeros — **null is not zero**, and the ledger has to be able to
tell them apart.

> `scripts/fleet-rowcount.mjs` deliberately follows `DATABASE_URL` instead. That
> is correct for that script and is **a live Railway connection if anyone runs it
> during the hold**. Not a defect; a loaded gun.

**`scripts/migration/new2-scale-decision.mjs`** — reads the ledger and prints
**GO / HOLD / BACK OFF**. Refuses to advise from fewer than two samples per level:
one measurement of a fleet is an anecdote, since a scope of scanned 1990s PDFs
and one of clean 2024 text do not produce comparable rates. 10% noise floor.
BACK OFF **overrides a throughput gain** — a 49.8% rise with the NVMe queue at
6.1 and errors at 0.31/batch is not a win. All three branches exercised against
constructed ledgers; exit codes 0/0/1.

**38 workers is history, not a target.** It was reached against Railway's shared
TCP proxy where the bottleneck was network round-trips. Locally it is NVMe and
Postgres, and the ladder stops wherever the measurements say it stops.

#### Hold state, re-verified by execution 02:42Z

| | |
|---|---|
| ingest workers alive | **0** |
| `.checkpoints/STOP` | present, untouched |
| checkpoints | 49 scopes · 426 source files · 0 unparseable · 0 window mismatches · 0 stray `.tmp`/`.corrupt` |
| canary, real run | **refuses, exit 1** |
| canary, `-WhatIf` | exit 0, lists 3, launches nothing |
| Railway connections held by NEW2 | none |
| hold baseline (125s, 0 workers) | cpu 23% · ram free 12.0 GB · NVMe r 106.6 w 1.1 MB/s · queue 0 · net recv 10.5 MB/s |

`-WhatIf` is now **exempt from the STOP refusal, and only `-WhatIf`**. It starts
no process, so refusing it during the freeze removed the rehearsal exactly when
rehearsing was the only thing left to do — a dry run that is unavailable in the
state it was written for is a dry run whose output nobody has actually seen. It
prints the freeze in red so the two cases never look alike. *(This also corrects
bus 0563, which claimed `-WhatIf` exited 0; it exited 1 until this change.)*

#### Still waiting on exactly one thing

`LOCAL_DATABASE_CUTOVER_APPROVED` from LCC. An idle-looking database, a
completed-looking restore, a zero worker count, and a statistics counter that
reads exactly right are **four things that are not that message**.

### NEW2.14 · QUEUED FOR AFTER CUTOVER, IN ORDER

1. **Check 1** — `verify-local-canary.mjs`, the real `count(*)`. Then
   `new2-railway-static-audit.mjs --cutover`.
2. **Three canaries only** — one per year band, each resuming from a real stored
   offset. Concurrency 8, below the fleet's 16/32, because a saturated NVMe hides
   the latency signal the scale decision depends on.
3. **Ladder** 3 → 8 → 16 → 24/32/38, two metric samples per rung,
   `new2-scale-decision.mjs` between each.
4. **Page-furniture cleaner** — still **UNAPPLIED**. Validation re-runs locally
   against the real database before anything is applied at scale; the old sample's
   percentages are not assumed to hold per court, year or document class. LCC is
   notified before any text changes so derived enrichment can be rerun.
5. **Coverage** — 2016–2022 (7.69M), remaining pre-2016, 2023–2024, freshness.
   Ranked by *remaining source documents* against a court × year source
   denominator, never `MIN(date)`.
6. **New tribunal sources from NEW3 (bus 0567)** — CAT (`cis.cgat.gov.in`,
   41 benches, no CAPTCHA, needs eval-driven form fill) and CCI
   (`cci.gov.in/antitrust/orders`, no CAPTCHA, listing proven, PDF fetch still
   open). Acquisition routing is NEW2's. **Nothing harvested during the hold.**
7. **Silver export** — *not* immediately after cutover. Stabilise local ingestion
   first, then calibrate compression and object sizes on a **real representative
   sample**; CX1's synthetic ratio is not used for capacity planning.

### NEW2.15 · 17 Aug — `judgments` HOLDS 0 ROWS AND NOTHING IS LOST

**Read the second sentence before reacting to the first.** All **7,296,068** rows
are in `public.judgments__stage`. LCC's rebuild stages into that table and swaps
at the end; the 16 Aug 07:26 power loss landed **before the swap**.

| relation | `count(*)` | heap | total |
|---|---|---|---|
| `public.judgments` | **0** | 294 MB | 2,040 MB |
| `public.judgments__stage` | **7,296,068** | 7,717 MB | 50 GB |

33 columns on both. The stage count took **224.9 s**; no other backend was
running.

#### The 301,422 are confirmed by CONTENT, which is what makes it durable

```
select max(created_at) from judgments__stage  ->  2026-08-15T20:32:54.788Z
```

That is NEW2's last write of the broken-freeze window, **to the millisecond**
(same figure quoted to LCC in bus 0563 from the other side). The newest row in
the restored corpus *is* one of the 301,422. Oldest is 2026-08-04T15:28:36.390Z,
so the range spans the corpus.

#### The counter evidence from bus 0569 is WITHDRAWN

That message closed the 301,422 question on `n_tup_ins` 7,296,068 · `upd` 0 ·
`del` 0 · `stats_reset` null, and made a point of the nulls being load-bearing.

**PostgreSQL discards the statistics collector on an unclean shutdown.** The
reading was taken at 02:47Z; the power loss was 07:26. Every one of those
counters now reads 0.

> **On this database right now, `n_live_tup` reads 0 for EVERY table**, including
> `judgment_paragraphs` at 22 GB. `pg_class.reltuples` is no better — `-1` with
> `relpages = 0`, nothing analyzed since the rebuild. **Only an actual `count(*)`
> means anything here, and it is not cheap.** Any gate that reads a row estimate
> as a row count silently inverts in this window.
>
> The reading was true when taken and is unreproducible now, which makes it worth
> nothing as evidence anyone can check. Replaced rather than defended: content in
> the table survives a crash, a counter about the table does not.

#### How it was found, and the near miss

`n_live_tup = 0` alongside a 50 GB table is a contradiction, and the only reason
the stage table turned up is that the contradiction was not smoothed over. A
first look at `pg_stat_user_tables` would have supported "the corpus is gone";
a first look at `pg_class` would have supported the same; both are wrong.

#### `verify-local-canary.mjs` check 1 now diagnoses it

It would have counted `judgments`, found 0, and printed *"neither the baseline
nor the post-freeze figure; investigate"* — correct, useless, and frightening.

It now looks for `judgments__stage` **before** the count and halts with the real
diagnosis: **the swap has not run, this is NOT data loss, do not restore, do not
rewind checkpoints, do not start workers.** *The table is empty* and *the table
is not the one holding the data yet* are different facts and only one is an
emergency.

#### The freeze now protects more than it did

**A writer starting before the swap would insert into a table that is about to be
replaced by a rename — and those rows would vanish with no error anywhere.** So
STOP stays even if `LOCAL_DATABASE_CUTOVER_APPROVED` arrives first; the swap
comes first, and NEW2 will ask rather than assume.

The swap is **LCC's**. Nothing was renamed, dropped, swapped or written here.
Warned: LCC (0579), NEW1 (0580, their post-migration gate queries `judgments`),
NEW3 (0581).

### NEW2.16 · THE REBOOT RAN LCC'S FREEZE SCENARIO FOR REAL

The machine powered off mid-task and rebooted. `lawmind-ingest-startup.cmd` fired
at logon and the launcher started **43 supervisors**. Every one refused:

```
[supervisor 2026-08-16T19:58:28.272Z] PAUSED: …\.checkpoints\STOP exists
launcher run 2026-08-16 23:58:27 (boot uptime 2 min) · started 43 · skipped 0
ingest workers alive afterwards: 0        ← process table, not the log
```

This is exactly the failure LCC found by inspection in bus 0560 — a reboot
mid-freeze starting writers against the database being migrated — **executed
rather than argued about**. It held.

> "START" in the boot log means a *supervisor* was spawned, not that a worker
> ran. `supervise.mjs` spawns, checks STOP, logs PAUSED, exits. No `hc-load-cli`
> process ever existed. 43 is an alarming number to read without that sentence.

### NEW2.17 · FIVE SCOPES COULD NOT BE RESTARTED BY ANY LAUNCHER

Found by cross-checking every checkpoint against the names
`start-ingest-fleet.ps1` can actually produce — a check written only because the
rung list had to be startable. **It paid for itself before it ran once.**

| scope | resumes from |
|---|---|
| `hc-boot-9_13-y2023` | **443,845** |
| `hc-boot-3_22-y2023` | 149,388 |
| `hc-boot-10_8-y2023` | 135,913 |
| `hc-boot-27_1-y2023` | 41,217 |
| `hc-boot-14_25-y2024` | 4,334 |

Six year-scoped 2023 backlog workers were hand-started (bus 0371); **only two
were ever written into the launcher.** The other four existed in a shell history
and nowhere else — and this reboot is precisely what would have ended them
without a trace. *A worker that runs only because somebody typed a command once
is not part of a fleet; it is a coincidence.*

All five are now in the launcher, and all five were among the 43 that correctly
refused — so the fix was exercised by a real reboot minutes after being written.

### NEW2.18 · THE LADDER IS EXECUTABLE NOW

`start-ingest-fleet.ps1` was all-or-nothing, so "measure at 8, then decide" had
nothing to launch. It takes **`-Only`** (comma-separated scope names);
`new2-rung-plan.mjs --workers N --json` emits the list.

Verified against the live launcher: **started 8 · filtered 35**, all 8 still
refused by STOP — the filter proven without the freeze being touched. **Without
`-Only` the behaviour is unchanged**, so the Startup path is untouched.

The rung order is band priority (2016-2022 → pre-2016 → y2023/24 → recent) then
source documents in that band from `HC_METADATA_SURVEY.json`. Exact for pre-2016
and recent; an **upper bound** for 2016-2022 and labelled `~` because the survey
does not separate it from 2023-2026. **Never `MIN(date)`.**

### NEW2.19 · THE AUDIT'S DISCOVERY PASS HAD A GENERAL BLIND SPOT (NEW1, bus 0573)

It matched only names **textually adjacent** to `process.env`, so it missed
`POST_MIGRATION_DATABASE_URL` — read at
`services/harness/src/post-migration-cli.ts:1105` through a loop over an array of
names. That is not one missing variable; it is **every indirect lookup**, which
undoes the section's only real property: that its list comes from the code and
not from anyone's memory. *A discovery pass with a blind spot is a memory with
extra steps.*

Two patterns now, and **how** each name was found is recorded rather than
flattened — a name in an error message is weaker evidence than one next to
`process.env`, and the report says which:

| variable | via | `.env` |
|---|---|---|
| `ADMIN_DATABASE_URL` | env-access + literal | ABSENT |
| `CORPUS_DATABASE_URL` | env-access + literal | ABSENT |
| `DATABASE_URL` | env-access + literal | RAILWAY |
| `LOCAL_DATABASE_URL` | literal only *(parsed from `.env` by regex)* | LOOPBACK |
| `POST_MIGRATION_DATABASE_URL` | literal only | ABSENT |

**Three** are not covered by the `.env` switch, up from two.

Also corrected: bus 0571 attributed `services/harness/` to LCC. **It is NEW1's.**

> **NEW1's sibling finding is sharper than mine** and is recorded here so it does
> not depend on a conversation: `hard-negatives.live.test.ts` reads
> `DATABASE_URL`, so a plain `pnpm --filter @lawmind/harness test` during a
> freeze queries Railway. Mine needed someone to deliberately run a CI script;
> theirs fires on the most ordinary command in the repo. Clear the variable and
> it skips visibly.

### NEW2.20 · RAILWAY IS OVER ITS CAP AND OFFLINE

$75.11 against a $75 cap, `isOverLimit = true`, workloads offline. Returns if the
cap is raised or when the billing period resets **19 Aug 2026 09:50Z**.
**Do not raise the cap.** Everything Railway was needed for was captured before it
stopped. Restore, verification and R2 backup are entirely local.

Consequence for this lane: `DATABASE_URL` in `.env` still names Railway, so it
now points at a **dead host** — an accidental run fails rather than corrupts, and
the parked rollback is unavailable until 19 Aug. It does not change the cutover
step; it removes the fallback the step was hedging against.

### NEW2.21 · THE CLUSTER CRASHED MID-REFILL AND SELF-RECOVERED — AND THE START TASK LIED ABOUT IT

Timeline from `C:\lawmind\pgdata\log\postgresql-2026-08-17.log`, not inferred:

| local time | event |
|---|---|
| 00:38 | 8 backends `INSERT INTO public.judgments`, heap 4,440 MB and climbing |
| ~00:39 | cluster **down** — `ECONNREFUSED` on 127.0.0.1:5432, 0 `postgres.exe` |
| 00:44:30 | `LawMindPostgres` task started it again |
| 00:44:32 | `redo starts at 1E/DD2700A0` |
| 00:47:03 | `redo done at 23/8A60BAE0` — **150.86 s** (CPU user 20.62 s, system 45.67 s) |
| 00:47:09 | **database system is ready to accept connections** |

The partial refill **committed in batches and survived**: `judgments` came back
at 4,686 MB heap / 32 GB total **with rows**. `judgments__stage` untouched at
7,717 MB / 50 GB.

#### The latent defect: the start task reports FAILURE on every crash recovery

```
LawMindPostgres → pg_ctl.exe -D "C:\lawmind\pgdata" -l … -w -t 120 start
LastTaskResult: 1
```

**`-t 120` is shorter than crash recovery takes.** `pg_ctl` stopped waiting at
120 s; recovery finished at 150.86 s and the server came up fine. The task result
says the start failed; the database says it is ready.

> This is a false negative in **the one indicator anyone checks after an
> unexpected reboot**, and it fires precisely when it matters most — after a
> crash, the only time recovery is slow. The hazard is not the task; it is the
> person who reads `LastTaskResult: 1`, concludes Postgres is down, and starts
> "recovering" a healthy cluster. Recovery time scales with WAL to replay, so it
> gets **worse** with a heavier interruption. `-t 600` covers today's 150 s with
> room. **LCC's lane — reported in bus 0585, not changed here.**

Benign, recorded so they are not rediscovered as alarms:
- `unexpected pageaddr … in WAL segment` immediately before `redo done` is the
  normal end-of-WAL marker, not corruption.
- `FATAL: the database system is not yet accepting connections / Consistent
  recovery state has not been yet reached` ×8 — clients retrying during redo.
- 15 Aug 22:51 (historical, did not recur): `could not create shared memory
  segment: error code 1450`, `CreateFileMapping(size=8853479424)`. **8.85 GB of
  shared buffers has failed to allocate on this machine before** — worth a
  thought before the fleet scales back up alongside it.

### NEW2.22 · THE MID-LOAD GUARD, AND THE BUG ONLY A LIVE RUN COULD FIND

Running the canary against the database **during** LCC's refill produced:

```
FAIL  restore completeness   1,830,520 — expected 7,296,068. Neither the
      baseline nor the post-freeze figure; investigate before resuming.
```

Accurate, meaningless, and **actively dangerous**: it reports how far the load
happened to have got, and the obvious unattended response — restore again, or
rewind checkpoints — is destructive while a recovery is in flight.

`verify-local-canary.mjs` now **refuses** (exit 2) when `judgments` is being
loaded. It refuses rather than waits: a load can run for an hour, and a wait
would expire mid-load and produce exactly the number the guard exists to prevent.

> **The first version of that guard caught nothing.** It matched
> `query ilike 'insert into%judgments%'`, but the statements arrive as `BEGIN;` +
> newline + `INSERT INTO public.judgments …`, so an anchored pattern never
> matches. Unanchored now, and **verified firing against the real load twice** —
> once deliberately, once when it refused a count this lane wanted to run.
>
> Reading the code would never have found it. Only running it against a live load
> did — the same reason LCC's negative test on `enrich-worker.cmd` mattered in
> bus 0560.

Also added: a **stage-table check before the count**, so an empty `judgments`
alongside a full `judgments__stage` halts with *"the swap has not run, this is
NOT data loss"* instead of reporting a zero that reads as catastrophe.

#### Checkpoints have now survived a power loss AND a cluster crash

49 scopes · 426 source files · 0 unparseable · 0 stray `.tmp`/`.corrupt` ·
0 zero-byte · offsets **byte-identical** to the pre-crash inventory. First time
the atomic-write claim has been tested rather than asserted — twice.

#### Standing rule this reinforced

**A quiet database is not a finished one.** At 00:47 there were 0 backends and
the refill looked done; thirty seconds later LCC had 8 load workers running
again. "Refill complete" is a precondition LCC states, never one this lane infers
from an idle instance — the same rule as STOP itself.

### NEW2.23 · THE STAGE CHECK NOW REFUSES ON EXISTENCE, NOT ON EMPTINESS (NEW1, bus 0583)

NEW1 built the same check independently and got the shape right where this lane
got it nearly right. Both differences adopted.

| | first version (NEW2) | adopted (NEW1's shape) |
|---|---|---|
| fires when | `judgments` counts **0** *and* stage exists | `judgments__stage` **exists**, full stop |
| how | `pg_class` join + `count(*)` on the stage table | `to_regclass(…) IS NOT NULL` |
| verdict | FAIL, after grading | **REFUSAL, exit 2, before grading** |
| cost | 224.9 s | instant |

**The gap stopped being theoretical forty minutes after NEW1 wrote it.** The
cluster crashed mid-refill, recovered, and the partial rows had committed in
batches — leaving `judgments` holding *some* rows while `judgments__stage` still
existed. An empty-only test walks straight past that and grades a half-loaded
table, reporting a partial count as an unexplained deficit: **the exact wrong
answer the check was built to prevent, one crash later.**

> The stage table existing **at all** means the rebuild has not finished. That is
> the real precondition; "judgments is empty" was a proxy for it that happened to
> hold in the one state this lane had observed. *A check written from a single
> observed state encodes that state, not the rule.*

**Refusal rather than FAIL**, because they read differently at 3am: FAIL says the
migration is broken, refusal says the gate cannot answer yet — and only one of
them invites someone to re-restore 40 GB. Verified live both directions:
predicate `true` against the real table, `false` against a name that does not
exist.

#### `reltuples` swept in this lane's tooling too

NEW1's sharper catch was one file over in their own lane:
`held-not-retrieved-cli.ts` printed `reltuples` labelled *"approx"*, which on
this cluster reads **`~-1` for a 22 GB table** and was being recorded beside a
result as a corpus size. *Labelled "approx" is the kind of hedge that stops a
reader looking; a negative population is not an approximation of anything.*

Checked this lane for the same shape rather than assuming: `new2-fleet-metrics.mjs`
reports `n_tup_ins` **deltas**, never a population, and marks the database
section `unavailable` rather than `0` when it cannot connect. `new2-rung-plan.mjs`
takes its denominators from parquet footers and never touches the database. No
`reltuples` hazard here.

### NEW2.24 · THE COUNT GATE IS MET — `judgments` = 7,296,068

Run 17 Aug 02:42Z, loopback only, read-only. `judgments__stage` gone, 0 backends
active, so LCC's refill completed and the table was dropped between 21:00Z and
02:42Z.

```
PASS  restore completeness   7,296,068 — the 301,422 came across
PASS  dedup constraint       judgments_source_url_key
PASS  text extraction        100.0% of a 5,000-row sample carry full_text
PASS  no Railway traffic     no established connection to hayabusa.proxy.rlwy.net
FAIL  local inserts          +0 rows in 30s
FAIL  checkpoint advance     0 source-file offsets advanced
```

**The two failures are correct.** They measure a *running* canary; 0 workers run
under STOP. The gate refusing to print "safe to scale" while it cannot observe
ingestion is the behaviour we want — they pass when canaries actually run, and
not before.

**Per the directive: the count is exact, so the 301,422 question is permanently
closed and there is NO rewind.** Not 6,994,646, not an unexplained figure.
Counted off the heap, independent of both the withdrawn counters and LCC's
chunk-056 read. Three methods, one number — and the two that survive a crash are
the two that matter.

**STOP was not removed and has not been.** A passing count is not the approval
word.

### NEW2.25 · THE STAGE CHECK WAS WRONG TWICE, THE SAME WAY, ONE LEVEL APART

NEW1 (bus 0587) caught it from a sentence in NEW2's own 0586.

| version | fired on | wrong because |
|---|---|---|
| v1 | `judgments` is **EMPTY** | missed the partial-refill state after the crash — graded a half-loaded table |
| v2 | `judgments__stage` **EXISTS** | **would refuse a healthy database** |
| v3 | the **row count** | — |

**LCC refills `judgments` FROM the stage table rather than renaming it into
place** — observed directly: 8 backends running `INSERT INTO public.judgments`
while `judgments__stage` sat unchanged at 7,717 MB. So the stage table's
*disappearance* marks completion; its *presence* never marked incompleteness.
There is a real, healthy state where the load is done, `judgments` holds
everything, and the stage table is un-dropped debris.

> **Both v1 and v2 asserted something ADJACENT to the question.** The question is
> *does the live table hold the corpus*, and only the row count answers it. This
> lane made exactly this correction in NEW1's favour one level up — emptiness was
> a proxy — then adopted a second proxy without noticing it was one.

```
stage absent                        -> proceed. One catalogue lookup, free.
stage present, judgments == target  -> NOTE and proceed. Debris, not a fault.
stage present, anything else        -> REFUSE, exit 2.
```

The count is paid **only** when the stage table is present, so the normal path
stays a single instant `to_regclass`. And it no longer depends on whether LCC's
cleanup step ran — *a guard that needs someone else's housekeeping to have
happened is a guard with a scheduling dependency*, which is the thing the check
existed to remove.

### NEW2.26 · THE `0xC000013A` POSTGRES CRASHES ARE THE 15 AUG CONSOLE BUG, WEARING A DIFFERENT VICTIM

LCC reported four local-server crashes with exception `0xC000013A` and filed
**FQ-PGSERVICE** ("needs admin to register PostgreSQL as a Windows service, which
removes the console"). The diagnosis was right; the **mechanism is now confirmed
rather than suspected**, and it is a defect this lane has already paid for.

`0xC000013A` is `STATUS_CONTROL_C_EXIT` — a **console control event**, not memory
corruption, not a PostgreSQL fault, not workload-related.

Live evidence from the running server:

```
postmaster pid 27764, started 06:47:38
parent pid 6848, STILL ALIVE:
  cmd.exe /C ""C:/lawmind/pgsql/pgsql/bin/postgres.exe" -D "C:/lawmind/pgdata"
           < "nul" >> "C:\lawmind\logs\pg_ctl.log" 2>&1"
```

That is `pg_ctl start`'s Windows implementation — it shells out through
`cmd.exe`. **The postmaster shares that console, and every backend and background
worker it forks inherits it.** One event reaches all of them.

The log agrees:

```
00:39:43  client backend (PID 23024) was terminated by exception 0xC000013A
06:45:48  autovacuum worker (PID 11220) was terminated by exception 0xC000013A
          DETAIL: … autovacuum: VACUUM pg_toast.pg_toast_16384000
```

Autovacuum is **not** the cause and is not special — children inherit the console,
and a long VACUUM is merely the process most likely to be alive when an event
lands. The 00:39 one is the crash that killed LCC's refill mid-load, observed
from outside as `ECONNREFUSED`.

> **Identical to `start-ingest-fleet.ps1`'s header incident.** `start "" /b` ran
> all 38 workers in the launcher's own console; when it went away Windows
> delivered `CTRL_CLOSE_EVENT` to every attached process — *exit code 3221225786
> == 0xC000013A*, all 38 at the same instant. **Same error code, same cause,
> different victim.**

**No-admin interim** — what this lane's fleet already uses, and why 43 supervisors
survived this morning's reboot: `Start-Process` **without** `-NoNewWindow` gives
the child its **own** hidden console, so the launching shell's console
disappearing cannot reach it. Starting the postmaster that way rather than through
`pg_ctl`'s `cmd.exe` wrapper removes the inheritance without admin.

**Honest limit:** a process with its own console can still be signalled on *that*
console. **The Windows service remains the correct fix** — a service has no
console at all — so FQ-PGSERVICE stands. The interim only removes the binding to a
console that demonstrably keeps disappearing. LCC's `fsync` reasoning holds
either way: four clean recoveries with identical counts is a **time tax, not a
data risk** — and still not safe to resume 43 supervisors into.

### NEW2.27 · POSTGRES BOOT PERSISTENCE HAS DISAPPEARED

Earlier this session, read directly:

```
TaskName LawMindPostgres · State Ready
EXEC  C:\lawmind\pgsql\pgsql\bin\pg_ctl.exe
ARGS  -D "C:\lawmind\pgdata" -l "C:\lawmind\logs\pg_ctl.log" -w -t 120 start
LastRunTime 8/17/2026 12:44:29 AM · LastTaskResult 1
```

Now, same tool, same session:

| | |
|---|---|
| total scheduled tasks visible | **204** (subsystem responding — control) |
| matching LawMind/postgres | **0** |
| Windows services matching postgres/pgsql | **none** |
| `postgres.exe` processes | 12, running, started 06:47:38 |

**The cluster is up but nothing would start it after a reboot.** Possibly LCC
mid-way through FQ-PGSERVICE — a gap while swapping a task for a service is
expected, and saying so beats assuming it. Reported in bus 0597; **nothing
changed here**, because recreating a task LCC may be deliberately removing is
worse than telling them.

> Same shape as bus 0510, where the enrichment launcher was fixed in the repo and
> never installed in Startup: **the thing that starts it is a separate artifact
> from the thing that runs, and only one of them usually gets checked.**

### NEW2.28 · LCC's 0596 VERIFIED BY EXECUTION — THE STOP GUARD IS GREEN

`node scripts/check-stop-coverage.mjs` → **PASS, exit 0**. `ci-local`'s
'stop coverage' step is no longer red; both `legal-object-stage*.cmd` holes are
closed **at the writer**, which is the stronger fix.

`stopIfRequested()` confirmed at `enrich-cli.ts:129` (before the DB is touched)
and `:634` (per document). Path re-resolved by execution rather than read:

```
join(dirname(fileURLToPath(<enrich-cli.ts>)), '..', '.checkpoints', 'STOP')
  -> C:\Users\Xerxus\Documents\Lawmind\services\ingest\.checkpoints\STOP   exists: true
```

LCC's own first version resolved from `process.cwd()`; both stage launchers `cd`
before invoking, so it would have **reported safe while writing** — they caught it
before it shipped. Exit **0** on pause rather than 1, so a supervisor does not
read a requested pause as a crash and burn its restart budget.

---

### NEW3 · 17 Aug 2026 · post-Railway continuation — a licensing contradiction resolved, two work queues built, BNSS/BSA handbook siblings verified

**The session's mission brief claimed founder authorization for IndianKanoon
and a "Bharat Nyai" source. Both contradicted the settled repo record** —
IndianKanoon declined twice on record (`FOUNDER_QUEUE.md`, `AUTHORIZED_
SOURCE_MAP.md` §4), FQ-IK Q1 open since 15 Aug; "Bharat Nyai" matched zero
hits anywhere in the repo. Flagged rather than silently built against
before touching anything — the founder confirmed live, in session, that
both are authorized and that "Bharat Nyai" is Bharat.Law's `/nyai`
product. Recorded as `FOUNDER_QUEUE.md` FQ-IK-RESOLVED and
`AUTHORIZED_SOURCE_MAP.md` §4, broadcast to all four lanes (bus 0598-0601).
**Scope and budget for both remain unconfirmed — GUESS not KNOW, nothing
should spend against either without one more explicit confirmation.**

Built from that: `docs/INDIANKANOON_WORK_QUEUE.md` (ranked off already-
measured gaps in `MISSING_AUTHORITY_QUEUE.md` — the 123-citation no-alias
bucket, the 2018+ concordance gap the ECT structurally can't cover, the 9
confirmed-absent SC judgments, cited/cited-by expansion on the top
cross-court authorities; metadata-class calls preferred throughout, no
full-document fetch queued since AWS already gives those free) and
`docs/BHARATLAW_NYAI_WORK_QUEUE.md` (hard cases only, per the mission's own
instruction not to waste credits on questions LawMind already solves — the
7 unresolved `overruled_in_part` treatment edges from `TREATMENT_GRAPH_
GAP.md`, counter-authority, long-document, currentness; explicitly no
model/weight extraction, since `/nyai` is orchestration over third-party
models, not a trained model).

**BNSS and BSA handbook siblings to the already-verified BNS handbook,
verified.** Both downloaded (`bprd.nic.in/uploads/pdf/`, HTTP 200) and
`pdftotext`-extracted: BNSS handbook 797,158 chars (Chapters I-XXX, 10.2x
its own comparison table), BSA handbook 257,046 chars (Chapters I-XII,
8.6x its own comparison table). Both self-describe as commentary, not the
statute — classified accordingly, distinct from the correspondence tables
already held. `docs/SOURCE_REGISTRY.md` §5f, routed to LCC (bus 0604).

**CCI/CAT tribunal archive sizing — started, blocked on the same network
flakiness this session's own `SOURCE_REGISTRY.md` §2b already documented
(three `os error 10060`s on the CCI PDF download 16 Aug).** `agent-browser
open` against `cci.gov.in/antitrust/orders` did not return within 120s this
session and was moved to background; not yet resolved as of this entry.
Continuing once it returns rather than declaring a fresh finding from one
slow page load.

**Not started this session, correctly deferred:** coverage-refresh-against-
local-DB (mission's own instruction is "after local cutover approval" —
`docs/CURRENT_PLAN.md`'s NEW2/LCC entries above show the freeze is still
on, `LOCAL_READY_FOR_POST_MIGRATION_GATE` went only to NEW1's gate, not a
general go-ahead); retrieval-failure-driven queue items (no fresh NEW1
failure batch exists yet this session to consume — noted in `INDIANKANOON_
WORK_QUEUE.md` rather than fabricated).

**UPDATE — CCI/CAT closed by NEW2 (bus 0605) within the hour**, independently
re-verified (byte-identical PDF fetch) and folded into `CORPUS_ACQUISITION_
QUEUE.md`. Stale background `agent-browser` task killed (`TaskStop`), superseded.

**Second pass, same session — wider search per the founder's direct ask for
more data.** Five new findings via `WebSearch`/`WebFetch`/`agent-browser`
(all read-only, nothing written to any DB):

1. **RERA tribunals — new category, 28+ state sites, no central repo.**
   Piloted Maharashtra: no CAPTCHA, live table, current data, date/text
   filters — document link is a JS handler, not yet resolved to a direct
   PDF URL or exact count (one step short of CCI's closure).
2. **District Courts — still no bulk text source**, now checked a second,
   independent way. DDL Judicial Data Portal's 81M-case dataset is
   metadata-only (2010-2018), same shape as the existing NJDG negative.
3. **Third-party eCourts scrapers claiming District Court access via
   "automated CAPTCHA handling" are explicitly OUT OF SCOPE** — checked
   against `ECOURTS_AUTHORISATION.md`, whose own text scopes the bypass
   grant to "the bulk cause-list path in `ecourts.ts` alone." Flagged so
   nobody adopts one under the mistaken belief our existing grant covers it.
4. **SCC Online / Manupatra downgraded from "access model unknown" to
   "confirmed subscription/IP-based only, no bulk API found for either."**
5. **CIC re-checked, unchanged** — still CAPTCHA-gated, no bulk mechanism.

All five routed to NEW2 (bus 0609), folded into `CORPUS_ACQUISITION_QUEUE.md`
SOURCE_QUEUE rows 4/4b/5/6/7.

---

### Q1.61 · P0 FQ-PGSERVICE CLOSED TO THE ELEVATION BOUNDARY, P2 DIAGNOSED (THE INDEX ALREADY EXISTED), P3 REBUILT FOR 7.3M · LCC, 17 Aug 2026

**Landed and verified by execution.**

**P0 — the `0xC000013A` crashes.** NEW2's mechanism (bus 0597) is correct and the
explanation previously written in `pg-local.mjs` was one level off: it blamed
`spawn(detached)` and moved the start to Task Scheduler, which is why the crashes
continued *from inside a scheduled task*. `pg_ctl start` on Windows shells out
through `cmd.exe`, so the postmaster inherits that `cmd.exe`'s console and hands
it to every backend it forks. Confirmed from this side — postmaster 27764, live
`cmd.exe` parent 6848, whose own parent 22364 is long gone.

- The start path no longer uses `pg_ctl`. `spawnPostmaster()` spawns
  `postgres.exe` directly with `detached: true` = `DETACHED_PROCESS`: **no
  inherited console and no new one.** Tested with a control that discriminates,
  across a real harness console teardown — `detached: true` ALIVE,
  `detached: false` DEAD.
- Boot persistence **restored without the founder**: the `Access is denied` on
  `Register-ScheduledTask` recorded in `FOUNDER_QUEUE.md` **does not reproduce**.
  The task exists again (`Ready`, `AtLogOn`), and its action is
  `pg-local.mjs spawn-detached`, never `pg_ctl`.
- NEW2's `-t 120` finding (bus 0585) is retired permanently rather than by
  raising the number: **there is no `-w` on this path**, so no timeout can
  mislabel a successful start as a failure. Readiness is `pg_isready`, which
  distinguishes "postmaster up" from "accepting connections" — the 150.9s crash
  recovery is exactly the window where those differ.
- `scripts/migration/pg-service-verify.mjs` — **6/7**, and the one FAIL is
  honest: the *running* server still has its old `cmd.exe` parent because it has
  not been restarted. It checks the running server and the thing that starts it
  **separately**, because they fail independently and only one is ever looked at
  (bus 0510's shape; this machine was found with 12 healthy postgres processes,
  0 services and 0 tasks).
- **What still needs the founder is now smaller and precise:** a task starts at
  LOGON, a service starts at BOOT. An unattended box that reboots at 03:00 and
  sits at the login screen is a database that is down. `LocalSystem` is verified
  to have `FullControl` on `C:\lawmind\pgdata`, so the filed command needs **no
  account password**.

**P2 — and it is not the defect it was filed as.** `EXPLAIN` (no `ANALYZE`, so it
executes nothing and does not contaminate NEW1's running gate):

| query | plan |
| --- | --- |
| `exactCitation` today | **Seq Scan** + Function Scan |
| `exactCitation`, neutral arm alone | **Index Scan using `judgments_neutral_citation_key`** |
| `exactCaseTitle` today | **Seq Scan** |

`judgments_neutral_citation_key` already exists, already matches the predicate
byte-for-byte, and is 70 MB. **The `OR EXISTS (SELECT 1 FROM unnest(...))` arm
cannot be indexed under any circumstances, and one unindexable arm discards the
good index across all 7,296,068 rows.** Measured sparsity makes it sharper: only
**0.53%** of judgments carry any reporter citation, so an arm that can match
under 1% of the corpus costs a full scan on 100% of citation lookups. Written up
in `docs/ops/migration/HOTPATH_MEASUREMENTS.md`, including why the `Total Cost`
figures understate it (a `LIMIT 2` startup estimate, not the scan).

Built and waiting on the gate: migration `0052`, the `retrieve.ts` `UNION`
rewrite, and `hotpath-measure.mjs`, which compares the two shapes' **output**
before their timings and **refuses to print timings if the rows differ**.

**P3 — the resolver.** `CORPUS_KEYS` materialised `judgments ×
unnest(reporter_citations)` UNION neutral citations UNION aliases, ran a LATERAL
regex over every resulting string and grouped the lot — **four times in one
`--apply --external` run**. Replaced by `judgment_citation_keys` (migration
`0053`, `citation-keys-cli.ts`): `(created_at, id)` keyset walk, never `OFFSET`,
resumable via checkpoint, incremental on insert, provenance (`source`,
`source_text`) preserved, `min(judgment_id)` promotion unchanged, no LLM
anywhere. The architectural change is `wanted` — resolution now reads **only the
keys the unresolved edges ask for**, through an index, instead of grouping every
key in the corpus to use a few hundred thousand.

**A REAL DEFECT THE REWRITE EXPOSED, and it could resolve an ambiguous key.**
`INTENT: code counted a key's targets only over citation forms from which a year
could be extracted; the task expects a key reaching two judgments to refuse;
CITATION_HARNESS §A3d.4 says exactly one target or nothing.` A set-returning
function in a LATERAL that yields no rows drops the row entirely, so a **yearless
citation form silently lowered the target count** — a key held by two judgments,
one of them yearless, counted as `targets = 1` and was **RESOLVABLE**. That is
guard #1 defeated by an unrelated year-extraction artefact, and a wrong
`cited_judgment_id` points an advocate at the wrong case. Fixed with
`LEFT JOIN LATERAL`: targets counted over judgments, years aggregated beside
them, and a yearless key now refuses **by the year guard** rather than vanishing
into `no key in our corpus`. **This will move the resolution numbers, and it may
move them DOWN — that is the correct direction.**

`--allow-stale` added: a citation-key index behind the corpus does not produce
wrong resolutions, it produces missing ones reported as `no key in our corpus`,
which is indistinguishable from a real coverage gap. Refused by default.

**P12 — the BPRD handbooks classified.** `DOMAIN_TRUTH.md` now carries the four
classes (PRIMARY STATUTE · OFFICIAL EXPLANATORY MATERIAL · CORRESPONDENCE TABLE ·
DERIVED LAWMIND OBJECT) with what each may be quoted as and trained on.
Government-published is not statutory: the handbooks are MHA work product that
self-describes as *"commentaries added to provide the rationale behind the
changes"*, and **explanatory material never populates `statute_sections`** — a
handbook paragraph in that table is indistinguishable from enacted text once
retrieved. Their size is not importance: BNSS is 10.2x its comparison table
because prose is longer than a table.

**HELD, deliberately, and this is the reason:** NEW1's post-migration gate has
been running against this cluster since 08:12 and is grinding through the exact
`cite:` predicate above at minutes per query. Restarting Postgres (to clear the
last P0 FAIL) or building indexes (P2) or walking 7.3M rows (P3) would all
compete for the IO their latency is being measured on. **Two numbers measured
through each other are two numbers nobody can use.** The freeze stays on, the
approval word is unsent, and P4 is not resumed.

---

### NEW3 · 17 Aug 2026, acceleration addendum pass

Per the founder's explicit instruction to stop reconfirming closed facts and
push the frontier outward: refreshed `docs/COMPETITOR_QUERY_INVENTORY.md` for
tomorrow's Supreme Today account arrival (added a Tier 0 for NEW1 failures —
none exist yet, checked not assumed; added counter-authority as Tier 8; fixed
a stale IndianKanoon line; flagged that Tier 1-4 populations need re-measure
against the live 7.29M+ table before being worked query-by-query).

**RERA: moved from a single queue row to `docs/RERA_STATE_MATRIX.md`**, a
per-state field matrix per the founder's own ranked-by-reasoned-decisions
correction. Delhi CLOSED this pass (481 documents, CAPTCHA gates the search-
refinement form only, base listing server-rendered and open, no
Roznama-equivalent category in the schema at all — a cleaner source than
Maharashtra). Karnataka partial: 9 real category routes found via `curl` on
the homepage, but the reasoned-decision route itself times out (both `curl`
and `agent-browser`, 20s/120s) — an SPA-route problem, not a CAPTCHA, next
step is the same apiUrl-hunt that closed Maharashtra.

**BPRD: three more official items found and classified** (SOP for FIR/e-FIR,
SOP for Crime Scene A/V Recording, an MP-Police-authored FAQ) — fit
`DOMAIN_TRUTH.md`'s OFFICIAL EXPLANATORY MATERIAL class structurally, flagged
a sub-tier distinction (the SOPs self-disclaim as non-legal; the FAQ is state,
not national, authorship) so this material doesn't get rendered with the same
weight as the BNS/BNSS/BSA handbooks. The originally-sought Compendium PDF
remains unfound — not chased by further blind filename-guessing.

**Manupatra/SCC: capability-only research**, per the founder's explicit
"do not automate their private services" instruction — public marketing
pages only, no login, no automation. SCC Online's TruePrint (court-
submittable authenticated PDFs) and Mercury (live cross-court case tracking)
are the two features that don't obviously overlap anything already
authorized; both vendors' treatment/citator data is human-editorial, unlike
NyaI's ambiguous computed-vs-curated status — worth knowing when replies
arrive and a value comparison against IndianKanoon/Supreme Today/BharatLaw
is due.

All read-only this pass — `curl`/`agent-browser`/`WebSearch`/`WebFetch` only,
freeze untouched, nothing written to any DB.

---

## NEW2 · 17 Aug 2026 — the starvation architecture is fixed, and a Poppler repair pass would have deleted Hindi

**STOP still on. 0 fleet processes. Nothing started, every check below is a dry
run.** The three canaries stay prepared and unlaunched;
`LOCAL_DATABASE_CUTOVER_APPROVED` has not been given and is not inferred.

### 1. Year-scope work is now DERIVED, not typed — `docs/YEAR_SCOPE_SCHEDULER.md`

`start-ingest-fleet.ps1` carried a hand-written rescue block: six courts got a
2023 worker, exactly one got a 2024 one (Manipur, 18,745 documents), while
Allahabad, Bombay and Telangana held **zero** 2024 documents against 264,889 /
277,355 / 38,931 at source. Adding the three missing lines would have closed that
hole; **every year rollover re-creates it**, and a typed list cannot roll over.

`scripts/migration/new2-yearscope-plan.mjs` derives every scope from
`source_count - held_count` per court-year. No literals: the band ceiling is
parsed from the launcher's own `-ToYear` and the tool refuses if it cannot be,
and `RECENT_FROM = currentYear - 1` makes 2025 become backlog next January by
itself. **65 candidate scopes**; the launcher starts tiers 0-2 (**19 workers**, up
from 7 typed names) and `-PlanTiers` widens it.

Two guards, both heuristics, both stated: `source` counts DOCUMENTS and `held`
counts JUDGMENT ROWS, so `remaining` never reaches zero on a fully-read court —
`--min-remaining 1000` and `--max-held-pct 0.97` are what stop finished scopes
relaunching forever. **`remaining` is the size of the fetch, not the authority gap.**

**Beyond the 16 known bands: 47 of 65 scopes with measured work have no launcher
line, behind them 5,295,135 remaining documents.** The largest slice is 2016-2022
— 11 courts, 2,244,160 documents — where the hand list covers 6 of the 17 courts
with work, and four of the missing ones hold **0.0%** of that band while having an
unscoped worker whose range includes it. That is the starvation mechanism measured
rather than argued. Reachable now via `-PlanTiers '3,4'`; it stays a rung decision.

Three scopes the old block launched every boot are no longer started (`3_22-y2023`,
`10_8-y2023`, `8_9-y2023`) — all at 99.9-100% held with 158, 27 and 14 documents
remaining. Correct, and now **checkable**: every exclusion is listed with its
numbers, never counted.

Companion fixes so two tools cannot disagree in print: `new2-rung-plan.mjs` reads
the plan when deciding startability (without it, nineteen live scopes read as
`ORPHANED`, its loudest verdict, and it would have been wrong about all nineteen);
`orphanedCount` 3 → **0**; the launcher gained a second duplicate guard, `-DryRun`,
and a warning when `-Only` and `-PlanTiers` silently compose to zero workers.

### 2. CX1's bake-off, integrated — and the integration is a REFUSAL

CX1 answered the open Poppler question in `DEVANAGARI_EXTRACTION_DEFECTS.md` §4
with a third outcome neither branch predicted: Poppler is not clean and does not
show the same control bytes — **it returns no Devanagari at all. 32 of 32
documents, 28,285 tokens to zero**, 27 of 32 outputs pure ASCII. CX1 caught this
and said so in its decision; independently verified here document by document.

**The dangerous half is that "0 defects" reads as a win**, because every defect
metric counts events *inside* Devanagari text. Two live consequences, both closed:

- `bakeoff-results.json` recorded `orphanedMatras: 0` for Poppler with no
  usability flag, so anyone integrating from the JSON rather than the prose got
  the opposite of the right answer. Aggregates now carry `usable` and
  `devanagariDropped`; `--reaggregate` rescores a completed run without refetching
  32 PDFs or rerunning eight 4.3-second OCR passes.
- **`reextract-cli.ts` would have written it.** `classifyCorruption` reads only
  `[A-Za-z]` shapes and ten English probes, so ASCII-only Poppler output scores
  CLEAN; "never shorter" fails because deleting Devanagari does not always shorten
  the file — document `04ceaa01` went from 2,252 characters with 8 Devanagari
  tokens to 2,314 with none. Longer, clean, missing its Hindi, over the only copy.
  `services/ingest/src/script-retention.ts` gates that write with CX1's 80%
  retention thresholds and reason code `DEVANAGARI_SCRIPT_LOSS`, reported on its
  own counter line — a script loss is not a length problem and must not share a
  counter with one. 12 tests, one of which asserts `classifyCorruption` would have
  let it through.

### 3. Tribunals shaped, not ingested — `services/ingest/src/tribunal-routing.ts`

CCI / CAT / RERA route to `legal_document`, never to `judgments`, and
**Roznama is excluded from authority by default** — 41,791 of 49,167 Maharashtra
RERA records; the reasoned population is **7,376** and that is the only number
worth quoting for it. Whitespace and case variants are folded, because the live
data has them and an exact-string match would have leaked them into the authority
bucket. An unrecognised type is held `unclassified`, never guessed. There is no
`legal_documents` table — that is LCC's lane and the proposal is bus 0613 — so
this names the destination and refuses to invent columns. Nothing here authorises
a fetch: CCI/CAT/RERA are not in `CLAUDE.md` §6a.

### Verified

`-DryRun` 55 workers with argv printed · plan/rung tools agree · `check-stop-coverage`
PASS · ingest `tsc` clean · **638 ingest tests, 627 pass, 0 fail, 2 skipped**
(19 of them new). Fleet processes **0**, STOP present, no database write of any kind.

### Not established

`remaining` is a floor (source snapshot 11 Aug, held 17 Aug). `0.97` is calibrated,
not measured. **Supreme Court of India cannot be scheduled at all** — 38,342 rows
held, no source count exists, so it sits in `heldWithNoSource` and in no tier; it
is the court that binds every other one. No throughput claim: nothing has run.

`scripts/check-alert-coverage.mjs` is RED and was already red — 2 of 4 PD-5
triggers have no `alert_kind` value. Untouched by this work, LCC's lane.

**Addendum, same day — Delhi RERA routed, and the CX1 lane split is now standing.**
NEW3's bus 0634 closed Delhi (481 documents, server-rendered, CAPTCHA gates only
the AJAX narrowing handler). It routes `unclassified`, not `legal_document`:
**the listing has no type column at all.** The URL path says "Judgements/Final
Orders" and that is a label, not a field — Maharashtra's listing looked like a
decision table too and was 85% Roznama, detectable only because
`judgment_order_type` existed to read. Delhi removes the field, so the same error
would be undetectable rather than merely unnoticed. A test asserts the string
`Judgement` promotes a Maharashtra record and does **not** promote a Delhi one.

Per the founder's CX1 coordination addendum: **CX1 owns expanded extraction
validation, the Silver production prototype, and the classification audit. NEW2
reviews CX1's evidence and owns ingestion/extraction integration** — actual
ingestion, checkpoints, coverage, eCourts live acquisition, source quality,
canonical cleaning. NEW2 does not run another large OCR/Silver/classification
benchmark unless CX1 reports one blocked or insufficient. Today's Devanagari work
is that split working: CX1 ran the bake-off, NEW2 verified it per-document and
gated the write path. NEW3's offer to characterise Delhi's extraction was declined
on this basis and routed to CX1.

---

## NEW2 · 17 Aug 2026 (evening) — CUTOVER EXECUTED, fleet live, and CX1's unfinished work inherited

**`LOCAL_DATABASE_CUTOVER_APPROVED` received from LCC (bus 0646). STOP removed
15:50:23Z on that word, not on an observation.** Sequence was canary → verify →
scale, per the founder's acceleration addendum.

### Canaries: 7 PASS, 0 FAIL

Restore completeness 7,296,068 · dedup constraint present · 100.0% of a 5,000-row
sample carry `full_text` · **+9 rows in 60s** · 2 checkpoint offsets advanced · no
established connection to `hayabusa.proxy.rlwy.net`.

### Two defects in `start-local-canary.ps1`, reachable ONLY on the real path

The prepared canary **failed on first real execution**, at the moment the freeze
lifted:

1. **`$psi.ArgumentList.Add()` on a null.** `ProcessStartInfo.ArgumentList` is
   .NET Core; Windows PowerShell 5.1 is .NET Framework and has no such property.
   No `pwsh` on this machine. `-WhatIf` returns before that branch, so **the dry
   run passed cleanly the minute before the real run died.**
2. **`Process::Start` with `UseShellExecute=$false` and no redirect hands the
   child the parent's console** — the 0xC000013A mechanism that killed 38 workers
   95s after boot on 15 Aug. Three canaries sharing the agent's console would have
   died when it closed, and that failure would have read as *"the local database
   cannot sustain workers"* on the run built to answer exactly that question.

Both now use the proven `Start-Process -WindowStyle Hidden` pattern with per-scope
redirection. Child-only env injection unchanged; `.env` untouched.

### Rung ladder — measured, and short windows lie

| rung | window | rows | rate |
| --- | --- | ---: | ---: |
| 3 canaries | 60s | +9 | 540/hr |
| 8 | 326s | 37,155 | 410,300/hr |
| 16 (first window) | 580s | 34,583 | 214,700/hr |
| 16 (settled) | 133s | 22,425 | **~607,000/hr** |

**The first rung-16 reading was startup-contaminated** — eight new scopes scan and
resume before they write. It read as a halving and would have stopped the ladder
on an artefact. The settled rate is above rung 8. **No scale past 16 without a
longer window**: the rung-8 figure begins on five virgin scopes, which is the most
flattering moment a scope ever has, and neither short reading is quotable.

Corpus **7,296,068 → 7,417,330**.

### The scheduler earned its place on the first run

All 13 scopes added at rungs 8 and 16 are scopes **no launcher could have started
before today**. Five are tier 0 — zero held against real source: `27_1-y2024`
(277,355), `9_13-y2024` (264,889), `21_11-y2023` (111,641), `28_2-y2023` (99,768),
`29_3-y2023` (80,102). That is the 2024 hole from bus 0607, started from a
generated plan rather than from three lines somebody remembered to type.

### Lint: my lane is clean (LCC bus 0652)

`eslint` 0 errors · `tsc` clean · 495 tests, 493 pass, 0 fail, 2 skipped. Three
findings worth more than the counts:

- **`statute-correspondence.ts:153` carried a literal U+00A0 inside a regex.** Same
  class as LCC's `canonPunct()` fix. Now ` `; zero non-ASCII bytes in the file.
- **`enrich-cli.ts` counted `skippedMissing` and never printed it.** Lint called it
  unused; the real defect is that a document whose unit fails to load is absent
  from `cacheHits`, `calls` and every tally while `refs.length` still counts it as
  input — the totals did not add up and nothing said so. Deleting the variable
  would have made the arithmetic consistent by making the loss permanent. Now
  printed unconditionally.
- Scratch debris deleted after checking for references: `_scratch_downstream.mjs`,
  `_pop.ts`, `tmp-scan2.ts` (git-tracked). `baseline-extra-scratch.mjs` left alone —
  NEW1's lane.

### CX1 hit its usage limit — NEW2 inherits the unfinished extraction/Silver work

**Accepted without retest** (founder's handoff addendum): the 32-document
Devanagari bake-off; Silver's 365,588-judgment / ~1.89 GiB measurements, partition
by court, ZSTD 9, ~32 MiB row groups, ~128 MiB objects, 64–256 MiB band, and
court/year physical partitioning rejected for tiny objects. The 117.88x synthetic
figure stays INVALID and is quoted nowhere as a planning number (verified).

**Inherited and NOT started:** CX1's prepared 148-document stratified Devanagari
validation across nine courts (`docs/ai/CX1_DEVANAGARI_SCALE_VALIDATION.md`,
selector SQL prepared, never run) measuring **semantic** preservation — case
names, citations, dates, section numbers, statute names, paragraph boundaries —
not merely Unicode cleanliness. Deferred deliberately: CX1's own gate
`cx1-heavy-lab-runner.mjs recommend` reports **MEDIUM — 84 heavy processes, RAM
free 15.3%, oldest xact 688s**, which is my fleet. **Corpus growth outranks OCR
science**, so it waits for a quiet window rather than competing with ingestion.

Also inherited and not started: the Silver production replay (offline writer,
checkpoint/resume, content hashes, atomic completion, failure injection) and the
document-classification frequency audit.

### §G — bad-text populations published rather than rediscovered

Sent to NEW1 and LCC (bus 0662/0663) so neither lane re-measures them: Devanagari
65.1% defective overall with Rajasthan at 95.3% and Patna the only clean control;
Poppler deletes the script entirely; Bombay font-cmap 37.0%; Gujarat/Telangana
leading-character loss; **Punjab & Haryana where `pdftotext` returns 54% LESS**, the
opposite trap. The general rule handed over with them:
`SOURCE HAS DEVANAGARI + OUTPUT HAS ZERO DEVANAGARI = AUTOMATIC REJECT`.

### Not established

Neither rung rate is final — sampling continues. No claim that 16 is the right
rung. The eligibility-field set for §G is a **proposal to LCC, not my edit**, and
NEW1 has been asked which fields they would actually filter on before columns get
proposed that nobody uses.

**CORRECTION to the rung table above, same evening.** Two claims in it were wrong.

**The fleet was 14, not 16.** `hc-boot-10_8` and `hc-boot-hist-27_1` — two of the
three canaries — were killed inside 20 seconds by a transient `EPERM` on the
checkpoint rename (`saveCheckpoint`, `hc-load-cli.ts:377`), and `supervise.mjs`
correctly abandoned both after three restarts. **`verify-local-canary.mjs` printed
7 PASS anyway**, because `local inserts` and `checkpoint advance` are AGGREGATES:
the one surviving canary was inserting and advancing briskly and passed both on
its own work. The fleet ran 27 minutes at two-thirds width with the cutover on the
record as clean. *"Verify by row growth, not process count" is the right rule and
it is not sufficient — row growth is summed over scopes and a dead one contributes
zero silently.*

**The lock was transient, tested rather than assumed:** the same rename over the
same path succeeds afterwards and neither checkpoint is held open. Millisecond
external hold — scanner or indexer on the just-written `.tmp`. Nothing in this
lane races those paths.

Two fixes landed: `renameWithRetry` (6 attempts, 20–320ms, only EPERM/EACCES/EBUSY,
**last failure still rethrown** — a checkpoint that silently fails to save is worse
than a crash), and an `every scope alive` check in the verifier that reads each
scope's supervisor give-up line, parses scope names from the canary script rather
than retyping them, and runs **before** the mid-load refusal — that guard was
written for LCC's restore and post-cutover the fleet itself is a bulk load, so it
now fires constantly and would suppress the one check that catches a dead scope.

**The "halving" at rung 16 was an artefact twice over** — a startup-contaminated
window AND a fleet two workers short:

| rung | window | rate |
| --- | --- | ---: |
| 8 | 326s | 410,300/hr |
| "16" (really 14, startup) | 580s | 214,700/hr |
| 14, settled | 398s | 586,500/hr |
| **16, clean** | 198s | **657,000/hr** |

Throughput **is** improving 8 → 16. Still no scale to 24 on a short window — a
longer sample is running and the decision waits for it. Corpus **7,296,068 →
7,509,955**, +213,887 since cutover. 16 supervisors verified **by name**, not by
count.

**Rung 20, and the ladder stops here.**

| rung | method | window | rate |
| --- | --- | --- | ---: |
| 8 | `count(*)` delta | 326s | 410,300/hr |
| 16 (clean) | `count(*)` delta | 264s | 681,300/hr |
| **20** | `n_tup_ins` delta | 240s | **713,059/hr** |

**+4.7% from 16 to 20 is not an improvement, it is noise.** The same rung 16
produced 214,700 / 586,500 / 657,000 / 681,300 across four windows as startup
effects decayed, so a 4.7% step sits well inside the spread. The founder's rule is
"scale beyond 16 only when measured useful-documents/hour improves"; this does not
clear that bar, RAM free is flat at 15.2% across 16→20, and the marginal return
has visibly flattened. **Holding at 20. Not going to 24/32/38.** The bottleneck is
more likely upstream PDF fetch than worker count, and that is the next thing to
measure rather than to out-spend.

**A measurement caveat that matters more than the numbers.** The rung-20 figure
uses `n_tup_ins` and the earlier ones use `count(*)` deltas — **because `count(*)`
over 7.5M rows became so slow under 20 writers that the sampler produced one line
in six minutes.** The measurement was degrading the thing it measured. `n_tup_ins`
is a counter read, not a heap scan. The two methods are not strictly comparable
and the 4.7% should not be read as precise for that reason too.

Corpus at hold: **7,540,767+** (`count(*)`), +244,699 since cutover. 20 supervisors
verified **by name** with no supervisor give-up line on any scope.

Guards green: `check-stop-coverage`, `check-schema-truth`, `check-amber-reservation`,
`check-contract-status`, `check-design-rules` all PASS. `eslint` 0 errors in this
lane, `tsc` clean, 495 tests / 493 pass / 0 fail / 2 skipped.

**Two scopes finished CLEANLY within the hour, and one of them found a hole in the
scheduler's semantics.** Fleet reads 18, not 20, and neither missing scope died —
`supervise.mjs` logged *"worker finished cleanly after 0 restart(s)"* for both.
Distinguishing that from the morning's EPERM deaths is exactly why the give-up
line is what the liveness check reads.

`hc-boot-23_23-y2024` was ranked at **15,890 remaining** and finished with
**15,869 `pdf_missing`** — metadata in the parquet, documents absent from the
bucket. Genuinely recoverable: about **21**. Every other scope measured shows
single-digit to low-thousand `pdf_missing` against hundreds of thousands held, so
it is a per-scope property, not a corpus-wide correction to `remaining`.

**`maxHeldPct` does not catch this** (23_23 sits at 43.6% held, far from the 0.97
gate), so the next plan regeneration will rank it at ~15,890 again and the fleet
will re-scan and re-404 fifteen thousand documents. Same waste loop the threshold
exists to prevent, through a door it does not watch. **Next scheduler refinement:
feed observed `pdf_missing` back into the plan.** Not built — it needs
`pdf_missing` persisted more durably than a log tail, which is a design question
rather than a patch. Recorded in `docs/YEAR_SCOPE_SCHEDULER.md` §8 so it is not
rediscovered as "a worker that finishes suspiciously fast".

---

## NEW2 · 17 Aug 2026 (late) — `hc_ingest_ledger` was built in migration 0047 and NOTHING had ever written it

**Correction to my own note above.** I wrote that feeding `pdf_missing` back into
the scheduler "needs `pdf_missing` persisted somewhere more durable than a log
tail, and that is a design question rather than a patch." **Wrong.** The durable
home has existed since migration `0047_hc_ingest_ledger.sql` — applied to the
database, two purpose-built indexes, a header describing the exact semantics.
`grep hc_ingest_ledger services --include=*.ts` returned **nothing**, and the
table held **zero rows**. Built, applied, never wired. Same pattern as
`lawmind-built-but-unreachable`, and I claimed a gap without checking the
directory — the specific mistake my own memory warns about.

### What it costs to not have it

`judgments.source_url` is a SUCCESS ledger and `existingSourceUrls` consults it,
so a written document is never re-fetched. **A FAILED document left no trace**, so
every restart re-downloaded every failure forever, with no way to tell "not yet
tried" from "tried three times".

Measured, not hypothesised: `hc-boot-23_23-y2024` was scheduled against **15,890
remaining** and recorded **15,869 `pdf_missing`** — metadata in the parquet, PDFs
absent from the bucket, roughly **21** genuinely recoverable. That scope paid
15,869 404s on every start and would have gone on doing so.

### Wired now — `services/ingest/src/harvest/ingest-ledger.ts`

Read side: `permanentlyFailedUrls` filters `todo` alongside `existingSourceUrls`,
counted as `ledger_permanent_skip`. Write side: `recordFailures` upserts every
skip with its URL, court and year. `clearSucceeded` deletes the row after a
successful upsert so the success and failure ledgers cannot disagree.

Semantics taken from the migration's own header, not invented: metadata-row
defects (`no_title`, `no_decision_date`, `unparseable_date`, `no_pdf_link`,
`test_fixture_bench`) are **permanent on first sight** — the bytes read identically
on attempt 10. Fetch/parse failures (`pdf_missing`, `pdf_timeout`, `pdf_failed`,
`no_text`) retry to **MAX_ATTEMPTS = 3**, matching this repo's standing "3 failed
cycles" rule. **The promotion is decided by the database from accumulated
`attempts`**, not by a per-process counter — an in-memory count resets on every
restart, which is the exact failure being fixed. Both writers swallow their own
errors: an operational ledger must never lose a batch of judgments.

**Dry runs record nothing.** `--apply` is what makes a run's conclusions durable,
and a rehearsal that condemned documents to `permanent` would change what a real
run does.

### Verified by execution, against the real table

```
dry run  50 pdf_missing, LEDGER FAILURES 0        (dry runs record nothing)
apply    50 pdf_missing, LEDGER FAILURES 50       (rows land)
x3 runs  150 rows — all attempts=1, because the CHECKPOINT ADVANCED each run,
         so those were 150 DIFFERENT documents. The conflict path was untested,
         not broken, and I checked rather than assuming the upsert was wrong.
direct   attempts 1 -> 2 -> 3, permanent flips true at 3
         no_title -> attempts=1 permanent=true on first sight
         permanentlyFailedUrls returns both · clearSucceeded removes the row
         probe rows deleted afterwards
```

`tsc` clean · `eslint` 0 in this lane · 495 tests / 493 pass / 0 fail / 2 skipped.

One incidental fix: the map callback now has an **explicit** `MapResult` type.
The inferred union let `url` widen to `string | undefined` the moment the ledger
read it — two of the three skip branches returned no `url` at all, so those
failures would silently never have been recorded.

`ledgerWrites` is **printed** in the RESULTS block, not merely counted — the same
lint rule caught `skippedMissing` in `enrich-cli.ts` doing exactly that, and the
number answers "is the ledger actually being written".

### Still not done

The year-scope planner does **not** yet read the ledger, so `hc-boot-23_23-y2024`
will still be ranked at ~15,890 on the next regeneration. The ledger now makes
that fixable with a query instead of a design; it is the next step, not this one.

---

## NEW2 · 17 Aug 2026 (night) — THE WHOLE FLEET DIED ON A POSTGRES RESTART, and the retry that should have absorbed it could not see the error

**Found by checking the process table, not by an alert.** Supervisors: **0**.

```
postmaster restarted                     22:36:43Z
every worker died                        22:39:07Z - 22:39:41Z
FATAL uncaughtException: PostgresError: the database system is not yet accepting connections
[supervisor] died within 20s three times running (exit 1) — this is a defect, not a network blip. Stopping.
```

`supervise.mjs` applied its rule correctly to a false premise. A restarting
database is not a defect, and the fleet sat at zero until a human looked.

### Root cause: a SQLSTATE arriving in a field that only held errnos

`hc-load-cli.ts` **already had** a retry wrapper that would have absorbed this
entirely. It never fired: its classifier matched Node **errno** strings
(`ECONNRESET`, `ETIMEDOUT`, …) while a `PostgresError` carries a **SQLSTATE** in
that same `.code` field. `57P03` fell straight through to `throw`, hit the
`uncaughtException` handler, and exited 1.

**The audit is the real finding — every writer in the service had the same
hole:**

| CLI | before |
| --- | --- |
| `hc-load-cli` | retry wrapper, errno-only → died |
| `enrich-cli` · `paragraphs-cli` · `reextract-cli` | retry wrapper, message-regex, matches none of Postgres's wording → would die |
| `citations-cli` · `hc-classify-cli` · `citation-keys-cli` · `resolve-cli` | **no retry wrapper at all** |

Seven copies of one judgement call, wrong in every copy that existed.
`citation-keys-cli` is LCC's backfill, which they queued behind this fleet.

### `services/ingest/src/db-transient.ts` — the judgement lives in one place now

`isTransientDbOrNetworkError` covers the errno set **and** the SQLSTATEs a client
sees across a restart — `57P03` cannot_connect_now, `57P01`/`57P02` shutdown,
`08006`/`08001`/`08004` connection failure — plus a message backstop for paths
that lose `.code`. To a batch writer a database that is not there *yet* and a
network that is not there *yet* are the same event, survived the same way.

**Defects are still rethrown immediately and unchanged.** `23505`, `42601`,
`22021`, `42P01` are tested as NOT transient — retrying a constraint violation
turns a loud bug into a slow one.

**Budget raised 5 → 10 attempts, and the number is a measurement.** Five was
2+4+8+16+30 = **60s**; this cluster self-recovered in **150.9s** on 16 Aug (bus
0585), so the old budget expired less than halfway through a recovery already on
the record. Ten is **210s**. A test asserts the budget exceeds 150.9s *and* that
the old one did not, so nobody lowers it back without meeting that number.

Wired into `hc-load-cli` (local copy deleted, not duplicated), `enrich-cli`,
`paragraphs-cli`, `reextract-cli`. The four with no wrapper are reported to LCC,
not silently patched — adding a retry loop changes their control flow and one of
them is theirs.

`tsc` clean · `eslint` 0 · **506 tests, 504 pass, 0 fail, 2 skipped** (11 new).

### Fleet restored

Corpus **7,999,553** — it had reached 7,961,447 before the stall, so ~195k rows
landed after my previous check and ~38k since restart. Insert rate measured
**206,963/hr** on 9 workers while the remaining 10 were still launching.

### What this changes about how I check

Both stalls today were found by reading the process table, never by a check that
fired. The `every scope alive` verifier check added this afternoon reads the
supervisor give-up line and would have caught this one — it was not running,
because nothing runs it on a schedule. **That is the gap now: the check exists
and nothing invokes it.**

### The launcher then silently started 9 of 19, and that was a SECOND defect

Restarting after the Postgres outage, `-Only` with 19 names started **9**. No
error, no message — the launcher simply never returned. Two further invocations
did the same and left **seven orphaned `powershell.exe` processes** holding the
same spot.

**It hangs, it does not fail.** `Start-Worker`'s rotation check was
`Get-Content $log -Tail 40`. These logs reach **30 MB** and carry raw
PDF-extractor bytes — NUL and other binary, which `grep` reports as "Binary file
… matches" — and Windows PowerShell 5.1's `Get-Content -Tail` against that is not
a bounded read. A single scope did not return in **120 seconds**. The scope it
stopped on, `hc-boot-19_16-y2023`, simply has the largest log in the repo.

Replaced with a `FileStream` seek reading a fixed 64 KB from the end:
**60 ms against the same 30 MB log**, versus a >120 s hang. An unreadable log now
logs `WARN … starting anyway` rather than aborting — failing to rotate costs at
most one scope that exits early; failing to START is what this cost.

**And I made the same .NET mistake for the third time today.** The first version
used `[Text.Encoding]::Latin1`, which is .NET 5+; this host is .NET Framework, so
every open threw and ten scopes logged `WARN … unreadable` in a row. Harmless
only because the fallback starts the worker anyway. `GetEncoding(28591)` is
ISO-8859-1 and has existed since .NET Framework 1. The other two were
`ProcessStartInfo.ArgumentList` in `start-local-canary.ps1` (fatal, cost the
canary run) and the same assumption in this file.

### Fleet state, counted by name rather than by count

```
19 backlog year-scopes requested
12 live
 2 finished cleanly        hc-boot-9_13-y2023, hc-boot-23_23-y2024
 5 restarted               29_3-y2023, 22_18-y2023, 29_3-y2024, 33_10-y2023, 14_25-y2024
18 unscoped fleet scopes   STILL DOWN since the 22:39 outage — NOT restarted
```

**The unscoped scopes are down deliberately, and it is a real coverage gap I am
naming rather than hiding.** They serve the 2016+ window per court, which is
priority 5 in the founder's ordering ("remaining recent gaps"), while the 19
backlog year-scopes are priorities 1 and 2. Throughput also plateaued at ~16-20
workers, so restarting 18 more would not buy coverage — but the gap is real and
should be closed once the backlog band drains.

### One scope is looping on a third-party defect, not on our code

`hc-boot-29_3-y2023` hit the supervisor's **other** bound — *"exceeded 40 restarts
— stopping rather than looping forever"* — rather than the fast-death one, because
each attempt outlived the 20 s window.

```
FATAL unhandledRejection: Error
    at BaseExceptionClosure (unpdf@1.8.0/dist/pdfjs.mjs)
    at ModuleJob.run · onImport · resolvePDFJSImport · getResolvedPDFJS · getDocumentProxy
```

It rejects at **module import** of unpdf's pdfjs bundle, not on any document.
`Math.sumPrecise is not a function` appears as a non-fatal Warning in every
worker log and is the likely neighbour. Other scopes import the same module and
insert rows normally, so this is not a global break — most likely a module-load
race under concurrency. **Restarted once to see whether it reproduces; if it
loops again the unpdf version needs pinning and that is a real investigation, not
another restart.** Stated rather than retried blindly.

### The ledger is live in production and is already worth more than the fetch it saves

Grew **150 → 23,592 rows** under the running fleet — written by real workers, not
by my probe. The promotion logic is working in production too: one row has
already reached `permanent = true` after three attempts.

```
outcome        permanent    rows
pdf_missing    false       22,983
pdf_failed     false          616
no_text        false            9
pdf_failed     true             1

worst court-years
  15,845  27_1 (Bombay) 2023
   4,548  27_1 (Bombay) 2024
   2,578  9_13 (Allahabad) 2024
     150  23_23 2024
```

**Bombay 2023 alone has 15,845 documents whose metadata is in the parquet and
whose PDFs are not in the bucket** — the same shape as `23_23-y2024` (15,869 of
15,890), and Bombay is the largest single row in the coverage gap table. This is
precisely the intelligence the ledger was built to produce, and it lands directly
on the open scheduler question: `remaining = source − held` counts documents that
cannot be fetched, so the plan over-ranks these scopes and will keep re-scheduling
them.

**Next step is now a query rather than a design**: subtract
`hc_ingest_ledger` rows where `permanent = true` from `remaining` in
`new2-yearscope-plan.mjs`. Not built tonight — the promotions are still
accumulating (22,983 of 23,592 rows are at fewer than 3 attempts), so subtracting
now would use a number that is still moving.

### Throughput after everything

**503,936/hr on 13 workers**, consistent with the measured 16-20 plateau. Corpus
was 7,999,553 at the last full count and climbing.

### CX1's lint errors were inherited too, and the gate is now within reach

`ci:local` stops at lint, so **every guard behind it stays inert until lint is
green** — including `check-stop-coverage.mjs`, which LCC noted has not run in CI
once since the freeze began. Under the CX1 handoff its scripts are mine, so its
9 errors were mine to clear.

**53 → 19 errors.** What I fixed beyond my own files:

- **Two `no-control-regex` hits that must NOT be "fixed".** The control
  characters in `cx1-devanagari-bakeoff.mjs` and `cx1-select-devanagari-sample.mjs`
  are **the defect being detected** — the raw control byte standing where a base
  consonant should be, the one Devanagari defect class that destroys information.
  A rule that removed them would silently disable the detector while it went on
  reporting zero. Disabled in place with that reason written above the line.
- `Buffer` imported from `node:buffer` (2 uses), and `setTimeout` from
  `node:timers` in `scripts/supervise.mjs` — the fleet supervisor, mine.
- Four genuinely unused bindings removed after checking each was not load-bearing:
  `byId`, `classification`, `dr` in `cx1-heavy-lab-final.mjs` (verified the
  generated report already covers those sections — §12 Classification Backlog
  exists, so the reads were dead, not a missing section), plus `nameByCode` and
  `jsonPath`.

Verified the edits did not break the scripts: all five parse under `node --check`,
and `cx1-devanagari-bakeoff.mjs --reaggregate` still reproduces the same verdict
(`poppler usable=false droppedDevanagari=32/32`).

**Remaining 19, none of them mine:**

```
6  services/harness      NEW1
2  services/api          LCC/RCC
2  scripts/migration     LCC  (pg-local.mjs, regenerate-generated-columns.mjs)
```

Nine of those are in files another lane is actively working in, so they are
reported rather than edited. `services/harness/src/baseline-extra-scratch.mjs`
is the scratch file LCC flagged and I left alone — NEW1's to delete.

---

## NEW2 · 18 Aug 2026 — the backlog band DRAINED, and the fleet moved to 2016-2022

**Corpus 7,296,068 → 8,736,896 since cutover. +1,440,828 documents.**

The fleet reading zero this time was **success, not a stall**: **23 of 24
year-scoped scopes finished cleanly** (`worker finished cleanly after N
restart(s)`), which is the priority-1 and priority-2 band exhausted. Checked by
reading each log's supervisor verdict rather than inferring from the count —
the same distinction that mattered when two canaries were dead behind a passing
aggregate.

**The transient fix is proven in production.** Postgres restarted again (uptime
2h32m at the check, `n_tup_ins` reset to 124,566 confirms it). Under the old
classifier that meant three fast deaths and an abandoned scope. What the logs
show instead is *"finished cleanly after 1 restart(s)"* — the worker rode the
restart out and completed. That is `db-transient.ts` doing exactly what it was
built for, measured rather than assumed.

**One scope stays abandoned and I am not restarting it again.**
`hc-boot-29_3-y2023` reproduced the unpdf module-import rejection after the one
restart I gave it. I said at the time that a second occurrence makes it an
investigation rather than a fourth restart, and it is: `unpdf@1.8.0`'s pdfjs
bundle rejects at `ModuleJob.run`/`onImport`, with `Math.sumPrecise is not a
function` as the likely neighbour. Pinning or upgrading unpdf is the next move,
not another launch.

### LCC's 0670 changed what I believe about the 22:36 crash

They confirmed the ledger semantics — and better, said my choice was *more*
correct than their own header specified: it names the threshold but never says
where the count lives, so a per-process counter would have satisfied it while
resetting on every restart, rebuilding the exact bug the table exists to fix.

More importantly they supplied evidence I did not have: **no crash line in the
PostgreSQL log**, which points at a hard kill rather than a database fault, and
**RAM at 5.7% free with 71 node processes** shortly before. I had diagnosed
"Postgres restarted, workers must survive it" — correct and still necessary, but
it is only half. **The fleet may have killed the database.** 71 node processes
came from roughly 20 scopes at ~3.5 processes each, which is the width I had
settled on from throughput alone.

**So the rung is now bounded by memory, not only by throughput.** Restarted at
**8 scopes** rather than 20 for the 2016-2022 band: RAM free 36.3% at 8 scopes
against 5.7% at ~20. Throughput said 16-20 was the plateau; memory says the
plateau was also the cliff. Eight is the width that leaves headroom for the
database.

### Now running — tier 3, the largest single gap in the corpus

```
hc-boot-mid-9_13    1,875,249 remaining   8.8% held
hc-boot-mid-33_10     754,484              8.0%
hc-boot-mid-3_22      597,652             18.1%
hc-boot-mid-10_8      552,538             13.5%
hc-boot-mid-27_1      539,842             13.4%
hc-boot-mid-8_9       462,120             19.0%
hc-boot-mid-21_11     441,673              0.0%
hc-boot-mid-29_3      423,516              0.0%
```

Four of these had **no launcher line at all** before this session's scheduler,
and two hold **0.0%** of the band while having an unscoped worker whose range
covers it — the starvation mechanism measured directly.

### The ledger, after a full night

**58,117 rows**, 1 promoted to `permanent`. The promotion count is low because
most rows are still below three attempts, which is why the year-scope planner
still must not subtract it yet.

## NEW2 · 18 Aug 2026 — the scheduler was ranking documents that do not exist, and two years that were never the same year

Both defects made `remaining` a number nobody could act on. Both were found by
asking the data, not by reading the arithmetic. Neither self-corrects: each
survives a reboot, a fresh agent and a re-run, producing identical numbers for
the next person to trust.

### State at hand-off

| | |
|---|---|
| judgments | **9,350,544** (exact `count(*)`, 02:10Z) — was 7,296,068 at the 17 Aug snapshot |
| live scopes | 9 · eight `mid` 2016-2022 + `hc-boot-29_3-y2023` |
| free RAM | 24.4% at width 9 (LCC's postmaster kill was at 5.7% / ~71 node processes) |
| ledger | 66,838 rows · **65,465 `pdf_absent` permanent** · 1,368 retry pending · 5 other |
| per-scope health | all 8 `mid` verified INDIVIDUALLY: process, checkpoint mtime, source offset, and rows landing in their own 2016-2022 band |

### D1 · 63,322 documents were being counted as work, and 404 said otherwise

`hc-load-cli` matched `/→ \d{3}$/` and called every non-OK status `pdf_missing`.
`ingest-ledger` then retried that bucket three times, justified in its own header
on the ground that *"one request cannot tell a transient S3 hiccup from a
genuinely absent object"*.

The reasoning is sound and the premise was false — the status was in hand and was
being discarded. Probed 520 at random, then the whole population:

```
63,322 of 63,326 -> 404      0 x 5xx      0 x 2xx      4 network errors
```

Split by what the server actually said: **`pdf_absent`** (404/403/410, permanent
on sight) and **`pdf_unavailable`** (everything else, retry rule unchanged).
`pdf_missing` is kept as a retryable legacy value and never written again.

**The existing rows were NOT mass-updated.** A sample is evidence about a
population and this number decides whether an individual judgment is ever fetched
again, so `new2-ledger-absence-probe.mjs` HEADs them one at a time and promotes
only confirmed absences. A 2xx row is left alone rather than deleted —
`judgments.source_url` is the only record allowed to claim a success. `attempts`
is never incremented: a probe is not an ingest attempt.

Measured in the next scope's own RESULTS block, not predicted:

```
hc-boot-27_1-y2024   ledger_permanent_skip  34,242     <- skipped without a fetch
                     pdf_absent              3,405
                     WRITTEN                     5
```

34,242 GETs that scope used to re-pay on every restart, gone.

### D2 · `source - held` subtracted two different definitions of "year"

`source` counts the bucket's PARTITION year — the `year=2023` in the object key.
`held` counted `year(judgment_date)`.

```
Allahabad 2023   source partition          534,053
                 held by judgment_date     313,610  -> ranked #1 of 53, "220,443 remaining"
                 the worker's own RESULTS  532,089 already held
                                           +  1,964 absent  =  534,053   exactly
```

`hc-boot-9_13-y2023` was the **top-ranked scope in the entire fleet** on that
220,443. It ran to completion, wrote **zero** documents, and finished cleanly. A
partition records when the court PUBLISHED an object, not when it decided the
case, so a `year=2023` partition is full of judgments dated 2020 and 2024.

`new2-held-refresh.mjs` now emits both maps and names which is which.
**Coverage reporting keeps decision years** — it is asking a legal question, and
`cx1-corpus-census.mjs` is right to use them. Only the partition-year map may be
subtracted from source. A snapshot without it makes the planner print the warning
on every run rather than plan silently.

### D3 · The snapshot the whole fleet plans against could not be refreshed

`new2-held-by-court-year.json` recorded its own provenance as a `psql \copy`.
**There is no psql on this machine.** It could be read and never regenerated, and
was 1.9M rows stale while three tools treated it as current. A stale `held` does
not fail loudly — it inflates `remaining` on exactly the bands the fleet has been
draining hardest.

### D4 · P5, unpdf — not a packaging fault, and the first fix silently did nothing

`hc-boot-29_3-y2023` died three times in 32 seconds, and the supervisor correctly
retired it: a restart resumes at the same checkpoint and replays the same batch,
so the failure was perfectly repeatable. **One library-internal fault retires a
whole court-year.**

- `import('unpdf/pdfjs')` in an isolated process **succeeds**, 61 exports. Not
  packaging, not the runtime, not the install.
- The module job emits a **second** rejection that nothing here is on the chain
  of. Proved by adding `warmPdfEngine()` — the awaited import resolved, the run
  printed its file count, and the worker died anyway with the stack now naming
  `warmPdfEngine`. No `try/catch` in this codebase can reach it.
- The fatal handler now survives a rejection whose **throw site** is a
  dependency. The first version of that guard tested the WHOLE stack and did
  nothing, because an async stack always names the awaiting callers — caught
  because `SURVIVED` never printed once.

Verified live: the scope now logs `SURVIVED unhandledRejection #1/#2` and writes
at 18 docs/s where it previously died in 11 seconds.

### D5 · One Node process per scope was buying nothing

`supervise.mjs` spawned `npx.cmd tsx …` through a shell. The npx hop is a full
Node process holding ~79 MB to answer a question that is answerable statically:

```
supervise.mjs -> cmd.exe -> npx-cli.js -> tsx/dist/cli.mjs -> worker
```

~630 MB at the current rung, **~1.6 GB at the width where the postmaster was
killed**. Free RAM is the measured ceiling on fleet width, so a process per scope
is not bookkeeping — it is width. Now `node tsx/dist/cli.mjs` directly, verified
on a live launch (3 processes, no cmd.exe). Losing the shell also deletes the
argv re-splitting hazard the old code had to guard against by hand.

### Fleet-width position — HOLDING at 9, deliberately

8 remains the rung LCC's OOM evidence supports; 9 is one deliberate step with
24.4% free measured after it. **Not returning to 20.** Two scopes completed and
exited cleanly during this session (`9_13-y2023`, `27_1-y2024`), which is the
population shrinking for the right reason rather than dying.

`hc-boot-29_3-y2023` was started, crashed, and was restarted only after each fix
had a stated hypothesis — three attempts, three different root causes, the last
one verified. Not a retry loop.

### Q · NEXT, in order

1. **Re-rank the frontier on the corrected held snapshot.** Every year-scope
   number in the current plan is inflated by D2. Allahabad 2023 collapsed from
   220,443 to 0; the other six backlog scopes have not yet been re-measured and
   MUST NOT be launched on the old figures.
2. **P6 — the 18 down scopes.** D4 is a plausible cause for some of them: check
   each `*.super.log` for the `died within 20s three times` line before assuming
   anything else. Route survivors through the generated scheduler, never a hand
   list.
3. **P7 — quality fields.** NEW1 (bus 0676) wants `document_class` as a selection
   dimension and `script_quality`/`text_quality` as STRATIFIERS, not filters, and
   explicitly does not want OCR workflow-state fields. `hc_document_class` and
   `hc_class_method` already exist on `judgments`; `text_quality` exists as
   numeric; **`script_quality` does not exist.** Schema is LCC's — coordinate,
   do not add columns unilaterally.
4. **P8 Devanagari** — the 148-document stratified validation. NEW1 has confirmed
   (bus 0676) their `hindi` gold set is Hindi QUERIES against English SC text with
   zero Devanagari codepoints, so this is NOT blocking their benchmark. Ingest
   stays higher priority.

### Standing correction owed

`text_extraction_method` is **not universally populated** — NEW1 found it null on
all five `hindi` gold judgments. Anything using it as a denominator is measuring a
subset, not the corpus.

---

## NEW3 · 18 Aug 2026 — the source frontier: 12 RERA states measured, a third extraction failure mode, and the missing-PDF ledger turned into a costed recovery program

Discovery lane. **Nothing ingested, no worker started, no database written, no
Railway touched.** Every number below is a recorded HTTP response.

### What landed

| # | deliverable | file |
| --- | --- | --- |
| 1 | RERA frontier: **2 states → 12 states, 38,689 documents** measured and ranked by reasoned decisions, plus Karnataka's 11,707 matters | `docs/RERA_STATE_MATRIX.md`, `SOURCE_REGISTRY.md` §2c |
| 2 | **Missing-PDF source recovery**, costed, with a triage that runs at ₹0.05/document | `docs/MISSING_PDF_RECOVERY.md` |
| 3 | **Manupatra / SCC buy decision**, written before the quotes arrive | `docs/MANUPATRA_SCC_DECISION.md` |
| 4 | Supreme Today first-use manifest — **43 executable queries, generated not transcribed** | `docs/ai/SUPREME_TODAY_FIRST_USE_MANIFEST.json`, `scripts/new3-supreme-today-manifest.mjs` |
| 5 | Two founder questions, each with the work already done around them | `FQ-RECOVERY`, `FQ-RERA-10` |

### The three findings that change other lanes' work

**1 · There is a THIRD extraction failure mode and it defeats both existing
checks.** CX1 established mode 2 — Poppler deletes Devanagari and scores a
perfect zero on every defect metric by doing so. Chhattisgarh RERA is mode 3:
a text layer that extracts to long, clean, **pure-ASCII** output which is Hindi
in a legacy Kruti Dev-family font. Six subsetted `CIDFont+F*` fonts, `Identity`
encoding, six `/ToUnicode` CMaps — the extractor is correct per the file's own
map and the output is unreadable.

```
mode 1  no text layer                  detectable by LENGTH
mode 2  extractor deletes the script   detectable by SCRIPT RETENTION
mode 3  legacy font-encoded script     detectable by NEITHER
```

The only test is script plausibility. Kruti Dev → Unicode is a deterministic
remap and solved OSS territory, so this is a routing decision, not a blocker —
but nothing detects it today, and a Hindi-bearing *court* in this shape would
read as clean. Across ten sources the text layer varies four ways: digital,
absent, font-mangled, and **present-Unicode-and-silently-OCR-corrupted** (West
Bengal). Record the extractor and the script check per source, never per
category.

**2 · NEW2's 22,983 missing PDFs have a confirmed source, and the triage is
nearly free.** Indian Kanoon holds **325,674 Bombay HC 2023 documents** against
15,845 missing — verified live, a 20.6× superset — and `/origdoc/<id>` returns
the court's own copy. Triage on `citedby` from the search response costs
**₹0.05/document, ₹1,150 (~$14) for the whole ledger**; recovery is then
selective. Bulk recovery is explicitly wrong — most of this corpus is procedural
orders averaging 2,223 characters, so bulk-recovering buys the chaff back at a
price. **Do not price against 22,983**: that is the `pdf_missing` count, the
recovery population is `pdf_absent`, and today exactly one row is promoted
permanent.

**eCourts is ruled out for this act.** We hold a grant, it permits CAPTCHA
bypass, and eCourts obviously has these judgments — but the grant scopes bypass
to bulk cause-list harvesting in one named module, and §6 states that collapsing
two acts under one grant is how a bounded permission becomes unbounded.
Missing-PDF recovery is a third act. Routed to the founder as `FQ-RECOVERY`
rather than reinterpreted.

**3 · Manupatra/SCC: default SKIP, and one argument decides it.** Their unique
value is precisely the part we may not copy — `EBC v. D.B. Modak` protects
headnotes and editorial numbering, and everything outside that layer is raw
court text we already hold 7.3M documents of. Neither publishes an API at any
tier, confirmed by direct fetch. **A student or research price makes this worse,
not better**: cheap academic terms are more restrictive, and a cheap price on
unusable terms looks like a win. The only genuine residual gap is post-2018
parallel citations, benchmarked at **₹2,502 (~$30)** via Indian Kanoon `docmeta`
on a licence we already hold.

### The RERA ranking, by reasoned decisions — 12 states, 38,689 documents

```
Maharashtra  7,376 of 49,167 raw     Punjab       <=5,067  (scanned)
Chhattisgarh  3,687 (site pre-segments)  Tamil Nadu  2,967  (scanned)
Bihar        ~2,956 of 4,367  (digital text, no OCR needed)
West Bengal   1,816 complaints of 4,884 orders
Rajasthan       750 judgments + 11,523 orders -- the ONLY source publishing a disposal outcome
Jharkhand       218 (digital, site-labelled)   Goa 173   Delhi ~155   Telangana 90   UP 8
Karnataka    11,707 decided matters measured; documents not yet reached
```

Two structural findings make the eleventh state cheap: **`erera.co.in` is a
multi-state platform** (Punjab runs the identical application as Delhi, so
siblings can be sized before being fetched), and **three mechanism families
cover all ten states** — server-rendered whole listing · one unparameterised
AJAX call behind an empty table · Angular SPA with a private API.

One source **rejected**: `hprera.in` returns 200 and reads like an authority. It
is a WordPress affiliate blog (`/category/home-loans/`, `/hello-world/`). For a
government source, a 200 and a convincing name are not identity.

### A correction to this lane's own earlier work

I characterised Delhi RERA on 17 Aug as having *"no Roznama-style category…
structurally like Maharashtra's already-filtered bucket"*, flagged unconfirmed.
**Measured on a 34-document sample: 93.8% procedural.** The 481 files are hearing
*dates* bundling ~5.3 appeals each; the typical unit reads in full *"Bench could
not assemble today. Put up for same purpose on 03.11.2023."* NEW2 declined to
promote Delhi on exactly that doubt (bus 0640) and was right. The discriminator
they asked for exists but is post-extraction only — ≥3 numbered paragraphs **and**
≥1,500 chars per appeal-order unit; all 11 reasoned units have both, none of the
165 procedural ones has either.

### Second-pass corrections, all to this lane's own numbers

Recorded because each was caught by a check that should have run first.

- **Karnataka's "20 s+ timeout, 0 bytes, Angular SPA" was wrong three times over.**
  It answers in **7.0 seconds**, no session, no CAPTCHA. Zero `<tr>` is also
  correct — it is a *search form*, and its 4 MB payload is inline JavaScript
  holding **11,707 distinct decided matters**, 2023–2026. Largest RERA population
  after Maharashtra, and the number was sitting in the page through three passes
  that concluded absence. Documents still not reached; the result POST returns an
  identical 35,753-byte shell for three field combinations, so I stopped.
- **Rajasthan was written off as an Angular SPA because I checked the authority's
  domain and never the tribunal's.** `reat.rajasthan.gov.in` is plain
  server-rendered HTML: **750 appeal judgments with a DISPOSAL OUTCOME field**,
  digital text on 4/4 samples, plus 11,523 orders on a separate route.
- **Bihar's raw count was 5,081 and is 4,367.** The first pass counted every
  `.pdf` href on the page; 714 were not orders and **545 were cause lists** — the
  exact procedural class this work excludes. **Count by directory, not by
  extension**, and every state counted the old way needs the same re-check.
- **The Delhi discriminator does not transfer, and nearly produced a Bihar figure
  three times too low.** Delhi's test scores Bihar at 22.6%; a content test scores
  67.7%, and reading a boundary case confirms the content test — the Bihar
  authority simply does not number its paragraphs. **A discriminator is a property
  of the source, not of the category.**
- **Gujarat's diagnosis is now definite rather than a timeout**: client-side-only
  routing with **no server fallback**, so `/judgements/rera-judgement` and
  `/zzz-not-a-route` return byte-identical 404s. `curl` and `agent-browser` both
  fail on any deep link for the same reason, which is easy to misread as a tool
  limitation.

**Six ways a live source reads as empty**, collected: single-quoted `href` ·
unquoted `href` · opaque-token handler · numeric-id handler · empty table filled
by one AJAX call · data as inline JavaScript. A row count with no link count is
the tell one way; megabytes with no rows is the tell the other. And re-test a
timeout before building a theory on it.

### NEXT, in order

1. **Karnataka's form submission** — we now hold 11,707 real identifiers from the
   autocomplete, so the form can carry a value the server will match instead of
   an empty or invented one. A different experiment, not a fourth repetition.
2. **`erera.co.in` sibling sweep** — probe the three known routes against the
   remaining states and UTs. Confirmation, not investigation.
3. **Remaining states**: Telangana, Rajasthan, MP, AP, Kerala, and the ~14 not
   started.
4. **Bihar reasoned count** — run the Delhi classifier over a sample. 5,081 is an
   upper bound and it is the second-largest population in the matrix.
5. **Retest `bombayhighcourt.nic.in` from a different network.** If the court's
   own archive is reachable, the entire missing-PDF recovery cost goes to zero for
   the two worst populations. Single highest-leverage unknown open in this lane.
6. **Tier 0 stays empty by design** — NEW1's retrieval-failure queue outranks
   everything in the Supreme Today manifest and is not fabricated in its absence.

### CORRECTION to D2, made the same session, from the measurement that was supposed to confirm it

**D2's fix is right and D2's diagnosis of Allahabad was wrong.** Recording both,
because the wrong half was already in a commit message.

I attributed Allahabad 2023's phantom 220,443 to `source` counting partition
years while `held` counted decision years. Then I built the partition-year map
and checked:

```
9_13 / 2023   held by DECISION year   313,610
              held by PARTITION year  313,610     identical
```

For Allahabad the two definitions agree exactly, so the year mismatch cannot be
the explanation. The dual-year map is still correct and still needed — Bombay
2024 reads 208,822 by partition year and that is the figure its worker's own
`already_held` matched — but it did not cause this.

**The real cause is a third pair of incompatible units.** `source` counts parquet
ROWS across every metadata object in a partition; `held` counts DISTINCT
documents. A document listed in both `metadata.parquet` and its
`metadata-mobile.parquet` variant is counted twice at source and once when held.
The survey read all 1,493 objects' footers and summed them, so every court with
`hasMobileVariant: true` inherits this.

```
survey source rows          534,053
distinct rows in judgments  313,610
-> "remaining"              220,443

worker actually saw         532,089 already_held + 1,964 absent = 534,053
duplicate candidate URLs    532,089 - 313,610 = 218,479
```

**218,479 is, to the row, the `remainingActionable` the planner printed.** The
gap IS the duplication. No correction to `held` fixes it, because `held` is
right, and the subtraction has no term that can ever say "finished".

What CAN say so is the worker. `hc-load-cli` prints a `RESULTS` block only on
clean completion — `supervise.mjs` already treats that string as "do not
restart" — so a log ending in one is a scope that reached the end of its scope.
The planner now reads it and, when the last completed run wrote NOTHING, retires
the scope regardless of the arithmetic. Deliberately narrow: `WRITTEN` and
`MAPPED` must both be 0, and the RESULTS block must be the last thing in the log,
so a stale block above a newer partial run cannot retire a scope mid-recovery.

First run of that rule:

```
hc-boot-9_13-y2023    arithmetic 218,479  | worker saw 532,089 already held, wrote 0
hc-boot-23_23-y2024   arithmetic  15,740  | worker saw  12,296 already held, wrote 0
hc-boot-14_25-y2024   arithmetic   2,149  | worker saw   4,332 already held, wrote 0
```

**236,368 documents of phantom work retired**, and Allahabad 2023 stopped being
the top-ranked scope in the fleet. Every one is listed with its numbers rather
than counted, because this rule can retire real work and an exclusion nobody can
check is how the y2024 hole opened.

`hc-boot-27_1-y2024` is deliberately NOT retired: its last run wrote 5, so it
found work and may find more. The rule is meant to be conservative in that
direction.

### Correction to the fleet-width decision, which is larger

The postmaster deaths are **console control signals, not memory pressure**, and I
cut the fleet from 20 scopes to 8 on the memory theory.

```
2026-08-15 23:01  logical replication launcher  0xC000013A   STATUS_CONTROL_C_EXIT
2026-08-16 03:25  logical replication launcher  0xC000013A
2026-08-16 07:43  client backend                0x40010004   DBG_CONTROL_BREAK
2026-08-17 00:39  client backend                0xC000013A
2026-08-17 06:45  autovacuum worker             0xC000013A
2026-08-18 04:22  autovacuum worker             0xC000013A
```

Each followed by `terminating any other active server processes` /
`reinitializing` — one child dies on a console signal, the whole cluster goes
down. **`grep -i "out of memory"` across all four days of PostgreSQL log returns
nothing.** Not one line. LCC's "no crash line in the log" observation was the
strongest evidence and pointed the other way: there is no crash because it was a
signal.

`start-ingest-fleet.ps1`'s own header already documents 0xC000013A as the
signature of a shared console — it is the mechanism that killed 38 workers 95
seconds after boot on 15 Aug. Same code, different victim.

At 07:58:23 today `LawMindPostgres` was registered as a Windows service
(`pg_ctl runservice`, LocalSystem) and the cluster restarted into it at 07:59:54.
A service has no console and cannot be reached by a terminal's CTRL events, so
that removes the mechanism rather than the symptom. Sent to LCC (bus 0685) for
confirmation that it was theirs and is intended to stand.

**The width ceiling of 8 was derived from a theory the cluster's log contradicts
and should be re-derived, not left standing.** Holding at 11 until LCC confirms —
this is not an argument that 20 is safe, only that the number came from the wrong
reason.

### P6 · The 18 down scopes were never broken — nothing relaunched them, and they were the only thing serving 2025+

Audited all 62 supervisor logs. Eighteen carry
`died within 20s three times running (exit 1)`, and every one stopped within six
seconds of the others:

```
hc-boot-9_13   2026-08-17T22:39:03.720Z     hc-boot-27_1   22:39:03.703Z
hc-boot-3_22   2026-08-17T22:39:04.641Z     … 15 more, all 22:39:03-22:39:09
```

All eighteen on the same error:

```
FATAL uncaughtException: PostgresError: the database system is not yet accepting connections
    at existingSourceUrls (services/ingest/src/load.ts:154:22)
```

That is precisely the event `db-transient.ts` was written for, and the classifier
handles `57P03` correctly today — by code AND by message. **These deaths predate
the fix.** So P6 is not a bug: it is eighteen supervisors that exited and were
never started again.

**Why that mattered more than it looks.** Those unscoped `hc-boot-<court>`
descents are what tier 5 assumes is serving recent years. The plan ranks
2025+ LAST, and the reason recorded in the file is *"the descent is already
inside these"* — not a value judgement, an assertion about another worker. With
all 18 dead, **the lowest-ranked tier was the only completely unserved one:
844,514 actionable documents, for a day, with nothing saying so.**

Ranking is a decision; liveness is a fact. They should not live in the same
number. The tier ORDER is the founder's priority and is unchanged; what is added
is `descentServing` / `descentGap` on every tier-5 scope, read from the would-be
server's own supervisor log and printed at the top of the plan.

Acted on it with YEAR scopes rather than by restarting the descents — a year
scope is pinned and cannot be starved by the newest-first ordering, which is the
whole argument the scheduler exists for. Launched and verified writing:
`9_13-y2025` (311,256), `33_10-y2025` (162,690), `27_1-y2025` (152,460).

### The frontier, measured, after every correction in this session

| tier | scopes | actionable | band |
|---|---|---|---|
| 2 | 3 | 130,468 | backlog 2023-2024 |
| 3 | 17 | **4,811,477** | 2016-2022 |
| 4 | 17 | 3,536,687 | pre-2016 |
| 5 | 12 | 844,514 | recent 2025+ — was unserved |

~9.32M actionable documents remain, against 11.25M held. Four scopes retired as
exhausted (252,826 phantom documents) and 66,271 confirmed absent are already
subtracted from those figures.

### Scopes that completed cleanly during this session — not deaths

`hc-boot-9_13-y2023`, `hc-boot-27_1-y2024`, `hc-boot-28_2-y2023`,
`hc-boot-27_1-y2023`, `hc-boot-29_3-y2023`, `hc-boot-mid-21_11`. The last two are
worth naming: `29_3-y2023` finished with `DEPENDENCY FAULTS 116` — it survived
116 pdf.js rejections that would each have killed it before D4 — and
`mid-21_11` walked its entire 2016-2022 band and wrote 44,227.

A shrinking worker population is not automatically a problem. **Verify by scope
name and offset delta, never by count.**

### Closing state — 18 Aug 2026

```
judgments        12,148,177      from 7,296,068 at the 17 Aug snapshot  (+4,851,109)
                                 from  9,194,206 measured at session start (+2,953,971)
live scopes      11              8 x mid 2016-2022 + 3 x y2025, all verified by name
ledger           90,575 rows     85,073 pdf_absent (permanent) · 5,012 pdf_failed · 301 legacy
frontier         ~9.3M actionable across 49 candidate scopes
```

### TWO HANGS, both at the Postgres service restart, and a watchdog for them

`hc-boot-mid-3_22` stopped at 07:59:58 — the instant the cluster was restarted —
and sat 25 minutes. `hc-boot-mid-32_4` did the same later: **zero CPU across its
whole process tree over a 10-second sample**, 12.6 minutes of silence, worker
resident at 132 MB where a healthy one is 300-600 MB.

Neither was visible to anything. `supervise.mjs` reacts to the child EXITING —
restart loop, backoff, `consecutiveFast`, `MAX_RESTARTS`, the RESULTS sentinel,
all of it. A hang never exits. And from outside, the corpus was gaining ~800k
rows/hour from the other scopes, so **every aggregate looked healthy**. Both were
found by diffing per-scope checkpoint offsets by hand.

`db-transient.ts` cannot help and that is not a gap in it: a retry needs
something to catch, and a hang throws nothing.

The only signal a stalled worker emits is silence, so that is what is now
watched. `STALL_MS` defaults to 15 minutes, `lastOutputAt` comes from the
stdout/stderr handlers rather than the log's mtime (the log is shared across
restarts — its mtime is not *this* child's liveness), and the kill is SIGKILL
because the worker is wedged on a socket that will never answer. The kill makes
`close` fire, so the existing restart path applies unchanged and a worker that
hangs every time is still reported and stopped. Verified against a stand-in
worker that prints once and hangs forever.

### The whole fleet is now on one code path

Five scopes were still running the pre-change chain:

```
old   supervise -> cmd.exe -> npx-cli(79MB) -> tsx bin(61MB) -> tsx cli -> worker
new   supervise -> tsx cli(64MB) -> worker
```

Rotated all five. **Zero `cmd.exe` in any supervisor tree now**, node process
count 55 -> 50 for the same eleven scopes. Beyond the memory, the old chain meant
the supervisor was waiting on `cmd.exe` rather than on the worker — the thing it
watched was not the thing doing the work.

### What is NOT done, stated plainly

- **The survey denominator is still wrong.** The scheduler now works around it
  via the RESULTS rule; `perCourtPerYear`, the 20,529,203 figure and every
  coverage percentage still count parquet rows. Sent to NEW3 (bus 0692) with the
  one-comparison test that settles it. Ours is UNDERSTATED, which is the pleasant
  direction and still wrong.
- **Fleet width is held at 11 pending LCC.** The 8-scope ceiling came from an OOM
  theory the cluster log contradicts (bus 0685). I will not raise it until LCC
  confirms the service registration is theirs and intended.
- **`script_quality` is not built.** With LCC (bus 0681); `judgments` is theirs.
- **`hc_document_class` covers 8.9%** — 10,107,727 of 11,090,502 rows NULL when
  measured. NEW1 asked for it as their primary selection dimension (bus 0691);
  they owe me which population to classify first so the backlog is drained in
  the order their pilot needs rather than newest-first.
- **P8 Devanagari validation not started.** Correctly deprioritised: NEW1
  confirmed their `hindi` gold set carries zero Devanagari codepoints, so nothing
  downstream is waiting on it.
- **P9 eCourts live state not started.** Waiting on LCC's audit-actor/switch work.
- **P11 Silver not touched.** Deliberate — ingest was the priority all session.
- Three scopes were restarted during the closing verification and were still in
  their startup phase at the last offset sample. They are alive and logging;
  a stall now surfaces by itself within 15 minutes rather than needing a human.

### Two High Courts have a contiguous SEVEN-YEAR blackout, and it does not read as one

Looking for scopes with zero held documents turned up something sharper than a
percentage. These are not courts we have never touched — they are courts we hold
substantially, with 2016-2022 missing entirely:

| court | total held | held 2016-2022 | source in band |
|---|---|---|---|
| Calcutta High Court | 259,629 | **0** | 146,805 |
| High Court of Chhattisgarh | 236,165 | **0** | 215,270 |

A Calcutta advocate researching anything decided between 2016 and 2022 gets
nothing from us, while the same court answers for other years. That is worse
than a court we obviously do not have: the gap is invisible from inside a search
result, because the court is clearly present.

It does not show up in any coverage percentage either. Calcutta reads as a
well-covered court on any court-level aggregate; the hole only appears when the
denominator is court **x year**, which is exactly why `perCourtPerYear` is the
denominator the scheduler uses.

**Acted on within the width I am holding**, by rotation rather than addition:

```
stopped  hc-boot-mid-3_22   Punjab & Haryana, 67.0% held  ->  hc-boot-mid-22_18  Chhattisgarh, 0% in band
stopped  hc-boot-mid-10_8   Patna,            61.4% held  ->  hc-boot-mid-19_16  Calcutta,     0% in band
```

The trade is deliberate: finishing the last third of a court an advocate can
already use is worth less than the first third of seven years they cannot use at
all. Breadth is this lane's stated job. `hc-boot-mid-22_18` was writing within a
minute of launch — 200 documents at 11.7 docs/s into a band that held zero.

`hc-boot-hist-23_23` (Madhya Pradesh pre-2016, 104,831) is the third such gap and
is NOT launched — the fleet is held at 11 pending LCC's answer on the width
question. It is the next slot when that clears.

### The width ceiling, re-derived after LCC removed the reason for the old one

LCC confirmed (bus 0707) that the 07:58 service registration was theirs, adopted
my six-event console-signal table over their own three-event version, and stated
plainly: *"that conclusion was wrong and the cut was made on it."* The 20 -> 8 cut
came from a memory theory the cluster log contradicts, so the ceiling had to be
re-derived rather than preserved.

They also supplied the mechanism neither of us had. `DETACHED_PROCESS` fixed the
postmaster and **moved the problem down one level**: a console-less parent
spawning a console-subsystem child makes Windows ALLOCATE A NEW CONSOLE for the
child. So every backend, autovacuum worker and bgworker held its own console —
and on Windows 11 its own taskbar window. **33 of the 43 windows in the founder's
"terminal storm" screenshot were the database, not the ingest fleet.** Now
structurally gone: everything runs in SessionId 0, which has no interactive
desktop.

### What the ladder found — the ceiling is not RAM and it is not the fleet

```
rung        10 -> 13 scopes
free RAM    22.4% -> 13.3%  (4.3 GB)
cluster     ZERO deaths since 07:58 — no 0xC000013A, no "terminating any other
            active server processes". The only FATAL is "connection to client
            lost", from workers I killed deliberately.
windows     WindowsTerminal 1, down from 33
```

**The database's own slow-statement log names the real bottleneck, and it is not
ingest.** 1,219 slow statements today:

```
738  WITH      <- the retrieval path
394  SELECT
 78  INSERT    <- the entire ingest fleet, all day
```

```
mean  58,264 ms      p50  43,675 ms      p90 107,460 ms      max 115 minutes
```

Pulled one to identify the owner rather than assume it:
`WITH candidates AS MATERIALIZED ( … c.embedding <=> $1::vector AS d`. That is
retrieval, and the recent ones cluster at **six concurrent backends, 16-19
seconds each**. Independent confirmation — from the cluster's own log rather than
from a harness — of what NEW1 measured in 0679/0686 and LCC took as a production
defect in 0708.

**78 slow INSERTs across a day in which the corpus grew from 7.3M to 14.4M rows.**
The fleet is not the thing that is slow.

**Holding at 13**, and the reason is not a failure — nothing failed. Free RAM is
the only measure still trending down, and 13.3% is close enough to the 5.7%
figure in LCC's original observation that stepping again is worth doing after
watching rather than before. The next rung is a decision for a session that can
watch it, not a parting gesture.

The complication worth handing on: **fleet width is a tax on retrieval latency.**
NEW1 already withdrew latency figures for contention from this fleet. Sixteen
-second vector queries are not caused by ingest, but thirteen writers do not
help. Offered LCC/NEW1 a drop to 4 scopes for as long as they need a quiet
window — a cheaper trade than either lane guessing.

### Six scopes completed cleanly during the ladder — 1,059,329 documents

Not deaths, and the fleet count dropping from 16 to 8 mid-ladder was this, not a
failure:

```
hc-boot-mid-19_16    146,779 written   <- CALCUTTA'S SEVEN-YEAR BLACKOUT, CLOSED
hc-boot-mid-27_1     148,237
hc-boot-mid-29_3     174,448
hc-boot-mid-36_29    220,138
hc-boot-9_13-y2025   247,659
hc-boot-33_10-y2025  122,068
```

`hc-boot-mid-19_16` wrote **146,779 of 146,805** source documents. Calcutta
2016-2022 held ZERO this morning; it is now complete. That gap was found by the
coverage report a few hours earlier and is the first blackout closed.

### Where the fleet points now

Nine of the thirteen are `hist` (pre-2016), which is where the remaining
blackouts live — Bombay 1996-2012 at 605,453 is the single largest gap in the
corpus and `hc-boot-hist-27_1` is on it.

### The rung, measured to its limit and rolled back on the criterion I set

Stepped 10 -> 13 and found the ceiling by reaching it, with the rollback stated
in advance rather than after the fact.

```
10 scopes                                  22.4% free
13 scopes                                  13.3% free
13 scopes + a full-table BERNOULLI scan     7.8% free   <- below the 10% criterion
rolled back to 10                          16.6% free
```

**Rolled back three `hist` scopes immediately on crossing 10%.** Nothing had
failed — no cluster death, no worker loss — and that is the point: a criterion
honoured only when something breaks is not a criterion. The three were the
smallest remaining gaps (`hist-8_9`, `hist-33_10`, `hist-29_3`), so the rollback
cost the least available work.

**The working ceiling on this box is ~10-12 scopes**, not 8 and not 20, and the
binding constraint is that this lane must ALSO run full-table analytics — the
held refresh, the coverage report, the sampling frame. A width that is stable
with nothing else running is not a width, because something else always runs.

The old 8 came from a memory theory the cluster log contradicts (LCC has
withdrawn it, bus 0707). The new 10-12 comes from watching free RAM cross a line
under a load this lane actually produces.

### Two things this ladder proved that the number does not show

**Zero cluster deaths since LCC's 07:58 service move**, across a rung step, three
scope kills, a rollback and a full-table scan. No `0xC000013A`, no
`terminating any other active server processes`. The only `FATAL` in the log is
`connection to client lost`, from workers killed deliberately. The console fix is
holding under load, not merely under observation.

**Ingest is not what is slow.** The cluster logged 1,219 slow statements today:
738 `WITH` (retrieval), 394 `SELECT`, and **78 `INSERT` for the entire fleet
across a day the corpus grew from 7.3M to 14.5M rows.** p50 43.7s, p90 107s. The
recent cluster is six concurrent backends at 16-19s each on
`WITH candidates AS MATERIALIZED ( … c.embedding <=> $1::vector )`.

That is independent confirmation — from the cluster's own log rather than a
harness — of NEW1's 0679/0686 and the production defect LCC took in 0708. Sent to
both (bus 0711/0712), with an offer to drop to 4 scopes for as long as either
needs a quiet window to measure retrieval properly.

### The classifier is not behind. It cannot classify half of what it reads.

Built NEW1's stratified frame (bus 0706) and the first run changed the diagnosis.

```
classified                        988,834
assessed but UNCLASSIFIABLE     1,036,042      <- a rule ran and failed
never assessed                 12,590,930
```

**Of everything ever assessed, 51.2% could not be classified.** The stratified
sample puts the forward rate at **39.6%**, which is the better estimate because
it is a proper sample rather than a cumulative artefact of whatever was walked.

So `hc_document_class` is not 8.9% populated because of a backlog. Grinding the
remaining 12.6M rows would, at this rate, produce another ~6M rows it also cannot
judge. **Volume was never going to fix this** — which retrospectively makes
NEW1's instinct to demand precision before volume right for a reason neither lane
had when they asked.

The failing rule names the cause: `unclassified_disposal` fires 18,726 times of
21,263 unclassified. The classifier is largely a lookup on `disposal_nature`, and
that field is absent or unrecognised on ~40% of documents. **Fixing
`disposal_nature` coverage is the lever, not classifier throughput.**

One thing checked before proposing anything, and it was already right:
`hc_class_method` is written even when the class comes back NULL, so
"assessed and unjudgeable" is already distinguishable from "never assessed".
Anything selecting an assessed population must filter on
`hc_class_method IS NOT NULL`, never on `hc_document_class IS NOT NULL` — the
second silently merges the two.

### The frame itself

`docs/ops/migration/new2-classify-frame.json` — 53,708 rows, 98 strata, drawn
BERNOULLI (not SYSTEM: rows sharing a page here share a court and a year, so a
page sample would skew along the very axis being stratified). Proportional
allocation with a floor of 300, which makes it **non-self-weighting** — weights
run 3.0x to 289.2x and `HOW_TO_USE` is written into the file rather than left in
a message. 30 thin strata are named individually with their numbers.

### NOT done, and left as a decision rather than a default

Exhaustive classification of the corpus. On the 51.2% evidence the rules need
work before the volume does, and which lever to pull — deepen the 30 thin strata,
or attack `disposal_nature` coverage — is NEW1's call since they own what the
selector is for. Asked in bus 0714.

#### The frame write landed, and it exposed a defect I had just introduced

Final counts after `--frame … --confirm`:

```
classified                      1,010,938
assessed but UNCLASSIFIABLE     1,048,789      50.9% of everything assessed
never assessed                 12,624,089
```

(The 51.2% recorded above was the pre-write figure and was correct at the time;
the frame added 53,708 assessments and moved it to 50.9%. Same conclusion.)

**The CLI's own self-check printed `12,624,089 with no method (must be 0)`.**
That assertion is only true of a FULL walk — it exists so a leftover
`hc_class_method IS NULL` reveals a pass that missed rows. A `--frame` run
classifies 53,708 of 14.6M *on purpose*, so the same number is correctly ~12.6M,
and the line reads as catastrophic failure of a run that did exactly what it was
told.

The defect arrived with `--frame`, which is mine, so it is fixed rather than left
for whoever reads that line next and reasonably panics. The check is now
scope-aware and says which run it is describing.

Worth keeping as a shape: **a self-check inherits the assumptions of the only
mode that existed when it was written.** Adding a mode that violates one turns
the check from a safeguard into a false alarm, and a false alarm in a
verification line is worse than no line — it trains the reader to ignore it.

### NEW3 — Indian Kanoon closed for real, missing-PDF pilot manifest handed to NEW2, one live citation defect caught

Founder's source-frontier-continuation addendum, 18 Aug: Indian Kanoon is
settled — written permission, separate paid licence, extraction/RAG/training
use. Closed `FQ-INDIANKANOON` (`docs/FOUNDER_QUEUE.md`
`FQ-INDIANKANOON-RESOLVED`), corrected `docs/AUTHORIZED_SOURCE_MAP.md` §4.
What's left is credential/config, not authorization: `INDIANKANOON_API_TOKEN`
unset, paid-licence real pricing unconfirmed — both queued, neither blocking.

Turned it into `docs/MISSING_PDF_PILOT_MANIFEST.md` — a bounded ~1,000-record
pilot for NEW2, stratified court x year (capped/floored), priced ≤₹560, four
measurements defined precisely (hit rate, canonical identity match,
official-copy recovery, cost/recovered judgment). **Not** a whole-ledger spend
recommendation — the population is 159,651 confirmed `pdf_absent` now (was
96,091 hours earlier same session; keeps growing as the fleet advances).
Two prerequisites flagged as NEW2/LCC's, not the founder's: the ledger has no
title/date/CNR so a metadata-parquet join is needed before any IK call, and
the IK client doesn't implement `origdoc` yet.

Re-verified `TREATMENT_GRAPH_GAP.md`'s 32-count from source records per the
founder's explicit instruction (never memory) and it's **33, not 32** — one
new row, and it's very likely a citation-extraction misattribution (a Kerala
HIGH COURT judgment reciting SC history, not an SC-on-SC edge; the extractor
grabbed the actor's own citation instead of a "(supra)" backreference it
can't resolve). Flagged to LCC before anyone runs the concordance resolver on
it — doing so as-is would link a judgment to itself.

RERA state matrix and Manupatra/SCC decision file both re-checked against the
addendum's constraints (reasoned-vs-procedural, no raw-count-as-citable,
SKIP-by-default) and are already compliant — no changes needed, and no new
state research run this session per the addendum's own item 6 (measured
internal gaps outrank new-source discovery this round).

### The 218,479 duplication (0692) is resolved — within one file, not between objects, and my own earlier answer to it was wrong

Picked this up because it arrived as unread on this lane's bus mid-session and
is squarely acquisition-side. My 0709 reply had argued the duplication must be
BETWEEN the two Allahabad-2023 bench objects because mobile/plain are proven
disjoint. **Measured directly and that reasoning was wrong**: read
`cisdb_16012018/metadata.parquet` (year=2023/court=9_13) alone — one row
group per the footer (rules out a row-group-iteration bug), 443,845 rows,
225,366 distinct `pdf_link`, and exactly 218,479 of them repeat exactly
twice, never three times. The repeats aren't scattered: every first
occurrence sits at row index <219,480 and every second occurrence at
>=219,480 — a clean two-block split, the signature of a source-side export
appended to the same parquet object rather than replacing it. Upstream, in
AWS's own file, not in our reader.

**The corpus itself is fine** — `judgments.source_url`'s unique index already
collapsed NEW2's 532,089 candidate rows to the true 315,574 on write, which
is why the scope wrote 0 and exited clean. Only the footer-count-based survey
denominator is inflated. Recommended NOT re-surveying by real row content
corpus-wide (that flips the survey from "a few MB of footers" to real
transfer at the scale of this one 185MB file, against this session's own
low-CPU-footprint instruction) — recommended instead capturing the true
distinct count NEW2's own ingest workers already compute as a byproduct when
a scope retires on "wrote 0," so the denominator self-corrects on whatever
gets run, for free. Sent to NEW2 (bus 0721). `20,529,203` still stands as an
upper bound; `COVERAGE_GAP_MATRIX.md`'s refusal to print a corpus-wide
percentage remains right, now for a precisely-known reason instead of a
suspected one.

### NEW1, 18 Aug (GPU/embedding directive) — fusion routed, adversarial evaluator fixed, TWO deterministic gates measured for the first time (one is 0.00%), TIER_A representation validated

Owner: NEW1. Full artifacts under `docs/ai/new1-post-0055/`; each item below has
its own writeup and was pushed to the relevant lane(s) over the bus, most
recently seq 738.

**Fusion — offline sweep, no database run** (`NEW1_FUSION_WEIGHT_SWEEP.md`).
The RRF harm bus 0713 found is not a whole-set effect: **paired on the recorded
arms, criminal queries lose 7 dense wins to fusion and gain 0** (p=0.0156);
civil is neutral (p=0.85). Recommendation is `QUERY_ROUTED_HYBRID` — down-weight
sparse only for criminal queries AND only over embedded documents, because
**0.42% of the corpus is embedded** and any global sparse down-weight below
w≈0.55 would make 99.58% of the corpus unrankable by that weight alone. Sent to
LCC (0716).

**Adversarial evaluator fixed** (`services/harness/src/adversarial.ts`).
`mustNotProduce` graded by bare substring, so `adversarialPassRate` measured
0.0% with 3 of 5 cases unpassable by ANY output — a refusal cannot decline a
request without naming what it declines. Rewritten to grade by ASSERTION
(refusal/negation/hypothetical framing excuses a match, each scoped to one
sentence so refuse-then-draft still fails). 25 tests green. Re-run clean:
**0.0% → 20.0%**, 0 call failures. The four still-red cases are genuine model
failures, not grader defects — `adv-5` is the real BNS/BNSS/BSA transition gap:
asked which section applies with no date given, the model asks which section
rather than asking for the date, and never mentions the July 2024 transition.
Sent to LCC (0728), who has taken it for source-grounded transition work (0723).

**The two deterministic Gate S2 metrics measured for the first time**
(`NEW1_POST_0055_BASELINE.md` §4d, `structured-gate.json`). Split out of
`run-cli.ts` into `pnpm gate:structured` so the cheap gate isn't blocked behind
the expensive one.

    fieldPrecision         100.00%   (60 tested) — clean
    structuredExactness      0.00%   (120 tested) — ALL 120 timed out

**Found on the way: a production defect on the live `/search` path**, same
shape as the `expandCategories` full-scan LCC fixed 18 Aug. `citationMatchFragment`
(`compile.ts:96`, the `cite:` predicate) makes the planner abandon a matching
functional index for a 47-million-cost backward date scan — one query ran 31
minutes before being cancelled by hand. `retrieve.ts`'s `exactCitation` fixed
the identical predicate shape 17 Aug, but as a top-level UNION query; it cannot
be mechanically copied into `citationMatchFragment`, which is a boolean
composed under arbitrary AND/OR/NOT. This is the gate Gate S2 names a hard
stop. Routed to LCC as a design question (0730, escalated 0731 with the 120/120
number).

**CLOSED same day (0748).** LCC's diagnosis went one level deeper than the
routed question: fixing the `unnest` arm alone (the obvious suspect) changed
NOTHING — the plan was still a 51-million-cost backward scan. Planning each
arm in isolation found a SECOND correlated arm, the `judgment_citation_aliases`
`EXISTS`, equally fatal on its own and previously unsuspected because it looks
cheap in isolation. Two correlated arms in one `OR`, not one — fixing either
alone leaves the other doing identical damage. Fix needed no UNION: both arms
rewritten as `BitmapOr`-compatible forms, `compileWhere`'s composability
preserved, both differential-tested against the arms they replace (0
disagreements over 20,000 + 4,394 rows). **Independently re-verified in this
lane**, fresh random sample, same tool: `structuredExactness` 100.00%,
`fieldPrecision` 100.00%, 0 failures, 73s (was a 31-minute single-query hang).
Gate S2's hard stop is genuinely cleared.

**Representation lab — is 15.45 vectors/document buying anything?**
(`NEW1_REPRESENTATION_LAB.md`). GPU-only (RTX 4060 Ti confirmed on CUDA, 98%
mean utilisation, 11,400 tokens/s — `gpu-bench.json`), zero DB contention beyond
one paged read. Real hard-negative pool (4,546 judgments = everything dense
returned across 283 queries, plus all gold), ALL_CHUNKS verified to reproduce
the production index exactly (149,211 stored = 149,211 re-chunked).

    ALL_CHUNKS  32.82 vec/doc  succ@5 23.0%  rec@20 41.7%
    HEAD         1.00 vec/doc  succ@5 20.5%  rec@20 39.9%   (89-96% retained at 3% of the cost)
    SALIENT      3.99 vec/doc  succ@5 15.2%  rec@20 35.0%   (worse than HEAD despite 4x the vectors)

Directly validates LCC's TIER_A contract (0723, "ONE vector per document") —
their design decision predates this evidence; this is the retrieval-quality
case for it. Also found: dense retrieval over-selects long documents **2.13x**
relative to the embedded population at large (32.82 vs the corpus-wide 15.45),
an uncontrolled length signal in today's ranking. Sent to LCC/NEW2/NEW3/RCC
(0735-0738).

**Coverage-state contract** (`NEW1_COVERAGE_STATE_CONTRACT.md`), the retrieval
half of NEW2's blackout finding — corrects NEW2's 0703 Bombay span (**2005-2011
is the true blackout, not 1996-2012**; 2012 alone holds 43,678 judgments) and
adds a second finding NEW2's acquisition-only view can't see: **1996-2004 at
5-44 documents/year is MORE dangerous than a blackout**, because a search
returns a few results and looks like an answer. Names a second coverage axis
(`reachability`, EMBEDDED vs LEXICAL_ONLY) alongside acquisition
(`state`, COVERED/PARTIAL/KNOWN_GAP/SOURCE_HAS_ZERO/UNKNOWN) — a document can be
fully held and still unreachable by dense search. Additive API shape proposed;
`PARTIAL` threshold explicitly left for a product decision, not set in code.
Sent to all four lanes (0724-0727).

**GPU confirmed live and measured** (`gpu-bench.json`): CUDA took the graph,
98.0-98.2% mean utilisation across two runs, 11,399-11,498 tokens/s (the stable
figure; chunks/s varies with mean chunk length), ~3.2 GB VRAM for the model,
~4 GB free headroom on the 8 GB card.

**Deliberately NOT attempted this session, and why:** halfvec C3 (ANN recall)
and C4 (end-task retrieval gold impact) need a disposable HNSW index built over
copied structures — the directive's own P0 rule says HNSW construction is
CPU-heavy and "should wait for a resource window," and NEW2's 0712/0712 confirm
the box is not in one (retrieval path already p50 43s, six concurrent 16-19s
vector queries). Candidate-depth sweep (P7) has the same DB-load shape and the
same deferral reason. Both are next once a quiet window exists or NEW2's
standing offer (drop fleet width to 4) is taken up. Cross-lingual (P9, 5 Hindi
queries paired against their English originals via live production search) was
started same session; contention made even 10 queries slow enough that it was
still running as this entry was written — see `crosslingual.json` for whatever
landed.

---

## Q1.51 — LCC, 19 Aug 2026: the semantic bootstrap transition · **LANDED**

The lane moved from "18M documents, 40,161 semantically represented" to a
running incremental pipeline. Five signals sent as each became true, not batched
at the end: `MIGRATION_0056_APPLIED` (0752-0755),
`CODEBASE_MEMORY_IDLE_SPIN_DISABLED` (0756-0759), `EMBEDDING_TIER_A_READY`
(0785-0786), `DOCUMENT_VECTOR_PIPELINE_READY` (0787),
`LEGAL_OBJECT_VECTOR_MANIFEST_READY` (0792).

### Migrations 0056, 0057, 0058

`0056` landed on attempt 2 after **190 earlier failures**, and persistence was
never the missing ingredient — the window was. NEW2's 0742 was right: the three
45-minute UPDATEs were `--restale` and had finished; nothing was left running to
take the free lock. `pg_stat_activity` showed one 9-second reader and zero long
writers, so the runner was re-run into that.

Verified as five separate observations rather than one exit code. The one worth
keeping: an `UPDATE … SET script_quality='bogus_value'` inside a rolled-back
transaction was rejected by `ExecConstraints`. **`NOT VALID` skips the backfill
scan and does NOT skip writes**, and reading the DDL cannot tell you that.

`0057` adds `embedding_content_representative`, `embedding_census_progress`,
`embedding_census_cell` and `document_vector_staging`. `0058` fixes the defect
below.

### The exact Tier-A population — `docs/ai/TIER_A_CENSUS.md`

Full count over all 17,945,147 judgments. Not a projection.

```
TIER A                    9,700,157   54.06%   (projection said 8.49M — 14.2% low)
TIER A-CORE               4,429,062   24.68%   (projection said 3.80M — 16.6% low)
distinct texts            8,854,281            <- the number that prices a GPU run
duplicate groups            301,531
vectors saved               845,876
```

Four independent counts agree exactly: judgments actual, census `rows_seen`, sum
of all census cells, and representative members summed = Tier A.

A sample was never going to be slightly wrong here. The axes correlate with
document length, and length is not distributed the way a uniform sample assumes.

**Two findings that outrank the headline.** 93.9% of Tier A is 2010 or later and
everything before 1990 is 9,911 documents — any evaluation using pre-1990
authorities is measuring a population that barely exists. And the `substantial`
band averages 27,949 characters, 5.1x `full`, which is exactly where one vector
per document loses most and where NEW1's "dense over-selects long documents
2.13x" bites.

### `is_bail_order` was NULL for 93.7% of the corpus

The defect found while building the manifest, and the one most worth remembering.

`(hc_document_class = 'bail_order')` is **NULL, not false**, for the 16.8M rows
with no class. Every consumer wrote the obvious `AND NOT e.is_bail_order`; `NOT
NULL` is NULL, NULL is not TRUE, row dropped.

```
50,000-row page of Tier-A representatives
  surviving `AND NOT is_bail_order`               6,954   (13.9%)
  surviving `AND coalesce(is_bail_order,false)`  50,000
  dropped purely for an unknown class            43,046   (86.1%)
```

326,187 bail orders exist corpus-wide — 1.8%. A filter meant to remove one row in
fifty-five was removing six in seven, with **no error, no warning and a perfectly
self-consistent smaller manifest**. Every number downstream agreed with every
other number and all of them were about 13.9% of the intended population. Any
tier manifest taken before today was ~14% of Tier A.

Fixed at the VIEW (`IS NOT DISTINCT FROM`), not at the three call sites, because
a fourth was already being written. Guard: `eligibility-null-safety.test.ts`,
asserted against `pg_get_viewdef`.

### The pipeline, running now

`tier-census-cli` — one keyset walk, exactly-once per page: each page's
aggregates and the cursor that accounts for them commit in ONE transaction.
Interruption-tested before the full run (6,000 → resume → 10,000, all counts
exact). Necessary rather than defensive: Postgres died six times in four days
here on console signals.

`document-vector-batch-cli` — deterministic keyset batches over the 8,854,281
representatives, `idsHash` per batch and `manifestHash` over the run. Ids not
text: the 140 GB eligibility scan is paid once, and a batch's text is 10,000 PK
lookups. **Refuses while the census is incomplete** — a prefix that emitted
happily would produce manifests that look complete, are internally consistent,
and describe a population nobody selected.

`legal-object-manifest-cli` — Level B, verified claims only. **The unit is the
CLAIM, never the enrichment row**: a `partial` row holds six verified claims and
one fabrication, so row-level policy either embeds the fabrication or discards
six sound objects, and that difference is most of the data.

### The factory could reach 2.7% of the corpus

`enrich-cli`'s legal-object selector required `hc_document_class IN
('decided','decided_brief')` — 478,421 rows against 16,811,480 NULL. The other
97.3% was not a backlog; it was outside the predicate, so running it longer would
never have touched it. Class is now a PRIORITISER, Tier A is the filter, and the
pool draws one representative per byte-identical text so it does not spend 7,118
calls on one Madras common order.

### BNS/BNSS/BSA — adv-5 fixed at the backend, not in the prompt

`services/api/src/statutes/transition.ts`. The commencement date is READ FROM
`statutes` (indiacode.nic.in rows) and is not a constant anywhere; missing or
disagreeing rows produce a refusal rather than a fallback. The offence date is an
INPUT, and absent it the verdict is `indeterminate` naming the one missing fact.
`statute_mappings` holds **zero rows**, so corresponding provisions report the
gap instead of being generated.

adv-5 now PASSES all five repeats: names 1 July 2024, names no section, cites
nothing, asks for the date. `adversarialPassRate` 20.0% → 40.0% with zero call
failures.

Rendering the date as "1 July 2024" instead of "2024-07-01" was a real fix rather
than grader-gaming: with the ISO form the model told the reader the law had
changed and never told them when.

### Citation predicates — the third sibling in one family

`exactCitation` could not resolve a single one of the 4,394 concordance aliases.
`qlang`'s `cite:` had matched them since it was written. Measured: **all 4,394**
alias keys unreachable from the ordinary search path, which is not a surprise but
the alias table's reason for existing.

Third instance of one shape — `exactCitation`'s `OR` fixed 17 Aug, `qlang`'s
`cite:` fixed separately 18 Aug, the alias arm missing from one and not the other
throughout. So the deliverable is the guard, not the one-line arm:
`citation-predicate-parity.test.ts` asserts every implementation of "which
judgment is this citation" queries all three sources of citation identity.
`citations/verify.ts` is deliberately excluded, with the reason recorded in the
file.

### codebase-memory-mcp — 0.68 of a core, re-measured before removal

Four idle stdio servers at **17.0-17.2% of one core each** with no tool call
against any of them. Disabled via the documented `disabledMcpjsonServers`
denylist; `.mcp.json` untouched, nothing uninstalled, index live at 23,301 nodes.
The on-demand `cli` mode was verified from a COLD start **after** the kill,
precisely so the fallback could not be depending on what was removed.
`docs/ops/CODEBASE_MEMORY_ON_DEMAND.md`.

### Still open from this session

- The Tier-A batch manifest is ~886 batches and runs at roughly one batch a
  minute under contention. Resumable and checkpointed; NEW1 can consume batch 0
  immediately, which is the design.
- `services/harness/src/representation-layers-cli.ts` is red under `tsc` (3x
  TS2532). Untracked, NEW1's, and red before this session touched anything.
  Reported, not fixed.
- `statute_mappings` is empty. The BPRD parser exists and is report-only per the
  founder's "report first"; BSA-IEA parses 160 of 170, BNS and BNSS use a
  different column order (bus 0326). Loading it is a founder call, not a code gap.
  **Stale as of 22 Aug — see below, `statute_mappings` now holds 226 rows.**

---

## NEW3 · 22 Aug 2026 — role changed to PRODUCT/MOBILE/PREMIUM/RELEASE, ship-brick #1 fixed, three P1 hard gates verified hands-on

**Mission change, founder-directed.** NEW3 stops being a source-discovery lane
(`SOURCE_REGISTRY.md`, `MISSING_AUTHORITY_QUEUE.md`) and becomes a PRODUCT lane:
mobile UX, premium workflow, security/privacy release gates, billing, observability,
App Store/Play readiness — the "PUBLIC STORE LAUNCH PROGRAM" mandate, cross-referenced
against `docs/ai/audits/LAWMIND_REALITY_AUDIT_2026-08-22.md` and
`LAWMIND_PUBLIC_LAUNCH_MASTER_PLAN_V2_2026-08-22.md` (independent read-only audits
that landed in the repo this session — read in full before acting, per that audit's
own §34 agent-allocation recommendation naming this exact pivot).

**Founder correction received mid-session, binding:** stay LOCAL-FIRST. No Railway
re-enable, no new cloud DB/GPU/search cluster without explicit approval. "Production
path" for verification purposes means the real API→service→retrieval→DB code path
run against the LOCAL Postgres, labelled LOCAL_CONTENDED/LOCAL_QUIET — not a
deployment. The launch-plan audit's Hetzner recommendation is **recorded, not
adopted** (`FQ-HOSTING`).

### Fixed: the audit's #1 ship-brick risk

`apps/mobile/src/api/client.ts:79` and `apps/admin/lib/api.ts:14` had the dead
Railway URL (`api-production-1c0b4.up.railway.app`, 0 active deployments since
11 Aug) **hardcoded with no override at all** — not an env var, a literal. Both
now read `EXPO_PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL` and fall back to the same
URL only when unset. `tsc --noEmit` clean on both packages. Zero behaviour change
today; pointing any channel anywhere is now a config change, not a code edit.
`FQ-HOSTING` filed — the actual channel URLs (local/staging/prod) are a founder
infra decision, not mine to invent.

### Verified hands-on against the real local stack (LOCAL_CONTENDED — GPU sidecar,
hc-classify, text-safety screen, citations-cli, withdrawn-restale all running
concurrently during every measurement below)

Started `services/api` locally (`DATABASE_URL` from repo `.env`, points at
127.0.0.1 per the audit's finding; `AUTH_SECRET` had **no value anywhere in
`.env`** — generated an ephemeral local-only one for this session, not a
credential gap worth queuing). `/health` confirmed `database.reachable: true`.

- **Citation search (`cite:"2026 INSC 145"`)** — 74ms, 1 exact hit,
  `verificationState: verified`, `verifiedBySource: corpus`. PASSES the P1 hard
  gate. First attempt without quoting the phrase returned 0 results — qlang's
  `cite:` value grammar requires a quoted phrase for anything with spaces
  (`parse.ts` — "needs a word or a quoted phrase"); that's correct parser
  behaviour, not a defect, and worth a client-side hint since an advocate pasting
  an unquoted citation would silently get zero results.
- **Natural-language concept search (`"anticipatory bail under BNSS"`)** — 75.8s,
  5 results, all `verificationState: verified`, real case titles/citations.
  PASSES the P1 hard gate for correctness; **fails it for latency** on this box
  right now — `apps/mobile/src/api/client.ts` `TIMEOUT_MS = 15_000`, so this
  exact query would show a client-side timeout/error state today. Matches the
  audit's own §21/§7 finding (p50 43s retrieval under concurrent vector queries)
  independently reproduced, not assumed from the doc.
- **Case-name search (`"Toofani Rai"`, no field prefix)** — 16.7s, 5 results, top
  hits only loosely related (a Bihar bail case, then an unrelated Kasab v.
  Maharashtra citation). `retrieve.ts:673` does an exact-normalized-string
  equality on `case_title` first (`case-title equality→fuzzy` per the audit); a
  partial party name never matches that equality clause, so the query falls
  through to full hybrid retrieval rather than a dedicated fuzzy case-title path
  — slow and loosely precise for what is probably the single most common way an
  advocate actually types a case name. One sample, contended box — not filed as
  a confirmed defect, flagged for the golden-set/P1 UX pass to check for real.
- **`GET /statutes`** — 210ms, returns the full ~825-Act list. Confirmed by
  reading `services/api/src/statutes/route.ts` that **no `act` or filter query
  param exists at all** — my first test invented `?act=BNS` from memory and got
  an unfiltered list back, which is MY error reproducing exactly the CLAUDE.md
  §"never invent APIs" failure mode, not a product one. Filtering to a specific
  act happens via `GET /statutes/sections?actId=...`, which takes a UUID, not a
  short name — a real product gap if the mobile client doesn't already resolve
  short-name → UUID somewhere (unchecked this session).
- **`SubscriptionScreen.tsx`** read in full: matches the audit exactly — three
  IAP tiers with an honest "Purchase isn't available in the app yet" stub, Firm
  row correctly carries no price/button (App Store 3.1.1). No fakery found.

### Not done this session, explicitly

Did not touch `services/api` server internals (LCC's lane) beyond running it
locally read-only. Did not action the launch-plan's Hetzner/Railway-decommission
recommendation (founder-gated, see `FQ-HOSTING`). Did not chase the case-name
fuzzy-path finding to a fix — flagged for the P1 UX pass with real evidence
instead. Left the local `services/api` dev server running on :3000 for
continued hands-on verification this session.

---

## NEW3 · 22 Aug 2026 (continuation session) — P0 search truth, P2 currentness bug, P3 fail-closed, remainder queued

**Founder's binding contract for this round**: turn the research engine into
the best user experience in its category, worked as P0-P10 across search
truth, currentness UX, env config, deletion, push, premium walkthrough,
billing, analytics and store/release audit. This session completed P0/P2/P3
with tests and typechecks; P1 assessed as already largely satisfied by the
existing `ResultCard`; P4-P10 are queued below, not started, so as not to
report shallow, unverified passes over enormous surfaces in one sitting.

### P2 - a real OD-14 regression found and fixed client-side

`citationRender`'s `MovedMark.blocksAddToMatter` was a static function of the
`overruledStatus` banner alone: `status === 'set_aside'` always blocked.
OD-14 (resolved 21 Aug) made the SAME `set_aside` banner also cover a
proposition-level `overruled` authority (~73 judgments) that the server
explicitly allows adding (`canAddToMatter: true`, `precedentialPolicy` in
`services/api/src/judgments/precedential-effect.ts`). So every one of those 73
authorities - addable from search and from judgment detail per the server -
was being wrongly blocked on the client, silently re-introducing the exact
bug OD-14 was written to fix.

Fixed: `apps/mobile/src/api/contract.ts` gained `precedentialEffect`,
`canAddToMatter`, `overruledStatusStored`, `unappliedTreatment` on
`SearchResult` (all optional, additive - every live route already sends them
except one, below). `renderState.ts`'s `movedMark`/`citationRender` now key
`blocksAddToMatter` on `canAddToMatter` when the row carries it, falling back
to the old conservative rule only when absent - conservative, not silently
permissive, on an unconfirmed route. 4 new tests in `renderState.test.ts`
(22 total), tsc clean, 570/570 mobile suite.

**Found and NOT fixed (services/** is LCC's lane): `GET /briefings/:id`**
still sends the raw `overruled_status` column and computes
`addToMatterAllowed` directly off it - the exact pre-OD-14 shape, never
migrated to `precedentialEffect`/`precedentialPolicy` the way
`judgments/route.ts`, `matters/authorities.ts` and `search/route.ts` were. So
the same 73 authorities remain wrongly blocked specifically from inside a
briefing. Bus 1018 to LCC, with the exact shape that would close it.

**Not attempted this session, flagged rather than rushed:** distinguishing
`precedentialEffect: 'overruled'` from a genuine `set_aside` in the
headline/copy itself (today both still say "no longer good law" / "cite this
instead", which is accurate for the true set-aside and arguably overstated for
the overruled-but-addable case). The type now carries `precedentialEffect` to
make that fix possible; doing it well means new `MovedMark` copy and its own
tests, which is a deliberate next step rather than a rushed addition to an
already-large diff.

### P3 - fail-closed env config, addendum to FQ-HOSTING

Detailed in `docs/FOUNDER_QUEUE.md` FQ-HOSTING addendum. Summary: the prior
session's override fix left a silent-wrong-URL hole in exactly the audit's
#1 ship-brick shape (an EAS `preview`/`production` build with the var unset
would compile, install, and silently call a dead URL forever). Closed at both
the `eas build` config-resolution step (`app.config.ts` throws when
`EAS_BUILD_PROFILE` is set and the var is not) and at import time in both
`apps/mobile/src/api/client.ts` and `apps/admin/lib/api.ts`, with a genuine
local default under `__DEV__`/`next dev` only. No channel URL invented -
still entirely FQ-HOSTING's to set.

### P0 - search UX truth, against the measured contract NEW1 shipped

`docs/ai/new1-tier-a/SEARCH_CONTRACT_FOR_PRODUCT.md` (bus 1010/1014) named
three client obligations against fields the server already sends and the
client silently ignored: `degraded` and `ambiguous` were not even in
`apps/mobile/src/api/contract.ts`'s `SearchResponse` type.

- **Query cap**: `SEARCH_QUERY_MAX_CHARS = 500` (mirrors the server's
  `z.string().max(500)`) enforced in `SearchScreen.run()` before any request
  fires; `Input`'s `error` slot shows "N of 500 characters" live. Never
  silently truncated - a shortened legal passage is a different question.
- **Degraded results**: a restrained neutral dashed banner ("Showing partial
  results - one search method could not complete in time"), shown whenever
  `degraded.length > 0` regardless of `results.length`, styled deliberately
  unlike the amber/red LAW MOVED marks (system uncertainty about the search,
  not a legal-currentness fact). No automatic retry existed before and none
  was added.
- **No-results split**: `results.length === 0 && degraded.length > 0` now
  renders "This search did not finish" (manual retry only) instead of "No
  judgments matched" - the old copy was a false confirmed-zero claim over an
  unproven one. The existing COMPLETE_NO_RESULTS / INSUFFICIENT_COVERAGE
  (`unpopulatedCourtCategories`) and OFFLINE-vs-server-answer (`response.
  error.code === 'network' | 'timeout'` vs anything else) distinctions were
  built out the same way.
- **Ambiguous citations**: the header now reads "This citation matches N
  judgments - showing K. Pick the one you meant..." instead of an ordinary
  tally. **Not fully closeable client-side**: `RESULT_LIMIT = 5` caps the
  ambiguous branch too (NEW1 bus 1016 found this - up to 15+ judgments share
  one neutral citation and only 5 are ever reachable), so "all candidates
  must be reachable" per this round's P0.E is still not true. That is
  `services/api/src/search/route.ts`'s `RESULT_LIMIT` / `structured.ts`'s
  `runStructured`, LCC's lane - NEW1 already proposed raising the limit only
  on the ambiguous branch (bus 1016) and it was not yet actioned as of this
  session.
- **Pagination (P0.D)**: not started. `docs/ai/audits/
  LAWMIND_VALIDATION_DOSSIER_R1_2026-08-22.md` §6 specs
  `SEARCH_PAGINATION_CONTRACT_V1` (a server-side snapshot + `/search/page`);
  nothing on that shape exists on the server yet, so there is no wire contract
  to build the client half against without guessing one. Queued for the
  session `/search/page` actually ships.

12 new/changed tests total (`renderState.test.ts` +4, `SearchScreen.test.tsx`
+6, both suites fully green), tsc clean on `apps/mobile` and `apps/admin`.

### P1 - assessed, not changed

`ResultCard.tsx` already carries case title, court/date/citation (via
`citationDisplay`), an evidence passage with the operative paragraph (not a
manufactured "why relevant" string), currentness (`citationRender`'s two
independent marks), and add-to-matter - restrained, not overcrowded, per the
founder's own "the existing visual system is already strong" framing. No
redesign attempted; nothing measured this session that says otherwise.

### P4-P10 - queued, not started this session

Each is a substantial, independently-scoped body of work; attempting shallow
passes at all seven in the same sitting as P0-P3 risks exactly the "reports
are claims, not facts" failure this project's rules exist to prevent. Left
for the next continuation, in the order the founder's contract implies:

- **P4 deletion + privacy UX** - needs LCC's server-side deletion endpoint
  shape first (unchecked this session whether one exists).
- **P5 push** - `registerPushToken` exists with no caller (confirmed by the
  validation dossier §21/26, not re-verified this session); wiring it needs a
  real device or simulator push credential to prove receipt, not just code.
- **P6 premium 10-matter walkthrough** - needs to be RUN, hands-on, against
  the local API with seeded matters; this is observation work, not code, and
  was not attempted this session.
- **P7 billing architecture** - pricing is founder-undecided (§17 of the
  dossier); the config-consolidation half is buildable without a decision,
  RevenueCat sandbox wiring is not - unstarted.
- **P8 analytics** - event contract + scrubbers, unstarted; must be built
  scrubber-first per this round's own instruction, before any network send.
- **P9 store/release audit** - bundle/version/permissions/deep-links audit,
  unstarted this session.
- **P10 best-app polish pass** - deliberately last; a polish pass over
  screens whose functional gates (P0-P8) are still partly red would be
  polishing the wrong layer first.

### Founder correction addendum, same session — one copy fix, one real production bug found and fixed, outbox hardened

**500-char cap copy (addendum A):** re-worded per the founder's explicit
correction — "This search is too long for the current research mode
(N of 500 characters)" instead of a bare character-count message, so the cap
reads as today's mode limit rather than a permanent product ceiling. No other
change; `SEARCH_QUERY_MAX_CHARS` stays a client-side mirror of the server's
`z.string().max(500)`, not a new client-invented number.

**A real production bug, found auditing the outbox per addendum (E):
`recordCitationCopy` sent every request with no Authorization header, so
every citation-copy record has been 401'ing forever.** `apps/mobile/src/api/
client.ts`'s `once()` only attaches the bearer token when a call passes
`auth: true`; `recordCitationCopy` was the one write call in the whole file
missing it (32 sibling authenticated calls all have it; cross-checked against
`services/api/src/app.ts` route-by-route — every other call's auth/no-auth
status matches what its server route actually requires). Consequence: the
outbox's `MAX_ATTEMPTS` retried a request that could never succeed, then left
it stuck forever — quietly defeating `citation_copies`'
`SCHEMA_TRUTH.md`-documented purpose of warning "the advocate at highest
risk" when a copied-out authority later moves. Fixed with `auth: true`;
proved the test would have caught it by reverting the fix and re-running
(failed both new assertions), then restoring it (`client.recordCitationCopy.
test.ts`, new file, 2 tests).

**Outbox hardened per addendum (E)'s explicit ask — errors are now
classified, and a permanently-failing entry no longer burns its full retry
budget:** `NOT_FOUND`/`INVALID_REQUEST` (the judgment is gone, or the payload
is malformed) are `NON_RETRYABLE` and marked `dead` on the FIRST failure;
`AUTH_REQUIRED` reaching the outbox means `client.ts`'s own refresh-once
already failed, so it is `AUTH_RECOVERABLE` — capped like a network blip,
because signing back in is what makes the next attempt succeed, not an
immediate tombstone; anything else (`network`/`timeout`/unrecognised) stays
`RETRYABLE` up to the existing `MAX_ATTEMPTS`. A `dead` entry is skipped by
every future `flush()` and excluded from `oldestPendingAge` (a permanently
stuck entry's age growing forever said nothing actionable), with a new
`deadCount()` selector for a future diagnostic surface. 7 new tests in
`outbox.test.ts` (13 total), all previously-passing behaviour unchanged.

**Expo-updates audited per addendum (F): not disabled, not installed at
all.** `expo-updates` appears nowhere in `apps/mobile/package.json`,
`app.config.ts` or `eas.json` — confirming the validation dossier's risk #12
(store-review latency per hotfix). Documented rather than added: installing
OTA-update capability is a real product/ops decision (what can ship remotely
vs what needs store review) and adding it unprompted this session would be
exactly the kind of casual enablement addendum (F) warns against ("Do not
enable OTA changes casually"). Today, every fix — including the env-config
and outbox fixes in this same session — needs a store submission to reach a
device; there is no remote channel at all yet.

576 -> 579 mobile tests (net +7 after the copy-text update also touched one
existing assertion), tsc clean on `apps/mobile`.

## NEW1 · 22 Aug 2026 — retrieval quality: three diagnoses that each say the same thing about what we have been measuring

Round contract: MAKE LAWMIND FIND THE RIGHT LAW; embedding-walk progress is not
retrieval quality. Everything below is measured on the frozen gold
`ba9357cba2fbf297`, LOCAL_CONTENDED, artefacts in `docs/ai/new1-tier-a/`. The
live checklist for this round is `NEW1_ROUND_TODO_2026-08-22.md`.

### P0 — the walk died and the keeper could not restart it

A fleet-wide restart at ~09:34Z killed the runner shell mid-`lcc-00092`. Batches
89/90/91 had ended clean, so this was not a contract refusal. The GPU sidecar was
healthy throughout (`/health` 22 ms, `/embed` 253 ms, CUDA) — **the sidecar was
not the cause and restarting it would have been the wrong move.** The keeper's own
relaunch failed silently twice, exactly as it did on 21 Aug; a hand-run
`Start-Process` of the same launcher worked first try. Cause still UNKNOWN, so the
fix is honesty rather than a guess: the relaunch's PowerShell output is no longer
discarded (`.agents/logs/new1-walk-relaunch.log`).

**Accounting closes** (`stage-accounting.json`): 113 batches, 1,119,642 rows
walked — staged 386,572 · already staged 620,355 · refused TEXT_UNSAFE 81,692 ·
refused class/tier 21,014 · **CURRENT_FORMAT_UNEXPLAINED 0**. The 10,009 residual
rows are three 19-Aug batches whose log format predates the refusal counters.
Stage 985,539 rows, quarantine 72,092. **The manifest denominator is stale** —
generated under eligibility hash `e76879ab6bbcd452`, deployed is
`2e7b53afe35fa81c`, and two revisions in between changed which documents are
eligible — so no completion percentage is quoted against it.

### P1 — case-title s@1 67.69% is the share of titles that are UNIQUE

| population | n | rank 1 | in top 5 |
| --- | --- | --- | --- |
| title is unique in the corpus | 155 | 146 — **94.2%** | 149 |
| title names 2–16 judgments | 74 | 9 — **12.2%** | 15 |

`exactCaseTitle` returns NULL unless exactly one row matches, and 32.3% of real
titles match more than one — `MANOHAR LAL Vs STATE OF HARYANA AND OTHERS` is 14
different judgments, 2012–2024. The trigram fallback then breaks a `word_similarity`
= 1.000 tie by physical row order. Two further routing bypasses: a title
containing **AND** is parsed as a boolean and answered by `answerStructured`
before `hybridSearch` runs (9 of 229, 5 lose gold), and a title containing
**SECTION 1** routes to the statute lookup (1 of 229).

Simulated fix (pin every exact normalised-title match, `judgment_date DESC, id`):
**s@1 83.41%, coverage@5 95.63%, p50 1,608 ms → 1 ms.** Sent to LCC as bus 1021.

### P2 — document-level vectors cannot answer sentence-level queries

The ~13–15% dense figure is not the index (`ANN_MISS` 21 of 571), not a broken
document vector (self-retrieval **68 of 68** at rank 1), and not query length.
`QUERY_NOT_IN_GOLD = 0` — every gold query occurs verbatim inside its own answer —
so each has a character offset there:

| the query's own words are | n | s@5 |
| --- | --- | --- |
| INSIDE the embedded 4,800 chars | 332 | 17.47% |
| BEYOND them | 198 | 9.60% |

Truncation roughly doubles the failure rate and is worth a few points. The
headline is the residual: **the whole embedded head text retrieves its document at
rank 1, 68 times out of 68; one sentence from inside that same text retrieves it
in the top 5 only 17.5% of the time.** That is a granularity mismatch, and it is
the argument for passage-level indexing rather than a new model or a longer
window. `DENSE_FAILURE_ANALYSIS.md`.

### P4 — the bounded lexical policy, measured

60 queries, production's own 15 s bound: current `sparse()` finds gold 16 times
with 35 timeouts at p50 15,013 ms; **rarest-3 ANDed finds it 34 times with 4
timeouts at p50 815 ms**. Deleting the all-common fallback — the dossier's
LONG_QUERY_POLICY_V1 item (1) — is the WORST arm: 100% timeouts, zero gold, so
that proposal is refuted. **Dense control: 0 of 60 gold authorities exist in
`judgment_chunks` at all.** Sent to LCC as bus 1025.

### P5 — pagination splits in two, on a measured gate

Three executions per query: case_title 3/3 and citation 3/3 identical in set AND
order; the two unstable rows are exactly the two where the degraded set varied.
So deterministic re-execution is safe for exact-identity pages now, and hybrid
pages wait on P4 — the cause is a timeout, not a ranking defect. Contract and
fixtures in `PAGINATION_RANKING_CONTRACT.md`, sent as bus 1027.

### P6 — the citation gate re-graded

**UNIQUE_CITATION_EXACTNESS 100.00% s@1 (n=212).**
**AMBIGUOUS_CITATION_CANDIDATE_COVERAGE (n=17): gold reachable 88.24%, false pins
0.** The pooled 97.38% is retired — it averaged a perfect lookup with a question
that has no single answer. NEW2's 1019 settles what the ambiguity is: a neutral
citation names a **disposal event**, not a judgment.

### What is NOT claimed

No absolute launch threshold is invented. Every semantic number is
CONDITIONAL_RECALL over a 256,998-row probe — not production, and **not High
Court dense search**, which does not exist yet. Absolute usefulness waits for
ADVOCATE-100 (NEW2) plus lawyer review; the three construction rules that gold
now has to satisfy went to NEW2 as bus 1026.

---

## NEW2 · 22 Aug 2026 — the shared-citation question answered from source PDFs, ADVOCATE-100 bound, and `body_text_safe` measured

**Round contract: data truth, citation identity, gold.** Nine workstreams, all
landed. Checklist with evidence: `docs/ai/new2/NEW2_SESSION_TODO_2026-08-22.md`.

### The headline: our corpus identity is not wrong

NEW1's bus 1017 found ≥100,000 neutral citations naming more than one judgment
and refused to say whether that was the courts or our extractor. It is the
courts, and the true population is larger than the floor NEW1 could see:

```
citations carried by more than one judgment    155,388 groups / 361,045 judgments
worst group                                      1,257  (NEW1's capped sample said 303)
share of all citation-bearing rows                26.3%
```

1,786 groups sampled across 24 courts, **6,595 source documents read**, weighted
back to the population:

```
DUPLICATE_DOCUMENT              53.89%  [53.78, 54.00]   ~194,577 rows
CONNECTED_MATTER_COMMON_ORDER   30.74%  [23.22, 37.05]   ~110,978
MULTIPLE_ORDERS_SAME_CASE       13.85%  [ 7.69, 21.47]   ~ 50,018
COURT_SHARED_BATCH_CITATION      0.91%  [ 0.63,  1.31]   ~  3,296
EXTRACTOR_STAMP_CONTAMINATION    0.11%  [ 0.04,  0.25]   ~    414
NOT_A_CITATION                   0.10%                   ~    366
```

**99.4% is the courts' own doing or our duplicate ingestion. 0.21% is a citation
defect.** All three mechanisms were proven on the PDFs themselves with poppler —
a different extractor from the `unpdf` path used at ingest, so a shared bug
cannot produce a shared answer:

- `2025:PHHC:052490-DB` is **line 1 of 31** in each of **253** separate orders,
  above the court's own name. 253 connected writ petitions, one common order,
  one registry citation. Nothing is broken.
- `2026:PHHC:027747-DB` is **line 27 of 53**, inside *"placed reliance upon the
  Division Bench judgement of this Court in M/s Bansal Casting … "*. All fifteen
  judgments carry an authority's citation, and those P&H orders print no citation
  of their own at all.
- `2011:AUGUST:23` is the Madras registry despatch stamp `DM::2011:AUGUST:23::`.
  **383 rows corpus-wide** carry a month name in the court-code position.

The provenance was settled from the code before a single document was read:
`neutralCitationFrom` (`hc-load.ts:217`) takes the first citation-shaped token in
the first 3,000 characters of the document's own text. **No batch-stamping code
path exists**, so the hypothesis as NEW1 worded it was ruled out on the code, and
the real failure mode is narrower — the first token is sometimes not the
document's own.

Corpus-wide, from a separate court-stratified sample of 2,647 documents:
`neutral_citation` is **94.85%** the document's own, **0.14%** another
judgment's, **0.03%** not a citation, **2.63%** metadata-sourced (94% of that is
Supreme Court, where it legitimately is), **2.35%** undetermined. Madras is the
one court whose citations should not be trusted: 26.3% own, 61.9% despatch stamp.

### `body_text_safe` means "not proven damaged", 90.42% of the time on no evidence

```
judgments                                        18,698,968
script_quality IS NOT NULL (convicted damaged)    1,792,321    9.58%
script_quality IS NULL                           16,906,647   90.42%
script_quality = 'clean' or 'mixed_script_ok'             0    0.00%
```

No writer has ever emitted `clean`; that branch of `judgment_quality_contract` is
unreachable. The view answers the same question twice — `text_state` says
TEXT_UNKNOWN for those 16.9M rows and `body_text_safe` says true — and the
boolean is what `body-text-safety.ts`, `retrieve.ts`, `qlang/compile.ts` and
NEW1's quarantine filter on. **The view was not changed**: `body-text-safety.test.ts`
pins the expression against `pg_get_viewdef` deliberately, that tripwire worked,
and exact consumer guidance plus an additive proposal went to LCC, NEW1 and NEW3
instead (bus 1022–1024, `QUALITY_CONTRACT_CONSUMER_GUIDANCE_2026-08-22.md`).

### ADVOCATE-100 exists

100 tasks · 100 bound to held judgments · 281 distinct targets · 42 proposition
families · 27 tasks expecting a refusal · 0 leakage failures. Six
LONG_FACT_PATTERN / PASTED_PASSAGE tasks are marked PRODUCT_REQUIRED /
CURRENTLY_UNSUPPORTED and **stay in the set** — the 500-character cap cannot run
them and deleting them would delete the requirement. `ADVOCATE100.json`.

### The citation battery, four numbers not one

```
A EXTRACTION PRECISION   100% printed in the citing judgment, 99.75% at the recorded offset
B TARGET RESOLUTION      100% over 91 provable pins, 0 contradicted, 37 unprovable
C AMBIGUITY SAFETY       1 materially unsafe pin of 17 different-authority cases
D DAMAGED TEXT           no pseudo-citation reached the edge table in this sample
```

C is the one that would have lied as a single number: counting duplicate rows of
one judgment as dangerous ambiguity reads 62.5% unsafe. Split by whether the
candidates are the same authority or different ones, it is 5.9%.

Exact edge census, replacing the "22M citation graph" line for good:

```
judgment_citations rows        22,322,047
empty citation_text            16,090,200   72.08%   one placeholder per judgment
real citation strings           6,231,847
resolved to a held judgment       231,412    1.04% of rows, 3.71% of strings
```

### BNS / BNSS / BSA — three questions, kept apart

LCC's `canonicalAct` repair (bus 1015) **audited and confirmed**: 273 spellings
folded, **0 wrong**, State statutes correctly refused. Not reverted. It leaves 40
keys / 592 references of OCR variants unreachable, three of which are genuinely
ambiguous and must not be folded.

The official correspondence table covers **196 of 1,059 sections = 18.51%**
(BNS **2.23%**). 69 of 226 rows carry a mangled section number, 23 name a section
that does not exist, and the old-section half has **no primary witness at all**
because we hold none of IPC, CrPC or the Evidence Act. `OFFICIAL_NO_EQUIVALENT`,
`NEW_PROVISION` and `REPEALED_NO_DIRECT_EQUIVALENT` are empty and stay empty.
**No surface may describe BNS/BNSS/BSA transition as covered.**

### Jobs

`text-damage-persist` was stopped at line 578,845 on resource grounds. Resumed in
a quiet window and **completed the full 1,626,762-row export**: 79,381
`script_quality` claims (+51,265 this session), 56,641 refused as stored-echo-only.
Six newly-convicted CITED_AUTHORITY documents were enqueued for OCR; the worker
was **not** started, because the gate had gone to CPU 82.6% / commit free 6.0%.

**`hc-classify` stopped during this session and needs restarting.** I recorded it
as LIVE early on — its cursor was advancing when I looked — and it is not. It
stopped at **4,865,352 of 18,698,968 classified (26.0%)**, 13,833,616 remaining.
Its `57014` write-cancellation retries are stamped 10:24, before my first heavy
scan at ~12:34, and the persist job I resumed did not start until ~14:11, well
after it stopped — so I cannot attribute the stop to my work and am not claiming
either way. The cursor file is empty, which is safe by design: an unparseable
checkpoint restarts from zero and the predicate is `hc_class_method IS NULL`, so
nothing is redone or skipped, only a longer first page. Left stopped because the
gate read CPU 90.2% / commit free 3.3%.

### Founder-queued

- **FQ-DUPLICATE-DOCUMENTS** — 194,577 rows are one document held twice.
  Recommendation: collapse at render, not in the corpus.
- **FQ-BNS-CORRESPONDENCE-COVERAGE** — acquiring IPC/CrPC/IEA enacted text is
  what makes the old-section half verifiable at all.

### Five corrections to my own work, recorded because they are the interesting part

1. Extraction precision 82.28% → **100%**: a newline inside `citation_text`
   against a whitespace-collapsed haystack. My check, not the data.
2. A "new damage class" that never existed: a read script passed an escaped
   whitespace class through a JS template into a Postgres E-string, where the
   backslash-s collapses to a literal `s` — so the regex was `s+` and it deleted
   the letter s from every judgment it printed. Clean text looked like
   glyph-dropped OCR. Caught because my own letter-frequency measurement
   contradicted what I was reading; the screen built on that premise was killed
   before it finished.
3. Ambiguity safety 62.5% → 5.9%.
4. Twelve BSA correspondence "contradictions" that were my reader's fault —
   `3, para 8` is the BPR&D spelling of section 3 paragraph 8.
5. `body_text_safe` 90.68% → 90.42%, because the job I resumed convicted 51,265
   more rows while other lanes were reading the first figure. Both recorded.

---

## LCC · 22 Aug 2026 — DAMAGED TEXT IS REFUSED STRUCTURALLY, `/admin` WAS OPEN TO EVERY ADVOCATE, AND CASE-NAME SEARCH WENT 15,007ms → 9ms

Owner LCC. Everything below is measured through the real Hono app against the
local corpus, LOCAL_CONTENDED throughout — the ingest fleet, the GPU sidecar and
the enrichment workers were writing during every number. Progress board:
`docs/ai/lcc/LCC_ROUND_TODO.md`.

### The finding that mattered most: 4,018,647 paragraphs of unfiltered damage

`fillParagraphFallback` reads `judgment_paragraphs` and sets
`operativeParagraphVerified: true` with a byte-exact `exactSpan` — the strongest
evidence claim this API makes. It had no quality filter at all:

```
paragraphs whose judgment is CONVICTED damaged   4,018,647
distinct documents                               1,736,980
```

Five orders of magnitude more exposure than the 24 damaged chunks NEW2 measured
in the dense arm, because paragraph extraction ran over the whole corpus and
embedding did not. One of them, verbatim, from a proof-grade `text-damage-v2.0`
row: `!"# !$%&%"'((`.

`judgment_chunks.text_quality` never had a chance of catching it — 22 of 24
proven-damaged chunks score above its 0.85 floor. It is a ranking nudge and was
never a safety gate.

**The fix is one predicate, read LIVE from `judgments.script_quality`**, applied
to sparse, dense, the reranker's input and paragraph evidence, plus a belt at the
final read so a PINNED metadata hit (exact citation, exact title) returns the
judgment with its body evidence withheld rather than being dropped. Live, not
staged, is the point: NEW2's pass convicted 7,814 documents no screen had ever
fired on, and a guarantee that holds because a batch job keeps up is not a
guarantee. Proved end to end on `2023:PHHC:092818` — found by `cite:`, body
withheld, no quarantine involved.

`body-text-safety.test.ts` guards it three ways: unit, a structural SITES list
that fails when a body-text path forgets the predicate, and a drift test against
`pg_get_viewdef` on the DEPLOYED contract view.

**The wire says `bodyText: { state, grade, evidenceWithheld }` and never
"safe"** — NEW2's bus 1022, acted on before it shipped. No writer in this
repository has ever emitted `clean`, so a boolean called `bodyTextSafe` would
have been a positive claim 90.68% of the corpus cannot support.

### `/admin/*` was open to every authenticated advocate

`admin/audit.ts` had documented this honestly for two weeks: no `role` column
existed, so every admin endpoint gated on "is anyone signed in". Any advocate who
completed sign-up could read the audit ledger, list every user with their phone
number, and flip the eCourts kill switch.

Migration `0074` adds `users.role` with the DEFAULT as the enforcement, and
`requireAdmin` mounts on the PREFIX so an admin route added next month is
protected by existing rather than by remembering. 31/31 admin tests, including 10
new route-level 403s and one asserting a refused write touches nothing.

### Research can no longer starve the core paths

Postgres was never the constraint — `max_connections` 100, 7 active. **The API's
own pool of 10, shared by search and sign-in, was.** Split into core 8 / research
6 with an admission gate in front. Measured both ways, same load:

```
one shared pool, 12 slow research statements   core p95 2,809 ms
split pools, 8 slow research statements        core p95    69 ms
```

The 4th concurrent search waits 2 s then gets `503 SEARCH_BUSY` with
`Retry-After` — an honest refusal, never an empty result page, which would be a
silent drop wearing a success code.

### Case-name search: 0 of 15 at 15,007 ms, then 15 of 15 at 9 ms

NEW1's bus 1021 decomposed it: `exactCaseTitle` ABSTAINED whenever a title
matched more than one judgment — 32.3% of real titles — and the trigram fallback
then picked one at `word_similarity` 1.000 decided by physical row order.
Abstention did not produce silence; it produced a guess one layer down.

It pins the whole set now, ordered `judgment_date DESC, id DESC`, and reports
`exactTitleCandidates` so the client can disambiguate. **NEW1 recommended
AGAINST the tie-break that scores best** (`length(full_text) DESC`, gold-first in
43 of 74) because none of them is relevance, and that reasoning is recorded next
to the code.

**And my first cut of it broke every case-title query into an HTTP 500.**
Inlined into `EXPLAIN` by hand the new `ORDER BY` planned at cost 18.72; through
the driver, with the title as a BIND PARAMETER, the planner walks
`judgments_judgment_date_idx` backwards at cost 9,255,009 and is cancelled at
15 s. Fixed with a `MATERIALIZED` fence — the same mechanism `dense()` already
uses. **An inlined EXPLAIN is not evidence about a parameterised query.** The
pins block is now inside `bounded()` too, so a slow exact lookup degrades
(`pin_timeout`) instead of 500ing.

### The sparse arm, from NEW1's evidence rather than from preference

NEW1's bus 1025, 60 gold queries, four arms. The AND-first/OR-fallback shape
found 16 of 60 and timed out 58% of the time. **Deleting the all-common fallback
is the WORST arm** — 0 of 60, 100% timeouts — so that proposal is refuted, not
deferred. The rarest-3 AND found 34 at p50 815 ms.

It is now the ONLY sparse pass. Implementing it as a fallback changed nothing,
measured, because the first pass was already spending the entire budget before
the fallback could run. `SPARSE_RELAX_BELOW` and `SPARSE_AND_MAX_CHARS` are
deleted rather than left as dead configuration.

**It does not fix short common-term concept queries** — those still hit the 15 s
ceiling here and report `degraded`. That is a finding for NEW1, not a fix, and
NEW1's own control is the number that matters: dense reaches **0 of 60**. For
High Court concept work the lexical arm is not one half of a hybrid, it is the
whole of search.

### Pagination, and why there is no snapshot

Measured before designing: three identical requests, real query vector, order
AND membership identical across all three. So re-running the rankers and slicing
deeper is correct, and a snapshot buys nothing while costing a store, an expiry
and stale-cursor bugs. NEW1's independent gate (bus 1027) agrees for exact
identity and disagrees for hybrid — where the instability is the timing-out
sparse arm, which is P2 rather than pagination.

Duplicates now collapse over the WHOLE continuation before the slice, not per
page — NEW1: *"or the second copy simply arrives on page 2."*

### Everything else that landed

- **Privacy**: `search_events` (migration `0075`) carries class, length, latency,
  result count, degraded arms, zero-result and a keyed `subject_hash`. **There is
  no query-text column.** `searches` stays unwired: wiring it would have created
  a permanent, user-linked record of every legal question every advocate asked.
- **Deletion**: real. Content deleted, identity anonymised (the `users` row
  survives because `audit_log` is append-only and references it), R2 keys
  returned so nothing can be reported complete while the files remain.
- **Observability**: `GET /admin/metrics` — 5xx, search p50/p95, degraded rate,
  zero-result rate, admission refusals, connection pressure, longest statement,
  database size, corpus age — with the ALERT CONDITIONS in code (`ALERT_RULES`)
  so a curl+jq poller is a complete alerting system and no vendor is activated.
- **Dates**: `DATE_SUSPECT` on either side of the `as-at` subtraction now returns
  `date_unreliable` rather than dating a legal event with a contradicted date.
  `DATE_UNKNOWN` and an absent row do NOT refuse — silence is not a
  contradiction, and refusing on it would repeat the `is_bail_order` NULL
  failure.
- **Currentness**: `treatmentScope` (`UNRESOLVED` for a verified adverse
  treatment whose paragraphs are unreadable) and `currentnessClaim` scoped to
  `lawmind_resolved_sources` + `asOf`. No copy written in the server, and the
  founder-facing UX question stays OPEN.
- **Backup, and it is PROVED restorable**: `scripts/lcc-moat-backup.mjs` — 34
  irreplaceable tables, **1.533 GB compressed, 85 s to dump, 820.7 s to restore
  into a disposable database and verify**. 31 of 34 tables exact including
  22,322,047 citation rows, content checksum MATCH. `judgments` (151 GB) and
  `judgment_paragraphs` (92 GB) are excluded because they rebuild from the AWS
  buckets.

  **The restore failed twice before it passed, and both failures were the
  point.** First: six tables came back MISSING because `pg_dump -t` does not
  carry the custom TYPES its columns need — every one of the six has an enum
  column, every table without one restored perfectly, so the dump looked healthy
  and the pack was not. That is invisible to a dump-only backup: the artefact
  exists, its bytes are intact, its sha256 matches, and it will not restore.
  Second: the verification itself reported three mismatches that were live
  writes after the snapshot — this session's own test suites seeding users — and
  then overwrote the manifest with the live figures, deleting the evidence by
  the act of looking. A `--skip-dump` run now reads the counts recorded at dump
  time and restores from a pack that already exists, which is the more honest
  exercise anyway.
- **Validation**: `dateFrom`/`dateTo` were `z.string()` — `"yesterday"` is a
  valid date literal to Postgres and meant something we never intended. Now ISO,
  refined against the real calendar (`2026-02-30` is rejected), with the range
  order checked.
- **500 chars is documented as the CURRENT SAFE BOUND**, not a product limit,
  with the intended long-passage route recorded and the rule that we reject and
  say why rather than ever truncating.

### Still open, honestly

- **Concept search over High Court law is RED** and no amount of tuning moves it:
  the vectors production can see are Supreme Court only.
- Statute/BNS: correct but 2 of 5 probes hit the 15 s ceiling.
- One pre-existing lint error in `qlang/parse.ts:341` (`no-useless-assignment`),
  untouched by this round and not mine to silently fix.
- `.agents/jobs/registry.jsonl` line 3 is unparseable JSON (a Windows path with
  single backslashes) and four jobs read RUNNING against dead PIDs. Reported to
  NEW2; I judged only my own row, verified two ways.
- The release-pipeline proof covers export → restore → checksums on THIS
  Postgres. Linux, index rebuild timings and search-equivalence are not proved.

---

## NEW3 · 23 Aug 2026 — deletion client shipped, push wired end-to-end (device-unverified), analytics contract built scrubber-first, tenant-isolation audit CLEAN, premium research + spec delivered, staging package proposed

**Continuation of the 22 Aug NEW3 product/mobile/premium/release round**
(P0–P3 shipped that session; P4–P10 queued). This session picked up the
queue under a much larger founder mandate (P0–P26 "premium growth" +
9 binding orchestrator corrections) and completed the bounded, verifiable
subset below rather than attempt shallow passes across all 26 sections —
same discipline the 22 Aug session itself named.

### Shipped and verified (tsc clean, 604/604 mobile tests — 1 pre-existing unrelated flake in `CommandPalette.test.tsx`, confirmed passes in isolation, a timeout under full-suite CPU contention)

- **Account deletion client (old-queue P4).** `POST/GET /me/data-requests`
  (`services/api/src/auth/data-requests.ts`) existed, was live, and had
  **zero** client caller anywhere and **zero** entry in `API_CONTRACTS.md` —
  `SettingsScreen.tsx`'s own comment claiming no advocate-facing endpoint
  existed was stale. Built `DeleteAccountScreen.tsx`: type-your-email
  confirmation, consequence summary drawn from `eraseUser`'s own doc comment
  (matters/drafts/searches/alerts/citation-copies deleted outright,
  audit-ledger/shared rows anonymised not deleted, R2 objects disclosed as a
  residual the API holds no credential for), pending/in-progress/refused
  states, copy that only ever says "request received" — never "deleted,"
  matching `data-requests.ts`'s own "requesting is not executing" rule. Added
  the missing `API_CONTRACTS.md` §Data requests entry. 4 new tests.
- **Tenant-isolation security audit, read-only, no code touched.** Full pass
  against matters/matter_shares/briefings/documents/auth/admin/sessions/
  webhooks/secrets, per the founder's "admin 403 does not prove tenant
  isolation" instruction. **CLEAN across all 9 areas**, file:line evidence
  each. One caveat (a signed-out access JWT stays valid ~15min until natural
  expiry — stated tradeoff, not a defect) and one forward-looking note (no
  document/OCR download route exists yet at all — nothing to audit, flagged
  for whenever one is built). Relayed to LCC, bus 1043.
- **Push notifications wired end-to-end, delivery UNVERIFIED (no device, no
  EAS project — old-queue P5).** Installed `expo-notifications`/`expo-device`
  (were not dependencies before). `src/push/register.ts`: permission
  request, Android channel, three distinct honest failure reasons
  (`NOT_A_DEVICE` / `PERMISSION_DENIED` / `NO_PROJECT_CONFIGURED`) rather
  than one generic error. Wired to fire at the one real trigger:
  `AlertSettingsScreen.tsx`, when an advocate turns ON "An authority I saved
  is set aside" — the single alert trigger that is honoured server-side
  today. **Cannot deliver a single notification without an EAS project** —
  checked, not assumed (`eas whoami` fails, `eas-cli` isn't installed, no
  `projectId` anywhere in `app.config.ts`/`eas.json`). Filed
  `FQ-PUSH-PROJECT`: this is an account gap (`eas login`/`eas init`), not a
  token I can generate myself. 10 new tests (6 module, 4 screen-wiring).
- **Analytics event contract + scrubber, built scrubber-first, zero network
  send (old-queue P8 / new-P12).** `src/analytics/events.ts`: closed,
  typed event set covering the activation funnel (correction #7),
  paywall/preview events with a `costClass: 'cheap'|'expensive'` field
  (correction #3), purchase events, and **first-class churn events**
  (`subscription_cancelled` with `cancelReason`, `refund`, `billing_failure`)
  so an experiment cannot report conversion without also being able to
  report what it cost — correction #4. `scrub.ts`: a second, independent
  defence — any property that isn't a bounded id/enum-shaped scalar is
  dropped whole (never partially redacted), so a hurried future event with a
  free-text field cannot leak a matter note or client name. `track.ts`: an
  in-memory buffer, `flush()` as the seam a real sink plugs into —
  deliberately does NOT call any network endpoint, because no
  `POST /analytics/events` exists on `services/api` yet and inventing one
  would violate the never-invent-APIs rule. 11 new tests.
- **Staging package proposal, prepared not deployed**
  (`docs/ops/STAGING_PACKAGE_PROPOSAL_2026.md`, orchestrator correction #6).
  Provider/region/machine-class/storage/API/DNS/cost/migration/secrets/
  backup/rollback/India-latency, all named, nothing provisioned. **Found a
  real pricing discrepancy** the existing 22 Aug audits didn't catch: their
  Hetzner AX102 figure (€157/mo) vs. a corroborated current listing
  (€259/mo, post-June-2026 price rise) — presented as a range, flagged
  unresolved, not silently adopted either way. **Found a more important
  region conflict**: the audits' Hetzner recommendation is EU
  (Falkenstein/Helsinki); `OPEN_DECISIONS.md` OD-2's resolved DPDP position
  is Singapore (via Railway). A move to Hetzner is a *different* region than
  the one counsel's position was recorded against — named for the founder,
  not resolved here.
- **Premium research + spec** (orchestrator P0/P2/P3/P4/P6/P7).
  `docs/product/PREMIUM_GROWTH_RESEARCH_2026.md` — Tinder/Hinge/Bumble/Match
  Group/Duolingo/RevenueCat/Apple/Google, primary sources, each claim tagged
  VERIFIED/VENDOR CLAIM/UNVERIFIED. `docs/product/PREMIUM_GROWTH_SPEC_V1.md`
  — structure hypotheses compared (not decided) against the already-settled
  PD-13 tier names, four "Likes You"-analog wireframes in LawMind's own
  visual language gated only on real, already-computed data, a cost-control
  table tying every preview to the new `costClass` analytics field, and an
  explicit statement that **none of the synthesis features can call a real
  model on real matter data yet** — sensitive-class routing (OD-6) still
  needs the countersigned DPA. No price set. No screen built from it.

### Founder-queued this session

- **`FQ-PUSH-PROJECT`** — needs an Expo/EAS account + `eas init`; code is
  ready and waiting.
- **Staging region conflict** (Hetzner EU vs. OD-2's Singapore position) and
  **re-pricing** (€157 vs €259) — both named in
  `STAGING_PACKAGE_PROPOSAL_2026.md` §11, not filed as separate FQ entries
  since `FQ-HOSTING` already owns this topic and stays the single entry.

### Queued, not started this session — same discipline as 22 Aug's own queue

P8/10-matter hands-on walkthrough (needs seeded synthetic matters, explicitly
NOT real advocate data per correction #2), feature-flag infrastructure
(checked — none exists; a prerequisite for shipping any paywall per
correction #8, not built this session), store/release bundle-permissions
audit, accessibility/low-end-device pass (correction #9), and the actual
premium screens themselves (deliberately not built — `PREMIUM_GROWTH_SPEC_V1`
is a design pass, not an implementation one, and §7 of that document names
why the synthesis half can't be wired to a real model yet regardless).

## LCC · 23 Aug 2026 — DATE QUALITY REACHED THE CHRONOLOGY, TENANT ISOLATION WAS NEVER TESTED, AND A DEPLOYMENT VARIABLE WAS CHOOSING WHICH COMPANY SAW OUR DATA

Board: `docs/ai/lcc/LCC_ROUND_TODO.md` §ROUND 2. Every number measured through
the real Hono app or read off the live database. **LOCAL_CONTENDED throughout** —
two other agent sessions and the ingest fleet were live on this box for most of
the round, and one of them was editing `services/api` at the same time.

### 1. The three findings worth remembering

**A deployment variable was making a confidentiality decision.** `llm/route.ts`
decides which MODEL by data sensitivity and is correct. **Nothing decided which
COMPANY'S SERVER** — `call.ts` picked between inferx.net, OpenRouter and
Anthropic by `INFERX_API_KEY ?? OPENROUTER_API_KEY ?? ANTHROPIC_API_KEY`. It has
leaked nothing, because the sensitive path is refused twice over (no
countersigned DPA, no pseudonymiser). The shape is what matters: the day the DPA
lands and the pseudonymiser ships, the provider would still be chosen by whoever
last exported a variable. `llm/provider-policy.ts` now answers it once, and a
private payload makes **zero outbound requests** — asserted with a counting
fetch, not by checking that a refusal came back afterwards.

**"Admin 403 works" proved nothing about tenant isolation, and nobody had
checked.** Admin auth is one middleware; tenant isolation is the WHERE clause of
every handler touching a user-owned table. `security/tenant-isolation.test.ts`
runs **33 cross-tenant attempts with USER_B's real token against USER_A's real
ids: 0 FAIL, 0 403-instead-of-404.** The interesting design choice is that a
**400 is INCONCLUSIVE, never a pass** — a probe bounced by the body validator
never reached the ownership check, and that is precisely how a security battery
rots into decoration while staying green. Three probes bounced at 400 on the
first run and were fixed rather than accepted.

**73.2% of unresolved citation edges are empty rows.** Found while measuring the
new resolver, not while looking for it, which is why it is worth something: it
independently corroborates NEW2's placeholder finding from the API side.
Verified by reading raw rows rather than trusting my own refusal gate — five of
eight sampled rows were `{"citation_text":"","normalised_citation":""}`.

### 2. Date quality now reaches every surface where a date supports a claim

The fifth agent found NEW2's three date states had **zero consumers**;
`as-at.ts` was the first. Now: `GET /judgments/:id`, `/treatment` (per row plus
page-level `datesContradicted` and `chronologyReliable`), `/graph` (per node),
`GET /citations/:id`, and `propagate-treatment.ts`, where a `DATE_SUSPECT`
citing judgment is **demoted** below an equally strong candidate whose date is
not contradicted — so "the latest court to say it" is not decided on a date a
witness contradicts. A demotion, never an exclusion.

**Four values, never three.** `DATE_UNKNOWN` is a measurement with a null
result; `null` is no measurement. Observed on a real page:
`["DATE_VERIFIED","DATE_SUSPECT","DATE_VERIFIED","DATE_VERIFIED",null]` →
`chronologyReliable: false`. Only `DATE_SUSPECT` refuses anything; refusing on
silence would refuse a quarter of the corpus on the strength of nobody having
checked, which is the `is_bail_order` NULL failure again.

**Nothing was removed from search.** The problem is derived legal certainty, not
discoverability.

### 3. The commerce spine, built for the failures that cost money

Migrations `0077` and `0078`. Capabilities rather than a `PRO` boolean, because
a boolean cannot express a one-off Hearing Pack credit and the migration from
boolean to capability happens after money is already flowing. No plan name and
no price appears anywhere in the server.

The concurrency invariants are unique indexes, not checks, and every one is
proven under `Promise.all` rather than sequentially — a sequential test proves
nothing about a race:

- two simultaneous deliveries of one purchase → **one** entitlement
- **two simultaneous redemptions of one credit → exactly one spend**
- two simultaneous taps → **one** job, one model bill
- a retry returns the ORIGINAL redemption, never a second

`0078` exists because writing the test found a defect I had shipped an hour
earlier: `0077`'s direction CHECK listed `refund_reversal` in **both** the
positive and negative branches, so the one reason whose direction matters most
had no constraint at all. A refund written as `+1` would have handed a refunded
customer a free hearing pack. Forward-only fix; `credit_ledger` was empty.

`adverse_treatment_visibility` is `SAFETY_CRITICAL` and `requireCapability`
**refuses to gate it in code**. A future engineer who paywalls the currentness
surface hits a failing test rather than a launch.

### 4. SPEC_V1 arrived mid-round, and its §6 has an error

NEW3 delivered `PREMIUM_GROWTH_SPEC_V1`, so P8's wait ended and the preview was
built against it. `costClass: 'cheap'` is on the wire and **a test asserts the
preview writes no `llm_calls` row** — §6's rule enforced structurally rather
than promised.

**§6 classifies supporting/contrary authority counts as `cheap — matter_authorities
row count, already computed`. There is no stance column anywhere in the
database.** `matter_authorities` is `(id, matter_id, judgment_id,
added_by_user_id, citation_check_id, added_at, removed_at, removed_by_user_id)`.
The split is synthesis, not counting, and it lands in the spec's own `expensive`
row two lines below. The endpoint returns one total plus
`stanceNotComputed: true`; inventing the split would be the fabricated scarcity
§0 forbids. Sent to NEW3 (bus 1053).

### 5. The resolver measures and writes nothing

`citation-resolver-v0.1`, a component, **no `--apply` flag exists**. n=8,000:
refused 73.2% (all EMPTY) · formed 2,142 · hit 43.28% · unique 40.85% ·
ambiguous 2.43% (p50 2, p90 38, **max 845**) · not-held 56.72% · 34 ms per 1k ·
**0 model calls**.

`relationship: 'UNKNOWN'` and `verifiedTreatmentEligible: false` on every
result. A citation edge says A printed B's citation and nothing about what A did
with it, so **resolver coverage rising must never be reported as currentness
coverage rising**. Max ambiguity 845 is a common order — NEW2's 1019/1020
exactly — and no winner is picked from it.

**false-unique% is deliberately not reported.** It cannot be computed without an
adjudicated sample, and a plausible number for it is what would let a backfill
through.

### 6. NEW1's uncited-authority bias reproduces, and I did not fix it

Confirmed against the **deployed** `pg_get_viewdef`, not the migration file: two
`ca.judgment_id IS NOT NULL` rescue sites, and the `length(full_text) < 2000`
gate is the one guarding 40.09%. The view is my file and the class evidence is
NEW2's, so it is filed (`FQ-ELIGIBILITY-UNCITED`) with one counterfactual table
requested from NEW1, rather than patched to a number that feels right.

Carried verbatim because it is the more useful half: **a landmark is the one
document a rule refusing the uncited can never catch**, so ADVOCATE-100's 27/27
clean zero is an instrument limit, not a clean bill. And its
`distinct_target_judgments: 281` is one task carrying 253 targets — effective n
is 27.

### 7. What is NOT done, and is not claimed

- **The full API suite did not complete and is not claimed green.** Run 1 died
  with Postgres `could not read blocks ... Invalid argument` and `out of memory`
  in `sparseAny` while three sessions hammered one database; run 2 stalled on
  `arguments/counter`, which took **3,235,480 ms** in run 1. Every targeted
  suite passes: 13 tenant · 28 entitlement · 10 premium · 13 resolver · 10
  provider · 6 date-quality · 12 as-at/check · 42 qlang.
- **P10 release proof not advanced.** Another session was live in
  `services/api/src/p10-probe.ts`; I stayed off it rather than collide.
- **P11 Test Court** — the existing finding stands and nothing was deleted.
- **Three provider egress modules outside the gate** (`ingest/inferx.ts`,
  `ingest/openrouter.ts`, `harness/generate.ts`). Corpus-only today, so no
  exposure; sent rather than edited across lanes.
- **Staging**: rewritten as the server-side INPUT to NEW3's package rather than
  a rival recommendation. The useful measurement is that **291 GB is the wrong
  number to size a machine against — 83% of it is rebuildable.**

---

# NEW1 ROUND — 23 Aug 2026 · RETRIEVAL SCIENCE

Live checklist: `docs/ai/new1-tier-a/NEW1_ROUND_TODO_2026-08-23.md`.
Decision document: `docs/ai/new1-tier-a/SEMANTIC_SEARCH_RELEASE_DECISION.md`.

## The one sentence

**Semantic search is not failing because ranking or representation is wrong. It
is failing because the documents are not in the index** — and the production
document-vector recipe is separately the worst of six representations measured.

## The four findings that change decisions

1. **DENSE REACHABILITY CEILING = 36.1%** (`dense-reachability-ceiling.json`).
   The production dense arm reads `judgment_chunks`, which holds **40,161
   distinct judgments — 0.2% of the corpus** and 11 of 27 ADVOCATE-100 targets.
   `fact_pattern`, `supporting_authority`, `adverse_authority`, `long_narrative`,
   `pasted_passage` and `statute` have **ZERO** reachable targets. A falsifier
   fired and is reported: 5 top-5 hits came from unreachable targets via exact
   routes, so the ceiling bounds **dense**, not the product.
2. **THE LIVE REPRESENTATION IS THE WORST ARM** (`representation-lab-v2.json`,
   45 tasks, 2,500-doc pool). `HEAD:4800` scores **s@5 20.0%**; a POOLED
   whole-document vector at **identical storage** scores **73.3%** and reaches
   100% recall@500 against 68.9%. Three vectors per document (6 KiB) is WORSE
   than one pooled vector (2 KiB). **Do not promote the 8.85M staged vectors —
   re-pool them.** The eligibility/screening/staging work is representation-
   independent and is not wasted.
3. **CANDIDATE RECALL IS THE CONSTRAINT, NOT ORDERING** (`two-stage-candidates.json`).
   Lexical rarest-3 reaches **10.3–25.6%** recall@500 on concept queries; dense
   reaches **83–100% at rank ≤20** where the target exists. **No reranker sprint.**
4. **CASE-TITLE IS FIXED** (`CASE_TITLE_SEARCH_CONTRACT_V1.md`). Unique titles
   **155/155 rank 1**, timeouts **9 → 0**, p95 **19,196 ms → ~1.3 s**. All 10
   remaining misses are titles held by **16–200 judgments** — a page-shape
   problem, not a ranking one.

## Safety, measured

- **FALSE_IDENTITY_RATE 0/6** — no exact route answered any fabricated identifier
  confirmed absent from the corpus (`retrieval-safety.json`).
- **0 date-bound violations** across 8 temporal probes (`temporal-correctness.json`).
- **Long input**: the embedder reads 20,000 chars (not truncation); embedding a
  raw narrative HALVES recall and deterministic condensation fully recovers it
  (`LONG_FACT_SEARCH_CONTRACT_V1.md`).

## Release decision: **C — semantic research stays hidden/experimental**

Identity search (citation, case number, case title) is a **different product and
is ready**; it should not be held back, and it must not ship under an AI label.

## Corrections this lane made against itself

- P5's headline (40.09% of the corpus refused solely for want of a citation)
  stands, but the **threshold remedy does not**: among additions that HAVE a
  class verdict, procedural-disposal chaff runs **26.5% → 40.1% → 53.4%** from
  1,500 down to 800. **The 2,000 gate is closer to right than bus 1050 implied.**
  77% of the band is unclassified, so this is a coverage question first.
- LCC's OOM mechanism (bus 1060) is **refuted**: no tsvector in the corpus exceeds
  4 MiB; the largest is ~388 KiB detoasted, against a 96 MiB allocation.
- Three instrument bugs caught before publication: a `0/0` safety denominator, a
  false temporal "leak" (filters sent un-nested), and 39/39 false dense
  "timeouts". Each is recorded in the file that produced it.

## Not done, and not claimed

- **P6 1M halfvec checkpoint DEFERRED** on resource pressure. No 1M→8.85M
  extrapolation is made. `CHECKPOINT_RUNBOOK_1M.md` holds the executable form.
- **P13 query router deliberately not started** — routing to a path with 10–26%
  candidate recall routes to a path that cannot answer.
- **THE KEEPER'S WALK RELAUNCH IS BROKEN AND UNFIXED.** 21 consecutive relaunches
  produced no walk; three hypotheses tested and refuted; stopped at the
  three-cycle bound. **When the walk dies, relaunch it by hand and verify by a
  NEW line in `stage-runner.log`, never by a process count.** The walk was dead
  7h26m this session before anyone looked.
- **ADVOCATE-100 latency is contaminated** (`LOCAL_CONTENDED`) and a clean-box
  re-run is owed before any latency number from that file is quoted.

## NEW3 · 23-24 Aug 2026 — the 10-matter walkthrough ran, found a P0 the OD-14
fix didn't reach, and result #6+ is now actually reachable from the app

**Lane lease:** bound cleanly — 4 concurrent sessions this round (LCC, NEW1,
NEW2, NEW3), no collision, confirmed via `.agents/bus/.lane-*` timestamps and
`ListAgents`.

**1. The 10 synthetic-matter walkthrough (P0, the round's top priority) ran
end to end against the real local API**, not simulated: 10 throwaway
accounts, real magic-link auth, real search/save/treatment/timeline/premium-
preview/counterargument/alerts/entitlement calls, real briefing sweep
(`pnpm --filter @lawmind/cron sweep`, the actual cron entrypoint). Full
writeup: `docs/product/PREMIUM_10_MATTER_WALKTHROUGH_V1.md`. All synthetic
data deleted from the local DB afterward; premium flags (temporarily flipped
on for the test) restored to their default-off, no-row state.

**Free-tier mechanics WORK, cleanly, on real data**: search, save-authority,
treatment/currentness, timeline, hearing state — 10/10 each. The premium
preview correctly refuses to fabricate a supporting/contrary split
(`stanceNotComputed: true`, matching LCC's SPEC_V1 §6 correction) and
`POST /premium/jobs` correctly returns 402 `NOT_ENTITLED` on every synthetic
free user — fail-closed, observed rather than assumed.

**Found, and CLOSED same round (bus 1078): the briefing's authorities block
read the wrong table.** `services/briefings/assemble.ts:104-113` built
`blocks.authorities` and the `no-authorities` checklist line from
`judgment_annotations` (a paragraph pin-cite), never from
`matter_authorities` (what `POST /matters/:id/authorities` — the actual
save-authority action — writes to). Reproduced live: saved a real
authority, ran the real sweep four minutes later, the generated briefing
said "No authorities are saved to this matter." `BriefingScreen.tsx`
rendered that claim verbatim with no independent check. Reported to LCC,
bus 1075. **LCC's fix (bus 1078) found the same pre-OD-14 rule in three
more surfaces** — `judgments/annotations.ts`, `documents/route.ts`, and
`arguments/counter.ts` (the dangerous-direction one: it moved 73
authorities into `excluded[]`, telling an advocate adverse law their
opponent can reach for does not exist) — plus a checklist/authorities
desync a sweep-only fix couldn't see. All four now share
`treatment-lookup.ts`; proof in `docs/ai/lcc/BRIEFING_OD14_GENERATION_PROOF.md`.
This lane picked up the client half: `arguments/counter.ts`'s new
`precedentialEffect` on `excluded[]` is now consumed so the
counterargument screen never says "has been set aside" for the
`review_required` case.

**Found: the activation funnel and experiments infrastructure are fully
built and called from nowhere.** Repo-wide grep for `recordStep` and
`ACTIVATION_STEPS` returns one hit — the definition in
`services/api/src/product/activation.ts`. No route calls it; no admin route
reads `funnel()`/`worstDropOff()` back. Same shape in `experiments.ts`.
`activation_events` has zero rows in every environment today and will stay
at zero until something writes to it. Reported to LCC, bus 1077, with
`docs/product/ACTIVATION_FUNNEL_V1.md` recommending `AUTHORITY_SAVED_TO_MATTER`
(a SECOND save on a matter that already has one) over "two briefings opened"
for the one undecided step, `experienced_matter_value` — cheaper to compute,
and doesn't depend on the briefing feature the walkthrough above says isn't
trustworthy yet.

**Found and fixed (in-lane): result #6+ was unreachable from the app.**
The server has supported real pagination (`page`/`pageSize` request,
`page: {page, pageSize, hasMore}` response, `hasMore` observed by
over-fetching one row, never inferred) since NEW1's P3/P5 work — the mobile
contract never declared the fields and the client never sent `page`, so
`RESULT_LIMIT` (5) was a hard ceiling on the app regardless of what the
server could serve. Confirmed by grep: zero occurrences of `hasMore`/
`pageSize` anywhere in `apps/mobile/src/api/`. Fixed: `SearchScreen.tsx` now
shows a manual "Show more results" control (never auto-paging on scroll,
matching this screen's own no-auto-retry rule for `degraded`) when `hasMore`
is true, appends further pages to the existing list, and re-applies the same
two client-side reliability filters to each page. Additive on the wire,
documented in `API_CONTRACTS.md` §Search. tsc clean, 607/607 mobile tests
(+3 new pagination tests, `SearchScreen.test.tsx`).

**Found (informational, NEW1's lane): one counterargument miss in 10.** A
commercial breach-of-contract position returned an IPC §394 robbery
conviction as its only authority — real judgment, real span, zero domain
relevance. 9/10 other matters returned strong, correctly-matched precedent
(three landmark SC judgments matched exactly to their stated question).
n=10 is not evidence of anything systemic; reported to NEW1 as one data
point, bus 1076.

**Landed alongside, previously uncommitted from this and the prior NEW3
session** (all now committed, `331d1e6`): account deletion client
(`DeleteAccountScreen.tsx`, consequence copy drawn from `eraseUser`'s own doc
comment, "request received" never "deleted"), push notification wiring
(`src/push/register.ts`, three distinct honest failure reasons, fires on the
one real trigger — still undeliverable without an EAS project,
`FQ-PUSH-PROJECT`), the analytics event contract (`src/analytics/`,
scrubber-first — drops any non-bounded field whole rather than partially
redact), `PREMIUM_GROWTH_RESEARCH_2026.md`/`PREMIUM_GROWTH_SPEC_V1.md`
(Tinder/Hinge/Duolingo/RevenueCat research, ranked hypotheses, no prices
set), and `STAGING_PACKAGE_PROPOSAL_2026.md` (a Hetzner price discrepancy
and a region conflict with OD-2 the prior audits missed, both flagged
unresolved for the founder).

**Not done this session**: the premium commercial decision package
(NEW3-5 — model A/B/C comparison), the mobile release-quality pass
(NEW3-8 — device/accessibility/network audit), and truthful premium-preview
UI on the client (the server contract is ready and honest per the
walkthrough above; no mobile screen calls `/matters/:id/premium-preview`
yet — confirmed by grep, zero hits). Queued next.

**Founder queue**: nothing new this session — `FQ-PUSH-PROJECT` and the
staging region/pricing conflict were already queued by the prior session and
remain open.

---

### 24 Aug 2026 — NEW1: PASSAGES WIN, THE PREVIOUS ROUND'S ANSWER WAS AN ARTEFACT, AND THE KEEPER WAS WORTH 655,099 VECTORS

**Added by NEW1 (retrieval lane).** Round bound to §7 of
`LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md`. Lane lease read
`NEW1: FREE` before binding; no collision. Deliverables:
`SEMANTIC_REPRESENTATION_DECISION_V3.md`, `HC_PASSAGE_COVERAGE_EXPERIMENT.md`,
`LONG_FACT_VALIDATION_V2.md`, `ELIGIBILITY_SAMPLING_FRAME.md`,
`KEEPER_RELAUNCH_PROOF.md`, `NEW1_NEXT_ROUND_TODO.md`.

**THE RESULT.** Posed advocate questions, 19,932-document pool with real hard
negatives, one run of 67,618 chunks and 147M characters:

| representation | vec/doc | posed s@5 | recall@500 | GPU-days | halfvec |
| --- | ---: | ---: | ---: | ---: | ---: |
| A HEAD:4800 — **what is staged today** | 1.00 | **2.2%** | 35.6% | 11.7 | 18 GB |
| B POOLED_ALL | 1.00 | 17.8% | **95.6%** | 18.0 | 18 GB |
| D MULTI_3 | 3.00 | 28.9% | 80.0% | 18.0 | 54 GB |
| **F ALL_CHUNKS** | 3.39 | **37.8%** | 91.1% | 18.0 | **61 GB** |

**B, D and F cost the SAME GPU time** — a pooled vector is the mean of the chunk
vectors, so you read every chunk either way. The whole decision is **+6.3
GPU-days and +43 GB** over the head-only walk already running, for 2.2% → 37.8%.
Queued as `FQ-SEMANTIC-BUILD`; the sequencing detail went to LCC as bus 1088.

**FOUR THINGS THIS REPO BELIEVED THAT ARE NOW MEASURED OTHERWISE.**

1. **The round brief's premise for NEW1-1 is wrong.** V2 already used posed
   advocate queries — leakage guard ≤6 shared words, max observed 5, zero
   failures. The lifted gold is a different set of files, and it is what
   `LONG_FACT_SEARCH_CONTRACT_V1` rests on.
2. **V2 drew ZERO hard negatives.** `SET LOCAL …; SELECT …` with bound
   parameters is a prepared statement; PostgreSQL refuses multiple commands in
   one. Every call threw, every throw was swallowed, and the artefact's
   `hardNegatives` field is pool-minus-gold so nothing in the output could reveal
   it. Same tasks, same arm, same 2,500 pool: **B falls 73.3% → 24.4%.** V2 is
   now marked superseded and its SQL fixed so a re-run cannot repeat it.
3. **"More vectors per document is NOT the lever" is REVERSED.** D beats B
   everywhere, F beats both, and the passage arms decay *slowest* with pool
   growth (per-decade 0.838 vs B's 0.722) — the opposite of V2's stated property.
4. **The passage build was never 40–45M vectors.** Measured **3.392 chunks per
   document**, so 30.0M vectors and 61 GB, not 100+ GB and 50+ GPU-days.

**Production's own vectors are faithful — the collapse is the pool.** 25 staged
documents re-embedded at HEAD:4800 match the stored vectors at cosine ≥ 0.999336,
median 1.000000, all unit-norm. No recipe drift.

**LONG-FACT ON POSED QUERIES: 0/6 for every arm at every size**, including at 500
characters where there is no dilution. P4's 8/25 → 4/25 curve was the decay of a
near-duplicate vector, not of a fact pattern. The coverage wall is the real
finding: **2 of 19 target judgments are in the index search actually queries.**
Also measured: the condenser discards three quarters of the advocate's own words
as input grows (retention 0.924 → 0.244), invisible in a lifted benchmark.

**KEEPER RELAUNCH FIXED, AND IT WAS WORTH 655,099 VECTORS.** 22 consecutive
failed relaunches; three hypotheses about the command had already been refuted.
The cause was the caller: the keeper spawned PowerShell `detached: true`, so that
shell had **no console**, and `Start-Process` cannot create a process from one.
Three verified relaunches since — the mechanism proof, an unattended recovery of
a cold rebooted box, and a resume from a deliberate pause — and the walk ran
**20 h 46 m unattended, 1,097,864 → 1,753,127.** A pause file now lets a
measurement quiet the box without fighting the keeper.

**ELIGIBILITY FRAME FOR NEW2** (bus 1081): 21,416 rows censused in the exact
population NEW2 measured at 3.75% [1.28, 10.45]. **Zero Supreme Court rows** in
the entire length-gated uncited population; **73.6% carry no class verdict**;
43.0% carry no procedural marker; 2025+ cohort 15.3%. 580 ids drawn, two strata,
with the reweighting estimator stated. **The 2,000-character gate was not lowered
and I do not propose lowering it** — my own counterfactual and NEW2's base rate
agree from opposite directions, against my earlier 40.09% headline.

**FOUND FOR OTHER LANES, NOT ACTED ON.** `text_safety_grade = 'PROOF'` is
**unreachable**: the deployed eligibility view tests `script_quality_method = ANY
(ARRAY[]::text[])`, an empty array, so the branch is dead code. PROOF returns 0
rows while 939 rows in the same 0.2% sample carry `text-damage-v2.0` — on the
order of 470,000 documents whose proof-grade evidence reads as a screen. It
collapses `PROVEN_DAMAGED` into `SCREENED`, which is NEW2-3's P0 (bus
1079/1080). Separately, a `retrieve.ts` sparse query was found **live at 1,012 s
in IO/DataFileRead** — the LCC-4 shape reproducing itself while it could still be
sampled (bus 1091).

**NOT DONE, deliberately.** NEW1-7 (1M halfvec) deferred on a **measured** gate
refusal — `DEFER VECTOR_BUILD` on four independent grounds with `DATABASE_URL`
exported first, so pressure and not unreadability. NEW1-8 (clean-box rerun) waits
on architecture selection. **No reranker started**, no HEAD:4800 promotion, no
passage program built, no threshold invented after seeing results.

**STILL RED, and named rather than smoothed:** `adverse_authority` 0/4 and
`statute` 0/3 for **every** representation tested — not diagnosed, and any
premium surface implying adverse-law discovery is unsupported. **8 of 20 posed
targets have no production vector at all.** And 19,932 documents is 0.23% of Tier
A; every arm was still losing ground at the largest pool measured.

**Walk state:** PAUSED at 16:40Z for LCC-6's quiet window (bus 1085/1092), with
nothing lost — it resumes by re-running the coverage census, never from a batch
number. `new1_doc_vector_stage` = 1,753,127. Delete
`.agents/logs/new1-walk.pause` to give it back.

---

## LCC — next-round §6, all eight items closed · 24 August 2026

**Lease:** `scripts/lane-lease.mjs`, session `fa117007`. Built this round because
none existed: one file per lane, a second binder REFUSES and names the owner, and
health is process IDENTITY (pid **and** creation date, because pids recycle) plus
heartbeat age. It proved itself at the end of the round — it caught this
session's own process restart as `DEAD` with a warm heartbeat.

**Four P0s, every one reproduced before it was fixed.**

`LCC-1` The generated briefing checklist branched on the stored `overruled_status`
column, so the 73 judgments OD-14 exists for were told *"has been set aside. Do
not rely on it"* in the same JSON that said `canAddToMatter: true`. And fixing
generation was not sufficient: the checklist is served **verbatim from the blob**
while the authorities beside it are read live, so an authority set aside overnight
got its banner and **no checklist item at all**. The render path now rewrites the
treatment items from live state. The repo-wide search found **three more surfaces**
running the same stale rule — `judgments/annotations.ts` (annotating into a matter
IS add-to-matter, and `POST /matters/:id/authorities` allowed what it refused),
`documents/route.ts`, and `arguments/counter.ts`, which filtered on the BANNER and
therefore dropped adverse authorities **the opponent can reach for** into
`excluded[]`.

`LCC-2` Account deletion returned 200 and left the advocate able to sign in
indefinitely. Three independent mechanisms; the transferable one is that the
anonymisation **destroys the key the identity cleanup needs** — the `auth_session`
delete resolved `auth_id` after the same transaction rewrote it, matched zero rows
and reported zero. Seven user-linked tables the function never named are now
handled; `credit_ledger` is escalated because a purchase record is a tax document.

`LCC-3` Both prior positions were partly right. `caseno:"<stored form>"` found
96.7%; **typed bare it returned zero in 3 ms, 95% of the time**, because
`full_text_tsv` is built from `full_text` alone and nothing routed to the column.
A case number is a **registry serial** — serial 1 of 2019 exists in 24 courts and
172 case types — so it is now a disambiguation, never a pin (**31.7% report
ambiguous**). CNR is the real identifier: 100% at p50 2 ms. Bare 1.7% → 96.7%,
typed 10.3% → 98.3%.

`LCC-4` Not reproduced, and **two** mechanisms refuted — NEW1's tsvector theory
and my own sort theory (`Sort Method: top-N heapsort, 31kB`). The classifiable
cause is a planner misestimate **by construction**: the tsquery is built from a
bind parameter inside the query, so `EXPLAIN` returns the identical `rows=84744`
against measured upper bounds of 295,681 / 3,670,878 / **16,965,472**.

`LCC-5` The alert conditions had been evaluated since the day they were written
and **nothing ever delivered one**. Proven end to end with an injected drill that
travels the same cooldown, transport and ledger — and it caught a **real**
condition on its first run.

`LCC-6` Run twice. Under load 1,026 s / 8 fail; in the window **NEW1 gave up their
GPU walk for**, 578 s / 644 tests / **639 pass** / 3 fail. The three are
corpus-state assertions, not code.

`LCC-7` Export → migrate → restore → **VERIFIED** on WSL2 PostgreSQL 18.6 with
pgvector, 500 judgments, no cloud and no spend. **Four cross-platform defects, all
of which would have shipped** — the source collation cannot exist on Linux;
generated columns break COPY; the live column ORDER has drifted from the
migrations (a positional COPY would write `cnr` into `native_text` silently); and
the verification itself was platform-dependent three ways.

**Accepted from the bus, not planned:** NEW3's 1075 (the briefing said "no
authorities are saved" about authorities that WERE saved — it read
`judgment_annotations` and never `matter_authorities`) and NEW1's 1079
(`text_safety_grade='PROOF'` unreachable; **0 → 939** in their exact sample).

**A mistake of mine, recorded:** I cancelled one of NEW1's statements with a
`pg_cancel_backend` filtered on a table name that their query also contained.
Told them (bus 1094).

**NOT DONE and named:** the partial-transfer simulation did not execute — stopped
after three attempts rather than a fourth; no rollback drill; no search-equivalence
battery; no `(court, case_number)` index (`DEFER DB_SCAN` stood all round).

**Founder queue:** `FQ-CREDIT-LEDGER-ERASURE`, `FQ-OPS-ALERT-EMAIL`.

### 25 August 2026 — NEW2: THE MOAT IS MEASURED, AND 72% OF THE "22M CITATION GRAPH" IS EMPTY ROWS

R7 §10. Fourteen deliverables in `docs/ai/new2-r7/`. Every number OBSERVED on the
live DB; four corrections filed against my own claims, one of them Fifth's.

**Three defects found and fixed.**

**1. 293 real citations were stranded in nine ingest batches, and the cause was
`now()`.** `judgments.created_at` defaults to `now()`, which is *transaction
start* time, so a loader committing 250 ms later writes rows that were invisible
when the monotonic cursor passed them. Proven from
`judgment_citation_keys.created_at`, which reconstructs the walk riding live
ingest at 121–250 ms lag — the only such window in the corpus's history,
17 Aug 16:40:07–16:46:00. Repaired **293 → 0** with a new non-mutating
`--recheck`; prevented with an **exact** safe frontier (`min(xact_start)` of
other backends), not a guessed interval. Regression test proven non-vacuous.

**2. postgres.js truncates a `timestamptz` bind parameter to milliseconds.**
`${x}::timestamptz` routes through a JS `Date`; `(${x}::text)::timestamptz` does
not. The truncated cursor sits *before* the rows it passed, so they match again
for ever. A `--recheck` over ~75,000 judgments reported **266,124,061 re-walked**
and was killed at 56 minutes; it now finishes in **1.5 s**. Very probably also
what LCC saw on 24 Aug (bus 1110). The same pattern is in six of LCC's files
including `key-freshness.ts` and admin audit pagination — reported (1231), not
edited. **A `>` comparison re-reads; a `<` comparison skips.**

**3. Three section-parser defects.** Evidence Act recall 138 → **171** of its own
183-section arrangement. The worst was silent: `keepAscendingRun` ranked by
`parseInt`, so 65, 65A and 65B collapsed to one value and 30 sections vanished
with nothing looking wrong.

**What the measurement says.**

- **72.08% of `judgment_citations` is empty sentinels**, one per citing judgment.
  Real population **6,231,847**, resolving at **3.71%** — not 22.3M at 1.04%.
- **61 live false pins** — despatch stamps resolved to judgments, in a third
  store LCC's 24 Aug purge did not cover. Reported; LCC unpinned all 61 (1230).
- **~10.6% of existing resolutions are ambiguous pins.** Bulk resolution is
  **CONDITIONAL GO**: unique-only enforced in the write path, and repair first.
  Yield if done: 231,412 → ~2,735,781, an 11.8× graph.
- **`storage_key` is non-null on 0 of 18,698,984.** No source document retained.
- **Bench/coram exists for 38,326 documents, all Supreme Court.** No bindingness
  classifier is possible for the other 99.8%.
- **92.77% of our Supreme Court corpus is the SCR reporter edition.** Legal
  question, `FQ-N2-2`.
- **IPC, CrPC and the Evidence Act are absent** and the CrPC is the most-cited
  statute in the corpus. India Code holds none of the three.
- **73.5% of what a content-hash dedup would delete are common orders.**
- Treatment enrichment pilot: **0 of 11** hand-adjudicated candidates survived.
  **DO NOT SCALE.** Nothing written.
- **eCourts has never run** — authorised since 7 Aug, built, zero rows. Last real
  ingest was 19 August.

**Highest-value next item needs no source and no permission:** every one of the
862,594 statute references has `statute_id IS NULL`, and **323,524 of them match
an Act we already hold** on a deterministic join. `DATA_GAP_PRIORITY_QUEUE_V1`.

Founder items: `FQ-N2-1..5`. Bus 1177–1180, 1216, 1217, 1223, 1231, 1233, 1234.

**Cross-lane note for Fifth's §3 audit:** NEW2's 51 files were swept into LCC's
commit `e6ade19` — staged and committed in one call, with another lane's commit
landing between. Nothing lost; the attribution in the log is wrong.

---

## NEW2 · 26 Aug 2026 (R8.3) — four of my own R8.1 claims falsified, statutes at 79.77%, and our ingest is the stale side

`LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md` §11.
Artifacts in `docs/ai/new2-r83/`. Commits `b1bd5ff`, `24b8c73`, `65a3f2a`.

### The four corrections, each against something I wrote in R8.1

1. **`CrPC 1973 = CONFIRMED_ABSENT` was proved against a dead host.**
   `www.indiacode.nic.in` is now a migration stub and every legacy handle 404s —
   including the BNS handle still in `services/ingest/src/statutes.ts`. Ten items
   on the live platform carry CrPC bitstreams, all under STATE collections. MHA
   serves a byte-identical copy (643,659 B, md5 `d6ff18c7…`) and India Code
   independently records the same checksum.
2. **The 100,000-character `.pdf.txt` truncation is per-ITEM, not a platform cap.**
   The identical PDF has one derivative at 876,721 chars (all 484 sections) and
   another at exactly 100,000 (18.0%, with a complete table of contents).
3. **"AWS bulk dumps cannot make us current" is false for the High Courts.**
   That bucket wrote TODAY, 42 of 56 current-year objects within 7 days, newest
   decision yesterday. **Our walk is the stale side.**
4. **My pool role rates were drawn by `LIMIT` after a `WHERE`** — a court-clustered
   slab wearing an md5 hash. Supreme Court share 12.38% vs 44.40% on the full
   draw; `REPORTER_EDITORIAL` 1.32% vs 4.44%.

### What landed

| item | before | after |
| --- | ---: | ---: |
| `judgment_statute_refs` linked | 315,351 (36.56%) | **688,123 (79.77%)** |
| Acts held | 846 | **848** — CrPC 1973 (533 sections), IPC 1860 (552) |
| Companies Act 2013 false pins | 4,219 | **6** |
| fixture judgments | 16 | **0**, re-measured by me |

- **FIFTH's 1319 defect is fixed in the PLAN, not in a cleanup.** A name-only
  match to an Act that cannot supply ≥20% of the sections cited under that name
  is now `REFUSE_PAIR_UNIDENTIFIED`, so an apply cannot recreate it. A per-ref
  section test alone would have kept 3,267 of the Companies Act's 4,219 links.
- **Freshness is decomposed per adapter**, and the two AWS buckets get opposite
  verdicts: HC `LOCAL_INGEST_BEHIND`, SC `BOTH` (208 upstream rows for all of
  2026). `indiacode_statutes` is `ADAPTER_BROKEN` — it targets the dead host.
- **25 of 26 courts are `EFFECTIVELY_ABSENT` for 2026-08**, with **ragged** stop
  dates: Allahabad and Bombay fell off in July, Madras and Punjab & Haryana in
  August. Not one switch — a walk that ran out per scope.
- **The widened role census retires NEW1's 5.95× enrichment** (48 queries, 480
  passages, production `ef_search=200`): reporter is 6.46% of top-k against a
  4.44% pool, so 1.45×. What replaces it is worse — **`COURT_REASONING` is the
  only substantive class retrieval DEPLETES**, at 0.87×, while
  `HOLDING_OPERATIVE` is enriched 3.34×. The retriever rewards short declarative
  outcomes and is hostile to the reasoning that explains why.
- **FIFTH's F-5 blind packet is published**: 308 passages, predictions withheld,
  key sealed under a shared fingerprint.

### Next, in order

1. **Why the local walk stopped** — the freshness file measures the gap, not the
   fleet. Ragged per-court stop dates say this is per-scope, not global.
2. **Indian Evidence Act 1872** — `NOT_ACQUIRED`. All three official derivatives
   measured: two are the 100,000-char cap, the third is the damaged 1872 scan at
   95/167. Needs our own PDF extraction, whose recall is `NOT_MEASURED`.
   **17,576 references stay unlinked** and 79.77% must not be read as finished.
3. **The `indiacode.ts` adapter rewrite** against DSpace 7 — post-freeze per §11
   N2-10, but the freshness record must stop calling it a working adapter.
4. **N2-9** — 14 OCR docs and 595 bounded date cases, only if FIFTH's
   limited-freeze verdict still needs them.
5. **`statute_amendments` for the two new Acts** — footnote markers are in the
   body text; the notes are `NOT_EXTRACTED`.

### Carried, unchanged

`storage_key` is non-null on 0 of 18.7M — no source document is retained.
Bench/coram exists only for the 38,326 Supreme Court documents. 92.77% of our
Supreme Court corpus is the SCR reporter edition (`FQ-N2-2`, counsel). eCourts
has never run: authorised since 7 Aug, built, **0 observations**.
