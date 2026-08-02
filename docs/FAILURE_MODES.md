# FAILURE MODES

What breaks, how it presents, what to do. Written before the failures happen so
nobody improvises at 2am.

| Failure | Presents as | Response |
|---|---|---|
| Citation fails all tiers | `unverified` rows in `citation_checks` | Render unverified state (automatic). Rate > 0.5% → page. Prompt or retrieval regression — do not patch at the render site |
| **Citation silently dropped** | `shown_to_user = false` with no unverified render | **Page immediately.** This is the failure v1 had. Zero threshold |
| Model references an ID not in context | High unverified volume | Prompt regression. Roll back the prompt version — prompts are versioned in `packages/prompts` |
| Tier 2 sources disagree | Low `match_confidence` | Escalate to Tier 3 human confirmation. Never pick one silently |
| eCourts CAPTCHA flow abandoned | Job stuck at `needs_review` | Expected. Citation stays unverified and renders as such |
| Nightly sweep does not complete | No briefings for tomorrow | Alert by 00:30 IST. Advocates walk into court unprepared — trust failure, not cosmetic. Manual re-run, then root cause |
| Court vendor returns stale hearing date | Briefing on the wrong day | Fall back to advocate-entered date; vendor date advisory until OD-1 proves reliability |
| OCR corrupts a hearing date | Wrong date saved | Should be impossible — `confirmed_by_user` gates writes. If it happens, the confirmation step was bypassed. Severity high |
| OCR confidence low across a batch | Many `needs_review` | Preprocessing regression, or a genuinely bad scan source. Check deskew before blaming the engine |
| PII detection misses an entity | Unpseudonymised name in a prompt log | Expected at ~20%. Log, do not panic. If systematic for a name class, retrain the detector |
| Embedding service down | Search returns nothing | Degrade to sparse-only full-text, flag reduced quality. Never return empty silently |
| LLM provider outage | AI features fail | Plain "AI unavailable" state. Never fall back to an unverified cached answer |
| LLM spend spike | `llm_calls` daily total climbs | Alert at $50/day. Check for a retry loop before assuming growth |
| Devanagari renders as boxes | Hindi draft shows □□□ | Font not bundled in that surface. Check the PDF export path specifically — most often missed |
| Overruled rendered without badge | Silent | Harness catches it. Threshold zero. Severity high |
| **Stale overruled status — VERIFIED badge on law that has since moved** | Silent, and the citation looks perfect | **Page immediately.** Same severity as a hallucination. `overruled_status` is read live, never cached — `CITATION_HARNESS.md`. Check the 22:30 re-check completed, then whether a render path cached it |
| Overruled re-check does not complete | Briefings may carry stale authorities | Alert at 22:50, before the 23:00 sweep. Sweep still runs; affected authorities render with their as-of date, never as current. Manual re-run, then root cause |
| Citation fan-out partially completes | Corpus says overruled, advocate never told | Should be impossible — one transaction, and failure rolls the whole thing back. If it happens, the transaction boundary was broken. Severity high; reconcile from `citation_fanouts` where `status = 'failed'` |
| Copy record never syncs from the outbox | Silent — a copied citation we cannot warn about | Monitor outbox age for `citation_copies`, do not assume delivery. The advocate has left the app with a citation and we have no record of it. Severity high |
| Stale-overruled rate reads 0.0% but advocates report stale badges | Metric green, users disagree | The metric compares render against corpus, **not against truth** — a corpus that never ingested the overruling agrees with itself. Believe the advocates. Check corpus coverage and the disputed-citations queue, not this number |
| Kill switch thrown with no ledger row | Unreconstructable incident | Should be impossible — the audit write shares the config write's transaction. If a switch moved without a row, the transaction boundary was broken. Severity high |
| Store rejects build | Submission blocked | Almost always legal-advice framing. Research tool for licensed practitioners |

## Targets to measure, not gates

Recorded here because they are how the product fails quietly. **None of them is a
gate.** A gate nobody can evaluate is worse than an honest target — it either
gets waved through or blocks on a guess, and both teach the team to ignore it.

| Target | Measure at | On what | Why it is not a gate yet |
|---|---|---|---|
| **Adjournment capture: under 4 seconds, lock screen → saved** | **S3** | A **Redmi-class mid-range Android**, airplane mode, cold app | Named in `design/screens/IMPLEMENTATION.md` §9d. It is the highest-frequency write in the product, and the one screen used standing up in a courtroom. Cannot be evaluated without the device — no simulator, laptop or CI run is evidence for this number |

**How it fails if we miss it.** Not with an error. The advocate writes the date on
the physical file instead, because that took two seconds, and never opens the
screen again. The loop that was supposed to create the habit becomes the thing
they route around — and nothing in the logs says so. **Measure it on the device
or do not claim it.**

Two conditions travel with the number: **offline** (court buildings have no
signal, so any measurement on wifi is measuring the wrong thing) and **cold
start** (the app will not already be open — it is being pulled out of a pocket).

---

## Escalation
Anything touching citation accuracy or silent drops escalates immediately and
blocks release. Everything else follows the normal gate.
