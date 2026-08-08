/**
 * Supreme Today harvest client — licensed automation, one account, and a
 * circuit breaker that protects the relationship rather than the run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LICENCE ACTUALLY GRANTS, CORRECTED 8 Aug 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Earlier drafts of `SUPREME_TODAY_LICENCE.md` assumed a data feed. **It is not
 * one.** The founder's correction: the licence permits **automation and bulk
 * search over what an ordinary account can already do** — the thing a normal
 * account is forbidden. There is no export, no API key, no bulk dump.
 *
 * Two consequences that shape every line below:
 *
 * 1. **We work through their normal surfaces**, authenticated as an account.
 *    There is no published API; the web app is backed by `/api/*` endpoints and
 *    those are the surface.
 * 2. **The unit of value is a page view.** So the plan is a worklist of pages,
 *    paced, archived and ledgered — not a subscription to a stream.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FAILURE THAT MATTERS IS NOT A FAILED REQUEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is **losing the account, and with it the relationship.** We start with ONE
 * account, bought to test. A suspension does not cost us a run; it costs us a
 * licence the founder negotiated in person, from a company that is also our most
 * direct competitor and who knows exactly what we intend to do.
 *
 * So this client is built to stop rather than to persevere:
 *
 * - **Any 401/403 halts the entire run.** It does not retry, and it does not
 *   re-authenticate more than once. Repeated auth attempts against a service
 *   look identical to credential stuffing from the other side of the wire, and
 *   the difference between "our client had a bug" and "someone is attacking us"
 *   is not visible in their logs.
 * - **We identify ourselves.** A licensed client should look licensed. The
 *   User-Agent names the product and carries a contact, exactly as the eCourts
 *   adapter sends its attribution — if their operations team looks, they should
 *   see us immediately and be able to ring us instead of blocking us.
 * - **Pace comes from `pace.ts`**, which starts at one request every five
 *   seconds and retreats on a merely *slow* response.
 * - **Cheap endpoints before expensive ones.** Their editorial pages —
 *   headnote, Authority Check, cited-by — are database reads. Their AI answers
 *   cost them GPU. Taking the cheap ones first is both better citizenship and a
 *   lower chance of being noticed as a cost centre, which is the thing that
 *   gets a licence reconsidered.
 */
import { type PaceState, type Signal, initialState, nextDelayMs, observe } from './pace.ts';

/**
 * Sent on every request. **Not optional and not disguised.**
 *
 * `CLAUDE.md` requires attribution on the eCourts harvest for the same reason:
 * we are operating under a permission, and a permission you hide behind a
 * spoofed browser string is one you are not really relying on.
 */
export const HARVEST_USER_AGENT =
  'Lawmind-Harvest/1.0 (licensed automation; contact: bhagava3@gmail.com)';

export type Credentials = { username: string; password: string };

export type SupremeTodayConfig = {
  baseUrl?: string | undefined;
  credentials?: Credentials | undefined;
  fetchImpl?: typeof fetch | undefined;
  /** Requests permitted per day by the contract. **Set it from the contract.** */
  maxRequestsPerDay?: number | undefined;
};

/**
 * Why the run stopped. Every value here is a decision to stop, not a hiccup —
 * a transient failure is handled by the pace controller and never reaches this
 * type.
 */
export type HaltReason =
  'not_configured' | 'auth_rejected' | 'forbidden' | 'budget_spent' | 'operator_stop';

export type HarvestState = {
  pace: PaceState;
  requests: number;
  /** Set once and never cleared without an operator. A halt is sticky. */
  halted: HaltReason | null;
  authAttempts: number;
  sessionCookie: string | null;
};

export function initialHarvestState(): HarvestState {
  return {
    pace: initialState(),
    requests: 0,
    halted: null,
    authAttempts: 0,
    sessionCookie: null,
  };
}

export type FetchOutcome =
  | { ok: true; status: number; body: string; headers: Record<string, string> }
  | { ok: false; halted: HaltReason; reason: string }
  | { ok: false; halted: null; reason: string; retryable: true };

/**
 * **One authentication attempt per run, ever.**
 *
 * The second attempt is where an honest client and an attack become
 * indistinguishable. If the first login fails, the credentials are wrong, the
 * account is suspended, or their login changed — and all three want a human,
 * not a retry.
 */
export const MAX_AUTH_ATTEMPTS = 1;

export type SupremeTodayClient = {
  readonly configured: boolean;
  state: () => HarvestState;
  /** Milliseconds to wait before the next call, or null if the run must stop. */
  waitMs: () => number | null;
  login: () => Promise<FetchOutcome>;
  /** Fetch one path. Returns the RAW body — archive it, parse later. */
  get: (path: string) => Promise<FetchOutcome>;
  halt: (reason: HaltReason) => void;
};

export function createSupremeTodayClient(config: SupremeTodayConfig = {}): SupremeTodayClient {
  const baseUrl =
    config.baseUrl ?? process.env['SUPREMETODAY_BASE_URL'] ?? 'https://supremetoday.ai';
  const username = config.credentials?.username ?? process.env['SUPREMETODAY_USERNAME'];
  const password = config.credentials?.password ?? process.env['SUPREMETODAY_PASSWORD'];
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const maxPerDay =
    config.maxRequestsPerDay ?? Number(process.env['SUPREMETODAY_MAX_REQUESTS_PER_DAY'] ?? '500');

  let state = initialHarvestState();
  const configured = Boolean(username && password);

  function classify(status: number, elapsedMs: number): Signal {
    if (status === 429 || status === 503) return 'throttled';
    if (status >= 500) return 'error';
    if (elapsedMs > 8_000) return 'slow';
    return 'ok';
  }

  async function request(path: string, init: RequestInit): Promise<FetchOutcome> {
    if (!configured) {
      return {
        ok: false,
        halted: 'not_configured',
        reason:
          'SUPREMETODAY_USERNAME / SUPREMETODAY_PASSWORD are not set. The client is built and ' +
          'every call refuses until an account exists — nothing is half-done and nothing is faked.',
      };
    }
    if (state.halted) {
      return { ok: false, halted: state.halted, reason: `run halted earlier: ${state.halted}` };
    }
    if (state.requests >= maxPerDay) {
      state = { ...state, halted: 'budget_spent' };
      return {
        ok: false,
        halted: 'budget_spent',
        reason: `daily ceiling of ${maxPerDay} requests reached. This is a stop, not a slow-down.`,
      };
    }

    const started = Date.now();
    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'user-agent': HARVEST_USER_AGENT,
          ...(state.sessionCookie ? { cookie: state.sessionCookie } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const elapsed = Date.now() - started;
      const body = await response.text();

      state = {
        ...state,
        requests: state.requests + 1,
        pace: observe(state.pace, classify(response.status, elapsed)),
      };

      /**
       * **401 and 403 halt everything.** Not retried, not backed off — stopped.
       * The account is the asset; a client that keeps knocking after being told
       * no is the one that gets it suspended.
       */
      if (response.status === 401) {
        state = { ...state, halted: 'auth_rejected' };
        return {
          ok: false,
          halted: 'auth_rejected',
          reason:
            'authentication rejected (401). The run is halted and will NOT retry: repeated ' +
            'auth attempts are indistinguishable from credential stuffing in their logs. ' +
            'A human should check the account before anything runs again.',
        };
      }
      if (response.status === 403) {
        state = { ...state, halted: 'forbidden' };
        return {
          ok: false,
          halted: 'forbidden',
          reason:
            'forbidden (403). Halted. This is what a rate-limit ban or a suspended account ' +
            'looks like, and the correct response is a phone call, not a retry.',
        };
      }

      const setCookie = response.headers.get('set-cookie');
      if (setCookie) state = { ...state, sessionCookie: setCookie.split(';')[0]! };

      if (!response.ok) {
        return { ok: false, halted: null, reason: `http ${response.status}`, retryable: true };
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { ok: true, status: response.status, body, headers };
    } catch (error) {
      state = { ...state, requests: state.requests + 1, pace: observe(state.pace, 'error') };
      return {
        ok: false,
        halted: null,
        reason: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
  }

  return {
    get configured() {
      return configured;
    },
    state: () => state,
    waitMs: () => (state.halted ? null : nextDelayMs(state.pace)),
    halt: (reason) => {
      state = { ...state, halted: reason };
    },
    async login() {
      if (state.authAttempts >= MAX_AUTH_ATTEMPTS) {
        state = { ...state, halted: 'auth_rejected' };
        return {
          ok: false,
          halted: 'auth_rejected',
          reason: `already attempted authentication ${state.authAttempts} time(s). One is the limit.`,
        };
      }
      state = { ...state, authAttempts: state.authAttempts + 1 };
      return request('/api/account/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    },
    get: (path) => request(path, { method: 'GET' }),
  };
}

/**
 * **The out-of-the-box part: our own corpus is the index into theirs.**
 *
 * `HARVEST_ENGINE.md` §2 made "get their index" priority 0, on the reasoning
 * that nothing can be planned until the target is countable. With a licence
 * that only automates ordinary account features, there may be no index to get —
 * and there does not need to be.
 *
 * **We already hold 38,341 judgments with neutral and reporter citations, and
 * their citation search takes exactly that as input.** So for every judgment we
 * have, we can ask them for their editorial layer directly. No crawl, no
 * discovery, no guessing at their internal IDs: a finite worklist, ordered by
 * whatever we choose, that we own on day one.
 *
 * It also inverts the risk. A crawler that discovers its own worklist can run
 * away with the budget; a worklist drawn from our own database **cannot exceed
 * the size of our own corpus**, and every row is a judgment we already care
 * about.
 *
 * What it does not reach is the judgments they hold and we do not. Those need
 * discovery — but they are also the lowest priority, because raw judgments are
 * free from AWS Open Data and it is the EDITORIAL layer on judgments we already
 * hold that we are paying for.
 */
export type WorkItem = {
  /** Our judgment id — the archive and the parse both key on this. */
  judgmentId: string;
  /** What we hand their citation search. */
  citation: string;
  /** Cheap editorial reads first; anything model-backed last. */
  priority: number;
};

export function orderWorklist(items: readonly WorkItem[]): WorkItem[] {
  return [...items].sort(
    (a, b) => a.priority - b.priority || a.judgmentId.localeCompare(b.judgmentId),
  );
}
