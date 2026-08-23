/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH PROVIDER MAY SEE WHICH CLASS OF DATA — ONE CONTRACT, NOT A SCATTER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `route.ts` already answers *which MODEL*, by data sensitivity, and it is
 * correct. It does not answer *which COMPANY'S SERVER*, and until this file
 * existed nothing did: `call.ts` picked between inferx.net, OpenRouter and
 * Anthropic **by which API key happened to be set in the environment**. That is
 * a deployment accident deciding a confidentiality question.
 *
 * It has not leaked anything, because the sensitive path is refused twice over
 * (no countersigned DPA, no pseudonymiser). But the shape is wrong in a way that
 * gets discovered late: the day the DPA is signed and the pseudonymiser lands,
 * the provider is still chosen by `INFERX_API_KEY ?? OPENROUTER_API_KEY ??
 * ANTHROPIC_API_KEY`, and a matter fact could go to a free inference pool
 * because someone exported a variable.
 *
 * So the decision is written down once, here, and `callModel` asks it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIELDS ARE THE ORCHESTRATOR'S, AND UNKNOWN IS A REAL ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every provider carries: data classes permitted · retention · training use ·
 * contract status · redaction requirement · logging · fallback.
 *
 * **Retention and training-use values below are `UNVERIFIED` wherever I have not
 * read the vendor's current written terms.** `CLAUDE.md` forbids inventing a
 * contract term as firmly as it forbids inventing a section number, and a
 * confidently wrong "30 days, no training" in a policy file is worse than a
 * blank: it is the sentence someone quotes to a client. An `UNVERIFIED` field is
 * not a gap in this module — it is the module working. It refuses private data
 * to that provider until a human records the term.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY PUBLIC LEGAL TEXT IS STILL ALLOWED TO AN UNVERIFIED PROVIDER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A judgment is published law. `CLAUDE.md` §6 and Copyright Act s. 52(1)(q)(iv):
 * there is no copyright in it and no confidentiality interest in it. Sending a
 * paragraph of a Supreme Court judgment to an inference endpoint discloses
 * nothing that is not on the court's own website. Refusing that would stop
 * search working to protect information that is already public, which is not a
 * privacy posture, it is a superstition.
 *
 * **A QUERY is not in that category and is treated as private.** What an
 * advocate types is a fact about their case — "anticipatory bail twin conditions
 * for a co-accused in a 2024 NDPS matter" describes a client's position. It is
 * classed `PUBLIC_QUERY` for continuity with the wire, and permitted only where
 * `PRIVATE_MATTER_METADATA` is permitted.
 */

import type { DataClass } from './route.ts';

/**
 * The payload classes the orchestrator named, finer than `route.ts`'s two.
 *
 * They do not replace `DataClass` — that is the routing spine and every existing
 * caller passes it. They REFINE it: `dataClassFor` maps each down to `public` or
 * `sensitive`, so nothing has two sources of truth about sensitivity, and the
 * finer class is what the provider gate reasons about.
 */
export type PayloadClass =
  /** A judgment, a statute, a paragraph of published law. No confidentiality interest. */
  | 'PUBLIC_LEGAL_TEXT'
  /** What the advocate typed. Public-CLASS on the wire, private in substance — see the header. */
  | 'PUBLIC_QUERY'
  /** Matter titles, courts, hearing dates, party names. */
  | 'PRIVATE_MATTER_METADATA'
  /** Notes, instructions, the advocate's own account of the case. */
  | 'PRIVATE_CLIENT_FACTS'
  /** An uploaded document, or any extract of one. */
  | 'PRIVATE_DOCUMENT'
  /** Anything not yet classified. Resolves to sensitive, never to public. */
  | 'OTHER';

/** Ambiguity resolves to sensitive — `CLAUDE.md` §5, and `OTHER` is the ambiguity. */
export function dataClassFor(payload: PayloadClass): DataClass {
  return payload === 'PUBLIC_LEGAL_TEXT' ? 'public' : 'sensitive';
}

/** True where the payload carries something an advocate's client would recognise as theirs. */
export function isPrivate(payload: PayloadClass): boolean {
  return payload !== 'PUBLIC_LEGAL_TEXT';
}

export type Provider = 'inferx' | 'openrouter' | 'anthropic';

/**
 * `RECORDED` — read from the vendor's current written terms and written down here
 * with the date it was read. `UNVERIFIED` — nobody has read it. `NONE` — there is
 * demonstrably no agreement.
 */
export type ContractStatus = 'RECORDED' | 'UNVERIFIED' | 'NONE';

export type ProviderPolicy = {
  readonly provider: Provider;
  /** What this endpoint actually is, in one line, so a reader knows what they are trusting. */
  readonly whatItIs: string;
  /** Payload classes this provider may receive. Anything absent is refused. */
  readonly permits: readonly PayloadClass[];
  /** Vendor retention of prompt content. `UNVERIFIED` until somebody reads the terms. */
  readonly retention: string;
  /** Whether the vendor may train on prompt content. `UNVERIFIED` until read. */
  readonly trainingUse: string;
  readonly contractStatus: ContractStatus;
  /** Whether a permitted private payload must be pseudonymised before sending. */
  readonly requiresRedaction: boolean;
  /** What LawMind records about the call. Never the prompt body. */
  readonly logging: string;
  /** What happens when this provider is refused or unavailable. */
  readonly fallback: string;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Deny-by-default is expressed in `permits`, not in a comment: a provider whose
 * terms nobody has read permits exactly `PUBLIC_LEGAL_TEXT`, because that is the
 * only class whose disclosure costs nothing. Adding a private class to a
 * provider requires changing `contractStatus` to `RECORDED` in the same edit —
 * `assertPolicyCoherent` below makes the two impossible to separate.
 */
export const PROVIDER_POLICY: Readonly<Record<Provider, ProviderPolicy>> = {
  inferx: {
    provider: 'inferx',
    whatItIs:
      'model.inferx.net — a free DeepSeek V4 Flash inference pool. Free capacity is the ' +
      'business model, which is precisely why its handling of prompt content must be read ' +
      'rather than assumed.',
    permits: ['PUBLIC_LEGAL_TEXT'],
    retention: 'UNVERIFIED — nobody has read inferx.net terms',
    trainingUse: 'UNVERIFIED — nobody has read inferx.net terms',
    contractStatus: 'UNVERIFIED',
    requiresRedaction: true,
    logging: 'llm_calls: provider, model, feature, data_class, tokens, cost, latency. Never the prompt.',
    fallback: 'OpenRouter for the same model, or the call refuses and says why.',
  },
  openrouter: {
    provider: 'openrouter',
    whatItIs: 'openrouter.ai — a paid routing layer in front of many model vendors.',
    permits: ['PUBLIC_LEGAL_TEXT'],
    retention: 'UNVERIFIED — OpenRouter terms not read into this repo',
    trainingUse:
      'UNVERIFIED — and it is a ROUTING layer, so the answer depends on the upstream ' +
      'vendor it selects as well as on OpenRouter itself. Two terms to read, not one.',
    contractStatus: 'UNVERIFIED',
    requiresRedaction: true,
    logging: 'llm_calls, as above. Never the prompt.',
    fallback: 'Refuse and say why. There is no silent downgrade to a cheaper endpoint.',
  },
  anthropic: {
    provider: 'anthropic',
    whatItIs: 'api.anthropic.com — the direct vendor API, the intended home of sensitive traffic.',
    /**
     * Still `PUBLIC_LEGAL_TEXT` only, and that is not an oversight.
     *
     * `CLAUDE.md` §5 names Claude as the destination for sensitive traffic
     * *after* pseudonymisation and *under written data-processing terms*. OD-6
     * says the countersigned DPA is owed before uploads ship and the refusal has
     * no founder override. Until that document exists, the honest value of
     * `contractStatus` is `UNVERIFIED`, and a provider with an unverified
     * contract does not receive private data — including this one.
     *
     * The day the DPA is countersigned, this entry changes in one place: status
     * to `RECORDED`, retention and training-use to the terms it actually states,
     * and the private classes into `permits`. That is a deliberate, reviewable
     * edit, which is the point.
     */
    permits: ['PUBLIC_LEGAL_TEXT'],
    retention: 'UNVERIFIED — pending the countersigned DPA (OD-6)',
    trainingUse: 'UNVERIFIED — pending the countersigned DPA (OD-6)',
    contractStatus: 'UNVERIFIED',
    requiresRedaction: true,
    logging: 'llm_calls, as above. Never the prompt.',
    fallback:
      'Private generation refuses honestly. It does not fall back to a cheaper provider — ' +
      'a fallback that widens disclosure is worse than the failure it is avoiding.',
  },
};

export type ProviderDecision =
  | { readonly ok: true; readonly policy: ProviderPolicy; readonly requiresRedaction: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * **The gate.** Every provider egress asks this and nothing else decides.
 *
 * Accepts the fine-grained `PayloadClass`. A caller holding only the coarse
 * `DataClass` should use {@link canSendDataClassToProvider}, which maps
 * `sensitive` to the most protective private class rather than guessing a
 * lenient one.
 */
export function canSendToProvider(payload: PayloadClass, provider: Provider): ProviderDecision {
  const policy = PROVIDER_POLICY[provider];
  if (!policy) {
    return { ok: false, reason: `unknown provider '${provider}' — no policy, no send` };
  }
  if (!policy.permits.includes(payload)) {
    return {
      ok: false,
      reason:
        `${provider} may not receive ${payload}. Its policy permits [${policy.permits.join(', ')}] ` +
        `and its contract status is ${policy.contractStatus} ` +
        `(retention: ${policy.retention}; training use: ${policy.trainingUse}). ` +
        `Fallback: ${policy.fallback}`,
    };
  }
  if (isPrivate(payload) && policy.contractStatus !== 'RECORDED') {
    // Belt as well as braces: a future edit that adds a private class to
    // `permits` without recording the terms is refused here rather than shipped.
    return {
      ok: false,
      reason:
        `${provider} is listed as permitting ${payload}, but its contract status is ` +
        `${policy.contractStatus}. Private data does not move on an unread agreement.`,
    };
  }
  return { ok: true, policy, requiresRedaction: isPrivate(payload) && policy.requiresRedaction };
}

/**
 * The coarse-class entry point, for callers that hold `route.ts`'s `DataClass`.
 *
 * `sensitive` maps to `PRIVATE_CLIENT_FACTS` — the most protective private class,
 * not the most permissive. A caller that knows better should say so by passing a
 * `PayloadClass` to {@link canSendToProvider}; a caller that does not know gets
 * the strict answer, because ambiguity resolves to sensitive.
 */
export function canSendDataClassToProvider(
  dataClass: DataClass,
  provider: Provider,
): ProviderDecision {
  return canSendToProvider(
    dataClass === 'public' ? 'PUBLIC_LEGAL_TEXT' : 'PRIVATE_CLIENT_FACTS',
    provider,
  );
}

/**
 * The invariant a reviewer would otherwise have to hold in their head: no
 * provider may list a private class while its contract status is unrecorded.
 *
 * Exported and asserted by the test rather than run at import time — a module
 * that throws on load takes the whole API down for a policy edit, and the point
 * of the check is to fail a review, not a deployment.
 */
export function policyIncoherences(): string[] {
  const problems: string[] = [];
  for (const policy of Object.values(PROVIDER_POLICY)) {
    const privateClasses = policy.permits.filter(isPrivate);
    if (privateClasses.length > 0 && policy.contractStatus !== 'RECORDED') {
      problems.push(
        `${policy.provider} permits [${privateClasses.join(', ')}] with contractStatus ` +
          `${policy.contractStatus} — record the terms or remove the class`,
      );
    }
    if (policy.contractStatus === 'RECORDED') {
      for (const field of ['retention', 'trainingUse'] as const) {
        if (policy[field].startsWith('UNVERIFIED')) {
          problems.push(
            `${policy.provider} claims contractStatus RECORDED but ${field} is still UNVERIFIED`,
          );
        }
      }
    }
  }
  return problems;
}
