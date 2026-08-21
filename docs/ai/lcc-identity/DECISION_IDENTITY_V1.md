# Decision identity — Chipade is not an anecdote, and a CNR is not a decision

**21 August 2026 · LCC · P10**

Two measurements, both corpus-wide, both taken before the module that acts on
them was finished. The second one changed the module.

## 1. `content_hash` misses duplicates at a scale nobody had measured

```
CNRs carried by more than one row                     336,209
rows involved                                       1,072,353
of those groups, ones with DIFFERING content_hash      272,095
```

Chipade — one real Bombay decision held twice, two source partitions, two
OCR passes, two hashes — is the shape of **272,095 groups**, not of one case.

`judgments.cnr` is not derived and not guessed. `backfill-cnr.ts` re-reads the
same AWS Open Data metadata the original ingest read, matches by the same
url-construction functions the loaders use, and **skips a url reachable from two
metadata rows with disagreeing CNRs rather than picking one**. So a shared CNR is
a shared registry identity, not an artefact of ours.

## 2. …and a CNR identifies a CASE, not a DECISION

This is the correction, and it arrived before anything consumed the module.

One case produces an interim order, an injunction, a final judgment — separate
rows, separate dates, all correctly sharing one CNR. On CNR alone the identity
layer would have called all 336,209 groups duplicate decisions and been wrong
about most of them.

Adding the judgment date:

```
(cnr, judgment_date) groups holding more than one row     135,110
rows involved                                             271,233
of those, groups with DIFFERING content_hash               91,699
```

**201,099 of the 336,209 groups were the corpus being right** — one case at
several stages — and they are now `SAME_CASE_DIFFERENT_DATE`, a timeline edge
that is never promotable, because those are two real decisions and merging them
would delete one.

## The four strengths, and why only two may act without a person

| strength | evidence | promotable |
|---|---|---|
| `CNR_EXACT` | same CNR **and** same judgment date | yes |
| `CITATION_EXACT` | same neutral citation | yes |
| `REGISTRY_STRONG` | same court + date + normalised case number | **no** |
| `CAPTION_WEAK` | same court + date + normalised caption, different numbers | **no** |
| `SAME_CASE_DIFFERENT_DATE` | same CNR, different dates | **no** — different relation |

`REGISTRY_STRONG` looks convincing and is not: one court issues `WP/1234/2021`
from two benches in a year, and a shared judgment date does not separate them.

`CAPTION_WEAK` is the **common-order shape** — one text, one day, one bench,
hundreds of genuinely separate petitions. It is emitted so it can be counted and
excluded, never so it can be merged. Collapsing it would destroy the distinction
that lets an advocate find their own matter.

## What is deliberately absent

**No stemming. No token overlap. No edit distance. No merge.** Each of the first
three converts a comparison that cannot produce a false positive into one that
can, and the module's whole value is that its two promotable strengths cannot.
Nothing writes to `judgments`, nothing deletes, nothing rewrites a
`content_hash`.

Normalisation is punctuation, whitespace, case, and a short table of registry
abbreviations that are pure formatting. `CRLA` and `CRIMINALAPPEAL` fold;
**`CRLA` and `CRLMA` never do** — they are different case types.

The `No.` rule was found by a test rather than foreseen: `W.P.(C) No. 1234 of
2021` and `WP(C)/1234/2021` did not compare equal until a serial-number label
was stripped, anchored so it can only ever remove a label and never the tail of a
case type.

## The residual risk, written down rather than left to be found

A court can pass **two separate orders in one case on one day** — an interim
direction and a disposal. Both carry the same CNR and the same `judgment_date`,
and `CNR_EXACT` would call them one decision.

It stays promotable on two grounds, and both are stated in the code as
`CNR_EXACT_RESIDUAL_RISK`:

1. every candidate reports `hashesDiffer`, so a consumer can require agreement;
2. the failure is **bounded** — a wrong link between two orders of the SAME case
   shows an advocate a document from their own matter, which is recoverable, and
   is not the cross-matter contamination that would not be.

## What is NOT known, and is the next measurement

Of the 91,699 differing-hash groups, **how many are the same document from two
source partitions, and how many are two orders on one day?** The two want
opposite treatment and this document does not claim to know the split. A bounded
inspection over one CNR prefix range was still running when this was written;
the honest position until it lands is that 91,699 is an upper bound on the
duplicate-decision population and not an estimate of it.

Nothing has been merged, so nothing depends on the answer yet.
