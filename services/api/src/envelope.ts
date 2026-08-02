/**
 * The response envelope, defined once. Every endpoint inherits it — no route
 * re-implements this shape. `docs/API_CONTRACTS.md`.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ApiError = { code: string; message: string };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true, data } satisfies ApiResponse<T>, status);
}

export function fail(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
) {
  return c.json({ ok: false, error: { code, message } } satisfies ApiResponse<never>, status);
}
