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
OD-6 resolved 2 Aug 2026 — pseudonymise, then Claude. Uploads ship once the
countersigned DPA exists. One document per call, always.
`docs/PRIVACY_PII.md`.

## Stack
Expo · Hono on Railway · Railway Postgres + pgvector · Drizzle · OCR service ·
better-auth · Resend · R2 · OpenRouter · Sentry · PostHog.
Not used: Neon, Vercel, Qdrant, Clerk, Supabase.

## Agent lanes — TWO, disjoint. Never write outside your lane
Restructured 1 Aug 2026 from four lanes to two.

- **LCC — Server.** Database, migrations, API, corpus ingest, retrieval, the
  verification pipeline, cron, the OCR service, admin endpoints
- **RCC — Client.** The Expo app, the admin web interface, auth integration, PII
  pseudonymisation at the client boundary

With two lanes there is **one seam instead of three**, so `docs/API_CONTRACTS.md`
matters more, not less. **It is frozen at the start of each sprint** — a
mid-sprint change requires telling the other lane explicitly, because there is no
third lane to absorb the mismatch.

Shared files (`packages/shared`, `docs/API_CONTRACTS.md`) are read-only except to
the owner named in `BUILD_GUIDE.md`.
