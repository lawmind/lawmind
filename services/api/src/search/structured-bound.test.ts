/**
 * The structured route's lexical bound, at the level where its DECISIONS live.
 *
 * `qlang/bounded.test.ts` covers the AST partition and needs nothing. This file
 * covers what `answerStructured` does with the partition's answer, and the
 * property it protects is the one the round exists for: **a query that cannot be
 * safely executed must say so in milliseconds, and must never say "there is no
 * law on this".**
 *
 * The fake `sql` answers by inspecting the statement text, so each test states
 * the corpus it is pretending to have rather than mocking a call sequence - a
 * sequence mock would break on any reordering and would assert the
 * implementation instead of the behaviour.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Sql } from 'postgres';

import { answerStructured } from './structured.ts';

type Fake = {
  /** Rarest document frequency the lexeme lookup reports. */
  df: number;
  /** Rows the bounded population probe reports. */
  population: number;
  /** Court names the resolver finds. */
  courts?: string[];
  /** Rows a successful execution returns. */
  total?: number;
};

function fakeSql(f: Fake): { sql: Sql; statements: string[] } {
  const statements: string[] = [];
  const sql = ((strings: TemplateStringsArray, ...args: unknown[]) => {
    const text = strings.join(' ');
    statements.push(text);
    // The lexeme frequency lookup.
    if (text.includes('lexeme_document_frequency')) {
      return Promise.resolve([{ lexeme: 'bail', df: String(f.df) }]);
    }
    // The court resolver.
    if (text.includes('c.court ILIKE t.pattern')) {
      return Promise.resolve(
        (f.courts ?? ['High Court of Somewhere']).map((court) => ({
          term_offset: (args[0] as number[])[0],
          court,
        })),
      );
    }
    // distinctCourts, the loose index scan.
    if (text.includes('WITH RECURSIVE')) {
      return Promise.resolve((f.courts ?? ['High Court of Somewhere']).map((court) => ({ court })));
    }
    // The bounded population probe.
    if (text.includes('bounded')) {
      return Promise.resolve([{ n: String(f.population) }]);
    }
    // A count.
    if (text.includes('count(*)')) return Promise.resolve([{ n: f.total ?? 0 }]);
    // A page of rows, with the total joined on, as runStructuredCandidates asks.
    return Promise.resolve([]);
  }) as unknown as Sql;
  return { sql, statements };
}

test('A COMMON TERM IN A HUGE COURT IS REFUSED, and the refusal names the measurement', async () => {
  /* The exact fixture that took 15,086 / 15,091 / 15,100 ms and returned an
   * empty `degraded[]` behind an HTTP 503 whose copy said the server was busy. */
  const { sql } = fakeSql({ df: 0.2577, population: 20_001 });
  const out = await answerStructured(sql, 'court:"High Court of Somewhere" AND bail', 5);
  assert.equal(out.kind, 'unbounded');
  assert.ok(out.kind === 'unbounded');
  assert.equal(out.rarestDf, 0.2577, 'the measured cause travels with the refusal');
  assert.equal(out.populationCapped, true, 'a capped probe proves only "at least the cap"');
});

test('the same query in a SMALL court is admitted — the bound is not a blanket ban', async () => {
  const { sql } = fakeSql({ df: 0.2577, population: 5_000, total: 12 });
  const out = await answerStructured(sql, 'court:"High Court of Somewhere" AND bail', 5);
  assert.notEqual(out.kind, 'unbounded');
});

test('a RARE term is admitted with no population probe at all', async () => {
  /* The corpus-wide rule vouches for it, so the query costs exactly what it cost
   * before: no extra statement, no fence, no change. */
  const { sql, statements } = fakeSql({ df: 0.0001, population: 20_001, total: 3 });
  const out = await answerStructured(sql, 'court:"High Court of Somewhere" AND kesavananda', 5);
  assert.notEqual(out.kind, 'unbounded');
  assert.equal(
    statements.filter((s) => s.includes('bounded')).length,
    0,
    'an admitted query must not pay for a probe it did not need',
  );
});

test('A NEGATED lexical term can never take the shortcut — df says nothing about a complement', async () => {
  /* `bail` reads df 0.2577; `NOT bail` is the other 74%, and no measurement of
   * the word describes it. Even a vanishingly rare term must go through the
   * population probe here. */
  const { sql, statements } = fakeSql({ df: 0.0001, population: 20_001 });
  const out = await answerStructured(sql, 'court:"High Court of Somewhere" AND NOT bail', 5);
  assert.equal(out.kind, 'unbounded', 'a negation was admitted on the rarity of the negated word');
  assert.ok(
    statements.some((s) => s.includes('bounded')),
    'the probe must have run',
  );
});

test('a WILDCARD can never take the shortcut — the frequency table holds no prefixes', async () => {
  const { sql } = fakeSql({ df: 0.0001, population: 20_001 });
  const out = await answerStructured(sql, 'court:"High Court of Somewhere" AND bail*', 5);
  assert.equal(out.kind, 'unbounded');
});

test('NOTHING TO NARROW WITH and a common word: refused, and never as an empty result', async () => {
  /* There is no positive structural conjunct, so there is no population to
   * bound. The honest answer is a refusal, not a zero. */
  const { sql } = fakeSql({ df: 0.2577, population: 20_001 });
  const out = await answerStructured(sql, 'text:bail AND text:custody', 5);
  assert.equal(out.kind, 'unbounded');
});

test('a PURELY STRUCTURAL query never reaches the lexical bound', async () => {
  const { sql, statements } = fakeSql({ df: 0.9, population: 20_001, total: 4 });
  const out = await answerStructured(sql, 'judge:"KANIA" AND section:138', 5);
  assert.notEqual(out.kind, 'unbounded');
  assert.equal(
    statements.filter((s) => s.includes('lexeme_document_frequency')).length,
    0,
    'an identity/metadata query paid for a lexical measurement it does not need',
  );
});

test('AN INFERRED BOOLEAN falls through to ordinary search rather than being refused', async () => {
  /* `SMT X Vs STATE AND OTHERS` is registry formatting, not a query. If the only
   * evidence it was structured was an upper-case AND, a refusal here is much
   * better evidence that the INFERENCE was wrong - and ordinary search applies
   * this identical bound and reaches an identical cheap refusal if it really is
   * too broad. */
  const { sql } = fakeSql({ df: 0.2577, population: 20_001 });
  const out = await answerStructured(sql, 'POONAM Vs STATE OF U.P. AND 4 OTHERS', 5);
  assert.equal(out.kind, 'not_structured');
});
