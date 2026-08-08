/**
 * `POST /admin/overruled-rechecks/run` — the manual trigger for the nightly
 * overruled re-check.
 *
 * **Synchronous by design, and the contract already says so.**
 * `docs/API_CONTRACTS.md` §Overruled re-check: *"There is no run-history
 * endpoint and no `overruled_rechecks` table... The manual trigger returns its
 * own result synchronously rather than a job id to poll."* That decision was
 * made because the table would have been a job log with one consumer — "did it
 * run" is answered by the 22:50 alert, and "what changed" by `citation_fanouts`
 * where `trigger = 'recheck'`, which the citation monitor already reads.
 *
 * **Why `runRecheck` moved into this service to make this possible.** It lived
 * in `services/cron`, which depends on `@lawmind/api` rather than the reverse,
 * so the API could not import it. The options were a new shared package or
 * moving the module. Moving it removed a cross-package import rather than
 * adding one — `recheck.ts` was already importing `applyOverruledChange` and
 * `Pusher` from `@lawmind/api`, so its dependencies all pointed here already.
 * The cron CLI now imports it back out through the package's `exports`, which
 * is the same arrangement `briefings/assemble` has had since the nightly sweep
 * needed it.
 *
 * **No pusher is passed.** An admin pressing this button is not the nightly
 * job: they are reconciling, usually while looking at the citation monitor. The
 * alert rows are still written — those are the durable, in-app truth — but
 * nobody's phone lights up at 3pm because an operator clicked something. The
 * scheduled 22:30 run passes a real pusher and that is where push belongs.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { runRecheck } from '../citations/recheck.ts';
import { fail, ok } from '../envelope.ts';

export async function runOverruledRecheck(
  c: Context,
  sql: Sql,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) {
    return fail(
      c,
      'AUTH_REQUIRED',
      'running the re-check corrects the corpus and notifies advocates; it must be attributable',
      401,
    );
  }

  const result = await runRecheck(sql);

  return ok(c, {
    checked: result.checked,
    flipped: result.flipped,
    failed: result.failed,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    /**
     * Named, never merely counted. A run that flipped three authorities and
     * failed on one is not "mostly fine" — the failure means an advocate is
     * still looking at a badge that is no longer true, and the operator needs
     * to know which one.
     */
    outcomes: result.outcomes,
  });
}
