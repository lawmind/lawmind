/**
 * High Court metadata survey — `docs/CURRENT_PLAN.md` §A3.1: **count the AWS
 * Parquet metadata per court per year, before downloading anything.** "15.9M"
 * is a headline; nobody had counted the working set.
 *
 * `s3://indian-high-court-judgments`, Mumbai (`ap-south-1`), public, CC-BY-4.0.
 * Laid out `metadata/parquet/year=YYYY/court=CODE/bench=NAME/metadata.parquet` —
 * one small file per court per bench per year, not one file per year as the
 * Supreme Court bucket uses (`sci.ts`).
 *
 * This module only ever reads: the bucket's XML listing (key + size, no
 * parquet touched) and parquet **footers** (`parquetMetadataAsync`, a single
 * HTTP range request per file that returns row-group row counts without
 * decoding a single row). Counting the corpus must not itself become an
 * ingest — this stays under a few MB moved for the whole survey.
 */
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';

export const HC_BUCKET = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com';

export type ListedObject = { key: string; size: number };

/**
 * Parses one page of an S3 `ListObjectsV2` XML response. Deliberately a
 * regex, not an XML parser dependency, for the same reason `sign.ts` hand-
 * rolls SigV4: this reads three fixed tag shapes from a response we control
 * the request for, and a wrong parse fails loudly rather than silently.
 */
export function parseListing(xml: string): {
  objects: ListedObject[];
  nextToken: string | undefined;
} {
  const objects: ListedObject[] = [];
  const contentsBlocks = xml.match(/<Contents>.*?<\/Contents>/gs) ?? [];
  for (const block of contentsBlocks) {
    const keyM = /<Key>([^<]+)<\/Key>/.exec(block);
    const sizeM = /<Size>(\d+)<\/Size>/.exec(block);
    if (keyM && sizeM) objects.push({ key: keyM[1]!, size: Number(sizeM[1]) });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const tokenM = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
  return { objects, nextToken: truncated ? tokenM?.[1] : undefined };
}

/** Every metadata parquet key under a prefix, following pagination. Listing only — no parquet read. */
export async function listMetadataKeys(prefix = 'metadata/parquet/'): Promise<ListedObject[]> {
  const all: ListedObject[] = [];
  let token: string | undefined;
  do {
    const url = new URL(`${HC_BUCKET}/`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('max-keys', '1000');
    if (token) url.searchParams.set('continuation-token', token);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`listing ${url} failed: HTTP ${res.status}`);
    const { objects, nextToken } = parseListing(await res.text());
    all.push(...objects);
    token = nextToken;
  } while (token);
  return all;
}

/**
 * The bucket publishes **two disjoint metadata files per partition**, and
 * missing the second undercounts the corpus. Measured 10 Aug 2026 on
 * `year=2024/court=27_1/bench=newos`:
 *
 * | | `metadata.parquet` | `metadata-mobile.parquet` |
 * | --- | --- | --- |
 * | rows | 1,841 | **53,753** |
 * | distinct CNRs | 1,841 | 17,843 |
 * | **CNRs in both** | **0** | **0** |
 *
 * **Zero overlap.** They are not two views of one record set; they are two
 * record sets. The mobile variant also carries eighteen extra columns the
 * plain one does not — `order_type`, `is_final`, `petitioner`, `respondent`,
 * `case_type`, `pet_advocate`, `lower_court` — and a **differently shaped
 * `pdf_link`** (`orders_2024_250200000022024_3.pdf`, bare, against the plain
 * file's pathed `court/cnrorders/<bench>/orders/<CNR>_<n>_<date>.pdf`). So the
 * variant decides how a PDF key is derived and cannot be flattened away.
 */
export type MetadataVariant = 'plain' | 'mobile';

/** `metadata/parquet/year=2024/court=1_12/bench=jammuhc/metadata.parquet` → its partition values and variant. */
export function parsePartitions(
  key: string,
): { year: number; courtCode: string; bench: string; variant: MetadataVariant } | null {
  const m = /year=(\d+)\/court=([^/]+)\/bench=([^/]+)\/metadata(-mobile)?\.parquet$/.exec(key);
  if (!m) return null;
  return {
    year: Number(m[1]),
    courtCode: m[2]!,
    bench: m[3]!,
    variant: m[4] ? 'mobile' : 'plain',
  };
}

/**
 * Retries a transient network failure with exponential backoff.
 *
 * **Not politeness — correctness.** The first full survey died at file ~200 of
 * 1,389 on a single `UND_ERR_CONNECT_TIMEOUT`, discarding every footer already
 * read. A survey that cannot survive one dropped socket is a survey nobody can
 * finish, and re-running it from zero is how a free measurement turns into a
 * cost. Only the retryable shapes are caught: an HTTP 4xx from S3 means the key
 * is wrong and retrying it merely repeats the mistake more slowly.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = String((error as Error)?.message ?? error);
      // A 404/403 is an answer, not a hiccup. Everything else here is transport.
      if (/HTTP 4\d\d/.test(message)) throw error;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastError;
}

/**
 * Bounds a promise that may never settle.
 *
 * **Found by a dead run, not by design.** `hc-load.log` advanced steadily to
 * `[38,800]` then printed `Warning: TypeError: Math.sumPrecise is not a
 * function` on a loop for the rest of the file and never advanced again —
 * `unpdf`'s bundled pdfjs repairing a malformed embedded font (`Required
 * "glyf" table is not found -- trying to recover`) calls `Math.sumPrecise`,
 * which does not exist on this Node runtime (`v24.14.1`), and the failure is
 * swallowed as a `warn()` rather than thrown. `mapConcurrent`'s worker never
 * returns, `Promise.all` never resolves, and one malformed font hangs the
 * whole batch forever — not a crash, so nothing restarts it.
 *
 * Racing a timer turns that hang into an ordinary skip, which every caller
 * here already knows how to count.
 */
export async function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Row count from the parquet footer alone — no row data is fetched.
 *
 * Takes a `signal` for the same reason `sampleRows` does, and the omission was
 * measured rather than imagined: on 14 Aug the court=5_15 worker sat 46 minutes
 * at 0.02s CPU per 20s having written nothing, because this call — which runs
 * for EVERY file before any batch — had no bound while `sampleRows` did. A
 * footer read is one small range request and normally returns in under a
 * second, which is exactly why an unbounded one is so easy to miss: it fails
 * open, silently, before the loop can reach the code that would have counted it.
 */
export async function rowCount(key: string, signal?: AbortSignal): Promise<number> {
  return withRetry(async () => {
    const file = await asyncBufferFromUrl({
      url: `${HC_BUCKET}/${key}`,
      ...(signal ? { requestInit: { signal } } : {}),
    });
    const meta = await parquetMetadataAsync(file);
    return Number(meta.num_rows);
  });
}

/** The one field worth a real row read: the bucket's human-readable court name. One row, not the file. */
export async function courtName(key: string): Promise<string> {
  return withRetry(async () => {
    const file = await asyncBufferFromUrl({ url: `${HC_BUCKET}/${key}` });
    const rows = (await parquetReadObjects({ file, rowStart: 0, rowEnd: 1 })) as Array<{
      court?: string;
    }>;
    return rows[0]?.court?.trim() ?? '(unknown)';
  });
}

/**
 * Counts `order_type` across one mobile-variant file. **This is the column that
 * answers the question `DATASETS.md` left open** — *"most of it is not an
 * authority"* was measured there by sampling PDF length; the bucket labels it
 * directly, and only on this variant.
 *
 * Reads one column, not the file. The plain variant has no equivalent, which is
 * itself the finding: for those partitions the judgment/order split is not
 * published and cannot be counted without opening PDFs.
 */
export async function orderTypeTally(key: string): Promise<Map<string, number>> {
  return withRetry(async () => {
    const file = await asyncBufferFromUrl({ url: `${HC_BUCKET}/${key}` });
    const rows = (await parquetReadObjects({ file, columns: ['order_type'] })) as Array<{
      order_type?: string;
    }>;
    const tally = new Map<string, number>();
    for (const row of rows) {
      const key = row.order_type?.trim() || '(blank)';
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return tally;
  });
}

/**
 * Where a row's PDF lives. **Verified against the bucket, not inferred**, and
 * the first two guesses were both wrong:
 *
 * - the bench in the metadata key is the bench in the PDF key — Delhi is
 *   `bench=dhcdb`, not `bench=delhihc`, and a guessed bench 404s;
 * - `pdf_link` is a *path* on the plain variant
 *   (`court/cnrorders/<bench>/orders/<CNR>_1_<date>.pdf`) and a *bare filename*
 *   on the mobile variant (`orders_2024_...pdf`). **Only the basename is
 *   usable**, and the partition supplies the rest.
 *
 * `pdf_exists` in the metadata is false on rows whose PDF returns 200, so the
 * column is not an availability oracle — `DATASETS.md` recorded that and it
 * still holds. Ask the bucket.
 */
export function pdfUrlFor(
  partitions: { year: number; courtCode: string; bench: string },
  pdfLink: string,
): string {
  const base = pdfLink.split('/').pop() ?? pdfLink;
  const { year, courtCode, bench } = partitions;
  return `${HC_BUCKET}/data/pdf/year=${year}/court=${courtCode}/bench=${bench}/${base}`;
}

/**
 * A window of real rows from one metadata file. Used for sampling, never for ingest.
 *
 * **`signal` is not optional decoration — without it a bounded read still leaks.**
 * Racing a read against a timer unblocks the CALLER; it does nothing to the
 * fetch, which stays in flight holding a socket and keeping the event loop
 * open. Measured 14 Aug 2026: the court=9_13 year=2023 worker timed out on two
 * oversized parquet files, printed its final tally, and then never exited —
 * 274MB resident and 0% CPU, which reads as a live worker to every check that
 * counts processes. Passing the signal through makes the abandoned read
 * actually stop.
 *
 * It reaches every range request, not just the first: `asyncBufferFromUrl`
 * keeps `requestInit` and spreads it into each `slice()` fetch, so one signal
 * cancels the whole read including the HEAD that precedes it.
 */
export async function sampleRows<T = Record<string, unknown>>(
  key: string,
  rowStart: number,
  rowEnd: number,
  signal?: AbortSignal,
  columns?: readonly string[],
): Promise<T[]> {
  return withRetry(async () => {
    const file = await asyncBufferFromUrl({
      url: `${HC_BUCKET}/${key}`,
      ...(signal ? { requestInit: { signal } } : {}),
    });
    return (await parquetReadObjects({
      file,
      rowStart,
      rowEnd,
      /*
       * Column projection. `raw_html` alone is 89.5 MB compressed / 441.5 MB
       * uncompressed in the Allahabad 2021 file — 73% of it — and NOTHING reads
       * it: the loader fetches the PDF and extracts text itself. Measured, not
       * estimated: see `rowGroupRanges` below for the numbers and the incident.
       */
      ...(columns ? { columns: [...columns] } : {}),
    })) as T[];
  });
}

/**
 * The row-group boundaries of a metadata parquet, from its footer alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE LOADER MUST READ BY ROW GROUP — measured 15 Aug 2026, and it had
 * silently written off the single largest gap in the corpus
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **A row group is the smallest unit a parquet reader can decode.** Asking for
 * rows 200-400 of a file whose row group holds 351,704 rows decodes the WHOLE
 * group and throws away 351,504 rows. Do that once per 200-row batch and the
 * cost is quadratic in the worst way.
 *
 * The Allahabad 2021 metadata file, measured from its own footer:
 *
 *     row groups            1
 *     rows                  351,704
 *     compressed            140.7 MB
 *     uncompressed          604.7 MB
 *     BATCH=200 re-reads    1,759x  ->  roughly 247 GB to ingest ONE file
 *
 * It never finished. Each batch after the first exceeded the 300s metadata
 * timeout, `hc-load-cli` counted `metadata_batch_unreadable` and `break`ed out
 * of the file, and having run out of files it printed its RESULTS block —
 * which `supervise.mjs` reads as a clean finish and refuses to restart. **A
 * timeout was being laundered into a permanent COMPLETE**, on the court holding
 * the biggest gap we have (Allahabad 2016-2022, 2,055,580 documents, 0 held).
 *
 * Reading the group once, with only the seven columns the loader actually uses,
 * costs **18.2 MB compressed instead of 140.7 MB, once instead of 1,759 times.**
 *
 * The footer read is cheap and already proven at scale — `hc:count` surveyed
 * 1,493 files this way without decoding a single row.
 */
export async function rowGroupRanges(
  key: string,
  signal?: AbortSignal,
): Promise<Array<{ start: number; end: number }>> {
  return withRetry(async () => {
    const file = await asyncBufferFromUrl({
      url: `${HC_BUCKET}/${key}`,
      ...(signal ? { requestInit: { signal } } : {}),
    });
    const meta = await parquetMetadataAsync(file);
    const ranges: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (const g of meta.row_groups) {
      const n = Number(g.num_rows);
      /* A zero-row group is legal and must not produce an empty read window. */
      if (n > 0) ranges.push({ start, end: start + n });
      start += n;
    }
    return ranges;
  });
}

/** Runs `fn` over `items` with bounded concurrency. A 1,493-file survey must not open 1,493 sockets at once. */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
