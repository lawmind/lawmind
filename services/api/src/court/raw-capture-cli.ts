/**
 * `pnpm --filter @lawmind/api ecourts:capture` — make ONE authorised eCourts
 * request and retain what comes back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A CLI AND NOT A JOB
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first authorised response is worth more than any of the 999 after it: it
 * is the only thing that can tell us what the licensed interface actually
 * returns, and `parseCauseList` is a deliberate stub because nobody has seen
 * one. A loop would spend that request and then spend more of them while
 * somebody worked out what the first one meant. So this makes exactly one, is
 * dry by default, and has no `--count`.
 *
 * There is no privileged path here. It calls `fetchCauseList`, which reserves
 * quota under the global lock, writes the ledger before the socket opens, sends
 * the grant's attribution as the user-agent, and retains the bytes before
 * anything tries to read them. With the switch off it is refused and the
 * refusal is ledgered, exactly like any other attempt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFAULT IS A PROBE, AND THAT IS AN ADMISSION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A real cause-list request needs dimensions we do not have: the High Court
 * service wants a High Court and a bench, the district service wants a state,
 * district, court complex, establishment and court. Those come FROM the
 * interface, so the first request is about the interface — tier
 * `interface_probe`, which `mayProduceObservations` refuses to turn into
 * `ecourts_observation` rows. A form page is not a court's day, and the type
 * says so rather than a comment hoping somebody reads it.
 *
 *   pnpm --filter @lawmind/api ecourts:capture                        # dry run
 *   pnpm --filter @lawmind/api ecourts:capture --apply
 *   pnpm --filter @lawmind/api ecourts:capture --apply \
 *     --high-court 26 --bench dhcdb --list-date 2026-08-31
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import postgres from 'postgres';

import { AUTHORISATION, captchaBypassAllowed, grantAttribution } from './authorisation.ts';
import type { CauseListSourceKey } from './cause-list-source-key.ts';
import { sourceKeyId } from './cause-list-source-key.ts';
import { ECOURTS_CAUSE_LIST_ENDPOINT, fetchCauseList } from './ecourts.ts';
import { decide, killSwitchEnabled } from './guard.ts';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

function envValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  /**
   * Walk UP from the working directory.
   *
   * This runs under `pnpm --filter`, which sets the cwd to `services/api`, so a
   * plain `readFileSync('.env')` finds nothing. Being refused for a missing
   * local file rather than for a real lock would teach an operator to distrust
   * the refusal reasons, which is the one thing this surface cannot afford.
   */
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

const url =
  process.env['LOCAL_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? envValue('DATABASE_URL');
if (!url) {
  console.error('no database URL is set (LOCAL_DATABASE_URL / DATABASE_URL)');
  process.exit(2);
}
// Read from `.env` when the shell has not exported it. `guard.decide` refuses
// without it, and being refused for a missing local export rather than for a
// real lock would waste the operator's time and teach them to distrust the
// refusal reasons.
if (!process.env['ECOURTS_GRANT_ATTRIBUTION']) {
  const attribution = envValue('ECOURTS_GRANT_ATTRIBUTION');
  if (attribution) process.env['ECOURTS_GRANT_ATTRIBUTION'] = attribution;
}

const apply = process.argv.includes('--apply');
const listDate = arg('list-date') ?? new Date().toISOString().slice(0, 10);
const endpoint = arg('endpoint') ?? ECOURTS_CAUSE_LIST_ENDPOINT;
const highCourt = arg('high-court');
const bench = arg('bench');
const dumpTo = arg('dump');

const source: CauseListSourceKey =
  highCourt && bench
    ? {
        tier: 'high_court',
        highCourtCode: highCourt,
        benchCode: bench,
        listType: arg('list-type'),
        listDate,
      }
    : { tier: 'interface_probe', probe: arg('probe') ?? 'cause_list_module_index', listDate };

const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  max: 1,
  onnotice: () => {},
});

try {
  const switchOn = await killSwitchEnabled(sql);
  const decision = await decide(sql, 'ZZ_PREFLIGHT_ONLY');

  console.log(`endpoint        ${endpoint}`);
  console.log(`source key      ${sourceKeyId(source)}`);
  console.log(`tier            ${source.tier}`);
  console.log(`grant expires   ${AUTHORISATION?.expiresAt ?? '(no grant on file)'}`);
  console.log(`conditions      ${AUTHORISATION?.conditionsVersion ?? '(none)'}`);
  console.log(`attribution     ${grantAttribution() ? 'PRESENT (not printed)' : 'ABSENT'}`);
  console.log(
    `captcha bypass  ${captchaBypassAllowed() ? 'permitted by the grant' : 'not permitted'}`,
  );
  console.log(`kill switch     ${switchOn ? 'ON' : 'OFF'}`);
  console.log(
    `guard preflight ${decision.allowed ? 'ALLOWED' : `REFUSED (${decision.reason}) — ${decision.detail}`}`,
  );

  if (!apply) {
    console.log('\nDRY RUN — no request made, no quota spent. Re-run with --apply.');
    process.exit(0);
  }
  if (!decision.allowed) {
    console.error('\nrefusing to attempt: the guard would refuse, and a refusal row is enough');
    process.exit(1);
  }

  const started = Date.now();
  const result = await fetchCauseList(sql, source, { endpoint });
  console.log(`\nstatus          ${result.status}`);
  console.log(`ledger row      ${result.fetchLedgerId ?? '(none)'}`);
  console.log(`artifact        ${result.artifactId ?? '(none — no bytes to retain)'}`);
  if (result.status === 'failed') console.log(`error           ${result.error}`);
  console.log(`elapsed         ${Date.now() - started}ms`);

  if (result.artifactId) {
    const [row] = await sql<
      {
        payload_sha256: string;
        payload_bytes: number;
        content_type: string | null;
        observation_state: string;
        source_document_key: string | null;
      }[]
    >`
      SELECT payload_sha256, payload_bytes, content_type, observation_state, source_document_key
        FROM official_source_artifact WHERE id = ${result.artifactId}
    `;
    console.log(`sha256          ${row?.payload_sha256}`);
    console.log(`bytes           ${row?.payload_bytes}`);
    console.log(`content-type    ${row?.content_type ?? '(unstated)'}`);
    console.log(`state           ${row?.observation_state}`);
    console.log(`document key    ${row?.source_document_key}`);

    if (dumpTo) {
      /**
       * A local copy for writing the parser against, NOT the record. The record
       * is the append-only artifact row; this is a working file, and it is
       * written only when explicitly asked for so nobody mistakes one for the
       * other.
       */
      const [bytes] = await sql<{ raw_bytes: Buffer | null }[]>`
        SELECT raw_bytes FROM official_source_artifact WHERE id = ${result.artifactId}
      `;
      if (bytes?.raw_bytes) {
        mkdirSync(dirname(dumpTo), { recursive: true });
        writeFileSync(dumpTo, bytes.raw_bytes);
        console.log(`dumped          ${dumpTo} (working copy; the artifact row is the record)`);
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
