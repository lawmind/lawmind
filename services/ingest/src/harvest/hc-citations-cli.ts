/**
 * `pnpm --filter @lawmind/ingest hc:citations` — the High Court citation pass.
 *
 * Streams High Court PDFs from AWS Open Data, extracts every citation, resolves
 * what it can against our corpus, writes the sightings and **throws the text
 * away**. `docs/CITATION_STRATEGY.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It is not a corpus ingest.** Nothing is written to `judgments`, nothing is
 * embedded, no text is stored, no vector is computed and no GPU is used.
 * `DATASETS.md`'s objection to ingesting this bucket — no citation column, a
 * 0.75%–18.64% judgment share, ~3,956 GPU-hours, 96.4 GB — **all of it applies
 * to storing the documents and none of it applies to reading them.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIZED BY MEASUREMENT, NOT BY ASSUMPTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc:yield` on 400 real PDFs, 11 Aug 2026:
 *
 *   400/400 read · **13.8% carry any citation** · **1.05 citations per document**
 *   · **33.7% of those resolve to a judgment we hold**
 *
 * and `hc:extract` on 1,000 PDFs put the cost at **186 ms each**, download
 * dominating extraction 5:1.
 *
 * **Quote the rate, never the product.** Multiplying by 15,771,566 gives an
 * order of magnitude — citation density varies by court and by whether a
 * document is a reasoned judgment or a procedural order.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESUMABLE BY CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every document processed writes a row to `external_citation_documents`,
 * **including the ones that yielded nothing** — 86.2% of them. A zero is a
 * result, and recording it is what stops the pass re-reading the same procedural
 * order forever. Restarting skips everything already recorded, so a crash, a
 * restart or a closed laptop costs only the batch in flight.
 */
import { extractText, getDocumentProxy } from 'unpdf';

import postgres from 'postgres';

import { extractCitations, normaliseCitation } from '../citations.ts';
import {
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  rowCount,
  sampleRows,
} from './hc-metadata.ts';

const SOURCE = 'aws_high_court';
const APPLY = process.argv.includes('--apply');
const CONCURRENCY = Number(process.env['HC_CITE_CONCURRENCY'] ?? '8');
const FROM_YEAR = Number(process.env['HC_CITE_FROM_YEAR'] ?? '2016');
/** Documents per batch. Bounded so a restart loses at most this many. */
const BATCH = Number(process.env['HC_CITE_BATCH'] ?? '400');
/** Stop after this many documents. 0 = the whole corpus. */
const LIMIT = Number(process.env['HC_CITE_LIMIT'] ?? '0');

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('localhost') ? false : 'require',
  max: 4,
  idle_timeout: 120,
});

const alnum = (s: string) => normaliseCitation(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

console.log('HIGH COURT CITATION PASS');
console.log('='.repeat(74));
console.log(`from ${FROM_YEAR} · concurrency ${CONCURRENCY} · batch ${BATCH}${LIMIT ? ` · limit ${LIMIT}` : ''}`);
if (!APPLY) console.log('DRY RUN — nothing will be written. Re-run with --apply.');

/* ------------------------------------------- the corpus index, once, in RAM -- */
const corpusRows = await sql<{ k: string; id: string }[]>`
  SELECT upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) AS k, j.id
  FROM judgments j, unnest(j.reporter_citations) rc WHERE rc <> ''
  UNION
  SELECT upper(regexp_replace(j.neutral_citation, '[^A-Za-z0-9]', '', 'g')), j.id
  FROM judgments j WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
  UNION
  SELECT a.alias_key, a.judgment_id FROM judgment_citation_aliases a
`;
const index = new Map<string, string>();
for (const r of corpusRows) {
  // A key naming two judgments resolves to neither — A3d.4. A wrong resolution
  // points an advocate at the wrong case, which is worse than no resolution.
  if (index.has(r.k) && index.get(r.k) !== r.id) index.set(r.k, '');
  else index.set(r.k, r.id);
}
console.log(`corpus index: ${index.size.toLocaleString()} citation forms`);

/* ----------------------------------------------------------- already done? -- */
const doneKeys = new Set<string>();
if (APPLY) {
  const rows = await sql<{ source_key: string }[]>`
    SELECT source_key FROM external_citation_documents WHERE source = ${SOURCE}`;
  for (const r of rows) doneKeys.add(r.source_key);
  console.log(`already processed: ${doneKeys.size.toLocaleString()} documents (will be skipped)`);
}

/* --------------------------------------------------------- the work stream -- */
const metaKeys = await listMetadataKeys();
const files = metaKeys
  .map(({ key }) => ({ key, p: parsePartitions(key) }))
  .filter((x) => x.p && x.p.variant === 'plain' && x.p.year >= FROM_YEAR)
  // Biggest courts first: Allahabad alone is 22% of the decade, so the earliest
  // batches carry the most signal if the run is ever cut short.
  .map((x) => ({ key: x.key, p: x.p! }));

console.log(`${files.length} metadata files in scope`);

type Doc = { key: string; url: string; court: string; year: number };
type Result = {
  doc: Doc;
  outcome: 'ok' | 'no_text' | 'missing' | 'failed';
  cites: { text: string; key: string; offset: number; cited: string | null }[];
};

let processed = 0;
let totalCites = 0;
let totalResolved = 0;
let stop = false;
const startedAt = Date.now();

for (const file of files) {
  if (stop) break;
  let total = 0;
  try {
    total = await rowCount(file.key);
  } catch {
    continue;
  }
  if (total === 0) continue;

  for (let offset = 0; offset < total && !stop; offset += BATCH) {
    const want = Math.min(BATCH, total - offset);
    let rows: Array<{ pdf_link?: string; court?: string }>;
    try {
      rows = await sampleRows(file.key, offset, offset + want);
    } catch {
      break;
    }

    const docs: Doc[] = [];
    for (const r of rows) {
      if (!r.pdf_link) continue;
      const url = pdfUrlFor(file.p, r.pdf_link);
      const key = url.split('/data/pdf/')[1] ?? url;
      if (doneKeys.has(key)) continue;
      docs.push({ key, url, court: r.court?.trim() || file.p.courtCode, year: file.p.year });
    }
    if (docs.length === 0) continue;

    const results = await mapConcurrent(docs, CONCURRENCY, async (doc): Promise<Result> => {
      let text = '';
      try {
        const res = await fetch(doc.url);
        if (!res.ok) return { doc, outcome: 'missing', cites: [] };
        const bytes = new Uint8Array(await res.arrayBuffer());
        const pdf = await getDocumentProxy(bytes);
        text = (await extractText(pdf, { mergePages: true })).text;
      } catch {
        return { doc, outcome: 'failed', cites: [] };
      }
      if (text.trim().length === 0) return { doc, outcome: 'no_text', cites: [] };

      const seen = new Set<string>();
      const cites: Result['cites'] = [];
      for (const c of extractCitations(text)) {
        const key = alnum(c.raw);
        // One sighting per citation per document: a judgment repeating an
        // authority is ONE court relying on it, not five.
        if (key === '' || seen.has(key)) continue;
        seen.add(key);
        const hit = index.get(key);
        cites.push({ text: c.raw, key, offset: c.offset, cited: hit ? hit : null });
      }
      return { doc, outcome: 'ok', cites };
    });

    processed += results.length;
    for (const r of results) {
      totalCites += r.cites.length;
      totalResolved += r.cites.filter((c) => c.cited).length;
      doneKeys.add(r.doc.key);
    }

    if (APPLY) {
      // Two batched statements per batch, never per row.
      const flat = results.flatMap((r) =>
        r.cites.map((c) => ({
          source_key: r.doc.key,
          court_name: r.doc.court,
          source_year: r.doc.year,
          citation_text: c.text,
          citation_key: c.key,
          cited_judgment_id: c.cited,
          char_offset: c.offset,
        })),
      );
      if (flat.length > 0) {
        await sql`
          INSERT INTO external_citations
            (source, source_key, court_name, source_year, citation_text,
             citation_key, cited_judgment_id, char_offset)
          SELECT ${SOURCE}, t.source_key, t.court_name, t.source_year, t.citation_text,
                 t.citation_key, nullif(t.cited_judgment_id,'')::uuid, t.char_offset
          FROM unnest(
            ${flat.map((f) => f.source_key)}::text[],
            ${flat.map((f) => f.court_name)}::text[],
            ${flat.map((f) => f.source_year)}::int[],
            ${flat.map((f) => f.citation_text)}::text[],
            ${flat.map((f) => f.citation_key)}::text[],
            ${flat.map((f) => f.cited_judgment_id ?? '')}::text[],
            ${flat.map((f) => f.char_offset)}::int[]
          ) AS t(source_key, court_name, source_year, citation_text,
                 citation_key, cited_judgment_id, char_offset)
          ON CONFLICT (source, source_key, citation_key) DO NOTHING`;
      }
      await sql`
        INSERT INTO external_citation_documents
          (source, source_key, court_name, source_year, citations_found, resolved_found, outcome)
        SELECT ${SOURCE}, t.source_key, t.court_name, t.source_year,
               t.citations_found, t.resolved_found, t.outcome
        FROM unnest(
          ${results.map((r) => r.doc.key)}::text[],
          ${results.map((r) => r.doc.court)}::text[],
          ${results.map((r) => r.doc.year)}::int[],
          ${results.map((r) => r.cites.length)}::int[],
          ${results.map((r) => r.cites.filter((c) => c.cited).length)}::int[],
          ${results.map((r) => r.outcome)}::text[]
        ) AS t(source_key, court_name, source_year, citations_found, resolved_found, outcome)
        ON CONFLICT (source, source_key) DO NOTHING`;
    }

    const rate = processed / Math.max(1, (Date.now() - startedAt) / 1000);
    console.log(
      `${new Date().toISOString().slice(11, 19)} ` +
        `docs=${processed.toLocaleString()} cites=${totalCites.toLocaleString()} ` +
        `resolved=${totalResolved.toLocaleString()} ${rate.toFixed(1)}/s ` +
        `· ${file.p.courtCode}/${file.p.year}`,
    );

    if (LIMIT > 0 && processed >= LIMIT) stop = true;
  }
}

console.log('');
console.log(`documents processed  ${processed.toLocaleString()}`);
console.log(`citations found      ${totalCites.toLocaleString()}`);
console.log(`resolved to corpus   ${totalResolved.toLocaleString()}`);
console.log(`elapsed              ${((Date.now() - startedAt) / 60000).toFixed(1)} min`);
if (!APPLY) console.log('\nDRY RUN — nothing was written.');

await sql.end();
