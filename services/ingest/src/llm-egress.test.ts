import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { callInferx } from './inferx.ts';
import { assertPublicOnlyEgress, canEgress, type EgressPayloadClass } from './llm-egress.ts';
import { callOpenRouter } from './openrouter.ts';

describe('canEgress', () => {
  it('permits published legal text, which is all this service holds', () => {
    assert.equal(canEgress('PUBLIC_LEGAL_TEXT', 'inferx').ok, true);
    assert.equal(canEgress('PUBLIC_LEGAL_TEXT', 'openrouter').ok, true);
  });

  it('REFUSES every private class, to every provider', () => {
    const providers = ['inferx', 'openrouter', 'anthropic', 'some-future-vendor'];
    const privateClasses: EgressPayloadClass[] = [
      'PRIVATE_MATTER_METADATA',
      'PRIVATE_CLIENT_FACTS',
      'PRIVATE_UPLOADED_DOCUMENT',
    ];
    for (const provider of providers) {
      for (const cls of privateClasses) {
        const d = canEgress(cls, provider);
        assert.equal(d.ok, false, `${cls} -> ${provider}`);
        if (!d.ok) assert.match(d.reason, /may not send/);
      }
    }
  });

  it('REFUSES a query, because what an advocate types describes their case', () => {
    // "anticipatory bail twin conditions for a co-accused in a 2024 NDPS matter"
    // is a fact about a client's position, not a public document.
    assert.equal(canEgress('PUBLIC_QUERY', 'inferx').ok, false);
  });

  it('names where a private payload SHOULD go, rather than only refusing', () => {
    const d = canEgress('PRIVATE_CLIENT_FACTS', 'inferx');
    assert.equal(d.ok, false);
    if (!d.ok) assert.match(d.reason, /provider-policy\.ts/);
  });
});

describe('the egress gate runs before any request is built', () => {
  /** Counts calls, so "zero requests" is asserted rather than inferred. */
  const countingFetch = () => {
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    return { impl, calls: () => calls };
  };

  it('callInferx makes ZERO outbound requests for a private payload', async () => {
    const f = countingFetch();
    await assert.rejects(
      () =>
        callInferx('a client fact', {
          apiKey: 'k',
          fetchImpl: f.impl,
          payloadClass: 'PRIVATE_CLIENT_FACTS',
        }),
      /EGRESS REFUSED/,
    );
    assert.equal(f.calls(), 0);
  });

  it('callOpenRouter makes ZERO outbound requests for a private payload', async () => {
    const f = countingFetch();
    await assert.rejects(
      () =>
        callOpenRouter('a client fact', {
          apiKey: 'k',
          model: 'deepseek-v4-flash',
          fetchImpl: f.impl,
          payloadClass: 'PRIVATE_UPLOADED_DOCUMENT',
        }),
      /EGRESS REFUSED/,
    );
    assert.equal(f.calls(), 0);
  });

  it('still sends corpus text — the gate must not stop the work it permits', async () => {
    const f = countingFetch();
    const r = await callInferx('paragraph 14 of a reported judgment', {
      apiKey: 'k',
      model: 'deepseek-v4-flash-0731',
      fetchImpl: f.impl,
    });
    assert.equal(r.ok, true);
    assert.equal(f.calls(), 1);
  });
});

describe('assertPublicOnlyEgress', () => {
  it('throws with a reason a reader can act on', () => {
    assert.throws(
      () => assertPublicOnlyEgress('PRIVATE_MATTER_METADATA', 'inferx'),
      /EGRESS REFUSED/,
    );
  });

  it('does not throw for the permitted class', () => {
    assert.doesNotThrow(() => assertPublicOnlyEgress('PUBLIC_LEGAL_TEXT', 'inferx'));
  });
});
