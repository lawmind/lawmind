# SPRINT 0 — FOUNDATION

Two agents, working simultaneously. Disjoint OWN paths. Paste one block per
session. **Gate before S1.**

**Read first, both lanes:** `PRODUCT_BRIEF.md` → `.ai/README.md` →
`docs/OPEN_DECISIONS.md` → `PRODUCT_DECISIONS.md` → `docs/SCHEMA_TRUTH.md` →
`docs/CITATION_HARNESS.md`.

**Blocked by nothing.** S0 touches no embeddings, court vendor, OCR engine or
model routing. **All of those closed 2 Aug 2026 — nothing blocks S0 or S1.**

**Ponytail is installed and runs at `full`.** The ladder applies to every task
below: does this need to exist → already here → stdlib → native → installed dep →
one line → only then the minimum that works. Run **`/ponytail-review` before the
gate**, both lanes. The citation pipeline is exempt from simplification.

---

## ⚠️ Migration scope — decision applied

The first migration creates **the tables S0–S2 need, not all 24.**
`docs/SCHEMA_TRUTH.md` stays the complete authority; the migration catches up
per sprint.

**Create now (13):** `users` · `judgments` · `judgment_chunks` ·
`statute_mappings` · `matters` · `matter_events` · `briefings` · `documents` ·
`searches` · `llm_calls` · `citation_checks` · `verification_cache` · `audit_log`

**Defer (10):** `matter_shares`, `cause_list_syncs`, `citation_copies`,
`citation_fanouts` → S3 · `ocr_jobs`, `pii_entities` → S4 — **OD-7 and OD-6 are
now resolved, so these are simply not needed until S4** · `draft_templates` → S4 · `platform_config`, `citation_disputes`,
`data_requests` → S6.

`overruled_rechecks` was **cut entirely** — a job log with one consumer. The job
stays; the table does not. 23 tables total, not 24.

**Why:** creating schema for a feature that cannot ship — OCR is blocked on two
open decisions with no timeline — is rung 1 of the ladder. `audit_log` is created
now despite being an S6 surface, because nothing privileged may ship without it
and retrofitting an append-only trigger later is worse.

**To override:** say "all 24 in S0" and LCC creates the full set in one migration.

---

# AGENT LCC — SERVER

**OWN:** `services/api/**` · `packages/db/**` · `drizzle/**` · root config · CI
**BLOCK ON:** nothing.

## 1 · Monorepo skeleton
- [ ] `pnpm init`, pnpm workspaces: `apps/` `services/` `packages/`
- [ ] Root `tsconfig.json`, strict mode on. Packages extend it, never redefine it
- [ ] Root eslint + prettier, one config, no per-package overrides
- [ ] `.nvmrc` / `engines` pinning the Node version
- [ ] `.gitignore` already exists — extend, do not replace
- **Done:** `pnpm -r typecheck` runs clean on an empty tree

## 2 · Railway project
- [ ] Create the project. **Record the generated name in `DEPLOYMENT.md`** — there
      is a blank line waiting for it
- [ ] Postgres 16, **`CREATE EXTENSION vector`** verified by querying
      `pg_extension`, not by assuming
- [ ] Three environments: development · staging · production. **Separate
      databases, separate secrets. Never point staging at production**
- [ ] Env var *names* into `DEPLOYMENT.md`. **Values only in Railway**
- **Done:** `railway up` green; `SELECT extname FROM pg_extension` includes `vector`

## 3 · Drizzle + the first migration
- [ ] Drizzle Kit wired against `DATABASE_URL`
- [ ] Transcribe the **13 tables above** from `docs/SCHEMA_TRUTH.md`. **Exact
      shapes. No additions. No inferred columns**

**The ones a generic scaffold gets wrong — transcribe deliberately:**
- [ ] `judgments.overruled_status` is an **enum** `(none|set_aside|partly_set_aside|doubted)`, **not a bool** — plus `overruled_status_changed_at`, `overruled_paras int[]`, `overruled_note`
- [ ] `citation_checks` carries **three** fields — `verification_state`, `verified_by_source`, `overruled_status_shown` — never one combined enum
- [ ] `verified_by_source` includes **`public_x2`** (tier 2 writes it only when both public sources agree)
- [ ] `users.terms_accepted_at` + `users.terms_version` — PD-8 consent
- [ ] **No `documents.watermark_removed`** — retired with PD-8
- [ ] `judgment_chunks.embedding vector(1024)`, ivfflat on `vector_cosine_ops`; gin on `to_tsvector(full_text)`
- [ ] `audit_log` **append-only**: revoke UPDATE/DELETE **and** a `BEFORE UPDATE OR DELETE` trigger that raises
- **Done:** migrations apply clean on an **empty** database; a second run is a
  no-op; `\d+` output matches `docs/SCHEMA_TRUTH.md` field by field

## 4 · The append-only proof
- [ ] A test that `UPDATE audit_log …` **raises**
- [ ] A test that `DELETE FROM audit_log …` **raises**
- **Done:** both green. This is a gate item, not a nice-to-have — every privileged
  action in S6 depends on it and retrofitting it after data exists is painful

## 5 · Hono API skeleton
- [ ] Hono app, TypeScript
- [ ] **The response envelope, wired once, centrally**:
      `{ ok: true, data }` | `{ ok: false, error: { code, message } }`.
      Every later endpoint inherits it — do not re-implement per route
- [ ] Zod validation as middleware, one place
- [ ] Pino with `request_id` on every log line
- [ ] `GET /health` → 200 with build SHA + database reachability
- **Done:** `/health` returns 200 with a real SHA and a real DB check; a
  deliberately bad request returns the `{ ok: false }` shape with a code

## 6 · CI
- [ ] Typecheck · lint · migrations applying against an ephemeral Postgres
- [ ] Runs on a clean clone
- **Done:** green on a fresh checkout, not just locally

## 7 · Before the gate
- [ ] `/ponytail-review`
- [ ] Every env var name documented; no value committed

**NEVER**
- Screens, components, client state, anything under `apps/**`
- `.env*` values
- **Inventing a column.** If `docs/SCHEMA_TRUTH.md` cannot express something,
  **stop and report it** — that is a finding, not a decision you may take
- Creating a deferred table "while you're in there"

---

# AGENT RCC — CLIENT

**OWN:** `apps/mobile/**` · `apps/admin/**`
**BLOCK ON:** nothing. Mock every endpoint from `docs/API_CONTRACTS.md`.
**Never wait on LCC.**

## 1 · Expo app
- [ ] Expo SDK 52+, TypeScript, expo-router
- [ ] NativeWind, TanStack Query, Zustand, SecureStore
- [ ] Runs on iOS simulator **and** Android emulator before anything else is added
- **Done:** blank app boots on both

## 2 · `theme/tokens.ts` — first, before any component
Transcribed exactly from `design/DESIGN_SYSTEM.md`:
- [ ] `paper #FBFAF7` · `paper-desk #F2EFE8` · `card #FFFFFF`
- [ ] `ink #141B2D` · `ink-muted #5A6478` · `ink-faint #8A8578`
- [ ] `rule #DAD6CB` · `hairline #E8E4DA`
- [ ] `oxblood #5E1A2B` — **the only accent**, max twice per screen
- [ ] States: `verified #1F6F4A` · `caution #B4690E` (text `#8A5109`, wash `#FBF0DF`) · `danger #9E2A33`
- [ ] `gilt #C9A227` — ornament, **two placements only**, one mark max per screen
- [ ] Radii **2px** (3px max), sheets 12px top · buttons **52px tall**
- [ ] Type scale, all ten rows
- **Done:** `grep` for a hex literal outside `tokens.ts` returns **nothing**.
  A hex not in `tokens.ts` is a defect

## 3 · `Text.tsx` + `legalText()`
**The six micro-typography rules live here and nowhere else.**
- [ ] Variants: `ui` · `uiStrong` · `legal` (Source Serif 4) · `record` (mono) · `eyebrow`
- [ ] **Minimum 16px enforced in the wrapper**, not per screen
- [ ] Devanagari face by locale, line-height **1.72**; Latin drops to 15px, +0.5px baseline, +0.004em tracking when mixed on one line
- [ ] Hindi eyebrows **drop** letterspaced-uppercase — Devanagari has no case and letterspacing breaks conjuncts
- [ ] `legalText()` formatter: straight→curly quotes · hyphen→en dash in citation ranges · non-breaking spaces binding section numbers and the last two words · hanging punctuation on any string starting with a quote
- [ ] Tabular figures on dates, times, citation numbers
- **Done:** a judgment string with a leading quote renders with a **true left
  edge**; a date column does not jitter. **A screen that hand-types a curly quote
  is a defect**

## 4 · Fonts
- [ ] Source Serif 4 · Inter · JetBrains Mono · Noto Sans Devanagari · Noto Serif Devanagari, bundled via expo-font
- **Done:** a Hindi string renders **with no missing-glyph boxes and no clipped
  matras** at 1.72

## 5 · Primitives
- [ ] `Button` (52px, 2px radius, oxblood primary / ink-bordered secondary / rule-bordered tertiary)
- [ ] `Card` — **opaque, no shadow**, 1px `rule` edge
- [ ] `Input` · `Sheet` (12px top corners) · `Toast` (the one ink glass) · `SkeletonCard` · `EmptyState` · `SectionRule`
- [ ] `Switch` and `SettingsRow` — fixed-width control column so every control terminates on one right-hand axis
- [ ] Every pressable: scale `0.965`, −3% brightness, `.light` haptic on press-in
- **Done:** a gallery screen renders every primitive in **both languages**,
  compared against `design/screens/renders/30-system-refined@2x.png`

## 6 · Navigation shells
- [ ] Tab bar, 4 tabs, active = oxblood 2px top rule + ink filled icon, 30px bottom inset
- [ ] A route for **every** screen in `design/screens/SCREENS.md` (87 rows). Shells only, no business logic
- [ ] Screens marked `NOT YET DESIGNED` get a **stub that says so** — do not improvise a design
- **Done:** every route reachable, **no dead route**

## 7 · Glass — chrome only
- [ ] `rgba(251,250,247,.94)` + `blur(16px)`, sheets `blur(24px)`
- [ ] 1px hairline on the **leading edge only**, `rgba(201,162,39,.28)`
- [ ] Applied to tab bar, nav bar, sheets, toasts — **never behind content**
- **Done:** no translucency behind judgment text, a draft, a citation or a card

## 8 · Admin shell
- [ ] Next.js 14 App Router, deploys on Railway
- [ ] **Imports the same `tokens.ts`.** Density may differ; values may not
- **Done:** admin deploys, zero admin-only hex

## 9 · Before the gate
- [ ] `/ponytail-review`
- [ ] Sunlight check: renders at contrast 0.5 / brightness 1.3

**NEVER**
- API internals, database, migrations, retrieval, cron
- A second palette or type scale for admin
- **A badge on a verified citation.** Verified is silent — only `unverified` and
  `overruled` render. Nothing in S0 renders a citation; do not build the
  component now and regret it in S2
- Improvising a screen marked `NOT YET DESIGNED`

---

## GATE S0 — observed, not reported

| # | Check | Lane |
|---|---|---|
| 1 | `railway up` green | LCC |
| 2 | `vector` extension present in `pg_extension` | LCC |
| 3 | Migrations apply clean on an empty DB; re-run is a no-op | LCC |
| 4 | `UPDATE`/`DELETE` on `audit_log` both raise | LCC |
| 5 | `/health` 200 with real SHA + DB status | LCC |
| 6 | Bad request returns `{ ok: false, error }` | LCC |
| 7 | CI green on a clean clone | LCC |
| 8 | App builds on iOS **and** Android | RCC |
| 9 | Hindi renders correctly at 1.72, no clipped matras | RCC |
| 10 | No hex outside `tokens.ts` | RCC |
| 11 | Every route reachable, no dead route | RCC |
| 12 | Admin deploys on shared tokens | RCC |
| 13 | `/ponytail-review` run, both lanes | both |

**All thirteen, verified by running them. Then and only then: S1.**

## Before S1
**Nothing.** OD-4 closed 2 Aug 2026: corpus from AWS Open Data, embeddings from
self-hosted BGE-M3. S1 can start the moment Gate S0 passes.

Still worth doing early in S1, because it is cheap and decides chunking: embed 200
judgments, run the 30 harness queries — **including the 5 Hindi ones, which is
what will actually expose a problem** — and score precision@5 and p95 latency
before committing to the full run.
