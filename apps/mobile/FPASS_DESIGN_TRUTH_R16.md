# RCC R16 — FPASS DESIGN-TRUTH LINT, files 16–30

**Lane:** RCC. **Date:** 1 September 2026.
**HEAD at start:** `c15b2aac54c321a5689faa37b5cb5835e82223eb`.
**Source:** `fpass.zip`, SHA256
`a41702f1bae0d3b9b88972be2eeda15f20924187abd949a0125e6f0ee4005ca1` — matched the
expected digest exactly. Unpacked to a scratch path outside the repository; no
part of the archive, its renders or its extracts is committed.

**What this file is.** Every user-visible literal and interaction in the fifteen
current-design files, classified against what this product can actually support,
BEFORE any of it was coded. It exists because the archive is a design pack and
not a specification: it contains a sign-in flow this app does not use, a
subscription plan it does not sell, source-freshness numbers it cannot compute
and a party-name rule it deliberately does not state. Every one of those would
have shipped as product truth if the pack had been read as authority.

**Precedence used, in order.** Founder instruction · `PRODUCT_DECISIONS.md` and
`CLAUDE.md` · NEW3 R15 adjudication and the R15 capability registry · the
contract and the served capability registry · verified implementation at HEAD ·
the design pack.

**The pack's own brief says `IMPLEMENTATION.md` is the authority.** It is not, in
this repository. That sentence was written for a greenfield build; this app is
mature, gated, and governed by a registry and a frozen contract. Where the two
disagree the repository wins, and the disagreements are the substance of the
table below.

---

## 0 · CLASSIFICATION COUNTS

```
DESIGN_FILES_AUDITED           15   (16-30)
DESIGN_ELEMENTS_CLASSIFIED    118
UNKNOWN_DESIGN_ELEMENTS         4

by classification
  VISUAL_ONLY                  21
  STATIC_COPY_SAFE             14
  DYNAMIC_API_FIELD            17
  CONTRACTED_ACTION            12
  CAPABILITY_GATED              9
  ILLUSTRATIVE_SAMPLE          16
  STALE_LEGACY                  5
  UNSUPPORTED_CLAIM            13
  CONTRACT_GAP                  4
  POST_V1                       3
  UNKNOWN                       4
```

`UNSUPPORTED_CLAIM` is the count that matters: thirteen separate sentences in the
pack assert something this product cannot substantiate. None of them was
implemented, and `apps/mobile/src/screens/routeGates.test.ts` now fails the build
if any equivalent phrase reaches reachable production code.

---

## 1 · THE MATRIX

`CURRENT_SOURCE_OF_TRUTH` names the file or route that decides, read at HEAD.
`IMPLEMENTATION_DECISION` is what this round did.

### 16 · auth-guard-resume

| element | classification | current source of truth | decision |
|---|---|---|---|
| "YOU WERE OPENING" + the held destination card | VISUAL_ONLY | — | Not built. The mechanism is built without the card: `state/pendingDestination.ts`. A screen announcing the held link is a design item nobody asked for. |
| "Sign in and we will take you straight there" | STATIC_COPY_SAFE | `pendingDestination.consume()` | **Behaviour implemented**, copy not adopted verbatim. |
| "The link is held on this device only. It is not sent anywhere until you sign in." | STATIC_COPY_SAFE | `pendingDestination.ts` — AsyncStorage, no network call | True of the implementation. Recorded here rather than rendered; nothing on the sign-in screen claims it today. |
| **"Verify number" / "Enter the code" / "Sent to +91 98••• ••432 by SMS" / "Resend in 0:24"** | **STALE_LEGACY** | `state/session.ts` — `requestMagicLink` / `verifyMagicLink`; `app/auth/verify.tsx` | **REFUSED.** The canonical mechanism is an emailed magic link, single-use, fifteen-minute expiry. There is no SMS path, no OTP, and no phone-number identity anywhere in the client or the contract. Trap A. |
| "Create an account" as a second primary action | STALE_LEGACY | `SignInScreen.tsx` | Not adopted. A magic link to an unknown address IS the account creation; a separate path would be two doors to one room. |
| **Drafts bottom tab** | **CAPABILITY_GATED** | `V1_SURFACE.drafting = POST_V1`; `(tabs)/_layout.tsx` | **REFUSED.** Four tabs. Trap A. |
| "Resumed where the link pointed" / "¶ 23 of 32" | CONTRACTED_ACTION | `hrefWithParams` keeps `?paragraph=` | Implemented: the paragraph survives the bounce. `AuthBoundary.test.ts` pins it. |
| "Go to the start" | VISUAL_ONLY | — | Not built; the reader already has its own navigation. |
| **"This matter is not shared with you… ask them to invite this number"** | **UNSUPPORTED_CLAIM** | `matters/route.ts` returns `NOT_FOUND` for a matter another user owns | **REFUSED.** The server deliberately cannot distinguish "does not exist" from "not yours" on that path, so the app may not claim it can. Inviting "this number" is also the SMS identity again. |
| "Sign in as someone else" | CONTRACTED_ACTION | `session.signOut()` | Not added this round — the existing sign-out is in Settings and no evidence says the 404 needs a second one. |
| Judgment paragraph text (Satender Kumar Antil ¶ 22–24) | ILLUSTRATIVE_SAMPLE | `GET /judgments/:id` | Never hard-coded. |

### 17 · manage-matter

| element | classification | current source of truth | decision |
|---|---|---|---|
| Edit case / case number / side / client / CNR / court | CONTRACT_GAP → founder design **D-2** | `PATCH /matters/:id` accepts eight fields; `client.ts:586` is called once, with `nextHearingDate` only | **NOT BUILT.** NEW3 R15 P2 classifies this `FOUNDER_DESIGN_REQUIRED`, gate `REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C`. Which fields are editable and which are identity is a product decision. |
| STATUS · Active / On hold / **Disposed** | CONTRACT_GAP | enum is `{active, disposed, archived}` — **no `on hold`** | Not built. The pack invents a fourth state the column does not have; adopting it would have been a silent CCR. |
| "Archive this matter — everything is kept and it can be restored" | CONTRACT_GAP → D-2 | `status = 'archived'` exists; no screen, no archived list | Not built. D-2's own truth state: archive must not look like delete. |
| **"Delete this matter — this cannot be undone"** | **UNSUPPORTED_CLAIM** | there is no `DELETE /matters/:id` | **REFUSED.** Trap B. `UNSUPPORTED_HARD_DELETE = NO`, asserted by test. |
| **"14 events · 6 saved authorities · 2 drafts"** | **ILLUSTRATIVE_SAMPLE** | drafting is `POST_V1`; a draft count cannot exist in a v1 build | Not built. Trap B. |
| "Re-sync · Last synced 14 Jul 2026. Changing the CNR replaces the imported history." | UNSUPPORTED_CLAIM | no CNR re-sync endpoint; no imported history to replace | **REFUSED.** |
| "A hearing is listed on 30 July. Disposing removes it from that day." | STATIC_COPY_SAFE | `listedToday()` in `state/practice.ts` | Correct as a statement, but it belongs to D-2's unbuilt screen. |
| "You entered this" beside the next hearing date | DYNAMIC_API_FIELD | `matter_events.source = 'manual'` | Already the app's existing provenance line. |

### 18 · adjournment

| element | classification | current source of truth | decision |
|---|---|---|---|
| Common adjournments, 2/4/6 weeks with weekday | DYNAMIC_API_FIELD | `predictedAdjournmentDates()` | Already implemented; unchanged. |
| **"FOR (OPTIONAL)" — Arguments / Status report / Evidence / Reply** | **CONTRACTED_ACTION** | `POST /matters/:id/events` `{eventDate, eventType:'hearing', orderText}` | **IMPLEMENTED — this round's second P0.** The row existed and persisted nothing. `state/practice.ts#recordAdjournment`. The pack's four labels were not adopted over the existing four (`Same purpose / Arguments / Evidence / Orders`): changing the vocabulary is a design call, persisting the selection is a bug fix, and only the second was in scope. |
| "Type…" free-text purpose | POST_V1 | `orderText` accepts free text | Not built. A keyboard in a courtroom is the thing this screen exists to avoid; the pack offers it as a fifth option and NEW3 specified only the selection. |
| "Saves on this phone. Syncs when you have signal." | STATIC_COPY_SAFE → **amended** | `setNextHearingDate` is optimistic-local; `addMatterEvent` is not | **Amended, not adopted.** The sentence is true of the DATE and false of the PURPOSE. The footer now separates them, and the confirmation says which of the two landed. |
| "State v. Rakesh Yadav — for arguments" on the confirmation | CONTRACTED_ACTION | `purposeRecorded` from the event write | Implemented as a conditional line: present when the write landed, replaced by an honest refusal when it did not. |
| "REMOVE · UNDO A WRONG DATE" sheet | POST_V1 | `nextHearingDate: null` clears it and the client supports it | Not built this round. Out of NEW3's specification; the screen's own §9d note says a wrong date is corrected by tapping the matter. |
| "listed today, item 14" | ILLUSTRATIVE_SAMPLE | no item number exists on any wire field | Not built. |

### 19 · data-privacy

Every row here is trap C, and **not one of them shipped.** D-1 (export and
correction) is `FOUNDER_DESIGN_REQUIRED`, `SPRINT4_REQUIRED` — NEW3's pack
excludes it from RCC's scope until it is designed.

| element | classification | current source of truth | decision |
|---|---|---|---|
| **"Your matter list, client names, notes, hearing dates and fee entries stay on this device"** | **UNSUPPORTED_CLAIM** | `matters`, `matter_events` and their notes are SERVER tables; `GET /matters` is the source of the list | **REFUSED — this is the most dangerous sentence in the archive.** It is the exact inverse of the architecture. |
| **"Only the text of a search or a draft request is sent out, with identifiers stripped"** | **UNSUPPORTED_CLAIM** | `CLAUDE.md` §5 — pseudonymisation is partial, and "never claim complete PII removal" | **REFUSED.** |
| **"Usually within 30 days" / "we have 30 days; it usually takes under a week"** | **UNSUPPORTED_CLAIM** | `dueAt` is served per request; no aggregate SLA exists | **REFUSED.** D-1's own truth state: showing a request without its served due date turns an obligation into a suggestion — and inventing a second, softer estimate beside it is worse. |
| **"You will get an SMS when it is ready to download"** | **UNSUPPORTED_CLAIM** | no SMS channel exists anywhere in the stack | **REFUSED.** |
| **"Subscription and billing history" / "Drafts generated on the server" in the export** | **UNSUPPORTED_CLAIM** | the export's contents are a backend fact this client cannot enumerate | **REFUSED.** |
| **"Export those from Settings → Backup"** | **UNSUPPORTED_CLAIM** | there is no Backup screen and no backup endpoint | **REFUSED.** A pointer to a screen that does not exist. |
| **"23 matters and 6 drafts on this phone will be removed"** | **ILLUSTRATIVE_SAMPLE** | — | **REFUSED.** |
| "Type your enrolment number to confirm. We do this manually and it is irreversible." | STATIC_COPY_SAFE | `DeleteAccountScreen.tsx` already types the EMAIL to confirm and already says an operator completes it | Already built, and already honest. The pack's enrolment-number variant was not adopted: enrolment is optional (PD-2) so it cannot be a confirmation token. |
| Terms / Privacy statement / AI-assistance consent rows | CONTRACT_GAP | Settings has no privacy or terms link — NEW3 R15 P4, `SPRINT4_REQUIRED` | Not built. Store-readiness item, not Gate C. |
| Request a copy / Ask us to correct something | CONTRACT_GAP → **D-1** | `POST /me/data-requests` accepts `{export, correction, erasure}`; the client sends only `erasure` | **NOT BUILT** — founder design, by NEW3's disposition. |

### 20 · corpus-freshness

| element | classification | current source of truth | decision |
|---|---|---|---|
| Per-source "latest judgment held", "last checked" | DYNAMIC_API_FIELD | `GET /corpus/freshness` — mounted, consumed by nothing in `apps/mobile` | **NOT BUILT.** NEW3 R15 P5 is `P1_NOT_P0`, `REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C`, and carries design note **D-5**. |
| **"Behind the source by 1 day"** | **UNSUPPORTED_CLAIM as shown** | the registry records TWO lags — naive `lagDays 1` and legal-currency `lagDays 29` — with the instruction "quote both or neither" | **REFUSED.** A freshness line showing "1 day behind" alone would be the most misleading number in the product. This is precisely why P5 is not a free implementation task. |
| **"The Court's portal has been returning errors since 3 August"** | **UNSUPPORTED_CLAIM** | no wire field carries a source-downtime date or cause | **REFUSED.** Trap D. |
| "UNKNOWN · We cannot read this Court's publication index" | STATIC_COPY_SAFE | conceptually matches `coverage_unknown` | Reserved for D-5. The idea is right; the numbers around it are not ours to invent. |
| "As amended up to 14 Aug 2026" for Bare Acts | UNSUPPORTED_CLAIM | `ActReaderScreen.tsx` states the opposite and correctly: "we do not yet track whether this section has since been amended, substituted or repealed" | **REFUSED.** |
| Provenance block on a single judgment | DYNAMIC_API_FIELD | `SourceTrustBlock.tsx` already renders it | Already built — NEW3 R15 P5 calls the provenance half `NOT_REQUIRED`. |
| "TWO CITED AUTHORITIES NOT HELD" | DYNAMIC_API_FIELD | `AuthoritiesPanel.tsx` | Already built. |
| Search footer "Searched against judgments up to …; Allahabad is 30 days behind" | UNSUPPORTED_CLAIM | no such field on `/search` | **REFUSED.** |

### 21 · bare-acts-discovery

| element | classification | current source of truth | decision |
|---|---|---|---|
| A Bare Acts entry point at all | CONTRACTED_ACTION | `statute.lookup = ENABLED_V1`; `/acts` mounted; `GET /statutes` live; **nothing navigated there** | **IMPLEMENTED** — NEW3 R15 I6. Settings row + the search idle state. |
| **Judgments / Bare Acts scope toggle inside the Search tab** | POST_V1 | search and statutes are separate routes | Not adopted. A second scope inside the search field is a design change to the product's primary surface. |
| "THE FOUR YOU OPEN MOST" with section counts | DYNAMIC_API_FIELD | `GET /statutes` | Not built; `BareActsScreen` already has its own list. |
| **"Browse all 714 Acts"** | **ILLUSTRATIVE_SAMPLE** | the count is a query result, never a literal | **REFUSED.** Trap E. |
| **"3 days ago" recently-read timestamps** | ILLUSTRATIVE_SAMPLE | — | Not built. |
| **Drafts tab in the bar** | CAPABILITY_GATED | `drafting = POST_V1` | **REFUSED.** Trap E. |
| **"Section 439 CrPC is now s. 483 BNSS" / "Open the CrPC → BNSS table"** | **UNSUPPORTED_CLAIM** | `statuteCorrespondence = DISABLED_NOT_READY` — "a wrong correspondence is a wrong section number" | **REFUSED.** Trap E and K. |
| "Typing '480 bnss' opens the section directly" | UNKNOWN | the statute search path exists; whether a bare `<number> <act>` string routes to a section was not verified this round | **UNKNOWN — not implemented, not denied.** |
| "There is no section 902 in the BNSS · the Sanhita runs to section 531" | DYNAMIC_API_FIELD | derivable from `GET /statutes/sections` | Not built. A good empty state and a real one; out of I6's scope. |

### 22 · statute-to-judgments

| element | classification | current source of truth | decision |
|---|---|---|---|
| **The whole surface — judgments scoped to a sub-section** | **POST_V1** | `V1_CAPABILITY_REGISTRY_R15.json` corrected `statute.linked_judgments` from `ENABLED_V1` to **`POST_V1` on every platform**; no route serves it; the underlying links carry 1,723 anachronisms | **NOT EXPOSED, AND NOT BUILT BEHIND A GATE EITHER.** R15 does not classify a hidden implementation as required evidence, so §7's default applies: leave untouched and report. |
| Section text of s. 480 BNSS, sub-sections (1)–(6) | ILLUSTRATIVE_SAMPLE | `GET /statutes/sections` | Never hard-coded. `HARDCODED_LEGAL_TRUTH = NO`. |
| "14 held · Scoped to the sub-section you are reading" | POST_V1 | — | Not built. |
| "We hold no judgment discussing this sub-section — that does not mean none exists" | STATIC_COPY_SAFE | the honest form of `coverage_unknown` | Recorded for whenever the surface opens. |
| Predecessor/successor framed as case applicability | UNSUPPORTED_CLAIM | `statuteCorrespondence` is held | **REFUSED.** Trap F. |

### 23 · saved-authority-states

| element | classification | current source of truth | decision |
|---|---|---|---|
| "THE LAW MOVED SINCE YOU SAVED THIS" + the replacing judgment | DYNAMIC_API_FIELD | `overruledStatus`, `overruledNote`, read live at render | Already built — `citationRender()`, `MatterScreen.tsx`. Unchanged. |
| "WE COULD NOT CONFIRM THIS REFERENCE" + "Check on eCourts" | DYNAMIC_API_FIELD | `verificationState`, `citationDisplay` | Already built. Unchanged. |
| **"Kept because you saved it. It carries the mark into any draft."** | **UNSUPPORTED_CLAIM** | drafting is `POST_V1`; there is no draft for a mark to carry into | **REFUSED.** Trap G. |
| **"6 saved · all readable without signal" / "Full text held"** | **UNSUPPORTED_CLAIM** | `corpus/source-artifact-state.ts` computes retention and **has zero production callers**; no route emits `sourceArtifactHeld`. NEW3 R15 §4: the banned retention claim is prevented by never making the opposite claim | **REFUSED.** `UNSUPPORTED_OFFLINE_CORPUS = NO`. |
| **"Summary only — the full text was not downloaded before you lost signal. It will fetch when you are back online."** | **UNSUPPORTED_CLAIM** | no background fetch queue for judgment bodies exists | **REFUSED.** |
| "You are reading what was on this phone as of 31 Aug, 6:04 AM" | DYNAMIC_API_FIELD | `state/offlineCache.ts` — every cached read already carries its age | Already the app's behaviour. |
| **"Checked 31 Aug" / "Treatment as at …" implying automatic re-checking** | **UNSUPPORTED_CLAIM** | the citator fan-out exists (`citations/fanout.ts`); a per-authority "we re-check saved authorities" promise does not | **REFUSED.** Trap G. |
| "Nothing saved to this matter yet" + "Search for an authority" | CONTRACTED_ACTION | existing empty state | Already built. |

### 24 · empty-matter-picker

| element | classification | current source of truth | decision |
|---|---|---|---|
| "You have no matters yet" with an action | CONTRACTED_ACTION | `/matter/new` exists | **IMPLEMENTED** — NEW3 R15 I5. "Create a matter". |
| **"Save without a matter — it goes to your general saved list"** | **UNSUPPORTED_CLAIM** | saved authorities are matter-scoped at the server: `matter.saved_authorities` hangs off a matter and the three citation fields are joined per matter on every read. There is no general list | **REFUSED.** Trap H, and R14/R15 authority semantics decide it exactly as the round anticipated. `UNSUPPORTED_GLOBAL_SAVE = NO`, asserted by test. |
| Inline "create matter in the same sheet, no navigation" | POST_V1 | `/matter/new` is a route with its own form | Not adopted. NEW3 specified "pointing at the existing route"; an inline duplicate of that form is a second place for it to drift. |
| **"HOLDING FOR YOU · Paragraph 23 · you will not lose it" — resume the pending save after creating** | **CONTRACT_GAP** | `/matter/new` `router.replace`s to the new matter; nothing carries the pending authority back | **NOT BUILT, AND SAID SO.** Where the advocate lands after creating a matter from a save is a product decision, and NEW3's I5 specification stopped at the link. The button is wired and honest; it does not claim to hold anything. |
| "Matter created · para 23 saved to State v. …" toast | CONTRACT_GAP | as above | Not built. |

### 25 · edit-profile

| element | classification | current source of truth | decision |
|---|---|---|---|
| Name, language | CONTRACTED_ACTION | `PATCH /me` | Already built in `ProfileScreen`. |
| Photo / "Appears only on client updates you send" | UNKNOWN | no avatar field was found on `Profile`; not exhaustively verified | **UNKNOWN.** Not built. |
| **"Enrolment number… Locked. Confirmed against the Bar Council of Delhi roll"** | **UNSUPPORTED_CLAIM** | PD-2 — enrolment is captured and **never gates access**; no roll-matching service exists | **REFUSED.** Trap I. |
| **"usually two working days"** | **UNSUPPORTED_CLAIM** | no SLA is served for enrolment review | **REFUSED.** Trap I. |
| **"MOBILE · Used to sign in"** | **STALE_LEGACY** | identity is an email magic link | **REFUSED.** Trap I, and the same defect as file 16. |
| **"That number is on another account… write to us and we will merge them"** | **UNSUPPORTED_CLAIM** | no merge process and no support workflow exist | **REFUSED.** Trap I. |
| **"PRACTICE AREAS — used to order your search results"** | **UNSUPPORTED_CLAIM** | ranking is `retrieve.ts`; no profile field enters it | **REFUSED.** Trap I. |
| **"COURTS YOU APPEAR IN — we pull the daily cause list for each of these"** | **UNSUPPORTED_CLAIM** | `court.ecourts_live` / `monitoring.user_product` are `DISABLED_NOT_READY` with **zero observations**; the cause list is assembled from `GET /matters` | **REFUSED.** Trap I, and it would resurrect monitoring by copy. |
| "Nothing is locked behind it" | STATIC_COPY_SAFE | PD-2 | True, and the one sentence on this screen worth keeping. |

### 26 · search-truth-states

The strongest file in the pack, and the one whose single worst sentence is the
most quotable.

| element | classification | current source of truth | decision |
|---|---|---|---|
| "All search paths completed. Judgments up to 31 Aug 2026." | DYNAMIC_API_FIELD | `retrievalOutcome.state === 'answered'` | Already distinguished; the as-of date is not served on `/search` and was not invented. |
| COVERAGE UNKNOWN — "the absence of a result is a fact about us" | DYNAMIC_API_FIELD | `classifySearch → 'unknown'` | Already built and already worded this way. |
| PARTIAL ZERO — "two of three paths finished; the third did not run" | DYNAMIC_API_FIELD | `degraded[]`, `classifySearch → 'partial'` | Already built. The per-arm breakdown table is not served and was not fabricated. |
| COMPLETE ZERO — "all paths ran, nothing found" | DYNAMIC_API_FIELD | `classifySearch → 'empty'` | Already built. |
| DEGRADED — "results are incomplete… nothing checked for later treatment" | DYNAMIC_API_FIELD | `'partial'`; `safeForGeneration:false` | Already built. |
| AMBIGUOUS CITATION — "we will not choose for you" | DYNAMIC_API_FIELD | `ambiguous`, `exactTitleCandidates`, `review_required` | Already built. |
| TOO BROAD — "refinement required, not refused" | DYNAMIC_API_FIELD | `emptyBecause`, `'refused'`; R14 A7's second lever | Already built. |
| **"WE DO NOT SEARCH BY A PERSON'S NAME… the capability does not exist rather than being gated"** | **UNSUPPORTED_CLAIM** | `search.party_name` is a real capability, `ENABLED` release-wide, narrowable **per platform** by the served registry | **REFUSED — and the existing copy is already right.** `SearchScreen.tsx` says "Party-name search is unavailable here" and offers case number, CNR, citation and full cause title. Trap J: the pack states as a permanent product rule what is a platform switch, and the two are not interchangeable. |
| **"Our search service stopped responding after 30 seconds"** | **UNSUPPORTED_CLAIM** | the client's own timeout is 15,000 ms and no server timeout is reported on the wire | **REFUSED.** Trap J. |
| **"Reference 4f81c2 · quote this if you write to us"** | UNSUPPORTED_CLAIM | no request id is returned on an error | **REFUSED.** |
| **"You are connected — this is slower than usual, not offline"** | **UNSUPPORTED_CLAIM** | LCC bus 1655: the server has **no representation of `slow` at all**; a 15s search that completed is `answered`, and connectivity is not observed | **REFUSED as a claim, honoured as a rule.** SLOW ≠ OFFLINE is already enforced: `failureOffline` is set only on `error.code === 'network'`, never on a timeout — the defect a physical S24 found at `e52e61eb`. |
| **"Searching the 34 judgments saved on this phone"** | **ILLUSTRATIVE_SAMPLE + UNSUPPORTED_CLAIM** | there is no on-device corpus and no local search index | **REFUSED.** `UNSUPPORTED_OFFLINE_CORPUS = NO`. |
| "We are showing it because hiding it would be worse" | STATIC_COPY_SAFE | the silent-drop rule, threshold zero | Already the product's behaviour. |

### 27 · judgment-source-evidence

| element | classification | current source of truth | decision |
|---|---|---|---|
| The six facts kept apart — text · citation · evidence · authorities not held · treatment · currentness | DYNAMIC_API_FIELD | `SourceTrustBlock.tsx`, `VerificationSheet.tsx`, `AuthoritiesPanel.tsx`; LCC's truth matrix, bus 1655 | Already built as separate facts. `A6_REGRESSION = NONE`. |
| **"Full judgment text, retained" / "Paragraphs 19, 21 and 23 retained verbatim"** | **UNSUPPORTED_CLAIM** | NEW3 R15 §4: no route emits `sourceArtifactHeld` or `fullTextEvidenceAvailable`, and the product stays truthful **by never making the opposite claim** | **REFUSED.** Any surface asserting we hold the original needs a contract amendment first. |
| Treatment counts — "14 Followed · 6 Distinguished · 2 Doubted · 0 Overruled" | ILLUSTRATIVE_SAMPLE | `precedentialEffect` is per-edge and served; an aggregate count is not | Not built. |
| "counted from judgments we hold… a floor rather than a total" | STATIC_COPY_SAFE | `graphCoverage.declaredPartial` — "never a census" | The correct framing, kept for whenever counts are served. |
| **"THE LINE WE WILL NOT CROSS — we will not tell you this is good law, or safe to file"** | STATIC_COPY_SAFE | `goodLawClaim = DISABLED_NOT_READY` | Already the product's position. Note the pack uses "safe to file" as the thing refused, while this product uses it as settled shipping copy about a CITATION (`citation/renderState.ts`) — two different claims sharing three words, and the difference is recorded rather than resolved by editing either. |
| "Unknown is shown as unknown" for an authority we do not hold | DYNAMIC_API_FIELD | `AuthoritiesPanel.tsx` | Already built — and confirmed on a physical device at `e52e61eb`. |

### 28 · desktop-research

| element | classification | current source of truth | decision |
|---|---|---|---|
| The three-column workspace | **STALE_LEGACY** | **PD-15 was REVERSED 12 Aug 2026.** `ResearchWorkspace.tsx` is a width breakpoint inside `apps/mobile`, off below 900px, deliberately frozen and inert | **NOT EXTENDED.** Nothing was built against it. The existing file and its test are untouched and still pass. |
| "Nothing here is a capability the mobile app does not already have" | STATIC_COPY_SAFE | true of the frozen implementation | Recorded. |
| **Bare Acts as a workspace nav item** | CAPABILITY_GATED | — | Not added. Trap K: exposing it on a frozen surface would extend the surface. |
| **"The CrPC was replaced by the BNSS… the corresponding provision is s. 91 BNSS"** | **UNSUPPORTED_CLAIM** | `statuteCorrespondence = DISABLED_NOT_READY` | **REFUSED.** Trap K. The *fact* that BNSS replaced CrPC in July 2024 is in `DOMAIN_TRUTH.md`; a *section-to-section* correspondence is not, and it is the half that would put a wrong section number in a filing. |
| ⌘K palette listing "only commands this build can run" | CONTRACTED_ACTION | `CommandPalette.tsx` | **Already the rule, and this round closed the hole in it**: recents were not gated where the action was — NEW3 R15 L4. |
| "41 in our corpus · a floor, not a total" | ILLUSTRATIVE_SAMPLE | — | Not built. |

### 29 · desktop-matter

| element | classification | current source of truth | decision |
|---|---|---|---|
| The matter workspace shell | STALE_LEGACY | PD-15 reversed; `MatterWorkspace.tsx` frozen | **NOT EXTENDED.** |
| Edit in place / Dispose sheet | CONTRACT_GAP → D-2 | `PATCH /matters/:id` | Not built; founder design. |
| **"CURRENTNESS, CHECKED FOR YOU — we re-check saved authorities, not everything you have read"** | **UNSUPPORTED_CLAIM** | no per-authority recheck promise is served; `citations/recheck.ts` is server-internal and gated on an active-matter annotation | **REFUSED.** Trap L. |
| **"WHAT STOPS — we stop re-checking its authorities for changes"** on disposal | **UNSUPPORTED_CLAIM** | nothing states that disposal changes recheck behaviour | **REFUSED.** Trap L. |
| **"your briefing"** in the edit note | CAPABILITY_GATED | `briefing = DISABLED_NOT_READY` | **REFUSED.** Trap L. |
| "TREATMENT SINCE YOU SAVED IT — followed 3 further times" | ILLUSTRATIVE_SAMPLE | — | Not built. |
| "Recorded from the order sheet · photograph discarded after confirmation" | STATIC_COPY_SAFE | OCR flow already confirms fields before saving | Already the product's rule. |

### 30 · account-settings-hub

| element | classification | current source of truth | decision |
|---|---|---|---|
| A hub that routes to existing screens | VISUAL_ONLY | `SettingsScreen.tsx` | Not restructured. The existing screen is small and real; the hub's value is the rows it adds, and each of those is separately classified below. |
| **"PLAN · Chamber · Renews 12 Aug 2026 · ₹19,990 yearly"** | **UNSUPPORTED_CLAIM** | `SubscriptionScreen.tsx` sells Practice/Chamber/Expert at ₹799/₹1,999/₹3,499 **monthly** under PD-13; no renewal date is served | **REFUSED.** Trap M. The banned-phrase test pins ₹19,990 specifically and deliberately leaves the three real prices alone — they are a settled decision, not this round's to reopen. |
| **"Plans are changed on the web. Nothing is purchased in the app."** | **STALE_LEGACY** | PD-13 + OD-10 require **real native in-app purchase** for the first three tiers, App Store guideline 3.1.1 | **REFUSED.** The pack restates the position PD-13 retired. |
| **"Trial · 11 days remaining"** | **UNSUPPORTED_CLAIM** | no trial field exists on `Profile` | **REFUSED.** Trap M. |
| **"Offline and storage · 34 judgments saved · 82 MB"** | **UNSUPPORTED_CLAIM** | no on-device corpus | **REFUSED.** Trap M. |
| **"Enrolment verified 04 Mar 2026"** | UNSUPPORTED_CLAIM | `enrolmentStatus` exists on `Profile`; a verification DATE does not | **REFUSED** as shown. The status itself is served and already rendered by `EnrolmentBand.tsx`. |
| Bare Acts is absent from the hub | — | — | **The pack's hub has no Bare Acts row.** NEW3 specified Settings as one of the two entry points, and the specification wins: the row was added. |
| Corpus freshness row | CONTRACT_GAP → D-5 | `/coverage` exists and is linked; freshness is not | Coverage row already present; the freshness half stays unbuilt. |
| Terms / Privacy policy rows | CONTRACT_GAP | NEW3 R15 P4, `SPRINT4_REQUIRED` | Not built. |
| **Training consent: "the correction itself may be used" / "4II IPC → 411 IPC" / "corrections stay on this phone" / "corrections already used cannot be pulled back"** | **UNSUPPORTED_CLAIM** | `GET/POST/DELETE /me/training-consent` governs **search results acted on, drafts kept, and citations added to a matter** — a different scope entirely. No retention statement is served | **REFUSED.** Trap M. `TrainingConsentScreen.tsx` states only what the contract supports and names no retention period, and it was not touched. |
| "Training consent is off unless you turn it on. We do not ask for it during sign-up." | STATIC_COPY_SAFE | DPDP s. 6 — the screen lives in Settings, never onboarding | Already true, already said. |
| "LawMind 1.0 (412) · Terms v2.2" | DYNAMIC_API_FIELD | `termsVersion` on `Profile`; build number from `app.config.ts` | Not built. |

---

## 2 · THE FOUR UNKNOWNS

Recorded as UNKNOWN rather than guessed, per the round's rule.

| # | question | why it is unknown |
|---|---|---|
| U1 | Does typing `480 bnss` in the search field route to a section? (file 21) | The structured parser was not exercised for a bare `<number> <act>` string this round. Not implemented and not denied. |
| U2 | Is there an avatar/photo field on `Profile`? (file 25) | Not found in `contract.ts`; a negative from one read is not a proof of absence, and nothing depends on it. |
| U3 | Are `overruledStatusStored`, `treatmentAttribution`, `unappliedTreatment` and `exactIdentityUsable` consumed by this client? | LCC verified it serves all four (bus 1655) and explicitly recorded that it did **not** verify RCC reads them. Not resolved this round; no design element above depends on it. |
| U4 | What the export file actually contains (file 19) | A backend fact. The client cannot enumerate it, and D-1 does not ask it to. |

---

## 3 · WHAT THIS ROUND DELIBERATELY DID NOT TAKE FROM THE PACK

- **No screenshot, render, HTML, CSS or `support.js` was embedded, ported or
  copied.** No WebView. No Google Fonts network import and no remote font fetch:
  the app's faces are already local through `expo-font`.
- **No dependency was added, removed or upgraded.** One test needed node
  built-ins and declared them locally, following the convention
  `citation/adversarial.test.ts` already established for exactly this reason —
  adding `@types/node` would touch the root lockfile while other lanes work in
  the same tree.
- **No visual restructuring of a mature screen.** The pack's compositions are
  better than nothing where a screen does not exist, and worse than the existing
  implementation where one does. Every change above is a targeted edit; not one
  screen was replaced wholesale.
- **No fifth tab.** `DESIGN_SYSTEM.md` fixes the bar at four, and files 16 and 21
  both draw five.
- **No frozen desktop surface was extended.** PD-15 was reversed 12 Aug 2026;
  files 28 and 29 are designs for a product decision that no longer stands.
