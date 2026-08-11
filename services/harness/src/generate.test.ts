/**
 * The property under test is that the PIPELINE never shows an invented
 * reference as confirmed and never quietly deletes one. The model is allowed to
 * misbehave; we are not.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type Evidence,
  MAX_TOKENS,
  extractCitedIds,
  generate,
  gradeReferences,
  resolveReferences,
} from './generate.ts';

const EVIDENCE: Evidence[] = [
  { id: 'E1', judgmentId: 'j-1', caseTitle: 'A v B', passage: 'text one' },
  { id: 'E2', judgmentId: 'j-2', caseTitle: 'C v D', passage: 'text two' },
];

/* ------------------------------------------------------------ extraction -- */

test('evidence IDs are read from square brackets', () => {
  assert.deepEqual(extractCitedIds('The Court held X [E1] and Y [E2].'), ['E1', 'E2']);
});

test('a bare E12 in prose is NOT a citation', () => {
  // Over-counting inflates the denominator of both metrics, making a bad run
  // look better — the wrong direction to be wrong in.
  assert.deepEqual(extractCitedIds('section E12 of the agreement'), []);
});

test('repeated citations collapse — one reference, cited twice, is one reference', () => {
  assert.deepEqual(extractCitedIds('X [E1] and also Y [E1]'), ['E1']);
});

test('an answer citing nothing yields nothing, not a crash', () => {
  assert.deepEqual(extractCitedIds('The evidence does not answer this question.'), []);
});

/* ------------------------------------------------------------- resolution -- */

test('a real ID resolves and is verified', () => {
  const [r] = resolveReferences(['E1'], EVIDENCE);
  assert.equal(r!.state, 'verified');
  assert.equal(r!.judgmentId, 'j-1');
});

test('AN INVENTED ID IS KEPT AND MARKED UNVERIFIED — never dropped', () => {
  // The single most important test in this file. CITATION_HARNESS: an
  // unverified citation may be shown, may never be shown as confirmed, and may
  // NEVER be silently dropped. Threshold is zero.
  const refs = resolveReferences(['E1', 'E9'], EVIDENCE);
  assert.equal(refs.length, 2, 'an invented reference was dropped');
  const invented = refs.find((r) => r.id === 'E9')!;
  assert.equal(invented.state, 'unverified');
  assert.equal(invented.judgmentId, null);
});

test('every emitted ID comes back — count in equals count out, always', () => {
  for (const ids of [[], ['E1'], ['E9'], ['E1', 'E2', 'E7', 'E8']]) {
    assert.equal(
      resolveReferences(ids, EVIDENCE).length,
      ids.length,
      `${ids.length} emitted but a different number returned`,
    );
  }
});

test('an invented ID is never reported as verified', () => {
  const refs = resolveReferences(['E1', 'E9', 'E99'], EVIDENCE);
  const g = gradeReferences(refs);
  assert.equal(g.hallucinated, 0, 'something unresolved was marked verified');
  assert.equal(g.total, 3);
  assert.equal(refs.filter((r) => r.state === 'unverified').length, 2);
});

test('case does not decide truth — e1 resolves like E1', () => {
  assert.equal(resolveReferences(['e1'], EVIDENCE)[0]!.state, 'verified');
});

/* --------------------------------------------------------------- the call -- */

test('without a key the generator THROWS rather than returning an empty answer', async () => {
  // An empty answer cites nothing, and a run that cites nothing grades as
  // perfect on both generation metrics. Refusing loudly is the only safe
  // failure.
  //
  // THE ENVIRONMENT IS REMOVED, NOT JUST THE ARGUMENT. `apiKey: undefined` means
  // *"fall back to the environment"* — which is the correct production
  // behaviour — so on a machine with a real OPENROUTER_API_KEY this test used to
  // sail past the refusal, reach the stubbed fetch, and fail with
  // `SyntaxError: Unexpected end of JSON input`. **It passed only where no key
  // was configured.**
  //
  // That is the same family as the defect this package already records —
  // `run-cli.ts` reporting 0, a PASS, the moment `OPENROUTER_API_KEY` merely
  // existed. A test whose result depends on a developer's `.env` is not a test.
  // Same reasoning extends to INFERX_API_KEY: it is now also consulted via
  // the environment when `inferxKey` is not passed, so a machine with a real
  // one configured (this one, since 11 Aug) would sail past the refusal the
  // same way a real OPENROUTER_API_KEY once did.
  const saved = process.env['OPENROUTER_API_KEY'];
  const savedInferx = process.env['INFERX_API_KEY'];
  delete process.env['OPENROUTER_API_KEY'];
  delete process.env['INFERX_API_KEY'];
  try {
    await assert.rejects(
      generate('q', EVIDENCE, {
        apiKey: undefined,
        inferxKey: undefined,
        fetchImpl: (async () => new Response('')) as never,
      }),
      /refuses rather than returning/,
    );
  } finally {
    if (saved !== undefined) process.env['OPENROUTER_API_KEY'] = saved;
    if (savedInferx !== undefined) process.env['INFERX_API_KEY'] = savedInferx;
  }
});

test('inferx is preferred over OpenRouter for GENERATION_MODEL when both keys exist', async () => {
  const calledUrls: string[] = [];
  const fetchImpl = (async (url: unknown) => {
    calledUrls.push(String(url));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '[E1]' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const g = await generate('q', EVIDENCE, { apiKey: 'or-key', inferxKey: 'ix-key', fetchImpl });
  assert.match(calledUrls[0]!, /inferx\.net/);
  assert.equal(g.usage.costUsd, 0, 'the free grant must never be billed');
});

test('a model override away from GENERATION_MODEL never routes to inferx', async () => {
  const calledUrls: string[] = [];
  const fetchImpl = (async (url: unknown) => {
    calledUrls.push(String(url));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '[E1]' } }], usage: {} }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  await generate('q', EVIDENCE, {
    apiKey: 'or-key',
    inferxKey: 'ix-key',
    model: 'some/other-model',
    fetchImpl,
  });
  assert.match(calledUrls[0]!, /openrouter\.ai/);
});

test('max_tokens is generous, because reasoning tokens are spent first', () => {
  // Measured: max_tokens 5 returned finish_reason "length" and EMPTY content.
  // A harness reading that would record "no citations" and call it clean.
  assert.ok(MAX_TOKENS >= 1000, 'max_tokens is low enough that reasoning could consume it all');
});

test('the prompt asks for evidence IDs and never for a citation string', async () => {
  let sent = '';
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    sent = String(init.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'X [E1]' } }], usage: {} }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const g = await generate('what is the rule', EVIDENCE, { apiKey: 'k', fetchImpl });
  assert.match(sent, /Never write a case citation yourself/);
  assert.match(sent, /\[E1\]/);
  assert.deepEqual(g.citedIds, ['E1']);
  assert.equal(g.references[0]!.state, 'verified');
});

test('a model that invents an ID produces an unverified reference, end to end', async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'The Court held X [E1] and Y [E7].' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.000001 },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  const g = await generate('q', EVIDENCE, { apiKey: 'k', fetchImpl });
  assert.equal(g.references.length, 2);
  assert.equal(g.references.find((r) => r.id === 'E7')!.state, 'unverified');
  assert.equal(gradeReferences(g.references).hallucinated, 0);
});

test('an HTTP failure throws — it does not return a clean empty run', async () => {
  const fetchImpl = (async () =>
    new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(generate('q', EVIDENCE, { apiKey: 'k', fetchImpl }), /http 429/);
});
