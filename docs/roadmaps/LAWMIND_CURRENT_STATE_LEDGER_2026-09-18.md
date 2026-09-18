# LAWMIND — CURRENT STATE LEDGER
**As reconciled:** 18 September 2026  
**Repository anchor when prepared:** `lawmind/lawmind@6b1355eb96ae46e6ad0c7d0441306dd6ea76618a`

This file is intentionally compact. It is a pointer to current truth, not a replacement for receipts.

---

## 1. Phase

```text
Gate A                 PASS
Gate B                 PASS
Local v1               ACCEPTED
Gate C                 PASS + ACCEPTED
Gate-C DigitalOcean    DELETED_VERIFIED
Current work           Sprint 4 / Gate D
Next formal RED gate   Gate E
```

Gate-C accepted runtime: `a09d7ee5…` (historical; environment destroyed).

---

## 2. Product scope

```text
Advocate iOS           IN SCOPE
Advocate Android       IN SCOPE
Advocate desktop/web   DO NOT BUILD (founder mobile-only decision)
Admin web              SEPARATE
Promo website          TEMPORARY / NONCORE / REBUILD LATER
Compliance web URLs    STABLE RELEASE CONTRACT
```

Core loop proven remotely:

`Auth → Search → Reader → Save → Matter → relaunch/refetch`

---

## 3. Active agent model

```text
SHIP   ACTIVE
DATA   CONTINUOUS
RED    FROZEN
```

Historical agent names remain evidence only.

---

## 4. Capability state

Current v1:
- exact/legal identity search classes;
- lexical search + honest refusal;
- structured narrowing;
- Reader/source/provenance;
- Save/Matter;
- current v1 writes/deletion.

Deferred/disabled:
- public broad semantic;
- HNSW public use;
- supporting/adverse semantic;
- drafting;
- uploads/OCR;
- Hindi generation;
- hearing briefing;
- monitoring;
- eCourts user product;
- statute-linked judgments;
- old/new code applicability;
- unconfirmed-citation feature path.

iOS party-name search: submission default OFF unless newer explicit decision.

---

## 5. Data state

### Embeddings — last terminal receipt
```text
eligible content identities  7,675,588
embedded content identities  7,675,588
queued                       0
unnamed residual             0
vector integrity             PASS
```

Incremental queue remains.

HNSW:
```text
no full index
local build prohibited by measured RAM constraint
high-memory offload only
public semantic disabled
```

### Citation
```text
R24 canonical correction      PASS
539/539 readback               PASS
quarantine                     untouched
bulk edge apply                HOLD
```

Fresh edge population requires independent audit before any bulk apply.

### eCourts
Last bounded state:
```text
fillDistrict       solved
CAPTCHA            accepted 3/3
source response    upstream server failure on bounded attempts
real cause-list    not obtained
observations       0
retention          unmeasured
daily pilot        not started
monitoring         disabled
launch shape       B / research-only
```

---

## 6. Reliability carried into Sprint 4

Must resolve before persistent beta / production as specified:

- deployment provenance incomplete for production;
- `/version` vs `/ready` environment-label mismatch;
- manual prewarm after corpus activation/restart;
- `matter_authorities` loss on corpus rollback;
- full API suite timing failure remains UNKNOWN until quiet run;
- body-validation-before-auth hardening;
- accessibility selected-state defect;
- cold unseen-query capacity issue.

---

## 7. Store/release

Need current observed proof:
- persistent beta/review backend;
- Android API36+ release artifact;
- current iOS production/TestFlight build with Xcode26+/iOS26 SDK+;
- current physical iPhone;
- representative low/mid Android;
- accessibility;
- tablet decision;
- external account deletion URL;
- privacy/support URLs;
- reviewer access;
- store metadata/capability parity;
- commerce decision.

---

## 8. Founder actions

Due:
1. rotate Gate-C DigitalOcean token;
2. rotate Resend key;
3. rotate Spaceship key + secret;
4. escrow `R2_BACKUP_ENCRYPTION_KEY` off workstation;
5. approve/decline persistent beta hosting after SHIP cost package;
6. provide Apple/Google store-account access/state as needed;
7. choose FREE_BETA vs PAID_V1 at Gate D.

No promotional-website design decision is required.

---

## 9. Immediate sequence

1. SHIP v7.4 Transition Seal.
2. DATA current continuity receipt.
3. SHIP persistent-beta hosting preflight/spend package.
4. Founder approves/declines spend.
5. Persistent beta plane + pre-beta reliability closure.
6. Gate-D device/store work.
7. 3–5 advocate shadow beta + threshold freeze.
8. Gate D.
9. 10–30 advocate closed beta.
10. RED Gate E.
11. candidate freeze/submission.
12. optional promotional-site rebuild after app candidate is stable.
