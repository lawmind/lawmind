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
better-auth self-hosted · Resend · Cloudflare R2 · OpenRouter · Sentry ·
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
- **Corpus acquisition in bulk is permitted and encouraged.** AWS Open Data,
  CC-BY-4.0, with attribution. **There is no copyright in a judgment** — Copyright
  Act **s. 52(1)(q)(iv)**, and the exemption does not distinguish commercial use.
  Take all of it. What IS protected is a reporter's *copy-edited* version —
  headnotes, editorial numbering (*Eastern Book Company v. D.B. Modak*) — so use
  raw court text and never a law report's edition of it.
- **eCourts harvesting: PERMITTED under the registrar's written authorisation
  granted 7 Aug 2026, and only within its stated conditions.** The conditions are
  configuration, not folklore: the rate limiter enforces them and the fetch ledger
  records every request with timestamp, endpoint and court, so "did we stay inside
  the grant" is answerable by query rather than by memory. The kill switch defaults
  OFF and flipping it requires a `reason`. **If the authorisation's terms are not
  in the repo, the switch stays off** — an unbounded harvest under a bounded
  permission is the fastest way to lose it.
- **Never circumvent an access control, and never buy data from someone who did.**
  That is why eCourtsIndia and similar scraper-resellers are out. Per-citation
  Tier 3 verification is unchanged: we hand the advocate the eCourts URL and the
  text to paste, and **the advocate solves the CAPTCHA.** Nothing on the server
  ever solves one — `services/api/src/citations/verify.ts` contains no HTTP client
  and a test asserts it.
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

**Work continuously.** Emitting prose ends the turn, so a status update *is* a
stop. Keep calling tools until every task is done. Do not stop at a milestone, a
green CI run, a successful deploy, or "a good place to check in". Batch reporting
into one message when the work is actually finished.

**Solve your own blockers.** Before declaring anything blocked, ask whether it is
genuinely *a credential, an account, or money*. If not, it is yours:

| looks like a blocker | it is not, because |
|---|---|
| a console/dashboard action | Railway, Resend and Spaceship all have a CLI or an API. Try it. Two "console only" items turned out to be one CLI call. |
| a screen that is not designed | build the server side behind an **additive, documented, provisional** shape and mark it as such. The contract has absorbed additive endpoints before. |
| a token you do not have | build the whole path behind an interface that works without it and **refuses honestly in production** — `packages/auth/src/mail.ts` is the pattern. Only the key is then outstanding. |
| a long-running job | run it in the background and keep working. |

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
three failed attempts at the same thing. Continuous does not mean reckless: it
means not handing the founder a decision they have already delegated.

## 7. SPRINT DISCIPLINE

Four disjoint agent file-sets in parallel within a sprint. Hard gate. Then
advance. Never two sprints at once. `BUILD_GUIDE.md` holds the dispatch pattern.

Gate S2 (citation accuracy) is a hard stop. Nothing downstream matters if it
fails. Do not proceed to "keep momentum".
