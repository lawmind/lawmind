/**
 * Extract judgment-to-judgment citation edges into `judgment_citations`.
 *
 *   pnpm --filter @lawmind/ingest run citations [--limit N] [--batch 200] [--reset]
 *
 * Resumable the same way the embed CLI is: a judgment that already has rows is
 * skipped, and each judgment's edges are written in one transaction, so an
 * interrupted run leaves either all of a judgment's edges or none. Half-extracted
 * judgments would understate how often an authority was cited, which is exactly
 * the number treatment analysis reports.
 *
 * Resolution happens against an in-memory index of every form each judgment can
 * be cited by. Building it costs one pass over 38k rows of citation metadata —
 * far cheaper than a per-citation round trip, and it makes the resolve step a map
 * lookup rather than a query.
 */
import postgres from 'postgres';

import { citationKeys, detectTreatment, extractCitations } from './citations.ts';

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v === undefined ? fallback : Number(v);
}

type Row = {
  citing_judgment_id: string;
  cited_judgment_id: string | null;
  citation_text: string;
  normalised_citation: string;
  relationship: string;
  evidence: string | null;
  char_offset: number;
};

async function main(): Promise<void> {
  const limit = arg('--limit', 500);
  const batchSize = arg('--batch', 200);
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 2, ssl: 'require' });

  try {
    if (process.argv.includes('--reset')) {
      const deleted = await sql`DELETE FROM judgment_citations`;
      console.log(`reset: deleted ${deleted.count} edges`);
    }

    // --- the resolution index -----------------------------------------------
    // Every citation form -> judgment id. A judgment carries one neutral citation
    // and any number of reporter citations, and a later court may use any of
    // them; indexing all of them is what lets AIR 1973 SC 1461 and
    // (1973) 4 SCC 225 resolve to the same row.
    console.log('building the resolution index…');
    const known = await sql<
      { id: string; neutral_citation: string | null; reporter_citations: string[] }[]
    >`SELECT id, neutral_citation, reporter_citations FROM judgments`;

    const index = new Map<string, string>();
    let collisions = 0;
    for (const j of known) {
      for (const key of citationKeys({
        neutralCitation: j.neutral_citation,
        reporterCitations: j.reporter_citations ?? [],
      })) {
        // A citation string that maps to two judgments cannot be resolved
        // safely, so it is removed from the index entirely rather than
        // arbitrarily pointed at whichever row was seen first.
        if (index.has(key) && index.get(key) !== j.id) {
          index.set(key, '');
          collisions++;
        } else {
          index.set(key, j.id);
        }
      }
    }
    console.log(
      `index: ${index.size.toLocaleString()} citation forms over ${known.length.toLocaleString()} judgments` +
        ` (${collisions} ambiguous forms neutralised)`,
    );

    // --- the queue ------------------------------------------------------------
    const pending = await sql<{ id: string }[]>`
      SELECT j.id FROM judgments j
      WHERE NOT EXISTS (SELECT 1 FROM judgment_citations c WHERE c.citing_judgment_id = j.id)
      ORDER BY j.judgment_date DESC
      LIMIT ${limit}
    `;
    console.log(`judgments needing extraction: ${pending.length.toLocaleString()}`);
    if (pending.length === 0) return;

    const started = Date.now();
    let edges = 0;
    let resolved = 0;
    let treatments = 0;
    let done = 0;

    for (let i = 0; i < pending.length; i += batchSize) {
      const ids = pending.slice(i, i + batchSize).map((r) => r.id);
      const texts = await sql<{ id: string; full_text: string }[]>`
        SELECT id, full_text FROM judgments WHERE id = ANY(${ids})
      `;

      // Accumulate the whole batch, then write it in ONE transaction.
      //
      // A transaction per judgment costs a round trip per judgment, and over the
      // public proxy that round trip — not the regex, not the resolve — is the
      // bottleneck: 1.2 judgments/s, roughly 9 hours for the corpus. Batching the
      // writes keeps the atomicity guarantee that matters (a judgment's edges all
      // land or none do, because they are all in the same transaction) while
      // cutting round trips by the batch size.
      const batchRows: Row[] = [];

      for (const judgment of texts) {
        const found = extractCitations(judgment.full_text);
        let emitted = 0;

        for (const c of found) {
          const target = index.get(c.normalised);
          // '' marks an ambiguous form; treat it as unresolved rather than guess.
          const citedId = target && target !== judgment.id ? target : null;
          // Measured from the END of the citation: the court's annotation always
          // trails its entry.
          const { relationship, evidence } = detectTreatment(
            judgment.full_text,
            c.offset + c.raw.length,
          );
          if (citedId) resolved++;
          if (relationship !== 'cites') treatments++;
          batchRows.push({
            citing_judgment_id: judgment.id,
            cited_judgment_id: citedId,
            citation_text: c.raw,
            normalised_citation: c.normalised,
            relationship,
            evidence: evidence || null,
            char_offset: c.offset,
          });
          emitted++;
        }

        // A sentinel marks a judgment that genuinely cites nothing, so the
        // resumable query does not re-scan it on every run.
        if (emitted === 0) {
          batchRows.push({
            citing_judgment_id: judgment.id,
            cited_judgment_id: null,
            citation_text: '',
            normalised_citation: '',
            relationship: 'cites',
            evidence: null,
            char_offset: 0,
          });
        }
        edges += emitted;
        done++;
      }

      if (batchRows.length > 0) {
        await sql.begin(async (tx) => {
          // Chunked inside the transaction: a single INSERT with tens of
          // thousands of rows exceeds the parameter limit, and a partial failure
          // there would roll the whole batch back rather than corrupt it.
          const INSERT_CHUNK = 2000;
          for (let k = 0; k < batchRows.length; k += INSERT_CHUNK) {
            const slice = batchRows.slice(k, k + INSERT_CHUNK);
            await tx`INSERT INTO judgment_citations ${tx(slice)} ON CONFLICT DO NOTHING`;
          }
        });
      }

      const secs = (Date.now() - started) / 1000;
      console.log(
        `[${done}/${pending.length}] edges=${edges.toLocaleString()} ` +
          `resolved=${resolved.toLocaleString()} treatments=${treatments.toLocaleString()} ` +
          `elapsed=${secs.toFixed(0)}s (${(done / Math.max(secs, 1)).toFixed(1)} judgments/s)`,
      );
    }

    const [total] = await sql<{ n: string; r: string }[]>`
      SELECT count(*)::text AS n,
             count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::text AS r
      FROM judgment_citations`;
    console.log(
      `\njudgment_citations: ${total?.n} rows, ${total?.r} resolved to a corpus judgment`,
    );

    const breakdown = await sql<{ relationship: string; n: string }[]>`
      SELECT relationship, count(*)::text AS n FROM judgment_citations
      WHERE cited_judgment_id IS NOT NULL GROUP BY relationship ORDER BY count(*) DESC`;
    for (const b of breakdown) console.log(`  ${b.relationship.padEnd(15)} ${b.n}`);
  } finally {
    await sql.end();
  }
}

await main();
