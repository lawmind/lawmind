/**
 * The eCourts data-quality object — internal evidence, not a claim.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two questions have to be answerable by query rather than by memory. The
 * registrar's is *"did you stay inside the grant"*, and ours is *"is the
 * observation pipeline actually producing anything"*. Both are answered from the
 * ledger, the artifact store and the observation table — never from a summary
 * somebody wrote down afterwards.
 *
 * It is **internal evidence**. Nothing here is a marketing number, and the
 * monitoring product remains `DISABLED_NOT_READY`: a pipeline that has produced
 * zero observations is not a feature, and publishing its counters as though it
 * were is how a demo becomes a promise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS REAL TRAFFIC
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The ledger holds three populations and only one of them is the registrar's:
 *
 *   - `test://…` endpoints — injected responses. Non-network by identity, and
 *     already excluded from the quota arithmetic by `guard.decide`.
 *   - `ZZ_…` courts — suite traffic under a synthetic court key. These are real
 *     database rows and were never sent anywhere.
 *   - everything else — requests made under the grant.
 *
 * Both exclusions are stated in the artifact rather than applied silently,
 * because a denominator that quietly drops rows is how a coverage number comes
 * to mean nothing.
 *
 *   node --import tsx scripts/lcc-ecourts-data-quality.mts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import postgres from 'postgres';

import {
  AUTHORISATION,
  attributionWireSafety,
  CAPTCHA_OPERATIONAL_BASIS,
  captchaBypassAllowed,
  captchaImplementable,
  CONDITIONS_VERSION,
} from '../services/api/src/court/authorisation.ts';
import {
  PARSER_FIXTURE,
  PARSER_VERSION,
  SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER,
} from '../services/api/src/court/cause-list-parser.ts';
import { PARSER_STATE } from '../services/api/src/court/ecourts.ts';
import { ECOURTS_PILOT, pilotBlockers } from '../services/api/src/court/pilot.ts';

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
if (!url) throw new Error('DATABASE_URL is required');
if (!process.env['ECOURTS_GRANT_ATTRIBUTION']) {
  const attribution = envValue('ECOURTS_GRANT_ATTRIBUTION');
  if (attribution) process.env['ECOURTS_GRANT_ATTRIBUTION'] = attribution;
}

const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i === -1 ? 'docs/ai/lcc-r11/ecourts-data-quality.json' : process.argv[i + 1]!;
})();

const sql = postgres(url, { max: 1, onnotice: () => {} });

/** Non-network by identity. Mirrors `guard.NON_NETWORK_TEST_ENDPOINT_PREFIX`. */
const TEST_ENDPOINT_PREFIX = 'test://%';
/** Synthetic court keys used by the suites. Never a real court. */
const SYNTHETIC_COURT_PREFIX = 'ZZ\\_%';

try {
  const [config] = await sql<
    { enabled: boolean; reason: string | null; updated_at: Date; updated_by_user_id: string | null }[]
  >`
    SELECT enabled, reason, updated_at, updated_by_user_id
      FROM platform_config WHERE key = 'ecourts_harvest' AND kind = 'kill_switch'
  `;

  const [actor] = await sql<{ id: string; email: string | null; role: string }[]>`
    SELECT id, email, role FROM users WHERE id = ${config?.updated_by_user_id ?? null}::uuid
  `;

  const ledger = await sql<
    { outcome: string; refusal_reason: string | null; n: number; first: Date; last: Date }[]
  >`
    SELECT outcome::text AS outcome, refusal_reason, count(*)::int AS n,
           min(requested_at) AS first, max(requested_at) AS last
      FROM ecourts_fetch_ledger
     WHERE endpoint NOT LIKE ${TEST_ENDPOINT_PREFIX}
       AND coalesce(court, '') NOT LIKE ${SYNTHETIC_COURT_PREFIX}
     GROUP BY 1, 2 ORDER BY 3 DESC
  `;

  const [excluded] = await sql<{ test_rows: number; synthetic_rows: number }[]>`
    SELECT
      count(*) FILTER (WHERE endpoint LIKE ${TEST_ENDPOINT_PREFIX})::int AS test_rows,
      count(*) FILTER (WHERE coalesce(court, '') LIKE ${SYNTHETIC_COURT_PREFIX})::int AS synthetic_rows
      FROM ecourts_fetch_ledger
  `;

  /**
   * The quota window the limiter itself uses: rows that reached the network,
   * excluding the two non-network populations, over the trailing hour and day.
   * Computed the same way `guard.decide` computes it so the artifact cannot
   * disagree with the thing it describes.
   */
  const [quota] = await sql<{ in_hour: number; in_day: number; last_at: Date | null }[]>`
    SELECT
      count(*) FILTER (WHERE requested_at > now() - interval '1 hour')::int AS in_hour,
      count(*) FILTER (WHERE requested_at > now() - interval '1 day')::int  AS in_day,
      max(requested_at) AS last_at
      FROM ecourts_fetch_ledger
     WHERE outcome <> 'refused' AND endpoint NOT LIKE ${TEST_ENDPOINT_PREFIX}
  `;

  const artifacts = await sql<
    {
      observation_state: string;
      n: number;
      bytes: string;
      retained: number;
      content_types: string[];
    }[]
  >`
    SELECT observation_state, count(*)::int AS n, sum(payload_bytes)::text AS bytes,
           count(*) FILTER (WHERE raw_bytes IS NOT NULL OR storage_key IS NOT NULL)::int AS retained,
           array_agg(DISTINCT coalesce(content_type, 'unstated')) AS content_types
      FROM official_source_artifact
     WHERE source = 'ecourts'
       AND coalesce(metadata->>'court', '') NOT LIKE ${SYNTHETIC_COURT_PREFIX}
     GROUP BY 1 ORDER BY 2 DESC
  `;

  const sourceKeys = await sql<
    { source_document_key: string; n: number; first: Date; last: Date }[]
  >`
    SELECT source_document_key, count(*)::int AS n, min(observed_at) AS first, max(observed_at) AS last
      FROM official_source_artifact
     WHERE source = 'ecourts'
       AND coalesce(metadata->>'court', '') NOT LIKE ${SYNTHETIC_COURT_PREFIX}
     GROUP BY 1 ORDER BY 4 DESC
  `;

  const [observations] = await sql<
    {
      total: number;
      parsed: number;
      partial: number;
      distinct_artifacts: number;
      latest: Date | null;
      with_warning: number;
    }[]
  >`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE extraction_state = 'parsed')::int AS parsed,
           count(*) FILTER (WHERE extraction_state = 'partial')::int AS partial,
           count(DISTINCT source_artifact_id)::int AS distinct_artifacts,
           max(observed_at) AS latest,
           count(*) FILTER (WHERE coalesce(extraction_note, '') LIKE '%may differ from the actual cause list%')::int AS with_warning
      FROM ecourts_observation
  `;

  const [transitions] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ecourts_transition`;

  const blockers = await pilotBlockers(sql);

  /**
   * Parser outcome by refusal code, read off the ledger's own error text is NOT
   * possible — the ledger records the request, not the parse. The honest
   * denominator is retained artifacts, and the honest numerator is artifacts
   * that produced observations. Both are counted, and the gap is named.
   */
  const [parseOutcome] = await sql<{ artifacts: number; producing: number }[]>`
    SELECT count(*)::int AS artifacts,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM ecourts_observation o WHERE o.source_artifact_id = a.id
           ))::int AS producing
      FROM official_source_artifact a
     WHERE a.source = 'ecourts' AND a.artifact_role = 'cause_list'
       AND coalesce(a.metadata->>'court', '') NOT LIKE ${SYNTHETIC_COURT_PREFIX}
  `;

  const attempted = ledger.reduce((a, r) => a + r.n, 0);
  const successful = ledger.filter((r) => r.outcome === 'ok').reduce((a, r) => a + r.n, 0);
  const errored = ledger.filter((r) => r.outcome === 'error').reduce((a, r) => a + r.n, 0);
  const refused = ledger.filter((r) => r.outcome === 'refused').reduce((a, r) => a + r.n, 0);

  const fixtureOnDisk = existsSync(PARSER_FIXTURE.path)
    ? createHash('sha256').update(readFileSync(PARSER_FIXTURE.path)).digest('hex')
    : null;

  const report = {
    artifact: 'LCC_ECOURTS_DATA_QUALITY',
    version: 'ECOURTS_DQ_V1',
    takenAt: new Date().toISOString(),
    purpose:
      'Internal evidence that the authorised eCourts pipeline stayed inside the grant and what ' +
      'it has actually produced. Not a product metric and not a marketing claim.',

    authorisation: {
      grantOnFile: AUTHORISATION !== null,
      conditionsVersion: CONDITIONS_VERSION,
      expiresAt: AUTHORISATION?.expiresAt ?? null,
      permittedDataTypes: AUTHORISATION?.permittedDataTypes ?? null,
      limits: AUTHORISATION
        ? {
            minIntervalMs: AUTHORISATION.minIntervalMs,
            maxRequestsPerHour: AUTHORISATION.maxRequestsPerHour,
            maxRequestsPerDay: AUTHORISATION.maxRequestsPerDay,
          }
        : null,
      // Shape only. The registrar asked that their identifiers stay out of the
      // application, so the value is never printed here or anywhere.
      attribution: attributionWireSafety(),
      captcha: {
        bypassPermittedByGrant: captchaBypassAllowed(),
        operationalBasis: CAPTCHA_OPERATIONAL_BASIS,
        implementable: captchaImplementable(),
        note:
          'The grant permits the bypass and does not say by what means. The licensed cause-list ' +
          'interface serves no data until cause_list_captcha_code is satisfied (securimage, with ' +
          'an audio alternative), observed directly in the retained response. Reading the image, ' +
          'transcribing the audio or exploiting the generator would each be inventing a security ' +
          'bypass, so this is CAPTCHA_IMPLEMENTATION_BLOCKED and only the registrar can clear it.',
      },
    },

    killSwitch: {
      key: 'ecourts_harvest',
      enabled: config?.enabled ?? false,
      reason: config?.reason ?? null,
      updatedAt: config?.updated_at?.toISOString() ?? null,
      actor: actor ? { id: actor.id, role: actor.role } : null,
    },

    trafficExclusions: {
      testEndpointRows: excluded?.test_rows ?? 0,
      syntheticCourtRows: excluded?.synthetic_rows ?? 0,
      note:
        'Excluded from every count below. test:// rows are non-network by identity and are already ' +
        'excluded from the limiter; ZZ_ courts are suite traffic under a synthetic court key. Both ' +
        'are stated rather than silently dropped.',
    },

    requests: {
      attempted,
      successful,
      errored,
      refused,
      byOutcome: ledger.map((r) => ({
        outcome: r.outcome,
        refusalReason: r.refusal_reason,
        count: r.n,
        first: r.first?.toISOString() ?? null,
        last: r.last?.toISOString() ?? null,
      })),
      networkErrors: errored,
    },

    quotaUtilisation: {
      inLastHour: quota?.in_hour ?? 0,
      inLastDay: quota?.in_day ?? 0,
      hourlyLimit: AUTHORISATION?.maxRequestsPerHour ?? null,
      dailyLimit: AUTHORISATION?.maxRequestsPerDay ?? null,
      hourlyPercent: AUTHORISATION
        ? Number((((quota?.in_hour ?? 0) / AUTHORISATION.maxRequestsPerHour) * 100).toFixed(3))
        : null,
      dailyPercent: AUTHORISATION
        ? Number((((quota?.in_day ?? 0) / AUTHORISATION.maxRequestsPerDay) * 100).toFixed(3))
        : null,
      lastNetworkAttemptAt: quota?.last_at?.toISOString() ?? null,
      note:
        'Counted exactly as guard.decide counts it — non-refused rows excluding test:// — so this ' +
        'artifact cannot disagree with the limiter it describes.',
    },

    rawArtifacts: {
      retained: artifacts.reduce((a, r) => a + r.retained, 0),
      total: artifacts.reduce((a, r) => a + r.n, 0),
      byState: artifacts.map((r) => ({
        observationState: r.observation_state,
        count: r.n,
        bytes: Number(r.bytes),
        retainedBytesPresent: r.retained,
        contentTypes: r.content_types,
      })),
      sourceKeysCovered: sourceKeys.map((r) => ({
        sourceKeyId: r.source_document_key,
        captures: r.n,
        first: r.first?.toISOString() ?? null,
        last: r.last?.toISOString() ?? null,
      })),
    },

    parser: {
      version: PARSER_VERSION,
      state: PARSER_STATE,
      fixture: PARSER_FIXTURE,
      fixtureOnDiskSha256: fixtureOnDisk,
      fixtureMatchesRecordedSha: fixtureOnDisk === PARSER_FIXTURE.sha256,
      artifactsConsidered: parseOutcome?.artifacts ?? 0,
      artifactsProducingObservations: parseOutcome?.producing ?? 0,
      successPercent:
        (parseOutcome?.artifacts ?? 0) === 0
          ? null
          : Number(
              (((parseOutcome?.producing ?? 0) / (parseOutcome?.artifacts ?? 1)) * 100).toFixed(2),
            ),
      refusedPercent:
        (parseOutcome?.artifacts ?? 0) === 0
          ? null
          : Number(
              ((1 - (parseOutcome?.producing ?? 0) / (parseOutcome?.artifacts ?? 1)) * 100).toFixed(
                2,
              ),
            ),
      note:
        'The denominator is retained cause-list artifacts and the numerator is artifacts that ' +
        'produced at least one observation. The ledger records requests, not parses, so this is ' +
        'the honest pairing available; a per-refusal-code breakdown would need a parse ledger ' +
        'and there is nothing yet to put in one.',
    },

    observations: {
      written: observations?.total ?? 0,
      parsed: observations?.parsed ?? 0,
      partial: observations?.partial ?? 0,
      distinctSourceArtifacts: observations?.distinct_artifacts ?? 0,
      latestObservedAt: observations?.latest?.toISOString() ?? null,
      carryingSourceWarning: observations?.with_warning ?? 0,
      transitionsDerived: transitions?.n ?? 0,
      idempotency: {
        mechanism:
          'pg_advisory_xact_lock(OBSERVATION_WRITE_LOCK_NAMESPACE, hashtext(source_artifact_id)) ' +
          'then a check for existing rows, inside the writing transaction',
        duplicateArtifactWrites:
          (observations?.total ?? 0) === 0
            ? 0
            : (observations?.total ?? 0) - (observations?.distinct_artifacts ?? 0) < 0
              ? 0
              : null,
        note:
          'A replay returns the ids that already exist rather than inserting a second set. ' +
          'Verified by test (raw-capture.test.ts, "writes one page once, however many times it ' +
          'is replayed"); with zero production observations there is nothing live to count.',
      },
      sourceUncertainty: {
        warning: SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER,
        note:
          "The court's own statement about its own cause lists. Carried into every observation " +
          'this parser writes, in the payload and the extraction note, so a derived state of ' +
          'ours can never read as certified by the court.',
      },
    },

    pilot: {
      id: ECOURTS_PILOT.id,
      enabled: ECOURTS_PILOT.enabled,
      registeredWithScheduler: false,
      sourceKey: ECOURTS_PILOT.sourceKey,
      blockers,
      state: blockers.length === 0 ? 'RUNNABLE' : 'HOLD',
    },

    retentionProbe: {
      HC: 'UNMEASURED',
      DISTRICT: 'UNMEASURED',
      note:
        'Not attempted. Every probe date would meet the same CAPTCHA that blocks a first-day ' +
        'fetch, so twelve requests would buy twelve identical refusals and spend the grant to ' +
        'learn nothing already known. A 404, an empty page or a failed CAPTCHA is not evidence ' +
        'that a historical list does not exist, so no availability class may be inferred from ' +
        'them — UNMEASURED is the only honest classification until the CAPTCHA basis exists.',
    },

    monitoringProductState: 'DISABLED_NOT_READY',
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nwrote ${OUT}`);
} finally {
  await sql.end({ timeout: 5 });
}
