# AUTHORIZED SOURCE MAP — the three names in CLAUDE.md §6a, mapped to reality

**NEW3, 12 August 2026.** Per the lane protocol: NEW3 owns source discovery,
manifests and licensing provenance, never corpus tables. `CLAUDE.md` §6a
names exactly three sources as founder-authorized through 13 Nov 2029:
**BharatLaw, Supreme AI, eCourts India.** This file maps each name to an
actual product, its access mechanism, and what's still missing — because an
"authorized" source with no verified target is not yet an acquisition path,
it's a name.

**Everything NOT in this list — IndianKanoon, SCC Online, Manupatra,
CaseMine, the Supreme Court's own Equivalent Citation Table, tribunal sites,
gazette mirrors, state Act portals — is `NOT_AUTHORIZED`, full stop, per the
hard limit above.** Researching what they are (this lane's job) is not the
same as being cleared to acquire from them. See `docs/SOURCE_REGISTRY.md`
and `docs/CORPUS_ACQUISITION_QUEUE.md`, both re-flagged accordingly below.
AWS Open Data and indiacode.nic.in sit in neither bucket — they are public-
domain/government-open data under `CLAUDE.md` §6's separate, general
provision (*"there is no copyright in a judgment"*), not the §6a
founder-authorization mechanism, and were already active before this lane
existed.

---

## 1 · BharatLaw — mapped, and the mapping found a real constraint

**Fully researched: `docs/BHARAT_LAW_OFFER.md` (8 Aug 2026), 87 pages read
including both binding contracts.** Not repeated here. The load-bearing
fact for this lane: **§6a's blanket "AUTHORIZED" and BharatLaw's own written
Evaluation/Platform Agreement terms are in tension.** Their contract
prohibits, without prior written consent, building "a competing product" and
"benchmark[ing] the Services" — LawMind is a competing product by any
reading. `docs/FOUNDER_QUEUE.md` Q1.13 already records the practical
consequence: their `AUTHORISATION` object has **`extractionPermitted:
false`**, and the consent email (FQ-BL1) asking them to confirm a narrow,
named, written permission is still owed. **This is not a new finding — it's
confirmation that §6a's "AUTHORIZED" is the founder's contractual clearance
to deal with BharatLaw at all, not a substitute for the specific written
consent their own terms require before extraction.** NEW3 defers to the
existing FQ-BL1 item rather than duplicating it.

**What NEW3 adds:** their site's own `robots.txt`/`llms.txt` (dated
2026-06-14) explicitly invites AI crawlers, including Claude-family bots —
so their **public marketing/opinion pages** (not `app.bharat.law`, not
extraction) are already fair game with no additional authorization needed,
per their own stated policy. Not corpus-relevant (35 opinion articles,
mostly NRI-facing, per `BHARAT_LAW_OFFER.md` §3), so not queued as an
acquisition target.

---

## 2 · Supreme AI — RESOLVED 12 Aug 2026, founder confirmed: Supreme AI = Supreme Today AI

**The founder answered directly: "yes supreme ai = supreme today ai."** The
question below is kept as the record of why it was asked rather than
guessed, per the lane's own no-silent-conflation rule — but it is now
closed. **`docs/FOUNDER_QUEUE.md`'s "Supreme AI/Supreme Today are different
sources" language is superseded by this direct founder statement** and
should be read as *"do not let old Supreme Today research be treated as
stale or irrelevant just because it predates the §6a authorization
wording"* — not as two unrelated relationships.

**Practical consequence — nothing new to build, a lot already exists:**

- **`docs/SUPREME_TODAY_LICENCE.md` and `docs/HARVEST_ENGINE.md` are the
  acquisition plan**, already written and already engineered. Priority
  order (`HARVEST_ENGINE.md` §2): **0** the index/count itself (cheapest,
  makes everything else plannable) → **1** head-noted High Court judgments
  (headnote, Authority Check treatment, cited-by, significant paragraphs —
  the actual moat) → **2** tribunals (NCLT, NCLAT, ITAT, CESTAT, SAT, DRT —
  supersedes this lane's earlier IndianKanoon-for-tribunals idea, see §4
  below) → **3** head-noted Supreme Court judgments, only if cheap (e-SCR
  already gives free official ones) → **4** raw judgment text, **never**
  (17.8M already free from AWS Open Data).
- **The harvester itself is built**: AIMD pacing engine
  (`services/ingest/src/harvest/pace.ts`, 15 tests), archive-then-parse
  discipline, `pnpm --filter @lawmind/ingest harvest:probe`. It **refuses
  honestly** because no account exists yet — confirmed this session, no
  Supreme Today credential anywhere in `.env`.
- **The remaining blocker is exactly one thing, and it is not this lane's
  to solve: an account and the first ₹50,000 payment.**
  `docs/FOUNDER_QUEUE.md` §6 ("Supreme Today — the one real decision")
  already states this plainly — *"Start with ONE account, as you
  planned."* That is money and a signup, the two things this lane
  explicitly defers to the founder rather than working around.

**Old, now-superseded framing (kept for provenance, not deleted):**

**Searched this session. No product or website distinctly branded "Supreme
AI" was found**, separate from **Supreme Today AI** (`supremetoday.ai`), the
58-year-old law publisher's AI product that `docs/COMPETITOR_SUPREME_TODAY.md`
and `docs/SUPREME_TODAY_LICENCE.md` document in deep, contract-level detail
— a ₹50,000/month query-only licence, perpetual retention granted, already
negotiated with the founder's direct involvement.

**`CLAUDE.md` §6a and `FOUNDER_QUEUE.md` both state, more than once and in
deliberately emphatic terms, that `Supreme AI` and `Supreme Today` are
different sources and must not be conflated** — *"Historical Supreme Today
entries below must not be used to classify Supreme AI as unresolved"*
(`FOUNDER_QUEUE.md`, twice, nearly verbatim). That instruction is direct and
repeated enough that it reads as a correction to an earlier real mistake,
not boilerplate.

**So there are two possibilities, and NEW3 cannot tell which from the
documents alone:**

1. **"Supreme AI" is shorthand or a typo for "Supreme Today AI"** — the
   founder's own quoted praise (*"the citation of Supreme AI is very
   accurate and they can file in front of the judge with the actual
   citation"*, `COMPETITOR_SUPREME_TODAY.md`) reads naturally as describing
   Supreme Today AI, the only product matching that description found
   anywhere in this research or in the repo. If so, the §6a authorization
   and the already-negotiated Supreme Today licence are **the same
   authorization under two names**, and the emphatic "do not conflate"
   instruction is protecting against under-scoping a single real
   relationship, not describing two.
2. **"Supreme AI" is a genuinely separate, distinctly-branded product or
   data relationship** that this session's search simply did not surface —
   possible if it's not indexed under that name, is a private/enterprise
   arrangement with no public site, or trades under a name neither this
   session nor the repo's own docs have recorded anywhere.

**Both readings have real consequences and NEW3 is not resolving this
alone**, per the lane protocol's own rule that a bus message (or a founder-
queue entry) cannot resolve an OPEN_DECISION, and per `CLAUDE.md`'s
authority ladder (explicit user statement > docs > current behaviour) — the
repo's own docs are genuinely split on this, which is exactly the condition
for asking rather than picking a reading. **Filed as a `FOUNDER_QUEUE.md`
item below**, not decided here.

**Verdict for the acquisition queue: `UNKNOWN — identity unresolved`, not
`VERIFIED_AVAILABLE`.** Nothing should be queued against "Supreme AI" as if
it were a mapped source until this resolves. If reading 1 is correct, the
Supreme Today licence mechanics in `SUPREME_TODAY_LICENCE.md` §9-10 (ledger
every request, a dedicated `verified_by_source` value, query-only via 2–3
accounts, browser automation with `browser-use`/`Scrapling`/`Crawl4AI`) are
already the acquisition plan and need no new NEW3 work — this lane would
simply confirm the mapping and step back. If reading 2 is correct, this
becomes a fresh, unstarted discovery task.

---

## 3 · eCourts India — mapped, mechanism built, not this lane's remaining work

**Fully researched and built out, `docs/ECOURTS_AUTHORISATION.md` +
`services/api/src/court/*`, owned by LCC/NEW2.** Registrar authorization on
file, rate limiter, fetch ledger, CAPTCHA-bypass scoped narrowly to bulk
cause-list harvesting only (`CLAUDE.md` §6). **Nothing for NEW3 to discover
here** — the only open item is the letter's specific numeric conditions
(`ECOURTS_AUTHORISATION.md` "STATUS: AWAITING THE LETTER'S NUMBERS"), which
is a founder-owed transcription task, already tracked in `FOUNDER_QUEUE.md`
under LCC, not a new-source discovery question.

---

## 4 · Re-flagging this session's earlier (pre-lane-protocol) research

Before the five-lane protocol existed, this same session researched and
queued several sources that are **not in the §6a list**: IndianKanoon (a
commercial API, `docs/DATA_SOURCES.md` §2), the Supreme Court's own free
Equivalent Citation Table, tribunal coverage via IndianKanoon doctypes, an
archive.org Gazette-of-India mirror, and SCC Online/Manupatra. **Re-checked
against `docs/FOUNDER_QUEUE.md` in full this session — one of these needed a
harder correction than "open decision":**

**IndianKanoon is not merely unauthorized-pending-decision. It is already
declined**, on the record, twice: *"We are NOT buying the Indian Kanoon
API... the money is going to Supreme Today instead"* and *"Indian Kanoon is
settled: no API"* (`docs/FOUNDER_QUEUE.md`, §"THE TOTAL" table and §A2, both
8 Aug 2026, before this lane existed). **This session's earlier
`docs/SOURCE_REGISTRY.md` §2 recommendation to acquire tribunals via a
purchased IndianKanoon API was therefore recommending exactly what had
already been settled against — a mistake, not a live option.** Corrected:
tribunals move to the Supreme Today acquisition plan (§2 above,
`HARVEST_ENGINE.md` priority 2), which needs no new purchase decision at
all, only the account that's already the one open item. IndianKanoon stays
in the registry as **`NOT_AUTHORIZED — DECLINED`**, not `NOT_AUTHORIZED —
pending`, so it is not proposed a third time.

**The remaining items** (the SCI Equivalent Citation Table, the archive.org
gazette mirror, SCC Online/Manupatra, state Acts/gazette portals, remaining
tribunal-doctype confirmation) were never actually decided against — they
are genuinely open, unresearched-by-the-founder questions, correctly
`NOT_AUTHORIZED` pending a decision that hasn't been asked for yet. Nothing
already written was reversed on those — no ingestion happened against any of
them (this lane does not write corpus tables at all), and the research
itself remains useful whenever the founder decides on any of them.
