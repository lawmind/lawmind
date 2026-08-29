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
import { attributionForWire } from './authorisation.ts';
import {
  type CauseListSourceKey,
  ledgerCourt,
  mayProduceObservations,
  sourceKeyId,
} from './cause-list-source-key.ts';
import { parseCauseList, PARSER_VERSION, type ParseResult } from './cause-list-parser.ts';
import { writeCauseListObservations } from './ecourts-observation-writer.ts';
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

/**
 * Retention and parsing are separate acts. The parser lives in
 * `cause-list-parser.ts`, written against the one real authorised response, and
 * is re-exported here because `fetchCauseList` is where it is called from.
 */
export { parseCauseList, PARSER_VERSION, type ParseResult };

export type FetchDeps = {
  /**
   * Injected so a test can supply a spy that throws if it is ever called. The
   * guarantee being protected — "with the switch off, nothing reaches eCourts" —
   * is about a request that was never made, and the only way to observe the
   * absence of a call is to make calling it fail loudly.
   */
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Master Roadmap v5 §3.4. Recorded on the ledger row that spends the quota. */
  strategy?: ObservationStrategy;
  /**
   * The endpoint to request, when it is not the module index.
   *
   * Defaults to `ECOURTS_CAUSE_LIST_ENDPOINT`. Overridable because the licensed
   * interface's real query URL is not knowable until a response has been read,
   * and hard-coding a guess would be inventing an endpoint. It is NOT a way
   * around the guard: the reservation is taken against whatever this is, the
   * ledger records it, and every lock is checked first.
   */
  endpoint?: string;
};

/** Cause lists live on the district-court services host, not the judgments host. */
export const ECOURTS_CAUSE_LIST_ENDPOINT =
  'https://services.ecourts.gov.in/ecourtindia_v6/?p=cause_list/index';

/**
 * The state of the extractor, as a value rather than as folklore.
 *
 * `NEEDS_AUTHORIZED_FIXTURE` stood here from 8 Aug until the first authorised
 * request was made on 29 Aug 2026. It is now `FIXTURE_BOUND`: the parser is
 * written against a real retained response — see `cause-list-parser.ts` and its
 * fixture — and every string it matches on is quoted from that response.
 *
 * It is deliberately NOT called `READY`. The response we hold is the licensed
 * interface's FORM, which tells us the request identity, the CAPTCHA
 * requirement and the source's own column vocabulary. It is not a served cause
 * list, so the row-extraction half has been written from the source's published
 * labels and has never been run against a real result table. `PARSER_STATE`
 * says which of those two things is true, because the distance between them is
 * exactly the distance between a parser that works and one that is plausible.
 */
export const PARSER_STATE = 'FIXTURE_BOUND' as const;

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

/**
 * Fetch one court's cause list for one date, if every lock permits it.
 *
 * The caller never decides whether it is allowed to proceed — asking is not
 * optional and there is no path around this function to the network.
 */
export async function fetchCauseList(
  sql: Db,
  source: CauseListSourceKey,
  deps: FetchDeps = {},
): Promise<CauseListResult> {
  const at = deps.now ?? new Date();
  const listDate = source.listDate;
  const strategy: ObservationStrategy = deps.strategy ?? 'CAUSE_LIST_BATCH';
  const endpoint = deps.endpoint ?? ECOURTS_CAUSE_LIST_ENDPOINT;
  const court = ledgerCourt(source);
  const keyId = sourceKeyId(source);

  // The slot is taken here, durably, before anything can be sent.
  const reservation = await reserve(sql, { court, endpoint, strategy }, at);
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
    response = await doFetch(endpoint, {
      headers: {
        // The grant requires attribution and it rides on every request rather
        // than being asserted in a document somewhere. If the registrar looks at
        // their own logs, we should be identifiable there too.
        //
        // Read live, not from the decision's snapshot, and rendered into bytes a
        // header can legally carry. The first real request under this grant died
        // here, before a socket opened, on a single em dash — `attributionForWire`
        // and its note in `authorisation.ts` are that failure's fix. The guard
        // has already refused when it is absent, so by here it is a string.
        'user-agent': attributionForWire()!,
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
    sourceUrl: endpoint,
    court,
    listDate,
    // The canonical identity of the source-and-date this response is FOR. Stored
    // as `source_document_key`, so two captures of the same source on the same
    // date collide on identity rather than on a guess about their contents.
    sourceKeyId: keyId,
    ecourtsFetchLedgerId: reservation.ledgerId,
    observedAt: at,
    httpStatus: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
    body,
    outcome: response.ok ? 'observed' : 'fetch_failed',
    note: response.ok ? undefined : `http ${response.status}`,
    metadata: {
      observationStrategy: strategy,
      durationMs,
      sourceKey: source,
      sourceKeyId: keyId,
    },
  });

  if (!response.ok) {
    return {
      status: 'failed',
      error: `http ${response.status}`,
      fetchLedgerId: reservation.ledgerId,
      artifactId: artifact.id,
    };
  }

  const parsed: ParseResult = parseCauseList(body, response.headers.get('content-type'));
  if (parsed.status === 'failed') {
    // The bytes survive. Everything the failure needs is already recorded: the
    // URL and content type on the artifact, the time and HTTP outcome on the
    // ledger, and the reason returned here for the sync row. What is NOT
    // written is an observation — a page we could not read is not a court that
    // published nothing.
    return {
      status: 'failed',
      // The refusal code leads, because "we could not read it" has four
      // distinguishable causes and a sync row that says only "failed" cannot
      // tell an operator which one to act on.
      error: `${parsed.refusal}: ${parsed.error}`,
      fetchLedgerId: reservation.ledgerId,
      artifactId: artifact.id,
    };
  }
  if (parsed.status === 'empty') {
    return { status: 'empty', fetchLedgerId: reservation.ledgerId, artifactId: artifact.id };
  }

  if (!mayProduceObservations(source)) {
    /**
     * A probe asks about the INTERFACE, and whatever came back describes a form
     * rather than a court's day. The bytes are retained and the request is
     * ledgered; what must not happen is a row in `ecourts_observation`, because
     * that table's whole value is that everything in it was observed of a case.
     */
    return {
      status: 'failed',
      error:
        `parsed ${parsed.items.length} rows from an ${source.tier} response, and an interface ` +
        'probe may not produce observations: a form page is not a court’s day',
      fetchLedgerId: reservation.ledgerId,
      artifactId: artifact.id,
    };
  }

  // One transaction for the whole page: a partially written list reads
  // downstream as "this matter is not listed today", which is a false negative
  // a monitoring product cannot afford.
  const observationIds = await atomically(sql, (tx) =>
    writeCauseListObservations(tx, {
      court,
      listingDate: listDate,
      observedAt: at,
      endpoint,
      payloadSha256: artifact.payloadSha256,
      sourceArtifactId: artifact.id,
      fetchLedgerId: reservation.ledgerId,
      strategy,
      items: parsed.items,
      parserVersion: PARSER_VERSION,
      sourceWarnings: parsed.sourceWarnings,
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
