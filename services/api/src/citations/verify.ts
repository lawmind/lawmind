/**
 * Tier 3 — human confirmation via eCourts.
 *
 * `docs/CITATION_HARNESS.md` step 6: where Tiers 1 and 2 disagree or both miss,
 * open the eCourts search pre-filled and let the advocate solve the CAPTCHA.
 * This module intentionally stays human-only because `verified_by_source =
 * ecourts` means a named advocate personally vouched for the match. Authorized
 * bulk CAPTCHA handling exists behind the separate court grant guard and writes
 * `ecourts_bulk`; it must not manufacture this stronger evidential state.
 *
 * **What "pre-filled" can actually mean, verified against the live site.**
 * `judgments.ecourts.gov.in/pdfsearch/index.php` is a POST form carrying
 * `app_token`, `searchOptions` and `captcha` — a session token and a challenge.
 * **There is no query string that pre-fills it.** So `prefilledQuery` is the text
 * for the advocate to paste, and the client must present it as text to copy, not
 * pretend the search box arrives filled. Saying otherwise in the field name would
 * have been the lie; saying it here is the fix.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

/** Verified reachable 7 Aug 2026. The judgment search, not the case-status portal. */
export const ECOURTS_JUDGMENT_SEARCH = 'https://judgments.ecourts.gov.in/pdfsearch/index.php';

export const ecourtsRequest = z.object({
  citationText: z.string().min(1).max(300),
});

export const confirmRequest = z.object({
  citationText: z.string().min(1).max(300),
  judgmentId: z.string().uuid(),
});

/**
 * The string an advocate should paste into the eCourts search box.
 *
 * Reporter punctuation is dropped because eCourts matches poorly against it, but
 * **digits and their order are never touched** — `(2019) 4 SCC 221` and
 * `(2019) 4 SCC 212` are different cases, and a citation search that quietly
 * reorders them would send the advocate to the wrong judgment.
 */
export function prefilledQuery(citationText: string): string {
  return citationText
    .replace(/[[\]().]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function handleEcourts(c: Context, body: z.infer<typeof ecourtsRequest>): Response {
  return ok(c, {
    ecourtsUrl: ECOURTS_JUDGMENT_SEARCH,
    prefilledQuery: prefilledQuery(body.citationText),
    /**
     * Stated in the payload, not left to the client to remember. The CAPTCHA is
     * the advocate's to solve on this human-confirmation route. Automation uses
     * the separately guarded bulk route and a different source state.
     */
    captchaRequired: true,
    instructions:
      'Open eCourts, paste the citation into the search box and solve the CAPTCHA. ' +
      'This human-confirmation route does not solve it for you. Confirm the match here and we will remember it.',
  });
}

/**
 * Record a human confirmation, permanently.
 *
 * The harness caches Tier 3 results forever because a CAPTCHA solved once should
 * never be asked for again — of anyone. That is also why this is gated on a user:
 * **an anonymous caller able to assert a permanent verification is a way to poison
 * the harness**, and the harness is the one thing in this product that cannot be
 * allowed to lie. Auth ships in S5; until then this answers honestly rather than
 * accepting unattributed confirmations.
 */
export async function handleConfirm(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  body: z.infer<typeof confirmRequest>,
): Promise<Response> {
  if (!userId) {
    return fail(
      c,
      'AUTH_REQUIRED',
      'a Tier 3 confirmation is cached permanently and must be attributable; authentication ships in S5',
      401,
    );
  }

  // The judgment must exist. Confirming a citation against an id we do not hold
  // would cache a claim about a judgment we cannot render.
  const [judgment] = await sql<{ id: string; overruled_status: string }[]>`
    SELECT id, overruled_status FROM judgments WHERE id = ${body.judgmentId}`;
  if (!judgment) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  const [row] = await sql<{ id: string; created_at: string }[]>`
    INSERT INTO citation_checks
      (citation_claimed, judgment_id_matched, verification_state, verified_by_source,
       shown_to_user, overruled_status_shown, surface)
    VALUES (${body.citationText}, ${body.judgmentId}, 'verified', 'ecourts',
            true, ${judgment.overruled_status}, 'judgment_detail')
    RETURNING id, ${sql.unsafe(isoColumn('created_at'))} AS created_at
  `;

  return ok(c, {
    cached: true,
    citationCheckId: row?.id ?? null,
    verificationState: 'verified' as const,
    verifiedBySource: 'ecourts' as const,
    /**
     * Read live from the row, not carried from whatever the client had. A
     * judgment can be verified and overruled at once — confirming that it EXISTS
     * says nothing about whether it is still good law.
     */
    overruledStatus: judgment.overruled_status,
    confirmedAt: row?.created_at ?? null,
    asOf: new Date().toISOString(),
  });
}
