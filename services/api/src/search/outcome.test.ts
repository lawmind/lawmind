import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveRetrievalOutcome,
  mayGenerateFrom,
  SEMANTIC_INDEX_SUFFICIENT,
  type RetrievalOutcomeInput,
} from './outcome.ts';

/** Everything ran, nothing was withheld. Overridden per case. */
function base(over: Partial<RetrievalOutcomeInput> = {}): RetrievalOutcomeInput {
  return {
    resultCount: 5,
    degradedArms: [],
    semanticAvailable: true,
    semanticIndexSufficient: true,
    ...over,
  };
}

describe('the empty screen that says "there is no law on this"', () => {
  /**
   * NEW3, bus 1141, reproduced against the real route: `anticipatory bail`
   * returns an EMPTY 200 by design. `bail` is 0.2577 of the sampled corpus
   * against a 0.05 document-frequency ceiling, so the sparse arm refuses before
   * ranking — correctly, that match set is the OOM shape. The dense arm is
   * supposed to answer instead and could not.
   *
   * Two of the commonest searches in Indian criminal practice, and the advocate
   * is shown a blank page. This is the case the whole file exists for.
   */
  it('refusing to rank an unbounded match set is coverage_unknown, NEVER an answer', () => {
    const outcome = deriveRetrievalOutcome(
      base({ resultCount: 0, degradedArms: ['sparse_unbounded'], semanticAvailable: false }),
    );
    assert.equal(outcome.state, 'coverage_unknown');
    assert.ok(outcome.reasons.includes('sparse_unbounded'));
    assert.notEqual(outcome.state, 'abstained');
    assert.notEqual(outcome.state, 'answered');
  });

  it('distinguishes "we looked and found nothing" from "we did not look"', () => {
    const looked = deriveRetrievalOutcome(base({ resultCount: 0 }));
    const didNot = deriveRetrievalOutcome(
      base({ resultCount: 0, degradedArms: ['sparse_unbounded'] }),
    );

    assert.equal(looked.state, 'abstained');
    assert.ok(looked.reasons.includes('low_relevance'));

    assert.equal(didNot.state, 'coverage_unknown');
    assert.ok(!didNot.reasons.includes('low_relevance'));

    // The distinction RCC could not make from the wire (bus 1128).
    assert.notEqual(looked.state, didNot.state);
  });

  it('a timeout on zero results is coverage_unknown, not an empty answer', () => {
    const outcome = deriveRetrievalOutcome(
      base({ resultCount: 0, degradedArms: ['sparse_timeout'] }),
    );
    assert.equal(outcome.state, 'coverage_unknown');
    assert.ok(outcome.reasons.includes('timeout'));
  });
});

describe('a required capability arm that never ran', () => {
  it('is coverage_unknown, not an abstention claiming that we searched', () => {
    const outcome = deriveRetrievalOutcome(
      base({
        resultCount: 0,
        degradedArms: ['party_name_disabled'],
        semanticAvailable: true,
        semanticIndexSufficient: true,
      }),
    );

    assert.equal(outcome.state, 'coverage_unknown');
    assert.deepEqual(outcome.reasons, ['capability_disabled']);
    assert.notEqual(outcome.state, 'abstained');
  });

  it('an enabled arm that ran and found zero keeps the existing honest-empty result', () => {
    const outcome = deriveRetrievalOutcome(base({ resultCount: 0 }));
    assert.equal(outcome.state, 'abstained');
    assert.deepEqual(outcome.reasons, ['low_relevance']);
  });

  it('an enabled arm with real results stays answered', () => {
    const outcome = deriveRetrievalOutcome(base({ resultCount: 3 }));
    assert.equal(outcome.state, 'answered');
    assert.equal(outcome.reasons.includes('capability_disabled'), false);
  });

  it('semantic insufficiency does not invent a disabled capability', () => {
    const outcome = deriveRetrievalOutcome(base({ semanticIndexSufficient: false }));
    assert.equal(outcome.state, 'degraded');
    assert.ok(outcome.reasons.includes('semantic_index_insufficient'));
    assert.equal(outcome.reasons.includes('capability_disabled'), false);
  });

  for (const queryClass of ['exact citation', 'CNR', 'case number']) {
    it(`${queryClass} remains usable without an unrelated semantic capability`, () => {
      const outcome = deriveRetrievalOutcome(
        base({
          semanticAvailable: false,
          semanticIndexSufficient: false,
          semanticDependent: false,
        }),
      );
      assert.equal(outcome.state, 'answered');
      assert.equal(outcome.exactIdentityUsable, true);
      assert.equal(outcome.reasons.includes('capability_disabled'), false);
    });
  }

  it('a query with no party intent does not acquire capability_disabled', () => {
    const outcome = deriveRetrievalOutcome(base({ resultCount: 0, degradedArms: [] }));
    assert.equal(outcome.state, 'abstained');
    assert.equal(outcome.reasons.includes('capability_disabled'), false);
  });

  it('a timeout stays distinct from a disabled capability', () => {
    const outcome = deriveRetrievalOutcome(
      base({ resultCount: 0, degradedArms: ['dense_timeout'] }),
    );
    assert.equal(outcome.state, 'coverage_unknown');
    assert.ok(outcome.reasons.includes('timeout'));
    assert.equal(outcome.reasons.includes('capability_disabled'), false);
  });

  it('carries multiple applicable reasons without assigning meaning to their order', () => {
    const outcome = deriveRetrievalOutcome(
      base({
        degradedArms: ['party_name_disabled', 'sparse_timeout', 'sparse_unbounded'],
        semanticAvailable: false,
        withheldUnsafeBody: 2,
      }),
    );
    assert.equal(outcome.state, 'degraded');
    assert.deepEqual(
      new Set(outcome.reasons),
      new Set([
        'capability_disabled',
        'timeout',
        'sparse_unbounded',
        'semantic_index_insufficient',
        'unsafe_body',
      ]),
    );
  });

  it('deduplicates repeated reports of the same disabled arm and timeout class', () => {
    const outcome = deriveRetrievalOutcome(
      base({
        degradedArms: [
          'party_name_disabled',
          'party_name_disabled',
          'dense_timeout',
          'dense_timeout',
        ],
      }),
    );
    assert.equal(outcome.reasons.filter((reason) => reason === 'capability_disabled').length, 1);
    assert.equal(outcome.reasons.filter((reason) => reason === 'timeout').length, 1);
    assert.equal(new Set(outcome.reasons).size, outcome.reasons.length);
  });
});

describe('array length is never confidence', () => {
  /**
   * The other direction, and the one that is easier to get wrong because the
   * response looks healthy: five results while the sparse arm timed out is five
   * of an unknown number. A briefing built on them omits authorities that exist,
   * and `CITATION_HARNESS.md` holds silent-drop rate to a threshold of zero.
   */
  it('results present + an arm timed out is degraded, not answered', () => {
    const outcome = deriveRetrievalOutcome(
      base({ resultCount: 5, degradedArms: ['sparse_timeout'] }),
    );
    assert.equal(outcome.state, 'degraded');
    assert.equal(outcome.resultCount, 5);
    assert.ok(outcome.reasons.includes('timeout'));
  });

  it('a full page proves nothing when the semantic arm never ran', () => {
    const outcome = deriveRetrievalOutcome(base({ resultCount: 5, semanticAvailable: false }));
    assert.equal(outcome.state, 'degraded');
    assert.ok(outcome.reasons.includes('semantic_index_insufficient'));
  });

  it('resultCount is reported as a fact and never decides the state', () => {
    for (const n of [1, 5, 25, 500]) {
      const outcome = deriveRetrievalOutcome(
        base({ resultCount: n, degradedArms: ['dense_timeout'] }),
      );
      assert.equal(outcome.resultCount, n);
      assert.equal(outcome.state, 'degraded');
      assert.equal(outcome.safeForGeneration, false);
    }
  });
});

describe('generation safety', () => {
  /**
   * R7 §8: "semantic-dependent workflow cannot confidently answer when retrieval
   * says abstain/review/coverage unknown." `degraded` is refused too, and that
   * is the deliberate part — it sounds like a warning and it is a refusal. The
   * authority that would have changed the argument is exactly the one that did
   * not get ranked.
   */
  it('only `answered` may become confident prose', () => {
    const cases: Array<[Partial<RetrievalOutcomeInput>, string]> = [
      [{}, 'answered'],
      [{ resultCount: 0 }, 'abstained'],
      [{ degradedArms: ['sparse_timeout'] }, 'degraded'],
      [{ resultCount: 0, degradedArms: ['sparse_unbounded'] }, 'coverage_unknown'],
      [{ exactTitleCandidates: 3 }, 'review_required'],
    ];
    for (const [over, expected] of cases) {
      const outcome = deriveRetrievalOutcome(base(over));
      assert.equal(outcome.state, expected);
      assert.equal(mayGenerateFrom(outcome), expected === 'answered');
    }
  });

  it('degraded is NOT safe to argue from even though it carries results', () => {
    const outcome = deriveRetrievalOutcome(
      base({ resultCount: 5, degradedArms: ['sparse_timeout'] }),
    );
    assert.ok(outcome.resultCount > 0);
    assert.equal(mayGenerateFrom(outcome), false);
  });
});

describe('exact identity survives a degraded semantic path', () => {
  /**
   * R7 §8: "exact identity remains usable independently." An exact citation
   * lookup is a SQL predicate against an identity index and does not care that
   * the embedder is cold. Collapsing the two would make a working feature
   * unavailable because an unrelated one is degraded.
   */
  it('stays usable through every state except ambiguous identity', () => {
    assert.equal(deriveRetrievalOutcome(base({ resultCount: 0 })).exactIdentityUsable, true);
    assert.equal(
      deriveRetrievalOutcome(base({ degradedArms: ['sparse_timeout'] })).exactIdentityUsable,
      true,
    );
    assert.equal(
      deriveRetrievalOutcome(base({ resultCount: 0, semanticAvailable: false }))
        .exactIdentityUsable,
      true,
    );
    assert.equal(
      deriveRetrievalOutcome(base({ exactTitleCandidates: 4 })).exactIdentityUsable,
      false,
    );
  });

  it('an exact-identity query is not accused of insufficient semantic coverage', () => {
    // `(2019) 5 SCC 1` does not need the dense arm. Reporting
    // `semantic_index_insufficient` here would be true, useless, and would teach
    // every consumer to ignore the field.
    const outcome = deriveRetrievalOutcome(
      base({ semanticAvailable: false, semanticIndexSufficient: false, semanticDependent: false }),
    );
    assert.equal(outcome.state, 'answered');
    assert.ok(!outcome.reasons.includes('semantic_index_insufficient'));
  });

  it('defaults to semantic-dependent when the caller does not say', () => {
    const outcome = deriveRetrievalOutcome(base({ semanticAvailable: false }));
    assert.ok(outcome.reasons.includes('semantic_index_insufficient'));
  });
});

describe('ambiguous identity outranks everything', () => {
  /**
   * NEW1 measured 74 of 229 real case-title queries naming 2-16 different cases.
   * A search that is BOTH ambiguous and degraded is `review_required`: the
   * advocate has to pick an authority before the incompleteness of the ranking
   * is even their next problem.
   */
  it('wins over a simultaneous timeout, and keeps the timeout as a reason', () => {
    const outcome = deriveRetrievalOutcome(
      base({ exactTitleCandidates: 16, degradedArms: ['sparse_timeout', 'sparse_unbounded'] }),
    );
    assert.equal(outcome.state, 'review_required');
    assert.equal(outcome.reasons[0], 'ambiguous_identity');
    assert.ok(outcome.reasons.includes('timeout'));
    assert.ok(outcome.reasons.includes('sparse_unbounded'));
  });

  it('one candidate is not ambiguous', () => {
    assert.equal(deriveRetrievalOutcome(base({ exactTitleCandidates: 1 })).state, 'answered');
  });
});

describe('the conservative default while G3 is open', () => {
  /**
   * R7 §8: "until NEW1 thresholds pass, semantic-dependent routes default
   * conservatively." NEW1's own numbers (bus 1162/1163): end-to-end retrieval is
   * 24.4%, not the 37.8% conditional figure, and `adverse_authority` and
   * `statute` score 0 for every representation arm tested.
   *
   * This test exists to make flipping the constant a DECISION. It fails the day
   * someone sets it true, which forces them to come here, read why it was false,
   * and update the test deliberately rather than as a tidy-up.
   */
  it('SEMANTIC_INDEX_SUFFICIENT is false until NEW1 publishes an accepted path', () => {
    assert.equal(SEMANTIC_INDEX_SUFFICIENT, false);
  });

  it('with the real default, a semantic query with no results is coverage_unknown', () => {
    const outcome = deriveRetrievalOutcome({
      resultCount: 0,
      degradedArms: [],
      semanticAvailable: true,
      semanticIndexSufficient: SEMANTIC_INDEX_SUFFICIENT,
    });
    assert.equal(outcome.state, 'coverage_unknown');
    assert.ok(outcome.reasons.includes('semantic_index_insufficient'));
    // NOT abstained: we cannot claim to have looked properly on 24.4% end-to-end.
    assert.notEqual(outcome.state, 'abstained');
  });
});

describe('the other R7 reasons are reachable', () => {
  it('withheld unsafe bodies surface as unsafe_body', () => {
    const outcome = deriveRetrievalOutcome(base({ withheldUnsafeBody: 3 }));
    assert.equal(outcome.state, 'degraded');
    assert.ok(outcome.reasons.includes('unsafe_body'));
  });

  it('a suspect date degrades rather than silently answering', () => {
    const outcome = deriveRetrievalOutcome(base({ dateUnreliable: true }));
    assert.equal(outcome.state, 'degraded');
    assert.ok(outcome.reasons.includes('date_unreliable'));
  });

  it('a stale source degrades rather than silently answering', () => {
    const outcome = deriveRetrievalOutcome(base({ sourceStale: true }));
    assert.equal(outcome.state, 'degraded');
    assert.ok(outcome.reasons.includes('source_stale'));
  });

  it('every non-answered state names at least one reason', () => {
    const inputs: Array<Partial<RetrievalOutcomeInput>> = [
      { resultCount: 0 },
      { degradedArms: ['dense_timeout'] },
      { resultCount: 0, degradedArms: ['sparse_unbounded'] },
      { exactTitleCandidates: 2 },
      { withheldUnsafeBody: 1 },
      { dateUnreliable: true },
      { sourceStale: true },
    ];
    for (const over of inputs) {
      const outcome = deriveRetrievalOutcome(base(over));
      if (outcome.state === 'answered') continue;
      assert.ok(outcome.reasons.length > 0);
    }
  });

  it('`answered` names no reasons at all', () => {
    assert.deepEqual(deriveRetrievalOutcome(base()).reasons, []);
  });
});

describe('the refusal cause is measured, never inferred from query length', () => {
  /**
   * NEW1's bus 1222 corrected a diagnosis of mine that would have shaped the
   * wrong fix. I had inferred from the latency envelope that query LENGTH drove
   * the sparse refusal. Measured over 48 common legal queries at four lengths
   * each, running production's own rule against production's own
   * `lexeme_document_frequency`:
   *
   *     1-2 terms   6/13 refused (46%)
   *     3-5 terms   4/20 refused (20%)
   *     6+  terms   4/15 refused (27%)
   *
   * Not monotone, not the driver. `min(df)` is. A twelve-word, well-formed
   * sentence — "when may a court grant anticipatory bail to a person
   * apprehending arrest" — is refused at rarestDf 0.0564, because every lexeme in
   * it is common in a corpus of criminal judgments.
   *
   * These tests exist so the fix cannot drift back: the outcome must carry the
   * MEASURED cause, and must reach the same verdict for a long query and a short
   * one when the measured cause is the same.
   */
  it('carries the measured rarestDf through to the outcome', () => {
    const outcome = deriveRetrievalOutcome(
      base({ resultCount: 0, degradedArms: ['sparse_unbounded'], rarestDf: 0.2577 }),
    );
    assert.equal(outcome.state, 'coverage_unknown');
    assert.equal(outcome.rarestDf, 0.2577);
  });

  it('is absent, never zero, when the lexical arm did not run', () => {
    // Unmeasured and 0.0 are opposite facts: 0.0 means a lexeme nothing in the
    // corpus contains, which is the RAREST possible and always rankable.
    const outcome = deriveRetrievalOutcome(base({ resultCount: 0 }));
    assert.equal(outcome.rarestDf, undefined);
  });

  it('a twelve-word query and a one-word query with the same cause get the same verdict', () => {
    // The two ends of NEW1's measurement. If anything ever reintroduces a length
    // heuristic these diverge, and this fails.
    const oneWord = deriveRetrievalOutcome(
      base({ resultCount: 0, degradedArms: ['sparse_unbounded'], rarestDf: 0.2577 }),
    );
    const twelveWord = deriveRetrievalOutcome(
      base({ resultCount: 0, degradedArms: ['sparse_unbounded'], rarestDf: 0.0564 }),
    );
    assert.equal(oneWord.state, twelveWord.state);
    assert.equal(twelveWord.state, 'coverage_unknown');
    assert.ok(twelveWord.reasons.includes('sparse_unbounded'));
  });

  it('the outcome takes no query text at all, so length cannot leak in', () => {
    // Structural rather than behavioural: the derivation's input has no query
    // string on it. A length heuristic would have to add one, and adding one is
    // the review moment this asserts.
    const input = base();
    assert.ok(!('query' in input), 'RetrievalOutcomeInput must never carry the query text');
    assert.ok(!('queryLength' in input));
    assert.ok(!('terms' in input));
  });
});
