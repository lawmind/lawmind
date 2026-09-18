# STORE / RELEASE PRODUCT CHECKLIST V1

## 0 · CURRENT RELEASE STATE — SHIP, 18 September 2026 (S4-T0.1) — read before §1

Owner: **SHIP** (NEW3/RCC/LCC below are legacy lane names). Authority: roadmap v7.4
§14 (Amendment A1). Claims: `V1_CLAIMS_REGISTER_R17.md` against the current capability
registry named in `docs/CURRENT_STATE.md`. §1 onward is the 25 Aug checklist as
written. Where it says "no website exists" or "RCC builds `apps/site`", it is
superseded by 0.2.

### 0.1 Account readiness (roadmap §14.14): measure, do not assume

`VERIFIED` = observed in console/CLI/API · `FOUNDER_CONFIRMED` = founder statement with date · `UNKNOWN`.

| Row | State 18 Sep 2026 | Evidence / next step |
|---|---|---|
| APPLE_DEVELOPER_MEMBERSHIP | UNKNOWN | founder: confirm membership + type |
| APPLE_ACCOUNT_TYPE | UNKNOWN | individual vs organization (seller name = legal entity if org) |
| APPLE_ORGANIZATION_VERIFIED | UNKNOWN | — |
| APPLE_DUNS_IF_ORG | UNKNOWN | Helmor Pvt Ltd D-U-N-S, if org |
| APPLE_BINDING_AUTHORITY | UNKNOWN | enrolling person must be able to bind the entity |
| APPLE_WORK_EMAIL | UNKNOWN | on the org's domain |
| APPLE_TEAM_ID | UNKNOWN | not in `eas.json` / `app.config.ts` |
| APPSTORE_CONNECT_APP_RECORD | UNKNOWN | — |
| IOS_BUNDLE_ID_RESERVED | UNKNOWN | configured value `co.lawmind.app` (VERIFIED in `app.config.ts`); reservation unobserved |
| SIGNING_CERTIFICATES | UNKNOWN | — |
| PROVISIONING | UNKNOWN | — |
| TESTFLIGHT_ACCESS | UNKNOWN | — |
| PLAY_ACCOUNT_TYPE | UNKNOWN | personal vs organization; do NOT infer the closed-testing rule |
| PLAY_ORGANIZATION_VERIFIED_IF_APPLICABLE | UNKNOWN | — |
| PLAY_DUNS_IF_ORG | UNKNOWN | — |
| PLAY_LEGAL_NAME_ADDRESS | UNKNOWN | — |
| PLAY_CONTACT_VERIFIED | UNKNOWN | — |
| PLAY_PAYMENT_PROFILE_IF_APPLICABLE | UNKNOWN | only if paid |
| PLAY_APP_REGISTERED | UNKNOWN_PENDING_CONSOLE_CHECK | 30 Sep 2026 applies to packages **distributed on Play**: unregistered ones are removed. Google auto-registers existing and new Play apps, and creating an app in Play Console registers its package at creation. LawMind's Play state is unobserved, so this is a VERIFY, not a publish deadline — `docs/FOUNDER_QUEUE.md` |
| PLAY_PACKAGE_ID | configured `co.lawmind.app` (VERIFIED in `app.config.ts`) | registration unobserved |
| PLAY_DATA_SAFETY | NOT STARTED | needs working deletion URL (0.2) |
| PLAY_SIGN_IN_DETAILS | NOT READY | `REVIEW_ACCESS_V1` (roadmap §14.7) |
| EAS_ACCOUNT | UNKNOWN | `eas` CLI not installed on the workstation; no `owner` in `app.config.ts` |
| EAS_PROJECT / EAS_PROJECT_ID | ABSENT in config (VERIFIED: no `extra.eas.projectId`) | create/link before any EAS build; **not** gated on push |
| EAS_ORG | UNKNOWN | — |
| IOS_CREDENTIAL_OWNER | UNKNOWN | — |
| ANDROID_SIGNING_OWNER | UNKNOWN | — |
| iOS toolchain image | VERIFIED config: `eas.json` production `macos-tahoe-26.5-xcode-26.6` | build/archive proof = NOT PROVEN |

Push stays a deferred feature (Shape B makes no push or monitoring claim). EAS
project/build readiness is a separate, current release obligation.

### 0.2 Compliance URLs: stable release contracts, not promo-site work

| URL | Last observed | Note |
|---|---|---|
| `https://lawmind.co/privacy` | 200 (15 Sep) | copy must match runtime data practice (`DATA_SAFETY_MATCHES_RUNTIME`) |
| `https://lawmind.co/contact` (support) | 200 (15 Sep) | support mailbox must be real |
| `https://lawmind.co/terms` | 200 (15 Sep) | if submitted |
| `https://lawmind.co/delete-account` | **404** (15 Sep) | `EXTERNAL_DELETE_AUTH_V1`, `docs/EXTERNAL_ACCOUNT_DELETION_WEB.md` |

Served from `lawmind/lawmind-site` (external repo). These URLs must survive any
promotional-site teardown/rebuild. Not re-probed in this docs-only round.

### 0.3 Also required at Gate D

`SECURITY_RELEASE_BASELINE` (roadmap §14.15) · alert delivery proof (§13.5) ·
Android targetSdk ≥ 36 from the real release artifact · Xcode 26+/iOS 26 SDK+ real
archive · `supportsTablet` decided · iOS party-search default OFF ·
`LAUNCH_COMMERCE` chosen. **If PAID_V1:** a supported **PBL8+** (PBL9 current),
re-measured before implementation. No billing SDK if FREE_BETA.

---

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-6. NEW3 owns the product
content and the claims. **RCC implements client corrections; LCC implements
server corrections.** Store copy is bound by
`WEBSITE_CLAIM_EVIDENCE_MATRIX.md` exactly as the website is — a store listing
is a public claim surface with a slower correction cycle than a website, so if
anything the discipline is tighter.

Status: `✅ done` · `⚠️ blocked, owner named` · `☐ not started` · `— not applicable at launch`

---

## 1 · Identity — already correct, verified in `app.config.ts`

| Item | Value | Status |
| --- | --- | --- |
| Display name | `Lawmind` | ✅ |
| iOS bundle id | `co.lawmind.app` | ✅ |
| Android package | `co.lawmind.app` | ✅ |
| Version | `0.1.0` | ✅ |
| Orientation / UI style | portrait, light-locked (dark mode is a v2 decision) | ✅ |
| Icons | iOS icon, Android adaptive fore/back/monochrome | ✅ |
| Deep-link scheme | `lawmind` | ✅ |

**One real gap:** `app.config.ts` throws at build time if `EXPO_PUBLIC_API_URL`
is unset for an EAS profile, rather than shipping a binary that calls a guessed
URL. That refusal is correct and stays. It means **no production binary can be
built until `FQ-HOSTING` resolves the per-channel API URL.** ⚠️ founder.

`eas.json`'s `production` and `submit.production` blocks are empty. ⚠️ RCC.

---

## 2 · Store listing copy

Every line below is bound to a claim row. Nothing here may be edited without
editing the matrix first.

### 2.1 Short description (Play, 80 chars)

> Indian case law with the source of every line, and every treatment recorded.

`[B1] [B2a]` · 76 chars. **The earlier draft — "tells you when the law has
moved" — is `BLOCKED` by NEW2 bus 1145**: 99 of 104 badge-bearing judgments rest
on a law reporter's annotation we have not confirmed, so that sentence puts a
court where a reporter belongs.

### 2.2 Subtitle (App Store, 30 chars)

> Verified Indian case law

`[B1]` · 24 chars.

### 2.3 Full description

> **LawMind is a research and drafting assistant for advocates practising in India.**
>
> Find the judgment you already know — by citation, case name or case number. If
> a citation or a name matches more than one judgment, LawMind shows you all of
> them. It does not pick one for you. `[A1] [A2] [A4]`
>
> When a later judgment or a law report records that an authority you saved was
> overruled, set aside or doubted, LawMind marks it and shows you the record it
> came from — read fresh every time you open it, not cached from when we last
> checked. Most of those records are law-report annotations rather than a court's
> own reasoning, and LawMind says so rather than telling you the court said it.
> `[B2a] [B3]`
>
> Keep the authorities, hearing dates, notes and orders for a case together in
> one matter. `[C1]`
>
> **What LawMind will not do**
> · It will not tell you a case is good law. It tells you what the record says
>   and where it came from — the judgment is yours.
> · It will not hide a problem behind a paywall. If a saved authority has moved,
>   you see it, on every plan.
> · It will not claim to have removed every name from your documents.
>   Pseudonymisation is partial and we say so. `[C7]`
>
> Built for Indian practice — including BNS, BNSS and BSA — in English and
> Hindi. `[D4]`
>
> LawMind is free while we get it right.

**Forbidden in the listing**, and each has been checked against the current
draft: any fact-pattern or "describe your case" language `[A5]`; any semantic or
concept-search language `[A6]`; "finds the authority against you" `[A7]`;
"18.7 million" anywhere near AI or search-reach language `[A8]`; any Hearing Pack
reference `[E1]`; any accuracy percentage `[E7]`; any "first"/"only"/"best"
`[D3]`.

**Keyword note:** the obvious ASO keywords for this category are exactly the
claims we are forbidden to make. `docs/ASO.md` predates the claim matrix and
must be re-read against it before any keyword field is filled. ☐ NEW3.

---

## 3 · Screenshots

Same five as `WEBSITE_PRODUCT_SPEC_V1.md` §5, same rules. Store-specific:

| Item | Status |
| --- | --- |
| Real data, real device — **no mockups** (a fabricated screenshot of a legal product is a fabricated legal record) | ☐ RCC |
| Shot 2 (ambiguity: `2023:AHC:169979` returning both judgments) is the **first** screenshot on both stores | ☐ RCC |
| No `Test Court` row in any frame (16 currently in the corpus) | ☐ RCC, NEW3 verifies |
| No briefing, no Hearing Pack, no price in frame `[C3] [E1]` | ☐ RCC |
| No search box showing a case name mixed with a topic word `[A2b]` | ☐ RCC |
| iOS 6.7"/6.5" and Android phone sizes; **no tablet screenshots** — `supportsTablet: true` is set but no tablet layout has been designed or tested | ⚠️ RCC: either produce tablet screenshots or set `supportsTablet: false` before submission |

---

## 4 · URLs the stores require

| Item | Status |
| --- | --- |
| Privacy policy URL (**mandatory both stores**) | ⚠️ blocked — no website exists (`WEBSITE_PRODUCT_SPEC_V1.md` §0). RCC builds `apps/site`; NEW3 owns the content. |
| Support URL | ⚠️ same |
| Terms URL | ⚠️ same |
| Marketing URL | — optional |

**This is the hard launch dependency, and it is not a small one.** Both stores
reject a submission without a reachable privacy policy URL. `lawmind.co` is
verified with DNS via the Spaceship API and serves nothing. **The website is not
a marketing nicety — it is a store gate.**

---

## 5 · Review / demo account

App review will find a login wall on first launch. Both stores require working
credentials.

| Item | Status |
| --- | --- |
| A demo account with a stable email and password, or a documented magic-link path a reviewer can complete | ☐ LCC + NEW3 |
| **The reviewer must reach real content.** A reviewer whose search returns nothing concludes the app does not work. Given the `sparse_unbounded` finding, the demo notes must give a query that *ranks* — e.g. `cheque bounce section 138` (rarest df 0.00089) — and never `anticipatory bail` (0.069, refused). | ☐ NEW3 |
| Demo notes state which features are behind server flags and off | ☐ NEW3 |
| The account is pre-populated with one matter and two saved authorities so the workflow is visible | ☐ LCC |

Authentication is magic-link (better-auth). **A reviewer cannot receive an email
at a fake address**, so either a fixed test account bypasses the link server-side
or the notes carry a real reachable mailbox. ⚠️ LCC — this is a genuine
submission blocker and it has no owner yet.

---

## 6 · Data-safety / privacy declarations

| Question | Answer | Owner |
| --- | --- | --- |
| Does the app collect personal data? | Yes — email, name, phone, bar enrolment number (captured, never gates access) | ✅ |
| Is data encrypted in transit? | Yes | ✅ |
| Can users request deletion? | **Yes, in-app** — `/me/data-requests` exists and is wired | ✅ LCC |
| Is data shared with third parties? | Model providers, on pseudonymised content, one document per request | ✅ |
| Third-party disclosure must not claim complete PII removal | Coverage is partial and must be declared as such | ✅ NEW3 |
| Uploads of client documents | ⚠️ **the countersigned DPA is still owed (OD-6) and the admin surface refuses sensitive routing without it.** If uploads are not in the launch build, the declaration must not describe them. | ⚠️ founder |

**Play requires the Data Safety form to match observed app behaviour.** A form
describing document upload while the feature is server-refused is a mismatch.
Confirm the launch build's actual surface before filling it. ☐ NEW3 + RCC.

---

## 7 · Entitlement and paywall state at launch

| Item | Expected | Status |
| --- | --- | --- |
| `premium_entitlements` | OFF | ✅ verified — `/me/entitlements` 404 on all 10 regression matters |
| `premium_preview` | OFF | ✅ verified — 404 on all 10 |
| `premium_generation_jobs` | OFF | ✅ |
| `premium_credits` | OFF | ✅ |
| No IAP products configured | correct — no model or price selected (`PREMIUM_COMMERCIAL_DECISION_PACKAGE_V3.md`) | ✅ |
| Client renders **nothing** for a 404 premium route — no skeleton, no "coming soon", no disabled button | `PREMIUM_PREVIEW_SPEC_V2.md` §2 State D | ☐ RCC, NEW3 verifies |

**Launch with zero purchasable surface.** A store listing that mentions
in-app purchases while none exist is a rejection; one that ships a purchase
flow no price decision supports is worse.

---

## 8 · Product blockers that must clear before submission

| # | Blocker | Owner | Severity |
| --- | --- | --- | --- |
| 1 | **No website** → no privacy/support/terms URL → **cannot submit** | RCC (build), NEW3 (content) | **BLOCKING** |
| 2 | **No reviewer-usable account path** through magic-link auth | LCC | **BLOCKING** |
| 3 | `FQ-HOSTING` — no per-channel `EXPO_PUBLIC_API_URL`, so no production binary can build | founder | **BLOCKING** |
| 4 | `FQ-PUSH-PROJECT` — no EAS project, so push delivery is unproven | founder | HIGH — ship without push rather than with an unproven promise; make no notification claim in the listing `[C5]` |
| 5 | `"anticipatory bail"` returns an empty 200 rendering as "no law found" | LCC/RCC (client rendering), NEW1 (coverage) | **HIGH** — a reviewer or a first user typing the commonest query in Indian criminal practice sees an empty app |
| 6 | `GET /judgments/:id` 500 after 40 s (1 occurrence in 10) | LCC | HIGH — uncharacterised |
| 7 | No device testing at all: no physical iPhone or Android, no VoiceOver/TalkBack run, no low-end Android, no real poor-network test | RCC | HIGH — `MOBILE_RELEASE_AUDIT_V1.md` is a code audit and says so on every row |
| 8 | 16 `Test Court` fixture rows in the production corpus, cumulative | LCC/NEW2 | MEDIUM — none search-reachable; the 10-matter regression checks every run |
| 9 | `supportsTablet: true` with no tablet layout | RCC | MEDIUM — flip the flag or design the layout |
| 10 | `docs/ASO.md` predates the claim matrix | NEW3 | MEDIUM |

**Items 1–3 are absolute.** None is a code problem this lane can solve, two are
one-person tasks, and all three are on the critical path to any submission at
all.

---

## 9 · What may launch, and what must stay hidden

**Launch visible:** citation / case-name / case-number search, ambiguity
disambiguation, the judgment reader, LAW MOVED in all three states, save to
matter, matters with timeline and hearing dates, saved searches, account
deletion.

The set-aside refusal **ships in the code and is not advertised**. It is real and
correct, and measured 25 Aug it fires for exactly 3 judgments in the corpus, all
three being the same leaked test fixture — 73 of the 76 `set_aside` rows map to
effect `overruled` and are allowed, per OD-14's resolution. A safeguard no
advocate can encounter is not a listing claim. `[C2]`

**Hidden at launch, each for a measured reason:**

| Hidden | Reason |
| --- | --- |
| Semantic / concept search | `[A6]` — 0.21% index coverage |
| Fact-pattern search | `[A5]` — 0/6 at every input size |
| Counterargument / adverse-authority automation | `[A7] [C4]` — no abstention state, wrong-domain misses reproduced |
| 24-hour briefings | `[C3]` — depends on the above |
| Hearing Pack and any credit | `[E1]` — no model, no price, no measured unit cost |
| Push notifications | `FQ-PUSH-PROJECT` — delivery unproven |
| Monitoring promise | `[C5]` — no alert observed firing |
| CNR | `[A3]` — until RCC-1 lands and NEW3-7 records PASS |

A hidden feature is hidden **everywhere**: not in the listing, not in a
screenshot, not behind a disabled control, not as "coming soon".
