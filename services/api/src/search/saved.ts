/**
 * Saved searches — `docs/API_CONTRACTS.md` §Saved searches.
 *
 * **This is a feed an advocate opens, not an alert that arrives.** PD-5 excluded
 * subject-following from notifications in those words: *"that is discovery, not
 * an alert — it belongs in the app, never in a notification"*, and PD-6 warns
 * that a wrong cadence trains advocates to switch notifications off permanently,
 * taking the hearing reminders with them. Losing a hearing reminder is a missed
 * hearing.
 *
 * So there is no `notified_at` on the table, no delivery state, and nothing here
 * emits anything. `unseenCount` orders the in-app list and **must not become a
 * badge** on the app icon or the tab bar.
 *
 * `last_seen_at` is what makes a feed a feed: a judgment newer than it is unseen.
 * It moves only when the advocate actually reads the feed, which is why the read
 * endpoint advances it and the list endpoint does not.
 *
 * **These endpoints existing is not approval to build the surface.**
 * `FEATURE_PARITY.md` §3 holds the client feed pending the founder's
 * confirmation of the PD-5 reframe. Built server-side so it is ready.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { deriveRetrievalOutcome, SEMANTIC_INDEX_SUFFICIENT } from './outcome.ts';
import { type DegradedArm, hybridSearch, type SearchFilters } from './retrieve.ts';

export const savedSearchBody = z.object({
  query: z.string().min(1).max(500),
  language: z.enum(['en', 'hi']),
  filters: z
    .object({
      court: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      caseType: z.enum(['criminal', 'civil']).optional(),
    })
    .optional(),
});

/** `?since` is an ISO timestamp. A feed is read forward, never paged through. */
export const feedQuery = z.object({ since: z.string().datetime().optional() });

type Row = {
  id: string;
  query_text: string;
  query_language: string;
  filters: SearchFilters | null;
  last_seen_at: string;
  created_at: string;
};

const shape = (r: Row) => ({
  savedSearchId: r.id,
  query: r.query_text,
  language: r.query_language,
  filters: r.filters,
  lastSeenAt: r.last_seen_at,
  createdAt: r.created_at,
});

const COLUMNS = `id, query_text, query_language, filters,
                 ${isoColumn('last_seen_at')} AS last_seen_at,
                 ${isoColumn('created_at')} AS created_at`;

/**
 * Auth ships in S5 and is this lane's to build. `saved_searches.user_id` is NOT
 * NULL, correctly —
 * a saved search belongs to somebody. Rather than invent a user or loosen the
 * column to paper over a sequencing gap, these routes answer honestly. Same
 * posture as `judgments/annotations.ts`.
 */
function requireUser(c: Context, userId: string | undefined): Response | null {
  if (userId) return null;
  return fail(
    c,
    'AUTH_REQUIRED',
    'a saved search belongs to a user and authentication ships in S5',
    401,
  );
}

export async function listSavedSearches(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const rows = await sql<Row[]>`
    SELECT ${sql.unsafe(COLUMNS)}
    FROM saved_searches
    WHERE user_id = ${userId!} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
  return ok(c, { savedSearches: rows.map(shape) });
}

export async function createSavedSearch(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof savedSearchBody>,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  // Saving the same query twice is a mis-tap, not an intent. Returning the
  // existing row keeps the feed from showing one subject twice, and keeps
  // `last_seen_at` — re-saving must not silently mark everything unseen again.
  const [existing] = await sql<Row[]>`
    SELECT ${sql.unsafe(COLUMNS)}
    FROM saved_searches
    WHERE user_id = ${userId!} AND deleted_at IS NULL
      AND lower(query_text) = lower(${body.query})
      AND query_language = ${body.language}
  `;
  if (existing) return ok(c, { savedSearch: shape(existing) });

  const [row] = await sql<Row[]>`
    INSERT INTO saved_searches (user_id, query_text, query_language, filters)
    VALUES (${userId!}, ${body.query}, ${body.language},
            ${body.filters ? sql.json(body.filters) : null})
    RETURNING ${sql.unsafe(COLUMNS)}
  `;
  return ok(c, { savedSearch: shape(row!) }, 201);
}

export async function deleteSavedSearch(
  c: Context,
  sql: Sql,
  savedSearchId: string,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  // Soft delete, like annotations and matter shares. What an advocate was
  // following, and when they stopped, is the question asked later.
  const rows = await sql`
    UPDATE saved_searches SET deleted_at = now()
    WHERE id = ${savedSearchId} AND user_id = ${userId!} AND deleted_at IS NULL
  `;
  if (rows.count === 0) return fail(c, 'NOT_FOUND', 'no saved search with that id', 404);
  return ok(c, { ok: true });
}

/** How many results the feed considers. Deliberately small — this is discovery. */
const FEED_LIMIT = 20;

export async function getSavedSearchFeed(
  c: Context,
  sql: Sql,
  savedSearchId: string,
  userId: string | undefined,
  query: z.infer<typeof feedQuery>,
  embedQuery: (text: string) => Promise<string | null>,
  /**
   * The research admission gate. Optional so tests can run without one, exactly
   * as `/search` and `/arguments/counter` take it.
   *
   * IT WAS MISSING HERE UNTIL 25 AUG 2026, and this is the third route to make
   * the same mistake. `counter.ts` carries the note about the second: it ran the
   * SAME `hybridSearch` with no admission slot, so the concurrency bound that
   * exists to stop research retrieval from exhausting the pool applied to
   * `/search` only.
   *
   * This feed is the easiest of the three to overlook because it does not look
   * like a search — it is a saved-searches read, mounted next to a list and a
   * delete. It is nonetheless the identical query on the identical pool, and a
   * client polling several saved searches on app open issues several of them at
   * once.
   *
   * The SPARSE preflight was never bypassed by any of the three: it lives inside
   * `hybridSearch`. What was bypassed is the concurrency half of the same
   * contract.
   */
  admission?: { acquire: () => Promise<{ release: () => void } | null> } | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [saved] = await sql<Row[]>`
    SELECT ${sql.unsafe(COLUMNS)}
    FROM saved_searches
    WHERE id = ${savedSearchId} AND user_id = ${userId!} AND deleted_at IS NULL
  `;
  if (!saved) return fail(c, 'NOT_FOUND', 'no saved search with that id', 404);

  /**
   * The watermark. `?since` lets a client re-read a window it already saw
   * without moving the mark; absent it, the stored `last_seen_at` governs.
   * A judgment is unseen if it was DELIVERED after the mark — not ingested
   * after it. Ingest order is an artefact of our backfill; delivery date is a
   * fact about the law, and it is what an advocate means by "new".
   */
  const since = query.since ?? saved.last_seen_at;

  /* Refused, never queued invisibly — the same shape and the same reason as
   * `/search` and `/arguments/counter`. A feed that silently waits behind a full
   * research pool looks to the advocate like a feed with nothing new in it. */
  const slot = admission ? await admission.acquire() : null;
  if (admission && slot === null) {
    return fail(
      c,
      'SEARCH_BUSY',
      'Research capacity is full. Try this feed again in a moment.',
      503,
    );
  }

  let results;
  /**
   * The same `onDegrade` this call site never passed — see the long note in
   * `arguments/counter.ts`. It matters differently here and arguably more.
   *
   * A saved-search feed is the one surface an advocate does NOT re-read
   * critically: they open it to see whether anything new has landed, and an
   * empty feed means "nothing new". A degraded arm makes an empty feed look
   * identical to a quiet week. `unseenCount: 0` derived from a ranking that did
   * not finish is a claim about the law that nobody asked the server to make.
   */
  const degradedArms: DegradedArm[] = [];
  let semanticAvailable = false;
  try {
    const vector = await embedQuery(saved.query_text);
    semanticAvailable = vector !== null;
    results = await hybridSearch(
      sql,
      saved.query_text,
      vector,
      saved.filters ?? {},
      FEED_LIMIT,
      'hybrid',
      (arm) => {
        if (!degradedArms.includes(arm)) degradedArms.push(arm);
      },
    );
  } finally {
    slot?.release();
  }

  const unseen = results.filter((r) => r.judgmentDate > since.slice(0, 10));

  // Advancing the watermark is the act of reading, so it happens here and NOT in
  // the list endpoint — opening the list of saved searches must not mark their
  // contents seen. Only when `since` was not overridden: a client re-reading an
  // older window has not caught up.
  if (!query.since) {
    await sql`UPDATE saved_searches SET last_seen_at = now() WHERE id = ${savedSearchId}`;
  }

  return ok(c, {
    savedSearch: shape(saved),
    since,
    // In-app ordering only. PD-5/PD-6: never a badge, never a notification.
    unseenCount: unseen.length,
    /**
     * R7 §7.1, same derivation as `/search` and `/arguments/counter`.
     *
     * Read `unseenCount` WITH this and never without it: a zero next to
     * `coverage_unknown` means the feed could not be computed, not that nothing
     * new was decided.
     */
    retrievalOutcome: deriveRetrievalOutcome({
      resultCount: results.length,
      degradedArms,
      semanticAvailable,
      semanticIndexSufficient: SEMANTIC_INDEX_SUFFICIENT,
      semanticDependent: true,
    }),
    results: results.map((r) => ({
      judgmentId: r.judgmentId,
      caseTitle: r.caseTitle,
      neutralCitation: r.neutralCitation,
      reporterCitations: r.reporterCitations,
      court: r.court,
      judgmentDate: r.judgmentDate,
      // Every surface renders these three from the row, never from model output.
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      overruledStatus: r.overruledStatus,
      overruledByJudgmentId: r.overruledByJudgmentId,
      overruledParas: r.overruledParas,
      overruledNote: r.overruledNote,
      operativeParagraph: r.operativeParagraph,
      bodyText: r.bodyText,
      unseen: r.judgmentDate > since.slice(0, 10),
    })),
  });
}
