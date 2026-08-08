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
  dedupeSectionRefs,
  parseActListing,
  parseActPage,
  parseIndiaCodeDate,
  parseListingTotal,
  type SectionRef,
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

describe('parseActPage', () => {
  const metadataRow = (label: string, value: string) =>
    `<tr><td class="metadataFieldLabel">${label}:&nbsp;</td><td class="metadataFieldValue">${value}</td></tr>`;

  const normalPage = (actIdAssignment: string) => `
<html><body>
<script>var act_id=${actIdAssignment};</script>
<table class="table itemDisplayTable">
${metadataRow('Act ID', '195727')}
${metadataRow('Act Number', '27')}
${metadataRow('Enactment Date', '1957-09-12')}
${metadataRow('Act Year', '1957')}
${metadataRow('Short Title', 'The Normal Act, 1957')}
</table>
</body></html>`;

  it('reads the JS-assigned act_id when the page has one', () => {
    const r = parseActPage(normalPage("'AC_CEN_5_5_00028_195766_1517807321857'"), '123456789/x');
    assert.equal(r.actId, 'AC_CEN_5_5_00028_195766_1517807321857');
  });

  /**
   * Real markup from `123456789/19036` (`The Bengal Bonded Warehouse
   * Association Act, 1854`), trimmed to the metadata table. This page — and
   * 17 others like it, all old and sectionless — carries no `act_id='...'` JS
   * assignment and no `actid=` query param anywhere: confirmed by fetching
   * all 20 Acts the corpus-coverage endpoint named as failed and finding zero
   * `sectionId=` occurrences on any of them, which is also why the fallback
   * below is safe — there is no section-content URL to build for an Act with
   * no sections.
   */
  const sectionlessPage = `
<html><body>
<table class="table itemDisplayTable">
${metadataRow('Act ID', '185405')}
${metadataRow('Act Number', '05')}
${metadataRow('Enactment Date', '1854-02-10')}
${metadataRow('Act Year', '1854')}
${metadataRow('Short Title', 'The Bengal Bonded Warehouse Association Act, 1854')}
${metadataRow('Hindi Title', '')}
${metadataRow('Long Title', 'An Act to amend Act No. V. of 1838')}
${metadataRow('Ministry', 'Ministry of Home Affairs')}
${metadataRow('Department', 'Department of States')}
${metadataRow('Enforcement Date', '10-02-1854')}
</table>
</body></html>`;

  it('falls back to the "Act ID" metadata row when neither JS assignment nor query param is present', () => {
    // This is the exact bug: 18 of the 20 Acts corpus-coverage named as
    // failed threw "no actid found" here, though every one of them has this
    // field sitting in the same table shortTitle/actNumber/actYear already
    // come from.
    const r = parseActPage(sectionlessPage, '123456789/19036');
    assert.equal(r.actId, '185405');
    assert.equal(r.shortTitle, 'The Bengal Bonded Warehouse Association Act, 1854');
  });

  it('still throws when even the metadata row is absent, rather than inventing an id', () => {
    const noIdAtAll = `
<table>
${metadataRow('Act Number', '05')}
${metadataRow('Act Year', '1854')}
${metadataRow('Short Title', 'x')}
</table>`;
    assert.throws(() => parseActPage(noIdAtAll, '123456789/x'), /no actid found/);
  });

  it('still throws on incomplete metadata, regardless of actId', () => {
    const noTitle = `<script>var act_id='X';</script><table>${metadataRow('Act Number', '1')}</table>`;
    assert.throws(() => parseActPage(noTitle, '123456789/x'), /incomplete Act metadata/);
  });
});

describe('dedupeSectionRefs', () => {
  const ref = (overrides: Partial<SectionRef>): SectionRef => ({
    sectionId: 'x',
    sectionNumber: '1',
    orderIndex: 0,
    heading: null,
    sourceUrl: 'https://example.test',
    ...overrides,
  });

  it('passes through a normal Act with no duplicates untouched', () => {
    const refs = [
      ref({ sectionId: '1', sectionNumber: '1', orderIndex: 0 }),
      ref({ sectionId: '2', sectionNumber: '2', orderIndex: 1 }),
    ];
    const { refs: out, duplicates } = dedupeSectionRefs(refs);
    assert.equal(out.length, 2);
    assert.deepEqual(duplicates, []);
  });

  it("keeps the lower orderIndex (the site's own first listing) on a real duplicate — s.79, Customs Act 1962", () => {
    // Real shape: two sectionIds, same number, same heading, adjacent order.
    const first = ref({
      sectionId: '30973',
      sectionNumber: '79',
      orderIndex: 138,
      heading: 'Bona fide baggage exempted from duty',
    });
    const second = ref({
      sectionId: '30974',
      sectionNumber: '79',
      orderIndex: 139,
      heading: 'Bona fide baggage exempted from duty',
    });
    const { refs: out, duplicates } = dedupeSectionRefs([first, second]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.sectionId, '30973', 'the lower orderIndex must win');
    assert.deepEqual(duplicates, ['79']);
  });

  it('keeps the lower orderIndex regardless of which one arrives first', () => {
    // parseSectionRefs returns document order, but nothing here should assume
    // the lower orderIndex is always seen first.
    const later = ref({ sectionId: 'b', sectionNumber: '5', orderIndex: 9 });
    const earlier = ref({ sectionId: 'a', sectionNumber: '5', orderIndex: 3 });
    const { refs: out } = dedupeSectionRefs([later, earlier]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.sectionId, 'a');
  });

  it('names every dropped duplicate rather than only counting them', () => {
    // A triplicate must report the two dropped, not just flag "duplicate: yes".
    const refs = [
      ref({ sectionId: '1', sectionNumber: '9', orderIndex: 0 }),
      ref({ sectionId: '2', sectionNumber: '9', orderIndex: 1 }),
      ref({ sectionId: '3', sectionNumber: '9', orderIndex: 2 }),
    ];
    const { refs: out, duplicates } = dedupeSectionRefs(refs);
    assert.equal(out.length, 1);
    assert.deepEqual(duplicates, ['9', '9']);
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
