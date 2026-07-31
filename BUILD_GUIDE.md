# LAWMIND — BUILD GUIDE

## Method
Four disjoint agent file-sets in parallel within one sprint. Hard gate. Then
advance. Never two sprints concurrently.

## Lanes and ownership

| Lane | Owns | Never touches |
|---|---|---|
| **LCC** | `services/api/**`, `packages/db/**`, migrations | app screens, auth internals, `.env*` |
| **RCC** | auth, middleware, validation, security, PII pseudonymisation | business endpoints, UI |
| **CX1** | `apps/mobile/**` | api internals, db, cron |
| **CX2** | `apps/admin/**`, `services/cron/**`, `services/ocr/**`, monitoring | mobile app, api business logic |

Shared seam: `docs/API_CONTRACTS.md`. CX1 and CX2 build against it with mocks and
do not wait on LCC. RCC ships auth and pseudonymisation as importable modules;
LCC wires them. That import boundary is frozen once written.

## Sprints

| # | Deliverable | Gate — observed, not assumed |
|---|---|---|
| S0 | Repo, Railway project, Postgres + pgvector, CI, doc suite | `railway up` green, migrations apply, CI passes |
| S1 | Corpus ingest: SCI 5yr + BNS/BNSS/BSA. OCR pass for scans. Chunk, embed, index | 15K+ docs indexed; known citation retrieved < 3s; `ocr_confidence` populated |
| S2 | Search API + three-tier verification + adversarial set | **Zero unverified-shown-as-confirmed. Zero silent drops. 100% adversarial pass. Advocate signs off.** HARD STOP |
| S3 | Court adapter, matter registration, nightly sweep, push, eCourts Tier 3 | Briefing on a real device 24h before a real listing |
| S4 | 10 drafting templates, then Hindi. OCR intake UI | Advocate approves >90% of 50 drafts; law graduates approve Hindi register; OCR fields confirmed before save |
| S5 | Auth, IAP + Razorpay, onboarding | Signup → subscribe → use, both platforms |
| S6 | Admin, monitoring, alerts, verification-state breakdown, OCR review queue | All 6 alerts fire in a drill |
| S7 | Store submission, 20 beta advocates | Both apps approved; 15/20 open 3+ times in week one |

## Gate S2 is a hard stop
If verification is not clean, nothing downstream matters. Do not proceed to S3 to
keep momentum. This is the instruction most likely to be rationalised away under
schedule pressure.

## Blocked until resolved
- **OD-6** blocks any feature sending uploaded document content to a model
- **OD-7** blocks scanned intake (S4 OCR UI)
- **OD-4** blocks S1 corpus embedding

## Dispatch pattern
Each sprint gets `sprints/SPRINT_N.md` with one `## AGENT` block per lane, each
pasting into its own session. Blocks state OWN paths, TASK, DONE, NEVER. The
NEVER list keeps parallel agents from clobbering each other.
