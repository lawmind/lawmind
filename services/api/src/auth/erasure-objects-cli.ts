/**
 * Retry the external deletions an account erasure still owes.
 *
 * `executeErasure` sweeps once, inline, and the common case finishes there. This
 * exists for the case that does not: R2 was throttling, the network blipped, the
 * bucket was briefly unreachable. Those requests are sitting at `in_progress`
 * with rows in `erasure_objects`, and something has to come back for them.
 *
 * Idempotent by construction — it only ever selects PENDING and
 * RETRYABLE_FAILURE, so a row that already has a receipt is never re-attempted
 * and the store is never asked twice about an object we can already prove is
 * gone. Running it twice in a row is the same as running it once.
 *
 * WHAT IT WILL NOT DO
 * ────────────────────────────────────────────────────────────────────────────
 * It will not complete a request that has a PERMANENT_FAILURE. Dead letters need
 * a human: a 403 means the credential is wrong, and retrying it on a schedule
 * forever is how a broken credential stays invisible for a month.
 *
 *   npx tsx services/api/src/auth/erasure-objects-cli.ts
 *   npx tsx services/api/src/auth/erasure-objects-cli.ts --request <uuid>
 *   npx tsx services/api/src/auth/erasure-objects-cli.ts --dead-letters
 *
 * Exit 1 when anything is still owed, so a scheduled run's failure is visible to
 * whatever runs it rather than only in its output.
 */
import { objectStoreFromEnv } from '@lawmind/storage/r2';
import postgres from 'postgres';

import { erasureObjectStatus, sweepErasureObjects } from './erasure-objects.ts';

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const requestIndex = argv.indexOf('--request');
  const dataRequestId = requestIndex === -1 ? undefined : argv[requestIndex + 1];
  const listDeadLetters = argv.includes('--dead-letters');

  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  try {
    if (listDeadLetters) {
      const rows = await sql<
        {
          data_request_id: string;
          source: string;
          storage_key: string;
          attempts: number;
          last_error: string | null;
        }[]
      >`
        SELECT data_request_id, source, storage_key, attempts, last_error
          FROM erasure_objects WHERE state = 'PERMANENT_FAILURE'
         ORDER BY first_seen_at`;
      console.log(JSON.stringify({ deadLetters: rows }, null, 2));
      return rows.length === 0 ? 0 : 1;
    }

    const store = objectStoreFromEnv();
    const sweep = await sweepErasureObjects(sql, store, { dataRequestId });

    /**
     * Any request whose objects are now all gone can be completed. Done here
     * rather than inside the sweep because the sweep is about OBJECTS and this
     * is about REQUESTS — and because a request must never be completed as a
     * side effect of something that was only asked to delete a file.
     *
     * The NOT EXISTS is the completion rule from `erasureObjectStatus`, written
     * once more in SQL because this runs as a set operation over every request
     * at once. Both say the same thing: nothing left that is not DELETED.
     */
    const completed = await sql<{ id: string }[]>`
      UPDATE data_requests d
         SET status = 'completed', completed_at = now()
       WHERE d.kind = 'erasure'
         AND d.status = 'in_progress'
         AND EXISTS (SELECT 1 FROM erasure_objects e WHERE e.data_request_id = d.id)
         AND NOT EXISTS (
               SELECT 1 FROM erasure_objects e
                WHERE e.data_request_id = d.id AND e.state <> 'DELETED')
       RETURNING d.id`;

    const [outstanding] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM erasure_objects
       WHERE state IN ('PENDING','RETRYABLE_FAILURE','PERMANENT_FAILURE')`;

    const detail = dataRequestId ? await erasureObjectStatus(sql, dataRequestId) : null;

    console.log(
      JSON.stringify(
        {
          at: new Date().toISOString(),
          channel: sweep.channel,
          attempted: sweep.attempted,
          deleted: sweep.deleted,
          retryable: sweep.retryable,
          permanent: sweep.permanent,
          requestsCompleted: completed.map((r) => r.id),
          objectsStillOwed: Number(outstanding?.n ?? 0),
          request: detail,
        },
        null,
        2,
      ),
    );

    return Number(outstanding?.n ?? 0) === 0 ? 0 : 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 2;
  },
);
