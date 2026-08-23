/**
 * The provider gate, asserted as a REFUSAL rather than as a table.
 *
 * The failure this guards against is not "the policy file says the wrong thing"
 * — it is "the policy file says the right thing and nothing consults it". So the
 * last test drives the gate through `callModel` with a fetch that records
 * whether a request was ever made: a private payload must produce ZERO outbound
 * requests, not a refused response after a successful one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { callModel } from './call.ts';
import {
  PROVIDER_POLICY,
  canSendDataClassToProvider,
  canSendToProvider,
  dataClassFor,
  isPrivate,
  policyIncoherences,
  type PayloadClass,
  type Provider,
} from './provider-policy.ts';

const PROVIDERS: Provider[] = ['inferx', 'openrouter', 'anthropic'];
const PRIVATE_CLASSES: PayloadClass[] = [
  'PUBLIC_QUERY',
  'PRIVATE_MATTER_METADATA',
  'PRIVATE_CLIENT_FACTS',
  'PRIVATE_DOCUMENT',
  'OTHER',
];

describe('provider policy — the classification', () => {
  it('only published law is public class; everything else, including a query, is sensitive', () => {
    assert.equal(dataClassFor('PUBLIC_LEGAL_TEXT'), 'public');
    // What an advocate types describes their client's position. It is called
    // PUBLIC_QUERY on the wire and it is not public in substance.
    assert.equal(dataClassFor('PUBLIC_QUERY'), 'sensitive');
    for (const p of PRIVATE_CLASSES) assert.equal(dataClassFor(p), 'sensitive', p);
  });

  it('OTHER — the unclassified case — resolves to sensitive, never to public', () => {
    assert.equal(dataClassFor('OTHER'), 'sensitive');
    assert.equal(isPrivate('OTHER'), true);
  });
});

describe('provider policy — the gate', () => {
  it('every provider accepts published law, because refusing it protects nothing', () => {
    for (const provider of PROVIDERS) {
      const d = canSendToProvider('PUBLIC_LEGAL_TEXT', provider);
      assert.equal(d.ok, true, `${provider} refused PUBLIC_LEGAL_TEXT`);
    }
  });

  it('NO provider currently accepts any private class, and the reason names the missing term', () => {
    for (const provider of PROVIDERS) {
      for (const payload of PRIVATE_CLASSES) {
        const d = canSendToProvider(payload, provider);
        assert.equal(d.ok, false, `${provider} accepted ${payload}`);
        if (!d.ok) {
          assert.match(
            d.reason,
            /UNVERIFIED|NONE/,
            `${provider}/${payload} refused without naming the unrecorded term`,
          );
        }
      }
    }
  });

  it('the coarse entry point maps sensitive to the STRICT private class, not a lenient one', () => {
    for (const provider of PROVIDERS) {
      assert.equal(canSendDataClassToProvider('public', provider).ok, true);
      assert.equal(canSendDataClassToProvider('sensitive', provider).ok, false);
    }
  });

  it('an unknown provider is refused rather than defaulted', () => {
    const d = canSendToProvider('PUBLIC_LEGAL_TEXT', 'some-new-vendor' as Provider);
    assert.equal(d.ok, false);
  });

  it('the table is coherent: nothing permits a private class on an unread agreement', () => {
    assert.deepEqual(policyIncoherences(), []);
  });

  it('every provider states all eight policy fields — a blank is a decision nobody made', () => {
    for (const policy of Object.values(PROVIDER_POLICY)) {
      for (const field of [
        'whatItIs',
        'retention',
        'trainingUse',
        'contractStatus',
        'logging',
        'fallback',
      ] as const) {
        assert.ok(
          typeof policy[field] === 'string' && policy[field].length > 0,
          `${policy.provider}.${field} is empty`,
        );
      }
      assert.ok(Array.isArray(policy.permits), `${policy.provider}.permits missing`);
      assert.equal(typeof policy.requiresRedaction, 'boolean');
    }
  });
});

describe('provider policy — it is actually consulted', () => {
  /** A sql double: any call here would be a bug, since nothing should be sent. */
  const sqlNever = (() => {
    throw new Error('the ledger was written for a call that must never have been made');
  }) as never;

  it('a private payload makes ZERO outbound requests', async () => {
    let requests = 0;
    const fetchImpl = (async () => {
      requests += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const res = await callModel(
      sqlNever,
      {
        dataClass: 'public', // deliberately the LENIENT coarse class...
        feature: 'search',
        prompt: 'the client says he was not at the scene on the night of the 14th',
        userId: null,
        payloadClass: 'PRIVATE_CLIENT_FACTS', // ...and the fine class must still refuse
      },
      { fetchImpl, inferxKey: 'test-key' },
    );

    assert.equal(res.ok, false);
    assert.equal(requests, 0, 'a private payload reached the network');
    if (!res.ok) assert.match(res.reason, /may not receive PRIVATE_CLIENT_FACTS/);
  });

  it('the refusal happens even when the sensitive route is what selected the model', async () => {
    let requests = 0;
    const fetchImpl = (async () => {
      requests += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const res = await callModel(
      sqlNever,
      { dataClass: 'sensitive', feature: 'search', prompt: 'matter note', userId: null },
      { fetchImpl, anthropicKey: 'test-key' },
    );
    assert.equal(res.ok, false);
    assert.equal(requests, 0);
  });
});
