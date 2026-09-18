/**
 * Extract amendment events from the footnotes we already hold — migration
 * `0041`, Stage 8. `docs/ai/STATUTE_TEMPORAL_STAGE8.md`.
 *
 *   pnpm --filter @lawmind/ingest run statute:amendments            # report only
 *   pnpm --filter @lawmind/ingest run statute:amendments --confirm  # write
 *
 * Dry by default, like every other CLI here. Re-runnable: the unique index on
 * (`statute_section_id`, `ordinal`) makes a second pass update rather than
 * duplicate, so re-running after a parser improvement is safe and is the
 * intended way to apply one.
 *
 * The parser is pure and lives in `statute-amendments.ts`; this file is the
 * database half and holds no parsing rules of its own.
 */
import postgres from 'postgres';

import { parseFootnote } from './statute-amendments.ts';

const BATCH = 500;

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const confirm = process.argv.includes('--confirm');
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  try {
    const sections = await sql<{ id: string; footnote: string }[]>`
      SELECT id, footnote FROM statute_sections
      WHERE footnote IS NOT NULL AND btrim(footnote) <> ''`;
    console.log(`${sections.length} footnoted sections\n`);

    const rows: Record<string, unknown>[] = [];
    const unparsedRows: Record<string, unknown>[] = [];
    const byType: Record<string, number> = {};
    let dated = 0;

    for (const s of sections) {
      const { events, unparsed } = parseFootnote(s.footnote);
      for (const e of events) {
        byType[e.eventType] = (byType[e.eventType] ?? 0) + 1;
        if (e.effectiveDate) dated++;
        rows.push({
          statute_section_id: s.id,
          ordinal: e.ordinal,
          event_type: e.eventType,
          amending_act_raw: e.amendingActRaw,
          amending_act_number: e.amendingActNumber,
          amending_act_year: e.amendingActYear,
          amending_section: e.amendingSection,
          effective_date: e.effectiveDate,
          substituted_text: e.substitutedText,
          ibid_resolved: e.ibidResolved,
          ibid_unresolved: e.ibidUnresolved,
          verbatim: e.verbatim,
        });
      }
      // Never dropped — the silent-drop rule, applied to statutes.
      for (const u of unparsed) unparsedRows.push({ statute_section_id: s.id, verbatim: u });
    }

    console.log(`${rows.length} events  ${JSON.stringify(byType)}`);
    console.log(
      `${dated} carry an effective date, ${rows.length - dated} do not (null, never guessed)`,
    );
    console.log(`${unparsedRows.length} entries could not be read — recorded, not discarded`);

    if (!confirm) {
      console.log('\nreport only. re-run with --confirm to write.');
      return;
    }

    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      await sql`
        INSERT INTO statute_amendments ${sql(slice)}
        ON CONFLICT (statute_section_id, ordinal) DO UPDATE SET
          event_type          = EXCLUDED.event_type,
          amending_act_raw    = EXCLUDED.amending_act_raw,
          amending_act_number = EXCLUDED.amending_act_number,
          amending_act_year   = EXCLUDED.amending_act_year,
          amending_section    = EXCLUDED.amending_section,
          effective_date      = EXCLUDED.effective_date,
          substituted_text    = EXCLUDED.substituted_text,
          ibid_resolved       = EXCLUDED.ibid_resolved,
          ibid_unresolved     = EXCLUDED.ibid_unresolved,
          verbatim            = EXCLUDED.verbatim`;
    }

    // No natural key here, so the table is rebuilt rather than upserted — it is
    // a record of THIS extractor pass, and a stale "could not read" row after
    // the parser improved would overstate the gap.
    await sql`TRUNCATE statute_amendment_unparsed`;
    for (let i = 0; i < unparsedRows.length; i += BATCH) {
      await sql`INSERT INTO statute_amendment_unparsed ${sql(unparsedRows.slice(i, i + BATCH))}`;
    }

    const [check] = await sql<{ events: number; dated: number; unread: number }[]>`
      SELECT (SELECT count(*)::int FROM statute_amendments) AS events,
             (SELECT count(*)::int FROM statute_amendments WHERE effective_date IS NOT NULL) AS dated,
             (SELECT count(*)::int FROM statute_amendment_unparsed) AS unread`;
    console.log(
      `\nin database: ${check?.events} events, ${check?.dated} dated, ${check?.unread} unread`,
    );
  } finally {
    await sql.end();
  }
}

await main();
