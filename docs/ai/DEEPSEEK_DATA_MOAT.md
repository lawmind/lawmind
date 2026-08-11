# DEEPSEEK + LOCAL GPU — inspection, and why the concordance work used one and not the other

**11 August 2026, LCC, per the founder's DEEPSEEK CONCORDANCE / DATA MOAT
EXECUTION DIRECTIVE, Phase 0.** The directive asked for an inspection of the
existing DeepSeek/InferX integration and local GPU infrastructure before
building anything. This is that inspection, and the reasoning for why the
concordance program (`docs/ai/CITATION_CONCORDANCE_PROGRAM.md`) is built the
way it is as a result.

---

## 1 · THE INFERX INTEGRATION — verified by reading the code, then by a live call

**Already built, 11 Aug 2026, same day, by an earlier session** —
`services/api/src/llm/call.ts` + `route.ts`. Not invented for this program;
inspected and reused.

| question | answer |
| --- | --- |
| Which DeepSeek model? | `deepseek-v4-flash`, inferx.net's own bare model name. `route.ts`'s canonical id for the ledger is `deepseek/deepseek-v4-flash` (the OpenRouter-style form, kept for consistency across both paths) |
| Endpoint | `https://model.inferx.net/endpoints/v1/chat/completions`, OpenAI-compatible |
| Batching/retry/concurrency | **Not present in `call.ts`.** One call, one attempt, a 429 is returned to the caller as a plain failure. Confirmed by reading the file, not assumed |
| Structured JSON output | No `response_format` parameter used or supported by the existing wrapper — the existing callers (`search`) do not need it. This program's own prompt (§below) asks for JSON in plain text and validates it strictly on the way back, rather than relying on an unverified structured-output mode |
| Data-sensitivity routing | `route.ts`'s `routeCall()` — public class → `DEEPSEEK_V4_FLASH` for the `search` feature only; `extract`/`ocr_postprocess` route to Claude Haiku. This program added a new feature, `concordance` (migration `0044`), and it routes to DeepSeek V4 Flash in `route.ts`'s public-class switch — see §3 |
| Cost | inferx.net's grant is free; `call.ts` always records `costUsd = 0` for the inferx path. This program's own ledger writes do the same |
| Ledger | `llm_calls` — feature, model, tokens, cost, `data_class`, `pseudonymised`, per `CLAUDE.md` §5. This program's CLI writes one row per model call, matching the existing shape exactly |

**Re-verified live, this session**, before writing anything:

```
status 429
service failure: endpoint deepseek-v4-flash all replicas at capacity
```

Repeated on retry, 8 seconds apart. **The free pool has real, shared capacity
limits.** `call.ts`'s lack of retry means every existing caller of it (just
`search`, today) would read a transient capacity blip as "the model
answered nothing" — worth flagging, though out of scope to fix here since
`search` is a different feature with a different latency budget (a user is
waiting synchronously; retrying with backoff there would be the wrong
trade-off). For this program, which runs as a batch pass with no user
waiting, retry is exactly the right answer — built in `services/ingest/src/
inferx.ts`, not in `call.ts`, and does not change `call.ts`'s behaviour for
anything else.

**A second confirmed operational fact, run three concurrent instances of this
program's own gold-set evaluation into each other by accident during
development**: running multiple callers against the free pool at once makes
the capacity problem measurably worse — three simultaneous processes hit 429
far more than one. **Any future use of this grant should coordinate through
one caller at a time**, or accept a materially higher retry/failure rate.
Recorded here because it is exactly the kind of thing "1 billion free tokens"
does not warn you about.

---

## 2 · THE LOCAL GPU — inspected, and correctly not used for this program

`MODEL_STRATEGY.md` §6, already measured before this session: **RTX 4060 Ti,
8 GB.** Not independently re-benchmarked here — no reason to, since this
program's compute profile does not touch it.

**Why the concordance program does not use the GPU at all.** Its two
compute-heavy steps are (a) token-Jaccard scoring over at most a few hundred
Supreme Court candidates per target — sub-millisecond, pure CPU, not worth
accelerating — and (b) the DeepSeek adjudication call itself, which is a
remote API call to `inferx.net`, not local inference. There is no local model
in this pipeline for a GPU to run.

`MODEL_STRATEGY.md` §6's own ranking of what the GPU is actually good for
stands unchanged by this program: a cross-encoder reranker, the claim-support
verifier (FQ-R1), and embedding experiments. **None of those are what this
program needed**, and reaching for the GPU here would have been exactly the
"use compute because it's available" mistake the founder's own directive
warned against — *"do NOT turn this into indiscriminate LLM processing... the
objective is maximum verified data quality per unit of compute."* The
verified-quality-per-compute answer for candidate ranking over a few hundred
short strings is a CPU loop, not a GPU job.

---

## 3 · WHAT WAS ADDED TO THE EXISTING INTEGRATION, AND WHY IT IS AN EXTENSION NOT A FORK

- **`llm_feature` enum gained `concordance`** (migration `0044`) and
  `route.ts`'s public-class switch was extended with one case routing it to
  `DEEPSEEK_V4_FLASH` — the same rule (`CLAUDE.md` §5: public data, cheapest
  capable model) applied to a new feature, not a new rule.
- **`services/ingest/src/inferx.ts`** is a second caller of the same
  `inferx.net` endpoint, in a different service (`services/ingest` cannot
  import `services/api`'s `src/`), with the one addition retry/backoff. It is
  not a divergent implementation — same base URL, same model id, same
  request/response parsing, re-verified live rather than assumed identical.
- **Structured output is enforced by validation, not by an API flag.** The
  prompt in `concordance-adjudicate.ts`'s `buildAdjudicationPrompt` asks for
  JSON in plain instructions; `parseAdjudicationResponse` strictly validates
  the shape and refuses anything that does not parse or that references a
  candidate never offered. This is deliberately conservative — trusting an
  unverified `response_format` mode on a free-tier endpoint would be
  exactly the kind of unverified claim `CLAUDE.md` §6 forbids.

---

## 4 · TOKEN BUDGET STRATEGY

**Idempotent by construction, not by discipline.** Every adjudication call's
input (citation key, evidence snippet, exact candidate set) is hashed
(`model_input_hash`) and the resolutions table carries a `UNIQUE` constraint
on it. The live CLI's own query (`concordance-adjudicate-cli.ts`) excludes any
citation key already present in `citation_concordance_resolutions` before
doing any work — no PDF is even re-fetched for an already-adjudicated target,
let alone a model called twice for the same evidence.

**Deterministic-first, model-second** (`CITATION_CONCORDANCE_PROGRAM.md` §3)
is itself a token-budget decision: a target with zero deterministic
candidates never reaches the model at all, because there is nothing for it to
adjudicate among. Measured on the gold set (`docs/ai/
CITATION_CONCORDANCE_EVALUATION.md`): a meaningful share of cases are filtered
out before any call — no case name found in the sampled context window, or no
Supreme Court judgment within the year window shares any token with it.

**Scale is bounded by `CONCORDANCE_LIMIT` and `CONCORDANCE_MIN_CITING`
env vars, not by a hardcoded ceiling.** Defaults (15 targets per run, minimum
5 citing documents) keep a single invocation small and re-runnable, matching
this repo's own convention of small, measured, resumable passes
(`hc-citations-cli.ts`, `resolve-cli.ts`) rather than one unbounded job.
