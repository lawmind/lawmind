/**
 * `pnpm --filter @lawmind/ingest hc:fleet` — is the fleet actually WRITING?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: PROCESS EXISTENCE IS NOT PROOF OF WORKING STATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured twice on 15 Aug 2026, both times with a healthy-looking process
 * table:
 *
 *   - 38 supervisors alive, every one of them 95 seconds from death, because
 *     `start /b` had put them all in the launcher's console and CTRL_CLOSE was
 *     already on its way (exit 3221225786).
 *   - A fleet whose logs were advancing but whose courts had not gained a row
 *     in hours, because the workers were re-scanning `already_held` batches.
 *
 * `ps` answers "is a process alive". It cannot answer "is the corpus growing",
 * and those come apart routinely here. This tool answers the second question
 * only, per court, from production.
 *
 * Read-only. No `full_text` is ever selected — `LANE_PROTOCOL.md` §5, three
 * workers have died pulling text for a whole court over the shared proxy.
 *
 * Usage:
 *   hc:fleet                 windows of 5 and 60 minutes
 *   hc:fleet --minutes 15    a custom recent window alongside the 60-minute one
 */
import { openDb } from '../db-host.ts';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(2);
}

const flag = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const RECENT = Number(flag('--minutes') ?? 5);
if (!Number.isFinite(RECENT) || RECENT <= 0) {
  console.error('--minutes must be a positive number');
  process.exit(2);
}

const sql = await openDb(dbUrl, 2);
try {
  /*
   * Bounded by created_at so this never degenerates into a full-table scan on a
   * 5.7M-row table that 38 workers are writing to. `judgments_created_at_idx`
   * serves it.
   */
  const [overall] = await sql<{ latest: string | null; recent: number; hour: number }[]>`
    SELECT max(created_at)::text                                                       AS latest,
           count(*) FILTER (WHERE created_at > now() - (${RECENT} * interval '1 minute'))::int AS recent,
           count(*) FILTER (WHERE created_at > now() - interval '60 minutes')::int      AS hour
    FROM judgments
    WHERE created_at > now() - interval '2 hours'
  `;

  console.log('=== FLEET WRITE LIVENESS (production, not process table) ===');
  console.log(`latest created_at   : ${overall?.latest ?? 'NOTHING in the last 2 hours'}`);
  console.log(`rows last ${String(RECENT).padStart(2)} min     : ${(overall?.recent ?? 0).toLocaleString()}`);
  console.log(`rows last 60 min    : ${(overall?.hour ?? 0).toLocaleString()}`);

  if ((overall?.hour ?? 0) === 0) {
    console.log('');
    console.log('*** NO ROWS IN AN HOUR. The fleet is not writing, whatever ps says. ***');
  }

  const perCourt = await sql<{ court: string; recent: number; hour: number; latest: string }[]>`
    SELECT court,
           count(*) FILTER (WHERE created_at > now() - (${RECENT} * interval '1 minute'))::int AS recent,
           count(*)::int                                                                       AS hour,
           max(created_at)::text                                                               AS latest
    FROM judgments
    WHERE created_at > now() - interval '60 minutes'
    GROUP BY court
    ORDER BY count(*) DESC
  `;

  console.log('');
  console.log('=== PER COURT, LAST 60 MINUTES ===');
  if (perCourt.length === 0) {
    console.log('(no court has gained a row in the last hour)');
  } else {
    console.log(['court', `last${RECENT}m`, 'last60m', 'latest'].join('\t'));
    for (const r of perCourt) {
      console.log([r.court, r.recent, r.hour, r.latest].join('\t'));
    }
    console.log('');
    console.log(`${perCourt.length} courts writing`);
  }
} finally {
  await sql.end();
}
