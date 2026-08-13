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
| 0 | **Supreme Court of India's own Equivalent Citation Table (ECT)** — `main.sci.gov.in/pdf/ECT/` | SCC/AIR/JT/SCALE ↔ S.C.R. concordance, 1950–present, 4 official PDFs | **P1 — fallback for whatever the internal source above doesn't cover** | **£0 — official, free.** Fetch blocked from this session's tools (`sci.gov.in` DNS unreachable, archive.org fetch disabled); needs `agent-browser` or a different network path | VERIFIED_AVAILABLE by strong independent corroboration, **content not yet seen by any LawMind session** — `docs/SOURCE_REGISTRY.md` §5a |
| 1 | ~~IndianKanoon API — purchase~~ **DECLINED, do not re-propose** | ~~citation concordance + tribunal doctypes~~ | — | — | **Settled against, before this lane existed** — `FOUNDER_QUEUE.md`: *"We are NOT buying the Indian Kanoon API... the money is going to Supreme Today instead."* Tribunals now go via Supreme Today (row 1a); concordance still needs the ECT (row 0) or another route |
| 1a | **Supreme Today (= Supreme AI, §6a-authorized, confirmed 12 Aug)** — account + first payment | Tribunals, HC headnotes/treatment, index-first per `HARVEST_ENGINE.md` | **P0, blocked on a credential not a decision** | ₹50,000/month, harvester already built | `FOUNDER_QUEUE.md` §6 "the one real decision" — needs an account, nothing else. Not this lane's blocker to solve |
| 2 | archive.org gazette mirror | Gazette of India, notifications/rules, free | P1 | £0 — one `advancedsearch.php` API call confirms item count/date range | EXPERIMENTAL, `SOURCE_REGISTRY.md` §3 — confirm next |
| 3 | indiacode.nic.in state Acts | State legislation, per-state | P1 | Free, government, already-licensed pattern (central Acts) | Structure unconfirmed — needs an `agent-browser`-driven fetch (indiacode 403'd bare WebFetch this session), not a new source decision |
| 4 | District Court AWS Open Data bucket | District/subordinate judgments, bulk | P2 | Searched directly, not found — see `SOURCE_REGISTRY.md` §4 | **Negative evidence recorded, not proof of absence.** No confirmed bulk text source; NJDG covers only pendency stats |
| 5 | SCC Online / Manupatra API or licensing tier | citation concordance, treatment | P2 | Existence confirmed, access model unknown | Marketing pages only checked; API/bulk terms not found by search — a direct account inquiry is the next step, not more searching |

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

---

## DOCUMENT_QUEUE — tribunals

**CORRECTED 12 Aug 2026 — IndianKanoon is declined, not pending; Supreme AI
= Supreme Today, confirmed by the founder.** The acquisition method for
every row below is now **Supreme Today, once the account/payment blocker in
`FOUNDER_QUEUE.md` §6 clears** — `docs/HARVEST_ENGINE.md` priority 2, no new
purchase decision needed, the harvester is already built and refuses
honestly for lack of an account. IndianKanoon doctype confirmations are kept
as market intelligence only.

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
