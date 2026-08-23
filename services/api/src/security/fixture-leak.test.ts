/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TEST FIXTURES THAT ESCAPED INTO THE CORPUS — MADE VISIBLE, NEVER DELETED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On 22 August a census for synthetic `Test Court` rows returned **0**, and the
 * finding was written up as "searched for, not found". On 23 August the same
 * census returned **6**. Both were true. The population is TRANSIENT: every
 * suite that inserts a judgment deletes it in `after`, so a census answers 0 or
 * N depending entirely on whether a suite happened to be mid-run when somebody
 * looked.
 *
 * The six that were found were written in one ten-minute window by a concurrent
 * session, on the same morning a suite died with a Postgres
 * `could not read blocks … Invalid argument`. **A killed process does not run
 * its `after` hook.** That is not a defect in any test; it is what a crash does.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST DOES NOT DELETE ANYTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A sweeper is the obvious answer and it is the wrong one twice over. It is a
 * DELETE against `judgments` running on every test invocation, which is a
 * destructive operation nobody reviewed on a table holding 18M rows of law. And
 * it would hide the thing worth knowing — that a run crashed — by tidying up
 * after it. `FQ-TEST-COURT-ROWS` is a founder-gated item precisely so that no
 * agent deletes corpus rows on its own recommendation.
 *
 * So this REPORTS. A failure here means "a previous run crashed and left rows
 * behind", which is information, and the remedy is a human deciding.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AGE WINDOW IS THE WHOLE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Four sessions share this database and one of them may be running its suite
 * right now. Rows that are seconds old are a LIVE run and must not fail anyone
 * else's build; rows that are an hour old are debris. Without the window this
 * test would be a flake generator, which is worse than no test — a suite that
 * cries wolf gets muted, and then it is not watching anything.
 *
 * `test://` is the discriminator, and it is chosen because it cannot collide
 * with real law. Every genuine judgment carries an `http(s)` source, because
 * that is where it was fetched from. The predicates somebody would reach for
 * first are both dangerous: `case_number ILIKE '%TEST%'` matches **Testamentary**
 * probate cases, and `case_title ILIKE 'SYNTHETIC%'` matches
 * *SYNTHETICS & CHEMICALS LTD. v. STATE OF U.P.*, a Constitution Bench
 * authority.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

/**
 * `statement_timeout` on the connection, because this guard runs inside other
 * people's test runs and must never be the thing that hangs one. If the box is
 * too busy to answer in three seconds, the honest outcome is a cancelled query,
 * not a suite that sits for two minutes.
 */
const sql = postgres(process.env['DATABASE_URL'] ?? '', {
  max: 2,
  onnotice: () => {},
  connection: { statement_timeout: 3000 },
});

/** Older than this and a fixture is debris, not a live run. */
const STALE_MINUTES = 60;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SIX THAT ARE ALREADY THERE — RECORDED, NOT FORGIVEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These exist right now and this lane may not delete them: rows in `judgments`
 * are corpus data, deletion is founder-gated as `FQ-TEST-COURT-ROWS`, and the
 * round's own instruction on this item is DO NOTHING DESTRUCTIVE.
 *
 * That leaves a genuinely bad choice between a test that is permanently red —
 * which gets muted, and a muted test watches nothing — and a test that passes
 * while six fixtures sit in the corpus.
 *
 * This is the third option: the six are enumerated BY ID, so they cannot fail
 * the build, and **a seventh still can**. The list is the evidence, and shrinking
 * it is the only edit that should ever happen to it. Adding an id here to make a
 * build green would be visible in a diff as exactly what it is.
 *
 * Ids from the 23 Aug re-census, `docs/ops/lcc/TEST_COURT_ROWS_FINDING.md`.
 */
const KNOWN_LEAKED_FIXTURES: readonly string[] = [
  '6fd21632-11bb-4aec-be28-3de62befb65f', // SYNTHETIC — Assembly Fixture
  'd4ca2129-d6f8-44c6-b9f9-b8a913bad0b8', // SYNTHETIC — Authorities Fixture
  '194290da-dcb2-4d0f-bd78-e51880a522fd', // SYNTHETIC — Replacement Fixture
  '00d958ce-6d32-4599-8516-5a6cc0379bc3', // SYNTHETIC — Set Aside Fixture
  'd990e6a7-209a-4e1f-b1d1-c46792b05ea6', // SYNTHETIC — Still Good Law For Now
  '7d75f737-4834-4f8d-9ea5-c0f5ba3f6d03', // SYNTHETIC — Reporter Citation Only
];

after(async () => {
  await sql.end({ timeout: 5 });
});

describe('test fixtures have not escaped into the corpus', () => {
  it(`no test:// judgment is older than ${STALE_MINUTES} minutes`, async () => {
    /**
     * `court = 'Test Court'` is the FIRST predicate and that is a performance
     * decision with a correctness consequence. `judgments_court_idx` makes it an
     * index scan over a handful of rows; leading with `source_url LIKE 'test://%'`
     * instead is a sequential scan of a 151 GB table, which is not a guard, it is
     * an outage — measured, it blew a two-minute budget on this box.
     *
     * `source_url` is then checked on the tiny result set, so the discriminator is
     * still the one that cannot collide with real law.
     */
    const rows = await sql<
      { id: string; case_title: string; source_url: string; age_minutes: string }[]
    >`
      SELECT id, case_title, source_url,
             round(extract(epoch FROM (now() - created_at)) / 60)::text AS age_minutes
        FROM judgments
       WHERE court = 'Test Court'
         AND source_url LIKE 'test://%'
         AND created_at < now() - interval '${sql.unsafe(String(STALE_MINUTES))} minutes'
       ORDER BY created_at
       LIMIT 50`;

    const unrecorded = rows.filter((r) => !KNOWN_LEAKED_FIXTURES.includes(r.id));

    // The recorded six are still reported on every run. Silence about them would
    // be the muting this design exists to avoid; they simply do not fail a build
    // that nobody is allowed to make green.
    const recorded = rows.length - unrecorded.length;
    if (recorded > 0) {
      console.log(
        `  note: ${recorded} KNOWN leaked fixture(s) still in judgments, founder-gated ` +
          'as FQ-TEST-COURT-ROWS. Not deleted by this lane.',
      );
    }

    assert.deepEqual(
      unrecorded.map((r) => `${r.case_title} (${r.age_minutes}m, ${r.id})`),
      [],
      `${unrecorded.length} NEW test fixture(s) survived in the judgments table beyond ` +
        `${STALE_MINUTES} minutes. A run was killed before its cleanup. NOT deleted by ` +
        'this test on purpose — see the module note and ' +
        'docs/ops/lcc/TEST_COURT_ROWS_FINDING.md. Add the id to KNOWN_LEAKED_FIXTURES ' +
        'ONLY as a deliberate, reviewed record — never to make a build green.',
    );
  });

  it('the discriminator is sound: no REAL judgment carries a test:// source', async () => {
    // The claim the whole guard rests on. If a real ingest ever wrote a
    // `test://` source_url, the predicate above would be matching corpus data
    // and this test would be dangerous rather than useful.
    const [row] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM judgments
       WHERE court = 'Test Court' AND source_url NOT LIKE 'test://%'`;
    assert.equal(
      row!.n,
      '0',
      'a Test Court row exists WITHOUT a test:// source. Either a fixture stopped ' +
        'marking itself, or something real is sitting under that court name. Either ' +
        'way the discriminator is no longer safe and nothing may be deleted on it.',
    );
  });
});
