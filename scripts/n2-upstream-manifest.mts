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
 * - CHANGED — same size but a different ETag from the prior daily observation.
 *   This is a revalidation trigger, not a claim that a multipart ETag is an MD5.
 * - UNCHANGED — same size and no observed version change.
 *
 * It CANNOT say how many judgments are inside a grown file — bytes are not rows,
 * and `source-count-is-parquet-rows-not-documents` is the standing correction on
 * confusing the two. The row-level answer comes from the walk itself.
 *
 * Read-only. Network + local files. Writes one artifact.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-upstream-manifest.mts
 */
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ai/new2-r9/upstream-manifest.json');
const CHECKPOINT_DIR = join(ROOT, 'services/ingest/.checkpoints');

/**
 * NOT EVERY SOURCE RESUMES BY A BYTE OFFSET, AND ONE OF THESE TWO NEVER DID.
 *
 * `resume` names what the adapter's frontier actually IS, because the whole diff
 * above is meaningful only for a source whose progress is a byte offset into a
 * parquet file.
 *
 *   checkpoint-offset  High Court. `hc-load-cli` records `{offset, size}` per
 *                      key under `services/ingest/.checkpoints/`, so upstream
 *                      size minus recorded size is real unread work.
 *   source-url         Supreme Court. `cli.ts` (`sci`) resumes by asking the
 *                      database which `source_url`s it already holds — it writes
 *                      no checkpoint, and it never has. One PDF per judgment,
 *                      and `sci.ts:sourceUrlFor` builds the identity from the
 *                      parquet row rather than from a file position.
 *
 * MEASURED 4-5 Sep 2026, and it is the same defect the FIXTURE class below was
 * created to fix, arriving by a different door. Every one of the SC bucket's 77
 * metadata objects appears in no checkpoint — because no checkpoint for them can
 * exist — so all 77 landed in NEW and all 48,563,942 of their bytes landed in
 * `bytesWaiting`, on every cycle, for ever. Two consecutive daily receipts (3 and
 * 4 Sep) carry the byte count IDENTICAL to the digit.
 *
 * That is not a small cosmetic lie. It made the SC half of the daily trigger
 * permanently unusable: a headline that cannot reach zero cannot signal anything,
 * so nothing downstream could act on it and `n2-delta-scopes.mjs` reads only the
 * HC bucket. Meanwhile the ACTUAL SC gap on 5 Sep was NINE DOCUMENTS — measured
 * by `n2-sc-reconcile.mts`, which is the authority for this source precisely
 * because the upstream key space and our stored identity are the same space.
 *
 * A source with no byte frontier is therefore reported as one, honestly, rather
 * than being forced through a model it does not have.
 */
const BUCKETS = [
  {
    adapter: 'aws_open_data_hc',
    host: 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com',
    resume: 'checkpoint-offset',
  },
  {
    adapter: 'aws_open_data_sc',
    host: 'https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com',
    resume: 'source-url',
  },
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
  const prior = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8')) as {
        buckets?: Record<string, { objectVersions?: S3Obj[] }>;
      }
    : null;
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
      CHANGED: [] as Record<string, unknown>[],
      UNCHANGED: 0,
      /**
       * `bench=testcase` — the publisher's own fixture partition, which
       * `isTestFixture` refuses at ingest and which therefore can never have a
       * checkpoint. Before this class existed all 56 of them sat in NEW for
       * ever, and their 71 MB sat in `bytesWaiting` for ever, so the delta
       * trigger's headline number could never reach zero and "NEW 56" meant
       * "nothing to do" on every single cycle. `fixture-partition-inflates-the-
       * denominator`, this time in the trigger rather than the denominator —
       * the same partition already produced one false 94-day coverage gap on
       * Bombay.
       *
       * They are counted and listed, never dropped: an upstream object we
       * deliberately do not ingest must be visible as a decision, not absent.
       */
      FIXTURE: [] as Record<string, unknown>[],
      /**
       * This bucket's adapter has no byte frontier, so "how much have we not
       * read" is not a question its objects can answer. Counted and listed —
       * never dropped, never silently zero — with the authority that CAN answer
       * it named on every row. See the `resume` note on BUCKETS.
       */
      NO_BYTE_FRONTIER: [] as Record<string, unknown>[],
    };
    let bytesWaiting = 0;
    let fixtureBytes = 0;
    const priorVersions = new Map(
      (prior?.buckets?.[b.adapter]?.objectVersions ?? []).map((object) => [object.key, object]),
    );

    for (const o of metadataObjs) {
      const l = local.get(o.key);
      const part = partitionOf(o.key);
      const row = { key: o.key, upstreamSize: o.size, lastModified: o.lastModified, etag: o.etag, ...(part ?? {}) };
      if (b.resume !== 'checkpoint-offset') {
        /* No checkpoint can exist for this adapter, so absence of one is not
         * evidence of unread work. `bytesWaiting` is deliberately NOT advanced:
         * a number that can never reach zero is a number nothing can act on. */
        classes.NO_BYTE_FRONTIER.push({
          ...row,
          resume: b.resume,
          authority:
            'scripts/n2-sc-reconcile.mts — exact set difference of upstream PDF keys against judgments.source_url',
        });
      } else if (/\/bench=testcase\//.test(o.key)) {
        classes.FIXTURE.push({ ...row, refusedBy: 'isTestFixture — publisher fixture partition, never ingested' });
        fixtureBytes += o.size;
      } else if (!l) {
        classes.NEW.push({ ...row, recordedSize: null, offset: null });
        bytesWaiting += o.size;
      } else if (o.size > l.size) {
        classes.GROWN.push({ ...row, recordedSize: l.size, added: o.size - l.size, offset: l.offset });
        bytesWaiting += o.size - l.size;
      } else if (o.size < l.size) {
        classes.SHRUNK.push({ ...row, recordedSize: l.size, offset: l.offset });
      } else if (priorVersions.has(o.key) && priorVersions.get(o.key)!.etag !== o.etag) {
        // Same-size rewrites are invisible to a byte frontier. ETag is used as
        // a change trigger only because the prior observed object has a
        // different ETag; no multipart-MD5 meaning is inferred from its value.
        classes.CHANGED.push({ ...row, recordedSize: l.size, offset: l.offset, added: 0 });
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
      /* What this adapter's frontier IS. A consumer that plans work out of
       * `newKeys`/`grown` must check this first: for anything but
       * `checkpoint-offset` those arrays are empty BY CONSTRUCTION, and reading
       * their emptiness as "nothing to do" is the mistake this field exists to
       * make impossible. */
      resume: b.resume,
      totalObjects: objs.length,
      metadataParquetObjects: metadataObjs.length,
      newestUpstreamWrite: newest,
      counts: {
        NEW: classes.NEW.length,
        GROWN: classes.GROWN.length,
        SHRUNK: classes.SHRUNK.length,
        CHANGED: classes.CHANGED.length,
        UNCHANGED: classes.UNCHANGED,
        FIXTURE: classes.FIXTURE.length,
        NO_BYTE_FRONTIER: classes.NO_BYTE_FRONTIER.length,
      },
      bytesWaiting,
      fixtureBytes,
      noByteFrontier: classes.NO_BYTE_FRONTIER,
      byYear,
      newKeys: classes.NEW,
      grown: classes.GROWN.sort((a, b2) => (b2['added'] as number) - (a['added'] as number)),
      shrunk: classes.SHRUNK,
      changed: classes.CHANGED,
      objectVersions: metadataObjs,
      fixture: classes.FIXTURE,
    };
    if (b.resume === 'checkpoint-offset') {
      process.stderr.write(
        `${b.adapter}: ${metadataObjs.length} metadata objects · NEW ${classes.NEW.length} · GROWN ${classes.GROWN.length} · SHRUNK ${classes.SHRUNK.length} · CHANGED ${classes.CHANGED.length} · UNCHANGED ${classes.UNCHANGED} · FIXTURE ${classes.FIXTURE.length} (${fixtureBytes} bytes, never ingested) · ${bytesWaiting} bytes waiting\n`,
      );
    } else {
      /* Deliberately a different sentence, not the same one with zeroes in it.
       * The byte vocabulary is what made this bucket unreadable for a month;
       * printing "0 bytes waiting" would replace a false backlog with a false
       * all-clear, and neither is the truth about a source measured elsewhere. */
      process.stderr.write(
        `${b.adapter}: ${metadataObjs.length} metadata objects · resume=${b.resume}, NO byte frontier — ` +
          `newest upstream write ${newest || 'unknown'} · currency is answered by scripts/n2-sc-reconcile.mts, not by this manifest\n`,
      );
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.stderr.write(`wrote ${OUT}\n`);
}

await main();
