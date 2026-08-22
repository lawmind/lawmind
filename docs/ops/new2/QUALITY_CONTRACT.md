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

On the value population (cited authorities ∪ recovery queue ∪ staged vectors,
699,398 documents) the first 4,000 measured **69.4% VERIFIED · 25.0% UNKNOWN ·
5.6% SUSPECT**.

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
- **The recovery figures are a 63-document tranche.** Cost is quoted
  `LOCAL_CONTENDED` and is not a quiet-box figure.
