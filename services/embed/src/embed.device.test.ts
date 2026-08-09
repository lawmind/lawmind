/**
 * The device switch must default to CPU. Production runs on Railway, which has
 * no GPU, and a default that assumed one would fail at boot in the one place
 * that matters.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { embedDevice } from './embed.ts';

test('the default is CPU, with no environment set', () => {
  delete process.env['EMBED_DEVICE'];
  assert.equal(embedDevice(), 'cpu');
});

test('an unrecognised value falls back to CPU rather than being passed through', () => {
  // onnxruntime would throw on an unknown provider at model load — after the
  // 2.2GB download, inside a promise the loader memoises. Failing closed here
  // is far cheaper than failing there.
  for (const bad of ['cuda', 'CPU', 'gpu', '', 'true']) {
    process.env['EMBED_DEVICE'] = bad;
    assert.equal(embedDevice(), 'cpu', `${bad} was passed through`);
  }
  delete process.env['EMBED_DEVICE'];
});

test('the two bundled accelerators are accepted', () => {
  // listSupportedBackends() reports cpu, dml and webgpu as bundled. CUDA is not
  // among them and must not be offered.
  process.env['EMBED_DEVICE'] = 'dml';
  assert.equal(embedDevice(), 'dml');
  process.env['EMBED_DEVICE'] = 'webgpu';
  assert.equal(embedDevice(), 'webgpu');
  delete process.env['EMBED_DEVICE'];
});
