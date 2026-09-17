# REMOTE ALPHA PACKAGE — executable, and nothing provisioned

**LCC R29, 15 September 2026.** Written for whoever executes the first remote
deployment, which may be a fresh agent with no memory of this round.

The point of this document is narrow: **after the founder authorises spend,
deploying is execution.** Not another sprint spent discovering that a script
assumed a variable, that a guard nobody ever tripped does not actually refuse, or
that the Gate-S1 evidence has to be invented on deployment day.

**Nothing here has been provisioned.** No account, no box, no managed database,
no domain, no spend. `PAID_INFRA_CREATED = NO`. `REMOTE_RESOURCE_CREATED = NO`.

---

## 0 · What is settled, and what is not

| | State | Where it is recorded |
|---|---|---|
| API / admin tier provider | **SETTLED — Railway**, project `lawmind` id `9cb948ba-fc2d-4e70-bd98-d920f19e6337`, region Singapore. `railway.json` is checked in and is the default build config. | [`DEPLOYMENT.md`](../../DEPLOYMENT.md) |
| Corpus database plane | **NOT SETTLED.** Railway-Singapore (matches OD-2's recorded DPDP residency position) versus a Hetzner EU dedicated box (RAM for a resident HNSW index, cheaper, and in a region OD-2 was **not** decided against). | [`STAGING_PACKAGE_PROPOSAL_2026.md`](STAGING_PACKAGE_PROPOSAL_2026.md) §0, §10 |
| USER database plane | **NOT SETTLED**, and it is a separate decision from the corpus one — that separation is the whole of R28. | same |

This round therefore builds **provider-neutral runtime contracts and scripts**
and chooses no vendor. Everything below runs against any Postgres 16 + pgvector
and any host that can run a Node process and expose a log stream.

**The one thing the founder must decide before anything is ordered** is the
region conflict, because it is not a hosting preference: an EU corpus box adds a
cross-continental round trip to every request inside a 15-second client timeout
that RCC has already measured as tight on a real device. `STAGING_PACKAGE_
PROPOSAL_2026.md` §10 states it and does not resolve it.

---

## 1 · Remote topology

Four roles, and the split between the middle two is load-bearing rather than
tidy: a lost corpus box is a re-download from AWS Open Data, and a lost user box
is every advocate's account and case history.

```
            HTTPS termination / API hostname
                          |
                   API  (services/api, Hono, Node)
                    |                 |
      CORPUS DATABASE            USER / MATTER DATABASE
      published law              advocates' own work
      blue/green generations     never rolled back with the corpus
```

Plus the cron service (`railway.cron.json`, `railway.recheck.json`) and the OCR
worker, both already described in `DEPLOYMENT.md` and unchanged by this round.

**No remote GPU is required for current-v1.** Query embedding runs in-process
with a 2-second budget and degrades to lexical-only (`services/api/src/index.ts`);
corpus embedding is a one-time batch on a rented box and is not a serving
dependency. Nothing in the current product architecture says otherwise.

---

## 2 · Environment contract

`services/api/src/ops/serving-contract.ts` is the authority and is **enforced at
boot**, before a socket is opened. `services/api/src/ops/serving-contract.test.ts`
is its suite.

### 2.1 · The variable that turns everything else on

```
LAWMIND_SERVING_ENV = development | staging | production
```

Unset means `development` and nothing below is enforced. **It is deliberately not
inferred from `NODE_ENV`**: bundlers, process managers and Railway all set
`NODE_ENV=production` for reasons that have nothing to do with who the audience
is, and a staging box legitimately runs it.

### 2.2 · Required when `LAWMIND_SERVING_ENV` is `staging` or `production`

| Variable | Rule |
|---|---|
| `CORPUS_DATABASE_URL` | **Required explicitly. No fallback to `DATABASE_URL`.** |
| `USER_DATABASE_URL` | **Required explicitly. No fallback to `DATABASE_URL`.** |
| `DB_SPLIT_MODE` | Must be `split`. The declaration is what turns on the runtime identity verification; an inferred mode verifies nothing. |
| `AUTH_SECRET` | Required. No development default anywhere. |
| `AUTH_BASE_URL` | Required, and must be `https://`. A sign-in link is a bearer credential. **It is this API’s own public origin**: the emailed link is `<AUTH_BASE_URL>/auth/magic-link/open?token=…`, which 302s to `lawmind://auth/verify`. Point it anywhere else and every link 404s while every send reports success — LCC R33. |
| `RESEND_API_KEY` | Required. Send-only key (`DEPLOYMENT.md` §Mail). |
| release identity | One of `LAWMIND_RELEASE_ID`, `RAILWAY_GIT_COMMIT_SHA`, `GITHUB_SHA`, `GIT_SHA`. |
| `LAWMIND_ALLOW_PRIVATE_DB_HOST` | Optional, `1`. States that the API and its database share a provider's private network. Without it a private-range literal is refused. |
| `LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS` | **Required** in staging and production since LCC R30 — an empty list refuses startup (`env:LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS`). The founder workstation's Postgres `system_identifier`. See §3. |

Everything else (`PORT`, `LOG_LEVEL`, `SENTRY_DSN`, `POSTHOG_KEY`, R2, OpenRouter,
`PII_ENCRYPTION_KEY`, Razorpay…) is unchanged from `DEPLOYMENT.md` §Secrets.

### 2.3 · Why the no-fallback rule exists

`CORPUS_DATABASE_URL` and `USER_DATABASE_URL` each fall back to `DATABASE_URL` by
design — that default is what let the physical split ship without a flag day, and
it stays, because every developer and every existing deployment depends on it.

It is the wrong default for a serving deployment, and the failure is silent:
both roles resolve to one database, `resolveDatabases` infers `single`,
`index.ts` skips `verifyDistinctDatabases` because the mode is not `split`, and
`/health` answers 200. **The whole R28 architecture is opt-in by a variable
nobody is forced to set.** Then the first corpus release runs
`release-restore-cli.ts`, whose `TRUNCATE ... CASCADE` reaches 22 tables
including `matter_authorities`.

`cascade-guard.ts` would still refuse that particular restore. The contract
refuses the configuration, which is earlier and cheaper.

---

## 3 · Local-workstation safety

Two independent halves, because each has a blind spot the other covers.

**Syntactic, before a socket is opened** (`serving-contract.ts`). A serving
deployment refuses a database URL whose host is loopback, this machine's own
hostname, a `.local`/`.lan`/`.localdomain`/`.home` name, or — unless
`LAWMIND_ALLOW_PRIVATE_DB_HOST=1` — a private-range literal.
`postgres.railway.internal` is deliberately **accepted**: it is a provider's
private DNS and exactly where a correct deployment points. A rule that refused
every private name would refuse the intended topology, which is how a
fail-closed guard gets switched off.

**Identity, at runtime** (`ops/db-identity.ts` `forbiddenClusterRefusal`). An SSH
tunnel, a `cloudflared` hostname or a port-forward makes the workstation answer
on a public-looking name and every string rule above passes. `system_identifier`
is the cluster's own id, generated at `initdb`, and it is identical through any
tunnel. Configure it:

```bash
# on the workstation, once
psql "$DATABASE_URL" -tAc "SELECT (pg_control_system()).system_identifier"
# then, on the deployment
LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS=<that value>
```

An empty list is **no check**, and the code says so rather than defaulting to
something that looks like a guarantee. That is precisely why the host rules exist
beside it.

The founder's workstation Postgres must never be publicly exposed. Nothing in
this package opens it, and both halves above exist to stop it becoming the
serving plane by accident.

---

## 4 · Release, rollback and restore

All of these already exist and are proved locally. This round adds no new
orchestrator: `ops/release-restore-cli.ts` stays the one place a release is
landed and verified.

### 4.1 · New corpus generation

```
restore → verify manifest → verify indexes/extensions → statistics → Search-S1 smoke → ACTIVATE
```

`services/api/src/release/activation.ts` is the gate and it can REFUSE. The three
prerequisites do not substitute for each other: integrity says nothing about the
optimizer, and analysed statistics say nothing about whether search works. The
smoke runs the **real** `answerStructured` and `hybridSearch`, never a second
spelling of them.

| step | command |
|---|---|
| export a generation | `pnpm --filter @lawmind/api release:export` (`ops/release-export-cli.ts`) |
| restore + verify + activate | `pnpm --filter @lawmind/api release:restore` (`ops/release-restore-cli.ts`) |
| blue/green proof, through the API | `pnpm exec tsx scripts/lcc-r28-bluegreen-api.mjs --out <dir>` |

### 4.2 · Rollback

Switch the corpus pointer back to the previous **verified** generation. Proved
end to end by `lcc-r28-bluegreen-api.mjs`: A → B → A, the saved authority becomes
the R17 unavailable shell under B and hydrates again under A with the same
`authorityId` and `addedAt`, and `USER_DATA_CHANGED_BY_CORPUS_SWITCH = NO`.

**No destructive USER rollback, ever. No `TRUNCATE ... CASCADE` release strategy
against a database holding user tables.** `ops/cascade-guard.ts` refuses before
the first `TRUNCATE` and lists what would have been emptied; `--allow-cascade-into`
is a data-loss decision, not a flag.

### 4.3 · USER database backup and restore

A backup nobody restored is not a backup.

```
pnpm exec tsx scripts/lcc-user-backup.mjs                    # dump
pnpm exec tsx scripts/lcc-r28-user-backup-restore.mjs        # dump → restore into a NEW isolated
                                                             # database → authenticated smoke
```

The second one is the procedure, not a test of it: it restores into a fresh
database, drops the corpus tables from it to prove the restored plane is
genuinely user-only, and then drives `/me`, matters, authorities, annotations,
data requests, training consent and documents against the restored database —
including an idempotency replay. `USER_BACKUP_RESTORE_PASS` means all of that was
observed. Evidence: [`../ai/lcc-r29/user-backup-restore.json`](../ai/lcc-r29/user-backup-restore.json).

Off-machine: ship to Cloudflare R2, already the stack's object store.
**`rclone` must run single-stream** — the default multi-thread copy truncates
large objects silently (`scripts/lcc-offsite-restore-proof.mjs`).

---

## 5 · Staging Gate-S1 runner

**One command, and it has been run.**

```bash
node scripts/lcc-staging-gate-s1.mjs \
  --api https://<staging api origin> \
  --corpus-url postgres://…            # or --queries <pinned file>
  --phase-log phase.log \              # optional; see below
  --repeat 3 --out docs/ai/<round>
```

It drives the same six frozen classes, in the same deterministic order, **over
HTTP against the deployed API**, and emits `staging-gate-s1.json`.

**Why not `measure:round --gate-s1`.** That harness builds the Hono app *in
process*. Pointed at a remote database it measures a local API over a WAN link —
every statement pays a round trip production never pays, and the deployed process
is never exercised. Gate S1 is a **whole-request p95 of 3,000 ms in staging**, and
a whole request includes TLS, the hop, the deployed process and its pools.

**What the runner can and cannot see.** From the response: HTTP outcome,
whole-request wall time, `degraded[]`, `retrievalOutcome`, `emptyBecause`, result
count, `x-request-id`. **Not** from the response: `pool_wait_ms` and the per-arm
phase breakdown, which are diagnostics and never reach the wire
(`search/timings.ts`). The runner does not invent them and does not derive them
from the total — it correlates them out of the deployed process's own
`search_phase_timing` log lines:

```bash
railway logs --service api --json > phase.log     # or the host's equivalent
```

Without `--phase-log` every server-side field reads `null`, meaning **not
measured** — never zero. `scripts/lcc-staging-gate-s1.test.mjs` exercises the
correlation against the three log shapes real hosts emit, because when that
parsing is wrong it does not throw: it silently reports a whole run as
unmeasured.

**Fixed gate: whole-request p95 ≤ 3000 ms.** No timeout inflation (the runner's
own per-request ceiling is the 15 s client timeout the product ships), no
`gin_fuzzy_search_limit`, and nothing that improves the number by returning less
law.

---

## 6 · Health, readiness, observability

| surface | question it answers |
|---|---|
| `GET /health` | is this container alive and is the corpus handle reachable |
| `GET /ready` | **new.** Are BOTH roles reachable, and is a declared split really two databases |
| `GET /version` | which build is this — `gitSha`, `deployedAt`, contract version |
| `GET /release/capabilities` | what this release claims, per platform |
| `GET /admin/metrics` | job control plane, alert rules, operational counters |
| `search_phase_timing` log line | per-request phase breakdown, one line per search |
| `search_events` table | query class, latency, result count, `degraded`, `admitted`, status |
| rate limits | `services/api/src/rate-limit.ts`, mounted on auth, search and write paths |

`/ready` exists because `/health` pings one handle, and after R28 that is half the
serving plane: a user database that has gone away leaves `/health` green, the
deployment in rotation, and every matter, annotation and sign-in route 500ing.
Its verdict is **measured on the request**, never replayed from boot — a probe
that repeats a startup verdict says the deployment was fine once.

**Nothing reports a fake healthy state.** `/ready` answers 503 with the report
attached when a role is unreachable or a declared split is not really two
databases, and 503 `READINESS_NOT_CONFIGURED` rather than 200 when a process
supplied no probe.

**No user-facing operational cadence is promised anywhere**, because none has
been observed on a remote deployment.

---

## 7 · Deployment dry run

```bash
DATABASE_URL=... pnpm exec tsx scripts/lcc-deploy-dry-run.mjs --out docs/ai/lcc-r29
```

Runs the whole package against disposable local databases and a real HTTP socket.
Sixteen steps, **seven of them deliberate misconfigurations that must be
refused** — a guard nobody has observed refusing is a guard nobody has tested:

1. corpus and user pointed at one database
2. one database behind two different hostnames (the syntactic check cannot see
   this; the cluster-identity check does)
3. a serving deployment with `AUTH_SECRET` missing
4. a serving deployment that set only `DATABASE_URL`
5. a serving deployment pointed at this workstation, by host
6. a serving deployment pointed at this workstation, through a tunnel
7. a corpus generation that is not fit to activate

Then the green paths: strict-split boot, the activation gate activating a
generation that IS fit, `/health`, `/ready`, `/version`, R17 corpus-unavailable
semantics on a deployed socket, `POST /search`, identity-only erasure, and the
staging Gate-S1 runner **invoked against the live socket**.

Evidence: [`../ai/lcc-r29/deploy-dry-run.json`](../ai/lcc-r29/deploy-dry-run.json).

It creates no remote resource and spends nothing, and it does **not** grade
Gate-S1: this box is not staging, and the number it prints is labelled
`DRY_RUN_LOCAL_NOT_A_GATE`.

---

## 8 · What one spend authorisation is enough for, and what it is not

**Enough to start Gate C** — the package above is executable and every part of it
that can run without a remote box has run:

- environment contract, enforced at boot, with its refusals observed;
- two independent workstation guards, both observed refusing;
- corpus release, activation gate, blue/green rollback — proved through the API;
- user backup **and restore**, with an authenticated smoke on the restored plane;
- the staging Gate-S1 runner, executed;
- `/ready`, `/version`, rate limits, structured search timing, release identity.

**Not enough, and stated rather than glossed:**

- **the region decision is the founder's and it is not a hosting preference**
  (§0). Ordering an EU corpus box decides OD-2's residency position by accident;
- **no staging number exists.** Gate S1 has never been measured against a remote
  deployment, and nothing in this repository may claim it has;
- the countersigned DPA is still owed before uploads ship (OD-6);
- DNS, TLS and the API hostname are unprovisioned, and the subdomain choice is
  the founder's;
- `docs/FOUNDER_QUEUE.md` carries everything else that needs a credential, an
  account or money.
