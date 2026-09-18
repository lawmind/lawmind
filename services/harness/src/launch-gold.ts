/**
 * NEW1 — LAUNCH_BENCHMARK_V1: the fixed, class-separated gold for public V1.
 *
 * WHAT THIS IS
 * ------------
 * A CONSOLIDATION, not a new gold. Every row here already existed in one of
 * NEW3's four verified files; this module decides which launch question each
 * row answers, applies the product's own input contract to it, and freezes the
 * result under a content hash so that two runs a week apart are comparable.
 *
 * WHY A FREEZE HASH AND NOT JUST A FILE
 * -------------------------------------
 * A benchmark that quietly gains rows between runs turns every comparison into
 * an argument about the denominator. `frozenHash` is computed over the ORDERED
 * (queryId, class, query, goldAuthorityId) tuples and nothing else — not the
 * enrichment, which is allowed to change as the corpus improves, and not the
 * measured results. So a rerun after a corpus change is still the same
 * benchmark, and a rerun after a gold change is loudly a different one.
 *
 * THE CLASSES, AND WHY THEY ARE NEVER POOLED
 * ------------------------------------------
 * P1 is explicit that exact citation/title performance must not be pooled with
 * semantic retrieval, and the reason is mechanical rather than stylistic: the
 * first two are answered by an exact lookup pinned ahead of the ranker
 * (`retrieve.ts`), and the rest are answered by a fused dense+sparse ranking.
 * A single pooled number is the average of a lookup and a search, which is a
 * number about neither.
 *
 *   citation             a citation string an advocate types verbatim
 *   case_title           a case name, possibly partial
 *   nl_doctrine          a typed legal proposition, in an advocate's own words
 *   fact_passage         a passage of facts / a legal issue, as written
 *   statute_section      a section-and-act question
 *   bns_transition       IPC/CrPC/Evidence -> BNS/BNSS/BSA, incl. unmapped
 *   adverse_currentness  the law has moved; is the product safe about it
 *
 * THE 500-CHARACTER FINDING, WHICH CHANGED WHAT GOES IN
 * ----------------------------------------------------
 * `searchRequest` caps `query` at 500 characters. Measured against the gold:
 *
 *   sem:exact_citation   229 rows   median   16   over-cap   0    (0.0%)
 *   sem:case_title       229 rows   median   50   over-cap   0    (0.0%)
 *   sem:proposition      229 rows   median  818   over-cap 224   (97.8%)
 *   non:legal_issue      200 rows   median  193   over-cap   2    (1.0%)
 *   non:proposition      200 rows   median  221   over-cap   1    (0.5%)
 *   unc:holding          175 rows   median  216   over-cap   1    (0.6%)
 *
 * **97.8% of `sem:proposition` cannot be submitted to the product at all.**
 * Those rows are verbatim 800-character extracts of a citing judgment's own
 * words — an excellent probe of a vector index and not a thing any advocate
 * types. Scoring them as product failures would blame the ranker for an input
 * the API rejects at the door; truncating them to 500 would invent a query
 * nobody wrote and quietly change what the gold means.
 *
 * So they are EXCLUDED from the launch classes and kept, whole, as a separate
 * `verbatim_passage_diagnostic` set. It is still worth running — it is the
 * shape that hung the sparse arm for 32 minutes (P4) — but it is not a launch
 * number and this file will not let it become one.
 *
 * The three individually-over-cap rows in the other sets are excluded the same
 * way and named, because three silent drops is how a denominator rots.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The product's own limit, read from the shape the API validates against. */
export const PRODUCTION_QUERY_MAX_CHARS = 500;

export type LaunchClass =
  | 'citation'
  | 'case_title'
  | 'nl_doctrine'
  | 'fact_passage'
  | 'statute_section'
  | 'bns_transition'
  | 'adverse_currentness';

/**
 * Which classes are answered by an EXACT route and which by ranked retrieval.
 *
 * Consumers use this to refuse to pool them. It is data rather than a comment
 * because a comment cannot stop a reporting loop from summing the wrong rows.
 */
export const EXACT_ROUTE_CLASSES: readonly LaunchClass[] = ['citation', 'case_title'];
export const SEMANTIC_ROUTE_CLASSES: readonly LaunchClass[] = ['nl_doctrine', 'fact_passage'];

export type LaunchGoldRow = {
  queryId: string;
  launchClass: LaunchClass;
  query: string;
  goldAuthorityId: string;
  /** The verified text the gold rests on. Never the model's summary of it. */
  primaryEvidence: string | null;
  goldProvenanceType: string;
  /** Rows sharing this must never be split across a train/test boundary. */
  caseFamily: string;
  /** Feature families a scorer may NOT use on this row. Enforced, not advisory. */
  prohibitedFeatureFamilies: string[];
  /** Which NEW3 file this row came from, so a correction can find it again. */
  sourceFile: string;
};

/** A row that exists in the gold and cannot be asked of the product. */
export type ExcludedRow = {
  queryId: string;
  sourceFile: string;
  reason: 'OVER_PRODUCTION_QUERY_LIMIT' | 'NO_GOLD_AUTHORITY' | 'EMPTY_QUERY';
  queryChars: number;
};

const read = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(rel, `file://${ROOT.replaceAll('\\', '/')}`), 'utf8')) as Record<
    string,
    unknown
  >;

type AnyRow = Record<string, unknown>;

const str = (r: AnyRow, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
};

const families = (r: AnyRow): string[] => {
  const v = r['prohibited_feature_families'];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
};

/**
 * Build the fixed set.
 *
 * Deterministic: same inputs, same order, same hash. The ordering is
 * (class, queryId) rather than file order, because file order is an accident of
 * how NEW3 generated the rows and would reshuffle the hash on an unrelated
 * regeneration.
 */
export function buildLaunchGold(): {
  rows: LaunchGoldRow[];
  excluded: ExcludedRow[];
  diagnosticVerbatim: LaunchGoldRow[];
  frozenHash: string;
  byClass: Record<string, number>;
} {
  const rows: LaunchGoldRow[] = [];
  const excluded: ExcludedRow[] = [];
  const diagnosticVerbatim: LaunchGoldRow[] = [];

  const push = (row: LaunchGoldRow, into: LaunchGoldRow[] = rows): void => {
    if (row.query.trim().length === 0) {
      excluded.push({
        queryId: row.queryId,
        sourceFile: row.sourceFile,
        reason: 'EMPTY_QUERY',
        queryChars: 0,
      });
      return;
    }
    if (row.goldAuthorityId.length === 0) {
      excluded.push({
        queryId: row.queryId,
        sourceFile: row.sourceFile,
        reason: 'NO_GOLD_AUTHORITY',
        queryChars: row.query.length,
      });
      return;
    }
    if (row.query.length > PRODUCTION_QUERY_MAX_CHARS) {
      excluded.push({
        queryId: row.queryId,
        sourceFile: row.sourceFile,
        reason: 'OVER_PRODUCTION_QUERY_LIMIT',
        queryChars: row.query.length,
      });
      return;
    }
    into.push(row);
  };

  // ── NEW3 semantic expansion v2: citation, title, and the verbatim passages ──
  const semFile = 'docs/ai/new3-semantic-expansion-gold-v2.json';
  const sem = read(`./${semFile}`);
  for (const r of (sem['rows'] as AnyRow[]) ?? []) {
    const queryType = String(r['queryType'] ?? '');
    const gold = String(r['goldJudgmentId'] ?? '');
    const base = {
      queryId: String(r['id'] ?? ''),
      query: String(r['query'] ?? ''),
      goldAuthorityId: gold,
      // The sem file carries no `primary_evidence` key — recorded as null rather
      // than back-filled from the query text, which would make the query its own
      // evidence and prove nothing. S4 already logged this as a gap in the file.
      primaryEvidence: str(r, 'primary_evidence'),
      goldProvenanceType: String(r['provenance'] ?? 'CITATION_EDGE_DERIVED'),
      // Three rows built from ONE authority (its citation, its title, its
      // proposition) are one measurement, not three.
      caseFamily: gold,
      prohibitedFeatureFamilies: families(r),
      sourceFile: semFile,
    };
    if (queryType === 'exact_citation') push({ ...base, launchClass: 'citation' });
    else if (queryType === 'case_title') push({ ...base, launchClass: 'case_title' });
    else if (queryType === 'proposition') {
      /**
       * ALL of them leave the launch classes, not just the 224 over the cap.
       *
       * The first cut kept the 5 that happened to fit in 500 characters, and
       * that was wrong for a reason the length test cannot see: these queries
       * are the TARGET JUDGMENT'S OWN WORDS, lifted verbatim. `gold-contract.ts`
       * already names that construction an upper bound. Five upper-bound rows
       * mixed into 200 typed-doctrine rows do not average out — they make the
       * class 2.5% easier than the product it claims to measure, and the
       * contamination is invisible in the headline number.
       *
       * The exclusion reason is CONSTRUCTION. Length is a symptom of it.
       */
      diagnosticVerbatim.push({ ...base, launchClass: 'nl_doctrine' });
    }
  }

  // ── NEW3 non-citation gold: typed doctrine and written legal issues ─────────
  const nonFile = 'docs/ai/new3-noncitation-gold.json';
  const non = read(`./${nonFile}`);
  for (const r of (non['cases'] as AnyRow[]) ?? []) {
    const cls = String(r['queryClass'] ?? '');
    push({
      queryId: String(r['query_id'] ?? ''),
      launchClass: cls === 'legal_issue' ? 'fact_passage' : 'nl_doctrine',
      query: String(r['query'] ?? ''),
      goldAuthorityId: String(r['authority_id'] ?? ''),
      primaryEvidence: str(r, 'primary_evidence'),
      goldProvenanceType: String(r['gold_provenance_type'] ?? ''),
      caseFamily: str(r, 'case_family') ?? String(r['authority_id'] ?? ''),
      prohibitedFeatureFamilies: families(r),
      sourceFile: nonFile,
    });
  }

  // ── NEW3 uncited-authority gold: holdings of judgments nobody has cited ─────
  //
  // These belong in `fact_passage` and NOT in `nl_doctrine`, and the difference
  // is the retrieval job rather than the wording. An uncited authority has no
  // inbound edge to ride, so the only route to it is the text itself. Pooling it
  // with cited doctrine would let the easier population carry the harder one.
  const uncFile = 'docs/ai/new3-uncited-authority-gold-v2.json';
  const unc = read(`./${uncFile}`);
  for (const r of (unc['cases'] as AnyRow[]) ?? []) {
    push({
      queryId: String(r['query_id'] ?? ''),
      launchClass: 'fact_passage',
      query: String(r['query'] ?? ''),
      goldAuthorityId: String(r['authority_id'] ?? ''),
      primaryEvidence: str(r, 'primary_evidence'),
      goldProvenanceType: String(r['gold_provenance_type'] ?? ''),
      caseFamily: str(r, 'case_family') ?? String(r['authority_id'] ?? ''),
      prohibitedFeatureFamilies: families(r),
      sourceFile: uncFile,
    });
  }

  rows.sort((a, b) => (a.launchClass + a.queryId).localeCompare(b.launchClass + b.queryId));
  diagnosticVerbatim.sort((a, b) => a.queryId.localeCompare(b.queryId));
  excluded.sort((a, b) => a.queryId.localeCompare(b.queryId));

  const h = createHash('sha256');
  for (const r of rows) h.update(`${r.queryId} ${r.launchClass} ${r.query} ${r.goldAuthorityId}\n`);
  const frozenHash = h.digest('hex').slice(0, 16);

  const byClass: Record<string, number> = {};
  for (const r of rows) byClass[r.launchClass] = (byClass[r.launchClass] ?? 0) + 1;

  return { rows, excluded, diagnosticVerbatim, frozenHash, byClass };
}
