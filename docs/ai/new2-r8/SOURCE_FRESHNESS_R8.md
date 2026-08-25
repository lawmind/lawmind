# SOURCE_FRESHNESS_R8 — R8.1 §7.17

**Lane:** NEW2 · **26 August 2026**
**The corpus is 56 days behind, not 8. `max(judgment_date)` is off by a factor of seven.**

**Artifacts** — `scripts/n2-source-freshness-r8.mts` · `docs/ai/new2-r8/source-freshness-r8.json`
**Supersedes** `docs/ai/new2-r7/source-freshness.json`, which measured a different thing.

---

## 1. The number that was wrong, and the shape of the error

```
max(judgment_date)  =  2026-08-18        ->  "the corpus is 8 days behind"
```

That reading is what any freshness dashboard would print, and it is wrong by
seven times.

| month | documents | share of baseline | state |
| --- | ---: | ---: | --- |
| **2026-08** | **480** | **0.4%** | **`EFFECTIVELY_ABSENT`** |
| 2026-07 | 93,340 | 79.5% | `COMPLETE_ENOUGH` |
| 2026-06 | 70,694 | 60.3% | `COMPLETE_ENOUGH` |
| 2026-05 | 100,182 | 85.4% | `COMPLETE_ENOUGH` |
| 2026-04 | 142,926 | 121.8% | `COMPLETE_ENOUGH` |
| 2026-03 | 123,263 | 105.0% | `COMPLETE_ENOUGH` |

Baseline **117,332 documents/month**, from six settled months.

**August 2026 holds 480 judgments where a month normally holds 117,332.** Those
480 give the month a newest date, and a `max()` cannot tell the difference
between a month that is present and a month that has a single row in it.

```
honest currency frontier   2026-07-01
real lag                   56 days
naive lag                   8 days
```

**Every currency claim must use 56, not 8.** An advocate searching for August
authority will find 0.4% of it and nothing on the surface says so.

This is the same failure family as `id watermark cannot see new rows` and
`document_vector_staging is empty legacy`: an aggregate that is technically
correct about a population that is not there.

---

## 2. Why the fix is a ratio and not a bigger `max`

Currency is measured as a **completeness ratio against a trailing baseline of
settled months**, never as a newest-date.

- baseline = mean documents/month over 6 settled months, **skipping the two most
  recent** — a baseline that includes the partial month it is judging lowers
  itself toward exactly what it is meant to catch;
- `>= 60%` of baseline → `COMPLETE_ENOUGH`;
- `10–60%` → `PARTIAL`;
- `< 10%` → `EFFECTIVELY_ABSENT`, whatever its newest row says.

---

## 3. The confounder, stated before anyone else finds it

**Indian courts take a summer vacation**, roughly mid-May to early July. So the
May→June decline (100,182 → 70,694) is at least partly real judicial calendar,
not an ingest gap. July rising back to 93,340 after June's 70,694 breaks any
monotonic "our frontier is decaying" story and supports the seasonal reading.

**This does not rescue August.** Courts sit in August, and 0.4% of baseline is
two orders of magnitude below anything a vacation explains. The 56-day frontier
stands.

But the thresholds themselves are **this lane's choice and are not validated
against a court publication calendar**. A month flagged `PARTIAL` may be a real
vacation, a real gap, or both. Recorded as `NOT_MEASURED` rather than smoothed —
acquiring the sitting calendars would convert this from a heuristic into a
measurement, and that is a real follow-on task.

---

## 4. What §7.17 asked for, and what is actually there

| required field | state |
| --- | --- |
| authorization state | **present** — per source, from the founder record, with expiry |
| holdings count | **present** — carried from R7 |
| newest legal date | **present**, and now with the completeness that makes it meaningful |
| last successful ingest | **present** — carried from R7 |
| ingest lag | **present** — both the naive and the honest figure |
| parser version/hash | **present** — SHA-256 of the adapter file, not a description |
| failure/refusal state | **present** — R7's ingest failure ledger |
| newest item **at source** | **`NOT_MEASURED`** — needs a listing fetch per adapter |
| listing fingerprint | **`NOT_MEASURED`** — designed, not implemented |
| last drift probe | **`NOT_MEASURED`** — follows the fingerprint |

### Parser hash replaces parser signature, and the reason matters

R7 recorded `parser_signature` as a human-readable string like
`parquet -> judgments(source_url LIKE %indian-high-court-judgments%)`. **That
string does not change when the parser changes.** A freshness record carrying it
vouches for code it has never seen. The R8 row carries a SHA-256 of the adapter
file instead, so a parser rewrite invalidates the freshness claim automatically
rather than by anyone remembering to.

### Authorization is a founder record, not a probe

Each row carries its authorization state, basis and expiry from `CLAUDE.md` §6a.
Per R8.1 §9.9, **authorization ≠ holdings ≠ freshness**, and a missing
operational condition does not reopen a settled authorization. eCourts is
`AUTHORIZED` with an expiry of January 2029 and has **zero observations** — that
is a freshness fact, not an authorization question.

---

## 5. eCourts is the only source that can fix this

```
ecourts_observation rows    0
```

The AWS Open Data buckets are periodic bulk dumps; they cannot make the corpus
current between refreshes, and treating their quiet periods as staleness is a
category error. **eCourts is the only adapter that can produce law newer than
the last bulk drop, and it has never run.**

The 56-day frontier is therefore not a bug in any adapter. It is the expected
behaviour of a corpus fed only by bulk dumps, and it will keep growing until
eCourts ingest starts.

---

## 6. What this forbids being said

| claim | state |
| --- | --- |
| "the corpus is 8 days behind" | **`FALSE`** — 480 documents made a month look present |
| "up to date" / "current law" without qualification | **`HOLD`** — 56 days, and growing |
| "we have August 2026 judgments" | **technically true, materially false** — 0.4% |
| "the corpus is 56 days behind" | **`PASS_AT_MEASURED_SCOPE`** — on this lane's unvalidated thresholds |

---

## 7. State

| item | state |
| --- | --- |
| August 2026 at 0.4% of baseline | **`PROVEN`** |
| naive vs honest lag, 8 vs 56 days | **`PROVEN`** |
| completeness-ratio method | **`PASS_AT_MEASURED_SCOPE`** — thresholds unvalidated |
| summer-vacation confounder on May/June | **`UNKNOWN`** — plausible, unmeasured, does not affect August |
| parser hash per adapter | **`PROVEN`** |
| authorization per source | **carried from the founder record**, not re-probed |
| eCourts never ingested | **`PROVEN`** — 0 observations |
| newest item at source | **`NOT_MEASURED`** |
| court sitting calendars | **`NOT_MEASURED`** — would upgrade the method from heuristic to measurement |
