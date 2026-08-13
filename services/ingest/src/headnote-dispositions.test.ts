import { describe, expect, it } from 'vitest';

import {
  ADVERSE_DISPOSITIONS,
  concordancePairs,
  parseHeadnoteDispositions,
} from './headnote-dispositions.ts';

/**
 * Verbatim from `MADA v. SAIL` (2024 INSC 554) — the passage that exposed the
 * bug. Kept exact, interpolated PDF header and all, because a cleaned-up
 * fixture would test a document we do not actually hold.
 */
const MADA_GROUP =
  'Federation of Mining Associations of Rajasthan v. State of Rajasthan (1992) Supp 2 SCC 239; ' +
  'State of M P v. Mahalaxmi Fabric Mills Ltd. [1995] 1 SCR 756 : (1995) Supp 1 SCC 642; ' +
  'Saurashtra Cement & Chemical Industries Ltd. v. Union of India [2000] Supp. 4 SCR 44 : (2001) 1 SCC 91; ' +
  'State of Orissa v. Mahanadi Coalfields Ltd. [1995] 3 SCR 639 : (1995) Supp 2 SCC 686; ' +
  'P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670 – overruled. ' +
  'Banarsi Dass Chadha v. Lt Governor, Delhi Administration [1979] 1 SCR 271 : (1978) 4 SCC 11; ' +
  'Jindal Stainless Steel v. State of Haryana [2016] 10 SCR 1 : (2017) 1574 [2024] 7 S.C.R.Digital Supreme Court Reports 12 SCC 1 – affirmed.';

describe('grouped dispositions', () => {
  const entries = parseHeadnoteDispositions(MADA_GROUP);

  it('reads EVERY case in the group, not just the one beside the marker', () => {
    const overruled = entries.filter((e) => e.disposition === 'overruled');
    // This is the whole defect: the old extractor saw 1 of these 5.
    expect(overruled).toHaveLength(5);
    expect(overruled.map((e) => e.scc)).toContain('(1996) 5 SCC 670');
    expect(overruled.map((e) => e.scc)).toContain('(1992) Supp 2 SCC 239');
  });

  it('marks which entry the old extractor would have caught, so the miss is countable', () => {
    const overruled = entries.filter((e) => e.disposition === 'overruled');
    expect(overruled.filter((e) => e.lastInGroup)).toHaveLength(1);
    expect(overruled.find((e) => e.lastInGroup)?.name).toContain('Kannadasan');
  });

  it('does not leak one group into the next', () => {
    const affirmed = entries.filter((e) => e.disposition === 'affirmed');
    expect(affirmed).toHaveLength(2);
    expect(affirmed.map((e) => e.name).join(' ')).toContain('Banarsi Dass');
    // Kannadasan is overruled, NOT affirmed. Bleeding across the marker would
    // invert an authority's status, which is worse than missing it.
    expect(affirmed.map((e) => e.name).join(' ')).not.toContain('Kannadasan');
  });

  it('keeps the name as printed and never invents one', () => {
    const k = entries.find((e) => e.scc === '(1996) 5 SCC 670');
    expect(k?.name).toBe('P Kannadasan v. State of Tamil Nadu');
  });

  it('treats only genuinely adverse dispositions as adverse', () => {
    expect(ADVERSE_DISPOSITIONS.has('overruled')).toBe(true);
    // `affirmed` and `explained` say the law did NOT move.
    expect(ADVERSE_DISPOSITIONS.has('affirmed')).toBe(false);
    expect(ADVERSE_DISPOSITIONS.has('explained')).toBe(false);
  });
});

describe('the interpolated PDF page header', () => {
  it('does not let running-header junk corrupt the SCC volume', () => {
    const jindal = parseHeadnoteDispositions(MADA_GROUP).find((e) => e.name.includes('Jindal'));
    // Raw text reads "(2017) 1574 [2024] 7 S.C.R.Digital Supreme Court Reports
    // 12 SCC 1" — 1574 is a page number. Volume 12 is the truth.
    expect(jindal?.scc).toBe('(2017) 12 SCC 1');
    expect(jindal?.scc).not.toContain('1574');
  });
});

describe('the concordance, which may matter more than the dispositions', () => {
  it('pairs SCR to SCC only where BOTH are printed', () => {
    const pairs = concordancePairs(parseHeadnoteDispositions(MADA_GROUP));
    expect(pairs).toContainEqual({
      name: 'P Kannadasan v. State of Tamil Nadu',
      scr: '(1996) Supp 4 SCR 92',
      scc: '(1996) 5 SCC 670',
    });
    // Federation of Mining has an SCC form only — one form maps nothing.
    expect(pairs.map((p) => p.name)).not.toContain(
      'Federation of Mining Associations of Rajasthan v. State of Rajasthan',
    );
  });
});

/**
 * Verbatim from `Puttaswamy` (2018 INSC 880). The first version of this parser
 * reported TEN cases overruled here — including Shayara Bano, Kihoto Hollohan
 * and Tulsiram Patel, all of which are good law. Only two are overruled.
 *
 * Two causes, both fixed: `– relied on` carries no trailing period so the
 * marker was never matched and the group never closed, and the group was taken
 * as "everything since the last marker" rather than being walked back from the
 * text. Had this been written to `overruled_status` it would have marked
 * landmark constitutional authority as dead law.
 */
const PUTTASWAMY =
  'Union of India v. Tulsiram Patel (1985) 3 SCC 398 : [1985] 2 Suppl. SCR 131; ' +
  'Kihoto Hollohan v. Zachillhu (1992) Supp 2 SCC 651 : [1992] 1 SCR 686 – relied on ' +
  '1.1.3 A constitutional trust has been vested in the office of the Speaker of the Lok Sabha. ' +
  'By declaring an ordinary Bill to be a Money Bill, the Speaker limits the role of the Rajya Sabha. ' +
  'Judicial review is necessary to ensure that the federal features are not transgressed. [Para 94][830-D-F] ' +
  'Ramdas Athawale v Union of India (2010) 4 SCC 1 : [2010] 3 SCR 1059; ' +
  'Pandit MSM Sharma v Dr Shree Krishna Sinha AIR 1960 SC 1186 – relied on. ' +
  'Mohd Saeed Siddiqui v State of Uttar Pradesh (2014) 11 SCC 415; ' +
  'Yogendra Kumar Jaiswal v State of Bihar (2016) 3 SCC 183 – overruled.';

describe('Puttaswamy — the false positive that nearly killed good law', () => {
  const overruled = parseHeadnoteDispositions(PUTTASWAMY).filter((e) => e.disposition === 'overruled');

  it('finds exactly the two cases actually overruled', () => {
    expect(overruled).toHaveLength(2);
    expect(overruled.map((e) => e.name).join(' | ')).toContain('Mohd Saeed Siddiqui');
    expect(overruled.map((e) => e.name).join(' | ')).toContain('Yogendra Kumar Jaiswal');
  });

  it('never marks a case from an earlier "relied on" list as overruled', () => {
    const names = overruled.map((e) => e.name).join(' | ');
    for (const good of ['Kihoto Hollohan', 'Tulsiram Patel', 'Ramdas Athawale', 'MSM Sharma']) {
      expect(names).not.toContain(good);
    }
  });

  it('stops the group at prose rather than reaching back through it', () => {
    expect(overruled.map((e) => e.name).join(' ')).not.toMatch(/constitutional trust|Rajya Sabha/);
  });
});

describe('refusals', () => {
  it('returns nothing for prose that merely contains an en dash', () => {
    expect(
      parseHeadnoteDispositions('The appeal is allowed – accordingly. No order as to costs.'),
    ).toEqual([]);
  });

  it('ignores a marker whose group is too long to be a Case Law list', () => {
    const prose = `${'x'.repeat(5000)} – overruled.`;
    expect(parseHeadnoteDispositions(prose)).toEqual([]);
  });

  it('does not treat a bare citation with no case name as an entry', () => {
    expect(parseHeadnoteDispositions('(1996) 5 SCC 670 – overruled.')).toEqual([]);
  });
});
