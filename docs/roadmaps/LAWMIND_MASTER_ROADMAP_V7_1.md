# LAWMIND — MASTER ROADMAP v7.1
## Data Moat + Court Intelligence + Product Excellence + Remote Serving + Launch

**Prepared:** 30 August 2026
**Supersedes:** v7 (patched, not rewritten) and all earlier roadmaps.
**Planning horizon:** 30 August 2026 → 30 October 2026
**Target public launch:** **23 October 2026** · **Review buffer:** through 30 October 2026
**Companion:** `LAWMIND_SPRINT_PROMPTS_V2.md`

> v7's architecture and sequencing stand. This revision patches holes found by the latest agent rounds. **Do not rewrite the architecture.**

---

# 0. WHAT CHANGED IN v7.1

| # | Change | Class |
|---|---|---|
| 1 | **Day-0 integration seal before Sprint 2 starts** | P0 |
| 2 | **The M0 receipt binds to the wrong snapshot — reconcile, never relabel** | P0 |
| 3 | **`snapshot_hash` is applied-only with a constant default — fix before HNSW** | P0 |
| 4 | **eCourts diagnosis continues from R11 evidence; do not re-test falsified hypotheses** | P0 |
| 5 | **Embedding model revision is unpinned — local weights are reproducibility-critical** | P0 |
| 6 | Shape-A monitoring rule hardened from 3 conditions to 12 | P1 |
| 7 | Gate B: `ecourts_observation = 0` passes only with a completed bounded stop report | P1 |
| 8 | Sparse-search gate measures usefulness, not only speed | P1 |
| 9 | iOS party-search **capability kill switch**; Apple language de-confidenced | P1 |
| 10 | Trust-state contract gaps scheduled | P1 |
| 11 | Statute freshness → bounded NEW2 Sprint-3 task | P1 |
| 12 | Off-machine restore has a named owner | P1 |
| 13 | **Sprint 2 capacity check and an explicit must-land / may-slip split** | new in v7.1 |
| 14 | Per-platform claims register (consequence of #9) | new in v7.1 |
| 15 | Gate receipts are produced at gate time, never reconstructed later | new in v7.1 |

## 0.1 The correction I got wrong in v7

The v7 Sprint-2 LCC prompt told LCC to "form three falsifiable hypotheses" for `fillDistrict` — but LCC R11 has already exhausted the cookie, session-token, custom-header and request-ordering hypotheses. That instruction would have burned a round re-deriving known-falsified results, and it would have made a lane violate the project's own three-attempt rule. **Corrected: the next experiment starts from R11's evidence, and the live hypothesis is request-fingerprint / User-Agent / attribution-transport parity.**

## 0.2 The rewritten state sentence

v7 said "the one thing genuinely stuck is the eCourts canary." More accurate:

> **The only unresolved product-capability experiment is the eCourts canary. Two backend reproducibility debts also require closure before their downstream milestones: embedding snapshot identity must become schema- and writer-reproducible before HNSW, and the currently unpinned embedding model files must be protected until an exact upstream revision is established.**

---

# 1. EXECUTIVE STATE — 30 AUGUST 2026

**Passing:** Gate A · HC M0 parity · new-ingest provenance · daily factory · freshness contract · Sprint-1 citation evidence · NEW3 capability/product freeze · RCC API contract freeze.

**Deliberately held:** citation bulk apply · HNSW (until snapshot completes *and* the reproducibility debts close) · broad semantic search · Tranche V2.

**In progress:** NEW1 coarse walk toward ~7.65M snapshot coverage with a working incremental queue · HC/SCI continuous ingestion.

**Open reproducibility debts (new, tracked to closure):**

```
REPRO_DEBT_1  snapshot_hash: live column introduced via hand-applied/default
              state; no committed migration reproduces it; the writer does not
              explicitly bind rows to the active snapshot; the final HNSW
              predicate depends on it. A fresh clone can produce NULL, and a
              future snapshot can be silently mislabelled.
              → BLOCKS HNSW. Owner LCC (schema/writer), coordinated with NEW1.

REPRO_DEBT_2  embedding model revision UNKNOWN: fetched via an unpinned
              resolve/main reference. The local ~2.3 GB weights may be the only
              bit-identical copy of the model that produced millions of vectors.
              → Local weights are REPRODUCIBILITY_CRITICAL until a bit-identical
              remote source is proven. Owner LCC.

REPRO_DEBT_3  M0 receipt mismatch: docs/ai/lcc-r11/m0-identity-receipt.json
              records upstreamUnique 18,947,807; the authoritative Gate-A M0 was
              18,951,606 with manifest SHA a72d9868…. Reconcile; never relabel
              one snapshot as another.
              → Owner LCC, Day-0.
```

**The eCourts position, stated from R11 evidence:**

```
authorization                  SATISFIED (settled, not reopened)
attribution                    configured
harvest switch                 ON at end of R11
raw capture                    working — 36 successful retained raw responses
ecourts_observation            0
parser                         FIXTURE_BOUND
fillDistrict                   Invalid Request
already falsified              cookie/session, rotating app_token, ajax_req,
                               known custom ajax headers, request ordering
CAPTCHA_OPERATIONAL_BASIS      RETRACTED_AS_INVENTED_REQUIREMENT
current live hypothesis        request fingerprint / User-Agent / attribution
                               transport difference
historical retention           UNMEASURED
user monitoring                DISABLED_NOT_READY
```

**`ecourts_observation = 0` remains the only eCourts number that matters.** 36 retained raw responses are instrumentation around a pipeline that has not produced one usable observation.

**Next critical path:** Day-0 seal → RCC client + remote serving → integrated alpha → real advocates → store submission. The data moat runs in parallel and never pauses for UI work.

---

# 2. AUTHORIZATION LOCK — SETTLED

`ECOURTS_PERMISSION_STATUS = SATISFIED` · `SUPREME_COURT_PERMISSION_STATUS = SATISFIED`.

Written grants exist; authorized actors exist; attribution configured; CAPTCHA handling permitted within the settled authorization; the grants are authorized sources for the data types in the canonical authorization record.

**`CAPTCHA_OPERATIONAL_BASIS = RETRACTED_AS_INVENTED_REQUIREMENT`.** Several artifacts still assert this retracted blocker (`FOUNDER_QUEUE.md` FQ-ECOURTS-CAPTCHA, the `CURRENT_PLAN.md` R11 entry, `docs/ai/lcc-r11/LCC_R11_ECOURTS_CONTINUATION.md`, bus messages 1521–1525). **Do not delete history — append the canonical correction.** The settled conditions are only those in the canonical authorization record.

Agents must not downgrade these to UNKNOWN, broaden scope, raise ceilings, bypass attribution or the audited guard, or reinterpret a grant. **Permission existence and runtime quota enforcement are different questions.**

---

# 3. NON-NEGOTIABLE PRODUCT RULES

1. Never alter canonical legal truth for anti-scraping or operational convenience.
2. UNKNOWN remains UNKNOWN.
3. Ambiguous citation remains ambiguous.
4. Failed observation means "could not observe," never "nothing changed."
5. `LISTED_OBSERVED` never renders as `HEARING_OCCURRED`.
6. No broad semantic search in public v1.
7. No generic AI-chat homepage.
8. No drafting or Hearing Pack in v1.
9. No automatic old/new criminal-code applicability conclusion without legal sign-off.
10. No person-profile or "search anyone's court history" product.
11. Party search is case-first, never person-first.
12. Safety, source and currentness evidence is never paywalled.
13. Mobile never connects directly to the founder workstation or its Postgres.
14. A paid monitoring product runs remotely.
15. No claim on any surface that the capability registry does not mark ENABLED — **per platform** (§9.5).
16. **A gate receipt is produced at gate time and retained. Never reconstruct a receipt afterwards, and never relabel one snapshot as another.**

---

# 4. THE v1 PRODUCT

**Desktop = research workstation.** Search → judgment → source/citations/statutes → save → matter.
**Mobile = advocate companion.** Quick lookup, matters, saved authorities, monitored updates, alerts.
**Website = acquisition, trust, fundraising.**

## 4.1 Two launch shapes — decided 8 September

| | **Shape A — Research + Monitoring** | **Shape B — Research only** |
|---|---|---|
| Trigger | All 12 conditions in §5.3.1 pass | They do not |
| Premium | Metered monitoring (beta tier) | Deferred — free beta, monetise at v1.1 |
| Website | Monitoring page live | "Coming soon", no capability claim |
| Launch date | 23 October | **23 October — unchanged** |

Shape B is a good product. Research, reader, statutes, matters and a trustworthy freshness surface over 18.75M judgments already beats most of what Indian advocates use. Monitoring is the differentiator, not the minimum.

---

# 5. DATA-MOAT PLAN

## 5.1 High Courts
`S3 manifest → fingerprint changed/new → ingest → artifact state → downstream queues → freshness publication`. Changed/new only · no full rescans unless reconciliation requires · source-unavailable stays revalidatable · report `accounted %` and `actually held %` separately · image-only artifacts retained but never text evidence · full provenance on every new row. **Gates bind to a frozen manifest.**

## 5.2 Supreme Court
AWS mirror for historical; official SCI for current. Judgment and order are different source roles · Landmark Judgment Summaries are editorial and never canonical reasoning · preserve official upload time separately from judgment date · link duplicates rather than creating duplicate canonical judgments.

## 5.3 eCourts — from 0 observations to a longitudinal asset

**Sequence, continuing from R11 evidence:**

**A. Browser-parity diff, before any further live request.** Reconstruct the official browser request path from retained official JS/assets. Produce a structured wire-contract diff: method · URL/path · query · form field names, encoding, ordering · cookies · Referer · Origin · Accept · Accept-Language · Content-Type · X-Requested-With · custom application headers · User-Agent · app_token lifecycle · session lifecycle. **Do not guess that a difference matters — diff it.**

**B. One bounded attribution-transport experiment.** Read the canonical authorization record. If it specifies where attribution must be transported, obey exactly. If it requires attribution on every request but does not prescribe the User-Agent, one falsifiable experiment is permitted: a conventional standards-valid browser User-Agent, **with the required LawMind attribution carried in a dedicated ASCII-safe request header and bound into the fetch ledger/audit identity.**

> **Attribution is never removed and the client is never concealed.** Record the rationale in the ledger and alongside the authorization record, so a registrar audit shows attribution was transmitted on every request and the User-Agent change was a technical compatibility measure — not evasion. This framing matters more than the experiment.

*Hypothesis:* the custom attribution-as-User-Agent fingerprint causes the `fillDistrict` rejection. *Refutation:* an otherwise browser-equivalent request returns the same Invalid Request. **One request tests it.** On failure, stop the `fillDistrict` branch and publish the diff, the exact result and the next evidence needed. No fifth blind attempt.

**C. Real fixture.** `REAL_CAUSE_LIST_FIXTURE` means a retained authorized response containing the actual cause-list result representation, **or** a successful empty-result response whose semantics are unambiguous from the application's returned status. A session page, CAPTCHA image or lookup metadata is **not** a cause-list fixture. Once obtained, **no more live requests for parser development.**

**D. Parser, offline.** Preserve raw artifact linkage · source key · court/bench/establishment · list date · list type · case/CNR/case number where present · item/serial · judge/court designation where present · party/advocate only where returned · purpose/stage where returned · parser version · observedAt · source uncertainty.

> **Never document-wide match "Record not found."** Interpret result state only from the actual result container/status the application returns. `CAPTCHA rejection ≠ empty cause list`. `HTTP 200 ≠ successful observation`. `PARSE_EMPTY ≠ NO_CASES` unless the returned semantic state proves it. Raw reprocessing must be idempotent. The official interface itself warns that a displayed cause list may differ from the actual list — **preserve that uncertainty in the observation model.**

**E. Canary.** Real request → raw artifact → successful parse → ≥1 append-only `ecourts_observation` → raw→observation trace → zero unattributed requests.

**F. Retention probe**, only after the canary: T, T−1, T−7, T−30, T−90, T−365. Classify `EPHEMERAL · SHORT_RETENTION · HISTORICAL_RETRIEVABLE · SOURCE_DEPENDENT · UNMEASURED`. **Only successful interpretable responses inform classification; a failed request never proves absence.**

**G. Daily bounded pilot**, one or two source keys. Every ledger row records `OBSERVATION_STRATEGY ∈ {CAUSE_LIST_BATCH, CASE_STATUS, ORDER_CHECK, USER_REFRESH}`.

**H. Adaptive planner**, Shape A only, by 18 Sep. Group monitored matters by source key → one cause-list fetch where several share a source → targeted status/order check where cheaper → prioritise near-term listings → obey remaining quota. **Do not optimise request volume before the pilot produces real economics.**

### 5.3.1 The 8 September monitoring scope decision — hardened

`SHAPE_A_SCOPE_CANDIDATE = yes` only if **all twelve** hold:

1. At least one complete raw → parsed → `ecourts_observation` path exists.
2. The pilot has produced usable observations on ≥2 consecutive calendar days.
3. Request success rate has a stated numerator and denominator.
4. Parser failure rate has a stated numerator and denominator.
5. Every pilot observation traces to its immutable raw artifact.
6. Duplicate/replay idempotency passes.
7. **Manual correctness review:** every observation if ≤50 exist, otherwise a stratified sample of 50. **Zero material case-identity, list-date or list-type misbindings.**
8. No unclassified failure mode is being silently counted as "no change."
9. Retention state for the pilot source is known, or explicitly UNMEASURED.
10. The encoded hourly/daily request budget supports the **proposed product cadence**, from measured pilot economics.
11. User-facing state says `LISTED_OBSERVED`, never `HEARING_OCCURRED`.
12. Monitoring remains capability-gated until remote scheduling is proven at Gate C.

Otherwise **Shape B for v1**; eCourts engineering continues; **the launch date does not move.**

> **"Candidate" is not permission to market.** Monitoring stays internally gated until its remote/service checks pass at Gate C. This deliberately avoids inventing a fake 95%-success threshold before there is data, while preventing two mediocre days from qualifying a legal monitoring product.

## 5.4 Citation graph
Bulk apply stays **HOLD** until the falsifier/write-time issues are fixed. Goal is not maximum edge count — **every canonical edge must survive adversarial review.** Fix the self-citation/falsifier class · add write-time population/frontier verification · sign a new immutable apply population · bounded precision attack with self-constructed positives and negatives · apply only when the false-pin gate passes. Re-evaluation 10–12 September. **Not a launch blocker.**

## 5.5 Statutes
Maintain Acts, repealed Acts, commencement, savings, sections, amendments, predecessor/successor identities, judgment→statute references, temporal state. **Engineering stores temporal facts; legal applicability conclusions require legal sign-off.**

**New: statute freshness is currently UNMEASURED.** Bounded measurement in NEW2's Sprint-3 round — a stratified sample, not a new ingestion architecture. See the prompt pack.

## 5.6 Embeddings

**Coarse snapshot** continues uninterrupted. Estimated completion 7–9 September — an estimate, never a release gate. Four terminal states only: `EMBEDDED · CONTENT_HASH_ALREADY_COVERED · QUEUED · EXPLICITLY_REFUSED`. **No unnamed residual class.**

**Incremental queue** runs continuously. Fairness if delta latency grows: finish current coarse batch → drain delta backlog → resume coarse. **Never a second GPU writer.**

**HNSW is now gated on the reproducibility debts, not only on coverage.** Build after the snapshot is effectively complete **and** `REPRO_DEBT_1` and `REPRO_DEBT_2` are closed. pgvector guidance supports this ordering: build indexes after initial bulk loading, use halfvec to reduce the working set, do not exhaust host memory via `maintenance_work_mem`, use index-build progress reporting, and compare approximate against exact search to monitor recall.

**ANN evaluation must include cold behaviour.** A ~19–21 GB index on a ~32 GB host behaves very differently after cache eviction. The table records `ef_search` · recall@10/50/100 · p50/p95/p99 **warm** · p50/p95/p99 **cold-ish** · filtered result completeness · index size · EXPLAIN plan. **Public semantic search stays disabled even if HNSW is excellent.**

**Passages:** Tranche V2 frozen. No "GPU is idle" logic.

## 5.7 Named backend gaps — scheduled

| Gap | Owner | Sprint | Done means |
|---|---|---|---|
| `snapshot_hash` durability | LCC + NEW1 | 2 | Committed schema; fresh install correct; writes bind snapshot identity **explicitly from the active manifest**, not a constant default; writer refuses/alerts on missing or unknown identity; tests prove snapshot A cannot be stamped as B; HNSW predicate derivable from a named immutable identity |
| Model reproducibility | LCC | 2 | Revision recovered and verified, **or** UNKNOWN recorded; local files hashed; weights classified REPRODUCIBILITY_CRITICAL and backed up |
| Filtered sparse admission | LCC | 2 | Filters narrow the admission population **before** sparse-frequency refusal; measured for **both** latency and usefulness (§ below) |
| Party-name routing + iOS kill switch | LCC + NEW3 | 2 | Case-only results; contract test; repo-wide route check; platform capability flag |
| Trust-state contract | LCC + NEW3 | 2 | Citation, body/source, graph-coverage and provenance states representable and exercised |
| eCourts canary | LCC | 2–3 | §5.3 |
| Statute freshness | NEW2 | 3 | `STATUTE_FRESHNESS_V1` |
| Embedding + acquisition continuity | NEW1, NEW2 | all | Never pauses |

**Sparse search must be measured for usefulness, not only speed.** Candidate count and latency alone can certify a fast but bad search. For each query record: filter shape · pre-filter population · post-filter population · candidate population · admitted/refused · p50/p95 · **known-target present@10 · known-target present@50**. Where no known target exists, mark `QUALITY_UNLABELED` rather than inventing relevance. Include a small previously-adjudicated relevance slice. Unfiltered broad queries may still refuse, but must return **actionable narrowing dimensions derived from real available filters.**

---

# 6. PRODUCT NORTH STAR

**LawMind Research Task Completion Rate** — the advocate finds the authority, verifies the source, reads enough context to use it, saves it to the matter, and finishes without another legal database. 50 curated realistic tasks. **The 3–5 advocate shadow beta sets the baseline; NEW3 freezes the numeric threshold by 18 September and never moves it.**

---

# 7. REMOTE SERVING

Local factory (Windows/RTX) is never the public server. Remote Linux plane serves the API, auth, user/matter DB, monitoring scheduler, alerts, billing, observability, backups.

`DATA_RELEASE_<version>` → remote staging → smoke tests → production promotion. **User/matter data is separate and never rolled back with a corpus release.**

**§7.4 Contract change control.** RCC files `CONTRACT_CHANGE_REQUEST` (endpoint · what is missing · what RCC does without it · severity) → NEW3 decides AMEND / DEFER / REJECT-with-alternative → on AMEND the version increments and LCC implements. **RCC never self-serves; NEW3 never amends silently.**

---

# 8. BACKUP — GATE-B BLOCKER, WITH A NAMED OWNER

**Owner: LCC executes. Founder owns destination and spend.** Target: restore proven by 2 September. It is a Gate B blocker, not cleanup.

**Refetchability, restated:**

> **A dependency is "refetchable" only if the exact version that produced canonical derived state is recoverable.** Until the embedding model revision is pinned, the local model weights, tokenizer and config are part of the protected reproducibility set — even though the vectors themselves are derived.

**Include:** eCourts raw artifacts + fetch ledger · citation resolution state · statute chronology/correction decisions · canonical identity decisions · source manifests · ingest ledgers · provenance · migrations/schema · eval/gold sets · worklists/checkpoints · recent official source evidence · **current local embedding model weights/tokenizer/config**.

**Exclude:** the HC/SC bulk corpus merely because it is large; vectors merely because they are expensive.

**Verify by restore:** file checksums · schema · critical row counts · **model file hashes** · elapsed restore time. **A successful upload without a restore is a HOLD.**

*One check before treating local weights as the canonical protected copy:* confirm the model licence permits retention in a private encrypted backup. Most permissive licences do; it is one line to establish and awkward to discover later.

---

# 9. STORE / POLICY

**9.1 Play account.** Organization account; D-U-N-S required. The 12-testers/14-days production-access rule is documented for **personal accounts created after 13 November 2023** — inspect the actual Play Console state after verification rather than assuming. Keep a real closed beta regardless. **Staged rollout does not apply to a first production release.**

**9.2 Billing.** PBL 7's new-app/update deadline is 31 August 2026; PBL 8 remains supported until 31 August 2027. **Target 8+; never ship a 7 build.** Billing Choice (9.1+) is post-PMF.

**9.3 Government information.** Name verifiable sources · state clearly LawMind is independent and not a government entity · keep the written authorization available if requested · show source and currentness in-product.

**9.4 Apple third-party content.** One-page source-rights matrix: source · content displayed · permission/licence basis · attribution requirement · evidence location. Apple explicitly requires permission for third-party service content **on request**. CC-BY-4.0 attribution for the AWS mirrors is a licence obligation.

**9.5 Apple public-database personal information — de-confidenced.**

Apple's 5.1.1(viii) is **broad**: apps compiling personal information from any source not directly from the user — **even public databases** — can be rejected. v7 discussed case-first design as though it solved App Review. It does not.

> **Case-first design is the correct mitigation. It is not a guarantee.**

**Therefore, ship a platform capability kill switch for party-name search** that can disable it on iOS **without** disabling exact case/CNR/citation research. Do not weaken Android or web merely because the switch exists.

**New consequence — per-platform claims.** If party search can be off on iOS, the capability registry and claims register must be **per platform**, and the App Store listing must not claim a capability disabled on that platform. When the switch is active, party search must **degrade visibly** to case-number / citation / CNR search with a clear message — never silently vanish, which produces support load and a feature-parity claim problem.

**9.6 Future AI sharing.** Before any feature sends judgment or matter data to a third-party AI provider: identify the personal data, disclose destination and use, obtain required permission/consent, keep matter data isolated. Does not block v1.

**9.7 DPDP.** Build the expensive-to-retrofit basics now. Substantive provisions are scheduled ~18 months after the 13 November 2025 notification. Do not wait.

---

# 10. SPRINT CALENDAR

## SPRINT 2 — SEAL, CLOSE BACKEND GAPS, START THE CLIENT
**30 August – 4 September · Gate B target 4 September**

**Runs first: DAY-0 INTEGRATION SEAL.** Latest LCC, NEW1 and NEW3 committed concurrently. Prove the final HEAD accounts for `6b90f98` (LCC R11), `edac0de` (NEW1 R11), `831c6c2` (NEW3 R12) and related commits **before anyone builds on it.** Without this, v7's structure could still build Sprint 2 on a mixed concurrent HEAD.

**Staffing:** LCC ACTIVE · RCC ACTIVE (starts) · NEW3 ACTIVE (light: change control + trust contracts + acceptance delta) · NEW1 CONTINUOUS · NEW2 CONTINUOUS · FIFTH FROZEN.

### 10.1 Sprint 2 capacity check — new in v7.1, and it matters

LCC's Sprint-2 load is now: Day-0 seal · `snapshot_hash` durability · model reproducibility · eCourts browser diff + experiment + fixture + parser + canary + retention + pilot · sparse admission and quality · party routing + kill switch · trust-state contract · backup and restore · hosting bakeoff.

**That is more than five days of work.** An overloaded sprint that silently fails is worse than a scoped one, so the split is declared now:

**MUST land by Gate B:**
1. Day-0 integration seal (everything else builds on it)
2. `snapshot_hash` durability (blocks HNSW in Sprint 3)
3. Model files hashed and protected (blocks the backup)
4. Off-machine backup **and restore proof** (explicit Gate B blocker)
5. eCourts browser diff + the one bounded experiment + **an outcome either way**
6. Sparse admission with the quality slice
7. Party routing + kill switch
8. Hosting selection (Sprint 3 needs a staging API by 8 September)

**MAY slip into Sprint 3 without blocking Gate B:**
- eCourts retention probe and daily pilot — both are already Sprint-3 shaped, and both depend on a canary that may not land
- Trust-state contract exercise — shareable with NEW3, and RCC does not need every state on day one
- Model revision *recovery* (as distinct from hashing and protecting the files) — UNKNOWN is an acceptable Gate B state provided the files are protected

**If LCC is falling behind, cut from the "may slip" list — never from items 1–4.** Items 1–4 are reproducibility and data-survival; the rest is product velocity.

### Gate B — 4 September
See the prompt pack for the full FIFTH check. Ten checks, headed by **reproducible HEAD** and closing with **`snapshot_hash` durability**. Two changes from v7: a reproducible-HEAD check at position 0, and `ecourts_observation = 0` passes only alongside a completed bounded stop report — **"0 because work was not attempted" is a HOLD.**

---

## SPRINT 3 — REMOTE INTEGRATED ALPHA
**5–18 September · Gate C target 18 September**

**Staffing:** LCC ACTIVE · RCC ACTIVE · NEW1 ACTIVE (snapshot integrity + HNSW) · NEW2 ACTIVE (citations + statute freshness) · NEW3 part-time · FIFTH at Gate C.

**NEW1 becomes ACTIVE only when every entry criterion passes** — see the prompt pack. `snapshot_hash` schema reproducible and writer explicit; active snapshot ID immutable; model files hashed with revision pinned or explicitly UNKNOWN plus off-machine copy; four-state identity sums to eligible with zero unnamed residual; zero duplicate identity, invalid dimensions, non-finite or unexpected non-unit vectors; delta oldest-pending age within normal bound; one GPU writer. **Only then `HNSW_BUILD_AUTHORIZED = yes`.**

**8 September:** monitoring scope decision under the twelve conditions.
**Sep 8** staging API online · **Sep 7–9** coarse snapshot complete · **Sep 9–11** integrity review and HNSW readiness · **Sep 10–12** ANN evaluation and citation bounded re-evaluation · **Sep 11** exact/structured/lexical remote with source/freshness, user/matter DB separated · **Sep 14** RCC on staging, desktop shell on the same API · **Sep 16** physical phone on mobile data completes Search → Reader → Save → Matter · **Sep 18** incremental release proven, corpus rollback proven without user/matter rollback, offsite remote restore proven.

**Shadow beta 12–18 September** — 3 to 5 practising advocates, observed sessions. **Thresholds frozen by 18 September.**

---

## SPRINT 4 — PRODUCT QUALITY + COMMERCIAL READINESS
**19 September – 2 October · Gate D target 2 October**

Staffing: RCC ACTIVE · LCC ACTIVE · NEW3 ACTIVE · NEW1 CONTINUOUS · NEW2 CONTINUOUS · FIFTH FROZEN.

No major new features. Polish, physical devices, deletion end to end, billing (PBL 8+) or an explicit free-launch decision, and the store packs. **Gate D's hardest criterion: monitoring claims do not exceed measured capability — check it last and hardest.**

---

## SPRINT 5 — CLOSED BETA + WEBSITE + FUNDRAISE
**3–16 October · Gate E target 16 October**

Staffing: NEW3 ACTIVE (heaviest) · RCC ACTIVE · LCC ACTIVE · NEW1/NEW2 CONTINUOUS · FIFTH at Gate E.

10–30 practising legal users against **frozen** definitions. Desktop usable by 9 Oct, beta-quality by 16 Oct. Website launch-ready by 16 Oct with real screenshots only. Load test, incident and rollback drill, FIFTH pre-submission audit.

---

## SPRINT 6 — SUBMISSION + LAUNCH
**17–23 October · Buffer 24–30 October**

17 Oct candidate freeze · 17–19 Oct submit · 20–23 Oct review responses **using prepared evidence only** · 23 Oct target launch. **If a mobile store is delayed: desktop web and website go public, beta users continue, the company does not stop.**

---

# 11. AGENT STAFFING MODEL

Three states. **ACTIVE** — new scoped work needing judgment, on or near the critical path; full prompt. **CONTINUOUS** — standing jobs run, no new scope; a one-line continuation only. **FROZEN** — deliberately paused.

| Agent | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|
| NEW1 | CONT | **ACTIVE** | CONT | CONT | CONT |
| NEW2 | CONT | **ACTIVE** | CONT | CONT | CONT |
| LCC | **ACTIVE** | **ACTIVE** | **ACTIVE** | **ACTIVE** | **ACTIVE** |
| NEW3 | ACTIVE (light) | ACTIVE (part) | **ACTIVE** | **ACTIVE** | ACTIVE (part) |
| RCC | **START** | **ACTIVE** | **ACTIVE** | **ACTIVE** | **ACTIVE** |
| FIFTH | FROZEN | **GATE C** | FROZEN | **GATE E** | FROZEN |

**Why a CONTINUOUS agent must not get a full prompt:** a prompt asks for new work, and a lane asked for new work will find some. That is how an embedding lane becomes a retrieval-research lane. **Do not bring NEW1 back to ACTIVE in Sprint 2** — its worker is healthy and re-prompting invites another research detour.

**One note on the Day-0 seal:** it is assigned to LCC, and it partly audits LCC's own R11 commits. That is acceptable because the seal is mechanical — git ancestry, lease state, migration journal — and every claim is independently checkable. **Gate B check 0 re-verifies it through FIFTH**, which is where the independence belongs.

**Concurrency discipline** in every prompt: atomic `HEAVY_BOX` / `GIT_COMMIT` / `MIGRATION_SLOT` · stage and commit owned paths only · never sweep another lane's staged work · **exactly one GPU writer** · one owner per logical job · no fake RUNNING state · durable rows are the only proof of progress.

---

# 12. WEEKLY SCOREBOARD

**Data:** HC accounted % · HC actually-held % · SCI latest official judgment date · citation resolved edges · statute-reference resolution % · **statute freshness state** · coarse embedding % · incremental oldest pending age · **eCourts observations/day** · request success % · budget utilisation · retention coverage.

**Product:** core-loop pass rate · task-completion score · search p50/p95 · **sparse known-target present@10** · API error rate · reader failures · saves · matters created · degraded/refused rate.

**Reliability:** latest backup · latest successful restore · remote uptime · release version · rollback proof · P0/P1 count.

**Reproducibility (new):** `REPRO_DEBT_1` snapshot_hash · `REPRO_DEBT_2` model revision · `REPRO_DEBT_3` M0 receipt — each OPEN or CLOSED with the closing evidence.

**Commercial:** active beta advocates · weekly returning · monitored matters · billing readiness · store-pack state.

**Agents:** each agent's state, and for CONTINUOUS agents the one number proving the standing job is alive.

*A metric must always state its denominator.*

---

# 13. GATE POLICY

FIFTH runs at **Gate B, Gate C, Gate E**, and on emergency audit after a P0 data/security incident.

**Stop-the-line only for:** canonical legal-data corruption · unauthorized source access · security/privacy exposure · migration/schema divergence risking data · user/matter data loss · release/rollback failure capable of corrupting production. Everything else goes to the backlog.

---

# 14. RISK REGISTER

| Risk | Exposure | Mitigation |
|---|---|---|
| **Sprint 2 built on a mixed concurrent HEAD** | Silent loss of completed work; audits of the wrong code | **Day-0 seal, before anything else** |
| **M0 receipt relabelled** | A gate denominator that never existed | Reconcile, never relabel; §3 rule 16 |
| **`snapshot_hash` mislabelling** | HNSW indexes the wrong population; fresh clone yields NULL | REPRO_DEBT_1 closes before HNSW |
| **Model revision unpinned** | Millions of vectors become unreproducible | REPRO_DEBT_2; weights in the protected set |
| eCourts hypotheses re-tested | A wasted round, quota burned under a grant | Continue from R11 evidence; one bounded experiment |
| Attribution experiment misread as evasion | Grant risk | Attribution never removed; rationale recorded in the ledger |
| Monitoring shipped on two mediocre days | Advocate distrust, store risk | Twelve-condition gate |
| Fast-but-useless sparse search certified | Product looks fixed, is not | Known-target quality slice |
| **Apple rejects party search despite case-first** | Redesign under launch pressure | **iOS capability kill switch + per-platform claims** |
| Sprint 2 overload | Silent slippage on reproducibility items | §10.1 must-land / may-slip split |
| Workstation loss before restore proof | Irreplaceable state lost | Gate B blocker, named owner |
| Statute freshness unmeasured | Silent moat decay | NEW2 Sprint 3 bounded measurement |
| Semantic detour during polish | Weeks lost | NEW1 CONTINUOUS in Sprints 4–6 |
| Beta thresholds moved after results | Self-deception; investor credibility | Frozen 18 Sep, never moved |

---

# 15. FINAL NORTH STAR

**Data trust** — advocates see source, freshness, provenance, uncertainty, and what LawMind does not know.
**Research completion** — advocates finish real tasks without leaving LawMind.
**Court intelligence** — a longitudinal record of what LawMind observed from authorized court systems, and when.
**Workflow retention** — research becomes saved authorities, matters, monitoring, corrections and repeat use.

> **better legal data × better legal intelligence × faster advocate workflow × repeat usage**
