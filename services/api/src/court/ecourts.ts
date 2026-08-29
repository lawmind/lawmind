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
 * The constant the licensed client puts in its `delimeter` and `Kjweuru253`
 * request headers — `components.js`, `ajaxCall`. Every AJAX endpoint checks it.
 */
const ECOURTS_AJAX_DELIMETER = 'jkhfkjhkjert33';

export type EcourtsSession = {
  /** `SERVICES_SESSID` and friends, already folded into a Cookie header. */
  cookieHeader: string;
  /** One-shot CSRF token. Rotates on every reply; the caller must carry it. */
  appToken: string;
  /** The CAPTCHA image for THIS session, absolute. */
  captchaUrl: string;
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
      // Read live and rendered into header-legal bytes. The grant requires
      // attribution on EVERY request, the CAPTCHA image fetch included.
      'user-agent': attributionForWire()!,
      accept: request.accept ?? '*/*',
    };
    if (request.session) headers['cookie'] = request.session.cookieHeader;
    if (request.method === 'POST') {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      headers['x-requested-with'] = 'XMLHttpRequest';
      headers['referer'] = `${ECOURTS_BASE}/?p=cause_list/index`;
      /**
       * The two headers `ajaxCall` sends on every request (`components.js`,
       * where `delimeter` is declared at the top of the function and set on
       * both `delimeter` and `Kjweuru253`).
       *
       * They are not decoration: without them the endpoint answers
       * `{"errormsg":"...Invalid Request...!"}` with an empty `app_token`, which
       * is what the first attempt here got. Transcribed from the source rather
       * than guessed, and named as what they are — a constant the licensed
       * client sends — so nobody later mistakes them for a secret of ours.
       */
      headers['delimeter'] = ECOURTS_AJAX_DELIMETER;
      headers['Kjweuru253'] = ECOURTS_AJAX_DELIMETER;
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
      reason: error instanceof Error ? error.message : String(error),
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

  return {
    refused: false,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    body,
    setCookie: response.headers.getSetCookie?.() ?? [],
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

  return {
    session: {
      cookieHeader: cookieHeaderFrom(result.setCookie),
      appToken,
      captchaUrl: absoluteCaptchaUrl(captchaSrc),
    },
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

/** One AJAX hop. Every one is a ledgered, rate-limited request like any other. */
async function postAjax(
  sql: Db,
  session: EcourtsSession,
  path: string,
  params: Record<string, string>,
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
  const body = `${new URLSearchParams(params).toString()}&ajax_req=true&app_token=${session.appToken}`;

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

/** `<option value="X">Label</option>` pairs, in document order. */
function optionsOf(html: string): { value: string; label: string }[] {
  return [...html.matchAll(/<option[^>]*\svalue=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/option>/gi)]
    .map((m) => ({
      value: m[1]!.trim(),
      label: m[2]!
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((o) => o.value !== '' && o.value !== '0');
}

export type NamedCode = { value: string; label: string };

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
    { state_code: stateCode },
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
    { state_code: stateCode, dist_code: distCode },
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

/** The courts sitting in one establishment — the `CL_court_no` options. */
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
    {
      state_code: where.stateCode,
      dist_code: where.distCode,
      court_complex_code: where.complexCode,
      est_code: where.establishmentCode,
    },
    'fill_cause_list_courts',
    deps,
  );
  // The reply names its own field inconsistently across eCourts modules, so
  // take whichever of the known keys carries option markup rather than assuming
  // one — and refuse if none does, instead of returning an empty court list that
  // would read as "this establishment has no courts".
  for (const key of ['court_list', 'causelist_court', 'court_no', 'data']) {
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
    establishmentCode: string;
    courtNo: string;
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
    {
      causelist_date: where.causelistDate,
      cause_list_captcha_code: captchaCode,
      CL_court_no: where.courtNo,
      state_code: where.stateCode,
      dist_code: where.distCode,
      court_complex_code: where.complexCode,
      est_code: where.establishmentCode,
      cicri: where.cicri,
      // `searchByCauselist.js` computes this from the requested date. Historical
      // dates set it; today's does not.
      selprevdays: '0',
    },
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
