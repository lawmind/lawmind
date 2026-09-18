# LAWMIND — AGENTS.md

Codex entry point. Mirrors `CLAUDE.md`; that file is authoritative on difference.

## Read first, every session
1. `docs/CURRENT_STATE.md` — live pointer: gate, current capability registry, stops, founder actions
2. `docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md` — current roadmap (Amendment A1)
3. `docs/roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md` — current execution prompts
4. `docs/OPEN_DECISIONS.md`
5. `docs/SCHEMA_TRUTH.md`
6. `docs/CITATION_HARNESS.md`
7. `.ai/README.md`

`docs/CURRENT_PLAN.md` is a historical journal, not the task queue. Older
roadmaps/prompts and the `BUILD_GUIDE.md` S0–S7 plan are historical.
`pnpm authority:check` guards this.

## What is being built now
Evidence-first mobile legal research for practising Indian advocates. Native iOS +
Android only. Loop: Search → Reader → Source/Evidence → Save → Matter. Scope per
platform = the current capability registry named in `docs/CURRENT_STATE.md`.
Advocate desktop/web: do not build. The promotional website is temporary and
noncore; only its compliance URLs are release contracts. Drafting, briefings,
monitoring, uploads and Hindi generation are deferred/disabled (`PRODUCT_BRIEF.md`
is long-term vision).

## Working method
Global `~/.claude/CLAUDE.md` governs: DONE/INTENT artifacts, the loop, evidence
discipline, the 3-failure hard bound, verify-by-observation. Follow it literally.

## The one rule
No citation reaches a user without verification. Never show unverified as
confirmed. Never silently drop one. `docs/CITATION_HARNESS.md`.

## Sensitive data
Uploaded documents are sensitive-class: pseudonymise before any model call.
A countersigned DPA is required before uploads or sensitive model routing
(roadmap v7.4 §12.5). One document per call, always. `docs/PRIVACY_PII.md`.

## Stack
Expo · Hono on Railway · Railway Postgres + pgvector · Drizzle · OCR service ·
better-auth · Resend · R2 · OpenRouter · Sentry · PostHog.
Not used: Neon, Vercel, Qdrant, Clerk, Supabase.

## Agents — roadmap v7.4 §2
- **SHIP** (ACTIVE): product, client (`apps/mobile/**`), server (`services/api/**`,
  `services/cron/**`), ops, release, capability registry, contract change control.
- **DATA** (CONTINUOUS): corpus/source (`services/ingest/**`), legal truth,
  retrieval (`services/embed/**`, relevant `services/harness/**`).
- **RED** (FROZEN unless invoked): fresh independent audit; never implements.

LCC, RCC, NEW1, NEW2, NEW3, FIFTH and AUDIT-RO are legacy names: their records are
immutable history, and no new work binds to them. Contract changes: CCR → freeze
→ implement → separate acceptance (`docs/product/CONTRACT_CHANGE_CONTROL.md`).
