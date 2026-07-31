# LAWMIND — TRD

## Shape
Expo app (iOS + Android) → Hono API on Railway → Railway Postgres + pgvector.
Admin and OCR are separate Railway services. One project, one bill.

## Client
Expo SDK 52+, React Native, TypeScript. NativeWind. TanStack Query + Zustand.
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
Corpus v1: Supreme Court last 5 years (~15K judgments) + full BNS/BNSS/BSA text.
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
Tesseract fallback — **OD-7, settle by bake-off on real court scans.** Pipeline:
classify (skip if digital text layer) → preprocess/deskew → detect script →
OCR → confidence score → field extraction → advocate confirms.
`docs/OCR_PIPELINE.md`.

## LLM routing — by data sensitivity
Public class (judgments, statutes): cheapest capable, DeepSeek V4 Flash for
search, Haiku 4.5 for structure, Sonnet 4.6 for drafting and briefings.
Sensitive class (uploaded documents, matter notes): pseudonymise first, provider
with written data-processing terms only. **OD-6 unresolved — no upload features
until settled.** `docs/PRIVACY_PII.md`.

Every call rows into `llm_calls` with model, tokens, cost, latency, `data_class`,
`pseudonymised`.

## Embeddings
One-time corpus embedding as a batch job on rented GPU — not on Railway.
Query-time embedding on Railway CPU is fast enough for single queries. OD-4.

## Court data
Adapter interface, two implementations: manual entry (fully working, ships first)
and vendor API (stub until OD-1). Nothing above the interface changes when the
vendor lands. eCourts Tier 3 verification shares this interface.

## Jobs
Railway cron, 23:00 IST. Tomorrow's listed hearings → briefing → store → push.
Missed run alerts by 00:30 IST.

## Auth
better-auth, self-hosted. Email magic link via Postmark at launch; phone OTP via
MSG91 phase 2. Rotating refresh tokens, 30-day sliding window.

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
