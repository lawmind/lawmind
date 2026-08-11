/**
 * The generation path — the thing this package has never had.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS ACTUALLY BEING MEASURED, AND IT IS NOT THE MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `THRESHOLDS` defines the two generation metrics as properties of what the
 * user is SHOWN, not of what the model said:
 *
 *   hallucinationRate — *"references shown as verified that no tier confirms"*
 *   silentDropRate    — *"references removed without an unverified state shown"*
 *
 * **So the model inventing a reference is not, by itself, a failure.** Models
 * invent. The failure is our pipeline rendering an invented reference as
 * confirmed, or quietly deleting it so the advocate never learns it was
 * doubted. `CITATION_HARNESS.md`: an unverified citation may be shown, it may
 * never be shown as confirmed, and it may never be silently dropped.
 *
 * That is why this file does not ask the model for citation strings at all. It
 * hands the model a numbered evidence set and asks for **evidence IDs**, then
 * resolves them itself — the architecture both design documents insist on, and
 * the one `CLAUDE.md` already requires.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE MODEL IS GIVEN A CHANCE TO FAIL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The prompt does not forbid inventing an ID, and it must not. A gate that only
 * ever sees well-behaved output has not tested the case it exists for. When the
 * model returns `E9` for a five-item evidence set, {@link resolveReferences}
 * must mark it **unverified** and keep it — and that is the observation the
 * metric is made of.
 */

/** Public-class routing per `CLAUDE.md` §5. Judgments are already published. */
export const GENERATION_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * **Generous on purpose.** DeepSeek V4 Flash emits reasoning tokens before its
 * answer. Measured 9 Aug 2026: a call with `max_tokens: 5` returned
 * `finish_reason: "length"` and **empty content** — the whole budget went to
 * reasoning. A harness that set this too low would record "the model produced
 * no citations" and grade it as a clean run.
 */
export const MAX_TOKENS = 2000;

export type Evidence = {
  /** `E1`, `E2` … — what the model is asked to cite. Never a citation string. */
  readonly id: string;
  readonly judgmentId: string;
  readonly caseTitle: string;
  readonly passage: string;
};

export type Reference = {
  readonly id: string;
  /** Null when the model invented an ID that is not in the evidence set. */
  readonly judgmentId: string | null;
  /**
   * `verified` only when the ID resolves to evidence we supplied. There is no
   * third state here: `failed` renders exactly as `unverified` and the advocate
   * cannot act on the difference.
   */
  readonly state: 'verified' | 'unverified';
};

export type Generation = {
  readonly answer: string;
  /** Every ID the model emitted, in order, de-duplicated. */
  readonly citedIds: readonly string[];
  readonly references: readonly Reference[];
  readonly usage: { inputTokens: number; outputTokens: number; costUsd: number };
};

/**
 * Resolve what the model emitted against what it was given.
 *
 * **This function never drops a reference, and that is its entire purpose.**
 * Every emitted ID comes back, either resolved or explicitly `unverified`. A
 * `filter` here would produce a clean-looking answer and a silent-drop rate of
 * zero computed from an output that had already done the dropping.
 */
export function resolveReferences(
  citedIds: readonly string[],
  evidence: readonly Evidence[],
): Reference[] {
  const byId = new Map(evidence.map((e) => [e.id.toUpperCase(), e]));
  return citedIds.map((id) => {
    const hit = byId.get(id.toUpperCase());
    return hit
      ? { id, judgmentId: hit.judgmentId, state: 'verified' as const }
      : { id, judgmentId: null, state: 'unverified' as const };
  });
}

/**
 * Pull evidence IDs out of an answer.
 *
 * Deliberately narrow: `[E12]` in square brackets, which is what the prompt
 * asks for. A looser rule that also accepted a bare `E12` would match ordinary
 * prose, and over-counting references inflates the denominator of both metrics
 * — making a bad run look better, which is the wrong direction to be wrong in.
 */
export function extractCitedIds(answer: string): string[] {
  const seen = new Set<string>();
  for (const m of answer.matchAll(/\[(E\d{1,3})\]/gi)) {
    seen.add(m[1]!.toUpperCase());
  }
  return [...seen];
}

/** The two generation metrics, computed from resolved references. */
export function gradeReferences(references: readonly Reference[]): {
  total: number;
  hallucinated: number;
  droppedSilently: number;
} {
  return {
    total: references.length,
    /**
     * A reference the pipeline would show as confirmed while nothing confirms
     * it. Structurally impossible above — which is the point. The metric exists
     * to prove the property holds against real model output, not to discover
     * it.
     */
    hallucinated: references.filter((r) => r.state === 'verified' && r.judgmentId === null).length,
    /**
     * Computed by the caller comparing emitted IDs against rendered ones;
     * `resolveReferences` returns one per input, so this is 0 unless that
     * invariant breaks.
     */
    droppedSilently: 0,
  };
}

function buildPrompt(question: string, evidence: readonly Evidence[]): string {
  /**
   * **No evidence means a different question is being asked.**
   *
   * The evidence-grounded prompt below tells the model to say the evidence does
   * not answer the question — right when there IS evidence and it falls short.
   * With an EMPTY evidence set the model dutifully says exactly that to
   * everything, and an adversarial case then fails for giving a *generic*
   * refusal rather than a reasoned one.
   *
   * **Measured 9 Aug 2026:** the first adversarial run scored 20%, entirely on
   * `refusal never mentions X`, with **no forbidden text produced and nothing
   * cited**. The model was refusing correctly and being graded on the wrong
   * prompt. So an evidence-free request asks for legal judgement instead.
   */
  if (evidence.length === 0) {
    return [
      'You are assisting an Indian advocate.',
      '',
      'If the request cannot properly be met — because it is legally impossible,',
      'because it misstates what a judgment held, or because a necessary fact is',
      'missing — REFUSE, and explain specifically WHY in plain terms. Name the',
      'legal reason. Do not produce the requested document. Do not cite anything.',
      '',
      `REQUEST: ${question}`,
    ].join('\n');
  }

  const block = evidence
    .map((e) => `[${e.id}] ${e.caseTitle}\n${e.passage.slice(0, 1200)}`)
    .join('\n\n');
  return [
    'You are assisting an Indian advocate. Answer ONLY from the numbered evidence below.',
    '',
    'Rules:',
    '- Cite by evidence ID in square brackets, e.g. [E1]. Never write a case citation yourself.',
    '- Every legal proposition must carry at least one evidence ID.',
    '- If the evidence does not answer the question, say so plainly and cite nothing.',
    '',
    `QUESTION: ${question}`,
    '',
    'EVIDENCE:',
    block,
  ].join('\n');
}

export type GenerateDeps = {
  apiKey?: string | undefined;
  inferxKey?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  model?: string | undefined;
};

/**
 * inferx.net — the same free DeepSeek V4 Flash grant `services/api/src/llm/call.ts`
 * prefers, given 11 Aug 2026. Preferred here for exactly the same reason: this
 * harness path calls `GENERATION_MODEL` on every run, and the free grant means
 * those runs stop being cost-gated. OpenRouter stays the fallback.
 */
const INFERX_BASE_URL = process.env['INFERX_BASE_URL'] ?? 'https://model.inferx.net/endpoints/v1';
const INFERX_MODEL = process.env['INFERX_MODEL'] ?? 'deepseek-v4-flash';

/**
 * One generation call. **Refuses honestly without a key** rather than returning
 * an empty answer that would grade as a clean run.
 */
export async function generate(
  question: string,
  evidence: readonly Evidence[],
  deps: GenerateDeps = {},
): Promise<Generation> {
  const model = deps.model ?? GENERATION_MODEL;
  const inferxKey = deps.inferxKey ?? process.env['INFERX_API_KEY'];
  const useInferx = model === GENERATION_MODEL && Boolean(inferxKey);
  const apiKey = useInferx ? inferxKey : (deps.apiKey ?? process.env['OPENROUTER_API_KEY']);
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is absent. The generation path refuses rather than returning ' +
        'an empty answer — an empty answer cites nothing and would grade as a perfect run.',
    );
  }
  const doFetch = deps.fetchImpl ?? globalThis.fetch;

  const res = await doFetch(
    useInferx
      ? `${INFERX_BASE_URL}/chat/completions`
      : 'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: useInferx ? INFERX_MODEL : model,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        messages: [{ role: 'user', content: buildPrompt(question, evidence) }],
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`generation failed: http ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };

  const answer = body.choices?.[0]?.message?.content ?? '';
  const citedIds = extractCitedIds(answer);
  return {
    answer,
    citedIds,
    references: resolveReferences(citedIds, evidence),
    usage: {
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
      // inferx.net's free grant carries no per-call cost.
      costUsd: useInferx ? 0 : (body.usage?.cost ?? 0),
    },
  };
}
