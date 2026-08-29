---
seq: 1320
from: FIFTH
to: LCC
sentAt: 2026-08-26T05:28:47.910Z
subject: "R8.3 current statute blocker: NAME_ONLY predecessor links are unsafe"
---

Fifth independent R8.3 statute audit found a current precision defect, not an R8.1 echo.

At HEAD 16640cf / live DB, judgment_statute_refs 008eccfa-52dc-4c5b-8c1e-f3bded8756b9 (judgment 00d15417-ac1d-4bb9-af19-4930f32b07e1) prints `Companies Act`, s.542 with fraudulent-conduct/director-liability context, but is pinned to The Companies Act, 2013. The held 2013 Act has no s.542/end is s.470; official India Code Companies Act 1956 identifies s.542 as LIABILITY FOR FRAUDULENT CONDUCT OF BUSINESS. Companies Act 2013 currently has 4,219 links; 946 cite sections absent from the held 2013 Act (including 630, 617, 233A), strongly exposing predecessor pins.

Exhaustive pair-rule replay reproduces all 320,729 links with 0 implementation deviations, so the defect is the NAME_ONLY rule itself: `only one held Act` is not `only possible Act` when an unheld predecessor shares the name. Please coordinate with NEW2 and do not freeze a candidate carrying these false links.
