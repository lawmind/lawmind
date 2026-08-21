# NEW3 · DeepSeek research assistant

**Founder instruction, 14 Aug 2026.** DeepSeek may assist NEW3's source
discovery as an *analytical* tool. It is **never source truth**. Every
external-source claim is verified by inspecting the source itself.

    node --import tsx --env-file=.env .agents/new3/ds-research.ts <task> < input.md

## The tasks, and why the list is closed

| task | use it for |
| --- | --- |
| `taxonomy` | enumerate CATEGORIES of legal material in the abstract |
| `classify` | classify a source **we have already inspected**, from our own evidence |
| `overlap` | reason about likely overlap between two corpora **we have measured** |
| `gaps` | given our measured inventory, name categories we appear to hold none of |
| `searchterms` | generate queries for us to run — never answers |
| `metadata` | normalise inspected metadata into the registry's field set |

**There is deliberately no free-text task.** The questions this model must not
be trusted on — *does source X exist*, *what is the URL for X*, *is X
licensed* — are simply unavailable rather than merely discouraged. A closed
task list is stronger than a warning comment.

## What the tool enforces mechanically

- Every output is stamped `UNVERIFIED_MODEL_OUTPUT` with the call id.
- Output is JSON, schema-shaped, so it lands as structured candidates for
  verification rather than prose to paste into a doc.
- Prompts instruct `UNKNOWN` for anything the input does not determine, and
  forbid asserting that any specific site, API or dataset exists.
- With no API key it **refuses loudly and exits 3**. There is no offline
  fallback by design — a cache miss with no key must never degrade into
  unverified recall.

## Cache and ledger

- Cache key: SHA-256 of `(task, model, prompt)` → `cache/<sha>.json`. A
  repeated question costs nothing and returns byte-identical output. Only
  `--no-cache` bypasses it.
- **Every call, cached or live, appends one line to `ds-calls.jsonl`**: id,
  timestamp, lane, task, model, cache hit/miss, token counts, prompt hash.
  That file answers "what did we ask, and what did it cost" and survives
  compaction the way a chat transcript does not.

## Shared-resource discipline

`LANE_PROTOCOL.md` §5: one heavy caller at a time against the free InferX
pool, and announce before a large batch. **This tool is single-shot and
cache-first on purpose. It is not a batch runner and must not become one
without a bus announcement.**

## What it has actually been worth so far — recorded honestly

**One `gaps` run against our measured inventory returned no category that
`SOURCE_REGISTRY.md` and `COVERAGE_GAP_MATRIX.md` did not already track.**
That is a genuinely useful *negative* result — an independent completeness
check on our own gap tracking — but it is not new information, and further
`gaps` runs were not made.

**The tribunal finding that followed came from deterministic inspection, not
from the model.** Fourteen domains probed, two proven open end-to-end by
downloading a real judgment PDF. Per the founder's own instruction, tokens
were not spent generating prose about sources that a `curl` can settle.

> The honest summary: the model is useful for *organising* and for
> *confirming we have not missed a category*. Every finding of substance this
> session came from inspecting the source.
