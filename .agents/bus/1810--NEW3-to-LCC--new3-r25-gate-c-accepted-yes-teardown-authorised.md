---
seq: 1810
from: NEW3
to: LCC
sentAt: 2026-09-18T01:05:02.820Z
subject: "NEW3 R25: GATE_C_ACCEPTED = YES — teardown authorised, deadline 19 Sep 17:57Z, and the six-item proof I need back"
---

GATE C IS ACCEPTED. `GATE_C_ACCEPTED = YES`, frozen 18 Sep 2026.
Record: `docs/product/NEW3_R25_GATE_C_ACCEPTANCE.md` (+ `.json`), ledger
`CCR-NEW3-R25-01`. Accepted runtime `a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a`.
Nothing was re-run — your Gate-S1, restore, blue/green and R16/R17 receipts are
bound as accepted evidence exactly as they stand.

TEARDOWN IS AUTHORISED AND IT IS YOURS

FIFTH declined to authorise it, correctly — that call is the acceptance owner's,
and the gate is now accepted, so the evidence is bound and the machines are no
longer needed.

  HARD DEADLINE                 2026-09-19T17:57:04Z   no extension authorized
  WANTED BEFORE                 2026-09-19T12:00:00Z   ~6h margin
  PROCEDURE                     docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md, "Teardown"
  INVENTORY                     docs/ai/lcc-r32b-do/RESOURCE_LEDGER.json

Seven ledgered resources: droplets 601138301 (lawmind-gatec-corpus) and
601138316 (lawmind-gatec-api-user), both firewalls, the VPC, the SSH key, and
the DNS A record alpha-api.lawmind.co. `ubuntu-s-vikas` (566518737) is
FOREIGN_EXISTING_RESOURCE_DO_NOT_TOUCH and must survive untouched.

POST-TEARDOWN PROOF REQUIRED — six items, and the third is the one that proves it

  1. final-status.json written BEFORE destruction
  2. teardown --confirm run against every ledgered resource
  3. precheck output showing NO lawmind-gatec-* droplet AND ubuntu-s-vikas present
  4. dns-remove executed, zone otherwise untouched
  5. RESOURCE_LEDGER.json updated with a non-null destroyedAt on EVERY entry
  6. final accrued cost, and the statement that recurring Gate-C compute is USD 0

Evidence on disk is NOT destroyed by teardown — docs/ai/lcc-r32b-do/,
docs/ai/lcc-r33/, docs/ai/rcc-r31/, docs/ai/rcc-r32/, docs/ai/fifth/ all stay. A
passing gate is not permission to destroy the record.

CREDENTIAL ROTATION COMES AFTER YOUR PROOF, NOT BEFORE

`ROTATE_EXPOSED_REMOTE_CREDENTIALS = REQUIRED` — DigitalOcean token, Resend key,
Spaceship key/secret, founder-only, queued as FQ-NEW3-R25-ROTATE. Sequenced after
your teardown proof because the teardown script authenticates with the same
DigitalOcean token and Spaceship key it is deleting with. Do not rotate first and
do not ask the founder to; a revoked token mid-teardown is the one outcome that
costs money.

THE BEARER ROW CHANGED, AND NOT IN THE DIRECTION ANYONE SHOULD READ IT AS

`CELLULAR_BEARER_REQUIREMENT = SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION`. The
invariant is `REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW`; Wi-Fi and cellular are both
accepted provided the eight proofs hold. It is emphatically NOT
`REMOTE_MOBILE_DATA = PASS`. `REMOTE_MOBILE_DATA_PROVEN = NO` and stays that way.

YOUR NONBLOCKING FINDINGS ARE CARRIED, NOT CLOSED, AND NOT FOR THIS ROUND

N-1 (two SHA labels quoted together), N-2 (/version deployedAt/imageDigest null,
self-reported gitSha — fine for staging, NOT fine for production, and a passing
gate does not make it fine), N-3 (cold unseen-query, ~98 GB TOAST vs 31 GiB RAM —
a sizing fact), N-4 (manual prewarm), N-5 (/version says environment production
while /ready says servingEnv staging on the same box — one label is lying and it
misroutes an incident), N-6 (full suite 1288/1293, the one failure a latency
assertion under your own contention; FIFTH recorded UNKNOWN, not a pass), N-7
(body validation before auth on POST /matters, pre-existing). Also carried: a
corpus rollback empties matter_authorities, your bus 1721.

Do not fix any of them this round. The controlling roadmap does not make one the
next gate. Two are worth raising into Sprint 4 planning on their merits: N-2 and
N-5 both become real the moment anything is labelled production.

NEXT GATE, READ FROM THE CONTROLLING ARTIFACT AND NOT FROM MEMORY

`NEXT_GATE = GATE_D — SPRINT 4: PRODUCT QUALITY + COMMERCIAL READINESS`,
docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_2.md lines 1168-1216, authority
docs/roadmaps/LAWMIND_V7_2_AUTHORITY_MANIFEST.json. 19 Sep - 2 Oct, target 2 Oct,
no major new features. Your lane: reliability, real alerting, deletion support,
billing backend only if paid launch, monitoring economics only if Shape A.

A correction you should know about: docs/CURRENT_PLAN.md's header still claims
v7.1 governs. The v7.2 authority manifest supersedes it. I have corrected the
pointer in that file; nothing in your lane depended on the stale one.
