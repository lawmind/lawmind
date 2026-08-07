/**
 * Delivery, and the three ways it could quietly mislead.
 *
 * 1. **One push per advocate, not one per matter.** PD-6 exists because a wrong
 *    cadence trains advocates to switch notifications off permanently. Four
 *    listings must produce one notification.
 * 2. **No device is not a failure.** It is the normal state of anyone who has not
 *    opened the app on a phone. Counting it as an error produces an error rate
 *    nobody reads.
 * 3. **Re-running must not notify twice.** A second identical push is worse than
 *    none, so only undelivered briefings are considered.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PushMessage, PushTicket, Pusher } from '@lawmind/api/push/expo';
import postgres from 'postgres';

import { deliverBriefings } from './deliver.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const TAG = 'test-deliver';
const DATE = '2026-11-11';

/** Records what it was asked to send and answers however the test needs. */
function fakePusher(reply: (m: PushMessage) => PushTicket): Pusher & { sent: PushMessage[][] } {
  const sent: PushMessage[][] = [];
  return {
    name: 'fake',
    sent,
    async send(messages) {
      sent.push(messages);
      return messages.map(reply);
    },
  };
}

let userId = '';

async function seedMatterWithBriefing(title: string) {
  const [m] = await sql<{ id: string }[]>`
    INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                         our_side, next_hearing_date, status, source)
    VALUES (${userId}, ${title}, 'Delhi High Court', 'criminal', '{}'::jsonb, 'C',
            'accused', ${DATE}, 'active', 'manual') RETURNING id`;
  await sql`INSERT INTO briefings (matter_id, hearing_date, generated_at, content, hearing_date_source)
            VALUES (${m!.id}, ${DATE}::date, now(), ${JSON.stringify({ blocks: {} })}::jsonb, 'advocate')`;
  return m!.id;
}

describe('briefing delivery', () => {
  before(async () => {
    const authId = `${TAG}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${email}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status, expo_push_token)
      VALUES (${authId}, 'Adv', '+911', ${email}, 'unverified', 'ExponentPushToken[test]')
      RETURNING id`;
    userId = u!.id;
  });

  after(async () => {
    await sql`DELETE FROM briefings WHERE matter_id IN (SELECT id FROM matters WHERE user_id = ${userId})`;
    await sql`DELETE FROM matters WHERE user_id = ${userId}`;
    await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}%`}`;
    await sql.end();
  });

  it('sends ONE push for several hearings, and marks them all delivered', async () => {
    await seedMatterWithBriefing('First Matter');
    await seedMatterWithBriefing('Second Matter');
    await seedMatterWithBriefing('Third Matter');

    const pusher = fakePusher((m) => ({ to: m.to, ok: true, id: 'ticket-1' }));
    const r = await deliverBriefings(sql, pusher, DATE);

    // The cadence assertion. Three briefings, ONE notification.
    assert.equal(pusher.sent.flat().length, 1, 'an advocate with three hearings gets one push');
    assert.equal(r.advocates, 1);
    assert.equal(r.delivered, 3, 'all three briefings are marked delivered by the one push');
    assert.match(pusher.sent.flat()[0]!.body, /3 hearings/);

    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM briefings b
      JOIN matters m ON m.id = b.matter_id
      WHERE m.user_id = ${userId} AND b.delivered_at IS NOT NULL`;
    assert.equal(row?.n, 3);
  });

  it('does not notify twice when re-run', async () => {
    const pusher = fakePusher((m) => ({ to: m.to, ok: true, id: 'ticket-2' }));
    const r = await deliverBriefings(sql, pusher, DATE);
    // Everything is already delivered, so there is nothing to send. A second
    // identical push is worse than none.
    assert.equal(pusher.sent.flat().length, 0);
    assert.equal(r.delivered, 0);
    assert.equal(r.advocates, 0);
  });

  it('counts an advocate with no device as skipped, never as failed', async () => {
    await sql`UPDATE users SET expo_push_token = NULL WHERE id = ${userId}`;
    await seedMatterWithBriefing('No Device Matter');

    const pusher = fakePusher((m) => ({ to: m.to, ok: true, id: 'x' }));
    const r = await deliverBriefings(sql, pusher, DATE);

    assert.equal(pusher.sent.flat().length, 0, 'nothing is sent without a token');
    assert.equal(r.skippedNoToken, 1);
    assert.equal(r.failed, 0, 'no device is a normal state, not an error');

    await sql`UPDATE users SET expo_push_token = 'ExponentPushToken[test]' WHERE id = ${userId}`;
  });

  it('clears a token the device no longer holds', async () => {
    await seedMatterWithBriefing('Dead Token Matter');
    const pusher = fakePusher((m) => ({
      to: m.to,
      ok: false,
      deviceGone: true,
      message: 'DeviceNotRegistered',
    }));
    const r = await deliverBriefings(sql, pusher, DATE);

    assert.equal(r.tokensCleared, 1);
    assert.ok(r.failed > 0);
    const [row] = await sql<{ t: string | null }[]>`
      SELECT expo_push_token AS t FROM users WHERE id = ${userId}`;
    // Retrying a dead token nightly forever is a permanent failure that hides
    // real ones. Cleared, and the advocate re-registers on next app open.
    assert.equal(row?.t, null);

    await sql`UPDATE users SET expo_push_token = 'ExponentPushToken[test]' WHERE id = ${userId}`;
  });

  it('keeps a transport failure from clearing a live token', async () => {
    await seedMatterWithBriefing('Transient Failure Matter');
    const pusher = fakePusher((m) => ({
      to: m.to,
      ok: false,
      deviceGone: false,
      message: 'HTTP 503',
    }));
    const r = await deliverBriefings(sql, pusher, DATE);

    assert.ok(r.failed > 0);
    // An outage must not look like an uninstall. Clearing here would silently
    // unsubscribe every advocate the night Expo had a bad hour.
    assert.equal(r.tokensCleared, 0);
    const [row] = await sql<{ t: string | null }[]>`
      SELECT expo_push_token AS t FROM users WHERE id = ${userId}`;
    assert.equal(row?.t, 'ExponentPushToken[test]');
  });
});
