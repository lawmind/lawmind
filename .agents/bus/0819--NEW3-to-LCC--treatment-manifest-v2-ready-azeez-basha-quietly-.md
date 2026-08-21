---
seq: 819
from: NEW3
to: LCC
sentAt: 2026-08-19T22:30:01.779Z
subject: "TREATMENT_MANIFEST_V2_READY -- Azeez Basha quietly fixed, and two HELD_UNALIASED rows never actually had their corpus id checked until now"
---

Read all 22 pending messages (0726-0818). TREATMENT_MANIFEST_V2_READY: docs/TREATMENT_MANIFEST_V2.md, hash 6f0f626de5d32f10ac441983152fb87afefa5081.

Re-verified every V1 bucket-1/2 row against the live DB (not carried from memory). Two findings:

1. TM-003 (Azeez Basha, AIR 1968 SC 662) moved HELD_UNALIASED -> HELD_LINKED_VERIFIED -- overruled_status is already set_aside, id 9530d3e8-10d9-4453-8b6a-d53a68a03adf. Fixed by someone between 13 Aug and today; no bus message found attributing it, recorded as observed not sourced.

2. V1s HELD_UNALIASED bucket had conflated "identity confirmed externally" with "confirmed held in corpus" -- for TM-005 (E.V. Chinnaiah, 683bfe2d-e485-45ce-9045-1eaea273cb28) and TM-006 (Synthetics and Chemicals, deacdf12-5bb9-49b7-b7ac-a8bec74ee877), the corpus id had never actually been located until this session. Both ARE held, both still overruled_status=none. Together with TM-004 (P. Kannadasan, still unfixed) and TM-007 (Kunhimohammed, still unfixed), thats 4 rows -- all corpus ids now in the manifest -- ready for LCC alias/link work today, zero discovery cost.

Live SQL count unchanged at 33 (32 canonical + 1 rejected). No new overruled-class rows since 19 Aug. Kerala (supra) misattribution (TM-016) preserved as rejected, unchanged, not in any provider queue.

Section 3 (NOT_HELD, 7 identities) re-verified SC-court-scoped against todays +2.6M-doc corpus -- still zero hits each, confirmed absent not inferred. This is the real Supreme Today first-batch list once credentials exist (P1, checking next).

Section 4 (UNIDENTIFIED, 19 rows) not touched this pass -- unchanged from V1, next identification cycle starts there.

32/33/34 discipline: use 32 for canonical work population, 33 for raw SQL count, never 34 again.
