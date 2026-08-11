/**
 * Every model call goes through here, and every one writes a ledger row.
 *
 * `CLAUDE.md` §5: *"Every call rows into `llm_calls` with `data_class` and
 * `pseudonymised`."* **No exceptions**, and the ledger is written even when the
 * call fails — a call that cost money and produced nothing is exactly the one
 * an audit needs to see, and it is invisible if only successes are recorded.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It will not send sensitive data without a countersigned DPA (OD-6), it will
 * not put two documents in one context, and it will not pick a model itself.
 * All three decisions live in `route.ts` as pure functions, so they can be
 * tested without a network or a database — and so this file cannot quietly
 * acquire a second opinion about them.
 */
import type { Sql } from 'postgres';

import {
  DEEPSEEK_V4_FLASH,
  type DataClass,
  type Feature,
  assertOneDocument,
  routeCall,
} from './route.ts';

export type CallRequest = {
  readonly dataClass: DataClass;
  readonly feature: Feature;
  readonly prompt: string;
  /** Whose call this is. Null for system jobs — the column is nullable. */
  readonly userId: string | null;
  /**
   * Document ids in this call's context. **Checked, not trusted**: more than
   * one distinct id throws before anything is sent.
   */
  readonly documentIds?: readonly string[];
};

export type CallResult =
  | { readonly ok: true; readonly text: string; readonly model: string; readonly costUsd: number }
  | { readonly ok: false; readonly reason: string };

export type CallDeps = {
  readonly fetchImpl?: typeof fetch | undefined;
  readonly openRouterKey?: string | undefined;
  readonly anthropicKey?: string | undefined;
  readonly inferxKey?: string | undefined;
  readonly now?: (() => number) | undefined;
};

/** Anthropic model ids are bare; OpenRouter ids carry a `vendor/` prefix. */
function isOpenRouter(model: string): boolean {
  return model.includes('/');
}

/**
 * inferx.net — an OpenAI-compatible endpoint carrying a free DeepSeek V4 Flash
 * token grant, given to the founder 11 Aug 2026. Preferred over OpenRouter for
 * exactly that one model, and only while a key is configured: this must never
 * become a second, unverified path for anything else, and the grant is a free
 * pool that could run out or change terms, so OpenRouter stays the fallback
 * rather than being replaced.
 *
 * **Response shape verified by a live call, not assumed** — `curl` against
 * `${INFERX_BASE_URL}/chat/completions` on 11 Aug 2026 returned the same
 * `choices[0].message.content` / `usage.prompt_tokens` / `usage.completion_tokens`
 * shape already parsed for OpenRouter below, so no new parsing branch is
 * needed — only a new URL, key and always-zero cost (the grant is free).
 */
const INFERX_BASE_URL = process.env['INFERX_BASE_URL'] ?? 'https://model.inferx.net/endpoints/v1';
/** inferx.net's own bare model name — not the OpenRouter `vendor/model` id. */
const INFERX_MODEL = process.env['INFERX_MODEL'] ?? 'deepseek-v4-flash';

function useInferx(model: string, key: string | undefined): boolean {
  return model === DEEPSEEK_V4_FLASH && Boolean(key);
}

/**
 * Write the ledger row.
 *
 * **Never throws.** A failed ledger write must not turn a successful call into
 * an error the caller retries — that would double-spend. It is logged and the
 * call stands, because losing one audit row is bad and charging twice is worse.
 */
async function record(
  sql: Sql,
  row: {
    userId: string | null;
    feature: Feature;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
    dataClass: DataClass;
    pseudonymised: boolean;
  },
): Promise<void> {
  try {
    await sql`
      INSERT INTO llm_calls
        (user_id, feature, model, input_tokens, output_tokens, cost_usd,
         latency_ms, data_class, pseudonymised)
      VALUES
        (${row.userId}, ${row.feature}, ${row.model}, ${row.inputTokens},
         ${row.outputTokens}, ${row.costUsd}, ${row.latencyMs},
         ${row.dataClass}, ${row.pseudonymised})`;
  } catch (error) {
    console.error('llm_calls ledger write failed', {
      feature: row.feature,
      model: row.model,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Make one call.
 *
 * **The route is decided before anything is sent**, and a refusal short-circuits
 * without a network request and without a ledger row — nothing was spent and
 * nothing left the system, so there is nothing to record.
 */
export async function callModel(
  sql: Sql,
  req: CallRequest,
  deps: CallDeps = {},
): Promise<CallResult> {
  assertOneDocument(req.documentIds ?? []);

  const route = routeCall(req.dataClass, req.feature);
  if (!route.ok) return { ok: false, reason: route.reason };

  /**
   * **Pseudonymisation is not implemented here and must not be faked.**
   *
   * `route.pseudonymise` is true for every sensitive call, and there is no
   * pseudonymiser in this package yet. Sending the prompt anyway while writing
   * `pseudonymised = true` would put a false claim in the audit ledger — worse
   * than not sending at all. `docs/PRIVACY_PII.md` owns the implementation.
   *
   * Unreachable while the DPA gate is closed, and deliberately kept so that
   * opening the gate cannot silently start sending raw client data.
   */
  if (route.pseudonymise) {
    return {
      ok: false,
      reason:
        'This call requires pseudonymisation and no pseudonymiser exists yet. Refusing rather ' +
        'than sending raw sensitive text and recording pseudonymised = true, which would put a ' +
        'false claim in the audit ledger. CLAUDE.md: never claim complete PII removal.',
    };
  }

  const now = deps.now ?? Date.now;
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const started = now();

  const inferxKey = deps.inferxKey ?? process.env['INFERX_API_KEY'];
  const inferx = useInferx(route.model, inferxKey);
  const openRouter = !inferx && isOpenRouter(route.model);
  const key = inferx
    ? inferxKey
    : openRouter
      ? (deps.openRouterKey ?? process.env['OPENROUTER_API_KEY'])
      : (deps.anthropicKey ?? process.env['ANTHROPIC_API_KEY']);
  if (!key) {
    return {
      ok: false,
      reason: `No API key for ${route.model}. The path is built and refuses rather than pretending.`,
    };
  }

  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let failure: string | null = null;

  try {
    const res = inferx
      ? await doFetch(`${INFERX_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: INFERX_MODEL,
            max_tokens: 2000,
            messages: [{ role: 'user', content: req.prompt }],
          }),
        })
      : openRouter
        ? await doFetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              model: route.model,
              max_tokens: 2000,
              messages: [{ role: 'user', content: req.prompt }],
            }),
          })
        : await doFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: route.model,
              max_tokens: 2000,
              messages: [{ role: 'user', content: req.prompt }],
            }),
          });

    if (!res.ok) {
      failure = `http ${res.status}`;
    } else {
      const body = (await res.json()) as Record<string, unknown>;
      if (inferx || openRouter) {
        const choices = body['choices'] as { message?: { content?: string } }[] | undefined;
        const usage = body['usage'] as Record<string, number> | undefined;
        text = choices?.[0]?.message?.content ?? '';
        inputTokens = usage?.['prompt_tokens'] ?? 0;
        outputTokens = usage?.['completion_tokens'] ?? 0;
        // inferx.net's free grant carries no per-call cost; OpenRouter reports
        // its own in `usage.cost` and that field is simply absent here.
        costUsd = inferx ? 0 : (usage?.['cost'] ?? 0);
      } else {
        const content = body['content'] as { text?: string }[] | undefined;
        const usage = body['usage'] as Record<string, number> | undefined;
        text = content?.[0]?.text ?? '';
        inputTokens = usage?.['input_tokens'] ?? 0;
        outputTokens = usage?.['output_tokens'] ?? 0;
      }
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  /**
   * **Recorded whether or not the call succeeded.** A failed call still spent
   * latency and may still have been billed; omitting it would make the ledger
   * describe a cheaper, healthier system than the real one.
   */
  await record(sql, {
    userId: req.userId,
    feature: req.feature,
    model: route.model,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs: now() - started,
    dataClass: req.dataClass,
    pseudonymised: route.pseudonymise,
  });

  if (failure !== null) return { ok: false, reason: `model call failed: ${failure}` };
  return { ok: true, text, model: route.model, costUsd };
}
