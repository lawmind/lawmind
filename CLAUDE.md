# LAWMIND — PROJECT CLAUDE.md

Inherits the global `~/.claude/CLAUDE.md` verbatim. Nothing in the global file is
overridden. This file ADDS project context, the extra tool layer, and the
mandatory reading set.

## 0. READ BEFORE ANY WORK — non-negotiable

Session start, in this order, before Section 2 of the global file:

1. `.ai/README.md` → loads the whole `.ai/` module set (11 files)
2. `docs/OPEN_DECISIONS.md` → what is NOT settled; never silently decide one
3. `docs/SCHEMA_TRUTH.md` → the only authority on data shapes
4. `docs/CITATION_HARNESS.md` → the rule that can end this product

More than 20 turns deep, or context was compacted → re-read items 2–4 before your
next edit. The `UserPromptSubmit` hook re-injects the core each turn; that core is
a pointer, not a replacement for the files.

## 1. WHAT LAWMIND IS

AI research and drafting assistant for practising Indian advocates. Criminal and
civil litigation. Native iOS + Android (Expo). Web is admin only.

Four features, priority order:
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

| Operation | Use | Notes |
|---|---|---|
| Symbol-level navigation, rename/reference | AFT + tree-sitter | Faster than graph for single-symbol questions |
| Pre-invocation context compression | Context Mode | Before every model invocation, per `.ai/07-context.md` |
| Episodic memory | `memory_recall()` / `memory_store()` | Interface from global §2. Backed by agentmemory (:3111). Map in `.ai/06-memory.md` |
| Structural / architecture queries | codebase-memory-mcp | Unchanged from global |
| Semantic snapshot | Understand-Anything | Session start only, once |
| Shell compression | RTK | **Homebrew only** — never cargo, crates.io name collision |
| Node script running | nub | Universal runner |
| Dedup / fallback | sqz | When RTK unavailable |

Retrieval order: `.ai/03-retrieval-pipeline.md`.

## 4. STACK — do not substitute without asking

Expo (React Native, TypeScript) · Hono API on Railway · Railway Postgres +
pgvector · Drizzle ORM · Railway cron · OCR service (Python/FastAPI) ·
better-auth self-hosted · Postmark · Cloudflare R2 · OpenRouter · Sentry ·
PostHog · Expo push.

Explicitly NOT used: Neon, Vercel, Qdrant, Clerk, Supabase, Telegram bot.

## 5. LLM ROUTING — by data sensitivity, not task difficulty

| Data class | Contents | Routing |
|---|---|---|
| Public | Judgments, statutes — already published | Cheapest capable. DeepSeek V4 Flash. |
| Sensitive | Uploaded documents, matter notes, party names | Pseudonymise first. Provider with written data terms only. **OD-6 unresolved — no upload features until settled.** |

Within public class, route by task: search → DeepSeek V4 Flash · summarise/extract
→ Claude Haiku 4.5 · drafting/briefings → Claude Sonnet 4.6.

Every call rows into `llm_calls` with `data_class` and `pseudonymised`.

## 6. PROJECT HARD RULES (add to global Section 7)

- Citations carry one of five states: `verified_internal`, `verified_external`,
  `verified_human`, `unverified`, `overruled`. An unverified citation may be
  shown. It may never be shown as confirmed, and it may never be silently
  dropped. Silent-drop rate is tracked with a zero threshold.
- Render citation fields FROM THE DATABASE ROW, never from model output.
- Overruled judgments always display overruled status, in every surface.
- Never bypass the eCourts CAPTCHA. Pre-fill the search, let the advocate solve
  it, cache the result permanently.
- Route by data sensitivity. Uploaded document content is sensitive-class:
  pseudonymise before any model call. OD-6 blocks upload features.
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

## 7. SPRINT DISCIPLINE

Four disjoint agent file-sets in parallel within a sprint. Hard gate. Then
advance. Never two sprints at once. `BUILD_GUIDE.md` holds the dispatch pattern.

Gate S2 (citation accuracy) is a hard stop. Nothing downstream matters if it
fails. Do not proceed to "keep momentum".
