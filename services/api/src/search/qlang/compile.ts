/**
 * Compile a parsed query into SQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY VALUE IS BOUND. NOTHING IS INTERPOLATED.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module takes text a stranger typed and turns it into a database query,
 * which is the classic place to lose a product. Every user value below arrives
 * through a `postgres.js` placeholder — there is no string concatenation of user
 * input anywhere in this file, and the two places that *look* like concatenation
 * (`'%' || ... || '%'` for ILIKE, and `quote_literal(...) || ':*'` for a prefix
 * tsquery) build the pattern **inside SQL from a bound parameter**, which is the
 * safe form.
 *
 * `to_tsquery` deserves its own warning: it treats `:`, `&`, `|`, `!` and
 * parentheses as operators, so passing raw user text to it is an injection into
 * the *query planner* even when it cannot escape the string. Free text therefore
 * goes through `plainto_tsquery` / `phraseto_tsquery`, which take a plain string
 * and do the escaping themselves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE CITATION RULE, EXPRESSED IN TWO LANGUAGES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `cite:` compares `upper(regexp_replace(…, '[^A-Za-z0-9]', '', 'g'))` on the SQL
 * side against {@link citationLookupKey} on the JS side. They are the same rule
 * written twice because one of them has to run in the database, and migration
 * `0026` indexes exactly that expression. A change to either without the other
 * silently stops citations matching — which is why the rule is stated in all
 * three places and tested against the live corpus.
 */
import type { Sql } from 'postgres';

import { canonicalAct } from '@lawmind/ingest/sections';

import { citationLookupKey } from '../query-shape.ts';
import {
  bodyTextGrade,
  bodyTextState,
  isBodyTextSafe,
  type BodyTextGrade,
  type BodyTextState,
} from '../body-text-safety.ts';
import { distinctCourts } from '../court-category.ts';
import type { Field, Node } from './parse.ts';
import {
  caseNumberSuffixPattern,
  normaliseTypeToken,
  parseCaseNumber,
} from '../case-number.ts';

/** A nested `postgres.js` fragment. Composable, and always parameterised. */
export type Frag = ReturnType<Sql>;

/**
 * Turn `*` and `?` into their SQL `LIKE` equivalents, and escape everything the
 * user did not mean as a wildcard.
 *
 * **Order matters and is easy to get wrong.** `%` and `_` are escaped FIRST, so
 * a literal `%` an advocate typed cannot become a wildcard; only then are `*`
 * and `?` translated into wildcards they did mean.
 */
function likePattern(value: string, wildcard: boolean): string {
  const escaped = value.replace(/([%_\\])/g, '\\$1');
  return wildcard ? escaped.replace(/\*/g, '%').replace(/\?/g, '_') : `%${escaped}%`;
}

/** Free text, one term. Phrases keep their word order; bare words do not. */
function textMatch(sql: Sql, value: string, phrase: boolean, wildcard: boolean): Frag {
  if (wildcard) {
    /**
     * Prefix matching needs `to_tsquery`, which parses operators — so the stem
     * is bound and `quote_literal` does the escaping **in SQL**, never here.
     */
    const stem = value.replace(/[*?].*$/, '');
    return sql`j.full_text_tsv @@ to_tsquery('english', quote_literal(${stem}) || ':*')`;
  }
  return phrase
    ? sql`j.full_text_tsv @@ phraseto_tsquery('english', ${value})`
    : sql`j.full_text_tsv @@ plainto_tsquery('english', ${value})`;
}

/**
 * Whether `j` (a `judgments` row aliased `j`) carries the citation identified
 * by `key` — an already-normalised {@link citationLookupKey} value.
 *
 * **The one definition of "this judgment IS that citation".** Originally
 * inline in `fieldMatch`'s `cite` case; extracted 11 Aug 2026 so
 * `citesJudgmentId` paragraph resolution (`judgments/citations.ts`) can reuse
 * the exact same three-source match — neutral citation, reporter citations,
 * and the courts'-own-words alias concordance — rather than writing a second,
 * driftable copy of it. This file's own header already names that drift as
 * the failure mode worth guarding against.
 *
 * **Three places a citation can be found, and the third is the one that makes
 * this usable.**
 *
 * Our source digitised S.C.R., so every judgment carries an S.C.R. citation
 * and nothing else — measured across all 38,341 rows: AIR 0, SCC 0. An
 * advocate types `AIR 1973 SC 1461`, which is how *Kesavananda* is actually
 * cited, and the first two clauses find nothing.
 *
 * `judgment_citation_aliases` holds the concordance derived from the courts'
 * own text — 4,097 aliases, each printed beside the S.C.R. citation by at
 * least two separate judgments. Without this clause the table would exist and
 * change nothing.
 */
export function citationMatchFragment(sql: Sql, key: string): Frag {
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * EVERY ARM MUST BE BITMAP-INDEXABLE, OR ONE OF THEM READS THE WHOLE TABLE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The three sources below are unchanged and so is the set this matches. What
   * changed, 19 Aug 2026, is that two arms were written as CORRELATED
   * subqueries — and a correlated subquery cannot take part in a `BitmapOr`.
   * Because the arms are `OR`ed, a row failing the others might still pass that
   * one, so **every row of `judgments` had to be evaluated.**
   *
   * NEW1 measured the consequence (bus 0730/0731): `structuredExactness` at
   * **0.00%**, all **120 of 120** real citations timing out at 8 s through
   * `runStructured`, one query observed running **31 minutes** before it was
   * cancelled by hand. Not an unlucky-selectivity edge case — the entire
   * predicate shape, every time, on the live `/search` route inside Gate S1's
   * 3-second budget. `CLAUDE.md` calls Gate S2 a hard stop; this was it.
   *
   * Measured on the local cluster, same citation, `EXPLAIN`:
   *
   *   before   Index Scan Backward using judgments_judgment_date_idx
   *            cost 50,116,705 · est. 12,367,043 rows · times out at 20 s
   *   after    BitmapOr of all three arms, then Sort
   *            cost 1,342 · **3 ms**
   *
   * **It was NOT enough to fix the `unnest` arm.** That was the obvious suspect
   * — it is the one `exactCitation`'s 17 Aug header names — but replacing it
   * alone left the plan completely unchanged, still a backward date scan at cost
   * 51,353,396. Each arm was then planned in isolation: the neutral arm is an
   * index scan, the array arm a bitmap scan, and `A OR B` already BitmapOrs at
   * cost 188. **The alias `EXISTS` was equally fatal on its own**, and it is the
   * arm nobody had suspected.
   *
   * WHY THE PLANNER'S MISTAKE IS SO LARGE. With an unindexable arm in the `OR`
   * it estimates ~8-12M matching rows, so `ORDER BY judgment_date DESC LIMIT 2`
   * looks cheap — walk the date index backward and stop as soon as two match.
   * The predicate actually matches ONE row, so that walk reads the corpus. The
   * fix is not a hint or a rewritten `ORDER BY`; it is making the estimate
   * honest by making every arm indexable.
   *
   * ── arm 2: the same substitution `exactCitation` already made
   *
   * `lawmind_citation_keys(reporter_citations)` is `IMMUTABLE`, is backed by
   * `judgments_reporter_citation_keys_gin` (migration 0053), and its body is
   * `upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g'))` over `unnest` —
   * **byte-identical** to the normalisation it replaces, verified by reading
   * `pg_get_functiondef` rather than assuming. A NULL element compared under the
   * old arm yielded NULL, i.e. no match, exactly as the function's
   * `WHERE rc IS NOT NULL` does.
   *
   * ── arm 3: `ARRAY(...)` instead of a correlated `EXISTS`
   *
   * `j.id = ANY (ARRAY(SELECT …))` is a scalar array expression, so it plans as
   * an `InitPlan` evaluated ONCE plus a `Bitmap Index Scan on judgments_pkey` —
   * which is a arm a `BitmapOr` can take. The correlated `EXISTS` it replaces
   * had to be re-run per candidate row and could not.
   *
   * Bounded, and checked rather than hoped: `judgment_citation_aliases` holds
   * 4,394 rows over 4,394 distinct `alias_key` values — **at most one judgment
   * per key** — so the constructed array is a single element. If that ever
   * became one-to-many the array stays small for the same reason the concordance
   * is useful: a key identifies a decision.
   *
   * ── why not `exactCitation`'s `UNION`
   *
   * It cannot be used here and NEW1 was right about that. `compileWhere`
   * composes this fragment inside arbitrary boolean expressions
   * (`judge:X AND cite:Y`, `NOT (…)`), and a `UNION` of two `SELECT`s is not a
   * boolean fragment. This fix needs no set operation: it stays one `OR`, and
   * composes exactly as before.
   */
  return sql`(
    upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = ${key}
    OR lawmind_citation_keys(j.reporter_citations) @> ARRAY[${key}::text]
    OR j.id = ANY (ARRAY(
      SELECT a.judgment_id FROM judgment_citation_aliases a WHERE a.alias_key = ${key})))`;
}

/**
 * One field predicate.
 *
 * **`judge`, `act` and `section` are EXISTS sub-queries, not joins.** A join
 * would multiply rows — a judgment decided by five judges would appear five
 * times, and `LIMIT 20` would then return four judgments while claiming twenty.
 * `EXISTS` asks the only question being asked: does this judgment have one.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A COURT PATTERN RESOLVED TO NAMES, BECAUSE `ILIKE '%…%'` CANNOT USE AN INDEX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `court:"High Court of Manipur"` compiles to `j.court ILIKE '%…%'`. A leading
 * `%` makes that unindexable, and `judgments_court_idx` sits unused while
 * Postgres reads the table. Measured here, 2 September 2026:
 *
 *     court:"…Manipur" AND bail, population fence, court ILIKE
 *       -> Parallel Seq Scan on judgments, Rows Removed by Filter: 3,748,606
 *       -> 23,760 ms
 *     the same query with court = ANY(ARRAY['High Court of Manipur'])
 *       -> Index Scan using judgments_court_idx
 *       -> 139 ms
 *
 * **The set of rows is identical and that is checkable rather than hoped.** The
 * corpus holds 27 distinct court names; the resolver applies the SAME `ILIKE`
 * pattern to that list, so `= ANY(<the names that matched>)` selects exactly the
 * rows `ILIKE` would have. It is the substitution `search/route.ts` already
 * makes for court CATEGORIES, applied to a court PATTERN.
 *
 * `null` — nothing resolved, or no resolution was attempted — falls back to the
 * `ILIKE`. An empty ARRAY would be wrong in one specific way: the caller may not
 * have run the resolver at all, and `= ANY('{}')` matches nothing, which would
 * turn "not resolved" into "no such court" and silently empty the result.
 */
export type ResolvedCourts = ReadonlyMap<number, readonly string[]>;

function fieldMatch(
  sql: Sql,
  field: Field,
  value: string,
  phrase: boolean,
  wildcard: boolean,
  /** The court names this term's pattern resolved to, keyed by the term's offset. */
  resolvedCourts?: readonly string[] | undefined,
): Frag {
  switch (field) {
    case 'party':
      return sql`j.case_title ILIKE ${likePattern(value, wildcard)}`;

    case 'judge':
      return sql`EXISTS (
        SELECT 1 FROM judgment_judges jj
         WHERE jj.judgment_id = j.id
           AND jj.judge_name ILIKE ${likePattern(value, wildcard)})`;

    case 'cite':
      return citationMatchFragment(sql, citationLookupKey(value));

    /**
     * A REGISTRY SERIAL, matched the way one behaves.
     *
     * This used to be `case_number ILIKE '%<value>%'`, which required the
     * advocate to type the eCourts stored spelling character for character —
     * `CWJC/2231/2006`, never `CWJC 2231 of 2006`. Measured on 60 judgments
     * through the real route: the stored form found 96.7% and the printed form
     * found 10.3%. See `case-number.ts` for the numbers and the mechanism.
     *
     * Now: the SERIAL and YEAR carry the match, anchored so
     * `judgments_case_number_trgm` can serve it, and the type token filters the
     * small candidate set that comes back. Both spellings compile to the same
     * predicate, and neither is faster than the other by accident.
     *
     * The unparsed input keeps the old substring behaviour rather than
     * returning nothing — `caseno:"CWJC"` is a legitimate "show me the writs"
     * query and this is not the place to take it away.
     */
    case 'caseno': {
      const parsed = wildcard ? null : parseCaseNumber(value);
      if (parsed === null) return sql`j.case_number ILIKE ${likePattern(value, wildcard)}`;
      const suffix: Frag = sql`j.case_number LIKE ${caseNumberSuffixPattern(parsed)}`;
      if (parsed.typeToken === null) return suffix;
      /**
       * Punctuation stripped from BOTH sides, because the stored token is not
       * normalised: Patna stores `CR. MISC./606/2011` and Orissa stores
       * `CRLMC/999/2021`. A dictionary mapping one registry's spelling to
       * another's would have to be invented, and `CLAUDE.md` forbids that.
       */
      return sql`(${suffix} AND upper(regexp_replace(split_part(j.case_number, '/', 1),
                 '[^A-Za-z0-9]', '', 'g')) = ${normaliseTypeToken(parsed.typeToken)})`;
    }

    /**
     * The eCourts Case Number Record — `docs/ai/CANONICAL_IDENTITY.md`'s
     * canonical cross-source identity key, 100% populated (`docs/SCHEMA_TRUTH.md`
     * §judgments). An exact identifier, never a fuzzy search term: an advocate
     * typing a CNR from a court notice or an eCourts printout wants that exact
     * case or nothing, never a substring's worth of unrelated matches. Trimmed
     * and upper-cased to match how `backfill-cnr.ts`/the real loaders store it.
     */
    case 'cnr':
      return sql`j.cnr = ${value.trim().toUpperCase()}`;

    case 'court':
      return resolvedCourts === undefined
        ? sql`j.court ILIKE ${likePattern(value, wildcard)}`
        : sql`j.court = ANY(${resolvedCourts as string[]}::text[])`;

    case 'type':
      /**
       * 299 judgments carry a null `case_type` because their case number states
       * no side. They are EXCLUDED rather than guessed into one — the rule the
       * column's own comment states, and the same rule the existing filter
       * follows.
       */
      return sql`j.case_type = ${value.toLowerCase()}`;

    case 'date':
      // A bare year means the whole year; a full date means that day.
      return value.length === 4
        ? sql`date_part('year', j.judgment_date) = ${Number(value)}`
        : sql`j.judgment_date = ${value}::date`;

    case 'act':
      /**
       * **Matched on `act_key`, not on the printed name.** The corpus names one
       * statute several ways — measured over 97,806 references: `Indian Penal
       * Code, 1860` 10,677 times and `Indian Penal Code` 3,300; `Code of
       * Criminal Procedure, 1973` 9,895, `Code of Criminal Procedure` 3,062 and
       * `Criminal Procedure Code` 1,426. Matching the printed name would show an
       * advocate a third of the cases on CrPC s.482 with no way to know the rest
       * existed.
       *
       * `canonicalAct` runs the same normalisation the ingest applied, so
       * `act:"CrPC"`, `act:"Criminal Procedure Code"` and `act:"Code of Criminal
       * Procedure, 1973"` all reach the same rows. The `act_named` fallback
       * stays for statutes outside the synonym list.
       */
      return sql`EXISTS (
        SELECT 1 FROM judgment_statute_refs r
         WHERE r.judgment_id = j.id
           AND (r.act_key = ${canonicalAct(value)}
                OR r.act_named ILIKE ${likePattern(value, wildcard)}))`;

    case 'section':
      /**
       * **The BNS bridge, and it is deliberately inert today.**
       *
       * BNS, BNSS and BSA replaced the IPC, CrPC and Evidence Act on 1 July
       * 2024, so a search for BNS s.103 should also reach the pre-2024 judgments
       * deciding IPC s.302 — that back-catalogue is the entire value of the
       * corpus for a criminal practitioner.
       *
       * The join to `statute_mappings` is written and **currently resolves
       * nothing, because that table is empty by design**: `statutes.ts` records
       * that indiacode publishes no IPC↔BNS correspondence and `DOMAIN_TRUTH.md`
       * forbids inventing one. This is the honest shape — the query works the
       * moment a sourced mapping exists, and until then it returns exactly the
       * sections the judgments actually cite, which is the truth.
       */
      return sql`EXISTS (
        SELECT 1 FROM judgment_statute_refs r
         WHERE r.judgment_id = j.id
           AND (upper(r.section_number) = ${value.toUpperCase()}
                OR EXISTS (
                  SELECT 1 FROM statute_mappings m
                   WHERE upper(m.new_section) = ${value.toUpperCase()}
                     AND upper(m.old_section) = upper(r.section_number))))`;

    case 'text':
      return textMatch(sql, value, phrase, wildcard);
  }
}

/**
 * Compile an AST to a boolean SQL fragment.
 *
 * Recursion mirrors the grammar exactly, so precedence is carried by the tree
 * rather than re-derived here — the parser already decided that `a AND b OR c`
 * groups as `(a AND b) OR c`, and re-implementing precedence in the compiler
 * would be a second opinion able to disagree with the first.
 */
export function compileWhere(sql: Sql, node: Node, resolved?: ResolvedCourts): Frag {
  switch (node.kind) {
    case 'and':
      return sql`(${compileWhere(sql, node.left, resolved)} AND ${compileWhere(sql, node.right, resolved)})`;
    case 'or':
      return sql`(${compileWhere(sql, node.left, resolved)} OR ${compileWhere(sql, node.right, resolved)})`;
    case 'not':
      return sql`(NOT ${compileWhere(sql, node.operand, resolved)})`;
    case 'term':
      return fieldMatch(
        sql,
        node.field,
        node.value,
        node.phrase,
        node.wildcard,
        node.field === 'court' ? resolved?.get(node.offset) : undefined,
      );
    case 'range':
      /**
       * A year range is inclusive at both ends and must cover the whole of the
       * closing year — `[2019 TO 2024]` means up to 31 December 2024, not up to
       * 1 January. Off by one here silently drops a year of judgments.
       */
      return sql`j.judgment_date BETWEEN ${`${node.from.length === 4 ? `${node.from}-01-01` : node.from}`}::date
                                     AND ${`${node.to.length === 4 ? `${node.to}-12-31` : node.to}`}::date`;
    case 'near':
      /**
       * `tsquery_phrase(a, b, n)` is Postgres's own distance operator, and both
       * sides go through `phraseto_tsquery` so neither can carry an operator
       * into the parser.
       */
      return sql`j.full_text_tsv @@ tsquery_phrase(
        phraseto_tsquery('english', ${node.left}),
        phraseto_tsquery('english', ${node.right}),
        ${node.distance})`;
  }
}

/**
 * The columns every structured route selects, and the one mapper that reads
 * them.
 *
 * Extracted 2 September 2026 when the fenced execution below became a second
 * caller. Two hand-written copies of a fifteen-column projection is how one of
 * them quietly stops selecting `overruled_note` — this file has already recorded
 * that exact defect once, in `StructuredHit.overruledByJudgmentId`.
 */
type StructuredRow = {
  id: string;
  case_title: string;
  neutral_citation: string | null;
  reporter_citations: string[];
  court: string;
  judgment_date: string;
  case_number: string | null;
  bench: string | null;
  overruled_status: string;
  overruled_by_judgment_id: string | null;
  overruled_paras: number[] | null;
  overruled_note: string | null;
  script_quality: string | null;
  script_quality_method: string | null;
};

function structuredColumns(sql: Sql): Frag {
  return sql`j.id, j.case_title, j.neutral_citation, j.reporter_citations,
           j.court, j.judgment_date::text AS judgment_date, j.case_number, j.bench,
           j.overruled_status::text AS overruled_status,
           j.overruled_by_judgment_id, j.overruled_paras, j.overruled_note,
           -- P0. A structured query is a METADATA route and must keep finding a
           -- judgment whose body failed to extract. The verdict rides along so
           -- the client can say so; the row is never dropped for it.
           j.script_quality, j.script_quality_method`;
}

function toStructuredHit(r: StructuredRow): StructuredHit {
  return {
    judgmentId: r.id,
    caseTitle: r.case_title,
    neutralCitation: r.neutral_citation,
    reporterCitations: r.reporter_citations,
    court: r.court,
    judgmentDate: r.judgment_date,
    caseNumber: r.case_number,
    bench: r.bench,
    overruledStatus: r.overruled_status,
    overruledByJudgmentId: r.overruled_by_judgment_id,
    overruledParas: r.overruled_paras,
    overruledNote: r.overruled_note,
    bodyText: {
      state: bodyTextState(r.script_quality),
      grade: bodyTextGrade(r.script_quality, r.script_quality_method),
      evidenceWithheld: !isBodyTextSafe(r.script_quality),
    },
  };
}

/**
 * The population predicate for a set of fence conjuncts, ANDed onto `WHERE true`.
 *
 * Shaped for {@link countBoundedPopulation} in `retrieve.ts`, so the number the
 * admission probe counts and the population the fence executes over are built by
 * the same function from the same nodes. Two spellings of one population is how
 * a probe comes to certify a query it was not describing.
 *
 * `[]` returns an empty fragment, which composes to `WHERE true` — the caller
 * must not reach here with an empty fence, and `structured.ts` does not.
 */
export function fenceWhere(sql: Sql, fence: Node[], resolved?: ResolvedCourts): Frag {
  return fence.reduce<Frag>(
    (acc, node) => sql`${acc} AND (${compileWhere(sql, node, resolved)})`,
    sql``,
  );
}

/**
 * Resolve every `court:` pattern in the query to the court names it matches.
 *
 * ONE round trip for the whole query, and it reuses `distinctCourts` — the loose
 * index scan `court-category.ts` already wrote and already defends: 26 index
 * descents rather than the 15.2M-entry scan a `SELECT DISTINCT` plans as, ~1 ms
 * warm. Reading it here rather than caching keeps the property that file argues
 * for: an ingest landing a new court becomes filterable without a deploy.
 *
 * The matching is done in TypeScript against the same `%…%` / `*`→`%` semantics
 * `likePattern` compiles, so the resolved set and the `ILIKE` it replaces cannot
 * disagree about what a pattern means.
 */
export async function resolveCourts(
  sql: Sql,
  terms: readonly { offset: number; value: string; wildcard: boolean }[],
): Promise<ResolvedCourts> {
  const resolved = new Map<number, readonly string[]>();
  if (terms.length === 0) return resolved;
  const courts = await distinctCourts(sql);
  if (courts.length === 0) return resolved;

  /**
   * The match is done by POSTGRES, with the same `ILIKE` operator and the same
   * `likePattern` output the predicate it replaces would have used. Re-deriving
   * LIKE semantics in TypeScript would be a second implementation of `%`, `_`
   * and their escapes — and the two only have to disagree once, on one court
   * name, for a filtered search to silently return nothing.
   *
   * It is one round trip over at most a couple of dozen names, so the cost is
   * the round trip and nothing else.
   */
  const rows = await sql<{ term_offset: number; court: string }[]>`
    SELECT t.term_offset, c.court
      FROM unnest(${terms.map((t) => t.offset)}::int[],
                  ${terms.map((t) => likePattern(t.value, t.wildcard))}::text[])
             -- offset is a RESERVED WORD in PostgreSQL and cannot be a column
             -- alias here: it parses as the start of an OFFSET clause and the
             -- statement fails with: syntax error at or near "offset".
             AS t(term_offset, pattern),
           unnest(${courts}::text[]) AS c(court)
     WHERE c.court ILIKE t.pattern`;

  for (const t of terms) resolved.set(t.offset, []);
  for (const r of rows) {
    resolved.set(r.term_offset, [...(resolved.get(r.term_offset) ?? []), r.court]);
  }
  return resolved;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OTHER FENCE: MATERIALISE THE MATCH SET, WHEN THE MATCH SET IS THE SMALL
 * THING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `runStructuredBounded` above fences on the query's STRUCTURE and is right when
 * the population is small. This one fences on the whole PREDICATE and is right
 * when the match set is small. They are complementary, and the measurements say
 * so plainly — all on this box, 2 September 2026, against the live corpus:
 *
 * | query | plain plan | this shape |
 * | --- | --- | --- |
 * | `court:"…Karnataka" AND kesavananda` (94 rows) | **15,165 ms** | **10 ms** |
 * | `bail AND murder` (153,857 rows) | 8,138 ms | 412 ms |
 * | `kept` (827,690 rows) | 81,920 ms | **100,077 ms** |
 *
 * ── WHY THE PLAIN PLAN IS CATASTROPHIC FOR A *RARE* TERM ────────────────────
 *
 * `EXPLAIN` on the first row, before:
 *
 *     Limit
 *       -> Incremental Sort  (Presorted Key: judgment_date)
 *            -> Index Scan Backward using judgments_judgment_date_idx
 *                 Filter: court ~~* '%…%' AND full_text_tsv @@ 'kesavananda'
 *                 cost 9,283,133
 *
 * The planner cannot cost a tsquery it was handed as a parameter, so it assumes
 * matches are dense and walks the date index backward expecting to fill
 * `LIMIT 5` almost immediately. The predicate matches 94 rows out of 18.7
 * million, so the walk reads the corpus. **The rarer the term, the worse it
 * gets** — the exact mirror image of the document-frequency bound, and the same
 * mistake `citationMatchFragment` above already records for citations.
 *
 * ── AND WHY IT IS THE RIGHT PLAN FOR A COMMON ONE ───────────────────────────
 *
 * The third row is the same fact read the other way. When matches ARE dense the
 * backward walk finds five in 60 ms, and materialising 827,690 ids spills past
 * `work_mem` and costs a hundred seconds. So this shape is applied ONLY where it
 * was measured to win — `structured.ts` holds the threshold and its derivation —
 * and a query outside that band keeps exactly the plan it has today.
 *
 * ── ONE SCAN FOR BOTH ANSWERS ───────────────────────────────────────────────
 *
 * The count and the page come out of the SAME materialised CTE. Two statements
 * would scan twice, and — worse — could disagree, because they would be two
 * snapshots of a corpus the ingest fleet is writing to. `total` and `hasMore`
 * are exact with respect to the page they are returned beside.
 */
export async function runStructuredCandidates(
  sql: Sql,
  node: Node,
  limit: number,
  offset = 0,
  resolved?: ResolvedCourts,
): Promise<{ total: number; hits: StructuredHit[] }> {
  const rows = await sql<(StructuredRow & { total: string })[]>`
    WITH candidates AS MATERIALIZED (
      SELECT j.id, j.judgment_date
        FROM judgments j
       WHERE ${compileWhere(sql, node, resolved)}
    ),
    counted AS (SELECT count(*)::text AS total FROM candidates),
    page AS (
      SELECT c.id
        FROM candidates c
       -- The same total order runStructured uses, so a continuation is exact:
       -- judgment_date alone is not one, and a cursor built on it silently
       -- repeats and silently skips.
       ORDER BY c.judgment_date DESC, c.id DESC
       OFFSET ${offset}
       LIMIT ${limit}
    )
    SELECT ${structuredColumns(sql)}, counted.total
      FROM page
      JOIN judgments j ON j.id = page.id, counted
     ORDER BY j.judgment_date DESC, j.id DESC`;

  /**
   * `counted` is a scalar joined onto every row, so the total survives an EMPTY
   * page — which is exactly what a deep `offset` produces, and returning 0 there
   * would tell an advocate the corpus holds nothing when the previous page held
   * results. The zero is only correct when there genuinely are no candidates.
   */
  if (rows.length === 0) {
    const [only] = await sql<{ total: string }[]>`
      SELECT count(*)::text AS total FROM judgments j WHERE ${compileWhere(sql, node, resolved)}`;
    return { total: Number(only?.total ?? 0), hits: [] };
  }
  return { total: Number(rows[0]!.total), hits: rows.map(toStructuredHit) };
}

export type StructuredHit = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string | null;
  reporterCitations: string[];
  court: string;
  judgmentDate: string;
  caseNumber: string | null;
  bench: string | null;
  /** Read LIVE from the row on every query — `CITATION_HARNESS.md`, never cached. */
  overruledStatus: string;
  /**
   * Found missing 11 Aug 2026: this query never selected these three, so
   * `route.ts` hardcoded them to null for every structured-search result —
   * meaning a `cite:`/`judge:`/etc. hit on a `partly_set_aside` judgment
   * could show the LAW MOVED status but never which paragraphs fell or the
   * note, unlike hybrid search (`retrieve.ts`), which already selects both.
   */
  overruledByJudgmentId: string | null;
  overruledParas: number[] | null;
  overruledNote: string | null;
  /**
   * P0. What is KNOWN about this judgment's body text. The row is still here on
   * purpose — a structured query resolves identity fields, and identity fields
   * are not damaged by a body that failed to extract.
   *
   * Never `CLEAN`: no writer in this repository has ever proved an extraction
   * faithful, so `TEXT_UNKNOWN` is the honest value for a document nothing has
   * convicted. `search/body-text-safety.ts` carries NEW2's measurement.
   */
  bodyText: { state: BodyTextState; grade: BodyTextGrade; evidenceWithheld: boolean };
};

/**
 * Run a compiled query.
 *
 * **Ordering is by date, not by relevance, and that is deliberate.** A
 * structured query is a filter, not a ranking: every row either satisfies
 * `judge:Kania AND section:138` or it does not, and inventing a relevance score
 * across rows that are all exactly as relevant would be a fiction the advocate
 * cannot check. Most recent first is the ordering a lawyer expects from a
 * filtered list.
 */
export async function runStructured(
  sql: Sql,
  node: Node,
  limit: number,
  /**
   * P3. How many rows to skip — the continuation offset, defaulted so every
   * existing caller keeps the page it already got.
   *
   * An OFFSET rather than a keyset cursor, and the reason is the workload
   * rather than fashion: the ambiguity case this exists for is a citation
   * resolving to at most a few hundred judgments, where OFFSET reads a few
   * hundred index entries. A keyset cursor would be the right answer for deep
   * paging over millions and is the wrong complexity for this.
   */
  offset = 0,
  /** See {@link ResolvedCourts} — an indexable court predicate, when resolved. */
  resolved?: ResolvedCourts,
): Promise<StructuredHit[]> {
  const rows = await sql<StructuredRow[]>`
    SELECT ${structuredColumns(sql)}
      FROM judgments j
     WHERE ${compileWhere(sql, node, resolved)}
     -- j.id is a TIE-BREAK, not a second sort key anyone reads. judgment_date
     -- alone is not a total order (15 judgments can share one citation and one
     -- week), so a continuation built on it silently repeats and silently skips.
     ORDER BY j.judgment_date DESC, j.id DESC
     OFFSET ${offset}
     LIMIT ${limit}`;

  return rows.map(toStructuredHit);
}

/** How many judgments satisfy the query, independent of the page returned. */
export async function countStructured(
  sql: Sql,
  node: Node,
  resolved?: ResolvedCourts,
): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM judgments j WHERE ${compileWhere(sql, node, resolved)}`;
  return row?.n ?? 0;
}
