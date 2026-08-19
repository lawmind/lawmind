/**
 * Is this error worth waiting out, or is it a defect?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WHOLE FLEET DIED ON 17 AUG BECAUSE THE ANSWER WAS COMPUTED IN SEVEN PLACES
 * AND WAS WRONG IN ALL OF THEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The postmaster restarted at 22:36:43Z. Between 22:39:07Z and 22:39:41Z every
 * worker in the ingest fleet died with the same line:
 *
 *     FATAL uncaughtException: PostgresError: the database system is not yet
 *     accepting connections
 *
 * and `supervise.mjs` abandoned each scope in turn — *"died within 20s three
 * times running (exit 1) — this is a defect, not a network blip. Stopping."* It
 * applied its rule correctly to a false premise. **The fleet sat at zero workers
 * until a human looked at the process table.**
 *
 * `hc-load-cli.ts` already had a retry wrapper that would have absorbed this
 * entirely. It never fired, because its classifier matched only Node **errno**
 * strings (`ECONNRESET`, `ETIMEDOUT`, …) while a `PostgresError` carries a
 * **SQLSTATE** in that same `.code` field. `57P03` fell straight through to
 * `throw`.
 *
 * An audit found the identical hole in every other writer in this service:
 * `enrich-cli`, `paragraphs-cli` and `reextract-cli` each carry their own
 * errno-only classifier, and `citations-cli`, `hc-classify-cli`,
 * `citation-keys-cli` and `resolve-cli` have no retry at all. Seven copies of a
 * judgement call, one of them measurably wrong, is why this module exists: the
 * answer to "should I wait?" belongs in one place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS TRANSIENT, AND WHY A DATABASE AND A NETWORK ARE THE SAME EVENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * To a batch writer, a database that is not there *yet* and a network that is not
 * there *yet* are indistinguishable and are survived identically — by waiting.
 * They are therefore one predicate, not two.
 *
 * What is NOT here, deliberately: constraint violations, syntax errors, encoding
 * failures, permission errors. Those are defects, they will fail identically on
 * attempt ten, and retrying them turns a loud bug into a slow one.
 */

/**
 * Node/undici errno codes. `UND_ERR_*` matter because undici wraps the real code
 * one level down in `.cause` — checking only the top-level `.code` misses every
 * S3 connect timeout, which is how this list originally grew.
 */
const TRANSIENT_ERRNO = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/**
 * The SQLSTATEs a client sees across a server restart. `57P03` is the one that
 * cost the fleet; the shutdown pair is what a worker holding an open connection
 * sees on the way down, and the `08xxx` family is the reconnect racing recovery.
 *
 *   57P03  cannot_connect_now    "not yet accepting connections" / "starting up"
 *   57P01  admin_shutdown        server going down under it
 *   57P02  crash_shutdown        same, after a crash
 *   08006  connection_failure    socket died mid-statement
 *   08001  unable_to_establish   reconnect attempted too early
 *   08004  rejected              server still refusing connections
 */
const TRANSIENT_SQLSTATE = new Set(['57P03', '57P01', '57P02', '08006', '08001', '08004']);

/**
 * A message backstop, because not every driver path preserves `.code`. Costs
 * nothing and catches the wording Postgres uses even when the state is lost in
 * wrapping.
 */
const TRANSIENT_MESSAGE =
  /not yet accepting connections|system is starting up|shutting down|in recovery mode|terminating connection|connection terminated/i;

export function isTransientDbOrNetworkError(error: unknown): boolean {
  const err = error as
    | (NodeJS.ErrnoException & { cause?: unknown; message?: string })
    | undefined;
  if (!err) return false;
  if (err.code && (TRANSIENT_ERRNO.has(err.code) || TRANSIENT_SQLSTATE.has(err.code))) return true;
  if (err.message && TRANSIENT_MESSAGE.test(err.message)) return true;
  const cause = err.cause as (NodeJS.ErrnoException & { message?: string }) | undefined;
  if (cause?.code && (TRANSIENT_ERRNO.has(cause.code) || TRANSIENT_SQLSTATE.has(cause.code)))
    return true;
  return cause?.message !== undefined && TRANSIENT_MESSAGE.test(cause.message);
}

/**
 * TEN ATTEMPTS, AND THE NUMBER IS A MEASUREMENT RATHER THAN A ROUND FIGURE.
 *
 * The old budget was five: 2+4+8+16+30 = **60 seconds**. This cluster
 * self-recovered from a crash in **150.9 seconds** on 16 Aug (bus 0585), so the
 * budget expired less than halfway through a recovery that was already on the
 * record, and every worker gave up while the database was busy coming back.
 *
 * Ten attempts is 2+4+8+16+30×5 = **210 seconds**, which outlasts the one real
 * recovery this machine has produced, with margin.
 *
 * Being wrong this way costs a genuinely-dead dependency three minutes to
 * surface. Being wrong the other way cost the entire fleet, silently.
 */
export const MAX_TRANSIENT_RETRIES = 10;

export function transientBackoffMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** (attempt - 1));
}

/**
 * Run `work`, waiting out transient database/network failure. Anything this
 * module does not recognise is rethrown immediately and unchanged — a defect
 * must still be loud, and must still reach `supervise.mjs` as an exit.
 */
export async function withTransientRetry<T>(
  what: string,
  work: () => Promise<T>,
  log: (message: string) => void = console.error,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!isTransientDbOrNetworkError(error) || attempt >= MAX_TRANSIENT_RETRIES) throw error;
      const delayMs = transientBackoffMs(attempt);
      const code = (error as NodeJS.ErrnoException).code ?? 'no-code';
      log(
        `transient ${what} failure (${code}), attempt ${attempt}/${MAX_TRANSIENT_RETRIES} — retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
