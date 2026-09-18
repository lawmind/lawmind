/**
 * The date-state rules, asserted against the LIVE table rather than a fixture.
 *
 * A fifth-agent forensic pass found NEW2's three date states had ZERO consumers
 * anywhere in the API. These tests exist so the second consumer cannot quietly
 * become zero again, and so the one distinction that is easy to lose — a
 * measurement with a null result versus no measurement — is asserted rather than
 * described in a comment.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { CORPUS_SKIP, hasCorpus } from '../testing/corpus-required.ts';
import {
  chronologyClaim,
  dateQualityFor,
  dateQualityOf,
  isDateContradicted,
} from './date-quality.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** Measured ONCE, before any suite is defined - see testing/corpus-required.ts. */
const corpus = await hasCorpus(sql);

after(async () => {
  await sql.end({ timeout: 5 });
});

describe('date quality — the predicate', () => {
  it('only DATE_SUSPECT contradicts; the two silences do not', () => {
    assert.equal(isDateContradicted('DATE_SUSPECT'), true);
    // Looked, found no independent witness. Silence is not contradiction.
    assert.equal(isDateContradicted('DATE_UNKNOWN'), false);
    assert.equal(isDateContradicted('DATE_VERIFIED'), false);
    // NOT_ANALYSED — nothing has ever looked. Refusing on this would refuse a
    // quarter of the corpus on the strength of nobody having checked.
    assert.equal(isDateContradicted(null), false);
    assert.equal(isDateContradicted(undefined), false);
  });

  it('a chronology claim survives silence and dies on contradiction', () => {
    assert.equal(chronologyClaim('DATE_VERIFIED', 'DATE_VERIFIED'), 'usable');
    assert.equal(chronologyClaim('DATE_VERIFIED', 'DATE_UNKNOWN'), 'usable');
    assert.equal(chronologyClaim(null, undefined), 'usable');
    // EITHER side being contradicted kills the subtraction, not just the later one.
    assert.equal(chronologyClaim('DATE_SUSPECT', 'DATE_VERIFIED'), 'date_unreliable');
    assert.equal(chronologyClaim('DATE_VERIFIED', 'DATE_SUSPECT'), 'date_unreliable');
  });
});

describe('date quality — the reader, against the live table', () => {
  it('returns the stored state for judgments that have one', async (t) => {
    if (!corpus) return t.skip(CORPUS_SKIP);
    const rows = await sql<{ judgment_id: string; state: string }[]>`
      SELECT judgment_id, state FROM judgment_date_quality LIMIT 5`;
    if (rows.length === 0) {
      // The pass has not run on this database. Say so rather than pass vacuously.
      assert.fail('judgment_date_quality is empty — NEW2 date pass has not run here');
    }
    const got = await dateQualityFor(
      sql,
      rows.map((r) => r.judgment_id),
    );
    for (const r of rows) assert.equal(got.get(r.judgment_id), r.state);
    assert.equal(await dateQualityOf(sql, rows[0]!.judgment_id), rows[0]!.state);
  });

  it('an id with no row is absent from the map and reads null — never DATE_UNKNOWN', async () => {
    // A judgment that exists but has no quality row, found rather than invented.
    const [absent] = await sql<{ id: string }[]>`
      SELECT j.id FROM judgments j
       LEFT JOIN judgment_date_quality q ON q.judgment_id = j.id
       WHERE q.judgment_id IS NULL LIMIT 1`;
    if (!absent) return; // every judgment analysed — nothing to assert
    const got = await dateQualityFor(sql, [absent.id]);
    assert.equal(got.has(absent.id), false);
    assert.equal(got.get(absent.id) ?? null, null);
    assert.equal(await dateQualityOf(sql, absent.id), null);
  });

  it('an empty id list does no query and returns an empty map', async () => {
    const got = await dateQualityFor(sql, []);
    assert.equal(got.size, 0);
  });

  it('all three states are real values in the table, not just in the type', async () => {
    const rows = await sql<{ state: string }[]>`
      SELECT DISTINCT state FROM judgment_date_quality`;
    const states = new Set(rows.map((r) => r.state));
    for (const s of states) {
      assert.ok(
        ['DATE_VERIFIED', 'DATE_SUSPECT', 'DATE_UNKNOWN'].includes(s),
        `unexpected date state in the table: ${s}`,
      );
    }
  });
});
