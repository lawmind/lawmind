/**
 * Run the overruled re-check once, from the command line.
 *
 *   pnpm --filter @lawmind/cron recheck
 *
 * Scheduled at 22:30 IST — `17 00 * * *`... no: **`00 17 * * *` UTC**. Railway
 * cron is UTC and every job time in this repo is IST; see `DEPLOYMENT.md`.
 *
 * Runs BEFORE the sweep, because briefings carry authorities and a sweep against
 * a stale status puts overruled law into tonight's briefing.
 */
import postgres from 'postgres';

import { runRecheck } from './recheck.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const sql = postgres(url, { max: 4, onnotice: () => {} });
try {
  const r = await runRecheck(sql);
  console.log(`recheck: checked ${r.checked}, flipped ${r.flipped}, failed ${r.failed}`);
  for (const o of r.outcomes) {
    console.log(
      o.ok
        ? `  ok      ${o.caseTitle}: ${o.shownStatus} → ${o.liveStatus}, ${o.notified} notified`
        : `  FAILED  ${o.caseTitle}: ${o.error}`,
    );
  }
  // A failed flip means an advocate is still looking at a badge that is wrong.
  // That must reach the operator as a non-zero exit, not a line of output.
  process.exit(r.failed > 0 ? 1 : 0);
} finally {
  await sql.end();
}
