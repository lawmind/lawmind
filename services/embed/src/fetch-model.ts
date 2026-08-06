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
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { MODEL_ID } from './embed.ts';

const CACHE_DIR =
  process.env['MODEL_CACHE_DIR'] ?? fileURLToPath(new URL('../../../.models', import.meta.url));

const BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;

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

  try {
    const existing = await stat(target);
    if (expected === null ? existing.size > 0 : existing.size === expected) {
      console.log(`  ${path.padEnd(22)} cached ${(existing.size / 1024 / 1024).toFixed(1)} MB`);
      return;
    }
    console.log(`  ${path.padEnd(22)} re-fetching (have ${existing.size}, want ${expected})`);
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
  const secs = (Date.now() - started) / 1000;
  console.log(
    `  ${path.padEnd(22)} ${(written.size / 1024 / 1024).toFixed(1)} MB in ${secs.toFixed(1)}s`,
  );
}

console.log(`fetching ${MODEL_ID} (fp32) into ${CACHE_DIR}`);
for (const path of FILES) await fetchOne(path);
console.log('model ready — the container will not need the network to search');
