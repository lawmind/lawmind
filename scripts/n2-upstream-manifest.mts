/**
 * NEW2 — R9 §1. THE FRESH UPSTREAM OBJECT MANIFEST, and the delta against our walk.
 *
 * ## Why this exists rather than a re-read of an old census
 *
 * The founder's instruction is explicit: do not trust an old local census or the
 * registry's stated update cadence. Both have been wrong here before —
 * `aws-open-data-bucket-is-static` records that the HC bucket writes DAILY after
 * this lane had recorded it as a periodic dump, and `the-cursor-is-the-frontier`
 * records that a subtraction of held-from-source cannot see an unwalked row.
 *
 * So this builds the manifest from the bucket itself: a full anonymous
 * `ListObjectsV2` over the metadata tree of BOTH Open Data buckets, capturing the
 * publisher's own object identity — key, size, ETag, LastModified — and diffs it
 * against the ONLY local record of what we walked, which is the checkpoint set
 * under `services/ingest/.checkpoints/`.
 *
 * ## What the diff can and cannot say
 *
 * - NEW — an upstream key that appears in NO checkpoint. Never walked. This is
 *   the class that a held-count subtraction is blind to.
 * - GROWN — upstream size exceeds the size recorded at our last read of that key.
 *   The publisher appended rows we have not seen.
 * - SHRUNK — upstream is smaller than what we recorded. A republished partition;
 *   the offset we hold may no longer mean what it meant.
 * - UNCHANGED — same size. ETag is recorded but a multipart ETag is not an MD5,
 *   so ETag equality is corroboration, never the sole test.
 *
 * It CANNOT say how many judgments are inside a grown file — bytes are not rows,
 * and `source-count-is-parquet-rows-not-documents` is the standing correction on
 * confusing the two. The row-level answer comes from the walk itself.
 *
 * Read-only. Network + local files. Writes one artifact.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-upstream-manifest.mts
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ai/new2-r9/upstream-manifest.json');
const CHECKPOINT_DIR = join(ROOT, 'services/ingest/.checkpoints');

const BUCKETS = [
  { adapter: 'aws_open_data_hc', host: 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com' },
  { adapter: 'aws_open_data_sc', host: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com' },
] as const;

type S3Obj = { key: string; size: number; etag: string; lastModified: string };

async function listAll(host: string, prefix: string): Promise<S3Obj[]> {
  const out: S3Obj[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    const url = `${host}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    let xml = '';
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'LawMind-manifest/1.0' } });
        if (!res.ok) throw new Error(`LIST ${prefix} -> ${res.status}`);
        xml = await res.text();
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    for (const block of xml.match(/<Contents>.*?<\/Contents>/gs) ?? []) {
      const key = /<Key>([^<]+)<\/Key>/.exec(block)?.[1];
      const size = /<Size>(\d+)<\/Size>/.exec(block)?.[1];
      const etag = /<ETag>(?:&quot;)?([^<&"]+)(?:&quot;)?<\/ETag>/.exec(block)?.[1] ?? '';
      const lm = /<LastModified>([^<]+)<\/LastModified>/.exec(block)?.[1] ?? '';
      if (key && size) out.push({ key, size: Number(size), etag, lastModified: lm });
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = truncated ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] : undefined;
    pages++;
    if (pages % 10 === 0) process.stderr.write(`  ${prefix} ... ${out.length} keys\n`);
  } while (token);
  return out;
}

/** key -> {offset, size} merged across every checkpoint file, keeping the FURTHEST offset. */
function localWalkManifest(): Map<string, { offset: number; size: number; files: string[] }> {
  const m = new Map<string, { offset: number; size: number; files: string[] }>();
  for (const f of readdirSync(CHECKPOINT_DIR)) {
    if (!f.endsWith('.json')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(CHECKPOINT_DIR, f), 'utf8'));
    } catch {
      continue; // a .corrupt sibling exists for these; a bad parse is not a walk record
    }
    if (!parsed || typeof parsed !== 'object') continue;
    for (const [key, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key.startsWith('metadata/parquet/')) continue;
      if (!v || typeof v !== 'object') continue;
      const offset = Number((v as Record<string, unknown>)['offset'] ?? NaN);
      const size = Number((v as Record<string, unknown>)['size'] ?? NaN);
      if (!Number.isFinite(offset)) continue;
      const prev = m.get(key);
      if (!prev || offset > prev.offset) m.set(key, { offset, size, files: [...(prev?.files ?? []), f] });
      else prev.files.push(f);
    }
  }
  return m;
}

function partitionOf(key: string) {
  const m = /year=(\d+)\/court=([^/]+)\/bench=([^/]+)\/metadata(-mobile)?\.parquet$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), court: m[2]!, bench: m[3]!, variant: m[4] ? 'mobile' : 'plain' };
}

async function main() {
  const takenAt = new Date().toISOString();
  const local = localWalkManifest();
  process.stderr.write(`local checkpoint keys: ${local.size}\n`);

  const report: Record<string, unknown> = { takenAt, localCheckpointKeys: local.size, buckets: {} };

  for (const b of BUCKETS) {
    process.stderr.write(`listing ${b.adapter} ...\n`);
    const objs = await listAll(b.host, 'metadata/parquet/');
    const metadataObjs = objs.filter((o) => o.key.endsWith('.parquet'));
    let newest = '';
    for (const o of metadataObjs) if (o.lastModified > newest) newest = o.lastModified;

    const classes = {
      NEW: [] as Record<string, unknown>[],
      GROWN: [] as Record<string, unknown>[],
      SHRUNK: [] as Record<string, unknown>[],
      UNCHANGED: 0,
    };
    let bytesWaiting = 0;

    for (const o of metadataObjs) {
      const l = local.get(o.key);
      const part = partitionOf(o.key);
      const row = { key: o.key, upstreamSize: o.size, lastModified: o.lastModified, etag: o.etag, ...(part ?? {}) };
      if (!l) {
        classes.NEW.push({ ...row, recordedSize: null, offset: null });
        bytesWaiting += o.size;
      } else if (o.size > l.size) {
        classes.GROWN.push({ ...row, recordedSize: l.size, added: o.size - l.size, offset: l.offset });
        bytesWaiting += o.size - l.size;
      } else if (o.size < l.size) {
        classes.SHRUNK.push({ ...row, recordedSize: l.size, offset: l.offset });
      } else {
        classes.UNCHANGED++;
      }
    }

    const byYear: Record<string, { objects: number; newKeys: number; grown: number }> = {};
    for (const o of metadataObjs) {
      const p = partitionOf(o.key);
      if (!p) continue;
      const y = String(p.year);
      byYear[y] ??= { objects: 0, newKeys: 0, grown: 0 };
      byYear[y]!.objects++;
    }
    for (const r of classes.NEW) if (r['year'] != null) byYear[String(r['year'])]!.newKeys++;
    for (const r of classes.GROWN) if (r['year'] != null) byYear[String(r['year'])]!.grown++;

    (report['buckets'] as Record<string, unknown>)[b.adapter] = {
      host: b.host,
      totalObjects: objs.length,
      metadataParquetObjects: metadataObjs.length,
      newestUpstreamWrite: newest,
      counts: {
        NEW: classes.NEW.length,
        GROWN: classes.GROWN.length,
        SHRUNK: classes.SHRUNK.length,
        UNCHANGED: classes.UNCHANGED,
      },
      bytesWaiting,
      byYear,
      newKeys: classes.NEW,
      grown: classes.GROWN.sort((a, b2) => (b2['added'] as number) - (a['added'] as number)),
      shrunk: classes.SHRUNK,
    };
    process.stderr.write(
      `${b.adapter}: ${metadataObjs.length} metadata objects · NEW ${classes.NEW.length} · GROWN ${classes.GROWN.length} · SHRUNK ${classes.SHRUNK.length} · UNCHANGED ${classes.UNCHANGED} · ${bytesWaiting} bytes waiting\n`,
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.stderr.write(`wrote ${OUT}\n`);
}

await main();
