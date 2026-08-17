/**
 * The cost ceiling on object storage — `docs/CURRENT_PLAN.md` §A3b.5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A CEILING AT ALL, WHEN R2 IS THE CHEAP OPTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Storage is $0.015/GB-month and egress is free, so the 115 GB the tiered design
 * puts on R2 costs under **$2/month** and no ceiling would ever bind on it.
 *
 * **Operations are where an object-storage bill actually goes wrong.** Class A
 * is **$4.50 per million**, and the corpus is 15.77M judgments. One PUT per
 * judgment is $71 — fine. **One PUT per chunk is not**: the Supreme Court's
 * 38,341 judgments already produce 616,197 chunks, a ratio of 16:1, and the same
 * ratio over the High Court corpus is ~253M objects — **$1,138 in PUTs alone**,
 * for data whose storage cost is under $2/month.
 *
 * So the failure mode is not volume of bytes. It is **a naive per-chunk write
 * pattern**, which looks harmless in code review and is 500× the storage bill.
 * A ceiling that refuses is the only thing that catches it before the invoice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS LEDGER IS AGGREGATED WHERE THE ECOURTS ONE IS PER REQUEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `services/api/src/court/guard.ts` writes one row per request, because the
 * eCourts grant is *counted in requests* — 1,000 a day — and the question it
 * must answer is "did we stay inside the grant".
 *
 * **R2's constraint is spend, not permission.** One row per operation would be
 * ~253M rows to audit a $1,138 number, and the audit would cost more than the
 * thing audited. The window counter is the right instrument for a budget; a
 * per-request ledger is the right instrument for a licence. Using either one for
 * the other's job is the mistake.
 *
 * Prices verified against `developers.cloudflare.com/r2/pricing` on 10 Aug 2026.
 */

/** Standard-class prices, USD per million operations. */
export const CLASS_A_USD_PER_MILLION = 4.5;
export const CLASS_B_USD_PER_MILLION = 0.36;
/** USD per GB-month, Standard. Egress from R2 is free and has no entry here. */
export const STORAGE_USD_PER_GB_MONTH = 0.015;

/**
 * Which billing class an operation falls into.
 *
 * **`delete` is free and says so** — not folded into Class A "to be safe".
 * Overstating a cost is not conservatism, it is a wrong number, and a ceiling
 * built on wrong numbers refuses work it should have allowed.
 */
export type Operation = 'put' | 'get' | 'getRange' | 'head' | 'delete' | 'list';
export type BillingClass = 'A' | 'B' | 'free';

export function billingClass(operation: Operation): BillingClass {
  switch (operation) {
    case 'put':
    case 'list':
      return 'A';
    // A ranged GET is one GetObject. The Range header changes what is
    // transferred, not what is billed — which is the whole economic basis of
    // the tiered design in CORPUS_TIERING.md §6.
    //
    // The comment sits ABOVE the group rather than between two `case` labels: a
    // comment between them reads to eslint as a non-empty case body, so
    // `no-fallthrough` fires on this deliberate grouping and then cannot warn
    // about an accidental one.
    case 'get':
    case 'getRange':
    case 'head':
      return 'B';
    case 'delete':
      return 'free';
  }
}

export type OperationCounts = { classA: number; classB: number; free: number };

export const zeroCounts = (): OperationCounts => ({ classA: 0, classB: 0, free: 0 });

/** What the counted operations cost, in USD. Storage is billed separately and is not here. */
export function operationCostUsd(counts: OperationCounts): number {
  return (
    (counts.classA * CLASS_A_USD_PER_MILLION) / 1_000_000 +
    (counts.classB * CLASS_B_USD_PER_MILLION) / 1_000_000
  );
}

/** Monthly storage cost for a number of bytes held. */
export function storageCostUsd(bytes: number): number {
  return (bytes / 1_000_000_000) * STORAGE_USD_PER_GB_MONTH;
}

export type BudgetState = {
  counts: OperationCounts;
  /** Fired once when spend first crosses `alertAtFraction`, so an alert cannot loop. */
  alerted: boolean;
};

export type BudgetPolicy = {
  /** Hard stop. Operations that would exceed it are refused, not delayed. */
  ceilingUsd: number;
  /** Fraction of the ceiling at which to warn. */
  alertAtFraction: number;
};

/**
 * **A default that binds.** `CURRENT_PLAN.md` §A3b.5 asks for a ceiling and an
 * alert; a default of "unlimited" would satisfy the letter and none of the
 * point. $25 is comfortably above the whole projected corpus write
 * (15.77M PUTs = $71 — see below) *per run stage*, and far below the $1,138 a
 * per-chunk pattern would reach.
 *
 * It is deliberately low enough that **a wrong write pattern hits it during the
 * first test run** rather than at the end of a 15-million-object job.
 */
export const DEFAULT_CEILING_USD = 25;
export const DEFAULT_ALERT_FRACTION = 0.8;

export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): BudgetPolicy {
  const raw = env['R2_OP_BUDGET_USD'];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return {
    // An unparseable budget falls back to the default rather than to NaN.
    // `NaN > ceiling` is false, so a NaN ceiling would silently permit
    // everything — the exact failure this module exists to prevent.
    ceilingUsd: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CEILING_USD,
    alertAtFraction: DEFAULT_ALERT_FRACTION,
  };
}

export type BudgetDecision =
  | { allowed: true; costUsd: number; crossedAlert: boolean }
  | { allowed: false; reason: 'budget_exceeded'; detail: string };

/**
 * Decide whether one more operation may run, and fold it into `state` if so.
 *
 * **Checked BEFORE the operation, against the cost the operation would add.** A
 * counter incremented afterwards records history; it does not enforce a ceiling.
 */
export function chargeOperation(
  state: BudgetState,
  operation: Operation,
  policy: BudgetPolicy,
): BudgetDecision {
  const cls = billingClass(operation);
  const next: OperationCounts = {
    classA: state.counts.classA + (cls === 'A' ? 1 : 0),
    classB: state.counts.classB + (cls === 'B' ? 1 : 0),
    free: state.counts.free + (cls === 'free' ? 1 : 0),
  };
  const projected = operationCostUsd(next);

  /**
   * **A free operation is never refused on cost, even when spend is already
   * over the ceiling.** Charging it against the ceiling would compare the
   * *accumulated* bill to the limit and refuse an operation that adds nothing
   * — and the operation it refuses is `delete`, which is the one an operator
   * needs precisely when a run has overspent. A budget guard that locks you out
   * of cleaning up the objects that breached the budget is a trap, not a guard.
   */
  if (cls !== 'free' && projected > policy.ceilingUsd) {
    return {
      allowed: false,
      reason: 'budget_exceeded',
      detail:
        `${operation} would take operation spend to $${projected.toFixed(4)}, ` +
        `over the $${policy.ceilingUsd.toFixed(2)} ceiling ` +
        `(${state.counts.classA} class-A and ${state.counts.classB} class-B so far). ` +
        'Raise R2_OP_BUDGET_USD deliberately, or look for a per-chunk write pattern.',
    };
  }

  const wasBelow = operationCostUsd(state.counts) < policy.ceilingUsd * policy.alertAtFraction;
  const nowAtOrAbove = projected >= policy.ceilingUsd * policy.alertAtFraction;
  const crossedAlert = wasBelow && nowAtOrAbove && !state.alerted;

  state.counts = next;
  if (crossedAlert) state.alerted = true;

  return { allowed: true, costUsd: projected, crossedAlert };
}

/**
 * What a write pattern would cost across the whole corpus, before running it.
 *
 * Exists to be called in a planning script rather than discovered on an
 * invoice. `CONTINUATION_PROMPT.md` §1: *measure the opportunity before building
 * the fix* — the same rule applies to measuring the bill before paying it.
 */
export function projectWriteCost(args: {
  documents: number;
  objectsPerDocument: number;
  bytesPerDocument: number;
}): { objects: number; putUsd: number; storageUsdPerMonth: number } {
  const objects = args.documents * args.objectsPerDocument;
  return {
    objects,
    putUsd: (objects * CLASS_A_USD_PER_MILLION) / 1_000_000,
    storageUsdPerMonth: storageCostUsd(args.documents * args.bytesPerDocument),
  };
}
