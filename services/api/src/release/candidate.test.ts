/**
 * The release candidate is only useful if `FROZEN` is a finding rather than a
 * default. R8.3 §7.
 *
 * Two failure modes, and both have already happened to checks in this
 * repository:
 *
 *   VACUOUS   the detector cannot fire, so every candidate reads FROZEN and the
 *             freeze means nothing. Tested by moving a field and demanding
 *             MUTATED, with the field named.
 *   CRYING    the detector fires on something that is not corpus mutation, so
 *             every candidate reads MUTATED and the field is ignored. This is
 *             the `reltuples` trap — ANALYZE rewrites the estimate without a
 *             single row changing — and it is why the two estimate fields are
 *             carried but never judged.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import {
  checkCandidateDrift,
  corpusWritersFromPostgres,
  releaseManifest,
  sealReleaseCandidate,
} from './candidate.ts';
import { RELEASE_CAPABILITIES_VERSION } from './capabilities.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

after(async () => {
  await sql.end();
});

describe('release candidate — sealing', () => {
  it('binds HEAD, the capability registry version and a corpus digest', async () => {
    const c = await sealReleaseCandidate(sql, 'abc1234def5678');
    assert.match(c.releaseCandidateId, /^LMRC-\d{8}-abc1234-[0-9a-f]{16}$/);
    assert.equal(c.capabilityRegistryVersion, RELEASE_CAPABILITIES_VERSION);
    assert.equal(c.corpusDigest.length, 16);
    // The counts a limited-V1 claim is actually built from must be EXACT, not
    // estimates. 79.77% linked is a sentence someone will publish.
    assert.ok(c.corpus.statuteRefs > 0);
    assert.ok(c.corpus.statuteRefsLinked > 0);
    assert.ok(c.corpus.migrationsApplied > 0);
  });

  it('two seals of an unchanged corpus produce the SAME digest', async () => {
    const a = await sealReleaseCandidate(sql, 'abc1234def5678');
    const b = await sealReleaseCandidate(sql, 'abc1234def5678');
    // If this ever fails, something in the identity is time-varying and the
    // digest is not identifying a corpus.
    assert.equal(a.corpusDigest, b.corpusDigest);
  });

  it('the manifest embeds the capability registry, not just its version', async () => {
    const c = await sealReleaseCandidate(sql, 'abc1234def5678');
    const m = releaseManifest(c) as { capabilities: { capabilities: Record<string, unknown> } };
    // A manifest that names a version and nothing else cannot be read once the
    // code has moved on, and outliving the working tree is the point of one.
    assert.ok(m.capabilities.capabilities['search.semantic.broad']);
    assert.ok(m.capabilities.capabilities['search.exact_identity']);
  });
});

describe('release candidate — drift detection', () => {
  it('reports FROZEN against the live corpus it was just sealed from', async () => {
    const c = await sealReleaseCandidate(sql, 'abc1234def5678');
    const drift = await checkCandidateDrift(sql, c);
    assert.equal(drift.state, 'FROZEN', drift.moved.map((m) => String(m.field)).join(', '));
    assert.equal(drift.moved.length, 0);
  });

  it('reports MUTATED and NAMES the field when one moves — the detector can fire', async () => {
    const c = await sealReleaseCandidate(sql, 'abc1234def5678');
    // Doctoring the sealed value is the same observation as the corpus moving:
    // the check compares sealed against live, and only the difference matters.
    const doctored = {
      ...c,
      corpus: { ...c.corpus, statuteRefsLinked: c.corpus.statuteRefsLinked - 1 },
    };
    const drift = await checkCandidateDrift(sql, doctored);
    assert.equal(drift.state, 'MUTATED');
    assert.equal(drift.moved.length, 1);
    assert.equal(drift.moved[0]?.field, 'statuteRefsLinked');
    // Both values, so the delta is readable without a second query.
    assert.equal(drift.moved[0]?.sealed, c.corpus.statuteRefsLinked - 1);
    assert.equal(drift.moved[0]?.now, c.corpus.statuteRefsLinked);
  });

  it('a moved reltuples ESTIMATE does NOT make a candidate MUTATED', async () => {
    const c = await sealReleaseCandidate(sql, 'abc1234def5678');
    // ANALYZE rewrites these without a row changing. If they were compared, a
    // routine autovacuum would report corpus mutation and the field would be
    // learned-ignored within a day.
    const doctored = {
      ...c,
      corpus: {
        ...c.corpus,
        judgmentsEstimate: c.corpus.judgmentsEstimate + 50_000,
        judgmentCitationsEstimate: c.corpus.judgmentCitationsEstimate + 50_000,
      },
    };
    const drift = await checkCandidateDrift(sql, doctored);
    assert.equal(drift.state, 'FROZEN', 'an estimate is not evidence of mutation');
    // Reported, though — never judged, never hidden.
    assert.equal(drift.estimatesInformational.length, 2);
    assert.notEqual(
      drift.estimatesInformational[0]?.sealed,
      drift.estimatesInformational[0]?.now,
      'the informational delta must still be visible',
    );
  });

  it('the exact drift signal is index-backed and present', async () => {
    const c = await sealReleaseCandidate(sql, 'abc1234def5678');
    // `newestJudgmentCreatedAt` is what actually catches an insert. If it is
    // null the detector has nothing exact to compare and the FROZEN above is
    // resting on the small tables alone.
    assert.ok(c.corpus.newestJudgmentCreatedAt, 'no exact insert signal — drift detection is weaker');
  });
});

describe('release candidate — who is writing', () => {
  it('asks Postgres, and does not report our own read as a writer', async () => {
    const writers = await corpusWritersFromPostgres(sql);
    // This test's own backend is running a SELECT against pg_locks and holds no
    // write lock; a detector that counted itself would report a writer forever.
    // The first version of this check reported another lane's read-only SELECT
    // as a writer because its SQL text contained the word "statute".
    for (const w of writers) {
      assert.ok(
        ['RowExclusiveLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock'].includes(
          w.lockMode,
        ),
        `${w.lockMode} is not a write lock and must not be reported as one`,
      );
    }
  });
});
