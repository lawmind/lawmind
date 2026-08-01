# SPRINT 0 — FOUNDATION

Two blocks. Each pastes into its own agent session. Disjoint OWN paths. Parallel.
Gate before S1.

**Read first, both lanes:** `PRODUCT_BRIEF.md` → `.ai/README.md` →
`docs/OPEN_DECISIONS.md` → `PRODUCT_DECISIONS.md` → `docs/SCHEMA_TRUTH.md` →
`docs/CITATION_HARNESS.md`.

**Blocked by nothing.** S0 touches no embeddings, court vendor, OCR engine or
model routing.

---

## LCC

**OWN:** `services/api/**`, `packages/db/**`, `drizzle/**`, root config, CI

**BLOCK ON:** nothing.

**TASK**

1. **Monorepo.** pnpm workspaces: `apps/` `services/` `packages/`. TypeScript
   strict. Shared tsconfig and eslint at root. Node version pinned.
2. **Hono API skeleton.** `/health` returns build SHA and database reachability.
   Wire the response envelope **once, centrally** — `{ ok: true, data }` or
   `{ ok: false, error: { code, message } }` — and Zod validation as middleware.
   Every later endpoint inherits both.
3. **Railway project.** Postgres 16 with **pgvector enabled**. Three
   environments — development, staging, production — with separate databases and
   separate secrets. `DEPLOYMENT.md`. Never point staging at production.
4. **Drizzle schema + first migration.** Every table in `docs/SCHEMA_TRUTH.md`,
   **exact shapes, no additions, no inferred columns.**

   The ones a generic scaffold gets wrong — transcribe these deliberately:
   - `judgments.overruled_status` is an **enum** `(none|set_aside|partly_set_aside|doubted)`, **not a bool**, plus `overruled_status_changed_at`, `overruled_paras`, `overruled_note`
   - `citation_checks` carries **three** fields — `verification_state`, `verified_by_source`, `overruled_status_shown` — never one combined enum
   - `audit_log` is **append-only**: revoke UPDATE/DELETE and add a `BEFORE UPDATE OR DELETE` trigger that raises
   - `matter_events.note_visibility` defaults to `private` **in the column**, not in application code
   - `platform_config` with the check constraint making `reason` NOT NULL for `kind = 'kill_switch'`
   - `users.terms_accepted_at` + `users.terms_version` (PD-8 consent)
   - `citation_copies`, `citation_fanouts` (unique on `idempotency_key`), `matter_shares`, `overruled_rechecks`, `cause_list_syncs`, `citation_disputes`, `draft_templates`, `data_requests`
   - **No** `documents.watermark_removed` — retired, PD-8 superseded
5. **CI.** Typecheck, lint, migrations applying against an ephemeral Postgres.

**DONE**
- `railway up` green
- `/health` returns 200 with SHA and DB status
- **All migrations apply clean on an empty database**, and a second run is a no-op
- The `audit_log` trigger provably rejects an UPDATE — write the test
- CI passes on a clean clone

**NEVER**
- Screens, components, client state, or anything in `apps/**`
- `.env*` values (names in `DEPLOYMENT.md`, values in Railway only)
- Inventing a column. If `docs/SCHEMA_TRUTH.md` cannot express something, **stop
  and report it** — that is a finding, not a decision you may take

---

## RCC

**OWN:** `apps/mobile/**`, `apps/admin/**`

**BLOCK ON:** nothing. Build against `docs/API_CONTRACTS.md` with mocks — **never
wait on LCC.**

**TASK**

1. **Expo app.** SDK 52+, TypeScript, expo-router, NativeWind, TanStack Query,
   Zustand, SecureStore for tokens.
2. **`theme/tokens.ts`** transcribed exactly from `design/DESIGN_SYSTEM.md`.
   **No hex literal anywhere else in the codebase** — a hex not in `tokens.ts` is
   a defect. Includes: `paper #FBFAF7`, `paper-desk #F2EFE8`, `card #FFFFFF`,
   `ink #141B2D`, `ink-muted #5A6478`, `ink-faint #8A8578`, `rule #DAD6CB`,
   `hairline #E8E4DA`, `oxblood #5E1A2B` (the only accent), states
   `verified #1F6F4A` / `caution #B4690E` / `danger #9E2A33`, `gilt #C9A227`
   (ornament, two placements only).
3. **`Text.tsx` + `legalText()`.** The six micro-typography rules live here and
   **nowhere else** — hanging punctuation, optical baseline, tabular figures,
   widow control, correct dashes, typographic quotes. A screen that hand-types a
   curly quote is a defect. Minimum **16px** enforced in the wrapper. Devanagari
   face selected by locale, line-height 1.72.
4. **Navigation shell for every screen** in `design/screens/SCREENS.md` (87 rows).
   Shells only — no business logic.
5. **Fonts bundled:** Source Serif 4, Inter, JetBrains Mono, Noto Sans Devanagari,
   Noto Serif Devanagari.
6. **Admin shell.** Next.js 14 App Router, consuming **the same `tokens.ts`**.
   Density may differ; values may not.

**DONE**
- Runs on iOS simulator and Android emulator
- Navigates every shell without a dead route
- **Renders a Hindi string with correct glyphs at 1.72 line-height** — no
  missing-glyph boxes, matras not clipped
- `grep` for a hex literal outside `tokens.ts` returns nothing
- Admin builds and deploys

**NEVER**
- API internals, database, migrations, retrieval, cron
- A second palette or type scale for admin
- Badges on verified citations — **verified is silent** (`docs/CITATION_HARNESS.md`
  §Rendering). Nothing in S0 renders a citation, but do not build the component
  now and regret it in S2

---

## GATE S0

Both lanes green, **observed not reported**:
`railway up` clean · migrations apply on an empty DB · the append-only trigger
rejects an UPDATE · the app builds on both platforms · Hindi renders correctly ·
admin deploys · CI passes.

**Then and only then: S1.**

## Blocked before S1
**OD-4 — embeddings provider.** Corpus ingest cannot start without it. This is the
only decision standing between S0 and S1, and it is testable in an afternoon.
