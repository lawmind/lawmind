# PREMIUM BACKEND READINESS — what is ready, what is a schema with nothing behind it

**21 August 2026 · LCC · backend only. No UI is proposed here and none should be
inferred from it.**

The founder roadmap puts premium product work in parallel *"once semantic-core
purity, expanded-HC retrieval, currentness safety and useful ranking improvement
are stable enough."* This is the honest state of the four preconditions and of
each premium surface's backing.

**Read the ledger column, not the schema column.** Every surface below has a
schema; that is the cheap half. What decides whether a feature can ship is
whether anything real is in it.

---

## THE FOUR PRECONDITIONS

| precondition | state | the number |
| --- | --- | --- |
| **Currentness safety** | **READY** | 98 non-current authorities, every one carrying a supporting adverse edge; zero derived from a `distinguished` edge alone. NEW1's check is against `information_schema`, so a cached column added next month by someone who never read the rule still fails it. `docs/ai/lcc-currentness/` |
| **Expanded-HC retrieval** | **PARTIAL** | 264,071 documents reachable of 18,698,968 — **1.4%**. Acquisition is closed; reachability has barely started, and those are different axes. |
| **Semantic-core purity** | **NOT READY, and measured** | `VERIFIED_SEMANTIC_CORE` reads **0**. 94% of the admitted population is admitted on the ABSENCE of evidence — two lanes, two methods, same answer. |
| **Useful ranking improvement** | **PARTIAL and query-type-shaped** | proposition 21.5% success@5 · case_title 5.7% · exact_citation 0.9%. Pooling would print 9.4% and read like a failing pipeline rather than a missing route. |

**The binding constraint is not ranking and not coverage. It is that almost
nothing in the corpus has been looked at.** 12,342,501 Tier-A documents have
never been classified by any rule or model.

---

## PER-SURFACE READINESS

### Case Brain — **BLOCKED on live data, not on schema**

| component | state |
| --- | --- |
| `ecourts_observation` / `ecourts_transition` | schema live (migration 0061), append-only enforced, 4 guards proved by execution |
| rows | **0** |
| kill switch `ecourts_harvest` | **OFF**. All 52 ledger rows are `refused` / `kill_switch_off` |
| what unblocks it | `FQ-ECOURTS-ACTOR` — a real founder id in `users` for the audit row. Founder item, not engineering |

The grant is valid to January 2029 and every condition is transcribed and
enforced. **Nothing has ever contacted eCourts and the ledger proves it by
query**, not by assertion.

### Hearing prep · Timeline · Next hearing — **BLOCKED on the same thing**

`matters` holds **1** row and `matter_events` holds **1**; `briefings` and
`matter_authorities` hold **0**. `users` is 55 rows, all test accounts.

These are not gaps to fill with seed data. They are surfaces whose input is an
advocate using the product, plus the eCourts observation stream that is switched
off. The derivation layer is built and untested against anything real.

**`ecourts_transition` already models what these surfaces need**:
`next_date_moved`, `bench_changed`, `order_appeared`, `disposed`,
`listing_added`, `listing_removed`, with `matter_id` late-binding so a transition
observed before an advocate creates the matter still links later. And
`first_observation` is a kind of its own so a NULL `from_value` is never reported
to an advocate as a move.

### Fresh order — **BLOCKED on eCourts traffic**

`order_listed` and `order_appeared` exist as kinds. The rule that matters is
already structural: **there is no `hearing_occurred` observation kind and there
must never be one.** eCourts publishes listings, never attendance. A hearing
having happened is only ever evidenced by a later artefact.

### Adverse authority — **READY on the data, blocked on the surface**

The strongest-backed premium feature today. 98 authorities with verified adverse
edges, each carrying relationship, citing judgment, date and printed citation.
Retrieval returns them and currentness marks them — different questions, and an
advocate arguing the other side **needs** to find the case that was set aside.

**One decision blocks the interaction, not the data:** `OD-14`. 73 of the 98
carry `set_aside` for an act that is actually `overruled`, and `set_aside`
disables add-to-matter. Until that resolves, an overruled-but-intact authority is
refused on the same footing as a judgment that no longer exists.

### Verified drafting evidence — **NOT READY, and the schema now says so**

`document_enrichments`: 30,007 at `SPAN_VERIFIED`, **0** at
`SEMANTIC_ROLE_VERIFIED` or above. Tokens per `CANONICAL_TRUSTED` object is
**UNDEFINED** because the denominator is zero.

A span-verified holding means the quoted words are in the judgment. It does not
mean the span is the holding — measured, two independent runs over one document
agree on the role only **81.0%** of the time, and only 87.6% when both spans
verify. **Drafting evidence is the one surface where that distinction is the
whole product**, because a party's contention filed as the court's holding reads
perfectly and is wrong in the way an advocate cannot see.

### Statute intelligence — **PARTIAL, and honest about it**

Transition assessment is correct and tested 19/19: `not_criminal` ·
`determinate` · `indeterminate(mustAsk: offence_date)` · `unavailable`. It reads
the commencement date from `statutes` and refuses rather than substituting a
constant.

**It is reachable from nothing in production.** `assessTransition` is called only
by its own tests and the harness, because the generation surface is not mounted.
Wiring it is a required step when that route ships, not an optional one.

Mappings: 226 rows, **all `OFFICIAL_CORRESPONDENCE`, none `ENACTED_STATUTE`**.
Coverage is bns **4/358**, bnss 24/531, bsa 101/170. Absence of a mapping means
UNMAPPED, never `no_equivalent` — which is CHECK-constrained to require an
official source.

---

## THE ORDER I WOULD BUILD IN, AND WHY

1. **Adverse authority.** The only premium surface whose data is ready today.
   Needs `OD-14` resolved and a client surface — no new backend work.
2. **Case Brain / hearing prep / next hearing.** One founder action
   (`FQ-ECOURTS-ACTOR`) unblocks the entire cluster at once, because they share
   the observation stream.
3. **Ranking.** Query-type routing before reranking. `exact_citation` at 0.9%
   through the dense index is a missing route, not a bad embedding — the
   structured path plans as an index scan at cost 328 and is cheap. Fixing the
   route is worth more than any reranker gain on the type.
4. **Verified drafting evidence.** Last, because it needs
   `SEMANTIC_ROLE_VERIFIED` to exist, and that stage is empty by design rather
   than by neglect.

## WHAT WOULD CHANGE THIS ASSESSMENT

- A founder id in `users` — moves Case Brain, hearing prep, timeline, next
  hearing and fresh order from BLOCKED to buildable in one step.
- A resolution to `OD-14` — moves adverse authority from data-ready to
  shippable.
- The first `SEMANTIC_ROLE_VERIFIED` object — moves drafting evidence off zero.
- Reachability past ~10% — makes semantic search an answer rather than a sample.

## WHAT THIS DOCUMENT IS NOT

It is not a plan, a schedule, or a UI proposal. Every state above is read from
the live database or from a committed artifact, and where a count is zero it is
reported as zero rather than as "pending".
