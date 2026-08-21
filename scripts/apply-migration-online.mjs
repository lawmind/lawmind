#!/usr/bin/env node
/**
 * Apply one migration file to a LIVE, WRITTEN-TO database, retrying until it
 * gets the lock — without ever camping in the lock queue.
 *
 *   node scripts/apply-migration-online.mjs packages/db/drizzle/0056_x.sql
 *     [--attempts 200] [--min-wait 2000] [--max-wait 15000]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS EXISTS TO PREVENT, MEASURED 18 AUG 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ALTER TABLE judgments ADD COLUMN` was run the ordinary way against the live
 * corpus while the ingest fleet was writing. It needs ACCESS EXCLUSIVE, could
 * not get it — a 1,683-second UPDATE held the table — and so it waited.
 *
 * **A waiting ACCESS EXCLUSIVE request blocks every lock request queued behind
 * it.** Within seconds, twelve ingest INSERTs and a paragraph write were stalled
 * behind a DDL statement that had acquired nothing and changed nothing. The
 * fleet stopped for two minutes because a migration was being patient.
 *
 * The fix is the opposite of patience. `lock_timeout` inside the migration makes
 * the ALTER give up in seconds and leave the queue; this runner then tries again
 * later. Each attempt is cheap and bounded, and the fleet never queues behind
 * more than one short wait.
 *
 * That inverts the usual trade: a migration that FAILS is re-runnable, and a
 * fleet stalled behind a growing lock queue is not recoverable by waiting.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It never cancels or terminates another backend, and it never touches the STOP
 * sentinel. Stopping the fleet to add a column is not a trade this makes on its
 * own — the workers belong to another lane, several would need relaunching by
 * hand, and the migration is not urgent enough to be worth that. If the lock is
 * genuinely unobtainable, the honest outcome is this exiting non-zero and saying
 * so, so a human can schedule a window.
 *
 * The migration file must set its own `lock_timeout` (`SET LOCAL lock_timeout`).
 * A file without one is REFUSED: without it this runner would be the thing
 * queueing indefinitely, which is the defect, not the fix.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const PG_BIN = process.env['LAWMIND_PG_BIN'] ?? 'C:\\lawmind\\pgsql\\pgsql\\bin';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v === undefined ? fallback : Number(v);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('usage: node scripts/apply-migration-online.mjs <file.sql> [--attempts N] [--min-wait MS] [--max-wait MS]');
    return 2;
  }

  const body = readFileSync(file, 'utf8');
  if (!/SET\s+LOCAL\s+lock_timeout/i.test(body)) {
    console.error(
      'REFUSED: ' + basename(file) + ' does not SET LOCAL lock_timeout.\n' +
      'Without it the ALTER waits indefinitely and blocks every writer queued behind it.\n' +
      'That is the exact incident this runner was written after — see its header.',
    );
    return 2;
  }

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL unset');
    return 2;
  }
  const parsed = new URL(url);

  const attempts = arg('--attempts', 200);
  const minWait = arg('--min-wait', 2000);
  const maxWait = arg('--max-wait', 15000);

  const env = { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) };
  const args = [
    '-h', parsed.hostname,
    '-p', parsed.port || '5432',
    '-U', decodeURIComponent(parsed.username),
    '-d', parsed.pathname.replace(/^\//, ''),
    '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    // One transaction, so a run that dies part-way leaves nothing half-applied.
    '--single-transaction',
    '-f', file,
  ];

  const started = Date.now();
  let lockTimeouts = 0;

  for (let i = 1; i <= attempts; i += 1) {
    const r = spawnSync(PG_BIN + '\\psql.exe', args, { encoding: 'utf8', env, windowsHide: true });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();

    if (r.status === 0) {
      console.log('APPLIED ' + basename(file) + ' on attempt ' + i + ' after ' + Math.round((Date.now() - started) / 1000) + 's');
      if (lockTimeouts > 0) console.log('lock timeouts before it landed: ' + lockTimeouts);
      return 0;
    }

    const isLock = /lock timeout/i.test(out);
    if (!isLock) {
      // A real SQL error. Retrying cannot fix it and would hide it.
      console.error('attempt ' + i + ' failed for a reason that is not lock contention:');
      console.error(out);
      return 1;
    }

    lockTimeouts += 1;
    // Jitter, so repeated runs of this script do not synchronise into a
    // convoy that hits the table at the same instant every time.
    const wait = minWait + Math.floor(Math.random() * (maxWait - minWait));
    if (i === 1 || i % 10 === 0) {
      console.log('attempt ' + i + ': lock timeout, table busy — retrying in ' + wait + 'ms');
    }
    sleep(wait);
  }

  console.error(
    'NOT APPLIED after ' + attempts + ' attempts (' + Math.round((Date.now() - started) / 1000) + 's). ' +
    'The table never went quiet for the migration\'s own lock_timeout. ' +
    'This needs a scheduled window with the writers paused — a decision for the lane that owns them, not for this script.',
  );
  return 3;
}

process.exit(main());
