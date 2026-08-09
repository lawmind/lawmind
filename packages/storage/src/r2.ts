/**
 * Object storage for the corpus — Cloudflare R2 behind an interface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT LIVES HERE AND WHAT NEVER WILL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/CORPUS_TIERING.md` §3: the tiered corpus puts **brotli judgment text**
 * and **flat fp32 vectors** on R2, because both are large, cold, and read by key
 * rather than searched. Postgres keeps what has to be *queried*.
 *
 * **Original PDFs are never copied here.** `s3://indian-high-court-judgments` is
 * public, permanent and CC-BY-4.0 — already a CDN, already paid for by somebody
 * else. We store a key into it, not a duplicate of it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OBJECT-SCOPED CREDENTIALS ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The founder supplied two credential pairs on 9 Aug 2026: one admin
 * (read+write on buckets) and one object (read+write on contents). **This module
 * reads only the object pair.** Bucket creation and deletion are administration,
 * done once by a human with the other key, and a service that cannot delete a
 * bucket cannot be made to delete one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT REFUSES HONESTLY WITHOUT CREDENTIALS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `packages/auth/src/mail.ts` is the pattern: the whole path builds, imports and
 * tests with no key, and the only thing missing is the network call. What it
 * must never do is *appear* to work — an ingest that reports 15.9M judgments
 * stored, having stored none, is worse than one that stops on the first object.
 */
import { type Credentials, signRequest } from './sign.ts';

export type StoredObject = {
  readonly body: Uint8Array;
  readonly contentType: string | null;
  readonly size: number;
};

export type ObjectStore = {
  /** Which implementation answered, for the log line. */
  readonly name: string;
  put: (key: string, body: Uint8Array, contentType?: string) => Promise<void>;
  get: (key: string) => Promise<StoredObject | null>;
  /**
   * Byte range, inclusive at both ends, as HTTP defines it.
   *
   * **This is the operation the tiered design is built on.** Re-scoring 500
   * candidates means reading 500 × 4 KB of vectors out of a multi-gigabyte blob;
   * fetching the blob to read 2 MB of it would make the design pointless.
   */
  getRange: (key: string, start: number, end: number) => Promise<Uint8Array | null>;
  head: (key: string) => Promise<{ size: number } | null>;
  delete: (key: string) => Promise<void>;
};

export type R2Config = {
  readonly endpoint: string;
  readonly bucket: string;
  readonly credentials: Credentials;
  readonly fetchImpl?: typeof fetch | undefined;
};

/** Read the configuration the application is allowed to have. Object scope only. */
export function r2ConfigFromEnv(): R2Config | null {
  const endpoint = process.env['R2_ENDPOINT'];
  const bucket = process.env['R2_BUCKET'];
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, credentials: { accessKeyId, secretAccessKey } };
}

export function r2Store(config: R2Config): ObjectStore {
  const doFetch = config.fetchImpl ?? globalThis.fetch;

  const send = async (
    method: string,
    key: string,
    body?: Uint8Array,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> => {
    const signed = signRequest({
      credentials: config.credentials,
      method,
      endpoint: config.endpoint,
      bucket: config.bucket,
      key,
      body,
      ...(extraHeaders ? { headers: extraHeaders } : {}),
    });
    return doFetch(signed.url, {
      method,
      headers: signed.headers,
      ...(body ? { body } : {}),
    });
  };

  return {
    name: `r2:${config.bucket}`,

    async put(key, body, contentType) {
      const res = await send('PUT', key, body, {
        'content-length': String(body.byteLength),
        ...(contentType ? { 'content-type': contentType } : {}),
      });
      if (!res.ok) {
        /**
         * Thrown, never swallowed. A caller that believes an object was written
         * will later read a key that is not there, and the error will surface
         * somewhere far from the cause.
         */
        throw new Error(`R2 PUT ${key} failed: HTTP ${res.status} ${await res.text()}`.trim());
      }
    },

    async get(key) {
      const res = await send('GET', key);
      // 404 is an ANSWER — "no such object" — not a failure. Anything else is.
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`R2 GET ${key} failed: HTTP ${res.status}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      return { body: buf, contentType: res.headers.get('content-type'), size: buf.byteLength };
    },

    async getRange(key, start, end) {
      const res = await send('GET', key, undefined, { range: `bytes=${start}-${end}` });
      if (res.status === 404) return null;
      /**
       * **206 is the success case and 200 is a warning.** A server that ignores
       * the Range header returns the whole object with a 200 — the read
       * "succeeds" while transferring gigabytes, and the tiering design silently
       * stops being cheap. Treated as an error so it cannot pass unnoticed.
       */
      if (res.status === 200) {
        throw new Error(
          `R2 ignored the Range header on ${key} and returned the whole object. ` +
            'Refusing rather than transferring it.',
        );
      }
      if (res.status !== 206) throw new Error(`R2 ranged GET ${key} failed: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },

    async head(key) {
      const res = await send('HEAD', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 HEAD ${key} failed: HTTP ${res.status}`);
      return { size: Number(res.headers.get('content-length') ?? '0') };
    },

    async delete(key) {
      const res = await send('DELETE', key);
      // R2 returns 204 for a delete, and for a key that was already absent.
      if (res.status !== 204 && res.status !== 200) {
        throw new Error(`R2 DELETE ${key} failed: HTTP ${res.status}`);
      }
    },
  };
}

/**
 * A store that refuses every operation, with the reason.
 *
 * Not a no-op and not an in-memory fake: **a silent success here would make an
 * ingest report success for objects that do not exist.** Reads return `null`
 * because "we hold nothing" is true and safe; writes throw because claiming a
 * write happened is the lie this whole file is arranged to prevent.
 */
export function refusingStore(reason: string): ObjectStore {
  const refuse = (): never => {
    throw new Error(`Object storage is not configured: ${reason}`);
  };
  return {
    name: 'refusing',
    put: async () => refuse(),
    get: async () => null,
    getRange: async () => null,
    head: async () => null,
    delete: async () => refuse(),
  };
}

/**
 * Pick the store for this process.
 *
 * **Production with no credentials refuses to start**, exactly as `mailerFrom`
 * does. A corpus service that silently holds nothing is a worse outcome than one
 * that will not boot, because the first is discovered by an advocate and the
 * second by us.
 */
export function objectStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStore {
  const config = r2ConfigFromEnv();
  if (config) return r2Store(config);
  if (env['NODE_ENV'] === 'production') {
    throw new Error(
      'R2 credentials are not set and NODE_ENV is production. Refusing to start with no ' +
        'object storage rather than serving a corpus that silently holds nothing.',
    );
  }
  return refusingStore('R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY');
}
