/**
 * The query set is the instrument every retrieval decision is read off, so the
 * failures that matter here are the ones that leave a **well-formed** set that
 * measures the wrong thing — leaked answers, bibliography passages, and a
 * rebuild that silently swaps the population under a recorded baseline.
 *
 * This file exists at all because `build-queries.ts` no longer runs `main()` on
 * import. It used to, so importing it opened a database connection and exited.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Sql } from 'postgres';

import {
  type BuiltQuery,
  citationsPointingAtGold,
  looksOcrDamaged,
  passageLooksLikeReasoning,
  redact,
  snapToSentences,
  supersetBreaches,
} from './build-queries.ts';

function q(id: string, query: string, gold: string[] = ['g-1']): BuiltQuery {
  return {
    id,
    group: 'civil',
    language: 'en',
    query,
    goldJudgmentIds: gold,
    provenance: {
      method: 'citation-edge',
      citingJudgmentId: 'c-1',
      citingCase: 'A v. B',
      citingCourt: 'SC',
      citingDate: '2020-01-01',
      relationship: 'relied_on',
      citedCase: 'C v. D',
      citedCourt: 'SC',
      citedDate: '1990-01-01',
      inboundCitations: 5,
      redacted: [],
    },
  };
}

/* ------------------------------------------- the superset guard -- */

test('growing the set is fine — a strict superset reports NO breach', () => {
  const before = [q('a', 'one'), q('b', 'two')];
  const after = [q('a', 'one'), q('b', 'two'), q('c', 'three')];
  assert.deepEqual(supersetBreaches(before, after), []);
});

test('A DROPPED QUERY IS A BREACH — this is the silent one', () => {
  // Paired McNemar compares outcomes query by query. Drop one and the delta is
  // computed across two different populations, with nothing in the output
  // saying so.
  const breaches = supersetBreaches([q('a', 'one'), q('b', 'two')], [q('a', 'one')]);
  assert.equal(breaches.length, 1);
  assert.match(breaches[0]!, /DROPPED b/);
});

test('a query whose TEXT changed is a breach even though the id survives', () => {
  // The id is derived from the cited judgment, so it stays stable while the
  // window, the redaction or the corpus text underneath it moves. The id
  // matching is exactly what makes this invisible.
  const breaches = supersetBreaches([q('a', 'one')], [q('a', 'ONE, but rewritten')]);
  assert.equal(breaches.length, 1);
  assert.match(breaches[0]!, /TEXT CHANGED a/);
});

test('a changed GOLD ANSWER is a breach — the question is the same, the answer is not', () => {
  const breaches = supersetBreaches([q('a', 'one', ['g-1'])], [q('a', 'one', ['g-2'])]);
  assert.equal(breaches.length, 1);
  assert.match(breaches[0]!, /GOLD CHANGED a/);
});

test('gold order is not a breach — it is a set, not a sequence', () => {
  const before = [q('a', 'one', ['g-1', 'g-2'])];
  const after = [q('a', 'one', ['g-2', 'g-1'])];
  assert.deepEqual(supersetBreaches(before, after), []);
});

test('a first build has nothing to preserve and reports nothing', () => {
  assert.deepEqual(supersetBreaches([], [q('a', 'one')]), []);
});

/* ------------------------------------------------- leakage -- */

test('THE CITATION IS REMOVED — leaving it turns retrieval into a string lookup', () => {
  const { text, removed } = redact(
    'The principle in Kharak Singh v. State of U.P., AIR 1963 SC 1295, was applied.',
    {
      citationText: 'AIR 1963 SC 1295',
      neutral: null,
      reporters: [],
      citedTitle: 'Kharak Singh v. State of U.P.',
    },
  );
  assert.ok(!text.includes('AIR 1963 SC 1295'), 'the citation survived redaction');
  assert.ok(!text.includes('Kharak'), 'the distinctive party name survived redaction');
  assert.ok(removed.some((r) => r.startsWith('citation_text:')));
});

test('generic title words SURVIVE — "State" and "India" identify nothing', () => {
  // Over-redacting is its own failure: strip these and the passage stops being
  // a question an advocate would type.
  const { text } = redact('The State of Maharashtra argued that the Union of India was bound.', {
    citationText: 'AIR 1963 SC 1295',
    neutral: null,
    reporters: [],
    citedTitle: 'State of Maharashtra v. Union of India',
  });
  assert.ok(text.includes('State'), '"State" was wrongly redacted');
  assert.ok(text.includes('Union'), '"Union" was wrongly redacted');
});

test('every reporter format is removed, not just the one in citation_text', () => {
  const { text } = redact('Reported at (1963) 1 SCR 332 and also at AIR 1963 SC 1295.', {
    citationText: 'AIR 1963 SC 1295',
    neutral: null,
    reporters: ['(1963) 1 SCR 332'],
    citedTitle: 'X v. Y',
  });
  assert.ok(!text.includes('SCR 332'), 'a second reporter format leaked the answer');
});

/* --------------------------------------- bibliography rejection -- */

const REASONING =
  'The question is whether anticipatory bail may be limited in point of time. ' +
  'The Court held that the protection does not end on the date fixed by the order. ' +
  'A contrary reading would make the section unworkable in practice for the accused.';

test('a passage of actual reasoning is accepted', () => {
  assert.equal(passageLooksLikeReasoning(REASONING, REASONING), true);
});

test('A CASE-LAW-CITED BLOCK IS REJECTED — it is a bibliography, not a question', () => {
  const raw = `Case Law Cited\n${REASONING}`;
  assert.equal(passageLooksLikeReasoning(raw, REASONING), false);
});

test('a reporter HELD block is rejected — it is the reporter copyrighted edit', () => {
  // Two independent reasons and either alone suffices: it summarises reasoning
  // rather than being it, and it is the law report's own copy-edited work.
  const raw = `Allowing the appeal, the Court HELD: 1.1. ${REASONING}`;
  assert.equal(passageLooksLikeReasoning(raw, REASONING), false);
});

test('a run of case names is rejected whatever reporter format they use', () => {
  // The format-independent tell. A hard-coded list of citation shapes can never
  // catch a convention nobody has seen yet; counting `v.` catches all of them.
  const list =
    'Ram v. Shyam, Gopal v. Mohan, Sita v. Gita, Hari v. Krishna were all considered here. ' +
    'The Court examined each of the authorities placed before it in that long list. ' +
    'Nothing further was said about the matter in the course of the judgment.';
  assert.equal(passageLooksLikeReasoning(list, list), false);
});

/* -------------------------------------------------- OCR damage -- */

test('scanner artefacts are rejected — they measure OCR tolerance, not retrieval', () => {
  for (const damaged of [
    'the mem· hers of the· board resolved',
    'the essentia~ question',
    'the posSEssion of the land',
    'SHEONANDANPASWANv.STATEOF BIHAR',
    'the c9nverse proposition',
  ]) {
    assert.equal(looksOcrDamaged(damaged), true, `not caught: ${damaged}`);
  }
});

test('clean legal prose is NOT flagged as damaged', () => {
  assert.equal(looksOcrDamaged(REASONING), false);
});

/* ------------------------------------------------ sentence snap -- */

test('a passage starting mid-word is snapped to a sentence boundary', () => {
  const mid = `s seeds, affecting public order. ${REASONING}`;
  const out = snapToSentences(mid);
  assert.ok(out !== null);
  assert.ok(!out.startsWith('s seeds'), 'the mid-word fragment survived');
});

test('NULL rather than a fragment when no boundary is near', () => {
  // Returning the fragment would quietly re-admit exactly what this function
  // exists to remove, and no caller could tell the two apart.
  assert.equal(snapToSentences('s seeds affecting public order with no stop at all'), null);
});

/* ------------------------------ the leak redaction cannot see -- */

/** Records whether the database was reached, and with what. */
function spySql(rows: { key: string }[]): { sql: Sql; calls: number; last: unknown[] } {
  const state = { calls: 0, last: [] as unknown[] };
  const sql = ((_s: TemplateStringsArray, ...v: unknown[]) => {
    state.calls++;
    state.last = v;
    return Promise.resolve(rows);
  }) as unknown as Sql;
  return {
    sql,
    get calls() {
      return state.calls;
    },
    get last() {
      return state.last;
    },
  };
}

test('NO CITATION LEFT means no database call — the common case stays free', async () => {
  const spy = spySql([]);
  const out = await citationsPointingAtGold(
    spy.sql,
    'The Court considered whether the protection continues after the period fixed.',
    'gold-1',
  );
  assert.deepEqual(out, []);
  assert.equal(spy.calls, 0);
});

test('A SURVIVING CITATION THAT RESOLVES TO THE GOLD IS REPORTED', async () => {
  /**
   * The leak the pin audit found: 46 queries pinned a judgment and 9 of them
   * were the GOLD, which is only possible if a citation pointing at the answer
   * survived redaction. Those nine scored as retrieval successes while being
   * string lookups.
   */
  const spy = spySql([{ key: '20194SCC221' }]);
  const out = await citationsPointingAtGold(
    spy.sql,
    'The rule in (2019) 4 SCC 221 was applied to these facts by the High Court below.',
    'gold-1',
  );
  assert.deepEqual(out, ['20194SCC221']);
  assert.equal(spy.calls, 1);
});

test('a citation resolving to some OTHER judgment is fine, and common', async () => {
  // A judge distinguishing two authorities is exactly the reasoning we want in
  // a query. Only a citation pointing at the ANSWER is a leak.
  const spy = spySql([]);
  const out = await citationsPointingAtGold(
    spy.sql,
    'The rule in (2019) 4 SCC 221 was distinguished on the facts before us today.',
    'gold-1',
  );
  assert.deepEqual(out, []);
  assert.equal(spy.calls, 1, 'it must still ask — "other judgment" is a DB answer, not a guess');
});

test('the key asked about carries no punctuation — symmetric with the SQL', async () => {
  // Everything that is not a letter or a digit goes, on BOTH sides of the
  // comparison. One rule, expressible identically in JS and in Postgres,
  // cannot drift.
  const spy = spySql([]);
  await citationsPointingAtGold(spy.sql, 'see (2019) 4 SCC 221 for the position', 'gold-1');
  const keys = spy.last[0] as string[];
  assert.ok(Array.isArray(keys), 'nothing was extracted, so nothing was asked');
  assert.deepEqual(keys, ['20194SCC221']);
});

test('SQUARE-BRACKET CITATIONS ARE INVISIBLE TO THE EXTRACTOR — a known gap', () => {
  /**
   * Pinned as a FAILING EXPECTATION rather than a passing assertion of correct
   * behaviour, because it is not correct behaviour.
   *
   * `citationLookupKey`'s own docstring promises that `(2019) 4 S.C.C. 221`,
   * `[2019] 4 SCC 221` and `(2019)4 SCC  221` all collapse to the same key, and
   * `build-queries.ts` carries a citation SHAPE for the square-bracket form. But
   * `@lawmind/ingest`'s `extractCitations` never produces one: measured 9 Aug
   * 2026, `[2019] 4 SCC 221` and `(2019) 4 S.C.C. 221` both extract to NOTHING.
   *
   * So the normalisation handles forms the extractor cannot find. The blast
   * radius reaches the citation graph and every caller of `classifyQuery`, which
   * is why it is recorded here rather than fixed mid-experiment.
   */
  const spy = spySql([]);
  return citationsPointingAtGold(spy.sql, 'see [2019] 4 SCC 221 for the position', 'gold-1').then(
    (out) => {
      assert.deepEqual(out, [], 'the gap closed — update this test and the note it carries');
      assert.equal(spy.calls, 0, 'the extractor found nothing, so nothing was asked');
    },
  );
});
