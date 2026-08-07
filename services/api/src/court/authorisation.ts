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
  /** ISO date it expires. Grants are not perpetual; the guard refuses past this. */
  expiresOn: string;
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
};

/**
 * `null` until the grant's conditions are transcribed from the letter.
 *
 * Not a placeholder object with zeros — a placeholder is something a future
 * change can quietly fill in wrongly, and `null` cannot be partially right.
 */
export const AUTHORISATION: EcourtsAuthorisation | null = null;

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
