/**
 * `pnpm --filter @lawmind/api ecourts:captcha-sample` — pull N real CAPTCHA
 * images through the guarded adapter and write them out for evaluation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY SAMPLES BEFORE A SOLVER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every published OCR benchmark measures documents — reading order, tables,
 * multi-column flow. None of them measures a deliberately distorted five-digit
 * string, which is the opposite problem: no layout, no context, and glyphs
 * drawn specifically to defeat exactly those engines. So "which OCR is best"
 * cannot be answered here by reading a leaderboard. It has to be measured on
 * the real images, against ground truth.
 *
 * That is what this produces. Each sample costs ONE session open plus ONE image
 * fetch — both ledgered, both rate-limited, both retained append-only — so the
 * evaluation set is itself inside the grant and auditable, and a solver's
 * claimed accuracy can be re-checked later against the exact bytes it was
 * measured on.
 *
 * `--count` is deliberately small by default and the spacing is the grant's,
 * not ours to choose. Thirty images is enough to separate a working solver from
 * a broken one and costs 60 of the day's 1,000 requests.
 *
 *   pnpm --filter @lawmind/api ecourts:captcha-sample -- --count 12 --out ../../.scratch/captcha
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import postgres from 'postgres';

import { AUTHORISATION } from './authorisation.ts';
import { fetchCaptchaImage, openCauseListSession } from './ecourts.ts';
import { decide } from './guard.ts';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

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
      // keep walking
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

const count = Number(arg('count') ?? '10');
const outDir = arg('out') ?? '.scratch/captcha';
const apply = process.argv.includes('--apply');

/**
 * The grant's own minimum, plus a margin. Not tuned for throughput: two
 * requests per sample at 2,000 ms apart is the floor the limiter would enforce
 * anyway, and pacing above it here means the limiter never has to refuse us.
 */
const SPACING_MS = Math.max(AUTHORISATION?.minIntervalMs ?? 2000, 2000) + 400;

const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 1,
  onnotice: () => {},
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

try {
  const decision = await decide(sql, 'ZZ_PREFLIGHT_ONLY');
  console.log(`guard preflight ${decision.allowed ? 'ALLOWED' : `REFUSED (${decision.reason})`}`);
  console.log(`samples         ${count}  (2 requests each = ${count * 2} of the day's budget)`);
  console.log(`spacing         ${SPACING_MS}ms`);
  console.log(`out             ${outDir}`);
  if (!apply) {
    console.log('\nDRY RUN — no requests made. Re-run with --apply.');
    process.exit(0);
  }
  if (!decision.allowed) process.exit(1);

  mkdirSync(outDir, { recursive: true });
  const manifest: {
    index: number;
    file: string;
    artifactId?: string | undefined;
    bytes: number;
    contentType: string | null;
  }[] = [];

  for (let i = 0; i < count; i += 1) {
    const { session } = await openCauseListSession(sql);
    await sleep(SPACING_MS);
    const captcha = await fetchCaptchaImage(sql, session);
    const file = join(outDir, `captcha-${String(i).padStart(3, '0')}.png`);
    writeFileSync(file, captcha.bytes);
    manifest.push({
      index: i,
      file,
      artifactId: captcha.artifactId,
      bytes: captcha.bytes.byteLength,
      contentType: captcha.contentType,
    });
    console.log(
      `[${i + 1}/${count}] ${file}  ${captcha.bytes.byteLength}B  ${captcha.contentType ?? '?'}`,
    );
    if (i < count - 1) await sleep(SPACING_MS);
  }

  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nwrote ${manifest.length} samples and a manifest`);
} finally {
  await sql.end({ timeout: 5 });
}
