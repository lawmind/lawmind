# LCC EXECUTION PLAN — server lane

Working document. Updated as facts change, not as intentions change.

Its job is to stop two failure modes that have both already happened today:
**drifting into whatever is most recently on fire**, and **reasoning from logs
instead of reproducing the failing path**.

---

## 0 · Rules I follow without being asked

**Keep going.** A blocker is a thing to route around, not a thing to report and
stop at. Report *while* continuing, never *instead of* continuing.

**Reproduce before theorising.** Today's model-loading bug cost four wrong
diagnoses — external-data fetching, a per-request timeout, the resolved cache
path, tsx — because each was reasoned from a log line. The one that worked was
running the API's exact import path on the container. **If a fix is a guess, say
so and test it in the same breath.**

**Verify by observation, never by inference.** A green typecheck is not a working
endpoint. A SHA in `/health` is not a deployed build — it is an env var I set by
hand, and it lied to me today. Probe the actual behaviour: does the route return
200, does the field appear, did the row land.

**Three failed attempts at the same thing → stop and state the hypothesis.** Not a
fourth guess.

**Never invent.** No API shape, column, section number or citation from memory.
`SCHEMA_TRUTH.md` for data, `API_CONTRACTS.md` for the seam, `DOMAIN_TRUTH.md` for
law. If it is not in a primary source it does not exist.

### The only things I stop for

Everything else has a way forward. I stop **only** when proceeding would:

- put an unverified citation in front of a user, or show one as confirmed
- silently drop a citation
- send sensitive-class data to a model unpseudonymised, or mix two documents in
  one call
- destroy data that is not reproducible
- take an irreversible or outward-facing action nobody asked for — a spend, a
  public exposure, a force-push

Those are the product, not a workflow preference.

---

## 1 · Where things actually stand

Facts, each observed rather than assumed.

| | |
|---|---|
| Corpus | 38,341 judgments, 1,059 statute sections, 3 statutes |
| Embedding | fp32, **complete** — 616,197 chunks, every judgment covered |
| Precision | q8 rejected: batch 0.976, platform 0.977. fp32 GPU-vs-Railway min 0.999709 |
| Vector index | HNSW, `m=16 ef_construction=64`, built CONCURRENTLY — see §2B |
| `judgment_citations` | **192,197 citations** across all 38,341 judgments; 44,785 resolve to a corpus row |
| Treatment edges | 10,437 followed · 1,233 distinguished · 69 overruled · 19 overruled_in_part · 7 doubted |
| `overruled_status` | **22 moved** — 19 `set_aside`, 3 `doubted`. LAW MOVED renders |
| Database | 5,979 MB of a 50 GB volume (`judgment_chunks` 4,438 MB) |
| Postgres | 18.4, pgvector 0.8.5, container 24 GB / 24 cores |
| Gate S1 | **PASS** — median 539 ms, p95 641 ms end to end on production, against 3 s |
| Tests | 75 server-side |
| Deployed | `9a42bed` — verified by probing routes, not by the `/health` SHA |
| TCP proxy | **closed** 6 Aug 2026. Recreate with `railway tcp-proxy create` when a run needs it, and delete it again after |

---

## 2 · The ordered work

Each item states its own done-criterion. **Done means observed.**

### A · Finish the corpus embed — **DONE 6 Aug 2026**
33,578 / 33,578 judgments, **616,197 chunks**, exit 0, `needing_chunks` = 0.
6.8 h wall clock at 0.05 s/chunk on the local GPU.

### B · Build the vector index — **HNSW, reversing this item**

This said "rebuild ivfflat". It was written before two things were measured, and
both of them change the answer.

**The exact scan is 2.9 s median, 3.1 s p95 for the dense stage alone** — 40
queries, k=50, over all 616,197 chunks. Gate S1 budgets 3 s for the *whole
request*. The number quoted earlier in the day (2.2 s end to end) was taken
before the corpus finished embedding; it is not a number this corpus can still
produce. There is no version of this that ships without an index.

**The container is 24 GB and 24 cores** (`/sys/fs/cgroup/memory.max`, `cpu.max`),
6.8 GB in use. IVFFlat was chosen when the build budget was unknown — it is the
cheaper index to *build*, not the better one to *serve*. And the corpus grows by
append, which is precisely where IVFFlat decays: its centroids are fixed at build
time and recall falls as new rows drift away from them. HNSW does not have that
failure mode.

`CREATE INDEX CONCURRENTLY`, not plain — a plain build takes ACCESS EXCLUSIVE and
every `/search` blocks for its duration, with the client lane working against this
same database.

**Done when:** `indisvalid` is true and `EXPLAIN` shows an `Index Scan using
judgment_chunks_embedding_hnsw` with no `Seq Scan`.

### C · Tune `hnsw.ef_search` by measurement — **DONE, and the default was wrong twice**

Index built CONCURRENTLY in **9.8 min**, `indisvalid = true`, **4,811 MB**.
Measured against exact sequential-scan ground truth, 40 advocate queries, k=50:

| `ef_search` | recall@50 | short candidate lists |
|---|---|---|
| 40 *(pgvector default)* | **76.5%** | **40 of 40** |
| 64 | 92.7% | 0 |
| 100 | 95.1% | 0 |
| **200 — set** | **96.9%** | 0 |
| 400 | 98.7% | 0 |

**Two independent failures at the default, and only one of them is visible.**
Recall of 76.5% means a quarter of the authorities an exact search would find are
missing, and a missing authority is indistinguishable from one that does not
exist. The second is worse: **pgvector returns fewer rows than LIMIT when
`ef_search` is below it, and does not error.** `annDepth` is 200, so anything
under 200 halves the candidate list before RRF ever sees it — and no recall@50
measurement taken at LIMIT 50 can see a list truncated at 200.

So 200 is a floor set by `annDepth`, not only by the recall curve.
`hnsw.iterative_scan = relaxed_order` is set unconditionally as the safety net —
the filtered path asks for 2,000 candidates against a 1,000 cap on `ef_search`,
and measured, it returned exactly 1,000 until iterative scan was on.

Server-side `Execution Time`, same query shape as `retrieve.ts`:

| | median | p95 |
|---|---|---|
| Sequential scan (before) | 1,100.5 ms | 1,145.6 ms |
| **HNSW, ef_search 200** | **10.7 ms** | **18.0 ms** |
| HNSW, filtered (annDepth 2,000) | 96.1 ms | 117.5 ms |

**102× on the dense stage.** The plan reads `Index Scan using
judgment_chunks_embedding_hnsw`, with no `Seq Scan`.

Re-run after any material ingest: `scripts/measure-recall.mjs`. Recall is a
property of the data, not of the setting.

### D · Re-verify retrieval, with dense actually on — **DONE, Gate S1 PASSES**

Measured against the deployed API, 8 queries × 2 passes, not against the database
and not on this laptop:

| | before the index | after |
|---|---|---|
| median | ~2,200 ms | **539 ms** |
| p95 | — | **641 ms** (threshold 3,000 ms) |
| `operativeParagraph` empty | 1 of 15 | **0 of 40** |

Known-citation checks 3/3: *Sushila Aggarwal* for the English paraphrase of
anticipatory bail, *Bhadresh Bipinbhai Sheth* for the same question asked in
Hindi against an English corpus, *Puttaswamy* for privacy.

**The empty-paragraph column is the interesting one.** Before the `ef_search`
fix, production was returning results whose dense half had been truncated, so
some judgments arrived from the lexical ranker alone with no operative paragraph
to show. It looked like a rendering gap. It was recall.

### E · Close the TCP proxy — **DONE 6 Aug 2026**
`tcp-proxy list` is empty; the API is unaffected because it reaches Postgres over
Railway's internal network, confirmed by re-running Gate S1 after the delete.

**The password that rode over it still wants rotating.** It was in plaintext in a
session transcript, and deleting the proxy does not un-expose it. Founder's, not
mine — recorded in §4.

Recreate with `railway tcp-proxy create` when a measurement run needs direct
access, and delete it again afterwards. It should not be a standing hole.

### F · Citation extraction across the corpus
~9 h at 1.2 judgments/s. Deferred until A completes — they contend for the same
database.
**Done when:** every judgment has rows, and a fresh sample of ≥8 treatment edges
verifies against source text.

### G · Back-fill `overruled_status`
The graph is worthless while every judgment reads `none`. Derive from
`judgment_citations` where `relationship = 'overruled'`, writing
`overruled_status`, `overruled_by_judgment_id` and `overruled_status_changed_at`
in one transaction.
**Done when:** the count is non-zero, spot-checked against source text, and a
`LAW MOVED` render is observed end to end.

### H · The nine feature-parity endpoint groups
Treatment, graph, review, compare, upload-chat, counter-arguments, saved searches,
annotations — all specced in `API_CONTRACTS.md`. Treatment and graph first: RCC is
building 01/02/03 against them.
**Done when:** each returns real data from the corpus, with all three citation
fields and `asOf`, and has a test.

### I · Deploy and re-run the suite on Railway
**Done when:** the suite passes on the container and every new route answers 200
with real data.

---

## 3 · Standing hazards, learned the hard way

| Hazard | Rule |
|---|---|
| `/health` SHA is an env var I set | Probe the **route**, never the SHA |
| PowerShell writes UTF-8 **with BOM** | `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)`, or `scp` |
| PowerShell mojibakes UTF-8 in pipelines | Never put corpus bytes through PowerShell — Node or `scp` |
| transformers.js does not create its cache dir | Fixed in `embed.ts`; never assume a library creates its own paths |
| A rejection can escape `.catch()` | `unhandledRejection` handler is load-bearing, not defensive style |
| ivfflat cannot index a multiplied expression | Two-stage query behind a `MATERIALIZED` fence |
| `/dev/shm` on a Railway container is **61 MB**, against a 24 GB cgroup | Postgres *parallel* maintenance puts its workspace in shm, so `max_parallel_maintenance_workers > 0` dies with `could not resize shared memory segment` (53100) at any useful `maintenance_work_mem`. Build single-threaded; the 24 GB applies to backend-local memory, not shm |
| A failed `CREATE INDEX CONCURRENTLY` leaves an **invalid** index | The planner ignores it while every write still maintains it, and it holds the name so `IF NOT EXISTS` silently no-ops the retry. Drop it before rebuilding |
| pnpm auto-installs peers, masking undeclared ones | Three found in `apps/mobile` so far |
| Machine-derived legal relationships | Never ship without a sample verified against source text |

---

## 3a · BLOCKED — CI cannot get a runner

**Every workflow run since 15:45 UTC on 6 Aug 2026 has been cancelled without
executing.** GitHub's own annotation:

> The job was not acquired by Runner of type hosted even after multiple attempts

`runner_name` is empty on every job, both jobs cancel together at exactly 15m02s,
and the run at 16:42 sat queued for 10 minutes with no runner assigned. The last
run that actually executed was `05095aa` at 15:34.

**This is not our code.** It is runner allocation on a private repo, and the two
candidate causes are GitHub-hosted capacity or the account's Actions
minutes/spending limit. I cannot tell which: the billing endpoint needs the
`user` OAuth scope, and changing auth scopes on the founder's account is not
mine to do.

**Founder check, in order:** github.com/settings/billing → Actions minutes for
private repos (free tier is 2,000/month), then any spending limit set to zero.

**Why it matters more than it looks.** The gates added this week — the design-rule
ratchet and the dense-retrieval plan tests — only gate anything if CI runs. Right
now they are decoration.

**A self-hosted runner on the Windows box is NOT a drop-in fix.** The `server
lane` job uses a `services:` Postgres container and that machine has no Docker.
The `design rules` job needs neither and could move today if this persists.

### What is verified despite it

- `pnpm lint`, `pnpm format`, `pnpm typecheck` — green locally, all packages.
- The specific bug that had CI red is verified fixed against the live database:
  `SHOW hnsw.ef_search` names its output column after the parameter, so the old
  `row.v` read undefined; `SELECT current_setting('hnsw.ef_search') AS v` returns
  the value, confirmed by direct query.
- The DB-backed suite has NOT run. No Docker locally, no runner remotely. Saying
  otherwise would be exactly the failure this plan exists to prevent.

---

## 4 · Not mine, and not blocking

Recorded so I stop re-raising them: the `sfo` vs Singapore region contradiction
(OD-2), rotating the Postgres password exposed in this session, the
`CITATION_HARNESS.md:90` vs `DESIGN_SYSTEM.md:283` copy conflict, the PD-5
saved-search reframe, OD-11 sequencing, and the OD-6 DPA.

Each is flagged where it belongs. **None of them blocks server work**, and I do
not wait on any of them.
