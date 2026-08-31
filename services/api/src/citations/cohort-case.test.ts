/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NEW2-R15-F1 — THE GATE READ CAPITAL LETTERS, NOT MATTER NUMBERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 retested the cohort gate on its own population (bus 1637,
 * `docs/ai/new2-r15/`) and found it reached all 472 would-be-`UNIQUE` rows and
 * refused none — because it saw nothing. All 472 had a readable cause title and
 * all 472 declared ZERO matters, not the one an ordinary judgment prints.
 *
 * `MATTER_LONG` and `MATTER_SLASH` captured the matter TYPE as `[A-Z][A-Z.&'-]*`
 * — upper case only — while `CONNECTORS` matched case-insensitively. A common
 * order printed in title case therefore gave `connector = WITH` and
 * `declaredMatters = 0`, so `declaredMatters > heldCandidates` was `0 > 1`,
 * false, and the reference was told it was the only one. The gate failed OPEN on
 * exactly the shape it exists to refuse.
 *
 * Every fixture below is verbatim corpus text with its judgment id recorded, so
 * a reader can check that the court really printed this. The three marked
 * FAILURE-FIRST fail on `cohort.ts` as it stood at `93ca23f4`:
 *
 *   ✖ a title-case common order is a cohort        -> declaredMatters 0, no refusal
 *   ✖ a title-case list joined by a/w is a cohort  -> declaredMatters 0, no refusal
 *   ✖ the sibling is the matter, not the FIR       -> counted FIR 193/2023
 *
 * A regression test that passes before the fix tests nothing, so which ones were
 * already green is stated rather than left to be assumed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cohortBlocksUnique, declaredCohort } from './cohort.ts';

/**
 * FAILURE-FIRST. `2025:RJ-JP:5341`, judgment
 * `0a3c6d16-4db8-4e7a-bed9-8063ff7e1e16`, High Court of Judicature for
 * Rajasthan. Two bail applications, one common order, `Connected With` between
 * them — and the registry prints the matter type in title case, so the shipped
 * grammar read the whole cause title as declaring nothing at all.
 */
const RJ_TITLE_CASE_COHORT = `[2025:RJ-JP:5341]
HIGH COURT OF JUDICATURE FOR RAJASTHAN
BENCH AT JAIPUR
S.B. Criminal Miscellaneous Bail Application No. 848/2025
1. Shahrukh S/o Hajar, Aged About 25 Years, R/o Ladduka,
Police Station Kaman, District Deeg. (The Petitioner Is
Confined In Sub Jail Deeg)
----Petitioners
Versus
State Of Rajasthan, Through Pp
----Respondent
Connected With
S.B. Criminal Miscellaneous Bail Application No. 849/2025
`;

/**
 * FAILURE-FIRST. `2025:HHC:15005`, judgment
 * `0acfc6f4-1ffd-4e92-8ab4-1d0146709f4b`, High Court of Himachal Pradesh. Seven
 * review petitions disposed of by one order, joined by `a/w`, every one of them
 * title case. It also carries two dates and a neutral citation in the same
 * window — none of which is a matter, and none of which may be counted as one.
 */
const HP_REVIEW_COHORT = `IN THE HIGH COURT OF HIMACHAL PRADESH, SHIMLA
Review Petition No.: 48 of 2024
a/w Review Petition Nos. 55, 56,
57, 58, 59, 60 of 2024
Reserved on : 13.05.2025
Decided on : 21.05.2025
1.Review Petition No. 48 of 2024
Ambuja Cement Ltd.
…………..Petitioner.
Versus
Manish Shukla and Anr.
…………Respondents
2.Review Petition No. 55 of 2024
Ambuja Cement Ltd.
…………..Petitioner.
Versus
Luxmi Devi and Anr.
…………Respondents.
2
Neutral Citation No. ( 2025:HHC:15005 )
`;

/**
 * FAILURE-FIRST, and the subtler half of the defect. Judgment
 * `c2e629b9-5398-441e-be64-207f8c5b5abc`, High Court of Uttarakhand. The shipped
 * grammar DID refuse this one — for the wrong reason. It could not see
 * `Criminal Writ Petition No.1406 of 2023` (title case) and counted
 * `FIR No.193 of 2023` from the body instead. A gate that reaches the right
 * verdict from the wrong evidence is not protection; the next document moves the
 * FIR and the refusal disappears with it.
 */
const UK_COHORT_AND_FIR = `HIGH COURT OF UTTARAKHAND AT
NAINITAL
Criminal Writ Petition No.1406 of 2023
With
Compounding Application IA No.1 of 2023
Ankush Ghildiyal and Others ....Petitioners
Versus
State of Uttarakhand and Others ….Respondents
Present:-
Mr. Sachin Panwar, Advocate for the petitioner.
Mr. M.A. Khan, A.G.A. with Mr. Vipul Painuly, Brief Holder
for the State.
Mr. Navnish Negi, Advocate for the respondent nos. 3 to 6.
JUDGMENT
Hon'ble Ravindra Maithani, J. (Oral)
The petitioners- Ankush Ghildiyal, Tanishk
Dabral, Damandeep seek quashing of FIR No.193 of 2023,
under Sections 323, 504, 307 and 34 IPC, Police Station
Kotdwar, District Pauri Garhwa`;

/**
 * NEW2's own minimal reproduction, from bus 1637. Not corpus text — it is the
 * pair NEW2 printed to isolate the defect, and it is kept because the report
 * that named the bug should be executable.
 */
const NEW2_UPPER = `WRIT PETITION No. 123 of 2020
WITH
WRIT PETITION No. 456 of 2020
`;
const NEW2_TITLE = `Writ Petition No. 123 of 2020
With
Writ Petition No. 456 of 2020
`;

/**
 * CONTROL, green before the fix. `2025:AHC:24041`, judgment
 * `cf925195-605a-40b9-b325-a4d8bc12c800`. Three writs, one common order, and the
 * conjunction is lowercase `with` — the connector list was ALREADY
 * case-insensitive, which is precisely why the asymmetry went unnoticed.
 */
const AHC_LOWERCASE_WITH = `Neutral Citation No. - 2025:AHC:24041
Court No. - 32
Case :- WRIT - C No. - 19783 of 2022
Petitioner :- Ambrish Kumar And Another
Respondent :- State Of U.P. And 3 Others
Counsel for Petitioner :- Vinod Kumar Singh
Counsel for Respondent :- C.S.C.,Ramesh Narayan
with
Case :- WRIT - C No. - 27269 of 2018
Petitioner :- C/M Subash Uchchatar Madhyamic Vidyalaya And
Another
Respondent :- State Of U.P. And 4 Others
with
Case :- WRIT - C No. - 32045 of 2018
Petitioner :`;

/**
 * CONTROL. Judgment `00654e68-b608-4972-ae7a-ff952300a3f8`, Rajasthan. One
 * matter, title case, no conjunction. The fix must make this READABLE (one
 * declared matter, where the shipped grammar read none) without making it
 * REFUSED — a true unique has to stay resolvable.
 */
const RJ_TITLE_CASE_SINGLE = `[2024:RJ-JD:31234]
HIGH COURT OF JUDICATURE FOR RAJASTHAN AT
JODHPUR
S.B. Criminal Miscellaneous Bail Application No. 8563/2024
Rajesh Kumar @ Raju S/o Bajrang Lal Meena, Aged About 23
Years, R/o Sitarampura Colony, Gawadi, Ps Deoli, Dist. Tonk, Raj.
(Lodged In Dist. Jail Bhilwara)
----Petitioner
Versus
State Of Rajasthan, Through Pp
----Respondent
For Petitioner(s) : Mr. Bharat Gurjar
`;

/**
 * CONTROL. Judgment `d1a4c477-98eb-4aea-ac0a-e5669ac10220`, Andhra Pradesh. One
 * matter, upper case, no conjunction, and a date printed as `09.11.2023`.
 */
const AP_SINGLE = `HIGH COURT OF ANDHRA PRADESH
* * * *
WRIT PETITION No. 28743 of 2023
Between:
Tikona Infinet Private Limited
.....PETITIONER
AND
The State of Andhra Pradesh,
Represented by its Principal Secretary,
Department of Revenue CT-I,
Secretariat, Velagapudi, Guntur District,
Andhra Pradesh and 2 others
.....RESPONDENTS
DATE OF JUDGMENT PRONOUNCED: 09.11.2023
`;

/** CONTROL — FIFTH's falsifier, the case the gate was built for. */
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

const keysOf = (t: string) =>
  declaredCohort(t)
    .matters.map((m) => m.key)
    .sort();

describe('cohort — a matter is recognised by its structure, not by its capitals', () => {
  it('FAILURE-FIRST: a title-case common order is a cohort, and was read as nothing', () => {
    const d = declaredCohort(RJ_TITLE_CASE_COHORT);
    assert.equal(d.connector, 'CONNECTED WITH');
    assert.equal(d.declaredMatters, 2, `declared ${JSON.stringify(d.matters)}`);
    assert.deepEqual(
      d.matters.map((m) => m.key).sort(),
      ['848|2025', '849|2025'],
      'the two bail applications the court joined',
    );
    assert.equal(
      cohortBlocksUnique(d, 1),
      true,
      'holding one of two connected matters, the gate still called it the only one',
    );
  });

  it('FAILURE-FIRST: a title-case list joined by a/w is a cohort', () => {
    const d = declaredCohort(HP_REVIEW_COHORT);
    assert.equal(d.connector, 'A/W');
    assert.ok(d.declaredMatters >= 2, `declared ${JSON.stringify(d.matters)}`);
    assert.equal(cohortBlocksUnique(d, 1), true);
  });

  it('FAILURE-FIRST: the declared sibling is the connected matter, never the FIR', () => {
    const d = declaredCohort(UK_COHORT_AND_FIR);
    assert.equal(d.connector, 'WITH');
    assert.deepEqual(
      d.matters.map((m) => m.key).sort(),
      ['1406|2023', '1|2023'],
      'a police first information report is not a matter the High Court disposed of',
    );
    assert.equal(cohortBlocksUnique(d, 1), true);
  });

  it("NEW2's reproduction: the same cause title in either case reads the same cohort", () => {
    assert.deepEqual(keysOf(NEW2_TITLE), keysOf(NEW2_UPPER));
    assert.deepEqual(keysOf(NEW2_TITLE), ['123|2020', '456|2020']);
    assert.equal(cohortBlocksUnique(declaredCohort(NEW2_TITLE), 1), true);
    assert.equal(cohortBlocksUnique(declaredCohort(NEW2_UPPER), 1), true);
  });

  it('CONTROL, green before the fix: a lowercase conjunction already joined three writs', () => {
    const d = declaredCohort(AHC_LOWERCASE_WITH);
    assert.equal(d.connector, 'WITH');
    assert.deepEqual(d.matters.map((m) => m.key).sort(), ['19783|2022', '27269|2018', '32045|2018']);
    assert.equal(cohortBlocksUnique(d, 1), true);
    assert.equal(cohortBlocksUnique(d, 3), false, 'the whole cohort landed and it still refused');
  });

  it('dates and a neutral citation in the window are not matters', () => {
    const hp = declaredCohort(HP_REVIEW_COHORT).matters.map((m) => m.key);
    for (const notAMatter of ['5|2025', '13|2025', '21|2025', '15005|2025', '2|2025']) {
      assert.equal(hp.includes(notAMatter), false, `counted ${notAMatter} as a declared matter`);
    }
    const ahc = declaredCohort(AHC_LOWERCASE_WITH).matters.map((m) => m.key);
    assert.equal(ahc.includes('32|2025'), false, 'counted `Court No. - 32` as a matter');
    assert.equal(ahc.includes('24041|2025'), false, 'counted the neutral citation as a matter');
  });

  it('a true unique stays resolvable — one matter read, no refusal', () => {
    for (const [name, text] of [
      ['Rajasthan, title case', RJ_TITLE_CASE_SINGLE],
      ['Andhra Pradesh, upper case', AP_SINGLE],
    ] as const) {
      const d = declaredCohort(text);
      assert.equal(d.declaredMatters, 1, `${name}: declared ${JSON.stringify(d.matters)}`);
      assert.equal(d.connector, null, `${name}: invented a conjunction`);
      assert.equal(cohortBlocksUnique(d, 1), false, `${name}: refused a single-matter judgment`);
    }
  });

  it("CONTROL: FIFTH's falsifier is still a cohort of two, and still blocks", () => {
    const d = declaredCohort(JHHC_24297);
    assert.equal(d.connector, 'WITH');
    assert.deepEqual(
      d.matters.map((m) => m.key).sort(),
      ['134|2018', '9|2022'],
      'the abbreviated M.A. and the expanded Miscellaneous Appeal are ONE matter',
    );
    assert.equal(cohortBlocksUnique(d, 1), true);
    assert.equal(cohortBlocksUnique(d, 2), false);
  });

  it('an unreadable cause title still fails CLOSED, in any case', () => {
    for (const empty of [null, undefined, '', '   \n  ']) {
      const d = declaredCohort(empty);
      assert.equal(d.causeTitleAvailable, false);
      assert.equal(cohortBlocksUnique(d, 1), true, 'unreadable text was treated as proof');
    }
  });

  it('a cause title with no conjunction is never refused, however many numbers it prints', () => {
    const d = declaredCohort(
      'Writ Petition No. 100 of 2020\nreferring to Writ Petition No. 200 of 2019\n',
    );
    assert.equal(d.connector, null);
    assert.equal(cohortBlocksUnique(d, 1), false);
  });
});
