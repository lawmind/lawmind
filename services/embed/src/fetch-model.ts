/**
 * Fetch BGE-M3 fp32 into `.models` at BUILD time.
 *
 *   pnpm --filter @lawmind/embed run fetch-model
 *
 * **Why this exists rather than letting the model download on first use.**
 *
 * Fetching at runtime failed in production in a way that took most of a day to
 * pin down. The API logged `api listening`, and 0.6s later transformers.js threw
 * "Unable to get model file path or buffer" — twice, once per leg of the
 * Promise.all. Too fast to be a failed 2.2GB download; the fetch never got off
 * the ground. The same load run over SSH on the same container succeeded in 26s,
 * so it was not the model, the path, the disk or the dtype. It was a boot-time
 * network race that only a freshly started container loses.
 *
 * Every runtime mitigation treats the symptom: a warm can only retry, a timeout
 * can only give up, and a cleared promise cache can only try again later. None of
 * them make the model present. Fetching at build time does — the container starts
 * with the weights already on disk, loads in ~2s instead of ~19s, and never needs
 * the network for a search.
 *
 * Idempotent: a file already at its expected size is left alone, so a rebuilt
 * layer costs nothing.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { MODEL_ID } from './embed.ts';

const CACHE_DIR =
  process.env['MODEL_CACHE_DIR'] ?? fileURLToPath(new URL('../../../.models', import.meta.url));

/**
 * PINNED, BECAUSE `main` IS NOT AN IDENTITY — 30 Aug 2026.
 *
 * This file used to fetch from `/resolve/main`, and the cost of that was found
 * rather than guessed. `main` is a moving ref: the bytes it served on the day
 * the corpus was embedded are not recoverable from anything this repository
 * recorded, so generation v2 had NO reproducible model identity at all.
 * Pinning the full commit sha fixes that going forward. It is the full 40-char
 * sha deliberately — a short sha is a prefix, not a name.
 */
const MODEL_REVISION = '4de13258303883538bd53b696b452bf8099f0858';

const BASE = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}`;

/**
 * WHAT THE PINNED REVISION ACTUALLY SERVES.
 *
 * Verified on 30 Aug 2026 by streaming every file from the pinned revision and
 * hashing it, and independently against the Hub API's `lfs.sha256` for the same
 * revision. The two agree.
 */
const UPSTREAM_SHA256: Readonly<Record<string, string>> = {
  'config.json': '734a79bf12d388c1467a4e3ab625f45de7f6906cffcfb93a1eca1787504bed95',
  'tokenizer.json': '6710678b12670bc442b99edc952c4d996ae309a7020c1fa0096dd245c2faf790',
  'tokenizer_config.json': '7e4c1cc848840aeccdd763458c18dd525eb0f795c992e00ebe9c28554e7db2d4',
  'onnx/model.onnx': '5d89a0010dd39aa2cfa8b22bb49f06904c5bbf5877135f877da419480f40cde3',
  'onnx/model.onnx_data': '1eebfb28493f67bba03ce0ef64bfdc7fc5a3bd9d7493f818bb1d78cd798416b4',
};

/**
 * WHAT THE CORPUS WAS ACTUALLY EMBEDDED WITH — AND WHY IT DIFFERS.
 *
 * Four of these five files are byte-identical to the pinned revision. The fifth,
 * the 2.27 GB weights blob, is NOT, and matches no revision this repository has
 * ever had: all 17 commits of `Xenova/bge-m3` have only ever carried one blob of
 * that size, `1eebfb28...`, and the local copy is `a02dfa4c...`. It differs in
 * 42,988 bytes of 2,266,820,608 (0.0019%), clustered from offset 1,047,976,779,
 * and the differing values are real weights — sign flips, deltas up to 1.4 — not
 * rounding. The old size-only check could not see it, which is why it survived.
 *
 * The corpus is not damaged by this. Measured on 12 documents, CPU inference from
 * these local bytes reproduces the stored vectors at cosine 1.000000. But the
 * SAME texts through the pinned upstream weights land at cosine 0.99957-0.99989
 * (mean 0.99978) against the corpus — below the 0.9999 floor this project already
 * set for itself when it refused TF32 for exactly this reason. So a container
 * that fetches upstream and then serves QUERIES would be embedding queries into a
 * measurably different space from the corpus they search.
 *
 * Hence: never overwrite a local file that matches the corpus hash. That file is
 * the only copy of the weights generation v2 was built from.
 */
const CORPUS_SHA256: Readonly<Record<string, string>> = {
  ...UPSTREAM_SHA256,
  'onnx/model.onnx_data': 'a02dfa4caeb2916d812c9d817e84812f1fd66bb2160a5f7d87b4a6469e109a6c',
};

/** Set when the process must embed into the SAME space as the stored corpus. */
const REQUIRE_CORPUS_BYTES = process.env['EMBED_REQUIRE_CORPUS_BYTES'] === '1';

async function sha256(file: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}

/**
 * Exactly what fp32 needs, and nothing else.
 *
 * `model.onnx` is only the graph — 0.6MB. The tensors live in
 * `model.onnx_data`, and a graph without its external data loads as far as the
 * error above and no further.
 *
 * Sizes are NOT hardcoded. They are read from each response's `Content-Length`,
 * so the check is against what the server actually offered rather than a
 * constant that goes stale the moment upstream re-uploads a file. A truncated
 * download is worse than a missing one — it fails at load time with an error
 * that says nothing about truncation.
 */
const FILES: readonly string[] = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model.onnx',
  'onnx/model.onnx_data',
];

async function expectedSize(path: string): Promise<number | null> {
  const head = await fetch(`${BASE}/${path}`, { method: 'HEAD' });
  if (!head.ok) throw new Error(`HEAD ${path} -> ${head.status}`);
  const len = head.headers.get('content-length');
  return len ? Number(len) : null;
}

async function fetchOne(path: string): Promise<void> {
  const target = join(CACHE_DIR, MODEL_ID, path);
  await mkdir(dirname(target), { recursive: true });

  const expected = await expectedSize(path);

  /**
   * A CACHED FILE IS NOW IDENTIFIED BY ITS CONTENT, NOT ITS LENGTH.
   *
   * The old check was `size === Content-Length`, and a 2.27 GB blob that was
   * wrong in 42,988 bytes passed it every single time. Hashing 2.27 GB costs
   * about forty seconds on a rebuilt layer; not noticing that the weights are
   * not the weights cost a corpus with no reproducible identity.
   *
   * A local file matching EITHER the pinned revision or the corpus is kept. The
   * corpus match is kept even though it is not upstream, because those bytes are
   * the only copy of what generation v2 was embedded with — re-fetching over
   * them would destroy the one artifact that makes the stored vectors
   * reproducible, which is the opposite of what this script is for.
   */
  try {
    const existing = await stat(target);
    const have = await sha256(target);
    if (have === UPSTREAM_SHA256[path]) {
      console.log(`  ${path.padEnd(22)} cached ${(existing.size / 1024 / 1024).toFixed(1)} MB  sha256 ok (pinned revision)`);
      return;
    }
    if (have === CORPUS_SHA256[path]) {
      console.log(`  ${path.padEnd(22)} cached ${(existing.size / 1024 / 1024).toFixed(1)} MB  sha256 = CORPUS bytes, NOT the pinned revision`);
      console.log(`  ${''.padEnd(22)} KEEPING these bytes: they are what the stored vectors were built from.`);
      console.log(`  ${''.padEnd(22)} See docs/ai/embedding-manifests/EMBEDDING_IDENTITY_V2.json`);
      return;
    }
    console.log(`  ${path.padEnd(22)} re-fetching (sha256 ${have.slice(0, 16)} matches neither the pinned revision nor the corpus)`);
  } catch {
    // Not present yet.
  }

  const started = Date.now();
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok || !res.body) throw new Error(`GET ${path} -> ${res.status}`);
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(target),
  );

  const written = await stat(target);
  if (expected !== null && written.size !== expected) {
    throw new Error(`${path} wrote ${written.size} bytes, server offered ${expected}`);
  }

  /**
   * Content, then length. A truncated download already failed the size check
   * above; this catches the one that did not — right length, wrong bytes.
   */
  const got = await sha256(target);
  const want = UPSTREAM_SHA256[path];
  if (want && got !== want) {
    throw new Error(
      `${path} sha256 ${got} does not match the pinned revision ${MODEL_REVISION} (${want}). ` +
        'Refusing: this is exactly the failure that left generation v2 without a reproducible model.',
    );
  }
  if (REQUIRE_CORPUS_BYTES && got !== CORPUS_SHA256[path]) {
    throw new Error(
      `${path} was fetched from the pinned revision, but EMBED_REQUIRE_CORPUS_BYTES=1 demands the ` +
        `bytes the stored corpus was embedded with (${CORPUS_SHA256[path]}). Those bytes exist only ` +
        'in the protected model pack; restore them rather than re-downloading.',
    );
  }
  const secs = (Date.now() - started) / 1000;
  console.log(
    `  ${path.padEnd(22)} ${(written.size / 1024 / 1024).toFixed(1)} MB in ${secs.toFixed(1)}s  sha256 ok`,
  );
  if (got !== CORPUS_SHA256[path]) {
    console.log(`  ${''.padEnd(22)} NOTE: upstream bytes, not corpus bytes. Queries embedded here sit`);
    console.log(`  ${''.padEnd(22)} ~0.99978 cosine from the stored corpus. Fine to rebuild with, NOT`);
    console.log(`  ${''.padEnd(22)} fine to serve queries against generation v2 with.`);
  }
}

console.log(`fetching ${MODEL_ID} (fp32) at ${MODEL_REVISION} into ${CACHE_DIR}`);
for (const path of FILES) await fetchOne(path);
console.log('model ready — the container will not need the network to search');
