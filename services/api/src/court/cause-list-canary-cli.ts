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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import postgres from 'postgres';

import { AUTHORISATION, captchaBypassRefusal } from './authorisation.ts';
import { parseCauseList, PARSER_VERSION } from './cause-list-parser.ts';
import { sourceKeyId, type DistrictSourceKey } from './cause-list-source-key.ts';
import { writeCauseListObservations } from './ecourts-observation-writer.ts';
import {
  ECOURTS_BASE,
  establishmentSelectValue,
  fetchCaptchaImage,
  listCauseListCourts,
  listCourtComplexes,
  listCourtEstablishments,
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
const wantEstablishment = arg('establishment');
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
function solveCaptcha(bytes: Buffer): {
  code: string;
  engine: string;
  raw: string;
  length: number;
  wrongLength: boolean;
} {
  const dir = mkdtempSync(join(tmpdir(), 'lm-captcha-'));
  const file = join(dir, 'captcha.png');
  writeFileSync(file, bytes);
  const python = join(ROOT, '.venv-ocr', 'Scripts', 'python.exe');
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * A WRONG-LENGTH READ IS A RESULT, NOT A CRASH
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `lcc-captcha-solve.py` exits 1 when the code it read is not six characters —
   * deliberately, so the caller can refetch rather than post a code that cannot
   * be right. `execFileSync` turns a non-zero exit into a THROW, so this used to
   * abort the whole canary on the solver's most ordinary non-success, discarding
   * the session and every request already spent on it.
   *
   * The JSON is on stdout either way. It is read either way, and a wrong length
   * consumes one bounded retry exactly like a rejected code does.
   */
  let stdout: string;
  try {
    stdout = execFileSync(
      python,
      [join(ROOT, 'scripts', 'lcc-captcha-solve.py'), '--image', file],
      {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } catch (error) {
    stdout = String((error as { stdout?: string }).stdout ?? '');
  }
  const line = stdout.trim().split('\n').at(-1) ?? '{}';
  let parsed: { code?: string; engine?: string; raw?: string; length?: number } = {};
  try {
    parsed = JSON.parse(line) as typeof parsed;
  } catch {
    // The solver printed something that is not JSON. That is a solve failure,
    // reported as one, rather than an exception that loses the session.
  }
  const code = parsed.code ?? '';
  return {
    code,
    engine: parsed.engine ?? 'unknown',
    raw: parsed.raw ?? '',
    length: code.length,
    wrongLength: code.length !== 6,
  };
}

const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 1,
  onnotice: () => {},
});
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const SPACING = Math.max(AUTHORISATION?.minIntervalMs ?? 2000, 2000) + 400;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RECEIPT IS WRITTEN AFTER EVERY STEP, NOT AT THE END
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This run makes six to nine real requests against a bounded permission. If it
 * dies at the last one — a teardown, a killed terminal, a solver crash — the
 * quota is spent either way, and a receipt assembled at the end would leave no
 * record of what those requests bought. A previous round lost 160 of 283
 * measurements to exactly that.
 *
 * §11 also requires per-solve CAPTCHA metrics to be retained: raw OCR, the
 * normalized answer, its length, and whether the source accepted it. They go
 * here, beside the ledger rows and the retained images, so "how good is the
 * solver in production" is answerable by reading a file rather than by trusting
 * a number somebody remembered.
 */
const RECEIPT = join(ROOT, 'docs', 'ai', 'lcc-r12b', 'canary-receipt.json');
const receipt: Record<string, unknown> = {
  artifact: 'LCC_R12B_ECOURTS_CANARY',
  startedAt: new Date().toISOString(),
  apply,
  request: { stateCode, listDate, cicri, attempts },
  steps: [] as unknown[],
  captchaSolves: [] as unknown[],
  verdict: 'INCOMPLETE — the run did not reach its own conclusion',
};
function saveReceipt(): void {
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2), 'utf8');
}
function step(name: string, detail: Record<string, unknown>): void {
  (receipt['steps'] as unknown[]).push({ at: new Date().toISOString(), name, ...detail });
  saveReceipt();
}

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

  const { session, fetchLedgerId: sessionLedgerId } = await openCauseListSession(sql);
  console.log(`\nsession opened, app_token ${session.appToken.slice(0, 8)}…`);
  step('session_opened', { fetchLedgerId: sessionLedgerId, captchaUrl: session.captchaUrl });
  await sleep(SPACING);

  const districts = await listDistricts(sql, session, stateCode);
  const district = wantDistrict ? districts.find((d) => d.value === wantDistrict) : districts[0];
  if (!district) throw new Error(`no district (${districts.length} offered)`);
  console.log(`district        ${district.value}  ${district.label}`);
  step('districts', { offered: districts.length, chosen: district.value, label: district.label });
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
  step('complexes', {
    offered: complexes.length,
    chosenRaw: complex.value,
    parts,
    label: complex.label,
  });
  await sleep(SPACING);

  /**
   * The establishment step, which only exists when the complex says it does.
   *
   * `common_header.js` calls `fillEst` exactly when the complex value's third
   * `@` segment is `Y`, and leaves the select empty otherwise. Walking it
   * unconditionally would spend a request the licensed client never makes;
   * skipping it when the flag IS set would send an establishment nobody chose.
   */
  let chosenEstablishment: string | null = null;
  if (parts.requiresEstablishment) {
    await sleep(SPACING);
    const establishments = await listCourtEstablishments(sql, session, {
      stateCode,
      distCode: district.value,
      complexCode: parts.complexCode,
    });
    const picked = wantEstablishment
      ? establishments.find((e) => e.value === wantEstablishment)
      : establishments[0];
    if (!picked) throw new Error(`no establishment (${establishments.length} offered)`);
    chosenEstablishment = picked.value;
    console.log(`establishment   ${picked.value}  ${picked.label}`);
    step('establishments', {
      offered: establishments.length,
      chosen: picked.value,
      label: picked.label,
    });
    await sleep(SPACING);
  }

  /**
   * TWO different establishment values, and conflating them is the defect the
   * retained client exposed. `fillCauseList` sends the complex's second segment
   * when the flag is off; `submit_causelist` sends the SELECT, which is empty
   * then. See `establishmentSelectValue`.
   */
  const fillEstCode = parts.requiresEstablishment
    ? (chosenEstablishment ?? '')
    : parts.establishmentCode;
  const submitEstCode = establishmentSelectValue(parts, chosenEstablishment);

  const courts = await listCauseListCourts(sql, session, {
    stateCode,
    distCode: district.value,
    complexCode: parts.complexCode,
    establishmentCode: fillEstCode,
  });
  const court = wantCourt ? courts.find((c) => c.value === wantCourt) : courts[0];
  if (!court) throw new Error(`no court offered for this establishment`);
  console.log(`court           ${court.value}  ${court.label}`);
  console.log(
    `est (fill)      ${JSON.stringify(fillEstCode)}   est (submit) ${JSON.stringify(submitEstCode)}`,
  );
  step('courts', {
    offered: courts.length,
    chosen: court.value,
    label: court.label,
    // The distinction the retained client exposed. Recorded so the receipt
    // shows WHICH establishment value went to which endpoint.
    establishmentSentToFillCauseList: fillEstCode,
    establishmentSentToSubmit: submitEstCode,
  });

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
      `\nattempt ${attempt}: captcha ${captcha.bytes.byteLength}B -> ${solved.code} ` +
        `(${solved.engine}${solved.wrongLength ? `, WRONG LENGTH ${solved.length}` : ''})`,
    );
    /**
     * A wrong-length read is not posted.
     *
     * The solver reports it rather than padding, and posting a code that cannot
     * be right would spend a request on a guaranteed `status: 0`. It still costs
     * one bounded attempt — the CAPTCHA image was fetched, and that was a real
     * request — so this can never become an unbounded refetch loop.
     */
    if (solved.wrongLength) {
      (receipt['captchaSolves'] as unknown[]).push({
        attempt,
        imageBytes: captcha.bytes.byteLength,
        imageArtifactId: captcha.artifactId,
        engine: solved.engine,
        rawOcr: solved.raw,
        normalized: solved.code,
        length: solved.length,
        outcome: 'not_submitted_wrong_length',
      });
      saveReceipt();
      continue;
    }
    await sleep(SPACING);
    submitted = await submitCauseList(
      sql,
      session,
      {
        stateCode,
        distCode: district.value,
        complexCode: parts.complexCode,
        establishmentSelectValue: submitEstCode,
        courtNo: court.value,
        courtNameText: court.label,
        causelistDate: listDate,
        cicri,
      },
      solved.code,
    );
    console.log(
      `         submit -> ${submitted.status}  artifact ${submitted.artifactId ?? '(none)'}`,
    );
    /**
     * §11's per-solve record: raw OCR, the normalized answer, and whether the
     * SOURCE accepted it — which is the only ground truth available, since we
     * never see the intended characters.
     */
    (receipt['captchaSolves'] as unknown[]).push({
      attempt,
      imageBytes: captcha.bytes.byteLength,
      imageArtifactId: captcha.artifactId,
      engine: solved.engine,
      rawOcr: solved.raw,
      normalized: solved.code,
      length: solved.length,
      outcome: submitted.status === 'captcha_rejected' ? 'rejected' : 'accepted',
      submitStatus: submitted.status,
      submitArtifactId: submitted.artifactId,
      fetchLedgerId: submitted.fetchLedgerId,
    });
    saveReceipt();
    if (submitted.status !== 'captcha_rejected') break;
  }

  if (!submitted || submitted.status !== 'ok') {
    /**
     * NOT PASS is a real outcome and it is written down. `captcha_rejected`
     * after every bounded attempt is a solver result; `unexpected` is a
     * statement about the interface. Neither is evidence that the court
     * published nothing — that conflation is the failure this pipeline exists
     * to prevent, so the verdict never says "empty".
     */
    receipt['verdict'] = 'NOT_PASS';
    receipt['notPassReason'] = submitted?.status ?? 'no_attempt_reached_submit';
    if (submitted?.status === 'unexpected') receipt['unexpectedRaw'] = submitted.raw;
    receipt['listingsClaim'] = 'UNKNOWN — a failed submit says nothing about what the court listed';
    saveReceipt();
    console.error(`\nCANARY NOT PASS — last status ${submitted?.status ?? 'none'}`);
    console.error(`receipt ${RECEIPT}`);
    process.exit(1);
  }

  /**
   * The served bytes are dumped BEFORE the parser touches them.
   *
   * They are already immutable in `official_source_artifact`, but this is the
   * first cause list anybody here has seen, and §12 wants the parser developed
   * against it with the network frozen. A file on disk is what makes that
   * possible without another request.
   */
  const servedPath = join(ROOT, 'docs', 'ai', 'lcc-r12b', 'first-served-cause-list.html');
  mkdirSync(dirname(servedPath), { recursive: true });
  writeFileSync(servedPath, submitted.caseDataHtml, 'utf8');
  receipt['servedCauseList'] = {
    path: servedPath,
    bytes: Buffer.byteLength(submitted.caseDataHtml, 'utf8'),
    sha256: createHash('sha256').update(submitted.caseDataHtml).digest('hex'),
    artifactId: submitted.artifactId,
    fetchLedgerId: submitted.fetchLedgerId,
  };
  saveReceipt();

  const parsed = parseCauseList(Buffer.from(submitted.caseDataHtml, 'utf8'), 'text/html');
  console.log(`\nparse           ${parsed.status}`);
  if (parsed.status === 'failed') console.log(`                ${parsed.refusal}: ${parsed.error}`);
  if (parsed.status !== 'ok') {
    /**
     * The parser refusing is NOT the court listing nothing, and `status: 'empty'`
     * from a parser that has never seen a real result table is not evidence
     * either. Both are recorded as what they are.
     */
    receipt['verdict'] = 'NOT_PASS';
    receipt['notPassReason'] = `parser_${parsed.status}`;
    receipt['parse'] = parsed;
    receipt['listingsClaim'] =
      'UNKNOWN — the bytes are retained; the parser did not produce items, which is a statement about the parser';
    saveReceipt();
    console.error('\nCANARY NOT PASS — the listing was retained but produced no observations');
    console.error(`served bytes ${servedPath}`);
    console.error(`receipt      ${RECEIPT}`);
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

  /**
   * The idempotency half of §13, proven rather than asserted: the SAME parsed
   * batch, over the SAME retained artifact, written a second time. It must add
   * nothing. This costs no request — the bytes are already here.
   */
  const replayIds = await atomically(sql, (tx) =>
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
  const idempotent = replayIds.length === 0 || replayIds.every((id) => observationIds.includes(id));
  console.log(`replay          ${replayIds.length} ids, idempotent=${idempotent}`);

  receipt['parse'] = {
    status: parsed.status,
    items: parsed.items.length,
    sourceWarnings: parsed.sourceWarnings,
  };
  receipt['observations'] = {
    written: observationIds.length,
    ids: observationIds,
    replayIds,
    idempotent,
  };
  receipt['verdict'] = idempotent ? 'CANARY_PASS' : 'NOT_PASS';
  if (!idempotent) receipt['notPassReason'] = 'reprocessing the same artifact created new rows';
  saveReceipt();

  console.log(
    `\nCANARY ${idempotent ? 'PASS' : 'NOT PASS'} — requests successful >= 1, raw artifacts >= 1, ` +
      `parsed observations = ${observationIds.length}, idempotent replay = ${idempotent}`,
  );
  console.log(`receipt         ${RECEIPT}`);
  if (!idempotent) process.exitCode = 1;
} catch (error) {
  /**
   * A thrown step is a NOT PASS with a reason, not an absence of one.
   *
   * The first R12b run died at `listDistricts` and the receipt recorded only
   * `INCOMPLETE`, which is true and useless: the reason — the AJAX endpoint
   * answered `Invalid Request` — lived solely in a terminal that scrolled away.
   * The quota was spent either way, so the reason belongs in the artifact the
   * quota bought.
   */
  receipt['verdict'] = 'NOT_PASS';
  receipt['notPassReason'] = 'threw';
  receipt['error'] = error instanceof Error ? error.message : String(error);
  receipt['listingsClaim'] =
    'UNKNOWN — the run did not complete; nothing here is evidence about what any court listed';
  saveReceipt();
  console.error(`\nCANARY NOT PASS — ${receipt['error']}`);
  console.error(`receipt ${RECEIPT}`);
  process.exitCode = 1;
} finally {
  saveReceipt();
  await sql.end({ timeout: 5 });
}
