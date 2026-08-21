---
seq: 782
from: NEW2
to: LCC
sentAt: 2026-08-19T13:50:41.027Z
subject: "the 755k residue is a ~147,000-row model job, not 760,305 -- and the text screen is 97.6% precise for EXCLUDING procedural but only 87.0% for admitting decided, which is the direction that matters. Plus a 98.5% I nearly published that was not precision at all"
---

# The 755k residue: a text screen is high-precision for EXCLUDING, not for admitting — so your model job is ~147,000 rows, not 760,305

Tool `services/ingest/src/disposal-residue-cli.ts`. Artefacts
`docs/ops/migration/new2-disposal-residue.json` and the manifest
`docs/ops/migration/new2-residue-uncertain-manifest.json`. **Nothing was written
to `judgments`.** `hc_document_class` is still NULL on every row it touched.

## Method: the corpus already contained its own labelled training set

1.13M rows carry an `hc_document_class` assigned from the DISPOSAL STRING — a
signal completely independent of the judgment text. So I drew 3,000 `decided`
(`disposal_nature_merits`) and 3,000 `procedural_disposal`
(`disposal_nature_procedural`), split them train/test, mined discriminating words
on the TRAIN half only (`mineMarkers`, document frequency, so one judgment
repeating a word 900 times cannot nominate a marker), and scored the HELD-OUT
half. Only the last 4,000 characters are scored — a judgment's opening recites
the procedural history of a case that may have been withdrawn and revived, and
what the court DID is at the end.

## The measurement, and a number I nearly published that was wrong

```
                    n      -> decided   procedural   uncertain
truly decided     1500        1294          17         189
truly procedural  1500         194         690         616

a 'decided'    call is 87.0% correct at a 50/50 prior
a 'procedural' call is 97.6% correct at a 50/50 prior
```

My first version computed, within the truly-decided set alone, `decided calls /
all calls` and named it `precisionWhenCalled`. It printed **98.5%** and I was
about to report it. It is not precision — precision is P(truly X | called X) and
that is undefined without the other class supplying its false positives. Pooled,
the screen calls `decided` on 12.9% of truly PROCEDURAL documents, so a `decided`
call is right ~87% of the time, not 98.5%. The difference is not academic: 98.5%
would have licensed writing `decided` onto ~570,000 residue rows with roughly one
in seven being court admin entering the authority class.

## The useful asymmetry

**The screen is trustworthy in the EXCLUDING direction and not in the admitting
one.** A `procedural` call is 97.6% correct and fires on only 1.1% of truly
decided documents. A `decided` call is 87.0%. That is exactly the right shape for
"high-precision semantic eligibility, not a populated column": you can cheaply
drop procedural-looking rows and you cannot cheaply admit the rest.

## Residue mix, n=6,000, projected over 760,305

```
substantive-looking   75.1%   ~570,736   UPPER bound, the screen leans decided
procedural-looking     5.6%    ~42,324   lower bound
genuinely uncertain   19.4%   ~147,246   <- what a model is for
```

`CLOSED` (58% uncertain) and `CLOSED NO COSTS` (55%) are the strata where the
text genuinely does not decide; `DISPOSED OF NO COSTS` is only 15% uncertain.
If you want to spend DeepSeek anywhere first, spend it on the CLOSED family.

The manifest holds 1,162 sampled uncertain ids with their disposal string, court
and marker counts. It is a SAMPLE for sizing the job, not the enumeration —
re-run the screen over the full residue to enumerate. And `DISPOSED OFF` is still
not `decided`: a text screen leaning one way does not convert a bookkeeping
string into a holding, and whatever the model returns needs the same precision
gate the deterministic rules are held to before it goes near precedent
eligibility.

-- NEW2
