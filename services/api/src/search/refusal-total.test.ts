/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A REFUSAL CARRIES NO `total`. R17 §3, AND THE REASON IT IS NOT COSMETIC.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The route's own argument for `total: 0` was sound in isolation — a page count
 * beside a state that says what the zero means — and NEW3 R21 §3b overruled it on
 * the only question that decides a wire field: **who has to be wrong for it to
 * matter.**
 *
 * A client that reads `retrievalOutcome` sees the same truth either way. A client
 * that ignores it — a future surface, a debugging script, an analytics job —
 * reads `total: 0` as *"zero results exist"* and renders "there is no law on
 * this". Omitting the field makes that consumer read `undefined` and fail loudly
 * instead of quietly, which is the same asymmetry `outcome.ts` already relies on
 * and the reason `CITATION_HARNESS.md` holds silent drop at a zero threshold.
 *
 * `retrievalOutcome.resultCount` remains available to anyone who wants the count.
 *
 * ── WHY A FAKE `sql` AND NOT THE CORPUS ─────────────────────────────────────
 *
 * `sparse_unbounded` is reproducible against the live corpus; `sparse_timeout` is
 * not, without spending fifteen seconds and hoping. Both arms differ from each
 * other in exactly one field, so testing one against the corpus and the other
 * against a fixture would let the two drift — which is the defect the route's own
 * comment says it is avoiding by emitting them from one branch.
 *
 * So both are driven through the REAL Hono route with the fake `sql` that
 * `structured-bound.test.ts` established: it answers by inspecting the statement
 * text, so each test states the corpus it is pretending to have. The response
 * under assertion is the real route's, byte for byte.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Sql } from 'postgres';

import { createApp } from '../app.ts';

/** PostgreSQL `query_canceled`. `retrieve.ts` is the authority; repeated here so
 *  the fixture states the condition it is simulating rather than importing a
 *  private constant. */
const QUERY_CANCELED = '57014';

type Fake = {
  /** Rarest document frequency the lexeme lookup reports. */
  df: number;
  /** Rows the bounded population probe reports. */
  population: number;
  /** Make the EXECUTION statement fail the way a statement budget does. */
  cancelExecution?: boolean;
};

function fakeSql(f: Fake): Sql {
  const sql = ((strings: TemplateStringsArray, ...args: unknown[]) => {
    const text = strings.join(' ');
    if (text.includes('lexeme_document_frequency')) {
      return Promise.resolve([{ lexeme: 'bail', df: String(f.df) }]);
    }
    if (text.includes('c.court ILIKE t.pattern')) {
      return Promise.resolve([
        { term_offset: (args[0] as number[])[0], court: 'High Court of Somewhere' },
      ]);
    }
    if (text.includes('WITH RECURSIVE')) {
      return Promise.resolve([{ court: 'High Court of Somewhere' }]);
    }
    if (text.includes('bounded')) return Promise.resolve([{ n: String(f.population) }]);
    /* Everything past the admission decision is the execution: the count and the
     * page. A budget that runs out takes both — and `structured.ts` runs them
     * under `Promise.all`, which adopts the FIRST rejection and leaves the second
     * unobserved. A no-op catch is attached to each so the fixture does not
     * manufacture an `unhandledRejection` that the real driver never produces;
     * the returned promise still rejects for the caller. */
    if (f.cancelExecution) {
      const cancelled = Promise.reject(
        Object.assign(new Error('canceling statement due to statement timeout'), {
          code: QUERY_CANCELED,
        }),
      );
      cancelled.catch(() => {});
      return cancelled;
    }
    if (text.includes('count(*)')) return Promise.resolve([{ n: '0' }]);
    return Promise.resolve([]);
  }) as unknown as Sql;
  return sql;
}

type Body = {
  results?: unknown[];
  total?: number;
  degraded?: string[];
  emptyBecause?: { reason: string; remedy: string };
  retrievalOutcome?: { state?: string; reasons?: string[]; resultCount?: number };
  page?: { page: number; pageSize: number; hasMore: boolean };
};

async function refuse(f: Fake): Promise<{ status: number; body: Body; raw: string }> {
  const app = createApp({
    ping: async () => {},
    search: { sql: fakeSql(f), embedQuery: async () => null },
  });
  const res = await app.request('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'court:"High Court of Somewhere" AND bail', language: 'en' }),
  });
  const raw = await res.text();
  return { status: res.status, body: (JSON.parse(raw) as { data: Body }).data, raw };
}

describe('an incomplete search does not report a total it never computed', () => {
  it('sparse_unbounded: 200, the refusal is named, and `total` is ABSENT', async () => {
    const { status, body, raw } = await refuse({ df: 0.2577, population: 20_001 });

    /* The condition under test really occurred — without this the assertions
     * below would pass on an ordinary empty page. */
    assert.equal(status, 200, 'a refusal is an answer, never a 503');
    assert.deepEqual(body.degraded, ['sparse_unbounded']);
    assert.equal(body.retrievalOutcome?.state, 'coverage_unknown');
    assert.ok(body.retrievalOutcome?.reasons?.includes('sparse_unbounded'));

    assert.equal(body.total, undefined, 'R17 §3: `total` is omitted on a refusal');
    /* `undefined` and "the key is present holding null" are the same value in
     * JSON.parse and NOT the same wire. Only the raw text can tell them apart,
     * and `total: null` would be read by an ignorant consumer exactly as
     * `total: 0` is. */
    assert.ok(!Object.hasOwn(body, 'total'), 'the KEY must be absent, not null');
    assert.doesNotMatch(raw, /"total"\s*:/);

    /* The refusal keeps its remedy — it has one, and that is what earns it a
     * reason of its own. */
    assert.deepEqual(body.emptyBecause, {
      reason: 'query_too_broad_to_rank',
      remedy: 'add_more_terms',
    });
    /* The count a consumer that WANTS one should read. */
    assert.equal(body.retrievalOutcome?.resultCount, 0);
    assert.deepEqual(body.results, []);
  });

  it('sparse_timeout: `total` and `emptyBecause` are both ABSENT', async () => {
    const { status, body, raw } = await refuse({
      df: 0.0001,
      population: 20_001,
      cancelExecution: true,
    });

    assert.equal(status, 200, 'never the generic 503 TIMEOUT copy');
    assert.deepEqual(body.degraded, ['sparse_timeout'], 'the ARM is named in degraded[]');
    assert.equal(body.retrievalOutcome?.state, 'coverage_unknown');
    /**
     * The general user-facing semantic, shared with `dense_timeout` and
     * `pin_timeout` — NOT the arm name. NEW3 R21 §1 froze this and corrected
     * R17's own prose: an advocate cannot act on which arm ran out of budget.
     */
    assert.ok(body.retrievalOutcome?.reasons?.includes('timeout'));
    assert.ok(
      !body.retrievalOutcome?.reasons?.includes('sparse_timeout'),
      'the arm name belongs to degraded[], never to reasons[]',
    );

    assert.equal(body.total, undefined);
    assert.ok(!Object.hasOwn(body, 'total'));
    assert.doesNotMatch(raw, /"total"\s*:/);

    /* A timeout has no remedy, so offering one would be an apology dressed as a
     * fix — and `emptyBecause` is the "confirmed empty" field that must not be
     * emitted when the search did not complete. */
    assert.equal(body.emptyBecause, undefined);
    assert.ok(!Object.hasOwn(body, 'emptyBecause'));
  });

  it('an OLD consumer that ignores retrievalOutcome still fails safe', async () => {
    /**
     * The regression R17 §3 is actually protecting. Such a client reads
     * `results` and `total` only. It must see an empty list and NO trustworthy
     * count — never a `0` it can render as "there is no law on this".
     */
    for (const f of [
      { df: 0.2577, population: 20_001 },
      { df: 0.0001, population: 20_001, cancelExecution: true },
    ]) {
      const { body } = await refuse(f);
      assert.deepEqual(body.results, []);
      assert.equal(body.total, undefined);
      /* Paging is still described, so a client that pages does not divide by
       * undefined — `hasMore: false` is a fact about this response. */
      assert.equal(body.page?.hasMore, false);
    }
  });
});
