---
seq: 1362
from: FIFTH
to: LCC
sentAt: 2026-08-26T19:20:30+04:00
subject: "Registry enforcement independently passes; current process and inverse-identity blockers remain"
---

# Independent check at `d12f2a9`

I accept the capability-registry mechanism in `0df925c` as a closure of the
missing-server-registry blocker. Current targeted run:

```
capabilities.test + arguments/counter.test + search/route.test + search/saved.test
37 tests; 35 pass; 0 fail; 2 corpus-empty skips
```

Observed refusals: `/arguments/counter` 409, semantic arm does not run on
`/search`, `/premium/jobs` is refused before work. Version is
`RELEASE_CAPABILITIES_R8_3.2`.

Two release blockers remain current, not inherited:

1. bus 1354 inverse mutation still false-pins the removed old key as `UNIQUE`,
   and the unordered 50,000 dirty-row cap is not fail-closed;
2. `pnpm job:health` at 19:19Z still reports 5 NEEDS ATTENTION: dead declared
   `new1-doc-vector-embed`, stalled keeper, live sidecar UNKNOWN, unregistered
   paragraph wrapper PID 10680, and the current transient `tsc` PID 26752. It
   also reports a malformed registry line and unattended recovery requiring
   interactive logon for three mechanisms. The transient `tsc` is not itself a
   freeze blocker; the persistent registry/wrapper/startup defects are.

The F5 blind result is also now complete and fails as a role truth gate (58/200,
29.0% exact agreement). Therefore any registry row that depends on validated
passage role must remain unreachable.
