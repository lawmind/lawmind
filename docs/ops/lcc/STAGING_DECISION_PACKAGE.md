# STAGING — THE SERVER-SIDE INPUTS · **FOUNDER_APPROVAL_REQUIRED**

**LCC, 23 August 2026.** Nothing here has been bought, provisioned, or activated.

> **This is NOT a second staging proposal.** `docs/ops/STAGING_PACKAGE_PROPOSAL_2026.md`
> (NEW3, same day) is the package — provider, region, machine class, storage,
> DNS, secrets, backup, migration, cost. It found a real Hetzner price
> discrepancy (€157 vs €259) and a real conflict with OD-2's recorded Singapore
> position, and both belong to the founder.
>
> **Two staging documents with two recommendations is the failure mode, not the
> deliverable.** This one carries only what the server lane measured and NEW3
> could not: what is actually in the database, what must be carried, and what has
> and has not been proved about moving it. Where I would decide differently, §4
> says so as a decision input rather than as a rival recommendation.

---

## 1. The measurements

From the live database, 23 Aug 2026 — `pg_database_size`,
`pg_total_relation_size`, `pg_extension`:

| fact | measured |
| --- | --- |
| Postgres | **18.6** |
| Extensions | **pg_trgm 1.6 · vector 0.8.5 · plpgsql 1.0** |
| Total database | **291 GB** |
| `judgments` | **151 GB** |
| `judgment_paragraphs` | **92 GB** |
| `judgment_chunks` | 9,355 MB |
| `judgment_citations` | 5,283 MB |
| `judgment_citation_keys` | 325 MB |
| `judgment_date_quality` | 404 MB |
| Curated backup pack | **1.533 GB** compressed · 85 s to dump · **820.7 s to restore and verify** |

**The 291 GB is the wrong number to size a machine against, and this is the
single most useful thing in this document.** Two tables are **83%** of the total
and both are REBUILDABLE from the source corpus — which is exactly why the
curated backup pack excludes them. What must be *carried* to a new host and what
must be *rebuilt* on it are different quantities with different costs:

- **carry**: the curated pack, **1.533 GB**, proven restorable
- **rebuild**: `judgments` + `judgment_paragraphs`, 243 GB, from the corpus
- **re-derive**: the vector and GIN indexes, timing UNMEASURED (see §3)

A further **~10.9 GB** of `new1_*` tables is another lane's working set, not
production data, and should not appear in any sizing.

---

## 2. What the server needs the host to have

Not a machine class — the inputs a machine class has to satisfy.

| requirement | why, in one line |
| --- | --- |
| `vector` extension, ≥ 0.8.5 | HNSW indexes on `judgment_chunks`; the schema will not restore without it |
| `pg_trgm` | every case-title search; migration `0052` indexes on it |
| Postgres **18.x** | current is 18.6; a lower major will not accept the dump |
| RAM ≥ working set of the HNSW index | an ANN index that does not fit in RAM is a disk-seek per probe |
| Private networking between API and DB | no public Postgres port, `DEPLOYMENT.md` §Secrets |
| A disposable second database | the restore proof needs somewhere to restore INTO |

---

## 3. What is proven and what is not — the important half

| claim | state |
| --- | --- |
| The curated pack dumps deterministically with a manifest and per-file sha256 | **PROVEN** |
| It restores into a disposable database and verifies | **PROVEN — 820.7 s**, 31 of 34 tables exact including 22,322,047 citation rows, content checksum match |
| `pg_dump -t` omits enum types, so an enum-bearing table fails to restore | **PROVEN, the hard way** — 6 tables failed the first rehearsal; fixed |
| The **291 GB corpus database** restores anywhere | **NOT PROVEN. Never attempted.** |
| Index rebuild time on a fresh host (GIN, pg_trgm, HNSW) | **NOT MEASURED** |
| Search returns equivalent results after a restore | **NOT PROVEN** |
| Rollback | **NOT PROVEN** for anything but the pack |
| India RTT | **NOT MEASURED, and not measurable from this machine** |

The last one is not laziness. Every "expected ~120 ms" in a document like this is
somebody's memory of a different product, and a guessed latency is worse than an
absent one because it gets quoted. **It needs one person on an Indian connection
running one timed request** — `FQ-INDIA-RTT`.

---

## 4. Where I would decide differently, as an input to NEW3's package

Recorded so the founder sees both sides, not to overrule NEW3's document.

**On region.** NEW3 is right that Hetzner has no Singapore or India region and
that this conflicts with OD-2's recorded Singapore position. I would weight that
higher than the price advantage: OD-2 is a *resolved* decision with a DPDP
deadline (13 May 2027) attached, and re-opening it to save money is the kind of
trade that reads badly in exactly the situation it would matter. **Neither of us
may resolve it — it is an OPEN_DECISION.** `FQ-STAGING-REGION`.

**On what to move first.** The 291 GB figure makes a dedicated 128 GB-RAM box
look necessary. §1 says most of it is rebuildable. **The decision that should
come BEFORE the machine decision is whether full judgment text is served from
Postgres at all, or from object storage with Postgres holding metadata and
vectors.** That single choice moves the sizing from ~291 GB to ~40 GB and changes
which machine classes are even in the comparison. It is a product/cost
trade-off, not a hosting one — `FQ-STAGING-CORPUS-SIZE`.

**On the Railway cap.** The account carries a **$75 hard limit**, already
recorded. That cap, not a preference, is what makes the sizing decision above the
load-bearing one in either package.

---

## 5. Founder items this document raises

| id | needs | why not mine |
| --- | --- | --- |
| `FQ-STAGING-REGION` | OD-2: Singapore as resolved, or EU for the price | an OPEN_DECISION plus counsel's written residency view, still owed |
| `FQ-STAGING-CORPUS-SIZE` | full text in Postgres, or in object storage | a product/cost trade-off that decides the machine |
| `FQ-INDIA-RTT` | one timed request from an Indian connection | cannot be measured from this machine |
| `FQ-STAGING-APPROVE` | approval to provision anything | money |
