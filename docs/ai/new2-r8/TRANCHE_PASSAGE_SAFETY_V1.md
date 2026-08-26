# TRANCHE_PASSAGE_SAFETY_V1 — R8.1 §7.7

**Lane:** NEW2 · **26 August 2026** · **updated after `HEAVY_BOX` release**
**State: `COMPLETE`. Top-k is measured, my recorded prediction was WRONG, and what replaced it is worse.**

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

## 5. TOP-K — the half that decides safety, and my prediction was wrong

20 common Indian legal queries — bail, anticipatory bail, quashing, limitation,
writ maintainability, s.138, s.125, dying declaration, and the rest — embedded on
the same model and run against the rebuilt HNSW. k=10, **200 retrieved passages**.

**Prediction recorded before the run:** *top-k will carry MORE
`PARTY_SUBMISSION` than the 19.38% pool rate.*

**It carries less. The prediction is refuted.**

| role | top-k | pool | delta | |
| --- | ---: | ---: | ---: | --- |
| `OTHER_UNKNOWN` | 66.00% | 50.63% | +15.38 | |
| `HOLDING_OPERATIVE` | 11.00% | 5.00% | +6.00 | |
| **`REPORTER_EDITORIAL`** | **10.00%** | **1.68%** | **+8.32** | **UNSAFE — 6× enriched** |
| `PARTY_SUBMISSION` | 8.50% | 19.75% | **−11.25** | UNSAFE |
| `COURT_REASONING` | 2.50% | 1.13% | +1.38 | |
| `SPAN_UNVERIFIABLE` | 1.00% | 2.65% | −1.65 | UNSAFE |
| `DAMAGED_OR_OCR_SUSPECT` | 0.50% | 0.65% | −0.15 | UNSAFE |
| `CASE_HEADER` | 0.50% | 15.53% | −15.03 | |

```
top-k unsafe-as-court-reasoning   40/200 = 20.00%   (pool 24.85%)
top-k span unverifiable            2/200 =  1.00%   (pool  2.65%)
```

### What was actually wrong with the prediction

I reasoned that counsel submissions *read like confident legal propositions*, so
an embedding model would reward them. The mechanism is right; **I attached it to
the wrong class.**

**A headnote is a confident legal proposition. That is what a headnote IS** — a
reporter's editor distilling the holding into exactly the sentence a legal query
is looking for. So retrieval enriches `REPORTER_EDITORIAL` **six-fold**, while
counsel submissions — which are hedged, party-specific and procedural — are
*de*-enriched.

`CASE_HEADER` collapsing from 15.53% to 0.50% is the same effect from the other
side: captions match nothing semantic.

### Why this is the round's sharpest result

`REPORTER_APPARATUS_V1` measured reporter furniture in **93.2%** of Supreme
Court documents. `OCR_PRIORITY_QUEUE_V1` found the SC is **99.3%** of
highly-cited authorities. `TREATMENT_NULL_VERIFICATION_V1` found **96.2%** of
LAW MOVED edges already rest on reporter annotation.

This closes the loop: **the retrieval layer independently concentrates the one
class G4 says must never masquerade as court reasoning.** It is not a corpus
accident that can be diluted by adding documents — it is a ranking preference,
and adding more SCR text makes it stronger.

**Overall unsafe went slightly DOWN (24.85% → 20.00%) while the composition got
more dangerous.** A single headline rate would have reported an improvement.

### What it obliges

1. **Role must be on the evidence wire before generation ships** — LCC §8.6.
   One retrieved passage in ten is reporter editorial.
2. **`REPORTER_EDITORIAL` must be attributed at render**, not filtered. §12.6
   already says reporter evidence is attributed; this says how often it arrives.
3. **`COURT_REASONING` is 2.50% of top-k.** One retrieved passage in forty is
   first-person judicial reasoning. Any product surface implying "here is what
   the court said" is describing 2.5% of what it was handed.

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
| **top-k role distribution** | **`PROVEN`** — 20 queries, k=10, 200 passages |
| my recorded prediction | **`REFUTED`** — party submission fell 11.25 points |
| `REPORTER_EDITORIAL` 6× enrichment in top-k | **`PROVEN`** — 1.68% pool to 10.00% top-k |
| top-k measured on 20 queries only | **`PARTIAL`** — a wider query set could move it |
| lexical rule precision | **`NOT_MEASURED`** — needs hand adjudication, FIFTH's §9.7 |
| role/damage wired to the evidence contract | **`NOT_MEASURED`** — LCC §8.6 |
