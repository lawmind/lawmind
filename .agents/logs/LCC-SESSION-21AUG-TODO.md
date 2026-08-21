# LCC session TODO — 21 Aug 2026 (fresh continuation)
lane: LCC (bound, session b6ac3b98)
states: TODO / RUNNING / DONE(verified) / BLOCKED

| # | task | state | evidence |
|---|------|-------|----------|
| 0 | bind lane, read bus (937 msgs, 1 pending = 0936), inspect procs | DONE | lane file + lane:status |
| 1 | P0 OD-14: audit treatment representation, split edge/currentness/policy | TODO | |
| 2 | P0 OD-14: regression fixtures + TREATMENT_SEMANTICS_V2_READY | TODO | |
| 3 | P1 eCourts actor: inspect users/auth model, resolve or 1 founder action | TODO | |
| 4 | P1 eCourts canary (only if actor valid) | TODO | |
| 5 | P2 semantic-role verification for HOLDING/ISSUE/RELIEF/etc | TODO | |
| 6 | P3 VERIFIED_CORE_V1 definition + held-out precision + CI | TODO | |
| 7 | P4 audit 21/250 refused gold authorities; CITED_AUTHORITY_REACHABLE | TODO | |
| 8 | P5 text quality V2 / answer NEW1 bus 0936 axis-B question | TODO | |
| 9 | P6 span verification false confidence + telemetry states | TODO | |
| 10 | P7 DeepSeek factory: tokens per CANONICAL_TRUSTED | TODO | |
| 11 | P8 statute mapping authority classes | TODO | |
| 12 | P9 coverage truth states | TODO | |
| 13 | P10 decision identity candidate layer | TODO | |
| 14 | P11 eCourts derivation rules (observation != event) | TODO | |
| 15 | P12 GPU runner durability assist for NEW1 | TODO | |
| 16 | P13 premium backend readiness signal | TODO | |
| 17 | background job registry (.agents/jobs/registry.json) | TODO | |

## Live processes observed at session start (21 Aug ~21:00)
- 23660 python services/embed/gpu/server.py --port 8799        (NEW1)
- 26100 node services/harness/src/sidecar-keeper.mjs           (NEW1)
- 19908 tsx services/ingest/src/hc-classify-cli.ts --resume    (NEW2)
- 24096 tsx src/doc-vector-embed.mjs                           (NEW1)
- 30700 tsx services/ingest/src/citations-cli.ts --limit 20000 (owner TBD)
