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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ORDER OF OPERATIONS IS THE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   atomic quota reservation (a committed ledger row)
 *     → HTTP request
 *     → settle the ledger row with what happened
 *     → retain the raw response as an immutable artifact
 *     → parse
 *     → normalised observations, and only if parsing succeeded
 *
 * Reservation before the request, because two callers reading the same remaining
 * slot both being told yes is how a bounded permission is breached by a system
 * that believes it is compliant. Retention before parsing, because the first
 * authorised response is the only thing that can teach us what a cause list
 * looks like, and a pipeline that discards what it cannot parse would throw away
 * exactly the sample it needed. Observations last, because an observation is a
 * claim about a case and we only make claims we actually read.
 */
import { grantAttribution } from './authorisation.ts';
import {
  writeCauseListObservations,
  type ValidatedCauseListItem,
} from './ecourts-observation-writer.ts';
import { atomically, type Db, type ObservationStrategy, reserve, settle } from './guard.ts';
import { captureRawArtifact } from './raw-capture.ts';

/** A single listing. Shape stays minimal until a real response defines it. */
export type CauseListItem = {
  cnr: string;
  caseNumber: string;
  courtNumber: string | null;
  itemNumber: number | null;
};

/** What every outcome carries, so evidence is never optional. */
export type CauseListEvidence = {
  /** The ledger row that spent (or refused to spend) a request. Always present. */
  fetchLedgerId: string;
  /** The retained response. Absent only when there were no bytes to retain. */
  artifactId?: string | undefined;
  /** Written observations. Empty unless a parser actually succeeded. */
  observationIds?: string[] | undefined;
};

export type CauseListResult =
  /** The court published listings and we read them. */
  | ({ status: 'ok'; items: CauseListItem[] } & CauseListEvidence)
  /** The court published a list and it genuinely had no entries. A real Tuesday. */
  | ({ status: 'empty' } & CauseListEvidence)
  /** We did not obtain a list we can trust. Never conflated with `empty`. */
  | ({ status: 'failed'; error: string } & Partial<CauseListEvidence>);

/** What `parseCauseList` may return. Retention and parsing are separate acts. */
export type ParseResult =
  | { status: 'ok'; items: ValidatedCauseListItem[] }
  | { status: 'empty' }
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
  /** The cause-list date requested, ISO date. Defaults to `now`'s date. */
  listDate?: string;
  /** Master Roadmap v5 §3.4. Recorded on the ledger row that spends the quota. */
  strategy?: ObservationStrategy;
};

/** Cause lists live on the district-court services host, not the judgments host. */
export const ECOURTS_CAUSE_LIST_ENDPOINT =
  'https://services.ecourts.gov.in/ecourtindia_v6/?p=cause_list/index';

/**
 * The state of the extractor, as a value rather than as folklore.
 *
 * `NEEDS_AUTHORIZED_FIXTURE` is not a TODO. It is the honest statement that we
 * have never seen a response under this grant, and that the official public
 * interface tells us which dimensions a REQUEST needs — court complex, court
 * name, date, civil/criminal — while telling us nothing reliable about the
 * licensed response BODY. Writing selectors against a public page and calling
 * the parser ready would be inventing a schema, which `CLAUDE.md` forbids for
 * exactly the reason that matters here: a plausibly-wrong cause-list parser
 * still sends the briefing.
 */
export const PARSER_STATE = 'NEEDS_AUTHORIZED_FIXTURE' as const;

/**
 * Turn a response body into listings.
 *
 * **Unimplemented on purpose — and it returns `failed`, not `empty`.** An
 * unwritten parser that returned an empty list would mark the sync `empty`, the
 * escalation would never fire, and briefings would go out carrying yesterday's
 * dates as though they had been confirmed today. The failure mode this whole
 * module exists to prevent would be introduced by the stub meant to stand in for
 * it.
 *
 * The contract is now real even though the extractor is not: this is the
 * function `fetchCauseList` calls after the bytes are already safe, and its
 * `failed` branch is a normal outcome that costs a retained artifact and nothing
 * else. When a genuine authorised response exists, only this body changes.
 */
export function parseCauseList(body: string): ParseResult {
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

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Fetch one court's cause list for one date, if every lock permits it.
 *
 * The caller never decides whether it is allowed to proceed — asking is not
 * optional and there is no path around this function to the network.
 */
export async function fetchCauseList(
  sql: Db,
  court: string,
  deps: FetchDeps = {},
): Promise<CauseListResult> {
  const at = deps.now ?? new Date();
  const listDate = deps.listDate ?? isoDate(at);
  const strategy: ObservationStrategy = deps.strategy ?? 'CAUSE_LIST_BATCH';

  // The slot is taken here, durably, before anything can be sent.
  const reservation = await reserve(
    sql,
    { court, endpoint: ECOURTS_CAUSE_LIST_ENDPOINT, strategy },
    at,
  );
  if (!reservation.allowed) {
    return {
      status: 'failed',
      error: `refused: ${reservation.reason} — ${reservation.detail}`,
      fetchLedgerId: reservation.ledgerId,
    };
  }

  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const started = Date.now();
  let response: Response;
  let body: Buffer;
  try {
    response = await doFetch(ECOURTS_CAUSE_LIST_ENDPOINT, {
      headers: {
        // The grant requires attribution and it rides on every request rather
        // than being asserted in a document somewhere. If the registrar looks at
        // their own logs, we should be identifiable there too.
        // Read live, not from the decision's snapshot: the guard has already
        // refused when this is absent, so by here it is a string.
        'user-agent': grantAttribution()!,
      },
    });
    body = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await settle(sql, reservation.ledgerId, {
      outcome: 'error',
      durationMs: Date.now() - started,
    });
    // No bytes, so nothing to retain — but the attempt is on the ledger and the
    // sync is failed, never "nothing changed".
    return { status: 'failed', error: message, fetchLedgerId: reservation.ledgerId };
  }

  const durationMs = Date.now() - started;
  await settle(sql, reservation.ledgerId, {
    outcome: response.ok ? 'ok' : 'error',
    httpStatus: response.status,
    durationMs,
  });

  // RETAIN FIRST. Whatever the status, whatever the parser will make of it.
  const artifact = await captureRawArtifact(sql, {
    sourceUrl: ECOURTS_CAUSE_LIST_ENDPOINT,
    court,
    listDate,
    ecourtsFetchLedgerId: reservation.ledgerId,
    observedAt: at,
    httpStatus: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
    body,
    outcome: response.ok ? 'observed' : 'fetch_failed',
    note: response.ok ? undefined : `http ${response.status}`,
    metadata: { observationStrategy: strategy, durationMs },
  });

  if (!response.ok) {
    return {
      status: 'failed',
      error: `http ${response.status}`,
      fetchLedgerId: reservation.ledgerId,
      artifactId: artifact.id,
    };
  }

  const parsed = parseCauseList(body.toString('utf8'));
  if (parsed.status === 'failed') {
    // The bytes survive. Everything the failure needs is already recorded: the
    // URL and content type on the artifact, the time and HTTP outcome on the
    // ledger, and the reason returned here for the sync row. What is NOT
    // written is an observation — a page we could not read is not a court that
    // published nothing.
    return {
      status: 'failed',
      error: parsed.error,
      fetchLedgerId: reservation.ledgerId,
      artifactId: artifact.id,
    };
  }
  if (parsed.status === 'empty') {
    return { status: 'empty', fetchLedgerId: reservation.ledgerId, artifactId: artifact.id };
  }

  // One transaction for the whole page: a partially written list reads
  // downstream as "this matter is not listed today", which is a false negative
  // a monitoring product cannot afford.
  const observationIds = await atomically(sql, (tx) =>
    writeCauseListObservations(tx, {
      court,
      listingDate: listDate,
      observedAt: at,
      endpoint: ECOURTS_CAUSE_LIST_ENDPOINT,
      payloadSha256: artifact.payloadSha256,
      sourceArtifactId: artifact.id,
      fetchLedgerId: reservation.ledgerId,
      strategy,
      items: parsed.items,
    }),
  );

  return {
    status: 'ok',
    items: parsed.items.map((item) => ({
      cnr: item.cnr ?? '',
      caseNumber: item.caseNumber ?? '',
      courtNumber: item.courtNumber,
      itemNumber: item.itemNumber,
    })),
    fetchLedgerId: reservation.ledgerId,
    artifactId: artifact.id,
    observationIds,
  };
}
