/**
 * `pnpm --filter @lawmind/ingest hc:yield` — how many *usable citations* a High
 * Court PDF actually contains.
 *
 * `docs/CITATION_STRATEGY.md` §3 step 4. **This exists so the four-day run is
 * sized by a measurement instead of an assumption.**
 *
 * `CONTINUATION_PROMPT.md` §1 records a 274 GB estimate that was **7× too high**
 * because a total was scaled by a row count without checking the unit matched.
 * The same trap is open here: multiplying 15,771,566 documents by a guessed
 * citations-per-document would produce a confident number nobody measured. So
 * this reads real PDFs and counts.
 *
 * It writes **nothing**. It is an instrument, not an ingest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE EXISTING EXTRACTOR IS THE RIGHT ONE HERE, UNWIDENED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `extractCitations` covers five Supreme-Court-centric forms — INSC, SCC, AIR …
 * SC, S.C.R. and SCALE — and `CURRENT_PLAN.md` correctly parks widening it as
 * *"zero present impact"*.
 *
 * **That is exactly what this pass needs and the plan's ordering was wrong about
 * it being a prerequisite.** A High Court judgment citing the Supreme Court
 * writes `AIR 1973 SC 1461` or `(1973) 4 SCC 225` — the forms already covered.
 * Widening buys High-Court-to-High-Court edges, which are worth having later and
 * are **not** needed for the concordance or for treatment of SC authorities.
 */
import { extractText, getDocumentProxy } from 'unpdf';

import { extractCitations, normaliseCitation } from '../citations.ts';
import {
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  rowCount,
  sampleRows,
} from './hc-metadata.ts';

import postgres from 'postgres';
import { sslFor } from '../db-ssl';

const TARGET = Number(process.env['HC_YIELD_SAMPLE'] ?? '400');
const CONCURRENCY = Number(process.env['HC_YIELD_CONCURRENCY'] ?? '8');
const FROM_YEAR = Number(process.env['HC_YIELD_FROM_YEAR'] ?? '2016');

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set — resolution is measured against our own corpus.');
  process.exit(2);
}
const sql = postgres(dbUrl, { ssl: sslFor(dbUrl), max: 3 });

console.log(`HIGH COURT CITATION YIELD — ${TARGET} PDFs, ${FROM_YEAR}+`);
console.log('='.repeat(74));

/* ------------------------------------------- the corpus index, once, in RAM -- */
// Every citation form we hold -> judgment id. 38,341 judgments is small enough to
// hold; doing this per PDF would be 400 round trips to answer one question.
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
  if (index.has(r.k) && index.get(r.k) !== r.id)
    index.set(r.k, ''); // ambiguous
  else index.set(r.k, r.id);
}
console.log(`corpus index: ${index.size.toLocaleString()} citation forms`);

/* ----------------------------------------------------------- pick the PDFs -- */
const keys = await listMetadataKeys();
const files = keys
  .map(({ key }) => ({ key, p: parsePartitions(key) }))
  .filter((x) => x.p && x.p.variant === 'plain' && x.p.year >= FROM_YEAR)
  .map((x) => ({ key: x.key, p: x.p! }));

const courts = [...new Set(files.map((f) => f.p.courtCode))];
const perCourt = Math.max(1, Math.round(TARGET / courts.length));
type Pick = { url: string; court: string };
const picks: Pick[] = [];

await mapConcurrent(courts, 4, async (court) => {
  const mine = files.filter((f) => f.p.courtCode === court);
  const got: Pick[] = [];
  for (let i = 0; got.length < perCourt && i < mine.length * 4; i++) {
    const file = mine[(i * 7 + i * i) % mine.length]!;
    try {
      const total = await rowCount(file.key);
      if (total === 0) continue;
      const want = Math.min(4, perCourt - got.length, total);
      const offset = Math.floor(Math.random() * Math.max(1, total - want));
      const rows = await sampleRows<{ pdf_link?: string; court?: string }>(
        file.key,
        offset,
        offset + want,
      );
      for (const r of rows) {
        if (got.length >= perCourt || !r.pdf_link) continue;
        got.push({ url: pdfUrlFor(file.p, r.pdf_link), court: r.court?.trim() || court });
      }
    } catch {
      /* a file we cannot sample supplies none */
    }
  }
  picks.push(...got);
});
console.log(`sampled ${picks.length} PDFs across ${courts.length} courts`);
console.log('extracting and counting citations ...');

/* -------------------------------------------------------------- measure it -- */
type Row = {
  ok: boolean;
  citations: number;
  resolved: number;
  distinct: string[];
};
const EMPTY: Row = { ok: false, citations: 0, resolved: 0, distinct: [] };
let done = 0;
const results = await mapConcurrent(picks, CONCURRENCY, async (pick): Promise<Row> => {
  if (++done % 50 === 0) console.log(`  ... ${done}/${picks.length}`);
  // One fetch, one parse. The real pipeline will do exactly this and then throw
  // the text away, so measuring anything heavier would measure the wrong thing.
  let text: string;
  try {
    const res = await fetch(pick.url);
    if (!res.ok) return EMPTY;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    return EMPTY;
  }
  const cites = extractCitations(text);
  const distinct: string[] = [];
  let resolved = 0;
  for (const c of cites) {
    const key = normaliseCitation(c.raw)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    distinct.push(key);
    const hit = index.get(key);
    if (hit) resolved++;
  }
  return { ok: true, citations: cites.length, resolved, distinct };
});

const usable = results.filter((r) => r.ok);
const totalCites = usable.reduce((s, r) => s + r.citations, 0);
const totalResolved = usable.reduce((s, r) => s + r.resolved, 0);
const withAny = usable.filter((r) => r.citations > 0).length;
const allKeys = new Set(usable.flatMap((r) => r.distinct));

console.log('');
console.log(`PDFs read successfully           ${usable.length} of ${picks.length}`);
console.log(
  `PDFs containing >= 1 citation    ${withAny} (${((withAny / Math.max(1, usable.length)) * 100).toFixed(1)}%)`,
);
console.log(`total citations extracted        ${totalCites.toLocaleString()}`);
console.log(
  `  mean per PDF                   ${(totalCites / Math.max(1, usable.length)).toFixed(2)}`,
);
console.log(`  mean per PDF THAT HAS ANY      ${(totalCites / Math.max(1, withAny)).toFixed(2)}`);
console.log(`distinct citation keys seen      ${allKeys.size.toLocaleString()}`);
console.log(
  `RESOLVING to a judgment we hold  ${totalResolved.toLocaleString()} (${((totalResolved / Math.max(1, totalCites)) * 100).toFixed(1)}%)`,
);

console.log('');
console.log('WHAT THIS DOES AND DOES NOT LICENCE:');
console.log('  It is a per-document rate over a stratified sample of the LAST DECADE.');
console.log('  Multiplying it by 15,771,566 gives an ORDER OF MAGNITUDE, not a number —');
console.log('  citation density varies by court and by whether a document is a reasoned');
console.log('  judgment or a procedural order, and §A3.1 puts the judgment share at a');
console.log('  RANGE of 0.75%-18.64%. Quote the rate; do not quote the product.');

await sql.end();
