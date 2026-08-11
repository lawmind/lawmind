/**
 * Corpus quality dashboard — `docs/ai/DATA_MOAT_PROGRAM.md` §6/§7 item 4.
 *
 *   pnpm --filter @lawmind/ingest run corpus:report [--json <path>]
 *
 * **Dry, read-only, no writes** — every other backfill/report CLI in this
 * package follows the same shape, and this one has no reason to differ: it
 * only answers "what do we actually have", never changes it.
 *
 * Consolidates metrics that were scattered across separate ad-hoc queries
 * run during this session's corpus work (`docs/ai/tasks/003-corpus-
 * inventory.md`, `007-cnr-backfill-investigation.md`) into one report, so
 * the next person asking "what shape is the corpus in" does not have to
 * re-derive each number by hand.
 *
 * **What this does NOT measure, and why**: paragraph-extraction quality
 * (`numberedShare` per judgment) is not aggregated here — computing it for
 * 79,321 rows means fetching every `full_text`, which is exactly the
 * expensive full-corpus scan a dry report should not casually trigger. A
 * sampled version is future work, not silently approximated here.
 */
import postgres from 'postgres';

type Report = {
  generatedAt: string;
  corpus: { total: number; supremeCourt: number; highCourt: number };
  identity: { contentHashCoverage: number; cnrCoverage: number; duplicateGroups: number; duplicateRows: number };
  metadata: { sourceDocumentTypeCoverage: number; sourceDocumentTypeByCourt: { court: string; coverage: number }[] };
  quality: { textQualityAvg: number | null; belowNinetyPercent: number; textQualityMissing: number };
  citationGraph: { edges: number; resolved: number; resolvedRate: number };
  treatment: Record<string, number>;
  language: Record<string, number>;
  freshness: { newestRow: string | null; oldestRow: string | null };
  statutes: { acts: number; sections: number; mappings: number };
};

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 5, ssl: 'require' });

  try {
    const [corpus] = await sql<{ total: string; sc: string; hc: string }[]>`
      SELECT count(*)::text AS total,
             count(*) FILTER (WHERE court = 'Supreme Court of India')::text AS sc,
             count(*) FILTER (WHERE court != 'Supreme Court of India')::text AS hc
      FROM judgments`;

    const [identity] = await sql<{ hash_cov: string; cnr_cov: string; total: string }[]>`
      SELECT count(content_hash)::text AS hash_cov, count(cnr)::text AS cnr_cov, count(*)::text AS total
      FROM judgments`;
    const [dupes] = await sql<{ groups: string; rows: string }[]>`
      SELECT count(*)::text AS groups, coalesce(sum(n), 0)::text AS rows FROM (
        SELECT count(*) AS n FROM judgments WHERE content_hash IS NOT NULL
        GROUP BY content_hash HAVING count(*) > 1
      ) t`;

    const [docType] = await sql<{ cov: string; total: string }[]>`
      SELECT count(source_document_type)::text AS cov, count(*)::text AS total FROM judgments`;
    const docTypeByCourt = await sql<{ court: string; cov: string; total: string }[]>`
      SELECT court, count(source_document_type)::text AS cov, count(*)::text AS total
      FROM judgments WHERE court != 'Supreme Court of India'
      GROUP BY court HAVING count(source_document_type) > 0
      ORDER BY count(source_document_type) DESC`;

    const [quality] = await sql<{ avg: string | null; below90: string; missing: string }[]>`
      SELECT avg(text_quality)::text AS avg,
             count(*) FILTER (WHERE text_quality < 0.9)::text AS below90,
             count(*) FILTER (WHERE text_quality IS NULL)::text AS missing
      FROM judgments`;

    const [citations] = await sql<{ edges: string; resolved: string }[]>`
      SELECT count(*)::text AS edges, count(cited_judgment_id)::text AS resolved FROM judgment_citations`;

    const treatmentRows = await sql<{ relationship: string; n: string }[]>`
      SELECT relationship, count(*)::text AS n FROM judgment_citations GROUP BY relationship`;

    const overruledRows = await sql<{ overruled_status: string; n: string }[]>`
      SELECT overruled_status, count(*)::text AS n FROM judgments GROUP BY overruled_status`;

    const languageRows = await sql<{ language: string; n: string }[]>`
      SELECT language, count(*)::text AS n FROM judgments GROUP BY language`;

    const [freshness] = await sql<{ newest: string | null; oldest: string | null }[]>`
      SELECT max(created_at)::text AS newest, min(created_at)::text AS oldest FROM judgments`;

    const [statutes] = await sql<{ acts: string; sections: string; mappings: string }[]>`
      SELECT
        (SELECT count(*) FROM statutes)::text AS acts,
        (SELECT count(*) FROM statute_sections)::text AS sections,
        (SELECT count(*) FROM statute_mappings)::text AS mappings`;

    const report: Report = {
      generatedAt: new Date().toISOString(),
      corpus: {
        total: Number(corpus?.total ?? 0),
        supremeCourt: Number(corpus?.sc ?? 0),
        highCourt: Number(corpus?.hc ?? 0),
      },
      identity: {
        contentHashCoverage: Number(identity?.hash_cov ?? 0) / Math.max(1, Number(identity?.total ?? 1)),
        cnrCoverage: Number(identity?.cnr_cov ?? 0) / Math.max(1, Number(identity?.total ?? 1)),
        duplicateGroups: Number(dupes?.groups ?? 0),
        duplicateRows: Number(dupes?.rows ?? 0),
      },
      metadata: {
        sourceDocumentTypeCoverage: Number(docType?.cov ?? 0) / Math.max(1, Number(docType?.total ?? 1)),
        sourceDocumentTypeByCourt: docTypeByCourt.map((r) => ({
          court: r.court,
          coverage: Number(r.cov) / Number(r.total),
        })),
      },
      quality: {
        textQualityAvg: quality?.avg ? Number(quality.avg) : null,
        belowNinetyPercent: Number(quality?.below90 ?? 0),
        textQualityMissing: Number(quality?.missing ?? 0),
      },
      citationGraph: {
        edges: Number(citations?.edges ?? 0),
        resolved: Number(citations?.resolved ?? 0),
        resolvedRate: Number(citations?.resolved ?? 0) / Math.max(1, Number(citations?.edges ?? 1)),
      },
      treatment: Object.fromEntries(treatmentRows.map((r) => [r.relationship, Number(r.n)])),
      language: Object.fromEntries(languageRows.map((r) => [r.language, Number(r.n)])),
      freshness: { newestRow: freshness?.newest ?? null, oldestRow: freshness?.oldest ?? null },
      statutes: {
        acts: Number(statutes?.acts ?? 0),
        sections: Number(statutes?.sections ?? 0),
        mappings: Number(statutes?.mappings ?? 0),
      },
    };

    const overruledSummary = Object.fromEntries(overruledRows.map((r) => [r.overruled_status, Number(r.n)]));

    console.log('CORPUS QUALITY REPORT');
    console.log('='.repeat(78));
    console.log(`generated ${report.generatedAt}\n`);

    console.log(`Corpus: ${report.corpus.total.toLocaleString()} judgments`);
    console.log(`  Supreme Court: ${report.corpus.supremeCourt.toLocaleString()}`);
    console.log(`  High Court:    ${report.corpus.highCourt.toLocaleString()}\n`);

    console.log('Identity:');
    console.log(`  content_hash coverage: ${(report.identity.contentHashCoverage * 100).toFixed(1)}%`);
    console.log(`  cnr coverage:          ${(report.identity.cnrCoverage * 100).toFixed(1)}%`);
    console.log(`  duplicate groups:      ${report.identity.duplicateGroups} (${report.identity.duplicateRows} rows, ${((report.identity.duplicateRows / report.corpus.total) * 100).toFixed(1)}%)\n`);

    console.log('Metadata completeness:');
    console.log(`  source_document_type (corpus-wide): ${(report.metadata.sourceDocumentTypeCoverage * 100).toFixed(1)}%`);
    console.log('  source_document_type by court (only courts with any coverage):');
    for (const c of report.metadata.sourceDocumentTypeByCourt) {
      console.log(`    ${c.court.padEnd(30)} ${(c.coverage * 100).toFixed(1)}%`);
    }
    console.log('');

    console.log('Extraction quality (text_quality — visible damage proxy, NOT accuracy):');
    console.log(`  average: ${report.quality.textQualityAvg?.toFixed(3) ?? 'n/a'}`);
    console.log(`  below 0.90: ${report.quality.belowNinetyPercent.toLocaleString()} rows`);
    console.log(`  missing (not yet computed): ${report.quality.textQualityMissing.toLocaleString()} rows\n`);

    console.log('Citation graph:');
    console.log(`  edges: ${report.citationGraph.edges.toLocaleString()}`);
    console.log(`  resolved to a held judgment: ${report.citationGraph.resolved.toLocaleString()} (${(report.citationGraph.resolvedRate * 100).toFixed(1)}%)`);
    console.log('  by relationship:');
    for (const [k, v] of Object.entries(report.treatment)) console.log(`    ${k.padEnd(20)} ${v.toLocaleString()}`);
    console.log('');

    console.log('Overruled status:');
    for (const [k, v] of Object.entries(overruledSummary)) console.log(`  ${k.padEnd(20)} ${v.toLocaleString()}`);
    console.log('');

    console.log('Language coverage — every held judgment is the English PDF (docs/ai/DATA_MOAT_PROGRAM.md §7):');
    for (const [k, v] of Object.entries(report.language)) console.log(`  ${k.padEnd(20)} ${v.toLocaleString()}`);
    console.log('');

    console.log('Freshness:');
    console.log(`  oldest row created: ${report.freshness.oldestRow}`);
    console.log(`  newest row created: ${report.freshness.newestRow}`);
    console.log('  (no per-source "last synced" cursor exists yet — DATA_MOAT_PROGRAM.md §5)\n');

    console.log('Statutes:');
    console.log(`  Acts: ${report.statutes.acts.toLocaleString()}`);
    console.log(`  sections: ${report.statutes.sections.toLocaleString()}`);
    console.log(`  IPC<->BNS etc. mappings: ${report.statutes.mappings.toLocaleString()} (0 by design — not yet sourced, REB §7)\n`);

    console.log('NOT measured here (see file header): paragraph-extraction quality');
    console.log('(numberedShare) at corpus scale, native-vs-scanned classification,');
    console.log('per-source freshness cursor.');

    const jsonPathIdx = process.argv.indexOf('--json');
    if (jsonPathIdx !== -1 && process.argv[jsonPathIdx + 1]) {
      const jsonPath = process.argv[jsonPathIdx + 1]!;
      const { writeFileSync } = await import('node:fs');
      writeFileSync(jsonPath, `${JSON.stringify({ ...report, overruledStatus: overruledSummary }, null, 2)}\n`);
      console.log(`\nwrote ${jsonPath}`);
    }
  } finally {
    await sql.end();
  }
}

await main();
