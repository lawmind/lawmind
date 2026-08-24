#!/usr/bin/env node
/**
 * PURGE SYNTHETIC TEST FIXTURES THAT LEAKED INTO THE PRODUCTION CORPUS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `matters/authorities.test.ts` and `briefings/assemble.test.ts` insert
 * synthetic judgments and delete them in `after()`. When a run is killed —
 * a tool timeout, a `Ctrl+C`, a crashed process — the `after()` never runs and
 * the fixtures stay.
 *
 * Sixteen were found on 24 Aug 2026, from three separate crashed runs on 23 Aug.
 * They are not harmless:
 *
 *  * **six carry a non-`none` `overruled_status`** and NEW2's treatment
 *    provenance audit (bus 1098) had to discount them by hand — they inflated
 *    the population of LAW MOVED judgments by 5.8%, 104 against a real 98;
 *  * the repo's own guard test, *"no `test://` judgment is older than 60
 *    minutes"*, fails while they are present — and that guard is a full scan,
 *    because `source_url LIKE 'test://%'` cannot use the index under this
 *    collation, so it costs 40 ms on a quiet box and 51 s on a busy one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE IDENTITY IS TRIPLE-LOCKED, DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A row is a fixture only if ALL THREE hold:
 *
 *     court       = 'Test Court'
 *     source_url  LIKE 'test://%'
 *     case_title  LIKE 'SYNTHETIC %'
 *
 * Any one of them alone could in principle match something real — a court could
 * be named oddly, a source URL could be rewritten, a case title could contain
 * the word. All three together cannot. This is deleting from the corpus, and
 * `CLAUDE.md` §6.4.6 is explicit: never delete without looking at what is
 * actually there.
 *
 * `--confirm` is required. Without it this prints what it WOULD delete and
 * exits, which is the mode to run first.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS CHECKED BEFORE THE FIRST RUN, AND IS CHECKED AGAIN EVERY RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured 24 Aug 2026 against the 16 found:
 *
 *     judgment_annotations                0
 *     matter_authorities                  0
 *     citation_checks                     0
 *     verification_cache                  0
 *     judgment_citations (citing)        16   <- fixture -> fixture
 *     judgment_citations (cited)          0
 *     overruled_by pointers               6   <- fixture -> fixture
 *     referenced by a REAL judgment       0
 *
 * **If any real row references a fixture, this REFUSES.** A fixture that has
 * been saved to somebody's matter is not debris any more; it is a data problem
 * that needs a person, and deleting it would take an advocate's authority out
 * from under them.
 */
import postgres from 'postgres';

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  try {
    await sql`SET statement_timeout = '120s'`;

    const fixtures = await sql`
      SELECT id, case_title, overruled_status::text AS overruled_status, created_at
        FROM judgments
       WHERE court = 'Test Court'
         AND source_url LIKE 'test://%'
         AND case_title LIKE 'SYNTHETIC %'
       ORDER BY created_at`;

    if (fixtures.length === 0) {
      console.log('no leaked fixtures — nothing to do');
      return 0;
    }

    const ids = fixtures.map((f) => f.id);
    console.log(`${fixtures.length} leaked fixture(s):`);
    for (const f of fixtures) {
      console.log(
        `  ${f.created_at.toISOString().slice(0, 19)}  ${f.overruled_status.padEnd(17)}${f.case_title}`,
      );
    }

    /** The refusal. A fixture something real points at is not debris. */
    const [held] = await sql`
      SELECT (
        (SELECT count(*) FROM judgment_annotations WHERE judgment_id = ANY(${ids}::uuid[]))
      + (SELECT count(*) FROM matter_authorities   WHERE judgment_id = ANY(${ids}::uuid[]))
      + (SELECT count(*) FROM citation_checks      WHERE judgment_id_matched = ANY(${ids}::uuid[]))
      + (SELECT count(*) FROM verification_cache   WHERE judgment_id = ANY(${ids}::uuid[]))
      + (SELECT count(*) FROM judgments j          WHERE j.overruled_by_judgment_id = ANY(${ids}::uuid[])
                                                     AND j.court <> 'Test Court')
      )::text AS n`;
    if (Number(held.n) > 0) {
      console.error(
        `\nREFUSING — ${held.n} real row(s) reference these fixtures. That is a data ` +
          'problem for a person, not debris for a script.',
      );
      return 1;
    }

    if (!CONFIRM) {
      console.log('\ndry run — pass --confirm to delete');
      return 0;
    }

    const result = await sql.begin(async (tx) => {
      // The self-referential pointer first, or the delete violates the FK.
      const pointers = await tx`
        UPDATE judgments
           SET overruled_by_judgment_id = NULL, overruled_paras = NULL, overruled_note = NULL
         WHERE overruled_by_judgment_id = ANY(${ids}::uuid[])`;
      const citations = await tx`
        DELETE FROM judgment_citations
         WHERE citing_judgment_id = ANY(${ids}::uuid[])
            OR cited_judgment_id = ANY(${ids}::uuid[])`;
      const keys = await tx`
        DELETE FROM judgment_citation_keys WHERE judgment_id = ANY(${ids}::uuid[])`;
      const judgments = await tx`DELETE FROM judgments WHERE id = ANY(${ids}::uuid[])`;
      return {
        pointers: pointers.count,
        citations: citations.count,
        keys: keys.count,
        judgments: judgments.count,
      };
    });

    console.log(`\ndeleted: ${JSON.stringify(result)}`);
    const [left] = await sql`
      SELECT count(*)::text AS n FROM judgments WHERE court = 'Test Court'`;
    console.log(`Test Court rows remaining: ${left.n}`);
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
