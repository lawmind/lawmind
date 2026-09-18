# WEBSITE CLAIM / EVIDENCE MATRIX

> **HISTORICAL PROMOTIONAL-SITE SPEC · NOT CURRENT PRODUCT AUTHORITY.**
> **CURRENT PROMO SITE IS TEMPORARY. ONLY COMPLIANCE-URL REQUIREMENTS REMAIN RELEASE-CRITICAL.**
> (SHIP S4-T0.1, 18 Sep 2026; roadmap v7.4 §0.2, §18.) Current claim discipline for
> store listings, review notes and any launch claim the founder chooses to publish:
> `docs/product/V1_CLAIMS_REGISTER_R17.md` bound to the current capability registry
> (named in `docs/CURRENT_STATE.md`). The matrix below is kept as written. Promo-site
> copy is not product source of truth and is not chased for parity each sprint.

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-4. This is the binding
document: **no sentence reaches the public website unless it appears in the
ALLOWED COPY column of a row whose STATUS is `PROVEN` or `QUALIFIED`.** A claim
that is not in this file has not been checked, and an unchecked claim about
citation accuracy is the one thing `CLAUDE.md` §2 says can end the company.

RCC implements. NEW3 owns this file. LCC and NEW1/NEW2 own the verification of
the rows attributed to them. **A row's owner may downgrade its status at any
time without asking anyone**, and the copy comes off the site the same day.

## How to read STATUS

| STATUS | Meaning | May it appear publicly? |
| --- | --- | --- |
| `PROVEN` | Measured, by a named lane, against a named artifact. | Yes, in the exact allowed wording. |
| `QUALIFIED` | True with a stated limit. The limit is part of the claim, not a footnote. | Yes, **only** with its qualifier attached. |
| `BLOCKED` | Measured and it does not hold, or unmeasured. | **No.** Not as a promise, a roadmap item, or a screenshot. |
| `INTERNAL` | True and useful, but not a thing we sell yet. | No public promise. |

---

## A · WHAT THE PRODUCT FINDS

| # | CLAIM | EVIDENCE | STATUS | ALLOWED PUBLIC COPY | VERIFYING OWNER |
| --- | --- | --- | --- | --- | --- |
| A1 | Find a judgment by its citation | `ten-matter-regression.json` M02/M03/M04/M09: four neutral citations, each returned **exactly one result at rank 1**, 6–20 ms. NEW1 LAUNCH_BENCHMARK citation class 6/8 at rank 1 (bus 1038). | `PROVEN` | "Type a citation. Get that judgment." | NEW1 + NEW3 |
| A2 | Find a judgment by its case name | NEW1 CASE_TITLE_CONTRACT_V1 (bus 1048): **unique** title 155/155 at rank 1, p95 1.3 s, timeouts 9→0. | `QUALIFIED` | "Type a case name. Get that case — and when a name is shared by more than one judgment, get all of them to choose from." **Never** "finds the case you name" unqualified: 32.3% of titles name 2–16 judgments (NEW1 bus 1030). | NEW1 |
| A2b | Case name **with a topic word added** | `ten-matter-regression.json` M01: `"Kharak Singh v State of Uttar Pradesh surveillance"` returned 5 results and **Kharak Singh was not among them**; the citation probe found it at rank 1. Adding one topic word leaves the exact-identity route. | `BLOCKED` | Nothing. Do not show a search box example that mixes a case name with a subject. | NEW3 → RCC (UX), NEW1 (retrieval) |
| A3 | CNR identity lookup | R4 dossier: server CNR identity lookup proven. Client exposure is RCC-1, not yet landed. | `QUALIFIED` | Allowed **only after** RCC-1 ships and NEW3-7 records PASS. Until then: no CNR mention. | RCC → NEW3 |
| A4 | Case-number search | R4: server case-number lookup with meaningful ambiguity. Ambiguity is inherent — the same case number recurs across courts and years. | `QUALIFIED` | "Search by case number — and we show you every case that number matches rather than guessing which one you meant." | LCC + RCC |
| A5 | Search by describing the facts / paste your facts | NEW1 bus 1084: posed long-fact queries score **0/6 at every input size**. bus 1089: posed-advocate-question s@5 is **2.2%** on the live representation. | `BLOCKED` | **Nothing.** No "describe your case", no "paste your facts", no free-text-question example in any screenshot or animation. | NEW1 |
| A6 | Concept / semantic research across the corpus | NEW1 bus 1057 DENSE_REACHABILITY_CEILING: `judgment_chunks` holds **40,161 judgments**, so a *perfect* dense arm scores 36.1%. `fact_pattern` and `supporting_authority` have **zero** reachable targets. bus 1062: semantic research stays hidden for V1. | `BLOCKED` | **Nothing.** The feature is hidden in the product; it must also be absent from the site. | NEW1 |
| A7 | Automatically finds the authority against you | NEW1 bus 1093: `adverse_authority` concept class scores **zero for every representation tested**. `ten-matter-regression.json` M06: a commercial breach-of-contract position returned an unrelated criminal judgment. | `BLOCKED` | **Nothing.** This is the highest-risk claim on the site: an advocate who believes it and finds nothing concludes there is nothing. | NEW1 |
| A8 | "18.7 million judgments" | `pg_class.reltuples` on `judgments` = **18,698,984** (25 Aug). NEW2's body-screen census: **18,698,968** created before the run. | `QUALIFIED` | "Built on 18.7 million Indian judgments." **May never be written as** "18.7 million searchable authorities", "18.7M semantic", or beside any AI/concept-search language — 40,161 documents (0.21%) carry a vector production can search. Corpus scale and search reach are different numbers and the site must not let a reader fuse them. | NEW2 (corpus), NEW1 (reach) |

---

## B · WHAT THE PRODUCT TELLS YOU ABOUT THE LAW

| # | CLAIM | EVIDENCE | STATUS | ALLOWED PUBLIC COPY | VERIFYING OWNER |
| --- | --- | --- | --- | --- | --- |
| B1 | Every citation is checked before you see it | `docs/CITATION_HARNESS.md`; three fields rendered from the DB row; silent-drop threshold 0. `ten-matter-regression.json`: authority states read `verificationState`/`verifiedBySource`/`overruledStatus` off the row on every matter. | `PROVEN` | "Every authority we show you has been checked against the court record — and where we could not confirm one, we say so instead of hiding it." **Never** "we verified this" (`lawmind-core`: copy is licence protection, not an audit). | LCC |
| B2 | We tell you when the law has moved | 104 judgments carry a LAW MOVED state (76 `set_aside`, 17 `doubted`, 11 `partly_set_aside`); read live at render, never cached. **But NEW2 bus 1145: only 5 of the 104 rest on a court's own words; 99 rest on a law reporter's annotation we have not confirmed.** | `BLOCKED` **as previously drafted** | The old wording — *"when an authority has been overruled, set aside or doubted, we mark it"* — makes a court the implicit subject of a sentence a reporter is the source of, 99 times out of 104. **Replaced by B2a/B2b.** | LCC + NEW2 |
| B2a | We surface reported treatment, and say who reported it | Same evidence. This is what the product actually does. | `PROVEN` | "When a later judgment or a law report records that an authority has been overruled, set aside or doubted, LawMind marks it — read fresh every time you open it, not cached from when we last checked. We show you who recorded it." Must not imply completeness: 104 across 18.7M is a floor, not a census. | NEW2 |
| B2b | Court-class currentness, the 5 | NEW2 bus 1145: 5 judgments carry court-class evidence. **2 of those 5 spans do not name the acting judgment or its date.** | `QUALIFIED` | For a court-class edge only, and **only where the edge relationship is genuinely `set_aside`**: *"Set aside in [citing case]."* For the 2 without a named actor/date, copy may **not** promise *"set aside by X on [date]"* — it cannot be delivered. See **B2c** before using the words "set aside" anywhere. | NEW2 |
| B2c | "Set aside" as a word, anywhere | **The wire word `set_aside` is not the legal act.** Measured 25 Aug: of the 76 judgments carrying `overruled_status = 'set_aside'`, **73 have an `overruled` edge and only 3 do not** (and those 3 are leaked test fixtures). `OPEN_DECISIONS.md` OD-14: set aside = this decision between these parties is gone; overruled = a later bench held the proposition is no longer good law **while the decision between the original parties stands**, and the judgment often remains citable for propositions the later court never reached. | `BLOCKED` | **The words "set aside" may not be used to describe an overruling** — in the app, a briefing, the store listing or the site. It tells an advocate something materially false and more damaging than the truth. OD-14 states it outright: this **blocks any claim that LawMind distinguishes overruling from setting aside, which it does not yet.** Safe interim: *"A later judgment records this authority as no longer good law."* — true of both acts, claims neither. | NEW3 (measured), LCC (wire), OD-14 (the label) |
| B3 | Our currentness comes from the courts | **NEW2 bus 1102 + 1145, hand-read: 99 of 104 badge-bearing judgments rest on a law reporter's editorial annotation; 5 on the court's own words. `ecourts_observation` holds 0 rows, so no coverage number can be sourced to a court registry.** | `BLOCKED` | **Never** "the Supreme Court overruled X" as bare fact; never "court-verified currentness"; never `verified` or `confirmed` anywhere near currentness (it also collides with the harness rule that verified is silent); never a court as the grammatical subject where the source is a reporter. Reporter-class safe form, NEW2's exact wording: *"A law report records this as overruled. We have not confirmed this against the deciding court."* | NEW2 |
| B3a | "We verify whether a case is still good law" | Canonical-safe coverage is **five judgments in 18.7 million**. Not 5%. Five. | `BLOCKED` | **Nothing.** | NEW2 |
| B4 | Provenance is visible to the advocate | `ten-matter-regression.json`: `treatmentProvenanceOnWire: false` on every matter. Migration 0082's own comment: "Nothing reads this column yet." **M02 (reporter headnote) and M03 (the court's own words) render identically today.** | `BLOCKED` | **Nothing.** Cannot be claimed until `treatment_provenance` reaches the wire and RCC renders the two states differently (plan §9 RCC-5). | LCC (wire) → RCC (UI) → NEW3 (QA) |
| B5 | We never show a case that does not exist | `services/api/src/citations/verify.ts` holds no HTTP client and a test asserts it; model output never sources a citation. **Caveat carried openly:** `judgments` currently holds **16 leaked `Test Court` fixture rows** (6 on 23 Aug, 16 on 25 Aug — cumulative). None reached a search result in this run (`testCourtRowsInResults: 0` on all ten matters). | `QUALIFIED` | "LawMind never writes a citation from memory. Every case we show you is a document we hold." Allowed **only while** the fixture-leak count is monitored and none is reachable; NEW3-1 M08 checks this on every run. | LCC + NEW3 |

---

## C · WHAT THE PRODUCT DOES WITH YOUR CASE

| # | CLAIM | EVIDENCE | STATUS | ALLOWED PUBLIC COPY | VERIFYING OWNER |
| --- | --- | --- | --- | --- | --- |
| C1 | Save authorities into a matter | `ten-matter-regression.json`: matters created 10/10; authorities listed with live DB-derived state. | `PROVEN` | "Keep every authority, note and hearing date for a case in one place." | NEW3 |
| C2 | A judgment that has been set aside cannot be added | The rule is enforced server-side and asserted by `matters/route.test.ts`. **But measured 25 Aug across all 104 badge-bearing judgments through the real `precedentialEffect`/`precedentialPolicy`: 3 refusals exist, and all 3 are the same leaked `SYNTHETIC — Set Aside Fixture` test row. Zero real judgments are refused today** — OD-14's resolution maps 73 of the 76 `set_aside` rows to effect `overruled` → `allow`. | `BLOCKED` | **Nothing.** The mechanism is real and correct; the claim is not, because no advocate can currently encounter it on a real authority. Reinstate if and only if a policy change makes it reachable. | NEW3 (measured), LCC |
| C3 | 24-hour hearing briefings | Briefing generation works and the OD-14 defects are closed (LCC bus 1078). But its value rests on adverse-authority discovery, which is A7 (`BLOCKED`). | `INTERNAL` | **No public promise.** Do not name the feature, price it, or screenshot it. | NEW3 |
| C4 | Counter-arguments / "the other side's case" | `ten-matter-regression.json`: the route answers on every matter, with real paragraph-anchored spans — **and returns its 12 nearest authorities with no abstention signal.** `counterKeys` contains no `reviewRequired` field. M06 returned an unrelated criminal judgment for a contract position. | `BLOCKED` | **Nothing** until an abstention state exists (plan §9 RCC-4). A confident nearest-neighbour with no confidence signal is how an advocate cites something that does not stand for what the app implied. | NEW1 + RCC |
| C5 | Monitoring — we tell you if your saved authority moves | The path exists end to end (`/alerts`, `/me/alert-settings` both 200 on all ten matters, settings persist). **`alerts` holds zero rows corpus-wide**, so no alert has been observed firing. Push delivery is separately unproven (`FQ-PUSH-PROJECT`). | `BLOCKED` | **Nothing.** "We will tell you" is a promise about a delivery path nobody has watched work. Reinstate when one real alert has been observed reaching a device. | LCC + NEW3 |
| C6 | Drafting, English and Hindi | Not exercised by the 10-matter regression this round. | `BLOCKED` (unmeasured) | Nothing, pending a measured pass. | NEW3 |
| C7 | Your case files stay private | `CLAUDE.md` §5 routing; one document per model call; `llm_calls` records `data_class` and `pseudonymised`. **The countersigned DPA is still owed and the admin surface refuses sensitive routing without it (OD-6).** | `QUALIFIED` | "Your case files are pseudonymised before any AI sees them, and we never put two clients' documents in the same request." **Never** claim complete PII removal — coverage is partial and `CLAUDE.md` requires us to say so. | LCC |

---

## D · POSITIONING CLAIMS ABOUT THE MARKET

| # | CLAIM | EVIDENCE | STATUS | ALLOWED PUBLIC COPY | VERIFYING OWNER |
| --- | --- | --- | --- | --- | --- |
| D1 | Fake citations are a real and current professional risk | **Primary source, read from its own text in our corpus:** *Pooja Ramesh Singh v. Jammu and Kashmir Bank Ltd. & Anr.*, **2026 INSC 668**, 2 July 2026 (Narasimha and Aradhe, JJ.), Civil Appeal No. 11950 of 2025. Para 17, the court's own words: *"A decision of a Court or an adjudicating authority based on material which is fake and hallucinated is no decision at all, and it amounts to subversion of the rule of law."* | `PROVEN` | The paragraph may be quoted verbatim with its citation and date. **Quote para 17, never the SCR headnote** — the headnote's "zero-tolerance" and "professional misconduct" phrasing is a law reporter's editorial apparatus, and quoting a headnote as the court's words is the exact error B3 forbids us elsewhere. Applying our own rule to our own marketing is the point. | NEW3 (verified 25 Aug) |
| D2 | Competitors overclaim | Jhana's own site: "16M+ judgments", "brute-forces research and reads citations till correct", "auto detects contradictions or outdated citations". Supreme Today: "Endorsed by Various High Court and Judicial Officers". None publishes a measured accuracy figure. | `QUALIFIED` | We may state **what we measure and publish**. We may **not** assert a competitor is inaccurate — we have not tested them and `COMPETITIVE_TEARDOWN.md` §7 says so. Contrast by disclosure, never by accusation. | NEW3 |
| D3 | "India's first / only ..." | Nothing supports a first-or-only claim, and Jhana already claims "India's first AI paralegal". | `BLOCKED` | **Nothing.** Superlatives are unfalsifiable, legally exposed, and instantly matched. | NEW3 |
| D4 | Built for Indian advocates specifically | BNS/BNSS/BSA handling (`DOMAIN_TRUTH.md`), Devanagari rendering, Indian court hierarchy, eCourts under written authorisation. | `PROVEN` | "Built only for Indian practice — BNS, BNSS and BSA included, in English and Hindi." | NEW3 |

---

## E · THINGS THAT MUST NOT APPEAR AT ALL

Not a table, because there is no allowed wording for any of these.

1. **Any Hearing Pack name, price, or screenshot.** Plan §10 DO-NOT list.
2. **Countdowns, seat counts, "N advocates joined today", or any scarcity device.** No such pattern exists in the codebase today (verified by grep, NEW3-9) and none may be introduced for the site.
3. **A blurred or padlocked citation.** The premium boundary is synthesis, never a safety fact — see `PREMIUM_PREVIEW_SPEC_V2.md`.
4. **Adverse treatment behind a paywall,** in any form, including a teaser count.
5. **A fabricated "2 contrary authorities" figure.** No stance column exists in the schema (LCC bus 1053); any supporting/contrary split shown anywhere would be invented.
6. **A testimonial, endorsement, or judicial approval we do not hold in writing.**
7. **An accuracy percentage of any kind** until one is measured, published internally, and given a row above with an owner.
8. **App Store / Play badges that link anywhere before the listings are live.** A dead store link on a launch site is the cheapest possible way to look unfinished.

---

## F · WHAT CHANGES THIS FILE

| Trigger | Effect |
| --- | --- |
| RCC lands CNR/case-number UX and NEW3-7 records PASS | A3 moves `QUALIFIED` → publishable |
| `treatment_provenance` reaches the wire **and** RCC renders reporter vs court differently | B4 opens; B3's safe form becomes stateable on the site |
| One real alert observed reaching a device | C5 opens |
| An abstention state ships on `/arguments/counter` | C4 becomes re-testable, not automatically allowed |
| NEW1's passage build lands and posted numbers clear a threshold NEW3 and the founder agree | A5/A6/A7 become re-testable, not automatically allowed |
| A `FIXTURE_DRIFT` or non-zero `testCourtRowsInResults` in the 10-matter regression | **B5 comes off the site that day** |

Every one of those is a measurement someone else owns. None of them is a
deadline, and none may be pre-announced on the site as "coming soon" — a
roadmap on a launch page is read as a capability.
