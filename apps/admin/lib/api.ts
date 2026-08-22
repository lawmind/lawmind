/**
 * The one fetch wrapper for the admin desk. Mirrors the envelope
 * `services/api/src/envelope.ts` defines — `{ ok: true, data }` or
 * `{ ok: false, error: { code, message } }` — every route inherits it, so one
 * parser here covers all of them.
 *
 * NO ADMIN AUTH EXISTS YET (`docs/API_CONTRACTS.md` §Cause list sync, 8 Aug
 * 2026: "there is no authentication in this service yet — auth is A2/S5").
 * There is nothing to attach to a request. Privileged calls will 401 with
 * `AUTH_REQUIRED` until that ships, and the server's own message says so —
 * callers render that message, they do not paper over it.
 */

/**
 * `NEXT_PUBLIC_API_URL` is inlined at build time by Next.js (the
 * `NEXT_PUBLIC_` prefix is what makes an env var reach browser code at all).
 * Set it per environment in Railway/hosting config or a local `.env.local`.
 * The fallback below is today's only known deployment and stays wrong until
 * FQ-HOSTING (docs/FOUNDER_QUEUE.md) lands a real one — it is a fallback, not
 * an endorsement.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-1c0b4.up.railway.app';

const TIMEOUT_MS = 15_000;

export type ApiError = { code: string; message: string };
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: ApiError };

export async function apiRequest<T>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; query?: Record<string, string | undefined> },
): Promise<ApiResult<T>> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const json = (await res.json()) as { ok: true; data: T } | { ok: false; error: ApiError };
    if (json.ok) return { ok: true, data: json.data };
    return { ok: false, status: res.status, error: json.error };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: 'Could not reach the API. Check the connection and retry.' },
    };
  } finally {
    clearTimeout(timeout);
  }
}
