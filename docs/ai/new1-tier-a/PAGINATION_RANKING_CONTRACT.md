# SEARCH PAGINATION — THE RANKING CONTRACT

NEW1, 22 Aug 2026. LCC owns the API implementation; this owns what continuation
must PRESERVE. Frozen gold `ba9357cba2fbf297`. Every number here is measured on
this box under LOCAL_CONTENDED and is labelled where it matters.

Status of the measurements this depends on:

| claim | evidence | state |
| --- | --- | --- |
| result #6 is unreachable | `RESULT_LIMIT = 5`, `route.ts:103`, no offset/cursor anywhere | PROVEN_BY_LIVE_CODE |
| an exact-title query can legitimately name 16 judgments | `case-title-decomposition.json` | PROVEN_BY_LIVE_DB |
| an exact citation can legitimately name 15 | `citation-ambiguity-regrade.json` | PROVEN_BY_LIVE_DB |
| identical `word_similarity` ties are broken by physical row order | `caseTitleTrigram` has no tie-break after `ORDER BY word_similarity DESC` | PROVEN_BY_LIVE_CODE |
| exact-identity pages are stable across executions | `rank-stability.json`, 6 of 6 | MEASURED |
| hybrid pages are NOT, and the cause is a degraded arm | `rank-stability.json`, 2 of 6 unstable, both `degradedVaried` | MEASURED |

---

## 1. Why this is a correctness problem and not a UX one

Today the product cannot show an advocate the sixth result. That is a product
gap on its own. What makes it a RANKING problem is what the last two rows of the
table above do together:

An exact-identity lookup — a citation, a case title — can be legitimately
ambiguous, and the honest answer to an ambiguous lookup is **all of the
candidates**. `2020 INSC 189` names three judgments; `R.SARAVANAN Vs THE
SUPERINTENDENT OF POLICE` names sixteen. A five-slot page that holds two pins
cannot express that answer. So pagination is not "more results please" — it is
the only mechanism by which an ambiguous identity lookup can be answered
completely, and `CITATION_HARNESS.md`'s zero silent-drop threshold is what makes
completeness non-negotiable rather than nice.

---

## 2. What continuation MUST preserve, per result kind

**The rule that governs all five: a judgment that was reachable on page 1 + page
2 taken together must not become unreachable because the advocate turned the
page.** Everything below is that rule made specific.

### 2.1 Exact pin (citation / case title, unique)

- The pin is rank 1 on page 1 and appears **exactly once across all pages**.
- It must never reappear on page 2 as an ordinary ranked result, and must never
  be displaced by a later page's re-scoring.
- If the pin's lookup found nothing, no slot is reserved — the page is ordinary
  results, and page 2 must not suddenly acquire a pin.

### 2.2 Exact pin, AMBIGUOUS (the set case — the one that needs pagination most)

- The candidate set is the answer. It is ordered ONCE, at page 1, and that order
  is fixed for the continuation.
- Order rule: `judgment_date DESC, id ASC`. **Deliberately not a relevance
  order** — measured, `judgment_date DESC` puts the benchmark's gold first in 20
  of 74 ambiguous title sets and `length(full_text) DESC` in 43 of 74, and
  neither is evidence of what the advocate meant. A recency order does not claim
  to know; a relevance-shaped order would.
- The set is exhausted before ordinary ranked results begin. A 16-judgment title
  set fills page 1 and page 2 entirely, and the ordinary ranker starts after it.
- Every member carries court, judgment date and case number so the ambiguity is
  resolvable by the reader — the ambiguity is surfaced, never resolved for them.
- `ambiguous: true` (the flag the structured arm already emits) is set on every
  page of the set, not only the first.

**NEW2's bus 1019 changes what this set MEANS, and therefore the copy.** They
fetched the source PDFs: 155,388 neutral-citation groups covering 361,045
judgments, and **53.9% are duplicate documents, 30.7% are connected matters
decided by one common order, 13.9% are multiple orders in the same case** —
only 0.9% is a court's batch numbering and 0.1% is our extractor. `2025:PHHC:052490-DB`
is 253 connected writ petitions disposed of by one order, and every one of the
253 PDFs prints that citation on line 1.

So a multi-match is not a defect and usually not even an ambiguity: **a neutral
citation identifies a DISPOSAL EVENT, not a judgment.** The honest surface is
therefore *"this citation covers 253 connected matters"* rather than a warning,
and `exactCitation` declining to pin on 2+ stays exactly as it is. Anything that
assumes one citation names one judgment is wrong 26.3% of the time by
construction.

### 2.3 Structured result (qlang)

- A structured query is a FILTER: membership is decided by the predicate, not by
  a score, so page N must be the same predicate with a deterministic order.
- Order rule: whatever `compile.ts` emits, plus `id ASC` as a final tie-break.
  Without that last key a stable sort is not guaranteed and page 2 can repeat a
  row from page 1.
- `total` is already exact for structured queries; pagination must not turn an
  exact count into an estimate.

### 2.4 Case-title result (trigram, non-exact)

- `word_similarity` ties are dense here — every member of a duplicated-title set
  scores exactly 1.000 — so the ordering key MUST be
  `word_similarity DESC, judgment_date DESC, id ASC`.
- Without the trailing keys the order is physical row order, which is not stable
  across executions (an UPDATE moves a row) and therefore cannot be paginated by
  re-execution at all.

### 2.5 RRF hybrid

- RRF scores are relative to the candidate lists that produced them, so the
  ordering key must be `score DESC, id ASC` — ties in `1/(k+rank)` sums are
  common, and unbroken they are physical order again.
- **A degraded arm changes the ranking.** If the sparse arm times out on page 1
  and succeeds on page 2, page 2's ordering comes from a different fusion than
  page 1's, and rows can repeat or vanish. The contract therefore requires:
  the DEGRADED SET IS PART OF THE CONTINUATION STATE. A continuation must be
  executed with the same arms that produced page 1, or be honestly re-executed
  as a new search.

---

## 3. Duplicate prevention

The content-hash collapse in `retrieve.ts` keeps the highest-ranked member of a
byte-identical group. Under pagination that decision has to be made over the
whole continuation, not per page, or the second copy simply arrives on page 2.

Rule: the collapse key set is carried in the continuation state. A judgment
whose `content_hash` was already collapsed on an earlier page is not eligible on
a later one. Rows with a NULL `content_hash` are never collapsed — absent is not
equal — which is unchanged.

---

## 4. Filters

A filter change is a NEW search, never a continuation. The continuation token
must therefore bind the normalised query AND the filter set; presenting a token
from a different filter set is an error, not a silent re-execution. This is the
one place where being strict is cheaper than being helpful: a page 2 computed
under different filters is a page of judgments the advocate did not ask for,
labelled as ones they did.

---

## 5. Recommended mechanism

**Deterministic re-execution with a total order, NOT a materialised snapshot.
Measured viable for exact-identity pages today; hybrid pages wait on P4 (§6).**

The dossier proposed a 200-id snapshot with a 10-minute TTL. That is more
machinery than the evidence currently justifies, and it has its own failure mode
(a snapshot outlives a corpus change and serves a judgment whose currentness has
since moved — which `CITATION_HARNESS.md` forbids, since `overruled_status` must
be read live at render on every surface).

Re-execution is preferable IF the ordering is total. Everything in §2 exists to
make it total: `id ASC` as a final key everywhere, a fixed order for ambiguous
sets, and the degraded-arm set carried in the token. Then page N is
`ORDER BY <keys> OFFSET (N-1)*20 LIMIT 20` over the same query, and the same
judgment cannot appear twice.

The one thing re-execution cannot survive is a non-deterministic candidate set,
which is exactly what an arm that sometimes times out produces. Hence §6.

**Page size 20, not 5.** Five is a doctrine-task starvation, and an ambiguous
identity set of 16 cannot be expressed at all in pages of five without three
page turns.

---

## 6. The measurement — MEASURED, and it splits the answer in two

Same query, three executions through the real app, comparing the returned id SET
and its ORDER (`rank-stability.json`, `pnpm --filter @lawmind/harness
rank:stability`, LOCAL_CONTENDED):

| class | n | same set | same order |
| --- | --- | --- | --- |
| case_title | 3 | **3** | **3** |
| citation | 3 | **3** | **3** |
| nl_doctrine | 3 | 2 | 2 |
| fact_passage | 3 | 2 | 2 |
| **total** | 12 | 10 | 10 |

**Both unstable queries are exactly the two where the degraded set varied
between executions** — the sparse arm timed out on one run and returned on
another (`ms = 25091 / 13298 / 9510` on one of them). No instability was observed
from ties or from the exact-identity paths.

So the contract splits:

- **EXACT-IDENTITY PAGES (citation, case title): adopt deterministic
  re-execution now.** 6 of 6 stable, and with the pin-all shape from bus 1021
  they are an index scan at p50 1 ms. No snapshot, no TTL, no state to expire,
  and no risk of serving a stale `overruled_status` from a frozen page. These are
  also the classes that NEED pagination most, because a citation can name 253
  connected matters and a title 16 judgments.
- **HYBRID PAGES: not yet.** The instability is not in the ranking, it is a
  timeout. **Fix P4 first** — the bounded rarest-3 AND arm (bus 1025) cuts
  timeouts from 35 in 60 to 4 in 60, which removes most of the cause — then
  re-run this gate. A snapshot layered over an arm that is sometimes absent
  would freeze whichever page-1 the advocate happened to get and call it the
  answer; admitting DEGRADED is more honest and cheaper.

The ordering rules in §2 are required either way, and none is wasted: a total
order is a precondition for both designs.

---

## 7. Test fixtures for LCC

All drawn from the frozen gold and reproducible from artefacts already in
`docs/ai/new1-tier-a/`.

| fixture | query | expectation |
| --- | --- | --- |
| AMBIGUOUS_TITLE_16 | `R.SARAVANAN Vs THE SUPERINTENDENT OF POLICE` | 16 candidates, all reachable across pages, `ambiguous: true` on every page, no judgment twice |
| AMBIGUOUS_TITLE_5 | `PAWAN KUMAR Vs STATE OF U.P. THRU. SECY. HOME LKO.` | 5 candidates, one page, none dropped |
| UNIQUE_TITLE | `PURUSHOTTAM MADANKAR Vs STATE OF CHHATTISGARH` | exactly one pin at rank 1, absent from page 2 |
| AMBIGUOUS_CITATION_15 | the 15-judgment neutral citation in `citation-ambiguity-regrade.json` | every candidate reachable; **no single-answer claim** |
| TIE_DENSE | any duplicated-title query | identical `word_similarity` across the set; order must still be identical on two consecutive executions |
| DEGRADED_ARM | any `nl_doctrine` query over 200 chars | if the sparse arm degrades on page 1, page 2 must not silently re-rank |
| FILTER_CHANGE | any of the above + a `court` filter added between pages | rejected as a continuation, executed as a new search |

---

## 8. What this contract does NOT decide

- The wire shape of the continuation token — LCC's, and additive per
  `docs/API_CONTRACTS.md`.
- Whether the client renders "16 judgments carry this title" as a
  disambiguation screen or an inline group — RCC's.
- The page-size product decision beyond the ranking argument for 20.
