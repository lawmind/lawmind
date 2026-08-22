/**
 * Every accepted fixture is a real string from the corpus.
 *
 * The asymmetry: a MISSED section reference means one search returns fewer
 * results. A WRONG one files a Negotiable Instruments case under the criminal
 * procedure code, so `section:138 act:"CrPC"` returns a cheque-bouncing case and
 * the advocate cannot tell why. The refusals below outnumber the acceptances.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalAct, extractSectionRefs, foldSectionRefs } from './sections.ts';

const one = (text: string) => extractSectionRefs(text)[0];

/* ──────────────────────────── real forms, accepted ── */

test('the abbreviated form advocates actually write', () => {
  const r = one('taking cognizance of the complaint u/s.138 of the NI Act, even before the delay');
  assert.equal(r?.section, '138');
  assert.equal(r?.actNamed, 'Negotiable Instruments Act, 1881');
});

test('the full act name, with its year', () => {
  const r = one('filed a complaint under s.138 of the Negotiable Instruments Act, 1881 in the Court');
  assert.equal(r?.section, '138');
  assert.match(r!.actNamed, /Negotiable Instruments Act, 1881/);
});

test('a Code, not an Act', () => {
  const r = one('In view of the provisions of Section 317 of the Code of Criminal Procedure, 1973, the Court');
  assert.equal(r?.section, '317');
  assert.match(r!.actNamed, /Code of Criminal Procedure/);
});

test('spaced and stopped abbreviations survive the scanner', () => {
  // `N. I. Act` and `NI Act` are the same act; a scanned corpus produces both.
  for (const t of ['s. 138 of N. I. Act', 's.138 of NI Act', 's.138 of N.I. Act']) {
    assert.equal(one(t)?.actNamed, 'Negotiable Instruments Act, 1881', `missed: ${t}`);
  }
});

test('a suffixed section number keeps its letter — 302A is not 302', () => {
  assert.equal(one('under Section 302A of the Indian Penal Code')?.section, '302A');
});

test('a sub-clause is NOT split out', () => {
  // An advocate searching `section 3` expects judgments on section 3. Indexing
  // `3(1)(b)` separately would make the common search miss most of them.
  const r = one('Section 3(1)(b) of the Punjab Municipal Act, 1911 defines annual value');
  assert.equal(r?.section, '3');
  assert.match(r!.actNamed, /Punjab Municipal Act, 1911/);
});

test('THE NEW CODES ARE RECOGNISED — they replaced the old ones on 1 July 2024', () => {
  assert.equal(one('under section 103 BNS')?.actNamed, 'Bharatiya Nyaya Sanhita, 2023');
  assert.equal(one('under section 173 BNSS')?.actNamed, 'Bharatiya Nagarik Suraksha Sanhita, 2023');
  assert.equal(one('under section 61 BSA')?.actNamed, 'Bharatiya Sakshya Adhiniyam, 2023');
});

test('BNSS is matched before BNS — the longer name first, or every BNSS is a BNS', () => {
  assert.equal(one('s.173 BNSS')?.actNamed, 'Bharatiya Nagarik Suraksha Sanhita, 2023');
});

/* ──────────────────────────────── the refusals ── */

test('A BARE SECTION WITH NO ACT IS NOT RECORDED', () => {
  /**
   * The rule the whole module turns on. In this corpus a bare "section 5" is as
   * likely to be a clause of a contract or a rule of a scheme as a statutory
   * provision, and a guessed default act would put confident wrong rows into
   * the index — worse than an empty index, because an empty one is visibly
   * empty.
   */
  assert.deepEqual(extractSectionRefs('the requirements of section 5 were not satisfied'), []);
  assert.deepEqual(extractSectionRefs('exercise of power u/s 482 is not made out'), []);
});

test('THE NEARER ACT WINS when a sentence names two', () => {
  // Real: "s. 138 of N. I. Act r/w s.357(3) CrPC". Taking the later act would
  // file a cheque-bouncing case under the criminal procedure code.
  const refs = extractSectionRefs('s. 138 of N. I. Act r/w s.357(3) CrPC - Dishonour of cheque');
  const s138 = refs.find((r) => r.section === '138');
  const s357 = refs.find((r) => r.section === '357');
  assert.equal(s138?.actNamed, 'Negotiable Instruments Act, 1881');
  assert.equal(s357?.actNamed, 'Code of Criminal Procedure, 1973');
});

test('an act mentioned in a DIFFERENT CLAUSE does not attach', () => {
  // Nothing introduces the act — no "of", no "under" — so the two are unrelated
  // and pairing them would be proximity masquerading as a statement.
  assert.deepEqual(
    extractSectionRefs('section 5 was pleaded; the Court held that the Companies Act applied'),
    [],
  );
});

test('a section number with no act anywhere near is refused', () => {
  const far = `section 12 ${'padding words here '.repeat(8)} of the Companies Act`;
  assert.deepEqual(extractSectionRefs(far), []);
});

test('ordinary prose containing the word section is not a reference', () => {
  assert.deepEqual(extractSectionRefs('the cross-section of society was considered'), []);
  assert.deepEqual(extractSectionRefs('in this section of the judgment we turn to'), []);
});

/* ──────────────────────────────────── folding ── */

test('repeated sightings become ONE row with a count', () => {
  const refs = extractSectionRefs(
    'complaint u/s.138 of the NI Act. Later, s.138 of the NI Act again. And s.138 of NI Act.',
  );
  const folded = foldSectionRefs(refs);
  assert.equal(folded.length, 1, 'the same provision produced more than one row');
  assert.equal(folded[0]!.occurrences, 3);
  assert.equal(folded[0]!.section, '138');
});

test('different acts with the same section number stay separate', () => {
  const folded = foldSectionRefs([
    { section: '138', actNamed: 'Negotiable Instruments Act, 1881', offset: 0 },
    { section: '138', actNamed: 'Companies Act', offset: 50 },
  ]);
  assert.equal(folded.length, 2, 'two different acts were merged into one provision');
});

test('nothing in, nothing out', () => {
  assert.deepEqual(extractSectionRefs(''), []);
  assert.deepEqual(foldSectionRefs([]), []);
});

/* ──────────────────────── one act, one key ── */

test('THE SAME ACT UNDER SEVERAL NAMES COLLAPSES TO ONE KEY', () => {
  /**
   * Measured on the first full scan, before anything was written: `Indian Penal
   * Code, 1860` 10,677 times and `Indian Penal Code` 3,300; `Code of Criminal
   * Procedure, 1973` 9,895, `Code of Criminal Procedure` 3,062 and `Criminal
   * Procedure Code` 1,426. Without this an advocate asking for CrPC s.482 sees
   * a third of the cases and has no way to know.
   */
  const ipc = ['Indian Penal Code, 1860', 'Indian Penal Code', 'The Indian Penal Code, 1860', 'Penal Code'];
  assert.equal(new Set(ipc.map(canonicalAct)).size, 1, `IPC did not collapse: ${ipc.map(canonicalAct)}`);

  const crpc = ['Code of Criminal Procedure, 1973', 'Code of Criminal Procedure', 'Criminal Procedure Code'];
  assert.equal(new Set(crpc.map(canonicalAct)).size, 1, `CrPC did not collapse: ${crpc.map(canonicalAct)}`);

  const cpc = ['Code of Civil Procedure, 1908', 'Code of Civil Procedure', 'Civil Procedure Code'];
  assert.equal(new Set(cpc.map(canonicalAct)).size, 1);
});

test('CRIMINAL AND CIVIL PROCEDURE MUST NOT COLLAPSE INTO EACH OTHER', () => {
  // Merging two different statutes returns the WRONG law; failing to merge two
  // spellings returns less of the right law. Only the first is unacceptable.
  assert.notEqual(canonicalAct('Code of Criminal Procedure, 1973'), canonicalAct('Code of Civil Procedure, 1908'));
});

test('an act not in the synonym list keeps its own cleaned name', () => {
  assert.equal(canonicalAct('The Land Acquisition Act, 1894'), 'LAND ACQUISITION ACT');
  assert.equal(canonicalAct('Land Acquisition Act'), 'LAND ACQUISITION ACT');
  // Two genuinely different acts stay apart.
  assert.notEqual(canonicalAct('Companies Act, 2013'), canonicalAct('Contract Act, 1872'));
});

test('the new codes keep distinct keys from the ones they replaced', () => {
  // BNS replaced the IPC on 1 July 2024. They are different statutes with
  // different numbering, and a search for one must never return the other.
  assert.notEqual(canonicalAct('Bharatiya Nyaya Sanhita, 2023'), canonicalAct('Indian Penal Code, 1860'));
});

/**
 * The defect this asserts against, found 22 Aug 2026 by probing the real
 * search API: `canonicalAct('BNS')` returned the string `BNS`, while extraction
 * had written `act_key = 'BHARATIYA NYAYA SANHITA'` for all 20,440 BNS
 * references in the corpus. `act:BNS` therefore matched nothing and said so
 * silently — the exact shape of failure `CLAUDE.md` names for BNS/BNSS/BSA.
 *
 * It is asserted as an INVARIANT BETWEEN THE TWO TABLES rather than as three
 * hardcoded strings: every abbreviation this module knows how to expand must
 * canonicalise to the same key as the title it expands to. A fourth
 * abbreviation added to one table and forgotten in the other now fails here
 * instead of in production.
 */
test('every abbreviation canonicalises to the same key as the act it expands to', () => {
  const pairs: readonly [string, string][] = [
    ['IPC', 'Indian Penal Code, 1860'],
    ['CrPC', 'Code of Criminal Procedure, 1973'],
    ['CPC', 'Code of Civil Procedure, 1908'],
    ['NI Act', 'Negotiable Instruments Act, 1881'],
    ['Evidence Act', 'Indian Evidence Act, 1872'],
    ['BNS', 'Bharatiya Nyaya Sanhita, 2023'],
    ['BNSS', 'Bharatiya Nagarik Suraksha Sanhita, 2023'],
    ['BSA', 'Bharatiya Sakshya Adhiniyam, 2023'],
  ];
  for (const [abbreviation, title] of pairs) {
    assert.equal(
      canonicalAct(abbreviation),
      canonicalAct(title),
      `${abbreviation} does not reach the same act_key as "${title}" — a search for it would match nothing`,
    );
  }
});

/**
 * `Bhartiya` is how several High Courts print `Bharatiya`. Same word, same
 * title, same statute — 2,857 references in the corpus under the variant. A
 * spelling merge, which this table exists for; not a statute merge, which it
 * forbids.
 */
test('the Bhartiya/Bharatiya transliteration variant is one key', () => {
  assert.equal(
    canonicalAct('Bhartiya Nagarik Suraksha Sanhita, 2023'),
    canonicalAct('Bharatiya Nagarik Suraksha Sanhita, 2023'),
  );
});

/**
 * The transliteration tail, and — more importantly — what must NOT be swept
 * into it.
 *
 * The courts spell these three titles 498 different ways in this corpus. The
 * rules match on the ending bigram that identifies the statute, which recovers
 * 5,493 references the full-title patterns missed. The risk that buys is
 * over-merging, so the refusals are asserted first: a state security Act and a
 * revenue Sanhita share a word with these codes and are different law.
 */
test('the 2023 codes absorb their transliteration variants', () => {
  const bnss = canonicalAct('Bharatiya Nagarik Suraksha Sanhita, 2023');
  for (const variant of [
    'Bhartiya Nagrik Suraksha Sanhita',
    'Bharatiya Nagarika Suraksha Sanhita',
    'Bharatiya Nagarik Suraksha Sanhita Act',
    'BNSS',
  ]) {
    assert.equal(canonicalAct(variant), bnss, `${variant} did not reach the BNSS key`);
  }
  const bns = canonicalAct('Bharatiya Nyaya Sanhita, 2023');
  for (const variant of ['Bhartiya Nyaya Sanhita', 'Bharatiya Nyay Sanhita', 'BNS']) {
    assert.equal(canonicalAct(variant), bns, `${variant} did not reach the BNS key`);
  }
});

test('acts that merely share a word with the 2023 codes stay separate', () => {
  const bnss = canonicalAct('Bharatiya Nagarik Suraksha Sanhita, 2023');
  const bsa = canonicalAct('Bharatiya Sakshya Adhiniyam, 2023');
  // Ends in ADHINIYAM, not SANHITA — a Madhya Pradesh state security Act.
  assert.notEqual(canonicalAct('Madhya Pradesh Rajya Suraksha Adhiniyam'), bnss);
  assert.notEqual(canonicalAct('Madhya Pradesh Rajya Suraksha Adhiniyam'), bsa);
  // Ends in SANHITA but is a revenue code, not a criminal procedure code.
  assert.notEqual(canonicalAct('Uttar Pradesh Rajaswa Sanhita'), bnss);
  assert.notEqual(canonicalAct('Chhattisgarh Panchayat Raj Adhiniyam'), bsa);
});
