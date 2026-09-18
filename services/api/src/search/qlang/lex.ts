/**
 * Tokenizer for the search query language.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A REAL LEXER AND NOT A REGEX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The language nests: `(party:"State" OR party:"Union") AND NOT section:302`.
 * A regex cannot count parentheses, and the failure mode of trying is not a
 * crash — it is a query that parses to something *plausible and wrong*, returns
 * results, and tells nobody. An advocate who asked for judgments excluding
 * s.302 and received judgments about s.302 has been given a confidently wrong
 * answer, which is the one thing this product cannot do.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY TOKEN CARRIES ITS OFFSET
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Not for tidiness. A parse error must be able to say *where* — `judge:"Kania"
 * AND (court:"SC"` should report the unclosed paren at character 26, not
 * "invalid query". The offset is what makes the error actionable, and it has to
 * be captured here because by parse time the character positions are gone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DELIBERATELY DOES NOT KNOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Which field names are valid.** `foo:bar` lexes cleanly as a field token; the
 * parser rejects it, naming the ten legal fields. Keeping the closed set in one
 * place means adding a field is one edit, and it keeps the "unknown field" error
 * message from drifting away from the list it describes.
 */

export type TokenKind =
  | 'field' // `judge:` — the name only; the value is the next token
  | 'word' // bare term, may carry wildcards
  | 'phrase' // "quoted phrase", matched literally
  | 'and'
  | 'or'
  | 'not'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'to' // the `TO` inside `[2019 TO 2024]`
  | 'near'; // `NEAR/5` — distance carried on the token

export type Token = {
  readonly kind: TokenKind;
  /** Field name for `field`, the text for `word`/`phrase`, else the keyword. */
  readonly value: string;
  /** Only on `near`. Validated by the parser, not here. */
  readonly distance?: number;
  /** Inclusive start offset into the source query. */
  readonly start: number;
  /** Exclusive end offset. */
  readonly end: number;
};

/**
 * A query-language failure, always positioned.
 *
 * Carries `offset` so the client can underline the exact character. `valid` is
 * populated only for an unknown field, where listing the alternatives is the
 * whole of the help a user needs.
 */
export class QueryError extends Error {
  readonly offset: number;
  readonly valid?: readonly string[];

  constructor(message: string, offset: number, valid?: readonly string[]) {
    super(message);
    this.name = 'QueryError';
    this.offset = offset;
    if (valid) this.valid = valid;
  }
}

/**
 * Hard bounds, checked here so a pathological input dies before it can allocate.
 *
 * A query language is an interpreter a stranger can send input to. These are not
 * politeness limits; they are the difference between a bad query costing 4 ms and
 * costing the whole request budget.
 */
export const LIMITS = {
  /** Longest query accepted. Real ones are far under this. */
  MAX_CHARS: 2000,
  /** Most tokens accepted, which bounds parser work and SQL size. */
  MAX_TOKENS: 200,
} as const;

/** `NEAR/5` — the slash and digits are part of the operator. */
const NEAR_RE = /^NEAR\/(\d{1,3})/i;

/**
 * Characters that end a bare word. Everything else — including Devanagari,
 * digits, `.`, `-`, `&`, `*`, `?` — is part of one.
 *
 * `.` and `-` stay in because Indian citations and case numbers are full of
 * them (`S.K. DAS`, `Crl.A. 19/1955`), and splitting on them would turn one term
 * into four that must all match.
 */
function isBreak(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\n' ||
    ch === '\r' ||
    ch === '(' ||
    ch === ')' ||
    ch === '[' ||
    ch === ']' ||
    ch === '"' ||
    ch === ':'
  );
}

/**
 * Split a query into tokens.
 *
 * **Never returns a partially-lexed list.** Anything malformed throws a
 * positioned {@link QueryError} — a lexer that silently drops what it cannot
 * read produces exactly the plausible-and-wrong query this language must not
 * have.
 */
export function lex(source: string): Token[] {
  if (source.length > LIMITS.MAX_CHARS) {
    throw new QueryError(
      `Query is ${source.length} characters; the limit is ${LIMITS.MAX_CHARS}.`,
      LIMITS.MAX_CHARS,
    );
  }

  const tokens: Token[] = [];
  let i = 0;

  const push = (kind: TokenKind, value: string, start: number, extra?: { distance: number }) => {
    if (tokens.length >= LIMITS.MAX_TOKENS) {
      throw new QueryError(`Query has more than ${LIMITS.MAX_TOKENS} terms.`, start);
    }
    tokens.push(extra ? { kind, value, start, end: i, ...extra } : { kind, value, start, end: i });
  };

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    const start = i;

    if (ch === '(') {
      i++;
      push('lparen', '(', start);
      continue;
    }
    if (ch === ')') {
      i++;
      push('rparen', ')', start);
      continue;
    }
    if (ch === '[') {
      i++;
      push('lbracket', '[', start);
      continue;
    }
    if (ch === ']') {
      i++;
      push('rbracket', ']', start);
      continue;
    }

    /**
     * A quoted phrase. **No escape sequences**, deliberately: a legal query never
     * needs a literal quote inside a phrase, and supporting `\"` would mean every
     * error message has to explain escaping. An unterminated quote is an error
     * positioned at the opening quote, which is where the user's mistake is.
     */
    if (ch === '"') {
      const close = source.indexOf('"', i + 1);
      if (close === -1) {
        throw new QueryError('Unclosed quote — every " needs a closing ".', start);
      }
      const value = source.slice(i + 1, close);
      i = close + 1;
      push('phrase', value, start);
      continue;
    }

    // A colon with no field name before it. Reported here rather than as a
    // mystifying "unexpected token" three steps later.
    if (ch === ':') {
      throw new QueryError('A ":" must follow a field name, for example judge:"Kania".', start);
    }

    const near = NEAR_RE.exec(source.slice(i));
    if (near) {
      i += near[0].length;
      push('near', 'NEAR', start, { distance: Number(near[1]) });
      continue;
    }

    // A bare run of characters: keyword, field name, or term.
    let j = i;
    while (j < source.length && !isBreak(source[j]!)) j++;
    const raw = source.slice(i, j);

    // `judge:` — a field name is only a field name when a colon follows it
    // immediately. `judge` alone is an ordinary search term.
    if (source[j] === ':') {
      i = j + 1;
      push('field', raw.toLowerCase(), start);
      continue;
    }

    i = j;
    const upper = raw.toUpperCase();
    if (upper === 'AND') push('and', 'AND', start);
    else if (upper === 'OR') push('or', 'OR', start);
    else if (upper === 'NOT') push('not', 'NOT', start);
    else if (upper === 'TO') push('to', 'TO', start);
    else push('word', raw, start);
  }

  return tokens;
}
