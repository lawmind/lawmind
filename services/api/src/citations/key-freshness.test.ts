/**
 * The resolver may not answer UNIQUE from an index that has not read the corpus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS BEING DEFENDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 graded the resolver against an adjudicated truth set: false-UNIQUE 15.63%,
 * 33,013 shared-neutral groups collapsing to one confident answer. The rules were
 * right; `judgment_citation_keys` was 309,130 neutral citations behind its own
 * cursor and had been for a week. Nothing errored. Nothing looked wrong.
 *
 * Re-running the builder repaired 33,001 of them — which fixes the number for a
 * day and fixes nothing about the mechanism.
 *
 * These tests hold the mechanism: the bound, the two ways it can be breached,
 * the states staleness may and may not change, and the two defaults that decide
 * whether a safety gate is on when nobody remembered to turn it on.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import {
  type KeyFreshness,
  MAX_LAG_HOURS,
  MAX_LAG_ROWS,
  mayAssertUnique,
  readKeyFreshness,
} from './key-freshness.ts';
import { resolveBatch } from './resolver.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

after(async () => {
  await sql.end({ timeout: 5 });
});

describe('mayAssertUnique — the gate itself', () => {
  it('opens for CURRENT and for nothing else', () => {
    assert.equal(mayAssertUnique('CURRENT'), true);
    assert.equal(mayAssertUnique('STALE'), false);
  });

  it('is CLOSED for UNKNOWN — "we cannot see" must not read as "it is fine"', () => {
    /**
     * The most important assertion in this file. `UNKNOWN` means the builder has
     * never published a cursor, so how much of the corpus the index has seen is
     * not known. A gate that opens on an unrecognised state is a gate that is
     * open in exactly the code path nobody thought about.
     */
    assert.equal(mayAssertUnique('UNKNOWN'), false);
  });
});

describe('readKeyFreshness — against the live frontier', () => {
  it('reports a state, a cursor and an exact lag count', async () => {
    const f = await readKeyFreshness(sql);
    assert.ok(['CURRENT', 'STALE', 'UNKNOWN'].includes(f.state));
    assert.equal(typeof f.lagRows, 'number');
    assert.ok(f.lagRows >= 0, 'lag is a count of unwalked rows, never negative');
    if (f.state === 'CURRENT') {
      assert.deepEqual(f.because, [], 'CURRENT must carry no reasons');
      assert.ok(f.lagRows <= MAX_LAG_ROWS);
    } else {
      assert.ok(f.because.length > 0, 'anything but CURRENT must say why, in words');
    }
  });

  it('measures lag from the BUILDER CURSOR, never from keyed-minus-all', async () => {
    /**
     * The derivation this rejects — newest judgment that HAS a key, versus
     * newest judgment — reads healthy while the walk is stopped, because a
     * judgment citing nothing never produces a key row and the apparent frontier
     * drifts with the data instead of with the walk. That is precisely how a
     * 309,130-citation gap stayed invisible for a week.
     *
     * Asserted by construction: the reading's own cursor must equal the row the
     * builder published, not anything derived from `judgment_citation_keys`.
     */
    const f = await readKeyFreshness(sql);
    if (f.state === 'UNKNOWN') return; // nothing published yet; nothing to compare
    const [row] = await sql<{ cursor_at: string }[]>`
      SELECT cursor_at::text FROM citation_key_frontier`;
    assert.ok(row, 'a non-UNKNOWN reading requires a frontier row');
    assert.equal(
      Date.parse(f.frontierAt!),
      Date.parse(row.cursor_at),
      'the reported frontier must BE the builder cursor',
    );
  });

  it('counts exactly the judgments created after the cursor', async () => {
    const f = await readKeyFreshness(sql);
    if (f.state === 'UNKNOWN' || f.frontierAt === null) return;
    const [check] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgments WHERE created_at > ${f.frontierAt}::timestamptz`;
    assert.equal(f.lagRows, Number(check?.n ?? -1));
  });
});

describe('the two bounds catch different failures', () => {
  it('the row bound and the clock bound are both load-bearing', () => {
    // Stated as an invariant rather than left implicit: with ingest idle, zero
    // lag rows is equally consistent with "caught up" and "the builder died a
    // week ago and nothing arrived either". Only the clock separates them, and
    // only the row count catches a builder that is running but falling behind.
    assert.ok(MAX_LAG_ROWS > 0, 'a row bound of zero would refuse every UNIQUE forever');
    assert.ok(MAX_LAG_HOURS > 0);
    assert.ok(
      MAX_LAG_ROWS < 309_130,
      'the bound must be well below the 309,130-row gap that produced 33,013 false uniques — ' +
        'a bound set at the size of the incident would have permitted the incident',
    );
  });
});

describe('the gate changes the resolver answer, on a real citation', () => {
  /**
   * Proven by execution, not by reading the branch. A safety gate nobody has
   * watched fire is a safety gate nobody has tested — and this one was written
   * because a resolver answered UNIQUE 33,013 times from an index that had not
   * read the corpus.
   *
   * Read-only: the freshness object is synthesised, no row is touched.
   */
  it('withdraws the CLAIM of uniqueness and KEEPS the candidate', async () => {
    const [row] = await sql<{ source_text: string }[]>`
      SELECT source_text FROM judgment_citation_keys
       WHERE citation_key IN (
         SELECT citation_key FROM judgment_citation_keys
          GROUP BY citation_key HAVING count(*) = 1 LIMIT 1)
       LIMIT 1`;
    if (!row) return; // an empty key index has nothing to prove this against

    const live = await readKeyFreshness(sql);
    const stale: KeyFreshness = { ...live, state: 'STALE', lagRows: 400_000, because: ['test'] };
    const unknown: KeyFreshness = { ...live, state: 'UNKNOWN', because: ['test'] };

    const [current] = await resolveBatch(sql, [row.source_text], { ...live, state: 'CURRENT' });
    const [onStale] = await resolveBatch(sql, [row.source_text], stale);
    const [onUnknown] = await resolveBatch(sql, [row.source_text], unknown);

    assert.equal(current!.state, 'UNIQUE');
    assert.equal(onStale!.state, 'UNIQUE_UNCONFIRMED_STALE_INDEX');
    assert.equal(
      onUnknown!.state,
      'UNIQUE_UNCONFIRMED_STALE_INDEX',
      'an unpublished frontier must gate exactly as a stale one does',
    );

    /**
     * NEVER SILENTLY DROPPED — `CITATION_HARNESS.md`. The advocate still gets the
     * judgment; what they stop getting is the assertion that it is the only one.
     * A gate that answered TARGET_NOT_HELD here would be hiding a real authority
     * behind an index problem, which is a worse failure than the one being fixed.
     */
    assert.equal(onStale!.heldCandidates, current!.heldCandidates);
    assert.deepEqual(onStale!.candidates, current!.candidates);
  });

  it('leaves AMBIGUOUS and TARGET_NOT_HELD untouched — staleness only hides, never invents', async () => {
    const live = await readKeyFreshness(sql);
    const stale: KeyFreshness = { ...live, state: 'STALE', lagRows: 400_000, because: ['test'] };

    // A citation the corpus does not hold. Stale or fresh, the honest answer is
    // the same: we do not have it.
    const [notHeld] = await resolveBatch(sql, ['(1911) 99 ZZZ 12345'], stale);
    assert.equal(notHeld!.state, 'TARGET_NOT_HELD');

    const [shared] = await sql<{ source_text: string }[]>`
      SELECT source_text FROM judgment_citation_keys
       WHERE citation_key IN (
         SELECT citation_key FROM judgment_citation_keys
          GROUP BY citation_key HAVING count(DISTINCT judgment_id) > 1 LIMIT 1)
       LIMIT 1`;
    if (!shared) return;
    const [ambiguous] = await resolveBatch(sql, [shared.source_text], stale);
    assert.equal(
      ambiguous!.state,
      'AMBIGUOUS',
      'AMBIGUOUS already says "more than one, choose" — a hidden candidate makes it more so, not less true',
    );
  });
});

describe('risk evidence gates UNIQUE, separately from index lag', () => {
  /**
   * NEW2 ran this gate against the live database on 25 Aug 2026 and got
   * CURRENT / mayAssertUnique TRUE / because [] with `resolver_risk_replay`
   * holding ZERO rows. The table was read, returned, and never consulted: an
   * empty risk table and a clean risk table were the same reading.
   *
   * Every probe below mutates inside a transaction and throws to roll back, so
   * the live row is never touched. Each asserts a DIFFERENT reason fires —
   * a single "it is STALE" assertion would pass even if one gate were deleted.
   */
  const probe = async (mutate: (tx: typeof sql) => Promise<unknown>): Promise<KeyFreshness> => {
    let seen: KeyFreshness | null = null;
    await sql
      .begin(async (tx) => {
        await mutate(tx as unknown as typeof sql);
        seen = await readKeyFreshness(tx as unknown as typeof sql);
        throw new Error('ROLLBACK');
      })
      .catch((e: Error) => {
        if (e.message !== 'ROLLBACK') throw e;
      });
    assert.ok(seen, 'the probe never read a freshness value');
    return seen;
  };

  it('an EMPTY risk table is not CURRENT, at any lag', async () => {
    const f = await probe((tx) => tx`DELETE FROM resolver_risk_replay`);
    assert.equal(f.state, 'STALE');
    assert.equal(mayAssertUnique(f.state), false);
    assert.ok(
      f.because.some((b) => b.includes('resolver_risk_replay is empty')),
      `expected the empty-table reason, got: ${JSON.stringify(f.because)}`,
    );
  });

  it('a replay that graded ZERO records vouches for nothing', async () => {
    /** The non-vacuity guard: 0 defects out of 0 records is not a passing check. */
    const f = await probe((tx) => tx`UPDATE resolver_risk_replay SET records = 0`);
    assert.equal(mayAssertUnique(f.state), false);
    assert.ok(
      f.because.some((b) => b.includes('graded 0 records')),
      `expected the zero-record reason, got: ${JSON.stringify(f.because)}`,
    );
  });

  it('a replay that FOUND false uniques closes the gate on direct evidence', async () => {
    const f = await probe((tx) => tx`UPDATE resolver_risk_replay SET false_unique = 3`);
    assert.equal(mayAssertUnique(f.state), false);
    assert.ok(
      f.because.some((b) => b.includes('false UNIQUE')),
      `expected the damage reason, got: ${JSON.stringify(f.because)}`,
    );
  });

  it('a replay run against a DIFFERENT cursor does not vouch for this index', async () => {
    const f = await probe(
      (tx) => tx`UPDATE resolver_risk_replay SET frontier_at = frontier_at - interval '3 days'`,
    );
    assert.equal(mayAssertUnique(f.state), false);
    assert.ok(
      f.because.some((b) => b.includes('different index')),
      `expected the wrong-index reason, got: ${JSON.stringify(f.because)}`,
    );
  });

  it('is NOT vacuous — the live row does not trip any of them', async () => {
    /**
     * The assertion that makes the four above mean something. If the gate fired
     * unconditionally every test here would pass and the resolver would never
     * answer UNIQUE again.
     */
    const f = await readKeyFreshness(sql);
    const riskReasons = f.because.filter(
      (b) =>
        b.includes('resolver_risk_replay is empty') ||
        b.includes('graded 0 records') ||
        b.includes('different index'),
    );
    assert.deepEqual(
      riskReasons,
      [],
      `the live risk replay should satisfy the gate; it reported: ${JSON.stringify(f.because)}`,
    );
  });
});
