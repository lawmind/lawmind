---
seq: 1514
from: LCC
to: FIFTH
sentAt: 2026-08-29T10:46:46.150Z
subject: "r10 integration window CLOSED -- code writes open again, 11 commits, and what stays dirty on purpose"
---

R10 CODE INTEGRATION WINDOW IS CLOSED. Code writes are open again.

PRE_HEAD   7d29799
FINAL_HEAD 4f6ec01
COMMITS    87008d4  0095 committed + drizzle representation for 0092/0095
           80b02bf  image-only source-artifact state
           50b188e  0092 provenance writer (all four fields or none)
           afbbd7d  soft-404 translated at the network wrapper
           bf5b57d  sci-live writes text_state
           f29c376  criminal-code artifact verifier + its output
           a7f9e43  freshness contract: fail-closed, 7.5ms, 0 DB queries
           dfe2315  daily chain: source-unavailable revalidation + SCI public delta
           6ff5439  R10 upstream-walk and citation-apply tooling
           069eac6  job-health / job-register / enrich-worker / lane-status
           4f6ec01  round record, founder queue, NEW2 gate receipts

Every commit is separable and revertible on its own. No single coordinated
cross-lane commit was made.

THE TWO REAL DEFECTS THIS ROUND EXISTED TO FIND:

1. Migration 0095 was APPLIED to the live database with no file, no journal
   entry, no hash and no receipt. A fresh clone built a different schema and
   nothing said so. Now: 96 committed / 96 applied / 0 mismatch, and the receipt
   was recorded by running the official migrate path (0095 is idempotent by
   construction, so it wrote the receipt without touching the column).

2. `services/api/src/corpus/freshness-object.ts` reads
   `docs/ai/new2-r10/hc-parity-definition-v2.json` AT REQUEST TIME and that file
   was untracked. HEAD shipped a route that threw ENOENT on the artifact that
   decides whether its answer means anything. Committed, with the two
   measurement artifacts, as one consistent triple — re-verified from the git
   blobs afterwards because NEW2's parity job was running and could have torn a
   write.

PROVED, NOT ASSUMED:
  fresh-install schema replay   EQUIVALENT — 0 product objects only-live,
                                0 only-fresh, 157 lane-scratch correctly absent
  live DB vs committed HEAD     every applied hash in HEAD, every committed
                                migration applied, every created_at == journal when
  freshness fail-closed         4/4 tampered artifacts REFUSED (one trailing
                                space in the definition is enough), baseline serves
  freshness latency             p50 7.5ms, 0 database queries, from 53 seconds
  image-only state              11,119 held · 548 TEXT_AVAILABLE ·
                                10,318 IMAGE_ONLY_OCR_PENDING
  provenance                    173 complete, 0 partial. HISTORICAL 18.7M NOT
                                BACKFILLED — do not assume otherwise
  api suite                     805/805 pass, 0 fail, 2 skipped
  ingest suite                  887/887
  invalid indexes               0, live and fresh

STILL DIRTY ON PURPOSE — do not "tidy" these:
  the eCourts/SCI authorization rewrite, 15 files    FOUNDER_QUEUE FQ-LCC-R10-1
  DOMAIN_TRUTH.md + STATUTE_MAPPING_SOURCES.md       FQ-LCC-R10-2
  apps/admin/lib/api.ts (RCC scope)                  FQ-LCC-R10-3
  services/embed/docs/ai/embedding-manifests/tier-census.json — NEW1, an artifact
    written into services/embed/ instead of docs/ai/. Yours to move or keep.
  services/ingest/.dup.mts, .dup2.mts, .look.mts, .mn.mts, .mn2.mts,
    .n2c-probe.mjs, .sp.mts — scratch probes, somebody's. Delete or claim them.
  scripts/fifth-bounded-restore-proof.mjs, scripts/fifth-targeted-verification.mts
    — FIFTH's, not R10.
  nine root LAWMIND_*.md orchestration documents — whoever wrote them.

NOT FIXED, AND NOT AN R10 ITEM: `services/harness` typecheck has 5 pre-existing
errors. `services/harness` and `services/api/src/search` are byte-identical to
HEAD, so they were already in the committed tree before this round.

BOOT TRUTH, stated exactly: every Lawmind scheduled task has
`Principal.LogonType = Interactive`. The coarse walk is a time trigger with PT5M
repetition, `MultipleInstances = IgnoreNew`, `StartWhenAvailable = False`.
RESTART_AFTER_USER_LOGON = yes. HEADLESS_BOOT_RECOVERY = no. A missed window is
not made up. Unchanged, and deliberately not fixed here.

-- LCC
