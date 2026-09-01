import {
  anythingWithheld,
  classifyStatuteLinked,
  mayPresentAsLinked,
  relationSentence,
  unreviewedCount,
  withheldJudgmentCount,
  withheldReferenceCount,
} from './statuteLinkedTruth';
import type {
  ApiResponse,
  StatuteLinkedJudgment,
  StatuteLinkedJudgmentsResponse,
} from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SEVEN WAYS AN EMPTY LIST CAN MEAN SOMETHING ELSE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R16 `R16-RCC-08`, against LCC's route at `69d2a9bb`. The fixtures below
 * are transcribed from responses OBSERVED against the local API at HEAD
 * `c7151dff` on 1 September 2026 — not invented, and not copied from the
 * handoff message, which described two of the fields with a different shape
 * than the handler returns.
 *
 * The observed confirmed-tier answer for CrPC s.482 is the `withheld_only`
 * fixture below, verbatim: zero links, and 42,697 references over 40,134
 * judgments withheld under `unclassified`.
 */

const WITHHELD_ZERO = { byResolutionState: {}, chronologyRefusedOnThisPage: 0 };

function response(
  over: Partial<StatuteLinkedJudgmentsResponse> = {},
): StatuteLinkedJudgmentsResponse {
  return {
    act: {
      statuteId: '0019baad-090a-4777-a62a-f2a12339664e',
      shortTitle: 'The Code of Criminal Procedure, 1973',
      hindiTitle: null,
      actNumber: '2',
      actYear: 1974,
      enactmentDate: '1974-01-25',
      enforcementDate: '1974-04-01',
      sourceUrl: 'https://example.invalid/crpc',
      heldSectionCount: 484,
      repealRecorded: null,
    },
    section: {
      sectionId: 'sec-482',
      sectionNumber: '482',
      heading: 'Saving of inherent powers of High Court',
      sourceUrl: 'https://example.invalid/crpc/482',
    },
    scope: 'section',
    correspondence: { available: false, reason: 'held' },
    evidence: 'resolver_confirmed',
    relationship: 'cites_statute_reference',
    semantics:
      'Judgments whose text carries a structurally extracted reference to this section of this ' +
      'Act. It is not a finding that the section applied, was interpreted, or was decided under.',
    ordering: 'occurrences_desc_then_judgment_id',
    links: [],
    page: { limit: 20, offset: 0, returned: 0, hasMore: false },
    withheld: WITHHELD_ZERO,
    coverage: { note: 'Coverage is partial and is not complete.' },
    asOf: '2026-09-01T12:00:00.000Z',
    ...over,
  };
}

function link(over: Partial<StatuteLinkedJudgment> = {}): StatuteLinkedJudgment {
  return {
    judgmentId: '615f3b41-60ad-4586-8559-bc0656606035',
    caseTitle: 'NEEHARIKA INFRASTRUCTURE PVT. LTD. versus STATE OF MAHARASHTRA',
    neutralCitation: null,
    court: 'Supreme Court of India',
    judgmentDate: '2021-04-13',
    caseNumber: null,
    caseType: null,
    overruledStatus: 'none',
    overruledStatusStored: 'none',
    precedentialEffect: 'none',
    canAddToMatter: true,
    unappliedTreatment: null,
    treatmentAttribution: 'UNKNOWN',
    link: {
      actNamedInJudgment: ['Code of Criminal Procedure, 1973', 'Criminal Procedure Code'],
      sectionNumbers: ['482'],
      occurrences: 73,
      firstOffset: 3063,
      resolutionState: null,
      resolutionReason: [],
      resolvedAt: null,
      evidence: 'structural_unreviewed',
    },
    ...over,
  };
}

const ok = (data: StatuteLinkedJudgmentsResponse): ApiResponse<StatuteLinkedJudgmentsResponse> => ({
  ok: true,
  data,
});
const err = (code: string): ApiResponse<StatuteLinkedJudgmentsResponse> => ({
  ok: false,
  error: { code, message: 'refused' },
});

describe('classifyStatuteLinked · an empty list is never one sentence', () => {
  it('nothing back yet is loading, which says nothing about the law', () => {
    expect(classifyStatuteLinked(undefined)).toBe('loading');
  });

  /**
   * THE ANSWER EVERY ENVIRONMENT GIVES TODAY. `STATUTE_LINKED_JUDGMENTS_ROUTE`
   * is set nowhere, so the route answers 409. Observed against the local API at
   * `c7151dff`: `{"code":"CAPABILITY_DISABLED","details":{"gate":"route"}}`.
   */
  it('a held route is our own readiness, not a finding about the provision', () => {
    expect(classifyStatuteLinked(err('CAPABILITY_DISABLED'))).toBe('route_held');
  });

  it.each(['STATUTE_NOT_FOUND', 'SECTION_NOT_FOUND', 'SECTION_NOT_IN_ACT'])(
    '%s means we do not hold it, which is not that it does not exist',
    (code) => {
      expect(classifyStatuteLinked(err(code))).toBe('not_held');
    },
  );

  /**
   * THE SAFE DIRECTION, AND THE ONE THAT MATTERS MOST. An error code this
   * client has never seen must land on "we could not check" and never fall
   * through to a state that reads as a finding. There is no default branch
   * that reaches `none_held`.
   */
  it.each(['TIMEOUT', 'INTERNAL', 'VALIDATION_ERROR', 'SOME_FUTURE_REFUSAL_R21'])(
    '%s degrades to unavailable, never to an answer of no',
    (code) => {
      expect(classifyStatuteLinked(err(code))).toBe('unavailable');
      expect(classifyStatuteLinked(err(code))).not.toBe('none_held');
    },
  );

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE PAIR THIS FILE EXISTS FOR — both are `links: []`.
   * ───────────────────────────────────────────────────────────────────────────
   */
  it('zero links WITH a withheld count means we hold references and vouch for none', () => {
    const observed = response({
      withheld: {
        byResolutionState: { unclassified: { references: 42697, judgments: 40134 } },
        chronologyRefusedOnThisPage: 0,
      },
    });
    expect(classifyStatuteLinked(ok(observed))).toBe('withheld_only');
  });

  it('zero links with NOTHING withheld is the different sentence', () => {
    expect(classifyStatuteLinked(ok(response()))).toBe('none_held');
  });

  it('and the two are not the same state', () => {
    const withheld = response({
      withheld: {
        byResolutionState: { unclassified: { references: 1, judgments: 1 } },
        chronologyRefusedOnThisPage: 0,
      },
    });
    expect(classifyStatuteLinked(ok(withheld))).not.toBe(classifyStatuteLinked(ok(response())));
  });

  it('links present is answered', () => {
    expect(classifyStatuteLinked(ok(response({ links: [link()] })))).toBe('answered');
  });
});

describe('anythingWithheld · read from the map, never from a named ground', () => {
  /**
   * A RESOLVER STATE ADDED LATER MUST NOT READ AS "NOTHING WITHHELD".
   * Hardcoding `unclassified` — the only populated ground today — would make a
   * future refusal the route starts counting vanish silently.
   */
  it('counts a ground this client has never heard of', () => {
    const future = response({
      withheld: {
        byResolutionState: { refused_by_a_rule_written_in_r24: { references: 5, judgments: 5 } },
        chronologyRefusedOnThisPage: 0,
      },
    });
    expect(anythingWithheld(future)).toBe(true);
    expect(classifyStatuteLinked(ok(future))).toBe('withheld_only');
  });

  /** A row the chronology gate removed was still a reference we declined. */
  it('counts a chronology refusal on this page', () => {
    const refused = response({
      withheld: { byResolutionState: {}, chronologyRefusedOnThisPage: 3 },
    });
    expect(anythingWithheld(refused)).toBe(true);
    expect(classifyStatuteLinked(ok(refused))).toBe('withheld_only');
  });

  it('an empty map with no chronology refusal withholds nothing', () => {
    expect(anythingWithheld(response())).toBe(false);
  });
});

describe('the withheld counts are the numbers that make it not a silent drop', () => {
  const multi = response({
    withheld: {
      byResolutionState: {
        unclassified: { references: 42697, judgments: 40134 },
        refused_pre_enactment: { references: 49, judgments: 44 },
      },
      chronologyRefusedOnThisPage: 0,
    },
  });

  it('sums references across every ground', () => {
    expect(withheldReferenceCount(multi)).toBe(42746);
  });

  it('sums judgments across every ground, separately', () => {
    expect(withheldJudgmentCount(multi)).toBe(40178);
  });

  /** References and judgments are DIFFERENT numbers; one would hide the other. */
  it('keeps references and judgments apart', () => {
    expect(withheldReferenceCount(multi)).not.toBe(withheldJudgmentCount(multi));
  });

  it('is zero, not undefined, when nothing was withheld', () => {
    expect(withheldReferenceCount(response())).toBe(0);
    expect(withheldJudgmentCount(response())).toBe(0);
  });
});

describe('mayPresentAsLinked · the ROW label decides, never the request tier', () => {
  it('an unreviewed extractor pin may not be described as a linked judgment', () => {
    expect(mayPresentAsLinked(link())).toBe(false);
  });

  it('a resolver-confirmed row may', () => {
    expect(
      mayPresentAsLinked(link({ link: { ...link().link, evidence: 'resolver_confirmed' } })),
    ).toBe(true);
  });

  /**
   * THE TIER IS NOT THE LABEL. A `resolver_confirmed` REQUEST can still carry a
   * row the route labelled `structural_unreviewed`, and the row wins — the
   * route's aggregation rule makes a mixed row inherit the WEAKER label.
   */
  it('a confirmed-tier response does not upgrade an unreviewed row', () => {
    const page = response({ evidence: 'resolver_confirmed', links: [link()] });
    expect(page.evidence).toBe('resolver_confirmed');
    expect(mayPresentAsLinked(page.links[0]!)).toBe(false);
  });

  it('counts the unvouched rows on a page', () => {
    const rows = [
      link(),
      link({ judgmentId: 'b', link: { ...link().link, evidence: 'resolver_confirmed' } }),
      link({ judgmentId: 'c' }),
    ];
    expect(unreviewedCount(rows)).toBe(2);
  });
});

describe('relationSentence · the server states the relation, we do not', () => {
  it('renders the server sentence verbatim', () => {
    expect(relationSentence(response())).toBe(response().semantics);
  });

  /**
   * THE FOUR HEADINGS THE ROUTE REFUSES, AS AFFIRMATIVE CLAIMS.
   *
   * Asserted as the POSITIVE phrasing rather than as a substring, because the
   * route's own sentence NAMES all four in order to deny them — "it is not a
   * finding that the section applied, was interpreted, or was decided under".
   * A substring ban would fail on the very sentence that makes the refusal, and
   * the fix for that failure would be to delete the denial, which is backwards.
   */
  it.each([
    /cases applying this/i,
    /cases interpreting this/i,
    /cases governed by this/i,
    /judgments that apply this/i,
  ])('neither the server sentence nor our fallback claims %s', (banned) => {
    expect(relationSentence(response())).not.toMatch(banned);
    expect(relationSentence({ semantics: '   ' })).not.toMatch(banned);
  });

  /** And both carry the denial, which is the load-bearing half. */
  it('states the refusal explicitly in both forms', () => {
    expect(relationSentence(response())).toMatch(/not a finding/i);
    expect(relationSentence({ semantics: '' })).toMatch(/not a finding/i);
  });

  it('falls back to the weakest available statement, never to a friendlier one', () => {
    const fallback = relationSentence({ semantics: '' });
    expect(fallback).toContain('structurally extracted reference');
    expect(fallback).toContain('not a finding');
  });
});
