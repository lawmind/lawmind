/**
 * Indian Kanoon API client — metered, budgeted, and honest about refusing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE BUDGET IS THE MAIN FEATURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the first source we pay for **per request**, and the amounts are small
 * enough to be spent by accident:
 *
 *   search              ₹0.50
 *   document            ₹0.20
 *   document fragment   ₹0.05
 *
 * The signup credit is **₹500**. That is **2,500 documents, or 1,000 searches**,
 * and a loop with an off-by-one in its pagination can spend all of it before
 * anyone looks at a log. So the client meters itself: every call has a known
 * price, the running total is tracked in paise, and **the budget is checked
 * BEFORE the request rather than after it.**
 *
 * A spend guard that reports what was spent is an invoice. One that refuses the
 * request is a control.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Ingest and verification, not a live render path.** Their terms require a
 * "Powered by IKanoon" attribution when results are rendered to end users, and
 * this product renders every citation from its own database row by rule
 * (`CITATION_HARNESS.md` step 8). Using them to *fill the corpus* and to *check
 * existence* incurs no such surface. `docs/HARVEST_ENGINE.md` §5.
 *
 * They are also **Tier 2 of the citation harness** and, since Prism, a
 * competitor — `COMPETITIVE_TEARDOWN.md` §2. Both facts argue for holding what
 * we fetch rather than calling them at render time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO TOKEN IS NOT A BLOCKER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Without `INDIANKANOON_API_TOKEN` the client constructs, reports itself
 * unconfigured, and **refuses every call with a stated reason** — the pattern
 * `packages/auth/src/mail.ts` uses. Everything around it is testable today.
 */
import { type PaceState, type Signal, initialState, observe } from './pace.ts';

/** Paise, not rupees. Money in floating point is a bug waiting for a decimal. */
export const PRICE_PAISE = {
  search: 50,
  document: 20,
  fragment: 5,
} as const;

export type CallKind = keyof typeof PRICE_PAISE;

export const INDIAN_KANOON_BASE = 'https://api.indiankanoon.org';

export type ClientConfig = {
  /** From `INDIANKANOON_API_TOKEN`. Absent is a refusal, never a crash. */
  token?: string | undefined;
  /**
   * Hard ceiling in paise. Defaults to the ₹500 signup credit.
   *
   * **This is a stop, not a warning.** Set it from what has actually been
   * bought — an unstated budget must never read as permission, the same rule
   * the eCourts grant conditions follow.
   */
  budgetPaise?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
};

export type SpendState = {
  spentPaise: number;
  calls: Record<CallKind, number>;
  pace: PaceState;
};

export function initialSpend(): SpendState {
  return {
    spentPaise: 0,
    calls: { search: 0, document: 0, fragment: 0 },
    pace: initialState(),
  };
}

export type Refusal = { ok: false; reason: string };
export type Success<T> = { ok: true; value: T; costPaise: number; spentPaise: number };
export type Result<T> = Success<T> | Refusal;

/** Rupees, for humans. Never used for arithmetic. */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/**
 * May this call be made? Checked **before** spending, and it answers with the
 * reason rather than a boolean, because a refusal an operator cannot explain is
 * a refusal they will work around.
 */
export function canAfford(
  state: SpendState,
  kind: CallKind,
  budgetPaise: number,
): Refusal | { ok: true } {
  const cost = PRICE_PAISE[kind];
  if (state.spentPaise + cost > budgetPaise) {
    return {
      ok: false,
      reason:
        `budget exhausted: ${formatRupees(state.spentPaise)} of ${formatRupees(budgetPaise)} spent, ` +
        `and a ${kind} costs ${formatRupees(cost)}. Raise INDIANKANOON_BUDGET_PAISE deliberately, ` +
        'or stop — this is a control, not a warning.',
    };
  }
  return { ok: true };
}

export type IndianKanoonClient = {
  readonly configured: boolean;
  spend: () => SpendState;
  /** Free-text search. Returns the raw parsed JSON — archive it, parse later. */
  search: (query: string, pageNum?: number) => Promise<Result<unknown>>;
  /** One document by Indian Kanoon docid. */
  document: (docId: number) => Promise<Result<unknown>>;
  /** The matching fragment only — a quarter the price of a full document. */
  fragment: (docId: number, query: string) => Promise<Result<unknown>>;
};

export function createIndianKanoonClient(config: ClientConfig = {}): IndianKanoonClient {
  const token = config.token ?? process.env['INDIANKANOON_API_TOKEN'];
  const budgetPaise =
    config.budgetPaise ?? Number(process.env['INDIANKANOON_BUDGET_PAISE'] ?? '50000');
  const doFetch = config.fetchImpl ?? globalThis.fetch;

  let state = initialSpend();

  async function call(kind: CallKind, path: string): Promise<Result<unknown>> {
    if (!token) {
      return {
        ok: false,
        reason:
          'INDIANKANOON_API_TOKEN is not set. The client is constructed and every call refuses ' +
          'until a token is supplied — nothing is silently skipped and nothing is half-done.',
      };
    }

    const afford = canAfford(state, kind, budgetPaise);
    if (!afford.ok) return afford;

    const started = Date.now();
    let signal: Signal = 'ok';
    try {
      /**
       * POST, per their documentation. The whole API is POST including reads,
       * which is unusual enough to be worth a comment so nobody "fixes" it.
       */
      const response = await doFetch(`${INDIAN_KANOON_BASE}${path}`, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` },
      });

      const elapsed = Date.now() - started;
      if (response.status === 429 || response.status === 503) signal = 'throttled';
      else if (response.status >= 500) signal = 'error';
      else if (elapsed > 5_000) signal = 'slow';

      /**
       * **The spend is recorded whatever the outcome.** A metered API charges
       * for the request, not for our satisfaction with it; treating a failure
       * as free is how a budget silently overruns.
       */
      const cost = PRICE_PAISE[kind];
      state = {
        spentPaise: state.spentPaise + cost,
        calls: { ...state.calls, [kind]: state.calls[kind] + 1 },
        pace: observe(state.pace, signal),
      };

      if (!response.ok) {
        return {
          ok: false,
          reason: `indiankanoon http ${response.status} (charged ${formatRupees(cost)})`,
        };
      }

      return {
        ok: true,
        value: (await response.json()) as unknown,
        costPaise: cost,
        spentPaise: state.spentPaise,
      };
    } catch (error) {
      const cost = PRICE_PAISE[kind];
      state = {
        spentPaise: state.spentPaise + cost,
        calls: { ...state.calls, [kind]: state.calls[kind] + 1 },
        pace: observe(state.pace, 'error'),
      };
      return {
        ok: false,
        reason: `indiankanoon request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    get configured() {
      return Boolean(token);
    },
    spend: () => state,
    search: (query, pageNum = 0) =>
      call('search', `/search/?formInput=${encodeURIComponent(query)}&pagenum=${pageNum}`),
    document: (docId) => call('document', `/doc/${docId}/`),
    fragment: (docId, query) =>
      call('fragment', `/docfragment/${docId}/?formInput=${encodeURIComponent(query)}`),
  };
}

/**
 * What ₹500 actually buys, so the plan is made against a number.
 *
 * Deliberately blunt: at ₹0.20 a document the signup credit is **2,500
 * documents**. That is a sample for measuring coverage, not a corpus — and
 * knowing which of those two it is before starting is the difference between a
 * useful week and a wasted one.
 */
export function budgetSummary(budgetPaise = 50_000): string {
  return [
    `${formatRupees(budgetPaise)} buys, at most:`,
    `  ${Math.floor(budgetPaise / PRICE_PAISE.search)} searches, or`,
    `  ${Math.floor(budgetPaise / PRICE_PAISE.document)} documents, or`,
    `  ${Math.floor(budgetPaise / PRICE_PAISE.fragment)} fragments`,
    'It is a coverage measurement, not a corpus.',
  ].join('\n');
}
