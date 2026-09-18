/**
 * `pnpm --filter @lawmind/harness exec tsx --env-file=../../.env src/new3-gold-v2-corrections-cli.ts`
 *
 * Two corrections to gold artifacts shipped earlier this session, both
 * flagged by NEW1's independent re-verification (bus 0942) rather than
 * caught here first:
 *
 *   1. REACHABILITY TABLE BUG. new3-uncited-authority-gold-v2.json's
 *      reachabilityWarning queried `document_vector_staging`, which is an
 *      EMPTY LEGACY TABLE (0 rows, always). Every id "not found" against it,
 *      so the reported "0 of 176 staged" was measuring nothing and the
 *      inference drawn from it ("value-ordering hasn't reached zero-inbound
 *      authorities yet") was backwards. The Tier-A walk actually writes to
 *      `new1_doc_vector_stage`. Re-measured live against the correct table
 *      for BOTH gold sets (not just the one NEW1 checked), matching NEW1's
 *      independent numbers: this script does not trust 0942's numbers either,
 *      it reproduces them.
 *
 *   2. P10 FEATURE-FAMILY GATE MISSING ON THE CITATION-DERIVED SET. The
 *      mission brief (P10): "Every gold row must carry gold_provenance,
 *      allowed feature families, prohibited feature families, case_family/
 *      group, query class. Citation-derived gold must prohibit citation/
 *      inbound features that recreate the label. Ensure NEW1 can
 *      mechanically enforce this." new3-semantic-expansion-gold-v2.json had
 *      none of this on its 684 rows -- NEW1's adapter was assigning it at
 *      load time, which means the two gold sets were not independently
 *      auditable to the same standard (0942 point 4a). Same vocabulary as
 *      the uncited set for consistency. Also adds `redacted: []` with an
 *      explicit reason on exact_citation/case_title rows so an absent key
 *      cannot be misread as "redaction forgotten" (0942 point 4b).
 *
 * This is a correction pass on artifacts THIS SESSION shipped minutes ago,
 * not a rebuild of externally-consumed gold -- patched in place with a
 * `correction` field naming what changed and why, not silently overwritten
 * and not spun into a new version number for a same-session bug.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { sslFor } from './db-url.ts';

const ALLOWED = [
  'lexical_similarity',
  'dense_semantic_similarity',
  'court_match',
  'date_proximity',
];
const PROHIBITED = [
  'inbound_citation_count',
  'citation_graph_authority_score',
  'pagerank_style_score',
];

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }
  const sql = postgres(url, { ssl: sslFor(url), max: 3 });
  try {
    const uncitedPath = new URL(
      '../../../docs/ai/new3-uncited-authority-gold-v2.json',
      import.meta.url,
    );
    const semPath = new URL(
      '../../../docs/ai/new3-semantic-expansion-gold-v2.json',
      import.meta.url,
    );
    const uncited = JSON.parse(readFileSync(uncitedPath, 'utf8'));
    const sem = JSON.parse(readFileSync(semPath, 'utf8'));

    const uncitedIds: string[] = uncited.cases.map((c: { authority_id: string }) => c.authority_id);
    // `sem` comes from an untyped `JSON.parse`, so `.map` is `any[]` and `new Set`
    // of it widens to `Set<unknown>`. Annotating the Set rather than casting the
    // spread keeps the element type asserted in one place.
    const semIds: string[] = [
      ...new Set<string>(sem.rows.map((r: { goldJudgmentId: string }) => r.goldJudgmentId)),
    ];
    const allIds = [...new Set([...uncitedIds, ...semIds])];

    const staged = await sql<{ judgment_id: string }[]>`
      SELECT DISTINCT judgment_id::text FROM new1_doc_vector_stage WHERE judgment_id = ANY(${allIds}::uuid[])
    `;
    const stagedSet = new Set(staged.map((s) => s.judgment_id));

    const refused = await sql<{ judgment_id: string; refused_class: string }[]>`
      SELECT judgment_id::text, refused_class FROM new1_doc_vector_stage_refused WHERE judgment_id = ANY(${allIds}::uuid[])
    `;
    const refusedMap = new Map(refused.map((r) => [r.judgment_id, r.refused_class]));

    const uncitedStaged = uncitedIds.filter((id) => stagedSet.has(id)).length;
    const semStaged = semIds.filter((id) => stagedSet.has(id)).length;
    console.log(
      `uncited-authority gold: ${uncitedStaged}/${uncitedIds.length} staged in new1_doc_vector_stage`,
    );
    console.log(
      `semantic-expansion gold: ${semStaged}/${semIds.length} staged in new1_doc_vector_stage`,
    );

    // --- Correction 1: reachability, uncited-authority gold v2 ---
    const notStaged = uncitedIds.filter((id) => !stagedSet.has(id));
    const refusedNotStaged = notStaged.filter((id) => refusedMap.has(id));
    uncited.reachabilityWarning = `CORRECTED ${new Date().toISOString()} per NEW1 bus 0942: the original check queried document_vector_staging, an EMPTY LEGACY TABLE (0 rows, always returns "not present" for any id) -- the reported "0 of 176 staged" measured nothing. Re-checked live against new1_doc_vector_stage (the table the Tier-A walk actually writes): ${uncitedStaged} of ${uncitedIds.length} authorities (${((uncitedStaged / uncitedIds.length) * 100).toFixed(1)}%) ARE staged. Of the ${notStaged.length} not staged, ${refusedNotStaged.length} are in new1_doc_vector_stage_refused (quarantined with a refused_class, not missing/skipped). Corrects the prior claim that value-ordered embedding has not reached zero-inbound authorities -- it has, nearly completely.`;
    uncited.correction = {
      correctedAt: new Date().toISOString(),
      correctedBy: 'NEW3',
      reason: 'bus 0942 (NEW1): reachability check queried the wrong table',
      whatChanged: 'reachabilityWarning field only -- no case rows added, removed, or reordered',
    };

    // --- Correction 2: P10 feature-family gate on semantic-expansion gold v2 ---
    for (const r of sem.rows as Array<{
      queryType: string;
      goldJudgmentId: string;
      provenance: Record<string, unknown>;
    }>) {
      r.provenance['queryClass'] = r.queryType;
      r.provenance['caseFamily'] = r.goldJudgmentId;
      r.provenance['allowedFeatureFamilies'] = ALLOWED;
      r.provenance['prohibitedFeatureFamilies'] = PROHIBITED;
      if (r.queryType !== 'proposition' && !('redacted' in r.provenance)) {
        r.provenance['redacted'] = [];
        r.provenance['redactedReason'] =
          "not applicable: the query IS the target judgment's own citation string or case title by construction, so there is no citing-judgment passage to redact from";
      }
    }
    sem.correction = {
      correctedAt: new Date().toISOString(),
      correctedBy: 'NEW3',
      reason:
        'bus 0942 (NEW1) point 4a/4b + mission brief P10: gold rows must carry allowed/prohibited feature families, case_family, and query class in the FILE, not only in a consuming adapter, to be independently auditable',
      whatChanged:
        'added queryClass, caseFamily, allowedFeatureFamilies, prohibitedFeatureFamilies to provenance on all 684 rows; added explicit redacted:[] + reason to the 456 exact_citation/case_title rows that previously omitted the key',
    };

    writeFileSync(uncitedPath, `${JSON.stringify(uncited, null, 2)}\n`);
    writeFileSync(semPath, `${JSON.stringify(sem, null, 2)}\n`);
    console.log('\ncorrected: docs/ai/new3-uncited-authority-gold-v2.json (reachabilityWarning)');
    console.log(
      'corrected: docs/ai/new3-semantic-expansion-gold-v2.json (P10 feature-family gate, all 684 rows)',
    );
  } finally {
    await sql.end();
  }
}

await main();
