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

import { isoColumn } from '../iso-time.ts';

/**
 * The keys that MUST NOT be answered UNIQUE because some judgment the index does
 * not reflect claims them — or USED to claim them.
 *
 * Bounded by construction. `citation_key_dirty` is empty on a healthy system —
 * the INSERT trigger writes nothing for a row stamped `now()`, and the UPDATE
 * trigger only fires for a statement that names a citation column — so the
 * common case is one `count`-shaped read returning nothing. The cap below
 * protects the pathological case where a large backfill has been run and not yet
 * reindexed.
 */
const DIRTY_WINDOW_CAP = 50_000;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OLD CITATION IS THE ONE THAT MATTERS — FIFTH bus 1354
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first version of this read joined `judgments` and canonicalised the
 * citations the row has NOW. That closes an ADDED claim and is blind to a
 * REMOVED one, which FIFTH proved on the real path: retarget
 * `neutral_citation` from `1950 INSC 1` to something else and the dirty row is
 * written correctly, but `1950 INSC 1` is no longer on the judgment, so nothing
 * implicates the stale key still sitting in `judgment_citation_keys`. The
 * resolver answered `UNIQUE`, `heldCandidates=1`, for a citation that judgment
 * had stopped claiming.
 *
 * The asymmetry is the whole lesson: an added claim can be re-derived from the
 * row, and a removed one exists nowhere except in the index that is wrong. So
 * migration `0088` has the trigger remember the citation TEXTS from both sides
 * of the mutation, and this canonicalises the union of
 *
 *   - what the judgment claims now (still read, for rows written by 0087
 *     before `citation_texts` existed), and
 *   - every text the triggers recorded.
 *
 * Still one definition of citation identity: the texts are raw source strings
 * and `keyOf` — the caller's own — is the only thing that turns them into keys.
 */
export async function dirtyKeysBlockingUnique(
  sql: Sql,
  keys: readonly string[],
  keyOf: (citation: string) => string | null,
): Promise<Set<string>> {
  const unsafe = new Set<string>();
  if (keys.length === 0) return unsafe;

  /**
   * The exact count first, and it is never truncated.
   *
   * FIFTH's second finding in the same message: the read below was `LIMIT
   * 50000` with no `ORDER BY`, so above the cap the resolver reasoned over an
   * arbitrary subset and still answered UNIQUE. A silent partial check is worse
   * than no check, because it looks like one.
   *
   * Over the cap, EVERY key in the batch is blocked. That is a heavy refusal and
   * it is the correct one: the honest statement is "we cannot currently
   * enumerate what the index is wrong about", and no UNIQUE claim survives that.
   * It cannot fire on a healthy system, where this table is empty.
   */
  const [countRow] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM citation_key_dirty`;
  // An unreadable count is not permission. Same rule as `premiumEnabled`: the
  // honest reading of "I do not know" for a safety gate is no.
  const open = countRow === undefined ? Number.POSITIVE_INFINITY : Number(countRow.n);
  if (open === 0) return unsafe;
  if (open > DIRTY_WINDOW_CAP) {
    for (const k of keys) unsafe.add(k);
    return unsafe;
  }

  const rows = await sql<
    {
      neutral_citation: string | null;
      reporter_citations: string[] | null;
      citation_texts: string[] | null;
    }[]
  >`
    SELECT j.neutral_citation, j.reporter_citations, d.citation_texts
      FROM citation_key_dirty d
      -- LEFT, because JUDGMENT_DELETED has no judgment left to join to and is
      -- exactly the case whose only surviving record is d.citation_texts.
      LEFT JOIN judgments j ON j.id = d.judgment_id`;

  const wanted = new Set(keys);
  for (const row of rows) {
    const citations = [
      row.neutral_citation,
      ...(row.reporter_citations ?? []),
      ...(row.citation_texts ?? []),
    ];
    for (const citation of citations) {
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
    -- ISO-8601 rather than Postgres text: this summary is documented as going to
    -- the admin monitor and the release manifest, and oldest is compared with a
    -- string less-than below. Lexicographic order on a fixed-width UTC ISO string
    -- IS chronological order, so the min still works and the wire form is right.
    SELECT reason, count(*)::text AS n,
           ${sql.unsafe(isoColumn('min(noticed_at)'))} AS oldest
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

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * `clearDirtyWork()` WAS HERE. IT WAS SUPERSEDED, NOT FORGOTTEN.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It cleared the mark for judgments whose keys had been rebuilt, and its own
 * doc comment said the load-bearing part: **called INSIDE the transaction that
 * rebuilds them, never after it** — a clear that commits separately can outrun
 * the work it is vouching for.
 *
 * Removed 29 Aug 2026 after inspecting the production lifecycle rather than the
 * function. That lifecycle exists and is wired, in
 * `services/ingest/src/citation-keys-cli.ts`:
 *
 *   `rebuildDirtyPage()`          selects dirty rows FOR UPDATE SKIP LOCKED,
 *                                 re-derives the keys, and DELETEs the marks in
 *                                 the SAME transaction — with an assertion that
 *                                 cleared === selected, so a partial clear
 *                                 raises instead of passing quietly.
 *   `dischargeCompletedDeletions()` clears JUDGMENT_DELETED marks, and only
 *                                 where no key row and no judgment survive.
 *
 * FIFTH exercised it on the live path (bus 1429): the SCI neutral-citation
 * correction drove it and `citation_key_dirty` returned to 0, then the resolver
 * risk replay re-ran clean — 406 adjudicated records, false_unique 0,
 * materially_unsafe 0.
 *
 * **This function could never have been that step.** `services/ingest` and
 * `services/api` are separate deployables and do not import each other's `src/`
 * — `services/ingest/src/inferx.ts` states the rule and `citation-keys-cli.ts`
 * says explicitly that it writes its own copy for that reason. So the version
 * living here was unreachable from the only place that rebuilds keys.
 *
 * It had **no callers at all** at the point of removal — not production, and
 * not tests either. `readDirtyWork()` and `dirtyKeysBlockingUnique()` above are
 * both live (the admin monitor, the release manifest, and the resolver gate)
 * and are untouched.
 *
 * **If a citation background-expansion job in `services/api` needs to discharge
 * dirty work, this is the shape it wants**, and it is one revert away:
 *
 *     DELETE FROM citation_key_dirty
 *      WHERE judgment_id = ANY($1::uuid[])
 *     RETURNING judgment_id
 *
 * with the same non-negotiable condition — inside the rebuilding transaction,
 * never after it. It is written out here rather than left dead in the file,
 * because code with no caller is a claim nobody is checking.
 */
