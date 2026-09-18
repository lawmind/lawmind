/**
 * Every fixture below is a REAL footnote, copied from production 11 Aug 2026.
 *
 * That is not a stylistic preference. `harvest/hc-load.test.ts` asserted
 * `r.bench === 'patnahcucisdb94'` and passed for exactly as long as the bug
 * lived, because the test was written from the same assumption as the code.
 * A parser tested against invented input tests the author's imagination.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  amendingActFrom,
  effectiveDateFrom,
  eventTypeFrom,
  parseFootnote,
  splitFootnoteEntries,
  substitutedTextFrom,
} from './statute-amendments.ts';

describe('splitting a footnote into its printed entries', () => {
  it('splits a numbered run — Coal Mines Provident Fund s.10, five entries', () => {
    const entries = splitFootnoteEntries(
      '1. Ins. by Act 99 of 1976, s. 12 (w.e.f. 1-8-1976). 2. Subs. by Act 45 of 1965, ' +
        's. 8, for clause (a) (w.e.f. 1-4-1966). 3. Subs. by s. 8, ibid ., for "enter any ' +
        'coal mine or its office" (w.e.f. 1-4-1966). 4. Ins. by s. 8, ibid . (w.e.f. 1-4-1966). ' +
        '5. The words "or its office" omitted by s. 8, ibid .',
    );
    assert.equal(entries.length, 5);
    assert.deepEqual(
      entries.map((e) => e.ordinal),
      [1, 2, 3, 4, 5],
    );
    assert.ok(entries[0]!.text.startsWith('Ins. by Act 99 of 1976'));
  });

  it('does not mistake the digits inside an entry for a new entry', () => {
    // `Act 99 of 1976`, `s. 12` and `(w.e.f. 1-8-1976)` are all numbers sitting
    // in the middle of one entry. A marker rule based on digits alone shreds it.
    const entries = splitFootnoteEntries('1. Ins. by Act 99 of 1976, s. 12 (w.e.f. 1-8-1976).');
    assert.equal(entries.length, 1);
  });

  it('handles a footnote whose numbering does not start at 1', () => {
    // Real: Prevention and Control of Infectious and Contagious Diseases s.7
    // begins at `3.` — the earlier notes belong to other provisions.
    const entries = splitFootnoteEntries(
      '3. Ins. by Act 8 of 2026, s. 2 and Sch. (w.e.f. 01-07-2026).',
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.ordinal, 3);
  });

  it('handles a marker printed without its dot', () => {
    // Real: Telecom Regulatory Authority of India Act s.11 prints `1 Subs.`.
    const entries = splitFootnoteEntries(
      '1 Subs. by s. 9, ibid ., for sub-section (1) (w.e.f. 24-1-2000). 2 Subs. by Act 2 of 2000, ' +
        's. 9, for "under sub-section (1)" (w.e.f. 24-1-2000).',
    );
    assert.equal(entries.length, 2);
  });

  it('treats an unnumbered note as one entry rather than none', () => {
    const entries = splitFootnoteEntries('Subs. by Act 54 of 2003, s. 22.');
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.ordinal, 1);
  });
});

describe('the effective date', () => {
  it('reads the ordinary printed form', () => {
    assert.equal(
      effectiveDateFrom('Ins. by Act 99 of 1976, s. 12 (w.e.f. 1-8-1976).'),
      '1976-08-01',
    );
  });

  it('reads a zero-padded date', () => {
    // Real: Prevention and Control of Infectious and Contagious Diseases s.7.
    assert.equal(
      effectiveDateFrom('Ins. by Act 8 of 2026, s. 2 and Sch. (w.e.f. 01-07-2026).'),
      '2026-07-01',
    );
  });

  it('reads a date printed WITH SPACES INSIDE IT — 54 sections hang on this', () => {
    // Real, Limitation Act s.1 and Aadhaar Act s.1. A tight
    // `[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}` matches 7,276 sections; tolerating the
    // spaces matches 7,330. The 54 would have vanished with no error anywhere.
    assert.equal(
      effectiveDateFrom(
        'The words "except the State of Jammu and Kashmir" omitted by Act 34 of 2019, s. 95 and the Fifth Schedule (w.e.f. 31- 10- 2019).',
      ),
      '2019-10-31',
    );
    assert.equal(
      effectiveDateFrom('omitted by Act 34 of 2019 (w.e.f. 31-10- 2019).'),
      '2019-10-31',
    );
  });

  it('is DAY-first, because that is how the source prints it', () => {
    // `13-1-2012` is 13 January 2012. Read month-first it is 1 December — a
    // silently wrong legal date on a field that answers "was this in force
    // when I filed".
    assert.equal(
      effectiveDateFrom('Subs. by Delhi Act 12 of 2011, s. 2 (w.e.f. 13-1-2012)'),
      '2012-01-13',
    );
  });

  it('returns null when the note states no date, rather than inventing one', () => {
    // Real: Census Act s.15B. The amending Act's own year is NOT the effective
    // date — different facts, and conflating them dates a legal event by guess.
    assert.equal(effectiveDateFrom('Ins. by Act 11 of 1994, s. 12.'), null);
  });

  it('refuses an impossible printed date instead of rolling it forward', () => {
    // `new Date('2019-02-31')` silently becomes 3 March. Absent beats wrong.
    assert.equal(effectiveDateFrom('Subs. by Act 1 of 2019 (w.e.f. 31-2-2019).'), null);
    assert.equal(effectiveDateFrom('Subs. by Act 1 of 2019 (w.e.f. 1-13-2019).'), null);
  });
});

describe('the amending Act', () => {
  it('reads a central Act', () => {
    const a = amendingActFrom('Subs. by Act 45 of 1965, s. 8, for clause (a) (w.e.f. 1-4-1966).');
    assert.equal(a.raw, 'Act 45 of 1965');
    assert.equal(a.number, 45);
    assert.equal(a.year, 1965);
  });

  it('keeps a state prefix verbatim without interpreting it', () => {
    // Real: Delhi Municipal Corporation Act s.206. The prefix is captured and
    // NOT resolved to a jurisdiction — a Central Act amended in one state does
    // not read the same in another, and guessing which prefixes are states
    // would put confident wrong rows in front of advocates.
    const a = amendingActFrom(
      'Subs. by Delhi Act 12 of 2011, s. 2 “the Corporation” (w.e.f. 13-1-2012)',
    );
    assert.equal(a.raw, 'Delhi Act 12 of 2011');
    assert.equal(a.number, 12);
  });

  it('returns nulls where no Act is named, rather than half an answer', () => {
    const a = amendingActFrom(
      'Subs. by s. 8, ibid ., for "enter any coal mine" (w.e.f. 1-4-1966).',
    );
    assert.equal(a.raw, null);
    assert.equal(a.number, null);
    assert.equal(a.year, null);
  });
});

describe('classifying the event', () => {
  it('reads every verb form the corpus actually prints', () => {
    assert.equal(eventTypeFrom('Ins. by Act 99 of 1976, s. 12'), 'inserted');
    assert.equal(eventTypeFrom('Added by Act 2 of 1885, s. 4.'), 'inserted');
    assert.equal(eventTypeFrom('The proviso ins. by Act 31 of 2018, s.13'), 'inserted');
    assert.equal(eventTypeFrom('Ins. by, s. 23, ibid . (w.e.f. 1-9-2019).'), 'inserted');
    assert.equal(eventTypeFrom('Subs. by Act 45 of 1965, s. 8'), 'substituted');
    assert.equal(eventTypeFrom('The words "or its office" omitted by s. 8, ibid .'), 'omitted');
    assert.equal(eventTypeFrom('Certain words omitted by Act 58 of 1958, s. 37'), 'omitted');
    assert.equal(eventTypeFrom('The word Central omitted by Act 67 of 1993, s. 93'), 'omitted');
  });

  it('reads renumbering before substitution — the same sentence does both', () => {
    // Real: Negotiable Instruments Act s.64.
    assert.equal(
      eventTypeFrom(
        'Section 64 renumbered as sub-section (1) thereof by Act 55 of 2002, s. 3 (w.e.f. 6-2-2003).',
      ),
      'renumbered',
    );
  });

  it('reads a commencement notification as its own event, not an amendment', () => {
    // Real: Pension Fund Regulatory and Development Authority Act s.1. This is
    // when the provision came into force, which is a different fact from being
    // changed by a later Act.
    assert.equal(
      eventTypeFrom('1st February, 2014, vide Notifin. No. S.O. 302 (E), dated 1st February, 2014'),
      'commenced',
    );
  });

  it('reads the punctuation the corpus actually prints, not the tidy form', () => {
    // NONE of these were in the 60-footnote hand sample. All five were found by
    // running the parser over all 9,064 footnotes and reading what it failed
    // on — the corpus-wide pass earning its keep, exactly as it did for
    // `parties.ts` and `citations.ts`.
    assert.equal(
      eventTypeFrom('Subs by Act 62 of 1952, s. 35, for "the Indian Air Force Volunteer Reserve"'),
      'substituted',
    );
    assert.equal(
      eventTypeFrom('Subs. bys. 17, ibid .,for section 35 (w.e.f. 1-4-1988).'),
      'substituted',
    );
    assert.equal(eventTypeFrom('Subs. ibid ., for clause (h) .'), 'substituted');
    assert.equal(eventTypeFrom('Subs., ibid ., for "the L.G.".'), 'substituted');
    assert.equal(
      eventTypeFrom('Ins by Act 4 of 1986, s. 2 and the Schedule ( w.e.f. 15-5-1986).'),
      'inserted',
    );
    assert.equal(
      eventTypeFrom('The words and letter "or the land forces of a Part B State" omitted, ibid .'),
      'omitted',
    );
  });

  it('reads re-numbered and relettered, not only renumbered', () => {
    assert.equal(
      eventTypeFrom('Section 3 re-numbered as sub-section (1) thereof by Act 20 of 1983, s. 2'),
      'renumbered',
    );
    assert.equal(
      eventTypeFrom('Clause (2) relettered as sub-clause (a) thereof by Act 34 of 1972. s. 4'),
      'renumbered',
    );
  });

  it('produces NO event for an editorial cross-reference', () => {
    // Real: Indian Easements Act s.13 and s.24. 107 sections carry these.
    // Parsing them as amendments would invent legal history.
    assert.equal(eventTypeFrom('See now the Land Acquisition Act, 1894 (1 of 1894).'), null);
    assert.equal(
      eventTypeFrom('But see s. 36, infra, as to abatement of obstruction of easement.'),
      null,
    );
  });
});

describe('the prior wording', () => {
  it('keeps a quoted fragment in both quote styles the corpus uses', () => {
    assert.equal(
      substitutedTextFrom(
        'Subs. by s. 8, ibid ., for "enter any coal mine or its office" (w.e.f. 1-4-1966).',
      ),
      'enter any coal mine or its office',
    );
    assert.equal(
      substitutedTextFrom('Subs. by Act 10 of 2022, s. 2, for “a Corporation” (w.e.f. 22-5-2022).'),
      'a Corporation',
    );
  });

  it('is null where the note quotes nothing', () => {
    assert.equal(
      substitutedTextFrom('Subs. by Act 28 of 2018, s. 12, for sub-section (1) (w.e.f. 3-5-2018).'),
      null,
    );
  });
});

describe('parsing a whole footnote', () => {
  it('resolves ibid backwards — 1,651 sections name no Act of their own', () => {
    // Real: Coal Mines Provident Fund and Miscellaneous Provisions Act s.10.
    const { events } = parseFootnote(
      '1. Ins. by Act 99 of 1976, s. 12 (w.e.f. 1-8-1976). 2. Subs. by Act 45 of 1965, ' +
        's. 8, for clause (a) (w.e.f. 1-4-1966). 3. Subs. by s. 8, ibid ., for "enter any ' +
        'coal mine or its office" (w.e.f. 1-4-1966). 4. Ins. by s. 8, ibid . (w.e.f. 1-4-1966).',
    );
    assert.equal(events.length, 4);

    // Entry 3 says only `s. 8, ibid` — its Act is entry 2's, not entry 1's.
    assert.equal(events[2]!.amendingActRaw, 'Act 45 of 1965');
    assert.equal(events[2]!.ibidResolved, true);
    assert.equal(events[2]!.substitutedText, 'enter any coal mine or its office');
    assert.equal(events[3]!.amendingActRaw, 'Act 45 of 1965');
  });

  it('records an unresolvable ibid rather than attributing it to a later Act', () => {
    // The dangerous case: an `ibid` first, with an Act named after it. Reaching
    // forward would produce a confident wrong attribution — worse than a gap,
    // because a gap is visible.
    const { events } = parseFootnote(
      '1. Subs. by s. 9, ibid ., for sub-section (1) (w.e.f. 24-1-2000). ' +
        '2. Subs. by Act 2 of 2000, s. 9, for "under sub-section (1)" (w.e.f. 24-1-2000).',
    );
    assert.equal(events[0]!.amendingActRaw, null);
    assert.equal(events[0]!.ibidUnresolved, true);
    assert.equal(events[1]!.amendingActRaw, 'Act 2 of 2000');
  });

  it('carries a mixed footnote — three Acts, three dates, one section', () => {
    // Real: Central Goods and Services Tax Act s.25.
    const { events } = parseFootnote(
      '1. The proviso ins. by Act 31 of 2018, s.13, (w.e.f. 1-2-2019). 2. Subs. by s. 13, ' +
        'ibid , for the proviso (w.e.f. 1-2-2019). 3. Ins. by Act 23 of 2019, s. 95 (w.e.f. 1-1-2020).',
    );
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((e) => e.eventType),
      ['inserted', 'substituted', 'inserted'],
    );
    assert.deepEqual(
      events.map((e) => e.effectiveDate),
      ['2019-02-01', '2019-02-01', '2020-01-01'],
    );
    assert.equal(events[1]!.amendingActRaw, 'Act 31 of 2018');
    assert.equal(events[2]!.amendingActRaw, 'Act 23 of 2019');
  });

  it('reports a cross-reference footnote as unparsed, never as zero events silently', () => {
    const { events, unparsed } = parseFootnote(
      'See now the Land Acquisition Act, 1894 (1 of 1894).',
    );
    assert.deepEqual(events, []);
    assert.equal(unparsed.length, 1, 'the note must be counted, not absorbed');
  });

  it('keeps an amendment with no date, with a null date', () => {
    // Real: Census Act s.15B. Dropping undated events would lose real amendment
    // history; dating them from the Act year would fabricate it.
    const { events } = parseFootnote('1. Ins. by Act 11 of 1994, s. 12.');
    assert.equal(events.length, 1);
    assert.equal(events[0]!.effectiveDate, null);
    assert.equal(events[0]!.amendingActRaw, 'Act 11 of 1994');
  });

  it('every event keeps its own verbatim text', () => {
    // The row must be auditable without re-fetching indiacode.
    const { events } = parseFootnote(
      '1. Ins. by Act 99 of 1976, s. 12 (w.e.f. 1-8-1976). 2. Subs. by Act 45 of 1965, s. 8.',
    );
    assert.ok(events[0]!.verbatim.includes('Act 99 of 1976'));
    assert.ok(
      !events[0]!.verbatim.includes('Act 45 of 1965'),
      'entries must not bleed into each other',
    );
  });
});
