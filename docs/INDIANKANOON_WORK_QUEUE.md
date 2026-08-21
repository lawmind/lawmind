# INDIAN KANOON WORK QUEUE — ranked, built from measured LawMind gaps

**NEW3, 17 Aug 2026.** Built the day `docs/FOUNDER_QUEUE.md` FQ-IK-RESOLVED
lifted the 8 Aug decline. **Scope and budget ceiling are still unconfirmed**
(GUESS, not KNOW per that entry) — this is a ranked plan, not spend
authorization. Do not call the API against anything below until
`INDIANKANOON_API_TOKEN` / `INDIANKANOON_BUDGET_PAISE` are actually set
(`services/ingest/src/harvest/indiankanoon.ts` already refuses honestly
without them, per `FOUNDER_QUEUE.md` line ~2283).

**Every row below is a REAL, already-measured LawMind gap** — nothing here
is invented or estimated from category completeness. Source: `docs/
MISSING_AUTHORITY_QUEUE.md`, all figures live-queried by this lane 12–15 Aug
2026 (frozen numbers noted where the underlying table has since moved —
re-verify count before spending, per that doc's own §0 staleness warning).

**Prefer metadata/fragment over full document, always.** LawMind already
holds 20.5M raw documents free via AWS Open Data (`FOUNDER_QUEUE.md`
FQ-20M, corrected 17 Aug 2026 — 17.8M was the wrong figure, not the
founder's)
(`AUTHORIZED_SOURCE_MAP.md` §4). IndianKanoon's `citeList`/`docmeta`
endpoints (₹0.70/lookup, cached forever per `docs/DATA_SOURCES.md` §2) are
metadata-class calls — that is the entire acquisition value here: a
concordance/alias lookup, not a document source. **No full-document fetch
from IndianKanoon is queued below**, and none should be — it would
duplicate a free source for money.

---

## P0-PRE · the 32 unresolved treatment targets (added 17 Aug, from CX1's cross-check)

**32 lookups ≈ ₹22.40, `citeList`/`docmeta`, ahead of P0 below on stakes
alone.** `TREATMENT_GRAPH_GAP.md` §1: 32 unresolved
`overruled`/`overruled_in_part`/`doubted` edges, every one a Supreme Court
judgment about another Supreme Court judgment. `CLAUDE.md`'s own
zero-threshold rule: overruled law rendered without the mark is as severe
as a hallucination. CX1's citation-graph census (workstream J2) flagged
this population independently as P0-currentness-risk — the same finding
from a different angle, not duplicated work. Full row list: that document,
not repeated here.

Cheapest tier in this whole queue relative to its severity: LawMind's own
SC holdings are 99.977% complete, so most targets are near-certainly
already held under a different citation — a `docmeta` hit resolves the
link directly, no document fetch. **Same 5-row `overruled_in_part` subset
is also queued for Supreme Today (`COMPETITOR_QUERY_INVENTORY.md` Tier
0.5) and BharatLaw/NyaI (`BHARATLAW_NYAI_WORK_QUEUE.md` P0)** — running all
three against the identical 5 rows gives a genuine cross-provider
comparison, not three unrelated tests.

---

## P0 · the 123-citation "candidate" bucket — the only population actually short an alias

`MISSING_AUTHORITY_QUEUE.md` §1c sampled the top 200 most-cited unresolved
citations (80,329 of 598,759 edges) against LawMind's own
`judgment_citation_aliases` table. **123 distinct citations (39,921
weighted edges, 49.7% of the sample) had no existing alias** — the other
50.3% already resolve internally and need zero external lookup.

This is the pilot the lane already scoped and costed before IK was
declined: **123 lookups × ₹0.70 ≈ ₹86**, `citeList`/`docmeta` only. For each
of the 123: does IK know this citation at all, and if so, what neutral/SCR
form does it carry? A hit converts a "candidate" into a resolvable alias
LCC can write once, without touching the judgment text. A miss (IK also
doesn't know it) promotes that specific citation to a genuine
missing-authority candidate — see P2.

**Not yet re-verified against the live table** — §1c's 200-citation sample
is from 12–13 Aug; `judgment_citations` has grown since (§0's own staleness
warning applies here too). Re-run the alias-match query before spending the
₹86, not from this document's numbers.

---

## P1 · post-2018 concordance gap — the one hole the ECT structurally cannot fill

`MISSING_AUTHORITY_QUEUE.md` §1d/§1g/§1h: the Supreme Court's own free
Equivalent Citation Table resolves 34.2% of the unresolved population for
£0, but **stops dead at 12.03.2018** — a hard coverage edge, not a parsing
limit. §1h closed this as a research question in the free-source sense
("no free post-2018 concordance publication exists") — but that
conclusion predates IK being available. **This is IK's actual moat over the
ECT**: current concordance data the government table cannot have.

Target population: the **62% of the 6,886-distinct/10,359-edge no-match
SCR bucket dated 2018 or later** (§1g) — 3,574 distinct citations. §1g's
own working hypothesis is that most of these are judgments LawMind already
holds under a neutral citation but with no S.C.R. entry yet assigned by the
reporter (recent judgments are systematically under-cited in print
reporters). **IK's `docmeta` can test this hypothesis directly** — if IK's
own metadata for the citing judgment carries a matching neutral citation
already in `judgments`, that confirms "already held, alias gap" rather than
"genuinely absent," at ₹0.70/lookup versus zero other way to check it.

Cost class: metadata only (`docmeta`), same rate. **Do not pull full text**
— if IK confirms the judgment is already held, LCC links the existing row;
if not held, route to AWS/eCourts per the normal acquisition path, not IK.

---

## P2 · confirmed genuine document gaps — 9 named, checkable, small

`CORPUS_ACQUISITION_QUEUE.md` §AUTHORITY_QUEUE lists **9 specific Supreme
Court judgments** independently confirmed absent from both `judgments` (by
name/date) and AWS's own per-year SC parquet metadata:

| case | citation |
| --- | --- |
| Federation of Mining Associations of Rajasthan v. State of Rajasthan | (1992) Supp 2 SCC 239 |
| Randhir Singh Rana v. State (Delhi Administration) | (1997) 1 SCC 361 |
| Y.V. Rangaiah v. J. Sreenivasa Rao | (1983) 3 SCC 284 |
| Appa Narsappa Magdum v. Akubai Ganapati Nimbalkar | (1999) 4 SCC 453/443 |
| HUDA v. Sunita | (2005) 2 SCC 479 |
| S.H. Medical Centre Hospital v. State of Kerala | (2014) 11 SCC 381 |
| Velaxan Kumar v. Union of India | (2015) 4 SCC 325 |
| Government (NCT of Delhi) v. Manav Dharam Trust | [2017] 4 SCR 232 / (2017) 6 SCC 751 |
| N.V. International v. State of Assam | (2020) 2 SCC 109 |

**This is the one bucket where a real IK document fetch is justified** —
these are confirmed not-held, not "unaliased." 9 lookups, `docmeta` first
to confirm IK has the document and get its neutral citation (₹0.70 × 9 ≈
₹6.30), full-text fetch only for whichever confirm as real and IK's terms
permit — check the fetch class/price against `docs/DATA_SOURCES.md` §2
before pulling, not assumed same rate as metadata.

---

## P3 · cited/cited-by discovery on the highest cross-court authorities

`MISSING_AUTHORITY_QUEUE.md` §2's top-40 unresolved targets, filtered to
`distinct_courts ≥ 8` — the strongest signal of a genuinely important,
widely-relied-on Supreme Court authority rather than one court's citation
habit:

| citation key | sample text | times cited | distinct courts |
| --- | --- | --- | --- |
| `20064SCC1` | (2006) 4 SCC 1 | 377 | 9 |
| `20142SCC1` | (2014) 2 SCC 1 | 247 | 9 |
| `19973SCC261` | (1997) 3 SCC 261 | 106 | 8 |
| `19934SCC727` | (1993) 4 SCC 727 | 59 | 10 |
| `19988SCC1` | (1998) 8 SCC 1 | 56 | 8 |

Once each resolves to a held judgment (via P0/P1, or already aliased),
IK's `citeList` on that judgment surfaces what it cites and what cites it —
graph expansion outward from LawMind's own highest-value nodes, at the same
₹0.70 metadata rate. **Only run after the row resolves to a specific
judgment ID** — running `citeList` against an unresolved citation key
would be guessing which document to expand from.

---

## RETRIEVAL FAILURES / HARD NEGATIVES — waiting on NEW1, not fabricated here

Mission asks for retrieval-failure-driven and hard-negative queue items.
**None added** — this lane has not consumed a current NEW1 failure queue
this session (bus cursor shows NEW1 quiet on Railway per bus 0561, "going
quiet until LOCAL_READY," and LOCAL_READY landed 02:55Z 17 Aug — too recent
for a fresh failure batch to exist yet). Add a section here once NEW1
produces one; inventing retrieval failures from memory would violate the
no-silent-guessing rule.

---

## COST SUMMARY

| bucket | lookups | cost | class |
| --- | --- | --- | --- |
| **P0-PRE** | **32** | **≈ ₹22.40** | metadata (`citeList`/`docmeta`) |
| P0 | 123 | ≈ ₹86 | metadata (`citeList`/`docmeta`) |
| P1 | 3,574 (start with a sample, not all) | ≈ ₹2,502 at full scale | metadata (`docmeta`) |
| P2 | 9 | ≈ ₹6.30 metadata, + doc fetch for confirmed hits | metadata, then selective full-text |
| P3 | 5 (once resolved) | ≈ ₹3.50 | metadata (`citeList`) |

**Recommended order: P0-PRE first — currentness-risk outranks
resolution-throughput, and it is the cheapest tier in the queue. Then P0
(cleanest signal on whether the concordance thesis holds against a live
API), then P2 (small, confirmed, highest certainty), then P1 sampled
before full scale, P3 last.**

## PROVIDER INDEPENDENCE

Every lookup above is a snapshot-then-decompose operation, per the
mission's own test (*"if this account disappears tomorrow, does LawMind
keep the intelligence?"*). `citeList`/`docmeta` responses get written into
LawMind's own `judgment_citation_aliases` (or the citation edge itself) the
moment they resolve — nothing here proposes a runtime dependency on
IndianKanoon. That is LCC's build, not scoped here.
