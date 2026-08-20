/**
 * The founder's instruction of 20 Aug 2026 is narrow and absolute: DeepSeek
 * **V4 Flash** only, never V3, on either provider. InferX already runs V4 Flash.
 * The only path by which V3 could ever have entered the corpus was this
 * fallback's default — `deepseek/deepseek-chat` — taken silently on a 429, in
 * the middle of a run, with the swap recorded in a column nobody reads.
 *
 * These tests exist so that default cannot come back by accident.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { callOpenRouter, openRouterKeyFromEnv, openRouterModelFromEnv } from './openrouter.ts';

describe('openRouterModelFromEnv', () => {
  it('returns null when OPENROUTER_MODEL is unset — no model is ever assumed', () => {
    assert.equal(openRouterModelFromEnv({} as NodeJS.ProcessEnv), null);
  });

  it('returns null for a blank value rather than treating it as a slug', () => {
    assert.equal(openRouterModelFromEnv({ OPENROUTER_MODEL: '   ' } as NodeJS.ProcessEnv), null);
  });

  it('returns exactly what was configured, trimmed', () => {
    assert.equal(
      openRouterModelFromEnv({ OPENROUTER_MODEL: ' deepseek/deepseek-v4-flash ' } as NodeJS.ProcessEnv),
      'deepseek/deepseek-v4-flash',
    );
  });
});

describe('callOpenRouter', () => {
  it('REFUSES rather than picking a model, and never opens a socket to do it', async () => {
    let called = false;
    const result = await callOpenRouter('prompt', {
      apiKey: 'k',
      fetchImpl: (async () => {
        called = true;
        throw new Error('must not be reached');
      }) as unknown as typeof fetch,
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /OPENROUTER_MODEL is not set/);
    assert.equal(called, false, 'a call with no model must not reach the network');
  });
});

describe('openRouterKeyFromEnv', () => {
  it('treats an empty key as absent', () => {
    assert.equal(openRouterKeyFromEnv({ OPENROUTER_API_KEY: '' } as NodeJS.ProcessEnv), null);
  });
});
