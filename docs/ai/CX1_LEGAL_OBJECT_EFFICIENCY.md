# CX1 Legal-Object Efficiency Audit

Generated: **2026-08-17T13:17:38.452Z**

## Boundary

Offline CX1 analysis only. This audit reads existing triage JSON and schema documentation, writes lab artifacts, and prepares read-only selectors. It does not call a model, query PostgreSQL, change prompts, promote enrichments, or alter retrieval.

## Overall Triage

Across the five 0051 legal-object tasks, the existing post-fix triage contains **4,119** candidate quote claims, **3,374** verified and **745** rejected. Overall verification rate is **81.9%**.

Owner-labelled rejected mix: ingest **514**, model **216**, verifier **15**. Additional unexplained-drift bucket count: **219**. Fabrications caught by span verification: **35** (**0.9%** of all claims).

## Task Summary

| Task | Verified | Rejected | Verification | Fabrications | Model rejected | Recommendation |
|---|---:|---:|---:|---:|---:|---|
| `arguments` | 487/621 | 134 | 78.4% | 0 (0.0%) | 32 (23.9% of rejected) | CLEAR_TO_1000 |
| `authorities` | 483/580 | 97 | 83.3% | 0 (0.0%) | 32 (33.0% of rejected) | CLEAR_TO_1000 |
| `case_structure` | 1056/1289 | 233 | 81.9% | 30 (2.3%) | 79 (33.9% of rejected) | HOLD_AT_100 |
| `holding` | 643/789 | 146 | 81.5% | 1 (0.1%) | 34 (23.3% of rejected) | CLEAR_TO_1000 |
| `topics` | 705/840 | 135 | 83.9% | 4 (0.5%) | 39 (28.9% of rejected) | CLEAR_TO_1000 |

## Routing Proposal

- Keep `holding`, `arguments`, `authorities`, and `topics` eligible for the existing 1,000-document expansion plan, subject to owner-lane approval and continued span verification.
- Hold `case_structure` at 100 until prompt/router changes reduce narrative `fact` fabrication and the task is remeasured.
- Treat this as spend and quality triage only. It is not a product safety waiver, because span verification caught and dropped the rejected claims.

## Single-Grant Runtime Envelope

Baseline classified substantive population from the legal-object program: **233,656** documents. At the observed **16s/document-task**, all five tasks would be about **5,192.4 hours** on one grant. Running only the four cleared tasks is about **4,153.9 hours**, deferring about **1,038.5 hours** of `case_structure` spend.

## High-Risk Kinds

| Task | Kind | Rejected | Fabrication | Model bucket rate | Recommendation |
|---|---|---:|---:|---:|---|
| `case_structure` | `fact` | 23.6% | 3.2% | 8.9% | ROUTE_TO_PROMPT_REWORK |
| `case_structure` | `procedural_history` | 17.2% | 2.5% | 4.9% | ROUTE_TO_PROMPT_REWORK |
| `case_structure` | `chronology` | 13.7% | 2.4% | 5.1% | ROUTE_TO_PROMPT_REWORK |
| `case_structure` | `relief_sought` | 18.4% | 1.4% | 4.1% | KEEP_SPAN_VERIFICATION_AND_MONITOR |
| `case_structure` | `issue` | 18.7% | 1.2% | 7.0% | KEEP_SPAN_VERIFICATION_AND_MONITOR |
| `topics` | `topic` | 17.1% | 0.6% | 4.9% | KEEP_SPAN_VERIFICATION_AND_MONITOR |
| `holding` | `relief_granted` | 13.2% | 0.5% | 4.8% | KEEP_SPAN_VERIFICATION_AND_MONITOR |
| `topics` | `search_concept` | 15.4% | 0.4% | 4.5% | KEEP_SPAN_VERIFICATION_AND_MONITOR |
| `authorities` | `authority_relied_on` | 25.6% | 0.0% | 8.8% | KEEP_SPAN_VERIFICATION_AND_MONITOR |
| `arguments` | `argument_petitioner` | 21.7% | 0.0% | 6.0% | KEEP_SPAN_VERIFICATION_AND_MONITOR |
| `holding` | `holding` | 17.2% | 0.0% | 5.0% | KEEP_SPAN_VERIFICATION_AND_MONITOR |

## Prepared Selectors

- `docs/ai/cx1-legal-object-efficiency/efficiency-selector.sql` measures enrichment coverage, verification, token, and latency slices by task/model/court/year/class/length band.
- `docs/ai/cx1-legal-object-efficiency/llm-cost-selector.sql` measures coarse `feature = extract` cost by model/day. Current schema does not link `llm_calls` rows to `document_enrichments`, so per-task cost attribution remains not-yet-KNOW.

## Evidence Files

- `docs/ai/cx1-legal-object-efficiency/triage-summary.json`
- `docs/ai/cx1-legal-object-efficiency/task-summary.csv`
- `docs/ai/cx1-legal-object-efficiency/kind-risk.csv`
- `docs/ai/cx1-legal-object-efficiency/router-proposal.json`
