/**
 * A minimal InferX/DeepSeek caller for this service.
 *
 * `services/api/src/llm/call.ts` already implements this exact call shape —
 * `inferx.net`, OpenAI-compatible, the free DeepSeek V4 Flash grant given to
 * the founder 11 Aug 2026, verified by a live call before it was written.
 * This is not a second, divergent path: same base URL, same model, same
 * request/response shape, **re-verified live in this session**. It lives here
 * rather than importing `@lawmind/api` because `services/ingest` and
 * `services/api` are separate deployables and do not import each other's
 * `src/`.
 *
 * **The one real addition, found live in this session's own smoke test**: the
 * shared free-tier endpoint genuinely saturates —
 * `service failure: endpoint deepseek-v4-flash all replicas at capacity`,
 * HTTP 429, observed directly, not assumed. `call.ts` has no retry at all, so
 * a caller built on it alone would read a transient capacity blip as a
 * permanent failure. Retried here with backoff; nothing here changes `call.ts`
 * or its behaviour for `search`/`draft`/`briefing`/`extract`.
 */

import { assertPublicOnlyEgress, type EgressPayloadClass } from './llm-egress.ts';

export type InferxResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Every InferX grant configured, **tried in declaration order** — so the
 * preferred grant is simply the one named `INFERX_API_KEY`, and changing the
 * preference is an `.env` edit rather than a code change. Reordered 12 Aug 2026
 * on the founder's instruction to try `ix_798c4c06…` first.
 *
 * The free pool is capacity-limited and returns HTTP 429 under load — measured,
 * not assumed (`docs/ai/DEEPSEEK_DATA_MOAT.md` §1). A second grant turns an
 * exhausted key from a stop into a slowdown, so `callInferxPooled` rotates
 * rather than giving up. Add further keys as `INFERX_API_KEY_3`, `_4`, ... and
 * they are picked up with no code change.
 *
 * Keys live in `.env`, which is gitignored — a grant is a credential and never
 * belongs in the repository.
 */
export function inferxKeysFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const keys: string[] = [];
  for (const name of [
    'INFERX_API_KEY',
    'INFERX_API_KEY_2',
    'INFERX_API_KEY_3',
    'INFERX_API_KEY_4',
  ]) {
    const v = env[name];
    if (typeof v === 'string' && v.trim() !== '' && !keys.includes(v.trim())) keys.push(v.trim());
  }
  return keys;
}

/**
 * `callInferx` across a pool of grants: the first key that is merely BUSY costs
 * a full backoff ladder before the next is tried, so rotation is a fallback and
 * not a load balancer. A permanent failure (bad request, bad key) is returned
 * immediately rather than retried against every remaining grant — repeating a
 * malformed request four times is not resilience.
 */
export async function callInferxPooled(
  prompt: string,
  deps: Omit<InferxDeps, 'apiKey'> & { readonly apiKeys: readonly string[] },
): Promise<InferxResult> {
  const keys = deps.apiKeys.filter((k) => k.trim() !== '');
  if (keys.length === 0) return { ok: false, reason: 'no InferX API key configured' };

  let lastReason = 'unknown';
  for (const [i, apiKey] of keys.entries()) {
    const result = await callInferx(prompt, { ...deps, apiKey });
    if (result.ok) return result;
    lastReason = result.reason;
    /**
     * ROTATE ON A PER-KEY FAILURE, NOT JUST A BUSY ONE.
     *
     * The first version rotated only on capacity (429) and returned everything
     * else straight to the caller. Then a grant started answering **HTTP 401**
     * and the whole treatment batch died on it, one document at a time, with
     * two perfectly good keys sitting unused behind it.
     *
     * 401/403 say *this key* is bad — expired, revoked, or out of allocation —
     * which is precisely a reason to try the next grant. A 400 still does not:
     * that says the REQUEST is malformed, and it would be malformed for every
     * key, so repeating it three times is just a slower failure.
     */
    if (!/capacity|429|401|403|unauthor|forbidden/i.test(result.reason)) return result;
    if (i < keys.length - 1) {
      console.log(`    key ${i + 1}/${keys.length} exhausted (${result.reason}) — rotating`);
    }
  }
  return { ok: false, reason: `all ${keys.length} InferX grants exhausted: ${lastReason}` };
}

export type InferxDeps = {
  readonly apiKey: string;
  readonly baseUrl?: string | undefined;
  readonly model?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly maxTokens?: number | undefined;
  /** Injectable for tests — real callers never pass this. */
  readonly sleepImpl?: ((ms: number) => Promise<void>) | undefined;
  /**
   * What is in the prompt. Defaults to `PUBLIC_LEGAL_TEXT` because that is the
   * only thing this service holds; naming anything else here is refused by
   * `llm-egress.ts` before a request is built. LCC's inventory (bus 1055) found
   * this path outside the provider gate.
   */
  readonly payloadClass?: EgressPayloadClass | undefined;
};

const DEFAULT_BASE_URL = 'https://model.inferx.net/endpoints/v1';
/**
 * **`deepseek-v4-flash` IS LISTED BY `/models` AND ANSWERS 401 ON EVERY CHAT
 * REQUEST. `deepseek-v4-flash-0731` works.**
 *
 * This cost hours and a wrong entry in the founder queue. When all three grants
 * began returning `{"error":"Unauthorized"}` mid-run, the obvious reading was
 * that the credentials had been revoked — the keys had worked minutes earlier,
 * and 401 is an auth status. It was not auth. `GET /models` with the same key
 * returns 200 and a catalogue, which is what finally separated the two: a key
 * that can list models is not an unauthorised key.
 *
 * inferx.net returns **401, not 404 or 400, for a model alias it will not
 * serve** — so an unavailable model is indistinguishable from a dead key by
 * status code alone. The lesson recorded here rather than in a commit message
 * nobody will re-read: when an endpoint says Unauthorized, prove it with a
 * second call that needs the same credential and nothing else.
 *
 * Overridable via `INFERX_MODEL` so the next alias change is a config edit.
 */
const DEFAULT_MODEL = process.env['INFERX_MODEL'] ?? 'deepseek-v4-flash-0731';
/**
 * `MODEL_STRATEGY.md` §5: DeepSeek V4 Flash emits reasoning tokens, and a
 * budget too small returns `finish_reason: "length"` with EMPTY content — a
 * caller that does not know this reads "no answer" as "the model has no
 * opinion" when it actually means "the budget ran out before the answer".
 * Adjudication prompts are short; 1,500 leaves headroom for the reasoning
 * this model does before it writes the JSON.
 */
const DEFAULT_MAX_TOKENS = 1500;
const MAX_ATTEMPTS = 5;

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One adjudication call, retried on transient capacity (HTTP 429) with
 * exponential backoff. **Not retried** on a 4xx that means something other
 * than "try later" (bad key, bad request) — retrying those just repeats the
 * same mistake more slowly, the identical distinction `hc-metadata.ts`'s
 * `withRetry` already draws for transport errors.
 */
export async function callInferx(prompt: string, deps: InferxDeps): Promise<InferxResult> {
  // Before the request is built, so a refused payload makes ZERO outbound calls.
  assertPublicOnlyEgress(deps.payloadClass ?? 'PUBLIC_LEGAL_TEXT', 'inferx');
  const baseUrl = deps.baseUrl ?? DEFAULT_BASE_URL;
  const model = deps.model ?? DEFAULT_MODEL;
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const sleep = deps.sleepImpl ?? defaultSleep;
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;

  let lastReason = 'unknown';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${deps.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTEMPTS - 1) await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (res.status === 429) {
      lastReason = 'http 429 (capacity)';
      if (attempt < MAX_ATTEMPTS - 1) await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      return { ok: false, reason: `http ${res.status}` };
    }

    const body = (await res.json()) as Record<string, unknown>;
    const choices = body['choices'] as { message?: { content?: string } }[] | undefined;
    const usage = body['usage'] as Record<string, number> | undefined;
    const text = choices?.[0]?.message?.content ?? '';
    if (text === '') {
      return {
        ok: false,
        reason:
          'empty content — max_tokens likely exhausted by reasoning tokens (MODEL_STRATEGY.md §5)',
      };
    }
    return {
      ok: true,
      text,
      inputTokens: usage?.['prompt_tokens'] ?? 0,
      outputTokens: usage?.['completion_tokens'] ?? 0,
    };
  }
  return { ok: false, reason: `retries exhausted after ${MAX_ATTEMPTS} attempts: ${lastReason}` };
}
