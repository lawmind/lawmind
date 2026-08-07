# LAWMIND — TRD

## Shape
Expo app (iOS + Android) → Hono API on Railway → Railway Postgres + pgvector.
Admin and OCR are separate Railway services. One project, one bill.

## Client
Expo SDK 52+, React Native, TypeScript. StyleSheet + `theme/tokens.ts` —
**NativeWind was removed at the S0 ponytail review** (zero uses, 1.2 MB;
`docs/OSS_STACK.md`). TanStack Query + Zustand.
Expo SecureStore for tokens — never AsyncStorage. Expo push. EAS Build.

## API
Hono, TypeScript. Zod at every boundary. Drizzle only — no string-built SQL.
Structured Pino logs, `request_id` on every line.

## Data
Railway Postgres 16, pgvector. Drizzle migrations, checked in, forward-only.
Shapes in `docs/SCHEMA_TRUTH.md` — that file is authority.

## Retrieval
Hybrid. Postgres full-text (sparse) + pgvector cosine (dense) → reciprocal rank
fusion → cross-encoder rerank → top 5. Chunks ~800 tokens, 150 overlap.
Corpus v1 (OD-4 staged ingest): **Supreme Court complete, 1950–2025** + full
BNS/BNSS/BSA text and the IPC↔BNS mapping. High Courts last 10 years follow;
historical HC is a post-launch background job. **Record the document count at
each stage** — `docs/OSS_STACK.md` §1a.
Scanned judgments pass through OCR first and carry `ocr_confidence`; retrieval
down-ranks low-confidence text.

## Citation verification — three tiers
Tier 1 internal corpus → Tier 2 IndianKanoon cross-referenced against AWS S3
open datasets (citation match, then fuzzy title with recorded score) → Tier 3
eCourts with human CAPTCHA confirmation, cached permanently → Tier 4 explicit
`unverified` state shown to the advocate.

Render every field from the resolved database row, never from model output.
Spec: `docs/CITATION_HARNESS.md`. Binding.

## OCR
Separate Railway service, Python + FastAPI, async queue. PaddleOCR primary,
Tesseract fallback — **OD-7 resolved 2 Aug 2026.** The S4 bake-off on real court scans is tuning, not selection. Pipeline:
classify (skip if digital text layer) → preprocess/deskew → detect script →
OCR → confidence score → field extraction → advocate confirms.
`docs/OCR_PIPELINE.md`.

## LLM routing — by data sensitivity
Public class (judgments, statutes): cheapest capable, DeepSeek V4 Flash for
search, Haiku 4.5 for structure, Sonnet 4.6 for drafting and briefings.
Sensitive class (uploaded documents, matter notes): pseudonymise first, provider
with written data-processing terms only — **OD-6 resolved 2 Aug 2026: Claude.**
Ambiguity resolves to sensitive. **One document per call.** The countersigned DPA
is still owed before uploads ship. `docs/PRIVACY_PII.md`.

Every call rows into `llm_calls` with model, tokens, cost, latency, `data_class`,
`pseudonymised`.

### Model selection — revised 2 Aug 2026

| Role | Model | Why |
|---|---|---|
| API workhorse — search, lookup, extraction | **DeepSeek V4 Flash** | Cheapest capable, MIT, 1M context. **Public class only** |
| Premium — drafting, briefings | **Claude Sonnet 4.6** | Quality where it is filed in court. **Also the sensitive-class provider** — Anthropic has written data-processing terms |
| Premium reasoning — API only | **GLM-5.2** | MIT, ~168 tok/s, roughly 3× DeepSeek V4 Pro and Kimi K3 throughput. Consumed via API; somebody else owns the serving footprint |
| **Fine-tune target** | **Qwen3 32B** or **Gemma 4 26B A4B** | Actually trainable and servable. **~$12–20 per QLoRA run** |
| Not selected | Kimi K3 | 2.8T, Modified MIT, 2–17× the token cost |

**GLM-5.2 is no longer the fine-tune target — reversed 2 Aug 2026, with cause.**
The 1 Aug entry chose it on throughput. That reasoning was right about *inference*
and wrong about *training*: it compared tokens per second and never priced the
serving footprint. **GLM-5.2 is 744B and needs roughly 8×H100 just to serve; Kimi
K3 is 2.8T.** Neither can be QLoRA fine-tuned or self-hosted on this budget, at
any throughput.

**We do not fine-tune GLM-5.2 or Kimi K3. We consume them via API and fine-tune
something we can afford to serve.** Full reasoning and the dataset workstream:
`docs/TRAINING_STRATEGY.md`.

Fine-tuning still does not start before **₹3L MRR**. The model choice is recorded
now so the corpus is collected in a form that suits it, not so it is built.

Parameter counts and throughput figures above are **the founder's stated
rationale, recorded as given — not independently benchmarked here.** Measure
before quoting them externally.

**Sensitive-class routing is resolved (OD-6): pseudonymise, then Claude.** The
countersigned DPA is a **procurement artefact that must still exist** — the rule
the admin surface enforces points at "a provider with terms on file", and that set
is only non-empty once it is signed.

## Embeddings
One-time corpus embedding as a batch job on rented GPU — not on Railway.
Query-time embedding on Railway CPU is fast enough for single queries.
**OD-4 resolved 2 Aug 2026: self-hosted BGE-M3**, batch-embedded on a rented GPU
(Lambda Labs or RunPod). Corpus from AWS Open Data, free and account-free —
`docs/OSS_STACK.md` §1a.

## Court data
Adapter interface, two implementations: manual entry (fully working, ships first)
and vendor API (stub until OD-1, which is still open — trial pending). Nothing above the interface changes when the
vendor lands. eCourts Tier 3 verification shares this interface.

## Jobs
Railway cron, 23:00 IST. Tomorrow's listed hearings → briefing → store → push.
Missed run alerts by 00:30 IST.

## Auth
better-auth, self-hosted. Email magic link via Resend at launch (swapped from Postmark 7 Aug 2026); phone OTP via
MSG91 phase 2. Rotating refresh tokens, 30-day sliding window.

**PD-1 and PD-2 — what is settled, and what is a delivery detail.**

PD-1 settles the *verification model*, not the channel: **the identifier is
whatever number or address the advocate enters, and it need not match the Bar
Council roll.** Bar Council rolls carry stale phone numbers, so gating signup on a
roll match blocks legitimate users before they have seen any value.

**The channel above stands** — magic link at launch, phone OTP in phase 2. PD-1's
wording describes SMS OTP because that is what canvas `11a` /
`design/screens/renders/58-signin-otp@2x.png` draws, and WhatsApp OTP is named
there as a later channel swap. **A channel change is not a decision change**, and
neither this file nor PD-1 should be "corrected" to match the other: the six-digit
OTP screen is the drawn end state, the launch channel is a delivery choice.

**PD-2 — enrolment never gates.** The enrolment number is captured, queued for
manual review, and shown as a quiet band above the header.

> **CONFLICT — flagged, not resolved.** This band is drawn amber in canvas `11a` /
> `renders/58-signin-otp@2x.png`, but the silence pass reserves caution `#B4690E`
> for **the law has moved and nothing else** (`design/DESIGN_SYSTEM.md`
> §Non-negotiable UI rules 3a). A pending enrolment is a fact about us, so by that
> rule it should be neutral ink. **Do not repaint it in code** — it is a drawn
> screen, and the next design pass owns the call.
 Nothing
is withheld while it is pending, and **rejection does not remove access**. There is
no public Bar Council verification API, so gating would mean a manual queue on
every signup; the number exists for positioning — a tool for licensed
practitioners — not for security. Enforce this with a test, not a comment.

## Storage
Cloudflare R2. Case documents in a dedicated bucket with its own access policy.
AES-256 at rest. Deletion purges objects, rows, embeddings and caches.

## Monitoring
Sentry (API + RN, release-tagged) · PostHog · Pino → Railway drain · Telegram
alerts. Three tables carry first-class weight: `llm_calls`, `citation_checks`,
`ocr_jobs`.

Alerts: LLM spend > $50/day · citation failure > 0.5% (page) · **silent-drop > 0
(page)** · nightly sweep incomplete by 00:30 IST · API p95 > 3s for 5min ·
5xx > 1%.

## Not used
Neon, Vercel, Qdrant, Clerk, Supabase, Telegram as delivery channel.
