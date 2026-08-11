import { api } from '../api/client';

/**
 * ADD-TO-MATTER — the request shape, and the swap that TypeScript cannot see.
 *
 * `POST /matters/:id/authorities` went live 11 Aug 2026. Until then
 * `JudgmentScreen`'s "Add to a matter" button had no `onPress` at all: a
 * live-looking control that did nothing.
 *
 * THE HAZARD THIS FILE EXISTS FOR. `matterId` and `judgmentId` are both plain
 * strings. Written positionally, swapping them saves the WRONG judgment into
 * the WRONG matter — a silent corruption of a matter file, with a `2xx` and no
 * error anywhere. It happened on the first call site within a minute of the
 * method being written, and `tsc` was perfectly happy. The signature now takes
 * named arguments so the mistake is unrepresentable, and these tests pin the
 * URL and the body so a future refactor cannot quietly reintroduce it.
 *
 * `set_aside` is refused SERVER-side with `409 AUTHORITY_SET_ASIDE` and the
 * client refuses it too. That is one rule enforced at both ends, not a
 * duplicated rule: a replayed request or a stale build bypasses the client's
 * copy, and the server's is the one that actually protects the matter file.
 */

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ ok: true, data: { authority: { authorityId: 'auth_1' } } }),
  });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  return { url: String(url), init: init as { method?: string; body?: string } };
};

describe('the matter goes in the URL and the judgment goes in the body', () => {
  it('never transposes the two identifiers', async () => {
    await api.addAuthorityToMatter({ matterId: 'mat_ABC', judgmentId: 'jdg_XYZ' });

    const { url, init } = lastCall();
    expect(url).toContain('/matters/mat_ABC/authorities');
    expect(url).not.toContain('jdg_XYZ');
    expect(JSON.parse(String(init.body))).toEqual({ judgmentId: 'jdg_XYZ' });
  });

  it('POSTs, because saving an authority is a write', async () => {
    await api.addAuthorityToMatter({ matterId: 'mat_1', judgmentId: 'jdg_1' });

    expect(lastCall().init.method).toBe('POST');
  });

  it('carries the verification handle when the surface holds one', async () => {
    await api.addAuthorityToMatter({
      matterId: 'mat_1',
      judgmentId: 'jdg_1',
      citationCheckId: 'chk_9',
    });

    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      judgmentId: 'jdg_1',
      citationCheckId: 'chk_9',
    });
  });

  /**
   * Absent, not null. The server treats a missing `citationCheckId` as "opened
   * cold, no verification moment behind it"; sending an explicit null would be
   * asserting something different.
   */
  it('omits the handle entirely when there is none, rather than sending null', async () => {
    await api.addAuthorityToMatter({ matterId: 'mat_1', judgmentId: 'jdg_1' });

    expect(JSON.parse(String(lastCall().init.body))).not.toHaveProperty('citationCheckId');
  });

  it('encodes identifiers rather than pasting them into the path', async () => {
    await api.addAuthorityToMatter({ matterId: 'mat/../1', judgmentId: 'jdg_1' });

    expect(lastCall().url).toContain(encodeURIComponent('mat/../1'));
  });
});

describe('the refusal comes back intact', () => {
  /**
   * The server's `409` message NAMES THE REPLACEMENT JUDGMENT. That name is the
   * actionable part, so the client renders the message verbatim rather than
   * substituting a generic line.
   */
  it('surfaces the server refusal instead of swallowing it', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      // The server's real envelope — `{ ok: false, error }`, verified against
      // `services/api/src/envelope.ts`. The client returns it verbatim rather
      // than inferring failure from the status code.
      json: async () => ({
        ok: false,
        error: {
          code: 'AUTHORITY_SET_ASIDE',
          message:
            'Mock Review v. Mock State was set aside and cannot be added to a matter. Mock Larger Bench (MOCK 2021 EXAMPLE 12) replaced it.',
        },
      }),
    });

    const r = await api.addAuthorityToMatter({ matterId: 'mat_1', judgmentId: 'jdg_6' });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('AUTHORITY_SET_ASIDE');
      expect(r.error.message).toContain('replaced it');
    }
  });
});
