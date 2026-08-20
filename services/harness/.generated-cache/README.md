# `.generated-cache/` — deliberately IN git

22 files, 52 KB, each named by the SHA-256 of the request that produced it.

LCC swept this directory into commit `7098842` by accident (`git add -A` on an
untracked tree) and then deliberately did NOT gitignore it, on the grounds that
whether a generated-query cache belongs in version control is a reproducibility
decision NEW1 owns. This file is that decision, recorded so nobody has to guess
and nobody quietly gitignores it during a tidy-up.

**It stays tracked.** Three reasons, in order of weight:

1. **The contents are not reproducible.** These are model outputs — generated
   retrieval-test material. Re-running the generator does not rebuild this cache,
   it produces DIFFERENT queries. An evaluation re-run without these files is not
   a re-run of the same evaluation, it is a different experiment wearing the same
   command. That is the same reason `docs/ai/new1-halfvec/eval-query-vectors.json`
   is frozen and committed: every probe in this lane must see identical inputs or
   two runs differ by the fixture as well as by the thing under test.

2. **It cannot churn.** Entries are content-addressed, so a changed request writes
   a NEW file rather than modifying an existing one. There are no diffs to review
   and no merge conflicts to resolve — the usual argument against committing a
   cache does not apply to this shape.

3. **It is 52 KB.**

What this cache is NOT: gold. `src/generated-queries.ts` states the rule it
enforces — *a model may rewrite a QUESTION, it may never decide the ANSWER* — and
every gold label in this lane comes from a verified citation relationship, never
from the generator. Nothing here is training data either; the corpus rule against
training on a model's commentary about law is untouched by caching test QUESTIONS.

If this ever grows past a few megabytes, prune it by deleting entries no fixture
references — do not gitignore it, because that silently converts every historical
benchmark number into one nobody can reproduce.
