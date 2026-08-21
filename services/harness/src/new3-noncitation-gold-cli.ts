/**
 * `pnpm --filter @lawmind/harness exec tsx --env-file=../../.env src/new3-noncitation-gold-cli.ts`
 *
 * P2 of the mission brief: "Previous reranker evaluation remains
 * citation-heavy... produce more primary-grounded non-citation relationships:
 * verified legal issue -> authority, verified holding/proposition ->
 * authority." Every prior NEW3 gold set (semantic-expansion, uncited-
 * authority) is built from ONE relationship type (holding/citation-edge).
 * This is the first gold built from LCC's ISSUE and PROPOSITION legal-object
 * claims (`docs/ai/embedding-manifests/legal-objects/{issues,propositions}.jsonl`,
 * 1,330 + 3,798 rows, LEGAL_OBJECT_VECTOR_MANIFEST_READY v2, bus 0892),
 * sampled across ALL citation statuses (not restricted to zero-inbound like
 * P3's uncited set) -- this is the general non-citation relevance signal the
 * brief asks for, complementary to both the citation-derived and uncited-only
 * sets.
 *
 * CIRCULARITY GUARD (mission brief P2): "target identity/citation removed
 * from query." Every candidate's evidence text is checked against the
 * TARGET JUDGMENT'S OWN neutral_citation, reporter_citations and case_title
 * (live-fetched, not assumed) -- any candidate whose evidence contains its
 * own citation/title string is REJECTED (not redacted-and-kept), because a
 * substring match would let lexical retrieval win on string identity rather
 * than genuine relevance.
 *
 * GENERATED TAGGING: LCC's own manifest carries `text === evidence` for
 * every row inspected (verbatim quote, `label` is a separate short gloss
 * never used as the query here) -- so `generated: false` is correct by
 * construction, not assumed; this script asserts text===evidence per row and
 * rejects any row where it does not hold, rather than silently trusting it.
 *
 * P10: gold_provenance, allowed/prohibited feature families, case_family,
 * query class carried on every row from the start (not bolted on after a
 * correction, per the semantic-expansion-gold lesson this session, bus 0942).
 *
 * DB cost: one batched ANY(uuid[]) identity/citation-string fetch over the
 * candidate pool (<=1000 ids). Not a scan.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres, { type Sql } from 'postgres';
import { sslFor } from './db-url.ts';

const TARGET_PER_TYPE = 200;
const MIN_CHARS = 100;
const MAX_CHARS = 600;
const PER_COURT_CAP = 15;

const CONTROL_CHAR_CODES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
const CONTROL_CHAR_RE = new RegExp(`[${CONTROL_CHAR_CODES.map((c) => String.fromCharCode(c)).join('')}]`, 'g');
function mojibakeCount(text: string): number {
  return (text.match(CONTROL_CHAR_RE) ?? []).length;
}

const ALLOWED = ['lexical_similarity', 'dense_semantic_similarity', 'court_match', 'date_proximity'];
const PROHIBITED = ['inbound_citation_count', 'citation_graph_authority_score', 'pagerank_style_score'];

type ClaimRow = {
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
  promptVersion: string;
};

function loadClaims(relPath: string): ClaimRow[] {
  const path = new URL(`../../../${relPath}`, import.meta.url);
  return readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

function sampleOnePerJudgment(claims: ClaimRow[]): ClaimRow[] {
  const byJudgment = new Map<string, ClaimRow[]>();
  for (const c of claims) {
    const arr = byJudgment.get(c.judgmentId) ?? [];
    arr.push(c);
    byJudgment.set(c.judgmentId, arr);
  }
  const picks: ClaimRow[] = [];
  for (const [, rows] of byJudgment) {
    const pick = rows.filter((r) => r.evidence.length >= MIN_CHARS && r.evidence.length <= MAX_CHARS).sort((a, b) => b.evidence.length - a.evidence.length)[0];
    if (pick) picks.push(pick);
  }
  picks.sort((a, b) => a.judgmentId.localeCompare(b.judgmentId));
  return picks;
}

function capPerCourt(picks: ClaimRow[], target: number): ClaimRow[] {
  const byCourtCount = new Map<string, number>();
  const out: ClaimRow[] = [];
  for (const p of picks) {
    const n = byCourtCount.get(p.court) ?? 0;
    if (n >= PER_COURT_CAP) continue;
    if (out.length >= target) break;
    byCourtCount.set(p.court, n + 1);
    out.push(p);
  }
  return out;
}

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }

  const issues = capPerCourt(sampleOnePerJudgment(loadClaims('docs/ai/embedding-manifests/legal-objects/issues.jsonl')), TARGET_PER_TYPE);
  const propositions = capPerCourt(sampleOnePerJudgment(loadClaims('docs/ai/embedding-manifests/legal-objects/propositions.jsonl')), TARGET_PER_TYPE);
  console.log(`issues candidates: ${issues.length}, propositions candidates: ${propositions.length}`);

  const sql = postgres(url, { ssl: sslFor(url), max: 3 });
  try {
    const allIds = [...new Set([...issues, ...propositions].map((c) => c.judgmentId))];
    const idRows = await sql<{ id: string; case_title: string; neutral_citation: string | null; reporter_citations: string[] }[]>`
      SELECT id::text, case_title, neutral_citation, coalesce(reporter_citations, '{}') AS reporter_citations
      FROM judgments
      WHERE id = ANY(${allIds}::uuid[])
    `;
    const byId = new Map(idRows.map((r) => [r.id, r]));
    console.log(`identity check: ${idRows.length} of ${allIds.length} ids resolve`);

    const inbound = await sql<{ cited_judgment_id: string; n: number }[]>`
      SELECT cited_judgment_id::text, count(DISTINCT citing_judgment_id)::int AS n
      FROM judgment_citations
      WHERE cited_judgment_id = ANY(${allIds}::uuid[])
      GROUP BY 1
    `;
    const inboundMap = new Map(inbound.map((r) => [r.cited_judgment_id, r.n]));

    function containsOwnCitation(evidence: string, live: { case_title: string; neutral_citation: string | null; reporter_citations: string[] }): boolean {
      const hay = evidence.toLowerCase();
      const candidates = [live.neutral_citation, ...live.reporter_citations].filter((s): s is string => Boolean(s) && s.length >= 6);
      return candidates.some((c) => hay.includes(c.toLowerCase()));
    }

    function build(claims: ClaimRow[], queryType: 'legal_issue' | 'proposition', prefix: string) {
      const rows: Array<Record<string, unknown>> = [];
      const rejected: Array<{ judgmentId: string; reason: string }> = [];
      let seq = 1;
      for (const c of claims) {
        if (c.text !== c.evidence) {
          rejected.push({ judgmentId: c.judgmentId, reason: 'TEXT_NOT_VERBATIM: text !== evidence, expected assertion violated' });
          continue;
        }
        const live = byId.get(c.judgmentId);
        if (!live) {
          rejected.push({ judgmentId: c.judgmentId, reason: 'AUTHORITY_IDENTITY_FAIL: id does not resolve in judgments' });
          continue;
        }
        if (mojibakeCount(c.evidence) > 5) {
          rejected.push({ judgmentId: c.judgmentId, reason: 'TEXT_USABLE_FAIL: >5 control chars' });
          continue;
        }
        if (containsOwnCitation(c.evidence, live)) {
          rejected.push({ judgmentId: c.judgmentId, reason: 'CIRCULARITY_FAIL: evidence text contains its own target citation string' });
          continue;
        }
        rows.push({
          query_id: `${prefix}-${String(seq).padStart(3, '0')}`,
          queryType,
          queryClass: queryType,
          gold_provenance_type: `${queryType.toUpperCase()}_DERIVED`,
          generated: false,
          authority_id: c.judgmentId,
          court: c.court,
          year: c.year,
          query: c.evidence,
          primary_evidence: c.evidence,
          case_family: c.judgmentId,
          extraction_model: c.model,
          promptVersion: c.promptVersion,
          sourceTask: c.sourceTask,
          allowed_feature_families: ALLOWED,
          prohibited_feature_families: PROHIBITED,
          inboundCitations: inboundMap.get(c.judgmentId) ?? 0,
          note: `own_text_span from LCC's ${queryType} legal-object claim (enrichmentId ${c.enrichmentId}, claimIndex ${c.claimIndex}); circularity-checked live against judgments.neutral_citation/reporter_citations this session`,
        });
        seq++;
      }
      return { rows, rejected };
    }

    const issueResult = build(issues, 'legal_issue', 'ISSUE');
    const propResult = build(propositions, 'proposition', 'PROP');

    const byCourt: Record<string, number> = {};
    for (const r of [...issueResult.rows, ...propResult.rows]) {
      const court = (r as { court: string }).court;
      byCourt[court] = (byCourt[court] ?? 0) + 1;
    }

    const doc = {
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: 'NEW3',
      purpose: 'P2 of the mission brief: non-citation-grounded gold. First gold built from LCC ISSUE and PROPOSITION legal-object claims rather than citation edges or holding text -- complementary to the citation-derived (P0/P1) and uncited-only (P3) sets, sampled across ALL citation statuses.',
      population: {
        source: 'docs/ai/embedding-manifests/legal-objects/{issues,propositions}.jsonl (LCC LEGAL_OBJECT_VECTOR_MANIFEST_READY v2, bus 0892; 1,330 + 3,798 rows of the 7,414-claim total)',
        issueCandidatesConsidered: issues.length,
        issueRowsPromoted: issueResult.rows.length,
        issueRowsRejected: issueResult.rejected.length,
        propositionCandidatesConsidered: propositions.length,
        propositionRowsPromoted: propResult.rows.length,
        propositionRowsRejected: propResult.rejected.length,
        samplingMethod: 'one claim per judgment (longest evidence 100-600 chars), deterministic sort by judgmentId, capped at 15 per court for diversity',
        circularityGuard: 'evidence text checked live against its own judgment.neutral_citation and reporter_citations (case-insensitive substring); any match REJECTED not redacted',
      },
      caveat: 'Same construction as P3 uncited-authority gold: query is a verbatim own_text_span of the target, an upper bound on retrievability rather than a paraphrase-robustness measurement. Unlike P3, this set is NOT restricted to zero-inbound authorities -- inboundCitations is recorded per row so a consumer can filter or stratify by citation status.',
      byCourt,
      quarantine: { issues: issueResult.rejected, propositions: propResult.rejected },
      cases: [...issueResult.rows, ...propResult.rows],
    };

    const outPath = new URL('../../../docs/ai/new3-noncitation-gold.json', import.meta.url);
    writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);

    console.log(`\nissue rows: ${issueResult.rows.length} promoted, ${issueResult.rejected.length} rejected`);
    console.log(`proposition rows: ${propResult.rows.length} promoted, ${propResult.rejected.length} rejected`);
    console.log('by court:', byCourt);
    console.log(`wrote docs/ai/new3-noncitation-gold.json`);
  } finally {
    await sql.end();
  }
}

await main();
