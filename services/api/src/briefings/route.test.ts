/**
 * The briefing read path, and the guarantee it exists to provide.
 *
 * **This suite exists because the route shipped broken and a production probe
 * found it, not a test.** `briefings.content` is `jsonb` and the driver returned
 * it as a STRING, so `content?.blocks` was `undefined`: every block rendered
 * `null` and the authorities list came back empty. The live status re-read — the
 * entire point of the feature — had nothing to re-read, and it looked like a
 * briefing with no authorities rather than like a failure.
 *
 * The assertion that matters is therefore end-to-end through the route, against a
 * briefing actually stored in the database. A unit test on `liveAuthorities` would
 * have passed throughout, because the bug was in what the row handed it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';
import { assembleBriefing, persistBriefing } from './assemble.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';
const TAG = 'test-brt';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

let token = '';
let userId = '';
let matterId = '';
let judgmentId = '';
let briefingId = '';

type Authority = {
  judgmentId: string;
  available: boolean;
  overruledStatus?: string;
  addToMatterAllowed?: boolean;
  verificationState?: string;
  verifiedBySource?: string;
  neutralCitation?: string | null;
  reporterCitations?: string[];
};

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

async function readBriefing() {
  const res = await app.request(`/briefings/${briefingId}`, { headers: auth() });
  assert.equal(res.status, 200);
  return (
    (await res.json()) as {
      data: { briefing: { blocks: unknown; authorities: Authority[] } };
    }
  ).data.briefing;
}

describe('briefing read path', () => {
  before(async () => {
    const authId = `${TAG}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${email}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
    userId = u!.id;
    token = await signAccessToken({ sub: authId, email }, SECRET);

    const [m] = await sql<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, next_hearing_date, status, source)
      VALUES (${userId}, 'State v. Render', 'Delhi High Court', 'criminal', '{}'::jsonb,
              'Client', 'accused', '2026-09-25', 'active', 'manual') RETURNING id`;
    matterId = m!.id;

    // Synthetic, so this runs on any database and never writes to real law.
    //
    // Deliberately shaped like a pre-2013 Supreme Court judgment: a reporter
    // citation and NO neutral citation. Neutral citations did not exist before
    // then, and the client reads citability as "neither one nor the other" —
    // so this is the fixture that catches a route sending only half of it.
    const [j] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date, full_text,
                             language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Render Fixture', '{"(2001) 3 SCC 111"}', 'Test Court', '2001-01-01',
              'x', 'en', ${`test://render/${crypto.randomUUID()}`}, 'none') RETURNING id`;
    judgmentId = j!.id;

    await sql`INSERT INTO judgment_annotations
                (user_id, judgment_id, matter_id, paragraph_number, paragraph_index, quote)
              VALUES (${userId}, ${judgmentId}, ${matterId}, 7, 6, 'relied upon')`;
    await sql`INSERT INTO matter_events (matter_id, event_date, event_type, order_text, source)
              VALUES (${matterId}, '2026-08-01', 'order', 'Interim bail granted.', 'manual')`;

    const assembled = await assembleBriefing(sql, matterId, '2026-09-25');
    briefingId = await persistBriefing(sql, assembled!, 'advocate');
  });

  after(async () => {
    await sql`DELETE FROM briefings WHERE matter_id = ${matterId}`;
    await sql`DELETE FROM matter_events WHERE matter_id = ${matterId}`;
    await sql`DELETE FROM judgment_annotations WHERE judgment_id = ${judgmentId}`;
    await sql`DELETE FROM judgments WHERE id = ${judgmentId}`;
    await sql`DELETE FROM matters WHERE id = ${matterId}`;
    await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}%`}`;
    await sql.end();
  });

  it('resolves the stored blob into blocks, whatever the driver hands back', async () => {
    const b = await readBriefing();
    // The exact failure that shipped: blocks null, authorities empty.
    assert.notEqual(b.blocks, null, 'blocks must not be null — the jsonb was not parsed');
    assert.equal(b.authorities.length, 1, 'the stored authority must resolve');
    assert.equal(b.authorities[0]?.judgmentId, judgmentId);
  });

  it('carries verificationState and verifiedBySource, not undefined — RCC bus 0038', async () => {
    // Found missing 11 Aug 2026: absence read as falsy client-side, so every
    // briefing authority drew the unconfirmed mark even on a verified corpus
    // judgment. Tier 1 by construction, same as every other corpus-row surface.
    const b = await readBriefing();
    assert.equal(b.authorities[0]?.verificationState, 'verified');
    assert.equal(b.authorities[0]?.verifiedBySource, 'corpus');
  });

  it('sends reporterCitations, so a pre-2013 authority is not called uncitable — RCC bus 0049', async () => {
    // Citability is `neutralCitation === null AND reporterCitations.length === 0`
    // — `docs/CITATION_HARNESS.md`'s rule, computed client-side. This route sent
    // the first half and never the second, so every Supreme Court authority
    // older than neutral citations rendered on the wedge screen as "No citation
    // on file — cannot be referenced in a filing". It has one; we withheld it.
    const b = await readBriefing();
    assert.equal(b.authorities[0]?.neutralCitation ?? null, null, 'the fixture has none, by design');
    assert.deepEqual(b.authorities[0]?.reporterCitations, ['(2001) 3 SCC 111']);
  });

  it('re-reads good-law status LIVE, after the briefing was generated', async () => {
    const before = await readBriefing();
    assert.equal(before.authorities[0]?.overruledStatus, 'none');
    assert.equal(before.authorities[0]?.addToMatterAllowed, true);

    // The law moves AFTER the sweep ran. This is the whole feature.
    await sql`UPDATE judgments SET overruled_status = 'set_aside' WHERE id = ${judgmentId}`;

    const after = await readBriefing();
    assert.equal(
      after.authorities[0]?.overruledStatus,
      'set_aside',
      'a cached briefing must report a status change that happened after generation',
    );
    // set_aside is the one refusal in the product, and it must reach the briefing.
    assert.equal(after.authorities[0]?.addToMatterAllowed, false);

    await sql`UPDATE judgments SET overruled_status = 'none' WHERE id = ${judgmentId}`;
  });

  it('names an authority it cannot read rather than dropping it', async () => {
    // A vanished authority is indistinguishable from one never cited, which is
    // the silent-drop failure in different clothes. Silent-drop threshold is zero.
    //
    // Written by pointing a stored briefing at an id that does not exist, rather
    // than by deleting a real row: the delete version left a client wedged for
    // nine minutes mid-suite, and a test that can hang the build is a test that
    // gets deleted rather than fixed.
    const ghost = crypto.randomUUID();
    const [b2] = await sql<{ id: string }[]>`
      INSERT INTO briefings (matter_id, hearing_date, generated_at, content, hearing_date_source)
      VALUES (${matterId}, '2026-10-05'::date, now(),
              ${JSON.stringify({ blocks: { authorities: [{ judgmentId: ghost }] } })}::jsonb,
              'advocate')
      RETURNING id`;

    const res = await app.request(`/briefings/${b2!.id}`, { headers: auth() });
    assert.equal(res.status, 200);
    const briefing = ((await res.json()) as { data: { briefing: { authorities: Authority[] } } })
      .data.briefing;

    assert.equal(briefing.authorities.length, 1, 'the authority must still be listed');
    assert.equal(briefing.authorities[0]?.available, false);
    assert.equal(briefing.authorities[0]?.judgmentId, ghost);
  });

  it('refuses another advocate, indistinguishably from a missing briefing', async () => {
    const otherAuth = `${TAG}-other-${crypto.randomUUID()}`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${otherAuth}, 'B', ${`${otherAuth}@example.test`}, true)`;
    await sql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
              VALUES (${otherAuth}, 'B', '+912', ${`${otherAuth}@example.test`}, 'unverified')`;
    const otherToken = await signAccessToken(
      { sub: otherAuth, email: `${otherAuth}@example.test` },
      SECRET,
    );

    const mine = await app.request(`/briefings/${briefingId}`, {
      headers: { authorization: `Bearer ${otherToken}` },
    });
    const missing = await app.request(`/briefings/${crypto.randomUUID()}`, {
      headers: { authorization: `Bearer ${otherToken}` },
    });
    assert.equal(mine.status, 404);
    assert.equal(mine.status, missing.status, 'a resolving id leaks another advocate’s caseload');
  });

  it('records only the FIRST open', async () => {
    const one = await app.request(`/briefings/${briefingId}/opened`, {
      method: 'POST',
      headers: auth(),
    });
    const first = ((await one.json()) as { data: { openedAt: string } }).data.openedAt;

    const two = await app.request(`/briefings/${briefingId}/opened`, {
      method: 'POST',
      headers: auth(),
    });
    const second = ((await two.json()) as { data: { openedAt: string } }).data.openedAt;

    // opened_at answers "did this reach the advocate" — the activation metric.
    // Overwriting on every read turns it into last-read and breaks the measure.
    assert.equal(second, first);
  });
});
