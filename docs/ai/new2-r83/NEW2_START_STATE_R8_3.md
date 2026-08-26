# NEW2 — START_STATE_R8_3

**Lane:** NEW2 — corpus / data truth / ingest / provenance / statutes / OCR / source freshness.

**Published:** 2026-08-26T05:15Z · session `5057e32e-cd08-429f-a120-5339db3cc48a`
**Protocol:** `LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md` §11.

Every row below is labelled. `OBSERVED_BY_LIVE_DB` means I ran the query in this
session. `CARRIED` means it is a prior lane claim I have **not** re-measured yet
and am not treating as truth. `INFERRED` shows its chain.

---

## 1. Anchors

| item | value | label |
| --- | --- | --- |
| orchestration file | `LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md` | `OBSERVED_BY_EXECUTION` |
| SHA-256 | `0211a3be3877ec31e8c841e5095930b11264692e2bbb3399012af4d11245f43b` | `OBSERVED_BY_EXECUTION` |
| size | 40,572 bytes, 976 lines, UTF-8 | `OBSERVED_BY_EXECUTION` |
| encoding | **clean** — no cp1252 mojibake; unlike my R8.1 materialization, nothing was repaired | `OBSERVED_BY_EXECUTION` |
| tracked at HEAD? | **NO — untracked working-tree file**, written 2026-08-26T05:02:20Z | `OBSERVED_BY_EXECUTION` |
| git HEAD | `16640cf29a255d0960c18b88e98c21faf138bcc1` | `OBSERVED_BY_EXECUTION` |
| bus high-water read | `1312` (`1312--LCC-to-NEW2`) | `OBSERVED_BY_EXECUTION` |
| DB | `lawmind` @ 127.0.0.1:5432 | `OBSERVED_BY_LIVE_DB` |
| migrations | **87 applied** (`drizzle.__drizzle_migrations`) | `OBSERVED_BY_LIVE_DB` |
| NEW2 lane lease | ACQUIRED 05:09Z, took over from `53b2a879…` (DEAD, 741m stale) | `OBSERVED_BY_EXECUTION` |
| `HEAVY_BOX` | **FREE** — released by NEW2 at 04:33:45Z. Per §4 Phase B it is **LCC's first** and I will not take it | `OBSERVED_BY_EXECUTION` |
| `MIGRATION_SLOT` | HELD by LCC since 01:39Z | `OBSERVED_BY_EXECUTION` |

The one anchor difference from R8.1 worth stating: **the lock file is real on
disk this round but is not in any commit.** A lane that diffs against HEAD will
not find it. My hash is of the file as delivered, unedited.

---

## 2. N2-1 — post-fixture truth, re-measured, not taken from LCC

LCC's 1312 reports the purge executed. I did not accept it; I ran both
discriminators myself against the live DB.

```
judgments                                    18,698,968
judgments WHERE source_url LIKE 'test://%'            0
judgments WHERE court = 'Test Court'                  0
matter_authorities                                    0
```

**Fixture state is `CURRENT_ZERO`, measured by NEW2, `OBSERVED_BY_LIVE_DB`.**
My R8.1 `BLOCKED_HUMAN` wording is **withdrawn** and does not carry forward.

Two things keep this from being a vacuous 0:

- the discriminator `source_url LIKE 'test://%'` is only sound because
  `fixture-leak.test.ts` asserts the other half — that no real judgment carries
  one. LCC reports that test 2/2 green (`CARRIED`, LCC 1312; I have not run it);
- the **loose** predicate `court = 'Test Court'` also reads 0 now. That is worth
  recording precisely because I measured in R8.1 that the loose predicate would
  have destroyed **8 REAL judgments** had it been used as the delete key. Both
  predicates agreeing at 0 after the fact is a second reading, not the same one.

`citation_checks` now holds **14,051** rows; LCC deleted the 5 fixture-linked
ones. I did not re-derive which 5.

---

## 3. Corpus counts I re-measured this session

| measure | value | label |
| --- | ---: | --- |
| `judgments` | 18,698,968 | `OBSERVED_BY_LIVE_DB` |
| `judgment_citations` | 22,322,047 | `OBSERVED_BY_LIVE_DB` |
| `judgment_statute_refs` | 862,594 | `OBSERVED_BY_LIVE_DB` |
| …with `statute_id` linked | **320,729 (37.18%)** | `OBSERVED_BY_LIVE_DB` |
| `statutes` | 846 | `OBSERVED_BY_LIVE_DB` |
| `statute_sections` | 35,395 | `OBSERVED_BY_LIVE_DB` |
| `new1_tranche_passages` | 418,116 | `OBSERVED_BY_LIVE_DB` — agrees exactly with NEW1's 1290 |
| `hc_ingest_ledger` | 230,931 | `OBSERVED_BY_LIVE_DB` |
| `resolver_risk_replay` | 1 | `OBSERVED_BY_LIVE_DB` |
| `ecourts_observation` | **0** | `OBSERVED_BY_LIVE_DB` |
| `ecourts_fetch_ledger` | 68 | `OBSERVED_BY_LIVE_DB` |
| `max(judgment_date)` | 2026-08-18 | `OBSERVED_BY_LIVE_DB` — **and this number is a trap, see §4** |

**320,729 is confirmed from the DB, not from my own R8.1 report.** §5.3 forbids
marketing it as coverage: it is **37.18% of statute references linked**, and the
remaining 62.82% is dominated by one absent Act (§5).

---

## 4. The freshness claim I am carrying INTO this round, and what is missing

`CARRIED` from `docs/ai/new2-r8/SOURCE_FRESHNESS_R8.md`, my own R8.1 work:

- `max(judgment_date)` = 2026-08-18 reads as an 8-day lag and is wrong by ~7×;
- August 2026 holds **480** judgments against a 117,332/month baseline — 0.4%,
  `EFFECTIVELY_ABSENT`;
- honest currency frontier **2026-07-01**, real lag **56 days** as of 25 Aug.

What R8.3 §11 N2-2 asks for that **does not exist yet**, and which is the whole
point of the priority:

| required field | state |
| --- | --- |
| newest local ingest / local ingest lag | present |
| newest **upstream** object/listing | **`NOT_MEASURED`** |
| newest **upstream** legal decision | **`NOT_MEASURED`** |
| **upstream source lag** | **`NOT_MEASURED`** |
| court × month completeness | **`NOT_MEASURED`** — R8.1 measured corpus-wide months only |

So the question §11 poses — *stale because local ingestion stopped, because the
upstream bulk source is stale, or both?* — **is not answered today.** My R8.1
document offers `INFERRED` reasoning (AWS Open Data is a periodic bulk dump, and
eCourts has never run) but that is a chain, not a probe. **No remedy before
cause, and no cause before the upstream side is measured.** That is my Priority 1.

---

## 5. N2-5 — my own `CONFIRMED_ABSENT` on CrPC 1973 is REOPENED

I wrote `CONFIRMED_ABSENT` in R8.1 on three search paths. §0 Correction 8 says
orchestrator research found an official India Code central bitstream for
**Act No. 2 of 1974** plus an MHA Judicial Division listing.

**I am treating my own verdict as the suspect claim, not the orchestrator's.**
The honest reading of what I proved is narrower than what I wrote: I proved that
*the items I found* carry zero bitstreams, and that the CENTRAL "Criminal
Procedure" principal-Act filter returns 1861/1872/1882/1898 and not 1973. An
absence proof over a search path I chose is exactly the shape of claim that
`admission-by-absence-of-evidence` describes.

Stakes: CrPC 1973 is **280,027 references across 186,382 judgments** (`CARRIED`,
R8.1) — the single largest statute gap, and the dominant term in the 62.82% of
`judgment_statute_refs` that do not link.

Standing constraint, unchanged and load-bearing: **India Code `.pdf.txt` is
hard-truncated at exactly 100,000 characters** and a heading-count completeness
check scores 100% on a file holding 18.0% of the IPC (`PROVEN`, R8.1). Whatever
artifact I find, the PDF is the target and the TOC is never the proof.

---

## 6. What I will NOT do this round

Per §11 N2-10 and §4 Phase D, and stated up front so nobody waits on it:

- no broad OCR programme, no full resolver run, no coram backfill, no bulk
  language pass, no provider ingest, no embedding expansion;
- no `HEAVY_BOX` acquisition while LCC's release proof is outstanding;
- the 14 release-critical OCR docs and the 595 bounded date cases run **only**
  after LCC releases the box **and only if** the limited-freeze verdict still
  needs them (§11 N2-9);
- no migration is authored by me; `MIGRATION_SLOT` requests go to LCC (§3.1).

---

## 7. Ordered queue

1. **N2-2** source-freshness decomposition — upstream vs local, per source, per
   court × month; versioned machine-readable object for LCC.
2. **N2-5** CrPC 1973 source correction (P0 data research) — re-test, checksum,
   central-vs-state, section inventory; ingest only if the artifact proves out.
3. **N2-4** statute-link independent-test package for FIFTH — join rule + hash,
   stratified positives, aliases/collisions, negative controls.
4. **N2-7** widened role census (§8.4) + blind package for FIFTH with predictions
   hidden.
5. **N2-6** IPC/IEA/CrPC parser proof · **N2-3** recency bridge design (only if
   §11 N2-2 shows upstream is the stale side) · **N2-8** role policy after
   FIFTH's labels.
