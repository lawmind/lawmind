# V1 CLAIMS REGISTER — PER PLATFORM, WITH THE `web` HOMONYM REMOVED

**NEW3, 30 August 2026. R14.** Supersedes
[`V1_CLAIMS_REGISTER_R13.md`](V1_CLAIMS_REGISTER_R13.md), which is not edited and
remains the historical record. **Extends**
[`WEBSITE_CLAIM_EVIDENCE_MATRIX.md`](WEBSITE_CLAIM_EVIDENCE_MATRIX.md) with the
platform dimension roadmap v7.1 §9.5 made necessary.

> **The rule, unchanged.** No sentence reaches a user unless it maps to a capability
> marked `ENABLED` in
> [`V1_CAPABILITY_REGISTRY_R14.json`](V1_CAPABILITY_REGISTRY_R14.json) **on the
> platform that sentence appears on**, and to a row here whose STATUS is `PROVEN` or
> `QUALIFIED`.

---

## 0 · WHAT CHANGED IN R14, AND WHAT DID NOT

**Changed — one thing, and it is a naming defect, not a truth change.** R13 had a
single column called `web` whose own header said it meant *"the marketing site, and
any advocate-facing web surface"*. That is two different surfaces under one label, and
a claim true of one was readable as a claim about the other. **The column is split.**

**Not changed — any claim's truth value.** Every `PROVEN` / `QUALIFIED` / `BLOCKED`
verdict in R13 is carried forward as it stood. Splitting a column does not re-decide
what is true; it decides *where* a truth may be said.

**Not changed — the advocate web surface remains unavailable.** Master Roadmap v7.1
keeps a desktop/web advocate research surface **in v1 scope**, and
`FQ-WEB-SURFACE` is closed on that basis. **In scope is not enabled.** Every
advocate-web capability row reads `DISABLED_NOT_READY`, so **no advocate-web claim may
be made at all** until a capability row there reads `ENABLED` on named evidence.

---

## 1 · PLATFORM AND SURFACE COLUMNS — the homonym, resolved

| column | what it is | governed by |
|---|---|---|
| **iOS** | App Store listing, in-app copy on iOS, screenshots submitted to App Review | capability registry `platforms.ios` |
| **Android** | Play listing, in-app copy on Android | capability registry `platforms.android` |
| **WEB_ADVOCATE_APP** | the advocate-facing web/desktop research client — the thing an advocate would log into in a browser | capability registry `platforms.web`, and the wire selector `X-Lawmind-Platform: web` |
| **WEB_MARKETING_SITE** | the public marketing website. **Not a client platform.** Nobody researches law on it. | this file + `WEBSITE_CLAIM_EVIDENCE_MATRIX.md` |

**Why they are not one column.** `WEB_ADVOCATE_APP` is a *place a capability runs*.
`WEB_MARKETING_SITE` is a *place a sentence appears*. A capability can be enabled on
the first; only a claim can appear on the second. Merging them let "the product does
X" and "our website may say the product does X" share a tick.

**`WEB_ADVOCATE_APP` is ❌ on every row in this register, without exception.** Not
because the surface is cancelled — v7.1 keeps it in scope — but because nothing is
built and nothing is evidenced. The inert desktop workspace files in `apps/mobile` are
a width breakpoint, off below 900 px, and they authorise nothing. The API accepting
`?platform=web` is a *selector*, and a selector is not a client.

**`WEB_MARKETING_SITE` keeps exactly the ticks R13's `web` column carried**, because
in every R13 row that tick was about the marketing site.

**The admin console (`apps/admin`) is not in this table.** It was never an advocate
surface and was never in question.

---

## 2 · THE ONE RULE THAT SURVIVES THE SPLIT

**No claim on the marketing site may say or imply that LawMind runs on a laptop, in a
browser, or on a desktop.** No screenshot of a desktop layout. No "works everywhere".
No device mockup showing a monitor. **A marketing-site tick authorises a sentence
ABOUT the phone product; it never authorises a sentence about a web product.**

This is the rule R13 stated under `FQ-WEB-SURFACE`. It is unchanged by the queue item
closing — what closed was *who decides the surface*, not *whether we may claim it*.

---

## A · SEARCH CLAIMS

| # | CLAIM | capability | iOS | Android | WEB_MARKETING_SITE | WEB_ADVOCATE_APP | STATUS | note |
|---|---|---|---|---|---|---|---|---|
| A1 | "Type a citation. Get that judgment." | `search.exact_citation` | ✅ | ✅ | ✅ | ❌ | `PROVEN` | R13 control: 1 result, rank 1, `state:"answered"`, 51.1 ms |
| A3 | CNR lookup | `search.cnr` | ✅ | ✅ | ✅ | ❌ | `QUALIFIED` | unchanged from the matrix |
| A4 | Case-number search | `search.case_number` | ✅ | ✅ | ✅ | ❌ | `QUALIFIED` | unchanged |
| A2 | "Type a case name." | `search.case_title_full` | ✅ | ✅ | ✅ | ❌ | `QUALIFIED` | 32.3% of titles name 2–16 judgments; the qualifier is part of the claim |
| A9 | "Search by the parties' names." | `search.party_name_only` | ⚠️ **KILLABLE** | ✅ | ⚠️ **conditional** | ❌ | `QUALIFIED` | see §A9 — the switch is now **served**, not build-time |
| A10 | "Narrow to a court and a date range, then search a broad term." | `search.filtered_broad_query` | ✅ | ✅ | ✅ | ❌ | `QUALIFIED` | see §A10 — the *mechanism* is corrected in R14 |
| A5 | "Describe your case / paste your facts" | — | ❌ | ❌ | ❌ | ❌ | `BLOCKED` | 0/6 at every input size |
| A6 | Concept / semantic research | `search.semantic.broad` | ❌ | ❌ | ❌ | ❌ | `BLOCKED` | `INTERNAL_EXPERIMENTAL` on every platform |
| A7 | "Finds the authority against you" | `search.semantic.adverse_authority` | ❌ | ❌ | ❌ | ❌ | `BLOCKED` | `POST_V1`; the highest-risk claim we could make |
| A8 | "Built on 18.7 million Indian judgments" | `corpus.freshness_provenance` | ✅ | ✅ | ✅ | ❌ | `QUALIFIED` | never beside AI/concept-search language |

### A9 · Party-name search — the switch is now SERVED

**Allowed copy, all platforms where enabled:**
> *"Search by the parties' names — and when a name is too common to pin down, we tell
> you so and ask for one more detail, instead of showing you the wrong case."*

**May never be written as** "search anyone's court history", "look up a person", "find
everything about a party", or anything person-first. **Party search is case-first,
never person-first, and there is no person-profile product.**

**What R14 corrects.** R13 recorded the iOS kill switch as **build-time**, meaning the
A9 sentence could only come off the App Store listing with a new binary. At HEAD the
switch is **served**: `GET /release/capabilities` resolves `search.party_name` per
platform, and a platform override narrows it for that platform alone. **The sentence
now comes off the listing the same day, and the capability goes off the same day,
without an App Store release.** That is the situation §9.5 wanted and did not have.

Unchanged: if the switch is flipped, **A1, A3, A4 and A2 stay on the listing** — a
citation is not a person — and in-app the party input **degrades visibly** to
case-number / citation / CNR search with a stated message. Never a silent
disappearance. **Android is not weakened because the iOS switch exists.**

**Known limit that is part of the claim:** a party name built only of corpus-common
tokens returns nothing and takes 1,239.2 ms to say so. Copy must not promise that any
name works.

### A10 · Filtered broad search — the mechanism corrected, the claim unchanged

**Allowed copy, unchanged:**
> *"Pick a court and a date range, then search a single broad term like 'bail' — and if
> the range is still too wide to rank, we say so and tell you what to narrow."*

**What R14 corrects, and it matters for a screenshot.** R13 said *"a court category is
not narrowing"*. Mechanically false at HEAD: a category **is** treated as a narrowing
filter and the real population it selects **is** counted. It is refused because every
High Court is a population far above the admission bound — **narrowing that is not
narrow enough**, which is a different sentence.

**The copy consequence does not change.** An "All High Courts" chip still does not
produce results for a broad term, so **a screenshot or animation showing one producing
results would be a fabricated capability.** Show a single named court and a short date
range.

**Never** written as "search anything, anywhere". **Never** quote the admission bound
(the 20,000-document figure) in any public or in-product copy: it is an operational
measurement on one box, not a promise.

**A named limit, stated rather than hidden:** a broad term across a whole large court
with no date bound — Supreme Court plus `bail` — **is refused**, truthfully, because
the counted population exceeds what can be ranked inside the budget. Copy must not
imply that picking a court alone is enough.

---

## B · TRUST AND CURRENTNESS CLAIMS — platform-invariant, carried forward unchanged

**Every row in section B of the matrix applies identically on all platforms and
surfaces.** Safety, source and currentness evidence is **never** paywalled and is never
platform-differentiated. An advocate must not learn a different thing about whether a
case is good law depending on which phone they bought.

- **B1** `PROVEN` — *"Every authority we show you has been checked against the court
  record — and where we could not confirm one, we say so instead of hiding it."*
  Never *"we verified this"*.
- **B2c** `BLOCKED` — **the words "set aside" may not be used to describe an
  overruling**, on any platform, in any surface, including a store listing.
- **B3** `BLOCKED` — never a court as the grammatical subject where a law reporter is
  the source. 99 of 104 LAW MOVED states rest on a reporter's annotation.
- **B3a** `BLOCKED` — *"we verify whether a case is still good law"*. Canonical-safe
  coverage is **five judgments**. Not five percent. Five.
- **B4** `BLOCKED` — provenance visibility. `treatment_provenance` is not on the wire;
  deferred at `CCR-2026-08-30-05` to Gate C. **Unchanged by R14.**

**New in R14, and it is a copy constraint rather than a claim.** `precedentialEffect`
now has an eighth value, `evidence_defect`, which means *our own parser recorded
something that was never a change of status*. **No copy may describe it as a court
doing anything.** It renders as neutral later-judgment text. A defect in our parsing
subtracts a warning; it never adds a prohibition, and it never becomes a sentence about
the law.

---

## C · MONITORING CLAIMS — blocked on every platform and every surface

| # | CLAIM | capability | iOS | Android | WEB_MARKETING_SITE | WEB_ADVOCATE_APP | STATUS |
|---|---|---|---|---|---|---|---|
| D1 | anything asserting we watch a court for you | `monitoring.user_product` | ❌ | ❌ | ❌ | ❌ | `BLOCKED` |
| D2 | a polling frequency, an SLA, or a price for monitoring | — | ❌ | ❌ | ❌ | ❌ | `BLOCKED` |
| D3 | "we tell you when your case is listed" | — | ❌ | ❌ | ❌ | ❌ | `BLOCKED` |

`ecourts_observation = 0`. **Zero.** There is no observation, so there is no claim.
Under Shape B the website says **"Coming soon"** with *no capability claim attached* —
and "coming soon" is itself a claim about the future that must not carry a date, a
price, or a description of how well it will work. **Unchanged by R14.**

---

## D · GOVERNMENT-INFORMATION POSITIONING — unchanged

- LawMind is **independent and not a government entity**, stated where a reader forms
  the impression, not only in a policy page.
- Sources are **named and verifiable** in-product, with their currentness shown.
- The written eCourts authorization is available on request; the internal attribution
  string is an audited identifier and **not a phrase anyone requires us to quote
  publicly**.
- No government seal, emblem, court crest, or colour scheme that implies official
  standing. No app name or icon that reads as an official court app.

---

## E · BANNED VOCABULARY — unchanged, and one addition

`live` · `real-time` · `every case` · `every citation verified` · `good law` ·
`complete` · `comprehensive` · `all Indian courts` · Hindi semantic capability · any
court count not measured today · district-wide completeness · "AI that understands
Indian law" · any comparison to a named competitor · any uniqueness claim about our
access, our authorization, or our architecture.

**Added in R14:** any sentence implying LawMind runs **in a browser or on a desktop**
— including "works on any device", "open it on your laptop", or a screenshot of a
desktop layout. The surface is in scope and unbuilt; a claim about it would be a claim
about something that does not exist. **Also banned:** quoting the search admission
bound as a capability ("searches up to 20,000 judgments at a time"). It is an
operational measurement, not a product promise.

---

## F · LEGALLY SENSITIVE WORDING — NOT FINALISED HERE, unchanged

**Do not finalise, and do not ship:** the App Store and Play data-safety declarations;
the privacy policy; the terms of service; the DPDP notice; the data-processing terms
shown before an upload; any wording describing the eCourts authorization to the public.
These need counsel, not a product lane. Two are already owed: the countersigned DPA
before uploads ship, and counsel's written residency view.

---

## G · AUDIT

| | |
|---|---|
| claims listed | **24** across A/B/C/D |
| **unsupported claims (allowed on a surface where the capability is not ENABLED)** | **0** |
| claims permitted on `WEB_ADVOCATE_APP` | **0** — and zero capabilities are ENABLED there |
| claims whose truth value changed in R14 | **0** — R14 split a column, it did not re-decide a verdict |
| claims blocked | 9 |
| banned-vocabulary entries added in R14 | 2 (browser/desktop implication; the admission bound as a capability) |
| claims awaiting counsel | section F, 6 items, none shippable |
