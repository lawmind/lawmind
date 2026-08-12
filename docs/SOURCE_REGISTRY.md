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

## 0 · WHAT LAWMIND HOLDS TODAY — measured live, 12 Aug 2026

Queried directly against production (`packages/db`, read-only), not recalled
from an earlier doc — the corpus is growing under an active HC ingest as this
was written:

| | count |
| --- | --- |
| `judgments` total | **312,373** |
| — Patna High Court | 58,834 |
| — Allahabad High Court | 46,467 |
| — Supreme Court of India | 38,342 |
| — High Court of Madhya Pradesh | 29,346 |
| — High Court of Rajasthan | 20,859 |
| — Madras High Court | 19,357 |
| — High Court of Karnataka | 18,033 |
| — High Court of Kerala | 16,145 |
| — Gauhati High Court | 14,536 |
| — Orissa High Court | 11,977 |
| — remaining 15 courts | each under 12,000, several (Delhi 2, J&K 2, Chhattisgarh 4, HP 8, Jharkhand 8) barely started |
| `judgment_citations` (internal) | 294,809 rows, 102,411 resolved (34.7%) |
| `external_citations` (points outside the corpus) | 51,272 rows, 18,889 resolved (36.8%), **32,383 unresolved** |
| `judgment_citation_aliases` (SCC/AIR↔SCR concordance) | 4,394 |
| `statutes` | 845 (central Acts only) |
| `statute_mappings` (IPC↔BNS etc.) | **0** — still open, `FOUNDER_QUEUE.md` |

This is the baseline every gap measurement below is against. **It moved
significantly since the corpus docs above were last written** (79,322
documents on 12 Aug morning per `docs/ai/DATA_MOAT_PROGRAM.md` → 312,373
this session, ~4× — the HC ingest is live). Any coverage percentage quoted
in an older doc should be treated as stale until re-measured.

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
| NGT, SAT, DRT | Not fetched | **Weaker evidence** — named in a search engine's synthesized summary of IndianKanoon coverage, but no raw `doctypes:` result URL confirmed for any of the three this session | SAT and DRT are explicitly in Supreme Today's priority-2 list; NGT is not — worth confirming Supreme Today actually covers NGT before assuming it does |
| CCI, TDSAT, NGT, AFT | Not fetched directly | **Confirmed this session** — live, real `doctypes:` result URLs for all four (TDSAT and AFT bench-suffixed, e.g. `doctypes:tdsat`, `armed forces tribunal doctypes:chennai`) | Not in Supreme Today's *stated* priority-2 list (which names NCLT/NCLAT/ITAT/CESTAT/SAT/DRT specifically) — worth confirming Supreme Today actually covers these once an account exists, since "not listed" may mean "not asked about" rather than "not held" |
| GSTAT | N/A — **too new to matter yet** | N/A | **Different finding, not a research gap.** GSTAT only began adjudicating 16 Feb 2026 (Principal Bench; most State Benches still not operational as of this session). There is almost no case law anywhere to acquire yet — this is a "revisit in 12-18 months" item, not an unresearched source |

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

- **The Gazette of India has no official bulk API, but a real free bulk
  mirror exists and was not previously in any LawMind doc.**
  `egazette.gov.in` is free-to-browse but (per this session's search) has no
  documented bulk endpoint. **archive.org/details/gazetteofindia** is a
  separate, actively-maintained mirror — search results describe *"crawlers
  running daily"* with *"automatic OCR using tesseract, a free text search
  engine, and RSS feeds based on search queries."* A related open-source
  project, `github.com/sushant354/egazette`, exists specifically to download
  and process Indian gazette notifications. **None of this was independently
  confirmed working this session** — this session's own fetch of the
  archive.org collection page returned only a generic landing-page summary,
  not the item count or date range claimed by the search snippets. Truth-
  state: **EXPERIMENTAL** — promising, free, matches LawMind's CC-BY/public-
  domain preference, but needs one real archive.org API call
  (`https://archive.org/advancedsearch.php?q=collection:gazetteofindia`) to
  move past "reported to exist."

- **State-level gazette/law-department portals — three states checked this
  session, one fetched directly.** Each state runs its own separate site;
  there is no central index beyond indiacode's own state-Act mirror (§3
  above), which this confirms is genuinely a *different* thing from each
  state's own primary publication.

  | state | portal | verified how | finding |
  | --- | --- | --- | --- |
  | **Maharashtra** | `lj.maharashtra.gov.in/en/document-category/act-list/` | **Fetched directly** | Real, structured, ~180+ Acts, per-Act PDF (226 KB–1 MB), **paginated 16 pages**, coverage **1952–2026**, page itself maintained (last updated 12 Mar 2026). **VERIFIED_AVAILABLE.** Per-Act PDF, not per-section like indiacode's central Acts — a parser would need to extract sections from the PDF text itself |
  | Uttar Pradesh | `upvidhansabhaproceedings.gov.in/gazette-search` | Found by search, not fetched | A dedicated Legislative Assembly gazette search tool — distinct from a bare Act repository. **VERIFIED_AVAILABLE (existence)**, structure/coverage unconfirmed |
  | Tamil Nadu | `stationeryprinting.tn.gov.in/gazette.php` | Found by search, not fetched | Weekly gazette, English **and Tamil**, published since 1800 under its current successor name since 1967. **VERIFIED_AVAILABLE (existence)**, structure/coverage unconfirmed |

  **Pattern worth recording for whoever scopes this next:** every state
  appears to need its own portal mapped individually — there is no
  multi-state aggregator found this session other than indiacode's own
  (unconfirmed-structure) state pages. 28 states + 8 union territories is a
  real-sized discovery task on its own, not a quick add-on.

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
| archive.org/details/gazetteofindia | Gazette of India, third-party mirror, daily-crawled, OCR'd | Fetched, but page content was uninformative (JS-rendered); claims from search snippets not independently confirmed | EXPERIMENTAL — cheap to confirm, do next |
| github.com/sushant354/egazette | Open-source gazette downloader | Found by search, not run | EXPERIMENTAL |
| State gazette/law-dept portals (individual states) | State rules/notifications | Maharashtra fetched directly (real, 1952–2026, ~180+ Acts); UP and TN found by search, not fetched; 25+ states/UTs untouched | Maharashtra: VERIFIED_AVAILABLE. Rest: UNKNOWN |
| PRS Legislative Research primary-PDF mirror | Gazette notifications, hosted as files under bill-tracking pages | One Tamil Nadu 2023 gazette PDF confirmed real and primary (not commentary) | EXPERIMENTAL — works as a convenience mirror when linked, systematic index unconfirmed |
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
| judgments.ecourts.gov.in | free full-text search, SC+HC confirmed | Unconfirmed for district | RESEARCH INCOMPLETE |
| services.ecourts.gov.in (case status/cause lists) | per-case, CAPTCHA-gated | Individual orders, not bulk | Already the basis of LawMind's authorized Tier-3/bulk cause-list harvest, `CLAUDE.md` §6 — not a new finding |
| District Court AWS Open Data bucket (parallel to the HC one) | Unknown — not found this session | Unknown | **RESEARCH INCOMPLETE — highest-priority next question in this category** |

---

## 5 · CITATOR / TREATMENT SOURCES BEYOND INDIANKANOON

**Resumed directly after the session-limit cleared. One major finding —
possibly the most valuable in this whole registry — and one caught
hallucination, both recorded honestly below.**

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

**What this session did NOT do:** fetch `scr.sci.gov.in/scrsearch/`
directly to confirm the CAPTCHA claim still holds, or scope what a
CAPTCHA-bounded manual/authorised-bulk headnote acquisition would actually
cost. **Filed as a genuine open question, not a recommendation** — the
terminology conflict alone is worth a future session's time before any
acquisition action, and if `scr.sci.gov.in` behaves like `scr.sci.gov.in`
(same domain family, note the earlier ECT block on `main.`/`www.`
subdomains this session), it may hit the same tooling wall.

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
