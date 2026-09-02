# LCC R25 — the corpus/user split, built and proved locally

`HEAD_START = 75a84804`. Implements NEW3 R20's frozen Gate-C boundary (bus 1723):
`CROSS_DB_REFERENCE_MODEL = SOFT_CORPUS_REFERENCE` and
`CORPUS_RELEASE_MODEL = IMMUTABLE_BLUE_GREEN_CORPUS_GENERATION`.

No paid infrastructure was created. No network resource was created. Every
database used here is local and disposable, and every one was dropped.

## The ownership map, and the invariant that made it checkable

`services/api/src/ops/db-roles.ts` classifies **all 102 live tables** explicitly.
Unknown resolves to `user`, because the two failures are not symmetric: a corpus
table wrongly called `user` means a release does not carry it, which is loud and
destroys nothing; a user table wrongly called `corpus` means a rollback TRUNCATEs
an advocate's saved authorities, which is silent.

The map is asserted against `pg_constraint`, and **the assertion refuted two of
its own entries on the first run**: `ecourts_transition` references `matters`,
and `ocr_jobs` references both `matters` and `users`. Both had been classified as
corpus acquisition machinery; both are user data — an advocate's monitoring
events, and the OCR of an advocate's uploaded document, which is
sensitive-class. `CORPUS -> USER` foreign keys are now **0**.

## Cross-role foreign keys: 10, not 7

R24 reported 7. That count came from the user tables it already knew about.
Measured from the catalogue at HEAD, the full `USER -> CORPUS` set was **10**:

```
alerts.judgment_id                       -> judgments
citation_checks.judgment_id_matched      -> judgments
citation_copies.judgment_id              -> judgments
citation_disputes.judgment_id            -> judgments
citation_fanouts.judgment_id             -> judgments
judgment_annotations.judgment_id         -> judgments   (ON DELETE CASCADE)
matter_authorities.judgment_id           -> judgments
verification_cache.judgment_id           -> judgments
ecourts_transition.from_observation_id   -> ecourts_observation
ecourts_transition.to_observation_id     -> ecourts_observation
```

Migration `0102_soft_corpus_references.sql` drops all ten. **Not one row of user
data is written, moved or marked** — R20 forbids it, and the migration touches
constraints only.

**All ten columns were already indexed**, verified from `pg_index` rather than
assumed, so every soft reference is an INDEXED soft reference from the moment the
constraint goes and no lookup got slower. PostgreSQL never creates an index for a
foreign key, so none of these was a side effect of the constraint.

`CROSS_ROLE_FKS_BEFORE = 10` · `CROSS_ROLE_FKS_AFTER = 0`.

The one behaviour deliberately removed: `judgment_annotations`' `ON DELETE
CASCADE`. Under one database that was a tidy invariant. Under the blue-green
release model it is a data-loss bug waiting for its first rollback, because a
judgment absent from the newly activated generation has not ceased to exist.

## Cross-role JOINs: 8, not 9, and all of them gone

Detected by scanning every `sql` template in `services/api/src` for a statement
naming both a corpus and a user table — including FROM clauses assembled from
interpolated constants, which is how `matters/authorities.ts` builds its two.

```
admin/citations.ts        citation_checks  x judgments
alerts/route.ts           alerts           x judgments
citations/check.ts        citation_checks  x judgments
citations/recheck.ts      citation_checks, judgment_annotations, matters x judgments, judgment_citations
documents/route.ts        citation_checks  x judgments
matters/authorities.ts    matter_authorities x judgments   (x2)
premium/preview.ts        matter_authorities x judgments
```

Each is now: query the owning database, collect stable ids, ONE batched read of
the other (`= ANY($ids)`), deterministic merge in the application, ordering
preserved by iterating the user rows. `judgments/hydrate.ts` holds the shared
read. No N+1, no distributed transaction, no `postgres_fdw`, no `dblink`, no
shadow corpus table.

`CROSS_ROLE_JOINS_BEFORE = 8` · `CROSS_ROLE_JOINS_AFTER = 0`.

**One conversion changed a number before it was caught.** `admin/citations.ts`
counts CHECK ROWS per overruled status; grouping the corpus side instead counts
each judgment once, which is a smaller, different number that still looks like a
plausible monitor. The user side keeps its per-row grain and the sum happens in
the application.

## Two clients, and a guard that asks the servers rather than the URLs

`CORPUS_DATABASE_URL` and `USER_DATABASE_URL`, each defaulting to
`DATABASE_URL`, so **no existing deployment and no developer needs a new
variable**. `db-split.ts` resolves them; `pools.ts` gives the corpus role both
workload queues (that is where the rankers are) and the user role one.

`DB_SPLIT_MODE=split` refuses to start when the two resolve to one database, and
the comparison is on host / port / database name rather than the URL string —
`postgres://u:p@host-a/lawmind` and `postgres://u:p@HOST-A:5432/lawmind?sslmode=require`
are one database and two strings.

That check is syntactic and cannot see the failure that actually happens in a
managed environment: **two hostnames resolving to one server.** So in split mode
the two handles are asked `(pg_control_system().system_identifier,
current_database())` — the cluster's data directory plus the database inside it,
which is precisely the scope a `TRUNCATE` has. Proved: `127.0.0.1` and
`localhost` against the same database are correctly reported as NOT distinct.

`PROD_SAME_DB_GUARD = FAIL_CLOSED_AT_STARTUP`.

## Physically distinct databases, not two schemas

`services/api/src/ops/db-split-physical.test.ts` creates two disposable databases
with `TEMPLATE template0` and runs the one experiment that cannot be argued with.

- `lawmind_corpus_split_test` and `lawmind_user_split_test`, distinct
  `current_database()`, verified from the servers.
- **A cross-database FOREIGN KEY cannot even be created** — `relation "judgments"
  does not exist`. That is why migration 0102 exists; it is not a policy choice.
- **`TRUNCATE judgments CASCADE` in the corpus database left the user table's row
  intact.** Corpus rows after: 0. User rows after: 1.
- The saved authority survives its target vanishing and stays readable.

`PHYSICALLY_DISTINCT_DB_TEST = PASS` (6/6).

## Blue/green corpus generations

`scripts/lcc-corpus-bluegreen-proof.mjs` ·
`docs/ai/lcc-r25/corpus-bluegreen-proof.json`

Export a bounded release through the existing `release-export-cli.ts`, dump the
schema once, create three disposable databases from `template0`, restore the SAME
pack into two generations, then switch the corpus role between them.

```
restore CORPUS_A   200 judgments   RESTORE_VERIFIED   userTablesReachable: []
restore CORPUS_B   200 judgments   RESTORE_VERIFIED   userTablesReachable: []
active A           4 saved authorities, 3 resolved, 1 corpus_unavailable
switch A -> B      4 saved authorities, 3 resolved, 1 corpus_unavailable
rollback B -> A    4 saved authorities, 3 resolved, 1 corpus_unavailable
USER_DATA_UNCHANGED   changedTables: []
```

The user database is checked by an **ordered `md5` over the full content of every
table**, not by a row count. A count answers "was anything deleted"; it cannot see
a `removed_at` quietly stamped on a saved authority, and R20 forbids rewriting as
firmly as deleting.

`TRUNCATE_CASCADE_USED_FOR_RELEASE = NO` for the model: activation is a pointer
switch and nothing is restored in place. The R24 cascade guard stays and still
refuses; the proof passes `--allow-cascade-into` only against a database created
seconds earlier from `template0`, where every table is empty.

**The cascade guard's victim list is now entirely corpus tables.** 13 of them —
`judgment_chunks`, `judgment_paragraphs`, `judgment_citation_keys` and so on —
and **zero user tables**, asserted in the proof. Before migration 0102 that list
held `matter_authorities`, `judgment_annotations`, `alerts`, `citation_checks`,
`citation_copies`, `citation_disputes` and `verification_cache`: the retention
moat and everything beside it.

**What this does not claim.** The live corpus is 328 GB and this box has 237 GB
free, so the two generations hold a bounded 200-judgment release. What is under
test is the SWITCH and the ISOLATION, and neither is a function of corpus size —
the user database's exposure to a corpus rollback is identical at 200 judgments
and at 18 million. A full-size restore is not evidenced here and is not claimed.

## USER_DB_RESTORE_DRYRUN is no longer NOT_AVAILABLE

`scripts/lcc-user-backup.mjs` · `docs/ai/lcc-r25/user-restore-proof.json`

`pg_dump -Fc` of the 44 user-role tables -> `CREATE DATABASE ... TEMPLATE
template0` -> `pg_restore` -> verify. Run, and verified:

- **65,549 rows across 44 tables, every per-table count exact.**
- All seven tenant-ownership invariants clean (matter ownership, owner existence,
  authority-to-matter, event-to-matter, annotation authorship, document-to-matter,
  idempotency uniqueness).
- **0 corpus rows in the restored user database.**
- dump 627 ms · restore 960 ms · `user-data.dump` sha256
  `ae9c62116d11b3a5c9ec8e1db94bace1ac9d14996a27d92ac3de79c97700159e`

The restore target is always a NEW database. `--force` onto the source is not
offered: restoring over the source would make the rehearsal the disaster it
rehearses for.

**A finding that generalises to any restore path.** The first run aborted at the
first table:

```
COPY failed for table "users": ERROR: relation "workspaces" does not exist
QUERY: INSERT INTO workspaces (owner_user_id, kind) VALUES (NEW.id, ...)
CONTEXT: PL/pgSQL function public.ensure_personal_workspace()
```

**A restore must reproduce the rows that were dumped, not re-run the business
logic that produced them.** Fourteen user-defined triggers exist on this schema
and several are worse than that one: `audit_log` carries no-update and
no-truncate guards, and `ecourts_observation` and `official_source_artifact` each
carry a no-update guard — protections against a live process that are exactly
wrong during a load. `--disable-triggers` is now used.

The table list is read from `db-roles.ts` rather than restated, and the schema is
dumped WITHOUT `-t` before the data is dumped WITH it, because `pg_dump -t` omits
the enum types the tables depend on — a failure this repository has already
recorded, and one that only shows up at restore.
