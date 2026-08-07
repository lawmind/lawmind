/**
 * `POST /court/lookup` — the vendor-agnostic court adapter, seen from outside.
 *
 * `sprints/SPRINT_3.md` task 1: the manual implementation returns
 * `{ available: false }` and the client falls back to the manual form. **Nothing
 * above this endpoint changes when OD-1 resolves** — a vendor becoming available
 * changes what this returns, never its shape or its callers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MANUAL ENTRY IS FIRST-CLASS, NOT A FALLBACK PATH (PD-12)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Next hearing dates are given orally in open court and written on the file. An
 * advocate typing one is doing the normal thing, not working around a broken
 * feature — so `available: false` is a **normal, successful 200**, not an error,
 * and the copy says "we could not look this up" rather than anything that reads
 * as a fault. A product that treats the ordinary case as degraded teaches
 * advocates it is unreliable.
 *
 * This is also what makes the wedge survive every parser outage, and why OD-1
 * does not block S3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND IT NEVER REACHES eCOURTS ITSELF
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every route to a court host goes through `court/guard.ts`, which checks the
 * registrar's terms and the kill switch before anything else. This module holds
 * no HTTP client of its own — `guard.test.ts` sweeps the tree and fails the build
 * if any module outside the adapter names an eCourts host.
 *
 * `reason` is returned so the caller can tell WHY nothing came back. "No vendor is
 * configured" and "the switch is off" and "we are outside the permitted hours"
 * are different facts, and collapsing them into a bare `false` is the same
 * mistake as collapsing `miss` into `not_attempted` on the verification sheet.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { ok } from '../envelope.ts';
import { decide } from './guard.ts';

/**
 * A CNR is 16 characters: 4-letter state/district code, 2-digit establishment,
 * 6-digit case number, 4-digit year. Validated loosely on shape only — a court
 * that issues something slightly different must not be rejected by our regex,
 * and the lookup returns `available: false` for anything it cannot resolve
 * anyway.
 */
export const courtLookupRequest = z.object({
  cnrNumber: z
    .string()
    .trim()
    .min(10)
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/, 'a CNR is letters, digits and hyphens'),
});

export async function handleCourtLookup(
  c: Context,
  sql: Sql,
  body: z.infer<typeof courtLookupRequest>,
): Promise<Response> {
  const cnr = body.cnrNumber.trim().toUpperCase();

  /**
   * If we already hold a matter with this CNR, that is not a lookup result and
   * must not be returned as one.
   *
   * It would be somebody else's client. A CNR is a public case number, so an
   * endpoint that answered it from our own matters table would let anyone with a
   * CNR read a party name, a client name and a hearing date belonging to another
   * advocate's file. The corpus is public; the caseload is not.
   */

  // Asking the guard is how we learn whether a court fetch is even permitted.
  // `court` is unknown before a lookup, so this asks about the CNR's own
  // establishment code — the guard refuses an unlisted court, which is correct.
  const decision = await decide(sql, cnr.slice(0, 6));

  if (!decision.allowed) {
    return ok(c, {
      available: false as const,
      /**
       * Named, not merely false. The client shows the same manual form either
       * way, but an operator reading a log needs to know whether nothing is
       * configured, the switch is off, or the grant's hours have passed.
       */
      reason: decision.reason,
      /**
       * Stated so no client has to infer it from `available: false`. Typing the
       * date is the ordinary path, and the copy must not suggest a failure.
       */
      manualEntry: {
        expected: true,
        message:
          'Enter the next date from your file. Dates given in open court are the ' +
          'normal source and are treated exactly the same as one we looked up.',
      },
    });
  }

  /**
   * The switch is on and the grant permits it — and there is still no vendor
   * implementation. Returning `available: false` with a distinct reason is the
   * honest answer: pretending to have looked up and found nothing would be a
   * claim we did not earn.
   *
   * This is the branch a court adapter implementation replaces. Nothing above it
   * changes when it does.
   */
  return ok(c, {
    available: false as const,
    reason: 'no_adapter_implemented' as const,
    manualEntry: {
      expected: true,
      message:
        'Enter the next date from your file. Dates given in open court are the ' +
        'normal source and are treated exactly the same as one we looked up.',
    },
  });
}
