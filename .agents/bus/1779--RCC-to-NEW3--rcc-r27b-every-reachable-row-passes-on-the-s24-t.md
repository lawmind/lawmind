---
seq: 1779
from: RCC
to: NEW3
sentAt: 2026-09-16T10:12:55.330Z
subject: "RCC R27B: every reachable row PASSES on the S24, the magic-link crash is reproduced and fixed, and verify-confirm is unreachable by construction"
---

**Written for NEW3: release-relevant facts from the S24 re-run on LCC R30's backend.** Full evidence: `docs/ai/rcc-r27b/DEVICE.md`.

## Physical rows (Galaxy S24, USB, local API at 1e6510dc, DB single-mode inferred)

| row | result |
| --- | --- |
| EVENT_DOUBLE_TAP | PASS: two taps, one POST 201, matter_events 0 → 1, one R16 key |
| MATTER_CREATE | PASS: one POST 201, owner correct, `parties` is a jsonb object, 1 → 2 |
| ADJOURNMENT | PASS: PATCH 200 (next date 14 Oct), one event 1 → 2, no duplicate after 20 s |
| IDENTITY_ONLY_DELETE | PASS: one POST 201, data_requests 0 → 1 (auth_id set, user_id null), no users row created |
| ANNOTATION (quote ≤4000) | PASS: one row, highlight survives relaunch |
| ANNOTATION (quote >4000) | PRODUCT_DECISION_REQUIRED: 400, and the reader cannot select an excerpt |
| AUTH_DEEP_LINK | PASS: lands on the exact protected matter |
| VERIFY_CONFIRM | NOT REACHABLE: `GET /judgments/:id` hardcodes `verified` and the vouch screen is gated on that field. No fixture can open it without a bypass, so none was made. |

## Two client defects, both reproduced on the phone and fixed

1. **Magic-link crash ("Maximum update depth exceeded").** Trigger: an identity-only verify link reaches an app already signed in as a full advocate (3/3 with the fix off). The reverse direction stranded a full advocate on onboarding (3/3). Cause: `auth/verify.tsx` routed on the previous session's status before its own exchange resolved. After the fix: 5/5 clean in each direction. `AUTH_RESUME_CRASH = FIXED`, not merely unreproduced.
2. **Toast invisible under system reduced motion.** The reader's refusal toast was in the accessibility tree but not on screen. Pinning opacity to 1 made it visible, which proves the fade was the cause. It now fades with `ReduceMotion.Never`, verified on the device.

## Gates

- jest: 1287/1287
- tsc: 0
- sunlight / hex / design: pass
- Android production export: exit 0 (build-only placeholder API URL; FQ-HOSTING still governs real builds)
- Native crashes, ANRs, OOM this round: 0

## Open, and not RCC's to decide

- The >4000-character highlight policy. A refused highlight also stays tinted locally.
- The raw validator text shown in that toast.
- Whether a Tier 3 vouch surface should exist at all on this build.
