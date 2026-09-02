/**
 * Boot the real API once, for the whole e2e run.
 *
 * `EXPO_PUBLIC_API_URL` is set HERE rather than in each spec because
 * `client.ts` resolves `BASE_URL` at module load, and jest's `globalSetup` runs
 * in the parent process before any worker forks — so the value is inherited
 * rather than raced for.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { HANDSHAKE_PATH } from './handshake';

const REPO = resolve(__dirname, '../../..');
/** ~40 s: the boot drops and recreates two databases before it answers. */
const READY_TIMEOUT_MS = 120_000;

export default async function globalSetup(): Promise<void> {
  const child = spawn(
    process.execPath,
    [resolve(REPO, 'node_modules/tsx/dist/cli.mjs'), resolve(__dirname, 'server/boot.mts')],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } },
  );

  const handshake = await new Promise<string>((resolvePromise, rejectPromise) => {
    let out = '';
    let err = '';
    const timer = setTimeout(
      () => rejectPromise(new Error(`e2e server did not become ready in ${READY_TIMEOUT_MS}ms\n${err}`)),
      READY_TIMEOUT_MS,
    );
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const line = out.split(/\r?\n/).find((l) => l.startsWith('RCC_E2E_READY '));
      if (line) {
        clearTimeout(timer);
        resolvePromise(line.slice('RCC_E2E_READY '.length));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      rejectPromise(new Error(`e2e server exited early (${code})\n${err}`));
    });
  });

  writeFileSync(HANDSHAKE_PATH, handshake);
  const parsed = JSON.parse(handshake) as { baseUrl: string; controlUrl: string };
  process.env.EXPO_PUBLIC_API_URL = parsed.baseUrl;
  process.env.RCC_E2E_CONTROL_URL = parsed.controlUrl;
  (globalThis as { __RCC_E2E_PID__?: number }).__RCC_E2E_PID__ = child.pid;
  child.unref();
}
