# THE QUALITY CONTRACT — one query, five questions, no lane rediscovers anything

**Owner:** NEW2 · **Written:** 22 Aug 2026 · **Migration:** `0071`, `0072`
**Read this before writing another quality predicate.**

Three lanes were each computing a different subset of the same five facts from a
different place. That is how two of those facts ended up with two different
numbers. There is now one view.

```sql
SELECT * FROM judgment_quality_contract WHERE id = $1;
```

---

## 1. The five questions and their columns

| question | columns | never says |
|---|---|---|
| is the body real text? | `text_state` `text_value` `text_method` `text_grade` `text_at` | **CLEAN** |
| has anything recovered it? | `recovery_state` `recovery_reason` `recovery_method` `recovery_engine` `recovery_chars` `recovered_at` `digit_trust` | that recovered digits are safe |
| is the date confirmed? | `date_state` `date_method` `off_by_one_day` | a rewritten date |
| does it DETERMINE anything? | `role_class` `role_method` `citability` | **CITABLE** |
| may I use it? | `body_text_safe` `metadata_discoverable` | — |

---

## 2. `text_state` has no CLEAN value and never will

```
TEXT_UNKNOWN   nothing has convicted it.   ~91% of the corpus
TEXT_DAMAGED   a screen or a detector convicted it
```

Nothing in this corpus looks for evidence that an extraction was **faithful**.
Every screen we own can only convict. So "not convicted" is `UNKNOWN`, and a
consumer that reads it as clean is making a claim the data does not carry.

`text_grade` says how well proven, on the scale `0070` introduced:

```
NONE     not in an unsafe state at all
SCREEN   a text screen convicted it — an English-density or marker screen.
         Enough to refuse a GPU batch. NOT enough to tell a person their
         document is corrupt.
PROOF    the character stream itself convicted it — control-character density,
         control runs, long letter runs, PUA, replacement chars
```

**`PROOF` became reachable on 22 Aug 2026 and was unreachable before it.** `0070`
shipped the shape with an empty method allow-list and said so in its own comment.
`text-damage-persist-cli.ts` now writes `script_quality_method =
'text-damage-v2.0'`, which is the string that grade keys off.

Measured while the pass ran:

```
TEXT_DAMAGED  SCREEN   1,392,185
TEXT_DAMAGED  PROOF      141,044   and rising — the pass is still walking
```

### The 4.7% that no screen had convicted

Of the first 148,000 proof-grade verdicts replayed against the live column,
**7,329 rows — 4.7% — had `script_quality IS NULL`**: proven glyph dumps that the
density screen never fired on, and which were therefore still eligible for the
GPU. The mechanism is the one LCC named in bus 0994: a digital-signature
appliance's footer is real English and lifts a document that is 28–63% control
characters above the density floor.

The other 140,573 were already convicted at `SCREEN` grade and are now `PROOF`.
The **value** did not change for any of them — `damaged_other` before and
after — so no consumer predicate moved. Only the evidence grade did.

---

## 3. `citability` never says citable, and that is the point

```
NOT_CITABLE          procedural_disposal · reference_stub
BAIL_ORDER           cited by judges, not substantive authority (0066)
CITABILITY_UNKNOWN   everything else, INCLUDING `decided`
```

`hc_document_class = 'decided'` is 1,128,830 rows and was measured **30%
procedural [13.6, 46.4]** on a 90-row stratified frame read from primary
documents (`DOCUMENT_ROLE_GOLD_V2.md`). All of those labels come from one rule,
`disposal_nature_merits`, which reads a **registry disposal string** — the arrow
from DISPOSITION to CITABILITY that `DOCUMENT_QUALITY_VOCABULARY.md` forbids. A
transfer petition allowed on its merits writes `disposal_nature_merits` exactly
as a Constitution Bench judgment does.

So this view asserts only **refusals**, and only where a rule fired on the
document's own operative text or on an explicit registry class. **False
substantive authority is worse than UNKNOWN** — an advocate who cites a transfer
order as precedent is embarrassed in open court, which is the failure the citation
harness exists to prevent, arriving through a different door.

`operative_act_withdrawn` — the first rule that reads the court's operative
sentence rather than the registry's string — completed its re-assessment:

```
155,680 documents re-assessed
  decided               81,459   52.3%
  procedural_disposal   60,996   39.2%   ← was `decided`
  decided_brief         13,225    8.5%
```

Eight of the nine operative-act reasons remain unwired at 50–86% out-of-sample
precision. They stay unwired: a demote-only rule at 68% removes a real authority
one time in three.

---

## 4. Dates are published, never rewritten

```
DATE_VERIFIED   the DOCUMENT prints the stored date
DATE_SUSPECT    a witness actively contradicts it
DATE_UNKNOWN    no independent witness — silence is not a contradiction
(row absent)    nothing has looked
```

`DATE_VERIFIED` requires the **primary document**, not the filename: when the two
disagreed, the document was right **33 times out of 34**. Corpus disagreement rate
**4.45%**.

On the value population — cited authorities ∪ recovery queue ∪ staged vectors,
**713,136 documents**, completed run under `date-quality-v1.1`:

```
DATE_VERIFIED   619,739   86.90%
DATE_UNKNOWN     59,997    8.41%
DATE_SUSPECT     33,400    4.68%
off_by_one_day   26,180
```

The population is resolved once at the start of each run, so it grows between
runs as `cited_authority` and the staged vectors grow — 699,398 at the first pass,
713,136 at this one. It is a lookup table, not a rate: **the corpus rate still
comes from uniform draws**, never from this.

### The v1.0 numbers were wrong and here is how

The first pass returned **69.47 / 23.96 / 6.57**, and inside it something that was
not a corpus fact:

```
cited authorities, DATE_SUSPECT      8,696 of 35,890    24.2%
  Supreme Court of India             7,406 of 17,221    43.0%
  Allahabad High Court               1,112 of 17,775     6.3%
```

43% of one court is a detector defect. `printedDates()` read `13.02.2024` and
`2024-02-13` and nothing else — and **the Supreme Court prints its date in the
cause title in words and never prints it numerically**:

```
"... v. JAI PRAKASH SINGH AND ANR.  MARCH 8, 2007  [DR. ARIJIT PASAYAT ...]"
```

So the judgment's own date was invisible while every date it CITES was visible:
`printed.size > 0` held, `printed.has(jd)` did not, and that is exactly the branch
returning `DATE_SUSPECT`. On a 60-row sample **51 of 60 print the stored date as a
month-name date — ~85% false**.

It inverted this module's own governing rule, which was right: *a document that
prints no date at all is silent, not contradicting.* A date printed in a shape the
reader cannot parse is silence **to that reader**. The reader was convicting on
its own blind spot.

**`DATE_DISAGREE_RATE = 0.0445` is untouched** — it measures the FILENAME witness,
which the blind spot never reached. Anything derived from *"every `DATE_SUSPECT`
state = 6.17%"*, including the `1 - (1-p)^2` edge arithmetic, re-derives from
4.68%.

Cited **Supreme Court** authorities, the population the defect hit hardest, land
at **11.5% SUSPECT** under v1.1 against 43.0% under v1.0.

**An absent row and `DATE_UNKNOWN` are different facts** and are deliberately not
collapsed — this repo already made that mistake once with `hc_document_class`
NULL, where a refused-by-a-rule row and a never-scanned row were
indistinguishable and wanted opposite work.

Chronology and currentness must not rest silently on `DATE_SUSPECT`.

---

## 5. Damaged body text is not a disappeared document

Two booleans, separate on purpose:

```
body_text_safe          false for a convicted document. Semantic retrieval over
                        the BODY must refuse it.
metadata_discoverable   true whenever the identity fields are intact, regardless
                        of body damage.
```

An advocate searching by citation or by party name must still **find** a document
whose body failed to extract — with its state visible — rather than have it
silently vanish. The identity fields do not come from the body text, so body
damage is no evidence against them.

Recovered text does **not** flip `body_text_safe`. A recovery lives in its own
table with its own provenance, and a consumer that wants it asks for it by name.

### Verified through the real product path, not inferred

`POST /search` against the locally running `services/api`, a PROOF-grade damaged
document that OCR has recovered:

```
contract row   text_state TEXT_DAMAGED · text_grade PROOF · recovery_state RECOVERED
               digit_trust CROSSCHECKED · body_text_safe false
               metadata_discoverable true

POST /search  {"query":"caseno:\"LPA/338/2022\"","language":"en"}
  -> 200, 5 results, TARGET PRESENT (position 3)
     3001140a  SATINDER Vs STATE OF HARYANA AND OTHERS
```

The document's body is a proven glyph dump and it is still findable by its case
number. That is the behaviour `metadata_discoverable` names, confirmed over HTTP
rather than argued from the schema. **LOCAL_CONTENDED.**

The reverse half — semantic retrieval REFUSING that body — is **not** enforced at
query time. `retrieve.ts` down-ranks by `judgment_chunks.text_quality` and never
excludes, and that penalty is inert on this population: of the 24 chunks whose
judgment is proven damaged, **22 sit at or above 0.85 and take no penalty at
all**, because `text_quality` is inverted here. The exposure is small only because
NEW1's quarantine keeps up, not because anything structural refuses. Measured and
sent to LCC (bus 1004) and NEW1 (bus 1005); `retrieve.ts` is LCC's file and NEW2
has not edited it.

---

## 6. Recovery, and why the digits are a separate question

`judgment_text_recovery` sits **beside** `judgments.full_text`, never in place of
it. The glyph dump is the evidence that recovery was needed, and OCR text is a
derived artefact of an engine rather than the court's published words.

```
digit_trust
  UNVERIFIED    nothing corroborated the digits. THE DEFAULT.
  CROSSCHECKED  a witness that never came from this text matched literally
  SUSPECT       a witness matched only after glyph repair, or the document
                renders numbers with letter shapes
```

**6 of 20 probe pages rendered a year as `2O17` — every one of the six
Karnataka.** So recovered text is reliable for prose and unreliable for digits. A
section number, a year or a date read wrong is a **wrong authority**.

`ocr-digit-trust.ts` adjudicates it against `case_number` and `judgment_date`,
which arrive as **source metadata** and therefore cannot agree by construction.
A match that needed the `O`→`0` repair **downgrades** rather than upgrades: a
document that needed the substitution has demonstrated the defect, and every other
number in it is suspect for that reason.

No numeric field may be taken from recovered text without a second witness.

### `digit_trust` is confounded by page count, and a consumer must know it

First 63 recoveries:

```
                 n    avg pages    max pages
CROSSCHECKED    45        2.8         12
SUSPECT         18       10.9         40
```

**A `CROSSCHECKED` verdict on a one-page order is weaker evidence than the same
verdict on a forty-page judgment**, because every additional page is another
chance to catch a glyph-damaged number. The states are not comparable across
document lengths. This is a limitation of the measure, not a defect in it — but
`CROSSCHECKED` on a short document must not be read as "these digits are safe".

---

## 7. How to ask

```sql
-- may I embed this document's body?
SELECT body_text_safe FROM judgment_quality_contract WHERE id = $1;

-- everything a citation surface needs, in one row
SELECT text_state, text_grade, citability, date_state, digit_trust,
       body_text_safe, metadata_discoverable
  FROM judgment_quality_contract WHERE id = $1;

-- what has proof-grade damage and is cited by someone?
SELECT c.* FROM judgment_quality_contract c
  JOIN cited_authority ca ON ca.judgment_id = c.id
 WHERE c.text_grade = 'PROOF';
```

The view is a `LEFT JOIN` of `judgments` against two primary-keyed side tables and
one `LATERAL` on an indexed column. Per-id lookups are index probes. **A
`GROUP BY` over the whole view is an 18.7M-row scan** — that is a scan, not a
contract defect, and the resource gate exists for it.

---

## 8. Re-measuring

```bash
pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
  src/text-damage-persist-cli.ts --confirm --upgrade-screen   # text → PROOF
pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
  src/recovery-queue-cli.ts --confirm                          # queue high value
pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
  src/recovery-worker-cli.ts --confirm --limit 50              # OCR them
pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
  src/date-quality-persist-cli.ts --confirm                    # date states
```

Every one is idempotent, checkpointed, and refuses to overwrite another writer's
verdict.

---

## 9. What is NOT established

- **`text_grade = 'PROOF'` covers the export, not the corpus.** The damage export
  had walked 94.6% of the id space when this was written. A document in the
  remaining 5.4% that is a glyph dump reads `TEXT_UNKNOWN` today.
- **The date states cover 699,398 documents, not 18.7M.** `--all` exists and is
  not the default; the corpus RATE is already measured on uniform draws and a full
  pass would not improve it.
- **`citability` asserts only refusals.** The discriminator that could positively
  assert a substantive authority — reading the operative span for whether an order
  DETERMINES anything — is identified and unbuilt, by both NEW2 and LCC, on
  purpose.
- **The recovery figures are a 63-document tranche.** 59 of 63 recovered on the
  first pass, 63 of 63 after a threshold defect of mine was corrected; 0 failed.
  321 pages, 14.2 s/page **LOCAL_CONTENDED** — the probe's 3.7 s/page is the
  quiet-box figure and this box was running a GPU walk, two classifiers, LCC's
  screen and two of my own passes.
- **Four documents were briefly labelled `UNRECOVERABLE` and none of them were.**
  An `englishRate >= 12` floor convicted clean text at control density 0.0000 —
  *"IN THE HIGH COURT OF KARNATAKA, DHARWAD BENCH DATED THIS THE 16TH DAY OF
  JANUARY, 2025"* scores 10.22, because a cause title has almost no function
  words. The verdict now comes from `damageVerdict()`, the same detector that
  convicted the original PDF, which discriminates on control density (0.7014 for a
  glyph dump against 0.0000 for a recovery). `--readjudicate` re-grades stored
  text when the rule changes again, without re-paying for the OCR.
