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
 * STRENGTHENED 29 AUG 2026 — THE REQUEST IS NO LONGER MADE AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * When this file was written, the ledger row was inserted AFTER the response
 * came back, so the honest guarantee stopped at "the data is not usable" and the
 * test recorded, deliberately, that the request itself had gone out and could
 * not be recalled.
 *
 * Atomic quota reservation moved the ledger write in front of the network:
 * `reserve()` commits the row that spends the slot, and only then may the caller
 * fetch. A ledger that has stopped accepting writes therefore stops the request
 * instead of merely invalidating its result — which is strictly the better
 * guarantee, and the one the grant actually wants. `fetchAttempted` is now
 * asserted FALSE for that reason, and it is still the vacuity guard: if a future
 * change puts the request back in front of the ledger, this line goes red.
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

import { createIsolatedSchema } from '../testing/isolated-schema.ts';
import { ECOURTS_KILL_SWITCH_KEY } from './guard.ts';
import { fetchCauseList } from './ecourts.ts';

/**
 * The drill needs `decide()` to ALLOW, so the attribution lock added in R9 has to
 * be satisfied — otherwise the guard refuses before the fetch and the drill
 * measures nothing. Its own `fetchAttempted` assertion caught exactly that, which
 * is the second time this file's vacuity guard has earned its place.
 *
 * Set here rather than in the environment because it is only meaningful for this
 * process, and `grantAttribution()` reads live for precisely this reason. The
 * value is a test string and never the registrar's — the real one is confidential
 * and lives only in Railway.
 */
process.env['ECOURTS_GRANT_ATTRIBUTION'] ??= 'LawMind-ledger-drill/1.0 (test only)';

/**
 * `platform_config` is ISOLATED - `testing/isolated-schema.ts`.
 *
 * The drill flips the harvest switch ON inside its transaction and relies on the
 * ROLLBACK to put it back, which is sound and was never the failure. What was
 * unsound is the assumption underneath it: that the production row is OFF to
 * begin with. The founder enabled harvesting on 29 Aug 2026 through the audited
 * path, and a drill reading the live row would now start from ON and assert at
 * the end that the founder's decision had been undone. The fixture makes the
 * starting state a property of this file instead of a property of the day.
 */
const isolation = await createIsolatedSchema(process.env['DATABASE_URL'] ?? '');
const sql = isolation.connect({ max: 2 });

/** Rolls the probe back. Nothing this file does is allowed to survive it. */
class Rollback extends Error {}

const CAUSE_LIST_BODY = [
  '<html><body>',
  '<tr><td>1</td><td>CRL.A. 100/2024</td><td>State v. Somebody</td></tr>',
  '</body></html>',
].join('');

describe('the fetch ledger is not optional', () => {
  after(async () => {
    await isolation.drop();
  });

  it('an unrecorded fetch never produces usable data', async () => {
    let fetchAttempted = false;
    let ledgerIsDown = false;
    // Widened deliberately: it is assigned inside a callback, and a literal
    // union narrows to its initialiser at the comparison below.
    let outcome: string = 'returned';
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

    assert.equal(
      ledgerIsDown,
      true,
      'the ledger accepted a write during the drill — the failure was never simulated, ' +
        'so everything below this line would have passed vacuously',
    );

    /**
     * The strengthened guarantee. Reservation commits the ledger row before the
     * network is touched, so a ledger that cannot accept writes cannot be
     * followed by a request. This is not a relaxation of the old assertion — it
     * is the same vacuity guard pointed at the better outcome: if the request
     * ever moves back in front of the ledger write, this fails.
     */
    assert.equal(
      fetchAttempted,
      false,
      'a request was made while the ledger could not record it — quota reservation is ' +
        'supposed to make that impossible, and an unrecordable harvest is exactly what ' +
        'the grant cannot survive',
    );

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
    assert.equal(row?.enabled, false, 'the isolated kill switch is ON after the drill');
    assert.notEqual(row?.reason, 'harness: ledger-failure drill');

    const [con] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'harness_ledger_is_down'
    `;
    assert.equal(con?.n, 0, 'the drill constraint survived the rollback');
  });
});
