# COMPETITOR QUERY INVENTORY — the first month of Supreme Today access, planned before it exists

**NEW3, 15 Aug 2026, per the founder's cost-aware acquisition directive.
REFRESHED 17 Aug 2026 — account confirmed arriving tomorrow, per the
founder's acceleration addendum.** **NOT RUN. Nothing below has been
queried.** Built so the first hours of a ₹50,000/query-only licence are
spent on the highest-value questions LawMind can already name, not spent
discovering what to ask.

**Staleness note added 17 Aug, not resolved:** the tier populations below
(Tier 1's 40 citations, Tier 4's ~3,574) were sized against `judgment_citations`
snapshots from 12–15 Aug, when the corpus held ~312k–3.19M documents. It
now holds 7.29M+ (`FOUNDER_QUEUE.md` FQ-20M). **The ORDER these tiers
imply is still sound** (frequency/cross-court ranking is a relative
signal, not an absolute count) — but the exact citation lists should be
re-run against the live table before Tier 1/2/4 are worked query-by-query,
not assumed current from this document. Correctly deferred pending DB
access per the standing freeze; noted here so whoever runs this queue
tomorrow does not treat 15 Aug's exact IDs as still-current without
checking.

**"Competitor" here means Supreme Today specifically** — the only
§6a-authorized source (per `AUTHORIZED_SOURCE_MAP.md` §2, Supreme AI =
Supreme Today, founder-confirmed 12 Aug and **re-confirmed as ONE canonical
provider identity, not two, 16 Aug** — §2-RESOLVED) whose access model is
query-only against a third party's editorial product. **This queue is built
against that one identity throughout** — "Supreme AI" never appears here as
a separately-scoped source, per the founder's own instruction not to build
separate query queues for the two names. IndianKanoon is declined
(`AUTHORIZED_SOURCE_MAP.md` §4) and is not a query target under any reading.

**What is being distilled: pointers, never prose.** `SUPREME_TODAY_LICENCE.md`
§2b already settled this — a citation returned by their system is kept and
resolved against LawMind's own corpus; nothing they generate as text is ever
stored, rendered, or trained on. Every query below produces a
`(question → judgment IDs / citation forms)` pair, not a stored answer.

---

## 0 · WHY A NAMED QUEUE BEATS CRAWLING BLINDLY

`SUPREME_TODAY_LICENCE.md` §8b already measured the reason: the account rate
limit is the entire cost variable, ranging over **30x** depending on the
actual per-account ceiling (unknown until week one of a real account). A
month spent on unranked, exploratory queries burns the same rate-limited
budget as a month spent on LawMind's own worst, best-evidenced gaps. **The
gap in the licence isn't queries, it's which 10,000 questions to ask first**,
and this repo already has the evidence to rank them — most of it produced by
this lane's own citation-graph work over the past three days.

---

## 1 · QUERY TAXONOMY — what to ask for, and what each answer would do

| type | what it asks Supreme Today | what LawMind does with the answer |
| --- | --- | --- |
| **identity** | "What is this citation / does this case exist?" | resolve against `judgments`; if it does not resolve, the citation is a genuine acquisition candidate, not a linking gap |
| **parallel citation** | "What SCC/AIR/S.C.R./neutral forms does this judgment carry?" | write into `judgment_citation_aliases`, closing an unresolved edge without a document fetch — the ECT's exact mechanism, for the years the ECT cannot reach |
| **treatment** | "Is this judgment good law? Has it been overruled, doubted, distinguished?" | corroborate or newly populate `overruled_status` — **only after the same two-sighting corroboration discipline the ECT validation already used (99.42% agreement, but validated before trusted)** |
| **related case** | "What cases cite / are cited by this one?" | candidate edges for `judgment_citations`, each still required to resolve against a judgment LawMind actually holds before being written — Supreme Today's answer is a lead, not a citation |
| **important paragraph** | "What is the operative holding / ratio paragraph?" | candidate signal for evidence-span work, same rule as above — never rendered from their text, only used to point at the right paragraph in LawMind's own held text |
| **case structure** | "What is procedurally significant about this judgment?" | lowest priority of the six — `CURRENT_PLAN.md` Q1.59 already measured `case_structure` as this programme's highest-fabrication task type even for LawMind's own primary-source pipeline; treat a third party's case-structure answer with at least that much caution |
| **counter-authority** *(added 17 Aug)* | "What would the other side cite against this proposition?" | a research-failure-mode test, not a data-write query — same instrument as `BHARATLAW_NYAI_WORK_QUEUE.md` P1, run against the same source set here so the two providers are compared on the identical question rather than each getting its own untested one |
| **retrieval comparison** | run the SAME query against Supreme Today and LawMind's own search, log both result sets | not a data-acquisition query at all — a benchmarking use, per `SUPREME_TODAY_LICENCE.md` §6's harness A/B recommendation. Uses queries, counts against the same rate limit, and should be scheduled deliberately rather than mixed in ad hoc |

---

## 2 · THE QUEUE, RANKED

Ranked by evidenced value against the same query budget — a specific, already-measured gap outranks a general sweep.

> ### EXECUTABLE MANIFEST — added 18 Aug 2026
>
> The tiers below are the *reasoning*. **`docs/ai/SUPREME_TODAY_FIRST_USE_MANIFEST.json`
> is the thing you run on day one** — 43 queries, each carrying the four fields
> the founder's directive asks for: why the query exists, what information is
> missing, which output fields matter, and how the answer gets verified against
> a primary source.
>
> It is **generated**, not written: `scripts/new3-supreme-today-manifest.mjs`
> parses the citation strings straight out of `TREATMENT_GRAPH_GAP.md` §2 and
> the named gaps in Tier 2. Nothing is transcribed by hand, because transcribing
> thirty-four citations by hand is emitting citations from memory, which
> `CLAUDE.md` forbids. Re-run the script after either source document changes.
>
> **It carries 34 treatment queries, not 32, and that is deliberate.**
> `TREATMENT_GRAPH_GAP.md`'s freshness header says 32 unresolved and names the
> two fixed rows by *case name* — but §2's table identifies targets by *citation*
> only (its name column is the **citing** judgment, a different case). The
> document names two rows to drop without supplying the key to find them.
> Identifying them would mean supplying a citation from memory. Two redundant
> queries cost far less than silently dropping two unresolved overruled targets
> from the one category with a zero threshold, so both run and the discrepancy is
> recorded in the manifest's `knownDiscrepancy` field rather than rounded away.
> One database query settles it whenever someone with access wants to.

### Tier 0 — NEW1's retrieval-failure queue (added 17 Aug, NOT YET AVAILABLE)

**Highest priority if it lands before the account does — currently empty.**
The founder's directive is explicit: the retrieval benchmark should
increasingly decide what gets queried, ahead of this lane's own citation-
graph-derived tiers below. Checked this session: NEW1's post-migration work
so far is a data-integrity gate (`post-migration-gate.json`, 65 checks,
migration correctness), not a query-failure benchmark — their own bus
traffic states the `/search` benchmark (P1 onward) is explicitly not
starting yet, blocked on migration `0052`. **No failure list exists to
consume.** If one lands before Supreme Today's account exists, it goes
here, ahead of Tier 1 — not fabricated in its absence.

### Tier 0.5 — the 32 unresolved treatment targets (added 17 Aug, from CX1's cross-check — `TREATMENT_GRAPH_GAP.md` §1)

**32 queries, type: treatment.** Ranks ahead of Tier 1 — currentness-risk
outranks resolution-throughput. Every row is a Supreme Court judgment
declaring another Supreme Court judgment `overruled`/`overruled_in_part`/
`doubted`, where the target is unresolved in LawMind's own corpus. This is
the single highest-severity population in the citation graph:
`CLAUDE.md`'s zero-threshold rule states plainly that overruled law
rendered without the mark is as severe as a hallucination. CX1's
citation-graph census (`docs/ai/CX1_CITATION_GRAPH_CENSUS.md`, workstream
J2) flagged the same population independently as P0-currentness-risk —
convergent evidence, not duplicated discovery.

**Two things make this tier cheap relative to its stakes:** (1) LawMind's
own Supreme Court holdings are 99.977% complete, so the overruled *target*
in most of these 32 rows is almost certainly already in the corpus under a
different citation form — a treatment query resolves the link, not a
document gap. (2) Every row is already named, dated, and cross-referenced
to its citing judgment (`TREATMENT_GRAPH_GAP.md` §1) — no discovery work
needed before querying, only the query itself.

**5 of the 32 (`overruled_in_part`) are shared with
`BHARATLAW_NYAI_WORK_QUEUE.md` P0** — run both providers against the same
5 rows for a direct comparison of treatment-call quality, not two
unrelated tests.

### Tier 1 — the 40 highest-frequency unresolved citations (`MISSING_AUTHORITY_QUEUE.md` §2)

**~40 queries, type: identity + parallel citation.** These are Supreme Court
authorities LawMind's own High Court corpus cites and cannot resolve, ranked
by `times_cited` and `distinct_courts` — a citation reaching from 8-10
different High Courts (`20064SCC1`, `19934SCC727`, `19973SCC261`,
`19988SCC1`, `20157SCC291`) is the strongest evidence of genuine, cross-court
importance in that document, not a query-budget guess.

**Sequencing note:** per `MISSING_AUTHORITY_QUEUE.md` §1, **99.6% of this
population is very likely an alias-resolution problem, not a document gap**
— LawMind probably already holds most of these under their S.C.R. citation.
**Check each against the ECT first if the ECT's licence has cleared by the
time this runs; only query Supreme Today for whichever of the 40 the ECT
cannot resolve** (i.e., post-12.03.2018 entries, or ECT parse misses). Do not
spend query budget re-deriving what a free source already answers.

### Tier 2 — the 9 confirmed document gaps (`TREATMENT_GRAPH_GAP.md`, `CORPUS_ACQUISITION_QUEUE.md` AUTHORITY_QUEUE)

**9 queries, type: identity + related case.** Two are P1 already
(Federation of Mining Associations v. State of Rajasthan `(1992) Supp 2 SCC
239`; Randhir Singh Rana v. State (Delhi Administration) `(1997) 1 SCC 361`)
and seven are confirmed absent from **both** LawMind's holdings and the
authorized AWS bucket itself (Y.V. Rangaiah, Appa Narsappa Magdum, HUDA v.
Sunita, S.H. Medical Centre Hospital, Velaxan Kumar, Government NCT of Delhi
v. Manav Dharam Trust, N.V. International) — the one bucket in this whole
queue where a "does this even exist, and where" identity query is worth more
than a resolution query, because AWS genuinely does not have them.

**Two more, different shape, flagged not queued:** Sun Export Corporation
and SEBI v. Roofit Industries are a **citation-linking defect**, not a gap —
both are already held and currently render as live good law despite being
overruled targets. A treatment query would corroborate the fix LCC needs to
make regardless; **not worth spending budget on unless the identity/parallel
queries above are already exhausted for the month**.

### Tier 3 — the pre-2018 no-match SCR remainder, once ECT licence status is known (`MISSING_AUTHORITY_QUEUE.md` §1g)

**Up to ~3,312 distinct citations, type: parallel citation — but gate this
tier on the ECT first.** §1g's own finding: this slice sits entirely inside
the ECT's 1950–2018 coverage window, so if the ECT licence clears before
Supreme Today's account exists, this tier should shrink to whatever the ECT
cannot resolve, not run at full size. **Do not query Supreme Today for
something a free official government table can already answer** — the same
sequencing discipline as Tier 1.

### Tier 4 — the 2018+ SCR no-match slice, genuinely un-coverable by the ECT (`MISSING_AUTHORITY_QUEUE.md` §1g)

**Up to ~3,574 distinct citations, type: parallel citation.** This is the
one population in the whole queue where **no free alternative exists at
all** — the ECT stops in March 2018 by construction, and §1g's own
hypothesis (recent SC judgments are systematically under-cited in the
S.C.R. reporter form because the printed volume/page is assigned well after
delivery) is exactly the kind of gap a live, current citator like Supreme
Today should close where a static 2018 government table cannot. **Highest
per-query value of any tier if the identity-check hypothesis in §1g is
right** — each of these is very likely a citation-form gap on a judgment
LawMind already holds, meaning a single Supreme Today lookup either closes
it for free (a parallel-citation answer) or, if it genuinely returns
nothing, upgrades this from "probably a metadata lag" to "possibly a real
acquisition target" — information this queue cannot get any other way.

### Tier 5 — the historical / pre-2016 gap courts, treatment-only (opportunistic, low priority)

**Not a query list — a caveat.** `COVERAGE_GAP_MATRIX.md` §3z-correction2
identifies Chhattisgarh, Rajasthan, Karnataka and Madras as the courts with
the largest untapped pre-2016 populations. Supreme Today's own coverage is
Supreme Court + High Court headnotes, not a bulk pre-2016 HC fetch
mechanism, so this tier does **not** compete for the same rate-limited
budget as Tiers 1–4 — it is a reminder that pre-2016 coverage is NEW2's
ingest-scheduling problem (already acted on), not a Supreme Today query
problem, so nobody mistakenly routes budget here.

### Tier 6 — retrieval comparison (NEW1's territory to define, not run by this lane)

**Not sized here.** `SUPREME_TODAY_LICENCE.md` §6 already proposes the
mechanism: the same 283-query harness both arms, McNemar exact p. This lane
does not own the harness or its query set (`LANE_PROTOCOL.md`: NEW3 never
writes to retrieval evaluation) — flagged as a category that exists and
consumes the same rate-limited budget, so NEW1 should size it explicitly
rather than let it compete uncounted against Tiers 1–4 for query slots.

### Tier 8 — counter-authority, on Tier 1's own citations (added 17 Aug)

**5-10 queries, type: counter-authority.** Reuses Tier 1's `distinct_courts
≥ 8` rows (`20064SCC1`, `19934SCC727`, `19973SCC261`, `19988SCC1`,
`20157SCC291`) rather than sizing a new population — these are already the
strongest-evidenced cross-court authorities in the corpus, so they are also
the ones most likely to have a real counter-authority worth knowing. Framed
as an advocate would ask it: *"what would the other side cite against
this."* Deliberately run after Tier 1-4 close, not before — this tier tests
a capability, Tiers 1-4 close measured gaps, and a capability test should
not compete with a document-value query for early budget.

### Tier 7 — statute questions

**Not queued — no gap currently justifies it.** The BNS/BNSS/BSA↔IPC/CrPC/IEA
mapping already has a free, official, complete source (BPRD, §5f of
`SOURCE_REGISTRY.md`) and does not need a Supreme Today query. Section-level
statute treatment (has s.138 NI Act been amended, is a specific BNS section
subject to conflicting HC interpretations) is a plausible future Tier if
`judgment_statute_refs` analysis surfaces a specific, high-frequency,
unresolved statute question — none identified this pass. Left empty
deliberately rather than filled with a speculative query set.

---

## 3 · WHAT THIS QUEUE DOES NOT INCLUDE, AND WHY

- **No raw-text queries.** `SUPREME_TODAY_LICENCE.md` §8a priority 4: never
  spend a request on raw judgment text, free at 20.5M scale from AWS.
- **No IndianKanoon queries in THIS queue.** IndianKanoon is now separately
  authorized (`FOUNDER_QUEUE.md` FQ-IK-RESOLVED, 17 Aug — supersedes the 8
  Aug declination this line originally referenced) but has its own queue,
  `docs/INDIANKANOON_WORK_QUEUE.md`, on its own metadata-call budget. Kept
  separate deliberately — the two providers have different cost models
  (₹0.70/metadata-lookup vs a query-only monthly licence) and mixing their
  queues would make either budget unaccountable.
- **No numeric query count per tier.** Per §8b of the licence doc, the real
  budget is a function of the actual per-account rate limit, unmeasured
  until week one of a real account — sizing this queue in advance of that
  number would be inventing a constraint this document has no evidence for.
  What is ranked is **order**, not volume.
- **No live queries against Supreme Today from this session.** No account
  exists; nothing here could have been run even by accident.

---

## 4 · HANDOFF

The moment a Supreme Today account exists: **check Tier 0 first** — if
NEW1's failure queue exists by then, it goes ahead of everything below.
**Then Tier 0.5** — 32 currentness-risk queries, cheap and already fully
scoped, no discovery needed. Then Tier 1 (checking each of the 40 against
the ECT if it has cleared by then, and re-measured against the live table
per this doc's own staleness note above), then Tier 2, then Tier 4 ahead of Tier 3 (Tier 4 has no free
alternative; Tier 3 might). Tier 5 needs no action from whoever runs this
queue. Tier 6 is NEW1's call on sizing, not a default inclusion. Tier 7
stays empty until a specific gap justifies it. **Tier 8 runs last** — a
capability test, not a gap-closing query, deliberately sequenced after
every measured gap is exhausted.

This queue is source-neutral until §6a clears the account — nothing here
authorizes a query, it only orders the ones that will already be authorized
once the founder's blocker resolves.
