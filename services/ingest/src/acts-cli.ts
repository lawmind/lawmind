/**
 * Bare acts library — every Central Act on indiacode, not a hardcoded three.
 *
 *   pnpm --filter @lawmind/ingest run acts --list        # enumerate only, write nothing
 *   pnpm --filter @lawmind/ingest run acts               # ingest, resuming
 *   pnpm --filter @lawmind/ingest run acts --limit 20
 *
 * `sprints/SPRINT_1.md` LCC task 3 asks for a bare-acts library of 700+ Acts.
 * The corpus holds three — BNS, BNSS, BSA — because `statutes-cli.ts` runs from
 * `CRIMINAL_CODE_HANDLES`, a list written by hand. The index reports **845**
 * Central Acts. The gap was never availability; nothing enumerated them.
 *
 * **Resumable by construction**, like the judgment ingest: Acts already carrying
 * sections are skipped, and `statutes.act_id` is unique so an interrupted run
 * re-writes rather than duplicates. Killing this mid-run costs nothing.
 *
 * **Polite to a government site.** One Act at a time, with a pause between, and
 * a failure on one Act never aborts the run — it is named and the run continues.
 * A partial library is useful; a run that dies on Act 300 of 845 and reports
 * nothing is not.
 */
import postgres from 'postgres';

import { actListingUrl, parseActListing, parseListingTotal, type ActListing } from './indiacode.ts';
import { fetchAct, fetchSections, upsertAct } from './statutes.ts';

const PAGE_SIZE = 100;
/** Between Acts. The site is slow and rate-limits; there is no hurry. */
const PAUSE_MS = Number(process.env['ACTS_PAUSE_MS'] ?? 400);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walk the browse index until it stops yielding new handles. */
async function listAllActs(): Promise<ActListing[]> {
  const all = new Map<string, ActListing>();
  let total: number | null = null;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await fetch(actListingUrl(offset, PAGE_SIZE));
    if (!res.ok) throw new Error(`browse index ${res.status} at offset ${offset}`);
    const html = await res.text();
    total ??= parseListingTotal(html);

    const page = parseActListing(html);
    // Stop on an empty page rather than trusting the reported total: the total is
    // the site's claim, the page is the evidence.
    if (page.length === 0) break;
    for (const a of page) all.set(a.handle, a);
    console.log(
      `  offset ${String(offset).padStart(4)} → ${all.size}${total ? ` of ${total}` : ''}`,
    );
    if (total !== null && all.size >= total) break;
    await sleep(PAUSE_MS);
  }
  return [...all.values()];
}

async function main(): Promise<void> {
  const listOnly = process.argv.includes('--list');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1]);

  console.log('enumerating Central Acts…');
  const acts = await listAllActs();
  console.log(`\n${acts.length} Acts in the index\n`);

  if (listOnly) {
    for (const a of acts.slice(0, 20)) {
      console.log(`  ${a.handle.padEnd(18)} ${a.dateIssued ?? '          '}  ${a.shortTitle}`);
    }
    if (acts.length > 20) console.log(`  … and ${acts.length - 20} more`);
    return;
  }

  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 2 });

  try {
    /**
     * Record the size of the source BEFORE ingesting, and mark the pass
     * incomplete for its duration.
     *
     * Without this, `/statutes` returns a growing count with no denominator and
     * the library screen has no way to tell an advocate whether it is looking at
     * the whole library. A partial set presented as complete means an advocate
     * searching for an Act we have not reached concludes we do not have it.
     */
    await sql`
      INSERT INTO corpus_coverage (source, source_total, enumerated_at, complete, failed_ids)
      VALUES ('indiacode_central_acts', ${acts.length}, now(), false, '{}')
      ON CONFLICT (source) DO UPDATE
        SET source_total = ${acts.length}, enumerated_at = now(),
            complete = false, failed_ids = '{}', updated_at = now()
    `;

    // Resume: an Act that already has sections is done. Counting sections rather
    // than rows in `statutes` matters — an Act whose metadata landed but whose
    // sections failed must be retried, not skipped.
    const done = new Set(
      (
        await sql<{ act_id: string }[]>`
          SELECT s.act_id FROM statutes s
          WHERE EXISTS (SELECT 1 FROM statute_sections sec WHERE sec.statute_id = s.id)`
      ).map((r) => r.act_id),
    );
    console.log(`${done.size} Acts already carry sections — skipping those\n`);

    let ingested = 0;
    let sectionsTotal = 0;
    const failures: { handle: string; title: string; error: string }[] = [];
    const started = Date.now();

    for (const listing of acts) {
      if (ingested >= limit) break;
      try {
        const { act, html } = await fetchAct(listing.handle);
        if (done.has(act.actId)) continue;

        const { sections, missing, duplicateSections } = await fetchSections(act.actId, html);
        const { sections: written } = await upsertAct(sql, act, sections);
        ingested++;
        sectionsTotal += written;
        const mins = ((Date.now() - started) / 60000).toFixed(1);
        console.log(
          `[${String(ingested).padStart(3)}] ${act.shortTitle.slice(0, 56).padEnd(56)} ` +
            `${String(written).padStart(4)} sections  ${mins}m` +
            (missing.length > 0 ? `  MISSING ${missing.length}` : '') +
            (duplicateSections.length > 0 ? `  DUPLICATE ${duplicateSections.length}` : ''),
        );
      } catch (error) {
        // Never abort the run for one Act. Named, counted, and carried to the end
        // so the gaps are known rather than silently absent.
        failures.push({
          handle: listing.handle,
          title: listing.shortTitle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await sleep(PAUSE_MS);
    }

    console.log(`\ningested ${ingested} Acts, ${sectionsTotal} sections`);
    if (failures.length > 0) {
      console.log(`\n${failures.length} Acts failed — re-running retries only these:`);
      for (const f of failures.slice(0, 30)) {
        console.log(
          `  ${f.handle.padEnd(18)} ${f.title.slice(0, 44).padEnd(44)} ${f.error.slice(0, 60)}`,
        );
      }
    }

    /**
     * Complete only if every Act in the index now carries sections AND nothing
     * failed this pass. Reaching the count is not the same as completeness: a
     * run can equal it transiently, or with Acts that failed and were retried
     * into place by an earlier run.
     */
    const [held] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM statutes s
      WHERE EXISTS (SELECT 1 FROM statute_sections sec WHERE sec.statute_id = s.id)`;
    const complete = failures.length === 0 && (held?.n ?? 0) >= acts.length;
    await sql`
      UPDATE corpus_coverage
      SET complete = ${complete},
          failed_ids = ${failures.map((f) => f.handle)},
          updated_at = now()
      WHERE source = 'indiacode_central_acts'`;
    console.log(
      `coverage: ${held?.n ?? 0} of ${acts.length} Acts hold sections — complete=${complete}`,
    );

    const [counts] = await sql<{ acts: string; sections: string }[]>`
      SELECT (SELECT count(*) FROM statutes)::text AS acts,
             (SELECT count(*) FROM statute_sections)::text AS sections`;
    console.log(`\ncorpus now: ${counts?.acts} Acts, ${counts?.sections} sections`);
  } finally {
    await sql.end();
  }
}

await main();
