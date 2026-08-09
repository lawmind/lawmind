/**
 * The budget and the halt switch, wrapped around any {@link ObjectStore}.
 *
 * A decorator rather than logic inside `r2Store` for one reason: **the guard
 * must be impossible to bypass by reaching for the underlying store.** A
 * caller that holds a metered store cannot get at an unmetered one, and the
 * only way to obtain an unmetered store is to construct it explicitly, which is
 * visible in review.
 *
 * `docs/CURRENT_PLAN.md` §A3b.5 (cost ceiling and alert) and §A3b.6 (kill
 * switch and ledger, *"same discipline as the eCourts adapter — every
 * credentialled integration in this repo is auditable"*).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HALT SWITCH DEFAULTS TO **NOT HALTED**, AND THAT IS NOT A WEAKENING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `court/guard.ts`'s switch defaults OFF because a missing row there would mean
 * *harvesting somebody else's service under a bounded permission nobody has
 * checked*. The danger is permission, so absence must read as "no".
 *
 * **R2 is our own paid bucket. The danger is spend, not permission**, and the
 * instrument for spend is the ceiling above — which is checked on every
 * operation and has a default that binds. A storage layer that refused until
 * someone remembered to insert a config row would not be safer; it would be an
 * ingest that silently stores nothing, which `r2.ts` already names as the worst
 * outcome available.
 *
 * So the switch here is an **incident control**: an operator flips it to stop
 * writes now, and flipping it requires a reason, exactly as the eCourts one
 * does. It is not the primary gate, and pretending otherwise would leave the
 * real gate — the budget — looking optional.
 */
import type { ObjectStore, StoredObject } from './r2.ts';
import {
  type BudgetPolicy,
  type BudgetState,
  type Operation,
  chargeOperation,
  operationCostUsd,
  policyFromEnv,
  zeroCounts,
} from './spend.ts';

export type SpendReport = {
  classA: number;
  classB: number;
  free: number;
  operationCostUsd: number;
  ceilingUsd: number;
  halted: boolean;
};

export type MeteredStore = ObjectStore & {
  /** What has been spent so far in this process. Read it at the end of a run and log it. */
  spend: () => SpendReport;
};

export type MeteredOptions = {
  policy?: BudgetPolicy;
  /**
   * The incident control. Returns a reason when writes must stop, `null` when
   * they may proceed. Async so it can read `platform_config`; the caller owns
   * that query because this package must not depend on postgres.
   *
   * **Reads are never halted.** Halting a read cannot save money worth having —
   * a GET is $0.36 per million — and it would take the product down to protect
   * a rounding error.
   */
  haltReason?: () => Promise<string | null>;
  /** Fired once, when spend crosses the alert fraction. */
  onAlert?: (report: SpendReport) => void;
};

export function meteredStore(inner: ObjectStore, options: MeteredOptions = {}): MeteredStore {
  const policy = options.policy ?? policyFromEnv();
  const state: BudgetState = { counts: zeroCounts(), alerted: false };
  let halted = false;

  const report = (): SpendReport => ({
    ...state.counts,
    operationCostUsd: operationCostUsd(state.counts),
    ceilingUsd: policy.ceilingUsd,
    halted,
  });

  /** Charge first, act second. An operation that is refused must not reach the network. */
  const charge = (operation: Operation): void => {
    const decision = chargeOperation(state, operation, policy);
    if (!decision.allowed) {
      throw new Error(`R2 budget: ${decision.detail}`);
    }
    if (decision.crossedAlert) options.onAlert?.(report());
  };

  const checkHalt = async (operation: Operation): Promise<void> => {
    if (!options.haltReason) return;
    const reason = await options.haltReason();
    if (reason !== null) {
      halted = true;
      throw new Error(`R2 writes are halted: ${reason} (${operation} refused)`);
    }
  };

  return {
    name: `metered(${inner.name})`,
    spend: report,

    async put(key, body, contentType) {
      await checkHalt('put');
      charge('put');
      return inner.put(key, body, contentType);
    },

    async get(key): Promise<StoredObject | null> {
      charge('get');
      return inner.get(key);
    },

    async getRange(key, start, end) {
      charge('getRange');
      return inner.getRange(key, start, end);
    },

    async head(key) {
      charge('head');
      return inner.head(key);
    },

    async delete(key) {
      // Free at Cloudflare, so it is counted and never refused on cost. It IS
      // subject to the halt switch: a halt exists to stop the corpus changing
      // during an incident, and a delete changes it more than a write does.
      await checkHalt('delete');
      charge('delete');
      return inner.delete(key);
    },
  };
}
