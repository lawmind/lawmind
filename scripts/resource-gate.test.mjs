#!/usr/bin/env node
/**
 * The resource gate's verdicts, against synthetic snapshots.
 *
 * Deliberately NOT against the live box. A gate tested only by reading this
 * machine can only ever assert what this machine happens to be doing at the
 * moment the suite runs — the interesting states (a saturated CPU, a dead
 * cluster, a missing GPU) are exactly the ones that will not be true then. So
 * the collectors are exercised once for shape, and every decision is tested
 * against a snapshot written by hand.
 *
 * The one behaviour worth stating in a test name: **GPU_EMBED and DB_SCAN
 * disagree on the same snapshot.** That is the whole reason this file exists
 * rather than a fifth rung on the CX1 ladder.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JOB_CLASSES, check, claim, collect, liveClaims, release, verdicts } from './resource-gate.mjs';

/** An unloaded machine: everything should be allowed from here. */
function idleSnapshot(overrides = {}) {
  return {
    collectedAt: new Date().toISOString(),
    host: 'test',
    system: { platform: 'win32', logicalCpus: 20, cpuBusyPct: 5, totalRamBytes: 1, freeRamBytes: 1, freeRamPct: 80 },
    commit: { available: true, freePct: 60 },
    gpu: { available: true, gpus: [{ name: 'test', utilPct: 0, vramUsedMiB: 100, vramTotalMiB: 8192, vramFreeMiB: 8092 }] },
    processes: { available: true, node: 1, python: 0, postgresBackends: 2, fleet: [], heavy: [] },
    postgres: { available: true, active: 0, idleInTransaction: 0, backends: 2, longestActiveSeconds: 0, blocked: 0 },
    claims: [],
    ...overrides,
  };
}

describe('resource gate', () => {
  it('allows every class on an idle box', () => {
    const v = verdicts(idleSnapshot());
    for (const cls of JOB_CLASSES) {
      assert.equal(v[cls].verdict, 'ALLOW', cls + ': ' + v[cls].reasons.join('; '));
    }
  });

  it('THE POINT: the box the founder described allows GPU_EMBED and defers DB_SCAN', () => {
    // CPU ~90%, GPU idle, fleet working, cluster busy. Measured shape of this
    // machine on 18 Aug 2026, which is the situation the gate was asked for.
    const busy = idleSnapshot({
      system: { platform: 'win32', logicalCpus: 20, cpuBusyPct: 90, totalRamBytes: 1, freeRamBytes: 1, freeRamPct: 35 },
      postgres: { available: true, active: 14, idleInTransaction: 0, backends: 33, longestActiveSeconds: 1124, blocked: 1 },
      processes: { available: true, node: 49, python: 0, postgresBackends: 33, fleet: [{ pid: 1, cmd: 'hc-load' }], heavy: [] },
    });
    const v = verdicts(busy);
    assert.equal(v['GPU_EMBED'].verdict, 'ALLOW', 'the GPU is idle and nothing here wants it');
    assert.equal(v['DB_SCAN'].verdict, 'DEFER');
    assert.equal(v['VECTOR_BUILD'].verdict, 'DEFER');
    assert.equal(v['CPU_HEAVY'].verdict, 'DEFER');
    assert.equal(v['LIGHT'].verdict, 'ALLOW');
  });

  it('refuses GPU_EMBED when no GPU is visible, rather than reading absence as idle', () => {
    // The one direction that cannot be recovered by waiting: a job dispatched to
    // a GPU that is not there does not become correct later.
    const v = verdicts(idleSnapshot({ gpu: { available: false, error: 'nvidia-smi not available' } }));
    assert.equal(v['GPU_EMBED'].verdict, 'DEFER');
    assert.match(v['GPU_EMBED'].reasons.join(' '), /no GPU visible/);
    assert.equal(v['CPU_HEAVY'].verdict, 'ALLOW', 'a missing GPU says nothing about the CPU');
  });

  it('refuses GPU_EMBED on VRAM pressure even with the GPU at 0%', () => {
    // Utilisation and memory are different exhaustions. A model that cannot be
    // resident is not helped by an idle SM.
    const v = verdicts(
      idleSnapshot({
        gpu: { available: true, gpus: [{ name: 'test', utilPct: 0, vramUsedMiB: 7900, vramTotalMiB: 8192, vramFreeMiB: 292 }] },
      }),
    );
    assert.equal(v['GPU_EMBED'].verdict, 'DEFER');
    assert.match(v['GPU_EMBED'].reasons.join(' '), /VRAM free 292/);
  });

  it('defers DB_SCAN on a long-running statement even when few queries are active', () => {
    // One 20-minute statement is a struggling cluster; the count alone hides it.
    const v = verdicts(
      idleSnapshot({
        postgres: { available: true, active: 1, idleInTransaction: 0, backends: 3, longestActiveSeconds: 1200, blocked: 0 },
      }),
    );
    assert.equal(v['DB_SCAN'].verdict, 'DEFER');
    assert.match(v['DB_SCAN'].reasons.join(' '), /longest active statement 1200s/);
  });

  it('an unreadable cluster defers DB_SCAN but not GPU_EMBED', () => {
    const v = verdicts(idleSnapshot({ postgres: { available: false, error: 'DATABASE_URL unset' } }));
    assert.equal(v['DB_SCAN'].verdict, 'DEFER');
    assert.equal(v['GPU_EMBED'].verdict, 'ALLOW');
  });

  it('an unreadable CPU is treated as loaded, never as idle', () => {
    // Failing the other way would allow everything on a machine we cannot see.
    const v = verdicts(
      idleSnapshot({
        system: { platform: 'linux', logicalCpus: 8, cpuBusyPct: null, totalRamBytes: 1, freeRamBytes: 1, freeRamPct: 80 },
      }),
    );
    assert.equal(v['CPU_HEAVY'].verdict, 'DEFER');
    assert.equal(v['GPU_EMBED'].verdict, 'DEFER');
    assert.equal(v['LIGHT'].verdict, 'ALLOW', 'LIGHT does not read the CPU at all');
  });

  it('an unreadable commit charge SKIPS the check and says so, instead of guessing', () => {
    const v = verdicts(idleSnapshot({ commit: { available: false, error: 'not Windows' } }));
    assert.equal(v['CPU_HEAVY'].verdict, 'ALLOW');
    assert.match(v['CPU_HEAVY'].headroom.join(' '), /commit charge unreadable .* check skipped/);
  });

  it('a live claim defers its own class and VECTOR_BUILD, and nothing else', () => {
    const v = verdicts(idleSnapshot({ claims: [{ jobClass: 'GPU_EMBED', label: 'embed-backfill', pid: 1, ageMs: 0 }] }));
    assert.equal(v['GPU_EMBED'].verdict, 'DEFER');
    assert.equal(v['VECTOR_BUILD'].verdict, 'DEFER');
    assert.equal(v['DB_SCAN'].verdict, 'ALLOW', 'an embedding job does not block a scan');
    assert.equal(v['CPU_HEAVY'].verdict, 'ALLOW');
  });

  it('claim / release round-trips on disk', () => {
    const before = liveClaims().length;
    const token = claim('DB_SCAN', 'unit-test');
    try {
      const held = liveClaims();
      assert.equal(held.length, before + 1);
      assert.ok(held.some((c) => c.token === token && c.jobClass === 'DB_SCAN'));
    } finally {
      release(token);
    }
    assert.equal(liveClaims().length, before);
    // Releasing twice is not an error — a job that crashed after releasing must
    // not fail its own cleanup path on restart.
    release(token);
  });

  it('rejects an unknown class rather than defaulting to permissive', () => {
    assert.throws(() => claim('WHATEVER', 'x'), /unknown class/);
  });

  it('collects a real shallow snapshot, fast, with every field explained', async (t) => {
    if (process.platform !== 'win32') return t.skip('collectors are Windows-specific');
    const started = Date.now();
    const s = await collect({ cpuSampleMs: 100 });
    const elapsed = Date.now() - started;

    assert.ok(s.collectedAt);
    assert.equal(s.depth, 'shallow');
    for (const key of ['system', 'commit', 'gpu', 'processes', 'postgres', 'claims']) {
      assert.ok(key in s, 'missing ' + key);
    }
    // Every sub-collector either reports data or reports why not. Silence is the
    // failure mode this asserts against: a gate that omits a section reads as a
    // clear one.
    for (const key of ['commit', 'gpu', 'processes', 'postgres']) {
      assert.ok(
        s[key].available === true || typeof s[key].error === 'string',
        key + ' is neither available nor explained',
      );
    }
    const v = verdicts(s);
    for (const cls of JOB_CLASSES) assert.ok(['ALLOW', 'DEFER'].includes(v[cls].verdict));

    // The reason shallow exists. Full collection measured 3.1s / 15.2s / 31.9s
    // on three consecutive tries under fleet load; a per-batch gate cannot cost
    // that. Bound is loose enough for a contended box, tight enough to go red if
    // a PowerShell collector is ever added back to the default path.
    assert.ok(elapsed < 5_000, 'shallow collect took ' + elapsed + 'ms — a PowerShell collector is back on the default path');
  });

  it('VECTOR_BUILD upgrades itself to a deep snapshot, because it reads the fleet', async (t) => {
    if (process.platform !== 'win32') return t.skip('collectors are Windows-specific');
    const r = await check('VECTOR_BUILD', { cpuSampleMs: 100 });
    assert.equal(r.snapshot.depth, 'deep');
    const cheap = await check('GPU_EMBED', { cpuSampleMs: 100 });
    assert.equal(cheap.snapshot.depth, 'shallow');
  });

  it('VECTOR_BUILD fails CLOSED on an unreadable process table', () => {
    // The one verdict that cannot be recovered by noticing later: an index build
    // started over a live fleet runs for hours holding the box.
    const v = verdicts(idleSnapshot({ processes: { available: false, error: 'shallow snapshot' } }));
    assert.equal(v['VECTOR_BUILD'].verdict, 'DEFER');
    assert.match(v['VECTOR_BUILD'].reasons.join(' '), /cannot confirm the fleet is idle/);
    assert.equal(v['CPU_HEAVY'].verdict, 'ALLOW', 'the other classes do not need the process table');
  });
});
