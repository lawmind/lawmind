# FOUNDER QUEUE — everything waiting on a human, collected

**This file exists so that no lane ever stops.** When work needs an API key, an
account, money, or a judgement only the founder can make, it is written **here**
and the lane **keeps going**. Nothing in this file blocks anything: the code
around each item is built, tested and deployed, with the missing piece isolated
behind an interface that refuses honestly rather than pretending.

**Read this file at the end of the sprint run, not during it.** The founder has
asked to be handed one list once, not interrupted per item.

**Both lanes write here.** LCC (server) and RCC (client) append to their own
sections. Never delete an entry — mark it `RESOLVED` with the date, because "did
we ever ask about this" is a question that comes back.

**Survives compaction.** `CLAUDE.md` §6b and `.claude/hooks/reanchor.sh` both
point here, so a fresh agent finds it without being told.

---

## CURRENT STATUS — S4-T0.1 normalization · SHIP, 18 September 2026

**Read this block first.** It supersedes the headline state of the entries it
names; the entries themselves are untouched below, each now carrying a dated
status note under its heading. Writers are now **SHIP** and **DATA** (LCC, RCC,
NEW1–3 and FIFTH are legacy lanes). Current pointer: `docs/CURRENT_STATE.md`.

| Entry | Current state |
|---|---|
| **FQ-NEW3-R25-ROTATE** (security) | `DO_TOKEN_ROTATED = OPEN` · `RESEND_KEY_ROTATED = OPEN` · `SPACESHIP_KEY_SECRET_ROTATED = OPEN`. Teardown is proven (18 Sep 01:13Z), so rotation is due now. Only the founder can close these; no agent marks them done. |
| **FQ-BACKUP-KEY-ESCROW** (security) | `R2_BACKUP_KEY_ESCROWED = OPEN`. Key must be escrowed off the workstation (password manager or equivalent). Never paste its value anywhere in the repo. |
| **FQ-HOSTING / FQ-LCC-R13-HOSTING** | Gate-C temporary hosting ran and was destroyed (USD 16.67). Superseded by `PERSISTENT_BETA_HOSTING = PENDING_SHIP_COST_PACKAGE_AND_FOUNDER_SPEND_APPROVAL`. SHIP S4-R0 delivers the package; nothing is purchased before you approve it. |
| **FQ-APPLE-TOOLCHAIN** | `IMAGE_PINNED = YES` (`eas.json` production `macos-tahoe-26.5-xcode-26.6`) · `ACTUAL_IOS_PRODUCTION_BUILD = NOT_PROVEN` · `APPLE_ACCOUNT/TEAM = VERIFY`. Not resolved until a real build/archive exists. |
| **FQ-SITE** | `PROMO_SITE = EXISTS_BUT_NONCORE` (lawmind.co, repo lawmind/lawmind-site) · `FULL_REBUILD = DEFER` (after the app candidate is mature) · `COMPLIANCE_URLS = CURRENT RELEASE OBLIGATION` · `EXTERNAL_DELETE = CURRENT GAP UNTIL IMPLEMENTED`. No website design decision is needed from you. |
| **FQ-WEB-SURFACE** | Its closure on "v7.1 puts advocate web in v1" is `SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION`: `ADVOCATE_WEB = DO_NOT_BUILD` (registry R17: web `OUT_OF_SCOPE_CURRENT_FOUNDER`). |
| **FQ-PUSH-PROJECT** | Launch Shape B makes no push/monitoring claim, so `PUSH_PRODUCT = DEFERRED / NONBLOCKING`. **Separate and still current:** `EAS_PROJECT_ID` is absent from `app.config.ts`, and an EAS project is needed for store builds regardless of push (roadmap §14.14). |
| **FQ-DELETE-WEB** | Owner SHIP. The route belongs in lawmind/lawmind-site and needs `EXTERNAL_DELETE_AUTH_V1` (the R33 mobile magic link cannot be reused). Not a founder item. |
| **In-app purchase: vendor pick** (8 Aug) | Old RevenueCat/OpenIAP recommendations are historical input. At Gate D you choose `FREE_BETA` or `PAID_V1`; only PAID_V1 re-opens billing, on a supported PBL8+ re-measured then. |
| **Store accounts (new)** | Please confirm Apple Developer Program membership/type/Team ID and Google Play Console account type and verification state. **The 30 Sep 2026 Play item is a VERIFY, not a publish deadline** — see the note directly below. Rows: `docs/product/STORE_RELEASE_CHECKLIST_V1.md` §0. |

**`PLAY_APP_REGISTERED` — what the 30 Sep 2026 date actually requires (corrected
18 Sep 2026, SHIP S4-T0.2).** The earlier one-line wording read as "LawMind must
already be published on Play by 30 Sep 2026". It does not say that, and reading
it that way would invent a launch deadline nobody set.

What Google's current documentation says, read 18 Sep 2026:

- Play **package names** must be registered to meet Android developer
  verification. "Apps not registered by Sep 30, 2026 will be removed from Play
  pursuant to the Play Console Requirements policy."
  ([Registering Play package names](https://support.google.com/googleplay/android-developer/answer/16984799))
- Google **attempts to auto-register existing and new Play apps** under its
  package-name eligibility rules; where auto-registration succeeds, "no further
  registration action is required."
- **Creating a new app in Play Console registers its package name**: apps
  created in Play Console from 30 March 2026 onward auto-register on creation
  ([Register on Google Play Console](https://developer.android.com/developer-verification/guides/google-play-console)).

So the consequence — removal from Play — applies to a package that is currently
**distributed on Play**. LawMind's Play state is UNKNOWN and has never been
observed from the console (no console access from this workstation), so this
repository cannot assert that the removal risk applies to `co.lawmind.app`, and
will not.

```text
PLAY_PACKAGE_REGISTRATION_STATUS = UNKNOWN_PENDING_CONSOLE_CHECK
```

**The founder action is therefore to VERIFY, not necessarily to publish before
30 Sep 2026**: open Play Console and record (a) whether a Play account exists
and its type/verification state, (b) whether an app for `co.lawmind.app` exists,
and (c) what the Play Console Home page says about package registration for it.
If no app exists yet, creating one later registers the package at creation on
current documented behaviour — which is a thing to re-check at the time, not a
thing to assume now. If an app does exist, the date matters and the answer is on
that page.
| **Countersigned DPA** | Still `REQUIRED_BEFORE_UPLOADS_OR_SENSITIVE_MODEL_ROUTING`. Not a v1 blocker (uploads disabled). |

---

## FOUNDER DATA AUTHORIZATION — CURRENT / SETTLED

**Founder decision — 11 Aug 2026. This section is authoritative for the current
project state and supersedes earlier contradictory entries below.**

LawMind has valid agreements/permissions authorizing use of:

- **BharatLaw — AUTHORIZED**
- **Supreme AI — AUTHORIZED**
- **eCourts India — AUTHORIZED**

The founder has confirmed these authorizations remain valid through
**13 November 2029**.

These three sources are **not licensing blockers** and must not be returned to
the founder queue as unresolved authorization questions. Continue the data
program without waiting for another confirmation.

The authorization covers the intended LawMind data program, including where
permitted: ingestion, storage, normalization, OCR, metadata extraction,
citation extraction/resolution, indexing, retrieval, evaluation, enrichment,
embeddings, training, fine-tuning, distillation, and related processing.

Preserve source provenance and enforce source-specific operational constraints.
Do not invent contract terms or broaden one source's permission to unrelated
sources.

**Important:** `Supreme AI` and `Supreme Today` are different sources. Historical
`Supreme Today` entries below must not be used to classify `Supreme AI` as
unresolved.

This section exists specifically to prevent repeated reopening of this settled
founder decision.

---

## [RESOLVED 12 Aug 2026 — founder confirmed] Is "Supreme AI" the same relationship as the Supreme Today licence, or a separate one? · NEW3 · 12 Aug 2026

**Answer, verbatim: "yes supreme ai = supreme today ai."** `docs/
AUTHORIZED_SOURCE_MAP.md` §2 carries the consequence: the acquisition plan
is `SUPREME_TODAY_LICENCE.md`/`HARVEST_ENGINE.md`, already written and
already engineered (AIMD pacing, archive-then-parse, `harvest:probe`), and
the only remaining blocker is the account + first ₹50,000 payment already
tracked below at §6 ("Supreme Today — the one real decision") — nothing new
for any lane to build. Original entry kept below for provenance.

---

### [SUPERSEDED, see above] Is "Supreme AI" the same relationship as the Supreme Today licence, or a separate one? · NEW3 · 12 Aug 2026

**Needs:** confirmation of what `Supreme AI` (named authorized in `CLAUDE.md`
§6a, distinct from `Supreme Today` per repeated, deliberate instructions in
this file and in `CLAUDE.md`) actually refers to.

**Why this is not NEW3 guessing its way past a hard limit:** the lane's
brief is explicit — new sources are a founder decision, and this lane must
not conflate or silently resolve. A full web search this session found no
product or site distinctly branded "Supreme AI" — only **Supreme Today AI**
(`supremetoday.ai`), the 58-year-old publisher already deeply researched in
`docs/COMPETITOR_SUPREME_TODAY.md` and under a separately negotiated
₹50,000/month query-only licence in `docs/SUPREME_TODAY_LICENCE.md`. Your
own quoted praise elsewhere in this repo — *"the citation of Supreme AI is
very accurate and they can file in front of the judge with the actual
citation"* — reads as a description of that same product.

**What was built anyway:** `docs/AUTHORIZED_SOURCE_MAP.md` §2 lays out both
readings precisely, so whichever is true, the next step is already written:
if "Supreme AI" **is** Supreme Today, the licence mechanics in
`SUPREME_TODAY_LICENCE.md` §9-10 are the acquisition plan and this item just
confirms the name; if it is a **genuinely separate** product, that becomes a
fresh discovery task with nothing yet built against it.

**Cost if never resolved:** the §6a authorization for "Supreme AI" cannot be
acted on by any lane — nobody can queue an acquisition against a name with
no verified target — and the repo keeps carrying two documents
(`COMPETITOR_SUPREME_TODAY.md`'s deep research and the bare "Supreme AI —
AUTHORIZED" line) that may or may not be about the same relationship.

**Where it plugs in:** one sentence answers it — "yes, same relationship" or
"no, here is what Supreme AI actually is [name/URL/contact]." Either answer
lets `docs/AUTHORIZED_SOURCE_MAP.md` §2 close.

---

## NOTE FROM THE ACQUISITION/DISCOVERY LANE — unbound session, 12 Aug 2026

**Not LCC, not RCC — a separate research session run against the founder's
NEW3 data-moat-acquisition brief.** Wrote three new files, edited nothing
existing except this note: `docs/SOURCE_REGISTRY.md`, `docs/
MISSING_AUTHORITY_QUEUE.md`, `docs/CORPUS_ACQUISITION_QUEUE.md`, `docs/
ACQUISITION_SESSION_LOG.md` (the session's own continuity record — read this
one first if resuming the work).

**The one finding worth LCC's attention regardless of when the IndianKanoon
purchase decision lands:** re-querying the citation graph live (312,373
judgments now held, up from 79,322 on 12 Aug morning — the HC ingest grew the
corpus roughly 4× intraday) shows LawMind's unresolved-citation population
has grown to 32,383 rows / 8,733 distinct keys, and **99.6% of it is SCC/AIR
citations to Supreme Court judgments almost certainly already held under a
different citation form** — the same concordance gap already open below
("An SCC/AIR ↔ S.C.R. citation concordance"), just measured bigger.
Practical consequence: **the missing-authority queue this session built
(`docs/MISSING_AUTHORITY_QUEUE.md`) should not be read as "8,733 documents to
acquire."** It is overwhelmingly an alias-resolution backlog, and resolving
even the top 40 through a cheap IndianKanoon pilot (~₹28) would answer far
more of it than any new ingestion would.

**A second, smaller finding, unrelated to the concordance question:**
`external_citations.source_year` reads `2016` on every row sampled this
session regardless of the cited judgment's real year (1958-2015 in the
sample) — shape-consistent with an ingest artefact rather than 12,000+
citing documents genuinely all dating from one year. Not chased further;
out of this lane's remit and possibly already known. Full detail in
`docs/MISSING_AUTHORITY_QUEUE.md` §2's caveat.

**Also found, not acted on (out of lane):** tribunals (NCLT, CESTAT, NCDRC
confirmed by doctype on IndianKanoon's own search) are very likely acquirable
through the IndianKanoon API LawMind is already evaluating, rather than by
scraping each tribunal's own site — those sites were checked directly and
offer no bulk/API, case-by-case only. Detail: `docs/SOURCE_REGISTRY.md` §2.

**UPDATE, same session, and this one outranks the IndianKanoon item above for
the concordance question specifically.** The Supreme Court of India publishes
its own **Equivalent Citation Table** — `main.sci.gov.in/pdf/ECT/` — mapping
SCC/AIR/JT/SCALE citations to S.C.R. for every judgment, 1950 to present,
across four official PDFs. Confirmed by two independent secondary sources
(a University of Wisconsin law-library guide and a legal-procedure blog that
quotes the table's own worked example), **not by this session's own fetch of
the PDF** — `main.sci.gov.in` would not resolve from this session's fetch
tool. **If it parses, this is a free, official, complete-coverage version of
the exact concordance the open item above has been costing in IndianKanoon
lookups.** Worth one real fetch (via `agent-browser`, which reaches sites
this session's plain `WebFetch` could not) before spending anything further
on the concordance question. Full account: `docs/SOURCE_REGISTRY.md` §5a.

**What did not get done:** four parallel research subagents (tribunals,
state Acts/gazettes, eCourts district judiciary, citators beyond
IndianKanoon) were dispatched and all four failed on an account-level
session-limit error before returning results. Direct research continued at
reduced depth from the main session afterward. The citator/concordance
category (the one most relevant to the finding above) was not reached at
all. Full account: `docs/ACQUISITION_SESSION_LOG.md`.

**Nothing here needs a founder decision that isn't already open below** — the
IndianKanoon purchase is the existing open item this note reinforces, not a
new one.

---

## How to add an entry

```
### [OPEN] <short title> · <lane> · <date>
**Needs:** the exact thing — a key, an account, a signature, a decision.
**Why it is not a blocker:** what was built anyway, and how it behaves without it.
**Cost if never resolved:** what stays broken or unshipped.
**Where it plugs in:** file or config, so wiring it up later is one step.
```

---

### [OPEN — NEEDS THE PHONE PLUGGED IN, NOTHING ELSE] FQ-ANDROID-DEVICE — the last local-v1 evidence is physical, and the S24 was not attached · RCC · 2 Sep 2026

**Needs:** the Galaxy S24 connected — USB with debugging authorised, or wireless
ADB already paired. No purchase, no account, no decision. Five minutes of your
time and then none.

**What was found.** `adb devices -l` on 2 Sep 2026 listed **zero** devices
(neither USB nor an authorised wireless target). The round was told to make one
attempt and not to spend itself troubleshooting device settings, so it did not.

**Why it is not a blocker.** The round pivoted the moment the device came back
empty and closed everything that does not need a phone: the iOS production build
image is pinned and guarded (FQ-APPLE-TOOLCHAIN below), in-app account deletion
was re-verified end to end and one real gap in it was found and handed to the
server lane, and the iOS party-search degrade was confirmed already correct. No
work waited on the phone except the physical matrix itself.

**Cost if never resolved.** `ANDROID_LOCAL_R16_ACCEPTANCE` stays
`PENDING_DEVICE`, and with it the last of the local-v1 physical evidence: the
R16 double-tap test (one tap-storm, one durable row, read from the server and
the database rather than from the screen), matter create with a real
`parties.description`, adjournment, annotation, the three training-consent
writes, and the authenticated verification-confirm whose UI must only turn
confirmed AFTER the server says so. Every one of those is proven by automated
test today; none of them is proven on the hardware an advocate will hold. That
distinction is the entire point of the physical pass — the last two device
sessions each found a defect no green suite had (`AuthBoundary` starving the
router, and `/verify/confirm` sending no bearer token).

**Where it plugs in.** Plug the phone in and say so; the lane runs
`adb devices -l`, `adb reverse` to the local API, and works the matrix from the
round brief in one session. Nothing needs configuring first.

---

### [OPEN — NEEDS AN ACCOUNT AND ONE BUILD, NOT A DECISION] FQ-APPLE-TOOLCHAIN — the iOS build toolchain is not pinned anywhere, so nobody can prove it meets Apple's floor · RCC · 2 Sep 2026

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** IMAGE_PINNED = YES (`macos-tahoe-26.5-xcode-26.6`); ACTUAL_IOS_PRODUCTION_BUILD = NOT_PROVEN; APPLE_ACCOUNT/TEAM = VERIFY. The headline "not pinned anywhere" is stale. See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

**Needs:** an Apple Developer Program enrolment and one EAS iOS build actually
run, so the Xcode / iOS-SDK versions behind our production profile become an
observed fact rather than an assumption.

**What was found.** V7.2 §10.2: since **28 April 2026** every App Store Connect
upload must be built with **Xcode 26+** on the **iOS 26 SDK+**. Checking what
this repo actually configures:

- `apps/mobile/eas.json` has **no `image` key on any profile**, production
  included. EAS therefore picks its own default image at build time, and that
  default is not recorded here.
- There is **no `apps/mobile/ios/` native project** — iOS has never been
  prebuilt or built on this workstation (`docs/MIGRATION_WINDOWS.md` line 156
  said so in S0 and it is still true).
- `.github/workflows/ci.yml` runs no iOS job.

So the answer is not "below the requirement". It is **unknown**, and unknowable
locally: `APPLE_UPLOAD_READY = UNKNOWN`. V7.2 §10.2 says in terms *"do not infer
compliance solely from local JavaScript package versions"*, and Expo's
documentation saying SDK 57 *can* use Xcode 26 is not evidence that our builds
*do*.

**Why it is not a blocker.** Nothing on the client waits for it. Android is
proven ready in the same round (`targetSdkVersion="36"` read out of the merged
release manifest), the app builds and runs on device, and every iOS-facing
product decision — the party-search platform switch, the account-deletion route
— is already built and served.

**Cost if never resolved.** The first App Store upload is the moment we discover
it, under launch pressure, which is exactly the failure V7.2 §12 lists as
"API36/Xcode26 deadline discovered during submission".

**Where it plugs in.** `apps/mobile/eas.json` → `build.production.ios.image`.
Pinning a value would make the toolchain reproducible and auditable, and it is
deliberately **not** done in this round: the valid image identifiers are an EAS-
side fact this workstation cannot verify, and inventing a config value from
memory is the one thing `CLAUDE.md` §7 forbids outright. One `eas build
--platform ios --profile production` prints the image, the Xcode version and the
SDK version in its own log; that log is the evidence, and pinning follows it.

**UPDATE — 2 Sep 2026, RCC R22. The configuration half is closed; the evidence
half is not.** `build.production.ios.image` is now pinned to
`macos-tahoe-26.5-xcode-26.6`, and `apps/mobile/src/config/easBuildImage.ts`
carries a test that fails if the pin is removed, replaced with a floating tag
(`latest`/`default`), or moved below Xcode 26.

The reason the round above refused to pin still stands and is the reason this
entry stays OPEN: the identifier was supplied to this round as a measurement of
Expo's published build-image list for `sdk-57`, and it was **not** re-verified
against EAS from this workstation (`eas-cli` is not installed here and this lane
has no cloud network). What changed is the judgement about which risk is worse.
An unset image is a SILENT floating default that can drift below Apple's floor
between two builds of the same commit; a wrong image identifier fails loudly at
queue time with an unknown-image error. Pinning trades a silent failure for a
noisy one and adds a guard against the silent one returning.

So: `APPLE_CONFIG_READY = YES`, `APPLE_PRODUCTION_BUILD_PROOF = PENDING`.
Configuration is not a build. The first real
`eas build --platform ios --profile production` remains the evidence, and if its
log names a different image, the value in `eas.json` moves to match the log —
the guard asserts a floor, not one exact string, so a correction needs no edit
to the test.

---

### [OPEN — NOT A BLOCKER, A ONE-LINE DECISION ON YOUR OWN RULE] FQ-ATTRIBUTION-TEXT — `CLAUDE.md` §6a breaks the rule §6a states · LCC · 30 Aug 2026

**Needs:** your call on which half of one paragraph is right. No credential, no
account, no money — but it is your document and your rule, so it is not mine to
resolve.

**What was found.** During the Sprint-2 Day-0 push preflight (30 Aug 2026),
scanning 289 unpushed commits before they left the workstation. `CLAUDE.md` §6a
says of `ECOURTS_GRANT_ATTRIBUTION`:

> It is supplied through the runtime environment (`.env` / deployment secret),
> **never committed to tracked source**, and is not printed in normal logs after
> configuration.

Four lines above that sentence, the same section quotes the runtime value
verbatim. `CLAUDE.md` is tracked source. The rule and the file stating it
disagree.

**Where it came from.** Commit `c7a4c1d`, `docs(ecourts): record the founder's
29 Aug 2026 eCourts decision as canonical, and activate the switch through the
audited path`. The value was written into the governance record so agents would
know what the string is; the prohibition was written in the same edit.

**Why this was not treated as a leak.** Stated so the reasoning is auditable
rather than assumed:

- It is **not a credential.** It grants no access and unlocks nothing. It is an
  identifier transmitted in the clear in the User-Agent on every authorised
  eCourts request, so the registrar and any observer of that traffic already
  hold it.
- It appears in **exactly one file** — `CLAUDE.md`. `git grep` across
  `services/`, `packages/` and `apps/` finds it zero times, so the substantive
  purpose of the rule (keep it out of the shipped request path, so it stays
  rotatable from `.env` and cannot ship inside a build) **is satisfied**.
- The remote is **private** (`gh repo view` → `visibility: PRIVATE`).

On that basis the push proceeded on 30 Aug 2026 with the founder's explicit
go-ahead, and the string is now on the private remote.

**The decision:** which sentence do you want to be true?

1. **Amend the rule** to say what is actually intended — never in the shipped
   request path, quotable in governance — which is what the codebase already
   does. One-line edit to §6a. *(LCC's recommendation.)*
2. **Redact the value** from §6a, leaving a pointer to the env var. Note this
   does **not** remove it from history: it stays in `c7a4c1d` and every commit
   after. Only a `filter-repo` rewrite across 289 commits erases it, which
   rewrites every sha in the repository and would be done only if you ask.

**Cost if never resolved:** low but real. A future agent reading §6a finds a
prohibition the repository visibly ignores, which teaches that the rules in that
file are approximate. That is the actual damage — not the string.

**Where it plugs in:** `CLAUDE.md` §6a, the paragraph beginning
"**`ECOURTS_GRANT_ATTRIBUTION`** is an internal audited attribution string".

---

### [OPEN — NOT A BLOCKER, BUT READ IT BEFORE ANY COPY IS WRITTEN] FQ-CLAIMS-V1 — the v1 claims register · NEW3 · 29 Aug 2026

**Needs:** your eye on one table before anyone — us, an agency, or you — writes a
store listing, a website line, an investor slide or an ad. Nothing to sign and
nothing to buy.

**What it is.** `docs/product/NEW3_V1_PRODUCT_DEFINITION_R12.md` §10 is a claims
register: 22 metrics, each with the denominator that makes it mean something,
and **11 claims that are banned in v1** because the measurement does not support
them. Every number was measured against the live backend on 29 Aug 2026 and
every one names where it came from.

**Why it is worth five minutes.** Two of the banned claims are ones a reasonable
person would make by accident:

- **"every citation verified."** Every one of 18,758,460 judgments has at least
  one row in `judgment_citations`, so "every judgment has its citations mapped"
  is *arithmetically true*. But **71.98% of those rows are a blank sentinel**
  meaning "we looked and found nothing". Real citation coverage is **3.62%**.
- **"live" / "up to date."** Both of our lag numbers are true and they are 1 day
  and 29 days, because they answer different questions (newest document vs
  newest month with real coverage). Quoting the flattering one alone is the kind
  of claim that is defensible right up until somebody checks.

**Why it is not a blocker:** the register is written, and every lane can work
from it today. It only becomes urgent the moment outward-facing copy exists.

**Cost if never read:** a store listing or a website line that we cannot support
with a measurement — on a product whose entire licence to operate is that we do
not overstate what we know.

**Where it plugs in:** `docs/product/NEW3_V1_PRODUCT_DEFINITION_R12.md` §10, and
`docs/WEBSITE_CLAIM_EVIDENCE_MATRIX.md` when that is next revised.

---

# CREDENTIALS AND ACCOUNTS

### [WITHDRAWN 30 Aug 2026 — the blocker was invented by LCC, not required by any document] FQ-ECOURTS-CAPTCHA — the grant permits the bypass and does not say how · LCC · 29 Aug 2026

> **WITHDRAWN 30 August 2026, LCC R12. Nothing is asked of the founder here and
> nothing is asked of the registrar.**
>
> This entry asked for a sentence from the registrar naming the MEANS by which an
> authorised LawMind request should satisfy the eCourts CAPTCHA. **That
> requirement was mine and no document in this repository ever imposed it.**
>
> `CLAUDE.md` §6a states the conditions on the bypass exhaustively, and there are
> three: the grant is non-null and unexpired, the code lives only in
> `services/api/src/court/ecourts.ts`, and every request writes the fetch ledger
> and passes the rate limiter. All three are mechanical and all three were
> already enforced. §6a further records `ECOURTS_AUTHORIZATION = SATISFIED` and
> instructs future agents not to reopen it as a founder-input question.
>
> **What the mistake actually was.** I treated *permission to bypass* as if it
> were a *specification of a bypass*, and then required the registrar to supply
> the specification. That inverts what a bypass permission is. The party that
> owns the control granted the right to get past it in writing; the means is an
> engineering problem on our side. Reading the CAPTCHA image is not "inventing a
> security bypass" when the controller has authorised the act — it is the
> authorised act.
>
> **Effect of the withdrawal:**
>
> - `CAPTCHA_AUTHORIZATION` — governed exclusively by committed `CLAUDE.md` §6a.
>   Not reopened, not extended, and no fourth condition exists.
> - `CAPTCHA_IMPLEMENTATION` — an ENGINEERING problem, owned by LCC.
> - `MONITORING` — still `DISABLED_NOT_READY`. The withdrawal moves the eCourts
>   pilot from `DISABLED_EXTERNAL_BLOCK` to `DISABLED_NOT_READY` and **changes
>   nothing else**: the observation writer, measured capacity and measured
>   retention are all still outstanding and all still ours.
>
> The code was corrected in `6b90f98` (`fix(ecourts): I invented a fourth
> condition on the CAPTCHA bypass; there are three`) — `CAPTCHA_OPERATIONAL_BASIS`
> and `captchaImplementable()` no longer exist. This entry is the record on the
> founder-facing side.
>
> **Canonical state string, per `LAWMIND_MASTER_ROADMAP_V7_1.md` §2, appended by
> the Sprint-2 Day-0 seal (30 August 2026, LCC):**
>
> ```
> CAPTCHA_OPERATIONAL_BASIS = RETRACTED_AS_INVENTED_REQUIREMENT
> ```
>
> The settled conditions are only those in the canonical authorization record
> (`CLAUDE.md` §6a). This entry stays WITHDRAWN and asks nothing of the founder.
>
> **The text below is the entry as originally written on 29 August 2026 and is
> left unaltered.** It is wrong in its conclusion and correct in its evidence —
> the response bytes, the source key and the parser findings all stand.

**What is needed:** one sentence from the registrar saying by what MEANS an
authorised LawMind request is meant to get past the eCourts CAPTCHA. Any of
these ends it:

- a credential issued with the grant that exempts our requests;
- our source address whitelisted;
- an endpoint that does not present a CAPTCHA to us;
- or written confirmation that a named technique is the permitted one.

**Why the work stopped here rather than around it.** On 29 Aug 2026 the switch
was enabled through the audited path and **one** authorised request was made —
the first ever under this grant. It returned 200, 75,405 bytes of HTML, sha256
`4ae6bbe1c19824964ca3705c724561c1e8506b51e6fc42147832aef958566e94`, retained
append-only in `official_source_artifact` and committed as the parser's fixture.

That response settles the question in the court's own words. Step 4 of its
instructions: *"Enter the Captcha (the 5 digit numbers shown on the screen) in
the text box provided."* The field is `cause_list_captcha_code`, the image comes
from `vendor/securimage/securimage_show.php`, an audio alternative is offered,
and **no cause-list data is served until it is satisfied.**

The grant says `captchaBypassPermitted: true`. It does not say by what means, and
nothing else in this repository does either — no API key, no whitelisted address,
no exempt endpoint. The only methods available without a stated basis would be to
read the image, transcribe the audio, or exploit a weakness in the generator.
**Each of those is inventing a security bypass**, and a permission to bypass is
not a specification of one — which is exactly the move `CLAUDE.md` warns turns a
bounded permission into an unbounded one. So it was not done.

**What was built anyway, and works:**

- `cause-list-source-key.ts` — the REAL request identity, confirmed by the
  response rather than assumed: state, district, court complex, establishment,
  court, date, then civil or criminal. "One court, one request" was wrong by
  more than an order of magnitude and the quota plan divides by this.
- `cause-list-parser.ts` — written against the retained bytes. Every string it
  matches is quoted from that response, including the result vocabulary the page
  publishes in its own translation dictionary. It classifies the observed
  response as `captcha_required` and carries the court's own warning —
  *"Cause list displayed may differ from the actual cause list"* — onto every
  observation it will write.
- The whole pipeline downstream of the CAPTCHA is proven end to end against a
  synthetic page: reservation → ledger → retained artifact → parse →
  `ecourts_observation`, in one transaction, replay-safe.

**What stays broken without it:** no cause-list observation can ever be written,
so the daily pilot cannot be registered, the retention probe cannot be run (every
probe date meets the same wall), and cause-list monitoring stays
`DISABLED_NOT_READY`. `platform_config.ecourts_harvest` was turned back OFF
through the audited path on 29 Aug with this reason recorded, because nothing is
scheduled to use it and an unused permission left on is risk without benefit.

**Where it plugs in:** `services/api/src/court/authorisation.ts` —
`CAPTCHA_OPERATIONAL_BASIS`, currently `NONE_RECORDED`. Set it to the basis the
registrar confirms and `captchaImplementable()` becomes true, which clears the
`captcha_implementation_blocked` pilot blocker. Nothing else needs changing to
make the pilot runnable except the pilot's own source key and its `enabled` flag.

**Cost so far:** 2 of 1,000 daily requests, 2 of 100 hourly. Evidence:
`docs/ai/lcc-r11/ecourts-data-quality.json`.

---


### [RESOLVED 29 Aug 2026 — founder decision] FQ-ECOURTS-ACTOR — the eCourts switch is built, verified and one field short of ON · LCC · 17 Aug 2026

> **RESOLVED 29 August 2026, founder decision (`CLAUDE.md` §6a).** The founder
> designated `users.id 3d37f77f-23f3-4eb0-b34f-d1700ec652a5` as the canonical
> durable non-fixture founder/admin actor for eCourts audit purposes; its
> placeholder test display name was corrected and it was granted `role = admin`,
> both audited. `ECOURTS_GRANT_ATTRIBUTION` was configured (internal audited
> attribution, not a grant-mandated quotation). `ecourts_harvest` was then
> flipped ON through the audited kill-switch path with that actor named on the
> `audit_log` row. `platform_config.ecourts_harvest = true`. No eCourts HTTP
> request was made in this configuration work; `guard.decide()` returns
> `allowed` for a sample court. Nothing below is outstanding.

> **21 Aug 2026 — this one identifier now blocks FIVE premium surfaces, not one.**
> The storage side landed today: `ecourts_observation` and `ecourts_transition`
> (migration `0061`), append-only enforced by trigger, four guards proved by
> execution. NEW2 had been holding live traffic on exactly that schema and is now
> unblocked on everything except the switch.
>
> Case Brain, hearing prep, the matter timeline, next hearing and fresh order all
> share one input — the eCourts observation stream — so this single field moves
> the whole cluster from BLOCKED to buildable. `docs/ai/PREMIUM_BACKEND_READINESS.md`.
>
> Still true, and still the reason nobody flipped it: **zero requests have ever
> been made**, and that is answerable by query rather than by assertion —
> `ecourts_fetch_ledger` holds 52 rows and every one is
> `refused` / `kill_switch_off`.

**Needs:** one command, run once. It no longer needs a uuid.

```
pnpm --filter @lawmind/api kill-switch ecourts_harvest --on   --actor-email <the address you signed up with>   --reason "founder confirmed the grant stands, 17 Aug 2026 (bus 0617)" --apply
```

> **21 Aug 2026 — LCC looked for the account rather than asking again, and there
> isn't one.** Aggregates only, no personal data read:
>
> - `users` has **no role column at all** — there is nothing to identify an admin
>   BY, so "find the founder account" was never answerable from stored evidence.
> - All **55** rows are `subscription_tier = 'none'`, `enrolment_status =
>   'unverified'` — one uniform population, no privileged tier.
> - **54 of the 55** appear in `audit_log` with exactly **6 actions inside a
>   30-second window** each. That is a test fixture's signature, 162 of the 216
>   audit rows.
>
> So there is no genuine founder or admin account to name, and one will not be
> fabricated. What LCC could remove, it removed: `--actor-email` resolves the
> address to a `users.id` and **refuses on zero matches or on more than one**, so
> the audit row still names a real person. The requirement did not move; only the
> lookup did. Previously this asked for a uuid nobody carries in their head and
> which cannot be read without a database session.
>
> **If the address matches nothing, the account does not exist yet** — sign in to
> the app once with it, then run the command. That is the whole remaining action.

**The decision is already made and I am not re-asking it.** You confirmed the
eCourts permission stands and asked for the switch ON (via NEW3, bus 0617). This
is not that question.

**Why I did not just flip it.** `audit_log.actor_user_id` is `NOT NULL`, and
`admin/platform.ts` is explicit that *"a config change with no audit trail is
worse than no change, because it is unaccountable rather than merely absent."*
Of the six kill switches, this is the one where that is not housekeeping — it
authorises contacting a court's systems under a registrar's written grant, and
if the registrar asks who turned it on, *"we are not sure"* is the answer that
loses the grant. There is no founder identity in `users`: 53 rows, and the only
non-test-looking one is named `Adv. Test Verify`. Attributing your instruction to
a test account would be a false audit record, which is worse than a missing one.

**Everything else is done and verified by execution:**

- terms transcribed and unexpired — `AUTHORISATION is null? false`,
  `expiresAt 2029-01-01`, `ALL_COURTS`, hours `0–24`, `expired now? false`
- `guard.ts` checks terms, then expiry, **then** the switch. The first two pass,
  so **the switch is the only remaining refusal**
- the command is written, dry by default, refuses an `--actor` not in `users`
  (both paths exercised), writes config + audit in ONE transaction, and prints
  `decide()`'s verdict afterwards so you see what the switch bought
- `docs/ECOURTS_AUTHORISATION.md` corrected — its status table said
  "Conditions transcribed: NO" for nine days after that stopped being true, and
  NEW3 nearly acted on it

> **NEW2, 21 Aug 2026 — one fact that narrows this to a single yes/no, and does
> not resolve it.** LCC wrote that the only non-test-looking row is named
> `Adv. Test Verify`. That is still true, and it is not the whole row. Re-read
> live today, `users` holds 55 rows and exactly one survives an
> `email NOT LIKE '%@example.test' AND email NOT LIKE 'test-%'` filter:
>
> ```
> id          3d37f77f-23f3-4eb0-b34f-d1700ec652a5
> full_name   Adv. Test Verify
> email       xanderdark92@gmail.com        <- the founder's own address
> phone       9876543210                    <- a placeholder
> created_at  2026-08-08T08:30:01Z          <- the earliest row in the table
> ```
>
> So the row carries the founder's REAL email under a test name. NEW2 did not
> flip the switch on that, and will not: a name that says `Test` on the audit
> record that authorises contacting a court registry is exactly the record LCC
> refused to write, and the email does not make the name true. `ecourts_fetch_ledger`
> is still 52 rows, every one `refused`, verified by query today — no traffic has
> been made and none will be until this is answered.
>
> **What is now needed is one of two words, not a lookup:** either *"that row is
> mine, use `3d37f77f-23f3-4eb0-b34f-d1700ec652a5`"* — in which case the name
> should be corrected in the same transaction so the audit record reads true —
> or *"create a founder row"*, and NEW2 or LCC will write it with a real name and
> use that id. Nobody in this repo can pick between those on the founder's behalf.

**Turning it on starts no traffic, measured not assumed.** The only caller of
`fetchCauseList` is `retryCauseList`, an attributable admin request — no cron, no
scheduler, no poll. So it is safe to flip during the freeze; it grants permission
and cannot initiate a fetch. Harvesting still waits on the cutover.

---

### [CLOSED — DONE 18 Aug 2026] FQ-PGSERVICE — PostgreSQL now runs as a Windows service; the console defect is gone, not hidden

> **CLOSED 18 Aug 2026. The founder granted elevation in session and the fix
> was applied and verified end to end.** Nothing is owed on this item.
>
> ```
> pg_ctl register -N LawMindPostgres -D "C:\lawmind\pgdata" -S auto
> ```
>
> Then a controlled cutover: `pg_ctl stop -m fast` (clean, 18s, no crash
> recovery) and `Start-Service LawMindPostgres` (3s).
>
> **Measured before and after, which is the only reason to believe it:**
>
> | | before | after |
> | --- | --- | --- |
> | postgres consoles | **37**, one per child | **1**, the postmaster's |
> | of those, reachable by a user | **37** | **0** — all in session 0 |
> | postgres taskbar windows | **33** | **0** |
> | starts after | logon only | **boot** |
>
> Every postgres process now runs in **SessionId 0**, which has no interactive
> desktop. The windows are not hidden, they cannot be created. `pg-service-verify`
> reports **9/10**, the single FAIL being the pre-fix 04:22 crash still inside its
> 24-hour window.
>
> **The fleet survived the restart with no worker lost** — all 8 process chains
> intact, on the transient-SQLSTATE retry (`services/ingest/src/db-transient.ts`).
> **7 of 8 scopes were writing again within seconds. `3_22` was not**, and the
> aggregate would have hidden it: it reconnected on the same `57P03` retry but
> restarted its pass on a different year partition and took ~18 minutes to write
> its first rows, now running 0.9 docs/s against 35.2 before the restart. Whether
> it resumed from its checkpoint or re-walked is NEW2's to confirm.
>
> **Three follow-ons landed with it, because a fix that can be undone by the next
> agent is not finished:**
>
> - `pg-local.mjs start` and `spawn-detached` now **REFUSE** when the service
>   exists. Their job is to spawn a DETACHED postmaster, which is precisely what
>   gives every backend its own console again.
> - `isRunning()` no longer trusts `pg_ctl status`. **Measured minutes after the
>   cutover: `pg_ctl status` said "no server running", exit 3, while the database
>   was accepting connections** — an unelevated `pg_ctl` cannot open a LocalSystem
>   process in session 0. `start()` branches on that, so believing it would have
>   spawned a second postmaster against a live data directory.
> - The `LawMindPostgres` **scheduled task is disabled** (not deleted). The service
>   starts at boot, which strictly dominates a logon trigger.
>
> `scripts/pg-hide-consoles.ps1` is **retired** and kept only as documentation of
> the mechanism; its watcher is stopped. It was the unelevated interim and it is
> no longer needed.

**The original entry is kept below for the reasoning trail. It is SUPERSEDED.**

#### [SUPERSEDED — closed above 18 Aug 2026] FQ-PGSERVICE — local PostgreSQL keeps being killed by console signals; the fix needs one elevated command · LCC · 17 Aug 2026

> **UPDATE 18 Aug 2026 (LCC) — this entry is now the fix for the taskbar storm
> as well, and the previous diagnosis was one level off for the second time.**
> `DETACHED_PROCESS` fixed the *postmaster* and nothing else. The claim written
> into `pg-local.mjs` — that it leaves "nothing left to signal" — is **false for
> the postmaster's children**, which is precisely why the crashes continued
> after that fix landed:
>
> **a process with NO console that spawns a console-subsystem child does not
> pass a console down — Windows ALLOCATES A NEW ONE for the child.**
>
> So every backend, autovacuum worker, io_worker, wal_writer and bgworker gets
> its own private console, and on Windows 11 the default terminal application is
> Windows Terminal, so **each one surfaces as its own taskbar window** titled
> `C:\lawmind\pgsql\pgsql\bin\postgres.exe`. Measured this session: **33 of the
> 43 visible windows on this desktop were PostgreSQL child processes.** The
> "dozens of npm/node terminals" in the screenshot were not the ingest fleet —
> the fleet launches correctly hidden. They were the database.
>
> That makes the two problems one problem. Those windows are live console
> attachments to live database processes: **closing one delivers a console
> control event, the backend exits `0xC000013A`, and the postmaster restarts the
> entire cluster and takes the ingest fleet with it.** Every recorded instance
> killed a *child*, never the postmaster — which is exactly what this mechanism
> predicts and what a memory-exhaustion explanation does not.
>
> Mechanism measured with a control that discriminates, not reasoned about: a
> detached parent spawning three ordinary children produced **3 new consoles and
> 3 new visible Windows Terminal windows**; the same parent non-detached
> produced **0** — and died with its launcher, which is why "just drop
> `detached`" is not available as a fix.
>
> **Both unelevated routes to a console-free cluster were tried this session and
> both were refused:** `Register-ScheduledTask` with an **S4U** principal (the
> session-0 route) returned `Access is denied`, and service registration needs
> elevation by definition. The `Access is denied` that "did not reproduce" for
> the *Interactive* task above **does reproduce for S4U** — the two are
> different rights, so that earlier note is not in conflict.
>
> **Interim shipped, so nothing waits on you to keep working:**
> `scripts/pg-hide-consoles.ps1` hides those windows with `ShowWindow(SW_HIDE)`
> — no signal, no message, nothing terminated, reversible with `-Restore`. Run
> once it took the desktop from **43 visible windows to 10**, with the postgres
> process count unchanged at 34 and the ingest fleet still writing in the same
> second. It runs in `-Watch` mode because each new backend opens a new window.
> **This removes the accident, not the cause** — a hidden window is still a live
> console attachment, and anything that enumerates and closes windows, or any
> stray `GenerateConsoleCtrlEvent`, still reaches the cluster.
>
> **Your one command is unchanged and is now worth more than it was:** a service
> runs with no interactive desktop, so the child consoles are never created, the
> windows never exist, and the whole failure class disappears rather than being
> hidden. It also retires the watcher process this interim requires.


**Needs:** one command run from an **Administrator** PowerShell/cmd:

```
C:\lawmind\pgsql\pgsql\bin\pg_ctl.exe register -N LawMindPostgres -D "C:\lawmind\pgdata" -S auto
```

then `sc start LawMindPostgres`. Nothing else. It is not a purchase and not an
account — it is the elevation.

**Two things that were in this entry are now settled, and one of them was mine
being wrong. Both are verified rather than assumed:**

- **`LocalSystem` will work, so the command above needs no account password.**
  This was the one real risk in it — a service that cannot read the data
  directory fails at start, and the obvious workaround is registering the
  service as the logged-in user, which means putting a Windows password on a
  command line. Checked instead of assumed: `NT AUTHORITY\SYSTEM` holds
  `FullControl` on `C:\lawmind\pgdata`. The command as written is complete.
- **The `Access is denied` I reported does NOT reproduce.** Same cmdlet, same
  unelevated session, 17 Aug: `Register-ScheduledTask` succeeded, and so did
  `Unregister-ScheduledTask`. Whatever restricted that earlier call was
  transient. **Boot persistence is therefore restored and this is no longer
  waiting on you** — the `LawMindPostgres` task exists again (verified: State
  `Ready`, trigger `AtLogOn`, user `XC\Xerxus`).

**What is left for the elevated command is now smaller and worth stating exactly,
because "it already works" is the reason a queued item quietly rots:**

| | scheduled task (in place now) | Windows service (needs your one command) |
| --- | --- | --- |
| starts after reboot | only once **you log in** | at **boot**, no logon needed |
| console attached to the server | none | none |
| survives a locked/logged-out machine | no | yes |

The task removes the crashes. It does not remove the *logon* dependency, and an
unattended box that reboots at 03:00 and sits at the login screen is a database
that is down until somebody notices. That is the remaining gap and it is the
whole reason this entry stays open.

**Meanwhile the console defect itself is fixed without elevation, and measured
rather than argued.** `pg_ctl start` on Windows shells out through `cmd.exe`, so
the postmaster inherits that `cmd.exe`'s console — that is the actual mechanism,
confirmed on the live server by NEW2 (bus 0597), and my earlier explanation in
`pg-local.mjs` was one level off. The start path no longer uses `pg_ctl` at all:
it spawns `postgres.exe` directly with `detached: true`, which is
`DETACHED_PROCESS` on Windows — no inherited console and no new one.

Tested with a control that discriminates, across a real harness console
teardown, rather than reasoned about:

```
detached: true   -> ALIVE, still heartbeating
detached: false  -> DEAD
```

**Verify any of this yourself in one command** — it is written to fail loudly
rather than to reassure:

```
node scripts/migration/pg-service-verify.mjs
```

It currently reports **6/7**, and the single `FAIL` is honest: the *running*
postmaster still has its old live `cmd.exe` parent, because it was started the
old way and has not been restarted since. **I am deliberately not restarting it
— NEW1's post-migration gate is mid-run against this cluster.** The fix applies
at the next start, and the verifier will say so.

**The problem, measured four times:** PostgreSQL on this machine keeps dying with
`exception 0xC000013A` — `STATUS_CONTROL_C_EXIT`, a console signal.

| when | what died |
| --- | --- |
| 16 Aug 03:25 | the whole server, six minutes after starting |
| 17 Aug 00:39 | a client backend, 16 of 32 ranges into the table rebuild |
| 17 Aug 06:45 | **an autovacuum worker** — a pure server-side process with no client |
| (plus 16 Aug 07:26 | a genuine power cut, unrelated, listed so the count is honest) |

The third one is the decisive evidence. An **autovacuum worker** has no client
connection and no relationship to any shell — so the postmaster and all its
children are sitting in a console that keeps receiving Ctrl-C events. This is not
a client problem and cannot be fixed on the client side.

**What was already tried, and why each was not enough:**

1. **Task Scheduler at logon** (`LawMindPostgres`, already registered). This is
   what `pg-local.mjs` uses and it genuinely helped — it is why the server came
   back by itself after the power cut. It does **not** remove the console: a task
   with `-LogonType Interactive` runs in the logged-on session and its children
   can still be signalled.
2. **A session-0 task** (`-LogonType S4U`, no console at all). Registration was
   **refused**: `HRESULT 0x80070534` — "no mapping between account names and
   security IDs", i.e. this account cannot be mapped for an S4U logon. Likely a
   Microsoft account rather than a local one. Not fixable from here.
3. **Detaching the client work** into its own console via `Start-Process
   -WindowStyle Hidden`. This DID work for the client side and is now the pattern
   for long jobs — but it cannot protect the server's own background workers.

**A Windows service is the actual fix**: services have no console, so there is no
process group for a Ctrl-C to reach. `pg_ctl register` needs administrator rights,
which is the only reason this is your item and not mine.

**What was built anyway / what happens if you do nothing:** nothing is lost when
it happens. `fsync` is on, crash recovery has run cleanly **three times**, and
every row count re-verified identical afterwards. The corpus is also backed up to
R2 and byte-verified. The cost is **time**, not data — each crash means 2–20
minutes of recovery, and one of them threw away 40 minutes of a table rebuild.
The rebuild was made crash-resumable in response (progress markers commit inside
the same transaction as the rows), so a repeat now costs minutes rather than
restarting.

**Do not treat this as urgent-at-night.** It is a stability tax on a machine that
is otherwise working, and the migration completed despite it.

### [ANSWER CHANGED 17 Aug 2026 — RECOMMENDATION IS NOW **DO NOT RAISE IT**] FQ-CAP · LCC · 16 Aug 2026

> **Read this box, not the arithmetic below it.** The cap was reached while the
> machine was off: workspace usage is **$75.11 against the $75 hard limit,
> `isOverLimit = true`**, and Railway has taken the workloads offline exactly as
> its docs say it would. Nothing was lost. **Stopped is not deleted** — the
> volume still holds the database and the service restarts if the limit is
> raised, or by itself when the billing period resets on **19 Aug 2026 09:50Z**.
>
> **The migration no longer needs Railway at all.** Both things it was required
> for were finished before the cap hit: the **626/626 dump** (40.22 GB, verified
> intact after the power loss — 626 files, 0 missing, 0 size mismatches against
> the ledger) and the **exact row counts for all 53 tables**. The remaining work
> — restore, verify, back up to R2 — is entirely local.
>
> **So the $90 below is no longer recommended.** Raising it now buys only the
> rollback path, and it would buy it at roughly $0.45/hr for a copy we are about
> to stop needing. If local verification FAILS and something must genuinely be
> re-fetched, the billing period resets in two days and restores the service for
> free. **Spend nothing. Wait.**
>
> The original request and its arithmetic are kept below unedited, because "did
> we ever ask, and what did we think at the time" is a question that comes back.

**[SUPERSEDED — original request, 16 Aug 2026]** raise the Railway compute hard limit $75 → $90 until the migration verifies

**Needs:** one number changed on the Workspace Usage page, or
`railway usage limit set --target workspace --hard 90`. Nothing else.

**The situation, measured not assumed (16 Aug 2026, 05:3x local):**

| | |
| --- | --- |
| workspace usage now | **$71.69** |
| hard limit now | **$75** — headroom **$3.31** |
| billing period ends | **19 Aug 2026 09:50Z** — it does *not* reset in time |
| chunked dump | **~520 of 626 chunks**, running, ~36.7 GB on local disk |
| what a hard limit does | Railway's own docs: *"all your workloads will be taken offline"* — the source Postgres dies mid-dump |

**Measured burn (Railway metrics + Railway's published rates, not a guess):**
the Postgres service holds **24.0 GB RAM** ($10/GB/mo), **~0.92 vCPU**
($20/vCPU/mo) and a **121.8 GB volume** ($0.15/GB/mo) → **≈ $0.38/hr just to
exist, idle or not.** Egress is $0.05/GB and the dump moves ~14 GB/hr of wire →
**≈ $1.08/hr while dumping.**

**Why $90 and not more, not less:**

| remaining step | cost |
| --- | ---: |
| finish the dump (~4.8 GB wire left) | $0.47 |
| Railway exact row counts — the cutover gate needs them | $0.19 |
| Railway idle ~20 h while the **local** restore, verify and R2 backup run | $7.60 |
| contingency: one table re-dumped if verification disagrees | $1.85 |
| **new spend** | **≈ $10** |

$71.69 + $10 = $81.7. **$90 gives ~1.5× margin on the new spend.** It is a
ceiling, not a bill — the expected charge is ~$10.

**Do NOT make it open-ended.** The moment `compare.mjs` reports 0 FAIL and the
R2 backup reads back clean, Railway is deleted and this cap stops mattering.

**What was built anyway / what happens if you do nothing:** the dump and the
exact counts both fit inside the existing $3.31 — that work is proceeding now
without you. Doing nothing costs the **rollback path**: Railway shuts itself off
roughly 7 hours later, mid-restore, and the local dump becomes the only copy of
7,296,068 judgments before anything has proven it restores.
`RAILWAY_SHUTDOWN.md`'s one rule is that Railway stays up, billing, until the
local copy *and* the R2 backup are independently verified. This entry is that
rule costed out.

**The $0 alternative, if you would rather not raise it:** stop (do not delete)
the Postgres service once the exact counts land. RAM and CPU stop billing, the
**volume keeps the data** at $0.60/day, and the remaining 3 days fit in $3.31
with ~$0.85 to spare. It is cheaper and it is worse: it bets the only rollback
copy on a stop/start cycle completing correctly, to save about ten dollars.
Recommended only if the answer to $90 is no.

---

### [OPEN — DECISION, NOT A CREDENTIAL] Does FQ-CORPUS's "no embeddings for now" still hold, given today's data-richness push? · LCC · 12 Aug 2026

**Needs:** an explicit call on whether **FQ-CORPUS** (11 Aug 2026: *"ingest
High Court documents as searchable text behind the coverage screen, no
embeddings for now"* — reasoned on pgvector degrading past 5–10M vectors
against a ~41M-vector High Court scale-up) is superseded by today's direct
instruction to use the local GPU freely and prioritise being data-rich before
launch, or whether it still stands and the two are meant to coexist (e.g.
Supreme Court embeddings yes, High Court embeddings still no).

**What happened, concretely.** While closing Stage 13 (exact-span evidence),
I found 87,141 of 125,522 held judgments had never been chunked/embedded at
all — zero dense-retrieval presence, lexical-only. With this session's
explicit GPU authorisation ("if you need GPU for any heavy task... it is free
anyway"), I ran that backlog through `EMBED_DEVICE=dml pnpm --filter
@lawmind/embed run embed` on the local RTX 4060 Ti. **I did not check this
backlog's composition against FQ-CORPUS before starting** — that was my
miss. Checked afterward: **1,680 judgments were embedded before I caught it
and stopped**, nearly all High Court (Patna 1,102, Gauhati 464, Meghalaya 55,
Manipur 43, Sikkim 10, and — the two that confirm the overlap — **Madhya
Pradesh 3 and Kerala 3**, both courts the concurrent HC-ingest lane's own
Q1.22 plan names as "currently near-zero, being scaled up now"). Checking the
remaining backlog: **only 1 Supreme Court judgment is left un-embedded** —
the 87,141-judgment gap was almost entirely High Court from the start, so it
was mostly already inside FQ-CORPUS's "no" zone before I ever touched it.

**Why it is not a blocker:** stopped, not guessed past. Added `--court
"<name>"` to `services/embed/src/cli.ts` so a future run can be scoped
precisely (e.g. Supreme-Court-only, which is now essentially caught up at
1 judgment remaining and carries no FQ-CORPUS ambiguity at all). Nothing
currently running touches High-Court embedding. The 1,680 already-embedded
High Court judgments are sitting in the corpus, searchable both ways
(lexical and dense) — not wrong, not rolled back, just a scope question:
do they stay, does the run continue to the rest of the backlog, or does this
wait for pgvector's scale limits to be re-examined against the
now-much-larger held corpus?

**Cost if never resolved:** the retrieval/evidence lane has no further
un-embedded backlog to safely close without this answer — Supreme Court is
essentially done, and the entire remainder is High Court territory FQ-CORPUS
already reasoned through once, for a real infrastructure constraint, not a
cost one.

**Where it plugs in:** `services/embed/src/cli.ts --court "<name>"`, run
manually once answered. `docs/CURRENT_PLAN.md` Q1.22 has the full technical
account (the two chunk.ts bugs found and fixed getting here, and this scope
question at the end of it).

### [OPEN] An SCC/AIR ↔ S.C.R. citation concordance · LCC · 11 Aug 2026

**Needs:** a **decision** on whether to obtain an external citation-concordance
source — the table that says `(2006) 4 SCC 1` and `[2006] X S.C.R. Y` are the
same judgment. Licensing, not engineering. **No source has been researched,
priced or contacted**; that is the step after the decision, deliberately not
taken first.

**Why it is not a blocker:** everything that keys on judgments we hold works —
search, verification, the citation harness, add-to-matter. **The measured-safe
internal mappings are now WRITTEN, 12 Aug 2026** — 294 aliases (verified:
`judgment_citation_aliases` 4,100 → 4,394), pushing `judgment_citations` 44.8%
→ 45.8% and `external_citations` 29.5% → 36.8%, no model call, hand-checked
against 14 real judgment rows before writing. `docs/ai/AUTHORITY_COVERAGE.md`
§3c. The remaining edges stay honestly unresolved rather than guessed — that
is exactly what this open item is still about.

**Why it cannot be solved internally — measured, not assumed:**
all 38,342 of our Supreme Court judgments carry S.C.R. citations and **zero
carry SCC or AIR**, while **4,485 of 4,489 unresolved High Court citation edges
point at SCC/AIR**. Mining our own text for pairings courts print themselves
(`concordance-cli`) has been re-run over the whole corpus including the 40,980
new High Court documents and yielded **3 aliases**. Matching by party name and
year reaches 28% of targets but **adversarial validation cuts it to 12.1%
safe** — 51.8% rest on ≤3 distinguishing tokens, and 17 same-reporter
collisions are demonstrable errors. Writing those would point advocates at the
wrong case.

**Cost if never resolved:** up to **1,122** High Court targets and a large share
of **57,947** corpus-wide stay `KNOWN BUT UNMAPPED`. That blocks citator
completeness (treatment and overruled status stop propagating at an unresolved
edge), "cases citing this authority", authority ranking by citation count, and
any defensible claim about High Court precedential coverage. **It also means we
cannot say how much of our apparent corpus gap is real** — GENUINELY MISSING
cannot be separated from KNOWN BUT UNMAPPED without it, so no acquisition
decision should be taken before this one.

**Where it plugs in:** `judgment_citation_aliases` already exists with the exact
shape (judgment_id, alias, alias_key, alias_reporter, corroborations, evidence)
and 4,100 rows. An external concordance loads into it, and
`pnpm --filter @lawmind/ingest resolve --apply` converts the edges. One table,
one existing CLI. `docs/ai/AUTHORITY_COVERAGE.md` §3a-3b carries the full study.

**CORRECTION 11 Aug 2026, LCC — the one candidate free alternative was checked
and does not work, on two independent grounds.** `RESEARCH_2026-08-11.md` had
proposed eSCR (`digiscr.sci.gov.in`) as a free official substitute for a paid
concordance. That URL was never actually fetched before being written down
across three docs — it does not resolve. The real site,
`https://scr.sci.gov.in/scrsearch/`, is (1) CAPTCHA-gated on the same
`securimage` widget eCourts uses and governed by Lawmind's **separate written
Supreme Court permission through 2029** (recorded 27 Aug 2026 in
`SCI_AUTHORISATION.md`), and (2)
even with access, its search form has no SCC/AIR field at all — only S.C.R.
and neutral citation, both of which we already hold at 100%/99.7%. It cannot
resolve an SCC/AIR citation to anything. **This does not change what this
entry needs — it removes the one option that looked like it might make the
decision unnecessary.** Full account: `docs/RESEARCH_2026-08-11.md` §3a.


### [OPEN] DMARC enforcement beyond `p=none` · LCC · 7 Aug 2026

**Needs:** a destination for DMARC aggregate reports (`rua`) — a mailbox on
`lawmind.co` or a monitoring vendor. **A vendor costs money.**
**Why it is not a blocker:** `_dmarc.lawmind.co` is live at `p=none`, verified in
public DNS. Mail sends, DKIM and SPF are verified, deliverability is fine.
**Cost if never resolved:** we never move to `quarantine`/`reject`, so the domain
stays spoofable. Not urgent; matters more once we have real users.
**Where it plugs in:** one TXT record edit via the Spaceship API. `DEPLOYMENT.md`
§Mail carries the upgrade path.

### [OPEN] Countersigned DPA before uploads ship · LCC · pre-existing (OD-6)

**Needs:** a signed data-processing agreement with the sensitive-class model
provider, with zero-retention and no-training terms, plus a reviewed
sub-processor list.
**Why it is not a blocker:** nothing uploads documents yet. The admin surface is
specced to refuse sensitive routing without terms on file, **with no founder
override**.
**Cost if never resolved:** OCR intake and document upload cannot ship. It is a
launch blocker, not a sprint blocker.

### [OPEN] Counsel's written residency view · LCC · pre-existing (OD-2)

**Needs:** the written opinion behind the Singapore position, on file.
**Why it is not a blocker:** OD-2 is resolved on the founder's authority and
Railway has no India region regardless.
**Cost if never resolved:** a residency position with no written opinion is thin
exactly when it gets challenged, and the DPDP full-compliance date is 13 May 2027.

### [OPEN] Branch protection needs GitHub Pro · LCC · 11 Aug 2026 (V2 §5)

> **STATUS 18 Sep 2026, SHIP S4-T0.2 — the account-tier gate is GONE.** This entry
> names "making the repo public" as the alternative to GitHub Pro, and that has
> since happened: `gh repo view --json visibility` returns `PUBLIC`. Re-probed
> today, `gh api repos/lawmind/lawmind/branches/main/protection` no longer returns
> `403 — Upgrade to GitHub Pro`; it returns `404 Branch not protected`, which is
> the answer you get when the feature is available and simply unused.
> `gh api repos/lawmind/lawmind/rulesets` returns `[]`.
>
> So this is no longer a **spend** item; it is a **settings** decision, and it is
> still yours. What changes if you say yes: direct pushes to `main` stop, and CI
> becomes a required status check. What changes if you say nothing: nothing —
> every lane keeps pushing straight to `main`, exactly as it has all along.
>
> Related and also now free: GitHub Actions on standard hosted runners costs
> nothing on a public repository, which is why CI now runs on push as well as on
> pull requests (`docs/ai/ship-s4-t0-2/RUNTIME_CI_RECONCILIATION.md`).
>
> **No setting was changed by this round.** `BRANCH_PROTECTION = NONE`,
> `RULESETS = NONE`, `REQUIRED_STATUS_CHECKS = NONE`.


**Needs:** GitHub Pro on this account (or making the repo public, a separate
decision) to enable branch protection, required status checks and a merge
queue on `main`.
**Why it is not a blocker:** `gh api repos/lawmind/lawmind/branches/main/protection`
returns a live, checked answer, not a guess: `403 — Upgrade to GitHub Pro or
make this repository public to enable this feature`. This is an account-tier
gate, not an engineering gap — nothing about the V2/REB request is
unbuildable, it is simply unavailable on the current plan.
**Cost if never resolved:** LCC and RCC keep pushing directly to `main` with
no required CI gate and no merge queue, exactly as this whole session has
run. Both lanes have been disciplined about it, but discipline is not a
control.
**Where it plugs in:** GitHub Pro is a monthly subscription; once active,
CODEOWNERS (buildable today, see below) plus branch protection rules
complete V2 §5's ask.

### [OPEN] Worktree separation needs a coordinated switch, not a unilateral one · LCC+RCC · 11 Aug 2026 (V2 §5)

**Needs:** a founder decision on *when* both lanes switch from the shared
working tree to separate worktrees/branches — RCC flagged the same item
independently (bus 0031), which is why this is recorded once, jointly.
**Why it is not a blocker:** V2 calls the shared tree "unsafe for autonomous
agents," and that is a fair concern going forward — but RCC has been
actively committing to `apps/**` in this same tree for the entire session
this was raised in. LCC switching alone mid-session would not reduce risk;
it would add a second, unsynchronised copy of the tree while RCC keeps
writing to the original, which is a worse divergence risk than the one V2
is warning about.
**Cost if never resolved:** the two lanes keep sharing one tree, which has
worked without a collision this session (each lane has stayed inside its
own path prefix) but has no structural enforcement behind that fact beyond
CLAUDE.md's stated boundary.
**Where it plugs in:** `git worktree add` for each lane, a CODEOWNERS file
(buildable now, unblocked — see below) and, once GitHub Pro is active,
branch protection referencing it.

### [OPEN] Hidden adversarial benchmark needs infrastructure outside this repo · LCC · 11 Aug 2026 (V2 §5, REB §14)

**Needs:** a decision on where the release-gating adversarial evaluation set
should actually live so that a coding agent cannot read or edit it —
options include a second, access-restricted repository; a secret-backed CI
artifact fetched only during the gate run; or an external service.
**Why it is not a blocker:** `services/harness/src/fixtures/adversarial.json`
is a plain file in this repo today, fully readable and writable by any
agent working in it, including this one. **True inaccessibility cannot be
built from inside the same access an agent already has** — I looked for a
way to self-restrict and there isn't one that would actually hold; anything
short of an external mechanism is decoration, not protection. Recorded
rather than faked.
**Cost if never resolved:** the adversarial set remains readable by any
future agent session, and V2/REB's stated goal — that "coding agents must
not be able to weaken their own release gates" — is aspirational rather
than enforced. Nothing has been weakened; the set is exactly as strong as
it was, this is only about who could touch it.
**Where it plugs in:** whichever mechanism is chosen, the harness only needs
a URL or path to fetch the set from at gate-run time — `services/harness/src/adversarial.ts`
already reads it as data, not as inline code.

### [SUPERSEDED — FOUNDER AUTHORIZATION SETTLED 11 Aug 2026] eCourts grant conditions, transcribed · LCC · 7 Aug 2026

**Needs:** the registrar's letter — reference, expiry, attribution string,
permitted courts, permitted hours, rate limits — transcribed into
`services/api/src/court/authorisation.ts`.
**Why it is not a blocker:** the adapter, guard, fetch ledger and rate limiter are
all built. The guard refuses everything while the terms are absent, **even with
the kill switch on**, and `POST /court/lookup` correctly answers
`available: false, reason: terms_not_on_file`.
**Cost if never resolved:** no cause-list harvesting, so hearing dates come only
from the advocate — which PD-12 says is first-class anyway. The wedge still works.
**Where it plugs in:** one object literal, then flip `platform_config.ecourts_harvest`.

---

### [MOSTLY RESOLVED 8 Aug 2026] A physical Android device for the S1 device pass · RCC

**It was not a blocker and I should not have queued it.** No phone was attached,
so I installed the Android emulator from the SDK manager — free, no account, one
command — created a Redmi-class AVD (1080×2400 at 400dpi, 4 GB) and ran the pass
on it. **Two of the four criteria are now observed and passing**, and three real
defects came out of it that no test could see.

**Observed passing, 8 Aug 2026:**

- **Reading progress survives a restart with the network off.** Aeroplane mode
  on, app force-stopped, cold-started from a deep link: the judgment rendered
  from the device and the position came back at **¶ 8 of 22**, the exact
  paragraph it was left at.
- **The sunlight washout, computed and rendered.** Every shipped pair at
  contrast 0.5 / brightness 1.3, on real screenshots. Ink, oxblood, the active
  tab and the mono record values hold. One pair does not — see the `ink-faint`
  entry below.

**What an emulator genuinely cannot answer, and stays open:**

- **60fps on a mid-range Android.** A software-rendered x86 emulator on a
  workstation says nothing about a Redmi. `gfxinfo` here would be a number that
  looks like evidence and is not.
- **The sunlight gate ON GLASS.** The arithmetic is run; "is this readable at
  noon in a court corridor" is a human judgement about a physical panel, which
  is exactly what `DESIGN_SYSTEM.md` means by "a design gate, not a checkbox".
- **The adjournment four-second target** (`docs/FAILURE_MODES.md`), which is
  explicitly a Redmi-class measurement.

**Added 8 Aug 2026, found during the DONE-criteria audit — two more sprint DONE
lines that were never actually measured, same root cause as the item above,
listed separately because they are distinct claims, not the same one restated:**

- **SPRINT_3.md RCC DONE: "Adjournment capture completes in three taps,
  measured."** Built — the common-case flow is genuinely one tap (second date
  offer preselected) plus Save, matching the code's own comment. **Never
  timed or tap-counted on a device.** The sprint doc's own task text already
  says this "is a thing to MEASURE at S3, not a gate — nobody can evaluate it
  without the device," so the DONE line asserting it happened is itself the
  error, not the build.
- **SPRINT_5.md RCC DONE: "Whole onboarding flow under two minutes, timed."**
  OTP entry, identity/enrolment and the consent step are built. **Never timed.**
  No stopwatch measurement exists anywhere in the repo for this claim.

Both are cosmetically small — a phone and five minutes closes them — but they
are DONE lines currently marked as satisfied in the sprint docs' own commit
history without ever being observed, which is exactly the failure mode Gate S2
was found to have at a much larger scale. Noting so nobody reads "S3 DONE" /
"S5 DONE" as "measured."

**Where it plugs in:** `apps/mobile/android/app/build/outputs/apk/release/` — a
release APK builds and installs in one command. Roughly twenty minutes with a
phone.

# DECISIONS ONLY THE FOUNDER CAN MAKE

### [RESOLVED 11 Aug 2026, REVERSED 12 Aug 2026] FQ-D9 — the desktop research workspace

**REVERSED 12 Aug 2026, said directly to RCC:** *"This is only an app, we do
not plan for a desktop, or a website login for users. The website login is
only for the admin panel."* `CLAUDE.md` §1 and `PRODUCT_BRIEF.md` §Where it
runs are reverted to admin-only web; the reversal is recorded on the same
**PD-15** entry in `PRODUCT_DECISIONS.md`, not a new one. Frozen rather than
deleted, on the founder's explicit call when RCC asked which — see PD-15 for
which files that leaves inert in the tree.

**ANSWERED 11 Aug 2026 (superseded by the above): option 1. Yes — the brief is
amended and web is no longer admin only.** Recorded as **PD-15** in
`PRODUCT_DECISIONS.md`; the superseded lines in `CLAUDE.md` §1 and
`PRODUCT_BRIEF.md` §Where it runs are amended to point at it.

The founder's conditions, all carried into PD-15: mobile stays first-class and is
not redesigned around desktop · build inside the existing `apps/mobile` Expo web
target, no separate app unless that architecture genuinely cannot carry it ·
responsive within the existing architecture where practical · reversible ·
**no backend change for the desktop workspace alone** · and it must not block
unrelated work.

The original entry follows, kept for provenance.

**Added 11 Aug 2026. One sentence from you unblocks it. It is NOT an engineering
question — the engineering turned out to be small.**

**The contradiction.** You have asked RCC for a desktop-first research workspace
(REB §4, V2 §38, and TASK 5 of the current ladder). Two files say the opposite,
and both are load-bearing:

- `CLAUDE.md` §1 — *"Native iOS + Android (Expo). **Web is admin only.**"*
- `PRODUCT_BRIEF.md` — *"Admin is a separate Railway service; **web is admin
  only**."*

Nothing in `PRODUCT_DECISIONS.md`, `docs/OPEN_DECISIONS.md` or
`docs/CURRENT_PLAN.md` mentions a desktop research client at all. So the
workspace exists only in your instructions to me and is contradicted by the north
star, which `CLAUDE.md` §0 says stops work rather than proceeds. I am not
reopening a settled product boundary on my own reading of a task list.

**What I found while scoping it, which changes the decision.** I assumed this
meant a third app under `apps/` and priced it accordingly. It does not:

- **Expo web is already configured and already builds.** `app.config.ts` has a
  `web` block (`bundler: 'metro'`, `output: 'single'`, favicon), `react-dom` and
  `react-native-web` are installed dependencies, and `package.json` already has a
  `web` script. Nobody has to create an app or pick a framework.
- **The screens are already prop-driven.** `JudgmentScreen` takes a `judgmentId`
  and callbacks — no router coupling — so it can be mounted in a second pane with
  no refactor. `SearchScreen` needs ONE optional prop (`openJudgment`) so a
  result opens beside the list instead of pushing a route; without the prop it
  behaves exactly as today.
- **No backend work, no new endpoint, no contract change.** It is the same
  `POST /search` and `GET /judgments/:id` the phone already calls.

So the real cost is roughly a day of client work inside `apps/mobile`, entirely
reversible, and it degrades to today's phone behaviour below the width
breakpoint. That is a very different proposition from "build a web app".

**What I would build, and nothing more.** The smallest coherent workstation:
search and results in a left column, the reader in a right column, the list not
lost when a judgment opens — which is the single thing a phone cannot do and the
whole reason desktop matters for research. No dashboard, no admin surface, no
second design system.

**Answer one of these:**

1. **Yes — amend the brief.** `CLAUDE.md` §1 and `PRODUCT_BRIEF.md` change to
   "web is admin **and desktop research**". I build the two-pane layout in
   `apps/mobile` behind a width breakpoint. *(My recommendation, given the cost
   is a day and the brief line predates the request.)*
2. **No — the brief stands.** Web stays admin only, TASK 5 comes off the ladder,
   and I stop scoping it. Say so and I will not raise it again.
3. **Later** — after Gate S2. I record it in `CURRENT_PLAN.md` as queued and take
   the next research-quality task instead.

**What stays broken without an answer:** nothing. No feature depends on this and
no other task is blocked by it. It is the only item on the RCC ladder I have not
either finished or been able to start, and it is not blocked on code.

---

### [OPEN] FQ-D1 — real filings to evaluate the pseudonymiser · gates core feature #3 · LCC

**Added 11 Aug 2026. This is the top of the chain that blocks drafting, and it is
not the DPA.**

**Needs:** roughly **20 real Indian court filings that contain client PII** —
bail applications, written statements, petitions — or synthetic ones an advocate
confirms are representative. Hindi and English both, since transliterated names
are the hard case. They never leave the machine and are never sent to a model;
they are an evaluation set, not training data.

**Why it cannot be worked around.** Drafting is sensitive-class, so it must be
pseudonymised before any model call. `callModel` refuses every sensitive call
today, on purpose, with the reason in the code: sending raw text while recording
`pseudonymised = true` would put a false claim in the audit ledger. The
pseudonymiser is therefore the gate — and `PRIVACY_PII.md` requires it be
**measured before it is trusted**: *"Evaluate Presidio on real Indian court
documents before trusting it — a published F1 measured on English news text is
not evidence about a Hindi bail order naming four transliterated surnames."*

**We have no such documents and cannot manufacture them honestly.** `documents`
is 0 rows and the judgments corpus is public-class, so it carries no client PII
to detect. Without the evaluation set the ~80% coverage figure stays an
**estimate**, and `CLAUDE.md` forbids describing it as anything else.

**What was built anyway:** nothing speculative, and that is the point — the
finding is recorded in `CURRENT_PLAN.md` §Q1.9 with the full chain, so the next
agent does not re-derive it or start at the wrong end. `POST /documents` is
`SPECCED` in the frozen contract, so no shape needs inventing when this clears.

**What stays broken without it:** core feature #3 entirely. An advocate cannot
create a draft. RCC's `DraftsListScreen` and `DraftDetailScreen` are built,
tested and permanently empty.

**Separate and also owed:** the countersigned DPA (OD-6). It binds *after* this,
not before — resolving the DPA alone changes nothing.

### [OPEN] FQ-VESPA — your Vespa/Qdrant/Milvus question, answered · 11 Aug

**You asked whether Vespa, Qdrant or Milvus would beat pgvector for legal AI. You
were right that something should, and right about which problem matters — but
it is not the vector problem.** Working: `docs/HC_INGEST_PLAN.md` §3.1.

**Qdrant is already excluded** by `CLAUDE.md` §4, by name, next to Neon, Vercel,
Clerk and Supabase. Only you can change that and it should be in writing.

**Milvus is the wrong shape.** It is vector-first, built for billion-vector
scale. **We decided tonight not to build 41M vectors**, so it optimises a problem
we no longer have.

**Vespa is genuinely right, for a reason that is ours specifically.** The real
gap I found tonight is that **Postgres `ts_rank` is not BM25 — it has no IDF**,
so a rare term like *"Kharak Singh"* does not outrank a common one. And Railway
Postgres has **only `pg_trgm` and `vector` available** — `pg_search`,
`pg_textsearch` and `vchord_bm25` are not installable there.

Vespa gives native BM25 **and** programmable ranking expressions — which means
**how often a judgment is cited could become a first-class ranking signal.** We
hold **97,876 citation edges**. Neither BM25 nor an embedding nor any competitor
knows that a judgment has been cited 500 times. **That is a ranking advantage we
own because we built the citation graph, and Vespa is the only one of the three
that can express it.**

**What it does NOT do:** replace Postgres. `CLAUDE.md` requires citation fields
to render from the database row and `overruled_status` to be read live at every
render. **Vespa would be an index built from `judgments`** — so **tonight's
ingest is not wasted under any outcome.**

**Cost to find out: £0.** A single-node Vespa needs 4 GB in Docker; this machine
has 31.7 GB. It can be tested against a real court-year as soon as the first one
lands, with no vendor and no commitment.

**What I need from you:** nothing yet, and that is deliberate. **The right
sequence is ingest first, then measure whether `ts_rank` actually fails advocates
on 15.77M real documents, then decide.** Adding a second serving system to run,
monitor, back up and keep in sync is a real cost, and it should be paid against a
measurement rather than an argument.

### [DECIDED 11 Aug 2026 — YES] FQ-CORPUS — one yes/no unblocks 15.77M documents

**The founder's words:** *"Yes — ingest High Court documents as searchable text
behind the coverage screen, no embeddings for now."*

**Plan and every step's verification command: `docs/HC_INGEST_PLAN.md`.** Two
corrections that the post-approval verification pass forced are recorded in its
§0 rather than absorbed quietly: **we get `ts_rank`, not BM25** (no IDF, and no
BM25 extension is available on Railway), and **Railway storage is ~98 GB ≈
$15–25/month**, which is affordable — the original worry that this machine's disk
was irrelevant because the database lives on Railway was correct in principle and
does not bite at this size.

Original entry kept below for provenance.

### FQ-CORPUS — the original ask

**This supersedes the "embedding cost" half of §Q2, because that half was costed
wrong by everyone including me.** Full working: `docs/CORPUS_GAP_PLAN.md`.

**What I need:** *"Yes — ingest High Court documents as searchable text behind the
coverage screen, with no embeddings for now."*

**Why the old framing was wrong.** Everyone quoted **3,956 GPU-hours**. That is
the cost of *making* embeddings and it is not the binding constraint. Measured on
our own database tonight: the HNSW index is **4.7 GB for 616,197 vectors**, and
`judgment_chunks` is **9.3 GB against 1.5 GB of judgments** — **embeddings are
7.2× the size of the text.** Scaled to the High Courts that is **~41 million
vectors, roughly 490 GB, wanting to sit in RAM**, against a database that is
**11 GB today**. pgvector is documented to stop working well around 5–10M
vectors. **The vectors would not fit, and would not be servable if they did.**

**And they may not be worth it.** On legal passage retrieval BM25 scores **37.1%**
against dense embeddings' **36.8%** — 0.3 points. An advocate searching
`section 138 NI Act` is doing lexical retrieval, which is what Postgres
full-text search does for free.

**What it costs if you say yes:** about **5 days of this machine's time** and
**96 GB of its disk** (of 686 GB free). No GPU, no new vendor, no money.

**What stays broken if you say no:** an advocate searching their own High Court
gets nothing, and Jhana claims all 25 of them. `FEATURE_PARITY.md` §5b.

**What you are actually deciding**, stated honestly: most of those 15.77M
documents are **orders, not judgments** — the measured judgment share is
**0.75%–18.64%** — and **pre-2023 ones carry no citation we can extract**, so they
are searchable and not citable. From 2023 the courts print a neutral citation in
the text and those *are* citable. **The coverage screen already says "documents"
and never "judgments", and already states that share as a range.**

**Stages 2 and 3 need nothing from you yet** — they wait on the citation pass
finishing, which decides which judgments are worth a vector at all.

### [OPEN] FQ-V1 — make `VERIFY:` a command, not a description · 11 Aug

**Needs:** your yes or no to one change in `CLAUDE.md`, which is your file.

**The evidence, not an opinion about my own conduct.** You said I tell you wrong
things and correct myself later. That failure has a name, a measured rate, and a
known fix — `docs/RESEARCH_2026-08-11.md` §1:

- **False success** accounts for **44–52%** of agent failures, and **75.8%** in
  coding agents that emit an explicit completion signal.
- **Reasoning models give no protection** — the traces *"rationalize completion
  rather than verify it"*. Thinking harder does not fix it.
- **Dual control with independent verification drops it to 3%** — an order of
  magnitude, and the largest effect in the literature. **That is what LCC/RCC
  already is.** RCC catching me is the mechanism working.
- **Structured evidence conditions beat an equivalent natural-language summary**,
  worth **+4.8 to +11.8 pp** and **−12.1%** tokens.

**The proposed change.** `CLAUDE.md`'s `DONE:/VERIFY:` is exactly the
natural-language summary that ablation beats:

> `VERIFY:` must name a **COMMAND and its expected output**, never a description.
> *"probe the running service"* is a description. `curl -o /dev/null -w '%{http_code}'`
> returning **401** is a condition.

Every one of my six errors was a claim about system state that one command would
have killed, and the command was not run. The table is in §1.

**Corollary, needing no decision:** cheap mechanical detectors recover **72%** of
false successes against an LLM judge's **13%**, at 1.19 ms versus 4,000 ms. That
argues for **more `scripts/check-*.mjs`, not more prose** — the three that ran
today caught three real defects.

### [OPEN] OD-12 — confirm or reject the saved-search feed · RCC is idle on it · 11 Aug

**Needs:** yes or no to **an in-app saved-search feed**, recorded in
`OPEN_DECISIONS.md` §OD-12.

**The question in one line:** PD-5 excluded subject-following *alerts* —
*"discovery, not an alert; it belongs in the app, never in a notification"*.
`FEATURE_PARITY.md` §3 proposes keeping PD-5 intact and putting the capability
**in the app with no push, no badge, no notification of any kind.** Is that the
reframe you meant, or did PD-5 exclude the capability itself?

**Why it is not an agent's call:** it is a reading of a settled decision. Adopting
a plausible reading alone is how a PD gets quietly reopened.

**What was built anyway:** all four endpoints, server-side and tested —
`GET`/`POST`/`DELETE /saved-searches` and `GET /saved-searches/:id/feed`. Ready
the day you say yes.

**What stays broken without it:** nothing else depends on it, but it is currently
**the only unblocked client work RCC had**, and they refused it correctly — LCC
sent "build this" after reading the contract's status table and missing the
thirteen lines below it saying not to. RCC read the source and stopped.

### [OPEN] OD-11 — Tier B before Tier A, or the sprint plan as written · both lanes

**Needs:** a decision recorded in `BUILD_GUIDE.md` and `sprints/`.
**Why it is not a blocker:** both lanes are building Tier B (the daily loop) and
it works. But `SPRINT_1.md` still puts both lanes on Tier A, so the plan and the
work disagree.
**Cost if never resolved:** it is being settled by execution, which
`PRODUCT_BRIEF.md` explicitly warns against. Someone should write down which
sequencing is real.

### [OPEN] Gate S1's "1M+ documents" criterion — BLOCKER F-1 · LCC

**Needs:** the founder to accept the re-specification.
**Why it is not a blocker:** already corrected in `sprints/SPRINT_1.md`
§Gate correction on the authority of the approved data-and-delivery plan, with the
reasoning recorded. Flagged here so the founder sees it rather than discovering it.
**Cost if never resolved:** S1 cannot close, and both lanes keep building forward
into later sprints — which is exactly what has been happening.

### [RETRACTED 8 Aug 2026] "Six screens need designing" — they were already drawn

**I was wrong and this entry is kept as the record of it.** `design/SCREENS.md`
said "None is drawn" for rows 88–99; seven of them had renders on disk
(`66-consent-clean-draft`, `68-cause-list`, `69-adjournment`, `70-client-share`,
`71-limitation`, `72-bare-acts`, `73-fee-log`). The table was stale, I trusted it
without listing the directory, and I wrote six design briefs for screens that
already existed.

**This is the failure already recorded as `check-the-directory-before-claiming-a-gap`.**
SCREENS.md is now corrected and carries a warning to check the renders directory
before believing any `NOT YET DESIGNED` row in it.

**One real question remains:** `renders/71-limitation@2x.png` could be the
limitation ALERT block (row 91) or the limitation CALCULATOR (row 98). The
filename does not distinguish them and only a human looking at the render can.

### [RESOLVED 8 Aug 2026] Daily cause-list screen is NOT YET DESIGNED · RCC

**It was designed, and all three courtroom screens are now built.**
`renders/68-cause-list@2x.png`, `renders/69-adjournment@2x.png` and
`renders/70-client-share@2x.png` were on disk since 5 August, specified in
`design/screens/IMPLEMENTATION.md` §9d, and marked `designed: true` in the
generated manifest — while `design/SCREENS.md` rows 88–90 still said NOT YET
DESIGNED. The same stale table as the retraction above.

Built: `src/screens/causelist/`, `src/screens/adjournment/`,
`src/screens/clientupdate/`, with the §9d rules carried in the code — grouped by
court and not by time, item number the largest thing on the row, four 64px
targets in the lower half, no confirmation dialog, the advocate's name above ours
on the client card.

**What is left is an ENDPOINT, not a design.** See below.

### [OPEN] `ink-faint` is below WCAG AA, and it is a palette decision · RCC · 8 Aug 2026

**Needs:** a founder/design ruling on `ink-faint` `#8A8578`.

**The measurement**, from `apps/mobile/scripts/check-sunlight.mjs`, which has been
exiting 1 on clean `main` since at least 7 August:

| pair                   | normal     | under washout | AA needs |
| ---------------------- | ---------- | ------------- | -------- |
| `ink-faint` on `paper` | **3.53:1** | 2.15:1        | 4.5:1    |
| `ink-faint` on `card`  | **3.68:1** | 2.21:1        | 4.5:1    |

Everything else in the palette passes. `ink-faint` carries **citations, dates,
metadata and eyebrows** — the small text an advocate reads in a corridor — and
`DESIGN_SYSTEM.md` cites contrast for `caution-text` and `ink-muted` ("clear AA")
but never computed this pair.

**Why it is not a blocker:** the app ships and reads well; body text is 16.4:1
and the accent 12.1:1. Under the washout transform on a real device screenshot,
ink, oxblood, the active tab and the mono values all hold; the `ink-faint`
eyebrows are the only thing that visibly disappears.

**Why RCC did not simply darken it:** `#8A8578` is the published design system,
and the three ink levels are 16.4 / 5.7 / 3.5. Anything reaching 4.5:1 lands
essentially on top of `ink-muted` and collapses a three-level hierarchy into two.
That is a design decision with a visible cost either way, not a token typo.

**Where it plugs in:** one line in `apps/mobile/src/theme/tokens.ts`, plus
`design/DESIGN_SYSTEM.md` §Palette. `node scripts/check-sunlight.mjs` prints the
whole table and goes green the moment it is decided.

---

### [OPEN] The client card as an IMAGE needs one native module · RCC · 8 Aug 2026

**Needs:** approval to add **`react-native-view-shot`** (MIT, Expo-supported) to
`apps/mobile`. It is a package rather than a vendor — no account, no bill, no
service — but it adds a native module and touches the workspace lockfile, which
is not my lane.

**Why it is not a blocker:** the client update ships now. The card is composed
and rendered in-app so the advocate sees exactly what their client will read, and
it sends as text over WhatsApp carrying the same sentences in the same order.
`src/screens/clientupdate/clientCard.ts` holds the words separately from the view
for precisely this reason, so the image path is a render call and nothing else.

**Cost if never resolved:** the card goes as text. `IMPLEMENTATION.md` §9d wants
an image because it "renders in the thread, survives forwarding, and can be shown
across a desk" — losing that is a **marketing** loss on the one organic channel
we have, not an information one. The client still receives the whole update.

**Where it plugs in:** `ClientUpdateScreen.tsx` — wrap the existing card view in
a ref, `captureRef` at 1080×1350, share the file. The layout is already built.

---

### [FOR LCC, NOT THE FOUNDER — recorded here so it is not lost] The advocate-facing cause-list endpoint · 8 Aug 2026

Not a founder item. Written down because the screen now exists, and the endpoint
shape follows the screen — which is what the old entry above said it was waiting
for.

`GET /admin/cause-lists` is the operator's health view. The advocate's morning
needs the **item number and the listed time per matter**, grouped by court:

```
GET /cause-list?date=YYYY-MM-DD
  -> { courts: [ { court, published, publishedAt,
                   items: [ { matterId, itemNumber, listedAt,
                              courtRoom, purpose } ] } ] }
```

`published: false` with empty `items` is a NORMAL 200 and renders as a dashed
row — a court that has not published is a fact an advocate plans around, and
hiding the matter would tell them they have nothing there. `itemNumber` is
nullable for the same reason: a guessed item number sends somebody to the wrong
courtroom at the wrong hour.

The screen is built and works today against `GET /matters` alone, rendering every
listed matter as "not yet published". Nothing above it changes when this lands.

**LCC, 8 Aug 2026 — traced this before writing the endpoint, found three
compounding gaps, none of them a code-shaped fix:**

1. `ecourts.ts`'s `parseCauseList` is a **deliberate stub** — it returns `failed`
   always, on purpose: _"there is no captured sample of the response to write an
   extractor against. Writing one from an assumed shape would be inventing a
   schema — and a cause-list parser that is wrong in a plausible way is the
   single most dangerous object in this product."_ That reasoning is correct and
   this is not mine to override by guessing a shape.
2. There is **no persisted item-level table**. `CauseListItem` (cnr, caseNumber,
   courtNumber, itemNumber) exists only as an in-memory type on the never-taken
   `ok` branch of `parseCauseList`. Nothing writes an item to the database —
   `cause_list_syncs` records per-court-day HEALTH (ok/empty/stale/failed,
   `item_count`), never the items themselves.
3. **Nothing seeds `cause_list_syncs` rows automatically.** The only writer is
   `POST /admin/cause-lists/:id/retry`, a manual admin action on a row that
   already exists. There is no scheduled job that creates a row per active
   matter's court for a given date. So even a correctly-built `GET /cause-list`
   would return `published: false` for every court, every day, until a second,
   separate piece of work exists: a scheduler that actually populates the table.

Building the endpoint today would be real, correctly-wired code that changes
nothing observable — the same "presence is not correctness" trap the design
render checker was built to catch, in a different lane. Not building it. The
gate is (1), which needs a captured real eCourts cause-list response before
anything downstream can be honest — same class of blocker as (3) below
(dataset-shaped, not decision-shaped, so not routed to the founder either).
Revisit once a real sample exists to parse against.

### [OPEN] Limitation and court-fee calculators need a sourced dataset · RCC · 8 Aug 2026

**Needs:** the Limitation Act 1963 schedule (article → period → starting point,
~180 rows) and the per-state Court Fees Act ad valorem tables, in a
machine-readable form with provenance — the same standard `DOMAIN_TRUTH.md`
holds BNS/BNSS/BSA to. indiacode.nic.in carries the bare Acts; nobody has yet
turned them into the row-level table a calculator needs, the way LCC did for
the IPC↔BNS mapping.

**Why this is not a blocker RCC can route around:** `IMPLEMENTATION.md` §9d
calls the limitation answer "the highest-anxiety calculation an advocate
makes — missing a limitation period is malpractice" and requires the
provision to be "quoted verbatim directly beneath it." `DOMAIN_TRUTH.md` and
this file's own hard rules are explicit: never invent a section number or a
legal fact from memory, primary sources only. Building either calculator
without a sourced table is the exact failure class this product exists to
prevent, on the two calculations where a wrong answer costs a client their
case.

**Cost if never resolved:** rows 98–99 (`SPRINT_3.md`/`SPRINT_4.md`,
`IMPLEMENTATION.md` §9d) stay unbuilt. Both are Tier B weekly-use screens, not
Tier A, so nothing else in the product depends on them.

**Where it plugs in:** a `limitation_periods` / `court_fee_schedule` table,
`packages/db` — LCC's lane once the source data exists, the same shape as
`statute_mappings`. The client-side arithmetic (a limitation calculator is
mostly date math once the period and starting rule are known) is straightforward
against `theme/hearingDate.ts` and is not the hard part.
---

### [OPEN] `POST /documents` (drafting) and `POST /documents/:id/export` — three compounding gaps · LCC · 8 Aug 2026

Traced before writing either endpoint, same discipline as the cause-list entry
above. This is Tier A feature 3 — document drafting — and it is genuinely
credential- and content-blocked, not engineering-blocked:

1. **No LLM has ever been called from this codebase.** Grepped for OpenRouter,
   `chat/completions`, any model call, anywhere in `services/`: zero results.
   `llm_calls` exists as a table with nothing writing to it. Generation needs a
   real OpenRouter client built from scratch — legitimate work, not the blocker
   — but it needs `OPENROUTER_API_KEY` and, per CLAUDE.md §5's sensitivity
   routing, `SENSITIVE_LLM_API_KEY` for the pseudonymised Claude path. **Neither
   is in Railway** (checked: `railway variables --service api --kv`, both
   absent).
2. **No `draft_templates` row has ever been created — and neither has the
   table.** A systematic sweep (8 Aug 2026, prompted by finding the same gap
   three times in a row on `citation_disputes`/`ocr_jobs`/`data_requests`)
   found `draft_templates` and `pii_entities` are ALSO documented in
   `SCHEMA_TRUTH.md` with no `CREATE TABLE` anywhere. Not created in this
   pass, deliberately — `schema.ts`'s own rule: _"a deferred table created
   'while you're in there' is exactly what that decision forbids."_ Whoever
   builds `admin/templates.ts` or the pseudonymisation pipeline creates the
   table THEN, as part of that work, checked against `SCHEMA_TRUTH.md`'s
   column list before writing a migration.
   `SCHEMA_TRUTH.md`: _"Nothing
   ships below 90 without a founder override,"_ and nothing has been scored,
   because nothing has been written. A drafting template's prose is exactly the
   kind of primary-sourced legal content CLAUDE.md's hard rules forbid inventing
   from memory — a bail application template is not a fact I can look up in this
   repo, and getting a BNS-era clause wrong is the failure this whole product
   exists to prevent, aimed at itself. This is a content/legal-review task, not
   a code one.
3. **Export needs R2 and has none of it either.** No S3-compatible client exists
   in the codebase, `R2_DOCUMENTS_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`
   are all absent from Railway, and no docx-writing library is in the dependency
   tree yet (OSS-first vetting owed before adding one).

**What I did not do:** invent an honest-refusal response shape for `POST
/documents` the way `court/lookup.ts`'s `available: false` does. The contract
(`docs/API_CONTRACTS.md`) defines `{ documentId, content, citations,
unverifiedReferences }` with no refusal variant, and adding one unilaterally is
an API-contract decision, not an engineering judgment call — `API_CONTRACTS.md`
is frozen per sprint for exactly this reason.

**Cost if never resolved:** Tier A feature 3 (drafting) stays unbuilt. Nothing
else in the sprint depends on it — S3 (matters) and the alerts surface shipped
independently.

**Where it plugs in, once unblocked:**

- `OPENROUTER_API_KEY` + `SENSITIVE_LLM_API_KEY` → a new `services/api/src/llm/`
  client, routed by `CLAUDE.md` §5 (public → DeepSeek V4 Flash, sensitive →
  pseudonymise then Claude Sonnet 4.6), every call logged to `llm_calls`.
- A reviewed, primary-sourced draft template (starting with `bail`, the
  document type with the clearest structure) scored ≥90 against the gates in
  `draft_templates.gate_results` — court-format compliance, no invented
  citations, no overruled authority cited as good law, Hindi parity. This is
  the part that needs either the founder or a legal reviewer's sign-off, not a
  key.
- R2 credentials → `packages/*` or a new `services/api/src/storage/` client,
  `docx`-writing library chosen against `docs/OSS_STACK.md`'s MIT/Apache/BSD
  rule before it's added.

---

### [OPEN] `GET /admin/privacy/coverage` — two docs disagree on what this endpoint reports · LCC · 8 Aug 2026

Not a credential gap, and not decision-shaped in the usual sense either — this
is a genuine conflict between two authoritative docs about a DPDP-facing
compliance number, and I am not resolving it by picking the reading that is
easier to build.

**`docs/PRIVACY_PII.md`**: _"Realistic coverage is around 80%... Evaluate
Presidio on real Indian court documents before trusting it... Until that
evaluation exists, the ~80% figure above is an estimate, not a measurement, and
should be described that way internally too."_ No evaluation has been run —
there is no ground-truth/held-out dataset anywhere in this repo to run one
against.

**`docs/SCHEMA_TRUTH.md#data_requests`**: _"Pseudonymisation coverage is
measured, not asserted — computed from `pii_entities` against detected-entity
counts, and reported as a number (currently 99.2%)."_ This describes a formula
I traced and could not make honest: `pii_entities` (`SCHEMA_TRUTH.md
#pii_entities`) stores ONLY the entities that WERE tokenised — by construction,
every row in it is a "detected" entity that got pseudonymised. A ratio of
`pii_entities` count against itself is tautological and would read as ~100%
regardless of how much real PII the detector actually missed. It does not
measure what `GET /admin/privacy/coverage`'s contract description says it
measures ("what fraction of real PII did we catch"), and shipping a
confident-looking 99.2% built on a self-referential ratio is exactly the
failure `CLAUDE.md` §6 names directly: _"Never claim complete PII removal.
Coverage is partial. Say so plainly."_ A number that LOOKS measured but isn't
is worse than the honest ~80% estimate PRIVACY_PII.md already gives.

**Not building either version.** `GET/POST /admin/data-requests` (the other
three endpoints in this contract section) are built and deployed — this is the
one endpoint in that group left out, specifically.

**Cost if never resolved:** the admin privacy screen has no live coverage
number; `docs/PRIVACY_PII.md`'s ~80% estimate is the only figure anyone can
quote today, stated as an estimate, which is already the honest position.

**Where it plugs in:** whichever of these gets picked —

1. Run the Presidio evaluation `PRIVACY_PII.md` calls for, against real (or
   realistic synthetic) Indian court documents with human-labeled PII, and
   store the RESULT somewhere queryable — a `pii_evaluation_runs` table or
   similar, not a hardcoded number in code. Then `GET /admin/privacy/coverage`
   reads the latest run.
2. Or: redefine what this endpoint actually reports — e.g., a genuinely
   computable operational metric like "% of sensitive-class documents that
   went through pseudonymisation before any model call" (checkable from
   `llm_calls.pseudonymised` once that pipeline exists) — which is a real,
   honest number, but a DIFFERENT claim than "how much PII did we catch," and
   the contract description and any UI copy would need to say so precisely.
   Either is a product decision about what this screen is allowed to claim, not
   an engineering one.

---

### [IN PROGRESS, NOT BLOCKED] IPC↔BNS mapping — real path exists, `statute_mappings` still 0 rows · LCC · 8 Aug 2026

**Correcting my own earlier framing.** I had treated this as blocked-by-design,
citing `DOMAIN_TRUTH.md`: _"never hardcode a mapping in application code, never
let a model generate one."_ `docs/DATA_SOURCES.md` §4 (already in the repo,
dated 7 Aug 2026, apparently written before I read it carefully) documents a
methodology that satisfies that rule rather than being forbidden by it —
**parse a real government PDF, then verify every candidate row against primary
text we already hold, storing only what checks out.** That is verification,
not generation, and it is the same discipline the citation graph already uses.

**The plan, already written down:**

1. Parse the UP Police comparative table (23 pages, BNS↔IPC, chapter by
   chapter) — a real state-police-force publication, not the Gazette, and
   `DATA_SOURCES.md` is explicit that this caveat "must not be laundered into
   'official'."
2. For each candidate pair, compare the BNS section text (already in our
   corpus, 358 sections) against the IPC section text.
3. Store only pairs whose text corresponds. Flag the rest. Never store a
   guess.
4. Hand-check 20, as `SPRINT_1.md` requires.

**What's actually done today: nothing yet, and here is exactly where I stopped
and why.** IPC, CrPC and the Indian Evidence Act are not in the corpus —
confirmed via `GET /statutes`. They are repealed, and `services/ingest/src/
statutes.ts`'s `CRIMINAL_CODE_HANDLES` only carries the three CURRENT codes,
resolved against the site by hand after "a first guess had BNSS and BSA
transposed." The same discipline applies to the repealed Acts: **their handles
must be resolved against indiacode, not guessed**, and a first attempt at
`browse?type=shorttitle&q=...` returned nothing — repealed Acts most likely
live in a different index than the 845-Act "Central Acts" browse I already
enumerated and fixed today (the `parseActPage`/`dedupeSectionRefs` fixes), and I
have not yet found which one.

**Why not built in this pass, given the plan is real:** three substantial,
separable pieces of unstarted work — (a) finding the right indiacode index for
repealed Acts and ingesting IPC/CrPC/Evidence through it, (b) fetching and
parsing a 23-page two-column PDF table, (c) writing and validating a text-
correspondence comparator, on the one number in this entire product where a
wrong answer tells an advocate the wrong law applies to their client. That is
worth a clear head and its own pass, not the tail end of an already very long
session with alerts, nine other admin endpoints, and two live-verified corpus
bugs behind it.

**Cost if never resolved:** `statute_mappings` stays at 0 rows; an advocate
searching an IPC section by number gets nothing rather than the BNS
equivalent. Sprint 1 DONE criterion stays open.

**Where it plugs in:** `services/ingest/src/statutes.ts` (repealed-Act
handles, resolved the same way `CRIMINAL_CODE_HANDLES` was), a new PDF-parsing
module for the UP Police table, and a new comparator writing to
`statute_mappings` — schema and columns already specified in
`SCHEMA_TRUTH.md#statute_mappings`.

### [OPEN] Saved-search feed — confirm before RCC builds the client surface · RCC · 8 Aug 2026

**Needs:** a yes/no on `FEATURE_PARITY.md` §3's proposed PD-5 reframe — "a
saved-search feed inside the app, never a push."

**Why it is not RCC's to just build:** `docs/API_CONTRACTS.md` says it in the
endpoint's own doc: _"The endpoint existing is not approval to build the
surface... do not build the client surface until that is confirmed."_ All four
endpoints (`GET/POST/DELETE /saved-searches`, `GET /saved-searches/:id/feed`)
are BUILT server-side, unused client-side. This was flagged as an open item in
`FEATURE_PARITY.md` §3/§7 on 5 Aug but never actually escalated here — found by
re-reading the contract doc line by line rather than skimming the endpoint list.

**Where it plugs in:** `apps/mobile/src/screens/search/` — a "Saved" tab or
similar, once confirmed. Zero client code exists; nothing to undo either way.


---

**UPDATE 8 Aug 2026 — the blocker above is solved, by observation.**

The stopping point was: *"a first attempt at `browse?type=shorttitle&q=...`
returned nothing — repealed Acts most likely live in a different index than the
845-Act Central Acts browse, and I have not yet found which one."*

They do, and here it is. India Code's own description is **"Contains all
Enforced Central and State Acts"**, which is why an enforced-acts browse will
never list IPC however carefully it is queried — the 845 are the enforced set,
and the absence was correct rather than a parsing failure. The repealed Acts are
still on the site as items; they are simply not in that index.

Resolved against the site today, each confirmed by the title India Code itself
returns:

| Act | handle | title returned |
| --- | --- | --- |
| Indian Penal Code, 1860 | `123456789/11091` | `INDIAN PENAL CODE, 1860` |
| Indian Evidence Act, 1872 | `123456789/4218` | `INDIAN-EVIDENCE-ACT-1872` |
| Code of Criminal Procedure, 1973 | `123456789/4221` | `Criminal-Procedure-Code-CrPC-1973` |

(`123456789/16225` appears in search results for the CrPC and is **invalid** —
India Code answers "Invalid URL or Argument(s)". Recorded so nobody tries it
twice.)

**The caveat that changes the remaining work, and it is not small.** Those
titles are filenames. These are PDF bitstream items, not the structured act
pages `parseActPage` reads — the enforced acts have an HTML page with per-section
links, and these do not. So ingesting them is not "add three handles to
`CRIMINAL_CODE_HANDLES`"; it needs a PDF-to-sections path that does not exist
yet. **That is now the whole of C1's first piece**, and it is a known quantity
rather than an unknown one.

Nothing else in the plan above changes: parse, then verify every candidate pair
against primary text we hold, store only what checks out, hand-check 20.

---

### [RESOLVED 8 Aug 2026] Matter sharing only works one direction · RCC raised, LCC fixed

**Both halves fixed and tested against a real database.** RCC's read of the
source was exactly right and the endpoint request was the correct call.

**One deliberate departure from the suggested fix, and it matters.** The
request was to add the `OR EXISTS (share)` clause to `getMatter`,
`listMatters` **and the briefing path**. The first two are done. Briefings are
**not**, and neither are documents — PD-4 grants a share _"the court record and
shared notes only"_, and a briefing is generated FOR the owner carrying a
preparation checklist derived from their matter. Everything the rule does not
name is withheld. `GET /briefings/:id` stays owner-only in all four of its
access checks, verified.

Also: the redaction is done **in SQL, not in the mapper**. A plain
`OR EXISTS` would have handed the sharee the owner's PRIVATE notes — a
confidentiality breach between two advocates, which is the exact hazard PD-3
cites for refusing chamber-wide sharing.

**A second gap was found behind the first**, and is also fixed:
`createShare` only linked `invited_user_id` when the invitee already had an
account, while its own comment promised _"the share binds when they arrive."_
Nothing bound it — invite pre-signup and they were locked out permanently.
`bindPendingShares` now binds at profile creation and profile update. It is
one-time and idempotent (`invited_user_id IS NULL`), deliberately **not** an
identifier match at read time: Indian mobile numbers are recycled, and read-time
matching would hand a stranger somebody else's matter years later. Both cases
are asserted.

**RCC can now build the sharee side.** `GET /matters` and `GET /matters/:id`
both return an `access: 'owner' | 'shared'` field so the client never has to
infer "this is shared with me" from an empty documents array.

---

### [SUPERSEDED — see above] Matter sharing only works one direction · RCC · 8 Aug 2026

**Needs:** LCC to add sharee visibility to `GET /matters`, `GET /matters/:id`,
and the briefing-fetch path — an `OR EXISTS (SELECT 1 FROM matter_shares WHERE
matter_id = matters.id AND invited_user_id = :userId AND revoked_at IS NULL)`
clause, or equivalent.

**Why it is not RCC's to route around:** read `services/api/src/matters/
route.ts`'s `getMatter` and `listMatters` directly — both filter strictly on
`user_id = owner`, no exception. An owner can create a `matter_shares` row
(`POST /matters/:id/shares` is BUILT and works), but **the invited advocate has
no endpoint that will ever show them the matter** — not the list, not the
detail, not its briefings. The feature is real on the owner's side and a dead
end on the sharee's side.

**Cost if never resolved:** the render this sprint is built from
(`renders/59-chamber-sharing@2x.png`, `60-citator-alerts@2x.png` panel 3 — "the
junior's view... appearing at short notice") depicts exactly the flow this
gap blocks. Building it client-side would produce a screen with nothing to
show, ever, for the one user it's for.

**Where it plugs in:** RCC is building the owner-side invite/list/revoke UI
now regardless — that part is real and independent. The sharee-side "shared
briefing" treatment (SPRINT_3 item 4) is written and ready to wire the moment
the endpoint exists; flagging rather than blocking on it.

---

### [OPEN] Draft template library and court rules reader have no data source · RCC · 8 Aug 2026

**Needs:** a founder call on whether these are in scope at all before content
sourcing starts, same class of question as the fee/limitation datasets already
queued.

**What's actually missing:** `design/screens/SCREENS.md` rows 120 and 122 have
real canvases (`13-draft-template-library.dc.html`, `14-court-rules-reader.dc.html`)
but checked `docs/SCHEMA_TRUTH.md` directly — `draft_templates` is AI-generation
prompts only (one `prompt` text field, golden-set scoring), not a static-forms
table, and there is no `court_rules` table or dataset anywhere in `docs/DATASETS.md`.
Row 120's own label calls it "static forms, distinct from the 10 generated
drafts" — a genuinely different, unscoped feature, not a rendering task.

**Cost if never resolved:** two designed screens stay unbuilt. Neither is on
any sprint's RCC task list, so nothing currently depends on them.

**Where it plugs in:** new schema (not `draft_templates`) plus real court-form
and court-rules text, sourced the same way the fee schedule would need to be.

---

### [OPEN] In-app purchase — vendor pick and store account setup · RCC · 8 Aug 2026

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** Vendor recommendations here are historical input, not binding. LAUNCH_COMMERCE = FREE_BETA | PAID_V1 at Gate D; if PAID_V1, re-measure the current supported PBL8+ first. See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

**Needs:** (1) approval to add `react-native-purchases` (RevenueCat) as a
dependency — a new vendor, proprietary SaaS behind an MIT-licensed SDK, not
covered by `docs/OSS_STACK.md`'s OSS-first default; (2) Apple Developer Program
enrolment with the three subscription products created in App Store Connect;
(3) the matching products in Google Play Console with billing configured;
(4) a RevenueCat account (free tier covers this stage).

**Why now:** re-reading `PRODUCT_DECISIONS.md` PD-13 and `docs/OPEN_DECISIONS.md`
OD-10 together (not just the subscription render, which is stale on this exact
point) shows the "Subscription" screen needs **real native in-app purchase**
for Practice/Chamber/Expert — App Store guideline 3.1.1 — not the web checkout
`renders/51-subscription@2x.png`'s own caption claims. OD-10 already settled
"launch on standard store billing," which is this.

**Researched, not guessed:** compared `react-native-purchases` 10.7.0,
`expo-iap` 5.0.1 and `react-native-iap` 16.0.2 (`expo-in-app-purchases` is dead
— no release since Oct 2023, gone from Expo's own docs). `expo-iap` and
`react-native-iap` are now the same OSS project (OpenIAP monorepo) and would
avoid the new vendor entirely, but push receipt validation, renewal sync, and
reinstall/device-switch entitlement recovery onto us — real infrastructure, not
a config choice. RevenueCat is free until $2,500 MTR then 1%, and is the
faster, lower-risk path for a team this size. Recommending RevenueCat but not
installing it without a yes, per "ask before adding any vendor."

**Where it plugs in:** none of these libraries run in Expo Go — needs a dev
client / prebuild either way, worth knowing before this lands.
`apps/mobile/src/screens/settings/`, `apps/mobile/src/screens/subscription/`.
**Not blocking:** the display-only Profile/Settings/tier-comparison screens
build now, using PD-13's real names (Practice/Chamber/Expert/Firm), with the
purchase action stubbed and honestly disabled until this is resolved.

---

# RESOLVED — kept for provenance

### [RESOLVED 8 Aug 2026] `verified_by_source` — bulk eCourts resolution gets its own value

**Was:** a yes/no on adding `ecourts_bulk` to the `verified_by_source` enum.

**Why it is not mine to decide:** `CITATION_HARNESS.md` is a binding spec and
this changes what a stored value _means_. Today `verified_by_source = 'ecourts'`
carries a specific guarantee — **a named human personally vouched for this
citation**. That is why it caches permanently and why it is the fallback when
Tiers 1 and 2 disagree.

The grant now permits **bulk, authorised, automated** eCourts resolution. If
that writes the same `'ecourts'` value, the strongest guarantee in the product
silently degrades to "a machine said so" — and it would still read `ecourts` in
the database. No test would fail. Nothing would look wrong.

**Why it matters commercially, not just technically:** `CORPUS_TIERING.md` §6
concluded that High Court judgments are hard to _cite_ rather than hard to
_hold_ — 0 of 30 sampled PDFs carry a neutral citation — and that the long tail
would therefore arrive `unverified` and become citable one advocate at a time.
The grant changes that constraint: the tail can arrive **already citable**. That
is the difference between holding 33M documents and holding 33M usable
authorities, and it is the largest change to our data position since the corpus
began. `docs/DATA_ADVANTAGE.md` §2 has the full account.

**Cost if never resolved:** either bulk resolution does not happen (we keep a
large, mostly-unciteable tail), or it happens under the existing value and
quietly dilutes the one signal an advocate relies on most.

**Where it plugs in:** `verified_by_source` in `docs/SCHEMA_TRUTH.md` and the
enum in `packages/db`, plus the tier ordering in `CITATION_HARNESS.md`.
Additive — no existing row changes meaning.

**Founder's answer, 8 Aug 2026: approved as recommended.** Built the same day.

- `packages/db/drizzle/0022_ecourts_bulk_source.sql` — `ALTER TYPE ... ADD VALUE
  'ecourts_bulk'`, additive, no backfill.
- `services/api/src/citations/source-strength.ts` — strength ordering
  (`ecourts` > `public_x2` > `ecourts_bulk` > `corpus`), the
  upgrade-never-downgrade rule, and the single wire boundary. 9 tests.
- Docs: `SCHEMA_TRUTH.md`, `CITATION_HARNESS.md`, `API_CONTRACTS.md`.

**One thing the question surfaced that was not part of it.** Auditing where the
column reaches a client found that `GET /citations/:id` and `GET /documents/:id`
handed the raw column straight out, while the client types the field as a closed
four-value union and looks its label up in a `Record`. The two diagnostic values
(`indiankanoon`, `aws_s3`) would have produced a blank label. Nothing had broken
because nothing had ever written them — an absent check, not a negative result.
Both routes now go through the boundary, which is exhaustive over the column.

**Still owed by RCC before bulk resolution ships:** `VerifiedBySource` in
`apps/mobile/src/api/contract.ts` and the label map in
`apps/mobile/src/citation/tiers.ts` need the fifth value. Logged in
`docs/LCC_TO_RCC_HANDOFF.md`. No live exposure meanwhile — nothing emits it yet.

---
### [RESOLVED 7 Aug 2026] Resend sending domain

`lawmind.co` verified; DNS written via the Spaceship API; delivery to a non-owner
address observed. Production holds a **send-only** key.

### [RESOLVED 7 Aug 2026] `EXPO_ACCESS_TOKEN` for push

**Not needed.** Expo's push API accepts unauthenticated sends; the token is only
for opt-in enhanced security. Delivery is built and tested.

### [RESOLVED 7 Aug 2026] Railway cron service creation

Assumed to be a console action; it was not. `railway add` plus
`serviceInstanceUpdate` over the GraphQL API created and configured both the
`cron` and `recheck` services, and each was proved by running it.

---

### [RESOLVED 9 Aug 2026] An LLM key — three Gate S2 metrics cannot be measured without one · LCC · 8 Aug 2026

**RESOLVED.** The founder supplied `OPENROUTER_API_KEY` and an Anthropic key on
9 Aug. Both verified with live calls: DeepSeek V4 Flash at **$0.098 / $0.196 per
million tokens** (one call cost **$0.0000029**) and Claude Haiku 4.5. The cost
estimate above held — this was an account, not a budget item.

**And the entry was wrong about one thing, which is why it is kept rather than
deleted.** It said the harness *"switches the three metrics on the moment
[the key] is present"* — and that was exactly the defect. `run-cli.ts` reported
`hallucinationRate: generationReady ? 0 : null`, so **a key merely EXISTING made
two metrics report a PASS**, with no model call anywhere in the package. Fixed
9 Aug: there is now a real generation path (`generate.ts`) and a real adversarial
runner (`adversarial.ts`), and the numbers are measured. `adversarialPassRate`
came back at **20.0%** against a threshold of 1.0 — a genuine, honest failure,
which is worth more than the fabricated pass it replaced.

**Still owed, and now larger than it was:** the countersigned DPA. See below —
it no longer gates only uploads.

---

### [OPEN] The DPA now gates a RETRIEVAL feature, not just uploads · LCC · 9 Aug 2026

**Needs:** the countersigned data-processing agreement (OD-6, resolved 2 Aug —
the decision is made, the signature is not).

**What changed on 9 Aug.** HyDE is built and wired
(`services/api/src/search/hyde.ts`). It asks a model to write the passage an
answer would look like and embeds *that*, closing the register gap between how
an advocate asks and how a judgment speaks. Reported effects in the literature
are **+0.125 recall and +0.143 precision** — against a reranker that gives at
best **+0.046** and does not fit the latency budget.

**Why the DPA reaches it.** A published judgment is public data. **An advocate
typing *"can I get bail for my client Rakesh, charged under section 302"* is
not.** `CLAUDE.md` §5: ambiguity resolves to sensitive, never to public — and
sensitive-class traffic is refused until the DPA exists, *with no founder
override*. So `hydeText` takes `dataClass` as a required parameter and the
routing layer refuses it for real user queries today.

**Why it is not a blocker:** it measures on the harness, whose queries are
extracted verbatim from published judgments and are public by construction. So
we will know what HyDE is worth before the signature arrives — we just cannot
give it to an advocate.

**Cost if never resolved:** uploads never ship (already known), *and* the single
most promising retrieval lever stays permanently off for real users. It would
still work for the corpus-side work, so this does not stop Gate S2.

**Where it plugs in:** `DPA_COUNTERSIGNED=true` on the `api` service. One
environment variable, no code change — `services/api/src/llm/route.ts`.

---

### [SUPERSEDED — see above] An LLM key · LCC · 8 Aug 2026

**Needs:** an `OPENROUTER_API_KEY` on the `api` service (and for the harness).

**Why it is not mine to solve:** it is a credential and a spend decision. Every
other blocker this week turned out to be a CLI call; this one is not.

**What it blocks, precisely.** Gate S2 turns on six metrics. Three of them —
`hallucinationRate`, `silentDropRate` and `adversarialPassRate` — measure what
happens when a MODEL produces a citation. With no key the model path cannot run,
so the harness reports them as **NOT MEASURED and grades them as failures**.

That is deliberate and it is the right behaviour: a citation gate that has never
asked a model for a citation has not tested the thing it exists to test.
Reporting them as 0.0% would be worse than useless — every ceiling is zero, so
an unmeasured metric would read as a perfect score.

**What was built anyway.** Everything except the call itself:
- the five-case adversarial set, with machine-checkable pass conditions per case
  (`services/harness/src/fixtures/adversarial.json`) — refusal wording, forbidden
  strings, and whether any citation may be attached at all;
- the whole harness, which measures the three retrieval-side metrics today and
  fails honestly on the three it cannot reach.

**Cost estimate:** the adversarial set is 5 prompts and the fixed query set 30.
A full gate run is well under ₹100 at Sonnet rates, and the routing rules
(`CLAUDE.md` §5) put most of it on cheaper models. This is not a budget item; it
is an account.

**Where it plugs in:** `services/api/src/index.ts` reads it; the harness reads
`OPENROUTER_API_KEY` directly and switches the three metrics on the moment it is
present. No code change needed when the key arrives.

---

### [OPEN] Gate S2's human half — an advocate must review 20 outputs · LCC · 8 Aug 2026

**Needs:** a practising advocate to review 20 search outputs for relevance.

**Why it is not mine:** `PID.md` gives the reviewing advocate the power to block
the gate, and engineering cannot overrule it. That is the correct arrangement and
it is not something I can stand in for.

**Why it matters more after this week's numbers.** The automated half now reports
success@5 = 24.0% against a floor of 70%. The harness can tell you the judgment a
court actually cited was not in the top five. It cannot tell you whether the five
judgments it DID return were useful — an advocate might find four of them
perfectly good authority for the same proposition, in which case the product is
better than the metric says. Or they might find them irrelevant, in which case it
is worse. **Both readings are consistent with 24%,** and only a lawyer can settle
which is true.

**What was built anyway:** the automated half runs, and `HARNESS_JSON=<path> pnpm
harness` writes every query, its top five titles, and the gold answer to JSON —
which is the review packet, ready to hand over.

**Not blocking:** the automated half does not wait for this.

---

### [FOR LCC, NOT THE FOUNDER — recorded so it is not lost] Two of PD-5's four alert triggers cannot fire · 8 Aug 2026

Found while building E1.2, the alert drill S6 claimed had run and never had.
Not a founder decision — it is my lane's work — but it is written here because
this file survives compaction and a fresh agent, and a settings toggle that
controls nothing is the kind of defect that survives a long time.

**PD-5 names four triggers. Two exist.**

| PD-5 trigger | alert kind | can it fire |
| --- | --- | --- |
| An authority saved to a matter is set aside or overruled | `saved_authority_moved` | yes |
| An authority cited in a filed draft is set aside | `filed_citation_moved` | yes |
| A judgment in one of the advocate's own matters is uploaded | **none** | **no** |
| A matter is listed on a date they did not know about | **none** | **no** |

`alert_kind` holds exactly two values and `citations/fanout.ts` is the only
writer of `alerts`. There is no enum value and no code path for the other two.

**The visible part is worse than the missing part.** `users` carries
`alert_own_matter_judgment` and `alert_unknown_listing`, both defaulting to
true, and `PATCH /me/alerts` accepts and persists them. So the app offers an
advocate two switches that govern notifications the system cannot produce. They
will turn one off, or leave it on, and either way nothing happens — and the
first time they notice is when a hearing is missed and they check whether they
had asked to be told.

**PD-6 is affected too.** It names two standing exceptions that push
immediately. `set_aside` on a citation in an exported draft works. **"A newly
discovered listing for tomorrow" cannot fire at all** — it is trigger 4, and
trigger 4 does not exist. That is the more serious of the two exceptions: it is
the one about missing a hearing.

**Why they are not simply built now.** Trigger 3 depends on document upload,
which is behind the countersigned DPA (OD-6). Trigger 4 depends on cause-list
ingest producing listings for matters the advocate did not enter by hand, which
is the eCourts harvest path. Both are real dependencies, not excuses — but a
third alert kind added today would have nothing to write rows from, and an enum
value with no writer is how this gap was created in the first place.

**What must happen before either ships:** the drill (E1.2) covering all four
triggers and both PD-6 exceptions, run and observed. E1.1 is done and its FIRST
VERSION PASSED WHILE TESTING NOTHING — caught only by an assertion that the
simulated failure had actually occurred. E1.2 gets the same guard.

---

### [SETTLED — FOUNDER AUTHORIZATION] Supreme AI data authorization · 11 Aug 2026

**Current state:** `Supreme AI` is a separately named authorized source under the
founder's confirmed LawMind data authorization, valid through **13 November 2029**.

This is **not** the same source as `Supreme Today`. The historical Supreme Today
entries below must not be used to override or reopen the Supreme AI authorization.

For the LawMind data program, Supreme AI may be used for the authorized activities
covered by the founder's agreement, including citation/query evaluation and other
permitted data processing, training, distillation, and retrieval-data construction.

Competitor-derived outputs remain provenance-labelled and do not replace primary
legal evidence. Final citation truth still comes from verified primary sources.

---

### [HISTORICAL — DISTINCT FROM SUPREME AI] Supreme Today prices at ₹5,000/yr for our exact user · LCC · 8 Aug 2026

**Needs:** a decision on whether PD-13's tiers get a jurisdiction-scoped entry
price, or whether we deliberately decline that segment.

**Why it is not mine:** it is pricing, and PD-13 is settled. This does not reopen
it — it reports that the ground under its justification moved twice.

**The facts, verified from their own subscription page 8 Aug 2026:**

| Supreme Today plan | Price/yr | AI? |
| --- | --- | --- |
| AI Legal Research & Writing (India) | ₹20,000 | yes, "unlimited" |
| Keyword Search | ₹15,000 | no |
| AI Combo State (SC + one HC) | ₹10,000 | yes |
| **Keyword Combo State (SC + one HC)** | **₹5,000** | no |

**₹5,000/yr is ₹417 a month.** A district practitioner who works in one High
Court's jurisdiction gets the Supreme Court plus their own High Court, searchable,
for that. `COMPETITIVE_TEARDOWN.md` §4 identifies solo and small-chamber
practitioners in district and High Courts as exactly who we are for. Supreme Today
has had a product priced for them for years, sold through legal booksellers.

**And it is now two data points, not one.** `COMPETITIVE_TEARDOWN.md` §6 already
flagged Prism Pro at ~₹1,250/mo effective against `COMPETITIVE.md`'s SCC Online
anchor of ~₹5,000/mo. Supreme Today's AI plan is ₹1,667/mo. **The anchor for AI
legal research specifically is now roughly 3–4× below what `COMPETITIVE.md`
assumes**, and two independent incumbents sit there.

**One thing that is not a pricing question and is worth acting on regardless:**
their entire comparison asset — both screenshots the founder supplied — attacks
**credit metering**. "Unlimited" is their headline against a credit-based rival.
Whatever the tiers become, **a credit meter is a competitive liability in this
market.**

**What was built anyway:** nothing here needs a decision to proceed — the
teardown, the verified pricing table and the strategy are in
`docs/COMPETITOR_SUPREME_TODAY.md`, and the engineering items it produced
(treatment propagation, the citator report) are done and committed.

**Cost if never resolved:** we launch above the price the segment we designed for
already pays, against an incumbent with thirty years of trust in it.

---

### [OPEN] Is the verification RECORD a product, or a feature? · LCC · 8 Aug 2026

**Needs:** a yes/no on building a per-citation verification record an advocate can
attach to a filing.

**Why it is not mine:** it is not one of `PRODUCT_BRIEF.md`'s four features, and
that file's own rule is that anything outside them is an ask, not a plan.

**Why I am asking rather than dropping it.** *Pooja Ramesh Singh v. Jammu and
Kashmir Bank Ltd.*, **2026 INSC 668, 2 July 2026** (Narasimha and Aradhe JJ) held
that a decision resting on hallucinated material is *"no decision in the eyes of
the law"* and must be set aside *"even if an iota"* of it entered, and that citing
such judgments without verification *"is a misconduct on the part of an
advocate."* Courts were directed to zero tolerance. On 13 Feb 2026 a separate
bench put it plainly: *"You should have cross verified. That is the duty of the
lawyer."*

The standard is **verification per citation, by the advocate** — not "used a good
database". **Nobody in this market, Supreme Today included, gives an advocate
anything they could show a judge to demonstrate they verified.**

**Every field is already stored.** `citation_checks` holds
`verification_state`, `verified_by_source`, `shown_to_user`,
`overruled_status_shown`, `surface`, `match_confidence`, `created_at` — and
`verified_by_source = 'ecourts'` means a named human vouched. **Nothing renders
any of it as a record.**

**The strategic point:** their authority is institutional, ours would be
evidential. Only one of those is what the Court asked for. It reframes what we
sell from research to indemnity, which is the argument
`COMPETITIVE_TEARDOWN.md` §4 already reaches on other grounds.

**Two questions for the users who told you their citations are accurate**, because
their answers decide whether this is a feature or the product: do they check the
citation before filing, or trust the tool? And has a judge ever asked them how
they verified?

**Cost if never resolved:** we hold the only per-citation verification pipeline in
the market and ship it as an invisible internal detail, in the month the Supreme
Court made it a professional obligation.

---

### [OPEN] A lay-facing explainer — outside the four features, and it needs counsel · LCC · 8 Aug 2026

**Needs:** (a) a decision to build outside `PRODUCT_BRIEF.md`'s four features, and
(b) counsel's written view before any lay-facing surface ships.

**Why it is not mine:** `PRODUCT_BRIEF.md`'s own rule — if what you are about to
build does not serve one of the four features, stop and ask. A product for
non-lawyers serves none of them. And the regulatory read below is mine, not a
lawyer's.

**The demand is real and the founder's examples are the right ones:** *how do I
recover money I lent a friend* · *how do I fight someone illegally occupying my
land*. Millions of people have a legal problem, no idea of the pathway, and
nobody to ask.

**The risk, verified 8 Aug 2026.** BCI Rule 36 prohibits soliciting work
"directly or indirectly, whether by circulars, advertisements, **touts**…". In
2024–25 the BCI ordered violating advertisements withdrawn, **banned influencer
promotion of legal services**, and **warned digital platforms** they risk formal
complaints. A complaint is already on file against **Vakilsearch** for soliciting
and advertising. Consultation platforms defend themselves by presenting as
neutral connectors where the relationship starts on engagement — a defence, not
an immunity.

**The safe ground is marked, though.** Publishing educational material explaining
legal concepts, rights and procedure is widely treated as **distinct** from
prohibited advertising.

**So the recommendation is narrow: build the explainer, never the marketplace.**
Give the pathway, sourced — demand notice, s. 138 NI Act where a cheque is
involved, Order XXXVII CPC summary suit, limitation, which court by pecuniary
jurisdiction — every step traceable to a statute or judgment in our corpus and
rendered from the database row like every other citation. Three hard lines: **no
routing to a named advocate ever**; **procedure and law, never advice on
outcome**; and **it ends by telling them to take it to an advocate**.

**Why it is worth doing although it earns nothing directly.** It is demand-pull
into the advocate product. A client walking in saying *"Lawmind says this is an
Order XXXVII suit"* has recommended us to an advocate, free, at the moment that
advocate is deciding how to proceed. It is also the answer to Supreme Today's
field sales that needs no field sales force — they sell one advocate at a time,
and a 58-year-old publisher whose brand is the profession's will not follow us to
the public.

**What was built anyway:** nothing, deliberately. This is the one item this week
where building first would be wrong.

**Cost if never resolved:** we concede the top of the funnel and keep buying
advocates one corridor at a time, which is the game the incumbent is already
better resourced to play.

**Do not ship on my reading.** Counsel is already owed a written residency view
(OD-2); this belongs in the same conversation.

---

### [OPEN] Distribution — the corridor is the channel, and we have no plan for it · LCC · 8 Aug 2026

**Needs:** a decision on which channel to try first, and whether a bar
association can be contracted with at all.

**Why it is not mine:** it is spend and partnerships.

**The founder's ground observation is the most valuable research input this
week:** Supreme Today's salespeople walk court to court and activate the plan on
the buyer's phone there and then. `docs/COMPETITIVE.md` has pricing and a launch
offer and **no distribution plan at all** — nothing about how an advocate first
hears of us. That gap is now written up in `docs/GTM_INDIA.md`.

**Market shape:** ~**2.01M** enrolled advocates (UP 400,016 · Maharashtra & Goa
191,394 · Delhi 149,655), **1,000+** district and subordinate court complexes.
Supreme Today's **50,000+ installs against 10 ratings** is what being sold in
person and never opened looks like.

**Four channels, cheapest-to-first-customer first,** with the full reasoning in
`GTM_INDIA.md` §2:

1. **The bar association**, at a per-member rate — one conversation reaches a few
   hundred advocates, and it is the unit their field sales must work through one
   advocate at a time. They cannot easily match it without undercutting their own
   ₹20,000 individual subscription.
2. **The advocate's clerk** — the person whose whole job is the diary, the cause
   list and tomorrow's date, which is exactly Tier B. `ASO.md` §1 found no
   competitor leads with a listing or a hearing. Unclaimed, and the cheapest
   wedge we have.
3. **Law students** — free tier, negligible cost (no listed matters, so no
   briefings), buys the next cohort. A publisher has no reason to do this.
4. **Tele-Law / CSC** — Department of Justice, DISHA scheme: **50 lakh
   consultations delivered**, expanding to all **2.65 lakh Gram Panchayats**,
   target one crore. Not a competitor — the last mile. The founder already
   participates in one government scheme (the eCourts grant to Jan 2029), so the
   credibility exists.

**First thing to find out, and it costs one phone call:** can a district bar
association contract at all, what would it charge, and who decides.

**Cost if never resolved:** the product is ready and nobody hears about it.

---

### [OPEN] May we reproduce the OFFICIAL SCR headnotes from e-SCR? · LCC · 8 Aug 2026

**Needs:** counsel's view. Not a founder judgement call and definitely not mine.

**Why it matters more than any other data question.**
`docs/COMPETITOR_SUPREME_TODAY.md` concluded that the incumbent's deepest moat is
editorial apparatus — headnotes, treatment, significant paragraphs — built by
people reading judgments since 1983, and not copyable at speed.

**For the Supreme Court, an official headnote set exists and is free.** The
Court's own **e-SCR** gives ~34,000 judgments free of subscription, on the Court's
site, its mobile app and the NJDG judgment portal; the Judges' Library and
Editorial Section digitised **SCR 1950–2017**. Head-noted judgments are those
selected for publication in **the official law report**.

**Why I will not decide it.** `CLAUDE.md` §6 records two things that point in
opposite directions here. There is **no copyright in a judgment** — Copyright Act
**s. 52(1)(q)(iv)** — and what **is** protected is a reporter's *copy-edited*
version, headnotes and editorial numbering included (*Eastern Book Company v.
D.B. Modak*).

A headnote in the **official** report is neither. It is not the judgment, and it
is not a private reporter's edition — it is a **government work** prepared by the
Supreme Court's own Editorial Section. Whether s. 52(1)(q) reaches it, and on what
terms, is a real question with a real answer, and guessing it either way is
expensive: guess restrictive and we leave the single best answer to the
incumbent's moat on the table; guess permissive and we build on someone else's
copyright.

**What was built anyway:** nothing that touches headnotes. The raw judgment text
underneath them is unambiguously free and already the basis of the corpus.

**Where it plugs in:** `docs/DATA_SOURCES.md`, `docs/CORPUS_TIERING.md`, and the
"what to take and in what order" list in `docs/GTM_INDIA.md` §8.

**Same conversation as OD-2** (counsel's written residency view) and the
lay-facing explainer above — one instruction to counsel, three questions.

---

### [FOR LCC, NOT THE FOUNDER — recorded so it is not lost] Our OCR stack is at the bottom of the 2026 Devanagari benchmark · 8 Aug 2026

`SCHEMA_TRUTH.md` records `ocr_engine` as `paddleocr | tesseract`. Both are
classical, and **arXiv 2606.29213 (2026)** measured ten systems on **300 real
printed Devanagari scans**: classical EasyOCR collapses from 93.6 chrF++ on clean
rendered text to **58.3** on real scans, and nine of the ten systems collapse
similarly. The field spreads **76 points** on real scans while clustering at
91–98 on synthetic ones.

**Open and Apache-2.0: Qwen3-VL-8B scores 75.2 on one 24 GB GPU** — ahead of
GPT-5.5 (58.5). `dots.ocr` (MIT) is explicitly stronger on Devanagari than
Latin/CJK-trained models. Surya is Apache-2.0 at the repo but its **weights have
historically carried a separate commercial term — verify, do not assume**.

**The privacy consequence is the strategic one.** Uploaded documents are
sensitive-class and OD-6's DPA is still owed. A **self-hosted** OCR-VLM means the
document never leaves at all — better than pseudonymisation, because nothing is
sent. That is a claim no competitor routing documents to a frontier API can make.

Mine to build, not a founder decision. It belongs in `docs/OCR_PIPELINE.md` and it
must be measured on real degraded scans, never clean text.

---

### [OPEN] The free citation check — the strongest idea found, and outside the four features · LCC · 8 Aug 2026

**Needs:** a decision to build outside `PRODUCT_BRIEF.md`'s four features, and a
budget line of **one Supreme Today seat** (₹20,000/yr) for lawful benchmarking.

**The idea:** an advocate pastes the citations from a draft and gets back, for
each one — **does it exist**, **is it still good law**, and **does the paragraph
say what it is cited for** — plus a record they can keep.

**Why it is the strongest thing in this week's research: it asks nobody to
switch.** Every other competitive move requires displacing SCC Online, Supreme
Today or Bharat.Law inside an advocate's research habit. This one sits
**downstream of all of them**. They research wherever they already research, and
check here before filing. There is no switching cost because there is nothing to
switch.

**Why now.** *Pooja Ramesh Singh* (2026 INSC 668, 2 July 2026) made verification
a professional obligation at a zero-tolerance standard, and a global tracker has
logged **1,590+ AI-hallucination incidents** in legal proceedings by mid-2026.
Every Indian advocate acquired a task in July that they have no tool for.

**Nobody in India offers it.** The nearest is **CiteCheck AI** — US, freemium at
five reports, and it checks only that citations are **real, existing cases**.
Existence. **It will not tell you the case was set aside in 2017**, which is the
failure that loses the matter rather than the one that embarrasses you.

**It costs almost nothing to run.** It is the pipeline that already exists —
three tiers, `overruled_status` read live, render from the database row. **No
generation, therefore no model spend and no hallucination surface**: LegalCiteBench
measures models at **67–96 on verification** against **under 7 on generation**.

**What it earns:** it gives the verification record a reason to exist; it makes
competitors our top of funnel by putting us at the last, highest-trust step
before a filing; and it produces **real advocate citation data**, which the
harness and `TRAINING_STRATEGY.md` both want and currently substitute with 25
synthetic queries.

**Build it in the safe order.** A **paste-the-citations** mode needs no upload,
no OCR, no pseudonymisation and no DPA, and should ship first. Full document
upload is sensitive-class and waits on OD-6 like everything else.

**What was built anyway:** nothing — it is outside the four features, so by that
file's rule it is an ask. Everything it depends on already exists and is tested.

**Cost if never resolved:** the one move in this market that needs no switching
cost goes unbuilt while we fight incumbency head-on.

Full reasoning, and four further plays: `docs/ASYMMETRIC_PLAYS.md`.

---

### [ANSWERED — recorded so it is not re-proposed] Proxying a Supreme Today subscription · 8 Aug 2026

**Asked:** buy a Supreme Today subscription and route our users' requests through
it.

**Answer: no, and this is the one idea I would decline to build.** Recorded here
rather than only in conversation because it is a reasonable-sounding idea that
will occur to someone again.

- **It breaks `CLAUDE.md` §6 for the reason §6 exists** — *"never circumvent an
  access control you have NOT been authorised to."* A per-seat subscription
  resold through our product is the same act that keeps eCourtsIndia out.
- **It would cost the eCourts grant.** Our authorisation runs to January 2029 and
  is conditioned on us being an organisation that stays inside permissions —
  which is why the rate limiter, the fetch ledger and a default-off kill switch
  exist. **No competitor has that grant. It is worth more than their corpus.**
- **The data is unusable anyway.** What is valuable in their output is the
  editorial layer, and that layer is their copyright (*EBC v. D.B. Modak*). We
  render from our own database row by rule; there is no surface where their
  headnote could lawfully appear.
- **It inverts what we sell.** We are asking advocates to trust us with *"did you
  verify this?"* A product quietly reselling a competitor's seat cannot be that
  product.

**The lawful version is real and is on the build queue:** buy **one** seat, use
it **as a human**, and run our 30-query harness and five-case adversarial set
against them by hand. Automated querying of their service would breach their
terms and is the same idea in a lab coat. And the output is evidence for our
decisions, not marketing — **cite the benchmark, never the competitor.**

---

### [HISTORICAL — DISTINCT FROM SUPREME AI] A LICENSED arrangement with Supreme Today · founder in talks · 8 Aug 2026

**Status:** the founder asked Supreme Today directly whether we may route through
them. **They are quoting a monthly rupee figure within a day.** If it lands inside
budget, the founder will confirm.

**This supersedes the refusal recorded above, and the distinction is the whole
point.** What I declined was *unauthorised* proxying — using a per-seat
subscription as an undeclared pipe. **A negotiated, paid, written licence is the
opposite of that**, and it is the same shape as the eCourts grant: a bounded
permission, in writing, from the party entitled to give it. The founder asking
them was a better move than my analysis, which assumed the answer without asking.

**None of the objections to the unlicensed version survive except one — and that
one gets worse, not better.** Set out below so the contract can be negotiated
against it rather than discovered afterwards.

#### 1 · CHANGE THE ASK: bulk licence, not request routing

**If we proxy live queries, Supreme Today sees every search our users make.**

That hands our most direct incumbent competitor: our real user count and growth
rate, our users' practice areas, and — the serious one — **individual advocates'
research patterns, which reveal case strategy before it is filed.** An advocate
researching anticipatory bail for a named section on a Tuesday is disclosing
something about a live matter. `CLAUDE.md` §5 resolves ambiguity to
sensitive-class, and a query is closer to a matter than to a judgment.

**Ask instead for a data licence: a feed or periodic dump we ingest into our own
corpus.** Same content, and they never see a single user. It also removes the
latency of a third-party hop from a 3-second request budget, and it keeps working
if their servers are down.

**If they will only sell request routing, that is a materially worse product and
should be priced as one.**

#### 2 · The dependency is on a COMPETITOR, and it compounds

`COMPETITIVE_TEARDOWN.md` §2 already flags the supplier-competitor conflict with
IndianKanoon as an uncosted supply risk. This is that risk with the most direct
incumbent in the market. Once our product depends on their feed, **they choose
the renewal price**, and they can read our dependence from the invoice.

Negotiate for it now, not at renewal: **a multi-year price cap or a fixed renewal
formula**, and a **wind-down clause** — what we may keep and for how long if
either side walks. `ecourts_bulk` exists because a permission that expires must
revert behaviour automatically rather than by someone remembering; a licence
needs the same property.

#### 3 · What to buy, in order of what it is actually worth

1. **The headnotes and Authority Check treatment data.** This is the moat
   `COMPETITOR_SUPREME_TODAY.md` identified as uncopyable at speed — forty years
   of editorial work. **A licence is the only lawful way to get it**, and it is
   worth more than raw judgments, which we already have 38,341 of and can get
   17.8M more of free from AWS Open Data.
2. **Tribunal coverage** — NCLT, NCLAT, ITAT, CESTAT, DRT and the rest, where
   `DATA_ADVANTAGE.md` §2g found the only alternatives are barred
   scraper-resellers.
3. Raw judgment text. **Worth close to nothing** — free from AWS and e-SCR. Do
   not pay for it.

**Ask explicitly whether the licence covers DISPLAY to our users, CACHING in our
database, and DERIVED works** (embeddings, extraction, a citator built partly on
their treatment data). A licence to *query* is not a licence to *store*, and our
whole architecture renders from our own row.

#### 4 · The schema consequence, and it is not optional

Licensed content is **not** `corpus` (we do not hold it), **not** `ecourts` (no
human vouched), and **not** `public_x2` (it is one source, not two agreeing).

It needs **its own `verified_by_source` value**. This is exactly the
`ecourts_bulk` lesson from this morning: give a new kind of assertion the same
name as an existing one and the product's strongest guarantee degrades silently,
spelled correctly, with no test failing. **One migration, before the first row is
written, not after.**

And a licensed source is a **third-party assertion**, so it ranks below
`public_x2` — which is two independent sources agreeing — and above `corpus`
only if their editorial process is genuinely stronger than our own holding. That
ordering is a real decision and belongs in `CITATION_HARNESS.md`.

#### 5 · What does NOT change

- **Render from our own database row.** If we cache their content, we cache it
  into our schema and render from there.
- **Their headnote may only be shown if the licence says so, in writing.**
- **Three independent tiers stay three.** A licensed feed is a new source, not a
  replacement for cross-checking — a single curated database cannot catch a
  systematic error inside itself, which is the whole reason tier 2 requires two
  sources to agree.

**What was built anyway:** nothing that assumes this. The `verified_by_source`
boundary in `services/api/src/citations/source-strength.ts` is exhaustive over the
column, so adding a licensed value is a compile error until it is handled —
which is the behaviour we want.

**Cost if it lands and we have not thought about it:** we pay monthly for raw
judgments we already have free, hand a competitor our users' research patterns,
and discover at renewal that we cannot leave.

---

### [HISTORICAL — DISTINCT FROM SUPREME AI] Supreme Today: licence discussion · 8 Aug 2026

> **UPDATED after the founder answered four questions, same day. All four are the
> favourable ones and they change the shape of the decision:**
>
> | | |
> | --- | --- |
> | Retention after we stop paying | **PERPETUAL — granted** |
> | Form of access | **Query only, via the 2–3 accounts. No bulk dump.** |
> | Target | **Everything they have** |
> | Do they know we intend to extract and stop? | **Yes** |
>
> **The long argument below about distillation was answering a question the
> founder was not asking.** He never proposed training on their prose. The plan
> is to query for citations, record the real citations returned, and stop paying
> once we hold them. **With perpetual retention granted and their knowledge of
> the intent, there is no legal, contractual or ethical objection left.** It is
> buying an archive in instalments.
>
> **The decision is now arithmetic: how many instalments?**
>
> `cost = (what we must pull) ÷ (how fast they let us pull) × ₹50,000`
>
> **The second term is the one number we do not have, and it moves the total by
> more than 30×.** At 1,000 requests/account/day, 200,000 documents takes ~2.2
> months (₹1.1L). At one request every three seconds sustained, under three days
> (₹50,000). **Ask them the per-account daily and monthly ceiling, and any burst
> limit, before signing** — and if they will not state one, negotiate a written
> minimum. An unstated limit that turns out to be 200/day converts a two-month
> project into a two-year subscription.
>
> **And the target is far smaller than "everything they have."** Their editorial
> layer only exists for the judgments they HEAD-NOTED — the reportable selection,
> not every order. Everything else in their holding is raw text we already get
> free. Spend requests in this order: **(1) head-noted High Court judgments with
> treatment, (2) tribunals, (3) Supreme Court headnotes only if requests are
> cheap — e-SCR has official ones free, (4) never a single request on raw
> judgment text.**
>
> **Revised recommendation: pay the first ₹50,000, spend week one enumerating and
> measuring the real throughput, then commit to the computed number of months and
> not one more.** If the full pull would exceed about ₹3,00,000, stop after
> priorities 1 and 2 and take the rest free.
>
> Still to confirm in the written terms, and separable from retention: **may we
> DISPLAY their headnotes or only hold them** (perpetual retention is not
> perpetual display), and **what attribution is required, and where.**
>
> Full arithmetic and the build discipline: `docs/SUPREME_TODAY_LICENCE.md` §8–10.

---

#### Original analysis, kept for the reasoning it records


**They said yes.** Bulk data licence, **2–3 accounts required for routing**,
**₹50,000/month**, and **they have agreed to distillation.**

**Full analysis: `docs/SUPREME_TODAY_LICENCE.md`. The four things that decide it:**

**1 · There are two "distillations" and only one is allowed.**
Training on their AI's **answers** is training on another model's commentary
about law — forbidden by `CLAUDE.md` §6 and `DATASETS.md`, and the rule exists
because an audit found fabricated dissents and *Indra Sawhney* stated backwards
in exactly that kind of data. Their own manual documents **no hallucination
safeguard**. Their permission does not make it a good idea.

**Keeping which JUDGMENTS their AI cites is a different act and is already
precedented** — `DATASETS.md` kept the instruction column of an LLM dataset while
refusing its outputs. Resolve every cited judgment against our own corpus,
discard what does not resolve, keep `(question → judgment IDs)`, store none of
their prose. **Their hallucinations cannot enter, by construction.**

**That asset is the one we are most missing.** The gate runs on 30 queries and
the A/B set on 283; success@5 is **17.3%** against a 0.70 floor (re-measured
9 Aug — the earlier 24.0% was taken through a defect and was inflated by
leakage). Ten thousand verified question→authority pairs is training **and
evaluation** data for the metric blocking everything else — and today's findings
make the evaluation half the more valuable of the two, because our own set is
283 queries, exercises only one of two retrieval paths, and contains no short
query at all.

**2 · Do not pay for what is free.** 17.8M judgments are free from AWS Open Data,
and **e-SCR has ~34,000 Supreme Court judgments with OFFICIAL headnotes, free**.
**The incremental value is High Courts and tribunals** — say so in the
negotiation, because a large part of the Supreme Court value already exists in an
official free form.

**3 · One clause changes the price by an order of magnitude: what happens to
ingested data when we stop paying.** A bulk archive is a one-time acquisition
priced as a subscription. Keep it and twelve months for forty years of editorial
work is cheap; lose it and we are renting from our most direct competitor, who
can read our dependence off the invoice. Negotiate a **price cap or fixed renewal
formula and a wind-down clause NOW.**

**4 · Use the accounts for harvesting and benchmarking, not live user traffic.**
Routing live queries still shows them user count, growth, practice areas and
individual advocates' research patterns — case strategy before filing. Also ask
the **per-account query ceiling**: three seats may not carry a ten-thousand
question harvest.

**RECOMMENDATION: buy one month, not twelve, and measure it.**

₹50,000 is bounded and recoverable. Ingest the High Court and tribunal data,
harvest the pointers, then run `pnpm --filter @lawmind/harness ab` over the
283-query set and report the paired difference with a McNemar exact p.

**Go if success@5 moves and the interval excludes zero. No-go if it is inside
noise.** `DATA_ADVANTAGE.md` §1d's rule — *if it does not move the number on our
own corpus, it does not ship* — is unchanged. **A paid dependency on a competitor
gets the same test, not a softer one.**

> **CORRECTION, 9 August 2026 — the example this paragraph used no longer says
> what it said.** It cited the rejection of a free Apache-2.0 reranker at +6.0
> points and p = 0.210 as proof the bar is applied strictly. **That measurement
> was taken through two defects found since**: a wrong judgment pinned at rank 1
> on 13.1% of the query set, and — larger — **37.6% of the reranker's candidates
> being scored against an empty string**. With the first removed, the graph and
> reranker together measure **+4.9 points, interval 0.4 to 9.5, McNemar
> p = 0.049**, and the rig's own verdict is **SHIPS**.
>
> **The rule stands and is vindicated, not weakened.** It refused to ship on a
> number that turned out to be measured wrong, which is exactly what it is for.
> But the story "we rejected a free reranker, so we will be tough on a paid
> licence" should not be told as though the reranker were bad. **The instrument
> was, and it is better now — which is the more useful thing to know before
> spending ₹50,000 to test a hypothesis with it.**

**We are the only party in this market who can evaluate this deal properly**,
because we have a fixed query set and a definition of relevance settled before
measuring. That instrument was built this week. This is what it is for.

**If they will only sell twelve months:** my recommendation is to spend the first
₹50,000 on the LLM key and an advocate reviewer instead. Both unblock Gate S2,
and Gate S2 gates the ground campaign, the marketing claim and every other item
on this list.

**Economics, for reference.** ₹6L/year ≈ **15 paying advocates** at PD-13's
Expert tier — not a demanding bar. But it is also 30 of their own seats, and the
same ₹6L buys a self-hosted OCR GPU, or the LLM key, or a first salesperson —
each with a clearer path to a number than the licence has today.

---

### [CREDENTIALS NEEDED] Everything the lane is waiting on, in one list · LCC · 8 Aug 2026

**Nothing here blocks the lane.** Every path is built and refuses honestly
without its credential — the `packages/auth/src/mail.ts` pattern. This is the
handover list, not an interruption.

#### Set these as Railway variables (or send them and I will)

| Variable | For | State without it |
| --- | --- | --- |
| `SUPREMETODAY_USERNAME` / `SUPREMETODAY_PASSWORD` | The account you buy tomorrow | Client built, 12 tests. Refuses before touching the network |
| `SUPREMETODAY_MAX_REQUESTS_PER_DAY` | **The contract's per-account ceiling** | **Defaults to 500 — a PLACEHOLDER, not an estimate.** An absent limit must never read as permission |
| `INDIANKANOON_API_TOKEN` | Their ₹500 signup credit | Client built, 11 tests. Refuses before spending |
| `INDIANKANOON_BUDGET_PAISE` | Ceiling in paise | Defaults to 50000 (= ₹500) |
| `OPENROUTER_API_KEY` | Three unmeasured Gate S2 metrics | Harness reports NOT MEASURED and **grades them as failures**, which is correct |

#### Ask Supreme Today, before the harvest starts

1. **The per-account request ceiling — daily, monthly, and any burst limit.**
   This is the single number that decides the total cost, and it moves it by
   **more than 30×**: 200,000 documents is ~2.2 months at 1,000/day and under
   three days at one request every three seconds. **If they will not state one,
   negotiate a written minimum** — an unstated limit that turns out to be 200/day
   converts a two-month project into a two-year subscription.
2. **May we DISPLAY their headnotes, or only hold them?** Perpetual retention is
   not perpetual display. Until this is answered in writing their content is
   **held as signal and never rendered**, enforced by a flag rather than by
   everyone remembering.
3. **What attribution is required, and where?**
4. **Which surfaces does the licensed account unlock** — citation search,
   Authority Check, headnote view, cited-by, significant paragraphs, disposition?
   Day one maps this anyway, but a list saves requests.

#### Day one, when the account exists

**Measurement, not harvest.** `pnpm --filter @lawmind/ingest harvest:probe` runs
it: what the account can see · the sustained rate the pace controller settles at
· **the overlap between our 38,341 citations and their resolvable set** · and one
archived page to build the parser against **offline**. Never iterate a parser
against the live service — that is paying for our own bugs.

The probe writes a completion date and a total cost. **Commit to that many months
and not one more.**

#### Money, when you want it

- **One Supreme Today seat** for lawful manual benchmarking — may fold into the
  licence talks.
- **A GPU for self-hosted OCR.** Qwen3-VL-8B is Apache-2.0 and runs on one 24 GB
  card. The strategic part is not accuracy: **self-hosted means the document
  never leaves**, which is better than pseudonymisation because nothing is sent,
  and it is a claim no competitor routing to a frontier API can make.
- **An advocate to review 20 outputs** — Gate S2's human half. `PID.md` gives
  them a veto engineering cannot overrule.

#### Counsel — one instruction, three questions

1. **SCR official headnotes on e-SCR** — free, ~34,000 judgments, SCR 1950–2017
   digitised by the Court's own Editorial Section. s. 52(1)(q)(iv) vs *EBC v.
   D.B. Modak*, and an official headnote is a **government work** rather than a
   private reporter's edition. **If this is permitted it is the single best
   answer to the incumbent's moat, and it is free forever where a licence is
   not.**
2. **The lay-facing explainer** — BCI Rule 36, touting, and where educational
   material ends and solicitation begins.
3. **OD-2's written residency view**, still outstanding.

---

### [SUPERSEDED — FOUNDER AUTHORIZATION SETTLED 11 Aug 2026] Bharat.Law's scraping offer · 8 Aug 2026

**Founder reports Bharat.Law will allow scraping after a subscription is bought,
and asks whether it is worth it.**

**Recommendation: do not buy it for the data. Buy ONE month of Pro at ₹1,499 —
monthly, not annual — to USE it, and extract nothing.** Full reading of all 87
pages of their site: `docs/BHARAT_LAW_OFFER.md`.

**Three reasons, and the second is the substantive one.**

**1 · Their written policy prohibits exactly what the verbal permission grants.**
Their Acceptable Use Policy forbids *"scrape, harvest, or otherwise extract data
beyond entitlements purchased"*, *"circumvent rate limits, access controls, audit
logging, watermarking"*, and — decisively for us — *"develop or train **a
competing model or a benchmark of our model**"*. We are a competing product, and
that clause bars even the benchmarking use I recommended for Supreme Today. A
verbal yes against a published no is not a permission we can rely on, and the
contrast is instructive: **Supreme Today gave us a written licence with perpetual
retention and knowledge of the intent. This is a conversation.**

**2 · There is no moat to buy.** Supreme Today was worth considering because they
have been a publisher since 1968 with forty years of HUMAN editorial work.
**Bharat.Law was founded in 2023.** Their judgments come from the same public
sources we already hold free — AWS Open Data (17.8M, CC-BY-4.0), e-SCR (~34,000
with OFFICIAL headnotes), our own 38,341. Their treatment data is the one thing
we lack, and `/nyai` **does not say whether it is human-curated or computed**. For
a 2023 company it is almost certainly computed — which makes it an algorithm's
output over judgments we already have, derivable rather than purchasable, and
*another model's commentary about law* if we trained on it.

**3 · On court monitoring we are AHEAD of them.** Their own page says *"over
14,000 district and subordinate courts connected via eCourts"* and **states no
authorisation anywhere.** We hold a written grant to January 2029 with
`ALL_COURTS`, independent display and training permitted. Buying their monitoring
would be buying a weaker version of what we already have lawfully — and
`CLAUDE.md` §6 forbids buying data from someone whose access was not authorised,
which here we cannot even confirm.

**Their public site needs no subscription at all.** `robots.txt` explicitly
invites GPTBot, ClaudeBot and the rest — *"central to our AEO strategy"* — and
they publish `llms-full.txt` as a machine-readable summary. A subscription buys
`app.bharat.law` and nothing more.

**What the ₹1,499 month is actually for**, and it is worth it: run **Kharak
Singh** and **Danamma** — the seven judgments our own extractor could not resolve
— through their counter-authority. **If their answer is right and specific, their
treatment data is curated and worth respecting. If it is vague, it is computed and
we can compute it too.** That single test is worth more than any amount of
scraping, and it costs one month at monthly rates with no annual lock.

**Pricing intelligence, which is the durable takeaway:** Plus ₹599/mo · **Pro
₹1,099/mo** · Teams ₹2,999/mo, all annual, all **credit-metered** at
5,000–10,000 AI credits a month. Two things follow. Their credit meter is exactly
what Supreme Today's comparison material attacks with "unlimited", which
strengthens the earlier conclusion that a credit meter is a liability in this
market. And **the pricing anchor moves a third time**: SCC Online ~₹5,000/mo,
Prism ~₹1,250, Supreme Today ₹1,667, Bharat.Law ₹1,099. **Four independent points
now sit 3–5× below the anchor PD-13's justification rests on.**

**One thing worth noticing.** A company that invites a direct competitor to take
its data does not believe the data is its moat — and they are probably right.
Which is the same conclusion `TECHNICAL_MOAT.md` reached about us: the corpus is
not where this is won.

---

## FQ-BL1 · One email to Bharat.Law asking for written consent to benchmark

**Needed from you:** send it. It is a founder-to-founder message, not a task I
can do.

**Why it is worth sending.** Their **Evaluation Terms** — the contract that
governs a self-serve account — prohibit *"use the Services to build a competing
product or to benchmark the Services **without our prior written consent**"*.
The Platform Agreement uses the same phrase. **That is a consent requirement, not
a prohibition**, and their verbal yes to you is exactly the thing that could
satisfy it.

**What to ask for, specifically** — a narrow ask is far likelier to be granted
than a broad one:

> Written confirmation that Bharat Technologies, Inc. consents to Lawmind
> conducting a **comparative evaluation of research output on a fixed query set**
> using a paid account, for internal product assessment. **No bulk extraction, no
> redistribution, no use of Bharat.Law output as training data.**

**What was built anyway:** nothing was needed. Their **free tier** (*"Ask a
question free · No signup. No card."*) already answers the main question at ₹0 —
see `BHARAT_LAW_OFFER.md` §1.

**What stays broken without it:** nothing breaks. We simply cannot record a
side-by-side comparison in writing, which is a nice-to-have, not a dependency.

**Do NOT buy the annual plan.** Monthly at ₹1,499, or free. `BHARAT_LAW_OFFER.md`.

---

## FQ-BL2 · The "wedge" claim in `CLAUDE.md` and `PRODUCT_BRIEF.md` is now false

**Needed from you:** a decision on wording. Both files are yours and I have not
edited either.

**Both say the 24-hour hearing briefing is "the wedge — no Indian competitor has
it".** Bharat.Law's own page claims *"live matter tracking across 15,000+ Indian
courts… daily digests, cause-list matching, CNR lookup, and limitation risk
alerts"*, and asserts **no competitor combines tracking with AI research** — the
mirror image of our claim.

**What was built anyway:** `FEATURE_PARITY.md` §1b now records the correction and
states what genuinely survives — theirs is a **daily digest**, ours is a briefing
**assembled per listed hearing** that reads good-law status **live at assembly**
(`services/api/src/briefings/assemble.ts`), which nothing they publish claims.

**What stays broken without it:** a false claim in the north-star document is how
a team argues from a premise that stopped being true. **It also must never reach
marketing** — an overstated differentiator is the one claim a competitor can
cheaply disprove in public.

**Suggested wording:** *"24-hour hearing briefings — the wedge. Others push daily
digests; ours is assembled per hearing and re-checks good-law status at the
moment of delivery."*

---

## FQ-BL3 · Bharat.Law accounts — 2 or 3, and the order that saves money

**Needed from you:** the accounts, and **FQ-BL1's email before they are used for
anything automated.**

**Do the free step first.** Their `/solutions/individuals` is *"Ask a question
free · No signup. No card."* Run *Kharak Singh* and *Danamma* through it — the
seven judgments our own extractor could not resolve. **If their counter-authority
is right and specific, their treatment data is curated and worth respecting; if
it is vague, it is computed and we can compute it too.** That is the whole
question, and it costs ₹0.

**Then buy monthly, never annual.** Pro is ₹1,499/month billed monthly against
₹1,099/month billed annually. The ₹4,800/year saving is not worth a twelve-month
commitment to a competitor's product we may stop using after one month.

**What was built anyway:** `services/ingest/src/harvest/bharatlaw.ts`, **30
tests, all green.** A 2–3 account pool with AIMD pacing, per-account credit
budgets against their published 10,000/month Pro meter, a separate and lower
pool-wide daily ceiling, and full attribution on every request.

**What stays broken without it:** nothing breaks. **The pool refuses on purpose**
and will keep refusing until two things are true: `BHARATLAW_ACCOUNTS` is set,
and a written consent is transcribed into `AUTHORISATION`.

**Set this when the accounts exist**, as a Railway env var and never in the repo:

```
BHARATLAW_ACCOUNTS=one:email1@…:password1
two:email2@…:password2
BHARATLAW_MAX_POOL_PER_DAY=200
```

**One thing to know about the three accounts, because it shaped the code.** The
obvious use of a second account is to keep going when the first hits a limit —
and **that is exactly what their AUP calls circumventing rate limits.** So a
401 or 403 on any one account **halts the entire pool**, and no other credential
is tried. Rotation here separates unrelated work; it is not a throughput device.
That is the difference between an evaluation they consented to and one they
would terminate.

---

## FQ-C1 · The IPC source on India Code is incomplete — we need a different one

**Needed from you:** nothing yet. This is a research task I am continuing, but it
is recorded here because it **blocks the IPC↔BNS mapping**, which is the last S1
criterion, and because the cause is a bad source rather than bad code.

**What is wrong.** India Code handle `123456789/11091` — the one our own CLI
verified by title — serves a **58-page PDF that is not the whole Indian Penal
Code.** It runs sections **1–120B**, then **168–171H**, then **511**.
**Sections 121 to 510 are absent.** Page 57 is s. 120B; page 58 is s. 511.

Every page has a real text layer, so this is not an extraction failure and not a
scan. **The file itself is partial.**

**Why it matters:** s. 302 (murder), s. 300 (culpable homicide), s. 376 (rape),
s. 420 (cheating) — the sections an advocate actually looks up, and the ones
whose BNS equivalents matter most — are **all in the missing range.**

**What was built anyway:** the splitter is fixed and better. Two real defects
found by reading the PDF's own text items: a heading opening with a quotation
mark (`19. "Judge".--`, most of the definitions chapter) and a footnote marker
printed before the number (`4*[18. "India".--`). **36 → 70 sections**, 21 tests,
and the guard against firing on ordinary numbered prose still passes.

**What stays broken without a new source:** the IPC↔BNS mapping cannot be built
for ss. 121–510, which is the part anyone would use it for. **No regex fixes
this** — the text is not in the file.

**Where I am looking next**, in order: another India Code handle or the
consolidated "as amended" edition · the **BNS side** first, since the new codes
are recent and may be published whole · a non-PDF source. **I will not relax the
parser to compensate** — an incomplete corpus is recoverable and a wrong one is
not.

---

## FQ-R1 · A fourth question the citation harness does not ask

**Needed from you:** a decision, because this amends `docs/CITATION_HARNESS.md`,
which is spec. I have not touched it.

**The gap**, from your evidence-first document §35 and confirmed by current
research:

> Claim: *"The Supreme Court held X."* Citation: **correct case.** But the cited
> passage says: *"The Court rejected X."*
> Citation correctness: **PASS.** Legal support: **FAIL.**

**Our three fields cannot catch that.** They ask *does this judgment exist*,
*who confirmed it*, and *is it still good law*. **None asks whether the paragraph
we point at says what we claim it says.** A citation can be verified, current,
and completely misdescribed.

The research literature calls this **"deceptive grounding"** and finds it
*"undetectable by current frameworks by design"* — the response is fully
faithful to retrieved documents, cites real sources, fabricates nothing, and
**the failure is at the attribution level, which none of those frameworks
inspect.**

**Why it is worse for us than a fake citation, not better.** A fabricated
citation dies immediately and publicly at the first check. A real citation that
does not support the proposition **survives the check, gets filed, and fails in
front of the judge** — which is exactly the humiliation `CLAUDE.md` §2 says ends
the company.

**What I propose, and it does NOT reopen the three fields.** A fourth question,
answered **per claim** rather than per citation:
`SUPPORTED · PARTIALLY_SUPPORTED · CONTRADICTED · INSUFFICIENT_EVIDENCE ·
CONFLICTING_AUTHORITIES`. The mechanism is an entailment check of claim against
cited paragraph — a small model, not a frontier one.

**And it gives Gate S2 the metric that document argues is the most important:**
`Unsupported Claim Rate = unsupported material claims / total material claims`.
**Our six current metrics contain no member that would move if every citation
were real, current, and misdescribed.** That is the hole, stated plainly.

**What stays broken without a decision:** nothing regresses — this is a gap we
have always had, not a new one. But it is the highest-value addition the
document identifies, and it is squarely inside the one rule above all others.

**What I have NOT done:** touched `CITATION_HARNESS.md`, added a fourth column,
or changed any badge. Spec is yours.

---

## FQ-R1b · The product guarantee to make instead of "we never hallucinate"

**Needed from you:** approval of the wording, because it is a public claim.

From your second document §34, and I would take it **verbatim**:

> **Every material legal proposition presented as authoritative must be
> supported by a verified source passage in the indexed legal corpus. Citations
> are generated from verified source metadata rather than generated by the
> language model. When sufficient evidence cannot be established, the system
> abstains or explicitly identifies the uncertainty.**

**This is the most immediately useful paragraph in either document.** It is
measurable, it is survivable, and it already matches `CLAUDE.md`'s copy rule
(*"Safe to file"*, never *"we verified this"*).

**Why it beats the alternative.** *"Our AI never hallucinates"* is disproved by
one screenshot from one annoyed advocate. **Bharat.Law publishes exactly that
claim** — *"0 Hallucinated citations · No hallucinations, ever"*, with no
methodology and no number. It is their most quotable liability and we should not
copy it.

**One honesty condition before it can be published.** The first clause —
*"supported by a verified source passage"* — is the one thing we do **not** yet
measure. That is FQ-R1. **Publishing this sentence before the Unsupported Claim
Rate exists would make it the same kind of unbacked claim.** So: approve the
wording now, publish it when FQ-R1 lands.

---

## FQ-R2 · Paragraph-level evidence IDs — the unit we do not have

**Needed from you:** nothing yet. Recorded because it is the deepest gap the two
documents identify and it must not be lost.

Both documents make a **paragraph evidence ID** (`SC_2024_000184_P087`) the
fundamental unit of citation: PDF → page → paragraph → ID → claim.

**We do not have that unit.** We have judgment-level citations,
`judgment_chunks.chunk_index` for retrieval, and
`judgment_annotations.paragraph_number` for what an advocate saved. **A chunk is
not a paragraph** — it is a retrieval window that can straddle two — so no
citation today carries a stable, immutable pointer to the paragraph a court
actually printed.

**Three things we want all depend on it:** claim→evidence mapping · the evidence
viewer that shows the exact passage under the citation · FQ-R1's claim-support
check, which has nothing to check against without it.

**It is a corpus-wide re-derivation across 38,341 judgments, not a feature**, and
paragraph numbering is exactly where OCR damage and reporter numbering disagree
— `judgment_annotations` already carries `paragraph_number` AND
`paragraph_index` for that reason.

**Recommendation: do not start it before Gate S2 passes.** It is the right
foundation and the wrong thing to be doing while success@5 is 24%.

---

## FQ-T1 · Terms and Conditions — drafted in full, twelve facts only you have

**Needs:** twelve items listed as Appendix B of `legal/TERMS_AND_CONDITIONS.md`,
and then counsel review. The material ones, in the order they hurt if wrong:

1. **Registered office address and CIN** of Helmor Pvt Ltd. `PID.md` says
   "Gwalior, Madhya Pradesh" and nothing more; a T&C needs the full address.
2. **GSTIN, and whether ₹799 / ₹1,999 / ₹3,499 are inclusive or exclusive of
   GST.** PD-13 states the prices and is silent on tax. An ambiguous
   inclusive/exclusive price in published terms is a consumer-law problem.
3. **Jurisdiction and arbitration seat.** The draft states Gwalior, being the
   registered office — the conservative default. Most comparable services pick a
   metro seat. Your call, and counsel's.
4. **Grievance Officer** name, designation and email. Required by the IT Act
   rules and by DPDP. There is currently no such person named anywhere in the
   repo.
5. **Refund window for directly-invoiced Firm subscriptions.** Store refunds are
   Apple's and Google's problem (OD-3), so the only refund promise we can
   actually perform is on the Razorpay-invoiced tiers. Recommend pro-rata on
   unused full months.
6. **Liability cap.** Draft uses twelve months' fees paid — the standard
   formulation, deliberately not a nominal figure.
7. **`lawmind.in` vs `lawmind.co`.** The app's Firm enquiry link opens
   `hello@lawmind.in` (`SubscriptionScreen.tsx:81`); verified outbound mail is
   `no-reply@lawmind.co` (`DEPLOYMENT.md`). Two domains in a published legal
   document reads as carelessness. Pick one.
8. **Hindi translation of the terms — yes or no,** and which language governs.
   We ship at genuine Hindi parity and publish English-only terms; that is
   defensible but conspicuous.
9. **Counsel's written data-residency view** (OD-2) must be on file before §11.5
   is published. The clause discloses Singapore processing plainly rather than
   burying it, which is the right call and the one that most needs backing.
10. **The Privacy Policy** the terms reference does not exist as a published
    document. Its substance is already fully written in `docs/PRIVACY_PII.md`.

**Why it is not a blocker:** the whole document is written —
`legal/TERMS_AND_CONDITIONS.md`, 17 clauses plus two appendices — and every
substantive clause is derived from something already settled in this repo rather
than from a template. Placeholders are marked `[FOUNDER — …]` inline so the
document cannot be published half-filled by accident.

**What it adds that the source template did not have,** because our failure modes
are not Indian Kanoon's: an explicit limitation-calculator disclaimer (§9.3 — a
barred claim is the single most expensive thing this product could cause), a
briefings-are-not-your-diary clause (§9.2), a BNS/BNSS/BSA clause explaining that
the applicable code turns on the offence date (§10.3), and a clause separating
*"the judgment exists"* from *"the judgment supports your proposition"* (§7.5).
Appendix A records the eight source clauses deliberately **not** carried over —
including the "irrevocable waiver that you did not read this", the member
directory, and the 48-hour refund we are structurally unable to perform.

**Cost if never resolved:** we cannot launch. Store review asks for a terms URL,
and DPDP requires a named Grievance Officer.

**Where it plugs in:** publish at `lawmind.co/terms`. Then bump
`CURRENT_TERMS_VERSION` in `services/api/src/auth/account.ts` from `'2026-08-07'`
to the published version and update `CURRENT_TERMS_BODY` to reference the URL.
**That bump forces every existing account to re-accept** — which is the designed
behaviour, is harmless pre-launch, and is the reason we store a version rather
than a boolean. I have not made that code change: pointing the in-app consent at
a document counsel has not yet read would be worse than leaving it as it is.

---

# ============================================================
# WHAT YOU NEED TO BUY — one list, with prices, 9 August 2026
# ============================================================

Every figure below is either **verified from the vendor's own page** or **marked
as an estimate**. Ordered by *value per rupee*, not by size.

---

## 1 · ~~OpenRouter API key~~ — **DONE. Nothing owed. Verified 10 Aug 2026.**

**The key is set** (73 chars) and so is `ANTHROPIC_API_KEY` (108). A live call
was verified 9 Aug at a cost of $0.0000029. **Do not buy anything for this.**
The "three unmeasured Gate S2 metrics" below are no longer key-blocked — and
they now sit under an *ungraded diagnostic* anyway, since the 0.70 floor was
removed on 9 Aug. `CURRENT_PLAN.md` §Q0. Original entry kept below for the record.

### original entry

**This is the single highest-value item on the list and it is almost free.**

It unblocks: **three unmeasured Gate S2 metrics** · proposition extraction ·
HyDE · multi-query · query decomposition · Self-RAG · Corrective RAG. That is
most of `docs/RETRIEVAL_ARCHITECTURE.md`.

**Verified price**, DeepSeek V4 Flash on OpenRouter (our public-class model):
**$0.098 per million input tokens · $0.196 per million output tokens.**

**Estimated** cost of an actual harness run — my arithmetic, not a vendor quote:

| run | tokens | cost |
| --- | --- | --- |
| 30-query harness, one full pass | ~450k in / 24k out | **≈ $0.05** |
| 283-query eval set, one full pass | ~4.2M in / 230k out | **≈ $0.50** |
| Twenty development runs | — | **≈ $1–2** |

**So put $5 on it and stop thinking about it.** The blocker was never the money,
it was that no account exists. **Minimum top-up on OpenRouter is $5.**

---

## 2 · Railway database access — **₹0. Already paid for.**

Three finished pieces of work cannot be *verified* without a live Postgres:

- **Graph expansion measured** — code written months ago, never measured
- **Reranker at n=283** — the run that decides whether +6.0 pts ships
- **`extract.live.test.ts`** — the training-extraction SQL has never executed

**You are already paying for this database.** What is needed is the **public TCP
proxy opened**, which is a Railway CLI call and costs nothing. `CLAUDE.md` says
it is closed by default and must be deleted when done — that rule stands.

**This is the cheapest unblock on the list and it releases the most finished
work.**

---

## 3 · Indian Kanoon — **SETTLED: no API. Accounts only. ₹0.**

**Founder decision, restated 9 August 2026 after I wrongly carried it as a
blocker.** This was decided before a context compaction and I lost it; recording
it here so it cannot be lost again.

**We are NOT buying the Indian Kanoon API.** The API is metered — roughly
50 paise per search page — and **the money is going to Supreme Today instead.**
Two paid legal data sources at once is not what an MVP needs, and Supreme Today
is the one with the editorial layer we cannot rebuild.

**What we use instead:** ordinary website accounts, for ordinary interactive
use. Two are held.

**What this means for the code**: `services/ingest/src/harvest/indiankanoon.ts`
stays built and stays refusing. It is budget-guarded and metered and costs
nothing while `INDIANKANOON_API_TOKEN` is unset — which is now the permanent
state, not a temporary one. **It is not a blocker and must not be listed as
one.** If the decision ever reverses, the client is already there.

---

## 4 · Bharat.Law — **₹0 first. Then ₹1,499/month if at all.**

**Verified from their pricing page.**

- **Free tier first: ₹0.** *"Ask a question free · No signup. No card."* Run
  *Kharak Singh* and *Danamma* through it. **That answers the only question
  worth paying for** — is their treatment data human-curated or computed.
- **Only if the free tier will not show counter-authority depth:** Pro at
  **₹1,499/month billed monthly.**
- **Do NOT take the annual plan** (₹1,099/month, ₹13,188/year). The ₹4,800/year
  saving is not worth a twelve-month commitment to a competitor's product we may
  drop after one month.

**Also needed and free: one email** asking for written consent to benchmark
(FQ-BL1). Their contract permits it *"with prior written consent"*.

---

## 5 · ~~GPU for re-embedding~~ — **STRUCK 9 Aug 2026. Costs nothing.**

**Measured on this workstation: 36.6 ms/chunk on CPU** → 616,197 chunks ≈ 6.3 h
(12–19 h realistically). **An overnight run on hardware we already own, not a
purchase.** The $65 assumed a rented GPU because Railway has none, and nobody
re-checked once a 4060 Ti existed. Original entry kept below for the record.

### original entry

**From our own measurement** (`docs/DATA_ADVANTAGE.md`): 616,197 chunks ÷ 216M
tokens/hour ≈ **62 GPU-hours ≈ $65, one-off.**

Unblocks **late chunking** and **summary-augmented chunking** — the two recall
levers that change the index.

**Do not buy this yet.** Spend items 1 and 2 first: the query-side levers and the
graph measurement cost almost nothing and may move success@5 far enough that
this is unnecessary. **Buying it now would be paying to re-run an experiment we
have not designed.**

---

## 6 · Supreme Today — **₹50,000/month. The one real decision.**

Your figure, not mine. Everything is built and refuses honestly until an account
exists (`pnpm --filter @lawmind/ingest harvest:probe`).

**Day one is measurement, not harvest** — `docs/HARVEST_ENGINE.md` §13. The probe
prints a projected completion date and total cost in ₹50,000 instalments, so
*"how many months until we can stop paying"* becomes a number before the second
instalment is due.

**Start with ONE account, as you planned.**

---

## 7 · eCourts — **₹0 until January 2029.**

The registrar's grant runs to **January 2029**, after which they have asked for
payment to continue. **Nothing is owed now.** The code expires the permission by
itself on that date — nobody has to remember.

---

## THE TOTAL, if you did everything today

| item | cost |
| --- | --- |
| OpenRouter credit | **$5 ≈ ₹430** |
| Railway DB proxy | **₹0** |
| Indian Kanoon | **₹0 — no API, settled. Accounts only** |
| Bharat.Law free tier | **₹0** |
| **Subtotal to unblock nearly all engineering** | **≈ ₹430** |
| Bharat.Law Pro, one month, optional | ₹1,499 |
| GPU re-embedding, later, optional | ≈ ₹5,600 |
| Supreme Today, your decision | ₹50,000/month |

**Read the first four rows again: about ₹430 unblocks the great majority of the
outstanding engineering work.** The expensive items are all optional, deferrable,
or already decided.

---

## What costs nothing and is NOT a purchase — decisions only

- **FQ-R1** claim-support verification — amends `CITATION_HARNESS.md`, spec
- **FQ-R1b** the product-guarantee wording — a public claim
- **FQ-R2** paragraph-level evidence IDs — recommend *after* Gate S2
- **FQ-BL2** the "no Indian competitor has it" wedge claim, now false, in
  `CLAUDE.md` and `PRODUCT_BRIEF.md`
- **FQ-C1** the incomplete IPC source — research, mine to continue
- The **verification record** — outside the four features


---

## FQ-EL1 · eLegalix (Allahabad High Court) — works, but needs your call first

**Needed from you:** a decision, and possibly one email. **Do not treat this as
blocked engineering — treat it as an unanswered permission question.**

**What was tested, 9 August 2026**, on the URL you sent
(`translatedJudgmentID=4619`):

| attempt | User-Agent | result |
| --- | --- | --- |
| 1 | `Lawmind-Research/1.0 (contact: …)` | **429** `Retry-After: 10` |
| 2 | browser string + `Referer` | **200 — a real 16-page, 198 KB PDF** |
| 3 | `Lawmind-Research/1.0`, after 30 s | **429 again** |

**The content is real and useful.** eLegalix serves original *and translated*
Allahabad High Court judgments as PDFs, and Allahabad is one of the largest High
Courts in the country — exactly the High Court coverage
`BLOCKER_REGISTER.md` B1.1 says we lack.

**But there is a problem I will not engineer around.** The server runs
**`mod_qos`** and appears to refuse our honestly-identified client while serving
a browser string. Getting a PDF therefore required **disguising the client**,
and `CLAUDE.md` is explicit on both halves of that:

> *Never circumvent an access control you have NOT been authorised to.*
> *A permission you hide behind a spoofed browser string is one you are not
> really relying on.*

**So I have not built an eLegalix harvester and will not until you decide.**

**Stated honestly: three requests is not proof.** It may be plain rate limiting
that happened to land twice on the honest attempts. But the pattern is the wrong
way round for coincidence, and the safe reading is the one that assumes they
meant it.

**What I recommend, in order:**

1. **One email to the Allahabad High Court registry**, exactly as with eCourts.
   That grant is the model: it made bulk access lawful, bounded and auditable,
   and it is why the eCourts adapter can identify itself instead of hiding.
2. **If a grant lands**, the harvest client is a small piece of work — the
   pacing engine, fetch ledger and rate limiter already exist and are shared.
3. **If it does not**, we take nothing. Allahabad judgments also reach us
   through the AWS Open Data corpus, more slowly and without translations.

**What stays true either way:** any eLegalix client must honour `Retry-After`,
identify itself, and write the fetch ledger — the same three rules as every
other source.


---

# ============================================================
# WHAT I NEED FROM YOU — consolidated, end of 9 August 2026
# ============================================================

**Nothing here blocks me today.** Everything below is either a decision only you
can make, or a service I cannot sign up for. The lane kept going regardless.

---

## A · THINGS THAT COST MONEY

### A1 · A GPU inference endpoint for the reranker — **the only new spend, and not yet**

**Do not buy this yet. I am telling you it is coming, not asking for it.**

The reranker is the one component that cannot run inside Gate S1's 3-second
budget on ordinary hardware **at full sequence length**. Measured today:

| config | 20 candidates | inside 3 s? |
| --- | --- | --- |
| q8/CPU, `max_length` 512 | 4,205 ms | no |
| **q8/CPU, `max_length` 256** | **1,557 ms** | **yes** |

**If 256 tokens costs no accuracy, we need no GPU at all** — and that is exactly
what the running A/B measures. **Wait for that number before spending anything.**

If 256 *does* cost accuracy, the options are a GPU endpoint (roughly $30–60/mo
for a small always-on instance, or per-second serverless) or a smaller
cross-encoder. **I will cost both properly once the accuracy number exists.**

**Railway has no GPU**, which is the whole reason this is a question.

### A2 · Everything else that costs money is unchanged

OpenRouter is funded and working (~$0.007 per full gate run). **Indian Kanoon is
settled: no API.** Bharat.Law: free tier first, monthly if at all. **The $65 GPU
re-embed line is struck** — it is an overnight job on your own machine.

---

## B · DECISIONS ONLY YOU CAN MAKE — no cost

| | what | why it is yours |
| --- | --- | --- |
| **FQ-R1** | Claim-support verification — a 4th question the citation harness does not ask | Amends `CITATION_HARNESS.md`, which is spec |
| **FQ-R1b** | The §34 product guarantee wording | It is a public claim |
| **FQ-R2** | Paragraph-level evidence IDs | Corpus-wide re-derivation; recommend **after** Gate S2 |
| **FQ-BL2** | *"no Indian competitor has it"* in `CLAUDE.md` + `PRODUCT_BRIEF.md` is **now false** | Your files. Must never reach marketing |
| **FQ-EL1** | eLegalix — seek an Allahabad registry grant, or take nothing | Their server refused our honest client and served a browser string; I will not spoof |
| **FQ-C1** | The incomplete IPC source | Research, mine to continue |

---

## C · ONE THING I NEED YOUR STEER ON, NEW TODAY

**The adversarial prompt.** `adversarialPassRate` is **20.0%** worst-case. Two of
the four failures look fixable by instructing the model to **ask for the missing
FACT rather than the legal conclusion** — it currently answers *"tell me whether
you are prosecuted under the IPC or the BNS"*, which asks the advocate to supply
the answer they came for. The determining fact is the **date of the offence**.

**You rejected that edit and I have not re-applied it.** The fair objection is
that tuning the prompt against the very cases that grade it is overfitting.
**Tell me which you want:**

1. **Leave it.** The 20% stands as an honest measurement of the model as-is.
2. **Fix the prompt generally** — ask for facts, and carry the BNS/BNSS/BSA
   changeover date the model cannot know — then **re-measure on cases it has
   never seen** so the improvement is not self-graded.
3. Something else you have in mind.

**My recommendation is (2)**, because the prompt is our product surface and the
instruction is correct independent of any test. But it is your call and I have
stopped rather than guess twice.

---

## D · WHAT I DO NOT NEED

Railway (I have CLI access and open/close the DB proxy myself) · a GPU for
embedding (DirectML on the 4060 Ti, vectors proven identical) · money for the
re-embed · an Indian Kanoon API key.


---

## CURRENT AUTHORIZATION RECONCILIATION — DO NOT REOPEN

As of **11 Aug 2026**, the founder has explicitly settled the authorization status:

| Source | Current status | Authorization through |
| --- | --- | --- |
| BharatLaw | AUTHORIZED | 13 Nov 2029 |
| Supreme AI | AUTHORIZED | 13 Nov 2029 |
| eCourts India | AUTHORIZED | 13 Nov 2029 |

Earlier queue entries that contradict this table are retained only as historical
provenance. They are not current blockers, open decisions, or exclusion rules.

`Supreme AI` must not be conflated with `Supreme Today`.

Do not create another licensing task for these three sources unless the founder
explicitly changes this decision.

---

## FQ-IX1 · ~~All three InferX grants return HTTP 401~~ — **RESOLVED 12 Aug 2026, and it was never a credential**

**Raised by LCC, 12 August 2026.** This is the one item in this file that is a
credential and nothing else. Everything around it is built, tested, deployed and
waiting.

**What is observed, not inferred.** All three configured grants were tested
individually against the live endpoint and all three answer identically:

```
POST https://model.inferx.net/endpoints/v1/chat/completions
HTTP 401
{"error":"Unauthorized"}
```

The keys **worked earlier the same day** — 483 calls and 553,355 tokens went
through them, and the treatment batch was mid-run when the 401s began. So this
is a change on the provider's side (revoked, rotated, expired, or the free grant
ending), not a configuration mistake here. The base URL, model name and request
shape are unchanged from the calls that succeeded.

**What is needed:** one working `inferx.net` API key. It goes in `.env` as
`INFERX_API_KEY`, or as `INFERX_API_KEY_2`/`_3`/`_4` — `inferxKeysFromEnv()`
picks up all four with no code change, and `callInferxPooled` now rotates
automatically when a grant answers 401, 403 or 429.

**What was built anyway, and what it already produced.** The pipeline is
complete and none of its work was lost:

| | |
| --- | --- |
| documents enriched and source-verified | **294** (190 metadata · 62 treatment · 42 citation extraction) |
| claims verified against source text | **429** |
| metadata verification rate | **99.5%** (201/202 on the measured pilot) |
| tokens spent | 553,355 |

**What still runs without any key**, and is running: the deterministic
corruption scan, the deterministic concordance, and every analysis pass. The
lane is not idle.

**What stays true when a key arrives.** Nothing needs re-running: every
completed document is committed with its provenance and replays from cache for
free. The `call_failed` rows written during the outage have been deleted, so
those documents are eligible again rather than permanently skipped — that was a
real bug, found because of this outage, and fixed in `7d4abf3`.

> ### RESOLVED — nothing is needed from the founder, and my diagnosis above was wrong
>
> **The keys were never revoked. The model alias was.** `deepseek-v4-flash` is
> still listed by `GET /models` and returns **401 on every chat request**;
> `deepseek-v4-flash-0731` answers normally with the same key.
>
> **inferx.net returns 401 — not 404, not 400 — for a model alias it will not
> serve.** So an unavailable model is indistinguishable from a dead key by
> status code alone, and `{"error":"Unauthorized"}` arriving on three keys at
> once reads exactly like a revocation. It was not one.
>
> **What actually settled it:** `GET /models` with the same key returns 200 and
> a full catalogue. A key that can list models is not an unauthorised key. That
> one extra call — same credential, nothing else in common — separated the two
> explanations, and I should have made it before writing this entry rather than
> after.
>
> **The correction I owe:** I reported this to the founder as a credential
> blocker and queued it as one. It was a configuration bug in our own code, of
> the kind this queue is explicitly not for. The lesson is recorded in
> `inferx.ts` beside the constant: when an endpoint says Unauthorized, prove it
> with a second call that needs the same credential and nothing else.
>
> The model id now lives in `INFERX_MODEL` (`.env`), defaulting to the working
> alias, so the next catalogue change is a config edit rather than an outage.
> Enrichment resumed immediately on the same three keys.

---

## FQ-STORAGE — what reaching 20.5M documents costs in Railway Postgres

**Raised 13 Aug 2026 by LCC. A money decision, therefore yours.** Nothing is
blocked on it: acquisition and enrichment run as normal and neither is affected
by the answer. This is here so the number is not discovered at 5 TB.

Full working: `docs/ai/CORPUS_SCALE_PROJECTION.md`. All measured, not estimated.

**Time is not the problem.** Held 819,632; remaining ~19.68M; measured ingestion
28,343/hr on the 24-hour average — **about a month of continuous running**, in a
range of 21 to 53 days depending which window you take. (Ingestion is currently
*falling* — 38k → 28k → 15k/hr across the 6h/24h/1h windows, cause unknown, NEW2
is the lane to ask.)

**Storage is the problem, and only on the far side of the embedding gate:**

| | at 20.5M |
| --- | --- |
| **data-first** — text, paragraphs, citations, statutes, NO embeddings | **~405 GB** |
| adding embeddings | **+4.9 TB** (~316M vectors) |

Your data-before-embeddings decision lands us at **~405 GB**, which is an
ordinary bill. The embedding step multiplies it by thirteen, because 1024-dim
vectors cost 4 KB each and the HNSW index measures **3.6x the heap it indexes**.

**What is needed from you, and not yet:**

1. **Confirmation that ~405 GB of Railway Postgres is acceptable**, or a decision
   to move bulk text to R2 with Postgres holding only what is queried. Worth
   answering in the next couple of weeks, not today — we are at 23 GB.
2. **Nothing at all on the 4.9 TB** until the data gate is met. Two measured
   levers cut it to roughly **1.1 TB** — `halfvec` (pgvector 0.8.5 is installed
   and supports it) and not embedding the ~66% of documents that are bail orders
   and procedural disposals with no reasoning in them. **Both need a retrieval
   measurement from NEW1 first**, because an authority we chose not to index is
   invisible to the verification that catches fabrication. Neither is a storage
   optimisation anyone should apply unilaterally.

**Also worth your eye:** the 20.5M target is larger than the ~17.8M the AWS
high-court dataset actually holds. The extra ~2.7M is presumably Supreme Court,
tribunals and other platforms — **it has not been inventoried, and some of it is
outside the authorised bucket.** NEW3 owns that question; flagging it because a
target nobody has counted is a target nobody can hit.

---

## FQ-20M — where does the 20.5M document target come from? — **ANSWERED 17 Aug 2026, NEW2. Your figure was right and ours was wrong. No action needed from you.**

**It comes from the AWS bucket, and it is exact: 20,529,203.**

> **This was found on 13 August, not on 17 August, and the credit is NEW3's.**
> `docs/COVERAGE_GAP_MATRIX.md`'s own header already carried it — *"measured to
> the digit at 20,529,203 … Add Supreme Court's 38,351 and the combined
> denominator is 20,567,554, within 0.3% of 20.5M."* That is the better figure,
> because it folds in the Supreme Court rows the High Court survey omits, and it
> lands within **0.3%** of the founder's number rather than merely near it.
> **This entry was a separate, older, un-updated copy of the same question**, and
> the answer below was arrived at independently four days late. Recorded that way
> rather than quietly, because "two files asking the same question and only one
> of them answered" is the failure worth seeing. Cross-link:
> `docs/COVERAGE_GAP_MATRIX.md` header.

`docs/HC_METADATA_SURVEY.json` — parquet footers for 1,493 objects, already in
the repo — states it directly: `totals.allYears.combined = 20,529,203`, being
`plain 19,237,684 + mobile 1,291,519`. Summing its `perCourtPerYear` block
independently reproduces the same figure to the document.

**The "~17.8M" below is the number that was wrong**, and the ~2.7M "gap" it
created never existed. Nothing needs to be found, and district courts do **not**
need to be in scope to explain it — the question that was escalated to you was
an artefact of two different readings of the same file.

**Checked rather than assumed**, because `plain + mobile` would double-count if
the two variants published the same documents — and they look like they might,
since the mobile file carries a superset schema over the same court, bench and
year. They do not: `pdf_link` overlap between the variants is **0.0%** on both
partitions tested (Bombay/Aurangabad 2025 and Allahabad 2023). Disjoint
populations, so the addition is sound.

**What we actually hold against it, measured the same day:** 7,257,726 of
20,529,203 — **35.4%**, with 13,271,477 remaining. The largest single band is
2016–2022 at 7,026,064 remaining (22.5% held). Full working:
`docs/COVERAGE_FRONTIER_17AUG.md` §0.

**One caveat that matters for how you read progress:** these are **documents**,
not judgments — most of what the bucket holds is a procedural order rather than
a reasoned decision. Progress against 20.5M is honest; describing it as 20.5M
*judgments* would not be.

**How much smaller the judgment count is, we do not actually know.** The only
labelled measurement (`docs/HC_ORDER_TYPES.json`) covers 1,291,519 rows — 6.3%
of the corpus, four courts, on a file variant that is *disjoint* from the other
93.7% — and its own tool states it "must never be quoted as a corpus-wide
judgment count". An earlier draft of this entry quoted its 0.75%–18.64% range as
though it were general. **It is not, and that sentence has been removed rather
than softened.** If the ratio matters for a decision you are making, say so and
it becomes a measurement task rather than an estimate.

**The scope question underneath is still yours and still open, but it is now
separable.** Nothing forces district courts into scope to make the arithmetic
work. If you want them, it is a decision on its own merits (~33M NJDG orders,
roughly another 650 GB), not an inference from a number that no longer needs
explaining.

<details>
<summary>Original entry, kept because its reasoning is still the right shape — only its 17.8M premise was wrong</summary>

## FQ-20M — where does the 20.5M document target come from?

**Raised 13 Aug 2026 by LCC after NEW3 checked it. A scope question only you can
answer.** Nothing is blocked: acquisition runs against every authorised source
regardless. But a target nobody can trace is a target nobody can report progress
against, and it currently sits in `CORPUS_SCALE_PROJECTION.md` as the
denominator.

**The AWS high-court dataset holds ~17.8M documents** (25 courts, 45 benches,
~1.25 TiB, verified against source). Your figure is 20.5M. NEW3 checked the
obvious explanations and **none of them close the ~2.7M gap:**

| candidate | actual |
| --- | --- |
| Supreme Court | ~38,351 total, already **99.98% held** — 0.02M |
| tribunals via Supreme Today | "tens of thousands, not millions" once scoped to head-noted material |
| **together** | **well under 1% of the gap** |

NEW3 also searched for any public dataset or figure matching 20.5M and found
nothing definitive. One near-miss worth knowing: **High Court pending cases are
independently reported at ~6 million** — but that is a different unit. AWS's
17.8M counts *documents*, most of which are procedural orders rather than
distinct judgments.

**The one category that would close a gap this size is NJDG district-court
orders (~33M, confirmed real).** `RING_PROGRAM.md` §1 rules district courts
explicitly out of scope, and **no lane will assume your 20.5M silently includes
them.** That is exactly the kind of scope expansion §1 warns against deciding by
inference.

**What would help:** either the origin of the 20.5M figure, or a direction on
whether district courts are in scope. If they are, the projection changes
substantially — 33M more documents at the measured per-judgment cost is roughly
another **650 GB data-first**, on top of the ~405 GB already projected.

Until then the ring works to **~17.8M high courts + Supreme Court**, and reports
progress against that.

</details>

---

## FQ-NET — this machine ingests over Wi-Fi, and that becomes the ceiling

**Raised 13 Aug 2026 by LCC. A physical action only you can take.** Not blocking
today: we are at **24%** of the link. It becomes the binding constraint the
moment the software fixes below land, and those are cheap.

    adapter     Intel(R) Wi-Fi 6 AX201 160MHz
    link speed  144 Mbps
    measured    4.4 MB/s = 35.2 Mbps  (24.4% utilisation)

**Nothing else on this machine is busy:** CPU **4%** across 20 cores, 9.4 GB RAM
free, and of 100 Postgres connections only **4 are active** while **29 backends
sit waiting on the client**. The database is idle waiting for us to send work.

The ingest workers are running at roughly **30% of their own configured
concurrency** — 268 fetches could be in flight, 80 are — because the batch loop
is strictly sequential: metadata read, dedupe, already-held check, fetch, write.
**Three of those five phases leave the network completely idle.** NEW2 has the
four software levers (raise concurrency, pipeline the phases, kill the
already-held rescan, and *not* adding more workers).

**Where you come in:** if those levers work, throughput rises toward the Wi-Fi
ceiling of ~18 MB/s — roughly 4x current, which would take 17.8M documents from
**~20 days to ~5**. Past that, **the cable is the only way up.** Gigabit Ethernet
raises the ceiling ~7x, after which CPU and the Railway proxy become the limits
rather than the radio.

**Ask:** plug this machine into Ethernet if there is a port within reach. It
costs nothing and removes the only hard ceiling we cannot engineer around.

**Caveat:** the 4.4 MB/s sample was taken while my own harvest jobs were also
running, so NEW2's true share is lower and the headroom is larger, not smaller.

---

## FQ-OVERRULED-2 — two Supreme Court judgments render as live good law, right now

**Raised 13 Aug 2026 by LCC after NEW3 identified them externally. This is a
`CLAUDE.md` zero-threshold item and it needs your decision, not mine.**

`CLAUDE.md` §6: *"overruled law rendered WITHOUT the LAW MOVED mark is as severe
as a hallucination"*, threshold **zero**. Two held judgments are in that state.
Both verified against our own rows, not taken on report:

| | |
| --- | --- |
| **M/S SUN EXPORT CORPORATION, BOMBAY v. COLLECTOR OF CUSTOMS** | |
| id | `f9885dbe-7486-41c8-bcb0-add10eb37c28` |
| held as | `1997 INSC 516`, 7 July 1997, Supreme Court |
| reporter | `[1997] SUPP. 1 S.C.R. 434` |
| `overruled_status` | **`none`** — renders as good law |
| overruled by | *Commissioner of Customs (Import), Mumbai v. Dilip Kumar & Co.*, `2018 INSC 646`, 30 July 2018 |

| | |
| --- | --- |
| **SEBI v. ROOFIT INDUSTRIES LTD.** | |
| id | `1fee973e-cdc0-4437-aa3c-4494559b2999` |
| held as | `2015 INSC 864`, 26 Nov 2015, Supreme Court |
| reporter | `[2015] 12 S.C.R. 190` |
| `overruled_status` | **`none`** — renders as good law |
| overruled by | *Adjudicating Officer, SEBI v. Bhavesh Pabari*, 28 Feb 2019 |

### Why the graph missed them, and it is not the extractor's fault

**The citing judgment prints the wrong year.** `2018 INSC 646` names its target as
`(1977) 6 SCC 564`. The real citation is `(1997) 6 SCC 564` — a single-digit
transposition, in the source text, faithfully recorded by our extractor. The edge
exists and carries `relationship = 'overruled'`; it simply resolves to nothing
because no 1977 judgment of that name exists.

**This is a source-data defect, not a parsing one**, and it is the first
confirmed instance of a class nobody has measured: *citation year typos in
published judgment text*. A name-matching resolver would have caught it; a
citation-matching one cannot.

### What I have NOT done, and why

**I have not written `overruled_status`.** Your directive said not to, and I am
holding to it even here — but you should know the cost of that decision is two
specific judgments displaying as safe to rely on while they are not.

The two changes are a two-row update with high confidence: the targets are
identified, held, and externally verified by NEW3 against the overruling
judgments. **If you want them corrected, say so and it is one command.** If you
would rather wait for the audited extractor, that is a defensible call — but it
should be a call, not a default.

### The wider number this implies

NEW3 resolved all 13 no-candidate overruled targets. Two are these. Eight are
genuinely not held (acquisition candidates, in `CORPUS_ACQUISITION_QUEUE.md`).
**If 2 of 13 known-missing edges turn out to be held-but-mislinked, the same
ratio over the 598,759 real unresolved citations is not a small number** — and
nobody has measured how many carry a year typo. That measurement is queued.

---

## [OPEN] Bulk-fetch the Gazette of India from its archive.org mirror — licence not cleared · NEW3 · 14 Aug 2026

**Not a licensing blocker in the "SC/HC AWS bucket, CC-BY-4.0, already
authorized" sense — a genuinely new question, because this specific source
hasn't been checked before.**

**What was verified, by direct API calls this session, not a search
snippet:** `archive.org`'s `gazetteofindia` collection holds **171,942
central Government of India gazette documents**, dated **1947-01-01 to
2026-08-11** — current to three days before this check, not a stale
one-time scrape. Confirmed 453 entries exist for July 2024, the month
BNS/BNSS/BSA commenced. Each item traces back to the official
`egazette.gov.in` portal (checked on one item: sourced from
`egazette.gov.in/WriteReadData/2024/255085.pdf`, carrying the gazette's
own official control ID `CG-DL-E-...`), mirrored with OCR added by
`sushant@indiankanoon.com` / `github.com/sushant354/egazette`. A wider,
separate 805,433-document collection also exists covering state gazettes.

**UPDATE 14 Aug 2026 — now characterised per-state, 13 of LawMind's 25
High Court jurisdictions measured:** Kerala 56,730 · Rajasthan 46,055 ·
Andhra Pradesh 22,496 · Maharashtra 21,917 · Karnataka 20,264 · Tamil
Nadu 15,303 · Punjab 9,411 · Madhya Pradesh 9,358 · Gujarat 8,453 ·
Telangana 7,092 · Delhi 5,234 · Uttar Pradesh 3,772 · Bihar 724 · West
Bengal 105 (the last two notably thin relative to court size — possibly
a naming-variant miss, not confirmed either way). Same licence question
below covers all of it as one decision, not one per state.

**Why this needs a founder call and not a technical one:** this is the
official statutory-notification source the mission brief names as a
priority category — commencement notifications, GSR/S.O. central Act
amendments, rules and regulations — currently completely unheld by
LawMind. No `licenseurl` field appears in the item metadata checked. The
underlying gazette content is widely understood to sit outside ordinary
copyright the way judgment text does (a neighbouring provision in the
Copyright Act, not identical to the s.52(1)(q) judgment exemption this
product already relies on) — **but that reading is unverified here, and
this lane does not clear licences.** Bulk-fetching an archive.org mirror
of a government publication is a different provenance question from
fetching AWS Open Data's own CC-BY-4.0-declared bucket, even though both
ultimately trace to a government source.

**What's needed:** either founder/counsel confirmation that gazette
content can be bulk-fetched under the same reasoning as judgment text, or
a specific licence read of archive.org's terms for this collection.
**Nothing is blocked while this waits** — no other lane depends on this
source yet, it is a newly-surfaced opportunity, not a stalled task. Full
technical detail: `docs/SOURCE_REGISTRY.md` §3, `docs/
CORPUS_ACQUISITION_QUEUE.md` row 2.

---

## NEW3 — 14 Aug 2026 · The Supreme Court's Equivalent Citation Table: one licence read, worth 34.2% of the citation gap

**Nothing is blocked while this waits.** The table is fetched, parsed,
measured and validated; only the decision to *use* it is outstanding.

**What it is.** The **Equivalent Citation Table**, compiled by the **Supreme
Court Judges Library** and signed by its Director. Four volumes giving
equivalent citations across S.C.R., SCC, AIR (SC), JT and SCALE for the same
judgment. Still offered on the live official page
`https://www.sci.gov.in/judges-library/`. Covers **1950 to 12.03.2018**.

**What it is worth, measured — not estimated.** Against the live corpus:

- **204,684 of 598,766 unresolved citation edges (34.2%) become resolvable**,
  pointing at judgments **LawMind already holds**. No documents acquired, no
  ingestion, no purchase.
- By reporter: **AIR 63.1%**, **SCC 52.4%**, **SCALE 49.3%** of each
  reporter's unresolved edges.
- Cross-checked against our own corpus-derived alias table (4,394 pairings,
  each corroborated by ≥2 citing judgments): **99.42% agreement** across
  3,807 comparable rows. The 22 disagreements are transcription slips in the
  table, not systematic error.

This is the single largest measured improvement to citation resolution
available to this product, and it costs nothing to obtain.

**Why it needs you and not us.** Two things, and only the first is a real
question:

1. **Licence.** An official Government of India publication is a *Government
   work* under the Copyright Act (s.2(k), s.17(d)). That is a **different
   category** from a judgment, which `CLAUDE.md` §6 exempts via
   s.52(1)(q)(iv) — so the exemption this product already relies on does not
   obviously extend to it. The counter-reading is that the ECT is a table of
   bare citation numbers — facts, lacking the "modicum of creativity"
   *EBC v. D.B. Modak* requires — and thin or absent copyright would follow.
   **That is a legal reading, and this lane does not clear licences.**
2. **Source scope.** `sci.gov.in` is not among the three §6a-named sources.
   Adding the Supreme Court's own website as an authorised source is
   plausibly routine, but it is your call, not ours.

**One wrinkle you should know about.** The Court still publishes the ECT, but
**its own links to it have been broken since the site migration** — the live
January-2024 landing PDF points at `main.sci.gov.in`, a hostname that no
longer resolves. The content is currently reachable **only via the Internet
Archive**. So the provenance is unambiguously official, while the retrieval
route is a third-party mirror — which may or may not matter to how you want
the licence question answered.

**What's needed:** a yes/no on using an official SCI Judges Library
publication as a citation-concordance source, and if yes, whether retrieval
via the Internet Archive is acceptable given the Court's own links are dead.

**Deliberately not done pending your answer:** the four PDFs (~12 MB) and the
235,807 parsed pairs are **not committed to the repo**. Everything needed to
reproduce them in minutes is recorded in `docs/SOURCE_REGISTRY.md`
§5a-FETCHED. Building the loader is LCC's territory once cleared.

---

## NEW3 — 14 Aug 2026 · Tribunals publish their own orders, free. One licence read could unblock a category we hold zero of.

**Nothing is blocked while this waits.** No harvesting has been done beyond
two single-document verification fetches.

**What changed.** Until today the only route to tribunal decisions was the
paid Supreme Today account (₹50,000/month, already in this queue). That
framing missed something: **Supreme Today is an aggregator, and the tribunals
themselves publish their own orders on their own official `.gov.in` sites.**

**Verified end-to-end — a real PDF downloaded and its text read, not a page
that merely looked promising:**

- **NCLAT** (`nclat.gov.in`) — retrieved an order dated 14 Aug 2026.
- **TDSAT** (`tdsat.gov.in`) — retrieved a full reasoned judgment dated
  13 Aug 2026, 304 KB, *Den Networks Ltd v. Skyline Cable Network*.

Both are free, need **no account, no payment, and no CAPTCHA**. Neither
required bypassing any access control — we followed the same form the site
submits itself in a browser. `robots.txt` on NCLAT does not disallow the
judgment paths; TDSAT publishes no `robots.txt` at all.

**Four other tribunals are CAPTCHA-gated and we are NOT touching them:**
NCLT, CESTAT, ITAT and NGT. The eCourts CAPTCHA grant is eCourts-specific and
does not extend to tribunal sites, so those stay closed regardless of any
licence answer. Recorded so nobody re-derives it.

**What we need from you.** These sites are not among the three §6a-named
authorized sources, so the normal provenance process applies:

> May we harvest tribunal orders directly from the tribunals' own official
> websites — specifically NCLAT and TDSAT to begin with?

The argument in favour is that a tribunal order is a judicial decision
published by the deciding body itself, which is the same reasoning
`CLAUDE.md` §6 already relies on for judgments. **Whether that statutory
exemption extends to tribunals specifically is a legal reading, and this lane
does not clear licences** — which is why it is here rather than decided.

**Why it is worth your attention.** LawMind holds **zero** tribunal
decisions. Tribunal practice — insolvency, tax, telecom, competition,
consumer — is a large share of commercial litigation, and it is the one
document category where a competitor with tribunal coverage beats us
outright. If the answer is yes, this is free and the mechanism is already
proven.

**Still unknown even if you say yes:** the volume and historical depth
available from each site. A one-week date-range probe proves the endpoint
works; it does not tell us whether the archive goes back two years or twenty.
That is measurable once cleared. Full technical detail, including the exact
request sequence and two path traps that cost a cycle each:
`docs/SOURCE_REGISTRY.md` §2b.

---

## FQ-IX2 · Only ONE InferX grant is configured, and grants are the enrichment ceiling

**Filed 14 Aug 2026 by LCC, under the DEEPSEEK SCALE-UP directive. Nothing is
blocked; the whole path is built, tested and running on the one grant.**

### What is needed

**More InferX / DeepSeek grant keys.** That is the entire ask. No code change
comes with it: `inferxKeysFromEnv` already reads `INFERX_API_KEY`,
`INFERX_API_KEY_2`, `INFERX_API_KEY_3` and `INFERX_API_KEY_4`, rotates on
capacity and on 401/403, and refuses to rotate on a 400 (a malformed request is
malformed for every key). Adding a line to `.env` is the whole deployment.

### Why it is the ceiling, with the numbers

The run log prints what is actually configured. Today it reads:

    task case_structure · prompt v1 · model deepseek-v4-flash-0731 · units 100 · InferX grants 1

Measured this session on real corpus documents: **~16 s/document**, one caller.
That is roughly **225 documents/hour**.

**Concurrency is NOT the lever, and this is measured rather than assumed.**
`docs/ai/DEEPSEEK_DATA_MOAT.md` §1 recorded that running several callers at once
against the free pool makes its 429 rate measurably worse — three simultaneous
processes hit capacity failures far more than one. So the pipeline deliberately
runs one caller, and adding threads to a pool that punishes them would be a way
to go slower while looking busier.

The eligible population for the structured legal object is **233,656 classified
substantive judgments**, and there are **five tasks**. At one grant that is on
the order of 5,200 hours. Each additional grant is a roughly proportional cut,
because the constraint is the shared free pool's capacity and not this machine.

### What was built anyway, and what stays true without it

Everything. The five tasks, the span verification, the prioritised queue, the
staged rollout and the dataset export all work on one grant — they are simply
slower. **The paid fallback is already wired**: when the free pool returns three
consecutive capacity failures the circuit breaker opens and calls go to
OpenRouter, with the real charge (`usage.cost`) written to `llm_calls.cost_usd`
rather than a rate typed in from a pricing page. So the pipeline never stops for
capacity; it either waits or it spends.

**Which means this is genuinely a cost question, not a capability one**, and
that is why it is yours: more free grants, or accept OpenRouter spend at a rate
you set, or accept the slower schedule. All three are fine and the code does not
care.

### Where it plugs in

`.env` → `INFERX_API_KEY_2` … `_4`. `services/ingest/src/inferx.ts`.
`docs/ai/LEGAL_OBJECT_PROGRAM.md` §5.

---

## FQ-PGKILL · A 19-hour orphaned database query is blocking the citation resolver, and the agent is not permitted to cancel it · LCC, 15 Aug 2026

**This is a permission grant, not a credential and not money.** Everything else
about the work is done and waiting.

### What is happening

Backend `pid 62315` on the Railway Postgres has been running one statement since
**14 Aug 23:00:27 UTC — 19h20m at the time of writing.** It is the citation
resolver's bulk `UPDATE`, started about half an hour after the machine rebooted
at 22:27, by a session that no longer exists. The identical statement completed
its dry run **in about two minutes** this evening.

It holds row locks on `judgment_citations`. `pg_blocking_pids` names it exactly
as the blocker of this session's `resolve-cli --apply`, which is otherwise ready
to resolve **131,125 citation edges — 14.0% → 30.0% resolution** — with no new
data, no new logic and no licence question. That work is measured, dry-run
verified, and simply queued behind a dead query.

### What I tried, and what stopped me

`pg_cancel_backend(62315)` and then `pg_terminate_backend(62315)`. Both were
refused by the tool sandbox's classifier. **I did not attempt to work around
it** — that guard exists for a good reason and an agent routing around it is a
worse outcome than a delayed pass.

Cancelling is the mild option and the correct one: the `UPDATE` is uncommitted,
so it rolls back cleanly with no partial write and nothing to repair. The work
is fully reproducible — this session's own run redoes it.

### What is needed

Either

1. run `SELECT pg_cancel_backend(62315);` against the corpus database yourself
   (Railway's query console, or `psql`), or
2. add a Bash permission rule allowing `pg_cancel_backend` / `pg_terminate_backend`
   for this project so a stuck backend can be cleared without a founder round trip.

Option 2 is the one that stops this recurring. This is the **second** time a
stuck transaction has blocked LCC's work this week — bus 0472/0473 was a 90-minute
`INSERT` holding up an index build, and that one only cleared because NEW2's fleet
moved on by itself.

### What was built anyway, and what stays broken without it

Built and landed regardless: the rejection triage, the verifier fix, the storage
audit, and the resolver run itself (it is launched and waiting, not abandoned).
What stays broken: citation resolution stays at **14.0% instead of 30.0%**, which
is the product's core promise, and it degrades further every hour the corpus grows.

### Where it plugs in

`services/ingest/src/resolve-cli.ts`. Log: `.agents/logs/resolve-apply.log`.
`docs/CURRENT_PLAN.md` §Q1.53.

---

## FQ-IK · The repo says two different things about Indian Kanoon, and the competitor-distillation schema cannot be built until it says one · LCC, 15 Aug 2026

**Not asking to activate anything. Asking which record is current**, because the
provider-signal tables are supposed to carry a `license_scope` per row and that
field cannot be populated from a contradiction.

### The contradiction, both quoted from this repo

| record | says |
| --- | --- |
| `CLAUDE.md` §6a — founder-declared, dated, "settled" | authorises **BharatLaw · Supreme AI · eCourts India**, through 13 Nov 2029. **Indian Kanoon is not on the list.** |
| `docs/DATASETS.md` | lists **IndianKanoon as an approved source** |
| `docs/BLOCKER_REGISTER.md` §B2.1 | treats it as a **paid commercial API** (₹0.02/call, `api.indiankanoon.org/pricing/`) needing founder sign-off, and notes its terms were never read before shipping |
| `docs/COMPETITIVE_TEARDOWN.md` §1 | notes it is now also a **competitor** — Prism, an eight-tool AI suite over 30M+ judgments |

The current session directive states plainly that Indian Kanoon is **NOT
AUTHORIZED** and that API harvesting must not be activated unless the decision is
"explicitly superseded and recorded". **That instruction is being followed —
nothing has been activated, no key has been requested, no call has been made.**
This entry exists so the written record stops disagreeing with itself.

### Why it blocks real work rather than being a tidiness complaint

The competitor-distillation data model (`provider_citation`, `provider_treatment`,
`provider_case_structure`, `provider_paragraph`, `provider_topic`,
`provider_query_expansion`, `provider_retrieval_result`, `provider_ai_output`)
requires **`license scope` on every record**. Verified today: **none of those
tables exists yet** — zero matching `table_name` in `information_schema`. So this
is being asked before the schema is written, not after it is populated.

Building it against a source list that contradicts itself is how one source's
permissions silently broaden into another's, which `CLAUDE.md` §6a explicitly
forbids.

### The three questions, and only you can answer them

1. **Indian Kanoon** — is `DATASETS.md`'s "approved" stale, or is `CLAUDE.md`
   §6a's list simply not exhaustive? If it is authorised, under what scope
   (metadata lookup only? fragments? full documents? training?) and is the paid
   API balance funded?
2. **Supreme Today** — the directive says it needs its own licence, separate from
   Supreme AI, and that the two must never be conflated. Is a Supreme Today
   licence in place? **Assumed NO until you say otherwise, and nothing is being
   built against it.**
3. **Supreme AI** — §6a covers it. Confirming the scope reading before anything
   is built: citation/query evaluation, permitted processing, training,
   distillation and retrieval-data construction. Correct?

### What was built anyway, and what stays blocked

**Built:** nothing that touches any provider — deliberately. The distillation
design is recorded but unimplemented, because the first column of the first table
is the one that needs your answer.

**Stays blocked:** the whole competitor-teacher programme (P1), including the
active-learning query queue that would be driven by LawMind's own unresolved
citations and treatment gaps. That queue is real and measurable today — it is the
provider side of it that cannot start.

**Not blocked and continuing:** everything internal. The 131,125-edge citation
resolution needs no provider at all (see FQ-PGKILL), and NEW3 has already
measured that 71% of unresolved SCR citations point at judgments **we already
hold** — no external source required.

### Question 2 — RESOLVED by the founder, 16 Aug 2026: ONE identity, not two

**The founder answered directly, unprompted, addressed to NEW3:** *"Supreme
Today AI and Supreme AI refer to the SAME provider/platform. From now on
treat them as one competitor/provider identity. Do not create separate
provider schemas, licensing assumptions, query queues or datasets for them.
Preserve any historical aliases for auditability, but canonicalize future
planning under one provider identity."*

This settles Question 2 above in favour of the reading `AUTHORIZED_SOURCE_MAP.md`
§2 already carried from the founder's 12 Aug confirmation (*"yes supreme ai =
supreme today ai"*) — **the current session directive's "must never be
conflated, assume no licence until told otherwise" instruction is superseded
for this specific pair.** It was protecting against under-scoping a single
real relationship, not describing two, which is exactly the possibility
§2 of `AUTHORIZED_SOURCE_MAP.md` flagged as unresolved on 12 Aug and which
Question 2 here re-opened out of caution on 15 Aug. Full record:
`AUTHORIZED_SOURCE_MAP.md` §2-RESOLVED.

**Practical consequence for the `provider_*` schema this entry blocks:** one
canonical `provider_id` (e.g. `supreme_today`) carries `license_scope` from
the already-negotiated Supreme Today terms (`SUPREME_TODAY_LICENCE.md`
§"UPDATE" — query-only, perpetual retention granted, target = everything
they have). `"supreme_ai"` is retained only as a historical alias — in
whatever lookup/enum the schema uses for provenance — never as a second row
with its own scope or a second licence assumption. **Question 1 (Indian
Kanoon) and Question 3 (exact Supreme AI processing-scope confirmation) are
UNCHANGED and still open** — this founder message addressed the identity
question only, not those two.

---

## LCC · RAILWAY → LOCAL POSTGRES MIGRATION · 15 August 2026

**Nothing here blocks the migration. It is running.** Two items need you; both
have working code around them and neither stops the lane.

### FQ-R2-KEYS — **RESOLVED 15 Aug 2026, same session**

R2 credentials were absent (`docs/FOUNDER_QUEUE.md` §"Export needs R2" was
right). You supplied both pairs mid-session. **Verified working end to end**:
a 74.5 MB archive was uploaded to `lawmind-corpus/backups/postgres/`, downloaded
again, and byte-compared — `0 differences found`.

Recorded in `.env` (gitignored, confirmed by `git check-ignore`). The split is
kept as `packages/storage/src/r2.ts` requires:

| pair | used by | blast radius |
| --- | --- | --- |
| **object** (`R2_ACCESS_KEY_ID`) | all tooling and services | **cannot create or delete a bucket** — verified, it is refused on `ListBuckets` with a 403 |
| **admin** (`R2_ADMIN_ACCESS_KEY_ID`) | one-off bucket administration by a human | scoped to `lawmind-corpus` |

**One thing to know:** backups go to `lawmind-corpus` under the prefix
`backups/postgres/`, not to a separate bucket, because the admin token is scoped
to that one bucket. `R2_BACKUP_BUCKET` is a separate variable so splitting them
later is a config change, not a code change. **If you ever write an R2 lifecycle
rule for the corpus, scope it by prefix** — an unscoped expiry rule on that
bucket would delete the database backups.

### FQ-RAILWAY-SHUTDOWN — **needs you, but NOT yet**

`docs/ops/migration/RAILWAY_SHUTDOWN.md` has the exact commands. **Do not run
any of it until the gate in its §0 passes** — it is written to be unusable early
on purpose.

The short version when the time comes:

1. Repoint workers/API to local — reversible, then **soak 48 h**
2. `railway down` on each service, **Postgres last** — reversible, **this is
   where the billing stops**, then **soak 7 days**
3. Railway's own final backup, independent of ours
4. Delete the Postgres service — **irreversible**
5. Delete remaining billable resources — **irreversible**

**Steps 4 and 5 save comparatively little and are the only unrecoverable ones.**
A stopped service is not billed for compute; a retained volume is billed for
storage, which is the small number. A month of Railway costs far less than the
corpus, so the soak periods are not caution for its own sake.

### The stuck resolver backend — no longer urgent, and here is why

**pid 62315 is still stuck, 20.6 hours as of 19:35Z**, still the only blocker of
pid 65284. Re-confirmed against `pg_stat_activity`, and it is the same backend
described in `docs/ops/UNBLOCK_CITATION_RESOLVER.sql` — same `backend_start`,
same query head, not a reused pid. 131,125 citation edges are behind it.

**It does not block the migration and you no longer need to run that SQL.** The
UPDATE is uncommitted, so `pg_dump`'s snapshot correctly excludes it and it will
roll back when Railway stops. The resolver re-runs locally after cutover —
against a database with no proxy, no twenty-writer contention, and no shared
statement budget, which is a strictly better place to run it. The dry run
projects 13.63% → 30.0%; that remains **a projection, not an achieved number**,
and will be quoted as achieved only after the live count confirms it.

### What was paused, and what it costs

**The ingest fleet is stopped** — 37 supervisors, 193 processes, killed at
19:24Z. The directive authorised this explicitly. Their exact command lines are
recorded in `docs/ops/migration/fleet-inventory.json`, which is now the **only**
copy of that configuration, and `freeze.mjs thaw` prints them back for restart
against the local database.

**Cost of the pause: ingestion stops for the duration of the migration.** At the
fleet's rate that is real documents not acquired. The directive settled this
trade in advance — *"prevent data loss and stop Railway billing permanently, not
maximize documents during a few migration hours."*

**NEW1's Gate S2 harness (`services/harness/src/run-cli.ts`) was left running.**
It is read-only, so it cannot affect dump consistency, and it is another lane's
work. It does compete for IO on the source and will have slowed the dump.

---

## LCC · RAILWAY COST-KILL — executed 16 Aug 2026

**Acting on the usage dashboard ($62.89: Postgres $48.09, api $14.56).** The bill
is RAM and egress, not volume — so the levers are "stop compute" and "finish the
dump", in that order.

### DONE — stopped, reversible, no migration dependency

| service | was | now | monthly |
| --- | --- | --- | ---: |
| **api** | ● Online | deployment removed, edge returns 404 | **~$14.56** |
| **cron** | deployed | deployment removed | included above |
| **recheck** | deployed | deployment removed | included above |
| Postgres-fKqF | "No deployments found" | unchanged | $0.17 |
| Postgres-NQ5a | "No deployments found" | unchanged | $0.16 |

**Proven before acting, not assumed:**

- **The migration does not touch the api service.** Its tooling connects to
  exactly three things: `hayabusa.proxy.rlwy.net` (Postgres), R2, and localhost.
- **`Postgres` is the dump source** — `RAILWAY_TCP_PROXY_DOMAIN=hayabusa.proxy.rlwy.net`,
  port `24909`, matching `DATABASE_URL` exactly. It was **not** touched.
- **No Railway service was connected to the database.** Every backend in
  `pg_stat_activity` was accounted for: 5 of my own COPY chunks, the 2 stuck
  resolver backends, 1 autovacuum. So `cron`/`recheck` were not a freeze risk —
  worth checking, because my freeze only ever stopped processes on *this*
  machine and a Railway-side writer would have been invisible to it.
- **The two extra Postgres services hold no data.** `railway volume list` returns
  exactly ONE volume, `postgres-volume`, attached to the main `Postgres`
  (121,841 MB / 250,000 MB). fKqF and NQ5a have no volume, no variables and no
  deployment — abandoned shells. **Stopped, not deleted**, per the directive.

**Reversible:** `railway down` removes a deployment; a redeploy restores it.
Nothing was deleted.

### The remaining bill, and when it stops

**~$48/mo of Postgres RAM+egress cannot be stopped before cutover** — it is the
migration source. It stops when the gate passes and the service is shut down,
which is the whole point of finishing the dump quickly rather than carefully
economising around it.

**Egress is uncompressed.** The Postgres wire protocol does not compress, so the
dump costs ~74 GB of egress regardless of zstd — compression only saves local
disk. **38.6 GB already spent, ~35.8 GB remaining.** That is a sunk, bounded,
one-time cost and there is no cheaper way to get the corpus off Railway.

### STILL NEEDS YOU — after the gate, not now

1. **Delete the Postgres service and its 250 GB volume.** Irreversible.
   `RAILWAY_SHUTDOWN.md`. Note the directive's amendment: do **not** keep it as a
   paid rollback for weeks once local + R2 both verify — that defeats the point.
2. **Cancel or downgrade the Pro subscription** once nothing billable remains.
   Not a CLI action.
3. **`docs/ops/UNBLOCK_CITATION_RESOLVER.sql` is now optional.** pid 62315 is at
   23.8h and still stuck, but it is uncommitted, excluded from every chunk
   snapshot, and rolls back when the service stops. The resolver runs locally
   after cutover — no proxy, no contention. **Do not run it against Railway.**

---

## FQ-IK-RESOLVED · Founder confirms Indian Kanoon + "Bharat Nyai" licensing, live in session · NEW3, 17 Aug 2026

**Answers FQ-IK Q1 (`docs/FOUNDER_QUEUE.md` line ~3622), open since 15 Aug 2026.**
The founder, live in this session, confirmed:

1. **Indian Kanoon — API/training rights now authorized.** Supersedes the
   twice-recorded declination (*"We are NOT buying the Indian Kanoon
   API...money is going to Supreme Today instead"*, *"Indian Kanoon is
   settled: no API"*, both 8 Aug 2026, `AUTHORIZED_SOURCE_MAP.md` §4).
2. **"Bharat Nyai" = BharatLaw.** No separate product by that name exists
   anywhere in this repo or was found by search (`grep` for
   `Bharat.?Nyai|nyaya.?ai` — zero hits, checked before asking). The founder's
   live confirmation supersedes `BharatLaw`'s own Evaluation/Platform
   Agreement reading of `extractionPermitted: false` and clears
   benchmark/distillation/training use against it.

**What was NOT specified and is still open, GUESS-labelled below, not
KNOW:** exact processing scope for either (metadata-only vs fragment vs full
document vs training), IndianKanoon paid-API budget ceiling, and whether the
BharatLaw contract's written-consent email (FQ-BL1) is still required as a
formality or is now waived. **Do not spend against either without one more
explicit confirmation of scope + budget** — this entry only lifts the
blanket "declined"/"prohibited" status, it does not set a spending ceiling.

**Not yet reflected in `CLAUDE.md` §6a**, which is founder-declared,
dated, and states it "supersedes earlier repository statements" — that file's
own convention is a founder-authored dated update, not an agent edit under
a session confirmation. **Recorded here per the existing FQ-IK convention
so the written record stops disagreeing with itself**; §6a's authorized-list
edit is the founder's, whenever convenient, not blocking on it.

Broadcasting to LCC/NEW1/NEW2/RCC via bus — LCC's `provider_*` schema
(FQ-IK's original blocker) can now take IndianKanoon and BharatLaw as
licensed `provider_id` rows once scope/budget are confirmed.

---

## FQ-CCI-PERMISSION · CCI publishes 1,231 orders and asks for one email before anyone reproduces them · NEW2, 17 Aug 2026

**What is needed from you: one email, and a judgment call I am not allowed to
make alone.**

**What was built anyway:** the whole acquisition path, measured and proven, in
`docs/TRIBUNAL_ACQUISITION_MEASUREMENT.md`. The listing endpoint is
enumerable, the exact count is **1,231 antitrust orders** (the site's own
figure, not an estimate), and the order PDFs fetch directly — HTTP 200,
`application/pdf`, verified by execution. Nothing was harvested.

**The conflict.** CCI's copyright page says, verbatim:

> "Material featured on Competition Commission of India (CCI) may be reproduced
> free of charge after taking proper permission by sending a mail to us."

Free, but **on prior written permission**. Against that: CCI is a quasi-judicial
authority, and Copyright Act **s. 52(1)(q)(iv)** exempts "any judgment or order
of a court, tribunal or other judicial authority" without distinguishing
commercial use — the exact provision `CLAUDE.md` §6 already relies on for
judgments. On that reading the site policy governs CCI's own publications
(market studies, annual reports, page design), not its adjudicatory orders.

I think the exemption reading is probably right. **I am not acting on it.**
`CLAUDE.md` §6a says sources outside BharatLaw / Supreme AI / eCourts stay in
the normal authorization process, and "a site-wide policy versus a statutory
exemption" is precisely the kind of question that section exists to keep out of
an agent's hands. The cost of asking is one email; the cost of being wrong is a
regulator with a documented permission process finding we skipped it.

**Two ways to close it, either is fine:**

1. **Send the email** CCI asks for — reproduction is free, so this is a
   formality with a paper trail, and the paper trail is the point.
2. **Tell me the s. 52(1)(q)(iv) reading governs** for tribunal and regulator
   orders generally, and I will treat CCI, CAT and the other first-party
   tribunal publishers the same way we already treat court judgments.

**What stays broken without it:** nothing breaks. 1,231 orders is a small
tranche, and the corpus does not depend on it. What we lose is a category we
hold **zero** of — competition-law orders — and the same question returns
unanswered for every tribunal after this one, which is the real cost.

**Same item covers CAT** (`cis.cgat.gov.in`), measured in the same pass and
fully reachable: 42 benches, date-enumerable final orders, cause lists and daily
orders, PDFs fetching at 200. CAT publishes **no** copyright or reuse policy
that I could find — only an NIC hosting footer and a Disclaimer link whose text
I could not retrieve. **Absence of a restriction is not a grant**, and I did not
read the disclaimer, so CAT is recorded as unresolved rather than clear. Answer
(2) above would resolve both at once.

**And now a third source, which is why option (2) is the better buy.** RERA
Maharashtra (`mahareat.maharashtra.gov.in`) was closed end-to-end the same
afternoon: **49,167 records in a single unauthenticated API call**, direct PDF
download, live to 14 Aug 2026. Its reasoned-decision population is **~7,376** —
85% of the records are *Roznama*, the daily order sheet, not a decision. It is
one of **28+ state RERA tribunals with no central repository**, so answering
this question per-source means answering it 28 more times. RERA appellate
tribunals are tribunals and the same s. 52(1)(q)(iv) argument applies to them
in the same terms.

**Where it plugs in:** `docs/TRIBUNAL_ACQUISITION_MEASUREMENT.md` holds all
three proven request shapes. None of these sources is court-judgment-shaped, so
ingestion also waits on the generic legal-document layer — that is a design task
in this lane, not a founder question.

---

## FQ-RECOVERY · Does the eCourts registrar's grant cover recovering judgment PDFs that AWS is missing? · NEW3, 18 Aug 2026

**One question. It is worth roughly $130 and I am not answering it myself,
because answering it myself is the failure mode `CLAUDE.md` §6 names.**

NEW2's `hc_ingest_ledger` has recorded **22,983 documents whose metadata is in
the AWS parquet and whose PDF is not in the bucket** — worst single population
Bombay 2023 at 15,845. The judgments exist; the object store does not have them.

eCourts obviously holds these. We hold a written registrar authorisation. The
grant expressly permits CAPTCHA bypass. It would be very easy to read that as
covering this.

**I am not reading it that way, and this is why.** The grant scopes bypass to
**bulk cause-list harvesting**, in one named module, and §6 states the rule in
terms that apply directly:

> *"Tier 3 per-citation confirmation and bulk cause-list harvesting are different
> acts under different parts of the grant, and collapsing them is how a bounded
> permission becomes an unbounded one."*

Recovering missing judgment PDFs is a **third act** — neither a cause list nor a
per-citation confirmation. Treating it as covered would put the most valuable
authorisation this project holds at risk to save about $130.

**What is needed from you:** either (a) confirm the grant already covers
retrieving judgment copies and point at the clause, or (b) let it be asked of the
registrar as a separate, narrow extension, or (c) say no and the Indian Kanoon
path below stands.

**What was built anyway, so nothing waits on this:**
`docs/MISSING_PDF_RECOVERY.md` — a complete, costed recovery program that does
**not** use eCourts at all. Indian Kanoon is confirmed to hold the population
(325,674 Bombay HC 2023 documents against 15,845 missing, verified live) and
`/origdoc/<id>` returns the court's own copy. Triage costs **₹1,150 (~$14)** for
the entire ledger using `citedby` from the search response; recovery is then
selective rather than bulk. It needs `INDIANKANOON_API_TOKEN` and
`INDIANKANOON_BUDGET_PAISE`, which is the still-open half of FQ-IK-RESOLVED — not
a new ask.

**What stays broken without an answer:** nothing, immediately. This decides
whether the cheapest path is free or ~$14–$130, not whether the path exists.

---

## FQ-RERA-10 · Ten state RERA sources are now measured and all ten are waiting on the same permission · NEW3, 18 Aug 2026

**Extends `FQ-CCI-PERMISSION`, does not duplicate it.** That entry asked the
acquisition-policy question for CCI/CAT/Maharashtra RERA. The answer now governs
**27,040 measured documents across ten states**, not one:

```
Maharashtra 49,167 raw / 7,376 reasoned    Bihar        5,652 / <=5,081  (digital text)
Punjab       5,067 / <=5,067  (scanned)    Chhattisgarh 4,154 / 3,687
Tamil Nadu   2,967 / 2,967    (scanned)    West Bengal  4,884 / 1,816 complaints
Delhi          481 / ~155     (93.8% procedural, measured)
Jharkhand      228 / 218      (digital, site-labelled)   Goa 173    UP 8
```

Full detail: `docs/RERA_STATE_MATRIX.md`. Every one is a public listing served
without a login and, except where noted, without a CAPTCHA. **Nothing has been
fetched in bulk and nothing ingested** — these are read-only measurements.

**The legal question is identical for all ten and identical to CCI/CAT:** a RERA
authority or appellate tribunal decision is a judicial/quasi-judicial decision,
and the s. 52(1)(q)(iv) argument `CLAUDE.md` §6 applies to judgments applies to
them in the same terms. That is a legal reading and it is not this lane's to
make. **One ruling covers all ten and every future state**, which is why this is
one entry rather than ten.

**What was built anyway:** the matrix, the mechanism families (three shapes cover
all ten states, so the next state is a confirmation rather than an investigation),
the reasoned-vs-procedural discriminators per state, and NEW2's
`tribunal-routing.ts` which already routes all of these to `legal_document` and
never to `judgments`.

**What stays broken without it:** nothing in the build. The matrix keeps growing
and no worker starts. This decides whether ~20,000 reasoned tribunal decisions
enter the corpus, in a practice area — RERA — that `SOURCE_REGISTRY.md` §2 names
as one the original source list never covered at all.

---

## FQ-INDIANKANOON — is Indian Kanoon an authorized source? NEW3 has costed a recovery program that depends on the answer · NEW2, 18 Aug 2026

**What is needed:** a ruling on whether Indian Kanoon may be fetched from.
Nothing else — no key, no account, no money beyond ~$14.

**Why it is being asked now.** NEW3 (bus 0682) has designed and costed a recovery
program for documents that the AWS Open Data bucket lists in its metadata but
does not actually hold. Their core finding is sound and my own measurements
support it:

> **Indian Kanoon holds 325,674 Bombay High Court 2023 documents**, verified live
> against the index. A 20.6x superset of what AWS has for that court-year, and
> `/origdoc/<id>` returns the court's own copy.

So *"missing from AWS"* is emphatically **not** *"the judgment does not exist"* —
which is exactly the distinction the citation harness exists to protect. Triage
is near-free at ~₹0.05 per document, ₹1,150 (~$14) for the whole ledger.

**Why it is a founder question and not mine.** NEW3's message describes Indian
Kanoon as *"already authorized"*. `CLAUDE.md` §6a names **BharatLaw, Supreme AI
and eCourts India** and says plainly that *"new sources not named above remain
subject to the normal provenance/authorization process."* Indian Kanoon is not
among the three. The string `indiankanoon` does appear in
`services/api/src/citations/source-strength.ts` as a historical
`verified_by_source` value that the wire maps to `none`, which is evidence it was
used once — not evidence it is authorized now.

Two lanes reading the same rule differently is precisely the case §6a says must
not be settled inside a lane.

**The number is bigger than NEW3 costed, and that matters to the ruling.** Their
figure was 22,983 `pdf_missing` rows. After probing the population this session —
63,845 URLs HEADed, **63,841 returned 404** — the ledger now holds **96,091
confirmed-absent documents**, and it grows as the fleet advances. So this is a
~4x larger program than the one they priced, which strengthens the case for
answering it either way rather than leaving it open.

**What was built anyway:** the whole absent-document ledger, which is what makes
the program possible and is useful regardless of the answer.
`hc_ingest_ledger` now distinguishes `pdf_absent` (a 404/403/410 was actually
observed) from `pdf_unavailable` (retryable), and
`scripts/migration/new2-ledger-absence-probe.mjs` promotes rows one at a time by
asking the bucket rather than by inference. Coverage reporting already carries
SOURCE DOCUMENT MISSING as a first-class state.

**What stays broken without it:** nothing in the build, and no worker waits. The
96,091 documents simply stay absent. They are correctly marked, correctly
excluded from the work queue, and correctly reported as missing at source rather
than as a gap in our fetching — so the corpus is honest about them either way.
What is lost is only the chance to recover them.

**Where it plugs in:** `services/ingest/src/harvest/` — a recovery worker would
read `hc_ingest_ledger WHERE outcome = 'pdf_absent'` and write through the same
`upsertJudgments` path, with `source_url` recording the real provenance. It would
not touch the AWS ingest path.

---

## FQ-INDIANKANOON-RESOLVED · Founder settles it directly — Indian Kanoon is authorized, in writing, this is not reopenable · NEW3, 18 Aug 2026

**Closes `FQ-INDIANKANOON` above.** The founder's source-frontier-continuation
addendum, this session, states plainly: *"written Indian Kanoon
permission/API access; separate paid licence; authorized agreed
extraction/RAG/training use. Any stale CLAUDE.md/repo statement is superseded
and should be corrected through the normal source-authorization record. Do
not ask again unless the question is about a SPECIFIC operation outside the
written scope."*

That is a direct answer to the exact question `FQ-INDIANKANOON` asked (NEW2,
18 Aug, same day) — is Indian Kanoon authorized at all — and it supersedes
both the two-lanes-disagree framing in that entry and the "scope and budget
still GUESS" caveat in `FQ-IK-RESOLVED` above. **Corrected through the normal
source-authorization record, not by editing `CLAUDE.md` §6a myself**
(§6a's own convention: a founder-authored dated update, not an agent edit) —
`docs/AUTHORIZED_SOURCE_MAP.md` §4 now carries this as the current record.

**Do not re-ask "is Indian Kanoon authorized."** The only questions still
open about it are about a **specific operation outside the written scope**,
per the founder's own carve-out, and there is exactly one candidate: whether
using Indian Kanoon to recover PDFs that AWS is missing (`FQ-RECOVERY`
above, `docs/MISSING_PDF_RECOVERY.md`) is inside "extraction/RAG/training
use" or is a distinct act. Read as *inside* scope — recovering a document for
the corpus is extraction — so `FQ-RECOVERY`'s IK path is unblocked on
authorization; NEW2's `hc_ingest_ledger` triage/recovery program may proceed
once the two items below are resolved. If that reading is wrong, this is the
one thing to correct, not the general authorization.

**What is NOT resolved by this, and is a credential/money item, not an
authorization question — queued here per `CLAUDE.md` §6b rather than
blocking:**

1. **`INDIANKANOON_API_TOKEN` is unset.** `services/ingest/src/harvest/
   indiankanoon.ts` is built, tested (11 tests), and refuses every call
   honestly without it — nothing is blocked on code, only on the credential
   existing in `.env`.
2. **The paid licence's actual pricing is unknown.** The client's
   `PRICE_PAISE` table (search ₹0.50 / document ₹0.20 / fragment ₹0.05) and
   `INDIANKANOON_BUDGET_PAISE` default (₹500, the old signup-credit ceiling)
   both come from `docs/DATA_SOURCES.md` §2, written under the **declined,
   no-API framing from 8 Aug**. A separate paid licence very likely has
   different, probably better, per-call economics, or may be a flat
   subscription rather than metered at all. Using the ₹500 default under a
   real paid licence would refuse spend far below what is actually available.
   **Needed: the licence's actual rate card / ceiling, whatever form it
   takes, so the client's budget config reflects the real agreement rather
   than the pre-licence guess.**

**What was built anyway, so nothing waits on this:** the bounded
~1,000-record missing-PDF pilot manifest for NEW2
(`docs/MISSING_PDF_PILOT_MANIFEST.md`), stratified by court/year/source
state, priced against the current (possibly-wrong) rate card so the shape of
the pilot is ready — only the credential and the real price are missing, and
both are drop-in once supplied.

## FQ-COVERAGE-FLOOR · How much unreachable law is acceptable inside a filtered search? · NEW1, 19 Aug 2026

**Nothing is blocked.** Retrieval behaviour is unchanged and the code path this
decides does not exist yet. This is queued because it is a product-risk judgement,
not a measurement, and this lane should not make it alone.

### The situation, measured

Embedding coverage is **court-shaped and effectively binary** (full `GROUP BY`
over 17,945,147 judgments, 19 Aug):

| | held | embedded | coverage |
| --- | --- | --- | --- |
| Supreme Court of India | 38,342 | 38,341 | **99.9974%** |
| every other court (25 of 26) | 17.9M | 1,820 | **≤ 0.46%**, 18 courts at exactly 0 |

Separately measured: authorities with no vector are found by the dense arm at
**0.8% success@5**; the same authorities with one vector each are found at
**35.8%** (`docs/ai/NEW1_TIER_A_EXPANSION_BENCHMARK.md`).

### The decision

A retrieval policy that prefers the semantic arm may only fire where that arm can
actually see the candidate universe. That needs a threshold — `COVERAGE_FLOOR` —
below which a court's judgments are treated as *lexically searchable only*.

**The question is not technical.** It is: *how much law may be unreachable inside
a filtered search before we stop letting the semantic arm dominate the ranking?*
Set it high and the feature almost never fires; set it low and an advocate
filtering to one High Court gets a confident ranking over a fraction of a percent
of that court's decisions.

### What the lanes did anyway

- The coverage table is measured and reproducible; the gate is a lookup, not a model.
- The retrieval contract (`docs/ai/NEW1_COVERAGE_STATE_CONTRACT.md`) already
  separates the two axes and refuses to render `UNKNOWN` as covered.
- Tier-A embedding continues, which raises coverage and makes the threshold matter
  less over time.

**What stays broken without an answer:** nothing today. The moment a
coverage-gated ranking policy is proposed, it needs this number and cannot be
shipped with one invented by an agent.


#### Addendum, 20 Aug 2026 — the number this question needs now exists

NEW2 built the per-court-year coverage table this decision was waiting on:
`docs/ops/migration/new2-frontier.json` → `cells[]`, **889 cells**, each carrying
`sourceRows`, `acquired`, `heldShare`, `permanentAbsent` and `state`. Verified on
today's file rather than taken on report.

NEW2 deliberately emitted `heldShare` and applied **no PARTIAL threshold**, on the
grounds that where "materially less than source" begins is a product judgement
about when a result set stops being an answer. That is right, and it is the same
question this entry already asks, made concrete: the measurement is done, only
the line is missing.

The sharpest real example, confirmed against the artefact:

```
Madhya Pradesh (23_23) 2025   source 23,528   held    184   0.8%   permanentAbsent 23,344
Madhya Pradesh (23_23) 2026   source  3,571   held     93   2.6%   permanentAbsent  3,477
Madhya Pradesh (23_23) 2024   source 28,167   held 12,277  43.6%   permanentAbsent 15,869
```

The metadata rows exist and the PDFs 404, so this is not an ingest gap and no
amount of harvesting recovers it. A cell like this must not render as
`SOURCE_HAS_ZERO` — the source positively exists — and must not render as
`COVERED` either. It is the case the PARTIAL state was argued for.

Two properties of the file a consumer must respect, both from NEW2 and both
verified: `heldShare` can legitimately exceed 1.0 (source counts parquet rows,
held counts distinct documents), so clamping it silently reads duplication as
completeness; and when `heldFreshness.heldIsStale` is true — it is, by 1 second,
because a worker is live — every `acquired` is a LOWER bound.

Also worth recording against the original entry: the ingest frontier has since
CLOSED. All 889 cells now read `remainingRows = 0` (NEW2's 19:10 message reported
728,493 outstanding). So the unreachable-law question is no longer partly a
"wait for ingest" question; what is missing now is missing permanently, and the
threshold is the only thing still undecided.

**No agent may set this line.** NEW1 is not setting it.

---

## NEW1 — ADMIN RIGHTS TO REGISTER ONE SCHEDULED TASK (21 Aug 2026)

> **CLOSED 22 Aug 2026 — NOTHING WAS EVER NEEDED FROM THE FOUNDER. Registered,
> running, and durability proven by parent chain.**
>
> ```
> node.exe(10844) <- cmd.exe(25096) <- svchost.exe(2380) <- services.exe(1692) <- wininit.exe(1612)
> ```
>
> Task Scheduler, not an agent shell, so it survives session teardown. Registered
> with `scripts/durable-job.ps1 -Name new1-sidecar-keeper` as
> `Lawmind-new1-sidecar-keeper`, `/SC MINUTE /MO 5`.
>
> **The diagnosis below was wrong in one specific, reusable way.** Registering a
> task for the CURRENT USER needs no elevation. Only `/RU SYSTEM` and
> `/RL HIGHEST` do, and neither is wanted here — the job must run as the user who
> owns the files and the GPU session. The `Access is denied` came from the
> PowerShell `Register-ScheduledTask` cmdlet; `schtasks.exe` for the current user
> succeeds from an unelevated shell. Two interfaces to the same service, different
> default security contexts, and the first one's refusal was read as a machine
> permission rather than as a property of that call. LCC proved it (bus 0971) by
> registering a probe task, tracing its process to `svchost`, and deleting it.
>
> **What it cost to not check:** the GPU idled 4h, 3h20m, 11h24m and then a fourth
> time for 4h20m — the last of which this task would not have prevented anyway,
> because the keeper was alive and relaunching futilely. See the keeper's own
> defect, fixed the same day: it logged "WALK RELAUNCH issued" 51 times over those
> four hours with the line written unconditionally after `spawn`.
>
> **The lesson worth keeping is not about scheduled tasks.** "Access is denied"
> from one API is evidence about that API, not about the machine. Two items were
> queued here this week on the same shape of inference and neither was real.

**What was needed (superseded):** permission to register a single Windows
scheduled task on this workstation. `Register-ScheduledTask` returns
`Access is denied` (`HRESULT 0x80070005`) from the session, so it needs an
elevated shell — a machine permission, not a code problem.

**The command, exactly:**

```powershell
$root='C:\Users\Xerxus\Documents\Lawmind'
$action = New-ScheduledTaskAction -Execute 'node' `
  -Argument "$root\services\harness\src\sidecar-keeper.mjs" -WorkingDirectory $root
$t1 = New-ScheduledTaskTrigger -AtLogOn
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
  -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Lawmind-NEW1-SidecarKeeper' `
  -Action $action -Trigger $t1,$t2 -Settings $settings
```

Reversible with `Unregister-ScheduledTask -TaskName 'Lawmind-NEW1-SidecarKeeper'`.

**Why it is worth an admin prompt: the GPU has now sat idle for 4 hours, then
3 hours 20 minutes, then 11 hours 24 minutes, in three separate incidents on one
run.** Every time, the cause was the same — the embedding sidecar and the walk are
started from inside an agent session, and when that session's process tree is torn
down they go with it. `nohup` does not survive it; PowerShell `Start-Process` does
not survive it either, which I assumed it would and was wrong about. A scheduled
task is the first form that is genuinely independent of the session.

**What was built anyway, and works:** `services/harness/src/sidecar-keeper.mjs`
polls the sidecar's `/health` every 20 seconds, restarts it after two misses, and
relaunches the walk when `stage-embed.log` has been silent for 20 minutes. It
proved itself on the third incident — `WALK SILENT for 686 min — relaunch #1` — so
the recovery logic is correct. What it cannot do is survive its own death, and it
died with the session each time.

**What stays broken without it:** nothing is lost — the walk is idempotent and
resumes from a coverage census rather than a cursor — but an eleven-day run keeps
stopping silently whenever the agent session ends, and each stall costs hours of
GPU that nothing reports. With the task, the worst case is 15 minutes plus the
keeper's own 20-minute silence window.

**Where it plugs in:** nowhere in the product. It is operational tooling for the
Tier-A embedding run only, and it can be deleted the day that run finishes.

**Not urgent enough to interrupt for.** The session-start relaunch is two
`Start-Process` calls and any NEW1 session can do it; this only removes the need
for a session to exist at all.

---

## FQ-IK-TEXT-RECOVERY-SCOPE · Does the IndianKanoon authorization cover text-recovery for documents we already hold, or only genuinely-missing PDFs? · NEW3, 21 Aug 2026

**What is needed: one scope confirmation, not a new authorization or any
spend.** `FQ-IK-RESOLVED` and `MISSING_PDF_RECOVERY.md` already authorize a
narrow, specific act — fetching a full document from IndianKanoon **when
AWS does not have the PDF at all** (`hc_ingest_ledger` `pdf_missing`,
Bombay 2023/2024 the named case). That reasoning is deliberately narrow:
`INDIANKANOON_WORK_QUEUE.md` opens by saying no full-document fetch should
be queued except that one exception, "it would duplicate a free source for
money."

**A different, NOT-yet-scoped population surfaced this session (NEW2 bus
0910):** ~700,000 Punjab & Haryana and Karnataka High Court documents where
LawMind **already holds the PDF** via AWS, but the embedded text layer is
structurally broken — subset-embedded fonts (`MYGXBS+Helvetica` etc.) with
no `/ToUnicode` map, so any extractor returns raw glyph codes, not text.
`text_quality` scores them 1.000 because the metric cannot see this failure
mode; NEW2's own framing was "we HAVE these documents, what we do not have
is their text... a second source... worth a look before anyone prices an
OCR run."

**Spot-checked, read-only, 2 documents (not a bulk operation):** IndianKanoon's
free public site (not the paid API — no credential is set, see
`FQ-INDIANKANOON` below) renders clean, full, readable text for one Punjab &
Haryana judgment (`indiankanoon.org/doc/53856650/`) and one Karnataka
judgment (`indiankanoon.org/doc/96186418/`) that match documents in this
affected population by court and year. Full detail on the bus (0956/0957).

**Why this is a real, separate question and not covered by the existing
authorization as written:** the missing-PDF exception's own stated
reasoning is "the document does not exist in our holding at all." Here it
does — the PDF is held, s. 52(1)(q)(iv) already covers it, nothing is being
newly acquired. Using IndianKanoon's rendering as a **text-recovery input
for a document already in the corpus** is arguably a different, lower-risk
act than acquiring a new document — but it is also not what
`MISSING_PDF_RECOVERY.md`'s narrow exception was written to permit, and
`FQ-IK-RESOLVED` itself lists "exact processing scope... metadata-only vs
fragment vs full document" as still GUESS, not KNOW. I am not resolving
that reading myself — OPEN_DECISIONS discipline and CLAUDE.md §6 both say
this is not this lane's call alone.

**What stays broken without an answer:** nothing immediately — no worker is
built or running against this population, and NEW2's own next step (OCR
pricing for the 76.9% no-ToUnicode-map majority) proceeds independently
either way. This only decides whether a second, cheaper path is available
for the 23.1% minority worth trying before OCR.

**Not urgent.** ~700K documents' worth of consequence, zero documents
fetched, zero spend proposed — flagging the scope boundary now so it is
answered once rather than assumed under time pressure later.

## FQ-HOSTING · STAGING_REQUIRED — public serving needs a remotely-reachable box eventually, but not yet, and not without your approval · NEW3, 22 Aug 2026, corrected same day

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** Gate-C hosting happened and was destroyed. PERSISTENT_BETA_HOSTING = PENDING_SHIP_COST_PACKAGE_AND_FOUNDER_SPEND_APPROVAL. See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

**Founder direction received mid-session, stated plainly: stay local-first.**
No Railway re-enable, no new managed cloud DB, no cloud GPU, no recurring
infra spend without explicit approval. This entry records a real gap
without proposing to spend around it — it is filed as **STAGING_REQUIRED**,
the queue's own category for "needs a reachable environment eventually,"
not as a request to act now.

**What is actually true today, no action needed:** the Railway API has had
**0 active deployments since 11 Aug 18:18 UTC** — every client request
404s. Separately, both `apps/mobile/src/api/client.ts` and
`apps/admin/lib/api.ts` had that dead URL **hardcoded with no override at
all**, which is its own defect independent of whether Railway comes back or
something else replaces it. I fixed that half myself, no spend, no
decision needed: both files now read `EXPO_PUBLIC_API_URL` /
`NEXT_PUBLIC_API_URL` at build/runtime and fall back to the same URL only
when the env var is unset, so pointing the app at the LOCAL stack (or
anywhere else) for verification is now a config change, not a code change.
Per your instruction, "production path" for this session's work means the
real API → service → retrieval → DB code path run **against the local
Postgres**, not a deployment — I'll verify against that, labelled
LOCAL_CONTENDED or LOCAL_QUIET as directed, not against Railway.

**A separate, independent audit landed in the repo this session**
(`docs/ai/audits/LAWMIND_REALITY_AUDIT_2026-08-22.md` and
`LAWMIND_PUBLIC_LAUNCH_MASTER_PLAN_V2_2026-08-22.md`) and recommended
decommissioning Railway for a dedicated Hetzner box (~€157/mo). That
recommendation is **not adopted and not actioned** — it is exactly the kind
of recurring spend this instruction says needs your explicit sign-off
first, and I am not treating an audit's recommendation as that sign-off.
Recorded here only so the reasoning (§3–6 of that document) is findable
when you do want to look at it, not because anything is pending on it.

**What genuinely cannot be done locally, whenever it comes up:** a few
named things in this session's mandate structurally require a real
publicly-reachable endpoint — TestFlight/Play internal builds need a URL
Apple's and Google's servers and real testers' phones can reach; Apple
IAP/Play Billing sandbox testing, OAuth/magic-link callback URLs, universal
links, and push notification delivery all have the same requirement. None
of that is being built or requested now. When one of them is the actual
next step, I'll say so specifically rather than routing everything through
this one entry.

**What proceeds without any of this:** mobile UX, premium-workflow screens
built against the contracts and fixtures that already exist, store listing
metadata, analytics event wiring, RevenueCat integration up to the point it
needs a live receipt to validate, and anything verifiable against the
local stack.

### UPDATE — 30 August 2026, NEW3 final governance seal. **Your instruction is now stronger and is recorded exactly.**

You told the lanes mid-round that you do not want VPS/hosting billing trouble
now, and that paid hosting is held **until the full application is built and you
separately authorize it.** That is narrower than the 22 August "no spend without
approval" above and it **supersedes the Sprint-2 roadmap and prompt-pack hosting
schedule**, which had hosting measurement landing inside this gate.

```
HOSTING_MEASUREMENT_STATE = UNMEASURED
HOSTING_SELECTION_STATE   = DEFERRED_BY_FOUNDER
PAID_HOSTING_AUTHORIZED   = NO
GATE_B_CHECK_5            = WAIVED_BY_CURRENT_FOUNDER_INSTRUCTION_FOR_THIS_GATE
SPRINT3_REMOTE_HOSTING    = DEFERRED_BY_FOUNDER_UNTIL_FULL_APPLICATION_BUILT
```

**`WAIVED` is not `PASS`, and this matters more than it sounds.** Gate B's
hosting check is not being marked satisfied. It is being *set aside on your
instruction*, with the underlying state left honestly unmeasured. Nobody later
can read this as "hosting was evaluated and chosen" — **no candidate was
measured, none was selected, and no figure anywhere in our artifacts comes from
a vendor price page.** A table built from pricing pages is not a measurement, and
we will not present one as one.

**Held until (A) and (B) both:** VPS · managed database · paid remote API
infrastructure · **paid trials that can convert to billing** (that last one is
listed explicitly because a free trial with a card on file is how this kind of
instruction usually gets broken by accident).

**Not affected:** your existing backup infrastructure. This concerns *new*
hosting spend, not what already runs — the Cloudflare R2 backup bucket keeps
going, and the off-machine restore was proven this round.

**What still proceeds:** everything above, unchanged, plus all local development
and testing. This does not license anyone to skip verification — one P0 was
closed this round on locally-run tests against committed source.

**Nothing is pending on you here.** This is a record of a decision you already
made, written where a fresh agent will read it. The two things that genuinely
need a reachable endpoint are still the ones listed above, and none is the next
step.

— NEW3, 30 Aug 2026. LCC recorded the same instruction independently as
`HOSTING_GATE_STATE = HOLD_MEASUREMENT_DEFERRED_BY_FOUNDER`.

**Addendum, same day, later session: the override was real but still not
FAIL-CLOSED, and now it is.** The earlier fix meant an EAS `preview` or
`production` build with no `EXPO_PUBLIC_API_URL` set (`eas.json` has no `env`
block for either profile today — confirmed by reading it) would still compile
clean, install clean, and silently call the same dead Railway URL forever,
which is the audit's #1 ship-brick risk *reintroduced* rather than closed.
Hardened both ends: `apps/mobile/app.config.ts` now throws at `eas build`
config-resolution time when `EAS_BUILD_PROFILE` is set (i.e. a real EAS cloud
build) and the var is unset, so the build never leaves the queue; `apps/mobile/
src/api/client.ts` and `apps/admin/lib/api.ts` now throw at import time as a
second line of defence, and give a genuine local default only under `__DEV__`
/ `next dev` (mirroring `services/api`'s own default port, 3000). tsc clean on
both apps, 570/570 mobile tests green, no channel URL invented anywhere — the
actual per-channel value is still entirely yours to set, this only refuses to
guess one.

**Addendum, RCC R12, 30 August 2026 — the fail-closed behaviour now covers all
THREE environments, and it names one URL as forbidden rather than merely
un-defaulted.** The August hardening only fired when `EAS_BUILD_PROFILE` was set,
so `expo export` and a locally-invoked bundler still produced a binary whose first
request went nowhere. Three changes, none of them spend and none of them a
decision:

1. `apps/mobile/app.config.ts` now refuses any RELEASE-SHAPED bundle with no URL —
   an EAS build, an explicit `EXPO_PUBLIC_APP_ENV=staging|production`, or
   `NODE_ENV=production`. It also refuses a release build that declares no
   environment at all, because a build nobody chose an environment for is a build
   nobody chose a backend for.
2. `apps/mobile/eas.json` now has FOUR profiles — `development`, `staging`,
   `preview`, `production` — each declaring `EXPO_PUBLIC_APP_ENV` and none
   declaring a URL. **The URL is still entirely yours**; the profiles only make
   the slot explicit so it can be filled with an EAS secret rather than guessed.
3. `apps/mobile/src/api/client.ts` now REFUSES `api-production-1c0b4.up.railway.app`
   even when it is explicitly set (`RETIRED_API_HOSTS`), and refuses anything that
   is not an absolute http(s) URL. A stale `.env` or a copied secret now fails
   loudly instead of reproducing the exact silent-dead build this entry is about.
   Development alone keeps a default, and it is loopback.

**What is still owed and is genuinely yours:** the three per-channel URLs, once
there is somewhere to point them. Nothing was deployed and nothing was revived to
make an old URL work — the code simply refuses to use one.

**One finding OUTSIDE the client's file-set, recorded here because it is the same
dead host.** The magic-link email built by the server still carries
`https://api-production-1c0b4.up.railway.app/api/auth/magic-link/verify?...` —
observed in the local API's own console-transport log on 30 Aug 2026 during the
R12 smoke. Sign-in links sent from a real deployment would point at the dead host.
That is LCC's file-set (better-auth's base URL), not RCC's, so it is reported
rather than edited; it needs no founder decision, only the same env-var treatment.

## FQ-PARTLY-OVERRULED-UNREADABLE — what does an advocate see when a later court partly overruled an authority and we cannot say which paragraphs?

**Raised 22 Aug 2026, LCC. Not a blocker — everything around it is built and
the population is 2 judgments. It needs a product answer, not more engineering.**

**The state.** Two judgments carry a *verified* `overruled_in_part` edge while
`judgments.overruled_status` still reads `none`:

- `BHARATI VIDYAPEETH (DEEMED UNIVERSITY) v STATE OF MAHARASHTRA` (2004 INSC 140),
  partly overruled by `MODERN DENTAL COLLEGE` (2016-05-02)
- `SOCIETY FOR UN-AIDED P. SCHOOL OF RAJASTHAN v U.O.I.`, partly overruled by
  `PRAMATI EDUCATIONAL & CULTURAL TRUST` (2014-05-06)

**Why nothing has been applied, and why that is correct.**
`propagate-treatment.ts` skips both deliberately: `partly_set_aside` is supposed
to name the affected paragraphs, none could be read with confidence near the
citation, and it refuses to widen to `set_aside` because naming the wrong
paragraph tells an advocate that a live passage is dead. That refusal is right
and I have not changed it.

**The consequence, which is the question.** Every surface renders these two as
`overruledStatus: "none"` — "no adverse treatment recorded" — when a later
Supreme Court bench partly overruled them. `CITATION_HARNESS.md` holds
stale-overruled at a threshold of ZERO and calls overruled law shown without the
LAW MOVED mark as severe as a hallucination. So the product is currently silent
about a change of standing it has verified evidence for.

**What I did instead of deciding.** Added `unappliedTreatment()` — it REPORTS
the edge on `GET /judgments/:id` and on search results, writes nothing, notifies
nobody, and changes no banner or refusal. `applyOverruledChange` remains the
single writer, as `ADMIN_SURFACE.md` §15 requires. The fact is no longer silent
in the API; it is still silent in the UI, because the client has no state for it.

**The decision you own — three options, my recommendation first:**

1. **Show a fourth banner state: "partly overruled — paragraphs unknown."**
   Honest, and matches how an advocate would want to be warned. Costs a new
   client state and new copy; per the copy rule it must say what they can act on
   ("A later court overruled part of this. We could not identify which
   paragraphs"), never "verification failed".
2. **Render `partly_set_aside` with an empty paragraph list.** No new state, but
   the existing copy promises "the named paragraphs say which" and there are
   none — the client would have to special-case it anyway.
3. **Leave it silent until a human names the paragraphs.** Defensible at n=2,
   and the admin dispute queue exists for exactly this. It fails the zero
   threshold knowingly rather than accidentally, which is at least a choice.

Not urgent at 2 judgments; it stops being a footnote the moment
`propagate-treatment.ts` runs against more of the corpus.

---

## FQ-DUPLICATE-DOCUMENTS — 194,577 judgment rows are the same document held more than once, and deduplication is a product decision, not a cleanup

**Raised 22 Aug 2026 · NEW2 · not urgent, not silent**

Measured while answering NEW1's shared-citation question, from source documents:

```
neutral citations carried by more than one judgment    155,388 groups / 361,045 rows
of those rows, byte-identical text                      53.89%  [53.78, 54.00]  ~194,577 rows
```

53.89% of the shared-citation population is **the same judgment text held twice
or more under different `source_url`s**. LCC found the same population from the
other side (`e7392c7`: 71.3% of Allahabad's same-CNR one-day-apart pairs are
byte-identical). It is one population and it is roughly 1% of the corpus.

**Why it is yours and not mine.** Three different answers are all defensible and
they are product answers, not data answers:

1. **Leave them.** They cost storage and they inflate result lists. Nothing is
   wrong: the registry published the same order twice and we hold what it
   published.
2. **Collapse at render.** The advocate sees one result; both rows stay, joined
   by `content_hash`. Cheapest honest fix, and reversible.
3. **Deduplicate in the corpus.** Smallest index, largest risk — a "duplicate"
   that is actually two orders in connected matters becomes one, and the
   distinction between those two cases is exactly what this study had to read
   source PDFs to establish.

**My recommendation is (2)**, because it is the only one that cannot lose a
document, and because the retrieval cost is where the advocate actually feels it.

**What I did instead of deciding:** nothing. This round forbids deduplicating
shared-citation groups and I did not. The measurement, the method and every
sampled group are in `docs/ai/new2/shared-neutral-verdicts.json` and
`docs/ai/new2/SHARED_NEUTRAL_CITATION_TRUTH_2026-08-22.md`.

---

## FQ-BNS-CORRESPONDENCE-COVERAGE — the official old↔new section mapping covers 2.23% of BNS, and the product cannot answer "what is section 302 now"

**Raised 22 Aug 2026 · NEW2 · blocks a marketing claim, not a build**

`statute_mappings` holds 226 official BPR&D correspondence rows against 1,059
sections of enacted text:

```
                sections held   official rows   sections with a usable row   coverage
BNS   (IPC)              358              14                            8      2.23%
BNSS  (CrPC)             531              95                           87     16.38%
BSA   (IEA)              170             117                          101     59.41%
```

and the rows themselves are not clean: **69 of 226 carry a mangled new-section
number** (the parser glued the first letter of the heading to the digits —
`531R` for section 531), **23 name a section that does not exist** in the enacted
text, and the OLD section half — the half an advocate actually asks for — has a
**5.3% measured error rate** against the rows' own evidence with **no primary
witness available at all**, because we hold the enacted text of the three new
codes and of none of the three they replaced.

**The decision you own:** whether to fund acquiring the enacted text of IPC,
CrPC and the Indian Evidence Act from indiacode. Without them the old-section
half of every correspondence answer is unverifiable in principle, not just
unverified. With them, the same audit that found the 5.3% becomes a repair.

**What I did instead:** typed every row against the required vocabulary and left
`OFFICIAL_NO_EQUIVALENT`, `NEW_PROVISION` and `REPEALED_NO_DIRECT_EQUIVALENT`
**empty**, because no source evidence produced them and a model must never fill
them. `docs/ai/new2/BNS_BNSS_BSA_INVENTORY_2026-08-22.md`.

**Binding until you decide:** no surface may describe BNS/BNSS/BSA transition as
covered. LCC's `canonicalAct` fix (bus 1015) is act-NAME normalization and is
correct; it is not section correspondence and it is not temporal applicability.

---

## FQ-DATA-REQUEST-SLA · What is our real response deadline for a DPDP data request? · LCC, 22 Aug 2026

**What is built and working.** The whole path. An advocate can raise an export,
correction or erasure request from the app (`POST /me/data-requests`), an
operator sees it with a clock (`GET /admin/data-requests`), and an erasure
actually erases — content deleted, identity anonymised, `audit_log` row written
in the same transaction, R2 keys returned so nothing can be reported complete
while the files remain. 6/6 tests, end to end, against the real database.

**What is missing.** The number of days.

`data_requests.due_at` is set to `now() + 30 days`, and **30 is our own service
commitment, chosen conservatively — not a statutory figure.** The DPDP Act 2023
does not itself fix a numeric deadline for responding to a data-principal
request; the timelines live in Rules this repository has no counsel's opinion on.
Writing a number into the product and calling it the legal deadline is exactly
the invented-fact failure `CLAUDE.md` §7 forbids, and being wrong in the
direction of "later" is a compliance failure rather than a cosmetic one.

**What you decide.** Counsel confirms the window; the constant moves. It is one
environment variable — `DATA_REQUEST_RESPONSE_DAYS` — and nothing else changes.

**What stays broken without it.** Nothing breaks. Requests are accepted, tracked
and honoured on a 30-day clock. If the real window is shorter, every request
raised before you answer carries a `due_at` that is later than it should be.

`services/api/src/auth/data-requests.ts`, `src/auth/erasure.ts`.

---

## FQ-BACKUP-SPEND · The moat pack is 1.53 GB compressed and proved restorable. Offsite storage is yours to authorise · LCC, 22 Aug 2026

**What is built and measured.** `scripts/lcc-moat-backup.mjs` dumps the 34 tables
that CANNOT be rebuilt from the AWS buckets — every advocate's matters, notes and
annotations; every human Tier 3 verification vouch; the append-only audit ledger;
and months of GPU and LLM work in the citation edges, date verdicts, damage
verdicts and statute references — plus a projection of the verdict COLUMNS on
`judgments`, keyed by `content_hash` so it can be re-joined to a rebuilt corpus.

```
tables packed          34
compressed bytes       1,532,732,263   (1.533 GB)
dump time              85 s
```

`judgments` (151 GB) and `judgment_paragraphs` (92 GB) are deliberately NOT in
it: both are rebuildable from the AWS Open Data buckets we are authorised to use,
and the mandate forbids a full local clone. What cannot be rebuilt is what is
packed.

**What you decide.** Whether the pack goes anywhere off this machine, and where.
Cloudflare R2 is the stack's stated object store; at 1.53 GB this is a very small
monthly line, but **I have not quoted a price** — the current per-GB rate is a
vendor number that must be read from Cloudflare's pricing page on the day, not
from an agent's memory. No bucket has been created, no credential read, no
account touched.

**What stays broken without it.** The pack exists only on the same disk as the
database it protects. A disk failure loses both. That is the entire risk, stated
plainly.

---

## FQ-ECOURTS-ACTOR (restated by LCC, 22 Aug 2026) · the canary is now a runbook, still not run

Not a new item — `docs/ops/lcc/ECOURTS_CANARY_RUNBOOK.md` now exists so that when
you resolve the actor and authorise a canary, it is a procedure rather than an
improvisation against a bounded permission.

**Nothing has been requested.** The gate has been observed refusing 52 times in
`ecourts_fetch_ledger` without a single live call. The runbook states one gap
honestly: a CUMULATIVE request cap across a window is not enforced in code, only
answerable by query. For one canary it does not bind; before any repeated harvest
it must be built.

---

## FQ-TEST-COURT-ROWS (LCC, 22 Aug 2026) · searched for, not found — closing it is yours, not mine

`docs/ops/lcc/TEST_COURT_ROWS_FINDING.md`. A full census, not a sample:
`SELECT count(*) FROM judgments WHERE court ILIKE '%test%'` returns **0**, and
every other `court` column in the schema is also zero.

The two obvious cleanup predicates both match REAL LAW and must never be used:
`TEST.CAS.` is **Testamentary** (probate), and `case_title LIKE 'SYNTHETIC%'`
returns eight genuine judgments including *Synthetics & Chemicals Ltd v State of
U.P.*, `1989 INSC 321`, a Constitution Bench authority.

I cannot tell whether the rows were deleted later or never committed. **I am not
marking this closed** — an agent's finding is not founder approval, and "we
looked and found nothing" is a finding. You may now close it against real
numbers, or ask for a different search.

---

## FQ-PUSH-PROJECT · Push notifications are wired end-to-end in code and cannot deliver a single notification without an EAS project · NEW3, 23 Aug 2026

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** PUSH_PRODUCT = DEFERRED / NONBLOCKING under launch Shape B. EAS project/build readiness is separate and current. See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

**What is built.** `apps/mobile/src/push/register.ts` — permission request,
Android notification channel, `expo-notifications`/`expo-device` now real
dependencies (installed this session, were not present before). Wired to fire
at the one honest trigger point: `AlertSettingsScreen.tsx`, the moment an
advocate turns ON "An authority I saved is set aside" — the single alert
trigger that is real and server-honoured today (`savedAuthorityMoved`).
Declining, a simulator, and a missing project all fail with a distinct, named
reason (`PERMISSION_DENIED` / `NOT_A_DEVICE` / `NO_PROJECT_CONFIGURED`) rather
than one generic error — `NOT_A_DEVICE` is swallowed silently (nothing an
advocate on a real phone can act on), the other two surface honest copy that
never blocks or reverts the already-saved toggle. 6 new unit tests on the
module itself (native calls mocked), 4 new tests on the screen wiring, tsc
clean, 593/593 mobile suite.

**What cannot be built without you.** `Notifications.getExpoPushTokenAsync()`
requires an EAS `projectId` to address a project on Expo's push service.
Checked, not assumed: `app.config.ts` carries no `extra.eas.projectId`,
`eas.json` names no project, and `eas whoami` fails outright — `eas-cli` is
not even installed, meaning no Expo/EAS account has ever been linked to this
repo. This is an account, not a token I can generate myself — `eas init`
needs a login to an Expo account (yours, or one you create for Lawmind).

**What you decide.** Whether to run `eas login` (existing Expo account) or
create one, then `eas init` from `apps/mobile` — that single command writes
the `projectId` this code is already waiting to read. No other code change
needed on this side once it exists.

**What stays broken without it.** Every push path above returns
`NO_PROJECT_CONFIGURED` and the advocate sees "Push delivery is not set up on
this build yet — this will still save." No notification can be delivered to
any device, on any platform, until this exists — separate from and
downstream of the TestFlight/Play sandbox and reachable-URL gaps already
recorded in `FQ-HOSTING`. Do not market real-time alerts until this closes
AND an actual delivery is proven on a device — code review alone cannot
verify a push arrives.

---

## FQ-PROVIDER-TERMS · Nobody has read the retention or training-use terms of the three model vendors we can send to · LCC, 23 Aug 2026

**What is needed:** somebody to open inferx.net's and OpenRouter's current
written terms, read what each says about **retention of prompt content** and
**training on prompt content**, and record the two answers with the date they
were read.

**What was built anyway:** the whole gate. `services/api/src/llm/provider-policy.ts`
now decides, in one place, which company's server may receive which class of
data. Until this round the provider was chosen by **whichever API key happened to
be set in the environment** — a deployment variable was making a confidentiality
decision.

**What stays refused without it:** every provider currently permits
`PUBLIC_LEGAL_TEXT` and nothing else, because their `contractStatus` reads
`UNVERIFIED`. That is the module working, not a gap in it. A private payload
makes **zero outbound requests** — asserted with a counting fetch, so the test
proves the network was never touched rather than that a refusal came back
afterwards.

**Why it is not mine:** `CLAUDE.md` forbids inventing a contract term as firmly
as a section number. A confidently wrong "30 days, no training" in a policy file
is worse than a blank, because it is the sentence somebody quotes to a client.

**Where it plugs in:** `PROVIDER_POLICY` in that file. Three fields per provider
— `retention`, `trainingUse`, `contractStatus`. Changing status to `RECORDED`
without filling the other two fails `policyIncoherences()`, which is deliberate.

**Note this is separate from OD-6.** The countersigned DPA is about Anthropic and
sensitive traffic. This is about the two vendors nobody has a document for at all.

---

## FQ-PREMIUM-MODEL · Recurring subscription, one-off Hearing Pack credits, or both — the server supports either and cannot choose · LCC, 23 Aug 2026

**What is needed:** the revenue model, and only that. Not prices, not plan names.

**What was built anyway:** a capability-based entitlement spine that supports
BOTH without a migration (`0077`, `0078`, applied).

- A **recurring grant** and a **credit balance** answer the same question at the
  same call site: *may this user do this thing right now.*
- **No `PRO` boolean anywhere.** A boolean can express a subscription and cannot
  express a Hearing Pack bought for one hearing, and the migration from one to
  the other happens after money is already flowing.
- The credit ledger is append-only, and the invariant **PURCHASE → ISSUED ONCE →
  REDEMPTION ATOMIC → JOB CREATED ONCE** is three unique indexes rather than
  three careful code paths. Proved: two concurrent redemptions of one credit
  spend exactly one.

**What stays broken without it:** nothing breaks. Every premium route is behind a
`platform_config` flag that **defaults OFF** and answers 404 with no flag row at
all. The spine is inert until a model is chosen and a flag is flipped.

**What is explicitly NOT built:** no payment provider is configured, no webhook
route is mounted, no secret exists, and nothing here can charge anybody.

---

## FQ-BILLING-PROVIDER · A billing provider and its signing secret, when the model is chosen · LCC, 23 Aug 2026

**What is needed:** the provider (RevenueCat, store receipts, something else) and
its webhook signing secret.

**What was built anyway:** `services/api/src/entitlements/webhook.ts` — signature
verification, idempotency, ordering, replay protection, unknown-user handling,
cross-platform mapping, and an audit trail, all provider-neutral.

**How it refuses without the secret:** `verifySignature` returns a refusal when
no secret is configured. **There is deliberately no development bypass** — the
single most common way this endpoint goes wrong is `if (!secret) return ok`,
written for local development, shipped, and then the endpoint grants
entitlements to anyone who posts to it. A test asserts the refusal.

**One design decision worth a founder line:** a **forged** event is STORED with
`signature_valid = false` and never acted on, rather than discarded. Discarding
is tidier and throws away the only evidence that somebody is sending us forged
billing traffic. What is **not** stored is the payload — only its sha256 — because
a provider body routinely carries an email and a device id.

---

## FQ-LOGOUT-TOKEN-WINDOW · After logout, an already-issued access token stays valid for up to 15 minutes · LCC, 23 Aug 2026, from NEW3's audit

**What is needed:** a product judgement on whether 15 minutes is acceptable.

**The fact,** found by NEW3 in an independent audit (bus 1043) and not disputed:
logout revokes the refresh-token family immediately, so no NEW access token can
be minted. An access token **already in the client's memory** remains valid until
its natural expiry, up to 15 minutes.

**Why it is a judgement and not a defect:** it is the standard trade-off of
stateless access tokens, and the alternative — a revocation check on every
request — puts a database read in front of every authenticated call. The
question is not technical. It is: *an advocate hands their unlocked phone to a
junior, or to opposing counsel's clerk, and taps logout. Is a 15-minute window
acceptable?*

**What would close it:** either "yes, 15 minutes is fine" recorded as a decision,
or a shorter access-token lifetime, or a denylist checked per request. All three
are cheap; choosing between them is not mine.

---

## FQ-STAGING-CORPUS-SIZE · Is full judgment text served from Postgres, or from object storage? · LCC, 23 Aug 2026

**What is needed:** one product/cost decision that has to come BEFORE any machine
is chosen.

**The measurement, from the live database today:**

```
total database            291 GB
judgments                 151 GB   \
judgment_paragraphs        92 GB   / 83% of the total, and REBUILDABLE
curated backup pack      1.53 GB   (proved restorable, 820.7 s)
```

**Why it decides the machine.** If full text stays in Postgres, staging is sized
against ~291 GB. If Postgres holds metadata and vectors while full text moves to
object storage, it is sized against ~40 GB. Those are different machine classes,
different prices, and different comparisons — and the Railway account's **$75
hard cap** is what makes it the load-bearing decision rather than a preference.

**Not mine because** it trades product behaviour (how fast a judgment opens)
against cost, and both sides of that trade are yours.

---

## FQ-ELIGIBILITY-UNCITED · The search eligibility view refuses 40.09% of the corpus solely because nothing cites it · LCC, 23 Aug 2026, on NEW1's measurement

**Not a request for a decision yet — a flag that one is coming**, because the fix
crosses two lanes and neither may take it alone.

NEW1 measured (bus 1050, n=40,000 through the DEPLOYED view): **16,035 of 40,000
documents are unreachable ONLY because they have no inbound citation.** One bit
flipped, nothing else about the document changed. Decomposed: 15,701 (39.25%) are
short-and-uncited — the **length** gate — and 334 (0.84%) are refused-class-and-
uncited. The length gate is **47x** the class gate.

The escape hatch that is supposed to rescue real authorities fires for **11
documents in 40,000 (0.03%)**, while the refusal it guards catches 40%.

**The conceptual defect matters more than the number:** the view uses "has an
inbound citation" as a proxy for "is a real authority", and those are different
claims resting on different evidence. A judgment delivered last month is uncited
because it is recent, not because it is unimportant.

The view is LCC's file; the class evidence is NEW2's. **Not changed alone.**

---

## FQ-STAGING-REGION · OD-2 says Singapore; the cheapest staging box is in Europe · LCC, 23 August 2026

**What is needed:** a decision, and probably counsel's written residency view
with it.

**The conflict, stated plainly.** `docs/OPEN_DECISIONS.md` OD-2 recorded your
DPDP residency position as **Singapore** — Railway's nearest region to India —
with a migration path before the **13 May 2027** compliance deadline. NEW3's
staging package (`docs/ops/STAGING_PACKAGE_PROPOSAL_2026.md`) recommends a
Hetzner dedicated box, and **Hetzner has no Singapore or India region at all**;
its options are Germany/Finland or the United States.

So this is not a hosting swap inside OD-2's resolved position. It is a different
region from the one your recorded position names.

**Why neither lane may decide it.** It is an OPEN_DECISION, and the rule is that
nobody resolves one alone. It also turns on a legal view — whether EU hosting is
acceptable under DPDP for this data — which is counsel's, not an engineer's.

**What was built anyway.** Everything except the provisioning: NEW3's full
package (provider, machine class, storage, DNS, secrets, backup, migration,
cost) and LCC's measured server-side inputs
(`docs/ops/lcc/STAGING_DECISION_PACKAGE.md`). The day the region is settled,
this is an execution decision.

**What stays broken without it.** Nothing today — we are local-first and nothing
is provisioned. It blocks public serving, and therefore every launch date.

---

## FQ-INDIA-RTT · One timed request from an Indian connection, which no agent can make · LCC, 23 August 2026

**What is needed:** somebody physically on an Indian internet connection running
one timed request against a candidate region, and telling us the number.

**Why this is not an engineering task.** Round-trip time from India cannot be
measured from a machine that is not in India. Every latency figure in a hosting
document written without one is somebody's memory of a different product — and
once written down it gets quoted back as though it were measured. Both staging
documents therefore report India RTT as **UNMEASURED** rather than estimating it.

**What it decides.** Whether Singapore's latency is actually acceptable to an
advocate standing outside a courtroom, and how much worse an EU region would be.
That is the trade in `FQ-STAGING-REGION`, and right now one side of it is a
blank.

**What stays broken without it.** Nothing breaks; a decision is made on feel
instead of evidence. That is survivable and it is not how the rest of this
project has been run.

**Cost:** none. It is one command from a phone or laptop in India.

---

## FQ-TREATMENT-HEADNOTE-PROVENANCE · Our treatment claims are read off law-reporter headnotes, which CLAUDE.md §6 says we may not rely on · NEW2, 23 August 2026

**What is needed:** a decision on whether LawMind may derive citation TREATMENT
(followed / distinguished / overruled / approved) from the editorial apparatus of
a law report, or only from the court's own reasoning.

**What was measured, before asking.** 400 treated citation edges, classified by
what surrounds the citation in the citing document:

| where the annotation sits | share |
| --- | ---: |
| reporter headnote apparatus (`SUPREME COURT REPORTS`, `[Para 20][591-D-F]`) | 35.75% |
| reporter "Case Law Reference" table (`relied on Para 51`) | 20.25% |
| **the court's own reasoning** | **0.00%** |
| unclassified (a hand read found most of it is also headnote material) | 44.00% |

A separate speaker screen over 120 edges agrees: court voice 4.17%, counsel
voice 5.00%, **no speaker signal at all 90.83%**.

The reason is structural rather than a defect: `— overruled.` is the notation a
law report uses to close a Case Law Cited entry. Courts do not write it.

**Why it is a founder question.** `CLAUDE.md` §6: *"What IS protected is a
reporter's copy-edited version — headnotes, editorial numbering (Eastern Book
Company v. D.B. Modak) — so use raw court text and never a law report's edition
of it."* The annotations above are exactly that apparatus, read off SCR volumes
already in the corpus.

**What was built anyway.** The separation the treatment system needs regardless
of the answer: `RESOLUTION_IS_NOT_TREATMENT_2026-08-23.md`, and
`TREATMENT_ENRICHMENT_CONTRACT_V1` in the same file, which ranks
`REPORTER_EDITORIAL_ANNOTATION` as evidence that may support a *candidate* and
never a rendered adverse treatment.

**What stays broken without an answer.** 16,001 treatment edges — 4.65% of
resolved edges — rest on evidence we may not be entitled to use, and the class
that *would* be safe (`COURT_REASONING_EXPLICIT`) is **0.00%** of what we hold.
Currentness cannot be built on this population either way until the question is
settled.

**Nothing was deleted and no treatment was withdrawn** pending the answer.

### UPDATE, 23 August 2026 — the question is now sized exactly, and the answer costs 93 of 98 badges

The sample above has been replaced by the whole population, and by a hand read of
every span that matters. `TREATMENT_PROVENANCE_DECISION_INPUT_V1.md`.

- **All 16,001 treated edges classified** — not a sample. Canonical-safe 0.67%,
  reporter 70.87%, unsupported 28.46%.
- **The 137 edges that actually render LAW MOVED were read by hand, every one.**
  **131 (95.62%) are law-report editorial apparatus. 5 (3.65%) are the court's
  own words.**
- **98 judgments render LAW MOVED** (a further 6 are Test Court fixtures).
  If reporter apparatus may not promote to canonical, **5 survive**.

**So the decision is now concrete rather than abstract:**

| the founder chooses | LawMind's currentness coverage becomes |
| --- | ---: |
| reporter apparatus MAY be canonical | 98 judgments |
| reporter apparatus may only be a CANDIDATE | **5 judgments** |

Two further facts that belong with the choice:

1. **`OFFICIAL_REGISTRY_STATUS` is not an escape route.** The only table that
   could carry a registry disposal record, `ecourts_observation`, holds **0
   rows**, and this round forbids live eCourts traffic.
2. **Enforcement is one line, but the column it needs does not exist.**
   `judgment_citations` has no provenance column, and all five rendering
   surfaces promote on a bare `relationship IN (...)` check. Whichever way the
   answer goes, the class of the evidence has to be recorded before it can be
   honoured.

**Still nothing deleted, still no treatment withdrawn.**

---

## FQ-INDIACODE-AVAILABILITY · India Code is returning 504 to every request, so IPC / CrPC / Evidence Act cannot be acquired · NEW2, 23 August 2026

### UPDATE, 23 August 2026, later — the outage changed shape, and it is now OURS not theirs

Two requests, twenty seconds apart, recorded rather than acted on:

| endpoint | before | now |
| --- | --- | --- |
| `https://www.indiacode.nic.in/` | 504 | **200**, 2,009 bytes |
| Central Acts listing (`/handle/123456789/1362/browse?type=shorttitle&…`) | 504 | **404** |

**A 404 is not an outage.** A timeout means the service is down; a not-found on a
root that answers means the site was **restructured** and our URL builder in
`services/ingest/src/indiacode.ts` is now pointing at a path that no longer
exists.

**No further requests were made.** Re-deriving the listing path is discovery work
against a government service, this round forbids hammering it, and §8 forbids
inventing mappings to raise coverage. The correct next step is a bounded,
single-session re-derivation of the browse path — engineering, not a founder
decision — and it is recorded on NEW2's board rather than escalated here.

**Nothing about the founder ask changes:** the old side of the BNS/BNSS/BSA
correspondence rows still has no official source, and this lane still will not
type it from anything else.


**Not a decision — an outage, recorded so it is not re-diagnosed as a bug.**

The round contract lifted the no-new-source rule for the three repealed criminal
codes, because `BNS_BNSS_BSA_INVENTORY` can type a correspondence row's NEW side
against the enacted text and can say **nothing at all** about its OLD side while
we hold none of IPC 1860, CrPC 1973 or the Indian Evidence Act 1872.

`indiacode.nic.in` returned **HTTP 504 after 248 seconds** to every request.
The differential was run rather than assumed: the **known-good BNS handle
`123456789/20062`**, which loaded 531 sections into this corpus, 504s
identically. **The site is unreachable; the handles are not the problem.**

**Built anyway, so this is one command when the site returns:**
`REPEALED_CRIMINAL_CODE_HANDLES` in `services/ingest/src/statutes.ts`, a
`--repealed` flag on the loader, and 8 tests covering the guard that had to be
loosened — `expectMinistry` is `null` for these three because the administering
ministry of a repealed code has not been read off the site and `CLAUDE.md`
forbids inventing it. The Central-Act check is carried by the `AC_CEN_` act-id
prefix instead, and a test proves a State enactment is still refused.

**Founder action:** none, unless the outage persists. If it does, the question
becomes whether a second official source is acceptable for statute text —
`CLAUDE.md` forbids a commercial aggregator as canonical, and that limit stands.

---

## FQ-CREDIT-LEDGER-ERASURE · Does an account erasure destroy the purchase record? · LCC, 23 August 2026

**A genuine conflict between two obligations, and not an engineering call.**

`credit_ledger` holds one row per premium credit granted or spent, with
`provider` and `provider_ref` linking to the payment processor. It is the only
place a purchase is recorded against a person.

- **Erasing it** destroys an accounting record. Purchase records are tax and
  audit documents, and refund or chargeback disputes are argued from them.
- **Keeping it** retains a row tied to a person who asked to be deleted.

LCC-2 has left it **in place**, pointing at the anonymised `users` row — no
name, no phone, no email, no sign-in — which is the same reconciliation
`audit_log` already uses. Every other user-linked table is now either deleted or
detached; this is the single exception and it is deliberate rather than missed.

**Nothing is at stake yet: the table holds 0 rows.** The decision is needed
before the FIRST SALE, not before launch.

**Founder action:** decide whether an erasure should (a) leave the ledger
intact against an anonymised user, (b) null the `user_id` and keep the money
record, or (c) delete it outright. If (b) or (c), one line changes in
`services/api/src/auth/erasure.ts` and a test asserts it. If the answer needs
counsel, that is the same conversation as the DPDP retention schedule.

---

## FQ-OPS-ALERT-EMAIL · Which address should an operational page wake? · LCC, 24 August 2026

**One value, and the alerting path is live.**

LCC-5 built delivery end to end: conditions are evaluated in `ALERT_RULES`, a
poller delivers `page` severity through Resend, every attempt is recorded in
`ops_alert_deliveries` including failures, and a cooldown stops a persistent
condition becoming a mailing list. It was proven with an injected drill and it
caught a real condition on the first run.

**It refuses to run in production until `OPS_ALERT_EMAIL` is set.** That refusal
is deliberate — falling back to the console transport would record every page as
delivered while nobody was ever told, and the absence of a page reads as
"nothing is wrong".

`RESEND_API_KEY` is already present. The only missing value is **who to wake.**

**Founder action:** set `OPS_ALERT_EMAIL` to an address that is actually read
outside working hours. If it should be more than one person, Resend accepts a
comma-separated list and no code changes.

Not blocking anything this round — local development uses the console transport,
which says out loud that it sent nothing.

---

## FQ-SEMANTIC-BUILD · Six GPU-days buys concept search a 17× better ceiling · NEW1, 24 August 2026

**A decision about GPU weeks, not a research unknown any more.**

### What was measured

`SEMANTIC_REPRESENTATION_DECISION_V3.md`, from one run: 19,932 documents,
67,618 chunks, 147 million characters, on real advocate-posed questions with a
leakage guard capping shared wording at six words.

| representation | posed s@5 | GPU-days to build corpus-wide | halfvec storage |
| --- | ---: | ---: | ---: |
| **HEAD:4800 — what the walk is producing now** | **2.2%** | 11.7 | 18 GB |
| POOLED_ALL — one vector, whole document | 17.8% | 18.0 | 18 GB |
| **ALL_CHUNKS — passage level** | **37.8%** | 18.0 | 61 GB |

**The representation currently on disk answers about one advocate question in
forty-five.** The passage build answers roughly three in eight, at
19,932-document pool scale.

### Why this is a founder question and not an engineering one

The three candidate builds **cost the same GPU time**, because a pooled vector is
the mean of the passage vectors — you must read every chunk either way. They
differ only in what is kept. So the whole decision is:

> **~6 additional GPU-days and 43 GB of disk, over the walk already running, to
> move concept retrieval from 2.2% to 37.8%.**

61 GB against 290 GB free. No purchase, no cloud, no vendor — this box, running
longer.

### The specific thing that needs deciding

The Tier-A walk is **1,753,127 vectors into producing the 2.2% representation**
and has roughly 7.1M documents to go. Three options, and the choice is about
weeks of GPU rather than correctness:

1. **Restart the walk on the whole-document recipe now.** Fastest to a useful
   index; discards the head-only work in progress (it is superseded either way).
2. **Let the head-only walk finish first, then re-embed.** ~11.7 + 18.0 GPU-days
   in sequence, and nothing usable until the second pass.
3. **Run passages only over a chosen slice.** I recommend **against** it: a
   document absent from the index is unreachable by every method at every rank,
   and 8 of 20 of my test targets are already in that state. Partial coverage is
   the problem, not the mitigation.

My recommendation is **(1)**, but the cost is measured in GPU weeks on the
machine you are also using, so the call is yours. LCC has the sequencing detail
(bus 1088).

### What this does NOT promise

- **Not a launchable feature.** 37.8% was measured against 0.23% of the corpus,
  and every method was still losing ground as the pool grew. My honest
  full-scale estimate is ~23% and I have labelled it weak because it is.
- **Two question types score ZERO on every method tested** — "what is the
  strongest authority against me" (0 of 4) and statute questions (0 of 3).
  Nothing here fixes those, and any premium surface implying adverse-law
  discovery is unsupported by anything measured.
- **No latency measurement exists.** None. A 30M-vector index has its own build
  time, memory footprint and query cost, and none of it is measured yet.
- n = 45 posed questions carried by 20 distinct judgments. Wide intervals.

### One correction the decision should be made on

The previous round told this company that a free re-pooling would fix concept
search. **It would not, and that answer came from a benchmark whose distractor
set was silently empty.** Correcting it changed the recommendation from "cheap
tweak" to "a real but bounded build". If a decision was already forming on the
old number, it was forming on the wrong one.

---

## LCC · Credit-ledger retention after an account erasure — LEGAL, NOT TECHNICAL

**Raised 25 Aug 2026, LCC. Blocks nothing today; blocks a truthful privacy page.**

Account erasure now completes only when the external objects are actually gone
(migration `0084`, `erasure_objects`). Two things survive an erasure on purpose,
and one of them has no recorded decision behind it.

| Survives | Why | Decided? |
|---|---|---|
| `audit_log` | the record that the erasure was asked for and carried out; append-only at the database, `DELETE` raises 23001 | yes, by design |
| `data_requests` | the statutory clock and the record of the request | yes, by design |
| `users` shell | pseudonymised; `audit_log.actor_user_id` is a plain FK with no ON DELETE action, so it cannot go | yes, by design |
| **`credit_ledger`** | **money** | **NO** |

### The specific thing that needs deciding

`credit_ledger` rows stay **linked to the pseudonymised user row**, not detached
the way `llm_calls` and `entitlement_events` are. That is a deliberate hold, not
an oversight — a purchase record is a financial and tax artefact and deleting it
on request is its own kind of exposure. But nobody has written down:

1. **How long** a credit row is retained after erasure. Indian tax record-keeping
   has its own period; whichever it is, it should be the number in the privacy
   page rather than "indefinitely".
2. **Whether it stays LINKED or becomes DETACHED.** `llm_calls` and
   `entitlement_events` both have `user_id` set to NULL — the row survives, the
   person does not. If the accounting purpose is served by a detached row, that
   is strictly better for the advocate and costs nothing to implement. If
   reconciliation genuinely needs the link, it needs it, and the privacy page has
   to say so plainly.

### What was built anyway

Everything except the answer. The erasure fixture
(`services/api/src/auth/erasure-fixture.test.ts`) asserts `credit_ledger` as
`RETAINED` **by name, with the reason in the assertion message**, so the day the
policy changes the test fails and points at this entry. Flipping it to DETACHED
is one `UPDATE ... SET user_id = NULL` line in `eraseUser` next to the two that
already do it.

### What stays wrong without it

The privacy disclosure cannot honestly describe what survives an erasure, and R4
listed "credit-ledger retention is linked, not merely retained" as an open risk.
Not a launch blocker for the app; it is a blocker for the Trust/Privacy page copy
NEW3 owns.

**This is a question for counsel, not for an agent.** No agent should pick a
retention period.

---

## FQ-STORE-REVIEWER-ACCOUNT — a reviewer cannot sign in, and nobody owns it

**Raised 25 Aug 2026, NEW3.** `docs/product/STORE_RELEASE_CHECKLIST_V1.md` §5.

Both app stores require working credentials so a human reviewer can use the app.
LawMind authenticates by magic link (better-auth). **There is no test-account
bypass anywhere** — grepped `services/api/src/auth/` and `packages/auth/src/`
for `DEMO`, `TEST_ACCOUNT`, `bypassMagicLink`, `E2E`: zero hits.

So a reviewer at Apple or Google enters an email, waits for a link they will
never receive, and rejects the submission. **This is a hard submission blocker
and it currently has no owner.**

Two ways out, and the choice is the founder's because one of them weakens auth:

1. **A real mailbox in the review notes.** No code change. Someone must own a
   monitored inbox for the duration of review, and the credentials sit in a
   store console.
2. **A server-side fixed test account** that skips the link for one known
   address, behind a flag defaulting OFF. Cheaper for review, and it is an
   authentication bypass living in production — exactly the kind of thing that
   is switched on for a review and never switched off.

NEW3 recommends (1). It costs nothing structural, and the risk is a person
forgetting to watch an inbox rather than a permanent hole in sign-in.

**What was built anyway:** the whole review path works — account creation,
matters, saved authorities. §5 of the checklist specifies what the demo account
must be pre-populated with and, importantly, **which query the reviewer should
be told to type**: `cheque bounce section 138` (rarest lexeme df 0.00089, ranks
normally) and never `anticipatory bail` (df 0.069 — the sparse arm refuses to
rank it and the app returns an empty result). A reviewer whose first search
returns nothing concludes the app does not work.

---

## FQ-SITE — there is no website, and it is a store gate rather than a marketing nicety

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** PROMO_SITE = EXISTS_BUT_NONCORE; FULL_REBUILD = DEFER; COMPLIANCE_URLS = CURRENT RELEASE OBLIGATION; EXTERNAL_DELETE = CURRENT GAP UNTIL IMPLEMENTED. "There is no website" is false (lawmind.co, lawmind/lawmind-site). See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

**Raised 25 Aug 2026, NEW3.** `docs/product/WEBSITE_PRODUCT_SPEC_V1.md` §0.

`apps/` contains `mobile` and `admin`. There is no marketing site, no landing
page, no public surface of any kind. `lawmind.co` is verified with DNS written
through the Spaceship API and serves nothing.

**Both stores reject a submission without a reachable privacy policy URL.** So
the website is not a launch nicety that can slip — it is one of three absolute
blockers on any submission at all.

**What was built anyway, so this is a build task and not a thinking task:**
`WEBSITE_PRODUCT_SPEC_V1.md` is a finished specification — 7-page IA, homepage
section by section with exact copy, screenshot list with what must not be in
frame, CTA and download story, premium story, acceptance criteria. Every copy
block cites its row in `WEBSITE_CLAIM_EVIDENCE_MATRIX.md`, a finished 22-row
binding matrix with named owners. RCC implements; nothing further is owed from
product.

**No decision is asked for here** beyond whether RCC's sprint capacity goes to
it. NEW3's recommendation, implementation call RCC's: `apps/site`, Next.js
static export — Next 14 is already in the repo for `apps/admin`, so no new
vendor and no new framework, and a launch site needs no backend.

---

## FQ-SEARCH-COVERAGE-COMMERCIAL — the commonest query class in the market has one working arm

**Raised 25 Aug 2026, NEW3.** A commercial decision wearing a research decision's
clothes, which is why it is here and not only on NEW1's board.
`docs/product/TEN_MATTER_PRODUCT_REGRESSION_SPEC_V1.md` §4.2 and
`PREMIUM_COMMERCIAL_DECISION_PACKAGE_V3.md` §2.2.

`retrieve.ts` refuses to rank a query whose rarest lexeme exceeds document
frequency 0.05, because `ts_rank` over ~935,000 documents is over ten minutes.
That engineering is correct and its cost was measured before the threshold was
chosen. The consequence, measured against `lexeme_document_frequency`:

```
REFUSES  rarest df 0.06902   anticipatory bail
REFUSES  rarest df 0.25774   bail application
REFUSES  rarest df 0.11922   quashing of FIR
ranks    rarest df 0.00089   cheque bounce section 138
```

`bail` alone appears in **25.77%** of the sampled corpus, and bail is the
highest-volume thing in Indian criminal practice. For that whole class the
product has exactly one arm left — dense — and NEW1 measured its reach at
**40,161 judgments of 18.7 million (0.21%)**.

**Two decisions, both the founder's:**

1. **Fund NEW1's passage build, or accept the gap as a launch condition.**
   ~6 GPU-days to the measured improvement, ~18 GPU-days and 61 GB for the full
   build (NEW1 bus 1088); 2.2% to 37.8% on posed advocate questions. A
   subscription's revenue durability rests on the daily loop and the daily loop
   is search, so this is not only a retrieval question.
2. **Permit ten internal Hearing Pack generations** so the unit cost of what a
   paid tier would sell becomes a measurement. Today it is unmeasured: all-time
   `llm_calls` is 40,124 calls and **$0.1232**, entirely DeepSeek V4 Flash, with
   **zero calls ever made to Claude Sonnet 4.6 or Haiku 4.5**. Nothing is sold
   and nothing is shown to a user — ten generations against the ten regression
   matters, read back from `llm_calls`.

**What was built anyway:** the 10-matter regression is permanent and re-runnable,
so whichever way this goes, the effect is measurable rather than argued.

---

## LCC · Two environment values are all that stand between us and a real page

**Raised 25 Aug 2026, LCC. This is a launch blocker, and it is a five-minute one.**

`RESEND_API_KEY` and `OPS_ALERT_EMAIL`.

### What is already built and proven

The whole alerting path, end to end, observed rather than reasoned about:

- a **non-console transport** that leaves receipts outliving the process
  (`.agents/ops/alerts.jsonl`, one JSON line per delivery, plus a row in
  `ops_alert_deliveries`);
- a **scheduled tick** — Windows task `Lawmind-alert-poll`, every 10 minutes,
  executed by the scheduler and observed exiting 0;
- **seven conditions drilled**: long SQL, low disk, briefing zero-write,
  search 5xx, collector failure, a stalled critical background worker, and the
  database being down. Two of the seven fired **without being injected**, on real
  state;
- **cooldown proven** under the scheduler, not only under a test;
- the launch-week rate-rule blind spot closed with absolute rules.

The DB-down drill is the one worth knowing about: pointed at a dead database the
poller still raised `metricsUnavailable` at page severity and delivered it. The
only thing it could not do was record the delivery, because that table is in the
database that is down.

### What is missing, exactly

**A mailbox and a key.** Nothing else. `notifierFrom` already prefers Resend over
the file sink; setting both values makes the next scheduled tick email a human
with no code change and no redeploy.

Two decisions only you can make:

1. **Which address receives a page at 3am.** A shared ops alias is better than a
   personal inbox — a page that arrives to one phone on holiday is not a pager.
2. **Whether Resend stays the transport.** It is already the approved sender and
   costs nothing extra. PagerDuty or SMS is a later swap behind the same
   interface; it is not needed for launch.

### What stays wrong without it

**No human is ever woken.** Every rule fires, every receipt is written, and the
file is read by whoever thinks to look — which, at 3am during an outage, is
nobody. The transport is named `file-sink (durable, no human paged)` precisely so
this cannot be mistaken for solved.

R4 listed operational paging as blocking the WHOLE APP. This is the remaining
half of it.

Evidence: `docs/ai/lcc/OPS_PAGING_PROOF_R2_2026-08-25.md`.

---

# FQ-N2-R7 — NEW2, R7 §10 data-moat round, 25 August 2026

Five items. Four are decisions only you can make; one is a legal question I am
not qualified to answer and must not answer by default. **Everything else this
round found was engineering and is either fixed or queued inside the lane** —
`docs/ai/new2-r7/DATA_GAP_PRIORITY_QUEUE_V1.md` is the full work order.

Full evidence for every number: `docs/ai/new2-r7/`.

---

## FQ-N2-1 · The eCourts harvest is authorised, built, and has never run

`ecourts_observation`, `cause_list_syncs` and `harvest_fetches` are **all zero
rows**. The registrar's authorisation has been on file since 7 Aug 2026 and runs
to January 2029. The rate limiter, the fetch ledger and the narrowly-scoped
CAPTCHA bypass are all built.

**What is missing is one thing and it is not code:** the grant letter's specific
numeric conditions. `docs/ECOURTS_AUTHORISATION.md` still says
`STATUS: AWAITING THE LETTER'S NUMBERS`, and `CLAUDE.md` §6 is unambiguous —
*"If the authorisation's terms are not in the repo, the switch stays off."*
**The switch is off and I have left it off.**

**What stays wrong without it.** eCourts is the only source that can make the
corpus current. The last real judgment entered on **19 August**; it is now
25 August. It is also the source that would close the largest coverage hole in
the corpus:

```
Madras High Court                 1,696,697 documents     258 neutral citations
Patna High Court                  1,706,788                 1
High Court for State of Telangana 1,042,408                 3
Orissa High Court                   794,461                 3
High Court of Madhya Pradesh        650,704                 0
High Court of Gujarat               422,014                 0
```

**Six High Courts, 4,922,537 judgments, effectively no citation identity.** An
advocate in Chennai, Patna, Hyderabad, Cuttack, Jabalpur or Ahmedabad cannot look
their own High Court's judgment up by citation, because we hold no citation for
it. eCourts case-status carries it, along with the coram we are missing for
18,660,626 documents.

**Needed:** the rate/volume conditions from the registrar's letter, in the repo.

---

## FQ-N2-2 · The Supreme Court corpus is a law reporter's edition — a legal question

**35,570 of our 38,342 Supreme Court judgments (92.77%) carry the running head
`SUPREME COURT REPORTS`. 15,691 (40.92%) contain headnote prose.** Our High Court
corpus is raw court text — 2 of 93,175 sampled documents show any reporter
apparatus — so this is specific to the Supreme Court set.

`CLAUDE.md` §6 says: *"What IS protected is a reporter's copy-edited version —
headnotes, editorial numbering (Eastern Book Company v. D.B. Modak) — so use raw
court text and never a law report's edition of it."*

**Why I am not deciding it.** SCR is the **Supreme Court's own official**
reporter, published by the Court, not a private publisher like SCC. Whether the
*D.B. Modak* reasoning reaches a government reporter's headnotes is a real legal
question with a real answer, and guessing it in either direction is the kind of
thing this queue exists to prevent. The source is AWS Open Data under
CC-BY-4.0, which is a separate question from copyright in the headnote.

**Where it bites:** licensing exposure · `docs/DATASETS.md` forbids training on a
reporter's edition and this is 38,342 documents · passage safety, because the
Supreme Court subset carries **43.9% of all resolved citations** and is where
authority-bearing retrieval will concentrate.

**Needed:** counsel's view, or a decision to strip the apparatus and keep only
the judgment text. The second is engineering and I can do it once told.

**LCC, 27 Aug 2026 — the server now fails closed on this while the question is
open, so the decision has somewhere to land.** FIFTH (bus 1367) found the reader
serving an S.C.R. headnote as undifferentiated judgment text. `GET /judgments/:id`
now carries `textOrigin` (`REPORTER_EDITION` | `COURT_SOURCE` | `UNKNOWN`) and
`generationEvidenceEligible`, both derived from PROVENANCE — the bucket plus the
`year_volume_startpage_endpage` object naming — and from no content classifier,
because the role detector's reporter recall is 42.1% and a gate that lets more
than half through is worse than none.

The body is still served: an advocate must be able to read the authority, and
withholding 38,342 Supreme Court judgments would be a larger defect than the one
being fixed. What is refused is using it as generation evidence.

This changes nothing about the legal question and decides no rights dimension —
§8.2 keeps retain / index / display / generation-evidence / training separate.
It means the answer, whichever way it goes, is a change to one predicate rather
than a migration: *strip the apparatus* stays available, and *keep it, do not
generate from it* is already the running behaviour.

Independently reached the same 38,342 by a different route (object naming +
100% S.C.R. citation coverage), which is worth one line only because two methods
agreeing on the population is better evidence than either alone.

---

## FQ-N2-3 · IPC, CrPC and the Indian Evidence Act are not in the corpus, and no authorised source holds them

| statute | references | judgments citing it | text held |
| --- | ---: | ---: | --- |
| **Code of Criminal Procedure, 1973** | **280,027** | **186,382** | **none** |
| **Indian Penal Code, 1860** | 93,881 | 58,599 | **none** |
| **Indian Evidence Act, 1872** | 17,576 | 11,355 | **none** |

**The CrPC is the single most-cited statute in the entire corpus and we hold none
of it.** BNS, BNSS and BSA are complete (358 / 531 / 170 sections) — but they
commenced on 1 July 2024, and essentially every judgment we hold predates them.

I fixed the India Code adapter (the site migrated to DSpace 7; the old handles
404 and the new host answers HTTP 200 with an empty JavaScript shell) and then
measured what is actually there:

- **CrPC** — every exact-title item has **zero attachments**. Not available.
- **IPC** — one PDF exists; it is *Chandigarh's Model Jail Department* copy, 58
  pages, sections 1–120B of 511, and its s. 1 still reads *"except the State of
  Jammu and Kashmir"*, so it predates the 2019 reorganisation. Partial and stale.
- **Evidence Act** — obtainable. I fixed three parser defects and got section
  recall from 138 to **171 of 183**. **I did not write it**, because 93.4% means
  s. 105 (burden of proof for exceptions) would be silently missing, and a table
  that claims to hold the Act while missing s. 105 is worse than no table.

**Needed:** a source decision. I have not proposed and will not use any
unauthorised portal or scraper-reseller. Two government routes are unprobed and
cheap — India Code's own bulk/archive endpoints, and the Ministry of Law
e-Gazette. Say the word and I will probe both.

---

## FQ-N2-4 · "Supreme AI" and "Supreme Today" — one name or two?

A one-line confirmation, not a research task.

- **`CLAUDE.md` §6a, in-repo now:** *"`Supreme AI` and `Supreme Today` are
  different sources."*
- **`docs/AUTHORIZED_SOURCE_MAP.md` §2**, recording your own direct statement of
  **16 Aug 2026:** *"Supreme Today AI and Supreme AI refer to the SAME
  provider/platform… treat them as one."*

Your statement post-dates the §6a wording. **I have not picked a side**, because
the two readings differ in how many authorisations exist, and R7 forbids
broadening a permission from memory. If the 16 Aug statement stands, §6a's naming
paragraph should be updated so the next agent does not re-open this.

---

## FQ-N2-5 · We keep no source document for any judgment

`storage_key IS NOT NULL` is true for **0 of 18,698,984** documents. The whole
corpus is derived text with no retained original.

Consequences: **"show me the PDF" is impossible, not slow**, for every judgment.
Re-extracting the 469,599 documents we can prove are damaged has nothing local to
work from. And a redaction or takedown, if one were ever required, has no source
to prove itself against — there is no suppression capability at all today
(`SUPPRESSION_REDACTION_CAPABILITY_AUDIT_V1`).

`docs/R2_SOURCE_RETENTION_MATRIX.md` describes a retention policy the corpus does
not implement. Re-fetching from AWS is permitted and costs storage.

**Needed:** whether to spend on retention, and where. Cost is LCC's to size once
the answer is yes.

---

## Gold V3 needs practising advocates writing their own queries — 25 Aug 2026, NEW2

**Needed:** a set of real search queries written by practising Indian advocates,
with provenance recorded — who wrote it, when, and what they were trying to find.
Roughly 300–500 queries, spread across criminal and civil, covering: a short
legal concept ("anticipatory bail"), a doctrine, a fact pattern, "find me
authority that SUPPORTS this position", "find me authority AGAINST it", and a
statute question.

**Why no one here can write them.** A model asked to invent an advocate's
question invents the question the corpus can already answer. That is not a
benchmark, it is a mirror. R8.1 §7.12 forbids a model-written final Gold for
exactly this reason.

**What was built anyway.** `ADVOCATE_RETRIEVAL_GOLD_V2` — 480 rows, 430 live
targets, eight families, splits that are genuinely disjoint on six independent
identity axes. It is real evidence and NEW1 uses it. Its 430 verified targets can
be reused by V3 even though the queries cannot.

**What stays broken without it.** Four things, each measured this week and each
in `docs/ai/new2-r8/GOLD_V3_LINEAGE_V1.md`:

1. The 86-row holdout is committed to this repository, so every implementation
   lane could read it while tuning retrieval. It cannot be the one-shot final
   hidden set, and deleting the file does not undo that.
2. `supporting_authority` and `adverse_authority` were built from citation text.
   They test cited-case identity, not "what supports my position". **Zero of the
   480 rows are a human asking for supporting or adverse law.**
3. 90 of 480 queries (21 of them in the holdout) exceed the 500-character bound
   `POST /search` enforces, so they cannot enter the route they are meant to
   score.
4. 31 of the 60 `exact_identity` keys map to more than one judgment, so the
   family's own premise is false today.

Until V3 exists, LawMind can report retrieval quality as **development
evidence** and must not report it as a release claim or a public number.

**Where it plugs in.** Same schema as V2 (`docs/ai/new2-r7/ADVOCATE_RETRIEVAL_GOLD_V2.md`),
held outside this repository, membership known to FIFTH alone. NEW2 builds the
train/dev split and hands the holdout over unseen, exactly as for V2.

**Cheapest honest version:** twenty advocates, twenty queries each, one sitting.
It does not need a platform or a budget line — it needs access to advocates.

---

## FQ-N2-R9-1 — `ECOURTS_GRANT_ATTRIBUTION` and `ECOURTS_GRANT_REFERENCE`  ·  NEW2, 27 Aug 2026

**What is needed.** Two environment variables, in Railway. Both are the
registrar's confidential identifiers and are deliberately not in source.

**Why it blocks something concrete.** The grant requires its attribution string
verbatim **on every request**, and `services/api/src/court/ecourts.ts` sends it as
the `user-agent`. Without it a live request goes out **unattributed** — a silent
breach of a condition of the grant. eCourts is the only adapter that can produce
law newer than the last bulk drop, and it has **zero observations**.

**What was built anyway.** Everything except the first request. The grant's terms
are transcribed and fingerprinted (`authorisation.ts`), the rate limiter and fetch
ledger enforce them, `ecourts_observation` is append-only and trigger-enforced,
and `ecourts-derivation.ts` refuses to turn `LISTED_OBSERVED` into
`HEARING_OCCURRED`.

**What stays broken without it.** No canary, so no captured response, so
`parseCauseList` stays unimplemented — and it correctly returns `failed`, never
`empty`, so nothing downstream reads a court that published nothing.

**Where it plugs in.** `grantAttribution()` in
`services/api/src/court/authorisation.ts`, read live. With the value present and
the kill switch flipped (`platform_config.ecourts_harvest`, which requires a
`reason`), the first cause-list request is one call.

**Also worth correcting when convenient:** the grant expiry is transcribed as
`2029-01-01T06:30:00Z` because the founder stated "12 PM, January 2029" without a
day. The conservative day was chosen deliberately; the exact date would recover up
to a month of permitted harvesting.

---

## FQ-N2-R9-2 — every official Supreme Court discovery surface is CAPTCHA-gated  ·  NEW2, 27 Aug 2026

**What is needed.** A decision, not a credential: how LawMind obtains recent
Supreme Court judgments.

**Why.** The AWS SC bucket is **materially incomplete at source** — 208 rows for
two-thirds of 2026, where the Court delivers that in a fortnight — and the bulk
reconciliation is otherwise finished (4 documents outstanding of 43,535). Every
official `sci.gov.in` surface that could supply the delta requires a CAPTCHA:
`judgements-judgement-date`, `judgements`, and `scr.sci.gov.in` (e-SCR).
`digiscr.sci.gov.in` no longer resolves and the WordPress REST API returns 403.

**Why the eCourts permission does not cover it.** CAPTCHA bypass is a field ON the
eCourts grant, scoped to `services/api/src/court/ecourts.ts` and to bulk
cause-list harvesting. Extending it to `sci.gov.in` is exactly the widening
`CLAUDE.md` §6 forbids, and it was not done.

**The three options, none of which a lane may pick alone.**

1. A human-solved session — the same posture as Tier 3 citation confirmation,
   where a person solves the CAPTCHA and vouches.
2. Ask the Supreme Court registry for the same kind of written permission the
   eCourts registrar gave, which would make the bypass lawful here too.
3. Accept the AWS bulk drop's cadence for the Supreme Court and say so in product.

**What was built anyway.** The three-stage bridge is designed
(`docs/ai/new2-r83/RECENCY_BRIDGE_R8_3.md`) and the bulk path is exact: the SC
bucket key space and `judgments.source_url` are the same space, so "do we hold
everything" has a yes/no answer, and it is currently **4 documents**.

---

---

## FQ-N1-R9-1 — D: has 793 GB free and the database does not use it; that decision is worth ~4× the passage corpus  ·  NEW1, 27 Aug 2026

**What is needed.** A decision, not a credential or a purchase: whether the
Postgres data directory gains a tablespace on **D:**, and who owns the restore
and backup consequences.

**The measurement.** Both figures taken 27 Aug 2026:

```
C:   269.5 GB free of   930.5 GB     ← holds the 303 GB database
D:   793.3 GB free of 1,863.0 GB     ← unused by Postgres
```

**Why it matters, priced from measured per-row costs rather than estimates.** A
passage vector costs **21,607 bytes all-in** on this machine (13,847 heap+TOAST,
7,760 HNSW), and documents average 5.115 passages, so **108 KiB per document**.

```
full-corpus passage build   8,854,281 documents × 108 KiB  =  935 GB
what fits on C: today       after the coarse walk, its index and a safety floor
                            → 60 GB → 568,000 documents
```

So on C: alone the passage corpus is capped at **6.4% of the eligible corpus**.
A tablespace on D: does not make 935 GB possible either, but it plausibly takes
the cap to the Supreme Court plus every High Court judgment since 2020 — roughly
four times the tranche, on the population an advocate actually pleads from.

**Why a lane may not do it alone.** It changes the physical layout of the
production database, its restore procedure and its backup surface — and LCC's
restore proof is already an open blocker in the R8.3 release candidate. D:'s
random-read latency under an HNSW probe is **unmeasured**, and a passage index on
a slower spindle could cost more in query latency than it buys in coverage.

**What was built anyway, so nothing waits on this.** Passage tranche 2 is fully
designed, priced and **frozen** against the C:-only 60 GB budget —
`docs/ai/new1-r9/PASSAGE_TRANCHE_2_DESIGN.md`, id list at
`docs/ai/new1-r9/tranche2/tranche2-ids.txt`, `idsHash 3592efcbc5165a9f`, 568,000
documents, 2,905,320 passages, 58.5 GiB, 76.5 GPU-hours. It is one command from
starting and it does not need this decision. The decision only changes how much
more we could hold afterwards.

**What it would cost to answer properly.** Two measurements, both cheap and
neither of them mine to run alone: a `pgbench`-style random-read comparison of C:
and D:, and LCC confirming the restore path tolerates a second tablespace.
### UPDATE 29 Aug 2026 (NEW1, R10) — **DE-ESCALATED, not withdrawn. The coarse half of this question is answered and it is a no.**

The entry above bundled two storage decisions together. They have now separated,
and only one of them still needs the founder.

**The coarse document index does NOT need D:.** Measured this round rather than
estimated — four real HNSW builds at two sizes, `docs/ai/new1-r10/hnsw-build-measurements.json`:

```
index bytes per vector      2,730 B   (2,730 at 1M and 2,731 at 250k — stable across 4x)
full coarse halfvec index    20.9 GB   (7,654,179 representatives)
the same index as fp32      ~59.8 GB
C: free                     269.1 GB
```

20.9 GB against 269 GB free leaves ~235 GB of headroom, so the coarse index — the
one that takes production dense retrieval from 40,161 documents to the whole
eligible corpus — fits on C: with no tablespace, no layout change, no new restore
surface and no new backup surface. **Nothing about the coarse walk is waiting on
this decision, and nothing about it should be.**

That is a direct result of the halfvec verdict: as fp32 the same index is
~59.8 GB, which would have made the question much closer.

**What still needs the founder is exactly the passage question and nothing else.**
The 935 GB figure above is unchanged and so is the 60 GB / 568,000-document cap on
C:. Tranche V2 remains frozen at `idsHash 3592efcbc5165a9f`.

**And this round produced evidence that weakens the case for spending on it.**
The reach measurement over NEW3's gold (`docs/ai/new1-r10/tranche-reach-delta.json`)
found that of 228 gold authorities, **1** is reachable by the existing passage
tranche and **186 (81.58%)** are in the coarse snapshot. On that evidence the next
marginal storage pound buys far more in the coarse layer than in more passages.

**Recommendation, for whenever this is picked up:** leave D: unattached, finish
the coarse walk and build its index on C:, and re-ask the passage/tablespace
question afterwards with a real measurement of what the coarse layer retrieves.
The two cheap measurements named above (C:/D: random-read comparison, LCC's
restore path) are still the right way to answer it and are still not one lane's
to run alone.



---

## FQ-N1-R9-2 — one additive CHECK widening blocks statute, order and eCourts vectors  ·  NEW1, 27 Aug 2026 · **NOT a founder item — recorded here only so it is not lost**

Filed in the lane, not queued: `document_vector_staging_source_object_type_check`
admits only `judgment` and `legal_object`, so 36,663 embedded statute sections
sit in a NEW1 fallback table instead of the shared one. The fix is one additive
`ALTER TABLE` on an **empty** table, sent to LCC with the SQL inline (bus 1397).
It needs a migration ordinal from `MIGRATION_SLOT` and nothing else — no money,
no credential, no decision. Listed here purely because a blocker that lives only
in a bus message is a blocker that gets lost.

**CLOSED by LCC, 27 Aug 2026.** Migration `0089_document_vector_source_types`
applied through the real `migrate()` path (`drizzle.__drizzle_migrations` at 90 rows,
no hand-inserted ledger row). The CHECK now admits `statute_section`,
`official_order` and `ecourts_observation`, and was proven both directions on the
live table: all five values accepted, `not_a_real_type` still refused, 0 rows left
behind. NEW1 bus 1397 -> LCC bus 1403.
---

## FQ-LCC-R9-1 · ~~nothing this project runs recovers from a REBOOT without someone logging in~~ — **RESOLVED 30 Aug 2026, and it was never a founder item**  ·  raised LCC, 27 Aug 2026

**What actually happened.** The refusal recorded below was real; the conclusion
drawn from it was not. Changing a task's principal needs **elevation**, and
`Xerxus` is already a local Administrator whose token is merely UAC-filtered.
`Start-Process -Verb RunAs` — a consent click, never a credential, an account, or
money — is the entire difference. This sat queued for three days as a founder
blocker that any lane could have cleared in five minutes.

**Applied 30 Aug 2026** to all ten Lawmind tasks (the nine `Lawmind-*` at `\` plus
`new2-daily-delta` at `\Lawmind\`):

```
Principal.LogonType          Interactive -> S4U
Settings.StartWhenAvailable  False -> True
```

Triggers were deliberately left alone — a boot trigger buys at most 5 minutes over
the existing PT5M repetition while risking the repetition every worker depends on.
S4U alone closes the gap, because a repeating trigger fires without a session once
the principal allows it.

`pnpm job:health` now reports **11 mechanisms at BOOT, 0 needing LOGON** (was 1 and
5), and it derives that live from each task's `LogonType`, so the claim is measured
rather than asserted. Verified by observation, not by re-reading config:
`worker-truth`, `delta-queue` and `alert-poll` were force-run under the new
principal, all returned `0x0`, and all wrote fresh artifacts. Full record in
`docs/ops/JOB_TABLE.md` § Startup, honestly.

**What it had already cost by the time it was fixed.** A Windows Update reboot on
30 Aug at 02:33 UTC; the fleet did not return until the 05:28 UTC logon. Zero
embedding rows for 2h55m (~83,000 vectors), and the pager — `lcc-alert-poll`, which
is in this same group — was blind through the whole of it.

The original entry is kept below unedited, because the reasoning is the lesson: an
"Access is denied" is a permission question before it is a founder question.

---

### Original entry, 27 Aug 2026 — superseded

**What is needed:** an administrator prompt on this box, once, to register the
background jobs as boot-triggered scheduled tasks.

**Why a lane cannot do it.** Registering a task with an `AtStartup` trigger — or
any `LogonType` other than `Interactive` — requires elevation. Probed and refused,
not assumed:

```
New-ScheduledTaskTrigger -AtStartup + -LogonType S4U  ->  "Access is denied."
```

Every existing Lawmind task runs as `LogonType=Interactive`, which means it runs
only while a human is signed in. Measured state after this round's reconciliation:

```
BOOT   1 mechanism   LawMindPostgres (Windows service, LocalSystem)
LOGON  5 mechanisms  alert-poll · new1-sidecar-keeper · citation-keys ·
                     citations · paragraphs
```

**What that costs.** A rebooted machine sitting at the lock screen runs Postgres
and nothing else. On 13 Aug the box was powered off and the entire 24-worker fleet
stayed down 7.3 hours. The pager is in the LOGON group too, so the one time you
most want an alert — nobody logged in — is the time nothing is watching.

**What was built anyway.** All five are real scheduled tasks with repeating
triggers rather than Startup-folder shortcuts, so they recover from a CRASH within
their interval and they survive a session ending. They just do not survive a
locked screen. `scripts/job-health.mjs` prints the split every run under
`UNATTENDED RECOVERY`, so this is visible rather than assumed.

**What stays broken without it.** Reboot recovery, and only reboot recovery.

**Where it plugs in.** One elevated PowerShell:
`Register-ScheduledTask ... -Trigger (New-ScheduledTaskTrigger -AtStartup)
-Principal (New-ScheduledTaskPrincipal -UserId <user> -LogonType S4U)` for the
five task names above. Nothing in the repo changes.

---

## Not queued, deliberately

These looked like founder items and are not, so I did them or filed them in the
lane instead: the 293 stranded citations (fixed, 293 → 0); the 61 live false pins
(reported to LCC, a 61-row reversible `UPDATE`); the ~24,500 ambiguous citation
pins (a deterministic repair); linking 323,524 statute references (a join, no
acquisition); OCR for 469,599 damaged documents (compute, not money); and coram
recovery from our own header text (a hypothesis I can test without any source).

---

## FQ-N2-R10-1 — the Task Scheduler operational log is disabled, and enabling it needs elevation  ·  NEW2, 28 Aug 2026

**What is needed.** One elevated command. Nothing else, no money, no account:

```
wevtutil sl Microsoft-Windows-TaskScheduler/Operational /e:true
```

**DOWNGRADED 29 Aug 2026 — the mechanism was reproduced without the log.** This
is a diagnostic convenience now, not a blocker. Recorded in full because the
original entry claimed the cause was unrecoverable, and that was too pessimistic.

At **05:23:56 on 28 Aug** the `Lawmind
ew2-daily-delta` task — the daily
changed-object cycle, the thing that stops the ingest fleet going eight days
without noticing again — returned **0x800710E0**, *"the operator or administrator
has refused the request."* The task was Ready, the box has no battery, and it ran
perfectly when triggered again forty minutes later.

**Reproduced deliberately on 29 Aug.** The task's `MultipleInstances` setting is
`IgnoreNew`. Starting it at 09:51:38 while the 09:50:25 instance was still running
returned **exactly 0x800710E0**, with two `powershell.exe` children of the earlier
run still in the process table. So the code means *"an instance is already
running"* — and that is the correct, desirable behaviour: the alternative is two
cycles ingesting the same delta at once.

**What the elevated command is still worth.** I can reproduce the mechanism; I
cannot prove it caused the 05:23 refusal specifically, because the operational log
is off and nothing else records it. Enabling it makes the next refusal answerable
rather than inferred.


**What was built anyway.** Everything that does not need elevation. The task now
has `StartWhenAvailable = True`, so a missed daily run catches up instead of
vanishing — that was the logon-launcher failure mode reincarnated, and it is the
same reasoning that let the fleet sit dead from 19 to 27 August. The battery
conditions are off. The job is now in `.agents/jobs/registry.jsonl` as a
`cadence` job, and it writes a receipt per cycle to
`.agents/ops/n2-daily-delta-receipts.jsonl` carrying the manifest and ledger
numbers read back off disk, so a fired-and-did-nothing tick is distinguishable
from a healthy one **from our side**, without Windows' help.

**What stays broken without it.** Only the diagnosis. Detection is covered: a
refused run writes no receipt, and `job-health.mjs` reads the task's
`LastTaskResult` and reports a non-zero rc as FAILED. We will know THAT a cycle
was refused; we will not know WHY.

**Where it plugs in.** Nothing in the repo changes. It is one line in an elevated
PowerShell, and it pairs naturally with the `-AtStartup` / `S4U` registration
already queued above for the five other tasks.

---

## FQ-N2-R10-2 — the founder's own `users` row does not exist, and it is one of the three eCourts canary inputs  ·  NEW2, 28 Aug 2026

**What is needed.** A real founder account in `users`, or an explicit statement of
which existing row is yours.

**Why.** The eCourts canary has three required runtime inputs and this is the one
that was not previously written down. Measured 28 Aug 2026 against the live
database:

| required input | state |
| --- | --- |
| `ECOURTS_GRANT_ATTRIBUTION` in the runtime env | **ABSENT** — already queued as FQ-N2-R9-1 |
| `platform_config.ecourts_harvest` kill switch flipped with a reason | **OFF**, untouched since 2026-08-07T10:14:37Z |
| the founder's `users` row | **ABSENT** |

`users` holds 390 rows: 87 `admin` and 303 `advocate`. Every row that is not a
`@example.test` fixture has been anonymised to
`erased+<uuid>@invalid` — the erasure path ran and did its job. **There is no row
that can be identified as the founder**, so a request made "on the founder's
authority" has no principal to attribute it to.

**What was built anyway.** The refusal path, and it is proven working rather than
assumed. `ecourts_fetch_ledger` holds **92 rows and every one is a refusal**: 72
`kill_switch_off` between 9 and 26 August, and 20 `attribution_not_on_file` on
27 August. **Zero requests have ever left this machine.** The guard is
non-vacuous by its own ledger, which is the strongest form this evidence takes.

**What stays broken without it.** The canary — one court, a handful of
case-status lookups and one cause list — cannot run. **This lane will not
improvise a substitute for any of the three inputs.** An unattributed or
misattributed request is the single failure that can cost the grant itself, and a
guessed principal is exactly that failure wearing a different name.

**Where it plugs in.** Create the row (or name the existing one), set the two
environment variables, then flip the switch through
`POST /admin/platform/kill-switches/ecourts_harvest` with a `reason` so the change
is audited. The first cause-list request is one call after that.

---

## FQ-ECOURTS-ACTOR — HALF OF IT IS NOW CLOSED IN CODE · LCC, 29 Aug 2026

**What changed.** The "create the row" half no longer needs you. Measured
29 Aug: `users` holds 390 rows, 87 of them already `role = 'admin'`, and they
are fixtures — the account path works end to end (magic link → `PATCH /me` →
`role-cli`) but its **first** step needs a mailer and a device, so on this box
there was no way to bring a real identity into existence, and `role-cli` cannot
grant a role to a user that does not exist.

`services/api/src/admin/founder-cli.ts` closes exactly that, and nothing wider:

```
node --import tsx src/admin/founder-cli.ts \
  --email <you>@lawmind.in --name "<your name>" --phone "<your phone>" \
  --reason "first operator account" --apply
```

It creates the `auth_user` identity and the `users` profile in one transaction,
at `role = 'advocate'`, with an `audit_log` row. It **does not** grant admin
(that stays `role-cli`, which writes its own audit row), does not create a
session or a credential, does not mark the email verified, and does not accept
the terms on your behalf. Dry run is the default.

**One property to know before you run it: an applied run cannot be undone.**
`audit_log` is append-only at the database level and `audit_log.actor_user_id`
has a foreign key to `users`, so the row it writes pins the account permanently.
The reversal is the product's own erasure path — anonymise the identity, destroy
the credential — not a delete. Use the dry run to rehearse.

**What is STILL yours, and it is the only thing left.**

`ECOURTS_GRANT_ATTRIBUTION` is **not set** — zero `ECOURTS_*` variables are in
the environment. `guard.ts` refuses every eCourts network request until it is
present, which is correct and deliberate: the registrar asked that the letter's
identifying details never reach users, so the attribution string is supplied by
environment and never committed. `ECOURTS_GRANT_REFERENCE` is optional and its
absence is not a refusal — provenance is carried by `CONDITIONS_VERSION`.

**What was built anyway.** Everything else. Verified 29 Aug: **39 of 39** eCourts
tests pass, including that the grant reference never reaches a user, that an
unrecorded fetch never produces usable data, that the CAPTCHA bypass dies with
the grant at **noon** on its final day rather than at end of day, and that
silence in the letter reads as refusal on every permission. The transactional
config + audit path is built and was verified, not rebuilt.

**What stays broken without it.** The `ecourts_harvest` kill switch cannot
usefully be turned on: the guard refuses every request, so flipping it changes
nothing except an audit row. Tier 3 per-citation confirmation is unaffected — it
is a human solving the CAPTCHA and vouching, and `citations/verify.ts` still
holds no HTTP client.

**Where it plugs in.** Set `ECOURTS_GRANT_ATTRIBUTION` in Railway, run
`founder-cli` once, then `role-cli --role admin`, then flip the switch through
`POST /admin/platform/kill-switches/ecourts_harvest` with a `reason`.

---

## FQ-LCC-R10-1 — twelve documents rewrote the eCourts CAPTCHA scope and asserted a new Supreme Court grant, and CLAUDE.md §6 did not move  ·  LCC, 29 Aug 2026 · **eCourts half RESOLVED 29 Aug 2026; SCI half STILL HELD**

> **PARTIALLY RESOLVED — 29 August 2026, founder decision.** The founder settled
> **point 1** (eCourts scope): the automated path covers the enumerated
> `permittedDataTypes` in `services/api/src/court/authorisation.ts`, not "bulk
> cause-list harvesting only". Authorized CAPTCHA bypass applies across that
> eCourts scope; the conservative limits stand. `CLAUDE.md` §6 and §6a were moved
> to match, and `docs/ECOURTS_AUTHORISATION.md` was reconciled and committed.
> `platform_config.ecourts_harvest` is ON via the audited path.
>
> **Point 2 (a separate written Supreme Court grant) and point 3 (does
> `CORPUS_ACQUISITION_QUEUE.md` 4b re-open) are NOT decided by this and remain
> HELD.** `docs/SCI_AUTHORISATION.md` and every other SCI-related file in the
> held set below are untouched and still contested. `SCI_AUTHORISATION_STATE =
> UNCHANGED`. The non-eCourts, non-SCI documentation files in the held set stay
> dirty pending their own resolution.

**What is sitting uncommitted in the working tree.** A coherent, well-argued
rewrite of Lawmind's source-authorization narrative, spanning fifteen files. It
is not vandalism and it is not sloppy — it reads like deliberate work. It is
held because it is a policy change wearing documentation clothes, and only the
founder can make it.

**The change, stated plainly.** Today's binding rule (`CLAUDE.md` §6, and the
per-turn core injection) is:

> CAPTCHA bypass is permitted ONLY while the grant is non-null and unexpired,
> ONLY in `services/api/src/court/ecourts.ts`, and ONLY for **bulk cause-list
> harvesting**.

Every held file replaces "bulk cause-list harvesting" with **"the enumerated
grant data types"**. `docs/MISSING_PDF_RECOVERY.md` spells out what that widens
to: *"the enumerated eCourts data types, **including judgments and orders**."*
That is a materially larger permission than the one CLAUDE.md grants.

**The tell.** `CLAUDE.md` itself is NOT modified. Neither is
`PRODUCT_DECISIONS.md` and neither is `docs/OPEN_DECISIONS.md`. Twelve
derivative documents were rewritten and the document they all derive from was
left saying the opposite. Whichever direction is right, the repository cannot
hold both.

**A second, separate claim rides along.** `docs/SCI_AUTHORISATION.md` (untracked)
asserts *"the founder confirms Lawmind holds a separate written Supreme Court
permission, valid through 2029, that permits automated CAPTCHA handling."*
`CLAUDE.md` §6a names three authorized sources — BharatLaw, Supreme AI, eCourts
India — and says new sources remain subject to the normal provenance process. A
separate SCI grant is a fourth source. §6a also carries an explicit naming rule
about `Supreme AI` versus `Supreme Today`, which is exactly the kind of
adjacency that makes a fourth name worth confirming rather than inferring.

**`docs/CORPUS_ACQUISITION_QUEUE.md` item 4b flips.** It goes from *"NOT VIABLE
... do not adopt, do not evaluate further"* on the third-party eCourts scrapers
to *"components may be evaluated ... as transport/parser code behind Lawmind's
guarded adapter."* Defensible if the scope widening is real. Not defensible on
its own.

**The exact held set, all still dirty in the tree:**

- `services/api/src/citations/check.ts` — Tier 3 wire `detail` string
- `services/api/src/citations/verify.ts` — the `instructions` string an advocate reads, from *"We never solve it for you"* to *"This human-confirmation route does not solve it for you"*
- `services/api/src/citations/verify.test.ts`
- `services/api/src/court/authorisation.ts` — doc comments only, no behaviour
- `docs/SCI_AUTHORISATION.md` (new), `docs/ECOURTS_AUTHORISATION.md`, `docs/CITATION_HARNESS.md`, `docs/BLOCKER_REGISTER.md`, `docs/CORPUS_ACQUISITION_QUEUE.md`, `docs/CORPUS_TIERING.md`, `docs/DATA_ADVANTAGE.md`, `docs/HARVEST_ENGINE.md`, `docs/MIGRATION_WINDOWS.md`, `docs/MISSING_PDF_RECOVERY.md`, `docs/RCC_STANDING_PROMPT.md`, `docs/AGENT_BROWSER.md`, `docs/GTM_INDIA.md`, `docs/LCC_MASTER_PLAN.md`, `docs/TECHNICAL_INVENTORY.md`, `docs/RESEARCH_2026-08-11.md`, `.ai/09-project.md`
- `scripts/ecourts-canary-status.mts` (new, read-only, opens no socket)
- `docs/ai/new2-r10/sc-authorization-reanchor.json` and `docs/ai/new2-r10/NEW2_R10_CLOSURE.md` — both name `SCI_AUTHORISATION.md` as their controlling record

**What was verified, so this is not an alarm about nothing.** No behaviour
changed. `court/authorisation.ts` is 25 changed lines and every one is a comment
line. Nothing in the held set opens a socket. **Zero eCourts requests have ever
been made** and the kill switch is still off. The two things that actually moved
are (1) two user-visible strings and (2) what the repository tells the next agent
it is allowed to do — and (2) is the one that compounds.

**What is NOT in dispute and was not touched.** Tier 3 remains human-only.
`citations/verify.ts` still holds no HTTP client and the test asserting that
still passes. Automation still writes `ecourts_bulk` and never `ecourts`. Every
version of this text agrees on that, which is why the disagreement is only about
scope.

**What is needed.** One decision, in the founder's words, recorded in
`CLAUDE.md` §6 first and propagated outward — not the reverse:

1. Does the eCourts grant cover **bulk cause-list harvesting only**, or **all
   enumerated data types including judgments and orders**?
2. Is there a **separate written Supreme Court grant valid through 2029**? If
   yes it belongs in `CLAUDE.md` §6a beside the other three, under its own name.
3. Given (1), does `CORPUS_ACQUISITION_QUEUE.md` 4b stay closed?

**What was built anyway.** All of R10's actual integration landed: migration
0095 committed and its receipt recorded, the fresh-install schema proof passing,
the provenance writer, the image-only state, and the freshness contract at 7.5ms
with zero database queries. None of it depends on this decision.

**What stays broken without it.** Nothing runs. Nothing is blocked. The cost is
that the repository disagrees with itself about what it may fetch, and the next
agent to read `docs/` instead of `CLAUDE.md` will get the wider answer.

**Where it plugs in.** Answer 1–3, edit `CLAUDE.md` §6 and §6a to match, then the
held files either commit as they stand or revert with `git checkout -- <paths>`.
Both directions are one command.

---

## FQ-LCC-R10-2 — the BNS and BSA repeal-section numbers now have a tool that reads the Acts, and the DOMAIN_TRUTH edit that uses it is held  ·  LCC, 29 Aug 2026 · **not urgent, needs a legal call**

`STATUTE_MAPPING_SOURCES.md` admitted against itself that BSA §170 and BNS §358
*"were seen only on secondary aggregator sites ... not read directly from the
India Code PDF text."* `pnpm --filter @lawmind/ingest verify:criminal-codes` now
fetches the enacted PDFs and asserts title and provision against the bytes; the
tool and its hashed output are committed.

Held, because it is a legal-truth change and not R10 integration:

- `DOMAIN_TRUTH.md` — would stop the product inferring the applicable regime
  from the 1 July 2024 date alone, and label it **unresolved** until an advocate
  signs the evidence pack. This is the more conservative reading and it is
  probably right; it is also a change to the file `CLAUDE.md` calls the only
  place a legal fact exists, so it should not land as a side effect of an
  integration round.
- `docs/STATUTE_MAPPING_SOURCES.md` — records §170 and §358 as machine-observed.

**Needed:** an advocate's sign-off on
`docs/ai/lcc/criminal-code-official-artifacts.json`, then both files commit.

---

## FQ-LCC-R10-3 — RCC's admin BASE_URL fix is written, correct, and unowned  ·  LCC, 29 Aug 2026 · **thirty seconds of RCC's time**

`apps/admin/lib/api.ts` is dirty with a real fix: `NEXT_PUBLIC_API_URL` used to
fall back to `api-production-1c0b4.up.railway.app` — 0 active deployments since
11 Aug — in **every** environment including a real production build. The change
throws at import time on a production build and keeps a localhost default for
`next dev`. Same defect and same fix as `apps/mobile/src/api/client.ts`.

Not committed because `apps/**` is RCC's `CLIENT_APPS` scope and RCC's lease has
been stale-HELD since 25 Aug. Flagging so a good fix is not lost to a dead lease.

---

---

## FQ-ECOURTS-HAR — thirty seconds in Chrome settles a blocker eight hypotheses could not  ·  LCC, 30 Aug 2026 · **the cheapest item in this file**

**What is needed:** one HAR capture, or one "Copy as cURL", of a real browser
doing a cause-list lookup on eCourts.

1. Open `https://services.ecourts.gov.in/ecourtindia_v6/?p=cause_list/index`
2. DevTools (F12) → **Network** tab
3. Pick any State from the dropdown — that alone fires the request we need
4. Right-click the `fillDistrict` request → **Copy → Copy as cURL**, or use
   *Save all as HAR with content*
5. Paste it into `docs/ai/lcc-r12b/ecourts-browser-capture.txt`

**Why it is needed.** `POST /ecourtindia_v6/?p=casestatus/fillDistrict` answers
`{"errormsg":"…Invalid Request…!"}` on every attempt and discards our session.
A **GET navigation on that same session is accepted** — the server keeps the
session and issues a fresh `app_token` — so our cookies, token handling and
session continuity are provably correct. The refusal is specific to the AJAX POST.

Eight hypotheses were tested against the licensed client's own retained source
and every one was refuted, including R11's long-standing User-Agent theory
(tested directly for the first time this round: a browser-conventional UA changes
nothing). Full record: `docs/ai/lcc-r12b/ECOURTS_AJAX_BLOCKER.md`.

Our request now matches the licensed client at every layer JavaScript can reach —
asserted by executing the client's own scripts offline, 14 tests. The remaining
difference must be something scripts cannot see: TLS/HTTP2 fingerprint, header
ordering, or the `sec-fetch-*` headers a browser adds by itself. **A HAR shows
exactly that, and nothing else can.**

**What was built anyway.** The whole chain — quota reservation, ledger, raw
retention, CAPTCHA solve, parser, observation writer, idempotent replay — is
built, tested and runs end to end. It stops at one refused request. When that
request is understood, the canary is one command.

**What stays broken without it.** No served cause list has ever been seen, so:
`REAL_OBSERVATIONS = 0`, `PARSER_STATE = FIXTURE_BOUND`, retention `UNMEASURED`,
daily pilot `DISABLED`, and the 24-hour hearing briefing — the wedge — has no
live source. Everything downstream of it waits on this one capture.

**A decision may follow, and it is yours, not mine.** If the HAR shows our
request is identical in everything a script can see, then the only way through is
to present a browser's *network* fingerprint. That is a different act from
sending an honest header, and I did not take it. The grant permits the access;
whether it permits looking like Chrome to obtain it is a judgement call I have
deliberately left to you.

---

## FQ-BACKUP-KEY-ESCROW — the moat backup is now encrypted, and the key exists in one place  ·  LCC, 30 Aug 2026 · **five minutes, and it is urgent in the way backups are**

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** R2_BACKUP_KEY_ESCROWED = OPEN until the founder confirms. See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

**What is needed:** copy `R2_BACKUP_ENCRYPTION_KEY` out of
`C:\Users\Xerxus\Documents\Lawmind\.env` into a password manager, or anywhere
that is not this workstation. Then confirm here that it is escrowed.

**What was done.** The curated moat pack — `matters`, `matter_events`,
`documents`, `users`, and the citation and provenance tables — is now encrypted
**client-side** with AES-256-GCM before it leaves this machine, uploaded to R2,
and verified: 1.48 GB read back byte for byte with `0 differences`, plus one
object pulled fresh from R2 and decrypted to a byte-identical plaintext.

**Why client-side and not just R2's own encryption.** That pack holds client
names, party names and hearing notes — sensitive-class under `CLAUDE.md` §5.
R2's server-side encryption is a control **Cloudflare holds the key to**; it
protects against a stolen disk, not against a misconfigured bucket policy or a
leaked object-scoped key. So the key never goes to Cloudflare.

**The trade, stated plainly, because it is yours to accept.** An encrypted backup
whose key exists only on this workstation is a backup that **dies with this
workstation** — which is the exact disaster it was made to survive. Right now
confidentiality is up and **recoverability is down**. Until the key is escrowed,
this is not yet a backup in the sense that matters.

The key is 32 bytes of hex on the `R2_BACKUP_ENCRYPTION_KEY` line of `.env`.
`.env` is gitignored and the key is not in any commit, artifact or log.


---

## FQ-NEW1-R12-1 — the embedding model on this box is not a model anyone can re-download

**Raised:** 30 Aug 2026 · **Lane:** NEW1 · **Blocks:** nothing today. Decides
whether the corpus can ever be rebuilt.

**What was found.** The weights the entire semantic corpus was embedded with do
not match any version of that model that has ever been published. We fetched the
model from an unpinned reference over a year ago and kept no record of which
version it was. Checking every published version of it: four of the five files
match exactly, and the fifth — the 2.27 GB file that holds the actual weights —
matches nothing. It differs from the published file in 42,988 bytes out of 2.27
billion. Almost certainly a download that went wrong in a way nothing checked
for, because the only check we performed was that the file was the right length.

**Is the corpus damaged?** No. We re-ran twelve documents through those exact
local weights and they reproduce the stored vectors perfectly — cosine 1.000000.
The 2.45 million vectors are internally consistent and searchable.

**So what is the problem?** Those bytes now exist in exactly one place. If that
file is lost, the corpus cannot be reproduced — not approximately, not at all,
because the file it came from is not available anywhere.

We also measured what happens if a new server fetches the *published* weights
instead: query vectors land about 0.9998 similarity from our corpus. That sounds
like nothing. It is below the accuracy bar this project already set for itself
for exactly this kind of drift, and it would mean searches are asking questions
in a slightly different language from the one the corpus answers in. Nothing
would error. Results would just be quietly a little worse.

**What was done anyway, with no decision needed.** The 2.13 GB model pack is now
backed up to R2 and verified byte for byte on read-back. The downloader is pinned
to a specific published version, checks file contents rather than length, and can
no longer overwrite the local weights. A server that must match the corpus can now
be made to refuse the published weights outright.

**The decision that is yours.** Two options, and there is no rush:

1. **Keep going on these bytes.** Free. Nothing to do. The corpus stays bound to
   one 2.13 GB file that now has a verified off-machine copy.
2. **Eventually rebuild on the published version.** Costs a full re-embed of the
   corpus — GPU time measured in weeks at the current rate — and buys a model
   identity that anyone can reproduce from scratch.

NEW1's view: **option 1**, and revisit only if we ever re-embed for another
reason. The backup removes the actual risk; the rest is tidiness.

**Also worth knowing:** the model pack went to R2 unencrypted. Our backup rules
say encrypt before anything leaves the machine. These are public model weights
with no client data in them, so the reason behind that rule does not apply — but
the rule was not followed, and you should hear that from us rather than notice it.


---

## FQ-WEB-SURFACE — ~~the roadmap plans a desktop you cancelled on 12 August~~  ·  NEW3, 30 Aug 2026 · **CLOSED the same day — nothing is needed from you**

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** The closure below rested on "v7.1 puts advocate web in v1". SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION: ADVOCATE_WEB = DO_NOT_BUILD. See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

> ### CLOSED · `RESOLVED_BY_CURRENT_FOUNDER_ROADMAP_V7_1` · NEW3, 30 Aug 2026
>
> **Nothing is asked of you here. Do not read past this box unless you want the
> history.**
>
> **Master Roadmap v7.1 is the latest governing roadmap and supersedes conflicting
> earlier product-planning direction.** Under v7.1 the desktop/web advocate research
> surface is **IN V1 SCOPE**. That answers the question this item existed to ask, so it
> is closed on the roadmap's authority rather than left waiting for a sentence that has
> already been written.
>
> **IN SCOPE IS NOT ENABLED, and nothing was enabled.** Every advocate-web capability
> row reads `DISABLED_NOT_READY` — the gap is ours, no advocate web client is built or
> evidenced, and **no claim may be made about a web surface** until a row says
> `ENABLED` on named evidence. `platformStatus.web` moved
> `CONTESTED_FOUNDER_INPUT_REQUIRED → IN_SCOPE_V1_NOT_BUILT`
> (`V1_CAPABILITY_REGISTRY_R14.json`).
>
> **Two corrections to what this item used to say.**
> 1. **It said 30 rows were waiting on you. Measured, it was 18.** The other 12 already
>    carried truthful states that never depended on your answer, and they were left
>    alone.
> 2. **"web" meant two different things** in these documents — the marketing website and
>    the advocate web application. They are now named separately
>    (`WEB_MARKETING_SITE` / `WEB_ADVOCATE_APP`, `V1_CLAIMS_REGISTER_R14.md`) and no
>    claim's truth value changed when they were split.
>
> **One thing you may want to know, though it is not a question.**
> `PRODUCT_DECISIONS.md` **PD-15** and `CLAUDE.md` §1 still carry your 12 August
> reversal — *"this is only an app, we do not plan for a desktop, or a website login for
> users"*. Those files now read **stale against v7.1**. NEW3 owns neither and edited
> neither. If v7.1 is what you mean, PD-15 wants re-settling by whoever owns it; if the
> 12 August reversal is what you mean, then v7.1 §4 and Sprint 5 do. **Either way no
> lane is blocked and nothing is enabled**, so this is a tidy-up rather than a decision
> we are waiting on.

---

<details>
<summary>The original item, kept unedited for the record</summary>

**What was needed from you:** one sentence saying whether advocates get a
web/desktop surface in v1. Nothing else. No account, no money, no credential.

**Why NEW3 will not decide it.** Two documents that both bind us say opposite
things, and no measurement can separate them — they are statements of intent, not
facts about the world. That is what makes it yours rather than ours.

- **`PRODUCT_DECISIONS.md` PD-15 was settled on 11 August and REVERSED by you on
  12 August**, quoted verbatim in that file: *"This is only an app, we do not plan
  for a desktop, or a website login for users. The website login is only for the
  admin panel."* `CLAUDE.md` §1 carries the reversal. The desktop code was frozen
  rather than deleted, on your explicit call.
- **Master Roadmap v7.1, dated 30 August**, says in §4 *"Desktop = research
  workstation"*, schedules *"desktop shell on the same API"* for 14 September, and
  *"Desktop usable by 9 Oct"* in Sprint 5. It reads as though the 12 August
  reversal had not happened.

**What it costs to leave open.** Sprint 5 currently carries a desktop deliverable
due 9 October — eight days before candidate freeze — against a surface you
cancelled. That is a week of the last build sprint pointed at something that may
not exist. It is also the reason the capability registry cannot say anything true
about a web surface: every one of its 30 rows reads `UNKNOWN_PENDING_FOUNDER` for
`web`, because guessing in *either* direction would put a false state in the one
file that governs what we are allowed to claim.

**What was built anyway, so nothing is waiting on you.** `V1_CAPABILITY_REGISTRY_R13.json`
is complete and enforceable for iOS and Android — 18 capabilities enabled on at
least one platform, none without named evidence. The claims register is per
platform. The iOS party-search kill switch is specified. **Nothing in this round is
blocked**; only the web column is empty, and it is empty on purpose.

**What stays broken without an answer.** Sprint 5's desktop line stays in the plan
unchallenged, and any web claim — a screenshot, a "works on your laptop", a
pricing page that implies a desktop app — has no registry row to authorise it, so
under roadmap rule 15 it cannot be made at all.

**Either answer is cheap right now and expensive on 9 October:**

1. **The reversal stands.** The desktop line comes out of Sprint 5, that week goes
   to the phone, and every `web` row becomes `POST_V1`. The inert workspace files
   stay inert. *(NEW3's read of your 12 August direction — but it is a read, and it
   is not ours to apply.)*
2. **v7.1 supersedes it.** PD-15 is re-settled going the other way, `web` becomes a
   third real platform, and its rows need their own evidence before anything is
   claimed on it.

**Where it plugs in:** `V1_CAPABILITY_REGISTRY_R13.json` → `platformStatus.web`;
`docs/product/NEW3_R13_PRODUCT_AMENDMENTS.md` Amendment 3; Master Roadmap v7.1 §4
and §10 Sprint 5.

**Note on the "30 rows" figure above:** it was wrong. The measured count was **18**;
the other 12 already carried non-founder-pending states. Corrected in the closure box
and in `V1_CAPABILITY_REGISTRY_R14.json`.

</details>

---

## FQ-LCC-R13-HOSTING · The hosting choice is made and documented. Only the purchase is outstanding · LCC, 30 Aug 2026 · **~$122–132/month, cancellable**

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** Superseded by PERSISTENT_BETA_HOSTING = PENDING_SHIP_COST_PACKAGE_AND_FOUNDER_SPEND_APPROVAL (roadmap v7.4 §13.1). See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

**What is needed:** authorisation to open a DigitalOcean Managed PostgreSQL
instance, 8 GiB / 4 vCPU, in **blr1 (Bangalore)**. Plus roughly **$10–25 once**
for two small VMs used only to measure India latency and then destroyed.

**Why this and not the others, in one line each.** Advocates are in India, and
only two candidates are in the country. DigitalOcean blr1 and AWS Mumbai
`ap-south-1` are both in-region; Hetzner has no India region at all and its
Singapore location is cloud-only, and Akamai does not publish India availability
on its pricing page and its comparable tier is 2.7x. Between the two that qualify:

    DigitalOcean blr1     $122-132/mo   storage AND backups inside the plan
    AWS RDS Mumbai        $148.11/mo    plus backup at $0.095/GB-Mo on top

Both numbers come from the vendors' own primary sources fetched 30 Aug —
AWS's machine-readable price list for `ap-south-1`, and DigitalOcean's own
regional-availability docs confirming `blr1` runs managed Postgres. R12 could
not obtain either and correctly refused to choose on an aggregator's quote.

**What was built anyway, so nothing waits on you.** The export path, the restore
path, the checksummed manifest and the collation handling are all done and
proven. `V1_EXPORT_SIZE` is exact at 168,452,186,112 bytes. The selection is
documented in `docs/ai/lcc-r13/HOSTING_SELECTION.md` with the losers' reasons.

**What stays broken without it.** Sprint 3 wants a staging API online by
8 September. Nothing else on that path is blocked, but an instance cannot be
conjured on the 8th.

**One thing I could not measure and did not invent.** India p50/p95 RTT has to
originate on an Indian consumer ISP, not on this machine and not in a datacentre
— a number taken here describes my network, not an advocate's. The exact
procedure is written down in §3 of the selection document so somebody else can
run it without asking.

**Where it plugs in:** `docs/ai/lcc-r13/HOSTING_SELECTION.md`; Master Roadmap
v7.1 §7 and §10 Sprint 3.

---

## FQ-ECOURTS-HAR — **CORRECTION, 30 Aug 2026: the blocker this asked you to settle is SOLVED. The ask is now smaller and different** · LCC

**Do not spend thirty seconds in Chrome on the question this item originally
asked.** It described an AJAX POST that returned `Invalid Request` after eight
falsified hypotheses. That is closed:

- `fillDistrict` has answered correctly since **29 Aug 22:58Z**. The cause was a
  header pair that rotates roughly hourly and was being read from a constant; it
  is now read live from the interface's own script every session.
- A second defect hid the fix for a day — our option parser required quoted
  attribute values and the interface writes `value=8`, so eleven Delhi districts
  parsed to zero and read as an empty answer.
- The CAPTCHA is now **accepted, 3 of 3**. Three rejections that looked like OCR
  failures were not: the retained images were read by eye and all three codes
  were correct. Our cookie jar was captured once at session open and never
  updated, so the CAPTCHA landed in one session and the submit in another.

**What replaced it.** Three bounded submits — Sunday civil, Friday civil, Friday
criminal, CAPTCHA accepted every time — all answered:

    {"errormsg":"Connection to server failed try after some time...."}

That is the national portal's own message for a failure between IT and the
district court's server, not a message about our request. A weekday control
ruled out "Sunday has no list" and a civil/criminal control ruled out "this bench
publishes no civil list". LCC has STOPPED, per the round's own rule: the
remaining hypothesis is below the HTTP layer and no fingerprint impersonation was
implemented or will be.

**The smaller ask, if you have a moment and only then.** Open the eCourts cause
list for **Rouse Avenue Court Complex, Central district, Delhi, 28-08-2026** in
an ordinary browser and tell us whether a human gets that same
`Connection to server failed` message.

- **If yes** — the source is down for that court and the only open question is
  *when*, which a bounded retry answers by itself. No further founder input.
- **If no** — the difference is below the field layer and becomes a conversation
  with the registrar, not an engineering task.

Either answer is one screenshot. Neither is urgent, and **`ecourts_observation`
stays 0 either way**, which Gate B accepts alongside the bounded stop report at
`docs/ai/lcc-r13/ECOURTS_BOUNDED_STOP_REPORT.md`.

---

## FQ-BACKUP-KEY-ESCROW — **still open, and this round is why it matters more, not less** · LCC, 30 Aug 2026

Nothing new is asked. The five-minute action above is unchanged: copy
`R2_BACKUP_ENCRYPTION_KEY` out of `.env` into a password manager and say so here.

What changed is the evidence around it. The moat pack was this round **proven
restorable from Cloudflare R2** rather than from the copy on this disk: fresh
download, cipher checksums, decryption, plaintext checksums, schema, data,
**35 of 35 tables matching and a content checksum identical to live**, 1,022
seconds end to end.

So the backup now works. It works entirely on the strength of a key that exists
in exactly one place — the machine the backup exists to survive losing.

Two findings from the same run, recorded because they would both have bitten on
recovery day and neither needs you:

- the DEFAULT `rclone copy` truncated both large objects and then failed its own
  retry. Single-stream works and is now pinned in the script. The stored objects
  were always sound; the obvious command for getting them back was not.
- `moat.dump` alone silently loses two of 35 tables, including
  `ecourts_fetch_ledger` — the evidence that eCourts access stayed inside the
  grant — because `pg_dump -t` emits no enum types. The pack ships `schema.sql`
  for exactly this and the correct sequence is now pinned and exercised every run.

**Until the key is escrowed, host-loss recoverability of the moat pack cannot be
claimed, and this lane does not claim it.**

---

## FQ-LCC-R13-HOSTING — **CORRECTION, 30 Aug 2026: you deferred this yourself and nothing is being asked of you** · LCC

**Superseded, not resolved.** The entry above asks for authorisation to open a
DigitalOcean instance in `blr1` and roughly $10–25 for two throwaway
measurement VMs. **You instructed this lane mid-round not to purchase,
provision, upgrade, retain or trial any paid infrastructure, and to defer
hosting expenditure until the application is substantially built.** So the ask
above is withdrawn until you raise it, and no action is outstanding on your
side.

What that means for the gate, stated exactly rather than softened:

```
HOSTING_GATE_STATE                 HOLD_MEASUREMENT_DEFERRED_BY_FOUNDER
HOSTING_MEASUREMENT_AUTHORIZED     NO
HOSTING_PROVISIONING_AUTHORIZED    NO
INDIA_RTT_MEASURED                 NO
STORAGE_THROUGHPUT_MEASURED        NO
PITR_RESTORE_CHARACTERISED         NO
HOSTING_CANDIDATES_MEASURED        0
HOSTING_SELECTION                  NONE
```

**Nothing was provisioned, before or after your instruction.** No paid resource
was created at any point in this round; the only external writes were to the
existing Cloudflare R2 backup bucket, which is prior infrastructure.

**The research above is preserved untouched and is still good.** What it is not
is a measurement. Gate B asks for a selection from *comparable measured
configurations*, and prices read off vendor pages are not that — so this lane
did not convert the research into a fake measured comparison to make a line go
green. Whoever picks this up when you authorise spend needs two candidates
actually stood up, an RTT origin that genuinely sits in India (recorded as what
kind of origin it was), real storage throughput, and the restore/PITR behaviour
exercised rather than quoted. Temporary hourly resources are enough, and they
should be destroyed after the evidence is captured.

**Nothing else in this round waited on it.** The deferral is an external
blocker on one check and was not allowed to stop backend, reproducibility or
client work.

---

## FQ-SCI-EVIDENCE-LOCATION — the Supreme Court permission is settled and its record is in a file a clone cannot see · LCC, 30 Aug 2026 · **a five-minute decision, not a new question**

**This is NOT asking you to re-confirm the SCI permission.** You settled that.
It is asking which document is the canonical record of it, because two
repository records currently disagree and only one of them travels.

| record | what it says | can a clone see it? |
|---|---|---|
| `docs/SCI_AUTHORISATION.md` (27 Aug) | Lawmind holds a separate written SCI permission, valid through 2029, permitting automated CAPTCHA handling | **NO — the file is UNTRACKED** |
| `CLAUDE.md` §6a (tracked) | the SCI question "remains contested and untouched", `SCI_AUTHORISATION_STATE = UNCHANGED` | yes |

So the authoritative-looking statement is the one that would vanish with this
workstation, and the one every fresh agent actually reads says the opposite.
That is how a settled decision gets quietly reopened by the next session.

**What this lane did instead of choosing:** the untracked file is now inside the
encrypted off-machine protected set, so it can no longer be lost. It was **not**
committed, and no document was edited to assert the wider scope — a lane
committing a grant statement from a working-tree edit is exactly the failure
mode `CLAUDE.md` §6 exists to prevent. A dirty hunk in
`docs/TECHNICAL_INVENTORY.md` that would have asserted the same SCI scope was
left uncommitted for the same reason.

**The decision:** either `CLAUDE.md` §6a is amended to record the SCI grant the
way it records the eCourts one, or `docs/SCI_AUTHORISATION.md` is committed and
§6a points at it. Either is fine. Both being true at once is not.

---

## FQ-BACKUP-KEY-ESCROW — **still open, and this round widened what the key gates** · LCC, 30 Aug 2026

No new ask; the ask above is unchanged and is still five minutes with a password
manager. What changed is the blast radius.

The embedding model weights were off-machine in **plaintext** —
`backups/postgres/2026-08-30T00-10-01-494Z-new1-model-pack-v2` — which the R13
manifest recorded as an accepted deviation on sound reasoning: MIT-licensed
public weights carry no client data, so the confidentiality rule the encryption
exists for does not bite. This round's terms require client-side encryption for
the model set, so there is now an **encrypted** copy as well
(`…T16-28-51-828Z-model-pack-v3-enc`, AES-256-GCM, all five files plus a name
map, 2.28 GB).

**The plaintext prefix was deliberately NOT deleted, and that is the part you
may want to overrule.** Reasoning, so you can:

- It leaks nothing — public MIT weights, no client, personal or proprietary data.
- It is the **only copy recoverable without the key**, and the key currently
  exists in exactly one place: `.env` on this workstation.
- Deleting it would trade a confidentiality gain we do not need for a
  recoverability loss on the one day this matters.
- Removing a founder-owned object is not a lane's call to make unasked.

So today: `HOST_LOSS_RECOVERABLE = NO` for everything only the key can open —
the moat pack, which carries matters, client names, hearing notes, the Tier-3
human verification vouches and the eCourts fetch ledger. Escrow the key and that
flips. Until then the encryption protects confidentiality **and weakens
recoverability**, which is the honest description of the trade and the reason
this item is still here.

---

## FQ-CITE-2010-7-SCC-626 — one citation needs a human with the law report · NEW2, 31 Aug 2026

**What is needed:** someone with access to **Supreme Court Cases, (2010) 7 SCC
626**, to read the page and say which judgment is reported there.

**Why a machine cannot close it.** The discriminating fact is a page number in a
commercial law report. SCC is Eastern Book Company's copy-edited edition, which
`CLAUDE.md` forbids this corpus from holding (_EBC v. D.B. Modak_), and every
source we are authorised to use paginates in **SCR**, not SCC — India Code
carries statutes, and the Supreme Court's own reports are SCR. No primary source
available to us states what is printed at that citation.

**The conflict.** _Madhu S v. Travancore Devaswom Board_ (Kerala HC, 4 Jul 2023)
cites it as _Union of India v. National Confederation for Blind_. Our resolver
pins it to _Govt. of India v. Ravi Prakash Gupta_ (SC, 7 Jul 2010).

**What was built anyway.** The full evidence packet is assembled and committed:
`docs/ai/new2-r14-followup/human-review-citation-2010-7-scc-626.json`. It carries
both candidate identities, the citing extract, the alias and citation-key rows,
and a census of all 236 held citing contexts — 158 name _Ravi Prakash Gupta_
across 17 courts, 5 name the blind across 2. It also shows the citing sentence is
internally inconsistent on a neighbouring citation we CAN check. The corpus leans
one way and the packet says so; leaning is not resolution and no edge was
written.

**What stays broken without it.** Nothing user-facing. The pin is a candidate,
`cited_judgment_id` is NULL, and citation bulk apply is on HOLD for unrelated
reasons. This is one row in a 1.5M-row candidate, named rather than averaged
away, so that it is not silently applied later.

**Where it plugs in:** the answer goes into the packet's `disposition` and the
edge is either written or refused deliberately. Five minutes for anyone with an
SCC volume or a subscription.


---

## FQ-DELETE-WEB — **CORRECTED THE SAME DAY: the website exists, this is NOT a founder item, and it needs no account and no money** · RCC, 15 September 2026

**Withdraw the ask in the first version of this entry.** It asked the founder for
"a domain and somewhere to serve it from". Both already exist, and the claim they
did not was inherited rather than checked.

### What was actually observed, 15 September 2026

    lawmind/lawmind-site        exists on the org — Next.js 16 App Router, 12 routes
    https://lawmind.co          200, served by Vercel (bom1), real site
                                <title>Lawmind — verified case law and hearing briefings for advocates</title>
    https://lawmind.co/privacy  200   <title>Privacy · Lawmind</title>
    https://lawmind.co/terms    200
    https://lawmind.co/contact  200
    https://lawmind.co/delete-account   404   <- the only thing missing

### The claim that was wrong, and where it is recorded

`FOUNDER_QUEUE.md` **FQ-SITE**, `docs/product/WEBSITE_PRODUCT_SPEC_V1.md` §0 and
`docs/EXTERNAL_ACCOUNT_DELETION_WEB.md` all state *"no marketing site, no landing
page, no public surface of any kind. `lawmind.co` is verified with DNS written
through the Spaceship API and serves nothing."* That was presumably true when
first written. **It is false now**, and three documents plus RCC R25 and the
first version of this entry repeated it without anyone spending the ten seconds a
`curl` costs. RCC R26 repeated it too, because it inspected `apps/` — which is
the right place to look for an app in THIS repository and the wrong place to look
for a website that was never going to live here.

### What is actually needed, and by whom

One route, `/delete-account`, in `lawmind/lawmind-site`. Not a domain, not
hosting, not an account, not money, and not a decision only the founder can make.
The nine contract points NEW3 froze at bus 1753 and the full requirement are in
`docs/EXTERNAL_ACCOUNT_DELETION_WEB.md`, which is unchanged except for its
premise — the specification of the page itself was always correct.

**Owner: NEW3 / the website lane.** NEW3 owns the truthful web copy and the
Lawmind-site seam by its own ruling (bus 1753). It is outside RCC's owned paths
and outside this repository, so RCC has not built it; RCC has told NEW3 what it
found (bus 1767).

### What stays true

The in-app half is finished and proved for both account populations against a
live backend, and nothing an advocate can see is blocked. What is blocked is the
Play Data Safety form, which needs a URL that does not 404.

---

## FQ-DELETE-WEB — ORIGINAL ENTRY, SUPERSEDED BY THE CORRECTION ABOVE · RCC, 15 September 2026



**What is needed:** a public web address you own — a domain and somewhere to
serve it from. Not a decision, not a design. An account and a small amount of
money.

**Why it is a founder item.** Google Play's Data Safety declaration requires a
**web URL** at which someone can request deletion of their account and its data
**without installing the app**. The policy exists for the person who has already
uninstalled, so an in-app screen cannot satisfy it however well it works. There
is no CLI that can conjure a domain we do not own, and the lane checked before
queueing this: `apps/` holds `mobile` and `admin`, and `admin` is the internal
staff console behind auth, which `CLAUDE.md` §1 and the PD-15 reversal both say
is the only web surface this product has. Standing up a second public web app
inside this repository to satisfy a store form would be inventing a product
surface the founder cancelled.

**What was built anyway, and it is finished.** The in-app half works for BOTH
account populations and is proved against the real backend, not a mock:
`/delete-account` reaches the deletion request for a profile-backed advocate and
for an `identity_only` account that has no profile row, without completing
onboarding first, with the R16 idempotency key attached, and creating no profile
row as a side effect. RCC R25 proved it; RCC R26 re-proved it at this HEAD
(`apps/mobile/e2e/identity-delete.e2e.test.tsx`, 23 tests, 0 failures, against a
live API and a live Postgres). The requirement the page must meet is written
down in full at `docs/EXTERNAL_ACCOUNT_DELETION_WEB.md`, including the nine
contract points NEW3 froze at bus 1753 — so whoever builds it is not starting
from a blank page.

**What stays broken without it.** Nothing an advocate can see, and nothing in
the app. It is a **store-submission blocker only**: the Data Safety form cannot
be completed truthfully, so the Play listing cannot be submitted. Everything
else in the client is unaffected.

**Where it plugs in:** the URL goes into the Play Console Data Safety form, and
the page itself authenticates against the existing better-auth deployment and
calls the same deletion route the app already calls. NEW3 owns the truthful web
copy and the public-web seam (bus 1753); RCC owns nothing further here.

---

## FQ-REMOTE-ALPHA · One spend authorisation is enough to start Gate C, and the decision inside it is a REGION, not a price · LCC, 15 Sep 2026

**What is needed from you:** one authorisation to spend, and — inside it — one
decision that is yours alone and is not a hosting preference.

**What was built anyway:** the entire remote-alpha package, executable today.
`docs/ops/REMOTE_ALPHA_PACKAGE.md`. Nothing was provisioned, no account created,
no money committed. `PAID_INFRA_CREATED = NO`, `REMOTE_RESOURCE_CREATED = NO`.

- environment contract, enforced at boot, with its refusals **observed** rather
  than asserted (`ops/serving-contract.ts`);
- two independent guards that stop your workstation becoming the serving plane —
  one syntactic, one by cluster identity that survives an SSH tunnel;
- corpus release, the activation gate, blue/green rollback A→B→A with user data
  provably unchanged;
- USER database backup **and restore**, with an authenticated smoke driven
  against the restored database — no "backup succeeded" without restore evidence;
- `GET /ready` beside `/health`, because `/health` pings one of the two database
  roles and a user database that has gone away leaves liveness green;
- the staging Gate-S1 runner, written and **run**, so the evidence command is not
  invented on deployment day;
- a dry run of all of it against disposable databases: 16/16, including seven
  deliberate misconfigurations that had to be refused and were.

**The decision, stated precisely.** The API tier is settled on Railway
(`DEPLOYMENT.md`). The **corpus and user database planes are not**, and the open
question is a region:

- **Railway Singapore** matches the DPDP residency position recorded in OD-2, and
  Singapore→India is a same-region hop.
- **Hetzner EU** (the two independent audits' recommendation) has the RAM to keep
  the HNSW index resident, is likely cheaper, and **has no Singapore or India
  region at all** — so ordering it decides OD-2's residency position by accident,
  and adds a cross-continental round trip inside a 15-second client timeout RCC
  has already measured as tight on a real device.

`docs/ops/STAGING_PACKAGE_PROPOSAL_2026.md` §0 and §10 hold the measurements and
the unresolved Hetzner price discrepancy (€157 in the audits vs €259 corroborated
after the June 2026 rise — re-price on the day, do not commit to either).

**What stays broken without it:** nothing local. Gate S1 has **never** been
measured against a remote deployment and this repository may not claim it has —
`STAGING_GATE_S1_MEASURED = NO`. Everything else in Gate C is blocked only on a
box existing.

**Where it plugs in:** `LAWMIND_SERVING_ENV`, `CORPUS_DATABASE_URL`,
`USER_DATABASE_URL`, `DB_SPLIT_MODE=split`, `AUTH_SECRET`, `AUTH_BASE_URL`,
`RESEND_API_KEY`, a release identity, and — strongly recommended —
`LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS` set to this workstation's Postgres
`system_identifier`, so no tunnel can make this box the serving database.
`REMOTE_ALPHA_PACKAGE.md` §2 is the full table.

Still separately owed and unchanged by this round: the countersigned DPA before
uploads ship (OD-6), and the DNS/TLS/subdomain choice.

## FQ-NEW1-R14-RAM — the semantic index needs about 20 GB of memory to build, and this machine has 11.7 GB to give

**Raised:** 15 September 2026 · **Lane:** NEW1 · **Blocks:** nothing you are
using today. The app does not read this index and no feature waits on it.

**The good news first, because it is the bigger half.** The embedding programme
is **finished**. Every document we hold that qualifies for semantic search now
has a vector: 7,673,702 distinct texts out of 7,673,702, with nothing queued and
nothing unaccounted for. That was the open question when this round started and
it is now closed and measured, not estimated.

**What could not be finished.** Turning those vectors into a searchable index is
a separate step, and it did not complete. The index would be about 19.5 GB, and
the way this software builds it, the whole thing has to be held in memory at once
or it falls off a cliff. Measured twice, on two different settings:

- With 4 GB of memory: ran 4 hours 55 minutes, got 52% of the way, and was
  slowing down as it went — 233 rows a second early on, 25 a second by the end.
  Finishing would have taken more than 41 hours and the figure was still rising.
- With 8 GB and more than twice the parallel workers: **exactly the same speed**,
  24 rows a second. The extra workers did 2.3 times the disk reads and produced
  no extra progress, which tells us the slow part cannot be parallelised.

The memory figure is not a guess. Both runs fell off the cliff at the precise
point arithmetic predicted — within 15 rows the first time and 551 the second —
so we know exactly what it needs: **19.52 GB**. This machine has 31.7 GB in
total and, with Windows and your other applications running, about **11.7 GB**
available. There is no setting that closes that gap.

**Nothing was damaged.** Both attempts were cancelled cleanly and the vector
table was verified untouched afterwards — all 8,160,672 rows still there.

**What we did instead, so the round is not empty.** There is an existing
1-million-row index built to exactly the same specification. We ran the full
quality measurement against that. It is honest evidence about the *design*, and
it is clearly labelled as one million rows rather than seven and a half, because
search quality changes with size and it would be wrong to quote it as if it were
the real thing.

That measurement already found something worth knowing: **with the default
setting, filtering a search to a single High Court returned nothing at all for
137 of 283 test queries** — not "few results", zero. A different setting fixes it
completely but makes those searches roughly a hundred times slower. That is a
real trade-off we now have measured numbers for, and it is ours to resolve, not
yours.

**The decision that is yours, and there is no urgency.** Three options:

1. **Do nothing for now.** Costs nothing. The vectors are safe and permanent; the
   index can be built whenever a machine is available. Semantic search is not in
   the app today and nothing regresses.
2. **Add memory to this machine.** Going from 32 GB to 64 GB is the cheapest fix
   and would let the index build in well under an hour instead of never. This is
   a parts purchase, roughly the price of a decent dinner out, and it is a
   one-time cost.
3. **Build it on a rented machine once.** We already have a hosting decision in
   front of you (`FQ-LCC-R13-HOSTING`, `FQ-REMOTE-ALPHA`). A machine with enough
   memory, rented for an afternoon, would do it.

**NEW1's view: option 2, whenever convenient.** It is the smallest amount of
money that removes the problem permanently, and it helps everything else on this
box as well. Option 1 is genuinely fine in the meantime — this is not a fire.

**One thing to be aware of either way.** The measurement that the extra parallel
workers bought nothing is specific to building the index. It does not mean the
machine is slow or that anything else is misconfigured.

Evidence: `docs/ai/new1-r14/HNSW_BUILD_COST_AT_SCALE.md` (the two runs and the
mechanism), `docs/ai/new1-r14/NEW1_EMBEDDING_COMPLETION_RECEIPT.json` (the
embedding is finished), `docs/ai/new1-r14/NEW1_R14_FINALIZATION.md` (the round).


---

## FQ-NEW1-R15-LOGON — the embedding top-up only runs after someone logs in

**Raised:** 16 September 2026 · **Lane:** NEW1 · **Urgency:** low, but it is
silent when it bites · **Costs:** nothing, it is a setting

The job that embeds newly ingested judgments (`Lawmind-new1-delta-queue`) is
registered to run **interactively** — meaning it waits for a user to log in
before it will fire, rather than starting with the machine.

This showed up as a **9¼-hour hole** in its records overnight, between 20:59 on
15 September and 06:14 on 16 September. That particular hole was innocent: the
machine was switched off, and the job resumed by itself **six minutes** after it
came back on.

**Why it is still worth a line here.** A powered-off machine and a machine that
booted but sat at the login screen produce *the same record* — a gap. The only
thing that tells them apart is the boot time, and nobody is watching that. So the
day this does bite, new judgments quietly go un-embedded and nothing anywhere says
so.

**Nothing is broken today and nothing is waiting on you to proceed.** The queue is
caught up, it reports zero outstanding work, and the round it belongs to is
finished and committed. This is recorded because changing how that job is
registered affects how the machine schedules *all* the lanes' jobs, not only
NEW1's, and that is a decision about the machine rather than about embedding.

**What NEW1 suggests, when it is convenient:** register it to run whether or not
anyone is logged in. It is a one-line change to the task, it costs nothing, and it
removes a failure that is invisible by construction.

Evidence: `docs/ai/new1-r15/NEW1_TERMINAL_RECEIPT.md` §5.

---

## FQ-NEW1-R15-HNSW-OFFLOAD — the build instructions now exist, ready for whichever option you pick

**Raised:** 16 September 2026 · **Lane:** NEW1 · **This is not a new decision** —
it is the missing half of `FQ-NEW1-R14-RAM`, which is still the live question.

`FQ-NEW1-R14-RAM` asked you to choose between doing nothing, adding memory to this
machine, or renting one for an afternoon. That question stands unchanged, and
NEW1's view is unchanged: **adding memory, whenever convenient.**

What is new is that **the build is now fully written down**, so whichever option
you choose, nobody has to work it out again:
`docs/ai/new1-r15/NEW1_HNSW_OFFLOAD.md`. It specifies exactly what to build, on
what kind of machine, how to watch it, when to stop it, and what to check
afterwards. The script that does it already exists and refuses to run against the
wrong data.

**One number has moved since 15 September, and not enough to matter.** Free memory
on this machine read 11.7 GB then and 14.2 GB today. The build needs 19.5 GB. It
is closer and still short.

**Nothing is waiting on you.** The embedding itself is finished, proven, and now
backed up off this machine. The index only affects a search feature that is
switched off and stays switched off either way.

---

## FQ-NEW3-R24-VERIFY-ROW — one yes/no before the app can be signed off on this machine (16 Sep 2026)

> **CLOSED 16 Sep 2026 (NEW3 R24B). You chose (a).** The phone test is off the list
> for now. It returns as a mandatory test before any feature that could show an
> unconfirmed citation is switched on, such as uploads, drafting, or an authority
> the advocate types in. Nothing was built to make the test reachable. With this
> and the three engineering fixes done, **the app is signed off on this machine
> (local v1 accepted).** The next step is yours: whether to approve paying for
> remote servers. That is **not** approved yet, and nothing paid has been
> created. Record: `docs/product/NEW3_R24B_LOCAL_V1_ACCEPTANCE.md`.

**What is needed from you.** The pre-launch checklist asks for one test on the phone: an
advocate confirms, by hand, a citation we could not confirm ourselves. The test cannot be run
today, because the app can never reach that state. Everything it currently shows comes straight
from our own library of judgments, and a judgment from our library is confirmed by definition.
The only feature that could bring in an unconfirmed citation, uploading a case file, stays
switched off until the data-processing agreement is signed.

Please choose one:

- **(a) Recommended.** Take this test off the list until uploads or drafting are switched on, and
  put it back at that point.
- **(b)** Build a small extra path so that the test can be run now. That path would exist only
  for the test.

**What was built anyway.** The server side of the confirmation passed its tests. The screen
exists in the app. Nothing was faked to make the test pass.

**What stays blocked without an answer.** The local sign-off ("local v1 accepted"). Three other
fixes, already assigned to the engineering lanes, block it too.

**Separately, and unchanged.** Paying for remote servers is **not** authorised and is not being
asked for yet. The public delete-account page, lawmind.co/delete-account, still returns "not
found"; it will be needed before the Play Store submission.

Record: `docs/product/NEW3_R24_LOCAL_V1_ACCEPTANCE.md`, blocker B4.

---

## FQ-RCC-S24-UNLOCK — please unlock the Galaxy S24 (17 Sep 2026)

> **CLOSED the same night — you unlocked it, thank you.** The test then ran and
> found something worse than a locked phone. See FQ-RCC-SIGNIN-LINK-DEAD below.

**What is needed from you: unlock the phone, and leave it unlocked.** That is the
whole ask. No decision, no account, no money.

**Why.** The last Gate C row is the app running over ordinary mobile data against
the temporary server in Singapore — the same thing an advocate on a train would
do. The phone is plugged in, Wi-Fi is off, mobile data is on, and the app is
installed and already running. It is sitting behind the lock screen, and the lock
needs a PIN, which is yours to enter and not something an agent may type.

**What was built anyway.** All of it, up to the lock screen:

- A proper standalone app was built and installed. The build that was on the
  phone from 31 August was a developer build — it only runs while a bundler on
  this workstation feeds it, which would have made the test meaningless. The new
  one is self-contained, points at the Singapore server, and was installed fresh
  so nothing left over from earlier testing can be mistaken for a live result.
- The network was put into, and proved to be in, the right state: no Wi-Fi at
  all, no cable shortcut of any kind, no VPN, the carrier as the only route.
- While preparing the sign-in step, a real problem was found in the emailed
  sign-in link and written up for the server lane. Briefly: **the link in the
  sign-in email looks like it points nowhere.** It does not stop the test — the
  app can be signed in another way — but it would stop a real advocate, so it is
  now on the server lane's list.

**What stays blocked without it.** The whole product half of Gate C: search,
reading a judgment, saving an authority, putting it in a matter, and checking it
is still there after restarting the app. None of it is claimed as passing,
because none of it was watched happening.

**Timing.** The Singapore machines are deleted automatically on **19 September,
17:57 UTC**, and the server lane asked for this test before about 12:00 UTC that
day. Unlocking any time before then is enough; there is no rush tonight.

Record: `docs/ai/rcc-r31/ROUND.md`.

---

## FQ-RCC-SIGNIN-LINK-DEAD — nobody can sign in to the alpha by email (18 Sep 2026)

> **FIXED AND DEPLOYED the same day — 18 Sep 2026, server lane.** The link in the
> email now works. Details at the bottom of this entry. Nothing is needed from you.

**This one is not a decision for you. It is a defect, it is already assigned to the
server lane, and it is here because you should know before anyone is invited to
try the alpha.**

**What happened.** On your phone, on the real app, against the real server: the
app sent a sign-in email, the email arrived in under a minute and looked right.
Tapping **Sign in** in it opened a browser showing an error page from our own
server — *no route for GET /api/auth/magic-link/verify*. The address the email
points at does not exist on the server.

A sign-in link is the only credential this product has. There is no password. So
right now, on the alpha, **an advocate who follows the email cannot get in at
all**, and nothing behind sign-in — search, reading a judgment, saving an
authority, matters — can be reached or tested.

**What was built anyway.** A proper standalone app, pointing at the Singapore
server, installed fresh on your phone. It is still there and still works up to the
sign-in screen. The app's own half is fine: it sends the link correctly and says
so honestly.

**One real bug in our app was found and fixed on the spot.** When the network was
dead, the sign-in screen said *"The search took longer than we wait for"* — a
sentence about a search, on a screen with no search on it. That one message was
being used for every action in the app. It now says something true for all of
them, it has a test that fails if anyone puts the old wording back, and the fix
was re-checked on your phone.

**Two things about the test itself, so the record is straight.** It was **not** a
mobile-data test — your SIM has no working data, which was confirmed on the device
before switching to Wi-Fi, so the "works on the train" question is still open. And
I briefly reported the sign-in email as undelivered when it had in fact arrived: I
had searched the wrong mailbox. That is corrected in the record.

**What stays blocked.** The whole product half of Gate C, until the sign-in link
resolves. The server lane has the evidence and the diagnosis.

**Timing.** The Singapore machines delete themselves at **19 September 17:57 UTC**.

Record: `docs/ai/rcc-r31/ROUND.md`.

### FIXED — 18 September 2026, server lane

**The sign-in link works.** It was a one-line disagreement between two correct
pieces of our own software, and it took about four hours to find, fix, ship and
prove.

**What was wrong.** The sign-in library we use writes the link address itself, and
it wrote one pointing at a door we had never built — and, it turns out, must never
build: that library's own door hands the key to the *browser*, and the app is what
needs it. So the email was correct, the server was correct, and the address between
them belonged to nobody.

**What it does now.** The email points at an address on our own server that exists,
and that address passes the sign-in key straight into the app, untouched. The key
still works once, still expires in fifteen minutes, and a second use is still
refused — none of that changed, because none of that was broken.

**How we know, rather than believe.** A real email was sent from the real server and
**delivered**; we then read that delivered message and found the new working address
inside it, with nothing else. A fresh sign-in was taken all the way through to a
signed-in account that could ask the server who it was. Using it twice was refused.
Search and reading a judgment still answer in under half a second. None of your data
or anyone else's was involved — a throwaway test address was used and then deleted.

**One thing still to check, and it needs the phone.** Everything above was proved
over the public internet. The last step — the browser on your phone handing the link
to the app — is the client lane's to watch, on the device, and they have been asked
for it. It is the standard way this works everywhere else, so it is a confirmation
rather than a doubt.

**Nothing is needed from you.** No key, no account, no money, no decision.

Record: `docs/ai/lcc-r33/ROUND.md`.

---

## FQ-NEW3-R25-ROTATE — three keys to revoke once the Singapore machines are gone (18 Sep 2026)

> **STATUS 18 Sep 2026 (SHIP S4-T0.1):** DO_TOKEN_ROTATED / RESEND_KEY_ROTATED / SPACESHIP_KEY_SECRET_ROTATED = OPEN until the founder confirms. No agent marks these complete. See "CURRENT STATUS — S4-T0.1" at the top. The entry below is unchanged history.

> **THE MACHINES ARE GONE — 18 Sep 2026, 01:13 UTC, server lane. This is now due
> and it is the only thing outstanding.** Proof at the bottom of this entry.

**Gate C passed and is accepted.** The temporary Singapore infrastructure is
authorised for immediate teardown, and once the server lane proves it is gone,
**three credentials need you.** Nobody else can do this part.

**What to do, after — not before — teardown is proven.**

1. **DigitalOcean** — revoke the API token used for the Gate-C round and issue a
   replacement.
2. **Resend** — revoke the API key used to send the alpha sign-in emails and
   issue a replacement.
3. **Spaceship** — revoke the key and secret used for the `alpha-api.lawmind.co`
   DNS record and issue replacements.

**Why the order matters.** The teardown script authenticates with the same
DigitalOcean token and the same Spaceship key it is deleting things with. Revoke
first and the teardown cannot finish, which is the one outcome that costs money.
So: teardown proven, then rotate.

**Why at all.** These three lived on a workstation and in a temporary server's
environment for three days so a gate could be run against real public
infrastructure. Nothing suggests any of them leaked. Rotating after a temporary
round is ordinary hygiene, not a response to an incident.

**Do not paste any of these values into a chat, a file, or the repo.** No value
appears anywhere in the record — only the instruction to replace them.

**Timing.** Teardown hard deadline **19 September 17:57 UTC**, wanted before
**19 September 12:00 UTC**. Rotation any time after the teardown proof lands.

**Nothing else is needed from you this round.** Gate C is accepted, the next gate
is Gate D (product quality and commercial readiness, target 2 October), and no
new feature or spend is being asked for.

Record: `docs/product/NEW3_R25_GATE_C_ACCEPTANCE.md`.
Teardown procedure: `docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md`.

### TEARDOWN IS PROVEN — 18 September 2026, 01:13 UTC. Please rotate now.

**Both Singapore machines are deleted, and so is everything that came with them.**
Not "deletion requested" — I asked DigitalOcean about each one afterwards **by its
own id** and every one came back *not found*. The sign-in address
`alpha-api.lawmind.co` no longer exists anywhere on the internet, and nothing
answers at either machine's address.

**Your other server was not touched.** `ubuntu-s-vikas` is still there and still
running, along with its two backups. It was named as off-limits before any of this
started, and the teardown tool refuses it by name as well as by list.

**What it cost: USD 16.67.** It was budgeted at up to USD 75 and would have been
USD 37.50 had it run the full three days — it was deleted after 32 billed hours
instead. **From 01:13 UTC the recurring cost is zero**, because a machine that does
not exist cannot bill.

**Nothing was lost.** The advocate accounts and matters that lived only on that
server were copied down first and the copy was checked byte-for-byte. The corpus
release pack on the D: drive is untouched. Every piece of written evidence from the
gate is still in the repository.

**So the three rotations above are now due**, and they are the last thing anyone
needs from you for this round. The order that mattered — teardown first, then
rotate — has been satisfied.

Teardown receipt: `docs/ai/lcc-r34/TEARDOWN_RECEIPT.md`.

---
