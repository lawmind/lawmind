# CORAM_RECOVERY_V1 — R8.1 §7.14

**Lane:** NEW2 · **26 August 2026**
**The bench is in the text of 83.9% of High Court judgments. `judgments.bench` is populated on 0.000% of them. This is extraction work, not acquisition.**

**Artifacts** — `scripts/n2-coram-recovery-probe.mts` · `docs/ai/new2-r8/coram-recovery-probe.json`

---

## 1. Current coverage

| | documents | `bench` populated |
| --- | ---: | ---: |
| Supreme Court | 38,342 | **38,326 (99.958%)** |
| **High Courts** | **18,660,642** | **0 (0.000%)** |

`judgment_judges` holds 44,360 rows over 38,325 judgments — all Supreme Court.
**Not one High Court judgment in the corpus has a named bench.**

---

## 2. The question §7.14 asks, and the answer

*Can coram be recovered from primary text at high precision?* Ten largest High
Courts, 80 randomised documents each, first 2,500 characters:

| court | bench signal present | naive pattern recovers |
| --- | ---: | ---: |
| Allahabad | **100.0%** | 33.8% |
| High Court of Kerala | **100.0%** | **0.0%** |
| Telangana | **98.8%** | **0.0%** |
| Patna | **95.0%** | **0.0%** |
| Bombay | **87.5%** | **0.0%** |
| Orissa | 85.0% | 8.8% |
| Rajasthan | 80.0% | 1.3% |
| Karnataka | 70.0% | **68.8%** |
| Madras | 68.8% | 22.5% |
| Punjab & Haryana | 53.8% | **0.0%** |
| **overall** | **83.9%** | **13.5%** |

**The gap between those two columns is engineering, not data.**

---

## 3. The zero that was not a zero

The probe's first run reported **0.0% for Bombay, Kerala and Punjab & Haryana**
and nothing else. Read alone, that says the bench is absent from three of India's
largest High Courts.

It is not. Checking the underlying text directly:

```
Bombay             872 of 976 heads (89.3%) contain CORAM
Kerala             586 of 587 heads (99.8%) contain HONOURABLE and JUSTICE
Punjab & Haryana   349 of 858 CORAM, 356 of 858 JUSTICE
```

**A zero here is two populations** — the signal missing, and my pattern missing
it — and nothing in the first output separated them. The probe now measures
signal presence in its own column, so the two can never be confused again.

This is the same failure family as `unclassified is two populations` and
`UNKNOWN is not BAD in SQL either`: an absence that means "we did not look
properly" reported identically to an absence that means "it is not there".

---

## 4. What the numbers actually say

- **The information exists.** 83.9% of High Court judgments carry an explicit
  `CORAM` label or a judicial honorific in their first 2,500 characters.
- **One regex set will not do it.** Karnataka is the only court where generic
  patterns approach the signal (68.8% against 70.0%). Everywhere else they
  collapse. **Coram extraction is court-format-specific**, and each registry's
  header is effectively its own dialect:

  ```
  Madras      CORAM / THE HONOURABLE MR.JUSTICE M.SUNDAR / and / THE HONOURABLE MRS.JUSTICE …
  Allahabad   Hon'ble Rajesh Singh Chauhan,J.
  Bombay      P.H. Jayani  901 APEAL749.2019 WITH APEAL1196.2024.doc   ← stenographer line first
  Kerala      W.P.(C) No. 6680/2023 : 1 :                              ← case number first
  ```

- **The 16.1% with no signal is `UNKNOWN`, not "no bench".** Some will be
  damaged text, some will be orders whose header the extractor lost. Nothing
  here distinguishes those.

---

## 5. What is deliberately not proposed

- **No bindingness classifier.** §7.14 forbids one and nothing here implies one.
  A bench size is an input to a hierarchy question; it is not the answer, and
  R7's `AUTHORITY_HIERARCHY_INPUT_LEDGER_V1` remains the position of record.
- **No writes.** `judgments.bench` is untouched. This probe measures whether a
  backfill is feasible; it is not the backfill.
- **Precision is `NOT_MEASURED`.** These are recall figures against a vocabulary
  signal. Nothing is hand-adjudicated, and **a wrong judge name is worse than no
  judge name** — it is exactly the detail an advocate would repeat in court. Any
  real backfill needs a hand-adjudicated sample per court before it writes a row.
- **The 13.5% is not a proposed method.** It is a floor that demonstrates naive
  patterns are inadequate.

---

## 6. What a real recovery would take

1. **Per-court header grammars**, not one pattern set. Ten courts cover the bulk
   of the corpus, and each needs its own — a day's work per court, roughly.
2. **A hand-adjudicated sample per court** before any write, with the precision
   recorded next to the rule that produced it.
3. **Provenance stored with the value** — §7.14 requires it: which rule, which
   version, which source text span, and whether a later official/eCourts
   metadata source confirmed it.
4. **`UNKNOWN` stays `UNKNOWN`.** The 16.1% with no signal, and every document a
   court's grammar does not match, gets no bench rather than a guessed one.

That is a bounded, court-by-court moat task with no external dependency. It is
not release-critical — nothing in G0–G7 requires coram — and §10 already places
coram enrichment in continuing moat.

---

## 7. State

| item | state |
| --- | --- |
| High Court `bench` coverage is 0.000% | **`PROVEN`** — 0 of 18,660,642 |
| Supreme Court `bench` coverage 99.958% | **`PROVEN`** |
| bench signal present in HC text | **`PASS_AT_MEASURED_SCOPE`** — 83.9%, 800 documents, 10 courts |
| naive pattern recall | **`PASS_AT_MEASURED_SCOPE`** — 13.5%, and it is a floor |
| the three 0.0% courts have the signal | **`PROVEN`** — Bombay 89.3%, Kerala 99.8% |
| coram extraction is court-format-specific | **`PROVEN`** — Karnataka 68.8/70.0 against Kerala 0.0/100.0 |
| extraction precision | **`NOT_MEASURED`** — no hand adjudication, and it gates any write |
| the 16.1% with no signal | **`UNKNOWN`** — not "no bench" |
| bindingness | **not proposed.** §7.14 forbids it. |
