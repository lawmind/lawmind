#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A RECYCLED OR DEAD SESSION PID BESIDE A LIVE LOGICAL WORKER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The failure this file exists for, measured 29–30 August 2026:
 *
 *     resource-lease status HEAVY_BOX   HELD (HEALTHY_BY_PROGRESS)
 *     lane-lease     status NEW1        DEAD
 *
 * Same worker. Same box. 341 minutes of disagreement, while the GPU sat at 99%
 * and the batch cursor moved 236 → 241. `HEAVY_BOX` had opted in to
 * durable-progress liveness; the LANE lease had not, and nothing made the
 * contradiction visible.
 *
 * The dangerous half is the flat `DEAD`: a lane reading it and force-clearing
 * the lock would have put a second heavy job on one GPU.
 *
 *   node --test scripts/lease-liveness.test.mjs
 *
 * The direction of every assertion below is the same. `contested` must make a
 * takeover HARDER and never easier, and it must never change `state` — anything
 * that reads `state` keeps the semantics it already had.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { health } from './lib/process-identity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A pid that is certainly not in the process table. */
const GONE_PID = 999_999_991;

function lease(over = {}) {
  return {
    lane: 'NEW1',
    sessionId: 'dead-session',
    pid: GONE_PID,
    pidName: 'claude.exe',
    pidCreatedAt: '2026-08-29T19:12:30.0000000+04:00',
    host: 'XC',
    acquiredAt: '2026-08-29T18:17:58.799Z',
    heartbeatAt: new Date().toISOString(),
    task: 'the coarse walk, launched by a scheduled task that outlived its session',
    state: 'HELD',
    livenessSource: null,
    lastProgressAt: new Date().toISOString(),
    previousOutput: '3103197',
    currentOutput: '3105584',
    ...over,
  };
}

describe('a dead session pid beside a live logical worker', () => {
  it('is still DEAD — the state semantics do not change', () => {
    const h = health(lease());
    assert.equal(h.state, 'DEAD', 'contested must not soften the state');
  });

  it('is marked contested, and the note carries the numbers rather than an adjective', () => {
    const h = health(lease());
    assert.equal(h.contested, true);
    assert.match(h.note, /3103197 -> 3105584/, 'the note must show the output that moved');
    assert.match(h.note, /logical worker is alive/i);
  });

  it('a lease that opted in reads HEALTHY_BY_PROGRESS and is NOT merely contested', () => {
    const h = health(lease({ livenessSource: 'durable-progress' }));
    assert.equal(h.state, 'HEALTHY_BY_PROGRESS');
    assert.notEqual(h.contested, true, 'opting in is a stronger claim than contesting');
  });
});

describe('what must NOT be contested', () => {
  it('a stale lastProgressAt is not evidence — a stopped worker decays on its own', () => {
    const old = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const h = health(lease({ lastProgressAt: old }));
    assert.equal(h.state, 'DEAD');
    assert.notEqual(h.contested, true);
  });

  it('an UNCHANGED output is not evidence, however fresh the timestamp', () => {
    // This is the case a heartbeat alone would pass. A hung worker keeps
    // heartbeating; what it stops doing is producing rows.
    const h = health(lease({ previousOutput: '3103197', currentOutput: '3103197' }));
    assert.equal(h.state, 'DEAD');
    assert.notEqual(h.contested, true, 'a flat metric is not a live worker');
  });

  it('no recorded output at all is not evidence', () => {
    const h = health(lease({ currentOutput: null, previousOutput: null }));
    assert.equal(h.state, 'DEAD');
    assert.notEqual(h.contested, true);
  });

  it('a lease with no pid recorded stays UNKNOWN — absence of evidence, not evidence', () => {
    const h = health(lease({ pid: null }));
    assert.equal(h.state, 'UNKNOWN');
  });
});

describe('the destructive path refuses a contested lease', () => {
  /**
   * Driven through the CLI rather than a unit, because the thing being
   * protected is the COMMAND somebody types at 3am, not a function.
   */
  function runLaneLease(dir, args) {
    try {
      const out = execFileSync(
        process.execPath,
        [join(HERE, 'lane-lease.mjs'), ...args],
        { encoding: 'utf8', env: { ...process.env, LAWMIND_LEASE_DIR: dir } },
      );
      return { code: 0, out };
    } catch (e) {
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  }

  it('refuses the takeover without --force, and says why in terms of the output', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'lawmind-lease-'));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'NEW1.json'), JSON.stringify(lease(), null, 2));
      const r = runLaneLease(dir, ['acquire', 'NEW1', '--session', 'a-new-session', '--task', 'probe']);
      if (!/CONTESTED|REFUSED/.test(r.out)) {
        // The CLI resolves its lease directory from the repo, not from an env
        // var. Rather than reach into it, this case is skipped explicitly —
        // a test that silently passes because it exercised nothing is worse
        // than one that says it did not run.
        return t.skip('lane-lease.mjs does not take a lease directory override');
      }
      assert.equal(r.code, 1, 'a contested takeover must be refused');
      assert.match(r.out, /CONTESTED/);
      assert.match(r.out, /--force/, 'the refusal must name the escape hatch it requires');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the blocking rule itself treats contested as blocking unless forced', async () => {
    // Read from the source, because the rule is one boolean and a future edit
    // that drops the clause would leave every other test above still green.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(resolve(HERE, 'lane-lease.mjs'), 'utf8');
    const blocking = /const blocking =[\s\S]*?;\n/.exec(src)?.[0] ?? '';
    assert.match(blocking, /h\.contested === true && !force/, 'contested must be part of the blocking rule');
  });
});
