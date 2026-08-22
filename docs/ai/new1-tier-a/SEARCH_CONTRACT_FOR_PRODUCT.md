# THE SEARCH CONTRACT, AS MEASURED — NEW1 → NEW3 / RCC

**22 August 2026. Owner NEW1 (retrieval). This is a BEHAVIOURAL ANNEX, not a
second API contract.** `docs/API_CONTRACTS.md` §Search is LCC's and is frozen per
sprint; nothing here changes a field, a name or a status code. What it adds is
the half the wire format cannot state: **which query classes actually work,
what they cost, and what the product must not promise.**

Every number below was measured on the local stack on 22 Aug 2026 and is labelled
`LOCAL_CONTENDED` — the Tier-A GPU walk, LCC's text-safety screen and NEW2's
classifier were all writing throughout. Contended latency is an UPPER bound and
is not a prediction of mobile production latency.

---

## 1. There is ONE endpoint and SEVEN query classes behind it

`POST /search` takes free text. The server decides the route; the client does not
pick one and must not try to. The classes are NEW1's evaluation vocabulary, and
they exist because **the routes have different failure modes and must never be
pooled into one quality number.**

| class | what the advocate typed | route | status |
| --- | --- | --- | --- |
| `citation` | `2023:AHC:170543`, `(2019) 4 SCC 221` | exact identity | **works** |
| `case_title` | a case name, whole or partial | exact identity, then ranked | works for exact titles; partial is a fallthrough, see §5 |
| `nl_doctrine` | a typed legal proposition | ranked retrieval | **blind outside the Supreme Court, see §3** |
| `fact_passage` | a passage of facts or an issue | ranked retrieval | same |
| `statute_section` | a section-and-act question | statute path | works; 11/11 on the transition gold |
| `bns_transition` | IPC/CrPC/Evidence → BNS/BNSS/BSA | statute path | works, and correctly REFUSES to invent a mapping |
| `adverse_currentness` | is this still good law | live read at render | see §4 |

**The client must not compute or send the class.** It is derived server-side from
the query text (`query-shape.ts`), and a client that guessed would disagree with
the router the moment either changed.

---

## 2. THE INPUT LIMIT IS REAL AND THE CLIENT MUST ENFORCE IT

`searchRequest.query` is `min(1).max(500)`. Over 500 characters the request is
rejected by validation before any retrieval runs.

This is not a formality. Measured against NEW3's verified gold, **97.8% of the
verbatim-passage query set exceeds it** — those are 800-character extracts, and
an advocate pasting a paragraph out of a judgment will hit this. The client
should show a character counter and refuse locally rather than let the user
compose 900 characters and receive a validation error.

**Do not silently truncate to 500.** A truncated legal passage is a different
question from the one the advocate asked, and it will return different law.

---

## 3. THE ONE THING THE PRODUCT MUST NOT PROMISE YET

**Semantic ("concept") search is effectively Supreme Court only.**

The dense arm searches `judgment_chunks`. Measured 22 Aug 2026, exact counts:

```
judgment_chunks, distinct judgments        40,161
  Supreme Court                            38,341
  High Court and other                      1,820
```

Against LAUNCH_BENCHMARK_V1's 1,029 gold authorities — which are High-Court
heavy, because that is where litigation happens — **5 have a chunk.** Not five
percent. Five.

```
class          n     has a chunk (production)   in NEW1's Tier-A stage
citation     229              0   (0.0%)            198  (86.5%)
case_title   229              0   (0.0%)            198  (86.5%)
fact_passage 372              2   (0.5%)            366  (98.4%)
nl_doctrine  199              3   (1.5%)            196  (98.5%)
```

`citation` and `case_title` do not care — the exact route resolves them from
`neutral_citation`, `case_title` and the alias concordance, none of which need a
vector. That is why citation search is genuinely good today and concept search
is not.

`new1_doc_vector_stage` holds **675,711** document vectors, overwhelmingly High
Court, and **production cannot see it**: it is a different table with no vector
index. Wiring it in is the single largest available improvement to research
quality and it is not a ranking change.

**Product consequence, stated plainly:** a High Court advocate typing a legal
question today is searching a Supreme Court index with a lexical fallback. Do
not market "search every High Court by concept" until this closes. Marketing
citation and case-name search, and the 24-hour briefing, is fully supported by
what exists.

The corpus-coverage surface already exists for exactly this kind of honesty
(`/corpus/coverage`, and LCC's `shortfallReason` work in bus 0986). Concept
coverage belongs there.

---

## 4. CURRENTNESS FIELDS — READ LIVE, NEVER CACHED, AND THERE ARE NOW SIX

`RetrievedJudgment` carries these, and OD-14 split what used to be one field
into a layered set. The client renders the DERIVED value and never the stored
one:

| field | meaning | client use |
| --- | --- | --- |
| `overruledStatus` | the DERIVED banner status | **this is what renders** |
| `overruledStatusStored` | the raw column | admin monitor only, never a badge |
| `precedentialEffect` | layer 2, five values | drives the banner wording |
| `canAddToMatter` | layer 3 | disables add-to-matter, and only for a genuine set aside |
| `unappliedTreatment` | a verified adverse edge the corpus has not applied | **never a banner** |
| `asOf` | the moment the SERVER read the status | must be shown on any offline/cached surface |

`overruled_status` is never cached anywhere in NEW1's tables — verified by
`currentness-safety.mjs`: zero cached-status columns across five NEW1 tables,
every vector table carries `judgment_id`, and the status comes from a live join.
The stale-overruled threshold is zero, so a cached copy on the client is a
correctness bug, not an optimisation.

LAUNCH_BENCHMARK_V1 enforces this from the outside: any response containing a
judgment whose stored status has moved, but whose payload says `none`, is scored
`CURRENTNESS_FAIL` and the query counts as a failure regardless of its rank.

---

## 5. LATENCY, HONESTLY, AND WHY THE MOBILE TIMEOUT IS THE BINDING CONSTRAINT

`LOCAL_CONTENDED`, 22 Aug 2026. These are upper bounds on a four-lane box, and
they are the numbers the client has to survive:

| shape | measured | note |
| --- | --- | --- |
| citation, via the exact path | **4 – 352 ms** | after the 22 Aug routing fix |
| citation, before that fix | 12,158 ms sparse arm alone; 30 s timeouts | a bare citation was not reaching the exact path |
| case name, partial | 16.7 s (NEW3, hands-on) | falls through title equality into full hybrid |
| concept | 53 – 76 s | NEW1 by plan, NEW3 hands-on, independently |

The cause of the slow shapes is one thing and it is not the ranker:

```
judgments_full_text_idx (GIN)   16 GB
shared_buffers                   2 GB
```

The index is eight times the cache, so every sparse query reads ~160,000 blocks
(~1.25 GB) from disk — the same figure for a 15-character citation and a
134-character title, because the cost is I/O against an uncacheable index rather
than anything about the query.

**The mobile client's own timeout is 15 s.** Concept search exceeds it. Two
things follow for the product lane, and neither of them is a NEW1 change:

1. A search that exceeds the budget must render as a **partial or degraded**
   result with an explicit state, never as an empty result. `hybridSearch`
   already accepts an `onDegrade` callback per arm and the route already passes
   it — an incomplete answer can say so, and the client should show that rather
   than "no results found". A lexical-only answer presented as a complete one is
   the same class of lie as an unverified citation shown as confirmed.
2. Do not add a client retry on timeout. A retried 53-second query is a
   106-second query and a second 1.25 GB read.

**Streaming: there is none, anywhere in the API today.** Do not design a
streaming affordance against a contract that has no streaming in it. What the
client can do now is show route-appropriate loading: a citation lookup should
feel instant and a concept search should show a real progress state.

---

## 6. FAILURE STATES THE CLIENT MUST DISTINGUISH

NEW1 classifies every benchmark failure into exactly one reason, assigned by the
first rule that fires, ordered from "nobody could have found this" to "we had
everything and got it wrong". The client does not see these labels — it sees
their consequences, and it must not collapse them into one empty state:

| server reality | what the client must show |
| --- | --- |
| the corpus does not hold it | "no results", honestly |
| held, but body text is proven damaged | still findable by citation/name — **do not hide the document** |
| held, readable, contract refuses it | "no results" |
| eligible but not embedded | "no results" **today**, and this is §3's gap, not the advocate's query being bad |
| retrieved but ranked low | ordinary results |
| the arms timed out | **degraded**, never empty |
| a query over 500 chars | a validation message, caught client-side first |

The distinction that matters most at the UI: **an empty result and a degraded
result are different**, and today they look identical to a user. A concept
search that times out currently reads as "Lawmind has no law on this", which is
false and is the most damaging possible false statement for this product.

`body_text_safe` and `metadata_discoverable` are separate booleans in NEW2's
`judgment_quality_contract` (migration 0072) and must not be collapsed. A
glyph-dumped judgment is still perfectly findable by citation and case name,
because the identity fields do not come from the body text.

---

## 7. WHAT IS FROZEN AND WHAT IS NOT

**Frozen — build against these:** the endpoint, the request shape including the
500-char cap, the six currentness fields, and the rule that the class is derived
server-side.

**Not frozen, and NEW1 will tell you before it moves:** concept-search coverage
(§3), which is the number most likely to change; and concept latency (§5), which
depends on decisions that are not NEW1's alone.

**Measured against:** `LAUNCH_BENCHMARK_V1`, 1,029 rows, `frozenHash
ba9357cba2fbf297`, built by `services/harness/src/launch-gold.ts` from NEW3's
four verified gold files. The hash covers the ordered
`(queryId, class, query, goldAuthorityId)` tuples and nothing else, so a rerun
after a corpus change is the same benchmark and a rerun after a gold change is
loudly a different one.
