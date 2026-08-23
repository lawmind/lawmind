/**
 * The commerce spine, tested for the properties that lose money when they fail.
 *
 * These are not CRUD tests. Every case below is a thing that goes wrong in
 * production and costs either a customer or a bill:
 *
 *   a redelivered webhook granting a second subscription
 *   a double-tap spending two credits for one pack
 *   a retry creating a second job and a second model bill
 *   a failed generation keeping the credit it consumed
 *   a forged billing event granting an entitlement
 *   a safety-critical fact ending up behind a paywall
 *
 * The concurrency cases run their two operations with `Promise.all` against the
 * real database, because a sequential test proves nothing about a race — every
 * check-then-write passes when the two halves are not interleaved.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { CAPABILITIES, isSafetyCritical } from './capabilities.ts';
import { creditBalance, issueCredit, redeemCredit, reverseRedemption } from './credits.ts';
import {
  entitlementsFor,
  grantEntitlement,
  requireCapability,
  revokeEntitlement,
  sweepExpired,
} from './entitlements.ts';
import { recordEvent, verifySignature } from './webhook.ts';
import { cancelJob, failJob, paramsHash, startJob, claimJob, requeueStalled } from '../premium/jobs.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 6, onnotice: () => {} });
const TAG = 'test-ent-';

async function seedUser(): Promise<string> {
  const authId = `${TAG}${crypto.randomUUID()}`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${authId + '@example.test'}, true)`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
    VALUES (${authId}, 'Adv', '+911111111111', ${authId + '@example.test'}, 'unverified')
    RETURNING id`;
  return u!.id;
}

after(async () => {
  const like = `${TAG}%`;
  const users = sql`SELECT id FROM users WHERE auth_id LIKE ${like}`;
  await sql`DELETE FROM credit_ledger WHERE user_id IN (${users})`;
  await sql`DELETE FROM premium_jobs WHERE user_id IN (${sql`SELECT id FROM users WHERE auth_id LIKE ${like}`})`;
  await sql`DELETE FROM entitlements WHERE user_id IN (${sql`SELECT id FROM users WHERE auth_id LIKE ${like}`})`;
  await sql`DELETE FROM entitlement_events WHERE provider = 'test-provider'`;
  await sql`DELETE FROM users WHERE auth_id LIKE ${like}`;
  await sql`DELETE FROM auth_user WHERE id LIKE ${like}`;
  await sql.end({ timeout: 5 });
});

describe('capabilities — the vocabulary', () => {
  it('a safety-critical capability can never be gated, even by an explicit ask', async () => {
    const userId = await seedUser();
    // The user holds nothing at all.
    assert.deepEqual(await entitlementsFor(sql, userId), []);
    const d = await requireCapability(sql, userId, 'adverse_treatment_visibility');
    assert.equal(d.ok, true);
    if (d.ok) assert.equal(d.via, 'never_gated');
  });

  it('every premium capability declares how it can be held; the safety one declares none', () => {
    for (const c of Object.values(CAPABILITIES)) {
      if (isSafetyCritical(c.name as never)) {
        assert.equal(c.grantModels.length, 0, `${c.name} is safety-critical and must not be sellable`);
      } else {
        assert.ok(c.grantModels.length > 0, `${c.name} has no grant model`);
      }
    }
  });
});

describe('entitlements — grants', () => {
  it('a redelivered purchase grants ONCE', async () => {
    const userId = await seedUser();
    const ref = `pr-${crypto.randomUUID()}`;
    const first = await grantEntitlement(sql, {
      userId,
      capability: 'hearing_pack',
      source: 'purchase',
      provider: 'test-provider',
      providerRef: ref,
    });
    const second = await grantEntitlement(sql, {
      userId,
      capability: 'hearing_pack',
      source: 'purchase',
      provider: 'test-provider',
      providerRef: ref,
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false, 'a redelivered event created a second entitlement');
    assert.equal(first.id, second.id);

    const [n] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM entitlements WHERE user_id = ${userId}`;
    assert.equal(n!.n, '1');
  });

  it('TWO SIMULTANEOUS deliveries of the same event still grant once', async () => {
    const userId = await seedUser();
    const ref = `pr-${crypto.randomUUID()}`;
    const grant = () =>
      grantEntitlement(sql, {
        userId,
        capability: 'hearing_pack',
        source: 'purchase',
        provider: 'test-provider',
        providerRef: ref,
      });
    await Promise.all([grant(), grant()]);
    const [n] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM entitlements WHERE user_id = ${userId}`;
    assert.equal(n!.n, '1', 'a concurrent redelivery created a second entitlement');
  });

  it('a purchase without a provider reference is refused rather than made unidempotent', async () => {
    const userId = await seedUser();
    await assert.rejects(
      () => grantEntitlement(sql, { userId, capability: 'hearing_pack', source: 'purchase' }),
      /providerRef/,
    );
  });

  it('an expired grant is not held, without waiting for any sweep', async () => {
    const userId = await seedUser();
    await grantEntitlement(sql, {
      userId,
      capability: 'matter_automation',
      source: 'subscription',
      provider: 'test-provider',
      providerRef: `sub-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() - 1000),
    });
    // The row still says `active`. The READ is what must be right.
    const [row] = await sql<{ state: string }[]>`
      SELECT state FROM entitlements WHERE user_id = ${userId}`;
    assert.equal(row!.state, 'active');
    const d = await requireCapability(sql, userId, 'matter_automation');
    assert.equal(d.ok, false, 'an expired entitlement was still honoured');

    // And the sweep exists to keep reporting honest, not to make the gate right.
    assert.ok((await sweepExpired(sql)) >= 1);
  });

  it('revocation requires a reason and takes the capability away', async () => {
    const userId = await seedUser();
    await grantEntitlement(sql, {
      userId,
      capability: 'premium_generation',
      source: 'purchase',
      provider: 'test-provider',
      providerRef: `pr-${crypto.randomUUID()}`,
    });
    assert.equal((await requireCapability(sql, userId, 'premium_generation')).ok, true);
    const n = await revokeEntitlement(
      sql,
      { userId, capability: 'premium_generation' },
      'chargeback',
    );
    assert.equal(n, 1);
    assert.equal((await requireCapability(sql, userId, 'premium_generation')).ok, false);
  });
});

describe('credits — the money invariant', () => {
  it('a redelivered purchase issues credit ONCE', async () => {
    const userId = await seedUser();
    const ref = `cr-${crypto.randomUUID()}`;
    const a = await issueCredit(sql, {
      userId,
      capability: 'hearing_pack',
      quantity: 1,
      reason: 'purchase',
      provider: 'test-provider',
      providerRef: ref,
    });
    const b = await issueCredit(sql, {
      userId,
      capability: 'hearing_pack',
      quantity: 1,
      reason: 'purchase',
      provider: 'test-provider',
      providerRef: ref,
    });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.balance, 1, 'a duplicate webhook doubled the balance');
  });

  it('TWO SIMULTANEOUS redemptions of ONE credit spend exactly one', async () => {
    const userId = await seedUser();
    await issueCredit(sql, {
      userId,
      capability: 'hearing_pack',
      quantity: 1,
      reason: 'purchase',
      provider: 'test-provider',
      providerRef: `cr-${crypto.randomUUID()}`,
    });

    // Two DIFFERENT jobs — the hard case. Same job id would be caught by the
    // unique index alone; different ids can only be stopped by the lock.
    const [r1, r2] = await Promise.all([
      redeemCredit(sql, { userId, capability: 'hearing_pack', premiumJobId: crypto.randomUUID() }),
      redeemCredit(sql, { userId, capability: 'hearing_pack', premiumJobId: crypto.randomUUID() }),
    ]);
    const succeeded = [r1, r2].filter((r) => r.ok).length;
    assert.equal(succeeded, 1, 'one credit paid for two jobs');

    const [balance] = (await creditBalance(sql, userId)).filter(
      (b) => b.capability === 'hearing_pack',
    );
    assert.equal(balance?.balance ?? 0, 0);
  });

  it('a RETRY of the same job returns the original redemption and does not spend twice', async () => {
    const userId = await seedUser();
    await issueCredit(sql, {
      userId,
      capability: 'hearing_pack',
      quantity: 2,
      reason: 'purchase',
      provider: 'test-provider',
      providerRef: `cr-${crypto.randomUUID()}`,
    });
    const jobId = crypto.randomUUID();
    const first = await redeemCredit(sql, { userId, capability: 'hearing_pack', premiumJobId: jobId });
    const retry = await redeemCredit(sql, { userId, capability: 'hearing_pack', premiumJobId: jobId });
    assert.equal(first.ok, true);
    assert.equal(retry.ok, true);
    if (first.ok && retry.ok) {
      assert.equal(retry.alreadyRedeemed, true);
      assert.equal(first.ledgerId, retry.ledgerId);
      assert.equal(retry.balanceAfter, 1, 'a network retry consumed a second credit');
    }
  });

  it('a failed generation gives the credit back, at most once', async () => {
    const userId = await seedUser();
    await issueCredit(sql, {
      userId,
      capability: 'hearing_pack',
      quantity: 1,
      reason: 'purchase',
      provider: 'test-provider',
      providerRef: `cr-${crypto.randomUUID()}`,
    });
    const jobId = crypto.randomUUID();
    await redeemCredit(sql, { userId, capability: 'hearing_pack', premiumJobId: jobId });
    assert.equal((await reverseRedemption(sql, jobId)).reversed, true);
    assert.equal((await reverseRedemption(sql, jobId)).reversed, false, 'reversed twice');
    const [balance] = (await creditBalance(sql, userId)).filter(
      (b) => b.capability === 'hearing_pack',
    );
    assert.equal(balance?.balance ?? 0, 1);
  });

  it('the database refuses a refund recorded as an ADDITION of credit', async () => {
    const userId = await seedUser();
    await assert.rejects(
      () => sql`INSERT INTO credit_ledger (user_id, capability, delta, reason)
                VALUES (${userId}, 'hearing_pack', 1, 'refund_reversal')`,
      /credit_ledger_direction_ck/,
      'a refund was allowed to add credit — 0078 did not apply',
    );
  });

  it('a recurring grant outranks a credit balance, so a subscriber spends nothing', async () => {
    const userId = await seedUser();
    await issueCredit(sql, {
      userId,
      capability: 'hearing_pack',
      quantity: 3,
      reason: 'purchase',
      provider: 'test-provider',
      providerRef: `cr-${crypto.randomUUID()}`,
    });
    await grantEntitlement(sql, {
      userId,
      capability: 'hearing_pack',
      source: 'subscription',
      provider: 'test-provider',
      providerRef: `sub-${crypto.randomUUID()}`,
    });
    const d = await requireCapability(sql, userId, 'hearing_pack');
    assert.equal(d.ok, true);
    if (d.ok) assert.equal(d.via, 'recurring', 'a subscriber was routed at their own credits');
  });
});

describe('premium jobs — a repeated tap must not buy the work twice', () => {
  it('the same idempotency key returns the SAME job', async () => {
    const userId = await seedUser();
    const key = `tap-${crypto.randomUUID()}`;
    const a = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: key,
      params: { matter: 'x', hearing: '2026-09-01' },
    });
    const b = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: key,
      params: { matter: 'x', hearing: '2026-09-01' },
    });
    assert.equal(a.ok && b.ok, true);
    if (a.ok && b.ok) {
      assert.equal(a.created, true);
      assert.equal(b.created, false);
      assert.equal(a.job.id, b.job.id);
    }
  });

  it('the SAME WORK under a DIFFERENT key still returns the live job', async () => {
    const userId = await seedUser();
    const params = { matter: 'y', hearing: '2026-09-02' };
    const a = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: `k1-${crypto.randomUUID()}`,
      params,
    });
    const b = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: `k2-${crypto.randomUUID()}`,
      params,
    });
    assert.equal(a.ok && b.ok, true);
    if (a.ok && b.ok) assert.equal(b.job.id, a.job.id, 'a reinstalled app re-bought the same pack');
  });

  it('TWO SIMULTANEOUS taps create exactly one job', async () => {
    const userId = await seedUser();
    const key = `tap-${crypto.randomUUID()}`;
    const tap = () =>
      startJob(sql, {
        userId,
        capability: 'hearing_pack',
        idempotencyKey: key,
        params: { matter: 'z' },
      });
    await Promise.all([tap(), tap()]);
    const [n] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM premium_jobs WHERE user_id = ${userId}`;
    assert.equal(n!.n, '1', 'a double tap created two jobs and two model bills');
  });

  it('the per-user cap REFUSES rather than queueing invisibly', async () => {
    const userId = await seedUser();
    for (let i = 0; i < 2; i += 1) {
      const r = await startJob(sql, {
        userId,
        capability: 'hearing_pack',
        idempotencyKey: `cap-${i}-${crypto.randomUUID()}`,
        params: { n: i },
      });
      assert.equal(r.ok, true);
    }
    const third = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: `cap-3-${crypto.randomUUID()}`,
      params: { n: 3 },
    });
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.code, 'USER_CAP');
  });

  it('the attempt is consumed at CLAIM, so a crash loop cannot bill forever', async () => {
    const userId = await seedUser();
    const started = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: `att-${crypto.randomUUID()}`,
      params: { n: 1 },
      maxAttempts: 2,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;

    const first = await claimJob(sql, started.job.id);
    assert.equal(first?.attempts, 1);
    // A failure below the ceiling requeues; at the ceiling it is exhausted.
    assert.equal((await failJob(sql, started.job.id, 'provider_timeout')).exhausted, false);
    const second = await claimJob(sql, started.job.id);
    assert.equal(second?.attempts, 2);
    assert.equal((await failJob(sql, started.job.id, 'provider_timeout')).exhausted, true);
    // Exhausted: no third claim.
    assert.equal(await claimJob(sql, started.job.id), null);
  });

  it('a stalled worker is requeued on SILENCE, not on exit', async () => {
    const userId = await seedUser();
    const started = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: `stall-${crypto.randomUUID()}`,
      params: { n: 1 },
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    await claimJob(sql, started.job.id);
    // The worker is still "running" as far as any process table is concerned.
    await sql`UPDATE premium_jobs SET heartbeat_at = now() - interval '30 minutes'
               WHERE id = ${started.job.id}`;
    assert.ok((await requeueStalled(sql)) >= 1);
    const [row] = await sql<{ state: string }[]>`
      SELECT state FROM premium_jobs WHERE id = ${started.job.id}`;
    assert.equal(row!.state, 'queued');
  });

  it('cancellation is a state, never a delete, and cannot un-finish a job', async () => {
    const userId = await seedUser();
    const started = await startJob(sql, {
      userId,
      capability: 'hearing_pack',
      idempotencyKey: `can-${crypto.randomUUID()}`,
      params: { n: 1 },
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.equal((await cancelJob(sql, started.job.id, userId)).cancelled, true);
    // The row is still there, carrying what it cost.
    const [row] = await sql<{ state: string }[]>`
      SELECT state FROM premium_jobs WHERE id = ${started.job.id}`;
    assert.equal(row!.state, 'cancelled');
    // A second cancel is a no-op, not an error, and cannot reopen it.
    assert.equal((await cancelJob(sql, started.job.id, userId)).cancelled, false);
  });

  it('the params hash is order-independent and does not carry matter text', () => {
    const a = paramsHash('hearing_pack', { b: 2, a: 1 });
    const b = paramsHash('hearing_pack', { a: 1, b: 2 });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });
});

describe('billing webhooks — nothing is granted on an unverified event', () => {
  const SECRET = 'test-webhook-secret';

  it('an absent secret REFUSES; there is no development bypass', () => {
    const r = verifySignature('{}', 'anything', undefined);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /no webhook secret/);
  });

  it('a wrong signature does not verify', () => {
    assert.equal(verifySignature('{}', 'deadbeef', SECRET).ok, false);
    assert.equal(verifySignature('{}', null, SECRET).ok, false);
  });

  it('a forged event is STORED and marked unactionable rather than discarded', async () => {
    const rec = await recordEvent(
      sql,
      {
        provider: 'test-provider',
        providerEventId: `evt-${crypto.randomUUID()}`,
        eventType: 'purchase',
        rawBody: '{"forged":true}',
        signature: 'not-a-real-signature',
        providerSentAt: new Date(),
        userId: null,
        capability: 'hearing_pack',
      },
      SECRET,
    );
    assert.equal(rec.outcome, 'rejected_signature');
    assert.equal(rec.actionable, false, 'a forged billing event was actionable');
    const [row] = await sql<{ signature_valid: boolean }[]>`
      SELECT signature_valid FROM entitlement_events WHERE id = ${rec.id}`;
    assert.equal(row!.signature_valid, false, 'the forged event was not kept as evidence');
  });

  it('an event for an unknown user is deferred, never dropped', async () => {
    const body = '{"customer":"nobody-yet"}';
    const rec = await recordEvent(
      sql,
      {
        provider: 'test-provider',
        providerEventId: `evt-${crypto.randomUUID()}`,
        eventType: 'purchase',
        rawBody: body,
        signature: signFor(body, SECRET),
        providerSentAt: new Date(),
        userId: null,
        capability: 'hearing_pack',
      },
      SECRET,
    );
    assert.equal(rec.outcome, 'deferred_unknown_user');
    assert.equal(rec.actionable, false);
  });

  it('a redelivered event is a duplicate with no second effect', async () => {
    const userId = await seedUser();
    const body = '{"customer":"known"}';
    const id = `evt-${crypto.randomUUID()}`;
    const send = () =>
      recordEvent(
        sql,
        {
          provider: 'test-provider',
          providerEventId: id,
          eventType: 'purchase',
          rawBody: body,
          signature: signFor(body, SECRET),
          providerSentAt: new Date(),
          userId,
          capability: 'hearing_pack',
        },
        SECRET,
      );
    const first = await send();
    const second = await send();
    assert.equal(first.outcome, 'applied');
    assert.equal(first.actionable, true);
    assert.equal(second.outcome, 'duplicate');
    assert.equal(second.actionable, false, 'a redelivered event would have granted twice');
  });

  it('an event older than the replay window is rejected even with a valid signature', async () => {
    const body = '{"captured":true}';
    const rec = await recordEvent(
      sql,
      {
        provider: 'test-provider',
        providerEventId: `evt-${crypto.randomUUID()}`,
        eventType: 'purchase',
        rawBody: body,
        signature: signFor(body, SECRET),
        providerSentAt: new Date(Date.now() - 60 * 60_000),
        userId: await seedUser(),
        capability: 'hearing_pack',
      },
      SECRET,
    );
    assert.equal(rec.outcome, 'rejected_stale');
    assert.equal(rec.actionable, false);
  });

  it('the stored payload hash is a hash, and no body column exists to leak into', async () => {
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'entitlement_events'`;
    const names = cols.map((c) => c.column_name);
    assert.ok(names.includes('payload_hash'));
    for (const forbidden of ['payload', 'body', 'raw_body', 'email']) {
      assert.ok(!names.includes(forbidden), `entitlement_events carries a ${forbidden} column`);
    }
  });
});

/** The default hasher, mirrored so the test signs exactly as `verifySignature` checks. */
function signFor(body: string, secret: string): string {
  return createHash('sha256').update(`${secret}.${body}`).digest('hex');
}
