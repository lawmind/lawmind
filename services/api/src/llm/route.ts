/**
 * Which model gets this call — the decision `CLAUDE.md` §5 makes, expressed once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROUTE BY DATA SENSITIVITY, NOT BY TASK DIFFICULTY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The rule everyone gets backwards. A hard question about a published judgment
 * is **public** and goes to the cheap model. A trivial question about an
 * advocate's uploaded case file is **sensitive** and does not, however easy it
 * is. Difficulty decides nothing here.
 *
 * **Ambiguity resolves to sensitive, never to public.** There is no third
 * answer and no default that guesses cheap: the cost of routing public data to
 * an expensive model is money, and the cost of routing sensitive data to a
 * cheap one is a client's file on somebody else's server.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SENSITIVE TRAFFIC IS REFUSED UNTIL THE DPA EXISTS — NO FOUNDER OVERRIDE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **OD-6, resolved 2 Aug 2026**: the countersigned data-processing agreement is
 * owed before uploads ship, and *"the admin surface refuses to route sensitive
 * traffic without one, with no founder override."*
 *
 * So {@link routeCall} returns a **refusal**, not a model, for sensitive data
 * while {@link dpaCountersigned} is false. It is a function of the environment
 * rather than a constant so that signing the DPA is a deployment change and not
 * a code change — but it defaults to **false**, and an unset variable is a
 * refusal rather than permission.
 */

/** `CLAUDE.md` §5. Two classes, and ambiguity is not one of them. */
export type DataClass = 'public' | 'sensitive';

/** Matches `llm_feature` in the schema. */
export type Feature = 'search' | 'draft' | 'briefing' | 'extract' | 'ocr_postprocess';

/**
 * **Verified by a live call on 9 Aug 2026.** Not transcribed from memory —
 * `CLAUDE.md` forbids inventing a model identifier as much as a section number.
 */
export const DEEPSEEK_V4_FLASH = 'deepseek/deepseek-v4-flash';
export const CLAUDE_HAIKU_4_5 = 'claude-haiku-4-5-20251001';

/**
 * Drafting and briefings want Claude Sonnet 4.6 per `CLAUDE.md` §5.
 *
 * **The identifier is NOT hard-coded, because I have not verified one.** An
 * invented model id fails at the first call in production, which is the worst
 * place to discover a guess. Set `ANTHROPIC_DRAFTING_MODEL` from the vendor's
 * own documentation; until then drafting refuses and says why.
 */
export function draftingModel(): string | null {
  return process.env['ANTHROPIC_DRAFTING_MODEL'] ?? null;
}

/**
 * Whether the countersigned DPA is on file. **Defaults to false**, and an unset
 * or malformed value is false — an absent agreement must never read as consent.
 */
export function dpaCountersigned(): boolean {
  return process.env['DPA_COUNTERSIGNED'] === 'true';
}

export type Route =
  | { readonly ok: true; readonly model: string; readonly pseudonymise: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * Decide the route. **Pure** — no network, no database, no clock.
 *
 * `dataClass` is required and has no default. A caller that has not decided
 * which class its data is in has not thought about the question, and a default
 * would let it stay unthought.
 */
export function routeCall(dataClass: DataClass, feature: Feature): Route {
  if (dataClass === 'sensitive') {
    if (!dpaCountersigned()) {
      return {
        ok: false,
        reason:
          'Sensitive-class traffic is refused: no countersigned DPA is on file (OD-6). ' +
          'This refusal has no override, including for the founder. Uploaded documents, ' +
          'matter notes and party names do not leave this system until it is signed.',
      };
    }
    /**
     * **Pseudonymise BEFORE the call, always** — and the flag says so rather
     * than the prose, because `llm_calls.pseudonymised` is what an audit reads.
     * `CLAUDE.md`: never claim complete PII removal. Coverage is partial and
     * the product must say so; this flag records that it was attempted, not
     * that it succeeded.
     */
    return { ok: true, model: CLAUDE_HAIKU_4_5, pseudonymise: true };
  }

  /**
   * Public class — judgments and statutes, already published. **Within it,
   * route by task**, which is the one place difficulty is allowed to matter
   * because the sensitivity question is already settled.
   */
  switch (feature) {
    case 'search':
      return { ok: true, model: DEEPSEEK_V4_FLASH, pseudonymise: false };
    case 'extract':
    case 'ocr_postprocess':
      return { ok: true, model: CLAUDE_HAIKU_4_5, pseudonymise: false };
    case 'draft':
    case 'briefing': {
      const model = draftingModel();
      if (model === null) {
        return {
          ok: false,
          reason:
            'ANTHROPIC_DRAFTING_MODEL is not set. Drafting and briefings route to Claude ' +
            'Sonnet 4.6 per CLAUDE.md §5, and the identifier is deliberately not hard-coded ' +
            'because it has not been verified against the vendor. A guessed model id fails ' +
            'at the first production call.',
        };
      }
      return { ok: true, model, pseudonymise: false };
    }
  }
}

/**
 * **One document per call.** `CLAUDE.md`: mixing case files in one context makes
 * the model conflate parties between matters — *a confidentiality breach between
 * two of the same advocate's clients, invisible in fluent output.*
 *
 * Enforced as a guard the caller must pass rather than a convention it must
 * remember, because the failure is silent and the output looks correct.
 */
export function assertOneDocument(documentIds: readonly string[]): void {
  const distinct = new Set(documentIds);
  if (distinct.size > 1) {
    throw new Error(
      `${distinct.size} documents in one call. One document per call — mixing case files ` +
        'cross-contaminates parties between matters, and the result reads perfectly fluent.',
    );
  }
}
