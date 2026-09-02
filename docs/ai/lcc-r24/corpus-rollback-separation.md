# LCC R24 — a corpus rollback DOES roll back user data, and now it refuses to

Gate C requires: **corpus rollback must not roll back user/matter data.** Nothing
checked it. On the current single shared database it is false, and this round
proved that non-destructively and then made the tool refuse.

## The tooling that already exists, reused rather than rebuilt

| purpose | tool | state |
| --- | --- | --- |
| corpus release export | `services/api/src/ops/release-export-cli.ts` | `SERVING_TABLES` enumerates 7 corpus tables and **no user table** — `judgments`, `judgment_citations`, `judgment_judges`, `judgment_statute_refs`, `statutes`, `statute_sections`, `lexeme_document_frequency` |
| corpus restore + verify | `services/api/src/ops/release-restore-cli.ts` | manifest + per-table checksum, topological load order, trace to `RESTORE_TRACE.jsonl` |
| rehearsal pack | `docs/ai/fifth/release-rehearsal-0091/` | `MANIFEST.json`, `MANIFEST.sha256`, `.copy` files |
| bounded restore proof | `scripts/fifth-bounded-restore-proof.mjs` | drives the restore CLI |
| offsite backup / restore proof | `scripts/lcc-moat-backup.mjs`, `scripts/lcc-offsite-restore-proof.mjs`, `scripts/backup-pack-shape.test.mjs` | |

The export set is the good news: **the release cannot carry user data, because
the list is enumerated rather than derived.** The gap is not in what is exported.

## The gap: `TRUNCATE … CASCADE`

`release-restore-cli.ts` runs, per manifest table, `TRUNCATE <table> CASCADE`.

`CASCADE` there does **not** mean "follow the foreign key's `ON DELETE` rule". It
means *also truncate every table that references this one*, and PostgreSQL
applies it regardless of `ON DELETE NO ACTION`. `NO ACTION` protects a DELETE. It
does not protect a TRUNCATE.

**Proved in a rolled-back transaction on disposable temp tables — nothing real
was touched, and `judgments` was never locked:**

```
child FK … REFERENCES z_corpus(id) ON DELETE NO ACTION
rows in the child before TRUNCATE z_corpus CASCADE   2
rows in the child after                              0
NOTICE: truncate cascades to table "z_user"
```

**Dry run against the live schema** (read-only, `pg_constraint` only —
`docs/ai/lcc-r24/corpus-rollback-cascade-dryrun.json`): restoring the 7-table
release would additionally empty **22 tables**, among them

- `matter_authorities` — the authorities an advocate saved to a matter, i.e. the
  retention moat, reached through **both** `judgments` and `citation_checks`;
- `judgment_annotations`, `alerts`, `citation_checks`, `citation_copies`,
  `citation_disputes`, `verification_cache`;
- and, worth naming separately because they are corpus data the pack does **not**
  contain, `judgment_chunks` and `judgment_paragraphs` — the entire dense index
  and the byte-exact paragraph evidence. A restore would have deleted both and
  reported `RESTORE VERIFIED`, because verification only checks the tables in the
  manifest.

## The refusal

`services/api/src/ops/cascade-guard.ts` computes, from the target's own
`pg_constraint`, the transitive set of tables outside the release that
`TRUNCATE … CASCADE` would empty. `release-restore-cli.ts` calls it **before the
first TRUNCATE** — the last point at which refusing is still free — and aborts
with the list unless `--allow-cascade-into` is passed.

The walk is transitive on purpose: `matter_documents → matter_authorities →
judgments` is emptied by the same TRUNCATE, and a one-hop guard would have
printed a list that was true and incomplete, which an operator would read as the
whole exposure.

**On a correct remote-alpha corpus database the guard finds nothing**, because
those tables are not there to be cascaded into — so it is silent in the intended
configuration and loud only on a shared one. That is exactly the distinction Gate
C needs, and exactly the one nothing checked before.

Six unit cases in `cascade-guard.test.ts`; the CLI is not imported by them,
because it calls `main()` at import and a test that imported it would run a
restore.

## Still open

`USER_DB_RESTORE_DRYRUN = NOT_AVAILABLE`. There is corpus export/restore tooling
and there is offsite backup tooling, but **no user/matter backup-and-restore path
exists at all** — no script writes `users`, `matters`, `matter_authorities`,
`documents`, `judgment_annotations`, `drafts`, `briefings`. Gate C's separation
property has two halves and only the corpus half is built. That is a gap, not a
defect, and it is named here so it is not discovered during the alpha.
