/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH JUDGMENTS THE CITATION INDEX PROVABLY DOES NOT REFLECT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `key-freshness.ts` answers two questions about the region ABOVE the builder's
 * cursor: how far behind it is (`MAX_LAG_ROWS`), and whether anything unwalked
 * claims the key being resolved (`collidingKeysInUnwalkedWindow`). Both are
 * sound. Neither can see a judgment that arrives, or changes, BELOW the cursor,
 * because a keyset cursor is monotonic and never looks back.
 *
 * FIFTH built that exact shape on the real path on 26 Aug 2026 and got a UNIQUE
 * out of a citation two judgments claim, with `lagRows: 0` and `because: []`.
 * Widening a threshold cannot close it: there is no bound below zero.
 *
 * Migration `0087` records the fact durably instead — one row per judgment whose
 * citation identity the index cannot be relied on for. This module is the
 * read side, and it is deliberately the same SHAPE as
 * `collidingKeysInUnwalkedWindow`: give it the keys a request is resolving and
 * the canonicalisation function, get back the subset that must not be answered
 * UNIQUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT REFUSES THE CLAIM, NEVER THE CANDIDATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A key implicated here resolves to `UNIQUE_UNCONFIRMED_STALE_INDEX`, not to
 * `TARGET_NOT_HELD` and not to nothing. The candidate is still returned and the
 * advocate still reaches the authority; what is withdrawn is the sentence
 * "exactly one judgment in this corpus claims this citation", which is a claim
 * about the whole corpus made from an index that is known to be wrong about a
 * specific part of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE KEY IS COMPUTED HERE AND NOT IN THE TRIGGER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The trigger records a JUDGMENT ID. Canonicalising a citation into a key is
 * already written twice in this repository — once in `query-shape.ts` for the
 * resolver, once in SQL inside `citation-keys-cli.ts` for the builder. A third
 * copy inside a trigger would gate the resolver with a notion of identity that
 * no test compares against the one it resolves with, and two definitions of
 * citation identity is precisely how a resolver and its index come to disagree
 * about the same citation. So the dirty row names the judgment and the key is
 * derived here, by the caller's own `keyOf`.
 */
import type { Sql } from 'postgres';

/**
 * The keys that MUST NOT be answered UNIQUE because some judgment the index does
 * not reflect claims them.
 *
 * Bounded by construction. `citation_key_dirty` is empty on a healthy system —
 * the INSERT trigger writes nothing for a row stamped `now()`, and the UPDATE
 * trigger only fires for a statement that names a citation column — so the
 * common case is one `count`-shaped read returning nothing. The cap below
 * protects the pathological case where a large backfill has been run and not yet
 * reindexed.
 */
const DIRTY_WINDOW_CAP = 50_000;

export async function dirtyKeysBlockingUnique(
  sql: Sql,
  keys: readonly string[],
  keyOf: (citation: string) => string | null,
): Promise<Set<string>> {
  const unsafe = new Set<string>();
  if (keys.length === 0) return unsafe;

  const rows = await sql<
    { neutral_citation: string | null; reporter_citations: string[] }[]
  >`
    SELECT j.neutral_citation, j.reporter_citations
      FROM citation_key_dirty d
      JOIN judgments j ON j.id = d.judgment_id
     LIMIT ${DIRTY_WINDOW_CAP}`;

  const wanted = new Set(keys);
  for (const row of rows) {
    for (const citation of [row.neutral_citation, ...(row.reporter_citations ?? [])]) {
      if (!citation) continue;
      const key = keyOf(citation);
      if (key && wanted.has(key)) unsafe.add(key);
    }
  }
  return unsafe;
}

export type DirtyWorkSummary = {
  /** Open rows. `0` is the healthy reading and the one the release gate wants. */
  open: number;
  /** Oldest open mark, so "how long has this been unrepaired" is answerable. */
  oldestNoticedAt: string | null;
  /** Split by cause: the two want different operator responses. */
  byReason: Record<string, number>;
  /**
   * True when the dirty set is larger than this module will read exactly.
   *
   * Reported rather than hidden. Above the cap the per-key answer is no longer
   * exact and the corpus-wide `MAX_LAG_ROWS` bound is the backstop — an operator
   * must know which of the two is carrying the guarantee.
   */
  overCap: boolean;
};

/** For the admin monitor and the release manifest. One aggregate read. */
export async function readDirtyWork(sql: Sql): Promise<DirtyWorkSummary> {
  const rows = await sql<{ reason: string; n: string; oldest: string | null }[]>`
    SELECT reason, count(*)::text AS n, min(noticed_at)::text AS oldest
      FROM citation_key_dirty GROUP BY reason`;

  const byReason: Record<string, number> = {};
  let open = 0;
  let oldest: string | null = null;
  for (const r of rows) {
    byReason[r.reason] = Number(r.n);
    open += Number(r.n);
    if (r.oldest && (oldest === null || r.oldest < oldest)) oldest = r.oldest;
  }
  return { open, oldestNoticedAt: oldest, byReason, overCap: open > DIRTY_WINDOW_CAP };
}

/**
 * Clear the mark for judgments whose keys have actually been rebuilt.
 *
 * **Called INSIDE the transaction that rebuilds them, never after it.** A clear
 * that commits separately can outrun the work it is vouching for, and the whole
 * point of this table is that nothing here expires on its own: a dirty row goes
 * away because something was done, not because time passed.
 */
export async function clearDirtyWork(sql: Sql, judgmentIds: readonly string[]): Promise<number> {
  if (judgmentIds.length === 0) return 0;
  const rows = await sql<{ judgment_id: string }[]>`
    DELETE FROM citation_key_dirty
     WHERE judgment_id = ANY(${[...judgmentIds]}::uuid[])
    RETURNING judgment_id`;
  return rows.length;
}
