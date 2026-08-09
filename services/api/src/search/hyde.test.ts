/**
 * This module generates prose about law, which `CLAUDE.md` otherwise forbids.
 * It is acceptable only because of where that prose is allowed to go — so the
 * tests that matter are the containment ones, not the happy path.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import type { Sql } from 'postgres';

import { HYDE_PROMPT, hydeText, stripInventedCitations } from './hyde.ts';

function fakeSql(): Sql {
  return ((_s: TemplateStringsArray, ..._v: unknown[]) => Promise.resolve([])) as unknown as Sql;
}

const ok = (content: string) =>
  (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content } }], usage: { cost: 0 } }),
      { status: 200 },
    )) as unknown as typeof fetch;

afterEach(() => {
  delete process.env['DPA_COUNTERSIGNED'];
});

/* ------------------------------------------ invented citations -- */

test('EVERY REPORTER FORMAT IS STRIPPED — the model invents all of them', () => {
  // The model has no retrieval, so each of these is fabricated by construction.
  const text =
    'The Court in AIR 1978 SC 597 held one thing, in (2019) 4 SCC 221 another, ' +
    'in 2023 INSC 456 a third, and in [1963] 1 SCR 332 a fourth.';
  const out = stripInventedCitations(text);
  for (const shape of ['AIR 1978 SC 597', '(2019) 4 SCC 221', '2023 INSC 456', '[1963] 1 SCR 332']) {
    assert.ok(!out.includes(shape), `survived: ${shape}`);
  }
});

test('BARE CASE NAMES ARE STRIPPED TOO — they point just as hard', () => {
  // A hallucinated authority is noise pointing SOMEWHERE SPECIFIC, which is
  // worse than noise: it drags the vector toward a real case that has nothing
  // to do with the query.
  const out = stripInventedCitations(
    'Following Maneka Gandhi v. Union of India, the principle was settled.',
  );
  assert.ok(!out.includes('Maneka'), 'a bare case name survived');
  assert.ok(!out.includes(' v. '), 'the case-name join survived');
});

test('ordinary judicial prose survives stripping intact', () => {
  // Over-stripping is its own failure — it would leave the embedder less than
  // the raw query had.
  const prose =
    'The protection granted under Section 438 would not ordinarily be limited to a fixed period.';
  assert.equal(stripInventedCitations(prose), prose);
});

/* -------------------------------------------------- the prompt -- */

test('the prompt asks for REGISTER, not for a correct answer', () => {
  // Asking for correctness invites reasoning about Indian law from memory,
  // which no frontier model can do for BNS/BNSS/BSA.
  const p = HYDE_PROMPT('anticipatory bail time limit');
  assert.match(p, /Do not answer the question/);
  assert.match(p, /do not name any case or cite any authority/);
  assert.match(p, /anticipatory bail time limit/);
});

/* ----------------------------------------------- the fallbacks -- */

test('A REFUSAL FALLS BACK TO THE RAW QUERY — search must not break', () => {
  // Sensitive class with no DPA is refused by the routing layer. HyDE must
  // degrade to exactly today's search, never to nothing.
  return hydeText(fakeSql(), 'section 138 dishonour', 'sensitive', {
    fetchImpl: ok('should never be reached'),
  }).then((r) => {
    assert.equal(r.generated, false);
    assert.equal(r.text, 'section 138 dishonour');
  });
});

test('a network failure falls back rather than throwing', async () => {
  const r = await hydeText(fakeSql(), 'section 138 dishonour', 'public', {
    openRouterKey: 'k',
    fetchImpl: (async () => {
      throw new Error('socket hang up');
    }) as never,
  });
  assert.equal(r.generated, false);
  assert.equal(r.text, 'section 138 dishonour');
});

test('a missing key falls back — the path works without one', async () => {
  const r = await hydeText(fakeSql(), 'section 138 dishonour', 'public', {
    openRouterKey: undefined,
    fetchImpl: ok('x'),
  });
  assert.equal(r.generated, false);
});

test('AN EMPTY OR STUNTED COMPLETION FALLS BACK', async () => {
  // DeepSeek V4 Flash emits reasoning tokens, so a small max_tokens returns
  // empty content. Embedding that in place of the question is strictly worse
  // than embedding the question.
  for (const stunted of ['', '   ', 'Yes.']) {
    const r = await hydeText(fakeSql(), 'whether anticipatory bail may be limited in time', 'public', {
      openRouterKey: 'k',
      fetchImpl: ok(stunted),
    });
    assert.equal(r.generated, false, `accepted a stunted completion: ${JSON.stringify(stunted)}`);
  }
});

/* ------------------------------------------------ the happy path -- */

test('the query is KEPT alongside the hypothetical, not replaced by it', async () => {
  // The advocate's own words carry the section numbers and doctrinal terms that
  // are the most reliable signal in this corpus. Classic HyDE discards them.
  const hypo =
    'The protection so granted does not ordinarily stand extinguished upon the expiry of any ' +
    'period fixed by the court, and the accused remains entitled to the benefit until the ' +
    'trial concludes in accordance with law.';
  const r = await hydeText(fakeSql(), 'anticipatory bail time limit', 'public', {
    openRouterKey: 'k',
    fetchImpl: ok(hypo),
  });
  assert.equal(r.generated, true);
  assert.ok(r.text.startsWith('anticipatory bail time limit'), 'the query was dropped');
  assert.ok(r.text.includes('extinguished'), 'the hypothetical was dropped');
});

test('a generated citation never reaches the embedded text', async () => {
  const r = await hydeText(fakeSql(), 'whether anticipatory bail may be limited in time', 'public', {
    openRouterKey: 'k',
    fetchImpl: ok(
      'The settled position, as laid down in AIR 1980 SC 1632, is that the protection ' +
        'continues and does not lapse merely because a period was mentioned in the order below.',
    ),
  });
  assert.equal(r.generated, true);
  assert.ok(!r.text.includes('AIR 1980 SC 1632'), 'an invented citation reached the embedder');
});

/* ------------------------------------------ the query-shape gate -- */

test('A CITATION QUERY IS SKIPPED — retrieve.ts already pins it at rank 1', async () => {
  // 2,519-4,916 ms of generation to improve a result that is already exact.
  const r = await hydeText(fakeSql(), '(2019) 4 SCC 221', 'public', {
    openRouterKey: 'k',
    fetchImpl: ok('should never be reached'),
  });
  assert.equal(r.skipped, true);
  assert.equal(r.generated, false);
  assert.equal(r.text, '(2019) 4 SCC 221');
});

test('a section query is skipped — the number is the strongest lexical signal we have', async () => {
  let called = false;
  const r = await hydeText(fakeSql(), 'section 138 NI Act', 'public', {
    openRouterKey: 'k',
    fetchImpl: (async () => {
      called = true;
      return new Response('{}');
    }) as never,
  });
  assert.equal(r.skipped, true);
  assert.equal(called, false, 'a skipped query still paid for a model call');
});

test('SKIPPED AND FAILED ARE DIFFERENT — a design choice must not read as an outage', async () => {
  // If both reported as one number, a run with the model down would look
  // exactly like a run that was correctly gated.
  const skipped = await hydeText(fakeSql(), '(2019) 4 SCC 221', 'public', { openRouterKey: 'k', fetchImpl: ok('x') });
  const failed = await hydeText(fakeSql(), 'whether the protection continues after the period', 'public', {
    openRouterKey: undefined,
    fetchImpl: ok('x'),
  });
  assert.equal(skipped.skipped, true);
  assert.notEqual(failed.skipped, true);
  assert.equal(failed.generated, false);
});

test('a concept query is NOT skipped — this is the case HyDE exists for', async () => {
  const r = await hydeText(fakeSql(), 'whether the protection continues after the period fixed', 'public', {
    openRouterKey: 'k',
    fetchImpl: ok(
      'The protection so granted does not ordinarily stand extinguished upon the expiry of any ' +
        'period fixed by the court, and the accused remains entitled to its benefit throughout.',
    ),
  });
  assert.notEqual(r.skipped, true);
  assert.equal(r.generated, true);
});
