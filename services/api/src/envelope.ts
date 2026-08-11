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
  const resolved = resolveAuthFailure(c, code, message, status);
  return c.json(
    {
      ok: false,
      error: details
        ? { code: resolved.code, message: resolved.message, details }
        : { code: resolved.code, message: resolved.message },
    } satisfies ApiResponse<never>,
    resolved.status,
  );
}

/**
 * `AUTH_REQUIRED` → `PROFILE_INCOMPLETE` when the caller IS signed in.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS FIXES — RCC BUS 0058
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `profileIdFor` (`auth/middleware.ts`) knows the difference between two states
 * and throws it away one line before it matters:
 *
 *   no `authId`                    never signed in, or the session expired
 *   `authId` set, no `users` row   signed in, onboarding not finished
 *
 * Both collapse to `undefined`, so all 48 `AUTH_REQUIRED` sites answer *"sign in
 * to continue"* — including to an advocate who **just signed in successfully**.
 * Found by smoke-testing the Drafts tab against production: magic link → verify
 * → a real access token → 401 "sign in to continue". RCC named it as the same
 * class as `cnr`, `disposal_nature` and `petitioner`: real information, dropped
 * at the one point that had it.
 *
 * **The status changes to 403, and that is the substantive half of the fix.**
 * A client seeing 401 refreshes its token and retries, which cannot help — the
 * token was never the problem — so the honest failure is a re-login loop against
 * a valid session. 403 says *authenticated, not yet permitted*, and the client
 * can route it at onboarding instead.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY HERE AND NOT AT 48 CALL SITES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every one of the 48 was read before choosing this. They are uniform: each is
 * `if (!userId)` on a **profile** id, and not one means "not an admin" or any
 * other refusal — so the upgrade is correct at all of them or at none.
 *
 * Editing 48 sites by hand has a real chance of missing some, and a missed site
 * is precisely the silent inconsistency being removed. This service already
 * prefers one enforcing place over remembering at N call sites — `toWireSource`'s
 * exhaustive switch and `explain.ts`'s `Record<Field, …>` are the same choice.
 * It is documented at the funnel every error already flows through, and
 * `envelope.test.ts` asserts both directions.
 */
function resolveAuthFailure(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode,
): { code: string; message: string; status: ContentfulStatusCode } {
  if (code !== 'AUTH_REQUIRED' || c.get('authId') === undefined) {
    return { code, message, status };
  }
  return {
    code: 'PROFILE_INCOMPLETE',
    /**
     * Names the state and the way out of it. Not "verification failed"-style
     * copy about our internals: the advocate did nothing wrong and there is
     * exactly one thing to do next.
     */
    message: 'Your account is signed in but onboarding is not finished yet.',
    status: 403,
  };
}
