/**
 * THE FALSE-UNIQUE WINDOW — R7 §8's resolver-correctness-freshness test.
 *
 * R7 states the test shape exactly:
 *
 *     "Test begins from a CURRENT index, then inserts a duplicate/collision and
 *      proves no false unique window."
 *
 * and predicts the defect it is meant to find:
 *
 *     "A small newly ingested collision may not remain confidently UNIQUE
 *      because global backlog is below a broad threshold."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WAS NOT A PREDICTION. MEASURED, 25 Aug 2026, LIVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *     freshness BEFORE               CURRENT · lagRows 0 · lagHours 19.1
 *     resolve "1950 INSC 1"          UNIQUE · 1 candidate
 *     insert a colliding judgment    same neutral citation, no key row yet
 *     freshness AFTER                CURRENT · lagRows 1 · because []
 *     resolve "1950 INSC 1"          UNIQUE · 1 candidate      <-- FALSE
 *
 * Two judgments claimed that citation and the resolver said exactly one. The
 * threshold gate did nothing, and by its own terms it was right not to: 1 is a
 * very long way below `MAX_LAG_ROWS = 25,000`.
 *
 * That is the structural point. `MAX_LAG_ROWS` answers *"how much damage might
 * there be across the whole corpus"* — the right question for an operator, and
 * the wrong one for a single answer handed to an advocate. The advocate's
 * citation does not care that the other 24,999 unwalked rows are irrelevant to it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW THIS TEST AVOIDS BEING A FIXTURE THAT PROVES ITSELF
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It runs against the REAL corpus, picks a citation the index currently resolves
 * as genuinely UNIQUE, and asserts that first — so a run where the starting
 * state is not CURRENT/UNIQUE reports that rather than passing vacuously. The
 * collision is inserted inside a transaction that is always rolled back, so the
 * corpus is unchanged either way; the last assertion checks that nothing was
 * left behind.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres, { type Sql } from 'postgres';

import { MAX_LAG_ROWS, readKeyFreshness } from './key-freshness.ts';
import { resolveBatch } from './resolver.ts';

const url = process.env['DATABASE_URL'];
const suite = url ? describe : describe.skip;

/** Thrown to unwind `sql.begin`, so the probe row can never persist. */
const ROLLBACK = 'lcc-r7-freshness-probe-rollback';

suite('resolver freshness — the false-unique window', () => {
  let sql: Sql;

  before(() => {
    sql = postgres(url!, { max: 2, onnotice: () => {} });
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  it('a newly ingested collision cannot be answered UNIQUE, however small the backlog', async (t) => {
    const freshness = await readKeyFreshness(sql);
    if (freshness.state !== 'CURRENT') {
      // Reported, never silently passed. The test's premise is a CURRENT index;
      // without one it has measured nothing, and saying "ok" would be a lie.
      t.skip(
        `the index is ${freshness.state}, not CURRENT (${freshness.because.join('; ')}) — ` +
          'this test needs a current index to prove a collision is caught anyway',
      );
      return;
    }

    // A citation the corpus currently holds exactly once. Chosen from the index
    // rather than hard-coded: a hard-coded id rots, and a rotted fixture makes
    // this pass for the wrong reason.
    const [row] = await sql<{ citation_key: string; jid: string }[]>`
      SELECT citation_key, min(judgment_id::text) AS jid
        FROM judgment_citation_keys
       WHERE source = 'neutral'
       GROUP BY citation_key
      HAVING count(DISTINCT judgment_id) = 1
       LIMIT 1`;
    if (!row) {
      t.skip('no singly-held neutral citation in the index to collide with');
      return;
    }
    const [judgment] = await sql<{ neutral_citation: string; court: string }[]>`
      SELECT neutral_citation, court FROM judgments WHERE id = ${row.jid}`;
    const citation = judgment!.neutral_citation;

    const before = await resolveBatch(sql, [citation]);
    assert.equal(
      before[0]!.state,
      'UNIQUE',
      'the premise: this citation resolves UNIQUE before the collision exists',
    );

    const lagRowsBefore = freshness.lagRows;
    let stateWithCollision: string | undefined;
    let lagRowsWithCollision: number | undefined;
    try {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO judgments
            (source_url, case_title, court, judgment_date, neutral_citation,
             reporter_citations, full_text, language)
          VALUES ('lcc-r7-freshness-probe://never-persisted', 'LCC R7 FRESHNESS PROBE',
                  ${judgment!.court}, '1950-01-28', ${citation}, '{}', 'probe', 'en')`;

        const withCollision = await readKeyFreshness(tx as unknown as Sql);
        lagRowsWithCollision = withCollision.lagRows;
        const after = await resolveBatch(tx as unknown as Sql, [citation], withCollision);
        stateWithCollision = after[0]!.state;
        throw new Error(ROLLBACK);
      });
    } catch (error) {
      if ((error as Error).message !== ROLLBACK) throw error;
    }

    /**
     * The collision adds exactly ONE unwalked row, so the GLOBAL gate is expected
     * to stay happy. Asserted, because if the threshold ever started catching
     * this, the per-key check would be passing for a reason it does not own.
     *
     * Measured as a DELTA rather than as `=== 1`. The first version asserted the
     * absolute value and passed alone but failed at 4 when the whole citations
     * suite ran: the other files in it insert judgments of their own against the
     * same database, so the unwalked window is not this test's to own. An
     * absolute assertion here does not test the gate, it tests that nobody else
     * is working.
     */
    assert.equal(
      (lagRowsWithCollision ?? 0) - lagRowsBefore,
      1,
      'the probe must add exactly one unwalked row',
    );
    assert.ok(
      (lagRowsWithCollision ?? 0) < MAX_LAG_ROWS,
      `the unwalked window (${lagRowsWithCollision}) must stay far below MAX_LAG_ROWS ` +
        `(${MAX_LAG_ROWS}), or the threshold gate is what caught this rather than the per-key check`,
    );

    assert.notEqual(
      stateWithCollision,
      'UNIQUE',
      `FALSE UNIQUE WINDOW: two judgments claim ${citation} and the resolver answered UNIQUE`,
    );
    assert.equal(
      stateWithCollision,
      'UNIQUE_UNCONFIRMED_STALE_INDEX',
      'the honest state is "one candidate, and the index has not read everything"',
    );

    const [left] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgments
       WHERE source_url = 'lcc-r7-freshness-probe://never-persisted'`;
    assert.equal(left!.n, 0, 'the probe row must never persist');
  });

  it('an index with nothing unwalked still answers UNIQUE — the gate is not blanket-off', async (t) => {
    /**
     * The other half, and the reason this is a gate rather than a refusal. If
     * the per-key check were wrong in the safe direction it would downgrade
     * every UNIQUE forever, which costs an advocate a working exact-citation
     * lookup and would still pass the test above.
     */
    const freshness = await readKeyFreshness(sql);
    if (freshness.state !== 'CURRENT' || freshness.lagRows !== 0) {
      t.skip(`index is ${freshness.state} with lagRows ${freshness.lagRows}`);
      return;
    }
    const [row] = await sql<{ jid: string }[]>`
      SELECT min(judgment_id::text) AS jid
        FROM judgment_citation_keys
       WHERE source = 'neutral'
       GROUP BY citation_key
      HAVING count(DISTINCT judgment_id) = 1
       LIMIT 1`;
    if (!row) return;
    const [judgment] = await sql<{ neutral_citation: string }[]>`
      SELECT neutral_citation FROM judgments WHERE id = ${row.jid}`;
    const resolved = await resolveBatch(sql, [judgment!.neutral_citation], freshness);
    assert.equal(resolved[0]!.state, 'UNIQUE');
  });
});
