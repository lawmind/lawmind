/**
 * LCC R33 — prove a fresh magic link completes the mobile auth flow, remotely.
 *
 * Runs ON the deployed host with the SERVICE's own environment, so the URL it
 * captures is the one this deployment would email — not one a test built. No
 * mail is sent: the mailer is replaced with a capture, so this consumes nobody
 * else's link and puts no credential in a real inbox.
 *
 * THE TOKEN NEVER LEAVES THIS PROCESS. Every line printed redacts it, because
 * this output is pasted into a round record and a round record is durable.
 * `REDACTED(n)` keeps the length so the shape is still checkable.
 *
 *   sudo bash -c 'set -a; . /etc/lawmind/api.env; set +a;
 *                 cd /opt/lawmind/current/services/api &&
 *                 exec npx tsx src/ops/magic-link-acceptance-cli.ts <email>'
 */
import { createAuth } from '@lawmind/auth';
import postgres from 'postgres';

import { sslFor } from '../db-ssl.ts';

const email = process.argv[2];
if (!email) throw new Error('usage: magic-link-acceptance-cli.ts <email>');

const origin = process.env['AUTH_BASE_URL'];
const secret = process.env['AUTH_SECRET'];
const databaseUrl = process.env['USER_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!origin || !secret || !databaseUrl) throw new Error('AUTH_BASE_URL, AUTH_SECRET and a user database URL are required');

const out: Record<string, unknown> = { origin, email };
const redact = (text: string, token: string) => text.split(token).join(`REDACTED(${token.length})`);

// The same TLS decision the service itself makes. A plain client is refused by
// pg_hba on the Gate-C host, which is the correct posture and not a fault.
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {}, ssl: sslFor(databaseUrl) });

let minted: string | null = null;
const auth = createAuth({
  sql,
  secret,
  baseUrl: origin,
  mailer: {
    name: 'capture (nothing was sent)',
    async send(message) {
      minted = message.url;
    },
  },
});

/**
 * A DRIVER ERROR PRINTS ITS PARAMETERS, AND ONE OF THEM IS THE TOKEN.
 *
 * The first run of this script failed on TLS and the Drizzle error carried the
 * verification identifier straight to a terminal. The row was never written so
 * nothing live escaped, but the shape of that accident is a credential in a log.
 * Only the message survives here; the cause, with its parameters, does not.
 */
try {
  await auth.api.signInMagicLink({
    body: { email },
    headers: new Headers({ origin, 'user-agent': 'lcc-r33-acceptance' }),
  });
} catch (error) {
  const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
  // eslint-disable-next-line preserve-caught-error -- the cause carries the token
  throw new Error(`signInMagicLink failed (cause withheld — it carries the token): ${reason}`);
}
if (minted === null) throw new Error('the mailer was never called');

const mintedUrl = new URL(minted);
const token = mintedUrl.searchParams.get('token') ?? '';
out['mintedOrigin'] = mintedUrl.origin;
out['mintedPath'] = mintedUrl.pathname;
out['mintedUrlRedacted'] = redact(minted, token);
out['isBetterAuthDefaultPath'] = mintedUrl.pathname === '/api/auth/magic-link/verify';

// 1 — the landing route, fetched over the public HTTPS origin.
const landing = await fetch(minted, { redirect: 'manual' });
out['landingStatus'] = landing.status;
const location = landing.headers.get('location') ?? '';
out['landingLocationRedacted'] = redact(location, token);
out['landingCacheControl'] = landing.headers.get('cache-control');
out['landingBodyLength'] = (await landing.text()).length;

// 2 — the exchange the app performs on that deep link.
const deepToken = new URL(location.replace('lawmind://', 'https://')).searchParams.get('token');
out['deepLinkCarriesTheSameToken'] = deepToken === token;

const post = (body: unknown) =>
  fetch(`${origin}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const verify = await post({ token: deepToken });
out['verifyStatus'] = verify.status;
const verified = (await verify.json()) as {
  ok?: boolean;
  data?: { accessToken?: string; user?: { email?: string; profileComplete?: boolean } };
};
out['verifyOk'] = verified.ok === true;
out['verifyUserEmail'] = verified.data?.user?.email ?? null;
out['verifyProfileComplete'] = verified.data?.user?.profileComplete ?? null;
const accessToken = verified.data?.accessToken ?? '';
out['accessTokenIssued'] = accessToken.length > 0;

// 3 — the session that link produced can call an authenticated route.
const me = await fetch(`${origin}/me`, { headers: { authorization: `Bearer ${accessToken}` } });
out['meStatus'] = me.status;
out['meEmail'] = ((await me.json()) as { data?: { user?: { email?: string } } }).data?.user?.email ?? null;

// 4 — one use, and only one.
const replay = await post({ token: deepToken });
out['replayStatus'] = replay.status;
out['replayCode'] = ((await replay.json()) as { error?: { code?: string } }).error?.code ?? null;

// 5 — an invalid token is refused the same way, over the wire.
const bogus = await post({ token: 'lcc-r33-never-minted-this-one' });
out['invalidStatus'] = bogus.status;
out['invalidCode'] = ((await bogus.json()) as { error?: { code?: string } }).error?.code ?? null;

console.log(JSON.stringify(out, null, 2));
await sql.end();
