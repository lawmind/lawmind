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
- Remote: `origin` → `https://github.com/lawmind/lawmind.git`, `main` tracking
  `origin/main`. **This line previously read "no remote is configured yet, `git
  remote -v` returns empty by design" and was stale as of 2 Aug 2026** — the
  remote exists and is reachable. It matters because CI only runs once commits
  reach GitHub, and because anything pushed here is published.

Branch: `main`.
Railway project: `lawmind` · id `9cb948ba-fc2d-4e70-bd98-d920f19e6337` · workspace
`locklabs-org's Projects`. Created 2 Aug 2026.

Build and deploy config is code: `railway.json` at the repo root. It is the
**default** config path, so it applies to every source-built service. When `cron`
and `ocr` arrive in S3/S4 each needs its own config file and its own
`railwayConfigFile` setting — one root file cannot carry three start commands.

| Service | Purpose | Port |
|---|---|---|
| `api` | Hono API | 3000 |
| `admin` | Next.js admin web | 8080 |
| `cron` | overruled re-check 22:30 IST → nightly hearing sweep 23:00 IST | — |
| `ocr` | Python/FastAPI OCR worker, async queue | 8000 |
| `postgres` | Postgres 16 + pgvector | 5432 |

Region: Singapore. **No India region exists on Railway** — OD-2, a known DPDP
gap. Documented, not solved. Counsel's written view required before public
launch; migration path before May 2027.

### `cron` job order — the ordering is a requirement, not a preference
1. **22:15 IST — cause list sync.** Per-court pull. Escalates on empty or stale;
   a newly discovered listing for **tomorrow** pushes immediately (PD-6).
2. **22:30 IST — overruled re-check.** Re-checks `overruled_status` for every
   judgment referenced by an active matter or an exported draft; each flip runs
   the citation fan-out. `docs/API_CONTRACTS.md` §Overruled re-check.
3. **23:00 IST — nightly hearing sweep.** Generates tomorrow's briefings,
   including the "since yesterday" alert block (PD-6). Alerts accumulated during
   the day are delivered **here**, batched — not as they occur.

Cause list sync runs first because the sweep needs confirmed dates; the re-check
runs second because briefings carry authorities.

The re-check runs **first and must complete first**, because briefings carry
authorities: a sweep that runs against a stale overruled status puts overruled law
into tonight's briefing, which the advocate reads standing outside court. If the
re-check fails, the sweep still runs — a briefing with an as-of date is better
than no briefing — but the failure pages immediately and the affected authorities
render with their last-read status and date shown, never as current.

The re-check is a corpus read, not an external API spend. It does not re-run
verification tiers 1–3.

## Environments
`development` · `staging` · `production`. Separate databases, separate secrets.
Never point staging at the production database.

All three exist and each carries **its own Postgres instance**, so the separation
is physical rather than a convention: `Postgres` (production) · `Postgres-NQ5a`
(development) · `Postgres-fKqF` (staging). Railway generated the suffixes.

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

### Not secrets, but read by the `api` service — same rule, no values in the repo
```
PORT                      # defaults to 3000
NODE_ENV                  # development | production
LOG_LEVEL                 # pino level, defaults to info
RAILWAY_GIT_COMMIT_SHA    # set by Railway; reported by GET /health
GITHUB_SHA                # set by Actions; the CI equivalent of the above
GIT_SHA                   # manual override for either
```

`GET /health` falls back to `git rev-parse HEAD` when none of the three SHA
variables is set, and reports `unknown` only when that also fails. A health check
that cannot name its build cannot tell two deploys apart.

**A `railway up` from a laptop must carry the SHA itself.** Railway sets
`RAILWAY_GIT_COMMIT_SHA` only on git-triggered deploys, and `.railwayignore`
excludes `.git`, so a CLI deploy reports `unknown` unless told otherwise:

```
railway variables --service api --set "GIT_SHA=$(git rev-parse HEAD)"
railway up --service api
```

This is a stopgap. It disappears the moment a GitHub remote exists and deploys are
git-triggered — the code already prefers `RAILWAY_GIT_COMMIT_SHA` over `GIT_SHA`,
so nothing changes but the variable going stale and stopping being read.

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
