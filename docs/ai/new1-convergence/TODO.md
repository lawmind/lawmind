# NEW1 — CONVERGENCE SPRINT V2 §7 TODO LIST
Lane: NEW1 (retrieval science / embeddings / GPU / evaluation)
Session: c2792141-074b-4500-b39a-be06760ea644
Lease: ACQUIRED 2026-08-25 (took over from DEAD 22730754, pid 17932 gone)
Plan: LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md §7

Status key: [ ] pending · [~] in progress · [x] done · [!] blocked · [-] deliberately not done

---

## T0 — NEW1-0 · PROVE THE GPU FACTORY IS ACTUALLY PROGRESSING  (BEFORE ANY EXPERIMENT)
- [x] T0.1  Acquire NEW1 lease
- [ ] T0.2  Inventory NEW1 processes: keeper, GPU sidecar, embed walk, any orphans
- [ ] T0.3  Record intended walk: which scope/recipe, current batch, checkpoint
- [ ] T0.4  T0 snapshot: stage/output row count, checkpoint offset, last log line, GPU util, VRAM
- [ ] T0.5  Wait a real interval; T1 snapshot of the SAME four quantities
- [ ] T0.6  VERDICT: RUNNING_PROGRESSING | RUNNING_STALLED | STOPPED — output delta decides, never GPU util
- [ ] T0.7  If stalled: raise as an INCIDENT (bus -> LCC), do not silently restart
- [ ] T0.8  Detect duplicate process trees / restart storms / orphan GPU processes

## T1 — NEW1-1 · FREEZE FULLY REPRODUCIBLE V3.1 BENCHMARK
- [ ] T1.1  Locate current V3 benchmark harness + query set
- [ ] T1.2  Freeze: random seed, bootstrap seed
- [ ] T1.3  Freeze: query IDs + SHA-256 of query text
- [ ] T1.4  Freeze: target judgment IDs
- [ ] T1.5  Freeze: proposition/target clusters (so n is authorities, not queries)
- [ ] T1.6  Freeze: pool IDs + hard-negative IDs
- [ ] T1.7  Freeze: segmentation version + embedder model/version + court/task strata
- [ ] T1.8  Assert NO unseeded sampling anywhere in the path
- [ ] T1.9  Emit V3.1 manifest file with a checksum; replay once to prove identical output
- [ ] T1.10 Report CIs by task AND by distinct target AND by target cluster

## T2 — NEW1-2 · 100k PASSAGE VALIDATION TRANCHE  (NOT the 30M build)
- [ ] T2.1  Resource-safety check (disk, RAM, WAL, GPU) + quiet-window coordination on bus
- [ ] T2.2  Select >=100k doc tranche with the mandated strata:
            SC + multiple major HCs · recent+older · criminal/civil/commercial/
            constitutional/service/property/family(where held) · supporting-authority ·
            adverse-authority · statute · long narrative · known wrong-domain
            commercial miss · currently-unreachable-by-dense targets
- [ ] T2.3  Record the tranche selection SQL + resulting id manifest (frozen)
- [ ] T2.4  Count gold coverage HONESTLY — do not force all gold in; forced gold = artificial reachability, and must be reported as such
- [ ] T2.5  Segment to passages (practical representation), record segmentation version
- [ ] T2.6  Embed the tranche; record GPU-hours, tokens/sec
- [ ] T2.7  Build a REAL temporary ANN/HNSW index (record params)
- [ ] T2.8  Control arm: current HEAD representation on the same query set
- [ ] T2.9  Measure END-TO-END success (missing-from-index target = MISS)
- [ ] T2.10 Measure CONDITIONAL ranking (indexed targets only)
- [ ] T2.11 Metrics: s@1 s@5 r@20 r@100 r@500 MRR nDCG, target-cluster, per task family
- [ ] T2.12 Wrong-domain result rate
- [ ] T2.13 Resource envelope: p50/p95, heap bytes, index bytes, build time, RAM, temp disk, WAL, rebuild time
- [ ] T2.14 ANN vs exact recall loss (at the ef_search PRODUCTION uses, not the probe default)
- [ ] T2.15 Report supporting_authority / adverse_authority / statute / long_fact SEPARATELY and do not hide zeros behind aggregate gain

## T3 — NEW1-3 · SAFE ABSTENTION ("No sufficiently relevant authority found")
- [ ] T3.1  Split queries into DEVELOPMENT and HELD-OUT before looking at any score
- [ ] T3.2  Pre-register the threshold/calibration rule on development split only
- [ ] T3.3  Evaluate on held-out only
- [ ] T3.4  Measure: false confident answer rate
- [ ] T3.5  Measure: wrong-domain confident answer rate
- [ ] T3.6  Measure: false abstention rate
- [ ] T3.7  Measure: coverage
- [ ] T3.8  State plainly that the threshold was NOT tuned on the evaluation set

## T4 — NEW1-4 · LONG FACTS (deliberately deferred)
- [-] T4.1  NO new 500/1000/2500/5000 input-length sweep until reachability improves
- [ ] T4.2  State the reachability precondition numerically (distinct indexed targets needed)
- [ ] T4.3  Confirm to NEW3: fact-pattern / "paste your facts" stays HIDDEN and out of launch copy

## T5 — NEW1-5 · HEAD WALK SEQUENCING DECISION
- [ ] T5.1  Current HEAD walk completion %, remaining GPU days, storage
- [ ] T5.2  Retrieval gain of passage vs HEAD from T2 evidence
- [ ] T5.3  HNSW build/serve resource cost at full scale
- [ ] T5.4  ONE recommendation from {A continue HEAD, B pause/pivot, C HEAD as coarse/fallback only, D larger passage validation, E full passage build}
- [ ] T5.5  Explicitly refuse to optimise for sunk compute; say what would change the answer
- [ ] T5.6  Record that a full 30M build needs tranche + fifth-agent audit + FOUNDER approval

## T6 — NEW1-6 · PROCESS HEALTH, CONTINUOUS
- [ ] T6.1  Re-verify stage/output delta each significant interval (not GPU util)
- [ ] T6.2  Check keeper log for restart storms / "relaunch issued" loops
- [ ] T6.3  Detect duplicate process trees
- [ ] T6.4  Check VRAM + DB contention (pg_stat_activity) alongside every timing
- [ ] T6.5  Verify each restart actually produced progress
- [ ] T6.6  Send systemic startup/process failures to LCC on the bus
- [ ] T6.7  Session end: report ALL background jobs + startup mechanisms

## T7 — BUS / REPORTING
- [ ] T7.1  Answer LCC 1085 (quiet-window question) with which NEW1 jobs can pause
- [ ] T7.2  Read + close pending inbound: 1094, 1095, 1104, 1117, 1073, 1100, 1101
- [ ] T7.3  Reply to NEW3 1076 (commercial breach -> IPC 394 robbery miss)
- [ ] T7.4  Final report: Outcome · Evidence · DATA/ACCURACY/WORKFLOW impact · Corrections ·
            Process health · Reproducibility · 100k verdict · Abstention verdict ·
            HEAD-vs-passage recommendation · Not done · Risks · Bus · Files/commits · Founder decisions

---

## OUT OF SCOPE — DO NOT DO (plan §7 + kickoff)
- Do NOT edit apps/** (RCC owns CLIENT_APPS)
- Do NOT run a generic reranker sprint
- Do NOT switch embedding models without a discriminator
- Do NOT build 30M passage vectors now
- Do NOT claim 37.8% small-pool performance is full-corpus performance
- Do NOT hide zero task classes
- Do NOT treat GPU load as useful computation
- Do NOT change legal evidence/trust policy
- Do NOT perform resolver/treatment work (NEW2 owns it)
