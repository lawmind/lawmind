# LAWMIND v7.4 — DEEP RECONCILIATION MEMO
## Why v7.3 was insufficient and what v7.4 restores

**Date:** 18 September 2026

---

# 1. THE ERROR IN v7.3

v7.3 correctly noticed that:
- Gate C had passed;
- the old seven-lane topology was too expensive;
- NEW1 embedding state and NEW2 citation state had advanced;
- Gate D was next.

But it compressed too aggressively.

It treated "simplify the agents" as if the project itself could be simplified into a smaller set of concerns.

That lost important programs that v7.2 had intentionally separated:
- HC/SCI continuity;
- source authorization distinctions;
- provenance;
- common-order identity;
- citation mutation vs graph apply;
- statute chronology;
- embedding reproducibility;
- incremental scheduler health;
- cold-query sizing;
- eCourts observation semantics;
- monitoring economics;
- R16 semantics;
- auth topology;
- backup key escrow;
- release/rollback;
- product beta instrumentation;
- reviewer access;
- commercial choice;
- risk register;
- fundraiser evidence;
- post-beta experiment triggers.

v7.4 keeps **three agents** but restores those programs.

Fewer agents = fewer handoffs.  
It does not mean fewer invariants.

---

# 2. WEBSITE CORRECTION

The biggest founder correction to v7.3 is conceptual.

The promotional website is **not a product surface**.

It is temporary marketing that the founder expects to tear down and rebuild once the application is complete.

Therefore v7.4 separates:

```text
PROMOTIONAL_SITE   = disposable / noncore
COMPLIANCE_URLS    = stable release contract
MOBILE_APP         = product
ADMIN_WEB          = internal/admin
```

This prevents three bad outcomes:

1. spending mobile-release capacity on website polishing;
2. letting stale promo copy reopen deferred product scope;
3. treating a future website rebuild as a dangerous product migration.

Only privacy/support/terms/external-deletion URLs need stable continuity because stores or users depend on them.

Store metadata remains a serious public claim surface because it controls review and cannot be corrected as casually as temporary promo copy.

---

# 3. SEQUENCING CORRECTION: PERSISTENT BETA BEFORE SERIOUS GATE D

v7.3 placed persistent beta hosting after Gate D.

That is backwards.

Gate C proved remote serving on disposable DigitalOcean infrastructure, then correctly destroyed it.

But Gate D needs:
- production-shaped mobile binaries;
- physical iPhone/Android;
- public auth/deep links;
- deletion;
- poor network;
- reviewer access;
- actual store-build behavior.

These tests need a stable remote API.

Therefore v7.4 inserts:

```text
Transition Seal
→ hosting/cost package
→ explicit founder spend
→ persistent beta plane
→ Gate-D physical/store matrix
```

That beta plane should then remain alive through:
- 3–5 shadow beta;
- Gate D;
- 10–30 closed beta;
- Gate E;
- store review.

This avoids paying the 10-hour-class restore cost repeatedly.

---

# 4. SHADOW-BETA GAP

v7.2 expected 3–5 practising advocates before the larger beta so LawMind could establish the Research Task Completion baseline and freeze thresholds.

Current Gate-C acceptance binds excellent physical/server evidence, but it does not clearly bind a 3–5-advocate human baseline artifact.

Therefore v7.4 does not assume it happened.

It classifies:

`SHADOW_BETA_3_5 = NOT_EVIDENCED_IN_CURRENT_GATE_C_ACCEPTANCE`

and runs the baseline early in Sprint 4 once persistent beta is usable.

No numeric threshold is invented beforehand.

---

# 5. USER-STATE ROLLBACK DEFECT ELEVATED

Gate C carried a nonblocking finding that corpus rollback can empty `matter_authorities`.

That is not a harmless production detail.

A saved authority attached to a matter is user state. A corpus generation rollback must not silently erase the user's research organization.

v7.4 promotes:

`CORPUS_ROLLBACK_PRESERVES_MATTER_AUTHORITIES = PASS`

to a **pre-beta reliability requirement**.

This is a good example of why passing one gate does not mean every carried finding stays nonblocking forever. Its severity changes with lifecycle stage.

---

# 6. REVIEWER ACCESS ADDED AS A FIRST-CLASS RELEASE REQUIREMENT

The product uses magic-link auth.

That is correct for users, but app-store reviewers need a stable way to reach authenticated functionality.

Google Play requires review access/credentials that remain usable; Apple expects full access/demo credentials or an equivalent review path.

Therefore v7.4 adds `REVIEW_ACCESS_V1`:

- reusable during review;
- geographically workable;
- no real client data;
- narrow/revocable;
- same capability gates;
- not a broad production auth bypass.

This was under-specified in v7.3.

---

# 7. BACKUP / SECRET CONTINUITY RESTORED

Two founder security actions were too easy to hide among product work:

### Gate-C credential rotation
Now due after teardown:
- DigitalOcean token;
- Resend key;
- Spaceship key/secret.

### R2 backup encryption key
The R2 backup has been restore-proven and client-side encrypted, but the encryption key was recorded as existing only on the workstation.

A backup that dies with the machine it is supposed to survive is not complete disaster recovery.

v7.4 elevates off-workstation key escrow to the immediate founder queue.

---

# 8. SOURCE-AUTHORIZATION DISTINCTION RESTORED

The repository contains a subtle but important distinction:

- founder authorization exists for named sources including eCourts / Supreme AI under their recorded terms;
- the direct SCI automated-access grant question was separately marked contested in the R10 authorization re-anchor;
- SCI acquisition through the public official homepage Judgments feed and official PDFs does not depend on that contested grant.

v7.4 records the distinction explicitly.

"SCI is authorized" without specifying the path is too broad.

---

# 9. DATA PROGRAM RESTORED

v7.3 named DATA but under-described its responsibilities.

v7.4 restores:
- HC/SCI continuity;
- source provenance;
- citation mutation protocol;
- edge apply independence;
- common-order identity;
- statute resolution;
- embeddings;
- model reproducibility;
- incremental queue;
- HNSW;
- retrieval evaluation;
- eCourts raw observations.

DATA is CONTINUOUS by default so the founder does not need to manage a constantly chatting second engineering lane.

---

# 10. NEW1 CURRENT STATE PRESERVED CORRECTLY

R15 shows the coarse embedding program reached its terminal frontier at that timestamp:

- 7,675,588 eligible content identities;
- 7,675,588 embedded;
- zero queue;
- zero unnamed residual;
- vector integrity pass.

The model revision remains unknown but exact local bytes are hashed and off-machine.

The ordinary ongoing work is incremental delta.

The scheduler's Interactive/Logon-only shape is an operational weakness: the job can be healthy yet fail to start until someone logs in after reboot.

v7.4 assigns logical job truth to DATA and host scheduler mechanics to SHIP/OPS.

---

# 11. HNSW IS NOT A GATE-D TASK

Measured local build memory need (~19.52 GiB) exceeds the safe free memory envelope.

Two prior attempts already proved the spill mechanism.

Therefore:
- no third local attempt;
- high-memory offload only;
- ANN evaluation after build;
- public semantic still separately disabled.

This prevents "we have free GPU time" from becoming product scope.

---

# 12. CITATION STATE PRESERVED CORRECTLY

The old 540-row safe-candidate story is obsolete.

R24 actually wrote 539 audited canonical corrections and read them back 539/539.

Then it rebuilt a fresh edge-candidate population.

But the graph remains risky:
- concentrated fan-in;
- alias path dominates;
- ambiguity/self-identity populations are huge relative to accepted candidates.

Therefore canonical correction = PASS while bulk edge apply = HOLD.

Those are separate truths and must stay separate.

---

# 13. eCOURTS STATE CORRECTED

Old roadmap language around `fillDistrict`, User-Agent and CAPTCHA is stale.

Current bounded evidence:
- `fillDistrict` solved;
- parser bug fixed;
- UA theory refuted;
- live rotating header pair found;
- cookie jar fixed;
- CAPTCHA accepted 3/3;
- source then returned an upstream server failure;
- real cause-list result still absent;
- observations still zero.

This means monitoring remains Shape B.

It does **not** mean eCourts engineering failed; it means no evidence exists for a user monitoring product yet.

---

# 14. COMMERCIAL DECISION IS EXPLICIT AGAIN

v7.4 does not infer "free" from old checklists and does not infer "paid" from temporary promotional pricing.

At Gate D founder chooses:

`FREE_BETA | PAID_V1`

Until then:
- engineering does not build billing by default;
- paywall/pricing on the temporary promo site is not product authority.

If paid, billing becomes its own tested store program.

---

# 15. MOBILE-ONLY SCOPE REASSERTED

The repo contains contradictory historical generations:
- founder reversed desktop/web advocate product on 12 Aug;
- later roadmap text put desktop back in scope.

Current founder instruction + current website clarification resolves the practical execution stance:

- mobile advocate app is the product;
- admin web remains;
- promo website is temporary;
- no advocate desktop/web work in Sprint 4–6.

No deletion of historical desktop code is required; it simply remains frozen.

---

# 16. WHAT v7.4 DELIBERATELY DOES NOT CHANGE

Still binding from v7.2:
- UNKNOWN remains UNKNOWN;
- no model-created authority;
- deterministic citation fields;
- safe-subset quarantine;
- strict query parser ≠ source mention scanner ≠ edge interpretation;
- common-order caution;
- statute resolver gating;
- generic R16 contract;
- durable-progress long-worker truth;
- formal independent Gate E;
- no generic chat;
- no public semantic current v1;
- no unsupported cadence;
- no store-policy inference from package/framework names;
- no major feature race during Sprint 4.

---

# 17. PRIMARY EXTERNAL POLICY BASIS RECHECKED FOR v7.4

Current official policy references used in the execution plan:

### Google Play target API
New ordinary mobile apps/updates must target Android 16 / API 36+.
https://support.google.com/googleplay/android-developer/answer/11926878

### Google external account deletion
Apps with account creation need in-app deletion and an external web deletion resource.
https://support.google.com/googleplay/android-developer/answer/13327111

### Apple build toolchain
Current App Store uploads require Xcode 26+ / iOS 26 SDK+.
https://developer.apple.com/news/upcoming-requirements/

### Apple App Review
Review requires working access to the application's functionality; account-creation apps must support account deletion; privacy policy/data practices must be accurate; public-database personal-info rules remain relevant.
https://developer.apple.com/app-store/review/guidelines/

These are rechecked again immediately before submission because store policy can move faster than the roadmap.

---

# 18. NEW EXECUTION SHAPE

```text
TODAY
  ↓
v7.4 transition seal
  ↓
DATA continuity census ──────────────┐
  ↓                                  │
SHIP beta-hosting cost package       │
  ↓ founder approval                 │
persistent beta plane                │
  ↓                                  │
pre-beta reliability closure         │
  ↓                                  │
Gate-D device/store pass             │
  ↓                                  │
3–5 advocate baseline                │
  ↓                                  │
Gate D                               │
  ↓                                  │
10–30 advocate closed beta ←─────────┘
  ↓
RED Gate E
  ↓
candidate freeze / stores
  ↓
optional promo-site rebuild
  ↓
launch
```

That is the project plan v7.4 is designed to execute.

---

# 19. AMENDMENT A1 — PRIMARY-SOURCE POLICY RECHECK, 18 SEPTEMBER 2026

Recorded by SHIP S4-T0.1. Every row was read from the source named, on 18 Sep 2026.
Round record: `docs/ai/ship-s4-t0-1/AUTHORITY_RECONCILIATION.md`.

| Key | Observed | Source |
|---|---|---|
| `GOOGLE_TARGET_API` | "New apps and app updates must target Android 16 (API level 36) or higher" from 31 Aug 2026; extension to 1 Nov 2026 on request | https://support.google.com/googleplay/android-developer/answer/11926878 |
| `APPLE_UPLOAD_TOOLCHAIN` | "Since April 28, 2026 … must be built with Xcode 26 or later using an SDK for iOS 26" | https://developer.apple.com/news/upcoming-requirements/ |
| `GOOGLE_EXTERNAL_DELETION` | in-app path **and** "a web link resource where users can request app account deletion"; functional, relevant, identifiable | https://support.google.com/googleplay/android-developer/answer/13327111 |
| `GOOGLE_REVIEW_ACCESS` | "accessible at all times, reusable, and valid regardless of user location" | https://support.google.com/googleplay/android-developer/answer/15748846 |
| `APPLE_REVIEW_ACCESS` | 2.1(a): "an active demo account or fully-featured demo mode"; demo mode in lieu of an account needs prior approval; 5.1.1(v) in-app account deletion | https://developer.apple.com/app-store/review/guidelines/ |
| `PLAY_CONSOLE_2026_09_30` | Android developer verification: Play packages must be registered by 30 Sep 2026 or be removed from Play; broader enforcement on certified devices in 2027 | https://android-developers.googleblog.com/2026/06/android-developer-verification.html · https://support.google.com/googleplay/android-developer/answer/16984799 |
| `APPLE_ORG_ENROLLMENT` | legal entity (no DBAs), D-U-N-S, legal binding authority, work email on the org domain, public functional website on the org domain, 2FA | https://developer.apple.com/programs/enroll/ |
| `PBL` | versions 8 and 9 supported; 9 is latest; 7's new-app/update deadline was 31 Aug 2026 | https://developer.android.com/google/play/billing/deprecation-faq |
| `DPDP` (Act) | G.S.R. 843(E), 13 Nov 2025: clause (a) on publication; (b) s.6(9), s.27(1)(d) after one year; (c) the bulk after eighteen months (13 May 2027) | https://cadp.in/news/dpdp-act-commencement-and-data-protection-board-notified/ (secondary; Gazette text not machine-readable from the PIB PDF this round) |
| `DPDP` (Rules) | G.S.R. 846(E), 13 Nov 2025: Rules 1, 2, 17–21 on publication; Rule 4 after one year (13 Nov 2026); Rules 3, 5–16, 22, 23 after eighteen months (13 May 2027) | https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf · https://www.mondaq.com/india/privacy-protection/1759134/ |

`UNKNOWN`: the Gazette PDF text itself (the PIB copy did not decode), so the Act's clause
lettering and the exact publication day (13 vs 14 Nov 2025 in one secondary source) rest on
secondary sources. Hence `DPDP_EFFECTIVE_DATE_RECHECK = REQUIRED_BEFORE_PUBLIC_LAUNCH`.
