/**
 * Compare the newest changed AWS High Court metadata objects with local rows.
 * Reads three bounded parquet objects and never fetches their PDFs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { asyncBufferFromUrl, parquetReadObjects } from '../services/ingest/node_modules/hyparquet/src/index.js';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import { HC_BUCKET, parsePartitions, pdfUrlFor } from '../services/ingest/src/harvest/hc-metadata.ts';

const OUT = join(process.cwd(), 'docs/ai/fifth/hc-upstream-local-sample.json');
const envMatch = /^DATABASE_URL=(.+)$/m.exec(readFileSync(join(process.cwd(), '.env'), 'utf8'));
const dbUrl = process.env['DATABASE_URL'] ?? envMatch?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!dbUrl) throw new Error('DATABASE_URL not found');

type ObjectRow = { key: string; lastModified: string; size: number };
type MetadataRow = { pdf_link?: string; decision_date?: string | Date; title?: string; court?: string };

function isoDate(value: string | Date | undefined): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

async function listNewest(): Promise<ObjectRow[]> {
  const response = await fetch(`${HC_BUCKET}/?list-type=2&prefix=${encodeURIComponent('metadata/parquet/year=2026/')}&max-keys=1000`);
  if (!response.ok) throw new Error(`AWS list returned ${response.status}`);
  const xml = await response.text();
  const rows: ObjectRow[] = [];
  for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
    const key = /<Key>([^<]+)<\/Key>/.exec(block)?.[1];
    const lastModified = /<LastModified>([^<]+)<\/LastModified>/.exec(block)?.[1];
    const size = /<Size>(\d+)<\/Size>/.exec(block)?.[1];
    if (key && lastModified && size && key.endsWith('/metadata.parquet')) {
      rows.push({ key, lastModified, size: Number(size) });
    }
  }
  return rows.sort((a, b) => b.lastModified.localeCompare(a.lastModified)).slice(0, 3);
}

const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 30 });
try {
  const objects = await listNewest();
  const reportObjects = [];
  for (const object of objects) {
    const partitions = parsePartitions(object.key);
    if (!partitions) throw new Error(`cannot parse ${object.key}`);
    const file = await asyncBufferFromUrl({ url: `${HC_BUCKET}/${object.key}` });
    const rows = (await parquetReadObjects({
      file,
      columns: ['pdf_link', 'decision_date', 'title', 'court'],
    })) as MetadataRow[];
    const rawCandidates = rows
      .filter((row): row is MetadataRow & { pdf_link: string } => Boolean(row.pdf_link))
      .map((row) => ({ ...row, sourceUrl: pdfUrlFor(partitions, row.pdf_link) }));
    // One upstream parquet object can repeat a PDF row. Coverage is over
    // source objects, not metadata rows: counting a repeated URL as a missing
    // local document manufactures a gap even when that URL is held.
    const candidates = [...new Map(rawCandidates.map((row) => [row.sourceUrl, row])).values()];
    const held = new Set<string>();
    for (let start = 0; start < candidates.length; start += 500) {
      const urls = candidates.slice(start, start + 500).map((row) => row.sourceUrl);
      if (urls.length === 0) continue;
      const found = await sql<{ source_url: string }[]>`
        SELECT source_url FROM judgments WHERE source_url IN ${sql(urls)}
      `;
      for (const row of found) held.add(row.source_url);
    }
    const newestDecision = candidates
      .map((row) => isoDate(row.decision_date))
      .filter((date): date is string => Boolean(date))
      .sort()
      .pop() ?? null;
    const positive = candidates.filter((row) => held.has(row.sourceUrl)).slice(0, 5);
    const negative = candidates.filter((row) => !held.has(row.sourceUrl)).slice(0, 5);
    reportObjects.push({
      ...object,
      rows: candidates.length,
      upstreamMetadataRows: rawCandidates.length,
      upstreamDuplicateRows: rawCandidates.length - candidates.length,
      localHeld: held.size,
      localMissing: candidates.length - held.size,
      newestDecision,
      positiveSamples: positive,
      negativeSamples: negative,
    });
  }
  const report = {
    artifact: 'FIFTH_HC_UPSTREAM_LOCAL_SAMPLE',
    takenAt: new Date().toISOString(),
    newestObjectWrite: objects[0]?.lastModified ?? null,
    objects: reportObjects,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 10 });
}
