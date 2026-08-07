# ASO — APP STORE OPTIMISATION

**App store discovery is the primary acquisition channel.** Advocates are not
found through content marketing or paid social; they search the store for "case
status" and install what ranks. Nothing existed for this workstream before
1 Aug 2026.

> **No volume or difficulty figure appears in this file.** Every number below is
> marked `UNKNOWN — requires tool`. Inventing keyword volumes would be worse than
> having none, because a fabricated number gets planned against. **OD-9** covers
> tool selection.

---

## 1 · Competitor teardown — done, 8 Aug 2026, Play Store only

All five researched on the **Play Store listing** (`play.google.com/store/apps/details`).
None was tested hands-on — everything below is what the listing itself shows, not
usage. **iOS App Store covered separately, §1b** — all five list there too, and
the two stores' fields are different enough (see the note under the table) that
mixing them into one row would blur which platform said what.

**A methodology note, because it shapes how much to trust the "not shown" cells:**
the Play Store listing itself is a JS app that neither a direct fetch nor the two
APK-mirror sites tried (`apkcombo.com`, `apkpure.com`) would render from this
network — both connections were refused outright. A text-extraction proxy
(`r.jina.ai`) got a server-rendered pass of the same listing through, which is how
every figure below was actually read. **Screenshot order could not be recovered by
any of the three routes** — no route returns the images or their captions, only
text — so that column stays genuinely unknown, not guessed.

| App | Title (as shown) | Play short description | Reviews / rating | Installs | Last updated |
|---|---|---|---|---|---|
| **Law4u** | Law4u - Law of India & Acts | "Your Ultimate AI-Powered Legal Assistant & Law Practice App! ⚖️🇮🇳" | **4.2, 157 reviews** | 10L+ (1M+) | not captured |
| **Notify Court Case Status** | Notify Court Case Status | no distinct short-description line found separate from the full description | **no rating shown** — below Play's display threshold | 5K+ | **7 Aug 2026** — one day before this research |
| **Lawyyar** | Lawyyar – Your Legal Companion | "Legal guidance, case tools & smart research at your fingertips" | **no rating shown** — below Play's display threshold | 500+ | not captured |
| **LegalKart Lawyer** | LegalKart- Lawyer App | not captured separately from the full description | **no rating shown** — below Play's display threshold | not captured | not captured |
| **SupremeToday** | Supreme Today AI | "An indispensable Tool for Legal Professionals, Endorsed by Various High Court and Judicial Officers" | **4.8, 10 reviews** | 50K+ | not captured |

**Keyword field:** N/A as asked — that column is an **iOS-only field** per §2 below,
and all five of these were read from Android listings. The Android analogue is
**description keyword density** (Play's own ranking signal), which the full
descriptions pulled during this pass do support reading — worth a dedicated pass
once a tool is in place (§3), not eyeballed here.

**Developer, for the record:** Law4u — V2s Dev · Notify — Ajax Media Tech Private
Limited · Lawyyar — Skillpark Innovations Private Limited, Hyderabad · LegalKart —
Black Coat Technologies Pvt Ltd · SupremeToday — Vikas Info Solutions / Vikas
Nijhawan.

### What to take from this, not needing a tool

- **Every one of the five leads with breadth or reassurance, not speed.** Law4u's
  own short description sells itself as an "AI-Powered Legal Assistant"; Lawyyar
  sells "legal guidance, case tools & smart research"; SupremeToday sells
  endorsement ("endorsed by various High Court and judicial officers"). **None of
  the five leads with a listing, a hearing, or a next date** — none pitches the
  daily loop at all. `PRODUCT_BRIEF.md`'s read that the loop is an open position
  is confirmed, not just theorised: the store shelf itself has nobody standing
  there.
- **Two of five (Lawyyar, LegalKart) show no Play rating at all** — genuinely too
  new or too low-volume for Play to display one, not a hidden number. Only Law4u
  (157 reviews) and SupremeToday (10 reviews) clear Play's display floor, and even
  Law4u at 1M+ installs converts to a strikingly low review rate. **A listing that
  actually earns reviews is not solved by any of them either.**
- **Notify updated the day before this research ran** (7 Aug 2026) — the one
  visibly active competitor by that signal, worth re-checking near launch rather
  than treated as settled.
- **Law4u is the only one making an explicit AI claim in its short description**
  ("AI-Powered Legal Assistant"), everyone else buries AI in the full description
  or feature list — an unclaimed opening in the first 80 characters, which is the
  only part of the listing most browsers ever read.

### Left for the tool pass (§3/§5), not guessable now

- Exact character counts on title/short-description (need the literal string
  copied from the listing at the point of writing our own, not re-derived from
  research notes).
- Screenshot order and narrative for all five — no text-only route recovers
  images.
- Six-month update-cadence history for any of the five — neither store's public
  listing surfaces a changelog beyond the current version's "what's new."

## 1b · iOS side, done 8 Aug 2026

All five list on iOS. Same method as §1 (`r.jina.ai` proxy — Apple's listing
page rendered cleanly through it, no truncation this time). iOS actually
carries the field this file has been waiting on: a **real subtitle**, distinct
from the title, which is the exact analogue §2's draft candidates are built
against.

| App | Title | Subtitle | Rating | Developer |
|---|---|---|---|---|
| **Law4u** | Law4u - Law of India & Acts | "Indian Laws & Legal Advisors" | not enough ratings to display | Vipul Saliya |
| **Notify Court Case Status** | Notify Court Case Status | "Track your case." | 5.0, **1** rating | AJAX MEDIA TECH PRIVATE LIMITED |
| **Lawyyar** | Lawyyar | "Lawyyar – Your Legal Companion" | not enough ratings to display | Lawyyar |
| **LegalKart Lawyer** | Legalkart-Lawyer | "Lawyer's Practice Management" | 3.7, **20** ratings | Black Coat Technologies Pvt Ltd |
| **SupremeToday AI** | Supreme Today AI | "AI @ Legal Research & Drafting" | **1.0, 1 rating** | Vikas Info Solutions |

**The subtitles are markedly plainer than the Play short descriptions in §1** —
"Track your case.", "Lawyer's Practice Management" — mostly literal, none
making the loop claim either. Consistent with §1's finding, not a new one.

**SupremeToday AI's one iOS review is a 1-star complaint that the app "doesn't
work, can even create account."** One data point, not a trend, but it lands
right where `COMPETITIVE_TEARDOWN.md` §1 already flagged them as the entrant
selling AI research depth on endorsement rather than a stated accuracy number —
worth a line there rather than over-reading a single review. Added.

iOS review volume across the board is negligible (0–20 ratings on apps with
Play installs in the thousands to millions) — Play is very likely where any of
these five actually get discovered in India; worth confirming with a tool
before assuming iOS ASO effort matches Android's.

---

## 2 · Our listing — to be drafted

Constraints are platform rules, not preferences.

| Asset | Limit | Rule |
|---|---|---|
| **Title** | 30 chars | Must carry the primary keyword |
| **Subtitle** | 30 chars | iOS. Second-most-weighted field |
| **Keyword field** | 100 chars | iOS only. Comma-separated, **no spaces**, and **never repeat a word already in the title or subtitle** — a repeat wastes characters and buys nothing |
| **Play long description** | 4000 chars | Keyword **density** matters on Play. It does not on iOS |
| **Screenshots** | — | **The first two carry ~90% of the conversion decision.** Everything after is for the minority who scroll |

### Drafts, 8 Aug 2026 — candidates, not decisions

Character counts below are hand-counted against the strings as written here;
**recount from the literal string at submission time**, don't trust arithmetic
carried over from this doc.

| Field | Candidate | Count | Why |
|---|---|---|---|
| Title (30, both stores) | `Lawmind – Cause List & Cases` | 29 | Leads with the one term §1 found **no competitor puts in their title or short description** — every one of the five sells research or reassurance, none sells "I know what's listed for you." Carries two of §3's candidate clusters (`cause list`, `case`) in the 30 chars that matter most. |
| Title, alternative | `Lawmind: Verified Case Search` | 30 | Leads with the compliance wedge (`docs/COMPETITIVE.md` §3) instead of the loop. Weaker per the finding above — trust doesn't convert an install (see screenshot rationale) — kept as the alternative if the founder wants the moat foregrounded over the habit. |
| Subtitle (30, iOS only) | `Hearings briefed, daily` | 24 | The 32-char first draft (`Today's hearings, briefed daily`) ran over; this is the corrected fit. §1b's real iOS subtitles ("Track your case.", "Lawyer's Practice Management") are all short and literal — ours can afford to be too, rather than reaching for a longer sell that would only just fit. |
| Play short description (80, Android) | `Today's cause list, a 24-hour briefing, and citations you can file on.` | 72 | Android's analogue to the iOS subtitle — this is the field Play actually gives 80 chars to, and §1 found all five competitors under-use it (two don't have a distinct one at all). Names the loop AND the harness in one line. |
| Keyword field (100, iOS only) | `cause list,case status,hearing,court,advocate,briefing,citation,judgment,bare act,limitation,bns` | 99 | No repeats of words already in the title/subtitle per the platform rule. Every §3 cluster present once. **Not ranked against volume — §3 is still `UNKNOWN — requires tool`, this is coverage, not priority order.** |

**Screenshot narrative — the strategic call, now backed by §1's evidence, not
just reasoning.** The first two must answer the two questions an advocate has in
the three seconds they spend on a listing: *does it know my courts* and *will it
save me time tomorrow morning*. §1 confirms the daily cause list and the hearing
briefing are not just our strongest candidates in the abstract — **they are an
open position on the actual shelf**: none of the five competitors researched leads
with a listing, a hearing, or a next date in their own store copy. Verified-citation
depth is our real moat but it is a **trust** claim, not a **speed** claim, and
trust does not convert an install — recommend it as screenshot 3 or 4, after the
loop has already answered "will this save me time."

---

## 3 · Keyword clusters — to research and rank

Candidates from the scope revision. **Rank by volume against difficulty once a
tool is in place — not before.**

| Cluster | Intent | Volume | Difficulty |
|---|---|---|---|
| case status | Checking a listed matter | `UNKNOWN — requires tool` | `UNKNOWN` |
| cause list | Daily, high-frequency | `UNKNOWN — requires tool` | `UNKNOWN` |
| court case | Broad, likely high volume and high difficulty | `UNKNOWN — requires tool` | `UNKNOWN` |
| advocate | Identity term — may skew to *finding* an advocate, not being one | `UNKNOWN — requires tool` | `UNKNOWN` |
| lawyer app | Same ambiguity | `UNKNOWN — requires tool` | `UNKNOWN` |
| legal research | Our category, likely competitive | `UNKNOWN — requires tool` | `UNKNOWN` |
| bare act | Library intent | `UNKNOWN — requires tool` | `UNKNOWN` |
| BNS | New-regime term. **Low competition now, and that window closes** | `UNKNOWN — requires tool` | `UNKNOWN` |
| judgment search | Research intent | `UNKNOWN — requires tool` | `UNKNOWN` |
| case diary | Matter-workspace intent | `UNKNOWN — requires tool` | `UNKNOWN` |
| legal draft | Drafting intent | `UNKNOWN — requires tool` | `UNKNOWN` |
| limitation period | High-anxiety, high-intent, probably low volume | `UNKNOWN — requires tool` | `UNKNOWN` |

Two observations that do not need a tool, recorded as reasoning rather than data:

- **`advocate` and `lawyer app` are ambiguous intent.** A large share of that
  traffic is the public looking to *hire* a lawyer, which is not our user and
  would install, bounce, and leave a poor rating. Rank these on relevance before
  volume.
- **`BNS` is a timing play.** The codes replaced IPC/CrPC/Evidence on 1 July 2024
  and no competitor has re-indexed properly (`PRODUCT_BRIEF.md`). Term competition
  for it is lowest now and rises as they catch up.

---

## 4 · Localisation

Hindi store listings are a separate ASO surface with their own keyword set —
transliterated English terms often out-rank Devanagari ones in Indian app search,
but that is a claim to **verify with a tool**, not to act on.

Thailand is out of v1 (`PRD.md` §Geography). No Thai listing.

---

## 5 · Dependencies

- **OD-9 — DEFERRED 2 Aug 2026, no longer blocking.** Buy one month of AppTweak
  or App Radar ($50–100) just before launch and cancel after. §3 stays UNKNOWN
  until then. **This is now the only thing left in this file that needs a tool** —
  §1 and §1b competitor teardown are both done (8 Aug 2026, Play and iOS) and §2
  has draft copy pending a founder decision between the two title candidates, not
  pending research.
- **S7** is the sprint that consumes this. §1 has already fed the screenshot
  narrative call in §2 — this is what S3/S4 need to be able to demonstrate on
  screen when screenshots are actually captured.
