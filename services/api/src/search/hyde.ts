/**
 * HyDE — Hypothetical Document Embeddings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE IDEA, AND THE ONE-LINE REASON IT HELPS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An advocate's question and the judgment that answers it are written in
 * different registers. The question is *"can anticipatory bail be limited in
 * point of time"*; the judgment says *"the protection granted under Section 438
 * would not ordinarily be limited to a fixed period"*. Embedding the question
 * measures its distance to text that does not look like it.
 *
 * HyDE closes that gap by asking a model to write the passage the answer would
 * look like, and embedding **that** instead. The hypothetical is usually wrong
 * on the facts and that does not matter — it is never read, never shown, and
 * never stored. It exists to move a point in vector space toward the register
 * of judicial prose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE RULES THAT KEEP A GENERATED PASSAGE FROM BECOMING A CITATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module generates prose about law, which is the exact thing `CLAUDE.md`
 * spends most of its length forbidding. It is safe **only** because of where the
 * output is allowed to go, and each rule below is enforced rather than promised:
 *
 * 1. **The hypothetical reaches the embedder and nothing else.** It is not
 *    returned to the caller as text, not logged as a result, not stored. There
 *    is no code path from here to a rendered answer.
 *
 * 2. **Citation-shaped spans are STRIPPED before embedding.** The model has no
 *    retrieval, so every citation it writes is invented by construction — and an
 *    invented `AIR 1978 SC 597` in the embedded text drags the vector toward
 *    whatever real case that string resembles. Stripping them is not caution
 *    about display (nothing here is displayed); it is accuracy, because a
 *    hallucinated citation is *noise pointing somewhere specific*, which is worse
 *    than noise.
 *
 * 3. **Only the DENSE arm uses it.** `hybridSearch` takes query text and query
 *    vector separately, so BM25 keeps the advocate's literal words — section
 *    numbers, party names, the citation they actually typed — while the vector
 *    arm gets the enriched register. A hypothetical that wanders off topic
 *    therefore cannot take the lexical arm with it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA CLASS — REQUIRED, NEVER DEFAULTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **A search query is not automatically public data.** A published judgment is;
 * an advocate typing *"can I get bail for my client Rakesh who was charged under
 * section 302"* is not, and the difference is invisible to this module.
 *
 * So `dataClass` is a required parameter with no default, exactly as in
 * `llm/route.ts`. A caller that has not decided has not thought about it.
 * `CLAUDE.md` §5: **ambiguity resolves to sensitive, never to public** — which
 * means HyDE over user-typed queries is refused today, because sensitive-class
 * traffic is refused until the countersigned DPA exists (OD-6). That refusal is
 * the routing layer's, not a second opinion held here.
 *
 * The harness passes `'public'` and is entitled to: its queries are extracted
 * verbatim from published judgments and contain no client of ours.
 */
import type { Sql } from 'postgres';

import { type CallDeps, callModel } from '../llm/call.ts';
import { classifyQuery } from './query-shape.ts';

/**
 * **Whether this query should pay for a HyDE call at all.**
 *
 * Measured 9 Aug 2026: generation takes **2,519–4,916 ms** against Gate S1's
 * 3,000 ms for the whole request. That is not a detail to optimise later — it
 * decides the shape of the feature.
 *
 * A hypothetical passage helps when the question and the answer are written in
 * different registers. It cannot help when the query IS the identifier:
 *
 * - `(2019) 4 SCC 221` — `retrieve.ts` pins the exact match at rank 1. There is
 *   nothing for a hypothetical to improve and several seconds to lose.
 * - `section 138 NI Act` — the section number is the strongest lexical signal
 *   in the corpus, and the sparse arm already has it.
 * - `Kesavananda Bharati` — a case name is matched, not described.
 *
 * Only `concept` queries — the advocate describing a problem in their own words
 * — have the register gap HyDE exists to close. **So the expensive path fires
 * exactly where the cheap path is weakest**, which also means the measured
 * average latency of the feature is far below the per-call figure above.
 */
export function hydeWarranted(query: string): boolean {
  return classifyQuery(query).shape === 'concept';
}

/**
 * Citation shapes, shared in form with `documents/route.ts` and
 * `harness/build-queries.ts` because the same four conventions are what an
 * Indian judgment actually uses. Used here to REMOVE, not to extract.
 */
const CITATION_SHAPES: readonly RegExp[] = [
  /\b\d{4}\s+INSC\s+\d+\b/gi,
  /\(\s*\d{4}\s*\)\s*\d+\s+[A-Z]{2,6}\s+\d+/g,
  /\bAIR\s+\d{4}\s+[A-Z]{2,4}\s+\d+\b/gi,
  /\[\s*\d{4}\s*\]\s*\d*\s*[A-Z.]{2,8}\s*\d+/g,
];

/**
 * Remove every citation-shaped span from generated text.
 *
 * Exported because it is the rule that makes generating prose about law
 * acceptable here, and a rule that cannot be tested is a promise.
 */
export function stripInventedCitations(text: string): string {
  let out = text;
  for (const re of CITATION_SHAPES) out = out.replace(re, ' ');
  /**
   * Bare case names go too. `Maneka Gandhi v. Union of India` carries no
   * reporter but points just as hard, and the model produces them constantly.
   * The `v.` join is the format-independent tell.
   */
  out = out.replace(/\b[\p{Lu}][\p{L}.'-]*(?:\s+[\p{Lu}][\p{L}.'-]*){0,4}\s+v\.?\s+[\p{Lu}][\p{L}.'-]*(?:\s+[\p{Lu}][\p{L}.'-]*){0,4}/gu, ' ');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * The prompt.
 *
 * **Deliberately asks for the register, not the answer.** Asking for a correct
 * answer invites the model to reason about Indian law from memory, which it does
 * badly and which BNS/BNSS/BSA make worse — no frontier model knows the 2024
 * codes. Asking for *a passage that would look like the answer* is a request for
 * vocabulary and sentence shape, which is all the embedder consumes.
 *
 * It also asks for no citations. That is belt-and-braces — {@link
 * stripInventedCitations} runs regardless — but a model that was not asked for
 * citations produces fewer of them, and every one not produced is one the
 * stripper cannot miss.
 */
export const HYDE_PROMPT = (query: string): string =>
  `You are helping a search engine, not a litigant. Write ONE short paragraph, 60-100 words, in the register and vocabulary of an Indian court judgment, of the kind that would DISCUSS the issue below.

Do not answer the question, do not be correct about the current state of the law, and do not name any case or cite any authority. Write only the reasoning language a judgment would use.

Issue: ${query}`;

export type HydeResult = {
  /** The text to embed for the DENSE arm. Never displayed, never stored. */
  readonly text: string;
  /** False when generation refused or failed and the raw query is being used. */
  readonly generated: boolean;
  /**
   * True when HyDE was **deliberately not attempted** because the query shape
   * cannot benefit. Distinct from `generated: false`, which means it was tried
   * and did not work — a design choice and a failure must not report as one
   * number, or a run where the model was down looks like a run that was tuned.
   */
  readonly skipped?: boolean;
};

/**
 * Build the text the dense arm should embed.
 *
 * **Never throws and never returns nothing.** A refusal, a timeout, a rate limit
 * or an empty completion all fall back to the advocate's own query, so the worst
 * case is search exactly as it is today. A retrieval enhancement that can break
 * retrieval is not an enhancement.
 */
export async function hydeText(
  sql: Sql,
  query: string,
  dataClass: 'public' | 'sensitive',
  deps: CallDeps = {},
): Promise<HydeResult> {
  const fallback: HydeResult = { text: query, generated: false };
  if (query.trim().length === 0) return fallback;
  /**
   * Skipped before the call, so a citation lookup never waits 3 s for a
   * hypothetical it cannot use. See {@link hydeWarranted}.
   */
  if (!hydeWarranted(query)) return { ...fallback, skipped: true };

  let res;
  try {
    res = await callModel(
      sql,
      { dataClass, feature: 'search', prompt: HYDE_PROMPT(query), userId: null },
      deps,
    );
  } catch {
    return fallback;
  }
  if (!res.ok) return fallback;

  const cleaned = stripInventedCitations(res.text);
  /**
   * A hypothetical shorter than the query has added nothing and may have
   * subtracted — an empty or one-line completion embedded in place of a real
   * question is strictly worse than the question.
   */
  if (cleaned.length < Math.max(40, query.length / 4)) return fallback;

  /**
   * **The query is KEPT alongside the hypothetical**, not replaced by it.
   * Classic HyDE embeds the hypothetical alone; that discards the advocate's
   * own words, and in this corpus those words carry the section numbers and
   * doctrinal terms that are the most reliable signal we have. Concatenating
   * keeps both in one vector at the cost of nothing.
   */
  return { text: `${query}\n\n${cleaned}`, generated: true };
}
