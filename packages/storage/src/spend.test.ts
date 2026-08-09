import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { meteredStore } from './metered.ts';
import type { ObjectStore } from './r2.ts';
import {
  CLASS_A_USD_PER_MILLION,
  CLASS_B_USD_PER_MILLION,
  DEFAULT_CEILING_USD,
  billingClass,
  chargeOperation,
  operationCostUsd,
  policyFromEnv,
  projectWriteCost,
  storageCostUsd,
  zeroCounts,
} from './spend.ts';

/** A store that records what reached it, so "refused" can be told from "ran". */
function spyStore(): ObjectStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    name: 'spy',
    put: async (key) => {
      calls.push(`put:${key}`);
    },
    get: async (key) => {
      calls.push(`get:${key}`);
      return null;
    },
    getRange: async (key) => {
      calls.push(`getRange:${key}`);
      return null;
    },
    head: async (key) => {
      calls.push(`head:${key}`);
      return null;
    },
    delete: async (key) => {
      calls.push(`delete:${key}`);
    },
  };
}

describe('billingClass — verified against Cloudflare pricing, 10 Aug 2026', () => {
  it('puts and lists are Class A', () => {
    assert.equal(billingClass('put'), 'A');
    assert.equal(billingClass('list'), 'A');
  });

  it('gets and heads are Class B, and a RANGED get is still one GetObject', () => {
    assert.equal(billingClass('get'), 'B');
    assert.equal(billingClass('head'), 'B');
    // The economic basis of the tiered design: a range changes what is
    // transferred, not what is billed.
    assert.equal(billingClass('getRange'), 'B');
  });

  it('delete is FREE and is not folded into Class A "to be safe"', () => {
    assert.equal(billingClass('delete'), 'free');
  });
});

describe('cost arithmetic', () => {
  it('prices a million of each class at the published rate', () => {
    assert.equal(operationCostUsd({ classA: 1_000_000, classB: 0, free: 0 }), CLASS_A_USD_PER_MILLION);
    assert.equal(operationCostUsd({ classA: 0, classB: 1_000_000, free: 0 }), CLASS_B_USD_PER_MILLION);
  });

  it('free operations cost nothing however many there are', () => {
    assert.equal(operationCostUsd({ classA: 0, classB: 0, free: 10_000_000 }), 0);
  });

  it('storage is per GB-month', () => {
    assert.equal(storageCostUsd(1_000_000_000), 0.015);
  });
});

describe('projectWriteCost — the number that justifies the ceiling', () => {
  it('one object per judgment across the HC corpus is affordable', () => {
    const p = projectWriteCost({
      documents: 15_771_566,
      objectsPerDocument: 1,
      bytesPerDocument: 2_000,
    });
    assert.equal(p.objects, 15_771_566);
    // ~$71 of PUTs.
    assert.ok(p.putUsd > 70 && p.putUsd < 72, `putUsd was ${p.putUsd}`);
  });

  it('ONE OBJECT PER CHUNK IS THE FAILURE MODE — 16:1 makes it 16x the bill', () => {
    // 616,197 chunks over 38,341 SC judgments is the ratio actually observed.
    const p = projectWriteCost({
      documents: 15_771_566,
      objectsPerDocument: 16,
      bytesPerDocument: 2_000,
    });
    assert.ok(p.putUsd > 1_100, `putUsd was ${p.putUsd}`);
    // And the storage it buys is trivial by comparison — that gap is the point.
    assert.ok(p.storageUsdPerMonth < 1, `storage was ${p.storageUsdPerMonth}`);
  });
});

describe('chargeOperation', () => {
  const policy = { ceilingUsd: 0.001, alertAtFraction: 0.8 };

  it('charges BEFORE the operation, against the cost it would add', () => {
    const state = { counts: zeroCounts(), alerted: false };
    const d = chargeOperation(state, 'put', policy);
    assert.equal(d.allowed, true);
    assert.equal(state.counts.classA, 1);
  });

  it('refuses the operation that would cross the ceiling, and does not count it', () => {
    // ceiling $0.001 = 222 class-A ops ($4.50/M → $0.0000045 each).
    const state = { counts: { classA: 222, classB: 0, free: 0 }, alerted: false };
    const d = chargeOperation(state, 'put', policy);
    assert.equal(d.allowed, false);
    assert.equal(state.counts.classA, 222, 'a refused operation must not be counted');
  });

  it('never refuses a free operation on cost', () => {
    const state = { counts: { classA: 1_000_000, classB: 0, free: 0 }, alerted: false };
    assert.equal(chargeOperation(state, 'delete', policy).allowed, true);
  });

  it('fires the alert once and only once', () => {
    const state = { counts: zeroCounts(), alerted: false };
    let crossings = 0;
    for (let i = 0; i < 200; i++) {
      const d = chargeOperation(state, 'put', policy);
      if (d.allowed && d.crossedAlert) crossings++;
    }
    assert.equal(crossings, 1);
  });
});

describe('policyFromEnv', () => {
  it('reads an explicit budget', () => {
    assert.equal(policyFromEnv({ R2_OP_BUDGET_USD: '100' }).ceilingUsd, 100);
  });

  it('falls back to the default rather than to NaN — a NaN ceiling permits everything', () => {
    // `NaN > ceiling` is false, so an unparseable budget would silently disable
    // the guard. This is the single most dangerous way this module could fail.
    assert.equal(policyFromEnv({ R2_OP_BUDGET_USD: 'lots' }).ceilingUsd, DEFAULT_CEILING_USD);
    assert.equal(policyFromEnv({ R2_OP_BUDGET_USD: '' }).ceilingUsd, DEFAULT_CEILING_USD);
    assert.equal(policyFromEnv({ R2_OP_BUDGET_USD: '-5' }).ceilingUsd, DEFAULT_CEILING_USD);
    assert.equal(policyFromEnv({}).ceilingUsd, DEFAULT_CEILING_USD);
  });

  it('has a default that actually binds — an unlimited default would satisfy the letter and none of the point', () => {
    assert.ok(Number.isFinite(policyFromEnv({}).ceilingUsd));
    assert.ok(policyFromEnv({}).ceilingUsd < 1_000);
  });
});

describe('meteredStore', () => {
  const tight = { ceilingUsd: 0.00001, alertAtFraction: 0.8 }; // 2 class-A ops

  it('passes operations through and reports spend', async () => {
    const inner = spyStore();
    const store = meteredStore(inner, { policy: { ceilingUsd: 1, alertAtFraction: 0.8 } });
    await store.put('a', new Uint8Array([1]));
    await store.get('b');
    await store.delete('c');
    assert.deepEqual(inner.calls, ['put:a', 'get:b', 'delete:c']);
    const s = store.spend();
    assert.equal(s.classA, 1);
    assert.equal(s.classB, 1);
    assert.equal(s.free, 1);
  });

  it('a refused write NEVER REACHES THE NETWORK', async () => {
    const inner = spyStore();
    const store = meteredStore(inner, { policy: tight });
    await store.put('a', new Uint8Array([1]));
    await store.put('b', new Uint8Array([1]));
    await assert.rejects(store.put('c', new Uint8Array([1])), /budget/i);
    assert.deepEqual(inner.calls, ['put:a', 'put:b'], 'the third put must not have been sent');
  });

  it('the halt switch stops writes and requires a reason', async () => {
    const inner = spyStore();
    const store = meteredStore(inner, {
      policy: { ceilingUsd: 1, alertAtFraction: 0.8 },
      haltReason: async () => 'incident 2026-08-10: runaway ingest',
    });
    await assert.rejects(store.put('a', new Uint8Array([1])), /halted.*runaway ingest/i);
    assert.deepEqual(inner.calls, []);
  });

  it('a halt stops DELETES too — a halt exists to stop the corpus changing', async () => {
    const inner = spyStore();
    const store = meteredStore(inner, {
      policy: { ceilingUsd: 1, alertAtFraction: 0.8 },
      haltReason: async () => 'incident',
    });
    await assert.rejects(store.delete('a'), /halted/i);
    assert.deepEqual(inner.calls, []);
  });

  it('READS ARE NEVER HALTED — taking the product down cannot save $0.36 per million', async () => {
    const inner = spyStore();
    const store = meteredStore(inner, {
      policy: { ceilingUsd: 1, alertAtFraction: 0.8 },
      haltReason: async () => 'incident',
    });
    await store.get('a');
    await store.getRange('b', 0, 10);
    await store.head('c');
    assert.deepEqual(inner.calls, ['get:a', 'getRange:b', 'head:c']);
  });

  it('the alert fires once, with the report', async () => {
    const inner = spyStore();
    const seen: number[] = [];
    const store = meteredStore(inner, {
      policy: { ceilingUsd: 0.0000225, alertAtFraction: 0.8 }, // 5 class-A ops
      onAlert: (r) => seen.push(r.classA),
    });
    for (let i = 0; i < 5; i++) await store.put(`k${i}`, new Uint8Array([1]));
    assert.equal(seen.length, 1);
  });

  it('exposes no handle on the inner store — the guard must not be bypassable', () => {
    const store = meteredStore(spyStore(), { policy: tight });
    assert.deepEqual(Object.keys(store).sort(), [
      'delete',
      'get',
      'getRange',
      'head',
      'name',
      'put',
      'spend',
    ]);
    // The name records what is wrapped without handing it over.
    assert.equal(store.name, 'metered(spy)');
  });
});
