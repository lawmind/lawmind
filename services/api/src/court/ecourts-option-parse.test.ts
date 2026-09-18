/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PARSE_EMPTY IS NOT NO_CASES, AND THIS IS THE CASE THAT PROVED IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 30 August 2026. `fillDistrict` answered with eleven Delhi districts and the
 * canary reported `no district (0 offered)` — a sentence indistinguishable from
 * an empty upstream answer, produced by a populated one.
 *
 * The cause was one character class. `optionsOf` required `value=['"]…['"]`,
 * and the interface writes `value=8` with no quotes at all. The ONLY quoted
 * entry in the response is the `value=''` placeholder, which the function then
 * filters out by design — so the parser matched exactly one option and
 * discarded it.
 *
 * The fixture is the RETAINED RESPONSE, byte for byte, from
 * `official_source_artifact` — not a hand-written approximation of it. That is
 * the point: the previous regex looked perfectly reasonable, and only the real
 * bytes said otherwise. Zero live requests were spent to write this test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseDistrictOptions } from './ecourts.ts';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

const RETAINED = JSON.parse(
  readFileSync(join(FIXTURES, 'ecourts-fill-district-delhi-2026-08-30.json'), 'utf8'),
) as { dist_list: string; status: number; app_token: string };

describe('option parsing against the retained fillDistrict response', () => {
  it('reads all eleven Delhi districts from unquoted value attributes', () => {
    const districts = parseDistrictOptions(RETAINED.dist_list);
    assert.equal(districts.length, 11, 'the retained response carries eleven districts');
    assert.deepEqual(districts.map((d) => d.label).sort(), [
      'Central',
      'East',
      'New Delhi',
      'North',
      'North East',
      'North West',
      'Shahdara',
      'South',
      'South East',
      'South West',
      'West',
    ]);
  });

  it('drops the placeholder and only the placeholder', () => {
    const districts = parseDistrictOptions(RETAINED.dist_list);
    assert.equal(
      districts.some((d) => d.label.startsWith('Select')),
      false,
      'the "Select district" placeholder is not a district',
    );
    assert.equal(
      districts.some((d) => d.value === ''),
      false,
    );
  });

  it('the values are the codes the next request has to send', () => {
    const byLabel = new Map(
      parseDistrictOptions(RETAINED.dist_list).map((d) => [d.label, d.value]),
    );
    assert.equal(byLabel.get('Central'), '8');
    assert.equal(byLabel.get('New Delhi'), '7');
    assert.equal(byLabel.get('West'), '9');
  });

  it('still reads quoted and double-quoted values — the source may write any of the three', () => {
    const mixed =
      `<option value='' >Select</option>` +
      `<option value=8  >Unquoted</option>` +
      `<option value='12' >Single</option>` +
      `<option value="15" >Double</option>`;
    assert.deepEqual(parseDistrictOptions(mixed), [
      { value: '8', label: 'Unquoted' },
      { value: '12', label: 'Single' },
      { value: '15', label: 'Double' },
    ]);
  });

  it('an actually empty list parses to nothing — the two must stay distinguishable', () => {
    // The failure this file exists for is a POPULATED response reading as empty.
    // A genuinely empty one must still read as empty, or the fix would have
    // traded one indistinguishable pair for another.
    assert.deepEqual(parseDistrictOptions(`<option value='' >Select district</option>`), []);
    assert.deepEqual(parseDistrictOptions(''), []);
  });
});
