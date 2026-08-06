import type { AuthorityStanding, PointInTimeAuthority } from '../api/contract';
import { formatJudgmentDate } from '../theme/judgmentDate';

/**
 * WAS THIS AUTHORITY STANDING ON THE DAY THE BENCH RELIED ON IT?
 *
 * THE ONLY PLACE THAT QUESTION IS ANSWERED. Same rule as `renderState.ts`: a
 * second place that decides is a second place that can decide wrong.
 *
 * ── WHY THIS IS DERIVED HERE AND NOT READ OFF `standingWhenRelied` ───────────
 *
 * The server sends a `standingWhenRelied` and it is currently wrong in the one
 * direction that matters. Measured on production, 6 August 2026:
 *
 *   Balwinder Singh (Binda) v. NCB      delivered 2023-09-22
 *     relied on Kanhaiyalal v. UOI      set aside by Tofan Singh, 2020-10-29
 *     server says            moved_since
 *     the two dates say      already_moved, by 1,058 days
 *
 * The cause is visible in the payload: `statusChangedAt` reads
 * `2026-08-06 15:32` — the back-fill run, not the date the law moved. Comparing
 * a judgment's date against the timestamp of our own database write classifies
 * every authority as having moved afterwards, so `alreadyMoved` is 0 corpus-wide
 * and always will be until that comparison changes. Flagged for LCC.
 *
 * The two readings are not shades of the same thing. `moved_since` says the law
 * changed under a bench that could not have known — which is unremarkable, and
 * true of a great deal of good law. `already_moved` says the bench relied on a
 * judgment that had been dead for three years. Rendering the first where the
 * second is true tells an advocate the opposite of the fact.
 *
 * So this module answers from TWO JUDGMENT DATES, both database rows:
 * `deliveredOn` from the relying judgment, and `judgmentDate` from the judgment
 * that moved the law. Where the second cannot be resolved the answer is
 * `unknown` — stated as unknown, never filled in from the field we have
 * measured to be wrong, and never guessed from the row we happen to hold.
 *
 * ── WHAT THIS MUST NEVER BECOME ─────────────────────────────────────────────
 *
 * NO SOUNDNESS RATING. NOT NOW, NOT BEHIND A FLAG.
 *
 * The nearest competitor ships a red "Vulnerable" verdict on a court's
 * reasoning. The temptation here is obvious and the arithmetic is trivial —
 * count the already-moved authorities, divide, colour it. We decline, and the
 * decline is enforced by `standing.test.ts` rather than left to good intentions,
 * because this is the one module in the codebase where the wrong feature is one
 * afternoon away.
 *
 * The reasons, in order:
 *
 *   1. IT CANNOT BE SOURCED. `FEATURE_PARITY.md` §4 declines outcome prediction
 *      for exactly this — no primary record supports it and no tier can verify
 *      it. A judgment's authority does not fall because one of its citations
 *      later did; benches rely on authorities for propositions that survive the
 *      overruling of the case that stated them.
 *   2. RESOLUTION IS PARTIAL. We resolve a fraction of the authorities a bench
 *      cited. A score computed over that fraction, presented as a score over the
 *      judgment, is a confident number about something we did not read.
 *   3. AN ADVOCATE CANNOT ARGUE WITH A SCORE. They can argue with "this bench
 *      relied on Kanhaiyalal, which Tofan Singh had set aside three years
 *      earlier" — that is a submission, checkable against two reports. A 62 is
 *      not.
 *
 * Every field below is a fact with a date and a judgment id behind it.
 */

/** The judgment that moved the law, RESOLVED — never an id, never described. */
export type OverrulingJudgment = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string;
  /** `YYYY-MM-DD`. The date the law actually moved. */
  judgmentDate: string;
};

export type StandingRender =
  /**
   * Nothing was ever recorded against this authority. RENDERS SILENT — the same
   * discipline as a verified citation: the floor is not decorated, and a row of
   * green ticks trains the eye to skip the row that matters.
   */
  | { kind: 'good_law_then' }
  /**
   * The bench relied on law that had already been set aside. The strongest
   * thing this module says, and it says it as two dated facts.
   */
  | {
      kind: 'already_moved';
      headline: string;
      /** "Tofan Singh set this aside on 29 October 2020" — a named judgment, not an id. */
      detail: string;
      /** Whole days between the overruling and this judgment. Never negative. */
      gapDays: number;
      /** "1,058 days before this judgment". */
      gap: string;
      overruling: OverrulingJudgment;
    }
  /** The law moved afterwards. Unremarkable, and still worth knowing. */
  | {
      kind: 'moved_since';
      headline: string;
      detail: string;
      overruling: OverrulingJudgment;
    }
  /** We hold a status but cannot date it against this judgment. Said plainly. */
  | { kind: 'unknown'; headline: string; detail: string };

/**
 * Copy lives here so the test can assert against the shipped strings rather
 * than a paraphrase of them.
 *
 * EVERY LINE IS WHAT HAPPENED, NEVER WHAT IT MEANS. "Relied on after it was set
 * aside" is a fact about a sequence of two dates. "Weakened by reliance on
 * overruled authority" would be a conclusion about the reasoning, and is the
 * sentence this file exists to keep out of the product.
 */
export const standingCopy = {
  alreadyMoved: 'Relied on after it was set aside',
  movedSince: 'Set aside after this judgment relied on it',
  unknown: 'We cannot date this against the judgment',
  unknownDetail:
    'We hold a status for this authority but not the judgment that changed it, so we cannot say whether it was standing at the time.',
  panelTitle: 'Relied on',
  /**
   * The panel's own footer. It states the denominator, because
   * `resolvedAuthorities` is what we could resolve and not what the bench cited
   * — and a panel that quietly presents the first as the second implies we read
   * the whole judgment.
   */
  resolvedNote: (n: number) =>
    `${n} of the authorities cited here resolve to judgments we hold. A bench cites more than we can match.`,
} as const;

/**
 * Whole days between two `YYYY-MM-DD` dates.
 *
 * `Date.UTC` rather than `new Date(string)`: both operands land on UTC midnight
 * by construction, so the difference is exact and carries no timezone. The rule
 * in `judgmentDate.ts` is about DISPLAY — a date-only string formatted through
 * local time shifts a judgment by a day west of Greenwich. Arithmetic in UTC
 * has no such failure, and there is no other way to count a gap.
 *
 * Returns null on anything that is not a plain date, rather than a wrong number
 * from a partially-parsed string.
 */
export function daysBetween(from: string, to: string): number | null {
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return null;

  return Math.round((b - a) / 86_400_000);
}

/** "1,058 days", "1 day". Indian digit grouping is left to `toLocaleString` nowhere — a day count never reaches lakh. */
function days(n: number): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? 'day' : 'days'}`;
}

/**
 * The one entry point.
 *
 * `overruling` is the judgment that moved the law, already fetched and resolved
 * by the caller. It is a parameter rather than a lookup so this module stays
 * pure and the test can state both dates directly — the whole point of the
 * module is that the answer follows from two dates and nothing else.
 */
export function standingOf({
  authority,
  deliveredOn,
  overruling,
}: {
  authority: Pick<PointInTimeAuthority, 'overruledStatus'>;
  /** The relying judgment's date, `YYYY-MM-DD`. */
  deliveredOn: string;
  overruling?: OverrulingJudgment | null;
}): StandingRender {
  /**
   * No status recorded means nothing has ever moved this authority, so it was
   * standing then and stands now. This is read off `overruledStatus` — the live
   * field every other surface reads — rather than off `standingWhenRelied`, so
   * the panel cannot disagree with the badge beside it on the same screen.
   */
  if (authority.overruledStatus === 'none') return { kind: 'good_law_then' };

  /**
   * A status with no dated judgment behind it is not evidence of when. Saying
   * "unknown" costs the advocate one line; saying the wrong one of the other
   * two costs them the submission.
   */
  if (!overruling) {
    return { kind: 'unknown', headline: standingCopy.unknown, detail: standingCopy.unknownDetail };
  }

  const gapDays = daysBetween(overruling.judgmentDate, deliveredOn);
  if (gapDays === null) {
    return { kind: 'unknown', headline: standingCopy.unknown, detail: standingCopy.unknownDetail };
  }

  const when = formatJudgmentDate(overruling.judgmentDate);

  /**
   * SAME DAY COUNTS AS MOVED SINCE, not already moved.
   *
   * Two judgments delivered on one date have no order the corpus can see, and
   * "relied on it the day it was set aside" is the more serious reading of the
   * two. Where the sequence is genuinely unknown we take the one that does not
   * accuse the bench.
   */
  if (gapDays <= 0) {
    return {
      kind: 'moved_since',
      headline: standingCopy.movedSince,
      detail: `${overruling.caseTitle} set it aside on ${when}.`,
      overruling,
    };
  }

  /**
   * ONE SENTENCE, NOT TWO. "…on 29 October 2020. 1,058 days before this
   * judgment." leaves a fragment after a full stop, and the gap — the number
   * that carries the whole point — lands in the weakest position on the line.
   * Joined with a comma it reads the way an advocate would write it in a note.
   */
  const gap = `${days(gapDays)} before this judgment`;

  return {
    kind: 'already_moved',
    headline: standingCopy.alreadyMoved,
    detail: `${overruling.caseTitle} set this aside on ${when}, ${gap}.`,
    gapDays,
    gap,
    overruling,
  };
}

/**
 * The panel's counts, derived the same way as the rows so the tally can never
 * contradict what is under it.
 *
 * The server sends its own `counts` block. It is not used, for the reason at
 * the top of this file: it is computed from `standingWhenRelied`, so a panel
 * reading it would head four correct rows with a wrong summary.
 */
export function standingCounts(
  renders: StandingRender[]
): Record<AuthorityStanding, number> {
  const counts: Record<AuthorityStanding, number> = {
    good_law_then: 0,
    already_moved: 0,
    moved_since: 0,
    unknown: 0,
  };
  for (const r of renders) counts[r.kind] += 1;
  return counts;
}
