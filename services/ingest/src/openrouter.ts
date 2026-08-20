/**
 * OpenRouter — the PAID fallback for when the free InferX grants are saturated.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND PROVIDER AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The free inferx.net pool is capacity-limited and, under the load four lanes
 * now put on it, returns `http 429 (capacity)` on nearly every call — all three
 * grants exhausted within seconds. Enrichment throughput fell to roughly zero
 * while the corpus kept growing at ~34,000 documents an hour.
 *
 * So InferX stays FIRST — it is free and it works when it has capacity — and
 * this is what runs when it does not. The order matters: reversing it would
 * spend money on calls the free pool would happily have served.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COST IS RECORDED, NEVER ESTIMATED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * OpenRouter returns the real charge for the call when the request asks for it
 * (`usage: { include: true }` → `usage.cost`), so `llm_calls.cost_usd` carries
 * what was actually spent rather than a per-token rate someone typed in from a
 * pricing page. A guessed cost in a cost ledger is worse than an absent one:
 * it looks authoritative and drifts the moment the vendor changes a price.
 *
 * This is the first paid model path in the ingest lane. Everything before it
 * recorded `costUsd = 0` truthfully, because the inferx grant is free.
 */

export type OpenRouterResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
      /** What OpenRouter says this call cost, in USD. Reported, not computed. */
      readonly costUsd: number;
    }
  | { readonly ok: false; readonly reason: string };

export type OpenRouterDeps = {
  readonly apiKey: string;
  readonly model?: string | undefined;
  readonly maxTokens?: number | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly sleepImpl?: ((ms: number) => Promise<void>) | undefined;
};

const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
/**
 * THERE IS NO DEFAULT MODEL, AND THAT IS A FOUNDER INSTRUCTION — 20 Aug 2026.
 *
 * This used to default to `deepseek/deepseek-chat`, which is **DeepSeek V3**.
 * The founder's direction is explicit: DeepSeek **V4 Flash** only, never V3, on
 * either provider. InferX already runs V4 Flash (`ENRICH_MODEL`), so the only
 * place V3 could enter the corpus was this fallback — silently, on a 429, in the
 * middle of a run, recorded in `document_enrichments.model` where nobody was
 * reading it.
 *
 * No replacement slug is guessed here. `OPENROUTER_MODEL` must be set to a real
 * V4-Flash slug for the fallback to run at all; unset, `openRouterModelFromEnv`
 * returns null and the caller does not call OpenRouter. A pass that refuses the
 * fallback loses throughput; a pass that quietly swaps the model loses the
 * ability to say what produced a row.
 */
const DEFAULT_MAX_TOKENS = 2000;
const MAX_ATTEMPTS = 4;

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function openRouterKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const k = env['OPENROUTER_API_KEY'];
  return typeof k === 'string' && k.trim() !== '' ? k.trim() : null;
}

export function openRouterModelFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const m = env['OPENROUTER_MODEL'];
  return typeof m === 'string' && m.trim() !== '' ? m.trim() : null;
}

export async function callOpenRouter(
  prompt: string,
  deps: OpenRouterDeps,
): Promise<OpenRouterResult> {
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const sleep = deps.sleepImpl ?? defaultSleep;
  const model = deps.model;
  if (!model)
    return {
      ok: false,
      reason: 'OPENROUTER_MODEL is not set — no model is assumed (founder: DeepSeek V4 Flash only)',
    };
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;

  let lastReason = 'unknown';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await doFetch(BASE_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${deps.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          // Asks OpenRouter to report the real charge back on the response.
          usage: { include: true },
        }),
      });
    } catch (err) {
      lastReason = `transport: ${err instanceof Error ? err.message : String(err)}`;
      await sleep(Math.min(16_000, 1000 * 2 ** attempt));
      continue;
    }

    /**
     * 429 and 5xx are worth another attempt; a 4xx that is not 429 means the
     * request itself is wrong and repeating it just repeats the mistake — the
     * same distinction `inferx.ts` draws.
     */
    if (res.status === 429 || res.status >= 500) {
      lastReason = `http ${res.status}`;
      await sleep(Math.min(16_000, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      return { ok: false, reason: `http ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const text = body.choices?.[0]?.message?.content ?? '';
    if (text.trim() === '') {
      // Distinct from a transport failure: the call succeeded and said nothing.
      lastReason = 'empty content';
      await sleep(Math.min(16_000, 1000 * 2 ** attempt));
      continue;
    }
    return {
      ok: true,
      text,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
      costUsd: body.usage?.cost ?? 0,
    };
  }
  return { ok: false, reason: `openrouter: ${MAX_ATTEMPTS} attempts failed: ${lastReason}` };
}
