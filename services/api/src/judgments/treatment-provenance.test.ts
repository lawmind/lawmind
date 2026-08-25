/**
 * TREATMENT PROVENANCE, ACROSS EVERY SURFACE THAT SPEAKS ABOUT CURRENTNESS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS DEFENDING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R4 §14: `treatment_provenance` was `PROVEN_BY_LIVE_DB` as storage and `FALSE`
 * as consumption — NEW2 wrote the column, five decision surfaces selected
 * `relationship` alone, and not one of them read it. So a law reporter's
 * headnote, a later court's own reasoning, and one misparsed 1985 dissent all
 * produced identical wording and identical propagation.
 *
 * The live corpus is why it matters. NEW2 hand-read all 137 badge-driving edges:
 *
 *     REPORTER_EDITORIAL_ANNOTATION   131   (95.62%)
 *     COURT_REASONING_EXPLICIT          5   ( 3.65%)
 *     MODALITY_DEFECT                   1
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO FAILURE DIRECTIONS, AND THIS FILE GUARDS BOTH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * OVERSTATEMENT — telling an advocate "the Supreme Court held this was
 * overruled" when what we hold is a reporter's editorial note. That is the claim
 * that ends a legal product.
 *
 * OVER-CORRECTION — deciding reporter evidence is too weak to warn on. That
 * takes LAW MOVED from 98 judgments to 5 and puts an advocate in front of a
 * bench relying on 93 authorities a reporter has recorded as overruled. It is
 * the far more dangerous mistake and it is the one a well-meaning "make it
 * rigorous" change would introduce.
 *
 * Every test below asserts the second as hard as the first: the WARNING is
 * unchanged for reporter and unknown provenance, and only the WORDING moves.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  attributionOf,
  edgesThatMayDrive,
  mayStateAsHolding,
  precedentialEffect,
  precedentialEffectFromEdges,
  precedentialPolicy,
  type TreatmentEdge,
} from './precedential-effect.ts';
import { treatmentChecklistItems } from '../briefings/treatment-checklist.ts';
import { treatmentScope } from './precedential-effect.ts';

const court = (relationship: string): TreatmentEdge => ({
  relationship,
  provenance: 'COURT_REASONING_EXPLICIT',
});
const reporter = (relationship: string): TreatmentEdge => ({
  relationship,
  provenance: 'REPORTER_EDITORIAL_ANNOTATION',
});
const defect = (relationship: string): TreatmentEdge => ({
  relationship,
  provenance: 'MODALITY_DEFECT',
});
const unknown = (relationship: string): TreatmentEdge => ({ relationship, provenance: null });

describe('attribution — who said the law moved', () => {
  it('reads each provenance value as its own attribution', () => {
    assert.equal(attributionOf([court('overruled')]), 'COURT');
    assert.equal(attributionOf([reporter('overruled')]), 'REPORTER');
    assert.equal(attributionOf([defect('overruled')]), 'DEFECTIVE');
    assert.equal(attributionOf([unknown('overruled')]), 'UNKNOWN');
  });

  it('never reads absence of evidence as the court having spoken', () => {
    // The single most important negative in this file. An unclassified edge is
    // 4,403 rows of "nobody looked", and reading that as COURT would license the
    // strongest possible wording on the weakest possible basis.
    assert.equal(attributionOf([]), 'UNKNOWN');
    assert.notEqual(attributionOf([unknown('overruled')]), 'COURT');
    assert.equal(mayStateAsHolding(attributionOf([unknown('overruled')])), false);
  });

  it('lets one court edge carry a pile of reporter edges', () => {
    assert.equal(attributionOf([reporter('overruled'), court('overruled')]), 'COURT');
  });

  it('does not let one broken edge poison the good ones beside it', () => {
    // DEFECTIVE ranks LAST on purpose. A misparse sitting next to real evidence
    // is simply the least useful thing we hold, not a contaminant.
    assert.equal(attributionOf([defect('overruled'), reporter('overruled')]), 'REPORTER');
    assert.equal(attributionOf([defect('overruled'), court('overruled')]), 'COURT');
    // Only when it is ALL we hold does it decide, and then it claims nothing.
    assert.equal(attributionOf([defect('overruled')]), 'DEFECTIVE');
  });

  it('ignores non-adverse edges when deciding attribution', () => {
    assert.equal(attributionOf([{ relationship: 'cites', provenance: null }]), 'UNKNOWN');
    assert.equal(
      attributionOf([{ relationship: 'followed', provenance: 'COURT_REASONING_EXPLICIT' }]),
      'UNKNOWN',
      'a judgment being FOLLOWED is not adverse treatment and must not attribute one',
    );
  });

  it('permits a holding to be stated only for the court', () => {
    assert.equal(mayStateAsHolding('COURT'), true);
    for (const a of ['REPORTER', 'UNKNOWN', 'DEFECTIVE'] as const) {
      assert.equal(mayStateAsHolding(a), false, `${a} may not be worded as a holding`);
    }
  });
});

describe('propagation — only a defective edge is refused', () => {
  it('excludes MODALITY_DEFECT and nothing else', () => {
    const edges = [court('overruled'), reporter('doubted'), unknown('overruled_in_part'), defect('overruled')];
    const driving = edgesThatMayDrive(edges);
    assert.equal(driving.length, 3);
    assert.ok(!driving.some((e) => e.provenance === 'MODALITY_DEFECT'));
    assert.ok(
      driving.some((e) => e.provenance === null),
      'unclassified edges MUST still drive — they are most of the corpus, and dropping them would silently stop propagation',
    );
    assert.ok(driving.some((e) => e.provenance === 'REPORTER_EDITORIAL_ANNOTATION'));
  });

  it('a stored status backed ONLY by a defect ALLOWS the save and asserts no banner', () => {
    /**
     * The correction NEW3's 10-matter regression caught four hours after the
     * first version shipped.
     *
     * My first attempt returned `review_required` here, reasoning that dropping
     * the defective edge must not let a stored status read as a deliberate human
     * determination. True, and it produced a worse bug: `review_required`
     * REFUSES add-to-matter, so a real 1975 Supreme Court authority —
     * *Divisional Personnel Officer, Southern Railway v. T. R. Challappan*,
     * 1975 INSC 212 — became unsaveable, and the reason was a verb's mood in a
     * 1985 dissent.
     *
     * `evidence_defect` separates the two facts. "A later court may have done
     * something we cannot confirm" is ambiguity and refusing is cautious. "We
     * recorded something that was never a change of status" is a fact about our
     * parser, and a defect in our own reading must SUBTRACT a warning rather
     * than ADD a prohibition.
     */
    const effect = precedentialEffectFromEdges({
      overruledStatus: 'set_aside',
      edges: [defect('overruled')],
    });
    assert.equal(effect, 'evidence_defect');
    const policy = precedentialPolicy(effect);
    assert.equal(policy.addToMatter, 'allow', 'a parser defect may not deny an advocate good law');
    assert.equal(
      policy.bannerStatus,
      'none',
      'asserting LAW MOVED from a subjunctive is a hallucination in the direction nobody watches for',
    );
    assert.equal(policy.citableForUntouchedPropositions, true);
  });

  it('the defect is still DISCLOSED — allowed is not silent', () => {
    // Removing the false claim must not remove the visibility. The attribution
    // says DEFECTIVE on every surface, and the checklist still emits an item.
    const edges = [defect('overruled')];
    assert.equal(attributionOf(edges), 'DEFECTIVE');
    const effect = precedentialEffectFromEdges({ overruledStatus: 'set_aside', edges });
    const items = treatmentChecklistItems([
      {
        judgmentId: 'j-defect',
        caseTitle: 'Challappan',
        storedStatus: 'set_aside' as const,
        effect,
        policy: precedentialPolicy(effect),
        scope: treatmentScope({ effect, overruledParas: null }),
        overruledParas: null,
        unapplied: null,
        attribution: 'DEFECTIVE' as const,
      },
    ]);
    assert.equal(items.length, 1, 'a known defect in our record must still be said out loud');
    assert.match(items[0]!.text, /defect in our own reading/);
    assert.doesNotMatch(
      items[0]!.text,
      /has moved/,
      'the authority did NOT move — that is the claim this effect exists to withdraw',
    );
  });

  it('genuine ambiguity still refuses — review_required is untouched', () => {
    /**
     * The one behavioural change, and the reason it is not a weakening.
     *
     * Dropping the defective edge leaves no edge at all, and the old code read
     * "no edge" as *"a human determination, taken at its word"* — granting a
     * misparsed 1985 dissent the authority of an admin's deliberate decision.
     * `review_required` says the true thing and refuses add-to-matter, which is
     * strictly more cautious than what it replaced.
     */
    // An edge whose RELATIONSHIP is not one we map, with real provenance. That
    // is genuine "something happened and we cannot account for it", which is the
    // case refusing was designed for and still serves.
    const effect = precedentialEffectFromEdges({
      overruledStatus: 'set_aside',
      edges: [{ relationship: 'approved', provenance: 'COURT_REASONING_EXPLICIT' }],
    });
    assert.equal(effect, 'set_aside', 'no usable ADVERSE edge at all is still taken at its word');
    assert.equal(precedentialPolicy('review_required').addToMatter, 'refuse');
    assert.equal(precedentialPolicy('review_required').bannerStatus, 'set_aside');
  });

  it('a genuine admin determination with no edges at all is still taken at its word', () => {
    // The branch above must not swallow this one. No edges is silence; a broken
    // edge is a broken witness. They are different answers.
    assert.equal(
      precedentialEffectFromEdges({ overruledStatus: 'set_aside', edges: [] }),
      'set_aside',
    );
  });
});

describe('the warning is never weakened by provenance', () => {
  const cases: { name: string; edges: TreatmentEdge[]; stored: 'set_aside' | 'doubted' | 'partly_set_aside' }[] = [
    { name: 'court', edges: [court('overruled')], stored: 'set_aside' },
    { name: 'reporter', edges: [reporter('overruled')], stored: 'set_aside' },
    { name: 'unclassified', edges: [unknown('overruled')], stored: 'set_aside' },
    { name: 'reporter doubted', edges: [reporter('doubted')], stored: 'doubted' },
  ];

  for (const c of cases) {
    it(`${c.name}: banner and add-to-matter are identical to the relationship-only answer`, () => {
      const before = precedentialPolicy(
        precedentialEffect({
          overruledStatus: c.stored,
          inboundRelationships: c.edges.map((e) => e.relationship),
        }),
      );
      const after = precedentialPolicy(
        precedentialEffectFromEdges({ overruledStatus: c.stored, edges: c.edges }),
      );
      assert.equal(after.bannerStatus, before.bannerStatus);
      assert.equal(after.addToMatter, before.addToMatter);
      assert.equal(after.citableForUntouchedPropositions, before.citableForUntouchedPropositions);
    });
  }

  it('reporter-derived LAW MOVED still renders — the 98-to-5 regression is refused', () => {
    const policy = precedentialPolicy(
      precedentialEffectFromEdges({ overruledStatus: 'set_aside', edges: [reporter('overruled')] }),
    );
    assert.notEqual(
      policy.bannerStatus,
      'none',
      'demoting reporter evidence out of the badge would drop 93 warnings and is the more dangerous error',
    );
  });
});

describe('the briefing checklist says WHO, and never drops the item', () => {
  const state = (attribution: 'COURT' | 'REPORTER' | 'DEFECTIVE' | 'UNKNOWN') => {
    const edges =
      attribution === 'COURT'
        ? [court('overruled')]
        : attribution === 'REPORTER'
          ? [reporter('overruled')]
          : attribution === 'DEFECTIVE'
            ? [defect('overruled')]
            : [unknown('overruled')];
    const effect = precedentialEffectFromEdges({ overruledStatus: 'set_aside', edges });
    return {
      judgmentId: `j-${attribution}`,
      caseTitle: 'Test v. State',
      storedStatus: 'set_aside' as const,
      effect,
      policy: precedentialPolicy(effect),
      scope: treatmentScope({ effect, overruledParas: null }),
      overruledParas: null,
      unapplied: null,
      attribution,
    };
  };

  it('produces an item for every attribution, including the defective one', () => {
    for (const a of ['COURT', 'REPORTER', 'DEFECTIVE', 'UNKNOWN'] as const) {
      const items = treatmentChecklistItems([state(a)]);
      assert.equal(items.length, 1, `${a} must still produce a checklist item`);
    }
  });

  it('only the court version claims the court said it', () => {
    const courtText = treatmentChecklistItems([state('COURT')])[0]!.text;
    assert.match(courtText, /later court said so in its own reasoning/);

    for (const a of ['REPORTER', 'DEFECTIVE', 'UNKNOWN'] as const) {
      const text = treatmentChecklistItems([state(a)])[0]!.text;
      assert.doesNotMatch(
        text,
        /later court said so in its own reasoning/,
        `${a} must not be worded as the later court's own holding`,
      );
    }
  });

  it('names the reporter as a reporter, in words an advocate can act on', () => {
    const text = treatmentChecklistItems([state('REPORTER')])[0]!.text;
    assert.match(text, /law reporter's editorial note/);
    assert.match(text, /read the later decision/);
    /* Copy is licence protection, not an audit (CLAUDE.md). It says what we
     * HOLD, never what we failed to do. */
    assert.doesNotMatch(text, /unverified|verification failed|we could not verify/i);
  });

  it('carries the attribution in the basis line, so a stale blob can be diagnosed', () => {
    const basis = treatmentChecklistItems([state('REPORTER')])[0]!.basis;
    assert.match(basis, /attribution REPORTER/);
  });
});
