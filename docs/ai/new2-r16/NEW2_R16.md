# NEW2 — R16. Evidence reproducibility, and what the 46 non-cohort keys actually are

`HEAD` at start: `93ca23f4`.

Two pieces of work. The first is a defect in how this lane publishes evidence:
the committed parity artifact moved and the observation that binds it by sha did
not, so from one commit onward the repository could not reproduce its own parity
numbers. The second is the 46 keys LCC handed over in R15 — "a judgment carrying
another judgment's neutral citation" — which turn out to be four different
things, and mostly not what the phrase suggests.

---

## 1. The parity binding, reproduced before it was repaired

LCC bus 1634, corrected by 1636. The correction is the right one and the
mechanism in it is exact.

```
PARITY_ARTIFACT_SHA   2a4770221cb01d51331867f18880583032a930c46e3776ce85fa002f2b2b7310
BOUND_PARITY_SHA      ba2d0c5c36d5e30d8e8080a6db07a9f81eb68ed0e613d779d1772f7a092c6c9b
MATCH                 NO
```

`08baae98` (`feat(new2-r14-followup)`, a commit about India Code statutes)
rewrote `docs/ai/new2-r10/parity-matrix.json` with a genuine re-measurement taken
`2026-08-31T09:57:05.788Z`, and did not touch
`docs/ai/new2-r10/freshness-observation.json`. Both files are committed and
clean, so the disagreement is between two committed objects and reproduces in a
clone.

**The committed test that detects it** is
`services/api/src/corpus/freshness-publication.test.ts` →
"projects the repository publication and matches its own artifact". Run at
`93ca23f4` with a clean tree: **10 pass, 1 fail**, and the failure is the two
shas above, nothing else.

`1a550cf5` — "my own last commit left the freshness triple two-agreeing-one-behind"
— is the same defect one round earlier. That is what makes it a mechanism problem
rather than an accident.

### Repaired by measuring forward

The round's instruction and the honest option agree here: the parity artifact is
NEWER, so the fix is a new observation, not a restored old denominator. In order:

1. `n2-coverage-frontier.mts --year 2026` → 54 partitions, 25 courts, taken
   `2026-08-31T10:45:51.192Z`.
2. `n2-source-freshness-r10.mts --window 12` against the **current** parity
   artifact → `contract.denominatorTakenAt = 2026-08-31T09:57:05.788Z`.
3. `lcc-publish-freshness.mts` → generation
   `2026-08-31T10:45:51.192Z#5c49b02da559`, read back through the route's own
   door.

No measured value was edited to match a hash, no historical artifact was
reconstructed, and every prior generation stays in git.

### A second hole, and nothing could see it

The observation published on 29 August recorded
`latestUpstreamMeasuredAt = 2026-08-29T14:38:58.523Z`. The committed
`coverage-frontier.json` was taken at `05:35:52.659Z` and says the newest
upstream decision is `2026-08-27`; the observation published `2026-08-28`.

**The coverage-frontier run behind the published upstream date was never
committed.** The observation was internally coherent — its own body hash, its
own parity sha — and still named an upstream measurement no clone could find.
That was already true at `08baae98~1`, before the parity break, and the API test
cannot see it because it only checks the parity half.

### The guard

`scripts/check-freshness-binding.mjs`, wired into `ci:local`. The publisher
already refuses an incoherent PAIR; nothing refused an incoherent COMMIT. It
reads committed objects with `git show --ref <ref>` rather than the working tree,
because a coupled set committed one file at a time is green here and red in a
clone. Eleven bindings: artifact name, body hash, parity path, parity sha, parity
`takenAt`, the measurement's `denominatorTakenAt`, that the embedded measurement
is byte-equal to the committed `source-freshness.json`, the definition sha, that
the projected source is present, that the committed frontier is the one the
published upstream date came from, and that the frontier's newest decision is the
one published.

Non-vacuity, run against the objects rather than asserted:

```
--ref 08baae98~1   2 violations   (both frontier — the older, invisible hole)
--ref 08baae98     5 violations
--ref 93ca23f4     5 violations
--ref HEAD         0
working tree       0
```

`freshness-publication.test.ts` is 11/11 after the republication.

---

## 2. Current parity truth — HC only

Scope is the AWS Open Data High Court metadata records under
`HC_PARITY_V2_2026-08-29`, `bench=testcase` excluded. **This is not an all-source
parity number and must not be quoted as one.** Supreme Court and eCourts are
separate rows in the same measurement and are not summed with it.

```
HC_ACCOUNTED_PERCENT        100
HC_ACTUALLY_HELD_PERCENT    98.833
MEASURED_AT                 2026-08-31T09:57:05.788Z   (denominator)
                            2026-08-31T10:47:40.925Z   (measurement)
UPSTREAM_DENOMINATOR        18,945,988 distinct objects over 1,438 partitions
held                        18,724,829
sourceUnavailableCurrent      221,159
policyRefused / actionableFailures / neverAttempted   0 / 0 / 0
12-month window completeness  0.9697
sourceLagDays                 0   (upstream newest decision 2026-08-29, ours 2026-08-29)
```

---

## 3. The 46 non-cohort keys are four different things

`scripts/n2-noncohort-46-classify.mts` →
`docs/ai/new2-r16/noncohort-46-classification.json`. 46 keys, 173 bearer rows,
all `source = 'neutral'`. The resolver is never consulted; every verdict is a
function of the retained document text and the row's own identity fields.

```
INGEST_WRONG_NEUTRAL_CITATION_EXTRACTION                     30
SOURCE_DOCUMENT_GENUINELY_PRINTS_FOREIGN_NEUTRAL_CITATION    13
INGEST_WRONG_DOCUMENT_IDENTITY                                1
DUPLICATE_DOCUMENT_IDENTITY                                   0 primary, 11 secondary
CONNECTED_CASE_NOT_CAUGHT_BY_COHORT_CLASS                     0
AMBIGUOUS                                                     0
UNTESTABLE                                                    2
```

### The 30: the document prints no citation of its own, and cites one

`neutralCitationFrom` in `services/ingest/src/harvest/hc-load.ts` takes the FIRST
neutral-citation match in the opening **3,000 characters**, accepting it when its
year is the partition year or the one before. Its own comment states the
assumption: *"The document's own appears in the header, so the first occurrence
within the opening window is the safe one."*

That assumption fails on a short order. **166 of the 173 bearers print exactly
one neutral citation in their entire text** — so this is not the extractor
choosing badly between two candidates. It is a two-page order that prints no
citation of its own and mentions the judgment it follows:

```
2023:AHC-LKO:65518-DB    the owner: WRIT-A 7699 of 2023, 09.10.2023, 27,243 chars
                         six bearers of 1,005-1,084 chars, Nov-Dec 2024, each
                         reading "the case at hand is squarely covered under the
                         judgement dated 09.10.2023 passed by this Court in Writ A
                         No. 7699 of 2023: Neutral Citation No.- 2023:AHC-LKO:65518-DB"
```

All **three cross-court cases are this**, and none is a source defect: an Andhra
Pradesh writ petition lists the Allahabad citation in its own *Cases Referred*
block, an Orissa writ petition quotes it in prose. The foreign court printed
someone else's citation because it was citing them.

**13 of the 46 keys have no owner held at all** — the corpus holds only documents
that cite the judgment, never the judgment. Those keys are pure noise in the
citation graph.

### The 13: the court issued one number to two matters

Two genuinely different documents, each printing the citation in its own masthead
or its own page stamp, different case numbers, different parties, different dates,
same court:

```
2024:AHC-LKO:108     BAIL APPLICATION 15166 of 2023, 02.01.2024, Court No. 15
                     APPLICATION U/S 482 No. 1032 of 2024, 06.02.2024, Court No. 11
2025:AHC:20934       A482 29547/2024 Ram Yash Dubey, 12.02.2025, Court No. 75
                     A482 32636/2024 Islam,           14.02.2025, Court No. 75
2025:DHC:8491-DB     MAT.APP.(F.C.) 166/2025, 31.10.2025 — own footer stamp
                     MAT.APP.(F.C.) 330/2023, 26.11.2025 — own footer stamp
2026:HHC:30615       FAO 499 of 2016, 24.07.2026
                     FAO (MV) 509 of 2016, 18.08.2026
```

Five of the thirteen are the Allahabad Lucknow bench at low 2024 serials — 108,
135, 266, 1982, 5501. **No ingest change can repair these and no resolver gate
should hide them**: the printed page really does carry the same number twice, so
the citation is not a unique identifier for those matters and `AMBIGUOUS` is the
correct and only honest answer.

### The 1 wrong document, and the 11 duplicates

`2023:KHC-D:14142` — two Karnataka rows, `MFA/25207/2011` (04.12.2023) and
`MFA/25707/2011` (05.12.2023), holding **byte-identical text** whose masthead
reads `MFA No. 25207 of 2011`. The 25707 row holds the 25207 document.

Eleven keys carry a duplicate as a secondary defect, and they are two different
mechanisms:

- **case-number spelling.** `A482/1358/2024` and `/1358/2024` — the same judgment
  under a case number with and without its type prefix, text lengths differing by
  ~90 characters of trailing furniture. Both survive dedup.
- **the same PDF object under two year partitions.** `2025:AHC-LKO:6899`:
  `UPHC020322182005_1_2025-01-31.pdf` is held twice, once from
  `year=2025/court=9_13/…` and once from `year=2026/court=9_13/…`. Dedup identity
  is `pdfUrlFor(partition, basename(pdf_link))`, so the year in the path makes
  them two identities. The 2026 row also carries `judgment_date 2026-07-16` while
  the PDF's own text reads `Order Date :- 31.1.2025`.

### The 2 untestable, and why they are not a negative finding

`2024:PHHC:010957` and `2024:PHHC:020579`. Four bearers whose extracted text is a
CID glyph dump — English token density **0.07** against 0.73 for a healthy row in
this set. Their own case numbers appear nowhere in them, which reads exactly like
"this row holds another case's document" and is not evidence of anything.
`text_quality` certifies all four. A damaged document can only be UNTESTABLE, and
saying so is the finding.

### Where the 46 sit corpus-wide

Measured, on the whole corpus, `judgment_citation_keys` where `source='neutral'`:

```
neutral citation keys                     1,181,324
keys with more than one claimant            156,370   (13.24%)
  same court, same date                     121,238 keys / 288,610 rows
  same court, different dates                35,120 keys /  75,060 rows
  cross court                                    12 keys /      33 rows
```

The bottom two rows are the shape of the class these 46 were drawn from:
**35,132 keys / 75,093 rows** that no connected-matter cohort gate can reach.
LCC's holdout drew 43 same-court-different-date and 3 cross-court from 226; the
corpus ratio is 99.97% to 0.03%, so **the holdout over-represents cross-court by
roughly two orders of magnitude** and its 3 cases must not be read as a rate.

**This is a shape, not a defect count.** This instrument has not been run over a
sample of those 35,132 keys, so nothing here says how many of them are extraction
defects. Saying "65% of 35,132" would be an extrapolation from 46 hand-adjudicated
cases and it is not made.

---

## 4. Correction proposal — nothing mutated this round

No `judgments` row was changed. No citation edge was written. The proposal, for a
round that is allowed to make it:

1. **`neutralCitationFrom` needs a negative condition, not a wider window.** The
   citation is the document's own when it appears before the document's own case
   number or in its page stamp; it is an authority when a case reference precedes
   it. The role test in `n2-noncohort-46-classify.mts` is the shape of it. Any
   such change must be measured against the whole 2023+ population before it
   ships — 1,389,098 judgments carry a neutral citation and a stricter rule will
   drop some of them to NULL, which trades a wrong citation for a missing one.
2. **Dedup identity should not carry the partition year.** One PDF basename under
   two year partitions is one document.
3. **The 13 source collisions want a durable mark, not a repair.** A citation the
   court printed on two matters is genuinely ambiguous and the resolver already
   answers `AMBIGUOUS` on it. Nothing to fix; something to record.
4. **The 4 damaged Punjab & Haryana documents belong in the OCR queue.**
   `ocr-recovers-glyph-dumps` — 20/20 recovered by OCR, 0/20 by re-extraction.

---

## 5. R15 package status

```
R15_PACKAGE_VALID_FOR_APPLY_AUTHORIZATION = NO
```

`NEW2-R15-PKG-48be7a6f42282d6d` was drawn and adjudicated while the LCC cohort
gate still carried **NEW2-R15-F1** — the gate reading matter numbers UPPER CASE
ONLY, so a title-case common order passed as unique. Its `connectedMatterCommonOrder`
retest already records `NOT_PASSED — UNTESTABLE ON THIS POPULATION`: the gate was
reached on all 472 would-be-UNIQUE rows and saw zero declared matters on every
one of them.

It is a **falsifier population with a package hash**, which is not the same thing
as a frozen, signed apply population, and its PASS-like counts (FALSE_PIN 0,
FALSE_UNIQUE 0) were measured against a gate that has since changed. Neither the
counts nor the identity carry forward.

---

## 6. LCC gate watch — read once, at the end of the round

```
LCC_CORRECTED_GATE_OBSERVED = NO
CITATION_RETEST_STATE       = WAITING_FOR_LCC
CITATION_BULK_APPLY         = HOLD
```

The correction exists and it is **not committed**. `git log` for
`services/api/src/citations/cohort.ts` still ends at `2d06bdf8`, and the version
committed at HEAD carries no `NEW2-R15-F1` section — while the shared working
tree holds `cohort.ts +267/-36`, a modified `cohort.test.ts`, an untracked
`cohort-case.test.ts` and an untracked `docs/ai/lcc-r15f1/` with six artifacts.
The uncommitted header answers NEW2-R15-F1 directly and says the obvious repair —
dropping case-sensitivity — was measured and rejected, because `[A-Z]`-only
matching was suppressing prose as a side effect; the replacement is structural.

**No new falsifier was run, and that is the point.** Measuring a gate that lives
only in a working tree is precisely the defect §1 of this round repaired: an
evidence artifact bound to something no clone has. A falsifier run now would
carry a `resolverGateCommit` that does not exist, and would have to be thrown
away when the gate lands changed. R14's populations and the R15 package are
untouched.

When the corrected gate commits, the next round runs a new prediction-blind
falsifier under a **new** identity, covering: mixed-case connected/common-order
titles, the existing M.A./C.O. cohort form, the unreachable 83/180 data-contract
class, self-edge cases, alias-heavy strata, cross-court collisions, the 46
non-cohort keys classified above, and independent positives and negatives.

---

## 7. Continuous work — ingestion, and the Bombay question

**Health.** AWS HC 18,720,643 rows, last ingest `2026-08-30 14:05`, newest
decision `2026-08-29`, upstream newest decision `2026-08-29` — frontier gap 0.
SCI 27 rows, last ingest `2026-08-29 14:12`. The 30 August gap-closure
revalidation ran to completion: 2,500 selected, 125 recovered to `TEXT_READABLE`,
2,375 still absent on recheck. Nothing was stopped, started or reconfigured by
this round; both scripts it ran are read-only against the database.

**Bombay HC (`27_1`), August 2026 — measured, and NOT escalated.**

```
month     upstream   held   sourceUnavailableCurrent   neverAttempted   completeness
2026-05      5514    4914             600                    0            0.8912
2026-06      4356    3896             460                    0            0.8944
2026-07      1931    1429             502                    0            0.7400
2026-08      3313    2124            1189                    0            0.6411
```

The unavailable RATE has risen 11% → 11% → 26% → 36%. It is clustered: 2 of 24
August cells are below 0.95 completeness, and `27_1` is the worse of the two
(`18_6` is 0.8623).

It is **not** escalated, on the existing criteria and not on a feeling:

- `neverAttempted = 0` and `actionableFailures = 0`. Every one of those objects
  was tried.
- The shortfall has direct per-object evidence — 149,404 `pdf_absent` rows for
  `27_1` in `hc_ingest_ledger`, attempted between 18 and 30 August, 1,977 of them
  on 30 August alone. `pdf_absent` is a 404/403/410 from the publisher, i.e. an
  object upstream named and did not upload.
- August is the current month and the definition's own rule is a 90-day
  revalidation window, not an immediate verdict. Held rows for Bombay in August
  (3,239) are already 2.2x July's (1,459), so "August is degrading" is not what
  the held side says either.

Recorded, and due for its ordinary bounded revalidation. If September's cell
opens at the same rate with the same direct evidence, that is a clustered source
failure and it escalates then.

**Statutes.** The improved India Code resolution from `08baae98` is preserved and
untouched: `statutes.act_id` keyed against `dc.identifier.act_id` with the AC\_
prefix test, the stored handle's body read, and CENTRAL preferred over State
reproductions. No crawler architecture was added and the 49-Act measurement was
not expanded.
