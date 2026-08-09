/**
 * A real round-trip against the live bucket.
 *
 * Run: `npx tsx src/roundtrip.ts`
 *
 * Everything below is checked against the object storage actually returns,
 * because "the code compiles" and "R2 accepted the signature" are different
 * claims and only the second one matters. The ranged read is the one that
 * decides whether the tiered corpus design works at all.
 */
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';

import { objectStoreFromEnv } from './r2.ts';

const store = objectStoreFromEnv();
console.log(`store: ${store.name}\n`);

const key = `__selftest/${Date.now()}.txt`;
const text =
  'The protection granted under Section 438 would not ordinarily be limited to a fixed period. '.repeat(
    40,
  );
const raw = Buffer.from(text, 'utf8');
const compressed = brotliCompressSync(raw);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  await store.put(key, compressed, 'application/x-brotli');
  check('PUT', true, `${raw.byteLength} B raw → ${compressed.byteLength} B brotli`);

  const head = await store.head(key);
  check('HEAD returns the size', head?.size === compressed.byteLength, `${head?.size} B`);

  const got = await store.get(key);
  check('GET returns the bytes', got !== null && got.body.byteLength === compressed.byteLength);
  const back = got ? brotliDecompressSync(got.body).toString('utf8') : '';
  check('round-trips byte-for-byte through brotli', back === text);

  // THE operation the tiered design depends on: read 32 bytes from the middle.
  const range = await store.getRange(key, 10, 41);
  check('RANGED GET returns exactly 32 bytes', range?.byteLength === 32, `${range?.byteLength} B`);
  check(
    'the ranged bytes match the same slice of the whole object',
    range !== null && got !== null && Buffer.from(range).equals(Buffer.from(got.body.slice(10, 42))),
  );

  const missing = await store.get(`${key}.does-not-exist`);
  check('a missing key is null, not an error', missing === null);

  await store.delete(key);
  check('DELETE', (await store.head(key)) === null, 'HEAD is null afterwards');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
} catch (error) {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
