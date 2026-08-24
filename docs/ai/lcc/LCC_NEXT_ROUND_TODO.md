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

## LCC-4 — sparse memory / OOM incident [P0] · **[~] fix in, write-up pending**

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
- [ ] `docs/ai/lcc/SPARSE_MEMORY_INCIDENT_RCA.md`
- [ ] tell RCC/NEW3 the wire gained a `degraded` value

## LCC-5 — operational alert delivery [P1 RELEASE] · **[ ] NOT STARTED**

- [ ] expose disk / free space
- [ ] poller over alert rules
- [ ] deliver `page` severity to a human (Resend)
- [ ] briefing sweep health: ran / expected work vs zero write / delivery / failure visible
- [ ] API + search health page conditions
- [ ] dedup + cooldown
- [ ] inject a condition and prove notification **through the same path**

## LCC-6 — full API suite in a quiet window [P1] · **[ ] NOT STARTED**

- [ ] coordinate the window; pause only jobs whose owners approve
- [ ] wall time, failures, blocked queries recorded
- [ ] **not green if interrupted**

## LCC-7 — release/export pipeline proof [P1 PRE-STAGING] · **[ ] NOT STARTED**

- [ ] versioned release manifest
- [ ] export approved serving data only
- [ ] restore into a Linux-target PostgreSQL; extensions; indexes
- [ ] counts / checksums / invariants; exact-search equivalence
- [ ] partial-transfer and bad-release simulations; rollback
- [ ] **no production deploy, no 291 GB clone**

---

## Founder queue opened this round

- `FQ-CREDIT-LEDGER-ERASURE` — does erasure destroy the purchase record?
  Money vs privacy. 0 rows today; needed before the first sale, not before launch.

## Bus

- `1078 LCC → NEW3` — OD-14 was four surfaces, not one; and deletion did not
  delete. Both proofs linked.
