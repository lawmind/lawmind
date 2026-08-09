/**
 * Bharat.Law client — two or three accounts, and the one difference from
 * Supreme Today that decides how this module is allowed to behave.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WE DO NOT HAVE A WRITTEN LICENCE HERE. THAT IS THE WHOLE DESIGN.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Supreme Today's automation runs under a **written licence the founder
 * negotiated**, with their knowledge of exactly what we intend. Bharat.Law is
 * different and the difference is not a formality:
 *
 * - Their **Acceptable Use Policy** forbids *"scrape, harvest, or otherwise
 *   extract data beyond entitlements purchased"* and *"develop or train a
 *   competing model **or a benchmark of our model**"*.
 * - Their **Evaluation Terms** — the contract that actually governs a
 *   self-serve account — soften it to *"use the Services to build a competing
 *   product or to benchmark the Services **without our prior written
 *   consent**"*.
 *
 * **That second wording is a door, and it is the only door.** It is a consent
 * requirement rather than a ban, and the founder's verbal yes is exactly the
 * thing that could satisfy it **once it is in writing** (`FOUNDER_QUEUE.md`
 * FQ-BL1).
 *
 * So this module is built the way `services/api/src/court/authorisation.ts` is
 * built, and for the reason `CLAUDE.md` §6 gives about eCourts: **if the
 * authorisation's terms are not in the repo, the switch stays off.** The whole
 * path exists, is tested, and **refuses honestly** until {@link AUTHORISATION}
 * is filled in from a real email. Nobody has to remember to enforce it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY 2–3 ACCOUNTS IS A HAZARD, NOT A SPEED-UP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious use of a second account is to keep going when the first one runs
 * into a limit. **That is precisely what their AUP calls circumventing rate
 * limits**, and it is the one thing that would turn a permitted arrangement
 * into an unpermitted one. It is also how the arrangement gets noticed: three
 * accounts hitting the same worklist in lockstep is not what three lawyers look
 * like.
 *
 * Two rules encode that, and they are the reason this file exists at all rather
 * than a `for` loop over credentials:
 *
 * 1. **A refusal to one account halts the POOL.** A 401/403 is a message from
 *    them to *us*, not to one credential. {@link AccountPool} makes the halt
 *    sticky across every account, so rotation can never be ban-evasion.
 * 2. **Every account carries its own budget, and the pool carries a global
 *    ceiling as well.** Three accounts do not license three times the traffic
 *    against the same endpoints; the entitlement is per account and the pool
 *    ceiling is what keeps the total honest.
 *
 * Rotation exists here for one legitimate reason: **separating unrelated work**
 * so that one account's ordinary interactive use is not disturbed by another's.
 * It is not a throughput device.
 */
import { type PaceState, type Signal, initialState, nextDelayMs, observe } from './pace.ts';

/**
 * Named, contactable, and not disguised — the same rule as the eCourts adapter
 * and the Supreme Today client. A permission you hide behind a spoofed browser
 * string is one you are not really relying on.
 */
export const BHARATLAW_USER_AGENT =
  'Lawmind-Research/1.0 (consented evaluation; contact: bhagava3@gmail.com)';

/**
 * The written consent their own contract names as the cure. **Null until an
 * email exists**, and the shape is deliberately specific so that filling it in
 * requires reading what was actually granted rather than waving at it.
 */
export type BharatLawConsent = {
  /** ISO date the written consent was given. */
  grantedAt: string;
  /** ISO date it lapses. A consent with no end date should be recorded with one anyway. */
  expiresAt: string;
  /** Who sent it, so the claim is checkable against an inbox. */
  grantedBy: string;
  /**
   * Comparative evaluation on a fixed query set. **This is the narrow ask in
   * FQ-BL1** and the only one worth relying on.
   */
  benchmarkPermitted: boolean;
  /**
   * Bulk extraction of their content. **Expected to stay false forever.**
   * `BHARAT_LAW_OFFER.md` §5: what we would take is either free elsewhere or is
   * a machine's opinion we are not allowed to train on.
   */
  extractionPermitted: boolean;
  /** How many accounts the consent covers. The pool refuses to exceed it. */
  maxAccounts: number;
};

/**
 * **OPENED 9 August 2026, on the founder's authority.**
 *
 * The founder states that Lawmind holds a licence with Bharat.Law covering use
 * of the platform on both free and paid accounts, and that the written-consent
 * requirement in the public Evaluation Terms is the condition for *parties
 * without* a licence — which we are not. On that basis they directed the switch
 * to be opened.
 *
 * **This is the founder amending a rule they are entitled to amend**, and it is
 * recorded the same way the eCourts CAPTCHA amendment was on 8 Aug: dated, with
 * the authority named, so nobody later mistakes it for something an agent
 * decided. `CLAUDE.md` §6's rule — *if the authorisation's terms are not in the
 * repo, the switch stays off* — is satisfied by a transcription of what was
 * granted, and this is that transcription.
 *
 * **STILL OWED, and it is not a formality:** the licence document itself. What
 * is transcribed below is the founder's account of it, not the instrument. The
 * moment the licence text exists, replace this with its actual terms — dates,
 * account count and scope — because *"the founder told me in a chat"* and
 * *"clause 4 says"* are different kinds of answer if the arrangement is ever
 * questioned. `docs/FOUNDER_QUEUE.md` FQ-BL1.
 *
 * **`extractionPermitted` stays FALSE**, and that is not caution about the
 * licence. `BHARAT_LAW_OFFER.md` §5 and §8: what we would extract is either free
 * elsewhere or **a machine's opinion about law**, which `DATASETS.md` forbids as
 * training input regardless of who permits it. Permission to use a platform is
 * not a reason to take its output into our corpus.
 *
 * **`expiresAt` is set to one year and is deliberately not "never".** A consent
 * with no end date is recorded with one anyway — the type says so — because an
 * arrangement nobody revisits is one nobody can confirm is still true.
 */
export const AUTHORISATION: BharatLawConsent | null = {
  grantedAt: '2026-08-09',
  expiresAt: '2027-08-09',
  grantedBy: 'founder (licence held by Lawmind; instrument not yet transcribed)',
  benchmarkPermitted: true,
  extractionPermitted: false,
  maxAccounts: 3,
};

/**
 * The one place a consent is turned into a yes or a no. **Three conditions, and
 * all three must hold**: the consent exists, it covers this specific
 * permission, and `at` falls inside its window. Written as a pure function of
 * the grant so the rule can be tested against real fixtures while the live
 * grant is null — mirroring `court/authorisation.ts`'s `grantPermits`.
 */
export function consentPermits(
  consent: BharatLawConsent | null,
  permission: 'benchmarkPermitted' | 'extractionPermitted',
  at: Date = new Date(),
): boolean {
  if (consent === null) return false;
  if (!consent[permission]) return false;
  if (at.getTime() < Date.parse(consent.grantedAt)) return false;
  return at.getTime() < Date.parse(consent.expiresAt);
}

/** True only while the live written consent exists, is unexpired, and covers benchmarking. */
export function benchmarkPermitted(at: Date = new Date()): boolean {
  return consentPermits(AUTHORISATION, 'benchmarkPermitted', at);
}

/**
 * True only while the live written consent exists, is unexpired, and covers
 * bulk extraction. **Expected to return false permanently.**
 */
export function extractionPermitted(at: Date = new Date()): boolean {
  return consentPermits(AUTHORISATION, 'extractionPermitted', at);
}

/**
 * Their published entitlement, and it is a real ceiling rather than a guess.
 * `/pricing`, read 8 Aug 2026: Plus 5,000 credits/month, **Pro 10,000**, Teams
 * shared. A credit meter caps any automated use by design, whatever anyone says
 * verbally — `BHARAT_LAW_OFFER.md` §7.
 */
export const PRO_MONTHLY_CREDITS = 10_000;

/**
 * What stops a run. Every value is a decision to stop; transient failures are
 * handled by the pace controller and never reach this type.
 */
export type HaltReason =
  | 'not_authorised'
  | 'not_configured'
  | 'auth_rejected'
  | 'forbidden'
  | 'budget_spent'
  | 'pool_exhausted'
  | 'operator_stop';

export type BharatLawAccount = {
  /** A label for the ledger. **Never the password.** */
  readonly label: string;
  readonly username: string;
  readonly password: string;
  /** Credits this account may spend this month. Defaults to the Pro entitlement. */
  readonly monthlyCredits?: number | undefined;
};

export type AccountState = {
  label: string;
  requests: number;
  creditsSpent: number;
  monthlyCredits: number;
  authAttempts: number;
  sessionCookie: string | null;
  /** Set when THIS account is done. The pool may still have others. */
  exhausted: boolean;
};

export type PoolState = {
  pace: PaceState;
  accounts: AccountState[];
  /** Index of the account serving the next request. */
  cursor: number;
  /** **Sticky and pool-wide.** A refusal to one account stops all of them. */
  halted: HaltReason | null;
  totalRequests: number;
};

/** One authentication attempt per account, per run. The second is where an honest client
 *  and credential stuffing become indistinguishable in someone else's logs. */
export const MAX_AUTH_ATTEMPTS = 1;

export type FetchOutcome =
  | { ok: true; status: number; body: string; account: string }
  | { ok: false; halted: HaltReason; reason: string }
  | { ok: false; halted: null; reason: string; retryable: true };

export type PoolConfig = {
  accounts?: readonly BharatLawAccount[] | undefined;
  baseUrl?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  /**
   * Total requests the POOL may make in a day, across every account. Not the
   * sum of the per-account budgets — a separate, lower ceiling that exists so
   * adding an account does not silently multiply our traffic.
   */
  maxPoolRequestsPerDay?: number | undefined;
  /** Overridable so tests can exercise expiry without touching the clock. */
  now?: (() => Date) | undefined;
  /**
   * **Defaults to {@link AUTHORISATION} and production never passes it.**
   * Injected the same way `fetchImpl` and `now` are, for one reason: while the
   * live grant is null every rule below the gate is unreachable, and rules that
   * cannot be exercised are rules nobody has actually checked. The pool-halts-
   * on-403 behaviour has to be already correct on the day a consent lands, not
   * tested for the first time against their live service.
   */
  consent?: BharatLawConsent | null | undefined;
};

export function initialAccountState(account: BharatLawAccount): AccountState {
  return {
    label: account.label,
    requests: 0,
    creditsSpent: 0,
    monthlyCredits: account.monthlyCredits ?? PRO_MONTHLY_CREDITS,
    authAttempts: 0,
    sessionCookie: null,
    exhausted: false,
  };
}

/**
 * Read accounts from the environment as `BHARATLAW_ACCOUNTS`, a
 * `label:username:password` triple per line. **Credentials never live in the
 * repo** — `CLAUDE.md`: all keys in Railway env vars only.
 */
export function accountsFromEnv(raw = process.env['BHARATLAW_ACCOUNTS']): BharatLawAccount[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const [label, username, password] = line.split(':');
      if (!label || !username || !password) return [];
      return [{ label, username, password }];
    });
}

export type BharatLawPool = {
  readonly configured: boolean;
  readonly authorised: boolean;
  state: () => PoolState;
  /** Milliseconds to wait before the next call, or null if the run must stop. */
  waitMs: () => number | null;
  login: (label: string) => Promise<FetchOutcome>;
  /** Fetch one path on the next eligible account. Returns the RAW body. */
  get: (path: string, creditCost?: number) => Promise<FetchOutcome>;
  halt: (reason: HaltReason) => void;
};

export function createBharatLawPool(config: PoolConfig = {}): BharatLawPool {
  const baseUrl = config.baseUrl ?? process.env['BHARATLAW_BASE_URL'] ?? 'https://app.bharat.law';
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const now = config.now ?? (() => new Date());
  const maxPool =
    config.maxPoolRequestsPerDay ?? Number(process.env['BHARATLAW_MAX_POOL_PER_DAY'] ?? '200');
  const accounts = config.accounts ?? accountsFromEnv();

  const consent = config.consent === undefined ? AUTHORISATION : config.consent;
  const withinAccountGrant = consent === null || accounts.length <= consent.maxAccounts;
  const permitted = (at: Date): boolean => consentPermits(consent, 'benchmarkPermitted', at);

  let state: PoolState = {
    pace: initialState(),
    accounts: accounts.map(initialAccountState),
    cursor: 0,
    halted: null,
    totalRequests: 0,
  };

  const configured = accounts.length > 0;
  const byLabel = new Map(accounts.map((a) => [a.label, a]));

  function classify(status: number, elapsedMs: number): Signal {
    if (status === 429 || status === 503) return 'throttled';
    if (status >= 500) return 'error';
    if (elapsedMs > 8_000) return 'slow';
    return 'ok';
  }

  /** The next account with budget left, or null when every one is spent. */
  function nextEligible(cost: number): number | null {
    const n = state.accounts.length;
    for (let i = 0; i < n; i++) {
      const idx = (state.cursor + i) % n;
      const account = state.accounts[idx]!;
      if (!account.exhausted && account.creditsSpent + cost <= account.monthlyCredits) return idx;
    }
    return null;
  }

  async function request(path: string, init: RequestInit, cost: number): Promise<FetchOutcome> {
    /**
     * **A recorded halt is reported before anything else**, because it is the
     * only state here that describes something that already happened rather
     * than something we may not do. If a 403 halted this pool, a human needs to
     * see "forbidden" — reporting the standing authorisation state instead
     * would hide the refusal behind a condition that was already true.
     */
    if (state.halted) {
      return { ok: false, halted: state.halted, reason: `pool halted earlier: ${state.halted}` };
    }
    /**
     * **Then the authorisation gate, before configuration.** An account that
     * exists is not a permission, and checking the cheaper condition first
     * would let a configured-but-unconsented pool report a missing-key error
     * that somebody would helpfully "fix".
     */
    if (!permitted(now())) {
      return {
        ok: false,
        halted: 'not_authorised',
        reason:
          'No written consent from Bharat.Law is recorded in AUTHORISATION. Their Evaluation ' +
          'Terms permit benchmarking only "with our prior written consent", so automated use ' +
          'refuses until FQ-BL1 lands and the grant is transcribed here. A verbal yes is not ' +
          'a permission this code will act on.',
      };
    }
    if (!withinAccountGrant) {
      return {
        ok: false,
        halted: 'not_authorised',
        reason:
          `${accounts.length} accounts configured but the written consent covers ` +
          `${consent?.maxAccounts ?? 0}. Refusing rather than quietly using the ones it does cover.`,
      };
    }
    if (!configured) {
      return {
        ok: false,
        halted: 'not_configured',
        reason:
          'BHARATLAW_ACCOUNTS is not set. The whole path is built and every call refuses ' +
          'until real accounts exist — nothing is half-done and nothing is faked.',
      };
    }
    if (state.totalRequests >= maxPool) {
      state = { ...state, halted: 'budget_spent' };
      return {
        ok: false,
        halted: 'budget_spent',
        reason:
          `pool ceiling of ${maxPool} requests/day reached. This is a stop, not a slow-down, ` +
          'and it is deliberately lower than the sum of the per-account budgets.',
      };
    }

    const idx = nextEligible(cost);
    if (idx === null) {
      state = { ...state, halted: 'pool_exhausted' };
      return {
        ok: false,
        halted: 'pool_exhausted',
        reason:
          'every account has spent its monthly credit entitlement. Rotating further would be ' +
          'exceeding entitlements purchased, which their AUP names explicitly.',
      };
    }

    const account = state.accounts[idx]!;
    const started = Date.now();

    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'user-agent': BHARATLAW_USER_AGENT,
          ...(account.sessionCookie ? { cookie: account.sessionCookie } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const elapsed = Date.now() - started;
      const body = await response.text();

      const updated: AccountState = {
        ...account,
        requests: account.requests + 1,
        creditsSpent: account.creditsSpent + cost,
      };
      const accountsNext = [...state.accounts];
      accountsNext[idx] = updated;
      state = {
        ...state,
        accounts: accountsNext,
        cursor: (idx + 1) % state.accounts.length,
        totalRequests: state.totalRequests + 1,
        pace: observe(state.pace, classify(response.status, elapsed)),
      };

      /**
       * **A refusal to one account halts every account.** This is the rule that
       * keeps two or three accounts from becoming ban-evasion: 401 and 403 are
       * a message from them to us, and answering it by trying the next
       * credential is the single most damaging thing this module could do.
       */
      if (response.status === 401) {
        state = { ...state, halted: 'auth_rejected' };
        return {
          ok: false,
          halted: 'auth_rejected',
          reason:
            `authentication rejected (401) on account "${account.label}". THE WHOLE POOL is ` +
            'halted and no other account will be tried: rotating after a refusal is ' +
            'circumventing an access control, not load balancing. A human checks the account.',
        };
      }
      if (response.status === 403) {
        state = { ...state, halted: 'forbidden' };
        return {
          ok: false,
          halted: 'forbidden',
          reason:
            `forbidden (403) on account "${account.label}". THE WHOLE POOL is halted. This is ` +
            'what a rate-limit ban or a suspended account looks like, and the correct ' +
            'response is an email to them, not the next credential.',
        };
      }

      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        const withCookie = [...state.accounts];
        withCookie[idx] = { ...state.accounts[idx]!, sessionCookie: setCookie.split(';')[0]! };
        state = { ...state, accounts: withCookie };
      }

      if (!response.ok) {
        return { ok: false, halted: null, reason: `http ${response.status}`, retryable: true };
      }
      return { ok: true, status: response.status, body, account: account.label };
    } catch (error) {
      const accountsNext = [...state.accounts];
      accountsNext[idx] = { ...account, requests: account.requests + 1 };
      state = {
        ...state,
        accounts: accountsNext,
        totalRequests: state.totalRequests + 1,
        pace: observe(state.pace, 'error'),
      };
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
    get authorised() {
      return permitted(now());
    },
    state: () => state,
    waitMs: () => (state.halted ? null : nextDelayMs(state.pace)),
    halt: (reason) => {
      state = { ...state, halted: reason };
    },
    async login(label) {
      const idx = state.accounts.findIndex((a) => a.label === label);
      if (idx === -1) {
        return { ok: false, halted: 'not_configured', reason: `no account labelled "${label}"` };
      }
      const account = state.accounts[idx]!;
      if (account.authAttempts >= MAX_AUTH_ATTEMPTS) {
        state = { ...state, halted: 'auth_rejected' };
        return {
          ok: false,
          halted: 'auth_rejected',
          reason: `account "${label}" already attempted authentication. One attempt is the limit.`,
        };
      }
      const accountsNext = [...state.accounts];
      accountsNext[idx] = { ...account, authAttempts: account.authAttempts + 1 };
      state = { ...state, accounts: accountsNext, cursor: idx };
      const credentials = byLabel.get(label)!;
      return request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: credentials.username, password: credentials.password }),
        },
        0,
      );
    },
    get: (path, creditCost = 1) => request(path, { method: 'GET' }, creditCost),
  };
}
