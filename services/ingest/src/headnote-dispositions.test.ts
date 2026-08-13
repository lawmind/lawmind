/**
 * Every fixture here is verbatim corpus text, and every assertion encodes a
 * false positive this parser actually produced. Two of them would have marked
 * landmark constitutional authority as dead law.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ADVERSE_DISPOSITIONS,
  concordancePairs,
  parseHeadnoteDispositions,
} from './headnote-dispositions.ts';

/** Verbatim from `MADA v. SAIL` (2024 INSC 554) — the passage that started this. */
const MADA =
  'Federation of Mining Associations of Rajasthan v. State of Rajasthan (1992) Supp 2 SCC 239; ' +
  'State of M P v. Mahalaxmi Fabric Mills Ltd. [1995] 1 SCR 756 : (1995) Supp 1 SCC 642; ' +
  'Saurashtra Cement & Chemical Industries Ltd. v. Union of India [2000] Supp. 4 SCR 44 : (2001) 1 SCC 91; ' +
  'State of Orissa v. Mahanadi Coalfields Ltd. [1995] 3 SCR 639 : (1995) Supp 2 SCC 686; ' +
  'P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670 – overruled. ' +
  'Banarsi Dass Chadha v. Lt Governor, Delhi Administration [1979] 1 SCR 271 : (1978) 4 SCC 11; ' +
  'Jindal Stainless Steel v. State of Haryana [2016] 10 SCR 1 : (2017) 1574 [2024] 7 S.C.R.Digital Supreme Court Reports 12 SCC 1 – affirmed.';

/**
 * Verbatim from `Puttaswamy` (2018 INSC 880). **v1 reported ten cases overruled
 * here**, including Shayara Bano, Kihoto Hollohan and Tulsiram Patel — all good
 * law. Two are overruled. Cause: `– relied on` carries no trailing period, v1's
 * regex required one, so the boundary was never seen.
 */
const PUTTASWAMY =
  'Union of India v. Tulsiram Patel (1985) 3 SCC 398 : [1985] 2 Suppl. SCR 131; ' +
  'Kihoto Hollohan v. Zachillhu (1992) Supp 2 SCC 651 : [1992] 1 SCR 686 – relied on ' +
  '1.1.3 A constitutional trust has been vested in the office of the Speaker of the Lok Sabha. ' +
  'Judicial review is necessary to ensure the federal features are not transgressed. [Para 94][830-D-F] ' +
  'Ramdas Athawale v Union of India (2010) 4 SCC 1 : [2010] 3 SCR 1059; ' +
  'Pandit MSM Sharma v Dr Shree Krishna Sinha AIR 1960 SC 1186 – relied on. ' +
  'Mohd Saeed Siddiqui v State of Uttar Pradesh (2014) 11 SCC 415; ' +
  'Yogendra Kumar Jaiswal v State of Bihar (2016) 3 SCC 183 – overruled.';

/**
 * `Joseph Shine` (2018 INSC 898) — the case **v2 still got wrong**, reporting
 * E P Royappa, Navtej Singh Johar and Anuj Garg as overruled. It overruled
 * V. Revathi and Sowmithri Vishnu and nothing else. Fixed only by the measured
 * allow-list: a generic `[a-z ]+` pattern matched prose like `– the` while
 * missing the real `referred to` that closes the first list.
 */
const JOSEPH_SHINE =
  'E P Royappa v State of Tamil Nadu (1974) 4 SCC 3 : [1974] 2 SCR 348; ' +
  'Navtej Singh Johar v Union of India (2018) 1 SCC 791; ' +
  'Anuj Garg v Hotel Association of India (2008) 3 SCC 1 – referred to ' +
  'The offence of adultery treats a woman as the property of her husband. ' +
  'Independent Thought v Union of India (2017) 10 SCC 800 – relied on. ' +
  'V. Revathi v. Union of India and others (1988) 2 SCC 72 : [1988] 3 SCR 73; ' +
  'W. Kalyani v. State (2012) 1 SCC 358 – overruled.';

const names = (t: string, d: string) =>
  parseHeadnoteDispositions(t)
    .filter((e) => e.disposition === d)
    .map((e) => e.name)
    .join(' | ');

describe('grouped dispositions — the marker closes a GROUP, not a citation', () => {
  const entries = parseHeadnoteDispositions(MADA);

  it('reads every case in the group, not just the one beside the marker', () => {
    const o = entries.filter((e) => e.disposition === 'overruled');
    assert.equal(o.length, 5, 'the old extractor saw 1 of these 5');
    assert.ok(o.some((e) => e.scc === '(1996) 5 SCC 670'));
    assert.ok(o.some((e) => e.scc === '(1992) Supp 2 SCC 239'));
  });

  it('marks which entry the old extractor caught, so the miss is countable', () => {
    const o = entries.filter((e) => e.disposition === 'overruled');
    assert.equal(o.filter((e) => e.lastInGroup).length, 1);
    assert.ok(o.find((e) => e.lastInGroup)?.name.includes('Kannadasan'));
  });

  it('does not leak one group into the next', () => {
    const a = names(MADA, 'affirmed');
    assert.ok(a.includes('Banarsi Dass'));
    // Inverting an authority's status is worse than missing it.
    assert.ok(!a.includes('Kannadasan'));
  });

  it('keeps the name as printed and never invents one', () => {
    assert.equal(
      entries.find((e) => e.scc === '(1996) 5 SCC 670')?.name,
      'P Kannadasan v. State of Tamil Nadu',
    );
  });
});

describe('Puttaswamy — v1 reported 10 overruled, 8 of them good law', () => {
  it('finds exactly the two actually overruled', () => {
    const o = names(PUTTASWAMY, 'overruled');
    assert.ok(o.includes('Mohd Saeed Siddiqui'));
    assert.ok(o.includes('Yogendra Kumar Jaiswal'));
    assert.equal(parseHeadnoteDispositions(PUTTASWAMY).filter((e) => e.disposition === 'overruled').length, 2);
  });

  it('never promotes a case from an earlier "relied on" list', () => {
    const o = names(PUTTASWAMY, 'overruled');
    for (const good of ['Kihoto Hollohan', 'Tulsiram Patel', 'Ramdas Athawale', 'MSM Sharma']) {
      assert.ok(!o.includes(good), `${good} is good law and must never be marked overruled`);
    }
  });

  it('stops at prose rather than reaching back through it', () => {
    assert.ok(!/constitutional trust|federal features/.test(names(PUTTASWAMY, 'overruled')));
  });
});

describe('Joseph Shine — the case v2 still got wrong', () => {
  it('overrules V. Revathi and W. Kalyani only', () => {
    const o = names(JOSEPH_SHINE, 'overruled');
    assert.ok(o.includes('Revathi'));
    assert.ok(o.includes('Kalyani'));
  });

  it('leaves Royappa, Navtej Johar, Anuj Garg and Independent Thought alone', () => {
    const o = names(JOSEPH_SHINE, 'overruled');
    for (const good of ['Royappa', 'Navtej', 'Anuj Garg', 'Independent Thought']) {
      assert.ok(!o.includes(good), `${good} is good law and must never be marked overruled`);
    }
  });

  it('an unterminated "referred to" still closes its group', () => {
    assert.ok(names(JOSEPH_SHINE, 'referred to').includes('Royappa'));
  });
});

describe('the adverse set is narrow on purpose', () => {
  it('counts only dispositions that move the law', () => {
    for (const d of ['overruled', 'partially overruled', 'disapproved', 'per incurium']) {
      assert.ok(ADVERSE_DISPOSITIONS.has(d), `${d} moves the law`);
    }
  });

  it('never treats confirmation or inapplicability as adverse', () => {
    // `distinguished` and `held inapplicable` mean the authority STANDS.
    for (const d of ['affirmed', 'explained', 'relied on', 'followed', 'distinguished', 'held inapplicable', 'referred to']) {
      assert.ok(!ADVERSE_DISPOSITIONS.has(d), `${d} does not move the law`);
    }
  });
});

describe('the interpolated PDF page header', () => {
  it('does not let running-header junk corrupt the SCC volume', () => {
    // Raw: "(2017) 1574 [2024] 7 S.C.R.Digital Supreme Court Reports 12 SCC 1"
    const jindal = parseHeadnoteDispositions(MADA).find((e) => e.name.includes('Jindal'));
    assert.equal(jindal?.scc, '(2017) 12 SCC 1');
  });
});

describe('the concordance — the half that is sound', () => {
  it('pairs SCR to SCC only where both are printed', () => {
    const pairs = concordancePairs(parseHeadnoteDispositions(MADA));
    assert.ok(
      pairs.some(
        (p) =>
          p.name === 'P Kannadasan v. State of Tamil Nadu' &&
          p.scr === '(1996) Supp 4 SCR 92' &&
          p.scc === '(1996) 5 SCC 670',
      ),
    );
    // Federation of Mining prints an SCC form only — one form maps nothing.
    assert.ok(!pairs.some((p) => p.name.includes('Federation of Mining')));
  });

  it('survives a wrong disposition, because a pair comes from one entry', () => {
    // Even where grouping misfires, the entry's own SCR:SCC pairing holds.
    const pairs = concordancePairs(parseHeadnoteDispositions(JOSEPH_SHINE));
    assert.ok(pairs.some((p) => p.scc === '(1988) 2 SCC 72' && p.scr === '(1988) 3 SCR 73'));
  });
});

describe('refusals', () => {
  it('returns nothing for prose containing an en dash', () => {
    assert.deepEqual(
      parseHeadnoteDispositions('The appeal is allowed – accordingly. No order as to costs.'),
      [],
    );
  });

  it('does not treat a bare citation with no case name as an entry', () => {
    assert.deepEqual(parseHeadnoteDispositions('(1996) 5 SCC 670 – overruled.'), []);
  });

  it('ignores prose fragments the old generic pattern matched as dispositions', () => {
    // `– the`, `– see section`, `– of the` all appeared in the corpus survey.
    assert.deepEqual(parseHeadnoteDispositions('Ram v. State (1999) 1 SCC 1 – the matter rests.'), []);
  });
});

/**
 * NEW3's independent cross-check (bus 0230): of 21 raw proximity hits, **6 were
 * false positives**, one being a running page header — `354 [2023] 6 S.C.R. 354`
 * — read as a citation. Their conclusion, adopted: punctuation-level adjacency,
 * not distance.
 *
 * This matters because `concordancePairs` feeds a pass that WRITES.
 */
describe('a pair requires the colon, not proximity — NEW3 0230', () => {
  it('pairs a genuine "X : Y" construction', () => {
    const pairs = concordancePairs(
      parseHeadnoteDispositions('Ram v. State [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670 – overruled.'),
    );
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]?.scr, '(1996) Supp 4 SCR 92');
  });

  it('refuses two forms that merely co-occur without a colon', () => {
    // Both present, never equated by the reporter. A whole-entry scan would
    // have paired them.
    const entries = parseHeadnoteDispositions(
      'Ram v. State (1996) 5 SCC 670 was considered at 354 [2023] 6 SCR 354 – overruled.',
    );
    assert.equal(concordancePairs(entries).length, 0, 'a page header is not a parallel citation');
    // The disposition report still sees the entry — only the WRITE path refuses.
    assert.ok(entries.length > 0);
  });

  it('pairs the reverse order too', () => {
    const pairs = concordancePairs(
      parseHeadnoteDispositions('Ram v. State (1996) 5 SCC 670 : [1996] Supp. 4 SCR 92 – overruled.'),
    );
    assert.equal(pairs.length, 1);
  });
});
