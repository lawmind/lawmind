# MISSING AUTHORITY QUEUE — ranked by LawMind's own citation graph

**12 August 2026, acquisition/discovery lane.** Built per the mission's
citation-graph feedback loop: *held judgment → citation → target not held →
importance signal → ranked missing authority.* Every number below is a live
query against production (`external_citations`, read-only, via `packages/db`
with a temporary local script deleted after use — no schema change, no write).
Not recalled from an earlier doc.

**Read `docs/SOURCE_REGISTRY.md` §6 first — the headline finding changes what
this queue is actually for.**

---

## 0 · STALENESS WARNING, found and quantified 12 Aug 2026, RE-CHECKED 14 Aug — worse, not resolved

**Re-ran this query fresh this session, expecting different numbers — got
byte-identical ones**, which was the tell. Verified rather than shrugged
off: `external_citations` (the table this whole queue is built from) has
not gained a row since **2026-08-11T00:34:11Z**. `judgments` has grown to
**407,331** as of this check (2026-08-12T19:46Z) — **372,572 judgments, the
large majority of the entire corpus, were ingested after citation extraction
against this table last ran.** `judgment_citations` (the internal-citation
table) is far more current, latest row 2026-08-12T17:06Z, so this is not a
citation-extraction-is-fully-dead finding — specifically the *external*
(cites-something-we-don't-hold) extraction path is over 43 hours stale.

**Consequence for this whole document: the ranking below reflects roughly
the first ~35,000 judgments of a 407,331-row corpus.** It is not wrong for
what it measured, but it is a shrinking fraction of the true picture with
every hour NEW2's ingest continues outrunning it. **This is enrichment
territory (LCC/NEW2), not this lane's to fix** — flagged on the bus, not
actioned here. Re-run this query after citation extraction catches up
before treating any ranking below as current.

**RE-CHECKED 14 Aug 2026 — `external_citations` is still exactly frozen at
the same timestamp, and the gap has widened dramatically, not narrowed.**
Live query: `external_citations` — still **51,272 total rows**, latest row
still `2026-08-11T00:34:11Z`, byte-identical to the check above three days
earlier. Meanwhile `judgments` has grown to **3,192,920** (from 407,331) —
the corpus has grown roughly **7.8x since this table last gained a row**,
so the ranking below now reflects an even smaller fraction of the true
picture than the original warning stated (roughly 35,000 of 3.19M
judgments, ~1.1%, down from ~8.6%). `judgment_citations` (internal) has
also fallen further behind its own earlier pace — latest row now
`2026-08-13T06:55:41Z`, over a day stale against a corpus that kept
growing. **Still not this lane's to fix — external-citation extraction is
enrichment territory** — but the staleness is materially worse than when
first flagged, not resolved by the intervening corpus growth, and worth
re-surfacing rather than let the original "43 hours stale" figure imply a
problem that's been sitting still rather than compounding.

| | |
| --- | --- |
| unresolved `external_citations` rows | **32,383** |
| distinct unresolved citation keys | **8,733** |
| distinct citing documents | **12,193** |

Broken down by reporter, over the distinct keys:

| reporter | distinct keys | rows (citing instances) | share of rows |
| --- | --- | --- | --- |
| SCC | 5,107 | 19,767 | 61.0% |
| AIR | 3,586 | 12,498 | 38.6% |
| SCR | 31 | 70 | 0.2% |
| other | 9 | 48 | 0.1% |

**SCC + AIR together are 99.6% of every unresolved citation in the corpus.**
Both are Supreme Court reporters. LawMind's own Supreme Court holdings
(38,342 judgments) carry **100% S.C.R. citations and effectively zero SCC/AIR
aliases** (`FOUNDER_QUEUE.md`, "An SCC/AIR ↔ S.C.R. citation concordance",
11 Aug 2026 — this session's numbers are the same finding re-measured at
roughly 2× the scale that entry recorded, consistent with the corpus having
grown from ~79k to 312k documents since). **The overwhelmingly likely
explanation for most of this list is not "LawMind does not hold this
judgment" — it is "LawMind holds this judgment under a different citation
form and cannot match the two."**

**This reframes the entire queue.** A missing-authority list built naively
from citation frequency would tell New2 to go acquire 8,733 new Supreme Court
judgments. **That would almost certainly be wrong** — the acquisition target
most of this list actually points at is a **concordance/alias source**
(paid: IndianKanoon `citeList`/`docmeta`, ₹0.70/lookup once, cached forever,
per `docs/DATA_SOURCES.md` §2; free alternatives not yet found, per
`SOURCE_REGISTRY.md` §5, RESEARCH INCOMPLETE), not a document-ingestion queue.
**No item below should be treated as "go fetch this document" without first
checking it is not simply an unaliased judgment LawMind already holds.**

---

## 1b · SUPERSEDING FINDING, 13 Aug 2026 — a free internal concordance source may exist

**LCC found, resolving one of the 34 edges in `TREATMENT_GRAPH_GAP.md`,
that 656 judgments already print paired `S.C.R. cite : SCC cite` citations
in their own text** — the same mapping this whole queue has been missing.
No fetch, no purchase, already held. Full account: `docs/ai/
OVERRULED_GROUP_MARKERS.md` §4, `SOURCE_REGISTRY.md` §5a-pre. **This is
now the top acquisition priority for closing this queue**, ahead of every
external source this lane researched (the ECT, IndianKanoon, SCC Online).
Building the harvester is LCC's territory, not this lane's — recorded here
so the ranking below is read with that in mind rather than as the current
state of the art.

---

## 1c · THE LIVE TABLE, 13 Aug 2026 (bus 0281) — 1.22M unresolved is half sentinel, not 24x the queue

**LCC flagged that `judgment_citations` (live, not frozen like
`external_citations`) shows 1,224,507 unresolved edges against 112,241
resolved — 91.6% unresolved, framed as "24x bigger than the frozen table."
Verified the count exactly, then found the 1.22M figure conflates two
unrelated populations.**

    resolved                    112,241
    unresolved, TOTAL          1,224,507   <- LCC's figure, verified exact
      empty-normalised-citation   625,748   <- NOT a citation. See below.
      real unresolved citations   598,759   <- the actual queue

**625,748 of the "unresolved" rows have an empty `citation_text` AND empty
`normalised_citation`** — `evidence` null, `char_offset` 0, `relationship`
defaulted to `cites`. Sampled 15 across 8 different courts, all identical
in shape. Checked the overlap: **zero judgments carry both an empty
sentinel row and a real citation edge** — it is exclusively one or the
other, one sentinel row per judgment.

**CORRECTED 13 Aug 2026 (bus 0307) — this is not a bug. It is deliberate.**
`citations-cli.ts`'s own header documents it: one sentinel row per judgment
where extraction found nothing, so the resumable pass can skip
already-processed judgments instead of re-reading them forever.
`--rescan` clears a sentinel when a judgment starts citing something. LCC
confirmed the design is sound at 46x the scale it was first measured at.
**It still has zero acquisition relevance and should not be read as
625,748 missing authorities** — that conclusion stands unchanged — but
there is nothing here for LCC or NEW2 to fix. Struck the earlier "flagging
to fix" line; it was wrong to call this a defect.

**The real failure was neither of us reading `SCHEMA_TRUTH.md` first.**
CLAUDE.md names it the only authority on data shapes, and it already had
a section on the sentinel before this thread started. LCC has since added
the two side-by-side queries (naive vs sentinel-excluded) and the
resulting figures there. **Standing rule for this lane, going forward:
read a table's `SCHEMA_TRUTH.md` entry before computing a headline number
from it** — sampling the rows caught this one, but the file would have
answered it in the time it took to open it.

**The real unresolved population is 598,759 — still ~11.7x the frozen
51,272-row `external_citations` table, a genuine and substantial finding,
just not the 24x LCC quoted.**

### Characterised the top of the real population, frequency-weighted

Per LCC's three-way ask — (a) normalisation failure, (b) alias exists /
already held, (c) genuine acquisition candidate, "only (c) is acquisition"
— on the top 200 most-frequently-cited real unresolved citations (80,329
of the 598,759 edges, i.e. the head of a long-tail distribution), checked
each `normalised_citation` against `judgment_citation_aliases` (4,394 rows)
for an existing match:

| bucket | distinct citations | edges (weighted) | share |
| --- | --- | --- | --- |
| (a) malformed | 0 | 0 | 0.0% |
| (b) alias already exists | 77 | 40,408 | 50.3% |
| (c) candidate | 123 | 39,921 | 49.7% |

**Roughly half of the highest-value unresolved citations already have a
matching alias** — meaning LawMind already holds the judgment, and closing
these is a *linking* job (writing `cited_judgment_id` once the alias
resolves), not acquisition. This is the same conclusion `SOURCE_REGISTRY.md`
§6 and §1 above already reached from `external_citations` at 32,383 rows —
now confirmed independently at 18x the scale, on a live rather than frozen
table.

**The other ~50% ("candidate") is not the same as "confirmed missing."**
It means no existing alias matched — some of it will resolve once LCC's
concordance harvest (§1b) processes more of the 656-judgment paired-citation
source, some may be a normalisation gap this sample's crude malformed-check
missed, and only a remaining fraction is a genuine document LawMind does not
hold. **Not further characterised this pass** — the honest state is "roughly
half of the top 200 is an open question," not "roughly half is an
acquisition target." Distinguishing those needs either the alias harvest to
finish or individual verification, neither done here.

**Sampling note, per LCC's own caution:** both queries above used
`ORDER BY random()` / `GROUP BY ... ORDER BY count DESC`, never a bare
`LIMIT` — the top-40 table in §2 below spans single-court patterns by
design (frequency ranking), but this section's 200-citation sample was
checked to span courts, not accidentally read as physical insertion order.

---

## 1d · RESOLVED 14 Aug 2026 — the ECT is in hand, and it closes 34.2% of this queue for £0

**The concordance source this document has pointed at since 12 Aug has been
fetched, parsed, measured and independently validated.** Full account:
`SOURCE_REGISTRY.md` §5a-FETCHED. The headline, measured against the live
`judgment_citations` table (not the frozen `external_citations` one):

| | distinct | edges |
| --- | --- | --- |
| live unresolved population (sentinels excluded) | 231,546 | **598,766** |
| present in the ECT | 42,335 | 322,160 |
| **resolvable to a judgment ALREADY HELD** | **21,340** | **204,684 (34.2%)** |

Per reporter, as a share of that reporter's own unresolved edges: **AIR
63.1%**, **SCC 52.4%**, **SCALE 49.3%**.

**This settles §1's central claim with a number.** The thesis was that this
queue is an alias-resolution problem, not an acquisition problem — argued
first from 32,383 frozen rows, then from a 200-citation sample in §1c. It is
now measured across the whole 598,766-edge live population: **a third of it
closes against judgments LawMind already holds, using a free official table,
with zero documents acquired.**

**Validated before being recommended, 99.42%.** Cross-checked against
`judgment_citation_aliases` (4,394 corpus-derived pairings, each with ≥2
corroborating citing judgments — an independent ground truth): 3,807
comparable, **3,785 agree, 22 disagree**. The disagreements are ECT
transcription slips (a `(2001)` for `(2011)`, an off-by-one page), not
systematic error — so **promotion should corroborate rather than trust
blindly**, the same two-sighting discipline the alias table already applies
to itself.

**Two limits, stated rather than left to be discovered:**

1. **The ECT stops at `as on 12.03.2018`.** Nothing after March 2018. That is
   a hard coverage edge, and the 2018–2026 span needs a different route.
2. **It cannot help the 24,655 unresolved SCR citations** (34,253 edges,
   0% resolvable). The ECT maps *into* S.C.R.; an unresolved S.C.R. citation
   is already in the target form, so a failure there is a direct-matching or
   genuine-absence problem, not a concordance one. **Separately queued.**

**Licence NOT cleared** — an official Government of India publication is a
*Government work*, a different category from a judgment. Filed to
`FOUNDER_QUEUE.md`. **Nothing here is a cleared target for NEW2 yet**, and
building the loader is LCC's territory regardless.

**§3's instruction below is now obsolete on its first point.** "First move is
resolving the IndianKanoon-purchase decision" was written before the ECT was
in hand and before IndianKanoon was confirmed declined. The first move is the
ECT, it is free, and it is already parsed.

---

## 1e · 14,374 UNRESOLVED SCR CITATIONS EXACTLY MATCH A JUDGMENT WE HOLD — 14 Aug 2026

**Cheaper than the ECT and needing no external source, no licence and no
founder decision.** §1d flagged the 24,655 unresolved SCR citations as the
population the ECT provably cannot help with. Characterised them directly.
Re-measured live: **26,270 distinct** (the number moves with ingest).

| bucket | distinct | edges | what it means |
| --- | --- | --- | --- |
| unparsed form | 1,598 | — | normalisation gap |
| **EXACT string match to a held judgment** | **14,374** | **14,374** | **we hold it; the link is simply not written** |
| volume-agnostic match only | 4,207 | 10,391 | volume differs between citing text and our stored form |
| no match at all | 6,056 | 9,518 | possibly genuinely absent |

**18,581 of 26,270 (71%) point at judgments LawMind already holds.** Verified
with concrete pairs, not asserted — e.g. `(2018) 9 SCR 419` is unresolved
while we hold *All India Judges Association & Ors. v. Union of India* under
exactly that citation; `(2023) 3 SCR 790` while we hold *Virendrasing v. The
Additional Commissioner*.

**The match is exact string equality on `normaliseCitation()` output against
the held judgment's own `reporter_citations`** — not a fuzzy or heuristic
match. There is no judgement call in it.

### The timing evidence, which is the actionable part

Sampled 500 of these matched-but-unresolved edges:

    matched-but-unresolved, created   2026-08-06T15:19 .. 15:25   (all 500)
    resolved edges overall, created   2026-08-06T15:19 .. 2026-08-14T18:22

**They are all from the oldest citation batch, and the resolver has been
writing resolved edges continuously since — including two minutes before this
measurement.** So this is not a backlog waiting its turn. Either the resolver
never revisits rows from an earlier pass, or its matching rule differs from
exact normalised-string equality.

**Which of those it is, is LCC's to determine — this lane does not own the
resolver and did not read its matching rule.** Stated as the evidence, not as
a diagnosis. Sent on the bus.

**Acquisition consequence: none, and that is the point.** Of the SCR
population, only the 6,056 no-match citations could conceivably be an
acquisition question, and even those need the volume-mismatch and
normalisation buckets ruled out first. Their year distribution skews recent
(2023: 488, 2022: 485, 2018: 473, 2020: 472) rather than historical, which is
not the shape of a corpus with a historical hole.

---

## 1g · THE 6,056/6,886 NO-MATCH BUCKET, CHARACTERISED — 62% of it is exactly the ECT's blind spot, and the rest is very likely metadata lag, not acquisition · 15 Aug 2026

**Re-measured live (the number moves with ingest, per §1e's own note — now
6,886 distinct / 10,359 edges against 38,342 held SC judgments, up from 6,056
at the 14 Aug measurement).** Method: keyed every held SC judgment's
`reporter_citations` into `(year, vol, page)` and `(year, page)` sets in
memory (38,342 rows, the same "pull the small side, don't scan the big table"
discipline `LANE_PROTOCOL.md` already documents), then classified all 36,421
unresolved SCR-shaped `judgment_citations` edges against them. Read-only,
temp script, deleted after use, no trace in `git status`.

    exact match (year, vol, page)      15,113 edges / 14,676 distinct
    volume-agnostic match (year, page) 10,949 edges /  4,727 distinct
    NO MATCH AT ALL                    10,359 edges /  6,886 distinct

**The headline: 62% of the no-match edges (6,372 of 10,359, 3,574 distinct)
are dated 2018 or later** — exactly the span `SOURCE_REGISTRY.md` §5a-FETCHED
and §1d above already established the Equivalent Citation Table CANNOT cover
(it stops 12.03.2018). This is not a coincidence worth re-investigating as a
new hole; it is the ECT's own documented edge, now visible from the other
side. **The pre-2018 remainder (3,987 edges, 3,312 distinct) is very likely
NOT a separate gap either** — it sits inside the ECT's 1950–2018 coverage
window, so once the ECT licence clears (`FOUNDER_QUEUE.md`, still open) this
whole pre-2018 slice is a candidate for automatic resolution, not a fresh
acquisition target.

**Why the 2018+ slice is very unlikely to be a genuine document gap: LawMind's
own Supreme Court holdings are 99.98% complete** (`DATASETS.md`, `TREATMENT_
GRAPH_GAP.md`). A no-match SCR citation to a 2018–2024 Supreme Court judgment
is far more likely to mean **we hold the judgment (under its neutral
citation) but our `reporter_citations` array has no S.C.R. entry for it yet**
— the printed S.C.R. series assigns volume/page well after a judgment is
delivered, so recent judgments are systematically under-cited in this one
reporter form. This is a hypothesis, not verified against individual cases
this pass (would need per-citation case-name cross-referencing, which the
`citation_text` column alone does not carry) — stated as the strongest
available reading of the evidence, not as confirmed.

**Net for acquisition: nothing actionable here.** Every no-match SCR citation
routes to either "wait for the ECT licence" (pre-2018) or "a
metadata-assignment lag on judgments already held" (2018+), not to a new
document LawMind needs to fetch. This sharpens rather than reverses §1's
original thesis — the queue was never a document-acquisition problem, and
this was the one bucket left that could conceivably have been one.

**A separate, genuine, LCC-actionable finding surfaced while parsing this
population, not an acquisition item:** `normaliseCitation()`
(`services/ingest/src/citations.ts`) never inserts a space around a bare
"SCR" token, so a citation typeset as `(2017) 11SCR1036` in source text
normalises to a DIFFERENT key than `(2017) 11 SCR 1036` for the same
authority — the extraction regex itself allows `\s*` (zero-or-more) around
the reporter token, but the normaliser that is supposed to make spacing
variants compare equal does not close that gap for "SCR" specifically (it
already does for others via the year-first rewrite). **Measured: 1,648
distinct unresolved citations carry this exact defect** — this excludes the
legitimate volume-less form `(YYYY) SCR PAGE`, which is not a bug and
already resolves correctly via volume-agnostic matching. Not fixed here —
this lane does not touch `services/ingest` — flagged to LCC on the bus with
the file and the count.

**FIXED by LCC, 15 Aug 2026 (bus 0536) — and the real population was bigger
than this section found.** LCC measured the actual vocabulary rather than
patching the SCR token alone (this section's own §1g rule): **SCC carries the
identical no-space defect at roughly 3.5x the scale of the SCR half found
here** (SCC 1,749+1,588 digit/token-adjacency occurrences vs SCR's 450+481),
and SCALE at a smaller scale — AIR, JT, CriLJ and SCC OnLine show none. Fixed
and shipped, 35/35 new tests, 472/474 across `services/ingest`. **Inert until
a backfill lands**, because `judgment_citations_unique_edge` is keyed on
`normalised_citation` and every row written before the fix holds the OLD
unspaced key — re-extracting now would write a second edge for the same
authority rather than matching the old one. Tracked as LCC's Q1.60; **nothing
should re-extract over already-processed judgments until it exists.** Also
resolves the open question in §1e above about why the resolver's bulk sweep
and the inline extraction path disagreed on some edges: the bulk sweep
strips non-alphanumerics before comparing (never saw this defect), the
inline resolver compares the normalised key directly (did) — two different
code paths, same fingerprint, not evidence of a scheduling gap as originally
framed there.

---

## 1h · THE 2018–2026 CONCORDANCE GAP — closed as a research question, no new source exists · 15 Aug 2026

**Previously queued (Q1.47/bus 0488) as "the next lead once §1g's characterisation lands."**
It has landed, and it changes what this item even is.

Two candidate routes were named: e-SCR, and the internal 656-judgment
paired-citation source. Both were already checked, in earlier sessions, and
neither needed re-research:

- **e-SCR (`scr.sci.gov.in`) is closed for good, fetched directly and
  confirmed** (`docs/ACQUISITION_SESSION_LOG.md` session 8): its search form
  offers only SCR and Neutral Citation fields — no SCC, no AIR. It cannot
  serve the SCC/AIR → S.C.R. concordance problem for ANY year, 2018+
  included. This was already settled 13 Aug 2026; not a live lead.
- **The internal 656-judgment source** (`docs/ai/OVERRULED_GROUP_MARKERS.md`
  §4/§4b) is real, sound (391 pairs verified from a 45-judgment sample,
  proposed for a full 656-judgment harvest) — but it is LCC's build item,
  already proposed there, not a NEW3 acquisition question. Nothing to
  discover; it is already found and already queued.

**And §1g above removes most of the reason to keep looking.** If the 2018+
no-match SCR population is mostly metadata lag on judgments already held
rather than genuinely unresolvable citations, there is no gap-shaped hole for
a "newer SCR volumes" source to fill even if one existed. No such official
post-2018 concordance publication was found this session or any prior one.

**Closed, not abandoned:** if LCC's harvest of the 656-judgment source or the
resolver's own SCC/AIR extraction later surfaces a genuine post-2018
concordance shortfall with real numbers behind it, that is a new, evidenced
item — this closes the version of the question that was open on
speculation.

---

## 1f · JT — the extractor gap is REAL but the impact is NEGLIGIBLE. Measured, and it corrects my own flag.

**`citations.ts` PATTERNS genuinely has no JT rule** — AIR, SCC, SCR, SCALE
and neutral citations are matched; JT is not. `judgment_citations` contains
**zero** rows referencing JT, confirming nothing is extracted.

**I flagged this to LCC and NEW1 as a probable bug. Measurement says it is
not worth fixing.** Sampled 1,632 judgments via `TABLESAMPLE BERNOULLI`
(cross-court by construction, per this lane's own §3b finding):

    judgments containing >= 1 JT citation :  1 / 1,632  (0.06%)
    total JT occurrences in the sample     :  1
    distinct courts citing JT              :  1  (Gujarat)

**One occurrence in 1,632 judgments.** The ECT carries 89,372 JT atoms, so JT
is a real reporter in the wider literature — but the courts in *our* corpus
almost never cite it. **The absence of the pattern is certain; the cost of the
absence is approximately zero.**

Recorded because the correction is the useful part: *"the ECT has 89,372 JT
atoms"* felt like strong evidence that we were missing a lot, and it was
evidence about the wrong population. A reporter's prominence in a
concordance says nothing about how often our judgments cite it.

---

## 2 · TOP 40 UNRESOLVED CITATION TARGETS, BY CITING FREQUENCY

Ranked by distinct citing documents (`times_cited`), which is a genuine
importance signal — this is exactly how often a High Court judgment in
LawMind's own corpus reaches for an authority LawMind cannot currently
resolve. `distinct_courts` shows whether the citing pattern is one court's
idiosyncrasy or a broad, cross-court pattern (the latter is stronger evidence
of a genuinely important Supreme Court authority, not a local quirk).

| citation key | sample text | times cited | distinct courts citing it |
| --- | --- | --- | --- |
| `201210SCC197` | (2012) 10 SCC 197 | 553 | 1 |
| `20064SCC1` | (2006) 4 SCC 1 | 377 | 9 |
| `AIR1959SC308` | AIR 1959 SC 308 | 363 | 4 |
| `AIR1973SC552` | AIR 1973 SC 552 | 357 | 1 |
| `AIR1960SC1203` | AIR 1960 SC 1203 | 357 | 1 |
| `AIR1971SC306` | AIR 1971 SC 306 | 357 | 1 |
| `200510SCC306` | (2005) 10 SCC 306 | 357 | 1 |
| `19701SCC125` | (1970) 1 SCC 125 | 357 | 1 |
| `AIR1966SC1593` | AIR 1966 SC 1593 | 357 | 1 |
| `AIR2010SC2275` | AIR 2010 SC 2275 | 356 | 1 |
| `AIR1964SC1217` | AIR 1964 SC 1217 | 356 | 1 |
| `200310SCC626` | (2003) 10 SCC 626 | 356 | 1 |
| `20142SCC1` | (2014) 2 SCC 1 | 247 | 9 |
| `20101SCC444` | (2010) 1 SCC 444 | 202 | 1 |
| `AIR2004SC2895` | AIR 2004 SC 2895 | 202 | 1 |
| `20153SCC650` | (2015) 3 SCC 650 | 180 | 1 |
| `19973SCC261` | (1997) 3 SCC 261 | 106 | 8 |
| `20121SCC558` | (2012) 1 SCC 558 | 105 | 4 |
| `20036SCC675` | (2003) 6 SCC 675 | 103 | 5 |
| `AIR1973SC1088` | AIR 1973 SC 1088 | 99 | 1 |
| `20065SCC475` | (2006) 5 SCC 475 | 83 | 1 |
| `20139SCC374` | (2013) 9 SCC 374 | 82 | 3 |
| `20069SCC630` | (2006) 9 SCC 630 | 78 | 2 |
| `19987SCC123` | (1998) 7 SCC 123 | 72 | 4 |
| `AIR2009SC375` | AIR 2009 SC 375 | 71 | 1 |
| `AIR1984SC1543` | AIR 1984 SC 1543 | 70 | 4 |
| `20138SCC633` | (2013) 8 SCC 633 | 68 | 3 |
| `200711SCC58` | (2007) 11 SCC 58 | 66 | 2 |
| `19883SCC354` | (1988) 3 SCC 354 | 65 | 2 |
| `200010SCC527` | (2000) 10 SCC 527 | 65 | 2 |
| `20117SCC172` | (2011) 7 SCC 172 | 64 | 1 |
| `AIR1990SC1305` | AIR 1990 SC 1305 | 64 | 1 |
| `AIR2008SC1968` | AIR 2008 SC 1968 | 61 | 1 |
| `AIR2003SC1386` | AIR 2003 SC 1386 | 60 | 4 |
| `19934SCC727` | (1993) 4 SCC 727 | 59 | 10 |
| `AIR1964SC477` | AIR 1964 SC 477 | 58 | 4 |
| `20157SCC291` | (2015) 7 SCC 291 | 57 | 7 |
| `20058SCC331` | (2005) 8 SCC 331 | 57 | 1 |
| `AIR2000SC1650` | AIR 2000 SC 1650 | 56 | 5 |
| `19988SCC1` | (1998) 8 SCC 1 | 56 | 8 |
| `19993SCC573` | (1999) 3 SCC 573 | 54 | 4 |

**Read the `distinct_courts` column before acting on this list.** Rows citing
from 8-10 different High Courts (`20064SCC1`, `19934SCC727`, `19973SCC261`,
`19988SCC1`, `20157SCC291`) are the strongest candidates for genuinely
important, widely-cited Supreme Court authorities — worth resolving first,
whether by concordance or, if a target turns out genuinely absent, by direct
acquisition. Rows citing from exactly 1 court (most of the top 12) are
plausibly still important, but could also reflect one court's own citation
style or a single frequently-reused template order — worth a manual spot
check before treating the raw count as importance.

**A data-quality caveat, found while running this query and not chased
further because it is outside this lane's remit.** Every row sampled carries
`source_year = 2016` regardless of the target judgment's actual year (which
ranges from 1958 to 2015 in the sample above) — either every one of these
citing documents genuinely dates from 2016 (unlikely, given the underlying
corpus spans decades and courts) or `external_citations.source_year` is
populated from something other than the citing document's real date (an S3
partition-key artefact would fit the shape — `judgments.bench` had exactly
this defect until fixed, `docs/CURRENT_PLAN.md` Q1.4b). **Flagged for LCC,
not fixed here** — it does not affect the `times_cited` ranking above (which
counts distinct `source_key`, not year), but it means `source_year` on this
table should not be trusted for any date-based question until checked.

---

## 3 · WHAT NEW2 SHOULD ACTUALLY DO WITH THIS

1. **Do not acquire.** Nothing in §2 is a genuine acquisition target until
   checked against a concordance source. First move is resolving the
   IndianKanoon-purchase decision already open in `docs/DATA_SOURCES.md` §2 /
   `FOUNDER_QUEUE.md`, then running `citeList`/`docmeta` lookups against the
   top rows in §2 as a cheap, bounded pilot (40 lookups × ₹0.70 ≈ ₹28) before
   any large concordance spend.
2. **If a pilot lookup finds a target genuinely absent from IndianKanoon
   too** (not just unaliased in LawMind's own corpus), *that* is a real
   missing-authority acquisition candidate, and its citing-court spread in
   §2 is the priority signal to rank it by.
3. **The `source_year` anomaly is worth one query to characterise before the
   next citation-quality pass** — whether it's confined to certain
   ingest batches or corpus-wide.

---

## 4 · METHOD NOTE

Query: `SELECT citation_key, count(*), count(DISTINCT court_name) FROM
external_citations WHERE cited_judgment_id IS NULL GROUP BY citation_key
ORDER BY count(*) DESC`, against the live Railway database via the existing
`DATABASE_URL` (Railway TCP proxy, already open per `CLAUDE.md`'s
tcpProxyCreate convention). Read-only. The script used to run it was written
to a temp path inside `packages/db/` and deleted immediately after the
results were captured — no trace left in the tree, confirmed by `git status`.
