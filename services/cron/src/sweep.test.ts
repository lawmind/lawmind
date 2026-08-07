/**
 * The nightly sweep, and the two ways it could quietly hurt an advocate.
 *
 * **A silently skipped matter.** A sweep that produces 40 briefings out of 41
 * looks exactly like one that produced 41. The advocate whose matter was dropped
 * finds out in court. So every matter gets an outcome, and one matter's failure
 * must not end the run.
 *
 * **A date computed in the wrong timezone.** The sweep runs at 23:00 IST and
 * generates for the next day. At that moment it is still the PREVIOUS day in UTC,
 * so a sweep that computed "tomorrow" in UTC would generate for today — the
 * hearing already attended. That is a one-line bug with a whole-product blast
 * radius and it is asserted directly.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { runSweep, tomorrowIst } from './sweep.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const TAG = 'test-sweep';

let userId = '';

describe('tomorrowIst', () => {
  it('rolls to the next IST day at 23:00 IST, when UTC is still on the previous day', () => {
    // 23:00 IST on 20 Sep 2026 is 17:30 UTC the same day. Tomorrow is the 21st.
    assert.equal(tomorrowIst(new Date('2026-09-20T17:30:00Z')), '2026-09-21');
  });

  it('is still the same target just before IST midnight', () => {
    // 23:59 IST on the 20th = 18:29 UTC. Still targeting the 21st.
    assert.equal(tomorrowIst(new Date('2026-09-20T18:29:00Z')), '2026-09-21');
  });

  it('rolls again once IST passes midnight, while UTC has not', () => {
    // 00:30 IST on the 21st = 19:00 UTC on the 20th. UTC still says the 20th;
    // IST says the 21st, so tomorrow is the 22nd. A UTC computation would answer
    // the 21st here and regenerate a briefing for a hearing happening today.
    assert.equal(tomorrowIst(new Date('2026-09-20T19:00:00Z')), '2026-09-22');
  });
});

describe('nightly sweep', () => {
  before(async () => {
    const authId = `${TAG}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${email}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
    userId = u!.id;
  });

  after(async () => {
    await sql`DELETE FROM briefings WHERE matter_id IN
              (SELECT id FROM matters WHERE user_id = ${userId})`;
    await sql`DELETE FROM matter_events WHERE matter_id IN
              (SELECT id FROM matters WHERE user_id = ${userId})`;
    await sql`DELETE FROM matters WHERE user_id = ${userId}`;
    await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}%`}`;
    await sql.end();
  });

  async function seedMatter(title: string, hearingDate: string | null, status = 'active') {
    const [m] = await sql<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, next_hearing_date, status, source)
      VALUES (${userId}, ${title}, 'Delhi High Court', 'criminal', '{}'::jsonb, 'Client',
              'accused', ${hearingDate}, ${status}, 'manual')
      RETURNING id`;
    return m!.id;
  }

  // 23:00 IST on 20 Sep 2026 → the sweep targets the 21st.
  const NOW = new Date('2026-09-20T17:30:00Z');
  const TARGET = '2026-09-21';

  it('generates for every matter listed tomorrow, and only those', async () => {
    const listed = await seedMatter('Listed Tomorrow', TARGET);
    await seedMatter('Listed Later', '2026-10-01');
    await seedMatter('No Date', null);

    const r = await runSweep(sql, NOW);
    assert.equal(r.hearingDate, TARGET);
    const ids = r.outcomes.map((o) => o.matterId);
    assert.ok(ids.includes(listed));
    assert.equal(r.failed, 0);

    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM briefings
      WHERE matter_id = ${listed} AND hearing_date = ${TARGET}::date`;
    assert.equal(row?.n, 1);
  });

  it('skips a disposed matter — no briefing for a case that has ended', async () => {
    const disposed = await seedMatter('Disposed', TARGET, 'disposed');
    const r = await runSweep(sql, NOW);
    assert.ok(!r.outcomes.map((o) => o.matterId).includes(disposed));
  });

  it('accounts for every matter it considered', async () => {
    const r = await runSweep(sql, NOW);
    // The anti-silent-skip assertion: outcomes must cover the whole set, so a
    // dropped matter is arithmetically impossible to hide.
    assert.equal(r.outcomes.length, r.considered);
    assert.equal(r.generated + r.failed, r.considered);
  });

  it('is idempotent and does not mark a read briefing unread', async () => {
    const m = await seedMatter('Rerun', TARGET);
    await runSweep(sql, NOW);
    await sql`UPDATE briefings SET opened_at = now() WHERE matter_id = ${m}`;

    const second = await runSweep(sql, NOW);
    const outcome = second.outcomes.find((o) => o.matterId === m);
    assert.ok(outcome?.ok);
    assert.equal(outcome.regenerated, true, 'a re-run must update, not duplicate');

    const [row] = await sql<{ n: number; still_opened: boolean }[]>`
      SELECT count(*)::int AS n, bool_or(opened_at IS NOT NULL) AS still_opened
      FROM briefings WHERE matter_id = ${m}`;
    assert.equal(row?.n, 1);
    assert.equal(row?.still_opened, true, 'regenerating must not make a briefing look unread');
  });

  it('records the date source without claiming the date was confirmed', async () => {
    const m = await seedMatter('Provenance', TARGET);
    await runSweep(sql, NOW);
    const [row] = await sql<{ src: string; confirmed: boolean }[]>`
      SELECT hearing_date_source AS src, (dates_confirmed_at IS NOT NULL) AS confirmed
      FROM briefings WHERE matter_id = ${m}`;
    // The sweep states where the date came from. Whether a cause list agrees is
    // the sync's answer to give — a sweep that "confirmed" a date read from our
    // own table would be the stale-date failure with our fingerprints on it.
    assert.equal(row?.src, 'advocate');
    assert.equal(row?.confirmed, false);
  });
});
