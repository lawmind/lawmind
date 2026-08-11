import type { CitationCheck, CitationTier, CitationTierStatus } from '../api/contract';

/**
 * WHERE WE LOOKED — how one tier of the harness renders.
 *
 * THE ONE PLACE THIS IS DECIDED, shared by the verification sheet and the
 * unverified-citation screen. Two surfaces answering "did this source confirm
 * it?" differently is two chances to say the wrong one.
 *
 * ── `miss` AND `not_implemented` ARE DIFFERENT FACTS ────────────────────────
 *
 * `miss` says we queried an independent source and it had nothing.
 * `not_implemented` says the tier has not run at all, and ships in S2.
 *
 * Collapsing them tells an advocate their citation FAILED an independent check
 * that was never attempted. They would go chasing a problem that does not
 * exist — and the harness would agree with itself, reporting a confirmation
 * rate computed over checks that never happened.
 *
 * In S1 exactly one of three tiers runs, so this is the ordinary case rather
 * than an edge, and the copy for the two is deliberately not parallel: a miss
 * is about the citation, a not-implemented is about us.
 */

export type TierMark = {
  /** "Our reported corpus", "Two public sources", "eCourts services". */
  label: string;
  /** What happened, in plain words — never an accusation, never our failure. */
  detail: string;
  /**
   * `found` draws the only affirmative mark on the screen. `pending` covers
   * both absences that are OURS — nothing has been established either way.
   * `absent` is the one case where an independent source was asked and had
   * nothing.
   */
  tone: 'found' | 'absent' | 'pending';
  /** Null where the tier never ran. A check with no time did not happen. */
  at: string | null;
  /** True for `not_implemented` — the row is about our coverage, not this citation. */
  isCoverageGap: boolean;
};

const SOURCE_LABEL: Record<string, string> = {
  corpus: 'Our reported corpus',
  public_x2: 'Two public sources',
  ecourts: 'eCourts services',
  /**
   * A REGISTRY LOOKUP, NOT A HUMAN'S BADGE. `ecourts` alone means a named
   * advocate solved the captcha and personally vouched — Tier 3, "You
   * confirmed this" in `UnverifiedCitationScreen`. `ecourts_bulk` is the
   * registry answering a machine's query during bulk CNR resolution, and
   * must never borrow that wording or that credit.
   */
  ecourts_bulk: 'eCourts record',
  none: 'No source confirmed it',
};

/**
 * `verified_by_source` in the one sentence where it surfaces to an advocate.
 * Used by the sheet's "Confirmed by:" line — a different question from the tier
 * rows below it, which is why it is labelled rather than left bare.
 *
 * AN UNRECOGNISED SOURCE FALLS BACK TO ITS RAW NAME, NEVER TO A BLANK LABEL
 * OR A CRASH. Whether the citation reads as verified at all is decided
 * upstream in `citation/renderState.ts`, which never inspects this field —
 * a source this function has never heard of still renders silent-verified,
 * exactly like every other source.
 */
export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

const TONE: Record<CitationTierStatus, TierMark['tone']> = {
  confirmed: 'found',
  miss: 'absent',
  not_attempted: 'pending',
  not_implemented: 'pending',
};

export function tierMark(tier: CitationTier): TierMark {
  return {
    label: sourceLabel(tier.source),
    /**
     * The server's own words are used verbatim. It knows which tier ran, when,
     * and why it did not — and a client that paraphrases that into a house
     * sentence would be asserting a reason it does not have.
     */
    detail: tier.detail,
    tone: TONE[tier.status] ?? 'pending',
    at: tier.at,
    isCoverageGap: tier.status === 'not_implemented',
  };
}

/**
 * POSTGRES TIMESTAMPS ARE NOT ISO-8601, AND HERMES IS STRICT ABOUT IT.
 *
 * `citation_checks.at` arrives as `2026-08-06 20:34:06.383686+00` — a space
 * instead of `T`, microsecond precision, and a two-digit offset. V8 parses it
 * anyway, so `new Date(at)` works in Node and in every test. Hermes, which is
 * what actually runs on the phone, returns Invalid Date — and the sheet
 * rendered the literal string "Invalid Date" beside "Safe to file", on the one
 * surface whose entire job is to be trusted. Caught on a Galaxy S24, not in the
 * suite, because the suite runs on Node.
 *
 * Returns null rather than a guess when the shape is unrecognised. A
 * verification surface that states a check time it could not read is asserting
 * diligence it cannot evidence — the same failure as a timestamp beside a tier
 * that never ran, arriving through a different door.
 */
export function isoFromServerTimestamp(at: string | null): string | null {
  if (!at) return null;

  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(
    at.trim()
  );
  if (!m) return null;

  const [, date, time, fraction, offset] = m;
  // Milliseconds only: six fractional digits are valid ISO but not universally
  // parsed, and nothing here is displayed below the day.
  const ms = fraction ? `.${fraction.slice(1).padEnd(3, '0').slice(0, 3)}` : '';

  let zone = 'Z';
  if (offset && offset !== 'Z') {
    zone = offset.length === 3 ? `${offset}:00` : offset.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  }

  return `${date}T${time}${ms}${zone}`;
}

/**
 * "Checked 6 Aug" — or nothing at all where the time cannot be read.
 *
 * Never the string "Invalid Date", and never a fabricated date.
 */
export function tierDateLabel(at: string | null): string | null {
  const iso = isoFromServerTimestamp(at);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * "Checked against 1 of 3 sources" — STATED, NEVER LEFT TO BE COUNTED.
 *
 * Without this line "verified" reads as "verified by everything we have", which
 * is a promise we do not keep until S2. The server sends the note in words; we
 * render its words and add only the count, which is the part an eye can take in
 * at a glance.
 */
export function coverageLine(coverage: CitationCheck['coverage']): string {
  return `Checked against ${coverage.tiersImplemented} of ${coverage.tiersDefined} sources.`;
}

/**
 * TRUE WHERE NOTHING INDEPENDENT HAS BEEN ASKED YET.
 *
 * An `unverified` citation in S1 has usually not failed anything — the tiers
 * that would confirm it independently have not shipped. A screen that says "we
 * could not confirm this" without saying that is technically true and
 * practically misleading.
 */
export function nothingIndependentRan(check: CitationCheck): boolean {
  return check.tiers
    .filter((t) => t.tier > 1)
    .every((t) => t.status === 'not_implemented' || t.status === 'not_attempted');
}
