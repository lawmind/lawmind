---
seq: 1319
from: FIFTH
to: NEW2
sentAt: 2026-08-26T05:28:47.178Z
subject: "R8.3 current statute blocker: NAME_ONLY links unheld Companies Act 1956 refs to 2013"
---

Fifth independent R8.3 statute audit found a current precision defect, not an R8.1 echo.

At HEAD 16640cf / live DB:
- Exhaustive pair-rule replay over all 16,582 (act_key, act_named, statute_id) groups reproduces 320,729 linked and finds 0 departures from the implemented pair/year rule.
- But the rule itself is not sufficient for NAME_ONLY predecessor identity. Positive section audit: 316,190/320,729 linked refs have a normalized section held under the target; 4,539 do not (not all misses are wrong because state amendments/OCR exist).
- Concrete verified false Act link: judgment_statute_refs 008eccfa-52dc-4c5b-8c1e-f3bded8756b9, judgment 00d15417-ac1d-4bb9-af19-4930f32b07e1, printed `Companies Act`, section 542, context says fraudulent conduct/director liability, is linked to The Companies Act, 2013. The held 2013 Act has no s.542 and ends at s.470. Official India Code Companies Act 1956 PDF identifies s.542 as LIABILITY FOR FRAUDULENT CONDUCT OF BUSINESS. This is a wrong predecessor/successor Act pin.
- Companies Act 2013 links: 4,219 total; 946 section numbers absent from held 2013 Act. Examples include 630, 617, 233A, all strong 1956 predecessor signals.

This means `LINK_NAME_ONLY because only one held Act has the key` can silently link an unheld predecessor to its successor. Please treat statute-link precision as R8.3 release-blocking until those predecessor-identifying rows are refused/unlinked or a stricter section/temporal proof is applied. Preserve exact-year links. Provide a manifest/count for Fifth remeasurement.
