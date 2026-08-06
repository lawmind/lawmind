# LAWMIND — PROJECT CLAUDE.md

Inherits the global `~/.claude/CLAUDE.md` verbatim. Nothing in the global file is
overridden. This file ADDS project context, the extra tool layer, and the
mandatory reading set.

## 0. READ BEFORE ANY WORK — non-negotiable

Session start, in this order, before Section 2 of the global file:

1. **`PRODUCT_BRIEF.md`** → the north star. **Read first, every session.** If what
   you are about to build does not serve one of its four features, stop and ask
2. `.ai/README.md` → loads the whole `.ai/` module set (11 files)
3. `docs/OPEN_DECISIONS.md` → what is NOT settled; never silently decide one
4. **`PRODUCT_DECISIONS.md`** → PD-1…PD-14, **settled**. Do not silently reopen
   one. Reasoning is recorded because the reasoning is what keeps the next
   decision consistent
5. `docs/SCHEMA_TRUTH.md` → the only authority on data shapes
6. `docs/CITATION_HARNESS.md` → the rule that can end this product

More than 20 turns deep, or context was compacted → re-read items 3–6 before your
next edit. The `UserPromptSubmit` hook re-injects the core each turn; that core is
a pointer, not a replacement for the files.

`docs/OPEN_DECISIONS.md` and `PRODUCT_DECISIONS.md` are opposites and both binding: the
first is what nobody may decide alone, the second is what nobody may re-decide.

## 1. WHAT LAWMIND IS

AI research and drafting assistant for practising Indian advocates. Criminal and
civil litigation. Native iOS + Android (Expo). Web is admin only.

Four core features PLUS the daily loop (Tier B, approved 2 Aug 2026). **Tier B
ships before Tier A** — the loop creates the habit, the library only prevents a
feature-comparison loss. `PRODUCT_BRIEF.md`, `BUILD_GUIDE.md` §Sequencing rule.

Tier A — the four core features, priority order:
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
| Sensitive | Uploaded documents, matter notes, party names, client detail | **Pseudonymise first, then Claude** (written data-processing terms). Ambiguity resolves to sensitive, never public. **ONE DOCUMENT PER CALL.** |
| Never sent | A full client file with no legal reason to leave the device | Stays local |

Within public class, route by task: search → DeepSeek V4 Flash · summarise/extract
→ Claude Haiku 4.5 · drafting/briefings → Claude Sonnet 4.6.

Every call rows into `llm_calls` with `data_class` and `pseudonymised`.

## 6. PROJECT HARD RULES (add to global Section 7)

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
- Never bypass the eCourts CAPTCHA. Pre-fill the search, let the advocate solve
  it, cache the result permanently.
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

## 7. SPRINT DISCIPLINE

Four disjoint agent file-sets in parallel within a sprint. Hard gate. Then
advance. Never two sprints at once. `BUILD_GUIDE.md` holds the dispatch pattern.

Gate S2 (citation accuracy) is a hard stop. Nothing downstream matters if it
fails. Do not proceed to "keep momentum".
