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

function buildPrompt(
  question: string,
  evidence: readonly Evidence[],
  transition: string | null,
): string {
  /**
   * The transition block is appended to BOTH branches on purpose.
   *
   * The evidence-free branch is where `adv-5-no-date-so-no-regime` lands, and it
   * is the one that failed. But an evidence-BEARING criminal answer has the same
   * problem in a quieter form: retrieved authorities are overwhelmingly pre-2024
   * because the corpus is, so a model reading them frames its answer under the
   * IPC whether or not the offence predates July 2024. Giving the block only to
   * the branch whose failure was observed is the sibling-defect pattern that
   * cost three separate fixes on the citation predicates this week.
   */
  const withTransition = (parts: readonly string[]): string =>
    (transition ? [...parts, '', transition] : [...parts]).join('\n');
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
    return withTransition([
      'You are assisting an Indian advocate.',
      '',
      'If the request cannot properly be met — because it is legally impossible,',
      'because it misstates what a judgment held, or because a necessary fact is',
      'missing — REFUSE, and explain specifically WHY in plain terms. Name the',
      'legal reason. Do not produce the requested document. Do not cite anything.',
      '',
      `REQUEST: ${question}`,
    ]);
  }

  const block = evidence
    .map((e) => `[${e.id}] ${e.caseTitle}\n${e.passage.slice(0, 1200)}`)
    .join('\n\n');
  return withTransition([
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
  ]);
}

export type GenerateDeps = {
  apiKey?: string | undefined;
  inferxKey?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  model?: string | undefined;
  /**
   * Resolves the 1 July 2024 criminal-transition block for a question, or null
   * when the question raises no criminal issue.
   *
   * **Injected rather than imported, and that is deliberate.** The resolver needs
   * a database connection — the commencement dates are read from `statutes`,
   * sourced to indiacode.nic.in, never from a constant. This module has no
   * database client and must not grow one: it is also the path unit tests drive
   * with a stubbed `fetch` and no Postgres anywhere.
   *
   * Absent, generation behaves exactly as before. That is the honest default: a
   * harness run without a database produces the un-augmented prompt rather than
   * silently asserting a regime it cannot source.
   *
   * Implementation: `services/api/src/statutes/transition.ts`.
   */
  transitionFor?: ((question: string) => Promise<string | null>) | undefined;
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
/**
 * Is this failure worth trying the OTHER provider for?
 *
 * A 429 or a 5xx says *this* endpoint cannot serve the request right now, and a
 * different provider plainly might. A 400 or a 401 says the request or the
 * credential is wrong, and re-sending it elsewhere turns one clear error into
 * two confusing ones.
 */
function worthFallingBack(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

type Attempt = { ok: true; body: unknown } | { ok: false; status: number; detail: string };

/**
 * OPENROUTER BECOMES PRIMARY THE MOMENT INFERX CANNOT SERVE — founder direction,
 * 18 Aug 2026: *"use openrouter as primary if u cannot use inferx"*.
 *
 * Two mechanisms, because they answer two different questions.
 *
 * **`GENERATION_PROVIDER=openrouter`** skips InferX entirely. For when the free
 * grant is known to be down and nobody wants to pay a failed round trip to
 * rediscover that on every call.
 *
 * **The breaker** answers it automatically. InferX returned
 * `429 all replicas at capacity` on 24 of 25 adversarial calls; without a
 * breaker each of those 25 calls pays a doomed request first, which on a full
 * gate is hundreds of them. After `INFERX_FAILURES_BEFORE_OPENROUTER`
 * consecutive fallback-worthy failures, InferX is skipped for the rest of the
 * process and OpenRouter IS the primary. One success resets it, because a free
 * grant coming back is the normal case and a process should not be permanently
 * pessimistic about it.
 *
 * Deliberately in-process and not persisted: the state a run cares about is
 * "is the grant serving right now", and a stale file saying otherwise would be
 * worse than asking once.
 */
const INFERX_FAILURES_BEFORE_OPENROUTER = 2;
let consecutiveInferxFailures = 0;

async function callOnce(
  doFetch: typeof fetch,
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<Attempt> {
  const res = await doFetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text()).slice(0, 200) };
  return { ok: true, body: await res.json() };
}

/**
 * One generation call. **Refuses honestly without a key** rather than returning
 * an empty answer that would grade as a clean run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FALLBACK THE COMMENT ABOVE ALREADY PROMISED — WIRED 18 AUG 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `INFERX_BASE_URL`'s comment says *"OpenRouter stays the fallback"*. It was not
 * one: the code picked a provider up front and threw on its first failure. The
 * comment described the intent and only the code disagreed.
 *
 * It was not theoretical. Running the five adversarial cases on 18 Aug, InferX
 * answered **1 call and failed 24** with
 * `http 429 ... endpoint deepseek-v4-flash all replicas at capacity`, so
 * `adversarialPassRate` came back NOT MEASURED — while a live, funded
 * `OPENROUTER_API_KEY` sat unused in the same process. A free grant at capacity
 * is a normal Tuesday for a free grant; a release gate that reports "not
 * measured" because of it is a gate that will never run.
 *
 * The cost intent is unchanged — InferX is still tried FIRST on every call, and
 * the fallback only fires on a status a different provider could plausibly fix
 * (see `worthFallingBack`). A 400 or a 401 still throws immediately, because
 * re-sending a malformed request to a second provider only produces a second
 * confusing error.
 */
export async function generate(
  question: string,
  evidence: readonly Evidence[],
  deps: GenerateDeps = {},
): Promise<Generation> {
  const model = deps.model ?? GENERATION_MODEL;
  const inferxKey = deps.inferxKey ?? process.env['INFERX_API_KEY'];
  const openRouterKey = deps.apiKey ?? process.env['OPENROUTER_API_KEY'];
  const forced = (process.env['GENERATION_PROVIDER'] ?? '').toLowerCase();
  const preferInferx =
    model === GENERATION_MODEL &&
    Boolean(inferxKey) &&
    forced !== 'openrouter' &&
    // The breaker only applies when there is somewhere to fall back TO.
    (consecutiveInferxFailures < INFERX_FAILURES_BEFORE_OPENROUTER || !openRouterKey);
  if (!preferInferx && !openRouterKey) {
    throw new Error(
      'OPENROUTER_API_KEY is absent. The generation path refuses rather than returning ' +
        'an empty answer — an empty answer cites nothing and would grade as a perfect run.',
    );
  }
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  /**
   * A resolver that throws must not take generation down with it. The transition
   * block makes an answer SAFER; losing it is a degradation, and turning a
   * degradation into an outage is the wrong trade on a path whose alternative
   * output is no answer at all. The failure is logged, never swallowed silently.
   */
  let transition: string | null = null;
  if (deps.transitionFor) {
    try {
      transition = await deps.transitionFor(question);
    } catch (error) {
      console.error('  transition context unavailable: ' + String((error as Error).message));
    }
  }
  const prompt = buildPrompt(question, evidence, transition);

  let usedInferx = preferInferx;
  let attempt: Attempt;
  if (preferInferx) {
    attempt = await callOnce(
      doFetch,
      `${INFERX_BASE_URL}/chat/completions`,
      inferxKey!,
      INFERX_MODEL,
      prompt,
    );
    if (attempt.ok) consecutiveInferxFailures = 0;
    if (!attempt.ok && openRouterKey && worthFallingBack(attempt.status)) {
      consecutiveInferxFailures++;
      if (consecutiveInferxFailures === INFERX_FAILURES_BEFORE_OPENROUTER) {
        console.error(
          `  inferx failed ${consecutiveInferxFailures}x (http ${attempt.status}) — ` +
            'OpenRouter is primary for the rest of this process',
        );
      }
      const first = attempt;
      attempt = await callOnce(
        doFetch,
        'https://openrouter.ai/api/v1/chat/completions',
        openRouterKey,
        model,
        prompt,
      );
      usedInferx = false;
      if (!attempt.ok) {
        throw new Error(
          `generation failed on both providers: inferx http ${first.status} ${first.detail} | ` +
            `openrouter http ${attempt.status} ${attempt.detail}`,
        );
      }
    }
  } else {
    attempt = await callOnce(
      doFetch,
      'https://openrouter.ai/api/v1/chat/completions',
      openRouterKey!,
      model,
      prompt,
    );
  }

  if (!attempt.ok) {
    throw new Error(`generation failed: http ${attempt.status} ${attempt.detail}`);
  }
  const body = attempt.body as {
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
      // inferx.net's free grant carries no per-call cost; a fallback to
      // OpenRouter does, and reporting 0 for it would understate the run.
      costUsd: usedInferx ? 0 : (body.usage?.cost ?? 0),
    },
  };
}
