# MANUPATRA / SCC ONLINE — the buy decision, written before the quotes arrive

**NEW3, 18 Aug 2026.** The founder has contacted or is contacting both for
student/research/API/data-access pricing. This file exists so that when a number
comes back, the decision takes minutes rather than a fresh research pass — and so
that the number is compared against **what LawMind would actually gain**, not
against the sticker price of a competitor's seat.

**Default verdict: SKIP.** The rest of this file is the specific evidence that
would have to appear in a reply to move it, capability by capability. Nothing
here is a negotiating position; it is a shopping list with the boxes already
ticked off by cheaper sources.

**Standing facts, both re-confirmed rather than assumed** (`SOURCE_REGISTRY.md`
§5b): neither vendor publishes an API, bulk export, or any self-serve
programmatic tier. Manupatra licences IP-based per-location seats via
`contact@manupatra.com`; every SCC Online institutional path routes to
`sales@scconline.com`. Truth-state for both: **`VERIFIED_BUT_RESTRICTED`** — real
and dominant, but sales-negotiated human seats. Neither is in `CLAUDE.md` §6a, so
either would be a **new founder decision** regardless of price.

---

## 0 · THE ONE ARGUMENT THAT DECIDES THIS, IF NOTHING ELSE IS READ

**SCC Online's unique value is precisely the part LawMind is not permitted to
copy**, and this is settled law in the repo already — `CLAUDE.md` §6:

> *There is no copyright in a judgment — Copyright Act **s. 52(1)(q)(iv)** … What
> IS protected is a reporter's copy-edited version — headnotes, editorial
> numbering (**Eastern Book Company v. D.B. Modak**) — so use raw court text and
> never a law report's edition of it.*

Split any reporter subscription in two and the halves fall on opposite sides of
that line:

| the half that is | LawMind's position |
| --- | --- |
| **raw judgment text, party names, dates, court, bench, disposal** | free of copyright, and **we already hold 7.3M documents of it** |
| **headnotes, editorial paragraph numbering, catchwords, "held" summaries, curated treatment notes** | *the* reason people buy SCC — and **`D.B. Modak` protects it** |

So a subscription buys either something we have, or something we cannot use.
**The only reply that changes this is one that grants an express written licence
to the editorial layer for a commercial AI product** — reproduction, storage,
indexing, and derivative use. That is not a discount question, it is a different
contract, and no vendor whose core business is that layer sells it cheaply to a
product that competes with them.

**Corollary, and it should be stated to the founder plainly: a student or
research price does NOT solve this.** A cheap seat under academic terms is
*more* restrictive, not less — personal, non-commercial, no redistribution, no
machine processing. A cheap price on terms LawMind cannot use is worse than an
expensive one, because it looks like a win.

---

## 1 · CAPABILITY-BY-CAPABILITY — what each would add beyond what we already have

Sources compared against: **LawMind primary corpus** · **Indian Kanoon**
(authorized, paid, API) · **Supreme Today AI** (§6a-authorized, access imminent)
· **Bharat.Law / NyaI** (private paid rights) · **free official sources**
(SCI Equivalent Citation Table, e-SCR, `judgments.ecourts.gov.in`).

| capability | already covered by | residual gap | would SCC/Manupatra close it? | verdict |
| --- | --- | --- | --- | --- |
| **Parallel citation concordance, pre-2018** | **SCI's own free Equivalent Citation Table — 235,807 parsed pairs**, resolves 34.2% of the unresolved population for ₹0 | none worth paying for | it would duplicate a free official table | **SKIP** |
| **Parallel citation concordance, post-2018** | nothing free — the ECT **stops dead at 12.03.2018**, a hard coverage edge | **3,574 distinct citations** (`INDIANKANOON_WORK_QUEUE` P1) | yes, in principle — reporters assign the citations, so they are the primary source for their own | **the only genuine capability gap on this list** — but Indian Kanoon's `docmeta` tests it at **₹0.70/lookup ≈ ₹2,502 for all 3,574**, and IK is already licensed. **NEGOTIATE only if IK's hit rate proves poor** |
| **Cited-by graph** | Indian Kanoon `/doc/<id>` returns `citeList` + `citedbyList` (≤50 each, ₹0.20); the free search response already exposes `cites`/`citedby` counts per hit | LawMind's own extraction resolves 44,785 of 192,197 — a real gap, already being closed by an authorized source | yes, but at seat prices with no API | **SKIP** |
| **Treatment / good-law status** | Supreme Today (headnotes + treatment, harvester built), Bharat NyaI (hard-case teacher structures), LawMind's own `overruled_status` | **32 unresolved `overruled`/`overruled_in_part`/`doubted` edges** — the highest-stakes population we hold | yes — this is genuine editorial work | **the 32 are already queued against all three authorized providers** (`COMPETITOR_QUERY_INVENTORY` Tier 0.5, `INDIANKANOON_WORK_QUEUE` P0-PRE, `BHARATLAW_NYAI_WORK_QUEUE` P0). **Re-ask only if all three miss** |
| **Cited paragraphs / pinpoint citation** | LawMind's own `judgment_paragraphs`; IK `docfragment` at ₹0.05 | partial | yes — but their pinpoints are keyed to **their** editorial numbering, which is the protected artefact | **SKIP — buying it produces a field we may not render** |
| **Editorial relationships (headnotes, catchwords, "held")** | Supreme Today; e-SCR gives ~34,000 SC judgments free **with official headnotes** | HC headnote coverage | yes, and it is their best product | **SKIP on copyright, per §0.** Official SCR headnotes are a *court* publication, a different category from a reporter's |
| **Structured metadata (bench, disposal, subject)** | AWS parquet + mobile variant (`case_type`, `order_type`, `is_final`, parties, +20 more columns) | good already | marginally | **SKIP** |
| **API / data rights** | — | — | **neither publishes one.** Confirmed by direct fetch of both vendors' own pages, not by inference | **decisive — no API means no automation at any price** |

---

## 2 · THE DECISION RULE, TO APPLY THE DAY A REPLY LANDS

Run the reply through these in order and stop at the first that fires.

1. **Does it grant written permission to machine-process and store the editorial
   layer for a commercial AI product?** No → **SKIP.** This is the gate; nothing
   below matters if it fails, and it will normally fail.
2. **Does it include programmatic access (API, bulk export, or a documented feed)?**
   No → **SKIP.** A human seat cannot serve an ingestion lane, and a seat driven
   by automation breaches its own terms — which is the "never buy data from
   someone who circumvented an access control" rule pointed inward.
3. **Does it close the post-2018 concordance gap** — and does the reply *say so*
   with coverage dates, rather than implying it? No → **SKIP**; that is the one
   capability with a residual gap and it is the only reason to keep reading.
4. **Is it cheaper than the Indian Kanoon path for the same population?** The
   benchmark to beat is **₹2,502 (~$30) for all 3,574 post-2018 citations** via
   `docmeta`, on a licence we already hold. Not cheaper → **SKIP**.
5. All four pass → **NEGOTIATE**, scoped to the post-2018 concordance only, term
   as short as they will write, and with the editorial-layer permission in
   writing rather than in a sales email.

**BUY is not on this ladder deliberately.** No configuration of these facts
justifies an unbounded purchase from a vendor with no API whose differentiator is
copyright-protected. If a reply somehow clears all five gates, it is a
`NEGOTIATE` that becomes a founder decision, not an acquisition NEW3 executes.

---

## 3 · WHAT TO ASK THEM, IF THE FOUNDER WANTS A SECOND EXCHANGE

Four questions, each written so a sales reply cannot answer it vaguely. Anything
short of a dated, written answer is a "no" for decision purposes.

1. *"Do you offer any programmatic access — API, bulk export, or scheduled feed —
   under any tier, and at what price?"*
2. *"Does any licence you offer permit storing and machine-processing your
   headnotes and editorial content inside a commercial software product, and may
   we see that clause?"*
3. *"For judgments delivered after March 2018, do you publish parallel citations
   linking your reporter's citation to the neutral citation, and from what date
   is that coverage complete?"*
4. *"Does your student or research pricing permit commercial use, and if not,
   which tier is the cheapest that does?"*

---

## 4 · WHAT THIS FILE DOES NOT DO

- **It does not claim they have nothing.** Both are dominant, authoritative, and
  better than LawMind at the editorial layer. The verdict is about **what LawMind
  may legally use and can afford to automate**, not about quality.
- **It does not price a seat.** No quote exists yet; the ₹51,500/user/yr figure
  in `COMPETITIVE.md` is SCC Online AI Pro's public list price and is not what the
  founder asked them for.
- **It does not settle the copyright question for anyone else.** §0 restates
  `CLAUDE.md` §6 and `EBC v. D.B. Modak` as the repo already holds them. If the
  founder wants a different reading, that is counsel's call, not this lane's.
- **CaseMine and vLex India remain unreached** (`SOURCE_REGISTRY.md` §5b). Same
  shape expected, not verified, and they should not be assumed into this table.
