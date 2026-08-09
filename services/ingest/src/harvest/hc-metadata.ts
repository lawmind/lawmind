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

/** Row count from the parquet footer alone — no row data is fetched. */
export async function rowCount(key: string): Promise<number> {
  return withRetry(async () => {
    const file = await asyncBufferFromUrl({ url: `${HC_BUCKET}/${key}` });
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

/** A window of real rows from one metadata file. Used for sampling, never for ingest. */
export async function sampleRows<T = Record<string, unknown>>(
  key: string,
  rowStart: number,
  rowEnd: number,
): Promise<T[]> {
  return withRetry(async () => {
    const file = await asyncBufferFromUrl({ url: `${HC_BUCKET}/${key}` });
    return (await parquetReadObjects({ file, rowStart, rowEnd })) as T[];
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
