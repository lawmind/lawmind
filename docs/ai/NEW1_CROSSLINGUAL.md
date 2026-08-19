# NEW1 — CROSS-LINGUAL RETRIEVAL: HINDI QUESTION, ENGLISH JUDGMENT

**Owner: NEW1.** Run 19 August 2026. P9 closed.
Tool: `pnpm --filter @lawmind/harness crosslingual`
(`services/harness/src/crosslingual-cli.ts`).
Artifacts: `docs/ai/new1-crosslingual/crosslingual-dense.{json,log}`.

**This is not OCR work.** Every gold judgment here is Supreme Court, English full
text, from the same population the CONTROLLED baseline measures. The only thing
that changes between a pair is the language of the QUESTION. Devanagari
extraction quality is a separate problem in a separate lane and mixing the two
would make both unmeasurable.

---

## THE RESULT

Five Hindi queries from `queries.hand.json`, each a hand-authored restatement of
an issue already in the eval set, paired with the English original that shares
its gold judgment. Dense arm, top 20.

| | n | success@5 | recall@20 |
| --- | --- | --- | --- |
| **Hindi** | 5 | **40.0%** | **60.0%** |
| English | 5 | 20.0% | 40.0% |

Per pair, gold's rank:

| pair | Hindi | English |
| --- | --- | --- |
| e39b2b83 | **1** | 6 |
| 187694cc | **6** | not found |
| a259ece9 | not found | not found |
| bcc47cbd | 4 | **2** |
| 6f885356 | not found | not found |

**What is settled: BGE-M3 retrieves English judgments from Hindi questions.** The
cross-lingual path works, it needs no separate index, no translation step, and no
Hindi-specific embedding population. That was the question P9 asked and it is
answered.

**What is NOT settled: nothing about which language is better.** n = 5. Two pairs
fail in both languages, and one query flipping would move success@5 by 20 points.

---

## THE MORE INTERESTING READING, AND IT IS NOT ABOUT LANGUAGE

Hindi out-scoring English 2:1 on the same gold judgments is almost certainly not
a language effect. The two sides are not the same KIND of text:

- the **Hindi** queries are hand-authored restatements of the legal issue — clean,
  focused, one question;
- the **English** queries are raw citing passages cut from a later judgment, which
  carry procedural furniture, party names, cross-references and whatever else sat
  in the 2,400-character window.

So the comparison as run is *"a clean issue statement versus a real passage"*,
and the clean issue statement won. **INFER, not KNOW** — it was not the
experiment's design and the sample cannot support it. But if it holds, it points
at something worth more than a language finding: the retrieval quality ceiling on
the CONTROLLED benchmark may be partly a property of how its queries were built,
not of the retriever.

That is testable and cheap: author English restatements of the same five issues
and run all three arms. It is not run here, and until it is, the 21.9%
dense success@5 baseline should be read as *"on citing-passage queries"*.

---

## WHY THIS RAN DENSE-ONLY, AND THE 1,994-SECOND QUERY

The first attempt used the production `hybrid` mode and had to be cancelled: a
single Hindi query's SPARSE arm ran for **1,994 seconds** against the 18.1M-row
`judgments` table before `pg_cancel_backend` stopped it, with `wait_event`
`IO/DataFileRead` throughout on a box also carrying NEW2's 25-process ingest
fleet.

For a Hindi query the sparse arm cannot contribute anything by construction:
`to_tsquery('english', <Devanagari>)` yields terms the English corpus does not
contain, `sparse()` returns almost nothing, and the OR-relaxed `sparseAny()` path
then ranks by `ts_rank` across the whole table. It costs everything and finds
nothing.

`CROSSLINGUAL_MODE` was added (default unchanged, `hybrid`) so the measurement
can be made. Dense-only, all ten queries complete in about **60 seconds**.

The latency observation itself was reported to LCC (bus 0771) with the two things
that make it more than a contention story: `packages/db/src/index.ts` creates the
API's client with **no `statement_timeout`**, and `lexeme_document_frequency` was
sampled when the corpus was 2.5x smaller.

---

## LIMITS

- n = 5 pairs. Every figure above is descriptive, none is a test.
- Dense arm only. The production hybrid path is not measured here for Hindi, and
  on the evidence above it would be measuring the sparse arm's ability to find
  nothing, slowly.
- Both languages are scored against the same 620,300-chunk index, so the coverage
  ceiling in `NEW1_COVERAGE_STATE_CONTRACT.md` applies to both equally — this
  compares languages, not universes.
