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
 * stays off.** `AUTHORISATION` below is `null` and the guard refuses everything
 * while it is — including with the kill switch turned on. An unbounded harvest
 * under a bounded permission is the fastest way to lose the permission.
 *
 * **To bring the adapter into service**, whoever holds the grant letter:
 *   1. fills in every field below from the letter itself, not from memory;
 *   2. records the letter in `docs/ECOURTS_AUTHORISATION.md` with its reference;
 *   3. turns the `ecourts_harvest` kill switch on, with a reason.
 * All three, in that order. Any one of them alone leaves the door shut.
 *
 * **Every field is required.** There is no partial transcription and no field
 * defaults to "unlimited": a condition the letter does not state is transcribed
 * at the conservative value, never left out. An absent limit must never read as
 * permission — the same rule that keeps a null `ocr_confidence` from reading as
 * a confidence of zero.
 */

export type EcourtsAuthorisation = {
  /** The letter's own reference. Written into every ledger row it governs. */
  reference: string;
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
  /** The attribution string the grant requires us to carry, verbatim. */
  attribution: string;
  /** Courts the grant covers. A court not named here is not covered. */
  permittedCourts: readonly string[];
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
   * **Scope, and it is narrow:** this authorises the bulk cause-list path in
   * `ecourts.ts` only. Tier 3 per-citation confirmation still hands the
   * advocate the door — `citations/verify.ts` holds no HTTP client and the
   * test asserting that stays. Two different acts under two different parts of
   * the grant; collapsing them turns a bounded permission into an unbounded one.
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
 * `null` until the grant's conditions are transcribed from the letter.
 *
 * Not a placeholder object with zeros — a placeholder is something a future
 * change can quietly fill in wrongly, and `null` cannot be partially right.
 */
export const AUTHORISATION: EcourtsAuthorisation | null = null;

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
