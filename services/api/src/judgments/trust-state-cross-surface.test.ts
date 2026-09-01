/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE LEGAL FACT, SIX SURFACES — WHICH LAYER EACH ONE ACTUALLY SERVES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `precedential-effect.ts` splits treatment into layers: the stored column, the
 * derived banner, and the product policy. Every surface serves a field NAMED
 * `overruledStatus`. **They do not all serve the same layer**, and until this
 * file nothing in the repository said which one any of them served.
 *
 * NEW3 adjudicated the difference on 31 Aug 2026 (bus 1631,
 * `NEW3_CROSS_SURFACE_TREATMENT_ADJUDICATION_R14.md`): **DEFER, P1, no R15** —
 * the matter-authorities route keeps serving the stored layer for now, because
 * landing a semantic change on a field RCC consumed hours earlier repeats the
 * ordering mistake R14 §A4.0 records. Its §4.4 named the one thing missing:
 *
 *   > *"No committed test pins which layer this route serves."*
 *
 * This is that test, and it is deliberately a PIN rather than a fix. It asserts
 * the layer each surface serves TODAY. A future AMEND is then a one-line edit
 * here plus a one-line edit there, made on purpose — and an accidental flip in
 * either direction fails before it reaches a client.
 *
 * **It changes no behaviour and no wire shape.** Nothing here serves anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SOURCE AND NOT A LIVE CALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The layer question is a single literal assignment in each route. A behavioural
 * test can only see it where the two layers DISAGREE, which is 1 judgment in the
 * corpus today (`T. R. CHALLAPPAN`, 1975 INSC 212) and 0 saved authorities — so
 * a behavioural test passes vacuously on five of the six surfaces and would keep
 * passing after a silent swap. `body-text-safety.test.ts` uses the same
 * structural shape for the same reason, and records that the failure it catches
 * is the one that has actually happened here, twice.
 *
 * The behavioural half is below it: the two layers are proved to differ on the
 * real shape, through the pure functions, so the pin is about a real difference.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  attributionOf,
  currentnessClaim,
  precedentialEffectFromEdges,
  precedentialPolicy,
  treatmentScope,
  type OverruledStatus,
  type TreatmentEdge,
} from './precedential-effect.ts';
import { generationEvidenceEligible } from './text-origin.ts';
import { sourceArtifactState } from '../corpus/source-artifact-state.ts';
import {
  deriveRetrievalOutcome,
  SEMANTIC_INDEX_SUFFICIENT,
  type RetrievalOutcomeInput,
} from '../search/outcome.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * DERIVED_HERE     — this file calls `precedentialPolicy` and serves its banner.
 * DERIVED_UPSTREAM — it re-emits a value `retrieve.ts` already derived.
 * STORED           — `judgments.overruled_status`, read raw.
 *
 * The discriminator is mechanical and is worth saying out loud, because it is
 * what makes the layers indistinguishable at a glance: **a snake_case property
 * is a database column, a camelCase one has already been through the
 * derivation.** `search/saved.ts` serves `r.overruledStatus` and that is the
 * DERIVED banner — `r` is a `SearchResult`, and `retrieve.ts` set that key to
 * `policy.bannerStatus` before saved.ts ever saw it. Reading that line as the
 * raw column is an easy mistake and it has been made: NEW3 bus 1631 recorded
 * `search/saved.ts:292` as serving the stored value.
 */
type Layer = 'DERIVED_HERE' | 'DERIVED_UPSTREAM' | 'STORED';

function classify(expression: string): 'DERIVED' | 'STORED' {
  // `overruled_status` — the column name — appearing as the value is the tell.
  // `overruled_status_shown` is `citation_checks`' own record of what a surface
  // rendered: a stored value about a past render, not a live derivation.
  return /\boverruled_status\b/.test(expression) ? 'STORED' : 'DERIVED';
}

/**
 * Every place a response object is given a key called `overruledStatus`.
 *
 * Hand-maintained, like `body-text-safety.test.ts`'s SITES, and for the same
 * reason: a grep cannot tell an emission from an argument. `judgments/route.ts`
 * and `matters/authorities.ts` both PASS `overruledStatus: row.overruled_status`
 * INTO `precedentialEffectFromEdges` — that is the derivation being fed, not a
 * client being answered, and it must not appear here.
 */
const SITES: {
  file: string;
  surface: string;
  layer: Layer;
  /** The exact emission, so a rewrite of the expression forces a decision. */
  emits: string;
  /** R12 §1.4 rule 6 wants the stored column beside the live one. Who does. */
  storedBeside: 'overruledStatusStored' | 'overruledStatusShown' | 'NONE';
  /** For DERIVED_UPSTREAM: the module whose derivation it is re-emitting. */
  derivedIn?: string;
}[] = [
  {
    file: 'judgments/route.ts',
    surface: 'GET /judgments/:id',
    layer: 'DERIVED_HERE',
    emits: 'overruledStatus: policy.bannerStatus,',
    storedBeside: 'overruledStatusStored',
  },
  {
    file: 'search/retrieve.ts',
    surface: 'the hybrid ranker, whose result object three routes re-emit',
    layer: 'DERIVED_HERE',
    emits: 'overruledStatus: policy.bannerStatus,',
    storedBeside: 'overruledStatusStored',
  },
  {
    file: 'search/route.ts',
    surface: 'POST /search (structured and ambiguous paths)',
    layer: 'DERIVED_HERE',
    emits: 'overruledStatus: derived.get(h.judgmentId)?.banner ?? h.overruledStatus,',
    storedBeside: 'overruledStatusStored',
  },
  {
    file: 'briefings/route.ts',
    surface: 'the briefing authority list',
    layer: 'DERIVED_HERE',
    emits: 'overruledStatus: policy.bannerStatus,',
    storedBeside: 'overruledStatusStored',
  },
  {
    /**
     * Re-emits `retrieve.ts`'s already-derived banner. It publishes no
     * `overruledStatusStored` companion, and that is a real difference from the
     * four above rather than an oversight to tidy: R12 froze this shape without
     * one. A consumer here cannot see a stored/derived divergence — it can only
     * see the banner, which is the value it is supposed to render.
     */
    file: 'search/saved.ts',
    surface: 'GET /saved-searches/:id/feed',
    layer: 'DERIVED_UPSTREAM',
    emits: 'overruledStatus: r.overruledStatus,',
    storedBeside: 'NONE',
    derivedIn: './retrieve.ts',
  },
  {
    file: 'arguments/counter.ts',
    surface: 'POST /arguments/counter',
    layer: 'DERIVED_UPSTREAM',
    emits: 'overruledStatus: r.overruledStatus,',
    storedBeside: 'NONE',
    derivedIn: '../search/retrieve.ts',
  },
  {
    /**
     * DEFERRED, not accepted. NEW3 bus 1631 §4.4 specifies the future AMEND —
     * serve `policy.bannerStatus` and add `overruledStatusStored` beside it —
     * and names four exit conditions that convert the DEFER into it. Until one
     * fires, STORED is the committed truth and this line is what says so.
     */
    file: 'matters/authorities.ts',
    surface: 'GET|POST /matters/:matterId/authorities',
    layer: 'STORED',
    emits: 'overruledStatus: r.overruled_status,',
    storedBeside: 'NONE',
  },
  {
    /**
     * The fifth surface, and it was not in NEW3's census — which named
     * `judgments`, `search` (twice), `briefings` and `matters/authorities`.
     * Same class as the matter list: the stored column under the derived
     * value's name. Reported to NEW3 rather than changed, because moving it is
     * a value change inside an unchanged type on a released route.
     */
    file: 'citations/check.ts',
    surface: 'GET /citations/:citationCheckId',
    layer: 'STORED',
    emits: 'overruledStatus: r.overruled_status ?? r.overruled_status_shown,',
    storedBeside: 'overruledStatusShown',
  },
];

describe('overruledStatus — which layer each surface serves', () => {
  for (const site of SITES) {
    it(`${site.surface} serves the ${site.layer} layer`, () => {
      const source = readFileSync(join(here, '..', site.file), 'utf8');
      assert.ok(
        source.includes(site.emits),
        `${site.file} no longer emits \`${site.emits}\` — the layer this surface serves ` +
          'may have changed. That is a contract-visible decision, not a refactor: ' +
          'update this pin deliberately and tell NEW3.',
      );
      assert.equal(
        classify(site.emits),
        site.layer === 'STORED' ? 'STORED' : 'DERIVED',
        `${site.surface} is pinned as ${site.layer} but its expression reads as the other layer`,
      );
      if (site.derivedIn) {
        // The provenance claim is CHECKED, not asserted in a comment: a
        // re-emitter that stopped importing the ranker would be deriving its
        // own answer, and the pin would be describing a module that no longer
        // supplies the value.
        assert.ok(
          source.includes(`from '${site.derivedIn}'`),
          `${site.file} is pinned as re-emitting ${site.derivedIn}'s derivation but no longer imports it`,
        );
      }
    });
  }

  it('six surfaces serve the derived banner and two serve the stored column', () => {
    /**
     * The count itself is the finding. R14 §A5 says `overruledStatus` is *"the
     * only value that may drive a banner … on every surface"* and never says
     * two routes answer a different question under that name. NEW3 classified
     * that as INTERNAL_ONLY_DIFFERENCE — no advocate can reach a contradiction,
     * because the one divergent judgment is saved to zero live matters and the
     * client compensates — and DEFERRED it. This assertion is what makes a
     * THIRD stored surface appearing quietly impossible.
     */
    const stored = SITES.filter((s) => s.layer === 'STORED').map((s) => s.file);
    assert.deepEqual(stored, ['matters/authorities.ts', 'citations/check.ts']);
    assert.equal(SITES.filter((s) => s.layer !== 'STORED').length, 6);
  });

  it('every surface that DERIVES here carries the stored column beside it', () => {
    /**
     * R12 §1.4 rule 6: *"`overruledStatusStored` is beside it so a divergence is
     * visible."* True of all four surfaces that run the derivation themselves,
     * and of none of the four that do not — which is the sharper half of the
     * finding. Where the companion is absent a consumer has no way back to the
     * other layer: the reconstruction path is absent, not merely unused.
     */
    for (const site of SITES) {
      const source = readFileSync(join(here, '..', site.file), 'utf8');
      if (site.storedBeside === 'NONE') {
        assert.ok(
          !source.includes('overruledStatusStored'),
          `${site.surface} is pinned as serving no stored-column companion but names one`,
        );
        continue;
      }
      assert.ok(
        source.includes(`${site.storedBeside}:`),
        `${site.surface} must publish ${site.storedBeside} beside the live value`,
      );
    }
    assert.equal(SITES.filter((s) => s.layer === 'DERIVED_HERE').length, 4);
    assert.equal(SITES.filter((s) => s.storedBeside === 'NONE').length, 3);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO LAYERS ARE NOT THE SAME ANSWER — so the pin above is about something
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the stored column and the derived banner genuinely disagree', () => {
  /** `T. R. CHALLAPPAN`, 1975 INSC 212 — the live shape, in one line. */
  const defectOnly: TreatmentEdge[] = [
    { relationship: 'overruled', provenance: 'MODALITY_DEFECT' },
  ];

  it('a stored set_aside whose only evidence is a modality defect derives to none', () => {
    const effect = precedentialEffectFromEdges({ overruledStatus: 'set_aside', edges: defectOnly });
    assert.equal(effect, 'evidence_defect');
    assert.equal(precedentialPolicy(effect).bannerStatus, 'none');
  });

  it('so a surface serving the stored layer OVER-states, and never under-states', () => {
    /**
     * The direction matters and is the reason NEW3 could defer at all. The
     * stored column here says `set_aside` where the evidence says nothing
     * happened, so the stored surface shows a warning that is too grave — never
     * a missing one. The banner-upgrade class, where a saved list would UNDER-
     * state, measured **zero rows** live (NEW3 bus 1631). Were the direction
     * reversed this would be a P0 and not a DEFER.
     */
    const derived = precedentialPolicy(
      precedentialEffectFromEdges({ overruledStatus: 'set_aside', edges: defectOnly }),
    ).bannerStatus;
    const RANK: Record<OverruledStatus, number> = {
      none: 0,
      doubted: 1,
      partly_set_aside: 2,
      set_aside: 3,
    };
    assert.ok(
      RANK['set_aside'] > RANK[derived],
      'the stored layer must be the graver of the two, or the DEFER is unsafe',
    );
  });

  it('a defect subtracts a warning without adding a prohibition', () => {
    // R14 §A5. The refusal is the one thing a parser defect may never cause.
    const policy = precedentialPolicy(
      precedentialEffectFromEdges({ overruledStatus: 'set_aside', edges: defectOnly }),
    );
    assert.equal(policy.addToMatter, 'allow');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UNKNOWN IS NOT A NEGATIVE ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('unknown never collapses into a negative', () => {
  it('no adverse edge at all attributes to UNKNOWN, never COURT', () => {
    assert.equal(attributionOf([]), 'UNKNOWN');
  });

  it('a currentness statement names the sources it searched and the instant it was true', () => {
    /**
     * *"No adverse treatment found in LawMind's resolved sources as of [DATE]"*
     * — never "good law", and never an unqualified negative. The server owes the
     * client the two facts that make the sentence honest; the words are RCC's.
     */
    const claim = currentnessClaim({
      effect: 'none',
      overruledParas: null,
      asOf: '2026-08-31T00:00:00.000Z',
    });
    assert.equal(claim.adverseTreatment, 'none');
    assert.equal(claim.basis, 'lawmind_resolved_sources');
    assert.equal(claim.asOf, '2026-08-31T00:00:00.000Z');
    assert.equal(claim.scope, 'NOT_APPLICABLE');
  });

  it('a verified treatment whose paragraphs could not be read stays UNRESOLVED', () => {
    // Not "no adverse treatment", and not an invented paragraph number.
    assert.equal(
      treatmentScope({ effect: 'partly_set_aside', overruledParas: null }),
      'UNRESOLVED',
    );
    assert.equal(treatmentScope({ effect: 'partly_set_aside', overruledParas: [] }), 'UNRESOLVED');
    assert.equal(treatmentScope({ effect: 'partly_set_aside', overruledParas: [22] }), 'RESOLVED');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SOURCE LINK IS NOT RETAINED EVIDENCE · AN IMAGE IS NOT FULL TEXT
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('holding a link is not holding a document', () => {
  it('no artifact means no full-text evidence and no generation evidence', () => {
    const s = sourceArtifactState({ rawBytes: null, storageKey: null, textState: null });
    assert.equal(s.sourceArtifactHeld, false);
    assert.equal(s.fullTextEvidenceAvailable, false);
    assert.equal(s.generationEvidenceAvailable, false);
  });

  it('a retained IMAGE is retained and is still not full-text evidence', () => {
    /**
     * The two facts must move independently. A held image is a real artifact —
     * `sourceArtifactHeld` is true and saying otherwise would be its own lie —
     * and it is not text. Collapsing them in either direction is the state 8
     * failure: image-only artifacts retained, never text evidence.
     */
    const s = sourceArtifactState({
      rawBytes: null,
      storageKey: 'r2://x/y.pdf',
      textState: 'IMAGE_ONLY_OCR_PENDING',
    });
    assert.equal(s.sourceArtifactHeld, true);
    assert.equal(s.fullTextEvidenceAvailable, false);
    assert.equal(s.generationEvidenceAvailable, false);
  });
});

describe('evidence support is not citation existence', () => {
  it("a reporter's edition is citable and is not generation evidence", () => {
    /**
     * The distinction the success criteria name: a citation existing must never
     * imply the claim is supported. 38,342 Supreme Court judgments are the
     * S.C.R. edition — every one a real, findable, citable authority whose BODY
     * may not be represented as the court's own words.
     */
    assert.equal(generationEvidenceEligible('REPORTER_EDITION'), false);
    assert.equal(generationEvidenceEligible('COURT_SOURCE'), true);
    assert.equal(generationEvidenceEligible('UNKNOWN'), true);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SLOW · TIMEOUT · DEGRADED · UNAVAILABLE · ZERO RESULTS — five different facts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RCC observed a physical-Android cold `/search` at 15,334 ms against a 15,000 ms
 * client timeout, and fixed the client so a timeout no longer claims OFFLINE.
 * The server half of the same rule is asserted here: nothing about how LONG a
 * request took may change what the response CLAIMS.
 */
describe('latency is not a trust state', () => {
  const base: RetrievalOutcomeInput = {
    resultCount: 5,
    degradedArms: [],
    semanticAvailable: true,
    semanticIndexSufficient: true,
    semanticDependent: true,
  };

  it('the derivation cannot see elapsed time at all', () => {
    /**
     * The structural proof, and the strongest available one:
     * `deriveRetrievalOutcome` takes no duration, no deadline and no clock. A
     * 15-second search that COMPLETED is `answered`, because slowness is not
     * incompleteness — the server ranked everything it was going to rank. There
     * is therefore no threshold anywhere that could be raised to make a latency
     * observation disappear from the trust vocabulary; it was never in it.
     */
    const source = readFileSync(join(here, '..', 'search/outcome.ts'), 'utf8');
    const input = source.slice(
      source.indexOf('export type RetrievalOutcomeInput'),
      source.indexOf('const TIMEOUT_ARMS'),
    );
    assert.ok(input.length > 0, 'RetrievalOutcomeInput not found — rename?');
    assert.equal(
      /\w*(?:elapsedMs|durationMs|latency|tookMs|deadline|startedAt)\w*\s*[?:]/.test(input),
      false,
      'a latency input appeared on the outcome derivation — slow would become a claim',
    );
    assert.equal(deriveRetrievalOutcome(base).state, 'answered');
  });

  it('timeout is a reason and never a state', () => {
    const source = readFileSync(join(here, '..', 'search/outcome.ts'), 'utf8');
    const states = source.slice(
      source.indexOf('export type RetrievalOutcomeState'),
      source.indexOf('export type RetrievalOutcomeReason'),
    );
    assert.ok(states.length > 0, 'RetrievalOutcomeState not found — rename?');
    assert.ok(!/'timeout'/.test(states), "'timeout' must not be a state — it is a reason");
    assert.ok(!/'slow'|'unavailable'|'offline'/.test(states), 'no latency-shaped state may exist');
  });

  it('a timed-out arm with results is degraded, and with none is coverage_unknown', () => {
    const withResults = deriveRetrievalOutcome({ ...base, degradedArms: ['sparse_timeout'] });
    assert.equal(withResults.state, 'degraded');
    assert.ok(withResults.reasons.includes('timeout'));

    const withNone = deriveRetrievalOutcome({
      ...base,
      resultCount: 0,
      degradedArms: ['sparse_timeout'],
    });
    assert.equal(withNone.state, 'coverage_unknown');
    assert.ok(withNone.reasons.includes('timeout'));
  });

  it('an unreachable embedder is coverage_unknown, never an empty answer', () => {
    // `embedQuery` returns null when the model is cold, past its budget, or past
    // its failure limit — the three ways "we could not reach it" arrive here.
    const out = deriveRetrievalOutcome({ ...base, resultCount: 0, semanticAvailable: false });
    assert.equal(out.state, 'coverage_unknown');
    assert.ok(out.reasons.includes('semantic_index_insufficient'));
  });

  it('EXHAUSTIVE: no combination of could-not-look inputs can ever produce abstained', () => {
    /**
     * `abstained` is the ONE state a client may render as *"we looked and found
     * nothing"*. Every other zero must read as *"we could not look"*. This walks
     * every combination of the inputs that mean we could not look and asserts
     * the collapse is unreachable — the property the hand-written cases above
     * can only sample.
     */
    const arms: readonly string[][] = [
      [],
      ['sparse_timeout'],
      ['sparse_unbounded'],
      ['party_name_disabled'],
      ['dense_timeout', 'sparse_unbounded'],
    ];
    let abstentions = 0;
    for (const degradedArms of arms) {
      for (const semanticAvailable of [true, false]) {
        for (const semanticIndexSufficient of [true, false]) {
          for (const semanticDependent of [true, false]) {
            for (const resultCount of [0, 3]) {
              const out = deriveRetrievalOutcome({
                resultCount,
                degradedArms,
                semanticAvailable,
                semanticIndexSufficient,
                semanticDependent,
              });
              const couldNotLook =
                degradedArms.length > 0 ||
                (semanticDependent && (!semanticAvailable || !semanticIndexSufficient));
              if (out.state === 'abstained') {
                abstentions += 1;
                assert.equal(
                  couldNotLook,
                  false,
                  `abstained returned for ${JSON.stringify({
                    degradedArms,
                    semanticAvailable,
                    semanticIndexSufficient,
                    semanticDependent,
                  })}`,
                );
                assert.equal(resultCount, 0, 'abstained may only ever describe an empty page');
              }
              if (resultCount === 0 && couldNotLook) {
                assert.equal(out.state, 'coverage_unknown');
              }
            }
          }
        }
      }
    }
    assert.ok(
      abstentions > 0,
      'the honest-empty path must still be reachable, or the test proves nothing',
    );
  });

  it('degraded carries results and is still not safe to argue from', () => {
    // Showing an incomplete set is fine. Reasoning from it is not: the authority
    // that would have changed the argument is exactly the one that did not rank.
    const out = deriveRetrievalOutcome({ ...base, degradedArms: ['pin_timeout'] });
    assert.equal(out.state, 'degraded');
    assert.equal(out.safeForGeneration, false);
    assert.equal(out.exactIdentityUsable, true);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A DISABLED CAPABILITY IS A DID-NOT-LOOK FACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `party_name_disabled` is a `DegradedArm` — the party-name arm was NOT RUN
 * because the capability registry disables it for the requesting platform
 * (R14 §A4.9, roadmap v7.1 §9.5). It is a *we did not look* fact.
 *
 * R15 B1 adds `capability_disabled` and makes this arm contribute to
 * `couldNotLookProperly`. The release override remains empty; these assertions
 * exercise the derivation independently so a later activation cannot turn an
 * arm that never ran into an honest-empty claim.
 */
describe('a disabled capability is visible to the outcome derivation', () => {
  const partyOff = {
    resultCount: 0,
    degradedArms: ['party_name_disabled'],
    semanticAvailable: true,
  };

  it('keeps both applicable reasons under the conservative semantic default', () => {
    const out = deriveRetrievalOutcome({
      ...partyOff,
      semanticIndexSufficient: SEMANTIC_INDEX_SUFFICIENT,
      semanticDependent: true,
    });
    assert.equal(SEMANTIC_INDEX_SUFFICIENT, false, 'the mask IS this constant');
    assert.equal(out.state, 'coverage_unknown');
    assert.deepEqual(
      new Set(out.reasons),
      new Set(['capability_disabled', 'semantic_index_insufficient']),
    );
  });

  it('with semantic sufficiency, the disabled arm is still coverage_unknown', () => {
    const out = deriveRetrievalOutcome({
      ...partyOff,
      semanticIndexSufficient: true,
      semanticDependent: true,
    });
    assert.equal(out.state, 'coverage_unknown');
    assert.deepEqual(out.reasons, ['capability_disabled']);
    assert.notEqual(out.state, 'abstained');
  });

  it('and `emptyBecause` does not fire for it either, so the empty screen has no remedy', () => {
    /**
     * `search/route.ts` gates `emptyBecause` on `sparse_unbounded` alone. R12's
     * degraded-rendering table tells RCC that a non-empty `degraded` with empty
     * `results` must render `emptyBecause.reason` and `remedy` — a field that
     * will not be present in this case. R14 §A4.9 gives RCC a party-specific
     * rule keyed on `degraded[]` instead, so the client is instructed correctly;
     * the gap is between two server-side statements, not in the client.
     */
    const source = readFileSync(join(here, '..', 'search/route.ts'), 'utf8');
    assert.ok(
      source.includes("retrieved.length === 0 && degraded.includes('sparse_unbounded')"),
      'the emptyBecause guard moved — re-check whether party_name_disabled now has a remedy',
    );
  });
});
