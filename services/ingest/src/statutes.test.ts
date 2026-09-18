import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ActRecord } from './indiacode.ts';
import {
  assertExpectedAct,
  CRIMINAL_CODE_HANDLES,
  EXPECTED_MINISTRY,
  REPEALED_CRIMINAL_CODE_HANDLES,
} from './statutes.ts';

const act = (over: Partial<ActRecord>): ActRecord => ({
  actId: 'AC_CEN_5_23_00049_202346_1719552320687',
  shortTitle: 'The Bharatiya Nyaya Sanhita, 2023',
  hindiTitle: null,
  actNumber: '45',
  actYear: 2023,
  enactmentDate: '2023-12-25',
  enforcementDate: '2024-07-01',
  ministry: EXPECTED_MINISTRY,
  sourceUrl: 'https://www.indiacode.nic.in/handle/123456789/20062',
  ...over,
});

describe('assertExpectedAct — the 2023 codes', () => {
  it('accepts the Central Act', () => {
    assert.doesNotThrow(() => assertExpectedAct(act({}), 'Bharatiya Nyaya Sanhita'));
  });

  it('refuses a different Act under the right ministry', () => {
    assert.throws(
      () =>
        assertExpectedAct(
          act({ shortTitle: 'The Post Office Act, 2023' }),
          'Bharatiya Nyaya Sanhita',
        ),
      /expected "Bharatiya Nyaya Sanhita"/,
    );
  });

  it('refuses a STATE copy carrying the same title', () => {
    // indiacode holds state-administration copies and drafts under separate
    // handles with the same short title and act number and zero sections.
    assert.throws(
      () =>
        assertExpectedAct(
          act({ ministry: 'Home Department, Government of Maharashtra' }),
          'Bharatiya Nyaya Sanhita',
        ),
      /is published by/,
    );
  });
});

describe('assertExpectedAct — the repealed codes, whose ministry is not asserted', () => {
  const ipc = act({
    actId: 'AC_CEN_5_23_00006_186045_1523268114876',
    shortTitle: 'Indian Penal Code, 1860',
    actNumber: '45',
    actYear: 1860,
    enforcementDate: '1862-01-01',
    ministry: 'Ministry of Law and Justice',
  });

  it('accepts a Central Act whose ministry we have not read', () => {
    // CLAUDE.md forbids inventing a contract term or a section number; the
    // administering ministry of a repealed code is the same kind of fact. It is
    // recorded from the page rather than asserted against a guess.
    assert.doesNotThrow(() => assertExpectedAct(ipc, 'Indian Penal Code', null));
  });

  it('still refuses a STATE enactment, via the act-id prefix', () => {
    // Dropping the ministry check must not drop the Central-Act check with it.
    assert.throws(
      () =>
        assertExpectedAct(
          { ...ipc, actId: 'AC_MH_5_23_00006_186045_1523268114876' },
          'Indian Penal Code',
          null,
        ),
      /not a Central Act/,
    );
  });

  it('still refuses the wrong Act', () => {
    assert.throws(
      () =>
        assertExpectedAct(
          { ...ipc, shortTitle: 'The Indian Evidence Act, 1872' },
          'Indian Penal Code',
          null,
        ),
      /expected "Indian Penal Code"/,
    );
  });
});

describe('the handle lists', () => {
  it('names the three current codes and the three repealed ones, and does not mix them', () => {
    assert.equal(CRIMINAL_CODE_HANDLES.length, 3);
    assert.equal(REPEALED_CRIMINAL_CODE_HANDLES.length, 3);
    const current: readonly string[] = CRIMINAL_CODE_HANDLES.map((h) => h.handle);
    for (const h of REPEALED_CRIMINAL_CODE_HANDLES) {
      assert.equal(current.includes(h.handle), false, h.handle);
    }
  });

  it('leaves every repealed entry expecting NO ministry', () => {
    for (const h of REPEALED_CRIMINAL_CODE_HANDLES) assert.equal(h.expectMinistry, null);
  });
});
