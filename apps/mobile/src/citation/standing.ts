import type { AuthorityStanding, PointInTimeAuthority } from '../api/contract';
import { formatJudgmentDate } from '../theme/judgmentDate';

/**
 * WAS THIS AUTHORITY STANDING ON THE DAY THE BENCH RELIED ON IT?
 *
 * THE ONLY PLACE THAT QUESTION IS RENDERED. Same rule as `renderState.ts`: a
 * second place that decides is a second place that can decide wrong.
 *
 * ── THIS MODULE NO LONGER DERIVES THE ANSWER ────────────────────────────────
 *
 * It did, for one day. `standingWhenRelied` was computed server-side from
 * `statusRecordedAt` — the timestamp of our own back-fill write — so every
 * authority appeared to have moved after every judgment that cited it, and
 * `already_moved` read 0 corpus-wide. While that was true the client derived
 * the answer from two court dates instead.
 *
 * LCC fixed the comparison on 7 Aug 2026 and the client check was retired the
 * same day, verified before it was deleted: across 40 judgments, 10 authorities
 * carried a moved status, and the server agreed with the two-date derivation on
 * 8. The two it did not agree on are the ones the derivation gets WRONG —
 * `overruled_here`, below — so keeping it would have meant keeping the worse
 * answer.
 *
 * Two sources that can disagree about the same fact is the risk. There is one
 * now, and it is the server.
 *
 * ── `overruled_here` IS THE STATE A DATE COMPARISON CANNOT SEE ──────────────
 *
 * Tofan Singh recites Kanhaiyalal. Navtej Singh Johar recites Suresh Kumar
 * Koushal. Their dates are necessarily equal, because the citing judgment is
 * the one that did the overruling — so any comparison of two dates files them
 * under "this bench relied on law that had already fallen", about the bench
 * that felled it, on the landmarks an advocate is most likely to open. 22 of
 * the 48 corpus-wide "already moved" datings are this case.
 *
 * ── WHAT THIS MUST NEVER BECOME ─────────────────────────────────────────────
 *
 * NO SOUNDNESS RATING. NOT NOW, NOT BEHIND A FLAG.
 *
 * The nearest competitor ships a red "Vulnerable" verdict on a court's
 * reasoning. The temptation is obvious and the arithmetic is trivial — count
 * the already-moved authorities, divide, colour it. We decline, and the decline
 * is enforced by `standing.test.ts` rather than left to good intentions,
 * because this is the one module in the codebase where the wrong feature is one
 * afternoon away.
 *
 *   1. IT CANNOT BE SOURCED. `FEATURE_PARITY.md` §4 declines outcome prediction
 *      for exactly this — no primary record supports it and no tier can verify
 *      it. A judgment's authority does not fall because one of its citations
 *      later did; benches rely on authorities for propositions that survive the
 *      overruling of the case that stated them.
 *   2. RESOLUTION IS PARTIAL. We resolve a fraction of what a bench cited. A
 *      score over that fraction, presented as a score over the judgment, is a
 *      confident number about something we did not read.
 *   3. AN ADVOCATE CANNOT ARGUE WITH A SCORE. They can argue with "this bench
 *      relied on Kanhaiyalal, which Tofan Singh had set aside three years
 *      earlier" — a submission, checkable against two reports. A 62 is not.
 *
 * Every field below is a fact with a date and a named bench behind it.
 */

export type StandingRender =
  /**
   * Nothing has ever moved this authority. RENDERS SILENT — the same discipline
   * as a verified citation: the floor is not decorated, and a row of green
   * ticks trains the eye to skip the row that matters.
   */
  | { kind: 'good_law_then' }
  /** The bench relied on law that had already been set aside. Two dated facts. */
  | {
      kind: 'already_moved';
      headline: string;
      detail: string;
      /** Whole days, from the server. Null where it could not be counted. */
      gapDays: number | null;
    }
  /**
   * THIS judgment is the one that moved it. Not a warning about anything —
   * a fact about what this bench did, which is usually why it is being read.
   */
  | { kind: 'overruled_here'; headline: string; detail: string }
  /** The law moved afterwards. Unremarkable, and still worth knowing. */
  | { kind: 'moved_since'; headline: string; detail: string }
  /** We hold a status but no dated overruling judgment. Said plainly. */
  | { kind: 'unknown'; headline: string; detail: string };

/**
 * Copy lives here so the test asserts against the shipped strings rather than a
 * paraphrase of them.
 *
 * EVERY LINE IS WHAT HAPPENED, NEVER WHAT IT MEANS. "Relied on after it was set
 * aside" is a fact about a sequence of two dates. "Weakened by reliance on
 * overruled authority" would be a conclusion about the reasoning, and is the
 * sentence this file exists to keep out of the product.
 */
export const standingCopy = {
  alreadyMoved: 'Relied on after it was set aside',
  overruledHere: 'This is the judgment that set it aside',
  movedSince: 'Set aside after this judgment relied on it',
  unknown: 'We cannot date this against the judgment',
  unknownDetail:
    'We hold a status for this authority but not the judgment that changed it, so we cannot say whether it was standing at the time.',
  panelTitle: 'Relied on',
  /**
   * The panel's footer. It states the denominator, because `resolvedAuthorities`
   * is what we could resolve and not what the bench cited — a panel that quietly
   * presents the first as the second implies we read the whole judgment.
   */
  resolvedNote: (n: number) =>
    `${n} of the authorities cited here resolve to judgments we hold. A bench cites more than we can match.`,
} as const;

/** "1,058 days", "1 day". A day count never reaches a lakh, so grouping is plain. */
function days(n: number): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? 'day' : 'days'}`;
}

/**
 * WHERE WE SAY "unknown" RATHER THAN GUESS.
 *
 * A status with no named bench and no date behind it is not evidence of when.
 * Saying "unknown" costs the advocate one line; saying the wrong one of the
 * other three costs them the submission. This is also the fallback for a
 * `standingWhenRelied` value we do not recognise — a new server state renders as
 * unknown rather than as whichever branch happens to be last.
 */
function unknown(): StandingRender {
  return { kind: 'unknown', headline: standingCopy.unknown, detail: standingCopy.unknownDetail };
}

export function standingOf(
  authority: Pick<
    PointInTimeAuthority,
    'standingWhenRelied' | 'daysAlreadyMoved' | 'overruledOn' | 'overruledByCaseTitle'
  >
): StandingRender {
  const { standingWhenRelied, daysAlreadyMoved, overruledOn, overruledByCaseTitle } = authority;

  switch (standingWhenRelied) {
    case 'good_law_then':
      return { kind: 'good_law_then' };

    /**
     * The bench that did the overruling, reciting what it overruled. No amber,
     * no caution — nothing has gone wrong here and the sentence says only what
     * happened.
     */
    case 'overruled_here':
      return {
        kind: 'overruled_here',
        headline: standingCopy.overruledHere,
        detail: 'It was good law until this judgment.',
      };

    case 'already_moved': {
      /**
       * The claim is "relied on after it was set aside", and it is only
       * sayable with the bench and the date that set it aside. Missing either,
       * this falls to `unknown` rather than making the accusation with nothing
       * behind it — this is the strongest statement in the panel and the one
       * that must never be made loosely.
       */
      if (!overruledByCaseTitle || !overruledOn) return unknown();

      const when = formatJudgmentDate(overruledOn);
      /**
       * ONE SENTENCE, NOT TWO. "…on 29 October 2020. 1,058 days before this
       * judgment." leaves a fragment after a full stop, and the gap — the
       * number carrying the whole point — lands in the weakest position on the
       * line. Joined with a comma it reads the way an advocate writes a note.
       */
      const gap = daysAlreadyMoved === null ? '' : `, ${days(daysAlreadyMoved)} before this judgment`;

      return {
        kind: 'already_moved',
        headline: standingCopy.alreadyMoved,
        detail: `${overruledByCaseTitle} set this aside on ${when}${gap}.`,
        gapDays: daysAlreadyMoved,
      };
    }

    case 'moved_since': {
      if (!overruledByCaseTitle || !overruledOn) return unknown();
      return {
        kind: 'moved_since',
        headline: standingCopy.movedSince,
        detail: `${overruledByCaseTitle} set it aside on ${formatJudgmentDate(overruledOn)}.`,
      };
    }

    /**
     * `unknown` IS A REAL STATE AND RENDERS AS ONE. It is never collapsed into
     * `good_law_then` — "we could not answer this" and "it was good law" are
     * different answers, and only one of them is a reason to keep reading.
     */
    default:
      return unknown();
  }
}

/**
 * The panel's counts, derived from the same renders as the rows, so the tally
 * can never contradict what is under it.
 *
 * The server sends its own `counts` block. It is not read here: it counts
 * `standingWhenRelied` values, while the rows render what the client could
 * actually SAY — an `already_moved` with no named bench renders as unknown, and
 * a header that counted it as already-moved would head four honest rows with a
 * number none of them support.
 */
export function standingCounts(renders: StandingRender[]): Record<AuthorityStanding, number> {
  const counts: Record<AuthorityStanding, number> = {
    good_law_then: 0,
    already_moved: 0,
    overruled_here: 0,
    moved_since: 0,
    unknown: 0,
  };
  for (const r of renders) counts[r.kind] += 1;
  return counts;
}
