/**
 * The tests that matter here are the REFUSALS. A pipeline that accepts a
 * hallucinated judge name produces fluent, plausible, wrong metadata that
 * nobody can spot downstream — so every test below asserts that an ungrounded
 * claim is rejected, not that a good one is accepted.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type Claim,
  claimsFromArguments,
  claimsFromAuthorities,
  claimsFromCaseStructure,
  claimsFromCitations,
  claimsFromHolding,
  claimsFromMetadata,
  claimsFromTopics,
  claimsFromTreatment,
  enrichmentInputHash,
  parseJson,
  verificationState,
  verifyClaims,
} from './enrich.ts';

const SOURCE = `IN THE SUPREME COURT OF INDIA
CRIMINAL APPELLATE JURISDICTION
Criminal Appeal No. 462 of 2018
SATPAL SINGH versus THE STATE OF PUNJAB
MARCH 27, 2018
[KURIAN JOSEPH, MOHAN M. SHANTANAGOUDAR AND NAVIN SINHA, JJ.]
This Court in Kesavananda Bharati v. State of Kerala (1973) 4 SCC 225 held
that the basic structure could not be abrogated.`;

/* --------------------------------------------------------------- parsing -- */

test('a fenced JSON block parses despite the instruction not to fence it', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
});

test('prose around the object is recovered once, and never coerced twice', () => {
  assert.deepEqual(parseJson('Here you go: {"a":1} hope that helps'), { a: 1 });
  assert.equal(parseJson('no object at all'), null);
  assert.equal(parseJson('{ broken '), null);
});

/* ---------------------------------------------------------- verification -- */

test('a real span containing the claimed value verifies', () => {
  const claims: Claim[] = [
    {
      value: '(1973) 4 SCC 225',
      evidence: 'Kesavananda Bharati v. State of Kerala (1973) 4 SCC 225',
      kind: 'citation',
    },
  ];
  const [v] = verifyClaims(claims, SOURCE);
  assert.equal(v!.verified, true, v!.reason ?? '');
});

test('OCR NEWLINES DO NOT DEFEAT VERIFICATION — whitespace is the only normalisation', () => {
  // The source wraps "held\nthat"; a model copying the sentence cannot know that.
  const claims: Claim[] = [
    {
      value: 'basic structure',
      evidence: 'held that the basic structure could not be abrogated',
      kind: 'citation',
    },
  ];
  assert.equal(verifyClaims(claims, SOURCE)[0]!.verified, true);
});

test('A FABRICATED SPAN IS REJECTED — this is the whole safety property', () => {
  const claims: Claim[] = [
    {
      value: '(1999) 2 SCC 718',
      evidence: 'This Court in A.P. Pollution Control Board (1999) 2 SCC 718 observed',
      kind: 'citation',
    },
  ];
  const [v] = verifyClaims(claims, SOURCE);
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /not found in source/);
});

test('a claim with no evidence at all is rejected, however plausible', () => {
  // Kesavananda IS in the source — but an unevidenced claim still fails, because
  // the evidence requirement is what makes the rest of the pipeline checkable.
  const [v] = verifyClaims(
    [{ value: '(1973) 4 SCC 225', evidence: null, kind: 'citation' }],
    SOURCE,
  );
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /no evidence span/);
});

test('a trivially short span cannot be used to "prove" anything', () => {
  const [v] = verifyClaims([{ value: 'J.', evidence: 'JJ.', kind: 'judge' }], SOURCE);
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /shorter than/);
});

test('A REAL SPAN QUOTED TO SUPPORT AN UNRELATED VALUE IS REJECTED', () => {
  // The span is genuinely in the document. The judge name is not. Without this
  // check, any real sentence would "verify" any invented value pinned to it.
  const claims: Claim[] = [
    { value: 'RANJAN GOGOI', evidence: 'CRIMINAL APPELLATE JURISDICTION', kind: 'judge' },
  ];
  const [v] = verifyClaims(claims, SOURCE);
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /not present in source|does not contain/);
});

/**
 * The corpus prints coram lines in capitals and the prompt tells the model to
 * strip honorifics, so a correct answer comes back re-cased. Byte-exact
 * comparison rejected 7 of 41 correct claims in the first real pilot.
 */
test('CASE FOLDING accepts a correctly re-cased name...', () => {
  const source = 'CORAM: HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA\nORAL JUDGMENT';
  const claims: Claim[] = [
    {
      value: 'Rajesh Kumar Verma',
      evidence: 'HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA',
      kind: 'judge',
    },
  ];
  assert.equal(verifyClaims(claims, source)[0]!.verified, true);
});

test('...and STILL rejects a fabricated name in any casing — folding is not fuzzing', () => {
  const source = 'CORAM: HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA\nORAL JUDGMENT';
  for (const value of ['Ranjan Gogoi', 'RANJAN GOGOI', 'ranjan gogoi']) {
    const claims: Claim[] = [
      { value, evidence: 'HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA', kind: 'judge' },
    ];
    assert.equal(verifyClaims(claims, source)[0]!.verified, false, `${value} was accepted`);
  }
  // A near-miss must fail too: one wrong word is a different judge, not a typo
  // to be forgiven. No edit-distance tolerance is applied anywhere.
  const near: Claim[] = [
    {
      value: 'Rajesh Kumar Sharma',
      evidence: 'HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA',
      kind: 'judge',
    },
  ];
  assert.equal(verifyClaims(near, source)[0]!.verified, false);
});

test('a real judge, evidenced by the coram line, verifies', () => {
  const claims: Claim[] = [
    {
      value: 'NAVIN SINHA',
      evidence: '[KURIAN JOSEPH, MOHAN M. SHANTANAGOUDAR AND NAVIN SINHA, JJ.]',
      kind: 'judge',
    },
  ];
  assert.equal(verifyClaims(claims, SOURCE)[0]!.verified, true);
});

test('treatment is exempt from the value-inside-span rule, and correctly so', () => {
  // "followed" is a LABEL for what the span says, not a substring of it. Every
  // treatment claim would otherwise be rejected for not containing its own name.
  const claims: Claim[] = [
    {
      value: 'followed',
      evidence: 'This Court in Kesavananda Bharati v. State of Kerala',
      kind: 'treatment',
    },
  ];
  assert.equal(verifyClaims(claims, SOURCE)[0]!.verified, true);
  // But its span must still be real.
  const bad: Claim[] = [
    {
      value: 'overruled',
      evidence: 'we hereby overrule that decision entirely',
      kind: 'treatment',
    },
  ];
  assert.equal(verifyClaims(bad, SOURCE)[0]!.verified, false);
});

/* ----------------------------------------------------------- claim shapes -- */

test('an empty answer is a valid answer, not a parse failure', () => {
  assert.deepEqual(claimsFromCitations({ citations: [] }), []);
  assert.equal(verificationState([]), 'unverified');
});

test('malformed rows are skipped rather than half-read', () => {
  const claims = claimsFromCitations({
    citations: [{ citation: '' }, { nope: 1 }, { citation: '(1973) 4 SCC 225', evidence: 'x' }],
  });
  assert.equal(claims.length, 1);
});

test('an invented relationship value is refused, not mapped to the nearest one', () => {
  assert.deepEqual(claimsFromTreatment({ relationship: 'obliterated', evidence: 'x' }), []);
  assert.equal(claimsFromTreatment({ relationship: 'overruled_in_part', evidence: 'x' }).length, 1);
});

test('metadata claims carry their own kind so verification can differ per field', () => {
  const claims = claimsFromMetadata({
    judges: [{ name: 'NAVIN SINHA', evidence: 'AND NAVIN SINHA, JJ.' }],
    neutral_citation: { value: '2018 INSC 277', evidence: 'reported as 2018 INSC 277' },
    case_number: { value: null, evidence: null },
  });
  assert.deepEqual(
    claims.map((c) => c.kind),
    ['judge', 'neutral_citation'],
  );
});

test('mixed outcomes report as partial, so a half-good answer is never "verified"', () => {
  const claims: Claim[] = [
    {
      value: 'NAVIN SINHA',
      evidence: '[KURIAN JOSEPH, MOHAN M. SHANTANAGOUDAR AND NAVIN SINHA, JJ.]',
      kind: 'judge',
    },
    { value: 'RANJAN GOGOI', evidence: "Hon'ble Mr. Justice Ranjan Gogoi presided", kind: 'judge' },
  ];
  assert.equal(verificationState(verifyClaims(claims, SOURCE)), 'partial');
});

/* -------------------------------------------------------------- idempotency -- */

test('the input hash changes with the prompt version, so a reworded prompt re-runs', () => {
  const a = enrichmentInputHash('metadata', 'v1', 'text');
  const b = enrichmentInputHash('metadata', 'v2', 'text');
  const c = enrichmentInputHash('treatment', 'v1', 'text');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(a, enrichmentInputHash('metadata', 'v1', 'text'));
});

/* --------------------------------- the structured legal object (0051) ----- */

/**
 * The whole safety argument for these five tasks is one sentence: the model's
 * QUOTE is the claim value, so a fabricated passage fails `verifyClaims` at
 * full strength rather than needing a new entry in `LABEL_KINDS`. Every test
 * below exists to hold that sentence true.
 */

const JUDGMENT = `IN THE HIGH COURT OF DELHI AT NEW DELHI
The appellant assails the judgment of conviction dated 12.03.2019 passed by the
learned Additional Sessions Judge. The prosecution case is that on 4 January
2017 the complainant delivered a cheque which was returned unpaid.
Learned counsel for the appellant contends that the statutory notice was never
served upon his client. We are unable to accept that contention. In our
considered view the notice was validly served and the conviction calls for no
interference. The appeal is accordingly dismissed.`;

test('a quoted fact is verified, and the model gloss is carried but never checked', () => {
  const claims = claimsFromCaseStructure({
    facts: [
      {
        quote: 'on 4 January 2017 the complainant delivered a cheque which was returned unpaid',
        label: 'dishonoured cheque delivered',
      },
    ],
  });
  assert.equal(claims.length, 1);
  assert.equal(claims[0]!.kind, 'fact');
  // The quote is BOTH the value and the evidence. That is the design.
  assert.equal(claims[0]!.value, claims[0]!.evidence);
  assert.equal(claims[0]!.extra?.['label'], 'dishonoured cheque delivered');

  const [verdict] = verifyClaims(claims, JUDGMENT);
  assert.equal(verdict!.verified, true);
});

test('a fabricated quote is REJECTED even though it reads like this judgment', () => {
  // Plausible, on-topic, in the right register, and nowhere in the text.
  const claims = claimsFromHolding({
    holdings: [
      {
        quote: 'we hold that the statutory notice was never served and the conviction is set aside',
        label: 'conviction set aside for want of notice',
      },
    ],
  });
  const [verdict] = verifyClaims(claims, JUDGMENT);
  assert.equal(verdict!.verified, false);
  assert.equal(verdict!.reason, 'evidence span not found in source text');
});

test('a summarised holding is rejected — paraphrase cannot substitute for a quote', () => {
  const claims = claimsFromHolding({
    holdings: [{ quote: 'The court dismissed the appeal.', label: 'appeal dismissed' }],
  });
  const [verdict] = verifyClaims(claims, JUDGMENT);
  // The judgment says "The appeal is accordingly dismissed", not this.
  assert.equal(verdict!.verified, false);
});

test('a real quote lifted from the wrong judgment is rejected', () => {
  const claims = claimsFromCaseStructure({
    issues: [
      {
        quote: 'whether the plaintiff is entitled to specific performance',
        label: 'specific performance',
      },
    ],
  });
  const [verdict] = verifyClaims(claims, JUDGMENT);
  assert.equal(verdict!.verified, false);
});

/**
 * The three tests below guard the 15 Aug 2026 change that made the EVIDENCE
 * SPAN check case-insensitive, matching the value check beside it. The first
 * shows what it buys; the second and third are the ones that matter — folding
 * must not admit anything a case-sensitive test refused on CONTENT.
 */
test('CASE FOLDING ON THE SPAN accepts a prayer the court printed in capitals', () => {
  const capitals =
    'THIS WRIT PETITION IS FILED UNDER ARTICLE 226 OF THE CONSTITUTION OF INDIA, PRAYING TO QUASH THE PROCEEDINGS.';
  const claims = claimsFromCaseStructure({
    relief_sought: [
      {
        quote: 'This Writ Petition is filed under Article 226 of the Constitution of India',
        label: 'writ',
      },
    ],
  });
  const [verdict] = verifyClaims(claims, capitals);
  assert.equal(verdict!.verified, true);
});

test('...and a FABRICATED span is still rejected in every casing', () => {
  for (const q of [
    'the appellant was awarded compensation of Rs. 15,00,000 with interest',
    'THE APPELLANT WAS AWARDED COMPENSATION OF RS. 15,00,000 WITH INTEREST',
    'The Appellant Was Awarded Compensation Of Rs. 15,00,000 With Interest',
  ]) {
    const [verdict] = verifyClaims(
      claimsFromCaseStructure({ facts: [{ quote: q, label: 'award' }] }),
      JUDGMENT,
    );
    assert.equal(verdict!.verified, false, `folding admitted a fabrication cased as: ${q}`);
  }
});

test('...and a real span from ANOTHER judgment is still rejected in every casing', () => {
  const elsewhere = 'whether the plaintiff is entitled to specific performance';
  for (const q of [elsewhere, elsewhere.toUpperCase()]) {
    const [verdict] = verifyClaims(
      claimsFromCaseStructure({ issues: [{ quote: q, label: 'issue' }] }),
      JUDGMENT,
    );
    assert.equal(verdict!.verified, false, `folding admitted a foreign span cased as: ${q}`);
  }
});

test('arguments keep the side the judgment itself used', () => {
  const claims = claimsFromArguments({
    petitioner: [
      {
        quote:
          'Learned counsel for the appellant contends that the statutory notice was never served',
        label: 'no service of statutory notice',
        side: 'appellant',
      },
    ],
    respondent: [],
  });
  assert.equal(claims.length, 1);
  assert.equal(claims[0]!.kind, 'argument_petitioner');
  assert.equal(claims[0]!.extra?.['side'], 'appellant');
  assert.equal(verifyClaims(claims, JUDGMENT)[0]!.verified, true);
});

test('an authority name is carried in extra and is NOT what gets verified', () => {
  const claims = claimsFromAuthorities({
    authorities: [
      {
        // A real Supreme Court case, deliberately one this judgment never names.
        name: 'K.K. Verma v. Union of India',
        quote: 'We are unable to accept that contention',
        proposition: 'contention rejected',
      },
    ],
  });
  assert.equal(claims[0]!.kind, 'authority_relied_on');
  assert.equal(claims[0]!.extra?.['name'], 'K.K. Verma v. Union of India');
  // The QUOTE is in the text, so the claim verifies — and the unverified case
  // name rides along in extra where nothing may promote it. This asymmetry is
  // deliberate and is why resolving a name to a judgment id stays with
  // citations.ts rather than happening here.
  assert.equal(verifyClaims(claims, JUDGMENT)[0]!.verified, true);
});

test('a topic label is free-form but its anchoring quote still has to exist', () => {
  const good = claimsFromTopics({
    topics: [{ quote: 'a cheque which was returned unpaid', label: 'dishonour of cheque' }],
    search_concepts: [],
  });
  assert.equal(verifyClaims(good, JUDGMENT)[0]!.verified, true);

  const bad = claimsFromTopics({
    topics: [
      {
        quote: 'a promissory note executed in favour of the plaintiff',
        label: 'dishonour of cheque',
      },
    ],
  });
  assert.equal(verifyClaims(bad, JUDGMENT)[0]!.verified, false);
});

test('a missing or empty quote yields no claim at all, rather than an unverifiable one', () => {
  assert.deepEqual(claimsFromCaseStructure({ facts: [{ label: 'no quote offered' }] }), []);
  assert.deepEqual(claimsFromCaseStructure({ facts: [{ quote: '   ', label: 'blank' }] }), []);
  assert.deepEqual(claimsFromHolding({ holdings: 'not an array' }), []);
  assert.deepEqual(claimsFromTopics(null), []);
});

test('a two-word "quote" is rejected on length before it can match anything', () => {
  const claims = claimsFromCaseStructure({ facts: [{ quote: 'the appeal', label: 'short' }] });
  const [verdict] = verifyClaims(claims, JUDGMENT);
  assert.equal(verdict!.verified, false);
  assert.match(verdict!.reason!, /shorter than/);
});

test('none of the five new kinds is a LABEL_KIND — they all take the full check', () => {
  // If someone adds one of these to LABEL_KINDS to make a run look better, the
  // fabricated-quote test above would still fail, but this asserts the intent
  // directly: a fabricated span is rejected for EVERY new kind, not just holding.
  const fabricated = 'this sentence appears nowhere in the judgment whatsoever';
  for (const claims of [
    claimsFromCaseStructure({ facts: [{ quote: fabricated, label: 'x' }] }),
    claimsFromHolding({ reasoning: [{ quote: fabricated, label: 'x' }] }),
    claimsFromArguments({ respondent: [{ quote: fabricated, label: 'x', side: 'State' }] }),
    claimsFromAuthorities({
      provisions: [{ provision: 's. 138', quote: fabricated, proposition: 'x' }],
    }),
    claimsFromTopics({ search_concepts: [{ quote: fabricated, label: 'x' }] }),
  ]) {
    assert.equal(claims.length, 1, 'the claim should be produced');
    assert.equal(verifyClaims(claims, JUDGMENT)[0]!.verified, false);
  }
});
