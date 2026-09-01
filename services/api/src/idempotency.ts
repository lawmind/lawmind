/**
 * `Idempotency-Key` — contract revision R16, one mechanism for six create writes.
 *
 * `docs/product/RCC_V1_API_CONTRACT_R16_AMENDMENT.md` is the spec; NEW3 bus 1691
 * is the handoff. Migration `0100_api_idempotency_records.sql` carries the
 * measurements this file's concurrency design rests on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG. NOT "THE SAME NOTE TWICE"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An advocate saves an annotation on a train. The request reaches the server,
 * the row commits, and the response never gets back. The app retries — correctly,
 * because from where it is standing nothing happened — and a second permanent row
 * appears. Six current-v1 creates have that shape and none of them has a durable
 * identity for the ATTEMPT, only for the resulting object.
 *
 * The fix is a key that names the attempt. It is emphatically **not** content
 * de-duplication: two identical annotations under two different keys are two
 * intentional writes, and the same citation copied a week apart is two events an
 * advocate may need warning about twice. Nothing in this file hashes text for its
 * meaning — the fingerprint exists only to catch a key being REUSED for a
 * different request, and it is an opaque digest either way.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS NO `in_progress` ROW, AND THEREFORE NO TTL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious design commits a claim row, runs the mutation, then marks the
 * claim complete. It has two transactions, so it has a window: crash between
 * them and the key is claimed forever with nothing behind it, which forces a
 * stale-claim reaper, which forces a time-to-live nobody has decided
 * (`IDEMPOTENCY_RETENTION_POLICY = UNDECIDED_REQUIRES_NEW3`).
 *
 * There is exactly one transaction here. `INSERT ... ON CONFLICT DO NOTHING` is
 * the first statement in it, and Postgres does the rest — measured against this
 * cluster before a line of this file was written:
 *
 *   executor commits   the follower's insert BLOCKS until the executor commits,
 *                      then returns zero rows, and the committed record is
 *                      immediately visible to it. One executor, chosen by the
 *                      unique index rather than by application code.
 *   executor aborts    the follower's insert SUCCEEDS. A crashed executor
 *                      leaves nothing behind and the retry becomes the executor.
 *   follower impatient `SET LOCAL lock_timeout` turns the wait into SQLSTATE
 *                      55P03, which becomes `409 IDEMPOTENCY_IN_PROGRESS` with
 *                      `Retry-After: 1` — an answer, never a hang.
 *
 * So the domain mutation and the completed result commit together or neither
 * does, which is the property R16 §5 asks for by name, and a committed record is
 * never incomplete — the migration's deferred constraint trigger makes that a
 * database invariant rather than a promise this file keeps.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT AN ABSENT HEADER MEANS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Legacy behaviour, byte for byte. No transaction is opened, no row is written,
 * and the handler runs on the pool exactly as it did before R16 — the wrapper is
 * a pass-through. R16 is `WIRE_BREAKING_CHANGE = NO` and this is where that is
 * true or false.
 */
import { createHash } from 'node:crypto';

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Sql, TransactionSql } from 'postgres';

import { fail } from './envelope.ts';
import { atomically, type Db } from './transaction.ts';

/**
 * How long a follower waits for the executor before answering `409
 * IDEMPOTENCY_IN_PROGRESS`.
 *
 * Sized from the two numbers around it, not guessed: `CORE_STATEMENT_TIMEOUT_MS`
 * is 10 s and the core pool holds 8 connections, so a waiter must give up well
 * inside the statement budget and must not be able to occupy a connection long
 * enough to starve the pool. Two seconds is longer than any of the six mutations
 * takes and short enough that eight simultaneous followers are a blip rather
 * than an outage. The retry that follows is what actually collects the result.
 */
export const IDEMPOTENCY_WAIT_BUDGET_MS = 2_000;

/**
 * 8–128 visible ASCII, exactly as R16 §1 states it.
 *
 * `\x21-\x7e` excludes space, so a value with surrounding whitespace fails
 * rather than being trimmed into something the client did not send — trimming is
 * how two different clients come to share a scope. The comma is excluded on top
 * of that because `Headers.get()` joins repeated headers with `", "`: a value
 * containing one is either a client sending two keys or a client sending a
 * character it cannot get back, and both are better refused than guessed at.
 */
const KEY_PATTERN = /^[\x21-\x2b\x2d-\x7e]{8,128}$/;

/** The header, spelled once. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export type IdempotencyScope = {
  /** `users.id` — the principal. Undefined means "no scope", and the wrapper passes through. */
  userId: string | undefined;
  /** The canonical route TEMPLATE, e.g. `/matters/:id/events`. Never a concrete path. */
  route: string;
  /** Route parameter values, included in the fingerprint so one key cannot serve two matters. */
  params?: Record<string, string>;
  /** Operation-significant query values. None of the six has any; the mechanism does. */
  query?: Record<string, string>;
  /** The fully validated, normalised body. `undefined` for a bodyless create. */
  body?: unknown;
  /** Uppercase method. Defaults to the request's own. */
  method?: string;
};

/**
 * Canonical JSON: object keys sorted at every depth, arrays left in order.
 *
 * Key order and transport whitespace must not change a fingerprint (R16 §3), and
 * `JSON.stringify` preserves insertion order — so two semantically identical
 * bodies that arrived with their fields in different orders would otherwise
 * conflict with each other and reject a legitimate retry. Array order is
 * meaningful and is deliberately NOT sorted.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) out[key] = canonical(source[key]);
  return out;
}

/**
 * The request fingerprint.
 *
 * Route template, method, path parameters, significant query and the validated
 * body — and nothing else. Authentication headers, the key itself, trace ids and
 * every other piece of transport metadata are excluded, so a token refresh
 * between two attempts at one logical mutation does not turn a legitimate replay
 * into a `409`.
 */
export function requestFingerprint(scope: IdempotencyScope & { method: string }): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          v: 1,
          method: scope.method,
          route: scope.route,
          params: scope.params ?? {},
          query: scope.query ?? {},
          body: scope.body ?? null,
        }),
      ),
    )
    .digest('hex');
}

type StoredResult = {
  request_fingerprint: string;
  outcome: 'success' | 'refusal';
  response_status: number;
  response_body: unknown;
};

/** Thrown to roll the (empty) follower transaction back before answering. */
class FollowerOutcome extends Error {
  constructor(
    readonly kind: 'replay' | 'mismatch' | 'in_progress',
    readonly stored?: StoredResult,
  ) {
    super(kind);
  }
}

/** Thrown to roll the executor's transaction back while still returning its response. */
class ExecutorFailed extends Error {
  constructor(readonly response: Response) {
    super('handler failed before a durable mutation');
  }
}

function isLockTimeout(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '55P03';
}

/**
 * The retryable answer, spelled once. Two paths reach it — the follower that
 * blocked and found no committed row, and the follower whose `lock_timeout`
 * fired while still waiting — and they must be indistinguishable to a client:
 * both mean "somebody else is executing this, ask again", and both created
 * nothing.
 */
function inProgress(c: Context): Response {
  c.header('Retry-After', '1');
  return fail(
    c,
    'IDEMPOTENCY_IN_PROGRESS',
    'The same request is still being processed. Retry in a moment.',
    409,
  );
}

/**
 * A transaction handle, presented to a route handler typed against the pool.
 *
 * `TransactionSql` is structurally a subset of `Sql` — it has the tagged
 * template, `unsafe`, `json` and `savepoint`, and it does NOT have `begin`,
 * `end`, `close`, `listen` or `options`. Every one of the six handlers uses only
 * the subset, so the cast is sound today; the one thing that would break it is a
 * handler calling `sql.begin`, and the fix for that is already in the tree:
 * `transaction.ts`'s `atomically`, which `training/consent.ts` now uses because
 * it was the one handler that did.
 *
 * Widening all six signatures to `Db` instead would push the same cast outward
 * to `matters/route.ts`, `judgments/annotations.ts` and four more files without
 * removing it, and would make the pool/transaction distinction ambient in code
 * that has no opinion about it.
 */
function asHandlerSql(sql: Db | TransactionSql): Sql {
  return sql as Sql;
}

/**
 * Run one create mutation under R16 semantics.
 *
 * `run` receives the transaction the idempotency record is written in, and MUST
 * do all of its durable work on it — that coupling is the entire point. Anything
 * genuinely fire-and-forget (an activation metric) takes the pool instead, since
 * it runs after the transaction it would otherwise be using has committed.
 */
export async function withIdempotency(
  c: Context,
  sql: Db,
  scope: IdempotencyScope,
  run: (tx: Sql) => Promise<Response>,
): Promise<Response> {
  const raw = c.req.header(IDEMPOTENCY_HEADER);

  // No header: the R15 path, untouched. Not a transaction, not a row, not a read.
  if (raw === undefined) return run(asHandlerSql(sql));

  if (!KEY_PATTERN.test(raw)) {
    return fail(
      c,
      'INVALID_IDEMPOTENCY_KEY',
      `${IDEMPOTENCY_HEADER} must be 8-128 visible ASCII characters with no spaces or commas.`,
      400,
    );
  }

  /**
   * No principal, no scope. R16 scopes a record to the authenticated user id, so
   * there is nothing to key an anonymous or un-onboarded caller's record to —
   * and the handler is about to answer 401/403 anyway. Passing through means a
   * signed-out caller cannot consume, probe or collide with anybody's key.
   */
  if (!scope.userId) return run(asHandlerSql(sql));

  const method = scope.method ?? c.req.method.toUpperCase();
  const fingerprint = requestFingerprint({ ...scope, method });

  try {
    return await atomically(sql, async (tx) => {
      /**
       * The wait budget, applied to the claim and to nothing else. Left in place
       * it would also cap every lock the domain mutation takes, so a busy row
       * elsewhere would surface as a spurious `IDEMPOTENCY_IN_PROGRESS` — an
       * answer about the wrong thing.
       */
      await tx.unsafe(`SET LOCAL lock_timeout = '${IDEMPOTENCY_WAIT_BUDGET_MS}ms'`);
      const claimed = await tx<{ id: string }[]>`
        INSERT INTO api_idempotency_records
          (user_id, method, route, idempotency_key, request_fingerprint)
        VALUES (${scope.userId!}::uuid, ${method}, ${scope.route}, ${raw}, ${fingerprint})
        ON CONFLICT (user_id, method, route, idempotency_key) DO NOTHING
        RETURNING id`;
      await tx.unsafe(`SET LOCAL lock_timeout = '0'`);

      if (claimed.length === 0) {
        // Somebody else owns this key. Their insert made us wait for it, so if
        // they committed the row is visible to this statement's snapshot.
        const [stored] = await tx<StoredResult[]>`
          SELECT request_fingerprint, outcome, response_status, response_body
          FROM api_idempotency_records
          WHERE user_id = ${scope.userId!}::uuid AND method = ${method}
            AND route = ${scope.route} AND idempotency_key = ${raw}`;
        // Not visible and not ours: an executor is still running and we did not
        // block on it. Answer retryably rather than executing a second time.
        if (!stored) throw new FollowerOutcome('in_progress');
        if (stored.request_fingerprint !== fingerprint) throw new FollowerOutcome('mismatch');
        throw new FollowerOutcome('replay', stored);
      }

      const response = await run(asHandlerSql(tx));

      /**
       * A 5xx is "we do not know what happened", and caching it as an outcome
       * would make an outage permanent for that key. Roll the claim back with
       * the mutation so a retry can genuinely execute. A 4xx is the opposite: a
       * deterministic refusal the same request will meet again, recorded so the
       * replay is the refusal and a different fingerprint still conflicts.
       */
      if (response.status >= 500) throw new ExecutorFailed(response);

      /**
       * `tx.json(...)`, never `JSON.stringify(...)::jsonb`.
       *
       * postgres.js JSON-encodes a JS string parameter, so the stringify form
       * stores a jsonb *string scalar* — `jsonb_typeof` reads `string`, not
       * `object` — and the replay then hands the client a JSON-encoded string
       * where the original response was an object. Measured, not assumed: the
       * first version of this line did exactly that and every replay test failed
       * with `data` undefined.
       */
      const body: unknown = await response.clone().json();
      await tx`
        UPDATE api_idempotency_records
        SET outcome = ${response.status >= 400 ? 'refusal' : 'success'},
            response_status = ${response.status},
            response_body = ${tx.json(body as never)},
            completed_at = now()
        WHERE id = ${claimed[0]!.id}`;

      return response;
    });
  } catch (error) {
    if (error instanceof ExecutorFailed) return error.response;
    if (error instanceof FollowerOutcome) {
      if (error.kind === 'replay') {
        // The ORIGINAL status and body. Trace metadata may differ; the resource
        // id and the mutation timestamp are the ones the first attempt created.
        return c.json(
          error.stored!.response_body as never,
          error.stored!.response_status as ContentfulStatusCode,
        );
      }
      if (error.kind === 'mismatch') {
        return fail(
          c,
          'IDEMPOTENCY_KEY_REUSE_MISMATCH',
          `This ${IDEMPOTENCY_HEADER} was already used for a different request. Use a new key for a new change.`,
          409,
        );
      }
      return inProgress(c);
    }
    if (isLockTimeout(error)) return inProgress(c);
    throw error;
  }
}
