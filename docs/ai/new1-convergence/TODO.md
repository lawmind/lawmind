# NEW1 — CONVERGENCE SPRINT V2 §7 · WORK BOARD

**Lane:** NEW1 (retrieval science / embeddings / GPU / evaluation)
**Session:** `c2792141-074b-4500-b39a-be06760ea644`
**Lease:** ACQUIRED 2026-08-25T03:15Z — took over from DEAD owner `22730754` (pid 17932 gone)
**Plan:** `LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md` §7

**Status key:** `[x]` done (observed) · `[~]` in progress · `[ ]` pending · `[!]` blocked · `[-]` deliberately not done

---

## PROGRESS

```
T0  process health / prove GPU factory   ████████████████████  8/8    DONE
T1  V3.1 reproducible freeze             ████████████████████ 10/10   DONE
T2  100k passage tranche                 █████░░░░░░░░░░░░░░░  4/15   design+embedder done · SELECTION BLOCKED (3 cycles, stopped)
T3  safe abstention                      ████████░░░░░░░░░░░░  3/8    pre-registered, eval blocked
T4  long facts (deferred by plan)        ████████████████████  3/3   DONE
T5  HEAD-vs-passage recommendation       ████████████████░░░░  5/6   inputs done, T5.4 owed after tranche
T6  continuous process health            ████████████████████  7/7    11 findings, 5 fixed
T7  bus / reporting                      ███████████████░░░░░  3/4
                                         ─────────────────────
                                         42 / 61
```

---

## T0 — NEW1-0 · PROVE THE GPU FACTORY IS PROGRESSING ✅ COMPLETE

- [x] **T0.1** Acquire NEW1 lease — prior owner DEAD, takeover clean
- [x] **T0.2** Inventory NEW1 processes — keeper pid 9696 (task `Lawmind-new1-sidecar-keeper`), sidecar 20452, walk chain 25968→25792→23096
- [x] **T0.3** Record intended walk — HEAD:4800, worklist 205/864, batch `tier-a-batch-00226`
- [x] **T0.4** T0 snapshot — 03:19:49Z · **1,996,134** rows · GPU 93% · 7362 MiB
- [x] **T0.5** T1 snapshot — 03:25:20Z · **1,997,735** rows · **+1,601 in 330.6s**
- [x] **T0.6** **VERDICT: RUNNING_PROGRESSING** — DB delta (+1,601) equals log `inserted` delta (+1,601) *exactly*
- [x] **T0.7** Incidents raised to LCC — bus **1127**, correction **1131**
- [x] **T0.8** Duplicate/orphan detection — **found 2 sidecars on port 8799**; root cause fixed in `067d5c8`

**Built:** `services/harness/src/new1-progress-probe.mjs` — the T0/T1 instrument. Reports output rows, checkpoint, heartbeat age, GPU as *context only*, and what else was on the box.

---

## T1 — NEW1-1 · FREEZE REPRODUCIBLE V3.1 · 9/10

- [x] **T1.1** Locate harness — `representation-lab-v3-cli.ts` (946 lines)
- [x] **T1.2** Freeze random seed + bootstrap seed
- [x] **T1.3** Freeze query IDs + SHA-256 of query text — **295** queries
- [x] **T1.4** Freeze target IDs — **213** distinct
- [x] **T1.5** Freeze proposition/target clusters — **211** (union-find, transitively closed)
- [x] **T1.6** Freeze pool IDs — **25,000** (213 gold + 24,787 distractors)
- [x] **T1.7** Freeze segmentation version · bge-m3 file digests · court/task strata
- [x] **T1.8** Audit for unseeded sampling — **2 sites found:** `v3-cli:359` `Math.random()`, `v3-cli:623` `TABLESAMPLE` with no `REPEATABLE`
- [x] **T1.9** Emit manifest + checksum + prove replay — **two freezes byte-identical** across tasks, clusters, strata, seeds, config, embedder, all 25,000 pool ids
- [x] **T1.10** Report CIs by task / distinct target / target cluster — **DONE without DB or GPU**: V3 stored per-task ranks, so its published result was re-analysed from files (`V31_REANALYSIS.md`, `bd905eb`)

**T1.10 results:**
- V3's point estimates and intervals **reproduce exactly** under a seeded bootstrap; arm ordering unchanged
- **My own concern REFUTED**: cluster resampling widens intervals only **0.96×–1.26×** on the real data, not the **2.11×** seen on synthetic maximally-correlated data. V3's intervals were *not* materially too tight
- **New number V3 never reported** — POSED, pool 19,932: passages score **24.4% END-TO-END** vs **39.3% CONDITIONAL**; production arm A scores **2.2%** vs 3.6%. **17 of 45 posed targets are not in the index at all**
- **37.8% is a CONDITIONAL figure** and I had propagated it unqualified (bus 1088/1089/1150) — corrected to LCC (1163) and NEW3 (1162)
- The **LIFTED benchmark cannot see the reachability problem** (52.4% vs 53.3%) because its gold is drawn from already-indexed documents

**Built:** `v31-freeze-cli.ts` · `v31-pool-drift-probe.mjs` · `V31_MANIFEST.json` (1.3 MB) · `V31_REPRODUCIBILITY.md`
**Key result:** a seed is **not** the fix — the fill table is written by the live walk, so `TABLESAMPLE REPEATABLE` fixes *which pages* are read, not *what is on them*. Identity is frozen to the artifact instead.
**Self-caught:** `builtAt` was inside the hash, so `manifestSha256` could never answer "same benchmark?". Split into `contentSha256` (compare this) + `manifestSha256` (file integrity).

---

## T2 — NEW1-2 · 100k PASSAGE VALIDATION TRANCHE · 1/15 · 🚫 BLOCKED

> **Blocked on a quiet window, not on knowledge.** The box cannot produce a
> trustworthy number right now — see T6.4. Starting the build would burn ~18 GPU-hours
> to produce latency figures nobody should trust.

- [x] **T2.1** Resource-safety check + quiet-window coordination — *requested from LCC (bus 1127/1131); DB quiet as of 04:06Z but the orphaned loops WILL respawn*
- [!] **T2.2** Select ≥100k tranche — **BLOCKED after 3 failed attempts, stopped at the bound.** 88s/cell → TypeError → 40min timeout. `EXPLAIN` cost 1,845,467 for ONE cell: scan driven by the least-selective dimension (`judgment_date`, 96.5% post-2010) while `judgments_court_idx` sits unused, feeding a 1.88M-row Sort for `row_number()` that cannot stream. Diagnosis + tie-breaker in `TRANCHE_100K_DESIGN.md` §8 (SC + major HCs · recent+older · criminal/civil/commercial/constitutional/service/property/family · supporting- and adverse-authority · statute · long narrative · known wrong-domain commercial miss · currently-unreachable targets)
- [!] **T2.3** Freeze tranche id manifest — blocked by T2.2 — *`tranche-select-cli.mjs`; writes `TRANCHE_100K_MANIFEST.json` with `contentSha256`*
- [x] **T2.4** Count gold coverage **honestly** — *natural-vs-forced rule implemented and enforced in the selector* — forced gold = artificial reachability, must be reported as such
- [ ] **T2.5** Segment to passages, record segmentation version
- [ ] **T2.6** Embed tranche; record GPU-hours + tokens/sec
- [ ] **T2.7** Build real temporary ANN/HNSW index, record params
- [ ] **T2.8** Control arm: current HEAD representation, same queries
- [ ] **T2.9** **END-TO-END** success — missing-from-index target = **MISS**
- [ ] **T2.10** **CONDITIONAL** ranking — indexed targets only
- [ ] **T2.11** s@1 · s@5 · r@20 · r@100 · r@500 · MRR · nDCG · target-cluster · per task family
- [ ] **T2.12** Wrong-domain result rate
- [ ] **T2.13** p50/p95 · heap bytes · index bytes · build time · RAM · temp disk · WAL · rebuild time
- [ ] **T2.14** ANN vs exact recall — at production `ef_search=200`, **not** the probe default of 40
- [x] **T2.15** Confirm the zero classes get reported separately, never hidden behind aggregate gain — *`adverse_authority` and `statute` are **0 for every arm** in V3; this is carried forward as a standing reporting rule*

---

## T3 — NEW1-3 · SAFE ABSTENTION · 2/8

- [x] **T3.1** Split DEVELOPMENT / HELD-OUT **before** any score exists — **by CLUSTER, never by task**
- [x] **T3.1a** *(added)* Stratify the split — **first version was broken and measured as such**
- [x] **T3.2** Pre-register the threshold/calibration rule — `ABSTENTION_PREREGISTRATION.md` (`95823a5`), written before any score exists
- [ ] **T3.3** Evaluate on held-out only
- [ ] **T3.4** False confident answer rate
- [ ] **T3.5** Wrong-domain confident answer rate
- [ ] **T3.6** False abstention rate
- [ ] **T3.7** Coverage
- [ ] **T3.8** State plainly that the threshold was not tuned on the evaluation set

**Built:** `v31-split-cli.mjs` · `V31_ABSTENTION_SPLIT.json`

| | tasks | clusters | targets | POSED | LIFTED |
| --- | ---: | ---: | ---: | ---: | ---: |
| DEVELOPMENT | 153 | 108 | 109 | 29 | 124 |
| HELD_OUT | 142 | 103 | 104 | 16 | 126 |

**Leak check: CLEAN** — no target appears on both sides.

**Correction made mid-task:** the first (unstratified) cluster split gave DEVELOPMENT only **7** POSED tasks with `long_narrative`/`pasted_passage`/`statute` at **zero** — 250 LIFTED singleton clusters drowned the 45 POSED ones. Re-done with per-stratum seeded prefixes.

**⚠ Honest limit discovered:** `statute` (3 dev / 0 held) and `pasted_passage` (3 dev / 0 held) have too few *independent clusters* to split at all. **Held-out abstention will cover 6 of 8 POSED classes.** Those two are development-only and no held-out claim may be made about them.

---

## T4 — NEW1-4 · LONG FACTS (deferred by the plan) · 2/3

- [-] **T4.1** No new 500/1000/2500/5000 input-length sweep — *deliberately not done, per plan*
- [x] **T4.2** State the reachability precondition — **12 of 213 gold (5.6%) have no production vector**; for the 20 POSED targets in V3 it was **8 of 20 = 40%**
- [x] **T4.3** Re-confirmed to NEW3 (bus 1150) and corrected the 37.8% figure (bus 1162)

---

## T5 — NEW1-5 · HEAD-vs-PASSAGE RECOMMENDATION · 1/6

- [x] **T5.1** Current HEAD walk completion — **worklist 205/864 (23.7%)**, ~2.00M staged rows
- [x] **T5.2** Retrieval gain — **2.2% vs 24.4% END-TO-END**; recall@500 **35.6% vs 91.1%**
- [x] **T5.3** Cost — HEAD **7.9 GPU-days** left · full passage build **16.1 GPU-days** (29.3M vectors) · **tranche 4.5 GPU-hours**
- [ ] **T5.4** ONE recommendation — **owed after the tranche**; provisional position recorded (pause HEAD, spend 4.5 GPU-hours, let it decide)
- [x] **T5.5** Sunk compute excluded; three named falsifiers in `HEAD_VS_PASSAGE_SEQUENCING.md` §6
- [x] **T5.6** Recorded — full build needs tranche + fifth-agent audit + **founder** approval, in that order

---

## T6 — NEW1-6 · CONTINUOUS PROCESS HEALTH · 6/7 (ongoing)

- [x] **T6.1** Re-verify output delta each interval — 5 samples taken this session
- [x] **T6.2** Keeper log audit — found **RESTART #3 wedged 535s** in a hung PowerShell
- [x] **T6.3** Duplicate process trees — 2 sidecars found and resolved
- [x] **T6.4** VRAM + DB contention sampled with **every** timing
- [x] **T6.5** Verify restarts actually produced progress — **they did not**; keeper is 0-for-1 against real stalls
- [x] **T6.6** Systemic failures sent to LCC — bus **1127**, **1131**
- [x] **T6.7** Session-end report of all background jobs + startup mechanisms — *see inventory below*

### Findings this session

| # | finding | status |
| --- | --- | --- |
| 1 | Keeper kill predicate `embed..gpu..server\.py` matched **0 of 2** sidecars, logged success anyway | **FIXED** `067d5c8` |
| 2 | Keeper has **never** successfully replaced a *stalled* sidecar — 0-for-1; the one "working" restart had nothing to kill | **FIXED** (sweep now counts survivors) |
| 3 | `killExistingSidecars` `spawnSync` had **no timeout** → keeper wedged **535s** in RESTART #3 | **FIXED** (60s timeout) + keeper restarted onto fixed code (pid 28060) |
| 4 | Orphaned `cmd /K` loop running `citations-cli --concurrency 12` — no scheduled task, no registry record, **dead parent** | **REPORTED** to LCC |
| 5 | Walk throughput **8,412 → 494 tok/s (17×)** with GPU at **0–2%** — IO-starved behind #4, not GPU-bound | **REPORTED**; blocks T2 |
| 6 | Two batch attempts lost to `fetch failed` (00224, 00226) inside the stall windows | observed |
| 7 | **My own sweep fix reported success on a TIMEOUT** — 70s run vs 60s `spawnSync` limit → empty stdout → `NaN > 0` false → success branch | **FIXED** `ea3f570` |
| 8 | **The sidecar let a SECOND process bind a LIVE port.** `allow_reuse_address=True`; on Windows `SO_REUSEADDR` permits binding an *actively listening* port. Controlled test: old settings → second bind **SUCCEEDS**; `SO_EXCLUSIVEADDRUSE` → **refused (WinError 10048)**. Root cause of every duplicate-sidecar incident | **FIXED** `ea3f570` |
| 9 | **Keeper restarted sidecars that were merely STARTING** — fixed 45s warm-up vs a measured **49.8s** model load; spawn 05:10:06 → RESTART 05:11:11. Replaced with a bounded wait-for-health (180s ceiling) | **FIXED** `ee673d2` |
| 10 | Observed **3 concurrent sidecars** on port 8799; 21080 held the listener while 20452 served connections created 09:03. Cleaned to one; VRAM 7,130 → 876 MiB | resolved |
| 11 | My warm-up ceiling log **asserted a cause it cannot see** ("genuine failure, not a slow model load") and was wrong the first time it fired — the sidecar answered at 200s under GPU contention | **FIXED** `6fe319f` |

### Session-end process inventory (T6.7)

| what | state |
| --- | --- |
| `Lawmind-new1-sidecar-keeper` (scheduled task) | **Running** — the only NEW1 startup mechanism |
| keeper `sidecar-keeper.mjs` pid 18368 | running the fixed code |
| GPU sidecar pid 21704 | **sole** sidecar, owns port 8799, `HEALTH 200`, 4,078 MiB resident |
| HEAD embedding walk | **deliberately PAUSED** via `.agents/logs/new1-walk.pause` for LCC-4 (bus 1153/1156) |
| `LawMindPostgres` (scheduled task) | Disabled, not NEW1's |
| `cmd /K enrich-worker.cmd citations` pid 7308 | **NOT NEW1's** — orphaned loop, dead parent, no task, no registry record |
| `cmd /K enrich-worker.cmd paragraphs` pid 8776 | **NOT NEW1's** — same shape |

Walk state at pause: worklist **208/864**, `new1_doc_vector_stage` **2,026,872** rows.
Batch `00229` aborted after 3 attempts at 05:10:30Z — collateral from my own sidecar
cleanup, recoverable, resumes by re-running the coverage census.

### Corrections I made to my own claims — including two to my own FIXES

- **Withdrew** the "orphan sidecar was starving VRAM" claim — measured release was **122 MiB**, not starvation. The orphan died at bind and never loaded the model. Real cost was the false-success restart, which is worse.
- **Refused** to claim pool drift from the drift probe — table was static (+0 rows), so the run proves *determinism only*. Zero drift against zero new rows is evidence of nothing.
- **My first keeper fix was itself defective** and I found it by reading the log it produced: it logged `(no output)` and took the success path. Fixed; success now requires a positively parsed `survived=0`, and timeout / signal / non-zero exit / stderr / unparseable are five distinct, loud failures.
- **A test of mine gave a false negative** — a bash heredoc ate one backslash, so my repro tested `[\/]` (forward slash only) instead of the real `[\/]`, and reported `matched=0` against two live sidecars. The *real* command, extracted from source rather than retyped, matched correctly.
- **My orphan-detector disowned my own statement** — I matched ownership against a `left(query,70)` preview, and the view name sat past the cut, so a 149s statement of mine read as somebody else's. Cancelled properly with `pg_cancel_backend`.
- **I ran an unbounded full-table `GROUP BY`** on 15.9M rows while criticising another lane for exactly that, watched it degrade my own walk for ten minutes, and killed it. Re-did it as a bounded `TABLESAMPLE`.

---

## T7 — BUS / REPORTING · 1/4

- [x] **T7.1b** Granted LCC's LCC-4 quiet window (1156) · answered NEW2 0083 (1157) · corrected 37.8% to NEW3 (1162) and LCC (1163)
- [x] **T7.1** Answer LCC **1085** (quiet window) — walk **can** pause, resumes losslessly via `.agents/logs/new1-walk.pause`; nothing else of mine runs
- [ ] **T7.2** Read + close pending inbound: 1094, 1095, 1104, 1117, 1073, 1100, 1101
- [x] **T7.3** Reply to RCC **1133/1135** (bus 1139) — collision confirmed + contention caveat on their recall numbers; NEW3 1076 already answered in 1093
- [ ] **T7.3b** Reply to NEW3 **1076** (commercial breach → IPC 394 robbery miss)
- [ ] **T7.4** Final report — Outcome · Evidence · DATA/ACCURACY/WORKFLOW · Corrections · Process health · Reproducibility · 100k verdict · Abstention verdict · HEAD-vs-passage · Not done · Risks · Bus · Files/commits · Founder decisions

---

## COMMITS THIS SESSION

| sha | what |
| --- | --- |
| `067d5c8` | keeper's sidecar sweep matched zero processes and logged success anyway |
| `79a2efa` | V3.1 freezes benchmark IDENTITY, because a seed cannot fix a table that grows |

---

## OUT OF SCOPE — DO NOT DO (plan §7 + kickoff)

- Do **not** edit `apps/**` (RCC owns CLIENT_APPS)
- Do **not** run a generic reranker sprint
- Do **not** switch embedding models without a discriminator
- Do **not** build 30M passage vectors now
- Do **not** claim 37.8% small-pool performance is full-corpus performance
- Do **not** hide zero task classes
- Do **not** treat GPU load as useful computation
- Do **not** change legal evidence/trust policy
- Do **not** perform resolver/treatment work (NEW2 owns it)
