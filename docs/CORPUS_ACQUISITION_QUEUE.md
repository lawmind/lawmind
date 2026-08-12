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
| 0 | **Supreme Court of India's own Equivalent Citation Table (ECT)** — `main.sci.gov.in/pdf/ECT/` | SCC/AIR/JT/SCALE ↔ S.C.R. concordance, 1950–present, 4 official PDFs | **P0, ahead of the IndianKanoon spend below** | **£0 — official, free.** Fetch blocked from this session's tools (`sci.gov.in` DNS unreachable, archive.org fetch disabled); needs `agent-browser` or a different network path | VERIFIED_AVAILABLE by strong independent corroboration, **content not yet seen by any LawMind session** — `docs/SOURCE_REGISTRY.md` §5a. **Do this before spending anything on IndianKanoon for concordance specifically** — if it parses, it may close most of the 32,383-row gap for free |
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
| CCI, TDSAT, NGT, AFT | Real, confirmed to exist (all four have live IndianKanoon doctype URLs) but not in Supreme Today's *stated* priority-2 list | P2 | Worth an early check once Supreme Today harvesting starts — absence from the stated list may mean "not asked about" not "not held" |
| GSTAT | N/A | — | **Not a gap — the tribunal itself only started operating 16 Feb 2026.** Almost no case law exists anywhere yet. Revisit in 12-18 months, not now |

**The one action item that isn't "wait for the account":** once Supreme
Today harvesting starts, confirm early whether CCI/TDSAT/NGT/AFT are
actually covered.

---

## STATUTE_QUEUE

| item | status |
| --- | --- |
| **The Constitution of India itself** | **NEW FINDING, 13 Aug 2026 — genuine zero-coverage gap.** `SELECT * FROM statutes WHERE short_title ILIKE '%constitution%'` returns **0 rows**, confirmed live against 845-row `statutes`. The single most foundational Indian legal document — 25 Parts, 12 Schedules, ~448 Articles, 106 amendments since 1950 — is entirely absent, despite being cited constantly (several of the 34 treatment-graph-gap judgments in `TREATMENT_GRAPH_GAP.md` are constitutional-bench decisions). **Free and available**: `indiacode.nic.in/handle/123456789/16124` (verified by search, not yet fetched directly). **Same shape as the already-known IPC/CrPC/Evidence Act gap** (`FOUNDER_QUEUE.md` "IPC↔BNS mapping"): it's a **PDF bitstream**, not the per-section HTML the 845 held central Acts use, so `parseActPage` cannot read it — needs the same PDF-to-articles parser already queued for the repealed criminal codes. Not yet scoped as its own acquisition item anywhere in the repo before this session. `NOT_AUTHORIZED` in the sense that nobody has decided to build the PDF parser yet — but this is public-domain government text, no licensing question at all, purely an engineering gap |
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
