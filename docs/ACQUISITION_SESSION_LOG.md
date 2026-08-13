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

---

## Session 6 — 13 Aug 2026, "check the bus, expand research, find hooks/skills/workflows, push everything"

**Read the bus first, as instructed — LCC had moved to orchestrator role**
(bus 0128/0131/0135/0141) and given this lane two concrete, blocking asks
directly: the Constitution PDF's structure (needed to build the parser),
and whether the 13 no-candidate overruled edges are extraction failures or
genuine absences (*"that distinction is your lane's core question and I
cannot answer it from inside the corpus"*). Both resolved this session,
both hands-on rather than inferred:

1. **Constitution structure — fully verified, not just discovered.**
   `indiacode.nic.in` blocked this session's fetch tools a third time (403
   on both the handle page and the bitstream PDF). Routed around it: found
   the same official document on a different government CDN
   (`cdnbbsr.s3waas.gov.in`), downloaded it, and extracted the actual text
   with the repo's own `pdftotext` (on PATH) rather than trusting
   `WebFetch`'s unreliable raw-binary PDF summary — which had itself
   given an uncertain, hedged non-answer on the first attempt. Confirmed
   from the real extracted text (10,512 lines): one continuous PDF,
   Preamble through Part XXV, all twelve Schedules in the same file,
   cleanly numbered Articles, official Ministry of Law and Justice
   edition current to the 106th Amendment. One real complication found
   and flagged: it's a diglot Hindi/English edition and plain `pdftotext`
   mangles the Hindi. Sent to LCC (bus 0143-0146); `CORPUS_ACQUISITION_QUEUE.md`
   updated with the full verified shape.
2. **The 13 no-candidate overruled edges — externally verified, 3 of 4
   sampled confirmed as real landmark judgments.** Checked citation texts
   against real news/case-law coverage of the actual overruling events
   (never this lane's own recall). `AIR 1968 SC 662` = S. Azeez Basha v.
   Union of India (what AMU 2024 overruled, 4 independent sources).
   `(2005) 1 SCC 394` = E.V. Chinnaiah v. State of A.P. (what Davinder
   Singh 2024 overruled, confirmed by SCC Online's own blog). `(1990) 1
   SCC 109` = Synthetics and Chemicals Ltd. v. State of U.P. One,
   `(1996) 5 SCC 670`, stayed genuinely inconclusive — the citing
   judgment (Mineral Area Development Authority) is confirmed to have
   overruled a *different* citation (India Cement, (1990) 1 SCC 12), so
   this one specifically needs LCC's own source-text tool, not more
   external search. `docs/TREATMENT_GRAPH_GAP.md` §3b has the full table
   and method note. Sent alongside the Constitution answer.

**Then the founder's separate, explicit ask: research external
skills/hooks/workflows that could improve how the five agents work —
meta, not legal data.** `docs/AGENT_WORKFLOW_RESEARCH.md`, new. Two
findings, both tied to real pain already logged on this project's own
bus rather than generic best-practice advice: (1) a public GitHub issue
(anthropics/claude-code #76727) independently measured the exact
collision risk this project's shared-working-tree, five-session setup is
exposed to — 44% of writes going astray in a comparable heavy-user's
30-day sample — and the critical design lesson if a lane-boundary hook is
ever built (key on write target path, never session cwd, plus a documented
class of silent-failure bugs to test against first); (2) a documented
shared-rate-state file-lock pattern (`rate-pool.json`/`rate-state.json`,
traffic-light zones, heartbeat-based crash recovery) that would mechanise
`LANE_PROTOCOL.md`'s current "announce on the bus before a large batch"
InferX rule, in the same filesystem-as-bus idiom this project already
uses. Also recorded what was checked and correctly NOT recommended
(HiveMind's fuller scheduler — overkill at 5 lanes; git worktrees —
already a live, deliberately-deferred decision in `FOUNDER_QUEUE.md`, not
reopened). Sent to all lanes (bus 0147-0150), explicitly framed as
LCC's to build or decline, not this lane's to implement.

**Nothing written to any corpus table this session, as always.** Six new/
updated docs, four bus sends, zero code changes, zero writes outside
`docs/**` and the ephemeral scratch scripts already cleaned up.

---

## Session 7 — 13 Aug 2026, "check lanes, check messages for NEW3, understand all agents' work"

**Read the full bus since the last check** (0122 through 0171) rather than
just the newest messages — the founder's ask was to understand the whole
ring, not just react to the latest one. Absorbed: the Constitution landed
in production (467 Articles, three real parser defects LCC caught and
fixed, Schedules/appendices deliberately left unparsed); the 13
no-candidate overruled edges got independent confirmation from both
directions (this lane's external checks and LCC's internal tool agree:
"held but unaliased"); a serious DNS root-cause chain played out across
three lanes (NEW2 found it, LCC found two more wrong turns —
`connect_timeout` doesn't help, `dns.setServers()` doesn't either — before
the real fix, `services/ingest/src/db-host.ts`'s `openDb()`, landed); and
the founder's explicit meta-ask to the whole ring: report solutions, not
just findings.

**Answered LCC's direct new ask (bus 0166): spot-check the 446
`quoted_or_argued` treatment rows as an adversarial seed.** Found a real
SQL gotcha worth recording for the ring: `document_enrichments.parsed_output`
is a jsonb column holding a **JSON string, double-encoded** — `->`/`->>`
access silently returns null rather than erroring, which cost several
failed queries before finding it (`jsonb_typeof` showed `"string"`, not
`"object"`). Fix: unwrap with `(parsed_output #>> '{}')::jsonb` first.
Passed this along on the bus since it will bite the next person who
queries this table.

**Found a genuine, concrete misattribution, not just a clean bill of
health.** Of 466 quoted_or_argued claims, checked the two `overruled`
ones externally. One (World Sport Group v. MSM Satellite) confirmed
accurate. The other — Hariharan v. Harsh Vardhan Singh Rao (2022) —
extracted as *"overruled N.R. Parmar,"* but multiple independent sources
say N.R. Parmar was actually overruled by **K. Meghachandra Singh v.
Ningam Siro (2019)**, and Hariharan (2022) only discusses/applies that
already-settled fact. **Both judgments are already held in the corpus**
(checked directly), so if this edge is ever promoted, this is immediately
fixable without any acquisition — a concrete instance of exactly the
misattribution-to-the-wrong-citing-judgment risk LCC's own research had
flagged as a class of risk, not yet as a specific example. Sent to the
ring, bus 0172-0175.

**Practised the founder's "share solutions" ask on myself, not just cited
it:** adopted `openDb()`'s DNS-bypass logic inline in this session's own
scratch scripts (`services/ingest` isn't importable standalone from
`packages/db`, so replicated the resolver-bypass pattern rather than the
file) — no DNS deaths this session, and said so on the bus rather than
silently benefiting from someone else's fix.

---

## Session 8 — 13 Aug 2026, "widen your internet search, pull more useful data"

**Checked the bus first** — one new message since the last check (LCC's
0180, a self-reported near-miss on swapping DeepSeek for a weaker local
model, and a real distinction worth remembering: verification catches
fabrications, never catches omissions, so a weaker model would produce
silently thinner data that all looks clean. Informational, nothing
actionable for this lane).

**Then widened research on three fronts, all resolved with direct
fetches rather than left as inference:**

1. **e-SCR/`scr.sci.gov.in` — closed for good.** Fetched directly
   (succeeded where `main.`/`www.sci.gov.in` are blocked — a different
   subdomain, different result). Confirmed hands-on: CAPTCHA present,
   search form offers only SCR and Neutral Citation fields, no SCC, no
   AIR. This upgrades the earlier reconciliation from inference to fact —
   e-SCR is genuinely useful for human lookup-by-known-citation and
   genuinely useless for the SCC/AIR concordance problem, at the same
   time, confirmed rather than reasoned to.
2. **UP and Tamil Nadu gazette portals, fetched directly** (previously
   only found by search). Both real, official, current — TN specifically
   showing issues through 12 Aug 2026.
3. **Scoped LCC's open Schedules question** (left open in bus 0158 as "a
   clean follow-up with its own shape if you think it earns one"). Found
   the Seventh, Ninth and Tenth Schedules are independently confirmed as
   among the most litigated parts of the Constitution — Seventh is what
   the mineral-royalty case in `TREATMENT_GRAPH_GAP.md` itself turns on,
   Tenth (anti-defection) is actively and currently litigated. Recorded
   as a recommendation, not a decision.

**Then the highest-value find of this round: fetched Supreme Today AI's
own public tribunal-coverage filter directly** — the vendor's own claimed
scope for the one acquisition target this lane can actually act on, not
third-party market intel. Confirmed NGT, TDSAT and CAT are covered
(broader than `HARVEST_ENGINE.md`'s original stated list), and surfaced
two genuinely new categories nobody had named anywhere in this repo
before — **RERA** and **Central Information Commission (RTI appeals)** —
both real, both worth adding to the priority-2 ask. CCI and AFT do not
appear on that specific page; reported as a real open question rather
than assumed either way in either direction.

Sent to all four lanes across two messages (bus 0181-0184, 0185-0188).
`SOURCE_REGISTRY.md` and `CORPUS_ACQUISITION_QUEUE.md` both updated; found
and fixed a small duplication left over from an earlier session's partial
edit while updating the tribunal table. No corpus writes, no code changes.

---

## Session 9 — 13 Aug 2026, "check lane messages and continue working"

**A real infrastructure fix landed mid-backlog: the wake/delivery hook had
a bug (`tr -cd 'A-Za-z'` was silently deleting the digit from `NEW1`/`NEW2`/
`NEW3`, so none of the three ever received automatic delivery — `LCC`/`RCC`
have no digits, so the bus looked healthy for weeks while three of five
lanes were never actually being woken).** Fixed by LCC (bus 0191), and a
new Stop-hook now keeps the ring self-sustaining — a lane is handed
waiting mail before it's allowed to go idle. Read the full backlog this
unlocked (0189-0201) rather than reacting to only the newest message.

**Two corrections accepted from LCC, both genuinely useful, both
integrated rather than defended:**

1. **The Schedules priority order was inverted.** This lane's own
   recommendation (bus 0181/0185) ranked the Tenth Schedule (anti-
   defection) first on litigation salience. LCC measured actual corpus
   frequency instead: Seventh Schedule is cited in **1,200 SC judgments
   (3.13%)**, Ninth in 142 (0.37%), Tenth in only 82 (0.21%) — 52× the
   gap this lane's unmeasured first pass implied. **Corrected in
   `SOURCE_REGISTRY.md` §5e**, with the general lesson recorded for this
   lane's own future prioritisation: corpus frequency, not news salience,
   predicts what a parser is actually worth building for.
2. **A ring-wide methodology warning (0196/0197): `LIMIT n` without
   `ORDER BY` on `judgments` returns physical/ingestion order, which on
   this corpus means one court (Allahabad).** LCC nearly declined the
   Schedules request entirely on exactly this artefact before catching it.
   **Self-audited this lane's own queries in response**, reported honestly
   on the bus (0203): the aggregate `GROUP BY` queries are safe by
   construction, but a few "pull some real examples" spot-check queries
   used `ORDER BY created_at LIMIT n`, which isn't the identical bug but
   isn't provably court-diverse either — flagged rather than claimed clean
   by default.

**Closed a real loop end to end.** Re-checked the four courts this lane
originally flagged (HP/JK near-zero, Uttarakhand/Gujarat stale-cutoff,
session 4): all four are now fixed — HP 8→28,888, J&K 2→30,822,
Uttarakhand 190→37,674 (now reaches 2026, was stuck at 1987), Gujarat
497→24,712 (now reaches 2026, was stuck at 1995). Corpus grew
407,331→817,428 in the same window. `COVERAGE_GAP_MATRIX.md` updated.
This is the first time this session a finding->fix->re-verify loop has
been confirmed complete, which is the actual point of the five-lane ring.

**Also refreshed, no change in conclusion:** `external_citations` is still
frozen at 2026-08-11T00:34Z — 2+ days stale now against a corpus that has
grown ~2.6× since the freeze point, confirming (not just repeating) that
`MISSING_AUTHORITY_QUEUE.md` stays un-re-ranked. Tried LCC's suggested
"citations without statute refs" cross-reference as a sharper hunting set;
measured 60.8% of citing judgments qualify, reported the number plainly
rather than assuming the suggestion was applied correctly.

**Practised the new "send per unit of work" discipline** (bus 0201)
directly rather than only citing it: four separate messages this session
instead of one batched summary at the end (0203-0206, 0207-0210).

---

## Session 10 — 13 Aug 2026, "add a schedule wakeup every 5 minutes to
## check new lane messages and continue working"

**Scheduled a recurring 5-minute check** via the `/loop` skill → `CronCreate`
(job `fa2c422c`, `*/5 * * * *`, session-only, auto-expires after 7 days).
This is the correct complement to the Stop-hook wake mechanism LCC shipped
(bus 0201) — the hook keeps an *active* session from going idle with mail
waiting, but per LCC's own account cannot restart a session that has
already gone quiet. The cron fills exactly that gap.

**Ran the check immediately rather than waiting for the first fire, and
found the best result this queue has had.** LCC resolved the one citation
this lane had left inconclusive three sessions ago — `(1996) 5 SCC 670`,
cited by MADA v. SAIL as overruled. It is **P. Kannadasan v. State of
Tamil Nadu** (1996 INSC 800), already held, currently rendering as live
good law. `docs/TREATMENT_GRAPH_GAP.md` §3b closed out with the real
answer.

**Two findings behind that one, both recorded, neither built by this
lane:**

1. **A systemic extraction bug**: `– overruled.` closes a semicolon-
   separated GROUP of citations in MADA's text, and the extractor only
   attached the relationship to the last one — silently missing every
   earlier case in the same group. 45 judgments affected, true missed
   population plausibly "low hundreds." LCC has proposed a report-only
   pass before any extractor change, correctly, per `RING_PROGRAM.md`
   §2a's test-before-rewrite rule.
2. **The best find of the whole program so far: 656 judgments already
   print paired `S.C.R. : SCC` citations in their own text** — the exact
   concordance mapping this lane has been chasing externally all week
   (IndianKanoon, the ECT, e-SCR). Free, already held, no fetch, no
   licensing question. **Re-prioritised the acquisition queue on the
   spot**: this internal source now ranks P0, ahead of the Supreme
   Court's own Equivalent Citation Table (demoted to P1, fallback for
   whatever the internal harvest doesn't reach). Updated
   `CORPUS_ACQUISITION_QUEUE.md`, `MISSING_AUTHORITY_QUEUE.md` §1b,
   `SOURCE_REGISTRY.md` §5a-pre. **Not building the harvester** — that's
   extraction/enrichment, explicitly LCC's territory, and LCC has already
   scoped it correctly (deterministic, provenance-tagged, human-read
   before any write).

Also read NEW2's worker-attrition closure (0224, informational — 9 of 24
dedicated court workers were silently down, root-caused via CPU-sampling
not log-staleness inference, all restarted, one near-miss double-launch
caught and recorded as a reusable pattern). Nothing needed from this lane.

Sent one consolidated bus message (0225-0228) rather than several small
ones, since all three findings shared one root cause and splitting them
would have cost the ring more messages for no clearer signal.

**Second cron fire, same session window: answered LCC's direct question
(bus 0214) — why does the founder's 20.5M target exceed the ~17.8M AWS
High Court dataset by ~2.7M?** Checked LCC's own hypothesis (Supreme Court
+ tribunals + other platforms) against real numbers rather than accepting
it: SC is ~38,351 (already 99.98% held) and tribunals are estimated "tens
of thousands, not millions" — together well under 1% of the 2.7M gap, so
the hypothesis does not actually close it. Searched for where "20.5M"
itself might originate; found nothing definitive. Confirmed the one
category that *would* close a gap this size — NJDG district-court orders,
~33M, real — is explicitly out of scope per `RING_PROGRAM.md`, and did
**not** assume the founder's figure silently includes it. Reported the
honest result: unexplained, not attributable to any authorized source,
recorded in `COVERAGE_GAP_MATRIX.md` §3b and sent directly to LCC (0229)
rather than broadcast, since it was a direct reply to a direct question.

---

## Session 11 — 13 Aug 2026, "continue use internet deeply research" +
## the founder's explicit priority directive

**Given a five-point priority directive covering the whole lane's remit**
(coverage measurement, corpus-frequency-not-salience ranking, the
external_citations re-rank gate, unresolved≠missing discipline, consuming
NEW1's classification output, continued source discovery, authorization
preservation, and manifest discipline) — all of which were already this
lane's standing practice, confirmed rather than newly adopted. One
specific new instruction: **investigate the in-corpus SCC↔SCR paired-
citation evidence before treating the 34 unresolved overruled targets as
externally missing.**

**Did that investigation properly, independently of LCC's own tool.**
Used `judgment_citations`' existing char_offset data (indexed, no
full-text scan — deliberately avoiding the exact mistake this ring has
already been burned by twice) to check whether each of the 34 targets has
a nearby S.C.R.-form citation in the same judgment, then pulled targeted
text windows (specific offsets, not a broad scan) to confirm genuine `X :
Y` adjacency rather than coincidental proximity in these grouped-citation
passages. **Result: 13 of 34 confirmed — matching LCC's own resolver's
count exactly, via a completely different method.** Two independent
techniques converging on the same number is real evidence, not
coincidence. Also caught, live, a concrete instance of the exact
page-header-interpolation trap LCC had only described in the abstract:
`(2014) 11 SCC 381`'s nearest "SCR citation" was a PDF page-header
artifact, not a real pairing. `TREATMENT_GRAPH_GAP.md` §3d.

**Then genuinely widened research per the explicit "deeply research"
instruction, resolving two things left as open questions in earlier
sessions:**

1. **CCI and AFT are both confirmed covered by Supreme Today after all.**
   An earlier session's finding that they were "absent" was a false
   negative from checking only one filter page of the vendor's product —
   a direct search found real, structured coverage of both (AFT uses a
   systematic document-ID prefix, clear evidence of deliberate coverage,
   not incidental mention). Both move from open question to confirmed.
2. **Two more state gazette/law-department portals identified**
   (Karnataka, Delhi) — found by search, not yet fetched directly. 5 of
   ~36 states/UTs now mapped.

Checked the standing gates before doing any of the above: `external_citations`
still frozen (now against 842,508 judgments, up from 407k three sessions
ago — the gate itself hasn't moved, just the corpus it's measured
against), `NEW3_ACQUISITION_QUEUE.json` still empty. Both confirmed, not
assumed unchanged.

Sent three bus messages this pass (0230, 0231-0234) rather than batching.
`SOURCE_REGISTRY.md`, `CORPUS_ACQUISITION_QUEUE.md`, `TREATMENT_GRAPH_GAP.md`
all updated. No corpus writes, no code changes, scratch scripts cleaned up
after each use.

---

## Session 12 — 13 Aug 2026, direct correction from LCC

**LCC asked this lane directly to update a figure this session had
recorded from LCC's own earlier estimate**: `TREATMENT_GRAPH_GAP.md` said
"45 judgments, low-hundreds plausible missed population" for the
grouped-marker bug; LCC has now built and run the report-only pass (three
versions — the first two would have marked real landmark judgments,
including Shayara Bano and Kihoto Hollohan, as overruled, caught before
shipping) and measured **22, not low-hundreds**. Updated
`TREATMENT_GRAPH_GAP.md` §3c with the corrected figure and the full v1/v2
near-miss story, since the story is worth more than the number alone.
Acknowledged on the bus (0237). This is the older, superseded figure this
session's own earlier log entries still carry (session 9) — left as
historical record rather than rewritten, per this repo's own convention.
