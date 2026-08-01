# LAWMIND — BUILD GUIDE

> Restructured 1 Aug 2026. **Four lanes collapsed to two.** This changed the
> sprint plan more than it changed the code.

## Method
Two agent lanes in parallel within one sprint. Hard gate. Then advance.
**Never two sprints concurrently.**

## Lanes and ownership

| Lane | Owns | Never touches |
|---|---|---|
| **LCC — Server** | Database, migrations, API, corpus ingest, retrieval, the verification pipeline, cron, the OCR service, admin endpoints | Anything a user sees. No screens, no components, no client state |
| **RCC — Client** | The Expo app, the admin web interface, auth integration, PII pseudonymisation at the client boundary | Database, migrations, retrieval, cron internals |

### The contract matters more now, not less
The old four-lane plan had CX1 and CX2 building against mocks in parallel with
LCC. With two lanes there is **one seam instead of three**, and everything crosses
it: `docs/API_CONTRACTS.md`.

**RCC builds against it with mocks. LCC implements to it.**

**The contract is frozen at the start of each sprint.** A mid-sprint change
requires telling the other lane explicitly — there is no third lane to absorb the
mismatch, so an unannounced shape change stalls half the sprint.

Sprints get longer and each carries fewer parallel threads. That is the trade:
less coordination overhead, less concurrency.

## Sprints

| # | LCC — Server | RCC — Client | Gate — observed, not assumed |
|---|---|---|---|
| **S0** | Monorepo, Railway project, Postgres + pgvector, every table in `docs/SCHEMA_TRUTH.md`, CI | Expo shell, navigation for every screen, NativeWind, TanStack Query, SecureStore, Devanagari bundled, admin shell | `railway up` green · migrations apply · app builds both platforms · Hindi renders with correct glyphs |
| **S1** | Ingest SCI + all 25 High Courts, target **1M+**. BNS/BNSS/BSA with section mapping. Bare acts library. Chunk, embed, index | Search UI, results list, judgment reading view with paragraph anchors | **1M+ documents indexed** · a known citation retrieved **< 3s** |
| **S2** | Three-tier pipeline, `citation_checks`, `verification_cache`, the harness, the adversarial set | **The inverted trust UI** — silent when verified, loud on exception. Unverified detail screen, eCourts path | **Zero unverified shown as confirmed · zero silent drops · 100% adversarial pass · advocate sign-off** |
| **S3** | Court adapter, matter CRUD, nightly sweep, briefing generation, cause list aggregation, push | Today, Matters, matter detail, briefing view, adjournment capture, client share | A briefing lands on a real device 24h before a real listing · a cause list renders for a real advocate's matters |
| **S4** | 10 templates, generation, paragraph edit with citations locked, `.docx` + PDF export, limitation and court-fee calculators | Drafting flow, editor, export, calculator UI | Advocate approves **>90% of 50 drafts** · `.docx` opens cleanly in Word · citations cannot be free-text edited |
| **S5** | Auth endpoints, subscriptions, IAP receipt validation, Razorpay firm invoicing | Onboarding **including the consent screen**, paywall, profile, settings, privacy disclosure | Signup → subscribe → use, on both platforms |
| **S6** | All 17 admin sections, audit ledger, monitoring, alert thresholds | Admin UI aligned to current tokens | All alerts fire in a drill · the audit ledger records every privileged action |
| **S7** | — | ASO assets, store listings, screenshots, submission | Both apps approved · **15 of 20** beta users opening 3+ times in week one |

## Gate S2 is a hard stop
If verification is not clean, nothing downstream matters. **Do not proceed to S3
to keep momentum.** This is the instruction most likely to be rationalised away
under schedule pressure.

`PID.md`: the practising advocate on retainer performs QA before **every** gate and
**can block any gate. Engineering cannot overrule that.**

## Blocked until resolved

| OD | Blocks |
|---|---|
| **OD-4** embeddings provider | **S1** — corpus ingest cannot start |
| **OD-1** court vendor | **S3** — the daily loop has no data |
| **OD-7** OCR engine | **OCR in S4** — scanned intake only; the rest of S4 proceeds |
| **OD-6** sensitive-class provider | Any feature sending uploaded document content to a model |
| **OD-9** ASO tool | **S7** — keyword ranking cannot be done by guessing |
| **OD-3** Play billing terms | Finalising billing in S5 |
| **OD-2** DPDP residency | Public launch, not build |
| **OD-5** Hindi scope | S4 scope only |

**S0 is blocked by nothing.**

## Sequencing rule — Tier B before Tier A
The daily loop ships before the library. **The loop creates the habit; the library
only prevents a feature-comparison loss.** An advocate does not open an app daily
for a bare acts library. `PRD.md` §Scope.

## Dispatch pattern
Each sprint has `sprints/SPRINT_N.md` with one `## LCC` and one `## RCC` block,
each pasting into its own session. Blocks state **OWN paths · TASK · BLOCK ON ·
DONE · NEVER**.

Because there are only two agents, each block is **substantially more detailed**
than the four-lane version — assume the agent has the docs and nothing else.
