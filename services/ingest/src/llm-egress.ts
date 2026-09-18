/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SERVICE IS ALLOWED TO SEND OUT OF THE BUILDING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC built `services/api/src/llm/provider-policy.ts` this round, because
 * `call.ts` was choosing between inferx.net, OpenRouter and Anthropic **by which
 * API key happened to be set in the environment** — a deployment variable making
 * a confidentiality decision. Their inventory found three egress paths outside
 * that gate, two of them here: `inferx.ts` and `openrouter.ts` (bus 1055).
 *
 * **Nothing private has leaked.** Both are corpus-only today, and a judgment is
 * published law — Copyright Act s. 52(1)(q)(iv), `CLAUDE.md` §6. What is missing
 * is the STRUCTURE that stops a private payload being added to one of them later.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A SECOND COPY OF LCC'S TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `services/api` depends on `@lawmind/ingest`; the reverse would be a cycle, so
 * this service cannot import that gate. The obvious move — copy the provider
 * table here — reproduces the exact scatter the gate was built to end, and a
 * copied table drifts silently the first time one side is edited.
 *
 * So this is **narrower than LCC's gate, not a duplicate of it.** LCC's answers
 * *which company may see which class*. This one answers a question only this
 * service has, and answers it with one sentence:
 *
 *     **INGEST SENDS PUBLISHED LEGAL TEXT AND NOTHING ELSE, TO ANY PROVIDER.**
 *
 * There is no advocate here, no matter, no upload, no query. Every caller —
 * `enrich-cli`, `concordance-adjudicate-cli`, `concordance-gold-cli`,
 * `hc-adjudicate-cli` — is reading judgments out of the corpus. A private
 * payload appearing in this service is not a routing question to be answered by
 * a policy table; it is a mistake, and this refuses it rather than choosing a
 * provider for it.
 *
 * The day this service genuinely needs to send something private, the correct
 * change is to move LCC's policy into a shared package and import it — not to
 * add a class here. `assertPublicOnlyEgress` is deliberately awkward to widen.
 */

/**
 * The payload classes named by the orchestrator, kept verbatim so a caller that
 * knows LCC's vocabulary can use it here and mean the same thing.
 */
export type EgressPayloadClass =
  | 'PUBLIC_LEGAL_TEXT'
  | 'PUBLIC_QUERY'
  | 'PRIVATE_MATTER_METADATA'
  | 'PRIVATE_CLIENT_FACTS'
  | 'PRIVATE_UPLOADED_DOCUMENT';

/** The only class this service may ever send. */
export const INGEST_PERMITTED_CLASS = 'PUBLIC_LEGAL_TEXT' as const;

export type EgressDecision =
  | { readonly ok: true; readonly payloadClass: 'PUBLIC_LEGAL_TEXT' }
  | { readonly ok: false; readonly reason: string };

/**
 * The gate. Returns a decision rather than throwing, so a caller can record the
 * refusal in `llm_calls` alongside the calls that did happen — a refusal that
 * leaves no trace is indistinguishable from a call nobody made.
 */
export function canEgress(payloadClass: EgressPayloadClass, provider: string): EgressDecision {
  if (payloadClass === INGEST_PERMITTED_CLASS) return { ok: true, payloadClass };
  return {
    ok: false,
    reason:
      `services/ingest may not send ${payloadClass} to ${provider}. This service processes the ` +
      'published corpus and holds no advocate data; a private payload here is a mistake, not a ' +
      'routing choice. Route it through services/api/src/llm/provider-policy.ts, which is the ' +
      'only place a private class is permitted and only against a RECORDED contract.',
  };
}

/**
 * Throwing form, for the egress functions themselves.
 *
 * It runs BEFORE the request is built, so a refused payload makes zero outbound
 * requests rather than one that is discarded — the same standard LCC asserted
 * with a counting fetch rather than by checking a response.
 */
export function assertPublicOnlyEgress(payloadClass: EgressPayloadClass, provider: string): void {
  const decision = canEgress(payloadClass, provider);
  if (!decision.ok) throw new Error(`EGRESS REFUSED: ${decision.reason}`);
}
