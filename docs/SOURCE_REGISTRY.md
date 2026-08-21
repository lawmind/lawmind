# SOURCE REGISTRY — master inventory of Indian legal data sources

**Started 12 August 2026, acquisition/discovery lane (unbound session, self-
identifies as "New3" per the founder's brief — not LCC, not RCC; writes new
files only, never edits an in-flight LCC/RCC file).** This is the master
catalogue the founder's DATA MOAT ACQUISITION PROGRAM asked for: what exists,
what LawMind holds, what's obtainable, and at what truth-state. It complements,
and does not replace, `docs/DATA_SOURCES.md` (7 Aug), `docs/DATASETS.md`,
`docs/CORPUS_GAP_PLAN.md` and `docs/ai/AWS_CORPUS_INVENTORY.md` — those already
carry deep, fetched research on Supreme Court, High Court and central-Act
sources and are not repeated here except where this session found something
new or a number needed refreshing.

**12 Aug 2026 update — the bus went to five lanes, and this file predates
that.** This session is now bound as **NEW3** under `docs/LANE_PROTOCOL.md`.
The hard limit that governs everything below: **only BharatLaw, Supreme AI
and eCourts India are `CLAUDE.md` §6a-authorized**, plus AWS Open
Data/indiacode.nic.in as already-active public-domain/government sources
under §6's separate provision. **Every other source catalogued in this
file — IndianKanoon, the SCI Equivalent Citation Table, tribunal sites,
gazette mirrors, state Act portals, SCC Online, Manupatra — is
`NOT_AUTHORIZED`.** They remain here as research (what exists, whether it's
real, roughly what it costs), each already routed to `docs/
FOUNDER_QUEUE.md` as a founder decision, never as a cleared target for
NEW2. See `docs/AUTHORIZED_SOURCE_MAP.md` for the three-source mapping.

**Ground rule (mission §17, carried forward): a source is only `VERIFIED_*`
here if a URL was actually fetched this session or in one of the docs above.
Everything else is `UNKNOWN` or `NOT YET RESEARCHED`, stated plainly.** Four
parallel research subagents were dispatched for the categories below and all
four failed on an account-level session-limit error before returning a
result (see `docs/ACQUISITION_SESSION_LOG.md`). The tribunal, state-Act,
gazette and eCourts-district rows below were therefore researched directly by
this session with a smaller, hand-picked set of fetches — real but narrower
than the original brief intended. Rows marked **RESEARCH INCOMPLETE** are the
honest record of that gap, not a finding.

---

## 0 · WHAT LAWMIND HOLDS TODAY — measured live, 12 Aug 2026, REFRESHED 14 Aug

**Original 12 Aug table kept below for the trail; this replaces it as the
current baseline.** Queried directly against production (`packages/db`,
read-only), not recalled from an earlier doc:

| | count |
| --- | --- |
| `judgments` total | **3,275,365** (was 312,373 — **10.5x growth** in ~2 days) |
| — Allahabad High Court | 503,983 (was 46,467 — now the single largest court, was not even top-3) |
| — High Court of Madhya Pradesh | 335,028 |
| — Bombay High Court | 233,852 |
| — Patna High Court | 207,795 (was largest court at 58,834, now 4th) |
| — High Court of Kerala | 199,240 |
| — High Court of Himachal Pradesh | 159,353 |
| — High Court of Gujarat | 152,181 |
| — High Court Of Rajasthan | 144,970 |
| — High Court of Uttarakhand | 138,056 |
| — High Court of Punjab and Haryana | 133,154 |
| `judgment_citations` (internal) | 1,336,748 rows, 112,243 resolved (**8.4%**, down from 34.7% — extraction has not kept pace with the 10.5x corpus growth) |
| `external_citations` (points outside the corpus) | **51,272 rows, 18,889 resolved (36.8%) — byte-identical to 12 Aug, confirmed frozen since 2026-08-11T00:34:11Z.** See `MISSING_AUTHORITY_QUEUE.md` §0 for the full staleness account |
| `judgment_citation_aliases` (SCC/AIR↔SCR concordance) | 4,394 (unchanged) |
| `statutes` | 846 (central Acts only — +1) |
| `statute_mappings` (IPC↔BNS etc.) | **0** — still open, `FOUNDER_QUEUE.md` |

**The Allahabad jump (46,467 → 503,983, +984%) is not organic ingest
progress alone — it's the visible fingerprint of the row-group batch-size
fix from this session's parquet-reading thread (bus 0407/0419/0426):**
Allahabad's largest files were the ones stuck behind the single-row-group
problem, and fixing the read strategy unblocked exactly this court's
backlog. Worth knowing when reading any per-court growth number in this
session's docs — some of it is steady-state ingest, some of it is one
specific bug fix landing.

This is the baseline every gap measurement below is against. Original 12
Aug baseline (79,322 → 312,373, ~4x) has now compounded to 3,275,365 —
any coverage percentage quoted in an older doc, including this file's own
earlier passes, should be treated as stale until re-measured against this
number specifically.

---

## 1 · JUDGMENTS — Supreme Court, High Courts

**Already deeply researched. Not repeated here.** See `docs/DATASETS.md` §AWS
Open Data, `docs/ai/AWS_CORPUS_INVENTORY.md`, `docs/HC_CORPUS_SURVEY.md`,
`docs/CORPUS_GAP_PLAN.md`. Truth-state: **VERIFIED_AVAILABLE**, in active use.
Source: `s3://indian-high-court-judgments` + the Supreme Court equivalent
bucket, AWS Open Data, CC-BY-4.0. HC ingest is running now (this session's own
`judgments` snapshot above is mid-run evidence of that).

**Not re-verified this session, but flagged for LCC to confirm when
convenient:** whether a distinct District Court AWS Open Data bucket exists
was researched this session (§4 below) — a genuinely new question, not a
repeat of the SC/HC research.

### 1a · HISTORICAL REPORTERS, 14 Aug 2026 — genuinely new category, pre-1950 Privy Council + colonial-era High Court reports, free

**Not previously in any LawMind doc searched this session.** AWS's HC bucket
holds relatively little pre-1950 material (`COVERAGE_GAP_MATRIX.md` §3 —
most courts' historical spread starts 1950s-1980s, some earlier). This is a
genuinely different, older layer: **the Digital Library of India project**
(government-sponsored book digitization, mirrored on archive.org under
`collection:digitallibraryindia`) **holds a real, sizeable legal collection
— 1,676 items tagged `subject:law`, 571 matching "law reports"/"Privy
Council"/"Indian Appeals" directly**, checked by live API query, not a
search snippet.

**Confirmed real, not a search-result mirage** — fetched one item directly
(`archive.org/details/dli.csl.5651`, "Privy Council Judgments on Appeals
from India" by Pran Nath Saraswati, Vol. 1, 1825–1862, via the Central
Secretariat Library, Government of India): full text readable and
downloadable in PDF (531.7MB), EPUB, plain text, and OCR (HOCR/ABBYY)
formats, no paywall.

**A sample of what the collection contains, from a title search alone (not
the full 1,676):**

    identifier                  title                                                                      year
    calcuttalawjour00coungoog   Calcutta Law Journal — Privy Council appeals + Fort William HC               1905
    digestindianla03boseuoft    Digest of Indian law cases — HC 1862-1909 + Privy Council 1836-1909           —
    adigestindianla00commgoog   Digest of Indian law cases — HC 1862-1900 + Privy Council 1836-1900          1901
    privycounciljud00coungoog   Privy Council judgments NOT reported in the Indian Law Reports, 1876-1897    1897
    bengallawreport01coungoog   Bengal Law Reports — HC Fort William + Privy Council decisions               1868
    lawrancesbengal00unkngoog   Lawrance's Bengal Law Reports, 1868-75                                       1882

**This is exactly the "historical reporters where legitimately accessible"
category the mission brief names (§18)** — a genuinely additive layer for
the 1825–1947 span this product currently has almost nothing from, not a
duplicate of anything AWS holds (AWS's earliest material is post-
independence eCourts digitization; this is Privy Council/colonial High
Court material with no eCourts equivalent at all).

**What is NOT yet established, stated plainly:**
- **License/rights not checked this pass** — DLI items being pre-1923 (in
  several cases) makes global public-domain status likely for those
  specific volumes, but this varies by volume and this lane does not
  clear licences regardless. archive.org's own terms and any DLI-specific
  rights statement need reading before treating this as cleared, same
  discipline as every other source in this file.
- **Full-collection scale not characterised** — 1,676 is a `subject:law`
  tag count, not a verified count of genuinely Indian-court legal
  reporters specifically (the DLI project spans all subjects; some tagged
  "law" items could be non-Indian or non-reporter works, e.g. legal
  treatises rather than case reports — not filtered out this pass).
- **Text quality unmeasured** — this is 19th/early-20th-century OCR of
  scanned book pages, not the AWS bucket's structured parquet metadata +
  clean PDF pipeline. Likely far noisier text, unverified.
- **Editorial content risk** — per `CLAUDE.md`'s existing rule (raw court
  text only, never a reporter's copy-edited version, *Eastern Book Company
  v. D.B. Modak*), these are published REPORTERS (Calcutta Law Reports,
  Bengal Law Reports, etc.), not raw court records — the same
  headnote/editorial-numbering concern that already governs modern
  reporter use applies here too, arguably more so given how editorially
  dense 19th-century law reports typically are. **Worth a second look at
  whether this category is usable at all under that existing rule**,
  not just a licensing question — flagged, not resolved, this pass.

Not queued to `FOUNDER_QUEUE.md` yet — no immediate downstream need
identified, and the editorial-content question above needs answering
before a licence question is even the right next step. Recorded as a
genuine discovery finding per the mission's own standard, not an
acquisition-ready manifest.

---

## 2 · TRIBUNALS — genuinely new to LawMind (currently 0 tribunal decisions held)

**CORRECTED 12 Aug 2026 — the recommendation below (IndianKanoon) was wrong
because it was made without checking `FOUNDER_QUEUE.md` first.**
IndianKanoon was already declined by the founder before this lane existed
(*"We are NOT buying the Indian Kanoon API... the money is going to Supreme
Today instead"*, *"Indian Kanoon is settled: no API"*). **The correct
acquisition path for tribunals is Supreme Today (= Supreme AI, confirmed
§6a-authorized, identity question resolved 12 Aug — `docs/
AUTHORIZED_SOURCE_MAP.md` §2), priority 2 in `docs/HARVEST_ENGINE.md`'s
already-built harvest plan** (NCLT, NCLAT, ITAT, CESTAT, SAT, DRT), blocked
only on the account/payment already tracked in `FOUNDER_QUEUE.md` §6 — not a
new source decision. The IndianKanoon research below is kept as a record of
what was checked and why it doesn't apply, not as a live recommendation.

**Original (superseded) finding:** the obvious approach — build a scraper
per tribunal site — is the wrong one, on two independent grounds fetched
this session:

1. **The tribunals' own sites offer no bulk access.** `nclt.gov.in` fetched
   directly: case-by-case search only (by case number, order date, judgment
   date), no stated document count, no API documented on the page. This
   matches the shape of every other tribunal site found by search (ITAT —
   `itat.gov.in/judicial/tribunalorders`, searchable by appeal number/date/
   member name only; CESTAT — `cestat.gov.in` + a separate e-filing portal,
   same shape). Building against these would mean ten separate one-record-at-
   a-time scrapers, each fragile, each a fresh legal/robots question.
2. **IndianKanoon — a source LawMind already holds a paid, attributed licence
   for (`docs/DATA_SOURCES.md` §2) — already indexes tribunal orders.**
   Confirmed by two independent search results this session: IndianKanoon's
   own `doctypes:` filter returns real result pages for `nclt`, `cestat`
   (Kolkata, Gujarat, Delhi benches all present as distinct doctype filters),
   and a general-web description states IndianKanoon "extracts judgments and
   orders from the Supreme Court of India, all 24 High Courts, central
   tribunals including NCLT, NGT, ITAT, CESTAT, Law Commission reports, and
   central acts." A direct search for `national consumer disputes redressal
   commission doctypes: judgments` also returned live IndianKanoon result
   pages, confirming NCDRC is indexed too.

**So the acquisition path for tribunals is very likely "use the IndianKanoon
API LawMind is already licensed for, filtered to the tribunal doctypes,"
not "build new scrapers."** This is a **recommendation with real but
incomplete evidence** — confirmed that IndianKanoon *indexes* NCLT/NCLAT/
ITAT/CESTAT/NGT/NCDRC doctypes; **not yet confirmed** whether their paid API
(vs. the public web search UI) exposes the same `doctypes:` filter, what the
per-tribunal volume actually is, or what a bulk pull would cost at their
published ₹0.50/search + ₹0.20/document rates. That confirmation is the next
concrete step, not more government-site research.

| tribunal | own-site bulk/API | IndianKanoon doctype confirmed (market intel only — NOT the acquisition path) | verdict |
| --- | --- | --- | --- |
| NCLT / NCLAT | No — case-by-case only, fetched directly | Yes — live `doctypes:nclt` result URLs, multiple benches (Chennai, Ahmedabad) | **Acquire via Supreme Today once an account exists** (`HARVEST_ENGINE.md` priority 2). IndianKanoon declined — see correction above |
| CESTAT | No bulk found; separate e-filing portal exists | Yes — live `doctypes:cestat` result URLs (Kolkata, Gujarat, Delhi benches) | Acquire via Supreme Today |
| ITAT | No — case-by-case only, fetched directly | Yes — a live `doctypes:itat_delhi` result URL (bench-suffixed doctype pattern) | Acquire via Supreme Today |
| CAT | Not fetched | Yes — a live `doctypes:cat_delhi` result URL (same bench-suffixed pattern) | Acquire via Supreme Today |
| NCDRC (+ state/district consumer commissions) | Not fetched this session | Yes — live `doctypes: judgments` result listings for NCDRC specifically | Acquire via Supreme Today |
| SAT, DRT, DRAT | IndianKanoon market intel (SAT, DRT) | Yes — live doctype URLs | Already in `HARVEST_ENGINE.md`'s stated priority-2 list, plus independently confirmed on Supreme Today's own site (below) |
| NGT, TDSAT, CAT | IndianKanoon market intel confirmed real (bench-suffixed doctypes for TDSAT/CAT) | Yes | **Confirmed COVERED by Supreme Today directly, 13 Aug** — see below. Not in `HARVEST_ENGINE.md`'s original stated list but the vendor's own site lists them |
| AFT | IndianKanoon market intel confirmed real (bench-suffixed doctypes, e.g. `armed forces tribunal doctypes:chennai`) | Yes | **Absent from Supreme Today's tribunal-news filter, 13 Aug** — real uncertainty, not confirmed either way (see below) |
| CCI | Not independently confirmed on IndianKanoon this session | Unconfirmed | **Absent from Supreme Today's tribunal-news filter, 13 Aug** — same uncertainty as AFT |
| GSTAT | N/A — **too new to matter yet** | N/A | GSTAT only began adjudicating 16 Feb 2026. Almost no case law exists anywhere yet — a "revisit in 12-18 months" item. **Notably, Supreme Today's own filter already lists "GST Appellate"** — the vendor is tracking it despite the near-zero volume, worth knowing for whenever this does matter |

**Supreme Today AI's own tribunal-coverage filter, fetched directly 13 Aug
2026 (`supremetoday.ai/tribunal-court-news`) — the best evidence in this
registry for what the actual acquisition target covers, since it is the
vendor's own claimed scope, not third-party market intel.** 22 distinct
categories listed: Income Tax Appellate Tribunal, National Company Law
Tribunal, National Company Law Appellate Tribunal, Customs Excise &
Service Tax Appellate Tribunal, Central Administrative Tribunal, Central
Electricity Regulatory Commission, National Green Tribunal, National/
State Consumer Disputes Redressal Commissions, Real Estate Regulatory
Authority, Securities and Exchange Board of India, Debt Recovery
Tribunal, Debt Recovery Appellate Tribunal, Appellate Tribunal for
Electricity, GST Appellate, Railway Claims Tribunal, Telecom Disputes
Settlement and Appellate Tribunal, Central Information Commission.

**This confirms coverage broader than `HARVEST_ENGINE.md`'s original
priority-2 list**, and surfaces two genuinely new, high-value categories
that list never named: **RERA** (a huge practice area on its own) and
**Central Information Commission** (RTI appeals). **CCI and AFT — RESOLVED 13 Aug 2026, both confirmed covered.** Absent from
the one tribunal-news filter page checked earlier, but a direct search
found both genuinely indexed elsewhere on the same site: multiple real CCI
judgment/news pages (Cadila Healthcare v. CCI, CCI v. Steel Authority of
India, the Flipkart-CCI dominance dispute) and AFT-specific content using
a systematic document-ID prefix (`INDAFT00000000048`) — clear evidence of
structured coverage, not an incidental mention. **Both tribunals are in
scope for the Supreme Today acquisition plan after all** — the earlier
"absent from this page" finding was a false negative from checking only
one filter view, not the vendor's actual coverage. Lesson: a single page
of a product is not its full coverage claim, confirmed by this correction
rather than left as a standing caveat.

**Bonus find while checking AFT: the tribunal's own official site,
`aft.gov.in/reportable-judgements` and `aft.gov.in/judgements`, is real**
— not fetched or characterised this session (structure, bulk access
unknown), but recorded as a free, primary, government-direct alternative
worth a future look if the Supreme Today path is ever insufficient for
AFT specifically.

**Pattern found, useful market intelligence even though it's not this
lane's acquisition path:** IndianKanoon's tribunal doctypes appear to be
**bench-suffixed** (`itat_delhi`, `cat_delhi`, `cestat` + a bench qualifier)
rather than one flat doctype per tribunal — worth knowing if the Supreme
Today harvest ever needs a cross-check on completeness.

**This IndianKanoon recommendation is superseded — do not act on it.** See
the correction at the top of this section. IndianKanoon is `NOT_AUTHORIZED
— DECLINED`, not pending. The tribunal doctype evidence gathered below
(which tribunals IndianKanoon indexes, and the bench-suffixed doctype
pattern) is still useful as general market intelligence, but the acquisition
action is: use Supreme Today once an account exists, not IndianKanoon.

---

### 2b · TRIBUNALS PUBLISH THEIR OWN ORDERS — 14 Aug 2026, two verified end-to-end, free, no CAPTCHA, no account

**This changes the tribunal acquisition picture, which until today was
entirely "wait for the paid Supreme Today account."** All 14 tribunal
domains were probed directly and two were proven open **end-to-end — a real
judgment PDF downloaded and its text extracted**, not merely a page that
looked promising.

The premise nobody had tested: a tribunal is its own publisher. Supreme
Today is an aggregator of tribunal decisions; **the tribunals themselves put
their orders on their own official websites.** That is a first-party source
for a category where LawMind holds **zero** documents.

#### The map, measured

| tribunal | host | state | evidence |
| --- | --- | --- | --- |
| **NCLAT** | `nclat.gov.in` | **VERIFIED OPEN** | order PDF downloaded, 56,049 bytes, text extracted |
| **TDSAT** | `tdsat.gov.in` | **VERIFIED OPEN** | judgment PDF downloaded, 304,798 bytes, text extracted |
| CIC | `cic.gov.in` → `dsscic.nic.in` | **CAPTCHA-GATED — closed to us, resolved 15 Aug** | `cic.gov.in/decision` is a gateway, not a listing — it links out to `dsscic.nic.in/cause-list-report-web/view-decision/1`, and THAT page (fetched directly) is the real search form: Type/Officer/Applicant/Public Authority/Decision-Type/date-range filters plus an explicit CAPTCHA ("Please type below text in textbox", refreshable image). Same closed category as NCLT/CESTAT/ITAT/NGT — the earlier "no CAPTCHA token" read was the gateway page, not the actual search |
| NCLT | `nclt.gov.in` | **CAPTCHA-GATED** | `/order-date-wise`, 15 CAPTCHA references |
| CESTAT | `cestat.gov.in` | **CAPTCHA-GATED** | `/final-order-status-all`, 6 CAPTCHA references |
| ITAT | `itat.gov.in` | **CAPTCHA-GATED** | `/judicial/tribunalorders` |
| NGT | `greentribunal.gov.in` | **CAPTCHA-GATED** | `/judgementOrder/zonalbenchwise` |
| CAT | `cgat.gov.in` | **NO CAPTCHA CONFIRMED, still not end-to-end — 16 Aug** | `agent-browser` now installed and working (used successfully on CCI same session). Homepage renders fully. The judgments link resolves to a direct URL: `https://cis.cgat.gov.in/catlive/case_status_advance.php` — a real "Case Status Report" form, bench selector (41 benches/circuit benches: Agartala, Ahmedabad, ... Srinagar, Telangana), Case No./Year/Party Name/Member Name/Case Type fields, **`innerHTML` checked directly for the string "captcha": absent.** Accessibility snapshot (`snapshot -i`) returns `(no interactive elements)` despite 50KB+ of real DOM — this framework's form fields aren't exposed with standard ARIA roles, so interaction needs `eval`-driven `<select>`/`querySelector` calls, not ref-based clicks; bench selection via `eval` succeeded. **Not yet verified end-to-end** (no order/case result pulled) — stopped short of a full case query this pass, open for the next session to complete via the same eval-based approach |
| CCI | `cci.gov.in` | **CONFIRMED OPEN, no CAPTCHA — real data rows returned, 16 Aug** | `agent-browser` (now installed) resolved what three tool failures blocked on 15 Aug. `snapshot -i` immediately after `open` returned the full form: Case Type / Order Date / Parties / Sectionwise / Free Text tabs, year filter 2010–2030. **Selecting the Order Date tab, filling From/To dates and clicking Search returned real rows**, e.g. Case No. `10/2026`, *"Mrs. Rashi Anand Suri vs. Maharashtra Public Works Department and Techfab India Infrastructure LLP"*, `Anti-trust Section 19 (1) (a)`, dated 10/08/2026, with a downloadable `Order (171.29KB)` link — repeated across multiple rows with distinct case names, sections and file sizes, not a placeholder. **No CAPTCHA anywhere in the flow.** The order link is `javascript:void(0)` (a JS-triggered download, not a plain href), and three separate `agent-browser download` attempts on it failed with `os error 10060` (connection timeout) — the same DNS/network flakiness this machine has hit repeatedly on other `.gov.in` targets this session, not a site-side block. Stopped per the three-strikes rule on the download step specifically; **the search/listing mechanism itself is now proven, only the final PDF fetch remains open** |
| NCDRC | `ncdrc.nic.in` | **CLOSED as a text source, 15 Aug** | fetched the homepage directly: no judgment/order link anywhere in navigation. Case-status tools only — "NCDRC IVRS" and an SMS case-enquiry pointing at `confonet.nic.in`, plus "Online Filing" pointing at `e-jagriti.gov.in`. Neither is a judgment-text repository; e-jagriti is a filing/case-management portal by its own framing, not explored further this pass since nothing in its description suggests public bulk judgment text. `ncdrc.nic.in` itself is not the row worth re-checking again |
| SAT | `sat.gov.in` | HTTP 503, reconfirmed with a real browser 16 Aug | same 503 via `agent-browser` as the original plain fetch — rules out "our fetch tool" as the cause; genuinely server-side, retry another day |
| AFT | `aftdelhi.nic.in` | connection timeout, reconfirmed with a real browser 16 Aug | `net::ERR_CONNECTION_TIMED_OUT` via `agent-browser`, not a DNS or tooling artifact — the earlier "unreachable (000)" was real |
| DRAT | `drat.gov.in` | DNS failure, reconfirmed with a real browser 16 Aug | `net::ERR_NAME_NOT_RESOLVED` via `agent-browser` — domain does not resolve at all, not a tooling gap |
| IPAB | `ipab.gov.in` | unreachable (000) | IPAB was abolished in 2021; low expectation |
| — | `archive.nclt.gov.in` | unreachable (000) | linked from `nclt.gov.in` as "Judgments Archives" |

**CAPTCHA-gated means NOT harvestable, full stop.** The registrar's grant
permitting CAPTCHA bypass is **eCourts-specific**, lives only in
`services/api/src/court/ecourts.ts`, and covers bulk cause-list harvesting.
It does **not** extend to tribunal websites, and the mission brief for this
lane forbids bypassing CAPTCHA outright. NCLT, CESTAT, ITAT and NGT are
therefore closed to us by that route regardless of licensing.

#### NCLAT — the exact mechanism, verified

Not a plain GET. A three-step handshake the site performs on itself:

1. `GET https://nclat.gov.in/judgement-data` — lists recent matters, each
   linking to `/display-board/view_order_pdf?fid=<filing_no>&&l=<bench>&&d=<date>&&order_type=J`.
   **The doubled `&&` is the site's own convention** and matters; a single
   `&` and a truncated query returned HTTP 500.
2. That URL returns a **1,076-byte HTML shell**, not a PDF — a self-
   submitting POST form carrying a Laravel `_token` CSRF value plus
   `bench_name`, `filing_no`, `order_date`, `order_type`.
3. `POST https://nclat.gov.in/display-board/view_order` with those fields and
   the session cookie returns `application/pdf`.

**No CAPTCHA, no authentication, no bypass of any access control** — this is
following the form the page submits automatically in a browser.

Verified sample: `fid=9910110086262026`, Delhi bench, 2026-08-14 — *Rahul Dev
Indoria and Ors. v. Pramod Kumar Sharma*, an interlocutory application
condoning a one-day refiling delay. **Note the document class: that is a
procedural order, not a reasoned judgment** — the same bail-order-versus-
reasoned-decision distinction `hc_document_class` already tracks, and it will
apply to tribunal material too. Do not assume the daily board is substantive.

#### TDSAT — a date-range search, the most harvest-friendly shape found

`POST https://tdsat.gov.in/Delhi/services/judgment.php` with
`from_date1=DD/MM/YYYY`, `to_date1=DD/MM/YYYY`, `frm3=1`, `submit11=Submit`
returns a table of **Serial No. · Case No. · Member Name · Party Detail ·
Order Date**, each row linking to a PDF.

Two traps, both cost a cycle:
- The form action in the page reads `judgement.php` (extra "e"). **That path
  404s.** The working endpoint is `judgment.php`.
- PDF hrefs are **root-relative** — `/order_files/final/2026/August/<id>.pdf`
  resolves under `https://tdsat.gov.in/`, **not** under the `/Delhi/` path the
  search form lives at. Using the form's directory as the base returns 404.

Verified sample: *Den Networks Limited v. Skyline Cable Network and Anr*,
Broadcasting Petition No. 306 of 2020, dated 13 Aug 2026, before Hon'ble Mr.
Justice Ram Krishna Gautam — **a full reasoned judgment**, 304,798 bytes.

#### Politeness and robots

- `nclat.gov.in/robots.txt` exists and **disallows only** `/core/`,
  `/profiles/`, `/admin/`, `/user/*`, `/search/` and comment paths. The
  judgment paths (`/judgement-data`, `/display-board/*`) are **not
  disallowed**. No `Crawl-delay` is specified.
- `tdsat.gov.in/robots.txt` returns **404** — no restrictions published.

Neither publishes a crawl-delay, which is **not** licence to hammer them.
These are small government servers; NEW2's existing rate limiter and fetch
ledger should govern any harvest.

#### Truth-state, and what is NOT cleared

**`VERIFIED` for existence, reachability, mechanism and document retrieval.**
Volume, historical depth and update cadence are **UNKNOWN** — a date-range
probe of one week proves the endpoint, not the archive's extent.

**NOT AUTHORIZED, and not queued to NEW2 as a cleared target.** Neither
`nclat.gov.in` nor `tdsat.gov.in` is among the three §6a-named sources. The
argument that a tribunal order is a judicial decision carrying no copyright,
the same reasoning `CLAUDE.md` §6 applies to judgments, is **plausible and
is not this lane's to make** — the statutory exemption's exact scope as
regards tribunals is a legal reading. Filed to `FOUNDER_QUEUE.md`.

---

### 2c · RERA STATE AUTHORITIES AND APPELLATE TRIBUNALS — 7 states measured, 18 Aug 2026

Full per-state detail, mechanisms and caveats: **`docs/RERA_STATE_MATRIX.md`**.
Registry-level summary only here, per §11 discipline. All measured read-only by
`curl`; nothing ingested; **every row is `AUTHORIZATION_OPEN` under
`FQ-CCI-PERMISSION`** and none is among the three §6a-named sources.

| source | canonical id | authority level | documents | reasoned | access | text layer | truth-state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Maharashtra RERA + REAT | `RERA_MH` | state regulator + appellate tribunal | 49,167 | **7,376** | SPA `apiUrl` + DMS service, no CAPTCHA | not measured | VERIFIED_AVAILABLE |
| Bihar RERA | `RERA_BR` | state regulator | **4,367** orders + 571 AO | **~2,956 est.** (21 of 31 sampled) | plain ASP.NET, no CAPTCHA | **digital text, 30 of 31** | VERIFIED_AVAILABLE |
| Punjab RERA + REAT | `RERA_PB` | regulator + AO + appellate tribunal | 5,067 | ≤5,067 | **same `erera.co.in` platform as Delhi**, 7 routes, CAPTCHA on filter only | **none — scanned** | VERIFIED_AVAILABLE |
| Chhattisgarh RERA | `RERA_CG` | state regulator | 4,154 | **3,687** | plain ASP.NET, order classes pre-segmented, no CAPTCHA | **legacy font-encoded Hindi — present and unusable** | VERIFIED_AVAILABLE |
| Tamil Nadu RERA | `RERA_TN` | regulator, 2 benches + AO | 2,967 | 2,967 | year-scoped server-rendered URLs, no CAPTCHA | **none — scanned, 6/6** | VERIFIED_AVAILABLE |
| West Bengal RERA | `RERA_WB` | state regulator | 4,884 orders | **1,816 complaints** | plain PHP, off-site document repository, no CAPTCHA | mixed and OCR-corrupted — distrust | VERIFIED_AVAILABLE |
| Rajasthan REAT | `RERA_RJ` | appellate tribunal | 750 judgments + 11,523 orders (site pre-segments them) | **750, with a DISPOSAL OUTCOME field — unique in this matrix** | `reat.rajasthan.gov.in/efile/Website/Judgment`, server-rendered, no CAPTCHA | **digital text, 575–32,836 chars on 4/4** | VERIFIED_AVAILABLE |
| Jharkhand RERA | `RERA_JH` | regulator + AO + chairman | 228 | **218 `Judgement`, site-labelled** | server-rendered, `/FirstLevel/ViewDocument/<id>`, no CAPTCHA | **digital text, 10,222 chars/9pp** | VERIFIED_AVAILABLE |
| Telangana RERA | `RERA_TS` | REAT + suo motu | 90 | 46 REAT + 44 suo-motu orders | server-rendered under obfuscated path names, no CAPTCHA | not measured | VERIFIED_AVAILABLE |
| Goa RERA | `RERA_GA` | state regulator | 173 | 173 adjudicating matters | server-rendered, opaque-token document handler | **none — 7 chars/7pp** | VERIFIED_AVAILABLE |
| Delhi REAT | `RERA_DL` | appellate tribunal (**also covers Chandigarh**) | 481 daily bundles ≈ 2,491 appeal-order units | **~155 est.** | plain HTML, CAPTCHA on filter only | digital text | VERIFIED_BUT_LOW_VALUE |
| Uttar Pradesh RERA | `RERA_UP` | state regulator | **8** | 8 | `POST WebService1.asmx/loadjudgement`, empty body | **none — 55 chars/20pp** | VERIFIED_BUT_LOW_VALUE |
| Haryana (Panchkula) · Assam | `RERA_HR` · `RERA_AS` | — | — | — | **login-gated** | — | VERIFIED_BUT_RESTRICTED |
| Gujarat | `RERA_GJ` | — | — | — | **Angular SPA, blocked after 3 approaches** — bundle yields routes and an API host but no public judgement endpoint | — | UNKNOWN |
| Karnataka RERA | `RERA_KA` | state regulator | **11,707 decided matters** (extracted from the page's own autocomplete data) | reasoned slice — daily/interim/AO/project orders are separate routes | **not an SPA, not slow, not session-gated** — `/viewAllJudgements` is a search form, returns in **7.0 s**; the document POST is unsolved after 3 attempts | unknown | UNKNOWN (population measured, documents not reached) |
| MP · AP · Kerala | — | — | — | — | mechanism identified, listing not yet extracted | — | UNKNOWN |
| **`hprera.in`** | — | **NOT AN AUTHORITY** | — | — | — | — | **REJECTED — a WordPress affiliate blog occupying a plausible domain (`/category/home-loans/`, `/hello-world/`). Must never enter the registry as official.** |

**Six findings that generalise beyond RERA:**

0. **The authority's domain is not the tribunal's domain.** Rajasthan was recorded
   as an unreachable Angular SPA on the strength of `rera.rajasthan.gov.in`. The
   appellate tribunal is at `reat.rajasthan.gov.in` — plain server-rendered HTML,
   750 judgments, disposal outcomes, digital text. **Check for a separate `reat.*`
   or `*appellate*` host before recording any state as blocked**, and read that as
   a general rule for tribunals, not a RERA quirk.


1. **`erera.co.in` is a multi-state platform, not Delhi's site.** Punjab runs the
   identical application under `rera.punjab.gov.in/reraindex/…`. Any suspected
   sibling can be sized before it is fetched by probing three known routes —
   listed in the matrix. This turns per-state discovery into per-state
   confirmation.
2. **Count by DIRECTORY, not by file extension.** Bihar's order count was first
   recorded as 5,081 — every distinct `.pdf` href on the page. 714 of those were
   not orders, and **545 were cause lists**, the exact procedural class this work
   exists to exclude. Caught only because a random sample came back with
   `Cause_List/` in the path. Every state counted by extension should be
   re-checked the same way before its figure is used for pricing.
3. **A reasoned-vs-procedural discriminator belongs to the SOURCE, not the
   category.** Delhi's test (numbered paragraphs + length) undercounts Bihar by a
   factor of three, because the Bihar authority does not number paragraphs.
   Chhattisgarh and Rajasthan need no test — their sites pre-segment. West
   Bengal's is a column in the listing. One classifier applied across the matrix
   produces confidently wrong counts in both directions.
4. **A third extraction failure mode exists and defeats both existing checks.**
   Chhattisgarh's PDFs carry a text layer that extracts to long, clean, pure-ASCII
   output — and it is Hindi in a legacy Kruti Dev-family font. It scores **zero
   defects** on every metric, passes any length check, and is unreadable. Poppler
   deleting Devanagari at least produced a short output; this does not. Detection
   requires a script-plausibility test, which nothing in the pipeline has.
5. **Delhi's 481 documents are 93.8% procedural — measured, and it reverses this
   lane's own 17 Aug reading.** Detail and the discriminator in the matrix.
6. **Six ways a live source reads as empty**, every one silent and every one
   indistinguishable from genuine absence: single-quoted `href` (Chhattisgarh),
   unquoted `href` (Rajasthan), opaque-token document handlers (Goa), numeric-id
   handlers (Jharkhand), a table filled by one AJAX call (Uttar Pradesh), and data
   present only as inline JavaScript object literals (Karnataka, 4 MB and zero
   rows). A row count with no link count is the tell in one direction; megabytes
   with no rows is the tell in the other. And **re-test a timeout before building
   a theory on it** — Karnataka's "20 s+ timeout" answers in 7.0 seconds, and two
   written-down mechanism diagnoses were derived from those timeouts.

---

## 3 · STATE ACTS, RULES, GAZETTES, NOTIFICATIONS — genuinely new, LawMind holds 0

**Partial finding, tractability looks better than expected but the depth is
unconfirmed.**

- **indiacode.nic.in extends to states, structurally, not just centrally.**
  Independent search results this session surfaced real per-state handle
  pages — `indiacode.nic.in/handle/123456789/2485/` (Karnataka),
  `.../2517/` (Maharashtra), and a generic `.../handle/123456789/2180`
  labelled "State Act" — plus the site's own self-description: *"a digital
  repository of all Central, State & Union Territory enactments... linked
  with Subordinate Data like Rules, Regulations, Notifications, Orders,
  Circulars, Ordinances, Statutes."* That is the same DSpace platform
  `docs/DATA_SOURCES.md` §4 already found the central-Acts section runs on,
  with per-section pages. **Direct confirmation of the state pages'
  structure failed this session — indiacode returned HTTP 403 to this
  session's fetches** (both the Maharashtra handle page and a filtered
  browse URL), which reads as bot-blocking rather than the page not
  existing (the same pages resolve fine in search-engine caches). LCC's
  earlier successful indiacode fetches (`DATASETS.md`, dated 4 Aug) suggest
  a different fetch method — likely `agent-browser` per `CLAUDE.md` §3's
  tool table, not a bare HTTP fetch — gets through where this session's
  WebFetch did not. **Truth-state: VERIFIED_AVAILABLE (the pages exist,
  confirmed via search-result presence) but STRUCTURE UNCONFIRMED** — the
  open question is whether state Act pages carry the same per-section
  markup the central-Act parser (`parseActPage`) already reads, or are PDF
  scans, and that needs a real browser-driven fetch to answer.

- **RESOLVED 14 Aug 2026 — the Gazette of India archive.org mirror is
  real, huge, current to this week, and confirmed by direct API calls, not
  a search snippet.** Previously EXPERIMENTAL, "needs one real archive.org
  API call" — that call is now made, several times, against the live
  endpoint (`https://archive.org/advancedsearch.php?q=...`), not inferred.

  **The central (Government of India) gazette specifically — the one that
  matters for BNS/BNSS/BSA commencement notifications, GSR/S.O. central
  Act amendments, and gazette-published rules/regulations:**
  `identifier:in.gazette.central*` returns **171,942 documents**, dated
  **1947-01-01 to 2026-08-11** (three days before this check) — the full
  post-independence span, actively current, not a stale one-time scrape.
  **453 central gazette entries exist for July 2024 alone**, the month
  BNS/BNSS/BSA commenced, including a same-day `2024-07-01` entry.

  **UPDATE 14 Aug 2026 — the specific commencement notifications are now
  identified, not just inferred from date coverage.** Searched the
  collection's own item descriptions by Act name and found the actual
  Ministry of Home Affairs commencement notifications directly, each
  individually addressable:

      date         subject                                                          gazette ID
      2024-02-24   MHA, s.1(2) Bharatiya Nyaya Sanhita commencement power            CG-DL-E-24022024-252353
      2024-02-24   MHA, s.1(3) Bharatiya Nagarik Suraksha Sanhita commencement       CG-DL-E-24022024-252354
      2024-02-24   MHA, s.1(3) Bharatiya Sakshya Adhiniyam commencement              CG-DL-E-24022024-252352

  Plus the three Acts' own original assent/publication entries (25 Dec
  2023, `CG-DL-E-25122023-250883/250884` for BNS/BNSS, BSA's on
  18 Mar 2024 `CG-DL-E-27032024-253386`) and a later MHA delegation-of-
  powers notification (28 Jun 2024, J&K/Ladakh UTs). **This closes the
  question — the primary-source commencement notifications DOMAIN_TRUTH.md's
  July 2024 date rests on are confirmed to exist, dated, and individually
  fetchable**, not merely "the month has entries."

  **Provenance is strong, checked on one item, not assumed:** fetched
  `archive.org/metadata/in.gazette.central.e.2024-07-01.255085` directly —
  `creator: "Government of India"`, sourced from
  `egazette.gov.in/WriteReadData/2024/255085.pdf` (the official portal,
  linked in the item's own description), carrying the gazette's own
  official control ID (`CG-DL-E-02072024-255085`), OCR'd in Hindi+English.
  **Uploaded by `sushant@indiankanoon.com`** — the same person behind
  `github.com/sushant354/egazette` and, by that email domain, connected to
  IndianKanoon — a faithful mirror-with-OCR of the official PDF, not an
  independent or unofficial transcription.

  **The wider `gazetteofindia` collection is bigger still** — 805,433
  documents total across `collection:gazetteofindia`. **Now characterised
  per-state, 14 Aug 2026** — queried `identifier:in.gazette.<state>*`
  directly for 13 states/UTs (naming isn't uniform across states; each
  prefix confirmed by sampling real identifiers first, not guessed):

      state             docs      state             docs
      Kerala            56,730    Punjab             9,411
      Rajasthan         46,055    Madhya Pradesh      9,358
      Andhra Pradesh    22,496    Gujarat             8,453
      Maharashtra       21,917    Telangana           7,092
      Karnataka         20,264    Delhi               5,234
      Tamil Nadu        15,303    Uttar Pradesh       3,772
                                  Bihar                 724
                                  West Bengal           105

  **13 of LawMind's 25 High Court jurisdictions now have a measured state-
  gazette count from one free source, in one research pass** — far faster
  than the one-portal-at-a-time hunt this section's Maharashtra/Tamil Nadu
  rows used.

  **West Bengal and Bihar re-checked, 14 Aug 2026 — CONFIRMED real and
  correctly counted, not a naming-variant miss.** Sampled actual items
  from each: `in.gazette.bihar.2018-06-15.570` ("Bihar Gazette,
  2018-06-15, No. 570"), `in.gazette.westbengal.1908.9882` ("The Kolkata
  Gazette") — genuine, correctly-identified documents, not junk or
  misrouted entries. **Bihar's real shape: a narrow, one-time upload
  window, 2017-11-24 to 2018-06-22 only** — not an ongoing crawl like the
  central collection. **West Bengal spans a wide historical range in
  sample** (1908, 1957, 1969, 1976, 1977 all present) **but many items
  lack an indexed `date` field**, so a reliable date-range query wasn't
  possible this pass — the 105-document count itself is trustworthy, its
  temporal shape is not yet fully characterised. **Both are genuinely
  thin relative to their court size in THIS mirror specifically** — not a
  research gap on this lane's part, an asymmetry in what archive.org's
  crowdsourced crawl happened to collect per state.

  The remaining 12 jurisdictions (and all UTs) are not yet queried. Same
  licence caveat as the central-gazette finding above applies identically
  here — not cleared, filed to `FOUNDER_QUEUE.md` as one combined
  question, not re-filed per state.

  **Not yet checked:** the archive.org item-level licence/rights field —
  no `licenseurl` appeared in the one item's metadata fetched. Gazette
  content itself is widely understood to sit outside ordinary copyright
  (parallel to the judgment case this doc already makes under Copyright
  Act s.52(1)(q) for judicial text — a neighbouring but NOT identical
  provision covers official-gazette reproduction), **but this lane does
  not clear licences, and that reading is not verified here** — flagged
  for the same legal check every new source needs before use, same as the
  DevDataLab caveat in §4a above. Bulk fetch via archive.org's own
  `advancedsearch.php` + `/metadata/<identifier>` + `/download/<identifier>/<file>`
  pattern is straightforward and already exercised live in this check.

  Truth-state: **VERIFIED_AVAILABLE** (existence, scale, currency, and
  provenance all confirmed by direct fetch). **REQUIRES_FOUNDER_DECISION**
  only on the licence question before any bulk pull, not on whether the
  source exists.

- **State-level gazette/law-department portals — three states checked this
  session, one fetched directly.** Each state runs its own separate site;
  there is no central index beyond indiacode's own state-Act mirror (§3
  above), which this confirms is genuinely a *different* thing from each
  state's own primary publication.

  | state | portal | verified how | finding |
  | --- | --- | --- | --- |
  | **Maharashtra** | `lj.maharashtra.gov.in/en/document-category/act-list/` | **Fetched directly** | Real, structured, ~180+ Acts, per-Act PDF (226 KB–1 MB), **paginated 16 pages**, coverage **1952–2026**, page itself maintained (last updated 12 Mar 2026). **VERIFIED_AVAILABLE.** Per-Act PDF, not per-section like indiacode's central Acts — a parser would need to extract sections from the PDF text itself |
  | **Uttar Pradesh** | `upvidhansabhaproceedings.gov.in/gazette-search` | **Fetched directly, 13 Aug** | Real, official Legislative Assembly search tool — rich filters (Type, Part, Category, Subject, Department, Ministry, notification number, publication/notification date, browse-by-decade). No bulk download visible on the search page itself. **VERIFIED_AVAILABLE**, structure is search-and-view rather than a listing/PDF-per-item like Maharashtra |
  | **Tamil Nadu** | `stationeryprinting.tn.gov.in/gazette.php` | **Fetched directly, 13 Aug** (note: `www.` subdomain fails TLS cert validation — bare domain works) | Real, official, **current through 12 Aug 2026** — 32 issues listed for 2026 alone, plus a separate Extraordinary Gazette section and an archive for earlier years. Content includes Acts/ordinances with Tamil supplements, service rules, statutory notifications. **VERIFIED_AVAILABLE**, per-issue drill-down rather than direct PDF links on the index page |

  | **Karnataka** | `dpal.karnataka.gov.in` (Dept. of Parliamentary Affairs and Legislation) — the old `dpal.kar.nic.in` is deprecated, redirects/references the new domain | **Fetched directly, 14 Aug** | Real, structured, bilingual (Kannada/English), **current through 2024-2025**. More comprehensively organised than any state checked so far: separate sections for Acts and Ordinances, Acts+Rules alphabetically, Acts+Rules department-wise, Central Acts, State Rules made under Central Acts, and Repealed Acts. **VERIFIED_AVAILABLE.** `gazette.kar.nic.in` (separate e-gazette site, searchable from 2020) not re-checked this pass — dpal is the Acts/Rules source, gazette is the notifications source, same two-site pattern most states show |
  | Delhi | `law.delhi.gov.in/notifications` + `delhiarchives.delhi.gov.in/gazette-notifications` | Found by search, not fetched | Same two-site pattern |

  **Pattern worth recording for whoever scopes this next:** every state
  appears to need its own portal mapped individually — there is no
  multi-state aggregator found this session other than indiacode's own
  (unconfirmed-structure) state pages. 28 states + 8 union territories is a
  real-sized discovery task on its own, not a quick add-on. **5 of 28+8
  now identified, 4 of them fetched directly and confirmed** (Maharashtra,
  UP, Tamil Nadu, Karnataka; Delhi found by search only) — roughly a sixth
  of the way through a full state-by-state map, at the current rate.

- **PRS Legislative Research (`prsindia.org`) hosts primary gazette PDFs
  directly, not just editorial commentary** — found this session at
  `prsindia.org/files/bills_acts/bills_states/<state>/<year>/...`, serving
  the actual Tamil Nadu Gazette Extraordinary PDF for a real 2023 bill.
  **This matters: a PRS-hosted gazette PDF is the primary text (a mirror),
  not PRS's commentary about it** — usable under the same primary-source
  rule as if fetched from the state's own site, provided the specific file
  is confirmed to be the verbatim gazette notification and not an edited
  summary. Not yet checked whether PRS exposes this systematically (a
  per-state index, a bulk list) or only surfaces individual files when
  linked from their own bill-tracking pages — the latter would make it a
  convenience mirror for files already found elsewhere, not a source in
  its own right.

| source | what it covers | confirmed how | verdict |
| --- | --- | --- | --- |
| indiacode.nic.in state repository | State Acts, per-state handles | Search-result presence of real handle URLs; direct fetch 403'd | VERIFIED_AVAILABLE, structure unconfirmed — refetch via agent-browser |
| egazette.gov.in | Gazette of India, official | Search only, not fetched | VERIFIED_AVAILABLE (site exists), no bulk API found |
| archive.org/details/gazetteofindia | Gazette of India, third-party mirror, daily-crawled, OCR'd | **RESOLVED 14 Aug 2026** — confirmed via direct `advancedsearch.php`/`metadata/<id>` API calls, not the JS-rendered landing page. 171,942 central-gazette docs, 1947–2026-08-11. Full detail: §3 above | **VERIFIED_AVAILABLE** — licence not yet cleared, `FOUNDER_QUEUE.md` |
| github.com/sushant354/egazette | Open-source gazette downloader | **SUPERSEDED 14 Aug 2026 — no longer needs running.** This tool is what PRODUCES the archive.org `gazetteofindia` mirror above; now that the mirror itself is confirmed VERIFIED_AVAILABLE via direct `advancedsearch.php`/`metadata`/`download` API calls, running the scraper tool separately would only reproduce data already accessible more simply. Kept as a record of provenance (it explains WHY the mirror exists and is trustworthy), not as an open action item | Not needed as a separate acquisition path — the archive.org row above is the actionable one |
| State gazette/law-dept portals (individual states) | State rules/notifications | Maharashtra, UP, Tamil Nadu, Karnataka fetched directly — see the state table above. **Correction, 14 Aug 2026: an earlier entry here wrongly called Tamil Nadu "still UNKNOWN"** after checking only `indiacode.nic.in`'s TN handle (403, unrelated) and a generic `tn.gov.in` search — without first checking this same document's own §3 table, which already had TN VERIFIED_AVAILABLE via `stationeryprinting.tn.gov.in/gazette.php`, fetched directly 13 Aug. That was this lane's own mistake, not a source gap — struck here. 24+ states/UTs still untouched | Maharashtra, Tamil Nadu: VERIFIED_AVAILABLE. **Karnataka now VERIFIED_AVAILABLE too, 14 Aug** — `dpal.karnataka.gov.in`, fetched directly, real and current (2024-2025 activity), structured into State Acts/Ordinances, alphabetical Acts+Rules, department-wise, Central Acts, State Rules under Central Acts, and Repealed Acts — more comprehensively organised than Maharashtra's flat per-Act list. indiacode.nic.in's own state mirror separately remains 403'd, unrelated to any of these direct-portal findings. Rest: UNKNOWN |
| PRS Legislative Research primary-PDF mirror | Gazette notifications, hosted as files under bill-tracking pages | **RESOLVED 14 Aug 2026** — fetched the site's own Bills/Acts tracker directly: no dedicated gazette search or filter exists; confirmed by a second, independent site-restricted search turning up only individually-linked PDFs under `bills_acts/bills_states/<state>/<year>/`, never a browsable list. **Not a systematic index — confirmed convenience-mirror-only, not a gap in this session's checking.** One incidental finding worth keeping: PRS's OWN content is CC-BY-4.0 licensed (their editorial site licence, not a statement about the government PDFs they mirror, which carry their own separate provenance) | EXPERIMENTAL — works as a convenience mirror when linked to from elsewhere, not a source to query directly |
| PRS Legislative Research | Legislative tracking, editorial | Not researched; would be **secondary/commentary if used raw** — flag per LawMind's primary-sources-only rule | UNKNOWN, likely NOT_USEFUL as a primary source |

---

## 4 · DISTRICT / SUBORDINATE JUDICIARY — LawMind holds 0

**Session finding: the honest shape of this gap is now clearer, and it is
structurally NOT the same shape as the High Court gap.**

- **NJDG (`njdg.ecourts.gov.in`) is confirmed, by its own stated policy, to
  publish district/taluka pendency data as OPEN DATA** — search results
  quote the portal directly: *"pendency data at the national, state and
  district levels are open and in the public domain,"* updated daily. This
  is **case-count and status statistics, not full case text.** It is the
  right source for a coverage/gap-map denominator at district level (exactly
  the shape `corpus_coverage`/`judgment_coverage` already use for
  courts — `docs/CURRENT_PLAN.md` Q1.1), **not a document-acquisition
  source.** Verdict: **VERIFIED_AVAILABLE for coverage statistics,
  VERIFIED_BUT_LOW_VALUE for full-text acquisition.**
  **Checked 14 Aug 2026 — NJDG's richer "Open API" is not actually open to
  LawMind.** It's real (aligned to the National Data Sharing and
  Accessibility Policy) but explicitly scoped to **Central & State
  Government departments with issued departmental IDs/access keys**,
  described as serving "institutional litigants" with only a stated future
  plan to extend to "non-institutional litigants" — no timeline given, not
  a program LawMind can join today. **Confirms rather than changes the
  verdict above**: the public pendency-stats dashboard is genuinely the
  ceiling for a private commercial user, not an oversight in how this
  source was scoped.
- **judgments.ecourts.gov.in** (already a known LawMind source, free full-
  text SC+HC search per `docs/DATA_SOURCES.md` §3) was **not re-checked this
  session for District Court scope** — genuinely open, cheap to check next.
- **A District Court AWS Open Data bucket, parallel to
  `indian-high-court-judgments`:** **Searched directly this session, not
  found.** A targeted search for the AWS Open Data registry and for the same
  author's (`vanga`) GitHub account — the one behind LawMind's existing SC
  and HC datasets — returned only the two datasets already in LawMind's
  corpus; no District Court equivalent by that author or in the AWS
  registry surfaced. **One fetch-summary during this search claimed a
  companion `indian-district-court-judgments` repository existed; a direct
  follow-up search for that exact name found nothing, and the claim is
  treated as a hallucination and discarded — see §5c.** This is genuine
  negative evidence, not exhaustive proof of absence: a differently-named or
  less-discoverable bulk source could still exist. **Verdict: no confirmed
  bulk District Court text source. If it exists, LawMind hasn't found it
  yet — treat this as UNKNOWN leaning DEAD, not VERIFIED_AVAILABLE, until
  someone finds it by a different route (e.g. asking on the datameet mailing
  list this session found references to, which is where the HC dataset's
  own origin was discussed).**

| source | what's exposed | district-court text? | verdict |
| --- | --- | --- | --- |
| NJDG | pendency/case-count stats, all district & taluka courts | No — stats only | VERIFIED_AVAILABLE (stats), not a text source |
| judgments.ecourts.gov.in | free full-text search | **RESOLVED 14 Aug — YES, confirmed.** Fetched the site directly: District Courts appear as a separate, distinct navigation link alongside Supreme Court and High Court SCR search, not merely implied by NJDG-style stats | **VERIFIED_AVAILABLE for existence, but same shape as SC/HC search — CAPTCHA-gated, single-record keyword/phrase search only (proximity search 20–100 chars), no bulk download or API visible on the page.** Does not unlock new bulk capacity beyond the Tier-3 pattern already authorized (`CLAUDE.md` §6) — closes the open research question without changing acquisition strategy |
| services.ecourts.gov.in (case status/cause lists) | per-case, CAPTCHA-gated | Individual orders, not bulk | Already the basis of LawMind's authorized Tier-3/bulk cause-list harvest, `CLAUDE.md` §6 — not a new finding |
| District Court AWS Open Data bucket (parallel to the HC one) | Re-searched 14 Aug 2026, fetched the registry's own `tag/legal-data` listing directly — only the two datasets LawMind already holds (SC, HC) appear India-tagged there | No such bucket found | **CLOSED, negative — no bulk District Court text source on AWS Open Data.** Not proof none exists anywhere, but this specific highest-priority question is answered: not there. |

**Separate finding, 14 Aug 2026 — HIGH COURT cause lists (not district) bypass
the CAPTCHA entirely on at least one court's own site, unlike the row above.**
`services.ecourts.gov.in`'s CAPTCHA-gated cause-list path is real and is
correctly what LawMind's Tier-3 harvest already uses — but that is not the
only route. **Delhi High Court publishes its own daily cause list directly**
(`delhihighcourt.nic.in/web/cause-lists/cause-list`), fetched directly and
confirmed: per-date PDF listings (main + supplementary + deletion notes +
pronouncement lists), no CAPTCHA, no login, 102 pages of paginated archive
visible. **Bombay High Court's own site has the equivalent structure**
(`bombayhighcourt.nic.in/webcauselistbom.php` + a Goa-bench-specific
`hcbombayatgoa.nic.in/causelist/month-format.html`) — found by search,
**not independently fetched this pass (connection refused on this
environment's network, not a CAPTCHA or access-control signal — plausibly
transient, since Delhi's own `.nic.in` domain worked fine moments earlier)**.
**Worth checking systematically across all 25 High Courts** — if this
pattern generalises, it's a materially cheaper/faster path to current
cause-list data than the CAPTCHA-gated bulk harvest for whichever courts
publish this way, directly relevant to the hearing-briefing feature
(`PRODUCT_BRIEF.md` Tier A #2). Not queued as an acquisition item — this is
a discovery finding for LCC/NEW2 to evaluate, this lane doesn't touch
ingest code.

**Systematic check, 14 Aug 2026 — 12 of 25 High Courts show search-level
evidence of their own dedicated cause-list infrastructure; the picture is
more varied than "just like Delhi" once actually fetched.**

Search-confirmed as having their own dedicated cause-list page(s), separate
from `services.ecourts.gov.in`, at each court's own domain — **not yet
independently fetched, UNVERIFIED beyond the search result itself** (per
this file's own discipline: a search snippet is not a confirmed fetch):
Allahabad, Madras, Punjab & Haryana, Patna, Rajasthan, Kerala, Karnataka,
Calcutta, Telangana, Andhra Pradesh, Gauhati. Several show literal PDF
filenames in search results (Calcutta: `cl10022025.pdf`; Rajasthan: pages
explicitly labelled "Direct Download"), which is suggestive but not proof
of a CAPTCHA-free path — none of these 11 were confirmed by direct fetch.

**Two direct-fetch attempts this pass, with a genuinely different result
from Delhi's — recorded because it complicates the "generalises easily"
framing, not because it's bad news:**
- **Calcutta High Court** (`calcuttahighcourt.gov.in/Cause-Lists`) — fetch
  failed on a TLS certificate error, inconclusive either way.
- **Gauhati High Court** (`ghconline.gov.in/index.php/cause-list-hc/`) —
  fetched successfully, and **the page itself is not an independent
  listing** — it embeds an iframe pointing at `clists.nic.in`, a shared
  National Informatics Centre cause-list backend, not content hosted
  directly by the court. Whether `clists.nic.in` itself is CAPTCHA-gated
  was not checked this pass. **This means "the court's own domain hosts
  it" does not automatically mean "no gate" — Delhi's finding does not
  generalise on inspection alone, it needs a fetch per court.**

**Revised verdict:** the *category* is real and worth NEW2's evaluation —
Delhi is a confirmed, clean example, and 11 more courts have plausible
supporting evidence — but **"12 of 25 courts have a CAPTCHA-free cause
list" is NOT yet an established claim**, only "12 of 25 have SOME kind of
own-domain cause-list page, shape unconfirmed for 11 of them, and at
least one confirmed example (Gauhati) turned out to route through a
shared backend rather than being independently free." Whoever picks this
up next should fetch each candidate individually before assuming Delhi's
shape is typical.

**Follow-up, 14 Aug 2026 — the CAPTCHA question is still open, and NOT
because these courts are gated; a tooling limitation on this lane's side
should not be misread as a source finding.** Tried to confirm whether
`clists.nic.in` (the Gauhati iframe target) or its per-court instances
are CAPTCHA-gated. **Four consecutive network-layer failures, zero CAPTCHA
sightings either way**: `clists.nic.in` itself — DNS-unreachable from
this lane's fetch tool; Chhattisgarh's own instance
(`highcourt.cg.gov.in/clists/`) — TLS certificate validation failure;
Calcutta — same TLS failure; Bombay — connection refused (noted earlier
in this section). **Delhi, by contrast, fetched cleanly** — same general
TLD class (`.nic.in`), no issue. This pattern (self-signed/expired certs
and DNS quirks are common on Indian government sites) looks like this
lane's `WebFetch` tool struggling with a specific TLD class, not evidence
that ten-plus courts are CAPTCHA-gated. **Stopped after four failures per
the three-cycles rule** — the next attempt on this question should use a
real browser or `agent-browser`-class tool rather than repeat the same
fetch method expecting a different result. Also found, search-only: the
NIC "clist" pattern appears to be a **reusable software template deployed
per-court on each court's own domain** (Chhattisgarh, Madras both run
their own `/clists/` instance) rather than one central shared server for
every court — Gauhati's iframe-to-`clists.nic.in` may be the exception,
not the rule, though this is inferred from naming/URL patterns, not
independently confirmed.

### 4a · Found instead, 14 Aug 2026 — a real but DIFFERENT-IN-KIND source: 81.2M district-court case RECORDS, not judgment text

**DevDataLab** (`devdatalab.org/judicial-data`), an academic research lab —
**not** an official government or AWS Open Data source. Fetched directly,
not from a search snippet.

- **What it is:** 81.2M district/sessions-court case records, India-wide,
  **2010–2018 only** — filing/hearing/decision dates, party names, judge,
  acts/sections filed, disposition, a gender classification field (~97%
  accuracy per the source). **This is case METADATA, not judgment or order
  TEXT** — a fundamentally different thing from what this row was searching
  for and from what `judgments`/AWS HC-bucket hold. Built for a published
  judicial-bias research paper, not as a legal-tech data product.
- **Access:** direct Dropbox download, no registration for the base fields;
  extended fields (religion classification, others) gated behind an email
  request to the lab, per the site.
- **Licence — flagged, not cleared, terms now precise rather than vague.**
  **ODbL 1.0** (Open Database Licence), not CC-BY-4.0. Checked the licence
  text directly (`opendatacommons.org/licenses/odbl/1-0/`), not assumed
  from the name: **commercial use is explicitly permitted** (§3.1, "do not
  exclude any field of endeavour") — the earlier flag here read more
  alarming than the licence actually is. The share-alike obligation (§4.4)
  attaches specifically to **Publicly Using** a derivative database (or a
  Substantial extraction of one) — **internal organisational use is
  explicitly exempt from share-alike** (§4.5c). Attribution is required
  whenever the database or its content is publicly conveyed. **This is
  still not a clearance** — this lane does not make the legal call on
  whether LawMind's specific use (internal enrichment behind the product,
  not republishing DevDataLab's database) qualifies as "internal" under
  §4.5c, and that reading needs someone with actual authority to make it —
  but the facts on the table are now precise enough to make that call
  quickly rather than starting from "share-alike, unclear." Not queued to
  `FOUNDER_QUEUE.md` yet since nothing currently depends on this source —
  flagged here so the precise terms travel with the finding.
- **Relevance, if cleared:** would not fill the "district court judgment
  text" gap this row exists to close, but could plausibly serve a
  DIFFERENT need — case-existence/date/disposition lookups, judge-level
  analytics, or hearing-context enrichment — none of which this lane is
  scoping further without a specific downstream ask.

### 4b · NyayaAnumana, 14 Aug 2026 — audited and CLOSED as NO_ADDITIVE_VALUE, tempting scope, disqualifying provenance

**Per the mission's own public-dataset-audit rule: a large dataset with
uncertain provenance is not automatically valuable — checked rather than
assumed.** Previously flagged elsewhere in this repo as "audit pending a
concrete need"; audited now.

- **What it is:** an ACL/COLING 2025 academic paper (Nigam et al.,
  `arxiv.org/abs/2412.08385`) and its companion dataset — **2,282,137 raw
  case proceedings, preprocessed down to 702,945**, spanning **Supreme
  Court, High Courts, Tribunal Courts, District Courts, and Daily
  Orders**. That scope is exactly LawMind's biggest gaps at once (tribunals
  §2, district courts §4 — both currently 0 held) — genuinely tempting on
  first read.
- **The disqualifying fact, confirmed from the paper's own abstract, not
  inferred:** the raw cases were compiled **"from the IndianKanoon
  website."** Not AWS Open Data, not eCourts, not an independent scrape —
  IndianKanoon specifically. IndianKanoon is the one source this project
  has an explicit, standing founder decision against
  (`FOUNDER_QUEUE.md`: *"We are NOT buying the Indian Kanoon API"*) and
  every other row in this registry sourced from IndianKanoon is marked
  `NOT_AUTHORIZED`. A downstream academic re-release does not change where
  the underlying data came from — using it would be adopting IndianKanoon-
  sourced content through a side door, the same shape `CLAUDE.md` §6
  forbids directly (*"never buy data from someone who did"* circumvent an
  access control this project hasn't been authorised to).
- **Licence, checked but moot given the above:** at least one artefact in
  the dataset's Hugging Face collection (`L-NLProc/NyayaAnumana-
  Transformers-Results`) is tagged Apache-2.0 — but a permissive licence
  on a derivative doesn't cure the underlying provenance problem; it
  licenses the researchers' own re-packaging, not a right to the
  IndianKanoon content inside it.
- **Verdict: `NO_ADDITIVE_VALUE`, not because the content is duplicative,
  but because the source is the one this project has already ruled out.**
  Recorded as a genuine negative finding, not a gap in research — the
  mission brief asks for exactly this judgment call, not a document count.
  **What the scope DOES usefully signal:** if IndianKanoon holds this much
  tribunal/district material, a legitimately-sourced equivalent (eCourts
  direct, or a properly-licensed IndianKanoon relationship if that
  decision is ever revisited) would close a real gap — that remains an
  open opportunity, just not through this dataset.

---

## 5 · CITATOR / TREATMENT SOURCES BEYOND INDIANKANOON

**Resumed directly after the session-limit cleared. One major finding —
possibly the most valuable in this whole registry — and one caught
hallucination, both recorded honestly below.**

### 5a-pre · SUPERSEDING FINDING, 13 Aug 2026 — the concordance may not need an external source at all

**Before reading the ECT section below (kept for provenance, not yet
disproven, but now second priority): LCC found, from inside the corpus
while resolving a single citation this lane had flagged, that 656
judgments already print paired citations in `S.C.R. cite : SCC cite`
form** — the exact mapping the ECT and every external candidate in this
section exist to provide. No fetch, no purchase, no licensing question —
a string pair in text already held. Full account: `docs/ai/
OVERRULED_GROUP_MARKERS.md` §4, this lane's own follow-through in
`TREATMENT_GRAPH_GAP.md` §3c.

**This does not make the ECT worthless** — 656 judgments is a fraction of
the corpus, and the ECT (if ever fetched) covers the Supreme Court's full
1950–present population regardless of whether a citing High Court judgment
happened to print both forms together. But it changes the priority: the
internal, free, zero-tooling-risk source should be tried first, and the
ECT (blocked on `agent-browser`, still unavailable to any session) drops
to a fallback for whatever the internal harvest doesn't reach. **Building
the harvester is LCC's call and LCC's territory** (enrichment/extraction,
not corpus discovery) — recorded here as it directly changes this lane's
own acquisition-priority ordering, not as a task this lane will build.

### 5a · THE ECT — an official, free Supreme Court citation concordance, likely unresearched by LawMind until now

**`main.sci.gov.in/pdf/ECT/1Equivalent Citation Table.pdf`** — the Supreme
Court of India's own **Equivalent Citation Table**, giving equivalent
citations across **S.C.R., SCC, AIR (SC), JT and SCALE** for the same
judgments. This is corroborated **independently, not from one source**:

- A University of Wisconsin-Madison law-library research guide describes it
  in the same terms.
- **`tilakmarg.com`** (an Indian legal-procedure blog, fetched directly this
  session) describes it in detail and confirms it is **not the author's own
  compilation** — it explicitly states the table is *"uploaded on the
  website of the Supreme Court"* by the Court's own Judges Library, covering
  **1950 to the present** across **four separate PDF volumes**, one per
  primary citation system (AIR-first, SCC-first, JT-first, SCALE-first). It
  gives one worked example matching the shape LawMind needs directly:
  *"1950 AIR 211... equivalent citation of this in SCR as 1950 SCR 519."*

**This is exactly the SCC/AIR↔S.C.R. concordance `FOUNDER_QUEUE.md` has had
open since 11 Aug**, and it is free, official, and covers the corpus's full
date range. `docs/RESEARCH_2026-08-11.md` §3a already ruled out
`digiscr.sci.gov.in`/`scr.sci.gov.in` (eSCR) as CAPTCHA-gated with no
SCC/AIR search field — **the ECT PDF is a different resource on the same
domain and was not checked by that earlier research.**

**Important limitation, stated plainly rather than glossed over: this
session could not fetch the PDF itself.** `main.sci.gov.in` failed DNS
resolution from this session's `WebFetch` tool (`getaddrinfo ENOTFOUND`),
and `web.archive.org` is blocked for this tool entirely. So **the table's
existence, coverage and four-volume structure are corroborated by
independent secondary description, but no row of actual data has been seen
by this session.** Truth-state: **VERIFIED_AVAILABLE by strong independent
corroboration, content UNCONFIRMED** — this is a different, weaker
standard than "fetched directly," and is labelled that way on purpose.
**Next step is mechanical, not a decision:** fetch the four PDFs (via
`agent-browser` or any network path that can reach `sci.gov.in`, since bare
`WebFetch` from this tool cannot) and check whether the format is
machine-parseable (columns/rows) or a scanned image needing OCR. If it
parses, this could resolve a large share of the 32,383-row missing-authority
queue **for £0** — no purchase, no licensing decision.

**Third attempt made and stopped, per the 3-cycle rule.** 12 Aug 2026: tried
`www.sci.gov.in/pdf/ECT/...` (a different subdomain than the DNS-dead
`main.sci.gov.in`) — this one resolves but returns **HTTP 403**, a different
failure mode from the DNS failure, confirming the block is closer to
`sci.gov.in`'s own bot-defence than to this specific subdomain or tool. Three
distinct attempts (direct `main.` fetch, `archive.org` mirror, `www.` fetch)
have now failed by three different mechanisms across two sessions. **Not
retrying a fourth time from this environment** — the next attempt should use
`agent-browser` (a real browser context, not a bare HTTP fetch), which no
session has tried yet.

### 5a-FETCHED · 14 Aug 2026 — THE ECT IS IN HAND, PARSED AND MEASURED. §5a above is superseded on every point except its licence caution.

**All four volumes fetched, parsed, and measured against the live corpus this
session.** §5a's "content UNCONFIRMED / no row of actual data has been seen"
is no longer true, and its "next attempt should use `agent-browser`" advice is
moot — the blocker was never bot-defence.

**The root cause of two sessions of failure: `main.sci.gov.in` does not
exist.** Not blocked, not firewalled — **NXDOMAIN**. `sci.gov.in` and
`www.sci.gov.in` resolve and answer `200` to a plain `curl` with no browser,
no session, no CAPTCHA. §5a concluded the block was "closer to `sci.gov.in`'s
own bot-defence"; that was wrong. The 403 on `www.sci.gov.in/pdf/ECT/...` was
an ordinary 404-shaped refusal for a path that had moved, on a site that had
been rebuilt as WordPress. **Three failures across two sessions were three
symptoms of one dead hostname**, and the fourth attempt was worth making
because it changed transport (`curl`) rather than repeating `WebFetch`.

> **The reusable rule: distinguish NXDOMAIN from a refusal before concluding
> a site is defending itself.** `nslookup` is one command and would have
> ended this thread on 12 Aug. "Unreachable" is not one failure mode.

#### Where it actually lives, and the part that matters for provenance

| | |
| --- | --- |
| **live official landing page** | `https://www.sci.gov.in/judges-library/` → "EQUIVALENT CITATION TABLE" |
| **live official landing PDF** | `https://cdnbbsr.s3waas.gov.in/s3ec0490f1f4972d133619a60c30f3559e/uploads/2024/01/2024011542.pdf` (uploaded **Jan 2024**, 1 page, 24,098 bytes) |
| **the four volumes it links to** | `http://main.sci.gov.in/pdf/ECT/journal{1,2,3,4}.pdf` — **all four dead (NXDOMAIN)** |
| **the only working route to the content** | Internet Archive, `web.archive.org` |

**The Supreme Court still publishes the ECT as a current Judges Library
resource, and its own links to it have been broken since the site migration.**
The landing PDF was uploaded in January 2024 and points at a hostname that no
longer resolves. Verified by extracting the embedded link targets from the
compressed streams of the live PDF itself, not inferred.

**Exact retrieval, reproducible (`curl`, no browser, no credential):**

    https://web.archive.org/web/20220516052441id_/https://main.sci.gov.in/pdf/ECT/journal1.pdf
    https://web.archive.org/web/20220516061526id_/https://main.sci.gov.in/pdf/ECT/journal2.pdf
    https://web.archive.org/web/20220516061201id_/https://main.sci.gov.in/pdf/ECT/journal3.pdf
    https://web.archive.org/web/20220516071047id_/https://main.sci.gov.in/pdf/ECT/journal4.pdf
    https://web.archive.org/web/20220516042247id_/https://main.sci.gov.in/pdf/ECT/how2find.pdf

The `id_` suffix is load-bearing — it returns the original bytes rather than
the Archive's wrapped viewer. Snapshot dates were selected by filtering the
CDX API on `statuscode:200`; the first four timestamps the plain CDX query
returned were `302` redirects and would have yielded nothing.

#### What it is, from `how2find.pdf` (the Court's own description)

Compiled by the **Supreme Court Judges Library**, signed by Dr. R.K.
Shrivastava, Director (Library). Volumes are keyed one per reporter, each
giving the other four:

    Volume 1  AIR (SC) = SCR = SCC = JT = SCALE
    Volume 2  SCC      = SCR = AIR = JT = SCALE
    Volume 3  JT       = SCR = SCC = AIR = SCALE
    Volume 4  SCALE    = SCR = SCC = AIR = JT

Header stamp: **`as on 12.03.2018`** — so the table stops in 2018. That is a
real coverage limit, stated here rather than discovered later.

#### Shape: machine-parseable text, not scans

`pdftotext -enc UTF-8 -layout` yields **148,025 lines** across the four
volumes. One equivalence per line:

    1950 AIR 211 = 1950 SCR 519
    1993 AIR 384 = 1992( 2)Suppl.SCR 438 = 1993( 1) SCC 182 = 1992 Suppl.JT 20 = 1992( 3) SCALE 113

**Vocabulary measured, not assumed** (per the `LANE_PROTOCOL.md` §3b rule
that cost LCC two parser versions): a **closed set of 28 reporter tokens** —
`AIR`, `SCC`, `SCR`, `JT`, `SCALE`, their `Suppl.` variants, and `SCALE SP`
(a special-page series). Bracket/space placement is irregular (`1993( 1) SCC`,
`1992 Suppl.JT`) and must be tolerated, not matched literally.

Parse result: **125,692 equivalence lines → 501,959 atoms, 181 unparsed
(0.036%) → 155,442 distinct citation forms → 235,807 distinct pairs.**

#### MEASURED AGAINST THE LIVE CORPUS — the number that decides this

Joined on `(reporter, year, volume, page)` tuples, **not** string equality,
and run through the repo's own `normaliseCitation()` so the comparison matches
how the database actually keys citations:

| | distinct | edges |
| --- | --- | --- |
| live unresolved population (sentinels excluded) | 231,546 | **598,766** |
| present in the ECT at all | 42,335 | 322,160 |
| **resolvable to a judgment LawMind ALREADY HOLDS** | **21,340** | **204,684** |

**204,684 of 598,766 unresolved citation edges — 34.2% — are closable with a
free, official source, with no acquisition and no ingestion.** Per reporter,
as a share of that reporter's unresolved edges: **AIR 63.1%**, **SCC 52.4%**,
**SCALE 49.3%**.

This is the strongest possible confirmation of the thesis §6 and
`MISSING_AUTHORITY_QUEUE.md` §1 have argued since 12 Aug: **the unresolved
citation population is overwhelmingly an alias-resolution problem against
judgments already held, not an acquisition gap.** It is now measured against
the live table at 598,766 edges rather than argued from the frozen 51,272-row
one.

**A first pass returned `0 / 18,825` and was a join artifact, not a finding.**
The corpus prints S.C.R. as `[1950] 1 S.C.R. 15`; the ECT prints `1950 SCR 75`
and **omits the volume entirely for early years**. String equality finds
nothing. Recorded because the near-miss is the reusable part: a clean zero
against a source this well corroborated is a bug in the comparison until
proven otherwise.

#### VALIDATED against an independent ground truth — 99.42%

The ECT is an external claim, so it was checked before being recommended.
`judgment_citation_aliases` (4,394 rows) is **corpus-derived** — each pairing
extracted from judgment text with **≥2 corroborating citing judgments**. The
ECT (Judges Library, 2018) and that table are independent sources about the
same facts.

| | |
| --- | --- |
| comparable overlap | **3,807** |
| **agree** | **3,785 — 99.42%** |
| disagree | 22 — 0.58% |

The 22 disagreements are **ECT transcription slips, not systematic error** —
`(2001) 12 SCR 1205` where the corpus has `[2011] 12 S.C.R. 1205` (year typo,
volume and page identical), `(1986) 3 SCR 1048` against `1049` (off-by-one
page). No pattern that would corrupt a bulk load, but **enough that promotion
should corroborate rather than trust blindly**, exactly as the alias table
itself already requires two sightings.

#### Truth-state and what is NOT cleared

**Truth-state: `VERIFIED` — fetched, parsed, measured and independently
validated this session.** That is the content. It is **not** an authorisation.

**Licence NOT cleared, and this lane does not clear licences.** The ECT is an
official Government of India publication, which under the Copyright Act is a
*Government work* (s.2(k), s.17(d)) — a different category from a judgment,
which `CLAUDE.md` §6 exempts via s.52(1)(q)(iv). The counter-argument that it
is a table of bare citation numbers, i.e. facts without the "modicum of
creativity" *EBC v. D.B. Modak* requires, is real but **is a legal reading and
not this lane's to make.** The SCI website is also not among the §6a-named
sources. Filed to `FOUNDER_QUEUE.md`; **not queued to NEW2 as a cleared
target.**

**Not committed to the repo.** The four PDFs (~12 MB) and the 235,807 parsed
pairs are deliberately left out of the tree while the licence question is
open. Everything needed to reproduce them is above.

### 5b · Commercial citators — checked directly, no self-serve API for either

**Manupatra's own FAQ page, fetched directly:** no mention anywhere of an
API, bulk export, or programmatic access. Licensing is IP-based per-location
access, an "enterprise license," and a government/judiciary plan — all
sales-contact-only (`contact@manupatra.com`), no self-serve technical
tier described.

**SCC Online:** no API or institutional-terms documentation found by search
across their own site, help center, or reseller pages — every institutional
path routes to `sales@scconline.com`. Consistent with Manupatra: both are
interactive human-subscription products with no discoverable programmatic
access, not merely "not yet checked."

**Truth-state for both: `VERIFIED_BUT_RESTRICTED`** — real, dominant,
confirmed to exist, but access is sales-negotiated seat licences, not an
API. Not in the §6a authorized list either way — even if a licence were
negotiated, it would be a new founder decision, same as the already-declined
IndianKanoon path. **Given Supreme Today (confirmed = Supreme AI, §6a-
authorized) already covers headnotes/treatment/tribunals via a built
harvester blocked only on an account, there is no evident reason to pursue
either of these** unless Supreme Today's coverage or editorial depth turns
out to be materially worse once the account exists and real data is seen.
CaseMine and vLex India: **not reached this session.**

### 5c · A caught hallucination — recorded because the catch is the useful part

While researching District Court sources (§4), a `WebFetch` summary of
`github.com/vanga/indian-high-court-judgments`'s README claimed a companion
repository, `indian-district-court-judgments`, existed. **A direct follow-up
`WebSearch` for that exact repository found no such project** — the same
author's real repositories are only the Supreme Court and High Court ones
already in LawMind's corpus. **Treated as a fetch-summarization
hallucination and discarded — nowhere in this registry or the acquisition
queue cites it as real.** Recorded per the mission's own no-hallucination
rule (§17): a claim that fails independent re-verification does not get
quietly dropped, it gets written down as caught.

---

## 5d · e-SCR — a real, unresolved terminology split across this repo's own docs, and a possibly-real content gap underneath it

**Found this session while confirming the ECT, not independently sought
out.** Two different, contradictory pictures of "e-SCR" exist in this
repo's own docs, using inconsistent capitalisation for what may or may not
be the same thing:

- **`docs/AGENT_BROWSER.md` and `docs/RESEARCH_2026-08-11.md` §3a — retracted
  and CAPTCHA-gated.** *"eSCR (`digiscr.sci.gov.in`)"* never resolved and
  was never fetched before being written down. The real site,
  `https://scr.sci.gov.in/scrsearch/`, is CAPTCHA-gated on the same
  `securimage` widget eCourts uses, and its search form has **no SCC/AIR
  field** — *"Not a concordance source at any access level."*
- **`docs/COMPETITIVE.md`, `docs/COMPETITIVE_TEARDOWN.md`,
  `docs/SUPREME_TODAY_LICENCE.md`, `docs/BHARAT_LAW_OFFER.md` — free, fast,
  genuinely good, already in comparative use.** *"e-SCR gives ~34,000
  Supreme Court judgments free WITH OFFICIAL HEADNOTES, digitised SCR
  1950–2017 by the Court's own Editorial Section"*; *"e-SCR is free, fast,
  and carries neutral citations. Do not position on corpus size — we lose
  to a government service that costs nothing"*; *"SC complete... it *is*
  the source... free."*

**These are not necessarily in conflict, and NEW3 is not resolving it by
picking one — the likely reconciliation, stated as INFER not KNOW:** the
CAPTCHA blocks *automated bulk* access, not a *human* using a browser to
look up one judgment at a time — exactly the same shape as the eCourts
Tier-3 pattern this product already uses elsewhere. And "no SCC/AIR field"
only rules it out as a *concordance* source; it says nothing about whether
its **official headnotes** are independently valuable. If that reading is
right, there is a real, uncatalogued content opportunity underneath the
confusion: **LawMind's own Supreme Court corpus (AWS-sourced) has judgment
text but no official editorial headnotes; e-SCR has exactly that, for
~34,000 judgments, 1950–2017, for free, from the Court's own Editorial
Section** — genuinely different from and complementary to the Supreme
Today licence (which buys *High Court* headnotes specifically because SC
ones are "largely duplicated by e-SCR's official free headnotes,"
`SUPREME_TODAY_LICENCE.md` §8a).

**RESOLVED 13 Aug 2026 — fetched directly, upgraded from INFER to KNOW.**
`https://scr.sci.gov.in/scrsearch/` loaded successfully (unlike the ECT's
`main.`/`www.sci.gov.in` subdomains, this one is not blocked for this
session's tools). Confirmed hands-on: **a CAPTCHA is on the page**, and
the search form offers **`SCR` and `Neutral Citation` fields only** — no
SCC field, no AIR field, no party-name field. This directly confirms
`RESEARCH_2026-08-11.md` §3a's finding rather than merely corroborating
it secondhand: **e-SCR/`scr.sci.gov.in` cannot resolve an SCC/AIR citation
to anything, at any access level**, because the form has nowhere to enter
one. The likely reconciliation in §5d above still stands and is now
better-evidenced: e-SCR is a genuine, free, human-usable lookup-by-S.C.R.-
or-neutral-citation tool (matching the "free, fast, genuinely good"
competitive-analysis framing, used the way a human uses it), and
simultaneously useless for the specific SCC/AIR↔S.C.R. concordance problem
(matching the "not a concordance source" retraction) — **both descriptions
are correct at once, about two different uses of the same site.**

---

## 5e · THE CONSTITUTION'S SCHEDULES — LCC left this as an open question for this lane, researched 13 Aug

**Context: not a new gap.** `LCC` shipped the Constitution parser (bus
0158) and deliberately left the Schedules and three appendices unparsed —
*"a clean follow-up with its own shape if you think it earns one."* This
is that scoping.

**The Seventh, Ninth and Tenth Schedules are not low-value appendix
material — they are among the most heavily litigated parts of the
Constitution, independently confirmed by search:**

- **Seventh Schedule** — the Union/State/Concurrent legislative lists.
  Foundational to essentially every centre-state legislative-competence
  dispute; this is the schedule the Mineral Area Development Authority
  judgment already flagged in `TREATMENT_GRAPH_GAP.md` turns on (mineral
  royalty, Entry 50 List II).
- **Ninth Schedule** — Acts placed beyond ordinary judicial review
  (originally land reform). The subject of *I.R. Coelho v. State of Tamil
  Nadu* and the basic-structure line of cases; a live, still-litigated
  question of how far Ninth Schedule protection actually extends.
- **Tenth Schedule** — the anti-defection law. **Currently and actively
  litigated**, not merely historical: *Kihoto Hollohan v. Zachillhu*
  (1992), *Ravi S. Naik v. Union of India* (1994), *Rajendra Singh Rana v.
  Swami Prasad Maurya* (2007), and the line continues through recent
  Karnataka/Manipur speaker-disqualification disputes.

**CORRECTED 13 Aug 2026 — LCC measured this rather than accepting the
recommendation, and the ordering below was wrong.** Bus 0196: this lane's
first pass ranked the Tenth Schedule (anti-defection) highest on
*litigation salience* — Kihoto Hollohan, the recent speaker-disqualification
cases. LCC checked actual corpus frequency instead, over the whole Supreme
Court population (38,342 judgments, no sampling): **Seventh Schedule
1,200 judgments (3.13%), Ninth Schedule 142 (0.37%), Tenth Schedule 82
(0.21%), anti-defection specifically only 19.** Seventh is **52× more
frequent** than this lane's own first, unmeasured sample had suggested —
because that first read came from a national-news framing of what's
*talked about*, not what this specific corpus actually cites. **Litigation
salience and corpus frequency are different quantities, and only the
second predicts how often a parser actually gets used.** Scoping to just
these three (and excluding the other nine Schedules plus the three
appendices) was right; the priority order inside that scope was inverted.

**Corrected recommendation: Seventh Schedule first, and only that, until
it proves out — Ninth and Tenth after, if at all.** 1,200 SC judgments
turning on Union/State/Concurrent list entries is the schedule the
mineral-royalty case in `TREATMENT_GRAPH_GAP.md` itself turns on, and it
is real, measured, resolvable value at a scale the other two do not
match. **Lesson for this lane's own future prioritisation work, recorded
so it isn't relearned:** rank by what THIS corpus actually contains, not
by which provision gets the most news coverage — the two are not the same
signal, and this session's first pass conflated them.

---

## 5f · THE BNS/BNSS/BSA ↔ IPC/CrPC/EVIDENCE MAPPING — found, official, complete, 13 Aug 2026

**LCC's exact ask (bus 0315): we hold the three 2023 criminal codes in full
(BNS 358 sections, BNSS 531, BSA 170) and zero of the three repealed ones
(IPC, CrPC, Indian Evidence Act) — `statute_mappings` at 0 rows, and
`DOMAIN_TRUTH.md` forbids a model or hardcoded table from filling it.**
indiacode.nic.in was the seed source named as the place to look first; it
does not itself host an embedded correspondence table (checked directly).
The actual answer is elsewhere, official, and better than expected.

**Bureau of Police Research & Development (BPRD), under the Ministry of
Home Affairs, Government of India, has published all three, section by
section, as government work product — authored/reviewed by Anil Kishore
Yadav, IPS, Director, Central Academy for Police Training, Bhopal:**

| document | URL | verified |
| --- | --- | --- |
| BNS ↔ IPC | `https://bprd.nic.in/uploads/pdf/COMPARISON%20SUMMARY%20BNS%20to%20IPC%20.pdf` | downloaded, `pdftotext` extracts 82,726 chars of structured text — not a scanned image |
| BNSS ↔ CrPC | `https://bprd.nic.in/uploads/pdf/Comparison%20summary%20BNSS%20to%20CrPC.pdf` | downloaded, 78,186 chars extracted |
| BSA ↔ IEA | `https://bprd.nic.in/uploads/pdf/Comparison%20Summary%20BSA%20to%20IEA.pdf` | downloaded, 29,723 chars extracted |

**CORRECTED 13 Aug 2026 (bus 0326) — the format described below is verified
for BSA↔IEA only. LCC built and tested a parser against all three and
found BNS↔IPC and BNSS↔CrPC use a different column order** (`section →
subject → old section`, vs BSA's `section → old section → subject`) **and
carry multi-section mappings BSA does not** — e.g. BNS `5` maps to IPC
`54 & 55 & 55A`, three targets, not one. Mapping to only the first would
be a partial mapping presented as complete. This lane verified all three
PDFs were genuinely text-bearing (not scanned) before reporting, which
remains true and load-bearing for all three — but the shape claim below
was measured on BSA and wrongly generalised to its siblings without
checking. Recording the correction rather than restating it as fact:

`[new section] ↔ [old section/paragraph] ↔ [subject] ↔ [summary of what
changed]`, at paragraph-level granularity where a section splits — e.g.
BSA `2(1)(a)` maps to IEA `3, para 1`, not a naive whole-section 1:1
guess — **holds for BSA↔IEA.** BNS↔IPC and BNSS↔CrPC need their own
parser, scoped by LCC, not this lane's to build.

**Confirmed complete, not excerpted, for all three:** each document's
last row is that Act's own final "Repeal and savings" section — BSA's
ends at row 170, exactly matching LawMind's held BSA section count. Not a
summary of selected changes; a full correspondence table through to the
last section, regardless of which two parse cleanly today.

**UPDATE 16 Aug 2026 — `Final_BNS.pdf` checked, and the "plausibly richer"
guess above was right.** Same `bprd.nic.in/uploads/pdf/` path, filename
guessed and confirmed by direct fetch (`curl`, HTTP 200 on all three,
resumed with `-C -` after this machine's usual slow-connection timeouts —
same pattern as every other `.gov.in` fetch this session, not a new
problem). `Final_BNS.pdf` is **11.4MB, 553,880 chars of real extracted
text** (`pdftotext`, not a scanned image) — roughly 6.7x the 82,726-char
comparison-summary table for the same statute. It is **not a duplicate of
the comparison table**: a full narrative **"HANDBOOK ON THE BHARATIYA NYAYA
SANHITA, 2023"**, MHA/BPRD-authored government work product (same
authorship class as the comparison tables, so the same *E.B.C. v. D.B.
Modak* reasoning that cleared those clears this), with an executive
summary explaining the policy rationale for each category of change (20
new offences, 19 deleted, 41 punishments increased, 23 mandatory-minimums
introduced, 6 community-service provisions), then **chapter-by-chapter
commentary through Chapter XX (Repeal and Savings)**, colour-coded in the
source (green = new addition, red = deleted/modified, blue = procedural
change — lost in plain-text extraction, recoverable from the PDF's
character-colour if ever wanted). This is explanatory/interpretive content
a bare old-section↔new-section table cannot carry — genuinely additive if
`DOMAIN_TRUTH.md` or a briefing surface ever wants "why did this provision
change" rather than just "what changed."

**VERIFIED 17 Aug 2026 — both siblings downloaded and text-extracted, same
shape as `Final_BNS.pdf`, same publisher.** `https://bprd.nic.in/uploads/
pdf/Final_BNSS.pdf` (10.9MB, HTTP 200, `curl -C -`) and `https://bprd.nic.in/
uploads/pdf/Final_BSA%20Book.pdf` (9.7MB, HTTP 200, space URL-encoded).
`pdftotext` extraction, not a scanned image, for both:

| doc | chars extracted | chapters | vs its own comparison-summary table |
| --- | --- | --- | --- |
| BNSS handbook | 797,158 | I–XXX | 10.2x the 78,186-char BNSS↔CrPC table |
| BSA handbook | 257,046 | I–XII | 8.6x the 29,723-char BSA↔IEA table |

**Same authorship class and self-description as the BNS handbook** — title
page "HANDBOOK ON THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023" /
"HANDBOOK ON THE BHARATIYA SAKSHYA ADHINIYAM, 2023," Bureau of Police
Research & Development, Ministry of Home Affairs. Both explicitly
self-classify as commentary, not the statute itself: *"The commentaries
have been added to provide the rationale behind the changes and their
potential impact on the implementation of the new criminal laws"* — same
sentence, near-verbatim, in both. **Classification: official government
commentary, distinct from both the enacted statute text and the bare
correspondence tables already held** — per the mission's explicit warning
not to confuse commentary with enacted law. Colour-coding (green/red/blue
for new/deleted/procedural) present in source, lost in plain-text
extraction same as the BNS finding. Hindi header text extracts as mojibake
under plain `pdftotext`, same known issue, needs `-enc UTF-8`.

**Not ingested** — this lane does not populate corpus tables
(`LANE_PROTOCOL.md`). Scratch copies used for verification only, not in the
corpus. A `Compendium/Guidelines of Nyaya Sanhita` PDF was named on the same
page 13 Aug and remains genuinely unexamined — **checked again 17 Aug,
still not found**: `bprd.nic.in`'s homepage "Criminal laws" section does
not list it (two direct filename guesses both failed, 404/403 — not
chased further by brute-force guessing per the no-silent-guessing rule).
Still open.

**NEW, 17 Aug 2026 — three different official items found on the same
homepage section, verified and text-extracted, all HTTP 200:**

| doc | source | chars | shape |
| --- | --- | --- | --- |
| SOP for FIR & e-FIR registration | BPRD, national | 15,670 | procedural guideline for police, explicitly self-disclaimed |
| SOP for Crime Scene Audio-Video Recording | BPRD, national | 37,702 | same shape |
| FAQ on the new criminal laws ("NCL") | **Madhya Pradesh Police**, not BPRD itself | 22,341, Hindi (mojibake under plain `pdftotext`, same known issue) | state-police Q&A, different authorship tier |

**Classification, per `DOMAIN_TRUTH.md`'s own four-class table** (built off
this lane's BNS/BNSS/BSA handbook work): these fit **OFFICIAL EXPLANATORY
MATERIAL** structurally (government-authored, not enacted text, not a
correspondence table) — **but with a real sub-distinction worth
preserving, not flattening into the same tier as the BPRD handbooks.** The
FIR SOP's own opening line: *"This SOP is a suggested guideline... **This
is not a legal document.**"* The handbooks carry no such disclaimer. And
the FAQ is authored by Madhya Pradesh Police, a state body, not BPRD/MHA
nationally — a different authority level than the national handbooks even
within the same class. **Flagging both distinctions rather than letting
"OFFICIAL EXPLANATORY MATERIAL" read as one uniform authority tier** — the
handbooks and these SOPs/FAQ should not carry equal weight if this
material is ever surfaced to an advocate.

Not ingested, same as above — this lane's discovery only.

**Still a discovery/provenance finding only** — this lane does not
populate `statute_mappings` or any corpus table (`LANE_PROTOCOL.md`).
Downloaded copy used for verification is in this session's scratch
directory, not the corpus; canonical fetch and any ingestion decision is
LCC's or NEW2's.

**VERIFIED_AVAILABLE, government source, three files, ~4KB–700KB PDFs,
free, no account, official Ministry of Home Affairs work product.** This
is a discovery/provenance finding only — this lane does not populate
`statute_mappings`, per lane boundary (`LANE_PROTOCOL.md`: NEW3 never
touches corpus tables). Downloaded copies used for verification were in
this session's scratch directory and are not part of the corpus; the
canonical fetch is LCC's or NEW2's to run against the live URLs above,
with its own extraction/parsing discipline.

---

## 5g · PUBLIC DATASET SWEEP, 14 Aug 2026 — data.gov.in and Justice Hub checked, neither corpus-scale

**data.gov.in's judiciary sector** (`data.gov.in/sector/judiciary`, the
official government open-data platform) — **403'd on direct fetch**, same
bot-blocking shape hit repeatedly this session on official `.gov.in`
portals (indiacode.nic.in, sci.gov.in). Not chased further this pass —
consistent with an established pattern rather than a new finding worth
extra cycles.

**Justice Hub** (`justicehub.in`, CivicDataLab) — real, fetched directly,
but a **community-contributed repository of small, analytical datasets,
not a corpus source**: India Justice Report 2022 (state-level indicators),
Constitution Benches composition 2010-22, POCSO case-tracking research,
CALPRA case-registry analysis. All freely downloadable, all useful
context for research/analytics, **none are bulk judgment or case-text
data** — a fundamentally different value proposition from the AWS/
gazette/DLI finds above. Not queued anywhere — recorded as checked and
low-priority for this lane's mission, not as a gap.

---

## 6 · THE MISSING-AUTHORITY QUEUE — a citation-graph finding, not a new source

**Full detail: `docs/MISSING_AUTHORITY_QUEUE.md`.** One-line summary: of
LawMind's 32,383 unresolved external citations (8,733 distinct citation
keys), **99.6% are SCC or AIR citations to Supreme Court judgments LawMind
almost certainly already holds** under their S.C.R. or neutral citation —
this is `FOUNDER_QUEUE.md`'s already-open *"SCC/AIR ↔ S.C.R. concordance"*
item, re-measured at 4× its previous scale as the HC ingest has grown. **This
is not a document-acquisition gap. It is an alias-resolution gap.** Treating
it as "8,733 missing judgments" and queuing them for acquisition would be
wrong and wasteful — the fix is a concordance source (§5 above, and
`docs/DATA_SOURCES.md` §2's IndianKanoon `citeList`/`docmeta` recommendation),
not new ingestion.

---

## 7 · TRUTH-STATE LEGEND (mission spec, reproduced for reference)

`VERIFIED_AVAILABLE` · `VERIFIED_BUT_RESTRICTED` · `VERIFIED_BUT_LOW_VALUE` ·
`VERIFIED_BUT_DUPLICATIVE` · `EXPERIMENTAL` · `UNKNOWN` · `DEAD` ·
`NOT_AUTHORIZED` · `NOT_USEFUL`. A row with no fetch behind it is `UNKNOWN`,
never a positive state, regardless of how confident a search snippet sounded.
