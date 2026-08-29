#!/usr/bin/env node
/**
 * NEW1 R9 — turn a NEW2 handoff into a walkable batch file, WITHOUT a global census.
 *
 *   node services/harness/src/delta-manifest.mjs --since 2026-08-27
 *   node services/harness/src/delta-manifest.mjs --ids path/to/ids.txt
 *   node services/harness/src/delta-manifest.mjs --since 2026-08-27 --dry-run
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND MANIFEST PATH EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `doc-vector-batches` is the right tool for the corpus and the wrong tool for a
 * delta. It reads `embedding_content_representative`, and it REFUSES — correctly
 * — when that table was built under a different eligibility definition than the
 * one deployed. So a 50,994-row handoff cannot be manifested until a 2 h 17 m
 * full census has run, which makes every small delta wait on a large job. R9 §8
 * says the opposite: *"Do not require a new global census before processing every
 * small delta; support a normal incremental queue plus occasional full
 * reconciliation."*
 *
 * This is the incremental queue. It is bounded by the delta, not by the corpus,
 * and it touches `judgments` only through `id = ANY(...)` or the `created_at`
 * index. Nothing here replaces the full reconciliation; the two answer different
 * questions and the census stays the authority on the population.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELIGIBILITY IS READ FROM THE DEPLOYED VIEW, NEVER RE-DERIVED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A copy of a predicate is a copy that drifts, and this repository has three
 * recorded instances of exactly that costing a population. So the filter here is
 * `semantic_tier <> 'NOT_ELIGIBLE'` plus the same band set the Tier-A manifests
 * use, read off `judgment_embedding_eligibility` — and the run records the live
 * `pg_get_viewdef` hash so the batch can be re-identified against the contract it
 * was cut under.
 *
 * Bail orders are INCLUDED. `doc-vector-batches` excludes them because the
 * representative table predates migration 0066; the deployed view has admitted
 * them as `BAIL_ORDER_REACHABLE` since 21 Aug, on this lane's own measurement
 * that 12 of NEW3's 250 citation-verified gold authorities are bail orders a
 * judge really cited. A delta path that re-imposed the old exclusion would be a
 * stale skip list on day one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEDUP WITHOUT THE REPRESENTATIVE TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The corpus holds one common order disposing of forty writ petitions forty
 * times, byte-identical. The census collapses those to one representative. A
 * delta cannot consult a stale census for that, so it does the same collapse
 * from first principles, in two steps that are both exact and neither of which
 * is fuzzy:
 *
 *   1. WITHIN the delta — group by `content_hash`, keep the lowest id, and carry
 *      `memberCount` so the batch says how many identities the vector stands for.
 *   2. AGAINST what exists — if any judgment sharing that `content_hash` is
 *      already in `new1_doc_vector_stage`, skip: the vector exists and the map
 *      back is `WHERE content_hash = $1` on `judgments_content_hash_idx`.
 *
 * No case identity is lost by either step. Every petition keeps its `judgments`
 * row, its citation keys and its lexical index entry — which were never waiting
 * on this in the first place.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const SINCE = argOf('--since');
const IDS_FILE = argOf('--ids');
const LABEL = argOf('--label') ?? (SINCE ? 'since-' + SINCE : 'ids');
const DRY_RUN = process.argv.includes('--dry-run');
const OUT_DIR = argOf('--out') ?? 'docs/ai/new1-r9/delta';
/** Same band set as the Tier-A manifests. `brief` and `stub` are not Tier A. */
const BANDS = ['standard', 'full', 'substantial'];

if (!SINCE && !IDS_FILE) {
  console.error('one of --since <date> or --ids <file> is required');
  process.exit(2);
}

const sql = postgres(url, { ssl: false, max: 2, onnotice: () => {}, connection: { statement_timeout: 0 } });

try {
  const [viewRow] = await sql`SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def`;
  const definitionHash = createHash('sha256').update(viewRow.def).digest('hex').slice(0, 16);

  const ids = IDS_FILE
    ? readFileSync(IDS_FILE, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : null;

  // One query. The `DISTINCT ON (content_hash)` is the within-delta collapse and
  // the window function beside it is the member count — computed in the same
  // pass so the two can never disagree about which rows were grouped.
  const rows = await sql`
    WITH delta AS (
      SELECT j.id, j.content_hash, j.court, j.judgment_date
        FROM judgments j
       WHERE ${
         ids
           ? sql`j.id = ANY(${ids}::uuid[])`
           : // `::timestamptz`, NOT `::date`. This was `::date`, and the cast
             // silently truncated `--since 2026-08-27T13:04:10Z` to midnight, so
             // the incremental queue's one-minute window quietly became the whole
             // day: it asked for 339 rows and the manifest answered about 28,318.
             // A bare date still casts cleanly to midnight, so `--since 2026-08-27`
             // behaves exactly as documented and a timestamp now means what it says.
             sql`j.created_at >= ${SINCE}::timestamptz`
       }
    ),
    eligible AS (
      SELECT d.id, d.content_hash, d.court,
             EXTRACT(YEAR FROM d.judgment_date)::int AS judgment_year,
             e.text_length, e.value_band, e.semantic_tier
        FROM delta d
        JOIN judgment_embedding_eligibility e ON e.id = d.id
       WHERE e.semantic_tier <> 'NOT_ELIGIBLE'
         AND e.text_safety <> 'UNSAFE_VERIFIED'
         AND e.value_band = ANY(${BANDS})
    ),
    counted AS (
      SELECT *, count(*) OVER (PARTITION BY content_hash)::int AS member_count
        FROM eligible
    )
    SELECT DISTINCT ON (content_hash)
           id AS "judgmentId", content_hash AS "contentHash", member_count AS "memberCount",
           court, judgment_year AS "year", text_length AS "textLength",
           value_band AS "valueBand", semantic_tier AS "semanticTier"
      FROM counted
     ORDER BY content_hash, id`;

  // AGAINST what exists: a content hash any staged judgment already carries.
  const hashes = rows.map((r) => r.contentHash);
  const staged = hashes.length
    ? await sql`
        SELECT DISTINCT j.content_hash
          FROM new1_doc_vector_stage s
          JOIN judgments j ON j.id = s.judgment_id
         WHERE j.content_hash = ANY(${hashes}::text[])`
    : [];
  const covered = new Set(staged.map((r) => r.content_hash));
  const emit = rows.filter((r) => !covered.has(r.contentHash));

  /**
   * EVERY ROW IN THE WINDOW GETS A NAME — 29 Aug 2026.
   *
   * The manifest used to report three numbers — `eligibleRepresentatives`,
   * `alreadyCoveredByContentHash`, `emitted` — and `deltaRowsConsidered: null`.
   * The queue's ledger then printed `pending` (every judgment in the window)
   * beside `alreadyCovered`, and the difference was a RESIDUAL NOBODY NAMED:
   * "pending 57 / covered 42" and later "73 / 49" were read as a ledger gap and
   * explained by inference. Inference is exactly what a coverage claim may not
   * rest on — an unnamed residual is indistinguishable from a silent skip, and
   * this lane has already lost one frontier to a state that had no name.
   *
   * So the window is decomposed EXHAUSTIVELY and DISJOINTLY here, in the order
   * the walk itself applies its rules:
   *
   *   EMBEDDED                      already has its own row in the stage
   *   REFUSED_NO_ELIGIBILITY_ROW    no row in the deployed eligibility view
   *   REFUSED_NOT_ELIGIBLE          semantic_tier = 'NOT_ELIGIBLE'
   *   REFUSED_TEXT_UNSAFE           text_safety  = 'UNSAFE_VERIFIED'
   *   REFUSED_BAND_EXCLUDED         value_band outside the Tier-A band set
   *   CONTENT_HASH_ALREADY_COVERED  a staged judgment carries the same content_hash
   *   QUEUED                        eligible, uncovered — emitted, or collapsed
   *                                 onto the representative that was emitted
   *
   * The refusal names are the view's own columns, never a guess: a reason this
   * file cannot read off the view is not a reason it is allowed to invent.
   *
   * The predicate is spelled twice — once to emit, once to classify — so the
   * check below is not decoration. `queuedMembers` recomputed from the
   * classification must equal the member count the emit path produced; if the
   * two spellings ever drift, the manifest says so instead of quietly
   * disagreeing with the ledger it feeds.
   */
  const [decomp] = await sql`
    WITH delta AS (
      SELECT j.id, j.content_hash
        FROM judgments j
       WHERE ${
         ids
           ? sql`j.id = ANY(${ids}::uuid[])`
           : sql`j.created_at >= ${SINCE}::timestamptz`
       }
    ),
    marked AS (
      SELECT d.id,
             e.id IS NOT NULL AS has_elig,
             e.semantic_tier, e.text_safety, e.value_band,
             EXISTS (SELECT 1 FROM new1_doc_vector_stage s WHERE s.judgment_id = d.id) AS self_staged,
             EXISTS (SELECT 1 FROM new1_doc_vector_stage s
                       JOIN judgments jj ON jj.id = s.judgment_id
                      WHERE jj.content_hash = d.content_hash)                        AS hash_staged
        FROM delta d
        LEFT JOIN judgment_embedding_eligibility e ON e.id = d.id
    )
    SELECT count(*)::int AS considered,
           count(*) FILTER (WHERE self_staged)::int AS "EMBEDDED",
           count(*) FILTER (WHERE NOT self_staged AND NOT has_elig)::int AS "REFUSED_NO_ELIGIBILITY_ROW",
           count(*) FILTER (WHERE NOT self_staged AND has_elig
                              AND semantic_tier = 'NOT_ELIGIBLE')::int AS "REFUSED_NOT_ELIGIBLE",
           count(*) FILTER (WHERE NOT self_staged AND has_elig
                              AND semantic_tier <> 'NOT_ELIGIBLE'
                              AND text_safety = 'UNSAFE_VERIFIED')::int AS "REFUSED_TEXT_UNSAFE",
           count(*) FILTER (WHERE NOT self_staged AND has_elig
                              AND semantic_tier <> 'NOT_ELIGIBLE'
                              AND text_safety <> 'UNSAFE_VERIFIED'
                              AND NOT (value_band = ANY(${BANDS})))::int AS "REFUSED_BAND_EXCLUDED",
           count(*) FILTER (WHERE NOT self_staged AND has_elig
                              AND semantic_tier <> 'NOT_ELIGIBLE'
                              AND text_safety <> 'UNSAFE_VERIFIED'
                              AND value_band = ANY(${BANDS})
                              AND hash_staged)::int AS "CONTENT_HASH_ALREADY_COVERED",
           count(*) FILTER (WHERE NOT self_staged AND has_elig
                              AND semantic_tier <> 'NOT_ELIGIBLE'
                              AND text_safety <> 'UNSAFE_VERIFIED'
                              AND value_band = ANY(${BANDS})
                              AND NOT hash_staged)::int AS "QUEUED"
      FROM marked`;

  const { considered, ...states } = decomp;
  const namedTotal = Object.values(states).reduce((a, v) => a + Number(v), 0);
  const queuedMembers = emit.reduce((a, r) => a + r.memberCount, 0);
  const residualCheck = {
    considered,
    named: namedTotal,
    unnamed: considered - namedTotal,
    queuedMembersFromClassification: Number(states.QUEUED),
    queuedMembersFromEmitPath: queuedMembers,
    predicatesAgree: Number(states.QUEUED) === queuedMembers,
  };

  const lines = emit.map((r) => JSON.stringify(r)).join('\n') + (emit.length ? '\n' : '');
  const idsHash = createHash('sha256')
    .update(emit.map((r) => r.judgmentId).join(','))
    .digest('hex')
    .slice(0, 16);

  const manifest = {
    kind: 'new1_delta_manifest',
    label: LABEL,
    selector: ids ? { ids: ids.length } : { since: SINCE },
    definitionHash,
    bands: BANDS,
    deltaRowsConsidered: considered,
    states,
    residualCheck,
    eligibleRepresentatives: rows.length,
    alreadyCoveredByContentHash: rows.length - emit.length,
    emitted: emit.length,
    membersRepresented: queuedMembers,
    idsHash,
    byTier: Object.fromEntries(
      [...emit.reduce((m, r) => m.set(r.semanticTier, (m.get(r.semanticTier) ?? 0) + 1), new Map())],
    ),
    byBand: Object.fromEntries(
      [...emit.reduce((m, r) => m.set(r.valueBand, (m.get(r.valueBand) ?? 0) + 1), new Map())],
    ),
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
  };

  if (!DRY_RUN) {
    mkdirSync(new URL(OUT_DIR + '/', ROOT), { recursive: true });
    writeFileSync(new URL(OUT_DIR + '/delta-' + LABEL + '.jsonl', ROOT), lines);
    writeFileSync(
      new URL(OUT_DIR + '/delta-' + LABEL + '.manifest.json', ROOT),
      JSON.stringify(manifest, null, 2) + '\n',
    );
  }
  console.log(JSON.stringify(manifest, null, 2));
  if (!DRY_RUN) {
    console.log('\nbatch file: ' + OUT_DIR + '/delta-' + LABEL + '.jsonl');
    console.log('walk it with:');
    console.log(
      '  BATCH_FILE=<abs path> STAGE_LOG_PATH=../../../docs/ai/new1-r9/delta/stage-embed-' +
        LABEL +
        '.log \\\n    SUMMARY_PATH_REL=../../../docs/ai/new1-r9/delta/summary-' +
        LABEL +
        '.json npx tsx src/doc-vector-embed.mjs',
    );
  }
} finally {
  await sql.end({ timeout: 10 });
}
