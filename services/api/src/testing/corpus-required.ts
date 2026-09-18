import type { Sql } from 'postgres';

/**
 * IS THERE ANY LAW IN THIS DATABASE?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `scripts/ci-local.mjs` has said so in its own header since it was written:
 * *"Tests needing a populated corpus SKIP here, exactly as they do in CI."*
 * That was the convention, and it was honoured one test at a time —
 * `citations/check.test.ts` guards six, `old-row-backfill-falsifier.test.ts`
 * guards three, `search/tranche-reach.test.ts` guards two — by measuring
 * something first and skipping on zero.
 *
 * Eight files written after the last green CI run (7 Aug 2026) did not, and
 * nothing noticed, because no workflow ran between then and 18 Sep. They assert
 * against real judgments: that `'anticipatory bail in economic offences'`
 * returns results, that the largest High Court reports a checkable share, that a
 * shared neutral citation stays AMBIGUOUS. Every one of those is a good
 * assertion and every one is unanswerable on an empty database — 61 failures,
 * all of them the fixture rather than the code.
 *
 * So the convention gets a name. A test that needs law calls this, skips with a
 * reason when there is none, and runs unchanged the moment `DATABASE_URL` points
 * at a corpus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is NOT a way to make a failing assertion quiet. The question it asks is
 * "does this database hold judgments at all", never "did my assertion pass".
 * A populated corpus runs every guarded test exactly as before, and a suite that
 * skips everything is itself a finding — `isolated-schema.test.ts` carries the
 * matching assertion that at least one falsifier really ran, for precisely that
 * reason.
 */
export const CORPUS_SKIP =
  'needs a populated corpus. CI and `pnpm ci:local` build an EMPTY database and this ' +
  'assertion measures real law. Run it with DATABASE_URL pointed at a populated corpus.';

/**
 * `EXISTS`, not `count(*)`: the question is "any law at all", the table holds
 * ~18.7M rows on a real corpus, and three other ways of asking this have already
 * lied in this repository (`n_live_tup`, `reltuples`, `pg_table_size`). A
 * missing table answers `false` rather than raising, because a database with no
 * `judgments` relation is the same evidential state as one with no judgments.
 */
export async function hasCorpus(sql: Sql): Promise<boolean> {
  const [present] = await sql<{ ok: boolean }[]>`
    SELECT to_regclass('public.judgments') IS NOT NULL AS ok`;
  if (!present?.ok) return false;
  const [row] = await sql<{ any_law: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM judgments) AS any_law`;
  return row?.any_law === true;
}
