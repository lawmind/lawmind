/**
 * Adverse-authority check using ONLY real, already-verified corpus data —
 * `docs/CITATION_HARNESS.md`'s hard rule: "Stale-overruled rate threshold 0
 * — overruled law rendered WITHOUT the LAW MOVED mark is as severe as a
 * hallucination." Never measured end-to-end through retrieval before.
 *
 *   pnpm --filter @lawmind/api overruled:audit [--n 300]
 *
 * No invented adversarial data: every case here IS overruled, IS set_aside,
 * IS doubted, according to `judgments.overruled_status` as WE recorded it —
 * a real, audited relationship already in the corpus, not a fabricated gold
 * label. This asks one question with a factual, checkable answer: when one
 * of these judgments is retrieved through the real search path, does the
 * SAME status the row carries in the database come back out the other end,
 * or does it silently change on the way?
 *
 * Method: for each overruled/doubted judgment, run its own case title as a
 * query (the query most likely to surface it, so this is testing whether the
 * PATH preserves the status, not whether retrieval FINDS obscure authorities
 * — that is a different, harder question this does not claim to answer).
 * When it comes back, `overruledStatus` on the result must equal the current
 * database row exactly. `docs/CITATION_HARNESS.md`: read live at render,
 * never cached — so a stale value here is not a delay, it is a defect.
 */
import postgres from 'postgres';

import { hybridSearch } from './retrieve.ts';
import { sslFor } from '../db-ssl';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const nArg = process.argv.indexOf('--n');
  const n = nArg === -1 ? 300 : Number(process.argv[nArg + 1] ?? 300);

  const sql = postgres(url, { max: 4, ssl: sslFor(url) });
  let exitCode = 0;
  try {
    const [counts] = await sql<
      { total: string; setAside: string; partlySetAside: string; doubted: string }[]
    >`
      SELECT
        count(*) FILTER (WHERE overruled_status != 'none')::text AS total,
        count(*) FILTER (WHERE overruled_status = 'set_aside')::text AS "setAside",
        count(*) FILTER (WHERE overruled_status = 'partly_set_aside')::text AS "partlySetAside",
        count(*) FILTER (WHERE overruled_status = 'doubted')::text AS doubted
      FROM judgments
    `;
    console.log('OVERRULED-STATUS RETRIEVAL AUDIT — real corpus relationships, nothing invented');
    console.log('='.repeat(78));
    console.log(
      `corpus-wide: ${counts?.total} judgments carry a non-'none' overruled_status ` +
        `(set_aside ${counts?.setAside}, partly_set_aside ${counts?.partlySetAside}, doubted ${counts?.doubted})`,
    );

    const rows = await sql<{ id: string; case_title: string; overruled_status: string }[]>`
      SELECT id, case_title, overruled_status FROM judgments
      WHERE overruled_status != 'none'
      ORDER BY random()
      LIMIT ${n}
    `;
    console.log(`\nsampled n=${rows.length} for a real end-to-end retrieval check\n`);

    let notFound = 0;
    let statusMatched = 0;
    let statusStale = 0;

    for (const row of rows) {
      const results = await hybridSearch(sql, row.case_title, null, {}, 10);
      const match = results.find((r) => r.judgmentId === row.id);
      if (!match) {
        // Not found in the top 10 for its OWN title is a recall question,
        // not a status-staleness question -- tracked separately, not
        // counted as a status defect, per this tool's own stated scope.
        notFound++;
        continue;
      }
      if (match.overruledStatus === row.overruled_status) {
        statusMatched++;
      } else {
        statusStale++;
        console.log(
          `  STALE judgment=${row.id} title="${row.case_title.slice(0, 60)}" ` +
            `db=${row.overruled_status} returned=${match.overruledStatus}`,
        );
      }
    }

    console.log('\nRESULTS');
    console.log('='.repeat(78));
    console.log(`  status matched (returned overruledStatus === db row):     ${statusMatched}`);
    console.log(`  status STALE (returned value differs from the db row):    ${statusStale}`);
    console.log(`  not found in top 10 for its own title (recall, not staleness): ${notFound}`);
    console.log(`  checked total: ${statusMatched + statusStale} / ${rows.length} found-and-checked`);

    if (statusStale > 0) {
      console.log('\nSTALE-OVERRULED RATE IS NOT ZERO. This is a defect per CITATION_HARNESS.md, not a warning.');
      exitCode = 1;
    } else {
      console.log('\nstale-overruled rate: 0 -- holds at this sample size.');
    }
  } finally {
    await sql.end();
  }
  process.exitCode = exitCode;
}

await main();
