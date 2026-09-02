/**
 * ─────────────────────────────────────────────────────────────────────────────
 * R17 §1 THROUGH THE ACTUAL CLIENT, AGAINST THE ACTUAL BACKEND.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `citation/saveAuthorityOutcome.test.ts` proves the narrowing against hand-built
 * envelopes and `api/shapes.test.ts` proves the types. Neither can fail if the
 * server sends something else — which is exactly what bus 1748 reported when it
 * set `R17_WRITE_E2E = PENDING_LCC`: the client half was written against a
 * contract document, and the write half of the server did not exist yet.
 *
 * It exists now (LCC R27, `693c12ba`). So this suite makes the four claims from
 * real HTTP responses, through `api/client.ts` unmodified, with a corpus
 * generation that genuinely moves underneath a genuinely saved row:
 *
 *   3  an available judgment saves, one server row, a normal saved authority
 *   4  an absent target answers 409, no fake authority, no automatic retry
 *   5  the already-saved row survives as a shell with NO title/court/date leak
 *   6  when the target comes back it is the SAME `authorityId`, hydrated, once
 *
 * ── WHAT WOULD FAIL SILENTLY WITHOUT THE DATABASE READ ──────────────────────
 *
 * "No fake authority was created" is not observable from the client: a refusal
 * and a refusal-that-secretly-wrote look identical over the wire. The row count
 * is read from the harness control port for that one reason.
 */
import {
  authorityRows,
  readHandshake,
  setGeneration,
  type E2eHandshake,
} from './handshake';

/* Required AFTER `globalSetup` has put the base URL in the environment —
 * `client.ts` resolves `BASE_URL` once, at module load. A top-level `import`
 * would hoist above that and pin the client to the wrong host. */
type ClientModule = typeof import('../src/api/client');
type OutcomeModule = typeof import('../src/citation/saveAuthorityOutcome');

let handshake: E2eHandshake;
let api: ClientModule['api'];
let outcome: OutcomeModule;

beforeAll(() => {
  handshake = readHandshake();
  const client = require('../src/api/client') as ClientModule;
  api = client.api;
  outcome = require('../src/citation/saveAuthorityOutcome') as OutcomeModule;

  /* The real token path. The client asks its auth bridge for a bearer token on
   * every `auth: true` call, so signing in for this suite is registering one. */
  client.registerAuthBridge({
    accessToken: () => handshake.profileBacked.token,
    refresh: async () => true,
    onSessionLost: () => {},
  });
});

afterAll(async () => {
  /* Leave the served generation where the next suite expects it. */
  await setGeneration(handshake.controlUrl, 'A');
});

describe('R17 §1 — an AVAILABLE judgment saves normally', () => {
  let savedAuthorityId: string;

  it('saves, and the client sees the plain saved outcome', async () => {
    await setGeneration(handshake.controlUrl, 'A');

    const res = await api.addAuthorityToMatter({
      matterId: handshake.matterId,
      judgmentId: handshake.judgmentId,
    });

    expect(res.ok).toBe(true);
    expect(outcome.saveAuthorityOutcome(res)).toEqual({ kind: 'saved' });

    if (!res.ok) throw new Error('unreachable');
    expect(res.data.authority).toBeDefined();
    savedAuthorityId = res.data.authority!.authorityId;
  });

  it('wrote exactly one server row', async () => {
    const rows = await authorityRows(handshake.controlUrl);
    expect(rows.total).toBe(1);
    expect(rows.live).toEqual([
      { authorityId: savedAuthorityId, judgmentId: handshake.judgmentId },
    ]);
  });

  it('renders as a normal saved authority — hydrated, verified, not marked', async () => {
    const read = await api.matterAuthorities(handshake.matterId);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('unreachable');

    expect(read.data.authorities).toHaveLength(1);
    const authority = read.data.authorities[0]!;
    expect(authority.authorityId).toBe(savedAuthorityId);
    expect(authority.caseTitle).toBe('SYNTHETIC — RCC R25 Generation A Only');
    expect(authority.verificationState).toBe('verified');
    expect(authority.overruledStatus).toBe('none');

    /* R17's always-sent array. `[]` is "nothing unavailable", never "old server".
     * The contract types it optional because a pre-R17 server omitted it, so the
     * assertion is that this one SENT it — `toEqual([])` would also pass on
     * `undefined` being absent from the comparison, and it must not. */
    expect(read.data.unavailableAuthorities).toBeDefined();
    expect(read.data.unavailableAuthorities).toEqual([]);
  });
});

describe('R17 §1 — the corpus target is UNAVAILABLE on write', () => {
  beforeAll(async () => {
    await setGeneration(handshake.controlUrl, 'B');
  });

  it('answers 409 CORPUS_TARGET_UNAVAILABLE for a target with no live saved row', async () => {
    const res = await api.addAuthorityToMatter({
      matterId: handshake.matterId,
      judgmentId: handshake.absentJudgmentId,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error.code).toBe('CORPUS_TARGET_UNAVAILABLE');
  });

  it('the client renders the truthful corpus state and never the raw sentence', async () => {
    const res = await api.addAuthorityToMatter({
      matterId: handshake.matterId,
      judgmentId: handshake.absentJudgmentId,
    });
    const narrowed = outcome.saveAuthorityOutcome(res);

    expect(narrowed).toEqual({
      kind: 'corpus_unavailable',
      message: outcome.CORPUS_UNAVAILABLE_COPY,
      retryable: false,
    });

    /* The four sentences R17 §1 forbids on this state, checked against what the
     * advocate actually reads rather than against the server's wording. */
    const shown = narrowed.kind === 'corpus_unavailable' ? narrowed.message : '';
    expect(shown).not.toMatch(/no judgment with that id/i);
    expect(shown).not.toMatch(/authority not found/i);
    expect(shown).not.toMatch(/does not exist/i);
    expect(shown).not.toMatch(/removed from the law/i);
    expect(shown).not.toMatch(/unverified/i);
    expect(shown).not.toMatch(/still good law/i);
  });

  it('creates no authority, fake or otherwise', async () => {
    const rows = await authorityRows(handshake.controlUrl);
    /* Still the one row from the available save. Two 409s wrote nothing. */
    expect(rows.total).toBe(1);
    expect(rows.live.map((r) => r.judgmentId)).not.toContain(handshake.absentJudgmentId);
  });

  it('does not automatically retry — the state is a property of the generation', () => {
    const narrowed = outcome.saveAuthorityOutcome({
      ok: false,
      error: { code: 'CORPUS_TARGET_UNAVAILABLE', message: 'anything' },
    });
    expect(narrowed).toMatchObject({ retryable: false });
  });

  it('the already-satisfied save answers 200 with the shell, not a second row', async () => {
    const res = await api.addAuthorityToMatter({
      matterId: handshake.matterId,
      judgmentId: handshake.judgmentId,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data.authority).toBeUndefined();
    expect(res.data.unavailableAuthority).toBeDefined();

    const narrowed = outcome.saveAuthorityOutcome(res);
    expect(narrowed.kind).toBe('already_saved_unavailable');

    const rows = await authorityRows(handshake.controlUrl);
    expect(rows.total).toBe(1);
  });
});

describe('R17 §1 — an EXISTING saved authority becomes unavailable', () => {
  it('stays visible as an unavailable shell', async () => {
    const read = await api.matterAuthorities(handshake.matterId);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('unreachable');

    expect(read.data.authorities).toEqual([]);
    expect(read.data.unavailableAuthorities ?? []).toHaveLength(1);
    expect(read.data.unavailableAuthorities![0]!.availability).toBe('corpus_unavailable');
  });

  it('leaks no stale title, court, date or citation', async () => {
    const read = await api.matterAuthorities(handshake.matterId);
    if (!read.ok) throw new Error('unreachable');
    const shell = read.data.unavailableAuthorities![0]! as unknown as Record<string, unknown>;

    /* The trap RCC R23 recorded: a client that keeps the last hydrated copy
     * shows a case title for a judgment this release cannot resolve. The shell
     * is six fields, and the other four are absent on the wire — asserted as
     * absence, because a `null` would still be a field a screen could render. */
    expect(Object.keys(shell).sort()).toEqual(
      ['addedAt', 'addedBy', 'authorityId', 'availability', 'judgmentId', 'removedAt'].sort(),
    );
    expect(shell.caseTitle).toBeUndefined();
    expect(shell.neutralCitation).toBeUndefined();
    expect(shell.reporterCitations).toBeUndefined();
    expect(shell.verificationState).toBeUndefined();
    expect(shell.overruledStatus).toBeUndefined();
  });

  it('the user-owned remove action still addresses it', async () => {
    /* Contract-supported and user-owned: the advocate may drop a row whose
     * target this release cannot resolve. Not exercised destructively — the
     * recovery case below needs the row — so this asserts the id the DELETE
     * path takes is the one the shell carries. */
    const read = await api.matterAuthorities(handshake.matterId);
    if (!read.ok) throw new Error('unreachable');
    const rows = await authorityRows(handshake.controlUrl);
    expect(read.data.unavailableAuthorities![0]!.authorityId).toBe(rows.live[0]!.authorityId);
  });
});

describe('R17 §1 — the corpus RECOVERS', () => {
  it('returns the same authorityId, hydrated, with no duplicate and no stale shell', async () => {
    const before = await api.matterAuthorities(handshake.matterId);
    if (!before.ok) throw new Error('unreachable');
    const shellId = before.data.unavailableAuthorities![0]!.authorityId;

    await setGeneration(handshake.controlUrl, 'A');

    const after = await api.matterAuthorities(handshake.matterId);
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error('unreachable');

    expect(after.data.authorities).toHaveLength(1);
    expect(after.data.authorities[0]!.authorityId).toBe(shellId);
    expect(after.data.authorities[0]!.caseTitle).toBe('SYNTHETIC — RCC R25 Generation A Only');
    expect(after.data.unavailableAuthorities).toEqual([]);

    const rows = await authorityRows(handshake.controlUrl);
    expect(rows.total).toBe(1);
  });

  it('and the write path is normal again', async () => {
    const res = await api.addAuthorityToMatter({
      matterId: handshake.matterId,
      judgmentId: handshake.judgmentId,
    });
    /* Already saved and now resolvable: the server's own idempotent answer.
     * Whatever it is, it is not a refusal and it does not add a row. */
    expect(outcome.saveAuthorityOutcome(res).kind).not.toBe('corpus_unavailable');
    const rows = await authorityRows(handshake.controlUrl);
    expect(rows.total).toBe(1);
  });
});
