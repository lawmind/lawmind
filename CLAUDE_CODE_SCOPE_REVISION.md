# CLAUDE CODE — MAJOR SCOPE REVISION AND 2-AGENT RESTRUCTURE

Paste in the repo session. This changes the product scope, the trust model, the
model strategy and the sprint structure. Read all of it before editing anything.

---

## 0 — What changed and why

Four decisions from the founder, each with consequences across the docs.

**Thailand is out of v1.** Thailand is a civil-law jurisdiction — precedent is not
binding, the Supreme Court is not bound by its own decisions, and pleadings are in
Thai. Our citation-verification moat is a common-law product and does not
transfer. India only. Revisit after ₹1Cr ARR. Remove Thai from every language
list; keep the i18n architecture multi-language so adding a locale later is not a
rewrite.

**The goal is now scope leadership, not minimum viability.** Target: the most
data-rich, most useful legal application for Indian advocates. The benchmark
competitor is **Law4u** — 1M+ judgments, 701+ Acts, 11,000+ drafts, 18 languages,
a Legal AI beta, advocate finder, law dictionary. We must match its library and
beat it on the daily loop.

**The trust UI inverts.** See §2. This is the most delicate change in this
document — read it fully before touching any code or copy.

**Two agents, not four.** See §6.

---

## 1 — Model strategy update

Newer open-weight models supersede the earlier picks. Update `TRD.md` §LLM and
`docs/DATASETS.md`.

| Role | Model | Why |
|---|---|---|
| API workhorse — search, lookup, extraction | **DeepSeek V4 Flash** | Cheapest capable, MIT, 1M context |
| Premium tier — drafting, briefings | **Claude Sonnet 4.6** | Unchanged |
| **Fine-tune base (revised)** | **GLM-5.2** | 744B MoE / 40B active, 1M context, **MIT**, weights on Hugging Face, ~168 tok/s — roughly 3× DeepSeek V4 Pro and Kimi K3 throughput. Replaces Qwen3.6-35B-A3B as the fine-tune target |
| Evaluate later | Kimi K3 | 2.8T, weights released 27 July 2026, Modified MIT, 2–17× the token cost. Note only |

Throughput is the reason GLM-5.2 wins the fine-tune slot: an advocate waiting on
a draft feels tokens per second directly.

Fine-tuning still does not start before ₹3L MRR. Record explicitly in
`docs/DATASETS.md`: **the licensable asset is the verified corpus and the data
flywheel, not the weights.** Frontier labs give weights away free; nobody else can
assemble 2M+ advocate-validated query-response pairs on Indian law.

---

## 2 — Trust UI inversion — verified goes silent

**This replaces the five-badge system in the UI. It does not change the data model
or the verification pipeline.**

### The change

**Verified is silent.** No badge, no chip, no tick. Verification is the expected
state; decorating it is noise and it is what makes the current screens feel
defensive.

**The exception is loud.** Only two states render:

- **`unverified`** — a visible, unmissable mark. "We could not confirm this
  reference." Plus the eCourts path.
- **`overruled`** — the existing `LAW MOVED` treatment, with its three
  sub-states.

Everything else renders clean. On a typical five-result list that is zero badges
instead of five.

### What must not change

The pipeline is untouched. Three tiers, `verification_state`,
`verified_by_source`, `overruled_status`, the fan-out, the never-cached rule, the
zero thresholds on hallucination rate and silent-drop rate — all binding, all
unchanged. `citation_checks` still writes a row per citation per surface.

**Silent-drop rate remains zero.** Silence means "we verified this and are not
decorating it." It never means "we removed something without saying so." An
unverified citation is still always shown, always marked.

### Where verification stays visible

Three places, because the user is asking rather than being told:

1. **Draft footer** — "4 of 4 citations verified" as a one-line summary
2. **On tap** — tapping a citation shows how it was verified and by which source
3. **Admin citation monitor** — unchanged, full state visibility

### The AI-assisted draft mark — removed from the document

Replaced by **explicit consent at onboarding**: a screen the advocate must
actively accept, covering AI assistance, the duty to verify before filing, and
the terms of legal use. Record acceptance with timestamp and terms version in
`users`.

The exported document carries no watermark and no hatched margin.

Keep two things: a single line in the export metadata, and the one-line citation
summary in the draft footer while in-app. Update `PRODUCT_DECISIONS.md` PD-8 to
record that this supersedes the earlier mark, with the reasoning: an advocate is a
professional who has explicitly accepted the terms, and a watermark on a court
filing is both patronising and a competitive disadvantage.

### Everything else goes quiet

The privacy disclosure moves to onboarding and a settings page. It does not
appear during use. OCR field confirmation stays — that is a data-correctness step,
not a warning — but drop the cautionary language and present it as a normal
review.

Update: `docs/CITATION_HARNESS.md` (§UI rendering only), `design/DESIGN_SYSTEM.md`,
`design/SCREENS.md`, `PRODUCT_DECISIONS.md`, `docs/PRIVACY_PII.md`,
`.claude/hooks/reanchor.sh`.

---

## 3 — Scope expansion — the library and the daily loop

Two tiers. Library features are table stakes against Law4u. Loop features are what
make an advocate open the app every morning.

### Tier A — library parity (we cannot be smaller than Law4u)

| Feature | Notes |
|---|---|
| Bare acts library | 700+ Central and State Acts, full text, searchable. BNS / BNSS / BSA first-class with IPC↔BNS mapping |
| Judgment corpus at scale | Target 1M+. Expand beyond the 5-year SCI slice to all 25 High Courts and available District data |
| Draft template library | 10 AI-generated types plus a static library of standard formats |
| Legal dictionary | Terms, Latin maxims, procedural vocabulary. Cheap, expected |
| Court rules and practice directions | Supreme Court and per-High-Court |
| Limitation calculator | Enter cause of action date and relief; get the limitation period and the deadline. **Missing a limitation period is malpractice — this is the highest-anxiety calculation an advocate makes** |
| Court fee calculator | Per state, per suit value |

### Tier B — the daily loop (this is the addiction)

| Feature | Why it drives daily opening |
|---|---|
| **Hearing briefing** | Existing wedge. Nightly. Unchanged |
| **Daily cause list** | Every matter listed today, across all courts, in one screen. The first thing an advocate checks each morning |
| **Client update sharing** | One tap to share a matter status as a clean summary over WhatsApp. **This is the viral loop** — every share carries our name to a client and to opposing counsel |
| **Adjournment capture** | Next date given orally in court, entered in three taps while still in the courtroom |
| **Limitation and deadline alerts** | Tied into the same evening briefing rhythm |
| **Fee and appearance log** | What was billed, what was appeared in. Advocates track this on paper today |

Record all of it in `PRD.md` under Tier A and Tier B, and add the new items to
`design/SCREENS.md` as `NOT YET DESIGNED`. Do not design them — that is a Claude
Design task.

**Sequencing rule to record explicitly:** Tier B ships before Tier A. The loop
creates the habit; the library only prevents a feature-comparison loss. An
advocate does not open an app daily for a bare acts library.

---

## 4 — ASO workstream — new

App store discovery is the primary acquisition channel and nothing exists for it.
Create `docs/ASO.md`.

Competitor apps to analyse, all live on the Indian store: Law4u, Notify Court Case
Status, Lawyyar, LegalKart Lawyer, SupremeToday.

For each, record: exact title and subtitle, keyword field where visible,
screenshot narrative order, review volume and rating, update cadence.

Then draft our own:

- **Title** — 30 characters, must carry the primary keyword
- **Subtitle** — 30 characters
- **Keyword field** — 100 characters, iOS, comma-separated, no spaces, never
  repeat a word already in title or subtitle
- **Play long description** — keyword density matters on Play, not on iOS
- **Screenshot order** — first two screenshots carry ~90% of the conversion
  decision

Candidate keyword clusters to research and rank by volume against difficulty:
case status, cause list, court case, advocate, lawyer app, legal research, bare
act, BNS, judgment search, case diary, legal draft, limitation period.

**Do not invent volume numbers.** Record the clusters, mark them as requiring a
real ASO tool — AppTweak, Sensor Tower or App Radar — and flag that as a decision
for the founder. State plainly which figures are unknown.

Add **OD-9: ASO tool selection** to `docs/OPEN_DECISIONS.md`.

---

## 5 — Two-agent restructure

Four lanes collapse to two. This is the biggest structural change in this
document, and it changes the sprint plan more than it changes the code.

### The new lanes

**LCC — Server.** Everything backend: database, migrations, API, corpus ingest,
retrieval, the verification pipeline, cron jobs, the OCR service, admin
endpoints.

**RCC — Client.** Everything a user touches: the Expo app, the admin web
interface, auth integration, PII pseudonymisation at the client boundary.

### What this changes

The old four-lane plan assumed CX1 and CX2 building against mocks in parallel with
LCC. With two lanes, `docs/API_CONTRACTS.md` becomes more important, not less —
RCC builds against it with mocks and LCC implements to it. **The contract is
frozen at the start of each sprint** and a mid-sprint change requires telling the
other lane explicitly.

Sprints get longer and each carries fewer parallel threads. Rewrite
`BUILD_GUIDE.md` with the plan below.

### The sprint plan — rewrite `BUILD_GUIDE.md` to this

**S0 — Foundation.** LCC: monorepo, Railway project, Postgres + pgvector, every
table in `SCHEMA_TRUTH.md`, CI. RCC: Expo app shell, navigation for every screen,
NativeWind, TanStack Query, SecureStore, Devanagari fonts bundled, admin shell.
*Gate: `railway up` green, migrations apply, app builds on both platforms, Hindi
renders with correct glyphs.*

**S1 — Corpus.** LCC: ingest SCI plus all 25 High Courts, target 1M+ judgments.
BNS/BNSS/BSA statutory text with section mapping. Bare acts library. Chunk, embed,
index. RCC: search UI, results list, judgment reading view with paragraph anchors.
*Gate: 1M+ documents indexed; a known citation retrieved in under 3 seconds.*
*Blocked by OD-4 — embeddings provider must be resolved first.*

**S2 — Verification. HARD STOP.** LCC: three-tier pipeline, `citation_checks`,
`verification_cache`, the harness, the adversarial set. RCC: the inverted trust
UI — silent when verified, loud on exception — plus the unverified detail screen
and the eCourts path. *Gate: zero unverified shown as confirmed, zero silent
drops, 100% adversarial pass, advocate sign-off. Do not proceed on a failing
harness.*

**S3 — The daily loop.** LCC: court adapter, matter CRUD, nightly sweep, briefing
generation, cause list aggregation, push. RCC: Today, Matters, matter detail,
briefing view, adjournment capture, client share. *Gate: a briefing lands on a
real device 24h before a real listing; a cause list renders for a real advocate's
matters.* *Blocked by OD-1 — court vendor.*

**S4 — Drafting and tools.** LCC: 10 templates, generation, paragraph-level edit
with citations locked, `.docx` and PDF export, limitation and court-fee
calculators. RCC: the drafting flow, editor, export, calculator UI. *Gate:
advocate approves >90% of 50 drafts; `.docx` opens cleanly in Word; citations
cannot be free-text edited.*

**S5 — Accounts.** LCC: auth endpoints, subscriptions, IAP receipt validation,
Razorpay for firm invoicing. RCC: onboarding including the consent screen, paywall,
profile, settings, privacy disclosure. *Gate: signup → subscribe → use, on both
platforms.*

**S6 — Admin and hardening.** LCC: all 17 admin sections, audit ledger, monitoring,
alert thresholds. RCC: admin UI aligned to current tokens. *Gate: all alerts fire
in a drill; the audit ledger records every privileged action.*

**S7 — Launch.** ASO assets, store listings, screenshots, submission, 20 beta
advocates. *Gate: both apps approved; 15 of 20 beta users opening 3+ times in
week one.*

---

## 6 — Then produce the dispatch files

Rewrite `sprints/SPRINT_0.md` for two lanes and create `sprints/SPRINT_1.md`
through `SPRINT_7.md`, each with one `## LCC` and one `## RCC` block stating OWN
paths, TASK, BLOCK ON, DONE and NEVER.

Because there are only two agents, each block must be **substantially more
detailed** than the four-lane version — assume the agent has this file and the
docs and nothing else.

## 7 — Then stop

Re-run the cross-reference checker and both hooks. Report every change.

State which open decisions now block which sprint. My expectation: OD-4 blocks S1,
OD-1 blocks S3, OD-7 blocks OCR in S4, OD-9 is new and blocks S7.

Do not scaffold the monorepo. S0 is the next session.
