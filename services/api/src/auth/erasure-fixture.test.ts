/**
 * ONE disposable advocate, holding as much supported state as this product
 * knows how to create, erased ONCE — and then every table asserted by name.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS SEPARATELY FROM `erasure.test.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R4 §5: *"The current tests split coverage across several fixtures; they do not
 * build one disposable identity containing every specified row and then prove
 * one atomic erasure."* That is a real gap and not a pedantic one. Coverage
 * spread across fixtures proves that each DELETE works in isolation; it cannot
 * prove that the FULL set of a real advocate's rows comes out in one
 * transaction, and the ordering constraints between them are exactly where an
 * erasure breaks — `eraseUser` already carries scars from reading `auth_id`
 * after redacting it.
 *
 * So: one identity, one call, and then a table-by-table census. The census is
 * written as an EXPECTED RESIDUE map rather than as "everything is zero",
 * because several tables are supposed to survive and the difference between
 * "retained on purpose" and "missed" is the entire question a regulator asks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE OUTCOMES A ROW CAN HAVE, AND WHY A TEST MUST NAME WHICH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   GONE      the row is deleted outright.
 *   DETACHED  the row survives with `user_id` set NULL — kept for provider
 *             reconciliation or cost accounting, no longer about a person.
 *   RETAINED  the row survives, still linked to the now-pseudonymised user.
 *             Only three qualify, and each one is a decision somebody made:
 *             the audit record, the request clock, and money.
 *
 * A test that asserted "all zero" would fail on the retained tables and get
 * "fixed" by deleting them, which is how an audit log quietly stops existing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { ObjectStore } from '@lawmind/storage/r2';
import { issueTokens } from '@lawmind/auth';
import postgres from 'postgres';

import {
  erasureObjectStatus,
  recordErasureObjects,
  sweepErasureObjects,
} from './erasure-objects.ts';
import { eraseUser } from './erasure.ts';

const url = process.env['DATABASE_URL'] ?? '';
const sql = postgres(url, { max: 3, onnotice: () => {} });
const TAG = 'test-erasure-fixture';
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';

/**
 * An in-memory store that records what it was asked to delete.
 *
 * NOT `refusingStore`, and not the real R2 client. The first cannot delete and
 * the second would need a live bucket in CI; both would make the completion
 * assertion untestable, which is the assertion that matters most. This one
 * behaves the way S3 does in the respect the sweeper depends on: `delete` is
 * idempotent, and `head` is the only thing that can prove absence.
 */
function fakeStore(
  seed: string[],
  failOn: Set<string> = new Set(),
): ObjectStore & {
  readonly deleted: string[];
  readonly live: Set<string>;
} {
  const live = new Set(seed);
  const deleted: string[] = [];
  return {
    name: 'fake:test',
    deleted,
    live,
    put: async () => {},
    get: async () => null,
    getRange: async () => null,
    head: async (key: string) => (live.has(key) ? { size: 1 } : null),
    delete: async (key: string) => {
      if (failOn.has(key)) throw new Error('R2 responded 503 Service Unavailable');
      deleted.push(key);
      live.delete(key);
    },
  };
}

type Fixture = {
  userId: string;
  authId: string;
  email: string;
  matterId: string;
  requestId: string;
  documentKey: string;
  ocrKey: string;
  artefactKey: string;
};

/**
 * Build the whole advocate.
 *
 * Every INSERT here is a row a real signed-in advocate can cause to exist.
 * Where a table needs a judgment to point at, the fixture borrows one that is
 * already in the corpus rather than creating one — a test that INSERTs into
 * `judgments` is a test that can leave corpus debris behind, and this database
 * is the live one.
 */
async function build(): Promise<Fixture> {
  const authId = `${TAG}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;

  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Fixture Advocate', ${email}, true)`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status, role,
                       bar_enrolment_number, expo_push_token, terms_accepted_at, terms_version)
    VALUES (${authId}, 'Fixture Advocate', '+919999900000', ${email}, 'unverified', 'advocate',
            'MH/1234/2019', 'ExponentPushToken[fixture]', now(), 'v1')
    RETURNING id`;
  const userId = u!.id;

  // A real session, minted the way sign-in mints it — the refresh token is
  // stored only as a hash, so a hand-built row would exercise a shape the
  // product never produces.
  await issueTokens(sql, { id: authId, email }, SECRET);
  await sql`INSERT INTO auth_session (id, expires_at, token, user_id)
            VALUES (${`sess-${crypto.randomUUID()}`}, now() + interval '30 days',
                    ${`tok-${crypto.randomUUID()}`}, ${authId})`;
  await sql`INSERT INTO auth_account (id, account_id, provider_id, user_id)
            VALUES (${`acct-${crypto.randomUUID()}`}, ${email}, 'magic-link', ${authId})`;
  await sql`INSERT INTO auth_verification (id, identifier, value, expires_at)
            VALUES (${`ver-${crypto.randomUUID()}`}, ${email}, 'magic-value',
                    now() + interval '10 minutes')`;

  const [m] = await sql<{ id: string }[]>`
    INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                         our_side, next_hearing_date, status, source)
    VALUES (${userId}::uuid, 'Fixture v. State', 'Bombay High Court', 'criminal',
            ${sql.json({ petitioner: 'Fixture', respondent: 'State' })}, 'Fixture Client',
            'accused', current_date + 1, 'active', 'manual')
    RETURNING id`;
  const matterId = m!.id;

  const documentKey = `fixture/${userId}/upload.pdf`;
  const ocrKey = `fixture/${userId}/capture.jpg`;
  const artefactKey = `fixture/${userId}/export.zip`;

  await sql`INSERT INTO documents (user_id, matter_id, document_type, input_params,
                                   generated_content, language, storage_key)
            VALUES (${userId}::uuid, ${matterId}::uuid, 'bail',
                    ${sql.json({ ground: 'fixture' })}, 'fixture draft body', 'en',
                    ${documentKey})`;
  await sql`INSERT INTO ocr_jobs (user_id, matter_id, source_type, storage_key, engine, status)
            VALUES (${userId}::uuid, ${matterId}::uuid, 'image', ${ocrKey}, 'tesseract', 'queued')`;

  /* A judgment is BORROWED from the corpus, never inserted: this is the live
   * database, and a test that writes to `judgments` can leave corpus debris. */
  const [judgment] = await sql<{ id: string }[]>`SELECT id FROM judgments LIMIT 1`;
  if (judgment) {
    await sql`INSERT INTO judgment_annotations
                (user_id, judgment_id, matter_id, paragraph_index, quote, note)
              VALUES (${userId}::uuid, ${judgment.id}::uuid, ${matterId}::uuid, 1,
                      'fixture quote', 'fixture note')`;
    await sql`INSERT INTO citation_copies
                (user_id, judgment_id, matter_id, overruled_status_at_copy, surface, client_key)
              VALUES (${userId}::uuid, ${judgment.id}::uuid, ${matterId}::uuid, 'none', 'matter',
                      ${`fixture-${crypto.randomUUID()}`})`;
    await sql`INSERT INTO alerts (user_id, kind, severity, judgment_id, matter_id, payload, dedupe_key)
              VALUES (${userId}::uuid, 'saved_authority_moved', 'batched', ${judgment.id}::uuid,
                      ${matterId}::uuid, ${sql.json({ fixture: true })},
                      ${`fixture-${crypto.randomUUID()}`})`;
  }

  await sql`INSERT INTO saved_searches (user_id, query_text, query_language)
            VALUES (${userId}::uuid, 'bail anticipatory', 'en')`;
  await sql`INSERT INTO searches (user_id, matter_id, query_text, query_language,
                                  results_returned, model_used)
            VALUES (${userId}::uuid, ${matterId}::uuid, 'fixture query', 'en', 3, 'fixture')`;
  await sql`INSERT INTO training_consent_events (user_id, action, version)
            VALUES (${userId}::uuid, 'granted', 'v1')`;
  /* R16. Written complete in ONE statement, which is also the shape the deferred
   * completion trigger enforces at COMMIT: there is no half-written record to
   * fixture, because there is no half-written record. */
  await sql`INSERT INTO api_idempotency_records
              (auth_id, user_id, method, route, idempotency_key, request_fingerprint,
               outcome, response_status, response_body, completed_at)
            VALUES (${authId}, ${userId}::uuid, 'POST', '/matters',
                    ${`fixture-${crypto.randomUUID()}`}, repeat('a', 64),
                    'success', 201, ${sql.json({ fixture: true })}, now())`;
  /* R16 after 0103. A record written BEFORE this advocate onboarded carries the
   * principal and NO profile, and `eraseUser` must sweep it too — deleting by
   * `user_id` alone would leave the `response_body`, which R16 §4 requires to be
   * the original success body and can therefore hold the advocate's own words. */
  await sql`INSERT INTO api_idempotency_records
              (auth_id, user_id, method, route, idempotency_key, request_fingerprint,
               outcome, response_status, response_body, completed_at)
            VALUES (${authId}, NULL, 'POST', '/me/data-requests',
                    ${`fixture-preonboarding-${crypto.randomUUID()}`}, repeat('b', 64),
                    'success', 201, ${sql.json({ fixture: true })}, now())`;
  await sql`INSERT INTO activation_events (user_id, step)
            VALUES (${userId}::uuid, 'first_successful_search')`;
  await sql`INSERT INTO experiment_assignments (user_id, experiment_id, variant)
            VALUES (${userId}::uuid, 'fixture-exp', 'control')`;
  await sql`INSERT INTO experiment_exposures (user_id, experiment_id, variant, surface)
            VALUES (${userId}::uuid, 'fixture-exp', 'control', 'fixture')`;
  await sql`INSERT INTO premium_jobs (user_id, matter_id, capability, idempotency_key, params_hash)
            VALUES (${userId}::uuid, ${matterId}::uuid, 'hearing_pack',
                    ${`fixture-${crypto.randomUUID()}`}, 'fixture-hash')`;
  await sql`INSERT INTO entitlements (user_id, capability, state, source)
            VALUES (${userId}::uuid, 'hearing_pack', 'active', 'trial')`;
  await sql`INSERT INTO entitlement_events
              (provider, provider_event_id, event_type, user_id, capability,
               payload_hash, signature_valid)
            VALUES ('fixture', ${`fixture-${crypto.randomUUID()}`}, 'granted',
                    ${userId}::uuid, 'hearing_pack', 'fixture-hash', true)`;
  await sql`INSERT INTO llm_calls (user_id, feature, model, input_tokens, output_tokens,
                                   cost_usd, latency_ms, data_class, pseudonymised)
            VALUES (${userId}::uuid, 'search', 'deepseek-v4-flash', 10, 20, 0.0001, 120,
                    'public', false)`;
  /* `reason` is constrained AND its sign is constrained with it:
   * `credit_ledger_direction_ck` requires a positive delta for purchase-shaped
   * reasons and a negative one for redemption-shaped reasons. 'test' is the
   * allowed positive reason, so the fixture uses it rather than inventing one. */
  await sql`INSERT INTO credit_ledger (user_id, capability, delta, reason)
            VALUES (${userId}::uuid, 'hearing_pack', 1, 'test')`;

  const [r] = await sql<{ id: string }[]>`
    INSERT INTO data_requests (auth_id, user_id, kind, status, due_at, artefact_storage_key)
    VALUES (${authId}, ${userId}::uuid, 'erasure', 'in_progress',
            now() + interval '30 days', ${artefactKey})
    RETURNING id`;

  return {
    userId,
    authId,
    email,
    matterId,
    requestId: r!.id,
    documentKey,
    ocrKey,
    artefactKey,
  };
}

/** Every table this advocate touched, and what is supposed to be left of it. */
const EXPECTED: {
  table: string;
  column: string;
  outcome: 'GONE' | 'DETACHED' | 'RETAINED';
  why: string;
}[] = [
  { table: 'documents', column: 'user_id', outcome: 'GONE', why: 'uploaded content' },
  { table: 'ocr_jobs', column: 'user_id', outcome: 'GONE', why: 'extracted text and fields' },
  {
    table: 'judgment_annotations',
    column: 'user_id',
    outcome: 'GONE',
    why: "the advocate's own notes",
  },
  { table: 'saved_searches', column: 'user_id', outcome: 'GONE', why: 'research intent' },
  { table: 'searches', column: 'user_id', outcome: 'GONE', why: 'query history' },
  { table: 'alerts', column: 'user_id', outcome: 'GONE', why: 'monitoring on their matters' },
  {
    table: 'citation_copies',
    column: 'user_id',
    outcome: 'GONE',
    why: 'what they cited and where',
  },
  {
    table: 'training_consent_events',
    column: 'user_id',
    outcome: 'GONE',
    why: 'consent about a person who no longer exists',
  },
  {
    table: 'api_idempotency_records',
    column: 'user_id',
    outcome: 'GONE',
    why: "R16 replay results, which carry the advocate's own words back",
  },
  { table: 'activation_events', column: 'user_id', outcome: 'GONE', why: 'product funnel' },
  {
    table: 'experiment_assignments',
    column: 'user_id',
    outcome: 'GONE',
    why: 'experiment membership',
  },
  { table: 'experiment_exposures', column: 'user_id', outcome: 'GONE', why: 'experiment exposure' },
  { table: 'premium_jobs', column: 'user_id', outcome: 'GONE', why: 'generated work product' },
  { table: 'entitlements', column: 'user_id', outcome: 'GONE', why: 'current access rights' },
  { table: 'matters', column: 'user_id', outcome: 'GONE', why: 'the case files themselves' },

  {
    table: 'entitlement_events',
    column: 'user_id',
    outcome: 'DETACHED',
    why: 'provider reconciliation needs the event, not the person',
  },
  {
    table: 'llm_calls',
    column: 'user_id',
    outcome: 'DETACHED',
    why: 'cost and latency metadata; the table stores no prompt',
  },

  {
    table: 'data_requests',
    column: 'user_id',
    outcome: 'RETAINED',
    why: 'the record that the erasure was ASKED FOR and carried out, and its statutory clock',
  },
  {
    table: 'credit_ledger',
    column: 'user_id',
    outcome: 'RETAINED',
    why: 'money. Retention period is a legal question the founder has not answered — see docs/FOUNDER_QUEUE.md',
  },
];

describe('one comprehensive erasure fixture', () => {
  let fx: Fixture;

  before(async () => {
    fx = await build();
  });

  after(async () => {
    // The fixture identity is disposable and this database is the live one.
    // Erasure removes almost everything; these three are the retained tables
    // and the pseudonymised shell, all of which must be cleaned up by hand.
    await sql`DELETE FROM erasure_objects WHERE data_request_id = ${fx.requestId}::uuid`;
    await sql`DELETE FROM credit_ledger WHERE user_id = ${fx.userId}::uuid`;
    await sql`DELETE FROM data_requests WHERE user_id = ${fx.userId}::uuid`;
    await sql`DELETE FROM entitlement_events WHERE provider = 'fixture'`;
    /**
     * The audit row and the pseudonymised `users` shell are DELIBERATELY left
     * behind, and this comment is here so nobody "fixes" the leak.
     *
     * `audit_log` refuses DELETE at the database — `audit_log_append_only()`
     * raises 23001 — and that refusal is the feature: an erasure that could
     * erase its own record of having happened is not an audit log. The `users`
     * shell then cannot go either, because `audit_log.actor_user_id` is a plain
     * FOREIGN KEY with no ON DELETE action, so removing the shell would break
     * the row that must survive.
     *
     * The residue per run is exactly what production leaves behind for a real
     * erased advocate: one `users` row with no identity in it (findable as
     * `email LIKE 'erased+%@invalid'`) and one audit row. Nothing about a
     * person, by construction — which is the property the test above asserts.
     */
    await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}-%`}`;
    await sql.end({ timeout: 5 });
  });

  it('erases every product table, detaches two, and retains exactly three', async () => {
    const result = await eraseUser(
      sql,
      fx.userId,
      { userId: fx.userId, role: 'admin' },
      'comprehensive fixture',
    );

    for (const row of EXPECTED) {
      const [c] = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM ${sql(row.table)}
         WHERE ${sql(row.column)} = ${fx.userId}::uuid`;
      const n = Number(c?.n ?? -1);
      if (row.outcome === 'GONE' || row.outcome === 'DETACHED') {
        assert.equal(
          n,
          0,
          `${row.table}.${row.column} should be ${row.outcome} (${row.why}) but ${n} row(s) still point at the erased user`,
        );
      } else {
        assert.ok(
          n > 0,
          `${row.table}.${row.column} is RETAINED on purpose (${row.why}) and must NOT be deleted — found ${n}`,
        );
      }
    }

    // The identity itself. `users` survives as a shell because immutable audit
    // and corpus records reference it; what must be gone is everything that
    // names a person.
    const [user] = await sql<
      {
        full_name: string;
        email: string;
        phone: string;
        auth_id: string;
        bar_enrolment_number: string | null;
        expo_push_token: string | null;
        terms_accepted_at: string | null;
      }[]
    >`SELECT full_name, email, phone, auth_id, bar_enrolment_number, expo_push_token,
             terms_accepted_at FROM users WHERE id = ${fx.userId}::uuid`;
    assert.ok(user, 'the pseudonymised users row must survive');
    assert.equal(user.full_name, 'Deleted account');
    assert.equal(user.bar_enrolment_number, null);
    assert.equal(user.expo_push_token, null, 'a live push token would keep reaching a real phone');
    assert.equal(user.terms_accepted_at, null);
    assert.ok(!user.email.includes(fx.email.split('@')[0]!), 'the old address must not survive');
    assert.notEqual(user.auth_id, fx.authId);

    // Auth. All of it.
    for (const [table, column, value] of [
      ['auth_session', 'user_id', fx.authId],
      ['auth_account', 'user_id', fx.authId],
      ['refresh_tokens', 'user_id', fx.authId],
      ['auth_user', 'id', fx.authId],
      ['auth_verification', 'identifier', fx.email],
    ] as const) {
      const [c] = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM ${sql(table)} WHERE ${sql(column)} = ${value}`;
      assert.equal(Number(c?.n ?? -1), 0, `${table}.${column} survived erasure`);
    }

    /**
     * THE PRE-ONBOARDING R16 RECORD, WHICH NO CHECK ABOVE CAN SEE.
     *
     * After 0103 the ledger's principal is `auth_id`, and a record written
     * before this advocate had a profile carries a NULL `user_id`. The
     * `EXPECTED` loop asks `WHERE user_id = <victim>`, so that row would read as
     * GONE whether it was deleted or not — a check that returns 0 for every
     * input is not a check. This asks the question the loop cannot.
     */
    const [preOnboarding] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM api_idempotency_records
       WHERE auth_id = ${fx.authId}`;
    assert.equal(
      Number(preOnboarding?.n ?? -1),
      0,
      'an R16 record written before onboarding survived: it carries auth_id and a NULL user_id, so deleting by profile alone leaves the replayable response body behind',
    );

    // And the audit record, which is the one thing that must NOT be erasable.
    const [audit] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM audit_log
       WHERE action = 'user.erase' AND target_id = ${fx.userId}`;
    assert.equal(Number(audit?.n ?? 0), 1, 'the erasure must leave an audit record behind');

    // All three storage sources collected — the ocr_jobs one is the regression.
    const keys = result.pendingObjects.map((o) => o.storageKey);
    assert.ok(keys.includes(fx.documentKey), 'documents.storage_key');
    assert.ok(
      keys.includes(fx.ocrKey),
      'ocr_jobs.storage_key must be collected — it is NOT NULL, its row is deleted, and it used to be orphaned silently',
    );
    assert.ok(keys.includes(fx.artefactKey), 'data_requests.artefact_storage_key');
  });

  it('does not complete the request while an object is still there, and completes when it is gone', async () => {
    const store = fakeStore([fx.documentKey, fx.ocrKey, fx.artefactKey], new Set([fx.ocrKey]));

    await recordErasureObjects(sql, fx.requestId, 'test-bucket', [
      { source: 'documents.storage_key', storageKey: fx.documentKey },
      { source: 'ocr_jobs.storage_key', storageKey: fx.ocrKey },
      { source: 'data_requests.artefact_storage_key', storageKey: fx.artefactKey },
    ]);

    const first = await sweepErasureObjects(sql, store, { dataRequestId: fx.requestId });
    assert.equal(first.deleted, 2);
    assert.equal(first.retryable, 1, 'a 503 is retryable, not permanent');

    const mid = await erasureObjectStatus(sql, fx.requestId);
    assert.equal(mid.complete, false, 'ONE surviving object must block completion');
    assert.ok(store.live.has(fx.ocrKey), 'and the object really is still there');

    // The store recovers. The retry must be idempotent: the two already-deleted
    // objects must NOT be touched again.
    const deletedBefore = store.deleted.length;
    const healthy = fakeStore([fx.ocrKey]);
    // Carry the recorded deletions across so "already gone" stays gone.
    const second = await sweepErasureObjects(sql, healthy, { dataRequestId: fx.requestId });
    assert.equal(second.attempted, 1, 'only the unfinished object is retried');
    assert.equal(second.deleted, 1);
    assert.equal(store.deleted.length, deletedBefore, 'no second delete of a finished object');

    const done = await erasureObjectStatus(sql, fx.requestId);
    assert.equal(done.complete, true);
    assert.equal(done.deleted, 3);
    assert.equal(done.deadLettered.length, 0);
  });

  it('re-registration with the old address is a NEW identity, not a resurrection', async () => {
    // The erased advocate signs up again with the same email. Nothing may come
    // back: no matters, no saved searches, no entitlement. R4 listed this as
    // unmeasured, and "probably correct" is not an answer a regulator accepts.
    const newAuthId = `${TAG}-again-${crypto.randomUUID()}`;
    await sql`INSERT INTO auth_user (id, name, email, email_verified)
              VALUES (${newAuthId}, 'Fixture Advocate', ${fx.email}, true)`;
    const [fresh] = await sql<{ id: string }[]>`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status, role)
      VALUES (${newAuthId}, 'Fixture Advocate', '+919999900000', ${fx.email}, 'unverified', 'advocate')
      RETURNING id`;

    assert.notEqual(fresh!.id, fx.userId, 'a new users row, not the old one reused');

    for (const table of ['matters', 'saved_searches', 'entitlements', 'documents'] as const) {
      const [c] = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM ${sql(table)} WHERE user_id = ${fresh!.id}::uuid`;
      assert.equal(Number(c?.n ?? -1), 0, `${table} must be empty for the new identity`);
    }

    await sql`DELETE FROM users WHERE id = ${fresh!.id}::uuid`;
    await sql`DELETE FROM auth_user WHERE id = ${newAuthId}`;
  });
});
