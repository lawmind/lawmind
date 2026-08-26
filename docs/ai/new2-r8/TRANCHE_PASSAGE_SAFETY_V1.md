# TRANCHE_PASSAGE_SAFETY_V1 — R8.1 §7.7

**Lane:** NEW2 · **26 August 2026**
**State: `PARTIAL`. The pool half is measured on the real tranche. The top-k half — the half §7.7 actually asks for — waits on `HEAVY_BOX`.**

**Artifacts** — `scripts/n2-tranche-passage-safety.mts` · `docs/ai/new2-r8/tranche-passage-safety.json`

---

## 1. What changed from R7

`PASSAGE_SAFETY_ROLE_SAMPLE_V1` ran on a **substitute frame** — paragraphs of
documents carrying a staged document vector — because NEW1's tranche was blocked
at the time. This runs on `new1_tranche_passages`, the real thing.

| | R7 (substitute frame) | **R8 (actual tranche)** |
| --- | ---: | ---: |
| `OTHER_UNKNOWN` | 74.49% | **51.32%** |
| `PARTY_SUBMISSION` | 11.26% | **19.38%** |
| `CASE_HEADER` | 6.81% | **15.47%** |
| `DAMAGED_OR_OCR_SUSPECT` | 0.65% | **0.70%** |
| `REPORTER_EDITORIAL` | 0.11% | **1.57%** |

The substitute frame **understated every unsafe class**. `PARTY_SUBMISSION`
nearly doubled and `REPORTER_EDITORIAL` went up more than tenfold. A frame
chosen for availability is not a frame chosen for representativeness, and the
gap is the size of the error that would have been carried into a gate.

---

## 2. The pool result

Tranche at measurement: **416,600 passages over 81,200 documents** (NEW1's
frozen manifest is 81,510, so ~99.6% built). Deterministic md5 draw, **4,000
passages**.

| role | n | share | |
| --- | ---: | ---: | --- |
| `OTHER_UNKNOWN` | 2,053 | 51.32% | UNKNOWN, never SAFE |
| `PARTY_SUBMISSION` | 775 | **19.38%** | **UNSAFE** |
| `CASE_HEADER` | 619 | 15.47% | |
| `HOLDING_OPERATIVE` | 192 | 4.80% | |
| `SPAN_UNVERIFIABLE` | 106 | 2.65% | **UNSAFE** |
| `PROCEDURAL_HISTORY` | 77 | 1.93% | |
| `REPORTER_EDITORIAL` | 63 | 1.57% | **UNSAFE** |
| `COURT_REASONING` | 46 | 1.15% | |
| `FACTS` | 37 | 0.92% | |
| `DAMAGED_OR_OCR_SUSPECT` | 28 | 0.70% | **UNSAFE** |
| `QUOTED_PRECEDENT` | 4 | 0.10% | **UNSAFE** |

**24.40% of tranche passages must never be shown as the court's own reasoning.**

| | unsafe / n | rate |
| --- | ---: | ---: |
| Supreme Court | 105 / 635 | **16.54%** |
| High Courts | 871 / 3,365 | **25.88%** |

The split is real and it runs the direction the corpus's provenance predicts:
High Court text carries more counsel submission and more reporter apparatus.
§7.7 asks for SC separately from HC precisely because a pooled number hides it.

**`COURT_REASONING` is 1.15%.** Only about one passage in ninety is
first-person judicial reasoning by these rules. That is a statement about the
lexical rules as much as about the corpus, and it is why the rules' precision is
recorded below as `NOT_MEASURED`.

---

## 3. Independent corroboration of NEW1's span defect

`SPAN_UNVERIFIABLE` = **2.65%** here.
NEW1 reported (bus 1224) that **97.05%** of tranche passages carry a verified
span — a **2.95%** loss.

Two lanes, two code paths, two methods, 0.30 points apart. NEW1's number came
from their own slice-and-compare during the build; this one came from re-slicing
`judgments.full_text` afterwards. **The defect is confirmed from outside the
system that produced it.**

---

## 4. A column-meaning error of mine, and the number it produced

My first run reported **`SPAN_UNVERIFIABLE` at 25.22%** — nine times NEW1's
figure — and it was entirely my mistake.

`new1_tranche_passages` carries both `text_chars` and `body_length`, and they are
not the same thing:

```
char_offset  text_chars  body_length  full_len  slice_len
0            2390        2390         2807      2390     <- interior chunk: equal
2391          658         416         2807       416     <- last chunk: differ by 242
6739         1749        1507         8246      1507     <- last chunk: differ by 242
```

`body_length` is the span's length **in `full_text`**. `text_chars` is the length
of the chunk's **own** text, which the chunker built by joining paragraphs with a
canonical blank-line separator that was never in the source. On a document's last
chunk they diverge by hundreds of characters.

Slicing and comparing against `text_chars` **measures the join, not the span**.
It produced a clean, confident 25.22% that would have contradicted NEW1 and sent
someone hunting a defect that is not there.

**This is the third time in this session that assuming a column's meaning
produced a confident wrong number** — after matching raw citations against a
normalised `citation_key`, and after a hand-rolled despatch predicate that
under-counted by 98 rows. The common shape: nothing errors, the query succeeds,
and the answer is about a different question. What caught this one was that it
disagreed with another lane's independent measurement — not any internal check.

---

## 5. Why this is `PARTIAL` and not done

§7.7 says: *"Measure **top-k**, not only pool base rate."*

This is the pool base rate. It is the number the study could produce without the
index, and it is **not the number that decides safety**.

A pool can be 51% unknown and still be safe if retrieval never surfaces those
passages. It can be 19% party submission and be dangerous if that 19% is what
ranks first — counsel submissions read like confident legal propositions, which
is exactly what an embedding model rewards.

**The top-k half needs the completed tranche and the rebuilt HNSW.** The harness
has the mode built (`--topk`) and it refuses to run without
`--i-hold-heavy-box`. NEW1 holds the lease and is at ~99.6%.

**Prediction, recorded before the measurement so it can be wrong:** top-k will
carry *more* `PARTY_SUBMISSION` than the 19.38% pool rate, not less.

---

## 6. What is deliberately not claimed

- **`OTHER_UNKNOWN` is UNKNOWN, never SAFE.** 51.32% of the tranche has no role
  verdict. It is not evidence of safety and must not be netted against the
  unsafe share.
- **`SPAN_UNVERIFIABLE` is not a role.** It is a passage whose words cannot be
  located in the source. It is reported separately so it can never be averaged
  into a safety rate as though someone had read it.
- **The rules are lexical and their precision is `NOT_MEASURED`.** They were
  carried from R7 unchanged so the two studies compare. Nobody has
  hand-adjudicated a sample of their output, so the 24.40% is a rate produced by
  these rules, not a rate of unsafe passages. Hand adjudication is FIFTH's §9.7,
  and it should not be this lane marking its own homework.

---

## 7. State

| item | state |
| --- | --- |
| runs on the exact tranche, not a substitute | **`PROVEN`** |
| pool role distribution | **`PASS_AT_MEASURED_SCOPE`** — 4,000 of 416,600, deterministic |
| unsafe-as-court-reasoning share | **`PASS_AT_MEASURED_SCOPE`** — 24.40% by these rules |
| SC vs HC split | **`PROVEN`** at sample scope — 16.54% vs 25.88% |
| span defect corroborated independently | **`PROVEN`** — 2.65% against NEW1's 2.95% |
| substitute frame understated unsafe classes | **`PROVEN`** |
| **top-k role distribution** | **`NOT_MEASURED`** — the half §7.7 asks for; blocked on `HEAVY_BOX` |
| lexical rule precision | **`NOT_MEASURED`** — needs hand adjudication, FIFTH's §9.7 |
| role/damage wired to the evidence contract | **`NOT_MEASURED`** — LCC §8.6 |
