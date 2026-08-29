/** Bounded live proof for image-only state, provenance, and the 135 MB finding. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'ai', 'lcc-r10', 'live-state-proof.json');

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = readFileSync(join(ROOT, '.env'), 'utf8').match(/^DATABASE_URL\s*=\s*(.+?)\s*$/m);
  if (!match) throw new Error('DATABASE_URL missing');
  return match[1]!.replace(/^["']|["']$/g, '');
}

const sql = postgres(databaseUrl(), { max: 2, prepare: false, onnotice: () => {} });
try {
  const [schema] = await sql<
    {
      text_state_column: boolean;
      text_state_constraint: boolean;
      date_court_index_bytes: string;
    }[]
  >`
    SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='official_source_artifact'
                AND column_name='text_state'
           ) AS text_state_column,
           EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conname='official_source_artifact_text_state_check'
           ) AS text_state_constraint,
           pg_relation_size('judgments_date_court_idx')::text AS date_court_index_bytes`;

  const [artifacts] = await sql<
    {
      latest_observations: string;
      held: string;
      text_available: string;
      image_only_ocr_pending: string;
      held_text_unavailable: string;
    }[]
  >`
    WITH latest AS (
      SELECT DISTINCT ON (source_url)
             source_url, observation_state, text_state,
             (raw_bytes IS NOT NULL OR storage_key IS NOT NULL) AS retained
        FROM official_source_artifact
       WHERE source='aws_hc' AND artifact_role='judgment_pdf'
       ORDER BY source_url, observed_at DESC, id DESC
    )
    SELECT count(*)::text AS latest_observations,
           count(*) FILTER (WHERE retained)::text AS held,
           count(*) FILTER (WHERE retained AND text_state='TEXT_AVAILABLE')::text AS text_available,
           count(*) FILTER (WHERE retained AND text_state='IMAGE_ONLY_OCR_PENDING')::text AS image_only_ocr_pending,
           count(*) FILTER (WHERE retained AND text_state IS DISTINCT FROM 'TEXT_AVAILABLE')::text
             AS held_text_unavailable
      FROM latest`;

  const [provenance] = await sql<
    {
      complete_rows: string;
      partial_rows: string;
      latest_recorded_at: string | null;
    }[]
  >`
    SELECT count(*) FILTER (
             WHERE source_id IS NOT NULL AND source_edition IS NOT NULL
               AND authorization_basis IS NOT NULL AND provenance_recorded_at IS NOT NULL
           )::text AS complete_rows,
           count(*) FILTER (
             WHERE num_nonnulls(source_id, source_edition, authorization_basis,
                                 provenance_recorded_at) BETWEEN 1 AND 3
           )::text AS partial_rows,
           max(provenance_recorded_at)::text AS latest_recorded_at
      FROM judgments`;

  const authorization = await sql<{ source: string; authorization_basis: string; n: string }[]>`
    SELECT source, authorization_basis, count(*)::text AS n
      FROM official_source_fetch_ledger
     WHERE source IN ('sci_homepage','sci_search','sci_pdf')
     GROUP BY source, authorization_basis ORDER BY source, authorization_basis`;

  const report = {
    artifact: 'LCC_R10_LIVE_STATE_PROOF',
    takenAt: new Date().toISOString(),
    schema: {
      textStateColumn: schema?.text_state_column ?? false,
      textStateConstraint: schema?.text_state_constraint ?? false,
    },
    officialHcArtifacts: {
      latestObservations: Number(artifacts?.latest_observations ?? 0),
      sourceArtifactHeld: Number(artifacts?.held ?? 0),
      textAvailable: Number(artifacts?.text_available ?? 0),
      imageOnlyOcrPending: Number(artifacts?.image_only_ocr_pending ?? 0),
      heldTextEvidenceUnavailable: Number(artifacts?.held_text_unavailable ?? 0),
      generationEvidenceUnavailableForImageOnly: Number(artifacts?.image_only_ocr_pending ?? 0),
    },
    judgmentProvenance: {
      completeRows: Number(provenance?.complete_rows ?? 0),
      partialRows: Number(provenance?.partial_rows ?? 0),
      latestRecordedAt: provenance?.latest_recorded_at ?? null,
      note: 'No mass backfill was run; live writer coverage is proven separately by the rollback canary.',
    },
    currentSupremeCourtAuthorizationLedger: authorization.map((row) => ({
      source: row.source,
      authorizationBasis: row.authorization_basis,
      observations: Number(row.n),
    })),
    freshnessIndex: {
      relation: 'judgments_date_court_idx',
      bytes: Number(schema?.date_court_index_bytes ?? 0),
      note: 'This relation size is the reported ~135 MB. It was never an HTTP response body.',
    },
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
