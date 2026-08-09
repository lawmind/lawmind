/**
 * AWS Signature Version 4, for Cloudflare R2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS HERE INSTEAD OF `@aws-sdk/client-s3`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * We need four operations — PUT, GET (including ranged), HEAD, DELETE. The AWS
 * SDK brings roughly twenty megabytes of transitive dependencies to provide
 * them, into a service whose whole stated constraint is minimal vendors and few
 * dependencies. SigV4 is a well-specified hash chain and `node:crypto` has every
 * primitive it needs.
 *
 * **The risk of hand-rolling it is unusually low**, which is what makes the
 * trade sensible: a signature is either right or the request is rejected with a
 * 403. There is no partial correctness and no silent wrong answer — the failure
 * mode this codebase actually fears cannot occur here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PARTS THAT ARE EASY TO GET WRONG, AND WHY EACH MATTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **The payload hash is signed.** R2, like S3, hashes the body into the
 *   signature, so a signature cannot be lifted from one upload and replayed with
 *   different content.
 * - **URI encoding is not `encodeURIComponent`.** The canonical request needs
 *   `!`, `'`, `(`, `)` and `*` percent-encoded, and `/` in an object key left
 *   alone. Judgment keys look like `text/court=27_1/year=2019/abc.br`, so this
 *   is not hypothetical.
 * - **Header names are lower-cased and sorted**, and the *signed headers* list
 *   must match exactly what is sent. A header added later without being signed
 *   produces a 403 that reads like a credentials problem.
 * - **The region is `auto`.** R2 has no regions; it wants that literal string.
 */
import { createHash, createHmac } from 'node:crypto';

/** R2 has no regions and expects this literal in the credential scope. */
export const R2_REGION = 'auto';
const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

const sha256 = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data).digest();

/**
 * Percent-encode for a canonical URI.
 *
 * `encodeURIComponent` leaves `!'()*` alone and AWS requires them encoded;
 * `keepSlashes` exists because an object key's `/` separators must survive.
 */
export function uriEncode(value: string, keepSlashes: boolean): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return keepSlashes ? encoded.replace(/%2F/g, '/') : encoded;
}

export type Credentials = {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

export type SignedRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
};

/**
 * Sign one request.
 *
 * `now` is injectable so the signature is testable against a fixed clock —
 * without it every assertion would have to be about a value that changes each
 * second, and the test would only be able to check that *something* was
 * produced.
 */
export function signRequest(opts: {
  credentials: Credentials;
  method: string;
  endpoint: string;
  /** Object key, without a leading slash. May contain `/`. */
  key: string;
  bucket: string;
  headers?: Record<string, string>;
  body?: Uint8Array | undefined;
  now?: Date;
}): SignedRequest {
  const { credentials, method, endpoint, key, bucket } = opts;
  const now = opts.now ?? new Date();
  const amzDate = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const dateStamp = amzDate.slice(0, 8);

  const url = new URL(`${endpoint}/${bucket}/${uriEncode(key, true)}`);
  const payloadHash = sha256(opts.body ?? '');

  const headers: Record<string, string> = {
    ...(opts.headers ?? {}),
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  // Lower-cased, sorted, and the signed list must match exactly what is sent.
  const canonicalHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lowered[k.toLowerCase()] = v.trim();

  const canonicalHeaders = canonicalHeaderNames.map((h) => `${h}:${lowered[h]}\n`).join('');
  const signedHeaders = canonicalHeaderNames.join(';');

  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${R2_REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, dateStamp), R2_REGION), SERVICE),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    url: url.toString(),
    method,
    headers: {
      ...headers,
      authorization:
        `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}
