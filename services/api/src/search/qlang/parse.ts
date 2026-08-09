/**
 * Recursive-descent parser for the search query language.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GRAMMAR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   query   := or
 *   or      := and ( OR and )*
 *   and     := unary ( AND? unary )*        -- AND is implicit between terms
 *   unary   := NOT unary | primary
 *   primary := '(' or ')' | field | value
 *   field   := FIELD ( value | range )
 *   range   := '[' value TO value ']'
 *   value   := phrase | word
 *
 * Precedence is `NOT` > `AND` > `OR`, which is the convention every legal
 * database uses, so an advocate's habits carry over. Parentheses override.
 *
 * **`AND` is implicit between adjacent terms.** `bail anticipatory` means both,
 * not either. This is what advocates expect and what Manupatra does; the
 * alternative — implicit OR — silently widens a query that looks narrow.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDATION HAPPENS HERE, NOT IN SQL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every rule that can reject a query is enforced at parse time, where the
 * offending token still has a character offset attached. A rule enforced in the
 * SQL compiler can only report "something was wrong"; a rule enforced in the
 * database reports it after the query has already cost something.
 *
 * The refusals are not fussiness. Each one is a query that would otherwise
 * return a plausible wrong answer or a full table scan:
 *
 * - **A leading wildcard** (`*bail`) cannot use a trigram index. It is a
 *   sequential scan over 38,341 full texts, per request.
 * - **A two-character stem** (`ba*`) matches most of the corpus, so the result
 *   set is noise wearing the shape of an answer.
 * - **A query of pure negation** (`NOT section:302`) returns almost everything.
 *   The user meant to exclude something *from* something, and forgot the second
 *   half; answering literally is unhelpful and expensive.
 */
import { type Token, QueryError, lex } from './lex.ts';

/**
 * The closed set of searchable fields — **the single place this list exists**,
 * so the error message and the compiler can never disagree about what is legal.
 */
export const FIELDS = [
  'party',
  'judge',
  'cite',
  'caseno',
  'court',
  'date',
  'act',
  'section',
  'type',
  'text',
] as const;

export type Field = (typeof FIELDS)[number];

export type Node =
  | { readonly kind: 'and'; readonly left: Node; readonly right: Node }
  | { readonly kind: 'or'; readonly left: Node; readonly right: Node }
  | { readonly kind: 'not'; readonly operand: Node }
  | {
      readonly kind: 'term';
      readonly field: Field;
      readonly value: string;
      /** Quoted: matched as a literal phrase rather than as separate words. */
      readonly phrase: boolean;
      /** Carries a trailing `*` or `?`. Validated; never leading. */
      readonly wildcard: boolean;
      readonly offset: number;
    }
  | {
      readonly kind: 'near';
      readonly field: Field;
      readonly left: string;
      readonly right: string;
      readonly distance: number;
      readonly offset: number;
    }
  | {
      readonly kind: 'range';
      readonly field: Field;
      readonly from: string;
      readonly to: string;
      readonly offset: number;
    };

/** Bounds that stop a hostile or careless query costing more than it should. */
export const PARSE_LIMITS = {
  /** Nesting depth. Beyond this a recursive-descent parser risks the stack. */
  MAX_DEPTH: 12,
  /** `NEAR/n`. Beyond ~50 the operator stops meaning "near". */
  MAX_NEAR: 50,
  /** Shortest usable wildcard stem. `ba*` matches most of the corpus. */
  MIN_WILDCARD_STEM: 3,
} as const;

/** Ranges are only meaningful on a date. `[A TO Z]` on a party name is not a thing. */
const RANGEABLE: readonly Field[] = ['date'];

/** `type:` mirrors the `case_type` enum exactly. */
const CASE_TYPES = ['criminal', 'civil'] as const;

/** `YYYY` or `YYYY-MM-DD`. Anything else is a typo, not a date. */
const DATE_RE = /^\d{4}(-\d{2}-\d{2})?$/;

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly source: string,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  /** Offset to blame when the query simply ran out. */
  private endOffset(): number {
    return this.source.length;
  }

  parse(): Node {
    const node = this.parseOr();
    const extra = this.peek();
    if (extra) {
      throw new QueryError(
        extra.kind === 'rparen'
          ? 'Unmatched ")" — there is no "(" for it.'
          : `Unexpected "${extra.value}" after a complete query.`,
        extra.start,
      );
    }
    return node;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek()?.kind === 'or') {
      const op = this.next()!;
      if (!this.peek()) {
        throw new QueryError('"OR" needs a term after it.', op.start);
      }
      left = { kind: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (!t) break;
      // An explicit AND, or an implicit one before anything that can start a term.
      if (t.kind === 'and') {
        const op = this.next()!;
        if (!this.peek()) {
          throw new QueryError('"AND" needs a term after it.', op.start);
        }
        left = { kind: 'and', left, right: this.parseUnary() };
        continue;
      }
      if (t.kind === 'or' || t.kind === 'rparen' || t.kind === 'to' || t.kind === 'rbracket') break;
      if (t.kind === 'near') {
        left = this.parseNearTail(left);
        continue;
      }
      left = { kind: 'and', left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t?.kind === 'not') {
      const op = this.next()!;
      if (!this.peek()) {
        throw new QueryError('"NOT" needs a term after it.', op.start);
      }
      return { kind: 'not', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  /**
   * `left NEAR/5 right`. Both sides must be plain terms — `(a OR b) NEAR/5 c`
   * has no meaning in a tsquery distance operator, and pretending otherwise
   * would silently drop one side.
   */
  private parseNearTail(left: Node): Node {
    const op = this.next()!; // the NEAR token
    const distance = op.distance ?? 0;
    if (!Number.isInteger(distance) || distance < 1 || distance > PARSE_LIMITS.MAX_NEAR) {
      throw new QueryError(
        `NEAR/${op.distance ?? ''} is not a usable distance — use 1 to ${PARSE_LIMITS.MAX_NEAR}.`,
        op.start,
      );
    }
    if (left.kind !== 'term') {
      throw new QueryError('NEAR needs a single word or phrase on its left.', op.start);
    }
    const rightTok = this.peek();
    if (!rightTok || (rightTok.kind !== 'word' && rightTok.kind !== 'phrase')) {
      throw new QueryError('NEAR needs a single word or phrase on its right.', op.start);
    }
    this.next();
    return {
      kind: 'near',
      field: left.field,
      left: left.value,
      right: rightTok.value,
      distance,
      offset: left.offset,
    };
  }

  private parsePrimary(): Node {
    const t = this.next();
    if (!t) {
      throw new QueryError('The query ended where a term was expected.', this.endOffset());
    }

    if (t.kind === 'lparen') {
      if (++this.depth > PARSE_LIMITS.MAX_DEPTH) {
        throw new QueryError(`Query nests deeper than ${PARSE_LIMITS.MAX_DEPTH} levels.`, t.start);
      }
      const inner = this.parseOr();
      const close = this.next();
      if (!close || close.kind !== 'rparen') {
        throw new QueryError('Unclosed "(" — every "(" needs a matching ")".', t.start);
      }
      this.depth--;
      return inner;
    }

    if (t.kind === 'field') {
      return this.parseFieldValue(t);
    }

    if (t.kind === 'word' || t.kind === 'phrase') {
      return this.makeTerm('text', t);
    }

    throw new QueryError(`"${t.value}" cannot start a term.`, t.start);
  }

  private parseFieldValue(fieldTok: Token): Node {
    const field = fieldTok.value as Field;
    if (!(FIELDS as readonly string[]).includes(field)) {
      throw new QueryError(
        `Unknown field "${fieldTok.value}".`,
        fieldTok.start,
        FIELDS,
      );
    }

    const t = this.peek();
    if (!t) {
      throw new QueryError(`"${field}:" has no value after it.`, fieldTok.start);
    }

    if (t.kind === 'lbracket') {
      return this.parseRange(field, fieldTok);
    }

    if (t.kind !== 'word' && t.kind !== 'phrase') {
      throw new QueryError(`"${field}:" needs a word or a "quoted phrase".`, t.start);
    }
    this.next();
    return this.makeTerm(field, t);
  }

  private parseRange(field: Field, fieldTok: Token): Node {
    if (!RANGEABLE.includes(field)) {
      throw new QueryError(
        `A [from TO to] range only works on: ${RANGEABLE.join(', ')}.`,
        fieldTok.start,
      );
    }
    this.next(); // '['
    const from = this.next();
    if (!from || (from.kind !== 'word' && from.kind !== 'phrase')) {
      throw new QueryError('A range needs a value after "[".', fieldTok.start);
    }
    const to = this.next();
    if (!to || to.kind !== 'to') {
      throw new QueryError('A range reads [from TO to].', from.start);
    }
    const upper = this.next();
    if (!upper || (upper.kind !== 'word' && upper.kind !== 'phrase')) {
      throw new QueryError('A range needs a value after "TO".', to.start);
    }
    const close = this.next();
    if (!close || close.kind !== 'rbracket') {
      throw new QueryError('Unclosed "[" — a range ends with "]".', fieldTok.start);
    }

    for (const v of [from, upper]) {
      if (!DATE_RE.test(v.value)) {
        throw new QueryError(`"${v.value}" is not a date — use YYYY or YYYY-MM-DD.`, v.start);
      }
    }
    /**
     * A reversed range matches nothing, and silently returning nothing is
     * indistinguishable from "no such judgments exist" — which is a wrong answer
     * to a different question.
     */
    if (from.value > upper.value) {
      throw new QueryError(
        `The range [${from.value} TO ${upper.value}] runs backwards.`,
        from.start,
      );
    }
    return { kind: 'range', field, from: from.value, to: upper.value, offset: fieldTok.start };
  }

  private makeTerm(field: Field, t: Token): Node {
    const value = t.value;
    if (value.trim().length === 0) {
      throw new QueryError('An empty term matches nothing — remove it or fill it in.', t.start);
    }

    const wildcard = t.kind === 'word' && /[*?]/.test(value);
    if (wildcard) {
      if (/^[*?]/.test(value)) {
        throw new QueryError(
          'A term cannot start with "*" or "?" — that cannot use an index and would scan the whole corpus.',
          t.start,
        );
      }
      const positions = [value.indexOf('*'), value.indexOf('?')].filter((n) => n >= 0);
      const stem = value.slice(0, Math.min(...positions));
      if (stem.length < PARSE_LIMITS.MIN_WILDCARD_STEM) {
        throw new QueryError(
          `"${value}" needs at least ${PARSE_LIMITS.MIN_WILDCARD_STEM} characters before the wildcard.`,
          t.start,
        );
      }
    }

    if (field === 'type' && !(CASE_TYPES as readonly string[]).includes(value.toLowerCase())) {
      throw new QueryError(`type: must be ${CASE_TYPES.join(' or ')}.`, t.start);
    }
    if (field === 'date' && !DATE_RE.test(value)) {
      throw new QueryError(`"${value}" is not a date — use YYYY or YYYY-MM-DD.`, t.start);
    }

    return { kind: 'term', field, value, phrase: t.kind === 'phrase', wildcard, offset: t.start };
  }
}

/**
 * Does this query assert anything, or does it only exclude?
 *
 * `NOT section:302` is a legitimate thought and an illegitimate query: it asks
 * for every judgment in the corpus bar a few. Refusing it is not pedantry —
 * answering it means a sequential scan returning ~38,000 rows, and the user
 * almost certainly meant to attach the exclusion to something.
 */
export function hasPositiveTerm(node: Node): boolean {
  switch (node.kind) {
    case 'not':
      return false;
    case 'and':
      return hasPositiveTerm(node.left) || hasPositiveTerm(node.right);
    case 'or':
      // Both sides must assert something: `a OR NOT b` still returns almost
      // everything, because the negation alone satisfies most rows.
      return hasPositiveTerm(node.left) && hasPositiveTerm(node.right);
    default:
      return true;
  }
}

/**
 * Parse a query string into an AST.
 *
 * **Throws {@link QueryError} with an offset for every rejection.** There is no
 * best-effort mode and no partial parse: a query the parser cannot fully
 * understand is refused, because the alternative is answering a question the
 * advocate did not ask.
 */
export function parse(source: string): Node {
  if (source.trim().length === 0) {
    throw new QueryError('The query is empty.', 0);
  }
  const tokens = lex(source);
  if (tokens.length === 0) {
    throw new QueryError('The query has no searchable terms.', 0);
  }
  const node = new Parser(tokens, source).parse();
  if (!hasPositiveTerm(node)) {
    throw new QueryError(
      'This query only excludes. Add something to search for — "NOT" narrows a search rather than being one.',
      0,
    );
  }
  return node;
}

/**
 * Whether a query uses any structured syntax at all.
 *
 * **This is the switch that decides which engine answers**, so it is
 * deliberately conservative: a plain sentence must NOT be treated as a
 * structured query and refused for bad syntax. `bail granted after conviction`
 * is prose an advocate typed, not a malformed Boolean expression.
 *
 * A query is structured only if it names a field or uses an explicit operator.
 */
export function looksStructured(source: string): boolean {
  if (source.trim().length === 0) return false;
  const fieldNames = FIELDS.join('|');
  if (new RegExp(`\\b(?:${fieldNames}):`, 'i').test(source)) return true;
  if (/\b(?:AND|OR|NOT)\b/.test(source)) return true; // case-sensitive: "or" in prose is not an operator
  if (/NEAR\/\d/i.test(source)) return true;
  if (/[()]/.test(source) && /"/.test(source)) return true;
  return false;
}
