/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOURTH GATE, AND THE SELF-EDGE — the two defects NEW2 R14 measured
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every case here is a LIVE row in this corpus, named by citation key and by
 * judgment id, not a fixture written to make a gate pass. NEW2's falsifier
 * (`docs/ai/new2-r14/NEW2_R14_CITATION_FALSIFIER.md`, bus 1622) reported two
 * population failures and neither was in a sample:
 *
 *   226 material false uniques   a second bearer that had not landed yet
 *   1,003,733 self-edges         a judgment pinned to its own citation
 *
 * These tests fail on the resolver as it stood at `6f0d96bf`. That is recorded
 * because a regression test that passes before the fix tests nothing:
 *
 *   ✖ a declared but unlanded sibling stops UNIQUE   -> was 'UNIQUE'
 *   ✖ a judgment's own citation is not an edge        -> was 'UNIQUE' onto itself
 *   ✖ an unreadable cause title cannot yield UNIQUE   -> was 'UNIQUE'
 *
 * The three freshness gates are CURRENT on this database (`lagRows: 0`,
 * `because: []`, checked 31 August 2026), so a non-UNIQUE answer below cannot
 * be an accident of staleness — it can only come from the gate under test.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { readKeyFreshness } from './key-freshness.ts';
import { resolveBatch } from './resolver.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });

after(async () => {
  await sql.end({ timeout: 5 });
});

/**
 * `2023:AHC:173536` — one common order over FIRST APPEAL FROM ORDER 1202 of
 * 1999 and FIRST APPEAL FROM ORDER 1979 of 2021. On 31 August 2026 the corpus
 * holds the first and not the second, and the cause title says so.
 */
const COHORT_CITATION = '2023:AHC:173536';
const COHORT_KEY = '2023AHC173536';

/** A judgment's own neutral citation. Judgment `8f101d4e-…` prints `1950 INSC 1`. */
const SELF_CITATION = '1950 INSC 1';
const SELF_JUDGMENT_ID = '8f101d4e-2b37-439b-9618-26871b72e677';

/** `1951 INSC 30`, judgment `03d3c783-…`. One bearer, one matter, no conjunction. */
const CLEAN_CITATION = '1951 INSC 30';

/** FIFTH's falsifier. BOTH bearers have now landed, so it is ordinary AMBIGUOUS. */
const TWO_BEARER_CITATION = '2026:JHHC:24297';

async function heldFor(key: string): Promise<number> {
  const [row] = await sql<{ n: string }[]>`
    SELECT count(DISTINCT judgment_id)::text AS n
      FROM judgment_citation_keys WHERE citation_key = ${key}`;
  return Number(row!.n);
}

describe('resolver — the connected-matter cohort gate', () => {
  it('the three freshness gates are open, so nothing below passes by staleness', async () => {
    const f = await readKeyFreshness(sql);
    assert.equal(f.state, 'CURRENT', `freshness ${f.state} — these tests would be vacuous`);
  });

  it('a sibling the court DECLARED but we have not landed stops UNIQUE', async () => {
    if ((await heldFor(COHORT_KEY)) !== 1) return; // the sibling landed; see the round doc
    const [res] = await resolveBatch(sql, [COHORT_CITATION]);
    assert.ok(res);
    assert.equal(res.state, 'UNIQUE_UNCONFIRMED_COHORT');
    assert.equal(res.cohort?.verdict, 'COHORT_INCOMPLETE');
    assert.equal(res.cohort?.declaredMatters, 2);
    // THE CANDIDATE IS STILL RETURNED. The refusal is of the word "only",
    // never of the authority — same shape as the three gates before it.
    assert.equal(res.candidates.length, 1);
    assert.equal(res.heldCandidates, 1);
  });

  it('an ordinary single-matter judgment still resolves UNIQUE', async () => {
    const [res] = await resolveBatch(sql, [CLEAN_CITATION]);
    assert.ok(res);
    assert.equal(res.state, 'UNIQUE', `regressed the ordinary case to ${res.state}`);
    assert.equal(res.cohort?.verdict, 'UNIQUE_NOT_REFUTED');
  });

  it('two bearers of one citation stay AMBIGUOUS — the gate picks no winner', async () => {
    const [res] = await resolveBatch(sql, [TWO_BEARER_CITATION]);
    assert.ok(res);
    assert.equal(res.state, 'AMBIGUOUS');
    assert.equal(res.heldCandidates, 2);
  });

  it('a cause title we cannot read is never evidence of uniqueness', async () => {
    const [res] = await resolveBatch(sql, [CLEAN_CITATION], undefined, async () => new Map());
    assert.ok(res);
    assert.equal(res.state, 'UNIQUE_UNCONFIRMED_COHORT');
    assert.equal(res.cohort?.verdict, 'INSUFFICIENT_TO_PROVE_UNIQUE');
  });
});

describe('resolver — a judgment cannot cite itself', () => {
  it("a judgment's own neutral citation is a SELF_REFERENCE, not an edge", async () => {
    const [res] = await resolveBatch(sql, [
      { raw: SELF_CITATION, citingJudgmentId: SELF_JUDGMENT_ID },
    ]);
    assert.ok(res);
    assert.equal(res.state, 'SELF_REFERENCE');
    assert.equal(res.candidates.length, 0, 'the citing judgment was returned as its own target');
    assert.equal(res.heldCandidates, 0);
    assert.equal(res.selfExcluded, true);
  });

  it('the same citation from ANOTHER judgment is an ordinary resolution', async () => {
    const [res] = await resolveBatch(sql, [
      { raw: SELF_CITATION, citingJudgmentId: '00000000-0000-0000-0000-000000000000' },
    ]);
    assert.ok(res);
    assert.notEqual(res.state, 'SELF_REFERENCE');
    assert.equal(res.selfExcluded, false);
    assert.equal(res.candidates[0]?.judgmentId, SELF_JUDGMENT_ID);
  });

  /**
   * THE TRAP IN THE FIX, CAUGHT BY PROBING IT RATHER THAN BY REASONING ABOUT IT.
   *
   * `2026:JHHC:24297` has TWO bearers now. Ask it as judgment `66f8a648-…`, one
   * of the two, and a naive self-exclusion leaves exactly one candidate — the
   * connected sibling — and pins it: **"M.A. 134/2018 cites C.O. 9/2022"**. It
   * does not. Both matters printed the citation of the one common order that
   * disposed of both.
   *
   * That would have been a NEW false pin introduced by the fix for the old one,
   * on FIFTH's own falsifier, and the first cut of this round produced it.
   * Where the citer claims the key, the reference is the citer's own citation —
   * regardless of how many other judgments claim it too.
   */
  it('a bearer of a shared citation cites its connected sibling — no, and this once said UNIQUE', async () => {
    const [res] = await resolveBatch(sql, [
      { raw: TWO_BEARER_CITATION, citingJudgmentId: '66f8a648-d0a8-40b1-bc9b-6221da840401' },
    ]);
    assert.ok(res);
    assert.equal(res.state, 'SELF_REFERENCE');
    assert.equal(res.candidates.length, 0, 'offered the connected sibling as a pin target');
  });

  it('a bare string carries no citing context, and the resolver says so rather than guessing', async () => {
    const [res] = await resolveBatch(sql, [SELF_CITATION]);
    assert.ok(res);
    assert.equal(res.selfExcluded, false);
    assert.equal(res.candidates.length, 1);
  });
});

describe("resolver — the alias path's known limitation, asserted rather than described", () => {
  /**
   * `judgment_citation_aliases_key` is UNIQUE, so an alias key can never be
   * claimed by two judgments and therefore can never resolve AMBIGUOUS. NEW2
   * enumerated all 4,394 alias rows against six deterministic checks with zero
   * failures (R14 §5) — today's answer, not a permanent one. This asserts the
   * STRUCTURE that makes a wrong alias unfireable, so the day it stops being
   * true, a test says so instead of a round doc.
   */
  it('no alias key is claimed by more than one judgment — so no gate can fire on one', async () => {
    const [row] = await sql<{ multi: string }[]>`
      SELECT count(*) FILTER (WHERE nj > 1)::text AS multi
        FROM (SELECT citation_key, count(DISTINCT judgment_id) AS nj
                FROM judgment_citation_keys WHERE source = 'alias' GROUP BY citation_key) t`;
    assert.equal(
      row!.multi,
      '0',
      'an alias key now has two claimants — the alias path can suddenly be ambiguous, ' +
        'and nothing downstream expects that',
    );
  });
});
