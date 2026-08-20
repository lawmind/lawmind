/**
 * WHICH DOCUMENTS EACH ENRICHMENT TASK MAY READ — one predicate per task, not
 * one predicate for all of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO FAILURES THIS SITS BETWEEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first was `hc_document_class IS NOT NULL`: it reached 2.7% of the corpus,
 * because 93.7% of judgments have never been classified and NEW2 measured that
 * 51.2% of everything ever assessed could not be classified at all. **UNKNOWN is
 * not BAD.** That was fixed on 19 Aug by making class a prioritiser and Tier A
 * the filter.
 *
 * The second is the one this file fixes: **Tier A then became a single universal
 * predicate**, and it is wrong in the other direction for some tasks. Tier A
 * excludes bail orders by construction (`is_bail_order`, migration 0058). A
 * `procedural_event` is a step in a case's own history — remand, transfer,
 * consolidation — and a bail order is exactly a document full of them. Asking one
 * predicate to serve "where is the holding" and "what procedural steps happened"
 * means one of the two is always wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A PROFILE MAY AND MAY NOT WIDEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A profile may include procedural decisions and may lower the text-length floor.
 * It may NOT reach a document with no usable text, and it may not turn class back
 * into a filter in either direction — a NULL class is admitted by every profile
 * here, and a test asserts it.
 *
 * The floor of 2,000 characters was never measured; it is a guard against a
 * one-page order. `procedural` lowers it to 800 because the documents it wants
 * ARE one-page orders, and a procedural event is a sentence, not an argument.
 */
import { isAtomicTask } from './enrich-atomic.ts';
import type { EnrichTask } from './enrich.ts';

export type EligibilityProfile = {
  readonly name: 'substantive' | 'procedural';
  /**
   * Tier A excludes bail orders. `procedural` wants them: a bail order is a
   * procedural decision, and its own history is what the task extracts.
   */
  readonly includeBailOrders: boolean;
  /** Minimum `length(full_text)`. Applied in the second stage — it detoasts. */
  readonly minChars: number;
  readonly why: string;
};

const SUBSTANTIVE: EligibilityProfile = {
  name: 'substantive',
  includeBailOrders: false,
  minChars: 2000,
  why: 'a citable decision with enough text to carry reasoning',
};

const PROCEDURAL: EligibilityProfile = {
  name: 'procedural',
  includeBailOrders: true,
  minChars: 800,
  why: 'any decision that records what happened procedurally, including bail orders and short disposals',
};

/**
 * Tasks that read the case's MACHINERY rather than its reasoning. Each one is
 * satisfied by a one-page order and each one is impoverished by excluding them.
 */
const PROCEDURAL_TASKS = new Set<string>(['procedural_event', 'date_event', 'party_action', 'court_action']);

export function profileFor(task: EnrichTask | string): EligibilityProfile {
  return PROCEDURAL_TASKS.has(task) ? PROCEDURAL : SUBSTANTIVE;
}

/**
 * Every task this module has an opinion about. `metadata`, `treatment` and
 * `citation_extraction` are not legal-object tasks and run their own selectors;
 * they resolve to `substantive` and nothing about them changes.
 */
export function isProceduralTask(task: EnrichTask | string): boolean {
  return PROCEDURAL_TASKS.has(task);
}

/** Exported for the test that asserts the atomic vocabulary is fully accounted for. */
export const PROCEDURAL_TASK_NAMES: readonly string[] = [...PROCEDURAL_TASKS];

export { isAtomicTask };
