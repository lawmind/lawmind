/**
 * The local model — an RTX 4060 Ti doing enrichment with no rate limit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT IS THE LAST PROVIDER TRIED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured before building: the card sat at **0% utilisation** while enrichment
 * was throttled by a free API's 429s. `docs/ai/GPU_PLAN.md` establishes that
 * almost nothing else in this lane can use a GPU — PDF extraction is I/O then
 * branchy parsing, citation extraction is regex, paragraph splitting is string
 * slicing — but enrichment is genuinely compute-bound, and it was the one
 * workload waiting on someone else's capacity.
 *
 * Order is **InferX (free grant) → OpenRouter (paid) → here**. Local is last
 * not because it costs money — it costs none — but because a 7B is materially
 * weaker than DeepSeek V4, and the better model should get the work whenever it
 * is available. This is the floor under the pipeline, not the ceiling.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A WEAKER MODEL IS SAFE HERE AND WOULD NOT BE ELSEWHERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` measured DeepSeek V4 fabricating
 * an authority **10.8%** of the time when the correct answer was absent. A 7B
 * will do worse. **The architecture is what makes that tolerable**: every claim
 * carries a verbatim evidence span which is then located in the source text, so
 * a weaker model does not produce wrong data — it produces **more rejections**.
 * 776 claims have already been rejected that way and none reached the graph.
 *
 * So the trade is quality-neutral and throughput-positive, and the acceptance
 * test is not "does it run" but **"what is its grounding rate against
 * DeepSeek's on the same documents"**. `enrich-cli` records the model on every
 * row, so that comparison is a query rather than a guess.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 8 GB IS THE BINDING CONSTRAINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A 7B at Q4_K_M needs ~5 GB at 4K context and ~8–9 GB at 32K. Our metadata
 * excerpt is 4,000 characters, so it fits at 4K with headroom — and `num_ctx`
 * is pinned rather than left to the default precisely so a future prompt cannot
 * quietly grow past the card and start swapping to system RAM at a tenth the
 * speed.
 */

export type OllamaResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  | { readonly ok: false; readonly reason: string };

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
/**
 * Qwen2.5 7B Instruct at Q4_K_M. Chosen for instruction-following on structured
 * JSON output rather than for chat quality — this pipeline never reads prose,
 * it reads a JSON object with an evidence span in it.
 */
const DEFAULT_MODEL = 'qwen2.5:7b-instruct-q4_K_M';
/** Fits comfortably in 8 GB. See the header: this is a hardware limit, not a preference. */
const NUM_CTX = 4096;

export function ollamaModelFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env['OLLAMA_MODEL'] ?? DEFAULT_MODEL;
}

export function ollamaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env['OLLAMA_BASE_URL'] ?? DEFAULT_BASE_URL;
}

/**
 * Whether a local model is actually serving. Checked rather than assumed,
 * because a worker that silently degrades to "no third provider" is worse than
 * one that says the daemon is down.
 */
export async function ollamaAvailable(
  deps: { fetchImpl?: typeof fetch; baseUrl?: string } = {},
): Promise<boolean> {
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  try {
    const res = await doFetch(`${deps.baseUrl ?? ollamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type OllamaDeps = {
  readonly model?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly maxTokens?: number | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
};

export async function callOllama(prompt: string, deps: OllamaDeps = {}): Promise<OllamaResult> {
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const model = deps.model ?? ollamaModelFromEnv();

  let res: Response;
  try {
    res = await doFetch(`${deps.baseUrl ?? ollamaBaseUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        // `format: 'json'` constrains decoding to valid JSON. The prompts already
        // demand it and the parser already refuses anything else, so this is a
        // second belt rather than a replacement for either.
        format: 'json',
        options: {
          num_ctx: NUM_CTX,
          num_predict: deps.maxTokens ?? 1024,
          // Deterministic: the same document should yield the same answer, so a
          // re-run is a cache hit rather than a new opinion.
          temperature: 0,
        },
      }),
      // Generous: a cold model load pulls ~5 GB into VRAM before the first token.
      signal: AbortSignal.timeout(300_000),
    });
  } catch (err) {
    return { ok: false, reason: `ollama transport: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!res.ok) {
    return { ok: false, reason: `ollama http ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }

  const body = (await res.json()) as {
    response?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const text = body.response ?? '';
  if (text.trim() === '') return { ok: false, reason: 'ollama returned empty content' };

  return {
    ok: true,
    text,
    // Ollama reports real counts; absent means absent, never estimated.
    inputTokens: body.prompt_eval_count ?? 0,
    outputTokens: body.eval_count ?? 0,
  };
}
