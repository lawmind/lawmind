/**
 * Enumerating the Central Acts index.
 *
 * `sprints/SPRINT_1.md` LCC task 3 asks for a bare-acts library of 700+ Central
 * and State Acts. The corpus holds three — BNS, BNSS, BSA — because the ingest
 * ran from a hardcoded list of handles. The index reports **845** Central Acts,
 * so the gap was never data availability; nothing enumerated them.
 *
 * These tests run on captured markup, not the network. A government site is not a
 * test fixture: it is slow, it rate-limits, and a red test that means "indiacode
 * is down" teaches people to ignore red tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  actListingUrl,
  parseActListing,
  parseIndiaCodeDate,
  parseListingTotal,
} from './indiacode.ts';

/** Real markup from `browse?type=shorttitle`, trimmed to four rows. */
const PAGE = `
<div class="pagination-info">Showing results 1 to 100 of 845</div>
<table>
<tr><td headers="t1" class="evenRowEvenCol" nowrap="nowrap" align="right">25-Mar-2016</td><td headers="t2" class="evenRowOddCol" ><em>18</em></td><td headers="t3" class="evenRowEvenCol" ><strong>The&#x20;Aadhaar&#x20;Act,&#x20;2016</strong></td><td headers="t4" class="evenRowOddCol"><a href="/handle/123456789/2160?view_type=browse">View...</a></td></tr>
<tr><td headers="t1" class="oddRowEvenCol" nowrap="nowrap" align="right">6-Feb-2012</td><td headers="t2" class="oddRowOddCol" ><em>13</em></td><td headers="t3" class="oddRowEvenCol" ><strong>The&#x20;Academy&#x20;Act,&#x20;2012</strong></td><td headers="t4" class="oddRowOddCol"><a href="/handle/123456789/2110?view_type=browse">View...</a></td></tr>
<tr><td headers="t1" class="evenRowEvenCol" nowrap="nowrap" align="right">28-Dec-1960</td><td headers="t2" class="evenRowOddCol" ><em>64</em></td><td headers="t3" class="evenRowEvenCol" ><strong>The&#x20;Acquired&#x20;Territories&#x20;Act,&#x20;1960</strong></td><td headers="t4" class="evenRowOddCol"><a href="/handle/123456789/1498?view_type=browse">View...</a></td></tr>
<tr><td headers="t1" class="oddRowEvenCol" nowrap="nowrap" align="right">3-Apr-1993</td><td headers="t2" class="oddRowOddCol" ><em></em></td><td headers="t3" class="oddRowEvenCol" ><strong>An&#x20;Act&#x20;With&#x20;No&#x20;Number</strong></td><td headers="t4" class="oddRowOddCol"><a href="/handle/123456789/1915?view_type=browse">View...</a></td></tr>
</table>`;

describe('Central Acts index', () => {
  it('reads every Act on the page, with its handle', () => {
    const acts = parseActListing(PAGE);
    assert.equal(acts.length, 4);
    assert.deepEqual(acts[0], {
      handle: '123456789/2160',
      shortTitle: 'The Aadhaar Act, 2016',
      actNumber: '18',
      dateIssued: '2016-03-25',
    });
  });

  it('keys on the handle, because short titles and act numbers both repeat', () => {
    // Act numbers restart every year and amendment Acts share a short title. The
    // handle is the only durable identifier, and it is what `act_id` stores.
    const handles = parseActListing(PAGE).map((a) => a.handle);
    assert.equal(new Set(handles).size, handles.length);
    for (const h of handles) assert.match(h, /^123456789\/\d+$/);
  });

  it('carries a missing act number as null rather than an empty string', () => {
    const noNumber = parseActListing(PAGE).find((a) => a.shortTitle === 'An Act With No Number');
    assert.equal(noNumber?.actNumber, null);
  });

  it('decodes the entities the site actually serves', () => {
    // Short titles arrive as &#x20;-encoded. A title stored with literal entity
    // text is unsearchable and renders wrong.
    for (const a of parseActListing(PAGE)) {
      assert.ok(!a.shortTitle.includes('&#'), `undecoded entity in ${a.shortTitle}`);
    }
  });

  it('reads the total from the index own counter, not from a page count', () => {
    assert.equal(parseListingTotal(PAGE), 845);
  });

  it('returns nothing rather than guessing when the markup changes', () => {
    // A silent zero is recoverable; a fabricated Act is not.
    assert.deepEqual(parseActListing('<html><body>maintenance</body></html>'), []);
    assert.equal(parseListingTotal('<html></html>'), null);
  });

  it('paginates by offset', () => {
    assert.match(actListingUrl(0), /offset=0/);
    assert.match(actListingUrl(100), /offset=100/);
    assert.match(actListingUrl(0), /type=shorttitle/);
  });
});

describe('parseIndiaCodeDate', () => {
  it('reads both formats the same site serves', () => {
    // The Act record page is numeric; the browse index uses a month name. The
    // numeric-only parser returned null for every row of the index.
    assert.equal(parseIndiaCodeDate('25-03-2016'), '2016-03-25');
    assert.equal(parseIndiaCodeDate('25-Mar-2016'), '2016-03-25');
    assert.equal(parseIndiaCodeDate('6-Feb-2012'), '2012-02-06');
    assert.equal(parseIndiaCodeDate('2016-03-25'), '2016-03-25');
  });

  it('returns null on an unrecognised month rather than guessing one', () => {
    assert.equal(parseIndiaCodeDate('25-Xyz-2016'), null);
    assert.equal(parseIndiaCodeDate('not a date'), null);
    assert.equal(parseIndiaCodeDate(''), null);
  });
});
