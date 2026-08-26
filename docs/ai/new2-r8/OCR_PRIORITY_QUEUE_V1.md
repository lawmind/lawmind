# OCR_PRIORITY_QUEUE_V1 — R8.1 §7.8

**Lane:** NEW2 · **26 August 2026** · **No OCR was run. This is the queue.**
**Headline: the release-critical OCR bill is about 0.2 hours, not 22,105.**

**Artifacts** — `scripts/n2-ocr-priority-queue.mts` · `docs/ai/new2-r8/ocr-priority-queue.json`

---

## 1. The queue

Damaged population: **1,792,321** documents. A document lands in the first tier
it qualifies for, so this is a strict ranking rather than overlapping sets.

| tier | documents | est. OCR hours | cumulative |
| --- | ---: | ---: | ---: |
| **1 `GOLD_TARGET`** | **14** | **0.2** | 0.2 |
| **2 `HIGHLY_CITED`** | **0** | **0** | 0.2 |
| **3 `CURRENTNESS_BLOCKER`** | **0** | **0** | 0.2 |
| 4 `RECENT_HIGH_VALUE` | 164,004 | 2,022.7 | 2,022.9 |
| 5 `RELEASE_BLOCKED_OTHER` | 1,628,303 | 20,082.4 | 22,105.3 |

**Everything §7.8 calls release-critical is 14 documents and about twelve
minutes of GPU time.** The 22,105-hour figure is the whole damaged corpus, which
§7.8 and §10 both put in continuing moat, not in the launch path.

---

## 2. Two zero tiers, attacked before being believed

Tiers 2 and 3 came back **empty**, and a zero next to a 9.6% corpus damage rate
is exactly the shape R8.1 §9.3 says to attack. Under independence, ~673 of the
7,018 highly-cited authorities should have been damaged.

Re-tested by a separate query rather than trusting the tier logic:

```
highly_cited  damaged  clean(SCREENED_NO_DAMAGE_FOUND)  no_evidence_row
        7018        0                             7018                0
```

**The zero is real. It is not a bug in the ranking.** And it has a mechanism:

| court | share of highly-cited | damage rate |
| --- | ---: | ---: |
| **Supreme Court of India** | **6,970 of 7,018 (99.3%)** | **0.00%** of 38,342 |
| Allahabad High Court | 17 | 0.35% of 2,276,082 |
| High Court of Rajasthan | 2 | 4.87% of 1,095,169 |
| Delhi / Karnataka / P&H / HP / Chhattisgarh | 25 combined | — |

**Citation resolution reaches almost nothing but the Supreme Court, and the
Supreme Court corpus has no measured damage at all.** The two facts multiply to
an exact zero.

`CURRENTNESS_BLOCKER` is empty for a smaller reason: only ~76 judgments in the
corpus carry a non-`none` `overruled_status` at all, and none of them is damaged.

---

## 3. What the zero actually tells us, and what it does not

**It does not mean the corpus is fine.** It means the damage and the citation
graph live in different parts of the corpus:

- the **Supreme Court** is 0.2% of documents, is where 99.3% of resolved
  citations land, and is undamaged;
- the **High Courts** are 99.8% of documents, carry essentially all the damage,
  and are almost invisible to citation resolution — Madras 258 of 1.7M, Patna 1
  of 1.7M in the R7 gap queue.

So OCR does not unblock the authorities advocates currently land on. **It
unblocks the authorities they cannot land on yet**, which is a coverage
argument, not a readability one — and it belongs in the moat, exactly where §10
puts it.

### The caveat that bounds this whole result

**`SCREENED_NO_DAMAGE_FOUND` is not "clean".** It means a named screen ran and
did not convict. NEW2's own measurement is that the English-density screen
**missed 32 of 43 glyph dumps** whose signature footer lifts the English rate,
and that `text_quality >= 0.85` certifies documents that are pure garbage.

So "0 of 7,018 highly-cited are damaged" is bounded by that screen's
sensitivity. A Supreme Court damage rate of **exactly 0.00% over 38,342
documents** is consistent with a digitally typeset reporter PDF and is also
exactly what an insensitive screen would report. **`NOT_MEASURED`: nobody has
hand-checked a sample of SC documents the screen cleared.** That check is cheap
and it should happen before anyone leans on this zero.

---

## 4. The connection to §7.9 that nobody has priced

**The reason the Supreme Court corpus is clean is that it is the SCR reporter
edition** — R7 measured 35,570 of 38,342 carrying the reporter running head.

So the cleanest, most-cited, most-retrievable part of the corpus is precisely
the part that:

- carries **licensing exposure** (`EBC v. D.B. Modak`: a reporter's copy-edited
  version is protected even though the judgment is not), and
- carries **reporter apparatus** — headnotes, editorial numbering, margin
  letters — which §7.9 and G4 say must never masquerade as court reasoning.

Its readability and its legal risk have the same cause. That is a founder-level
tradeoff rather than an engineering one, and it is already in
`FOUNDER_QUEUE.md` as the SCR retention/training policy item.

---

## 5. Method

| | |
| --- | --- |
| why OCR at all | NEW2's R7 probe recovered **20 of 20** damaged documents by OCR against **0 of 20** by re-extraction |
| throughput | 3.7 s/page, measured in that probe |
| pages/judgment | **12, an ASSUMPTION** carried from the probe, not a corpus measurement — every hour figure moves linearly with it |
| highly-cited floor | ≥ 5 inbound **resolved** citations |
| Gold targets | train + dev only |

**The Gold HOLDOUT split was deliberately not read.** Knowing which documents
the hidden set points at is knowing something about the hidden set, and this
lane hands that file to FIFTH unseen. Damaged holdout targets fall to a lower
tier by design — a little ranking quality traded for the only clean measurement
anyone has left.

**`SCREENED_DAMAGED` and `PROVEN_DAMAGED` are kept separate throughout.** They
are different strengths of evidence and pooling them into one "damaged" number
would be the same error as calling `SCREENED_NO_DAMAGE_FOUND` clean.

---

## 6. A corpus-state change since R7 worth recording

The body-text screen has **run corpus-wide** since R7's START_STATE:

| | R7 (25 Aug) | now |
| --- | ---: | ---: |
| `NEVER_SCREENED` | 16,906,647 | **16** |
| `SCREENED_NO_DAMAGE_FOUND` | 1,322,722 | 16,906,647 |
| `SCREENED_DAMAGED` | — | 1,322,722 |
| `PROVEN_DAMAGED` | 469,599 | 469,599 |

**`NEVER_SCREENED` is exactly 16** — the same count as the synthetic `Test
Court` fixtures in `FIXTURE_PURITY_MANIFEST_V1`. An independent cross-check,
arrived at from a completely different direction, that the fixture manifest is
the complete set.

---

## 7. State

| item | state |
| --- | --- |
| release-critical OCR is 14 documents | **`PROVEN`** at the tiering definition |
| `HIGHLY_CITED` damaged = 0 | **`PROVEN`** — re-tested by an independent query |
| mechanism: 99.3% of highly-cited are SC, SC damage 0.00% | **`PROVEN`** |
| SC damage really being zero | **`NOT_MEASURED`** — bounded by screen sensitivity; no hand check exists |
| damaged population 1,792,321 | **`PROVEN`** |
| hour estimates | **`PARTIAL`** — linear in an unmeasured 12 pages/judgment |
| `NEVER_SCREENED` = 16 = the fixture set | **`PROVEN`** — independent corroboration |
| OCR actually run | **none.** Zero documents processed. |
