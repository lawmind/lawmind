# CORPUS ACQUISITION QUEUE — for New2 (LCC) to consume

**12 August 2026, NEW3 (discovery/acquisition lane).** Per the lane
protocol: NEW3 produces acquisition-ready manifests, it does not run bulk
ingestion and does not write corpus tables. Nothing below has been ingested,
purchased, or decided.

**HARD LIMIT, restated so it cannot be missed by scanning the table below:**
**only BharatLaw, Supreme AI and eCourts India are `CLAUDE.md` §6a-authorized
sources.** AWS Open Data and indiacode.nic.in are separately, already
authorized as public-domain/government data under `CLAUDE.md` §6's general
provision and are already in active use — not a new decision. **Every other
row in every queue below — IndianKanoon, SCC Online, Manupatra, the SCI
Equivalent Citation Table, tribunal sites, gazette mirrors, state Act
portals — is `NOT_AUTHORIZED`.** These rows are research findings (what a
source is, whether it's real, roughly what it would cost), filed in
`docs/FOUNDER_QUEUE.md` as founder decisions, **not cleared acquisition
targets.** See `docs/AUTHORIZED_SOURCE_MAP.md` for the three-source mapping,
including an open identity question on "Supreme AI" itself.

Cross-referenced to `docs/SOURCE_REGISTRY.md` and `docs/
MISSING_AUTHORITY_QUEUE.md` for the fetched evidence behind each line.
Several items are **already open in `FOUNDER_QUEUE.md`** — this queue does
not re-litigate those, it points at them.

Priority order below is by **evidenced value ÷ acquisition cost**, not by
category completeness — a small, cheap, well-evidenced action outranks a
large, unverified one.

---

## SOURCE_QUEUE

| # | source | scope | priority | cost/method | status |
| --- | --- | --- | --- | --- | --- |
| -1 | **INTERNAL — 656 judgments already print paired `S.C.R. : SCC` citations in their own text**, found by LCC 13 Aug resolving a single edge from this lane's queue | Same concordance the ECT would provide, for whatever share of the gap these 656 judgments cover | **P0, now ahead of the ECT** | £0, already held, no fetch, no licensing question. Building the harvester is LCC's (enrichment territory), not this lane's | VERIFIED — read directly from corpus text, not a source LawMind acquired. `docs/SOURCE_REGISTRY.md` §5a-pre, `docs/ai/OVERRULED_GROUP_MARKERS.md` §4 |
| 0 | **Supreme Court of India's own Equivalent Citation Table (ECT)** — live landing page `www.sci.gov.in/judges-library/`; content via Internet Archive (the Court's own links are dead) | SCC/AIR/JT/SCALE ↔ S.C.R. concordance, **1950 – 12.03.2018** (not "present" — the table carries a 2018 stamp), 4 official PDFs | **P0 for closing the citation gap — measured, not estimated** | **£0 — official, free, already fetched and parsed.** Plain `curl`; no browser, credential or CAPTCHA needed | **VERIFIED 14 Aug 2026 — fetched, parsed (235,807 pairs), measured (closes 204,684 of 598,766 unresolved edges = 34.2%), and independently validated at 99.42% against `judgment_citation_aliases`.** `SOURCE_REGISTRY.md` §5a-FETCHED. **Licence NOT cleared** (Government work) — `FOUNDER_QUEUE.md`. Loader is LCC's territory |
| 1 | ~~IndianKanoon API — purchase~~ **SUPERSEDED 18 Aug 2026 — now AUTHORIZED, see below** | citation concordance + tribunal doctypes + missing-PDF recovery | — | paid licence, budget TBC | The 8 Aug decline quoted here (*"We are NOT buying the Indian Kanoon API..."*) is stale — founder confirmed written permission, a separate paid licence and agreed extraction/RAG/training use, 18 Aug (`FOUNDER_QUEUE.md` `FQ-INDIANKANOON-RESOLVED`; `AUTHORIZED_SOURCE_MAP.md` §4). Do not read this row's old text as current — it survived one correction pass and should not survive a second |
| 1a | **Supreme Today (= Supreme AI, §6a-authorized, confirmed 12 Aug)** — account + first payment | Tribunals, HC headnotes/treatment, index-first per `HARVEST_ENGINE.md` | **P0, blocked on a credential not a decision** | ₹50,000/month, harvester already built | `FOUNDER_QUEUE.md` §6 "the one real decision" — needs an account, nothing else. Not this lane's blocker to solve |
| 2 | archive.org gazette mirror (`collection:gazetteofindia`) | **Central Gazette of India: 171,942 docs, 1947-01-01–2026-08-11 (current to 3 days ago), confirmed 453 entries for July 2024 (BNS/BNSS/BSA commencement month).** Wider collection 805,433 docs incl. state gazettes — 13 of 25 HC jurisdictions now measured (Kerala 56.7k, Rajasthan 46.1k, Andhra Pradesh 22.5k, Maharashtra 21.9k, Karnataka 20.3k, Tamil Nadu 15.3k, Punjab 9.4k, Madhya Pradesh 9.4k, Gujarat 8.5k, Telangana 7.1k, Delhi 5.2k, Uttar Pradesh 3.8k, Bihar 0.7k, West Bengal 0.1k — last two possibly a naming-variant miss, unconfirmed) | P1 — highest-value unblocked item in this queue: official, current, no credential needed | £0 — `advancedsearch.php`/`metadata/<id>`/`download/<id>/<file>` all live-tested, straightforward bulk pattern | **VERIFIED_AVAILABLE 14 Aug 2026** — item-level provenance checked (sourced from official `egazette.gov.in` PDFs, carries the gazette's own control ID, mirrored by `sushant@indiankanoon.com`/`github.com/sushant354/egazette`). **Licence not yet cleared** — no `licenseurl` in item metadata, needs the same legal read as any new source before a bulk pull; not a `NOT_AUTHORIZED` source per se (not in the row-15 blanket list above, which predates this finding) but not yet founder-cleared either. Full detail: `SOURCE_REGISTRY.md` §3 |
| 3 | indiacode.nic.in state Acts | State legislation, per-state | P1 | Free, government, already-licensed pattern (central Acts) | **RE-CHECKED 15 Aug 2026 with `agent-browser` (real browser, not `WebFetch`) — same result: "Access Denied."** This upgrades the finding from "WebFetch limitation, try a browser" to "the block is server-side and tool-independent" — a real browser session got the identical denial. Not a NEW3 fetch-method problem; consistent with the domain's other confirmed blocks this session (the bitstream PDF, `data.gov.in`). Next lead, if this stays worth pursuing: a different entry path (a specific state's own Act-portal URL, bypassing indiacode's `simple-search` handle route) or a residential/India-region IP, neither tried this session |
| 4 | District Court AWS Open Data bucket | District/subordinate judgments, bulk | P2 | **RE-CHECKED 17 Aug 2026 — still no full-text source, confirmed by a genuinely new lead that turned out negative, not by re-running the old search.** DDL Judicial Data Portal (`devdatalab.org/judicial-data`, ODbL-1.0) was found and opened via `agent-browser` — its own page states plainly: *"a public dataset describing 81 million cases handled by the district courts in India from 2010-2018"* — **case metadata (status, filing/disposal, act sections, judges), not judgment/order text.** Same shape as NJDG's existing negative finding, not a new source of the thing we actually need. `openjustice-in/ecourts` (the actively-developed scraper this portal points at) **"currently supports services at the High Courts"** only, by its own GitHub description — does not reach District Courts yet | **Still no bulk text source. A separate, real finding below (not this row) governs why third-party scrapers don't close this either** |
| 4b | Third-party eCourts District Court scrapers (`bharat-courts`, `CourtScraper`) | claim bulk access to 700+ District Courts via "automated CAPTCHA handling" | **NOT VIABLE — checked against our own authorization, not against the source. RE-CHECKED 17 Aug 2026 after a direct question naming "bharat-courts" specifically — same conclusion, more precisely grounded.** | N/A — this is a policy finding, not a fetch-method one | **Two independent reasons, both confirmed by reading the repo itself.** (1) **No affiliation with BharatLaw.** Owner `iamshouvikmitra`, MIT-licensed, zero mention of "BharatLaw"/`bharat.law` anywhere in the repo — the name match is coincidental, not the §6a-authorized BharatLaw entity. (2) **Not covered by our eCourts grant regardless.** `ECOURTS_AUTHORISATION.md`: our CAPTCHA-bypass scope is *"the bulk cause-list path in `ecourts.ts` alone"* — not general District Court order/judgment scraping — switch currently OFF. The tool's own docs confirm it solves eCourts' CAPTCHA itself (`ddddocr`-based auto-solver, ~75% accuracy, auto-retry on failure) with **no mention of any registrar authorization**, no fetch ledger, no rate limiter — an independent, unauthorized-access act under IT Act ss. 43/66 that our grant does not extend to. **Do not adopt, do not evaluate further** — not a licensing question for `FOUNDER_QUEUE.md`, already answered by the existing grant's own text |
| 5 | SCC Online / Manupatra API or licensing tier | citation concordance, treatment | P2 | **RE-CHECKED 17 Aug 2026.** Manupatra: `manupatrafast.com/Regs/Terms.pdf` and a formal Subscriber Agreement exist (`manupatra.in/reg/license agreement - online.pdf`) — **subscriber/IP-based access plans, contact-sales pricing, no bulk API or per-call pricing tier found.** SCC Online: same shape, subscription-only (~₹30,000/yr full, subsidised advocate tiers ~₹800-1,000/mo per third-party summaries, not the vendor's own page) — **no API product found for either.** **The founder is separately contacting both re: student/API/data access — per that directive, capability research only below, no automation of either private service, and no assumption that an ordinary subscription authorizes extraction.** Capabilities found (public marketing pages, no login): **Manupatra** — human-editorial headnotes/citator (overruled/followed treatment), unique per-document citation ID, an AI/RAG layer ("Manuworks"). **SCC Online** — human-editorial headnotes/digest notes since 1968; **TruePrint™** (authenticated scanned-page PDFs, court-submittable — a product feature, not a data asset, hard to replicate from raw text); **Mercury** (real-time cross-court case tracking/alerts, SC+HC+District+Tribunal) — closer to Track B (live state) than to corpus acquisition; ~4M documents/19M pages claimed | Existence and rough pricing shape now confirmed for both; **neither offers a bulk/API acquisition path.** **When replies arrive, compare unique value against IndianKanoon/Supreme Today/BharatLaw/our own corpus before subscribing** — SCC's TruePrint and Mercury are the two features that don't obviously overlap with anything already authorized; both vendors' treatment/citator data is human-editorial (unlike NyaI's ambiguous computed-vs-curated status), which matters if benchmarking is ever authorized the way it was for IndianKanoon/BharatLaw |
| 6 | RERA (Real Estate Regulatory Authority) tribunals | state Appellate Tribunal orders, new category, not in any prior queue | P2 | **Moved to `docs/RERA_STATE_MATRIX.md`, 17 Aug 2026 — a per-state field matrix (mechanism, CAPTCHA, raw/reasoned/Roznama counts, dates, licence), not a single-row summary, per the founder's ranked-by-reasoned-decisions directive.** Maharashtra CLOSED (NEW2): 7,376 reasoned of 49,167 raw. Delhi CLOSED (NEW3): 481 documents, CAPTCHA gates search-refinement only, base listing open. Karnataka: in progress, latency not access-control. 25+ states unstarted, template proven twice | See matrix file. Authorization **OPEN** — `FQ-CCI-PERMISSION`, covers CCI + CAT + RERA (all states) on one s.52(1)(q)(iv) ruling |
| 7 | Central Information Commission (CIC) | RTI appeal decisions | P2 | **RE-CHECKED 17 Aug 2026 — unchanged.** No API or bulk-download mechanism found by search; the real search form (`dsscic.nic.in/cause-list-report-web/view-decision/1`) remains CAPTCHA-gated per `SOURCE_REGISTRY.md` §2b, 15 Aug. One landmark-decisions compilation PDF (74.0MB) exists on `cic.gov.in/cic_landmark` — a curated subset, not the full decision corpus, not yet fetched/sized | **Still closed to us** — CAPTCHA-gated, same as NCLT/CESTAT/ITAT/NGT, no bypass authorization extends here |

---

## AUTHORITY_QUEUE (the citation-graph-driven queue, mission §6)

**Full ranked list: `docs/MISSING_AUTHORITY_QUEUE.md` §2 — 40 targets, ranked
by distinct citing High Courts.** Not duplicated here. **The single load-
bearing instruction for New2:** do not acquire any of those 40 as new
documents. **Check them against the Supreme Court's own Equivalent Citation
Table first (SOURCE_QUEUE #0) — it's free and covers exactly this gap (SCC/
AIR/JT/SCALE → S.C.R.) for the corpus's whole date range.** IndianKanoon is
**declined, not a fallback option** (see SOURCE_QUEUE #1). If the ECT
doesn't parse or doesn't cover a given entry, the next lead is whatever
editorial/citation cross-reference data the Supreme Today licence surfaces
once an account exists — not independently confirmed to include a
concordance, but "Authority Check treatment" and headnote data are exactly
the kind of editorial layer that plausibly carries parallel citations. The
evidence strongly suggests (§1 of that doc) 99.6% of LawMind's entire
unresolved-citation population is an alias-resolution problem against
judgments already held, not a genuine acquisition gap — so the right first
move is free (the ECT), not paid.

**Two confirmed, genuine document gaps — found via the treatment graph, not
`external_citations`, so the freeze above doesn't apply to these.** LCC's
grouped-marker pass (bus 0243, 13 Aug) named two Supreme Court judgments
that MADA v. SAIL (`2024 INSC 554`) cites as overruled, both absent from
the corpus. Checked directly against `judgments.case_title` this lane, not
inferred from LCC's report:

| case | citation | checked | result |
| --- | --- | --- | --- |
| Federation of Mining Associations of Rajasthan v. State of Rajasthan | `(1992) Supp 2 SCC 239` | `case_title ilike '%Federation of Mining Association%'` | **NOT FOUND** |
| Randhir Singh Rana v. State (Delhi Administration) | `(1997) 1 SCC 361` | `case_title ilike '%Randhir Singh Rana%'` | **NOT FOUND** |

Both are Supreme Court judgments, both citations already known from the
corpus's own text (no external lookup, no model recall) — full detail
`docs/ai/OVERRULED_GROUP_MARKERS.md`, `docs/TREATMENT_GRAPH_GAP.md` §3c.
**P1** — cheap to acquire once verified (two specific, named, dated SC
judgments; not a bulk fetch), but not P0 since neither currently mis-renders
anything (a document we don't hold can't display wrong — see
`TREATMENT_GRAPH_GAP.md` §3c on why a missed edge to a NOT_HELD judgment is
a graph gap, not a rendering defect). Checked: this lane holds 362 SC judgments from 1992 and 843 from 1997 —
**not a year-partition gap**, the AWS SC coverage for both years is
substantial. These two are individual missing documents within otherwise-
covered years, not evidence of a systemic SC-source hole. Treat as a
two-document fetch, not a source problem.

**UPDATE 19 Aug 2026 (NEW3) — this section, `TREATMENT_GRAPH_GAP.md`'s own
32/33/34 count, and the bus have been carrying interchangeable numbers.
`docs/TREATMENT_MANIFEST_V1.md` is now the single canonical list: 32
current-work rows, bucketed by disposition, plus 1 misattributed row
(`(2017) 14 SCC 533`, a HC judgment's `(supra)` backreference wrongly
attached) excluded and logged as an audit rejection, not a target. The 7
identities below (§1c in that manifest) remain the correct provider-query
list once Supreme Today access exists — nothing here changes, this is a
pointer, not a correction.**

**Eight more, 13 Aug 2026 — the RING_PROGRAM.md §3 "13 no-candidate"
targets, identified and checked.** `overruled-resolve-cli.ts` re-run fresh
against the current corpus named 13 `overruled`-relationship edges with no
name-matching candidate at all. All 13 identified externally (never from
memory), checked against `judgments` by name, loose title variants, and —
where a decision date was independently confirmed — the exact date. Full
account and method: `docs/TREATMENT_GRAPH_GAP.md` §3e.

| case | citation | citing judgment | checked |
| --- | --- | --- | --- |
| Y.V. Rangaiah v. J. Sreenivasa Rao | `(1983) 3 SCC 284` | State of HP v. Raj Kumar | name + exact date (1983-03-24) — a different SC judgment holds that date |
| Appa Narsappa Magdum v. Akubai Ganapati Nimbalkar | `(1999) 4 SCC 453` (independently reported as `443`) | Vasant Ganpat Padave | name + exact date (1999-05-04) — 8 other SC judgments hold that date, not this one |
| HUDA v. Sunita | `(2005) 2 SCC 479` | HUDA v. Vidya Chetal | name + exact date (2005-01-14) — zero SC judgments held for that date |
| S.H. Medical Centre Hospital v. State of Kerala | `(2014) 11 SCC 381` | Lisie Medical Institutions | name, loose variants — no false-positive near-match |
| Velaxan Kumar v. Union of India | `(2015) 4 SCC 325` | Indore Development Authority v. Shailendra | name, with/without periods — no match |
| Government (NCT of Delhi) v. Manav Dharam Trust | `[2017] 4 SCR 232` / `(2017) 6 SCC 751` — one target, two forms | Shiv Kumar v. Union of India | name match surfaced an unrelated 2025 Rajasthan HC case, checked and ruled out by subject matter |
| N.V. International v. State of Assam | `(2020) 2 SCC 109` | Govt of Maharashtra v. Borse Brothers | name, with/without periods, exact-citation reporter-array check — no match |

**M.K. Kunhimohammed v. P.A. Ahmedkutty (`AIR 1987 SC 2158`) struck from
this table 13 Aug 2026 — not a gap.** NEW2 (bus 0340) found it already held
in `judgments` under a source-side typo in AWS's own 1987 metadata
("AHMEDKUITY" for "AHMEDKUTTY") and under its S.C.R. citation, not AIR —
`[1987] 3 S.C.R. 1149`. Full account: `TREATMENT_GRAPH_GAP.md` §3e.

**CLOSED 13 Aug 2026 (bus 0340, NEW2) — the remaining 7 are confirmed
absent from AWS, not merely unmatched by name.** NEW2 checked each
directly against AWS's own per-year SC parquet metadata (by exact decision
date where known, by distinctive party-name substring otherwise) — zero
hits for all 7. Genuinely-not-held-by-LawMind and confirmed-absent-from-
AWS are now the same claim for this set: SC holdings are 38,341 of 38,351
(99.97%, `DATASETS.md`), the existing 10-document gap already
individually characterised (6 HTTP 404, 3 corrupt PDF, 1 unexplained,
none of these 7 among them) — these 7 are a second, independently-verified
absence, outside the authorized AWS source. **Not fetched — no gap-fill
source exists** (`SOURCE_REGISTRY.md`); this is not NEW2 parity work, it
is a genuine source-coverage limit. **Two related targets from the same
13-row set are the opposite problem, not acquisition at all**: Sun Export
Corporation v. Collector of Customs (target of `(1977) 6 SCC 564`,
actually printed year is wrong — real citation `(1997) 6 SCC 564`) and
SEBI v. Roofit Industries Ltd. (target of `(2016) 12 SCC 125`) are both
**already held** and currently rendering as live good law despite being
genuine overruled targets — a citation-linking defect for LCC's
concordance work, flagged there not here.

---

## DOCUMENT_QUEUE — tribunals

**CORRECTED 12 Aug 2026 — IndianKanoon is declined, not pending; Supreme AI
= Supreme Today, confirmed by the founder.** **SUPERSEDED 18 Aug 2026 — the
IndianKanoon half of this correction is now itself stale.** IndianKanoon is
authorized (`FQ-INDIANKANOON-RESOLVED`, `AUTHORIZED_SOURCE_MAP.md` §4) —
written permission, paid licence, extraction/RAG/training use. Supreme AI =
Supreme Today still stands. The acquisition method for every row below
remains **Supreme Today, once the account/payment blocker in
`FOUNDER_QUEUE.md` §6 clears** — `docs/HARVEST_ENGINE.md` priority 2 is
unchanged, IndianKanoon has not displaced it as the primary tribunal route.
IndianKanoon doctype confirmations are no longer market-intelligence-only;
they are a live, budgeted option, just not yet the recommended one for
tribunals specifically (see `docs/INDIANKANOON_WORK_QUEUE.md` for where IK
actually ranks — missing-PDF recovery and citation concordance, not
tribunals).

| tribunal | acquisition method | priority | status |
| --- | --- | --- | --- |
| NCLT/NCLAT, CESTAT, ITAT, CAT, NCDRC | **Supreme Today harvest, `HARVEST_ENGINE.md` priority 2** | P1 (blocked on account, not a source decision) | Confirmed by name in Supreme Today's own priority list (NCLT/NCLAT, ITAT, CESTAT, SAT, DRT) or by IndianKanoon market intel (NCDRC, CAT) |
| SAT, DRT/DRAT | Supreme Today harvest | P1 | Named explicitly in `HARVEST_ENGINE.md`'s priority-2 list |
| NGT, TDSAT, CAT, CCI, AFT | **ALL CONFIRMED covered** — Supreme Today, verified by direct search across multiple pages (not just one filter view) | P1 | Broader than `HARVEST_ENGINE.md`'s original stated list; CCI/AFT resolved 13 Aug after initially reading as absent from a single page |
| RERA, Central Information Commission | **NEW, not previously identified anywhere in this repo** — found on Supreme Today's own filter, 13 Aug | P1 | RERA alone is a large practice area; worth adding to the priority-2 acquisition list explicitly once harvesting starts |
| GSTAT | N/A | — | **Not a gap — the tribunal itself only started operating 16 Feb 2026.** Almost no case law exists anywhere yet. Notably already tracked on Supreme Today's filter despite this. Revisit in 12-18 months, not now |

**The one action item that isn't "wait for the account":** once Supreme
Today harvesting starts, confirm early whether CCI/TDSAT/NGT/AFT are
actually covered.

### SUPERSEDING, 14 Aug 2026 — the tribunals publish their own orders, and two are verified open

**Every row above assumes the acquisition method is Supreme Today. That
assumption was never tested against the tribunals themselves.** It is wrong
for at least two of them, and possibly more.

**Supreme Today is an aggregator. The tribunals are the publishers.** All 14
tribunal domains were probed directly this session and **two were verified
end-to-end — a real judgment PDF downloaded and its text extracted:**

| tribunal | status | verified artifact |
| --- | --- | --- |
| **NCLAT** | **VERIFIED OPEN**, free, no CAPTCHA, no account | order PDF, 56,049 bytes, 14 Aug 2026 |
| **TDSAT** | **VERIFIED OPEN**, free, no CAPTCHA, no account | reasoned judgment PDF, 304,798 bytes, 13 Aug 2026 |
| **CCI** | **CLOSED 17 Aug 2026 (NEW2, `TRIBUNAL_ACQUISITION_MEASUREMENT.md`) — bulk-enumerable, exact volume 1,231 orders, direct PDF fetch, no CAPTCHA.** Independently re-verified this lane, byte-identical (171,290 bytes). **Authorization OPEN — `FQ-CCI-PERMISSION`, one email**; site copyright policy requires prior written permission, arguable s.52(1)(q)(iv) exemption not yet founder-ruled | `POST /antitrust/orders/list` (DataTables) → `recordsTotal: 1231`; PDF path in `file_content` |
| **CAT** | **CLOSED 17 Aug 2026 (NEW2) — bench × date range is a complete enumeration key**, 42 benches, no CSRF/CAPTCHA/session. **Authorization OPEN** — no restriction found, disclaimer unread | `GET fiorder_detail.php?benchCode3=100&from_date=...&to_date=...` → 15 Delhi orders July 2026, PDF verified 340,312 bytes/14pp |
| NCLT · CESTAT · ITAT · NGT | **CAPTCHA-GATED — closed to us** | the eCourts bypass grant does not extend here |
| CIC | reachable, no CAPTCHA, not chased to a PDF | |
| NCDRC | reachable, no order link on homepage | needs a deeper path search |
| SAT (503) · AFT · DRAT · IPAB | unreachable this session | not a verdict |

**This does not cancel the Supreme Today item** — it still covers the
CAPTCHA-gated four, plus headnotes and Authority Check treatment, which
first-party sites do not provide. It does mean **the tribunal category is no
longer wholly blocked on a ₹50,000/month credential.**

**NOT AUTHORIZED yet** — neither host is §6a-named; filed to
`FOUNDER_QUEUE.md`. Mechanism, request sequence and two path traps:
`SOURCE_REGISTRY.md` §2b. Fetching is NEW2's territory once cleared.

---

## STATUTE_QUEUE

| item | status |
| --- | --- |
| **The Constitution of India itself** | **STRUCTURE VERIFIED 13 Aug 2026, hands-on — this is now actionable, not just discovered.** `statutes` confirmed 0 rows matching "constitution". **`indiacode.nic.in` blocks this session's fetch tools outright (403 on both the handle page and the bitstream PDF, third confirmed instance of this domain doing so)** — worked around by finding and downloading the *same official document* from `cdnbbsr.s3waas.gov.in` (a different Government of India CDN domain, not blocked), then extracting it with the repo's own `pdftotext` (confirmed on PATH at `/mingw64/bin/pdftotext`) instead of trusting WebFetch's unreliable binary-PDF summary. **Verified findings, read from the actual extracted text, 10,512 lines / ~850KB:** (1) it is **one continuous PDF**, Preamble through Part XXV and all **twelve Schedules present in the same file** (confirmed via the document's own table of contents at "SCHEDULES — FIRST SCHEDULE... TWELFTH SCHEDULE"); (2) Articles are **cleanly numbered and parseable** — `"1. Name and territory of the Union.--(1) India, that is Bharat..."`, footnoted amendments bracketed `1[...]` with numbered notes below, `PART I THE UNION AND ITS TERRITORY` as a clean structural marker — a shape a parser can reasonably target, similar in spirit to the existing central-Act section parser; (3) it is the **official Ministry of Law and Justice edition, "As on 1st May 2024," amendments through the 106th Amendment Act 2023**, signed by the Secretary to the Government of India — authoritative, not a third-party compilation; (4) it is a **diglot (Hindi/English) edition** — the Hindi portions extracted as mojibake under plain `pdftotext`, needs `-enc UTF-8` or equivalent, a real technical detail for whoever builds the parser; (5) it carries **three appendices beyond the bare Articles** — Appendix I (100th Amendment Act, India/Bangladesh territory), Appendix II (the Constitution (Application to J&K) Order, 2019, verbatim), Appendix III (the Article 370(3) declaration, verbatim) — historically significant text, a different category from core Articles, worth a parser decision on whether to include. **Exact URL**: `https://cdnbbsr.s3waas.gov.in/s380537a945c7aaa788ccfcdf1b99b5d8f/uploads/2024/07/20240716890312078.pdf`. Public-domain government text, no licensing question — purely an engineering gap now fully scoped |
| IPC↔BNS section mapping | **Already open, in progress** — `FOUNDER_QUEUE.md` "IPC↔BNS mapping". `statute_mappings` confirmed still 0 rows this session (live query). Not this lane's item to build; flagged only because it's the one statute item already moving |
| State Acts, per-state, structured | New this session — see SOURCE_QUEUE #3. Needs structure confirmation before any ingest plan |
| Rules/regulations/notifications | Depends on the Gazette mirror (SOURCE_QUEUE #2) landing first |
| Limitation Act schedule, Court Fees Act state tables | **Already open** — `FOUNDER_QUEUE.md` "Limitation and court-fee calculators need a sourced dataset". Not re-researched here; same primary-source discipline applies |

---

## COURT_QUEUE / YEAR_QUEUE

**Deferred.** The existing HC ingest (`docs/HC_INGEST_PLAN.md`, actively
running — this session's own live `judgments` snapshot shows 312,373 rows
mid-ingest) already owns the court/year sequencing for Supreme Court + High
Courts. Building a competing court/year queue here would duplicate New2's own
in-flight plan rather than add information. This lane's court/year-relevant
finding is narrower and already stated: **District Courts have no confirmed
bulk text source yet** (SOURCE_QUEUE #4) — that is a category question, not
a court/year sequencing one, until the source question resolves.

---

## WHAT THIS QUEUE DELIBERATELY DOES NOT INCLUDE

- **No dedup keys, source hashes, or per-document identifiers** — nothing
  here has been fetched at document level yet. The mission's §8 handoff
  shape (source identity, download URL, document identifier, dedup key,
  source hash) applies once a SOURCE_QUEUE item is confirmed and a real
  ingest is scoped — premature at the current research depth for every row
  above except the already-open IndianKanoon/AUTHORITY_QUEUE item.
- **No volume/cost estimates for RESEARCH INCOMPLETE rows.** Per the
  no-hallucination rule, an unestimated volume is left blank, not guessed.

---

## HANDOFF

Notified via a dated entry in `docs/FOUNDER_QUEUE.md` and
`docs/CURRENT_PLAN.md` (both read at LCC's session start per `CLAUDE.md`
§0) rather than the LCC/RCC bus — this session is unbound to either lane
(`docs/LANE_BUS.md` §1) and binding as LCC to send one message would be a
false claim about which lane produced this work. `docs/
ACQUISITION_SESSION_LOG.md` carries the full session record for continuity.

---

## HANDOFF, 15 Aug 2026 — Railway-exit-window deliverables

**During NEW2/LCC's database migration window, per the founder's cost-aware
directive, this lane produced two new documents rather than running further
DB-heavy queries:**

- **`docs/R2_SOURCE_RETENTION_MATRIX.md`** — every source in this queue and
  in `SOURCE_REGISTRY.md`, classified by whether a raw copy belongs on R2.
  Headline: AWS Open Data and archive.org mirrors are already more durable
  than R2 and should never be duplicated onto it; single-webserver
  `.gov.in` sources (the ECT, BPRD mapping PDFs, the Constitution PDF) have
  the opposite property — three confirmed 403s/dead-links this session
  alone — and should be retained on first successful fetch, reversing the
  mission's stated "process in place" default for that specific class.
- **`docs/COMPETITOR_QUERY_INVENTORY.md`** — the ranked, NOT-YET-RUN Supreme
  Today query queue for the first month of access, built from this queue's
  own measured gaps (the 40-item `MISSING_AUTHORITY_QUEUE.md` list, the 9
  confirmed document gaps, the pre/post-2018 SCR no-match split). Nothing
  in it has been queried — Supreme Today is still blocked on an account.
