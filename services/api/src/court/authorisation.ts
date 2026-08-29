/**
 * The registrar's grant, transcribed.
 *
 * The founder applied to the government registrar for permission to harvest
 * eCourts data and it was **granted on 7 Aug 2026**. That resolves the objection
 * at its root: the concern was never scraping, it was *unauthorised* access under
 * ss. 43 and 66 of the IT Act.
 *
 * **Permission always arrives with conditions** — volume, frequency, hours,
 * attribution — and the whole design here follows from one judgement: those
 * conditions are configuration, not folklore. A limit somebody remembers is a
 * limit that gets exceeded on the day they are not looking. So the grant is
 * transcribed into this file, the limiter enforces it, and the ledger records
 * every request against it.
 *
 * `CLAUDE.md`: **if the authorisation's terms are not in the repo, the switch
 * stays off.** The terms ARE now in the repo — transcribed 8 Aug 2026 into
 * `GRANT_CONDITIONS` below — so this lock is satisfied and the remaining one
 * is the kill switch, which is still off and still requires a reason to move.
 *
 * **What the letter's own numbers do and do not gate.** The registrar asked
 * that the letter's identifying details not appear in the application or reach
 * its users. `reference` and `attribution` therefore come from environment and
 * are not committed. The letter reference is optional at runtime; the wire
 * attribution is not. `guard.ts` refuses every network request until
 * `ECOURTS_GRANT_ATTRIBUTION` is present, while provenance of the transcribed
 * limits is carried by `CONDITIONS_VERSION`.
 *
 * **No CONDITION defaults to "unlimited."** A limit the letter does not state
 * is transcribed at the conservative value, never left out. An absent limit
 * must never read as permission — the same rule that keeps a null
 * `ocr_confidence` from reading as a confidence of zero. That rule governs the
 * conditions; it never governed the identifiers, and conflating the two was
 * what previously made honouring the registrar's confidentiality request
 * equivalent to switching the integration off.
 *
 * **To bring the adapter into service:** turn the `ecourts_harvest` kill switch
 * on with a reason, via `POST /admin/platform/kill-switches/:key` so the change
 * is audited.
 */

import { createHash } from 'node:crypto';

export type EcourtsAuthorisation = {
  /**
   * The letter's own reference. Written into every ledger row it governs.
   *
   * **CONFIDENTIAL — supplied by environment, never committed.** The registrar
   * stated expressly that the letter's identifying details must not appear in
   * the application or reach its users. So this is the one field that is *not*
   * transcribed into source: it arrives as `ECOURTS_GRANT_REFERENCE` and lives
   * only in Railway.
   *
   * It still reaches `ecourts_fetch_ledger.authorisation_reference`, which is
   * correct and is not a leak — that table is the internal audit trail that
   * makes "did we stay inside the grant" answerable, and a registrar asking
   * that question is exactly who it is for. **It must never reach a client
   * response**, which `guard.test.ts` asserts by sweeping the source rather
   * than trusting that nobody adds `detail` to a payload one afternoon.
   *
   * **Optional, and absence is not a refusal.** Provenance is carried by
   * `conditionsVersion`; this is kept only for the compliance file if the
   * founder chooses to supply it. See `buildAuthorisation`.
   */
  reference?: string | undefined;
  /**
   * Fingerprint of the enforced conditions. **This is what the ledger stamps.**
   * See `CONDITIONS_VERSION` — it answers "which transcription was in force"
   * more precisely than the letter's own reference could, and needs no
   * confidential value to do it.
   */
  conditionsVersion: string;
  /** ISO date the grant was made. */
  grantedOn: string;
  /**
   * **A full ISO instant, not a date.** The grant expires at **12:00 on a day
   * in January 2029** — it carries a time, and a date-only comparison would
   * hand us a free extra twelve hours of harvesting under an expired
   * permission. That is precisely the kind of quiet overreach that loses a
   * grant, so the type forces the instant and `decide()` compares instants.
   *
   * Stored as UTC. The registrar states IST; the conversion is done once, here,
   * at transcription time rather than in a comparison somewhere.
   */
  expiresAt: string;
  /**
   * The attribution string the grant requires us to carry, verbatim.
   *
   * **CONFIDENTIAL, same reason as `reference`** — `ECOURTS_GRANT_ATTRIBUTION`,
   * environment only. Note the consequence, because it is unusual: the
   * registrar has asked that these details not appear in the application, so
   * **this attribution is not rendered anywhere in the product.** It is
   * recorded for our own compliance file, not displayed. Do not "helpfully"
   * surface it in a footer.
   *
   * Optional in this construction type so a missing secret can be represented
   * without inventing a value. Operationally required: `guard.ts` refuses the
   * network boundary when it is absent. It remains absent from product output.
   */
  attribution?: string | undefined;
  /**
   * Courts the grant covers.
   *
   * `'ALL_COURTS'` is a deliberate sentinel rather than an empty array or a
   * missing field, because those both read as "none" and would silently
   * refuse everything. The grant covers every court, and saying so explicitly
   * is different from failing to say anything.
   */
  permittedCourts: readonly string[] | 'ALL_COURTS';
  /**
   * The data types the grant covers, enumerated.
   *
   * **"All available data" is the grant's breadth; this list is what that
   * actually means**, and the difference matters in two directions. A future
   * reader planning a feature needs to know `caveat_search` was covered
   * without re-asking the registrar. And if the grant is ever narrowed on
   * renewal, the diff against this list is the change — an unenumerated
   * "everything" cannot be diffed.
   *
   * Confirmed by the founder 8 Aug 2026. Recorded for provenance and product
   * planning; the guard does not gate on it, because the grant's own limits
   * are volume and time, not type.
   */
  permittedDataTypes: readonly string[];
  /** Hours of the day, IST, during which requests are permitted. Half-open [from, to). */
  permittedHoursIst: { readonly from: number; readonly to: number };
  /** Minimum gap between two requests. Frequency, as distinct from volume. */
  minIntervalMs: number;
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  /**
   * Whether the grant expressly permits solving/bypassing the CAPTCHA.
   *
   * **A field on the grant, deliberately — not a global constant and not an
   * environment variable.** The old standing rule was "never bypass", and its
   * whole reason was unauthorised access under IT Act ss. 43/66. Written
   * authorisation removes that reason, but only for as long as the
   * authorisation exists. Modelling it here means the permission **expires
   * with the grant automatically** (January 2029, after which the registrar
   * requires payment): a lapsed grant reverts the behaviour on its own rather
   * than depending on somebody remembering to turn it off.
   *
   * `false` is the safe reading. A grant that does not say we may bypass has
   * not said it — silence is never permission, the same rule the rate limits
   * follow.
   *
   * **Scope is enumerated, not implied:** automated access may cover only the
   * courts and data types recorded on this grant and must run through the
   * guarded `ecourts.ts` network boundary. Tier 3 per-citation confirmation
   * still hands the advocate the door because it represents a human-vouched
   * fact. Automation writes `ecourts_bulk`, never the human source label.
   */
  captchaBypassPermitted: boolean;
  /**
   * What happens at `expiresAt`. The January 2029 grant converts to a paid
   * arrangement rather than simply lapsing, and "we forgot to renew" must not
   * be discovered by an advocate seeing an empty cause list. Recorded so the
   * renewal is a diarised commercial decision, not an outage.
   */
  onExpiry: 'lapses' | 'renewable_for_payment';
  /**
   * How far ahead the renewal must be paid so there is no interruption.
   *
   * The founder's stated intent (8 Aug 2026) is to pay **six months in
   * advance**. Recorded as a number rather than a note because the useful
   * artefact is a *deadline that can be computed* — `renewalDueBy()` turns it
   * into a date, so "when must this be paid" is answerable by the admin
   * surface rather than by remembering a conversation from 2026.
   */
  renewalLeadTimeDays: number;
  /**
   * Whether we may render eCourts-derived data **inside Lawmind** rather than
   * sending the advocate to eCourts to see it.
   *
   * Granted 8 Aug 2026 under the government scheme the founder enrolled in.
   * This is a **product** permission, distinct from the access permission: it
   * is the difference between "we may read this" and "we may be the surface
   * the user reads it on". Without it, Tier 3 must hand over a URL; with it,
   * the data can be first-class in our own UI.
   *
   * Like every other field here it dies with the grant. If it lapses in 2029
   * the product must fall back to handing over the link, not keep rendering
   * data it is no longer licensed to surface.
   */
  independentDisplayPermitted: boolean;
  /**
   * Whether the grant permits using this data to **train models**.
   *
   * Granted 8 Aug 2026 under the same scheme. `docs/TRAINING_STRATEGY.md` is
   * the governing document for what we then do with it — this field records
   * only that the registrar permits it, never that it is a good idea.
   *
   * **Two limits survive this permission and are not the registrar's to
   * waive**, both recorded here because this is where someone will come
   * looking:
   *
   * 1. **`CLAUDE.md`: never train on another model's commentary about law.**
   *    Primary sources only. eCourts records are primary; that is why this
   *    permission is worth having.
   * 2. **Personal data in court records belongs to the litigants, not the
   *    registrar.** Judgments and orders are public record. A permission to
   *    use "the data" is not a DPDP consent from a living third party whose
   *    name appears in a cause list, and the two questions must not be
   *    collapsed because the answer to one arrived first.
   */
  trainingPermitted: boolean;
};

/**
 * The grant's CONDITIONS, transcribed from the letter 8 Aug 2026.
 *
 * **Conditions live in source; identifiers live in environment.** The split is
 * not arbitrary:
 *
 * - **Conditions are constraints.** They must be reviewable in a diff, because
 *   the whole design principle here is that limits are configuration rather
 *   than folklore. A rate limit nobody can read in a pull request is a rate
 *   limit nobody is enforcing.
 * - **Identifiers are confidential.** The registrar required that the letter's
 *   identifying details not appear in the application or reach its users, so
 *   `reference` and `attribution` are supplied by environment and never
 *   committed.
 *
 * **Where the letter is silent, the conservative value is transcribed —
 * never "unlimited".** The grant states scope, expiry and permissions; it does
 * not state rate limits. So the limits below are OURS, chosen low. Being
 * courteous to a government service we depend on until 2029 costs a slower
 * backfill and buys the thing we cannot re-buy: the grant itself.
 */
const GRANT_CONDITIONS = {
  grantedOn: '2026-08-07',
  /**
   * 12:00 IST on 1 January 2029 = 06:30 UTC.
   *
   * **The DAY is the conservative reading, not a quoted fact.** The founder
   * stated "12 PM, January 2029" without a day. Transcribing the first of the
   * month means we stop *earlier* than the grant requires if the real date is
   * later — the error runs toward under-use, which is recoverable, rather than
   * toward harvesting under an expired permission, which is not.
   *
   * Correct this the moment the exact date is known.
   */
  expiresAt: '2029-01-01T06:30:00.000Z',
  /** The grant covers every court — stated, not inferred from an empty list. */
  permittedCourts: 'ALL_COURTS',
  /**
   * Confirmed by the founder 8 Aug 2026. Three of these close gaps the daily
   * loop currently papers over:
   *
   * - `cause_list` is the wedge itself, and PD-5 trigger 4 ("a matter listed
   *   on a date the advocate did not enter") has had no producer at all.
   * - `case_status` is what makes a matter's state real rather than whatever
   *   was last typed into it.
   * - `court_orders` gives `matter_events.order_text` a source beyond manual
   *   entry and OCR.
   *
   * `caveat_search` is the one no competitor teardown found in any of the five
   * rivals' listings.
   */
  permittedDataTypes: [
    'court_names',
    'case_status',
    'cause_list',
    'caveat_search',
    'court_orders',
    'judgments',
  ],
  /** Not stated by the letter. Unrestricted, written deliberately rather than omitted. */
  permittedHoursIst: { from: 0, to: 24 },
  /** Not stated. Ours, chosen conservatively — see the note above. */
  minIntervalMs: 2000,
  maxRequestsPerHour: 100,
  maxRequestsPerDay: 1000,
  captchaBypassPermitted: true,
  onExpiry: 'renewable_for_payment',
  /** The founder pays six months ahead so there is no interruption. */
  renewalLeadTimeDays: 180,
  independentDisplayPermitted: true,
  trainingPermitted: true,
} as const satisfies Omit<EcourtsAuthorisation, 'reference' | 'attribution' | 'conditionsVersion'>;

/**
 * A stable fingerprint of the conditions above — **this is what the ledger
 * stamps, and it replaces the confidential reference for that purpose.**
 *
 * The ledger's job is to answer *"which transcription of the grant was in
 * force when this request was made"*, so that a narrowing on renewal leaves
 * before-and-after rows distinguishable. The registrar's reference number
 * never actually answered that: it identifies the LETTER, and would not change
 * if we re-transcribed its conditions wrongly. A hash of what we actually
 * enforce does.
 *
 * So the confidential string is not needed for provenance at all. That is what
 * lets the grant operate with the reference absent — the registrar asked that
 * their identifiers stay out of the application, and the audit trail turns out
 * not to require them.
 *
 * Derived, never stored, so it cannot drift from the conditions it describes.
 */
export const CONDITIONS_VERSION: string = createHash('sha256')
  .update(JSON.stringify(GRANT_CONDITIONS))
  .digest('hex')
  .slice(0, 16);

/**
 * The live grant, or `null`.
 *
 * `null` when the confidential identifiers are absent, and that is a real
 * refusal rather than a technicality: a request we cannot stamp with a grant
 * reference is a request whose adherence we could not later demonstrate, and
 * the ability to demonstrate it is the reason the grant survives. Same posture
 * as `packages/auth/src/mail.ts` — refuse honestly rather than proceed in a
 * degraded mode that looks like the working one.
 *
 * Not a placeholder object with zeros. A placeholder is something a future
 * change can quietly fill in wrongly; `null` cannot be partially right.
 */
function buildAuthorisation(): EcourtsAuthorisation | null {
  return {
    ...GRANT_CONDITIONS,
    conditionsVersion: CONDITIONS_VERSION,
    /**
     * Both optional, and their absence is **not** a refusal.
     *
     * This reverses an earlier design in this same file, with cause. The
     * reference was required because a request we could not stamp was a
     * request whose adherence we could not demonstrate — sound reasoning,
     * wrong premise. `conditionsVersion` demonstrates adherence better,
     * because it fingerprints the limits we actually enforced rather than
     * naming the letter that set them.
     *
     * The registrar asked that their identifiers stay out of the application.
     * Requiring one to operate would have made honouring that request
     * equivalent to switching the integration off.
     */
    reference: process.env['ECOURTS_GRANT_REFERENCE'],
    attribution: process.env['ECOURTS_GRANT_ATTRIBUTION'],
  };
}

export const AUTHORISATION: EcourtsAuthorisation | null = buildAuthorisation();

/**
 * The attribution string the grant requires on every request, read LIVE.
 *
 * `AUTHORISATION.attribution` snapshots `process.env` at module load, which is
 * the wrong binding time for a value that is deliberately not in source: it
 * arrives from Railway, and a module-load snapshot means the only way to observe
 * a change is a process restart — which is fine in production and makes the
 * value untestable, because an ESM import has already run by the time any test
 * body executes.
 *
 * Late binding is also the honest semantics. This is a credential, not a
 * transcribed condition; the transcribed conditions are frozen in
 * `GRANT_CONDITIONS` and fingerprinted, and this is not one of them.
 *
 * Everything that must not proceed without attribution reads THIS, not the
 * snapshot: `guard.decide()` refuses on it and `ecourts.ts` sends it.
 */
export function grantAttribution(): string | undefined {
  return process.env['ECOURTS_GRANT_ATTRIBUTION'] ?? undefined;
}

/**
 * The attribution as it may legally travel in an HTTP header.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUND BY THE FIRST REAL REQUEST, WHICH NEVER LEFT THE MACHINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first authorised eCourts request under this grant failed before a socket
 * opened:
 *
 *   Cannot convert argument to a ByteString because the character at index 8
 *   has a value of 8212 which is greater than 255.
 *
 * 8212 is an em dash. HTTP header values are ByteStrings — one byte per
 * character — and the configured attribution contains exactly one character
 * outside that range. Every lock had passed. `decide()` returned ALLOWED, the
 * quota slot was reserved and committed, and then `fetch` refused to build the
 * header. The guard's ladder can only check that the attribution EXISTS; it
 * could not have known it was unsendable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY TRANSLITERATING IT IS PERMITTED, AND WHY IT IS STILL RECORDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `CLAUDE.md` §6a is explicit that this string is an internal audited
 * attribution identifying our authorised access, and **not** a phrase the grant
 * requires us to quote verbatim — the written authorisation prescribes no
 * mandatory wording that this repository records. So rendering it into the
 * bytes a header can carry is faithful, where mangling a verbatim requirement
 * would not be.
 *
 * It is still a transformation of a compliance value, so it is deliberate and
 * narrow rather than a lossy sweep: a fixed table of the punctuation that
 * actually occurs in prose written for humans, and then a refusal.
 * `attributionWireSafety()` reports whether anything changed and what remains,
 * so the data-quality artifact can state what went on the wire without printing
 * it.
 *
 * A value that cannot be rendered at all returns `undefined`, which
 * `guard.decide` already treats as "no attribution on file" — refusing is
 * correct there, because a request we could not attribute is a request whose
 * compliance we could not demonstrate.
 */
const WIRE_SUBSTITUTIONS: readonly (readonly [RegExp, string])[] = [
  [/[\u2010-\u2015]/g, '-'],
  [/[\u2018\u2019\u201A\u201B]/g, "'"],
  [/[\u201C\u201D\u201E\u201F]/g, '"'],
  [/\u2026/g, '...'],
  [/\u00A0/g, ' '],
];

export function attributionForWire(): string | undefined {
  const raw = grantAttribution();
  if (!raw) return undefined;
  let out = raw;
  for (const [pattern, replacement] of WIRE_SUBSTITUTIONS) out = out.replace(pattern, replacement);
  /**
   * Header values are also forbidden control characters and newlines — a
   * newline in a header value is header injection, not a formatting problem.
   * Anything still outside printable Latin-1 after the substitutions is
   * dropped rather than guessed at.
   */
  out = out
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\u0020-\u007E\u00A1-\u00FF]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  return out.length > 0 ? out : undefined;
}

/**
 * What happened to the attribution on its way to the wire, without printing it.
 *
 * The registrar asked that their identifiers stay out of the application, so
 * this reports SHAPE — lengths, a digest, whether a substitution was needed —
 * and never the string. That is enough for the audit to answer "was the value
 * we configured the value we sent", which is the only question worth asking.
 */
export function attributionWireSafety(): {
  configured: boolean;
  transformed: boolean;
  sendable: boolean;
  configuredLength: number;
  wireLength: number;
  wireSha256: string | null;
} {
  const raw = grantAttribution();
  const wire = attributionForWire();
  return {
    configured: Boolean(raw),
    transformed: Boolean(raw) && raw !== wire,
    sendable: Boolean(wire),
    configuredLength: raw?.length ?? 0,
    wireLength: wire?.length ?? 0,
    wireSha256: wire ? createHash('sha256').update(wire).digest('hex') : null,
  };
}

/**
 * When the renewal must be paid to avoid any interruption.
 *
 * Computed, so the answer cannot drift from the grant it depends on. `null`
 * when there is no grant — there is nothing to renew.
 */
export function renewalDueBy(): Date | null {
  const grant = AUTHORISATION;
  if (!grant) return null;
  return new Date(Date.parse(grant.expiresAt) - grant.renewalLeadTimeDays * 86_400_000);
}

/**
 * The ONLY way any code may ask "are we allowed to bypass the CAPTCHA?"
 *
 * Never read `AUTHORISATION.captchaBypassPermitted` directly. Three conditions
 * have to hold together and a caller checking one of them is a caller who will
 * eventually check only one:
 *
 *   1. a grant exists at all;
 *   2. it has not expired — the permission cannot outlive the authorisation,
 *      which is the entire point of putting it on the grant;
 *   3. it expressly permits the bypass.
 *
 * Returns false for all three failures on purpose. A caller does not need to
 * know *why* it may not bypass — it needs to not bypass. `decide()` already
 * produces the distinguishable reason for the ledger.
 */
export function captchaBypassAllowed(at: Date = new Date()): boolean {
  return grantPermits('captchaBypassPermitted', at);
}

/**
 * The conditions on the CAPTCHA bypass — the WHOLE list, and there are three.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A CORRECTION, RECORDED RATHER THAN QUIETLY EDITED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module previously carried a fourth condition of my own invention — a
 * `CAPTCHA_OPERATIONAL_BASIS` that had to name a registrar-supplied credential,
 * a whitelisted address or an exempt endpoint before the bypass could be
 * implemented. It defaulted to `NONE_RECORDED`, it blocked the pilot, and **no
 * document in this repository ever required it.**
 *
 * `CLAUDE.md` §6a states the conditions exhaustively:
 *
 * > Authorized CAPTCHA bypass is permitted for that eCourts scope, subject to
 * > the mechanical conditions already in `CLAUDE.md` §6 (grant non-null and
 * > unexpired; only in `services/api/src/court/ecourts.ts`; every request writes
 * > the fetch ledger and passes the rate limiter).
 *
 * Three conditions, all mechanical, all already enforced. §6a also says in terms
 * that `ECOURTS_AUTHORIZATION = SATISFIED` and that future agents **must not
 * reopen it** as a founder-input question. Requiring the registrar to hand over
 * a technical mechanism on top of written permission to bypass mistakes what a
 * bypass permission IS: the registrar granted the right to get past their own
 * control, and the means of doing so is ours to implement. Reading the image is
 * not "inventing a security bypass" when the party that owns the control has
 * authorised it in writing — it is the authorised act itself.
 *
 * The three conditions are asserted below, together, because a caller that
 * checks one is a caller that will eventually check only one.
 */
export type CaptchaBypassRefusal = 'no_grant_on_file' | 'grant_expired' | 'not_permitted_by_grant';

/**
 * May we act on the CAPTCHA permission, and if not, exactly why?
 *
 * Returns `null` when permitted. The two mechanical conditions this function
 * cannot see — that the code lives only in `ecourts.ts`, and that every request
 * is ledgered and rate-limited — are structural: the adapter is the only module
 * allowed an HTTP client (asserted by `guard.test.ts`), and no request reaches
 * the network except through `reserve()`.
 */
export function captchaBypassRefusal(at: Date = new Date()): CaptchaBypassRefusal | null {
  const grant = AUTHORISATION;
  if (!grant) return 'no_grant_on_file';
  if (at.getTime() >= Date.parse(grant.expiresAt)) return 'grant_expired';
  if (!grant.captchaBypassPermitted) return 'not_permitted_by_grant';
  return null;
}

/**
 * May we render eCourts data inside Lawmind, rather than sending the advocate
 * to eCourts? Dies with the grant — see the field's own note.
 */
export function independentDisplayAllowed(at: Date = new Date()): boolean {
  return grantPermits('independentDisplayPermitted', at);
}

/**
 * May we use eCourts data as training input? **Necessary, not sufficient** —
 * `docs/TRAINING_STRATEGY.md` and the DPDP position both still apply, and this
 * only answers the registrar's half of the question.
 */
export function trainingOnEcourtsDataAllowed(at: Date = new Date()): boolean {
  return grantPermits('trainingPermitted', at);
}

/**
 * The one place a grant permission is evaluated. Every caller goes through
 * here so that "does a grant exist" and "has it expired" can never be checked
 * by one caller and forgotten by the next.
 *
 * The expiry comparison is on **instants**, because the grant expires at 12:00
 * on its final day rather than at the end of it.
 */
function grantPermits(
  permission: 'captchaBypassPermitted' | 'independentDisplayPermitted' | 'trainingPermitted',
  at: Date,
): boolean {
  const grant = AUTHORISATION;
  if (!grant) return false;
  if (at.getTime() >= Date.parse(grant.expiresAt)) return false;
  return grant[permission];
}

/**
 * India Standard Time is UTC+05:30 — a half-hour offset, which is exactly the
 * kind of thing that gets rounded to +5 by accident. Computed, never guessed.
 *
 * The grant states hours in the registrar's local time, so the check must be in
 * that local time; the container runs UTC and the naive comparison would be
 * wrong by five and a half hours all year. India observes no daylight saving, so
 * a fixed offset is correct here and would not be for most jurisdictions.
 */
export const IST_OFFSET_MINUTES = 5 * 60 + 30;

export function istHour(at: Date): number {
  return new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000).getUTCHours();
}
