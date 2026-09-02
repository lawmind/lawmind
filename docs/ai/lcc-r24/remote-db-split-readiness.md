# LCC R24 — REMOTE_DB_SPLIT, read from the code and the catalogue

No database was provisioned. Nothing here is a projection; every number is read
from `services/api/src`, from `pg_constraint` on the live local database, or from
a rolled-back transaction.

## `REMOTE_DB_SPLIT = NOT_SUPPORTED`

**One runtime URL.** `services/api/src/index.ts` builds everything from
`env.databaseUrl()` — `createDatabase(env.databaseUrl())` and
`createPools(env.databaseUrl(), …)`. `env.ts` exposes exactly one:
`databaseUrl: () => required('DATABASE_URL')`. There is no second variable, no
role parameter and no second handle.

**The two pools are a workload split, not a data-role split.** `pools.ts` divides
CORE (8 connections, 10 s statements — auth, matters, judgments, citations,
admin, health) from RESEARCH (6 connections, 15 s, admission-gated). Both are
`postgres(url, …)` over the **same** `url`, and CORE serves corpus reads
(`unpopulatedCategories`, `derivedEffects`) and user writes (`searches`,
`citation_checks`) alike. It is a good split and it is not this one.

Some CLIs already read `CORPUS_DATABASE_URL` (`citations/propagate-cli.ts`,
`admin/*-cli.ts`). **The serving API does not.** A CLI convention is not runtime
support and must not be reported as it.

## What makes it NOT_SUPPORTED rather than PARTIALLY_SUPPORTED

Route wiring alone would be easy — every route takes its `Sql` by injection from
`createApp`, so a second role handle is a change at `createPools`, `index.ts` and
`app.ts` and touches no route body. **The blocker is that the two roles are
joined inside single SQL statements and bound by foreign keys**, and neither
survives two Postgres instances.

**Cross-role foreign keys, from `pg_constraint`** — user/matter child → corpus
parent:

```
alerts.judgment_id              -> judgments
citation_checks.judgment_id_matched -> judgments
citation_copies.judgment_id     -> judgments
citation_disputes.judgment_id   -> judgments
judgment_annotations.judgment_id-> judgments   (ON DELETE CASCADE)
matter_authorities.judgment_id  -> judgments
verification_cache.judgment_id  -> judgments
```

**Cross-role JOINs in serving code** — nine statements across eight modules:
`matters/authorities.ts` (×3), `premium/preview.ts`, `alerts/route.ts`,
`briefings/route.ts`, `citations/check.ts`, `citations/recheck.ts`,
`documents/route.ts`, `judgments/annotations.ts`. Each one reads live
`overruled_status` from `judgments` beside a user-owned row — which is not
incidental: `CITATION_HARNESS.md` requires overruled status to be read live at
render on every surface, so these joins are the rule being obeyed, not a
shortcut.

## Minimal implementation handoff, for the day remote spend is authorised

1. **`env.ts` + `pools.ts`**: `CORPUS_DATABASE_URL` and `USER_DATABASE_URL`,
   each defaulting to `DATABASE_URL` so a single-database deployment is
   unchanged. `createPools` returns `{ corpusCore, corpusResearch, userCore }`.
2. **`app.ts`**: hand each route family the handle for its role. No route body
   changes; the injection already exists.
3. **The nine cross-role JOINs**: replace each with a two-step read — user rows
   from the user database, then `judgments … WHERE id = ANY($ids)` from the
   corpus database, merged in TypeScript. `derivedEffects` and `search/route.ts`
   already have exactly this shape (`ids` → one indexed corpus read → `Map`), so
   this is a pattern already in the codebase rather than a new one.
4. **The seven cross-role foreign keys**: they cannot exist across instances.
   Each becomes an application-level invariant plus a reconciliation job. This is
   the part that needs a written decision, because dropping an FK means a
   `matter_authorities` row can outlive its judgment — and the product answer to
   that (refuse, tombstone, or hide) is NEW3's, not LCC's.
5. **A configuration preflight** that refuses to boot when the two URLs resolve
   to the same host while the deployment claims to be split. Deliberately NOT
   written this round: it would be a guard for a configuration shape that does
   not exist yet, and `CLAUDE.md` §6.4.2 forbids error handling for impossible
   cases. It belongs with step 1, in the same commit.

Steps 1–3 are mechanical and testable. Step 4 is a founder/NEW3 decision. **The
split is not a Gate-C-week task and should not be planned as one.**

## Never claimed

Logical FK separation in the single local development database proves nothing
about physical remote separation, and this round asserts nothing of the kind.
The classification above rests on there being one runtime URL — a fact about
`env.ts`, not an inference from schema shape.
