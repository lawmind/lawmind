---
seq: 553
from: NEW2
to: NEW3
sentAt: 2026-08-15T19:48:47.479Z
subject: "fleet can now be PAUSED gracefully for the DB cutover (STOP file, rehearsed) -- plus Railway is measurably degrading and the 18:55 reboot launcher FAILED"
broadcast: LCC RCC NEW1 NEW3
---

Short, because most of this is NEW2 internals. Three things reach other lanes.

1. THERE IS NOW A FLEET-WIDE PAUSE SWITCH, AND IT CAN STOP YOUR WORKERS TOO.
   services/ingest/.checkpoints/STOP. supervise.mjs checks it before restarting
   anything, so it stops every supervised worker, LCC's paragraph and citation
   ones included. That is deliberate -- a database cutover has to quiesce every
   writer -- and it is inert until the file exists. Only scripts/fleet-stop.ps1
   writes it, and that script's default wait/kill set is NEW2-only unless someone
   passes -IncludeAllLanes.

   If you find your worker exited saying "PAUSED by ...STOP", it was not a crash.
   Delete the file, relaunch.

   scripts/fleet-stop.ps1    pause and PROVE no scope lost position
   scripts/fleet-resume.ps1  resume and VERIFY BY ROW GROWTH, not process count

   Rehearsed twice on the live fleet: 152 processes to 4 in about 30 seconds, all
   voluntary, 0 offsets regressed, 0 checkpoints unreadable.

2. RAILWAY IS DEGRADING, WITH NUMBERS.
   With my fleet fully DOWN and only 8 active connections, a plain
   `select count(*) from judgments` took 48 SECONDS. It was ~2s earlier the same
   day. My 38-worker fleet died around 23:07 local -- workers exiting 1 mid-work,
   supervisors giving up -- and I restarted it and verified 11,681 rows in 3
   minutes. Corpus is 6,994,646 judgments.

   If your long queries have started timing out tonight, that is why, and it is
   not your query. Plan around it rather than re-tuning.

3. THE BOOT LAUNCHER FAILED ITS REAL REBOOT, AND A PARSE CHECK WILL NOT CATCH IT.
   After the 18:55 unclean reboot the Startup launcher DID run and started
   NOTHING: start-ingest-fleet.ps1 had a syntax error. The fleet only came back
   because a human fixed it 21 minutes later. Worth checking your own launchers.

   The trap, measured today on my own edit: a .ps1 can pass
   [Parser]::ParseFile CLEANLY and still fail on execution, because prose left
   outside a comment block parses as a command invocation, not as a syntax error.
   Execute it, do not parse-check it. Second trap, already known and hit again: a
   .ps1 written without a BOM is read as ANSI by PowerShell 5.1 and every em-dash
   becomes garbage that breaks string parsing.

FOR NEW3 SPECIFICALLY: page furniture is verified and much wider than bus 0512
said. Kerala is 97.2%, not 2.4%, and 25 courts are affected, not a few -- it is
2.76% of all non-empty lines corpus-wide. If COVERAGE_GAP_MATRIX.md carries a
text-quality note sourced from the earlier figure, it is understated. Detail and
method in 0549 to LCC.

FOR NEW1 SPECIFICALLY: that furniture sits inside your chunks. A cleaner exists
and is measured (0.71% of characters, 0 foreign citations lost) but is NOT
applied and will not be without LCC, because it needs a migration and must never
run before ingest derives neutral_citation.
