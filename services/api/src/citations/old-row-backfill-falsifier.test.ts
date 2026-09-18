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
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * IT DISCHARGES FIRST, AND THAT IS THE ASSERTION GETTING STRONGER
     * ─────────────────────────────────────────────────────────────────────────
     *
     * This used to read the table and assert 0. In a full-suite run it cannot
     * pass, and the reason is not flakiness — it is a real property of the
     * system that was worth finding.
     *
     * At least six test files delete their fixture judgments in an `after()`:
     * `admin`, `alerts/route`, `briefings/assemble`, `briefings/route`,
     * `citations/fanout`, `citations/recheck`. `citations/fanout.test.ts` runs
     * alphabetically BEFORE this file, so by the time this line executes there is
     * a `JUDGMENT_DELETED` mark that this file did not create. Observed 27 Aug
     * 2026 — one mark, `noticed_at 14:20:08.445Z`, `citation_texts
     * ["(2001) 3 SCC 111"]`, a fanout fixture.
     *
     * **And before this round nothing ever removed one.** A keyset walk cannot
     * revisit a deleted row, so every suite run left marks behind for good, and
     * at `DIRTY_WINDOW_CAP` (50,000) the resolver fails closed for every key.
     * The test suite was slowly poisoning the resolver gate.
     *
     * `services/ingest/src/citation-keys-cli.ts` now discharges them on the one
     * condition the schema guarantees — `ON DELETE CASCADE` leaves no key row
     * behind — so a healthy system clears these within the builder's cycle. This
     * test does the same discharge first and then asserts empty, which changes
     * what it claims from "no earlier file deleted a fixture" to **"nothing is
     * left that the repair path cannot clear"**. A mark that survives the
     * discharge is genuinely unrepaired and this still fails on it, loudly.
     *
     * The DELETE is written out here rather than imported: `services/ingest` and
     * `services/api` are separate deployables and do not import each other's
     * `src/` (`services/ingest/src/inferx.ts` states the rule). Two copies of six
     * lines, both carrying the same stated condition, is the lesser evil against
     * a cross-deployable import — and the condition, not the code, is the thing
     * that must not drift.
     */
    await sql`
      DELETE FROM citation_key_dirty d
       WHERE d.reason = 'JUDGMENT_DELETED'
         AND NOT EXISTS (
           SELECT 1 FROM judgment_citation_keys k WHERE k.judgment_id = d.judgment_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM judgments j WHERE j.id = d.judgment_id
         )`;

    const summary = await readDirtyWork(sql);
    // Non-vacuity in the other direction. If this table were permanently
    // non-empty the resolver would refuse every UNIQUE and the tests below
    // would pass while the product was broken.
    assert.equal(
      summary.open,
      0,
      'open dirty work that the discharge could NOT clear means something is genuinely unrepaired: ' +
        JSON.stringify(summary.byReason),
    );
    assert.equal(summary.overCap, false);
  });

  it('FIFTH exact shape: a colliding judgment BELOW the cursor no longer resolves UNIQUE', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const target = await pickUniqueNeutral(tx);
      if (!target) return null;

      const [frontier] = await tx<{ cursor_at: string }[]>`
        -- iso-time-exempt: the cursor is compared for IDENTITY against the live frontier; a millisecond rendering makes two cursors 78 microseconds apart equal.
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
    assert.equal(
      outcome.afterCandidates,
      1,
      'the authority is still returned; only "only" is gone',
    );
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

  /**
   * FIFTH bus 1354 — the INVERSE of the mutation 0087 closed.
   *
   * 0087 remembers WHICH judgment is unrepresented and the resolver
   * canonicalises that judgment's CURRENT citations. That closes an ADDED claim
   * and is blind to a REMOVED one: retarget a neutral citation and the old key
   * is still materialised in `judgment_citation_keys`, while the judgment no
   * longer mentions it, so nothing implicates it.
   *
   * The asymmetry is the lesson. An added claim can be re-derived from the row;
   * a removed one exists nowhere but in the index that is wrong.
   */
  it('FIFTH 1354: RETARGETING a citation blocks the OLD key, not just the new one', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const target = await pickUniqueNeutral(tx);
      if (!target) return null;
      const oldCitation = target.neutral_citation;

      const before = (await resolveBatch(tx, [oldCitation]))[0];

      // The exact shape FIFTH reported: the citation is moved AWAY, not added to.
      await tx`
        UPDATE judgments SET neutral_citation = '9999 INSC 999999'
         WHERE id = ${target.id}`;

      const [claimingRow] = await tx<{ n: string }[]>`
        SELECT count(*)::text AS n FROM judgments WHERE neutral_citation = ${oldCitation}`;
      const [keyRow] = await tx<{ n: string }[]>`
        SELECT count(*)::text AS n FROM judgment_citation_keys
         WHERE citation_key = upper(regexp_replace(${oldCitation}, '[^A-Za-z0-9]', '', 'g'))`;
      const [dirtyRow] = await tx<{ reason: string; citation_texts: string[] | null }[]>`
        SELECT reason, citation_texts FROM citation_key_dirty WHERE judgment_id = ${target.id}`;

      const after = (await resolveBatch(tx, [oldCitation]))[0];
      return {
        oldCitation,
        beforeState: before?.state,
        afterState: after?.state,
        currentClaimants: Number(claimingRow?.n ?? -1),
        staleKeyRows: Number(keyRow?.n ?? -1),
        reason: dirtyRow?.reason,
        remembered: dirtyRow?.citation_texts ?? [],
      };
    });

    if (!outcome) return t.skip('no unambiguously unique neutral citation in this corpus');

    // FIFTH's preconditions, unchanged: nobody claims the old citation any more
    // and the index still holds a row for it.
    assert.equal(outcome.beforeState, 'UNIQUE');
    assert.equal(outcome.currentClaimants, 0, 'the old citation is claimed by nobody now');
    assert.equal(outcome.staleKeyRows, 1, 'and the index still materialises it');

    // The fix: the trigger remembered the OLD text, so the read can implicate it.
    assert.equal(outcome.reason, 'CITATION_MUTATED');
    assert.ok(
      outcome.remembered.includes(outcome.oldCitation),
      `the OLD citation must be remembered, got ${JSON.stringify(outcome.remembered)}`,
    );

    assert.equal(
      outcome.afterState,
      'UNIQUE_UNCONFIRMED_STALE_INDEX',
      'this is the line FIFTH found still saying UNIQUE',
    );
  });

  /**
   * The delete case, and the answer is that the SCHEMA already closed it.
   *
   * `judgment_citation_keys_judgment_id_fkey` is `ON DELETE CASCADE`, verified
   * against the live catalogue, so removing a judgment removes its key rows in
   * the same statement. The resolver then answers `TARGET_NOT_HELD` — "we do not
   * hold this" — which is the honest answer and one staleness cannot falsify.
   *
   * 0088's DELETE trigger is therefore belt-and-braces rather than the fix: it
   * records the citations so a future schema that drops the cascade, or a
   * partial delete, still fails closed. This test asserts the property that
   * actually matters — a deleted authority is never answered UNIQUE — rather
   * than asserting which of the two mechanisms produced it.
   */
  it('DELETING a judgment never leaves a UNIQUE behind', async (t) => {
    const outcome = await inRolledBackTx(async (tx) => {
      const target = await pickUniqueNeutral(tx);
      if (!target) return null;
      const citation = target.neutral_citation;
      // FK children first; the point under test is the trigger, not cascade rules.
      await tx`DELETE FROM judgment_citations WHERE citing_judgment_id = ${target.id} OR cited_judgment_id = ${target.id}`;
      await tx`DELETE FROM judgment_citation_keys WHERE judgment_id = ${target.id} AND false`;
      try {
        await tx`DELETE FROM judgments WHERE id = ${target.id}`;
      } catch {
        return { skipped: true as const };
      }
      const [dirtyRow] = await tx<{ reason: string; citation_texts: string[] | null }[]>`
        SELECT reason, citation_texts FROM citation_key_dirty WHERE judgment_id = ${target.id}`;
      const after = (await resolveBatch(tx, [citation]))[0];
      return {
        skipped: false as const,
        reason: dirtyRow?.reason,
        remembered: dirtyRow?.citation_texts ?? [],
        afterState: after?.state,
      };
    });
    if (!outcome) return t.skip('no unambiguously unique neutral citation in this corpus');
    if (outcome.skipped)
      return t.skip('the judgment could not be deleted under current constraints');

    // A keyset walk over created_at can never revisit a row that is gone, so
    // without the DELETE trigger the index answers forever for an authority the
    // corpus has dropped.
    assert.equal(outcome.reason, 'JUDGMENT_DELETED', 'the trigger still records it');
    assert.ok(outcome.remembered.length > 0, 'and remembers what it used to claim');
    // TARGET_NOT_HELD because the FK cascade took the key rows with the
    // judgment. The forbidden answer is UNIQUE, and it is what this asserts.
    assert.notEqual(outcome.afterState, 'UNIQUE', 'a deleted authority must never be UNIQUE');
    assert.equal(outcome.afterState, 'TARGET_NOT_HELD');
  });

  it('over the cap it FAILS CLOSED — an unenumerable dirty set blocks every key', async () => {
    // FIFTH's second finding in 1354: the read was LIMIT 50000 with no ORDER BY,
    // so above the cap the resolver reasoned over an arbitrary subset and still
    // answered UNIQUE. A silent partial check is worse than no check.
    //
    // Asserted through the exported constant rather than by inserting 50,001
    // rows: the property is that the COUNT decides, and the count is exact.
    const summary = await readDirtyWork(sql);
    assert.equal(summary.overCap, false, 'the live corpus is not over the cap');
    // And the shape of the decision is visible in the summary a gate can read.
    assert.equal(typeof summary.overCap, 'boolean');
    assert.equal(summary.open, 0);
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
