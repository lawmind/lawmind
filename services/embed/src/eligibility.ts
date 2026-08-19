/**
 * The embedding eligibility contract, as code.
 *
 * The DEFINITION lives in the database — view `judgment_embedding_eligibility`,
 * migration `0056`. This module is the typed consumer side of it: the tier
 * predicates, the keyset walk, and the identity of the definition that produced
 * a given manifest.
 *
 * Prose, thresholds and the measured population:
 * `docs/ai/EMBEDDING_ELIGIBILITY_CONTRACT.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HASH IS TAKEN FROM THE DEPLOYED VIEW, NOT FROM THIS FILE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `pg_get_viewdef` returns Postgres's own normalised text of the view as it
 * actually exists. Hashing THAT rather than a string in this repo means a
 * manifest's identity tracks the definition that really selected its rows.
 *
 * Hashing a constant here would certify the file, which is precisely the thing
 * that cannot drift from itself. The failure it must catch is somebody replacing
 * the view in a session and re-running the selector — after which every measured
 * precision figure is about a definition nobody can reconstruct.
 */
import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';

/**
 * Bumped by hand when the CONTRACT changes meaning, not when the SQL is
 * reformatted. The hash catches the second; only a person can judge the first.
 */
export const CONTRACT_VERSION = 'v1';

export const TIERS = ['A', 'A_CORE'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Value bands per tier. The bands themselves live in the view; this is which of
 * them a tier accepts.
 *
 * Tier A is ~8.49M documents and A_CORE ~3.80M, projected from a 0.2% sample.
 * Both are offered on purpose: the choice between them is a retrieval-quality
 * decision and belongs to NEW1 with a measurement, not to LCC in a WHERE clause.
 */
const BANDS: Record<Tier, readonly string[]> = {
  A: ['standard', 'full', 'substantial'],
  A_CORE: ['full', 'substantial'],
};

export type EligibleRow = {
  id: string;
  court: string;
  judgmentDate: string;
  contentHash: string;
  textLength: number;
  valueBand: string;
  hcDocumentClass: string | null;
  scriptQuality: string | null;
};

/** `false` with a reason, rather than a thrown error, so a caller can report it. */
export type ViewCheck = { present: true; definitionHash: string } | { present: false; why: string };

/**
 * Confirm the view exists and take the hash of its deployed definition.
 *
 * Refuses honestly instead of falling back to an inline copy of the predicate.
 * A fallback would be a SECOND definition of eligibility, which is the one thing
 * this contract cannot have — two selectors that agree today and diverge on the
 * next migration, with manifests from both claiming the same version.
 */
export async function checkView(sql: Sql): Promise<ViewCheck> {
  const rows = await sql<{ def: string }[]>`
    SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def
  `.catch(() => [] as { def: string }[]);

  if (rows.length === 0 || !rows[0]?.def) {
    return {
      present: false,
      why:
        'view judgment_embedding_eligibility is absent — apply migration 0056. ' +
        'It is an ALTER on a live 15M-row table, so use ' +
        'scripts/apply-migration-online.mjs rather than running it directly.',
    };
  }
  return { present: true, definitionHash: createHash('sha256').update(rows[0].def).digest('hex').slice(0, 16) };
}

/**
 * One keyset page of a tier, ordered by `id`.
 *
 * KEYSET, never `OFFSET`. An offset walk re-reads every row it has already
 * skipped, so page 8,000 of a 15M-row corpus costs 8,000 pages of work to
 * produce one — the walk gets slower exactly as it gets further, which is the
 * shape that makes a long backfill never finish. `WHERE id > $cursor ORDER BY id`
 * is one index descent per page regardless of depth.
 *
 * `id` is a uuid, so the order is arbitrary. That is fine and deliberate for a
 * MANIFEST: it needs to enumerate a set exactly once, not in a useful order.
 * Recency ordering belongs to the chunk builder, which has a different job.
 */
export async function page(
  sql: Sql,
  tier: Tier,
  cursor: string | null,
  limit: number,
): Promise<EligibleRow[]> {
  const bands = BANDS[tier];
  return sql<EligibleRow[]>`
    SELECT
      id,
      court,
      judgment_date       AS "judgmentDate",
      content_hash        AS "contentHash",
      text_length         AS "textLength",
      value_band          AS "valueBand",
      hc_document_class   AS "hcDocumentClass",
      script_quality      AS "scriptQuality"
    FROM judgment_embedding_eligibility
    WHERE axis_a_identity
      AND axis_b_text
      AND axis_c_role
      -- Broken out rather than excluded by class: bail orders are practically
      -- useful and are not precedent, and which tier they belong in is a
      -- retrieval measurement nobody has made yet.
      AND coalesce(is_bail_order, false) = false
      AND value_band = ANY(${bands as string[]})
      ${cursor ? sql`AND id > ${cursor}::uuid` : sql``}
    ORDER BY id
    LIMIT ${limit}
  `;
}

/**
 * Documents in a tier that have NO chunks yet — the incremental population.
 *
 * The anti-join is against `judgment_chunks` (619,636 rows), probed through
 * `judgment_chunks_judgment_id_idx`, and it is bounded by the keyset page that
 * precedes it. That is the whole reason it is affordable: the existing embed CLI
 * runs the same idea as `NOT EXISTS (...) ORDER BY judgment_date DESC LIMIT n`
 * across all 14,973,372 judgments with no keyset bound, which is an unbounded
 * anti-join plus a sort before a single chunk is written.
 */
export async function pagePending(
  sql: Sql,
  tier: Tier,
  cursor: string | null,
  limit: number,
): Promise<EligibleRow[]> {
  const bands = BANDS[tier];
  return sql<EligibleRow[]>`
    SELECT
      e.id,
      e.court,
      e.judgment_date     AS "judgmentDate",
      e.content_hash      AS "contentHash",
      e.text_length       AS "textLength",
      e.value_band        AS "valueBand",
      e.hc_document_class AS "hcDocumentClass",
      e.script_quality    AS "scriptQuality"
    FROM judgment_embedding_eligibility e
    WHERE e.axis_a_identity
      AND e.axis_b_text
      AND e.axis_c_role
      AND coalesce(e.is_bail_order, false) = false
      AND e.value_band = ANY(${bands as string[]})
      ${cursor ? sql`AND e.id > ${cursor}::uuid` : sql``}
      AND NOT EXISTS (SELECT 1 FROM judgment_chunks c WHERE c.judgment_id = e.id)
    ORDER BY e.id
    LIMIT ${limit}
  `;
}
