# What the semantic core actually admits — NEW2's independent audit

20 August 2026. Deployed view `judgment_embedding_eligibility`, hash
`e76879ab6bbcd452`, read live rather than from a file.

Everything below is measured on this corpus. Where a number is a floor it says so.

---

## The method, and why it is not the class-precision sample again

`hc-class-precision-cli.ts` draws rows stratified **by class**, which measures how
often a label is right. Useful, and a different question.

The selector that decides what gets a vector is the view, and the class label is
one of its five conjuncts. Three of the others admit on the **absence** of
evidence:

```
axis_a_identity   content_hash, case_number, judgment_date, court, case_title > 3 chars
axis_b_text       full_text present AND text_quality >= 0.85
                  AND (script_quality IS NULL OR IN ('clean','mixed_script_ok'))
axis_c_role       hc_document_class IS NULL
                  OR class NOT IN ('procedural_disposal','reference_stub')
is_bail_order     class = 'bail_order', broken out separately
value_band        length(full_text) >= 2000
```

A class-stratified sample cannot see any of that — it only draws rows that HAVE a
class. So this audit samples the **admitted population**: 25,000 uniform draws
over `judgments.id` (uuid v4, so a draw above a random uuid is uniform over rows,
at one index descent each), the predicate re-evaluated per row so that admission
can be attributed to a single conjunct.

`semantic-core-audit-cli.ts` · `docs/ops/migration/new2-semantic-core-audit.json`

**13,389 of 25,000 draws are admitted — 53.6%.** The full-corpus census says
54.06%. Two methods, two sessions, agreement inside sampling error; the audit is
measuring the same thing the census measured.

---

## 1. Ninety-four per cent of Tier A is admitted on no evidence at all

```
admission reason, among 13,389 admitted           rows     share
no role evidence AND no script evidence          12,619     94.2%
role decided, no script evidence                    770      5.8%
```

Not "classified and found substantive". **Nothing has ever read 94.2% of what the
semantic core admits.** `decided` is the ONLY class present among admitted rows;
every other class is either refused by the predicate or, in `decided_brief`'s
case, structurally too short to reach it.

Confirmed arithmetically from the other direction, over the whole classified
population rather than a sample:

```
class                 rows    >= 2,000 chars    in Tier A
decided            658,954         570,452       559,946
bail_order         515,125         400,917             0   broken out
decided_brief      205,731               0             0   every row is under 1,500 chars
procedural_disposal 372,784          69,239             0   refused by axis C
reference_stub     113,973               0             0
```

Tier A is 9,700,157 documents. The labelled part of it is `decided` — 559,946 —
which is **5.8%**. The other 94.2% carries no role label. The two methods agree
to within a rounding error.

### The correction this forces, and it is mine

My 0851 and my 0869 handoff priced the Tier-A selector at **60.9%**, as
`decided + decided_brief` over 864,685 rows, and said dropping `decided_brief`
would cost 24% of the rows.

**Both figures are wrong.** `decided_brief`'s rule is `disposal_nature_merits_short`
and `BRIEF_MAX_CHARS = 1500`, so every row of it is below the 2,000-character band
floor and **none of them was ever in Tier A**. Dropping it costs **zero rows**,
not 24%.

The Tier-A selector's labelled component is `decided` alone, at **75.0%**
[60.6, 85.4]. NEW1 reached the same conclusion independently and from the
manifest side (bus 0902) — 0 occurrences of `decided_brief` in a 409,647-row
sample across 41 batches.

`decided_brief`'s 15.6% precision remains true and remains worth knowing. It just
never touched Tier A.

---

## 2. The false-positive mechanisms, ranked by measured size

| # | mechanism | measured | scaled to Tier A |
| --- | --- | ---: | ---: |
| 1 | **admitted with no role evidence** — `axis_c_role` passes `NULL` | 94.2% of admitted | ~9,140,000 |
| 2 | **bail orders with no class label** — the break-out needs a label | 20.9% of admitted | ~2,025,000 |
| 3 | **unreadable text** — `axis_b_text` passes `NULL` script quality | 8.3% of admitted | ~808,000 |
| 4 | **duplicate members** — no dedup in the predicate | 11.6% of admitted | 845,876 exactly |
| 5 | **`decided` itself is 75.0% precise** | 25% of 559,946 | ~140,000 |

`decided_brief`, weak `decided` classification, and disposal wording are all
subsumed by #1: they are not admitting anything, because nothing is classified.

### Mechanism 2 — bail orders, and a recall bug in the deployed rule

The view breaks bail orders out on `hc_document_class = 'bail_order'`. That is a
**label**, so a bail order nothing has classified is not broken out at all.

```
admitted documents matching a bail phrase        2,796   20.9%
  ...of which carry no class label               2,781   99.5%
```

While adjudicating I found why the number is still a floor. Document `26573ee8`
reads `...be released on\nbail.` — the PDF wrapped the line. `hc-classify.ts`
spells its patterns with literal single spaces, so it scores false.

A whitespace-tolerant pattern, measured on the same 13,389 rows:

```
deployed pattern              2,518
whitespace-tolerant           2,796
missed by the deployed rule     278   +11.0% relative recall
```

Scaled: roughly **202,000 bail orders in Tier A that the production classifier
cannot see**, on top of the ~1.8M it could see if the rows were classified at all.

Fixed in `quality-state.ts` with `BAIL_PHRASE_AS_DEPLOYED` kept beside it so both
can be measured. `quality-state.test.ts` asserts the wrapped case matches and the
deployed pattern misses it — that second assertion is the one to delete, in the
same commit, when `hc-classify.ts` is fixed and the corpus is `--restale`d.

**Not changed in `hc-classify.ts`, deliberately.** That classifier is running
right now; changing its rule mid-walk would create two populations under two rule
sets, which is exactly the stale-classifier-state defect this audit set out to
find.

---

## 3. The unreadable population, with the PDF's own evidence

### It is not the legacy-font mode, and the existing screen cannot see it

The mined-marker screen fired on **4 of 13,389** admitted documents — 0.03%.
Meanwhile 1,115 of them carry text like:

```
74< =7/ 12- <.50 7==-4;-< < <8;2 47 541-/=-/-4;- 5< ;.33-0 =7/ -4;- 12- .>>-.3 5< 05<:5<<-0
```

The marker list was mined from Kruti-Dev-family Hindi, so it recognises the ASCII
that **one** broken encoding produces. This is a different one.

An **English function-word density** screen finds it. The distribution over the
admitted population is bimodal with a clear valley:

```
per 1,000 chars    0-1     1-12    12-40      40+
rows               505      610      473   11,801
                  3.8%     4.6%     3.5%    88.1%
```

Documents were read on both sides of the valley before the floor was chosen.
Below 12 they are unreadable and their only real text is the digital-signature
appliance's footer — `I attest to the accuracy and integrity of this document`.
Between 12 and 40 they are readable English with OCR spacing damage
(`Not e:`, `Chandr a Shar ma`) — **degraded, not unsafe** — so the floor is not
raised to catch them.

### It is court-shaped, and two courts carry all of it

```
court                              admitted   unreadable   share
High Court of Punjab and Haryana      1,025          577   56.3%
High Court of Karnataka                 975          476   48.8%
High Court of Tripura                     21           2    9.5%
High Court of Jammu and Kashmir           45           2    4.4%
High Court Of Rajasthan                  685          20    2.9%
...every other court                                        < 1.5%
Madras, Patna, Gujarat, Orissa,
Andhra Pradesh, Jharkhand, Gauhati,
Calcutta, Uttarakhand, Supreme Court       —           0    0.0%
```

Two courts hold 1,053 of the 1,115 — **94.4% of the damage in two registries.**
A corpus-wide 8.3% conceals a court at 56.3%,
which is the same shape as the embedding-coverage finding where 18 of 26 courts
sat at exactly zero behind one healthy percentage.

### `text_quality` does not merely miss them — it certifies them

```
unreadable rows carrying a text_quality score   1,115 / 1,115
minimum score                                   0.857
median score                                    1.000
scoring >= 0.85, i.e. PASSING axis_b_text       1,115 / 1,115
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
population is an OCR question, not an extractor question.

18 of the 78 font-readable suspects **do** carry a ToUnicode map. Those are the
candidate re-extraction wins and are the cheap half to try first.

---

## 4. Adjudication — what the admitted rows actually are

85 admitted documents read by hand from the **operative text at the end**, never
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

**94.2% of admitted documents contain no citation-shaped string**, and it holds
across bands (standard 94.8%, full 94.0%, substantial 92.6%). For the standard
band — 7,252 of the 13,389 — the probe covers the whole document, so there it is
close to a whole-document fact rather than a fact about an excerpt.

---

## 5. What is NOT wrong

* **Identity holds.** 4 of 25,000 draws fail axis A — 0.016%, against the
  census's 2,703 of 17.9M, which is 0.015%. Identity is not the discriminator in
  this corpus.
* **Duplicate groups are real common orders, not a data defect.** All 40 of the
  largest groups are single-court. The largest is 7,118 members — one Madras writ
  order across thousands of petitions. No case identity is collapsed anywhere;
  only the embedding is shared, and only for byte-identical text.
  `docs/ops/migration/new2-duplicate-groups.json`.
* **The bail break-out and axis C are sound as negative selectors.** They refuse
  what they are given. The defect is that they are given almost nothing.
* **Length is doing essentially all the exclusion**, and correctly: of 11,611
  rejected draws, **9,778 — 84.2% — are rejected for being under 2,000
  characters**. Everything else combined rejects 1,833: bail 695, role 648, text
  486, identity 4.

---

## 6. The one-line version

The semantic core is not admitting the wrong documents because its rules are
wrong. It is admitting them because **its rules have almost nothing to read**,
and because one of the two columns it does read — `text_quality` — reports 1.000
on text that is not language.
