#!/usr/bin/env node
/**
 * Prune PostgreSQL log files older than N days.
 *
 *   node scripts/pg-log-retention.mjs [--days 30] [--dir PATH] [--apply]
 *
 * Dry by default; `--apply` deletes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SCRIPT AND NOT A POSTGRES SETTING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Postgres has no retention policy. It has rotation, and the two are different:
 * `log_filename = 'postgresql-%Y-%m-%d.log'` with `log_truncate_on_rotation =
 * off` gives one file per day, kept forever. The usual trick for bounded
 * retention is `%a` (day-of-week) plus truncate-on-rotation, which self-limits
 * to seven files — and silently makes any log older than a week unreadable.
 *
 * That trade is wrong here. Three of the last week's findings were reconstructed
 * from dated logs — the six `0xC000013A` postmaster deaths across four days, the
 * `386 KB → 108 MB` growth curve, and which statements held `judgments` during a
 * migration. A seven-day window would have destroyed two of them.
 *
 * So the filenames stay dated and the retention is explicit, visible and long.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GROWTH THIS BOUNDS WAS A SETTING, NOT A VOLUME PROBLEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured 18 Aug 2026 on `postgresql-2026-08-18.log`, 108,698,908 bytes against
 * 386,447 the previous day — 281x:
 *
 *   DETAIL: Parameters (bind values)   96,289,111 B   88.6%   1,359 blocks
 *   STATEMENT (on error)                9,064,637 B    8.3%     980 blocks
 *   LOG: duration (statement text)      4,245,209 B    3.9%   1,450 blocks
 *   everything else                       307,419 B    0.3%
 *
 * 70.9 KB per parameter block, because `log_parameter_max_length` was `-1` and
 * `full_text` is a bind parameter on every judgment INSERT. Capped at 512 bytes
 * on 18 Aug; `log_parameter_max_length_on_error` was already 0.
 *
 * What was deliberately NOT reduced: `log_min_duration_statement` (10s),
 * `log_min_error_statement`, `log_lock_waits`, `log_checkpoints`. Those carry
 * slow-query identity, duration and the fingerprint, which is the diagnostic
 * value the logging exists for. Turning them down to shrink a file would have
 * removed the evidence rather than the noise.
 *
 * Retention is therefore a second line, not the fix.
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_DIR = process.env['LAWMIND_PG_LOG_DIR'] ?? 'C:\\lawmind\\pgdata\\log';

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v === undefined ? fallback : v;
}

function main() {
  const days = Number(flag('--days', 30));
  const dir = flag('--dir', DEFAULT_DIR);
  const apply = process.argv.includes('--apply');

  if (!Number.isFinite(days) || days < 7) {
    // A floor, not a preference. Below a week this stops being retention and
    // starts being the thing that deletes the evidence for an incident that is
    // still being investigated.
    console.error('--days must be at least 7; anything shorter deletes logs while they are still being read');
    return 2;
  }

  const cutoff = Date.now() - days * 86_400_000;
  let files;
  try {
    files = readdirSync(dir).filter((f) => /^postgresql-.*\.log$/.test(f));
  } catch (error) {
    console.error('cannot read ' + dir + ': ' + error.message);
    return 2;
  }

  let freed = 0;
  let kept = 0;
  const doomed = [];
  for (const file of files) {
    const path = join(dir, file);
    const st = statSync(path);
    if (st.mtimeMs < cutoff) doomed.push({ file, bytes: st.size, mtime: st.mtime.toISOString() });
    else kept += 1;
  }

  for (const d of doomed) {
    freed += d.bytes;
    console.log((apply ? 'DELETE ' : 'would delete ') + d.file + '  ' + (d.bytes / 1024 ** 2).toFixed(1) + ' MiB  ' + d.mtime);
    if (apply) unlinkSync(join(dir, d.file));
  }

  console.log(
    (apply ? 'deleted ' : 'would free ') + (freed / 1024 ** 2).toFixed(1) + ' MiB across ' +
      doomed.length + ' file(s); ' + kept + ' kept (retention ' + days + ' days)',
  );
  if (!apply && doomed.length > 0) console.log('re-run with --apply to delete');
  return 0;
}

process.exit(main());
