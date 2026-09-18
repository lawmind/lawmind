import postgres from 'postgres';

import {
  assertExpectedAct,
  CRIMINAL_CODE_HANDLES,
  fetchAct,
  fetchSections,
  REPEALED_CRIMINAL_CODE_HANDLES,
  upsertAct,
} from './statutes.ts';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 2 });

  try {
    /* `--repealed` loads IPC 1860 / CrPC 1973 / Indian Evidence Act 1872. They
     * are a separate list and a separate flag because they are REPEALED law:
     * they belong in the corpus so a correspondence row's old side can be
     * verified and so a 2019 judgment's section reference resolves, and they
     * must never be served as current law. `enforcement_date` and the repeal
     * are what separate them; §P13 of the round contract. */
    const handles = process.argv.includes('--repealed')
      ? REPEALED_CRIMINAL_CODE_HANDLES
      : CRIMINAL_CODE_HANDLES;

    for (const entry of handles) {
      const { handle, expectTitle } = entry;
      const expectMinistry = 'expectMinistry' in entry ? entry.expectMinistry : undefined;
      const startedAt = Date.now();
      const { act, html } = await fetchAct(handle);
      assertExpectedAct(act, expectTitle, expectMinistry);
      // Recorded, never asserted, for the acts whose ministry has not been read.
      if (expectMinistry === null) {
        console.log(`  ministry as published: ${String(act.ministry)} · act id ${act.actId}`);
      }

      const { sections, missing, duplicateSections } = await fetchSections(act.actId, html);
      const { sections: written } = await upsertAct(sql, act, sections);

      console.log(
        `${act.shortTitle} — act ${act.actNumber}/${act.actYear}, ` +
          `in force ${String(act.enforcementDate)}, ` +
          `${written} sections in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`,
      );
      // Named, never just counted. Re-running fills the gaps: the unique index on
      // (statute_id, section_number) makes that safe.
      if (missing.length > 0) {
        console.log(`  MISSING ${missing.length}: ${missing.slice(0, 40).join(', ')}`);
      }
      if (duplicateSections.length > 0) {
        console.log(
          `  DUPLICATE ${duplicateSections.length}: ${duplicateSections.slice(0, 40).join(', ')}`,
        );
      }
    }

    const rows = await sql<{ short_title: string; n: string }[]>`
      SELECT s.short_title, count(sec.id)::text AS n
      FROM statutes s LEFT JOIN statute_sections sec ON sec.statute_id = s.id
      GROUP BY s.short_title ORDER BY s.short_title
    `;
    console.log('\nin database:');
    for (const r of rows) console.log(`  ${r.short_title} — ${r.n} sections`);
  } finally {
    await sql.end();
  }
}

await main();
