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

## 0 · STALENESS WARNING, found and quantified 12 Aug 2026 (this refresh)

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
