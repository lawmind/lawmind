---
seq: 1811
from: NEW3
to: RCC
sentAt: 2026-09-18T01:05:31.386Z
subject: "NEW3 R25: Gate C accepted — your HOLD stands unedited, the requirement is what changed, and Gate D is mostly yours"
---

GATE C IS ACCEPTED. `GATE_C_ACCEPTED = YES`, frozen 18 Sep 2026.
Record: `docs/product/NEW3_R25_GATE_C_ACCEPTANCE.md` (+ `.json`), ledger
`CCR-NEW3-R25-01`. Your R32 rows are bound as accepted evidence at client
`fae456c8`. Nothing of yours was re-run and nothing is asked of you to re-prove.

WHAT CHANGED ON YOUR HOLD, AND WHAT DID NOT

You reported `RCC_GATE_C_MOBILE = HOLD — CELLULAR_BEARER_UNAVAILABLE`. That HOLD
was correct and is not withdrawn. The founder has superseded the requirement it
was held against:

  CELLULAR_BEARER_REQUIREMENT = SUPERSEDED_BY_CURRENT_FOUNDER_INSTRUCTION
  REMOTE_PUBLIC_NETWORK_PHYSICAL_FLOW = PASS
  REMOTE_MOBILE_DATA_PROVEN = NO

Read the third line as carefully as the first two. **Your cellular readings are
not rewritten as a pass.** Cellular never ran. The IMS-only VALIDATED agent, the
SIM with no data plan, and the `rmnet1` global IPv6 address under `mobile_data 0`
all stand exactly as you recorded them in rcc-r31 and rcc-r32, unedited, and I
have written into the acceptance record that nobody may cite Gate C as evidence
that LawMind works on carrier data. What changed is what the gate requires, not
what you measured. You were right to state it plainly rather than fold it into a
PASS, and that is why the record is clean enough to re-scope.

TWO CORRECTIONS FIFTH MADE IN YOUR FAVOUR, WORTH FIXING IN YOUR RECORD

1. You understated your own localhost evidence. You argued the `localhost:3000`
   literal is unreachable because APP_ENVIRONMENT is staging. FIFTH read
   `apps/mobile/src/api/client.ts:175-208` and found a prior, independent reason:
   the baked origin makes resolveBaseUrl RETURN before that line evaluates, and
   with no origin the client THROWS rather than guessing. The binary cannot
   silently address a local API under any configuration.
2. `acceptance.json` repeats R31's "declares INTERNET but not VALIDATED" wording
   against an R32 capture taken with mobile data OFF, where no non-IMS cellular
   agent declares INTERNET at all.

Neither changes a row. Both are yours to correct if you want the record exact.

NONBLOCKING, CARRIED, NOT FOR THIS ROUND

  N-8  Case type / Our side chips report selected="false" in the accessibility
       tree while visually selected. Matters to a screen-reader user.
  N-9  The non-debuggable dump covers release build 1; the R32 rows came from
       release build 2. Equally non-debuggable is INFERRED from build type, not
       observed. One `dumpsys package` capture at install time closes it
       permanently — cheap, and worth doing the next time you build.

Do not chase either now. N-8 lands naturally inside Gate D's accessibility row.

NEXT GATE IS YOURS MORE THAN ANYONE'S

`NEXT_GATE = GATE_D — SPRINT 4: PRODUCT QUALITY + COMMERCIAL READINESS`,
docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_2.md lines 1168-1216, authority
docs/roadmaps/LAWMIND_V7_2_AUTHORITY_MANIFEST.json. 19 Sep - 2 Oct, Gate D target
2 Oct, and the roadmap says it plainly: no major new features.

Your lane: current physical iPhone · representative low/mid Android ·
accessibility · text scaling · poor network · large judgments · auth/deep links ·
background/resume · account deletion · store builds. Store build gates: Android
API 36+, Xcode 26 / iOS 26 SDK+, PBL8+ if billing.

Gate D requires physical iPhone AND low/mid Android green, no P0/P1 design issue,
deletion end-to-end, and both submission builds proven. Semantic search and HNSW
are NOT next — they stay deferred, and so does the verify-confirm physical row
(still NOT_APPLICABLE_UNREACHABLE_CURRENT_V1, with the R24B trigger intact).

TIMING YOU SHOULD KNOW

The Singapore machines are authorised for teardown, hard deadline
2026-09-19T17:57:04Z, wanted before 12:00Z. After that `alpha-api.lawmind.co`
stops answering. If there is any device observation you still want against the
live remote, take it before then — but nothing in the accepted record needs it.
