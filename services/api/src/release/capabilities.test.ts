/**
 * The capability registry is only a gate if a request actually bounces off it.
 *
 * R8.3 §6 names the two ways a registry stops being one: a client screen that
 * exists anyway, and a stale flag. Both are invisible to a test that reads the
 * registry object. So every assertion here goes through the real Hono app and
 * asks the SERVER what it did.
 *
 * FIFTH's §6 checks, restated as tests:
 *   - disabled semantic endpoints refuse or return the designated safe state;
 *   - no premium/generation route bypasses the registry;
 *   - a client can query the release capability set.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { createApp } from '../app.ts';
import {
  RELEASE_CAPABILITIES,
  RELEASE_CAPABILITIES_VERSION,
  capabilityState,
  isUserReachable,
  type CapabilityName,
} from './capabilities.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });
const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

after(async () => {
  await sql.end();
});

describe('release capability registry — the object', () => {
  it('every capability carries a reason and an as-of, and no reason is a plan', () => {
    for (const [name, cap] of Object.entries(RELEASE_CAPABILITIES)) {
      assert.ok(cap.reason.length > 40, `${name} needs a reason stated as evidence, not a label`);
      assert.match(cap.asOf, /^\d{4}-\d{2}-\d{2}$/, `${name} needs a real as-of date`);
      // A reason has to name the measured fact that would have to change. These
      // are the phrases that mean nobody wrote one.
      assert.doesNotMatch(
        cap.reason,
        /pending further work|TBD|to be decided|coming soon/i,
        `${name}'s reason is an intention, not evidence`,
      );
    }
  });

  it('EXPERIMENTAL_INTERNAL is not a synonym for ENABLED', () => {
    // The whole reason that state exists: a lane's harness may import the code
    // path, and no request may reach it. If this ever returns true the state has
    // silently become a fourth way of saying "on".
    const states: Record<string, boolean> = {
      ENABLED: true,
      LIMITED: true,
      DISABLED: false,
      EXPERIMENTAL_INTERNAL: false,
    };
    for (const [name, cap] of Object.entries(RELEASE_CAPABILITIES)) {
      assert.equal(
        isUserReachable(name as CapabilityName),
        states[cap.state],
        `${name} (${cap.state}) is reachable in the wrong direction`,
      );
    }
  });

  it('the LIMITED-V1 refusals R8.3 §5 requires are actually DISABLED', () => {
    // Not a tautology over the object: this is the plan's §5.6/§5.7/§5.8 list,
    // written out, so that quietly enabling one to make the freeze look broader
    // fails a test rather than passing a review.
    for (const name of [
      'search.semantic_broad',
      'search.long_narrative_query',
      'generation.counterarguments',
      'generation.supporting_adverse_synthesis',
      'generation.premium_jobs',
      'language.hindi',
      'court.ecourts_live',
      'court.cause_list_harvest',
      'treatment.good_law_claim',
    ] as const) {
      assert.equal(capabilityState(name), 'DISABLED', `${name} must be OFF for LIMITED V1`);
    }
  });

  it('the capabilities a limited V1 rests on are NOT disabled', () => {
    // The other half. A registry that disabled everything would pass every test
    // above and ship nothing.
    for (const name of [
      'search.exact_identity',
      'search.structured_filters',
      'search.pagination',
      'judgment.reader',
      'statute.lookup',
      'matter.workspace',
      'matter.saved_authorities',
    ] as const) {
      assert.ok(isUserReachable(name), `${name} is the point of the limited freeze`);
    }
  });
});

describe('release capability registry — the server enforces it', () => {
  it('GET /release/capabilities is reachable without auth and names its version', async () => {
    const res = await app.request('/release/capabilities');
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { registryVersion: string; capabilities: Record<string, { state: string }> };
    };
    assert.equal(body.ok, true);
    assert.equal(body.data.registryVersion, RELEASE_CAPABILITIES_VERSION);
    // A client must be able to discover a refusal BEFORE rendering a screen for it.
    assert.equal(body.data.capabilities['search.semantic_broad']?.state, 'DISABLED');
  });

  it('POST /arguments/counter REFUSES — 409 with the registry reason, not an empty 200', async () => {
    const res = await app.request('/arguments/counter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: 'the appeal ought to be allowed' }),
    });
    // 409 rather than 404 (which says the route does not exist, and a client
    // caches that as a bad build) and rather than an empty 200 (which renders as
    // "there is no law on this" on a phone).
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      ok: boolean;
      error: { code: string; details?: { capability?: string; state?: string; reason?: string } };
    };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'CAPABILITY_DISABLED');
    assert.equal(body.error.details?.capability, 'generation.counterarguments');
    assert.equal(body.error.details?.state, 'DISABLED');
    assert.ok((body.error.details?.reason?.length ?? 0) > 40);
  });

  it('POST /premium/jobs REFUSES — no generation route bypasses the registry', async () => {
    const res = await app.request('/premium/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterId: '00000000-0000-4000-8000-000000000000', kind: 'brief' }),
    });
    // Auth or validation may reject first; what must NEVER happen is a 200 that
    // starts a job. Both refusals are acceptable, an admission is not.
    assert.notEqual(res.status, 200, 'a disabled generation route must not admit a job');
    assert.notEqual(res.status, 201);
  });

  it('POST /search still ANSWERS with semantic off — the arm is gated, not the route', async () => {
    // The distinction the whole limited freeze rests on. Refusing /search
    // because semantic is off would take exact identity away with it.
    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'AIR 1973 SC 1461', language: 'en' }),
    });
    assert.notEqual(res.status, 409, '/search must not be refused by the registry');
    assert.ok(res.status === 200 || res.status === 401, `unexpected ${res.status}`);
    if (res.status === 200) {
      const body = (await res.json()) as {
        data: { retrievalOutcome: { semanticAvailable?: boolean; state: string } };
      };
      // The server-authoritative verdict is still present and still honest.
      assert.ok(body.data.retrievalOutcome, 'retrievalOutcome is never optional');
    }
  });
});
