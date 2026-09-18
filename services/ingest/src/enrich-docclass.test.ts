/**
 * The class is a CLAIM, not an answer. These assert the two failure modes that
 * matter: a fabricated class must not reach the graph, and a refusal must
 * survive as a refusal rather than being coerced into a neighbouring class.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDocumentClassPrompt, claimsFromDocumentClass, verifyClaims } from './enrich.ts';

describe('document_class claims', () => {
  it('accepts one of the five, carrying its evidence', () => {
    const c = claimsFromDocumentClass({ class: 'bail_order', evidence: 'bail is granted' });
    assert.equal(c.length, 1);
    assert.equal(c[0]?.value, 'bail_order');
    assert.equal(c[0]?.kind, 'document_class');
  });

  it('drops a class outside the vocabulary instead of coercing it', () => {
    // A neighbouring guess is worse than nothing: it looks like a real class.
    assert.deepEqual(claimsFromDocumentClass({ class: 'bail', evidence: 'x' }), []);
    assert.deepEqual(claimsFromDocumentClass({ class: 'interim_order', evidence: 'x' }), []);
  });

  it('treats null as a refusal, which is a valid outcome', () => {
    assert.deepEqual(claimsFromDocumentClass({ class: null, evidence: null }), []);
  });
});

describe('the span still decides whether it is believed', () => {
  const SOURCE =
    'The applicant seeks regular bail. Having heard counsel, bail is granted subject to conditions.';

  it('verifies a class whose evidence is really in the text', () => {
    const v = verifyClaims(
      claimsFromDocumentClass({ class: 'bail_order', evidence: 'bail is granted' }),
      SOURCE,
    );
    assert.equal(v.length, 1);
    assert.equal(v[0]?.verified, true, 'a locatable span must verify');
  });

  it('rejects a class whose evidence is not in the text', () => {
    // The failure this whole pipeline exists to catch: fluent, plausible, absent.
    const v = verifyClaims(
      claimsFromDocumentClass({
        class: 'procedural_disposal',
        evidence: 'the petition is withdrawn',
      }),
      SOURCE,
    );
    assert.equal(v.length, 1);
    // `assert.ok(!v[0]?.ok)` passed here purely because `ok` does not exist and
    // `!undefined` is true — a false pass. The field is `verified`.
    assert.equal(v[0]?.verified, false, 'an unlocatable span must NOT verify');
  });
});

describe('the prompt', () => {
  it('names all five classes and demands a verbatim span', () => {
    const p = buildDocumentClassPrompt('some judgment text');
    for (const cls of [
      'bail_order',
      'procedural_disposal',
      'reference_stub',
      'decided',
      'decided_brief',
    ]) {
      assert.ok(p.includes(cls), `${cls} must be offered`);
    }
    assert.ok(p.includes('verbatim substring'));
    assert.ok(p.includes('some judgment text'));
  });

  it('makes refusing explicitly cheaper than guessing', () => {
    const p = buildDocumentClassPrompt('x');
    assert.ok(/Guessing is worse than refusing/.test(p));
  });
});
