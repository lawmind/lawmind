/**
 * ─────────────────────────────────────────────────────────────────────────────
 * READING CORPUS FACTS FOR ROWS THE USER DATABASE OWNS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R20 froze the boundary: `CROSS_DB_REFERENCE_MODEL = SOFT_CORPUS_REFERENCE`.
 * The eight tables that carry a judgment id — `matter_authorities`, `alerts`,
 * `citation_checks`, `citation_copies`, `citation_disputes`, `citation_fanouts`,
 * `judgment_annotations`, `verification_cache` — live in the USER database, and
 * their judgment ids are opaque immutable references, not foreign keys.
 *
 * A `JOIN judgments` therefore stops being possible the moment the two roles are
 * two databases. This is the shape that replaces it, and it is the shape this
 * repository already used before it had a name — `derivedEffects` and
 * `search/route.ts` both do ids -> one indexed corpus read -> `Map`.
 *
 *     read the owning database  ->  collect stable ids  ->  ONE batched read of
 *     the other  ->  deterministic merge in the application
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A MAP AND NOT A LIST, AND WHY THE CALLER MERGES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The corpus read returns what it FOUND. It does not return a row per id
 * requested, it is not padded with placeholders, and it preserves no ordering —
 * because the ordering that matters belongs to the user rows and is decided by
 * the user database's `ORDER BY`. A caller that iterates its own rows and looks
 * each id up keeps that ordering by construction and cannot silently drop a row
 * by joining it away.
 *
 * **A missing id is a first-class outcome, not an error.** After the split a
 * saved authority can name a judgment the active corpus generation does not
 * contain — a rollback to an earlier release is exactly that — and R20 is
 * explicit: *"Existing rows survive a later missing target"* and *"No
 * reconciliation or corpus rollback may delete, rewrite, remove, or mark removed
 * any user row."* So `has(id) === false` is information the caller must render,
 * never a reason to drop the advocate's row.
 */
import type { Sql } from 'postgres';

/**
 * The corpus-owned facts every user-owned surface needs about a judgment.
 *
 * Deliberately the union of what the current cross-role joins already select,
 * so this replaces them without any surface losing a field. `overruledStatus`
 * and its companions are read LIVE on every request — `CITATION_HARNESS.md`
 * forbids caching good-law status, and a batched read is still a read.
 */
export type JudgmentFacts = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string | null;
  reporterCitations: string[];
  court: string;
  judgmentDate: string;
  overruledStatus: string;
  overruledByJudgmentId: string | null;
  overruledParas: number[] | null;
  overruledNote: string | null;
  /** The title of the judgment that displaced this one, when there is one. */
  overruledByTitle: string | null;
  scriptQuality: string | null;
  scriptQualityMethod: string | null;
};

/**
 * One batched corpus read for a set of judgment ids.
 *
 * `= ANY($ids)` on the primary key, so the cost is one index descent per id and
 * the statement count is one however many ids there are. The N+1 this replaces
 * would be the obvious way to write "look each one up" and is the thing the
 * split makes tempting.
 *
 * `ids` is de-duplicated before the query: two authorities can name the same
 * judgment, and asking twice buys nothing.
 */
export async function judgmentFacts(
  corpusSql: Sql,
  ids: readonly string[],
): Promise<Map<string, JudgmentFacts>> {
  const unique = [...new Set(ids)];
  const facts = new Map<string, JudgmentFacts>();
  if (unique.length === 0) return facts;

  const rows = await corpusSql<
    {
      id: string;
      case_title: string;
      neutral_citation: string | null;
      reporter_citations: string[];
      court: string;
      judgment_date: string;
      overruled_status: string;
      overruled_by_judgment_id: string | null;
      overruled_paras: number[] | null;
      overruled_note: string | null;
      overruled_by_title: string | null;
      script_quality: string | null;
      script_quality_method: string | null;
    }[]
  >`
    SELECT j.id, j.case_title, j.neutral_citation, j.reporter_citations, j.court,
           j.judgment_date::text AS judgment_date,
           j.overruled_status::text AS overruled_status,
           j.overruled_by_judgment_id, j.overruled_paras, j.overruled_note,
           -- Corpus-to-corpus, so this join stays a join: it is inside one role
           -- and survives the split untouched.
           o.case_title AS overruled_by_title,
           j.script_quality, j.script_quality_method
      FROM judgments j
      LEFT JOIN judgments o ON o.id = j.overruled_by_judgment_id
     WHERE j.id = ANY(${unique as string[]}::uuid[])`;

  for (const r of rows) {
    facts.set(r.id, {
      judgmentId: r.id,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      reporterCitations: r.reporter_citations,
      court: r.court,
      judgmentDate: r.judgment_date,
      overruledStatus: r.overruled_status,
      overruledByJudgmentId: r.overruled_by_judgment_id,
      overruledParas: r.overruled_paras,
      overruledNote: r.overruled_note,
      overruledByTitle: r.overruled_by_title,
      scriptQuality: r.script_quality,
      scriptQualityMethod: r.script_quality_method,
    });
  }
  return facts;
}

/**
 * Does the active corpus generation contain this judgment?
 *
 * R20: *"New saves require the target to exist in the request-pinned active
 * corpus generation."* The write path asks this; the read path does not, because
 * a read must show what was saved whether or not it still resolves.
 */
export async function judgmentExists(corpusSql: Sql, id: string): Promise<boolean> {
  const rows = await corpusSql<{ ok: boolean }[]>`
    SELECT true AS ok FROM judgments WHERE id = ${id}`;
  return rows.length > 0;
}
