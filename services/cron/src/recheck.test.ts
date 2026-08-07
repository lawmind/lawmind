/**
 * The overruled re-check.
 *
 * **This suite exists because the job died on its first production run and no
 * test had ever executed its query.** `citation_checks.overruled_status_shown` is
 * `text` while `judgments.overruled_status` is an enum, so
 * `IS DISTINCT FROM` between them raised *"operator does not exist: text =
 * overruled_status"* — a parse-time failure that would have shown up the instant
 * anything ran the statement, against any database, empty or not.
 *
 * The fan-out had tests. The query that feeds it did not. **A statement no test
 * executes is a statement verified by whoever runs it first**, and here that was
 * a cron job at night.
 *
 * So the first test below asserts nothing about results — it just runs the query.
 * That alone would have caught it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { runRecheck } from './recheck.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const TAG = 'test-recheck';

let userId = '';
let judgmentId = '';
let matterId = '';

describe('overruled re-check', () => {
  before(async () => {
    const authId = `${TAG}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${authId}, 'Adv', ${email}, true)`;
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911', ${email}, 'unverified') RETURNING id`;
    userId = u!.id;

    const [j] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date, full_text,
                             language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Recheck Subject', '{}', 'Test Court', '2001-01-01', 'x', 'en',
              ${`test://${TAG}/${crypto.randomUUID()}`}, 'none') RETURNING id`;
    judgmentId = j!.id;

    const [m] = await sql<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, status, source)
      VALUES (${userId}, 'State v. Recheck', 'Delhi High Court', 'criminal', '{}'::jsonb,
              'C', 'accused', 'active', 'manual') RETURNING id`;
    matterId = m!.id;

    await sql`INSERT INTO judgment_annotations
                (user_id, judgment_id, matter_id, paragraph_number, paragraph_index, quote)
              VALUES (${userId}, ${judgmentId}, ${matterId}, 1, 0, 'relied upon')`;
  });

  after(async () => {
    await sql`DELETE FROM citation_fanouts WHERE judgment_id = ${judgmentId}`;
    await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ${judgmentId}`;
    await sql`DELETE FROM judgment_annotations WHERE judgment_id = ${judgmentId}`;
    await sql`DELETE FROM matters WHERE id = ${matterId}`;
    await sql`DELETE FROM judgments WHERE id = ${judgmentId}`;
    await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}%`}`;
    await sql.end();
  });

  it('RUNS ITS QUERY AT ALL — the assertion that was missing', async () => {
    // text vs enum. This is the whole test: if the statement cannot parse, it
    // throws here, on any database, with or without data.
    const r = await runRecheck(sql);
    assert.ok(typeof r.checked === 'number');
    assert.equal(r.outcomes.length, r.checked, 'every checked judgment gets an outcome');
  });

  it('ignores a divergence nobody was ever shown', async () => {
    await sql`INSERT INTO citation_checks
                (citation_claimed, judgment_id_matched, verification_state, verified_by_source,
                 shown_to_user, overruled_status_shown, surface)
              VALUES ('probe', ${judgmentId}, 'verified', 'corpus', false, 'none', 'judgment_detail')`;
    await sql`UPDATE judgments SET overruled_status = 'set_aside' WHERE id = ${judgmentId}`;

    const r = await runRecheck(sql);
    // shown_to_user = false. A row nobody saw cannot have misled anybody, and
    // notifying on it would manufacture an audience out of a log.
    assert.ok(!r.outcomes.some((o) => o.judgmentId === judgmentId));

    await sql`UPDATE judgments SET overruled_status = 'none' WHERE id = ${judgmentId}`;
    await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ${judgmentId}`;
  });

  it('flips a judgment an advocate WAS shown, and fans out once', async () => {
    await sql`INSERT INTO citation_checks
                (citation_claimed, judgment_id_matched, verification_state, verified_by_source,
                 shown_to_user, overruled_status_shown, surface)
              VALUES ('probe', ${judgmentId}, 'verified', 'corpus', true, 'none', 'judgment_detail')`;
    await sql`UPDATE judgments SET overruled_status = 'set_aside' WHERE id = ${judgmentId}`;

    const r = await runRecheck(sql);
    const mine = r.outcomes.find((o) => o.judgmentId === judgmentId);
    assert.ok(mine, 'a judgment shown to an advocate and since moved must be caught');
    assert.equal(mine.ok, true);
    assert.equal(mine.shownStatus, 'none');
    assert.equal(mine.liveStatus, 'set_aside');

    // The shown status is brought up to date, or the same divergence reappears
    // every night forever.
    const [cc] = await sql<{ shown: string }[]>`
      SELECT overruled_status_shown AS shown FROM citation_checks
      WHERE judgment_id_matched = ${judgmentId}`;
    assert.equal(cc?.shown, 'set_aside');

    // And a second run has nothing left to do — both because the divergence is
    // gone and because the fan-out is idempotent.
    const again = await runRecheck(sql);
    assert.ok(!again.outcomes.some((o) => o.judgmentId === judgmentId));

    const [n] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM citation_fanouts WHERE judgment_id = ${judgmentId}`;
    assert.equal(n?.n, 1, 'one fan-out, not one per run');
  });
});
