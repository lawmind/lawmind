/**
 * Build the concordance from the corpus.
 *
 *   pnpm --filter @lawmind/ingest concordance          # measure, write nothing
 *   pnpm --filter @lawmind/ingest concordance --apply  # write the aliases
 *
 * **Dry by default.** This writes the names under which advocates will find
 * judgments, and a wrong one hands them a different case under the citation they
 * typed. The default has to be the safe one.
 */
import postgres from 'postgres';

import { type ParallelPair, aliasKey, findParallel, reconcile } from './concordance.ts';

/**
 * How many separate sightings before an alias is trusted.
 *
 * One is not enough: a single OCR slip in a single judgment would mint an alias
 * nobody can trace. Two independent citing judgments printing the same pairing
 * is a different kind of claim.
 */
const MIN_CORROBORATIONS = 2;

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set.');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 4 });

try {
  console.log(`scanning unresolved AIR and SCC citations${apply ? '' : ' (DRY RUN)'}…`);

  const rows = await sql<{ citation_text: string; after: string }[]>`
    SELECT jc.citation_text,
           substring(j.full_text FROM jc.char_offset FOR 200) AS after
      FROM judgment_citations jc
      JOIN judgments j ON j.id = jc.citing_judgment_id
     WHERE jc.cited_judgment_id IS NULL
       AND (jc.citation_text ILIKE 'AIR%' OR jc.citation_text ILIKE '%SCC%')`;
  console.log(`  ${rows.length} unresolved AIR/SCC citations to examine`);

  const sightings: ParallelPair[] = [];
  for (const r of rows) {
    const p = findParallel(r.citation_text, r.after);
    if (p) sightings.push(p);
  }
  console.log(`  ${sightings.length} carried a parallel SCR citation of the same year`);

  const candidates = reconcile(sightings);
  const contradicted = new Set(sightings.map((s) => aliasKey(s.alias))).size - candidates.length;
  console.log(`  ${candidates.length} distinct aliases survived reconciliation`);
  console.log(`  ${contradicted} dropped because sightings disagreed about the target`);

  const trusted = candidates.filter((c) => c.corroborations >= MIN_CORROBORATIONS);
  console.log(`  ${trusted.length} corroborated by ${MIN_CORROBORATIONS}+ citing judgments`);

  // Resolve the SCR side against the corpus, using the expression migration 0026
  // indexes — the same rule, in SQL.
  const scrKeys = [...new Set(trusted.map((c) => c.scrKey))];
  const resolved = await sql<{ key: string; id: string; n: number }[]>`
    SELECT k.key, min(j.id::text) AS id, count(*)::int AS n
      FROM unnest(${scrKeys}::text[]) AS k(key)
      JOIN judgments j
        ON EXISTS (
             SELECT 1 FROM unnest(j.reporter_citations) AS rc
              WHERE upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) = k.key)
     GROUP BY k.key`;

  // A key matching two judgments resolves to neither — the exactCitation rule.
  const byKey = new Map(resolved.filter((r) => r.n === 1).map((r) => [r.key, r.id]));
  const ambiguous = resolved.filter((r) => r.n > 1).length;

  const final = trusted
    .filter((c) => byKey.has(c.scrKey))
    .map((c) => ({ ...c, judgmentId: byKey.get(c.scrKey)! }));

  console.log(`\n  ${resolved.length} of ${scrKeys.length} SCR keys exist in the corpus`);
  console.log(`  ${ambiguous} rejected for matching more than one judgment`);
  console.log(`\nALIASES READY: ${final.length}`);
  const air = final.filter((f) => f.aliasReporter === 'AIR').length;
  console.log(`  AIR ${air} · SCC ${final.length - air}`);

  console.log('\n  a sample, with the evidence that justified each:');
  for (const f of final.slice(0, 8)) {
    console.log(`    ${f.alias.padEnd(20)} → ${f.judgmentId.slice(0, 8)}  (${f.corroborations}x)`);
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  } else {
    /**
     * Batched. One statement per alias is 4,097 round trips — 34 minutes over a
     * proxy, and the first attempt timed out at ten. The work was never the
     * database's; it was the latency of asking it 4,097 times.
     */
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < final.length; i += CHUNK) {
      const batch = final.slice(i, i + CHUNK).map((f) => ({
        judgment_id: f.judgmentId,
        alias: f.alias,
        alias_key: f.aliasKey,
        alias_reporter: f.aliasReporter,
        corroborations: f.corroborations,
        evidence: f.evidence.slice(0, 500),
      }));
      await sql`
        INSERT INTO judgment_citation_aliases ${sql(batch)}
        ON CONFLICT (alias_key) DO UPDATE SET corroborations = EXCLUDED.corroborations`;
      written += batch.length;
      process.stdout.write(`\r  written ${written}/${final.length}`);
    }
    console.log(`\n\nWROTE ${written} aliases.`);
  }
} finally {
  await sql.end();
}
