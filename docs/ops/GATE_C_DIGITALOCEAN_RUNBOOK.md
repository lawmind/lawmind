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
