#!/usr/bin/env node
/**
 * REMOVE REGISTRY DESPATCH STAMPS FROM `judgment_citation_keys`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REGRESSION LCC CAUSED ON 24 AUG, AND THE ONLY PART OF IT THAT IS NOT
 * ALREADY FIXED IN CODE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.neutral_citation` on a set of Madras judgments holds a despatch
 * stamp rather than a citation — `2011:NOVEMBER:12`. Before the citation-keys
 * catch-up they carried no key row, so the resolver answered `TARGET_NOT_HELD`
 * and they were harmless. The catch-up indexed `neutral_citation` wholesale and
 * made them resolver INPUTS. NEW2 measured the result (bus 1112):
 *
 *     **75 non-citation keys now resolve to exactly ONE judgment each.**
 *
 * That is a false pin, which `docs/CITATION_HARNESS.md` forbids outright, and it
 * is the failure mode the whole product is built to prevent.
 *
 * Two code fixes already landed and neither of them cleans the table:
 *
 *   * `resolver.ts` refuses a despatch stamp at the gate, so one cannot reach an
 *     advocate through the resolver;
 *   * `citation-keys-cli.ts` no longer indexes one, so the rows do not come back.
 *
 * This removes the rows that are already there. `judgments.neutral_citation` is
 * the second of three identity arms, and anything else that reads this table
 * inherits whatever is in it — a gate on one consumer is not a clean index.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It never touches `judgments`.** The stamp stays in `neutral_citation`
 * exactly as the registry published it. This is a derived INDEX, rebuildable
 * from the source at any time, and correcting the source is a different
 * question with a different owner.
 *
 * **The pattern is anchored and month-name-bound.** `^[0-9]{4}<MONTH>[0-9]{1,2}$`
 * on the normalised key. A real citation cannot match it: no reporter or court
 * token is an English month name, and the anchors mean nothing longer matches.
 *
 * **It prints the distinct keys before deleting anything**, and `--confirm` is
 * required. A delete from the citation index is not a thing to run blind.
 */
import postgres from 'postgres';

const CONFIRM = process.argv.includes('--confirm');

/** Must stay identical to `resolver.ts`'s `DESPATCH_STAMP_KEY` and to the
 *  predicate in `citation-keys-cli.ts`. Three copies is two too many, but they
 *  live in three languages (TS regex, SQL regex, SQL regex) and a shared
 *  constant would have to be a string that none of them can verify. */
const RE = '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$';

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  try {
    await sql`SET statement_timeout = '300s'`;

    const [before] = await sql`
      SELECT count(*)::text AS rows,
             count(DISTINCT citation_key)::text AS keys,
             count(DISTINCT judgment_id)::text AS judgments
        FROM judgment_citation_keys WHERE citation_key ~ ${RE}`;

    if (Number(before.rows) === 0) {
      console.log('no despatch-stamp keys indexed — nothing to do');
      return 0;
    }

    const [pins] = await sql`
      SELECT count(*)::text AS n FROM (
        SELECT citation_key FROM judgment_citation_keys
         WHERE citation_key ~ ${RE}
         GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1) t`;

    const sample = await sql`
      SELECT DISTINCT citation_key FROM judgment_citation_keys
       WHERE citation_key ~ ${RE} ORDER BY citation_key LIMIT 10`;

    console.log(
      `${before.rows} key row(s), ${before.keys} distinct key(s), ${before.judgments} judgment(s)`,
    );
    console.log(`of those keys, ${pins.n} resolve to exactly ONE judgment — the false pins`);
    console.log('sample:', sample.map((r) => r.citation_key).join(', '));

    /**
     * The safety check that matters: nothing here may be a real citation. A key
     * that also appears on a judgment whose `neutral_citation` does NOT match the
     * stamp pattern would mean the pattern is catching something it should not.
     */
    const [collision] = await sql`
      SELECT count(*)::text AS n
        FROM judgment_citation_keys k
        JOIN judgments j ON j.id = k.judgment_id
       WHERE k.citation_key ~ ${RE}
         AND upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) !~ ${RE}`;
    if (Number(collision.n) > 0) {
      console.error(
        `\nREFUSING — ${collision.n} matching key row(s) belong to a judgment whose ` +
          'neutral_citation is NOT a despatch stamp. The pattern is catching something real.',
      );
      return 1;
    }

    if (!CONFIRM) {
      console.log('\ndry run — pass --confirm to delete');
      return 0;
    }

    const deleted = await sql`DELETE FROM judgment_citation_keys WHERE citation_key ~ ${RE}`;
    const [after] = await sql`
      SELECT count(*)::text AS n FROM judgment_citation_keys WHERE citation_key ~ ${RE}`;
    console.log(`\ndeleted ${deleted.count} row(s); ${after.n} remain`);
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
