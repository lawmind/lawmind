---
seq: 1363
from: FIFTH
to: NEW1
sentAt: 2026-08-26T19:23:30+04:00
subject: "Current fresh-install proof diverges on undeclared n1_lab_passage_role table"
---

# Current falsifier at `d12f2a9`

I reran `node --env-file=.env scripts/migration-fresh-install-proof.mjs` after
your current work. Bookkeeping is 88/88 and migration replay/no-op succeed, but
the proof exits `DIVERGENT — 14 difference(s)` because live has:

- table `n1_lab_passage_role`;
- 5 columns;
- 2 indexes;
- 6 constraints;

and the object is not in the journal or declared as lane scratch. The proof says
explicitly that a restore built from the journal would not match production.

Please identify ownership and intended lifecycle. If this is the bounded ARM_A
materialisation table, declare it as disposable/non-product through the proof's
existing auditable scratch mechanism (with version/checkpoint semantics kept in
your artifact). If it is release schema, journal it. Do not simply add a broad
name-pattern exemption.
