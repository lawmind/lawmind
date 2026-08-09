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

import { citationLookupKey } from '../query-shape.ts';
import type { Field, Node } from './parse.ts';

/** A nested `postgres.js` fragment. Composable, and always parameterised. */
type Frag = ReturnType<Sql>;

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
 * One field predicate.
 *
 * **`judge`, `act` and `section` are EXISTS sub-queries, not joins.** A join
 * would multiply rows — a judgment decided by five judges would appear five
 * times, and `LIMIT 20` would then return four judgments while claiming twenty.
 * `EXISTS` asks the only question being asked: does this judgment have one.
 */
function fieldMatch(sql: Sql, field: Field, value: string, phrase: boolean, wildcard: boolean): Frag {
  switch (field) {
    case 'party':
      return sql`j.case_title ILIKE ${likePattern(value, wildcard)}`;

    case 'judge':
      return sql`EXISTS (
        SELECT 1 FROM judgment_judges jj
         WHERE jj.judgment_id = j.id
           AND jj.judge_name ILIKE ${likePattern(value, wildcard)})`;

    case 'cite': {
      // The same normalisation as citationLookupKey, on both sides.
      const key = citationLookupKey(value);
      return sql`(
        upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = ${key}
        OR EXISTS (
          SELECT 1 FROM unnest(j.reporter_citations) AS rc
           WHERE upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) = ${key}))`;
    }

    case 'caseno':
      return sql`j.case_number ILIKE ${likePattern(value, wildcard)}`;

    case 'court':
      return sql`j.court ILIKE ${likePattern(value, wildcard)}`;

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
      return sql`EXISTS (
        SELECT 1 FROM judgment_statute_refs r
         WHERE r.judgment_id = j.id
           AND r.act_named ILIKE ${likePattern(value, wildcard)})`;

    case 'section':
      return sql`EXISTS (
        SELECT 1 FROM judgment_statute_refs r
         WHERE r.judgment_id = j.id
           AND upper(r.section_number) = ${value.toUpperCase()})`;

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
export function compileWhere(sql: Sql, node: Node): Frag {
  switch (node.kind) {
    case 'and':
      return sql`(${compileWhere(sql, node.left)} AND ${compileWhere(sql, node.right)})`;
    case 'or':
      return sql`(${compileWhere(sql, node.left)} OR ${compileWhere(sql, node.right)})`;
    case 'not':
      return sql`(NOT ${compileWhere(sql, node.operand)})`;
    case 'term':
      return fieldMatch(sql, node.field, node.value, node.phrase, node.wildcard);
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
): Promise<StructuredHit[]> {
  const rows = await sql<
    {
      id: string;
      case_title: string;
      neutral_citation: string | null;
      reporter_citations: string[];
      court: string;
      judgment_date: string;
      case_number: string | null;
      bench: string | null;
      overruled_status: string;
    }[]
  >`
    SELECT j.id, j.case_title, j.neutral_citation, j.reporter_citations,
           j.court, j.judgment_date::text AS judgment_date, j.case_number, j.bench,
           j.overruled_status::text AS overruled_status
      FROM judgments j
     WHERE ${compileWhere(sql, node)}
     ORDER BY j.judgment_date DESC
     LIMIT ${limit}`;

  return rows.map((r) => ({
    judgmentId: r.id,
    caseTitle: r.case_title,
    neutralCitation: r.neutral_citation,
    reporterCitations: r.reporter_citations,
    court: r.court,
    judgmentDate: r.judgment_date,
    caseNumber: r.case_number,
    bench: r.bench,
    overruledStatus: r.overruled_status,
  }));
}

/** How many judgments satisfy the query, independent of the page returned. */
export async function countStructured(sql: Sql, node: Node): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM judgments j WHERE ${compileWhere(sql, node)}`;
  return row?.n ?? 0;
}
