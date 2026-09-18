/**
 * `pnpm --filter @lawmind/api ecourts:asset` — retain ONE static script of the
 * licensed interface, and write it where the offline recorder can execute it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE FIRST REQUEST OF THE ROUND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R12's request blueprint reconciled every field it could reach and had to mark
 * most rows `TRANSCRIBED` — read from the licensed client's source but not held
 * here. The functions that build a cause-list request live in
 * `/ecourtindia_v6/js/searchByCauselist.js`, which the retained module page only
 * references. Until those bytes exist in this repository, "execute the official
 * functions offline against a recording transport" names functions we do not
 * have, and every claim about our request shape rests on a transcription nobody
 * can re-derive.
 *
 * So this spends one slot of a thousand to convert transcription into evidence.
 * It is not a privileged path: `retainInterfaceAsset` goes through
 * `guardedRequest`, which reserves the quota under the global lock, writes the
 * ledger row before the socket opens, sends the attribution, and retains the
 * bytes before anything reads them. With the switch off it is refused, and the
 * refusal is ledgered exactly like any other attempt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WRITES A FIXTURE, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The database keeps the immutable artifact; `--fixture` also writes the bytes
 * into `__fixtures__/` so the offline recorder and its tests can run with no
 * database and no network at all. Both are the same bytes and the SHA-256 of
 * each is printed, so a future agent can prove the checked-in fixture is the
 * retained response rather than something somebody edited.
 *
 *   pnpm --filter @lawmind/api ecourts:asset                       # dry run
 *   pnpm --filter @lawmind/api ecourts:asset -- --apply --fixture
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import postgres from 'postgres';

import { AUTHORISATION } from './authorisation.ts';
import {
  ECOURTS_INTERFACE_ASSETS,
  retainInterfaceAsset,
  type InterfaceAssetName,
} from './ecourts.ts';
import { decide } from './guard.ts';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

/**
 * Walk UP for `.env`. This runs under `pnpm --filter`, which sets the cwd to
 * `services/api`, so a plain read finds nothing and the operator is refused for
 * a missing local file rather than for a real lock — which is how a person
 * learns to distrust refusal reasons.
 */
function envValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  let dir = process.cwd();
  for (let up = 0; up < 6; up += 1) {
    try {
      const line = readFileSync(join(dir, '.env'), 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim();
    } catch {
      // not here; keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const url = envValue('DATABASE_URL');
if (!url) {
  console.error('no database URL is set');
  process.exit(2);
}
if (!process.env['ECOURTS_GRANT_ATTRIBUTION']) {
  const attribution = envValue('ECOURTS_GRANT_ATTRIBUTION');
  if (attribution) process.env['ECOURTS_GRANT_ATTRIBUTION'] = attribution;
}

const apply = process.argv.includes('--apply');
const wantFixture = process.argv.includes('--fixture');
const asset = (arg('asset') ?? 'search_by_causelist') as InterfaceAssetName;
if (!(asset in ECOURTS_INTERFACE_ASSETS)) {
  console.error(
    `unknown asset ${asset}; known: ${Object.keys(ECOURTS_INTERFACE_ASSETS).join(', ')}`,
  );
  process.exit(2);
}

const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 1,
  onnotice: () => {},
});

try {
  const preflight = await decide(sql, `PROBE_interface_asset_${asset}`);
  console.log(`asset           ${asset}`);
  console.log(
    `endpoint        ${ECOURTS_INTERFACE_ASSETS[asset]}${arg('query') ? `?${arg('query')}` : ''}`,
  );
  console.log(`grant expires   ${AUTHORISATION?.expiresAt ?? '(no grant on file)'}`);
  console.log(
    `guard preflight ${preflight.allowed ? 'ALLOWED' : `REFUSED (${preflight.reason}: ${preflight.detail})`}`,
  );

  if (!apply) {
    console.log('\nDRY RUN — no request made. Re-run with --apply.');
    process.exit(0);
  }

  const query = arg('query');
  const result = await retainInterfaceAsset(sql, asset, query ? { query } : {});
  if (result.refused) {
    // The refusal is already on the ledger. Reporting it as a failure rather
    // than as "nothing to do" is the whole point of ledgering refusals.
    console.error(`\nREFUSED — ${result.reason}`);
    console.error(`ledger row ${result.fetchLedgerId}`);
    process.exit(1);
  }

  const sha = createHash('sha256').update(result.bytes).digest('hex');
  console.log(`\nhttp            ${result.status}`);
  console.log(`content-type    ${result.contentType ?? '(none)'}`);
  console.log(`bytes           ${result.bytes.byteLength}`);
  console.log(`sha256          ${sha}`);
  console.log(`artifact        ${result.artifactId ?? '(none)'}`);
  console.log(`ledger row      ${result.fetchLedgerId}`);

  if (wantFixture && result.ok) {
    const date = new Date().toISOString().slice(0, 10);
    const path = join(
      dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
      '__fixtures__',
      `ecourts-${asset.replace(/_/g, '-')}-${date}.js`,
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, result.bytes);
    const onDisk = createHash('sha256').update(readFileSync(path)).digest('hex');
    console.log(`fixture         ${path}`);
    console.log(`fixture sha256  ${onDisk}  ${onDisk === sha ? 'MATCH' : 'MISMATCH'}`);
    if (onDisk !== sha) process.exitCode = 1;
  }

  if (!result.ok) {
    console.error(`\nthe interface answered ${result.status}; the bytes are retained regardless`);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
