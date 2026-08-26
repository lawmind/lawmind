/**
 * FIFTH's bus-1313 old-row mutation/backfill falsifier, run against HEAD.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT FIFTH PROVED, AND WHY IT WAS NOT A THRESHOLD PROBLEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On 26 Aug 2026, on the real `readKeyFreshness()` + `resolveBatch()` path:
 *
 *     {"before":"UNIQUE","state":"CURRENT","lagRows":0,
 *      "judgmentsClaimingCitation":2,"keyTableCandidates":1,
 *      "resolverState":"UNIQUE","because":[],"residue":0}
 *
 * Two judgments claim one citation; the resolver says exactly one; every gate
 * reports healthy. `lagRows` is 0 because the second judgment is genuinely NOT
 * above the builder's cursor — `created_at = cursor_at - interval '1 day'` — and
 * `MAX_LAG_ROWS` has no setting below zero that would have caught it.
 *
 * Migration `0087` records the fact instead of bounding it. This test is the
 * falsifier, kept, so the closure is re-provable rather than remembered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY SHAPE HERE ROLLS BACK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These run against the live corpus because that is the only place the real
 * frontier, the real index and the real resolver exist together. Each shape is
 * built inside `sql.begin()` and ends by throwing a sentinel, so the transaction
 * aborts and nothing survives it. The triggers under test fire inside that
 * transaction and their rows roll back with everything else.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';
import type { Sql } from 'postgres';

import { resolveBatch } from './resolver.ts';
import { readKeyFreshness } from './key-freshness.ts';
import { readDirtyWork } from './citation-key-dirty.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** Thrown to abort; never a real failure. */
const ROLLBACK = Symbol('rollback');

/**
 * A transaction handle, typed as `Sql` for the production functions under test.
 *
 * `TransactionSql` is structurally a subset of `Sql` — it lacks `END`, `CLOSE`
 * and the pool controls, deliberately, because a transaction may not end the
 * pool. Every function here uses it only to run queries. The cast is at the
 * boundary, once, rather than at each of the eight call sites.
 */
type TxAsSql = postgres.TransactionSql & Sql;

async function inRolledBackTx<T>(fn: (tx: TxAsSql) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx as TxAsSql);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return out as T;
}

/** A judgment whose neutral citation exactly one judgment in the corpus claims. */
async function pickUniqueNeutral(tx: TxAsSql) {
  const [row] = await tx<{ neutral_citation: string; id: string }[]>`
    SELECT j.neutral_citation, j.id
      FROM judgments j
     WHERE j.neutral_citation IS NOT NULL
       AND (SELECT count(*) FROM judgment_citation_keys k
             WHERE k.citation_key = upper(regexp_replace(j.neutral_citation, '[^A-Za-z0-9]', '', 'g'))) = 1
       AND (SELECT count(*) FROM judgments j2
             WHERE j2.neutral_citation = j.neutral_citation) = 1
     LIMIT 1`;
  return row ?? null;
}

describe('FIFTH bus 1313 — old-row backfill and mutation cannot leave a false UNIQUE', () => {
  after(async () => {
    await sql.end();
  });

  it('the dirty-work table is empty on a healthy system — the check is not passing by being always-on', async () => {
    const summary = await readDirtyWork(sql);
    // Non-vacuity in the other direction. If this table were permanently
    // non-empty the resolver would refuse every UNIQUE and the tests below
    // would pass while the product was broken.
    assert.equal(summary.open, 0, 'open dirty work on a quiet corpus means something is unrepaired');
    assert.equal(summary.overCap, false);
  });

  it('FIFTH exact shape: a colliding judgment BELOW the cursor no longer resolves UNIQUE', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const target = await pickUniqueNeutral(tx);
      if (!target) return null;

      const [frontier] = await tx<{ cursor_at: string }[]>`
        SELECT cursor_at::text FROM citation_key_frontier LIMIT 1`;
      if (!frontier) return null;
      const cursorAt = frontier.cursor_at;

      const before = (await resolveBatch(tx, [target.neutral_citation]))[0];

      // The falsifier, byte for byte as FIFTH described it: a second judgment
      // claiming the same neutral citation, stamped a full day BELOW the
      // builder's cursor, with no materialized key row. A monotonic keyset walk
      // can never reach it.
      const [twin] = await tx<{ id: string }[]>`
        INSERT INTO judgments
          (case_title, neutral_citation, reporter_citations, court, judgment_date,
           language, source_url, full_text, created_at)
        VALUES ('FIFTH 1313 FALSIFIER TWIN', ${target.neutral_citation}, '{}',
                'Supreme Court of India', '1999-01-01', 'en',
                'test://fifth-1313-falsifier', 'falsifier body',
                (${cursorAt}::text)::timestamptz - interval '1 day')
        RETURNING id`;

      const fresh = await readKeyFreshness(tx);
      const after = (await resolveBatch(tx, [target.neutral_citation]))[0];

      const [claimingRow] = await tx<{ n: string }[]>`
        SELECT count(*)::text AS n FROM judgments
         WHERE neutral_citation = ${target.neutral_citation}`;
      const [keyRow] = await tx<{ n: string }[]>`
        SELECT count(*)::text AS n FROM judgment_citation_keys
         WHERE citation_key = upper(regexp_replace(${target.neutral_citation}, '[^A-Za-z0-9]', '', 'g'))`;
      const dirty = await readDirtyWork(tx);

      return {
        twinId: twin?.id ?? null,
        beforeState: before?.state,
        afterState: after?.state,
        afterCandidates: after?.heldCandidates,
        freshnessState: fresh.state,
        lagRows: fresh.lagRows,
        because: fresh.because,
        judgmentsClaimingCitation: Number(claimingRow?.n ?? 0),
        keyTableCandidates: Number(keyRow?.n ?? 0),
        dirtyOpen: dirty.open,
        dirtyByReason: dirty.byReason,
      };
    });

    if (!outcome) return t.skip('no unambiguously unique neutral citation in this corpus');

    // The preconditions FIFTH reported are still true — the test is falsifying
    // the same thing, not a milder one.
    assert.equal(outcome.beforeState, 'UNIQUE', 'the citation must start out UNIQUE');
    assert.equal(outcome.judgmentsClaimingCitation, 2, 'two judgments now claim it');
    assert.equal(outcome.keyTableCandidates, 1, 'and the index still holds exactly one');
    assert.equal(outcome.lagRows, 0, 'the row is BELOW the cursor, so lag cannot see it');
    assert.equal(
      outcome.freshnessState,
      'CURRENT',
      'the threshold gate still reads CURRENT, and is right to by its own terms',
    );

    // The durable half: the trigger noticed what the cursor could not.
    assert.equal(outcome.dirtyOpen, 1, 'the insert below the cursor was recorded as dirty work');
    assert.equal(outcome.dirtyByReason['INSERT_AT_OR_BELOW_CURSOR'], 1);

    // And the claim is withdrawn — while the candidate is NOT.
    assert.equal(
      outcome.afterState,
      'UNIQUE_UNCONFIRMED_STALE_INDEX',
      'this is the line FIFTH found saying UNIQUE',
    );
    assert.equal(outcome.afterCandidates, 1, 'the authority is still returned; only "only" is gone');
  });

  it('mutation of an already-walked row is caught too — the other half of 1313', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const target = await pickUniqueNeutral(tx);
      if (!target) return null;

      // A judgment the builder walked long ago, given the citation a moment
      // later. Its `created_at` never moves, so no frontier question can see it.
      const [victim] = await tx<{ id: string }[]>`
        SELECT id FROM judgments
         WHERE neutral_citation IS NULL
           AND created_at < (SELECT cursor_at FROM citation_key_frontier LIMIT 1)
         LIMIT 1`;
      if (!victim) return { skipped: true as const };

      await tx`UPDATE judgments SET neutral_citation = ${target.neutral_citation} WHERE id = ${victim.id}`;

      const fresh = await readKeyFreshness(tx);
      const after = (await resolveBatch(tx, [target.neutral_citation]))[0];
      const dirty = await readDirtyWork(tx);
      return {
        skipped: false as const,
        lagRows: fresh.lagRows,
        freshnessState: fresh.state,
        afterState: after?.state,
        dirtyOpen: dirty.open,
        dirtyByReason: dirty.byReason,
      };
    });

    if (!outcome) return t.skip('no unambiguously unique neutral citation in this corpus');
    if (outcome.skipped) return t.skip('no un-cited judgment below the cursor to mutate');

    assert.equal(outcome.lagRows, 0, 'a mutation moves no row above the cursor');
    assert.equal(outcome.freshnessState, 'CURRENT');
    assert.equal(outcome.dirtyOpen, 1, 'the UPDATE trigger recorded the mutated judgment');
    assert.equal(outcome.dirtyByReason['CITATION_MUTATED'], 1);
    assert.equal(outcome.afterState, 'UNIQUE_UNCONFIRMED_STALE_INDEX');
  });

  it('an ordinary insert ABOVE the cursor writes NO dirty work — the trigger is not a blanket', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const before = await readDirtyWork(tx);
      await tx`
        INSERT INTO judgments
          (case_title, neutral_citation, reporter_citations, court, judgment_date,
           language, source_url, full_text)
        VALUES ('FIFTH 1313 CONTROL — ORDINARY INGEST', '9999 TEST 1', '{}',
                'Supreme Court of India', '2026-08-26', 'en',
                'test://fifth-1313-control', 'control body')`;
      const after = await readDirtyWork(tx);
      return { before: before.open, after: after.open };
    });
    if (!outcome) return t.skip('unreachable');
    // The creation frontier already sees a row stamped now(). Marking it dirty
    // as well would put every ingested judgment in this table and turn the gate
    // into a permanent refusal.
    assert.equal(outcome.after, outcome.before, 'a normal ingest row must not be marked dirty');
  });

  it('a no-op rewrite of a citation column writes NO dirty work', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        SELECT id FROM judgments WHERE neutral_citation IS NOT NULL LIMIT 1`;
      if (!row) return null;
      const before = await readDirtyWork(tx);
      // The statement NAMES the column, so the trigger fires; the value does not
      // move, so the function must decline. An idempotent backfill must not
      // manufacture a refusal.
      await tx`UPDATE judgments SET neutral_citation = neutral_citation WHERE id = ${row.id}`;
      const after = await readDirtyWork(tx);
      return { before: before.open, after: after.open };
    });
    if (!outcome) return t.skip('no cited judgment in this corpus');
    assert.equal(outcome.after, outcome.before, 'an unchanged value is not a mutation');
  });

  it('a bulk update that does NOT name a citation column never enters the trigger', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const [row] = await tx<{ id: string }[]>`SELECT id FROM judgments LIMIT 1`;
      if (!row) return null;
      const before = await readDirtyWork(tx);
      // The shape the quality screens and the treatment propagator use. It must
      // cost nothing: `AFTER UPDATE OF` is evaluated against the SET list.
      await tx`UPDATE judgments SET overruled_note = overruled_note WHERE id = ${row.id}`;
      const after = await readDirtyWork(tx);
      return { before: before.open, after: after.open };
    });
    if (!outcome) return t.skip('no corpus loaded');
    assert.equal(outcome.after, outcome.before);
  });
});
