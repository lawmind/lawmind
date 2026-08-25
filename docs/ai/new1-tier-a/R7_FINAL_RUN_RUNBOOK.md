# NEW1 — R7 FINAL RUN RUNBOOK

**Why this file exists:** the remaining R7 deliverables are gated on an ~8-hour passage
build. A sequence held only in a session does not survive a compaction or a lost
session. This does.

**Precondition:** `docs/ai/new1-tier-a/tranche-embed.log` shows `TRANCHE EMBED DONE`,
or the durable row count has stopped rising:

```sql
SELECT count(*) passages, count(DISTINCT judgment_id) docs FROM new1_tranche_passages;
-- expect ~250,000 passages over 81,720 documents (81,510 tranche + 210 forced gold)
```

Do NOT infer completion from the process being gone. Check the row count.

---

## The sequence, in order. Each step's output gates the next.

### 1. Rebuild the HNSW on the COMPLETE table

The current index was built on 64,960 passages and is stale. It must be dropped and
rebuilt, not appended to — a build-time and index-size number from a partial table is
not the number the full-corpus decision needs.

```
node services/harness/src/passage-eval-cli.mjs --index
```

Writes `PASSAGE_INDEX_BUILD.json`: build seconds, index bytes, heap bytes, WAL delta,
temp delta, backend RSS sample. **These are the numbers the full passage build decision
turns on.**

### 2. Refresh the HEAD baseline

Already built over all 20,947 tranche documents that carry a HEAD vector, and it does
not depend on passage-build progress — so this is only needed if the table was dropped.

```
node --max-old-space-size=4096 services/harness/src/passage-eval-cli.mjs --head-baseline
```

### 3. The full evaluation, all 295 tasks, four arms

```
rm -f docs/ai/new1-tier-a/passage-eval.checkpoint.jsonl
node services/harness/src/passage-eval-cli.mjs
```

The checkpoint is keyed to `indexPassages`, so any row scored against the partial index
is discarded automatically — the `rm` is belt and braces.

Expect ~15 minutes: the exact arm seq-scans the whole table per query (~1.1 s at 250k
passages × 295 queries), plus two ANN arms and the HEAD arm.

**Read the per-family table, not the aggregate.** `adverse_authority` and `statute`
were ZERO for every representation ever tested on this project; on the partial index
they read 0.25 and 0.33. If that holds at full scale it is the sprint's headline.

### 4. Abstention, tuned on DEVELOPMENT only

```
node services/harness/src/abstention-calibrate-cli.mjs
```

**Check `thresholdOnGridEdge` in the output artifact.** On the partial index the chosen
`answer` threshold sat on the grid's lower edge because `topSim` p05 was 0.6219 — every
query scores 0.62–0.77, so an absolute-similarity threshold cannot discriminate at all
and the rule collapses to gap-only. If that repeats at full scale, **do not widen the
grid again**: it is a finding about the signal, and the honest report is that this
feature set cannot calibrate abstention, not a threshold fitted to an edge.

### 5. Re-run the common-query arms against the full index

```
node services/harness/src/common-query-arms-cli.mjs
```

The **refusal** numbers (14 of 48) are production's own rule on production's own
`lexeme_document_frequency` table and will not move. The **coverage** numbers will, and
`COMMON_QUERY_SEARCH_CONTRACT_V1.md` §7 currently carries a caveat saying they were
measured on a 27% prefix. Update that caveat or remove it — do not leave it stale.

### 6. Write the two remaining documents

- `PASSAGE_100K_VALIDATION_V1.md` — from `PASSAGE_100K_METRICS.json`. END_TO_END and
  CONDITIONAL **together, never one alone**. Per-family table above any aggregate. The
  target-cluster bootstrap CI beside every headline comparison.
- `HEAD_VS_PASSAGE_DECISION_V2.md` — resume / coarse-only / superseded / abandoned for
  the HEAD walk, plus the full-passage-build recommendation. Full scale needs NEW1
  evidence **and** Fifth approval **and** founder approval if compute/storage expands
  materially. This file recommends; it does not decide.

### 7. Then, and only then

- Update `docs/CURRENT_PLAN.md` (an entry already exists for the partial state — extend it).
- Send the final bus report to LCC / NEW2 / NEW3 / FIFTH.
- Decide the HEAD walk's disposition and either resume it or record why not.

---

## Resuming the HEAD walk, if that is the decision

**Step 1 is not optional.** `.agents/logs/new1-walk.pause` records why:

```
node services/harness/src/stage-coverage-census.mjs   # REQUIRED, the file is stale
rm .agents/logs/new1-walk.pause                       # the keeper relaunches on its next silence check
```

Resuming without re-running the census replays finished batches and produces zero rows.
That is not a hypothetical — it is what happened for 65 minutes on 25 Aug.

---

## Standing constraints that do not lapse when the build finishes

- **A forced-gold target is an END_TO_END MISS.** 210 of 213 are forced, by construction,
  because the draw is gold-blind over 8.85M documents. END_TO_END on this tranche is a
  near-floor number and CONDITIONAL is the informative one — say so wherever both appear.
- **`ef_search` is 40 in the probe harness and 200 in production.** At 40 the ANN arm
  loses ~70% of the exact top-100. Never quote a probe number as production.
- **No aggregate may hide a zero family.**
- **Do not start** the full passage build, a reranker or model bake-off, HyDE, graph
  ranking, ColBERT, a new vector DB, or an input-length sweep. R7 §16.
- **Do not change `chunk.ts`** to fix the span ceiling until the tranche work is closed
  and a segmentation version bump is deliberate. It is the segmentation identity of both
  `judgment_chunks` and this build.
