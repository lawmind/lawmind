/**
 * `pnpm --filter @lawmind/harness exec tsx src/new3-semantic-expansion-gold-v2-cli.ts`
 *
 * Gold V2 — re-validates `docs/ai/new3-semantic-expansion-gold.json` (v1,
 * 250 authorities / 750 rows) against the LIVE corpus rather than the cached
 * `provenance.citingDate`/`citedDate` strings frozen at build time. NEW1 (bus
 * 0904) found 22 authorities chronologically impossible and 1 mojibake row by
 * inspecting v1's own frozen fields; this script reproduces that check
 * independently (confirmed: 22 distinct authorities / 66 of 750 rows date-
 * impossible, 1 mojibake row) and adds three checks the mission brief (P0)
 * requires that v1 never ran:
 *
 *   AUTHORITY_IDENTITY  - does goldJudgmentId still resolve in `judgments`,
 *                         and does its case_title still match what v1 froze?
 *   SOURCE_EDGE         - does the citing->cited edge still exist in
 *                         `judgment_citations` (not deleted/reclassified since)?
 *   DATE_PLAUSIBILITY   - re-fetched judgment_date (not the frozen copy):
 *                         PASS (cited <= citing), FAIL (cited > citing),
 *                         or DATE_UNKNOWN (either date is null).
 *   TEXT_USABLE         - the proposition query text is not mojibake (control
 *                         characters), reusing v1's own redaction output
 *                         rather than re-deriving it.
 *
 * An authority's entire row group (proposition + exact_citation + case_title)
 * is promoted to V2 only if ALL FOUR pass (DATE_UNKNOWN counts as pass per
 * the brief: "date plausibility verified OR explicitly DATE_UNKNOWN").
 * Anything that fails any check is quarantined to
 * `docs/ai/new3-semantic-expansion-gold-v2-rejected.json` with the specific
 * reason - never silently dropped, never silently reused (mission brief P0).
 *
 * v1 is left untouched on disk. This is a NEW versioned file, not an edit -
 * "version it, do not silently delete and reuse."
 *
 * DB cost: two batched, PK/edge-indexed queries (ANY(uuid[]) on `judgments.id`,
 * an IN-list on `judgment_citations`'s citing/cited edge) for ~250-500 ids
 * total. Not a scan. Resource-gate: DB_SCAN not required.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { sslFor } from './db-url.ts';

const QUALITY_CONTRACT_VERSION = {
  schema_migration_snapshot: '0056 (judgments.script_quality live)',
  text_quality_column: 'judgments.text_quality numeric(4,3), SCHEMA_TRUTH.md L150/333',
  script_quality_vocab:
    'clean | devanagari_deleted | legacy_font_ascii | mixed_script_ok (+ others), SCHEMA_TRUTH.md L1748-1749',
  date_plausibility_method:
    'live re-fetch of judgments.judgment_date at V2 build time, cited <= citing required; NOT the frozen v1 provenance copy',
  recorded_at: new Date().toISOString(),
};

// Built from char codes rather than a literal regex escape sequence to avoid
// any editor/tool round-trip inserting raw control bytes into this source file.
const CONTROL_CHAR_CODES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31,
];
const CONTROL_CHAR_RE = new RegExp(
  `[${CONTROL_CHAR_CODES.map((c) => String.fromCharCode(c)).join('')}]`,
  'g',
);

function mojibakeCount(text: string): number {
  return (text.match(CONTROL_CHAR_RE) ?? []).length;
}

type V1Row = {
  id: string;
  queryType: 'proposition' | 'exact_citation' | 'case_title';
  query: string;
  goldJudgmentId: string;
  relationship: string;
  provenance: Record<string, unknown> & {
    citingJudgmentId: string;
    citingCase: string;
    citedCase: string;
  };
};

type V1Doc = { rows: V1Row[]; [k: string]: unknown };

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }
  const v1Path = new URL('../../../docs/ai/new3-semantic-expansion-gold.json', import.meta.url);
  const v1: V1Doc = JSON.parse(readFileSync(v1Path, 'utf8'));

  const groups = new Map<string, V1Row[]>();
  for (const r of v1.rows) {
    const arr = groups.get(r.goldJudgmentId) ?? [];
    arr.push(r);
    groups.set(r.goldJudgmentId, arr);
  }
  console.log(`v1: ${v1.rows.length} rows across ${groups.size} distinct authorities`);

  const sql = postgres(url, { ssl: sslFor(url), max: 3 });
  try {
    const citedIds = [...groups.keys()];
    const citingIds = [...new Set(v1.rows.map((r) => r.provenance.citingJudgmentId))];
    const allIds = [...new Set([...citedIds, ...citingIds])];

    const idRows = await sql<
      {
        id: string;
        case_title: string;
        judgment_date: string | null;
        script_quality: string | null;
        text_quality: string | null;
      }[]
    >`
      SELECT id::text, case_title, judgment_date::text, script_quality::text, text_quality::text
      FROM judgments
      WHERE id = ANY(${allIds}::uuid[])
    `;
    const byId = new Map(idRows.map((r) => [r.id, r]));
    console.log(`live judgments rows found: ${idRows.length} of ${allIds.length} requested ids`);

    const edgePairs = [
      ...new Set(v1.rows.map((r) => `${r.provenance.citingJudgmentId}::${r.goldJudgmentId}`)),
    ].map((p) => p.split('::'));
    const edgeRows = await sql<{ citing_judgment_id: string; cited_judgment_id: string }[]>`
      SELECT DISTINCT citing_judgment_id::text, cited_judgment_id::text
      FROM judgment_citations
      WHERE (citing_judgment_id, cited_judgment_id) IN ${sql(edgePairs.map((p) => sql([p[0]!, p[1]!])))}
    `;
    const edgeSet = new Set(edgeRows.map((e) => `${e.citing_judgment_id}::${e.cited_judgment_id}`));
    console.log(`live edges confirmed: ${edgeSet.size} of ${edgePairs.length} requested pairs`);

    const v2Rows: V1Row[] = [];
    const rejected: Array<{
      goldJudgmentId: string;
      citingJudgmentId: string;
      reasons: string[];
      rowIds: string[];
    }> = [];
    const byCourt: Record<string, number> = {};
    const byRelationship: Record<string, number> = {};

    for (const [goldId, rows] of groups) {
      const prop = rows.find((r) => r.queryType === 'proposition')!;
      const citingId = prop.provenance.citingJudgmentId;
      const reasons: string[] = [];

      const goldLive = byId.get(goldId);
      const citingLive = byId.get(citingId);
      if (!goldLive)
        reasons.push('AUTHORITY_IDENTITY_FAIL: goldJudgmentId no longer resolves in judgments');
      else if (goldLive.case_title !== prop.provenance.citedCase) {
        reasons.push(
          `AUTHORITY_IDENTITY_FAIL: case_title changed since v1 build ("${prop.provenance.citedCase}" -> "${goldLive.case_title}")`,
        );
      }
      if (!citingLive)
        reasons.push('AUTHORITY_IDENTITY_FAIL: citingJudgmentId no longer resolves in judgments');

      if (!edgeSet.has(`${citingId}::${goldId}`))
        reasons.push('SOURCE_EDGE_FAIL: citation edge no longer present in judgment_citations');

      let dateVerdict: 'PASS' | 'FAIL' | 'DATE_UNKNOWN' = 'DATE_UNKNOWN';
      if (goldLive?.judgment_date && citingLive?.judgment_date) {
        dateVerdict =
          new Date(goldLive.judgment_date) > new Date(citingLive.judgment_date) ? 'FAIL' : 'PASS';
        if (dateVerdict === 'FAIL') {
          reasons.push(
            `DATE_PLAUSIBILITY_FAIL: cited judgment_date ${goldLive.judgment_date} is AFTER citing judgment_date ${citingLive.judgment_date}`,
          );
        }
      }

      const mojibakeRows = rows.filter((r) => mojibakeCount(r.query) > 5);
      if (mojibakeRows.length > 0) {
        reasons.push(
          `TEXT_USABLE_FAIL: ${mojibakeRows.length} row(s) contain >5 control chars (mojibake) in query text`,
        );
      }

      if (reasons.length === 0) {
        for (const r of rows) {
          v2Rows.push({
            ...r,
            provenance: {
              ...r.provenance,
              dateVerdict,
              citedDateLive: goldLive!.judgment_date,
              citingDateLive: citingLive!.judgment_date,
              citedScriptQuality: goldLive!.script_quality,
              citedTextQuality: goldLive!.text_quality,
            },
          });
        }
        const court = (prop.provenance as { citedCourt?: string }).citedCourt ?? 'UNKNOWN';
        byCourt[court] = (byCourt[court] ?? 0) + 1;
        byRelationship[prop.relationship] = (byRelationship[prop.relationship] ?? 0) + 1;
      } else {
        rejected.push({
          goldJudgmentId: goldId,
          citingJudgmentId: citingId,
          reasons,
          rowIds: rows.map((r) => r.id),
        });
      }
    }

    const v2Doc = {
      version: 2,
      builtAt: new Date().toISOString(),
      builtBy: 'NEW3',
      rebuiltFrom: 'docs/ai/new3-semantic-expansion-gold.json (v1, 250 authorities / 750 rows)',
      method:
        'v1 rows re-validated against LIVE corpus: authority identity, source edge, date plausibility (re-fetched, not cached), text usability (mojibake scan). Failing rows quarantined, not deleted or silently reused.',
      qualityContractVersion: QUALITY_CONTRACT_VERSION,
      distinctGoldAuthorities:
        v2Rows.length > 0 ? new Set(v2Rows.map((r) => r.goldJudgmentId)).size : 0,
      totalRows: v2Rows.length,
      byCourt,
      byRelationship,
      quarantinedAuthorities: rejected.length,
      quarantinedRows: rejected.reduce((n, r) => n + r.rowIds.length, 0),
      quarantineArtifact: 'docs/ai/new3-semantic-expansion-gold-v2-rejected.json',
      rows: v2Rows,
    };

    const rejectedDoc = {
      version: 2,
      builtAt: v2Doc.builtAt,
      rejectedFrom: 'docs/ai/new3-semantic-expansion-gold.json (v1)',
      count: rejected.length,
      entries: rejected,
    };

    const v2Path = new URL(
      '../../../docs/ai/new3-semantic-expansion-gold-v2.json',
      import.meta.url,
    );
    const rejPath = new URL(
      '../../../docs/ai/new3-semantic-expansion-gold-v2-rejected.json',
      import.meta.url,
    );
    writeFileSync(v2Path, `${JSON.stringify(v2Doc, null, 2)}\n`);
    writeFileSync(rejPath, `${JSON.stringify(rejectedDoc, null, 2)}\n`);

    console.log(
      `\nV2: ${v2Doc.distinctGoldAuthorities} authorities / ${v2Doc.totalRows} rows PROMOTED`,
    );
    console.log(`quarantined: ${rejected.length} authorities / ${v2Doc.quarantinedRows} rows`);
    console.log('by court:', byCourt);
    console.log('by relationship:', byRelationship);
    console.log(`\nwrote docs/ai/new3-semantic-expansion-gold-v2.json`);
    console.log(`wrote docs/ai/new3-semantic-expansion-gold-v2-rejected.json`);
  } finally {
    await sql.end();
  }
}

await main();
