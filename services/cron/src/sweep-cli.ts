/**
 * Run the nightly sweep once, from the command line.
 *
 *   pnpm --filter @lawmind/cron sweep            # generate tomorrow's briefings
 *   pnpm --filter @lawmind/cron sweep --dry-run  # report what it would do
 *   pnpm --filter @lawmind/cron sweep --date 2026-09-25
 *
 * Exists so the sweep can be exercised and re-run by hand. A nightly job that can
 * only be observed by waiting until 23:00 is a job nobody debugs — and the first
 * time it matters is the night it fails.
 */
import postgres from 'postgres';

import { runSweep, tomorrowIst } from './sweep.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateArg = args.indexOf('--date');
const forced = dateArg >= 0 ? args[dateArg + 1] : undefined;

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

// The sweep computes tomorrow from `now`; --date is honoured by moving `now` back
// a day, so the same code path runs rather than a second one that only tests use.
const now = forced ? new Date(`${forced}T00:00:00Z`) : new Date();
const target = forced ?? tomorrowIst();
if (forced) now.setUTCDate(now.getUTCDate() - 1);

const sql = postgres(url, { max: 4, onnotice: () => {} });
try {
  if (dryRun) {
    const rows = await sql<{ id: string; case_title: string; court: string }[]>`
      SELECT id, case_title, court FROM matters
      WHERE next_hearing_date = ${target}::date AND status = 'active'
      ORDER BY created_at`;
    console.log(`DRY RUN — ${target}: ${rows.length} active matter(s) listed`);
    for (const r of rows) console.log(`  ${r.case_title} · ${r.court}`);
    process.exit(0);
  }

  const result = await runSweep(sql, now);
  console.log(
    `sweep ${result.hearingDate}: considered ${result.considered}, ` +
      `generated ${result.generated}, failed ${result.failed}`,
  );
  for (const o of result.outcomes) {
    console.log(
      o.ok
        ? `  ok      ${o.caseTitle} ${o.regenerated ? '(regenerated)' : ''}`
        : `  FAILED  ${o.caseTitle} — ${o.error}`,
    );
  }
  // A partial night is a failure the operator must see in the exit code, not
  // only in a line of output somebody has to read.
  process.exit(result.failed > 0 ? 1 : 0);
} finally {
  await sql.end();
}
