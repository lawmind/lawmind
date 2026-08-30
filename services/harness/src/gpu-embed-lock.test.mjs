import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  HOLDER_LIVENESS,
  acquireGpuLock,
  classifyHolderLiveness,
  releaseGpuLock,
} from './gpu-embed-lock.mjs';

const errorWithCode = (code) => Object.assign(new Error(code), { code });

async function withLockPath(run) {
  const dir = mkdtempSync(join(tmpdir(), 'lawmind-gpu-lock-'));
  try {
    await run(join(dir, 'gpu.lock'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('confirmed live holder is classified alive', () => {
  assert.equal(
    classifyHolderLiveness({ pid: 101 }, () => {}),
    HOLDER_LIVENESS.CONFIRMED_ALIVE,
  );
});

test('confirmed dead stale holder is classified dead and may be reclaimed', async () => {
  assert.equal(
    classifyHolderLiveness({ pid: 101 }, () => {
      throw errorWithCode('ESRCH');
    }),
    HOLDER_LIVENESS.CONFIRMED_DEAD,
  );
  await withLockPath(async (lockPath) => {
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 101, batchFile: 'stale.jsonl', at: '2026-08-30T00:00:00.000Z' }),
    );
    await acquireGpuLock({
      lockPath,
      batchFile: 'next.jsonl',
      waitMs: 0,
      pid: 202,
      signalProcess: () => {
        throw errorWithCode('ESRCH');
      },
    });
    assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).pid, 202);
  });
});

test('permission or access denial is unknown and cannot reclaim the token', async () => {
  for (const code of ['EPERM', 'EACCES']) {
    const signalProcess = () => {
      throw errorWithCode(code);
    };
    assert.equal(
      classifyHolderLiveness({ pid: 101 }, signalProcess),
      HOLDER_LIVENESS.LIVENESS_UNKNOWN_PERMISSION_DENIED,
    );
    await withLockPath(async (lockPath) => {
      const token = JSON.stringify({
        pid: 101,
        batchFile: 'live.jsonl',
        at: '2026-08-30T00:00:00.000Z',
      });
      writeFileSync(lockPath, token);
      await assert.rejects(
        acquireGpuLock({ lockPath, batchFile: 'second.jsonl', waitMs: 0, pid: 202, signalProcess }),
        /LIVENESS_UNKNOWN_PERMISSION_DENIED/,
      );
      assert.equal(readFileSync(lockPath, 'utf8'), token);
    });
  }
});

test('malformed token is unknown and is not reclaimed', async () => {
  await withLockPath(async (lockPath) => {
    writeFileSync(lockPath, '{not-json');
    await assert.rejects(
      acquireGpuLock({ lockPath, batchFile: 'second.jsonl', waitMs: 0, pid: 202 }),
      /LIVENESS_UNKNOWN_MALFORMED_TOKEN/,
    );
    assert.equal(readFileSync(lockPath, 'utf8'), '{not-json');
  });
});

test('normal acquire and owner release preserve token lifecycle', async () => {
  await withLockPath(async (lockPath) => {
    await acquireGpuLock({ lockPath, batchFile: 'normal.jsonl', waitMs: 0, pid: 202 });
    assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).pid, 202);
    assert.equal(releaseGpuLock({ lockPath, pid: 202 }), true);
    assert.equal(existsSync(lockPath), false);
  });
});

test('second live writer cannot reclaim the token', async () => {
  await withLockPath(async (lockPath) => {
    const token = JSON.stringify({
      pid: 101,
      batchFile: 'first.jsonl',
      at: '2026-08-30T00:00:00.000Z',
    });
    writeFileSync(lockPath, token);
    await assert.rejects(
      acquireGpuLock({
        lockPath,
        batchFile: 'second.jsonl',
        waitMs: 0,
        pid: 202,
        signalProcess: () => {},
      }),
      /CONFIRMED_ALIVE/,
    );
    assert.equal(readFileSync(lockPath, 'utf8'), token);
  });
});
