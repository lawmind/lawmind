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

## FINAL STATE — 21 Aug 2026, end of session

| # | task | state | evidence |
|---|------|-------|----------|
| 0 | bind lane, read bus, inspect procs, adopt vs duplicate | DONE | lane file; registry.jsonl; no job adopted, none orphaned |
| 1 | P0 OD-14 representation split | DONE | precedential-effect.ts; 73 refusals removed; fixture 98 rows |
| 2 | P0 OD-14 regression fixtures + TREATMENT_SEMANTICS_V2_READY | DONE | 12 tests pass; bus 0966-0969 |
| 3 | P1 eCourts actor | DONE (reduced to 1 command) | no role column; 55/55 uniform; 54 test-shaped in audit_log; --actor-email |
| 4 | P1 eCourts canary | BLOCKED on 3 | 52/52 ledger rows refused/kill_switch_off |
| 5 | P2 semantic-role verification | DONE | semantic-role.ts; 20 tests; 1,344 rows promoted |
| 6 | P3 VERIFIED_CORE_V1 | DONE | 125 documents; funnel + precision published; bus 0962-0965 |
| 7 | P4 refused gold audit + CITED_AUTHORITY_REACHABLE | DONE | 12/16 length-only; 7,935 docs; migrations 0068/0069 |
| 8 | P5 text safety / answer NEW1 0936 | DONE | 0067; 62,215 staged verdicts; corpus pass running; bus 0960/0961 |
| 9 | P6 span false confidence + telemetry states | DONE | 6 outcomes; SOURCE_TEXT_DAMAGED before locating; GLYPH_NOISE_MATCH |
| 10 | P7 DeepSeek factory tokens/CANONICAL_TRUSTED | NOT DONE | no model calls made this session; verifier is deterministic |
| 11 | P8 statute mapping authority | PARTIAL | classes correct + tested; coverage comment corrected 4/24/101 -> 14/88/117; parser at its limit |
| 12 | P9 coverage truth states | NOT DONE | untouched this session |
| 13 | P10 decision identity | DONE | decision-identity.ts; 15 tests; CNR-is-a-case correction |
| 14 | P11 eCourts derivation rules | DONE | ecourts-derivation.ts; 11 tests; zero live observations |
| 15 | P12 durable GPU runner assist | DONE | no elevation needed; parent chain proved; handed to NEW1 |
| 16 | P13 premium backend readiness | NOT SIGNALLED | VERIFIED_CORE is 125 docs and eCourts has no observations |
| 17 | background job registry | DONE | appended 3 lines to .agents/jobs/registry.jsonl |


## SECOND PASS — after reading the bus (21 Aug, late)

| # | task | state | evidence |
|---|------|-------|----------|
| 18 | migration journal: 0067/0068/0069 were unjournalled | DONE | check-migration-journal now OK, 70 migrations |
| 19 | NEW2 0955 date quality absorbed into decision identity | DONE | SAME_CASE_ADJACENT_DATE, 17 tests |
| 20 | P7 tokens per verified object | DONE | 4,403 tok/accept; TOKENS_PER_VERIFIED_OBJECT.md |
| 21 | P7 found a category error: `relief` is a prayer | DONE | v2, 3 rows demoted and re-adjudicated, 23 tests |
| 22 | VERIFIED_CORE_V1 restated from live rows | DONE | 128 documents; two "verified cores" share no rows |
| 23 | P9 coverage: shortfallReason was not on the wire | DONE | all 11 DENOMINATOR_SUSPECT cells served a bare percentage |
| 24 | P13 premium readiness | NOT SIGNALLED, deliberately | core is 128 docs and eCourts has zero observations |

### Still not done, and why
- **P8 beyond the classes.** The BPR&D parser reaches BNS 6.4% / BNSS 42.4% /
  BSA 70.6% and the loader has already loaded everything it can ground (229 of
  which 226 are stored). Pushing BNS higher is a fixed-width-table parse against
  wrapped cells whose section number sits on the line BELOW its row — a real
  project with legal-safety risk, not an afternoon.
- **P13.** Signalling premium-ready on a 128-document core and an eCourts stream
  with zero observations would be a claim the evidence does not support.
