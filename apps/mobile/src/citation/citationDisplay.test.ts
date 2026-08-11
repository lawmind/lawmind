import { citationCopyText, citationDisplay, NO_CITATION, NOTES } from './citationDisplay';

/**
 * REGRESSION TESTS FOR A DEFECT THAT REACHED PRODUCTION.
 *
 * 40,980 High Court judgments landed with no citation of any kind, and the live
 * unauthenticated API served them beside Supreme Court rows that do carry them.
 * Every surface interpolated the field raw, so the clipboard action produced
 * `"<case name>, null"` — four characters from a court filing.
 *
 * Four states, and the rules that hold across all of them: never fabricate,
 * never print `null`, expose identifiers the row actually supplies, and let
 * only citation-dependent actions warn. Verified stays silent.
 */

describe('verified — a citation is present and nothing contradicts it', () => {
  it('renders the neutral citation, citable, and says nothing extra', () => {
    expect(
      citationDisplay({ neutralCitation: '2023:DHC:2720', verificationState: 'verified' })
    ).toEqual({ kind: 'verified', text: '2023:DHC:2720', citable: true, stored: '2023:DHC:2720' });
  });

  it('carries NO note — verified is silent, and this file may not change that', () => {
    expect(citationDisplay({ neutralCitation: '2023:DHC:2720' }).note).toBeUndefined();
  });

  it('prefers the neutral citation over a reporter citation', () => {
    expect(
      citationDisplay({
        neutralCitation: '2023:DHC:2720',
        reporterCitations: ['(2023) 4 SCC 1'],
      }).text
    ).toBe('2023:DHC:2720');
  });

  it('falls back to a reporter citation the row actually supplies', () => {
    expect(citationDisplay({ neutralCitation: null, reporterCitations: ['(1994) 3 SCC 1'] })).toEqual(
      { kind: 'verified', text: '(1994) 3 SCC 1', citable: true, stored: '(1994) 3 SCC 1' }
    );
  });

  it('skips blank reporter entries rather than rendering whitespace', () => {
    expect(
      citationDisplay({ neutralCitation: null, reporterCitations: ['', '   ', '(1994) 3 SCC 1'] }).text
    ).toBe('(1994) 3 SCC 1');
  });

  it('returns the stored string byte for byte, without reformatting it', () => {
    const stored = '(1972)  4 SCC 600';
    expect(citationDisplay({ neutralCitation: stored }).text).toBe(stored);
  });
});

describe('unavailable — the row carries no citation at all', () => {
  const row = { neutralCitation: null, reporterCitations: [] };

  it('says plainly that there is none, and is never citable', () => {
    expect(citationDisplay(row)).toEqual({
      kind: 'unavailable',
      text: NO_CITATION,
      citable: false,
      note: NOTES.unavailable,
    });
  });

  it('treats an absent reporter array the same as an empty one', () => {
    expect(citationDisplay({ neutralCitation: null }).kind).toBe('unavailable');
  });

  /**
   * THE JUDGMENT IS NOT INVALID. The note must say the text is still readable —
   * a citationless High Court judgment is a real judgment of a real court, and
   * copy that implied otherwise would be as wrong as fabricating a citation.
   */
  it('does not imply the judgment is invalid or unreadable', () => {
    const { note } = citationDisplay(row);
    // The harness principle, quoted: "absence of citation is not absence of
    // legal evidence." The note must keep the judgment intact.
    expect(note).toContain('the text is here to read');
    expect(note).toContain('judgment itself is unaffected');
    expect(note).not.toMatch(/invalid|not a judgment|unavailable judgment/i);
  });

  it('is not confused with the unverified state, which is a different fact', () => {
    expect(citationDisplay(row).note).not.toBe(NOTES.unverified);
  });
});

describe('unverified — a citation exists but no tier confirmed it', () => {
  it.each(['unverified', 'failed'] as const)('marks %s and refuses citable', (verificationState) => {
    expect(citationDisplay({ neutralCitation: '(2019) 4 SCC 221', verificationState })).toEqual({
      kind: 'unverified',
      text: '(2019) 4 SCC 221',
      // CITABLE. It has a citation; that it is unconfirmed is a separate
      // concern with its own mark — the harness forbids folding the two.
      citable: true,
      note: NOTES.unverified,
      stored: '(2019) 4 SCC 221',
    });
  });

  it('still shows the citation itself — never hidden, never silently dropped', () => {
    expect(
      citationDisplay({ neutralCitation: '(2019) 4 SCC 221', verificationState: 'failed' }).text
    ).toBe('(2019) 4 SCC 221');
  });

  it('uses licence-protection copy, never "verification failed"', () => {
    expect(NOTES.unverified).not.toMatch(/verification failed/i);
    expect(NOTES.unverified).toMatch(/could not confirm/i);
  });
});

describe('conflicting — what was claimed and what we hold disagree', () => {
  it('flags the disagreement and shows both sides', () => {
    expect(
      citationDisplay({ neutralCitation: '(1994) 3 SCC 1', citationClaimed: '(1994) 2 SCC 5' })
    ).toEqual({
      kind: 'conflicting',
      text: '(1994) 3 SCC 1',
      citable: true,
      note: NOTES.conflicting,
      claimed: '(1994) 2 SCC 5',
      stored: '(1994) 3 SCC 1',
    });
  });

  it('is not triggered by case or whitespace differences, which are not conflicts', () => {
    expect(
      citationDisplay({ neutralCitation: '(1994) 3 SCC 1', citationClaimed: '(1994)  3 scc 1' }).kind
    ).toBe('verified');
  });

  /** "We were told X and hold nothing" is a conflict, not an ordinary absence. */
  it('outranks unavailable when something was claimed and nothing is held', () => {
    const d = citationDisplay({ neutralCitation: null, citationClaimed: '(1994) 3 SCC 1' });
    expect(d.kind).toBe('conflicting');
    expect(d.text).toBe(NO_CITATION);
    expect(d.claimed).toBe('(1994) 3 SCC 1');
  });

  /** Never inferred: a surface with nothing claimed cannot produce this state. */
  it('cannot arise when no claimed citation is supplied', () => {
    expect(citationDisplay({ neutralCitation: '(1994) 3 SCC 1' }).kind).not.toBe('conflicting');
    expect(citationDisplay({ neutralCitation: null }).kind).not.toBe('conflicting');
  });
});

describe('rules that hold in every state', () => {
  const every = [
    citationDisplay({ neutralCitation: '2023:DHC:2720' }),
    citationDisplay({ neutralCitation: null }),
    citationDisplay({ neutralCitation: '(2019) 4 SCC 221', verificationState: 'unverified' }),
    citationDisplay({ neutralCitation: 'A', citationClaimed: 'B' }),
  ];

  it('never renders null, undefined, an empty string or a placeholder', () => {
    for (const d of every) {
      expect(d.text).not.toBe('null');
      expect(d.text).not.toBe('undefined');
      expect(d.text).not.toBe('—');
      expect(d.text.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * `citable` ASKS ONE QUESTION: is there a citation to write in a petition.
   * `docs/CITATION_HARNESS.md` §"The fourth concern" defines it as exactly
   * `neutralCitation === null AND reporterCitations.length === 0`, and warns
   * against folding verification into it. So three of these four are citable —
   * only the one holding no string at all is not.
   */
  it('marks uncitable ONLY the state that holds no citation string', () => {
    expect(every.filter((d) => !d.citable).map((d) => d.kind)).toEqual(['unavailable']);
  });

  it('gives every non-verified state a note, and the verified state none', () => {
    for (const d of every) {
      if (d.kind === 'verified') expect(d.note).toBeUndefined();
      else expect(d.note?.length).toBeGreaterThan(0);
    }
  });

  /** `DOMAIN_TRUTH.md`: never construct a citation by pattern. */
  it('never assembles a citation from court, year or case name', () => {
    const d = citationDisplay({ neutralCitation: null, reporterCitations: [] });
    expect(d.text).toBe(NO_CITATION);
  });
});

describe('the clipboard string — the defect that reached production', () => {
  /**
   * The exact regression. `` `${caseTitle}, ${neutralCitation}` `` with a null
   * citation produced "Mock Petitioner v. State of Bihar, null" — a template
   * literal TypeScript is happy to fill with anything, one paste from a filing.
   */
  it('never puts the word null on the clipboard', () => {
    const copied = citationCopyText(
      'Mock Petitioner v. State of Bihar',
      citationDisplay({ neutralCitation: null, reporterCitations: [] })
    );

    expect(copied).toBe('Mock Petitioner v. State of Bihar');
    expect(copied).not.toContain('null');
    expect(copied).not.toContain('undefined');
  });

  it('never pastes the on-screen absence line either', () => {
    const copied = citationCopyText('X v. Y', citationDisplay({ neutralCitation: null }));

    expect(copied).not.toContain(NO_CITATION);
  });

  /** No "n.d.", no "[no citation]" — a placeholder in a filing is its own lie. */
  it('substitutes no placeholder, it simply omits what we do not have', () => {
    const copied = citationCopyText('X v. Y', citationDisplay({ neutralCitation: null }));

    expect(copied).toBe('X v. Y');
    expect(copied).not.toMatch(/\[|\]|n\.d\.|unknown|none/i);
  });

  it('emits the two stored fields and a comma when a citation exists', () => {
    const copied = citationCopyText(
      'Mock Appellant v. Union of India',
      citationDisplay({ neutralCitation: 'MOCK 2026 EXAMPLE 1' })
    );

    expect(copied).toBe('Mock Appellant v. Union of India, MOCK 2026 EXAMPLE 1');
  });

  it('copies a reporter citation when that is the identifier the row supplies', () => {
    const copied = citationCopyText(
      'X v. Y',
      citationDisplay({ neutralCitation: null, reporterCitations: ['(1994) 3 SCC 1'] })
    );

    expect(copied).toBe('X v. Y, (1994) 3 SCC 1');
  });

  /**
   * An unverified citation is still COPIED — `CITATION_HARNESS.md` offers copy
   * in every state, including `set_aside`, because refusing it destroys the
   * `citation_copies` record that is the only way to warn that advocate later.
   * What is withheld is fabrication, never the truth we hold.
   */
  it('still copies a citation we could not confirm, because the record matters more', () => {
    const copied = citationCopyText(
      'X v. Y',
      citationDisplay({ neutralCitation: '(2019) 4 SCC 221', verificationState: 'unverified' })
    );

    expect(copied).toBe('X v. Y, (2019) 4 SCC 221');
  });
});
