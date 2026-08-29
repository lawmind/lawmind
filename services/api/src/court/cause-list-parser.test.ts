/**
 * The parser, tested against the one real response and against its own contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO KINDS OF CASE HERE, AND THE DIFFERENCE IS DECLARED RATHER THAN BLURRED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Fixture cases** run against the retained bytes of the first authorised
 * eCourts request. What they assert is a fact about the licensed interface: it
 * requires a CAPTCHA, it names its request dimensions, and it prints its own
 * warning about its own data. Those are the only assertions in this file
 * entitled to say anything about eCourts.
 *
 * **Contract cases** run against HTML written here. They assert what the CODE
 * does with a shape — that "Record not found" is the only road to `empty`, that
 * a table without a case column is refused rather than guessed at, that a
 * half-read row survives as `partial`. They are NOT evidence about what a served
 * cause list looks like, and a reader must not take them for it: no served cause
 * list has been seen, because the CAPTCHA stands in front of one. Saying so here
 * is the point — a synthetic fixture quietly promoted to evidence is how a
 * parser comes to be believed before it has been tested.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  describeCauseListInterface,
  detectRepresentation,
  parseCauseList,
  PARSER_FIXTURE,
  PARSER_VERSION,
  SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER,
} from './cause-list-parser.ts';

const fixture = readFileSync(
  fileURLToPath(
    new URL('./__fixtures__/ecourts-cause-list-module-index-2026-08-29.html', import.meta.url),
  ),
);

describe('the retained response is the one the parser was written against', () => {
  it('matches the sha256 recorded on the artifact row', () => {
    /**
     * The binding assertion of this whole file. `official_source_artifact` holds
     * this response append-only under this digest; if the committed copy drifts
     * by a byte, every case below is testing something the court never sent and
     * the parser's provenance is fiction.
     */
    assert.equal(createHash('sha256').update(fixture).digest('hex'), PARSER_FIXTURE.sha256);
    assert.equal(fixture.byteLength, PARSER_FIXTURE.bytes);
  });
});

describe('what the licensed cause-list interface actually requires', () => {
  const descriptor = describeCauseListInterface(fixture.toString('utf8'));

  it('is a cause-list surface, and says so in its own markup', () => {
    assert.equal(descriptor.isCauseListSurface, true);
  });

  it('requires a CAPTCHA before it will serve anything', () => {
    // The finding that blocks the pilot. Asserted from the response rather than
    // from a summary of it, so a future interface change makes this go red
    // instead of leaving a stale conclusion in a document.
    assert.equal(descriptor.captcha.required, true);
    assert.equal(descriptor.captcha.field, 'cause_list_captcha_code');
    assert.equal(descriptor.captcha.mechanism, 'securimage');
    assert.equal(descriptor.captcha.audioAlternative, true);
  });

  it('names the dimensions a request needs, and they are not "a court"', () => {
    // Master Roadmap v5 §3.4 corrected v4's "one request covers a court's day".
    // This is that correction, read off the source: five dimensions and a date,
    // then civil or criminal.
    for (const field of ['sess_state_code', 'sees_dist_code', 'CL_court_no', 'causelist_date']) {
      assert.ok(
        descriptor.requestFields.includes(field),
        `the form no longer carries ${field}; the source key model is built on these`,
      );
    }
    for (const select of ['court_complex_code', 'court_est_code']) {
      assert.ok(
        descriptor.dimensionSelects.includes(select),
        `the form no longer offers ${select}`,
      );
    }
  });

  it('carries the court’s own warning about its own cause lists', () => {
    assert.deepEqual(descriptor.sourceWarnings, [SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER]);
  });

  it('delivers results into a container that arrives empty', () => {
    assert.ok(descriptor.resultContainers.includes('CauseList'));
    assert.ok(descriptor.resultContainers.includes('caseBusinessDiv_CauseList'));
  });
});

describe('parsing the real response', () => {
  const result = parseCauseList(fixture, 'text/html; charset=utf-8');

  it('refuses with captcha_required, and never as an empty court day', () => {
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.refusal, 'captcha_required');
    // The distinction this module exists for. A form page read as `empty` would
    // mark the sync confirmed, the escalation would never fire, and a briefing
    // would go out saying the court listed nothing.
    assert.notEqual(result.status, 'empty');
  });

  it('carries the source warning out with the refusal', () => {
    // Uncertainty survives a failure too. It is the source's statement, not a
    // property of our success.
    assert.deepEqual(result.sourceWarnings, [SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER]);
  });

  it('names its own version, so a row can be traced to the code that wrote it', () => {
    assert.match(PARSER_VERSION, /^CAUSE_LIST_PARSER_V\d+_\d{4}-\d{2}-\d{2}$/);
  });
});

describe('representation is decided from bytes, not from the header', () => {
  it('believes the magic bytes over a content-type that disagrees', () => {
    // A soft 404 serving HTML under `application/pdf` has already cost this
    // corpus once. The header is advisory; the first five bytes are not.
    assert.equal(detectRepresentation(Buffer.from('%PDF-1.4\n...'), 'text/html'), 'pdf');
    assert.equal(
      detectRepresentation(Buffer.from('<html><body>no</body></html>'), 'application/pdf'),
      'html',
    );
    assert.equal(detectRepresentation(Buffer.from('{"rows":[]}'), 'text/html'), 'json');
  });

  it('retains an unreadable representation instead of interpreting it', () => {
    const result = parseCauseList(Buffer.from('%PDF-1.7\nbinary'), 'application/pdf');
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.refusal, 'unsupported_representation');
  });
});

/**
 * CONTRACT CASES — synthetic HTML. See the file header: these say what the code
 * does, and nothing about what eCourts sends.
 */
describe('the parser’s contract on shapes it has not met in the wild', () => {
  const page = (inner: string): Buffer =>
    Buffer.from(`<html><body><div id="CauseList">${inner}</div></body></html>`, 'utf8');

  it('reads a table whose headers are the source’s own published labels', () => {
    const result = parseCauseList(
      page(
        '<table>' +
          '<tr><th>Sr No</th><th>Case Number</th><th>Party Name</th><th>Case Stage</th></tr>' +
          '<tr><td>1</td><td>CRL.A. 100/2024</td><td>State versus Somebody</td><td>Arguments</td></tr>' +
          '<tr><td>2</td><td>CS 55/2025</td><td>A versus B</td><td>Evidence</td></tr>' +
          '</table>',
      ),
      'text/html',
    );
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0]!.caseNumber, 'CRL.A. 100/2024');
    assert.equal(result.items[0]!.itemNumber, 1);
    assert.equal(result.items[0]!.cnr, null, 'a CNR the source did not print is never invented');
    assert.equal(result.items[0]!.extractionState, 'parsed');
    // The row survives verbatim, so a later re-read is possible without a refetch.
    assert.equal((result.items[1]!.raw as Record<string, unknown>)['Case Stage'], 'Evidence');
  });

  it('keeps a half-read row as partial rather than dropping it', () => {
    const result = parseCauseList(
      page(
        '<table>' +
          '<tr><th>Sr No</th><th>Case Number</th></tr>' +
          '<tr><td>&nbsp;</td><td>CS 9/2026</td></tr>' +
          '</table>',
      ),
      'text/html',
    );
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(
      result.items.length,
      1,
      'a silent drop is indistinguishable from an unlisted case',
    );
    assert.equal(result.items[0]!.extractionState, 'partial');
    assert.match(result.items[0]!.extractionNote ?? '', /item number/);
  });

  it('refuses a results table that identifies no case', () => {
    const result = parseCauseList(
      page(
        '<table><tr><th>Sr No</th><th>Case Stage</th></tr><tr><td>1</td><td>Arguments</td></tr></table>',
      ),
      'text/html',
    );
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.refusal, 'unrecognised_result_shape');
  });

  it('is `empty` only when the SOURCE says "Record not found"', () => {
    const said = parseCauseList(page('<p>Record not found</p>'), 'text/html');
    assert.equal(said.status, 'empty');

    const silent = parseCauseList(page('<p>&nbsp;</p>'), 'text/html');
    assert.equal(silent.status, 'failed');
    if (silent.status !== 'failed') return;
    assert.equal(
      silent.refusal,
      'parse_empty_unconfirmed',
      'zero rows we could read is not zero cases, and only the court may say there were none',
    );
  });

  it('does not mistake some other eCourts page for a cause list', () => {
    const result = parseCauseList(
      Buffer.from('<html><body><h1>Case Status</h1></body></html>', 'utf8'),
      'text/html',
    );
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.refusal, 'not_a_cause_list_response');
  });
});
