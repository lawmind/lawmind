# What the semantic core actually admits — NEW2's independent audit

**Measured against eligibility contract v2**, migration `0066`, deployed view
hash `5efa4c8decef699e`, read live rather than from a file. 21 August 2026.

Everything below is measured on this corpus. Where a number is a floor it says so.

---

## Two revisions, both recorded rather than overwritten

**1. The contract changed under the audit, which is what the hash is for.** The
first runs measured hash `e76879ab6bbcd452`. Migration `0066` then made bail
orders reachable under their own tier, named `decided_brief` out of
`axis_c_role`, and added `semantic_tier`. The tool records the deployed hash on
every run and the mismatch was visible immediately; the JavaScript transcription
was updated to follow the view, and every figure here is from the v2 re-run.

**2. A defect in this tool, found by `eslint` and not by anyone reading the
output.** For its first three runs the text screens read a variable the query had
stopped selecting, so English density, marker rate, bail phrase and citation
presence all ran on the **1,400-character tail** rather than the
20,000-character probe. `tsc` was clean throughout — the field was optional and
`?? ''` is well typed. Fixed and re-run. Citation presence moved from 94.2% to
84.4% and, corrected, turned out to vary strongly with document length, which the
wrong figure had hidden. Retracted on the bus in 0913, 0914 and 0915.

---

## The method, and why it is not the class-precision sample again

`hc-class-precision-cli.ts` draws rows stratified **by class**, which measures how
often a label is right. Useful, and a different question.

The selector that decides what gets a vector is the view, and the class label is
one input to it. Two of the conjuncts admit on the **absence** of evidence:

```
axis_a_identity   content_hash, case_number, judgment_date, court, case_title > 3 chars
axis_b_text       full_text present AND text_quality >= 0.85
                  AND (script_quality IS NULL OR IN ('clean','mixed_script_ok'))
value_band        length(full_text) >= 2000

semantic_tier     NOT_ELIGIBLE unless identity AND text AND length
                  then: bail_order            -> BAIL_ORDER_REACHABLE
                        decided_brief |
                        procedural_disposal |
                        reference_stub        -> UNRESOLVED_EXPERIMENTAL
                        decided + clean text  -> VERIFIED_SEMANTIC_CORE
                        everything else       -> BROAD_SEARCHABLE
```

A class-stratified sample cannot see any of that — it only draws rows that HAVE a
class. So this audit samples the **admitted population**: 25,000 uniform draws
over `judgments.id` (uuid v4, so a draw above a random uuid is uniform over rows,
at one index descent each), the predicate re-evaluated per row so that admission
can be attributed to a single conjunct.

`semantic-core-audit-cli.ts` · `docs/ops/migration/new2-semantic-core-audit.json`

**13,842 of 25,000 draws are reachable — 55.4%.**

```
BROAD_SEARCHABLE          13,102   94.7% of reachable
BAIL_ORDER_REACHABLE         637    4.6%
UNRESOLVED_EXPERIMENTAL      103    0.7%
VERIFIED_SEMANTIC_CORE         0    0.0%
NOT_ELIGIBLE              11,158
```

---

## 1. `VERIFIED_SEMANTIC_CORE` is empty, and that is the honest state

Zero of 25,000. The tier needs positive evidence on the role axis **and** the
text axis, and `script_quality` is written for 58,615 rows of 18,698,968.

LCC read the same zero straight off the view over the whole corpus. Two lanes,
two routes, the same zero. **Nothing in this corpus can currently be shown to be
citable substantive authority on positive evidence** — not because the documents
are bad, but because almost nothing has been screened.

## 2. Most of what is reachable is reachable on no evidence

```
admission reason, among 13,842 reachable            rows     share
no role evidence AND no script evidence           12,169     87.9%
role decided, no script evidence                     933      6.7%
role bail_order, no script evidence                  637      4.6%
role procedural_disposal, no script evidence         103      0.7%
```

**87.9% has never been read by anything.** That figure was **94.1%** twelve hours
earlier, and the difference is this lane's classifier walking the id space ahead
of NEW1's embedding walk: role coverage among reachable rows went from 5.9% to
12.1% in half a day. The frontier moved from 12.5% to 18.8% of the key space over
the same period, against NEW1 at roughly 1.1%.

### A correction this forces, and it is mine

My 0851 and my 0869 handoff priced the Tier-A selector at **60.9%**, as
`decided + decided_brief` over 864,685 rows, and said dropping `decided_brief`
would cost 24% of the rows.

**Both figures are wrong.** `decided_brief`'s rule is `disposal_nature_merits_short`
and `BRIEF_MAX_CHARS = 1500`, so every row of it is below the 2,000-character band
floor and **none of them was ever reachable**. Dropping it costs **zero rows**.
NEW1 reached the same conclusion independently from the manifest side (bus 0902),
and LCC confirmed that migration `0063`'s "about one percent" figure was wrong in
the same direction and for the same reason (bus 0920).

`decided_brief`'s 15.6% precision remains true. It just never touched the tier.

---

## 3. Mechanisms, ranked by measured size

| # | mechanism | measured | scaled |
| --- | --- | ---: | ---: |
| 1 | **reachable with no role evidence** — nothing has classified it | 87.9% | ~8,730,000 |
| 2 | **bail phrase present** — now a tier rather than an impurity, see below | 26.3% | ~2,610,000 |
| 3 | **unreadable text** — `axis_b_text` passes a NULL `script_quality` | 8.2% | ~815,000 |
| 4 | **duplicate members** — no dedup in the predicate | 11.2% | 845,876 exactly |
| 5 | **`decided` itself is 75.0% precise** | 25% of the labelled part | — |

### Mechanism 2 is no longer straightforwardly a defect

I first sent bail-in-Tier-A to NEW1 as an impurity mechanism. NEW1's
250-authority gold — every one an authority a real High Court judge really cited
— says judges cite bail orders in **12 of 250, 4.8%**. LCC took the decision on
that evidence: bail orders are reachable under `BAIL_ORDER_REACHABLE`.

My own code never made that mistake, which is the awkward part: `quality-state.ts`
maps `bail_order` to `citable_with_care` — usable, not precedent — and never to
`not_citable`. The bus message was harsher than the function.

What the measurement says, stated neutrally: **3,644 of 13,842 reachable
documents carry a bail phrase, 26.3%**, and 2,983 of those (81.9%) still have no
class label. That share was 99.2% before the classifier started; it is falling as
the walk proceeds. Whether that population belongs in a tier is settled; what the
number now measures is how much of it the view can *see*.

### The recall bug in the deployed bail rule

`hc-classify.ts` spells `BAIL_PHRASE` with literal single spaces. Extracted PDF
text wraps lines wherever the PDF did, so document `26573ee8` reading
`...be released on\nbail.` scores false.

```
deployed pattern              3,450
whitespace-tolerant           3,644
missed by the deployed rule     194   +5.6% relative recall
```

Fixed in `quality-state.ts` with `BAIL_PHRASE_AS_DEPLOYED` kept beside it so both
stay measurable, and a test asserting the deployed one misses the wrapped case.
**`hc-classify.ts` is deliberately untouched** while its walk is mid-run: a rule
change now splits the corpus across two rule sets, which is the
stale-classifier-state defect this audit set out to find. It wants a `--restale`
pass and a deliberate moment.

---

## 4. The unreadable population, with the PDF's own evidence

### It is not the legacy-font mode, and the existing screen cannot see it

The mined-marker screen fired on **1 of 13,842** reachable documents. Meanwhile
1,141 of them carry text like:

```
74< =7/ 12- <.50 7==-4;-< < <8;2 47 541-/=-/-4;- 5< ;.33-0 =7/ -4;- 12- .>>-.3 5< 05<:5<<-0
```

The marker list was mined from Kruti-Dev-family Hindi, so it recognises the ASCII
that **one** broken encoding produces. This is a different one.

An **English function-word density** screen finds it. The distribution over the
reachable population is bimodal with a clear valley:

```
per 1,000 chars    0-1     1-12    12-40      40+
rows               475      666      672   12,029
                  3.4%     4.8%     4.9%    86.9%
```

Documents were read on both sides of the valley before the floor was chosen.
Below 12 they are unreadable and their only real text is the digital-signature
appliance's footer — `I attest to the accuracy and integrity of this document`.
Between 12 and 40 they are readable English with OCR spacing damage
(`Not e:`, `Chandr a Shar ma`) — **degraded, not unsafe** — so the floor is not
raised to catch them.

### It is court-shaped, and two courts carry all of it

```
court                              reachable   unreadable   share
High Court of Punjab and Haryana       1,133          600   53.0%
High Court of Karnataka                  954          463   48.5%
High Court of Tripura                     23            3   13.0%
High Court Of Rajasthan                  719           28    3.9%
High Court Of Chhattisgarh               494           15    3.0%
...every other court                                         < 1.7%
Madras, Gujarat, Orissa, Calcutta,
Uttarakhand, Supreme Court                 —            0    0.0%
```

Two courts hold 1,063 of the 1,141 — **93.2% of the damage in two registries.**
A corpus-wide 8.2% conceals a court at 53.0%, which is the same shape as the
embedding-coverage finding where 18 of 26 courts sat at exactly zero behind one
healthy percentage.

### `text_quality` does not merely miss them — it certifies them

```
unreadable rows carrying a text_quality score   1,141 / 1,141
minimum score                                   0.850
median score                                    1.000
scoring >= 0.85, i.e. PASSING axis_b_text       1,141 / 1,141
```

Every one. The cause is in `textQuality()`: it tokenises on `/[A-Za-z]/` and
scores damage as interior punctuation or a mid-word case flip. Substitution
garbage is mostly digits and punctuation, so those tokens are **excluded from the
denominator entirely** — the metric ends up measuring the surviving signature
block and reporting 1.000.

### PDF-native evidence, with a control group from the same courts

`text-unsafe-probe-cli.ts`, 160 PDFs fetched from Punjab & Haryana (`3_22`) and
Karnataka (`29_3`), suspects and controls drawn from the same uniform draw:

```
group      drawn   pdf   font-readable   noToUnicode   share    legacy font name   median English rate
suspect       80    80              78            60   76.9%                   0                  1.19
control       80    80              78             8   10.3%                   0                 58.29
```

Per court: P&H 75.0% vs 7.5%; Karnataka 78.9% vs 13.2%.

**Zero documents on either side carry a legacy-font family name.** The fonts are
subset-embedded standard faces — `MYGXBS+Helvetica`, `SEZZNQ+Times-Roman`,
`TPCYNW+Courier` — declared with no `/ToUnicode` map. Any extractor emits raw
glyph codes; the mapping is not in the file.

**So a re-extraction cannot fix these.** That is the operational consequence and
it is why the probe was worth running rather than inferring: 76.9% of this
population is an OCR question, not an extractor question. The 18 of 78 that do
carry a ToUnicode map are the cheap half to try first.

### What it cost downstream, measured on LCC's model run

LCC sent 1,000 rows of this lane's near-tie manifest to a model. Evaluated
independently with the density screen (`candidate-eval-cli.ts`):

```
unreadable documents in the run          163 of 1,000   16.3%
  ...of the run's span_not_found         100 of   169   59.2%
  ...of its no_evidence_offered           38 of    54   70.4%
  ...spans "verified" inside garbage      25 of   773    3.2%
```

**The majority of a fabrication-shaped number was a corpus-damage number.** The
model mostly behaved: 138 of the 163 returned no class at all. The 25 verified
spans are the worse half — a substring match against glyph codes passes and
carries no information, which is worse than a check that fails.

`disposal-manifest-cli.ts` now screens these out before the queue is built. On a
fresh 40,000-row walk it removes 2,950 rows — **30.9% of what would otherwise
have entered the model queue.**

---

## 5. Adjudication — what the reachable rows actually are

85 reachable documents read by hand from the **operative text at the end**, never
the cause title. Two sittings, 40 and 45 rows, drawn uniformly.

```
HIGH-CONFIDENCE SUBSTANTIVE     26    30.6%
NON-SUBSTANTIVE / PROCEDURAL    34    40.0%
UNCERTAIN                       23    27.1%
TEXT UNSAFE                      2     2.4%
```

95% interval on the substantive share, n=85: roughly **21% to 41%**.

The non-substantive half is not exotic. It is bail orders; disposals directing an
authority to decide a representation; withdrawals; infructuous closures;
condonation refusals; mediation settlements; office-objection notes; and
follow-on orders disposing "in the same terms as" another case. One of those
follow-on orders is **119,374 characters** and carries no independent ratio at
all — length is not substance, and the value band is the only substance proxy the
predicate has.

45 of these are held out as an answer key with the reason recorded per row,
written before any model output existed:
`docs/ops/migration/new2-heldout-key.json`, questions without answers in
`new2-heldout-questions.json`. **Zero overlap with LCC's 1,000** — checked, and
by construction: theirs are near-ties, these are uniform draws from the reachable
population.

### Citation presence, and the gradient the tail-only bug had hidden

**84.4% of reachable documents contain no citation-shaped string**, and unlike
every other figure here it varies strongly with length:

```
standard      6,937 / 7,575   91.6%
full          3,176 / 3,879   81.9%
substantial   1,602 / 2,388   67.1%
```

A substantial document is roughly three times more likely to cite something than a
standard one. That gradient is what reasoned authority should look like, and LCC
cited it as the evidence for keeping the 2,000-character floor against NEW1's
finding that it refuses 7.2% of real authorities.

---

## 6. What is NOT wrong

* **Identity holds.** 2 of 25,000 draws fail axis A — 0.008%, against the full
  census figure of 2,703 in 17.9M, which is 0.015%. Identity is not the
  discriminator in this corpus.
* **Duplicate groups are real common orders, not a data defect.** All 40 of the
  largest groups are single-court. The largest is 7,118 members — one Madras writ
  order across thousands of petitions. No case identity is collapsed anywhere;
  only the embedding is shared, and only for byte-identical text.
  `docs/ops/migration/new2-duplicate-groups.json`.
* **The role classes are sound.** NEW1's adjudication scored `bail_order` 50/50
  and `procedural_disposal` 49/50. The classes are right; what was wrong was a
  policy reading one of them as "unreachable", and that is now fixed.
* **Length is doing essentially all the exclusion**, and correctly: of 11,158
  rejected draws, **10,672 — 95.6% — are rejected for being under 2,000
  characters**. Text rejects 484 and identity 2. Under contract v2 neither role
  nor bail rejects anything at all, which is why they no longer appear as
  rejection reasons.

The classes among rejected rows are a property of that population, not a cause of
it: 475 `procedural_disposal`, 393 `decided_brief`, 217 `bail_order`, 196
`reference_stub` and 170 `decided` are all rejected on **length**.

---

## 7. The one-line version

The semantic core is not admitting the wrong documents because its rules are
wrong. It is admitting them because **its rules have almost nothing to read** —
87.9% and falling — and because one of the two columns it does read,
`text_quality`, reports 1.000 on text that is not language.
