# CITATION_IDENTITY_REPAIR_V1 — R8.1 §7.3 + §7.4

**Lane:** NEW2 · **25 August 2026**
**§7.3 ambiguous pin repair: `PREPARED_NOT_EXECUTED`**
**§7.4 resolver risk replay: `EXECUTED` — the table is nonempty and current**

**Artifacts**
- `scripts/n2-ambiguous-pin-repair.mts` · `docs/ai/new2-r8/ambiguous-pin-repair.json` · `ambiguous-pin-rollback.json`
- `scripts/n2-resolver-risk-replay.mts` · `docs/ai/new2-r8/resolver-risk-replay.json`

---

## Part A — §7.4: the gate was passing with no evidence at all

### A1. Proven on the live database, not argued

`resolver_risk_replay` held **zero rows**. G4 requires it "nonempty/current
before safe uniqueness is served". FIFTH raised it at bus 1190. NEW2 ran the
actual gate function against the live database rather than reading the code and
inferring:

```
resolver_risk_replay rows       0
freshness state                 CURRENT
lastRiskReplayAt                null
lastRiskReplayFalseUniqueRate   null
because                         []
mayAssertUnique                 true
```

`readKeyFreshness` **reads** the risk replay, reports it as null, and then does
not put it in `because`. The gate bounds index lag in rows and hours, and never
asks whether any adjudicated risk evidence exists. **An empty risk table and a
clean risk table are the same reading, and nothing separates them.**

That is the same shape as the defect NEW2 reported at bus 1231 and LCC's own
`RESOLVER_CORRECTNESS_FRESHNESS_V3` — a dashboard reading CURRENT while telling
the truth about the wrong thing.

**Split of work.** Making `because` fail closed on an absent or stale replay is
LCC's §8.3 and is NOT done by this document. Putting real evidence in the table
is §7.4 and is done.

### A2. The replay runs the real resolver, not a model of it

`resolveBatch` from `services/api/src/citations/resolver.ts`, over NEW2's
independently adjudicated `citation-truth-set.json` — 406 records, human
adjudication, with `expected_resolver_behaviour` decided before the answer was
known. A replay that reimplements the thing it tests tests nothing.

```
truth set          NEW2_CITATION_TRUTH_SET v1.0.0, 406 adjudicated records
resolver freshness CURRENT   frontier 2026-08-24 18:59:19+00

false_unique       0
materially_unsafe  0
```

| expected → got | n |
| --- | ---: |
| `RESOLVE_UNIQUE_TITLE_UNCONFIRMED` → `UNIQUE` | 147 |
| `REFUSE_TARGET_NOT_HELD` → `TARGET_NOT_HELD` | 136 |
| `RESOLVE_UNIQUE` → `UNIQUE` | 90 |
| `REFUSE_AMBIGUOUS` → `AMBIGUOUS` | 31 |
| **`RESOLVE_UNIQUE` → `AMBIGUOUS`** | **2** |

The only two mismatches are in the **safe direction**: the resolver refused to
claim uniqueness where the adjudicator allowed it. A false ambiguous costs a
click. A false unique costs a wrong authority.

Per risk class, all zero: `SHARED_NEUTRAL_DIFFERENT_AUTHORITIES` 19 ·
`SHARED_NEUTRAL_SAME_AUTHORITY` 8 · `COURT_DATE_COLLISION` 6 ·
`TARGET_NOT_HELD` 136 · `REPORTER_ALIAS` 129 · `NEUTRAL_FORM` 97 · `OTHER` 11.

### A3. Why a 0 is worth nothing until the detector is shown able to fire

`--selftest` runs three synthetic probes against the live index:

```
PASS  held-once key asserted AMBIGUOUS    got UNIQUE      detector FIRED   (expected FIRED)
PASS  held-once key asserted NOT_HELD     got UNIQUE      detector FIRED   (expected FIRED)
PASS  3-peer key asserted UNIQUE          got AMBIGUOUS   detector silent  (expected silent)
```

Two branches fire when they should; the third stays silent when it should, which
matters just as much — it shows the counter is not simply counting every
mismatch. **The 0 is a measurement, not a stuck counter.**

### A4. The caveat that must travel with the number, and does

**The truth set drove the resolver fix it is now testing.** A clean sweep on it
is `IN_SAMPLE` evidence that known defects stay fixed. It says nothing about
defects nobody has adjudicated. The written row carries this in `notes`:

```json
"evidence_strength": "IN_SAMPLE — this truth set drove the resolver fix it is testing"
```

**It must never be restated as a corpus-wide false-unique rate.**

### A5. Two classes the truth set cannot reach, probed directly

| class | measurement | state |
| --- | --- | --- |
| despatch stamps | 827 rows, **0 materialized pins** | `CLEAN` |
| old-row mutation / index behind ingest | 0 judgments newer than the cursor | `CLEAN` |
| cross-court alias collision | — | `NOT_COVERED` by this truth set |

### A6. A predicate error of my own, caught by disagreeing with my own past number

A hand-rolled despatch predicate reading `normalised_citation` returned **729**
rows against R7's 827. Ninety-eight rows short, no error, no warning. The fix is
to use NEW2's own predicate from bus 1223 character for character —
`upper(regexp_replace(citation_text,'[^A-Za-z0-9]','','g'))` against the
month-name pattern — which is what 1223 asked for in the first place: **one
predicate, not two.**

This is the second time today the same class of error appeared. The first was
matching raw neutral citations against `citation_key`, which is
`citationLookupKey` output. Both times a wrong normaliser produced a clean,
confident, wrong number rather than an exception.

### A7. Result

```
resolver_risk_replay rows       1
lastRiskReplayAt                2026-08-25 19:01:27+00
lastRiskReplayFalseUniqueRate   0
```

G4's **evidence** half is met. G4's **gate** half is not: `mayAssertUnique` still
returns true for an empty table, and that is LCC's §8.3.

---

## Part B — §7.3: 21,652 ambiguous pins, and only 4,688 of them are unsafe

### B1. The exact population, replacing an estimate

R7 estimated **~24,500** from a 1,104-row sample at 10.6%. Measured exactly on
current HEAD:

```
resolved pins          231,351
ambiguous pins          21,652   (9.36%)
max peers behind one pinned key      350
key absent from index       10   (a separate defect, not repaired here)
```

The estimate was sound; the exact number is 21,652.

### B2. The refinement that stops this destroying 17,000 correct links

A pin is unsafe only if following it can land the advocate on a **different
authority**. If every peer behind the key is the same decision — the same text
under two rows, or the same CNR and date from two sources — the pin is correct
and clearing it would remove a good link to fix nothing.

Classified with `DECISION_IDENTITY_CONTRACT_V1`'s own states:

| identity state | pins | max peers | disposition |
| --- | ---: | ---: | --- |
| `EXACT_DOCUMENT_DUPLICATE` | 14,525 | 135 | **KEEP** |
| `SAME_DECISION_DIFFERENT_SOURCE` | 2,439 | 2 | **KEEP** |
| `DIFFERENT_COURTS` | **3,646** | 3 | **CLEAR** |
| `DIFFERENT_DATES` | 649 | 18 | **CLEAR** |
| `UNKNOWN` | 393 | 350 | **CLEAR** |

**Clear 4,688. Keep 16,964.**

`DIFFERENT_COURTS` is the class that matters: 3,646 citations pinned to a
judgment when the same key also names a judgment **in another court**. That is
a wrong-authority pin, and it is invisible to the advocate because verified is
silent.

`UNKNOWN` is cleared rather than kept. `UNKNOWN` stays `UNKNOWN`, and a pin whose
safety cannot be established is not a safe pin. It is 393 rows and it holds the
worst key in the corpus at 350 peers.

**Ordering note, and it is checked rather than lucky.** `EXACT_DOCUMENT_DUPLICATE`
is tested before `DIFFERENT_COURTS`. `DECISION_IDENTITY_CONTRACT_V1` §2.1
measured `NOT_SAME_DECISION` — same text under two different courts — at
**exactly zero rows** in this corpus, so the two cases cannot both be true.

### B3. Clearing is not dropping, and the distinction is the harness

`CITATION_HARNESS.md` forbids silently dropping a citation. **Nothing here drops
one.** Preserved untouched: `citation_text`, `normalised_citation`,
`char_offset`, `relationship`, `evidence`, `treatment_provenance`,
`citing_judgment_id`. Changed: `cited_judgment_id → NULL`, and nothing else.

The citation still renders. It renders as **ambiguous**, which is what it is, and
which `/search` already returns for these keys. A wrong pin is invisible because
verified is silent; an ambiguous one is visible and the advocate can act on it.

**This moves 4,688 citations out of a false confident state into a true uncertain
one.** That is the direction the harness requires.

### B4. Rollback

`docs/ai/new2-r8/ambiguous-pin-rollback.json` — 4,688 rows of
`{ id, cited_judgment_id, key, identity_state, peers }`, **written in dry-run
mode as well as apply**, so the reversal exists before the change does.

### B5. The apply, and what it will prove

Not run. `--apply` is refused without `--i-hold-heavy-box`; NEW1 holds the lease.

When it runs it will: clear in batches of 2,000 so a kill leaves a known state,
then **re-ask the original classification question in the same run** and refuse
with `REPAIR_INCOMPLETE` unless zero unsafe ambiguous pins remain.

Classification cost measured: **10.4s** over 231,351 resolved pins.

---

## C. State

| item | state |
| --- | --- |
| gate passes with empty risk table | **`PROVEN`** — reproduced against the live gate function |
| risk replay populated | **`EXECUTED`** — 1 row, current, `IN_SAMPLE` labelled |
| replay non-vacuity | **`PROVEN`** — 3 probes, 2 fire, 1 correctly silent |
| false_unique on adjudicated set | **`PASS_AT_MEASURED_SCOPE`** — 0/406, in-sample only |
| despatch pins | **`PROVEN`** zero, on NEW2's own 1223 predicate |
| ambiguous pin population | **`PROVEN`** — 21,652 exact, not sampled |
| unsafe subset | **`PROVEN`** — 4,688, classified on a published identity contract |
| pin repair | **`PREPARED_NOT_EXECUTED`** — waits on `HEAVY_BOX` |
| `mayAssertUnique` fail-closed | **`BLOCKED`** — LCC §8.3, not NEW2's to change |
| cross-court alias collision | **`NOT_MEASURED`** |
