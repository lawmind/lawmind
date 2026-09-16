# NEW3 R24 — local-v1 acceptance decision

**Owner:** NEW3 / release coordinator
**Date:** 16 September 2026
**Head:** `95986b04` (equal to `origin/main` at the start of the round)
**Machine ledger:** `NEW3_R24_LOCAL_V1_ACCEPTANCE.json`

## Decision

**`LOCAL_V1_ACCEPTED = NO`.** Four bounded items remain (B1–B4). None of them needs research,
new capability or remote infrastructure. When all four close with evidence, NEW3 R24B re-checks
only those four rows.

`READY_FOR_REMOTE_SPEND_DECISION = NO`. `PAID_REMOTE_INFRA_AUTHORIZED = NO`; only the founder can
change it.

## 1. Integration seal

| commit                  | lane                               | state    |
| ----------------------- | ---------------------------------- | -------- |
| `fe96f498`              | NEW1 R15                           | ANCESTOR |
| `10cde3b2` / `9974e336` | LCC R30 (origin)                   | ANCESTOR |
| `a65f1451` / `1e6510dc` | LCC R30 (local copies, same patch) | ANCESTOR |
| `fc2a54ca`              | RCC R27B                           | ANCESTOR |
| `95986b04`              | RCC R27B merge                     | HEAD     |

NEW3 integrated nothing because nothing was missing. `INTEGRATED_HEAD_READY = YES`.

## 2. NEW1: accepted, closed

The R15 receipt (`docs/ai/new1-r15/NEW1_TERMINAL_RECEIPT.json`) reports:

- 7,675,588 eligible content identities and 7,675,588 embedded;
- queued 0 and unnamed residual 0;
- vector integrity PASS and the incremental queue HEALTHY;
- 0 `judgment_id` duplicates (enforced by the primary key).

The 15 content hashes with 15 surplus document rows are **accepted** as duplicate-content
representation. They are not missing embeddings.

Result:

- `EMBEDDING_PROGRAM_LOCAL_COMPLETE = YES`
- `HNSW = DEFERRED_HIGH_MEMORY_OFFLOAD`
- `HNSW_BLOCKS_LOCAL_V1 = NO`
- `PUBLIC_SEMANTIC_SEARCH = DISABLED`

NEW1 is not reopened.

## 3. R16: accepted

LCC R30 ran the six real routes in both the single-DB and the strict-split topology, and all six
passed in both. On every route:

- a same-key replay added 0 rows;
- a body mismatch returned 409 and wrote nothing;
- an injected 5xx left no row and no ledger row, and a retry with the same key then ran.

The legacy wiring reproduces the 500 on all six routes, so the fix is falsified in both directions.
On the S24, all four user-facing rows that R16 had broken pass.

- `R16_RUNTIME_COMPLETE = YES`
- `R16_PHYSICAL_COMPLETE = YES`

## 4. Physical Android matrix (SM-S921B, RCC R27B)

| row                    | verdict                                        |
| ---------------------- | ---------------------------------------------- |
| EVENT_DOUBLE_TAP       | PASS                                           |
| MATTER_CREATE          | PASS                                           |
| ADJOURNMENT            | PASS                                           |
| ANNOTATION_VALID_QUOTE | PASS                                           |
| VERIFY_CONFIRM         | **NOT REACHABLE BY CONSTRUCTION** (not a pass) |
| IDENTITY_ONLY_DELETE   | PASS                                           |
| AUTH_DEEP_LINK         | PASS                                           |

`CORE_ANDROID_PHYSICAL = NOT_PASS`: 6 of the 7 core rows pass. The device run used a single DB, so
it is not counted as strict-split evidence.

## 5. Annotation quotes: semantics frozen (CCR-NEW3-R24-02)

**`ANNOTATION_QUOTE_SEMANTICS = EXACT_USER_SELECTED_EXCERPT`.**

- The quote is required, and the server maximum stays at **4,000** characters.
- A paragraph of 4,000 characters or fewer may be sent whole.
- For a longer paragraph, the client must require the advocate to select an exact excerpt of
  4,000 characters or fewer, and must send that excerpt verbatim.
- Legal text is never silently trimmed, by the client or the server.
- The client never shows a highlight that the server did not store.
- `paragraph_number` / `paragraph_index` remain the anchor.

Two options were rejected: raising the server limit, and truncating the text.

The device showed the current client falls short in two ways: it cannot select an excerpt, and a
refused highlight stays tinted locally.

- `LONG_PARAGRAPH_CLIENT_SUPPORT = NO`
- `RCC_PATCH_REQUIRED = YES` (B1)

## 6. Verify-confirm

The vouch screen opens only from a judgment payload whose state is `unconfirmed`. A corpus
judgment always resolves to itself, so its state is always `verified` (`judgments/route.ts:421`).
No enabled v1 surface produces an unconfirmed citation:

- search serves corpus rows;
- uploads are `DISABLED_EXTERNAL_BLOCK`;
- drafting has no capability.

The server write passed LCC's real-route matrix. **NEW3 does not accept an unreachable row as a
pass.** NEW3 also does not authorise a change that makes a corpus read report itself as
unconfirmed. `VERIFY_CONFIRM_LOCAL = NOT_PASS`; see B4.

## 7. Auth resume

`AUTH_RESUME = FIXED`.

- **Before the fix:** 3/3 crashes (an identity-only link arriving in an app signed in as a full
  advocate), and 3/3 strands in the reverse direction.
- **After the fix (`fc2a54ca`):** 5/5 clean in each direction.
- **Not exercised:** other status flips on a protected route.

## 8. Reader, 2022 INSC 690

`READER_2022_INSC_690 = FIXED`.

- **Server:** 5 of 5 reads failed with 503 before the fix. After it, 5 of 5 succeeded in 214 ms or
  less.
- **Device:** 5 of 5 succeeded in 52–56 ms.

The timeout value did not change.

The `cite:` search path uses the same prepared-statement pattern and has **not been measured** (B3).

## 9. R17 read side: ratified (CCR-NEW3-R24-01)

| case                                                     | status | code                        | `details.availability` |
| -------------------------------------------------------- | ------ | --------------------------- | ---------------------- |
| READ, well-formed UUID absent from the active generation | 404    | `CORPUS_TARGET_UNAVAILABLE` | `corpus_unavailable`   |
| WRITE against an unavailable corpus target               | 409    | `CORPUS_TARGET_UNAVAILABLE` | `corpus_unavailable`   |

Neither response claims that the judgment never existed, was deleted, is invalid law, is
unverified, or was overruled. The implementation conforms (`corpus/target-unavailable.ts`, 6/6 at
HEAD). This closes CCR-LCC-R28-01. The wire protocol stays at 1.

## 10–12. Serving guard, `/ready`, premium preview

- **`FOUNDER_DB_SERVING_GUARD = PASS`.** Staging and production refuse to start with an empty
  `LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS`, and development is unaffected. The serving-contract
  tests are green at HEAD.
- **`READY_CONTRACT_STATUS = PASS`.** `GET /ready` is BUILT in the `API_CONTRACTS.md` status table,
  and `check-contract-status.mjs` exits 0. Nothing was whitelisted.
- **`PREMIUM_PREVIEW_STATE = POST_V1_PROVISIONAL_SILENT`.** A 404 renders no card
  (`MatterScreen.tsx:255`), so there is no visible broken state and it does not block local v1.
  The request still fires on every owner matter load.

## 13. Local-v1 components

| component                            | state                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| BACKEND_LOCAL_COMPLETE               | **NO**: `production-callers.test.ts` is red at HEAD (B2) and `cite:` is unmeasured (B3) |
| CLIENT_LOCAL_COMPLETE                | **NO**: B1                                                                              |
| ANDROID_PHYSICAL_COMPLETE            | **NO**: long-paragraph physical row (B1) and VERIFY_CONFIRM (B4)                        |
| EMBEDDING_LOCAL_COMPLETE             | YES                                                                                     |
| LEGAL_TRUTH_GATES_COMPLETE           | YES                                                                                     |
| STRICT_SPLIT_LOCAL_COMPLETE          | YES                                                                                     |
| ACCOUNT_DELETION_IN_APP_COMPLETE     | YES                                                                                     |
| CURRENT_V1_REQUIRED_SURFACE_COMPLETE | NO (excerpt selection)                                                                  |
| CURRENT_V1_DESIGN_COMPLETE           | NO (excerpt selection has no UI yet)                                                    |
| CURRENT_CAPABILITY_GATING_COMPLETE   | YES                                                                                     |
| CURRENT_V1_FUNCTIONALLY_COMPLETE     | NO                                                                                      |

## Blockers

- **B1 (RCC).**
  - For a paragraph over 4,000 characters, the reader requires an exact excerpt of 4,000
    characters or fewer, sends it verbatim, and cannot send more.
  - A refused highlight must not stay tinted.
  - Replace the raw validator toast with product copy: "This highlight could not be saved."
  - Prove it with one physical S24 run on ¶2 of 2022 INSC 690 (5,458 characters). The run must
    show:
    - one row;
    - a stored quote equal to the selected text;
    - the highlight still present after relaunch.
- **B2 (LCC).** `release/activation.ts:330` calls `hybridSearch` but is not in
  `PRODUCTION_CALLERS`. It has been red since `5d84e870`. Decide whether it belongs in the list,
  record the reason, and make the API suite green.
- **B3 (LCC).** Run 5 controlled quiet `cite:` reads after at least 6 executions of the prepared
  statement. Report either FIXED + 5/5 or NOT_REPRODUCED under 5/5.
- **B4 (decision, then LCC and RCC).** Choose one:
  - **(a)** The founder removes VERIFY_CONFIRM from the local-v1 physical rows until a surface
    that produces unconfirmed citations is enabled.
  - **(b)** LCC serves a stored unconfirmed `citation_checks` state through `GET /citations/:id`.
    RCC opens the vouch screen from that check handle. One disposable local fixture proves the
    row.

  NEW3 recommends **(a)**: under (b), a surface would exist only for the test.

## Remote phase (not entered)

- **Not done:**
  - `EXTERNAL_DELETE_WEB = MISSING` (`lawmind.co/delete-account` returns 404; the site root returns
    200);
  - `APPLE_PRODUCTION_BUILD_PROOF`;
  - `STAGING_GATE_S1`;
  - `REMOTE_MOBILE_DATA_GATE_C`.
- **`NEXT_GATE = NEW3_R24B_LOCAL_V1_RECHECK`.** `GATE_C_REMOTE_ALPHA` stays frozen as defined in
  the R24 brief and is entered only after `LOCAL_V1_ACCEPTED = YES`.

**Deferred, not reopened:**

- `CITATION_BULK_APPLY = HOLD`
- `STATUTE_LINKED_PUBLIC = DISABLED`
- `PUBLIC_SEMANTIC_SEARCH = DISABLED`
- `HNSW = OFFLOAD_REQUIRED`

NEW2 incremental work continues independently.
