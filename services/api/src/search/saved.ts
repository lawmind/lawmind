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
import { hybridSearch, type SearchFilters } from './retrieve.ts';

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
                 last_seen_at::text AS last_seen_at, created_at::text AS created_at`;

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

  const vector = await embedQuery(saved.query_text);
  const results = await hybridSearch(
    sql,
    saved.query_text,
    vector,
    saved.filters ?? {},
    FEED_LIMIT,
  );

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
      unseen: r.judgmentDate > since.slice(0, 10),
    })),
  });
}
