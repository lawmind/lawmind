/**
 * Every rejection in TODO LIST 6, plus the shapes that must keep working.
 *
 * The failures worth testing here are not crashes — a crash is loud. They are
 * the queries that would parse into something *plausible and wrong*: an
 * exclusion that silently vanishes, a field name quietly demoted to free text,
 * an implicit OR where the advocate meant AND. Each of those returns results,
 * looks healthy, and answers a question nobody asked.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QueryError } from './lex.ts';
import { type Node, hasPositiveTerm, looksStructured, parse } from './parse.ts';

/** Assert a parse fails, and return the error so its position can be checked. */
function refuses(source: string): QueryError {
  try {
    parse(source);
  } catch (e) {
    assert.ok(e instanceof QueryError, `threw ${String(e)}, not a QueryError`);
    return e;
  }
  throw new assert.AssertionError({ message: `accepted a query it must refuse: ${source}` });
}

/** Flatten an AST to a comparable shape, so tests read as structure not prose. */
function shape(n: Node): unknown {
  switch (n.kind) {
    case 'and':
    case 'or':
      return { [n.kind]: [shape(n.left), shape(n.right)] };
    case 'not':
      return { not: shape(n.operand) };
    case 'term':
      return `${n.field}:${n.value}${n.phrase ? '"' : ''}`;
    case 'near':
      return `${n.field}:${n.left}~${n.distance}~${n.right}`;
    case 'range':
      return `${n.field}:[${n.from}..${n.to}]`;
  }
}

/* ───────────────────────────────────────────── what must work ── */

test('a bare sentence is an implicit AND of its words', () => {
  // Implicit OR would silently widen a query that looks narrow. Manupatra ANDs;
  // so do we.
  assert.deepEqual(shape(parse('bail anticipatory')), { and: ['text:bail', 'text:anticipatory'] });
});

test('every field parses with a word and with a phrase', () => {
  for (const f of ['party', 'judge', 'cite', 'caseno', 'court', 'act', 'section', 'text']) {
    assert.doesNotThrow(() => parse(`${f}:something`), `${f}: rejected a word`);
    assert.doesNotThrow(() => parse(`${f}:"two words"`), `${f}: rejected a phrase`);
  }
});

test('PRECEDENCE IS NOT > AND > OR, and parentheses override it', () => {
  // `a AND b OR c` must group as `(a AND b) OR c`. Getting this backwards
  // changes which judgments come back and nothing anywhere would say so.
  assert.deepEqual(shape(parse('a AND b OR c')), {
    or: [{ and: ['text:a', 'text:b'] }, 'text:c'],
  });
  assert.deepEqual(shape(parse('a AND (b OR c)')), {
    and: ['text:a', { or: ['text:b', 'text:c'] }],
  });
});

test('NOT binds tighter than AND', () => {
  assert.deepEqual(shape(parse('a AND NOT b')), { and: ['text:a', { not: 'text:b' }] });
});

test('a date range parses, and a bare date does too', () => {
  assert.deepEqual(shape(parse('date:[2019 TO 2024]')), 'date:[2019..2024]');
  assert.deepEqual(shape(parse('date:2019-05-01')), 'date:2019-05-01');
});

test('NEAR carries its distance and both sides', () => {
  assert.deepEqual(
    shape(parse('"anticipatory bail" NEAR/5 "twin conditions"')),
    'text:anticipatory bail~5~twin conditions',
  );
});

test('a citation with punctuation survives as ONE term', () => {
  // `.` and `-` stay inside a word because Indian citations and case numbers are
  // full of them. Splitting `S.K. DAS` into three terms would require all three
  // to match separately.
  assert.deepEqual(shape(parse('cite:"(2019) 4 SCC 221"')), 'cite:(2019) 4 SCC 221"');
  assert.deepEqual(shape(parse('caseno:Crl.A.-19/1955')), 'caseno:Crl.A.-19/1955');
});

test('Devanagari parses as an ordinary term', () => {
  // Hindi is a product requirement, not an edge case.
  assert.deepEqual(shape(parse('party:"न्यायालय"')), 'party:न्यायालय"');
});

/* ─────────────────────────────────── L6 · parser refusals ── */

test('6.1 unbalanced parens are refused, positioned at the "("', () => {
  const e = refuses('judge:"Kania" AND (court:"SC"');
  assert.match(e.message, /Unclosed "\("/);
  assert.equal(e.offset, 18, 'the error must point at the unclosed paren');
  assert.match(refuses('a)').message, /Unmatched "\)"/);
});

test('6.2 AN UNKNOWN FIELD IS AN ERROR NAMING THE VALID ONES', () => {
  // The failure this prevents: silently treating `judgw:Kania` as free text,
  // searching the full text for "judgw:Kania", and returning nothing — which
  // reads as "no such judge" rather than "you made a typo".
  const e = refuses('judgw:"Kania"');
  assert.match(e.message, /Unknown field "judgw"/);
  assert.ok(e.valid?.includes('judge'), 'the error must list the real fields');
  assert.equal(e.offset, 0);
});

test('6.3 an empty query is refused, never "return everything"', () => {
  for (const q of ['', '   ', '\t\n']) assert.match(refuses(q).message, /empty/i);
});

test('6.4 a trailing operator is an error, not a silent drop', () => {
  assert.match(refuses('bail AND').message, /"AND" needs a term/);
  assert.match(refuses('bail OR').message, /"OR" needs a term/);
  assert.match(refuses('bail NOT').message, /"NOT" needs a term/);
});

test('6.5 A QUERY OF PURE NEGATION IS REFUSED', () => {
  // `NOT section:302` asks for every judgment bar a few — a sequential scan
  // returning ~38,000 rows, and not what the user meant.
  assert.match(refuses('NOT section:302').message, /only excludes/);
  assert.match(refuses('NOT a AND NOT b').message, /only excludes/);
  // But an exclusion attached to something is exactly right.
  assert.doesNotThrow(() => parse('section:138 NOT party:"State"'));
});

test('6.5b `a OR NOT b` is refused — the negation alone satisfies most rows', () => {
  assert.match(refuses('party:"State" OR NOT section:302').message, /only excludes/);
});

test('6.6 a leading wildcard is refused — it cannot use an index', () => {
  const e = refuses('*bail');
  assert.match(e.message, /cannot start with "\*"/);
  assert.match(refuses('?ail').message, /cannot start with/);
});

test('6.7 a wildcard stem under three characters is refused', () => {
  assert.match(refuses('ba*').message, /at least 3 characters/);
  assert.doesNotThrow(() => parse('bail*'));
});

test('6.8 NEAR with an unusable distance is refused', () => {
  assert.match(refuses('"a b" NEAR/0 "c d"').message, /not a usable distance/);
  assert.match(refuses('"a b" NEAR/999 "c d"').message, /not a usable distance/);
  // NEAR with nothing on the right.
  assert.match(refuses('"a b" NEAR/5').message, /needs a single word or phrase on its right/);
});

test('6.9 a reversed or malformed date range is refused', () => {
  // Reversed matches nothing, and silently returning nothing is a wrong answer
  // to a different question.
  assert.match(refuses('date:[2024 TO 2019]').message, /runs backwards/);
  assert.match(refuses('date:[banana TO 2024]').message, /not a date/);
  assert.match(refuses('date:notadate').message, /not a date/);
});

test('6.9b a range on a field that cannot have one is refused', () => {
  assert.match(refuses('party:[A TO Z]').message, /only works on: date/);
});

test('6.10 length and term caps are enforced', () => {
  assert.match(refuses(`text:${'x'.repeat(2100)}`).message, /limit is 2000/);
  assert.match(refuses(Array.from({ length: 250 }, (_, i) => `w${i}`).join(' ')).message, /more than 200 terms/);
});

test('6.11 nesting deeper than the cap is refused, not a stack overflow', () => {
  const deep = `${'('.repeat(20)}bail${')'.repeat(20)}`;
  assert.match(refuses(deep).message, /nests deeper than/);
});

test('6.12 FUZZ — never a crash, always an AST or a positioned QueryError', () => {
  /**
   * The property that matters most. A query language is an interpreter a
   * stranger can send input to; the one outcome that must never happen is an
   * unhandled throw reaching the route as a 500.
   */
  const alphabet = [...'abc "():*?[]/ ', 'AND', 'OR', 'NOT', 'NEAR/5', 'judge:', 'date:', 'TO', 'न्या'];
  let rng = 42;
  const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 3000; i++) {
    const n = 1 + Math.floor(rand() * 12);
    const q = Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');
    try {
      parse(q);
    } catch (e) {
      assert.ok(e instanceof QueryError, `fuzz input ${JSON.stringify(q)} threw ${String(e)}`);
      assert.ok(Number.isInteger(e.offset) && e.offset >= 0, `bad offset for ${JSON.stringify(q)}`);
    }
  }
});

test('an unclosed quote is refused at the opening quote', () => {
  const e = refuses('judge:"Kania');
  assert.match(e.message, /Unclosed quote/);
  assert.equal(e.offset, 6);
});

test('a stray colon is refused where it stands', () => {
  assert.match(refuses(': bail').message, /must follow a field name/);
});

test('type: is checked against the enum, not accepted and dropped later', () => {
  assert.match(refuses('type:matrimonial').message, /criminal or civil/);
  assert.doesNotThrow(() => parse('type:criminal'));
});

/* ────────────────────────────── the engine-selection switch ── */

test('LOOKS-STRUCTURED IS CONSERVATIVE — prose must not be refused for bad syntax', () => {
  /**
   * The switch that decides which engine answers. If prose is misread as a
   * structured query, an advocate typing a sentence gets a syntax error instead
   * of results — the worst possible first impression.
   */
  for (const prose of [
    'bail granted after conviction',
    'whether anticipatory bail may be limited in point of time',
    'dishonour of cheque presumption',
    'क्या अग्रिम जमानत समय-सीमा में बांधी जा सकती है',
  ]) {
    assert.equal(looksStructured(prose), false, `prose misread as structured: ${prose}`);
  }
});

test('lowercase "or" inside prose is NOT an operator', () => {
  // "bail or parole" is a description, not a Boolean expression. Only the
  // upper-case form is an operator, which is the convention every legal
  // database uses.
  assert.equal(looksStructured('bail or parole'), false);
  assert.equal(looksStructured('bail OR parole'), true);
});

test('anything naming a field or using an operator IS structured', () => {
  for (const q of ['judge:"Kania"', 'a AND b', 'a NOT b', '"x y" NEAR/3 "z"', 'date:[2019 TO 2024]']) {
    assert.equal(looksStructured(q), true, `structured query not detected: ${q}`);
  }
});

/* ─────────────────────────────────────────── helper contract ── */

test('hasPositiveTerm is what refuses pure negation, and it is exported for reuse', () => {
  assert.equal(hasPositiveTerm(parse('section:138')), true);
  assert.equal(hasPositiveTerm(parse('section:138 NOT party:"State"')), true);
});
