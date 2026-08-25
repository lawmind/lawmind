# LANGUAGE_TRUTH_V1 — R8.1 §7.18

**Lane:** NEW2 · **26 August 2026**
**Verdict: every Hindi claim is `HOLD`. The language column is a default, not a measurement.**

---

## 1. The language column has exactly one value

```
select language, count(*) from judgments group by language
en    18,698,984
```

**One value. Every row. 100%.** `language` is a Postgres enum on `judgments`, and
in 18.7 million documents it has never taken a second value.

That is not a corpus that happens to be English. That is a column nothing has
ever written a measurement into.

---

## 2. Devanagari is really there, and it is not stray characters

Measured on a **randomised** sample — `TABLESAMPLE SYSTEM (0.05)`, which draws
random heap pages rather than the physically-first rows a bare `LIMIT` returns:

| | |
| --- | ---: |
| documents sampled | 9,306 |
| with `full_text` | 9,306 |
| containing any Devanagari | 42 |
| **containing more than 200 Devanagari characters** | **36** |
| distinct `language` values in the sample | **1** |

**0.387% of the corpus is substantially Devanagari, 95% CI [0.280, 0.535].**

Extrapolated to 18,698,984 documents: **≈72,000 judgments, interval
[52,277, 100,053]** — and every one of them is labelled `en`.

**When Devanagari is present it dominates the document.** In an earlier bounded
sample the mean Devanagari share of a Devanagari-bearing document was **31.3%**
of all characters. These are Hindi judgments, not English judgments with a
quoted phrase.

### The distribution is the Hindi belt, which is what makes it credible

Devanagari-bearing documents in a 60,000-row sample, by court:

| court | n |
| --- | ---: |
| Allahabad High Court | 99 |
| High Court of Rajasthan | 79 |
| High Court of Chhattisgarh | 26 |
| Patna High Court | 9 |
| Bombay High Court | 8 |
| High Court of Jharkhand | 7 |
| High Court of Madhya Pradesh | 4 |
| High Court of Delhi | 3 |
| High Court of Uttarakhand | 2 |
| High Court of Karnataka | 2 |

Allahabad, Rajasthan, Chhattisgarh, Patna, MP, Jharkhand, Uttarakhand — the
states where High Court proceedings are actually conducted in Hindi. A random
artifact would not land there.

---

## 3. `native_text` is a boolean, and it contradicts `language`

I assumed `native_text` held native-language text. It does not.

```
native_text   boolean
  true    197,038  (98.5% of a 200,000-row sample)
  false       624
  NULL      2,338
```

On the randomised sample: **99.087% `true`**.

So the corpus asserts two things at once:

- **`native_text = true` on ~99%** — this document is in its native language;
- **`language = 'en'` on 100%** — that native language is English.

For ~72,000 Devanagari documents both cannot be true. Neither column was
measured; one is a default and the other is an unexamined flag, and together
they read as a confident claim about language that nobody ever made.

---

## 4. What this forbids

R8.1 §17 already bars public Hindi claims "unless current evidence supports
them". This measures why.

| claim | state |
| --- | --- |
| "LawMind searches Hindi judgments" | **`HOLD`** — no Hindi retrieval evidence set exists |
| "the corpus is English" | **`FALSE`** — ≈72,000 documents are substantially Devanagari |
| "`language` tells you a document's language" | **`FALSE`** — one value, never measured |
| "`native_text` tells you a document is in its native language" | **`UNKNOWN`** — never validated, and contradicts `language` |
| Hindi drafting (`PRODUCT_BRIEF` feature 3) | **out of scope here** — that is generation, not corpus language |

**Nothing here says Hindi retrieval is impossible.** It says no one has measured
it, and a claim cannot rest on a column whose only value is a default.

---

## 5. What a Hindi claim would need, in order

1. **A real language verdict per document**, written by a script-share
   classifier, with its own provenance column — never by overwriting
   `language`, which would silently rewrite 18.7M rows on an unvalidated method.
   States: `ENGLISH`, `DEVANAGARI_DOMINANT`, `MIXED`, `SCRIPT_UNCERTAIN`.
2. **A bounded Hindi/Devanagari retrieval set** — advocate-authored Hindi
   queries against Devanagari targets. Gold V2 contains none, and its own
   authorship problem (`GOLD_V3_LINEAGE_V1`) applies here with more force,
   because a model writing Hindi legal queries is even further from an advocate.
3. **Devanagari extraction integrity, re-verified.** `poppler` deletes
   Devanagari silently — zero defects and zero script are the same number — and
   `DEVANAGARI_EXTRACTION_DEFECTS.md` records the Kruti Dev legacy-font class in
   Rajasthan. A retrieval measurement over text the extractor mangled measures
   the extractor.
4. **Noto Sans Devanagari end to end**, including PDF export. Already mandated;
   not verified by this lane.

Step 1 is compute and is NEW2's. Step 2 needs advocates and joins Gold V3 in
`FOUNDER_QUEUE.md`. Step 3 is a re-run of an existing probe. Step 4 is RCC's.

---

## 6. Method notes, because two of them changed the answer

- **`LIMIT` is not a sample.** A first pass used `limit 20000` and got 0.305%.
  Without `ORDER BY`, that returns whatever the heap yields first, which is
  insertion-ordered and court-skewed. `TABLESAMPLE SYSTEM` gives 0.387%. The
  two are close, which is luck, not method — the first number was not entitled
  to an extrapolation and the second is.
- **A point estimate off 9,306 rows needs its interval.** 0.387% alone would
  imply 72,336 documents to five significant figures. The Wilson interval says
  [52,277, 100,053], which is the honest width.
- **`native_text` being a boolean was found by a type error**, not by reading
  the schema first. The query `native_text ~ '[ऀ-ॿ]'` failed with
  `operator does not exist: boolean ~ unknown`. Had the column been `text`, the
  regex would have run and returned a confident number about the wrong thing.

---

## 7. State

| item | state |
| --- | --- |
| `language` has exactly one value across 18.7M rows | **`PROVEN`** |
| corpus contains substantial Devanagari | **`PROVEN`** — 36 of 9,306 randomised |
| corpus-wide Devanagari share | **`PASS_AT_MEASURED_SCOPE`** — 0.387% [0.280, 0.535] |
| court distribution is the Hindi belt | **`PROVEN`** at sample scope |
| `native_text` semantics | **`UNKNOWN`** — boolean, 99% true, never validated |
| any Hindi product claim | **`HOLD`** |
| Devanagari extraction integrity on these documents | **`NOT_MEASURED`** |
| Hindi retrieval quality | **`NOT_MEASURED`** — no evidence set exists |
