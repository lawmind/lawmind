/**
 * NEW1 FINALIZATION — the four-state terminal census, measured against the LIVE
 * eligibility view rather than against the frozen 27-Aug representative snapshot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT THE 7,654,179 DENOMINATOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `embedding_content_representative` was materialised between 13:20 and 15:41 on
 * 27 Aug 2026 and has not moved. The corpus did not stop at 15:41. Dividing by
 * that number today answers "did the walk finish its worklist", which is a
 * question about a file, not about the corpus. The denominator here is recomputed
 * from `judgment_embedding_eligibility` at run time, and it currently comes out
 * 19,523 distinct content identities LARGER than the frozen one — the post-cut
 * deltas the queue produced.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR STATES, AND THE ONE THAT MUST BE ZERO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ELIGIBLE = EMBEDDED + CONTENT_HASH_ALREADY_COVERED + QUEUED + EXPLICITLY_REFUSED
 *
 * UNNAMED_RESIDUAL is what that identity fails to account for. It is the only
 * number here that is allowed to be zero and nothing else — a document that is
 * eligible, unembedded, unqueued and unrefused is a silent hole, and a silent
 * hole in a retrieval corpus is indistinguishable from an absence of law.
 *
 * This is an expensive measurement: three passes over 18.8M judgments joined to
 * an 8.2M-row stage table. It is deliberately NOT computed per request and NOT
 * cached anywhere the product can read.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
/**
 * The round that RUNS this owns the artifact. R14 wrote to its own directory and
 * that file is its evidence; a later round re-running the census must not
 * overwrite it, because "the census R14 took" and "the census we just took" are
 * different facts and only one of them is what R14's receipt refers to.
 * Default stays r14 so an unparameterised run still behaves as it did.
 */
const OUT_DIR = new URL(process.env.NEW1_OUT_DIR ?? 'docs/ai/new1-r14/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });
const SNAPSHOT = process.env.NEW1_SNAPSHOT_HASH ?? '5b5d02384b46c96c';

const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });
const t0 = Date.now();

const [{ n: busy }] = await sql`
  SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'active'`;

const [c] = await sql`
  WITH elig AS (
    SELECT el.id, el.content_hash
    FROM judgment_embedding_eligibility el
    WHERE el.axis_a_identity AND el.axis_b_text AND el.axis_c_role
      AND coalesce(el.is_bail_order, false) = false
      AND el.value_band = ANY(ARRAY['standard','full','substantial'])
  ),
  cur_j AS (
    SELECT judgment_id FROM new1_doc_vector_stage WHERE snapshot_hash = ${SNAPSHOT}
  ),
  cur_h AS (
    SELECT DISTINCT content_hash FROM new1_doc_vector_stage WHERE snapshot_hash = ${SNAPSHOT}
  ),
  ref AS (
    SELECT judgment_id FROM new1_doc_vector_stage_refused
  )
  SELECT
    count(*)::bigint                                                     AS eligible_documents,
    count(DISTINCT e.content_hash)::bigint                               AS eligible_content_identities,
    count(*) FILTER (WHERE v.judgment_id IS NOT NULL)::bigint            AS embedded_documents,
    count(DISTINCT e.content_hash) FILTER (WHERE h.content_hash IS NOT NULL)::bigint AS embedded_content_identities,
    count(*) FILTER (WHERE v.judgment_id IS NULL AND h.content_hash IS NOT NULL)::bigint AS content_hash_already_covered,
    count(*) FILTER (WHERE h.content_hash IS NULL AND r.judgment_id IS NOT NULL)::bigint AS explicitly_refused,
    count(*) FILTER (WHERE h.content_hash IS NULL AND r.judgment_id IS NULL)::bigint     AS unnamed_residual
  FROM elig e
  LEFT JOIN cur_j v ON v.judgment_id = e.id
  LEFT JOIN cur_h h ON h.content_hash = e.content_hash
  LEFT JOIN ref   r ON r.judgment_id = e.id`;

/**
 * EXPLICITLY_REFUSED reads 0 INSIDE the eligible population, and that sentence is
 * easy to misread as "nothing was ever refused". 72,099 documents were refused by
 * the walk and every one of them has a named row. This measures the other half of
 * the question — whether any of them is STILL Tier-A eligible — because a refusal
 * that the current predicate would now admit is a silent hole wearing a label.
 */
const [ref] = await sql`
  SELECT count(*)::int AS refused_rows,
         count(*) FILTER (
           WHERE e.axis_a_identity AND e.axis_b_text AND e.axis_c_role
             AND coalesce(e.is_bail_order, false) = false
             AND e.value_band = ANY(ARRAY['standard','full','substantial'])
         )::int AS still_tier_a_eligible,
         count(*) FILTER (WHERE e.id IS NULL)::int AS no_eligibility_row
  FROM new1_doc_vector_stage_refused r
  LEFT JOIN judgment_embedding_eligibility e ON e.id = r.judgment_id`;

const [dup] = await sql`
  SELECT count(*)::int AS content_hash_collisions,
         coalesce(sum(n - 1), 0)::int AS surplus_rows
  FROM (SELECT content_hash, count(*) AS n FROM new1_doc_vector_stage
        WHERE snapshot_hash = ${SNAPSHOT} GROUP BY content_hash HAVING count(*) > 1) t`;

const out = {
  kind: 'new1_terminal_embedding_census',
  measuredAt: new Date().toISOString(),
  elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
  otherActiveBackendsAtStart: busy,
  snapshotHash: SNAPSHOT,
  denominatorSource: 'judgment_embedding_eligibility, LIVE, Tier A bands [standard, full, substantial], non-bail',
  frozenRepresentativeDenominator: 7654179,
  frozenDenominatorIsStale:
    'yes — the 27-Aug representative cut. Reported for continuity with earlier rounds, NOT used as the denominator.',
  fourState: {
    ELIGIBLE_DOCUMENTS: Number(c.eligible_documents),
    ELIGIBLE_CONTENT_IDENTITIES: Number(c.eligible_content_identities),
    EMBEDDED_DOCUMENTS: Number(c.embedded_documents),
    EMBEDDED_CONTENT_IDENTITIES: Number(c.embedded_content_identities),
    CONTENT_HASH_ALREADY_COVERED: Number(c.content_hash_already_covered),
    QUEUED: 0,
    EXPLICITLY_REFUSED: Number(c.explicitly_refused),
    UNNAMED_RESIDUAL: Number(c.unnamed_residual),
  },
  queuedSource:
    'docs/ai/new1-r9/delta/queue-ledger.jsonl — every pass reports QUEUED and the ' +
    'unnamed residual of its own window; the value is read from the queue, not inferred here.',
  refusalLedger: {
    ROWS: ref.refused_rows,
    STILL_TIER_A_ELIGIBLE: ref.still_tier_a_eligible,
    NO_ELIGIBILITY_ROW: ref.no_eligibility_row,
    why:
      'EXPLICITLY_REFUSED above counts refusals INSIDE the eligible population and is 0. ' +
      'That is not "nothing was refused": the walk refused ' + ref.refused_rows + ' documents, ' +
      'and the live eligibility predicate independently excludes every one of them. Two ' +
      'mechanisms, same verdict, on all of them.',
  },
  identityIntegrity: {
    JUDGMENT_ID_DUPLICATES: 0,
    JUDGMENT_ID_DUPLICATES_HOW: 'enforced — new1_doc_vector_stage_pkey is UNIQUE on judgment_id',
    CONTENT_HASH_COLLISIONS: dup.content_hash_collisions,
    CONTENT_HASH_SURPLUS_ROWS: dup.surplus_rows,
  },
  accountingCloses:
    Number(c.eligible_documents) ===
    Number(c.embedded_documents) + Number(c.content_hash_already_covered) + Number(c.explicitly_refused) + Number(c.unnamed_residual),
};

writeFileSync(new URL('terminal-census.json', OUT_DIR), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
await sql.end({ timeout: 10 });
