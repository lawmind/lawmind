# V1 CLAIMS REGISTER — PER PLATFORM

**NEW3, 30 August 2026. R13.** Supersedes nothing; **extends**
[`WEBSITE_CLAIM_EVIDENCE_MATRIX.md`](WEBSITE_CLAIM_EVIDENCE_MATRIX.md) with the
platform dimension roadmap v7.1 §9.5 made necessary.

> **The rule, restated with the words that were missing.** No sentence reaches a
> user unless it maps to a capability marked `ENABLED` in
> [`V1_CAPABILITY_REGISTRY_R13.json`](V1_CAPABILITY_REGISTRY_R13.json) **on the
> platform that sentence appears on**, and to a row here whose STATUS is `PROVEN`
> or `QUALIFIED`.

**Why per platform.** If party-name search can be off on iOS, then an App Store
listing claiming it is a false claim on that store even while the same sentence is
true on Google Play. The old matrix could not express that, so it could not stop it.

**The claims matrix keeps its authority over wording.** This file adds *where a
claim may appear*, never *what it may say*. Where the two disagree on wording, the
matrix wins; where they disagree on platform, this file wins.

---

## PLATFORM COLUMNS

| | meaning |
|---|---|
| **iOS** | App Store listing, in-app copy on iOS, screenshots submitted to App Review |
| **Android** | Play listing, in-app copy on Android |
| **web** | the marketing site, and any advocate-facing web surface |

**`web` splits into two things and only one is contested.** The *marketing site*
exists and is in Sprint 5 — claims about the product may appear on it under the
normal rules. An *advocate-facing web application* is `UNKNOWN_PENDING_FOUNDER`
(`FQ-WEB-SURFACE`), so **no claim may say or imply that LawMind runs on a laptop,
in a browser, or on desktop** until that is settled. No screenshot of a desktop
layout. No "works everywhere". No device mockup showing a monitor.

---

## A · SEARCH CLAIMS

| # | CLAIM | capability | iOS | Android | web (site) | STATUS | note |
|---|---|---|---|---|---|---|---|
| A1 | "Type a citation. Get that judgment." | `search.exact_citation` | ✅ | ✅ | ✅ | `PROVEN` | R13 control: 1 result, rank 1, `state:"answered"`, 51.1 ms |
| A3 | CNR lookup | `search.cnr` | ✅ | ✅ | ✅ | `QUALIFIED` | unchanged from the matrix |
| A4 | Case-number search | `search.case_number` | ✅ | ✅ | ✅ | `QUALIFIED` | unchanged |
| A2 | "Type a case name." | `search.case_title_full` | ✅ | ✅ | ✅ | `QUALIFIED` | 32.3% of titles name 2–16 judgments; the qualifier is part of the claim |
| **A9** | **"Search by the parties' names."** | `search.party_name_only` | ⚠️ **KILLABLE** | ✅ | ⚠️ **conditional** | **`QUALIFIED`** | **new in R13 — see §A9 below** |
| **A10** | **"Narrow to a court and a date range, then search a broad term."** | `search.filtered_broad_query` | ✅ | ✅ | ✅ | **`QUALIFIED`** | **new in R13 — see §A10 below** |
| A5 | "Describe your case / paste your facts" | — | ❌ | ❌ | ❌ | `BLOCKED` | 0/6 at every input size |
| A6 | Concept / semantic research | `search.semantic.broad` | ❌ | ❌ | ❌ | `BLOCKED` | `INTERNAL_EXPERIMENTAL` on every platform |
| A7 | "Finds the authority against you" | `search.semantic.adverse_authority` | ❌ | ❌ | ❌ | `BLOCKED` | `POST_V1`; the highest-risk claim we could make |
| A8 | "Built on 18.7 million Indian judgments" | `corpus.freshness_provenance` | ✅ | ✅ | ✅ | `QUALIFIED` | never beside AI/concept-search language |

### A9 · Party-name search — the one claim the iOS switch governs

**Allowed copy, all platforms where enabled:**
> *"Search by the parties' names — and when a name is too common to pin down, we
> tell you so and ask for one more detail, instead of showing you the wrong case."*

**May never be written as** "search anyone's court history", "look up a person",
"find everything about a party", or anything person-first. **Rule 10 and 11 of the
roadmap are product rules, not copy suggestions: party search is case-first, never
person-first, and there is no person-profile product.**

**iOS:** the claim is permitted **only while the capability reads `ENABLED_V1_KILLABLE`
and the switch is off**. If App Review objects under 5.1.1(viii) and the switch is
flipped:

- the A9 sentence comes off the App Store listing **the same day**;
- A1, A3, A4 and A2 are **unaffected** and stay on the listing — a citation is not
  a person, and disabling party search must not read as disabling research;
- in-app, party input **degrades visibly** to case-number / citation / CNR search
  with a stated message. It never silently vanishes: a capability that disappears
  without explanation produces support load *and* a feature-parity claim problem
  against the Android listing, which is worse than either alone.

**Android is not weakened because the iOS switch exists.** Play has no equivalent
guideline and there is no reason to ship a lesser product there.

**Known limit that is part of the claim, not a footnote:** a party name built only
of corpus-common tokens returns nothing and takes 1,239.2 ms to say so. Copy must
not promise that any name works.

### A10 · Filtered broad search

**Allowed copy:**
> *"Pick a court and a date range, then search a single broad term like 'bail' —
> and if the range is still too wide to rank, we say so and tell you what to narrow."*

**May never be written as** "search anything, anywhere", or with a court **category**
in the example. Measured: `courts:["hc"]` — every High Court — is **still refused**
at one month. One named court plus one month returns results in 418.1 ms; plus three
days, 154.6 ms. **A screenshot or animation showing an "All High Courts" chip
producing results would be a fabricated capability.**

---

## B · TRUST AND CURRENTNESS CLAIMS — platform-invariant

**Every row in section B of the matrix applies identically on all three platforms.**
This is deliberate and is worth stating: safety, source and currentness evidence is
**never** paywalled (roadmap rule 12) and is never platform-differentiated either.
An advocate must not learn a different thing about whether a case is good law
depending on which phone they bought.

Carried forward unchanged and still binding:

- **B1** `PROVEN` — *"Every authority we show you has been checked against the court
  record — and where we could not confirm one, we say so instead of hiding it."*
  Never *"we verified this"*.
- **B2c** `BLOCKED` — **the words "set aside" may not be used to describe an
  overruling**, on any platform, in any surface, including a store listing.
- **B3** `BLOCKED` — never a court as the grammatical subject where a law reporter
  is the source. 99 of 104 LAW MOVED states rest on a reporter's annotation.
- **B3a** `BLOCKED` — *"we verify whether a case is still good law"*. Canonical-safe
  coverage is **five judgments**. Not five percent. Five.
- **B4** `BLOCKED` — provenance visibility. `treatment_provenance` is not on the
  wire; deferred at `CCR-2026-08-30-05` to Gate C.

---

## C · MONITORING CLAIMS — blocked on every platform, and this is the one to watch

| # | CLAIM | capability | iOS | Android | web | STATUS |
|---|---|---|---|---|---|---|
| D1 | anything asserting we watch a court for you | `monitoring.user_product` | ❌ | ❌ | ❌ | `BLOCKED` |
| D2 | a polling frequency, an SLA, or a price for monitoring | — | ❌ | ❌ | ❌ | `BLOCKED` |
| D3 | "we tell you when your case is listed" | — | ❌ | ❌ | ❌ | `BLOCKED` |

`ecourts_observation = 0`. **Zero.** There is no observation, so there is no claim.

**`SHAPE_A_SCOPE_CANDIDATE = yes` is not permission to market monitoring**, and
neither is a successful internal cause-list fetch. Under Shape B the website says
**"Coming soon"** with *no capability claim attached* — and "coming soon" is itself a
claim about the future that must not carry a date, a price, or a description of how
well it will work.

**Gate D's hardest criterion is this section.** Check it last and hardest: monitoring
claims must not exceed measured capability, and today measured capability is nil.

---

## D · GOVERNMENT-INFORMATION POSITIONING — substance, not a disclaimer

Applies on all platforms, and it is a **substance** requirement rather than a footer:

- LawMind is **independent and not a government entity**, stated where a reader
  forms the impression, not only in a policy page.
- Sources are **named and verifiable** in-product, with their currentness shown.
- The written eCourts authorization is available on request; the internal
  attribution string is an audited identifier and **not a phrase anyone requires us
  to quote publicly**.
- No government seal, emblem, court crest, or colour scheme that implies official
  standing. No app name or icon that reads as an official court app.

---

## E · BANNED VOCABULARY — no platform, no surface, no exception, without current evidence

`live` · `real-time` · `every case` · `every citation verified` · `good law` ·
`complete` · `comprehensive` · `all Indian courts` · Hindi semantic capability ·
any court count not measured today · district-wide completeness · "AI that
understands Indian law" · any comparison to a named competitor · any uniqueness
claim about our access, our authorization, or our architecture.

**Three of these are worth their own sentence:**

- **"good law"** — B3a. We can say it about five judgments.
- **"every citation verified"** — collides with the harness rule that *verified is
  silent*. If we advertise verification, silence stops reading as confidence and
  starts reading as an omission.
- **a uniqueness claim about our access** — we hold a written eCourts authorization
  and we have produced **zero** observations under it. "Only LawMind has access to…"
  would be both unprovable and, if it were provable, a reason for the grantor to
  reconsider.

---

## F · LEGALLY SENSITIVE WORDING — NOT FINALISED HERE

**Do not finalise, and do not ship:** the App Store and Play data-safety
declarations; the privacy policy; the terms of service; the DPDP notice; the
data-processing terms shown to a user before an upload; any wording describing the
eCourts authorization to the public.

These need counsel, not a product lane. They are named here so that "we forgot" is
not available as an explanation in October. Two are already owed and recorded
elsewhere: the countersigned DPA before uploads ship, and counsel's written
residency view.

---

## G · AUDIT

| | |
|---|---|
| claims listed | **24** across A/B/C/D |
| **unsupported claims (allowed on a platform where the capability is not ENABLED)** | **0** |
| claims newly permitted in R13 | 2 (A9, A10), both `QUALIFIED`, both with the limit inside the claim |
| claims newly restricted in R13 | 1 — no claim may imply a desktop/browser advocate surface (`FQ-WEB-SURFACE`) |
| claims blocked | 9 |
| claims awaiting counsel | section F, 6 items, none shippable |
