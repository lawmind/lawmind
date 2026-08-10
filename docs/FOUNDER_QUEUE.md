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

### [OPEN] Supreme Today prices at ₹5,000/yr for our exact user — and we have no answer there · LCC · 8 Aug 2026

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

### [PENDING — awaiting their quote] A LICENSED arrangement with Supreme Today · founder in talks · 8 Aug 2026

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

### [DECISION NEEDED] Supreme Today: licence granted at ₹50,000/month · 8 Aug 2026

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

### [ANSWERED — recommendation, £1,499 decision] Bharat.Law's scraping offer · 8 Aug 2026

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
