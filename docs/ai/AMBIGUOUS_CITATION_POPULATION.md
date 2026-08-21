# THE AMBIGUOUS NEUTRAL-CITATION POPULATION — measured, split, and mostly not what it was called

**Owner:** LCC · **Measured:** 18 Aug 2026 against the local cluster
(`judgments` = 9,244,146 · `judgment_citation_keys` = 1,104,005).

Every number here is a query result, and each query is reproduced so it can be
re-run rather than believed. Counts move as the fleet ingests; the *shape* is the
finding.

---

## 1 · The population

A neutral citation key is **ambiguous** when one `citation_key` maps to more than
one `judgment_id`.

| | |
| --- | --- |
| ambiguous neutral keys | **45,153** |
| judgment rows involved | **132,126** |
| largest single key | **845** rows |

```sql
SELECT citation_key, count(DISTINCT judgment_id) n
  FROM judgment_citation_keys WHERE source='neutral'
 GROUP BY citation_key HAVING count(DISTINCT judgment_id) > 1;
```

---

## 2 · The split, on exact text identity

`content_hash` (sha256 of `full_text`) is **100% populated across all 132,126
members** — checked, not assumed — so the split is exact rather than sampled.

| population | test | keys | judgments |
| --- | --- | --- | --- |
| **A · one decision, many cases** | all members share ONE `content_hash` | **36,310** | **104,930** |
| **B · all members differ** | distinct hashes = member count | **8,298** | 22,466 |
| **C · mixed** | some shared, some not | **545** | 4,730 |

**A is 80.4% of keys and 79.4% of the affected rows.** This is the *common order*
shape `docs/ai/CANONICAL_IDENTITY.md` §1 already names: one DOCUMENT, many CASEs —
a court writing one text that disposes of many petitions.

> **The earlier checkpoint figure of "~8,843 true conflicts" is exactly
> B + C (8,298 + 545).** It was not wrong, but it merged two different things: 545
> of those keys contain a common-order group *and* a distinct decision, and must
> not be handled as flat conflicts.

---

## 3 · Most of B is not a conflict either

Sampling B before trusting it — the instruction was to build from measured
examples, and the examples refuse the label.

`2003:UHC:3930`, seven members, same court, same date:

```
COMMISSIONER INCOME TASX Vs M./S HUGHES SERVICE
COMMISSIONER INCOME TAX  Vs M/S  HUGHES SERVICES
COMMISSIONER INCOME TAX  Vs M/S  HUGHES SERVICES .
COMMISSIONER INCOME TAX  Vs M/S  HUGHES SERVICES LTD.
```

`2004:UHC:2054`: `COMMISSIONER OF IINCOME TAX`, `COMMISSIONER OF ONCOME TAX`,
`COMMISSONER INCOME TAX`.

These are **one decision ingested repeatedly with OCR corruption**, not two
decisions sharing a citation. `content_hash` is exact, so any character of OCR
drift splits them into "different documents" and inflates B.

Measured across all of B:

| test | keys | share of B |
| --- | --- | --- |
| normalised title collapses to ONE (OCR noise only) | **2,854** | 34.4% |
| text length ratio ≥ 0.98 — same decision, re-extracted | **1,902** | 22.9% |
| length ratio 0.90–0.98 — near-duplicate, likely same | **2,701** | 32.6% |
| length ratio 0.50–0.90 — uncertain | 1,732 | 20.9% |
| length ratio < 0.50 — **genuinely different decisions** | **1,963** | 23.7% |

**4,603 of 8,298 B keys (55.5%) hold texts within 10% of each other in length.**

The irreducible "same citation, genuinely different decision" population is on
the order of **~2,000 keys, not ~8,800**. Length ratio is a proxy and the
0.50–0.90 band is genuinely undecided — this is a bound, not a final count. The
honest statement is: **B is an upper bound inflated by extraction variance, and
at least half of it is near-duplicate.**

The earlier "5,033 keys with same court + same date + different titles = genuine
different cases" reading was **wrong for the same reason** — the differing titles
are OCR variants of one title.

---

## 4 · What the resolver does today, and why this is recall and not correctness

`services/ingest/src/resolve-cli.ts` already refuses: its `KEYED` CTE computes
`count(DISTINCT ck.judgment_id) AS targets`, and ambiguity guard #1 declines to
resolve when `targets > 1`.

**So nothing points an advocate at the wrong petition, and no harness rule is
being broken.** `docs/CITATION_HARNESS.md` §A3d.4 treats a wrong
`cited_judgment_id` as worse than no resolution, and the current behaviour is the
safe side of that.

The cost is **recall**: 36,310 keys covering 104,930 judgment rows are refused as
ambiguous when every member carries byte-identical text. Resolving any member
would return the same decision text. That is the ~80% the checkpoint described as
fixable, and it is fixable without touching the refusal that protects B.

---

## 5 · The structure to use — which already exists, and is empty

`document_duplicate_groups` / `document_duplicate_members` (migration `0036`,
transcribed in `packages/db/src/schema.ts`) is exactly the right shape and was
designed for this case — its own comment cites the Gujarat 327-matter batch
judgment. It is a GROUP rather than a pairwise edge table, and it is explicitly
non-destructive: no column can cause a `judgments` row to be merged or deleted,
so every member keeps its `cnr`, `case_number` and `source_url`.

It holds **563 groups / 1,500 members** — against 104,930 judgments in population
A. Effectively unpopulated.

**`services/ingest/src/dedup-materialize-cli.ts` is the tool that fills it, and it
has been unrunnable since the cutover** — it carried `ssl: 'require'` against a
local server with `ssl = off` and died with `ECONNRESET` before its first query.
Fixed 18 Aug (see §7). That is why the table is empty: not a missing decision, a
broken tool that failed silently in a way nobody was reading.

### The design that follows from the measurements

No new table. The resolver gains one question:

> Do all members of this ambiguous key belong to **one** exact-duplicate group?
>
> - **yes** → one decision, many cases. Resolve to the decision.
> - **no** → refuse, exactly as today.

That satisfies the acceptance criteria without inventing a `decision_group`:
individual case identities stay searchable because nothing is merged; provenance
survives because no row is rewritten; exact citations cannot return the wrong
petition because a group is only formed from byte-identical text; and true
conflicts keep refusing.

**Not implemented in this pass, deliberately.** It changes citation resolution
behaviour, which is harness-adjacent, and it should land behind its own INTENT
statement and its own measurement of the recall it recovers — not folded into an
infrastructure fix.

---

## 6 · What is still open

- **The 0.50–0.90 length band (1,732 keys) is undecided.** Length ratio is a
  proxy for similarity; it is not one. A near-duplicate layer (MinHash/LSH, which
  `CANONICAL_IDENTITY.md` §5 already reserves for Stage 3) is what actually
  settles A-versus-B for OCR-drifted members, and exact `content_hash` cannot.
- **Population C (545 keys) has no handling yet** and must not be flattened into
  either A or B.
- **Whether a decision-level resolution should return one member or the group**
  is a retrieval-shape question and belongs to NEW1.

---

## 7 · The finding that blocked all of this — 39 tools could not open the database

While reaching for `dedup-materialize-cli.ts` it turned out not to run at all.
Post-cutover the corpus is at `127.0.0.1` with `ssl = off`, and the tree held two
wrong TLS tests:

| tier | test | files | outcome |
| --- | --- | --- | --- |
| hard-coded | `ssl: 'require'` | 12 | `ECONNRESET` |
| substring | `ssl: url.includes('localhost') ? false : 'require'` | 27 | `ECONNRESET` — the URL says `127.0.0.1` |
| correct | parsed host against a local-host set | 5 | works |

**39 tools, failing before their first query.** NEW1 had already found and fixed
this in their own lane on 17 Aug (`services/harness/src/db-url.ts`), and their
`sslFor()` is the fix; it had simply never been applied outside `services/harness`.

Applied 18 Aug to 36 files across `services/ingest`, `services/api` and
`services/embed`, via a per-service copy of `sslFor()` — copied rather than
imported, on the explicit reasoning in NEW1's file that two independent
local-host lists which agree is the intended shape. Typecheck clean in all three
services; `dedup-materialize-cli.ts` now connects and runs.

**Still carrying the broken test, in lanes that are not LCC's:**
`scripts/measure-recall.mjs` and `services/harness/src/baseline-extra.local.mjs`.
