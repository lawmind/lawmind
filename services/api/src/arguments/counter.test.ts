import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';
import { Hono } from 'hono';

import { createApp } from '../app.ts';
import { counterRequest, handleCounter } from './counter.ts';
import { capabilityState } from '../release/capabilities.ts';

/**
 * A statement timeout, because production has one and this test did not.
 *
 * `/arguments/counter` runs the same `hybridSearch` as `/search`, and two of the
 * positions below — "anticipatory bail", "bail in a dowry death case" — are
 * short common-term concept queries, which is precisely the shape LCC measured
 * as NOT rescued by the bounded rarest-3 arm (bus 1041 §2): the three rarest of
 * four lexemes are still common legal vocabulary, so the AND match set is
 * enormous and `ORDER BY ts_rank` reads every matching tsvector.
 *
 * Production bounds that on the research pool. This file opened a bare
 * connection with NO timeout, so the same query that production cancels ran
 * unbounded here — measured at **3,235,480 ms** in one full-suite run, which is
 * why the whole suite could not complete. The bound is not a workaround; it
 * makes the test exercise what production actually does.
 */
const sql = postgres(process.env['DATABASE_URL'] ?? '', {
  max: 2,
  onnotice: () => {},
  connection: { statement_timeout: 20_000 },
});
const app = createApp({
  ping: async () => {},
  search: { sql, researchSql: sql, embedQuery: async () => null },
});

type Body = { ok: boolean; data?: Record<string, unknown>; error?: { code: string } };

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE GROUNDING TESTS NO LONGER GO THROUGH THE MOUNTED ROUTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R8.3 §5.6 turns `generation.counterarguments` OFF for LIMITED V1 and §6
 * requires the server to ENFORCE that, so `POST /arguments/counter` now returns
 * 409 before the handler runs. Pointed at the mounted route, four of the seven
 * tests below would still have PASSED — they iterate `body.data.authorities`,
 * which a 409 does not have, so the loops execute zero times and assert nothing.
 * A suite that goes green by never running its assertions is worse than one that
 * fails, and this file would have become exactly that.
 *
 * So the two questions are separated. The grounding rules — every authority
 * resolves to a corpus judgment, no `set_aside` authority is usable, an
 * exclusion is NAMED rather than dropped, no fabricated prose — are properties
 * of the HANDLER and must stay proven while the capability is off, because they
 * are what has to still be true on the day it is turned on. The REFUSAL is a
 * property of the mounted route and is tested against the real app.
 */
const bare = new Hono();
bare.post('/counter', async (c) => {
  const parsed = counterRequest.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ ok: false, error: { code: 'INVALID_REQUEST' } }, 400);
  return handleCounter(c, { sql, researchSql: sql, embedQuery: async () => null }, parsed.data);
});

const post = async (payload: unknown): Promise<{ status: number; body: Body }> => {
  const res = await bare.request('/counter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as Body };
};

const postThroughRoute = async (payload: unknown): Promise<{ status: number; body: Body }> => {
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

  it('carries overruledByJudgmentId and overruledNote on authorities[], not only on excluded[]', async () => {
    // Found missing 11 Aug 2026 (RCC bus 0037): excluded[] always carried
    // both, authorities[] carried neither, so a partly_set_aside authority —
    // still usable, still returned — rendered no "what still stands" line.
    const { body } = await post({ position: 'anticipatory bail', language: 'en' });
    const authorities = (body.data?.['authorities'] ?? []) as Record<string, unknown>[];
    for (const a of authorities) {
      assert.ok('overruledByJudgmentId' in a, 'key must be present even when null');
      assert.ok('overruledNote' in a, 'key must be present even when null');
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

  /**
   * The route half. R8.3 §5.6 / §6: a disabled capability must be genuinely
   * unreachable, not merely labelled, and FIFTH verifies exactly this.
   */
  it('the MOUNTED route refuses while generation.counterarguments is DISABLED', async (t) => {
    if (capabilityState('search.semantic.counterarguments') !== 'DISABLED') {
      return t.skip('capability has been enabled — this test is the guard for that decision');
    }
    const { status, body } = await postThroughRoute({
      position: 'the accused is entitled to anticipatory bail on parity with a co-accused',
      language: 'en',
    });
    assert.equal(status, 409, 'a disabled generation route must refuse, not answer');
    assert.equal(body.error?.code, 'CAPABILITY_DISABLED');
  });

  it('and the refusal happens BEFORE any retrieval work — no admission slot is taken', async (t) => {
    if (capabilityState('search.semantic.counterarguments') !== 'DISABLED') return t.skip('enabled');
    // A refusal that still ran the rankers would be a refusal that still costs
    // the research pool a slot, which is how a "disabled" capability keeps
    // contending for the box it is supposed to have stopped using.
    const started = Date.now();
    await postThroughRoute({ position: 'anticipatory bail', language: 'en' });
    assert.ok(Date.now() - started < 1_000, 'the guard must precede the ranker, not follow it');
  });
});
