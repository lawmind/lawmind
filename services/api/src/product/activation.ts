/**
 * The funnel that comes BEFORE any paywall is worth tuning.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SERVER OWNS THIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Premium conversion measured on users who never had a successful search is a
 * measurement of nothing. If 60% of advocates never reach a first successful
 * search, no paywall copy in the world moves the number, and every hour spent on
 * the paywall is an hour spent on the wrong screen.
 *
 * The steps are recorded server-side because the server is the only place that
 * knows whether a search actually SUCCEEDED. A client can record "user tapped
 * search"; only the server knows the request returned results, was not degraded,
 * and was not a 500 — and `search_events` already found 50 searches recorded as
 * `result_count = 0` that were in fact server errors. A funnel built on client
 * taps would have counted every one of them as activation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIRST OCCURRENCE ONLY, AND NO IDENTITY BEYOND THE USER ID
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The primary key is `(user_id, step)`, so a twentieth search does not look like
 * activation happening twenty times. `ON CONFLICT DO NOTHING` means recording is
 * cheap, unconditional and safe to call from a hot path.
 *
 * There is no query text, no device id, no session, no screen sequence. This is
 * a funnel, not a session recording, and the difference matters for the same
 * reason `search_events` has no query-text column: what an advocate searches for
 * is a fact about their client's case.
 */
import type { Sql } from 'postgres';

/**
 * The ordered funnel. Order is meaningful — `dropOff` reports between adjacent
 * steps — and the values are duplicated in the `0077` CHECK constraint so a
 * typo is a failed write rather than a step nobody counts.
 */
export const ACTIVATION_STEPS = [
  'onboarded',
  'first_successful_search',
  'opened_primary_authority',
  'saved_authority',
  'created_matter',
  'experienced_matter_value',
  'premium_intent',
] as const;

export type ActivationStep = (typeof ACTIVATION_STEPS)[number];

/**
 * Record a step, at most once per user.
 *
 * Deliberately swallows nothing and returns nothing useful: a funnel write that
 * failed must not take down the request it was measuring, but it also must not
 * be silently discarded, so the error surfaces to the caller's logger rather
 * than being caught here where there is no context to log with.
 */
export async function recordStep(
  sql: Sql,
  userId: string,
  step: ActivationStep,
): Promise<void> {
  await sql`
    INSERT INTO activation_events (user_id, step) VALUES (${userId}, ${step})
    ON CONFLICT (user_id, step) DO NOTHING`;
}

/**
 * Record a step WITHOUT letting it affect the request that triggered it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT IS NOT `recordStep` WITH A TRY/CATCH INSIDE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 (bus 1077) grepped the repo and found `recordStep` had **zero call
 * sites** — it existed, it was tested, and nothing had ever called it, so
 * `activation_events` was empty in every environment and would have stayed
 * empty. That corrects a claim this lane made in bus 1051 that the funnel was
 * "recorded server-side". The measuring half was never wired.
 *
 * The reason it stayed unwired is visible in `recordStep`'s own contract: it
 * throws, deliberately, so the caller can log with context. Seven call sites
 * each needing their own try/catch is seven chances to get it wrong, and the
 * one that gets it wrong takes down a search because a metric failed.
 *
 * So this is the wiring form: fire-and-forget, error logged with the request
 * id, and **the returned promise is deliberately not awaited by callers**. An
 * advocate's search must not wait on a funnel write, and must never fail
 * because of one.
 *
 * `recordStep` keeps its throwing contract for the tests and for any caller
 * that genuinely wants to know.
 */
/**
 * The process-wide outbox, installed by `index.ts` at boot.
 *
 * Null in tests and in any process that never installs one, and the fallback is
 * the ORIGINAL fire-and-forget — a funnel write must not start failing because
 * nobody wired a queue. What changes when it IS installed is that loss becomes a
 * counted number instead of a silence. See `activation-outbox.ts`.
 */
let outbox: { enqueue: (userId: string, step: ActivationStep) => void } | null = null;

export function installActivationOutbox(
  next: { enqueue: (userId: string, step: ActivationStep) => void } | null,
): void {
  outbox = next;
}

export function recordStepInBackground(
  sql: Sql,
  userId: string,
  step: ActivationStep,
  onError: (err: unknown) => void,
): void {
  if (outbox) {
    /* Enqueue and return. Same non-blocking contract as the `void` below, with
     * retry and a loss count behind it. */
    outbox.enqueue(userId, step);
    return;
  }
  void recordStep(sql, userId, step).catch(onError);
}

/**
 * The same thing for a caller that only knows the AUTH id.
 *
 * `search/route.ts` and the judgment reader carry `c.get('authId')` — the
 * better-auth identity — while `activation_events` keys on `users.id`, the
 * profile. The join is `users.auth_id`, and it is one indexed lookup.
 *
 * It happens in the background, AFTER the response, so the extra query is not
 * on the hot path — an advocate's search must not pay a round trip to be
 * counted. A caller with no profile yet (signed in, never onboarded) records
 * nothing and that is correct: there is no funnel to be in.
 */
export function recordStepForAuthIdInBackground(
  sql: Sql,
  authId: string | undefined,
  step: ActivationStep,
  onError: (err: unknown) => void,
): void {
  if (!authId) return;
  void (async () => {
    const [row] = await sql<{ id: string }[]>`SELECT id FROM users WHERE auth_id = ${authId}`;
    if (!row) return;
    /* The id lookup still has to happen inline — the outbox holds a users.id and
     * this path is given an auth_id. Only the WRITE goes through the queue. */
    if (outbox) outbox.enqueue(row.id, step);
    else await recordStep(sql, row.id, step);
  })().catch(onError);
}

export type FunnelRow = {
  readonly step: ActivationStep;
  readonly users: number;
  /** Share of the users who reached the FIRST step. Null on the first step itself. */
  readonly ofOnboarded: number | null;
  /** Share of the users who reached the PREVIOUS step — where the drop actually is. */
  readonly ofPrevious: number | null;
};

/**
 * The funnel, with both denominators.
 *
 * Two ratios, not one, because they answer different questions and a single
 * number hides the one that matters. `ofOnboarded` says how much of the top of
 * the funnel survives to here — the headline. `ofPrevious` says where the floor
 * gives way, which is the only one that tells you what to fix: a step at 80% of
 * onboarded and 40% of the previous step is where users are being lost, and the
 * headline number makes it look healthy.
 */
export async function funnel(sql: Sql, since?: Date): Promise<FunnelRow[]> {
  const rows = await sql<{ step: string; users: string }[]>`
    SELECT step, count(*)::text AS users FROM activation_events
     ${since ? sql`WHERE occurred_at >= ${since}` : sql``}
     GROUP BY step`;
  const counts = new Map(rows.map((r) => [r.step, Number(r.users)]));
  const top = counts.get(ACTIVATION_STEPS[0]) ?? 0;

  return ACTIVATION_STEPS.map((step, i) => {
    const users = counts.get(step) ?? 0;
    const prev = i === 0 ? null : (counts.get(ACTIVATION_STEPS[i - 1]!) ?? 0);
    return {
      step,
      users,
      // Zero denominators return null rather than 0 or NaN — "no data" and "0%"
      // are different facts and only one of them means something is broken.
      ofOnboarded: i === 0 || top === 0 ? null : users / top,
      ofPrevious: prev === null || prev === 0 ? null : users / prev,
    };
  });
}

/**
 * The single number worth putting on a board: the largest fall between two
 * adjacent steps, and where it happens.
 *
 * Returns null when there is not enough data to name one, rather than reporting
 * the first step by default — a drop-off report that always names something is a
 * report that names noise on an empty database.
 */
export async function worstDropOff(
  sql: Sql,
): Promise<{ from: ActivationStep; to: ActivationStep; retained: number } | null> {
  const rows = await funnel(sql);
  let worst: { from: ActivationStep; to: ActivationStep; retained: number } | null = null;
  for (let i = 1; i < rows.length; i += 1) {
    const retained = rows[i]!.ofPrevious;
    if (retained === null) continue;
    if (worst === null || retained < worst.retained) {
      worst = { from: ACTIVATION_STEPS[i - 1]!, to: ACTIVATION_STEPS[i]!, retained };
    }
  }
  return worst;
}
