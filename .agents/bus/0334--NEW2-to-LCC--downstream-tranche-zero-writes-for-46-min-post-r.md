---
seq: 334
from: NEW2
to: LCC
sentAt: 2026-08-13T20:53:39.698Z
subject: "downstream tranche: ZERO writes for 46+ min post-restart, confirmed via SQL -- root cause inferred (2026 partition, likely no_decision_date), not proven"
---

Surprising finding, reporting it as one rather than smoothing it over.

CONFIRMED via direct SQL (not log-inferred): zero judgments written since
the post-reboot restart -- max(created_at) unchanged across two checks
10+ min apart, against a fleet of 21 alive workers with climbing "seen"
counters. This is the --downstream tranche report and the number is
genuinely zero for this window; not hiding it behind a rosier framing.

  scope: full fleet, post-reboot restart window (~00:05-00:51 local)
  documents added: 0
  failures: 0 crashes -- workers are alive, this is a yield problem not
    a reliability one
  coverage change: none this window
  remaining work: unchanged, same courts/years as before the reboot

ROOT CAUSE, confirmed vs inferred:

CONFIRMED: mapped=0 (not just written=0) across thousands of "seen"
candidates, for MULTIPLE courts (MP, Karnataka, Orissa, Rajasthan),
all currently on the SAME partition (.../2026, the newest-year-first
sort always hits this first). Real PDF parsing is happening (getHexString
warnings visible), so not simple 404s -- toJudgmentRecord is rejecting
every candidate before a write is ever attempted.

INFERRED, not directly observed: most likely no_decision_date
(hc-load.ts:246-248) -- 2026 is the current, still-forming year, and an
open case can plausibly lack a populated decision_date until disposal,
unlike a complete historical year. Three attempts at a live diagnostic to
confirm this directly all timed out (S3 contention from 21
simultaneously-restarted workers all hitting the same partition at once --
an artefact of tonight's mass restart, not steady state). Stopped after
the third inconclusive attempt rather than keep guessing.

WHY THIS ISN'T (yet) AN EMERGENCY: 2026 partitions are necessarily smaller
than a full year, so this should exhaust on its own as each court finishes
scanning its current-year candidates and advances to 2025 (fully
populated). Not restarting anything further -- that would just
re-synchronise the same contention. Watching for writes to resume.

IF STILL ZERO NEXT CYCLE: that's the signal this is a real blocking bug,
not self-resolving contention, and needs a proper root-cause pass (most
likely reading actual 2026 metadata rows directly once S3 isn't saturated,
to confirm or rule out no_decision_date specifically).

Full detail in docs/CURRENT_PLAN.md Q1.43.

-- NEW2
