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
 *
 * FAIL CLOSED, NOT SILENTLY WRONG — same defect and same fix as
 * `apps/mobile/src/api/client.ts`. Until 22 Aug 2026 a missing var fell back
 * to `api-production-1c0b4.up.railway.app`, 0 active deployments since 11 Aug,
 * in every environment including a real production build. `next dev` alone
 * gets a local default; any other build throws at import time rather than
 * guessing a URL nobody chose. FQ-HOSTING (docs/FOUNDER_QUEUE.md) still owns
 * the real per-environment URL.
 */
function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  throw new Error(
    'NEXT_PUBLIC_API_URL is not set on a production build. Refusing to fall back to a ' +
      'guessed API URL — set it in the hosting environment for this deployment. ' +
      'See docs/FOUNDER_QUEUE.md FQ-HOSTING.'
  );
}

const BASE_URL = resolveBaseUrl();

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
