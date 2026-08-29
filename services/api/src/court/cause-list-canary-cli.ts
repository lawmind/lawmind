/**
 * `pnpm --filter @lawmind/api ecourts:canary` — one real cause list, end to end.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The chain the roadmap asks for, run once against the licensed interface:
 *
 *   quota reservation -> real request -> fetch ledger -> immutable raw artifact
 *     -> parser -> ecourts_observation
 *
 * It walks the dimensions the source itself requires — state, district, court
 * complex, establishment, court — rather than assuming a court is a request.
 * Each hop is its own ledgered, rate-limited request, because the grant's limits
 * are aggregate and a "chain" is not one request wearing five hats.
 *
 * **It is one list, on one date, for one court.** There is no `--all`, no loop
 * over establishments and no date range. The pilot's question is what a single
 * licensed request actually returns; a harvest cannot answer that more precisely
 * and would spend the grant to find out.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CAPTCHA IS SOLVED, AND THAT IS THE AUTHORISED ACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `CLAUDE.md` §6a: authorised bypass is permitted for the enumerated eCourts
 * scope under three mechanical conditions — the grant is live, the code is only
 * in `court/ecourts.ts`, and every request is ledgered and rate-limited. All
 * three hold here, and `captchaBypassRefusal()` is checked before anything is
 * sent. The solver is injected rather than imported so this module keeps no
 * opinion about which engine is best; that was decided by measurement
 * (`scripts/lcc-captcha-engine-bench.py`) and lives in the Python side.
 *
 * A rejected code is not an error. It returns `status: 0`, and the honest
 * response is a fresh CAPTCHA and one more attempt — bounded by `--attempts`,
 * because an unbounded retry loop against a court's systems is exactly what a
 * bounded permission forbids.
 *
 *   pnpm --filter @lawmind/api ecourts:canary                       # dry run
 *   pnpm --filter @lawmind/api ecourts:canary -- --apply --state 26
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import postgres from 'postgres';

import { AUTHORISATION, captchaBypassRefusal } from './authorisation.ts';
import { parseCauseList, PARSER_VERSION } from './cause-list-parser.ts';
import { sourceKeyId, type DistrictSourceKey } from './cause-list-source-key.ts';
import { writeCauseListObservations } from './ecourts-observation-writer.ts';
import {
  ECOURTS_BASE,
  fetchCaptchaImage,
  listCauseListCourts,
  listCourtComplexes,
  listDistricts,
  openCauseListSession,
  splitComplexValue,
  submitCauseList,
} from './ecourts.ts';
import { atomically, decide } from './guard.ts';

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

function repoRoot(): string {
  let dir = process.cwd();
  for (let up = 0; up < 6; up += 1) {
    try {
      readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8');
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
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

const ROOT = repoRoot();
const apply = process.argv.includes('--apply');
const stateCode = arg('state') ?? '26';
const wantDistrict = arg('district');
const wantComplex = arg('complex');
const wantCourt = arg('court');
const cicri = arg('cicri') ?? '0';
const attempts = Number(arg('attempts') ?? '3');
const listDate =
  arg('date') ??
  (() => {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
  })();

/** dd-mm-yyyy (what the form uses) -> yyyy-mm-dd (what the database uses). */
function isoOf(ddmmyyyy: string): string {
  const [d = '', m = '', y = ''] = ddmmyyyy.split('-');
  return `${y}-${m}-${d}`;
}

/**
 * The solver, injected. This module holds no opinion about which engine is
 * best — that was settled by measuring both on real retained images.
 */
function solveCaptcha(bytes: Buffer): { code: string; engine: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lm-captcha-'));
  const file = join(dir, 'captcha.png');
  writeFileSync(file, bytes);
  const python = join(ROOT, '.venv-ocr', 'Scripts', 'python.exe');
  const out = execFileSync(
    python,
    [join(ROOT, 'scripts', 'lcc-captcha-solve.py'), '--image', file],
    {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const line = out.trim().split('\n').at(-1) ?? '{}';
  const parsed = JSON.parse(line) as { code?: string; engine?: string };
  return { code: parsed.code ?? '', engine: parsed.engine ?? 'unknown' };
}

const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 1,
  onnotice: () => {},
});
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const SPACING = Math.max(AUTHORISATION?.minIntervalMs ?? 2000, 2000) + 400;

try {
  const refusal = captchaBypassRefusal();
  const preflight = await decide(sql, 'ZZ_PREFLIGHT_ONLY');
  console.log(`endpoint        ${ECOURTS_BASE}`);
  console.log(`state           ${stateCode}`);
  console.log(`date            ${listDate}  (cicri=${cicri})`);
  console.log(
    `captcha bypass  ${refusal === null ? 'PERMITTED by the grant' : `REFUSED (${refusal})`}`,
  );
  console.log(`guard preflight ${preflight.allowed ? 'ALLOWED' : `REFUSED (${preflight.reason})`}`);
  console.log(`attempts        ${attempts}`);

  if (!apply) {
    console.log('\nDRY RUN — no requests made. Re-run with --apply.');
    process.exit(0);
  }
  if (refusal !== null || !preflight.allowed) {
    console.error('\nrefusing to proceed');
    process.exit(1);
  }

  const { session } = await openCauseListSession(sql);
  console.log(`\nsession opened, app_token ${session.appToken.slice(0, 8)}…`);
  await sleep(SPACING);

  const districts = await listDistricts(sql, session, stateCode);
  const district = wantDistrict ? districts.find((d) => d.value === wantDistrict) : districts[0];
  if (!district) throw new Error(`no district (${districts.length} offered)`);
  console.log(`district        ${district.value}  ${district.label}`);
  await sleep(SPACING);

  const complexes = await listCourtComplexes(sql, session, stateCode, district.value);
  const complex = wantComplex
    ? complexes.find((c) => c.value.startsWith(wantComplex))
    : complexes[0];
  if (!complex) throw new Error(`no court complex (${complexes.length} offered)`);
  const parts = splitComplexValue(complex.value);
  console.log(
    `complex         ${parts.complexCode}  est=${parts.establishmentCode}  ` +
      `needsEst=${parts.requiresEstablishment}  ${complex.label}`,
  );
  await sleep(SPACING);

  const courts = await listCauseListCourts(sql, session, {
    stateCode,
    distCode: district.value,
    complexCode: parts.complexCode,
    establishmentCode: parts.establishmentCode,
  });
  const court = wantCourt ? courts.find((c) => c.value === wantCourt) : courts[0];
  if (!court) throw new Error(`no court offered for this establishment`);
  console.log(`court           ${court.value}  ${court.label}`);

  const sourceKey: DistrictSourceKey = {
    tier: 'district',
    stateCode,
    districtCode: district.value,
    courtComplexCode: parts.complexCode,
    establishmentCode: parts.establishmentCode,
    courtNumber: court.value,
    listDate: isoOf(listDate),
    listType: cicri === '1' ? 'criminal' : 'civil',
  };
  console.log(`source key      ${sourceKeyId(sourceKey)}`);

  let submitted: Awaited<ReturnType<typeof submitCauseList>> | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await sleep(SPACING);
    const captcha = await fetchCaptchaImage(sql, session);
    const solved = solveCaptcha(captcha.bytes);
    console.log(
      `\nattempt ${attempt}: captcha ${captcha.bytes.byteLength}B -> ${solved.code} (${solved.engine})`,
    );
    await sleep(SPACING);
    submitted = await submitCauseList(
      sql,
      session,
      {
        stateCode,
        distCode: district.value,
        complexCode: parts.complexCode,
        establishmentCode: parts.establishmentCode,
        courtNo: court.value,
        causelistDate: listDate,
        cicri,
      },
      solved.code,
    );
    console.log(
      `         submit -> ${submitted.status}  artifact ${submitted.artifactId ?? '(none)'}`,
    );
    if (submitted.status !== 'captcha_rejected') break;
  }

  if (!submitted || submitted.status !== 'ok') {
    console.error(`\nCANARY NOT PASS — last status ${submitted?.status ?? 'none'}`);
    process.exit(1);
  }

  const parsed = parseCauseList(Buffer.from(submitted.caseDataHtml, 'utf8'), 'text/html');
  console.log(`\nparse           ${parsed.status}`);
  if (parsed.status === 'failed') console.log(`                ${parsed.refusal}: ${parsed.error}`);
  if (parsed.status !== 'ok') {
    console.error('\nCANARY NOT PASS — the listing was retained but produced no observations');
    process.exit(1);
  }

  console.log(`items           ${parsed.items.length}`);
  const observationIds = await atomically(sql, (tx) =>
    writeCauseListObservations(tx, {
      court: `${stateCode}-${district.value}`,
      courtCode: court.value,
      listingDate: isoOf(listDate),
      observedAt: new Date(),
      endpoint: `${ECOURTS_BASE}/?p=cause_list/submitCauseList`,
      payloadSha256: createHash('sha256').update(submitted.caseDataHtml).digest('hex'),
      sourceArtifactId: submitted.artifactId!,
      fetchLedgerId: submitted.fetchLedgerId,
      strategy: 'CAUSE_LIST_BATCH',
      parserVersion: PARSER_VERSION,
      sourceWarnings: parsed.sourceWarnings,
      items: parsed.items,
    }),
  );

  console.log(`observations    ${observationIds.length} written`);
  console.log(
    `\nCANARY PASS — requests successful >= 1, raw artifacts >= 1, parsed observations = ${observationIds.length}`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
