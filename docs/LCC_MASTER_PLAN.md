# LCC MASTER PLAN — every open thread, researched, sequenced

Written 8 Aug 2026 after a full audit of the sprint docs against the build.
**This file is the anti-drift device.** It survives compaction; a fresh agent
reads it and knows exactly what is done, what is next, and what is waiting on
a human.

**Rules for working this list:**

- Never mark an item done from inference. `DONE:` means observed — a command
  run, a route probed, a number counted.
- Research tasks are real tasks. "Search once and take the first answer" is
  how the LLM-key question stayed wrong for a week. Read primary docs, read
  the actual pricing page, read the licence.
- An item blocked on the founder goes to `docs/FOUNDER_QUEUE.md` **and the
  lane keeps going.**

---

## THE HEADLINE: we shipped S3–S7 through a gate that was never measured

`sprints/SPRINT_2.md` is titled **HARD STOP** and calls itself _"the sprint the
product lives or dies on."_ `CLAUDE.md` §7: _"Gate S2 (citation accuracy) is a
hard stop. Nothing downstream matters if it fails."_

**`services/harness/**` does not exist.** Verified by exhaustive search 8 Aug
2026: no 30-query set, no adversarial set, no metric runner. The only metrics
code is `services/api/src/admin/citations.ts`, written 8 Aug, which computes
**production aggregates** — a fundamentally different thing, because live
queries have no ground truth and therefore cannot measure hallucination rate.

Six thresholds, all zero or absolute, **none ever measured.**

This outranks all 14 unbuilt endpoints. Everything in Workstream A comes first.

---

# WORKSTREAM A — Gate S2 harness ⛔ HIGHEST PRIORITY

**Why first:** it is the one gate the product's licence to exist rests on, it
needs nothing from the founder, and per `TRAINING_STRATEGY.md` §3 the harness
output _becomes the first gold training data_. It serves both of the founder's
stated priorities at once.

## A0 · Research before building

- [x] **A0.1** Re-read `docs/CITATION_HARNESS.md` end to end. It is a spec, not
      guidance. Extract every assertion the harness must make into a checklist.
- [x] **A0.2** Read `sprints/SPRINT_2.md` §LCC in full. `OWN:` names
      `services/harness/**` and `packages/verification/**` — decide and record
      whether verification stays at `services/api/src/citations/` (it works,
      it is tested) or moves. **Do not move working code to satisfy a path in
      a doc** unless there is a real reason; record the decision either way.
- [x] **A0.3** Deep-dive research: how do legal-IR benchmarks construct ground
      truth without a lawyer per query? Read **IL-TUR** (Indian Legal Text
      Understanding and Reasoning, arXiv 2407.05399), **CLERC** (legal case
      retrieval dataset, arXiv 2406.17186), and the retrieval-mismatch finding
      in arXiv 2603.19251. Specifically answer: can any of these supply
      _evaluation_ material for Indian law without violating
      `DATASETS.md`'s "primary sources only"? **Evaluation ≠ training** — the
      rule forbids training on model commentary; an eval set built from
      primary records is a different question and must be answered explicitly,
      not assumed either way.
- [x] **A0.4** Research precision@5 methodology for legal retrieval: what
      counts as "relevant" when a judgment is topically right but from the
      wrong court or superseded? Record the definition we adopt **before**
      measuring, so the number cannot be tuned after the fact.

## A1 · The 30-query fixed set

Composition is fixed by `SPRINT_2.md`: **10 criminal · 10 civil · 5 BNS/BNSS/BSA
mapping · 5 Hindi.**

- [x] **A1.1** Build the queries **from our own corpus**, so ground truth is
      derivable rather than asserted. We hold 38K+ SC judgments, the citation
      graph, and back-filled `overruled_status`. For each query record:
      the query text, the judgment IDs that are correct answers, and **why**
      (a column, a citation-graph edge, a section number) — provenance, never
      an opinion.
- [ ] **A1.2** The 5 BNS/BNSS/BSA mapping queries **depend on Workstream C1**
      (IPC↔BNS mapping). Sequence C1 before A1.2 or these five cannot have
      ground truth.
- [x] **A1.3** The 5 Hindi queries: Hindi judgments exist in the corpus
      (`judgments.language = 'hi'`). Confirm there are enough to build 5 real
      queries; if not, that is a finding, not a reason to write English
      queries and call them Hindi.
- [x] **A1.4** Store as versioned data, not code — a JSON fixture with a
      `version` and a `builtAt`, committed. `TRAINING_STRATEGY.md` §1 requires
      model-agnostic, versioned, provenance-carrying format. Build it that way
      from the first row so it is training-asset-shaped already.

## A2 · The adversarial set — 5 documented `nisaar` errors

All five are already written down in `docs/DATASETS.md`. **Correct behaviour is
refusal or an honest unverified state**, never a plausible answer.

- [x] **A2.1** Bail application drafted for a _civil employment_ matter
      (_Central Inland Water Transport Corp v. Brojo Nath Ganguly_). A company
      cannot be granted bail; there is no arrest and no criminal proceeding.
- [x] **A2.2** Fabricated dissent in a judgment that was unanimous.
- [x] **A2.3** _Indra Sawhney_ stated backwards — Art. 16(4A) was inserted by
      the 77th Amendment in 1995, three years **after** the 1992 judgment.
- [x] **A2.4** IP-law implications drawn from a labour judgment.
- [x] **A2.5** A criminal question with no date given (so no regime can be
      determined — IPC before 1 Jul 2024, BNS after).
- [x] **A2.6** Assert the _pass condition_ precisely: refusal or honest
      unverified. A confident wrong answer and a plausible hedge both fail.

## A3 · The six metrics

Every one reported every run — **not just the failures**.

- [x] **A3.1** `hallucinationRate` — references shown as verified that no tier
      confirms ÷ total references. **Threshold 0.0%.**
- [x] **A3.2** `silentDropRate` — references removed without an unverified
      state shown. **Threshold 0.0%.** Reads `citation_checks.shown_to_user`.
- [x] **A3.3** `staleOverruledRate` — `overruled_status != none` rendered
      without `LAW MOVED`. **Threshold 0.** Graded as severely as a
      hallucination.
- [x] **A3.4** `overruledLeakage` — **threshold 0**.
- [x] **A3.5** `precisionAt5` — **≥ 0.7**, per the definition fixed in A0.4.
- [x] **A3.6** `adversarialPassRate` — **100%**. Reproducing any known-bad
      output is a fail.
- [x] **A3.7** Runner exits non-zero on any breach and prints every number.
      A gate that only speaks when it fails teaches people to ignore silence.

## A4 · Wire it in

- [x] **A4.1** `pnpm harness` runs the whole thing against a real database.
- [x] **A4.2** Add to `scripts/ci-local.mjs` — but **as its own step that can
      be run standalone**, because it is slower than the rest and will be run
      on demand far more often than CI runs.
- [x] **A4.3** Record the first real run's numbers in `sprints/SPRINT_2.md`.
      If any threshold breaches, **that is the finding** — do not tune the
      threshold, and do not proceed to Workstream D. `SPRINT_2.md` NEVER list:
      _"Weaken a threshold to pass a gate. All five are zero or absolute."_

## A5 · The human half of the gate

- [x] **A5.1** Gate S2 requires **an advocate reviews 20 outputs** for the
      relevance failure the harness cannot see. Per `PID.md` they can block
      the gate and engineering cannot overrule it. **Founder item** — goes to
      `FOUNDER_QUEUE.md`; the automated half does not wait for it.

---

---

## WORKSTREAM A — STATUS 8 Aug 2026

**Built and observed.** `pnpm harness` runs against the real corpus and **Gate S2
FAILS**, which is the finding, not a bug. Numbers and the four findings:
`sprints/SPRINT_2.md` §FIRST REAL RUN.

Ticked above means BUILT AND RUN, with these three exceptions stated rather than
hidden:

- **A3.1 · A3.2 · A3.6** (hallucination, silent drop, adversarial) are
  implemented and wired, and report **NOT MEASURED**, which the grader treats as
  a failure. They need the generation path, which needs a model key this
  deployment does not have. `docs/FOUNDER_QUEUE.md`.
- **A1.2** stays open: the five BNS/BNSS/BSA queries need `statute_mappings`,
  which C1 fills. The C1 blocker is now solved (India Code handles for the
  repealed Acts, found 8 Aug) but the ingest is not written.
- **A5.1** is queued to the founder. That is its completion for this lane; the
  automated half does not wait for it.

**E1.2 (the alert drill) is NOT done and is not ticked.** S6 claimed "every alert
fires in a drill" and no drill has ever run. E1.1 is done — and the first version
of it passed while testing nothing, which is why E1.2 will not be ticked until it
has been observed.

Building E1.2 turned up the reason a drill was worth running: **two of PD-5's
four triggers cannot fire.** `alert_kind` holds two values, `citations/fanout.ts`
is the only writer of `alerts`, and there is no enum value or code path for "a
judgment in one of the advocate's own matters is uploaded" or "a matter is listed
on a date they did not know about". `users` nonetheless carries
`alert_own_matter_judgment` and `alert_unknown_listing`, and `PATCH /me/alerts`
persists both — two switches governing notifications the system cannot produce.
PD-6's "a newly discovered listing for tomorrow" is the second of these, and it
is the exception about missing a hearing. Full account in
`docs/FOUNDER_QUEUE.md`.

# WORKSTREAM B — Training data capture ⏳ CLOSING WINDOW

**This is the founder's stated priority and it has a deadline that already
passed.** `TRAINING_STRATEGY.md` §3: _"Wire the consent and the logging in S3,
even though training is far later. **A signal not captured in S3 is not
recoverable in month twelve**, and asking for retrospective consent is a
conversation nobody wins."_

**S3 is complete. None of it was wired.** Verified 8 Aug 2026:

- no training-consent column on `users`
- no `training/` directory, no pair emitter
- (`.gitignore` _does_ now cover `training/` — that half was fixed)

Every day of real usage from launch onward without this is data we cannot
lawfully or practically recover.

## B0 · Research

- [ ] **B0.1** Read `docs/TRAINING_STRATEGY.md` in full (249 lines) — §3b
      _"Licensing constraints on the corpus — unresolved"_ especially. There
      may be a live constraint on licensing the citation graph that changes
      what consent must say.
- [ ] **B0.2** Research DPDP Act consent requirements for **secondary use of
      personal data for model training** in India. Specific question: is
      separate, granular, withdrawable consent required, and what must the
      notice say? This determines the column shape, not just the copy.
- [ ] **B0.3** Research what "withdrawal" must do mechanically — if an
      advocate withdraws training consent in month 8, must already-extracted
      pairs be deleted, or only future capture stopped? Answer before
      designing the schema; retrofitting deletion semantics is expensive.

## B1 · Consent — schema and endpoint

- [ ] **B1.1** `users.training_consent_at` + `training_consent_version`,
      mirroring the PD-8 pair. **Separate from PD-8** —
      `TRAINING_STRATEGY.md`: _"Consent here is specific and separate from the
      PD-8 onboarding consent... Using an advocate's accepted drafts as
      training input is a different question and gets its own answer."_
- [ ] **B1.2** Default is **no consent**. An unset pair means not given, and
      that must be a state the system can see — never inferred from silence.
- [ ] **B1.3** Endpoint to grant and **withdraw**. Withdrawal is a first-class
      operation, not a support ticket.
- [ ] **B1.4** Update `docs/SCHEMA_TRUTH.md` and `docs/API_CONTRACTS.md` in
      the same commit. Additive to the contract — flag to RCC.
- [ ] **B1.5** Test: capture writes **nothing** for a user without consent.
      Assert the absence, since an absence is what rots silently.

## B2 · Capture — the signals already being recorded

Good news: the flywheel's raw signals are **already in the schema**. What is
missing is consent-gating and extraction, not instrumentation.

| signal                          | table                  | strength                          |
| ------------------------------- | ---------------------- | --------------------------------- |
| what they searched              | `searches.query_text`  | weak                              |
| what was shown, in what state   | `citation_checks`      | context                           |
| **what they copied out**        | `citation_copies`      | **strong** — they took it to Word |
| **what they saved to a matter** | `judgment_annotations` | **strongest**                     |
| drafts kept / corrected         | `documents`            | strongest, once drafting ships    |

- [ ] **B2.1** Build `training/` extraction as a **read-only job over existing
      tables**, consent-gated. Nothing new to instrument for search/copy/save.
- [ ] **B2.2** Emit model-agnostic, versioned pairs with provenance — never
      coupled to a chat template (`TRAINING_STRATEGY.md` §1).
- [ ] **B2.3** **Never** extract from uploaded client documents or matter
      notes. Confidential third-party data; DPDP breach regardless of consent
      wording. Assert this in a test, not a comment.
- [ ] **B2.4** The harness (Workstream A) is the first gold set —
      `TRAINING_STRATEGY.md` §3 _"S2 — the harness becomes gold data."_
      Emit from it once A is green.

## B3 · What we are NOT doing, and why — record it

- [ ] **B3.1** Write the reasoning into `TRAINING_STRATEGY.md` so it is not
      relitigated: **fine-tuning a generative model on judgments would make
      our core risk worse.** `CLAUDE.md`: _"The model never emits a citation
      from memory."_ Fine-tuning on the corpus teaches exactly that — a
      confident, correctly-formatted, unverifiable citation. Research framing
      confirms it: _RAG handles knowledge that changes over time; fine-tuning
      handles behaviour that should not._ Whether a case was set aside last
      March is knowledge that changes.
- [ ] **B3.2** Record that **BGE-M3 stays**. InLegalBERT (5.4M Indian legal
      docs) is real and good, but it is MLM/NSP-pretrained — not contrastively
      trained for retrieval — and **English-only**, against a standing Hindi
      commitment. Domain-adapt BGE-M3 later; do not replace it.
- [ ] **B3.3** Embedding fine-tune is a **post-launch** item — target after
      ~50 real users, ~1 GPU-hour, measured against precision@5 (A3.5). With
      zero users there is nothing to learn from.
- [ ] **B3.4** First generative fine-tune stays gated at **₹3L MRR**, Qwen3
      32B QLoRA (~$14), and **must beat the RAG-only baseline on our own
      harness or it does not ship**. The harness in Workstream A is what
      makes that gate enforceable — another reason A comes first.

---

# WORKSTREAM E2b — matter sharing binds only if the invitee already had an account

**Found 8 Aug 2026 while fixing the sharee read path RCC caught.** The read
path is fixed and shipped. This is the _second_ gap behind it, and it is not
fixed:

`createShare` resolves `invited_user_id` at invite time by matching the typed
identifier against `users.bar_enrolment_number` or `users.phone`. If the
invitee has no account yet it stores `null`, and the code comment says **"the
share binds when they arrive."** Nothing binds it. Grepped: no path anywhere
writes `invited_user_id` after insert.

So: invite a colleague who has not signed up → they sign up → **they still
cannot see the matter, permanently.** The invitation looks successful to the
owner and does nothing.

- [ ] **E2b.1** Bind pending shares at the moment a user gains an identifier —
      `patchMe` in `auth/account.ts`, where `phone` and
      `bar_enrolment_number` are set, and at profile creation.
- [ ] **E2b.2** **Do NOT resolve access by identifier at read time.** It is the
      tempting one-line fix and it is wrong: Indian mobile numbers are
      reassigned, so a stranger who later receives that number would inherit
      access to a matter. Bind once, at a precise auditable moment, and never
      re-bind.
- [ ] **E2b.3** Test: invite by phone before signup → sign up → access works.
      And: binding happens once, so changing a phone number later does not
      hand access to whoever receives the old one.

---

# WORKSTREAM C — Corpus completion

## C1 · IPC↔BNS mapping — the last open S1 criterion

`statute_mappings` is **0 rows**. `SPRINT_1.md` DONE requires it spot-checked
on 20 sections with the **rejected** count reported alongside accepted.

Methodology is already written in `docs/DATA_SOURCES.md` §4 and satisfies
`DOMAIN_TRUTH.md` (verification, not generation).

- [ ] **C1.1** **Research:** find the correct indiacode index for **repealed**
      Acts. The 845-Act Central Acts browse does not contain IPC/CrPC/Evidence
      — a `browse?type=shorttitle&q=` attempt returned nothing. Resolve
      handles **against the site, not by guessing** — a previous guess had
      BNSS and BSA transposed and pointed one at the Post Office Act.
- [ ] **C1.2** Ingest IPC, CrPC, Indian Evidence Act via the existing
      `fetchAct`/`fetchSections`/`upsertAct` path.
- [ ] **C1.3** **Research + fetch** the UP Police BNS↔IPC comparative table
      (23pp, two-column). Record clearly that it is a **state police
      publication, not the Gazette** — `DATA_SOURCES.md` is explicit that this
      caveat _"must not be laundered into 'official'."_
- [ ] **C1.4** Also fetch the BPRD/MHA handbook as a **cross-check** source,
      not a primary one (narrative, not a full mapping).
- [ ] **C1.5** Parse the table into **candidate** pairs. Candidates are not
      mappings.
- [ ] **C1.6** Build the comparator: compare BNS section text (ours, from
      indiacode) against IPC section text (C1.2). **Store only pairs whose
      text corresponds. Flag the rest. Never store a guess.**
- [ ] **C1.7** Populate `statute_mappings` with `relationship`
      (exact/split/merged/no_equivalent) — the schema already models
      non-1:1 mappings, which is correct because _"some sections split, some
      merge."_
- [ ] **C1.8** Hand-check 20 and **report the rejected count alongside the
      accepted** — the S1 criterion names both.
- [ ] **C1.9** Unblocks A1.2 (the 5 BNS mapping harness queries).

## C2 · eCourts — 🔴 BLOCKED ON THE FOUNDER

Grant made 7 Aug 2026. `AUTHORISATION` is `null`; the guard refuses everything
while it is, **including with the kill switch on**. Zero requests ever made.

- [ ] **C2.1** **Founder must supply nine fields** from the letter:
      `reference` · `grantedOn` · `expiresOn` · `attribution` (verbatim) ·
      `permittedCourts` · `permittedHoursIst {from,to}` · `minIntervalMs` ·
      `maxRequestsPerHour` · `maxRequestsPerDay`.
      **If the letter is silent on a limit, transcribe the conservative
      value — never "unlimited."**
- [ ] **C2.2** Transcribe into `services/api/src/court/authorisation.ts`.
- [ ] **C2.3** Record the letter in `docs/ECOURTS_AUTHORISATION.md` with its
      reference.
- [ ] **C2.4** Flip `platform_config.ecourts_harvest` **with a reason** —
      now possible via `POST /admin/platform/kill-switches/:key`, built 8 Aug.
- [ ] **C2.5** Verify the rate limiter enforces every stated condition and the
      fetch ledger records timestamp/endpoint/court per request, so _"did we
      stay inside the grant"_ is answerable **by query, not by memory**.
- [ ] **C2.6** Only then: the cause-list parser (`parseCauseList` is a
      deliberate stub — no captured real response exists to write an extractor
      against). **Capture a real response first.** A cause-list parser wrong in
      a plausible way is, per its own module note, the single most dangerous
      object in this product.
- [ ] **C2.7** Then trigger 4 (unknown listing) and the advocate-facing
      `GET /cause-list` become buildable.

## C3 · Corpus verification

- [ ] **C3.1** Count SC judgments in the DB and confirm 1950–2025 complete
      against `SPRINT_1.md`. **Count it, do not recall it.**
- [ ] **C3.2** Confirm p95 retrieval < 3s on production (last measured 428ms).
- [ ] **C3.3** Investigate the 22 `sectionless` Acts — genuinely sectionless
      (old amending Acts) or a second parser gap? Same class as the bug fixed
      8 Aug.

---

# WORKSTREAM D — The 14 SPECCED endpoints

**Do not start before Workstream A is green.** `SPRINT_2.md`: do not proceed
to S3+ on a failing harness — and we are already past that, so the correct
move is to close the gate rather than widen the breach.

## D1 · Buildable today, nothing external

- [ ] **D1.1** `POST /admin/overruled-rechecks/run`. Needs `runRecheck` lifted
      from `services/cron` into a shared package — **cron depends on api, not
      the reverse**, so the API cannot import it directly. Returns its result
      synchronously (no job queue exists, and the contract already accepts a
      synchronous result).

## D2 · Drafting — needs a key + one reviewed template

**Cost is settled and negligible.** DeepSeek V4 Flash: **$0.14/1M input,
$0.28/1M output**, **5M free tokens on signup, no credit card**. A draft is
~3,500 in / 2,000 out ≈ **$0.001**. The free tokens cover ~1,400 drafts.

- [x] **D2.1** ~~**Founder:** sign up, supply `OPENROUTER_API_KEY`~~ — **DONE
      9 Aug 2026.** Key supplied and verified by a live call; DeepSeek V4 Flash
      costs **$0.098/$0.196 per M tokens** and a full gate run is **$0.007**.
      Original text: sign up, supply `OPENROUTER_API_KEY` (or DeepSeek
      direct). Also `SENSITIVE_LLM_API_KEY` for the pseudonymised path —
      routing is by **data sensitivity, not task difficulty**.
- [ ] **D2.2** **Founder:** one `bail` template, reviewed by one advocate.
      **One, not ten.** Template prose is primary-sourced legal content
      neither agent may invent.
- [x] **D2.3** **BUILT 9 Aug 2026** — `services/api/src/llm/`, 21 tests.
      `route.ts` decides (pure, no network) and `call.ts` executes and ledgers.

      **Three refusals, all of which had no enforcement anywhere before:**
      - **Sensitive traffic is refused without a countersigned DPA** (OD-6),
        **no founder override**. Defaults false; an unset or malformed value is
        a refusal, not consent.
      - **Sensitive traffic is refused even WITH the DPA**, because no
        pseudonymiser exists. Sending raw client text while recording
        `pseudonymised = true` would put a false claim in the audit ledger.
      - **Drafting refuses rather than guessing a model id.** `CLAUDE.md` §5
        names Sonnet 4.6; I have not verified an identifier, so
        `ANTHROPIC_DRAFTING_MODEL` supplies it. The two ids that ARE hard-coded
        were verified by live calls today.

      **`assertOneDocument` is a guard the caller must pass**, not a convention
      it must remember — mixing case files conflates parties between two of the
      SAME advocate's clients and the output reads perfectly fluent.

      **A failed call still writes its ledger row**; a refused route writes
      none; and a ledger write failure never fails the call, because that would
      double-spend.
- [ ] **D2.4** `POST /documents` — the model receives **judgment IDs in
      context and may reference only them** (`CITATION_HARNESS.md` step 2).
- [ ] **D2.5** `POST /documents/:id/export`. **Skip R2 for MVP** — stream the
      `.docx` to the client instead of storing it. Removes a moving part.
      (R2 free tier is 10GB + $0 egress if we do want it later.)
- [ ] **D2.6** Research: OSS `.docx` writer, MIT/Apache/BSD only (AGPL is
      **not** acceptable per `OSS_STACK.md`). Must survive Word with styles
      intact — S4 DONE requires testing **in Word, not a viewer**.
- [ ] **D2.7** `POST /documents/:id/review`, `/compare`, `/uploads/:id/chat`.

## D3 · OCR — blocked by the DPA, and cuttable from v1

- [ ] **D3.1** **Founder:** countersigned DPA (OD-6). Gates uploads entirely,
      with **no founder override**.
- [ ] **D3.2** **Recommend: cut OCR from v1.** It is the only thing the DPA
      blocks; cutting it removes a launch blocker outright. Founder decision.
- [ ] **D3.3** If kept: `POST /ocr/jobs`, `GET /ocr/jobs/:id`, `/confirm`.
      **Nothing derived is written to a matter until `/confirm`.**

## D4 · Templates admin — after D2.2

- [ ] **D4.1** `draft_templates` table does not exist. Create it **as part of
      this work**, not before — `schema.ts`: _"a deferred table created 'while
      you're in there' is exactly what that decision forbids."_
- [ ] **D4.2** The 4 `admin/templates` endpoints. `publish` refuses below
      score 90 unless `overrideReason` is present, and the override writes
      `template.override_gate` to the ledger.

## D5 · `GET /admin/privacy/coverage` — 🔴 needs a decision

Two authoritative docs disagree. `SCHEMA_TRUTH.md` describes a formula that is
**tautological** — `pii_entities` stores only what _was_ caught, so a ratio of
it against itself cannot measure what was missed. `PRIVACY_PII.md` says ~80%,
explicitly an estimate pending an evaluation never run.

- [ ] **D5.1** **Founder decides** what this screen may claim. Recommended:
      report the honestly computable operational metric — % of sensitive-class
      calls pseudonymised before dispatch (from `llm_calls.pseudonymised`) —
      **labelled as exactly that**, not as PII recall.
- [ ] **D5.2** Whichever is chosen, reconcile both docs in the same commit.
- [ ] **D5.3** Never claim complete PII removal. Coverage is partial. Say so.

---

# WORKSTREAM E — Sprint gaps found in the audit

## E1 · S6 gaps (my lane)

- [x] **E1.1** S6 DONE: _"kill the ledger write in a test and assert the
      action rolls back."_ I tested that the audit row **appears**; I did not
      test that the action **rolls back when the ledger write fails**. That is
      the actual guarantee. Build it.
- [ ] **E1.2** S6 DONE: _"Every alert fires in a drill."_ Never run. Needs a
      drill covering the four PD-5 triggers and the two immediate exceptions.
- [ ] **E1.3** ✅ _"append-only trigger provably rejects an UPDATE"_ — **done**,
      `packages/db/src/audit-log.test.ts` proves UPDATE, DELETE and TRUNCATE
      all rejected.

## E2 · Admin role — a named, standing gap

Every admin endpoint gates on `userId !== undefined` — **any authenticated
advocate**, not a verified admin. `ADMIN_SURFACE.md` §15 already names this
(_"Role writes are still missing... by design"_).

- [ ] **E2.1** Decide whether launch is acceptable with this. It probably is
      for a closed beta and **is not** once the admin surface is reachable by
      real users. Record the decision and the trigger date.

## E3 · Documentation truth

- [ ] **E3.1** `draft_templates` and `pii_entities` are documented in
      `SCHEMA_TRUTH.md` with **no `CREATE TABLE` anywhere**. Found by sweep
      after three such gaps in a row. Create each with the work that uses it.
- [ ] **E3.2** Make the sweep a permanent gate: a script asserting every
      `## table` heading in `SCHEMA_TRUTH.md` has a real `CREATE TABLE`.
      Three tables reached production-adjacent code before anyone noticed;
      this is mechanically checkable and must be.

---

# WORKSTREAM F — Standing research

The founder's instruction: **deep dive, do not take the first search result.**

- [ ] **F1** Indian legal IR evaluation methodology (IL-TUR, CLERC, and the
      Document-Level Retrieval Mismatch finding). Feeds A0.3/A0.4.
- [ ] **F2** DPDP secondary-use consent for model training. Feeds B0.2/B0.3.
- [ ] **F3** OSS `.docx` writers, licence-checked. Feeds D2.6.
- [ ] **F4** Embedding fine-tuning for legal retrieval — method, cost,
      expected precision@5 lift. Feeds B3.3. **After launch.**
- [ ] **F5** eCourts cause-list response shape — only once C2 is authorised
      and a **real captured response** exists. Never from an assumed shape.

---

# SEQUENCE

1. **A** — harness. Nothing from the founder. Closes the hard stop.
2. **C1** — IPC↔BNS. Closes the last S1 criterion, unblocks A1.2.
3. **B1** — training consent. The window is closing every day of usage.
4. **D1** — the one unblocked endpoint.
5. **E1/E3** — sprint and documentation gaps.
6. **D2** — drafting, when the key and one template land.
7. **C2** — eCourts, when the letter lands.

---

# WAITING ON THE FOUNDER

| #   | item                                         | blocks                                  |
| --- | -------------------------------------------- | --------------------------------------- |
| 1   | eCourts letter — nine fields                 | all of C2, trigger 4, `GET /cause-list` |
| 2   | LLM key (free to start)                      | D2 — drafting only, **not launch**      |
| 3   | One `bail` template, advocate-reviewed       | D2, D4                                  |
| 4   | Countersigned DPA — **or cut OCR from v1**   | D3 only                                 |
| 5   | `privacy/coverage` — what may it claim?      | D5                                      |
| 6   | OD-11 — Tier B vs the sprint plan as written | sprint doc truth                        |
| 7   | Advocate to review 20 harness outputs        | A5 — the human half of Gate S2          |
| 8   | `ink-faint` below WCAG AA (RCC)              | a device-pass criterion                 |
| 9   | Gate S1 "1M+ documents" re-spec acceptance   | formal S1 closure                       |
| 10  | Admin role before public launch (E2)         | security posture                        |
