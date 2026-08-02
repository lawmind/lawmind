# LAWMIND

AI research and drafting assistant for practising advocates in India.
Helmor Pvt Ltd · lawmind.co · `co.lawmind.app`

## Read first — in this order
1. `CLAUDE.md` — how agents work on this project
2. `docs/OPEN_DECISIONS.md` — what is NOT settled (8 open)
3. `docs/SCHEMA_TRUTH.md` — data shapes, authoritative
4. `docs/CITATION_HARNESS.md` — the rule that can end this product

## Structure
```
CLAUDE.md AGENTS.md          agent instructions
PRD PID TRD                  product, project, technical
BUILD_GUIDE.md               lanes, sprints, gates
DEPLOYMENT.md                Railway services, secrets
DOMAIN_TRUTH.md              Indian legal facts — authority
.ai/                         agent operating modules (00-09)
.claude/                     hooks, slash commands, settings
docs/                        schema, contracts, harness, privacy, OCR, datasets
design/                      design system, screens, Claude Design prompts
sprints/                     agent dispatch blocks
```

## Sequence
Design → S0 scaffold → S1 corpus → **S2 citation gate (hard stop)** → S3 hearing
briefing → S4 drafting → S5 auth+billing → S6 admin → S7 store + beta.

## Before writing any code
Resolve OD-4 (embeddings), OD-6 (sensitive-data provider), OD-7 (OCR engine).
OD-6 and OD-7 both resolved 2 Aug 2026 — sensitive traffic is pseudonymised then
sent to Claude, and OCR ships in v1 on PaddleOCR. **Only OD-1 (court vendor)
remains open, and it blocks nothing.**
