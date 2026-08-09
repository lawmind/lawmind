/**
 * The response envelope, defined once. Every endpoint inherits it — no route
 * re-implements this shape. `docs/API_CONTRACTS.md`.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ApiError = {
  code: string;
  message: string;
  /**
   * Optional structured detail. **Additive** — every existing error is
   * unchanged, and a client that ignores this behaves exactly as before.
   */
  details?: Record<string, unknown>;
};
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true, data } satisfies ApiResponse<T>, status);
}

export function fail(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
  /**
   * Structured detail the client can act on, omitted entirely when absent so no
   * existing error shape changes.
   *
   * Added for the query language: a parse failure carries the **character
   * offset** of the mistake and the list of valid field names. `"Unknown field
   * judgw"` is a complaint; the same message with an offset and the ten real
   * fields is something an advocate can fix in one keystroke — and a message
   * they cannot act on trains them to stop reading messages.
   */
  details?: Record<string, unknown>,
) {
  return c.json(
    {
      ok: false,
      error: details ? { code, message, details } : { code, message },
    } satisfies ApiResponse<never>,
    status,
  );
}
