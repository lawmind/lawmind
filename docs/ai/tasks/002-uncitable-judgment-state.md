# TASK 002 — the uncitable-judgment state

**STATUS: SPEC LANDED, server side complete · created 11 August 2026 · owner LCC**

---

## OBJECTIVE

A judgment with no neutral citation and no reporter citation must never render
identically to a verified, citable authority. It must carry an unmissable mark
on every surface, must never be silently excluded from search or from the
corpus, and copy must never emit a fabricated citation or the literal string
`null`.

---

## WHY

RCC's audit, bus 0019, reproduced by rendering the client rather than reading
JSX: `citationRender` never consults `neutralCitation`, so a High Court row we
hold no citation for renders **totally unmarked** — identical to a verified
Supreme Court authority. Add-to-matter is not blocked. `PrecedentPanel` offers
it as a draft suggestion. The clipboard emits the literal string `null`
(`Mock Petitioner v. State of Bihar, null`) — the highest-risk action in the
product, on the one field the client type declared could never be null.

This was invisible for the life of the project because every Supreme Court
judgment held a citation. The 40,980-row High Court ingest (S1, 11 Aug) is the
first data this has ever been true of, which is also why the HC ingest is
currently paused: it was adding ~17 uncitable documents/second to a database a
public, unauthenticated endpoint serves, with no state in the product able to
mark them.

---

## THE DECISION — made directly by the founder, 11 Aug 2026

Two designs were put to the founder directly (not inferred, not RCC's call,
not mine): treat citability like `set_aside` (blocks add-to-matter and
drafting suggestion) or like `unverified` (an unmissable mark, nothing
disabled). **The founder chose warn — like `unverified`.** Confirmed
independently by the autonomous-execution charter's own §9: *"absence of
citation ≠ absence of legal evidence."* Full reasoning recorded in
`docs/CITATION_HARNESS.md` §The fourth concern.

This resolves the question `docs/OPEN_DECISIONS.md`'s own convention would
otherwise have required tracking as an open decision — recorded here with its
reasoning rather than there, because it was answered same-session rather than
left open.

---

## WHAT WAS FOUND — no server defect, no new schema

`neutral_citation` and `reporter_citations` have been correctly nullable and
correctly sent on every citation-carrying payload since S1
(`services/api/src/search/retrieve.ts:45`, `judgments/route.ts:24`,
`judgments/as-at.ts:73`, `judgments/treatment.ts:40` — all `string | null`,
verified by reading each site this session). **The defect was entirely
client-side:** `apps/mobile/src/api/contract.ts` declared `neutralCitation:
string`, non-nullable, on `SearchResult` · `JudgmentDetail` ·
`PointInTimeAuthority` · `Treatment` · `GraphNode` · `CounterAuthority` — six
places a lie could hide, for the life of the project, because nothing ever
tested it false.

**Consequence: this task needed no migration, no new column, no new wire
field, and no change to `services/api`.** `citable = false` iff
`neutralCitation === null AND reporterCitations.length === 0` — fully derived
from fields already correct on the wire, exactly the architecture the other
three citation concerns already use (server sends raw truthful fields, client
derives the render state).

---

## FILES CHANGED — server/docs lane only

- `docs/CITATION_HARNESS.md` — new binding section, "The fourth concern: can
  this judgment be cited at all," with the render rule, the severity decision,
  and the copy rule (quoting `DOMAIN_TRUTH.md` §Citation formats: *"Never
  construct a citation string by pattern — render only what is stored"* —
  an existing rule, not a new one; this is its first live case).
- `docs/API_CONTRACTS.md` §Search — states `neutralCitation`/
  `reporterCitations` nullability explicitly for the first time. The contract
  was silent on it; RCC's implementation was already correct and is now the
  documented authority.
- `services/api/src/judgments/route.test.ts` — new regression test: a
  judgment with `neutral_citation: null, reporter_citations: []` round-trips
  through `GET /judgments/:id` with those fields null/empty, never
  fabricated, never dropped. Deterministic ID lookup, not a ranked search.
- `docs/ai/RETRIEVAL_PROGRAM.md` — architecture row, decision record.

**NOT changed, and NOT this task's to change:** `apps/**` (RCC's lane).

---

## WHAT RCC NEEDS TO DO — handed off, bus message sent

1. Fix the six non-nullable declarations in `apps/mobile/src/api/contract.ts`
   to `string | null`. RCC's own words: *"the compile errors ARE the
   inventory."* Expect every raw interpolation site to fail the build; that is
   correct, not a regression to route around.
2. `citation/renderState.ts` gains a fourth input (citability, derived from the
   two fields above) and a fourth output branch: an unmissable mark,
   independent of the other three, additive — a citation-less judgment that is
   also `unverified` or also `overruled` shows both marks.
3. Add-to-matter and `PrecedentPanel` **stay enabled** — do not gate on
   citability the way `JudgmentScreen.tsx:272` gates on `blocksAddToMatter`.
4. Fix the clipboard build (`JudgmentScreen.tsx:288` and any other site that
   interpolates `neutralCitation` raw): omit the citation segment when null,
   never render the string `null`, never synthesise a citation.
5. `reporterCitations` needs at least one real consumer — RCC's own finding:
   "declared on `SearchResult` and rendered nowhere in `apps/**`." Citability
   depends on checking it; this task is also what gives it a first reader.

---

## TESTS

- `services/api/src/judgments/route.test.ts` — new: null-citation judgment
  round-trips correctly (added, passing against the real corpus — a citation-
  less High Court row from the paused ingest already exists to test against).
- Existing suites must stay green: api, ingest, harness, storage — unaffected,
  no runtime code changed outside the new test.
- Client-side regression tests (`citationRender`, the four render states) are
  RCC's, once the type fix lands.

---

## ACCEPTANCE CRITERIA

1. `docs/CITATION_HARNESS.md` names citability as a fourth, independent
   concern with a derivation, a render rule, and a severity — done.
2. `docs/API_CONTRACTS.md` states nullability explicitly — done.
3. Server round-trips null citation fields without fabricating or dropping —
   regression test added, passing.
4. RCC has the exact contract and file-level inventory needed to implement the
   client side without re-deriving it from the audit — bus message sent.
5. The paused HC ingest's resumption condition ("task 002 has a decision") is
   met for the **product decision**; **a separate, higher bar from the
   autonomous-execution charter §10 (content hash, dedup status, extraction
   confidence, provenance) is not yet met and ingest stays paused** — recorded
   as still-open, not silently resolved by this task landing.

---

## RESULT

Spec and server-side work complete, 11 Aug 2026. Client-side implementation
is RCC's, briefed via the lane bus. HC ingest resumption is a separate,
still-open item — see `docs/ai/RETRIEVAL_PROGRAM.md` §BLOCKED.
