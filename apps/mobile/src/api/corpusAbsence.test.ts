/**
 * THE SENTENCE R17 §1 FORBIDS, AND THE SEVEN ROUTES THAT STILL SEND IT.
 *
 * LCC bus 1757 §2 named two routes; bus 1758 corrected it to eight call sites
 * across seven, and asked RCC to check whether the add-to-matter fold covered
 * them. It did not — `citation/saveAuthorityOutcome.ts` narrows one response
 * type and nothing else calls it, and three screens printed the message
 * verbatim. This file pins both halves: the rule, and the fact that it is
 * applied at the transport rather than at three render sites.
 */
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:9999';

import { api } from './client';
import { CORPUS_ABSENT_COPY, assertsJudgmentDoesNotExist, corpusSafeError } from './corpusAbsence';

describe('the rule itself', () => {
  it('replaces the pre-R29 NOT_FOUND that names a judgment — the wire a shipped binary still meets', () => {
    const out = corpusSafeError({ code: 'NOT_FOUND', message: 'no judgment with that id' });
    expect(out.message).toBe(CORPUS_ABSENT_COPY);
    expect(out.code).toBe('NOT_FOUND');
  });

  it('never asserts that a judgment does not exist', () => {
    expect(CORPUS_ABSENT_COPY).not.toMatch(/does not exist|no such|not in the corpus|was removed/i);
    // Nor may it read as an outage, which would be a different and false claim.
    expect(CORPUS_ABSENT_COPY).not.toMatch(/trouble|try again|offline|unavailable right now/i);
  });

  it('leaves "no matter with that id" alone — that one is true and actionable', () => {
    const error = { code: 'NOT_FOUND', message: 'no matter with that id' };
    expect(assertsJudgmentDoesNotExist(error)).toBe(false);
    expect(corpusSafeError(error).message).toBe('no matter with that id');
  });

  it('leaves the set_aside refusal alone — it names the replacement judgment', () => {
    const error = {
      code: 'AUTHORITY_SET_ASIDE',
      message: 'That judgment was set aside. Cite Foo v. Bar (2025) 3 SCC 1 instead.',
    };
    expect(corpusSafeError(error).message).toBe(error.message);
  });

  it('speaks for itself on the R29 wire, rather than passing the server sentence through', () => {
    // LCC R29 `94950462`: all eight corpus call sites now answer with this code
    // and a truthful message. The message is still replaced — one sentence per
    // state on every surface, and server wording that drifts must not be able to
    // move what an advocate reads about the law.
    const error = {
      code: 'CORPUS_TARGET_UNAVAILABLE',
      message: 'That judgment is not available in the selected corpus release, so it cannot be opened right now.',
    };
    expect(assertsJudgmentDoesNotExist(error)).toBe(true);
    expect(corpusSafeError(error).message).toBe(CORPUS_ABSENT_COPY);
    expect(corpusSafeError(error).code).toBe('CORPUS_TARGET_UNAVAILABLE');
  });

  it('preserves every other field on the envelope', () => {
    const out = corpusSafeError({
      code: 'NOT_FOUND',
      message: 'no judgment with that id',
      retryAfterSeconds: 3,
    });
    expect(out.retryAfterSeconds).toBe(3);
  });
});

/**
 * The seven routes from LCC bus 1758, driven through the REAL client. Three of
 * these reached a rendered string verbatim before this round; the other four
 * are here because the exposure is a property of the route, not of whether a
 * screen happens to print it today.
 */
describe('every route LCC named comes back folded', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      headers: { get: () => null },
      json: async () => ({
        ok: false,
        error: {
          code: 'CORPUS_TARGET_UNAVAILABLE',
          message: 'That judgment is not available in the selected corpus release, so it cannot be opened right now.',
        },
      }),
    });
    // @ts-expect-error test double, not a full Fetch implementation
    global.fetch = fetchMock;
  });

  const calls: ReadonlyArray<[string, () => Promise<{ ok: boolean }>]> = [
    ['GET /judgments/:id', () => api.judgment('j1')],
    ['GET /judgments/:id/authorities', () => api.authorities('j1')],
    ['GET /judgments/:id/treatment', () => api.treatment('j1')],
    ['GET /judgments/:id/graph', () => api.precedentGraph('j1')],
  ];

  it.each(calls)('%s', async (_name, call) => {
    const res = await call();
    expect(res.ok).toBe(false);
    const err = (res as { ok: false; error: { code: string; message: string } }).error;
    expect(err.code).toBe('CORPUS_TARGET_UNAVAILABLE');
    expect(err.message).toBe(CORPUS_ABSENT_COPY);
    expect(err.message).not.toMatch(/no judgment with that id/);
  });
});
