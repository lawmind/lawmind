# NEW2 R24 — the 539 are applied, and the edge population is rebuilt from what they left behind

R24 is the first round in the correction programme that writes. Everything it
wrote was frozen as `NEW2-R23-SAFE-e5caecc2b05a4d04` and independently audited;
nothing was re-adjudicated here, and nothing outside those 539 rows was touched.

## Phase A — the write

### What was proven before the transaction opened

- The eight R23 artifact files hash to `docs/ai/new2-r23/artifact-manifest.json`,
  byte for byte.
- `correctionPopulationHashV2` over the 539 rows recomputes to
  `e5caecc2b05a4d047291f4b2bad45e108b6a7135006da502cced8d5b6ab990b4`.
- Counts recompute to 539 / 441 / 86 / 12, and the population file and the
  preflight manifest describe one population field by field on all 539 rows.
- The 32 quarantined judgment ids are absent from SAFE.

The execution manifest is a semantic copy and says so arithmetically: its rows
hash to the parent hash exactly. Its own identity is a separate field, because a
round identity that overwrites a population hash is how a receipt comes to name a
population no file describes.

```
NEW2-R24-EXEC-53f01c212644524f
53f01c212644524f9611ca4856820931cf3f839384559a5f739df0257e6bf3e5   execution
e5caecc2b05a4d047291f4b2bad45e108b6a7135006da502cced8d5b6ab990b4   rows (= R23)
```

### The live check, and the control that makes it mean something

All 539 rows were re-read immediately before the transaction: every row exists,
and `neutral_citation`, `source_url` and `content_hash` are unchanged from the
frozen values. **Zero drift.** Had there been one, the round would have aborted
whole — there is no path here that shrinks 539 to 538, because a changed
population is a population no audit describes.

The 95 replacement keys were re-queried and all still have zero holders. That
number is only worth something if the query can return a holder at all, so the
same query shape was run with one extra key appended: `1950INSC36`, which
returned **1** holder. A gate that reads zero because it can never read anything
is the failure that control exists to exclude.

### One transaction, and the WHERE clause that carries the old value

Every statement was

```sql
update judgments set neutral_citation = $new
 where id = $id and neutral_citation = $old
```

— identity **and** expected old value, so a row that had moved would match
nothing and be loud rather than be overwritten from a value nobody audited.
Anything other than exactly one affected row is terminal for the whole
transaction; `UPDATE_MATCHED_NO_ROW` and `UPDATE_MATCHED_MANY_ROWS` are named
separately because they are different failures.

Before `COMMIT`, from inside the same transaction: 539/539 rows carry the audited
new value, 441 of them NULL, the source identity and content hash of every row
unchanged, the 32 quarantined rows byte-identical to the snapshot taken before
the updates, and the edge and alias censuses identical to the ones taken at
transaction start.

```
TO_NULL_UPDATED          441
TO_REPLACE_UPDATED        86
TO_SUFFIX_UPDATED         12
TOTAL_UPDATED            539
IN_TRANSACTION_VALIDATION PASS
POSTCOMMIT_READBACK      539/539   (fresh session)
```

### The consequence that is designed, not accidental

`citation_key_dirty` went **0 → 539**, reason `CITATION_MUTATED`, exactly this
population. That is migration 0088's `AFTER UPDATE OF neutral_citation` trigger
doing its job: `judgment_citation_keys` still holds the OLD key for each of these
539 judgments, and the resolver will refuse `UNIQUE` on any key they claim until
the index is rebuilt. It is recorded here rather than buried because the next
round must know the index is behind for 539 rows — and because the rebuild is a
write to `judgment_citation_keys`, which this round had no authority to make.

### And the index caught up on its own, correctly

Seven minutes after the commit, at `2026-09-02 07:15:02`, a dirty-work rebuild
ran and cleared all 539 rows. `citation_key_frontier` did not move — this was the
per-judgment rebuild path, not the keyset walk. Checked against the corrected
values, on all 539:

| expectation                                        | observed |
| -------------------------------------------------- | -------: |
| `TO_NULL` judgments now carry **no** `neutral` key   |  441/441 |
| replacements keyed to the **new** value              |    98/98 |
| any judgment still carrying its **old** key          |        0 |

So the correction propagated end to end — canonical row, dirty mark, key
rebuild, consistent index — and Phase B was generated against an index that
already reflects it. `citation_key_dirty` therefore reads **0 → 539 → 0**, and
the receipt's `539` is the true value at the moment of its readback, not a
figure that later became wrong.

### The quarantine, proved by a mechanism rather than a comparison

All 32 quarantined rows are present, none is NULL, and **none of them appears in
`citation_key_dirty`**. That is a stronger statement than "the values match":
migration 0088's trigger fires on any update that moves a citation column, so a
quarantined row that had been touched would have left a mark whether or not its
value ended up looking the same.

## Phase B — a fresh candidate population, and nothing written

Generated after the commit, on a session opened `default_transaction_read_only`
at the server. The session is not trusted on its word: it is handed a write
first, and the refusal it returns is recorded.

```
session mode  READ_ONLY
proof         REFUSED_READ_ONLY_TRANSACTION
```

Nothing from R19-R22 was reused. Every candidate comes from the corpus as it
stands after the corrections, resolved through the production gate —
`canonicalKeyFor` and `judgment_citation_keys` — rather than a second
implementation of citation identity.

```
NEW2-R24-EDGE-CANDIDATE-cdd96b0f3b6c7215
cdd96b0f3b6c7215b94b8130155cc952b4494404b7ac77d3b2601d8552390a32
```

### Where 22,183,643 unresolved occurrences go

| outcome                             | occurrences |
| ----------------------------------- | ----------: |
| refused before any lookup           |  16,130,843 |
| no judgment in the corpus holds it  |   3,137,718 |
| candidate                           |   1,556,947 |
| self-identity                       |   1,003,934 |
| ambiguous — two or more claimants    |     354,196 |
| untestable — ownership unsettled     |           5 |
| **common-order page furniture**      |       **0** |

**16,130,843 of the refusals are one citation**: the empty string, stored on
72.7% of the unresolved rows. Row presence in `judgment_citations` says almost
nothing about citation coverage, and any figure computed over all 22.2M rows is
mostly counting that sentinel.

### The zero that had to be explained

The furniture guard is provably alive: 12 of 12 adversarial fixtures land
correctly, and both reproduced Meghalaya false pins are blocked against their
real documents at their real offsets. Yet it excluded **none** of 1,556,947
candidates. A guard that never fires is either unnecessary or broken, so it was
measured rather than assumed — `furniture-guard-reach.json`:

- 216,336 stored occurrences DO carry a `-DB`/`-FB` suffix, so the population is
  not simply free of the shape.
- **Zero** 2025 Meghalaya occurrences are immediately followed by another
  neutral token. Not one stored `char_offset` sits inside a stamp.

The cause is de-duplication: `extractCitations` keeps the FIRST appearance of a
normalised form, so a citation printed both inside a stamp and in ordinary prose
stores the prose offset. On `093f1c76` the stamp is at 1161 and the stored row is
at 2452. The stamp is still in the document; nothing points at it.

So the guard is **latent, not redundant**, and must not be deleted on the
strength of a zero. `citations.ts` already requires a re-extraction once the
stored keys are backfilled; that re-extraction is exactly what turns stamp
occurrences into rows.

### Both known false pins, observed rather than asserted

Each watched judgment was tracked through every exclusion point and its outcome
recorded as it happened:

| judgment   | guard at the stamp            | what its stored occurrence actually did |
| ---------- | ----------------------------- | --------------------------------------- |
| `093f1c76` | `COMMON_ORDER_PAGE_FURNITURE` | `EXCLUDED_AMBIGUOUS`                     |
| `a8d2bb17` | `COMMON_ORDER_PAGE_FURNITURE` | `UNTESTABLE_AMBIGUOUS_SOURCE_OWNERSHIP`  |

`admittedIntoCandidatePopulation = 0`, and that is a count taken during the pass,
not a claim made after it.

### What the population actually is

`edge-candidate-source-readability.json`, streamed from the frozen rows:

```
resolution path   alias 1,549,125 · neutral 5,004 · reporter 2,818
distinct targets  5,272
busiest target    66,211 candidates
top 10 targets    19.6%    top 100  41.4%    top 1000  78.9%
cross-court       1,555,855 of 1,556,947
```

**This is not a broad citation graph.** It is a narrow fan-in: 1.56M candidate
edges pointing at 5,272 judgments, 99.5% of them arriving through the alias path.
And `judgment_citation_aliases` has a UNIQUE index on `alias_key`, so an alias
**can never resolve AMBIGUOUS** — its uniqueness is a property of the index, not
an observation about the corpus. An independent audit should start there.

Source readability travels with each candidate and is deliberately **not** a
block: 16,142 candidates have a `script_quality` already marked damaged
(`damaged_other` 10,427, `legacy_font_ascii` 5,715) while 1,479,012 sit above
0.95 on `text_quality` — the score that is known to certify unreadable documents
above its own floor. A guard built on it would refuse good sources and admit
damaged ones, so the fact is recorded and left to the audit.

### Evidence, spot-checked against the documents

78 candidates sampled evenly across the frozen file (every 20,000th row) and
re-derived from Postgres: **78/78** carry the recorded token at the recorded
offset, **78/78** reproduce the recorded context-window hash, and **78/78** match
the recorded target artifact and content hash.

### Nothing was written

```
edges     22,411,265 -> 22,411,265   (newest row unchanged)
aliases        4,394 ->      4,394   (md5 81a898e6… unchanged)
EDGES_CHANGED_BY_R24 = 0    ALIASES_CHANGED_BY_R24 = 0
CITATION_BULK_APPLY  = HOLD
```

The row-level population is 1,556,947 lines and 1.83 GB, so it stays out of git
under the same rule as the R10 journal. It is identified by
`sha256 e30c5de00e906abce5573df9b8e2bfaa1aa88ec1360c0b55b19f574c76aa99cc`,
recorded in `edge-candidate-population.json` and hashed into
`artifact-manifest.json`. Regenerate with
`pnpm exec tsx scripts/n2-r24-edges.mts`.

## Deliberately not fixed here

The 29 common-order ownership rows, the two Delhi many→one rows, the HHC
ambiguous suffix row, the strict user-query citation parser, the historical
concatenated-source count discrepancy, and the common-order schema. None of them
was touched, and none is required by anything above.

## State

`CANONICAL_CORRECTION = PASS` · `POSTCOMMIT_READBACK = 539/539`
`EDGE_POPULATION_READY_FOR_INDEPENDENT_AUDIT = YES` · `CITATION_BULK_APPLY = HOLD`

Rebuild Phase A's manifest with `--rebuild-manifest` (no database); the gates are
`services/ingest/src/r24-execution-lineage.test.ts` and
`services/ingest/src/r24-correction-mutator.test.ts`, neither of which needs the
database or the network.
