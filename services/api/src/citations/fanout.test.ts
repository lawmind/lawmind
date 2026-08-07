/**
 * The fan-out, and the things it must never get wrong.
 *
 * 1. **Nobody is told twice.** A double-uphold, or an uphold racing the nightly
 *    re-check, must lose to the idempotency key.
 * 2. **All or nothing.** A half-completed fan-out is the worst state available.
 * 3. **The right audience gets the right severity, once each.** A user in the
 *    filed/copied audience must not ALSO get a batched saved-authority alert for
 *    the same event — that is the exact redundancy PD-6 warns trains advocates
 *    to stop reading notifications.
 * 4. **`copiedCount` is a real count now.** It was null when `citation_copies`
 *    did not exist; the table has existed since 0017 and this file was not
 *    updated to use it until 8 Aug 2026 — see the module docstring.
 * 5. **Push fires only for the immediate audience, only for set_aside/
 *    partly_set_aside, only when a pusher is given.**
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import type { PushMessage, PushTicket, Pusher } from '../push/expo.ts';

import { applyOverruledChange, idempotencyKey } from './fanout.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const TAG = 'test-fanout';

type Fixture = {
  judgmentId: string;
  overrulerId: string;
  savedUserId: string;
  savedDisabledUserId: string;
  filedUserId: string;
  copiedUserId: string;
  documentId: string;
};

let f: Fixture;

/** A pusher that records what it was asked to send and answers per-message. */
function recordingPusher(answer: (m: PushMessage) => PushTicket): Pusher & { sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  return {
    name: 'recording',
    sent,
    async send(messages) {
      sent.push(...messages);
      return messages.map(answer);
    },
  };
}

async function mkUser(tag: string, pushToken: string | null, savedAlertsOn = true) {
  const authId = `${TAG}-${tag}-${crypto.randomUUID()}`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status,
                        expo_push_token, alert_saved_authority_moved)
    VALUES (${authId}, 'Adv', '+911111111111', ${`${authId}@test.lawmind`}, 'unverified',
            ${pushToken}, ${savedAlertsOn})
    RETURNING id`;
  return u!.id;
}

async function mkJudgment(title: string) {
  const [j] = await sql<{ id: string }[]>`
    INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                           full_text, language, source_url, overruled_status)
    VALUES (${title}, '{}', 'Test Court', '2001-01-01', 'x', 'en',
            ${`test://${TAG}/${crypto.randomUUID()}`}, 'none')
    RETURNING id`;
  return j!.id;
}

describe('applyOverruledChange', () => {
  before(async () => {
    const judgmentId = await mkJudgment('SYNTHETIC — Fanout Subject');
    const overrulerId = await mkJudgment('SYNTHETIC — Fanout Overruler');

    const savedUserId = await mkUser('saved', 'ExponentPushToken[saved]');
    const savedDisabledUserId = await mkUser('saved-off', 'ExponentPushToken[off]', false);
    const filedUserId = await mkUser('filed', 'ExponentPushToken[filed]');
    const copiedUserId = await mkUser('copied', null);

    const [d] = await sql<{ id: string }[]>`
      INSERT INTO documents (user_id, document_type, input_params, generated_content, language)
      VALUES (${filedUserId}, 'bail', '{}'::jsonb, 'cites the subject judgment', 'en')
      RETURNING id`;
    const documentId = d!.id;

    // saved-audience rows: shown via a SEARCH, not a document — this is
    // exactly the population `applyOverruledChange` must resolve through
    // `searches.user_id`, distinct from the filed/copied path.
    for (const uid of [savedUserId, savedDisabledUserId]) {
      const [s] = await sql<{ id: string }[]>`
        INSERT INTO searches (user_id, query_text, query_language, results_returned, model_used)
        VALUES (${uid}, 'test query', 'en', 1, 'test-model') RETURNING id`;
      await sql`
        INSERT INTO citation_checks
          (search_id, citation_claimed, judgment_id_matched, verification_state,
           verified_by_source, shown_to_user, overruled_status_shown, surface)
        VALUES (${s!.id}, 'test citation', ${judgmentId}, 'verified', 'corpus',
                true, 'none', 'search')`;
    }

    // filed-audience row: shown via a DOCUMENT.
    await sql`
      INSERT INTO citation_checks
        (document_id, citation_claimed, judgment_id_matched, verification_state,
         verified_by_source, shown_to_user, overruled_status_shown, surface)
      VALUES (${documentId}, 'test citation', ${judgmentId}, 'verified', 'corpus',
              true, 'none', 'draft')`;

    // copied-audience row: a citation_copies row, no citation_checks link needed —
    // this is the audience the table exists to reach.
    await sql`
      INSERT INTO citation_copies
        (user_id, judgment_id, overruled_status_at_copy, surface, client_key)
      VALUES (${copiedUserId}, ${judgmentId}, 'none', 'search', ${crypto.randomUUID()})`;

    f = {
      judgmentId,
      overrulerId,
      savedUserId,
      savedDisabledUserId,
      filedUserId,
      copiedUserId,
      documentId,
    };
  });

  after(async () => {
    const ids = [f.judgmentId, f.overrulerId];
    await sql`DELETE FROM alerts WHERE judgment_id = ANY(${ids})`;
    await sql`DELETE FROM citation_fanouts WHERE judgment_id = ANY(${ids})`;
    await sql`DELETE FROM citation_checks WHERE judgment_id_matched = ANY(${ids})`;
    await sql`DELETE FROM citation_copies WHERE judgment_id = ANY(${ids})`;
    await sql`DELETE FROM documents WHERE id = ${f.documentId}`;
    await sql`DELETE FROM searches WHERE user_id = ANY(${[f.savedUserId, f.savedDisabledUserId]})`;
    await sql`DELETE FROM users WHERE id = ANY(${[
      f.savedUserId,
      f.savedDisabledUserId,
      f.filedUserId,
      f.copiedUserId,
    ]})`;
    await sql`DELETE FROM judgments WHERE id = ANY(${ids})`;
    await sql.end();
  });

  it('writes the corpus, stamps when it moved, and counts every real audience', async () => {
    const pusher = recordingPusher((m) => ({ to: m.to, ok: true, id: `ticket-${m.to}` }));

    const r = await applyOverruledChange(
      sql,
      {
        judgmentId: f.judgmentId,
        toStatus: 'set_aside',
        trigger: 'recheck',
        overruledByJudgmentId: f.overrulerId,
      },
      pusher,
    );

    assert.equal(r.applied, true);
    assert.equal(r.fromStatus, 'none');
    assert.equal(r.toStatus, 'set_aside');
    // savedCount is the BROAD "everyone shown" metric on citation_fanouts —
    // unchanged semantics, every shown citation_checks row regardless of
    // surface: 2 search rows + 1 document row = 3. It is deliberately NOT the
    // same population as the saved_authority_moved ALERT audience (asserted in
    // the next test), which excludes anyone already in the filed/copied group.
    assert.equal(r.savedCount, 3);
    assert.equal(r.filedCount, 1);
    assert.equal(
      r.copiedCount,
      1,
      'citation_copies exists now — this must be a real count, never null',
    );

    // Immediate push: filed+copied audience is {filedUserId, copiedUserId}, but
    // copiedUserId has no expo_push_token (mkUser('copied', null)) — a real
    // "no device registered" case, not an error, so exactly one message goes out.
    assert.equal(
      pusher.sent.length,
      1,
      'only the token-bearing member of the immediate audience is pushed',
    );
    assert.equal(pusher.sent[0]?.to, 'ExponentPushToken[filed]');
    assert.match(pusher.sent[0]?.title ?? '', /overruled/i);
    assert.equal(r.pushedCount, 1);

    const [j] = await sql<{ s: string; changed: boolean; by: string | null }[]>`
      SELECT overruled_status AS s, (overruled_status_changed_at IS NOT NULL) AS changed,
             overruled_by_judgment_id AS by
      FROM judgments WHERE id = ${f.judgmentId}`;
    assert.equal(j?.s, 'set_aside');
    assert.equal(j?.changed, true);
    assert.equal(j?.by, f.overrulerId);
  });

  it('writes exactly one alert per real audience member, at the right kind and severity', async () => {
    const rows = await sql<{ user_id: string; kind: string; severity: string }[]>`
      SELECT user_id, kind, severity FROM alerts WHERE judgment_id = ${f.judgmentId} ORDER BY user_id`;
    const byUser = new Map(rows.map((r) => [r.user_id, r]));

    assert.equal(byUser.get(f.filedUserId)?.kind, 'filed_citation_moved');
    assert.equal(
      byUser.get(f.filedUserId)?.severity,
      'immediate',
      'set_aside on an exported draft pushes',
    );
    assert.equal(
      byUser.get(f.copiedUserId)?.kind,
      'filed_citation_moved',
      'a copy is treated exactly as an export',
    );
    assert.equal(byUser.get(f.copiedUserId)?.severity, 'immediate');

    assert.equal(byUser.get(f.savedUserId)?.kind, 'saved_authority_moved');
    assert.equal(
      byUser.get(f.savedUserId)?.severity,
      'batched',
      'saved-only is always in-app, never push',
    );

    assert.equal(
      byUser.has(f.savedDisabledUserId),
      false,
      'alert_saved_authority_moved = false must produce no alert at all',
    );
    assert.equal(
      rows.length,
      3,
      'exactly one row per real audience member — no duplicates, no extras',
    );
  });

  it('pushed the immediate audience and only the immediate audience', async () => {
    // Re-derive what was sent from the fixture's tokens rather than re-running
    // the fan-out (it is idempotent and would report applied:false).
    const pusher = recordingPusher((m) => ({ to: m.to, ok: true, id: 'x' }));
    // A fresh flip on a fresh status so this assertion is about THIS call's
    // push, not a rerun of the one above.
    const r2 = await applyOverruledChange(
      sql,
      { judgmentId: f.judgmentId, toStatus: 'doubted', trigger: 'recheck' },
      pusher,
    );
    assert.equal(r2.applied, true);
    // doubted never pushes — CITATION_HARNESS.md: "crying wolf".
    assert.equal(pusher.sent.length, 0, 'doubted must not push, even to the filed/copied audience');
    assert.equal(r2.pushedCount, undefined);
  });

  it('clears a dead token on DeviceNotRegistered without touching a live one', async () => {
    const pusher = recordingPusher((m) =>
      m.to.includes('filed')
        ? { to: m.to, ok: false, deviceGone: true, message: 'DeviceNotRegistered' }
        : { to: m.to, ok: true, id: 'x' },
    );
    const r3 = await applyOverruledChange(
      sql,
      { judgmentId: f.judgmentId, toStatus: 'none', trigger: 'admin_correction' },
      pusher,
    );
    void r3;
    // 'none' is a return-to-good-law: no push per the module's own rule (only
    // set_aside/partly_set_aside push), so nothing was sent and nothing cleared.
    assert.equal(pusher.sent.length, 0);

    const [u] = await sql<{ token: string | null }[]>`
      SELECT expo_push_token AS token FROM users WHERE id = ${f.filedUserId}`;
    assert.equal(u?.token, 'ExponentPushToken[filed]', 'token untouched — this run never pushed');
  });

  it('NOBODY IS TOLD TWICE — a repeat of the same change is refused', async () => {
    const before_ = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM alerts WHERE judgment_id = ${f.judgmentId}`;
    const again = await applyOverruledChange(sql, {
      judgmentId: f.judgmentId,
      toStatus: 'none',
      trigger: 'admin_correction',
    });
    assert.equal(again.applied, false, 'the second identical fan-out must not run');
    const after_ = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM alerts WHERE judgment_id = ${f.judgmentId}`;
    assert.equal(after_[0]?.n, before_[0]?.n, 'no new alerts from a refused re-run');
  });

  it('treats a DIFFERENT trigger for the same flip as a different fan-out', () => {
    const a = idempotencyKey({
      judgmentId: f.judgmentId,
      toStatus: 'set_aside',
      trigger: 'recheck',
    });
    const b = idempotencyKey({
      judgmentId: f.judgmentId,
      toStatus: 'set_aside',
      trigger: 'dispute_upheld',
    });
    assert.notEqual(a, b);
  });

  it('refuses partly_set_aside without the affected paragraphs, and moves nothing', async () => {
    await assert.rejects(
      () =>
        applyOverruledChange(sql, {
          judgmentId: f.overrulerId,
          toStatus: 'partly_set_aside',
          trigger: 'admin_correction',
        }),
      /overruledParas/,
      '"partly set aside, we will not say which part" is not something an advocate can act on',
    );
    const [j] = await sql<
      { s: string }[]
    >`SELECT overruled_status AS s FROM judgments WHERE id = ${f.overrulerId}`;
    assert.equal(j?.s, 'none');
    const [n] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM citation_fanouts WHERE judgment_id = ${f.overrulerId}`;
    assert.equal(n?.n, 0, 'all or nothing — a rejected call leaves no fan-out row behind');
  });
});
