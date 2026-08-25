# THE 10-MATTER PRODUCT REGRESSION — specification, rubric, and the first run

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-1.

This replaces `PREMIUM_10_MATTER_WALKTHROUGH_V1.md` as the standing product
acceptance test. That file stays as the historical record of the round that found
the briefing P0; it is not re-run, because it cannot be — its driver and its raw
JSON were scratch files, its ten matters were chosen by area of law, and its
accounts were `crypto.randomUUID()`.

**What is different here, in one line:** every input is pinned, every output is
retained, and the whole thing re-runs with one command.

```
pnpm --filter @lawmind/harness product:ten
```

| Artifact | Path |
| --- | --- |
| Scenario definitions + invariants | `services/harness/src/new3-ten-matter-fixture.ts` |
| Runner | `services/harness/src/new3-ten-matter-cli.ts` |
| Raw results (retained, committed) | `docs/ai/new3/ten-matter-regression.json` |
| Per-matter checkpoint | `docs/ai/new3/ten-matter-regression.checkpoint.jsonl` |

---

## 1 · The design decisions, and why each one

### 1.1 The instrument is the real app, in process

`createApp(...).request(...)` — the same Hono app the service serves. Not
`hybridSearch` directly, which would skip the 500-character validator, the
exact-identity gate and the embed budget; and not a live server, because "did you
remember to start the API" is exactly the kind of flake that gets a regression
test deleted. `launch-benchmark-cli.ts` established this and its reasoning holds
unchanged.

### 1.2 Ten failure modes, not ten areas of law

The previous run sampled bail / murder / writ / commercial / arbitration. That
samples the **corpus**. An acceptance test has to sample the ways the product can
hurt an advocate. Nine of the ten below are selected for a failure mode and the
tenth is the control.

### 1.3 Every matter is pinned to a judgment id, and the property is re-asserted

Each scenario names real rows read out of `judgments` and `judgment_citations`.
Before anything is scored the runner **re-asserts the property the scenario is
named for**. If `overruled_status` or `treatment_provenance` moves, the matter
reports `FIXTURE_DRIFT` and its score is **withheld** rather than silently
measuring a different thing under the same name. That is the difference between
a regression test and a benchmark that quietly re-baselines itself.

`checked` is tracked separately from `held`: an invariant the database refused to
answer (a `57014` under load — this happened on the first run) is not the same
fact as an invariant that came back wrong, and collapsing them would make a
contended box look like a corpus change.

### 1.4 It never mutates the corpus, and never turns a flag on

No `overruled_status` is flipped to make an alert fire; no treatment edge is
rewritten; no judgment is inserted. Every write is tagged `new3-ten-matter-*` and
deleted in a `finally`. Premium flags default OFF and are **left off** — a 404
from a premium route scores `N/A`, because the safe configuration must not look
like a defect. `PREMIUM_LOCAL=1` opts in locally and restores the prior rows.

This is why M09 reports `ALERT_PATH_ONLY` rather than a tick: `alerts` holds zero
rows corpus-wide, firing one honestly needs a corpus mutation, and a test that
fabricates its own precondition is measuring itself.

### 1.5 The instrument's own failure mode, recorded because it happened twice

The first two runs read the wrong key for the matter id, got `undefined`, and
**silently skipped five steps** — save-authority, list, timeline, premium preview,
briefings — while every step that did run returned 200 and the run reported
success. That is an acceptance test failing in the only direction it must never
fail: quietly measuring less than it claims, and looking greener for it.
`matter_id_missing` is now a recorded step, so no future artifact can show a pass
that skipped half the workflow.

---

## 2 · The scenarios

| # | Key | Scenario | Anchor | Why it is in the set |
| --- | --- | --- | --- | --- |
| 1 | `M01-partial-overruling` | partial overruling | **Kharak Singh**, 1962 INSC 389, `partly_set_aside` | Half-moved authority. Partly-overruled must never render as fully overruled, and must stay addable. |
| 2 | `M02-reporter-treatment` | reporter treatment signal | **Synthetics & Chemicals**, 1989 INSC 321, `set_aside` on ONE reporter-headnote edge | 95.62% of all LAW MOVED edges are a reporter's apparatus (NEW2 bus 1102). Copy may not assert court authorship. |
| 3 | `M03-court-treatment` | court treatment signal | **S. N. Dutt**, 1961 INSC 117, `set_aside` on `COURT_REASONING_EXPLICIT` | The control for M02. One of only **five** edges corpus-wide where the court overruled in its own words. If M02 and M03 render identically, provenance is not reaching the surface. |
| 4 | `M04-modality-defect` | modality defect | **T. R. Challappan**, 1975 INSC 212, `set_aside` on a subjunctive in a dissent | The sole driver is Tulsiram Patel's dissent saying the case *"is sought to be overruled by the judgment proposed to be delivered by my learned Brother"*. Right verb, wrong mood. |
| 5 | `M05-ambiguous-identifier` | ambiguous identifier | `2023:AHC:169979` — **two** Allahabad judgments, same date | A single confident result here is the worst outcome in the fixture: the advocate walks into court with the wrong case and no signal a choice was made for them. |
| 6 | `M06-wrong-domain` | wrong-domain retrieval | none (deliberately) | Reproduces the 23 Aug miss: a commercial breach position that returned an IPC §394 robbery conviction. |
| 7 | `M07-no-authority` | no-authority | none | A doctrine that does not exist. The product must abstain, not return its nearest guess. |
| 8 | `M08-fixture-leak` | corpus integrity | `SYNTHETIC — Set Aside Fixture` (Test Court) | Leaked test rows live in production `judgments`. Can one reach an advocate's results? |
| 9 | `M09-monitoring` | monitoring | **Mohd. Shafi**, 2007 INSC 390, `doubted` | The third LAW MOVED value, the one most likely to be dropped by a surface that only handles `set_aside`. |
| 10 | `M10-normal` | control | none | Anticipatory bail. The single most common thing an Indian criminal advocate does. If this is not PASS, the fixture is not telling you about edge cases. |

---

## 3 · The rubric

Nine axes, per the plan, scored **per matter**. Four values, and `N/A` is
load-bearing: a surface deliberately switched off must not score FAIL, because
that makes the safe configuration look like a defect and creates pressure to turn
it on.

| Axis | PASS means |
| --- | --- |
| `research_usefulness` | The advocate got to a usable authority for the question they asked. |
| `source_grounding` | Everything shown traces to a held document; nothing is generated from memory. |
| `currentness_correctness` | The LAW MOVED state shown matches the DB row, in the right one of three states, with the right strength. |
| `matter_workflow` | Create → save → timeline → read back, without a refusal the advocate cannot act on. |
| `counterargument_quality` | The returned authority is in the right domain, or the product abstains. |
| `briefing_quality` | The briefing's claims match live state. |
| `monitoring` | A status change on a saved authority reaches the advocate. |
| `time_saved` | Faster than the advocate's current workflow for this task. |
| `advocate_would_prefer` | A practising advocate would choose this over what they do today. **Scored by a person, never by the runner** — an automated verdict here would be fiction. |

---

## 4 · FIRST RUN — 25 August 2026

**10/10 matters completed. Zero fixture drift.** Every scenario's pinned property
still held, so every score below is about the product and not about the fixture.

Conditions, stated because they bound every number: **dense arm DISABLED**
(`embedQuery` returns null — NEW1 owns dense measurement and the GPU was at 100%
with their walk). Premium flags left OFF. Box `LOCAL_CONTENDED`: resource gate
read `DEFER DB_SCAN`, GPU 100%, commit free 9.8%.

### 4.1 Scorecard

| Matter | research | grounding | currentness | workflow | counter | briefing | monitoring | time | prefer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 partial overruling | **FAIL** | PASS | PASS | PASS | PARTIAL | N/A | N/A | PARTIAL | — |
| M02 reporter treatment | PASS | PASS | **PARTIAL** | PASS | PASS | N/A | N/A | PASS | — |
| M03 court treatment | PASS | PASS | **PARTIAL** | PASS | PARTIAL | N/A | N/A | PASS | — |
| M04 modality defect | PASS | PASS | **FAIL** | PASS | PARTIAL | N/A | N/A | PARTIAL | — |
| M05 ambiguous identifier | **PASS** | PASS | PASS | PASS | PARTIAL | N/A | N/A | PASS | — |
| M06 wrong domain | PARTIAL | PASS | PASS | PASS | **FAIL** | N/A | N/A | **FAIL** | — |
| M07 no authority | PARTIAL | PASS | N/A | **PARTIAL** | **PASS** | N/A | N/A | PARTIAL | — |
| M08 fixture leak | **PASS** | PASS | PASS | PASS | PASS | N/A | N/A | PASS | — |
| M09 monitoring | PASS | PASS | PASS | PASS | PARTIAL | N/A | N/A | PASS | ALERT_PATH_ONLY |
| M10 **control** | **FAIL** | N/A | N/A | PASS | **FAIL** | N/A | N/A | **FAIL** | — |

`briefing_quality` is `N/A` on all ten: no briefing exists for a matter created
seconds ago (the sweep is nightly). **Briefing quality is therefore UNMEASURED
this round** — not passed.

`advocate_would_prefer` is deliberately blank. It needs a practising advocate and
this lane will not invent one.

### 4.2 The two P0s

**P0-1 — the control failed. The commonest searches in Indian criminal practice
are structurally unrankable by the lexical arm.**

`"anticipatory bail"` returned `results: []`, HTTP 200, in 4 ms, with
`degraded: ["sparse_unbounded"]`.

This is not a timeout and not a bug in `retrieve.ts` — it is that module working
exactly as designed and documented. `sparseAny` refuses to rank when its rarest
lexeme exceeds `SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY = 0.05`, because at 0.05
(~935,000 documents, 0.67 ms per ranked row) `ts_rank` is over ten minutes. The
design note says in as many words that a refused query "returns the dense arm's
results and says `sparse_unbounded`".

Measured against `lexeme_document_frequency`, three of the commonest queries an
Indian advocate types are in that refused class:

```
REFUSES  rarest df 0.06902   anticipatory bail       (anticipatori 0.0690 · bail 0.2577)
REFUSES  rarest df 0.25774   bail application        (applic 0.5473 · bail 0.2577)
REFUSES  rarest df 0.11922   quashing of FIR         (fir 0.1192 · quash 0.1194)

ranks    rarest df 0.01505   temporary injunction
ranks    rarest df 0.00089   cheque bounce section 138
ranks    rarest df 0.00513   compassionate appointment
ranks    rarest df 0.03106   condonation of delay
```

`bail` alone appears in **25.77%** of the sampled corpus. That is why bail is
structurally hard for a lexical arm, and bail is the highest-volume thing in
Indian criminal practice.

So for this class the product has exactly **one** arm — dense — and NEW1 measured
its reach at **40,161 judgments of 18.7 million (0.21%)** (bus 1057). And when
dense is unavailable at all — a cold embedder, or the 2-second budget expiring,
a state `index.ts` explicitly logs as *"search is lexical-only"* and keeps
serving — the advocate gets an empty 200 that renders as "no law found".

**This is a product decision, not a bug report.** The engineering is right; the
consequence is that the highest-volume query class in the target market currently
depends entirely on the arm with 0.21% coverage. It belongs to the founder and to
NEW1's passage-build decision, and it is the single strongest argument in this
round's evidence for funding that build.

**P0-2 — the judgment reader returned HTTP 500 after 40 seconds.**

M07, `GET /judgments/:id` on an Allahabad judgment: **40,024 ms, then 500**
(statement timeout). The core reader — feature #1's terminal step — failed
outright. One occurrence in this run; not yet characterised by document size,
court, or contention. LCC's file; sent on the bus.

### 4.3 The rest, in severity order

**Provenance does not reach the wire at all.** `treatmentProvenanceOnWire: false`
on all ten matters. **M02 and M03 render identically** — a law reporter's headnote
and the court's own words are indistinguishable to an advocate. Migration 0082's
own comment says "Nothing reads this column yet", so this is confirmation rather
than discovery, but it is now confirmed *from the product surface* rather than
from the schema. It blocks claim B4 and it is the precondition for any honest
currentness copy.

**`/arguments/counter` has no abstention signal.** `counterKeys` is exactly
`position, asOf, authorities, excluded, unverifiedReferences`. There is no
`reviewRequired` field on the wire. The route returns 12 nearest authorities, or
0, and the client cannot tell a confident answer from a shrug.

The 0 case is better than expected and worth recording: M07's non-existent
doctrine and M08's nonsense position both returned **0 authorities** rather than a
plausible nearest neighbour. So the route *does* abstain when lexical retrieval
finds nothing. **M06 is the dangerous shape**: a position that is lexically
related but semantically wrong returned 12 authorities headed by
*Pappu @ Sanjeev Sharma v. State of Rajasthan* — an IPC §394 robbery conviction,
for a commercial breach-of-contract position. **Identical to the 23 August miss,
reproduced deterministically two days later.** That is now a permanent regression
case.

**M01: a case name plus one topic word leaves the exact-identity route.**
`"Kharak Singh v State of Uttar Pradesh surveillance"` returned five results and
Kharak Singh was not among them; the citation probe found it at rank 1. The
sparse arm did *not* refuse this query (rarest df 0.0002 for `kharak`) — it ran
and ranked, and the target lost. That is a ranking failure, not a refusal, and it
is a different fix from P0-1.

**M04's modality defect, corrected against this run's own evidence.** This
document's first draft said the defect blocks add-to-matter. **It does not.** OD-14
as resolved 21 Aug derives `precedentialEffect` from the *edge*, and an
`overruled` edge maps to `addToMatter: 'allow'` — only an unexplained bare
`set_aside` refuses. M02/M03/M04 all saved at 201. So the harm is narrower and
still real: a genuine 1975 Supreme Court authority carries a LAW MOVED mark whose
entire evidence is a subjunctive in a dissent.

**M08 — the fixture leak is growing but is not reachable by search.**
`judgments` held 6 `Test Court` rows on 23 Aug (`docs/ops/lcc/TEST_COURT_ROWS_FINDING.md`)
and holds **16** on 25 Aug, counted exactly. The leak is cumulative. But
`testCourtRowsInResults: 0` on all ten matters, and the query
`"SYNTHETIC Set Aside Fixture"` returned real judgments about synthetic
chemicals, not the fixture. **One caveat**: `GET /judgments/00d958ce-…` returns
200 — a leaked synthetic judgment is fully readable through the reader by anyone
holding its id. No path currently hands out that id.

**M05 passed cleanly, and it is the fixture's best news.** `2023:AHC:169979`
returned **both** judgments with `ambiguous: true`. The product does not guess
which case the advocate meant. This is a genuine differentiator and it is safe to
say publicly.

**Latency.** `/arguments/counter` p50 across ten matters is ~4.8 s and the tail is
**23,657 ms** (M04) and 12,004 ms (M10). M06's `/search` took **14,119 ms**.
Against a mobile UX budget these are failures regardless of result quality — plan
§6 LCC-4's "bounded server response or degraded path rather than hanging".

**`parties` returns as a JSON string, not an object.** `POST /matters` echoes
`"parties":"{\"petitioner\":…}"`. A contract-shape question for RCC/LCC, recorded
on every run rather than asserted here.

### 4.4 What worked, stated plainly

- Citation identity: 4/4 neutral citations returned exactly one result at rank 1, 4–15 ms.
- Ambiguity: both judgments, flagged, no guessing.
- Save/refuse: `AUTHORITY_SET_ASIDE` fired correctly on the one judgment whose status has no edge behind it, and correctly did **not** fire on the three whose status is explained.
- Authority state read live from the row every time: `verificationState`, `verifiedBySource`, `overruledStatus` — never invented.
- Premium fails closed: `/me/entitlements` and `/matters/:id/premium-preview` 404 on all ten with flags off.
- Matter workflow: create → save → timeline → read back, 10/10.
- Abstention by emptiness on genuinely unmatched positions: 2/2.

---

## 5 · What this run does NOT establish

- **Nothing about the dense arm.** It was disabled. Every retrieval number here is lexical plus exact-identity only.
- **Nothing about briefing quality.** No briefing existed to read. `N/A`, not PASS.
- **Nothing about monitoring actually firing.** `ALERT_PATH_ONLY`.
- **Nothing about drafting**, English or Hindi — not exercised.
- **Nothing about the mobile UI.** This is the API contract each screen consumes.
- **Nothing about `advocate_would_prefer`.** Needs an advocate.
- **Nothing about production latency.** `LOCAL_CONTENDED` throughout.

## 6 · The regression contract

This test is now the acceptance gate for the launch claims in
`WEBSITE_CLAIM_EVIDENCE_MATRIX.md`. Two of its outputs are wired directly to that
file:

- a `FIXTURE_DRIFT` on any matter → the affected claim's status is suspended until re-adjudicated;
- a non-zero `testCourtRowsInResults` on any matter → **claim B5 comes off the website that day.**

Re-run before any release, and after any change to retrieval, treatment
propagation, or the matter surfaces.
