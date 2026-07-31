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
| Store rejects build | Submission blocked | Almost always legal-advice framing. Research tool for licensed practitioners |

## Escalation
Anything touching citation accuracy or silent drops escalates immediately and
blocks release. Everything else follows the normal gate.
