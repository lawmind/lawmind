# LCC R34 — Gate-C DigitalOcean teardown

**Every ledgered Gate-C resource is deleted and each deletion was falsified by
reading DigitalOcean back, not by trusting the delete call.** The foreign Droplet
`ubuntu-s-vikas` is untouched and still running. `alpha-api.lawmind.co` no longer
resolves. Recurring Gate-C compute is **USD 0**.

This ran **39 hours and 44 minutes before** the hard deadline.

| | |
| --- | --- |
| `HEAD` | `86bc7c39852280947385ba2c0fc6f9e04c97bac6` = `origin/main` at start |
| authorisation | **NEW3 R25** — `GATE_C_ACCEPTED = YES`, `TEARDOWN_AUTHORIZED = YES`. `docs/product/NEW3_R25_GATE_C_ACCEPTANCE.md:178`, `.json:327`, bus **1810** (2026-09-18T01:05:02Z) |
| procedure | `docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md` §Teardown, in the documented order |
| ledger | `docs/ai/lcc-r32b-do/RESOURCE_LEDGER.json` |
| teardown start | `2026-09-18T01:13:10Z` |
| teardown end | `2026-09-18T01:13:25Z` (DNS removed `01:13:44Z`) |
| hard deadline | `2026-09-19T17:57:04Z` — met with 39 h 44 m to spare |
| falsification | `docs/ai/lcc-r32b-do/teardown-falsification.json` |
| status before | `docs/ai/lcc-r32b-do/final-status.json`, written **before** anything was deleted |

## Before: what was actually there

Recorded at `01:12Z`, minutes before destruction, so the "after" means something:

- `GET https://alpha-api.lawmind.co/version` → **200**, `gitSha a09d7ee5…` (the accepted runtime)
- `alpha-api.lawmind.co` → `178.128.209.91` on 8.8.8.8
- SSH to both Droplets answered; both `active` in the ledger

## Each resource, and how its end state was established

Every row was read back **by its own id** against `api.digitalocean.com/v2` after
deletion. A delete that returns 204 is a request, not a fact.

| resource | id | terminal state | how |
| --- | --- | --- | --- |
| droplet `lawmind-gatec-corpus` | `601138301` | **DELETED_VERIFIED** | `GET droplets/601138301` → **404 not_found** |
| droplet `lawmind-gatec-api-user` | `601138316` | **DELETED_VERIFIED** | `GET droplets/601138316` → **404 not_found** |
| firewall `lawmind-gatec-corpus-fw` | `424dd1be-8e34-483b-a93b-e3cbf6cb1164` | **DELETED_VERIFIED** | `GET firewalls/…` → **404** |
| firewall `lawmind-gatec-api-user-fw` | `53b49b45-d85a-4150-a5b6-e0d8d69a91d4` | **DELETED_VERIFIED** | `GET firewalls/…` → **404** |
| vpc `lawmind-gatec-vpc` | `176f456b-60fc-437c-8297-173fb3208b6a` | **DELETED_VERIFIED** | `GET vpcs/…` → **404** |
| ssh key `lawmind-gatec-202609161754` | `59366539` | **DELETED_VERIFIED** | `GET account/keys/59366539` → **404** |
| dns `A alpha-api.lawmind.co` | — | **DELETED_VERIFIED** | `dns-remove` → `{"dns":"removed"}`; **NXDOMAIN** on 8.8.8.8 and 1.1.1.1 |

**7 of 7 DELETED_VERIFIED. 0 UNKNOWN.** Every entry in `RESOURCE_LEDGER.json`
carries a non-null `destroyedAt` and a `terminalState`.

## The whole account, swept — not just the things I expected to find

The ledger governs, but a ledger can omit. Twelve collections were listed and
searched for `lawmind-gatec`:

| collection | count | Gate-C matches |
| --- | --- | --- |
| droplets | 1 | **0** |
| volumes | 0 | 0 |
| snapshots | 2 | **0** |
| reserved_ips | 0 | 0 |
| floating_ips | 0 | 0 |
| firewalls | 0 | 0 |
| vpcs | 1 | **0** |
| ssh_keys | 0 | 0 |
| load_balancers · databases · kubernetes | 0 | 0 |
| images (private) | 2 | **0** |

**No volumes, no reserved or floating IPs, no load balancers, no managed
databases, no Kubernetes clusters — not "deleted", never created.** Saying they
are absent is only meaningful because the sweep looked.

## RETAINED_NON_GATE_C — what survived, and the evidence it is not ours

| resource | id | evidence |
| --- | --- | --- |
| droplet `ubuntu-s-vikas` | `566518737` | Classified `FOREIGN_EXISTING_RESOURCE_DO_NOT_TOUCH` in the **2026-09-16 precheck**, before Gate C created anything. Read back after teardown: **HTTP 200, status `active`**. Not modified, resized, restarted, attached to or deleted. |
| snapshots `ubuntu-s-vikas-1779812391954`, `ubuntu-s-vikas 2026-07-26:00` | `230239229`, `238462498` | Snapshots **of the foreign Droplet**, in no Gate-C ledger. One is dated **2026-07-26** — seven weeks before Gate C existed. They are billable storage and they are **not Gate C's to delete.** |
| vpc `default-sgp1` | `bef14d51-4915-49c4-bc41-2c2d6dfb5878` | DigitalOcean's automatic per-region default VPC (`"default": true`), not created by this round. Gate C made and destroyed its **own** `lawmind-gatec-vpc`. Not billable. |

`UNRELATED_DO_RESOURCES_TOUCHED = NO.`

Two independent guards made that hard to get wrong rather than merely intended:
`teardown` iterates **only ids in the ledger**, and it additionally **refuses the
name `ubuntu-s-vikas`** outright (`scripts/lcc-r32b-do.mjs:334`).

## DNS, and the old API

```
before   alpha-api.lawmind.co  A  178.128.209.91        GET /version → 200
after    alpha-api.lawmind.co  NXDOMAIN on 8.8.8.8 and 1.1.1.1
         https://alpha-api.lawmind.co/version   → no response, curl exit 28
         https://178-128-209-91.sslip.io/version → no response, curl exit 28
         ssh deploy@178.128.209.91              → connection timed out
         ssh deploy@157.245.156.133             → connection timed out
```

The raw-IP probe matters: a hostname that stops resolving proves only that DNS
changed. Going straight at the Droplet's own address, and at port 22, is what
shows the machine is gone — and the DigitalOcean 404s are what prove it rather
than a firewall having closed.

**Only the one record this round added was removed.** `dns-remove` deletes the
exact item `{type: A, name: alpha-api, address: 178.128.209.91}`; the rest of the
`lawmind.co` zone was not read, written or replaced.

## Cost

| | |
| --- | --- |
| Gate-C accrued compute | **USD 16.67** |
| how | both Droplets, `2026-09-16T17:57:04Z → 2026-09-18T01:13:1xZ` = 31.27 h, billed as 32 whole hours × USD 0.52083/h |
| projected had it run the full 72 h | USD 37.50 |
| hard cap | USD 75 — never approached |
| recurring Gate-C compute from `2026-09-18T01:13:25Z` | **USD 0** |

**That USD 16.67 is OUR figure, not DigitalOcean's, and I will not dress it up as
theirs.** It is computed from the ledger's own `createdAt`/`destroyedAt` and
hourly rates. It stopped advancing the moment `destroyedAt` was stamped — which is
true *by construction* and therefore proves nothing on its own. The independent
evidence that billing stopped is that both Droplets answer **404**, and a Droplet
that does not exist cannot bill.

DigitalOcean's own number, for what it is worth: `month_to_date_usage` **USD
24.01**, `generated_at 2026-09-17T06:00:55Z`. It is **stale by 19 hours**, it
covers the **whole account** including `ubuntu-s-vikas` and its snapshots, and it
therefore cannot be quoted as the Gate-C cost. It is recorded here so nobody
mistakes it for one later.

## Preserved before destruction

| what | where | proof |
| --- | --- | --- |
| release pack (corpus) | `D:\lawmind-release-r32b\pack3` | present, `MANIFEST.json` + `MANIFEST.sha256`, ~76 GB. The runbook does not authorise removing it, so it stays. |
| **final USER database dump** | `D:\lawmind-release-r32b\user-final\lawmind_user_final.dump` | `pg_dump -Fc` taken on the host at `01:11Z`, 4,057,824 bytes, **sha256 `7bb4b4b1…4473af5` identical on host and workstation**; the host copy was then removed |
| USER row-count census | this receipt, below | taken with exact `count(*)`, not `n_live_tup` |
| everything in `/opt/lawmind/<sha>` | git | each directory is a pushed commit; nothing existed there that was not already in the repository |
| `/srv/lawmind-release`, `/srv/lawmind-user-pack` | workstation | copies of packs shipped **from** `D:\lawmind-release-r32b\` |

The USER database was the **only** thing that existed solely on a Droplet, so it
is the only thing that needed rescuing. At the moment of the dump it held:

```
users 737 · auth_user 364 · matters 18 · matter_authorities 13 · documents 6
saved_searches 6 · searches 6 · search_events 5,585 · citation_checks 20,307
llm_calls 40,165 · ops_job_observations 51,367 · audit_log 1,060 · alerts 6
```

Evidence on disk was **not** destroyed by this round: `docs/ai/lcc-r32b-do/`,
`docs/ai/lcc-r33/`, `docs/ai/rcc-r31/`, `docs/ai/rcc-r32/`, `docs/ai/fifth/` and
`docs/product/NEW3_R25_GATE_C_ACCEPTANCE.*` all stand. A passing gate is not
permission to destroy the record.

## Nobody still needed the alpha

- **RCC** — bus 1805, the advocate loop runs end to end; the gate line is HOLD only for `CELLULAR_BEARER_UNAVAILABLE`, which no longer depends on the machines.
- **FIFTH** — bus 1809, `GATE_C = PASS`, adjudicated against live `/version` `a09d7ee5`.
- **NEW3** — bus 1810, accepted and **frozen**; the receipts are bound as they stand and nothing was to be re-run.

## NEW3's six required proofs

| # | required | where |
| --- | --- | --- |
| 1 | `final-status.json` written **before** destruction | `docs/ai/lcc-r32b-do/final-status.json`, `updatedAt 2026-09-18T01:12:27Z`, teardown began `01:13:10Z` |
| 2 | `teardown --confirm` against every ledgered resource | six DigitalOcean resources deleted in the order firewalls → droplets → vpc → ssh key; DNS by `dns-remove` |
| 3 | precheck showing **no** `lawmind-gatec-*` and `ubuntu-s-vikas` **present** | `existingDroplets` = `[{566518737, ubuntu-s-vikas, FOREIGN_EXISTING_RESOURCE_DO_NOT_TOUCH}]`, quota headroom back to 29 |
| 4 | `dns-remove` executed, zone otherwise untouched | `{"dns":"removed"}` for the single `A alpha-api` item; NXDOMAIN confirmed on two public resolvers |
| 5 | non-null `destroyedAt` on **every** ledger entry | all **7 of 7**, `01:13:10.794Z` – `01:13:44.097Z` |
| 6 | final accrued cost, and recurring Gate-C compute is USD 0 | **USD 16.67** accrued; recurring **USD 0** — see Cost, including why our figure is not DigitalOcean's |

## CORRECTIONS

1. **I classified three deleted resources as `UNKNOWN` and it was my matcher, not
   the cloud.** The falsification file abbreviates UUIDs in its keys
   (`firewall 424dd1be …`), and I looked them up by full id, which matched
   nothing. Three resources that had returned a clean **404** were written into
   the ledger as `UNKNOWN` — the one classification that is supposed to **block**
   teardown completion. Matching by name fixed it and all seven read
   `DELETED_VERIFIED`. Worth stating plainly: a verification step that fails
   *closed* is the good direction, but it was still a false alarm I generated and
   then had to clear, and if I had matched too loosely instead it would have
   failed *open*.
2. **The row-count census was first taken with `n_live_tup`, which is an
   estimate.** Re-taken with exact `count(*)` per table before the dump. The
   numbers in this receipt are the exact ones.

## Observations, not acted on

- **DNS was removed 19 seconds after the Droplet was destroyed**, per the
  runbook's order. In those 19 seconds `alpha-api.lawmind.co` pointed at an IP
  DigitalOcean had already reclaimed and could in principle reassign. Nineteen
  seconds is not a meaningful exposure, but **the runbook orders it the riskier
  way round** and there is no reason it must: removing DNS *first* closes the
  window entirely and costs nothing. I did not deviate from an authorised
  destructive procedure on my own judgement — it is recorded here so the order can
  be changed deliberately, before the next temporary deployment.
- **FIFTH has seven untracked evidence paths** under `docs/ai/fifth/`
  (`gate-c-r32b/`, `release-rehearsal-0091/`, `bounded-restore-proof.json` and
  four more). They are on the workstation, not on the Droplets, so **nothing was
  lost by this teardown** — but they are one `git clean` from gone. FIFTH's to
  commit, not mine.

## NOT_DONE

- **No credential was rotated or revoked.** That is the founder's, it is
  sequenced deliberately after this proof, and doing it early is the one action
  that could have cost money mid-teardown.
- **No product change of any kind.** Auth, retrieval, semantic search, HNSW,
  `apps/**` and infrastructure sizing were not touched, and Gate C was not
  reopened.
- No snapshot or image was taken of either Droplet. The runbook does not require
  one and a snapshot is a **new billable resource** — the exact thing this round
  exists to end.

## UNKNOWN

**None.** Every ledgered resource ends `DELETED_VERIFIED`; every surviving
resource ends `RETAINED_NON_GATE_C` with dated evidence that it pre-dates Gate C.

## FOUNDER ACTION — credential rotation, now due

`REMOTE_CREDENTIAL_ROTATION_NOW_REQUIRED = YES`

The teardown is finished, so nothing of ours still needs these. **Rotate all four,
in the vendor consoles, yourself** — I have not revoked any of them and was not
authorised to:

| credential | where | why |
| --- | --- | --- |
| DigitalOcean API token | DO → API → Tokens | It could create and destroy Droplets in this account; it lived on the workstation for the whole of Gate C. |
| Resend API key | Resend → API Keys | It can send mail as `no-reply@lawmind.co`. |
| Spaceship API key | Spaceship → API | It can edit the `lawmind.co` DNS zone. |
| Spaceship API secret | Spaceship → API | Same. |

Queued as **FQ-NEW3-R25-ROTATE**. The local SSH private key at
`~/.lawmind-gatec/lawmind-gatec-202609161754` is already inert — its public half
was deleted from DigitalOcean and both hosts it opened are gone — but there is no
reason to keep it either.

## Final

```
GATE_C_RESOURCES_REMAINING            = 0
GATE_C_BILLABLE_RESOURCES_REMAINING   = 0
ALPHA_DNS_REMOVED                     = YES
UNRELATED_DO_RESOURCES_TOUCHED        = NO
REMOTE_CREDENTIAL_ROTATION_NOW_REQUIRED = YES
```

`LCC_GATE_C_TEARDOWN = COMPLETE`
