/**
 * Every FAIL branch below is exercised on purpose.
 *
 * A gate whose failure path has never run is a gate nobody has seen work. LCC
 * lost two rounds on `scripts/migration/smoke.mjs` reporting "index unused"
 * when the test itself was wrong, and only caught it by running the test
 * against a database known to be healthy. These are the cheap version of that
 * discipline: the grader is fed a known-bad input and must say so.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { StructuredOutcome } from '@lawmind/api/search/structured';

import {
  classifyDatabaseUrl,
  gradeAmbiguous,
  gradeCitationIdentity,
  gradeDuplicateCollapse,
  gradeExactSpan,
  gradeGeneratedBehaviour,
  gradeGeneratedFlag,
  gradeNamedResolution,
  gradeNoMatch,
  gradeOverruled,
  gradeRowCount,
  summarise,
} from './post-migration.ts';

// ─────────────────────────────────────────────────────────────────────────────
// The Railway refusal
// ─────────────────────────────────────────────────────────────────────────────

test('accepts localhost', () => {
  const v = classifyDatabaseUrl('postgres://u:p@localhost:5432/lawmind');
  assert.equal(v.ok, true);
});

test('accepts 127.0.0.1', () => {
  assert.equal(classifyDatabaseUrl('postgres://u:p@127.0.0.1:5432/lawmind').ok, true);
});

test('refuses the Railway proxy host by name', () => {
  const v = classifyDatabaseUrl('postgres://u:p@hayabusa.proxy.rlwy.net:24909/railway');
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.match(v.reason, /rollback copy/);
  assert.match(v.reason, /rlwy/);
});

test('refuses a railway.app host', () => {
  const v = classifyDatabaseUrl('postgres://u:p@containers-us-west-1.railway.app:6543/railway');
  assert.equal(v.ok, false);
});

test('refuses DATABASE_PUBLIC_URL by VARIABLE NAME even when it points at localhost', () => {
  const v = classifyDatabaseUrl('postgres://u:p@localhost:5432/lawmind', 'DATABASE_PUBLIC_URL');
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.match(v.reason, /public proxy variable/);
});

/**
 * The allowlist earning its keep: this host contains none of the Railway
 * markers, so a denylist would let it through. A tunnel or a new proxy name is
 * exactly this shape.
 */
test('refuses an arbitrary remote host that matches no Railway marker', () => {
  const v = classifyDatabaseUrl('postgres://u:p@db.example.internal:5432/lawmind');
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.match(v.reason, /not this machine/);
});

test('refuses an unset url', () => {
  assert.equal(classifyDatabaseUrl(undefined).ok, false);
  assert.equal(classifyDatabaseUrl('').ok, false);
});

test('refuses an unparseable url rather than guessing at its host', () => {
  const v = classifyDatabaseUrl('not a url at all');
  assert.equal(v.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Class A / B
// ─────────────────────────────────────────────────────────────────────────────

function hit(judgmentId: string, caseTitle = 'SOME CASE') {
  return {
    judgmentId,
    caseTitle,
    neutralCitation: null,
    reporterCitations: [],
    court: 'Supreme Court of India',
    judgmentDate: '1994-03-11',
    caseNumber: null,
    bench: null,
    overruledStatus: 'none',
    overruledByJudgmentId: null,
    overruledParas: null,
    overruledNote: null,
    /**
     * LCC's P0 field, added to `StructuredHit` 22 Aug. `TEXT_UNKNOWN` is what an
     * unconvicted document honestly is — there is no CLEAN state, because no
     * writer in this corpus has ever proved an extraction faithful. A fixture
     * asserting anything stronger would be asserting something the schema
     * cannot represent.
     */
    bodyText: { state: 'TEXT_UNKNOWN' as const, grade: 'NONE' as const, evidenceWithheld: false },
  };
}

const matched = (ids: string[], titles?: string[]): StructuredOutcome => ({
  kind: 'matched',
  parsed: 'cite',
  total: ids.length,
  hits: ids.map((id, i) => hit(id, titles?.[i])),
});

test('class A passes when the citation resolves to the same judgment id', () => {
  const c = gradeCitationIdentity('a1', '1986 INSC 207', 'abc', matched(['abc']));
  assert.equal(c.verdict, 'PASS');
});

test('class A FAILS when the citation resolves to a different id', () => {
  const c = gradeCitationIdentity('a1', '1986 INSC 207', 'abc', matched(['xyz']));
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /DIFFERENT judgment/);
});

test('class A FAILS when the citation stops resolving', () => {
  const c = gradeCitationIdentity('a1', '1986 INSC 207', 'abc', {
    kind: 'no_match',
    parsed: 'cite',
  });
  assert.equal(c.verdict, 'FAIL');
});

test('class A FAILS when a previously unique citation became ambiguous', () => {
  const c = gradeCitationIdentity('a1', '1986 INSC 207', 'abc', {
    kind: 'ambiguous',
    parsed: 'cite',
    total: 2,
    hits: [hit('abc'), hit('def')],
  });
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /AMBIGUOUS/);
});

/** The in-process shape of the production incident `deployed-safety.ts` exists for. */
test('class A FAILS on the semantic fall-through signature', () => {
  const c = gradeCitationIdentity('a1', '1986 INSC 207', 'abc', { kind: 'not_structured' });
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /fall-through to semantic search/);
});

test('class B passes when the known ambiguous citation stays ambiguous', () => {
  const c = gradeAmbiguous('b1', '2020 INSC 189', {
    kind: 'ambiguous',
    parsed: 'cite',
    total: 3,
    hits: [hit('a'), hit('b'), hit('c')],
  });
  assert.equal(c.verdict, 'PASS');
});

test('class B FAILS when ambiguity collapses into one confident answer', () => {
  const c = gradeAmbiguous('b1', '2020 INSC 189', matched(['a']));
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /collapsed to a single confident answer/);
});

test('class B FAILS when the ambiguous citation stops matching anything', () => {
  const c = gradeAmbiguous('b1', '2020 INSC 189', { kind: 'no_match', parsed: 'cite' });
  assert.equal(c.verdict, 'FAIL');
});

test('class B passes when an impossible citation returns nothing', () => {
  const c = gradeNoMatch('b2', '(9999) 99 SCC 999', { kind: 'no_match', parsed: 'cite' });
  assert.equal(c.verdict, 'PASS');
});

test('class B FAILS when an impossible citation returns real authorities', () => {
  const c = gradeNoMatch('b2', '(9999) 99 SCC 999', matched(['a', 'b']));
  assert.equal(c.verdict, 'FAIL');
});

test('the named Bommai probe passes on a title match', () => {
  const c = gradeNamedResolution(
    'a-bommai',
    '(1994) 3 SCC 1',
    'BOMMAI',
    matched(['x'], ['S.R. BOMMAI v. UNION OF INDIA']),
  );
  assert.equal(c.verdict, 'PASS');
});

test('the named Bommai probe FAILS when a different case comes back', () => {
  const c = gradeNamedResolution(
    'a-bommai',
    '(1994) 3 SCC 1',
    'BOMMAI',
    matched(['x'], ['KESAVANANDA BHARATI']),
  );
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /different case/);
});

test('the named Bommai probe reports an explicit not-found as INFO, never PASS', () => {
  const c = gradeNamedResolution('a-bommai', '(1994) 3 SCC 1', 'BOMMAI', {
    kind: 'no_match',
    parsed: 'cite',
  });
  assert.equal(c.verdict, 'INFO');
});

// ─────────────────────────────────────────────────────────────────────────────
// Class C
// ─────────────────────────────────────────────────────────────────────────────

const expectedOverruled = {
  id: 'ffda795d-e296-4f72-918d-3d425a0c1ba6',
  caseTitle: 'NEW INDIA ASSURANCE CO. LTD. v. R. SRINIVASAN',
  overruledStatus: 'set_aside',
  overruledByJudgmentId: 'fb20f8d5-c54f-4087-b092-92b43cb166a5',
};

test('class C passes when currentness is unchanged', () => {
  const c = gradeOverruled(expectedOverruled, {
    overruled_status: 'set_aside',
    overruled_by_judgment_id: 'fb20f8d5-c54f-4087-b092-92b43cb166a5',
  });
  assert.equal(c.verdict, 'PASS');
});

/** The silent one: the row reads fine and the law has quietly come back to life. */
test('class C FAILS when set_aside comes back as none', () => {
  const c = gradeOverruled(expectedOverruled, {
    overruled_status: 'none',
    overruled_by_judgment_id: null,
  });
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /shown this as good law/);
});

test('class C FAILS when the overruling judgment changed', () => {
  const c = gradeOverruled(expectedOverruled, {
    overruled_status: 'set_aside',
    overruled_by_judgment_id: '00000000-0000-0000-0000-000000000000',
  });
  assert.equal(c.verdict, 'FAIL');
});

test('class C FAILS when the row is gone entirely', () => {
  const c = gradeOverruled(expectedOverruled, null);
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /GONE/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Class D
// ─────────────────────────────────────────────────────────────────────────────

const FULL = 'The appellant contends that the notice was never served upon him.';

test('class D passes when the span sits byte-exact at its offset', () => {
  const c = gradeExactSpan(
    'd1',
    { text: 'notice was never served', charOffset: 32, charLength: 23 },
    FULL,
  );
  assert.equal(c.verdict, 'PASS');
});

/** The migration risk that is not a null: same offsets, shifted text underneath. */
test('class D FAILS when full_text shifted under the span', () => {
  const c = gradeExactSpan(
    'd1',
    { text: 'notice was never served', charOffset: 34, charLength: 23 },
    FULL,
  );
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /shifted/);
});

test('class D reports a legitimately absent span as INFO, not FAIL', () => {
  assert.equal(gradeExactSpan('d1', null, FULL).verdict, 'INFO');
});

test('class D FAILS when a span exists but its judgment has no full_text', () => {
  const c = gradeExactSpan('d1', { text: 'x', charOffset: 0, charLength: 1 }, null);
  assert.equal(c.verdict, 'FAIL');
});

// ─────────────────────────────────────────────────────────────────────────────
// Class E
// ─────────────────────────────────────────────────────────────────────────────

test('class E passes when every content_hash is distinct', () => {
  assert.equal(gradeDuplicateCollapse('e1', ['h1', 'h2', 'h3']).verdict, 'PASS');
});

test('class E FAILS when one document occupies two slots', () => {
  const c = gradeDuplicateCollapse('e1', ['h1', 'h2', 'h1']);
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /more than one result slot/);
});

/** Absent is not equal — nulls are never collapsed and must never be flagged. */
test('class E treats repeated NULL hashes as fine', () => {
  const c = gradeDuplicateCollapse('e1', [null, null, 'h1', null]);
  assert.equal(c.verdict, 'PASS');
});

// ─────────────────────────────────────────────────────────────────────────────
// Class H — the defect a name/type/nullability comparison would have missed
// ─────────────────────────────────────────────────────────────────────────────

test('class H passes on a stored generated column with the declared expression', () => {
  const c = gradeGeneratedFlag(
    'judgments',
    'full_text_tsv',
    's',
    "to_tsvector('english'::regconfig, full_text)",
    'to_tsvector(\'english\', "full_text")',
  );
  assert.equal(c.verdict, 'PASS');
});

test('class H FAILS when the column survived as a plain column', () => {
  const c = gradeGeneratedFlag(
    'judgments',
    'full_text_tsv',
    '',
    null,
    'to_tsvector(\'english\', "full_text")',
  );
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /NOT a stored generated column/);
});

test('class H FAILS when the expression itself changed', () => {
  const c = gradeGeneratedFlag(
    'judgments',
    'full_text_tsv',
    's',
    "to_tsvector('simple'::regconfig, full_text)",
    'to_tsvector(\'english\', "full_text")',
  );
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /DIFFERENT expression/);
});

test('class H behaviour passes when insert populates and update recomputes', () => {
  assert.equal(gradeGeneratedBehaviour('h1', "'alpha':1", "'beta':1").verdict, 'PASS');
});

test('class H behaviour FAILS when a fresh insert leaves the tsvector empty', () => {
  const c = gradeGeneratedBehaviour('h1', '', null);
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /not being applied to writes/);
});

/** The nastiest of the three: populated, so it looks maintained, but frozen. */
test('class H behaviour FAILS when the tsvector does not change on update', () => {
  const c = gradeGeneratedBehaviour('h1', "'alpha':1", "'alpha':1");
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /no longer derived/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Counts and the report
// ─────────────────────────────────────────────────────────────────────────────

test('row count passes only on exact equality with the frozen source', () => {
  assert.equal(gradeRowCount('r', 'C', 7_296_068, 7_296_068).verdict, 'PASS');
});

test('row count FAILS on rows lost', () => {
  const c = gradeRowCount('r', 'C', 7_296_068, 7_295_000);
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /did not survive/);
});

/** More rows is not "better" — it means the comparison base no longer holds. */
test('row count FAILS on rows GAINED', () => {
  const c = gradeRowCount('r', 'C', 7_296_068, 7_296_070);
  assert.equal(c.verdict, 'FAIL');
  assert.match(c.detail, /something wrote to local/);
});

test('a report passes only when nothing FAILED, and INFO is neutral', () => {
  const r = summarise('now', 'localhost', [
    gradeDuplicateCollapse('e1', ['h1']),
    gradeExactSpan('d1', null, FULL),
  ]);
  assert.equal(r.passed, true);
  assert.deepEqual(r.counts, { pass: 1, fail: 0, info: 1 });
});

/**
 * The 17 Aug accumulation: eight `span-retrieval-hybrid-*` ids appeared twice in
 * one artefact because the E/F stage emits `cls: 'D'` checks while the resume
 * logic carries class D forward. 65 entries, 57 checks, and `pass: 60` was about
 * to be published as the migration verdict.
 */
test('a check graded twice is counted ONCE, and the collapse is named', () => {
  const first = gradeExactSpan('span-retrieval-hybrid-bff546dd', null, FULL);
  const r = summarise('now', 'localhost', [
    first,
    gradeDuplicateCollapse('e1', ['h1']),
    first,
  ]);
  assert.equal(r.checks.length, 2);
  assert.deepEqual(r.counts, { pass: 1, fail: 0, info: 1 });
  assert.deepEqual(r.collapsed, ['D/span-retrieval-hybrid-bff546dd']);
});

/** A re-run exists to supersede an earlier grade, so the LAST write must win. */
test('the freshest grade survives a collapse, not the first', () => {
  const stale = gradeExactSpan('d1', null, FULL);
  const fresh = gradeExactSpan('d1', { text: 'x', charOffset: 0, charLength: 1 }, null);
  const r = summarise('now', 'localhost', [stale, fresh]);
  assert.equal(r.checks.length, 1);
  assert.equal(r.checks[0]?.verdict, 'FAIL');
  assert.equal(r.passed, false);
});

/** Absence of the field is not a claim that nothing was collapsed by someone else. */
test('collapsed is absent, not empty, when nothing was collapsed', () => {
  const r = summarise('now', 'localhost', [gradeDuplicateCollapse('e1', ['h1'])]);
  assert.equal(r.collapsed, undefined);
});

test('one FAIL fails the whole report', () => {
  const r = summarise('now', 'localhost', [
    gradeDuplicateCollapse('e1', ['h1']),
    gradeDuplicateCollapse('e2', ['h1', 'h1']),
  ]);
  assert.equal(r.passed, false);
  assert.equal(r.counts.fail, 1);
});
