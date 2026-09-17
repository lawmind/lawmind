# Gate C on DigitalOcean — runbook and teardown (LCC R32B)

**Temporary.** Two Droplets in `sgp1`, authorised for at most 72 hours and
USD 75 (hard stop). They are not production infrastructure. The ledger of
every resource created is
[`docs/ai/lcc-r32b-do/RESOURCE_LEDGER.json`](../ai/lcc-r32b-do/RESOURCE_LEDGER.json).
Tooling: `scripts/lcc-r32b-do.mjs`.

| | corpus | api + user |
|---|---|---|
| name | `lawmind-gatec-corpus` | `lawmind-gatec-api-user` |
| size | `so1_5-4vcpu-32gb` · USD 0.48512/h | `s-2vcpu-4gb` · USD 0.03571/h |
| private IP | 10.130.0.2 | 10.130.0.3 |
| PostgreSQL | 18 cluster `corpus`, DBs `lawmind_corpus_a` (full), `lawmind_corpus_b` (bounded 500) | 18 cluster `user`, DB `lawmind_user` |
| listens | 10.130.0.2, localhost | 10.130.0.3, localhost |
| public ports | 22 (admin IP only) | 22 (admin IP only), 80, 443 |

**Foreign resource: `ubuntu-s-vikas` (id 566518737).** It is not ours. It is
never modified, resized, restarted, attached to or deleted. `teardown` only
deletes ids recorded in the ledger, and it also refuses that name explicitly.

**Hard destroy deadline: 2026-09-19T17:57Z** (created 2026-09-16T17:57Z + 72 h).
A powered-off Droplet still bills. Only deletion stops the charge.

## Access

- SSH is key-only (`~/.lawmind-gatec/lawmind-gatec-202609161754`, never in git).
  The user is `deploy` with sudo. Root and password login are off.
- If the admin's public IP changes:
  `node scripts/lcc-r32b-do.mjs ssh-ip --admin-ip <new ip>`.
- Secrets live in `~/.lawmind-gatec/secrets.env` on the workstation and in
  `/etc/lawmind/api.env` (root, 0600) on the API host. They are never
  committed.

## API

- Origin: `https://alpha-api.lawmind.co`. Fallback origin, same certificate
  path: `https://178-128-209-91.sslip.io`.
- Caddy terminates TLS (Let's Encrypt) and proxies to `127.0.0.1:3000`.
- `systemd` unit `lawmind-api` runs `/opt/lawmind/current/services/api`.
- Deploy only a pushed commit: `scripts/lcc-r32b-deploy.sh <sha> --restart-api`.
- Serving env: `LAWMIND_SERVING_ENV=staging`, `DB_SPLIT_MODE=split`, explicit
  `CORPUS_DATABASE_URL` and `USER_DATABASE_URL`. There is no `DATABASE_URL`.
  `LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS` holds the founder workstation
  cluster id.
- Query embedding is not provisioned on this box (no model file), so search is
  lexical plus structured. Public semantic search stays disabled.

## Corpus generations (blue/green)

The active generation is the database named at the end of
`CORPUS_DATABASE_URL` in `/etc/lawmind/api.env`. To switch generations, edit
that name and run `systemctl restart lawmind-api`.
`scripts/lcc-r32b-remote-bluegreen.mjs` performs A → B → A and digests the
USER database before and after.

A release is landed only through `release-restore-cli`. It runs as the owner
role `lawmind_corpus`, which holds exactly one extra privilege:
`GRANT SET ON PARAMETER session_replication_role`. Without it, FK triggers
stay on during load, and a judgment row whose `overruled_by_judgment_id`
points at a later row makes the load fail. Every FK is validated after the
load either way.

### After activation: warm the generation, then measure

A freshly restored generation is cold. The first remote Gate-S1 run failed on
cold reads alone: p95 4,774 ms, the same query took 6.5 s cold and 0.6 s warm,
and pool wait was 0. Run `scripts/lcc-r32b-prewarm.sh <db>` on the corpus host
after every activation and every corpus cluster restart (about 60 s).

Corpus cluster settings that Gate-S1 measured
(`/etc/postgresql/18/corpus/conf.d/10-lawmind-gatec.conf`):

| setting | value | why |
|---|---|---|
| `max_parallel_workers_per_gather` | 6 | `ts_rank` top-N is I/O-bound, so more readers than cores helps. Measured cold p95: 2 workers 4,774 ms, 3 workers 4,053 ms, 6 workers 3,181 ms |
| `max_parallel_workers` / `max_worker_processes` | 8 / 12 | room for the above |
| `shared_buffers` / `effective_cache_size` | 8GB / 22GB | 32 GiB box |
| `wal_level` | minimal | nothing replicates from this box; faster bulk load |

With prewarm, the Gate-S1 p95 is 2,748 ms (PASS). Evidence:
[`../ai/lcc-r32b-do/gate-s1-summary.json`](../ai/lcc-r32b-do/gate-s1-summary.json).

**Known limitation.** The stored tsvectors live in a 98 GB TOAST table, which
cannot be held in 31 GiB of RAM. A research query nobody has sent before can
take longer than 3 s while its TOAST pages are cold: 1 of 8 novel queries
measured 3.5 s. Fixing this for good takes more memory or a smaller ranking
vector. That is a sizing or design decision, not something a setting can fix.

## Staging sign-in

`POST /auth/magic-link {email}` sends a real message through Resend from
`no-reply@lawmind.co`, and `POST /auth/verify {token}` exchanges the link for
tokens. Proven end to end with Resend's test inbox `delivered@resend.dev`:
send 200, verify returned tokens, `/me` 200, and a replayed token was refused
with 401. The access token lives 15 minutes and the refresh token rotates.
Scripted smoke principals (`gatec-smoke-*@lawmind.test`) use tokens signed
with the deployment's `AUTH_SECRET` and exist only for the smoke scripts.

Caddy: `health_interval 5s` and `lb_try_duration 15s`. After an API restart,
requests wait for the upstream instead of getting a 503.

## USER backup → restore

1. Dump: `scripts/lcc-user-backup.mjs` with `USER_DATABASE_URL` set and
   `DB_SPLIT_MODE=split`.
2. Restore the pack into a new, isolated database with
   `pg_restore --data-only --disable-triggers`, using the `postgres` role.
3. Run the authenticated smoke against the restored database.
4. Drop the disposable database.

A backup file that exists is not the proof. The smoke against the restore is.

## Teardown — run before the deadline

```bash
# 1. Evidence first (small; the corpus is re-creatable, USER data is backed up
#    locally by lcc-user-backup.mjs before this step)
node scripts/lcc-r32b-do.mjs status > docs/ai/lcc-r32b-do/final-status.json

# 2. Delete every ledgered resource: firewalls, Droplets, VPC, SSH key.
node scripts/lcc-r32b-do.mjs teardown --confirm

# 3. Prove it: no lawmind-gatec-* Droplet remains, and ubuntu-s-vikas is untouched
node scripts/lcc-r32b-do.mjs precheck | node -e 'const p=JSON.parse(require("fs").readFileSync(0));console.log(p.existingDroplets)'

# 4. DNS: remove the one record this round added (A alpha-api -> 178.128.209.91).
#    Nothing else in the zone was touched.
node scripts/lcc-r32b-do.mjs dns-remove
```

After step 2, Gate-C recurring compute cost is **USD 0**. The DigitalOcean
token and the Spaceship key are then revoked by the founder.
