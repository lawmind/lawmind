/**
 * The eCourts adapter. **The only module in this codebase permitted to hold an
 * HTTP client**, and it cannot use it until the guard says so.
 *
 * `services/api/src/citations/verify.ts` is the opposite rule and stays that way:
 * Tier 3 hands the advocate a door and never walks through it, because a
 * per-citation confirmation is worth caching permanently only when a human
 * personally vouched for it. **This module is for BULK PUBLIC cause-list data
 * under the registrar's grant — a different act with different authority.** The
 * two must not be allowed to drift into each other, and a test asserts both.
 *
 * **What is deliberately not built here.** `parseCauseList` does not parse. The
 * switch is off, no request has ever been made, and there is no captured sample
 * of the response to write an extractor against. Writing one from an assumed
 * shape would be inventing a schema — and a cause-list parser that is wrong in a
 * plausible way is the single most dangerous object in this product, because a
 * briefing still goes out. So it returns `failed`, never `empty`, and the seam is
 * named rather than faked.
 *
 * That distinction is the whole point of the three-state result below: **"the
 * court published nothing today" and "we could not read what the court published"
 * are different facts.** Collapsing them is the same error class as reading a
 * verification `miss` off a billing failure.
 */
import type { Sql } from 'postgres';

import { decide, record } from './guard.ts';

/** A single listing. Shape stays minimal until a real response defines it. */
export type CauseListItem = {
  cnr: string;
  caseNumber: string;
  courtNumber: string | null;
  itemNumber: number | null;
};

export type CauseListResult =
  /** The court published listings and we read them. */
  | { status: 'ok'; items: CauseListItem[] }
  /** The court published a list and it genuinely had no entries. A real Tuesday. */
  | { status: 'empty' }
  /** We did not obtain a list we can trust. Never conflated with `empty`. */
  | { status: 'failed'; error: string };

export type FetchDeps = {
  /**
   * Injected so a test can supply a spy that throws if it is ever called. The
   * guarantee being protected — "with the switch off, nothing reaches eCourts" —
   * is about a request that was never made, and the only way to observe the
   * absence of a call is to make calling it fail loudly.
   */
  fetchImpl?: typeof fetch;
  now?: Date;
};

/** Cause lists live on the district-court services host, not the judgments host. */
export const ECOURTS_CAUSE_LIST_ENDPOINT =
  'https://services.ecourts.gov.in/ecourtindia_v6/?p=cause_list/index';

/**
 * Turn a response body into listings.
 *
 * **Unimplemented on purpose — and it returns `failed`, not `empty`.** An
 * unwritten parser that returned an empty list would mark the sync `empty`, the
 * escalation would never fire, and briefings would go out carrying yesterday's
 * dates as though they had been confirmed today. The failure mode this whole
 * module exists to prevent would be introduced by the stub meant to stand in for
 * it.
 */
export function parseCauseList(body: string): CauseListResult {
  return {
    status: 'failed',
    // The body length is the one useful fact available without an extractor: it
    // separates "we got a page and cannot read it" from "we got nothing", and the
    // first captured response is what unblocks writing the real parser.
    error:
      `parser_not_implemented (${body.length} bytes received): no eCourts response has been ` +
      'captured to write an extractor against. Returning failed rather than empty — an ' +
      'unimplemented parser must never read as a court that published nothing.',
  };
}

/**
 * Fetch one court's cause list for one date, if every lock permits it.
 *
 * Returns the result and writes the ledger either way. The caller never decides
 * whether it is allowed to proceed — asking is not optional and there is no path
 * around this function to the network.
 */
export async function fetchCauseList(
  sql: Sql,
  court: string,
  deps: FetchDeps = {},
): Promise<CauseListResult> {
  const at = deps.now ?? new Date();
  const decision = await decide(sql, court, at);

  if (!decision.allowed) {
    await record(sql, {
      court,
      endpoint: ECOURTS_CAUSE_LIST_ENDPOINT,
      outcome: 'refused',
      refusalReason: decision.reason,
    });
    return {
      status: 'failed',
      error: `refused: ${decision.reason} — ${decision.detail}`,
    };
  }

  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const started = Date.now();
  try {
    const response = await doFetch(ECOURTS_CAUSE_LIST_ENDPOINT, {
      headers: {
        // The grant requires attribution and it rides on every request rather
        // than being asserted in a document somewhere. If the registrar looks at
        // their own logs, we should be identifiable there too.
        'user-agent': decision.authorisation.attribution,
      },
    });
    const body = await response.text();
    await record(sql, {
      court,
      endpoint: ECOURTS_CAUSE_LIST_ENDPOINT,
      outcome: 'ok',
      httpStatus: response.status,
      durationMs: Date.now() - started,
    });
    if (!response.ok) {
      return { status: 'failed', error: `http ${response.status}` };
    }
    return parseCauseList(body);
  } catch (error) {
    await record(sql, {
      court,
      endpoint: ECOURTS_CAUSE_LIST_ENDPOINT,
      outcome: 'error',
      durationMs: Date.now() - started,
    });
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}
