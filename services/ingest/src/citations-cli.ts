/**
 * Extract judgment-to-judgment citation edges into `judgment_citations`.
 *
 *   pnpm --filter @lawmind/ingest run citations [--limit N] [--batch 200] [--reset]
 *   pnpm --filter @lawmind/ingest run citations --rescan [--apply]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * --rescan — for when the EXTRACTOR changed, not the corpus
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The ordinary run is resumable by skipping any judgment that already has rows.
 * That is right when new judgments arrive and exactly wrong when the patterns
 * widen: every judgment already has rows, so a better extractor reaches nothing.
 *
 * `--reset` is the obvious answer and the wrong one. It deletes all 192,197
 * edges, and with them the 77,600 resolutions that three passes of the resolver
 * produced. **`--rescan` re-reads every judgment and inserts only what is new**,
 * leaning on `judgment_citations_unique_edge` (citing_judgment_id,
 * normalised_citation) with `ON CONFLICT DO NOTHING` to decide what "new" means.
 * Nothing existing is touched, so no resolution is lost.
 *
 * It also clears the SENTINEL from any judgment that has stopped citing nothing.
 * A sentinel beside a real edge would break the invariant the resume query
 * depends on — verified against production before this was written: 13,834
 * sentinels over 13,834 distinct judgments, and **zero** judgments carrying both.
 *
 * DRY BY DEFAULT. `CONTINUATION_PROMPT.md` §1: a SELECT that counts what could
 * match is not a WRITE that survives the constraints, and the first citation
 * resolution pass published 49.1% from a query and delivered 40.4% from a write.
 * `--rescan` alone reports; `--rescan --apply` writes.
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
import type postgres from 'postgres';

import {
  citationKeys,
  classifyCitationGraphOccurrence,
  detectTreatment,
  extractCitations,
} from './citations.ts';
import { installCrashGuard } from './crash-guard.ts';
import { openDb } from './db-host.ts';


// Silent deaths cost three runs today; log the cause instead of vanishing.
installCrashGuard('citations');
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

/**
 * Every citation form → the judgment it names. Shared by the ordinary run and by
 * `--rescan` so the two cannot drift into resolving differently.
 *
 * A form that maps to two judgments is emptied rather than pointed at whichever
 * row was seen first: a wrong edge is worse than a missing one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FILTERED AND STREAMED — measured 14 Aug 2026, at 4,768,101 judgments
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This was one unbounded `SELECT` over the whole table, materialised into a
 * JavaScript array. That was fine at the 38k it was written against and is the
 * same shape that killed the classify pass at 322k of 833k (commit 2414b09):
 * the array, not the Map, is what grows — the Map is only **875,018 forms**.
 *
 * Two changes, and neither one can alter the index's CONTENTS:
 *
 * 1. **`WHERE neutral_citation IS NOT NULL OR array_length(reporter_citations,
 *    1) > 0`.** `citationKeys` returns `[]` for a judgment with a null neutral
 *    citation and no reporter citations — checked in its source, not assumed —
 *    so every excluded row contributed nothing. Measured: **911,185 of
 *    4,768,101** rows can contribute a key. 81% of the transfer was rows that
 *    produced no key. The filter is a safe superset in the other direction too:
 *    an empty-string citation still passes the SQL and still yields no key.
 * 2. **A cursor instead of an array.** Peak memory is now one 20k page rather
 *    than every row at once, so the corpus can keep growing toward the source's
 *    20.5M without this becoming the thing that dies.
 */
async function buildIndex(sql: ReturnType<typeof postgres>): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  let collisions = 0;
  let scanned = 0;

  await sql<{ id: string; neutral_citation: string | null; reporter_citations: string[] }[]>`
    SELECT id, neutral_citation, reporter_citations FROM judgments
    WHERE neutral_citation IS NOT NULL
       OR coalesce(array_length(reporter_citations, 1), 0) > 0
  `.cursor(20_000, (rows) => {
    for (const j of rows) {
      scanned++;
      for (const key of citationKeys({
        neutralCitation: j.neutral_citation,
        reporterCitations: j.reporter_citations ?? [],
      })) {
        if (index.has(key) && index.get(key) !== j.id) {
          index.set(key, '');
          collisions++;
        } else {
          index.set(key, j.id);
        }
      }
    }
  });

  console.log(
    `index: ${index.size.toLocaleString()} citation forms over ${scanned.toLocaleString()} citable judgments` +
      ` (${collisions} ambiguous forms neutralised)`,
  );
  return index;
}

/**
 * Re-read every judgment with the CURRENT patterns and insert only what is new.
 *
 * Reports before it writes, and writes nothing without `--apply`.
 */
async function rescan(
  sql: ReturnType<typeof postgres>,
  batchSize: number,
  limit: number,
): Promise<void> {
  const APPLY = process.argv.includes('--apply');
  console.log(`CITATION RE-SCAN${APPLY ? '' : ' — DRY RUN'}`);
  console.log('='.repeat(74));

  const [before] = await sql<{ total: string; resolved: string; sentinels: string }[]>`
    SELECT count(*)::text AS total,
           count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::text AS resolved,
           count(*) FILTER (WHERE citation_text = '')::text AS sentinels
    FROM judgment_citations`;
  console.log(
    `before: ${before?.total} rows · ${before?.resolved} resolved · ${before?.sentinels} sentinels`,
  );

  const index = await buildIndex(sql);

  const all = await sql<{ id: string }[]>`
    SELECT id FROM judgments ORDER BY judgment_date DESC ${
      limit > 0 ? sql`LIMIT ${limit}` : sql``
    }`;
  console.log(`scanning ${all.length.toLocaleString()} judgments…\n`);

  const started = Date.now();
  let scanned = 0;
  let newEdges = 0;
  let sentinelsCleared = 0;

  for (let i = 0; i < all.length; i += batchSize) {
    const ids = all.slice(i, i + batchSize).map((r) => r.id);
    const texts = await sql<{ id: string; full_text: string }[]>`
      SELECT id, full_text FROM judgments WHERE id = ANY(${ids})`;

    // What this judgment already has, so the dry run can report the true number
    // of NEW edges rather than the number of citations found.
    const existing = await sql<{ citing_judgment_id: string; normalised_citation: string }[]>`
      SELECT citing_judgment_id, normalised_citation FROM judgment_citations
      WHERE citing_judgment_id = ANY(${ids})`;
    const have = new Map<string, Set<string>>();
    for (const e of existing) {
      let s = have.get(e.citing_judgment_id);
      if (!s) have.set(e.citing_judgment_id, (s = new Set()));
      s.add(e.normalised_citation);
    }

    const batchRows: Row[] = [];
    const nowCiting: string[] = [];

    for (const judgment of texts) {
      const known = have.get(judgment.id) ?? new Set<string>();
      const found = extractCitations(judgment.full_text);
      let fresh = 0;
      for (const c of found) {
        if (known.has(c.normalised)) continue;
        const target = index.get(c.normalised);
        // Exact canonical self identity and exact common-order page furniture
        // are source metadata, not outgoing citation-graph evidence. The parser
        // still returns both tokens for exact citation lookup.
        if (
          target === judgment.id ||
          classifyCitationGraphOccurrence(judgment.full_text, c) === 'COMMON_ORDER_PAGE_FURNITURE'
        ) {
          continue;
        }
        const citedId = target || null;
        const { relationship, evidence } = detectTreatment(
          judgment.full_text,
          c.offset + c.raw.length,
        );
        batchRows.push({
          citing_judgment_id: judgment.id,
          cited_judgment_id: citedId,
          citation_text: c.raw,
          normalised_citation: c.normalised,
          relationship,
          evidence: evidence || null,
          char_offset: c.offset,
        });
        fresh++;
      }
      // The sentinel says "this judgment cites nothing". Once it cites something
      // that is no longer true, and leaving both would break the invariant the
      // resume query stands on.
      if (fresh > 0 && known.has('')) nowCiting.push(judgment.id);
      newEdges += fresh;
      scanned++;
    }

    if (APPLY && batchRows.length > 0) {
      await sql.begin(async (tx) => {
        const INSERT_CHUNK = 2000;
        for (let k = 0; k < batchRows.length; k += INSERT_CHUNK) {
          const slice = batchRows.slice(k, k + INSERT_CHUNK);
          await tx`INSERT INTO judgment_citations ${tx(slice)} ON CONFLICT DO NOTHING`;
        }
        if (nowCiting.length > 0) {
          const gone = await tx`
            DELETE FROM judgment_citations
            WHERE citing_judgment_id = ANY(${nowCiting}) AND citation_text = ''`;
          sentinelsCleared += gone.count;
        }
      });
    } else {
      sentinelsCleared += nowCiting.length;
    }

    const secs = (Date.now() - started) / 1000;
    console.log(
      `[${scanned.toLocaleString()}/${all.length.toLocaleString()}] ` +
        `new edges=${newEdges.toLocaleString()} sentinels cleared=${sentinelsCleared.toLocaleString()} ` +
        `${(scanned / Math.max(secs, 1)).toFixed(1)} judgments/s`,
    );
  }

  console.log('');
  console.log(`NEW EDGES: ${newEdges.toLocaleString()}`);
  console.log(`SENTINELS CLEARED: ${sentinelsCleared.toLocaleString()}`);
  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing written. Re-run with --rescan --apply.');
    console.log('Then run `resolve --apply`: these edges are extracted, not resolved.');
    return;
  }
  const [after] = await sql<{ total: string; resolved: string; sentinels: string }[]>`
    SELECT count(*)::text AS total,
           count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::text AS resolved,
           count(*) FILTER (WHERE citation_text = '')::text AS sentinels
    FROM judgment_citations`;
  console.log(
    `after: ${after?.total} rows · ${after?.resolved} resolved · ${after?.sentinels} sentinels`,
  );
}

async function main(): Promise<void> {
  const limit = arg('--limit', 500);
  const batchSize = arg('--batch', 200);
  /**
   * How many batches are in flight at once. DEFAULT 1 — the previous behaviour
   * exactly, so nothing changes for anyone who does not ask.
   *
   * Measured 14 Aug 2026, serial: **2.9 judgments/s**, and almost none of it is
   * the regex. A batch is one `full_text` fetch over the shared Railway public
   * proxy, then CPU, then one INSERT — so the process spends most of its life
   * waiting on a socket. Batches cover disjoint judgment ids and each writes in
   * its own transaction with `ON CONFLICT DO NOTHING`, so overlapping them
   * changes throughput and nothing else.
   */
  const concurrency = Math.max(1, arg('--concurrency', 1));
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  /**
   * `openDb` rather than a raw `postgres()`, because this is now a worker meant
   * to run for hours: it resolves the Railway hostname through public resolvers
   * before dialling, which is the documented cause of the "Detected unsettled
   * top-level await" deaths this CLI's own comments describe. `connect_timeout`
   * never helped there — a DNS lookup that stalls never gets far enough to be
   * timed. `services/ingest/src/db-host.ts` has the full account.
   *
   * The pool has one connection per in-flight batch plus one spare for the
   * summary queries, so a worker never blocks on its own pool.
   */
  const sql = await openDb(url, concurrency + 1);

  try {
    if (process.argv.includes('--rescan')) {
      await rescan(sql, batchSize, arg('--limit', 0));
      return;
    }
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
    const index = await buildIndex(sql);

    // --- the queue ------------------------------------------------------------
    /**
     * ORDERED BY WHERE CITATIONS ACTUALLY ARE, not by date.
     *
     * This was `ORDER BY judgment_date DESC`, which sounds sensible and is the
     * wrong end of the corpus. The ingest is currently loading 2026 High Court
     * documents, and those are overwhelmingly bail orders and procedural
     * disposals — measured, `hc_document_class`: 57,876 bail orders and 20,641
     * procedural disposals against 39,914 reasoned decisions.
     *
     * The consequence was visible and expensive: **8,100 consecutive documents
     * yielded edges=0**. Nothing was broken — the extractor was checked directly
     * against the same population and found citations in 5 of 8 documents that
     * contain "SCC" — the pass was simply spending its time on the documents
     * least likely to cite anything.
     *
     * So substantive decisions come first, then everything unclassified (which
     * includes every newly ingested document and must not be starved), then the
     * bail orders and adjournments last. Within a tier, newest first.
     */
    const pending = await sql<{ id: string }[]>`
      SELECT j.id FROM judgments j
      WHERE NOT EXISTS (SELECT 1 FROM judgment_citations c WHERE c.citing_judgment_id = j.id)
      ORDER BY
        (j.hc_document_class IN ('bail_order', 'procedural_disposal', 'reference_stub')) ASC,
        (j.hc_document_class IN ('decided', 'decided_brief')) DESC,
        j.judgment_date DESC
      LIMIT ${limit}
    `;
    console.log(`judgments needing extraction: ${pending.length.toLocaleString()}`);
    if (pending.length === 0) return;

    const started = Date.now();
    let edges = 0;
    let resolved = 0;
    let treatments = 0;
    let done = 0;

    // Every batch of ids, precomputed, so `concurrency` workers can pull from
    // one shared cursor instead of coordinating index arithmetic between them.
    const batches: string[][] = [];
    for (let i = 0; i < pending.length; i += batchSize) {
      batches.push(pending.slice(i, i + batchSize).map((r) => r.id));
    }
    let nextBatch = 0;

    async function runBatch(ids: string[]): Promise<void> {
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
          if (
            target === judgment.id ||
            classifyCitationGraphOccurrence(judgment.full_text, c) === 'COMMON_ORDER_PAGE_FURNITURE'
          ) {
            continue;
          }
          // '' marks an ambiguous form; treat it as unresolved rather than guess.
          const citedId = target || null;
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

    // Each worker takes the next unclaimed batch until there are none. Node is
    // single-threaded, so `nextBatch++` between awaits cannot interleave — no
    // two workers can ever be handed the same batch.
    await Promise.all(
      Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
        for (;;) {
          const mine = batches[nextBatch++];
          if (!mine) return;
          await runBatch(mine);
        }
      }),
    );

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
