# FIXTURE_PURITY_MANIFEST_V1 — R8.1 §7.1 (P0)

**Lane:** NEW2 · **25 August 2026** · state **`PROVEN`** (manifest) /
**`PREPARED_NOT_EXECUTED`** (removal — waits on LCC §8.8 and one LCC decision)

**Artifacts**
- `docs/ai/new2-r8/fixture-manifest.json` — machine-readable manifest
- `scripts/n2-fixture-manifest.mjs` — read-only generator, re-runnable
- `scripts/n2-fixture-removal.sql` — exact-ID removal, ends in `ROLLBACK`
- `scripts/n2-sql-dryrun.mjs` — dry-run runner that refuses a file not ending in `ROLLBACK`

---

## 1. The finding that decides the method

R8.1 §0.4 says handle fixtures "by exact row manifest, never loose court-name
deletion." NEW2 measured what a loose predicate actually costs:

```
case_title LIKE 'SYNTHETIC%' AND court <> 'Test Court'   ->  8 rows
```

**All eight are real judgments.**

| court | case title | citation |
| --- | --- | --- |
| Supreme Court of India | SYNTHETICS & CHEMICALS LTD. ETC. v. STATE OF U.P. AND ORS. | **1989 INSC 321** |
| High Court of Madhya Pradesh | SYNTHETICS SHRAMIK KARMACHARI PARISHAND v. SECRETARY AND 2 ORS. | — |
| High Court of Delhi | SYNTHETIC AND RAYON TEXTILES EXPORT PROMOTION COUNCIL v. SMITA BHARADWAJ | — |
| High Court of Rajasthan | SYNTHETIC WEAVING MILLS ASSOCIATION v. STATE OF RAJASTHAN | 2023:RJ-JD:24573 |
| Bombay High Court | SYNTHETIC COLOUR CHEM INDUSTRIES v. COMMISSIONER OF CUSTOMS (APPEALS) | — |
| Allahabad High Court | SYNTHETICS AND CHEMICALS ... v. STATE OF U.P. AND OTHERS | — |
| Bombay High Court | SYNTHETIC COLOUR CHEM INDUSTRIES v. COMMISSIONER OF CUSTOMS (APPEALS) | — |
| Bombay High Court | SYNTHETIC AND CHEMICALS LTD. AND ANR. v. UNION OF INDIA AND ORS. | — |

*Synthetics & Chemicals Ltd. v. State of U.P.* is a **Constitution Bench**
authority on State legislative competence over industrial alcohol. Every one of
the eight carries a real AWS Open Data `s3` PDF source URL.

A title-prefix predicate would have deleted a landmark. This is not a
hypothetical about future corpus growth — it is true of the corpus today.

**Method that follows from it:** the manifest is a list of sixteen UUIDs. Every
predicate in this document exists to *verify* that list, never to *produce* the
delete set at execution time.

---

## 2. The manifest

Sixteen rows. Each carries **four independent synthetic markers**, and the
candidate set is the **intersection**, never a union:

| marker | population |
| --- | ---: |
| `court = 'Test Court'` | 16 |
| `source_url LIKE 'test://%'` | 16 |
| `case_title LIKE 'SYNTHETIC %'` | 16 |
| `content_hash IS NULL` | 16 |
| rows carrying some markers but not all | **0** |

Two of these are independently safe (a court name and a URL scheme are set by
different code paths), and they return **the same 16 rows**. `PROVEN`.

A fifth signal is recorded but not used as a gate: every fixture is dated
**1 January** of a round year (2000, 2001, 2020, 2023, 2024, 2025).

### The sixteen IDs

```
6fd21632-11bb-4aec-be28-3de62befb65f  SYNTHETIC — Assembly Fixture         2000-01-01
d4ca2129-d6f8-44c6-b9f9-b8a913bad0b8  SYNTHETIC — Authorities Fixture      2024-01-01
194290da-dcb2-4d0f-bd78-e51880a522fd  SYNTHETIC — Replacement Fixture      2025-01-01
00d958ce-6d32-4599-8516-5a6cc0379bc3  SYNTHETIC — Set Aside Fixture        2020-01-01
d990e6a7-209a-4e1f-b1d1-c46792b05ea6  SYNTHETIC — Still Good Law For Now   2023-01-01
7d75f737-4834-4f8d-9ea5-c0f5ba3f6d03  SYNTHETIC — Reporter Citation Only   2001-01-01
9ba4769c-2e15-41f7-9dab-1e329579ef62  SYNTHETIC — Authorities Fixture      2024-01-01
bb39ea0b-d154-41c8-85c9-2393f306f0b0  SYNTHETIC — Replacement Fixture      2025-01-01
1c8cd748-35f4-4055-b3eb-6bc79f107611  SYNTHETIC — Set Aside Fixture        2020-01-01
44f68fce-8774-4ae6-9d0c-28c1ec6dbcce  SYNTHETIC — Still Good Law For Now   2023-01-01
3292c5dd-2c99-4ccf-9667-8d97b9373b88  SYNTHETIC — Reporter Citation Only   2001-01-01
c90239ff-7b82-4d07-8e77-f45a04b15a90  SYNTHETIC — Authorities Fixture      2024-01-01
83e59641-eff9-4b35-b76a-09bc4645c77e  SYNTHETIC — Replacement Fixture      2025-01-01
70a6ecbc-49f0-42a3-850b-1c00815977f0  SYNTHETIC — Set Aside Fixture        2020-01-01
2293139d-198c-4486-a4e1-ca66388b274b  SYNTHETIC — Still Good Law For Now   2023-01-01
54626473-6e3b-48e4-a30f-facbc2c75982  SYNTHETIC — Reporter Citation Only   2001-01-01
```

**Origin, from `created_at`:** three test runs, all on 23 August 2026 —
06:41:54 (1 row), 06:51:46 (5 rows), 13:11:40 (5 rows), 13:14:34 (5 rows). The
same five-fixture assembly ran three times and left its output behind each time.
That is the growth mechanism §0.4 saw as "6 → 16": nothing is generating
fixtures continuously; a suite is not cleaning up after itself.

---

## 3. Dependent rows — 39 across 22 foreign keys

`judgments` has **22 FK constraints** pointing at it. Non-zero dependents:

| constraint | rows | delete rule |
| --- | ---: | --- |
| `judgment_citations.citing_judgment_id` | 16 | CASCADE |
| `judgment_citation_keys.judgment_id` | 12 | CASCADE |
| **`judgments.overruled_by_judgment_id`** | **6** | **NO ACTION — blocks** |
| **`citation_checks.judgment_id_matched`** | **5** | **NO ACTION — blocks** |

**Advocate-owned data: zero.** `matter_authorities` 0, `judgment_annotations` 0,
`alerts` 0. No real matter points at a fixture. Checked explicitly, and the
removal script **refuses to run** if that ever stops being true — a real matter
citing a fake authority is an incident, not a cleanup.

### 3a. The six overruled pointers are fixture-internal — checked, not assumed

The alarming reading of "6 rows in `judgments.overruled_by_judgment_id`" is that
real judgments are marked overruled *by a fixture*. They are not. All six
pointers are fixture → fixture, entirely inside the manifest:

```
SYNTHETIC — Set Aside Fixture       set_aside         ->  SYNTHETIC — Replacement Fixture   (x3)
SYNTHETIC — Still Good Law For Now  partly_set_aside  ->  SYNTHETIC — Replacement Fixture   (x3)
```

The removal script re-checks this at execution time and raises
`REAL_JUDGMENT_OVERRULED_BY_FIXTURE` rather than nulling, if it is ever false.

### 3b. `citation_checks` — five audit rows, and a decision that is LCC's

Five rows in the citation-harness audit ledger matched a fixture:

```
surface            judgment_detail          (all five)
citation_claimed   "SYNTHETIC — Set Aside Fixture"
verification_state verified
verified_by_source corpus
shown_to_user      true
created_at         25 Aug 07:45, 07:50, 12:58, 13:14, 13:56
```

All five are today's regression traffic. NEW2 **does not choose** how they are
handled, because audit integrity is G6 and the cascade seam is §8.8:

- **(A) delete the five rows** — they record test traffic, not advocate traffic.
  Implemented in the script, and reversible from the rollback table.
- **(B) `NULL` the `judgment_id_matched`** — the column is nullable but
  **0 of 14,029 rows have ever been null**, so this creates the first nulls the
  column has held, and asserts "this check matched nothing", which is false.
- **(C) keep the fixtures**, excluded at every surface instead.

### 3c. A separate finding the audit ledger hands us

`citation_checks` has **no way to mark a row as test traffic**. Five rows say
LawMind told a user a citation was `verified` against `corpus` when the target
was synthetic. In a regression run that is correct behaviour; in the ledger it
is indistinguishable from production. That is a G6 audit-integrity gap and it is
LCC's — noted here because this manifest is where it surfaced, not because NEW2
is claiming it.

---

## 4. The removal is prepared, dry-run, and NOT executed

`scripts/n2-fixture-removal.sql` runs the full path inside one transaction and
ends in `ROLLBACK`. `scripts/n2-sql-dryrun.mjs` **refuses any file whose last
statement is not `ROLLBACK`**, so the dry-run runner cannot silently become an
execution runner.

**Dry run, 25 Aug ~17:0xZ, against the live `lawmind` database:**

```
NOTICE  frame check PASS: 16 ids, all four markers intact
NOTICE  user-data check PASS: 0 advocate-owned dependents
NOTICE  overruled_by check PASS: all pointers are fixture-internal
NOTICE  POST: court=Test Court 0, source_url test:// 0,
        title SYNTHETIC-em-dash 0, orphan checks 0, orphan overruled_by 0

DRY RUN COMPLETE — rolled back, 4 notices, 64,244 ms
```

Post-rollback verification, separate session: **16 fixtures still present,
14,029 `citation_checks` intact, `n2_fixture_removal_rollback` does not exist.**
The dry run left nothing behind.

### What LCC needs from that number

**64 seconds, not instant.** The `DELETE FROM judgments` cascades into
`judgment_chunks`, `judgment_paragraphs`, `judgment_statute_refs` and eight more
tables in the tens of millions of rows. Sixteen rows deleted, one minute of
locks. Schedule it as a window, not as a one-liner — and not while NEW1's
tranche build is writing.

### Order of operations, and why

1. write the rollback record **before** any delete (`n2_fixture_removal_rollback`,
   full row JSON for judgments, citations, keys and checks)
2. re-verify all four markers at execution time — `MANIFEST_DRIFT` aborts
3. refuse on any advocate-owned dependent
4. clear the two NO ACTION blockers
5. delete by exact ID
6. **prove zero on all five predicates inside the same transaction**, and raise
   `REMOVAL_INCOMPLETE` rather than leave a partial state

---

## 5. One consequence LCC and NEW3 must decide on before this runs

Removing the sixteen changes what the corpus can demonstrate:

| `overruled_status` | total | fixtures | real |
| --- | ---: | ---: | ---: |
| `set_aside` | 76 | 3 | 73 |
| `partly_set_aside` | 11 | 3 | 8 |
| `doubted` | 17 | 0 | 17 |

The three fixtures are, per NEW3's 1170, **the only rows in the corpus where
`set_aside` describes an actual setting-aside**. The 73 real ones are
overrulings wearing the `set_aside` label — the OD-14 semantics LCC and NEW3
closed at 1169/1174.

So after removal, the `set_aside`-disables-add-to-matter path still has 73 rows
to exercise, but **not one of them is a genuine setting-aside**. That is not an
argument for keeping synthetic data in the corpus. It is an argument that the
refusal path needs a fixture **outside** the production corpus before the
fixtures inside it are deleted, and that is RCC/LCC test-infrastructure work,
not a data decision.

`FIXTURE_DRIFT` in NEW3's ten-matter regression will trip when these rows go.
That is by design and NEW3 is told before, not after.

---

## 6. State

| item | state |
| --- | --- |
| manifest | **`PROVEN`** — 16 IDs, two safe predicates agreeing, 0 partial-marker rows |
| dependents | **`PROVEN`** — 39 rows, 22 constraints enumerated, 0 advocate-owned |
| removal path | **`PASS_AT_MEASURED_SCOPE`** — dry-run proves zero, then rolls back |
| execution | **`PREPARED_NOT_EXECUTED`** — waits on LCC's `citation_checks` choice and a quiet window |
| FIFTH's post-check | the five predicates in §4 are the ones to re-run; all must read 0 |
