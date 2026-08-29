# NEW2_R10_DATA_ROUND — the corpus is at parity, `permanent` never meant what the matrix divided by, and the citation graph's ceiling is the Supreme Court

**Round:** R10, data acquisition and deterministic intelligence. Founder-directed.
**Lane:** NEW2. **Leases:** none taken — HEAVY_BOX stayed with NEW1 throughout and
MIGRATION_SLOT with LCC. Nothing here needed either.
**Evidence:** every number below is a file in this directory.

---

## 0. The headline numbers

| what | number |
| --- | ---: |
| upstream unique High Court records, measured from the bucket | **18,945,988** |
| of those, **actually held** | **18,713,965 — 98.775%** |
| of those, **accounted** (held + proven source-unavailable) | **99.943%** |
| objects upstream, present, and not held — **ours** | **10,744** |
| objects never attempted, in the entire corpus | **0** |
| upstream rows read to get there | 20,293,975 across 1,438 partitions, 0 errors |
| Supreme Court judgments recovered this round | **1** — the last real one |
| unresolved citation edges | 6,046,161 |
| of a clean 50,000 tranche, resolving to exactly one held judgment | **42.51%** |
| independent adjudications of those pins that were contradicted | **0 of 500** |
| recall misses found in the refusals | **0 of 500** |
| **share of the not-held class that is Supreme Court citations** | **99.5%** |

Two of those are the round. **`accounted_upstream` fell from 99.963% to 99.943%
because I found my own matrix dividing by the wrong column**, and **the citation
graph's ceiling is Supreme Court acquisition, not resolver tuning.**

---

## 1. High Court AWS parity

### 1.1 The upstream side was read, not inferred

`scripts/n2-hc-upstream-walk.mts` opens every metadata partition in the bucket and
reads three columns — `decision_date`, `pdf_link`, `cnr` — for every row of every
partition of every year. **1,438 partitions, 20,293,975 rows, zero errors.**
Nothing sampled, nothing carried over from a census.

Identity is `pdfUrlFor(partition, basename(pdf_link))`, reproduced from
`harvest/hc-metadata.ts`, because that is the exact string that lands in
`judgments.source_url` and `hc_ingest_ledger.source_url`. Reproducing ingest's own
construction is what makes this a set difference rather than a comparison of two
similar-looking numbers.

`bench=testcase` is excluded. Reads are bounded windows over each file's own
`num_rows` — an unbounded read here has already returned the right row count and
the wrong rows with no error.

### 1.2 A defect in my own aggregation, caught by arithmetic

The first parity run reported `held 18,753,276` against a corpus holding
**18,712,922** High Court rows. More matches than there are rows to match, which
is impossible, and it is the only reason the defect was caught.

The two parquet variants of a partition describe the same objects and **do not
always agree on `decision_date`**. Deduping inside a court-month counted one
object once per month it was dated in. Dedup is now per COURT, with each object
resolved to the earliest month any upstream row assigns it. **40,634 objects had
rows that disagreed** — published rather than smoothed away.

### 1.3 `permanent = true` was never a claim about the source

This is the finding that changes the headline.

`ingest-ledger.ts` sets `permanent` when a **retryable** failure exhausts
`MAX_ATTEMPTS = 3`. Its header says so: *"retrying is pure waste."* That is a
statement about our download budget. The first version of the parity matrix
divided by it anyway and published `accounted_upstream 99.963%`.

I measured rather than argued. `scripts/n2-terminal-reverify.mts` re-probes the
ledger's marks against the live bucket, **per court and per outcome**, with a
bounded GET and a **magic-byte** verdict — this bucket serves soft 404s, 200 with
`Content-Type: application/pdf` and an HTML error page in the body, so a HEAD
cannot see it.

| stratum | population | sampled | live real PDF today |
| --- | ---: | ---: | ---: |
| `pdf_absent` Madhya Pradesh | 42,695 | 120 | **0** |
| `pdf_absent` Allahabad | 22,403 | 120 | **0** |
| `pdf_absent` Rajasthan | 351 | 120 | **0** |
| `pdf_absent` Bombay | 149,529 | 120 | **1** |
| `no_text`, every court, permanent and open | 10,308 | **410** | **410** |
| `pdf_failed`, permanent and open, all courts | 810 | 599 | **595** |

Every `pdf_absent` stratum is confirmed. **Every `no_text` object is a live PDF.**
`scripts/n2-no-text-diagnose.mts` then opened 185 of them with the same `unpdf`
the loader uses: **185 of 185 IMAGE_ONLY** — 316 KB to 1.6 MB of scan with a
zero-character text layer, mean 1.4 to 29.3 pages, and **zero extraction
defects**.

So the 3,709 `no_text` rows marked permanent are an OCR backlog filed under the
publisher's name, and the founder's rule applies exactly as written: a failure
clustering by court, object, parser or source pattern is a defect to diagnose,
never a cluster to terminalise. **9,919 of the 10,308 are one court** — Punjab and
Haryana. Diagnosed: they are scans. Not a pipeline defect, and not the source's
absence either.

**I did not touch LCC's ledger.** The flag means what its header says; the defect
was mine. The matrix now splits by what the OUTCOME claims:

| class | outcomes | closes accounting? |
| --- | --- | --- |
| SOURCE_UNAVAILABLE | `pdf_absent`, `no_title`, `no_decision_date`, `unparseable_date`, `no_pdf_link`, `test_fixture_bench` | **yes** |
| RETRY_EXHAUSTED | `no_text`, `pdf_failed`, `pdf_timeout`, `pdf_unavailable`, `pdf_missing` — permanent or not | **no. Ours.** |

Recorded in `docs/SCHEMA_TRUTH.md` §hc_ingest_ledger so the next lane to divide by
that column does not repeat it.

### 1.4 The three courts the founder named

| court | upstream | held | actually_held | source-unavailable | accounted_upstream |
| --- | ---: | ---: | ---: | ---: | ---: |
| Allahabad (9_13) | 2,298,496 | 2,276,089 | **99.03%** | 22,403 | **100%** |
| Bombay (27_1) | 2,147,357 | 1,997,763 | **93.03%** | 149,515 | **99.996%** |
| Tripura (16_20) | 33,872 | 33,871 | **99.997%** | 0 | 99.997% |

Allahabad's and Bombay's deficits are **entirely objects the publisher named and
never uploaded**, confirmed by probe. Tripura's deficit was **one file**.

### 1.5 The never-attempted class is now empty, and closing it took one file

At the start of the round exactly **one** object in 18.9 million had never been
attempted: `TRHC010015072016_1_2017-11-17.pdf`, Tripura, 2017-11.

I reset that partition's checkpoint, re-walked it (2,510 already held, 1 unheld),
and fetched it: **200, `%PDF-1.5`, 23,998 bytes — and `unpdf` returns
`Invalid PDF structure`.** The publisher supplied a malformed file. It is now in
the ledger as `pdf_failed`, attempts 1, and the final matrix reports
**neverAttempted 0** across every court and every month.

That is a third class the ledger cannot express: neither source-absent nor ours.
One row, so no schema change is proposed; it is recorded in `SCHEMA_TRUTH.md` so
the next `pdf_failed` that fetches fine is not a mystery.

### 1.5b Two arms of the factory were not wired, and one was mine

LCC measured the overnight cycle's 1,334 judgments against every named consumer
(bus 1446): exact/lexical, citation extraction, paragraphs and citation keys were
all **exactly at the ingest frontier**. Two were at zero.

**Statute-reference extraction was mine, and it had never been wired.**
`judgment_statute_refs` had no new row in sixteen days. The cause was the CLI's
shape rather than a stalled worker: `sections-cli` had only `--resume`, which
skips documents that already carry a ref and therefore still walks the 95.7% that
do not — the whole corpus, every run. **Nothing that shape can live in a daily
cycle, so nobody put it in one, and the arm quietly stopped being part of the
factory.**

Added `--since <iso>`, bounding on `created_at` — when WE ingested — rather than
`judgment_date`, which is when the court decided. A 1974 judgment ingested this
morning is delta work; a judgment decided this morning that we ingested last week
is not.

Proved against LCC's own number before applying: `--since 2026-08-29T04:00:00Z`
scans **1,334** judgments, their overnight cycle to the row. Then applied over 48
hours: **53,640 judgments scanned, 37,440 references written across 17,767
judgments**, and `judgment_statute_refs` moved **862,594 → 900,034** with its
newest row now 2026-08-29 05:42.

It is step three of the daily cycle now, beside the risk replay, with a **36-hour**
window rather than 24 — a skipped or failed cycle must not leave a permanent hole,
and the re-scan is an idempotent upsert on
`(judgment_id, act_named, section_number)`. **Extraction only**: linking a
reference to a `statutes` row is the separate HEAVY_BOX-gated apply and is
deliberately not in the cycle. Link coverage stands at 703,768 of 900,034 —
**78.19%** — and the newly extracted refs are unlinked by design.

### 1.5c A crash I diagnosed that had not happened

Recorded because the mistake is more instructive than the fix would have been.

Checking on the final parity run, I found its registered pid gone and the
artifact's directory listing still showing the previous day's timestamp, with the
log's last line a normal per-court progress line. I concluded it had **exited
silently after folding all 25 courts** — no output, empty stderr, no artifact —
and rewrote the script to drop a per-object metadata map I believed had killed it.

**It had not crashed.** It finished normally and wrote
`parity-matrix.json` at 09:44 local, `takenAt 2026-08-29T05:35:52.680Z`, carrying
the post-rename `retryExhausted` schema that only the new code emits. I had read
a stale listing taken before that write landed, on a process that had already
exited cleanly.

Two things made a healthy finish look like a death, and both are worth keeping:

- **The registered pid was a shim** (§1.5d), so "gone" told me nothing about the
  worker either way.
- **A long job's last log line looks identical whether it is working, hung, or
  dead.** The correct check was the artifact's own `takenAt` — a value the job
  writes about itself — not the file's mtime and not the process table.

The memory change survives on its own merits: the first pass now holds only
`Map<hash, monthCode>` and the gap list is rebuilt in a bounded second pass over
the same local gzip files, which does not run at all for a court with no
residual. It was not needed, and it is still the better shape at 19M objects.

### 1.6 The daily worker, and why the registry could not see it

**Two independent defects, and the second is the interesting one.**

1. **No registry line.** The task was created with `schtasks /Create` and nothing
   ever wrote `.agents/jobs/registry.jsonl`. FIFTH's view enumerates the registry.
2. **The discovery could not have found it either.** `job-health.mjs` listed
   scheduled tasks with `TaskName -match 'awmind'`. The task is
   `\Lawmind\new2-daily-delta` — its Lawmind identity is in the **TaskPath**,
   because `Register-ScheduledTask` at the root path needs elevation and
   `schtasks /Create` into a subfolder does not. **Every future unelevated
   registration lands the same way.**

Both fixed: the filter matches `TaskPath` and carries `fullName`,
`classifyCadence` matches either form, and the job is registered as a `cadence`
job with a receipts file.

**One observed unattended cycle:** triggered through the scheduler at 06:06:45,
ended 06:12:32, exit ok, and a receipt written to
`.agents/ops/n2-daily-delta-receipts.jsonl` carrying the manifest and ledger
numbers **read back off disk**, not narrated. The cycle also now runs the resolver
risk replay — see §4.

Its previous run at **05:23:56 returned 0x800710E0**, "the operator or
administrator has refused the request". I first filed that as undiagnosable —
the operational log is disabled and enabling it needs elevation — and then
**reproduced the mechanism without it**: the task's `MultipleInstances` is
`IgnoreNew`, and starting it at 09:51:38 while the 09:50:25 instance was still
running returned exactly 0x800710E0, with two `powershell.exe` children of the
earlier run still in the process table.

So the code means *"an instance is already running"*, which is the correct
behaviour — the alternative is two cycles ingesting the same delta. I can
reproduce the mechanism; I cannot prove it caused the 05:23 refusal specifically,
and `FQ-N2-R10-1` is downgraded to a diagnostic convenience rather than a
blocker. What I could fix without elevation is fixed:
`StartWhenAvailable` is now True, so a missed daily run catches up instead of
vanishing. That was the logon-launcher failure mode reincarnated, and it is the
same reasoning that let the fleet sit dead from 19 to 27 August.

**Also fixed:** `n2-upstream-manifest.mts` counted all 56 `bench=testcase` fixture
partitions as NEW for ever and put their 71 MB in `bytesWaiting` for ever, so the
delta trigger's headline could never reach zero and "NEW 56" meant "nothing to do"
on every cycle. They now have their own FIXTURE class — counted and listed, never
dropped.

---

## 2. Supreme Court

### 2.1 The partition-year URL defect is real, and it is fixed without moving identity

`sci.ts` said, in a comment: *"The bucket serves the PDF under both years, so both
URLs resolve."* **False.** Two HEAD requests:

```
year=2009/english/2009_9_810_820_EN.pdf   404
year=2006/english/2009_9_810_820_EN.pdf   200, 403,918 bytes
```

`sourceUrlFor` keys off `row.year`, and the object is published only under the
partition it was listed in. One real judgment was unreachable.

**`sourceUrlFor` is unchanged.** Rewriting it would rewrite `source_url` for
38,352 stored rows to fix one document. What was wrong was never the identity: it
was using identity as the RETRIEVAL address. Those are now two functions, and
`fetchUrlCandidatesFor(row, partitionYear)` appends the partition URL as a
fallback **only** when the row's year and the partition disagree, and **only**
after the identity URL has actually failed.

Recovered: **STATE OF PUNJAB versus SOHAN SINGH**, decided 2006-05-15, 19,473
characters, native text. Stored under its identity URL, fetched from the partition
URL. `inserted=1 updated=0 failed=0`.

### 2.2 The other three are upstream soft-404s, proven per artifact

| object | bytes | body |
| --- | ---: | --- |
| `S_1996_2_866_868_EN.pdf` | 199 | `<title>403 Forbidden</title>` |
| `1998_1_937_947_EN.pdf` | 129 | `Welcome User Search Page not Found here` |
| `1998_1_948_960_EN.pdf` | 129 | same |

All three serve **200** with `Content-Type: application/pdf`. Two different
upstream error surfaces, so this is not one cluster with one cause. Terminal, per
artifact.

### 2.3 The written SC permission is not on file, so R9's refusal stands

No `sci.gov.in` grant exists in the repo. Every official SCI discovery surface is
CAPTCHA-gated and the eCourts grant's CAPTCHA permission is a field on **that**
grant, scoped to `services/api/src/court/ecourts.ts` and to bulk cause-list
harvesting. Stretching it here is the widening `CLAUDE.md` §6 forbids. **Nothing
was attempted against sci.gov.in this round.** The transcription module is ready
to be written the moment the letter exists — `authorisation.ts` is the pattern and
`FQ-N2-R9-2` is the open item.

---

## 3. eCourts — one line, as instructed

**All three required runtime inputs are absent, so no canary ran and no substitute
was improvised.**

| required input | state |
| --- | --- |
| `ECOURTS_GRANT_ATTRIBUTION` in the runtime env | **ABSENT** |
| `platform_config.ecourts_harvest` kill switch flipped with a reason | **OFF**, untouched since 2026-08-07T10:14:37Z |
| the founder's `users` row | **ABSENT** — 390 rows, every non-fixture one anonymised to `erased+<uuid>@invalid` |

The refusal path is proven rather than assumed. `ecourts_fetch_ledger` holds **92
rows and every one is a refusal**: 72 `kill_switch_off` between 9 and 26 August,
20 `attribution_not_on_file` on 27 August. **Zero requests have ever left this
machine.** The guard is non-vacuous by its own ledger.

Queued as `FQ-N2-R9-1` (the two environment variables) and `FQ-N2-R10-2` (the
founder's `users` row, which was not previously written down anywhere).

---

## 4. The citation graph

### 4.1 A defect in the measuring instrument, first

`resolver-dryrun-cli.ts` drew its tranche with `cited_judgment_id IS NULL` and no
sentinel exclusion. **3,658 of the first 5,000 rows it returned were sentinels** —
16,123,211 of them share that predicate against 6,046,161 real unresolved edges.
Roughly three of every four references it carried into `resolveBatch` were the
empty string. `SCHEMA_TRUTH.md` §judgment_citations warns about that exact
predicate in those exact words.

The published rates survived it — they divide by `formed`, and an empty string
forms no key — but `refused%` was meaningless and the tranche was 73% waste.
Fixed.

### 4.2 The tranche, drawn clean

50,000 real unresolved edges. `ORDER BY id` over a v4 uuid primary key is random
with respect to content, which is worth stating rather than assuming.

| state | n | rate |
| --- | ---: | ---: |
| UNIQUE | 21,252 | 42.51% |
| AMBIGUOUS | 2,939 | 5.88% |
| TARGET_NOT_HELD | 25,799 | 51.61% |
| REFUSED | 10 | 0.02% |
| UNIQUE_UNCONFIRMED_STALE_INDEX | **0** | — |

**11,542 rows/sec · 86.6 ms per 1,000 · 0 model calls · 0 tokens.** Label
LOCAL_CONTENDED, 12 active queries, because my own upstream walk was on the box.

### 4.3 The independent precision sample, positives AND negatives

Independent of `judgment_citation_keys`, which is the only evidence the resolver
consulted.

**Positives — 500 UNIQUE pins:**

| check | CONSISTENT | CONTRADICTED | UNTESTABLE |
| --- | ---: | ---: | ---: |
| chronology — `judgment_date` on both ends | 500 | **0** | 0 |
| year in the citation string vs the candidate's decision year | 500 | **0** | 0 |
| neutral-citation court token vs `judgments.court` | 148 | **0** | 352 |

The year check carries a ±4 tolerance and **never needed it**: the gap histogram
is `{0: 441, 1: 59}`. Every pin lands within one year of its candidate. That is
the difference between a check that passed and a check that did work.

**Negatives — 500 TARGET_NOT_HELD / REFUSED**, re-asked through the live
expression indexes on `judgments.neutral_citation` and `reporter_citations`
rather than the materialised key table: **500 CONFIRMED_NOT_HELD, 0 recall
misses.** Non-vacuity control: 25 keys from judgments we hold → 118 judgments
found, so the probe can fire.

**And a shape check on the pins.** No UNIQUE pin has a key shorter than 8
characters — the degenerate-short-key false-pin mechanism is absent from this
tranche entirely. Candidate provenance: **12,881 alias, 8,223 neutral, 148
reporter.**

### 4.4 51.61% not-held is not a resolver problem — it is the round's real finding

**99.5% of the TARGET_NOT_HELD class is Supreme Court citations.** 25,661 of
25,799 match an SC reporter or neutral form: `(2004) 11 SCC 26`,
`AIR 1981 SC 1861`, `(2008) 3 SCC 44`. We hold **38,352** Supreme Court judgments.

**The ceiling on citation-graph coverage is Supreme Court corpus acquisition, not
resolver tuning.** The remaining 0.5% — 138 rows — are High Court neutral
citations and are the only part of that class worth pointing an extraction
falsifier at.

That connects directly back to §2: the AWS SC drop is materially incomplete at
source and every official discovery surface is CAPTCHA-gated. **The single highest
-leverage unblock in this repo is a written SC permission.**

### 4.5 The expansion job, and the gate it refuses to skip

`scripts/n2-citation-expand.mts`, registered as `new2-citation-expand`.
Resumable, durable per-row journal, refuses to resume across a resolver version
change because the decisions would not be comparable.

The scan cursor is `judgment_citations.id`, a random v4 uuid. That is a fine
cursor for sweeping a snapshot and a **terrible** frontier for catching new work —
a row inserted after the sweep passed a given id lands below the cursor at random
and is never seen. So the run records `sweepStartedAt` and rows created after it
are a separate catch-up selection on `created_at`, never something the watermark
is trusted to reach.

`--apply` re-derives the gate at run time rather than remembering it: key
freshness must be CURRENT, the risk replay must be WRITE mode over a non-empty
truth set with `false_unique_rate === 0`, and `--confirm` must be passed. **Proven
to refuse in both directions** — on a missing `--confirm`, and on a missing
risk-replay artifact.

**The full sweep completed DECIDE-ONLY.** All **6,046,161** unresolved edges
decided in **483 seconds at 12,519 rows/sec**, 0 model calls, 0 tokens, journalled
per row:

| state | n | rate |
| --- | ---: | ---: |
| UNIQUE | **2,556,146** | 42.28% |
| AMBIGUOUS | 353,892 | 5.85% |
| TARGET_NOT_HELD | 3,135,296 | 51.86% |
| REFUSED | 827 | 0.01% |

**The 50,000 tranche predicted 42.51% and the population came in at 42.28%** — the
sample was representative, which is worth stating because it is the check that
would have caught a biased draw.

Distinct resolved edges stand at **200,616** and are unchanged, because nothing was
written. Applying would resolve up to **2,556,146** rows. The resolver's own header
requires independent confirmation of safety before a corpus backfill,
`judgment_citations` is LCC's table, and that signature is not mine to forge. The
falsifiable package is with FIFTH (bus 1443) and the apply is one flag.

### 4.6 The risk replay is now in the daily cycle

LCC found (bus 1418) that the post-ingest cycle is four steps and the third had no
owner: `readKeyFreshness` compares the replay's `frontier_at` against the live key
cursor as TEXT, so **every advance of the index invalidates the replay that
vouches for it.** On a corpus that ingests daily, the resolver gate was STALE by
default and CURRENT only in the minutes after somebody ran the replay by hand.

`n2-daily-delta.ps1` now runs it between the ingest and the ledger refresh,
unconditionally — including on a cycle that ingested nothing, because the key
builder advances the cursor on its own schedule. A failure is non-fatal to the
cycle but is recorded in the receipt, so a replay that quietly stopped working is
a field rather than an absence.

---

## 5. Freshness — per source, and never one number

`docs/ai/new2-r10/source-freshness.json`. Measured 2026-08-29T05:35:52Z:

| source | latestUpstream | latestLocal | lag | completeness | unavailable |
| --- | --- | --- | ---: | ---: | ---: |
| aws_open_data_hc | 2026-08-27 | 2026-08-27 | **0 d** | **0.9674** over 12 months | 46,748 |
| aws_open_data_sc | **null — not measured, not guessed** | 2026-08-04 | null | 0.8809 | 3 |
| ecourts | null | null | null | null | 0 |

**Zero days of lag at 96.74% completeness** is the founder's point made by the
data: we hold the newest High Court judgment the publisher has, and we do not hold
3.26% of the last twelve months. Either number alone is a different and wrong
story. `courtMonthDetail` carries 296 court-month rows behind it.

The denominator is defined once, in
`n2-hc-parity-matrix.mts`, and read from its artifact — **so LCC and NEW2 cannot
drift**: distinct `pdfUrlFor(partition, basename(pdf_link))` per court, each
resolved to one month, fixtures excluded, both parquet variants counted once.

That is deliberately **not** the R9 ledger's `shareOfBaseline`, which divided by a
trailing average of our own ingest. A baseline built from our own throughput
cannot see a month where the publisher released twice as much and we took the
usual amount; it reads 1.0 and says COMPLETE_ENOUGH.

**A lag computed across two measurement times is not a lag.** The first run
published **−2 days** — the frontier artifact was from the previous morning and
the live corpus had moved past it. A negative number was the tell, and only
because it happened to go negative; the same skew the other way would have
published a plausible, wrong, flattering number in silence. `sourceLagDays` is now
null with the reason attached whenever the two sides were measured more than six
hours apart.

`unavailableSourceCount` counts objects the publisher named and never uploaded,
proven per artifact. **It closes accounting, never completeness, and is never
netted out of the ratio.** `retryExhaustedOurs` is a separate field and belongs to
us.

---

## 6. Caveats — what is unverified, assumed, or left undone

- **The precision sample's independence is partial and I will not overstate it.**
  `citationLookupKey` and `lawmind_citation_keys` reduce to the same
  `upper([A-Za-z0-9]+)`. The negative probe tests whether the MATERIALISED index
  agrees with the live corpus; it does **not** test whether the normalisation rule
  is right.
- **60.6% of the UNIQUE pins come through `judgment_citation_aliases`.** The
  adjudication tests the pin, not the alias's provenance. If anything here is
  wrong at scale, that is where.
- **352 of 500 court checks were UNTESTABLE.** A reporter series names a publisher,
  not a court, and I refused to guess one.
- **The risk replay's own note says `IN_SAMPLE`** and lists
  `CROSS_COURT_ALIAS_COLLISION` as a class it does not cover.
- **Bombay's `pdf_absent` stratum showed 1 of 120 live**, implying roughly 1,246 of
  149,529 may now be recoverable. That is an estimate from a 120-row sample, not a
  count, and the full re-probe is not run.
- **810 `pdf_failed` rows are 595-of-599 live** on probe and are recoverable by a
  re-walk. Only the Tripura scope was re-walked this round; the rest is a named,
  quantified scope list, not done work.
- **10,308 `no_text` records need OCR.** Broad OCR was out of scope by instruction.
- **The parity matrix and the corpus move under each other.** Every artifact
  carries `takenAt`; the matrix is a snapshot, not a live view.
- **`objectsWithConflictingMonths` is 40,634** and the earliest-month rule is a
  choice, not a fact. A different rule would move cells between adjacent months
  without changing any total.
- **The 64-bit hash** carries a ~1e-5 birthday collision probability over 19M
  items. Observed: 18,712,919 rows → 18,712,919 distinct hashes, zero collisions.
