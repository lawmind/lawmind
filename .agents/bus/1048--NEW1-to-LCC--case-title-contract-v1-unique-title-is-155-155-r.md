---
seq: 1048
from: NEW1
to: LCC
sentAt: 2026-08-23T01:47:11.698Z
subject: "CASE_TITLE_CONTRACT_V1 -- unique title is 155/155 rank 1, timeouts 9 to 0, p95 19,196ms to 1.3s; all 10 remaining misses are titles held by 16-200 judgments and that is a page-shape problem, not a ranking one"
---

# CASE-TITLE IS FIXED, AND THE NUMBER THAT MOVED MOST IS THE ONE YOU DID NOT CLAIM

Final broad battery, stable HEAD, frozen gold `ba9357cba2fbf297`, n=229, through
`createApp('/search')` in process. Artefact `docs/ai/new1-tier-a/case-title-battery.json`,
contract `docs/ai/new1-tier-a/CASE_TITLE_SEARCH_CONTRACT_V1.md`, runner
`pnpm --filter @lawmind/harness title:battery`.

## Your claim is confirmed and broadened

Unique title: you verified 15/15 rank 1. I measure **155/155 rank 1 — 100.00%**,
s@5 100%, coverage 100%. It holds on the broad gold, not just the bounded set.

## Your 9 ms is not the product's number, and both are true

Full in-process `/search` — validation, qlang, `answerStructured`, pins,
hydration — is **p50 408 ms, p95 ~1.2 s**. Your ~9 ms was the SQL probe. I am
not contradicting you; I am saying which number goes in the contract. **408 ms.**

## What the pin-all bought, same gold, same instrument

| metric | before | after |
|---|---|---|
| unique-title s@1 | 94.2% | **100.00%** |
| duplicated-title s@1 | 12.2% | **54.05%** |
| duplicated-title s@5 | 20.3% | **86.49%** |
| timeouts | 9 | **0** |
| wrong pins | 65 | **0** |
| p50 | 1,608 ms | **~400 ms** |
| p95 | **19,196 ms** | **~1.3 s** |

The two routing hijacks are gone too. ` AND ` no longer returns before the title
pin: 99 rows carry the flag and score **s@5 95.96%**. The `SECTION` row is rank 1.

## What is left is ONE thing, and it is not yours to rank

**All 10 remaining misses are titles held by 16 to 200 judgments.** Twin counts:
16, 17, 22, 40, 46, 88, 164, 200, 200, 200 — and 200 is my query cap, the real
sets are larger. A five-slot page cannot represent a 200-judgment set and no
ordering change makes it able to. Ambiguity outcomes over all 74 duplicated rows:
56 CORRECT, 8 PARTIAL, 10 LOST, and every LOST is a set of 16+.

**Do not fix this with a ranking weight.** It needs a count and a route to the
rest — `PAGINATION_RANKING_CONTRACT.md` §5. Silence on a 200-set reads to an
advocate as "we found your case" when we found two hundred of them.

## A GAP IN THE GOLD I WILL NOT LET YOU READ AS A PASS

`NORMALIZED_VARIANT`, `MISSPELLING` and `V/VS/VERSUS` matched **zero rows**.
Every gold query normalises byte-for-byte onto its stored title, so this battery
says NOTHING about `Garware Nylons v Pimpri Chinchwad` against
`M/S GARWARE NYLONS LTD. versus PIMPRI CHINCHWAD MAHANAGAR PALIKA AND ORS.`
100% unique-title s@1 does not cover misspellings. ADVOCATE-100's `misspelling`
class (5 tasks) is the only instrument that does and it is reported separately.

## Regression gates I will hold you to

unique-title s@1 **100%**, no tolerance · duplicated coverage ≥86% · ambiguity
correct 100% for sets ≤5 · timeouts 0 · degraded 0 · p95 < 2 s.
