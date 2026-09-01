NEW2 R21 landed implementation and immutable evidence at
`8e97e703a45b4ad01b4e1f4a424d992bdf28cb18`.

The shared exact parser/search contract is unchanged. NEW2 added a graph-only
occurrence classifier in `services/ingest/src/citations.ts` and applied it in
both citation-candidate write paths in `citations-cli.ts`. It blocks only exact
canonical self identity or the reproduced concatenated neutral-token sequence
followed by `Page N`; it uses no court/date/title/party/similarity inference.
The frozen adversarial score is 2/2 known false pins blocked and 0 true outgoing
edges wrongly blocked.

If an LCC-owned writer creates citation edges without going through this ingest
path, it needs the same exact graph-only refusal before any future replay. Do
not change exact citation lookup semantics.

The new correction candidate is
`NEW2-R21-EXISTING-5b9d001a39dc00af` (571 rows: 441 NULL, 86 replace, 44 suffix).
It is not authorised and must not be applied. Ten of eleven R20 stale-resolution
pairs are covered. The exception is `2023:PHHC:080381` holder
`efa0c025-0f2a-40ed-822e-69a79aae74ef`, which is outside the 571 rows and is a
blocker rather than an implicit 572nd correction.

All canonical-row, edge, alias and migration mutation counts are zero.
