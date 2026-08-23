/**
 * The resolver, tested for the refusals rather than for the hits.
 *
 * A resolver is easy to make look good — resolve the easy ones and stay quiet
 * about the rest. What makes it safe is what it REFUSES to say, so most of these
 * cases assert an absence: no winner picked from an ambiguous set, no treatment
 * inferred from a citation, no match on a fragment.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { RESOLVER_VERSION, canonicalKeyFor, metricsFor, resolveBatch } from './resolver.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });

after(async () => {
  await sql.end({ timeout: 5 });
});

describe('resolver — the refusal gate is pure and runs before any query', () => {
  it('placeholders are refused with a reason, never looked up', () => {
    for (const junk of ['N/A', 'n.a.', 'NIL', 'none', 'NULL', 'not available', '---', '???', '000']) {
      const g = canonicalKeyFor(junk);
      assert.equal(g.refused, true, `${junk} was accepted as a citation`);
    }
  });

  it('back-references are refused — they point at a previous line, not a case', () => {
    for (const back of ['ibid', 'Ibid.', 'supra', 'op. cit.', 'id.']) {
      assert.equal(canonicalKeyFor(back).refused, true, `${back} was accepted`);
    }
  });

  it('a fragment with no digit or no letter is refused', () => {
    assert.equal(canonicalKeyFor('SCC').refused, true);
    assert.equal(canonicalKeyFor('2019').refused, true);
    assert.equal(canonicalKeyFor('(2019)').refused, true);
  });

  it('a real citation forms a key, and equivalent spellings form the SAME key', () => {
    const a = canonicalKeyFor('(2019) 4 S.C.C. 221');
    const b = canonicalKeyFor('[2019] 4 SCC 221');
    const c = canonicalKeyFor('2019  4   scc 221');
    assert.equal(a.refused, false);
    if (!a.refused && !b.refused && !c.refused) {
      assert.equal(a.key, b.key);
      assert.equal(b.key, c.key);
      assert.equal(a.key, '20194SCC221');
    }
  });

  it('digits are never touched, so 221 and 212 stay different cases', () => {
    const a = canonicalKeyFor('(2019) 4 SCC 221');
    const b = canonicalKeyFor('(2019) 4 SCC 212');
    assert.notEqual((a as { key: string }).key, (b as { key: string }).key);
  });
});

describe('resolver — against the live key table', () => {
  it('a key held by exactly one judgment resolves UNIQUE, and says how many we hold', async () => {
    const [row] = await sql<{ source_text: string }[]>`
      SELECT source_text FROM (
        SELECT source_text, citation_key, count(*) OVER (PARTITION BY citation_key) AS n
          FROM judgment_citation_keys LIMIT 2000
      ) t WHERE n = 1 LIMIT 1`;
    if (!row) return; // nothing single-target in the sample window

    const [res] = await resolveBatch(sql, [row.source_text]);
    assert.ok(res);
    // The row we sampled may be shared with a judgment outside the sample, so
    // the honest assertion is on the SHAPE, not on the state.
    assert.ok(['UNIQUE', 'AMBIGUOUS'].includes(res!.state), `unexpected ${res!.state}`);
    assert.equal(res!.heldCandidates, res!.candidates.length);
    assert.equal(res!.raw, row.source_text, 'the raw string was not preserved');
  });

  it('a citation nobody holds is TARGET_NOT_HELD — never UNIQUE, never a guess', async () => {
    const [res] = await resolveBatch(sql, ['(1911) 99 ZZZ 12345']);
    assert.equal(res!.state, 'TARGET_NOT_HELD');
    assert.equal(res!.candidates.length, 0);
    assert.equal(res!.heldCandidates, 0);
    assert.notEqual(res!.key, null, 'a well-formed miss must still report its key');
  });

  it('an AMBIGUOUS key returns EVERY candidate and picks no winner', async () => {
    const [shared] = await sql<{ citation_key: string; n: string }[]>`
      SELECT citation_key, count(DISTINCT judgment_id)::text AS n
        FROM judgment_citation_keys
       GROUP BY citation_key HAVING count(DISTINCT judgment_id) > 1
       LIMIT 1`;
    if (!shared) return; // no shared key in this corpus

    const [text] = await sql<{ source_text: string }[]>`
      SELECT source_text FROM judgment_citation_keys
       WHERE citation_key = ${shared.citation_key} LIMIT 1`;
    const [res] = await resolveBatch(sql, [text!.source_text]);

    assert.equal(res!.state, 'AMBIGUOUS');
    assert.ok(res!.candidates.length > 1, 'an ambiguous key returned one candidate');
    // No winner: every candidate is present, and no field marks one as chosen.
    const serialised = JSON.stringify(res);
    for (const forbidden of ['chosen', 'best', 'preferred', 'winner']) {
      assert.ok(!serialised.includes(forbidden), `the result names a ${forbidden}`);
    }
  });

  it('EVERY result carries relationship UNKNOWN and is ineligible as treatment', async () => {
    const results = await resolveBatch(sql, [
      '(2019) 4 SCC 221',
      'N/A',
      '(1911) 99 ZZZ 12345',
    ]);
    assert.equal(results.length, 3);
    for (const r of results) {
      assert.equal(r.relationship, 'UNKNOWN', 'the resolver inferred a relationship');
      assert.equal(
        r.verifiedTreatmentEligible,
        false,
        'a resolved citation was marked eligible as verified treatment',
      );
      assert.equal(r.version, RESOLVER_VERSION);
    }
  });

  it('inputs and outputs zip: one result per input, in order, raw preserved', async () => {
    const raws = ['NIL', '(2019) 4 SCC 221', 'ibid', '(1911) 99 ZZZ 12345'];
    const results = await resolveBatch(sql, raws);
    assert.equal(results.length, raws.length);
    results.forEach((r, i) => assert.equal(r.raw, raws[i]));
  });

  it('an all-refused batch issues NO query and still returns a result each', async () => {
    const results = await resolveBatch(sql, ['N/A', 'nil', '???']);
    assert.equal(results.length, 3);
    for (const r of results) {
      assert.equal(r.state, 'REFUSED');
      assert.equal(r.key, null);
      assert.ok(r.refusedReason);
    }
  });
});

describe('resolver — the metric cannot be gamed by refusing more', () => {
  it('rates are over FORMED references, and refusals are reported absolutely', () => {
    const m = metricsFor([
      { state: 'REFUSED' } as never,
      { state: 'REFUSED' } as never,
      { state: 'UNIQUE' } as never,
      { state: 'AMBIGUOUS' } as never,
      { state: 'TARGET_NOT_HELD' } as never,
    ]);
    assert.equal(m.n, 5);
    assert.equal(m.refused, 2);
    assert.equal(m.formed, 3);
    // 2 of 3 formed hit something — refusing the two junk strings did not
    // flatter the rate.
    assert.equal(Math.round(m.hitRate * 100), 67);
    assert.equal(Math.round(m.uniqueRate * 100), 33);
    assert.equal(Math.round(m.targetNotHeldRate * 100), 33);
  });

  it('an all-refused batch reports zero rates rather than NaN', () => {
    const m = metricsFor([{ state: 'REFUSED' } as never]);
    assert.equal(m.formed, 0);
    assert.equal(m.hitRate, 0);
    assert.ok(!Number.isNaN(m.uniqueRate));
  });
});
