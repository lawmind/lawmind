# CASE_TITLE_SEARCH_CONTRACT_V1

**NEW1 · 23 Aug 2026 · measured against stable HEAD after LCC's pin-all fix**
Evidence: `case-title-battery.json`, `case-title-battery.stdout.log`,
`pnpm --filter @lawmind/harness title:battery`, frozen gold `ba9357cba2fbf297`, n=229.

---

## 1. THE HEADLINE, SPLIT BEFORE IT IS STATED

A pooled case-title number averages a lookup that is now perfect with a question
that has no single right answer. It is reported and it is **not** the gate.

| population                    |   n | s@1         | s@5         | candidate coverage | p50    | p95     | timeouts | degraded |
| ----------------------------- | --: | ----------- | ----------- | ------------------ | ------ | ------- | -------: | -------: |
| **unique title** (1 judgment) | 155 | **100.00%** | **100.00%** | **100.00%**        | 408 ms | ~1.2 s  |    **0** |    **0** |
| **duplicated title** (2–200)  |  74 | 54.05%      | **86.49%**  | 86.49%             | 397 ms | ~1.6 s  |    **0** |    **0** |
| pooled (never the gate)       | 229 | 85.15%      | 95.63%      | 95.63%             | ~400ms | ~1.3 s  |        0 |        0 |

### Against the pre-fix baseline, same frozen gold, same instrument

| metric                    | before      | after       | change              |
| ------------------------- | ----------- | ----------- | ------------------- |
| unique-title s@1          | 94.2%       | **100.00%** | +5.8 pt, no misses  |
| duplicated-title s@1      | 12.2%       | **54.05%**  | **4.4×**            |
| duplicated-title s@5      | 20.3%       | **86.49%**  | **4.3×**            |
| pooled s@1                | 67.69%      | 85.15%      | +17.5 pt            |
| **timeouts**              | **9**       | **0**       | eliminated          |
| **wrong pins**            | **65**      | **0**\*     | eliminated          |
| p50 latency               | 1,608 ms    | ~400 ms     | **4×faster**        |
| **p95 latency**           | **19,196ms**| **~1.3 s**  | **~15× faster**     |

\* No row in the battery has a wrong pin at rank 1 with the gold absent from the
page: `candidate coverage == s@5` in every family, so nothing is being displaced
by a confident wrong answer. The 10 remaining misses are set-size failures, below.

**LCC's claim is confirmed and its latency figure is not.** Unique-title is
15/15 → **155/155 at rank 1**, far broader than the bounded verification. The
~9 ms was the SQL probe; the full in-process `/search` request — validation,
qlang, `answerStructured`, pins, hydration — measures **p50 408 ms**. Both
numbers are true about different things. The product number is 408 ms.

---

## 2. FAMILY BREAKDOWN, EARLIEST-CAUSE-WINS

| family              |   n | s@1     | s@5     | coverage | ambiguity correct | p50    |
| ------------------- | --: | ------- | ------- | -------- | ----------------- | ------ |
| UNIQUE_TITLE        |  85 | 100.00% | 100.00% | 100.00%  | n/a               | 416 ms |
| AND_OTHERS          |  98 | 84.69%  | 95.92%  | 95.92%   | 68.97%            | 379 ms |
| DUPLICATED_TITLE    |  43 | 58.14%  | 86.05%  | 86.05%   | 81.40%            | 420 ms |
| MULTI_ORDER         |   2 | 50.00%  | 100.00% | 100.00%  | 50.00%            | 772 ms |
| SECTION_LOOKING     |   1 | 100.00% | 100.00% | 100.00%  | n/a               | 286 ms |

Flag cross-tab (a row may carry several flags; primary family is earliest-wins):

| flag             |   n | s@1     | s@5     |
| ---------------- | --: | ------- | ------- |
| UNIQUE_TITLE     | 155 | 100.00% | 100.00% |
| AND_OTHERS       |  99 | 84.85%  | 95.96%  |
| DUPLICATED_TITLE |  64 | 50.00%  | 84.38%  |
| MULTI_ORDER      |  10 | 80.00%  | 100.00% |
| SECTION_LOOKING  |   1 | 100.00% | 100.00% |

### The two routing hijacks are fixed

- **STRUCTURED_HIJACK (` AND `)** — previously 9 rows, 5 losing gold entirely.
  Now **99 rows carry the flag** (the battery flags every ` AND `, a superset of
  what previously hijacked) and they score **s@5 95.96%**. The qlang boolean no
  longer returns before the title pin.
- **SECTION_HIJACK** — 1 row, now rank 1.

### THREE FAMILIES THE PROMPT ASKED FOR ARE NOT TESTABLE ON THIS GOLD

`NORMALIZED_VARIANT`, `MISSPELLING` and `V_VS_VERSUS` matched **zero rows**.
Every gold query in this set normalises byte-for-byte onto its stored title, so
this battery says **nothing** about an advocate who types
`Garware Nylons v Pimpri Chinchwad` against a stored
`M/S GARWARE NYLONS LTD. versus PIMPRI CHINCHWAD MAHANAGAR PALIKA AND ORS.`

That is a gap in the gold, not a pass. ADVOCATE-100 carries a `misspelling`
class (5 tasks); it is the only current instrument for those families and it is
reported separately. **Do not read 100% unique-title s@1 as covering
misspellings — it does not.**

---

## 3. WHAT IS LEFT, AND IT IS ONE THING

**All 10 remaining misses are titles held by 16–200 judgments.**
Twin counts of the misses: 16, 17, 22, 40, 46, 88, 164, 200, 200, 200.

Ambiguity outcomes over all 74 duplicated-title rows:

| verdict           |   n | meaning                                                        |
| ----------------- | --: | -------------------------------------------------------------- |
| AMBIGUITY_CORRECT |  56 | the page is filled with the ambiguous set; gold is on it        |
| AMBIGUITY_PARTIAL |   8 | gold on the page, but the page is not filled with the set       |
| AMBIGUITY_LOST    |  10 | gold absent — every one a set of 16+                            |

Observed twin-count distribution: 155 unique · 27 pairs · 13 triples · … · one
set of 88, one of 164, **three of 200** (the query cap — the true sets are larger).

**This is not a ranking defect and must not be fixed with a ranking change.** A
five-slot page cannot represent a 200-judgment set, and no ordering makes it
able to. It is a product-shape question and it belongs to `PAGINATION_RANKING_CONTRACT.md`.

---

## 4. THE CONTRACT

### 4.1 Definitions

- **Unique title** — exactly one judgment holds the normalised title.
- **Duplicated title** — 2+ judgments hold it with **different case numbers**:
  different matters.
- **Multi-order** — 2+ judgments hold it under **one case number**: one matter,
  several orders. A different product answer, never pooled with the above.

### 4.2 Required behaviour

1. **Unique title → rank 1, always.** Measured 155/155. This is a regression
   gate: any drop is a defect, not a tuning question.
2. **Duplicated title → do NOT demand rank 1.** The correct behaviour is useful
   disambiguation: the page is filled with the ambiguous set, ordered
   `judgment_date DESC, id DESC`, and the choice is the advocate's.
   `AMBIGUITY_CORRECT` is the metric; arbitrary rank-1 is luck and is not scored.
3. **Sets larger than the page must say so.** A title held by 200 judgments must
   render a count and a route to the rest. Silence here reads as "we found your
   case" when we found two hundred of them. **This is the single open product
   gap and the only cause of every remaining miss.**
4. **Ordering is total** — `judgment_date DESC, id DESC`. Without `id` two
   identical requests can return two different pages and pagination cannot
   re-execute.
5. **Multi-order sets** render as one matter with its order history, not as
   several unrelated results.

### 4.3 Regression gates (measured, not aspirational)

| gate                                | value  | basis                    |
| ----------------------------------- | ------ | ------------------------ |
| unique-title s@1                    | 100%   | 155/155, no tolerance    |
| duplicated-title candidate coverage | ≥ 86%  | 64/74 today              |
| ambiguity correct (sets ≤ 5)        | 100%   | fails only on sets > 5   |
| timeouts                            | 0      | was 9                    |
| degraded responses                  | 0      | was "every response"     |
| p95 latency                         | < 2 s  | 1.3 s today, was 19.2 s  |

### 4.4 Explicitly NOT covered by these numbers

- misspellings, normalised variants, and V/VS/VERSUS — **untested**, no gold
- Hindi/Devanagari titles — not present in this gold
- title queries beyond the 500-char request cap — rejected before retrieval

---

## 5. THREE-DIMENSION SUMMARY

- **QUALITY** — unique 100.00% s@1; duplicated 86.49% s@5, 75.7% ambiguity-correct.
- **SAFETY/COVERAGE** — 0 wrong pins displacing gold, 0 degraded responses.
  Coverage equals s@5 in every family: nothing is silently dropped. Three surface-
  form families are unmeasured and are declared, not assumed.
- **LATENCY** — p50 ~400 ms, p95 ~1.3 s, max 1.6 s, **0 timeouts**.
  Previously p95 19,196 ms with 9 timeouts.

**Verdict: case-title search is launch-quality for unique titles and for
ambiguous sets that fit a page. The one unfinished piece is how a set of 200
renders, and that is a product decision, not a retrieval one.**
