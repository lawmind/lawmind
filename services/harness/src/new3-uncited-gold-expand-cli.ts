/**
 * `pnpm --filter @lawmind/harness exec tsx --env-file=../../.env src/new3-uncited-gold-expand-cli.ts`
 *
 * P3 of the NEW3 mission brief: "NEW1's first uncited-authority measurement
 * was informative but small. Expand this class substantially." v1
 * (`docs/ai/new3-uncited-authority-gold.json`) is 26 cases drawn from LCC's
 * 1,553-judgment holding population (bus 0892), 1,547 of which were verified
 * live to carry ZERO inbound citations. NEW1's adapter (bus 0832/0917) is the
 * only instrument that can measure retrieval on a majority-case authority —
 * everything else in the gold program selects by citation edge and cannot.
 *
 * This script:
 *   1. Re-validates all 26 v1 cases against the LIVE corpus (identity, zero-
 *      inbound-citations, mojibake) — per the background-discipline rule:
 *      "do not silently mutate old gold; revalidate/version affected rows."
 *   2. Samples NEW candidate judgments from the same holdings population
 *      (`docs/ai/embedding-manifests/legal-objects/holdings.jsonl`, 2,286
 *      rows / distinct judgments), excluding v1's 26, one holding per
 *      judgment, spread across courts, evidence text 100-600 chars.
 *   3. Verifies the new sample's inbound-citation count live (one batched
 *      query — the same check v1 ran, reproduced rather than assumed) and
 *      keeps only zero-inbound authorities.
 *   4. Checks reachability in `document_vector_staging` (informational, not
 *      a gate — v1 established 0% reachable; this session's number may
 *      differ now that GPU embedding has advanced past 100K, bus 0823).
 *   5. Writes a NEW versioned file (`-v2.json`); v1 is left on disk untouched.
 *
 * Per-row gold_provenance / allowed & prohibited feature families / case_family
 * carried through exactly as v1 (P10 of the mission brief) so NEW1's existing
 * adapter contract needs no change to read the superset.
 *
 * DB cost: 2-3 batched IN/ANY queries over <=1000 ids total. Not a scan.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres, { type Sql } from 'postgres';
import { sslFor } from './db-url.ts';

const TARGET_NEW_CASES = 150;
const MIN_EVIDENCE_CHARS = 100;
const MAX_EVIDENCE_CHARS = 600;

const CONTROL_CHAR_CODES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
const CONTROL_CHAR_RE = new RegExp(`[${CONTROL_CHAR_CODES.map((c) => String.fromCharCode(c)).join('')}]`, 'g');
function mojibakeCount(text: string): number {
  return (text.match(CONTROL_CHAR_RE) ?? []).length;
}

type V1Case = {
  query_id: string;
  gold_provenance_type: string;
  generated: boolean;
  authority_id: string;
  court: string;
  year: number;
  query: string;
  primary_evidence?: string;
  case_family: string;
  extraction_model: string;
  allowed_feature_families: string[];
  prohibited_feature_families: string[];
  note: string;
};

type HoldingRow = {
  objectId: string;
  enrichmentId: string;
  claimIndex: number;
  representationType: string;
  text: string;
  evidence: string;
  label: string;
  judgmentId: string;
  court: string;
  year: number;
  sourceTask: string;
  model: string;
};

const ALLOWED = ['lexical_similarity', 'dense_semantic_similarity', 'court_match', 'date_proximity'];
const PROHIBITED = ['inbound_citation_count', 'citation_graph_authority_score', 'pagerank_style_score'];

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }
  const v1Path = new URL('../../../docs/ai/new3-uncited-authority-gold.json', import.meta.url);
  const v1: { generatedAt: string; population: unknown; cases: V1Case[] } = JSON.parse(readFileSync(v1Path, 'utf8'));
  console.log(`v1: ${v1.cases.length} cases`);

  const holdingsPath = new URL('../../../docs/ai/embedding-manifests/legal-objects/holdings.jsonl', import.meta.url);
  const holdingLines = readFileSync(holdingsPath, 'utf8').trim().split('\n');
  const holdings: HoldingRow[] = holdingLines.map((l) => JSON.parse(l));
  console.log(`holdings.jsonl: ${holdings.length} rows`);

  const v1AuthorityIds = new Set(v1.cases.map((c) => c.authority_id));
  const byJudgment = new Map<string, HoldingRow[]>();
  for (const h of holdings) {
    const arr = byJudgment.get(h.judgmentId) ?? [];
    arr.push(h);
    byJudgment.set(h.judgmentId, arr);
  }
  console.log(`distinct judgments in holdings population: ${byJudgment.size} (v1 already used ${v1AuthorityIds.size})`);

  // One evidence-length-eligible holding per judgment, not already in v1, spread by court.
  const candidates: HoldingRow[] = [];
  const byCourtCount = new Map<string, number>();
  for (const [judgmentId, rows] of byJudgment) {
    if (v1AuthorityIds.has(judgmentId)) continue;
    const pick = rows
      .filter((r) => r.evidence && r.evidence.length >= MIN_EVIDENCE_CHARS && r.evidence.length <= MAX_EVIDENCE_CHARS)
      .sort((a, b) => b.evidence.length - a.evidence.length)[0];
    if (!pick) continue;
    candidates.push(pick);
  }
  // Sort deterministically (by judgmentId) then round-robin cap per court for diversity, matching v1's stated method.
  candidates.sort((a, b) => a.judgmentId.localeCompare(b.judgmentId));
  const perCourtCap = 12;
  const selected: HoldingRow[] = [];
  for (const c of candidates) {
    const n = byCourtCount.get(c.court) ?? 0;
    if (n >= perCourtCap) continue;
    if (selected.length >= TARGET_NEW_CASES) break;
    byCourtCount.set(c.court, n + 1);
    selected.push(c);
  }
  console.log(`selected ${selected.length} new candidates across ${byCourtCount.size} courts (pre-verification)`);

  const sql = postgres(url, { ssl: sslFor(url), max: 3 });
  try {
    const allCheckIds = [...new Set([...v1.cases.map((c) => c.authority_id), ...selected.map((c) => c.judgmentId)])];

    const inbound = await sql<{ cited_judgment_id: string; n: number }[]>`
      SELECT cited_judgment_id::text, count(DISTINCT citing_judgment_id)::int AS n
      FROM judgment_citations
      WHERE cited_judgment_id = ANY(${allCheckIds}::uuid[])
      GROUP BY 1
    `;
    const inboundMap = new Map(inbound.map((r) => [r.cited_judgment_id, r.n]));
    console.log(`inbound-citation check: ${inbound.length} of ${allCheckIds.length} ids have >=1 inbound citation`);

    const idRows = await sql<{ id: string; case_title: string; script_quality: string | null; text_quality: string | null }[]>`
      SELECT id::text, case_title, script_quality::text, text_quality::text
      FROM judgments
      WHERE id = ANY(${allCheckIds}::uuid[])
    `;
    const byId = new Map(idRows.map((r) => [r.id, r]));
    console.log(`identity check: ${idRows.length} of ${allCheckIds.length} ids resolve in judgments`);

    const staging = await sql<{ source_object_id: string }[]>`
      SELECT DISTINCT source_object_id::text
      FROM document_vector_staging
      WHERE source_object_id = ANY(${allCheckIds}::uuid[])
    `;
    const stagedSet = new Set(staging.map((s) => s.source_object_id));
    console.log(`reachability check: ${stagedSet.size} of ${allCheckIds.length} ids have a staged document vector`);

    function buildCase(id: string, court: string, year: number, evidence: string, seq: number): V1Case | { rejected: string } {
      const inboundN = inboundMap.get(id) ?? 0;
      if (inboundN > 0) return { rejected: `INBOUND_CITATION_FAIL: ${inboundN} citing judgment(s) found live` };
      const live = byId.get(id);
      if (!live) return { rejected: 'AUTHORITY_IDENTITY_FAIL: id no longer resolves in judgments' };
      if (mojibakeCount(evidence) > 5) return { rejected: 'TEXT_USABLE_FAIL: >5 control chars in evidence text' };
      return {
        query_id: `UAG2-${String(seq).padStart(3, '0')}`,
        gold_provenance_type: 'HOLDING_DERIVED',
        generated: false,
        authority_id: id,
        court,
        year,
        query: evidence,
        primary_evidence: evidence,
        case_family: 'holding',
        extraction_model: 'deepseek-v4-flash-0731',
        allowed_feature_families: ALLOWED,
        prohibited_feature_families: PROHIBITED,
        note: `zero inbound citations, verified live against judgment_citations at V2 build time (case_title="${live.case_title}", script_quality=${live.script_quality ?? 'null'}, staged_vector=${stagedSet.has(id)})`,
      };
    }

    let seq = 1;
    const finalCases: V1Case[] = [];
    const rejectedV1: Array<{ authority_id: string; reason: string }> = [];
    const rejectedNew: Array<{ authority_id: string; reason: string }> = [];

    for (const c of v1.cases) {
      const built = buildCase(c.authority_id, c.court, c.year, c.query, seq);
      if ('rejected' in built) {
        rejectedV1.push({ authority_id: c.authority_id, reason: built.rejected });
        continue;
      }
      finalCases.push(built);
      seq++;
    }
    for (const c of selected) {
      const built = buildCase(c.judgmentId, c.court, c.year, c.evidence, seq);
      if ('rejected' in built) {
        rejectedNew.push({ authority_id: c.judgmentId, reason: built.rejected });
        continue;
      }
      finalCases.push(built);
      seq++;
    }

    const byCourt: Record<string, number> = {};
    for (const c of finalCases) byCourt[c.court] = (byCourt[c.court] ?? 0) + 1;

    const doc = {
      version: 2,
      generatedAt: new Date().toISOString(),
      generatedBy: 'NEW3',
      purpose: 'P3 of the mission brief: substantially expand the uncited-authority gold class. Every row here has ZERO inbound citations verified live, so no measurement built from it can be won by a citation-graph shortcut.',
      rebuiltFrom: 'docs/ai/new3-uncited-authority-gold.json (v1, 26 cases) -- re-validated, not silently mutated; v1 left on disk untouched',
      population: {
        source: 'docs/ai/embedding-manifests/legal-objects/holdings.jsonl (LCC LEGAL_OBJECT_VECTOR_MANIFEST_READY v2, bus 0892)',
        distinctJudgmentsInHoldingPopulation: byJudgment.size,
        newCandidatesConsidered: selected.length,
        newCandidatesPromoted: finalCases.length - (v1.cases.length - rejectedV1.length),
        v1CasesReVerified: v1.cases.length,
        v1CasesStillValid: v1.cases.length - rejectedV1.length,
        v1CasesQuarantined: rejectedV1.length,
        verificationMethod: 'SELECT cited_judgment_id, count(DISTINCT citing_judgment_id) FROM judgment_citations WHERE cited_judgment_id = ANY(ids) GROUP BY 1 -- run live this session against judgment_citations, batched over all v1+candidate ids in one query',
        samplingMethod: 'one holding per judgment (longest evidence 100-600 chars), deterministic sort by judgmentId, capped at 12 per court for diversity, excluding all 26 v1 authority_ids',
      },
      caveat:
        'Same construction as v1: query text IS a substring of the target (own_text_span), so success rates are an upper bound, not a paraphrase-robustness measurement. NEW1 gold-contract.ts already PROHIBITS sparse_lexical and CAUTIONS dense_similarity for this provenance type -- unchanged.',
      reachabilityWarning: `CHECKED LIVE this session: ${stagedSet.size} of ${finalCases.length + rejectedV1.length + rejectedNew.length} candidate ids have a row in document_vector_staging. Compare v1's 0 of 26 (bus, 20 Aug) -- if this number is now >0, GPU embedding (bus 0823, 100,489 vectors complete) may have started reaching zero-inbound authorities; verify against the value-ordered embedding queue's actual policy (bus 0776) before assuming citation-graph value-ordering has changed.`,
      quarantine: { v1: rejectedV1, newCandidates: rejectedNew },
      byCourt,
      cases: finalCases,
    };

    const outPath = new URL('../../../docs/ai/new3-uncited-authority-gold-v2.json', import.meta.url);
    writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);

    console.log(`\nV2: ${finalCases.length} cases (${v1.cases.length - rejectedV1.length} re-verified from v1 + ${finalCases.length - (v1.cases.length - rejectedV1.length)} new)`);
    console.log(`v1 quarantined: ${rejectedV1.length}`, rejectedV1);
    console.log(`new candidates rejected: ${rejectedNew.length}`);
    console.log('by court:', byCourt);
    console.log(`wrote docs/ai/new3-uncited-authority-gold-v2.json`);
  } finally {
    await sql.end();
  }
}

await main();
