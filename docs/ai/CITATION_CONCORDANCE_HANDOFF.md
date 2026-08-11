# CITATION CONCORDANCE — HANDOFF, EXPERIMENTAL, FROZEN 11 Aug 2026 23:11 (approx.)

**Status: FROZEN on the founder's explicit STOP IMPLEMENTATION instruction.**
This session's work is an **EXPERIMENTAL ARTIFACT**. LCC is the authoritative
backend/data lane and must inspect, and decide whether to adopt, modify or
reject, everything below. Nothing here should be trusted as correct,
complete, or production-ready until LCC has independently reviewed it.

**A material fact discovered while writing this handoff, not before**: `git
log` shows a commit — `8892757 feat(concordance): the DeepSeek adjudication
layer -- an opinion table, never an identity` — already exists on top of this
work, describing the identical migrations (0043/0044), the identical table
name, and the identical file set this session built. **This session did not
create that commit.** It appears LCC has already absorbed and committed this
session's working-tree changes under its own authorship. I am reporting this
as observed (`git log`, `git show --stat`), not asserting what happened
inside LCC's own session — LCC should treat its own commit as the thing to
verify, not assume this document is describing a still-pending diff.

---

## 1 · EXACTLY WHAT WAS IMPLEMENTED

A three-stage pipeline to resolve unresolved High Court citation targets
(`external_citations`, the ones `docs/HC_CITATION_RUN.md`'s extraction pass
could not join to a held judgment):

1. **Deterministic candidate generation** — extract the case name printed
   immediately before a citation, token-Jaccard match it against Supreme
   Court judgments within a ±1 year window, stopwords stripped.
2. **DeepSeek adjudication** — when ≥1 deterministic candidate exists, ask
   DeepSeek V4 Flash (via the `inferx.net` free grant) to choose among the
   candidates it is shown, or refuse. The model is never shown a citation
   with no candidate list and never asked to recall a judgment from memory.
3. **Cached, non-authoritative provenance** — every adjudication (input,
   candidates, model's verbatim reasoning, decision, confidence tier) is
   written to a new table, `citation_concordance_resolutions`, keyed for
   idempotency on a hash of (citation, evidence, candidate set). **This table
   is never read by the citation harness and nothing in this session's code
   promotes a row into `judgment_citation_aliases` or any `cited_judgment_id`
   column.** Promotion was explicitly designed as a separate, later,
   threshold-gated step — not built.

STATUS: **EXPERIMENTAL / UNVERIFIED.**

---

## 2 · EVERY FILE CHANGED OR CREATED THIS SESSION

| file | what |
| --- | --- |
| `packages/db/drizzle/0043_citation_concordance.sql` | new migration — `citation_concordance_resolutions` table |
| `packages/db/drizzle/0044_llm_feature_concordance.sql` | new migration — widens `llm_feature` enum with `concordance` |
| `packages/db/drizzle/meta/_journal.json` | added journal entries for the two migrations above (idx 41, 42) |
| `packages/db/src/schema.ts` | drizzle definitions matching both migrations |
| `docs/SCHEMA_TRUTH.md` | documents the new table; also backfilled documentation for two **pre-existing** undocumented tables (`external_citations`, `judgment_citation_aliases`) found missing from that file during this work — not new tables, just newly documented |
| `services/ingest/src/concordance-adjudicate.ts` | pure logic: tokenizing, Jaccard scoring, candidate ranking, name extraction, year parsing, prompt builder, strict JSON response parser, confidence-tier policy, input/output hashing |
| `services/ingest/src/concordance-adjudicate.test.ts` | 27 unit tests, no network/DB |
| `services/ingest/src/inferx.ts` | InferX/DeepSeek HTTP caller with retry+backoff on HTTP 429 |
| `services/ingest/src/inferx.test.ts` | 5 unit tests, faked fetch/sleep, no real network |
| `services/ingest/src/concordance-gold-cli.ts` | gold/adversarial evaluation script (read-only against `judgments`/`judgment_citations`; writes only a local JSON report file) |
| `services/ingest/src/concordance-adjudicate-cli.ts` | the live pass over `external_citations` targets — dry by default, `--apply` required to write |
| `services/ingest/package.json` | two new scripts: `concordance:gold`, `concordance:adjudicate` |
| `docs/ai/CITATION_CONCORDANCE_PROGRAM.md` | architecture doc — **was subsequently edited/shortened by an external process (LCC, per the pattern above) after I wrote it; I did not revert it, per instruction** |
| `docs/ai/DEEPSEEK_DATA_MOAT.md` | InferX/GPU inspection notes — **currently untracked in git**, not yet committed by anyone |
| `docs/ai/CONCORDANCE_GOLD_RESULTS.json` | **stale/partial** — written by an early, tiny, aborted run (`sampleSize: 3, casesRun: 2`), NOT the output of the fuller 32-case run described in §10. **Currently untracked in git.** Do not read this file as a result — see §10/§11 for what actually happened. |

I did not touch `docs/CURRENT_PLAN.md` or `docs/ai/DATA_MOAT_PROGRAM.md` —
those updates were planned but not started before the freeze order arrived.

---

## 3 · MIGRATIONS CREATED

- `0043_citation_concordance.sql` — `CREATE TABLE citation_concordance_resolutions` (21 columns, 3 indexes, CHECK constraints on `decision`/`confidence`/`validation_status`, unique cache constraint on `(source, citation_key, model_input_hash)`).
- `0044_llm_feature_concordance.sql` — `ALTER TYPE llm_feature ADD VALUE IF NOT EXISTS 'concordance'`. Kept in its own migration deliberately, separate from the CREATE TABLE, because Postgres restricts using a newly-added enum value inside the same transaction that added it.

## 4 · MIGRATIONS ALREADY APPLIED TO PRODUCTION

**Both.** Applied directly via the production `DATABASE_URL` (the same Railway
TCP proxy `docs/CURRENT_PLAN.md` Q1.8 already documents as in use for prior
migrations), not through `drizzle-kit`'s own journal-driven migrator (that
tool's snapshot metadata was already in a pre-existing broken state, unrelated
to this session — `drizzle-kit generate` failed with a snapshot collision
error on a file this session never touched). Verified immediately after
applying, by querying `information_schema.columns` and `pg_enum` directly —
**not** assumed from the SQL files alone.

STATUS: **PRODUCTION-APPLIED.**

## 5 · PRODUCTION TABLE/TYPE/ENUM CHANGES

- New table: `citation_concordance_resolutions` — **0 rows**, confirmed by direct query at freeze time.
- Widened enum: `llm_feature` gained the value `concordance` — confirmed via `pg_enum`.
- **No other production schema object was touched.** No column was altered on `judgments`, `judgment_citations`, `judgment_citation_aliases`, or `external_citations`.
- **No production data row was written, updated, or deleted by this session's pipeline.** `citation_concordance_resolutions` row count is 0 and `llm_calls` has 0 rows with `feature = 'concordance'`, both confirmed by direct query at freeze time — the adjudicate CLI's `--apply` flag was never invoked.

---

## 6 · InferX/DeepSeek JOBS LAUNCHED

1. A three-call manual smoke test (no logging to any DB) confirming the endpoint responds — hit HTTP 429 three times in a row before succeeding was even tried; used to confirm the key/endpoint work, not to adjudicate anything.
2. `concordance:gold` (the gold-set evaluator), launched **multiple times, accidentally concurrently** — see §7/§8. Only ever reads `judgments`/`judgment_citations`; never wrote to any table other than a local JSON file.
3. `concordance:adjudicate --apply` — **never launched.** Built, typechecked, never run.

## 7 · JOBS CURRENTLY RUNNING

**None.** All processes were identified via `Get-CimInstance Win32_Process`
(PowerShell) and force-killed on the freeze instruction. Confirmed no
`node.exe` process with `concordance` in its command line remains.

STATUS: **KILLED.**

## 8 · JOBS THAT WERE KILLED

At freeze time, **five** separate `concordance-gold-cli.ts` process instances
were found running simultaneously (two Node processes each, so ten OS
processes total) — the result of this session repeatedly retrying background
execution (a first attempt whose backgrounding mechanism failed silently, a
manual `&`-backgrounded retry that was not actually killed when believed to
be, the properly harness-tracked retry, and at least one further relaunch).
**This is a real operational mistake this session made**: running multiple
instances against the same shared, capacity-limited free InferX pool directly
worsened the HTTP 429 rate observed, and is flagged as a concrete risk in
§21. All were force-killed; none were writing to production tables (the
script does not write there), but they were consuming shared InferX capacity
concurrently, which is itself the kind of thing the freeze order exists to
stop.

---

## 9 · APPROXIMATE TOKEN CONSUMPTION

**Not measured precisely — no `llm_calls` ledger rows exist for any of this
session's InferX activity**, because the gold-set script deliberately does
not write to that ledger (it is an evaluation tool, not the production
pipeline) and the live adjudication CLI (which does write the ledger) was
never run with `--apply`. Rough order of magnitude from console output: on
the order of **20–35 successful DeepSeek calls** across the smoke test and
the (several, overlapping) gold-set attempts, each with a short prompt
(citation + ~400-char evidence + up to 6 candidates) and a JSON response
under ~1,500 tokens. **This is an estimate from visual inspection of log
output, not a query result — labelled as such.**

---

## 10 · CURRENT GOLD-SET PROGRESS

**Incomplete, and left incomplete by the freeze.** The cleanest single run
reached **case 18 of 32** planned cases (`positive`/`adversarial` pairs drawn
from real, already-resolved `judgment_citations` edges — genuine ground
truth, not invented fixtures) before being force-killed per the freeze
order. No final aggregate was computed or written — the script only writes
its JSON summary after the full loop completes, and it never reached that
point in the surviving clean run.

The `docs/ai/CONCORDANCE_GOLD_RESULTS.json` file that exists on disk is from
an **earlier, separate, much smaller aborted attempt** (`sampleSize: 3,
casesRun: 2`) and does not describe the 32-case run. **It should not be
read by LCC as a result of anything.**

STATUS: **RUNNING → KILLED, INCOMPLETE.**

---

## 11 · EARLY RESULTS — PRELIMINARY, NOT ACCURACY, NOT VALIDATED

**These are a raw tally read off console log lines from ONE partially-clean
run (17 of 32 planned cases, before contamination/kill), by hand, after the
fact. This is not a computed, verified statistic. n is far too small to
mean anything, several cases are not independent (positive/adversarial
pairs share the same underlying citation), and the run never finished.
Per the founder's explicit instruction, these numbers are NOT being
presented as measured accuracy of anything — they are the only observation
available and are reported because pretending there is nothing to report
would be its own kind of misrepresentation.**

Of 17 legible cases: 10 resulted in `candidate_selected` (a decision the
model could be right or wrong about), 7 resulted in `none_of_candidates`
(the model declining — not a decision to score for correctness). Of the 10
decided: 8 matched the case's true judgment by hand-inspection of the log
line, 2 did not. Both incorrect picks were tagged by this session's own
confidence-tier logic as `ambiguous`, not `high` — every case tagged `high`
in this partial run (6 of them) was, by the same hand-inspection, correct.
**This is the one pattern worth LCC's attention, and it is exactly the kind
of thing that needs the FULL, uncontaminated run to actually confirm**: it
is consistent with the tier design doing its intended job, and it is also
exactly the kind of small-n pattern that looks meaningful and evaporates
on a larger sample.

**Do not cite "8/10" or any percentage derived from it as this pipeline's
accuracy.** No claim is made here that DeepSeek adjudication improves
concordance resolution over the deterministic baseline — that comparison
needs the completed gold-set run, which does not exist.

---

## 12 · EXACT MODEL/CONFIGURATION USED

- Model: `deepseek-v4-flash` (inferx.net's own bare model name), recorded in the ledger schema as `deepseek/deepseek-v4-flash` for consistency with the existing OpenRouter-style id `services/api/src/llm/route.ts` already uses.
- Endpoint: `https://model.inferx.net/endpoints/v1/chat/completions` (env-overridable via `INFERX_BASE_URL`).
- `max_tokens`: 1500 in the adjudication caller (`inferx.ts`'s `DEFAULT_MAX_TOKENS`) — chosen because `MODEL_STRATEGY.md` §5 already documents this model spending part of its budget on reasoning tokens before the answer, and a too-small budget returns empty content.
- Retry: up to 5 attempts on HTTP 429 only, exponential backoff 1s/2s/4s/8s/16s. No retry on other 4xx/5xx.
- No `temperature`, `response_format`, or other parameter set — defaults only. **Not verified what inferx.net's defaults actually are** — this was not checked against vendor documentation, only against the observed response shape.

## 13 · PROMPT/SCHEMA USED FOR ADJUDICATION

Full source: `buildAdjudicationPrompt` in `concordance-adjudicate.ts`. Shape,
summarized: the source citation text, the ~400-character text window
immediately preceding the citation ("the evidence"), and a numbered list of
up to 5 candidates (each with `id`, `case_title`, `judgment_date`, and the
deterministic Jaccard score). The model is instructed to respond with **only**
a single JSON object:

```
{
  "decision": "candidate_selected" | "none_of_candidates" | "impossible_to_determine",
  "candidate_index": <integer index into the list above, or null>,
  "confidence": "high" | "medium" | "low",
  "evidence": "<quoted words from the evidence text>",
  "contradictions": "<argument against the model's own decision, or null>",
  "signals_used": ["<short strings>"],
  "needs_human_review": <true|false>,
  "reason": "<one or two sentences>"
}
```

The response is parsed and validated strictly (`parseAdjudicationResponse`):
malformed JSON, an unknown `decision`/`confidence` value, an out-of-range
`candidate_index`, or an internally contradictory response (e.g.
`none_of_candidates` carrying a non-null index) are all **refused outright
and treated as no answer** — never coerced into a best guess.

## 14 · CANDIDATE-GENERATION METHODOLOGY

1. Extract the text immediately preceding the citation's character offset (≤400 chars).
2. Match `X v. Y` / `X vs. Y` / `X versus Y` anchored at the end of that window (`nameBeforeCitation`) — returns null (no candidates attempted) far more often than not, by design.
3. Tokenize both the extracted name and every Supreme Court judgment's `case_title`, uppercased, punctuation stripped, a fixed legal-filing stopword list removed (`state`, `union`, `india`, `ors`, `anr`, `vs`, `versus`, etc. — sourced from `docs/ai/AUTHORITY_COVERAGE.md` §3a's own list).
4. Restrict the candidate pool to Supreme Court judgments whose `judgment_date` year is within **±1** of the citation's own parsed year (`yearFromCitationText`) — mirrors `concordance.ts`'s existing `MAX_YEAR_GAP` guard for the deterministic SCR/AIR pairing.
5. Rank by Jaccard similarity over the token sets; return the top 5 with jaccard > 0.

**This methodology was NOT independently re-derived from scratch — it
reuses the exact parameters (stopword list, ±1 year window, token-Jaccard)
that `docs/ai/AUTHORITY_COVERAGE.md` §3a already measured and reported at
28.0% raw match / 12.1% adversarially-safe**, on the reasoning that the same
candidate generator feeding a different, stronger downstream judge (DeepSeek
instead of "take rank 1 and hope") is the actual experiment. **This means any
weakness already known in that candidate generator (repeat-litigant
collisions, same-reporter ambiguity) is inherited here** — the model is
adjudicating over the SAME candidate set §3a already showed can be
misleading, not a better one. LCC should treat this as the load-bearing
assumption most worth checking first.

## 15 · CONFIDENCE-TIER METHODOLOGY

`resolveConfidenceTier`, explicitly documented in its own source comment as
**"a starting hypothesis, not a measured result"**:

- Any model-stated `contradictions` → `ambiguous`, regardless of confidence.
- Model decision is `none_of_candidates` or `impossible_to_determine` → `unresolved`.
- Model's chosen candidate disagrees with the deterministic top-ranked candidate → `low`.
- Model agrees with deterministic top-1 AND model confidence is `high` AND the Jaccard gap between rank 1 and rank 2 is ≥ 0.15 → `high`.
- Model agrees, confidence `low` → `low`.
- Everything else that agrees → `medium`.

**These thresholds (0.15 gap, the tier boundaries themselves) were never
validated against the gold set before the freeze.** §11's tiny partial
sample is the only observation that exists, and it is not sufficient to
confirm or reject this policy.

## 16 · CACHE/PROVENANCE DESIGN

- `model_input_hash` = sha256 of `citationKey|contextEvidence|sorted-candidate-judgment-ids`. `UNIQUE (source, citation_key, model_input_hash)` on the table — a re-run with identical evidence and candidates is a no-op insert (`ON CONFLICT DO NOTHING`), never a second model call (the live CLI's own query excludes already-adjudicated citation keys before even re-fetching a PDF).
- Every row stores the full candidate set actually shown to the model (`candidates` jsonb), the model's verbatim reasoning (`model_reasoning`), any stated contradiction (verbatim), and both the deterministic top and runner-up scores — so a stored decision is auditable and reproducible without re-querying a corpus that may have grown since.
- `validation_status` defaults to `unvalidated` and only becomes `promoted` through a step **that does not exist yet** — nothing automatically or manually promotes a row today.

## 17 · HOW CANONICAL IDENTITY IS PROTECTED FROM MODEL HALLUCINATION

- The model is **never** asked to name a judgment from its own memory — every candidate it may select is enumerated in the prompt with real `case_title`/`judgment_date`, and it may explicitly decline (`none_of_candidates`, `impossible_to_determine`).
- `candidate_index` is validated against the actual length of the candidate list sent; an out-of-range or hallucinated index is refused, not clamped or guessed.
- An internally contradictory response (a non-selection decision that still carries a candidate index) is refused outright.
- **Most importantly: nothing this session built writes a model's decision into `judgment_citation_aliases`, `judgment_citations.cited_judgment_id`, or any column the retrieval/citation harness reads.** The only write target is the new, isolated `citation_concordance_resolutions` table, and promotion out of it is undesigned and unbuilt — a deliberate, structural gap, not an oversight.

## 18 · ALL TESTS RUN

- `services/ingest`: `concordance-adjudicate.test.ts` (27 tests, pass), `inferx.test.ts` (5 tests, pass) — both via `npx tsx --test`, no network/DB.
- `pnpm --filter @lawmind/ingest run typecheck` — clean, run twice (after the core module, again after the CLI files).
- `pnpm --filter @lawmind/db run typecheck` — clean, after the schema.ts edit.
- `node scripts/check-schema-truth.mjs` — passes ("42 tables documented, 40 created, 2 deferred with a stated reason").

## 19 · ALL TESTS NOT RUN

- The full `services/ingest` test suite (`pnpm test`, all `*.test.ts` files) was **not** run — only the two new files were run directly. Whether this session's changes broke any pre-existing test is **unverified**.
- `services/api` was not touched, and its test suite was not run.
- `scripts/ci-local.mjs` (the full guard suite) was not run — only `check-schema-truth.mjs` was run in isolation.
- No integration test against a real `--apply` run of `concordance-adjudicate-cli.ts` was executed — it has never written a row.
- The gold-set evaluation itself — the actual measurement this whole program exists to produce — did not complete. See §10.

## 20 · ALL PRODUCTION VERIFICATION PERFORMED

- Migration application verified via direct `information_schema.columns` and `pg_enum` queries immediately after applying (not inferred from the SQL files "looking right").
- At freeze time: `SELECT count(*) FROM citation_concordance_resolutions` = 0, `SELECT count(*) FROM llm_calls WHERE feature = 'concordance'` = 0 — both re-confirmed by direct query, this is not carried over from an earlier check.
- **No verification was performed of query performance, index usage, or `ANALYZE`** on the new table — `docs/SCHEMA_TRUTH.md`'s own standing rule ("run ANALYZE on every table a migration touches") was **not followed** for migration 0043. The table is empty, so this has no current effect, but it is a real gap if LCC starts writing to it.
- No verification that the new `llm_feature` enum value is compatible with anything `services/api` does at runtime (that service was never started or exercised this session).

## 21 · KNOWN RISKS

- **The candidate generator inherits `AUTHORITY_COVERAGE.md` §3a's known failure mode** — repeat litigants and same-reporter collisions (a referral order vs. the judgment it refers to) are exactly the cases the deterministic step ranks confidently and wrongly. Whether DeepSeek actually corrects this, as designed, or merely agrees with a confident wrong deterministic top-1, is the single most important unanswered question and the entire point of the (incomplete) gold-set run.
- **Concurrent InferX callers measurably worsen the shared pool's 429 rate** — observed directly this session (§8). Any future run (by LCC or otherwise) should coordinate to avoid running more than one caller against the free grant at once.
- **The confidence-tier thresholds are unvalidated** (§15) — they may be too strict, too lenient, or simply mis-shaped; nothing about them should be treated as tuned.
- **`ANALYZE` was not run** on the new table post-migration (§20), against this repo's own documented standing rule.
- **This session's git-tree relationship to LCC's own commit is not fully understood** — see the note at the top of this document. LCC should confirm what it actually committed matches what is described here before relying on either.

## 22 · KNOWN BUGS

- The gold-set script's PDF/context-window sampling depends on `char_offset` values stored by the (separate, long-running) `hc:citations` extraction pass being valid against a **re-fetch** of the same PDF at a later time. This was not independently verified to be stable — if AWS ever serves a byte-different file at the same key (unlikely but unverified), offsets would silently misalign and produce a garbled context window rather than an error.
- `concordance-adjudicate-cli.ts`'s dry-run mode (no `--apply`) still performs live PDF fetches and — if an API key is present — live model calls; only the database write is skipped. This is **not the same as a true dry run** and could surprise someone expecting `--apply`'s absence to mean "nothing happens." Not fixed before the freeze.
- Background process management during this session was unreliable (§8) — manually backgrounding a long-running job with `&` inside this environment's shell tooling did not reliably survive between tool calls, leading to the concurrent-process pile-up. This is an operational finding about this session's own tooling, not a defect in the shipped code, but it is recorded because it materially degraded the one measurement this program exists to produce.

## 23 · WHAT LCC MUST INSPECT BEFORE ADOPTING ANYTHING

1. Confirm what commit `8892757` actually contains, file-by-file, against what is described in §2 — do not assume it is identical.
2. Run the **complete** gold-set evaluation, uninterrupted, as a single process, and read the actual computed JSON output — not the hand-tally in §11.
3. Independently re-derive or challenge the confidence-tier thresholds in §15 against that complete result.
4. Decide whether the candidate-generation methodology (§14) needs to improve beyond what `AUTHORITY_COVERAGE.md` §3a already found limited, before trusting DeepSeek's adjudication of it.
5. Run the full `services/ingest` test suite and `scripts/ci-local.mjs`, not just the two new test files.
6. Run `ANALYZE citation_concordance_resolutions` if/when it starts receiving real write volume.
7. Design and review the actual promotion step (unvalidated → promoted → written to `judgment_citation_aliases`) before any row from this table reaches an advocate — nothing in this session's work does that today, by design, and it should stay a deliberate, reviewed decision.

## 24 · WHAT SHOULD NOT BE TRUSTED YET

- Any precision/recall/accuracy number, anywhere related to this program — **none exists**. §11 is an honest partial observation, not a result.
- The confidence-tier boundaries (§15).
- The claim, anywhere in `docs/ai/CITATION_CONCORDANCE_PROGRAM.md` (in whatever form it now exists after external edits) or `docs/ai/DEEPSEEK_DATA_MOAT.md`, that this pipeline **improves** concordance resolution — that comparison has not been made.
- The candidate-generation methodology's adequacy (§14) — it is a reuse of a method already shown to have a real ceiling, not a new, stronger one.
- Production-readiness of any kind. Nothing here has been run end-to-end with `--apply`.

---

**STATUS SUMMARY**

| aspect | status |
| --- | --- |
| Code (pure logic, CLI, tests) | IMPLEMENTED |
| Migrations 0043/0044 | PRODUCTION-APPLIED (schema only — 0 data rows) |
| Overall pipeline | EXPERIMENTAL |
| Accuracy/precision claims | UNVERIFIED — none exist |
| Gold-set evaluation | RUNNING → KILLED, INCOMPLETE |
| Duplicate background jobs | KILLED |
| Live `--apply` adjudication pass | NEVER RUN |
| Promotion into `judgment_citation_aliases` | NOT BUILT, BLOCKED behind a founder/LCC decision by design |

**No further implementation, migrations, production writes, InferX calls, or
corpus processing were performed after the freeze instruction was received.**
