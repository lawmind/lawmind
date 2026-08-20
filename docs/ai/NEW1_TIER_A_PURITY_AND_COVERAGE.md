# NEW1 — what the Tier-A embedding run is actually made of, and the hole in it

20 Aug 2026. Everything below is measured against the live database this session.
Artefacts: `docs/ai/new1-tier-a/stage-coverage.json`,
`docs/ai/new1-tier-a/purity-census.json`,
`docs/ai/new1-tier-a/stage-quarantine.json`.

---

## 1. The walk had reached batch 88 and 67 batches inside that range were empty

`stage-embed.log` holds **100 `STAGE START` lines, 29 `STAGE DONE` lines and 69
`FAILED` lines**. Counting distinct completed batch files against the database:

```
batches the walk "reached"     0..88
batches actually completed     23
batches 10..76                 ZERO vectors        ~670,000 documents
```

These are the 67 batches a dead GPU sidecar consumed in about sixty seconds on
20 Aug, each printing `START` and `END` while embedding nothing. The exit-status
bug that allowed it was fixed the same day (`PIPESTATUS`, so a failure no longer
reads as tail's exit code). **The hole it left was not fixed**, because the walk
was a RANGE and a range never goes back. Left alone it would have survived the
entire eleven-day run and surfaced only as a corpus mysteriously thin across a
third of its id space.

A batch number is not evidence of coverage. Neither is `count(*)`: 220,259 staged
rows looked perfectly healthy while two thirds of the reached range was empty.

**Fixed structurally**, not by re-running a range by hand:

- `services/harness/src/stage-coverage-census.mjs` asks, per batch file, how many
  of the ids that file names are accounted for — staged, or deliberately refused.
  It writes a `worklist` of every file that is not.
- `stage-runner.sh` walks the worklist instead of a range (`USE_COVERAGE=1`,
  default). The relaunched walk started at **batch 00010**, which is the hole.

## 2. The sidecar had no keeper and no log

The run died at 07:16Z, 800 rows into batch 88, and the GPU idled for four hours.
The runner retries a batch three times thirty seconds apart — ninety seconds of
tolerance for an eleven-day job — and nothing at all restarted the sidecar. It
also wrote no log, so the cause of that particular death is unrecoverable.

`services/harness/src/sidecar-keeper.mjs` polls `/health` every 20 s, restarts
after two consecutive misses, holds a pid lock so two keepers cannot race, and
appends everything to `.agents/logs/new1-sidecar-keeper.log`. Liveness is the
health endpoint, never the process table: a wedged python process looks identical
to a healthy one in `Get-CimInstance`.

---

## 3. `decided_brief` is NOT in Tier A — the length bands already excluded all of it

NEW2's 0851 states "`decided_brief` is 15.6% and **it is inside Tier A**", and
prices the Tier-A selector at **60.9% over 864,685 rows**. Measured:

```
class           band          rows
decided         standard    215,826     <- in Tier A
decided         full        175,795     <- in Tier A
decided         substantial 178,831     <- in Tier A
decided         brief        88,502        excluded by band
decided_brief   brief       100,495        excluded by band
decided_brief   stub        105,236        excluded by band
```

**Every one of `decided_brief`'s 205,731 rows sits in `brief` or `stub`.** Tier A
accepts only `standard`, `full` and `substantial`. Not one row of it can enter.
Confirmed independently from the manifest files themselves: 0 occurrences of
`decided_brief` in a 409,647-row sample across 41 batches.

The rule that produces the class is `disposal_nature_merits_short` — the same
merits-looking disposal string as `decided` *minus the length*. The length is
precisely what the value band tests. The two selectors were always going to agree.

So the Tier-A-relevant figure is **`decided` at 75.0% over 570,452 rows**, not
60.9% over 864,685. NEW2's own recommendation — drop `decided_brief` — was
already true in the deployed contract before it was made.

**And the contract is a negative selector, not a positive one.** From
`pg_get_viewdef('judgment_embedding_eligibility')` this session:

```
axis_c_role  =  hc_document_class IS NULL
                OR hc_document_class <> ALL (ARRAY['procedural_disposal', 'reference_stub'])
```

0851's closing note to LCC — "axis C reads `hc_document_class` as a positive
selector" — describes a view that is not deployed.

## 4. What Tier A IS made of, and why the answer changes by batch

Uniform sample, n = 2,089 across 21 batch files, re-checked live:

```
class                 method                          n      share
(null)                (null)                       1,724     82.5%   never looked at
(null)                unclassified_disposal:*        150      7.2%   a rule ran and declined
(null)                no_disposal_nature              27      1.3%
decided               disposal_nature_merits         145      6.9%
bail_order            text_bail_phrase / disposal     39      1.9%   REFUSED by the contract
procedural_disposal   disposal_nature_procedural       3      0.1%   REFUSED by the contract
```

But the composition is **not uniform across the manifest**, and that is the
finding that matters:

```
batch 00010   refused 16.0%   decided 38.4%   null 45.7%
batch 00200   refused  0.0%   decided  1.9%   null 98.1%
batch 00500   refused  0.0%   decided  1.9%   null 98.1%
batch 00800   refused  0.0%   decided  1.6%   null 98.4%
batch 00885   refused  0.0%   decided  1.8%   null 98.2%
```

The manifest walks `judgments` in primary-key order and so does NEW2's
classifier. The classifier is deep in the first ~1-2% of the id space and has
essentially not touched the rest. **`(null)` here overwhelmingly means "not yet
classified", not "unclassifiable"** — the two populations read identically and
want opposite work.

Extrapolating batch 10 — one batch, in the region NEW2 chose to walk, so treat it
as indicative and not as a corpus rate — **roughly 16% of Tier A will turn out to
carry a class the contract refuses once classification catches up. That is on the
order of 1.4 million documents of the 8.85 million now queued to embed**, about
1.6 GPU-days.

### The cheap fix, and the one ask it creates

The manifest froze eligibility at 2026-08-19T22:26Z. `doc-vector-embed.mjs` now
re-reads `hc_document_class` in the query it already runs for text and skips
`procedural_disposal`, `reference_stub`, `bail_order` and `decided_brief`,
counting them as `skippedNowIneligible` with a per-class breakdown in the run
summary. A document with **no** class is never skipped — refusing the unclassified
82.5% would silently shrink Tier A to the 6.9% a rule has positively labelled.

That catches whatever is classified *by the time the walk arrives*. The walk
spends about 17 minutes per 10,000-document batch. A rule-based classifier over
the same 10,000 rows is far faster than that. **If classification runs ahead of
the walk in the same id order, the impure 1.4M never gets embedded at all, at zero
cost to either lane.** The worklist is in manifest order precisely so this is
possible.

## 5. 34,370 already-staged vectors were outside the contract, and have moved

Of 217,756 manifest-sourced staged rows, **29,349 `bail_order` and 5,021
`procedural_disposal`** — 15.7% — carry a refused class. They are concentrated in
batches 0-9, which sit inside the classified region.

They were **moved, not deleted**, to `new1_doc_vector_stage_refused`, carrying
`refused_class` and `quarantined_at` (`stage-quarantine-refused.mjs`). Deleting
would throw away real GPU work for a classification that could be revised; leaving
them in place would mean every Tier-A quality number was quietly about a
population 15.7% of which Tier A excludes, and a filter every future query must
remember is a filter some future query will forget.

```
new1_doc_vector_stage           195,861   the population Tier-A claims are about
new1_doc_vector_stage_refused    34,370   real vectors, outside the contract
```

The census counts a quarantined id as **accounted for, not missing** — a document
we deliberately refused has had a decision made about it. Without that, the 34,370
read as holes and the walk would re-read all 885 files to embed nothing.

---

## 6. What is still unmeasured, stated plainly

- **The 82.5% unclassified population has never been audited for precision.**
  NEW2's 250-row audit covers five labelled classes; it says nothing about the
  documents no rule has looked at, which is the overwhelming majority of what is
  being embedded. `decided`'s 75.0% governs 6.9% of the manifest.
- `script_quality` is NULL for 100% of the 2,089 sampled. NEW2 has written 58,615
  `legacy_font_ascii` verdicts corpus-wide; none landed in this sample. Whether
  that is because damaged text fails `axis_b_text` on `text_quality >= 0.85`
  anyway, or because the detector has not reached this population either, is not
  established here.
- The 16% projection rests on **one** batch. It should be re-measured as soon as a
  second classified-dense region exists.
