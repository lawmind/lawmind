/**
 * The external half of account erasure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ACTUALLY BROKEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `eraseUser` deletes the rows and RETURNS the storage keys it cannot remove.
 * `executeErasure` returned them under the name `storageKeysStillToDelete`.
 * Both were honest. Nothing consumed them, and the request was stamped
 * `completed` regardless — so the compliance claim was made by a status column
 * while the advocate's uploaded PDFs were still fetchable by key. R4 called it
 * a whole-app release blocker and it was right to.
 *
 * The fix is not "also call delete". It is that a returned array cannot be
 * retried, cannot be audited, and vanishes when the HTTP response is discarded.
 * Deletion needs a lifecycle with a row per object, and a request may only reach
 * `completed` when every one of those rows says DELETED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY DELETE IS FOLLOWED BY HEAD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * S3-compatible DELETE is idempotent and answers 204 whether or not the key was
 * ever there. That makes the response worthless as evidence: a 204 is equally
 * consistent with "the object is gone" and with "we are pointed at the wrong
 * bucket, nothing matched, and the object is still live in the right one".
 *
 * So this deletes, then HEADs, and stores what the HEAD said. `head()` returning
 * null — the object is not there — is the receipt. Anything else is a failure
 * even if the DELETE reported success.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three layers, because a retry loop that is idempotent only by luck is a retry
 * loop that eventually double-deletes something it should not have:
 *
 *   1. `UNIQUE (data_request_id, storage_key)` — recording the same key twice
 *      for one request is a no-op, so re-running an erasure cannot fork a second
 *      lifecycle for the same object.
 *   2. The sweep selects only PENDING and RETRYABLE_FAILURE. A DELETED row is
 *      never touched again, so the store is never asked a second time about an
 *      object we already have a receipt for.
 *   3. The DELETE itself is idempotent at the protocol level, which is what
 *      makes it safe to retry after a timeout where we genuinely do not know
 *      whether the first attempt landed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT DEAD-LETTERS AND WHAT DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PERMANENT_FAILURE does NOT complete a request. That is the point. An erasure
 * we cannot finish must stay visibly unfinished, because the alternative is the
 * defect we are fixing wearing a different hat: a dead-letter that silently
 * counted as done would be the same false claim with more machinery.
 */
import type { ObjectStore } from '@lawmind/storage/r2';
import type { Sql, TransactionSql } from 'postgres';

/** How many times a retryable failure is retried before it dead-letters. */
export const MAX_ATTEMPTS = 5;

export type ErasureObjectState =
  | 'PENDING'
  | 'DELETED'
  | 'RETRYABLE_FAILURE'
  | 'PERMANENT_FAILURE';

export type ErasureObjectRow = {
  id: string;
  data_request_id: string;
  source: string;
  bucket: string;
  storage_key: string;
  state: ErasureObjectState;
  attempts: number;
  last_error: string | null;
  receipt: string | null;
};

export type PendingObject = {
  /** Which column it came from, e.g. `documents.storage_key`. */
  readonly source: string;
  readonly storageKey: string;
};

/**
 * Record what an erasure owes, in the SAME transaction that deletes the rows.
 *
 * This is not a convenience — it is the only ordering that cannot lose a key. A
 * crash after the DELETE and before the INSERT would leave an object alive with
 * nothing left in the database pointing at it, which is unrecoverable: the row
 * that held the key is the only thing that knew the key.
 *
 * `ON CONFLICT DO NOTHING` makes a re-run harmless rather than a constraint
 * violation. A second erasure of the same request finds the same keys and adds
 * nothing.
 */
export async function recordErasureObjects(
  tx: TransactionSql | Sql,
  dataRequestId: string,
  bucket: string,
  objects: readonly PendingObject[],
): Promise<number> {
  if (objects.length === 0) return 0;
  const rows = objects.map((o) => ({
    data_request_id: dataRequestId,
    source: o.source,
    bucket,
    storage_key: o.storageKey,
    state: 'PENDING' as const,
  }));
  const inserted = await tx`
    INSERT INTO erasure_objects ${tx(rows)}
    ON CONFLICT (data_request_id, storage_key) DO NOTHING
    RETURNING id`;
  return inserted.length;
}

/**
 * Classify a failure. Retryable or not, and never "probably".
 *
 * The distinction is operational, not cosmetic: a retryable failure keeps the
 * request open and keeps trying, a permanent one stops trying and asks for a
 * human. Getting it backwards in either direction is expensive — retrying a 403
 * forever hides a credential problem, and dead-lettering a timeout abandons an
 * object that would have deleted on the next attempt.
 *
 * Unrecognised failures are treated as RETRYABLE, deliberately. An unknown error
 * that is actually permanent costs `MAX_ATTEMPTS` wasted calls and then
 * dead-letters anyway; an unknown error treated as permanent abandons an object
 * that was one retry from gone. The attempt budget makes the first mistake
 * self-correcting and nothing makes the second one self-correcting.
 */
export function isPermanent(message: string): boolean {
  return /\b(400|401|403|404|405|409|501)\b|InvalidBucketName|SignatureDoesNotMatch|AccessDenied|malformed/i.test(
    message,
  );
}

export type SweepResult = {
  attempted: number;
  deleted: number;
  retryable: number;
  permanent: number;
  /** The store that answered, for the log line and for the audit record. */
  channel: string;
};

/**
 * Delete every object this request still owes, once.
 *
 * Deliberately NOT a loop with sleeps. One pass per call, so the caller decides
 * the cadence: `executeErasure` runs it inline (the common case is a handful of
 * keys and it succeeds immediately), and `erasure-objects-cli.ts` runs it on a
 * schedule for whatever did not. A function that slept inside a request handler
 * would hold an HTTP connection open across a retry budget.
 */
export async function sweepErasureObjects(
  sql: Sql,
  store: ObjectStore,
  options: { dataRequestId?: string | undefined; limit?: number | undefined } = {},
): Promise<SweepResult> {
  const limit = options.limit ?? 500;
  const rows = await sql<ErasureObjectRow[]>`
    SELECT id, data_request_id, source, bucket, storage_key, state, attempts, last_error, receipt
      FROM erasure_objects
     WHERE state IN ('PENDING','RETRYABLE_FAILURE')
       ${options.dataRequestId ? sql`AND data_request_id = ${options.dataRequestId}::uuid` : sql``}
     ORDER BY last_attempt_at NULLS FIRST
     LIMIT ${limit}`;

  const result: SweepResult = {
    attempted: rows.length,
    deleted: 0,
    retryable: 0,
    permanent: 0,
    channel: store.name,
  };

  for (const row of rows) {
    const attempts = row.attempts + 1;
    try {
      await store.delete(row.storage_key);

      // The receipt. See the header: the DELETE's own answer proves nothing.
      const still = await store.head(row.storage_key);
      if (still !== null) {
        throw new Error(
          `deleted, but the object is still there: HEAD reports ${still.size} bytes`,
        );
      }

      await sql`
        UPDATE erasure_objects
           SET state = 'DELETED', attempts = ${attempts}, last_attempt_at = now(),
               deleted_at = now(), last_error = NULL,
               receipt = ${`${store.name}: DELETE then HEAD returned not-found at ${new Date().toISOString()}`}
         WHERE id = ${row.id}`;
      result.deleted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = isPermanent(message) || attempts >= MAX_ATTEMPTS;
      const state: ErasureObjectState = permanent ? 'PERMANENT_FAILURE' : 'RETRYABLE_FAILURE';
      await sql`
        UPDATE erasure_objects
           SET state = ${state}, attempts = ${attempts}, last_attempt_at = now(),
               last_error = ${
                 attempts >= MAX_ATTEMPTS && !isPermanent(message)
                   ? `${message} (attempt budget of ${MAX_ATTEMPTS} spent)`
                   : message
               }
         WHERE id = ${row.id}`;
      if (permanent) result.permanent += 1;
      else result.retryable += 1;
    }
  }

  return result;
}

export type ErasureObjectSummary = {
  total: number;
  pending: number;
  deleted: number;
  retryable: number;
  permanent: number;
  /** True only when every object is DELETED. Nothing else completes a request. */
  complete: boolean;
  deadLettered: { storageKey: string; source: string; lastError: string | null }[];
};

/**
 * Is this request's external work actually finished?
 *
 * `complete` is `pending + retryable + permanent === 0`, written that way rather
 * than as `deleted === total` so that a state added later has to be classified
 * on purpose instead of silently counting as done.
 */
export async function erasureObjectStatus(
  sql: Sql,
  dataRequestId: string,
): Promise<ErasureObjectSummary> {
  const rows = await sql<
    { state: ErasureObjectState; storage_key: string; source: string; last_error: string | null }[]
  >`
    SELECT state, storage_key, source, last_error
      FROM erasure_objects WHERE data_request_id = ${dataRequestId}::uuid`;

  const count = (s: ErasureObjectState) => rows.filter((r) => r.state === s).length;
  const pending = count('PENDING');
  const retryable = count('RETRYABLE_FAILURE');
  const permanent = count('PERMANENT_FAILURE');

  return {
    total: rows.length,
    pending,
    deleted: count('DELETED'),
    retryable,
    permanent,
    complete: pending + retryable + permanent === 0,
    deadLettered: rows
      .filter((r) => r.state === 'PERMANENT_FAILURE')
      .map((r) => ({ storageKey: r.storage_key, source: r.source, lastError: r.last_error })),
  };
}
