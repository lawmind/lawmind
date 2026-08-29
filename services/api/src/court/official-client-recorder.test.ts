/**
 * OUR REQUEST IS THE LICENSED CLIENT'S REQUEST — asserted against the client's
 * own code, not against a document describing it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R12 published a field-by-field reconciliation of our cause-list request
 * against the licensed client. Most rows were marked `TRANSCRIBED` — read from
 * the client's source at some point, not held here. When the scripts were
 * finally retained (30 Aug 2026), FIVE of those transcriptions were wrong:
 *
 *   1. the `ajaxCall` header VALUE  — `jkhfkjhkjert33`, actually `764r6hry7ffds`
 *   2. the second header's NAME     — `Kjweuru253`,     actually `G73hdfdsh`
 *   3. `est_code` on submit         — the complex's 2nd segment, actually the
 *                                     establishment SELECT (empty unless flag Y)
 *   4. `selprevdays`                — hardcoded `'0'`, actually derived from the
 *                                     requested date
 *   5. the `fillCauseList` reply key — `court_list`,    actually `cause_list`
 *
 * Any one of them makes a request the court answers differently from the one the
 * licensed interface makes. None was detectable by reading our own code, and a
 * document cannot fail. This test can: it executes the RETAINED client scripts
 * offline and asserts our builders emit what the client emits, so the next drift
 * — in either direction — is a red test rather than an `Invalid Request`.
 *
 * **No socket is opened.** The recorder's sandbox has no `fetch`, no
 * `XMLHttpRequest` and no transport but a recorder, so this costs no quota and
 * is safe on every commit. It needs no database either.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ajaxBody,
  ECOURTS_AJAX_DELIMETER,
  ECOURTS_AJAX_DELIMETER_HEADER_2,
  establishmentSelectValue,
  fillCauseListFields,
  fillComplexFields,
  fillCourtEstablishmentFields,
  fillDistrictFields,
  selPrevDays,
  splitComplexValue,
  submitCauseListFields,
} from './ecourts.ts';
import { recordOfficialRequests, type RecordedRequest } from './official-client-recorder.ts';

/** Pinned: `selprevdays` is derived from the clock. 30 Aug 2026, 04:10 IST. */
const NOW = new Date('2026-08-29T22:40:00.000Z');
const TOKEN = 'ROTATED_BY_REPLY';

const VALUES = {
  sess_state_code: '26',
  sess_dist_code: '1',
  CL_court_no: '5',
  cause_list_captcha_code: 'ABC123',
  app_token: 'FIRST_TOKEN',
  base_url: '/ecourtindia_v6',
};
const COURT_NAME = 'Court No 5 - Sh. A B Singh, ADJ';

function run(complex: string, establishment: string, date: string, cicri: string) {
  return recordOfficialRequests({
    now: NOW,
    values: {
      ...VALUES,
      court_complex_code: complex,
      court_est_code: establishment,
      causelist_date: date,
    },
    selectedText: { CL_court_no: COURT_NAME },
    invoke: [
      { fn: 'fillDistrict', stateCode: '26' },
      { fn: 'fillCourtComplex', distCode: '1' },
      ...(complex.endsWith('@Y') ? ([{ fn: 'fillEst' } as const]) : []),
      { fn: 'fillCauseList' },
      { fn: 'submit_causelist', cicri },
    ],
  });
}

/** The LAST request the client made to a path — after token rotation settled. */
function official(requests: RecordedRequest[], path: string): RecordedRequest {
  const found = [...requests].reverse().find((r) => r.path === path);
  assert.ok(found, `the licensed client made no request to ${path}`);
  return found;
}

/**
 * Compare DECODED pairs, in order.
 *
 * The client concatenates its appended fields without encoding, so a judge's
 * name goes out with raw spaces and commas; we percent-encode (space -> `+`,
 * as jQuery's own `serialize()` does). Both decode identically under standard
 * form parsing, and sending a literal space in a urlencoded body is the
 * malformed one of the two. This is the ONE deliberate difference, and
 * comparing decoded pairs is what keeps it from hiding a real one.
 */
function pairs(body: string): [string, string][] {
  return body
    .split('&')
    .filter(Boolean)
    .map((p) => {
      const eq = p.indexOf('=');
      const name = eq === -1 ? p : p.slice(0, eq);
      const value = eq === -1 ? '' : p.slice(eq + 1);
      return [decodeURIComponent(name.replace(/\+/g, ' ')), decodeURIComponent(value.replace(/\+/g, ' '))];
    });
}

describe('our eCourts request equals the licensed client’s', () => {
  const flagN = run('1010101@1@N', '', '30-08-2026', '0');
  const flagY = run('1010101@1@Y', 'DLND01', '30-08-2026', '0');
  const historical = run('1010101@1@N', '', '23-08-2026', '1');

  it('the recorder actually ran the client (it built the requests we care about)', () => {
    const paths = new Set(flagN.requests.map((r) => r.path));
    for (const expected of [
      'casestatus/fillDistrict',
      'casestatus/fillcomplex',
      'cause_list/fillCauseList',
      'cause_list/submitCauseList',
    ]) {
      assert.ok(paths.has(expected), `the client never requested ${expected}`);
    }
    // The `Y` branch is the only one that reaches the establishment endpoint.
    assert.ok(flagY.requests.some((r) => r.path === 'casestatus/fillCourtEstablishment'));
    assert.ok(!flagN.requests.some((r) => r.path === 'casestatus/fillCourtEstablishment'));
  });

  it('every substitution the recorder made is one that cannot touch a body', () => {
    /**
     * The unretained assets supply validators and widgets. If a name outside
     * this set ever falls through, the recording is no longer trustworthy and
     * this test says so rather than quietly asserting against a fiction.
     */
    assert.deepEqual(flagN.substitutedGlobals, ['alerts_array', 'bootstrap']);
  });

  it('the two ajaxCall headers match the client, name and value', () => {
    const sent = official(flagN.requests, 'cause_list/submitCauseList').headers;
    assert.equal(sent['delimeter'], ECOURTS_AJAX_DELIMETER);
    assert.equal(sent[ECOURTS_AJAX_DELIMETER_HEADER_2], ECOURTS_AJAX_DELIMETER);
    /**
     * The pair that stood in this repository until 30 Aug 2026, credited with
     * fixing an `Invalid Request`. Both halves were wrong. Named here so a
     * future re-transcription cannot quietly reintroduce them.
     */
    assert.notEqual(ECOURTS_AJAX_DELIMETER, 'jkhfkjhkjert33');
    assert.notEqual(ECOURTS_AJAX_DELIMETER_HEADER_2, 'Kjweuru253');
  });

  it('fillDistrict', () => {
    assert.equal(
      ajaxBody(fillDistrictFields('26'), TOKEN),
      official(flagN.requests, 'casestatus/fillDistrict').body,
    );
  });

  it('fillcomplex', () => {
    assert.equal(
      ajaxBody(fillComplexFields('26', '1'), TOKEN),
      official(flagN.requests, 'casestatus/fillcomplex').body,
    );
  });

  it('fillCourtEstablishment (only when the complex declares one)', () => {
    assert.equal(
      ajaxBody(
        fillCourtEstablishmentFields({ stateCode: '26', distCode: '1', complexCode: '1010101' }),
        TOKEN,
      ),
      official(flagY.requests, 'casestatus/fillCourtEstablishment').body,
    );
  });

  it('fillCauseList sends the complex segment when the flag is off', () => {
    const parts = splitComplexValue('1010101@1@N');
    assert.equal(parts.requiresEstablishment, false);
    assert.equal(
      ajaxBody(
        fillCauseListFields({
          stateCode: '26',
          distCode: '1',
          complexCode: parts.complexCode,
          establishmentCode: parts.establishmentCode,
        }),
        TOKEN,
      ),
      official(flagN.requests, 'cause_list/fillCauseList').body,
    );
  });

  it('fillCauseList sends the CHOSEN establishment when the flag is on', () => {
    const parts = splitComplexValue('1010101@1@Y');
    assert.equal(parts.requiresEstablishment, true);
    assert.equal(
      ajaxBody(
        fillCauseListFields({
          stateCode: '26',
          distCode: '1',
          complexCode: parts.complexCode,
          establishmentCode: 'DLND01',
        }),
        TOKEN,
      ),
      official(flagY.requests, 'cause_list/fillCauseList').body,
    );
  });

  it('submitCauseList — flag off, so est_code is EMPTY, not the complex segment', () => {
    const parts = splitComplexValue('1010101@1@N');
    const ours = ajaxBody(
      submitCauseListFields({
        courtNo: '5',
        causelistDate: '30-08-2026',
        captchaCode: 'ABC123',
        courtNameText: COURT_NAME,
        stateCode: '26',
        distCode: '1',
        complexCode: parts.complexCode,
        establishmentSelectValue: establishmentSelectValue(parts, null),
        cicri: '0',
        selprevdays: selPrevDays('30-08-2026', NOW),
      }),
      TOKEN,
    );
    const theirs = official(flagN.requests, 'cause_list/submitCauseList').body;
    assert.deepEqual(pairs(ours), pairs(theirs));

    // The specific regression: the complex's second segment must NOT appear.
    const est = pairs(ours).find(([n]) => n === 'est_code');
    assert.deepEqual(est, ['est_code', '']);
    assert.notEqual(est?.[1], parts.establishmentCode);
  });

  it('submitCauseList — flag on, so est_code is the chosen establishment', () => {
    const parts = splitComplexValue('1010101@1@Y');
    const ours = ajaxBody(
      submitCauseListFields({
        courtNo: '5',
        causelistDate: '30-08-2026',
        captchaCode: 'ABC123',
        courtNameText: COURT_NAME,
        stateCode: '26',
        distCode: '1',
        complexCode: parts.complexCode,
        establishmentSelectValue: establishmentSelectValue(parts, 'DLND01'),
        cicri: '0',
        selprevdays: selPrevDays('30-08-2026', NOW),
      }),
      TOKEN,
    );
    assert.deepEqual(pairs(ours), pairs(official(flagY.requests, 'cause_list/submitCauseList').body));
  });

  it('submitCauseList — a historical date sets selprevdays, as the client does', () => {
    const parts = splitComplexValue('1010101@1@N');
    const ours = ajaxBody(
      submitCauseListFields({
        courtNo: '5',
        causelistDate: '23-08-2026',
        captchaCode: 'ABC123',
        courtNameText: COURT_NAME,
        stateCode: '26',
        distCode: '1',
        complexCode: parts.complexCode,
        establishmentSelectValue: establishmentSelectValue(parts, null),
        cicri: '1',
        selprevdays: selPrevDays('23-08-2026', NOW),
      }),
      TOKEN,
    );
    assert.deepEqual(pairs(ours), pairs(official(historical.requests, 'cause_list/submitCauseList').body));
  });

  it('selprevdays is 0 only for today and the future', () => {
    assert.equal(selPrevDays('30-08-2026', NOW), '0'); // today, IST
    assert.equal(selPrevDays('31-08-2026', NOW), '0'); // tomorrow
    assert.equal(selPrevDays('29-08-2026', NOW), '1'); // yesterday
    assert.equal(selPrevDays('23-08-2026', NOW), '1'); // T-7
    /**
     * The value this was hardcoded to. A historical probe under the old code
     * would have sent a combination the licensed client never sends, and any
     * conclusion drawn from the reply — including "nothing is retained that far
     * back" — would have been about our bug, not about the court.
     */
    assert.notEqual(selPrevDays('23-08-2026', NOW), '0');
  });
});
