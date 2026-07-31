# LAWMIND — DEPLOYMENT

## Repository layout — read before cloning or configuring CI

This repository is **nested inside another git repository.** `~/Documents` is
itself a repo on branch `main`, and this directory sits inside it as untracked
(the parent reports it as `?? Lawmind/`, quoting git's own output). This is deliberate and left as-is.

Consequences:
- Running `git` from a parent directory operates on the **outer** repo. Always
  confirm with `git rev-parse --show-toplevel` before committing.
- Do not run `git add` from `~/Documents` — it would absorb this repo as a
  gitlink or, worse, as loose files.
- CI and deploy tooling must clone **this** repo directly, not the parent.
- No remote is configured yet. `git remote -v` returns empty by design.

Branch: `main`.
Record the generated project name here on creation: `________________`

| Service | Purpose | Port |
|---|---|---|
| `api` | Hono API | 3000 |
| `admin` | Next.js admin web | 8080 |
| `cron` | nightly hearing sweep, 23:00 IST | — |
| `ocr` | Python/FastAPI OCR worker, async queue | 8000 |
| `postgres` | Postgres 16 + pgvector | 5432 |

Region: Singapore. **No India region exists on Railway** — OD-2, a known DPDP
gap. Documented, not solved. Counsel's written view required before public
launch; migration path before May 2027.

## Environments
`development` · `staging` · `production`. Separate databases, separate secrets.
Never point staging at the production database.

## Secrets — Railway environment variables only
```
DATABASE_URL
OPENROUTER_API_KEY
SENSITIVE_LLM_API_KEY     # separate provider per OD-6
EMBEDDING_API_KEY
POSTMARK_SERVER_TOKEN
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET
R2_DOCUMENTS_BUCKET       # separate policy for case documents
AUTH_SECRET
PII_ENCRYPTION_KEY        # encrypts pii_entities.original_value
SENTRY_DSN
POSTHOG_KEY
EXPO_ACCESS_TOKEN
INDIANKANOON_API_KEY      # verification tier 2
COURT_API_KEY             # unset until OD-1 resolves
TELEGRAM_ALERT_TOKEN / TELEGRAM_ALERT_CHAT_ID
RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
```

Never in the repo. Never in a commit. Rotate on any team change.

## Mobile
EAS Build both platforms. `co.lawmind.app`. TestFlight for iOS beta, internal
track for Android. Store submission is S7 — do not burn review cycles earlier.

## Migrations
Drizzle, checked in, forward-only. Never edit an applied migration. Never
`drizzle-kit push` against production.

## Rollback
Railway keeps prior deployments. Migrations do not auto-revert; a reverting
migration is written by hand and reviewed.

## Corpus ingest — not on Railway
One-time batch on a rented GPU box. Embed, then load vectors into Railway
Postgres. A 15K-document embed inside a Railway service will time out and cost
more than the GPU hour.
