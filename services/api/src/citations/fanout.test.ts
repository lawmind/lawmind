/**
 * The fan-out, and the three things it must never get wrong.
 *
 * 1. **Nobody is told twice.** A double-uphold, or an uphold racing the nightly
 *    re-check, must lose to the idempotency key. An advocate told the same
 *    authority moved twice learns to ignore the notification that matters.
 * 2. **A null count is not a zero.** `citation_copies` does not exist, so
 *    `copiedCount` is null. Zero would assert nobody copied the citation out of
 *    the app — a claim with nothing behind it.
 * 3. **All or nothing.** A half-completed fan-out is the worst state available:
 *    the corpus says overruled while the advocate who filed it was never told.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { applyOverruledChange, idempotencyKey } from './fanout.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const TAG = 'test-fanout';

let judgmentId = '';
let overrulerId = '';

describe('applyOverruledChange', () => {
  before(async () => {
    const mk = async (title: string) => {
      const [j] = await sql<{ id: string }[]>`
        INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                               full_text, language, source_url, overruled_status)
        VALUES (${title}, '{}', 'Test Court', '2001-01-01', 'x', 'en',
                ${`test://${TAG}/${crypto.randomUUID()}`}, 'none')
        RETURNING id`;
      return j!.id;
    };
    judgmentId = await mk('SYNTHETIC — Fanout Subject');
    overrulerId = await mk('SYNTHETIC — Fanout Overruler');
  });

  after(async () => {
    await sql`DELETE FROM citation_fanouts WHERE judgment_id IN (${judgmentId}, ${overrulerId})`;
    await sql`DELETE FROM citation_checks WHERE judgment_id_matched IN (${judgmentId}, ${overrulerId})`;
    await sql`DELETE FROM judgments WHERE id IN (${judgmentId}, ${overrulerId})`;
    await sql.end();
  });

  it('writes the corpus and stamps when the status moved', async () => {
    const r = await applyOverruledChange(sql, {
      judgmentId,
      toStatus: 'set_aside',
      trigger: 'recheck',
      overruledByJudgmentId: overrulerId,
    });
    assert.equal(r.applied, true);
    assert.equal(r.fromStatus, 'none');
    assert.equal(r.toStatus, 'set_aside');

    const [j] = await sql<{ s: string; changed: boolean; by: string | null }[]>`
      SELECT overruled_status AS s,
             (overruled_status_changed_at IS NOT NULL) AS changed,
             overruled_by_judgment_id AS by
      FROM judgments WHERE id = ${judgmentId}`;
    assert.equal(j?.s, 'set_aside');
    // Without the timestamp the stale-overruled rate cannot separate a badge that
    // was wrong when rendered from one the world invalidated afterwards.
    assert.equal(j?.changed, true);
    assert.equal(j?.by, overrulerId);
  });

  it('NOBODY IS TOLD TWICE — a repeat of the same change is refused', async () => {
    const again = await applyOverruledChange(sql, {
      judgmentId,
      toStatus: 'set_aside',
      trigger: 'recheck',
    });
    assert.equal(again.applied, false, 'the second identical fan-out must not run');

    const [n] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM citation_fanouts
      WHERE judgment_id = ${judgmentId} AND to_status = 'set_aside' AND trigger = 'recheck'`;
    assert.equal(n?.n, 1, 'exactly one fan-out row, not two');
  });

  it('treats a DIFFERENT trigger for the same flip as a different fan-out', () => {
    // An admin upholding a dispute and the nightly re-check are different events
    // with different audiences to account for, so the key includes the trigger.
    const a = idempotencyKey({ judgmentId, toStatus: 'set_aside', trigger: 'recheck' });
    const b = idempotencyKey({ judgmentId, toStatus: 'set_aside', trigger: 'dispute_upheld' });
    assert.notEqual(a, b);
  });

  it('records copiedCount as NULL, never 0', async () => {
    const [row] = await sql<{ copied: number | null; notified: number | null }[]>`
      SELECT copied_count AS copied, notified_count AS notified
      FROM citation_fanouts WHERE judgment_id = ${judgmentId} LIMIT 1`;
    // citation_copies does not exist. 0 would assert that nobody copied this
    // citation out of the app — an absent check is not a negative result.
    assert.equal(row?.copied, null);
    assert.notEqual(row?.copied, 0);
    // But notified IS known and must be recorded, or the fan-out is unauditable.
    assert.notEqual(row?.notified, null);
  });

  it('refuses partly_set_aside without the affected paragraphs', async () => {
    await assert.rejects(
      () =>
        applyOverruledChange(sql, {
          judgmentId: overrulerId,
          toStatus: 'partly_set_aside',
          trigger: 'admin_correction',
        }),
      /overruledParas/,
      '"partly set aside, we will not say which part" is not something an advocate can act on',
    );

    const [j] = await sql<{ s: string }[]>`
      SELECT overruled_status AS s FROM judgments WHERE id = ${overrulerId}`;
    // All or nothing: the rejected call must not have moved the corpus.
    assert.equal(j?.s, 'none');
  });

  it('leaves no fan-out row behind when it refuses', async () => {
    const [n] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM citation_fanouts WHERE judgment_id = ${overrulerId}`;
    assert.equal(n?.n, 0);
  });
});
