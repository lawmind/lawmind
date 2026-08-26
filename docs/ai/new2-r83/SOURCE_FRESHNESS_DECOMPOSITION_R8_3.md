# SOURCE_FRESHNESS_DECOMPOSITION_R8_3 — R8.3 §11 N2-2

**Lane:** NEW2 · **26 August 2026**
**The upstream High Court bucket was written TODAY and holds decisions from yesterday. Our ingest is the stale side, and my R8.1 explanation for the gap was wrong.**

**Artifacts** — `scripts/n2-source-freshness-decomposition.mts` ·
`docs/ai/new2-r83/source-freshness-decomposition.json`
**Supersedes** `docs/ai/new2-r8/SOURCE_FRESHNESS_R8.md`, which measured only the
local half and inferred the other.

---

## 1. The question, and the answer

§11 asks it plainly: *is LawMind stale because local ingestion stopped, because
the upstream bulk source is stale, or both?*

| adapter | verdict |
| --- | --- |
| `aws_open_data_hc` | **`LOCAL_INGEST_BEHIND`** — upstream is publishing current law and we are not reading it |
| `aws_open_data_sc` | **`BOTH`** — upstream has not written in 11 days AND we are behind what it does hold |
| `indiacode_statutes` | **`ADAPTER_BROKEN`** — the host it targets no longer exists (§4) |
| `ecourts` | **`NEVER_RUN`** — 0 observations, so there is no lag to measure |

**The two adapters have different answers, and a single corpus-wide "56 days
behind" hid that.**

---

## 2. High Court — the upstream side, measured rather than assumed

```
2026 parquet objects            56
newest upstream WRITE           2026-08-26T12:30:27Z   0 days ago
objects written in last 7 days  42 of 56
newest upstream DECISION        2026-08-25             yesterday
```

Three benches opened directly, and August is a normal month upstream:

| bench | Jan | Feb | Mar | Apr | May | Jun | Jul | **Aug** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ukhcucis_pg` | 955 | 1,210 | 1,128 | 1,558 | 1,405 | 1,286 | 1,738 | **1,214** |
| `calcutta_original_side` | 426 | 514 | 319 | 384 | 889 | 303 | 441 | **285** |
| `calcutta_circuit_bench_at_port_blair` | 63 | 229 | 119 | 104 | 5 | 65 | 126 | **48** |

```
upstream August, share of its own baseline    64.0%
local    August, share of its own baseline     0.4%
```

**Upstream has the month. We do not.**

### My R8.1 explanation is falsified

R8.1 said, as an inference and labelled as one:

> The AWS Open Data buckets are periodic bulk dumps; they cannot make the corpus
> current between refreshes, and treating their quiet periods as staleness is a
> category error. eCourts is the only adapter that can produce law newer than the
> last bulk drop.

**That is wrong for the High Court bucket.** 42 of its 56 current-year objects
were rewritten within seven days and the newest was written today. It is not a
periodic dump with quiet periods; it is close to a daily feed. The remedy I
implied — that only eCourts could fix currency — pointed at the wrong work.

This is why §11 says *no remedy before cause*. The inference was plausible,
internally consistent, and would have sent this lane to build a live-court bridge
in order to fix an ingest that had simply stopped running.

---

## 3. Supreme Court — the opposite verdict, from the same probe

```
2026 parquet objects            1
newest upstream WRITE           2026-08-15T16:48:53Z   11 days ago
newest upstream DECISION        2026-08-04
rows in the whole 2026 file     208
```

Upstream 2026 by month: Jan 43 · Feb 38 · Mar 27 · Apr 35 · May 29 · Jun 19 ·
Jul 15 · **Aug 2**.

**208 rows for two-thirds of a year is not the Supreme Court's output.** The
Court delivers that in a fortnight. So the Supreme Court partition is materially
incomplete AT SOURCE, and that is a different problem from the High Court one:
no amount of local ingest fixes it.

Local for the same adapter: 38,342 held, newest decision **2026-07-09**, last
ingest 15 days ago. We are behind even the thin thing upstream has.

**This is the case that justifies N2-3's recency bridge, and the High Court case
is not.**

---

## 4. `indiacode_statutes` — the adapter targets a host that no longer exists

Found while re-testing the CrPC verdict (see `CRPC_1973_SOURCE_CORRECTION_R8_3.md`).

```
https://www.indiacode.nic.in/                 200 — a site-migration page,
                                              meta-refresh to https://indiacode.gov.in
https://www.indiacode.nic.in/handle/123456789/15272   404
https://www.indiacode.nic.in/handle/123456789/2263    404
https://www.indiacode.nic.in/handle/123456789/20062   404   <- BNS, in our own code
```

`services/ingest/src/indiacode.ts` builds every URL from
`INDIA_CODE = 'https://www.indiacode.nic.in'`, and
`REPEALED_CRIMINAL_CODE_HANDLES` in `statutes.ts` still carries three handles on
that host. **The statute ingest cannot fetch anything at all today.** The 846
Acts we hold were ingested while the old platform was up.

This is recorded here rather than fixed, because the fix is an adapter rewrite
against DSpace 7 and R8.3 §11 N2-10 puts broad source work after the limited
freeze. What matters for the freeze is that the freshness record must not carry
`indiacode_statutes` as a working adapter.

---

## 5. Court × month completeness — the field §11 names

26 courts × 8 months of 2026, each court measured against **its own** settled
months. A corpus-wide baseline would mark every small High Court incomplete for
being small.

**25 of 26 courts are `EFFECTIVELY_ABSENT` for 2026-08.**

| court | baseline/mo | 26-06 | 26-07 | **26-08** |
| --- | ---: | ---: | ---: | ---: |
| Allahabad | 24,283 | 5,489 | 54 | **22** |
| Madras | 15,112 | 20,494 | 18,043 | **62** |
| Bombay | 14,530 | 2,742 | 56 | **1** |
| Punjab and Haryana | 10,847 | 1,463 | 13,153 | **48** |
| Patna | 8,186 | 5,225 | 9,061 | **6** |
| Karnataka | 6,167 | 7,848 | 6,374 | **6** |
| Orissa | 5,663 | 3,514 | 7,779 | **92** |
| Calcutta | 4,964 | 4,276 | 6,611 | **36** |

The per-court view says something the corpus-wide number could not: **the
frontier is ragged, not flat.** Allahabad and Bombay fell off in JULY, not
August; Madras, Punjab and Haryana, Patna, Karnataka and Orissa were still full
in July and stopped in August. Those are different stop dates, so this is not one
switch being thrown — it is a walk that ran out per scope, which is the failure
shape `row growth hides a dead scope` describes.

---

## 6. Two reader defects found while measuring, both of which produced clean wrong answers

**The two buckets store `decision_date` differently.** High Court files hold
`YYYY-MM-DD`; the Supreme Court file holds `DD-MM-YYYY`. An ISO-only reader
returned NULL for all 208 Supreme Court rows and printed *"newest decision
null"* — an absence manufactured entirely by the reader.

Worse: string-comparing `DD-MM-YYYY` sorts by DAY. It ranked `25-05-2026` above
`04-08-2026` and would have reported the Supreme Court's newest decision as
25 May when it is 4 August.

**And my own first verdict rule compared frontiers, not completeness.** It
returned `CURRENT` for the High Court adapter on a 7-day gap between two
`max()` values — while August held 480 documents against a 117,332 baseline. 480
recent documents put the frontier within a week and leave 99.6% of the month
missing. That is the same trap R8.1 identified and I then walked into from the
other side: **a max cannot see an empty month, and neither can a gap computed
from two maxes.** The rule now compares each side's latest month against its own
trailing baseline.

---

## 7. State

| item | state |
| --- | --- |
| High Court upstream writes daily; newest decision 2026-08-25 | **`PROVEN`** — S3 LastModified + three parquet files opened |
| High Court verdict `LOCAL_INGEST_BEHIND` | **`PROVEN`** — 64.0% upstream vs 0.4% local for the same month |
| R8.1's "bulk dumps cannot make us current" | **`FALSIFIED`** for the HC bucket |
| Supreme Court 2026 partition is thin at source (208 rows) | **`PROVEN`**, though *why* is `NOT_MEASURED` |
| `indiacode_statutes` adapter points at a dead host | **`PROVEN`** — 404 on every handle including our own BNS handle |
| 25 of 26 courts `EFFECTIVELY_ABSENT` in 2026-08 | **`PROVEN`** |
| ragged per-court stop dates | **`OBSERVED`** — cause not investigated here |
| upstream row counts for all 56 benches | **`NOT_MEASURED`** — 3 opened, chosen as the most recently written |
| court publication calendars | **`NOT_MEASURED`** — a `PARTIAL` month may still be a real vacation |
| why the local walk stopped | **`NOT_MEASURED`** — this file measures the gap, not the fleet |
