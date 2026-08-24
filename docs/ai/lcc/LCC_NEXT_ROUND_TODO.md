# LCC — NEXT ROUND TODO / PROGRESS

**Lane:** LCC (server · correctness · security · release) · **Round:** 2026-08-23
**Lease:** held, session `fa117007…`, `node scripts/lane-lease.mjs status LCC`

Live progress. Updated as each item lands, so the state survives compaction and
a fresh agent. `[x]` means OBSERVED — a test run, a probe output, a real HTTP
response — never "the code exists".

---

## LCC-0 — exclusive lane lease · **[x] DONE**

- [x] `scripts/lane-lease.mjs` — one file per lane, never a shared registry
- [x] a second LCC `acquire` **refuses** and names the live owner (exit 1, observed)
- [x] health = process identity (pid **and** creation date, because pids recycle)
      + heartbeat age
- [x] DEAD owner → takeover allowed; HUNG owner (live pid, cold heartbeat) →
      refused without `--force <reason>`; failed probe → refuses (not evidence of death)
- [x] all four states exercised against synthetic leases, then cleaned up
- [x] `pnpm lane:lease`

## LCC-1 — briefing OD-14 generation contradiction [P0] · **[x] DONE** — `7b862c4`

- [x] reproduced: fixture FAILS under deliberately restored pre-OD-14 semantics
- [x] `briefings/assemble.ts` — checklist derives from `precedentialEffect`, not
      the stored column
- [x] **second defect found**: the checklist was served *verbatim from the blob*
      while authorities beside it were live → an authority set aside overnight
      got its banner and **no checklist item at all**. Render path now rewrites
      the treatment items from live state
- [x] shared `judgments/treatment-lookup.ts` + `briefings/treatment-checklist.ts`
- [x] **three more surfaces** running the same stale rule, all fixed:
      `judgments/annotations.ts` (annotating into a matter IS add-to-matter),
      `documents/route.ts` (draft citation), `arguments/counter.ts` (filtered on
      the *banner*, so it dropped adverse authorities the opponent can reach for)
- [x] real-path proof: one `GET /briefings/:id` — effect `overruled`,
      `canAddToMatter: true`, banner still `set_aside`, checklist no longer says
      "find a replacement"
- [x] assemble 8/8 · briefings route 9/9 · 54/54 across the affected suites
- [x] `docs/ai/lcc/BRIEFING_OD14_GENERATION_PROOF.md`

## LCC-2 — account deletion [P0 RELEASE BLOCKER] · **[x] DONE** — `892190c`

- [x] reproduced: **3 assertions failed** against the old function, each after
      proving its own precondition
- [x] three independent mechanisms — `refresh_tokens` keys on `auth_user.id` not
      `users.id`; `auth_user` untouched **and** it is the check `rotateRefreshToken`
      performs; the `auth_session` delete resolved `auth_id` *after* the same
      transaction rewrote it (matched 0 rows, reported 0)
- [x] identity captured first; better-auth rows destroyed before redaction;
      `auth_verification` included (keys on email, cascades from nothing)
- [x] 7 user-linked tables the function never named — 5 deleted, 1 detached,
      `credit_ledger` escalated (money vs privacy — founder's call)
- [x] `llm_calls.user_id` nulled — verified no prompt content, 0/40,121 linked
- [x] `data_requests.artefact_storage_key` now returned for R2 deletion
- [x] 12/12 live assertions · 48/48 auth + admin + data-requests
- [x] `docs/ai/lcc/ACCOUNT_ERASURE_TERMINATION_PROOF.md`

## LCC-3 — case-number search contradiction [P0] · **[x] DONE** — commit pending

- [x] measured on the **real** `POST /search`, n=60, four spellings each
- [x] both prior positions were partly right: `caseno:"<stored form>"` found
      96.7%; **typed bare it returned zero in 3 ms, 95% of the time**
- [x] mechanism: `full_text_tsv` is built from `full_text` alone, so the case
      number is not searchable text and nothing routed to the column
- [x] `case_number` is a **registry serial**, not an identifier — serial 1 of
      2019 exists in 24 courts and 172 case types
- [x] CNR **is** an identifier — 100% found, 96.7% rank 1, p50 2 ms
- [x] bare CNR and bare/typed case numbers now route deterministically
- [x] `caseno:`/`cnr:` joined `cite:` as identity fields → **31.7% now report
      `ambiguous`** instead of resolving silently. Never a false pin
- [x] after: bare 1.7% → **96.7%**, typed 10.3% → **98.3%**, zero-results 95% → **0%**
- [x] 10/10 parser units (8 of them **refusals**) · 57/57 search suites
- [x] `docs/ai/lcc/CASE_NUMBER_SEARCH_CONTRACT_V1.md`
- [ ] queued, not attempted: a btree on `(court, normalised case_number)` would
      turn ~800 ms into an index lookup. `DEFER DB_SCAN` stood all round

## LCC-4 — sparse memory / OOM incident [P0] · **[x] DONE** — `63128b4`

- [x] did **not** patch the refuted mechanism
- [x] **second** mechanism refuted, this time my own: `Sort Method: top-N
      heapsort  Memory: 31kB` — the sort is bounded and 3 orders of magnitude
      too small
- [x] root cause classified — **planner misestimate by construction**: the
      tsquery is built from a bind parameter *inside* the query, so `EXPLAIN`
      returns the identical `rows=84744` for every query against measured upper
      bounds of 295,681 / 3,670,878 / **16,965,472**
- [x] bound implemented: refuse to rank when the rarest ANDed lexeme exceeds
      5% document frequency — the data is already read by the same function
- [x] observed: all-common 8 ms → `sparse_unbounded`; `court` 2 ms →
      `sparse_unbounded`; ordinary query unaffected (4.5 s, 48 results)
- [x] the all-common fallback is **not** deleted (NEW1 bus 1025: deleting it is
      the worst arm)
- [x] regression test 3/3
- [x] `docs/ai/lcc/SPARSE_MEMORY_INCIDENT_RCA.md`
- [ ] tell RCC/NEW3 the wire gained a `degraded` value — in the closing bus message

## LCC-5 — operational alert delivery [P1 RELEASE] · **[x] DONE** — `344d0b4` `a9714a7`

- [x] `diskFreeFraction` — read with `statfs`, not a spawned process
- [x] poller over the SAME rules the endpoint renders (`collectMetrics` lifted out)
- [x] Resend delivery behind a `Notifier`; console transport NAMES itself as
      having sent nothing; production refuses to start without both env vars
- [x] briefing sweep health — four separate questions, and the denominator that
      makes "zero briefings" mean something
- [x] dedup + 120-minute cooldown, keyed on the rule not the message
- [x] **injected a condition and proved the notification through the same path** —
      and it caught a REAL one on the first run (`longestStatementSeconds` 1245s)
- [x] second run delivered 0 and suppressed both — cooldown observed
- [x] the test found a gap the design missed: a ledger we cannot read must not
      silence the page, because the database being down is when it matters most
- [x] 8/8 poller · 31/31 admin · migration journalled and tracked
- [x] `docs/ai/lcc/OPS_ALERTING_PROOF.md`
- [ ] founder: `OPS_ALERT_EMAIL` — the one value that is not mine to choose

## LCC-6 — full API suite in a quiet window [P1] · **[x] DONE — run twice**

- [x] quiet window requested from NEW1/NEW2/NEW3 on the bus, with the contention
      I could see; nothing of another lane's paused without approval
- [x] contention recorded at start: cpu 11.5%, ram free 39.4%, gpu 98%,
      postgres 6 active, **longest statement 1541s**, fleet 6
- [x] **1,026 s wall · 642 tests · 632 pass · 8 fail · 2 skipped**
- [x] **NOT called green** — it ran under load, and the plan says a suite that
      did has measured something other than what LCC-6 asks for
- [x] 5 of the 8 were a broken test double, pre-existing, now fixed (7/7)
- [x] the other 3 classified as corpus-state assertions, not code:
      Allahabad coverage (the gap appears to have CLOSED), an unclassified new
      court, and leaked `test://` fixtures — the last is itself a full scan,
      which is why that guard costs 51 s
- [x] **NEW1 paused their GPU walk for the window** (their bus 1092), so the
      suite was re-run properly:

          under load   1,026 s   642 tests   632 pass   8 fail
          QUIET          578 s   644 tests   639 pass   3 fail

      44% faster; gpu 11% (was 98%), longest statement 23 s (was 1,541 s)
- [x] the 5 test-double failures are gone on their own merits, not because the
      box was quiet
- [x] the 3 remaining are the corpus-state ones, confirmed in both runs, and
      **none is mine to edit** — two are assertions about a corpus NEW1 and NEW2
      are actively writing
- [x] **NEW1's pause released** the moment the run finished

## LCC-7 — release/export pipeline proof [P1 PRE-STAGING] · **[x] REHEARSED** — `975c449`

- [x] Linux-like target: **WSL2 Ubuntu 26.04, PostgreSQL 18.6 + pgvector**, on
      the founder's own box. No cloud, no provisioning, no spend
- [x] **all 81 migrations applied clean to an empty Linux database**, pgvector
      and pg_trgm verified from `pg_extension` — the schema path works
- [x] **FINDING, already: the source collation is `English_United States.1252`
      and no Linux PostgreSQL can offer it.** The target is `C.UTF-8`. Text
      ordering is not identical, which reaches `ORDER BY case_title`, every
      btree index on text, and therefore keyset pagination. This is why a
      cross-platform physical copy is refused and indexes must be REBUILT
- [x] versioned manifest with per-table row counts + checksums, source
      collation, extensions and schema version
- [x] approved serving data ENUMERATED, never derived — and what was refused is
      named, including `judgment_chunks` / staged vectors (NEW1's decision)
- [x] export bounded to 500 judgments (**no 291 GB clone**)
- [x] **RESTORE VERIFIED** — all 7 tables, row counts and checksums, on Linux
- [x] `ANALYZE` after load, 375 ms
- [x] **four cross-platform defects found, every one of which would have shipped**:
      the collation cannot exist on Linux · generated columns break COPY ·
      the live column ORDER has drifted from the migrations (a positional COPY
      would write `cnr` into `native_text` silently) · and the verification
      itself was platform-dependent three ways (TimeZone, LC_CTYPE quoting,
      sort collation)
- [ ] **NOT DONE**: partial-transfer simulation did not execute (stopped after
      three attempts), no rollback drill, no search-equivalence battery, no
      index-build timing
- [x] `docs/ai/lcc/RELEASE_PIPELINE_PROVEN_V1.md`

## Unplanned, accepted from the bus

- [x] **NEW3 bus 1075 — the briefing showed "No authorities are saved to this
      matter" for an authority that WAS saved.** Not OD-14-shaped: the block read
      `judgment_annotations` and never `matter_authorities`, so the ordinary
      save path was invisible. There are two writers and a briefing must read
      both. Fixed + 2 regression tests
- [x] **NEW1 bus 1079 — `text_safety_grade='PROOF'` was unreachable.** Fixed in
      `0081`. Measured on NEW1's exact sample: PROOF **0 → 939**, SCREEN
      3,614 → 2,675 — it fell by exactly the 939 that moved. My first attempt
      rewrote the view from `0070`'s text and PostgreSQL refused with 42P16,
      which saved **ten columns**: `0070` defines 8, the deployed view has 18

---

## Round 2 — accepted from the bus after §6 closed

- [x] **NEW2 1097 — CLOSED. The resolver's false uniques were made by a STALE
      INDEX, not by its rules.** `judgment_citation_keys` was 309,130 judgments
      behind (the cursor last moved 17 Aug), so a group of two the key table
      held once returned UNIQUE — 33,013 collapsed groups, **99.5% Allahabad**.
      Ran 18:42Z–19:04Z to the live frontier:

          shortfall  309,414 → **163**   (the residual is rows inserted while it walked)
          cursor     17 Aug 16:46Z → 24 Aug 18:59Z
          scanned    16,551,619 → 27,689,197

      Stopped deliberately at a page boundary once it was following new inserts
      one row at a time, and **the shared STOP file deleted immediately** — it
      is read by every ingest CLI in that directory and would have silently
      paused the next job any lane launched. NEW2 owns the acceptance
      measurement (collapses → ~12) and it is theirs to publish
- [x] **NEW2 1098 — 131 of 137 LAW MOVED edges are a reporter's headnote.**
      I have **NOT** flipped the gate and will not: removing 92 adverse-treatment
      warnings is the direction the harness fears most, and it is
      `FQ-TREATMENT-HEADNOTE-PROVENANCE`. Built the **column** instead (`0082`),
      because it is needed under both answers. No badge moved, nothing reads it
- [x] **NEW1 1106 — the view hash I published was wrong.** I gave an MD5 prefix
      of the non-pretty `pg_get_viewdef`; the contract is
      `sha256(pg_get_viewdef(…, true))` = **`5b5d02384b46c96c`**. Anything
      reconciling against my number would refuse forever. Corrected in `0082`'s
      neighbour and on the bus
- [x] **The statement I cancelled was NEW2's, not NEW1's.** I apologised to the
      wrong lane; corrected (bus 1108)
- [x] **NEW3 1077 — the activation funnel recorded nothing.** `recordStep` had
      **zero call sites**, which corrects my own claim in bus 1051 that it was
      "recorded server-side". All seven steps wired through the real routes,
      fire-and-forget so an advocate never waits on a metric and never fails
      because of one. `experienced_matter_value` fires on the **SECOND**
      authority saved to a matter — NEW3's hypothesis, labelled as one.
      **5/5 through real HTTP**, and the test's own cleanup was hardened after
      it leaked twelve fixtures of its own: it now deletes by TAG rather than by
      tracked ids, so a failed run cleans up after itself
- [ ] **16 leaked test fixtures still in the production corpus** — mine, from
      three crashed suite runs on 23 Aug, six carrying a non-`none`
      `overruled_status` (they inflated NEW2's LAW MOVED denominator 104 vs 98).
      `scripts/lcc-purge-leaked-test-fixtures.mjs` is written and its dry run is
      verified; **the destructive run was blocked by the permission classifier
      and needs a human**

## Round 3 — the regression my own fix caused, and the cleanup

- [x] **NEW2 1112 — my citation-keys rebuild made 79 registry date stamps
      resolve to exactly ONE judgment.** A false pin, which
      `CITATION_HARNESS.md` forbids outright. `2011:NOVEMBER:12` sat in
      `neutral_citation` on 441 Madras judgments; before the rebuild they had no
      key row and answered `TARGET_NOT_HELD`, and the rebuild indexed
      `neutral_citation` wholesale and made them resolver inputs. Fixed in BOTH
      places NEW2 named — the resolver gate and the key builder — and the 441
      rows deleted (0 remain, `judgments` untouched, 1,370,088 still keyed).
      **The gate had to test the NORMALISED key**: I put it in
      `PLACEHOLDER_PATTERNS` first, which runs before normalisation, so it would
      have been inert with a green test beside it
- [x] **NEW2's own correction is the more useful number**: 33,013 → **99**, not
      the ~12 they predicted, and the residual is a **flow** rather than a
      leftover — new ingest keeps creating members the index has not reached, so
      the catch-up needs to be recurring. **Not scheduled**: a recurring corpus
      job on a shared box should be visible to every lane before it exists
- [x] **NEW1 1115 — 19 leaked processes of mine, killed.** 11 orphaned
      `tail -f` follows (4.7–6.9 h), 2 bash watch wrappers, 6 wedged
      `release-export-cli` processes. Each re-verified by command line at the
      moment of the kill, and the server side checked separately: **zero
      orphaned COPY statements, zero idle-in-transaction**
- [x] **`citations-backlog-walk` adjudicated**, which NEW1's disowning line asked
      LCC to do. Alive **19.5 hours**, zero rows in 90 s and again over 4 more
      minutes, and **holding no database connection at all**. Launched with no
      log redirect, so liveness was the only available signal — the exact failure
      the registry README warns about. Its supervisor
      (`scripts/enrich-worker.cmd`, founder-approved) relaunches it, so killing
      children changes nothing; **not disabled**, flagged for its owner
- [x] **NEW1 1106 — the view hash I published was an MD5 prefix of the wrong
      viewdef.** The contract is `sha256(pg_get_viewdef(…, true))` =
      `5b5d02384b46c96c`. Corrected in `0081`'s comment and on the bus

## Founder queue opened this round

- `FQ-CREDIT-LEDGER-ERASURE` — does erasure destroy the purchase record?
  Money vs privacy. 0 rows today; needed before the first sale, not before launch.
- `FQ-OPS-ALERT-EMAIL` — which address should an operational page wake? One
  value, and the alerting path is live. `RESEND_API_KEY` is already present.

## Bus

- `1078 LCC → NEW3` — OD-14 was four surfaces, not one; and deletion did not
  delete. Both proofs linked.
- `1084-1086 LCC → NEW1/NEW2/NEW3` — quiet-window request for LCC-6, with the
  contention I could see and an explicit "I will not call it green if it runs
  under load".
