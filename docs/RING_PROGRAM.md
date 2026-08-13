# The ring programme — long-running work, and how not to drift

**Written 13 Aug 2026 by LCC, as orchestrator, after the founder's
data-before-embeddings decision.** It exists because four agents working in
parallel on one corpus drift in three specific ways — inventing work, chasing a
target that cannot be hit, and building more than the measurement asked for —
and each of those is cheaper to prevent than to unwind.

**Read `docs/LANE_PROTOCOL.md` first.** That is the contract. This is the
programme.

---

## 1 · THE GATE, AND WHY IT IS NOT A FINISH LINE

The founder's decision: **fund chunk-text coverage now; start embeddings only
once we hold all available data from all courts, all cases and citations are in,
and the data is structured.**

**"All available data" is a moving target, and pretending otherwise is the first
drift.** Checked against the source rather than assumed:

| | |
| --- | --- |
| dataset | `indian-high-court-judgments`, AWS Open Data |
| scale | **~17.8M judgments · 25 high courts · 45 benches · ~1.25 TiB** |
| **update cadence** | **DAILY** |
| provenance | eCourts web portal, with some courts **backfilled from the eCourts mobile API where the web portal is incomplete** |
| metadata | parquet: CNR, decision date, order number, PDF-exists flag, `source` tag (web/mobile) |

**A daily-updated source cannot be "finished".** So the gate is not *ingest
everything once*; it is:

> **Reach parity with the source, then stay current.**

Anyone who reads the gate as a one-time bulk job will either declare victory
early or never declare it at all. Both are wrong.

**A second scoping fact that matters more than it looks.** NJDG carries **~33
million district-court orders/judgments** — a universe roughly twice the High
Court dataset, and **not** part of the authorised AWS bucket. *"All courts"*
means the 25 high courts plus the Supreme Court unless the founder says
otherwise. **Nobody expands scope to district courts on their own reading of the
phrase.**

---

## 2 · THE THREE WAYS THIS RING WILL DRIFT

Named so they can be caught, each drawn from something that already happened
here rather than from a list of general worries.

### 2a · Inventing work the measurement did not ask for

The citation pass produced `edges=0` over 8,100 documents. The tempting
conclusion was *"the extractor is broken, rewrite it."* The extractor was
**fine** — it was the ordering. A rewrite would have been days of work solving
nothing.

> **Rule: before fixing a component, test the component directly against the
> population that appears to be failing.** One measurement beat one rewrite.

### 2b · Chasing a target that cannot be hit

Enrichment runs at a few documents a minute against an ingest of ~34,000/hour.
**Enrichment can never cover the whole corpus and it is not supposed to.** Its
queue is prioritised — repaired, then substantive, then newest — precisely
because uniform coverage is the wrong goal.

> **Rule: state what a workload will NOT cover, before starting it.** A pass
> with no stated scope silently acquires an infinite one.

### 2c · Overengineering past the evidence

`docs/ai/CITATION_CONCORDANCE_EVALUATION.md` is the standing example: a fully
built model-adjudication layer that measurement rejected. Keeping it out of the
canonical path was the whole value of building it.

> **Rule: the smallest thing that answers the question, and a refusal is a
> result.** 34 overruled edges got a report-only tool, not a promotion pipeline,
> because 34 rows is a human read.

### 2d · Researching feasibility instead of researching the decision

I nearly replaced DeepSeek V4 with a local Qwen2.5 7B, and had measured the
hardware exhaustively to justify it — VRAM per context length, tokens/sec,
quantisation, whether 8 GB fit. **I never once searched for the capability
gap.** It is 5–0 against Qwen on shared benchmarks, and DeepSeek-V3 alone
outperforms Qwen2.5 *72B*, ten times the size of the model I proposed. V4 is a
later generation still.

**Feasibility research feels like diligence and reads like diligence**, so it
substitutes for the decision without anyone noticing — including the person
doing it.

> **Rule: before substituting any model, tool or library for a better-performing
> incumbent, search for a head-to-head comparison FIRST and put the numbers in
> the proposal.** If no comparison exists, say so explicitly rather than
> arguing from architecture. *Cheaper*, *faster* and *local* are never the case
> on their own.

**And when a project rule already names the incumbent** — `CLAUDE.md` §5 names
DeepSeek V4 Flash for public-class work — swapping it is a change to the rule,
not an implementation detail, and not a call a lane makes alone.

---

## 3 · LONG-RUNNING ASSIGNMENTS

Each is measurable, bounded, and states what it excludes.

### NEW2 — ingestion · **now the critical path**

Embeddings wait on this lane's completeness.

1. **Court coverage to parity.** 20 workers running. The measure that matters is
   **held ÷ source-document count per court**, not raw totals — Allahabad at
   3.49M source documents dominates any absolute number.
2. **Report at 50% per court** (already committed to). That is the signal LCC
   uses to point citation, statute and paragraph passes at fresh material.
3. **Then track daily.** The source updates daily; parity is a state to hold,
   not a milestone to pass.

**NOT in scope:** district courts, enrichment tables, retrieval.

### NEW3 — discovery · **also gating**

*"All cases and citations"* makes this a gate rather than a nice-to-have.

1. **The Constitution parser input.** LCC will build the parser; NEW3 supplies
   the shape — is the bitstream one PDF or addressable articles, and are the
   Schedules in the same file?
2. **Hold the missing-authority re-rank** until LCC's citation backlog lands.
   The queue is built from `external_citations`, still frozen at
   2026-08-11T00:34Z; `judgment_citations` is the table that is moving.
3. **The 13 overruled targets with NO candidate.** If a Supreme Court judgment
   says X was overruled and X cannot be found by name *or* citation in a 99.98%
   complete SC corpus, either the name extraction failed or the target is
   genuinely absent. **Only this lane can answer that**, and it is the sharpest
   question the ring has.

**NOT in scope:** writing corpus tables, unauthorised sources (§6a is the whole
list), resolving licensing alone.

### NEW1 — retrieval · **the instrument that says when the gate is met**

1. **Re-run `failure:classify` after LCC's citation backlog completes.** The
   graph has grown 294,809 → 444,621+ and is weighted toward substantive
   judgments.
2. **Segment every benchmark by `hc_document_class`.** 57,876 bail orders and
   20,641 procedural disposals genuinely cite nothing and contain no reasoning;
   measuring them beside 39,914 reasoned decisions understates the system
   against real queries.
3. **Do not tune RRF or fusion weights** until a measurement settles it. The
   100-query arms run put hybrid-vs-dense at **p=0.2266** — directionally worse,
   **not proven**, and this lane's own rule applies to itself.
4. **Control for corpus scale.** *Document-Level Retrieval Mismatch* is a
   documented failure that **worsens as a corpus grows** (arXiv 2510.06999). The
   corpus went 79k → 600k during the measurement window, so some degradation is
   scale rather than regression.

**NOT in scope:** canonical corpus writes, embeddings.

### LCC — enrichment · orchestration

Running: paragraph evidence, citation backlog, statute references, metadata and
treatment enrichment, Allahabad recovery. Next: wire `operativeParagraph` to
`judgment_paragraphs`; the Constitution parser once NEW3 supplies the shape.

**NOT in scope:** embeddings, acquisition, ingestion, ranking, `apps/**`.

---

## 4 · THE RULES THAT APPLY TO EVERY LANE

- **Verify before relying.** Another lane's report is a claim. NEW3's
  `external_citations` staleness was right; the deeper cause was not what
  anyone assumed.
- **A refusal is a result.** Unresolved ≠ missing. No result ≠ does not exist.
  Not indexed ≠ not relevant.
- **Never promote model output to canonical legal truth.** The concordance
  evaluation measured 10.8% fabrication when the answer was absent.
- **Every long job: keyset pagination, `connect_timeout: 120`, retry on
  transient transport, resumable from the database.** Four workers died today
  without these.
- **Announce before saturating a shared resource** — InferX, the DB proxy, the
  GPU.
