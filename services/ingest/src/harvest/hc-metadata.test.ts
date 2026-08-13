import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseListing, parsePartitions, withRetry, withTimeout } from './hc-metadata.ts';

describe('parseListing', () => {
  it('reads key and size out of a real ListObjectsV2 page, not truncated', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><Contents><Key>metadata/parquet/year=2024/court=1_12/bench=jammuhc/metadata.parquet</Key><Size>2761931</Size></Contents><Contents><Key>metadata/parquet/year=2024/court=1_12/bench=kashmirhc/metadata.parquet</Key><Size>2314849</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>`;
    const { objects, nextToken } = parseListing(xml);
    assert.equal(objects.length, 2);
    assert.equal(objects[0]!.key, 'metadata/parquet/year=2024/court=1_12/bench=jammuhc/metadata.parquet');
    assert.equal(objects[0]!.size, 2761931);
    assert.equal(nextToken, undefined);
  });

  it('carries the continuation token only when IsTruncated is true', () => {
    const truncated = `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>abc123</NextContinuationToken></ListBucketResult>`;
    assert.equal(parseListing(truncated).nextToken, 'abc123');

    // a token element present but IsTruncated false must not be followed —
    // S3 does not guarantee it is absent, only that it should be ignored.
    const notTruncated = `<ListBucketResult><IsTruncated>false</IsTruncated><NextContinuationToken>stale</NextContinuationToken></ListBucketResult>`;
    assert.equal(parseListing(notTruncated).nextToken, undefined);
  });

  it('returns no objects from an empty page', () => {
    const xml = `<ListBucketResult><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>`;
    assert.deepEqual(parseListing(xml).objects, []);
  });
});

describe('parsePartitions', () => {
  it('extracts year, court code, and bench from a real key', () => {
    const key = 'metadata/parquet/year=2024/court=1_12/bench=jammuhc/metadata.parquet';
    assert.deepEqual(parsePartitions(key), {
      year: 2024,
      courtCode: '1_12',
      bench: 'jammuhc',
      variant: 'plain',
    });
  });

  it('recognises the mobile variant as a SEPARATE file, not the same one', () => {
    // Measured 10 Aug 2026: these two files share ZERO CNRs. Treating the
    // mobile key as unparseable undercounted the corpus by every row in it.
    const key = 'metadata/parquet/year=2024/court=27_1/bench=newos/metadata-mobile.parquet';
    assert.deepEqual(parsePartitions(key), {
      year: 2024,
      courtCode: '27_1',
      bench: 'newos',
      variant: 'mobile',
    });
  });

  it('refuses a key from a different layout rather than misreading it', () => {
    // the Supreme Court bucket has no court= or bench= segment at all
    assert.equal(parsePartitions('metadata/parquet/year=2024/metadata.parquet'), null);
    assert.equal(parsePartitions('data/pdf/year=2024/court=1_12/bench=jammuhc/x.pdf'), null);
  });
});

describe('withRetry', () => {
  it('retries a transport failure and returns the eventual success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls < 3) throw new Error('Connect Timeout Error');
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('does NOT retry an HTTP 4xx — a wrong key is an answer, not a hiccup', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw new Error('listing failed: HTTP 404');
      }),
      /HTTP 404/,
    );
    assert.equal(calls, 1);
  });

  it('gives up after the attempt budget and rethrows the last error', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw new Error('Connect Timeout Error');
      }, 3),
      /Connect Timeout/,
    );
    assert.equal(calls, 3);
  });
});

describe('withTimeout', () => {
  it('returns the value when the promise settles first', async () => {
    const result = await withTimeout(async () => 'ok', 1000, 'fast');
    assert.equal(result, 'ok');
  });

  it('rejects on the clock, not the promise — the promise a hung font repair never settles', async () => {
    // A promise that never resolves and never rejects, standing in for the
    // real failure this exists for: unpdf's pdfjs looping on `Math.sumPrecise`
    // inside a `warn()` it never throws out of.
    const hangs = () => new Promise<string>(() => {});
    await assert.rejects(withTimeout(hangs, 20, 'stuck-doc'), /timeout after 20ms: stuck-doc/);
  });

  it('rejects with the underlying error when the promise loses the race by failing, not by hanging', async () => {
    await assert.rejects(
      withTimeout(async () => {
        throw new Error('pdf 404');
      }, 1000, 'fails-fast'),
      /pdf 404/,
    );
  });
});
