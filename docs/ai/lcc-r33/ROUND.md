# LCC R33 — the emailed sign-in link pointed at a route this API does not serve

**Verdict: PASS.** The defect RCC falsified on a physical phone is fixed, deployed
to the DigitalOcean alpha, and proved end to end against the public HTTPS origin —
including by reading a **real delivered email** and finding the mounted path in it.

| | |
| --- | --- |
| `HEAD_START` | `87551e1a4ed02fd7d06ffbd7bc36d217fb14e929` = `origin/main` |
| `HEAD_FINAL` | `a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a` = `origin/main` |
| `DEPLOYED_SHA` | `a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a`, read live from `GET /version` |
| working tree | dirty repo-wide (other lanes' artifacts); only the eight owned files were staged |
| leases | `GIT_COMMIT` was `RELEASED` by RCC at start; acquired by LCC for this round |
| round dir | `docs/ai/lcc-r33/` — next unused after `lcc-r32b-do`; nothing overwritten |

## The 404, reproduced before anything was changed

```
GET https://alpha-api.lawmind.co/api/auth/magic-link/verify?token=…&callbackURL=%2F
→ 404 {"ok":false,"error":{"code":"NOT_FOUND","message":"no route for GET /api/auth/magic-link/verify"}}
```

`MAGIC_LINK_ROUTE_REPRO_BEFORE = 404.` The deployed sha at that moment was
`27b55fa4`, matching RCC's record exactly.

**One thing RCC listed as `notObserved` is now observed.** `AUTH_BASE_URL` on the
host is `https://alpha-api.lawmind.co` — the documented https origin, exactly as
they inferred. The variable was correct; the link was still dead.

## ROOT CAUSE

`packages/auth/src/index.ts` handed the mailer better-auth's **default** minted
URL. In better-auth 1.6.26 (`plugins/magic-link/index.mjs`) that is

```js
const basePath = pathname ? "" : ctx.context.options.basePath || "";   // "/api/auth"
const url = new URL(`${pathname}${basePath}/magic-link/verify`, realBaseURL.origin);
```

so a bare `AUTH_BASE_URL` produces `/api/auth/magic-link/verify`. That path belongs
to better-auth's own HTTP handler, which this API has never mounted.

**And it must not mount it.** The same file shows why: `magicLinkVerify` calls
`consumeVerificationValue` and then `setSessionCookie`. A browser hitting it would
SPEND the one-time token and receive a cookie session in the mail app's browser —
which is not a session in the Expo client. Mounting better-auth's handler would
have removed the 404 and left sign-in exactly as impossible, while looking fixed.
That is the trap this round had to avoid, and it is the reason the obvious repair
is the wrong one.

The contract that works has existed since S5 and is the client's
(`apps/mobile/app/auth/verify.tsx`): the **raw token** reaches the app by deep
link, the app posts it to `POST /auth/verify`, and that calls
`auth.api.magicLinkVerify` server-side. Nothing ever reconciled the URL better-auth
minted with the route the app registers. Two correct halves, no join — invisible to
every unit test, and visible the first time a real advocate tapped a real link.

`MAGIC_LINK_ROOT_CAUSE = better-auth minted its DEFAULT /api/auth/magic-link/verify
from AUTH_BASE_URL; that handler is deliberately unmounted because it consumes the
token into a browser cookie session, and no route ever existed to hand the token to
the app's lawmind://auth/verify deep link.`

## THE FIX

The plugin hands `sendMagicLink` the raw `token` as well as its own `url`. So the
email URL is now ours, not better-auth's:

```
https://alpha-api.lawmind.co/auth/magic-link/open?token=…
   → 302  Location: lawmind://auth/verify?token=…
   → the app → POST /auth/verify → auth.api.magicLinkVerify
```

It is a **handoff, not a verifier**. It reads no database, consumes nothing, and
cannot tell a live token from a forged one. better-auth keeps the whole protocol:
expiry, single use and replay are decided exactly where they were.

It is **not an open redirect**. The destination is `MAGIC_LINK_APP_URL`, a
constant; better-auth's `callbackURL` and every other query parameter are ignored,
because a URL carrying a live credential to a destination the caller chooses is an
exfiltration endpoint with a friendly name.

It is **not a page**. No body, so the token lands in no document a browser can
cache or restore. `cache-control: no-store`, `referrer-policy: no-referrer`, and
the one access-log line in `app.ts` records `c.req.path`, which excludes the query
string — so the token is not logged.

A request with no token, or one over 512 characters, is `400 LINK_INVALID` rather
than a launch into an app that can do nothing with it.

`AUTH_BASE_URL` now documents the role it actually owns, in `env.ts` and in
`docs/ops/REMOTE_ALPHA_PACKAGE.md`: this API's own public origin, the host of the
one URL that matters.

## Files changed

| file | what |
| --- | --- |
| `packages/auth/src/index.ts` | `MAGIC_LINK_LANDING_PATH`, `MAGIC_LINK_APP_URL`, `magicLinkLandingUrl`, `magicLinkAppUrl`; `sendMagicLink` mints from `token` instead of forwarding better-auth's `url`; `baseUrl` documented |
| `services/api/src/auth/magic-link-landing.ts` | **new.** The 302 handler, and the three things it deliberately is not |
| `services/api/src/app.ts` | mounts `GET /auth/magic-link/open` beside the auth POSTs it feeds |
| `services/api/src/env.ts` | what `AUTH_BASE_URL` actually owns, corrected |
| `services/api/src/auth/magic-link-landing.test.ts` | **new.** 12 tests, the whole lifecycle on a real database |
| `services/api/src/ops/magic-link-acceptance-cli.ts` | **new.** The remote acceptance, run on the host with the service's own environment |
| `docs/API_CONTRACTS.md` | the route, recorded as additive |
| `docs/ops/REMOTE_ALPHA_PACKAGE.md` | the `AUTH_BASE_URL` row now says what a wrong value costs |

`apps/**` was not touched. **No client change is required** — the deep link the
redirect targets is the one the app already registers and already consumes.

**The path is written out as a literal in `app.ts` rather than imported from
`MAGIC_LINK_LANDING_PATH`.** `scripts/check-contract-status.mjs` reads that file as
text and a constant is invisible to it — an unmounted route is precisely what that
guard exists to catch, so making the guard blind to this one would have been a poor
trade. The join is enforced where it is real instead: the test requests the URL the
**mailer** was handed, so a divergence fails a test rather than an advocate.

## Tests

`services/api/src/auth/magic-link-landing.test.ts` — **12 passed.**

1. **points at a path this API actually serves** — asserts on the URL the MAILER
   was handed, not a path a test typed, and that it is *not* better-auth's default
2. hands the token to the deep link the app registers, with `no-store` and no body
3. redirects to the one destination whatever the query string asks for — a hostile
   `callbackURL`, `redirect` and `newUserCallbackURL` are all ignored
4. refuses a tokenless link with `400 LINK_INVALID` rather than launching the app
5. **completes the advocate loop** — request → emailed URL → landing → deep link →
   `POST /auth/verify` → `GET /me` answering 200 for the right address
6. leaves the token unspent across two landings, then better-auth spends it once;
   the replay is `401 LINK_INVALID`
7. refuses a token that was never issued
8. refuses an expired token (aged in place rather than waiting fifteen minutes)
9. does not consume the magic-link email rate limit — eight landings, all 302
10. mints beneath a base path rather than discarding it
11. leaves protected routes protected (`/me`, `/me/data-requests` → 401)
12. leaves `/health`, `/ready`, `/version` answering as they did

**The suite was checked for being able to fail.** Reverting `sendMagicLink` to the
old `({ email, url })` form — the exact R32B topology — fails **five** of the
twelve, the first with

```
AssertionError: the emailed path and the mounted path are one constant
```

Restored, twelve pass again. A test that cannot fail against the defect it names is
decoration, and this one was checked rather than assumed.

### The full API suite, once

`1293 tests · 1288 pass · 1 fail · 4 skipped · 405 s` —
[`api-suite.log`](api-suite.log).

The one failure is a **latency assertion**, `src/search/sparse-bound.test.ts`
"admits a globally common term inside a NARROW court+date population": *the fenced
sparse arm must be fast; arm took 5783 ms*.

**It was my own contention and I am saying so rather than calling it flaky.** I ran
the new landing suite against the same local Postgres while that run was in flight.
One clean re-run on an idle box — `pg_stat_activity` active 0 first — puts the same
arm at **582 ms** and the file at 5/5. That is a single re-run for a stated cause,
not a re-run until green, and nothing in this round touches a search path.

`npx tsc --noEmit` clean in `services/api` and `packages/auth`.
`npx eslint` clean on all six source files.
`node scripts/check-contract-status.mjs` → `108 endpoints · 95 built · 13 specced`.

## Deployment

| | |
| --- | --- |
| commits | `ba644d78` the fix · `a09d7ee5` the acceptance CLI's TLS and token hygiene |
| pushed to | `origin/main`, both, before either deploy |
| deployed by | `scripts/lcc-r32b-deploy.sh <sha> --restart-api`, which refuses a sha `origin/main` does not contain — no working tree was deployed |
| hosts | `178.128.209.91` (API) and `157.245.156.133`, both to `/opt/lawmind/a09d7ee5` |
| `REMOTE_VERSION` | `a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a` — `GET /version` returns the deployed sha exactly |

## REMOTE EVIDENCE — before and after

Full record, tokens redacted: [`remote-acceptance.json`](remote-acceptance.json).

### The redirect chain, tokens REDACTED

```
  the advocate taps, in a real delivered email:
    GET https://alpha-api.lawmind.co/auth/magic-link/open?token=REDACTED(32)
  ← HTTP/1.1 302 Found
    Location: lawmind://auth/verify?token=REDACTED(32)
    Cache-Control: no-store
    Referrer-Policy: no-referrer
    Via: 1.1 Caddy                        (a non-http scheme passes through unchanged)
    body: 0 bytes

  Android hands that to the app — MainActivity's VIEW filter is scheme="lawmind"
  app/auth/verify.tsx runs the exchange exactly once:
    POST https://alpha-api.lawmind.co/auth/verify  {"token":"REDACTED(32)"}
  ← 200  { accessToken, refreshToken, user: { email, profileComplete: false } }

    GET https://alpha-api.lawmind.co/me   Authorization: Bearer <access token>
  ← 200  { user: { email: gatec-r33-…@lawmind.test } }

  the same token, presented again:
    POST /auth/verify                      ← 401 LINK_INVALID
  a token nobody minted:
    POST /auth/verify                      ← 401 LINK_INVALID
```

### The email itself, which is the part that failed

Retrieved from Resend by id, filtered so the token never left the host as text:

```json
{ "to": ["delivered@resend.dev"], "from": "Lawmind <no-reply@lawmind.co>",
  "subject": "Your Lawmind sign-in link", "last_event": "delivered",
  "urlsInEmail": ["https://alpha-api.lawmind.co/auth/magic-link/open?token=REDACTED(32)"] }
```

**One URL in the message, and it is the mounted one.** That is the genuine article
rather than a URL a test built, and `last_event: delivered` is the delivery proof —
`POST /auth/magic-link` answering `{sent:true}` only proves Resend accepted.

A fresh identity was used throughout, `gatec-r33-…@lawmind.test`. **RCC's link was
not touched**, and no future RCC link was consumed.

### Bounded post-deploy regression

`/version` 200 · `/health` 200, database reachable, 2 ms · `/ready` 200,
`splitMode split`, `rolesDistinct true`, `servingEnv staging` ·
`POST /search {"query":"2022 INSC 690"}` 200 in 0.33 s returning *SATENDER KUMAR
ANTIL v. CBI*, `verified` / `corpus` / `overruledStatus none` / `canAddToMatter
true` · `GET /judgments/:id` 200 in 1.25 s, 76 paragraphs.

Semantic, unchanged by this round: `broad EXPERIMENTAL_INTERNAL`,
`supporting_authority`, `adverse_authority`, `counterarguments` and `abstention`
all `DISABLED`, `long_input LIMITED`. **Nothing public is ENABLED.**

The 10-hour Gate-C restore and Gate-S1 were **not** re-run. This change adds one
route and alters no query, threshold, timeout or storage path.

## Gate rows

```
MAGIC_LINK_ROUTE_REPRO_BEFORE = 404
MAGIC_LINK_ROOT_CAUSE         = better-auth minted its DEFAULT /api/auth/magic-link/verify
                                from AUTH_BASE_URL; that handler is deliberately unmounted
                                because it consumes the token into a browser cookie session,
                                and no route existed to hand the token to lawmind://auth/verify
MAGIC_LINK_ROUTE_AFTER        = PASS
MAGIC_LINK_VERIFY             = PASS
MAGIC_LINK_CALLBACK           = PASS
AUTHENTICATED_SESSION         = PASS
AUTH_REPLAY_POLICY            = PASS
REMOTE_DEPLOY                 = PASS
REMOTE_VERSION                = a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a
HEALTH                        = PASS
READY                         = PASS
SEMANTIC_PUBLIC               = DISABLED
```

## CORRECTIONS

1. **I read the line endings of three files wrongly at the start.** `grep -c $'\r'`
   returned a count equal to the line count on files that contain no `CR` at all,
   and I nearly spliced CRLF into an LF repository on the strength of it. `od -c`
   settled it. The probe that answers "every line" for every file is not a probe.
2. **The first remote acceptance run printed a verification identifier.** A Drizzle
   error carries its parameters, and one of them is the token. The insert had
   failed on TLS so nothing live escaped, but the shape of that accident is a
   credential in a terminal and from there in a durable record. The CLI now
   withholds the cause and keeps only its first line — `a09d7ee5`.
3. **I caused the one full-suite failure.** See the tests section: I ran a second
   suite against the same database. Reported as mine, not as flake.

## Recorded, not acted on

- **`/version environment: "production"` beside `/ready servingEnv: "staging"`** —
  RCC flagged this and it is not a defect. `NODE_ENV=production` and
  `LAWMIND_SERVING_ENV=staging` are both set on the host deliberately: the first
  selects production behaviour (no console mailer, no guessed auth origin), the
  second declares what this deployment IS. Two questions, two answers.
- **`/etc/lawmind/api.env` cannot be `source`d by a POSIX shell.** `MAIL_FROM=Lawmind
  <no-reply@lawmind.co>` is unquoted, so `. api.env` reports a syntax error and drops
  that line. systemd's `EnvironmentFile` parses it correctly and the service is
  unaffected — but any future shell-based ops script reading that file silently loses
  `MAIL_FROM`. Not changed in this round; the deployment self-destructs in under a day
  and touching a live service's env for a cosmetic issue is the wrong trade.

## NOT_DONE

- **`REMOTE_MOBILE_DATA` is still not proven.** It was never LCC's — the founder's
  SIM has no working data service (RCC confirmed it on the device). Unchanged here.
- **The phone was not touched.** This round proves the server half over the public
  internet and by reading a real delivered email. The tap-to-app step on Android is
  RCC's to observe, and the handoff below asks for exactly that.
- The full Gate-C restore and Gate-S1 were not re-run — see above for why.

## BLOCKERS

None. Nothing in this round needed a credential, an account, money, or a founder
decision.

## RCC handoff

**The alpha is yours again, at `a09d7ee5`, and the sign-in link resolves.**

- The emailed URL is now `https://alpha-api.lawmind.co/auth/magic-link/open?token=…`
  and it answers **302 → `lawmind://auth/verify?token=…`**, which is the deep link
  `apps/mobile/app/auth/verify.tsx` already consumes. **No client change is required**
  and none was made — `apps/**` was not touched.
- `MainActivity`'s `scheme="lawmind"` VIEW filter is exactly what this needs. The
  one thing only a phone can answer: **does the Custom Tab hand the 302 to the app?**
  A server-side redirect to a custom scheme is the standard pattern and Caddy passes
  the `Location` through unchanged, but a browser refusing it would be invisible from
  here.
- Please run Gate C's auth row with a **fresh** link on a **fresh** address. Do not
  reuse the 17 Sep one; it is spent, and its account was not recreated.
- The identities this round created were deleted from the alpha USER database, so
  you start from a clean `auth_user`.
- The transport timeout copy you fixed is untouched by anything here.

## FIFTH handoff

Three claims worth attacking, in the order I would attack them:

1. **That the landing route cannot become a verifier.** It reads no database today.
   The failure mode is somebody "improving" it by validating the token there — which
   would spend it, and the app would then get a dead token with a perfect 302 in
   front of it. There is no test asserting the route touches no database; the
   protection is currently a comment and a shape.
2. **That the redirect is closed.** `magic-link-landing.test.ts` proves
   `callbackURL`, `redirect` and `newUserCallbackURL` are ignored. It does not prove
   a *header* cannot influence the destination, and it does not fuzz the token for
   characters that survive `encodeURIComponent` into something an Android intent
   parses oddly.
3. **That nothing else opened up.** I assert `/me` and `/me/data-requests` still 401
   and that `/health`, `/ready`, `/version` are unchanged. A wider sweep of the
   authenticated surface against `a09d7ee5` would be worth more than my two routes.

Also worth your time, though not mine to fix: the full suite's one failure was
contention I created. If you re-run it, run it alone.

---

`LCC_GATE_C_AUTH = PASS`
