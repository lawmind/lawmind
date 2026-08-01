# SPRINT 0 — READY

> ⚠️ **SUPERSEDED for lane structure.** This file was written for **four** lanes
> (LCC/RCC/CX1/CX2). The build is now **two** lanes — LCC Server, RCC Client —
> and the dispatch files are `sprints/SPRINT_0.md` … `SPRINT_7.md`.
>
> **Paste from `sprints/SPRINT_0.md`, not from here.** The "what is settled" and
> "blocked" sections below remain accurate and are still worth reading; only the
> four per-lane blocks are obsolete.

Documentation is closed as of **1 August 2026**. Everything below is settled,
blocked, or explicitly a lane's first move.

**Read before anything else, every lane, every session:**
`PRODUCT_BRIEF.md` → `.ai/README.md` → `docs/OPEN_DECISIONS.md` →
`PRODUCT_DECISIONS.md` → `docs/SCHEMA_TRUTH.md` → `docs/CITATION_HARNESS.md`.

The `SessionStart` hook prints this order; the `UserPromptSubmit` hook re-injects
the non-negotiable core every turn. Both are pointers, not replacements.

---

## What is settled

**Product.** Four features in priority order — search with verified citations ·
the 24-hour briefing (the wedge) · drafting in English and Hindi · the matter
workspace. `PRODUCT_BRIEF.md` is the north star: if what you are about to build
does not serve one of the four, stop and ask.

**PD-1…PD-12 are settled** and must not be silently reopened —
`PRODUCT_DECISIONS.md`. Auth is OTP to any number with enrolment never gating ·
sharing is per matter · notes private by default · four alert triggers batched
into the evening briefing · paragraph-level editing with citations locked · the AI
mark clears only on explicit removal · five search filters.

**Design.** Paper ground · ink actions · **oxblood `#5E1A2B` the only accent**, at
most twice per screen · Source Serif 4 for legal content · Inter for chrome ·
JetBrains Mono for records · **gilt at two ornamental placements, one mark maximum
per screen** · registry-stamp badge, five states derived from three fields · glass
on floating chrome only, never behind content · 2px radii, no card shadows · body
minimum 16px. `design/DESIGN_SYSTEM.md`, with 87 screens in
`design/screens/SCREENS.md` and golden renders **30–63** in
`design/screens/renders/`.

**The citation model.** Three independent fields — `verification_state` ·
`verified_by_source` · `overruled_status` — from which the five badge states are
derived, never stored. A judgment can be verified **and** overruled.
`overruled_status` is read live at render and **never cached**.

**Zero-threshold metrics.** Hallucination rate · silent-drop rate ·
stale-overruled rate · overruled leakage · false-verified rate. Any one above zero
blocks the gate.

**Infrastructure.** Expo · Hono · Railway Postgres + pgvector · Drizzle ·
better-auth · Postmark · R2 · OpenRouter. **Not** Neon, Vercel, Qdrant, Clerk or
Supabase. Ask before adding any vendor.

**Repos.** `lawmind/lawmind` (private) — contracts, design, mobile, api.
`lawmind/lawmind-admin` (private) — admin desk and marketing site. Contracts are
**not** copied into the admin repo; it links to them.

---

## Blocked — and what each blocks

| | Blocks | What unblocks it |
|---|---|---|
| **OD-4** · Embeddings provider | **S1 corpus** | Choose BGE-M3 self-hosted, Jina, or Google text-embedding-005. Constraint: minimal vendors, one bill |
| **OD-1** · Court monitoring vendor | **S3 briefing** | Trial Vakeel360 vs eCourtsIndia against 20 real CNRs from the retained advocate's live matters. Decide on **freshness, not price** |
| **OD-7** · OCR engine | **Scanned intake** | Bake-off: PaddleOCR vs Tesseract against 50 real scanned orders. Measure **field-extraction accuracy, not character accuracy** |
| **OD-6** · Sensitive-class provider | **Any upload feature** | **Design half is closed** — routing is now keyed by data class. What remains is commercial: a countersigned DPA with zero-retention and no-training terms. See below |
| **OD-2** · DPDP data residency | **Public launch, not build** | Counsel's written view on Singapore residency, plus a costed migration path before May 2027 |
| **OD-3** · Play alternative billing | **Finalising billing in S5** | Confirm post-CCI India terms |
| **OD-5** · Hindi launch scope | **S4 scope only** | Hindi is drawn at full parity — designed ahead of the decision. Decide whether S4 ships search **and** drafting, or search first |
| **OD-8** · Unaudited nisaar datasets | **Nothing in S0–S2** | Audit before any training use. Assume unusable until then |

**S0 is blocked by none of these.** Scaffolding, health checks and CI do not touch
embeddings, court vendors, OCR or model routing.

### OD-6 — how far the design got
The routing surface was redrawn **keyed by data class, not feature**
(`design/screens/renders/57-admin-routing@2x.png`), and the mechanism is complete:
scan every outbound request → **any hit means sensitive, ambiguity resolves to
sensitive** → sensitive routes only to a provider with terms on file, **with no
fallback to a cheaper one and no founder override** → class and provider written
to the audit ledger for seven years.

**What is still the founder's:** which provider actually handles sensitive-class
calls, with a **countersigned DPA on file** — zero-retention, no training on
inputs, reviewed sub-processor list — and a region defensible under OD-2. The
render depicts a signed DPA; that is mock state, not a signature. Until it exists,
"a provider with terms on file" is an empty set and **no feature sends uploaded
document content to any model.**

---

## Lane preconditions and first three moves

Lane boundaries are in `BUILD_GUIDE.md`. Write only inside your lane.

### LCC — `services/api/**`, `packages/db/**`, migrations
**Needs first:** `docs/SCHEMA_TRUTH.md` (authority on every shape — never infer a
column) · `docs/API_CONTRACTS.md` · `docs/CITATION_HARNESS.md`.

1. **pnpm workspace scaffold** — `apps/`, `services/`, `packages/`; TypeScript
   strict; shared tsconfig and eslint. No app code.
2. **Hono API skeleton with `/health`** returning build SHA and DB reachability,
   plus the `{ ok, data } | { ok, error }` envelope and Zod validation wired once.
3. **Drizzle schema + first migration** transcribed from `docs/SCHEMA_TRUTH.md`.
   Include from the start: `overruled_status` (not a bool), the three citation
   fields, `audit_log` as append-only with the update/delete trigger,
   `matter_shares`, `matter_events.note_visibility` defaulting to `private`, and
   `citation_copies`.

**Do not** invent a column. If `docs/SCHEMA_TRUTH.md` cannot express something, that is a
finding to report, not a decision to make.

### RCC — auth, middleware, validation, security, PII
**Needs first:** `docs/PRIVACY_PII.md` · `TRD.md` §Auth · **OD-6 status above**.

1. **better-auth wired** with rotating refresh tokens, 30-day sliding window,
   exported as an importable module — that import boundary freezes once written.
2. **Enrolment never gates.** Capture the number, queue it, show pending. Prove it
   with a test asserting a rejected enrolment still has full access (PD-2).
3. **Pseudonymisation module** — detect, tokenise stably per document, store the
   map locally encrypted, re-identify client-side. **Never claim complete
   removal**; coverage is ~80% and is disclosed.

**Blocked:** do not wire any sensitive-class model call until OD-6's commercial
half closes.

### CX1 — `apps/mobile/**`
**Needs first:** `design/DESIGN_SYSTEM.md` · `design/screens/SCREENS.md` ·
renders **30–63** · `design/screens/IMPLEMENTATION.md` §Badge and §Motion.

1. **Expo app + expo-router + `theme/tokens.ts`** transcribed exactly. **No hex
   literal anywhere else in the codebase** — a hex not in `tokens.ts` is a defect.
2. **`Text.tsx` and the `legalText()` formatter** — the six micro-typography rules
   live here and nowhere else. A screen that hand-types a curly quote is a defect.
   Minimum 16px enforced in the wrapper; Devanagari face selected by locale.
3. **Primitives + tab navigator** — Button, Card, Badge (the registry stamp, five
   states, built to §Badge exactly), Input, Sheet, Toast, SkeletonCard,
   EmptyState. Ship a gallery screen in both languages and compare against
   `design/screens/renders/30-system-refined@2x.png`.

Build against `docs/API_CONTRACTS.md` with mocks. Never wait on LCC.

### CX2 — `apps/admin/**`, `services/cron/**`, `services/ocr/**`
**Needs first:** `docs/ADMIN_SURFACE.md` (17 sections, which have endpoints) ·
`design/screens/LawMind Admin.dc.html` (live, clickable) · `DEPLOYMENT.md` cron
order.

1. **Next.js admin shell** consuming the **same `tokens.ts`** as the app. Density
   may differ; values may not. Build from the admin renders' **layout**, not their
   colour — admin still runs the v2 palette and its alignment pass has not started
   (PD-11).
2. **`cron` service with the ordering enforced** — 22:15 cause list sync → 22:30
   overruled re-check → 23:00 hearing sweep. The ordering is a requirement: the
   sweep needs confirmed dates, and briefings carry authorities.
3. **`audit_log` write path** proven before any privileged control ships. Same
   transaction as the action; if the ledger write fails, the action does not
   happen. Platform controls do not ship before this.

**Do not build a second citation fan-out.** `applyOverruledChange` is one
operation with two triggers.

---

## Known-stale, flagged not fixed

Carried into S0 deliberately, because they are design deliverables:

- **`design/screens/IMPLEMENTATION.md` §Gilt** still says three placements and a budget of two.
  Render 55 supersedes it: two placements, one mark maximum. Follow
  `design/DESIGN_SYSTEM.md`.
- **§10a render index** stops at 43 and does not list renders 44–63 — twenty
  authoritative renders, including every screen that closed a NOT YET DESIGNED
  item. Use `design/screens/SCREENS.md` for the mapping.
- **§9.1 and §9.2** still describe the retired badge variant D and the retired
  dark briefing takeover.
- **§9b numbers decisions 1–15** against `PRODUCT_DECISIONS.md`'s PD-1…PD-12, and
  its item 8 states one immediate-push exception where **PD-6 defines two**.
  PD-6 governs.
- **One screen is `NOT YET DESIGNED`** — row 3, *magic link sent* — and is
  probably obsolete under PD-1 rather than pending.

---

## Gate S2 is the hard stop

If citation verification is not clean, nothing downstream matters. Do not proceed
to keep momentum. `docs/CITATION_HARNESS.md` is binding, and the advocate on
retainer reviews 20 outputs per gate for the failure the harness cannot see —
citations that resolve, are real, and are simply wrong for the question.
