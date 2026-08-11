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

export type InferxResult =
  | { readonly ok: true; readonly text: string; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly ok: false; readonly reason: string };

export type InferxDeps = {
  readonly apiKey: string;
  readonly baseUrl?: string | undefined;
  readonly model?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly maxTokens?: number | undefined;
  /** Injectable for tests — real callers never pass this. */
  readonly sleepImpl?: ((ms: number) => Promise<void>) | undefined;
};

const DEFAULT_BASE_URL = 'https://model.inferx.net/endpoints/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash';
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
        reason: 'empty content — max_tokens likely exhausted by reasoning tokens (MODEL_STRATEGY.md §5)',
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
