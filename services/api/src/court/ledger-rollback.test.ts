/**
 * **S6 DONE: "kill the ledger write in a test and assert the action rolls
 * back."** Never run until now. What existed tested that the ledger row
 * APPEARS; that is a different claim, and the weaker one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GUARANTEE, STATED HONESTLY — because "rolls back" cannot mean what it
 * says here
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An HTTP request to another organisation's server is not transactional. Once
 * the registry has served the request, it has served it: their logs have the
 * row, their rate counter moved, and nothing this process does afterwards can
 * undo any of it. A test asserting that a failed ledger write "rolls back the
 * fetch" would be asserting something impossible, and passing it would mean the
 * test was measuring something else.
 *
 * What CAN be guaranteed, and what `CLAUDE.md` §6 actually needs, is the next
 * thing along: **an unrecorded fetch must not produce usable data.** The rule
 * is that "did we stay inside the grant" is answerable by query rather than by
 * memory. A cause list that reached a briefing while its request left no ledger
 * row would break that permanently — the harvest happened, the record does not
 * exist, and no later audit can reconstruct it.
 *
 * So the assertion is: when the ledger write fails, the caller gets an error and
 * never gets the parsed cause list.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW THE WRITE IS KILLED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ALTER TABLE ... ADD CONSTRAINT CHECK (false) NOT VALID`, inside a
 * transaction that is always rolled back.
 *
 * Precise on purpose. Dropping or renaming the table would also break
 * `decide()`, which READS the ledger to enforce the rate limit — the run would
 * then fail before any request was attempted, which is a different scenario
 * that would pass this test while proving nothing. `NOT VALID` leaves every
 * SELECT working and existing rows unexamined, and fails only the INSERT. That
 * is exactly the failure being modelled: a ledger that has stopped accepting
 * writes.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { ECOURTS_KILL_SWITCH_KEY } from './guard.ts';
import { fetchCauseList } from './ecourts.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** Rolls the probe back. Nothing this file does is allowed to survive it. */
class Rollback extends Error {}

const CAUSE_LIST_BODY = [
  '<html><body>',
  '<tr><td>1</td><td>CRL.A. 100/2024</td><td>State v. Somebody</td></tr>',
  '</body></html>',
].join('');

describe('the fetch ledger is not optional', () => {
  after(async () => {
    await sql.end();
  });

  it('an unrecorded fetch never produces usable data', async () => {
    let fetchAttempted = false;
    let ledgerIsDown = false;
    let outcome: 'threw' | 'returned' = 'returned';
    let returned: unknown = null;

    try {
      await sql.begin(async (tx) => {
        /**
         * The switch has to be ON or `decide()` refuses before any request, and
         * the refusal path writes its own ledger row — a different branch, and
         * one already covered in `guard.test.ts`.
         */
        await tx`
          UPDATE platform_config
             SET enabled = true, reason = 'harness: ledger-failure drill'
           WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
        `;

        await tx`
          ALTER TABLE ecourts_fetch_ledger
            ADD CONSTRAINT harness_ledger_is_down CHECK (false) NOT VALID
        `;

        /**
         * Prove the ledger is actually down before relying on it being down.
         *
         * Without this the whole test passes vacuously if the constraint ever
         * stops biting — a rename, a different table, a driver that swallows
         * the DDL. It would then assert "an unrecorded fetch returns no data"
         * about a fetch that was recorded perfectly well, and report a
         * guarantee nobody tested. That is the exact shape of failure this
         * file was written to close.
         */
        /**
         * Inside a SAVEPOINT, and that detail is the whole trick.
         *
         * A failed statement aborts the whole Postgres transaction — every
         * later query in it errors with "current transaction is aborted". The
         * first version of this probe did exactly that, so `decide()` failed on
         * its next read and the drill never reached the fetch at all. The
         * assertion below caught it, which is the only reason this file is
         * honest.
         *
         * A savepoint scopes the deliberate failure to itself and leaves the
         * transaction usable, so the ledger is down for the code under test and
         * for nothing else.
         */
        ledgerIsDown = await tx
          .savepoint(
            (sp) => sp`
              INSERT INTO ecourts_fetch_ledger (court, endpoint, outcome)
              VALUES ('probe', 'probe', 'error')
            `,
          )
          .then(
            () => false,
            () => true,
          );

        const fetchImpl: typeof fetch = () => {
          fetchAttempted = true;
          return Promise.resolve(new Response(CAUSE_LIST_BODY, { status: 200 }));
        };

        try {
          returned = await fetchCauseList(tx as unknown as typeof sql, 'delhi_hc', { fetchImpl });
        } catch {
          outcome = 'threw';
        }

        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    /**
     * Recorded, not asserted away. The request DID go out — that is the part
     * that cannot be rolled back, and pretending otherwise is what this test
     * refuses to do. It is here so the honest shape of the guarantee is visible
     * in the test itself.
     */
    assert.equal(
      ledgerIsDown,
      true,
      'the ledger accepted a write during the drill — the failure was never simulated, ' +
        'so everything below this line would have passed vacuously',
    );
    assert.equal(fetchAttempted, true, 'the drill did not reach the fetch, so it tested nothing');

    /**
     * Two acceptable outcomes and one forbidden one, asserted as a disjunction
     * rather than as a branch — a conditional would let the meaningful check be
     * skipped by whichever outcome happened to occur, which is how a test comes
     * to assert nothing.
     *
     * Throwing is fine. Returning `failed` is fine. Returning a parsed cause
     * list is the failure: that is data from a request with no ledger row
     * behind it, and once it reaches a briefing the grant's own audit question
     * — "did we stay inside it" — has no answer.
     */
    const status =
      outcome === 'threw' ? 'threw' : ((returned as { status?: string })?.status ?? '');
    assert.ok(
      status === 'threw' || status === 'failed',
      `fetchCauseList returned "${status}" for a request the ledger never recorded. ` +
        'An unrecorded harvest that produces usable data breaks the one audit ' +
        "guarantee the registrar's grant is conditioned on.",
    );
  });

  it('the drill left nothing behind', async () => {
    // The rollback is the point. A drill that mutated the kill switch or added
    // a constraint to a real table would be a worse problem than the one it
    // tests for.
    const [row] = await sql<{ enabled: boolean; reason: string | null }[]>`
      SELECT enabled, reason FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    assert.equal(row?.enabled, false, 'the kill switch is ON after the drill');
    assert.notEqual(row?.reason, 'harness: ledger-failure drill');

    const [con] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'harness_ledger_is_down'
    `;
    assert.equal(con?.n, 0, 'the drill constraint survived the rollback');
  });
});
