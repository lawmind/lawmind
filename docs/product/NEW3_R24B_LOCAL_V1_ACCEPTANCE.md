# NEW3 R24B — local v1 is accepted

**Decided 16 September 2026 by NEW3 (release coordinator).** Machine-readable
record: `docs/product/NEW3_R24B_LOCAL_V1_ACCEPTANCE.json`. This round rechecked
only the four blockers named in `NEW3_R24_LOCAL_V1_ACCEPTANCE.md`. That record is
left unedited, and everything it accepted stays accepted.

## Decision

**LOCAL_V1_ACCEPTED = YES.** The only next gate is
**FOUNDER_REMOTE_SPEND_DECISION**. Gate C has not started, and paid remote
infrastructure is **not authorised** (`PAID_REMOTE_INFRA_AUTHORIZED = NO`).

| Blocker                                                     | Final state                          | Evidence                                                               |
| ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| B1: annotation excerpt for paragraphs over 4,000 characters | **PASS**                             | RCC `5df329a2` + `34a70a3d`; `docs/ai/rcc-r28/DEVICE.md`; bus 1786     |
| B2: production retrieval-caller guard                       | **PASS**                             | LCC `47ef42ae`; `docs/ai/lcc-r31/ROUND.md`; guard 13/13 re-run by NEW3 |
| B3: `cite:` plan-cache exposure                             | **NOT_REPRODUCED**                   | LCC `47ef42ae`; `docs/ai/lcc-r31/cite-plan-cache-*.json`               |
| B4: physical verify-confirm row                             | **CLOSED_NOT_APPLICABLE_CURRENT_V1** | Founder instruction, this round                                        |

## Integration

`HEAD_START = 69cf2e23`. RCC R28B then landed `34a70a3d` and its handoff
`256904c4`. `ab235aab`, `5df329a2`, `47ef42ae`, `69cf2e23`, `34a70a3d` and
`256904c4` are all ancestors of the final HEAD. NEW3 integrated nothing because
nothing was missing. `INTEGRATED_HEAD_READY = YES`.

## B1 — PASS

The test ran on a Galaxy S24 (SM-S921B, Android 16) against 2022 INSC 690 ¶2, a
5,458-character paragraph.

- The long paragraph was never posted whole. The whole run made two POSTs, of 116
  and 182 characters.
- The advocate selects the excerpt with native selection handles. Nothing is
  preselected. When the selection is over 4,000 characters, the screen shows
  "5458 / 4000" and both saves are disabled. Nothing is truncated.
- Native Cut and Paste are refused. The text reverts to the source, and no
  injected text reached the database.
- Each stored quote equals a substring of the source paragraph and occurs there
  exactly once: the bare save at [4862,4978) and the save to matter at
  [5203,5385), attached to the correct matter.
- After a relaunch the highlight is restored from the server with no duplicate.
- **The phone found a defect in R28 first.** The device still held six false
  tints: whole-paragraph saves that the server had refused before R28. R28
  stopped new ones but could not remove old ones. `34a70a3d` now drops any
  pending highlight that can never be sent when the app loads, and keeps
  legitimate offline saves. After a relaunch, only highlights the server
  actually stored remain.
- Offline and retry behaviour, and the rollback on a live refusal, are proven by
  automated tests. A live refusal was not forced on the phone, because the client
  can no longer send one. No test-only path was added to force it.

**RCC follow-ups (not blockers).** None of these shows the advocate wrong legal
information or loses data:

1. The matter picker says "No matters yet" when the app is opened cold from a
   link straight into a judgment, although the advocate already has matters.
   It then offers "Create a matter", which could lead to a duplicate. This
   predates R28.
2. Bottom sheets ignore the phone's bottom safe area. The lower button sits
   partly under the Android navigation bar but can still be tapped.
3. The excerpt field opens scrolled to the end, and its line spacing looks
   tighter after a reverted edit.

## B2 — PASS

- The only callers that serve advocates are still `search/route.ts`,
  `arguments/counter.ts` and `search/saved.ts`. Each takes an admission slot and
  releases it in `finally`.
- `release/activation.ts` is classified as **RELEASE_OPS** on import-graph
  proof: the server cannot import it, and only release tooling, scripts and
  tests do. It is not a production user request.
- The guard still fails on each of four deliberately bad test trees:
  - a new serving caller without admission;
  - an unregistered release caller;
  - a release caller that the server imports;
  - a caller that never releases its slot in `finally`.

## B3 — NOT_REPRODUCED

Setup: 5 citation classes, each executed 24 times on one database connection.

- Postgres chose 0 generic plans and 120 custom plans per statement, with 0
  timeouts.
- A forced generic plan uses the same three indexes and returns identical
  results.
- No production change was made. The timeout, the global plan-cache setting and
  the exact/ambiguous/zero semantics are unchanged, and no semantic fallback was
  added.
- **API suite:** 1319 of 1323 tests pass. The full suite is **not green**: it has
  one load-sensitive timing failure, `sparse-bound.test.ts` (7,575 ms against a
  5,000 ms bound under contention). Run alone, it passed both times, and no
  functional failure traces to R31. Classified
  `FULL_API_SUITE_LOAD_TIMING = KNOWN_ENVIRONMENT_SENSITIVE_NONBLOCKING`; the test
  was not changed and its threshold was not raised. (Correction: an earlier draft
  of this record called the suite "accepted as green". That label is withdrawn.)

## B4 — CLOSED_NOT_APPLICABLE_CURRENT_V1

A physical acceptance test is required only for a state that a released
current-v1 feature can reach. No enabled current-v1 path creates an unconfirmed
citation.

| Row                               | State                                 |
| --------------------------------- | ------------------------------------- |
| VERIFY_CONFIRM_BACKEND_REAL_ROUTE | PASS (LCC R30 six-route matrix)       |
| VERIFY_CONFIRM_CLIENT_TESTS       | PASS (existing RCC tests)             |
| VERIFY_CONFIRM_PHYSICAL           | NOT_APPLICABLE_UNREACHABLE_CURRENT_V1 |

**Trigger for the deferred test (binding).** The physical verify-confirm test
becomes a mandatory acceptance row before any feature that can introduce or
display an unconfirmed citation is enabled for users. Future examples include
document upload, citations extracted during drafting, and authorities supplied
by the user. This round enables none of them and designs none of them.

Nothing was built to make the test reachable: no fabricated judgment, no bypass,
no test-only path. `FQ-NEW3-R24-VERIFY-ROW` is closed.

## Final state

| Area                                                                 | State   |
| -------------------------------------------------------------------- | ------- |
| Backend, client, Android physical, embedding                         | YES     |
| Legal-truth gates, strict DB split, in-app account deletion          | YES     |
| Required surface, design, capability gating, functional completeness | YES     |
| **LOCAL_V1_ACCEPTED**                                                | **YES** |

### Deferred items (none may become a local-v1 blocker again)

| Item                             | State                                                  |
| -------------------------------- | ------------------------------------------------------ |
| HNSW index                       | DEFERRED_HIGH_MEMORY_OFFLOAD (does not block local v1) |
| Public semantic search           | DISABLED                                               |
| Citation bulk apply              | HOLD (does not block Gate C)                           |
| Statute-linked public view       | DISABLED                                               |
| External delete-account web page | STORE_SUBMISSION_BLOCKER                               |
| Apple production build proof     | STORE/RELEASE_BLOCKER                                  |
| Staging Gate-S1                  | GATE_C_REMOTE_WORK                                     |
| S24 over mobile data             | GATE_C_REMOTE_WORK                                     |

## Remote spend

`READY_FOR_REMOTE_SPEND_DECISION = YES`. `NEXT_GATE =
FOUNDER_REMOTE_SPEND_DECISION`. `PAID_REMOTE_INFRA_AUTHORIZED = NO`.

Readiness is not authorisation. Nothing paid is created until the founder
explicitly approves the spend.

### Unlocked by that approval (recorded, not executed): GATE_C_REMOTE_ALPHA

- a remote API;
- separate remote CORPUS and USER databases;
- HTTPS;
- remote backup and restore;
- corpus release rollback A→B→A;
- staging Gate-S1;
- the Galaxy S24 tested over mobile data, not adb reverse;
- evidence of remote readiness and logging.

The external delete-account website and the Apple production build remain their
own store/release workstreams. The FIFTH lane runs at formal Gate C, not now.
