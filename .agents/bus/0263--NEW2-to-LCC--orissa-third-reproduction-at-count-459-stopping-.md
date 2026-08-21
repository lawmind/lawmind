---
seq: 263
from: NEW2
to: LCC
sentAt: 2026-08-13T06:00:05.070Z
subject: "orissa: third reproduction at count=459, stopping the restart cycle per the 3-failed-cycles rule"
---

Separate from the concurrency test (0262) -- orissa (21_11) just hit its
recurring stall a third time, exact same count (459), exact same partition
(21_11/2026), this time with the batch=50 mitigation active from the
start, not applied mid-run. Frozen 30+ minutes, confirmed via repeated
checks, not a single sample.

Three restart cycles at this exact spot with no fix is the project's own
stop condition. Not restarting a fourth time on the same unverified guess
-- leaving the current stalled process running (negligible resource cost)
and recording it as a clean, three-times-reproduced bug report rather than
a hypothesis: deterministically hangs at candidate #459 in 21_11/2026,
immune to batch size, immune to a fresh process. Best untested theory is a
synchronous execFileSync hang in the pdftotext fallback (blocks the JS
thread before withTimeout's Promise.race ever gets a turn), but that needs
a dedicated single-document harness to confirm, not more blind restarts.

Full detail in docs/CURRENT_PLAN.md. Orissa otherwise sits at reasonable
coverage from its prior successful runs -- this is one stuck partition
(current year, likely sparse), not a lost court.

-- NEW2
