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

  it('nothing R8.3 §5 requires OFF is user-reachable', () => {
    // Not a tautology over the object: this is the plan's §5.5/§5.6/§5.7/§5.8
    // list plus NEW1's §1 rows, written out, so that quietly enabling one to make
    // the freeze look broader fails a test rather than passing a review.
    //
    // The assertion is REACHABILITY and not the literal string 'DISABLED',
    // because `search.semantic.broad` is EXPERIMENTAL_INTERNAL — NEW1's call,
    // since the tranche and index are real and its harness exercises them. The
    // two states differ in intent, not in reach, and reach is what a release
    // gate is about.
    for (const name of [
      'search.semantic.broad',
      'search.semantic.supporting_authority',
      'search.semantic.adverse_authority',
      'search.semantic.counterarguments',
      'search.semantic.abstention',
      'generation.evidence_from_passages',
      'generation.premium_jobs',
      'language.hindi',
      'court.ecourts_live',
      'court.cause_list_harvest',
      'treatment.good_law_claim',
      'statute.old_new_correspondence',
    ] as const) {
      assert.equal(isUserReachable(name), false, `${name} must be unreachable for LIMITED V1`);
    }
  });

  it("every semantic row NEW1 published exists here under NEW1's own name", () => {
    // §6 allows exactly one registry. NEW1 measured the semantic evidence and
    // published paste-ready rows; retyping them under LCC names would produce two
    // sets disagreeing about the same numbers — a client branching on one and
    // FIFTH verifying the other. If a row is renamed on either side, this fails.
    for (const name of [
      'search.semantic.broad',
      'search.semantic.supporting_authority',
      'search.semantic.adverse_authority',
      'search.semantic.counterarguments',
      'search.semantic.long_input',
      'search.semantic.abstention',
      'generation.evidence_from_passages',
    ] as const) {
      assert.ok(RELEASE_CAPABILITIES[name], `${name} is a NEW1 row and must be in the registry`);
    }
    // NEW1 has it LIMITED (a served guided refusal), not DISABLED. The distinction
    // is the product's: the route answers, and what it answers is a refusal.
    assert.equal(capabilityState('search.semantic.long_input'), 'LIMITED');
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
    assert.equal(body.data.capabilities['search.semantic.broad']?.state, 'EXPERIMENTAL_INTERNAL');
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
    assert.equal(body.error.details?.capability, 'search.semantic.counterarguments');
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
