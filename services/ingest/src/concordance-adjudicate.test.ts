import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type AdjudicationDecision,
  type Candidate,
  adjudicationInputHash,
  buildAdjudicationPrompt,
  jaccardSimilarity,
  nameBeforeCitation,
  parseAdjudicationResponse,
  rankCandidates,
  resolveConfidenceTier,
  tokenizeName,
  stripTrailingCitations,
  yearFromCitationText,
} from './concordance-adjudicate.ts';

/* ------------------------------------------------------------- year parsing ── */

test('year parses from AIR and SCC forms, tolerant of OCR newlines', () => {
  assert.equal(yearFromCitationText('AIR 1973 SC 1461'), 1973);
  assert.equal(yearFromCitationText('AIR 2007\nSC 2588'), 2007);
  assert.equal(yearFromCitationText('(2019) 4 SCC 221'), 2019);
  assert.equal(yearFromCitationText('(2012)\n10 SCC 197'), 2012);
});

/**
 * EVERY STRING BELOW WAS TAKEN FROM A REAL ROW, and the counts beside them are
 * from a frequency scan of 600 resolved citations — not from what a citation is
 * supposed to look like. The original two patterns had **no S.C.R. form at
 * all**, which is the form all 38,342 of our Supreme Court judgments carry, so
 * 65.2% of real citations parsed to no year and were dropped before candidate
 * generation ever saw them.
 */
test('S.C.R. IS A CITATION FORMAT — the gap that silently cost 65.2% of the funnel', () => {
  assert.equal(yearFromCitationText('[2018] 12 SCR 362'), 2018); // 180 occurrences
  assert.equal(yearFromCitationText('2012 (6) SCR 787'), 2012); //  80, the reports' year-first house style
  assert.equal(yearFromCitationText('[1983] 2 S.C.R. 936'), 1983); //  26, dotted
  assert.equal(yearFromCitationText('(1968) 1 SCR 463'), 1968); //  15
  assert.equal(yearFromCitationText('[1994] 2 S.C.R. 644'), 1994); // S.R. Bommai, as stored
});

test('a citation with no volume number still has a year', () => {
  // `(1957) SCR 605` — 14 occurrences in the unresolved target population.
  assert.equal(yearFromCitationText('(1957) SCR 605'), 1957);
  assert.equal(yearFromCitationText('[1957] SCR 868'), 1957);
});

test('MISMATCHED BRACKETS PARSE — a scanner slip is not a reason to drop a citation', () => {
  // Both shapes are real rows: `[1972) 4 SCC 600` was quoted verbatim in Q1.0c.
  assert.equal(yearFromCitationText('[2012) 10 SCR 157'), 2012);
  assert.equal(yearFromCitationText('(2004] 3 SCR 982'), 2004);
});

test('dotted SCC and SCALE, both of which appear in the unresolved targets', () => {
  assert.equal(yearFromCitationText('(1992) 2 S.C.C. 206'), 1992);
  assert.equal(yearFromCitationText('(2016) 1 SCALE 348'), 2016);
});

test('an unrecognised shape yields no year, not a wrong one', () => {
  assert.equal(yearFromCitationText('some unrelated text'), null);
  // A bare year with no reporter beside it is NOT a citation year. Widening the
  // patterns must not go so far as to read the first four digits it finds —
  // that would hand the year guard a number from a paragraph reference and let
  // a repeat litigant match the wrong decade, which is the exact harm the
  // guard exists to prevent.
  assert.equal(yearFromCitationText('paragraph 1994 of the judgment'), null);
  assert.equal(yearFromCitationText('Section 302 IPC'), null);
});

/* --------------------------------------------- the parallel-citation problem ── */

/**
 * Every window below is a real one, taken verbatim from the corpus. Indian
 * reports print a judgment's citations in pairs — `... [1999] 1 SCR 235 :
 * (1999) 2 SCC 718` — and the extractor records both, so the SECOND citation's
 * window ends with the FIRST citation rather than with the case name. The name
 * regex is anchored at the end of the string, so it matched nothing.
 *
 * Measured: 277 of 304 name-extraction failures (91%) were this. Fixing it took
 * reach from 49.2% to 74.8% without moving deterministic top-1 accuracy
 * (88.6% -> 88.0%), which is the check that matters — a wider funnel that
 * admitted rubbish would have shown up as a drop there.
 */
test('a parallel citation between the name and the offset no longer hides the name', () => {
  assert.equal(
    nameBeforeCitation('A.P. Pollution Control Board v. Prof. M.V. Nayudu [1999] 1 SCR 235 :'),
    'A.P. Pollution Control Board v. Prof. M.V. Nayudu',
  );
  assert.equal(
    nameBeforeCitation('Selvi & Others v. State of Karnataka (2010) 7 SCC 263 :'),
    'Selvi & Others v. State of Karnataka',
  );
  // Year-first house style as the intervening citation.
  assert.equal(
    nameBeforeCitation('Narayanamurthy v. State of Karnataka 2008 (8) SCR 403 :'),
    'Narayanamurthy v. State of Karnataka',
  );
  // `Vs.` capitalised, `& Ors.` on both sides, `=` as the separator.
  assert.equal(
    nameBeforeCitation('Rabindranath Bose & Ors. Vs. The Union of India & Ors. 1970 (2) SCR 697 ='),
    'Rabindranath Bose & Ors. v. The Union of India & Ors.',
  );
});

/**
 * A SECOND, SEPARATE DEFECT found while fixing the first. The verb alternation
 * was `(?:v\.?|vs\.?|versus)` with **no case-insensitive flag**, so `Vs.` with
 * a capital V — the commonest form in Indian judgments — never matched at all.
 * The two defects compounded: a window had to survive both to yield a name.
 */
test('CAPITAL "Vs." IS THE COMMON INDIAN FORM and must extract', () => {
  assert.equal(
    nameBeforeCitation('State of Haryana Vs. Chandra Mani'),
    'State of Haryana v. Chandra Mani',
  );
  assert.equal(nameBeforeCitation('Union of India VS. Kamlesh'), 'Union of India v. Kamlesh');
  assert.equal(nameBeforeCitation('Ram Singh V/s State of Bihar'), 'Ram Singh v. State of Bihar');
  // The lowercase forms that already worked must keep working.
  assert.equal(nameBeforeCitation('Naushey Ali vs. State of U.P.'), 'Naushey Ali v. State of U.P.');
});

test('supplement volumes and AIR with a bracketed year are stripped too', () => {
  assert.equal(
    nameBeforeCitation('Kesavananda Bharati v. State of Kerala AIR (1986) SC 687;'),
    'Kesavananda Bharati v. State of Kerala',
  );
  assert.equal(
    nameBeforeCitation('Some Appellant v. Some Respondent 1962 Suppl. SCR 848'),
    'Some Appellant v. Some Respondent',
  );
});

test('stripping only ever shortens, and never invents a name', () => {
  // No case-name verb anywhere: 27 of the 304 failures are short forms like
  // this, and they must stay unresolved rather than be guessed at.
  assert.equal(nameBeforeCitation('approved in Ajay Hasia case [(1981) 2 SCR 79 :'), null);
  assert.equal(nameBeforeCitation('as held in paragraph 14 (2019) 4 SCC 221'), null);
  // Stripping a window that is ONLY a citation leaves nothing, not a fragment.
  assert.equal(stripTrailingCitations('(2019) 4 SCC 221'), '');
});

/* ────────────────────────────────────────────────────────── tokenizing ── */

test('stopwords common to almost every case title do not inflate similarity', () => {
  // "State of X" vs "State of Y" — sharing STATE/OF must not look like a match.
  const a = tokenizeName('State of Maharashtra v. Ramesh Kumar');
  const b = tokenizeName('State of Gujarat v. Suresh Patel');
  assert.ok(jaccardSimilarity(a, b) < 0.3, 'unrelated cases matched mostly on stopwords');
});

test('a real match keeps enough signal after stopword removal', () => {
  const a = tokenizeName('L. Hirday Narain v. Income Tax Officer');
  const b = tokenizeName('L. Hirday Narain versus Income Tax Officer, Bareilly');
  assert.ok(jaccardSimilarity(a, b) > 0.5, 'the same case, differently punctuated, scored too low');
});

test('empty input matches nothing, not everything', () => {
  assert.equal(jaccardSimilarity([], ['STATE']), 0);
  assert.equal(jaccardSimilarity([], []), 0);
});

/* ────────────────────────────────────────────────────── name extraction ── */

test('a real "v." window, read off the corpus shape', () => {
  const name = nameBeforeCitation('as held in L. Hirday Narain v. Income Tax Officer');
  assert.equal(name, 'L. Hirday Narain v. Income Tax Officer');
});

test('"vs." and "versus" both extract', () => {
  assert.ok(nameBeforeCitation('Naushey Ali vs. State of U.P.')?.includes('Naushey Ali'));
  assert.ok(
    nameBeforeCitation('Kesavananda Bharati versus State of Kerala')?.includes('Kesavananda'),
  );
});

test('no case name in the window returns null, never a guess', () => {
  assert.equal(nameBeforeCitation('as was held in the earlier proceedings'), null);
  assert.equal(nameBeforeCitation(''), null);
});

test('a bare "Vs" with an empty side is not a name', () => {
  // The exact malformed shape parties.ts found in 0.08% of real case_title values.
  assert.equal(nameBeforeCitation('Vs'), null);
});

/* ────────────────────────────────────────────────── candidate generation ── */

const POOL = [
  {
    id: 'a',
    caseTitle: 'L. HIRDAY NARAIN versus INCOME TAX OFFICER, BAREILLY',
    judgmentDate: '1970-11-04',
  },
  { id: 'b', caseTitle: 'STATE OF MAHARASHTRA versus RAMESH KUMAR', judgmentDate: '1970-06-01' },
  { id: 'c', caseTitle: 'L. HIRDAY NARAIN versus SOME OTHER PARTY', judgmentDate: '1985-01-01' },
];

test('candidate generation restricts to the year window', () => {
  // 'c' shares the name but is 15 years off — the same guard concordance.ts applies to SCR pairing.
  const ranked = rankCandidates('L. Hirday Narain v. Income Tax Officer', 1970, POOL);
  assert.ok(ranked.some((c) => c.judgmentId === 'a'));
  assert.ok(
    !ranked.some((c) => c.judgmentId === 'c'),
    'a candidate 15 years outside the window was not excluded',
  );
});

test('a name with no usable tokens generates no candidates', () => {
  assert.deepEqual(rankCandidates('', 1970, POOL), []);
  assert.deepEqual(rankCandidates('State of v.', 1970, POOL), []);
});

test('candidates are ranked highest similarity first', () => {
  const ranked = rankCandidates('L. Hirday Narain v. Income Tax Officer', 1970, POOL);
  assert.ok(ranked.length >= 1);
  assert.equal(ranked[0]!.judgmentId, 'a');
});

/* ────────────────────────────────────────────────────────── the prompt ── */

test('the prompt lists every candidate with an index the parser can validate against', () => {
  const candidates: Candidate[] = [
    { judgmentId: 'a', caseTitle: 'X versus Y', judgmentDate: '1970-01-01', jaccard: 0.8 },
    { judgmentId: 'b', caseTitle: 'X versus Z', judgmentDate: '1970-06-01', jaccard: 0.3 },
  ];
  const prompt = buildAdjudicationPrompt({
    citationText: 'AIR 1970 SC 100',
    citationKey: 'AIR1970SC100',
    contextEvidence: 'as held in X v. Y',
    candidates,
  });
  assert.match(prompt, /\[0\] id=a/);
  assert.match(prompt, /\[1\] id=b/);
  assert.match(prompt, /AIR 1970 SC 100/);
  assert.match(prompt, /impossible_to_determine/);
});

/* ────────────────────────────────────────────────────── response parsing ── */

const CANDS: Candidate[] = [
  { judgmentId: 'a', caseTitle: 'X versus Y', judgmentDate: '1970-01-01', jaccard: 0.8 },
  { judgmentId: 'b', caseTitle: 'X versus Z', judgmentDate: '1970-06-01', jaccard: 0.3 },
];

test('a well-formed selection parses and resolves the real judgment id', () => {
  const raw = JSON.stringify({
    decision: 'candidate_selected',
    candidate_index: 0,
    confidence: 'high',
    evidence: 'X v. Y is printed immediately before the citation',
    contradictions: null,
    signals_used: ['party_name_match', 'year_match'],
    needs_human_review: false,
    reason: 'Exact name and year match.',
  });
  const parsed = parseAdjudicationResponse(raw, CANDS);
  assert.ok(parsed);
  assert.equal(parsed.candidateId, 'a');
  assert.equal(parsed.confidence, 'high');
});

test('markdown code fences around the JSON are stripped', () => {
  const raw =
    '```json\n' +
    JSON.stringify({
      decision: 'none_of_candidates',
      candidate_index: null,
      confidence: 'medium',
      evidence: 'none of the candidates match the party names',
      contradictions: null,
      signals_used: [],
      needs_human_review: true,
      reason: 'No candidate shares a party name.',
    }) +
    '\n```';
  const parsed = parseAdjudicationResponse(raw, CANDS);
  assert.ok(parsed);
  assert.equal(parsed.decision, 'none_of_candidates');
  assert.equal(parsed.candidateId, null);
});

test('a hallucinated candidate_index (out of range) is refused, never guessed', () => {
  const raw = JSON.stringify({
    decision: 'candidate_selected',
    candidate_index: 5,
    confidence: 'high',
    evidence: 'x',
    contradictions: null,
    signals_used: [],
    needs_human_review: false,
    reason: 'x',
  });
  assert.equal(parseAdjudicationResponse(raw, CANDS), null);
});

test('a selection with no index at all is refused', () => {
  const raw = JSON.stringify({
    decision: 'candidate_selected',
    candidate_index: null,
    confidence: 'high',
    evidence: 'x',
    contradictions: null,
    signals_used: [],
    needs_human_review: false,
    reason: 'x',
  });
  assert.equal(parseAdjudicationResponse(raw, CANDS), null);
});

test('an internally contradictory response — non-selection carrying an index — is refused', () => {
  const raw = JSON.stringify({
    decision: 'none_of_candidates',
    candidate_index: 0,
    confidence: 'high',
    evidence: 'x',
    contradictions: null,
    signals_used: [],
    needs_human_review: false,
    reason: 'x',
  });
  assert.equal(parseAdjudicationResponse(raw, CANDS), null);
});

test('malformed JSON is refused, not partially trusted', () => {
  assert.equal(parseAdjudicationResponse('not json at all', CANDS), null);
  assert.equal(parseAdjudicationResponse('{"decision": "candidate_selected"', CANDS), null);
});

test('an unknown decision or confidence value is refused', () => {
  const raw = JSON.stringify({
    decision: 'yes_probably',
    candidate_index: 0,
    confidence: 'high',
    evidence: 'x',
    contradictions: null,
    signals_used: [],
    needs_human_review: false,
    reason: 'x',
  });
  assert.equal(parseAdjudicationResponse(raw, CANDS), null);
});

/* ─────────────────────────────────────────────────────── confidence tier ── */

function decision(overrides: Partial<AdjudicationDecision>): AdjudicationDecision {
  return {
    decision: 'candidate_selected',
    candidateId: 'a',
    confidence: 'high',
    evidence: 'e',
    contradictions: null,
    signalsUsed: [],
    needsHumanReview: false,
    reason: 'r',
    ...overrides,
  };
}

test('HIGH requires model-high, deterministic agreement, and a clear gap', () => {
  const cands: Candidate[] = [
    { judgmentId: 'a', caseTitle: 'x', judgmentDate: '1970', jaccard: 0.9 },
    { judgmentId: 'b', caseTitle: 'y', judgmentDate: '1970', jaccard: 0.3 },
  ];
  assert.equal(resolveConfidenceTier(decision({}), cands), 'high');
});

test('a thin gap over the same top candidate drops to MEDIUM, not HIGH', () => {
  const cands: Candidate[] = [
    { judgmentId: 'a', caseTitle: 'x', judgmentDate: '1970', jaccard: 0.5 },
    { judgmentId: 'b', caseTitle: 'y', judgmentDate: '1970', jaccard: 0.48 },
  ];
  assert.equal(resolveConfidenceTier(decision({}), cands), 'medium');
});

test('the model disagreeing with the deterministic top candidate is LOW, never HIGH', () => {
  const cands: Candidate[] = [
    { judgmentId: 'a', caseTitle: 'x', judgmentDate: '1970', jaccard: 0.9 },
    { judgmentId: 'b', caseTitle: 'y', judgmentDate: '1970', jaccard: 0.2 },
  ];
  assert.equal(resolveConfidenceTier(decision({ candidateId: 'b' }), cands), 'low');
});

test('any stated contradiction forces AMBIGUOUS regardless of confidence', () => {
  const cands: Candidate[] = [
    { judgmentId: 'a', caseTitle: 'x', judgmentDate: '1970', jaccard: 0.9 },
  ];
  assert.equal(
    resolveConfidenceTier(decision({ contradictions: 'the year printed does not match' }), cands),
    'ambiguous',
  );
});

test('none_of_candidates and impossible_to_determine are both UNRESOLVED', () => {
  const cands: Candidate[] = [
    { judgmentId: 'a', caseTitle: 'x', judgmentDate: '1970', jaccard: 0.9 },
  ];
  assert.equal(
    resolveConfidenceTier(decision({ decision: 'none_of_candidates', candidateId: null }), cands),
    'unresolved',
  );
  assert.equal(
    resolveConfidenceTier(
      decision({ decision: 'impossible_to_determine', candidateId: null }),
      cands,
    ),
    'unresolved',
  );
});

/* ─────────────────────────────────────────────────────────────── hashing ── */

test('the input hash is stable under candidate reordering — the SET is the cache key', () => {
  const a: Candidate[] = [
    { judgmentId: 'x', caseTitle: '', judgmentDate: '', jaccard: 0.5 },
    { judgmentId: 'y', caseTitle: '', judgmentDate: '', jaccard: 0.3 },
  ];
  const b: Candidate[] = [a[1]!, a[0]!];
  const h1 = adjudicationInputHash({
    citationText: 't',
    citationKey: 'k',
    contextEvidence: 'e',
    candidates: a,
  });
  const h2 = adjudicationInputHash({
    citationText: 't',
    citationKey: 'k',
    contextEvidence: 'e',
    candidates: b,
  });
  assert.equal(h1, h2);
});

test('a different evidence snippet changes the hash — the cache must not conflate two sightings', () => {
  const cands: Candidate[] = [{ judgmentId: 'x', caseTitle: '', judgmentDate: '', jaccard: 0.5 }];
  const h1 = adjudicationInputHash({
    citationText: 't',
    citationKey: 'k',
    contextEvidence: 'e1',
    candidates: cands,
  });
  const h2 = adjudicationInputHash({
    citationText: 't',
    citationKey: 'k',
    contextEvidence: 'e2',
    candidates: cands,
  });
  assert.notEqual(h1, h2);
});
