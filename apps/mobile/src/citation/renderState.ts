import type { OverruledStatus, SearchResult, VerificationState } from '../api/contract';

/**
 * LAWMIND — what a citation renders. THE ONLY PLACE THIS IS DECIDED.
 *
 * PONYTAIL-EXEMPT. The citation pipeline is never simplified, never inlined
 * into a screen, and never duplicated "just for this one card". A second place
 * that decides what a citation looks like is a second place that can decide
 * wrong, and the failure mode is an advocate filing a judgment that was set
 * aside in 2018.
 *
 * DERIVED AT RENDER TIME, NEVER STORED. `docs/CITATION_HARNESS.md` §Rendering.
 * The inputs are the three independent fields off the database row, handed to
 * the client verbatim by the API:
 *
 *   verification_state  — does this authority exist?      verified|unverified|failed
 *   verified_by_source  — who confirmed it?               corpus|public_x2|ecourts|ecourts_bulk|none
 *   overruled_status    — is it still good law?           none|set_aside|partly_set_aside|doubted
 *
 * A JUDGMENT CAN BE `verified` AND `set_aside` AT ONCE. They answer different
 * questions from different sources, which is why they are two fields and why
 * this returns two independent marks rather than one state.
 */

/** What the card's own chrome says about whether the authority EXISTS. */
export type ExistenceMark =
  /** Verified. Renders NOTHING — no badge, chip, tick, ring or colour. */
  | { kind: 'silent' }
  /**
   * `unverified` or `failed`. A dashed ink card that owns its own space, with
   * the reason and the eCourts route inside it. Never red, never an alert
   * triangle, never the word "failed".
   */
  | { kind: 'unconfirmed'; headline: string; reason: string; ecourtsAction: string };

/**
 * What the surface says about whether the law has MOVED. Independent of the above.
 *
 * THREE STATES, NOT ONE. Binary is a correctness bug in Indian practice: a
 * partly set aside authority is still good on everything the appeal did not
 * touch, and a doubted one still binds until the reference is decided.
 *
 * `renders/19-overruled-three-states.png` is the geometry authority.
 */
export type MovedMark =
  | { kind: 'none' }
  | {
      kind: 'moved';
      status: Exclude<OverruledStatus, 'none'>;
      /** Detail-surface headline. The band, where there is one, carries this. */
      headline: string;
      /**
       * List-surface chip. ALL THREE STATES GET ONE — including `doubted`, whose
       * chip is neutral. "The state is legible from the list without opening
       * anything." A list that shows nothing for `doubted` makes the advocate
       * open the judgment to find out, which is the opposite of the point.
       */
      chipLabel: string;
      /** `set_aside` is the one case where Lawmind refuses to let an authority be used. */
      blocksAddToMatter: boolean;
      /** `doubted` gets no band at all — one muted line. Shouting equally for all three trains advocates to ignore it. */
      band: 'danger' | 'caution' | 'none';
      /** `set_aside` only: the title is struck through wherever it appears. */
      strikeTitle: boolean;
      /** `set_aside` only: "cite this instead" is mandatory, not a nicety. */
      requiresReplacement: boolean;
      /**
       * `partly_set_aside` only, and IT IS STATED FIRST.
       *
       * What survives is what the advocate is about to rely on. Leading with
       * what fell buries the useful half under the alarming one.
       */
      whatStillStands?: string;
      /**
       * Set only when the status being rendered was read earlier and could not
       * be re-read now. `docs/CITATION_HARNESS.md`: "Offline surfaces render the
       * status they last read WITH ITS AS-OF DATE SHOWN; they never present a
       * stale status as current."
       */
      asOf?: string;
    };

export type CitationRender = { existence: ExistenceMark; moved: MovedMark };

/**
 * COPY IS LICENCE PROTECTION, NOT AN AUDIT.
 *
 * The Supreme Court now treats an unverified citation as a matter of
 * professional conduct and High Courts have made cost orders. The app is not
 * checking on a professional; it is standing between them and a cost order.
 *
 * Retired → ships:
 *   "We verified this citation"  → "Safe to file"
 *   "Verification failed"        → "We could not confirm this exists"
 *   "Not confirmed"              → "Do not file this without checking it"
 *   "3 of 4 citations verified"  → "One citation could put you at risk"
 */
export const copy = {
  unconfirmedHeadline: 'Do not file this without checking it',
  ecourtsAction: 'Confirm it on eCourts — about a minute',
  safeToFile: 'Safe to file',
} as const;

/**
 * `failed` RENDERS EXACTLY AS `unverified`.
 *
 * The advocate cannot act on the difference, and a provider outage must never
 * read as a gap in the corpus. The distinction is real in the data, is
 * preserved there, and is separated in the metrics so an outage does not
 * masquerade as a corpus gap. It is not a distinction the UI can make useful.
 */
function existenceMark(
  verificationState: VerificationState,
  reason: string | undefined
): ExistenceMark {
  if (verificationState === 'verified') return { kind: 'silent' };
  return {
    kind: 'unconfirmed',
    headline: copy.unconfirmedHeadline,
    reason: reason ?? 'We could not confirm this judgment exists.',
    ecourtsAction: copy.ecourtsAction,
  };
}

/** "paras 19–20", "para 19", or null when the server did not name any. */
function affectedParagraphs(paras: number[] | null | undefined): string | null {
  if (!paras?.length) return null;
  if (paras.length === 1) return `para ${paras[0]}`;
  return `paras ${paras[0]}–${paras[paras.length - 1]}`;
}

function movedMark(
  status: OverruledStatus,
  /** `null` is what the server actually sends for "no note", not `undefined`. */
  note: string | null | undefined,
  paras: number[] | null | undefined,
  asOf: string | undefined
): MovedMark {
  if (status === 'none') return { kind: 'none' };

  const affected = affectedParagraphs(paras);

  switch (status) {
    /**
     * DANGER RED, NOT CAUTION AMBER. The band replaces the header, the title is
     * struck through, and the primary action is disabled — the only state where
     * Lawmind refuses to let an authority be used.
     */
    case 'set_aside':
      return {
        kind: 'moved',
        status,
        headline: 'This judgment is no longer good law',
        chipLabel: 'Overruled',
        blocksAddToMatter: true,
        band: 'danger',
        strikeTitle: true,
        requiresReplacement: true,
        asOf,
      };

    case 'partly_set_aside':
      return {
        kind: 'moved',
        status,
        headline: affected ? `Part of it no longer holds — ${affected} set aside` : 'Part of it no longer holds',
        chipLabel: affected ? `${affected[0]!.toUpperCase()}${affected.slice(1)} set aside` : 'Partly set aside',
        blocksAddToMatter: false,
        band: 'caution',
        strikeTitle: false,
        requiresReplacement: false,
        whatStillStands: note ?? undefined,
        asOf,
      };

    /** No band at all. Still binding, so shouting would be wrong. */
    case 'doubted':
      return {
        kind: 'moved',
        status,
        headline: note ?? 'Doubted in a later judgment. Still binding.',
        chipLabel: 'Doubted · referred',
        blocksAddToMatter: false,
        band: 'none',
        strikeTitle: false,
        requiresReplacement: false,
        asOf,
      };
  }
}

/**
 * The one entry point. Every surface that draws a citation calls this and
 * renders what it returns — search results, judgment detail, briefing
 * authorities, draft footer.
 *
 * A RESULT MISSING ANY OF THE THREE FIELDS IS A BUG, AND THE CLIENT TREATS IT
 * AS UNCONFIRMED. Absence never upgrades to confirmed. `docs/API_CONTRACTS.md`
 * §Search: "A citation missing them is a bug: the client renders 'not
 * confirmed' and reports it."
 */
export function citationRender(
  result: Partial<SearchResult> & {
    /**
     * Pass ONLY when this status could not be re-read now — an offline surface
     * rendering what it last saw. Absent means the status is live, which is the
     * normal case and the one the never-cached rule requires.
     */
    statusAsOf?: string;
  }
): CitationRender {
  /**
   * THE TWO MARKS ARE DECIDED INDEPENDENTLY, because they are two questions
   * from two sources — which is the reason there are three fields and not one
   * enum, and the reason this function returns two marks and not one state.
   *
   * Until 11 Aug 2026 a single gate required BOTH fields and bailed to
   * `moved: 'none'` if either was missing. That coupling had a live victim:
   * `GET /briefings/:id` sends `overruledStatus` on every authority — read
   * live, this request, never from the cached blob — and sends no
   * `verificationState` at all. So a briefing authority that had been SET
   * ASIDE drew no LAW MOVED mark, because a DIFFERENT field was absent.
   *
   * The briefing is read standing outside the courtroom, which `route.ts`
   * itself calls "the worst possible moment to be shown law that moved". The
   * stale-overruled threshold is zero.
   *
   * BOTH DEFAULTS STILL FAIL SAFE, and in opposite directions:
   *   · no `verificationState` → UNCONFIRMED. Absence never upgrades to
   *     confirmed (`API_CONTRACTS.md` §Search).
   *   · no `overruledStatus`   → no moved mark, because we have not been told
   *     the law moved and inventing one is its own false claim.
   */
  return {
    existence:
      result.verificationState === undefined
        ? existenceMark('unverified', 'This result arrived without its verification fields.')
        : existenceMark(result.verificationState, result.unconfirmedReason),
    moved:
      result.overruledStatus === undefined
        ? { kind: 'none' }
        : movedMark(
            result.overruledStatus,
            result.overruledNote,
            result.overruledParas,
            result.statusAsOf
          ),
  };
}

/**
 * The header count. IT COUNTS WHAT NEEDS ATTENTION, NOT WHAT PASSED.
 *
 * "5 judgments · 2 need your attention", never "3 verified". Pre-announcing the
 * tally of what passed leaves the list nothing to tell you, and it decorates
 * the floor. `renders/64-verified-silent@2x.png`.
 */
export function attentionCount(results: SearchResult[]): number {
  return results.filter((r) => {
    const { existence, moved } = citationRender(r);
    return existence.kind === 'unconfirmed' || moved.kind === 'moved';
  }).length;
}
