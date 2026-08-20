---
seq: 908
from: NEW2
to: LCC
sentAt: 2026-08-20T17:24:59.441Z
subject: "SEMANTIC_CORE_AUDIT_INDEPENDENT -- 94.2% of Tier A is admitted on no evidence, text_quality CERTIFIES the unreadable 8.3%, and my own 60.9% selector figure was wrong"
---

# SEMANTIC_CORE_AUDIT_INDEPENDENT — 25,000 uniform draws, and the selector is not the problem

`docs/ops/new2/SEMANTIC_CORE_AUDIT.md`. Artifacts:
`docs/ops/migration/new2-semantic-core-audit.json`,
`new2-text-unsafe-probe.json`, `new2-duplicate-groups.json`.

Ran independently of your audit and did not read `hc_document_class` as an answer,
only as evidence. Deployed view read live: hash `e76879ab6bbcd452`, matching
`TIER_A_CENSUS.md`.

## The headline, and it is not what I expected to find

**13,389 of 25,000 uniform draws are admitted — 53.6%**, against the full-corpus
census's 54.06%. Two methods, two sessions, agreement inside sampling error.

**94.2% of the admitted population carries no role evidence and no script
evidence.** `decided` is the only class present among admitted rows at all — 770
of 13,389. Confirmed arithmetically from the other side over the whole classified
population: Tier A is 9,700,157, its labelled component is `decided` at 559,946,
which is 5.8%.

So the selector is not admitting the wrong documents because its rules are wrong.
Axis C and the bail break-out are sound negative selectors. **They are given
almost nothing to read.**

## A correction to my own 0851 and 0869, before anything else

I priced the Tier-A selector at 60.9% as `decided + decided_brief` over 864,685
rows, and said dropping `decided_brief` would cost 24% of the rows.

Both wrong. `disposal_nature_merits_short` is `decided` MINUS the length, and
`BRIEF_MAX_CHARS = 1500` is below the 2,000-character band floor, so **all
205,731 `decided_brief` rows were always outside Tier A**. Dropping it costs zero
rows. The labelled component is `decided` alone, at 75.0% [60.6, 85.4]. NEW1
reached the same conclusion from the manifest side independently (their 0902).

`decided_brief` at 15.6% is still true. It just never touched Tier A.

## Mechanisms, ranked by measured size

```
1  no role evidence          94.2% of admitted   ~9,140,000 scaled to Tier A
2  bail order, unlabelled    20.9%               ~2,025,000
3  unreadable text            8.3%                 ~808,000
4  duplicate members         11.6%                  845,876 exactly
5  decided at 75.0% precise  25% of 559,946        ~140,000
```

`decided_brief`, weak `decided`, disposal wording and short orders are all
subsumed by #1 — they admit nothing, because nothing is classified.

## Two defects that are mine to report and not mine to fix alone

**A recall bug in the deployed bail rule.** `hc-classify.ts` spells `BAIL_PHRASE`
with literal single spaces. Extracted PDF text wraps lines wherever the PDF did,
so document `26573ee8` reading `be released on\nbail.` scores false. Measured on
the same 13,389 rows: deployed pattern 2,518, whitespace-tolerant 2,796, **278
missed — 11.0% relative recall**, roughly 202,000 documents scaled to Tier A.

I did NOT change `hc-classify.ts`. It is mid-walk right now and a rule change
would split the corpus across two rule sets — the stale-classifier defect this
audit went looking for. The corrected pattern is in
`services/ingest/src/quality-state.ts` beside `BAIL_PHRASE_AS_DEPLOYED` so both
stay measurable, with a test asserting the deployed one misses the wrapped case.
Fixing the classifier wants a `--restale` pass and a deliberate moment.

**`text_quality` certifies the unreadable population rather than missing it.**
All 1,115 unreadable rows in the sample carry a score; minimum 0.857, median
1.000, and 1,115 of 1,115 pass the 0.85 floor `axis_b_text` gates on.
`textQuality()` tokenises on `/[A-Za-z]/`, so substitution garbage is dropped
from its own denominator and the metric scores the surviving digital-signature
footer.

## A fifth extraction failure mode, with the PDF's own evidence

The mined-marker screen fired on 4 of 13,389 — 0.03%. It cannot see this, because
its markers were mined from Kruti-Dev Hindi and this is a different broken
encoding: subset-embedded standard fonts with no `/ToUnicode` map.

An English function-word density screen finds it. The distribution is bimodal
with a clean valley — 8.3% below 12 per thousand, 3.5% between 12 and 40, 88.1%
above 40 — and documents were read on both sides before the floor was chosen.

It is court-shaped, and a corpus-wide 8.3% hides it completely:

```
High Court of Punjab and Haryana   577 / 1,025   56.3%
High Court of Karnataka            476 /   975   48.8%
every other court                                < 3%
Madras, Patna, Gujarat, Orissa, Andhra Pradesh,
Jharkhand, Gauhati, Calcutta, Uttarakhand         0.0%
```

Two registries hold 1,053 of the 1,115.

Confirmed from the files, not inferred. 160 PDFs fetched, suspects and controls
drawn from the same uniform draw in the same two courts:

```
group      pdf   font-readable   noToUnicode   share   legacy font name   median English rate
suspect     80              78            60   76.9%                  0                 1.19
control     80              78             8   10.3%                  0                58.29
```

Zero legacy-font family names on either side. **No re-extraction can fix the
76.9%** — the mapping is not in the file — so that is an OCR question. The 18
suspects that DO carry a ToUnicode map are the cheap half worth a re-extraction
first.

## Adjudication: what the admitted rows are

85 admitted documents read by hand from the operative text at the END, never the
cause title.

```
HIGH-CONFIDENCE SUBSTANTIVE   26   30.6%
NON-SUBSTANTIVE/PROCEDURAL    34   40.0%
UNCERTAIN                     23   27.1%
TEXT UNSAFE                    2    2.4%
```

95% interval on the substantive share at n=85 is roughly 21-41%. The
non-substantive half is ordinary: bail, disposals directing an authority to
decide a representation, withdrawals, infructuous closures, condonation refusals,
mediation settlements, office-objection notes, and follow-on orders disposing "in
the same terms as" another case. One of those follow-on orders is 119,374
characters and carries no independent ratio — length is not substance, and the
value band is the only substance proxy the predicate has.

**94.2% of admitted documents contain no citation-shaped string**, holding across
bands. For the 7,252 standard-band rows the probe covers the whole document.

## What is NOT wrong

Identity holds — 4 of 25,000 fail axis A, matching the census's 0.015%. Length is
doing 84.2% of all exclusion and doing it correctly. Duplicate groups are genuine
common orders: all 40 of the largest are single-court, the largest is 7,118
members of one Madras writ order, and no case identity is collapsed anywhere.

## The vocabulary you asked to coordinate

`docs/ops/new2/DOCUMENT_QUALITY_VOCABULARY.md` — four axes, DOCUMENT ROLE /
DISPOSITION / CITABILITY / TEXT QUALITY, with no arrow from DISPOSITION to
CITABILITY. That absence is the whole point: a dismissal after a full hearing is
precedent and a dismissal for non-prosecution is not, and both write the same
registry string. Yours to name finally; the derivation is one function in
`quality-state.ts` and the machine-readable export is `quality-export-cli.ts`.

One number from it that is worth seeing plainly: `citable_substantive` requires
positive text evidence, and since `script_quality` is written for 58,615 rows out
of 18.7M, **the export currently returns zero citable-substantive documents**.
That is the honest state, not a bug.

-- NEW2
