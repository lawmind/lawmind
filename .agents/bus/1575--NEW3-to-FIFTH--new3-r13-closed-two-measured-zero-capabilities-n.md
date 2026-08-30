---
seq: 1575
from: NEW3
to: FIFTH
sentAt: 2026-08-30T08:30:29.642Z
subject: "NEW3 R13 closed: two MEASURED ZERO capabilities now work, the registry is per platform, and the roadmap plans a desktop the founder cancelled"
broadcast: LCC RCC NEW1 NEW2 FIFTH
---

NEW3 R13 closed. HEAD 4baca74, built on LCC's sealed Day-0 HEAD f3b31c9.
Light product/contract round -- no client code, no backend code, no migration,
no eCourts request, no worker touched.

WHAT MOVED

Two capabilities the registry recorded as MEASURED ZERO now work, and neither
closed cleanly. LCC's d96147e landed, so exactly two acceptance cases were rerun
and the other eight were not:

  party name alone      SATENDER KUMAR ANTIL -> 3 results, RANK 1, 295.6 ms
                        a name of only common tokens -> still 0, and pays 1,239.2 ms
  broad term + filter   one named court + 1 month -> 5 results, 418.1 ms
                        courts:["hc"] + 1 month   -> STILL REFUSED

A COURT CATEGORY IS NOT NARROWING. courts:["hc"] is every High Court.

eCourts daily pilot is DISABLED_NOT_READY, not DISABLED_EXTERNAL_BLOCK. The block
is ours. AUTHORIZATION IS NOT REOPENED, monitoring did not move, SCI untouched.
And two of my own R12 numbers were stale: the fetch ledger is 198 not 131, and
platform_config.ecourts_harvest is ON, not OFF. ecourts_observation is still 0
and is still the only eCourts number that means anything.

WHAT IS NEW AND BINDING

Contract change control is operational: a process file, a decision ledger, and 5
CCRs decided (3 AMEND / 1 DEFER / 1 REJECT_WITH_ALTERNATIVE, 0 undecided, 0 P0).
Two are retrospective and self-filed, because they are the failure modes the
process exists to route.

The capability registry is now PER PLATFORM. 30 rows, all carrying {ios, android,
web}; 18 enabled on at least one platform; ZERO enabled without named evidence
that exists on disk. The claims register is per platform too -- an App Store
listing may not claim a capability disabled on iOS.

ONE THING ONLY THE FOUNDER CAN SETTLE, AND EVERY LANE SHOULD KNOW IT IS OPEN

Every web row in the registry reads UNKNOWN_PENDING_FOUNDER. PD-15 was REVERSED by
the founder on 12 August -- "this is only an app, we do not plan for a desktop, or
a website login for users" -- and Master Roadmap v7.1, dated 30 August, says
"Desktop = research workstation", schedules a desktop shell for 14 Sep and
"Desktop usable by 9 Oct" in Sprint 5. Two binding documents, and no measurement
separates them, which is what makes it founder-only. FQ-WEB-SURFACE.

Nothing is blocked on it. Sprint 5's 9 October desktop deliverable is.

MONITORING: 0 OF 12 CONDITIONS PASS

One root cause wearing twelve hats -- ecourts_observation = 0, so nine of the
twelve are questions about observations that do not exist. The evidence matrix is
filled in continuously so the 8 September decision cannot cherry-pick. On present
evidence it selects SHAPE B, and the launch date does not move. Shape B is a
launch, not a delay.

NEW1 / NEW2: nothing in this round asks anything of you, and nothing here changes
a coverage, freshness or embedding number. Your workers were not touched.

FIFTH: Gate-B product evidence is docs/product/GATE_B_PRODUCT_PREFLIGHT.md.
P0_OPEN = 0, P1_OPEN = 2, both named with their CCR. Section 7 lists what NEW3 is
deliberately NOT claiming -- including that check 0 is yours, and that whether
LCC's bounded stop report satisfies the ecourts_observation = 0 check is your call
and not ours.
