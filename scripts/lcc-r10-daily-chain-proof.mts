/**
 * Exact consumer accounting for the real 1,334-row R10 HC delta.
 *
 * Conditional consumers publish their own eligible denominator. Text is read
 * only to run the same deterministic statute/paragraph functions as the live
 * consumers; no document text is written to the proof artifact.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

import { spansAreContiguous, splitParagraphs } from '../services/ingest/src/paragraphs.ts';
import { extractSectionRefs, foldSectionRefs } from '../services/ingest/src/sections.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'ai', 'lcc-r10', 'daily-chain-proof.json');
const FROM = '2026-08-27T14:10:08.698525Z';
const TO = '2026-08-29T04:55:22.134122Z';
const QUEUE_PASS_AT = '2026-08-29T05:44:36.020Z';
const QUEUE_NEXT_AT = '2026-08-29T05:59:02.422Z';
const HC_SOURCE_PREFIX = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/';

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = readFileSync(join(ROOT, '.env'), 'utf8').match(/^DATABASE_URL\s*=\s*(.+?)\s*$/m);
  if (!match) throw new Error('DATABASE_URL missing');
  return match[1]!.replace(/^["']|["']$/g, '');
}

const sql = postgres(databaseUrl(), {
  max: 2,
  prepare: false,
  onnotice: () => {},
  connection: { statement_timeout: 0 },
});

try {
  const rows = await sql<{ id: string; full_text: string; tsv: boolean }[]>`
    SELECT id::text, full_text, full_text_tsv IS NOT NULL AS tsv
      FROM judgments
     WHERE created_at > ${FROM}::timestamptz
       AND created_at <= ${TO}::timestamptz
       AND source_url LIKE ${HC_SOURCE_PREFIX + '%'}
     ORDER BY id`;
  const ids = rows.map((row) => row.id);
  const idHash = createHash('sha256').update(ids.join('\n')).digest('hex');

  const [citation] = await sql<
    {
      processed: number;
      with_edges: number;
      sentinels: number;
      edge_rows: number;
    }[]
  >`
    SELECT count(DISTINCT j.id) FILTER (WHERE c.citing_judgment_id IS NOT NULL)::int AS processed,
           count(DISTINCT j.id) FILTER (WHERE c.citation_text <> '')::int AS with_edges,
           count(*) FILTER (WHERE c.citation_text = '')::int AS sentinels,
           count(*) FILTER (WHERE c.citation_text <> '')::int AS edge_rows
      FROM judgments j
      LEFT JOIN judgment_citations c ON c.citing_judgment_id = j.id
     WHERE j.id = ANY(${ids}::uuid[])`;

  const [keys] = await sql<{ eligible: number; delivered: number; key_rows: number }[]>`
    WITH forms AS (
      SELECT j.id, j.neutral_citation AS t
        FROM judgments j
       WHERE j.id = ANY(${ids}::uuid[])
         AND j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
      UNION ALL
      SELECT j.id, rc
        FROM judgments j, unnest(j.reporter_citations) rc
       WHERE j.id = ANY(${ids}::uuid[]) AND rc <> ''
    ), valid AS (
      SELECT DISTINCT id
        FROM forms
       WHERE length(t) <= 512
         AND length(upper(regexp_replace(t, '[^A-Za-z0-9]', '', 'g'))) BETWEEN 1 AND 512
         AND upper(regexp_replace(t, '[^A-Za-z0-9]', '', 'g'))
             !~ '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$'
    )
    SELECT (SELECT count(*)::int FROM valid) AS eligible,
           (SELECT count(DISTINCT v.id)::int FROM valid v
              JOIN judgment_citation_keys k ON k.judgment_id = v.id) AS delivered,
           (SELECT count(*)::int FROM judgment_citation_keys k
              WHERE k.judgment_id = ANY(${ids}::uuid[])) AS key_rows`;

  const [storedParagraphs] = await sql<{ judgments: number; rows: number }[]>`
    SELECT count(DISTINCT judgment_id)::int AS judgments, count(*)::int AS rows
      FROM judgment_paragraphs WHERE judgment_id = ANY(${ids}::uuid[])`;

  const statuteEligible = new Set<string>();
  const paragraphEligible = new Set<string>();
  let paragraphRefusedLostSpan = 0;
  for (const row of rows) {
    if (foldSectionRefs(extractSectionRefs(row.full_text)).length > 0) statuteEligible.add(row.id);
    if (row.full_text.length <= 100) continue;
    const paragraphs = splitParagraphs(row.full_text);
    if (paragraphs.length === 0) continue;
    if (!spansAreContiguous(paragraphs, row.full_text)) {
      paragraphRefusedLostSpan++;
      continue;
    }
    paragraphEligible.add(row.id);
  }

  const [statutes] = await sql<{ delivered: number; rows: number }[]>`
    SELECT count(DISTINCT judgment_id)::int AS delivered, count(*)::int AS rows
      FROM judgment_statute_refs
     WHERE judgment_id = ANY(${[...statuteEligible]}::uuid[])`;

  const [embeddings] = await sql<
    {
      eligible_judgments: number;
      eligible_hashes: number;
      represented_before: number;
      represented_during: number;
      represented_now: number;
    }[]
  >`
    WITH eligible AS (
      SELECT e.id, e.content_hash
        FROM judgment_embedding_eligibility e
       WHERE e.id = ANY(${ids}::uuid[])
         AND e.semantic_tier <> 'NOT_ELIGIBLE'
         AND e.text_safety <> 'UNSAFE_VERIFIED'
         AND e.value_band = ANY(${['standard', 'full', 'substantial']})
    ), hashes AS (SELECT DISTINCT content_hash FROM eligible), staged AS (
      SELECT DISTINCT j.content_hash,
             min(s.created_at) AS first_staged_at
        FROM new1_doc_vector_stage s
        JOIN judgments j ON j.id = s.judgment_id
        JOIN hashes h ON h.content_hash = j.content_hash
       GROUP BY j.content_hash
    )
    SELECT (SELECT count(*)::int FROM eligible) AS eligible_judgments,
           (SELECT count(*)::int FROM hashes) AS eligible_hashes,
           count(*) FILTER (WHERE first_staged_at < ${QUEUE_PASS_AT}::timestamptz)::int AS represented_before,
           count(*) FILTER (WHERE first_staged_at >= ${QUEUE_PASS_AT}::timestamptz
                              AND first_staged_at < ${QUEUE_NEXT_AT}::timestamptz)::int AS represented_during,
           count(*)::int AS represented_now
      FROM staged`;

  const total = rows.length;
  const exactDelivered = rows.filter((row) => row.full_text.length > 0 && row.tsv).length;
  const proof = {
    artifact: 'LCC_R10_DAILY_CHAIN_PROOF',
    takenAt: new Date().toISOString(),
    selector: {
      createdAtExclusive: FROM,
      createdAtInclusive: TO,
      sourceUrlPrefix: HC_SOURCE_PREFIX,
      idsSha256: idHash,
    },
    ingested: total,
    consumers: {
      exactLexical: {
        eligible: total,
        delivered: exactDelivered,
        queued: total - exactDelivered,
        eligibility:
          'canonical judgment with non-empty full_text; full_text_tsv is generated in the same row',
      },
      citationExtraction: {
        eligible: total,
        delivered: citation?.processed ?? 0,
        withExtractedEdges: citation?.with_edges ?? 0,
        explicitNoCitationSentinels: citation?.sentinels ?? 0,
        edgeRows: citation?.edge_rows ?? 0,
        queued: total - (citation?.processed ?? 0),
      },
      citationKeys: {
        eligible: keys?.eligible ?? 0,
        delivered: keys?.delivered ?? 0,
        ineligibleNoValidPublishedCitation: total - (keys?.eligible ?? 0),
        keyRows: keys?.key_rows ?? 0,
        queued: (keys?.eligible ?? 0) - (keys?.delivered ?? 0),
      },
      paragraphs: {
        eligible: paragraphEligible.size,
        delivered: storedParagraphs?.judgments ?? 0,
        ineligible: total - paragraphEligible.size,
        refusedLostSpan: paragraphRefusedLostSpan,
        paragraphRows: storedParagraphs?.rows ?? 0,
        queued: paragraphEligible.size - (storedParagraphs?.judgments ?? 0),
      },
      statuteReferences: {
        eligible: statuteEligible.size,
        delivered: statutes?.delivered ?? 0,
        ineligibleNoExtractedReference: total - statuteEligible.size,
        referenceRows: statutes?.rows ?? 0,
        queued: statuteEligible.size - (statutes?.delivered ?? 0),
      },
      new1IncrementalEmbeddings: {
        eligibleJudgments: embeddings?.eligible_judgments ?? 0,
        eligibleDistinctContentHashes: embeddings?.eligible_hashes ?? 0,
        ineligibleJudgments: total - (embeddings?.eligible_judgments ?? 0),
        representedBeforeQueuePass: embeddings?.represented_before ?? 0,
        eligibleQueueDenominator:
          (embeddings?.eligible_hashes ?? 0) - (embeddings?.represented_before ?? 0),
        representedDuringQueuePass: embeddings?.represented_during ?? 0,
        representedNow: embeddings?.represented_now ?? 0,
        queued: (embeddings?.eligible_hashes ?? 0) - (embeddings?.represented_now ?? 0),
        queuePassWindow: { from: QUEUE_PASS_AT, toExclusive: QUEUE_NEXT_AT },
      },
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await sql.end({ timeout: 10 });
}
