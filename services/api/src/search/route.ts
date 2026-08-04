/**
 * `POST /search` — implemented exactly to `docs/API_CONTRACTS.md` §Search.
 *
 * Every rendered field comes from the `judgments` row, never from model output.
 * In S1 there is no model in this path at all: retrieval returns judgment IDs
 * out of our own corpus, so Tier 1 of `docs/CITATION_HARNESS.md` resolves them
 * by construction — `verified` / `corpus` is the honest value here, not a
 * placeholder. Tiers 2 and 3 arrive in S2.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import type { Sql } from 'postgres';

import { ok } from '../envelope.ts';
import { hybridSearch, type SearchFilters } from './retrieve.ts';

export const searchRequest = z.object({
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
  matterId: z.string().uuid().optional(),
});

export type SearchRequest = z.infer<typeof searchRequest>;

export type SearchDeps = {
  sql: Sql;
  /** Null when the embedding model is unavailable — search degrades to lexical only. */
  embedQuery: (text: string) => Promise<string | null>;
  /** Absent until auth ships in S5. See the note where `searches` is written. */
  userId?: string | undefined;
};

const RESULT_LIMIT = 5;

export async function handleSearch(
  c: Context,
  deps: SearchDeps,
  body: SearchRequest,
): Promise<Response> {
  // `caseType` now filters for real: it is derived at ingest from the official
  // case number (`docs/SCHEMA_TRUTH.md` §judgments), not from the judgment's
  // content. Judgments whose case number states no side are excluded rather than
  // guessed into one.
  const filters: SearchFilters = {
    court: body.filters?.court,
    dateFrom: body.filters?.dateFrom,
    dateTo: body.filters?.dateTo,
    caseType: body.filters?.caseType,
  };

  const queryVector = await deps.embedQuery(body.query);
  const retrieved = await hybridSearch(deps.sql, body.query, queryVector, filters, RESULT_LIMIT);

  // `searches.user_id` is NOT NULL (SCHEMA_TRUTH), and the contract authenticates
  // this endpoint with a Bearer token — but auth is S5 and RCC-owned, so in S1
  // there is no user to attribute a search to. Rather than invent one, the search
  // row is written only when a user is present and `searchId` is null otherwise.
  // RCC: `searchId` can be null until auth lands.
  let searchId: string | null = null;
  if (deps.userId) {
    const [searchRow] = await deps.sql<{ id: string }[]>`
      INSERT INTO searches (user_id, matter_id, query_text, query_language, results_returned, model_used)
      VALUES (${deps.userId}, ${body.matterId ?? null}, ${body.query}, ${body.language},
              ${retrieved.length}, ${queryVector ? 'bge-m3' : 'lexical-only'})
      RETURNING id
    `;
    searchId = searchRow?.id ?? null;
  }

  // One citation_checks row per citation per surface — ALWAYS, never conditional
  // on having a search row. `search_id` is nullable exactly so this record can
  // exist without one. Gating it on `searchId` silently wrote nothing while
  // unauthenticated, which would have zeroed the silent-drop measurement the
  // harness depends on. `docs/CITATION_HARNESS.md` §How stale-overruled is measured.
  if (retrieved.length > 0) {
    await deps.sql`
      INSERT INTO citation_checks ${deps.sql(
        retrieved.map((r) => ({
          search_id: searchId,
          citation_claimed: r.neutralCitation ?? r.reporterCitations[0] ?? r.caseTitle,
          judgment_id_matched: r.judgmentId,
          verification_state: 'verified',
          verified_by_source: 'corpus',
          shown_to_user: true,
          overruled_status_shown: r.overruledStatus,
          surface: 'search',
        })),
      )}
    `;
  }

  return ok(c, {
    results: retrieved.map((r) => ({
      judgmentId: r.judgmentId,
      caseTitle: r.caseTitle,
      neutralCitation: r.neutralCitation,
      reporterCitations: r.reporterCitations,
      court: r.court,
      judgmentDate: r.judgmentDate,
      // A two-sentence holding is a summarisation task and needs the model
      // OD-6 routes public-class text to. Not available in S1, so this is empty
      // rather than a snippet dressed up as a holding.
      holding: '',
      operativeParagraph: r.operativeParagraph,
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      // Read live from the row on every request. Never cached.
      overruledStatus: r.overruledStatus,
      overruledByJudgmentId: r.overruledByJudgmentId,
      overruledParas: r.overruledParas,
      overruledNote: r.overruledNote,
    })),
    // Nothing can be dropped in S1: results ARE corpus rows, so there is no
    // model-claimed reference that failed to resolve. The field is always
    // present, never omitted.
    unverifiedReferences: [],
    searchId,
  });
}
