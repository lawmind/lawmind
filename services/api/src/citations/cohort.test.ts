/**
 * The connected-matter cohort reader, tested on cause titles the courts actually
 * printed rather than on strings invented to make it pass.
 *
 * Every fixture below is verbatim from the corpus, with the judgment id recorded
 * beside it, so a future reader can go and check that the court really wrote
 * this. A regex tested only against examples written for the regex measures
 * nothing — this repository has already been caught by that once
 * (`a-phrase-list-scores-100-on-the-documents-it-was-written-from`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cohortBlocksUnique, declaredCohort } from './cohort.ts';

/**
 * FIFTH's falsifier, and the reason this module exists.
 *
 * `2026:JHHC:24297`, judgment `66f8a648-d0a8-40b1-bc9b-6221da840401`, ingested
 * 27 August 2026. Its sibling `e092675e-04bf-426f-ad3e-fe6ee9bf2e72` — the same
 * citation, the same court, the same date, a different case — did not land until
 * 29 August. The corpus held the proof on 27 August anyway: it is printed on
 * lines 2 to 4, by the High Court of Jharkhand.
 */
const JHHC_24297 = `2026:JHHC:24297
1 M.A. No. 134 of 2018
With
C.O. No. 09 of 2022
IN THE HIGH COURT OF JHARKHAND AT RANCHI
Miscellaneous Appeal No. 134 of 2018
------
Divisional Manager, National Insurance Company, Dhanbad Division,
having its office at B.P. Agarwala Building, P.O. and P.S. Dhansar,
District Dhanbad .... .... …. Appellant
Versus
1. Uma Devi, wife of Late Kedar Vishwakarma
`;

/**
 * `2023:AHC:173536`, judgment `96875fcd-4208-4ca0-96f3-ce4b719b7cb2`. Two first
 * appeals from order, one common order, and on 31 August 2026 the corpus holds
 * exactly ONE of them. This is the live case `resolver-cohort.test.ts` runs
 * against the database.
 */
const AHC_173536 = `A.F.R.
Neutral Citation No. - 2023:AHC:173536
Court No. - 44
Case :- FIRST APPEAL FROM ORDER No. - 1202 of 1999
Appellant :- The New India Assurance Co.Ltd.
Respondent :- Smt.Pramila And Others
Counsel for Appellant :- No,P.K.Sinha,R.K.Mishra
Counsel for Respondent :- Sharve Singh
With
Case :- FIRST APPEAL FROM ORDER No. - 1979 of 2021
`;

/**
 * The ordinary case, and the one the gate must stay silent on: a single matter,
 * no conjunction, nothing to declare. `2023:AHC:152051-DB`, judgment
 * `a4c2…` — reproduced from the corpus 31 August 2026.
 */
const SINGLE_MATTER = `Neutral Citation No. - 2023:AHC:152051-DB
Chief Justice's Court
Case :- WRIT TAX No. - 859 of 2023
Petitioner :- M/S Tikona Infinet Private Limited
Respondent :- State of U.P. and Another
Counsel for Petitioner :- Nishant Mishra,Vedika Nath
Hon'ble Pritinker Diwaker,Chief Justice
Heard Sri Nishant Mishra, learned counsel for the petitioner.
`;

/**
 * A contempt petition naming the writ petition it arises from. Bombay prints
 * this shape constantly and it is NOT a cohort — the writ below is the same
 * proceeding, not a sibling disposed of by the same order.
 */
const PARENT_ONLY = `IN THE HIGH COURT OF JUDICATURE AT BOMBAY
BENCH AT AURANGABAD
62 CONT. PETITION NO. 268 OF 2018
IN WP/5150/2013
KIRAN MANIKRAO BHUSARE AND OTHERS
VERSUS
THE STATE OF MAHARASHTRA
`;

describe('cohort — reading what the court declared', () => {
  it("FIFTH's falsifier declares two matters twelve days before the second landed", () => {
    const d = declaredCohort(JHHC_24297);
    assert.equal(d.declaredMatters, 2, `declared ${JSON.stringify(d.matters)}`);
    assert.equal(d.connector, 'WITH');
    // The key became `serial|year` at the R15-F1 correction. The MATTERS pinned
    // here are the same two the court printed; what changed is that the type is
    // no longer part of a matter's identity, because the registry prints one
    // matter under two names — this very fixture carries `M.A. No. 134 of 2018`
    // and `Miscellaneous Appeal No. 134 of 2018`, and the old key counted them
    // as two. `docs/ai/lcc-r15f1/key-collapse.json` enumerates all 623 such
    // collapses; every one is an abbreviation beside its own expansion.
    assert.deepEqual(d.matters.map((m) => m.key).sort(), ['134|2018', '9|2022']);
  });

  it('holding one of a declared two, UNIQUE is not available', () => {
    assert.equal(cohortBlocksUnique(declaredCohort(JHHC_24297), 1), true);
  });

  it('holding both, the gate stops firing on its own — no threshold, no switch', () => {
    assert.equal(cohortBlocksUnique(declaredCohort(JHHC_24297), 2), false);
  });

  it('the live Allahabad common order declares two first appeals from order', () => {
    const d = declaredCohort(AHC_173536);
    assert.equal(d.declaredMatters, 2, `declared ${JSON.stringify(d.matters)}`);
    assert.equal(cohortBlocksUnique(d, 1), true);
  });

  it('an ordinary single-matter judgment declares one, and the gate stays silent', () => {
    const d = declaredCohort(SINGLE_MATTER);
    assert.equal(d.declaredMatters, 1, `declared ${JSON.stringify(d.matters)}`);
    assert.equal(cohortBlocksUnique(d, 1), false);
  });

  it('the matter a petition ARISES FROM is not a sibling', () => {
    const d = declaredCohort(PARENT_ONLY);
    assert.equal(
      d.matters.some((m) => m.key.endsWith('|5150|2013')),
      false,
      'counted the writ below',
    );
    assert.equal(cohortBlocksUnique(d, 1), false);
  });

  it('the same matter printed twice with different words in front is ONE matter', () => {
    const d = declaredCohort(
      'CIVIL APPLICATION NO. 11052 OF 2024\nWITH CIVIL APPLICATION NO. 11052 OF 2024\n',
    );
    assert.equal(d.declaredMatters, 1, `declared ${JSON.stringify(d.matters)}`);
    assert.equal(cohortBlocksUnique(d, 1), false);
  });

  it('legislation is not a connected matter — a section number has the same shape', () => {
    const d = declaredCohort(
      'CRIMINAL APPEAL No. - 887 of 2006\nWith\nunder Section No. 302 of 1860 and Act No. 2 of 1974\n',
    );
    assert.deepEqual(
      d.matters.map((m) => m.key),
      ['887|2006'],
    );
    // The type still decides whether a capture is a matter AT ALL, which is what
    // keeps the section and the Act out — only the identity moved to serial|year.
    assert.deepEqual(
      d.matters.map((m) => m.type),
      ['CRIMINALAPPEAL'],
    );
    assert.equal(cohortBlocksUnique(d, 1), false);
  });

  it('two matters with NO conjunction do not make a cohort', () => {
    const d = declaredCohort('WRIT PETITION No. 100 of 2020\nreferring to WP No. 200 of 2019\n');
    assert.equal(d.connector, null);
    assert.equal(cohortBlocksUnique(d, 1), false, 'fired without the court joining the matters');
  });

  it('WITHOUT is not WITH', () => {
    assert.equal(declaredCohort('CIVIL APPEAL No. 1 of 2020\nwithout notice\n').connector, null);
  });

  it('an unreadable cause title declares nothing — and that is not a licence to claim UNIQUE', () => {
    for (const empty of [null, undefined, '', '   \n  ']) {
      const d = declaredCohort(empty);
      assert.equal(d.declaredMatters, 0);
      assert.equal(d.causeTitleAvailable, false);
      assert.equal(
        cohortBlocksUnique(d, 1),
        true,
        'a judgment whose text we cannot read was treated as proof of uniqueness',
      );
    }
  });

  it('a readable cause title that declares nothing is NOT the unreadable case', () => {
    const d = declaredCohort(SINGLE_MATTER);
    assert.equal(d.causeTitleAvailable, true);
  });
});
