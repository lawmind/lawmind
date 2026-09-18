/**
 * WHERE THE EMAILED SIGN-IN LINK LANDS — `GET /auth/magic-link/open`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROUTE IS, AND THE THREE THINGS IT DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is a HANDOFF, nothing else: an `https` URL a mail client will linkify,
 * whose only job is to put the token into `lawmind://auth/verify?token=…` so the
 * app can run the exchange it has implemented since S5.
 *
 * It is **not a verifier.** It never reads the database, never consumes the
 * token, and cannot tell a live token from a forged one. better-auth owns that
 * protocol and keeps owning it: `POST /auth/verify` calls
 * `auth.api.magicLinkVerify`, which is where expiry, single use and replay are
 * decided. A second implementation of those rules here would be a second place
 * for them to be wrong.
 *
 * It is **not an open redirect.** The destination is `MAGIC_LINK_APP_URL`, a
 * constant in `@lawmind/auth`. better-auth's minted `callbackURL` is not read and
 * not honoured — a route that redirects a live bearer credential wherever a query
 * parameter points is a credential-exfiltration endpoint with a friendly name.
 *
 * It is **not a page.** No HTML, no body, so the token never lands in a document
 * a browser can cache, restore on back, or hand to a page script.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TOKEN IS A BEARER CREDENTIAL AND IS TREATED AS ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is never logged. The one access-log line in `app.ts` records `c.req.path`,
 * which excludes the query string, and nothing here adds a line of its own — so
 * a credential that arrives in a URL does not end up in a log aggregator, where
 * it would outlive its fifteen minutes by years.
 *
 * `cache-control: no-store` keeps the redirect out of any intermediary, and
 * `referrer-policy: no-referrer` stops the token travelling in a `Referer`
 * header if the app is absent and the browser ends up somewhere else.
 */
import { magicLinkAppUrl } from '@lawmind/auth';
import type { Context } from 'hono';

import { fail } from '../envelope.ts';

/**
 * The same bound `POST /auth/verify` applies (`verifyRequest`). better-auth 1.6
 * mints 32 alphanumeric characters; the bound exists so a megabyte of query
 * string cannot be reflected into a `Location` header.
 */
const MAX_TOKEN_LENGTH = 512;

export function handleMagicLinkLanding(c: Context): Response {
  const token = c.req.query('token');

  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    /**
     * A link that carries no token cannot be made to work by sending the
     * advocate into the app — the app would show "that link is missing its
     * token" after a launch that taught them nothing. The honest answer is here,
     * and it is the SAME message a spent link gets from `POST /auth/verify`,
     * because the advocate's next action is identical: ask for a new link.
     */
    return fail(c, 'LINK_INVALID', 'this sign-in link is no longer valid', 400);
  }

  return c.body(null, 302, {
    location: magicLinkAppUrl(token),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
}
