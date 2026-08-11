# V2 MASTER PLAN — RECONCILIATION AUDIT

**11 August 2026, LCC.** `LawMind_Master_Architecture_Execution_Plan_v2.md`
adopted as the planning baseline per the founder's instruction. This audit
compares it against the actual repository — not against what V2 assumes —
before any of it becomes an execution order.

---

## Already complete / already correct — do not rebuild

| V2 item | State |
| --- | --- |
| §3 Rule 1, exact citation never falls back to semantic | **DONE for the two reproduction queries** (task 001, closed, verified against production). Gap below. |
| §3 Rule 2, LLM never creates final citation metadata | **Structurally true** — `structured.ts` resolves by DB row; `CITATION_HARNESS.md`'s whole mechanism is this. |
| §21 Exact citation resolver | **Built** — `search/qlang/{lex,parse,compile,explain}.ts`, deterministic, no semantic fallback, tested. |
| §30 Teacher/competitor data firewall | **Built and real**, not stale — `services/ingest/src/harvest/bharatlaw.ts`'s `extractionPermitted`/`AUTHORISATION`/`consentPermits` is exactly this pattern, already gating a real data source. |
| §12 Quality gates (partial) | `text_quality`, `content_hash`, `source_document_type` on `judgments` (migration 0031, this session) cover extraction-confidence and dedup-signal. `ocr_confidence` exists on `judgment_chunks`. Native-vs-scanned is NOT covered — see gaps. |
| §9 Canonical identity (partial) | `source_url` unique constraint is the resumability key; `content_hash` (0031) is the cross-source dedup signal V2 asks for. Document-level, not yet case-level (CNR-based) for HC. |
| §36 Immutable audit log (partial) | `llm_calls`, `citation_checks`, `audit_log` (admin actions), `harvest_fetches`/`ecourts_fetch_ledger` (fetch provenance) all exist and write append-only. Not unified into one "what did this user see" reconstruction, but the primitives exist. |
| §37 Privacy/redaction (partial) | `pii_entities`, pseudonymisation gate in `llm/route.ts`, DPA-gated sensitive routing — real, tested, honest about ~80% coverage (not claimed complete, per `docs/PRIVACY_PII.md`). |

## Partially complete — real gaps, not full rebuilds

| V2 item | Gap |
| --- | --- |
| **§3 Rule 1 / Rule 6, ambiguity** | **NOT built. Verified live in the corpus, not theoretical**: `cite:"2020 INSC 189"` matches **three different real judgments** (`SOBHA HIBISCUS CONDOMINIUM...`, `MONU KUMAR...`, `SUBHECHHA WELFARE SOCIETY...`, same date, same court) — queried directly against production data. `StructuredOutcome` has no `ambiguous` kind; a citation query matching >1 row is silently returned as an ordinary `matched` list. **This is the task.** |
| §7 Production integrity, `/version` | `/health` exists (`status`, `sha`, `database.reachable/latencyMs`). No `/version`, no `buildId`/`imageDigest`/`schemaVersion`. `sha` is proven unreliable for CLI-triggered deploys this session (static env var, never populated by `railway up`). |
| §7 Fail-closed startup preflight | **Built, 11 Aug 2026** — `services/api/src/preflight.ts`, wired before `serve()` in `index.ts`. Asserts the qlang module parses a canonical `cite:` query, required tables/columns/index exist, and the JS/SQL citation-key normalisation pair hasn't drifted. `process.exit(1)`s on any failure. Verified against the live production schema (zero failures) before being wired in — the first draft guessed two column names wrong and would have hard-failed every boot; caught before shipping, documented in `CITATION_HARNESS.md`. |
| §7 Continuous production probes | 2 of 9 listed probes exist (`services/harness/src/deployed-safety.ts`: impossible citation, real citation, missing `parsed`). Missing: wrong-metadata citation, ambiguous citation (blocked on the gap above), citationless-judgment live probe, evidence-retrieval probe, rendering probe. |
| §14 Paragraph-level structure | `judgments/paragraphs.ts` segments into paragraphs with numbers, but does not track character offsets — RCC's bus 0028 already found this blocks `citesJudgmentId`. Same root gap, independently discovered from two directions. |

## Stale or conflicting with V2's own assumptions

| V2 claim | What's actually true |
| --- | --- |
| §2 "the deeper defect was fail-open" | **Not what happened.** The deployed service kept serving the *old, pre-fix* code because *new* deploys crash-looped (a real bug: two ignore files excluded real source from every build). The old code didn't "fail open" — it was simply never replaced. V2's fail-closed framing is still worth building as forward defense, but the historical causal story in §2 doesn't match what this session found in `railway logs`. |
| §5 "stop using one shared working tree ... unsafe for autonomous agents" | **Correct concern, but not something LCC can unilaterally execute.** RCC is actively working in this same tree right now (verified: live bus messages, real commits to `apps/**` throughout this session). Switching LCC to a worktree mid-session while RCC stays on the shared tree would *increase* divergence risk, not reduce it. This needs a coordinated switch, not a unilateral one — flagged below, not executed. |
| §5 CODEOWNERS + protected branches + merge queue | **Partially blocked by the account, not by engineering.** `gh api repos/lawmind/lawmind/branches/main/protection` returns `403 — Upgrade to GitHub Pro or make this repository public`. Branch protection genuinely requires a paid tier on a private repo. CODEOWNERS itself (a file) has no such gate and is built below. |
| §5 "hidden adversarial benchmark inaccessible to coding agents" | **No such mechanism exists, and I cannot build true inaccessibility to myself from inside my own write access.** `services/harness/src/fixtures/adversarial.json` is a plain file I can read and edit today. Real protection needs something outside repo file permissions (a separate access-controlled store, a second repo, a CI secret). Flagged to `FOUNDER_QUEUE.md` rather than faked. |

## Not started, correctly lower priority per V2's own ladder

P3 (rhetorical-role classifier, proposition verifier, point-in-time statute
engine), P4 (fine-tuning, RLM), P5 desktop workspace — none of these are
blocked or urgent per V2's own ordering, and nothing in the repo contradicts
that. Not audited line-by-line; the ladder already says they wait.

---

## Blockers going to `FOUNDER_QUEUE.md`, not stopping the lane

1. **Branch protection / merge queue** — needs GitHub Pro (or a public repo,
   which is its own decision). Solvable with money or a policy call, not code.
2. **Worktree separation** — needs RCC to switch at the same time. A
   same-session unilateral switch is more dangerous than staying put.
3. **Hidden adversarial benchmark** — needs an access-control mechanism
   outside this repo. Recorded, not faked.

None of these block P0's actual safety work, which is code-only and proceeds
below.

---

## Highest-priority unblocked task, selected

**Citation ambiguity detection for `cite:` queries.** Directly closes the
gap in Contract §4 P0 / V2 §3 Rule 1 that task 001 explicitly left out of
scope, and it is proven live in production data (three real judgments, one
citation), not a hypothetical.

**Acceptance criteria:**
1. `StructuredOutcome` gains a fourth kind, `ambiguous`, distinct from
   `matched` and `no_match`.
2. A bare `cite:"..."` query (the AST is a single citation term, not a
   compound expression) matching **more than one** judgment returns
   `ambiguous`, carrying every real matching row — nothing invented, nothing
   dropped.
3. `route.ts` renders this as an explicit wire signal (`ambiguous: true`),
   never as an ordinary `matched` result silently containing more than one
   ambiguous candidate.
4. A regression test reproduces the exact `2020 INSC 189` case from real
   data (or an equivalent synthetic fixture if the real rows are unsuitable
   for a permanent test), and asserts `ambiguous`, not `matched`.
5. Existing suites stay green; the two task-001 reproduction queries
   (`(1994) 3 SCC 1`, `(9999) 99 SCC 999`) keep resolving `matched` /
   `no_match` exactly as before — this must not regress the P0 that was
   just closed.
6. `docs/CITATION_HARNESS.md` and `docs/API_CONTRACTS.md` updated in the
   same change — an undocumented wire addition is exactly the kind of gap
   this project keeps finding in itself.

Executing this now.
