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

import { fail, ok } from '../envelope.ts';
import { logger } from '../logger.ts';
import { COURT_CATEGORIES, expandCategories, unpopulatedCategories } from './court-category.ts';
import {
  hybridSearch,
  type DegradedArm,
  type RetrievalSignals,
  type SearchFilters,
} from './retrieve.ts';
import type { Admission } from './admission.ts';
import { recordSearchEvent } from './event.ts';
import { classifyQuery } from './query-shape.ts';
import { answerStructured } from './structured.ts';
import {
  precedentialEffect,
  precedentialPolicy,
  unappliedTreatment,
  type OverruledStatus,
} from '../judgments/precedential-effect.ts';

/**
 * The derived precedential layers for a page of structured hits, in ONE query.
 *
 * The structured path (`cite:`, `judge:`, `section:`) rendered
 * `overruled_status` raw while hybrid search rendered it derived, so the SAME
 * judgment carried different currentness depending on how it was found — and
 * `cite:` is the citation surface above all others. One batched, indexed read
 * over at most `RESULT_LIMIT` ids; never one per result.
 */
async function derivedEffects(
  sql: Sql,
  hits: readonly { judgmentId: string; overruledStatus: string }[],
): Promise<Map<string, { banner: OverruledStatus; effect: string; canAdd: boolean; unapplied: string | null }>> {
  const out = new Map<string, { banner: OverruledStatus; effect: string; canAdd: boolean; unapplied: string | null }>();
  if (hits.length === 0) return out;
  const edges = await sql<{ cited_judgment_id: string; relationship: string }[]>`
    SELECT DISTINCT cited_judgment_id, relationship
      FROM judgment_citations
     WHERE cited_judgment_id = ANY(${hits.map((h) => h.judgmentId)})
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;
  const byId = new Map<string, string[]>();
  for (const e of edges) {
    const list = byId.get(e.cited_judgment_id);
    if (list) list.push(e.relationship);
    else byId.set(e.cited_judgment_id, [e.relationship]);
  }
  for (const h of hits) {
    const inbound = byId.get(h.judgmentId) ?? [];
    const input = {
      overruledStatus: h.overruledStatus as OverruledStatus,
      inboundRelationships: inbound,
    };
    const effect = precedentialEffect(input);
    out.set(h.judgmentId, {
      banner: precedentialPolicy(effect).bannerStatus,
      effect,
      canAdd: precedentialPolicy(effect).addToMatter === 'allow',
      unapplied: unappliedTreatment(input),
    });
  }
  return out;
}

/**
 * A calendar date, and genuinely a date.
 *
 * `judgments.judgment_date` is a `date` column, so a time and a zone are not
 * merely unnecessary here — accepting them invites a client to send an instant
 * and expect zone-correct behaviour from a column that has no zone.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a calendar date, YYYY-MM-DD')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    const parsed = new Date(Date.UTC(y, m - 1, d));
    // Round-trips only for a day that exists: 2026-02-30 parses to 2 March and
    // fails this, which is the whole point.
    return (
      parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
    );
  }, 'not a real calendar date');

export const searchRequest = z.object({
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * 500 IS THE CURRENT SAFE BOUND, NOT A PRODUCT LIMIT
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The binding addendum is explicit that this must not be cemented into the
   * contract as a permanent LawMind limitation. It exists for one measured
   * reason: the current retrieval path cannot safely execute an arbitrarily
   * large lexical query. NEW1's arm E measured three ORed lexemes timing out 51
   * times in 60, and a pasted paragraph is dozens of lexemes.
   *
   * LawMind ultimately needs a safe path for long fact patterns, pasted
   * passages and detailed natural-language descriptions. The intended shape,
   * recorded here so the next person does not simply raise the number:
   *
   *     short / normal query  -> the ordinary research route
   *     long fact or passage  -> a DEDICATED bounded passage-retrieval path,
   *                              primarily semantic or structured extraction,
   *                              never a corpus-wide sparse scan
   *
   * NEW1 researches that path; LCC implements it only once a measured design
   * exists; NEW3 builds the UX only once the backend contract does. Until then
   * the honest behaviour is the one below: **reject and say why. Never
   * truncate**, because a silently shortened query returns results about a
   * question the advocate did not ask, and never imply long-passage research
   * works when it does not.
   */
  query: z.string().min(1).max(500, {
    message:
      'This search is longer than we can currently run safely (500 characters). ' +
      'Nothing has been shortened — please search the key part of the passage instead.',
  }),
  language: z.enum(['en', 'hi']),
  filters: z
    .object({
      /**
       * A court NAME, matched with `=` against `judgments.court`. Bounded
       * because it is a user-supplied string that reaches a query: the longest
       * court name in the corpus is well under 120 characters, and an
       * unbounded one is a free way to make us hash a megabyte per request.
       */
      court: z.string().min(1).max(120).optional(),
      /**
       * Category codes, not court names — RCC bus 0046. The client's chips are
       * `sc`/`hc`/`district`/`tribunal`; `judgments.court` holds printed names
       * like `High Court  for State of Telangana`. The expansion is ours
       * because the column is ours: a client hardcoding those strings returns
       * zero results silently on the first one it gets wrong, and a search that
       * says "nothing matched" when it never asked is the same failure as a
       * filter that does nothing. `search/court-category.ts`.
       */
      courts: z.array(z.enum(COURT_CATEGORIES)).optional(),
      /**
       * ─────────────────────────────────────────────────────────────────────
       * DATES ARE VALIDATED, WHICH THEY WERE NOT
       * ─────────────────────────────────────────────────────────────────────
       *
       * These were `z.string()`. Anything at all passed the validator and
       * landed in the `judgment_date >=` comparison, where Postgres decided
       * what to do with it. `"yesterday"` is a **valid** date literal to
       * Postgres and silently means something we never intended; `"nonsense"`
       * is a 500 that reads to the client as a server fault rather than as
       * their own malformed request.
       *
       * ISO calendar dates only. `refine` rather than a regex alone because
       * `2026-02-30` matches the regex and is not a day — and a filter that
       * silently rolls to 2 March is the kind of wrong an advocate would never
       * see and could not explain.
       */
      dateFrom: isoDate.optional(),
      dateTo: isoDate.optional(),
      caseType: z.enum(['criminal', 'civil']).optional(),
    })
    .optional(),
  matterId: z.string().uuid().optional(),
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * P3 — CONTINUATION. 1-BASED, ADDITIVE, AND NOT AN OPAQUE TOKEN
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Both fields are optional and both default to today's behaviour, so a client
   * that sends neither gets byte-identical responses to the ones it parses now.
   *
   * A page NUMBER rather than a cursor, deliberately. A cursor implies a frozen
   * result set, and this one is not frozen: the rankers re-run per page (proved
   * stable — `retrieve.ts`'s note carries the measurement) over a corpus that
   * ingest is still writing to. A number promises exactly what is true — "the
   * next slice of the current ranking" — where a token would promise more.
   *
   * The upper bounds are not taste. `pageSize` is capped because every result
   * costs a `full_text` read and a paragraph location; `page` is capped because
   * the hybrid rankers produce at most `REACHABLE_DEPTH` candidates and asking
   * for result 500 is asking for something never computed. The structured path
   * pages with SQL and is bounded only by its own total.
   */
  page: z.number().int().min(1).max(100).optional(),
  pageSize: z.number().int().min(1).max(25).optional(),
})
  /**
   * A range that cannot contain anything is a mistake, not a search. Answering
   * it with an empty result set teaches the advocate that we hold nothing on
   * their point, which is the exact confusion `unpopulatedCourtCategories`
   * exists to prevent one field away.
   */
  .refine(
    (b) => !b.filters?.dateFrom || !b.filters?.dateTo || b.filters.dateFrom <= b.filters.dateTo,
    { message: 'dateFrom is after dateTo — that range contains no days', path: ['filters'] },
  );

export type SearchRequest = z.infer<typeof searchRequest>;

export type SearchDeps = {
  /** The CORE pool. Bookkeeping writes and small lookups. */
  sql: Sql;
  /**
   * The RESEARCH pool — rankers only. Absent in tests and CLIs, which then run
   * everything on `sql` exactly as they did before.
   */
  researchSql?: Sql | undefined;
  /** Absent means unlimited concurrency, which is the old behaviour. */
  admission?: Admission | undefined;
  /** Null when the embedding model is unavailable — search degrades to lexical only. */
  embedQuery: (text: string) => Promise<string | null>;
  /** Absent until auth ships in S5. See the note where `searches` is written. */
  userId?: string | undefined;
};

/**
 * The default page size. Unchanged at 5 so no existing client's layout moves;
 * a client that wants more asks for it.
 *
 * The launch mandate is explicit that five-with-no-continuation is not
 * acceptable for a serious legal research product. The fix is the continuation,
 * not a bigger first page: an advocate scanning results wants a short page and
 * a way onward, and a page of 25 costs 25 `full_text` reads on a phone.
 */
const RESULT_LIMIT = 5;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P1 — THE ADMISSION GATE SITS IN FRONT OF EVERYTHING EXPENSIVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `/search` is the only route in this API that can hold a connection for 15
 * seconds, and before this it shared one pool with sign-in, save-to-matter and
 * the healthcheck. Ten concurrent searches took every slot and every other
 * route queued behind them with no timeout of its own — the API looked dead
 * while Postgres sat idle at 7 of 100 sessions.
 *
 * Two changes, both here: expensive work runs on its OWN pool
 * (`deps.researchSql`), and only `RESEARCH_CONCURRENCY` requests may hold it at
 * once (`pools.ts`). The 4th waits up to 2 s and is then REFUSED — a 503 the client can
 * render as "busy, try again", never an empty result page, which would be a
 * silent drop with a success code on it.
 *
 * Bookkeeping writes (`searches`, `citation_checks`) deliberately stay on the
 * CORE pool: they are small, they are transactional, and they must not queue
 * behind the rankers whose results they are recording.
 */
export async function handleSearch(
  c: Context,
  deps: SearchDeps,
  body: SearchRequest,
): Promise<Response> {
  const started = performance.now();
  /**
   * Filled in by `runSearch` as it learns things. A plain mutable record rather
   * than a return value because every branch of that function returns a
   * Response and threading a tuple through nine of them would obscure what they
   * actually do.
   */
  const outcome: SearchOutcome = { queryClass: 'unknown', resultCount: 0, degraded: [] };

  const slot = deps.admission ? await deps.admission.acquire() : null;
  if (deps.admission && slot === null) {
    logger.warn(
      { ...deps.admission.stats(), query_chars: body.query.length },
      'search refused at the admission gate — research capacity is full',
    );
    recordSearchEvent(deps.sql, {
      queryClass: 'refused',
      queryChars: body.query.length,
      latencyMs: Math.round(performance.now() - started),
      resultCount: 0,
      degraded: [],
      // The one field that separates "we refused" from "nobody asked". Without
      // it a capacity incident is invisible in the very table meant to show it.
      admitted: false,
      requestId: c.get('requestId'),
      subject: c.get('authId'),
    });
    // 503 + Retry-After. An honest "not now" that the client can retry, rather
    // than an empty page that reads as "no such law".
    c.header('Retry-After', '2');
    return fail(
      c,
      'SEARCH_BUSY',
      'Search is at capacity right now. Please try again in a moment.',
      503,
    );
  }
  try {
    return await runSearch(c, deps, body, outcome);
  } finally {
    slot?.release();
    /**
     * Telemetry with NO QUERY TEXT — `search/event.ts` and migration `0075`
     * carry the reasoning. Recorded in `finally` so a thrown request is
     * measured too: an error path that vanishes from the metrics is how a 5xx
     * spike stays invisible.
     */
    recordSearchEvent(deps.sql, {
      queryClass: outcome.queryClass,
      queryChars: body.query.length,
      latencyMs: Math.round(performance.now() - started),
      resultCount: outcome.resultCount,
      degraded: outcome.degraded,
      admitted: true,
      requestId: c.get('requestId'),
      subject: c.get('authId'),
    });
  }
}

/** What the handler learned, for telemetry. Never contains the query. */
type SearchOutcome = { queryClass: string; resultCount: number; degraded: string[] };

async function runSearch(
  c: Context,
  deps: SearchDeps,
  body: SearchRequest,
  outcome: SearchOutcome,
): Promise<Response> {
  /**
   * The pool the rankers run on. Falls back to the core handle so every
   * existing caller — tests, the harness, the benchmark — keeps working
   * unchanged; production passes both.
   */
  const research = deps.researchSql ?? deps.sql;
  // `caseType` now filters for real: it is derived at ingest from the official
  // case number (`docs/SCHEMA_TRUTH.md` §judgments), not from the judgment's
  // content. Judgments whose case number states no side are excluded rather than
  // guessed into one.
  /**
   * Category codes → the names the column holds. RCC bus 0046.
   *
   * Expanded here, once, before any ranker sees the filter — so all four arms
   * of the hybrid narrow identically. `[]` back from the expansion is kept as
   * `[]` and never dropped to `undefined`: the advocate asked for a category
   * the corpus holds nothing in, and quietly returning the unfiltered corpus
   * would ignore a request they can see on their screen.
   */
  const courts = body.filters?.courts
    ? await expandCategories(deps.sql, body.filters.courts)
    : undefined;

  const filters: SearchFilters = {
    court: body.filters?.court,
    courts,
    dateFrom: body.filters?.dateFrom,
    dateTo: body.filters?.dateTo,
    caseType: body.filters?.caseType,
  };

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * STRUCTURE DECIDES, SEMANTICS FILLS — and they are never blended
   * ───────────────────────────────────────────────────────────────────────────
   *
   * A structured query (`judge:"Kania" AND section:138`) is a FILTER. Every row
   * either satisfies it or does not, so a semantic result mixed into that list
   * would be a judgment the advocate did not ask for, presented as one they did.
   *
   * Zero structured matches therefore returns ZERO, with the interpretation
   * echoed so they can see what was searched. The tempting fallback — quietly
   * running a semantic search so something appears — is exactly the failure this
   * refuses: three cheque cases by other judges do not read as "we guessed",
   * they read as "these are the Kania cases".
   *
   * Ordinary prose falls straight through to the path below, untouched.
   */
  /**
   * P3. The window this request asks for, resolved once so every branch below
   * agrees. `offset` is derived, never taken from the client: an offset the
   * caller controls independently of the page size is two ways to say one thing
   * and a way for them to disagree.
   */
  const pageSize = body.pageSize ?? RESULT_LIMIT;
  const page = body.page ?? 1;
  const offset = (page - 1) * pageSize;

  const structured = await answerStructured(research, body.query, pageSize, offset);

  if (structured.kind === 'invalid') {
    outcome.queryClass = 'structured_invalid';
    return fail(
      c,
      'INVALID_QUERY',
      structured.message,
      400,
      structured.validFields
        ? { offset: structured.offset, validFields: structured.validFields }
        : { offset: structured.offset },
    );
  }

  if (structured.kind === 'no_match') {
    outcome.queryClass = 'structured';
    return ok(c, {
      results: [],
      unverifiedReferences: [],
      searchId: null,
      parsed: structured.parsed,
      total: 0,
      page: { page, pageSize, hasMore: false },
    });
  }

  if (structured.kind === 'matched') {
    outcome.queryClass = 'structured';
    outcome.resultCount = structured.hits.length;
    const derived = await derivedEffects(deps.sql, structured.hits);
    return ok(c, {
      results: structured.hits.map((h) => ({
        judgmentId: h.judgmentId,
        citationCheckId: null,
        caseTitle: h.caseTitle,
        neutralCitation: h.neutralCitation,
        reporterCitations: h.reporterCitations,
        court: h.court,
        judgmentDate: h.judgmentDate,
        holding: '',
        operativeParagraph: '',
        operativeParagraphNumber: null,
        operativeParagraphVerified: false,
        exactSpan: null,
        // P0. A structured hit carries no passage anyway; this says what is
        // KNOWN about the body, which is a different fact and the one a client
        // needs before it offers to open the document.
        bodyText: h.bodyText,
        verificationState: 'verified' as const,
        verifiedBySource: 'corpus' as const,
        // Read live from the row, never cached — CITATION_HARNESS.md. DERIVED
        // via `precedential-effect.ts`, so the same judgment carries the same
        // currentness whether it was found by `cite:` or by hybrid search.
        overruledStatus: derived.get(h.judgmentId)?.banner ?? h.overruledStatus,
        overruledStatusStored: h.overruledStatus,
        precedentialEffect: derived.get(h.judgmentId)?.effect ?? 'none',
        canAddToMatter: derived.get(h.judgmentId)?.canAdd ?? true,
        unappliedTreatment: derived.get(h.judgmentId)?.unapplied ?? null,
        // Found hardcoded null 11 Aug 2026: runStructured now selects all
        // three (compile.ts), so a partly_set_aside hit here can finally
        // name the affected paragraphs, matching hybrid search.
        overruledByJudgmentId: h.overruledByJudgmentId,
        overruledParas: h.overruledParas,
        overruledNote: h.overruledNote,
        asOf: new Date().toISOString(),
      })),
      unverifiedReferences: [],
      searchId: null,
      parsed: structured.parsed,
      total: structured.total,
      // `total` is a real COUNT(*) over the same predicate, so `hasMore` here is
      // exact rather than a guess from a full page.
      page: { page, pageSize, hasMore: offset + structured.hits.length < structured.total },
    });
  }

  if (structured.kind === 'ambiguous') {
    outcome.queryClass = 'structured_ambiguous';
    outcome.resultCount = structured.hits.length;
    /**
     * Contract §4 P0's third outcome. Every row here is real and verified —
     * nothing invented — but rendered with `ambiguous: true` so the client
     * MUST show a disambiguation rather than an ordinary result list. Verified
     * live against production data: `cite:"2020 INSC 189"` resolves to three
     * distinct Supreme Court judgments today. `CITATION_HARNESS.md` §The
     * fourth concern's sibling gate — an exact-identity lookup that isn't
     * exact must say so, never silently pick one reading for the advocate.
     */
    const derived = await derivedEffects(deps.sql, structured.hits);
    return ok(c, {
      results: structured.hits.map((h) => ({
        judgmentId: h.judgmentId,
        citationCheckId: null,
        caseTitle: h.caseTitle,
        neutralCitation: h.neutralCitation,
        reporterCitations: h.reporterCitations,
        court: h.court,
        judgmentDate: h.judgmentDate,
        holding: '',
        operativeParagraph: '',
        operativeParagraphNumber: null,
        operativeParagraphVerified: false,
        exactSpan: null,
        // P0. A structured hit carries no passage anyway; this says what is
        // KNOWN about the body, which is a different fact and the one a client
        // needs before it offers to open the document.
        bodyText: h.bodyText,
        verificationState: 'verified' as const,
        verifiedBySource: 'corpus' as const,
        overruledStatus: derived.get(h.judgmentId)?.banner ?? h.overruledStatus,
        overruledStatusStored: h.overruledStatus,
        precedentialEffect: derived.get(h.judgmentId)?.effect ?? 'none',
        canAddToMatter: derived.get(h.judgmentId)?.canAdd ?? true,
        unappliedTreatment: derived.get(h.judgmentId)?.unapplied ?? null,
        overruledByJudgmentId: h.overruledByJudgmentId,
        overruledParas: h.overruledParas,
        overruledNote: h.overruledNote,
        asOf: new Date().toISOString(),
      })),
      unverifiedReferences: [],
      searchId: null,
      parsed: structured.parsed,
      total: structured.total,
      /**
       * The ambiguity case P3 exists for. `2026:PHHC:027747-DB` resolves to 15
       * judgments; before continuation the advocate saw five, was told
       * `total: 15`, and the case they asked for was not among them. Every one
       * is now reachable — the ordering is total, so paging cannot skip one.
       */
      page: { page, pageSize, hasMore: offset + structured.hits.length < structured.total },
      ambiguous: true,
    });
  }

  const queryVector = await deps.embedQuery(body.query);
  /**
   * Which ranker, if any, ran out of its statement budget on this request.
   *
   * Collected rather than logged-and-forgotten because the advocate is the one
   * who loses by it: a timed-out sparse arm means authorities that exist were
   * never ranked, and nothing else in the response would say so. Empty on a
   * complete search, and the field is omitted entirely in that case so the
   * ordinary shape is unchanged.
   */
  const degraded: DegradedArm[] = [];
  /** Facts only the ranker knows and only the response can state. */
  const signals: RetrievalSignals = { exactTitleCandidates: 0 };
  // The hybrid path's own class, taken from the same classifier retrieval uses
  // so telemetry and routing can never disagree about what a query was.
  outcome.queryClass = classifyQuery(body.query).shape;
  const retrieved = await hybridSearch(
    research,
    body.query,
    queryVector,
    filters,
    // One more than the page, so `hasMore` is OBSERVED rather than inferred
    // from a full page. A page of exactly `pageSize` results is ambiguous —
    // it is the last page as often as it is not — and telling an advocate
    // there is more when there is not sends them to an empty screen.
    pageSize + 1,
    'hybrid',
    (arm) => {
      if (!degraded.includes(arm)) degraded.push(arm);
      logger.warn({ arm, query_chars: body.query.length }, 'search arm exceeded its statement budget — results are incomplete');
    },
    offset,
    signals,
  );
  const hasMore = retrieved.length > pageSize;
  if (hasMore) retrieved.length = pageSize;

  outcome.resultCount = retrieved.length;
  outcome.degraded = [...degraded];

  // `asOf` — the moment the SERVER read `overruled_status`, never the moment the
  // client received it. `docs/CITATION_HARNESS.md` requires an offline surface to
  // render a cached status "with its as-of date shown", and a client that has to
  // invent that date is fabricating the one number the rule exists to make
  // honest. Stamped once per request so every result in a response agrees.
  const asOf = new Date().toISOString();

  // `searches.user_id` is NOT NULL (SCHEMA_TRUTH), and the contract authenticates
  // this endpoint with a Bearer token — but auth is S5 and not yet built, so in S1
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
  /**
   * The ids come back so each rendered citation carries a handle to its own
   * check. Without one the client can render a badge but cannot answer "why does
   * it say that" — which is exactly what left the verification sheet on a mock.
   *
   * A multi-row `INSERT ... VALUES` returns rows in the order they were supplied,
   * so index alignment with `retrieved` holds. Asserted below rather than assumed,
   * because a silent misalignment would attach one judgment's verification record
   * to a different judgment's badge.
   */
  let checkIds: (string | null)[] = retrieved.map(() => null);
  if (retrieved.length > 0) {
    const inserted = await deps.sql<{ id: string }[]>`
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
      RETURNING id
    `;
    if (inserted.length === retrieved.length) {
      checkIds = inserted.map((row) => row.id);
    } else {
      // Never guess an alignment. A wrong citationCheckId is worse than none:
      // it would point the advocate at another judgment's verification record.
      logger.error(
        { inserted: inserted.length, results: retrieved.length },
        'citation_checks insert returned a different row count — citationCheckId withheld',
      );
    }
  }

  return ok(c, {
    results: retrieved.map((r, i) => ({
      judgmentId: r.judgmentId,
      // The handle for GET /citations/:id — what each tier did, and when.
      // Null when alignment could not be guaranteed; never a guessed id.
      citationCheckId: checkIds[i] ?? null,
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
      // The number the COURT printed. Null means we cleaned the text but did not
      // identify a paragraph — the client must not render that as the court's own
      // words behind an authority rule.
      operativeParagraphNumber: r.operativeParagraphNumber,
      // True when the paragraph above was located from a verified character
      // offset (Stage 13) rather than fuzzy-matching the chunk text.
      operativeParagraphVerified: r.operativeParagraphVerified,
      // Stage 13: the chunk's literal, byte-verified span in the judgment's
      // own text. Null exactly when no verified position is available.
      exactSpan: r.exactSpan,
      /**
       * P0. The body-text state, read live from the row at request time, in the
       * quality contract's own vocabulary.
       *
       * The result is still on the page — its citation, title and court are
       * undamaged and an advocate must still be able to FIND it.
       * `evidenceWithheld` says every body-derived field above is empty by
       * REFUSAL rather than by absence, which is the half a client can act on.
       *
       * `state` is never `CLEAN` and never will be: no writer in this repository
       * has ever proved an extraction faithful, so `TEXT_UNKNOWN` is the honest
       * value for nine documents in ten (NEW2, bus 1022). Copy is the client's;
       * the server states the fact only.
       */
      bodyText: r.bodyText,
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      // Read live from the row on every request. Never cached. DERIVED via
      // `precedential-effect.ts` — still one of the four wire values, so a
      // client reading only this field behaves exactly as it does today.
      overruledStatus: r.overruledStatus,
      /** The stored column beside the derived banner. Admin monitor only. */
      overruledStatusStored: r.overruledStatusStored,
      /** Layer 2 — what happened, in five values rather than four. */
      precedentialEffect: r.precedentialEffect,
      /** Layer 3 — whether add-to-matter will accept this authority. */
      canAddToMatter: r.canAddToMatter,
      /**
       * A later court's verified adverse edge that the corpus has not applied.
       * NOT a banner and must never be rendered as one. Non-null for 2
       * judgments today; it exists so the fact is not silent while
       * `applyOverruledChange` stays the single writer.
       */
      unappliedTreatment: r.unappliedTreatment,
      overruledByJudgmentId: r.overruledByJudgmentId,
      overruledParas: r.overruledParas,
      overruledNote: r.overruledNote,
      asOf,
    })),
    // Nothing can be dropped in S1: results ARE corpus rows, so there is no
    // model-claimed reference that failed to resolve. The field is always
    // present, never omitted.
    unverifiedReferences: [],
    /**
     * Court categories the corpus holds NO judgment for — `district` and
     * `tribunal` today. Additive and provisional per `CLAUDE.md` §6b: a client
     * that ignores it behaves exactly as before.
     *
     * It exists because an empty result from a category we hold nothing in is
     * indistinguishable, on screen, from "your query matched nothing" — and the
     * advocate concludes we have no case on their point when we were never
     * asked. The same reasoning `CITATION_HARNESS.md` applies to a dropped
     * citation, applied to a filter: absence has to state itself.
     *
     * Computed per request rather than cached, so the day a district-court
     * ingest lands the category stops being listed without a deploy.
     */
    unpopulatedCourtCategories: await unpopulatedCategories(deps.sql),
    /**
     * Present ONLY when a ranker ran out of its budget, so the ordinary
     * response shape is byte-identical to what clients already parse.
     *
     * The same rule as `unpopulatedCourtCategories` one field above: absence
     * has to state itself. A search whose sparse half timed out returns fewer
     * authorities than exist, and the advocate has no other way to learn that
     * — `CITATION_HARNESS.md`'s zero silent-drop threshold is about exactly
     * this, and a recall loss leaves no trace unless the server leaves one.
     */
    ...(degraded.length > 0 ? { degraded } : {}),
    /**
     * P3. Where this page sits, and whether there is another.
     *
     * No `total` on the hybrid path, and that is honesty rather than an
     * omission: a fused ranking has no COUNT(*) behind it — the rankers return
     * candidates, not a match set — so any total here would be invented. The
     * structured path DOES carry a real `total` because it is a SQL predicate
     * with a real count, and it reports one.
     *
     * `hasMore` is observed by over-fetching one result, never guessed from a
     * full page. It also goes false at `REACHABLE_DEPTH`, where the rankers
     * genuinely stop producing candidates — "there are no more" is then the
     * true statement, not "we stopped looking".
     */
    page: { page, pageSize, hasMore },
    /**
     * The case-title sibling of the structured path's `ambiguous: true`.
     *
     * Present only when an exact case-title lookup matched MORE THAN ONE
     * judgment, so the ordinary response is byte-identical to what clients
     * parse today. NEW1 measured 74 of 229 real case-title queries naming 2-16
     * different cases; before this the advocate was shown one of them at rank 1
     * and nothing said the rest existed.
     *
     * The count is the honest thing to send. What to DO with it — a
     * disambiguation list rather than a result list — is the client's, and the
     * server states no copy.
     */
    ...(signals.exactTitleCandidates > 1
      ? { ambiguous: true, exactTitleCandidates: signals.exactTitleCandidates }
      : {}),
    searchId,
  });
}
