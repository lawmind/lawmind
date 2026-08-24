# STAGING PACKAGE PROPOSAL — prepared, not deployed

**NEW3, 23 Aug 2026, correction #6 of the founder's binding orchestrator instructions:
"STAGING_REQUIRED means prepare the decision now."** `docs/FOUNDER_QUEUE.md`
`FQ-HOSTING` already recorded that public serving eventually needs a reachable
box and that nothing is authorised yet. This document is the exact package that
entry deferred writing — provider, region, machine class, storage, cost, migration
method, secrets, backup, rollback, expected India latency, what needs founder
action — so that when approval comes, deployment is an execution decision, not
another research project. **Nothing here has been provisioned. No account has
been created, no credential read, no spend committed.**

---

## 0. What already exists in the repo, and how this document differs from it

Two independent AI-authored audits landed in the repo on 22 Aug 2026
(`docs/ai/audits/LAWMIND_MASTER_PLAN_V3_ADVERSARIAL_CORRECTION_2026-08-22.md`,
`LAWMIND_PUBLIC_LAUNCH_MASTER_PLAN_V2_2026-08-22.md`) and both independently
recommended a Hetzner AX102-class dedicated server at **~€157/mo**. That figure
is **not adopted here without a second check** — this document exists partly
because "an audit recommended it" is not the same evidentiary bar as "this
session verified it," and the check below found a real discrepancy.

**Corroboration attempted, not fully closed.** Hetzner's own product page
renders price via client-side JavaScript and could not be read directly this
session (`WebFetch` on `hetzner.com/dedicated-rootserver/ax102/` returned specs
but no price). A web search corroborated via a third-party price tracker
(`serverlist.dev`, page dated 12 Aug 2026, after Hetzner's confirmed 15 June
2026 price adjustment) instead: **AX102 — 16 cores / 128 GB RAM / 1,920 GB
NVMe — listed at €259.00/month excluding VAT**, not €157. Both figures postdate
the June price rise, so the €157 in the existing audits is either a stale
number, a promotional/auction-market variant, or a different configuration —
**unresolved, flagged rather than guessed at.** Whoever executes this must
re-price on Hetzner's own configurator on order day; do not commit to either
number from this document.

Sources: [serverlist.dev/servers/compare/4743-hetzner-ax102](https://serverlist.dev/servers/compare/4743-hetzner-ax102) · [docs.hetzner.com — 15 June 2026 price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) · [hetzner.com/dedicated-rootserver/ax102](https://www.hetzner.com/dedicated-rootserver/ax102/)

**A second, more important discrepancy this document surfaces for the first
time: region.** `docs/OPEN_DECISIONS.md` OD-2 (resolved 2 Aug 2026) recorded
the founder's DPDP residency position as **Singapore** — Railway's nearest
region to India, with "a migration path before the DPDP compliance deadline of
13 May 2027." Hetzner has **no Singapore or India region at all** — its
options are Germany/Finland (EU) or Ashburn/Hillsboro (US). A move to Hetzner
is therefore not a hosting swap within OD-2's resolved position; it is a
**different region than the one the founder's counsel position was recorded
against.** This document does not resolve that — it is named here so the
founder decides it with open eyes rather than discovering it after a box is
already running production data.

---

## 1. Provider and region

| | Proposal | Why | Open question |
|---|---|---|---|
| Provider | Hetzner Robot (dedicated, not Cloud) | Only way to get 128GB+ RAM with local NVMe (HNSW index resident in RAM) at a price competitive with a managed Postgres instance carrying far less RAM. Cloud-instance equivalents with comparable RAM run materially higher. | Not independently re-priced against a second dedicated provider (OVH, Scaleway) this session — worth one comparison quote before ordering, not assumed equivalent. |
| Region | Falkenstein (FSN) or Helsinki (HEL), Germany/Finland | The two Hetzner locations the existing audits named; no material India-latency difference between them. | **Conflicts with OD-2's Singapore position — see §0. Needs the founder + DPDP counsel to confirm EU is still acceptable, or to require a Singapore-capable provider instead (higher cost, per OD-2's own Railway-Singapore baseline).** |

## 2. Machine class

**Legal-corpus / search server**: AX102-class (16 cores, 128GB+ RAM, 2×1.92TB
NVMe). The RAM figure is load-bearing, not a nice-to-have — the audits'
reasoning was to keep the pgvector HNSW index resident in memory rather than
paging from disk on every semantic query, which is the same p50-43s-under-load
problem this session independently reproduced against the LOCAL stack (bus
1000, 22 Aug). A smaller box does not fix that problem; it reproduces it
remotely.

**Users/auth database**: a small, separate instance (Hetzner Cloud CX22-class,
~€4–15/mo, per the existing audit) — **not** co-located with the legal corpus.
Rationale already recorded in the audit and worth restating because it is
correct independent of price: `users`, `matters`, `documents` and the DPDP
`data_requests` table are the **irreplaceable** data (a lost legal-corpus box
is a re-download from AWS Open Data; a lost users box is every advocate's
account and case history, gone). Separating them gives that data its own
failure domain, its own backup target, and its own upgrade window that never
has to coincide with a corpus-server maintenance window.

## 3. Storage

Legal corpus: local NVMe on the AX102 box (2×1.92TB, RAID1 or RAID0 depending
on the founder's risk tolerance for a rebuild-from-AWS event — RAID0 is
cheaper and rebuildable; RAID1 halves usable capacity for resilience an
AWS-Open-Data rebuild already provides at the corpus layer). Users DB: whatever
the smaller cloud instance's default volume offers, sized for years of matter
growth at the current per-advocate data volume, not re-derived here (a sizing
exercise belongs to whoever provisions it, against real per-advocate byte
counts this session did not measure).

Object storage (documents, R2): **unchanged** — Cloudflare R2 is already the
stack's chosen object store (`CLAUDE.md` §4), not something this staging move
touches.

## 4. API / application tier

`services/api` (Hono) runs as a container or systemd service on the users-DB
box (or its own small instance) rather than the corpus box — the corpus server
should do one thing (serve vector/lexical search fast) and not compete for CPU
with request handling, matching the resource-contention lessons already
recorded in this repo's own memory (`services/api`'s connection-pool split,
LCC's 22 Aug session — research must not starve core paths). `EXPO_PUBLIC_API_URL`
/ `NEXT_PUBLIC_API_URL` already read from environment with no hardcoded
fallback (fixed this session's predecessor, `FQ-HOSTING`) — pointing the app at
whatever domain this box gets is a config value, not a code change, on the
client side. That part of the path is **already built and merged.**

## 5. DNS / TLS

Not yet decided: a domain (`lawmind.co` is already owned per `PRODUCT_BRIEF.md`
header) pointed at the new box via Cloudflare (already in the stack for R2;
using it as a DNS/CDN/TLS-terminating proxy in front of the API is the
lowest-new-vendor option — no new party added). TLS via Cloudflare's own
edge certificates requires no server-side certificate management. **Not
provisioned. A subdomain choice (e.g. `api.lawmind.co`) is the founder's or
whoever executes this, not invented here.**

## 6. Estimated monthly cost

Given the §0 price discrepancy, presented as a range rather than a point
figure:

| Item | Low (audit's €157 AX102 figure) | High (this session's €259 corroboration) |
|---|---|---|
| Legal-corpus server | €157 | €259 |
| Users-DB instance | €5–15 | €5–15 |
| R2 (documents, already budgeted elsewhere) | ~$5 | ~$5 |
| Domain/Cloudflare | ~$2 | ~$2 |
| Sentry/PostHog/UptimeRobot free tiers | $0 | $0 |
| Resend free tier | $0 | $0 |
| **Total, pre-revenue** | **~$195–215/mo** | **~$300–330/mo** |

**Do not treat either bound as final.** Re-price the corpus server on
Hetzner's live configurator (or a competing quote) on the day of ordering —
this is exactly the "read current docs/pricing, never from memory" rule
(`CLAUDE.md` §1, global rule 6.2.2) applied to a vendor number nobody in this
session could fully verify.

## 7. Migration method

1. **Server-side build, not a client-side clone.** The existing audit's revised
   method (V4, "DESIGNED-NOT-PROVEN" — its own honest label, not upgraded here):
   the local factory exports compressed `COPY` streams per table, ships them to
   the new box, and the new box builds its own indexes on real NVMe rather than
   receiving a pre-built image over a residential upstream connection. **This
   has not been rehearsed end-to-end anywhere in this repo.** Treat it as a
   design, not a proven runbook, until a first rehearsal happens against a
   throwaway target.
2. **Cutover**: DNS/API-URL flip once the new box's validation battery passes
   (citation search, statute lookup, hybrid retrieval — the same three checks
   this session ran hands-on against LOCAL_CONTENDED, bus 1000) — not before.
3. **Rollback**: keep the local stack fully intact and capable of serving
   through the cutover window; the `EXPO_PUBLIC_API_URL` override built this
   session means reverting is changing one environment variable back, not a
   redeploy.

## 8. Secrets

Not decided here. Whatever the target is, the existing pattern already in this
repo — `services/api/src/env.ts` reads every credential from `process.env`
with no fallback and refuses to start without `AUTH_SECRET` (verified this
session as part of the tenant-isolation audit relayed to LCC, bus 1043) —
extends unchanged to a new host: secrets live in that host's environment
configuration (Hetzner's own secret/env mechanism, or a `.env` file with
host-level file permissions, whichever the executor's runbook specifies), never
committed, never regenerated ad hoc the way this session's own ephemeral local
`AUTH_SECRET` was for LOCAL_CONTENDED verification only.

## 9. Backup

`docs/FOUNDER_QUEUE.md` `FQ-BACKUP-SPEND` (LCC, 22 Aug 2026) already answers
the *what*: 34 tables, 1.53GB compressed, proved restorable, and the founder's
decision is only **where** it goes off-machine. That answer travels
unchanged to a new host — whatever box holds the users DB should run the same
backup pack script on the same or a tighter schedule, and ship it to Cloudflare
R2 (already the stack's object store) rather than adding a second backup
vendor.

## 10. Expected India latency

**Not measured this session — no box exists to measure against.** What is
known without invented numbers: Hetzner's EU locations (Falkenstein/Helsinki)
are materially farther from Indian advocates than Railway's Singapore region
was, which is precisely why §0's region conflict with OD-2 matters — Singapore
to India is a same-region hop (typically double-digit milliseconds); EU to
India is a cross-continental one (typically 150–250ms+ round-trip, though this
session did not measure it and states so rather than quoting a borrowed
figure). For a product whose stated hard constraint is courthouse
connectivity and a 15-second client timeout already observed to be tight
under load (bus 1000's 75.8s concept-search measurement), added base latency
from an EU box is not a rounding error — it directly erodes the timeout budget
before any query-execution time is spent. **This is the single strongest
argument for resolving §0's region question before ordering anything**, not
an afterthought to the cost comparison.

## 11. What needs founder action, named precisely

1. **The region conflict (§0, §10)**: EU (Hetzner, cheaper, farther from
   India, price-uncertain) vs. a Singapore-capable provider (matches OD-2's
   already-recorded counsel position, likely costs more, not researched this
   session at the same depth). This is a DPDP-adjacent decision and should go
   through the same counsel channel OD-2 itself is still owed a written
   opinion from.
2. **Re-priced Hetzner (or alternative) quote** on the day of ordering — the
   €157 vs €259 gap in §0/§6 is real and unresolved from this session's
   research alone.
3. **Approval to spend anything recurring at all** — per the founder's own
   LOCAL-FIRST instruction this session (bus 1000), no box gets ordered
   without this regardless of which region wins.
4. **Where the backup pack (`FQ-BACKUP-SPEND`) goes** — a decision this
   document's §9 says travels to a new host unchanged, but which itself still
   has no founder answer.

**What proceeds without any of this**: nothing in this document is a
prerequisite for the client-side and analytics/push work already shipped this
session — all of it was built and verified against the LOCAL stack, per the
founder's own binding instruction, and none of it depends on when or whether
a staging box is ordered.
