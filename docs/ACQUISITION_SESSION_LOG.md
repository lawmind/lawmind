# ACQUISITION SESSION LOG — the data-moat research lane's own record

**Per mission §15: long-running discovery must survive chat closure, and a
dead source must not block the rest of the program.** This file is that
survival record for the acquisition/discovery lane started 12 August 2026. It
is a log, not a queue — `docs/SOURCE_REGISTRY.md`, `docs/
MISSING_AUTHORITY_QUEUE.md` and `docs/CORPUS_ACQUISITION_QUEUE.md` are the
queues.

---

## Session 1 — 12 August 2026

**Scope attempted:** the founder's full NEW3 acquisition-lane brief — a
master source inventory across judgments (SC/HC/district), tribunals, state
legislation, gazettes/notifications, citators, and a citation-graph-driven
missing-authority queue.

**What actually happened, in order:**

1. Read the existing corpus/source docs (`DATA_SOURCES.md`,
   `CORPUS_GAP_PLAN.md`, `DATASETS.md`, `docs/ai/AWS_CORPUS_INVENTORY.md`,
   `FOUNDER_QUEUE.md`, `docs/ai/DATA_MOAT_PROGRAM.md`) — all already deep,
   fetched research on SC/HC judgments and central Acts. Not re-done.
2. Queried production (`external_citations`, `judgments`) read-only to build
   a live citation-graph missing-authority ranking. Succeeded — see
   `MISSING_AUTHORITY_QUEUE.md`.
3. **Dispatched 4 parallel research subagents** (tribunals; state Acts/
   gazettes; eCourts district/NJDG; citators beyond IndianKanoon) per the
   `dispatching-parallel-agents` pattern — independent domains, safe to
   parallelise. **All 4 failed before returning a result**, each with the
   identical error: *"Agent terminated early due to an API error: You've hit
   your session limit · resets 12:50am (Asia/Dubai)."* This is an
   account-level usage cap, not a per-source dead end — recorded here per
   §15's "mark it, continue to the next source" rule rather than treated as
   a research finding about any of the four topics.
4. **Verified the limit was not blocking this session's own direct tool
   calls** — one `WebSearch` call from the main thread succeeded immediately
   after the four failures. Continued the research directly (WebSearch +
   WebFetch from the main session) instead of re-dispatching agents, at
   reduced depth versus the original 4-agent brief.
5. Produced real, fetch-backed findings for tribunals (IndianKanoon already
   indexes NCLT/CESTAT/NCDRC — a material redirection of acquisition
   strategy), partial findings for state Acts/gazettes (indiacode state
   pages exist but structure unconfirmed — indiacode 403'd this session's
   direct fetches; a real Gazette-of-India mirror exists on archive.org but
   was not independently confirmed working) and district judiciary (NJDG
   confirmed open-data for pendency stats only, not full text).
6. **Did not reach the citator-sources-beyond-IndianKanoon category at all**
   this session (SCC Online, Manupatra, CaseMine, vLex India, and — most
   importantly — any free SCC/AIR↔S.C.R. concordance source). This is the
   single highest-priority item for the next session, per
   `SOURCE_REGISTRY.md` §5's own reasoning.

**What is genuinely NOT done, stated plainly rather than implied by
omission:**

- Tribunals beyond NCLT/CESTAT/NCDRC (ITAT reported-but-not-doctype-
  confirmed; CCI, TDSAT, NGT, CAT, DRT/DRAT, SAT, GSTAT, AFT untouched).
- State-Act page structure (per-section markup vs PDF scan) — not confirmed,
  indiacode blocked this session's fetch method.
- Any state's own gazette/law-department portal — zero states checked.
- PRS Legislative Research's data offering — not checked.
- District Court full-text source (AWS bucket or otherwise) — not found,
  and the search run was narrow; this is flagged as the single highest-
  priority open question in the district-judiciary category.
- The entire citator/concordance category (§5 of `SOURCE_REGISTRY.md`).
- Historical reporters (SCR/AIR/SCC archives) as a category of their own,
  separate from the citation-key concordance question.
- Automated/recurring discovery scripts (mission §13, §15's job/cursor
  persistence) — not built. This session's queries were one-off, run by
  hand, against a live database, not a scheduled job.

**Next session should resume at:** the citator category (highest expected
value, per `SOURCE_REGISTRY.md` §5's own reasoning — it bears directly on
the 32,383-row missing-authority queue), then the District Court AWS-bucket
question, then tribunal doctype-confirmation for ITAT/CCI/NGT/CAT, in that
order. If subagent dispatch fails again with the same session-limit error,
do not retry blindly — check whether direct WebSearch/WebFetch from the main
thread still works (it did, mid-session, this time) before concluding the
whole research channel is down.

---

## Session 1, continued — same day, after the above

The four items marked "next session should resume at" were mostly done in
the same session, directly (WebSearch/WebFetch from the main thread — the
account-level limit had cleared and stayed clear). Summary, full detail in
`SOURCE_REGISTRY.md`:

1. **Citator research: the best finding of the session.** The Supreme
   Court of India publishes its own free **Equivalent Citation Table**
   (`main.sci.gov.in/pdf/ECT/`), mapping SCC/AIR/JT/SCALE to S.C.R. for
   every judgment 1950–present. Corroborated by two independent secondary
   sources; **not fetched directly** — `main.sci.gov.in` failed DNS
   resolution from this session's `WebFetch` tool, and `web.archive.org` is
   blocked for this tool entirely. **This is the single highest-priority
   unfinished action across the whole registry**: one real fetch (via
   `agent-browser` or any working network path to `sci.gov.in`) tells New2
   whether the corpus's entire 32,383-row missing-authority queue can be
   mostly resolved for £0, before a rupee is spent on IndianKanoon for
   concordance specifically. `SOURCE_REGISTRY.md` §5a.
2. **District Court AWS bucket: searched, not found.** Reasonably strong
   negative evidence (checked the AWS Open Data registry and the known
   author's GitHub account directly), not proof of absence.
3. **Tribunal doctypes: confirmed live for NCLT, CESTAT, ITAT, CAT** (each
   has an actual `doctypes:` result URL, not just a mention), NCDRC
   confirmed via live result listings. NGT/SAT/DRT only weakly evidenced
   (named in a synthesized summary, no raw doctype URL). CCI/TDSAT/GSTAT/AFT
   untouched. `SOURCE_REGISTRY.md` §2.
4. **One hallucination caught and discarded**, not silently dropped: a
   `WebFetch` summary invented a nonexistent `indian-district-court-
   judgments` GitHub repository; a direct follow-up search found no such
   project and it is not cited as real anywhere in this registry.
   `SOURCE_REGISTRY.md` §5c.

**Genuinely still open for the next session, in priority order:** (1) get a
real fetch of the ECT PDFs — this is mechanical, not research, and unblocks
the largest single item in the whole program; (2) SCC Online / Manupatra
API terms, actually checked past the marketing page; (3) CCI/TDSAT/GSTAT/AFT
tribunal doctype confirmation; (4) any state's own gazette/law-department
portal — zero states checked all session; (5) indiacode state-Act page
structure — exists, per-section markup unconfirmed, indiacode 403's this
tool's plain fetches.

## New2 confirmation, 12 Aug 2026 — the ECT block is real, not tool-specific

Tried both `curl` (direct network, this machine) and `WebFetch` (Anthropic's
own fetch path) against `main.sci.gov.in`. **Both failed identically** —
`curl` returned HTTP 000 (no connection at all), `WebFetch` returned
`getaddrinfo ENOTFOUND main.sci.gov.in`. This was not a New3-session quirk;
the domain is unreachable from every network path tried across two separate
sessions now. `agent-browser` (the one path neither session has tried) is
not available in New2's toolset either. This item stays open, genuinely
blocked, not re-attempted — no third attempt without a new tool/path to try.

---

## Session 2 — 12 Aug 2026, bound as NEW3 under the five-lane protocol

**The bus went from two lanes to five while this session was between turns.**
Bound this session as `NEW3` per `docs/LANE_PROTOCOL.md`, read `CLAUDE.md`
§6a, `docs/ai/AUTHORITY_COVERAGE.md`, and the inbox (76 messages, nothing
addressed to NEW3 yet beyond the broadcast announcing the five-lane switch —
NEW1 has sent nothing; the ring's feedback loop, NEW1 → NEW3 with missing/
unreachable authorities, has no traffic yet because NEW1 hasn't started).

**The session's own prior work (before the lane existed) needed re-auditing
against an explicit instruction it predates: only BharatLaw, Supreme AI and
eCourts India are §6a-authorized.** Everything else this session researched
and queued — IndianKanoon, the SCI Equivalent Citation Table, tribunals via
IndianKanoon, the archive.org gazette mirror, SCC Online/Manupatra — was
already correctly routed to `FOUNDER_QUEUE.md` as an open decision rather
than treated as cleared, so nothing needed reversing. What changed is
making that status explicit and unmissable: banners added to `SOURCE_REGISTRY.md`
and `CORPUS_ACQUISITION_QUEUE.md`, both pointing at the new `docs/
AUTHORIZED_SOURCE_MAP.md`.

**The actual new work this session: mapping the three authorized sources
against what's already known, rather than researching new unauthorized
ones.**

1. **BharatLaw** — already deeply mapped (`BHARAT_LAW_OFFER.md`). Confirmed
   the practical constraint already on record (`FOUNDER_QUEUE.md` Q1.13):
   §6a's blanket authorization to deal with BharatLaw is not the same as
   their own contract's required written consent for extraction/
   benchmarking, which is still owed (FQ-BL1). Nothing new to add beyond
   noting their `robots.txt`/`llms.txt` already permit crawling their
   public marketing pages (low corpus value, not queued).
2. **Supreme AI — the real finding.** No product distinctly branded
   "Supreme AI" was found anywhere on the web this session, only *Supreme
   Today AI* (`supremetoday.ai`), already the subject of deep research
   (`COMPETITOR_SUPREME_TODAY.md`) and a separately negotiated ₹50,000/mo
   licence (`SUPREME_TODAY_LICENCE.md`). `CLAUDE.md` and `FOUNDER_QUEUE.md`
   both insist, repeatedly and deliberately, that the two names are
   different sources. **This session cannot tell whether that's true from
   the documents alone**, and is not resolving it by picking a reading —
   filed as a `FOUNDER_QUEUE.md` open item and in `AUTHORIZED_SOURCE_MAP.md`
   §2. This is the single most consequential open question in the whole
   registry now: if "Supreme AI" = Supreme Today, there's an already-built
   acquisition plan sitting unused; if not, it's an unstarted discovery task
   with no lead yet.
3. **eCourts India** — fully mapped already, LCC/NEW2's mechanism, nothing
   for this lane to add beyond confirming there's no new discovery gap here.

**Next session, in order:** (1) wait for the founder's answer on Supreme AI
identity — everything downstream of it depends on the answer; (2) if NEW1
has produced any missing/unreachable-authority reports by then, that's the
lane's actual designed input and should be worked before any more
speculative source research; (3) failing both, resume the still-open
non-authorized-source research queue (SCC Online/Manupatra API terms,
remaining tribunal doctypes, state gazette portals) purely as intelligence
for `FOUNDER_QUEUE.md`, not as acquisition prep.

---

## Session 3 — 12 Aug 2026, same day — the founder answered

**"yes supreme ai = supreme today ai."** Closed the open item in
`FOUNDER_QUEUE.md`. Consequence: `docs/SUPREME_TODAY_LICENCE.md` and `docs/
HARVEST_ENGINE.md` — both written 8 Aug, both before this lane existed — are
the actual acquisition plan for the one source this lane can act on today.
Nothing needed building; the harvester (`services/ingest/src/harvest/
pace.ts`, `harvest:probe`) already exists and already refuses honestly
because no account exists yet (checked `.env` directly — no Supreme Today
credential present).

**A real mistake found and fixed while closing this out, not a new
finding but worth recording precisely because it's the kind of error this
lane exists to catch in others.** Re-reading `FOUNDER_QUEUE.md` in full (not
skimmed) surfaced two lines this session had not seen before recommending
IndianKanoon for tribunal acquisition: *"We are NOT buying the Indian
Kanoon API... the money is going to Supreme Today instead"* and *"Indian
Kanoon is settled: no API"* — both dated 8 Aug, before this lane's first
session. **This session's own earlier `docs/SOURCE_REGISTRY.md` §2
recommended exactly the thing already declined.** Corrected in
`SOURCE_REGISTRY.md`, `CORPUS_ACQUISITION_QUEUE.md` and
`AUTHORIZED_SOURCE_MAP.md`: IndianKanoon is now marked `NOT_AUTHORIZED —
DECLINED`, not `pending`, and tribunal acquisition points at Supreme Today
instead (which needs no purchase decision, only the account already
tracked). **The lesson, plainly: "search before queueing" (`CLAUDE.md`
§6b) means the WHOLE founder queue, not the sections read on the first
pass** — a 2,800-line file with entries added over five days will have
answers to questions asked before a lane existed to ask them again.

Sent bus messages 0081-0084 (the earlier, now-partly-superseded framing) and
the correction as 0094-0097. Read LCC's 0092 in reply — written before the
founder's confirmation reached this session, so its caution ("I would not
treat the licence mechanics as transferable until the founder says so") is
already superseded by 0094-0097, not a live objection.

**Two more items closed out same session, both bounded, both negative
findings recorded rather than left as "not yet checked":**

- **The ECT fetch — third and final attempt this pass.** Tried
  `www.sci.gov.in/pdf/ECT/...` (a different subdomain than the DNS-dead
  `main.sci.gov.in`) — resolves, but **403**. Three distinct attempts, three
  distinct failure modes (DNS-dead, archive.org blocked for this tool,
  403), across two sessions. **Stopping per the 3-cycle rule.** Needs
  `agent-browser`, untried by any session so far — recorded in
  `SOURCE_REGISTRY.md` §5a as the next concrete, mechanical step for
  whoever has that tool.
- **SCC Online and Manupatra, checked directly rather than left as market
  assumption.** Manupatra's own FAQ page: no API, no bulk export, nothing
  beyond sales-negotiated IP-based/enterprise seats. SCC Online: same shape
  by search — every institutional path routes to a sales contact, no
  self-serve technical tier found anywhere. Both reclassified
  `VERIFIED_BUT_RESTRICTED` in `SOURCE_REGISTRY.md` §5b, and flagged as
  low-priority now that Supreme Today (confirmed = Supreme AI) already
  covers the same editorial ground via an already-built, already-authorized
  path.

**State at end of this pass:** every §6a-authorized source is now mapped
(`AUTHORIZED_SOURCE_MAP.md`); the one actionable acquisition item (Supreme
Today) is blocked only on an account, not on this lane; the citation-
concordance question's best lead (the ECT) is blocked on tooling, not
research; commercial citators are ruled out as low-value given Supreme
Today's coverage. **Genuinely still open, lowest-urgency-first:** state
gazette/law-department portals (zero states checked), indiacode state-Act
structure confirmation, remaining tribunal doctypes (CCI/TDSAT/GSTAT/AFT),
and whatever NEW1 produces once its retrieval jobs finish (`
NEW3_ACQUISITION_QUEUE.json` — checked twice this session, not yet written).

---

## Session 4 — 12 Aug 2026, continuing autonomously per the founder's explicit
## continue-and-do-not-stop instruction

**Read `docs/LANE_PROTOCOL.md`'s bus fresh — no new NEW1 acquisition-gap
traffic yet, their retrieval jobs (bus 0088) still running.** Checked for
`NEW3_ACQUISITION_QUEUE.json` — still absent. Proceeded with the source-map
and gap-analysis work the brief calls for regardless, rather than waiting.

**Four real pieces of work landed:**

1. **`docs/COVERAGE_GAP_MATRIX.md` — new.** Live `judgments` count by court
   joined against the AWS parquet source totals already measured in
   `HC_CORPUS_SURVEY.md`. Total: 407,331 held of 15,809,917 source
   documents (2.576%), Supreme Court effectively complete (99.977%).
   **Two real findings, sent to the ring, not actioned by this lane:**
   Himachal Pradesh and Jammu & Kashmir are at 0.004%/0.002% held despite
   being mid-sized sources — looks like an ingest-scheduling gap, not a
   source problem, flagged to NEW2. Uttarakhand's holding stops at 1987 and
   Gujarat's at 1995 — both courts' last ~25-30 years are completely
   unheld, a more urgent gap than the raw percentage shows.
2. **`external_citations` staleness, measured precisely.** Re-ran the
   missing-authority query expecting new numbers from the corpus's growth
   (312,373 → 407,331 judgments this session alone) and got byte-identical
   results — the tell. Confirmed: no new row since 2026-08-11T00:34:11Z;
   372,572 judgments (the bulk of the corpus) were ingested after. Flagged
   to LCC — this is the correct discipline from §4 of the new brief
   ("never send a ranking failure... as if it were a missing document"):
   this isn't a missing-authority finding at all, it's a stale-measurement
   finding, and conflating the two would have meant reporting the wrong
   thing to the wrong lane.
3. **State legislation, genuinely advanced.** Maharashtra's Law and
   Judiciary Department fetched directly — real, ~180+ Acts, 1952–2026,
   per-Act PDF, no auth needed. UP and Tamil Nadu found (dedicated gazette
   portals) but not fetched. PRS Legislative Research confirmed to host
   real primary gazette PDFs (not just commentary) under its bill-tracking
   pages — a convenience mirror, not yet confirmed as a systematic index.
4. **Tribunal coverage closed out.** CCI, TDSAT, NGT, AFT all confirmed
   real via live IndianKanoon doctype URLs (market intel, not the
   acquisition path). GSTAT is not a research gap at all — the tribunal
   only began operating 16 Feb 2026; there is negligible case law anywhere
   to acquire yet, a "revisit in 12-18 months" item.
5. **`docs/ACQUISITION_MANIFEST.json` — new, the first genuinely
   machine-readable handoff** per the brief's §6 schema (source, scope,
   court/jurisdiction, year range, document type, volume, identifiers,
   method, provenance, priority, dedup key, status, failure reason). Six
   entries: three Supreme Today priority tiers (all `BLOCKED_ON_FOUNDER`),
   the ECT (`BLOCKED_ON_TOOLING` — a genuinely different status, since it's
   not a founder decision, it's a fetch capability nobody has), IndianKanoon
   (`NOT_AUTHORIZED`, declined, recorded so it can't be re-proposed a third
   time), and Maharashtra state Acts (`NOT_AUTHORIZED` pending a scoping
   decision that hasn't been asked for, but fully verified and ready the
   moment it is).

**Sent to the ring:** bus 0098-0101 (gap matrix + staleness findings).
`ACQUISITION_MANIFEST.json` referenced there; not re-sent separately since
0098-0101 already point at the relevant docs and NEW2 reads `docs/**`
directly per the ring's own convention.

**Next, in priority order:** (1) watch for NEW1's actual gap-analysis
traffic — the ring's designed input, still silent; (2) UP and Tamil Nadu
gazette portals, fetched rather than search-inferred; (3) the remaining
27 states/UTs, systematically, if the founder ever scopes a state-
legislation acquisition program; (4) re-check `external_citations` recency
periodically — this lane's own missing-authority numbers are meaningless
until it moves.

**A sixth finding, made confirming the ECT and worth its own record: a
second Supreme-AI/Supreme-Today-shaped terminology split, this time on
"e-SCR."** `docs/SOURCE_REGISTRY.md` §5d has the full account. Short
version: `AGENT_BROWSER.md`/`RESEARCH_2026-08-11.md` retracted "eSCR" as a
CAPTCHA-gated dead end with no SCC/AIR field; four *other* docs
(`COMPETITIVE.md`, `COMPETITIVE_TEARDOWN.md`, `SUPREME_TODAY_LICENCE.md`,
`BHARAT_LAW_OFFER.md`) describe "e-SCR" as a free, working, already-useful
source of ~34,000 official Supreme Court headnotes. **Not resolved this
session** — reasoned through to a likely reconciliation (CAPTCHA blocks
bulk automation, not human lookup; the concordance retraction and the
headnote-value claim are about two different uses, not a contradiction) but
labelled INFER, not KNOW, and no fetch was made to confirm `scr.sci.gov.in`
still behaves as described. Recorded rather than acted on — same discipline
as the Supreme AI question, and this one is still open pending a real
fetch.

---

## Session 5 — 13 Aug 2026, "expand your work, think out of the box"

**Read the bus fresh first — the ring had moved substantially overnight.**
NEW2 acted on the HP/JK/Uttarakhand/Gujarat finding (bus 0102, dedicated
`--court` workers now running). LCC verified and fixed a deeper cause
behind the citation staleness finding (bus 0106) — 376,464 documents had
never been citation-scanned at all, and the pass was reading the corpus
newest-first (mostly 2026 bail orders) instead of by substance. **NEW1 ran
its first real feedback-loop measurement** (bus 0107/0110): 288 gold
queries, **zero acquisition gaps, 83.1% of failures are retrieval/ranking**
— confirming this lane's own discipline (unresolved ≠ missing) was correct,
and that `NEW3_ACQUISITION_QUEUE.json` (repo root) legitimately holding `[]`
is the honest result, not an empty placeholder.

**Corpus had grown to 579,840 judgments** (from 407,331 the previous
session) by the time this session queried it — confirming `external_citations`
specifically (not `judgment_citations`, which LCC's fix addressed) is
**still** stuck at 2026-08-11T00:34Z, unaffected by LCC's backlog pass.
Flagged as a precise correction, not a new complaint — the two tables are
easy to conflate and this session nearly did too before checking directly.

**Two genuinely new, high-value findings, both escalated:**

1. **`docs/TREATMENT_GRAPH_GAP.md` — the highest-priority finding this lane
   has produced.** Queried `judgment_citations` for treatment relationships
   (not plain `cites`) with an unresolved target: 34 rows across
   `overruled`/`overruled_in_part`/`doubted`, every one Supreme-Court-citing-
   Supreme-Court in SCC/AIR/SCR form. Given the SC corpus is 99.977%
   complete, most targets are very likely already held under a different
   citation form — meaning a currently-held judgment could be rendering as
   live good law when it was actually overruled by a case we hold, unlinked.
   This is `CLAUDE.md`'s own zero-threshold failure mode, not a generic
   coverage gap. **Did not attempt to identify any target from memory** —
   listed as a priority queue for LCC's existing concordance tooling, never
   as a set of claims about what the targets are. Sent bus 0111-0114.
2. **The Constitution of India: zero rows in `statutes`.** Confirmed live
   (845 total rows, none matching). Free on indiacode
   (`handle/123456789/16124`), but a PDF bitstream like the already-known
   IPC/CrPC gap — same missing parser, not a licensing question. Sent bus
   0115-0118.

**What "think out of the box" produced, concretely:** both findings came
from querying dimensions of the citation graph this lane hadn't looked at
yet (treatment-type-specific resolution, not generic citation resolution;
a specific well-known document's absence, not a source-category sweep) —
narrower and more targeted than the broad source-cataloguing of sessions
1-4, and both landed on real, actionable, previously-unrecorded gaps rather
than re-describing what earlier sessions already found.

**State at end of this pass:** ring is healthy and self-correcting (NEW2
and LCC both acted on prior findings same-day). This lane's own
`MISSING_AUTHORITY_QUEUE.md` ranking is still built on stale
`external_citations` data — not re-ranked this session, per LCC's own
advice to wait. Next session should check whether `external_citations`
has moved before trusting that queue's numbers, and watch for a response
on the treatment-graph priority list.
