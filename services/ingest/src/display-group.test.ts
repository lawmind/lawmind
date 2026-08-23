import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AUTO_COLLAPSIBLE,
  buildGroup,
  classify,
  groupId,
  isAutoCollapsible,
  representative,
  type Member,
} from './display-group.ts';

const m = (over: Partial<Member> & { id: string }): Member => ({
  content_hash: null,
  source_url: null,
  storage_key: null,
  case_number: null,
  cnr: null,
  judgment_date: null,
  court: null,
  case_title: null,
  full_text_chars: null,
  native_text: null,
  script_quality: null,
  ...over,
});

describe('classify', () => {
  it('calls one content_hash across every member byte-identical', () => {
    const g = [m({ id: 'a', content_hash: 'h1' }), m({ id: 'b', content_hash: 'h1' })];
    assert.equal(classify(g), 'BYTE_IDENTICAL_DUPLICATE');
  });

  it('does NOT call it byte-identical when a hash is missing', () => {
    // A null hash is not agreement. Treating "we never hashed it" as "the bytes
    // match" is how an unrelated judgment gets folded out of a result set.
    const g = [m({ id: 'a', content_hash: 'h1' }), m({ id: 'b', content_hash: null })];
    assert.notEqual(classify(g), 'BYTE_IDENTICAL_DUPLICATE');
  });

  it('calls one source document with different hashes a source duplicate', () => {
    // Re-extraction changes the bytes. It does not make a second decision.
    const g = [
      m({ id: 'a', content_hash: 'h1', source_url: 'https://x/1.pdf' }),
      m({ id: 'b', content_hash: 'h2', source_url: 'https://x/1.pdf' }),
    ];
    assert.equal(classify(g), 'SAME_SOURCE_DOCUMENT_DUPLICATE');
  });

  it('calls one case across two dates several orders in one case', () => {
    const g = [
      m({ id: 'a', cnr: 'CNR001', judgment_date: '2025-02-10', case_number: 'WRIT-C/2421/2025' }),
      m({ id: 'b', cnr: 'CNR001', judgment_date: '2025-04-18', case_number: 'WRIT-C/2421/2025' }),
    ];
    assert.equal(classify(g), 'MULTIPLE_ORDERS_SAME_CASE');
  });

  it('calls one court, one date, many case numbers a common order', () => {
    // 2025:PHHC:052490-DB is line 1 of 253 separate orders — the court's own
    // batch disposal, verified on the source PDFs.
    const g = [
      m({ id: 'a', court: 'P&H', judgment_date: '2025-09-01', case_number: 'CWP/101/2025' }),
      m({ id: 'b', court: 'P&H', judgment_date: '2025-09-01', case_number: 'CWP/102/2025' }),
      m({ id: 'c', court: 'P&H', judgment_date: '2025-09-01', case_number: 'CWP/103/2025' }),
    ];
    assert.equal(classify(g), 'CONNECTED_MATTER_COMMON_ORDER');
  });

  it('calls different courts or unrelated matters DISTINCT, and never collapses them', () => {
    // 2026:JHHC:16965 is carried by two different Jharkhand bail matters a month
    // apart. Showing them as one judgment shows an advocate the wrong authority.
    const g = [
      m({ id: 'a', court: 'Jharkhand', judgment_date: '2026-07-14', case_number: 'A.B.A./3820/2026', content_hash: 'h1' }),
      m({ id: 'b', court: 'Jharkhand', judgment_date: '2026-06-12', case_number: 'A.B.A./3051/2026', content_hash: 'h2' }),
    ];
    assert.equal(classify(g), 'DISTINCT_JUDGMENTS_SHARED_CITATION');
    assert.equal(isAutoCollapsible(classify(g)), false);
  });

  it('only the two document-evidence classes are auto-collapsible', () => {
    assert.deepEqual([...AUTO_COLLAPSIBLE], ['BYTE_IDENTICAL_DUPLICATE', 'SAME_SOURCE_DOCUMENT_DUPLICATE']);
    assert.equal(isAutoCollapsible('CONNECTED_MATTER_COMMON_ORDER'), false);
    assert.equal(isAutoCollapsible('MULTIPLE_ORDERS_SAME_CASE'), false);
    assert.equal(isAutoCollapsible('DISTINCT_JUDGMENTS_SHARED_CITATION'), false);
  });
});

describe('representative', () => {
  it('prefers readable text over proven-damaged text', () => {
    const g = [
      m({ id: 'damaged', script_quality: 'damaged_other', full_text_chars: 90000 }),
      m({ id: 'clean', script_quality: null, full_text_chars: 1000 }),
    ];
    assert.equal(representative(g).id, 'clean');
  });

  it('prefers the longer text when both are readable', () => {
    const g = [m({ id: 'short', full_text_chars: 500 }), m({ id: 'long', full_text_chars: 40000 })];
    assert.equal(representative(g).id, 'long');
  });

  it('is STABLE when every document property ties, regardless of input order', () => {
    // The whole point of P14: a representative picked off row order paginates
    // the same judgment onto two pages.
    const a = m({ id: 'aaa', content_hash: 'h2', full_text_chars: 10 });
    const b = m({ id: 'bbb', content_hash: 'h1', full_text_chars: 10 });
    assert.equal(representative([a, b]).id, representative([b, a]).id);
    assert.equal(representative([a, b]).id, 'bbb'); // lowest content_hash
  });
});

describe('groupId', () => {
  it('is the same for the same membership in any order', () => {
    const a = m({ id: 'x' });
    const b = m({ id: 'y' });
    assert.equal(groupId([a, b]), groupId([b, a]));
  });

  it('changes when the membership changes', () => {
    assert.notEqual(groupId([m({ id: 'x' }), m({ id: 'y' })]), groupId([m({ id: 'x' }), m({ id: 'z' })]));
  });
});

describe('buildGroup', () => {
  it('hides members only when the class authorises it', () => {
    const dupes = buildGroup([
      m({ id: 'a', content_hash: 'h1' }),
      m({ id: 'b', content_hash: 'h1' }),
      m({ id: 'c', content_hash: 'h1' }),
    ]);
    assert.equal(dupes.members_hidden_if_collapsed, 2);
    assert.equal(dupes.confidence, 'DOCUMENT_EVIDENCE');

    const connected = buildGroup([
      m({ id: 'a', court: 'P&H', judgment_date: '2025-09-01', case_number: 'CWP/101/2025' }),
      m({ id: 'b', court: 'P&H', judgment_date: '2025-09-01', case_number: 'CWP/102/2025' }),
    ]);
    assert.equal(connected.members_hidden_if_collapsed, 0);
    assert.equal(connected.confidence, 'REGISTRY_EVIDENCE');
  });

  it('reports member ids sorted, so a caller cannot depend on row order', () => {
    const g = buildGroup([m({ id: 'ccc', content_hash: 'h' }), m({ id: 'aaa', content_hash: 'h' })]);
    assert.deepEqual(g.member_ids, ['aaa', 'ccc']);
  });
});
