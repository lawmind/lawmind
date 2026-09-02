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

### Cron is configured in UTC, and the schedule must be read that way

**Railway cron expressions are UTC. The job times above are IST.** The offset is
+05:30, so a schedule written from the IST time is wrong by five and a half hours
— and wrong in the direction that generates tomorrow's briefing for today.

| job | IST | **UTC cron** | config |
|---|---|---|---|
| cause list sync | 22:15 | `45 16 * * *` | not yet built |
| overruled re-check | 22:30 | `00 17 * * *` | not yet built |
| **nightly sweep** | **23:00** | **`30 17 * * *`** | `railway.cron.json` |

`railway.cron.json` carries the sweep. `railway.json` is the DEFAULT config path
and applies to every source-built service, so a second service needs its own file
and its own `railwayConfigFile` setting — one root file cannot carry three start
commands.

`restartPolicyType: NEVER` because a cron job that restarts on failure runs the
sweep again immediately, which is safe (the sweep is idempotent) but hides the
failure behind a retry that looks like success. A failed night should stay failed
and visible.

**The sweep computes tomorrow in IST itself**, so it does not depend on the
container's timezone — the schedule decides only *when* it runs, never *which day*
it targets. That separation is deliberate: a mis-set `TZ` on the container then
cannot silently change which advocates get a briefing.

**Only the sweep exists.** The cause list sync and the overruled re-check are not
built, so the ordering constraint above is currently documentation rather than
something the system enforces. Do not read the table as describing a running
system.

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
RESEND_API_KEY            # magic-link email. Swapped from Postmark 7 Aug 2026
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
SEARCH_POOL_PROBE         # "1" turns on the /search pool-wait measurement; OFF by default
```

**`SEARCH_POOL_PROBE` is a diagnosis switch, not a setting to leave on.**
`POST /search` always logs one `search_phase_timing` line per request naming
every phase; `pool_wait_ms` is the one field that costs something to obtain, so
it is `null` — meaning *not measured*, never zero — unless this is set. When it
is set, the value is measured at `sql.reserve()` on the research pool: a real
acquisition boundary, sampled immediately before retrieval, and on a cold pool it
includes connection establishment. `services/api/src/search/timings.ts` is the
authority on what the number is and what it is not.

Turn it on for a window when a slow-search report needs explaining; turn it off
after. The probe takes a connection out of the pool and puts it straight back,
which under real contention costs the very queueing it is trying to measure.

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

**A CORPUS rollback must not roll back user or matter data, and on a single
shared database it would.** `release-restore-cli.ts` runs `TRUNCATE <table>
CASCADE`, and `CASCADE` truncates every referencing table regardless of its
`ON DELETE` rule — `NO ACTION` protects a DELETE, not a TRUNCATE. Measured
against the current schema, restoring the seven-table corpus release would also
empty 22 tables, `matter_authorities` among them.

`services/api/src/ops/cascade-guard.ts` therefore refuses the restore before its
first `TRUNCATE`, listing what would have been emptied. On a corpus-only target
it finds nothing and says nothing. `--allow-cascade-into` overrides it and should
be treated as a data-loss decision, not a flag.

There is currently **no user/matter backup-and-restore path at all** — nothing
writes `users`, `matters`, `matter_authorities`, `documents`,
`judgment_annotations`, `drafts` or `briefings`. Corpus restore is built; the
other half is not. `docs/ai/lcc-r24/corpus-rollback-separation.md`.

## Corpus ingest — not on Railway
One-time batch on a rented GPU box. Embed, then load vectors into Railway
Postgres. A 15K-document embed inside a Railway service will time out and cost
more than the GPU hour.

## Mail — Resend, verified and sending

Magic-link sign-in sends through **Resend** (swapped from Postmark, 7 Aug 2026 —
`docs/OPEN_DECISIONS.md` §Auth). Two variables, both in Railway, never in the repo:

```
RESEND_API_KEY   # SEND-ONLY. The restriction is deliberate — see below.
MAIL_FROM        # "Lawmind <no-reply@lawmind.co>"
```

**`lawmind.co` was verified 7 Aug 2026** and delivery to an address that is *not*
the Resend account owner was observed, which is the only test that proves it.
Before that, `onboarding@resend.dev` — Resend's shared sender — delivered only to
the account owner and refused everyone else with HTTP 403.

### Two keys, on purpose

| Key | Permission | Where it lives |
|---|---|---|
| `lawmind-api-send-only` | sending only | Railway `RESEND_API_KEY` |
| `lawmind-api-production` | full access | **not** in Railway — administration only |

The API needs exactly one capability: post an email. A full-access key can also
create and delete domains and mint further keys, and none of that belongs in a web
process reachable from the internet. Leak the send-only key and somebody sends mail
as us; leak a full-access key and somebody takes the account.

Verified rather than assumed: the send-only key returns **200** on a send and
**401 `restricted_api_key`** on `GET /domains`. If domain administration is ever
needed again, use the admin key or flip permission in the dashboard — do not put a
full-access key back into the service.

### The DNS, and the trap in it

**DNS for `lawmind.co` is at Spaceship** — nameservers `launch1/launch2.spaceship.net`,
confirmed by lookup. Manageable in the panel (Domains → `lawmind.co` → Advanced
DNS) or via `https://spaceship.dev/api/v1/dns/records/{domain}` with `X-Api-Key`
and `X-Api-Secret` headers; `PUT` writes, and **`force: false` adds without
replacing the zone**.

Three records were added, all on subdomains, leaving the apex untouched:

| Type | Host | Value |
|---|---|---|
| `TXT` | `resend._domainkey` | DKIM public key (unique per domain) |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` |
| `MX` | `send` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 |

**Spaceship wants the host, not the FQDN.** Resend returns names as
`send.lawmind.co`; writing that verbatim yields `send.lawmind.co.lawmind.co`. The
sync script strips the domain suffix for exactly this reason — it is the most
common way this fails and it looks like a propagation problem for an afternoon.

**The DKIM value cannot be predicted or pre-created.** It is generated when the
domain is added in Resend, which is why that step genuinely comes first. Region is
`us-east-1`; the SPF and MX values follow from it, so a different region means
different records.

The apex still carries `A @` and `A www` → `76.76.21.21` (a Vercel address serving
the landing page) and the Google site-verification `TXT`. None of them were
touched.

### DMARC — added 7 Aug 2026 at `p=none`, and that is deliberate

```
_dmarc  TXT  v=DMARC1; p=none; adkim=r; aspf=r; fo=1
```

**`p=none` is the correct posture and must not be tightened casually.** DMARC
tells a receiving server what to do with mail that fails SPF *and* DKIM alignment.
`p=reject` on a domain nobody has monitored rejects legitimate mail the instant a
sender is missed — and the mail this domain sends is **sign-in links**, the one
message the product cannot afford to lose. A rejected magic link looks to the
advocate exactly like an app that does not work.

`p=none` declares the policy, changes no delivery behaviour, and satisfies the
"has DMARC" check that reputation systems apply.

**Tightening to `quarantine` and then `reject` needs `rua` first**, which needs a
destination for aggregate reports — a mailbox on the domain or a monitoring
vendor. Neither exists, and a vendor costs money, so **that is a founder decision,
not something to take by writing a bolder record.** The upgrade path is: add
`rua`, watch a few weeks of reports, confirm every legitimate sender aligns, then
move to `quarantine`, then `reject`.

`fo=1` asks for a failure report whenever *either* SPF or DKIM fails rather than
only when both do — useless until `ruf`/`rua` exists, harmless now, and one fewer
edit later.

### Why it fails loudly rather than quietly

`mailerFrom` **refuses to start** in production when `RESEND_API_KEY` is unset.
There is a console transport that prints the link instead of sending it, available
only outside production, because a service that fell back to it would log a
successful sign-in for every advocate who never received an email. An API that
cannot send mail should refuse to boot, not discover it at the first user.
