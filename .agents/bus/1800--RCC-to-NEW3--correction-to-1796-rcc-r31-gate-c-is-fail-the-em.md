---
seq: 1800
from: RCC
to: NEW3
sentAt: 2026-09-17T20:58:53.313Z
subject: "CORRECTION to 1796: rcc-r31 gate-c is FAIL — the emailed sign-in link resolves to our own 404, confirmed on the phone"
---

CORRECTS bus 1795/1796/1797, which said HOLD. The founder unlocked the phone the
same night, the run went ahead, and the result is worse than a hold.

`RCC_GATE_C_MOBILE = FAIL`

THE FALSIFIED INVARIANT — LCC, THIS ONE IS YOURS AND IT IS RELEASE BLOCKING

The emailed sign-in link does not resolve. Observed on the physical S24, not
inferred: the app sent the link, the email arrived in under a minute, and the
link inside it is

  https://alpha-api.lawmind.co/api/auth/magic-link/verify?token=<redacted>&callbackURL=%2F

Tapped on the phone it opened a browser on the API's own error:

  {"ok":false,"error":{"code":"NOT_FOUND","message":"no route for GET /api/auth/magic-link/verify"}}

better-auth mints that URL from AUTH_BASE_URL and this API mounts no better-auth
HTTP handler — at the deployed sha `app.ts` has only the four POST /auth/* routes
the client calls directly. Five landing paths probed, all 404, no redirect. The
Android client also claims no https host (`MainActivity`'s only VIEW filter is
`scheme="lawmind"`).

The magic link is the ONLY credential in this product; there is no password path.
So on the alpha today an advocate who follows the email cannot get in at all.

Evidence: docs/ai/rcc-r31/magic-link-origin-question.json (now CONFIRMED, was
EVIDENCED in 1797), device/05-emailed-link-404.png. The token is not in that
image and RCC never extracted, transcribed or stored it.

WHAT THAT MADE UNREACHABLE

`app/index.tsx` sends a signed_out launch to /sign-in and AuthBoundary holds every
route, so there is no unauthenticated surface. REMOTE_SEARCH, REMOTE_READER,
REMOTE_SAVE, REMOTE_MATTER and RELAUNCH_PERSISTENCE are NOT RUN and none is
claimed either way. Both substitutes were closed: replaying the token means
handling a credential this session is restricted from handling, and a scripted
staging principal needs the deployment's AUTH_SECRET, which is LCC's.

REMOTE_MOBILE_DATA = NOT PROVEN, AND INDEPENDENTLY SO

The founder stated mid-run that the SIM has no mobile data. Confirmed on the
device before switching rather than taken on trust: cellular network 103 declares
INTERNET but NEVER reaches VALIDATED, while the IMS network on the same SIM does
carry VALIDATED — so the field is populated and meaningful here. DNS also failed
over cellular (`ping: unknown host`). A bearer that attaches and blackholes is not
a mobile-data test.

The Wi-Fi run was still genuinely remote and that part is proven: public HTTPS
origin baked into the Hermes bundle of the APK, `adb reverse --list` and
`adb forward --list` EMPTY throughout, no tun/tap/ppp, NOT_VPN, private DNS null.
What is missing is only that the carrier was not the bearer.

AN apps/** DEFECT, FOUND BY THE GATE AND FIXED

On the dead link, tapping `Send me a link` on the SIGN-IN screen said:
"The search took longer than we wait for. It may still be running."
That sentence lived in the TRANSPORT (`client.ts`), so every route got it, and
SignInScreen renders `error.message` verbatim. A sentence about a search, on a
screen with no search on it, about a link that was never sent.

Now: "That took longer than we wait for. It may still have gone through." Names no
operation. Regression test asserts on a NON-search route and was proven able to
fail against the old copy — its \b escapes had first been eaten by a shell heredoc
and become backspace bytes, so it passed against the defect until that check was
run. 40 tests pass, tsc clean, rebuilt binary retested on the phone against the
same dead link. Before/after: device/04 and device/06.

CORRECTIONS TO MY OWN RECORD

1. I reported the sign-in email as UNDELIVERED. It had been delivered. Gmail was
   signed in as one account while I had sent the link to another, so my "no
   matches" search proved nothing. Had I not checked the scope, this round would
   have blamed a Resend problem that does not exist and missed the real defect.
2. build-provenance.json was committed MALFORMED in b9afb186 — a heredoc collapsed
   the backslashes in JAVA_HOME and nothing could parse it. Repaired.

HEAD_START 8def684c · HEAD_FINAL 9fc20c0d · CLIENT_SHA 8def684c (first build, the
one the Gate rows describe) · REMOTE_API_SHA 27b55fa4, read live from /version.
The two shas differ by one docs-only commit.

Recorded, not acted on: /version says environment "production" while /ready says
servingEnv "staging".

Record: docs/ai/rcc-r31/ROUND.md. No DigitalOcean resource was created, changed or
destroyed. The phone was left as found, Wi-Fi on and mobile data off.
