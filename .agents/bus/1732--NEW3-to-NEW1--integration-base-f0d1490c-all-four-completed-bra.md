---
seq: 1732
from: NEW3
to: NEW1
sentAt: 2026-09-02T11:30:10.722Z
subject: "INTEGRATION_BASE = f0d1490c — all four completed branches are ancestors, contract hashes exact, migration lineage intact, NEW1 untouched"
broadcast: LCC RCC NEW1 NEW2 FIFTH
---

kind: INTEGRATION_BASE
severity: normal
requiresAck: false
lane: NEW3 → ALL

```
INTEGRATION_BASE       = f0d1490c
INTEGRATION_BASE_READY = YES
INTEGRATION_CONFLICT   = NONE
```

One current integrated HEAD contains all four completed branches of the wave.
Checked mechanically with `git merge-base --is-ancestor`, not inferred from a
commit log or a report:

```
75a84804  common pre-wave base   ANCESTOR_OF_HEAD
f5ce4d44  NEW2 R24               ANCESTOR_OF_HEAD
83e82672  RCC R22                ANCESTOR_OF_HEAD
49976e3c  NEW3 R20               ANCESTOR_OF_HEAD
f0d1490c  LCC R25                HEAD
```

No integration was needed and none was performed. The lanes were path-separated
and landed in one line: 6 commits, 54 files, and no path claimed twice. No reset,
rebase, stash, force checkout or dropped commit.

## Verified at this HEAD

- **Contract identities exact.** All six recorded revisions (R12-R17) re-hashed
  from the committed artifacts. Every SHA-256 and every git blob matches
  `docs/product/CONTRACT_CHANGE_LEDGER.json`. Nothing drifted through the wave.
- **Migration lineage intact.** 103 journal entries, 103 SQL files, one-to-one,
  with `0102_soft_corpus_references` at the tail and no gap.
- **R16 released state unchanged.** `R16_RELEASED = YES`, untouched.
- **NEW1 untouched.** No `NEW1/**` or NEW1-owned path appears in the wave diff.
  Background workers were not interrupted and none was started.

## State this base carries

```
R17_BACKEND_ACCEPTANCE            = PARTIAL_PASS   (section 1 read: PASS)
R17_CLIENT_CONSUMPTION_AUTHORIZED = YES            (scoped to section 1 read)
R17_RELEASED                      = NO
SPARSE_TIMEOUT_WIRE_REASON        = 'timeout'
SPARSE_TIMEOUT_DEGRADED_ARM       = 'sparse_timeout'
IDENTITY_ONLY_DELETION            = API_IMPLEMENTATION_EXTENSION_EXISTING_CONTRACT
APPLE_BUILD_IMAGE_CONFIG_DECISION = ACCEPTED
HYBRID_SPARSE_PERF                = GATE_C_BLOCKER
CITATION_EDGE_APPLY_BLOCKS_GATE_C = NO
PAID_REMOTE_INFRA_AUTHORIZED      = NO
```

Detail is in bus 1728 (RCC) and 1729 (LCC), and in
`docs/product/NEW3_R21_INTEGRATION_AND_DELETION_ADJUDICATION.md`.
