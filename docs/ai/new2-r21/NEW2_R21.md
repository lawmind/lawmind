# NEW2 R21 — correction truth and common-order false-pin guard

## Verdict

R21 produced a new immutable **CORRECTION_CANDIDATE** and applied nothing. The
candidate is `NEW2-R21-EXISTING-5b9d001a39dc00af`, hash
`5b9d001a39dc00af830335a14772d1d039cd38a4826601e34ba787c9eccc80b0`.
It contains 571 protected rows: 441 deterministic NULLs, 86 deterministic
replacements, and 44 deterministic DB/FB suffix replacements. There are zero
ambiguous or untestable rows inside the candidate.

This is not an apply population, an authorised population, or safe-to-apply.
`CITATION_BULK_APPLY = HOLD`; final independent falsification has not run.

## Start state and immutable inputs

- `HEAD_START = 5e0eb8c1ac24684d761b39544f23d1f73886f5d3`.
- The working tree was heavily dirty with other lanes' work. R21 touched only
  NEW2-owned ingest/parser/evaluation code and `docs/ai/new2-r21/**`.
- `d396d95d`, `90547174`, `c15b2aac`, and `5e0eb8c1` were all ancestors of the
  starting HEAD.
- R19 recomputed as
  `cbb193df4e42269e952dcc8236ebf5ff4afc0659118699b801fb3cd316400d84`.
- R20 recomputed as
  `3cc2c5452e49a9232e33e476674ca9f4c2f68701b178d2c3a7e658b636ce3c34`.
- NEW1 and HEAVY_BOX remained held and progressing. R21 neither acquired the
  box nor interrupted a worker.

## Seven PHHC corrections

The independent result was not used as a row selector. R21 evaluated all eight
PHHC suffix-quarantine rows using retained evidence. Seven had neither own CNR
nor own case-number adjacency and their source windows explicitly attributed
both the stored unsuffixed value and printed suffixed value to a precedent
(M/s Bansal Casting or Rakesh Das). Those seven are now
`CURRENT_FALSE_OWN_NULL_CONFIRMED` and move from suffix replacement to
deterministic NULL. The eighth row has its own case number immediately beside
the print and remains `SUFFIX_REPLACEMENT_CONFIRMED`.

The exact rows and source windows are frozen in `seven-false-suffix.json`.

## Graph-only common-order guard

The shared parser remains correct and unchanged: it still extracts the exact
printed `2025:MLHC:405-DB` and `2025:MLHC:384-DB` tokens. The correction is
strictly downstream in graph-candidate interpretation:

1. exact canonical self identity is not an outgoing edge; and
2. a neutral token in an exact directly-concatenated neutral-token sequence
   followed by a `Page N` line is classified as common-order page furniture.

No court/date/title/party/semantic similarity participates. The adversarial set
blocked both known false pins and wrongly blocked zero true outgoing edges.
Exact citation search semantics remain unchanged.

The 405 census found 26 holder rows and 26 distinct CNRs for the unsuffixed key.
This is a connected-matter fan-out, not duplicate ingestion. An explicit
`COMMON_ORDER_FANOUT` class is required; identities must not be collapsed.

## R20 follow-up and separate grammar blocker

Ten of R20's eleven `NO_LONGER_RESOLVES` pairs are fully covered by R21 suffix
corrections. `2023:PHHC:080381 -> 2023:PHHC:080381-DB` is the exception: holder
`efa0c025-0f2a-40ed-822e-69a79aae74ef` is outside the 571-row candidate. It is
a blocker and was not silently added as row 572.

The separate leading-boundary defect remains measure-only. Both retained R20
tails and a fresh full-text scan reproduce 37 rows and 88 occurrences, but only
21 literal distinct second-token values. This contradicts the supplied count of
29. R21 freezes the actual universe as
`NEW2-R21-LEADING-a1ec85dbce2d9ed0` and records `29 claimed / 21 reproduced`;
it does not change the leading-boundary grammar.

## Write-time refusal contract

The manifest protects the population hash, all 571 row identities, old values,
source identities, source/content hashes, 100 proposed citation keys and their
holder sets, plus the frozen ingest frontier
`2026-08-31 14:09:11.196548+00 | b66f80ad-7cea-4d85-bd94-b8980ad30873`.
The unchanged snapshot passes. Altered old value, missing row, changed source
hash, and population-hash mismatch all refuse (4/4). No transaction is opened
and no mutator exists in this round.

## Continuous data truth

The indexed read found zero judgments created after R20's key-space timestamp.
Current accounted percentage and actually-held percentage remain `UNKNOWN`
because no same-denominator parity walk was run while NEW1 held HEAVY_BOX.
The latest completed daily receipt is preserved verbatim in
`continuous-data.json`: HC newest upstream write 2026-08-31, local decision
2026-08-29; SC newest upstream write 2026-08-30, local decision 2026-08-04;
latest receipt outcome `ok`, with no clustered failures reported. Older parity
and later receipt holder counts are not converted into each other.

## Verification

- R21/citation/R20 focused ingest tests: 103/103 passed.
- Pure shared citation/search regressions: 161/161 passed.
- Ingest and API package typechecks: pass.
- Exact owned source lint passed; the new standalone R21 source files pass the
  format check. Existing touched citation files retain their baseline formatting
  to avoid unrelated mechanical churn.
- A broader DB-backed API attempt could not authenticate to the local test DB.
  It was not pointed at live Postgres because those tests mutate fixtures and
  R21's live-DB authority is read-only. `verification.json` retains the counts.
- Citation harness was not run: external network was forbidden and HEAVY_BOX
  remained with NEW1.

## Mutation and authorization ledger

- Existing judgment rows changed: 0.
- Citation edges changed: 0.
- Aliases changed: 0.
- Migrations: 0.
- Final independent falsifier run: NO.
- Citation bulk apply: HOLD.
- Final apply authorization: NO.
- NEW1 interrupted: NO.

The internal candidate gate passes with `FALSE_NULL = 0`, `FALSE_REPLACE = 0`,
and `FALSE_SUFFIX_REPLACE = 0`, but that result is not independent authorization.

Implementation and immutable evidence landed at
`8e97e703a45b4ad01b4e1f4a424d992bdf28cb18`. Exact downstream handoffs are
retained in `lcc-handoff.md` and `new3-handoff.md` and published on the lane bus.
