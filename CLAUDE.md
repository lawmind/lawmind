# LAWMIND — PROJECT CLAUDE.md

Inherits the global `~/.claude/CLAUDE.md` verbatim. Nothing in the global file is
overridden. This file ADDS project context, the extra tool layer, and the
mandatory reading set.

## 0. READ BEFORE ANY WORK — non-negotiable

Session start, in this order, before Section 2 of the global file:

1. **`docs/CURRENT_STATE.md`** → the **live** pointer: current gate, current
   capability registry, active agents, active stops, founder actions. **Read
   first, every session.**
2. **`docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md`** → current roadmap (with
   Amendment A1). Hashes in `docs/roadmaps/LAWMIND_V7_4_AUTHORITY_MANIFEST.json`
3. **`docs/roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md`** → current execution prompts
4. `docs/OPEN_DECISIONS.md` → what is NOT settled; never silently decide one
5. **`PRODUCT_DECISIONS.md`** → PD-1…PD-14, **settled**. Do not silently reopen
   one. Reasoning is recorded because the reasoning is what keeps the next
   decision consistent
6. `docs/SCHEMA_TRUTH.md` → the only authority on data shapes
7. `docs/CITATION_HARNESS.md` → the rule that can end this product
8. `.ai/README.md` → the `.ai/` module set; `PRODUCT_BRIEF.md` → long-term
   vision, **not** current v1 scope

`docs/CURRENT_PLAN.md` is a **historical operational journal**, not the task
queue. Older roadmaps (v7.2, v7.1, v5), prompts v2/v3 and the S0–S7 plan in
`BUILD_GUIDE.md` are historical. `pnpm authority:check` fails if a bootstrap file
claims otherwise.

More than 20 turns deep, or context was compacted → re-read items 1, 4, 6 and 7 before your
next edit. The `UserPromptSubmit` hook re-injects the core each turn; that core is
a pointer, not a replacement for the files.

`docs/OPEN_DECISIONS.md` and `PRODUCT_DECISIONS.md` are opposites and both binding: the
first is what nobody may decide alone, the second is what nobody may re-decide.

## 1. WHAT LAWMIND IS

**Current v1: evidence-first mobile legal research for practising Indian
advocates.** Criminal and civil litigation. **Native iOS + Android (Expo) only.
Admin is a separate service; web is admin only.** Current v1 loop:

`Search → Reader → Source/Evidence → Save → Matter`

What v1 ships is exactly what the **current capability registry** (named in
`docs/CURRENT_STATE.md`; R17 at 18 Sep 2026) enables per platform.

**Website (founder, 18 Sep 2026):** `lawmind.co` is a temporary promotional
surface (repo `lawmind/lawmind-site`, outside this one), not the product, not an
advocate web app, and not an architecture authority. It is rebuilt after the app
candidate is mature. Only its compliance URLs (privacy, support/contact,
external account deletion, terms if used) are stable release contracts.
`ADVOCATE_DESKTOP_WEB = DO_NOT_BUILD`.

**PD-15 (11 Aug 2026, desktop research workspace) is REVERSED — 12 Aug 2026,
founder direction.** This is a phone app; there is no planned desktop surface
and no web login for advocates, only for the admin panel. The reversal was
built for exactly this: the desktop layout was a width breakpoint inside
`apps/mobile`, off below 900px on every phone, and is now frozen rather than
extended. `ResearchWorkspace.tsx`, `MatterWorkspace.tsx`, `DraftWorkspace.tsx`
and the Cmd/Ctrl+K web listener in `app/_layout.tsx` are left in place —
inert, not deleted, per the founder's explicit call — but nothing further is
built against them. See `PRODUCT_DECISIONS.md` PD-15 for the full history.

**Long-term vision, not current v1 scope.** The list below is the product
vision from `PRODUCT_BRIEF.md` (2 Aug 2026). Drafting, hearing briefings, the
daily loop, monitoring, uploads/OCR and Hindi generation are **deferred or
disabled** capabilities under roadmap v7.4 §4.3 and the current capability
registry. They create no current implementation task. Their specifications are
kept, not deleted.

Vision — the four core features, historical priority order:

1. Court decision search with server-verified citations
2. 24-hour hearing briefings (the wedge — no Indian competitor has it)
3. Document drafting, English and Hindi
4. Matter workspace (the retention moat)

## 2. THE ONE RULE ABOVE ALL OTHERS

**No citation reaches a user without verification.** An advocate who files a fake
case is humiliated in open court and never returns. One occurrence ends the
company.

The model never emits a citation from memory. It references only judgment IDs
handed to it in retrieved context. Verification is three-tier. A citation that no
tier confirms is shown in an explicit `unverified` state — **never silently
dropped, never shown as confirmed.**

Full mechanism: `docs/CITATION_HARNESS.md`. Spec, not guidance.

## 3. ADDITIONAL TOOL LAYER (adds to global Section 4 — does not replace it)

| Operation                                 | Use                                  | Notes                                                                              |
| ----------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Symbol-level navigation, rename/reference | AFT + tree-sitter                    | Faster than graph for single-symbol questions                                      |
| Pre-invocation context compression        | Context Mode                         | Before every model invocation, per `.ai/07-context.md`                             |
| Episodic memory                           | `memory_recall()` / `memory_store()` | Interface from global §2. Backed by agentmemory (:3111). Map in `.ai/06-memory.md` |
| Structural / architecture queries         | codebase-memory-mcp                  | Unchanged from global                                                              |
| Semantic snapshot                         | Understand-Anything                  | Session start only, once                                                           |
| Shell compression                         | RTK                                  | **Homebrew only** — never cargo, crates.io name collision                          |
| Node script running                       | nub                                  | Universal runner                                                                   |
| Dedup / fallback                          | sqz                                  | When RTK unavailable                                                               |

Retrieval order: `.ai/03-retrieval-pipeline.md`.

## 4. STACK — do not substitute without asking

**Technology, which is current and verified:** Expo (React Native, TypeScript) ·
Hono API · Postgres 16 + pgvector · Drizzle ORM · scheduled jobs (`services/cron`) ·
OCR service (Python/FastAPI) · better-auth self-hosted · Resend · Cloudflare R2 ·
OpenRouter · Sentry · PostHog · Expo push.

Explicitly NOT used: Neon, Vercel, Qdrant, Clerk, Supabase, Telegram bot.

**Hosting provider, which is a different question and is currently OPEN.** The
list above used to name one provider three times — as the host of the API, of
Postgres and of cron. By 18 Sep 2026 that was a statement about a deployment
that no longer exists:

```text
RAILWAY_PRODUCTION       = HISTORICAL / RETIRED
GATE_C_DIGITALOCEAN      = HISTORICAL / DESTROYED (verified 18 Sep 2026)
PERSISTENT_BETA_PROVIDER = UNDECIDED
PRODUCTION_PROVIDER      = UNDECIDED
CURRENT_PRODUCTION       = NONE
CURRENT_PERSISTENT_BETA  = NONE
```

SHIP S4-R0 compares providers and prices them; the founder then decides. A
bootstrap file that names one provider as "the stack" pre-answers that
comparison for every agent who reads it, which is exactly the bias S4-R0 exists
to avoid. So name the technology here and read the provider from
`docs/CURRENT_STATE.md` §11. **None of this deletes Railway history** —
`DEPLOYMENT.md` keeps the runbook, and the migration records stand.

## 5. LLM ROUTING — by data sensitivity, not task difficulty

| Data class | Contents                                                     | Routing                                                                                                                                        |
| ---------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Public     | Judgments, statutes — already published                      | Cheapest capable. DeepSeek V4 Flash.                                                                                                           |
| Sensitive  | Uploaded documents, matter notes, party names, client detail | **Pseudonymise first, then Claude** (written data-processing terms). Ambiguity resolves to sensitive, never public. **ONE DOCUMENT PER CALL.** |
| Never sent | A full client file with no legal reason to leave the device  | Stays local                                                                                                                                    |

Within public class, route by task: search → DeepSeek V4 Flash · summarise/extract
→ Claude Haiku 4.5 · drafting/briefings → Claude Sonnet 4.6.

Every call rows into `llm_calls` with `data_class` and `pseudonymised`.

## 6. PROJECT HARD RULES (add to global Section 7)

## 6a. FOUNDER DATA AUTHORIZATION — CURRENT PROJECT STATE

**Founder-declared and settled.** LawMind has valid agreements/permissions
authorizing LawMind to use these named data sources:

- **BharatLaw**
- **Supreme AI**
- **eCourts India**

The founder has confirmed that these authorizations remain valid through
**13 November 2029**.

These three sources are therefore **AUTHORIZED** for the LawMind data program.
Do not treat their authorization as an OPEN_DECISION, return them to
`FOUNDER_QUEUE.md` as unresolved licensing blockers, or stop technical work
waiting for another confirmation.

The authorization covers the intended LawMind data-processing activities
permitted by the applicable agreements, including ingestion, storage,
normalization, OCR, metadata extraction, citation extraction/resolution,
indexing, retrieval, evaluation, enrichment, embeddings, training, fine-tuning,
distillation, and related processing.

This supersedes earlier repository statements that classified any of these three
named sources as unauthorized, permanently excluded, or unresolved.

This does **not** authorize unrelated third-party sources. New sources not named
above remain subject to the normal provenance/authorization process.

Preserve source provenance and enforce source-specific operational constraints.
Do not invent contract terms or silently broaden one source's permissions to
another.

**Naming rule:** `Supreme AI` and `Supreme Today` are different sources. Older
`Supreme Today` entries are historical unless separately marked current.

### eCourts — founder decision, 29 August 2026 (made now, not a historical record)

**The founder settled the open eCourts authorization/founder-input question on
29 August 2026.** This is a decision taken on that date, not a restatement of an
earlier one. It closes the eCourts half of `FOUNDER_QUEUE.md` FQ-LCC-R10-1 and
all of FQ-ECOURTS-ACTOR.

1. **LawMind holds full written authorization to use eCourts for the scope
   already represented by the current eCourts authorization module**
   (`services/api/src/court/authorisation.ts` — the enumerated
   `permittedDataTypes`: court names, case status, cause lists, caveat search,
   court orders, judgments). The earlier repository wording that limited the
   automated path to "bulk cause-list harvesting only" is superseded by this
   decision.
2. **Authorized CAPTCHA bypass is permitted for that eCourts scope**, subject to
   the mechanical conditions already in `CLAUDE.md` §6 (grant non-null and
   unexpired; only in `services/api/src/court/ecourts.ts`; every request writes
   the fetch ledger and passes the rate limiter).
3. **The currently encoded conservative operational limits stand** unless the
   written authorization itself states more specific ones: minimum 2,000 ms
   between requests, maximum 100 requests/hour, maximum 1,000 requests/day,
   encoded expiry January 2029 (`GRANT_CONDITIONS` in `authorisation.ts`).
4. **This decision is ECOURTS ONLY.** It does not modify, infer, approve or
   resolve the separate SCI / Supreme Court automated-access question
   (FQ-LCC-R10-1 point 2, `docs/SCI_AUTHORISATION.md`), which remains contested
   and untouched. `SCI_AUTHORISATION_STATE = UNCHANGED`.

**`ECOURTS_GRANT_ATTRIBUTION`** is an internal audited attribution string that
identifies LawMind's authorized eCourts access — **not** a phrase the grant
requires us to quote verbatim (the written authorization prescribes no mandatory
attribution wording that is recorded in this repository). Its runtime value is:

> `LawMind — authorised eCourts access under written permission; independent legal research product, not a government application.`

It is supplied through the runtime environment (`.env` / deployment secret),
never committed to tracked source, and is not printed in normal logs after
configuration. `guard.ts` still refuses every network request while it is unset.

**Satisfied facts — future agents must not reopen these as founder-input
questions** unless the authorization expires, the founder explicitly changes the
decision, or new primary-source evidence directly contradicts the recorded
scope:

- `ECOURTS_FOUNDER_DECISION = SATISFIED`
- `ECOURTS_AUTHORIZATION = SATISFIED`
- `ECOURTS_FOUNDER_ACTOR = SATISFIED` — `users.id 3d37f77f-23f3-4eb0-b34f-d1700ec652a5`, a durable non-fixture admin actor designated 29 Aug 2026 for eCourts audit purposes
- `ECOURTS_ATTRIBUTION_CONFIGURATION = SATISFIED`
- `ECOURTS_AUDITED_ACTIVATION = SATISFIED` — `platform_config.ecourts_harvest = true`, flipped through the audited kill-switch path

Technical readiness downstream of this (cause-list parser, raw-observation
writer, quota locking, daily pilot) remains independently auditable and may
still be HOLD. This decision resolves only the founder-input / configuration
layer.

- Citations carry **three independent fields, never one enum**:
  `verification_state` (`verified`|`unverified`|`failed`) · `verified_by_source`
  (`corpus`|`public_x2`|`ecourts`|`none`) · `overruled_status`
  (`none`|`set_aside`|`partly_set_aside`|`doubted`, on `judgments`).
  **A judgment can be verified and overruled at once** — different questions,
  different sources. The five badge states are DERIVED from these, never stored.
  An unverified citation may be shown. It may never be shown as confirmed, and it
  may never be silently dropped. Silent-drop rate is tracked with a zero threshold.
- Render citation fields FROM THE DATABASE ROW, never from model output.
- Overruled judgments always display overruled status, in every surface, in all
  three states. `set_aside` disables add-to-matter — the one case where Lawmind
  refuses to let an authority be used.
- **Corpus acquisition in bulk is permitted and encouraged.** AWS Open Data,
  CC-BY-4.0, with attribution. **There is no copyright in a judgment** — Copyright
  Act **s. 52(1)(q)(iv)**, and the exemption does not distinguish commercial use.
  Take all of it. What IS protected is a reporter's _copy-edited_ version —
  headnotes, editorial numbering (_Eastern Book Company v. D.B. Modak_) — so use
  raw court text and never a law report's edition of it.
- **eCourts harvesting: PERMITTED under the registrar's written authorisation
  granted 7 Aug 2026, and only within its stated conditions.** Scope is the
  enumerated `permittedDataTypes` in `services/api/src/court/authorisation.ts`
  (court names, case status, cause lists, caveat search, court orders, judgments)
  — settled by the founder 29 Aug 2026, see §6a. The conditions are
  configuration, not folklore: the rate limiter enforces them and the fetch ledger
  records every request with timestamp, endpoint and court, so "did we stay inside
  the grant" is answerable by query rather than by memory. The kill switch
  (`platform_config.ecourts_harvest`) was flipped ON 29 Aug 2026 through the
  audited kill-switch path; flipping it always requires a `reason`. **If the
  authorisation's terms are not in the repo, the switch stays off** — an unbounded
  harvest under a bounded permission is the fastest way to lose it.
- **The CAPTCHA rule changed 8 Aug 2026, on the founder's authority: the grant
  expressly permits bypassing it.** The old rule ("never bypass, the advocate
  always solves it") existed for one reason — unauthorised access under IT Act
  ss. 43/66 — and **written authorisation removes that reason.** What replaces it
  is narrower and mechanical, not a matter of anyone's memory:
  - Bypass is permitted **only while `AUTHORISATION` is non-null and unexpired**.
    It is a field ON the grant (`captchaBypassPermitted`), so it **expires with
    the grant automatically**. The grant runs to **January 2029**, after which the
    registrar requires payment to continue — a lapsed grant must revert the
    behaviour on its own, never by anyone remembering to.
  - Bypass lives **only in `services/api/src/court/ecourts.ts`**, the one module
    permitted an HTTP client. `services/api/src/citations/verify.ts` still contains
    no HTTP client and the test asserting that **stays** — Tier 3 per-citation
    confirmation and the automated grant-scope harvest are different acts under
    different parts of the grant, and collapsing them is how a bounded permission
    becomes an unbounded one. Tier 3 remains a human solving the CAPTCHA and
    vouching; automated resolution writes `verified_by_source = 'ecourts_bulk'`,
    never `'ecourts'`.
  - Every bypassed request still writes the fetch ledger and still passes the rate
    limiter. Permission to bypass is not permission to flood.
- **Never circumvent an access control you have NOT been authorised to, and never
  buy data from someone who did.** This applies to unauthorized sources and
  unauthorized scraper-resellers. It does **not** exclude the specifically
  authorized LawMind sources recorded in §6a below.
- Route by data sensitivity. Uploaded document content is sensitive-class:
  pseudonymise before any model call. **OD-6 resolved 2 Aug 2026** — the
  countersigned DPA is still owed before uploads ship, and the admin surface
  refuses to route sensitive traffic without one, with no founder override.
- **Never mix documents in one prompt.** Multiple case files in one context makes
  the model conflate parties between matters — a confidentiality breach between
  two of the same advocate's clients, invisible in fluent output.
- Never claim complete PII removal. Coverage is partial. Say so plainly, in
  product and in marketing.
- OCR output is never trusted silently. The advocate confirms extracted fields
  before anything saves. A silently wrong hearing date is a missed hearing.
- Never train on another model's commentary about law. Primary sources only —
  judgments, statutes, official records. See `docs/DATASETS.md`.
- Every generated document carries "AI-assisted draft — verify before filing"
  until the advocate removes it deliberately.
- Hindi renders in Noto Sans Devanagari everywhere including PDF export.
- Bar council enrolment number is captured, never gates access.
- BNS / BNSS / BSA replaced IPC / CrPC / Evidence Act July 2024. No frontier model
  knows them. `DOMAIN_TRUTH.md` or the fact does not exist.
- Never invent a section number, citation format, or court hierarchy fact.

## 6b. HOW TO WORK — continuous execution

**Stated by the founder repeatedly, and binding on every agent in this repo.**

**Work continuously.** Emitting prose ends the turn, so a status update _is_ a
stop. Keep calling tools until every task is done. Do not stop at a milestone, a
green CI run, a successful deploy, or "a good place to check in". Batch reporting
into one message when the work is actually finished.

**Solve your own blockers.** Before declaring anything blocked, ask whether it is
genuinely _a credential, an account, or money_. If not, it is yours:

| looks like a blocker          | it is not, because                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a console/dashboard action    | Railway, Resend and Spaceship all have a CLI or an API. Try it. Two "console only" items turned out to be one CLI call.                                                               |
| a screen that is not designed | build the server side behind an **additive, documented, provisional** shape and mark it as such. The contract has absorbed additive endpoints before.                                 |
| a token you do not have       | build the whole path behind an interface that works without it and **refuses honestly in production** — `packages/auth/src/mail.ts` is the pattern. Only the key is then outstanding. |
| a long-running job            | run it in the background and keep working.                                                                                                                                            |

**Do not stop even for those.** An API key, an account, money, or a decision only
the founder can make goes into **`docs/FOUNDER_QUEUE.md`** and the lane KEEPS
GOING. The founder has asked to be handed one list at the end of the sprint run,
not interrupted per item. Write the entry — what is needed, what was built anyway,
what stays broken without it, and where it plugs in — then move to the next task.

That file survives compaction and a fresh agent. It is the only place a
founder-blocked item is allowed to live; a blocker mentioned only in conversation
is a blocker that gets lost.

**When something looks blocked, search before you queue it.** Read our own docs
first — `docs/`, `sprints/`, `PRODUCT_DECISIONS.md` — then the vendor's real
documentation on the web. Two items queued as "needs a credential" this week were
neither: Expo push needs no token, and Railway services can be created from the
CLI. Assume the blocker is your ignorance until the vendor's own docs say
otherwise.

**This does not weaken anything in §6 or §7.** Verify by observation, never claim
unverified work as done, never resolve an OPEN_DECISION alone, and stop after
three failed attempts at the same thing. The founder data authorization in §6a is
already settled and is not an OPEN_DECISION. Continuous does not mean reckless:
it means not handing the founder a decision they have already delegated.

## 7. AGENTS AND GATES (roadmap v7.4 §2, §3; Amendment A1)

```text
SHIP   ACTIVE      product · client · server · ops · release · contract change control
DATA   CONTINUOUS  corpus · source · legal truth · retrieval · embeddings
RED    FROZEN      fresh independent audit, only as RED_READ_ONLY / RED_GATE / RED_P0
```

Bind a session with `echo SHIP > .agents/bus/.lane-<session_id>` (or DATA / RED).
LCC, RCC, NEW1, NEW2, NEW3, FIFTH and AUDIT-RO are **legacy** lanes: their bus
messages, receipts and commits are immutable provenance, and no new session binds
to them. Fewer agents does not mean fewer programs.

Gates: A, B, C passed; current is **Gate D** (SHIP, no RED), then **Gate E** (RED).
Stop-the-line is limited to the six conditions in roadmap §3.6; P1/P2 defects are
owned backlog. Contract changes follow roadmap §3.7. The shared-worktree controls
(atomic `GIT_COMMIT` / `MIGRATION_SLOT` / `HEAVY_BOX`, exact-path staging) still bind.

The historical S0–S7 plan and its Gate S2 wording live in `BUILD_GUIDE.md` as
history. Citation accuracy remains non-negotiable through §2 above.
