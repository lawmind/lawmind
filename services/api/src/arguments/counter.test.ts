import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

type Body = { ok: boolean; data?: Record<string, unknown>; error?: { code: string } };

const post = async (payload: unknown): Promise<{ status: number; body: Body }> => {
  const res = await app.request('/arguments/counter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as Body };
};

describe('POST /arguments/counter', () => {
  after(async () => {
    await sql.end();
  });

  it('returns grounded authorities with all three citation fields', async () => {
    const { status, body } = await post({
      position: 'the accused is entitled to anticipatory bail on parity with a co-accused',
      language: 'en',
    });
    assert.equal(status, 200);
    const authorities = (body.data?.['authorities'] ?? []) as Record<string, unknown>[];
    for (const a of authorities) {
      assert.ok(a['judgmentId'], 'every authority must resolve to a corpus judgment');
      assert.equal(a['verificationState'], 'verified');
      assert.equal(a['verifiedBySource'], 'corpus');
      assert.ok(a['asOf'], 'asOf required wherever overruledStatus appears');
    }
  });

  it('never returns a set_aside authority as usable', async () => {
    const { body } = await post({ position: 'bail in a dowry death case', language: 'en' });
    const authorities = (body.data?.['authorities'] ?? []) as Record<string, unknown>[];
    for (const a of authorities) {
      // set_aside is the one state that disables use of an authority.
      assert.notEqual(a['overruledStatus'], 'set_aside');
    }
  });

  it('names excluded authorities rather than dropping them', async () => {
    const { body } = await post({ position: 'bail in a dowry death case', language: 'en' });
    const excluded = (body.data?.['excluded'] ?? []) as Record<string, unknown>[];
    // Silently removing a set_aside authority IS a silent drop, measured at a
    // zero threshold. An advocate needs to know it exists and is dead.
    for (const e of excluded) {
      assert.ok(e['judgmentId']);
      assert.ok(e['caseTitle'], 'an exclusion must name what was excluded');
      assert.equal(e['reason'], 'set_aside');
    }
  });

  it('always carries unverifiedReferences, never empty-by-omission', async () => {
    const { body } = await post({ position: 'anticipatory bail', language: 'en' });
    assert.ok(
      'unverifiedReferences' in (body.data ?? {}),
      'the key is always present so the client never distinguishes absent from none',
    );
  });

  it('does not fabricate argument prose in S1', async () => {
    // Generation waits for S2. A manufactured argument beside a real citation is
    // the contamination the harness exists to prevent.
    const { body } = await post({ position: 'anticipatory bail', language: 'en' });
    const authorities = (body.data?.['authorities'] ?? []) as Record<string, unknown>[];
    for (const a of authorities) {
      assert.ok(!('argument' in a), 'no generated argument text before S2');
      assert.ok(!('rebuttal' in a), 'no generated rebuttal text before S2');
    }
  });

  it('rejects an empty position through the shared validator', async () => {
    const { status, body } = await post({ position: '', language: 'en' });
    assert.equal(status, 400);
    assert.equal(body.error?.code, 'INVALID_REQUEST');
  });
});
