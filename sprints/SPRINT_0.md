# SPRINT 0 — SCAFFOLD

Four blocks. Each pastes into its own agent session. Disjoint OWN paths. Parallel.
Gate before S1.

---

## AGENT LCC
OWN: `services/api/**`, `packages/db/**`, `drizzle/**`, root config
TASK: Monorepo scaffold (pnpm workspaces). Hono API skeleton with `/health`.
Drizzle against Railway Postgres. pgvector enabled. Every table in
`docs/SCHEMA_TRUTH.md` as a migration — exact shapes, no additions.
DONE: `railway up` green, `/health` 200, all migrations apply clean on empty DB.
NEVER: auth internals, app screens, `.env*` values, admin, OCR service.

---

## AGENT RCC
OWN: `packages/auth/**`, `packages/pii/**`, `services/api/middleware/**`
TASK: better-auth self-hosted, Postmark magic-link transport, JWT + rotating
refresh, Zod validation middleware. Plus the PII pseudonymisation module skeleton
per `docs/PRIVACY_PII.md` — interface and token scheme, detection can stub.
Export both as frozen module interfaces for LCC to wire.
DONE: magic link sends in dev, token round-trips, protected route rejects
unauthenticated, pseudonymise/re-identify round-trips on a fixture.
NEVER: business endpoints, UI, db schema changes.

---

## AGENT CX1
OWN: `apps/mobile/**`
TASK: Expo SDK 52+ TypeScript. NativeWind. Navigation shell for every screen in
`design/SCREENS.md`. TanStack Query + Zustand. SecureStore tokens. Noto Sans
Devanagari + Noto Serif Devanagari bundled. Build against `docs/API_CONTRACTS.md`
with mocks — do not wait on LCC.
DONE: runs on iOS sim and Android emulator, navigates all shells, renders a Hindi
string with correct glyphs at 1.6 line-height.
NEVER: api internals, db, cron, OCR service.

---

## AGENT CX2
OWN: `apps/admin/**`, `services/cron/**`, `services/ocr/**`
TASK: Next.js 14 admin shell on Railway. Cron skeleton, 23:00 IST, logs and
exits. OCR service skeleton — Python/FastAPI, async queue, `/health`, engine
selection stubbed pending OD-7. Sentry + PostHog both surfaces. Pino with
`request_id`.
DONE: admin deploys, cron fires on schedule, OCR service `/health` 200, a test
error reaches Sentry.
NEVER: mobile app, api business logic, auth.

---

## GATE S0
All four green. `railway up` clean. Migrations apply. Mobile builds both
platforms. Cron fires. OCR service responds. Sentry receives.
Then and only then: S1.

## Blocked before S1
OD-4 (embeddings provider) must be resolved — corpus ingest cannot start without
it.
