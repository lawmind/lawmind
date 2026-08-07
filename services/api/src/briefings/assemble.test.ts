/**
 * Briefing assembly, and the rule the whole feature rests on.
 *
 * **The stored blob must never contain `overruled_status`.** It is generated at
 * 23:00 and read the next morning outside court; a status frozen overnight is the
 * stale-overruled failure, graded as severely as a hallucination and tracked
 * against a threshold of zero. The blob holds judgment IDs and the render
 * re-reads. That is asserted here against the actual JSON, not by reading the
 * code — this is exactly the kind of rule that survives review and dies to a
 * convenient one-line addition later.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { assembleBriefing, persistBriefing } from './assemble.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const TAG = 'test-brief';

let userId: string | null = null;
let matterId: string | null = null;
/**
 * A judgment this suite owns outright.
 *
 * It used to `SELECT ... FROM judgments LIMIT 1` and mutate whatever came back.
 * That made the two most important tests SKIP on a fresh database — so the rules
 * they protect were only ever proved by hand against production — and it put a
 * real Supreme Court authority one crashed process away from being left marked
 * `set_aside`, which is a stale-overruled event on a metric whose threshold is
 * zero. A synthetic row removes both problems: the tests always run, and no
 * genuine law is ever touched.
 */
let judgmentId: string | null = null;

describe('briefing assembly', () => {
  before(async () => {
    const authId = `${TAG}-${crypto.randomUUID()}`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${`${authId}@example.test`}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911111111111', ${`${authId}@example.test`}, 'unverified')
      RETURNING id`;
    userId = u!.id;

    const [m] = await sql<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, next_hearing_date, status, source)
      VALUES (${userId}, 'State v. Assembly', 'Delhi High Court', 'criminal',
              '{}'::jsonb, 'Client', 'accused', '2026-09-20', 'active', 'manual')
      RETURNING id`;
    matterId = m!.id;

    const [j] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                             full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Assembly Fixture', '{}', 'Test Court', '2000-01-01',
              'synthetic fixture owned by assemble.test.ts', 'en',
              ${`test://assemble/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    judgmentId = j!.id;
  });

  after(async () => {
    if (matterId) {
      await sql`DELETE FROM briefings WHERE matter_id = ${matterId}`;
      await sql`DELETE FROM matter_events WHERE matter_id = ${matterId}`;
      await sql`DELETE FROM judgment_annotations WHERE matter_id = ${matterId}`;
      await sql`DELETE FROM matters WHERE id = ${matterId}`;
    }
    if (judgmentId) {
      await sql`DELETE FROM judgment_annotations WHERE judgment_id = ${judgmentId}`;
      await sql`DELETE FROM judgments WHERE id = ${judgmentId}`;
    }
    await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}%`}`;
    await sql.end();
  });

  it('states an empty block rather than omitting it', async () => {
    const b = await assembleBriefing(sql, matterId!, '2026-09-20');
    assert.ok(b);
    // An omitted block reads as "nothing to report" when it may mean "we never
    // looked". Both are said out loud.
    assert.equal(b.blocks.lastOrder.present, false);
    assert.match(b.blocks.lastOrder.note ?? '', /no order/i);
    assert.equal(b.blocks.pendingApplications.count, 0);
    assert.equal(b.blocks.authorities.length, 0);
  });

  it('flags a date nobody has checked, distinctly from one that failed a check', async () => {
    const b = await assembleBriefing(sql, matterId!, '2026-09-20');
    const ids = b!.blocks.checklist.map((c) => c.id);
    // never_checked, not not_confirmed. A date the advocate typed that no cause
    // list has been consulted about is not a failed check, and marking it as one
    // cries wolf on every manually entered matter.
    assert.ok(ids.includes('date-unchecked'));
    assert.ok(!ids.includes('confirm-date'));
  });

  it('carries the court record as recorded, never a generated summary', async () => {
    await sql`INSERT INTO matter_events (matter_id, event_date, event_type, order_text, source)
              VALUES (${matterId}, '2026-08-01', 'order', 'Bail granted on conditions.', 'manual')`;
    const b = await assembleBriefing(sql, matterId!, '2026-09-20');
    assert.equal(b!.blocks.lastOrder.present, true);
    assert.equal(b!.blocks.lastOrder.orderText, 'Bail granted on conditions.');
  });

  it('reports a filing with no order after it as pending', async () => {
    await sql`INSERT INTO matter_events (matter_id, event_date, event_type, order_text, source)
              VALUES (${matterId}, '2026-08-15', 'filing', 'Application for modification.', 'manual')`;
    const b = await assembleBriefing(sql, matterId!, '2026-09-20');
    assert.equal(b!.blocks.pendingApplications.count, 1);
    assert.equal(
      b!.blocks.pendingApplications.items[0]?.description,
      'Application for modification.',
    );
  });

  it('NEVER writes overruled_status into the stored blob', async () => {
    const j = { id: judgmentId! };

    await sql`INSERT INTO judgment_annotations
                (user_id, judgment_id, matter_id, paragraph_number, paragraph_index, quote)
              VALUES (${userId}, ${j.id}, ${matterId}, 4, 3, 'relied upon')`;

    const b = await assembleBriefing(sql, matterId!, '2026-09-20');
    assert.equal(b!.blocks.authorities.length, 1);
    assert.equal(b!.blocks.authorities[0]?.judgmentId, j.id);

    const id = await persistBriefing(sql, b!, 'advocate');
    const [stored] = await sql<{ content: unknown }[]>`
      SELECT content FROM briefings WHERE id = ${id}`;
    const json = JSON.stringify(stored?.content ?? {});

    // The assertion the feature rests on. If a future change adds status to the
    // blob "so the client does not have to fetch it", this fails — which is the
    // entire point of asserting the serialised form rather than the type.
    assert.ok(
      !json.includes('overruledStatus') && !json.includes('overruled_status'),
      'good-law status must never be cached in a briefing — it is re-read at render',
    );
    // And the ID that lets the render resolve it IS present.
    assert.ok(json.includes(j.id));
  });

  it('is idempotent, and regenerating does not mark a read briefing unread', async () => {
    const b = await assembleBriefing(sql, matterId!, '2026-09-20');
    const first = await persistBriefing(sql, b!, 'advocate');
    await sql`UPDATE briefings SET opened_at = now() WHERE id = ${first}`;

    const second = await persistBriefing(sql, b!, 'advocate');
    assert.equal(second, first, 'the sweep must update tonight’s briefing, not grow a second');

    const [row] = await sql<{ still_opened: boolean; n: number }[]>`
      SELECT (opened_at IS NOT NULL) AS still_opened,
             (SELECT count(*)::int FROM briefings WHERE matter_id = ${matterId}) AS n
      FROM briefings WHERE id = ${first}`;
    assert.equal(row?.n, 1);
    assert.ok(row?.still_opened, 'a regenerated briefing must not look unread again');
  });

  it('names an authority that has moved, in the checklist', async () => {
    const j = { id: judgmentId! };
    await sql`UPDATE judgments SET overruled_status = 'set_aside' WHERE id = ${j.id}`;
    try {
      const b = await assembleBriefing(sql, matterId!, '2026-09-20');
      const item = b!.blocks.checklist.find((c) => c.id === `authority-moved-${j.id}`);
      assert.ok(item, 'an authority that has been set aside must be named the night before');
      assert.match(item.text, /set aside/i);
      assert.match(item.text, /replacement/i);
    } finally {
      await sql`UPDATE judgments SET overruled_status = 'none' WHERE id = ${j.id}`;
    }
  });
});
