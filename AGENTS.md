# LAWMIND — AGENTS.md

Codex entry point. Mirrors `CLAUDE.md`; that file is authoritative on difference.

## Read first, every session
1. `.ai/README.md`
2. `docs/OPEN_DECISIONS.md`
3. `docs/SCHEMA_TRUTH.md`
4. `docs/CITATION_HARNESS.md`

## Working method
Global `~/.claude/CLAUDE.md` governs: DONE/INTENT artifacts, the loop, evidence
discipline, the 3-failure hard bound, verify-by-observation. Follow it literally.

## The one rule
No citation reaches a user without verification. Five states. Never show
unverified as confirmed. Never silently drop one. `docs/CITATION_HARNESS.md`.

## Sensitive data
Uploaded documents are sensitive-class: pseudonymise before any model call.
OD-6 blocks upload features until the provider question resolves.
`docs/PRIVACY_PII.md`.

## Stack
Expo · Hono on Railway · Railway Postgres + pgvector · Drizzle · OCR service ·
better-auth · Postmark · R2 · OpenRouter · Sentry · PostHog.
Not used: Neon, Vercel, Qdrant, Clerk, Supabase.

## Agent lanes (disjoint — never write outside your lane)
- **LCC** — API, services, database, migrations
- **RCC** — auth, security, middleware, validation
- **CX1** — Expo app: screens, navigation, state
- **CX2** — admin web, cron, OCR service, monitoring

Shared files (`packages/shared`, `docs/API_CONTRACTS.md`) are read-only except to
the owner named in `BUILD_GUIDE.md`.
