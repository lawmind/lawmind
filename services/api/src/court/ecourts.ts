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
import { attributionForWire, AUTHORISATION } from './authorisation.ts';
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
      /**
       * ───────────────────────────────────────────────────────────────────────
       * THERE ARE TWO FETCH SITES IN THIS MODULE, AND ONLY ONE HAD BEEN UPDATED
       * ───────────────────────────────────────────────────────────────────────
       *
       * `guardedRequest` below describes itself as *"The ONE network path ...
       * Everything below goes through here rather than calling `fetch` itself"*
       * — and the word doing the work in that sentence is **below**. This
       * function predates it and calls `fetch` directly.
       *
       * When attribution moved off `User-Agent` onto its own header, this site
       * was missed. Nothing failed: the request still went out, still carried a
       * `User-Agent`, and was simply **unattributed** — the one property the
       * grant actually requires. `attribution-transport.test.ts` caught it by
       * asserting on the bytes rather than on the constant, which is why it
       * asserts there.
       *
       * The headers are built identically to `guardedRequest`'s so the two
       * cannot drift again on this property.
       */
      headers: {
        'user-agent': ECOURTS_CLIENT_USER_AGENT,
        /**
         * Read live, not from the decision's snapshot, and rendered into bytes a
         * header can legally carry. The first real request under this grant died
         * here, before a socket opened, on a single em dash — `attributionForWire`
         * and its note in `authorisation.ts` are that failure's fix. The guard
         * has already refused when it is absent, so by here it is a string.
         */
        [ECOURTS_ATTRIBUTION_HEADER]: attributionForWire()!,
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SESSION PATH — what a real cause-list request actually takes
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The single-shot `fetchCauseList` above was written before anyone had seen the
 * licensed interface. The interface turns out to be stateful, and the shape
 * below is not a guess: it is read out of the retained response and the two
 * scripts it loads, all held append-only in `official_source_artifact`.
 *
 *   1. GET the module index. The reply sets `SERVICES_SESSID` and embeds a
 *      one-shot `app_token` in a hidden input, plus the CAPTCHA image URL for
 *      THIS session.
 *   2. GET that CAPTCHA image, on the same cookie. A different session gets a
 *      different answer, so the image and the token travel together or neither
 *      is any use.
 *   3. POST `?p=cause_list/submitCauseList` with the five dimensions, the date,
 *      the civil/criminal flag, the solved code, `ajax_req=true` and the token —
 *      `components.js` lines 378-381 are where that URL and that suffix come
 *      from, and `searchByCauselist.js` line 100 is where the body is assembled.
 *
 * The reply is JSON, not HTML: `{status, div_captcha, case_data}`
 * (`searchByCauselist.js` lines 104-122). `status: 0` means the code was
 * rejected and a fresh CAPTCHA is re-rendered; `status: 1` carries the listing
 * table in `case_data`. That distinction matters more than it looks — a
 * rejected CAPTCHA and a court with an empty list arrive as the same HTTP 200,
 * and this field is the only thing separating them.
 *
 * **Each of those three is a separate ledgered, rate-limited request.**
 * `CLAUDE.md` §6a permits the authorised bypass under exactly three mechanical
 * conditions, and two of them live here: the code is only in this module, and
 * nothing reaches the network except through `reserve()`. Solving the CAPTCHA
 * does not exempt a request from the grant's limits — the registrar granted
 * permission to pass their control, not permission to flood.
 */

/** The licensed district-court service. Everything below hangs off it. */
export const ECOURTS_BASE = 'https://services.ecourts.gov.in/ecourtindia_v6';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO `ajaxCall` HEADERS — READ FROM BYTES, AFTER THE TRANSCRIPTION WAS
 * FOUND WRONG IN BOTH HALVES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These stood here as `delimeter` / `Kjweuru253`, both `jkhfkjhkjert33`,
 * described as "transcribed from the licensed client's own source" and credited
 * in R11/R12 with fixing an `Invalid Request` reply.
 *
 * `components.js` was retained on 30 Aug 2026
 * (`__fixtures__/ecourts-components-2026-08-29.js`, sha256 `749fa62f…7a086`)
 * and says, at `ajaxCall`:
 *
 *     var delimeter = "764r6hry7ffds";
 *     headers: { "delimeter": delimeter, "G73hdfdsh": delimeter }
 *
 * **The second header's NAME and both VALUES were wrong.** Nothing detected it,
 * because the only cause-list request ever attempted failed for other reasons
 * and no test compared our bytes to the client's. This is the round's lesson in
 * one constant: a `TRANSCRIBED` row is a claim, and this one was false.
 *
 * They are plainly rotating anti-automation tokens, so they will drift again.
 * `official-client-recorder.test.ts` now executes the retained `ajaxCall` and
 * asserts our headers equal the ones it emits, which turns the next drift into a
 * failing test instead of a silent `Invalid Request`.
 */
export const ECOURTS_AJAX_DELIMETER = '764r6hry7ffds';

/** The second header `ajaxCall` sends, carrying the same value. */
export const ECOURTS_AJAX_DELIMETER_HEADER_2 = 'G73hdfdsh';

/** The pair `ajaxCall` sends on every AJAX request: one value, two headers. */
export type AjaxDelimeter = { headerName: string; value: string };

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THE PAIR FROM THE LIVE SCRIPT. IT ROTATES, AND A CONSTANT CANNOT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two captures of the licensed client's own `components.js`, taken five hours
 * apart on the SAME DAY, differ in exactly two lines and nothing else:
 *
 *     17:35Z   var delimeter="jkhfkjhkjert33";     "Kjweuru253":delimeter
 *     22:27Z   var delimeter="764r6hry7ffds";      "G73hdfdsh":delimeter
 *
 * Both fixtures are checked in, which is what makes that a fact rather than a
 * story: `official-client-recorder.test.ts` parses both.
 *
 * **This retires a two-round-old misdiagnosis, in both directions.** R11 read
 * the pair, hardcoded it, got `Invalid Request`, and blamed the User-Agent. R12
 * called the hardcoded pair "transcribed from the licensed client's source" and
 * credited it with the fix. R12b then read fresh bytes, found different values,
 * and concluded the earlier transcription had been WRONG. All three were
 * mistaken the same way: the transcription was CORRECT WHEN MADE and had gone
 * stale, because the value rotates roughly hourly. No committed constant can
 * ever be right for long — including the one above, which is now only a
 * last-resort fallback and is expected to be stale.
 *
 * The browser has no such problem: it re-fetches `components.js` on every page
 * load and always runs the current pair. So do we, once per session.
 */
export function parseAjaxDelimeter(componentsJs: string): AjaxDelimeter | null {
  const value = /var\s+delimeter\s*=\s*"([^"]+)"/.exec(componentsJs)?.[1];
  if (!value) return null;
  /**
   * The second header is named in the object literal beside the constant one.
   * Matched relative to `"delimeter": delimeter` rather than by a list of known
   * names, because the NAME rotates too — a list would need editing every time
   * the thing it exists to track changes.
   */
  const headerName = /"delimeter"\s*:\s*delimeter\s*,\s*"([^"]+)"\s*:\s*delimeter/.exec(
    componentsJs,
  )?.[1];
  if (!headerName) return null;
  return { headerName, value };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * USER-AGENT AND ATTRIBUTION ARE TWO DIFFERENT THINGS, AND ONE HEADER WAS DOING
 * BOTH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The attribution string was being sent AS the `User-Agent`. Read literally,
 * the binding record does not ask for that. `CLAUDE.md` §6a says
 * `ECOURTS_GRANT_ATTRIBUTION` is *"an internal audited attribution string that
 * identifies LawMind's authorized eCourts access — **not** a phrase the grant
 * requires us to quote verbatim (the written authorization prescribes no
 * mandatory attribution wording that is recorded in this repository)"*, and
 * nothing anywhere records a mandated HEADER either. What is required is that
 * attribution be present on every request. The channel was our choice, and it
 * was the wrong one for two reasons:
 *
 * - **`User-Agent` is the most-logged header on the internet.** Proxies, CDNs
 *   and analytics retain it by default. A compliance value that identifies our
 *   authorised access does not belong in the field most likely to be written to
 *   somebody else's disk.
 * - **A `User-Agent` is supposed to identify the CLIENT SOFTWARE**, so that an
 *   operator debugging traffic can tell what is talking to them. A sentence of
 *   English prose in that field tells them nothing useful about the client.
 *
 * So the two are separated. `User-Agent` carries a conventional, interoperable
 * client identity that still names us; `x-lawmind-attribution` carries the
 * audited attribution, on **every** request, asserted by
 * `attribution-transport.test.ts`.
 *
 * **Attribution is not weakened and is not removed.** It is still read live from
 * the environment, still rendered into header-legal bytes, and `guard.decide`
 * still refuses every network request while it is unset. What changed is which
 * header carries it. Nothing here prints it.
 *
 * **This is not inferred from the `Invalid Request` response.** That reply was
 * explained and fixed by the two `ajaxCall` headers above, transcribed from the
 * licensed client's own source. No legal-policy conclusion is drawn from an
 * HTTP error, and none should be.
 */
export const ECOURTS_ATTRIBUTION_HEADER = 'x-lawmind-attribution';

/**
 * A conventional client identity. Deliberately NOT a browser string: claiming to
 * be Chrome would be a misrepresentation to the party that authorised us, which
 * is a bad trade for a header nobody is checking.
 */
export const ECOURTS_CLIENT_USER_AGENT = 'LawMind/1.0 (+authorised eCourts access; legal research)';

export type EcourtsSession = {
  /** `SERVICES_SESSID` and friends, already folded into a Cookie header. */
  cookieHeader: string;
  /** One-shot CSRF token. Rotates on every reply; the caller must carry it. */
  appToken: string;
  /** The CAPTCHA image for THIS session, absolute. */
  captchaUrl: string;
  /**
   * The `ajaxCall` header pair, read from the live script for THIS session.
   * Absent only if the script could not be read, in which case the committed
   * fallback is used and is probably stale — see {@link parseAjaxDelimeter}.
   */
  ajaxDelimeter?: AjaxDelimeter | undefined;
};

/** One guarded request's outcome, with its evidence attached. */
type GuardedResponse =
  | {
      refused: false;
      ok: boolean;
      status: number;
      contentType: string | null;
      body: Buffer;
      setCookie: string[];
      fetchLedgerId: string;
      artifactId?: string | undefined;
    }
  | { refused: true; fetchLedgerId: string; reason: string };

/**
 * The ONE network path. Reserve, send, settle, retain — in that order, always.
 *
 * Everything below goes through here rather than calling `fetch` itself, because
 * a second call site is a second place to get the order wrong, and the order is
 * the design: the slot is spent before the socket opens so a crash cannot hand
 * it back, and the bytes are kept before anything reads them so a parser failure
 * cannot cost us the sample.
 */
/**
 * Flatten an error and its `cause` chain into one line.
 *
 * Node wraps transport failures twice: `TypeError: fetch failed` with the real
 * `Error: read ECONNRESET` underneath, and sometimes a third level below that.
 * Bounded to four links so a cyclic chain cannot spin.
 */
function describeFetchFailure(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof Error) {
      const code = (current as Error & { code?: unknown }).code;
      parts.push(code === undefined ? current.message : `${current.message} [${String(code)}]`);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(' <- ');
}

async function guardedRequest(
  sql: Db,
  request: {
    court: string;
    endpoint: string;
    strategy: ObservationStrategy;
    sourceKeyId: string;
    listDate?: string | undefined;
    method?: 'GET' | 'POST';
    body?: string | undefined;
    session?: EcourtsSession | undefined;
    accept?: string | undefined;
    at?: Date | undefined;
    fetchImpl?: typeof fetch | undefined;
  },
): Promise<GuardedResponse> {
  const at = request.at ?? new Date();
  const reservation = await reserve(
    sql,
    { court: request.court, endpoint: request.endpoint, strategy: request.strategy },
    at,
  );
  if (!reservation.allowed) {
    return {
      refused: true,
      fetchLedgerId: reservation.ledgerId,
      reason: `${reservation.reason} — ${reservation.detail}`,
    };
  }

  const doFetch = request.fetchImpl ?? globalThis.fetch;
  const started = Date.now();
  let response: Response;
  let body: Buffer;
  try {
    const headers: Record<string, string> = {
      /**
       * A conventional client identity, so an operator reading their logs can
       * tell what is talking to them. See {@link ECOURTS_CLIENT_USER_AGENT} for
       * why this is no longer the attribution's channel.
       */
      'user-agent': ECOURTS_CLIENT_USER_AGENT,
      /**
       * Read live and rendered into header-legal bytes. The grant requires
       * attribution on EVERY request, the CAPTCHA image fetch included — this
       * is the ONE place it is attached, so there is no request shape that can
       * omit it. `guard.decide` has already refused if it is unset.
       */
      [ECOURTS_ATTRIBUTION_HEADER]: attributionForWire()!,
      accept: request.accept ?? '*/*',
    };
    if (request.session) headers['cookie'] = request.session.cookieHeader;
    if (request.method === 'POST') {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      headers['x-requested-with'] = 'XMLHttpRequest';
      headers['referer'] = `${ECOURTS_BASE}/?p=cause_list/index`;
      /**
       * The two headers `ajaxCall` sends on every request — read from the
       * retained `components.js`, not transcribed. See the constants above for
       * what the previous, wrong pair cost.
       *
       * They are not decoration: without them the endpoint answers
       * `{"errormsg":"...Invalid Request...!"}` with an empty `app_token`. Named
       * as what they are — constants the licensed client sends — so nobody later
       * mistakes them for a secret of ours.
       */
      const pair = request.session?.ajaxDelimeter ?? {
        headerName: ECOURTS_AJAX_DELIMETER_HEADER_2,
        value: ECOURTS_AJAX_DELIMETER,
      };
      headers['delimeter'] = pair.value;
      headers[pair.headerName] = pair.value;
    }
    response = await doFetch(request.endpoint, {
      method: request.method ?? 'GET',
      headers,
      ...(request.body === undefined ? {} : { body: request.body }),
    });
    body = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    await settle(sql, reservation.ledgerId, {
      outcome: 'error',
      durationMs: Date.now() - started,
    });
    return {
      refused: true,
      fetchLedgerId: reservation.ledgerId,
      /**
       * THE CAUSE CHAIN, NOT JUST `fetch failed`.
       *
       * undici reports every transport failure as the same three words and puts
       * the actual reason — `ECONNRESET`, `UND_ERR_SOCKET`, a TLS alert, a DNS
       * failure — in `error.cause`. Discarding it cost a bounded eCourts request
       * on 30 Aug 2026: the canary died after a successful session page and a
       * successful `components.js`, in 76 ms, and the receipt could say nothing
       * more than "fetch failed".
       *
       * Under a grant that limits how many requests may be spent, a diagnostic
       * that requires a second request to say what the first one hit is not a
       * diagnostic.
       */
      reason: describeFetchFailure(error),
    };
  }

  const durationMs = Date.now() - started;
  await settle(sql, reservation.ledgerId, {
    outcome: response.ok ? 'ok' : 'error',
    httpStatus: response.status,
    durationMs,
  });

  const artifact = await captureRawArtifact(sql, {
    sourceUrl: request.endpoint,
    court: request.court,
    listDate: request.listDate,
    sourceKeyId: request.sourceKeyId,
    ecourtsFetchLedgerId: reservation.ledgerId,
    observedAt: at,
    httpStatus: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
    body,
    outcome: response.ok ? 'observed' : 'fetch_failed',
    metadata: {
      observationStrategy: request.strategy,
      durationMs,
      method: request.method ?? 'GET',
    },
  });

  const setCookie = response.headers.getSetCookie?.() ?? [];
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE JAR UPDATES ON EVERY RESPONSE, NOT ONLY AT SESSION OPEN
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `openCauseListSession` captured cookies once and nothing afterwards ever
   * looked at `Set-Cookie` again. A browser's jar updates on every response, and
   * PHP regenerates a session id on state transitions as a matter of routine.
   *
   * What that produced, measured 30 August 2026: the CAPTCHA image is fetched,
   * the server stores the expected code against whatever session that GET landed
   * in, and the submit — still carrying the cookie from session open — arrives
   * in a different session with no stored code. The reply is
   * `{"errormsg":"Invalid Captcha... "}`.
   *
   * That reads exactly like a solver failure and is not one. Three consecutive
   * rejections were checked against the retained images by eye: `y86h6r`,
   * `ktveGT`, `29mgst` — every one correct, and the bench measures the engine at
   * 11/12 exact on real eCourts CAPTCHAs. Three correct codes rejected in a row
   * is not an OCR outcome.
   *
   * The update lives HERE rather than in each caller for the same reason the
   * attribution header does: there must be no request shape that can skip it.
   */
  if (request.session && setCookie.length > 0) {
    request.session.cookieHeader = cookieHeaderFrom(setCookie, request.session.cookieHeader);
  }

  return {
    refused: false,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    body,
    setCookie,
    fetchLedgerId: reservation.ledgerId,
    artifactId: artifact.id,
  };
}

function cookieHeaderFrom(setCookie: readonly string[], previous = ''): string {
  const jar = new Map<string, string>();
  for (const pair of previous.split('; ').filter(Boolean)) {
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  for (const raw of setCookie) {
    const first = raw.split(';')[0] ?? '';
    const eq = first.indexOf('=');
    if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** `app_token` is a hidden input, and it rotates on every reply. */
function appTokenFrom(html: string): string | null {
  return /name="app_token"[^>]*value="([0-9a-fA-F]+)"/.exec(html)?.[1] ?? null;
}

function absoluteCaptchaUrl(src: string): string {
  if (src.startsWith('http')) return src;
  if (src.startsWith('/')) return `https://services.ecourts.gov.in${src}`;
  return `${ECOURTS_BASE}/${src}`;
}

export class EcourtsSessionRefused extends Error {
  override name = 'EcourtsSessionRefused';
}

/**
 * Step 1 — open a session on the cause-list module.
 *
 * Returns the cookie, the token and the CAPTCHA URL together because they are
 * only meaningful together: solving an image from one session and posting it
 * with another session's token is a guaranteed `status: 0`, and would look from
 * the outside exactly like a solver that cannot read digits.
 */
export async function openCauseListSession(
  sql: Db,
  deps: FetchDeps & {
    /**
     * Where to open the session. Defaults to the cause-list module.
     *
     * Parameterised because a deep link and the app's own entry point do not
     * necessarily leave the same server-side session state, and which one the
     * AJAX endpoints accept is a question about the source that only the source
     * can answer. It is not a way around anything: whatever this is, the request
     * goes through `guardedRequest` like every other.
     */
    entryPath?: string;
    /**
     * Continue an existing session rather than starting a cold one.
     *
     * The licensed client never opens a module cold: every in-app link is built
     * by `requestUri()` as `?p=<module>&app_token=<token>` and is followed with
     * the session's cookies. A bare first visit and a navigation are therefore
     * different requests to the server, and only the second is what the AJAX
     * endpoints see in normal use.
     */
    session?: EcourtsSession | undefined;
  } = {},
): Promise<{ session: EcourtsSession; artifactId?: string | undefined; fetchLedgerId: string }> {
  const at = deps.now ?? new Date();
  const listDate = at.toISOString().slice(0, 10);
  const source: CauseListSourceKey = {
    tier: 'interface_probe',
    probe: 'cause_list_session_open',
    listDate,
  };
  const result = await guardedRequest(sql, {
    court: ledgerCourt(source),
    endpoint: deps.entryPath ?? `${ECOURTS_BASE}/?p=cause_list/index`,
    strategy: deps.strategy ?? 'CAUSE_LIST_BATCH',
    sourceKeyId: sourceKeyId(source),
    listDate,
    accept: 'text/html,application/xhtml+xml',
    at,
    ...(deps.session === undefined ? {} : { session: deps.session }),
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  });

  if (result.refused) throw new EcourtsSessionRefused(result.reason);
  if (!result.ok) throw new EcourtsSessionRefused(`http ${result.status} opening the session`);

  const html = result.body.toString('utf8');
  const appToken = appTokenFrom(html);
  if (!appToken) {
    throw new EcourtsSessionRefused(
      'the module index carried no app_token; the interface has changed shape, and posting ' +
        'without one would be guessing at a CSRF scheme',
    );
  }
  const captchaSrc = /id="captcha_image"[^>]*src="([^"]+)"/i.exec(html)?.[1];
  if (!captchaSrc) throw new EcourtsSessionRefused('the module index carried no captcha image url');

  const session: EcourtsSession = {
    // Merge onto the previous jar when continuing a session: the AJAX host
    // sets `SERVICES_SESSID` on `/ecourtindia_v6` and an affinity cookie on
    // `/`, and a navigation that returned only one of them must not drop the
    // other.
    cookieHeader: cookieHeaderFrom(result.setCookie, deps.session?.cookieHeader ?? ''),
    appToken,
    captchaUrl: absoluteCaptchaUrl(captchaSrc),
    ...(deps.session?.ajaxDelimeter === undefined
      ? {}
      : { ajaxDelimeter: deps.session.ajaxDelimeter }),
  };

  /**
   * Read the rotating `ajaxCall` header pair for this session.
   *
   * One extra request per session, and it buys the difference between working
   * and `Invalid Request`. The page the browser loads pulls
   * `components.js?v=<build>` every time and therefore always runs the current
   * pair; a server-side client that hardcodes it is correct only until the next
   * rotation, which measured at roughly five hours on 29 Aug 2026.
   *
   * The version query is taken from the page we just received, so this asks for
   * the exact asset the interface itself asked for rather than a URL we made up.
   *
   * It is skipped when the caller already has a pair (a continued session), and
   * a failure here is NOT fatal: the committed fallback is used, the request is
   * probably refused, and that refusal is visible rather than silent.
   */
  if (!session.ajaxDelimeter) {
    /**
     * Wait out our own minimum spacing first.
     *
     * The first version of this fetched the script immediately after the page
     * and was refused by `reserve()` for `min_interval` — so the fallback pair
     * was used and nothing said so. The refusal was correct; the caller was
     * wrong to ask that soon. Spacing here rather than in the caller keeps the
     * guarantee where the requests are made.
     */
    await new Promise((resolve) =>
      setTimeout(resolve, (AUTHORISATION?.minIntervalMs ?? 2000) + 400),
    );
    const versioned = /js\/components\.js(\?[^"']*)?/.exec(html)?.[1] ?? '';
    const asset = await retainInterfaceAsset(sql, 'components', {
      ...(versioned ? { query: versioned.replace(/^\?/, '') } : {}),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.strategy === undefined ? {} : { strategy: deps.strategy }),
      session,
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    });
    if (!asset.refused && asset.ok) {
      const pair = parseAjaxDelimeter(asset.bytes.toString('utf8'));
      if (pair) session.ajaxDelimeter = pair;
    }
  }

  return {
    session,
    artifactId: result.artifactId,
    fetchLedgerId: result.fetchLedgerId,
  };
}

/**
 * Step 2 — fetch this session's CAPTCHA image.
 *
 * Retained like everything else, and that is not ceremony: the retained images
 * are what a solver is measured against later, and a solver measured only on
 * images nobody kept is a solver whose accuracy nobody can check.
 */
export async function fetchCaptchaImage(
  sql: Db,
  session: EcourtsSession,
  deps: FetchDeps = {},
): Promise<{ bytes: Buffer; contentType: string | null; artifactId?: string | undefined }> {
  const at = deps.now ?? new Date();
  const listDate = at.toISOString().slice(0, 10);
  const source: CauseListSourceKey = {
    tier: 'interface_probe',
    probe: 'cause_list_captcha_image',
    listDate,
  };
  const result = await guardedRequest(sql, {
    court: ledgerCourt(source),
    endpoint: session.captchaUrl,
    strategy: deps.strategy ?? 'CAUSE_LIST_BATCH',
    sourceKeyId: sourceKeyId(source),
    listDate,
    session,
    accept: 'image/png,image/*',
    at,
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  });
  if (result.refused) throw new EcourtsSessionRefused(result.reason);
  if (!result.ok) throw new EcourtsSessionRefused(`http ${result.status} fetching the captcha`);
  return { bytes: result.body, contentType: result.contentType, artifactId: result.artifactId };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RETAINING THE INTERFACE'S OWN SCRIPTS — the request that turns transcription
 * into evidence
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/lcc-r12/ECOURTS_OFFLINE_REQUEST_DIFF.md` reconciled our request shape
 * against the licensed client field by field, and had to mark most rows
 * `TRANSCRIBED`: the functions that BUILD a cause-list request — `fillDistrict`,
 * `fillcomplex`, `fillCauseList`, `submitCauseList` and the `app_token` rotation
 * — are not in the page we retained. They live in
 * `/ecourtindia_v6/js/searchByCauselist.js`, an external asset the page only
 * references.
 *
 * A `TRANSCRIBED` row is one a future agent cannot re-derive from this
 * repository, and that is the whole reason to spend a request here: retaining
 * the script turns those rows into `BYTES`, and it is what makes the offline
 * execution the round asks for possible at all. Without the script, "run the
 * official functions against a recording transport" is an instruction with no
 * functions to run.
 *
 * It is one GET of a static asset inside the licensed interface, squarely within
 * the enumerated `permittedDataTypes`, and it costs one slot out of a thousand.
 * It goes through `guardedRequest` like everything else — reserved, ledgered
 * before the socket opens, attributed, rate-limited, retained before anything
 * reads it. There is no cheaper path for "it's only a script".
 *
 * The tier is `interface_probe`, and that is load-bearing:
 * `mayProduceObservations` refuses to turn anything read out of it into an
 * `ecourts_observation`. A script is not a court's day.
 */
export const ECOURTS_INTERFACE_ASSETS = {
  /** The cause-list module's own client. It defines the request this adapter makes. */
  search_by_causelist: `${ECOURTS_BASE}/js/searchByCauselist.js`,
  /** `ajaxCall` / `jsonCall` — where the `delimeter` headers and token rotation live. */
  components: `${ECOURTS_BASE}/js/components.js`,
  /** The cascading `fillDistrict` / `fillcomplex` chain, shared across modules. */
  common_header: `${ECOURTS_BASE}/js/common_header.js`,
  /**
   * `csrf-magic`, and the reason the first correct-looking request still failed.
   *
   * The module page loads it alongside the others. It is Edward Z. Yang's PHP
   * CSRF library, whose javascript half **monkey-patches
   * `XMLHttpRequest.prototype.send`** to append a token to every POST body. So
   * the field it adds appears in NO application script: not in `ajaxCall`, not
   * in `submit_causelist`, nowhere a reader of the client's own code would look.
   *
   * That is why `casestatus/fillDistrict` answered `Invalid Request` even after
   * the `delimeter` pair was corrected from bytes — R11 and R12 both blamed
   * those headers, and the header fix alone changed nothing. A recorder that
   * shims `$.ajax` cannot see this either: the patch is one layer BELOW jQuery.
   */
  csrf_magic: `${ECOURTS_BASE}/csrf-magic.js`,
  /**
   * Both load AFTER `components.js` on the module page, so either can redefine
   * `ajaxCall` — and the last definition is the one that runs. Retained because
   * "the constant is in `components.js`" is only true if nothing later replaces
   * the function that reads it, and that was an assumption, not a finding.
   */
  myscript: `${ECOURTS_BASE}/js/myscript.js`,
  home: `${ECOURTS_BASE}/js/home.js`,
} as const;

export type InterfaceAssetName = keyof typeof ECOURTS_INTERFACE_ASSETS;

/**
 * Fetch and retain one static asset of the licensed interface.
 *
 * Returns rather than throws on a non-2xx, because for a diagnostic the status
 * IS the finding: a 404 on a script the page references is a fact about the
 * interface, not a fault in us. The bytes are retained either way.
 */
export async function retainInterfaceAsset(
  sql: Db,
  asset: InterfaceAssetName,
  deps: FetchDeps & {
    session?: EcourtsSession | undefined;
    /**
     * The cache-busting query the page actually requests the asset with, e.g.
     * `v=1787920566` for `components.js`. Worth being able to send: a versioned
     * URL is the one the browser fetches, and "the unversioned path serves the
     * same bytes" is an assumption about the server's static handler, not a
     * fact about this one.
     */
    query?: string | undefined;
  } = {},
): Promise<
  | {
      refused: false;
      ok: boolean;
      status: number;
      contentType: string | null;
      bytes: Buffer;
      endpoint: string;
      artifactId?: string | undefined;
      fetchLedgerId: string;
    }
  | { refused: true; reason: string; endpoint: string; fetchLedgerId: string }
> {
  const at = deps.now ?? new Date();
  const listDate = at.toISOString().slice(0, 10);
  const endpoint = deps.query
    ? `${ECOURTS_INTERFACE_ASSETS[asset]}?${deps.query}`
    : ECOURTS_INTERFACE_ASSETS[asset];
  const source: CauseListSourceKey = {
    tier: 'interface_probe',
    probe: `interface_asset_${asset}`,
    listDate,
  };
  const result = await guardedRequest(sql, {
    court: ledgerCourt(source),
    endpoint,
    strategy: deps.strategy ?? 'CAUSE_LIST_BATCH',
    sourceKeyId: sourceKeyId(source),
    listDate,
    accept: 'application/javascript, text/javascript, */*',
    at,
    ...(deps.session === undefined ? {} : { session: deps.session }),
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  });

  if (result.refused) {
    return { refused: true, reason: result.reason, endpoint, fetchLedgerId: result.fetchLedgerId };
  }
  return {
    refused: false,
    ok: result.ok,
    status: result.status,
    contentType: result.contentType,
    bytes: result.body,
    endpoint,
    artifactId: result.artifactId,
    fetchLedgerId: result.fetchLedgerId,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DIMENSION CHAIN — how a request acquires the five codes it needs
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `cause-list-source-key.ts` says a district request needs state, district,
 * court complex, establishment and court. Only the state list ships with the
 * page; the rest are fetched one level at a time, and the endpoints below are
 * quoted from `common_header.js`, not guessed:
 *
 *   casestatus/fillDistrict    state_code                    -> dist_list
 *   casestatus/fillcomplex     state_code, dist_code         -> complex_list
 *   cause_list/fillCauseList   + complex, est                -> court list
 *   cause_list/submitCauseList + date, cicri, captcha        -> the listing
 *
 * **A court complex option encodes three fields, not one.** Its value is
 * `complex@establishment@flag`, split on `@` (`fillCauseList` in
 * `common_header.js`), and `flag === 'Y'` means the complex has separate
 * establishments and one must be chosen. Treating that value as an opaque
 * identifier is the mistake it is shaped to invite, and it would send a request
 * that names a court nobody can resolve.
 *
 * **`app_token` rotates on every reply.** `jsonCall` re-reads it from each
 * response (`components.js`), so a session that does not carry it forward gets
 * one request and then silent failures. It is threaded through every call here.
 */

/**
 * One field of an AJAX body, in the order the licensed client sends it.
 *
 * An ordered array rather than an object because ORDER is part of what the
 * recorder compares, and a `Record`'s order is an implementation detail nobody
 * should have to reason about when the comparison is byte-level.
 */
export type AjaxField = { name: string; value: string };

/**
 * Encode an AJAX body exactly as `ajaxCall` assembles one.
 *
 * `components.js`: `data: postdata + '&ajax_req=' + true + '&app_token=' + token`
 * — so both are appended, in that order, AFTER everything the caller built.
 *
 * **One deliberate difference: we percent-encode, the client concatenates.**
 * `submit_causelist` builds `"&court_name_txt=" + court_name_txt` with no
 * encoding, so a judge's name goes out with raw spaces and commas. We encode
 * with the same rules jQuery's own `serialize()` uses (space -> `+`), which
 * decodes to an identical value under standard form parsing and is not
 * malformed. The recorder's test compares DECODED name/value pairs for this
 * reason, and asserts the two decode alike.
 */
export function ajaxBody(fields: readonly AjaxField[], appToken: string): string {
  const params = new URLSearchParams();
  for (const f of fields) params.append(f.name, f.value);
  return `${params.toString()}&ajax_req=true&app_token=${appToken}`;
}

/** `casestatus/fillDistrict` — `common_header.js`, `fillDistrict`. */
export function fillDistrictFields(stateCode: string): AjaxField[] {
  return [{ name: 'state_code', value: stateCode }];
}

/** `casestatus/fillcomplex` — `common_header.js`, `fillCourtComplex`. */
export function fillComplexFields(stateCode: string, distCode: string): AjaxField[] {
  return [
    { name: 'state_code', value: stateCode },
    { name: 'dist_code', value: distCode },
  ];
}

/** `casestatus/fillCourtEstablishment` — `common_header.js`, `fillEst`. */
export function fillCourtEstablishmentFields(where: {
  stateCode: string;
  distCode: string;
  complexCode: string;
}): AjaxField[] {
  return [
    { name: 'state_code', value: where.stateCode },
    { name: 'dist_code', value: where.distCode },
    { name: 'court_complex_code', value: where.complexCode },
  ];
}

/**
 * `cause_list/fillCauseList` — `common_header.js`, `fillCauseList`.
 *
 * **`search_act` is sent, and its value is the literal string `undefined`.**
 * That is not a bug here; it is what the licensed client puts on the wire. The
 * cause-list page has no `#search_act` element, so `$("#search_act").val()`
 * answers `undefined` and the client's string concatenation renders it. We match
 * the client rather than "fix" it: a request that differs from the licensed
 * one — even in a way that looks tidier — is a request the registrar's logs
 * cannot recognise as ours behaving normally.
 */
export const ECOURTS_SEARCH_ACT_ABSENT = 'undefined';

export function fillCauseListFields(where: {
  stateCode: string;
  distCode: string;
  complexCode: string;
  establishmentCode: string;
}): AjaxField[] {
  return [
    { name: 'state_code', value: where.stateCode },
    { name: 'dist_code', value: where.distCode },
    { name: 'court_complex_code', value: where.complexCode },
    { name: 'est_code', value: where.establishmentCode },
    { name: 'search_act', value: ECOURTS_SEARCH_ACT_ABSENT },
  ];
}

/**
 * The value the establishment SELECT holds — which is what `submit_causelist`
 * posts as `est_code`, and it is NOT the complex value's second segment.
 *
 * `common_header.js` sets `$('#court_est_code').val('')` whenever the complex's
 * `differ_mast_est` flag is not `Y`, and only populates it (via `fillEst`) when
 * it is. `searchByCauselist.js` then reads that select unconditionally:
 *
 *     var est_code = $('#court_est_code').val();
 *
 * So on SUBMIT the establishment is empty unless the complex actually has
 * separate establishments — while `fillCauseList` in the same session sends the
 * complex's second segment in that same field when the flag is off. The two
 * differ on purpose, and sending the segment on submit is the mistake this
 * function exists to prevent.
 */
export function establishmentSelectValue(
  parts: CourtComplexParts,
  chosenEstablishment: string | null,
): string {
  return parts.requiresEstablishment ? (chosenEstablishment ?? '') : '';
}

/**
 * `selprevdays`, computed the way `searchByCauselist.js` computes it.
 *
 *     var seldate = new Date(y, m-1, d);                       // local midnight
 *     var daysdiff = Math.ceil(((today - seldate) / 86400000) - 1);
 *     selprevdays = daysdiff >= 1 ? 1 : 0;
 *
 * In effect: **1 when the requested list date is before today, 0 otherwise.**
 * It was hardcoded to `'0'` here with a comment claiming historical dates set
 * it — the comment was right and the code was not, which would have made every
 * retention probe a request the licensed client would never send.
 */
/**
 * IST, EXPLICITLY — not the server's local timezone.
 *
 * `new Date(y, m - 1, d)` builds midnight in whatever zone the PROCESS runs in,
 * and this value has to match what the licensed client computes in a browser in
 * India. On a workstation at UTC+04:00 the two agreed by luck; on a UTC host
 * they do not, and `selprevdays` for yesterday came out `0` where the client
 * sends `1`. Found 18 Sep 2026 by the first CI run on a UTC runner, against a
 * test whose own comments already said "today, IST".
 *
 * That is not a test-environment quirk. `official-client-recorder.test.ts`
 * asserts *our eCourts request equals the licensed client's*, and every hosting
 * provider under consideration runs UTC — so the deployed server would have sent
 * a combination the licensed client never sends. Under a bounded written
 * permission, looking like a different client is the kind of difference that
 * costs the permission, and any conclusion drawn from the reply would have been
 * about our bug rather than about the court.
 *
 * Both sides are now pinned to the same clock: the selected date is read as IST
 * midnight expressed as a UTC instant, and `now` is already absolute. The
 * result no longer depends on where the process happens to be running.
 */
const IST_OFFSET_MS = 5.5 * 3_600_000;

export function selPrevDays(causelistDate: string, now: Date = new Date()): '0' | '1' {
  const [d = '', m = '', y = ''] = causelistDate.split('-');
  const seldate = Date.UTC(Number(y), Number(m) - 1, Number(d)) - IST_OFFSET_MS;
  const daysdiff = Math.ceil((now.getTime() - seldate) / 86_400_000 - 1);
  return daysdiff >= 1 ? '1' : '0';
}

/**
 * `cause_list/submitCauseList` — `searchByCauselist.js`, `submit_causelist`.
 *
 * The first three fields are what `$("#frm_causelist").serialize()` yields, in
 * document order. **Only three**, because every other control on that page —
 * the cascading selects and all the hidden state — sits OUTSIDE
 * `<form id="frm_causelist">` and is therefore not a successful control. The
 * client appends the rest by hand, which is why its body looks half-built.
 */
export function submitCauseListFields(where: {
  courtNo: string;
  causelistDate: string;
  captchaCode: string;
  courtNameText: string;
  stateCode: string;
  distCode: string;
  complexCode: string;
  establishmentSelectValue: string;
  cicri: string;
  selprevdays: string;
}): AjaxField[] {
  return [
    // --- $("#frm_causelist").serialize(), in document order ---
    { name: 'CL_court_no', value: where.courtNo },
    { name: 'causelist_date', value: where.causelistDate },
    { name: 'cause_list_captcha_code', value: where.captchaCode },
    // --- appended by submit_causelist, in its order ---
    { name: 'court_name_txt', value: where.courtNameText },
    { name: 'state_code', value: where.stateCode },
    { name: 'dist_code', value: where.distCode },
    { name: 'court_complex_code', value: where.complexCode },
    { name: 'est_code', value: where.establishmentSelectValue },
    { name: 'cicri', value: where.cicri },
    { name: 'selprevdays', value: where.selprevdays },
  ];
}

/** One AJAX hop. Every one is a ledgered, rate-limited request like any other. */
async function postAjax(
  sql: Db,
  session: EcourtsSession,
  path: string,
  fields: readonly AjaxField[],
  probe: string,
  deps: FetchDeps = {},
): Promise<{
  json: Record<string, unknown>;
  artifactId?: string | undefined;
  fetchLedgerId: string;
}> {
  const at = deps.now ?? new Date();
  const listDate = at.toISOString().slice(0, 10);
  const source: CauseListSourceKey = { tier: 'interface_probe', probe, listDate };
  const body = ajaxBody(fields, session.appToken);

  const result = await guardedRequest(sql, {
    court: ledgerCourt(source),
    endpoint: `${ECOURTS_BASE}/?p=${path}`,
    strategy: deps.strategy ?? 'CAUSE_LIST_BATCH',
    sourceKeyId: sourceKeyId(source),
    listDate,
    method: 'POST',
    body,
    session,
    accept: 'application/json, text/javascript, */*',
    at,
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  });

  if (result.refused) throw new EcourtsSessionRefused(result.reason);
  if (!result.ok) throw new EcourtsSessionRefused(`http ${result.status} on ${path}`);

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(result.body.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new EcourtsSessionRefused(
      `${path} answered ${result.body.byteLength} bytes that are not JSON; the bytes are ` +
        'retained and this refuses rather than reading an error page as data',
    );
  }
  // Carry the rotated token. A session that drops it gets exactly one more
  // request and then unexplained failures.
  const rotated = json['app_token'];
  if (typeof rotated === 'string' && rotated.length > 0) session.appToken = rotated;

  return { json, artifactId: result.artifactId, fetchLedgerId: result.fetchLedgerId };
}

/**
 * `<option value=X>Label</option>` pairs, in document order.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUOTES ARE OPTIONAL, AND ASSUMING THEY WERE NOT COST A CANARY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This used to require `value=['"]...['"]`. The interface does not write them.
 * Measured against the retained response of 30 Aug 2026
 * (`__fixtures__/ecourts-fill-district-delhi-2026-08-30.json`):
 *
 *     <option value='' >Select district</option>
 *     <option value=8  >Central</option>
 *     <option value=3  >East</option>
 *
 * Only the PLACEHOLDER is quoted, and the placeholder is the one entry this
 * function filters out. So a response carrying eleven Delhi districts parsed to
 * ZERO, and the canary reported `no district (0 offered)` — which reads exactly
 * like an empty upstream answer and is not one.
 *
 * That is the failure mode this codebase already has a rule about:
 * `PARSE_EMPTY != NO_CASES`. A parser that silently returns nothing from a
 * populated document is worse than one that throws, because the caller records
 * an observation of absence.
 *
 * Unquoted values are HTML5-legal and are what the source sends, so all three
 * forms are accepted and the value is taken from whichever alternative matched.
 */
export function optionsOf(html: string): { value: string; label: string }[] {
  return [
    ...html.matchAll(
      /<option[^>]*\svalue=(?:'([^']*)'|"([^"]*)"|([^\s>]*))[^>]*>([\s\S]*?)<\/option>/gi,
    ),
  ]
    .map((m) => ({
      value: (m[1] ?? m[2] ?? m[3] ?? '').trim(),
      label: (m[4] ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((o) => o.value !== '' && o.value !== '0');
}

export type NamedCode = { value: string; label: string };

/**
 * `optionsOf` under the name the tests use, so a test never reaches for an
 * unexported symbol and the export exists for a stated reason.
 */
export const parseDistrictOptions = optionsOf;

export async function listDistricts(
  sql: Db,
  session: EcourtsSession,
  stateCode: string,
  deps: FetchDeps = {},
): Promise<NamedCode[]> {
  const { json } = await postAjax(
    sql,
    session,
    'casestatus/fillDistrict',
    fillDistrictFields(stateCode),
    'fill_district',
    deps,
  );
  return optionsOf(String(json['dist_list'] ?? ''));
}

/**
 * Court complexes for a district.
 *
 * The `value` is `complex@establishment@flag` — see the header. It is returned
 * whole rather than pre-split, because `submitCauseList` needs the complex half
 * and `fillCauseList` needs the flag, and splitting it in two places is how the
 * two would drift.
 */
export async function listCourtComplexes(
  sql: Db,
  session: EcourtsSession,
  stateCode: string,
  distCode: string,
  deps: FetchDeps = {},
): Promise<NamedCode[]> {
  const { json } = await postAjax(
    sql,
    session,
    'casestatus/fillcomplex',
    fillComplexFields(stateCode, distCode),
    'fill_complex',
    deps,
  );
  return optionsOf(String(json['complex_list'] ?? ''));
}

export type CourtComplexParts = {
  complexCode: string;
  establishmentCode: string;
  /** `Y` when the complex has separate establishments and one must be chosen. */
  requiresEstablishment: boolean;
};

export function splitComplexValue(value: string): CourtComplexParts {
  const [complexCode = '', establishmentCode = '', flag = ''] = value.split('@');
  return {
    complexCode,
    establishmentCode,
    requiresEstablishment: flag.toUpperCase() === 'Y',
  };
}

/**
 * The establishments inside one court complex — the `court_est_code` options.
 *
 * Only meaningful when the complex's `differ_mast_est` flag is `Y`
 * (`splitComplexValue(...).requiresEstablishment`). `common_header.js` calls
 * `fillEst` exactly then, and leaves the select empty otherwise.
 */
export async function listCourtEstablishments(
  sql: Db,
  session: EcourtsSession,
  where: { stateCode: string; distCode: string; complexCode: string },
  deps: FetchDeps = {},
): Promise<NamedCode[]> {
  const { json } = await postAjax(
    sql,
    session,
    'casestatus/fillCourtEstablishment',
    fillCourtEstablishmentFields(where),
    'fill_court_establishment',
    deps,
  );
  return optionsOf(String(json['establishment_list'] ?? ''));
}

/**
 * The courts sitting in one establishment — the `CL_court_no` options.
 *
 * `establishmentCode` is the value `fillCauseList` sends, which for a complex
 * WITHOUT separate establishments is the complex value's second `@` segment and
 * for one WITH them is the chosen establishment. That is not the same value
 * `submitCauseList` posts — see {@link establishmentSelectValue}.
 */
export async function listCauseListCourts(
  sql: Db,
  session: EcourtsSession,
  where: { stateCode: string; distCode: string; complexCode: string; establishmentCode: string },
  deps: FetchDeps = {},
): Promise<NamedCode[]> {
  const { json } = await postAjax(
    sql,
    session,
    'cause_list/fillCauseList',
    fillCauseListFields(where),
    'fill_cause_list_courts',
    deps,
  );
  /**
   * `cause_list` FIRST, and that is now read from bytes rather than guessed:
   * `common_header.js` does `$('#CL_court_no').html(obj.cause_list)`. The four
   * names that stood here were all wrong, so this call would have thrown on a
   * perfectly good reply and reported it as an interface change. The others are
   * kept as fallbacks because other eCourts modules do name it differently, and
   * a refusal is still better than an empty court list read as "no courts".
   */
  for (const key of ['cause_list', 'court_list', 'causelist_court', 'court_no', 'data']) {
    const candidate = String(json[key] ?? '');
    if (candidate.includes('<option')) return optionsOf(candidate);
  }
  throw new EcourtsSessionRefused(
    `cause_list/fillCauseList returned no option markup in any known field (${Object.keys(json).join(', ')}); ` +
      'returning an empty court list here would read as an establishment with no courts',
  );
}

/**
 * The cause list itself.
 *
 * `cicri` is the civil/criminal flag the two buttons set, and it is part of the
 * request identity rather than a filter applied afterwards — one establishment
 * on one date is TWO requests, which is why `ListType` is on the source key and
 * why the quota plan divides by it.
 *
 * The reply is JSON. `status: 0` means the CAPTCHA was rejected and a fresh one
 * is enclosed; `status: 1` carries the listing HTML in `case_data`. Both arrive
 * as HTTP 200, so this field is the only thing separating "we could not get in"
 * from "the court listed nothing" — and conflating those is precisely the
 * failure the whole pipeline is built to prevent.
 */
type SubmitEvidence = { artifactId?: string | undefined; fetchLedgerId: string };
export type SubmitCauseListResult =
  | ({ status: 'ok'; caseDataHtml: string } & SubmitEvidence)
  | ({ status: 'captcha_rejected' } & SubmitEvidence)
  | ({ status: 'unexpected'; raw: string } & SubmitEvidence);

export async function submitCauseList(
  sql: Db,
  session: EcourtsSession,
  where: {
    stateCode: string;
    distCode: string;
    complexCode: string;
    /**
     * The value of the ESTABLISHMENT SELECT — `''` unless the complex declares
     * separate establishments. Build it with {@link establishmentSelectValue};
     * it is deliberately NOT the complex value's second `@` segment, which is
     * what `fillCauseList` sends and what this used to send by mistake.
     */
    establishmentSelectValue: string;
    courtNo: string;
    /** The visible text of the chosen `CL_court_no` option — `court_name_txt`. */
    courtNameText: string;
    /** `dd-mm-yyyy`, the format the form's own date field uses. */
    causelistDate: string;
    /** `0` civil, `1` criminal — the two buttons in the licensed interface. */
    cicri: string;
  },
  captchaCode: string,
  deps: FetchDeps = {},
): Promise<SubmitCauseListResult> {
  const { json, artifactId, fetchLedgerId } = await postAjax(
    sql,
    session,
    'cause_list/submitCauseList',
    submitCauseListFields({
      courtNo: where.courtNo,
      causelistDate: where.causelistDate,
      captchaCode,
      courtNameText: where.courtNameText,
      stateCode: where.stateCode,
      distCode: where.distCode,
      complexCode: where.complexCode,
      establishmentSelectValue: where.establishmentSelectValue,
      cicri: where.cicri,
      // Computed the way the client computes it. It was hardcoded '0', which
      // would have made every historical request one the client never sends.
      selprevdays: selPrevDays(where.causelistDate, deps.now ?? new Date()),
    }),
    'submit_cause_list',
    deps,
  );

  const status = json['status'];
  if (status === 1 || status === '1') {
    return {
      status: 'ok',
      caseDataHtml: String(json['case_data'] ?? ''),
      artifactId,
      fetchLedgerId,
    };
  }
  if (status === 0 || status === '0') {
    return { status: 'captcha_rejected', artifactId, fetchLedgerId };
  }
  return {
    status: 'unexpected',
    raw: JSON.stringify(json).slice(0, 400),
    artifactId,
    fetchLedgerId,
  };
}
