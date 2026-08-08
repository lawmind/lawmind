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

## How to add an entry

```
### [OPEN] <short title> · <lane> · <date>
**Needs:** the exact thing — a key, an account, a signature, a decision.
**Why it is not a blocker:** what was built anyway, and how it behaves without it.
**Cost if never resolved:** what stays broken or unshipped.
**Where it plugs in:** file or config, so wiring it up later is one step.
```

---

# CREDENTIALS AND ACCOUNTS

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

### [OPEN] eCourts grant conditions, transcribed · LCC · 7 Aug 2026

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

### [OPEN] `verified_by_source` — bulk eCourts resolution needs its own value · LCC · 8 Aug 2026

**Needs:** a yes/no on adding `ecourts_bulk` to the `verified_by_source` enum.

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

---

# RESOLVED — kept for provenance

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
