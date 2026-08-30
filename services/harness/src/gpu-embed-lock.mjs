import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

export const HOLDER_LIVENESS = Object.freeze({
  CONFIRMED_ALIVE: 'CONFIRMED_ALIVE',
  CONFIRMED_DEAD: 'CONFIRMED_DEAD',
  LIVENESS_UNKNOWN_PERMISSION_DENIED: 'LIVENESS_UNKNOWN_PERMISSION_DENIED',
  LIVENESS_UNKNOWN_MALFORMED_TOKEN: 'LIVENESS_UNKNOWN_MALFORMED_TOKEN',
  LIVENESS_UNKNOWN_ERROR: 'LIVENESS_UNKNOWN_ERROR',
});

export function classifyHolderLiveness(holder, signalProcess = process.kill) {
  if (!Number.isSafeInteger(holder?.pid) || holder.pid <= 0) {
    return HOLDER_LIVENESS.LIVENESS_UNKNOWN_MALFORMED_TOKEN;
  }
  try {
    signalProcess(holder.pid, 0);
    return HOLDER_LIVENESS.CONFIRMED_ALIVE;
  } catch (error) {
    if (error?.code === 'ESRCH') return HOLDER_LIVENESS.CONFIRMED_DEAD;
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      return HOLDER_LIVENESS.LIVENESS_UNKNOWN_PERMISSION_DENIED;
    }
    return HOLDER_LIVENESS.LIVENESS_UNKNOWN_ERROR;
  }
}

export function readGpuLock(lockPath) {
  try {
    const holder = JSON.parse(readFileSync(lockPath, 'utf8'));
    return holder && typeof holder === 'object' && !Array.isArray(holder) ? holder : {};
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return {};
  }
}

export async function acquireGpuLock({
  lockPath,
  batchFile,
  waitMs,
  pollMs = 5000,
  pid = process.pid,
  signalProcess = process.kill,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
}) {
  const deadline = now() + waitMs;
  for (;;) {
    try {
      writeFileSync(
        lockPath,
        JSON.stringify({ pid, batchFile, at: new Date(now()).toISOString() }) + '\n',
        { flag: 'wx' },
      );
      return true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const holder = readGpuLock(lockPath);
      if (holder === null) continue;

      const liveness = classifyHolderLiveness(holder, signalProcess);
      if (liveness === HOLDER_LIVENESS.CONFIRMED_DEAD) {
        log('GPU lock held by confirmed-dead pid ' + holder.pid + ' — clearing');
        try {
          unlinkSync(lockPath);
        } catch (unlinkError) {
          if (unlinkError?.code !== 'ENOENT') throw unlinkError;
        }
        continue;
      }
      if (now() >= deadline) {
        throw new Error(
          'GPU embed lock holder liveness is ' +
            liveness +
            ' for pid ' +
            (holder?.pid ?? '?') +
            ' (' +
            (holder?.batchFile ?? 'unknown batch') +
            ' since ' +
            (holder?.at ?? 'unknown time') +
            ') for longer than ' +
            Math.round(waitMs / 1000) +
            's. Refusing to reclaim the token or run two embedders against one 8 GB GPU.',
          { cause: error },
        );
      }
      await sleep(pollMs);
    }
  }
}

export function releaseGpuLock({ lockPath, pid = process.pid }) {
  const holder = readGpuLock(lockPath);
  if (holder?.pid !== pid) return false;
  try {
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}
