# Storage forensics — where 96 GB actually is

**15 August 2026, LCC, per the founder's storage-architecture directive.**
Measured against the live Railway Postgres, not estimated. The directive's own
instruction governs the conclusion: **do not migrate blindly.**

**THE HEADLINE, AS IT STANDS AFTER EVERY CANDIDATE WAS CHECKED: 1.4 GB is
reclaimable, not 23 GB.** Read §2b, §3 and §5 before quoting anything from §2 —
this document deliberately keeps its first conclusions visible above the
evidence that overturned them, because *how* each one died is the reusable part.

The original headline claimed ~22 GB from `judgment_paragraphs.paragraph_text`.
That column is real duplication and it is also **`ts_rank`ed at query time on the
retrieval hot path**, so it cannot be dropped without redesigning retrieval. Two
of the other three candidates fell the same way. The one that survived —
1,440 MB of strictly redundant index — was found by reading a definition, which
is the only kind of evidence that settled anything here.

---

## 1 · THE MEASUREMENT

`pg_total_relation_size`, 15 Aug 2026. Everything not listed is under 400 MB and
together accounts for less than 1% of the total.

| table | total | heap | indexes | TOAST | est. rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| `judgments` | **59 GB** | 6.0 GB | 18 GB | **35 GB** | 5,457,064 |
| `judgment_paragraphs` | **27 GB** | 17 GB | 5.2 GB | 5.4 GB | 26,642,644 |
| `judgment_chunks` | 9.6 GB | 1.3 GB | 4.8 GB | 3.3 GB | 599,379 |
| `judgment_citations` | 391 MB | 164 MB | 227 MB | — | 1,423,811 |
| `judgment_statute_refs` | 322 MB | 124 MB | 198 MB | — | 846,360 |
| `external_citation_documents` | 119 MB | 58 MB | 60 MB | — | 367,589 |
| **database total** | **96 GB** | | | | |

Largest indexes, with their lifetime scan counts:

| index | size | `idx_scan` |
| --- | ---: | ---: |
| `judgments_full_text_idx` | **14 GB** | 16,109 |
| `judgment_chunks_embedding_hnsw` | 4.8 GB | 9,549 |
| `judgments_source_url_key` | 1.4 GB | 14,232,453 |
| `judgment_paragraphs_judgment_idx` | 1.4 GB | 119,394,827 |
| `judgment_paragraphs_unique` | 1.4 GB | 47,821,190 |
| **`judgment_paragraphs_number_idx`** | **1.2 GB** | **3** |
| `judgment_paragraphs_pkey` | 1.1 GB | 0 |
| `judgments_case_title_trgm` | 780 MB | 189 |
| `judgments_content_hash_idx` | 653 MB | 153 |
| `judgments_cnr_idx` | 287 MB | 24 |
| `judgments_case_number_trgm` | 258 MB | 8 |

**Bloat is not a problem here and was checked before assuming it was.** Only one
table carries meaningful dead tuples — `judgments` at 3.3%, autovacuumed 14 Aug
22:14. There is no VACUUM FULL to buy anything with.

---

## 2 · THE 22 GB THAT IS A DUPLICATE

`judgment_paragraphs` already carries `char_offset` and `char_length` **beside**
`paragraph_text`. So the text is derivable: `substr(full_text, char_offset+1,
char_length)`.

**Verified, not assumed.** A `TABLESAMPLE BERNOULLI` draw of 5,620 paragraphs
joined to their judgments:

| check | result |
| --- | ---: |
| `paragraph_text = substr(full_text, char_offset+1, char_length)` | **5,619 / 5,620 — 99.98%** |
| `paragraph_text` appears somewhere in `full_text` | **5,620 / 5,620 — 100%** |
| mean paragraph length | 1,037 chars |

The single exception is worth naming rather than rounding away: it is what
`source_text_hash` exists to catch — a paragraph written before its judgment's
text was re-extracted. Dropping the column does not hide that; the hash still
detects it.

**Dropping `paragraph_text` reclaims ~22 GB (17 GB heap + 5.4 GB TOAST), 23% of
the database, with no information loss.**

### `judgment_chunks.chunk_text` is a DIFFERENT case, and checking it nearly produced a false alarm

`judgment_chunks` carries `char_offset`/`char_length` too, so the same ~3.3 GB
looked available. It is not, and the way it is not is worth writing down.

A first measurement said `chunk_text = substr(full_text, char_offset+1,
char_length)` held for only **6.1%** of chunks, with a mean positional error of
~61,000 characters — which reads as a corrupt-offset defect in the evidence-span
path `services/api/src/search/retrieve.ts` renders. **It is not one.** Before
sending that anywhere, this repo's own instrument was run —
`verify-exact-span-cli.ts`, which exists precisely because two earlier offset
bugs were invisible to every unit test — and it returned **400/400 passing**.

The instrument was right and the ad-hoc query was wrong:

| | |
| --- | ---: |
| `length(chunk_text) = char_length` | 36 / 600 |
| mean `chunk_text` length | 2,424 |
| mean `char_length` | 2,196 |
| `chunk_text = substr(full_text, char_offset+1, char_length)` | 36 / 600 |
| **`right(chunk_text, char_length) = substr(full_text, char_offset+1, char_length)`** | **600 / 600** |

**`chunk_text` carries the chunker's overlap prefix; `char_offset`/`char_length`
describe only the non-overlapping tail.** Comparing the whole chunk against the
recorded span compares two different things. The "constant 241-character shift"
that looked like a smoking gun was that document's overlap length, and both texts
in the worked example were real, adjacent passages of the same judgment.

**So the offsets are correct, `resolveExactSpan` is correct, and the ~3.3 GB is
not a free reclaim** — reconstructing `chunk_text` would need the chunker's
overlap parameter as well as the offsets, which couples the corpus to a
configuration constant. Not recommended.

> **The reusable part: when a measurement of yours contradicts a check the repo
> already owns, run the repo's check before believing yours.** A 93% failure rate
> in the evidence path was one bus message away from costing another lane a day.

**THE COST, STATED PLAINLY, AND IT IS REAL.** Every paragraph read becomes a
detoast of the parent judgment's `full_text`. `LEGAL_OBJECT_PROGRAM.md` §3 has
already been bitten by exactly this: `length(full_text)` in a `WHERE` clause
detoasted the column for every row it touched and returned nothing in ten
minutes. A retrieval path that fetches 50 paragraphs from 50 different judgments
would pay 50 detoasts where it currently pays none.

**So this is a RECOMMENDATION, not a change, and it is not LCC's alone to make.**
It alters the shape NEW1's retrieval reads and NEW2's ingest writes. What is
being handed over is the measurement; the trade — 22 GB against per-read
detoast — is a decision for the lanes that pay the second half of it. A middle
option exists and may well be the right one: keep `paragraph_text` for the
paragraphs a retrieval path actually serves, and drop it for the long tail that
is only ever counted.

---

## 2b · THE 22 GB IS NOT AVAILABLE — the consumer inventory, run 15 Aug 2026

§2 asked the right question and stopped one step short of answering it. The
founder's directive required the missing step before anything was dropped:
*"first determine whether `paragraph_text` is actually required by any
production route, retrieval path, enrichment worker or client contract."*

**It is required, on the retrieval hot path, and not merely as a payload.**
`services/api/src/search/retrieve.ts:818` — `fillParagraphFallback`:

```sql
SELECT DISTINCT ON (judgment_id)
  judgment_id, paragraph_text, paragraph_number, char_offset, char_length
FROM judgment_paragraphs
WHERE judgment_id = ANY($ids)
ORDER BY judgment_id,
  ts_rank(to_tsvector('english', paragraph_text), plainto_tsquery('english', $query)) DESC
```

Three things make this decisive rather than a matter of preference:

1. **The column is RANKED ON, not just returned.** `to_tsvector` is computed per
   row at query time over `paragraph_text`. A column that has been deleted
   cannot be ranked on.
2. **It runs unconditionally, in every retrieval mode**, for every candidate
   that has no passage yet — its own comment says so — inside Gate S1's
   **3-second budget**, in a request already waiting on two rankers.
3. **Its output is the evidence the advocate reads.** It becomes both
   `operativeParagraph` and `exactSpan.text`.

Deriving it instead would mean `to_tsvector(substr(j.full_text, p.char_offset+1,
p.char_length))` with a join back to `judgments` — **a TOAST decompression of a
whole judgment per candidate row**, on the hot path. That is the same cost that
made a `length(full_text)` predicate return nothing in ten minutes
(`LEGAL_OBJECT_PROGRAM.md` §3).

**So the 22 GB is not a free reclaim and the question is closed for now.** It
becomes available only behind a retrieval-path redesign — a materialised
`tsvector` column, or moving this ranking into the chunk table — and that is
NEW1's design decision, not a storage cleanup. Recorded, not actioned.

`apps/` contains **zero** references to `judgment_paragraphs` or
`paragraph_text`, so no client contract is involved. The `paragraph_number`
hits in `briefings/assemble.ts` and `judgments/annotations.ts` are a **different
table** — matter annotations — and are unaffected either way.

## 3 · THE 1.2 GB NOBODY IS USING — AND WHY IT STAYS

`judgment_paragraphs_number_idx` — **1,216 MB, three scans in the index's
lifetime**, against sibling indexes on the same table showing 119 million and 48
million. It is not serving queries; it is being maintained on every one of 26.6
million rows.

**AND IT STAYS. The recommendation above is WITHDRAWN, on the founder's
instruction to prove it unnecessary rather than infer it from a scan count.**
Reading the definition rather than the statistics settles it:

```sql
CREATE INDEX judgment_paragraphs_number_idx
  ON judgment_paragraphs (judgment_id, paragraph_number)
  WHERE paragraph_number IS NOT NULL
```

That is a **pinpoint index** — "give me paragraph 14 of judgment X" — and its
partial predicate says so. It has three lifetime scans because **no route
performs that lookup yet**, not because the lookup is worthless. Pinpoint
paragraph citation is the exact-evidence work still ahead in Phase 1, and this
index is what makes it a millisecond instead of a scan of 26.6M rows.

> **A low scan count distinguishes "unused" from "used" — it cannot
> distinguish "useless" from "built ahead of its consumer".** Only the
> definition and the roadmap can, and both say keep it.

### THE 1.4 GB THAT IS PROVABLY REDUNDANT, found the same way

The same read produced a better finding than the one it withdrew:

```sql
judgment_paragraphs_judgment_idx  btree (judgment_id, paragraph_index)          1,440 MB
judgment_paragraphs_unique        UNIQUE btree (judgment_id, paragraph_index)   1,440 MB
```

**Identical column list, identical order.** A unique btree serves every lookup,
range scan and ordering the plain one can, so
`judgment_paragraphs_judgment_idx` is strictly redundant — 1,440 MB maintained
on every one of 26.6M rows for nothing. Its 119M scans are not an argument
against dropping it: those scans move to the unique index at identical cost.
`ON CONFLICT (judgment_id, paragraph_index)` in `paragraphs-cli.ts` binds to the
**unique** index and is unaffected.

**Provable rather than inferred, which is the whole difference** — this one is
settled by reading two definitions, and needs no argument about what some future
feature might want.

**Still not dropped in this session.** `judgment_paragraphs` is taking inserts
from NEW2's fleet right now; the drop wants a quiet window and
`DROP INDEX CONCURRENTLY`, and the planner should be re-checked against
`fillParagraphFallback`'s `judgment_id = ANY(...)` shape afterwards rather than
assumed.

`judgment_paragraphs_pkey` reads 0 scans and stays regardless: a primary key
earns its space by enforcing uniqueness, not by being scanned.

---

## 4 · WHAT CAN MOVE TO OBJECT STORAGE — the honest answer is "nothing yet"

The founder's framing was `MUST REMAIN POSTGRES` vs `CAN MOVE TO OBJECT
STORAGE`. Against this schema the second column is empty, and saying so is more
useful than finding something to put in it.

| candidate | verdict |
| --- | --- |
| `judgments.full_text` — 35 GB TOAST | **MUST REMAIN.** It is the corpus's searchable body: `judgments_full_text_idx` is built on it and `verifyClaims` reads it for every citation and every enrichment claim. R2 has no full-text index and no substring predicate. Moving it replaces one query with a network fetch per document |
| `judgments_full_text_idx` — 14 GB | **MUST REMAIN.** 16,109 scans. This is the thing being queried, not a copy of something |
| `judgment_chunks.embedding` + HNSW — 4.8 GB | **MUST REMAIN.** pgvector ANN search is the retrieval path |
| `judgment_paragraphs.paragraph_text` — 22 GB | **MUST REMAIN, per §2b.** It is `ts_rank`ed at query time on the retrieval hot path. Neither a migration target nor, as §2 first thought, a deletion target |
| source PDFs / raw HTML | **Not in Postgres at all today.** If raw artefacts are ever retained, R2 is the right home for them from the start — that is the correct use of the $0.015/GB-month tier, and it is a future decision, not a migration |

**R2 is not a Postgres replacement, and the directive already said so.** The
saving available here is redundancy elimination, which costs nothing per read
except CPU, rather than tiering, which costs a network round trip per read
forever.

---

## 5 · WHAT SHOULD HAPPEN, IN ORDER

1. ~~Verify `judgment_chunks.chunk_text` is derivable~~ — **done, the answer is
   no.** §2. The offsets describe the chunk's non-overlapping tail.
2. ~~`DROP INDEX CONCURRENTLY judgment_paragraphs_number_idx`~~ — **withdrawn,
   §3.** It is a pinpoint index built ahead of its consumer, not dead weight.
3. ~~Put the `paragraph_text` question to NEW1 and NEW2~~ — **answered, §2b.**
   It is `ts_rank`ed on the hot path. The 22 GB is not available without a
   retrieval-path redesign, which is NEW1's call and not a storage task.
4. **`DROP INDEX CONCURRENTLY judgment_paragraphs_judgment_idx`** in a quiet
   window — **−1,440 MB, provably redundant against
   `judgment_paragraphs_unique`** (§3). Re-check the planner on
   `fillParagraphFallback`'s `judgment_id = ANY(...)` shape afterwards.
5. **Do nothing about `judgments`.** 59 GB of it is the product.

**Net finding, revised: the reclaimable total is 1.4 GB, not 23 GB.** Three of
this audit's four original candidates did not survive being checked, and each
died to a different kind of evidence — a repo instrument (`chunk_text`), a
consumer grep (`paragraph_text`), and an index definition (`number_idx`). The
one that survived was found by the same read that killed the third.

**What this audit does NOT establish:** actual Railway cost, because pricing is a
founder-visible billing question and no number was invented here; whether
`judgments_case_title_trgm` (780 MB, 189 scans) and `judgments_case_number_trgm`
(258 MB, 8 scans) are cold or merely serve a rare path — a low scan count on a
search index can mean "unused" or "used by the feature nobody has shipped yet",
and RCC's surfaces decide which. Both are queued to be asked, not dropped.
