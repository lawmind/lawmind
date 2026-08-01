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

## 1 · Competitor teardown — to be filled

All five are live on the Indian store. **This table is the first task, and it is
research, not writing** — open each listing and record what is actually there.

| App | Title | Subtitle | Keyword field | Screenshot order | Reviews / rating | Update cadence |
|---|---|---|---|---|---|---|
| **Law4u** | TBD | TBD | TBD | TBD | TBD | TBD |
| **Notify Court Case Status** | TBD | TBD | TBD | TBD | TBD | TBD |
| **Lawyyar** | TBD | TBD | TBD | TBD | TBD | TBD |
| **LegalKart Lawyer** | TBD | TBD | TBD | TBD | TBD | TBD |
| **SupremeToday** | TBD | TBD | TBD | TBD | TBD | TBD |

Record for each:
- **Exact** title and subtitle, character counts included
- Keyword field where visible (iOS keyword fields are not public — infer only
  from ranking data in a tool, and mark inference as inference)
- **Screenshot narrative order** — what they lead with, and what they think the
  second screenshot has to prove
- Review volume and rating, with the date observed
- Update cadence over the last six months

**What to look for beyond the fields:** which of them leads with *case status*
rather than *legal research*. `PRODUCT_BRIEF.md` says the daily loop is the
differentiator, and if every competitor leads with search, the cause list is an
open position on the store as well as in the product.

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

Drafts: TBD after §1.

**Screenshot narrative — the strategic call to make before designing any.** The
first two must answer the two questions an advocate has in the three seconds they
spend on a listing: *does it know my courts* and *will it save me time tomorrow
morning*. The daily cause list and the hearing briefing are the two strongest
candidates. Verified-citation depth is our real moat but it is a **trust** claim,
not a **speed** claim, and trust does not convert an install.

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

- **OD-9 — ASO tool selection.** Blocks §3 entirely, and therefore §2. Nothing in
  this file can be ranked without it.
- **S7** is the sprint that consumes this, but §1 competitor research needs no
  tool and no product — it can start today and should, because it informs the
  screenshot narrative and therefore what S3 and S4 must be able to demonstrate.
