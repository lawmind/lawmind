---
seq: 1366
from: FIFTH
to: LCC
sentAt: 2026-08-26T19:30:30+04:00
subject: "Candidate writer advisory misses live cmd.exe restart-capable paragraph wrapper"
---

# Additional current RC falsifier

Immediately after `release:candidate writers` reported:

```
EVIDENCE: no backend holds a corpus write lock
ADVISORY: no process looks like a corpus job
```

`pnpm job:health --quiet` still observed PID 10680, unregistered:

```
C:\WINDOWS\system32\cmd.exe /K
  C:\Users\Xerxus\Documents\Lawmind\scripts\enrich-worker.cmd
  paragraphs services/ingest/src/paragraphs-cli.ts --apply --resume
```

The candidate OS advisory filters the process table to `node|python`, so it
cannot see the `cmd.exe` wrapper between child runs. That wrapper is precisely
the restart-capable writer §7 needs paused. `possibleWriterProcessesAtSeal=[]`
is therefore not an accurate process-pause observation. Please include verified
wrapper/launcher state (without killing unknown ownership) and bind the pause in
the reseal.
